const fs=require('fs'),vm=require('vm'),path=require('path');
const dir=process.argv[2]||__dirname;
const csvFile=process.argv[3]||path.join(__dirname,'catalogue','merch-catalogue.csv');
const src=['10-data.js','12-catalogue.js','15-csv.js','20-store.js','25-actions.js','30-public.js','40-account.js','50-studio.js']
  .map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('\n');
const stub=()=>({value:'',textContent:'',innerHTML:'',classList:{add(){},remove(){}},dataset:{},focus(){},
  closest(){return null},querySelector(){return null},querySelectorAll(){return []},appendChild(){},
  setAttribute(){},getAttribute(){return null},addEventListener(){},style:{}});
const ctx={console,Intl,Date,Math,JSON,String,Number,Object,Array,Set,isNaN,parseInt,parseFloat,
  document:{getElementById(){return null},createElement:stub,body:{appendChild(){}},addEventListener(){},
    documentElement:stub(),querySelector(){return null},querySelectorAll(){return []}},
  window:{addEventListener(){},scrollTo(){}},location:{hash:''},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},setTimeout:()=>0};
ctx.globalThis=ctx; vm.createContext(ctx);
vm.runInContext(src+'\nfunction go(){}\nfunction paintToasts(){}\nfunction render(){}',ctx);
ctx.__csv=fs.readFileSync(csvFile,'utf8');
const run=e=>vm.runInContext(e,ctx);

let fail=0;
const t=(n,code)=>{try{const r=run(`(function(){${code}})()`);
  if(r===true){console.log('  ✓ '+n)}else{fail++;console.log('  ✗ '+n+' → '+JSON.stringify(r))}}
  catch(e){fail++;console.log('  ✗ '+n+' → '+e.message)}};

console.log('\nCSV → MOCKUP');
t('the file validates with no errors', `const v=validateCatalogue(__csv); return v.ok===true || 'errors: '+JSON.stringify(v.report.filter(r=>r.sev==='ERROR'))`);
t('importing replaces the seeded catalogue', `
  SESSION={user:'u_leo'};
  const v=validateCatalogue(__csv); const n=v.byType.product.length;
  act.importCatalogue(v);
  return S.merchProducts.length===n && n>0 && S.merchProducts.every(p=>p.imported)`);
t('the public catalogue now shows the imported products', `
  UI={}; const html=pubProducts(); const p=S.merchProducts[0];
  return html.includes(p.name) && html.includes('minimum') && html.includes('pcard-img')`);
t('a product page renders from imported data', `
  UI={}; const p=S.merchProducts.find(x=>!x.quoteOnly);
  const html=pubProduct(p.id);
  return html.includes(p.name) && html.includes('Add to quote') && html.includes('pdp-sum')`);
t('handles survive the import', `
  return S.merchProducts.every(p=>/^[a-z0-9-]+$/.test(p.handle))`);
t('image URLs survive the import', `
  const p=S.merchProducts[0];
  return p.images.length>0 && p.images.every(i=>i.url.startsWith('https://')) &&
    Object.keys(p.colourImages).length>0`);
t('the rate card came across', `
  return S.decoRates && Object.keys(S.decoRates.methods).length===4 && S.decoRates.rates.length===16`);
t('screen cost at 100 pieces, 2 colours, is 2.64 x 1.2', `
  const c=decoCost(S.decoRates,'screen',100,2,null);
  return Math.abs(c.unit-3.168)<0.001 && c.setup===40 || JSON.stringify(c)`);
t('embroidery picks the band from artwork size', `
  const s=decoCost(S.decoRates,'embroidery',50,1,80);
  const m=decoCost(S.decoRates,'embroidery',50,1,120);
  const l=decoCost(S.decoRates,'embroidery',50,1,200);
  return s.unit===0.6 && m.unit===0.85 && l.unit===1.2`);
t('provisional rates are flagged through to the cost', `
  return decoCost(S.decoRates,'dtg',50,1,80).provisional===true &&
         decoCost(S.decoRates,'embroidery',50,1,80).provisional===false`);
t('the import writes exactly one audit entry, marked as an import', `
  const a=S.audit.filter(x=>x.action==='Catalogue imported');
  return a.length===1 && a[0].source==='import' &&
    a[0].now===S.merchProducts.length+' products'`);
t('the Studio merchandising screen renders the rate grid', `
  UI={}; const html=stMerch();
  return html.includes('expanded from the rate card') && html.includes('Catalogue imported from CSV')`);
t('customers see the imported catalogue too', `
  SESSION={user:'u_marta'}; UI={}; const html=accMerch();
  SESSION={user:'u_leo'};
  return typeof html==='string' && html.length>200`);
t('quote-only products carry no price and are flagged', `
  const q=S.merchProducts.filter(p=>p.quoteOnly);
  return q.length>0 && q.every(p=>p.from===null && (!p.breaks || p.breaks.length===0))`);
t('the listed price holds the target margin at the included spec', `
  const FIXED=1.40, TARGET=1-1/1.55;
  const bad=[];
  for(const p of S.merchProducts){
    if(p.quoteOnly) continue;
    for(const b of p.breaks){
      const inc = includedUnit(S.decoRates,b.qty,0) + includedUnit(S.decoRates,b.qty,1);
      const m = (b.price - p.cost - FIXED - inc)/b.price;
      if(m < TARGET - 0.01) bad.push(p.ref+' q'+b.qty+' '+(m*100).toFixed(1)+'%');
    }
  }
  return bad.length===0 || 'below target: '+bad.slice(0,3).join(', ')`);
t('an upgraded configuration keeps the margin, because upgrades are surcharged', `
  const FIXED=1.40;
  const bad=[];
  for(const p of S.merchProducts.slice(0,60)){
    if(p.quoteOnly || !p.pers.includes('screen') || p.pos.length<2) continue;
    for(const qty of [25,500]){
      const cfg={id:p.id,colour:p.colours[0],qty,express:false,placements:[
        {pos:p.pos[0],method:'embroidery',size:'large',colours:1},
        {pos:p.pos[1],method:'screen',size:'large',colours:4}]};
      const q=quoteLines(p,S.decoRates,cfg);
      const realDeco = placementUnit(S.decoRates,cfg.placements[0],qty)
                     + placementUnit(S.decoRates,cfg.placements[1],qty);
      const m = (q.unit - p.cost - FIXED - realDeco)/q.unit;
      if(m < 0.33) bad.push(p.ref+' q'+qty+' '+(m*100).toFixed(1)+'%');
    }
  }
  return bad.length===0 || 'thin: '+bad.slice(0,3).join(', ')`);
t('a broken file is rejected and changes nothing', `
  const n=S.merchProducts.length;
  const v=validateCatalogue('row_type,ref\\nproduct,NOPE');
  return v.ok===false && S.merchProducts.length===n`);

console.log('\n'+(fail?fail+' FAILED':'all import checks passed'));
process.exit(fail?1:0);
