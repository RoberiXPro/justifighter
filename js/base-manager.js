(function(){
  'use strict';
  const EXTRA_KEYS={FR:'wpIntegratorExtras_FR',BE:'wpIntegratorExtras_BE',UK:'wpIntegratorExtras_UK'};
  const LEGACY_KEYS={FR:'wpIntegratorBase_FR',BE:'wpIntegratorBase_BE',UK:'wpIntegratorBase_UK'};
  const CONFIG={
    FR:{label:'Justifit FR',domain:'www.justifit.fr',rootDomain:'justifit.fr'},
    BE:{label:'Justifit BE',domain:'www.justifit.be',rootDomain:'justifit.be'},
    UK:{label:'Qredible UK',domain:'www.qredible.co.uk',rootDomain:'qredible.co.uk'}
  };
  function isValidEntry(x){return x&&typeof x.title==='string'&&x.title.trim()&&typeof x.url==='string'&&/^https?:\/\//i.test(x.url.trim());}
  function canonical(u){try{const x=new URL(String(u||'').trim());x.hash='';return x.href.replace(/\/$/,'');}catch(e){return'';}}
  function integrated(site){return ((window.ARTICLE_BASES&&window.ARTICLE_BASES[site])||[]).filter(isValidEntry).map(x=>({title:x.title.trim(),url:x.url.trim()}));}
  function readArray(key){try{const raw=localStorage.getItem(key);if(!raw)return[];const arr=JSON.parse(raw);return Array.isArray(arr)?arr.filter(isValidEntry).map(x=>({title:x.title.trim(),url:x.url.trim()})):[];}catch(e){return[];}}
  function writeExtras(site,rows){try{localStorage.setItem(EXTRA_KEYS[site],JSON.stringify(rows));}catch(e){}return rows;}
  function migrateLegacy(site){
    const existing=readArray(EXTRA_KEYS[site]);if(existing.length)return existing;
    const legacy=readArray(LEGACY_KEYS[site]);if(!legacy.length)return[];
    const baseUrls=new Set(integrated(site).map(x=>canonical(x.url)).filter(Boolean));
    const extras=[];const seen=new Set();
    legacy.forEach(x=>{const u=canonical(x.url);if(!u||baseUrls.has(u)||seen.has(u))return;seen.add(u);extras.push({title:x.title,url:u+'/'});});
    if(extras.length)writeExtras(site,extras);
    try{localStorage.removeItem(LEGACY_KEYS[site]);}catch(e){}
    return extras;
  }
  function getExtras(site){const rows=readArray(EXTRA_KEYS[site]);return rows.length?rows:migrateLegacy(site);}
  function getBase(site){
    // La base WordPress integree reste intacte, y compris ses rares doublons historiques.
    // Seuls les ajouts locaux sont dedupliques avant d'etre fusionnes.
    const base=integrated(site),extras=getExtras(site),rows=base.map(x=>({title:x.title,url:x.url})),seen=new Set(base.map(x=>canonical(x.url)).filter(Boolean));
    extras.forEach(x=>{const u=canonical(x.url);if(!u||seen.has(u))return;seen.add(u);rows.push({title:x.title.trim(),url:x.url.trim()});});
    return rows;
  }
  function sourceLabel(site){return getExtras(site).length?'base intégrée + ajouts locaux':'base intégrée';}
  function stats(site){
    const rows=getBase(site);const urls=new Set(),titles=new Set();let dupUrls=0,dupTitles=0;
    rows.forEach(r=>{const u=canonical(r.url);if(urls.has(u))dupUrls++;urls.add(u);if(titles.has(r.title))dupTitles++;titles.add(r.title);});
    return {count:rows.length,dupUrls,dupTitles,source:sourceLabel(site),extras:getExtras(site).length};
  }
  function parseTabular(text){
    const clean=(text||'').replace(/^\uFEFF/,'').trim();
    if(!clean)return {rows:[],errors:['Aucune donnée collée.'],warnings:[]};
    if(clean[0]==='['){
      try{const arr=JSON.parse(clean);const rows=arr.filter(isValidEntry).map(x=>({title:x.title.trim(),url:x.url.trim()}));return validate(rows);}catch(e){}
    }
    const lines=clean.split(/\r?\n/).filter(l=>l.trim());const rows=[];const errors=[];let start=0;
    if(lines[0]&&/titre/i.test(lines[0])&&/url/i.test(lines[0]))start=1;
    for(let i=start;i<lines.length;i++){
      const line=lines[i];let parts=line.split('\t');if(parts.length<2)parts=line.split(/\s*;\s*/);
      if(parts.length<2){errors.push(`Ligne ${i+1} non reconnue`);continue;}
      const title=(parts.shift()||'').trim(),url=parts.join('\t').trim();if(!title||!url){errors.push(`Ligne ${i+1} incomplète`);continue;}rows.push({title,url});
    }
    const out=validate(rows);out.errors=errors.concat(out.errors);return out;
  }
  function validate(rows){
    const errors=[],warnings=[],valid=[],seenUrls=new Map();
    rows.forEach((r,i)=>{const title=(r.title||'').trim(),url=(r.url||'').trim();if(!title){errors.push(`Ligne ${i+1}: titre manquant`);return;}if(!/^https?:\/\//i.test(url)){errors.push(`Ligne ${i+1}: URL invalide`);return;}const c=canonical(url);if(seenUrls.has(c))warnings.push(`URL dupliquée: ${url}`);else seenUrls.set(c,i);valid.push({title,url});});
    return {rows:valid,errors,warnings};
  }
  function save(site,rows){
    // Compatibilité : cette fonction enregistre uniquement les ajouts locaux afin que les futures bases intégrées restent fusionnées.
    const baseUrls=new Set(integrated(site).map(x=>canonical(x.url)).filter(Boolean));const extras=[],seen=new Set();
    (rows||[]).forEach(x=>{if(!isValidEntry(x))return;const u=canonical(x.url);if(!u||baseUrls.has(u)||seen.has(u))return;seen.add(u);extras.push({title:x.title.trim(),url:u+'/'});});
    writeExtras(site,extras);return stats(site);
  }
  function reset(site){try{localStorage.removeItem(EXTRA_KEYS[site]);localStorage.removeItem(LEGACY_KEYS[site]);}catch(e){}return stats(site);}
  function addOne(site,entry){
    const cfg=CONFIG[site],title=String(entry&&entry.title||'').trim(),url=String(entry&&entry.url||'').trim();
    if(!cfg)return{ok:false,message:'Site inconnu.'};if(!title)return{ok:false,message:'Le titre est obligatoire.'};
    const canon=canonical(url);if(!canon)return{ok:false,message:'URL invalide.'};
    let host='';try{host=new URL(canon).hostname.toLowerCase().replace(/^www\./,'');}catch(e){}
    if(host!==cfg.rootDomain)return{ok:false,message:`Cette URL ne correspond pas au site ${site} (${cfg.rootDomain}).`};
    const existing=getBase(site).find(x=>canonical(x.url)===canon);if(existing)return{ok:false,message:`Cette URL existe déjà dans la base : « ${existing.title} ».`};
    const extras=getExtras(site).slice();const savedUrl=canon+'/';extras.push({title,url:savedUrl});writeExtras(site,extras);
    return{ok:true,entry:{title,url:savedUrl},count:getBase(site).length,extras:extras.length};
  }
  window.WPBaseManager={CONFIG,getBase,stats,parseTabular,save,reset,sourceLabel,addOne,getExtras};
})();
