#!/usr/bin/env node
/* ============================================================================
   PAMUUC — merchandise catalogue tool
   A thin wrapper. Every rule lives in ../15-csv.js, which the Studio Back
   Office import screen also uses, so the terminal and the mockup can never
   disagree about what a valid file is.

     node validate-merch-csv.mjs                        check ./merch-catalogue.csv
     node validate-merch-csv.mjs cat.csv                check a filled file
     node validate-merch-csv.mjs cat.csv --rates        print the cost grid
     node validate-merch-csv.mjs cat.csv --shopify out.csv [--dialect legacy|current]
     node validate-merch-csv.mjs --reference            rewrite merch-reference.csv
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = {console, Math, JSON, Object, Array, String, Number, Date, Intl, Set, isNaN};
vm.createContext(ctx);
for(const f of ['10-data.js', '15-csv.js'])
  vm.runInContext(fs.readFileSync(path.join(HERE, '..', f), 'utf8'), ctx);
const call = (expr) => vm.runInContext(expr, ctx);
const V = call('csvVocab()');

function cell(x){ x = x == null ? '' : String(x);
  return /[",\n]/.test(x) ? '"' + x.replace(/"/g,'""') + '"' : x; }

const argv = process.argv.slice(2);
const flag = (n) => argv.indexOf(n);
const SHOW_RATES = argv.includes('--rates');
const SHOPIFY_OUT = flag('--shopify') > -1 ? argv[flag('--shopify') + 1] : null;
const DIALECT = flag('--dialect') > -1 ? argv[flag('--dialect') + 1] : 'legacy';
const consumed = new Set([SHOPIFY_OUT, DIALECT]);
const positional = argv.find(a => !a.startsWith('--') && !consumed.has(a));

if(argv.includes('--reference')){ writeReference(); process.exit(0); }

let file = positional ? path.resolve(positional) : path.join(HERE, 'merch-catalogue.csv');
if(fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'merch-catalogue.csv');
if(!fs.existsSync(file)){ console.error(`Not found: ${file}`); process.exit(2); }

ctx.__text = fs.readFileSync(file, 'utf8');
const v = call('validateCatalogue(__text)');

console.log(`\n${file}`);
console.log(`${v.byType.product.length} products · ${v.byType.variant.length} variants · ` +
  `${v.byType.image.length} images · ${v.byType.decoration.length} decoration rows`);
console.log(`${v.byType.deco_method.length} methods · ${v.byType.deco_rate.length} rate rows\n`);

for(const r of v.report){
  const tag = r.sev === 'ERROR' ? 'ERROR' : ' warn';
  console.log(`  ${tag}  line ${String(r.line).padStart(3)}  ${String(r.col).padEnd(28)} ${r.msg}`);
}
if(v.report.length) console.log('');

if(!v.ok){
  console.log(`${v.errors} error${v.errors===1?'':'s'}, ${v.warnings} warning${v.warnings===1?'':'s'} — nothing would be imported.`);
  process.exit(1);
}
console.log(`No errors. ${v.warnings} warning${v.warnings===1?'':'s'}. ${v.index.size} products ready to import.`);

/* ---- expanded rate grid --------------------------------------------------- */
function printRates(){
  const rc = call('catalogueToRates(validateCatalogue(__text))');
  console.log('\nDecoration cost, expanded from the rate card. Cost only — margin is applied later.\n');
  for(const [meth, m] of Object.entries(rc.methods)){
    const mine = rc.rates.filter(r => r.method === meth);
    console.log(`${V.methodName(meth)}  (${meth})   setup ${m.setup == null ? 'none recorded' : m.setup.toFixed(2) + ' EUR'}   priced by ${m.pricedBy}`);
    if(m.pricedBy === 'size'){
      const range = {small:`up to ${m.bandSmall} mm`, medium:`${m.bandSmall+1}–${m.bandMedium} mm`, large:`over ${m.bandMedium} mm`};
      ['small','medium','large'].forEach(b => {
        const r = mine.find(x => x.band === b);
        if(r) console.log(`    ${b.padEnd(8)} ${String(range[b]).padEnd(14)} ${r.cost.toFixed(2)} / piece` +
          (r.provisional ? '   ← provisional' : ''));
      });
    } else {
      const cols = [1,2,3,4].filter(c => m.mult[c] != null);
      console.log('    qty       ' + cols.map(c => `${c} col`.padStart(8)).join(''));
      mine.filter(r => r.qtyMin != null).sort((a,b) => a.qtyMin - b.qtyMin).forEach(r => {
        console.log(`    ${(r.qtyMin + '+').padEnd(10)}` +
          cols.map(c => (r.cost * m.mult[c]).toFixed(2).padStart(8)).join('') +
          (r.provisional ? '   ← provisional' : ''));
      });
    }
    console.log('');
  }
}

