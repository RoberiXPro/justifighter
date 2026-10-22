(function(){
  const PAGES={
    FR:{
      default:{url:'https://www.justifit.fr/trouver/avocats/france/'},
      family:{url:'https://www.justifit.fr/trouver/avocats/france/droit-de-la-famille-des-personnes-et-de-leur-patrimoine/'},
      criminal:{url:'https://www.justifit.fr/trouver/avocats/france/droit-penal/'},
      employment:{url:'https://www.justifit.fr/trouver/avocats/france/droit-du-travail/'}
    },
    BE:{
      default:{url:'https://www.justifit.be/trouver/avocats/belgique/'},
      family:{url:'https://www.justifit.be/trouver/avocats/belgique/droit-de-la-famille-des-personnes-et-de-leur-patrimoine/'},
      criminal:{url:'https://www.justifit.be/trouver/avocats/belgique/droit-penal/'},
      employment:{url:'https://www.justifit.be/trouver/avocats/belgique/droit-du-travail/'}
    },
    UK:{
      default:{url:'https://www.qredible.co.uk/find/solicitors/uk/'},
      family:{url:'https://www.qredible.co.uk/find/solicitors/uk/family-law/'},
      criminal:{url:'https://www.qredible.co.uk/find/solicitors/uk/criminal-law/'},
      employment:{url:'https://www.qredible.co.uk/find/solicitors/uk/employment/'},
      conveyancing:{url:'https://www.qredible.co.uk/find/solicitors/uk/conveyancing/'},
      immigration:{url:'https://www.qredible.co.uk/find/solicitors/uk/immigration/'},
      litigation:{url:'https://www.qredible.co.uk/find/solicitors/uk/litigation/'}
    }
  };
  const RULES={
    family:['divorce','séparation','separation','mariage','conjoint','conjugale','conjugal','domicile conjugal','jaf','juge aux affaires familiales','pension alimentaire','garde des enfants','garde enfant','autorité parentale','autorite parentale','filiation','adoption','child custody','child maintenance','family law','civil partnership','grandparent','guardianship'],
    criminal:['droit pénal','droit penal','pénal','penal','infraction','crime','délit','delit','garde à vue','garde a vue','plainte','prison','agression','violence','violences','harcèlement','harcelement','criminal law','police caution','offence','sentencing','restraining order','blackmail','assault','gbh','abh'],
    employment:['droit du travail','travail','salarié','salarie','employeur','licenciement','contrat de travail','prudhomme','prud’homme','rupture conventionnelle','employment','employee','employer','dismissal','redundancy','workplace','grievance'],
    conveyancing:['conveyancing','buying a house','selling a house','land registry','transfer of equity','leasehold','freehold','property purchase'],
    immigration:['immigration','visa','asylum','citizenship','indefinite leave','home office'],
    litigation:['litigation','dispute resolution','court claim','lawsuit','commercial dispute']
  };
  const FR_LABELS={
    'automobile':'Automobile',
    'droit-penal':'Droit pénal',
    'droit-du-travail':'Droit du travail',
    'droit-de-la-famille-des-personnes-et-de-leur-patrimoine':'Droit de la famille',
    'droit-de-la-famille':'Droit de la famille',
    'droit-des-etrangers':'Droit des étrangers',
    'droit-immobilier':'Droit immobilier',
    'droit-de-la-consommation':'Droit de la consommation'
  };
  const UK_LABELS={
    'family-law':'Family Law','criminal-law':'Criminal Law','employment':'Employment','conveyancing':'Conveyancing','immigration':'Immigration','litigation':'Litigation','personal-injury':'Personal Injury','commercial-law':'Commercial Law','business-law':'Business Law','wills-probate':'Wills & Probate','landlord-tenant':'Landlord & Tenant'
  };
  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/’/g,"'");}
  function score(text,key){const n=norm(text);return (RULES[key]||[]).reduce((s,t)=>s+(n.includes(norm(t))?(t.includes(' ')?3:1):0),0);}
  function titleCaseEnglish(s){return s.split(/[-_\s]+/).filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');}
  function sentenceCaseFrench(s){const words=s.split(/[-_]+/).filter(Boolean);if(!words.length)return'';const low=words.map(w=>w.toLowerCase()).join(' ');return low.charAt(0).toUpperCase()+low.slice(1);}
  function specialityFromUrl(site,url){
    let path='';try{path=new URL(url,location.href).pathname.replace(/\/+$/,'');}catch(e){return'';}
    const parts=path.split('/').filter(Boolean);let slug='';
    if(site==='UK'){
      const i=parts.findIndex((p,idx)=>p==='uk'&&parts[idx-1]==='solicitors');if(i>=0&&parts[i+1])slug=parts[i+1];
      if(!slug)return'';try{slug=decodeURIComponent(slug);}catch(e){}return UK_LABELS[slug]||titleCaseEnglish(slug);
    }
    const q=parts.indexOf('q');if(q>=0&&parts[q+1])slug=parts[q+1];
    if(!slug){const country=site==='BE'?'belgique':'france',i=parts.indexOf(country);if(i>=0&&parts[i+1])slug=parts[i+1];}
    if(!slug)return'';try{slug=decodeURIComponent(slug);}catch(e){}return FR_LABELS[slug]||sentenceCaseFrench(slug);
  }
  function buttonText(site,url){
    const spec=specialityFromUrl(site,url);
    if(site==='UK'){
      if(!spec)return'Find a solicitor';
      const article=/^[AEIOU]/i.test(spec)?'an':'a';return `Find ${article} ${spec} solicitor`;
    }
    return spec?`Trouver un avocat en ${spec}`:'Trouver un avocat';
  }
  function resolve(site,text){
    const pageSet=PAGES[site]||PAGES.FR;let best='default',bestScore=0;
    Object.keys(RULES).forEach(k=>{if(!pageSet[k])return;const s=score(text,k);if(s>bestScore){best=k;bestScore=s;}});
    const page=pageSet[best]||pageSet.default;
    return {...page,key:best,contextual:best!=='default',score:bestScore,text:buttonText(site,page.url)};
  }
  window.WPCtaPages={PAGES,resolve,buttonText,specialityFromUrl};
})();
