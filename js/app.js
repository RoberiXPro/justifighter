(function(){
  'use strict';
  let site='FR',lastResult=null,selectedEl=null,savedEditorRange=null,internetOnline=false,connectionTimer=null;
  let editorHistory=[],editorHistoryIndex=-1,historyTimer=null,isRestoringHistory=false;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().replace(/\s*:\s*$/,'');
  const SITE_META={FR:{flag:'🇫🇷',label:'MODE FR'},BE:{flag:'🇧🇪',label:'MODE BE'},UK:{flag:'🇬🇧',label:'MODE UK'}};

  const THEME_KEY='wpIntegratorTheme';
  function applyTheme(theme){
    const t=theme==='dark'?'dark':'light';document.body.dataset.theme=t;
    const btn=$('themeToggle'),label=$('themeToggleText'),icon=btn&&btn.querySelector('.theme-icon');
    if(btn){btn.setAttribute('aria-pressed',String(t==='dark'));btn.title=t==='dark'?'Passer en mode clair':'Passer en mode sombre';}
    if(label)label.textContent=t==='dark'?'Mode clair':'Mode sombre';if(icon)icon.textContent=t==='dark'?'☀️':'🌙';
    try{localStorage.setItem(THEME_KEY,t);}catch(e){}
  }
  function initTheme(){let saved='';try{saved=localStorage.getItem(THEME_KEY)||'';}catch(e){}applyTheme(saved==='dark'?'dark':'light');}
  function toggleTheme(){applyTheme(document.body.dataset.theme==='dark'?'light':'dark');}

  function refreshBaseUI(){
    const label=$('quickBaseSiteLabel');if(label)label.textContent=`Base ${site}`;
    const url=$('quickBaseUrl');if(url&&!url.value){url.placeholder=site==='FR'?'https://www.justifit.fr/...':site==='BE'?'https://www.justifit.be/...':'https://www.qredible.co.uk/...';}
  }
  function selectSite(s){
    site=s;document.body.dataset.site=s;document.querySelectorAll('.site-btn').forEach(b=>b.classList.toggle('active',b.dataset.site===s));
    document.querySelectorAll('.uk-tab').forEach(x=>x.hidden=s!=='UK');
    const m=SITE_META[s];$('activeSiteBadge').textContent=`${m.flag} ${m.label}`;if($('siteSelect'))$('siteSelect').value=s;if($('siteSafetyLabel'))$('siteSafetyLabel').textContent='Maillage : '+({FR:'France',BE:'Belgique',UK:'Royaume-Uni'}[s]);
    refreshBaseUI();
  }
  let editorMode='visual';
  // Map visual text offsets to source-code offsets without changing the document.
  // HTML tags occupy no visual text; entities occupy one decoded character.
  function codeTextMap(html){
    const chars=[],positions=[];const token=/<[^>]*>|&(?:#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);|[^<&]+|[<&]/gi;
    let match;const decoder=document.createElement('textarea');
    while((match=token.exec(html))){
      const raw=match[0];if(raw[0]==='< '||/^<[^>]*>$/.test(raw))continue;
      let decoded=raw;
      if(raw[0]==='&'&&raw.endsWith(';')){decoder.innerHTML=raw;decoded=decoder.value;}
      for(let i=0;i<decoded.length;i++){
        chars.push(decoded[i]);positions.push(raw[0]==='&'?match.index:match.index+i);
      }
    }
    return {text:chars.join(''),positions};
  }
  function locateExactVisualRange(range){
    const editor=$('visualEditor'),code=$('inlineHtmlCode');
    if(!range||range.collapsed||!editor.contains(range.startContainer)||!editor.contains(range.endContainer))return false;
    const before=document.createRange();before.selectNodeContents(editor);before.setEnd(range.startContainer,range.startOffset);
    const start=before.toString().length,selected=range.toString();if(!selected)return false;
    const map=codeTextMap(code.value);
    let offset=start;
    if(map.text.slice(offset,offset+selected.length)!==selected){
      // No speculative match when repeated phrases make the source ambiguous.
      const first=map.text.indexOf(selected);
      if(first<0||map.text.indexOf(selected,first+1)!==-1)return false;
      offset=first;
    }
    const a=map.positions[offset],b=map.positions[offset+selected.length-1];
    if(a===undefined||b===undefined)return false;
    const tail=code.value.slice(b).match(/^&(?:#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);/i);
    code.setSelectionRange(a,b+(tail?tail[0].length:1));
    code.scrollTop=Math.max(0,code.scrollHeight*(a/Math.max(1,code.value.length))-code.clientHeight/3);
    return true;
  }
  function setEditorMode(mode){
    editorMode=mode==='code'?'code':'visual';
    if(editorMode==='code') {
      if($('inlineHtmlCode').value!==$('outputHtml').value)$('inlineHtmlCode').value=$('outputHtml').value;
      const sel=window.getSelection();
      const range=sel&&sel.rangeCount?sel.getRangeAt(0):savedEditorRange;
      if(!locateExactVisualRange(range)){
        const n=range&&range.commonAncestorContainer;const el=n&&(n.nodeType===1?n:n.parentElement);
        if(el&&$('visualEditor').contains(el))focusMatchingHtml(pickEditorElement(el));
      }
    }
    $('visualStage').hidden=editorMode!=='visual';$('codeStage').hidden=editorMode!=='code';
    // Keep mode navigation and formatting controls visible in BOTH modes.
    $('visualToolbar').hidden=false;
    for(const [id,active] of [['modeVisualBtn',editorMode==='visual'],['modeCodeBtn',editorMode==='code']]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));}
    if(editorMode==='code'){const c=$('inlineHtmlCode');c.focus();if(c.selectionEnd>c.selectionStart)c.scrollTop=Math.max(0,c.scrollHeight*c.selectionStart/Math.max(c.value.length,1)-c.clientHeight/3);}
  }
  function formattedCode(html){
    // Never collapse whitespace between inline elements: it may be meaningful legal text.
    return String(html||'').replace(/&nbsp;|\u00a0/gi,' ')
      .replace(/(<\/(?:h[1-6]|p|div|blockquote|ul|ol|li|table|tr|section)>)[ \t]*(?=<)/gi,'$1\n')
      .replace(/(?<!^)(<(?:h[1-6]|p|div|blockquote|ul|ol|li|table|tr|section)\b[^>]*>)/gi,'\n$1')
      .replace(/<ul>\n\n<li>/gi,'<ul>\n<li>').replace(/<ol>\n\n<li>/gi,'<ol>\n<li>')
      .replace(/<\/li>\n\n<li>/gi,'</li>\n<li>').replace(/<\/li>\n\n<\/(ul|ol)>/gi,'</li>\n</$1>')
      .replace(/\n[ \t]*\n[ \t]*\n/g,'\n\n').trim();
  }
  function updateInlineHtml(){const el=$('inlineHtmlCode');if(el&&el.value!==$('outputHtml').value)el.value=$('outputHtml').value;}
  function syncFromInlineCode(){
    const html=$('inlineHtmlCode').value;
    $('outputHtml').value=html;if(lastResult)lastResult.html=html;
    selectedEl=null;savedEditorRange=null;
    $('visualEditor').innerHTML=html;
    renderOnlinePreview(html);scheduleHistoryCommit();
  }
  function focusMatchingHtml(el){
    const code=$('inlineHtmlCode'),editor=$('visualEditor');if(!code||!el||!editor.contains(el))return;
    // Find the exact top-level element in serialized HTML. Avoid adding any markup to the output.
    let block=el;while(block.parentElement&&block.parentElement!==editor)block=block.parentElement;
    if(block.parentElement!==editor)return;
    let offset=0;for(const child of Array.from(editor.childNodes)){if(child===block)break;offset+=child.nodeType===1?child.outerHTML:child.textContent.length;}
    const cleanBlock=block.cloneNode(true);cleanBlock.querySelectorAll('.editor-selected').forEach(e=>e.classList.remove('editor-selected'));cleanBlock.classList.remove('editor-selected');const fragment=cleanBlock.outerHTML;const whole=code.value;
    // Selection decorators are absent from the clean export and may change markup length.
    let pos=whole.indexOf(fragment,Math.max(0,offset-100));if(pos<0)pos=whole.indexOf(fragment);
    if(pos<0){const needle=(el.textContent||'').trim().slice(0,80);pos=needle?whole.indexOf(needle):-1;if(pos<0)return;code.setSelectionRange(pos,pos+needle.length);}
    else {const cleanPart=el.cloneNode(true);cleanPart.classList.remove('editor-selected');const part=el===block?fragment:cleanPart.outerHTML;let nested=fragment.indexOf(part);code.setSelectionRange(pos+Math.max(0,nested),pos+Math.max(0,nested)+part.length);}
    code.scrollTop=Math.max(0,(code.selectionStart/Math.max(1,code.value.length))*code.scrollHeight-code.clientHeight/3);
  }

  function showTab(name){document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));if(name==='online')renderOnlinePreview($('outputHtml').value);}
  function setConnectionState(online){
    internetOnline=!!online;const pill=$('connectionStatus');if(!pill)return;pill.className='connection-pill '+(internetOnline?'online':'offline');pill.textContent=internetOnline?'● En ligne':'● En mode hors ligne';pill.title=internetOnline?'Internet détecté : les suggestions de maillage peuvent être vérifiées directement dans Google.':'Pas de connexion détectée : le maillage utilise uniquement la base locale FR / BE / UK.';if(lastResult)renderLinks(lastResult);
  }
  function checkInternet(){
    clearTimeout(connectionTimer);if(!navigator.onLine){setConnectionState(false);return;}const img=new Image();let done=false;const finish=ok=>{if(done)return;done=true;clearTimeout(connectionTimer);setConnectionState(ok);};img.onload=()=>finish(true);img.onerror=()=>finish(false);connectionTimer=setTimeout(()=>finish(false),4500);img.src='https://www.google.com/favicon.ico?wp-integrator-probe='+Date.now();
  }
  function googleVerifyUrl(c){const domain=site==='FR'?'justifit.fr':site==='BE'?'justifit.be':'qredible.co.uk';const query=`site:${domain} "${String(c.anchor||'').trim()}"`;return 'https://www.google.com/search?q='+encodeURIComponent(query);}
  function getSourceHtml(){return $('inputHtml').value.trim();}
  function shortcodeAttrs(code){const out={};String(code||'').replace(/([a-zA-Z_][\w-]*)="([^"]*)"/g,(_,k,v)=>(out[k]=v,''));return out;}
  function replacePreviewShortcodes(root){
    const headings=Array.from(root.querySelectorAll('h2')).map(h=>clean(h.textContent)).filter(Boolean);const nodes=[],w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())if(/\[(?:ctabtn|article_sources|lwptoc)\b/i.test(n.nodeValue||''))nodes.push(n);
    nodes.forEach(node=>{const text=node.nodeValue||'',rx=/\[(ctabtn|article_sources|lwptoc)\b[^\]]*\]/gi;let m,last=0,found=false;const frag=document.createDocumentFragment();while((m=rx.exec(text))){found=true;if(m.index>last)frag.appendChild(document.createTextNode(text.slice(last,m.index)));const type=m[1].toLowerCase(),attrs=shortcodeAttrs(m[0]);if(type==='ctabtn'){const box=document.createElement('div');box.className='preview-cta-wrap';const btn=document.createElement('span');btn.className='preview-cta-button';btn.textContent=attrs.text||'Trouver un avocat';box.appendChild(btn);frag.appendChild(box);}else if(type==='article_sources'){const sec=document.createElement('section');sec.className='preview-sources';const h=document.createElement('h3');h.textContent='Articles Sources';sec.appendChild(h);const ol=document.createElement('ol');String(attrs.list||'').split(/\s*\|\s*/).filter(Boolean).forEach(item=>{const parts=item.split(/\s+--\s+/),li=document.createElement('li'),domain=document.createElement('span'),a=document.createElement('span');domain.textContent=(parts[0]||'source')+' - ';a.className='preview-source-link';a.textContent=parts.slice(1).join(' -- ')||parts[0]||'';li.append(domain,a);ol.appendChild(li);});sec.appendChild(ol);frag.appendChild(sec);}else{const toc=document.createElement('div');toc.className='preview-toc';const t=document.createElement('strong');t.textContent='Table des matières';toc.appendChild(t);if(headings.length){const ul=document.createElement('ul');headings.forEach(x=>{const li=document.createElement('li');li.textContent=x;ul.appendChild(li);});toc.appendChild(ul);}frag.appendChild(toc);}last=rx.lastIndex;}if(found){if(last<text.length)frag.appendChild(document.createTextNode(text.slice(last)));node.replaceWith(frag);}});
  }
  function classifyOnlineBlocks(root){
    root.querySelectorAll('blockquote').forEach(q=>{const txt=clean(q.textContent);if(/^FAQ\b/i.test(txt))q.classList.add('preview-faq');else if(/^(POINTS CLES A RETENIR|POINTS CL.S . RETENIR|KEY TAKEAWAYS)/i.test(txt.normalize('NFD').replace(/[\u0300-\u036f]/g,'')))q.classList.add('preview-keypoints');else if(/^(exemple|example|cas pratique|cas concret|cas\s*:|scenario|illustration|case study|practical example)/i.test(txt))q.classList.add('preview-example');});
  }
  function renderOnlinePreview(html){const root=$('onlinePreview');if(!root)return;root.innerHTML=html||'';replacePreviewShortcodes(root);classifyOnlineBlocks(root);}
  function renderReport(r){
    const blocks=[];
    if(r.report.errors.length)blocks.push(`<div class="report-section error" id="reportErrors"><h3>Erreurs à corriger</h3><ul>${r.report.errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`);
    if(r.report.warnings.length)blocks.push(`<div class="report-section warning" id="reportWarnings"><h3>À vérifier</h3><ul>${r.report.warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`);
    if(r.report.actions.length)blocks.push(`<div class="report-section"><h3>Transformations appliquées</h3><ul>${r.report.actions.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`);
    if(!blocks.length)blocks.push('<div class="empty-state">Aucune alerte particulière.</div>');$('reportOutput').innerHTML=blocks.join('');
    const count=r.report.errors.length+r.report.warnings.length;$('alertTabCount').textContent=String(count);
    $('resultAlertBanner').hidden=count===0;if(count)$('resultAlertText').innerHTML=`⚠ <strong>${count} alerte${count>1?'s':''}</strong> à contrôler avant de copier le HTML.`;
  }
  function renderLinkContext(c,index){
    const ctx=c.context;
    const notice=c.uiMessage?`<div class="link-inline-message ${esc(c.uiMessageType||'info')}">${esc(c.uiMessage)}</div>`:'';
    if(!ctx||!ctx.text||!ctx.tokens||!ctx.tokens.length)return `<div class="link-context-missing">Contexte indisponible : utilise le champ Ancre finale pour contrôler le texte.</div>${notice}`;
    let out='',last=0;ctx.tokens.forEach((t,ti)=>{out+=esc(ctx.text.slice(last,t.start));const selected=ti>=ctx.start&&ti<=ctx.end;const title=selected?'Clique pour retirer ce mot ou resserrer la sélection':'Clique pour étendre l’ancre jusqu’à ce mot';out+=`<button type="button" class="context-word ${selected?'selected':''}" ${c.inserted?'disabled':''} data-context-link="${index}" data-context-token="${ti}" title="${title}">${esc(t.text)}</button>`;last=t.end;});out+=esc(ctx.text.slice(last));
    return `<div class="link-context-box"><div class="link-context-label">Proposition dans la phrase</div><div class="link-context-sentence">${out}</div><div class="link-context-help"><strong>En couleur = ancre du lien.</strong> Clique sur les mots autour pour l’agrandir ou sur un mot sélectionné pour la raccourcir.</div>${notice}</div>`;
  }
  function renderLinks(r){
    const rows=r.links.candidates||[];$('linkTabCount').textContent=String(rows.length);
    if(!rows.length){$('linksOutput').innerHTML='<div class="empty-state">Aucune opportunité de maillage suffisamment cohérente détectée.</div>';return;}
    $('linksOutput').innerHTML=`<div class="report-section linkwhisper-section"><h3>Maillage interne</h3><p class="hint link-explain"><strong>À gauche :</strong> la phrase et l’ancre. <strong>À droite :</strong> l’article et son URL. Les AUTO-SÛRS sont ajoutés automatiquement ; les autres restent à valider. ${internetOnline?'🌐 Vérification Google disponible.':'🔴 Mode hors ligne : base locale uniquement.'}</p>${rows.map((c,i)=>`<div class="link-row ${c.autoSafe?'auto-safe':''} ${c.inserted?'is-inserted':''}"><div class="link-proposal-column">${renderLinkContext(c,i)}<label class="anchor-editor-wrap"><span class="anchor-editor-label">Ancre finale</span><input class="link-anchor-input" type="text" value="${esc(c.anchor)}" data-anchor-edit-index="${i}" ${c.inserted?'disabled':''}></label></div><div class="link-destination-column"><div class="link-target-label">Article / URL proposé</div><div class="link-target-title">${esc(c.title)}</div><a class="link-target-url" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a><div class="link-target-meta"><span class="link-tag ${c.inserted?'inserted':(c.autoSafe?'safe':'')}">${c.inserted?(c.autoSafe?'ajouté automatiquement':'inséré'):(c.autoSafe?'auto-sûr':'à vérifier')}</span><span class="link-score">${c.autoSafe?'AUTO-SÛR':esc(c.confidence||'à vérifier')} · score ${esc(c.score)}</span></div><div class="link-actions"><button class="insert-link-btn ${c.inserted?'remove':''}" data-link-index="${i}" data-link-action="${c.inserted?'remove':'insert'}">${c.inserted?'Retirer':'Insérer'}</button><a class="target-open-btn" href="${esc(c.url)}" target="_blank" rel="noopener">Ouvrir l’article</a>${internetOnline?`<a class="google-verify-btn" href="${esc(googleVerifyUrl(c))}" target="_blank" rel="noopener">Vérifier Google</a>`:'<button class="google-verify-btn disabled" disabled>Google hors ligne</button>'}</div></div></div>`).join('')}</div>`;
  }
  function renderCategories(r){
    if(site!=='UK'||!r.categories){$('categoriesOutput').innerHTML='<div class="empty-state">La catégorisation officielle de l’agent concerne Qredible UK.</div>';return;}
    const c=r.categories;$('categoriesOutput').innerHTML=`<div class="category-grid"><div class="category-card"><div class="label">Domain law</div><div class="value">${esc(c.domainLaw)}</div></div><div class="category-card"><div class="label">Specialism lawyer</div><div class="value">${esc(c.specialism)}</div></div><div class="category-card"><div class="label">Lawyer Keyword</div><div class="value">${esc(c.lawyerKeyword)}</div></div><div class="category-card"><div class="label">Intent</div><div class="value">${esc(c.intent)}</div></div></div><p class="hint" style="margin-top:10px">Catégorisation locale conservatrice : à valider si le sujet est transversal.</p>`;
  }
  function visualHtmlClean(){const c=$('visualEditor').cloneNode(true);c.querySelectorAll('.editor-selected').forEach(el=>el.classList.remove('editor-selected'));return c.innerHTML;}
  function syncFromVisual(){const html=visualHtmlClean();$('outputHtml').value=formattedCode(html);updateInlineHtml();if(lastResult)lastResult.html=$('outputHtml').value;renderOnlinePreview(html);}
  function updateHistoryButtons(){
    const u=$('undoEditorBtn'),r=$('redoEditorBtn');if(u)u.disabled=editorHistoryIndex<=0;if(r)r.disabled=editorHistoryIndex<0||editorHistoryIndex>=editorHistory.length-1;
  }
  function resetEditorHistory(){editorHistory=[visualHtmlClean()];editorHistoryIndex=0;updateHistoryButtons();}
  function commitEditorHistory(){
    if(isRestoringHistory)return;const html=visualHtmlClean();if(editorHistory[editorHistoryIndex]===html){updateHistoryButtons();return;}
    editorHistory=editorHistory.slice(0,editorHistoryIndex+1);editorHistory.push(html);if(editorHistory.length>80)editorHistory.shift();editorHistoryIndex=editorHistory.length-1;updateHistoryButtons();
  }
  function restoreEditorHistory(index){
    if(index<0||index>=editorHistory.length)return;isRestoringHistory=true;setSelected(null);$('visualEditor').innerHTML=editorHistory[index];editorHistoryIndex=index;syncFromVisual();isRestoringHistory=false;updateHistoryButtons();
  }
  function undoEditor(){restoreEditorHistory(editorHistoryIndex-1);}
  function redoEditor(){restoreEditorHistory(editorHistoryIndex+1);}
  function loadPreview(html,resetHistory=true){
    selectedEl=null;$('visualEditor').innerHTML=html||'';$('toolbarHelp').textContent="Clique sur un élément dans l’aperçu, puis choisis son format.";clearToolbarActive();renderOnlinePreview(html||'');if(resetHistory)resetEditorHistory();
  }
  function scheduleHistoryCommit(){clearTimeout(historyTimer);historyTimer=setTimeout(()=>commitEditorHistory(),350);}


  // Stage-based display: percentages provided by the formatter mark checkpoints,
  // not a real-time estimate. Avoid displaying a misleading frozen "84%".
  const ANALYSIS_STAGES=[0,4,10,20,29,38,51,62,71,78,84,94,99,100];
  function setAnalysisProgress(percent,label){
    const box=$('analysisProgress'),fill=$('analysisProgressFill'),pct=$('analysisProgressPercent'),step=$('analysisProgressStep'),bar=$('analysisProgressBar');
    const value=Math.max(0,Math.min(100,Number(percent)||0));
    const stage=Math.max(1,ANALYSIS_STAGES.filter(x=>x<=value).length-1);
    const done=value===100, working=value===84;
    box.hidden=false;
    box.classList.toggle('is-working',working);
    box.classList.toggle('is-complete',done);
    fill.style.width=(done?100:value)+'%';
    pct.textContent=done?'Terminé':working?'Traitement en cours':`Étape ${stage} / ${ANALYSIS_STAGES.length-1}`;
    step.textContent=label||'Analyse en cours';
    // The current stage is known, but its fractional completion is not.
    bar.setAttribute('aria-valuetext',done?'Analyse terminée':(label||'Analyse en cours'));
    bar.setAttribute('aria-valuenow',String(Math.round(value)));
  }
  function setProcessingState(active){
    const btn=$('processBtn');btn.disabled=active;btn.classList.toggle('processing',active);btn.textContent=active?'Analyse en cours…':'Analyser et formater';
    if(active){$('analysisProgressTitle').textContent='Analyse en cours…';setAnalysisProgress(0,'Initialisation');}
  }
  function finishAnalysisProgress(){
    $('analysisProgressTitle').textContent='Analyse terminée ✓';setAnalysisProgress(100,'Résultat prêt');
    setTimeout(()=>{if(!$('processBtn').disabled)$('analysisProgress').hidden=true;},1800);
  }

  function setInputCollapsed(collapsed){
    const body=$('inputBody'),btn=$('toggleInputBtn'),panel=document.querySelector('.input-panel');
    if(!body||!btn||!panel)return;
    body.hidden=collapsed;panel.classList.toggle('input-collapsed',collapsed);
    btn.textContent=collapsed?'Afficher le collage':'Réduire le collage';btn.setAttribute('aria-expanded',String(!collapsed));
  }
  async function run(){
    const raw=getSourceHtml();if(!raw.trim()){$('inputHtml').focus();return;}
    if($('processBtn').disabled)return;
    setProcessingState(true);$('resultsPanel').hidden=true;
    try{
      const opts={site,formatBlocks:true,externalLinks:true,autoLinks:true};
      lastResult=WPFormatter.processAsync?await WPFormatter.processAsync(raw,opts,(percent,label)=>setAnalysisProgress(percent,label)):WPFormatter.process(raw,opts);
      setAnalysisProgress(99,'Construction de l’aperçu');
      $('outputHtml').value=formattedCode(lastResult.html);lastResult.html=$('outputHtml').value;updateInlineHtml();loadPreview(lastResult.html,true);setEditorMode('visual');$('resultsPanel').hidden=false;setInputCollapsed(true);$('floatingActions').hidden=false;
      renderReport(lastResult);renderLinks(lastResult);renderCategories(lastResult);showTab('preview');
      finishAnalysisProgress();
      requestAnimationFrame(()=>{const r=$('resultsPanel').getBoundingClientRect();window.scrollTo({top:Math.max(0,window.scrollY+r.top-20),behavior:'instant'});});
    }catch(err){
      console.error(err);$('analysisProgressTitle').textContent='Erreur pendant l’analyse';setAnalysisProgress(100,'Consulte les alertes ou réessaie avec le HTML brut.');
      alert('Une erreur est survenue pendant l’analyse. Le contenu original n’a pas été modifié.');
    }finally{
      setProcessingState(false);
    }
  }
  function setLinkMessage(c,text,type='info'){if(!c)return;c.uiMessage=text||'';c.uiMessageType=type;}
  function syncPreviewsAfterLinkChange(html){
    const value=html||'';selectedEl=null;$('outputHtml').value=value;updateInlineHtml();if(lastResult)lastResult.html=value;
    $('visualEditor').innerHTML=value;$('toolbarHelp').textContent="Clique sur un élément dans l’aperçu, puis choisis son format.";clearToolbarActive();renderOnlinePreview(value);commitEditorHistory();
  }
  function updateCandidateAnchor(index,value){
    if(!lastResult)return false;const c=lastResult.links.candidates[index];if(!c||c.inserted)return false;
    const normalized=WPInternalLinks.cleanSelectedAnchor(value);
    if(!normalized){setLinkMessage(c,'L’ancre ne peut pas être vide.','error');renderLinks(lastResult);return false;}
    if(!WPInternalLinks.anchorExists($('outputHtml').value,normalized)){setLinkMessage(c,'Cette ancre n’existe pas exactement dans l’article.','error');renderLinks(lastResult);return false;}
    c.anchor=normalized;c.context=WPInternalLinks.contextFromHtml($('outputHtml').value,normalized)||c.context;setLinkMessage(c,'Ancre mise à jour.','success');renderLinks(lastResult);return true;
  }
  function updateContextToken(index,tokenIndex){
    if(!lastResult)return;const c=lastResult.links.candidates[index];if(!c||c.inserted)return;
    const previous={anchor:c.anchor,start:c.context&&c.context.start,end:c.context&&c.context.end};
    const res=WPInternalLinks.selectContextToken(c,tokenIndex);
    if(!res.ok){setLinkMessage(c,res.reason==='minimum'||res.reason==='weak'?'Garde au moins un mot suffisamment précis dans l’ancre.':'Sélection impossible.','warning');renderLinks(lastResult);return;}
    if(!WPInternalLinks.anchorExists($('outputHtml').value,res.anchor)){
      c.anchor=previous.anchor;if(c.context){c.context.start=previous.start;c.context.end=previous.end;}setLinkMessage(c,'Cette sélection n’a pas été retrouvée exactement dans l’article.','warning');renderLinks(lastResult);return;
    }
    setLinkMessage(c,'','info');renderLinks(lastResult);
  }
  function updateLink(index,action){
    if(!lastResult)return;const c=lastResult.links.candidates[index];if(!c)return;
    if(action==='insert'){
      const res=WPInternalLinks.insertIntoHtml($('outputHtml').value,c);
      if(!res.ok){setLinkMessage(c,res.reason==='duplicate-url'?'Cette URL est déjà présente dans l’article.':'L’ancre n’est plus présente exactement dans le contenu.','error');renderLinks(lastResult);return;}
      c.inserted=true;setLinkMessage(c,'Lien inséré : les deux aperçus sont déjà à jour.','success');lastResult.links.inserted=lastResult.links.inserted||[];if(!lastResult.links.inserted.includes(c))lastResult.links.inserted.push(c);syncPreviewsAfterLinkChange(res.html);
    }else{
      const res=WPInternalLinks.removeFromHtml($('outputHtml').value,c);
      if(!res.ok){setLinkMessage(c,'Le lien n’a pas été retrouvé exactement. Il a peut-être déjà été modifié.','error');renderLinks(lastResult);return;}
      c.inserted=false;setLinkMessage(c,'Lien retiré : les deux aperçus sont déjà à jour.','success');lastResult.links.inserted=(lastResult.links.inserted||[]).filter(x=>x!==c);syncPreviewsAfterLinkChange(res.html);
    }
    renderLinks(lastResult);
  }

  function clearToolbarActive(){document.querySelectorAll('#visualToolbar [data-format]').forEach(b=>b.classList.remove('active-format'));}
  function currentFormat(el){
    if(!el)return'';if(el.matches('h2,h3,h4,p,blockquote'))return el.tagName.toLowerCase();if(el.matches('strong,b'))return'strong';if(el.matches('.bloc-bonsavoir'))return'cta';if(el.matches('.why-lawyer'))return'why';return'';
  }
  function pickEditorElement(target){
    if(target===$('visualEditor'))return null;
    const heading=target.closest('h2,h3,h4');if(heading&&$('visualEditor').contains(heading))return heading;
    const special=target.closest('.bloc-bonsavoir,.why-lawyer,blockquote');if(special&&$('visualEditor').contains(special))return special;
    if(target.matches('strong,b')){const p=target.closest('p');if(p&&clean(p.textContent)===clean(target.textContent))return p;return target;}
    return target.closest('p,li,table');
  }
  function setSelected(el){
    if(selectedEl&&selectedEl.isConnected)selectedEl.classList.remove('editor-selected');selectedEl=el;clearToolbarActive();
    if(!el){$('toolbarHelp').textContent='Clique sur un élément dans l’aperçu, puis choisis son format.';return;}
    el.classList.add('editor-selected');const fmt=currentFormat(el);if(fmt){const b=document.querySelector(`#visualToolbar [data-format="${fmt}"]`);if(b)b.classList.add('active-format');}
    $('toolbarHelp').innerHTML=`Format actuel : <strong>${esc(fmt?fmt.toUpperCase():el.tagName.toLowerCase())}</strong> · ${esc(clean(el.textContent).slice(0,105))}`;
  }
  function targetBlock(el){
    if(!el)return null;const heading=el.closest&&el.closest('h2,h3,h4');if(heading&&$('visualEditor').contains(heading))return heading;
    if(el.matches('strong,b')){const p=el.parentElement;if(p&&p.matches('p')&&clean(p.textContent)===clean(el.textContent))return p;return el;}return el;
  }
  function hasUsefulContent(el){if(!el)return false;const txt=clean(el.textContent);if(txt)return true;return !!el.querySelector('img,a,ul,ol,table,br');}
  function directChildUnder(ancestor,node){let n=node;while(n&&n.parentElement&&n.parentElement!==ancestor)n=n.parentElement;return n&&n.parentElement===ancestor?n:null;}
  function promoteInlineOnly(el,tag){
    const editor=$('visualEditor'),p=el.closest&&el.closest('p');
    if(p&&editor.contains(p)){
      const pivot=directChildUnder(p,el);if(pivot){
        const before=document.createElement('p'),after=document.createElement('p');
        let child=p.firstChild,phase='before';
        while(child){const nx=child.nextSibling;if(child===pivot){phase='after';child=nx;continue;}(phase==='before'?before:after).appendChild(child);child=nx;}
        const h=document.createElement(tag);h.innerHTML=el.matches('strong,b')?el.innerHTML:pivot.innerHTML;
        if(hasUsefulContent(before))p.parentNode.insertBefore(before,p);p.parentNode.insertBefore(h,p);if(hasUsefulContent(after))p.parentNode.insertBefore(after,p);p.remove();return h;
      }
    }
    const h=document.createElement(tag);h.innerHTML=el.matches('strong,b')?el.innerHTML:el.innerHTML;el.replaceWith(h);return h;
  }
  function replaceVisualTag(el,tag){
    const target=targetBlock(el);if(!target)return null;if(target.tagName&&target.tagName.toLowerCase()===tag)return target;
    if(['h2','h3','h4'].includes(tag)&&target.matches('strong,b'))return promoteInlineOnly(target,tag);
    const n=document.createElement(tag);
    if(target.matches('p')&&target.children.length===1&&target.firstElementChild.matches('strong,b')&&clean(target.textContent)===clean(target.firstElementChild.textContent))n.innerHTML=target.firstElementChild.innerHTML;else n.innerHTML=target.innerHTML;
    target.replaceWith(n);return n;
  }
  function selectionHeading(){
    const sel=window.getSelection();if(!sel||!sel.rangeCount)return null;const node=sel.anchorNode;const el=node&&node.nodeType===1?node:node&&node.parentElement;const h=el&&el.closest?el.closest('h2,h3,h4'):null;return h&&$('visualEditor').contains(h)?h:null;
  }
  function putCaretStart(el){const range=document.createRange(),sel=window.getSelection();range.selectNodeContents(el);range.collapse(true);sel.removeAllRanges();sel.addRange(range);}
  function headingEnterToParagraph(e){
    if(e.key!=='Enter'||e.shiftKey)return false;const h=selectionHeading();if(!h)return false;e.preventDefault();
    const p=document.createElement('p');p.innerHTML='<br>';h.insertAdjacentElement('afterend',p);putCaretStart(p);setSelected(p);syncFromVisual();commitEditorHistory();return true;
  }
  function boldExampleVisualTitle(node){
    if(!node||node.nodeType!==1)return;if(node.matches('strong,b'))return;if(node.matches('p')&&node.children.length===1&&node.firstElementChild.matches('strong,b'))return;const s=document.createElement('strong');while(node.firstChild)s.appendChild(node.firstChild);node.appendChild(s);
  }
  function wrapVisualBlockquote(el){
    const target=targetBlock(el);if(!target||target.closest('blockquote'))return target;const label=clean(target.textContent).toLowerCase(),isExample=/^(exemple|example|cas|cas pratique|cas concret|scénario|scenario|illustration|voici un cas pratique|voici une illustration|for example|case study|practical example)/.test(label);if(isExample)boldExampleVisualTitle(target);
    const q=document.createElement('blockquote');target.parentNode.insertBefore(q,target);q.appendChild(target);if(isExample){const next=q.nextElementSibling;if(next&&!next.matches('h2,h3,h4')&&!next.classList.contains('why-lawyer'))q.appendChild(next);}return q;
  }
  function ctaTitleText(label){return clean(label).replace(/\s*:+\s*$/, '')+(site==='UK'?':':' :');}
  function makeVisualCta(el){
    const target=targetBlock(el);if(!target||target.closest('.bloc-bonsavoir'))return target;
    const contents=[];let next=target.nextElementSibling;
    while(next&&contents.length<12){if(next.matches('h2,h3,h4,.why-lawyer,.bloc-bonsavoir')||visualBoundary(next))break;contents.push(next);next=next.nextElementSibling;}
    if(!contents.length)return null;
    const box=document.createElement('div');box.className='bloc-bonsavoir';const t=document.createElement('div');t.className='title-bonsavoir';const strong=document.createElement('strong');strong.textContent=ctaTitleText(target.textContent);t.appendChild(strong);const d=document.createElement('div');d.className='desc-bonsavoir';contents.forEach(n=>d.appendChild(n));box.append(t,d);target.parentNode.insertBefore(box,target);target.remove();return box;
  }
  function visualBoundary(n){
    if(!n||n.nodeType!==1)return false;
    if(n.matches('h2,h3,h4,.why-lawyer'))return true;
    if(n.matches('blockquote')){
      const h=n.querySelector(':scope > h2');
      if(h&&/^FAQs?\b/i.test(clean(h.textContent)))return true;
      const strong=n.querySelector(':scope > p > strong:first-child,:scope > strong:first-child');
      if(strong&&/^(POINTS CLÉS À RETENIR|KEY TAKEAWAYS)\b/i.test(clean(strong.textContent)))return true;
    }
    const t=clean(n.textContent);
    return /^(FAQ|FAQs|POINTS CLÉS À RETENIR|KEY TAKEAWAYS|Sources?|References?|Liens|Références)\b/i.test(t);
  }
  function existingLawyerUrlInEditor(){
    for(const a of Array.from($('visualEditor').querySelectorAll('a[href]'))){const u=a.getAttribute('href')||'';if(site==='UK'&&/qredible\.co\.uk\/find\/solicitors\//i.test(u))return u;if(site!=='UK'&&/justifit\.(?:fr|be)\/(?:avocats\/q\/|trouver\/avocats\/)/i.test(u))return u;}return'';
  }
  function appendVisualWhyCta(w){
    if(!w||/\[ctabtn\b/i.test(w.textContent||''))return;
    const existing=existingLawyerUrlInEditor(),cfg=existing?{url:existing,text:WPCtaPages.buttonText(site,existing)}:WPCtaPages.resolve(site,$('visualEditor').textContent||'');
    if(cfg)w.appendChild(document.createTextNode(`\n[ctabtn url="${cfg.url}" text="${cfg.text}" target="_blank" follow="follow" color="blue"]`));
  }
  function editorMessage(message,type='info'){
    const help=$('toolbarHelp');if(!help)return;
    help.classList.remove('toolbar-success','toolbar-warning','toolbar-error');
    if(type==='success')help.classList.add('toolbar-success');else if(type==='warning')help.classList.add('toolbar-warning');else if(type==='error')help.classList.add('toolbar-error');
    help.textContent=message;
  }
  function rememberEditorSelection(){
    const editor=$('visualEditor'),sel=window.getSelection();if(!editor||!sel||!sel.rangeCount)return;
    const range=sel.getRangeAt(0);if(range.collapsed)return;
    const start=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
    const end=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement;
    if(start&&end&&editor.contains(start)&&editor.contains(end))savedEditorRange=range.cloneRange();
  }
  function restoreEditorSelection(){
    const editor=$('visualEditor'),range=savedEditorRange,sel=window.getSelection();if(!editor||!range||!sel)return false;
    const start=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
    const end=range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement;
    if(!start||!end||!editor.contains(start)||!editor.contains(end))return false;
    try{sel.removeAllRanges();sel.addRange(range.cloneRange());return true;}catch(e){return false;}
  }
  function topEditorChild(node){
    const editor=$('visualEditor');if(!editor||!node)return null;let el=node.nodeType===1?node:node.parentElement;if(!el||!editor.contains(el))return null;
    while(el.parentElement&&el.parentElement!==editor)el=el.parentElement;
    return el.parentElement===editor?el:null;
  }
  function rangeTopBlocks(){
    const editor=$('visualEditor'),range=savedEditorRange;if(!editor||!range)return[];
    const start=topEditorChild(range.startContainer),end=topEditorChild(range.endContainer);if(!start||!end)return[];
    const kids=Array.from(editor.children),a=kids.indexOf(start),b=kids.indexOf(end);if(a<0||b<0)return[];
    return kids.slice(Math.min(a,b),Math.max(a,b)+1);
  }
  function normalizeEditorBold(){
    $('visualEditor').querySelectorAll('b').forEach(b=>{const s=document.createElement('strong');while(b.firstChild)s.appendChild(b.firstChild);b.replaceWith(s);});
    $('visualEditor').querySelectorAll('span[style]').forEach(sp=>{const style=(sp.getAttribute('style')||'').replace(/\s+/g,'').toLowerCase();if(/font-weight:(bold|700|800|900)/.test(style)){const st=document.createElement('strong');while(sp.firstChild)st.appendChild(sp.firstChild);sp.replaceWith(st);}});
  }
  function toggleBoldSelection(){
    const editor=$('visualEditor');if(!editor)return null;
    if(savedEditorRange){
      try{
        const range=savedEditorRange.cloneRange(),startTop=topEditorChild(range.startContainer),endTop=topEditorChild(range.endContainer);
        if(!range.collapsed&&startTop&&startTop===endTop){
          const st=document.createElement('strong'),frag=range.extractContents();st.appendChild(frag);range.insertNode(st);st.normalize();
          const sr=document.createRange(),sel=window.getSelection();sr.selectNodeContents(st);sel.removeAllRanges();sel.addRange(sr);savedEditorRange=sr.cloneRange();return startTop;
        }
        editor.focus();if(restoreEditorSelection()&&document.execCommand){document.execCommand('bold',false,null);normalizeEditorBold();const sel=window.getSelection();if(sel&&sel.rangeCount&&!sel.getRangeAt(0).collapsed)savedEditorRange=sel.getRangeAt(0).cloneRange();return topEditorChild(sel&&sel.anchorNode)||selectedEl||editor;}
      }catch(e){}
    }
    const target=targetBlock(selectedEl);if(!target)return null;
    if(target.matches('strong,b')){const frag=document.createDocumentFragment();while(target.firstChild)frag.appendChild(target.firstChild);const parent=target.parentNode;target.replaceWith(frag);return parent&&parent.nodeType===1?parent:null;}
    if(target.matches('p,h2,h3,h4,li')){
      const only=target.children.length===1&&target.firstElementChild&&target.firstElementChild.matches('strong,b')&&clean(target.textContent)===clean(target.firstElementChild.textContent);
      if(only){const st=target.firstElementChild;while(st.firstChild)target.insertBefore(st.firstChild,st);st.remove();return target;}
      const st=document.createElement('strong');while(target.firstChild)st.appendChild(target.firstChild);target.appendChild(st);return target;
    }
    return null;
  }
  function wrapSelectedBlocksInBlockquote(){
    const blocks=rangeTopBlocks();
    if(blocks.length){
      if(blocks.every(b=>b.parentElement&&b.parentElement.matches('blockquote'))){const q=blocks[0].parentElement,parent=q.parentNode;while(q.firstChild)parent.insertBefore(q.firstChild,q);q.remove();return blocks[0];}
      const first=blocks[0],q=document.createElement('blockquote');first.parentNode.insertBefore(q,first);blocks.forEach(b=>q.appendChild(b));savedEditorRange=null;return q;
    }
    return wrapVisualBlockquote(selectedEl);
  }
  function makeVisualCtaFromSelection(){
    const blocks=rangeTopBlocks();
    if(blocks.length>=2){
      let label=blocks[0];if(label.closest('.bloc-bonsavoir'))return label.closest('.bloc-bonsavoir');
      const box=document.createElement('div');box.className='bloc-bonsavoir';const t=document.createElement('div');t.className='title-bonsavoir';const strong=document.createElement('strong');strong.textContent=ctaTitleText(label.textContent);t.appendChild(strong);const d=document.createElement('div');d.className='desc-bonsavoir';
      label.parentNode.insertBefore(box,label);blocks.slice(1).forEach(b=>d.appendChild(b));box.append(t,d);label.remove();savedEditorRange=null;return box;
    }
    if(savedEditorRange&&!savedEditorRange.collapsed){editorMessage('Pour créer un CTA, sélectionne le titre et le contenu dans des blocs distincts.','warning');return null;}
    return makeVisualCta(selectedEl);
  }
  function makeVisualWhyFromSelection(){
    const blocks=rangeTopBlocks();if(!blocks.length)return null;
    let title=blocks.find(el=>el.matches('h2'))||blocks[0];
    if(title.closest('.why-lawyer'))return title.closest('.why-lawyer');
    if(!title.matches('h2'))title=replaceVisualTag(title,'h2');
    const selectedSet=new Set(blocks),w=document.createElement('div');w.className='why-lawyer';
    title.parentNode.insertBefore(w,title);
    let n=title;
    while(n){
      const nx=n.nextSibling;
      if(n!==title&&n.nodeType===1&&visualBoundary(n))break;
      if(n.nodeType===1&&!selectedSet.has(n)&&n!==title)break;
      w.appendChild(n);
      n=nx;
    }
    appendVisualWhyCta(w);savedEditorRange=null;return w;
  }
  function makeVisualWhy(el){
    let title=targetBlock(el);if(!title)return null;if(!title.matches('h2'))title=replaceVisualTag(title,'h2');if(title.closest('.why-lawyer'))return title.closest('.why-lawyer');
    const w=document.createElement('div');w.className='why-lawyer';title.parentNode.insertBefore(w,title);w.appendChild(title);let n=w.nextSibling;while(n){const nx=n.nextSibling;if(n.nodeType===1&&visualBoundary(n))break;w.appendChild(n);n=nx;}
    appendVisualWhyCta(w);return w;
  }
  function applyFormat(format){
    if(format==='undo'){
      if(editorHistoryIndex<=0){editorMessage('Rien à annuler.','warning');return;}
      undoEditor();editorMessage('Modification annulée.','success');return;
    }
    if(format==='redo'){
      if(editorHistoryIndex<0||editorHistoryIndex>=editorHistory.length-1){editorMessage('Rien à rétablir.','warning');return;}
      redoEditor();editorMessage('Modification rétablie.','success');return;
    }
    if(!selectedEl&&!savedEditorRange){editorMessage('Sélectionne du texte ou clique sur un bloc dans l’aperçu avant d’utiliser ce bouton.','warning');return;}
    clearTimeout(historyTimer);commitEditorHistory();
    let n=selectedEl;
    if(['h2','h3','h4','p'].includes(format)){
      if(!selectedEl){editorMessage('Clique sur le titre ou le paragraphe à modifier.','warning');return;}
      n=replaceVisualTag(selectedEl,format);
    }else if(format==='strong')n=toggleBoldSelection();
    else if(format==='blockquote')n=wrapSelectedBlocksInBlockquote();
    else if(format==='cta')n=makeVisualCtaFromSelection();
    else if(format==='why')n=makeVisualWhyFromSelection()||(selectedEl?makeVisualWhy(selectedEl):null);
    if(!n){editorMessage('Cette transformation ne peut pas être appliquée à la sélection actuelle.','warning');return;}
    setSelected(n);syncFromVisual();commitEditorHistory();savedEditorRange=null;
    const labels={strong:'Gras appliqué.',blockquote:'Blockquote appliqué.',cta:'Bloc CTA appliqué.',why:'Bloc Rôle avocat appliqué.',h2:'H2 appliqué.',h3:'H3 appliqué.',h4:'H4 appliqué.',p:'Paragraphe appliqué.'};
    editorMessage(labels[format]||'Modification appliquée.','success');
  }

  async function copyOutput(){const txt=$('outputHtml').value;try{await navigator.clipboard.writeText(txt);}catch(e){$('outputHtml').focus();$('outputHtml').select();document.execCommand('copy');}document.querySelectorAll('#copyBtn,.copy-output-btn').forEach(b=>{const old=b.textContent;b.textContent='Copié ✓';setTimeout(()=>b.textContent=old,1200);});}
  function downloadHtml(){if(!lastResult)return;const blob=new Blob([$('outputHtml').value],{type:'text/html;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`article-${site.toLowerCase()}-final.html`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);}
  function addPublishedArticle(){
    const title=String($('quickBaseTitle').value||'').trim(),url=String($('quickBaseUrl').value||'').trim(),msg=$('quickBaseMessage');
    if(!title||!url){msg.textContent='Renseigne le titre et l’URL.';msg.className='hint base-message error';return;}
    const res=WPBaseManager.addOne(site,{title,url});
    if(!res.ok){msg.textContent=res.message||'Impossible d’ajouter cet article.';msg.className='hint base-message error';return;}
    msg.textContent=`✓ Article ajouté à la base ${site} et mémorisé dans ce navigateur.`;msg.className='hint base-message success';
    $('quickBaseTitle').value='';$('quickBaseUrl').value='';refreshBaseUI();
  }

  function initPreviewLinkTooltip(){
    const tip=document.createElement('div');tip.className='preview-link-tooltip';tip.hidden=true;document.body.appendChild(tip);
    const containers=[$('visualEditor'),$('onlinePreview')].filter(Boolean);
    const show=(e)=>{const a=e.target.closest&&e.target.closest('a[href]');if(!a)return;tip.textContent=a.getAttribute('href')||'';tip.hidden=false;tip.style.left=Math.min(window.innerWidth-340,e.clientX+14)+'px';tip.style.top=Math.min(window.innerHeight-70,e.clientY+18)+'px';};
    const move=(e)=>{if(tip.hidden)return;tip.style.left=Math.min(window.innerWidth-340,e.clientX+14)+'px';tip.style.top=Math.min(window.innerHeight-70,e.clientY+18)+'px';};
    const hide=(e)=>{if(e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest('a[href]'))return;tip.hidden=true;};
    containers.forEach(el=>{el.addEventListener('mouseover',show);el.addEventListener('mousemove',move);el.addEventListener('mouseout',hide);});
  }

  document.addEventListener('DOMContentLoaded',()=>{
    initTheme();initPreviewLinkTooltip();$('themeToggle').addEventListener('click',toggleTheme);
    $('siteSelect').addEventListener('change',e=>{const next=e.target.value;if(next===site)return;if(($('inputHtml').value.trim()||lastResult)&&!confirm('Changer de pays ? Le maillage suivant utilisera une autre base. Le résultat actuel ne sera pas recalculé automatiquement.')){e.target.value=site;return;}selectSite(next);if(lastResult){$('resultsPanel').hidden=true;$('floatingActions').hidden=true;setInputCollapsed(false);lastResult=null;editorHistory=[];editorHistoryIndex=-1;}});document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>showTab(t.dataset.tab)));
    $('toggleInputBtn').addEventListener('click',()=>setInputCollapsed(!$('inputBody').hidden));$('floatingEditorBtn').addEventListener('click',()=>{showTab('preview');$('visualToolbar').scrollIntoView({behavior:'smooth',block:'start'});});$('processBtn').addEventListener('click',run);$('copyBtn').addEventListener('click',copyOutput);document.querySelectorAll('.copy-output-btn').forEach(b=>b.addEventListener('click',copyOutput));$('outputHtml').addEventListener('input',()=>{updateInlineHtml();syncFromInlineCode();});$('inlineHtmlCode').addEventListener('input',syncFromInlineCode);$('modeVisualBtn').addEventListener('click',()=>setEditorMode('visual'));$('modeCodeBtn').addEventListener('click',()=>setEditorMode('code'));$('downloadHtmlBtn').addEventListener('click',downloadHtml);$('openAlertsBtn').addEventListener('click',()=>showTab('report'));
    $('clearBtn').addEventListener('click',()=>{$('inputHtml').value='';setEditorMode('visual');$('resultsPanel').hidden=true;$('floatingActions').hidden=true;setInputCollapsed(false);lastResult=null;editorHistory=[];editorHistoryIndex=-1;});$('quickBaseAddBtn').addEventListener('click',addPublishedArticle);$('quickBaseUrl').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addPublishedArticle();}});
    $('linksOutput').addEventListener('click',e=>{const word=e.target.closest('[data-context-link][data-context-token]');if(word){updateContextToken(Number(word.dataset.contextLink),Number(word.dataset.contextToken));return;}const b=e.target.closest('[data-link-index]');if(b)updateLink(Number(b.dataset.linkIndex),b.dataset.linkAction||'insert');});
    $('linksOutput').addEventListener('change',e=>{const input=e.target.closest('[data-anchor-edit-index]');if(input)updateCandidateAnchor(Number(input.dataset.anchorEditIndex),input.value);});
    $('linksOutput').addEventListener('keydown',e=>{const input=e.target.closest('[data-anchor-edit-index]');if(input&&e.key==='Enter'){e.preventDefault();input.blur();}});
    $('visualEditor').addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();const found=pickEditorElement(e.target);setSelected(found);focusMatchingHtml(found);});
    document.addEventListener('selectionchange',()=>{rememberEditorSelection();const sel=window.getSelection();if(sel&&sel.rangeCount&&!sel.isCollapsed){const n=sel.getRangeAt(0).commonAncestorContainer;const el=n.nodeType===1?n:n.parentElement;if(el&&$('visualEditor').contains(el))focusMatchingHtml(pickEditorElement(el));}});
    $('visualToolbar').addEventListener('mousedown',e=>{const b=e.target.closest('[data-format]');if(!b)return;rememberEditorSelection();e.preventDefault();});
    $('visualEditor').addEventListener('input',()=>{syncFromVisual();scheduleHistoryCommit();});
    $('visualEditor').addEventListener('keydown',e=>{if(headingEnterToParagraph(e))return;if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undoEditor();}else if((e.ctrlKey||e.metaKey)&&((e.shiftKey&&e.key.toLowerCase()==='z')||e.key.toLowerCase()==='y')){e.preventDefault();redoEditor();}});
    $('visualToolbar').addEventListener('click',e=>{const b=e.target.closest('[data-format]');if(!b||b.disabled)return;if(editorMode==='code'){setEditorMode('visual');editorMessage('Mode Visuel activé : sélectionne le passage à mettre en forme.','warning');return;}applyFormat(b.dataset.format);});
    $('refreshPreviewBtn').addEventListener('click',()=>{loadPreview($('outputHtml').value,true);if(lastResult)lastResult.html=$('outputHtml').value;showTab('preview');});
    window.addEventListener('online',checkInternet);window.addEventListener('offline',()=>setConnectionState(false));checkInternet();
    selectSite('FR');updateHistoryButtons();
  });
})();
