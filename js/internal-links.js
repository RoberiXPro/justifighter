(function(){
  'use strict';
  const STOP=new Set((
    "a à au aux un une le la les l de du des d en et ou mais donc or ni car pour par sur sous dans avec sans chez vers entre avant apres après pendant depuis jusque jusqu que qui quoi dont où ou ce cet cette ces se sa son ses leur leurs mon ma mes ton ta tes notre nos votre vos je tu il elle on nous vous ils elles me te lui eux y ne n pas plus moins tres très tout tous toute toutes est sont etre être suis es sommes etes êtes ai as a avons avez ont avait avaient aura auront fait faire peut peuvent pourrait pourraient doit doivent alors ainsi comme si lors lorsque afin via selon parmi contre chaque aucun aucune certains certaines meme même quelque quelques autre autres quel quelle quels quelles comment pourquoi quand combien",
    "the a an and or but for nor so yet of in on at by to from with without about into over under between after before during as is are was were be been being this that these those it its your you we our can could should would may might do does did how what when where why who which not no yes more less very all any some each other another there here than then such via per"
  ).split(/\s+/));
  const GENERIC=new Set((
    'avocat avocats lawyer lawyers solicitor solicitors droit droits rights procedure procédures procédures procédure demarche démarches demarches guide savoir connaitre connaître comprendre obtenir demander besoin aide conseils conseil cas situation article articles information informations sujet question questions chose choses personne personnes partie parties service services loi legal légale légales juridique juridiques recours action actions solution solutions'
  ).split(/\s+/));
  const BAD_PHRASES=[
    /^(vos|votre|leurs?) droits$/i,/^défendre vos droits$/i,/^defendre vos droits$/i,/^vous devez$/i,/^ce que vous devez$/i,/^la procédure$/i,/^la procedure$/i,/^les démarches$/i,/^les demarches$/i,/^un avocat$/i,/^l['’]avocat$/i,/^avocat$/i,/^solicitor$/i,/^lawyer$/i,/^peut être$/i,/^peut etre$/i,/^il faut$/i,/^n['’]est pas$/i,/^d['’]un(?:e)?\b/i,/^de l['’]?\b/i,/^vente d['’]un(?:e)?$/i,/^d['’]un(?:e)? véhicule$/i
  ];
  const CACHE=new WeakMap();
  const EDGE_PREFIX=/^(?:(?:le|la|les|un|une|des|du|de|au|aux|dans|sur|pour|par|avec|sans|en|vers|chez|entre|the|a|an|of|in|on|at|by|to|from|with|for)\s+|(?:l|d)[’'])+/i;
  function cleanExactPhrase(s){return String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
  function normalizeAnchorPhrase(s){
    let out=cleanExactPhrase(s),prev='';
    while(out&&out!==prev){prev=out;out=out.replace(EDGE_PREFIX,'').trim();}
    out=out.replace(/^[,;:–—-]+\s*/,'').replace(/\s+([,;:!?])$/,'$1').trim();
    return out;
  }
  function stripAccents(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function semanticTokens(s){return stripAccents(s).replace(/[’']/g,' ').replace(/[-_/]/g,' ').match(/[\p{L}\p{N}]+/gu)||[];}
  function contentTokens(s){return semanticTokens(s).filter(w=>w.length>2&&!STOP.has(w));}
  function topicTokens(s){return contentTokens(s).filter(w=>!GENERIC.has(w));}
  function surfaceTokens(s){const out=[];const re=/[\p{L}\p{N}]+(?:[’'][\p{L}\p{N}]+)*/gu;let m;while((m=re.exec(String(s||''))))out.push({text:m[0],start:m.index,end:re.lastIndex});return out;}
  function escRx(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  function canonical(u){try{return new URL(u,location.href).href.replace(/\/$/,'');}catch(e){return (u||'').replace(/\/$/,'');}}
  function bodyText(root){return String(root.textContent||'').replace(/\s+/g,' ').trim();}
  function eligibleTextNodes(root){
    const out=[];const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){const p=node.parentElement;if(!p||!node.nodeValue.trim())return NodeFilter.FILTER_REJECT;if(p.closest('a,h1,h2,h3,h4,h5,h6,script,style,blockquote,.why-lawyer,.bloc-bonsavoir'))return NodeFilter.FILTER_REJECT;if(!p.closest('p,li,td,th'))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT;}});let n;while(n=walker.nextNode())out.push(n);return out;
  }
  function firstLastMeaningfulOk(phrase){const sem=semanticTokens(phrase);if(!sem.length)return false;return !STOP.has(sem[0])&&!STOP.has(sem[sem.length-1]);}
  function phraseWindows(title){
    const raw=String(title||''),tokens=surfaceTokens(raw),out=[];
    for(let len=Math.min(8,tokens.length);len>=2;len--){
      for(let i=0;i+len<=tokens.length;i++){
        const a=tokens[i],b=tokens[i+len-1],rawPhrase=raw.slice(a.start,b.end).trim(),phrase=normalizeAnchorPhrase(rawPhrase),cw=contentTokens(phrase),tw=topicTokens(phrase);
        if(phrase.length<7||cw.length<2||tw.length<1)continue;
        if(!firstLastMeaningfulOk(phrase))continue;
        if(BAD_PHRASES.some(rx=>rx.test(phrase)))continue;
        const stopRatio=(semanticTokens(phrase).length-cw.length)/Math.max(1,semanticTokens(phrase).length);if(stopRatio>.6)continue;
        out.push({phrase,content:cw,topic:tw,wordCount:semanticTokens(phrase).length});
      }
    }
    return out;
  }
  function findPhrase(root,phrase){const re=new RegExp(escRx(phrase).replace(/\s+/g,'\\s+'),'i');for(const node of eligibleTextNodes(root)){const m=node.nodeValue.match(re);if(m)return{node,match:m[0]};}return null;}
  function contextFromText(text,match){
    const raw=String(text||'').replace(/\u00a0/g,' '),needle=String(match||'');if(!raw||!needle)return null;
    const idx=raw.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());if(idx<0)return null;
    const matchEnd=idx+needle.length,all=surfaceTokens(raw);if(!all.length)return null;let first=-1,last=-1;
    for(let i=0;i<all.length;i++){if(first<0&&all[i].end>idx)first=i;if(all[i].start<matchEnd)last=i;}
    if(first<0||last<first)return null;
    const left=Math.max(0,first-11),right=Math.min(all.length-1,last+11),startChar=all[left].start,endChar=all[right].end,ctxText=raw.slice(startChar,endChar);
    const relStart=idx-startChar,relEnd=matchEnd-startChar,baseTokens=surfaceTokens(ctxText),tokens=[];
    baseTokens.forEach(t=>{
      const cuts=[t.start,t.end];if(relStart>t.start&&relStart<t.end)cuts.push(relStart);if(relEnd>t.start&&relEnd<t.end)cuts.push(relEnd);cuts.sort((a,b)=>a-b);
      for(let i=0;i<cuts.length-1;i++){const a=cuts[i],b=cuts[i+1];if(b<=a)continue;const piece=ctxText.slice(a,b);if(/[\p{L}\p{N}]/u.test(piece))tokens.push({text:piece,start:a,end:b});}
    });
    let start=-1,end=-1;tokens.forEach((t,i)=>{if(t.start>=relStart&&t.end<=relEnd){if(start<0)start=i;end=i;}});
    if(start<0||end<start)return null;
    return{text:ctxText,tokens,start,end,coreStart:start,coreEnd:end};
  }
  function contextFromHit(hit,anchor){return hit&&hit.node?contextFromText(hit.node.nodeValue,hit.match||anchor):null;}
  function contextFromHtml(html,anchor){const root=document.createElement('div');root.innerHTML=html||'';const hit=findPhrase(root,anchor);return hit?contextFromHit(hit,anchor):null;}
  function anchorFromContext(ctx){if(!ctx||!ctx.tokens||!ctx.tokens.length)return'';const s=ctx.tokens[ctx.start],e=ctx.tokens[ctx.end];if(!s||!e)return'';return ctx.text.slice(s.start,e.end).trim();}
  function selectContextToken(candidate,index){
    const ctx=candidate&&candidate.context;if(!ctx||!ctx.tokens||index<0||index>=ctx.tokens.length)return{ok:false,reason:'no-context'};
    let start=ctx.start,end=ctx.end;
    if(index<start)start=index;
    else if(index>end)end=index;
    else if(start===end)return{ok:false,reason:'minimum'};
    else if(index===start)start++;
    else if(index===end)end--;
    else {
      // Une ancre HTML doit rester continue. Un clic au milieu resserre donc
      // la selection depuis le bord le plus proche, sans creer de trou.
      const leftDistance=index-start,rightDistance=end-index;
      if(leftDistance<=rightDistance)start=index+1;else end=index-1;
    }
    const next={...ctx,start,end},anchor=cleanExactPhrase(anchorFromContext(next));
    if(!anchor||topicTokens(anchor).length<1)return{ok:false,reason:'weak'};
    ctx.start=start;ctx.end=end;candidate.anchor=anchor;return{ok:true,anchor};
  }
  function countPhrase(root,phrase){const re=new RegExp(escRx(phrase).replace(/\s+/g,'\\s+'),'gi');let c=0;for(const node of eligibleTextNodes(root)){const ms=node.nodeValue.match(re);if(ms)c+=ms.length;}return c;}
  function existingUrls(root){const s=new Set();root.querySelectorAll('a[href]').forEach(a=>s.add(canonical(a.getAttribute('href'))));return s;}
  function statsFor(base){
    if(CACHE.has(base))return CACHE.get(base);const df=new Map(),n=Math.max(base.length,1);
    base.forEach(item=>{new Set(topicTokens(item.title)).forEach(w=>df.set(w,(df.get(w)||0)+1));});
    const st={df,n};CACHE.set(base,st);return st;
  }
  function rarity(tokens,st){let score=0,rare=0;for(const w of new Set(tokens)){const f=st.df.get(w)||1,ratio=f/st.n;score+=Math.log((st.n+1)/(f+1));if(ratio<=.025)rare++;}return{score,rare};}
  function mainTitle(title){return String(title||'').split(/\s[:–—|]\s|[?:]/)[0].trim();}
  function coverage(a,b){const A=new Set(a),B=new Set(b);if(!B.size)return 0;let c=0;B.forEach(w=>{if(A.has(w))c++;});return c/B.size;}
  function likelySelfTarget(root,item,st){
    const title=topicTokens(mainTitle(item.title));if(title.length<4)return false;
    const intro=topicTokens(bodyText(root).slice(0,1200)),cov=coverage(intro,title),rr=rarity(title,st);
    if(cov<.78||rr.rare<1)return false;
    const introText=stripAccents(bodyText(root).slice(0,1200)).replace(/[’']/g,' ');
    for(let i=0;i+3<=title.length;i++){const phrase=title.slice(i,i+3).join(' ');if(introText.includes(phrase))return true;}
    return false;
  }
  function tokenSequenceContains(longer,shorter){
    if(!longer.length||!shorter.length||shorter.length>longer.length)return false;
    outer:for(let i=0;i+shorter.length<=longer.length;i++){
      for(let j=0;j<shorter.length;j++)if(longer[i+j]!==shorter[j])continue outer;
      return true;
    }
    return false;
  }
  function dominancePrune(list){
    return list.filter((c,i)=>!list.some((d,j)=>{
      if(i===j)return false;
      const ca=topicTokens(c.anchor),da=topicTokens(d.anchor);
      if(da.length<=ca.length||!tokenSequenceContains(da,ca))return false;
      // Si une proposition plus longue reprend toute l'ancre courte et colle
      // nettement mieux au titre cible, elle doit gagner. Cela evite par ex.
      // "achat d'une voiture" -> LOA quand le texte dit
      // "achat d'une voiture sans controle technique".
      const dCov=Number(d.mainCoverage||0),cCov=Number(c.mainCoverage||0);
      const materiallyMoreSpecific=da.length>=ca.length+1;
      const targetFitClearlyBetter=dCov>=.78&&dCov>=cCov+.18;
      return materiallyMoreSpecific&&targetFitClearlyBetter;
    }));
  }
  function buildCandidates(root,base){
    const textAll=bodyText(root),articleTopic=new Set(topicTokens(textAll)),ex=existingUrls(root),st=statsFor(base),candidates=[];
    for(const item of base){
      const target=canonical(item.url);if(!target||ex.has(target))continue;if(likelySelfTarget(root,item,st))continue;
      const titleTopic=topicTokens(item.title),topicOverlap=titleTopic.filter(w=>articleTopic.has(w)).length;if(topicOverlap<2)continue;
      const main=topicTokens(mainTitle(item.title));let best=null;
      for(const ph of phraseWindows(item.title)){
        const hit=findPhrase(root,ph.phrase);if(!hit)continue;
        const anchor=normalizeAnchorPhrase(hit.match);if(BAD_PHRASES.some(rx=>rx.test(anchor)))continue;
        const ac=contentTokens(anchor),at=topicTokens(anchor);if(ac.length<2||at.length<1)continue;
        const rr=rarity(at,st),mainCoverage=coverage(at,main),occ=countPhrase(root,anchor);
        const genericRatio=(ac.length-at.length)/Math.max(1,ac.length);
        const unmatchedMain=Math.max(0,main.length-Math.round(mainCoverage*main.length));
        const phraseSpecificity=at.length*30+mainCoverage*85+Math.min(ac.length,8)*8;
        let score=ac.length*18+at.length*22+Math.min(topicOverlap,6)*7+Math.min(rr.score,20)*3+mainCoverage*42+Math.min(anchor.length,60)/5+phraseSpecificity-unmatchedMain*24;
        if(occ===1)score+=8;if(genericRatio>.35)score-=18;
        const exactCore=(main.length>=2&&mainCoverage>=.72);
        const highlySpecific=(at.length>=3&&ac.length>=3&&rr.rare>=1&&topicOverlap>=3&&exactCore&&genericRatio<=.25&&anchor.length>=16&&occ<=2);
        const compactExact=(at.length>=2&&ac.length>=2&&rr.rare>=2&&topicOverlap>=2&&mainCoverage>=.95&&genericRatio<=.20&&anchor.length>=18&&occ===1);
        const autoSafe=highlySpecific||compactExact;
        // Un titre cible riche en concepts ne doit pas etre suggere sur seulement
        // la moitie de son sujet. Exemple : "location + option + achat + voiture"
        // ne doit pas gagner uniquement grace a "achat d'une voiture".
        const minTargetCoverage=main.length>=4?.60:.50;
        const strongSuggestion=(at.length>=2&&ac.length>=2&&rr.rare>=1&&topicOverlap>=2&&mainCoverage>=minTargetCoverage&&genericRatio<=.40&&anchor.length>=12);
        if(!strongSuggestion&&!autoSafe)continue;
        const confidence=autoSafe?'auto-sûr':score>=165?'fort à vérifier':'à vérifier';
        const candidate={title:item.title,url:item.url,anchor,score:Math.round(score),topicOverlap,confidence,autoSafe,inserted:false,rareWords:rr.rare,mainCoverage:Number(mainCoverage.toFixed(2)),specificity:Math.round(phraseSpecificity),context:contextFromHit(hit,anchor)};
        if(!best||candidate.specificity>best.specificity||(candidate.specificity===best.specificity&&candidate.score>best.score))best=candidate;
      }
      if(best)candidates.push(best);
    }
    const pruned=dominancePrune(candidates);
    pruned.sort((a,b)=>(Number(b.autoSafe)-Number(a.autoSafe))||b.specificity-a.specificity||b.score-a.score||b.anchor.length-a.anchor.length);
    const urls=new Set(),anchors=new Set();return pruned.filter(c=>{const u=canonical(c.url),a=stripAccents(c.anchor);if(urls.has(u)||anchors.has(a))return false;urls.add(u);anchors.add(a);return true;}).slice(0,20);
  }
  function insertLink(root,c){const hit=findPhrase(root,c.anchor);if(!hit)return false;const node=hit.node,m=hit.match,lower=node.nodeValue.toLowerCase(),idx=lower.indexOf(m.toLowerCase());if(idx<0)return false;const before=node.nodeValue.slice(0,idx),after=node.nodeValue.slice(idx+m.length),a=document.createElement('a');a.href=c.url;a.textContent=m;node.parentNode.insertBefore(document.createTextNode(before),node);node.parentNode.insertBefore(a,node);node.parentNode.insertBefore(document.createTextNode(after),node);node.remove();return true;}
  function process(root,site,base,autoInsert){const candidates=buildCandidates(root,base),inserted=[];if(autoInsert){for(const c of candidates){if(c.autoSafe&&insertLink(root,c)){c.inserted=true;inserted.push(c);}}}return{candidates,inserted};}
  function anchorExists(html,anchor){const r=document.createElement('div');r.innerHTML=html||'';const a=cleanExactPhrase(anchor);return !!a&&!!findPhrase(r,a);}
  function insertIntoHtml(html,c){const r=document.createElement('div');r.innerHTML=html||'';if(existingUrls(r).has(canonical(c.url)))return{ok:false,reason:'duplicate-url',html:r.innerHTML};const copy={...c,anchor:cleanExactPhrase(c.anchor)};const ok=insertLink(r,copy);return{ok,reason:ok?'':'anchor-missing',html:r.innerHTML};}
  function removeFromHtml(html,c){const r=document.createElement('div');r.innerHTML=html||'';const target=canonical(c.url);for(const a of Array.from(r.querySelectorAll('a[href]'))){if(canonical(a.getAttribute('href'))===target&&a.textContent.trim().toLowerCase()===String(c.anchor||'').trim().toLowerCase()){a.replaceWith(document.createTextNode(a.textContent));return{ok:true,html:r.innerHTML};}}return{ok:false,html:r.innerHTML};}
  window.WPInternalLinks={process,buildCandidates,insertIntoHtml,removeFromHtml,normalizeAnchor:normalizeAnchorPhrase,cleanSelectedAnchor:cleanExactPhrase,anchorExists,contextFromHtml,selectContextToken};
})();
