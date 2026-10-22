(function(){
  'use strict';

  const SOURCE_RX=/^(source|sources|links|references|useful links|further reading|external links|bibliography|resources|liens|références)\s*:?$/i;
  const FAQ_RX=/^(faq|faqs|questions? fréquentes|foire aux questions)\s*:?$/i;
  const KEY_TOP_RX=/^(key takeaway|quick answer|réponse rapide|reponse rapide)\s*:?$/i;
  const BOTTOM_RX=/^(points? clés? à retenir|points? cl[eé]s? a retenir|points? clefs? à retenir|points? clefs? a retenir|key takeaways?|next steps?|prochaines étapes|prochaines etapes)\s*:?$/i;
  const WHY_RX=/(r[oô]le de l['’]avocat|r[oô]le (?:de |d['’])?un avocat|pourquoi (?:faire appel|consulter|contacter) (?:à |a )?un avocat|comment (?:un|l['’]) avocat peut|comment l['’]avocat (?:peut|vous|intervient|accompagne)|faut-il (?:faire appel à |consulter |contacter )?un avocat|quand (?:faire appel à |consulter |contacter )?un avocat|avocat.*(?:aider|accompagner|assister|intervenir)|importance de l['’]avocat|do (?:you|i) need (?:a )?(?:solicitor|lawyer)|why (?:do|should) (?:you|i) (?:need|hire|contact|speak to) (?:a )?(?:solicitor|lawyer)|how can (?:a )?(?:solicitor|lawyer) help|when should (?:i|you) (?:contact|get|speak to) (?:a )?(?:solicitor|lawyer)|role of (?:a |the )?(?:solicitor|lawyer))/i;
  const LAWYER_TERM_RX=/\b(avocat(?:e|s)?|solicitor(?:s)?|lawyer(?:s)?|legal counsel)\b/i;
  const CTA_RX=/^(bon à savoir|bon a savoir|à noter|a noter|à savoir|a savoir|important|note importante|attention|remarque|nos conseils?|conseils?|conseil|remember|beware|advice|caution|did you know|exception|insight|tip|good to know|word to the wise|expert insight|pro tip|noteworthy|key consideration|prudent approach|practical consideration|practical one-line checklist|next action|immediate action|practical takeaway|what to do now|what to do next|bottom line|practical next step)\s*:?$/i;
  const EXAMPLE_LABEL_RX=/^(exemple|examples?|cas|cas pratique|cas concret|mise en situation|scénario|scenario|illustration|practical case|practical example|case study|real-life example)\s*:?$/i;
  const EXAMPLE_START_RX=/^(voici\s+(?:un|une)\s+(?:cas pratique|cas concret|exemple|illustration)|prenons\s+(?:un|l['’])?exemple|imaginons|par exemple\s*[:,]|exemple\s*:|cas pratique\s*:|cas concret\s*:|sc[ée]nario\s*:|illustration\s*:|for example\s*:|consider this example|imagine this|case study\s*:|practical example\s*:)/i;
  const SUMMARY_RX=/^(en résumé|en resume|pour résumer|pour resumer|en conclusion|pour conclure|in summary|to sum up|overall|in conclusion)(?:\s|[,.:;!?–—-]|$)/i;
  const QUESTION_START_RX=/^(comment|que |qu['’]|quel(?:le|s|les)?\b|quels?\b|pourquoi|peut-on|peut on|dans quels?\b|dans quelles?\b|quand|où|ou |qui\b|combien|est-ce|est ce|faut-il|faut il|can\b|how\b|what\b|when\b|why\b|who\b|which\b|do\b|does\b|is\b|are\b|should\b|could\b|where\b)/i;
  const H3_HINT_RX=/^(recours contre|voie amiable|voie judiciaire|recours amiable|recours judiciaire|vendeur particulier|vendeur professionnel|étape\s+\d+|etape\s+\d+|step\s+\d+|against\b)/i;
  const KNOWN_BLOCK_CLASSES=new Set(['why-lawyer','bloc-bonsavoir','title-bonsavoir','desc-bonsavoir']);

  function text(n){return(n&&n.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
  function cleanLabel(s){return String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim().replace(/\s*:\s*$/,'').trim();}
  function top(n,r){while(n&&n.parentNode!==r)n=n.parentNode;return n&&n.parentNode===r?n:null;}
  function progress(n,r){const t=top(n,r),a=Array.from(r.childNodes),i=a.indexOf(t);return i<0?0:i/(a.length||1);}
  function wrap(nodes,w){if(!nodes.length)return;nodes[0].parentNode.insertBefore(w,nodes[0]);nodes.forEach(n=>w.appendChild(n));}
  function replaceTag(el,tag,stripSoloStrong=false){
    const n=document.createElement(tag);
    if(stripSoloStrong&&el.children.length===1&&el.firstElementChild.matches('strong,b')&&text(el)===text(el.firstElementChild))n.innerHTML=el.firstElementChild.innerHTML;
    else n.innerHTML=el.innerHTML;
    for(const a of Array.from(el.attributes||[]))n.setAttribute(a.name,a.value);
    el.replaceWith(n);return n;
  }
  function isWhitespaceNode(n){return n&&n.nodeType===3&&!String(n.nodeValue||'').replace(/\u00a0/g,' ').trim();}
  function blankBreak(s){return /\r?\n[ \t\u00a0]*\r?\n/.test(String(s||''));}
  function beginsBlank(s){return /^\s*\r?\n[ \t\u00a0]*\r?\n/.test(String(s||''));}
  function endsBlank(s){return /\r?\n[ \t\u00a0]*\r?\n\s*$/.test(String(s||''));}
  function onlyStrong(el){return el&&el.nodeType===1&&el.matches('strong,b')&&text(el).length>0;}

  function joinStrongHeadingRuns(root,rep){
    let total=0;
    for(const start of Array.from(root.childNodes)){
      if(start.parentNode!==root||start.nodeType!==1||!start.matches('strong,b'))continue;
      const nodes=[start];let n=start.nextSibling;
      while(n){
        if(n.nodeType===3){if(/\n\s*\n/.test(n.nodeValue||''))break;if(String(n.nodeValue||'').trim())break;nodes.push(n);n=n.nextSibling;continue;}
        if(n.nodeType===1&&n.matches('strong,b')){nodes.push(n);n=n.nextSibling;continue;}
        break;
      }
      const parts=nodes.filter(x=>x.nodeType===1);
      if(parts.length<2)continue;
      const title=parts.map(x=>x.textContent).join('').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
      if(title.length>200||title.length<8||!(/[?？]$/.test(title)||QUESTION_START_RX.test(title)))continue;
      const h=document.createElement('h2');h.textContent=title;start.before(h);nodes.forEach(x=>x.remove());total++;
    }
    if(total)rep.actions.push(`${total} H2 reconstitué(s) depuis des fragments <strong> adjacents.`);
  }

  // Le HTML brut WordPress peut contenir des lignes <strong> isolees au lieu de vrais titres.
  // This pass rebuilds safe paragraph blocks BEFORE any editorial transformation.
  function normalizeLooseStructure(root,rep){
    const out=document.createElement('div');let p=null,convertedText=0,flattened=0;
    function flush(){if(p){if(text(p))out.appendChild(p);p=null;}}
    function ensureP(){if(!p)p=document.createElement('p');return p;}
    function appendTextSegment(seg){if(!String(seg).replace(/\u00a0/g,' ').trim())return;ensureP().appendChild(document.createTextNode(seg.replace(/\s*\r?\n\s*/g,' ')));convertedText++;}
    function processTextNode(node){
      const raw=String(node.nodeValue||'');
      const parts=raw.split(/(\r?\n[ \t\u00a0]*\r?\n+)/);
      for(const part of parts){if(!part)continue;if(blankBreak(part)){flush();}else appendTextSegment(part);}
    }
    function meaningfulSibling(node,dir){let n=node[dir];while(n&&n.nodeType===3&&!String(n.nodeValue||'').replace(/\u00a0/g,' ').trim())n=n[dir];return n;}
    function strongIsStandalone(node){
      const prev=node.previousSibling,next=node.nextSibling,prevMeaning=meaningfulSibling(node,'previousSibling'),nextMeaning=meaningfulSibling(node,'nextSibling');
      const prevBoundary=!prevMeaning||(prev&&prev.nodeType===3&&endsBlank(prev.nodeValue))||(prevMeaning.nodeType===1&&!['A','EM','I','SPAN','SUP','SUB'].includes(prevMeaning.tagName));
      const nextBoundary=!nextMeaning||(next&&next.nodeType===3&&(beginsBlank(next.nodeValue)||!String(next.nodeValue||'').replace(/\u00a0/g,' ').trim()))||(nextMeaning.nodeType===1&&!['A','EM','I','SPAN','SUP','SUB'].includes(nextMeaning.tagName));
      return prevBoundary&&nextBoundary;
    }
    function processNode(node){
      if(node.nodeType===3){processTextNode(node);return;}
      if(node.nodeType!==1)return;
      const tag=node.tagName;
      if(tag==='DIV'&&!Array.from(node.classList||[]).some(c=>KNOWN_BLOCK_CLASSES.has(c))){flush();for(const child of Array.from(node.childNodes))processNode(child);flattened++;return;}
      if(onlyStrong(node)&&strongIsStandalone(node)){flush();out.appendChild(node.cloneNode(true));return;}
      if(['P','UL','OL','TABLE','FIGURE','IMG','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','SECTION','HR','PRE'].includes(tag)||Array.from(node.classList||[]).some(c=>KNOWN_BLOCK_CLASSES.has(c))){flush();out.appendChild(node.cloneNode(true));return;}
      ensureP().appendChild(node.cloneNode(true));
    }
    for(const n of Array.from(root.childNodes))processNode(n);flush();
    root.innerHTML='';while(out.firstChild)root.appendChild(out.firstChild);
    if(convertedText)rep.actions.push('Structure WordPress brute normalisee pour l’analyse.');
    if(flattened)rep.actions.push(`${flattened} conteneur(s) générique(s) aplati(s) avant formatage.`);
  }

  function leadInfo(node){
    if(!node||node.nodeType!==1)return null;
    if(node.matches('h2,h3,h4,strong,b'))return{label:cleanLabel(text(node)),sameLine:false,strong:node.matches('strong,b')?node:null};
    if(!node.matches('p,div'))return null;
    const first=node.firstElementChild;
    if(first&&first.matches('strong,b')){
      const label=cleanLabel(text(first));const remainder=[];let n=first.nextSibling;while(n){remainder.push(n);n=n.nextSibling;}
      return{label,sameLine:remainder.some(x=>String(x.textContent||x.nodeValue||'').replace(/\u00a0/g,' ').trim()),strong:first,remainder};
    }
    const t=text(node),m=t.match(/^([^:]{1,80})\s*:/);if(m)return{label:cleanLabel(m[1]),sameLine:true,strong:null,prefix:m[0]};
    return{label:cleanLabel(t),sameLine:false,strong:null};
  }
  function isMarker(node,rx){const i=leadInfo(node);return!!(i&&rx.test(i.label));}
  function whyTitleNode(node){if(!node||node.nodeType!==1)return false;if(node.matches('h2,h3,h4,strong,b'))return WHY_RX.test(cleanLabel(text(node)));if(node.matches('p,div')){if(!node.children.length&&text(node).length<190&&WHY_RX.test(cleanLabel(text(node))))return true;const first=node.firstElementChild;if(first&&first.matches('strong,b')){let hasRemainder=false;for(let n=first.nextSibling;n;n=n.nextSibling){if(String(n.textContent||n.nodeValue||'').replace(/\u00a0/g,' ').trim()){hasRemainder=true;break;}}return !hasRemainder&&WHY_RX.test(cleanLabel(text(first)));}}return false;}
  function specialLabel(node){return isMarker(node,SOURCE_RX)||isMarker(node,FAQ_RX)||isMarker(node,KEY_TOP_RX)||isMarker(node,BOTTOM_RX)||isMarker(node,CTA_RX)||whyTitleNode(node)||isMarker(node,EXAMPLE_LABEL_RX);}
  function isolatedStrongBlock(node){
    if(!node||node.nodeType!==1||!node.matches('p,div'))return null;
    const meaningful=Array.from(node.childNodes).filter(n=>n.nodeType===1||!isWhitespaceNode(n));
    if(meaningful.length!==1)return null;
    const strong=meaningful[0];
    if(!strong||strong.nodeType!==1||!strong.matches('strong,b'))return null;
    return text(node)===text(strong)&&text(node)?strong:null;
  }
  function standaloneStrongBoundary(node){return node&&node.nodeType===1&&((node.matches('strong,b')&&text(node).length<220)||(isolatedStrongBlock(node)&&text(node).length<220));}
  function boundary(node){return node&&node.nodeType===1&&(node.matches('h2,h3,h4,blockquote,.why-lawyer,.bloc-bonsavoir')||specialLabel(node)||standaloneStrongBoundary(node));}

  function previousHeading(node,root){let n=node.previousElementSibling;while(n){if(n.matches('h2,h3,h4'))return n;n=n.previousElementSibling;}return null;}
  function mergeAdjacentStrongHeadings(root,rep){
    let merged=0;
    for(const n of Array.from(root.children)){
      if(!n.isConnected||!n.matches('p'))continue;
      const meaningful=Array.from(n.childNodes).filter(x=>x.nodeType===1||String(x.nodeValue||'').trim());
      if(meaningful.length<2||!meaningful.every(x=>x.nodeType===1&&x.matches('strong,b')))continue;
      const combined=text(n);
      if(combined.length>200||!(/[?？]$/.test(combined)||QUESTION_START_RX.test(combined)))continue;
      const h=document.createElement('h2');h.textContent=combined;n.replaceWith(h);merged++;
    }
    if(merged)rep.actions.push(`${merged} titre(s) H2 reconstitué(s) depuis des fragments en gras.`);
  }
  function promoteStrongHeadings(root,rep){let h2=0,h3=0,amb=0,inFaq=false;
    for(const node of Array.from(root.children)){
      if(isMarker(node,FAQ_RX)){inFaq=true;continue;}
      if(inFaq&&(isMarker(node,BOTTOM_RX)||isMarker(node,SOURCE_RX)||whyTitleNode(node))){inFaq=false;}
      const soloStrong=node.matches('strong,b')?node:isolatedStrongBlock(node);
      if(!soloStrong||specialLabel(node)||inFaq)continue;
      const t=cleanLabel(text(node));if(t.length<4||t.length>200)continue;
      if(/[?？]\s*$/.test(t)||QUESTION_START_RX.test(t)){replaceTag(node,'h2',true);h2++;continue;}
      if(H3_HINT_RX.test(t)){replaceTag(node,'h3',true);h3++;continue;}
      const prev=previousHeading(node,root);
      if(prev&&prev.matches('h2')&&t.split(/\s+/).length<=10){replaceTag(node,'h3',true);h3++;continue;}
      amb++;
    }
    if(h2||h3)rep.actions.push(`Titres WordPress restaurés : ${h2} H2 et ${h3} H3.`);
    if(amb)rep.warnings.push(`${amb} ligne(s) en gras isolée(s) laissée(s) inchangée(s) car niveau de titre incertain.`);
  }

  function introLabel(r,rep){const e=Array.from(r.children).find(x=>text(x));if(!e)return;const rx=/^\s*<(strong|b)>\s*(Intro|Introduction)\s*:\s*<\/\1>\s*/i;if(rx.test(e.innerHTML)){e.innerHTML=e.innerHTML.replace(rx,'');rep.actions.push('Libellé Intro/Introduction supprimé.');}}
  function removeExistingToc(r){const before=r.innerHTML;r.innerHTML=before.replace(/\[lwptoc[^\]]*\]\s*/gi,'');return before===r.innerHTML?0:1;}
  function introParagraph(n){if(!n||n.nodeType!==1||!n.matches('p')||n.querySelector('img,figure'))return false;if(specialLabel(n))return false;if(/^\s*\[[a-z]/i.test(text(n)))return false;return true;}
  function addUkToc(r,rep){
    removeExistingToc(r);const nodes=Array.from(r.childNodes);let ref=null,sawIntro=false;
    for(const n of nodes){if(isWhitespaceNode(n))continue;if(introParagraph(n)){sawIntro=true;continue;}ref=n;break;}
    const toc=document.createTextNode('[lwptoc skipHeadingLevel="h3"]\n');if(!ref)r.appendChild(toc);else r.insertBefore(toc,ref);
    rep.actions.push('Sommaire UK [lwptoc skipHeadingLevel="h3"] ajouté après l’introduction.');if(!sawIntro)rep.warnings.push('Introduction UK non reconnue avec certitude : vérifier la position du sommaire.');
  }

  function collectUntil(start,stopFn,maxElements=Infinity){const out=[start];let n=start.nextSibling,elements=0;while(n){if(n.nodeType===1&&stopFn(n))break;out.push(n);if(n.nodeType===1)elements++;if(elements>=maxElements)break;n=n.nextSibling;}return out;}
  function sourceShortcode(urls){return'[article_sources list="'+urls.map(u=>{let d='source';try{d=new URL(u).hostname.replace(/^www\./i,'');}catch(e){}return d+' -- '+u;}).join(' | ').replace(/"/g,'&quot;')+'"]';}
  function extractUrls(nodes){const out=[],seen=new Set();for(const n of nodes){if(n.nodeType===1)n.querySelectorAll('a[href]').forEach(a=>{const u=(a.getAttribute('href')||'').trim().replace(/[),.;:]+$/,'');if(/^https?:\/\//i.test(u)&&!seen.has(u)){seen.add(u);out.push(u);}});for(let u of((n.textContent||'').match(/https?:\/\/[^\s<>"']+/gi)||[])){u=u.replace(/[),.;:]+$/,'');if(!seen.has(u)){seen.add(u);out.push(u);}}}return out;}

  function keyTopBlock(r,rep){let c=0;for(const node of Array.from(r.children)){if(!isMarker(node,KEY_TOP_RX)||node.closest('blockquote'))continue;const h=node.matches('h2')?node:replaceTag(node,'h2',true),q=document.createElement('blockquote');wrap(collectUntil(h,n=>n.matches('h2'),20),q);c++;break;}if(c)rep.actions.push('Key Takeaway / Quick Answer principal placé en blockquote.');return c;}

  function faqQuestion(node){const t=text(node);if(!t.endsWith('?')&&!t.endsWith('？'))return false;return node.matches('strong,b,h3,h4')||(node.matches('p')&&node.children.length===1&&node.firstElementChild&&node.firstElementChild.matches('strong,b'));}
  function normalizeFaqQuestion(node){
    if(node.matches('strong,b'))return node;
    if(node.matches('h3,h4')){const s=document.createElement('strong');s.innerHTML=node.innerHTML;node.replaceWith(s);return s;}
    if(node.matches('p')&&node.children.length===1&&node.firstElementChild.matches('strong,b')){const s=node.firstElementChild;node.replaceWith(s);return s;}
    return node;
  }
  function faqStop(node,sawQuestion){if(node.matches('h2,h3,h4')||isMarker(node,BOTTOM_RX)||isMarker(node,SOURCE_RX)||whyTitleNode(node))return true;if(sawQuestion&&node.matches('p')&&SUMMARY_RX.test(text(node)))return true;if(sawQuestion&&standaloneStrongBoundary(node)&&!faqQuestion(node))return true;return false;}
  function faqBlock(r,rep,site){let c=0;for(const node of Array.from(r.children)){if(!isMarker(node,FAQ_RX)||node.closest('blockquote'))continue;const h=node.matches('h2')?node:replaceTag(node,'h2',true);h.textContent=site==='UK'?'FAQs':'FAQ';const nodes=[h];let n=h.nextSibling,sawQ=false,qCount=0;while(n){if(n.nodeType===1&&faqStop(n,sawQ))break;const nx=n.nextSibling;if(n.nodeType===1&&faqQuestion(n)){n=normalizeFaqQuestion(n);sawQ=true;qCount++;}nodes.push(n);n=nx;}if(!sawQ){rep.warnings.push('FAQ détectée mais questions non reconnues avec certitude : bloc laissé inchangé.');continue;}const q=document.createElement('blockquote');wrap(nodes,q);c++;rep.actions.push(`FAQ isolée correctement : ${qCount} question(s), fermeture avant la conclusion/points clés.`);}return c;}

  // Only a clearly marked standalone conclusion may be moved after the FAQ.
  // Do not infer conclusions from position or words inside ordinary paragraphs.
  function moveExplicitConclusionAfterFaq(r,rep){
    const faq=Array.from(r.children).find(n=>n.matches('blockquote')&&Array.from(n.querySelectorAll('h2')).some(h=>FAQ_RX.test(cleanLabel(text(h)))));
    if(!faq)return 0;
    const candidates=Array.from(r.children).filter(n=>n!==faq&&n.matches('p,div')&&!n.classList.contains('bloc-bonsavoir')&&!n.classList.contains('why-lawyer')&&/^(?:pour conclure|en conclusion|en r[ée]sum[ée]|pour r[ée]sumer|en bref|pour finir|en définitive)(?:\s|[,.:;!?–—-]|$)/i.test(text(n)));
    const prior=candidates.filter(n=>(n.compareDocumentPosition(faq)&Node.DOCUMENT_POSITION_FOLLOWING)!==0);
    if(prior.length!==1){if(prior.length>1)rep.warnings.push('Plusieurs conclusions explicites avant FAQ : déplacement ignoré.');return 0;}
    const conclusion=prior[0];
    // Never move a section container or a paragraph whose placement is ambiguous.
    if(conclusion.querySelector('h2,h3,h4,blockquote,.bloc-bonsavoir,.why-lawyer'))return 0;
    faq.after(conclusion);
    rep.actions.push('Conclusion explicitement identifiée déplacée après la FAQ.');
    return 1;
  }

  function findExistingLawyerUrl(root,site){const domain=site==='FR'?'justifit.fr':site==='BE'?'justifit.be':'qredible.co.uk';let fallback=null;for(const a of Array.from(root.querySelectorAll('a[href]'))){let u;try{u=new URL(a.getAttribute('href'),location.href);}catch(e){continue;}if(!u.hostname.replace(/^www\./,'').endsWith(domain))continue;const label=text(a);if(!/(avocat|solicitor|lawyer)/i.test(label)&&!/(\/avocats\/|\/find\/solicitors\/)/i.test(u.pathname))continue;if(/\/avocats\/q\/|\/trouver\/avocats\/|\/find\/solicitors\//i.test(u.pathname))return u.href;fallback=fallback||u.href;}return fallback;}
  function appendCta(w,site,root,rep){if(/\[ctabtn\b/i.test(w.textContent||w.innerHTML))return false;const existing=findExistingLawyerUrl(root,site);let cfg;if(existing)cfg={url:existing,text:window.WPCtaPages?WPCtaPages.buttonText(site,existing):(site==='UK'?'Find a solicitor':'Trouver un avocat'),fromArticle:true};else cfg=window.WPCtaPages?WPCtaPages.resolve(site,text(root)):null;if(!cfg)return false;w.appendChild(document.createTextNode(`\n[ctabtn url="${cfg.url}" text="${cfg.text}" target="_blank" follow="follow" color="blue"]`));if(cfg.fromArticle)rep.actions.push(`CTA avocat créé avec l’URL déjà présente dans l’article : « ${cfg.text} »`);else if(cfg.contextual)rep.actions.push(`CTA avocat contextualisé : ${cfg.key} · « ${cfg.text} »`);else rep.warnings.push('CTA avocat ajouté vers l’annuaire général : spécialité non reconnue avec certitude.');return true;}
  function lawyerSignalBetween(start,endExclusive){const parts=[];for(let n=start;n&&n!==endExclusive;n=n.nextSibling){if(n.nodeType===1||n.nodeType===3)parts.push(text(n));}return LAWYER_TERM_RX.test(parts.join(' '));}
  function fallbackWhyBeforeFaq(r){
    for(const faq of Array.from(r.children).filter(n=>isMarker(n,FAQ_RX))){
      let n=faq.previousElementSibling,title=null;
      while(n){
        if(n.matches('.why-lawyer'))break;
        if(isMarker(n,BOTTOM_RX)||isMarker(n,SOURCE_RX))break;
        if(n.matches('h2')){title=n;break;}
        if(standaloneStrongBoundary(n)&&!specialLabel(n)){title=n;break;}
        n=n.previousElementSibling;
      }
      if(!title)continue;
      if(!lawyerSignalBetween(title,faq))continue;
      return{title,faq};
    }
    return null;
  }
  // Section boundaries are structural, never inferred from the mere presence of
  // the word "avocat" in an ordinary paragraph. Editorial inserts have priority
  // even when represented as bold P nodes rather than native HTML headings.
  function whySectionBoundary(n){
    if(!n||n.nodeType!==1)return false;
    if(boundary(n)||isMarker(n,EXAMPLE_LABEL_RX))return true;
    if(n.matches('p,div')&&SUMMARY_RX.test(text(n)))return true;
    if(n.matches('p')&&EXAMPLE_START_RX.test(text(n)))return true;
    return false;
  }
  function whyBlock(r,rep,site){
    let c=0,buttons=0,fallbacks=0;
    for(const node of Array.from(r.children)){
      if(!whyTitleNode(node)||node.closest('.why-lawyer'))continue;
      const title=node.matches('h2')?node:replaceTag(node,'h2',true);
      const nodes=collectUntil(title,n=>n!==title&&whySectionBoundary(n),30);
      const w=document.createElement('div');w.className='why-lawyer';wrap(nodes,w);
      if(appendCta(w,site,r,rep))buttons++;c++;
    }
    if(!c){
      const fb=fallbackWhyBeforeFaq(r);
      if(fb){
        const title=fb.title.matches('h2')?fb.title:replaceTag(fb.title,'h2',true);
        const nodes=collectUntil(title,n=>n===fb.faq||whySectionBoundary(n),40);
        const w=document.createElement('div');w.className='why-lawyer';wrap(nodes,w);
        if(appendCta(w,site,r,rep))buttons++;c++;fallbacks++;
      }
    }
    if(c){
      rep.actions.push(`${c} section rôle avocat/solicitor placée dans <div class="why-lawyer">${buttons?` avec ${buttons} CTA`:''}.`);
      if(fallbacks)rep.actions.push('Section rôle avocat détectée par sa position immédiatement avant la FAQ et la présence d’un avocat/solicitor dans son contenu.');
    }else rep.warnings.push('Section rôle avocat/solicitor non détectée.');
    return c;
  }

  function exactBottomLabel(site){return site==='UK'?'KEY TAKEAWAYS:':'POINTS CLÉS À RETENIR :';}
  function bottomBlock(r,rep,site){let c=0;for(const node of Array.from(r.children)){if(!isMarker(node,BOTTOM_RX)||node.closest('blockquote'))continue;const p=document.createElement('p'),s=document.createElement('strong');s.textContent=exactBottomLabel(site);p.appendChild(s);node.replaceWith(p);const nodes=collectUntil(p,n=>isMarker(n,SOURCE_RX)||n.matches('h2,h3,h4')||isMarker(n,FAQ_RX)||whyTitleNode(n),20);const q=document.createElement('blockquote');wrap(nodes,q);c++;}if(c)rep.actions.push(`${c} bloc ${exactBottomLabel(site).replace(':','')} placé en blockquote avant les sources.`);else rep.warnings.push(`Bloc ${exactBottomLabel(site).replace(':','')} non détecté.`);return c;}

  function boldExampleLead(node){if(!node||node.nodeType!==1)return;if(node.matches('strong,b'))return;if(node.matches('p')&&node.children.length===1&&node.firstElementChild.matches('strong,b')&&text(node)===text(node.firstElementChild))return;const s=document.createElement('strong');while(node.firstChild)s.appendChild(node.firstChild);node.appendChild(s);}
  function exampleBlock(r,rep){let c=0;for(const node of Array.from(r.children)){if(node.closest('blockquote,.why-lawyer,.bloc-bonsavoir'))continue;const info=leadInfo(node),isLabel=!!(info&&EXAMPLE_LABEL_RX.test(info.label)),isSentence=node.matches('p')&&EXAMPLE_START_RX.test(text(node));if(!isLabel&&!isSentence)continue;boldExampleLead(node);let nodes=[node];if(isLabel&&!info.sameLine){const next=node.nextSibling;if(next&&!(next.nodeType===1&&boundary(next)))nodes.push(next);}else if(isSentence){/* Une phrase illustrative autonome ne peut absorber le paragraphe suivant. */}const q=document.createElement('blockquote');if(isSentence&&node.matches('p')&&node.children.length===1&&node.firstElementChild.matches('strong')&&text(node)===text(node.firstElementChild)){const lead=node.firstElementChild;q.appendChild(lead);node.replaceWith(q);}else{wrap(nodes,q);}c++;}if(c)rep.actions.push(`${c} cas pratique/exemple/scénario placé en blockquote avec titre en gras.`);return c;}

  function sameLineContent(node,i){if(i.strong){const p=document.createElement('p');i.remainder.forEach(n=>p.appendChild(n.cloneNode(true)));return text(p)?[p]:[];}if(i.prefix&&node.children.length===0){const rest=text(node).replace(new RegExp('^'+i.prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*','i'),'');if(rest){const p=document.createElement('p');p.textContent=rest;return[p];}}return[];}
  function infoBox(label,contentNodes,site){const b=document.createElement('div');b.className='bloc-bonsavoir';const t=document.createElement('div');t.className='title-bonsavoir';const s=document.createElement('strong');s.textContent=cleanLabel(label).replace(/\s*:+\s*$/, '')+(site==='UK'?':':' :');t.appendChild(s);const d=document.createElement('div');d.className='desc-bonsavoir';contentNodes.forEach(n=>d.appendChild(n));b.append(t,d);return b;}
  function ctaBlocks(r,rep,site){let c=0;for(const node of Array.from(r.children)){if(node.closest('.bloc-bonsavoir,blockquote,.why-lawyer'))continue;const i=leadInfo(node);if(!i||!CTA_RX.test(i.label)||KEY_TOP_RX.test(i.label)||BOTTOM_RX.test(i.label))continue;let contents=[];if(i.sameLine)contents=sameLineContent(node,i);if(!contents.length){let n=node.nextSibling;while(n){if(n.nodeType===1&&boundary(n))break;if(n.nodeType===1&&/^(?:P|DIV|BR)$/.test(n.tagName)&&!text(n)){n=n.nextSibling;continue;}if(n.nodeType===1||!isWhitespaceNode(n))contents.push(n);n=n.nextSibling;if(contents.filter(x=>x.nodeType===1).length>=4)break;}}if(!contents.length){rep.warnings.push(`CTA « ${i.label} » détecté mais contenu non isolable : laissé inchangé.`);continue;}const box=infoBox(i.label,contents,site);node.parentNode.insertBefore(box,node);node.remove();c++;}if(c)rep.actions.push(`${c} CTA converti${c>1?'s':''} en bloc-bonsavoir sans englober le titre suivant.`);return c;}

  function convertSources(r,rep){let start=null;for(const node of Array.from(r.children)){if(isMarker(node,SOURCE_RX)&&progress(node,r)>.25){start=node;break;}}if(!start){rep.warnings.push('Aucune section Sources détectée.');return 0;}const ns=[];for(let n=start;n;n=n.nextSibling)ns.push(n);const urls=extractUrls(ns);if(!urls.length){rep.warnings.push('Section Sources détectée, mais aucune URL exploitable.');return 0;}start.parentNode.insertBefore(document.createTextNode(sourceShortcode(urls)),start);ns.forEach(n=>n.remove());rep.actions.push(`Sources converties en [article_sources] (${urls.length} URL${urls.length>1?'s':''}).`);return urls.length;}

  function emojiLists(r,rep){let c=0;for(const parent of [r,...Array.from(r.querySelectorAll('div,section,blockquote'))]){const kids=Array.from(parent.children);for(let i=0;i<kids.length;){if(!kids[i].matches('p')||!/^\s*[✔✅⚠🚨]\s*/u.test(text(kids[i]))){i++;continue;}const g=[];let j=i;while(j<kids.length&&kids[j].matches('p')&&/^\s*[✔✅⚠🚨]\s*/u.test(text(kids[j]))){g.push(kids[j]);j++;}if(g.length>=2){const ul=document.createElement('ul');g[0].parentNode.insertBefore(ul,g[0]);g.forEach(p=>{const li=document.createElement('li');li.innerHTML=p.innerHTML.replace(/^\s*[✔✅⚠🚨]\s*/u,'');ul.appendChild(li);p.remove();});c++;}i=j;}}if(c)rep.actions.push(`${c} liste à symboles convertie en liste HTML.`);return c;}
  function tables(r,rep){let fixed=0,sus=0;for(const tb of Array.from(r.querySelectorAll('table'))){tb.querySelectorAll('thead td').forEach(td=>{replaceTag(td,'th');fixed++;});const tr=tb.querySelector('tr');if(tr&&!tr.querySelector('th')){const ds=Array.from(tr.children).filter(x=>x.tagName==='TD');if(ds.length&&ds.every(td=>td.querySelector('strong,b'))){ds.forEach(td=>replaceTag(td,'th'));fixed+=ds.length;}else if(ds.length)sus++;}}if(fixed)rep.actions.push(`${fixed} cellule(s) d’en-tête convertie(s) en <th>.`);if(sus)rep.warnings.push(`${sus} tableau(x) avec en-tête incertain laissé(s) inchangé(s).`);return{fixed,sus};}
  function externalLinks(r,site,rep){const cfg=WPBaseManager.CONFIG[site];let ext=0;for(const a of Array.from(r.querySelectorAll('a[href]'))){let host='';try{host=new URL(a.getAttribute('href'),location.href).hostname.replace(/^www\./i,'');}catch(e){continue;}if(host===cfg.rootDomain||host.endsWith('.'+cfg.rootDomain)){continue;}else if(/^https?:/i.test(a.href)){a.setAttribute('target','_blank');a.setAttribute('rel','nofollow noopener');ext++;}}if(ext)rep.actions.push(`${ext} lien(s) externe(s) sécurisé(s). Les maillages internes déjà présents sont conservés tels quels.`);return ext;}
  function duplicateInternalLinks(r,site,rep){const cfg=WPBaseManager.CONFIG[site],seen=new Map(),dups=[];for(const a of Array.from(r.querySelectorAll('a[href]'))){let u,host;try{u=new URL(a.getAttribute('href'),location.href);host=u.hostname.replace(/^www\./i,'');}catch(e){continue;}if(!(host===cfg.rootDomain||host.endsWith('.'+cfg.rootDomain)))continue;const key=u.href.replace(/\/$/,'');const count=(seen.get(key)||0)+1;seen.set(key,count);if(count===2)dups.push(key);}if(dups.length)rep.warnings.push(`${dups.length} URL interne(s) déjà répétée(s) dans le HTML d’origine. L’outil les conserve mais n’ajoutera aucune nouvelle occurrence de ces URLs.`);return dups.length;}


  function joinedText(root){const parts=[],w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const v=String(n.nodeValue||'').replace(/\u00a0/g,' ').trim();if(v)parts.push(v);}return parts.join(' ').replace(/\s+/g,' ').trim();}
  function textSignature(root){const c=root.cloneNode(true);for(const node of Array.from(c.children)){if(isMarker(node,SOURCE_RX)&&progress(node,c)>.20){let n=node;while(n){const nx=n.nextSibling;n.remove();n=nx;}break;}}let t=joinedText(c).replace(/\[(?:lwptoc|ctabtn|article_sources)[^\]]*\]/gi,'').replace(/[✔✅⚠🚨]/gu,'');t=t.replace(/^(intro|introduction)\s*:\s*/i,'').replace(/POINTS CLÉS À RETENIR\s*:?/gi,'points clés à retenir').replace(/KEY TAKEAWAYS\s*:?/gi,'key takeaways').replace(/\bfaqs?\s*:?\s*/gi,'faq ');return t.toLowerCase().replace(/\s+([:;?!])/g,'$1').replace(/\s+/g,' ').trim();}

  function pretty(h){return h.replace(/&nbsp;|\u00a0/gi,' ').replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi,'$1').replace(/\sdata-[\w-]+=(?:"[^"]*"|'[^']*')/gi,'').replace(/<p>\s*<\/p>/gi,'').replace(/<div>\s*<\/div>/gi,'').replace(/<p>\s*&nbsp;\s*<\/p>/gi,'').replace(/<\/((?:p|div|h2|h3|h4|blockquote|ul|ol|table|tr|li))>\s*</gi,'</$1>\n<').replace(/\]\s*</g,']\n<').trim();}

  function finalizeProcessing(r,rep,o,originalSignature,sources,categories,base,linkRes){
    if(linkRes.inserted.length)rep.actions.push(`${linkRes.inserted.length} lien(s) interne(s) très sûr(s) inséré(s).`);
    if(o.externalLinks)externalLinks(r,o.site,rep);duplicateInternalLinks(r,o.site,rep);
    const finalSignature=textSignature(r),integrity=originalSignature===finalSignature;if(!integrity)rep.warnings.push('Le contrôle de texte détecte une différence après formatage. Vérifier l’aperçu avant publication.');
    const rawSource=Array.from(r.children).some(n=>isMarker(n,SOURCE_RX));if(rawSource)rep.errors.push('Une section Sources brute est encore présente.');
    const whyCount=r.querySelectorAll('.why-lawyer').length,faqCount=Array.from(r.querySelectorAll('blockquote h2')).filter(h=>FAQ_RX.test(cleanLabel(text(h)))).length,ctaCount=r.querySelectorAll('.bloc-bonsavoir').length,bqCount=r.querySelectorAll('blockquote').length;
    for(const b of Array.from(r.querySelectorAll('.bloc-bonsavoir'))){if(b.querySelector('h2,h3,h4'))rep.errors.push('Un CTA contient un titre H2/H3/H4 : bloc mal isolé.');}
    for(const q of Array.from(r.querySelectorAll('blockquote'))){const h=q.querySelector(':scope > h2');if(h&&FAQ_RX.test(cleanLabel(text(h)))&&(q.querySelector('.why-lawyer')||Array.from(q.querySelectorAll('strong')).some(s=>BOTTOM_RX.test(cleanLabel(text(s))))))rep.errors.push('FAQ trop large : elle englobe une section qui devrait être extérieure.');}
    for(const w of Array.from(r.querySelectorAll('.why-lawyer'))){
      if(w.querySelector('blockquote h2')&&FAQ_RX.test(cleanLabel(text(w.querySelector('blockquote h2')))))rep.errors.push('Le bloc why-lawyer englobe la FAQ.');
      if(!/\[ctabtn\b/i.test(w.textContent||''))rep.warnings.push('Bloc why-lawyer détecté sans shortcode CTA : vérifier le lien avocat/solicitor.');
    }
    const tw=document.createTreeWalker(r,NodeFilter.SHOW_TEXT);let tn;while(tn=tw.nextNode()){if(/\[ctabtn\b/i.test(tn.nodeValue||'')&&!(tn.parentElement&&tn.parentElement.closest('.why-lawyer'))){rep.errors.push('Un shortcode [ctabtn] se trouve hors du bloc why-lawyer.');break;}}
    return{html:pretty(r.innerHTML),report:rep,links:linkRes,categories,integrity,stats:{sources,baseCount:base.length,whyCount,faqCount,ctaCount,blockquoteCount:bqCount,headings:{h2:r.querySelectorAll('h2').length,h3:r.querySelectorAll('h3').length,h4:r.querySelectorAll('h4').length}}};
  }

  function emptyResult(){return{html:'',report:{actions:[],warnings:[],errors:['Aucun HTML à traiter.']},links:{candidates:[],inserted:[]},categories:null,integrity:false,stats:{baseCount:0,sources:0}};}


  // Remove only browser text-fragment directives. Keep ordinary anchors (#section-id).
  function cleanTextFragmentUrls(root,rep){
    let changed=0;
    // Attribute values are already isolated; never stop at an apostrophe inside a text fragment.
    const stripAttribute=u=>{const str=String(u);const i=str.toLowerCase().indexOf('#:~:text=');return i<0?str:str.slice(0,i);};
    const stripText=u=>String(u).replace(/https?:\/\/[^\s<>"']*#:~:text=[^\s<>]*/gi,m=>m.slice(0,m.toLowerCase().indexOf('#:~:text=')));
    root.querySelectorAll('[href]').forEach(a=>{const v=a.getAttribute('href'),c=stripAttribute(v);if(c!==v){a.setAttribute('href',c);changed++;}});
    const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while((n=walk.nextNode())){
      if(!/#:~:text=/i.test(n.nodeValue||''))continue;
      const before=n.nodeValue,after=stripText(before);
      if(after!==before){n.nodeValue=after;changed++;}
    }
    if(changed)rep.actions.push(`${changed} fragment(s) de surlignage #:~:text= retiré(s) des URL.`);
  }

  function process(html,o){
    const r=document.createElement('div');r.innerHTML=html||'';const rep={actions:[],warnings:[],errors:[]};
    if(!r.textContent.trim()&&!r.querySelector('*'))return emptyResult();
    cleanTextFragmentUrls(r,rep);
    const originalSignature=textSignature(r);
    joinStrongHeadingRuns(r,rep);normalizeLooseStructure(r,rep);mergeAdjacentStrongHeadings(r,rep);promoteStrongHeadings(r,rep);introLabel(r,rep);
    if(o.site==='UK')addUkToc(r,rep);else if(removeExistingToc(r))rep.actions.push('Ancien shortcode [lwptoc] supprimé : réservé à UK.');
    if(o.formatBlocks){keyTopBlock(r,rep);exampleBlock(r,rep);ctaBlocks(r,rep,o.site);whyBlock(r,rep,o.site);faqBlock(r,rep,o.site);moveExplicitConclusionAfterFaq(r,rep);bottomBlock(r,rep,o.site);emojiLists(r,rep);tables(r,rep);}
    const sources=convertSources(r,rep),categories=WPCategories.analyze(r.textContent,o.site),base=WPBaseManager.getBase(o.site),linkRes=WPInternalLinks.process(r,o.site,base,o.autoLinks);
    return finalizeProcessing(r,rep,o,originalSignature,sources,categories,base,linkRes);
  }

  const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  async function processAsync(html,o,onProgress){
    const notify=async(percent,label)=>{if(typeof onProgress==='function')onProgress(percent,label);await nextPaint();};
    const r=document.createElement('div');r.innerHTML=html||'';const rep={actions:[],warnings:[],errors:[]};
    await notify(4,'Préparation du HTML');
    if(!r.textContent.trim()&&!r.querySelector('*')){await notify(100,'Aucun contenu à traiter');return emptyResult();}
    cleanTextFragmentUrls(r,rep);
    const originalSignature=textSignature(r);

    await notify(10,'Reconstruction de la structure WordPress');
    joinStrongHeadingRuns(r,rep);normalizeLooseStructure(r,rep);

    await notify(20,'Détection des titres H2 / H3 / H4');
    mergeAdjacentStrongHeadings(r,rep);promoteStrongHeadings(r,rep);introLabel(r,rep);

    await notify(29,o.site==='UK'?'Ajout du sommaire UK':'Contrôle du sommaire');
    if(o.site==='UK')addUkToc(r,rep);else if(removeExistingToc(r))rep.actions.push('Ancien shortcode [lwptoc] supprimé : réservé à UK.');

    if(o.formatBlocks){
      await notify(38,'Encadrés, exemples et CTA');
      keyTopBlock(r,rep);exampleBlock(r,rep);ctaBlocks(r,rep,o.site);

      await notify(51,'Rôle avocat et FAQ');
      whyBlock(r,rep,o.site);faqBlock(r,rep,o.site);moveExplicitConclusionAfterFaq(r,rep);

      await notify(62,'Points clés, listes et tableaux');
      bottomBlock(r,rep,o.site);emojiLists(r,rep);tables(r,rep);
    }else await notify(62,'Blocs éditoriaux désactivés');

    await notify(71,'Conversion des sources');
    const sources=convertSources(r,rep);

    await notify(78,'Catégorisation et chargement de la base');
    const categories=WPCategories.analyze(r.textContent,o.site),base=WPBaseManager.getBase(o.site);

    await notify(84,'Analyse du maillage interne');
    const linkRes=WPInternalLinks.process(r,o.site,base,o.autoLinks);

    await notify(94,'Contrôle des liens et de la structure');
    const result=finalizeProcessing(r,rep,o,originalSignature,sources,categories,base,linkRes);

    await notify(99,'Préparation de l’aperçu et du rapport');
    return result;
  }
  window.WPFormatter={process,processAsync};
})();