/* ---- Shopify export ------------------------------------------------------- */
const SHOPIFY_HEADERS = {
  legacy: {handle:'Handle', title:'Title', body:'Body (HTML)', vendor:'Vendor', type:'Type',
    tags:'Tags', published:'Published', o1n:'Option1 Name', o1v:'Option1 Value',
    sku:'Variant SKU', grams:'Variant Grams', tracker:'Variant Inventory Tracker',
    qty:'Variant Inventory Qty', policy:'Variant Inventory Policy',
    fulfil:'Variant Fulfillment Service', price:'Variant Price',
    compare:'Variant Compare At Price', requiresShipping:'Variant Requires Shipping',
    taxable:'Variant Taxable', imgSrc:'Image Src', imgPos:'Image Position',
    imgAlt:'Image Alt Text', variantImg:'Variant Image', weightUnit:'Variant Weight Unit',
    cost:'Cost per item', status:'Status', giftCard:'Gift Card',
    seoTitle:'SEO Title', seoDesc:'SEO Description'},
  current: {handle:'URL handle', title:'Title', body:'Description', vendor:'Vendor', type:'Type',
    tags:'Tags', published:'Published on online store', o1n:'Option1 name', o1v:'Option1 value',
    sku:'SKU', grams:'Weight value (grams)', tracker:'Inventory tracker',
    qty:'Inventory quantity', policy:'Continue selling when out of stock',
    fulfil:'Fulfillment service', price:'Price', compare:'Compare-at price',
    requiresShipping:'Requires shipping', taxable:'Charge tax',
    imgSrc:'Product image URL', imgPos:'Image position', imgAlt:'Image alt text',
    variantImg:'Variant image URL', weightUnit:'Weight unit for display',
    cost:'Cost per item', status:'Status', giftCard:'Gift card',
    seoTitle:'SEO title', seoDesc:'SEO description'},
};
const METAFIELDS = [
  ['PAMUUC ref','pamuuc.ref', p => p.ref],
  ['Minimum order quantity','pamuuc.moq', p => p.moq],
  ['Price breaks','pamuuc.price_breaks', p => JSON.stringify(p.breaks)],
  ['Lead time','pamuuc.lead_time', p => p.lead],
  ['Personalisation methods','pamuuc.personalisation_methods', p => p.pers.join('|')],
  ['Personalisation positions','pamuuc.personalisation_positions', p => p.pos.join('|')],
  ['Materials','pamuuc.materials', p => p.materials],
  ['Care','pamuuc.care', p => p.care],
  ['Provenance','pamuuc.provenance', p => p.prov],
  ['Country of origin','pamuuc.country_of_origin', p => p.country],
  ['Decoration constraints','pamuuc.decoration', p => JSON.stringify(p.deco)],
];
function exportShopify(outPath, dialect){
  const H = SHOPIFY_HEADERS[dialect];
  if(!H){ console.error(`Unknown dialect "${dialect}" — use legacy or current`); process.exit(2); }
  const products = call('catalogueToProducts(validateCatalogue(__text))');

  const cols = [H.handle, H.title, H.body, H.vendor, H.type, H.tags, H.published,
    H.o1n, H.o1v, H.sku, H.grams, H.weightUnit, H.tracker, H.qty, H.policy, H.fulfil,
    H.price, H.compare, H.requiresShipping, H.taxable, H.cost, H.imgSrc, H.imgPos,
    H.imgAlt, H.variantImg, H.giftCard, H.seoTitle, H.seoDesc, H.status,
    ...METAFIELDS.map(([l,k]) => `${l} (product.metafields.${k})`)];

  const out = [cols.join(',')];
  let vRows = 0, iRows = 0;

  for(const p of products){
    const imgs = p.images;
    const rows = Math.max(p.variants.length || 1, imgs.length, 1);
    for(let i = 0; i < rows; i++){
      const vr = p.variants[i], im = imgs[i], first = i === 0, row = {};
      row[H.handle] = p.handle;
      if(first){
        row[H.title] = p.name; row[H.body] = p.desc;
        row[H.vendor] = 'PAMUUC'; row[H.type] = p.cat;
        row[H.tags] = [p.cat, ...p.pers.map(m => V.methodName(m))].join(', ');
        row[H.published] = p.status === 'published' ? 'TRUE' : 'FALSE';
        row[H.status] = p.status === 'published' ? 'active' : p.status === 'archived' ? 'archived' : 'draft';
        row[H.giftCard] = 'FALSE'; row[H.seoTitle] = p.name;
        row[H.seoDesc] = (p.desc || '').slice(0, 320);
        METAFIELDS.forEach(([l,k,fn]) => { row[`${l} (product.metafields.${k})`] = fn(p); });
      }
      if(vr){
        row[H.o1n] = first ? 'Colour' : ''; row[H.o1v] = V.colourName(vr.colour);
        row[H.sku] = vr.sku; row[H.grams] = p.weight || ''; row[H.weightUnit] = 'g';
        row[H.tracker] = 'shopify'; row[H.qty] = vr.stock;
        row[H.policy] = dialect === 'legacy' ? 'deny' : 'FALSE';
        row[H.fulfil] = 'manual';
        row[H.price] = p.from ? (p.from + vr.adj).toFixed(2) : '';
        row[H.requiresShipping] = 'TRUE'; row[H.taxable] = 'TRUE';
        row[H.cost] = p.cost == null ? '' : p.cost.toFixed(2);
        row[H.variantImg] = p.colourImages[vr.colour] || '';
        vRows++;
      } else if(first && !p.variants.length){
        row[H.o1n] = 'Title'; row[H.o1v] = 'Default Title';
        row[H.price] = p.from ? p.from.toFixed(2) : '';
        row[H.cost] = p.cost == null ? '' : p.cost.toFixed(2);
        row[H.tracker] = 'shopify'; row[H.qty] = '0';
        row[H.policy] = dialect === 'legacy' ? 'deny' : 'FALSE';
        row[H.fulfil] = 'manual'; row[H.requiresShipping] = 'TRUE';
        row[H.taxable] = 'TRUE'; row[H.weightUnit] = 'g'; row[H.grams] = p.weight || '';
        vRows++;
      }
      if(im){ row[H.imgSrc] = im.url; row[H.imgPos] = String(i + 1); row[H.imgAlt] = im.alt; iRows++; }
      out.push(cols.map(c => cell(row[c])).join(','));
    }
  }
  fs.writeFileSync(outPath, out.join('\n') + '\n');
  console.log(`\nWrote ${outPath}`);
  console.log(`  dialect ${dialect} · ${cols.length} columns · ${out.length - 1} rows`);
  console.log(`  ${products.length} products · ${vRows} variants · ${iRows} image rows · ${METAFIELDS.length} metafields`);
  console.log(`  price = lowest quantity break; the ladder is in pamuuc.price_breaks`);
  console.log(`  the decoration rate card is NOT exported — it is not product data`);
}

