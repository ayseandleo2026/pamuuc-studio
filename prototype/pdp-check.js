/* Every product page, for every product, in several configurator states.
   A throw here is a card that does nothing when a customer clicks it. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = __dirname;
const src = ['10-data.js','12-catalogue.js','15-csv.js','20-store.js','25-actions.js','30-public.js','40-account.js','50-studio.js']
  .map(f => fs.readFileSync(path.join(dir,f),'utf8')).join('\n');

const stubEl = () => ({value:'', textContent:'', innerHTML:'', classList:{add(){},remove(){},contains(){return false}},
  dataset:{}, focus(){}, checked:false, closest(){return null}, querySelector(){return null},
  querySelectorAll(){return []}, appendChild(){}, setAttribute(){}, getAttribute(){return null}});
const ctx = {
  console,
  document:{getElementById(){return null}, createElement:stubEl, body:{appendChild(){}},
    addEventListener(){}, documentElement:stubEl(), querySelector(){return null}, querySelectorAll(){return []}},
  window:{addEventListener(){}, scrollTo(){}}, location:{hash:''},
  localStorage:{getItem(){return null}, setItem(){}, removeItem(){}},
  setTimeout:()=>0, Intl, Date, Math, JSON, String, Number, Object, Array, Set, isNaN, parseInt, parseFloat,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src + '\nfunction go(){}\nfunction paintToasts(){}\nfunction render(){}', ctx);

const ids = vm.runInContext('SEED.merchProducts.map(p => p.id)', ctx);
const tabs = vm.runInContext('(typeof PDP_TABS !== "undefined" ? PDP_TABS.map(t=>t.k) : ["detail"])', ctx);

let fails = 0, warns = 0, ran = 0;
function check(label, expr){
  ran++;
  try{
    const out = vm.runInContext(expr, ctx);
    if(typeof out !== 'string') throw new Error('returned ' + typeof out);
    if(out.length < 200) throw new Error('suspiciously short: ' + out.length + ' chars');
    const probe = out.replace(/data:image\/[^"']+/g,'').replace(/data-[a-z-]+="[^"]*"/g,'');
    const m = probe.match(/.{0,50}(undefined|\[object Object\]|NaN|€NaN).{0,50}/);
    if(m){ warns++; console.log('  WARN ' + label + ' → ' + m[0].replace(/\s+/g,' ')); }
  }catch(e){ fails++; console.log('  FAIL ' + label + ' → ' + e.message); }
}

console.log('PRODUCT PAGES — ' + ids.length + ' products, default state');
vm.runInContext('SESSION = null; UI = {};', ctx);
ids.forEach(id => check(id, `pubProduct(${JSON.stringify(id)})`));

console.log('\nPRODUCT PAGES — every tab on every product');
tabs.forEach(t => {
  vm.runInContext(`UI = {pdpTab:${JSON.stringify(t)}};`, ctx);
  ids.forEach(id => check(id + ' / ' + t, `pubProduct(${JSON.stringify(id)})`));
});

console.log('\nPRODUCT PAGES — signed in as a customer, and as studio');
['u_marta','u_leo'].forEach(u => {
  vm.runInContext(`SESSION = {user:${JSON.stringify(u)}}; UI = {};`, ctx);
  ids.forEach(id => check(id + ' / ' + u, `pubProduct(${JSON.stringify(id)})`));
});

console.log('\nMISSING PRODUCT — an id that is not in the catalogue must not throw');
vm.runInContext('SESSION = null; UI = {};', ctx);
try{
  const out = vm.runInContext('pubProduct("m_does_not_exist")', ctx);
  if(typeof out !== 'string' || out.length < 50) throw new Error('returned ' + typeof out);
  console.log('  ok — renders a not-found page rather than throwing');
}catch(e){ fails++; console.log('  FAIL unknown id → ' + e.message); }

console.log('\n' + (fails ? fails + ' of ' + ran + ' product screens FAILED' : 'all ' + ran + ' product screens rendered')
  + (warns ? ' (' + warns + ' warnings)' : ''));
process.exit(fails ? 1 : 0);
