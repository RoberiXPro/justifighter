(function(){
  function validate(r,site){
    const h=r.html||'',warnings=r.report.warnings.length,errors=r.report.errors.length,a=[];
    a.push({label:'Intégrité du texte',status:r.integrity?'ok':'warn',detail:r.integrity?'OK':'À vérifier',target:r.integrity?null:'report'});
    const raw=/(?:>\s*)?(Sources?|Links|References|Useful links|Further reading|External links|Bibliography|Resources|Liens|Références)\s*:?\s*(?:<|https?:)/i.test(h);
    a.push({label:'Sources',status:raw?'warn':'ok',detail:r.stats.sources?`${r.stats.sources} converties`:'aucune brute détectée',target:raw?'report':null});
    a.push({label:'Rôle avocat',status:r.stats.whyCount?'ok':'warn',detail:r.stats.whyCount?`${r.stats.whyCount} bloc`:'non détecté',target:r.stats.whyCount?null:'report'});
    a.push({label:'CTA encadrés',status:'ok',detail:String(r.stats.ctaCount||0)});
    a.push({label:'Maillage auto',status:'ok',detail:String((r.links.inserted||[]).length),target:'links'});
    a.push({label:'Alertes',status:errors?'bad':warnings?'warn':'ok',detail:String(errors+warnings),target:(errors+warnings)?'report':null});
    return a;
  }
  window.WPValidator={validate};
})();