/* ---- reference sheet ------------------------------------------------------ */
function writeReference(){
  const rows = [['field','allowed value','label']];
  call('CSV_ROW_TYPES').forEach(t => rows.push(['row_type', t, `A ${t} row`]));
  V.colours.forEach(k   => rows.push(['colours / colour', k, V.colourName(k)]));
  V.methods.forEach(k   => rows.push(['personalisation_methods / method', k, V.methodName(k)]));
  V.positions.forEach(k => rows.push(['personalisation_positions / position', k, V.posName(k)]));
  V.sizes.forEach(s     => rows.push(['sizes', s, s]));
  rows.push(['sizes','One size','Unsized product']);
  call('CSV_STATUSES').forEach(s => rows.push(['status', s, s[0].toUpperCase()+s.slice(1)]));
  ['yes','no'].forEach(s => rows.push(['artwork_required / provisional', s, s]));
  ['small','medium','large'].forEach(s => rows.push(['size_band', s, s]));
  ['size','quantity'].forEach(s => rows.push(['priced_by', s, `priced by ${s}`]));
  call('CSV_BREAKS').forEach(b => rows.push(['price breaks', `price_${b}`, `Unit price at ${b}+ pieces`]));
  V.categories.forEach(c => rows.push(['category', c, 'existing category']));
  fs.writeFileSync(path.join(HERE, 'merch-reference.csv'),
    rows.map(r => r.map(cell).join(',')).join('\n') + '\n');
  console.log(`wrote merch-reference.csv — ${rows.length-1} allowed values, generated from 10-data.js`);
}

/* run the optional outputs last: the tables they use are `const`, so calling
   them from the top of the file would hit the temporal dead zone. */
if(SHOW_RATES) printRates();
if(SHOPIFY_OUT) exportShopify(SHOPIFY_OUT, DIALECT);
