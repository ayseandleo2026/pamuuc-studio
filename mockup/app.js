/* ============================================================================
   PAMUUC SUITE — merchandise catalogue CSV
   ONE rule set, two hosts: the terminal validator and the Studio Back Office
   import screen both call validateCatalogue(). The rules cannot diverge,
   because there is only one copy of them.

   Depends on COLOURS, SIZES and SEED from 10-data.js. No fs, no process.
   ========================================================================= */

const CSV_COLUMNS = ['row_type','ref','handle','name','category','status','moq','currency',
  'price_25','price_50','price_100','price_250','price_500','cost_price',
  'lead_weeks_min','lead_weeks_max','colours','sizes',
  'personalisation_methods','personalisation_positions','artwork_required',
  'description','materials','weight_gsm','care','provenance',
  'country_of_origin','supplier','supplier_ref',
  'colour','sku','price_adjustment','stock_on_hand','reorder_point',
  'image_url','image_alt','image_position',
  'method','position','max_width_mm','max_height_mm','max_colours',
  'artwork_format','notes',
  'setup_cost','priced_by','band_small_max_mm','band_medium_max_mm',
  'mult_2_colours','mult_3_colours','mult_4_colours',
  'size_band','qty_min','unit_cost','provisional'];

const CSV_ROW_TYPES = ['product','variant','image','decoration','deco_method','deco_rate'];
const CSV_STATUSES  = ['draft','published','hidden','archived'];
const CSV_BREAKS    = [25,50,100,250,500];
const CSV_YESNO     = ['yes','no'];
const CSV_SIZE_BANDS= ['small','medium','large'];
const CSV_PRICED_BY = ['size','quantity'];

const CSV_OWNED = {
  product: ['handle','name','category','moq','currency',...CSV_BREAKS.map(b=>`price_${b}`),
    'cost_price','lead_weeks_min','lead_weeks_max','colours','sizes',
    'personalisation_methods','personalisation_positions','artwork_required',
    'description','materials','weight_gsm','care','provenance',
    'country_of_origin','supplier'],
  variant: ['sku','price_adjustment','stock_on_hand','reorder_point'],
  image: ['image_url','image_alt','image_position'],
  decoration: ['position','max_width_mm','max_height_mm','max_colours','artwork_format'],
  deco_method: ['setup_cost','priced_by','band_small_max_mm','band_medium_max_mm',
    'mult_2_colours','mult_3_colours','mult_4_colours'],
  deco_rate: ['size_band','qty_min','unit_cost','provisional'],
};
const CSV_SHARED = {
  row_type: CSV_ROW_TYPES,
  notes:    CSV_ROW_TYPES,
  ref:      ['product','variant','image','decoration'],
  status:   ['product','variant'],
  supplier_ref: ['product','variant'],
  method:   ['decoration','deco_method','deco_rate'],
  colour:   ['variant','image'],
};
function csvUsedBy(col, type){
  if(CSV_SHARED[col]) return CSV_SHARED[col].includes(type);
  return (CSV_OWNED[type] || []).includes(col);
}

/* ---- vocabularies, read from the one data model -------------------------- */
function csvVocab(){
  return {
    colours:   Object.keys(COLOURS),
    colourName:(k) => COLOURS[k] ? COLOURS[k].name : k,
    colourHex: (k) => COLOURS[k] ? COLOURS[k].hex : '#ccc',
    methods:   Object.keys(SEED.personalization),
    methodName:(k) => SEED.personalization[k] ? SEED.personalization[k].name : k,
    positions: Object.keys(SEED.positions_lib),
    posName:   (k) => SEED.positions_lib[k] || k,
    sizes:     SIZES,
    categories:[...new Set(SEED.merchProducts.map(p => p.cat))],
  };
}

/* ---- parser (RFC4180-ish: quotes, embedded commas and newlines) ---------- */
function csvParse(text){
  const rows = []; let row = [], field = '', q = false;
  text = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){
      if(c === '"'){ if(text[i+1] === '"'){ field += '"'; i++; } else q = false; }
      else field += c;
    } else if(c === '"'){ q = true; }
    else if(c === ','){ row.push(field); field = ''; }
    else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
function csvCell(v){
  v = v == null ? '' : String(v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
}

const csvList  = (s) => s ? String(s).split('|').map(x => x.trim()).filter(Boolean) : [];
const csvInt   = (s) => /^-?\d+$/.test(s);
const csvNum   = (s) => /^-?\d+(\.\d+)?$/.test(s);

/* ============================================================================
   validateCatalogue(text) → { ok, errors, warnings, report, index, byType,
                               methods, rates, head }
   Every rule in the system lives here and nowhere else.
   ========================================================================= */
function validateCatalogue(text){
  const V = csvVocab();
  const report = [];
  const err  = (line, col, msg) => report.push({sev:'ERROR', line, col, msg});
  const warn = (line, col, msg) => report.push({sev:'WARN',  line, col, msg});

  const raw = csvParse(text);
  if(!raw.length) return {ok:false, errors:1, warnings:0, head:[],
    report:[{sev:'ERROR', line:1, col:'file', msg:'the file is empty'}],
    index:new Map(), byType:{}, methods:new Map(), rates:new Map()};

  const head = raw[0].map(h => h.trim());
  const rows = raw.slice(1).map((cells, i) => {
    const o = {__line: i + 2, __n: cells.length};
    head.forEach((h, ix) => { o[h] = (cells[ix] ?? '').trim(); });
    return o;
  });

  CSV_COLUMNS.filter(h => !head.includes(h))
    .forEach(h => err(1, h, 'required column is missing'));
  head.filter(h => !CSV_COLUMNS.includes(h))
    .forEach(h => warn(1, h, 'unrecognised column — it will be ignored'));

  const index = new Map();
  const byType = {product:[], variant:[], image:[], decoration:[], deco_method:[], deco_rate:[]};

  for(const r of rows){
    /* a wide file makes a missed comma easy, and it shifts every value after
       it. Catch that before interpreting anything. */
    if(r.__n !== head.length){
      err(r.__line, 'row', `has ${r.__n} fields but the header has ${head.length} — ` +
        (r.__n < head.length ? 'a comma is missing' : 'there is an extra comma') +
        ', so the values after it are in the wrong columns');
      continue;
    }
    if(/^EXAMPLE-/i.test(r.ref)){
      err(r.__line, 'ref', 'example row — delete the EXAMPLE- rows before importing');
      continue;
    }
    if(!CSV_ROW_TYPES.includes(r.row_type)){
      err(r.__line, 'row_type', `must be one of ${CSV_ROW_TYPES.join(', ')}`);
      continue;
    }
    for(const c of CSV_COLUMNS){
      if(r[c] !== '' && r[c] !== undefined && !csvUsedBy(c, r.row_type))
        warn(r.__line, c, `not used by a ${r.row_type} row — it will be ignored`);
    }
    byType[r.row_type].push(r);
  }

  /* ---- products -------------------------------------------------------- */
  for(const r of byType.product){
    const L = r.__line, E = (c,m) => err(L,c,m), W = (c,m) => warn(L,c,m);

    if(!r.ref) E('ref', 'required');
    else if(!/^MP-\d{2,4}$/.test(r.ref)) E('ref', `"${r.ref}" must look like MP-01`);
    else if(index.has(r.ref)) E('ref', `duplicate of line ${index.get(r.ref).__line}`);
    if(r.ref && !index.has(r.ref)) index.set(r.ref, r);

    if(!r.name) E('name', 'required');
    else if(r.name.length > 80) W('name', `${r.name.length} characters — long names truncate on the listing card`);

    if(!r.handle) E('handle', 'required — this is the public URL slug, on Shopify and on our site');
    else if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.handle))
      E('handle', `"${r.handle}" must be lower-case letters, numbers and single hyphens only`);
    else if(r.handle.length > 60) W('handle', `${r.handle.length} characters — long handles make ugly URLs`);

    if(!r.category) E('category', 'required');
    else if(!V.categories.includes(r.category))
      W('category', `"${r.category}" is a new category — it will create a new filter on the catalogue`);

    if(!CSV_STATUSES.includes(r.status)) E('status', `must be one of ${CSV_STATUSES.join(', ')}`);
    if(!csvInt(r.moq) || +r.moq < 1) E('moq', 'must be a whole number of 1 or more');
    if(!/^[A-Z]{3}$/.test(r.currency)) E('currency', 'must be a 3-letter code, e.g. EUR');

    const prices = CSV_BREAKS.map(b => ({b, col:`price_${b}`, raw:r[`price_${b}`]}))
      .filter(p => p.raw !== '');
    /* A product with no price break at all is a quote-only product: we show it
       and price it when the inquiry arrives. That is a deliberate state, not a
       missing value, so it warns rather than failing the import. */
    if(!prices.length) W('price_25', 'no price breaks — this product will show "Price on request" and be quoted on inquiry');
    prices.forEach(p => { if(!csvNum(p.raw) || +p.raw <= 0) E(p.col, 'must be a positive number'); });
    const ok = prices.filter(p => csvNum(p.raw) && +p.raw > 0);
    for(let i = 1; i < ok.length; i++){
      if(+ok[i].raw > +ok[i-1].raw)
        E(ok[i].col, `${ok[i].raw} is higher than ${ok[i-1].col} (${ok[i-1].raw}) — price must not rise with quantity`);
    }
    if(ok.length && csvInt(r.moq)){
      const lowest = ok[0].b;
      if(+r.moq > lowest) W('moq', `minimum is ${r.moq} but the first price break is ${lowest} — the ${lowest} break can never be bought`);
      if(+r.moq < lowest) W('moq', `minimum is ${r.moq} but the cheapest break starts at ${lowest} — orders below ${lowest} have no price`);
    }
    if(r.cost_price !== ''){
      if(!csvNum(r.cost_price)) E('cost_price', 'must be a number');
      else if(ok.length && +r.cost_price >= +ok[ok.length-1].raw)
        E('cost_price', `${r.cost_price} is not below the highest-quantity price (${ok[ok.length-1].raw}) — that break sells at a loss`);
    }

    const lo = r.lead_weeks_min, hi = r.lead_weeks_max;
    if(!csvInt(lo) || +lo < 1) E('lead_weeks_min', 'must be a whole number of weeks');
    if(!csvInt(hi) || +hi < 1) E('lead_weeks_max', 'must be a whole number of weeks');
    if(csvInt(lo) && csvInt(hi) && +lo > +hi) E('lead_weeks_max', `${hi} is earlier than lead_weeks_min (${lo})`);

    const cols = csvList(r.colours);
    if(!cols.length) E('colours', 'at least one colour is required');
    cols.forEach(c => { if(!V.colours.includes(c)) E('colours', `"${c}" is not a known colour key`); });
    if(new Set(cols).size !== cols.length) E('colours', 'the same colour is listed twice');

    const szs = csvList(r.sizes);
    if(!szs.length) E('sizes', 'required — use "One size" if the product is not sized');
    szs.forEach(s => { if(s !== 'One size' && !V.sizes.includes(s)) E('sizes', `"${s}" is not a known size`); });
    if(szs.includes('One size') && szs.length > 1) E('sizes', '"One size" cannot be combined with other sizes');

    const ms = csvList(r.personalisation_methods);
    if(!ms.length) E('personalisation_methods', 'at least one method is required');
    ms.forEach(m => { if(!V.methods.includes(m)) E('personalisation_methods', `"${m}" is not a known method`); });

    const ps = csvList(r.personalisation_positions);
    if(!ps.length) E('personalisation_positions', 'at least one position is required');
    ps.forEach(p => { if(!V.positions.includes(p)) E('personalisation_positions', `"${p}" is not a known position`); });

    if(!CSV_YESNO.includes(r.artwork_required)) E('artwork_required', 'must be yes or no');
    if(!r.description) E('description', 'required');
    else if(r.description.length < 40) W('description', `${r.description.length} characters — too thin for the product page`);
    if(r.weight_gsm !== '' && !csvInt(r.weight_gsm)) E('weight_gsm', 'must be a whole number');
    if(r.provenance && !r.country_of_origin)
      W('country_of_origin', 'a provenance claim without a country cannot be substantiated');
  }

  /* ---- variants -------------------------------------------------------- */
  const pair = new Map(), skus = new Map();
  for(const r of byType.variant){
    const L = r.__line, E = (c,m) => err(L,c,m);
    const p = index.get(r.ref);
    if(!r.ref) E('ref', 'required — a variant row must name the product it belongs to');
    else if(!p) E('ref', `"${r.ref}" has no product row in this file`);

    if(!r.colour) E('colour', 'required');
    else if(!V.colours.includes(r.colour)) E('colour', `"${r.colour}" is not a known colour key`);
    else if(p && !csvList(p.colours).includes(r.colour))
      E('colour', `"${r.colour}" is not listed in the colours column of ${r.ref} (line ${p.__line})`);

    const key = r.ref + '/' + r.colour;
    if(pair.has(key)) E('colour', `${r.ref} already has a ${r.colour} row on line ${pair.get(key)}`);
    pair.set(key, L);

    if(r.sku){
      if(skus.has(r.sku)) E('sku', `duplicate of line ${skus.get(r.sku)}`);
      skus.set(r.sku, L);
    }
    if(!CSV_STATUSES.includes(r.status)) E('status', `must be one of ${CSV_STATUSES.join(', ')}`);
    if(r.price_adjustment !== '' && !csvNum(r.price_adjustment)) E('price_adjustment', 'must be a number (may be negative)');
    ['stock_on_hand','reorder_point'].forEach(c => {
      if(r[c] !== '' && (!csvInt(r[c]) || +r[c] < 0)) E(c, 'must be 0 or a positive whole number');
    });
    if(csvInt(r.stock_on_hand) && csvInt(r.reorder_point) && +r.stock_on_hand <= +r.reorder_point && r.status === 'published')
      warn(L, 'stock_on_hand', `at or below the reorder point (${r.reorder_point}) while published`);
  }

  /* ---- images ---------------------------------------------------------- */
  const seenImg = new Map(), seenUrl = new Map();
  for(const r of byType.image){
    const L = r.__line, E = (c,m) => err(L,c,m), W = (c,m) => warn(L,c,m);
    const p = index.get(r.ref);
    if(!r.ref) E('ref', 'required — an image row must name the product it belongs to');
    else if(!p) E('ref', `"${r.ref}" has no product row in this file`);

    if(!r.image_url) E('image_url', 'required');
    else if(!/^https:\/\/\S+$/.test(r.image_url))
      E('image_url', 'must be a full https:// URL — Shopify fetches the file from this address, it is not a local filename');
    else if(!/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(r.image_url))
      W('image_url', 'does not end in a recognised image extension — check it points at the file, not a page');

    if(r.image_position !== ''){
      if(!csvInt(r.image_position) || +r.image_position < 1)
        E('image_position', 'must be 1 or more — 1 is the thumbnail');
    } else W('image_position', 'blank — ordering will be whatever the import happens to do');

    if(!r.image_alt) W('image_alt', 'blank — alt text is required for accessibility and read by search engines');
    else if(r.image_alt.length > 512) E('image_alt', 'Shopify caps alt text at 512 characters');

    if(r.colour){
      if(!V.colours.includes(r.colour)) E('colour', `"${r.colour}" is not a known colour key`);
      else if(p && !csvList(p.colours).includes(r.colour))
        E('colour', `"${r.colour}" is not listed in the colours column of ${r.ref} (line ${p.__line})`);
    }

    const key = r.ref + '/' + (r.colour || '_product') + '/' + r.image_position;
    if(seenImg.has(key)) E('image_position', `${r.ref} already has position ${r.image_position} on line ${seenImg.get(key)}`);
    seenImg.set(key, L);
    if(r.image_url && seenUrl.has(r.image_url))
      W('image_url', `the same URL is used on line ${seenUrl.get(r.image_url)}`);
    if(r.image_url) seenUrl.set(r.image_url, L);
  }
  for(const [ref, p] of index){
    if(!byType.image.some(i => i.ref === ref))
      warn(p.__line, 'ref', `${ref} has no image row — it will publish without a photograph`);
  }

  /* ---- decoration ------------------------------------------------------ */
  const trip = new Map();
  for(const r of byType.decoration){
    const L = r.__line, E = (c,m) => err(L,c,m);
    const p = index.get(r.ref);
    if(!r.ref) E('ref', 'required — a decoration row must name the product it belongs to');
    else if(!p) E('ref', `"${r.ref}" has no product row in this file`);

    if(!V.methods.includes(r.method)) E('method', `"${r.method}" is not a known method`);
    else if(p && !csvList(p.personalisation_methods).includes(r.method))
      E('method', `"${r.method}" is not offered on ${r.ref} (line ${p.__line})`);

    if(!V.positions.includes(r.position)) E('position', `"${r.position}" is not a known position`);
    else if(p && !csvList(p.personalisation_positions).includes(r.position))
      E('position', `"${r.position}" is not offered on ${r.ref} (line ${p.__line})`);

    const key = [r.ref, r.method, r.position].join('/');
    if(trip.has(key)) E('position', `duplicate of line ${trip.get(key)}`);
    trip.set(key, L);

    ['max_width_mm','max_height_mm'].forEach(c => {
      if(!csvInt(r[c]) || +r[c] <= 0) E(c, 'must be a positive whole number of millimetres');
    });
    if(!csvInt(r.max_colours) || +r.max_colours < 1) E('max_colours', 'must be 1 or more');
    else if(r.method === 'embroidery' && +r.max_colours > 15)
      warn(L, 'max_colours', `${r.max_colours} colours is beyond what most embroidery heads run in one pass`);
  }

  /* ---- rate card ------------------------------------------------------- */
  const methods = new Map(), rates = new Map();
  for(const r of byType.deco_method){
    const L = r.__line, E = (c,m) => err(L,c,m), W = (c,m) => warn(L,c,m);
    if(r.ref) E('ref', 'a deco_method row is studio-wide — leave ref blank');
    if(!r.method) E('method', 'required');
    else if(!V.methods.includes(r.method)) E('method', `"${r.method}" is not a known method`);
    else if(methods.has(r.method)) E('method', `duplicate of line ${methods.get(r.method).__line}`);
    if(r.method && !methods.has(r.method)) methods.set(r.method, r);

    if(!CSV_PRICED_BY.includes(r.priced_by))
      E('priced_by', `must be ${CSV_PRICED_BY.join(' or ')} — it decides whether the rate rows use size_band or qty_min`);
    if(r.setup_cost === '') W('setup_cost', 'no setup cost recorded — quotes for this method will omit it');
    else if(!csvNum(r.setup_cost) || +r.setup_cost < 0) E('setup_cost', 'must be 0 or a positive number');

    if(r.priced_by === 'size'){
      ['band_small_max_mm','band_medium_max_mm'].forEach(c => {
        if(!csvInt(r[c]) || +r[c] <= 0) E(c, 'required for a size-priced method — the band ceiling in millimetres');
      });
      if(csvInt(r.band_small_max_mm) && csvInt(r.band_medium_max_mm) && +r.band_small_max_mm >= +r.band_medium_max_mm)
        E('band_medium_max_mm', `${r.band_medium_max_mm} is not above band_small_max_mm (${r.band_small_max_mm})`);
    }
    const mults = [2,3,4].map(n => ({n, col:`mult_${n}_colours`, raw:r[`mult_${n}_colours`]}))
      .filter(m => m.raw !== '');
    mults.forEach(m => {
      if(!csvNum(m.raw)) E(m.col, 'must be a number');
      else if(+m.raw < 1) E(m.col, `${m.raw} is below 1 — more colours cannot cost less than one colour`);
    });
    const okm = mults.filter(m => csvNum(m.raw) && +m.raw >= 1);
    for(let i = 1; i < okm.length; i++){
      if(+okm[i].raw < +okm[i-1].raw)
        E(okm[i].col, `${okm[i].raw} is below ${okm[i-1].col} (${okm[i-1].raw}) — cost must not fall as colours are added`);
    }
  }

  for(const r of byType.deco_rate){
    const L = r.__line, E = (c,m) => err(L,c,m), W = (c,m) => warn(L,c,m);
    const m = methods.get(r.method);
    if(r.ref) E('ref', 'a deco_rate row is studio-wide — leave ref blank');
    if(!r.method) E('method', 'required');
    else if(!V.methods.includes(r.method)) E('method', `"${r.method}" is not a known method`);
    else if(!m) E('method', `"${r.method}" has no deco_method row — add one so the rate knows how it is priced`);

    if(!csvNum(r.unit_cost) || +r.unit_cost <= 0) E('unit_cost', 'must be a positive number');
    if(r.provisional !== '' && !CSV_YESNO.includes(r.provisional)) E('provisional', 'must be yes or no');
    else if(r.provisional === 'yes') W('unit_cost', 'marked provisional — confirm before it is used in a quote');
    if(!m) continue;

    if(m.priced_by === 'size'){
      if(!CSV_SIZE_BANDS.includes(r.size_band))
        E('size_band', `${r.method} is priced by size — must be one of ${CSV_SIZE_BANDS.join(', ')}`);
      if(r.qty_min !== '') E('qty_min', `${r.method} is priced by size, not quantity — leave qty_min blank`);
    } else if(m.priced_by === 'quantity'){
      if(!csvInt(r.qty_min) || +r.qty_min < 1)
        E('qty_min', `${r.method} is priced by quantity — give the lowest quantity this rate applies to`);
      if(r.size_band !== '') E('size_band', `${r.method} is priced by quantity, not size — leave size_band blank`);
    }
    const key = [r.method, r.size_band, r.qty_min].join('/');
    if(rates.has(key)) E(m.priced_by === 'size' ? 'size_band' : 'qty_min', `duplicate of line ${rates.get(key).__line}`);
    else rates.set(key, r);
  }

  /* every advertised method must be costable */
  const usedMethods = new Map();
  for(const [, p] of index)
    csvList(p.personalisation_methods).forEach(m => { if(!usedMethods.has(m)) usedMethods.set(m, p.__line); });
  for(const [meth, where] of usedMethods){
    if(!methods.has(meth))
      warn(where, 'personalisation_methods', `"${meth}" is offered but has no deco_method row — it cannot be costed`);
    else if(![...rates.values()].some(r => r.method === meth))
      warn(methods.get(meth).__line, 'method', `"${meth}" has no rate rows — it cannot be costed`);
  }
  for(const [meth, m] of methods){
    const mine = [...rates.values()].filter(r => r.method === meth);
    if(!mine.length){ warn(m.__line, 'method', `no rate rows for "${meth}"`); continue; }
    if(m.priced_by === 'size'){
      CSV_SIZE_BANDS.forEach(b => {
        if(!mine.some(r => r.size_band === b))
          warn(m.__line, 'method', `"${meth}" has no ${b} rate — artwork in that band cannot be costed`);
      });
    }
    if(m.priced_by === 'quantity'){
      const ladder = mine.filter(r => csvInt(r.qty_min)).sort((a,b) => +a.qty_min - +b.qty_min);
      for(let i = 1; i < ladder.length; i++){
        if(+ladder[i].unit_cost > +ladder[i-1].unit_cost)
          err(ladder[i].__line, 'unit_cost',
            `${ladder[i].unit_cost} at ${ladder[i].qty_min}+ is higher than ${ladder[i-1].unit_cost} at ${ladder[i-1].qty_min}+ — cost must not rise with quantity`);
        const prev = +ladder[i-1].qty_min, next = +ladder[i].qty_min;
        if(next > prev * 4 && next - prev > 50)
          warn(ladder[i].__line, 'qty_min',
            `no rate between ${prev} and ${next} — an order of ${prev*2} would be costed at the ${prev}+ rate (${ladder[i-1].unit_cost})`);
      }
      if(ladder.length && +ladder[0].qty_min > 1)
        warn(ladder[0].__line, 'qty_min', `the ladder starts at ${ladder[0].qty_min} — orders below that have no rate`);
    }
  }

  report.sort((a,b) => a.line - b.line);
  const errors = report.filter(r => r.sev === 'ERROR').length;
  return {ok: errors === 0, errors, warnings: report.length - errors,
    report, index, byType, methods, rates, head};
}

/* ============================================================================
   catalogueToProducts() — turn a validated file into the shape the suite's
   merchandise screens already consume, so imported products behave exactly
   like the seeded ones.
   ========================================================================= */
const CAT_GLYPH = {Bags:'👜', Headwear:'🧢', Apparel:'👕', Drinkware:'🍶',
  Stationery:'📓', Service:'🩱', Outerwear:'🧥', Kitchen:'👨‍🍳'};

function catalogueToProducts(v){
  const out = [];
  for(const [ref, p] of v.index){
    const variants = v.byType.variant.filter(x => x.ref === ref);
    const images = v.byType.image.filter(x => x.ref === ref)
      .sort((a,b) => (+a.image_position || 99) - (+b.image_position || 99));
    const deco = v.byType.decoration.filter(x => x.ref === ref);
    const breaks = CSV_BREAKS.map(b => ({qty:b, price:p[`price_${b}`]}))
      .filter(x => x.price !== '').map(x => ({qty:x.qty, price:+x.price}));

    out.push({
      id: 'm_' + p.handle.replace(/-/g,'_'),
      ref, ss: p.supplier_ref || '', handle: p.handle, name: p.name, cat: p.category,
      glyph: CAT_GLYPH[p.category] || '▧',
      colours: csvList(p.colours),
      moq: +p.moq || 1,
      from: breaks.length ? breaks[0].price : null,
      quoteOnly: breaks.length === 0,
      breaks,
      lead: `${p.lead_weeks_min}–${p.lead_weeks_max} weeks`,
      pers: csvList(p.personalisation_methods),
      pos: csvList(p.personalisation_positions),
      prov: p.provenance || '',
      country: p.country_of_origin || '',
      materials: p.materials || '',
      care: p.care || '',
      weight: p.weight_gsm || '',
      desc: p.description,
      status: p.status,
      cost: p.cost_price === '' ? null : +p.cost_price,
      images: images.filter(i => !i.colour).map(i => ({url:i.image_url, alt:i.image_alt})),
      colourImages: Object.fromEntries(images.filter(i => i.colour).map(i => [i.colour, i.image_url])),
      variants: variants.map(x => ({colour:x.colour, sku:x.sku, stock:+x.stock_on_hand || 0,
        adj:+x.price_adjustment || 0, status:x.status})),
      deco: deco.map(d => ({method:d.method, position:d.position,
        w:+d.max_width_mm || null, h:+d.max_height_mm || null,
        colours:+d.max_colours || null, artwork:d.artwork_format})),
      imported: true,
    });
  }
  return out;
}

/* rate card → a lookup the suite can cost against */
function catalogueToRates(v){
  const methods = {}, rates = [], mult = 1.55;
  for(const [k, m] of v.methods){
    methods[k] = {setup: m.setup_cost === '' ? null : +m.setup_cost,
      pricedBy: m.priced_by,
      bandSmall: +m.band_small_max_mm || null, bandMedium: +m.band_medium_max_mm || null,
      mult: {1:1, 2:+m.mult_2_colours || null, 3:+m.mult_3_colours || null, 4:+m.mult_4_colours || null}};
  }
  for(const r of v.rates.values())
    rates.push({method:r.method, band:r.size_band || null,
      qtyMin: r.qty_min === '' ? null : +r.qty_min,
      cost:+r.unit_cost, provisional: r.provisional === 'yes'});
  return {mult, methods, rates};
}

/* ---- configurator pricing -------------------------------------------------
   The list price carries ONE placement at the included spec — screen, one ink
   colour, small — as the returned sheet sets it. Every other placement, and
   anything above that spec, is priced on top of the garment. */
/* "XXS · XS · S · M · L · XL · 2XL · 3XL · 4XL · 5XL" is a wall; the two ends
   of the run say the same thing. Sizes arrive in the supplier's own order, so
   trust it rather than re-sorting into a scale we do not own. */
/* Before a cloth is chosen the page carried a single weight — the cheapest
   option's — while offering eleven. Show the span until one is picked. */
function weightLabel(p, row){
  if(row && row.w) return row.w + ' g/m²';
  const ws = [...new Set((p.matrix || []).map(m => +m.w).filter(Boolean))].sort((a,b) => a - b);
  if(!ws.length) return p.weight ? p.weight + ' g/m²' : '';
  return (ws.length === 1 ? ws[0] : ws[0] + '–' + ws[ws.length - 1]) + ' g/m²';
}
function sizeRange(sizes){
  const xs = (sizes || []).filter(Boolean);
  if(!xs.length) return '';
  return xs.length === 1 ? xs[0] : xs[0] + '–' + xs[xs.length - 1];
}
const SIZE_MM = {small:80, medium:130, large:200};
/* Say what the price actually covers, from the rate card rather than from a
   sentence written when it covered something else. */
function includedNote(rc){
  const i = rc && rc.included;
  if(!i || !i.placements) return 'personalisation priced separately';
  const meth = (SEED.personalization[i.method] || {}).name || i.method;
  return 'includes ' + nWord(i.placements) + ' placement' + (i.placements === 1 ? '' : 's')
    + ' — ' + meth.toLowerCase() + ', ' + (i.ink || 1) + ' colour, ' + (i.band || 'small');
}
function includedShort(rc){
  const i = rc && rc.included;
  if(!i || !i.placements) return 'none included';
  return i.placements === 1 ? 'one included' : nWord(i.placements) + ' included';
}
const STD = {method:'embroidery', size:'small', colours:1};

function placementUnit(rc, pl, qty){
  const c = decoCost(rc, pl.method, qty, pl.colours || 1, SIZE_MM[pl.size] || 80);
  return c && c.unit != null ? c.unit : 0;
}
/* What the list price already covers. The sheet says one placement, screen,
   one ink colour, small — not the two the prototype used to give away. */
function includedUnit(rc, qty, slot){
  const inc = rc.included;
  if(!inc || slot >= (inc.placements || 0)) return 0;
  return placementUnit(rc, {method:inc.method, size:inc.band || 'small', colours:inc.ink || 1}, qty);
}
/* a method we cannot price yet — it goes on the request, not on the total */
function methodQuoteOnly(rc, method){
  const m = rc && rc.methods && rc.methods[method];
  return !!(m && m.status && m.status !== 'priced');
}
function quoteLines(p, rc, cfg){
  const qty = cfg.qty, out = {lines:[], setup:[], unit:0, setupTotal:0};
  if(!p.breaks || !p.breaks.length) return out;
  const b = p.breaks.filter(x => x.qty <= qty).pop() || p.breaks[0];
  out.base = b.price;
  out.lines.push({label:'Garment, printed', note:includedNote(rc), unit:b.price});

  (cfg.placements || []).forEach((pl, i) => {
    const full = placementUnit(rc, pl, qty);
    const inc  = includedUnit(rc, qty, i);
    /* the rate card is priced, not costed — nothing is marked up here */
    const extra = Math.max(0, full - inc);
    if(methodQuoteOnly(rc, pl.method)){
      /* no rate exists for this one yet, and a placement that prices to zero
         would read as included rather than as unanswered */
      out.lines.push({
        label:(SEED.positions_lib[pl.pos] || pl.pos),
        note:((SEED.personalization[pl.method] || {}).name || pl.method) + ', ' + pl.size
             + ' — priced when we review the artwork',
        unit:0, quote:true});
    } else if(extra > 0.004) out.lines.push({
      label: (SEED.positions_lib[pl.pos] || pl.pos),
      note: (SEED.personalization[pl.method] || {}).name + ', ' + pl.size +
            (pl.method === 'screen' ? ', ' + pl.colours + ' colour' + (pl.colours>1?'s':'') : '') +
            (i > 1 ? ' — third placement' : ' — above the included spec'),
      unit: extra});
  });

  const methods = [...new Set((cfg.placements || []).map(x => x.method))];
  methods.forEach(m => {
    const meta = rc.methods[m];
    const s = meta ? meta.setup : null;
    out.setup.push({method:m, name:(SEED.personalization[m]||{}).name || m,
                    cost:s, unknown:s == null});
    if(s) out.setupTotal += s;
  });

  out.unit = out.lines.reduce((t,l) => t + l.unit, 0);
  out.goods = out.unit * qty;
  out.total = out.goods + out.setupTotal;
  out.effective = out.total / qty;
  return out;
}

/* decoration cost for a given method, quantity, colours and artwork size */
/* The rate card supplies selling prices directly — the old cost x 1.55 markup
   is gone — and screen print is an exact lookup on quantity AND ink colours
   rather than a percentage applied to a one-colour rate. A method with no
   price is not free: it comes back marked for quoting. */
function decoCost(rc, method, qty, colours, longestMm){
  const m = rc.methods[method];
  if(!m) return null;
  if(m.status && m.status !== 'priced') return {setup:m.setup, unit:null, quote:true};
  let unit = null, provisional = false;
  if(m.pricedBy === 'size'){
    const band = longestMm == null ? 'small'
      : longestMm <= (m.bandSmall || 99) ? 'small'
      : longestMm <= (m.bandMedium || 150) ? 'medium' : 'large';
    const r = rc.rates.find(x => x.method === method && x.band === band);
    if(r){ unit = r.price; provisional = r.provisional; }
  } else {
    const ink = Math.min(Math.max(colours || 1, 1), m.maxColours || 4);
    const ladder = rc.rates.filter(x => x.method === method && x.ink === ink && x.qtyMin != null)
      .sort((a,b) => a.qtyMin - b.qtyMin);
    let hit = ladder.length ? ladder[0] : null;
    for(const r of ladder) if(qty >= r.qtyMin) hit = r;
    if(hit){ unit = hit.price; provisional = hit.provisional; }
  }
  if(unit == null) return {setup:m.setup, unit:null, quote:true};
  return {setup: m.setup, unit, total: (m.setup || 0) + unit * qty, provisional};
}
/* ============================================================================
   PAMUUC SUITE — store, permissions, projections
   One dataset. One emit(). Three views. Nothing else may write state.
   ========================================================================= */

/* Sort every colour list in the catalogue once, here, rather than at each of
   the places that paint swatches — the product page, the cards, the rail, the
   builder — because one of those is always the one that gets forgotten. A key
   the ranking has never seen keeps its position, after the ranked ones. */
function orderColours(store){
  if(typeof COLOUR_RANK === 'undefined') return;
  const rank = (k) => (COLOUR_RANK[k] == null ? 1e6 : COLOUR_RANK[k]);
  const sort = (xs) => Array.isArray(xs)
    ? xs.slice().sort((a, b) => rank(a) - rank(b) || xs.indexOf(a) - xs.indexOf(b))
    : xs;
  ((store && store.merchProducts) || []).forEach(p => {
    if(p.colours) p.colours = sort(p.colours);
    (p.matrix || []).forEach(m => { if(m.colours) m.colours = sort(m.colours); });
  });
}
try{ orderColours(SEED); }catch(e){}

/* A quantity bracket that costs the same as the one before it is not an offer,
   it is a row in a table — and shown as a card beside real savings it reads as
   one, so someone orders 500 believing it bought them something. Every ladder
   here was padded out to a top bracket of 500 whether or not the price moved,
   so the tail that stops improving is cut: past the last real saving there is
   nothing to choose between, and the customer types the quantity they need.
   Run over the seed once, before anything reads a price or counts a bracket. */
function trimLadder(bs){
  if(!Array.isArray(bs) || bs.length < 2) return bs;
  let last = 0;
  for(let i = 1; i < bs.length; i++) if(bs[i].price < bs[i - 1].price) last = i;
  return last === bs.length - 1 ? bs : bs.slice(0, last + 1);
}
(SEED.merchProducts || []).forEach(p => {
  p.breaks = trimLadder(p.breaks);
  (p.matrix || []).forEach(m => { m.breaks = trimLadder(m.breaks); });
  /* the description quotes a top bracket that has just moved under it */
  const top = (p.breaks || []).length ? p.breaks[p.breaks.length - 1].qty : null;
  if(p.desc) p.desc = top
    ? p.desc.replace(/Final quantity bracket: \d+\+ pieces\./,
        'Best price from ' + top + ' pieces \u2014 above that, tell us the exact quantity you need.')
    : p.desc.replace(/\s*Final quantity bracket: \d+\+ pieces\./, '');
});

let S = JSON.parse(JSON.stringify(SEED));
/* the generated catalogue ships its rate card with it */
if(S.decoRatesSeed){ S.decoRates = S.decoRatesSeed; }
let SESSION = null;          // {user, surface}
let ROUTE = {surface:'public', page:'home', params:{}};
let UI = {};                 // transient per-screen scratch (form drafts etc.)
const TOASTS = [];

/* ---- tiny helpers ------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const by = (arr, id) => arr.find(x => x.id === id);
const user = (id) => by(S.users, id) || {name:'System', init:'··', role:'system'};
const account = (id) => by(S.accounts, id);
const project = (id) => by(S.projects, id);
const garment = (id) => by(S.garments, id);
const base = (id) => by(S.bases, id);
const doc = (id) => by(S.documents, id);
const stageDef = (id) => STAGES.find(s => s.id === id);
const st = (k) => STATUS[k] || {label:k, fam:'idle', say:''};
const money = (n, cur) => n == null ? '—' :
  new Intl.NumberFormat('en-GB',{style:'currency',currency:cur||'EUR',minimumFractionDigits:2}).format(n);
/* every product now takes a minimum of one, so "1 pieces" is reachable copy */
const pcs = (n) => n + (Number(n) === 1 ? ' piece' : ' pieces');
/* Catalogue copy counts the families on the page rather than asserting a
   number, so it stays true while the catalogue is being replaced. */
const NWORD = ['no','one','two','three','four','five','six','seven','eight','nine','ten'];
const nWord = (n) => NWORD[n] || String(n);
const nWordCap = (n) => { const w = nWord(n); return w.charAt(0).toUpperCase() + w.slice(1); };
const uid = (p) => p + '_' + Math.random().toString(36).slice(2,8);

function dateShort(d){
  if(!d) return '—';
  const dt = new Date(String(d).replace(' ','T'));
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}
function dateTime(d){
  if(!d) return '—';
  const dt = new Date(String(d).replace(' ','T'));
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'}) + ', ' +
         dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}
function ago(d){
  if(!d) return '—';
  const dt = new Date(String(d).replace(' ','T'));
  if(isNaN(dt)) return d;
  const days = Math.round((new Date(S.today) - dt)/86400000);
  if(days <= 0) return 'today';
  if(days === 1) return 'yesterday';
  if(days < 30) return days + ' days ago';
  if(days < 60) return 'last month';
  return Math.round(days/30) + ' months ago';
}
function nowStamp(){
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return `${S.today} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---- the one status component ----------------------------------------- */
function pill(key, extra){
  const s = st(key);
  return `<span class="pill pill--${s.fam}"${extra ? ' title="'+esc(extra)+'"' : ''}>${esc(s.label)}</span>`;
}
function pillMerch(text){ return `<span class="pill pill--merch">${esc(text)}</span>`; }

/* ============================================================================
   PERMISSIONS — role template × scope × module × action
   One function. Every surface asks it; none of them decide for themselves.
   ========================================================================= */
const ROLE_NAMES = {
  master:'Master', am:'Account Manager', finance:'Finance Director',
  cust_admin:'Account Admin', cust_member:'Member',
};

function can(u, module, action, ctx){
  if(!u) return false;
  const r = u.role;
  ctx = ctx || {};

  if(r === 'master') return true;

  if(r === 'am'){
    const mine = !ctx.project || project(ctx.project)?.am === u.id;
    switch(module){
      case 'cost_margin':        return false;
      case 'settings': case 'team': case 'audit_all': return false;
      case 'merch_publish':      return false;
      case 'phase_override':     return false;
      case 'phase_advance':      return mine;
      case 'project':            return mine;
      case 'change_request':     return mine;
      case 'publish':            return mine;
      case 'invoice':            return action === 'view';
      case 'payments':           return action === 'view';
      case 'finance':            return action === 'view' && mine;
      default:                   return true;
    }
  }

  if(r === 'finance'){
    switch(module){
      case 'finance': case 'invoice': case 'cost_margin': case 'payments': return true;
      case 'project':        return action === 'view';
      case 'phase_advance': case 'phase_override': case 'publish': return false;
      case 'change_request': return action === 'view';
      case 'team': case 'settings': case 'merch_publish': return false;
      case 'audit_all':      return action === 'view';
      default:               return action === 'view';
    }
  }

  /* customers */
  if(r === 'cust_admin' || r === 'cust_member'){
    const acc = account(u.account);
    if(module === 'create_project')  return false;            // §5.3 — never
    /* A customer can say they have sent a transfer. Only the studio can say it
       arrived — that is a fact about the bank, not about the customer. */
    if(module === 'payments')        return action !== 'settle' && r === 'cust_admin' && acc.modules.payments;
    if(module === 'approve')         return r === 'cust_admin' || (ctx.project && (u.projects||[]).includes(ctx.project));
    if(module === 'customer_team')   return r === 'cust_admin';
    if(module === 'merchandise')     return acc.modules.merchandise;
    if(module === 'project')         return r === 'cust_admin' || (u.projects||[]).includes(ctx.project);
    if(module === 'change_request')  return true;             // draft + submit
    return true;
  }
  return false;
}

/* ============================================================================
   EVENTS — one emit(). Rules decide activity / notification / task / audit.
   ========================================================================= */
/* Who a message to an account actually reaches: its administrator, or the
   first person on it. One place, so every template addresses the same person. */
function accEmail(acc){
  if(!acc) return '';
  const u = S.users.find(x => x.account === acc.id && x.role === 'cust_admin')
         || S.users.find(x => x.account === acc.id);
  if(!u) return '';
  return u.email || (String(u.name).toLowerCase().replace(/[^a-z0-9.]+/g, '.') + '@' +
    String(acc.name).toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com');
}

/* A time offered for a call, written the way someone reads it in a message
   rather than the way a database stores it. */
function slotLabel(iso){
  const d = new Date(iso);
  if(isNaN(d)) return String(iso);
  const day = d.toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
  const time = d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
  return day + ' at ' + time;
}
/* Four working times, starting the day after tomorrow — enough notice to be
   answerable, close enough to still be this week. */
function nextSlots(){
  const out = [], d = new Date();
  d.setDate(d.getDate() + 2); d.setMinutes(0, 0, 0);
  const hours = [10, 12, 15, 17];
  let i = 0;
  while(out.length < 4){
    const day = new Date(d); day.setDate(d.getDate() + Math.floor(i / 2));
    if(day.getDay() !== 0 && day.getDay() !== 6){
      day.setHours(hours[out.length % hours.length]);
      out.push(day.toISOString());
    }
    i++;
    if(i > 20) break;
  }
  return out;
}

function emit(type, o){
  o = o || {};
  const ev = {
    id: uid('ev'), type, at: o.at || nowStamp(),
    actor: o.actor || (SESSION && SESSION.user) || 'system',
    account: o.account || null, project: o.project || null,
    text: o.text || type, customerVisible: o.customerVisible !== false,
  };
  S.events.unshift(ev);

  if(o.notify){
    S.notifications.unshift({
      id: uid('nt'), at: ev.at, to: o.notify,          // 'customer' | 'studio' | both
      kind: o.kind || 'update', text: o.notifyText || o.text,
      account: ev.account, project: ev.project, read: false,
      action: o.actionRequired || false, link: o.link || null,
      /* what the reader can do about it, right here in the list */
      cta: o.cta || null, choices: o.choices || null, answered: null,
      /* and the record it is about, so the list can ask that record whether it
         is still outstanding instead of trusting a flag set on one path */
      ref: o.ref || null,
    });
  }
  /* A message the customer receives. Sent as its own email when it needs an
     answer; held for the daily summary when it is only news. The account shows
     both the moment they happen either way — the digest governs the inbox, not
     the record. §12.6 */
  if(o.mail && o.notify === 'customer'){
    const acc = ev.account ? account(ev.account) : null;
    const to = o.mail.to || (acc && accEmail(acc)) || 'the address on the request';
    const item = {
      id: uid('ml'), at: ev.at, to, toName: acc ? acc.name : (o.mail.toName || ''),
      account: ev.account || null, project: ev.project || null,
      subject: o.mail.subject, lines: o.mail.lines || [],
      cta: o.cta || null, choices: o.choices || null,
      kind: o.actionRequired ? 'decision' : 'update', state: 'sent',
    };
    /* a state saved before these collections existed still has to be able to
       send — restoring an old save must never be the thing that breaks it */
    /* a state saved before these collections existed still has to be able to
       send — restoring an old save must never be the thing that breaks it */
    if(!S.outbox) S.outbox = [];
    if(!S.digest) S.digest = [];
    if(!S.drafts) S.drafts = [];
    if(!o.actionRequired){ item.state = 'held'; S.digest.unshift(item); }
    /* Anything that asks the customer for something goes past a person first.
       The studio writes in its own name; it should be able to read the words
       before they are read by a customer. Releasing is one click. */
    else if(o.mail.review !== false){ item.state = 'draft'; S.drafts.unshift(item); }
    else { S.outbox.unshift(item); }
  }
  if(o.audit){
    S.audit.unshift({
      id: uid('au'), at: ev.at, actor: ev.actor,
      role: ROLE_NAMES[user(ev.actor).role] || '—',
      record: o.record || (ev.project || ev.account || '—'),
      action: o.audit, was: o.was ?? null, now: o.now ?? null,
      reason: o.reason || null, source: 'user',
    });
  }
  return ev;
}

function toast(title, detail){
  const t = {id:uid('t'), title, detail};
  TOASTS.push(t);
  setTimeout(() => { const i = TOASTS.indexOf(t); if(i>-1) TOASTS.splice(i,1); paintToasts(); }, 4200);
  paintToasts();
}

/* ============================================================================
   PROJECTIONS — the load-bearing file.
   The same record, projected for three audiences. If a record cannot be
   written as these three functions, it is not specified well enough.
   ========================================================================= */
const views = {

  /* what the customer is allowed to see and do on a project right now */
  customerProject(p){
    const gs = S.garments.filter(g => g.project === p.id);
    const openCRs = S.changeRequests.filter(c => c.project === p.id &&
      ['submitted','under_review','clarification'].includes(c.state));
    const myApprovals = S.approvals.filter(a => a.project === p.id && a.state === 'awaiting_customer');
    const stage = stageDef(p.stage);
    const gate = gateFor(p);

    let doing = '', youDo = '', responsible = 'PAMUUC', next = '';

    /* A stage held by a payment step says so in the customer's own words —
       unless the step has not been issued yet, in which case it is our
       problem and not theirs, and nothing is asked of them. */
    const held = gate.blocked && gate.state !== 'draft';
    if(held){
      const g = gate.milestone;
      doing = `Waiting for ${g.label.toLowerCase()} to be settled before ${stage.name.toLowerCase()} goes further.`;
      youDo = `Pay ${g.label} by transfer. We confirm it here once it reaches our account.`;
      responsible = 'You';
      next = g.what || `${stage.name} carries on as soon as this is settled.`;
      return {
        id:p.id, ref:p.ref, name:p.name, stage:p.stage, stageName:stage.name, stageBlurb:stage.blurb,
        stages:p.stages, status:p.opStatus, statusSay:st(p.opStatus).say,
        version:p.version, publishedAt:p.publishedAt,
        doing, youDo, responsible, next,
        nextMilestone:p.nextMilestone, lastUpdate:p.lastUpdate, target:p.target,
        garments:gs, openCRs, approvals:myApprovals, gate,
        am:user(p.am),
        boards:p.boards || [],
        designs:(p.designs || []).filter(z => z.state === 'published'),
        milestones:milestones(p),
        decisions:S.approvals.filter(x => x.project === p.id)
          .sort((a,b) => (a.state === 'awaiting_customer' ? -1 : 1) - (b.state === 'awaiting_customer' ? -1 : 1)),
        money:projectValue(p),
        note:(p.proposal && p.proposal.note) || '',
      };
    }

    if(p.stage === 'enquiry'){
      doing = 'Reading what you sent, properly. A person, not a form.';
      youDo = 'Nothing. We come back to you either way, and we say why.';
      responsible = 'PAMUUC';
      next  = 'We tell you whether this is a fit, and what we would need to know next.';
    } else if(p.stage === 'qualification'){
      doing = 'Working out the shape of the job — the positions, the volumes and the timing.';
      youDo = 'Answer anything we ask about quantities and dates. The more exact, the closer the first number.';
      responsible = 'You';
      next  = 'A first call, at a time you pick from the ones we offer.';
    } else if(p.stage === 'first_call'){
      doing = 'Getting ready for the call: what you have told us, and what it usually costs to do properly.';
      youDo = 'Pick a time that suits you, and come with whoever wears the uniform.';
      responsible = 'You';
      next  = p.stages.includes('design')
        ? 'A designer draws the direction, and you receive it as a document.'
        : 'We put the first specification together from the call.';
    } else if(p.stage === 'design'){
      const live = (p.designs || []).filter(z => z.state === 'published' && z.file);
      const fee  = milestones(p).find(m => m.stage === 'design' && m.state !== 'not_required');
      const held = fee && fee.state !== 'paid';
      doing = live.length ? 'The drawing is finished.' : 'Your designer is drawing the direction from the brief.';
      youDo = !live.length ? 'Nothing yet. It appears here as a single document the moment it is done.'
            : held ? 'Settle the design fee and the document is released here.'
            : 'Read it, keep it, and tell us anything you want changed before we build from it.';
      responsible = live.length && held ? 'You' : live.length ? 'You' : 'PAMUUC';
      next  = 'Every garment in the drawing is specified at Project Build.';
    } else if(p.stage === 'project_build'){
      /* the garments are built from something, and which something it was
         changes what this step is: a drawing they bought, or our own first
         answer to the call. Saying which is half the reassurance. */
      const fromDesign = p.stages.includes('design') && designDoc(p);
      doing = fromDesign
        ? `Specifying every garment in ${designDoc(p).title} — positions, fabrics, colours, accessories and quantities.`
        : 'Specifying the garments we proposed after the call — positions, fabrics, colours, accessories and quantities.';
      youDo = openCRs.length ? 'Nothing right now — we are working through the changes you asked for.' :
        'Go through the positions, garments, fabrics, colours and quantities, and tell us what should change.';
      responsible = openCRs.length ? 'PAMUUC' : 'You';
      next  = 'Once the specification is agreed, Development makes it real.';
    } else if(p.stage === 'development'){
      const waiting = gs.filter(g => ['feedback_required','ready_fitting','fitting_scheduled'].includes(g.state));
      const stuck   = gs.filter(g => g.state === 'manual_resolution');
      const left    = gs.filter(g => g.state !== 'approved').length;
      doing = 'Patterns, technical files and prototypes — made and revised one garment at a time.';
      youDo = waiting.length ? `Give fitting feedback on ${waiting.length} garment${waiting.length>1?'s':''}.` :
              stuck.length   ? 'Nothing — we will come to you directly about the garment that needs resolving.' :
              left           ? 'Nothing right now. We will tell you when the next sample is ready to fit.' :
                               'Confirm the final quantities and size splits so we can lock the specification.';
      responsible = waiting.length || !left ? 'You' : 'PAMUUC';
      next  = 'Every garment approved and the quantities locked, then Production.';
    } else if(p.stage === 'production'){
      doing = 'Your garments are being manufactured against the locked specification.';
      youDo = 'Nothing. This step is invoiced on your account terms, not in advance.';
      responsible = 'PAMUUC';
      next  = 'Quality review, then delivery planning.';
    } else if(p.stage === 'delivery'){
      doing = p.completed ? 'This project is complete. Approved garments are available to reorder.'
                          : 'Preparing and dispatching shipments to your locations.';
      youDo = p.completed ? 'Nothing. Reorder any approved garment when you need it.' : 'Confirm receipt when garments arrive.';
      responsible = p.completed ? '—' : 'You';
      next  = p.completed ? 'Reorder whenever you need more.' : 'Delivery confirmed and garments published to Reorders.';
    }

    return {
      id:p.id, ref:p.ref, name:p.name, stage:p.stage, stageName:stage.name, stageBlurb:stage.blurb,
      stages:p.stages, status:p.opStatus, statusSay:st(p.opStatus).say,
      version:p.version, publishedAt:p.publishedAt,
      doing, youDo, responsible, next,
      nextMilestone:p.nextMilestone, lastUpdate:p.lastUpdate, target:p.target,
      garments:gs, openCRs, approvals:myApprovals, gate,
      am:user(p.am),
      /* what the studio has put in front of them */
      boards:p.boards || [],
      designs:(p.designs || []).filter(z => z.state === 'published'),
      milestones:milestones(p),
      decisions:S.approvals.filter(x => x.project === p.id)
        .sort((a,b) => (a.state === 'awaiting_customer' ? -1 : 1) - (b.state === 'awaiting_customer' ? -1 : 1)),
      money:projectValue(p),
      note:(p.proposal && p.proposal.note) || '',
      /* deliberately absent: internal tasks, margin, supplier, cost, risk notes */
    };
  },

  /* the operational view — same record, everything on it */
  studioProject(p, u){
    const c = views.customerProject(p);
    const gs = S.garments.filter(g => g.project === p.id);
    return Object.assign({}, c, {
      opStatus:p.opStatus, risk:p.risk, draftDirty:p.draftDirty,
      owner:user(p.owner), am:user(p.am),
      allCRs:S.changeRequests.filter(x => x.project === p.id),
      allApprovals:S.approvals.filter(a => a.project === p.id),
      documents:S.documents.filter(d => d.project === p.id),
      roundExceptions:gs.filter(g => g.round >= 3),
      blockers:gateBlockers(p),
      /* customerProject writes in the second person because it is written for
         the customer. On this side "You" means the studio, which is the
         opposite of what it says, so it is named instead. */
      responsible:c.responsible === 'You' ? account(p.account).name : c.responsible,
      showCost:can(u,'cost_margin','view'),
      account:account(p.account),
    });
  },
};

/* ---- commercial gates --------------------------------------------------
   Gates are not fixed any more. A project's payment steps are written by
   hand in the Back Office: each one names a stage, an amount and what it
   releases, and the stage it names stays shut until it is settled. A
   project with no payment steps has no gates, which is a legitimate way to
   run one. */
function milestones(p){ return p.milestones || []; }

function gateFor(p){
  const open = milestones(p).find(m => m.stage === p.stage &&
    m.state !== 'paid' && m.state !== 'not_required');
  if(open) return {blocked:true, key:open.id, state:open.state, milestone:open,
    label:open.label,
    why: open.state === 'draft'
      ? `This step has not been issued yet. ${stageDef(p.stage).name} stays shut until it is issued and settled.`
      : (open.what || `${stageDef(p.stage).name} is released once this payment is settled.`)};
  return {blocked:false};
}

/* what each garment and each project is worth, at the prices that were
   typed in. No price means no number — never a guessed one. */
function garmentPieces(g){ return g.colourways.reduce((t,c) => t + (+c.qty||0), 0); }
function garmentValue(g){ return g.unitPrice == null ? null : g.unitPrice * garmentPieces(g); }
function projectValue(p){
  const gs = S.garments.filter(g => g.project === p.id);
  const priced = gs.filter(g => g.unitPrice != null);
  const garments = priced.reduce((t,g) => t + garmentValue(g), 0);
  const lines = (p.lines || []).reduce((t,l) => t + (+l.amount||0), 0);
  return {garments, lines, total:garments + lines,
    unpriced:gs.length - priced.length, pieces:projectPieces(p)};
}
function milestonesTotal(p){ return milestones(p).reduce((t,m) => t + (+m.amount||0), 0); }

/* everything standing between this project and its next stage */
/* ---- moving a project between steps, in either direction -----------------
   A project does not only go forwards. A fitting that fails sends it back to
   development; a stage entered by mistake has to be undone. The rule is not
   which way it moves but whether the move is explained: a plain advance to the
   next open step needs no note, and everything else — going back, skipping
   ahead, pushing past unmet conditions — is recorded with a reason. §7.4 */
const STAGE_MOVE = {
  /* how a target stage relates to where the project is now */
  kindOf(p, to){
    const i = p.stages.indexOf(p.stage), j = p.stages.indexOf(to);
    if(j < 0 || i < 0 || i === j) return null;
    if(j < i) return 'back';
    return j === i + 1 ? (gateBlockers(p).length ? 'force' : 'next') : 'skip';
  },
  needsReason(kind){ return kind !== 'next'; },
  /* who may do it: going back is ordinary project management, jumping the
     sequence or pushing past a gate is not */
  allowed(u, p, kind){
    if(kind === 'back' || kind === 'next') return can(u,'phase_advance','do',{project:p.id});
    return can(u,'phase_override','do');
  },
};

/* Every controlled state the back office can set directly, so an override
   offers what the state machine understands instead of free text. */
const OVERRIDE_STATES = {
  project:  ['not_started','in_progress','waiting_customer','waiting_pamuuc','waiting_supplier','at_risk','blocked','complete'],
  garment:  ['planned','in_development','ready_fitting','fitting_scheduled','feedback_required','changes_requested','new_round','approved','manual_resolution','superseded'],
  milestone:['draft','issued','payment_due','payment_sent','paid','cancelled','not_required'],
  document: ['draft','sent','viewed','payment_due','payment_sent','partially_paid','paid','overdue','cancelled'],
  approval: ['awaiting_customer','approved','changes_requested','declined','withdrawn'],
  gate:     ['draft','issued','payment_due','payment_sent','paid','not_required'],
};

/* p.nextMilestone stores an id; nobody outside the data wants to read one. */
function milestoneLabel(p, id){
  if(!id) return '—';
  const m = (p.milestones || []).find(x => x.id === id);
  return m ? `${m.label}${m.amount ? ' — ' + money(m.amount) : ''}` : '—';
}

function gateBlockers(p){
  const out = [];
  const gs = S.garments.filter(g => g.project === p.id);
  const gate = gateFor(p);
  if(gate.blocked) out.push({kind:'commercial',
    text:`${gate.label} — ${gate.state === 'draft' ? 'not issued yet' : st(gate.state).label.toLowerCase()}` +
      `${gate.milestone && gate.milestone.amount ? ', ' + money(gate.milestone.amount) : ''}`,
    why:gate.why});

  if(p.stage === 'development'){
    gs.filter(g => g.state !== 'approved').forEach(g => {
      out.push({kind:'garment', text:`${g.name} — ${st(g.state).label.toLowerCase()} (round ${g.round})`,
        why: g.state === 'manual_resolution'
          ? 'Three prototype rounds reached without approval. A Master resolution is required before this project can advance.'
          : 'Every required garment needs an approved prototype revision.', garment:g.id});
    });
  }
  /* the quantity lock is the last thing Development owes before Production */
  if(p.stage === 'development'){
    gs.forEach(g => g.colourways.forEach(cw => {
      const sum = Object.values(cw.sizes||{}).reduce((a,b)=>a+(+b||0),0);
      if(sum !== cw.qty) out.push({kind:'data',
        text:`${g.name} — ${COLOURS[cw.colour].name}: size split sums to ${sum}, quantity is ${cw.qty}`,
        why:'Every colourway quantity must equal the sum of its size split.'});
    }));
  }
  if(p.stage === 'project_build'){
    const openCR = S.changeRequests.filter(c => c.project === p.id &&
      ['submitted','under_review','clarification'].includes(c.state));
    if(openCR.length) out.push({kind:'request',
      text:`${openCR.length} customer request${openCR.length>1?'s':''} unresolved`,
      why:'The specification cannot be agreed while a requested change is still open.'});
  }
  return out;
}

function nextStage(p){
  const i = p.stages.indexOf(p.stage);
  return i > -1 && i < p.stages.length - 1 ? p.stages[i+1] : null;
}
function cwSum(cw){ return Object.values(cw.sizes||{}).reduce((a,b)=>a+(+b||0),0); }
function projectPieces(p){
  return S.garments.filter(g=>g.project===p.id)
    .reduce((t,g)=>t+g.colourways.reduce((a,c)=>a+(+c.qty||0),0),0);
}

/* ---- customer-side derived lists --------------------------------------- */
function myAccount(){ return SESSION ? account(user(SESSION.user).account) : null; }
function myProjects(){
  const u = user(SESSION.user);
  return S.projects.filter(p => p.account === u.account && p.published)
    .filter(p => can(u,'project','view',{project:p.id}));
}
function myOpenItems(){
  const u = user(SESSION.user);
  const items = [];
  S.approvals.filter(a => a.account === u.account && a.state === 'awaiting_customer').forEach(a =>
    items.push({kind:'approval', title:a.kind, sub:'Approval due ' + dateShort(a.due),
      project:a.project, cta:'Review', id:a.id, urgency:'wait'}));
  S.documents.filter(d => d.account === u.account && d.visible && d.state === 'overdue').forEach(d =>
    items.push({kind:'document', title:d.title, sub:d.num + ' — overdue since ' + dateShort(d.due),
      project:d.project, cta:'View', id:d.id, urgency:'stop'}));
  S.documents.filter(d => d.account === u.account && d.visible && d.state === 'payment_due').forEach(d =>
    items.push({kind:'document', title:d.title, sub:d.num + ' — due ' + dateShort(d.due),
      project:d.project, cta:'View', id:d.id, urgency:'wait'}));
  S.garments.filter(g => {
    const p = project(g.project);
    return p && p.account === u.account && g.state === 'feedback_required';
  }).forEach(g => items.push({kind:'fitting', title:'Fitting feedback — ' + g.name,
    sub:'Round ' + g.round, project:g.project, cta:'Give feedback', id:g.id, urgency:'wait'}));
  S.meetings.filter(m => m.account === u.account && m.state === 'proposed').forEach(m =>
    items.push({kind:'meeting', title:m.kind, sub:m.slots.length + ' dates proposed',
      project:m.project, cta:'Choose a date', id:m.id, urgency:'wait'}));
  return items;
}
function myReorderables(){
  const u = user(SESSION.user);
  return S.garments.filter(g => {
    const p = project(g.project);
    return g.reorderable && p && p.account === u.account;
  });
}
function unreadCount(side){
  /* Counted exactly as the page counts, or the badge argues with the list. */
  const acc = side === 'customer' ? (myAccount() || {}).id : null;
  return S.notifications.filter(n =>
    n.to === side && (!acc || n.account === acc) && nUnread(n)).length;
}

/* ---- studio-side queues ------------------------------------------------ */
function studioQueues(u){
  const scope = (p) => u.role === 'master' || u.role === 'finance' || p.am === u.id;
  return {
    inquiries: S.inquiries.filter(i => ['submitted'].includes(i.state)),
    requests:  S.changeRequests.filter(c => ['submitted','under_review'].includes(c.state)),
    approvals: S.approvals.filter(a => a.state === 'awaiting_customer'),
    atRisk:    S.projects.filter(p => p.risk && scope(p)),
    blocked:   S.projects.filter(p => gateBlockers(p).length && !p.completed && scope(p)),
    overdue:   S.documents.filter(d => d.state === 'overdue'),
    due:       S.documents.filter(d => d.state === 'payment_due'),
    threads:   S.conversations.filter(c => c.state === 'waiting_customer' || c.state === 'needs_reply'),
    exceptions:S.garments.filter(g => g.state === 'manual_resolution'),
  };
}
function financeTotals(){
  const issued = S.documents.filter(d => d.amount && ['payment_due','paid','overdue','partially_paid'].includes(d.state));
  const collected = issued.filter(d => d.state === 'paid');
  const out = issued.filter(d => d.state !== 'paid');
  const sum = a => a.reduce((t,d)=>t+(d.amount||0),0);
  return {issued:sum(issued), collected:sum(collected), outstanding:sum(out),
    overdue:sum(out.filter(d=>d.state==='overdue')), count:issued.length};
}

/* ---- seeded history -----------------------------------------------------
   There is no project history to seed: the studio starts empty and every
   record after the two inquiries is created by hand. All this does is put
   the inquiries on the notification list, the way the form would have. */
function seedHistory(){
  S.inquiries.forEach(i => {
    S.events.push({id:uid('ev'), type:'inquiry.submitted', at:i.submitted, actor:'u_leo',
      project:null, account:null, customerVisible:false,
      text:`Inquiry ${i.ref} submitted by ${i.company}`});
    S.audit.push({id:uid('au'), at:i.submitted, actor:'u_leo', role:ROLE_NAMES['master'],
      record:i.ref, action:'Inquiry created', was:'\u2014', now:'submitted', reason:null, source:'form'});
    S.notifications.push({id:uid('nt'), at:i.submitted, to:'studio', kind:'action',
      read:false, action:true, project:null, account:null,
      text:`New inquiry ${i.ref} from ${i.company} \u2014 qualification review`});
  });
  S.events.sort((a,b) => String(b.at).localeCompare(String(a.at)));
  S.notifications.sort((a,b) => String(b.at).localeCompare(String(a.at)));
}
seedHistory();

/* ---- fabrics added by hand live alongside the seeded library ------------
   FABRICS is read directly all over the app (FABRICS[g.fabric].name), so a
   fabric created in the Back Office is merged into that same object rather
   than kept in a second place the rest of the code would have to know about.
   S.customFabrics is what survives a reload. */
function mountFabrics(){
  (S.customFabrics || []).forEach(f => { FABRICS[f.id] = f; });
}
mountFabrics();

/* ---- persistence: per-viewer convenience only, never load-bearing ------ */
/* v2: the seed changed shape — projects now carry their own payment steps,
   prices and images — so a browser holding the old state starts fresh
   rather than restoring records that no longer make sense. */
/* v3: the catalogue no longer carries photography, so a browser holding v2
   would restore 5.5MB of the old images over the top of it. */
/* v4: the catalogue became eighteen matrix products and the rate card went
   from costs to selling prices, so a v3 state restores both wrongly. */
/* v5: v4 saves could hold a catalogue with no garments at all, which left
   the builder rendering nothing. Bumping the key retires those once. */
const SKEY = 'pamuuc_suite_v12';
try{ localStorage.removeItem('pamuuc_suite_v1'); }catch(e){}
let SAVE_WARNED = false;
function save(){
  try{ localStorage.setItem(SKEY, JSON.stringify({S, SESSION})); SAVE_WARNED = false; }
  catch(e){
    /* Images are held inline, so a project with a lot of them can outgrow
       what the browser will keep. The work is still here for this session —
       say so plainly rather than failing silently. */
    if(!SAVE_WARNED){
      SAVE_WARNED = true;
      toast('More than this device will keep',
        'Everything is here for this session, but the browser will not store this many images. Remove a few and it saves again.');
    }
  }
}

/* ---- attaching an image -------------------------------------------------
   The file never leaves the browser. It is read locally, scaled down to
   something a page can carry, and stored inline on the record it belongs
   to — so what the customer opens is the file you attached, not a link to
   somewhere that may be gone by then. */
function shrinkImage(file){
  return new Promise(res => {
    const fr = new FileReader();
    fr.onerror = () => res(null);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => res(null);
      img.onload = () => {
        const max = 1280;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        let src;
        try{ src = cv.toDataURL('image/jpeg', 0.76); }catch(err){ src = fr.result; }
        res({src, name:file.name, w, h});
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ============================================================================
   Looking at a file without leaving the page
   ---------------------------------------------------------------------------
   A design you paid for should be readable where it lives, not only after a
   download. Images are simple — a data URI in an <img> is what the whole
   catalogue already runs on. A PDF needs a viewer. §15.2
   ========================================================================= */
/* The browser already has a PDF viewer, and it is better than anything that
   can be bolted on: no library, no CDN, no font files to chase. It will not
   open a `data:` URL — browsers refuse those as frame sources — but a blob is
   same-origin and opens straight into the built-in viewer.

   pdf.js was tried first and abandoned: its worker cannot be constructed from
   another origin, and the npm package for 3.x is missing the very base-14 font
   (FoxitSans) that a plain Helvetica document asks for, so a render never
   finishes. Three hundred kilobytes of dependency to do worse than the frame.

   Because the CSP is the one thing that could still refuse this, the frame is
   checked once it has had a moment to load, and a refusal turns into an honest
   message with the two routes that always work. §15.2 */
const blobUrls = [];
function blobFor(src, mime){
  const u8 = dataUriBytes(src);
  const url = URL.createObjectURL(new Blob([u8], {type:mime || 'application/octet-stream'}));
  blobUrls.push(url);
  return url;
}
/* Object URLs outlive the modal that made them unless they are let go. */
function releaseBlobs(){
  while(blobUrls.length){ try{ URL.revokeObjectURL(blobUrls.pop()); }catch(e){} }
}

const dataUriBytes = (src) => {
  const b64 = String(src).split(',')[1] || '';
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};
const fileKind = (name, src) => {
  const s = String(src || ''), n = String(name || '').toLowerCase();
  if(/^data:image\//.test(s) || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(n)) return 'image';
  if(/^data:application\/pdf/.test(s) || /\.pdf$/.test(n)) return 'pdf';
  return 'other';
};

/* Did the frame actually get a document into it? A blob is same-origin, so the
   answer is readable; anything that throws or comes back empty counts as a no. */
function framePresented(frame){
  try{
    const d = frame.contentDocument;
    if(!d) return false;
    if(d.querySelector('embed, object, canvas, img')) return true;
    return (d.body && d.body.childElementCount > 0) || d.readyState === 'complete';
  }catch(e){
    /* cross-origin means the viewer took it over, which is a yes */
    return true;
  }
}

/* One preview for anything with bytes: the design document, an attached
   contract, artwork on a placement. `onDownload` is the markup for the button
   that saves it, so each caller keeps its own wording and action. */
function modalFile(name, src, sub, onDownload){
  const kind = fileKind(name, src);
  releaseBlobs();
  const url = kind === 'pdf' ? blobFor(src, 'application/pdf') : null;
  openModal({
    title:name || 'File', sub:sub || '',
    body:`<div class="fv" id="fvbox">${
      kind === 'image'
        ? `<img class="fv-img" src="${esc(src)}" alt="${esc(name || 'Preview')}">`
      : kind === 'pdf'
        ? `<iframe class="fv-frame" id="fvframe" src="${esc(url)}" title="${esc(name || 'Document')}"></iframe>`
      : `<div class="banner"><div><div class="banner-t">No preview for this kind of file</div>
          <div class="banner-d">Download it and it opens in whatever you normally use.</div></div></div>`
    }</div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Close</button>${onDownload || ''}`,
  });
  /* Give the frame a moment, then say plainly if it could not show it rather
     than leaving a grey rectangle to be interpreted. */
  if(kind === 'pdf'){
    setTimeout(() => {
      const f = document.getElementById('fvframe');
      if(!f || framePresented(f)) return;
      const box = document.getElementById('fvbox');
      /* A page that will not frame a document will usually still open one in a
         tab of its own, so that is offered before falling back to the file. */
      if(box) box.innerHTML = `<div class="banner banner--wait"><div>
        <div class="banner-t">This document cannot be shown inside the page</div>
        <div class="banner-d">It opens in a tab of its own, or download it and it opens in your usual reader.
          The file itself is fine either way.</div>
        <div class="btn-row" style="margin-top:12px">
          <a class="btn btn--primary btn--sm" href="${esc(url)}" target="_blank" rel="noopener">Open in a new tab</a>
        </div></div></div>`;
    }, 1800);
  }
}

/* ============================================================================
   A document, as a file
   ---------------------------------------------------------------------------
   Invoices, pro formas and contracts are generated from the record rather than
   uploaded, so the file has to be generated too — otherwise "download" hands
   over a screenshot of a table. This writes a real PDF: Helvetica, WinAnsi,
   wrapped and paginated, small enough to keep inline. An uploaded file on the
   record always wins; this is what happens when there is not one. §15.1
   ========================================================================= */

/* Helvetica advance widths, in 1/1000 em, for the characters these documents
   actually use. Anything unlisted falls back to the average — wrapping stays
   conservative, so a wrong guess costs a short line rather than an overflow. */
const HW = (() => {
  const w = {}, set = (s, n) => { for(const c of s) w[c] = n; };
  set(' !"#$%&\'()*+,-./0123456789:;<=>?@', 278);
  set('0123456789', 556); set('$€', 556);
  set('ilj|.,:;\'`!I[]()', 244); set('ft/\\', 300); set('r', 333);
  set('abcdeghknopqsuvxyz', 556); set('w', 722); set('m', 833);
  set('ABCDEFGHKLPRSTUVXYZ', 667); set('MW', 944); set('JI', 333);
  set('NOQ', 722); set(' ', 278); set('—–', 1000); set('·', 333);
  return w;
})();
const hwidth = (txt, size, bold) => {
  let t = 0;
  for(const c of String(txt)) t += (HW[c] || 556) * (bold ? 1.06 : 1);
  return t * size / 1000;
};

/* PDF strings are bytes, and Helvetica reads them as WinAnsi: the printable
   ASCII range passes through, the Latin-1 range matches, and the punctuation
   a price list actually needs — € — – ' " — lives in the gap between. */
const WINANSI = {'€':0x80,'‚':0x82,'ƒ':0x83,'„':0x84,'…':0x85,'†':0x86,'‡':0x87,
  'ˆ':0x88,'‰':0x89,'Š':0x8A,'‹':0x8B,'Œ':0x8C,'Ž':0x8E,'‘':0x91,'’':0x92,
  '“':0x93,'”':0x94,'•':0x95,'–':0x96,'—':0x97,'˜':0x98,'™':0x99,'š':0x9A,
  '›':0x9B,'œ':0x9C,'ž':0x9E,'Ÿ':0x9F};
function pdfStr(txt){
  let out = '';
  for(const ch of String(txt)){
    const c = WINANSI[ch] != null ? WINANSI[ch]
            : ch.codePointAt(0) < 0x100 ? ch.codePointAt(0) : 63; /* '?' */
    const s = String.fromCharCode(c);
    out += (s === '(' || s === ')' || s === '\\') ? '\\' + s : s;
  }
  return out;
}

/* Lays blocks down a page and starts a new one when it runs out of room.
   A block is {text, size, bold, gap, align, x} or {rule:true} or {space:n}. */
function pdfBuild(blocks, opts){
  const o = Object.assign({w:595, h:842, ml:56, mr:56, mt:790, mb:70}, opts || {});
  const right = o.w - o.mr, width = right - o.ml;
  const pages = [];
  let cur = [], y = o.mt;
  const newPage = () => { if(cur.length) pages.push(cur); cur = []; y = o.mt; };

  for(const b of blocks){
    if(b.pageBreak){ newPage(); continue; }
    if(b.space){ y -= b.space; continue; }
    if(b.rule){
      if(y < o.mb) newPage();
      cur.push({rule:true, y:y + 4}); y -= (b.gap == null ? 14 : b.gap); continue;
    }
    const size = b.size || 10.5, lead = b.lead || size * 1.45;
    /* two columns on one line: a label at the left, a figure at the right */
    if(b.right != null){
      if(y < o.mb) newPage();
      cur.push({t:b.text, x:o.ml, y, size, bold:b.bold});
      cur.push({t:b.right, x:right - hwidth(b.right, size, b.boldRight), y, size, bold:b.boldRight});
      y -= lead + (b.gap || 0); continue;
    }
    const words = String(b.text == null ? '' : b.text).split(/\s+/).filter(Boolean);
    const maxw = (b.width || width);
    let line = '';
    const flush = () => {
      if(!line) return;
      if(y < o.mb) newPage();
      const x = b.align === 'right' ? right - hwidth(line, size, b.bold) : o.ml + (b.x || 0);
      cur.push({t:line, x, y, size, bold:b.bold});
      y -= lead; line = '';
    };
    if(!words.length){ y -= lead; }
    for(const word of words){
      const next = line ? line + ' ' + word : word;
      if(hwidth(next, size, b.bold) > maxw && line){ flush(); line = word; }
      else line = next;
    }
    flush();
    y -= (b.gap || 0);
  }
  newPage();

  /* --- assemble --- */
  const enc = (s) => { const a = []; for(let i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 0xff); return a; };
  const streams = pages.map(items => {
    let c = '';
    for(const it of items){
      if(it.rule){ c += `0.5 w 0.0 0.07 0.32 RG ${o.ml} ${it.y} m ${right} ${it.y} l S\n`; continue; }
      c += `BT /${it.bold ? 'F2' : 'F1'} ${it.size} Tf 1 0 0 1 ${it.x.toFixed(2)} ${it.y.toFixed(2)} Tm (${pdfStr(it.t)}) Tj ET\n`;
    }
    return enc(c);
  });

  const nPages = streams.length;
  const objs = [];
  objs.push(enc('<< /Type /Catalog /Pages 2 0 R >>'));
  const kids = streams.map((_, i) => `${5 + i} 0 R`).join(' ');
  objs.push(enc(`<< /Type /Pages /Kids [${kids}] /Count ${nPages} >>`));
  objs.push(enc('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  objs.push(enc('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));
  streams.forEach((_, i) => objs.push(enc(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${o.w} ${o.h}] ` +
    `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${5 + nPages + i} 0 R >>`)));
  streams.forEach(st => objs.push(enc(`<< /Length ${st.length} >>\nstream\n`).concat(st, enc('\nendstream'))));

  let bytes = enc('%PDF-1.4\n');
  const offsets = [];
  objs.forEach((ob, i) => {
    offsets.push(bytes.length);
    bytes = bytes.concat(enc(`${i + 1} 0 obj\n`), ob, enc('\nendobj\n'));
  });
  const xref = bytes.length;
  bytes = bytes.concat(enc(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`));
  offsets.forEach(off => { bytes = bytes.concat(enc(String(off).padStart(10, '0') + ' 00000 n \n')); });
  bytes = bytes.concat(enc(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));

  const u8 = new Uint8Array(bytes);
  let bin = '';
  for(let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return {bytes:u8, dataUri:'data:application/pdf;base64,' + btoa(bin)};
}

/* A document is not an image: it is not resized, not re-encoded, and its
   bytes have to survive intact or the download is a lie. Kept inline like
   everything else here, so it travels with the prototype. */
function pickFile(accept, done){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept || '';
  inp.style.position = 'fixed'; inp.style.left = '-9999px';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0];
    if(!f){ inp.remove(); return; }
    const fr = new FileReader();
    fr.onerror = () => { inp.remove(); toast('That file could not be read', 'Try again, or a different file.'); };
    fr.onload = () => { inp.remove();
      done({name:f.name, size:f.size, type:f.type || 'application/octet-stream', src:fr.result}); };
    fr.readAsDataURL(f);
  });
  inp.click();
}

/* Browsers refuse a top-level navigation to a data: URL, so the bytes go
   through a Blob and an object URL — which is also what makes the saved file
   carry its real name instead of the URL's. */
function downloadFile(name, src){
  try{
    const [head, b64] = String(src).split(',');
    const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], {type:mime}));
    const a = document.createElement('a');
    a.href = url; a.download = name || 'download';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }catch(e){
    toast('That file could not be downloaded', 'The prototype could not read it back.');
  }
}

const fileSize = (n) => n == null ? '' :
  n < 1024 ? n + ' B' :
  n < 1048576 ? (n/1024).toFixed(0) + ' KB' : (n/1048576).toFixed(1) + ' MB';

function pickImage(multiple, done){
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = !!multiple;
  inp.style.position = 'fixed'; inp.style.left = '-9999px';
  document.body.appendChild(inp);
  inp.addEventListener('change', () => {
    const files = Array.from(inp.files || []);
    if(!files.length){ inp.remove(); return; }
    Promise.all(files.map(shrinkImage)).then(list => {
      inp.remove();
      const ok = list.filter(Boolean);
      if(!ok.length){ toast('That file could not be read', 'Try a JPEG or a PNG.'); return; }
      done(ok);
    });
  });
  inp.click();
}
/* A superseded key keeps its whole payload — the v2 catalogue alone was 5.5MB
   of photography — and localStorage is a few megabytes per origin in total, so
   an orphan left behind can exhaust the quota and block every later save. */
function pruneOldState(){
  try{
    for(let i = localStorage.length - 1; i >= 0; i--){
      const k = localStorage.key(i);
      if(k && k !== SKEY && /^pamuuc_suite_/.test(k)) localStorage.removeItem(k);
    }
  }catch(e){}
}
/* The shipped catalogue is reference data, not something the visitor owns. A
   save made before it was regenerated would otherwise resurrect the old
   mapping — which is exactly what happened the last two times it changed. The
   signature moves whenever catalogue.js is rebuilt, so a stale save refreshes
   itself; a catalogue imported inside the prototype flags itself and is kept. */
/* Counts alone missed a re-generation that kept the same products and garments
   but changed their price ladders, so the ladder depth is in the stamp too. */
const catSig = (o) => {
  const P = (o && o.merchProducts) || [];
  let g = 0, b = 0;
  P.forEach(p => (p.matrix || []).forEach(m => { g++; b += (m.breaks || []).length; }));
  return P.length + ':' + g + ':' + b;
};
/* A catalogue with no garments cannot drive the journey: the page renders a
   product with no questions and no options, which is what "the builder does
   not work" looks like. Nothing is worth preserving in that state. */
const catUsable = (o) => ((o && o.merchProducts) || []).some(p => (p.matrix || []).length);

function restore(){
  pruneOldState();
  try{
    const raw = localStorage.getItem(SKEY);
    if(!raw) return false;
    const o = JSON.parse(raw);
    if(o && o.S && o.S.projects){
      S = o.S; SESSION = o.SESSION || null;
      /* Placement and method names are reference tables that ship with the
         build and are never written to, so a save must not pin an older copy:
         the joggers' leg placements were added after saves already existed. */
      S.positions_lib = SEED.positions_lib;
      /* An imported catalogue is the visitor's own and is kept — but not when
         it cannot work, and not when it is simply stale against this build. */
      if(!catUsable(S) || (!S.merchImported && catSig(S) !== catSig(SEED))){
        S.merchProducts = JSON.parse(JSON.stringify(SEED.merchProducts));
        S.decoRatesSeed = SEED.decoRatesSeed;
        S.decoRates     = SEED.decoRatesSeed;
        /* Submitted quotes are business records, not a cart: each carries its
           own product name, reference and prices, so one raised against a
           product that has since changed still reads correctly and is kept.
           The live cart lives in UI, which is never persisted. */
      }
      mountFabrics(); return true;
    }
  }catch(e){}
  return false;
}
function resetAll(){
  try{ localStorage.removeItem(SKEY); }catch(e){}
  (S.customFabrics || []).forEach(f => { delete FABRICS[f.id]; });
  S = JSON.parse(JSON.stringify(SEED));
  seedHistory();
  SESSION = null; UI = {};
  go('public','home');
  toast('Prototype reset', 'Back to two inquiries and nothing else — no accounts, no projects.');
}
/* ============================================================================
   PAMUUC SUITE — actions
   The ONLY place state is mutated. Every action emits exactly one event,
   and the event decides activity, notification, task and audit.
   ========================================================================= */
const act = {

  /* ---- public → studio ------------------------------------------------- */
  /* Written the moment an enquiry lands, so nobody wonders whether it arrived.
     It asks for nothing, so it waits for the daily summary rather than
     interrupting — the acknowledgement matters, the interruption does not. */
  ackInquiry(i){
    emit('inquiry.received', {
      text:`Enquiry acknowledged to ${i.company}`,
      notify:'customer', kind:'update', notifyText:'We have your enquiry',
      mail:{to:i.email, toName:i.company, subject:'We have your enquiry',
        lines:[
          `Thank you — your enquiry for ${i.company} reached us and it is with a person, not a queue.`,
          'We read every one properly, which takes a day or two. You will hear from us either way: if it is a fit we will offer you some times to talk, and if it is not we will say so plainly.',
          'Your reference is ' + i.ref + '.']}});
  },

  submitInquiry(answers, verdict){
    const n = 149 + S.inquiries.filter(i => i.ref.startsWith('INQ-01') && +i.ref.slice(4) >= 149).length;
    const inq = {
      id:uid('inq'), ref:'INQ-0'+n, company:answers['Company'] || 'Unnamed company',
      contact:answers['Contact name'] || '—', email:answers['Email'] || '—',
      type:'Custom uniforms', country:answers['Country'] || 'Spain',
      sector:answers['Establishment'] || '—', people:answers['People to dress'] || '—',
      submitted:nowStamp(), state:'submitted', reviewer:null,
      scope:answers['What is not working'] ? [].concat(answers['What is not working']).join(', ') : '—',
      establishment:answers['Establishment'] || '—',
      role:answers['Role'] || '—', authority:answers['Authority'] || '—',
      vat:answers['VAT checked'] || '', vatStatus:answers['VAT status'] || 'unknown',
      designs:answers['Designs'] || '—',
      qualification:verdict || null,
      answers, files:answers.__files || [],
    };
    S.inquiries.unshift(inq);
    emit('inquiry.submitted', {
      text:`Inquiry ${inq.ref} submitted by ${inq.company}`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`New inquiry ${inq.ref} from ${inq.company} — qualification review`,
      audit:'Inquiry created', record:inq.ref, now:'submitted', actor:'u_leo',
    });
    this.ackInquiry(inq);
    save();
    return inq;
  },

  qualifyInquiry(id, decision, reason){
    const i = by(S.inquiries, id); if(!i) return;
    const was = i.state;
    if(decision === 'accept'){ i.state = 'qualified'; i.reviewer = i.reviewer || SESSION.user; }
    if(decision === 'decline'){ i.state = 'archived'; i.declineReason = reason || 'Not a fit at this time.'; }
    if(decision === 'more_info'){ i.state = 'clarification'; }
    emit('inquiry.qualified', {
      text:`Inquiry ${i.ref} — ${st(i.state).label}`,
      notify:'studio', kind:'update', notifyText:`${i.ref} moved to ${st(i.state).label}`,
      audit:'Inquiry qualification', record:i.ref, was, now:i.state, reason:reason || null,
    });
    /* Whatever we decided, they hear it. A decline that arrives as silence is
       the one thing a person remembers about a studio. */
    if(decision === 'decline'){
      emit('inquiry.declined', {
        text:`${i.company} told we cannot take this on`,
        notify:'customer', kind:'update', notifyText:'About your enquiry',
        mail:{to:i.email, toName:i.company, subject:'About your enquiry',
          lines:[
            `Thank you for telling us about ${i.company}, and for the detail you put into it.`,
            'We are not the right studio for this one. We make custom uniform programmes in small numbers, and taking this on well is not something we could promise you.',
            'If what you need changes, write to us again — we would rather read a second enquiry than have you assume the answer.']}});
    }
    if(decision === 'more_info'){
      emit('inquiry.clarification', {
        text:`${i.company} asked for more detail`,
        notify:'customer', kind:'action', actionRequired:true,
        notifyText:'We have a question about your enquiry',
        mail:{to:i.email, toName:i.company, subject:'One question before we go further',
          lines:[
            `Thank you for telling us about ${i.company}. We have read it and we would like to understand one thing better before we answer.`,
            reason || 'Could you tell us a little more about quantities and when you need this?',
            'Reply to this message and it reaches the person reading your enquiry.']}});
    }
    save();
  },

  /* Offering times rather than naming one. The studio picks four; the customer
     answers from the message itself, and the one they take becomes the call.
     Until they answer, the inquiry is waiting on them and says so. */
  proposeSlots(id, slots){
    const i = by(S.inquiries, id); if(!i) return;
    const was = i.state;
    i.slots = slots.map((w, n) => ({n, when:w}));
    /* It is not waiting on them until the invitation has actually left. The
       message is read by a person first, so the inquiry stays ours until it is
       sent — otherwise the board says we are waiting while the letter is still
       on the desk. releaseMail moves it on. */
    i.awaitingSend = true;
    emit('inquiry.slots_offered', {account:i.account || null,
      text:`Four times offered to ${i.company} for the first call`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:'Choose a time for our first call',
      choices:{act:'pickSlot', id:i.id, options:i.slots.map(s2 => ({v:String(s2.n), label:slotLabel(s2.when)}))},
      ref:{kind:'inquiry', id:i.id},
      mail:{to:i.email, toName:i.company,
        subject:'Choose a time for our first call',
        lines:[
          `Thank you for telling us about ${i.company}. We have read it and we would like to talk.`,
          'Pick whichever of these suits you. It is a half hour, and it is the call where we work out whether we are the right studio for this.',
          'If none of them work, reply to this message and we will find another.']},
      audit:'First call times offered', record:i.ref, was, now:i.state});
    save();
  },
  takeSlot(id, n){
    const i = by(S.inquiries, id); if(!i) return;
    const slot = (i.slots || []).find(s2 => String(s2.n) === String(n)); if(!slot) return;
    const was = i.state;
    i.state = 'call_scheduled'; i.callAt = slot.when; i.slots = null;
    emit('inquiry.call_scheduled', {account:i.account || null,
      text:`${i.company} chose ${slotLabel(slot.when)} for the first call`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`${i.company} booked ${slotLabel(slot.when)}`,
      audit:'First call booked by customer', record:i.ref, was, now:'call_scheduled'});
    /* and a plain confirmation back to them, which needs no answer */
    emit('inquiry.call_confirmed', {account:i.account || null,
      text:`First call confirmed with ${i.company}`,
      notify:'customer', kind:'update', notifyText:`Your call is booked for ${slotLabel(slot.when)}`,
      mail:{to:i.email, toName:i.company, subject:'Your call is booked',
        lines:[`We have you down for ${slotLabel(slot.when)}.`,
               'A calendar invitation follows. If something changes, tell us and we will move it.']}});
    save();
  },

  scheduleCall(id, when){
    const i = by(S.inquiries, id); if(!i) return;
    const was = i.state; i.state = 'call_scheduled'; i.callAt = when;
    emit('inquiry.call_scheduled', {text:`First discovery call scheduled for ${i.company}`,
      audit:'First call scheduled', record:i.ref, was, now:'call_scheduled'});
    save();
  },

  completeCall(id, notes){
    const i = by(S.inquiries, id); if(!i) return;
    const was = i.state; i.state = 'ready_account'; i.discovery = notes;
    emit('inquiry.call_done', {
      text:`Discovery completed for ${i.company} — ready for account and project`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`${i.ref} is ready for an account and project`,
      audit:'Discovery recorded', record:i.ref, was, now:'ready_account'});
    save();
  },

  activateAccount(id){
    const i = by(S.inquiries, id); if(!i) return;
    const acc = {
      id:uid('acc'), name:i.company, country:i.country, city:'—',
      since:S.today, am:i.reviewer || 'u_nuria', status:'active',
      terms:'30 days from invoice date', currency:'EUR',
      vat:i.vat && i.vat !== '—' ? i.vat : '—',
      locations:[], modules:{projects:true,reorders:true,merchandise:true,documents:true,payments:true},
      balance:0, fromInquiry:i.ref,
    };
    S.accounts.push(acc);

    /* The person who wrote in becomes the account's first administrator.
       Without this there is nobody to sign in as, and the customer account
       could never be opened at all. */
    const nm = (i.contact || 'Account Admin').trim();
    const parts = nm.split(/\s+/);
    const admin = {
      id:uid('u'), name:nm, role:'cust_admin',
      title:i.role && i.role !== '\u2014' ? i.role : 'Account Administrator',
      init:((parts[0]||'?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase(),
      side:'customer', account:acc.id, email:i.email,
    };
    S.users.push(admin);
    acc.admin = admin.id;

    i.state = 'converted'; i.accountId = acc.id;
    emit('account.activated', {account:acc.id,
      text:`Customer account activated for ${acc.name}`,
      notify:'studio', kind:'update', notifyText:`Account activated: ${acc.name}`,
      audit:'Account activated', record:acc.name, was:'—', now:'active'});
    /* The message that turns a qualified inquiry into somebody who can log in.
       It is the first thing they receive that is about them rather than about
       their enquiry, so it says what the account is for before it says how to
       reach it. */
    emit('account.ready', {account:acc.id,
      text:`${acc.name} invited to their account`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:'Your account is ready',
      cta:{label:'Open my account', act:'goSignIn', id:acc.id}, ref:{kind:'account', id:acc.id},
      mail:{to:i.email, toName:acc.name, subject:'Your PAMUUC account is ready',
        lines:[
          `${(i.contact || '').split(' ')[0] || 'Hello'} — we have set up ${acc.name} on our platform.`,
          'Everything about your work with us lives there: the specification as it is drawn, samples as they are made, what needs your decision, and every document and invoice.',
          'There is no password to choose. Sign in with Google, or ask for a one-time code and we will send it to this address.',
          'Nothing is charged for the account. It is simply where the work is.']}});
    emit('user.created', {account:acc.id, customerVisible:false,
      text:`${admin.name} invited as account administrator for ${acc.name}`,
      audit:'Customer user created', record:admin.name, was:'—', now:'cust_admin'});
    save();
    return acc;
  },

  /* ---- studio project builder ------------------------------------------ */
  /* Someone asked for the code. The prototype cannot post email, so it records
     the subscriber and writes the message into the same outbox every other
     customer email goes through — the words are reviewable rather than
     imagined, exactly like the rest. §17.2 */
  joinOffer(id, email){
    const o = (S.offers || []).find(x => x.id === id); if(!o) return;
    S.subscribers = S.subscribers || [];
    const already = S.subscribers.find(x => x.email.toLowerCase() === String(email).toLowerCase());
    if(!already){
      S.subscribers.unshift({id:uid('sub'), email:String(email).trim(), offer:o.id,
        at:nowStamp(), source:'merchandise pop-up'});
    }
    markOfferSeen(o.id, 'joined');

    /* Written straight into the outbox rather than through emit's mail path.
       Two reasons: a code someone just asked for is transactional and goes at
       once, where emit would hold anything not action-required for the daily
       digest; and emit's mail is tied to a customer notification, which this
       person cannot have — they have no account, and may never open one. */
    S.outbox = S.outbox || [];
    S.outbox.unshift({
      id:uid('ml'), at:nowStamp(), to:String(email).trim(), toName:'',
      account:null, project:null,
      subject:`Your ${o.label.toLowerCase()} code: ${o.code}`,
      lines:[
        `Quote ${o.code} on your first request and we apply the discount to the quote before you approve it.`,
        (o.tiers || []).map(t => `${t.say}: ${t.pct}%`).join(' · '),
        'Nothing is charged when you request a quote, and the discount is shown on the quote itself.',
      ],
      cta:null, choices:null, kind:'update', state:'sent',
    });

    emit('offer.joined', {customerVisible:false,
      text:`${email} asked for the ${o.label.toLowerCase()} code`,
      audit:'Offer subscriber added', record:o.code, was:'—', now:email});
    save();
  },

  createProject(d){
    const n = 2460 + S.projects.length;
    const p = {
      id:uid('prj'), ref:'PRJ-'+n, account:d.account, name:d.name,
      am:d.am || SESSION.user, owner:SESSION.user,
      /* Every project carries all eight steps. The three before Design are
         already behind it — they happened on the enquiry — so they are logged
         closed at creation rather than pretended to be still ahead. */
      stages:projectStages(d.design),
      stage:d.design ? 'design' : 'project_build', opStatus:'not_started', risk:null,
      stageLog:['enquiry','qualification','first_call'].map(x => ({
        stage:x, at:d.history && d.history[x] ? d.history[x] : nowStamp(), by:SESSION.user})),
      published:false, version:0, publishedAt:null, draftDirty:true,
      created:S.today, target:d.target || null, brief:d.brief || '',
      gates:{design_fee:d.design?'draft':'not_required', development_invoice:'draft', production_proforma:'not_required'},
      /* Production is invoiced on the account's own terms rather than taken up
         front, so there is no third gate to open. */
      positions:(d.positions||[]).map((pos,ix) => ({
        id:uid('pos'), name:pos.name, people:+pos.people||0, garments:[]})),
      /* Everything below is authored by hand in the Back Office. Nothing is
         computed from a rate card: the price of a project is whatever the
         studio decides it is, garment by garment and line by line. */
      milestones:[], lines:[], boards:[], designs:[],
      proposal:{note:'', publishedAt:null, version:0},
      nextMilestone:null, lastUpdate:nowStamp(),
    };
    /* attach garments chosen in the builder */
    (d.positions||[]).forEach((pos, ix) => {
      (pos.garments||[]).forEach(bid => {
        const b = base(bid); if(!b) return;
        const g = {
          id:uid('g'), project:p.id, position:p.positions[ix].id, base:b.id, baseV:b.v,
          name:b.name, rev:1, state:'in_development', round:0,
          fabric:b.fabrics[0], pers:{method:b.pers[0], pos:b.pos[0], art:null},
          colourways:[{id:uid('cw'), colour:b.colours[0], qty:0, sizes:{}}],
          reorderable:false, glyph:b.glyph, notes:'',
        };
        S.garments.push(g);
        p.positions[ix].garments.push(g.id);
      });
    });
    S.projects.push(p);
    S.conversations.push({id:uid('cv'), account:p.account, project:p.id,
      owner:p.owner, state:'waiting_pamuuc', messages:[]});
    emit('project.created', {project:p.id, account:p.account,
      text:`Project ${p.ref} created`, customerVisible:false,
      notify:'studio', kind:'update', notifyText:`Project ${p.ref} — ${p.name} created`,
      audit:'Project created', record:p.ref, was:'—', now:'draft'});
    save();
    return p;
  },


  /* ========================================================================
     THE PROJECT IS EDITABLE, ALWAYS
     A project is not a form that was filled in once. Positions, garments,
     fabrics, images, prices and payment steps can all be changed at any
     point in its life, including after delivery has started.

     Two rules hold it together:
       · every change is recorded — who, when, what it was, what it is now;
       · a change to a published project is a DRAFT until it is published,
         so the customer never sees a half-finished edit.
     ===================================================================== */

  touch(p, note){
    p.draftDirty = true; p.lastUpdate = nowStamp();
    if(note) p.lastChange = note;
  },

  /* ---- positions --------------------------------------------------------- */
  addPosition(pid, name, people){
    const p = project(pid); if(!p) return null;
    const pos = {id:uid('pos'), name:name || 'New position', people:+people || 0, garments:[]};
    p.positions.push(pos); act.touch(p);
    emit('position.added', {project:p.id, account:p.account, customerVisible:false,
      text:`Position added: ${pos.name}`,
      audit:'Position added', record:p.ref, was:'—', now:pos.name});
    save(); return pos;
  },

  updatePosition(pid, posId, patch){
    const p = project(pid); if(!p) return;
    const pos = p.positions.find(x => x.id === posId); if(!pos) return;
    const was = `${pos.name} · ${pos.people} people`;
    Object.assign(pos, patch); if(patch.people !== undefined) pos.people = +patch.people || 0;
    act.touch(p);
    emit('position.updated', {project:p.id, account:p.account, customerVisible:false,
      text:`Position updated: ${pos.name}`,
      audit:'Position updated', record:p.ref, was, now:`${pos.name} · ${pos.people} people`});
    save();
  },

  removePosition(pid, posId, reason){
    const p = project(pid); if(!p) return;
    const ix = p.positions.findIndex(x => x.id === posId); if(ix < 0) return;
    const pos = p.positions[ix];
    pos.garments.slice().forEach(gid => act.removeGarment(gid, reason || 'Position removed', true));
    p.positions.splice(ix, 1); act.touch(p);
    emit('position.removed', {project:p.id, account:p.account, customerVisible:false,
      text:`Position removed: ${pos.name}`,
      audit:'Position removed', record:p.ref, was:pos.name, now:'—', reason:reason || null});
    save();
  },

  /* ---- garments ---------------------------------------------------------- */
  addGarment(pid, posId, d){
    const p = project(pid); if(!p) return null;
    const pos = p.positions.find(x => x.id === posId); if(!pos) return null;
    const b = base(d.base); if(!b) return null;
    const g = {
      id:uid('g'), project:p.id, position:pos.id, base:b.id, baseV:b.v,
      name:d.name || b.name, rev:1, state:'in_development', round:0,
      fabric:d.fabric || b.fabrics[0],
      pers:{method:d.method || b.pers[0], pos:d.pos || b.pos[0], art:d.art || null},
      /* One garment per person in the position, split across the colours
         chosen. It is the only sensible opening number, and both sides can
         change it — the customer in their project, you here. */
      colourways:(function(){
        const cols = d.colours && d.colours.length ? d.colours : [b.colours[0]];
        const head = +pos.people || 0;
        const each = Math.floor(head / cols.length);
        return cols.map((c, i) => ({id:uid('cw'), colour:c,
          qty:each + (i === 0 ? head - each * cols.length : 0), sizes:{}}));
      })(),
      unitPrice:d.unitPrice != null && d.unitPrice !== '' ? +d.unitPrice : null,
      summary:d.summary || '', images:[],
      reorderable:false, glyph:b.glyph, notes:d.notes || '',
      addedAt:nowStamp(), addedBy:SESSION.user,
    };
    S.garments.push(g); pos.garments.push(g.id); act.touch(p);
    emit('garment.added', {project:p.id, account:p.account, customerVisible:false,
      text:`${g.name} added to ${pos.name}`,
      notify:'studio', kind:'update', notifyText:`${g.name} added to ${p.ref}`,
      audit:'Garment added', record:p.ref, was:'—', now:`${g.name} (${b.ref} ${b.v})`});
    save(); return g;
  },

  updateGarment(gid, patch, reason){
    const g = garment(gid); if(!g) return;
    const p = project(g.project);
    const label = (x) => [x.name, FABRICS[x.fabric] ? FABRICS[x.fabric].name : x.fabric,
      x.unitPrice != null ? money(x.unitPrice) : 'no price'].join(' · ');
    const was = label(g);
    if(patch.pers) { g.pers = Object.assign({}, g.pers, patch.pers); delete patch.pers; }
    if(patch.unitPrice !== undefined)
      patch.unitPrice = patch.unitPrice === '' || patch.unitPrice == null ? null : +patch.unitPrice;
    Object.assign(g, patch);
    act.touch(p);
    emit('garment.updated', {project:p.id, account:p.account, customerVisible:false,
      text:`${g.name} updated`,
      audit:'Garment updated', record:g.id, was, now:label(g), reason:reason || null});
    save();
  },

  /* A garment can be taken out at any moment. If it was approved, the reason
     is not optional — an approved specification is a promise, and withdrawing
     one has to leave a trace that says why. */
  removeGarment(gid, reason, quiet){
    const g = garment(gid); if(!g) return;
    const p = project(g.project);
    const pos = p ? p.positions.find(x => x.garments.includes(gid)) : null;
    if(pos) pos.garments.splice(pos.garments.indexOf(gid), 1);
    S.garments.splice(S.garments.indexOf(g), 1);
    /* nothing may keep pointing at a record that no longer exists */
    S.approvals.filter(a => a.target === gid && a.state === 'awaiting_customer')
      .forEach(a => { a.state = 'withdrawn'; a.decidedAt = nowStamp(); });
    if(p){
      act.touch(p);
      if(!quiet) emit('garment.removed', {project:p.id, account:p.account, customerVisible:false,
        text:`${g.name} removed from ${p.ref}`,
        audit:'Garment removed', record:p.ref, was:`${g.name} · ${st(g.state).label}`, now:'—',
        reason:reason || null});
    }
    save();
  },

  /* ---- images ------------------------------------------------------------
     Images live on the record they belong to and travel with it. They are
     stored inline, so what the customer opens is the file you attached and
     not a link to somewhere else that may be gone by then. */
  addImage(kind, ownerId, img){
    const rec = kind === 'garment' ? garment(ownerId) : project(ownerId);
    if(!rec) return null;
    const p = kind === 'garment' ? project(rec.project) : rec;
    const it = {id:uid('im'), src:img.src, cap:img.cap || '', tag:img.tag || 'Reference',
      at:nowStamp(), by:SESSION.user};
    if(kind === 'garment'){ (rec.images = rec.images || []).push(it); }
    else { (rec.boards = rec.boards || []).push(it); }
    act.touch(p);
    emit('image.added', {project:p.id, account:p.account, customerVisible:false,
      text:`Image added to ${kind === 'garment' ? rec.name : p.ref}${it.cap ? ' — ' + it.cap : ''}`,
      audit:'Image added', record:kind === 'garment' ? rec.id : p.ref, was:'—', now:it.cap || it.tag});
    save(); return it;
  },

  removeImage(kind, ownerId, imgId){
    const rec = kind === 'garment' ? garment(ownerId) : project(ownerId);
    if(!rec) return;
    const list = kind === 'garment' ? (rec.images||[]) : (rec.boards||[]);
    const ix = list.findIndex(x => x.id === imgId); if(ix < 0) return;
    const it = list[ix]; list.splice(ix, 1);
    const p = kind === 'garment' ? project(rec.project) : rec;
    act.touch(p);
    emit('image.removed', {project:p.id, account:p.account, customerVisible:false,
      text:`Image removed`, audit:'Image removed',
      record:kind === 'garment' ? rec.id : p.ref, was:it.cap || it.tag, now:'—'});
    save();
  },

  /* ---- fabrics -----------------------------------------------------------
     A new fabric is a studio-wide record, not a project one: once it exists
     it can be put on any base and chosen on any garment. */
  addFabric(d){
    const id = 'f_' + (d.name || 'fabric').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'') + '_' + Math.random().toString(36).slice(2,5);
    const f = {id, name:d.name, ref:d.ref || 'FB-—', spec:d.spec || '', prov:!!d.prov,
      addedAt:nowStamp(), addedBy:SESSION.user, custom:true};
    FABRICS[id] = f;
    (S.customFabrics = S.customFabrics || []).push(f);
    (d.bases || []).forEach(bid => { const b = base(bid); if(b && !b.fabrics.includes(id)) b.fabrics.push(id); });
    emit('fabric.added', {customerVisible:false,
      text:`Fabric added to the library: ${f.name} (${f.ref})`,
      notify:'studio', kind:'update', notifyText:`New fabric: ${f.name}`,
      audit:'Fabric created', record:f.ref, was:'—', now:`${f.name} · ${f.spec}`});
    save(); return f;
  },

  addFabricToBase(bid, fid){
    const b = base(bid); if(!b || b.fabrics.includes(fid)) return;
    b.fabrics.push(fid);
    emit('base.updated', {customerVisible:false,
      text:`${FABRICS[fid].name} offered on ${b.ref}`,
      audit:'Base fabric added', record:b.ref, was:'—', now:FABRICS[fid].name});
    save();
  },

  /* ---- what we are proposing --------------------------------------------
     The design work itself. It is held back until the milestone that pays
     for it is settled — the customer sees that a design exists and what it
     is waiting on, which is not the same as hiding it. */
  addDesign(pid, d){
    const p = project(pid); if(!p) return null;
    const it = {id:uid('dz'), title:d.title || 'Design proposal', note:d.note || '',
      by:d.by || 'Design partner', images:d.images || [], state:'draft',
      /* what the customer actually receives for a design fee: the document */
      file:d.file || null,
      gate:d.gate || null, at:nowStamp(), addedBy:SESSION.user};
    (p.designs = p.designs || []).push(it); act.touch(p);
    emit('design.added', {project:p.id, account:p.account, customerVisible:false,
      text:`Design added: ${it.title}`,
      audit:'Design added', record:p.ref, was:'—', now:it.title});
    save(); return it;
  },

  publishDesign(pid, did){
    const p = project(pid); if(!p) return;
    const it = (p.designs||[]).find(x => x.id === did); if(!it) return;
    const was = it.state; it.state = 'published'; it.publishedAt = nowStamp();
    act.touch(p);
    emit('design.published', {project:p.id, account:p.account,
      text:`${it.title} released to ${account(p.account).name}`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:`${it.title} is ready for you to look at`,
      cta:{label:'Look at it', act:'goSignIn'}, ref:{kind:'design', id:it.id},
      mail:{subject:`${it.title} is ready to look at`,
        lines:[`${it.title} is published to your account, with what it is and why it is drawn that way.`,
               'Have a look when it suits you. If something is wrong, say so there and it becomes a change we track.']},
      audit:'Design published', record:p.ref, was, now:'published'});
    save();
  },

  removeDesign(pid, did){
    const p = project(pid); if(!p) return;
    const ix = (p.designs||[]).findIndex(x => x.id === did); if(ix < 0) return;
    const it = p.designs[ix]; p.designs.splice(ix,1); act.touch(p);
    emit('design.removed', {project:p.id, account:p.account, customerVisible:false,
      text:`Design removed: ${it.title}`,
      audit:'Design removed', record:p.ref, was:it.title, now:'—'});
    save();
  },

  /* ---- money -------------------------------------------------------------
     Garment prices and extra lines are typed in. There is no rate card
     behind them and no formula: nothing about a bespoke project is standard
     enough to be worth pretending otherwise. */
  addLine(pid, d){
    const p = project(pid); if(!p) return null;
    const l = {id:uid('ln'), label:d.label || 'Line', note:d.note || '', amount:+d.amount || 0};
    (p.lines = p.lines || []).push(l); act.touch(p);
    emit('line.added', {project:p.id, account:p.account, customerVisible:false,
      text:`Cost line added: ${l.label} — ${money(l.amount)}`,
      audit:'Cost line added', record:p.ref, was:'—', now:`${l.label} ${money(l.amount)}`});
    save(); return l;
  },

  removeLine(pid, lid){
    const p = project(pid); if(!p) return;
    const ix = (p.lines||[]).findIndex(x => x.id === lid); if(ix < 0) return;
    const l = p.lines[ix]; p.lines.splice(ix,1); act.touch(p);
    emit('line.removed', {project:p.id, account:p.account, customerVisible:false,
      text:`Cost line removed: ${l.label}`,
      audit:'Cost line removed', record:p.ref, was:`${l.label} ${money(l.amount)}`, now:'—'});
    save();
  },

  /* ---- payment steps -----------------------------------------------------
     A milestone is a payment the studio decides on: what it is called, what
     it costs, which stage it sits against, and what it releases. Until it is
     published it is internal. Once published it becomes a document the
     customer can open and settle, and it holds the stage shut until it is. */
  addMilestone(pid, d){
    const p = project(pid); if(!p) return null;
    const m = {id:uid('ms'), label:d.label || 'Payment', what:d.what || '',
      amount:+d.amount || 0, due:d.due || null, stage:d.stage || null,
      kind:d.kind || 'Invoice', state:'draft', docId:null, at:nowStamp()};
    (p.milestones = p.milestones || []).push(m);
    p.milestones.sort((a,b) => p.stages.indexOf(a.stage) - p.stages.indexOf(b.stage));
    act.touch(p);
    emit('milestone.added', {project:p.id, account:p.account, customerVisible:false,
      text:`Payment step added: ${m.label} — ${money(m.amount)}`,
      audit:'Payment step added', record:p.ref, was:'—',
      now:`${m.label} ${money(m.amount)}${m.stage ? ' at ' + stageDef(m.stage).name : ''}`});
    save(); return m;
  },

  updateMilestone(pid, mid, patch){
    const p = project(pid); if(!p) return;
    const m = (p.milestones||[]).find(x => x.id === mid); if(!m) return;
    const was = `${m.label} ${money(m.amount)}`;
    if(patch.amount !== undefined) patch.amount = +patch.amount || 0;
    Object.assign(m, patch);
    if(m.docId){ const dd = doc(m.docId); if(dd){ dd.title = m.label; dd.amount = m.amount; dd.due = m.due; } }
    act.touch(p);
    emit('milestone.updated', {project:p.id, account:p.account, customerVisible:false,
      text:`Payment step updated: ${m.label}`,
      audit:'Payment step updated', record:p.ref, was, now:`${m.label} ${money(m.amount)}`});
    save();
  },

  removeMilestone(pid, mid){
    const p = project(pid); if(!p) return;
    const ix = (p.milestones||[]).findIndex(x => x.id === mid); if(ix < 0) return;
    const m = p.milestones[ix];
    if(m.docId){ const dd = doc(m.docId); if(dd && dd.state !== 'paid'){ dd.state = 'cancelled'; dd.visible = false; } }
    p.milestones.splice(ix,1); act.touch(p);
    emit('milestone.removed', {project:p.id, account:p.account, customerVisible:false,
      text:`Payment step removed: ${m.label}`,
      audit:'Payment step removed', record:p.ref, was:`${m.label} ${money(m.amount)}`, now:'—'});
    save();
  },

  publishMilestone(pid, mid){
    const p = project(pid); if(!p) return;
    const m = (p.milestones||[]).find(x => x.id === mid); if(!m || m.state !== 'draft') return;
    const n = 320 + S.documents.length;
    const d = {
      id:uid('doc'), account:p.account, project:p.id, milestone:m.id,
      type:m.kind, num:(m.kind === 'Pro forma' ? 'PF-2026-0' : 'INV-2026-0') + n,
      title:m.label, issued:S.today, due:m.due, amount:m.amount,
      state:'payment_due', v:1, visible:true,
    };
    S.documents.push(d);
    m.docId = d.id; m.state = 'payment_due';
    const acc = account(p.account); if(acc) acc.balance = (acc.balance || 0) + m.amount;
    act.touch(p);
    emit('milestone.published', {project:p.id, account:p.account,
      text:`${d.num} issued — ${m.label}, ${money(m.amount)}`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:`${m.label} — ${money(m.amount*1.21)} is ready for your approval`,
      ref:{kind:'document', id:d.id},
      audit:'Payment step issued', record:d.num, was:'draft', now:'payment_due'});
    toast('Payment step issued', `${d.num} is now in the customer's Documents.`);
    save();
  },

  /* ---- decisions ---------------------------------------------------------
     Anything can be sent to the customer as a decision: a proposal, a
     garment, a fabric, a price, a date. They accept it, ask for changes, or
     decline it, and the answer is recorded against the exact revision it was
     asked about. */
  requestDecision(pid, d){
    const p = project(pid); if(!p) return null;
    const a = {
      id:uid('ap'), project:p.id, account:p.account,
      kind:d.title || 'Decision required', target:d.target || null,
      state:'awaiting_customer', due:d.due || null,
      rev:d.rev || ('Version ' + Math.max(1, p.version)),
      summary:d.summary || '', askedAt:nowStamp(), askedBy:SESSION.user,
    };
    S.approvals.push(a); act.touch(p);
    emit('decision.requested', {project:p.id, account:p.account,
      text:`Sent for decision: ${a.kind}`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:`${a.kind} — your decision is needed`,
      ref:{kind:'approval', id:a.id},
      audit:'Decision requested', record:a.id, was:'—', now:'awaiting_customer'});
    toast('Sent to the customer', 'It is on their project now, waiting for a decision.');
    save(); return a;
  },

  withdrawDecision(id){
    const a = by(S.approvals, id); if(!a || a.state !== 'awaiting_customer') return;
    a.state = 'withdrawn'; a.decidedAt = nowStamp();
    emit('decision.withdrawn', {project:a.project, account:a.account, customerVisible:false,
      text:`Withdrawn: ${a.kind}`,
      audit:'Decision withdrawn', record:a.id, was:'awaiting_customer', now:'withdrawn'});
    save();
  },

  publishProject(id){
    const p = project(id); if(!p) return;
    const was = p.version;
    p.version += 1; p.published = true; p.publishedAt = nowStamp();
    p.draftDirty = false; p.lastUpdate = nowStamp();
    if(p.opStatus === 'not_started') p.opStatus = 'in_progress';
    emit('project.published', {project:p.id, account:p.account,
      text:`Version ${p.version} published to the customer`,
      notify:'customer', kind:'update',
      notifyText:`${p.name}: version ${p.version} is now available`,
      mail:{subject:`${p.name} — version ${p.version} published`,
        lines:[`Version ${p.version} of ${p.name} is in your account: the specification as it now stands, with what changed since the last one.`]},
      audit:'Published version', record:p.ref, was:String(was), now:String(p.version)});
    toast('Published', `${p.ref} version ${p.version} is now visible to the customer.`);
    save();
  },

  /* Moves the project to any step, forwards or back. advanceStage stays as the
     one-click path for the ordinary case and calls through to here. */
  setStage(pid, to, reason){
    const p = project(pid); if(!p) return;
    const kind = STAGE_MOVE.kindOf(p, to); if(!kind) return;
    const u = user(SESSION.user);
    if(!STAGE_MOVE.allowed(u, p, kind)){
      toast('Not allowed', kind === 'back'
        ? 'Only the project manager or Master can move a project back.'
        : 'Only Master can move a project out of sequence.'); return; }
    if(STAGE_MOVE.needsReason(kind) && !(reason || '').trim()){
      toast('A reason is required', 'Anything other than a plain advance is recorded with why.'); return; }

    const was = p.stage;
    const i = p.stages.indexOf(was), j = p.stages.indexOf(to);
    p.stageLog = p.stageLog || [];
    if(kind === 'back'){
      /* the steps between here and there are no longer finished, so their
         completion entries go — a history that claims a step closed when the
         project is back inside it is worse than no history at all */
      p.stageLog = p.stageLog.filter(x => p.stages.indexOf(x.stage) < j);
    } else {
      /* everything stepped over is marked closed now, by whoever did it */
      for(let k = i; k < j; k++){
        if(!p.stageLog.some(x => x.stage === p.stages[k]))
          p.stageLog.push({stage:p.stages[k], at:nowStamp(), by:u.id, forced:kind !== 'next' || undefined});
      }
    }
    p.stage = to; p.lastUpdate = nowStamp();
    /* Production is billed on the account's terms, so entering it opens no
       gate and takes no money up front. */

    const back = kind === 'back';
    emit('project.stage', {project:p.id, account:p.account,
      text:`Stage ${back ? 'moved back' : 'advanced'}: ${stageDef(was).name} → ${stageDef(to).name}` +
        (reason ? ' (recorded reason)' : ''),
      notify:'customer', kind:'update',
      notifyText:back ? `${p.name} has gone back to ${stageDef(to).name}`
                      : `${p.name} has moved to ${stageDef(to).name}`,
      ref:{kind:'project_stage', id:p.id},
      mail:{subject:`${p.name} is now at ${stageDef(to).name}`,
        lines:[back
          ? `We have taken ${p.name} back to ${stageDef(to).name}. ${reason || ''}`.trim()
          : `${p.name} is now at ${stageDef(to).name}. The dates on your account move with it.`,
          'Everything already approved stays approved — nothing you decided is undone by this.']},
      audit: back ? 'Stage moved back' : kind === 'next' ? 'Stage advanced' : 'Stage override',
      record:p.ref, was, now:to, reason:reason || null});
    toast(back ? 'Moved back' : 'Stage changed', `${p.ref} is now in ${stageDef(to).name}.`);
    save();
  },

  /* Sets a controlled state directly. The escape hatch for when a record is
     simply wrong: it changes the state and writes who, what, from, to and why,
     and it tells the customer nothing — an override is a correction to our own
     record, not news. Use the ordinary action when they should hear about it. */
  overrideState(kind, id, value, reason){
    const u = user(SESSION.user);
    if(!can(u,'phase_override','do')){ toast('Not allowed','Only Master can override a record.'); return; }
    if(!(reason || '').trim()){ toast('A reason is required','Every override is recorded with why.'); return; }
    if(!(OVERRIDE_STATES[kind] || []).includes(value)) return;

    let rec = null, was = null, label = '', pid = null;
    if(kind === 'project'){ rec = project(id); if(!rec) return;
      was = rec.opStatus; rec.opStatus = value; label = rec.ref; pid = rec.id; }
    else if(kind === 'garment'){ rec = garment(id); if(!rec) return;
      was = rec.state; rec.state = value; label = rec.name; pid = rec.project; }
    else if(kind === 'document'){ rec = doc(id); if(!rec) return;
      was = rec.state; rec.state = value; label = rec.num; pid = rec.project; }
    else if(kind === 'approval'){ rec = by(S.approvals, id); if(!rec) return;
      was = rec.state; rec.state = value; label = rec.kind; pid = rec.project; }
    else if(kind === 'milestone'){
      for(const p of S.projects){ const m = by(p.milestones || [], id);
        if(m){ rec = m; was = m.state; m.state = value; label = m.label; pid = p.id; break; } }
      if(!rec) return; }
    else if(kind === 'gate'){
      const [prj, key] = String(id).split('|'); const p = project(prj); if(!p || !p.gates) return;
      rec = p.gates; was = p.gates[key]; p.gates[key] = value; label = key.replace(/_/g,' '); pid = p.id; }
    if(was === value) return;

    if(pid){ const p = project(pid); if(p) p.lastUpdate = nowStamp(); }
    emit('record.override', {project:pid, account:pid ? project(pid).account : null,
      customerVisible:false,
      text:`Override: ${label} — ${st(was) ? st(was).label : was} → ${st(value).label}`,
      audit:'Record overridden', record:label, was, now:value, reason});
    toast('Overridden', `${label} is now ${st(value).label.toLowerCase()}. Written to the audit log.`);
    save();
  },

  /* the ordinary one-click path: forward to the next step. Everything about
     how a move is recorded lives in setStage, so there is only one of it. */
  advanceStage(id, reason){
    const p = project(id); if(!p) return;
    const ns = nextStage(p); if(!ns) return;
    act.setStage(id, ns, reason);
  },

  /* ---- customer change requests ---------------------------------------- */
  submitChangeRequest(cr){
    const rec = Object.assign({id:uid('cr'), by:SESSION.user, at:nowStamp(),
      state:'submitted', owner:project(cr.project).am}, cr);
    S.changeRequests.unshift(rec);
    emit('cr.submitted', {project:rec.project, account:rec.account,
      text:`Change request submitted: ${rec.title}`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`${account(rec.account).name}: ${rec.title}`,
      audit:'Change request created', record:rec.id, was:'—', now:'submitted'});
    toast('Request submitted', 'PAMUUC will review it. Nothing has changed in your approved specification.');
    save();
    return rec;
  },

  decideChangeRequest(id, outcome, note){
    const cr = by(S.changeRequests, id); if(!cr) return;
    const was = cr.state;
    cr.state = outcome; cr.decidedAt = nowStamp(); cr.decidedBy = SESSION.user; cr.outcome = note || '';
    emit('cr.decided', {project:cr.project, account:cr.account,
      text:`Change request ${st(outcome).label.toLowerCase()}: ${cr.title}`,
      notify:'customer', kind:outcome === 'declined' ? 'update' : 'update',
      notifyText:`Your request "${cr.title}" was ${st(outcome).label.toLowerCase()}`,
      audit:'Change request decided', record:cr.id, was, now:outcome, reason:note || null});
    toast('Decision recorded', outcome === 'declined'
      ? 'The approved specification is unchanged.'
      : 'Now incorporate it into a new revision to make it real.');
    save();
  },

  incorporateChangeRequest(id){
    const cr = by(S.changeRequests, id); if(!cr) return;
    const was = cr.state; cr.state = 'incorporated';
    const p = project(cr.project);
    if(cr.garment){
      const g = garment(cr.garment);
      if(g){
        g.rev += 1;
        /* apply the one structural change this fixture knows how to apply */
        if(cr.applyColourway){
          const existing = g.colourways.find(c => c.colour === cr.applyColourway.colour);
          if(existing){ existing.qty = cr.applyColourway.qty; }
          else g.colourways.push({id:uid('cw'), colour:cr.applyColourway.colour,
            qty:cr.applyColourway.qty, sizes:{}});
        }
      }
    }
    if(cr.applyPositionName){
      const pos = p.positions.find(x => x.name === cr.applyPositionName.was);
      if(pos) pos.name = cr.applyPositionName.now;
    }
    p.draftDirty = true; p.lastUpdate = nowStamp();
    emit('cr.incorporated', {project:cr.project, account:cr.account,
      text:`Incorporated into a new revision: ${cr.title}`,
      notify:'studio', kind:'update', notifyText:`${cr.title} incorporated — publish to make it visible`,
      audit:'Change request incorporated', record:cr.id, was, now:'incorporated'});
    toast('Incorporated', 'A new revision exists. Publish the project to show it to the customer.');
    save();
  },

  /* ---- approvals -------------------------------------------------------- */
  decideApproval(id, decision, comment){
    const a = by(S.approvals, id); if(!a) return;
    const was = a.state;
    a.state = decision === 'approve' ? 'approved'
            : decision === 'decline' ? 'declined' : 'changes_requested';
    a.decidedAt = nowStamp(); a.decidedBy = SESSION.user; a.comment = comment || '';
    const verb = decision === 'approve' ? 'accepted'
               : decision === 'decline' ? 'declined' : 'requested changes on';
    emit('approval.decided', {project:a.project, account:a.account,
      text:`${a.kind} — ${st(a.state).label.toLowerCase()} by ${user(SESSION.user).name}`,
      notify:'studio', kind:'action', actionRequired:decision !== 'approve',
      notifyText:`${account(a.account).name} ${verb}: ${a.kind}`,
      audit:'Decision recorded', record:a.id, was, now:a.state, reason:comment || null});
    toast(decision === 'approve' ? 'Accepted' : decision === 'decline' ? 'Declined' : 'Changes requested',
      decision === 'approve' ? 'Recorded against this exact revision.'
        : 'PAMUUC has been notified and will come back to you.');
    save();
  },

  /* ---- prototypes: state and round belong to the GARMENT ---------------- */
  approveGarment(id, note){
    const g = garment(id); if(!g) return;
    const was = g.state;
    g.state = 'approved'; g.approvedAt = S.today;
    (g.feedback = g.feedback || []).push({by:SESSION.user, at:nowStamp(), text:note || 'Approved as sampled.', decision:'approved'});
    const p = project(g.project);
    /* close the matching approval record */
    const a = S.approvals.find(x => x.target === g.id && x.state === 'awaiting_customer');
    if(a){ a.state = 'approved'; a.decidedAt = nowStamp(); a.decidedBy = SESSION.user; }
    emit('garment.approved', {project:g.project, account:p.account,
      text:`${g.name} approved at round ${g.round} — locked at revision ${g.rev}`,
      notify:'studio', kind:'update', notifyText:`${g.name} approved by the customer`,
      audit:'Garment approved', record:g.id, was, now:'approved'});
    toast('Garment approved', `${g.name} is locked at revision ${g.rev}. Other garments are unaffected.`);
    save();
  },

  requestGarmentChanges(id, text){
    const g = garment(id); if(!g) return;
    const p = project(g.project);
    const was = g.state;
    (g.feedback = g.feedback || []).push({by:SESSION.user, at:nowStamp(), text, decision:'changes'});
    if(g.round >= 3){
      g.state = 'manual_resolution';
      emit('garment.round_limit', {project:g.project, account:p.account,
        text:`${g.name} reached round 3 without approval — manual resolution required`,
        notify:'studio', kind:'action', actionRequired:true,
        notifyText:`ROUND LIMIT: ${g.name} on ${p.ref} needs a Master decision`,
        audit:'Round limit reached', record:g.id, was, now:'manual_resolution'});
      toast('We will contact you', 'This garment has reached its third round. PAMUUC will call you about it directly.');
    } else {
      g.state = 'changes_requested';
      emit('garment.changes', {project:g.project, account:p.account,
        text:`${g.name}: changes requested — a new round will be authorised`,
        notify:'studio', kind:'action', actionRequired:true,
        notifyText:`${g.name} needs another prototype round`,
        audit:'Garment changes requested', record:g.id, was, now:'changes_requested'});
      toast('Feedback recorded', 'Approved garments are unaffected — only this one goes back into development.');
    }
    p.lastUpdate = nowStamp();
    save();
  },

  authoriseRound(id){
    const g = garment(id); if(!g) return;
    if(g.round >= 3) return;
    const was = g.round;
    g.round += 1; g.rev += 1; g.state = 'in_development';
    emit('garment.round', {project:g.project, account:project(g.project).account,
      text:`${g.name}: prototype round ${g.round} authorised (revision ${g.rev})`,
      notify:'customer', kind:'update', notifyText:`A new sample of ${g.name} is being made`,
      mail:{subject:`A new sample of ${g.name} is being made`,
        lines:[`We are making another ${g.name} with the changes you asked for. We will tell you when it ships.`]},
      audit:'Prototype round authorised', record:g.id, was:String(was), now:String(g.round)});
    toast('Round authorised', `${g.name} is now at round ${g.round} of a maximum of 3.`);
    save();
  },

  readyForFitting(id){
    const g = garment(id); if(!g) return;
    const was = g.state; g.state = 'feedback_required';
    emit('garment.ready', {project:g.project, account:project(g.project).account,
      text:`${g.name}: sample ready, fitting feedback requested`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:`Fitting feedback needed on ${g.name}`,
      ref:{kind:'garment', id:g.id},
      audit:'Garment state changed', record:g.id, was, now:'feedback_required'});
    save();
  },

  resolveException(id, resolution, reason){
    const g = garment(id); if(!g) return;
    const was = g.state;
    if(resolution === 'exception'){ g.state = 'approved'; g.approvedAt = S.today; }
    if(resolution === 'drop'){ g.state = 'superseded'; g.dropped = true; }
    if(resolution === 'requote'){ g.state = 'in_development'; g.round = 1; g.rev += 1; g.requoted = true; }
    emit('garment.resolved', {project:g.project, account:project(g.project).account,
      text:`${g.name}: Master resolution — ${resolution}`,
      notify:'customer', kind:'update', notifyText:`We have a way forward on ${g.name}`,
      audit:'Master resolution', record:g.id, was, now:g.state, reason});
    toast('Resolution recorded', 'The project can advance once every other garment is approved.');
    save();
  },

  /* ---- meetings --------------------------------------------------------- */
  acceptSlot(id, slot){
    const m = by(S.meetings, id); if(!m) return;
    const was = m.state; m.state = 'accepted'; m.chosen = slot;
    emit('meeting.accepted', {project:m.project, account:m.account,
      text:`Fitting confirmed for ${dateTime(slot)}`,
      notify:'studio', kind:'update', notifyText:`Customer accepted ${dateTime(slot)} for ${m.kind}`,
      audit:'Meeting accepted', record:m.id, was, now:'accepted'});
    toast('Date confirmed', dateTime(slot) + ' — the other proposed times are now closed.');
    save();
  },

  requestAlternative(id, note){
    const m = by(S.meetings, id); if(!m) return;
    const was = m.state; m.state = 'alternative'; m.note = note;
    emit('meeting.alternative', {project:m.project, account:m.account,
      text:'Customer asked for a different fitting date',
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:'A different fitting date was requested',
      audit:'Meeting alternative requested', record:m.id, was, now:'alternative', reason:note});
    toast('Sent', 'Your original proposals are kept. PAMUUC will propose new times.');
    save();
  },

  /* ---- documents and payments ------------------------------------------ */
  approveDocument(id){
    const d = doc(id); if(!d) return;
    const was = d.state; d.state = 'payment_due'; d.approvedAt = nowStamp();
    emit('doc.approved', {project:d.project, account:d.account,
      text:`${d.num} approved by ${user(SESSION.user).name}`,
      notify:'studio', kind:'update', notifyText:`${d.num} approved — payment now due`,
      audit:'Document approved', record:d.num, was, now:'payment_due'});
    save();
  },

  /* The customer tells us the money has left their side. It is not payment —
     it is the prompt that sends someone to look at the bank. §14.2 */
  declarePayment(id, ref){
    const d = doc(id); if(!d || (d.state !== 'payment_due' && d.state !== 'overdue')) return;
    const was = d.state;
    d.state = 'payment_sent'; d.declaredAt = nowStamp(); d.declaredBy = SESSION.user;
    d.payRef = ref || '';
    emit('doc.payment_declared', {project:d.project, account:d.account,
      text:`${account(d.account).name} says ${d.num} has been transferred`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`Check the bank for ${d.num} — ${money(d.amount*1.21)}`,
      ref:{kind:'document', id:d.id},
      audit:'Transfer declared by customer', record:d.num, was, now:'payment_sent',
      reason:ref || null});
    toast('Thank you', 'We will confirm here as soon as it reaches the bank.');
    save();
  },

  /* Recording receipt is a studio act, and only ever after someone has seen
     the money in the bank. The customer's own click can never reach here. */
  payDocument(id){
    const d = doc(id); if(!d) return;
    if(!can(user(SESSION.user),'payments','settle')){
      toast('Not yours to confirm', 'A payment is recorded by PAMUUC once it reaches the bank.'); return; }
    const was = d.state; d.state = 'paid'; d.paidAt = nowStamp(); d.settledBy = SESSION.user;
    const p = d.project ? project(d.project) : null;
    if(p){
      const m = milestones(p).find(x => x.id === d.milestone || x.docId === d.id);
      if(m) m.state = 'paid';
      if(p.gates){
        if(/Development/i.test(d.title)) p.gates.development_invoice = 'paid';
        if(d.type === 'Pro forma')       p.gates.production_proforma = 'paid';
      }
      p.lastUpdate = nowStamp();
    }
    const acc = account(d.account); if(acc) acc.balance = Math.max(0, acc.balance - (d.amount||0));
    /* close the matching approval */
    const a = S.approvals.find(x => x.target === d.id && x.state === 'awaiting_customer');
    if(a){ a.state = 'approved'; a.decidedAt = nowStamp(); a.decidedBy = SESSION.user; }
    emit('doc.paid', {project:d.project, account:d.account,
      text:`${d.num} recorded as paid — ${money(d.amount)}`,
      notify:'customer', kind:'update',
      notifyText:`Payment received for ${d.title} — thank you`,
      ref:{kind:'document', id:d.id},
      mail:{subject:`We have received your payment for ${d.title}`,
        lines:[`${d.num} for ${money(d.amount*1.21)} has reached our account. Thank you.`,
               p ? `Work on ${p.name} continues from here — nothing further is needed from you on this invoice.`
                 : 'Nothing further is needed from you on this invoice.']},
      audit:'Payment recorded', record:d.num, was, now:'paid'});
    toast('Payment recorded', p ? 'The commercial gate on ' + p.ref + ' is now open.' : 'Thank you.');
    save();
  },

  publishDocument(id){
    const d = doc(id); if(!d) return;
    const was = d.state;
    d.visible = true; d.state = 'payment_due'; d.issued = S.today;
    if(!d.due){ const dt = new Date(S.today); dt.setDate(dt.getDate()+30); d.due = dt.toISOString().slice(0,10); }
    emit('doc.published', {project:d.project, account:d.account,
      text:`${d.num} published to the customer`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:`${d.title} is ready for your approval`,
      ref:{kind:'document', id:d.id},
      audit:'Document published', record:d.num, was, now:d.state});
    toast('Published', d.num + ' is now visible in the customer account.');
    save();
  },

  /* ---- garment editing (customer draft → request, studio → direct) ----- */
  setColourwayQty(gid, cwid, qty){
    const g = garment(gid); if(!g) return;
    const cw = g.colourways.find(c => c.id === cwid); if(!cw) return;
    cw.qty = Math.max(0, +qty||0);
    project(g.project).draftDirty = true;
  },
  setSize(gid, cwid, size, n){
    const g = garment(gid); if(!g) return;
    const cw = g.colourways.find(c => c.id === cwid); if(!cw) return;
    cw.sizes = cw.sizes || {}; cw.sizes[size] = Math.max(0, +n||0);
    project(g.project).draftDirty = true;
  },
  addColourway(gid, colour){
    const g = garment(gid); if(!g) return;
    if(g.colourways.some(c => c.colour === colour)) return;
    g.colourways.push({id:uid('cw'), colour, qty:0, sizes:{}});
    project(g.project).draftDirty = true;
  },
  removeColourway(gid, cwid){
    const g = garment(gid); if(!g) return;
    g.colourways = g.colourways.filter(c => c.id !== cwid);
    project(g.project).draftDirty = true;
  },
  setFabric(gid, fid){
    const g = garment(gid); if(!g) return;
    const was = g.fabric; g.fabric = fid;
    emit('garment.fabric', {project:g.project, account:project(g.project).account,
      text:`${g.name}: fabric changed to ${FABRICS[fid].name}`,
      audit:'Fabric changed', record:g.id, was:FABRICS[was]?.name, now:FABRICS[fid].name});
    save();
  },

  /* ---- reorders --------------------------------------------------------- */
  submitReorder(gid, lines, dest){
    const g = garment(gid); if(!g) return;
    const qty = lines.reduce((t,l)=>t+(+l.qty||0),0);
    const r = {id:uid('ro'), account:user(SESSION.user).account, garment:gid,
      at:nowStamp(), qty, state:'submitted', lines, dest,
      value:qty * (g.unitPrice||0), sourceRev:g.rev};
    S.reorders.unshift(r);
    emit('reorder.submitted', {account:r.account, project:g.project,
      text:`Reorder submitted: ${qty} × ${g.name} from the approved revision ${g.rev} snapshot`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`Reorder request: ${qty} × ${g.name}`,
      audit:'Reorder submitted', record:r.id, was:'—', now:'submitted'});
    toast('Reorder submitted', `Cloned from the locked revision ${g.rev} specification — no substitutions.`);
    save();
    return r;
  },

  /* ---- merchandise ------------------------------------------------------ */
  submitMerchQuote(q){
    const rec = Object.assign({id:uid('mq'), at:nowStamp(), state:'submitted'}, q);
    S.merchQuotes.unshift(rec);
    emit('merch.quote', {account:rec.account || null,
      text:`Merchandise quote requested: ${rec.qty} × ${rec.productName}`,
      notify:'studio', kind:'action', actionRequired:true,
      notifyText:`Merchandise quote: ${rec.qty} × ${rec.productName}`,
      audit:'Merchandise quote requested', record:rec.id, was:'—', now:'submitted'});
    save();
    return rec;
  },

  /* Merchandise keeps its own short path rather than becoming a project: a
     request is a price on a catalogue garment, and it is either taken up or it
     is not. submitted -> quoted -> won | lost, and nothing else. */
  priceMerchQuote(id, unit, note){
    const q = by(S.merchQuotes, id); if(!q) return;
    const was = q.state;
    const n = Number(unit);
    if(isFinite(n) && n > 0){
      q.quotedUnit = n;
      q.quotedTotal = +(n * (+q.qty || 1)).toFixed(2);
    }
    q.quoteNote = note || '';
    q.quotedAt = nowStamp();
    q.quotedBy = SESSION && SESSION.user;
    q.state = 'quoted';
    emit('merch.quoted', {account:q.account || null,
      text:`Quote sent for ${q.qty} × ${q.productName}`,
      notify:'customer', kind:'action', actionRequired:true,
      notifyText:`Your price for ${q.qty} × ${q.productName} is ready`,
      cta:{label:'See the price', act:'goSignIn'}, ref:{kind:'quote', id:q.id},
      mail:{subject:`Your price for ${q.qty} × ${q.productName}`,
        lines:[
          `We have priced ${q.qty} × ${q.productName} in ${q.colourName}.`,
          note ? note : 'Setup, delivery and anything else that applies are on the quote itself.',
          'It is in your account under Merchandise. Tell us to go ahead and we will put it into production.']},
      audit:'Merchandise quote priced', record:q.id, was, now:'quoted',
      reason:note || null});
    save();
  },
  closeMerchQuote(id, outcome, reason){
    const q = by(S.merchQuotes, id); if(!q) return;
    const was = q.state;
    q.state = outcome === 'won' ? 'won' : 'lost';
    q.closedAt = nowStamp();
    q.closedBy = SESSION && SESSION.user;
    if(outcome !== 'won') q.lostReason = reason || '';
    emit(outcome === 'won' ? 'merch.won' : 'merch.lost', {account:q.account || null,
      text:`${q.qty} × ${q.productName} — ${st(q.state).label}`,
      notify:'customer', kind:'update',
      notifyText:outcome === 'won'
        ? `Confirmed: ${q.qty} × ${q.productName} is going into production`
        : `Closed: ${q.qty} × ${q.productName}`,
      audit:'Merchandise quote closed', record:q.id, was, now:q.state,
      reason:reason || null});
    save();
  },
  reopenMerchQuote(id){
    const q = by(S.merchQuotes, id); if(!q) return;
    const was = q.state;
    q.state = q.quotedAt ? 'quoted' : 'submitted';
    emit('merch.reopened', {account:q.account || null,
      text:`${q.qty} × ${q.productName} reopened`,
      notify:'studio', kind:'update', notifyText:`Reopened: ${q.qty} × ${q.productName}`,
      audit:'Merchandise quote reopened', record:q.id, was, now:q.state});
    save();
  },

  /* One message a day per account, holding everything that only needed
     saying. Sent as itself rather than reviewed: it repeats what the platform
     already told them, and holding it would make it stale. */
  sendDigest(accId){
    const held = (S.digest || []).filter(m => (m.account || null) === (accId || null));
    if(!held.length) return null;
    const acc = accId ? account(accId) : null;
    const to = held[0].to;
    const item = {
      id:uid('ml'), at:nowStamp(), to, toName:acc ? acc.name : held[0].toName,
      account:accId || null, project:null,
      subject:held.length === 1 ? held[0].subject : `${held.length} updates on your work with PAMUUC`,
      lines:[
        'Here is what moved since we last wrote. Nothing here needs an answer — anything that did would have reached you on its own.',
      ].concat(held.map(m => '· ' + m.subject))
       .concat(['Everything is in your account, where it is easier to look at than to read about.']),
      cta:{label:'Open my account', act:'goSignIn'}, kind:'update', state:'sent',
    };
    S.outbox.unshift(item);
    S.digest = (S.digest || []).filter(m => (m.account || null) !== (accId || null));
    emit('mail.digest', {account:accId || null, customerVisible:false,
      text:`Daily summary sent to ${to} — ${held.length} update${held.length===1?'':'s'}`,
      audit:'Daily summary sent', record:item.id, was:`${held.length} held`, now:'sent'});
    save();
    return item;
  },

  /* ---- catalogue import ------------------------------------------------- */
  importCatalogue(v){
    const products = catalogueToProducts(v);
    const before = S.merchProducts.length;
    S.merchProducts = products;
    S.decoRates = catalogueToRates(v);
    /* imported by hand here: keep it across reloads instead of refreshing it
       back to the catalogue this build happens to ship with */
    S.merchImported = true;
    emit('merch.imported', {
      text:`Merchandise catalogue imported — ${products.length} products, ` +
        `${v.byType.variant.length} variants, ${v.byType.image.length} images`,
      customerVisible:false,
      notify:'studio', kind:'update',
      notifyText:`Catalogue replaced: ${products.length} products imported from CSV`,
      audit:'Catalogue imported', record:'merchandise',
      was:`${before} products`, now:`${products.length} products`,
      reason:`${v.warnings} warning${v.warnings===1?'':'s'} accepted`});
    /* the import is one audit entry, not one per row — §6.13 */
    S.audit[0].source = 'import';
    toast('Catalogue imported',
      `${products.length} products are now live on the public catalogue and in every customer account.`);
    save();
  },

  /* ---- self-serve merchandise account -----------------------------------
     Merchandise opens an account immediately. A custom uniform project still
     requires qualification and a first call — the two are deliberately not
     the same gate. */
  openMerchAccount(company, email){
    const acc = {
      id:uid('acc'), name:company, country:'Spain', city:'—', since:S.today,
      am:'u_nuria', status:'active', terms:'30 days from invoice date',
      currency:'EUR', vat:'—', locations:[],
      modules:{projects:false, reorders:false, merchandise:true, documents:true, payments:true},
      balance:0, selfServe:true,
    };
    S.accounts.push(acc);
    const u = {id:uid('u'), name:email.split('@')[0], role:'cust_admin',
      title:'Account Admin', init:email.slice(0,2).toUpperCase(), side:'customer', account:acc.id};
    S.users.push(u);
    S.merchQuotes.filter(q => !q.account).forEach(q => { q.account = acc.id; });
    SESSION = {user:u.id};
    emit('account.merch', {account:acc.id,
      text:`Merchandise account opened by ${email}`,
      notify:'studio', kind:'update', notifyText:`New merchandise account: ${company}`,
      audit:'Merchandise account opened', record:company, was:'—', now:'active'});
    toast('Account created', 'Your quote request is waiting in Merchandise.');
    save();
    return acc;
  },

  /* ---- conversation ----------------------------------------------------- */
  sendMessage(cvid, text, internal){
    const cv = by(S.conversations, cvid); if(!cv || !text.trim()) return;
    cv.messages.push({by:SESSION.user, at:nowStamp(), text:text.trim(), internal:!!internal});
    const fromCustomer = user(SESSION.user).side === 'customer';
    cv.state = fromCustomer ? 'needs_reply' : 'waiting_customer';
    if(!internal){
      emit('message', {project:cv.project, account:cv.account,
        text:`${user(SESSION.user).name} sent a message`,
        notify: fromCustomer ? 'studio' : 'customer', kind:'message',
        notifyText: fromCustomer
          ? `${account(cv.account).name}: new message on ${project(cv.project)?.name || 'the account'}`
          : `PAMUUC replied about ${project(cv.project)?.name || 'your account'}`});
    }
    save();
  },

  markRead(side){
    /* A customer marks their own account's notifications read, not every
       customer's. The studio side is one desk and does mean all of them. */
    const acc = side === 'customer' ? (myAccount() || {}).id : null;
    S.notifications.filter(n => n.to === side && (!acc || n.account === acc))
      .forEach(n => n.read = true);
    save();
  },
};
/* ============================================================================
   PAMUUC SUITE — public website
   One domain, two businesses. The root is a service choice; past it you are in
   PAMUUC Studio (custom uniform development) or PAMUUC Merchandise (catalogue
   products personalised to order). Structure follows the website structure and
   conversion specification of 11 September 2026.

   Two rules that specification is strict about and that the code enforces:
   - An enquiry creates an enquiry. A quote request creates a quote request.
     Neither is an order, an account, or a project.
   - Nothing states a number the business has not approved. Where a figure is
     unconfirmed the copy says it is confirmed on review.
   ========================================================================= */

/* The Studio is deliberately three things and no more: one page, the
   questionnaire it feeds, and the journal. Sector, role and process pages
   are planned as SEO and GEO entries from the footer, and are not in this
   mockup. */
const PUB_BRANCH = {
  custom:'custom', form:'custom', review:'custom', done:'custom',
  merch:'merch', collections:'merch', collection:'merch', products:'merch', build:'merch',
  product:'merch', search:'merch', method:'merch', howto:'merch',
  merchhelp:'merch', quote:'merch', qcontact:'merch', qreview:'merch', qdone:'merch',
};

const BRANCH_NAV = {
  custom:[{j:'industries',n:'Industries'},{j:'how',n:'How it works'},
          {j:'work',n:'Work'},{p:'blog',n:'Journal'}],
  merch: [{p:'products',n:'Products'},{p:'collections',n:'Collections'},
          {p:'method',n:'Personalisation'},{p:'howto',n:'How to order'},{p:'blog',n:'Journal'}],
};

const BRANCH_META = {
  custom:{name:'PAMUUC Studio', short:'Studio', home:'custom', other:'merch',
          cta:{p:'form', n:'Start your project brief'}},
  merch: {name:'PAMUUC Merchandise', short:'Merchandise', home:'merch', other:'custom',
          cta:null},
};

/* ---- collections -------------------------------------------------------- */
const CAT_ORDER = ['T-shirts','Polos','Shirts','Sweatshirts','Outerwear','Pants & shorts','Accessories'];
const CAT_LABEL = {'Pants & shorts':'Trousers and shorts'};
/* Chopping the final "s" gives "accessorie" and "trousers and short", so the
   singular each family actually uses is written down. */
const CAT_ONE = {'T-shirts':'t-shirt', 'Polos':'polo', 'Shirts':'shirt',
  'Sweatshirts':'sweatshirt', 'Outerwear':'jacket', 'Pants & shorts':'pair',
  'Accessories':'accessory'};
const catOne = (c) => CAT_ONE[c] || catName(c).replace(/s$/, '').toLowerCase();
const CAT_COPY = {
  'T-shirts':      'Custom T-shirts for companies. Compare fits, cloth weights and colours.',
  'Polos':         'Branded polo shirts for staff and everyday company wear.',
  'Shirts':        'Branded shirts for staff uniforms and hospitality teams.',
  'Sweatshirts':   'Personalised sweatshirts and embroidered hoodies for teams and events.',
  'Outerwear':     'Embroidered jackets and outer layers for staff and outdoor teams.',
  'Pants & shorts':'Branded joggers, trousers and shorts to complete the outfit.',
  'Accessories':   'Add the details that carry your brand beyond the garment.',
};
const catName = (c) => CAT_LABEL[c] || c;
const catSlug = (c) => String(c).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const catList = (c) => S.merchProducts.filter(p => p.cat === c);
function catsInUse(){
  const present = [...new Set(S.merchProducts.map(p => p.cat).filter(Boolean))];
  return CAT_ORDER.filter(c => present.includes(c))
    .concat(present.filter(c => !CAT_ORDER.includes(c)).sort());
}
/* A collection has two spellings: the keyword one we publish as its address
   ("polo-shirts", "jackets") and the plain one taken from its display name.
   The published address is what links and canonicals use, so it must resolve;
   the plain one stays a valid alias so older links keep working. */
const catFromSlug = (s) =>
  catsInUse().find(c => merchSlug(c) === s || catSlug(c) === s) || null;
const catCopy = (c) => CAT_COPY[c] ||
  `Products in the ${String(catName(c)).toLowerCase()} collection, quoted and decorated on the same terms as the rest of the catalogue.`;

/* Every product is between photo shoots: the catalogue ships without imagery
   and the new pictures arrive with the next import. One shared placeholder
   stands in, square like the real thing, and says plainly that it is one. */
/* ---- product photography on the Shopify CDN -------------------------------
   The studio's own store hosts the packshots, so the suite carries none of the
   bytes. A URL is DERIVED from the garment and the colour rather than stored:
   {sku}_{colour}_{view}.jpg, all lowercase, which is exactly how the files are
   named on the CDN. Nothing to keep in sync, and a photograph appears here the
   moment it is uploaded there.

   `?width=` is Shopify's own transform, so one master serves every size, and
   it negotiates WebP or AVIF per browser — a 65 KB JPEG lands as 5 KB. */
/* The photographs live on the studio's Shopify CDN, and the deployed site will
   read them straight from there. This prototype cannot: the artifact CSP
   admits no external image host, which is why every other photograph here is
   a data URI too. So the packs are pulled from that same CDN at build time and
   embedded, keyed by the CDN's own filename — one naming rule, two homes. */
const SHOP_CDN = 'https://cdn.shopify.com/s/files/1/0577/3688/8485/files/';
/* The photograph packs the page ships with. The front on-model shots outgrew
   what one published file may hold, so they come in halves; nothing else about
   them differs and a lookup simply tries each in turn. */
/* Each set of photographs is split across as many files as it needs — one
   published file may only hold so much — so a set is named as a group and the
   halves that happen to exist are collected once, here. Adding another file to
   a set means adding its name to the list and nothing else. */
const PACK_NAMES = {
  model:  ['MODEL', 'MODEL_1', 'MODEL_2', 'MODEL_3', 'MODEL_4'],
  back:   ['MODELB', 'MODELB_1', 'MODELB_2'],
  swatch: ['SWATCH', 'SWATCH_1'],
  alt:    ['HEROALT', 'HEROALT_1'],
};
/* The packs are the bulk of this build — around fifty megabytes of photography
   against one of everything else. Loaded before the app, the page stays blank
   for the whole transfer; loaded after it, the catalogue is on screen in about
   a second and the photographs arrive into it. So the packs are bound on
   arrival rather than once at startup, and whatever has landed is what a
   lookup sees: before any of it, every image falls back to the placeholder the
   page already knows how to draw. */
const PACKS = {};
/* Declared here rather than beside cardPicks: bindPacks clears it, and
   bindPacks runs while this file is still executing, so a `let` further down
   would still be in its dead zone and take the whole script with it. */
let CARD_PICK = null, CARD_PICK_FOR = null;

function bindPacks(){
  for(const set in PACK_NAMES){
    PACKS[set] = PACK_NAMES[set].map(n => window[n]).filter(Boolean);
  }
  /* Which colour each card shows is decided from the photographs that exist,
     and the packs load after the first render — so the answer worked out
     before they arrived is worthless. It is memoised on the identity of
     S.merchProducts, which does not change when a pack lands, so without this
     the empty result computed at boot is served for the rest of the session
     and every product card falls back to "image to follow". */
  CARD_PICK = null; CARD_PICK_FOR = null;
}
bindPacks();
/* Each pack announces itself as it finishes parsing. Re-rendering per pack
   rather than once at the end lets the first photographs appear while the
   rest are still coming. */
window.addEventListener('pamuuc:pack', () => {
  bindPacks();
  if(typeof render === 'function' && document.getElementById('root')) render();
});
/* Shopify keeps the filename it was given and only swaps spaces for
   underscores, so the name is the SKU, the colour exactly as the catalogue
   spells it, and the view — case and punctuation intact. Checked against all
   1,569 files actually on the CDN. */
/* The shoot covers four angles of every garment. What a customer wants to see
   is the garment worn, so the two on-model angles are the views offered here;
   the flat packshots do the job they are good at, reading the colour at swatch
   size. Labelled by what they show, not by the filename. */
const PHOTO_VIEWS = [['studio-01','Front'], ['studio-02','Back']];
/* Where each view looks, in order. A colour that was never shot on the model
   falls back to its flat packshot rather than to nothing. */
const VIEW_SOURCES = {
  'studio-01':      [['studio-01', 'model'], ['packshot-front', 'alt']],
  'studio-02':      [['studio-02', 'back']],
  'packshot-front': [['packshot-front', 'swatch']],
};
/* a configuration saved before the views changed still names the old shots */
const VIEW_ALIAS = {'packshot-front':'studio-01', 'packshot-back':'studio-02'};
const photoFile = (sku, colourName, view) =>
  sku + '_' + String(colourName).replace(/ /g, '_') + '_' + (view || 'packshot-front');
/* `exact` asks for the view itself and refuses the stand-in — used when
   choosing which colour should represent a product, so a colour that really
   was shot on the model wins over one that only has a flat packshot. */
/* Where a photograph comes from.

   The address on the studio's CDN is the truth: it is what the back office
   edits, what a deployed site will request, and what a photograph is actually
   called. This prototype cannot request it — an artifact's content policy
   admits no external image host, so an <img> pointing at the CDN loads
   nothing at all — which is why embedded copies exist beside it.

   So: an address set by hand always wins, because it was set deliberately.
   Then whichever source the studio has chosen. Then the other one, so a
   missing embedded copy still shows something when the page is served
   somewhere the CDN can be reached. */
const imageMode = () => S.imageSource || 'embedded';
function garmentPhoto(sku, colourKey, view, exact){
  if(!sku || !colourKey) return null;
  const nm = (COLOURS[colourKey] || {}).name;
  if(!nm) return null;
  const v0 = (VIEW_SOURCES[view] ? view : 'studio-01');
  const own = garmentImageURL(sku, colourKey, v0);
  if(own) return own;
  const sources = VIEW_SOURCES[v0];
  const fromPack = () => {
    for(const [v, set] of (exact ? sources.slice(0, 1) : sources)){
      const key = photoFile(sku, nm, v);
      for(const pack of PACKS[set]){ const hit = pack[key]; if(hit) return hit; }
    }
    return null;
  };
  if(imageMode() === 'cdn') return garmentPhotoURL(sku, nm, v0) || fromPack();
  return fromPack();
}
/* An address written against this garment and colour by hand, which overrides
   whatever the naming convention would have produced. */
function garmentImageURL(sku, colourKey, view){
  for(const p of (S.merchProducts || [])){
    for(const m of (p.matrix || [])){
      if(m.sku !== sku) continue;
      const set = (m.images || {})[colourKey];
      if(!set) return null;
      return (typeof set === 'string' ? set : set[view]) || null;
    }
  }
  return null;
}
/* the address the same photograph has on the CDN, for when this is deployed
   somewhere without the artifact's content policy */
const garmentPhotoURL = (sku, colourName, view, width) =>
  SHOP_CDN + encodeURIComponent(photoFile(sku, colourName, view)) + '.jpg'
    + (width ? '?width=' + width : '');
/* the photograph for a product when no garment has been chosen yet */
/* Which garment stands for the whole product in a photograph. A t-shirt is a
   t-shirt in every cut, but the adult unisex one is what a buyer pictures; a
   baby vest opening the page reads as the wrong product. */
const PHOTO_CUT_ORDER = {U:0, M:1, W:2, K:3, B:4};
/* And which colour. Before anyone has chosen, the photograph has to stand for
   the whole range, so it opens on a core colour rather than on whatever the
   data happened to list first. Ordered core-first, then by how many garments
   actually carry it — white, black and French navy are on almost every one.
   A garment carrying none of these still shows a photograph; it just falls
   through to the colours it does have. */
const PHOTO_COLOUR_ORDER = ['White', 'Black', 'French Navy', 'Natural Raw',
  'Off White', 'Vintage White', 'Cream', 'Heather Grey', 'Anthracite', 'Khaki'];
const colourRank = (c) => {
  const i = PHOTO_COLOUR_ORDER.indexOf((COLOURS[c] || {}).name);
  return i === -1 ? PHOTO_COLOUR_ORDER.length : i;
};
/* A grid where every card leads on white reads as one garment photographed
   thirty-three times. So each card starts from a different place in this
   palette, which is ordered to keep neighbours apart in hue and in weight —
   navy, then wine, then ecru — rather than by how common the colour is.
   Every entry is a colour a good number of garments are actually made in, so
   a card rarely has to fall far down the list to find a photograph. */
const CARD_PALETTE = ['French Navy', 'Burgundy', 'Natural Raw', 'Stargazer',
  'Khaki', 'Black', 'Cotton Pink', 'Glazed Green', 'White', 'Heritage Brown',
  'Blue soul', 'Red', 'Heather Grey', 'Deep Teal', 'Butter', 'Anthracite',
  'Lavender', 'Mocha', 'Desert Dust', 'Mindful Blue', 'Cream', 'Fiesta',
  'Green Bay', 'Deep Plum'];
const paletteRank = (c) => {
  const i = CARD_PALETTE.indexOf((COLOURS[c] || {}).name);
  return i === -1 ? CARD_PALETTE.length : i;
};
function productShot(p, view, rank){
  if(!p) return null;
  const rankOf = rank || colourRank;
  const rows = (p.matrix || []).slice().sort((a, b) =>
    (PHOTO_CUT_ORDER[a.g] === undefined ? 5 : PHOTO_CUT_ORDER[a.g]) -
    (PHOTO_CUT_ORDER[b.g] === undefined ? 5 : PHOTO_CUT_ORDER[b.g]));
  /* Two passes: first insisting on a real shot of this view, then allowing the
     stand-in. Otherwise a product whose first core colour was never shot on the
     model would lead with a flat packshot while its other colours have one. */
  for(const exact of [true, false]){
    for(const m of rows){
      const cols = (m.colours || []).slice().sort((a, b) => rankOf(a) - rankOf(b));
      for(const c of cols){
        const u = garmentPhoto(m.sku, c, view || 'packshot-front', exact);
        if(u) return {src: u, colour: c};
      }
    }
  }
  return null;
}
const productPhoto = (p, view, rank) => { const x = productShot(p, view, rank); return x ? x.src : null; };
/* The card's photograph. Choosing per product in isolation kept piling the
   grid onto whatever colours most garments happen to stock — first navy, then
   black. So the grid is dealt out in one pass instead: each product takes the
   colour it has been photographed in that the grid has used least so far, and
   the palette above only breaks ties. Worked out once, from the catalogue's own
   order, so a card keeps its colour when the grid is filtered or re-sorted. */
function cardCandidates(p, view){
  const rows = (p.matrix || []).slice().sort((a, b) =>
    (PHOTO_CUT_ORDER[a.g] === undefined ? 5 : PHOTO_CUT_ORDER[a.g]) -
    (PHOTO_CUT_ORDER[b.g] === undefined ? 5 : PHOTO_CUT_ORDER[b.g]));
  for(const exact of [true, false]){
    for(const m of rows){
      const cand = (m.colours || [])
        .filter(c => garmentPhoto(m.sku, c, view, exact))
        .sort((a, b) => paletteRank(a) - paletteRank(b));
      if(cand.length) return cand.map(c => ({sku: m.sku, colour: c, exact: exact}));
    }
  }
  return [];
}
function cardPicks(){
  const P = S.merchProducts || [];
  if(CARD_PICK && CARD_PICK_FOR === P) return CARD_PICK;
  const picks = {}, used = {};
  P.forEach(p => {
    const cand = cardCandidates(p, 'studio-01');
    if(!cand.length) return;
    let best = cand[0], bestScore = Infinity;
    cand.forEach((o, i) => {
      const nm = (COLOURS[o.colour] || {}).name || o.colour;
      /* how often the grid already shows this colour dominates; position in
         the palette only separates colours the grid has used equally often */
      const score = (used[nm] || 0) * 1000 + i;
      if(score < bestScore){ bestScore = score; best = o; }
    });
    const nm = (COLOURS[best.colour] || {}).name || best.colour;
    used[nm] = (used[nm] || 0) + 1;
    picks[p.id] = best;
  });
  CARD_PICK = picks; CARD_PICK_FOR = P;
  return picks;
}
function productCardShot(p, view){
  if(!p) return null;
  const pick = cardPicks()[p.id];
  if(!pick) return null;
  const src = garmentPhoto(pick.sku, pick.colour, view || 'studio-01', pick.exact);
  return src ? {src: src, colour: pick.colour} : null;
}


const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="320" height="320" role="img">' +
  '<rect width="400" height="400" fill="#EAE7DF"/>' +
  '<path d="M152 116 L118 132 L102 190 L134 201 L141 186 L141 296 L259 296 L259 186 L266 201 L298 190 ' +
  'L282 132 L248 116 L224 132 Q200 148 176 132 Z" fill="none" stroke="#BDB7AA" stroke-width="7" ' +
  'stroke-linejoin="round"/>' +
  '<text x="200" y="348" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" ' +
  'font-size="17" letter-spacing="1.5" fill="#9C9689">IMAGE TO FOLLOW</text></svg>');

/* Cards are square, and so is the on-model shot: it fills one exactly, where a
   4:5 packshot had to be cropped at the hem to fit. */
function prodImg(p){
  if(!p) return PLACEHOLDER;
  const pick = productCardShot(p, 'studio-01');
  const cdn = pick && pick.src;
  if(cdn) return cdn;
  const pi = p.img || {};
  return (p.imgOrder || []).map(c => pi[c]).find(Boolean) || PLACEHOLDER;
}
const imgOf  = (id) => prodImg(by(S.merchProducts, id));
/* A collection's cover is the first of its own products that has a photograph,
   in the colour that product's card shows, so the two agree. It used to name a
   product per collection by hand, from the fifteen-product catalogue — none of
   those ids survived the remap, and because the placeholder is itself a valid
   image the fallback behind it could never fire, so every cover was blank. */
/* Not every product can speak for its collection. A baby bib standing for
   Accessories reads as the wrong shelf entirely — it was doing exactly that,
   because the cover was simply the first product in the group that had a
   photograph — and a flat packshot sitting beside six on-model covers reads as
   a missing image rather than a choice. So the cover comes from the products
   that can carry the group, and only falls back to the others if none can. */
const canCoverCollection = (p) => {
  const cuts = new Set((p.matrix || []).map(m => m.g).filter(Boolean));
  const forAdults = [...cuts].some(g => g !== 'B' && g !== 'K');
  const onModel = (p.matrix || []).some(m =>
    (m.colours || []).some(c => garmentPhoto(m.sku, c, 'studio-01', true)));
  return forAdults && onModel;
};
const catImg = (c) => {
  const inCat = (S.merchProducts || []).filter(p => p.cat === c);
  for(const representative of [true, false]){
    for(const p of inCat){
      if(representative && !canCoverCollection(p)) continue;
      const pick = productCardShot(p, 'studio-01');
      if(pick) return pick.src;
    }
  }
  return PLACEHOLDER;
};

/* ---- sectors ------------------------------------------------------------ */
const SECTORS = [
  {id:'hospitality', n:'Hotels and hospitality',
   d:'Hotel uniforms that bring reception, restaurant, housekeeping, spa and management teams together.',
   roles:['Reception and guest services','Restaurant and bar','Housekeeping','Spa and management'],
   req:['A guest-facing identity alongside an industrial laundry cycle','Movement and layering across a split shift','Departmental distinction without four separate wardrobes','A shared look across every hotel team'],
   tags:['High laundry cycles', 'Split shifts', 'Guest-facing identity', 'Departmental distinction']},
  {id:'food', n:'Restaurants and food service',
   d:'Restaurant uniforms and chef uniforms designed for busy service, movement and regular washing.',
   roles:['Front of house','Bar','Kitchen and pass','Management'],
   req:['Heat, spills and long periods of service','Movement through a full shift','Frequent washing and replacement','Dining room and kitchen reading as one venue'],
   tags:['Heat and spills', 'Fast service', 'Frequent washing', 'One venue']},
  {id:'wellness', n:'Spa and wellness',
   d:'Spa and beauty uniforms that feel comfortable and suit the calm of your space.',
   roles:['Therapists','Reception','Treatment support'],
   req:['Bending and reach through the shoulder and bicep','Coverage that stays correct during treatment','Product contact and frequent cleaning','A quiet register that suits the room'],
   tags:['Range of movement', 'Treatment coverage', 'Product contact', 'Quiet colour']},
  {id:'healthcare', n:'Dental and private clinics',
   d:'Custom clinic uniforms for reception and care, made for comfort and regular washing.',
   roles:['Clinical','Reception','Support','Administration'],
   req:['Care routines and laundry compatibility','Fit and wearer dignity across a wide size range','Role recognition without a visible hierarchy','A clean appearance under clinical lighting'],
   tags:['Industrial wash', 'Wide size range', 'Role recognition', 'Documented materials']},
  {id:'corporate', n:'Maintenance and support teams',
   d:'Workwear for maintenance, logistics and support teams, made for movement and daily use.',
   roles:['Maintenance','Logistics','Support','Technical'],
   req:['Movement, storage and hard daily wear','Durability against a long replacement cycle','Easy care without special handling','Visual continuity with customer-facing teams'],
   tags:['Hard daily wear', 'Tool storage', 'Easy care', 'Visual continuity']},
  {id:'retail', n:'Retail and guest services',
   d:'Bespoke uniforms for welcoming guests, helping customers and representing your business.',
   roles:['Floor','Welcome desk','Stockroom','Management'],
   req:['Standing and reaching through a full shift','Role recognition on a busy floor','Consistency across locations and future orders','A welcoming look that reflects the business'],
   tags:['All-day standing', 'Seasonal layers', 'Floor recognition', 'Consistency across sites']},
];

const sectorById = (id) => SECTORS.find(s => s.id === id) || null;

/* ---- chrome ------------------------------------------------------------- */
/* The journal is shared by both services, so it keeps the chrome of whichever
   one the visitor arrived from rather than dropping them onto an orphan page. */
/* ============================================================================
   Offers
   ---------------------------------------------------------------------------
   One authored record drives three places: the strip under the header, the
   block on the merchandise home, and the pop-up. None of them carry their own
   copy or their own percentages, so retiring an offer is one flag. §17
   ========================================================================= */
function liveOffer(branch){
  const all = (S.offers || []).filter(o => o.active && (!o.scope || o.scope === branch));
  if(!all.length) return null;
  /* an offer with an end date stops on its own rather than needing a deploy */
  const live = all.filter(o => !o.ends || String(o.ends) >= S.today);
  return live[0] || null;
}
const offerSeen = (id, what) => !!((S.offerSeen || {})[id] || {})[what];
function markOfferSeen(id, what){
  S.offerSeen = S.offerSeen || {};
  S.offerSeen[id] = S.offerSeen[id] || {};
  S.offerSeen[id][what] = nowStamp();
  save();
}
/* which tier a quantity falls into — the one piece of arithmetic all three share */
function offerTier(o, qty){
  if(!o) return null;
  return (o.tiers || []).find(t => qty >= t.min && (t.max == null || qty <= t.max)) || null;
}
const offerBest = (o) => (o.tiers || []).reduce((a, t) => Math.max(a, t.pct), 0);
const offerLow  = (o) => (o.tiers || []).reduce((a, t) => Math.min(a, t.pct), 99);

/* ---- 1. the strip under the header --------------------------------------
   One line, centred, with one thing to click. The first version carried the
   whole tier table across the top of every page — a spec sheet where an
   announcement belongs. Every bar worth copying says one thing and offers one
   link; the detail lives where someone has chosen to go and read it. */
function offerBar(branch){
  const o = liveOffer(branch);
  if(!o || !o.bar || offerSeen(o.id, 'bar')) return '';
  return `
  <div class="obar" role="region" aria-label="Current offer">
    <div class="obar-in">
      <span class="obar-tag">${esc(o.label)}</span>
      <span class="obar-t">Up to ${offerBest(o)}% off your first order, by quantity.</span>
      <button class="obar-go" data-act="offerOpen" data-id="${esc(o.id)}">
        See how<i aria-hidden="true">&#8250;</i></button>
    </div>
    <button class="obar-x" data-act="offerHide" data-id="${esc(o.id)}" aria-label="Hide this offer">✕</button>
  </div>`;
}

/* ---- 2. the block on the merchandise home ------------------------------- */
function offerHome(branch){
  const o = liveOffer(branch);
  if(!o || !o.home) return '';
  return `
  <section class="pub-sec pub-sec--warm">
    <div class="pub-wrap">
      <div class="oblock">
        <div class="oblock-c">
          <span class="tag tag--merch tag--plain">${esc(o.label)}</span>
          <h2 class="display oblock-t">${esc(o.headline)}</h2>
          <p class="lede oblock-d">${esc(o.line)}</p>
          <div class="btn-row btn-row--top">
            <button class="btn btn--primary btn--arrow" data-act="offerOpen" data-id="${esc(o.id)}">
              Get the code<i class="btn-a" aria-hidden="true">&#8594;</i></button>
            ${ctaBtn('products', 'Browse all products', 'ghost')}
          </div>
          ${o.ends ? `<p class="t-xs muted oblock-e">Runs until ${dateShort(o.ends)}. One discount per account, on the first order.</p>` : ''}
        </div>
        <ol class="otiers">
          ${(o.tiers || []).map(t => `<li class="otier">
            <span class="otier-p">${t.pct}<i>%</i></span>
            <span class="otier-s">${esc(t.say)}</span>
          </li>`).join('')}
        </ol>
      </div>
    </div>
  </section>`;
}

/* ---- 3. the pop-up ------------------------------------------------------
   Shown once, late, and never again once it has been closed or answered. A
   pop-up that reappears is the reason people install blockers. */
function offerPopup(){
  const o = UI.popup && (S.offers || []).find(x => x.id === UI.popup);
  if(!o) return '';
  const done = UI.popupDone;
  return `
  <div class="opop-wrap" role="dialog" aria-modal="true" aria-labelledby="opop-t">
    <div class="opop-veil" data-act="offerClose"></div>
    <div class="opop">
      <button class="opop-x" data-act="offerClose" aria-label="Close">✕</button>
      ${done ? `
        <span class="tag tag--merch tag--plain">You are on the list</span>
        <h2 class="opop-t" id="opop-t">Your code is <b>${esc(o.code)}</b>.</h2>
        <p class="opop-d">We have sent it to ${esc(done)}. Quote it on your first request and the tier your
          quantity falls into is applied before you approve anything.</p>
        <div class="otiers otiers--flat">
          ${(o.tiers || []).map(t => `<div class="otier"><span class="otier-p">${t.pct}<i>%</i></span>
            <span class="otier-s">${esc(t.say)}</span></div>`).join('')}
        </div>
        <div class="btn-row" style="margin-top:var(--sp-5)">
          <button class="btn btn--primary" data-act="offerClose">Start choosing</button>
        </div>`
      : `
        <span class="tag tag--merch tag--plain">${esc(o.label)}</span>
        <h2 class="opop-t" id="opop-t">${esc(o.popupTitle || o.headline)}</h2>
        <p class="opop-d">${esc(o.popupLine || o.line)}</p>
        <div class="otiers otiers--flat">
          ${(o.tiers || []).map(t => `<div class="otier"><span class="otier-p">${t.pct}<i>%</i></span>
            <span class="otier-s">${esc(t.say)}</span></div>`).join('')}
        </div>
        <label class="field opop-f"><span class="field-l">Where should we send it?</span>
          <input class="inp" id="opop_email" type="email" inputmode="email" autocomplete="email"
            placeholder="you@company.com"></label>
        <div class="btn-row opop-b">
          <button class="btn btn--primary" data-act="offerSubmit" data-id="${esc(o.id)}">Send me the code</button>
          <button class="btn btn--quiet" data-act="offerClose">Not now</button>
        </div>
        <p class="t-xs faint opop-s">One message with the code, and the occasional offer. Unsubscribe in a click.
          We never pass your address on.</p>`}
    </div>
  </div>`;
}

/* Armed once per session, and only after someone has actually read something.
   It is cancelled the moment the offer is closed or answered anywhere else. */
function armOfferPopup(branch){
  const o = liveOffer(branch);
  if(!o || !o.popup) return;
  if(OFFER_TIMER || UI.popup || UI.popupArmed) return;
  if(offerSeen(o.id, 'popup') || offerSeen(o.id, 'joined')) return;
  UI.popupArmed = true;
  OFFER_TIMER = setTimeout(() => {
    OFFER_TIMER = null;
    if(UI.drawer || UI.modal) return;            /* never over something they opened */
    if(offerSeen(o.id, 'popup') || offerSeen(o.id, 'joined')) return;
    UI.popup = o.id; render();
  }, 14000);
}
let OFFER_TIMER = null;

function pubShell(inner, page){
  if(PUB_BRANCH[page]) UI.lastBranch = PUB_BRANCH[page];
  /* armed after this render, not during it — arming inside the render that
     draws the page would let a timer fire against markup already replaced */
  setTimeout(() => armOfferPopup(PUB_BRANCH[page] || null), 0);
  const branch = PUB_BRANCH[page] ||
    ((page === 'blog' || page === 'post') ? (UI.lastBranch || null) : null);
  const meta   = branch ? BRANCH_META[branch] : null;
  const other  = meta ? BRANCH_META[meta.other] : null;
  const nav    = branch ? BRANCH_NAV[branch] : [];
  const lines  = quoteCount();
  return `
  <a class="skip" href="#main" data-act="skip">Skip to content</a>
  <div class="pub ${branch ? 'pub--' + branch : ''}">
    <header class="pub-hd glass">
      <div class="pub-hd-in">
        <span class="brand" data-go="public:${meta ? meta.home : 'home'}">${mark('mk--lockup')}PAMUUC<span class="brand-bar">|</span><span class="brand-sub">${meta ? esc(meta.short.toUpperCase()) : 'STUDIO'}</span></span>
        <nav class="pub-nav" aria-label="${meta ? esc(meta.name) : 'Main'}">
          ${nav.map(x => x.j
            ? `<a data-jump="${x.j}">${x.n}</a>`
            : `<a data-go="public:${x.p}" class="${page === x.p ? 'on' : ''}">${x.n}</a>`).join('')}
        </nav>
        <span class="spacer"></span>
        ${branch === 'merch' ? `<button class="btn btn--quiet btn--sm hd-hide-md" data-go="public:search" aria-label="Search products">Search</button>` : ''}
        ${meta ? `<button class="btn btn--quiet btn--sm hd-hide-lg" data-go="public:home">Choose a service</button>` : ''}
        ${other ? `<button class="btn btn--sm hd-hide-md ${other.home === 'merch' ? 'btn--merch' : 'btn--quiet'}" data-go="public:${other.home}">${other.short}</button>` : ''}
        <button class="btn btn--quiet btn--sm hd-hide-md" data-act="lang">EN</button>
        <button class="btn btn--quiet btn--sm" data-act="theme" aria-label="Switch light and dark">◐</button>
        <button class="btn btn--ghost btn--sm hd-hide-sm" data-go="public:login">Customer login</button>
        ${branch === 'merch'
          ? `<button class="btn btn--primary btn--sm" data-act="openDrawer" aria-haspopup="dialog"
              aria-expanded="${UI.drawer ? 'true' : 'false'}">Quote${lines ? ` <span class="badge-n">${lines}</span>` : ''}</button>`
          : meta && meta.cta ? `<button class="btn btn--primary btn--sm hd-hide-sm" data-go="public:${meta.cta.p}">${meta.cta.n}</button>` : ''}
        <button class="btn btn--ghost btn--sm hd-menu-btn" data-act="menu"
          aria-expanded="${UI.menu ? 'true' : 'false'}">${UI.menu ? 'Close' : 'Menu'}</button>
      </div>
    </header>
    ${offerBar(branch)}
    ${UI.menu ? menuSheet(branch, meta, other) : ''}
    <main id="main" data-page="${esc(page || '')}"${branch ? ` data-branch="${esc(branch)}"` : ''}>${inner}</main>
    ${pubFooter(branch)}
  </div>
  ${UI.drawer ? quoteDrawer() : ''}
  ${offerPopup()}`;
}

function menuSheet(branch, meta, other){
  const nav = branch ? BRANCH_NAV[branch] : [];
  return `
  <div class="hd-sheet">
    <div class="hd-sheet-in">
      ${meta ? `
        <div class="eyebrow">${esc(meta.name)}</div>
        <a class="hd-sheet-link" data-go="public:${meta.home}">${esc(meta.name)} home</a>
        ${nav.map(x => x.j
          ? `<a class="hd-sheet-link" data-jump="${x.j}">${x.n}</a>`
          : `<a class="hd-sheet-link" data-go="public:${x.p}">${x.n}</a>`).join('')}
        ${branch === 'merch'
          ? `<a class="hd-sheet-link" data-go="public:search">Search products</a>
             <a class="hd-sheet-link hd-sheet-link--cta" data-go="public:quote">Your quote request${quoteCount() ? ' (' + quoteCount() + ')' : ''}</a>`
          : `<a class="hd-sheet-link hd-sheet-link--cta" data-go="public:${meta.cta.p}">${meta.cta.n}</a>`}
      ` : ''}
      <div class="eyebrow hd-sheet-eyebrow">${other ? 'The other service' : 'Choose a service'}</div>
      ${other
        ? `<a class="hd-sheet-link" data-go="public:${other.home}">${esc(other.name)}</a>
           <a class="hd-sheet-link" data-go="public:home">Choose a service</a>`
        : `<a class="hd-sheet-link" data-go="public:custom">PAMUUC Studio — custom uniforms</a>
           <a class="hd-sheet-link" data-go="public:merch">PAMUUC Merchandise</a>`}
      <a class="hd-sheet-link" data-go="public:contact">Contact</a>
      <a class="hd-sheet-link" data-go="public:login">Customer login</a>
    </div>
  </div>`;
}

/* Three compact groups: the current branch, the other service and company,
   then help, legal and account. */
function pubFooter(branch){
  const col = (title, links) => `
    <div class="ft-col">
      <div class="eyebrow ft-h">${title}</div>
      ${links.map(([n, p]) => `<a class="ft-link" data-go="public:${p}">${n}</a>`).join('')}
    </div>`;
  const studioCol = col('PAMUUC Studio', [['Custom uniforms','custom'],
    ['Start your project brief','form'],['Journal','blog']]);
  const merchCol = col('PAMUUC Merchandise', [['Merchandise','merch'],['Products','products'],
    ['Collections','collections'],['Personalisation','method'],['How to order','howto'],
    ['Journal','blog'],['Merchandise help','merchhelp']]);
  const companyCol = col('Company', [['About PAMUUC','about'],['Contact','contact'],
    ['Customer login','login'],['Accessibility','accessibility']]);
  const legalCol = col('Legal', [['Privacy notice','privacy'],['Cookie settings','cookies'],
    ['Terms','terms']]);
  return `
  <footer class="pub-ft">
    <div class="pub-wrap">
      <div class="ft-grid">
        ${branch === 'merch' ? merchCol + studioCol : studioCol + merchCol}
        ${companyCol}
        ${legalCol}
      </div>
      <div class="ft-base">
        <div class="ft-id">
          ${mark('mk--ft')}
          <span class="ft-id-t">
            <span class="t-xs">© ${new Date().getFullYear()} Pamuk Studio S.L · Barcelona</span>
            <span class="t-xs muted">Legal and registration details are confirmed before publication.</span>
          </span>
        </div>
        <span class="ft-base-links">
          <a class="ft-link ft-link--inline" data-go="public:home">Choose a service</a>
          <a class="ft-link ft-link--inline" data-act="lang">English · Español · Français</a>
        </span>
      </div>
    </div>
  </footer>`;
}

/* The gateway carries no navigation bar. The wordmark sits centred over the
   two images and the whole of each half is the control, so a header would
   only compete with the one decision the page exists to ask for. */
function pubShellGate(inner){
  return `
  <a class="skip" href="#main" data-act="skip">Skip to content</a>
  <div class="pub pub--gate">
    <main id="main">${inner}</main>
    ${pubFooter(null)}
  </div>`;
}

/* A page heading. Title and the sentence under it both run the full width. */
function pageHead(eyebrow, title, desc, opts){
  const o = opts || {};
  return `
  <section class="page-head ${o.red ? 'page-head--red' : ''}">
    <div class="pub-wrap">
      ${o.crumb ? `<nav class="crumb" aria-label="Breadcrumb">${o.crumb}</nav>` : ''}
      <div class="eyebrow ${o.red ? 'eyebrow-red' : ''}">${eyebrow}</div>
      <h1 class="page-title">${title}</h1>
      ${desc ? `<p class="page-desc">${desc}</p>` : ''}
      ${o.after || ''}
    </div>
  </section>`;
}

function crumb(trail, here){
  return trail.map(([n, p]) => `<a data-go="public:${p}">${n}</a><span class="crumb-sep">/</span>`).join('')
       + `<span class="crumb-here">${esc(here)}</span>`;
}

/* FAQ: six headings visible, six more on demand. Native disclosure, so the
   keyboard and expanded state come from the browser. Answers may all be open
   at once — visitors compare them. */
function faqBlock(items, id){
  return `
  <div class="faq" id="${id}">
    ${items.map((q, i) => `
      <details class="faq-i ${i >= 6 ? 'faq-i--more' : ''}">
        <summary class="faq-q">${q[0]}</summary>
        <div class="faq-a"><p class="t-sm">${q[1]}</p></div>
      </details>`).join('')}
    ${items.length > 6 ? `<button class="btn btn--quiet btn--sm faq-more" data-act="faqMore" data-f="${id}"
      aria-controls="${id}" aria-expanded="false">Show ${items.length - 6} more questions</button>` : ''}
  </div>`;
}

/* ---- product card, one contract everywhere ----------------------------- */

/* A section chapter head: index, label, and a hairline. Each section reads as
   its own chapter rather than another block on a long page. */
function secIx(n, label, meta){
  return `<div class="sec-ix">
    <span class="sec-ix-n">${n}</span>
    <span class="sec-ix-l">${label}</span>
    <span class="spacer"></span>
    ${meta ? `<span class="sec-ix-m">${meta}</span>` : ''}
  </div>`;
}

/* An art-directed slot for photography that has not been shot yet. It carries
   the asset ID from the content plan so it is never mistaken for finished. */
function ph(id, ratio, desc){
  return `<div class="ph ph--${ratio}" role="img" aria-label="Image placeholder: ${esc(desc)}">
    <div class="ph-in">
      <div class="ph-id">${esc(id)}</div>
      <div class="ph-d">${esc(desc)}</div>
    </div>
  </div>`;
}

/* Real catalogue photography, with the caption that says what it actually is. */
function fig(src, alt, kind, note, ratio){
  if(!src) return ph('ASSET PENDING', ratio || '4x5', alt);
  return `<figure class="fig">
    <div class="media media--${ratio || '4x5'}"><img src="${src}" alt="${esc(alt)}" loading="lazy"></div>
    <figcaption class="cap"><b>${esc(kind)}</b><span>${esc(note)}</span></figcaption>
  </figure>`;
}

const arrow = (label) => `<span class="lnk-a">${label}<span></span></span>`;
/* The same affordance as arrow(), but a real button: a card whose only route
   out is a click handler on its container cannot be reached from a keyboard. */
const arrowBtn = (label, go, aria) => `<button class="lnk-a" data-go="${go}"${aria ? ` aria-label="${esc(aria)}"` : ''}>${label}<span></span></button>`;

/* ---- the mark ----------------------------------------------------------
   The cotton-flower monogram, one path, drawn in currentColor so it takes
   the navy or the off-white of whatever solid field it sits on. It is never
   outlined, rotated, recoloured, cropped, or placed over a photograph. */
const MARK_D = 'M572.80 929.13 C573.03 928.90 573.10 909.59 573.10 843.73 L573.10 758.63L573.71 758.02 L574.32 757.41L650.35 757.41 C723.92 757.41 736.09 757.31 743.01 756.64 C744.51 756.49 747.08 756.27 748.72 756.14 C750.36 756.01 752.42 755.81 753.31 755.70 C758.49 755.01 761.05 754.64 762.37 754.40 C763.19 754.25 764.53 754.03 765.35 753.91 C768.84 753.41 775.08 752.28 775.65 752.03 C775.86 751.95 776.53 751.78 777.14 751.67 C779.63 751.23 782.52 750.54 787.69 749.16 C788.24 749.01 789.13 748.76 789.68 748.59 C790.22 748.42 791.06 748.21 791.54 748.11 C792.02 748.02 792.80 747.80 793.28 747.62 C793.75 747.43 794.65 747.14 795.26 746.97 C795.88 746.80 797.33 746.33 798.49 745.93 C799.65 745.53 800.93 745.11 801.34 745.00 C810.98 742.31 828.96 733.96 841.80 726.21 C846.46 723.40 847.31 722.84 852.48 719.21 C874.62 703.62 894.57 682.75 911.09 657.87 C912.40 655.89 913.67 653.99 913.91 653.64 C918.17 647.46 927.95 628.90 931.10 621.01 C931.32 620.46 932.02 618.73 932.66 617.16 C934.42 612.84 934.69 612.15 934.96 611.20 C935.10 610.73 935.51 609.55 935.87 608.60 C936.23 607.64 936.92 605.63 937.40 604.13 C937.88 602.63 938.53 600.62 938.84 599.66 C939.16 598.71 939.67 596.97 939.97 595.81 C940.27 594.65 940.67 593.20 940.85 592.59 C941.36 590.86 941.66 589.68 942.22 587.13 C942.50 585.83 942.85 584.32 942.99 583.78 C943.33 582.44 943.68 580.81 943.95 579.31 C944.07 578.62 944.28 577.51 944.42 576.82 C944.56 576.14 944.79 574.82 944.93 573.88 C945.08 572.94 945.28 572.05 945.38 571.89 C945.48 571.74 945.63 570.83 945.73 569.87 C945.82 568.92 946.04 567.19 946.21 566.03 C946.66 563.00 946.66 506.77 946.21 503.72 C946.04 502.56 945.82 500.94 945.73 500.12 C945.63 499.30 945.48 498.52 945.39 498.38 C945.30 498.24 945.10 497.29 944.95 496.27 C944.80 495.25 944.57 493.86 944.43 493.17 C944.30 492.49 944.08 491.32 943.95 490.57 C943.60 488.70 943.33 487.43 942.59 484.24 C941.16 478.04 941.08 477.71 940.76 476.79 C940.61 476.38 940.31 475.38 940.09 474.56 C939.87 473.74 939.59 472.73 939.47 472.32 C939.35 471.91 939.15 471.19 939.02 470.71 C938.89 470.23 938.66 469.51 938.51 469.10 C938.36 468.69 937.90 467.23 937.49 465.87 C937.07 464.50 936.58 463.00 936.39 462.52 C936.20 462.04 935.70 460.64 935.27 459.42 C934.39 456.91 934.38 456.91 932.28 451.63 C927.99 440.84 920.19 425.59 914.29 416.47 C906.16 403.89 898.52 393.67 890.12 384.11 C882.75 375.73 870.90 364.21 863.90 358.63 C863.22 358.09 861.71 356.85 860.55 355.88 C859.38 354.91 857.20 353.23 855.70 352.15 C854.20 351.06 852.19 349.60 851.24 348.91 C848.42 346.86 840.58 341.90 836.84 339.79 C834.93 338.71 832.86 337.53 832.25 337.17 C830.97 336.42 819.60 330.90 816.98 329.77 C810.49 326.95 799.77 323.16 792.90 321.25 C792.36 321.09 791.41 320.82 790.79 320.63 C789.07 320.11 784.83 319.02 783.72 318.81 C783.17 318.70 781.78 318.39 780.62 318.11 C779.46 317.83 777.78 317.47 776.89 317.32 C776.01 317.16 774.89 316.93 774.41 316.81 C773.93 316.69 773.15 316.53 772.67 316.47 C772.19 316.40 771.02 316.17 770.07 315.95 C769.11 315.74 767.49 315.45 766.47 315.30 C762.26 314.70 761.04 314.54 759.14 314.35 C758.05 314.23 756.04 314.01 754.68 313.86 C745.56 312.84 742.21 312.63 731.99 312.43 C723.92 312.28 723.16 312.23 722.74 311.81 C722.31 311.38 722.28 310.65 722.28 298.55 C722.28 291.51 722.17 285.01 722.04 284.09 C721.91 283.18 721.68 280.31 721.54 277.72 C721.40 275.12 721.17 271.88 721.02 270.52 C720.25 263.07 719.90 260.11 719.58 258.23 C719.13 255.57 718.52 251.75 718.29 250.16 C718.01 248.32 717.69 246.57 717.31 244.95 C717.04 243.77 716.38 240.70 715.82 238.00 C715.68 237.32 715.40 236.20 715.20 235.52 C714.80 234.10 713.94 230.70 713.38 228.26 C713.26 227.75 713.05 227.05 712.91 226.71 C712.77 226.37 712.41 225.19 712.10 224.10 C711.79 223.01 711.32 221.50 711.06 220.75 C710.79 220.00 710.48 219.05 710.37 218.64 C710.26 218.23 709.76 216.78 709.26 215.41 C708.77 214.05 708.05 212.04 707.66 210.94 C702.77 197.22 693.43 179.42 684.56 166.89 C683.74 165.72 682.65 164.16 682.13 163.41 C681.62 162.66 680.48 161.13 679.59 160.02 C678.70 158.90 677.25 157.07 676.36 155.94 C665.12 141.67 648.27 125.90 630.32 112.86 C615.32 101.96 594.49 90.72 578.19 84.72 C577.37 84.42 576.17 83.96 575.53 83.70 C573.74 82.98 563.26 79.55 560.57 78.81 C559.51 78.52 556.93 77.87 555.48 77.52 C555.00 77.41 553.99 77.14 553.24 76.92 C552.49 76.69 551.26 76.40 550.51 76.25 C549.76 76.11 548.67 75.89 548.09 75.76 C547.51 75.64 546.56 75.44 545.98 75.32 C545.40 75.19 544.15 74.91 543.19 74.68 C542.24 74.46 540.73 74.17 539.84 74.04 C538.95 73.92 537.56 73.71 536.74 73.58 C522.33 71.28 517.91 70.97 499.50 70.97 C485.98 70.97 481.90 71.10 474.93 71.79 C470.35 72.24 467.47 72.58 467.00 72.73 C466.73 72.81 465.84 72.98 465.01 73.10 C464.19 73.22 462.95 73.42 462.27 73.54 C461.59 73.66 460.36 73.87 459.54 74.00 C458.72 74.14 457.21 74.44 456.19 74.66 C455.16 74.88 453.82 75.16 453.21 75.27 C452.60 75.38 451.26 75.65 450.23 75.86 C449.21 76.07 448.09 76.29 447.75 76.36 C447.41 76.43 446.46 76.67 445.64 76.91 C444.82 77.14 443.76 77.43 443.28 77.54 C442.80 77.65 442.02 77.85 441.54 77.99 C441.07 78.12 439.79 78.46 438.70 78.74 C437.61 79.02 436.44 79.35 436.09 79.49 C435.75 79.62 434.29 80.08 432.86 80.51 C429.62 81.47 425.51 82.84 423.55 83.61 C422.73 83.92 421.00 84.58 419.70 85.06 C418.40 85.54 416.78 86.17 416.10 86.47 C414.87 87.01 414.13 87.32 410.00 89.02 C406.24 90.56 392.32 97.68 388.05 100.24 C377.06 106.85 365.53 114.71 359.13 119.95 C357.70 121.13 356.02 122.48 355.41 122.95 C344.97 130.98 328.69 147.20 320.91 157.32 C320.57 157.77 319.82 158.73 319.25 159.47 C306.51 175.92 297.48 192.20 289.95 212.31 C289.62 213.20 288.69 215.93 287.88 218.39 C286.36 223.02 286.18 223.60 285.67 225.47 C285.50 226.08 285.22 227.03 285.05 227.58 C284.59 229.01 284.26 230.26 283.67 232.79 C283.39 234.02 282.98 235.69 282.77 236.51 C282.08 239.24 281.96 239.73 281.80 240.73 C281.72 241.28 281.56 242.17 281.45 242.72 C280.57 247.05 280.07 249.84 279.71 252.27 C279.58 253.16 279.36 254.67 279.21 255.62 C279.07 256.58 278.84 258.39 278.71 259.65 C278.58 260.90 278.41 262.20 278.33 262.52 C278.12 263.35 277.77 267.32 277.47 272.13 C277.34 274.38 277.16 276.39 277.07 276.60 C276.99 276.80 276.94 284.71 276.95 294.16 C276.98 310.64 276.96 311.36 276.52 311.81 C276.09 312.23 275.42 312.29 268.75 312.44 C259.70 312.65 255.94 312.89 247.31 313.86 C245.94 314.01 243.93 314.23 242.84 314.35 C241.75 314.46 240.07 314.66 239.12 314.80 C238.16 314.93 236.54 315.16 235.52 315.30 C234.49 315.44 232.88 315.73 231.92 315.93 C230.96 316.14 229.79 316.38 229.31 316.45 C228.84 316.53 228.05 316.69 227.58 316.81 C227.10 316.93 225.98 317.16 225.09 317.32 C224.21 317.47 222.53 317.83 221.37 318.11 C220.21 318.39 218.81 318.71 218.27 318.82 C216.81 319.11 215.55 319.42 213.05 320.11 C211.83 320.45 210.15 320.91 209.33 321.13 C205.11 322.28 193.70 326.14 189.10 327.97 C184.61 329.76 173.22 335.18 168.99 337.53 C167.56 338.33 165.50 339.49 164.40 340.09 C155.17 345.24 144.34 353.03 133.33 362.42 C128.76 366.33 118.26 376.80 114.13 381.58 C112.43 383.55 110.44 385.84 109.70 386.67 C93.16 405.41 76.29 433.35 68.10 455.57 C67.72 456.59 67.19 458.04 66.92 458.80 C66.65 459.55 66.17 460.83 65.86 461.65 C65.33 463.05 63.48 468.75 62.49 472.07 C62.10 473.38 61.30 476.33 60.47 479.52 C60.33 480.07 60.13 480.79 60.02 481.14 C59.91 481.48 59.76 482.09 59.68 482.50 C59.61 482.91 59.37 484.03 59.14 484.98 C58.92 485.94 58.64 487.28 58.52 487.96 C58.40 488.64 58.18 489.70 58.05 490.32 C57.02 494.90 55.89 502.12 55.30 507.82 C55.16 509.18 54.99 510.49 54.92 510.72 C53.45 515.47 53.53 548.10 55.04 559.70 C55.19 560.93 55.44 562.88 55.57 564.04 C55.71 565.20 55.93 566.77 56.06 567.53 C56.19 568.29 56.30 569.23 56.30 569.61 C56.30 570.00 56.41 570.72 56.53 571.21 C56.66 571.70 56.95 573.28 57.17 574.72 C57.40 576.15 57.67 577.71 57.79 578.19 C57.91 578.67 58.13 579.73 58.29 580.55 C58.44 581.37 58.67 582.43 58.79 582.91 C58.91 583.38 59.06 584.05 59.12 584.40 C59.53 586.65 61.14 592.97 62.54 597.80 C76.42 645.76 111.25 693.49 152.86 721.60 C163.61 728.86 177.08 735.95 190.09 741.20 C194.23 742.87 194.14 742.84 201.26 745.21 C206.63 747.00 208.36 747.54 212.19 748.63 C212.94 748.84 213.81 749.12 214.12 749.24 C214.43 749.36 214.97 749.46 215.32 749.46 C215.66 749.46 216.14 749.57 216.39 749.70 C216.93 749.99 221.93 751.19 224.60 751.67 C225.21 751.78 225.88 751.95 226.09 752.03 C226.68 752.29 232.32 753.31 236.39 753.90 C237.34 754.04 238.35 754.22 238.62 754.29 C238.89 754.37 240.85 754.67 242.97 754.95 C245.08 755.23 247.54 755.56 248.43 755.69 C249.31 755.81 251.38 756.01 253.02 756.14 C254.66 756.27 257.23 756.49 258.73 756.64 C265.65 757.31 277.82 757.41 351.45 757.41 C419.91 757.41 427.59 757.45 428.08 757.79 L428.64 758.18L428.64 843.50 C428.64 909.54 428.70 928.90 428.93 929.13 C429.37 929.56 572.37 929.56 572.80 929.13 Z M275.48 626.59 C271.06 626.11 268.38 625.75 266.42 625.37 C263.30 624.76 262.61 624.60 261.33 624.23 C260.58 624.01 259.63 623.73 259.22 623.62 C257.35 623.09 255.20 622.41 254.63 622.17 C254.29 622.03 252.90 621.50 251.54 621.01 C225.99 611.70 202.74 583.62 197.57 555.85 C197.43 555.10 197.15 553.65 196.94 552.62 C196.74 551.60 196.44 549.53 196.29 548.03 C196.15 546.53 195.92 544.42 195.79 543.34 C195.49 540.81 195.48 529.76 195.79 527.60 C195.91 526.69 196.14 524.71 196.30 523.21 C196.46 521.71 196.70 519.92 196.85 519.24 C196.99 518.55 197.21 517.47 197.32 516.82 C197.81 514.16 198.01 513.20 198.41 511.54 C198.64 510.59 198.98 509.41 199.15 508.94 C199.33 508.46 199.61 507.56 199.78 506.95 C206.79 481.68 228.70 457.48 252.10 449.13 C260.50 446.13 264.78 445.31 275.23 444.66 C280.29 444.35 342.44 444.35 347.59 444.66 C355.05 445.11 360.88 445.99 365.71 447.37 C366.26 447.53 367.10 447.75 367.57 447.87 C368.05 447.98 369.89 448.60 371.67 449.24 C373.44 449.89 375.48 450.62 376.20 450.87 C395.02 457.42 414.84 477.69 422.80 498.51 C423.45 500.22 424.19 502.16 424.45 502.83 C424.70 503.49 424.91 504.20 424.91 504.39 C424.91 504.58 425.18 505.60 425.50 506.65 C426.52 509.93 427.03 512.39 427.64 516.98 C427.77 517.93 427.94 518.88 428.02 519.09 C429.03 521.67 429.21 625.73 428.22 626.73 C427.60 627.34 281.19 627.21 275.48 626.59 Z M573.60 626.60 C573.04 626.03 572.79 528.47 573.34 523.61 C573.48 522.43 573.71 520.30 573.86 518.86 C574.01 517.43 574.25 515.76 574.40 515.14 C574.55 514.53 574.76 513.47 574.86 512.78 C576.09 505.06 580.04 494.60 584.71 486.72 C591.81 474.71 600.61 465.60 613.07 457.37 C614.80 456.22 623.81 451.58 625.54 450.94 C628.70 449.77 633.66 448.05 634.41 447.87 C634.89 447.75 635.73 447.53 636.27 447.38 C641.22 445.97 646.95 445.11 654.39 444.66 C659.50 444.35 721.37 444.35 726.63 444.66 C735.87 445.20 742.97 446.44 747.30 448.27 C747.75 448.46 748.24 448.62 748.40 448.62 C749.02 448.62 756.83 451.91 758.96 453.06 C775.56 462.09 790.14 478.15 798.11 496.20 C799.56 499.50 799.78 500.03 800.78 502.73 C801.67 505.12 803.44 511.02 803.74 512.60 C803.86 513.18 804.07 514.18 804.21 514.83 C804.55 516.35 804.83 518.00 805.18 520.46 C805.34 521.54 805.52 522.52 805.59 522.64 C805.80 522.98 806.20 529.07 806.35 534.38 C806.49 539.28 806.23 544.58 805.64 548.40 C804.89 553.28 804.51 555.50 804.19 556.84 C804.04 557.46 803.83 558.41 803.72 558.95 C803.60 559.50 803.40 560.28 803.26 560.69 C803.13 561.10 802.87 561.94 802.70 562.55 C802.21 564.32 801.48 566.52 800.84 568.14 C800.52 568.96 799.96 570.39 799.61 571.31 C794.82 583.75 783.12 599.54 772.30 608.15 C762.05 616.31 754.05 620.39 741.02 624.11 C737.72 625.06 735.86 625.39 727.62 626.52 C722.44 627.23 574.31 627.31 573.60 626.60 Z M500.54 416.16 C500.49 416.06 500.19 414.86 499.89 413.49 C498.83 408.68 496.72 401.44 495.34 397.86 C495.08 397.17 494.58 395.89 494.24 395.00 C492.10 389.43 489.06 382.92 485.77 376.83 C481.66 369.25 480.12 366.73 474.38 358.26 C464.02 343.00 448.67 327.96 435.64 320.29 C428.31 315.99 418.50 312.60 413.29 312.59 C408.70 312.57 408.96 313.26 409.13 301.17 C409.31 287.72 410.01 280.22 411.48 275.73 C411.62 275.32 411.84 274.54 411.99 273.99 C413.79 267.14 417.74 258.55 421.65 252.98 C422.28 252.08 423.28 250.65 423.86 249.82 C427.58 244.53 436.15 236.08 442.78 231.17 C445.48 229.17 446.09 228.76 448.71 227.10 C455.64 222.72 463.17 219.10 469.47 217.11 C470.97 216.64 472.53 216.14 472.94 215.99 C473.35 215.85 474.16 215.63 474.74 215.51 C476.82 215.07 477.92 214.83 478.90 214.58 C491.89 211.32 509.43 211.51 524.08 215.07 C524.62 215.21 525.52 215.40 526.06 215.51 C526.61 215.62 527.34 215.83 527.68 215.97 C528.02 216.12 529.05 216.47 529.98 216.75 C556.99 225.11 581.26 249.52 588.24 275.36 C588.41 275.97 588.65 276.75 588.79 277.10 C588.92 277.44 589.14 278.28 589.27 278.96 C589.40 279.64 589.61 280.70 589.75 281.32 C591.07 287.49 591.63 293.53 591.86 304.28 C592.05 312.84 592.21 312.55 587.45 312.58 C584.78 312.60 580.59 313.51 575.43 315.21 C562.18 319.56 547.55 331.16 534.11 347.98 C531.74 350.94 530.98 351.96 527.84 356.40 C518.87 369.05 508.90 389.14 504.85 402.70 C504.54 403.72 504.15 405.01 503.98 405.55 C503.60 406.75 503.34 407.73 502.40 411.51 C502.26 412.05 502.08 413.00 501.99 413.62 C501.67 415.84 501.01 416.99 500.54 416.16 Z';
function mark(cls){
  return `<svg class="mk ${cls || ''}" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
    <path fill="currentColor" fill-rule="evenodd" d="${MARK_D}"/></svg>`;
}


/* ---- the shared root: a service choice, not a third homepage ----------- */
function pubHome(){
  /* The two entrance photographs, cropped for this exact panel: the desktop
     file is the panel's own aspect, and the mobile file is the half-height
     crop the layout switches to at 900px. */
  const halves = [
    {page:'custom', t:'Custom Uniforms',
     img:homePhoto('custom'), imgM:homePhoto('customMobile'),
     alt:'A tailored jacket and trouser in daylight, worn on shift'},
    {page:'merch', t:'Merchandise',
     img:homePhoto('merch'), imgM:homePhoto('merchMobile'),
     alt:'A PAMUUC print on a washed cotton T-shirt'},
  ];
  /* The two services, told the same way: one label, one sentence, one action.
     Equal panels, so neither reads as the recommendation. */
  const picks = [
    ['Studio', 'Choose PAMUUC Studio when you need a uniform programme developed around specific roles, fits, fabrics or garment details.',
     'custom', 'Explore custom uniforms'],
    ['Merchandise', 'Choose PAMUUC Merchandise when you want to select existing products and add your logo or artwork.',
     'merch', 'Browse merchandise'],
  ];
  return pubShellGate(`
  <section class="gate2">
    <span class="gate2-mark" data-go="public:home">PAMUUC<i class="gate2-bar" aria-hidden="true">|</i><em>STUDIO</em></span>
    <span class="gate2-ctl">
      <button class="btn btn--onphoto btn--sm" data-go="public:login"><span class="gate2-wide">Customer login</span><span class="gate2-narrow">Log in</span></button>
      <button class="btn btn--onphoto btn--sm" data-act="theme" aria-label="Switch light and dark">◐</button>
      <button class="btn btn--onphoto btn--sm" data-act="lang">EN</button>
    </span>
    ${halves.map(h => `
    <button class="gate2-h" data-go="public:${h.page}">
      ${h.img ? `<picture>
        ${h.imgM ? `<source media="(max-width:900px)" srcset="${h.imgM}">` : ''}
        <img class="gate2-img" src="${h.img}" alt="${esc(h.alt)}">
      </picture>` : ''}
      <span class="gate2-veil"></span>
      <span class="gate2-t">${h.t}</span>
    </button>`).join('')}
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secHead('—', 'Barcelona · since 2019', 'Uniforms and merchandise for your business.',
        'Develop uniforms around your team’s work, or choose products to personalise with your brand. Two services, one workshop, one standard of record keeping.',
        {left:true})}
      <div class="trust gate-sectors">
        <span class="trust-l">Teams we dress</span>
        <div class="trust-r gate-sectors-p">
          ${SECTORS.map(x => `<span class="chip chip--lg">${esc(x.n)}</span>`).join('')}
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec sec--dark">
    <div class="pub-wrap">
      <div class="shd shd--left shd--dark">
        <span class="tag tag--dark"><i>—</i>Which service fits your project</span>
        <h2 class="display shd-t">Two services, one workshop.</h2>
        <p class="lede shd-d">Both are made and recorded to the same standard. The difference is where the
          garment starts.</p>
      </div>
      <div class="pick-g">
        ${picks.map(([label, copy, page, cta]) => `
        <article class="pick">
          <span class="pick-l">${label}</span>
          <p class="pick-t">${copy}</p>
          <div class="btn-row pick-cta">${ctaBtn(page, cta)}</div>
        </article>`).join('')}
      </div>
      <p class="pick-f">Unsure where to start?
        <a class="lnk" data-go="public:contact">Tell us what you need.</a></p>
    </div>
  </section>
  `);
}

/* ---- Studio FAQ, twelve questions, six shown ---------------------------- */
const STUDIO_FAQ = [
  ['Do you work from a catalogue?',
   'No. We design uniforms around your business, team and daily work. If an existing design can save time or cost, we may use it as a starting point and adapt it to your needs.'],
  ['Can we reorder the same uniforms later?',
   'Yes. We keep your approved patterns, fabrics, colours and garment details on file. Replacements and uniforms for new team members start from that design, with availability, price and timing checked before each order.'],
  ['Do we need to begin with a complete wardrobe?',
   'No. You can start with one role, department or type of garment and add more later. We help you choose a starting point that suits your priorities, quantities, budget and delivery date.'],
  ['Can you develop custom colours and details?',
   'Yes. We can choose from existing fabric colours or assess a custom colour if the fabric and quantity allow it. Labels, branding and other details are chosen to suit the garment, your brand and the way it will be washed.'],
  ['What is the minimum order quantity?',
   'Selected styles can be produced from 10 pieces per style. Custom woven garments generally begin around 10–15 pieces per style, distributed across sizes and approved variants, and custom knitwear generally begins around 100–150 pieces because the manufacturing process requires a higher quantity. We confirm the minimum after reviewing the garment type, fabric, colour, construction and level of customisation.'],
  ['How much does a custom uniform project cost?',
   'We quote each project individually. The price depends on the garments, quantities, fabrics, construction and custom details, plus the design and sample work needed. Your proposal sets out the agreed scope and what is included.'],
  ['How long does a project take from brief to delivery?',
   'Development is typically four to six weeks and production a further three to five weeks, which puts many fully custom projects at around eight weeks in total. Shorter timelines may be possible depending on the number of styles, the fittings and the fabric. Timing is confirmed once the brief has been reviewed.'],
  ['Where are the garments designed and produced?',
   'In Barcelona. Design, development, samples, fittings and production are handled through our local supply chain, so we can work closely with the people making your garments.'],
  ['Do we see prototypes before production starts?',
   'Yes. You review samples and try the garments before committing to production. We agree the fit, fabric, construction and brand details on real garments.'],
  ['How do you handle sizing across a whole team?',
   'We use fittings to check the sizes your team needs, then agree the quantity in each size before production. The approved patterns and garment details are kept for future team members and repeat orders.'],
  ['Will the fabrics hold up to industrial laundry?',
   'Fabric and construction are selected for the care regime the garments will actually meet, including industrial laundry where that applies. The uniforms delivered for a five-star hotel opening have been through twelve months of daily service and industrial laundering.'],
  ['Which sectors do you work with?',
   'We design uniforms for hotels, restaurants, spas, wellness studios, dental and private clinics, maintenance teams, retail and guest services. Each project is adapted to the work, the people and the setting.'],
  ['Can the uniforms follow our interior design or brand identity?',
   'Yes. Your interiors and brand can guide the colours, fabrics and details, as they did for a five-star hotel opening in Barcelona. We use available fabric colours or assess dedicated colours when material and quantity allow.'],
];


/* ---- STUDIO PAGE SECTIONS ------------------------------------------------
   The Custom Uniforms page, built to the structure Leo supplied: an opening
   statement with one photograph, a band of figures, the industries we dress,
   how a project works, the timeline it runs on, then the work, what is
   included, the questions and the invitation.

   The design language blends the three references attached to the brief —
   an architecture studio (one light display line over a single photograph,
   a floating control bar, soft panels over a quiet ground), a benefits
   platform (a centred statement, a row of figures set as one object) and a
   designer portfolio (stacked rounded panels, small pill labels, a closing
   card that simply asks for the project).

   What is borrowed is structural. Everything is set in Gilmer Light and
   Regular on the locked navy and off-white, the mark is never placed over a
   photograph, and no figure on the page is a performance claim: each one is
   a property of the method that can be traced to a record.
   ========================================================================= */

/* A chapter head. The house index survives, carried inside the pill label
   the references use, so the page reads as a chapter and as a brochure. */
function secHead(ix, label, title, lede, opts){
  const o = opts || {};
  return `
  <div class="shd ${o.left ? 'shd--left' : ''} ${o.dark ? 'shd--dark' : ''}">
    <span class="tag ${o.merch ? 'tag--merch' : ''}"><i>${ix || '—'}</i>${label}</span>
    ${o.h1 ? `<h1 class="display shd-t">${title}</h1>` : `<h2 class="display shd-t">${title}</h2>`}
    ${lede ? `<p class="lede shd-d">${lede}</p>` : ''}
    ${o.after || ''}
  </div>`;
}

/* Commissioned photography for the Studio page, embedded as data URIs because
   the artifact CSP blocks external image hosts. Where a slot is empty the page
   falls back to catalogue garment photography. */
const PHOTO = (typeof PHOTOS !== 'undefined') ? PHOTOS : {};
const HOME_PHOTO = (typeof HOME_PHOTOS !== 'undefined') ? HOME_PHOTOS : {};
const homePhoto = (k) => HOME_PHOTO[k] || '';
const photo = (k) => PHOTO[k] || null;

/* Real photography of a real setting; where a sector has none, the card keeps
   catalogue garment photography and says what it is in the alt text. */
/* Written against the photographs themselves. The live site's sector alt
   text describes different pictures from the ones it actually runs — these
   are the accurate descriptions, so they stay. */
const PHOTO_ALT = {
  hospitality:'A restaurant kitchen at the pass, chef jackets and navy service aprons',
  wellness:   'A treatment room, a therapist crossing it in a sage tunic',
  healthcare: 'A clinic reception counter, staff in navy',
  retail:     'A shop floor, the counter and the seating a team works around',
  corporate:  'An event crew outdoors in branded tees and shorts',
  food:       'A service line in cream shirts and navy bib aprons',
  hero:       'A hotel terrace in Barcelona light, set for service',
};

/* The primary action everywhere on this page: a capsule carrying its own
   arrow, so the call to action reads as one object at any size. */
function ctaBtn(target, label, kind){
  const cls = kind === 'ghost' ? 'btn btn--ghost btn--lg btn--arrow' : 'btn btn--primary btn--lg btn--arrow';
  const attr = typeof target === 'string' ? `data-go="public:${target}"`
             : target.jump ? `data-jump="${target.jump}"`
             : `data-act="${target.act}"${target.s ? ` data-s="${target.s}"` : ''}`;
  return `<button class="${cls}" ${attr}>${label}<i class="btn-a" aria-hidden="true">→</i></button>`;
}

/* ---- 1. the opening ----------------------------------------------------
   Copy left, one real photograph right, and the artefact the whole method
   turns on sitting over it. The strip underneath carries the published work
   in place of the client-logo row the references use — we publish three
   projects, so we name three projects. */
function studioHero(){
  const img = photo('hero') || imgOf('m_chore_jacket') || imgOf('m_palmer');
  return `
  <section class="shero">
    <div class="pub-wrap shero-in">
      <div class="shero-copy">
        <span class="news">${mark('mk--news')}<b>Barcelona</b>Uniform design and production</span>
        <h1 class="display shero-t">Custom uniforms and workwear for your&nbsp;team</h1>
        <p class="lede shero-d">We design and make uniforms for hotels, restaurants, spas and private
          clinics. Made in Barcelona, with samples, team fittings and reorders.</p>
        <div class="btn-row btn-row--top">
          ${ctaBtn('form', 'Discuss your project')}
          ${ctaBtn({jump:'work'}, 'Explore our work', 'ghost')}
        </div>
        <p class="t-xs muted shero-sup">Nine short topics, then a review. No account, and nothing is charged.</p>
      </div>
      <div class="shero-media">
        <div class="media media--4x5 shero-img ${photo('hero') ? 'shero-img--photo' : ''}">
          ${photo('hero') ? `<picture>
              <source media="(max-width:1000px)" srcset="${photo('heroMobile') || photo('hero')}">
              <img src="${photo('hero')}" alt="${esc(PHOTO_ALT.hero)}">
            </picture>`
            : img ? `<img src="${img}" alt="A jacket from the range, worn by two members of one team">` : ''}
        </div>
        <!-- The card reads the photograph rather than a garment: a uniform is
             developed against the place it is worn, so the place is what the
             opening states. No property is named. -->
        <div class="shero-card">
          <div class="shero-card-h">
            <span class="eyebrow">The setting</span>
            <span class="pill-s pill-s--flow">Summer season</span>
          </div>
          <div class="shero-card-t">Seafront terrace · Mediterranean</div>
          ${[['Service','Breakfast through late bar'],
             ['Roles','Reception, bar and floor'],
             ['Conditions','Hard light, 28–34 °C, salt air'],
             ['Laundry','Daily, industrial cycle']]
            .map(([k, v]) => `<div class="art-r"><span class="art-m">${k}</span><span>${v}</span></div>`).join('')}
          <div class="shero-card-f">The conditions a summer range is developed against, before a garment is chosen.</div>
        </div>
      </div>
    </div>
</section>`;
}

/* ---- 2. the figures ----------------------------------------------------
   One navy object, four columns, hairline divisions. These are structural
   facts about how a project runs. We publish no statistic we cannot trace
   to a stored record, so there are no performance numbers here. */
function figuresBand(){
  /* Four measured figures, all four confirmed by Leo. Each is a number the
     workshop can produce from its own records — output, elapsed time, lead
     time, spend — so each carries the unit it is measured in rather than a
     bare digit. */
  const figs = [
    ['2,600', '', 'Garments made in 2026',
     'Patterned, cut, sewn and finished within thirty kilometres of Barcelona, for this year\u2019s projects.'],
    ['12', 'weeks', 'Full project average',
     'From your first brief to delivery. We confirm your schedule based on the garments, quantities and approvals needed.'],
    ['3', 'weeks', 'Reorder production time',
     'Made from the approved garment details kept on file. We check availability and price again before production.'],
    ['€150', '', 'Average per person',
     'Typical spend per person for the garments in the agreed range. Development, fabric and quantity affect the final price.'],
  ];
  return `
  <section class="pub-sec pub-sec--flush">
    <div class="pub-wrap">
      <div class="band">
        <div class="band-g">
          ${figs.map(([v, u, l, n]) => `
          <div class="band-c">
            <div class="band-v">${v}${u ? `<span class="band-u">${u}</span>` : ''}</div>
            <div class="band-l">${l}</div>
            <p class="band-n">${n}</p>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </section>`;
}

/* ---- 3. the industries -------------------------------------------------
   Six environments, each with one photograph, the requirement that shapes
   the brief, and a route into the sector page. Roles first, garments after:
   the same order the brief itself asks in. */
const SECTOR_IMG = {
  hospitality:'m_stanley_oxford_shirt', wellness:'m_stella_harper',
  healthcare:'m_worker', retail:'m_prepster_2_0',
  corporate:'m_stanley_styler_shirt', food:'m_palmer',
};

function industriesBlock(ix){
  return `
  <section class="pub-sec" id="industries">
    <div class="pub-wrap">
      ${secHead(ix, 'Industries', 'Uniforms for your sector',
        'From hotel reception to the kitchen or treatment room, each role has its own needs.')}
      <div class="ind-g">
        ${SECTORS.map(s => {
          const im = photo(s.id) || imgOf(SECTOR_IMG[s.id]);
          return `
          <article class="ind">
            <div class="ind-m media">${im ? `<img src="${im}" loading="lazy"
              alt="${esc(PHOTO_ALT[s.id] || (s.n + ': a garment of the kind a brief in this sector covers'))}">` : ''}</div>
            <div class="ind-b">
              <h3 class="ind-t">${esc(s.n)}</h3>
              <p class="ind-p">${esc(s.d)}</p>
              <div class="ind-tags">${(s.tags || []).slice(0, 2).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
              <button class="lnk-a ind-go" data-act="briefSector" data-s="${s.id}">Start a brief for this team<span></span></button>
            </div>
          </article>`;
        }).join('')}
      </div>
</div>
  </section>`;
}

/* ---- 4. how it works ---------------------------------------------------
   The six formal stages, drawn as the six cards the structure asks for.
   Design is conditional — it appears only where design was part of what you
   bought — and the card says so rather than quietly implying it. */
/* ---- icons -------------------------------------------------------------
   Drawn by Lucide (lucide.dev), ISC licensed, pasted as path data rather
   than loaded — no request, no dependency, and the set stays consistent
   because one hand drew all of it.

   Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as
   part of Feather (MIT). All other copyright (c) for Lucide are held by
   Lucide Contributors 2022. Permission to use, copy, modify, and/or
   distribute this software for any purpose with or without fee is hereby
   granted, provided that the above copyright notice and this permission
   notice appear in all copies. */
const HOW_ICON = {
  /* pen-tool */
  design: '<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/>',
  /* layers */
  fabric: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  /* ruler */
  develop:'<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
  /* factory */
  produce:'<path d="M12 16h.01"/><path d="M16 16h.01"/><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M8 16h.01"/>',
  /* truck */
  deliver:'<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  /* rotate-cw */
  reorder:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
};
const howIcon = (k) => `<span class="how-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${HOW_ICON[k]}</svg></span>`;

function howItWorks(ix){
  const steps = [
    ['design', 'Design', 'An external designer creates a proposal from your brief for you to review. If design is not included in your project, we start with garment development.'],
    ['fabric', 'Fabrics and details', 'We choose fabrics, buttons, trims and finishes to suit your working conditions and the way you wash your uniforms.'],
    ['develop','Development', 'We turn the design into a clear plan for each garment, covering its details, colours and quantities.'],
    ['produce','Production', 'We make your garments to the approved design. Cutting starts only once the required details have your approval.'],
    ['deliver','Delivery', 'We send the garments to your locations. You confirm receipt, and we keep the approved styles ready for future orders.'],
    ['reorder','Reorders', 'We use the saved measurements, fabrics and colours for your next order. Availability, price and timing are checked again before production.'],
  ];
  return `
  <section class="pub-sec" id="how">
    <div class="pub-wrap">
      <div class="panel">
        ${secHead(ix, 'How it works', 'From your first idea to the next order',
          'Six clear stages. You review and approve the key decisions, and we keep a record of what we agree.')}
        <div class="how-g">
          ${steps.map(([k, h, p], i) => `
          <article class="how">
            <div class="how-h">${howIcon(k)}<span class="how-n">${String(i + 1).padStart(2, '0')}</span></div>
            <h3 class="how-t">${h}</h3>
            <p class="how-p">${p}</p>
          </article>`).join('')}
        </div>
        <div class="btn-row btn-row--top how-cta">
          ${ctaBtn('form', 'Discuss your project')}
        </div>
      </div>
    </div>
  </section>`;
}

/* ---- 5. the timeline ---------------------------------------------------
   Four phases across one line. The order is fixed; the duration is not, so
   no week count appears here — the section head says why.

   Each phase ends on a ruled line carrying the one condition that governs
   it. Those four rules sit on a single line across the section whatever the
   copy above them runs to, which is what makes the row read as four of the
   same thing rather than four loose columns. */
function timelineBlock(ix){
  const phases = [
    ['Your brief and first meeting', 'Tell us about your team, quantities and target date in nine short topics. We review your needs and arrange a first meeting if we can help.',
     'No account or payment needed.'],
    ['Samples and fittings', 'We choose fabrics and make samples for your team to try at work, checking fit, comfort and details.',
     'You approve each garment.'],
    ['Final approval and production', 'You confirm the quantities, colours and sizes. We then produce the garments to the agreed design.',
     'Production starts after approval.'],
    ['Delivery and reorders', 'We deliver your uniforms and keep the approved garment details for replacements and new team members.',
     'Your designs stay on file.'],
  ];
  return `
  <section class="pub-sec">
    <div class="pub-wrap">
      ${secHead(ix, 'Timeline', 'Your project, step by step',
        'We agree a schedule around your garments, quantities, fittings and approvals.', {left:true})}
      <ol class="pt">
        ${phases.map(([h, p, m], i) => `
        <li class="pt-i">
          <div class="pt-rail"><span class="pt-dot"></span></div>
          <div class="pt-b">
            <span class="pt-n">Phase ${i + 1}</span>
            <h3 class="pt-t">${h}</h3>
            <p class="pt-p">${p}</p>
            <span class="pt-m">${m}</span>
          </div>
        </li>`).join('')}
      </ol>
    </div>
  </section>`;
}

/* ---- 6. recent work ----------------------------------------------------
   The client's name is the one thing this section cannot carry, so it is
   built so that nothing depends on it. Each project opens into the property,
   the constraint that shaped the wardrobe, the decision taken and what came
   of it — and the photograph follows whichever one is open. */
function workPhoto(c){
  /* Each project runs its own frame, the same three the live site publishes. */
  return photo(c.photo) || photo('food') || imgOf(c.img);
}

function workBlock(ix){
  const c0 = CASES[0];
  return `
  <section class="pub-sec" id="work">
    <div class="pub-wrap">
      ${secHead(ix, 'Recent work', 'Uniforms in practice',
        'Explore our hotel and clinic projects, plus a practical guide to uniforms for wellness teams.', {left:true})}
      <div class="split split--wide work-s">
        <div class="split-b">
          <div id="workfig">${fig(workPhoto(c0), c0.alt, c0.tag, c0.link, '4x5')}</div>
        </div>
        <div class="split-b">
          <div class="cases">
            ${CASES.map((c, k) => `
            <details class="case" data-c="${c.id}" ${k === 0 ? 'open' : ''}>
              <summary class="case-q">
                <span class="case-n">0${k + 1}</span>
                <span class="case-t">
                  <span class="case-h">${esc(c.title)}</span>
                  <span class="case-m">${esc(c.tag)}</span>
                </span>
              </summary>
              <div class="case-b">
                <p class="case-scope">${esc(c.p)}</p>
                <div class="btn-row case-acts">
                  <button class="btn btn--ghost btn--sm" data-go="public:post:${c.post}">${esc(c.link)}</button>
                  <button class="btn btn--ghost btn--sm case-cta" data-act="briefCase" data-c="${c.id}">
                    Start a brief like this</button>
                </div>
              </div>
            </details>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ---- 7. what a project includes ----------------------------------------
   Six cards, each carrying a small artefact of the actual method rather
   than a stock illustration: a plan, a fabric shortlist, a fitting log, a
   label, a specification and a reorder record. */
function includesBlock(ix){
  /* Every card carries an artefact of the actual method, and every artefact
     is labelled the way it would be in the account: a navy bar naming the
     record and, on the right, the one number that record turns on. The navy
     is the same navy as the band and the closing panel — it marks the places
     where the project leaves something behind. */
  const artefact = (label, meta, body, mod) => `
    <div class="art ${mod || ''}">
      <div class="art-h"><span class="art-h-l">${label}</span><span class="art-h-m">${meta}</span></div>
      <div class="art-b">${body}</div>
    </div>`;

  const art = {
    plan: artefact('Role plan', '4 roles',
      [['Reception','Shirt · apron'],['Restaurant','Jacket · trouser'],['Kitchen','Chef jacket'],['Housekeeping','Tunic']]
        .map(([r, g]) => `<div class="art-r"><span>${r}</span><span class="art-m">${g}</span></div>`).join('')),

    fabric: artefact('Fabric shortlist', 'For your laundry routine',
      [['Twill','280'],['Piqué','220'],['Melton','480'],['Poplin','130']]
        .map(([n, w]) => `<div class="art-w">
          <span class="art-w-n">${n}</span>
          <span class="art-w-bar"><i style="width:${Math.round(w / 480 * 100)}%"></i></span>
          <span class="art-w-v">${w} g/m²</span></div>`).join(''), 'art--weights'),

    proto: artefact('Fitting log', '4 garments',
      [['Chef jacket','Approved','go'],['Service trouser','Approved','go'],
       ['Wrap jacket','Changes requested','wait'],['Apron','Round 2','flow']]
        .map(([n, st, k]) => `<div class="art-r"><span>${n}</span><span class="pill-s pill-s--${k}">${st}</span></div>`).join('')),

    brand: artefact('Label and colourways', '40 × 12 mm',
      `<div class="art-label">YOUR BRAND<span>woven label sewn into the seam</span></div>
       <div class="art-sw">${[['#011251','Custom navy'],['#F4F2ED','Off-white'],['#2F5D74','Marítim blue'],['#0E0E0E','Ink']]
         .map(([c, n]) => `<span title="${n}" style="background:${c}"></span>`).join('')}</div>`, 'art--brand'),

    spec: artefact('Technical file', 'Revision 4',
      [['Fabric','Cotton twill 280 g/m²'],['Colour','Custom navy · colour sample 3'],
       ['Positions','Chest · collar'],['Sizes','XS–3XL, 9 steps']]
        .map(([k, v]) => `<div class="art-r"><span class="art-m">${k}</span><span>${v}</span></div>`).join('')),

    reorder: artefact('Reorder record', '88 pieces',
      [['Approved revision','Rev. 4'],['Reordered','88 pieces'],['Unit price','Unchanged']]
        .map(([k, v]) => `<div class="art-r"><span class="art-m">${k}</span><span>${v}</span></div>`).join('')
      + `<div class="art-check">Made from your approved garment record</div>`),
  };

  const items = [
    ['Garments for each role','We plan what each person needs, from one role to a complete team wardrobe that works together.', art.plan],
    ['Fabrics for daily work','Fabric weight, composition and finishes are chosen for your working conditions and laundry routine.', art.fabric],
    ['Samples and fittings','Your team tries the samples at work. We record their feedback for each garment before approval.', art.proto],
    ['Your brand details','Colours, labels and details follow the agreed design and suit daily wear and washing.', art.brand],
    ['Your garment records','We keep the approved measurements, fabrics, colours and suppliers together in a garment record.', art.spec],
    ['Ready for reorders','We check fabric availability, price and timing before making your approved design again.', art.reorder],
  ];
  return `
  <section class="pub-sec">
    <div class="pub-wrap">
      ${secHead(ix, 'What is included', 'The details behind your custom workwear',
        'We agree what your project includes before starting. The examples below show the plans, samples and records that guide the work.')}
      <div class="sol-g">
        ${items.map(([h, p, a], k) => `
        <article class="sol">
          <div class="sol-h">
            <span class="sol-n">${String(k + 1).padStart(2, '0')}</span>
            <h3 class="sol-ht">${h}</h3>
          </div>
          <p class="sol-p">${p}</p>
          ${a}
        </article>`).join('')}
      </div>
    </div>
  </section>`;
}

/* ---- 8. the invitation --------------------------------------------------
   One navy panel, the way the portfolio reference closes: the ask, the
   action, and the quieter route for anyone not ready to answer nine
   questions yet. */
function closingBlock(ix){
  return `
  <section class="pub-sec">
    <div class="pub-wrap">
      <div class="ask">
        ${mark('mk--ask')}
        <span class="tag tag--dark"><i>${ix || '—'}</i>Start the conversation</span>
        <h2 class="display ask-t">Let’s plan your team’s uniforms</h2>
        <p class="lede ask-d">Tell us about your business, team and target date. We will review what you need
          and suggest a practical starting point. You can leave undecided details open, and review every
          answer before it is sent.</p>
        <div class="btn-row ask-btns">
          ${ctaBtn('form', 'Discuss your project')}
          ${ctaBtn({act:'advToggle'}, 'Prefer an initial conversation', 'ghost')}
        </div>
        <p class="t-xs ask-sup">Nine short topics, then a review. No account needed, and nothing is charged.</p>
        ${UI.advOpen ? `
        <div class="ask-disc ask-adv" id="adv">
          <div class="disc-b">
            <p class="t-sm">Send a short introduction. We’ll follow up with the questions needed to assess the project.</p>
            <form class="stack-3 adv-form" onsubmit="return false">
              ${[['adv_name','Your name','text'],['adv_email','Email','email'],
                 ['adv_co','Company or organisation','text']].map(([n, l, t]) => `
                <label class="fld"><span class="fld-l">${l}</span>
                  <input class="inp" type="${t}" name="${n}" required></label>`).join('')}
              <label class="fld"><span class="fld-l">What do you need?</span>
                <textarea class="inp" name="adv_msg" rows="3"
                  placeholder="For example, the team you want to dress and what you would like to change."></textarea></label>
              <label class="chk"><input type="checkbox" data-act="advCall"> <span>I would prefer a call</span></label>
              ${UI.advCall ? `<label class="fld"><span class="fld-l">Phone</span><input class="inp" type="tel" name="adv_phone"></label>` : ''}
              <div class="btn-row">
                <button class="btn btn--ghost" data-act="advSubmit">Request initial advice</button>
              </div>
              <p class="t-xs">We use these details to respond to your enquiry.
                <a class="lnk" data-go="public:privacy">Read our Privacy Notice.</a></p>
            </form>
          </div>
        </div>` : ''}
      </div>
    </div>
  </section>`;
}

/* ---- the Custom Uniforms page ------------------------------------------
   One page. Seven chapters in the order the structure sets out: the opening,
   the figures, the industries, how it works, the timeline, the work, what is
   included, the questions and the invitation. The questionnaire and the
   journal are the only other two places this service goes. */
function pubCustom(){
  return pubShell(`
  ${studioHero()}
  ${figuresBand()}
  ${industriesBlock('01')}
  ${howItWorks('02')}
  ${timelineBlock('03')}
  ${workBlock('04')}
  ${includesBlock('05')}

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secHead('06', 'Questions', 'What to know before you start',
        'Practical answers about orders, prices, timing and how we work.', {left:true})}
      <div class="faq-s">${faqBlock(STUDIO_FAQ, 'faq-studio')}</div>
    </div>
  </section>

  ${closingBlock('07')}
  `, 'custom');
}

/* ---- cases -------------------------------------------------------------- */
/* ---- the three projects ------------------------------------------------
   Real work, described without the client's name. Hotels do not advertise
   who makes their uniforms and the contracts usually say so, which means the
   name is the one thing we cannot publish — so the section is built to make
   everything else do the work instead: what the property is, what the
   wardrobe had to survive, and what we decided.

   EVERY FACTUAL LINE BELOW IS A DRAFT TO BE CORRECTED. The property types
   and the constraints are written from what is true of that kind of house;
   the counts and the outcomes are placeholders until Leo replaces them. */
const CASES = [
  {id:'mett_hotel', photo:'work1',
   tag:'Hotel case study', title:'Custom hotel uniforms for METT Barcelona',
   p:'A complete hotel wardrobe inspired by the interiors, with uniforms for reception, restaurant, management and spa teams. Designed, sampled and made in Barcelona.',
   post:'custom-hospitality-uniforms', link:'Read the hotel case study',
   alt:'A modernista facade in central Barcelona, the kind of property these uniform programmes are made for'},

  {id:'wellness_guide', photo:'work2',
   tag:'Wellness guide', title:'A guide to spa and wellness uniforms',
   p:'How to bring reception, treatment and support teams together through colours, fabrics and garment details, with future orders in mind.',
   post:'wellness-studio-uniform-system', link:'Read the wellness guide',
   alt:'Wellness team wardrobe connecting reception and treatment roles'},

  {id:'dental_clinic', photo:'work3',
   tag:'Clinic case study', title:'Custom uniforms for a Barcelona dental clinic',
   p:'Custom dental clinic uniforms that reflect the space and brand, with practical garments for reception and daily patient care.',
   post:'custom-dental-clinic-uniforms-barcelona', link:'Read the clinic case study',
   alt:'Custom clinical uniforms in a Barcelona dental practice'},
];


/* The sector, process, work and help pages that used to live here are out of
   this mockup by decision: the Studio is one page, the questionnaire and the
   journal. Their content still exists as data — SECTORS, STAGES and CASES —
   so the SEO and GEO pages planned from the footer can be built from it. */

/* ---- Merchandise FAQ ---------------------------------------------------- */
const MERCH_FAQ = [
  ['Do I pay when I request a quote?',
   'No. You select and configure products, then send a request for review. We confirm the proposal and any artwork requirements before you approve the relevant details and complete the agreed payment.'],
  ['What is the minimum order quantity?',
   'There is no minimum. Every product in the catalogue can be ordered from a single piece, and the quantity you need decides the bracket you pay at rather than whether we can make it. The brackets are on every product page, and personalisation setup is quoted separately so you can see what the first piece actually costs.'],
  ['Is personalisation included in the displayed price?',
   'The price explanation states what is included and the quantity it is based on. Some configurations need artwork or method review before the full amount can be confirmed. Your reviewed quote sets out the products, decoration, charges, delivery and tax treatment.'],
  ['Can I request a quote without final artwork?',
   'Yes, where the product allows a request with artwork to follow. Choose that option or ask for artwork help. We may need the file before confirming the final method, setup cost or production proof.'],
  ['How do I know which method to choose?',
   'The product shows its available options. You can select a preference or ask us to recommend a method. We assess the garment, placement, dimensions and artwork before confirming the production details.'],
  ['When will my merchandise arrive?',
   'Tell us the destination and preferred date. Any initial estimate is subject to review. The confirmed schedule depends on product availability and the required artwork approvals and payment, so a requested date is not an automatic delivery commitment.'],
  ['Can I mix sizes or colours?',
   'Size and colour options depend on the product. Add the quantities you need and provide the size breakdown where available. Minimums and pricing may apply differently across colours or decoration setups; these are checked in the quote.'],
  ['Can I see a sample before the full order?',
   'Ask about sample availability, costs and timing for the product you are considering. A blank product sample, a decoration sample and a digital proof serve different purposes. We’ll clarify what is available before you proceed.'],
  ['Will I approve the artwork before production?',
   'Where a proof is required, we share the reviewed artwork and placement details for approval. Check the dimensions, content and relevant colour information. Production requires the applicable approvals and agreed payment, not just an uploaded file.'],
  ['Can I change my request?',
   'You can edit your basket before sending it. After submission, request a change through the quote conversation. Changes to an issued proposal may affect price, artwork or timing and require a revised version and renewed approval.'],
  ['Can I reorder the same items?',
   'Use the previous order or quote reference to request a repeat. We check the approved product and artwork record against current availability, price and timing before confirming the new order.'],
  ['What if something is wrong with the delivered order?',
   'Contact us with the order reference and a description of the issue so we can review it. The applicable terms explain the process for personalised products, defects and delivery problems. Check those terms before approving the order.'],
];

/* An acronym is not a name. The trade searches for DTF and DTG, so both stay,
   but neither is the first thing a reader meets. The second line of each card
   is the note that already lives in the catalogue; the third is what the
   method does to the bill, which is the part that surprises people. */
const METHOD_FULL = {
  embroidery:'Embroidery', screen:'Screen print', woven_label:'Woven label',
  heat:'Heat transfer', dtf:'Direct to film (DTF)', dtg:'Direct to garment (DTG)',
};
/* Read from the rate card rather than asserted. These captions used to claim
   "no setup charge" for DTF and DTG while the ticket beside them said the
   setup was still to be quoted — the sheet is explicit that a missing setup is
   unknown, not free, so the caption now says what the data says. */
function methodCost(k){
  const rc = S.decoRates, m = rc && rc.methods && rc.methods[k];
  if(!m) return 'Priced on request';
  if(m.status && m.status !== 'priced') return 'Priced on request';
  const by = m.pricedBy === 'quantity' ? 'priced by quantity and ink colours' : 'priced by size';
  const setup = m.setup == null ? 'Setup quoted with your artwork' : 'Setup ' + money(m.setup) + ' per job';
  return setup + ' · ' + by;
}
const methodFull = (k) => METHOD_FULL[k] || ((S.personalization || {})[k] || {}).name || k;
/* Chips carry the short name so the row stays one line; the full name and the
   acronym it stands for are spelled out on the meta line under them. */
const METHOD_SHORT = {
  embroidery:'Embroidery', screen:'Screen print', woven_label:'Woven label',
  heat:'Heat transfer', dtf:'DTF', dtg:'DTG',
};
const methodShort = (k) => METHOD_SHORT[k] || methodFull(k);
/* The catalogue note opens by spelling the acronym out, which the card title
   now does. Saying it twice in two lines reads as a stutter. */
const methodNote = (k) => (((S.personalization || {})[k] || {}).note || '')
  .replace(/^Direct-to-(film|garment)\.\s*/i, '');

/* How each one is actually made. The catalogue note says what a method suits;
   this says what it is, because "DTF" means nothing to someone ordering forty
   shirts for a hotel opening. Kept behind a disclosure so the step stays the
   height of four cards until somebody wants the answer. */
const METHOD_WHAT = {
  embroidery:'Thread stitched into the cloth by machine, following a digitised version of your artwork. The design is made of stitches rather than ink, so it has texture and depth — and fine detail or gradients cannot survive, because every colour is a separate thread.',
  screen:'Ink pushed through a fine mesh stencil, one screen cut per colour, then cured with heat. The work sits in making the screens, which is why the setup is charged per colour and the printing itself is cheap once they exist.',
  woven_label:'Your mark woven into a small label on a loom — thread, not print — then stitched into a seam or hem. It outlasts the garment and reads as clothing rather than merchandise.',
  heat:'The design is cut or printed onto a transfer sheet and pressed onto the garment with heat. It sits on top of the cloth rather than in it, which is what gives the sharp edges and the shorter life through the wash.',
  dtf:'Direct to film. Your artwork is printed onto a transfer film, dusted with an adhesive powder, then heat-pressed onto the garment. Nothing is screened or stitched, so a photograph costs the same as one colour, and it holds on cotton, polyester and blends alike.',
  dtg:'Direct to garment. A printer sprays water-based ink straight into the fibres, the way an inkjet prints onto paper. The ink sits in the cloth rather than on it, so the print stays soft to the touch and carries photographic detail — but it needs cotton to bind to.',
};

/* The comparison sits on the page rather than behind a link, because the
   question it answers — which of these suits my artwork — is asked while the
   choice is open, and a modal would hide the configuration behind it. */
function methodHelp(pers){
  return `
  <div class="mhelp">
    <dl class="mwhat">
      ${(pers || []).map(m => `
        <div class="mwhat-r">
          <dt>${esc(methodFull(m))}<span class="mwhat-c">${esc(methodCost(m))}</span></dt>
          <dd>${esc(METHOD_WHAT[m] || methodNote(m))}</dd>
        </div>`).join('')}
    </dl>
    <p class="t-xs muted">Artwork is reviewed before anything is set up. If a method will not hold on the
      fabric you chose, we say so with the quote rather than after production.</p>
  </div>`;
}

const METHODS = [
  ['Embroidery','A stitched finish. Suitability depends on the fabric, detail and size of your artwork.',
   'Setup applies per artwork. Size brackets follow the product rule.'],
  ['Screen printing','Printed ink with colour and setup requirements that depend on the design and quantity.',
   'Setup applies per colour. Unit rate falls as quantity rises.'],
  ['Transfer (DTF)','A transferred design, available on compatible products and placements.',
   'No setup charge. Full colour without a colour count.'],
  ['Direct to garment','A direct print option for compatible garments and artwork.',
   'No setup charge. Compatible garments only.'],
];

const ORDER_STEPS = [
  ['Build your request','Choose products, quantities and personalisation. Add artwork now or tell us it will follow.'],
  ['Receive a reviewed quote','We check the request and confirm the price, artwork requirements and proposed timing.'],
  ['Approve and pay','Review the quote and proof where required, approve the details, and complete the agreed payment.'],
  ['Production and delivery','Production starts once the required approvals and payment are in place. We share the confirmed delivery information.'],
];

function searchBar(v){
  return `
  <div class="srch">
    <label class="fld fld--grow"><span class="fld-l">Search products</span>
      <input class="inp" type="search" id="q" value="${esc(v || '')}"
        placeholder="Try a product name, garment type or reference"></label>
    <button class="btn btn--ghost" data-act="doSearch">Search</button>
  </div>`;
}

/* ---- shared merchandise components ------------------------------------- */

/* The category strip from the reference: a row of real product thumbnails
   that act as the primary filter on every listing page. */
function catStrip(active){
  return `
  <div class="cstrip" role="navigation" aria-label="Collections">
    ${catsInUse().map(c => {
      const im = catImg(c), on = c === active;
      return `<button class="cst ${on ? 'cst--on' : ''}" data-go="public:collection:${merchSlug(c)}"
        aria-current="${on ? 'true' : 'false'}">
        <span class="cst-i">${im ? `<img src="${im}" alt="" loading="lazy">` : ''}</span>
        <span class="cst-l">${esc(catName(c))}</span>
      </button>`;}).join('')}
    <button class="cst ${!active ? 'cst--on' : ''}" data-go="public:products" aria-current="${!active ? 'true' : 'false'}">
      <span class="cst-i cst-i--all">${S.merchProducts.length}</span>
      <span class="cst-l">All products</span>
    </button>
  </div>`;
}

/* A horizontal carousel. Scroll-snapped, arrow-driven, and it degrades to a
   plain scrollable row without JavaScript. */
function carousel(id, cards, label){
  return `
  <div class="carou" id="${id}">
    <div class="carou-h">
      <span class="eyebrow">${label}</span>
      <span class="spacer"></span>
      <button class="carou-b" data-act="carouPrev" data-c="${id}" aria-label="Previous products">←</button>
      <button class="carou-b" data-act="carouNext" data-c="${id}" aria-label="Next products">→</button>
    </div>
    <div class="carou-t" id="${id}-t">${cards.join('')}</div>
  </div>`;
}

/* Reviews. We hold no review data, and the specification forbids inventing
   any — so rather than show four empty slots explaining their own emptiness,
   the section simply is not there until a verified feed supplies it. An empty
   shelf on a product page reads as "nobody has bought this", which is worse
   than saying nothing at all. The design is kept below, ready for the day
   S.reviews has something in it. */
function reviewsSlot(){
  const have = (S.reviews || []).length;
  if(!have) return '';
  return `
  <section class="pub-sec pub-sec--tight sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'Customer reviews', 'Awaiting a verified source')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">What customers say.</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">Reviews are published from a verified review
            platform, not written in-house. Until that feed is connected, these slots stay empty rather than
            carry invented praise.</p>
        </div>
        <div class="split-b">
          <div class="grid grid-2 gap-lg">
            ${[1,2,3,4].map(() => `
            <div class="ph ph--1x1 rev-ph">
              <div class="ph-in">
                <div class="ph-id">REVIEW SLOT</div>
                <div class="ph-d">Reviewer name · rating · date · title · body · link to the source review</div>
              </div>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* FAQ appears on every page. The set is chosen by branch. */
function faqSection(branch, ix){
  const items = branch === 'merch' ? MERCH_FAQ : STUDIO_FAQ;
  const help  = branch === 'merch' ? 'merchhelp' : 'studiohelp';
  return `
  <section class="pub-sec ${branch === 'merch' ? 'pub-sec--warm' : ''}">
    <div class="pub-wrap">
      ${secHead(ix || '—', 'Questions', 'Questions before you decide?',
        'The essentials, answered here. Twelve in all, and you can ask us something that is not covered.',
        {left:true, merch: branch === 'merch',
         after:`<div class="shd-a" data-go="public:${help}">${arrow('All questions')}</div>`})}
      <div class="faq-s">${faqBlock(items, 'faq-' + branch + '-' + (ix || 'x'))}</div>
    </div>
  </section>`;
}

/* ---- MERCHANDISE ---------------------------------------------------------
   The same language as the Studio one-pager — pill label, light display line,
   rounded panels, one navy band — with the Merchandise red carried only in
   the index chip and the eyebrows. The catalogue does the talking: a product
   card says what the thing is, what it weighs, where its price starts and how
   many colours it comes in, and nothing else. Everything true of every card —
   the basis, the VAT position, that personalisation is quoted separately — is
   stated once under the grid instead of five times inside it.
   ========================================================================= */

/* The head of a listing page: where you are, what this is, one line about it. */
function mPageHead(o){
  return `
  <section class="pub-sec pub-sec--flush mph">
    <div class="pub-wrap">
      ${o.crumb ? `<nav class="crumb" aria-label="Breadcrumb">${o.crumb}</nav>` : ''}
      <span class="tag tag--merch tag--plain">${o.ix ? `<i>${o.ix}</i>` : ''}${o.label}</span>
      <h1 class="display mph-t">${o.title}</h1>
      ${o.lede ? `<p class="lede mph-d">${o.lede}</p>` : ''}
      ${o.after || ''}
    </div>
  </section>`;
}

/* ---- the product card ---------------------------------------------------
   Four lines and a row of colours. The whole card is the control. */
/* A card for a grouped product has to say two things: that a choice is waiting,
   and what the choice is over. "15 garments" alone reads as stock; an invitation
   with the axes named reads as something you do. Only axes that genuinely vary
   are named, so a product with one fit never offers to let you choose it. */
/* The card used to name the questions the page would ask. That told a reader
   what they would be doing, not what they would get. This names the choices
   themselves — four fits, ten weights — which is the reason to open it, and
   it is short enough to hold one line at the narrowest card in the grid. */
function buildChoices(p){
  const m = p.matrix || [];
  if(m.length < 2) return [];
  const u = (k) => new Set(m.map(x => x[k]).filter(Boolean)).size;
  const out = [];
  if(u('f') > 1) out.push(u('f') + ' fits');
  if(u('w') > 1) out.push(u('w') + ' weights');
  /* where neither varies, what separates them is the style, then the range */
  if(!out.length && u('style2') > 1) out.push(u('style2') + ' styles');
  if(!out.length && u('g') > 1)      out.push(u('g') + ' size ranges');
  if(!out.length)                    out.push(m.length + ' options');
  return out;
}
function buildLine(p){
  const c = buildChoices(p);
  return c.length ? 'Build yours · ' + c.join(' · ') : '';
}

/* The catalogue's "from" price is the cheapest this product can be BOUGHT at,
   which is the deepest quantity break on its cheapest garment — not the price
   of one piece. It is read off the matrix rather than off p.from, because the
   product page writes p.from as the visitor configures, and a card must not
   change price because someone once opened it. */
function catFrom(p){
  let best = null;
  (p.matrix || []).forEach(m => (m.breaks || []).forEach(b => {
    if(b.price != null && (!best || b.price < best.price)) best = {price:b.price, qty:b.qty};
  }));
  /* a product with no matrix at all still has its own ladder */
  if(!best && p.breaks && p.breaks.length){
    p.breaks.forEach(b => { if(b.price != null && (!best || b.price < best.price))
      best = {price:b.price, qty:b.qty}; });
  }
  return best;
}
const catLow = (p) => { const b = catFrom(p); return b ? b.price : null; };
const poolLow = (list) => { const xs = list.map(catLow).filter(n => n != null);
  return xs.length ? Math.min(...xs) : null; };

function garmentCount(p){
  const n = (p.matrix || []).length;
  /* Shown even when it is one: every card then carries the same fact, and
     "1 option available" is what tells a reader this one is not configurable
     before they open it looking for choices. */
  return n ? n + ' option' + (n === 1 ? '' : 's') + ' available' : '';
}
/* the weight a card shows: the span when the group covers several */
function cardWeight(p){
  const ws = [...new Set((p.matrix || []).map(m => +m.w).filter(Boolean))].sort((a, b) => a - b);
  if(!ws.length) return p.weight ? p.weight + ' g/m²' : '';
  return (ws.length === 1 ? ws[0] : ws[0] + '–' + ws[ws.length - 1]) + ' g/m²';
}

function pcard(p){
  const im = prodImg(p);
  const lo = catFrom(p);
  const cols = (p.colours || []).filter(c => COLOURS[c]);
  const shown = cols.slice(0, 5);
  return `
  <article class="pc hovr" data-go="public:product:${p.id}" tabindex="0" role="link"
    aria-label="${esc(p.name)}">
    <div class="pc-m media">
      ${im ? `<img src="${im}" alt="${esc(p.name)}" loading="lazy">`
           : `<span class="pc-ph">${p.glyph || '·'}</span>`}
    </div>
    <div class="pc-b">
      <h3 class="pc-t">${esc(p.name)}</h3>
      <div class="pc-meta">${esc(p.ref)}${cardWeight(p) ? ' · ' + esc(cardWeight(p)) : ''}</div>
      ${garmentCount(p) ? `<span class="pc-n">${garmentCount(p)}</span>` : ''}
      ${buildLine(p) ? `<div class="pc-var"><span>${esc(buildLine(p))}</span>
        <i aria-hidden="true">&#8594;</i></div>` : ''}
      <div class="pc-f">
        <span class="pc-price">${lo
          ? `<span>From</span><b>${money(lo.price)}</b>`
          : `<em>Price on request</em>`}</span>
        ${cols.length ? `<span class="pc-sw" aria-label="${cols.length} colours">
          ${shown.map(c => `<i style="background:${COLOURS[c].hex}"></i>`).join('')}
          ${cols.length > shown.length ? `<em>+${cols.length - shown.length}</em>` : ''}
        </span>` : ''}
      </div>
    </div>
  </article>`;
}

/* ---- the collection card ------------------------------------------------ */
/* Seven families read better as a rail you move through than as a grid that
   drops the last row onto its own line. Native scroll with snap does the
   moving, so touch, trackpad, keyboard and the two buttons all drive the
   same thing rather than three separate implementations. */
function collectionsRail(){
  const cats = catsInUse();
  return `
  <div class="carou" data-carou>
    <div class="carou-t" data-carou-track tabindex="0" role="group"
         aria-label="Collections — ${cats.length} of them, scroll or use the buttons below">
      ${cats.map(ccard).join('')}
    </div>
    <div class="carou-f">
      <div class="carou-p"><i data-carou-bar style="width:30%"></i></div>
      <div class="carou-nav">
        <button class="carou-b" data-act="carou" data-d="-1"
          aria-label="Previous collections" disabled>&#8592;</button>
        <button class="carou-b" data-act="carou" data-d="1"
          aria-label="Next collections">&#8594;</button>
      </div>
    </div>
  </div>`;
}

function ccard(c){
  const im = catImg(c), n = catList(c).length;
  const from = poolLow(catList(c));
  return `
  <article class="cc hovr" data-go="public:collection:${merchSlug(c)}">
    <div class="cc-m media">${im ? `<img src="${im}" alt="${esc(catName(c))}" loading="lazy">` : ''}</div>
    <div class="cc-b">
      <h3 class="cc-t">${esc(catName(c))}</h3>
      <p class="cc-p">${catCopy(c)}</p>
      <div class="cc-f">
        <span class="cc-n">${n} product${n === 1 ? '' : 's'}${from ? ' · from ' + money(from) : ''}</span>
        ${arrowBtn('View', 'public:collection:' + merchSlug(c), 'View the ' + catName(c) + ' collection')}
      </div>
    </div>
  </article>`;
}

/* ---- the filters --------------------------------------------------------
   Everything visible at once, as pills. No disclosure to open, no number to
   type: the quantity you need is a choice too, because a minimum is the one
   thing that rules a product out before anything else. */
/* Thirty chips in an open wall was most of a screen before a single product,
   and five of them matched nothing at all. The groups now sit behind a single
   control, an option that would return no products is not offered, and what is
   applied stays visible while the panel is shut. */
/* What the filters are filtering. On a collection page that is the collection
   being viewed, not the whole catalogue: the count beside the filters has to
   mean the same thing as the count in the heading above it, and an option
   promising six has to be six on THIS page. */
function fPool(scope){
  const all = S.merchProducts || [];
  if(scope === 'all') return all;
  const c = ROUTE.page === 'collection' ? catFromSlug(ROUTE.params.id) : null;
  if(c) return all.filter(p => p.cat === c);
  const f = listState();
  return f.cats.length ? all.filter(p => f.cats.includes(p.cat)) : all;
}
/* A beanie carries no recorded weight. Banding it as "light cloth" puts it
   under a filter it has no claim to, so no weight means no band. */
const WT_BAND = (w) => { w = +w || 0; return !w ? null : w < 200 ? 'light' : w < 350 ? 'mid' : 'heavy'; };
/* how many products an option would leave — 0 means do not offer it */
function fCount(pool, test){ return pool.filter(p => (p.matrix || []).some(test)).length; }

function filterBar(scope){
  const f = listState(), chips = activeChips();
  const pool = fPool(scope);
  const open = !!UI.fOpen;
  const pill = (on, act, v, label, n) => `<button class="fp ${on ? 'fp--on' : ''}" data-act="${act}"
    data-v="${esc(v)}" aria-pressed="${on}">${label}${n == null ? '' : `<em>${n}</em>`}</button>`;
  const grp = (label, body) => body.trim()
    ? `<div class="fgrp"><span class="fgrp-l">${label}</span><div class="fgrp-p">${body}</div></div>` : '';

  /* every option that still leaves something */
  const methods = Object.keys(S.personalization || {})
    .map(m => [m, fCount(pool, x => (x.pers || []).includes(m))]).filter(([, n]) => n);
  const segs = GENDERS.map(g => [g, fCount(pool, x => serves(g.k, x.g))]).filter(([, n]) => n);
  const fits = FITS.map(x => [x, fCount(pool, m => m.f === x.k)]).filter(([, n]) => n);
  const wts  = [['light','Light'],['mid','Mid'],['heavy','Heavy']]
    .map(([v, nm]) => [v, nm, fCount(pool, m => WT_BAND(m.w) === v)]).filter(([, , n]) => n);
  /* the price a filter sorts on is the price the card shows */
  const priceN = {
    u20:  pool.filter(p => { const v = catLow(p); return v != null && v < 20; }).length,
    '20_40': pool.filter(p => { const v = catLow(p); return v != null && v >= 20 && v < 40; }).length,
    o40:  pool.filter(p => { const v = catLow(p); return v != null && v >= 40; }).length,
    req:  pool.filter(p => catLow(p) == null).length,
  };
  const prices = [['u20','Under €20'],['20_40','€20–40'],['o40','€40 and over'],['req','On request']]
    .filter(([v]) => priceN[v]);

  const count = chips.length;
  return `
  <div class="fbar">
    ${scope === 'all' ? `
    <div class="fscroll" role="group" aria-label="Collection">
      ${pill(!f.cats.length, 'fCatAll', '', 'All products')}
      ${catsInUse().map(c => pill(f.cats.includes(c), 'fCat', c, esc(catName(c)))).join('')}
    </div>` : ''}

    <div class="fhead">
      <button class="fbtn ${open ? 'fbtn--on' : ''}" data-act="fToggle" aria-expanded="${open}"
        aria-controls="fpanel">
        <span class="fbtn-i" aria-hidden="true">${FILTER_GLYPH}</span>
        <span>Filters</span>${count ? `<em class="fbtn-n">${count}</em>` : ''}
        <span class="fbtn-c" aria-hidden="true">${open ? '−' : '+'}</span>
      </button>
      ${count ? `<div class="fapp">
        ${chips.map(([n, a, v]) => `<button class="fx" data-act="${a}" data-v="${esc(v)}">${esc(n)}<i>×</i></button>`).join('')}
        <button class="btn btn--quiet btn--sm" data-act="fClear">Clear all</button>
      </div>` : `<span class="fhead-h">${pool.length} product${pool.length === 1 ? '' : 's'}</span>`}
      <label class="fsort fsort--top"><span class="vh">Sort</span>
        <select class="fsel" data-act="fSort">
          ${[['recommended','Recommended'],['plh','Price low to high'],['phl','Price high to low'],['name','Name A–Z']]
            .map(([v, n]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${n}</option>`).join('')}
        </select></label>
    </div>

    ${open ? `<div class="frow" id="fpanel">
      ${grp('Personalisation', methods.map(([m, n]) =>
        pill(f.methods.includes(m), 'fMethod', m, esc((S.personalization[m] || {}).name || m), n)).join(''))}
      ${grp('Price at the minimum', prices.map(([v, nm]) =>
        pill(f.price === v, 'fPrice', v, nm, priceN[v])).join(''))}
      ${grp('Who wears it', segs.map(([g, n]) => pill(f.seg.includes(g.k), 'fSeg', g.k, g.n, n)).join(''))}
      ${grp('Fit', fits.map(([x, n]) => pill(f.fit.includes(x.k), 'fFit', x.k, x.n, n)).join(''))}
      ${grp('Cloth weight', wts.map(([v, nm, n]) =>
        pill(String(f.wt || '') === v, 'fWt', v, nm, n)).join(''))}
      ${grp('Quantity you need', [['','Any'],['1','1'],['10','10'],['25','25'],['50','50'],['100','100'],['250','250']]
        .map(([v, n]) => pill(String(f.qty || '') === v, 'fQtyV', v, n)).join(''))}
    </div>` : ''}
  </div>`;
}
const FILTER_GLYPH = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
  stroke-width="1.4" stroke-linecap="round"><path d="M2 4h12M4.5 8h7M7 12h2"/></svg>`;
const SEARCH_GLYPH = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
  stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4 14 14"/></svg>`;

/* ---- the grid -----------------------------------------------------------
   The count and the price basis live under the grid, once, where they are
   true of everything above them. */
function listBody(list, total, emptyMsg){
  const shown = Math.min(UI.shown || PAGE_STEP, list.length);
  const rest  = list.length - shown;
  if(!list.length) return `
    <div class="empty-p">
      <h3 class="t-h4">${emptyMsg}</h3>
      <p class="t-sm muted">Remove a filter, or ask us to help find an option.</p>
      <div class="btn-row btn-row--top">
        <button class="btn btn--ghost btn--sm" data-act="fClear">Clear all filters</button>
        <button class="btn btn--quiet btn--sm" data-go="public:merchhelp">Get help choosing</button>
      </div>
    </div>`;
  return `
    <div class="pgrid">${list.slice(0, shown).map(pcard).join('')}</div>
    <div class="more" id="more">
      <div class="more-l">
        <span class="t-sm muted num">Showing ${shown} of ${list.length}${
          total && total !== list.length ? ` · ${total} in the catalogue` : ''}</span>
        <span class="t-xs muted">Prices are per piece at the best quantity break, for the garment
          only. Personalisation is quoted separately. Excludes VAT.</span>
      </div>
      ${rest > 0
        ? `<button class="btn btn--ghost btn--arrow" data-act="more">Load ${Math.min(rest, PAGE_STEP)} more<i class="btn-a" aria-hidden="true">↓</i></button>`
        : `<span class="t-sm muted">End of the list</span>`}
    </div>`;
}

/* ---- the merchandise home ----------------------------------------------
   One opening, one band of figures, the collections, a short selection, how
   an order runs, what we check before a product is listed, and the ask. */
function merchHero(){
  /* These were ids from the fifteen-product catalogue this one replaced, so
     the hero of the merchandise site has been rendering an empty box. It now
     asks the catalogue that actually exists, the same way every card does. */
  /* The photograph of the thing itself, worn. A packshot says what the garment
     looks like; this says what it is for, which is the job of a hero. Falls
     back to a catalogue shot if the file is not loaded. */
  const editorial = window.MERCH_HERO || null;
  const heroShot = editorial || (() => {
    for(const id of ['m_sherpa_jackets','m_light_jackets','m_pullover_hoodies','m_zip_sweatshirts']){
      const prod = S.merchProducts.find(x => x.id === id);
      const got = prod && productCardShot(prod, 'studio-01');
      if(got) return got.src;
    }
    const any = S.merchProducts.find(x => (x.matrix || []).length);
    const got = any && productCardShot(any, 'studio-01');
    return got ? got.src : null;
  })();
  const img = heroShot;
  const ex  = by(S.merchProducts, 'm_asher') || S.merchProducts.find(p => !p.quoteOnly);
  const meth = (S.personalization || {}).embroidery;
  return `
  <section class="shero shero--merch">
    <div class="pub-wrap shero-in">
      <div class="shero-copy">
        <span class="news news--merch">${mark('mk--news')}<b>Merchandise</b>${S.merchProducts.length} products, decorated in our own workshop</span>
        <h1 class="display shero-t">Branded merchandise, chosen by you and personalised for your&nbsp;company.</h1>
        <p class="lede shero-d">Custom apparel for staff, events and company merchandise. Choose the garment,
          the cloth, the colour and the personalisation. We review the request and quote it before anything
          is made.</p>
        <div class="btn-row btn-row--top">
          ${ctaBtn('collections', 'Browse the collections')}
          ${ctaBtn('howto', 'How ordering works', 'ghost')}
        </div>
        <p class="t-xs muted shero-sup">Nothing is charged when you request a quote.</p>
      </div>
      <div class="shero-media${editorial ? ' shero-media--ed' : ''}">
        <div class="media media--4x5 shero-img${editorial ? ' shero-img--ed' : ''}">
          ${img ? `<img src="${img}" alt="${editorial
            ? 'Three restaurant staff in PAMUUC navy t-shirts, laughing together in their kitchen'
            : 'A catalogue product carrying a decoration example'}">` : ''}
        </div>
        <div class="shero-card">
          <div class="shero-card-h">
            <span class="eyebrow eyebrow-red">A configured line</span>
            <span class="pill-s pill-s--flow">No payment</span>
          </div>
          <div class="shero-card-t">${esc(ex ? ex.name : 'Heavyweight T-shirt')}</div>
          ${(() => {
            const rows = [['Reference', ex ? ex.ref : '—'],
              ['From', (() => { const b = ex && catFrom(ex);
                 return b ? 'From ' + money(b.price) + ' per piece' : 'Price on request'; })()],
              ['Minimum', pcs(ex ? ex.moq : 1)],
              ['Personalisation', meth ? meth.name + ', quoted separately' : 'Quoted separately']];
            /* over a photograph of people, the card has to be short enough to
               sit on the floor of the picture rather than across their laps */
            return (editorial ? rows.slice(0, 3) : rows)
              .map(([k, v]) => `<div class="art-r"><span class="art-m">${k}</span><span>${esc(String(v))}</span></div>`).join('');
          })()}
          ${editorial ? '' : '<div class="shero-card-f">An example of what a product card carries into a quote.</div>'}
        </div>
      </div>
    </div>
    <div class="pub-wrap">
      <div class="trust">
        <span class="trust-l">Every method produced in one workshop</span>
        <div class="trust-r">
          ${['embroidery','screen','dtf'].map(k => (S.personalization || {})[k]).filter(Boolean)
            .map(m => `<button class="trust-i" data-go="public:method">
              <b>${esc(m.name)}</b><span>${esc(m.note)}</span></button>`).join('')}
        </div>
      </div>
    </div>
  </section>`;
}

function merchFigures(){
  const methods = Object.keys(S.personalization || {}).length;
  /* Counted off the matrix, like every other catalogue figure: p.breaks is
     rewritten by the product page as a visitor configures, so a band reading
     it would change depending on where they had already been. */
  const brackets = new Set();
  let garments = 0;
  S.merchProducts.forEach(p => (p.matrix || []).forEach(m => {
    garments++; (m.breaks || []).forEach(b => brackets.add(b.qty)); }));
  const figs = [
    [String(garments), 'Products listed',
     'Every individual garment we carry, each checked for weight, composition and the decoration '
     + 'it will actually take — grouped into ' + S.merchProducts.length + ' you configure.'],
    ['1', 'Piece, minimum', 'Every product in the catalogue can be ordered from one. What changes with quantity is the price, across ' + brackets.size + ' brackets.'],
    [String(methods), 'Personalisation methods', 'Embroidery, screen, transfer and the rest, all produced in house rather than sent out.'],
    /* a display numeral, so no decimals — money() would render €0.00 */
    ['\u20AC0', 'Charged at request', 'Configure as much as you like. A request starts a review, not an order.'],
  ];
  return `
  <section class="pub-sec pub-sec--flush">
    <div class="pub-wrap">
      <div class="band">
        <div class="band-g">
          ${figs.map(([v, l, n]) => `
          <div class="band-c">
            <div class="band-v">${v}</div>
            <div class="band-l">${l}</div>
            <p class="band-n">${n}</p>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </section>`;
}

/* Category marks, drawn here rather than reproduced: these stand for the kind
   of certificate a product may carry, not for any certification body. A real
   scheme's logo may only appear against a product whose certificate is on
   file, which is exactly what the paragraph beside them says. */
const CERT_ICON = {
  /* leaf · recycle · flask-conical · users — Lucide, ISC, as above */
  organic:  '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
  recycled: '<path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/>',
  chemical: '<path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"/><path d="M6.453 15h11.094"/><path d="M8.5 2h7"/>',
  social:   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
};
const certMark = (k) => `<span class="cert-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${CERT_ICON[k] || ''}</svg></span>`;

const ORDER_ICON = {
  /* shirt · settings-2 · search · file-check · factory — Lucide, ISC, as above */
  choose: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  configure:'<path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  review: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  proof:  '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m9 15 2 2 4-4"/>',
  make:   '<path d="M12 16h.01"/><path d="M16 16h.01"/><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/>',
};

const orderIcon = (k) => `<span class="how-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ORDER_ICON[k]}</svg></span>`;

function merchHow(ix){
  const steps = [
    ['choose', 'Choose the product', 'Compare weight, composition and the methods a product carries. The minimum is on the card, before you open anything.'],
    ['configure','Configure it', 'Colour, quantity, placement and method. The price moves as you change it, so nothing is a surprise at the end.'],
    ['review', 'We review the request', 'We check the artwork against the method, the placement against the garment, and the quantity against availability.'],
    ['proof', 'Approve the proof', 'Where a proof is required you approve the artwork, size and position before anything is set up.'],
    ['make', 'We produce and deliver', 'Production starts once the approvals and payment are in place, and the approved file is archived for the next run.'],
  ];
  return `
  <section class="pub-sec pub-sec--warm" id="how">
    <div class="pub-wrap">
      <div class="panel">
        ${secHead(ix, 'How ordering works', 'Configure it, and we quote it.',
          'A request is not an order. Everything you configure here is reviewed by a person before a price is confirmed.',
          {merch:true})}
        <div class="how-g how-g--5">
          ${steps.map(([k, h, p], i) => `
          <article class="how">
            <div class="how-h">${orderIcon(k)}<span class="how-n">${String(i + 1).padStart(2, '0')}</span></div>
            <h3 class="how-t">${h}</h3>
            <p class="how-p">${p}</p>
          </article>`).join('')}
        </div>
        <div class="btn-row btn-row--top how-cta">
          ${ctaBtn('products', 'Browse all ' + S.merchProducts.length + ' products')}
        </div>
      </div>
    </div>
  </section>`;
}


/* ---- the product journey ------------------------------------------------
   One page per family rather than one page per style. You answer who wears
   it, how it should fit and how heavy the cloth is, and forty-four T-shirts
   become one. The price follows every answer, because each answer removes
   styles and the cheapest of what is left changes with them.

   WHO WEARS IT is real data. Stanley/Stella encode the segment in the fourth
   character of the style code — STTU078 is unisex, STTW is women, STTM men,
   STTK kids, STTB baby — and the naming corroborates it: every W is a
   Stella, every M a Stanley, every K a Mini, every B a Baby. Nothing is
   guessed.

   FIT IS NOT IN THIS DATA. The supplier publishes it, but this catalogue
   export does not carry it, so FIT_BY_STYLE below is a draft: the entries
   are seeded from cloth weight, which correlates with fit without deciding
   it. Replace it with the real mapping and nothing else on this page needs
   to change — that is why it is a table and not a rule.
   ========================================================================= */
const GENDERS = [
  {k:'U', n:'Unisex',  d:'One cut for the whole team'},
  {k:'W', n:'Women',   d:'Cut for a woman’s frame'},
  {k:'M', n:'Men',     d:'Cut for a man’s frame'},
  {k:'K', n:'Kids',    d:'Younger wearers'},
  {k:'B', n:'Baby',    d:'The smallest sizes'},
];
/* A product spans several garments now, so it does not HAVE one gender or one
   fit — it offers a set of them. These used to read a Stanley/Stella style code
   off the product (p.ss[3]), which no product carries any more: every gender
   test silently returned '' and every gender filter returned nothing. */
/* A unisex garment is cut to be worn by men and women alike, so asking for
   either returns it alongside the ones cut specifically for them. Kids and
   Baby are their own ranges and inherit nothing; asking for Unisex returns
   only unisex, because that is a specific thing to ask for. */
const GENDER_SERVES = {M:['M','U'], W:['W','U'], U:['U'], K:['K'], B:['B']};
const serves = (want, g) => !want || (GENDER_SERVES[want] || [want]).includes(g);
/* Configuring is not browsing. A unisex cut is a garment a woman can order,
   so it stays in the listings under Women — but the shoot photographs unisex
   cuts on a male model, and answering "Women" in the builder then offers her
   options illustrated by a man wearing the garment she is choosing. So the
   builder is stricter than the catalogue: Women offers the women's cuts, and
   the unisex ones keep their place under Unisex and Men, where the same
   photograph reads correctly. Every other audience is unchanged. */
const BUILDER_SERVES = {M:['M','U'], W:['W'], U:['U'], K:['K'], B:['B']};
const servesCut = (want, g) => !want || (BUILDER_SERVES[want] || [want]).includes(g);

const gendersOf = (p) => [...new Set((p.matrix || []).map(m => m.g).filter(Boolean))];
const fitsOf    = (p) => [...new Set((p.matrix || []).map(m => m.f).filter(Boolean))];
const hasGender = (p, k) => gendersOf(p).some(g => serves(k, g));
const hasFit    = (p, k) => fitsOf(p).includes(k);
const genderOf  = (p) => gendersOf(p)[0] || '';
const genderName = (k) => (GENDERS.find(g => g.k === k) || {}).n || 'Other';

/* The four names the trade and the high street both use. "Fitted" was ours,
   and it is the odd one out — every major retailer and size guide calls that
   cut "slim fit", which is also what people type into a search box. The other
   three are already the standard ladder, so they stand. */
const FITS = [
  {k:'fitted',  n:'Slim fit',    d:'Cut close through the chest and waist'},
  {k:'regular', n:'Regular fit', d:'The classic straight cut, room to move'},
  {k:'relaxed', n:'Relaxed fit', d:'Roomy through the body, easy shoulder'},
  {k:'heavy',   n:'Oversized',   d:'Boxy and long, deliberately loose'},
];
/* Draft. Replace with the supplier's published fit per style code. */
const FIT_BY_STYLE = {};
function fitOf(p){ return fitsOf(p)[0] || 'regular'; }
const fitName = (k) => (FITS.find(f => f.k === k) || {}).n || k;
const methodLabel = (k) => ((S.personalization || {})[k] || {}).name || k;
const posLabel = (k) => (S.positions_lib || {})[k] || k;

function buildState(){
  const b = UI.build = UI.build || {};
  b.cat = b.cat || 'T-shirts';
  return b;
}
/* Styles still standing after the answers given so far. `upTo` stops the
   filter early, which is how each step counts its own options against the
   answers above it rather than against its own. */
/* The weights a product is actually made in, which is a property of its
   garments and not of the product. `p.weight` is one representative number —
   a t-shirt carries it as 155 while the range runs 130 to 220 — so filtering
   products by it threw away almost everything: the weight step offered a
   single button and the style step after it had nothing left to show. */
const gWeights = (p) => [...new Set((p.matrix || []).map(m => +m.w).filter(Boolean))];
function buildPool(b, upTo){
  let list = S.merchProducts.filter(p => p.cat === b.cat && p.status !== 'archived');
  if(upTo > 0 && b.gender) list = list.filter(p => hasGender(p, b.gender));
  if(upTo > 1 && b.fit)    list = list.filter(p => hasFit(p, b.fit));
  if(upTo > 2 && b.weight) list = list.filter(p => gWeights(p).includes(+b.weight));
  if(upTo > 3 && b.style)  list = list.filter(p => p.id === b.style);
  return list;
}
const poolFrom = (list) => poolLow(list);

function buildStep(ix, label, help, open, chosen, body){
  return `
  <section class="bs ${open ? 'bs--open' : ''} ${chosen != null ? 'bs--done' : ''}">
    <div class="bs-h">
      <span class="bs-n">${String(ix).padStart(2, '0')}</span>
      <div class="bs-t">
        <h3 class="bs-l">${esc(label)}</h3>
        ${help ? `<p class="bs-d">${help}</p>` : ''}
      </div>
      ${chosen != null ? `<span class="bs-v">${esc(chosen)}</span>` : ''}
    </div>
    ${open ? `<div class="bs-b">${body}</div>` : ''}
  </section>`;
}

const buildChip = (on, act, val, title, meta, dim) => `
  <button class="bch ${on ? 'bch--on' : ''} ${dim ? 'bch--out' : ''}" data-act="${act}"
    data-v="${esc(val)}" aria-pressed="${on}"${dim ? ' disabled' : ''}>
    <span class="bch-t">${esc(title)}</span>
    ${meta ? `<span class="bch-m">${esc(meta)}</span>` : ''}</button>`;

function pubBuild(cat){
  const b = buildState();
  if(cat && cat !== b.cat){ b.cat = cat; b.gender = b.fit = b.weight = b.style = b.colour = b.method = null; }

  const step = b.gender ? (b.fit ? (b.weight ? (b.style ? 4 : 3) : 2) : 1) : 0;
  const pool = buildPool(b, 9);
  const from = poolFrom(pool);
  const chosen = b.style ? by(S.merchProducts, b.style) : null;

  /* 01 who wears it */
  const genderBody = GENDERS.map(g => {
    const list = buildPool({cat:b.cat}, 0).filter(p => hasGender(p, g.k));
    if(!list.length) return '';
    return buildChip(b.gender === g.k, 'bGender', g.k, g.n,
      list.length + ' style' + (list.length === 1 ? '' : 's'), false);
  }).join('');

  /* 02 fit */
  const fitBody = FITS.map(f => {
    const list = buildPool(b, 1).filter(p => hasFit(p, f.k));
    return buildChip(b.fit === f.k, 'bFit', f.k, f.n,
      list.length ? list.length + ' style' + (list.length === 1 ? '' : 's') : 'None here', !list.length);
  }).join('');

  /* 03 weight */
  const weights = [...new Set(buildPool(b, 2).flatMap(gWeights))].sort((a, b2) => a - b2);
  const weightBody = weights.map(w => {
    const list = buildPool(b, 2).filter(p => gWeights(p).includes(w));
    const lo = poolFrom(list);
    return buildChip(String(b.weight) === String(w), 'bWeight', String(w), w + ' g/m²',
      lo != null ? 'from ' + money(lo) : list.length + ' style' + (list.length === 1 ? '' : 's'), false);
  }).join('');

  /* 04 the styles still standing */
  const styles = buildPool(b, 3);
  const styleBody = `<div class="bgrid">${styles.map(p => `
    <button class="bst ${b.style === p.id ? 'bst--on' : ''}" data-act="bStyle" data-v="${p.id}">
      <span class="bst-m media">${prodImg(p) ? `<img src="${prodImg(p)}" alt="${esc(p.name)}" loading="lazy">` : ''}</span>
      <span class="bst-b">
        <span class="bst-t">${esc(p.name)}</span>
        <span class="bst-d">${esc(p.ref)} · ${p.colours.length} colour${p.colours.length === 1 ? '' : 's'}</span>
        <span class="bst-p">${(() => { const b = catFrom(p);
          return b ? 'From ' + money(b.price) : 'Price on request'; })()}</span>
      </span>
    </button>`).join('')}</div>`;

  /* 05 colour · 06 personalisation */
  const cols = chosen ? (chosen.colours || []).filter(c => COLOURS[c]) : [];
  const colourBody = `<div class="bsw">${cols.map(c => `
    <button class="bsw-i ${b.colour === c ? 'bsw-i--on' : ''}" data-act="bColour" data-v="${c}"
      title="${esc(COLOURS[c].name || c)}" aria-label="${esc(COLOURS[c].name || c)}"
      aria-pressed="${b.colour === c}"><i style="background:${COLOURS[c].hex}"></i></button>`).join('')}</div>
    ${b.colour && COLOURS[b.colour] ? `<p class="bs-note">${esc(COLOURS[b.colour].name || b.colour)}</p>` : ''}`;

  const methods = chosen ? (chosen.pers || []) : [];
  const persBody = `<div class="bchs">${methods.map(m => buildChip(b.method === m, 'bMethod', m,
    methodLabel(m), '', false)).join('')}</div>
    ${chosen && chosen.pos && chosen.pos.length ? `<p class="bs-note">Placements on this style: ${
      chosen.pos.map(x => esc(posLabel(x))).join(' · ')}</p>` : ''}`;

  const priceLine = chosen
    ? (chosen.quoteOnly ? 'Price on request' : money(chosen.from) + ' <span>per piece from ' + chosen.moq + '</span>')
    : (from != null ? money(from) + ' <span>lowest of what is left</span>' : '—');

  return pubShell(`
  ${mPageHead({crumb: crumb([['Merchandise','merch'],['Collections','collections']], b.cat),
    label:'Build your ' + catOne(b.cat),
    title:'Answer four things and the catalogue narrows to one.',
    lede:'Who wears it, how it fits, how heavy the cloth is. The price follows every answer, because every answer removes styles.',
    red:true})}

  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="bwrap">
        <div class="bsteps">
          ${buildStep(1, 'Who wears it', 'The segment the style is cut for.', step === 0 || !b.gender,
            b.gender ? genderName(b.gender) : null, `<div class="bchs">${genderBody}</div>`)}
          ${buildStep(2, 'Fit', 'How close the cut sits to the body.', !!b.gender && !b.fit,
            b.fit ? fitName(b.fit) : null, `<div class="bchs">${fitBody}</div>
              <p class="bs-note bs-note--draft">Fit is not in this catalogue export. These groupings are seeded
                from cloth weight until the supplier’s published fit is mapped in.</p>`)}
          ${buildStep(3, 'Weight', 'Grams per square metre. Heavier wears longer and prints differently.',
            !!b.fit && !b.weight, b.weight ? b.weight + ' g/m²' : null, `<div class="bchs">${weightBody}</div>`)}
          ${buildStep(4, chosen ? 'The style' : 'Choose the style',
            chosen ? 'Chosen from ' + styles.length + ' that matched.'
                   : styles.length ? styles.length + ' left after your answers.'
                   : 'Nothing matches — change an answer above.',
            !!b.weight && !b.style, chosen ? chosen.name : null, styleBody)}
          ${buildStep(5, 'Colour', 'Every colour this style is made in.', !!b.style && !b.colour,
            b.colour && COLOURS[b.colour] ? (COLOURS[b.colour].name || b.colour) : null, colourBody)}
          ${buildStep(6, 'Personalisation', 'The methods this style carries.', !!b.colour,
            b.method ? methodLabel(b.method) : null, persBody)}
        </div>

        <aside class="brail">
          <div class="brail-in">
            <span class="eyebrow eyebrow-red">Where you are</span>
            <div class="brail-p">${priceLine}</div>
            <div class="brail-c">${pool.length} style${pool.length === 1 ? '' : 's'} of ${
              buildPool({cat:b.cat}, 0).length} still match</div>
            <dl class="brail-l">
              ${[['Who wears it', b.gender ? genderName(b.gender) : null],
                 ['Fit', b.fit ? fitName(b.fit) : null],
                 ['Weight', b.weight ? b.weight + ' g/m²' : null],
                 ['Style', chosen ? chosen.name : null],
                 ['Colour', b.colour && COLOURS[b.colour] ? (COLOURS[b.colour].name || b.colour) : null],
                 ['Personalisation', b.method ? methodLabel(b.method) : null]]
                .map(([k, v]) => `<div class="brail-r ${v ? 'is-set' : ''}">
                  <dt>${k}</dt><dd>${v ? esc(v) : '—'}</dd></div>`).join('')}
            </dl>
            <div class="btn-row brail-a">
              <button class="btn btn--primary btn--arrow" data-act="bConfigure"
                ${chosen ? '' : 'disabled'}>Configure this one<i class="btn-a" aria-hidden="true">&#8594;</i></button>
              <button class="btn btn--quiet btn--sm" data-act="bReset">Start again</button>
            </div>
            <p class="t-xs muted">Nothing is ordered and nothing is charged. A request starts a review.</p>
          </div>
        </aside>
      </div>
    </div>
  </section>
  `, 'build');
}

function pubMerch(){
  return pubShell(`
  ${merchHero()}
  ${merchFigures()}

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secHead('01', 'Collections', 'Start with the kind of branded clothing you need.',
        `${nWordCap(catsInUse().length)} ${catsInUse().length === 1 ? 'family' : 'families'}, each one checked the same way. Open one to compare products, minimums and the personalisation each garment carries.`,
        {merch:true})}
      ${collectionsRail()}
    </div>
  </section>

  ${merchStrip(null, 'merch-landing')}

  ${offerHome('merch')}

  ${merchHow('02')}

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secHead('03', 'What we check', 'Listed only when we can describe it properly.',
        'A product reaches this catalogue once we can state what it is made of, what it weighs and what it will carry.',
        {merch:true, left:true})}
      <div class="split split--wide chk-s">
        <div class="split-b">
          ${(() => {
            /* A page about garments that shows no garment is the emptiest kind
               of empty. There are studio photographs of nearly every colour of
               everything in the catalogue; this slot sat waiting for one. The
               placeholder stays as the fallback, so a catalogue without
               photography still renders. */
            const shot = (() => {
              const pick = S.merchProducts.find(x => x.id === 'm_zip_sweatshirts')
                        || S.merchProducts.find(x => (x.matrix || []).length);
              const got = pick && productCardShot(pick, 'studio-01');
              return got ? {src:got.src, name:pick.name,
                            colour:(COLOURS[got.colour] || {}).name || ''} : null;
            })();
            return `<figure class="fig chk-fig">
            ${shot ? `<div class="media media--4x5">
                <img src="${shot.src}" alt="${esc(shot.name)}${shot.colour ? ' in ' + esc(shot.colour) : ''}" loading="lazy">
              </div>`
            : `<div class="media media--4x5 chk-ph" role="img"
                 aria-label="Placeholder for a photograph of a checked product">
              <div class="chk-ph-in">
                ${mark('mk--ph')}
                <span class="chk-ph-t">Product photograph</span>
                <span class="chk-ph-s">Placeholder — to be supplied</span>
              </div>
            </div>`}
            <figcaption class="cap"><b>What we check</b><span>${
              shot ? esc(shot.name) + (shot.colour ? ' · ' + esc(shot.colour) : '') : 'The record behind one product'}</span></figcaption>
          </figure>`; })()}
        </div>
        <div class="split-b chk-b">
          <div class="eyebrow eyebrow-red">Checked on every product</div>
          <ul class="ticks">
            ${['Fabric weight in g/m², because weight changes how a print reads',
               'Composition and construction, so a method can be matched to the surface',
               'The decoration methods and placements the garment actually supports',
               'Colour and size range held against the supplier record, not a marketing page',
               'Mill and country of manufacture where the supplier documents it']
              .map(x => `<li>${x}</li>`).join('')}
          </ul>
          <div class="chk-cert">
            <div class="eyebrow eyebrow-red">Certification</div>
            <p class="chk-p">Our suppliers hold recognised textile and social certifications, but they apply to
              specific products and production runs — not to everything we sell. A badge appears on a product
              only once the certificate is on file for that product.</p>
            <div class="certs certs--mark">
              ${[['organic','Organic content'],['recycled','Recycled content'],
                 ['chemical','Chemical safety'],['social','Social compliance']]
                .map(([k, x]) => `<div class="cert">${certMark(k)}
                  <span class="cert-t"><span class="cert-n">${x}</span>
                  <span class="cert-s">Confirmed per product</span></span></div>`).join('')}
            </div>
            <p class="t-xs muted chk-f">Ask which certifications apply to the products in your request and we
              will send the certificates that cover them.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  ${faqSection('merch', '04')}

  <section class="pub-sec pub-sec--dark">
    <div class="pub-wrap">
      <div class="ask">
        ${mark('mk--ask')}
        <span class="tag tag--dark"><i>05</i>Start a request</span>
        <h2 class="display ask-t">Tell us what you need personalised.</h2>
        <p class="lede ask-d">Configure what you want, send it, and we come back with a reviewed quote.
          Nothing is ordered and nothing is charged until you approve it.</p>
        <div class="btn-row ask-btns">
          ${ctaBtn('products', 'Browse all products')}
          ${ctaBtn('merchhelp', 'Get help choosing', 'ghost')}
        </div>
        <p class="t-xs ask-sup">No payment at request. A proof where one is required, before anything is set up.</p>
      </div>
    </div>
  </section>
  `, 'merch');
}

/* ---- the listing pages -------------------------------------------------- */
function pubProducts(){
  const all = S.merchProducts, list = applyFilters(all);
  return pubShell(`
  ${mPageHead({crumb: crumb([['Merchandise','merch']], 'All products'), label:'All products',
    title:'Branded apparel, everything you can personalise.',
    lede:'Custom clothing for company merchandise, compared by what decides it: cloth weight, the personalisation a garment carries and the bracket its price starts at. Every one of them can be ordered from a single piece.'})}
  <section class="pub-sec pub-sec--flush">
    <div class="pub-wrap">
      ${filterBar('all')}
      ${listBody(list, all.length, 'No products match these filters.')}
    </div>
  </section>
  ${merchStrip(null, 'all-products')}
  ${garmentBrowser(null)}
  ${faqSection('merch', '—')}
  ${seoBlock('all')}
  `, 'products');
}

/* Families with enough styles to be worth narrowing get the journey; the
   rest are a short list you can simply read. */
const BUILDABLE = (cat) => S.merchProducts.filter(p => p.cat === cat).length >= 8;

/* The grouped grid answers "what kind of thing", and the configurator answers
   "which one" — but a buyer who already knows they want a 180 gsm unisex tee
   has nowhere to look. This lists every garment in the collection flat, the
   way a normal catalogue does, and each row opens the product page already
   set to that garment. It is the same sixty-five garments either way; only the
   route in differs. */
/* ---- the flat catalogue -------------------------------------------------
   The grid above groups garments under the product that configures them. This
   is the same catalogue laid out one card per garment, for the buyer who
   already knows the weight or the cut they want and would rather find it than
   build it.

   A hundred and seventy near-identical rows invite nobody, so it opens on a
   search field and on the three questions that actually tell two garments
   apart. Every card carries the colours that garment comes in: with no
   photography yet, the colour range is the one honest visual the data has,
   and it happens to be the thing buyers choose on. */
const GB_STEP = 24;
const GB_SORTS = [['plh','Price, low to high'], ['phl','Price, high to low'],
                  ['wlh','Cloth, light to heavy'], ['whl','Cloth, heavy to light'],
                  ['name','Name, A to Z']];

/* One browser per list: opening a different collection starts it clean rather
   than carrying the last one's search across. */
function gbState(key){
  const g = UI.gb;
  if(g && g.key === key) return g;
  return UI.gb = {key, q:'', seg:[], fit:[], wt:'', sort:'plh', shown:GB_STEP, pick:''};
}
function gbRows(cat){
  const pool = cat ? catList(cat) : (S.merchProducts || []);
  const rows = [];
  pool.forEach(p => (p.matrix || []).forEach(m => rows.push([p, m])));
  return rows;
}
/* everything a search could reasonably mean by this garment — including the
   colour names, because "navy" is a real way to look for one */
function gbHay(p, m){
  return [styleLabel(m.style2), p.name, catName(p.cat), genderName(m.g), fitName(m.f),
    m.w ? m.w + ' gsm' : '', m.ref || '', p.ref || '',
    ...(m.colours || []).map(c => (COLOURS[c] || {}).name || '')]
    .join(' ').toLowerCase();
}
/* `skip` leaves one question out, so a pill can count what it WOULD return
   instead of what is already on screen */
function gbPass(p, m, g, skip){
  if(g.terms.length && skip !== 'q'){
    const hay = gbHay(p, m);
    if(!g.terms.every(t => hay.indexOf(t) > -1)) return false;
  }
  if(skip !== 'seg' && g.seg.length && !g.seg.some(w => serves(w, m.g))) return false;
  if(skip !== 'fit' && g.fit.length && !g.fit.includes(m.f)) return false;
  if(skip !== 'wt'  && g.wt && WT_BAND(m.w) !== g.wt) return false;
  return true;
}
/* a garment with no price sorts last whichever way the list is pointing */
const gbCmp = (get, desc) => (a, b) => {
  const x = get(a), y = get(b);
  if(x == null && y == null) return 0;
  if(x == null) return 1;
  if(y == null) return -1;
  return desc ? y - x : x - y;
};
function gbOrder(rows, how){
  const pr = (r) => { const b = gLow(r[1]); return b ? b.price : null; };
  const wt = (r) => +r[1].w || null;
  const by = {
    plh: gbCmp(pr, false), phl: gbCmp(pr, true),
    wlh: gbCmp(wt, false), whl: gbCmp(wt, true),
    name:(a, b) => gbTitle(a[0], a[1]).localeCompare(gbTitle(b[0], b[1])),
  }[how] || gbCmp(pr, false);
  return rows.slice().sort(by);
}

/* the same basis the product cards use, for one garment */
function gLow(m){
  let best = null;
  (m.breaks || []).forEach(b => { if(b.price != null && (!best || b.price < best.price))
    best = {price:b.price, qty:b.qty}; });
  return best;
}

/* Who it is for, what it is, how it fits, how heavy — in that order. Naming
   the garment's own style rather than the product family is what makes these
   titles identify a garment: across the 174, the family name repeats 23 times
   and the style only twice. Any part the sheet leaves blank is simply absent,
   so an accessory with no fit does not carry an empty slot. */
function gbTitle(p, m){
  return [m.g ? genderName(m.g) : '',
          styleLabel(m.style2) || p.name,
          m.f ? fitName(m.f) : '',
          m.w ? m.w + ' g/m²' : ''].filter(Boolean).join(' · ');
}

/* ---- what a garment is made of -------------------------------------------
   The supplier records it as "Shell: {fabric}, {composition}, {finish}", which
   is regular enough to read: the first segment is the cloth, the last is the
   treatment when it names one. This is the one thing the weight and the bar
   cannot tell you — two garments at 180 g/m² feel entirely different in single
   jersey and in brushed french terry — so it is stated the same way on every
   garment, everywhere one is shown. */
function garmentCloth(m){
  const t = (m && m.materials || '').trim();
  if(!t) return {fabric:null, finish:null};
  const seg = t.replace(/^Shell:\s*/i, '').split(',').map(x => x.trim()).filter(Boolean);
  const last = seg[seg.length - 1] || '';
  return {
    fabric: seg[0] ? styleLabel(seg[0]) : null,
    finish: /wash|dyed|brush|handfeel|peach/i.test(last) ? styleLabel(last) : null,
  };
}
/* The cloth as words for a line that carries other facts too. A word the
   style name already says is dropped: "Garment dyed mid-light t-shirt ·
   Garment dyed" tells you the same thing twice and reads like a mistake. */
const clothWords = (m, styleName) => {
  const c = garmentCloth(m);
  const said = String(styleName || (m && m.style2) || '').toLowerCase();
  return [c.fabric, c.finish].filter(Boolean)
    .filter(w => said.indexOf(w.toLowerCase()) < 0);
};

/* ---- naming a garment inside its own product ------------------------------
   On a page headed "Custom T-Shirt" every option is a t-shirt, so the noun is
   noise: what separates them is the cut. The product's own name supplies the
   noun to strip, and a trailing "in <fabric>" goes too because the composition
   is stated in its own field now. */
function cutName(p, m){
  let t = styleLabel(m.style2) || '';
  if(!t) return '';
  const bare = String(p.name || '').replace(/^custom\s+/i, '').toLowerCase();
  /* longest first: "crewneck sweatshirt" before "sweatshirt" */
  const nouns = [bare, ...bare.split(/\s+/)].filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for(const n of nouns){
    const i = t.toLowerCase().indexOf(n);
    if(i > -1){ t = (t.slice(0, i) + ' ' + t.slice(i + n.length)); break; }
  }
  t = t.replace(/\s+/g, ' ')
       .replace(/\s+in\s+.*$/i, '')     /* "…in recycled cotton" — now its own field */
       .replace(/^\s*in\s+/i, '')
       .trim();
  /* The sheet calls a hoodie a "hoodie sweatshirt", so stripping the product's
     own noun can leave its synonym stranded: "Side pocket sweatshirt". One
     more pass takes a trailing generic noun, but never the last word. */
  const TAIL = /\s+(sweatshirt|t-shirt|tee|shirt|jacket|top|hoodie)$/i;
  while(TAIL.test(t) && t.replace(TAIL, '').trim()) t = t.replace(TAIL, '').trim();
  t = t.replace(/[\s,·-]+$/, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---- how heavy it feels, in words ----------------------------------------
   A gram per square metre means nothing to someone buying twenty shirts for a
   café. Three bands, judged against the product's OWN range, because 280 g/m²
   is heavy for a t-shirt and light for a hoodie — and because the padded
   garments record fill weight, which any absolute ruler would misread. */
const WEIGHT_WORDS = ['Lightweight', 'Mid-weight', 'Heavyweight'];
function weightWord(p, m){
  const w = +m.w; if(!w) return '';
  const ws = [...new Set((p.matrix || []).map(x => +x.w).filter(Boolean))].sort((a, b) => a - b);
  if(ws.length < 2) return '';                 /* one weight is not a scale */
  /* By RANK, not by value: the sweatshirts run 280 to 500, and interpolating
     put 350 only a quarter of the way up, so every one of them came out
     "Lightweight". Thirds of the list cannot be skewed by one heavy outlier. */
  const i = ws.indexOf(w);
  if(i < 0) return '';
  const t = ws.length === 1 ? 0 : i / (ws.length - 1);
  return WEIGHT_WORDS[t < 1/3 ? 0 : t <= 2/3 ? 1 : 2];
}

/* ---- the small print, in plain words --------------------------------------
   Someone ordering twenty shirts for a café does not know what 180 g/m² feels
   like, or what a cotton-polyester blend does differently. Two short lines,
   behind a question mark so they cost nothing to the reader who already knows.
   The weight line is relative to this product, like the bar and the words
   above it, so it is never claiming an absolute scale it cannot hold. */
const WEIGHT_NOTE = {
  'Lightweight': 'The thinnest cloth in this range — light to wear, and a little see-through in pale colours.',
  'Mid-weight':  'The middle of this range — everyday thickness that holds its shape.',
  'Heavyweight': 'The thickest here — warmer, more structured, and it hangs straighter.',
};
/* Said plainly rather than relatively when the option's own name already
   claims a weight: a card headed "Heavyweight" cannot open a note calling it
   the middle of the range, even though our scale — read against this product's
   whole span — puts it there. The name is what the reader just read. */
const WEIGHT_PLAIN = {
  'Lightweight': 'Thinner, lighter cloth — easy to wear and a little see-through in pale colours.',
  'Mid-weight':  'Everyday thickness: substantial enough to hold its shape, not heavy.',
  'Heavyweight': 'Thick, warm cloth that holds its shape and hangs straight.',
};
function weightNote(p, m, name){
  const claimed = /heavy/i.test(name || '') ? 'Heavyweight'
                : /mid/i.test(name || '')   ? 'Mid-weight'
                : /light/i.test(name || '') ? 'Lightweight' : null;
  if(claimed) return WEIGHT_PLAIN[claimed] + (m.w ? ' ' + m.w + ' g/m².' : '');
  const w = weightWord(p, m);
  if(w && WEIGHT_NOTE[w]) return WEIGHT_NOTE[w];
  return m.w ? 'Cloth weight is ' + m.w + ' grams per square metre.' : '';
}
/* What the fibres actually do. One sentence: organic and recycled qualify the
   noun rather than earning sentences of their own, so the whole note stays at
   two lines — the weight, then this. */
function compNote(m){
  const c = (compOf(m) || '').toLowerCase();
  if(!c) return '';
  const cotton = /cotton/.test(c), poly = /polyester/.test(c), nyl = /nylon/.test(c);
  const mod = /modal|tencel/.test(c), el = /elastane/.test(c);
  const org = /organic/.test(c), rec = /recycled/.test(c);
  const noun = org && rec ? 'Organic and recycled cotton'
             : org ? 'Organic cotton'
             : rec ? (cotton ? 'Part-recycled cotton' : 'Recycled fibre')
             : cotton ? 'Cotton' : 'Synthetic fibre';
  if(mod)                    return noun + ' with modal, which gives it a softer, silkier drape.';
  if(cotton && (poly || nyl))return noun + ' blended with a synthetic: holds its shape, creases less and dries faster than all cotton.';
  if(el)                     return noun + ' with a little elastane, so it stretches and springs back.';
  if(cotton)                 return noun + ' throughout: breathable and soft on the skin, and it creases more readily than a blend.';
  return noun + ': light, hard-wearing and quick to dry.';
}

/* ---- naming an option so a stranger can choose --------------------------
   Every option in a list gets the plainest name that is still its own. Names
   are resolved for the WHOLE list at once: a name is only lengthened when two
   options would otherwise read the same, and then only the tied ones grow.
   Resolving them one at a time is what produced two "Classic" in the same
   list, and then two bare "180 g/m²" when I tried to break the tie. */
const CUT_FOR = {U:'Unisex cut', W:"Women's cut", M:"Men's cut",
                 K:"Kids' cut", B:'Baby cut'};
function nameOptions(p, opts){
  /* Because a unisex garment serves men and women, a list can hold both the
     unisex block and the women's block of the same shirt. Which block it is
     cut on is the most useful thing to say about them, so it comes first. */
  const mixedGender = new Set((opts || []).map(x => x.g).filter(Boolean)).size > 1;
  const partsOf = (m) => {
    const cut  = cutName(p, m);
    const word = weightWord(p, m);
    const fin  = garmentCloth(m).finish;
    const rec  = /recycled/i.test(compOf(m) || '');
    const head = cut || word || 'Classic';
    return [head,
      (mixedGender && CUT_FOR[m.g]) ? CUT_FOR[m.g] : null,
      (cut && word && head.toLowerCase().indexOf(word.toLowerCase()) < 0) ? word : null,
      /* a distinctive treatment first, then a plain wash — excluding washes
         entirely left two crewnecks identical when the wash was the only
         thing between them */
      (fin && !/wash/i.test(fin)) ? fin : null,
      rec ? 'Recycled' : null,
      (fin && /wash/i.test(fin)) ? fin : null,
      m.w ? m.w + ' g/m²' : null,
    ];   /* slots are POSITIONAL: an empty one means this option has nothing to
            add at that step, not that the next qualifier moves up. Collapsing
            them made a plain garment grow a "· 280 g/m²" it never needed. */
  };
  const build = (m, depth) => {
    const ps = partsOf(m);
    const tail = ps.slice(1, 1 + depth).filter(Boolean);
    return tail.length ? [ps[0], ...tail].join(' · ') : ps[0];
  };
  const out = new Map(), used = new Set();
  let pending = opts.slice(), depth = 0;
  while(pending.length && depth <= 6){
    const byName = {};
    pending.forEach(m => { const n = build(m, depth); (byName[n] = byName[n] || []).push(m); });
    const next = [];
    Object.entries(byName).forEach(([n, group]) => {
      /* unique here AND not already spoken for by a shorter name */
      if(group.length === 1 && !used.has(n)){ out.set(group[0].sku, n); used.add(n); }
      else next.push(...group);
    });
    if(next.length === pending.length && depth >= 6) break;   /* no progress left */
    pending = next; depth++;
  }
  /* still tied on every fact we hold: number them rather than repeat a name */
  pending.forEach((m, i) => out.set(m.sku, build(m, 6) + ' (' + (i + 1) + ')'));
  return out;
}
/* resolved per list, so the same garment can read plainly in a short list and
   more fully in a crowded one */
let NAME_CACHE = {key:null, map:null};
function optionName(p, m, opts){
  const key = p.id + '|' + (opts || []).map(x => x.sku).join(',');
  if(NAME_CACHE.key !== key) NAME_CACHE = {key, map:nameOptions(p, opts || [m])};
  return NAME_CACHE.map.get(m.sku) || cutName(p, m) || weightWord(p, m) || 'Classic';
}

/* ---- what it is made of --------------------------------------------------
   "Shell: {fabric}, {n% fibre - treatment}, {finish}" — the percentage parts
   are the composition. Two halves of the same fibre read as one statement
   ("50/50 organic + recycled cotton") rather than as two. */
function compOf(m){
  const t = (m && m.materials) || '';
  const parts = t.replace(/^Shell:\s*/i, '').split(',')
    .map(x => x.trim()).filter(x => /%/.test(x));
  if(!parts.length) return null;
  const bits = parts.map(x => ({
    pct: +(x.match(/(\d+)\s*%/) || [])[1],
    fib: ((x.match(/%\s*([A-Za-z\- ]+?)(?:\s*-|$)/) || [])[1] || '').trim().toLowerCase(),
    org: /organic/i.test(x), rec: /recycled/i.test(x),
  })).filter(b => b.pct);
  if(!bits.length) return null;
  if(bits.length === 1){
    const b = bits[0];
    return (b.pct + '% ' + (b.org ? 'organic ' : '') + (b.rec ? 'recycled ' : '') + b.fib)
      .replace(/\s+/g, ' ').trim();
  }
  if(bits.every(b => b.fib === bits[0].fib)){
    const tags = [...new Set(bits.map(b => b.org ? 'organic' : b.rec ? 'recycled' : '')
      .filter(Boolean))];
    return (bits.map(b => b.pct + '%').join('/') + ' ' + tags.join(' + ') + ' ' + bits[0].fib)
      .replace(/\s+/g, ' ').trim();
  }
  return bits.map(b => b.pct + '% ' + b.fib).join(' / ');
}

/* ---- the line ------------------------------------------------------------
   A commercial position, not a property of the cloth, so it belongs in the
   sheet: a `line` value on the garment wins outright. Until the sheet carries
   one this is derived from where the garment sits on price within its own
   product — which is what the label means to a buyer, and is at least never
   in contradiction with the price printed beside it. */
const LINES = ['Essential', 'Mid tier', 'Premium'];
function lineOf(p, m){
  if(m.line && LINES.indexOf(m.line) > -1) return m.line;
  const low = (x) => { const b = x.breaks || []; return b.length ? b[b.length - 1].price : null; };
  const ranked = (p.matrix || []).map(x => ({sku:x.sku, v:low(x)}))
    .filter(x => x.v != null).sort((a, b) => a.v - b.v);
  if(ranked.length < 3) return null;          /* too few to rank meaningfully */
  const i = ranked.findIndex(x => x.sku === m.sku);
  if(i < 0) return null;
  const t = i / ranked.length;
  return t < 1/3 ? LINES[0] : t < 2/3 ? LINES[1] : LINES[2];
}

function gbCard(p, m){
  const cols = (m.colours || []).filter(c => COLOURS[c]);
  const title = gbTitle(p, m);
  const lo = gLow(m);
  return `
  <button class="gb-c" data-go="public:product:${p.id}:${esc(m.sku)}"
    aria-label="${esc(title + ' — ' + p.name)}">
    <span class="gb-b">
      <span class="gb-t">${esc(title)}</span>
      <span class="gb-m">${esc([p.name, compOf(m), lineOf(p, m)]
        .filter(Boolean).join(' · '))}</span>
      <span class="gb-f">
        <span class="gb-pr">${lo
          ? `<em>From</em>${money(lo.price)}`
          : '<em class="gb-req">Price on request</em>'}</span>
        ${cols.length ? `<span class="gb-n">${cols.length} colour${cols.length === 1 ? '' : 's'}</span>` : ''}
      </span>
    </span>
  </button>`;
}

/* Every garment in the catalogue at once is 174 cards, which is a warehouse,
   not a shop. On the all-products page the section opens by asking which kind
   of thing you are after, and only then lists it. A collection page has
   already been asked, so it skips straight to the garments. */
function gbChooser(rows){
  const cats = catsInUse().map(c => {
    const mine = rows.filter(([p]) => p.cat === c);
    const cols = [];
    mine.forEach(([, m]) => (m.colours || []).forEach(x => {
      if(COLOURS[x] && cols.indexOf(x) < 0) cols.push(x); }));
    const lo = mine.map(([, m]) => { const b = gLow(m); return b ? b.price : null; })
      .filter(v => v != null);
    return {c, n:mine.length, cols:orderPick(cols, 12), from:lo.length ? Math.min(...lo) : null};
  }).filter(x => x.n);
  return `
  <div class="gbp">${cats.map(x => `
    <button class="gbp-c" data-act="gbPick" data-v="${esc(x.c)}">
      <span class="gbp-sw">${x.cols.map(k =>
        `<i style="background:${COLOURS[k].hex}"></i>`).join('')}</span>
      <span class="gbp-b">
        <span class="gbp-t">${esc(catName(x.c))}</span>
        <span class="gbp-m">${x.n} garment${x.n === 1 ? '' : 's'}${
          x.from != null ? ' · from ' + money(x.from) : ''}</span>
      </span>
      <span class="gbp-a" aria-hidden="true">&#8594;</span>
    </button>`).join('')}</div>`;
}
/* the palette is already sorted most-popular-first, so take from the front */
const orderPick = (keys, n) => keys.slice(0, n);

function garmentBrowser(cat){
  const all = gbRows(cat);
  /* one or two cards beside the product they came from is the same thing twice */
  if(all.length < 4) return '';
  const g = gbState(cat || 'all');
  /* a collection page is already a type; the all-products page asks first */
  const pick = cat || g.pick;
  const rows = pick ? all.filter(([p]) => p.cat === pick) : all;
  g.terms = g.q.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const hit   = gbOrder(rows.filter(([p, m]) => gbPass(p, m, g, null)), g.sort);
  const shown = Math.min(g.shown || GB_STEP, hit.length);
  const rest  = hit.length - shown;
  const live  = !!(g.q.trim() || g.seg.length || g.fit.length || g.wt);

  const count = (skip, test) => rows.filter(([p, m]) => gbPass(p, m, g, skip) && test(m)).length;
  const pill = (on, act, v, label, n) => n
    ? `<button class="fp fp--sm ${on ? 'fp--on' : ''}" data-act="${act}" data-v="${esc(v)}"
        aria-pressed="${on}">${esc(label)}<em>${n}</em></button>` : '';
  const grp = (label, body) => body ? `<span class="gb-grp">
    <span class="gb-gl">${label}</span>${body}</span>` : '';

  const segs = GENDERS.map(x => pill(g.seg.includes(x.k), 'gbSeg', x.k, genderName(x.k),
                 count('seg', m => serves(x.k, m.g)))).join('');
  const fits = FITS.map(x => pill(g.fit.includes(x.k), 'gbFit', x.k, fitName(x.k),
                 count('fit', m => m.f === x.k))).join('');
  const wts  = [['light','Light'], ['mid','Mid weight'], ['heavy','Heavy']]
                 .map(([v, nm]) => pill(g.wt === v, 'gbWt', v, nm,
                   count('wt', m => WT_BAND(m.w) === v))).join('');

  /* a category name is already plural, the generic noun is not */
  const what = pick ? catName(pick).toLowerCase() : 'garments';
  const lede = pick
    ? `All ${rows.length} ${catName(pick).toLowerCase()} we make, listed one by one.`
    : `${all.length} garments in the catalogue. Choose what you are after.`;
  const body = pick
    ? `Search the ${rows.length} of them here, or filter down to the cut and cloth you need —
       opening any one takes you to the product page with that garment already chosen.`
    : `The grid above groups these by what they configure. Pick a kind of garment and every one
       we make of it is listed here — searchable, filterable, and each one opening the product
       page with that garment already chosen.`;

  return `
  <section class="pub-sec pub-sec--tight surface-2" id="every">
    <div class="pub-wrap">
      ${secHead('', 'Every garment', lede, body, {merch:true, left:true})}

      ${!pick ? gbChooser(all) : `
      <div class="gb">
        ${!cat ? `<div class="gb-back">
          <button class="btn btn--quiet btn--sm" data-act="gbUnpick">&#8592; All types</button>
          <span class="gb-scope">${esc(catName(pick))}</span>
        </div>` : ''}
        <div class="gb-bar">
          <span class="gb-search">
            <span class="gb-i" aria-hidden="true">${SEARCH_GLYPH}</span>
            <input id="gbq" class="gb-q" type="search" data-act="gbQ" value="${esc(g.q)}"
              autocomplete="off" spellcheck="false"
              aria-label="Search ${rows.length} garments"
              placeholder="Search ${rows.length} ${what} — style, cut, weight or colour">
            ${g.q ? `<button class="gb-x" data-act="gbQClr" aria-label="Clear the search">&#215;</button>` : ''}
          </span>
          <label class="fsort gb-sort"><span class="vh">Sort garments</span>
            <select class="fsel" data-act="gbSort">
              ${GB_SORTS.map(([v, n]) => `<option value="${v}"${
                g.sort === v ? ' selected' : ''}>${n}</option>`).join('')}
            </select></label>
        </div>

        <div class="gb-pills">${grp('Who', segs)}${grp('Fit', fits)}${grp('Cloth', wts)}</div>

        <div class="gb-head">
          <span class="gb-c-n">${live
            ? `${hit.length} of ${rows.length} ${rows.length === 1 ? 'garment' : 'garments'}`
            : `${rows.length} ${rows.length === 1 ? 'garment' : 'garments'}`}</span>
          ${live ? `<button class="btn btn--quiet btn--sm" data-act="gbClr">Clear</button>` : ''}
        </div>

        ${hit.length ? `<div class="gb-g">${hit.slice(0, shown).map(([p, m]) => gbCard(p, m)).join('')}</div>
        <div class="more">
          <div class="more-l"><span class="t-sm muted num">Showing ${shown} of ${hit.length}</span>
            <span class="t-xs muted">Per piece at the largest quantity break, garment only.
              Personalisation is quoted separately. Excludes VAT.</span></div>
          ${rest > 0 ? `<button class="btn btn--ghost btn--arrow" data-act="gbMore">Load ${
            Math.min(rest, GB_STEP)} more<i class="btn-a" aria-hidden="true">&#8595;</i></button>`
            : `<span class="t-sm muted">End of the list</span>`}
        </div>`
        : `<div class="empty-p">
            <h3 class="t-h4">Nothing matches that.</h3>
            <p class="t-sm muted">Try a shorter search, or clear a filter — there are
              ${rows.length} ${what} in here.</p>
            <div class="btn-row btn-row--top">
              <button class="btn btn--ghost btn--sm" data-act="gbClr">Clear the search</button>
              <button class="btn btn--quiet btn--sm" data-go="public:merchhelp">Get help choosing</button>
            </div>
          </div>`}
      </div>`}
    </div>
  </section>`;
}

/* Products group garments; they do not replace them. A family with one product
   used to open onto a single lonely card, which said nothing about the ten
   garments underneath it. So the family leads with a rail of the products that
   configure it — compact, because there may only be one — and the body of the
   page is the full catalogue for that type. */
/* ---- the colour of the range, edge to edge -------------------------------
   Every photograph on this site was living inside a bordered card on a flat
   ground, which is a lot of photography to own and never let breathe. A strip
   runs them full width with no cards, no gaps and no captions on them: the
   garments' own studio backdrops butt together into one continuous band, and
   the colour of the range — which is the thing being sold — finally lands as
   colour rather than as twelve small swatches. §16.1 */
/* Stable but different per place. A random pick would reshuffle on every
   render — the strip would twitch every time anything on the page changed —
   so the starting point is derived from where the strip is instead. Same page,
   same six; different page, different six. */
const stripSeed = (key) => {
  let h = 0;
  for(const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
};

function stripShots(limit, cat, seed){
  const out = [], seen = {};
  const pool = cat ? catList(cat) : S.merchProducts;
  if(!pool.length) return out;
  const picks = cardPicks();
  /* Not just a different starting point — a different route. Stepping by a
     stride that shares no factor with the length visits every product exactly
     once in a genuinely different order, so two pages cannot converge on the
     same six the way a plain offset did. */
  const h = stripSeed(seed), len = pool.length;
  const start = h % len;
  let stride = 1 + (stripSeed(seed + '/s') % Math.max(1, len - 1));
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  while(len > 1 && gcd(stride, len) !== 1) stride = (stride % (len - 1)) + 1;
  const order = pool.map((_, n) => pool[(start + n * stride) % len]);
  /* a spread of garments AND of colours: two navy tees in a row is not a range */
  for(const pass of [0, 1]){
    for(const p of order){
      if(out.length >= limit) break;
      const pk = picks[p.id]; if(!pk) continue;
      const nm = (COLOURS[pk.colour] || {}).name || '';
      if(!pass && seen[nm]) continue;          /* first pass: unseen colours only */
      if(out.some(o => o.id === p.id)) continue;
      /* On-model only. Passing exact means garmentPhoto will not fall back to
         the packshot pack — and it must not: a garment cut out on white next
         to two people on a warm backdrop breaks the band the strip exists to
         make. A product with no studio shot simply sits this one out. */
      const src = garmentPhoto(pk.sku, pk.colour, 'studio-01', true);
      if(!src) continue;
      seen[nm] = 1;
      out.push({id:p.id, src, name:p.name, colour:nm});
    }
    if(out.length >= limit) break;
  }

  /* A family of one or two products still has a range — it is a range of
     colours rather than of garments. Filling the rest of the strip from the
     colours those products come in beats showing no strip at all, which is
     what a small collection used to get.

     But only up to a point. One product in six colours reads as intentional
     when it is the only thing in the family; padding a family of several with
     four of the same garment reads as filler. So a single product may take the
     whole strip only when it is the sole one with photographs — otherwise it
     is capped, and the strip runs short rather than repetitive. */
  if(out.length < limit){
    const withShots = order.filter(x => {
      const k = picks[x.id];
      return k && garmentPhoto(k.sku, k.colour, 'studio-01', true);
    }).length;
    const cap = withShots <= 1 ? limit : 2;
    const from = {};
    for(const p of order){
      if(out.length >= limit) break;
      from[p.id] = out.filter(o => String(o.id).split(':')[0] === p.id).length;
      for(const cand of cardCandidates(p, 'studio-01')){
        if(out.length >= limit || from[p.id] >= cap) break;
        const nm = (COLOURS[cand.colour] || {}).name || '';
        if(seen[nm]) continue;
        const src = garmentPhoto(cand.sku, cand.colour, 'studio-01', true);
        if(!src) continue;
        seen[nm] = 1; from[p.id]++;
        out.push({id:p.id + ':' + cand.colour, src, name:p.name, colour:nm});
      }
    }
  }
  return out;
}

function merchStrip(cat, seed){
  const shots = stripShots(6, cat, seed || cat || 'all');
  if(shots.length < 3) return '';
  /* No caption. The photographs say what they are, and a list of colour names
     under them told the reader nothing they could not see. */
  return `
  <section class="pub-sec pub-sec--flush strip-sec" aria-label="From the range">
    <div class="strip">
      ${shots.map(s => `<figure class="strip-i">
        <img src="${s.src}" alt="${esc(s.name)}${s.colour ? ' in ' + esc(s.colour) : ''}" loading="lazy">
      </figure>`).join('')}
    </div>
  </section>`;
}

function configureRail(cat){
  const all = catList(cat);
  if(!all.length) return '';
  /* The same card as the Products page. A collection is a filtered view of the
     catalogue, so the things in it should look like the things in it — a
     product that loses its photograph and its price on the way to a collection
     page reads as a different kind of object than the one you just left. */
  return `<div class="pgrid ${all.length === 4 ? 'pgrid--4' : ''}">${all.map(pcard).join('')}</div>`;
}

function pubCollection(slug){
  const c = catFromSlug(slug);
  if(!c) return pubShell(mPageHead({label:'Merchandise', title:'That collection does not exist.',
    lede:'Every collection in the catalogue is listed on the collections page.',
    after:`<div class="btn-row btn-row--top">${ctaBtn('collections', 'See all collections')}</div>`})
    + faqSection('merch', '—'), 'collections');
  const all = catList(c);
  const nG  = all.reduce((a, p) => a + ((p.matrix || []).length), 0);
  const from = poolLow(all);
  const one = catOne(c);
  return pubShell(`
  ${mPageHead({crumb: crumb([['Merchandise','merch'],['Collections','collections']], catName(c)),
    label: esc(catName(c)),
    title: `Personalised ${catName(c).toLowerCase()}.`,
    lede: catCopy(c),
    after: `<div class="mph-m">${nG} garment${nG === 1 ? '' : 's'} across ${
      all.length} product${all.length === 1 ? '' : 's'}${
      from ? ' · from ' + money(from) + ' per piece' : ''}</div>
      ${BUILDABLE(c) ? `<div class="btn-row btn-row--top">
        <button class="btn btn--primary btn--arrow" data-go="public:build:${esc(c)}">Build your ${
          esc(one)}<i class="btn-a" aria-hidden="true">&#8594;</i></button>
        <span class="t-xs muted mph-or">or pick from the ${nG} below</span>
      </div>` : ''}`})}
  <section class="pub-sec pub-sec--flush">
    <div class="pub-wrap">
      <div class="fscroll fscroll--top" role="group" aria-label="Collection">
        <button class="fp" data-go="public:products">All products</button>
        ${catsInUse().map(x => `<button class="fp ${x === c ? 'fp--on' : ''}"
          data-go="public:collection:${merchSlug(x)}">${esc(catName(x))}</button>`).join('')}
      </div>
      ${configureRail(c)}
    </div>
  </section>
  ${merchStrip(c, 'collection-' + c)}
  ${garmentBrowser(c)}
  ${faqSection('merch', '—')}
  ${seoBlock(c)}
  `, 'collection');
}

function pubCollections(){
  return pubShell(`
  ${mPageHead({crumb: crumb([['Merchandise','merch']], 'Collections'), label:'Collections',
    title:'Branded merchandise by product family.',
    lede:`${nWordCap(catsInUse().length)} ${catsInUse().length === 1 ? 'family' : 'families'}. Open one to compare products, quantities and the personalisation each garment carries.`})}
  <section class="pub-sec pub-sec--flush">
    <div class="pub-wrap">
      <div class="cc-g">${catsInUse().map(ccard).join('')}</div>
    </div>
  </section>
  ${merchStrip(null, 'collections-index')}
  ${faqSection('merch', '—')}
  ${seoBlock('all')}
  `, 'collections');
}

/* ---- product filters: real catalogue fields, not marketing labels ------ */
function listState(){
  const f = UI.flt = UI.flt || {};
  f.cats = f.cats || []; f.methods = f.methods || []; f.sort = f.sort || 'recommended';
  f.qty = f.qty || ''; f.price = f.price || '';
  f.seg = f.seg || []; f.fit = f.fit || []; f.wt = f.wt || '';
  return f;
}
function applyFilters(list){
  const f = listState();
  let out = list.slice();
  if(f.cats.length)    out = out.filter(p => f.cats.includes(p.cat));
  if(f.methods.length) out = out.filter(p => (p.pers || []).some(m => f.methods.includes(m)));
  /* a product matches if ANY garment under it does — and through the same band
     function the option counts use, so a chip promising six cannot return none */
  if(f.seg.length)     out = out.filter(p => gendersOf(p).some(g => f.seg.some(w => serves(w, g))));
  if(f.fit.length)     out = out.filter(p => fitsOf(p).some(x => f.fit.includes(x)));
  if(f.wt)             out = out.filter(p => (p.matrix || []).some(m => WT_BAND(m.w) === f.wt));
  if(f.qty)            out = out.filter(p => p.moq <= (+f.qty || 0));
  if(f.price === 'u20')   out = out.filter(p => { const v = catLow(p); return v != null && v < 20; });
  if(f.price === '20_40') out = out.filter(p => { const v = catLow(p); return v != null && v >= 20 && v < 40; });
  if(f.price === 'o40')   out = out.filter(p => { const v = catLow(p); return v != null && v >= 40; });
  if(f.price === 'req')   out = out.filter(p => catLow(p) == null);
  /* a product with no comparable price sorts after the priced ones */
  if(f.sort === 'plh')  out.sort(gbCmp(catLow, false));
  if(f.sort === 'phl')  out.sort(gbCmp(catLow, true));
  if(f.sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
function activeChips(){
  const f = listState(), out = [];
  f.cats.forEach(c => out.push([catName(c), 'rmCat', c]));
  f.methods.forEach(m => out.push([(S.personalization[m] || {}).name || m, 'rmMethod', m]));
  f.seg.forEach(g => out.push([genderName(g), 'rmSeg', g]));
  f.fit.forEach(k => out.push([fitName(k), 'rmFit', k]));
  if(f.wt) out.push([{light:'Light cloth', mid:'Mid weight', heavy:'Heavy cloth'}[f.wt], 'rmWt', '']);
  if(f.qty) out.push([`Quantity ${f.qty}`, 'rmQty', '']);
  if(f.price) out.push([{u20:'Under €20', '20_40':'€20–€40', o40:'€40 and over', req:'Price on request'}[f.price], 'rmPrice', '']);
  return out;
}
/* ---- listing pages ------------------------------------------------------
   The reference leads with a category strip and a dense grid, and pages by
   scrolling. We keep a real "Load more" control beside the observer so the
   list is operable by keyboard and the remaining count is always stated. */
const PAGE_STEP = 24;

/* The reference closes a listing with a substantial written block. It is
   guidance for a buyer, not a keyword field. */
function seoBlock(scope){
  const c = scope === 'all' ? null : scope;
  const paras = [
    `${c ? catCopy(c) + ' ' : ''}The decision that matters most is rarely the garment — it is the weight of the
      fabric and the surface it gives a decoration. A light jersey takes a large screen print cleanly and reads as
      a campaign piece; a heavier loopback or a brushed fleece holds embroidery without puckering and survives more
      washes. Compare weight in g/m² before comparing the starting price.`,
    `Quantity changes the method as much as the cost. Below about a hundred pieces a transfer usually makes more
      sense than screens, because the setup per colour has nowhere to amortise. Above it, screen printing becomes
      the cheaper answer and stays that way as the run grows. Embroidery is priced on the area it covers rather
      than the colours it uses.`,
    `Everything here is decorated in our own workshop and quoted before it is made. Minimums and lead times are
      stated per product, artwork is reviewed for suitability rather than accepted blindly, and an approved file is
      archived so a second run matches the first.`,
  ];
  return `
  <section class="pub-sec">
    <div class="pub-wrap">
      <div class="panel">
        ${secHead('—', 'Guidance', c ? `Choosing ${catName(c).toLowerCase()} for a branded run`
          : 'Choosing personalised clothing for your company',
          'What actually decides it, in the order it decides it.', {merch:true})}
        <div class="guide-g">${paras.map(t => `<p>${t}</p>`).join('')}</div>
        <div class="btn-row guide-cta">
          ${ctaBtn('method', 'How personalisation is priced', 'ghost')}
          ${ctaBtn('merchhelp', 'Get help choosing', 'ghost')}
        </div>
      </div>
    </div>
  </section>`;
}

function pubSearch(){
  const q = (UI.q || '').trim();
  const hit = !q ? [] : S.merchProducts.filter(p =>
    (p.name + ' ' + p.ref + ' ' + p.cat + ' ' + (p.desc || '')).toLowerCase().includes(q.toLowerCase()));
  const list = q ? applyFilters(hit) : [];
  return pubShell(`
  ${pageHead('PAMUUC Merchandise', q ? `Results for “${esc(q)}”` : 'Search products',
    q ? `${hit.length} product${hit.length === 1 ? '' : 's'} match this term. Search covers product names, references and categories.`
      : 'Search by product name, garment type or reference. You can also browse the collections.',
    {red:true, crumb: crumb([['PAMUUC Merchandise','merch']], 'Search'), after: catStrip(null) + searchBar(q)})}
  <section class="pub-sec pub-sec--top sec--red">
    <div class="pub-wrap">
      ${!q ? `<div class="cc-g">${catsInUse().map(ccard).join('')}</div>`
        : !hit.length ? `<div class="card card--quiet empty">
            <h2 class="t-h4">We couldn’t find a match for “${esc(q)}”.</h2>
            <p class="t-sm muted">Check the spelling, try a garment type such as hoodie or polo, or browse the collections.</p>
            <div class="btn-row btn-row--top">
              <button class="btn btn--ghost btn--sm" data-go="public:collections">Browse collections</button>
              <button class="btn btn--quiet btn--sm" data-go="public:merchhelp">Get help choosing</button>
            </div></div>`
        : `${filterBar('all')}${listBody(list, hit.length, 'No results match these filters.')}`}
    </div>
  </section>
  ${faqSection('merch', '—')}
  `, 'search');
}

/* the two merchandise notes, kept as their own list */
const MERCH_POSTS = [
  {id:'weight-vs-price', cat:'Merchandise', read:'6 min', date:'2 September 2026',
   title:'Fabric weight decides more than price does',
   lede:'Two t-shirts at the same price can behave completely differently under the same print. Weight, not cost, is the first number to compare.',
   img:'m_asher',
   body:[
     ['Why 150 and 220 are different products','A 150 g/m² jersey is a campaign piece: light, cheap to ship, and it takes a large screen print cleanly because the ink sits on a smooth, thin surface. A 220 g/m² tee is a wardrobe piece. It holds its shape through more washes, drapes rather than clings, and carries embroidery without the fabric puckering around the stitch. Buying the lighter one for a uniform-adjacent use, or the heavier one for a one-day event, is the most common and most expensive mistake we see.'],
     ['What weight does to a decoration','Embroidery needs something to sit on. Below roughly 180 g/m² the stitch pulls the cloth and the mark distorts after the first wash, which is why we move a chest logo to transfer or print on light garments rather than force the thread. Screen print is the opposite: a smooth, lighter surface takes flat colour better than a brushed fleece, where the pile lifts through the ink.'],
     ['How to compare honestly','Put the weight beside the price on every product you are considering, and compare those two numbers together. Our cards state g/m² for that reason. If a supplier will not tell you the weight, you cannot compare their price to anyone else’s.'],
   ]},
  {id:'quantity-changes-method', cat:'Merchandise', read:'5 min', date:'26 August 2026',
   title:'The quantity you order decides the decoration method',
   lede:'Screens have a setup cost with nowhere to amortise on a short run. Below about a hundred pieces, that single fact changes the right answer.',
   img:'m_archer_vintage',
   body:[
     ['Setup is the whole argument','Screen printing charges a setup per colour, once per artwork. At 500 pieces that cost disappears into the run. At 30 it dominates, and a four-colour design carries four of them. Transfer has no setup at all, which is exactly why a run of twenty-five is viable in the first place.'],
     ['Where the crossover sits','Roughly a hundred pieces, for most flat-colour designs. Below it, transfer usually wins. Above it, screen print takes over and the gap widens with every additional piece. The crossover moves with the colour count: a one-colour design justifies screens sooner, a six-colour design may never justify them at your volume.'],
     ['Embroidery is priced differently','Embroidery is costed on the area it covers, not the number of colours in it. A fifteen-colour crest at 60 mm can cost less than a two-colour logo at 140 mm. If your artwork is small and detailed, ask for embroidery before you assume print is cheaper.'],
   ]},
  {id:'fitting-on-shift', cat:'Custom uniforms', read:'7 min', date:'19 August 2026',
   title:'Fit the prototype on a shift, not in a meeting room',
   lede:'Almost every uniform failure we have recorded was a movement fault, and none of them appeared in a specification review.',
   img:'m_palmer',
   body:[
     ['What a fitting is actually for','A drawing shows proportion. A fitting shows whether someone can reach a top shelf, carry a tray through a doorway, or bend over a bed without the garment betraying them. Those are not aesthetic questions and they cannot be answered by looking at a sample on a hanger.'],
     ['Two faults we did not predict','A wrap jacket failed because the sleeve bound through the bicep during a treatment — the garment was correct at rest and impossible in use. A clinical tunic was rejected on pocket depth, because a pen fell out when staff leaned over a bed. Neither fault was visible in the specification review that approved both.'],
     ['Approve one garment at a time','Approving a set hides the one garment that does not work, and that is the garment you will hear about for two years. We record feedback and approval per garment so an approved piece is never reopened because another needs changing.'],
   ]},
  {id:'reorder-that-matches', cat:'Custom uniforms', read:'4 min', date:'12 August 2026',
   title:'Why the second order is the real test',
   lede:'A uniform programme succeeds the first time it is reordered by someone who was not involved in the first order.',
   img:'m_brooker',
   body:[
     ['The archive, not the design','What makes a reorder match is not the design file. It is the approved revision — measurements, fabrics, colour references, suppliers and the decoration position — stored as a snapshot at the moment it was approved. We produce against that record rather than against a memory of what was agreed.'],
     ['What is rechecked anyway','Availability, price and timing. A fabric can be discontinued and a mill can change. A reorder starts from the approved specification and then verifies those three things before it is confirmed, which is why we will not quote a repeat instantly.'],
   ]},
];

/* ---- the journal --------------------------------------------------------
   The articles are the real ones published at pamuuc-studio.com/en/blog —
   their titles, descriptions, dates and text — so the mockup shows the
   journal that exists rather than a placeholder of one.

   The layout speaks the same language as the rest of the Studio page: a
   chapter label with its index chip, a light display line, rounded panels on
   a quiet ground, and one lead article given the split treatment the work
   section uses.

   Two things here are for machines as much as readers. Every article opens
   on "The short answer" — the takeaways, in one block, phrased so an answer
   engine can lift them whole and attribute them. And every page emits the
   structured data for what it actually is: BlogPosting, Blog, ItemList,
   BreadcrumbList, FAQPage, Organization. See seoFor(). */

/* the merchandise notes predate the journal's shape: bring them into it
   rather than teaching every view two shapes */
/* where an article sends a reader who is ready */
const STUDIO_CTA = 'form';
const STUDIO_CTA_LABEL = 'Start your project brief';

/* Every article keeps the cover it already runs on pamuuc-studio.com, with
   the alt text and caption written for it. COVERS is keyed by the article's
   own key, so a post never borrows another section's photography. */
const COVER = (typeof COVERS !== 'undefined') ? COVERS : {};
const cover = (p) => (COVER[p.key] || {}).src || photo(p.photo) || null;
const coverAlt = (p) => (COVER[p.key] || {}).alt || p.title;
const coverCap = (p) => (COVER[p.key] || {}).cap || '';

const POSTS = (typeof JOURNAL !== 'undefined' ? JOURNAL : []).concat(
  (typeof MERCH_POSTS !== 'undefined' ? MERCH_POSTS : []).map(m => ({
    id:m.id, title:m.title, lede:m.lede, cat:m.cat,
    sector:m.cat === 'Merchandise' ? 'Merchandise' : 'Hotels and restaurants',
    /* the studio notes were never published, so they have no live cover and
       fall back to commissioned photography — one each, not the same twice */
    date:m.iso || '2026-08-12',
    photo:m.photo || {'fitting-on-shift':'hospitality', 'reorder-that-matches':'food'}[m.id] || 'corporate',
    key:m.id, takeaways:[m.lede],
    body:(m.body || []).map(([h, t]) => ({h, p:[t], li:[]})),
  })));
const postById = (id) => POSTS.find(p => p.id === id) || null;

/* roughly 200 words a minute, rounded up, computed rather than asserted */
function readMinutes(p){
  const words = (p.takeaways || []).join(' ').split(/\s+/).length +
    (p.body || []).reduce((t, s) => t + (s.h + ' ' + (s.p || []).join(' ') + ' ' +
      (s.li || []).join(' ')).split(/\s+/).length, 0);
  return Math.max(2, Math.round(words / 200));
}
function postsFor(branch){
  return POSTS.filter(p => branch === 'merch' ? p.cat === 'Merchandise' : p.cat !== 'Merchandise');
}
const isoDate = (d) => String(d || '').slice(0, 10);
function longDate(d){
  const dt = new Date(isoDate(d) + 'T00:00:00');
  if(isNaN(dt)) return String(d || '');
  return dt.toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});
}

function jrCard(p){
  return `
  <article class="jr" data-go="public:post:${p.id}">
    <div class="jr-m">${cover(p)
      ? `<img src="${cover(p)}" alt="${esc(coverAlt(p))}" loading="lazy">`
      : ''}</div>
    <div class="jr-b">
      <span class="jr-k">${esc(p.sector || p.cat)}</span>
      <h3 class="jr-t">${esc(p.title)}</h3>
      <p class="jr-d">${esc(p.lede)}</p>
      <div class="jr-f">
        <time datetime="${isoDate(p.date)}">${longDate(p.date)}</time>
        <span>${readMinutes(p)} min read</span>
      </div>
    </div>
  </article>`;
}

function pubBlog(){
  const branch = UI.lastBranch === 'merch' ? 'merch' : 'custom';
  const list = postsFor(branch);
  const [lead, ...rest] = list;
  if(!lead) return pubShell(pageHead('PAMUUC', 'Nothing published yet.', ''), 'blog');
  return pubShell(`
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${secHead('—', 'Journal', 'What we have learned making these.',
        'Notes from the workshop on fabric, laundry, fitting and reordering. Every article answers a question we are asked before an order, and is written from projects we have run.',
        {left:true, h1:true})}

      <article class="split split--wide jr-lead" data-go="public:post:${lead.id}">
        <div class="split-b">
          <div class="jr-lead-m">${cover(lead)
            ? `<img src="${cover(lead)}" alt="${esc(coverAlt(lead))}">` : ''}</div>
        </div>
        <div class="split-b jr-lead-b">
          <span class="tag tag--sm"><i>01</i>Latest</span>
          <h2 class="display jr-lead-t">${esc(lead.title)}</h2>
          <p class="lede jr-lead-d">${esc(lead.lede)}</p>
          <div class="jr-lead-f">
            <time datetime="${isoDate(lead.date)}">${longDate(lead.date)}</time>
            <span>${readMinutes(lead)} min read</span>
            <span>${esc(lead.sector || lead.cat)}</span>
          </div>
          <div class="jr-lead-a">${arrow('Read the article')}</div>
        </div>
      </article>

      <div class="jr-g">${rest.map(jrCard).join('')}</div>
      <p class="jr-note">${list.length} articles. Written by the studio that makes the garments, not by an
        agency writing about them.</p>
    </div>
  </section>
  ${faqSection(branch, '—')}
  `, 'blog');
}

function pubPost(id){
  const p = postById(id);
  if(!p) return pubShell(pageHead('PAMUUC', 'That article does not exist.',
    'Everything we have published is listed on the journal.',
    {after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:blog">All articles</button></div>`}), 'blog');

  const branch = p.cat === 'Merchandise' ? 'merch' : 'custom';
  const more = postsFor(branch).filter(x => x.id !== p.id).slice(0, 3);
  const mins = readMinutes(p);

  return pubShell(`
  <article class="po">
    <section class="pub-sec pub-sec--top">
      <div class="pub-wrap">
        <nav class="crumb" aria-label="Breadcrumb">
          <a data-go="public:custom">PAMUUC Studio</a><span class="crumb-sep">/</span>
          <a data-go="public:blog">Journal</a><span class="crumb-sep">/</span>
          <span class="crumb-here">${esc(p.title)}</span>
        </nav>

        <div class="po-hd">
          <span class="tag tag--sm"><i>—</i>${esc(p.sector || p.cat)}</span>
          <h1 class="display po-t">${esc(p.title)}</h1>
          <p class="lede po-d">${esc(p.lede)}</p>
          <div class="po-meta">
            <span><b>Published</b><time datetime="${isoDate(p.date)}">${longDate(p.date)}</time></span>
            <span><b>Reading time</b>${mins} minutes</span>
            <span><b>Written by</b>PAMUUC Studio, Barcelona</span>
          </div>
        </div>

        <figure class="po-m">${cover(p)
          ? `<img src="${cover(p)}" alt="${esc(coverAlt(p))}">` : ''}
          ${coverCap(p) ? `<figcaption class="po-cap">${esc(coverCap(p))}</figcaption>` : ''}</figure>

        ${(p.takeaways || []).length ? `
        <div class="po-key" id="short-answer">
          <div class="po-key-h"><span class="eyebrow">The short answer</span>
            <span class="t-xs faint">${mins} min read in full</span></div>
          <ul class="po-key-l">${p.takeaways.map(k => `<li>${esc(k)}</li>`).join('')}</ul>
        </div>` : ''}

        <div class="po-body">
          <aside class="po-rail" aria-label="Contents">
            <div class="eyebrow">In this article</div>
            <ol class="po-toc">
              ${(p.takeaways || []).length ? `<li><a data-jump="short-answer">The short answer</a></li>` : ''}
              ${p.body.map((s, i) => `<li><a data-jump="s-${p.id}-${i}">${esc(s.h)}</a></li>`).join('')}
            </ol>
            <div class="po-rail-cta">${ctaBtn(STUDIO_CTA, STUDIO_CTA_LABEL, 'ghost')}</div>
          </aside>
          <div class="po-read">
            ${p.body.map((s, i) => `
              <section class="po-s" id="s-${p.id}-${i}">
                <h2 class="po-h">${esc(s.h)}</h2>
                ${(s.p || []).map(t => `<p>${esc(t)}</p>`).join('')}
                ${(s.li || []).length ? `<ul class="po-l">${s.li.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
              </section>`).join('')}
          </div>
        </div>
      </div>
    </section>
  </article>

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secHead('—', 'Keep reading', 'Related articles.',
        'The questions that usually come next, answered the same way.', {left:true})}
      <div class="jr-g jr-g--3">${more.map(jrCard).join('')}</div>
    </div>
  </section>
  ${faqSection(branch, '—')}
  `, 'post');
}

/* ---- merchandise support pages ----------------------------------------- */
function pubMethod(){
  const rows = [
    ['Appearance and feel','Stitched thread sitting on the surface','Ink laid into the fabric','Film bonded to the surface','Ink printed into the fibre'],
    ['Suited to','Heavier surfaces — sweatshirts, caps, outerwear, shirt chests','Flat colour artwork, larger prints, higher quantities','Short runs, many colours, small marks','Photographic artwork on cotton-rich garments'],
    ['Artwork considerations','Fine detail and small text are limited by stitch size','Each colour needs its own screen','Full colour without a colour count','Full colour; fabric affects result'],
    ['Size or colour limits','Size bracket drives the cost','Colour count drives the setup','Placement must be compatible','Compatible garments only'],
    ['Price drivers','Stitch area and setup per artwork','Setup per colour, unit rate falls with quantity','Unit rate only','Unit rate only, slower per piece'],
    ['Care','Durable through repeated industrial laundry','Durable when cured correctly','Follow the garment care instruction','Follow the garment care instruction'],
  ];
  return pubShell(`
  ${pageHead('PAMUUC Merchandise · Personalisation', 'Personalisation by product and artwork.',
    'Embroidery, screen print and direct-to-garment printing, and which of them a garment will carry. Product compatibility and the final proof determine what can be produced.',
    {red:true, crumb: crumb([['PAMUUC Merchandise','merch']], 'Personalisation')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="tw">
        <table class="tbl">
          <thead><tr><th scope="col">Compare</th>${METHODS.map(m => `<th scope="col">${m[0]}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="t-xs muted note">No method is best for every product. The available options on each product page are the ones that product supports.</p>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <h2 class="sec-title">Placement and artwork</h2>
      <div class="grid grid-3 gap-lg">
        ${[['Placements','A garment carries the placements its product rule allows — commonly a chest mark, a back mark and one more. Seams, pockets and printable area can restrict what is possible.'],
           ['Artwork we can use','Vector files reproduce at any size without redrawing. A high resolution raster file works for transfer and direct to garment. We review suitability before production.'],
           ['Proof','Where a proof is required we share the reviewed artwork, dimensions and position for approval. A proof is not a photograph of the finished product, and approving it is separate from approving the quote.']]
          .map(([h, p]) => `<div class="card"><h3 class="t-h4 card-t">${h}</h3><p class="t-sm muted">${p}</p></div>`).join('')}
      </div>
      <div class="btn-row btn-row--top">
        ${UI.mFrom ? `<button class="btn btn--primary" data-go="public:product:${esc(UI.mFrom)}">Return to ${esc((by(S.merchProducts, UI.mFrom) || {}).name || 'the product')}</button>` : ''}
        <button class="btn btn--ghost" data-go="public:products">Browse products</button>
      </div>
    </div>
  </section>
  ${faqSection('merch', '—')}
  `, 'method');
}

function pubHowTo(){
  const objects = [
    ['Blank sample','Physical product without the final decoration','Assess material, size and fit, under the approved sample policy'],
    ['Decoration sample','Physical example of a method or a specific decorated item','Assess the finish; establish whether it is the exact production sample'],
    ['Digital proof','Reviewed artwork placement and production information','Approve the specified artwork version and dimensions'],
    ['Reviewed quote','Commercial proposal for the specified scope','Accept price, terms and relevant schedule conditions'],
  ];
  return pubShell(`
  ${pageHead('PAMUUC Merchandise · How to order', 'How to order branded merchandise.',
    'From choosing a garment to an approved order: four steps, and four different things you may be asked to approve. No payment is taken when you submit a quote request.',
    {red:true, crumb: crumb([['PAMUUC Merchandise','merch']], 'How to order')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="grid grid-4 gap-lg">
        ${ORDER_STEPS.map(([h, p], i) => `<div class="card card--num">
          <div class="eyebrow">${String(i + 1).padStart(2, '0')}</div>
          <h2 class="t-h4 card-t">${h}</h2><p class="t-sm muted">${p}</p></div>`).join('')}
      </div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">Four things that are not the same</h2>
        <p class="sec-desc">Viewing a digital mockup does not establish fabric feel, exact colour or
          physical fit. These four objects answer different questions.</p></div>
      <div class="tw">
        <table class="tbl">
          <thead><tr><th scope="col">Object</th><th scope="col">What it is</th><th scope="col">What you decide</th></tr></thead>
          <tbody>${objects.map(r => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
  </section>
  <section class="pub-sec">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">What the quote includes</h2></div>
      <div class="grid grid-2 gap-lg">
        ${[['Stated in every reviewed quote','Products and quantities, decoration method and placement, setup charges, delivery basis and tax treatment, and the version the approval applies to.'],
           ['Confirmed before production','The required approvals, the artwork proof where one is needed, and the agreed payment. Production is released when those are in place, not when the quote is sent.']]
          .map(([h, p]) => `<div class="card"><h3 class="t-h4 card-t">${h}</h3><p class="t-sm muted">${p}</p></div>`).join('')}
      </div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary" data-go="public:products">Browse products</button>
        ${quoteCount() ? `<button class="btn btn--ghost" data-go="public:quote">Review your quote request</button>` : ''}
      </div>
    </div>
  </section>
  ${faqSection('merch', '—')}
  `, 'howto');
}

function pubMerchHelp(){
  return pubShell(`
  ${pageHead('PAMUUC Merchandise · Help', 'Help with your branded merchandise request.',
    'The questions buyers ask before sending a quote request to a merchandise supplier, and a direct route if yours is not answered here.',
    {red:true, crumb: crumb([['PAMUUC Merchandise','merch']], 'Help')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="faq faq--all">
        ${MERCH_FAQ.map(q => `<details class="faq-i"><summary class="faq-q">${q[0]}</summary>
          <div class="faq-a"><p class="t-sm">${q[1]}</p></div></details>`).join('')}
      </div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <h2 class="sec-title">Get help choosing</h2>
      <p class="sec-desc">Tell us the product you have in mind, your approximate quantity and
        preferred date. Quantity and date are optional if they are not decided.</p>
      ${helpForm('merch')}
    </div>
  </section>
  `, 'merchhelp');
}

/* One assisted enquiry form, used by merchandise help and contextual help. */
function helpForm(kind){
  const lines = (UI.quote || []).length;
  return `
  <form class="stack-3 help-form" onsubmit="return false">
    ${[['h_name','Your name','text'],['h_email','Email','email'],['h_co','Company or organisation','text']]
      .map(([n, l, t]) => `<label class="fld"><span class="fld-l">${l}</span>
        <input class="inp" type="${t}" name="${n}" required></label>`).join('')}
    <label class="fld"><span class="fld-l">What do you need help with?</span>
      <textarea class="inp" name="h_msg" rows="3"
        placeholder="For example, the product and quantity you have in mind, or the artwork you want to use."></textarea></label>
    ${lines ? `<p class="t-xs muted">Your quote request (${lines} configuration${lines === 1 ? '' : 's'}) is included with this message so you do not have to describe it again.</p>` : ''}
    <div class="btn-row">
      <button class="btn btn--primary" data-act="helpSubmit" data-k="${kind}">Send request</button>
    </div>
    <p class="t-xs muted">We use these details to respond to your enquiry.
      <a class="lnk" data-go="public:privacy">Read our Privacy Notice.</a></p>
  </form>`;
}

/* ---- the quote basket --------------------------------------------------- */
/* A line is a requested configuration, not an order. The badge counts
   configurations; the basket states the total units, so "3" never silently
   means three garments when it means three lines of a hundred. */
const quoteCount = () => (UI.quote || []).length;
const quoteUnits = () => (UI.quote || []).reduce((t, l) => t + (+l.qty || 0), 0);
/* One charge for the whole request, offered where the request is reviewed
   rather than on a product page — a per-project cost sitting beside a
   per-piece price reads as an upsell on that garment, which it is not. */
const PRESENTATION = 49.99;
function presOffer(){
  const on = !!UI.quotePres;
  return `
  <div class="presx ${on ? 'presx--on' : ''}">
    <div class="presx-side" aria-hidden="true">${PRES_GLYPH}</div>
    <div class="presx-b">
      <div class="presx-h"><span class="presx-tag">${on ? 'Added to your request' : 'Optional extra'}</span>
        <span class="presx-p num">${money(PRESENTATION)}</span></div>
      <h3 class="presx-t">See it before it is made</h3>
      <p class="presx-d">A branded presentation of your artwork on the garments you chose, in your colours and
        placements, sent before anything goes into production. One charge for the whole request, not per piece.</p>
      <button class="btn ${on ? 'btn--quiet' : 'btn--primary'} presx-cta" data-act="qPres"
        aria-pressed="${on}">${on ? 'Remove it' : 'Add it for ' + money(PRESENTATION)}</button>
    </div>
  </div>`;
}
/* The drawer lists artwork review, setup and delivery — rows that state a fact
   and cannot be acted on. Put the presentation among them as one more row and
   it reads as another fact rather than the one thing there you can choose. So
   in the drawer it steps out of that list into its own block, above the total,
   carrying the merchandise red that marks it as ours to offer. */
function presDrawer(){
  const on = !!UI.quotePres;
  return `
  <div class="presd ${on ? 'presd--on' : ''}">
    <span class="presd-tag">${on ? 'Added to your request' : 'Optional extra'}</span>
    <h4 class="presd-t">Branded presentation</h4>
    <p class="presd-d">A visual of your artwork on the garments you chose, sent before anything goes into
      production. One charge for the whole request, not per piece.</p>
    <div class="presd-f">
      <span class="presd-p num">${money(PRESENTATION)}</span>
      <button class="btn btn--sm ${on ? 'btn--quiet' : 'btn--merch'}" data-act="qPres"
        aria-pressed="${on}">${on ? 'Remove' : 'Add it'}</button>
    </div>
  </div>`;
}
/* The quote summary keeps the line: there it sits in a column of amounts being
   totted up, where it really is one of them. */
function presLine(kind){
  const on = !!UI.quotePres;
  const act = on
    ? `<button class="lnk presl-x" data-act="qPres">Remove</button>`
    : `<button class="btn btn--sm btn--merch presl-add" data-act="qPres">Add ${money(PRESENTATION)}</button>`;
  const label = `Branded presentation${on ? '' :
    `<span class="presl-d">a visual of your artwork before production</span>`}`;
  const amount = on ? `<span class="num">${money(PRESENTATION)}</span> ${act}` : act;
  return kind === 'dl'
    ? `<div class="dl-r presl ${on ? 'presl--on' : ''}"><dt>${label}</dt><dd>${amount}</dd></div>`
    : `<div class="drow presl ${on ? 'presl--on' : ''}"><span>${label}</span><span>${amount}</span></div>`;
}

/* a mounted sheet — the thing a presentation actually is */
const PRES_GLYPH = `<svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor"
  stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="7" y="5" width="34" height="38" rx="2"/><rect x="12" y="10" width="24" height="18" rx="1"/>
  <path d="M12 33h24M12 38h15"/></svg>`;

function quoteKnown(){
  let known = 0, unresolved = 0;
  (UI.quote || []).forEach(l => { if(l.total == null) unresolved++; else known += l.total; });
  return {known, unresolved};
}
const sizeRun = (l) => (l.sizes || []).length
  ? (l.sizes).map(x => x.size + ' × ' + x.qty).join('  ·  ') : '';

function lineSummary(l){
  const pl = (l.placements || []);
  return `${l.qty} × ${esc(l.productName)} · ${esc(l.colourName)}`
    + (pl.length ? ` · ${pl.length} placement${pl.length === 1 ? '' : 's'}` : ' · no personalisation');
}

function pubQuote(){
  const lines = UI.quote || [];
  const {known, unresolved} = quoteKnown();
  if(!lines.length) return pubShell(`
    ${pageHead('PAMUUC Merchandise · Quote request', 'Your quote request is empty.',
      'Add products to compare and request a quote. Nothing is ordered or charged when you send a request.',
      {red:true, crumb: crumb([['PAMUUC Merchandise','merch']], 'Quote request'),
       after:`<div class="btn-row btn-row--top">
         <button class="btn btn--primary btn--lg" data-go="public:products">Browse products</button>
         <button class="btn btn--quiet" data-go="public:merchhelp">Get help choosing</button></div>`})}
    ${faqSection('merch', '—')}
  `, 'quote');
  return pubShell(`
  ${pageHead('PAMUUC Merchandise · Quote request', 'Build a merchandise request for review.',
    'Review the products and personalisation you want us to assess. Nothing is ordered or charged when you send this request.',
    {red:true, crumb: crumb([['PAMUUC Merchandise','merch']], 'Quote request')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="qlayout">
        <div class="stack-3">
          ${lines.map((l, i) => `
          <div class="qline">
            <div class="qline-img">${l.img ? `<img src="${l.img}" alt="${esc(l.productName)}" loading="lazy">` : ''}</div>
            <div class="qline-b">
              <div class="row-between qline-top">
                <div>
                  <h2 class="t-h5">${esc(l.productName)}</h2>
                  <div class="t-xs muted">Ref. ${esc(l.ref)} · ${esc(l.colourName)}</div>
                  ${sizeRun(l) ? `<div class="t-xs szrun">${esc(sizeRun(l))}</div>` : ''}
                </div>
                <div class="qline-amt num">${l.total == null
                  ? `<span class="chip">Price on review</span>`
                  : `<b>${money(l.total)}</b><span class="t-xs muted"> excl. VAT</span>`}</div>
              </div>
              <div class="qline-facts">
                <span class="t-sm num">${pcs(l.qty)}</span>
                <span class="t-sm muted">${l.sizes ? 'Sizes provided' : 'Sizes to follow'}</span>
                <span class="t-sm muted">${(l.placements || []).length
                  ? (l.placements || []).map(p => esc(p.posName) + ' · ' + esc(p.methodName)).join(' · ')
                  : 'No personalisation'}</span>
                <span class="t-sm muted">${l.art ? 'Artwork attached' : (l.artHelp ? 'Artwork help requested' : 'Artwork to follow')}</span>
              </div>
              <details class="disc disc--sm">
                <summary class="disc-q">View configuration</summary>
                <div class="disc-b">
                  <dl class="dl">
                    ${(l.placements || []).map((p, k) => `<div class="dl-r"><dt>Placement ${k + 1}</dt>
                      <dd>${esc(p.posName)} · ${esc(p.methodName)} · ${esc(p.size)}${p.colours > 1 ? ` · ${p.colours} colours` : ''}</dd></div>`).join('')
                      || `<div class="dl-r"><dt>Personalisation</dt><dd>None requested</dd></div>`}
                    <div class="dl-r"><dt>Price basis</dt><dd>${l.total == null
                      ? 'Confirmed on review' : `${money(l.unit)} per piece at ${l.qty}, excl. VAT`}</dd></div>
                  </dl>
                </div>
              </details>
              <div class="btn-row qline-act">
                <button class="btn btn--quiet btn--sm" data-act="qEdit" data-i="${i}">Edit</button>
                <button class="btn btn--quiet btn--sm" data-act="qDup" data-i="${i}">Duplicate</button>
                <button class="btn btn--quiet btn--sm" data-act="qRemove" data-i="${i}">Remove</button>
              </div>
            </div>
          </div>`).join('')}

          ${presOffer()}
        </div>

        <aside class="qsum">
          <h2 class="t-h4">Request summary</h2>
          <dl class="dl">
            <div class="dl-r"><dt>Configurations</dt><dd class="num">${lines.length}</dd></div>
            <div class="dl-r"><dt>Total units</dt><dd class="num">${quoteUnits()}</dd></div>
            <div class="dl-r"><dt>${unresolved ? 'Known subtotal' : 'Products and personalisation'}</dt>
              <dd class="num">${money(known)}</dd></div>
            ${presLine('dl')}
            ${unresolved ? `<div class="dl-r"><dt>Awaiting review</dt>
              <dd>${unresolved} line${unresolved === 1 ? '' : 's'}</dd></div>` : ''}
            <div class="dl-r"><dt>Setup charges</dt><dd>Confirmed in the reviewed quote</dd></div>
            <div class="dl-r"><dt>Delivery</dt><dd>Confirmed in the reviewed quote</dd></div>
            <div class="dl-r"><dt>Tax</dt><dd>Amounts exclude VAT</dd></div>
          </dl>
          <p class="t-xs muted">${unresolved
            ? 'Some lines need review before an amount can be shown, so this is a known subtotal rather than a total.'
            : 'This is an indicative amount for the products and personalisation shown. Setup and delivery are confirmed on review.'}</p>
          <div class="btn-row qsum-act">
            <button class="btn btn--primary btn--block" data-go="public:qcontact">Continue to contact details</button>
            <button class="btn btn--ghost btn--block" data-go="public:products">Add more products</button>
          </div>
          <p class="t-xs muted"><a class="lnk" data-go="public:merchhelp">Need help completing this quote?</a></p>
        </aside>
      </div>
    </div>
  </section>
  `, 'quote');
}

/* ---- the quote drawer ---------------------------------------------------
   A slide-over summary of the request, reachable from the header on every
   merchandise page. It edits quantity and removes lines; everything else
   happens on the product page or at checkout. */
function quoteDrawer(){
  const lines = UI.quote || [];
  const {known, unresolved} = quoteKnown();
  return `
  <div class="dscrim" data-act="closeDrawer"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="Products in your quote">
    <div class="drawer-h">
      <h2 class="t-h3">Products in your quote</h2>
      <button class="drawer-x" data-act="closeDrawer" aria-label="Close">✕</button>
    </div>

    <div class="drawer-body">
      ${!lines.length ? `
        <div class="drawer-empty">
          <p class="t-body">Your quote is empty.</p>
          <p class="t-sm muted">Add products to compare and request a quote. Nothing is ordered or charged when you send one.</p>
          <div class="btn-row btn-row--top">
            <button class="btn btn--primary" data-go="public:products">Browse products</button>
          </div>
        </div>`
        : lines.map((l, i) => {
          const p = by(S.merchProducts, l.product);
          const tiers = [...new Set([...(p && p.breaks ? p.breaks.map(b => b.qty) : []), l.qty])].sort((a, b) => a - b);
          return `
          <div class="dline">
            <div class="dline-img">${l.img ? `<img src="${l.img}" alt="${esc(l.productName)}" loading="lazy">` : ''}</div>
            <div class="dline-b">
              <div class="dline-top">
                <div class="dline-n">${esc(l.productName)} · ${esc(l.colourName)}${
                  sizeRun(l) ? `<span class="szrun">${esc(sizeRun(l))}</span>` : ''}</div>
                <div class="dline-p num">${l.total == null ? '<span class="chip">On review</span>' : money(l.total)}</div>
              </div>
              <div class="dline-r">
                <label class="dqty">
                  <span class="vh">Quantity for ${esc(l.productName)}</span>
                  ${(l.sizes || []).length
                    ? `<span class="inp inp--xs dqty--fixed num" title="Set by the size run">${l.qty}</span>`
                    : `<select class="inp inp--xs" data-act="dQty" data-i="${i}">
                    ${tiers.map(q => `<option value="${q}" ${q === l.qty ? 'selected' : ''}>${q}</option>`).join('')}
                  </select>`}
                </label>
                <span class="t-xs muted">${(l.placements || []).length
                  ? (l.placements || []).map(x => esc(x.posName)).join(' · ')
                  : 'No personalisation'}</span>
                <span class="spacer"></span>
                <button class="dline-x" data-act="qRemove" data-i="${i}"
                  aria-label="Remove ${esc(l.productName)} from your quote">Remove</button>
              </div>
            </div>
          </div>`;}).join('')}
    </div>

    ${lines.length ? `
    <div class="drawer-foot">
      <div class="drow"><span>Artwork review</span><span>Included</span></div>
      <div class="drow"><span>Setup charges</span><span>Confirmed on review</span></div>
      <div class="drow"><span>Delivery</span><span>Confirmed on review</span></div>
      ${presDrawer()}
      <div class="drow drow--t">
        <span>${unresolved ? 'Known subtotal' : 'Estimated total'}</span>
        <span class="num">${money(known + (UI.quotePres ? PRESENTATION : 0))}</span>
      </div>
      ${unresolved ? `<p class="t-xs muted">${unresolved} line${unresolved === 1 ? '' : 's'} priced on review, so this is a subtotal rather than a total.</p>` : ''}
      <button class="btn btn--primary btn--lg btn--block" data-go="public:qcontact">View quote</button>
      <p class="dnote t-xs">No payment is needed yet. This is a request.</p>
      <button class="btn btn--quiet btn--sm btn--block" data-go="public:quote">Open the full quote</button>
    </div>` : ''}
  </aside>`;
}

/* ---- checkout ----------------------------------------------------------
   A focused two-column completion screen: what you are sending on the left,
   who we send it to on the right. Deliberately stripped of the site header
   and footer so the only actions are finish, or go back. */
/* A completion flow keeps the wordmark and a way back, and nothing else.
   The branch decides which wordmark, and where back goes. */
function pubShellBare(inner, page){
  const studio = PUB_BRANCH[page] === 'custom';
  const home = studio ? 'custom' : 'merch';
  const back = studio ? 'custom' : 'quote';
  const label = studio ? 'Back to PAMUUC Studio' : 'Back to your quote';
  return `
  <div class="pub pub--bare">
    <header class="co-hd">
      <div class="co-hd-in">
        <button class="co-back" data-go="public:${back}" aria-label="${label}">←</button>
        <span class="brand" data-go="public:${home}">${mark('mk--lockup')}PAMUUC<span class="brand-bar">|</span><span class="brand-sub">${studio ? 'STUDIO' : 'MERCHANDISE'}</span></span>
      </div>
    </header>
    <main id="main">${inner}</main>
  </div>`;
}

function pubQContact(){
  if(!quoteCount()) return pubQuote();
  const lines = UI.quote || [], c = UI.qc || {};
  const {known, unresolved} = quoteKnown();
  const errs = Object.keys(UI.qcErr || {});
  const f = (n, l, type, req, help, half) => {
    const err = (UI.qcErr || {})[n];
    return `
    <label class="fld ${err ? 'fld--err' : ''} ${half ? 'fld--half' : ''}">
      <span class="fld-l">${l}${req ? '' : ' <span class="muted">(optional)</span>'}</span>
      <input class="inp" type="${type}" name="${n}" value="${esc(c[n] || '')}"
        ${req ? 'required aria-required="true"' : ''} ${err ? 'aria-invalid="true"' : ''}>
      ${help ? `<span class="fld-h t-xs muted">${help}</span>` : ''}
      ${err ? `<span class="fld-e t-xs">${err}</span>` : ''}
    </label>`;
  };
  return pubShellBare(`
  <div class="co">
    <section class="co-left">
      <h1 class="display co-t">Summary</h1>

      <div class="co-lines">
        ${lines.map((l, i) => `
        <div class="co-line">
          <div class="co-line-img">${l.img ? `<img src="${l.img}" alt="${esc(l.productName)}" loading="lazy">` : ''}</div>
          <div class="co-line-b">
            <div class="co-line-top">
              <div class="co-line-n">${esc(l.productName)} · ${esc(l.colourName)}${
                sizeRun(l) ? `<span class="szrun">${esc(sizeRun(l))}</span>` : ''}</div>
              <div class="num co-line-p">${l.total == null ? '<span class="chip">On review</span>' : money(l.total)}</div>
            </div>
            <div class="co-line-m">
              <span class="num">${pcs(l.qty)}</span>
              ${l.unit != null ? `<span class="muted">${money(l.unit)} per unit</span>` : ''}
              <span class="muted">${(l.placements || []).length
                ? (l.placements || []).map(x => esc(x.posName) + ' · ' + esc(x.methodName)).join(' · ')
                : 'No personalisation'}</span>
            </div>
            <div class="co-line-a">
              <button class="lnk lnk--sm" data-act="qEdit" data-i="${i}">Change</button>
              <button class="lnk lnk--sm" data-act="qRemove" data-i="${i}">Remove</button>
            </div>
          </div>
        </div>`).join('')}
      </div>

      <div class="co-row">
        <span class="co-row-l">Delivery</span>
        <span class="co-row-v">
          <span>Confirmed in the reviewed quote</span>
          <button class="lnk lnk--sm" data-act="askEarlier">Need it by a date?</button>
        </span>
      </div>
      <div class="co-row">
        <span class="co-row-l">Setup charges</span>
        <span class="co-row-v"><span>Confirmed in the reviewed quote</span></span>
      </div>
      <div class="co-row co-row--total">
        <span class="co-row-l">${unresolved ? 'Known subtotal' : 'Estimated total'}</span>
        <span class="co-total num">${money(known)}</span>
      </div>
      <p class="t-xs muted">Amounts exclude VAT and cover the products and personalisation shown.
        ${unresolved ? `${unresolved} line${unresolved === 1 ? '' : 's'} are priced on review.` : ''}
        Nothing is charged at this step.</p>

      <p class="t-xs muted co-legal">© ${new Date().getFullYear()} Pamuk Studio S.L ·
        <a class="lnk ft-link--inline" data-go="public:terms">Terms</a> &amp;
        <a class="lnk ft-link--inline" data-go="public:privacy">privacy notice</a> apply.</p>
    </section>

    <section class="co-right">
      <h2 class="display co-t">Your contact details</h2>
      ${errs.length ? `<div class="banner banner--stop" id="qerrsum"><div>
        <div class="banner-t">${errs.length} answer${errs.length === 1 ? '' : 's'} still needed</div>
        <div class="banner-d">${errs.map(k => esc((UI.qcErr || {})[k])).join(' ')}</div></div></div>` : ''}
      <form class="co-card" onsubmit="return false">
        <div class="co-grid">
          ${f('name', 'First name', 'text', true, '', true)}
          ${f('last', 'Last name', 'text', false, '', true)}
        </div>
        ${f('company', 'Company or organisation', 'text', true, 'Sole traders and organisations are both fine.')}
        ${f('email', 'Email', 'email', true, 'We send the reviewed quote to this address.')}
        <div class="co-grid co-grid--phone">
          <label class="fld"><span class="fld-l">Country</span>
            <select class="inp" name="country" data-act="qcSet" data-f="country">
              ${['Spain','France','Portugal','Italy','Germany','Netherlands','Other in Europe','Outside Europe']
                .map(x => `<option ${(c.country || 'Spain') === x ? 'selected' : ''}>${x}</option>`).join('')}
            </select></label>
          ${f('phone', 'Phone number', 'tel', false, 'Only if you would rather we call.')}
        </div>
        <label class="chk co-chk"><input type="checkbox">
          <span class="t-sm">Send me occasional product updates. Separate from this quote, and never required.</span></label>
        <button class="btn btn--primary btn--lg btn--block" data-act="qSubmit">Request your quote</button>
        <p class="t-xs muted">We use these details to prepare and respond to your quote request.
          <a class="lnk" data-go="public:privacy">Read our Privacy Notice.</a></p>
      </form>
      <div class="co-trust">
        <span>✓ Reviewed before you approve</span>
        <span>✓ No payment at this step</span>
        <span>✓ Artwork kept on file</span>
      </div>
    </section>
  </div>
  `, 'qcontact');
}

function pubQReview(){
  if(!quoteCount()) return pubQuote();
  const c = UI.qc || {}, {known, unresolved} = quoteKnown();
  const row = (k, v, go) => `<div class="dl-r"><dt>${k}</dt><dd>${v}
    ${go ? `<button class="lnk lnk--sm" data-go="public:${go}">Change</button>` : ''}</dd></div>`;
  return pubShell(`
  ${pageHead('PAMUUC Merchandise · Quote request', 'Check your quote request.',
    'Review what we will assess. You can change any part before sending it.',
    {red:true, crumb: crumb([['PAMUUC Merchandise','merch'],['Quote request','quote']], 'Check request')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="qlayout">
        <div class="stack-3">
          <div class="card">
            <div class="row-between"><h2 class="t-h4">Products</h2>
              <button class="lnk lnk--sm" data-go="public:quote">Change</button></div>
            <dl class="dl">
              ${(UI.quote || []).map(l => `<div class="dl-r"><dt>${esc(l.productName)}</dt>
                <dd>${lineSummary(l)}<br><span class="t-xs muted">${l.art ? 'Artwork attached'
                  : l.artHelp ? 'Artwork help requested' : 'Artwork to follow'} · ${l.sizes ? 'Sizes provided' : 'Sizes to follow'}
                  · ${l.total == null ? 'Price on review' : money(l.total) + ' excl. VAT'}</span></dd></div>`).join('')}
            </dl>
          </div>
          <div class="card">
            <div class="row-between"><h2 class="t-h4">Contact and delivery</h2>
              <button class="lnk lnk--sm" data-go="public:qcontact">Change</button></div>
            <dl class="dl">
              ${row('Name', esc(c.name || 'Not provided'))}
              ${row('Email', esc(c.email || 'Not provided'))}
              ${row('Company', esc(c.company || 'Not provided'))}
              ${row('Delivery country', esc(c.country || 'Spain'))}
              ${row('Postcode', esc(c.postcode || 'Not provided'))}
              ${row('Preferred date', c.noDate ? 'Date not fixed' : (esc(c.date || 'Not provided')))}
              ${row('Phone', esc(c.phone || 'Not provided'))}
            </dl>
          </div>
          ${presOffer()}
          <div class="banner banner--wait"><div>
            <div class="banner-t">What happens to this request</div>
            <div class="banner-d">We’ll review the products, artwork requirements, availability and delivery before sending the confirmed proposal. Sending this request does not place an order.</div>
          </div></div>
          <div class="btn-row">
            <button class="btn btn--primary btn--lg" data-act="qSubmit">Submit quote request</button>
            <button class="btn btn--quiet" data-go="public:qcontact">Back</button>
          </div>
        </div>
        <aside class="qsum">
          <h2 class="t-h4">Amounts</h2>
          <dl class="dl">
            <div class="dl-r"><dt>${unresolved ? 'Known subtotal' : 'Products and personalisation'}</dt>
              <dd class="num">${money(known)}</dd></div>
            ${presLine('dl')}
            ${unresolved ? `<div class="dl-r"><dt>Awaiting review</dt><dd>${unresolved} line${unresolved === 1 ? '' : 's'}</dd></div>` : ''}
            <div class="dl-r"><dt>Setup</dt><dd>Confirmed in the reviewed quote</dd></div>
            <div class="dl-r"><dt>Delivery</dt><dd>Confirmed in the reviewed quote</dd></div>
            <div class="dl-r"><dt>Tax</dt><dd>Excl. VAT</dd></div>
          </dl>
          <p class="t-xs muted">Indicative amounts for the configuration shown, subject to artwork, stock and delivery review.</p>
        </aside>
      </div>
    </div>
  </section>
  `, 'qreview');
}

function pubQDone(){
  const r = UI.qDone;
  if(!r) return pubQuote();
  return pubShell(`
  ${pageHead('PAMUUC Merchandise', 'Your quote request has been received.',
    `We’ll review the details and reply to ${esc(r.email)} with the next step. Your reference is ${esc(r.ref)}.`,
    {red:true})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="qlayout">
        <div class="stack-3">
          <div class="card">
            <h2 class="t-h4">What happens next</h2>
            <ol class="steps">
              <li>We check products, artwork requirements and availability.</li>
              <li>We confirm the proposal and any details still needed.</li>
              <li>You review and approve before payment and production.</li>
            </ol>
          </div>
          <div class="card">
            <h2 class="t-h4">What you sent</h2>
            <dl class="dl">
              <div class="dl-r"><dt>Reference</dt><dd class="num">${esc(r.ref)}</dd></div>
              <div class="dl-r"><dt>Configurations</dt><dd class="num">${r.lines}</dd></div>
              <div class="dl-r"><dt>Total units</dt><dd class="num">${r.units}</dd></div>
              <div class="dl-r"><dt>Delivery country</dt><dd>${esc(r.country)}</dd></div>
              <div class="dl-r"><dt>Requested date</dt><dd>${esc(r.date)}</dd></div>
            </dl>
            <p class="t-xs muted">The requested date is a request. The schedule is confirmed in the reviewed quote.</p>
          </div>
        </div>
        <aside class="qsum">
          <h2 class="t-h4">Keep track of it</h2>
          <p class="t-sm muted">You can manage quotes and orders in one place. Your request is saved either way — you do not need an account for us to reply.</p>
          <div class="btn-row qsum-act">
            <button class="btn btn--ghost btn--block" data-act="openMerchAcc">Set up account access</button>
            <button class="btn btn--quiet btn--block" data-go="public:products">Continue browsing</button>
          </div>
        </aside>
      </div>
    </div>
  </section>
  `, 'qdone');
}

/* ---- shared company and legal pages ------------------------------------ */
function pubAbout(){
  return pubShell(`
  ${pageHead('PAMUUC', 'Meet PAMUUC.',
    'Pamuk Studio S.L designs, develops and produces uniforms and branded merchandise from Barcelona. Two services share one workshop, one set of decoration rules and one standard of record keeping.')}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="grid grid-2 gap-lg">
        <div class="card">
          <div class="eyebrow">PAMUUC Studio</div>
          <h2 class="t-h3 card-t">Custom uniform development</h2>
          <p class="t-sm muted">Garments developed around your roles, fitted on your own people and archived as an approved specification so a reorder matches the first run.</p>
          <a class="lnk" data-go="public:custom">Explore custom uniforms</a>
        </div>
        <div class="card">
          <div class="eyebrow eyebrow-red">PAMUUC Merchandise</div>
          <h2 class="t-h3 card-t">Catalogue products, personalised</h2>
          <p class="t-sm muted">Clothing and accessories you select and configure, decorated in our workshop and quoted before anything is made.</p>
          <a class="lnk" data-go="public:merch">Browse merchandise</a>
        </div>
      </div>
      <div class="banner banner--wait banner--top"><div>
        <div class="banner-t">Company details are confirmed before publication</div>
        <div class="banner-d">Legal name, registration and tax identifiers, founding date and team information are published once verified. This prototype does not carry placeholder figures in their place.</div>
      </div></div>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'about');
}

function pubContact(){
  return pubShell(`
  ${pageHead('PAMUUC', 'Tell us what you need.',
    'Choose the service closest to your question, or say you are not sure. We read every message and reply to the address you give us.')}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="grid grid-2 gap-lg">
        <form class="stack-3" onsubmit="return false">
          <fieldset class="flt-g"><legend class="fld-l">What is this about?</legend>
            <div class="chip-row">
              ${[['studio','Custom uniforms'],['merch','Merchandise'],['unsure','Not sure which service']]
                .map(([v, n]) => `<button class="tab ${(UI.cSvc || 'unsure') === v ? 'tab--on' : ''}"
                  data-act="cSvc" data-v="${v}" aria-pressed="${(UI.cSvc || 'unsure') === v}">${n}</button>`).join('')}
            </div>
          </fieldset>
          ${[['c_name','Your name','text'],['c_email','Email','email'],['c_co','Company or organisation','text']]
            .map(([n, l, t]) => `<label class="fld"><span class="fld-l">${l}</span>
              <input class="inp" type="${t}" name="${n}" required></label>`).join('')}
          <label class="fld"><span class="fld-l">Your message</span>
            <textarea class="inp" name="c_msg" rows="4"
              placeholder="Tell us what you are trying to do and when you need it."></textarea></label>
          <div class="btn-row">
            <button class="btn btn--primary" data-act="contactSubmit">Send message</button>
          </div>
          <p class="t-xs muted">We use these details to respond to your enquiry.
            <a class="lnk" data-go="public:privacy">Read our Privacy Notice.</a></p>
        </form>
        <div class="stack-3">
          <div class="card">
            <div class="eyebrow">Direct routes</div>
            <p class="t-sm">A uniform project starts best with the brief — it asks the questions we would ask on a first call.</p>
            <div class="btn-row btn-row--top">
              <button class="btn btn--ghost btn--sm" data-go="public:form">Start your project brief</button>
              <button class="btn btn--quiet btn--sm" data-go="public:products">Browse merchandise</button>
            </div>
          </div>
          <div class="card">
            <div class="eyebrow">Where we are</div>
            <p class="t-sm muted">Barcelona, Spain.<br>Published contact details, hours and languages are confirmed before launch, so that anyone who calls reaches someone who can help in the language stated.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'contact');
}

function legalPage(page, title, intro, body){
  return pubShell(`
  ${pageHead('PAMUUC', title, intro)}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap read">
      <div class="stack-3">${body}</div>
    </div>
  </section>
  `, page);
}

function pubPrivacy(){
  return legalPage('privacy', 'Privacy notice',
    'What we collect when you enquire or request a quote, why, and how long we keep it.',
    `<div class="banner banner--wait"><div>
      <div class="banner-t">This notice is not yet the published version</div>
      <div class="banner-d">The controller, legal bases, recipients, retention periods and your rights are drafted with the business before any live form collects data. The structure below shows what the published notice must state.</div></div></div>
     ${[['What we collect','The contact details you enter, the enquiry or quote content, any files you attach, and basic technical information needed to deliver the site.'],
        ['Why we use it','To respond to your enquiry and prepare a quote. Responding to an enquiry is separate from marketing, which is optional and never required to receive a reply.'],
        ['How long we keep it','Defined retention periods per record type, set before launch.'],
        ['Your rights','Access, correction, erasure, restriction, objection and portability, with a named contact route.']]
       .map(([h, p]) => `<div class="card"><h2 class="t-h4 card-t">${h}</h2><p class="t-sm muted">${p}</p></div>`).join('')}`);
}
function pubCookies(){
  return legalPage('cookies', 'Cookie settings',
    'Accepting and refusing are offered at the same level. Requesting a quote works without any marketing tracker.',
    `<div class="card"><h2 class="t-h4 card-t">Categories</h2>
      <p class="t-sm muted">Strictly necessary cookies keep the site working and cannot be switched off. Any analytics or marketing category is off until you choose it, and can be withdrawn as easily as it was given.</p>
      <div class="btn-row btn-row--top">
        <button class="btn btn--ghost btn--sm" data-act="cookieStub">Accept all</button>
        <button class="btn btn--ghost btn--sm" data-act="cookieStub">Reject all</button>
        <button class="btn btn--quiet btn--sm" data-act="cookieStub">Manage categories</button>
      </div></div>
     <div class="banner banner--wait"><div><div class="banner-t">Actual categories are confirmed from the implementation</div>
       <div class="banner-d">The published list names each provider and purpose. It is generated from what the live site actually loads, not written in advance.</div></div></div>`);
}
function pubTerms(){
  return legalPage('terms', 'Terms',
    'The commercial terms that apply to a reviewed quote, an approval and a delivered order.',
    `<div class="banner banner--wait"><div><div class="banner-t">Terms are drafted with the business before launch</div>
      <div class="banner-d">Quote validity, approvals, payment, delivery, changes, personalised goods and issue handling differ between a custom uniform project and a merchandise order, so the two are stated separately rather than merged.</div></div></div>
     ${[['Merchandise orders','Quote validity, what an approval covers, payment before production release, delivery basis, and how defects and delivery problems are handled for personalised goods.'],
        ['Custom uniform projects','Project scope and included rounds, approval at each stage, production authorisation, and what a reorder against an approved specification means.']]
       .map(([h, p]) => `<div class="card"><h2 class="t-h4 card-t">${h}</h2><p class="t-sm muted">${p}</p></div>`).join('')}`);
}
function pubAccessibility(){
  return legalPage('accessibility', 'Accessibility',
    'What we are building towards, what has been checked, and how to tell us something does not work.',
    `<div class="card"><h2 class="t-h4 card-t">Target</h2>
      <p class="t-sm muted">WCAG 2.2 AA is the build target. Conformance is not claimed: the pages and flows have to be tested with assistive technology before any such statement is published.</p></div>
     <div class="card"><h2 class="t-h4 card-t">What has been checked in this prototype</h2>
      <p class="t-sm muted">Every route is walked in both themes at desktop and phone widths for horizontal overflow, text below the eleven pixel floor, images without alternative text, and content covered by a fixed action bar. That is a structural check, not an accessibility audit.</p></div>
     <div class="card"><h2 class="t-h4 card-t">Tell us</h2>
      <p class="t-sm muted">If something here cannot be operated, say so through the contact page and describe what happened. That report is treated as a defect, not feedback.</p>
      <div class="btn-row btn-row--top"><button class="btn btn--ghost btn--sm" data-go="public:contact">Contact us</button></div></div>`);
}
function pubNotFound(page){
  return pubShell(`
  ${pageHead('PAMUUC', 'We couldn’t find this page.',
    'The link may be out of date. Choose a service below, or search the merchandise catalogue.',
    {after:`<div class="btn-row btn-row--top">
      <button class="btn btn--primary" data-go="public:custom">Custom uniforms</button>
      <button class="btn btn--ghost" data-go="public:merch">Merchandise</button>
      <button class="btn btn--quiet" data-go="public:search">Search products</button></div>`})}
  `, page || 'home');
}

/* ---- Merchandise: one product ---------------------------------------- */

/* ---- one product, fully mapped -----------------------------------------
   THIS PRODUCT IS NOT REAL. It exists to show what the journey looks like
   when a single style carries the whole matrix rather than the matrix being
   spread across forty-four styles. Nothing here came from a supplier: the
   name, the reference and every price are written for the demonstration,
   which is why it is called a sample and marked on the page.

   Three segments, three fits, three weights — twenty-seven combinations,
   less the three that are deliberately absent, because a real matrix always
   has holes and a journey that never says "not in this one" teaches you
   nothing. The price is built from the choices rather than listed, so it
   moves for a reason you can read: heavier cloth costs more, a shaped cut
   costs a little more than a straight one.
   ========================================================================= */
/* Not every product can answer every question. A tote bag has no fit, so the
   fit step has no options — asked anyway, the gate would never clear and the
   page would be permanently locked. And where an axis has exactly one answer,
   asking it is a click that decides nothing. Both are settled here. */
/* The sheet is filled by hand, so the same garment style arrives as "T-Shirt"
   in one row and "t-shirt" in the next. They are descriptions, not names, so
   they read as sentence case — capital first, everything else as written,
   leaving real trademarks (TENCEL™) and hyphenated initials alone. */
const STYLE_KEEP = /^(TENCEL\u2122?|Modal|Oxford|Sherpa)$/;
function styleLabel(t){
  if(!t) return '';
  /* hyphens join words too: "Mid-Light" and "T-Shirt" each have two halves to
     settle, so every segment is judged on its own rather than just the first */
  const seg = (w) => STYLE_KEEP.test(w) ? w
    : (/^[A-Z]/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w);
  const out = String(t).trim().split(' ')
    .map(w => w.split('-').map(seg).join('-')).join(' ');
  /* whatever the first character turned out to be, the label opens in capital */
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function journeyPlan(p){
  const m = p.matrix || [];
  const gs = [...new Set(m.map(x => x.g).filter(Boolean))];
  const fs = [...new Set(m.map(x => x.f).filter(Boolean))];
  /* a question with one possible answer is not a question */
  return {genders:gs, fits:fs, needG:gs.length > 1, needF:fs.length > 1};
}
/* Fill in everything the product decides for itself, before anything is asked:
   the single gender a bag is made in, the single fit, and the garment when the
   answers above leave only one. What is left is what the page asks. */
function settleJourney(p){
  const c = UI.cfg; if(!c) return;
  const j = journeyPlan(p);
  /* an axis with one possible answer, or none at all, is not asked */
  c.g = j.genders.length === 1 ? j.genders[0] : (j.genders.length ? c.g : null);
  c.f = j.fits.length    === 1 ? j.fits[0]    : (j.fits.length    ? c.f : null);
  /* a garment that contradicts the answers above it is no longer the answer —
     this catches a stale selection arriving from a link or restored state */
  const held = demoRow(p, c.sku);
  if(held && ((c.g && !servesCut(c.g, held.g)) || (c.f && held.f !== c.f))) c.sku = null;
  const opts = demoOptions(p, c.g, c.f);
  if(opts.length === 1) c.sku = opts[0].sku;
  /* A settled garment answers every question above it. Without this the page
     could sit on a fully chosen garment while the Fit step still read
     "Choose" — 26 of the catalogue's combinations did exactly that, and it
     reads as a step you are not allowed to complete. */
  const row = demoRow(p, c.sku);
  /* Keep the answer they gave: picking a unisex garment while "Men" is the
     chosen audience must not silently rewrite the answer to "Unisex" — the
     garment serves the request either way. */
  if(row){
    if(row.g && !servesCut(c.g, row.g)) c.g = row.g;
    if(row.f) c.f = row.f;
  }
}

const demoRow = (p, sku) => (p.matrix || []).find(r => r.sku === sku);
const demoOptions = (p, g, f) => (p.matrix || []).filter(r => servesCut(g, r.g) && (!f || r.f === f));
/* The price a garment is quoted at anywhere on this page is the lowest it can
   be bought at — the same figure the card that led here showed. The price of a
   single piece belongs to the quantity ladder, not to a chip. */
const rowPrice = (r) => { const b = gLow(r); return b ? b.price : null; };

/* The chosen combination becomes the product's own price, so everything
   below the journey — the quantity breaks, the placement costs, the quote
   line — reads from one number rather than a second opinion. */
/* The product page carries the price of whichever garment is chosen, so this
   has to leave it in a correct state on EVERY path — including the one where
   the chosen garment has no rate. It used to update the ladder only when the
   garment had one, so picking a garment whose own card says "On request" left
   the cheapest other garment's price standing and quoted that instead. */
function applyDemoVariant(p){
  const c = UI.cfg || {};
  const row = demoRow(p, c.sku);
  if(!row){                                   /* nothing chosen yet: show the range's floor */
    const priced = (p.matrix || []).filter(m => m.breaks && m.breaks.length);
    if(priced.length){
      const lo = priced.reduce((a, b) => (a.price <= b.price ? a : b));
      p.from = lo.price; p.breaks = lo.breaks; p.quoteOnly = false;
    } else { p.from = null; p.breaks = []; p.quoteOnly = true; }
    return null;
  }
  if(row.breaks && row.breaks.length){
    /* the headline is the price of one, because the minimum is one */
    p.from = row.breaks[0].price; p.breaks = row.breaks; p.quoteOnly = false;
  } else {
    p.from = null; p.breaks = []; p.quoteOnly = true;
  }
  p.moq = 1; p.weight = String(row.w || '');
  if(c.qty == null || c.qty < 1) c.qty = 1;
  return row;
}

/* The three answers that decide which SKU this is. They sit in the
   configurator column, above the options they govern: each one collapses to
   its answer the moment it is given, so the column spends its height on the
   question being asked rather than on the ones already answered. Clicking a
   collapsed step reopens it. */
function demoSteps(p){
  const c = UI.cfg || {};
  const j = journeyPlan(p);
  /* the first question this product still has to ask */
  const open = c.open || ((j.needG && !c.g) ? 'g' : (j.needF && !c.f) ? 'f' : !c.sku ? 's' : null);
  /* steps are numbered by what is shown, not by a fixed 1-2-3 */
  let n = 0; const nextN = () => ++n;
  const lowest = (rs) => { const xs = rs.map(rowPrice).filter(v => v != null);
    return xs.length ? Math.min(...xs) : null; };
  const chip = (on, act, v, t, m, off) => `
    <button class="mch ${on ? 'mch--on' : ''} ${off ? 'mch--out' : ''}" data-act="${act}" data-v="${esc(v)}"
      aria-pressed="${!!on}"${off ? ' disabled' : ''}>
      <span class="mch-t">${esc(t)}</span>${m ? `<span class="mch-m">${esc(m)}</span>` : ''}</button>`;

  const step = (key, num, title, value, body) => `
    <div class="pdp-step pdp-step--q ${open === key ? 'is-open' : ''} ${value ? 'is-done' : ''}">
      <button class="step-h step-h--btn" data-act="dOpen" data-v="${key}"
        aria-expanded="${open === key}">
        <span class="step-n">${num}</span><span class="step-t">${title}</span>
        <span class="step-v">${value ? esc(value) : 'Choose'}</span>
      </button>
      ${open === key ? `<div class="mchs">${body}</div>` : ''}
    </div>`;

  /* Three garments sit behind each gender and fit. Who makes them is ours to
     know, so the card is the cloth weight and what it costs — plus the colour
     count and size range, which is what actually separates two options at the
     same weight. */
  const opts = demoOptions(p, c.g, c.f);
  const chosen = demoRow(p, c.sku);
  /* The sheet now names each garment's own style — "V-neck t-shirt", "Raglan-
     sleeve crewneck" — which is the thing that tells two options of the same
     weight apart. It is the garment's description, not the supplier's name.
     Where it is missing, fall back to numbering them. */
  const sig = (r) => [r.w, rowPrice(r), (r.colours||[]).length, (r.sizes||[]).join('/')].join('|');
  const seen = {};
  opts.forEach(r => { const k = sig(r); (seen[k] = seen[k] || []).push(r.sku); });

  /* Three t-shirts at 155 g/m² are not three weights, they are three cuts, and
     leading the card with the number made them look like the same thing listed
     thrice. The style leads; the weight becomes a position on a bar, so
     "thinner or thicker than the others" is readable without knowing what a
     gram per square metre feels like. The bar is relative to THIS list, so it
     never has to claim an absolute scale across bags, fleece and jersey. */
  const ws     = opts.map(r => +r.w).filter(Boolean);
  const wMin   = ws.length ? Math.min(...ws) : 0;
  const wMax   = ws.length ? Math.max(...ws) : 0;
  const spread = wMax > wMin;
  const wPos   = (r) => Math.round(((+r.w - wMin) / (wMax - wMin)) * 100);
  /* lightest first: the list then reads as a scale rather than a sheet order */
  const shown = opts.slice().sort((a, b) =>
    ((+a.w || 0) - (+b.w || 0)) || ((rowPrice(a) ?? 1e9) - (rowPrice(b) ?? 1e9)));

  const optCards = shown.map((r, ix) => {
    const pr = rowPrice(r);
    const on = c.sku === r.sku;
    const twin = seen[sig(r)].length > 1 && !r.style2;
    /* the noun is in the page heading; what is left is how it differs */
    const cut  = optionName(p, r, opts);
    const note = [weightNote(p, r, cut), compNote(r)].filter(Boolean).join(' ');
    const openNote = UI.gInfo === r.sku;
    const meta = [compOf(r), lineOf(p, r),
                  (r.colours || []).length ? (r.colours.length + ' colours') : '',
                  sizeRange(r.sizes)].filter(Boolean).join(' · ');
    return `
    <button class="gopt ${on ? 'gopt--on' : ''}" data-act="dSku" data-v="${esc(r.sku)}"
      aria-pressed="${on}" aria-label="${esc(cut + '. ' + meta + (note ? '. ' + note : ''))}">
      <span class="gopt-t">${esc(cut)}${
        twin ? `<em class="gopt-x">Option ${ix + 1}</em>` : ''}${
        note ? `<span class="gopt-q ${openNote ? 'gopt-q--on' : ''}" data-act="gInfo"
          data-v="${esc(r.sku)}" role="img"
          aria-label="What ${esc(cut)} means">?</span>` : ''}</span>
      <span class="gopt-wq">
        <span class="gopt-w">${r.w
          ? esc(r.w) + ' <i>g/m²</i>' + (() => {
              const ww = weightWord(p, r);
              /* The supplier may already call it heavyweight while our own
                 scale, read against this product's range, calls it mid — and
                 "Heavyweight … Mid-weight" on one card reads as a fault. Where
                 the name carries a weight already, it is the one that speaks. */
              if(!ww || /light|mid|heavy|weight/i.test(cut)) return '';
              return ' <i>· ' + esc(ww) + '</i>';
            })()
          : 'Weight to confirm'}</span>
        ${spread && r.w ? `<span class="gopt-bar" aria-hidden="true">
          <i style="left:${wPos(r)}%"></i></span>` : ''}
      </span>
      ${meta ? `<span class="gopt-m">${esc(meta)}</span>` : ''}
      ${openNote && note ? `<span class="gopt-i">${esc(note)}</span>` : ''}
      ${r.provisional ? `<span class="gopt-f">Indicative</span>` : ''}
      <span class="gopt-p num">${pr != null ? `<em>From</em>${money(pr)}`
        : '<span class="gopt-r">Price on request</span>'}</span>
    </button>`;}).join('');

  /* one legend for the column, rather than a label on every bar */
  const optScale = spread ? `
    <div class="gopt-key"><span>Lighter</span><i></i><span>Heavier</span>
      <em>${wMin}–${wMax} g/m²</em></div>` : '';

  const out = [];
  if(j.needG) out.push(step('g', nextN(), 'Who wears it', c.g ? genderName(c.g) : null,
      GENDERS.map(x => x.k).filter(k => j.genders.includes(k)).map(k => {
        const rs = demoOptions(p, k, null); const lo = lowest(rs);
        return chip(c.g === k, 'dGender', k, genderName(k),
          lo != null ? 'From ' + money(lo) : 'Price on request', false); }).join('')));

  if(j.needF) out.push(step('f', nextN(), 'Fit', c.f ? fitName(c.f) : null,
      FITS.map(x => x.k).filter(k => j.fits.includes(k)).map(k => {
        const rs = demoOptions(p, c.g, k); const lo = lowest(rs);
        return chip(c.f === k, 'dFit', k, fitName(k),
          !rs.length ? 'Not in this cut' : lo != null ? 'From ' + money(lo) : 'Price on request',
          !rs.length); }).join('')));

  out.push(step('s', nextN(), 'The garment', chosen
      ? [optionName(p, chosen, opts), chosen.w ? chosen.w + ' g/m²' : '']
          .filter(Boolean).join(' · ') || 'Chosen'
      : null,
    opts.length ? optScale + `<div class="gopts">${optCards}</div>`
      : (c.g || c.f)
        /* They answered, and the answers happen to meet on nothing. Repeating
           "choose who wears it and the fit" to someone who just did reads as
           the page ignoring them — so say what is actually true and give them
           the way out. */
        ? `<p class="opt-hint">Nothing in this range is made ${
              c.g ? 'as a ' + (CUT_FOR[c.g] || genderName(c.g)).toLowerCase() : ''}${
              c.g && c.f ? ' in a ' : ''}${c.f ? fitName(c.f).toLowerCase() : ''}.
            Change either answer above and the garments appear here.</p>
          <div class="btn-row">
            ${c.f ? `<button class="btn btn--ghost btn--sm" data-act="dFit" data-v="">Any fit</button>` : ''}
            ${c.g ? `<button class="btn btn--quiet btn--sm" data-act="dOpen" data-v="g">Change who wears it</button>` : ''}
          </div>`
        : `<p class="opt-hint">Choose who wears it and the fit, and the garments made that way appear here.</p>`));
  return out.join('');
}

/* The size run, offered wherever a quantity is asked for — priced products and
   quote-only ones alike, since a manual quote still needs to know the run.
   A garment that comes in one size has nothing to split. */
function sizeSplitPanel(cfg, sizes, splitN){
  if(!sizes || sizes.length < 2) return '';
  const open = !!(cfg.splitOpen || splitN);
  const pairs = splitPairs(cfg);
  return `
    <div class="szp">
      <button class="szp-h" data-act="cfgSplitOpen" aria-expanded="${open}">
        <span>Split it by size</span>
        <em>${splitN ? pcs(splitN) + ' across ' + pairs.length + ' size'
             + (pairs.length === 1 ? '' : 's') : 'Optional'}</em>
        <i aria-hidden="true">${open ? '−' : '+'}</i>
      </button>
      ${open ? `
      <div class="szp-b">
        <div class="szg">
          ${sizes.map(sz => `
          <label class="szg-i">
            <span class="szg-l">${esc(sz)}</span>
            <input class="inp szg-n" type="number" inputmode="numeric" min="0" step="1"
              id="sz_${esc(sz).replace(/[^A-Za-z0-9]/g, '_')}"
              value="${(cfg.split && cfg.split[sz]) || ''}" placeholder="0"
              data-act="cfgSize" data-s="${esc(sz)}"
              aria-label="Quantity in size ${esc(sz)}">
          </label>`).join('')}
        </div>
        <div class="szp-f">
          <span class="t-xs muted">${splitN
            ? 'Quantity follows this split. ' + pcs(splitN) + ' in total.'
            : 'Leave it blank and tell us the sizes later — the quantity above still applies.'}</span>
          ${splitN ? `<button class="btn btn--quiet btn--sm" data-act="cfgSplitClear">Clear sizes</button>` : ''}
        </div>
      </div>` : ''}
    </div>`;
}

function pubProduct(id){
  const p = by(S.merchProducts, id);
  if(!p) return pubShell(pageHead('Merchandise', 'That product does not exist.',
    'The link may be out of date. Every product in the catalogue is listed on the all-products page.',
    {red:true, after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:products">Browse all products</button></div>`}), 'products');
  const IM = p.img || {};
  const imgs = (p.imgOrder || []).filter(c => IM[c]);
  const rc = S.decoRates;

  /* Arriving from a garment listing: open on that garment rather than on the
     first question — the three answers are implied by the link that was
     followed. Set before cfg is bound, so the line below simply keeps it. */
  if(ROUTE.params && ROUTE.params.sku){
    const want = demoRow(p, ROUTE.params.sku);
    if(want && (!UI.cfg || UI.cfg.id !== id || UI.cfg.sku !== want.sku)){
      UI.cfg = {id, g:want.g, f:want.f, sku:want.sku, qty:1,
        colour:(want.colours && want.colours[0]) || p.colours[0],
        placements:[{pos:(want.pos || p.pos)[0], method:(want.pers || p.pers)[0],
                     size:'small', colours:1, art:null}], open:null};
    }
  }
  const cfg = UI.cfg = UI.cfg && UI.cfg.id === id ? UI.cfg : {
    id, colour:(imgs[0] || p.colours[0]), qty:1,
    placements:[{pos:p.pos[0], method:p.pers[0], size:'small', colours:1, art:null}],
  };
  /* Settle what the product decides for itself BEFORE anything reads the
     chosen garment: a choice that narrows the options to one garment settles
     on that garment in the same render, so the price, colours and sizes below
     are that garment's and not the range's. */
  if(p.matrix) settleJourney(p);
  /* a mapped style prices from its chosen combination, not from a base rate */
  const mRow = p.matrix ? applyDemoVariant(p) : null;
  /* The headline is the same number the card that led here showed: the lowest
     this can be bought at. Before a garment is chosen that is the product's
     floor, after it is that garment's own — so the figure narrows as the
     choices narrow, and never jumps upward on arrival. What the quantity in
     hand actually costs is the ladder and the ticket below. */
  const lowNow = mRow ? gLow(mRow) : catFrom(p);
  /* Colours, sizes, methods and placements belong to the garment, not to the
     page: a Roly tee and a Stanley tee under the same heading carry different
     ones. Until a garment is chosen the page shows the union across all of
     them, which is what the catalogue and the filters index. */
  const P_COLS  = mRow && mRow.colours && mRow.colours.length ? mRow.colours : p.colours;
  const P_PERS  = mRow && mRow.pers    && mRow.pers.length    ? mRow.pers    : p.pers;
  const P_POS   = mRow && mRow.pos     && mRow.pos.length     ? mRow.pos     : p.pos;
  const P_SIZES = mRow && mRow.sizes   && mRow.sizes.length   ? mRow.sizes   : (p.sizes || []);
  const mReady = !p.matrix || !!demoRow(p, cfg.sku);
  /* animate only the moment it opens, not on every later keystroke */
  const mJustOpen = mReady && UI.mOpened !== p.id;
  UI.mOpened = mReady ? p.id : null;
  const mLock = mReady ? '' : 'pdp-step--locked';
  const mInert = mReady ? '' : ' inert';
  /* Colour, Quantity and Personalisation continue the numbering, so a product
     that asks two questions does not label its fourth step "5". */
  const mSteps = p.matrix ? (() => { const j = journeyPlan(p);
    return (j.needG ? 1 : 0) + (j.needF ? 1 : 0) + 1; })() : 0;
  const mN = (i) => i + mSteps;
  if(!P_COLS.includes(cfg.colour)) cfg.colour = P_COLS[0];
  /* the same guard for the placement, whose method or position may not exist
     on the garment that was just chosen */
  cfg.placements.forEach(pl => {
    if(!P_PERS.includes(pl.method)) pl.method = P_PERS[0];
    if(!P_POS.includes(pl.pos))     pl.pos    = P_POS[0];
  });

  /* A split cannot hold sizes the chosen garment does not come in, so changing
     garment prunes it rather than silently quoting a size that does not exist. */
  if(cfg.split){
    Object.keys(cfg.split).forEach(k => { if(!P_SIZES.includes(k)) delete cfg.split[k]; });
    if(!Object.keys(cfg.split).length) delete cfg.split;
  }
  const splitN = splitTotal(cfg);
  if(splitN > 0) cfg.qty = splitN;

  const q = rc && !p.quoteOnly ? quoteLines(p, rc, cfg) : null;
  /* The branded presentation is one charge for the whole request, not for this
     line, so it is offered on the quote and the checkout rather than here. */
  /* the garment decides the photograph, not just the colour: a 155 g/m²
     V-neck and a 220 g/m² boxy tee are both "Black" and are not the same shot */
  const view = VIEW_ALIAS[cfg.view] || cfg.view || 'studio-01';
  /* The photograph on show, and the colour it actually is. The two part company
     before a garment is chosen, when the picture stands for the whole range and
     the configuration has not settled on a colour yet — so the label has to
     follow the photograph rather than the configuration. */
  const hero = (() => {
    if(mRow){
      const u = garmentPhoto(mRow.sku, cfg.colour, view);
      if(u) return {src: u, colour: cfg.colour};
    }
    const pick = productShot(p, view);
    if(pick) return pick;
    return {src: IM[cfg.colour] || (imgs.length ? IM[imgs[0]] : null) || PLACEHOLDER,
            colour: cfg.colour};
  })();
  const shot = hero.src;
  const first = (p.breaks||[])[0];
  const used = cfg.placements.map(x => x.pos);
  const canAdd = cfg.placements.length < 3 && P_POS.some(x => !used.includes(x));
  const xp = 1;

  /* cost of one placement as configured, above what the price already covers */
  const extraFor = (pl, i) => {
    if(!rc) return 0;
    const full = placementUnit(rc, pl, cfg.qty);
    return Math.max(0, full - includedUnit(rc, cfg.qty, i));
  };

  return pubShell(`
  <section class="pub-sec pub-sec--flush pdp-sec">
    <div class="pub-wrap">
      <nav class="crumb pdp-crumb">${crumb(
        [['Merchandise','merch'], ['All products','products'],
         ...(p.cat ? [[esc(catName(p.cat)), 'collection:' + catSlug(p.cat)]] : [])], p.name)}</nav>

      <div class="pdp">
        <!-- the product ------------------------------------------------ -->
        <div class="pdp-media">
          ${(() => {
            /* not every colour was shot from both angles — offer only what exists */
            const have = PHOTO_VIEWS.filter(([v]) => mRow
              ? garmentPhoto(mRow.sku, cfg.colour, v) : productPhoto(p, v));
            return have.length > 1 ? `
          <div class="pdp-views" role="group" aria-label="View">
            ${have.map(([v, label]) => `
              <button class="pdp-view ${v === view ? 'on' : ''}" data-act="cfgView" data-v="${v}"
                aria-pressed="${v === view}">${label}</button>`).join('')}
          </div>` : ''; })()}
          <div class="pdp-hero media${shot === PLACEHOLDER ? ' pdp-hero--ph' : ''}">
            ${shot ? `<img src="${shot}" alt="${esc(p.name)}${COLOURS[hero.colour] ? ' in ' + esc(COLOURS[hero.colour].name) : ''}">`
                   : `<span class="pdp-glyph">${p.glyph}</span>`}
          </div>
          ${(() => {
            /* the rail follows the garment: its own colours, its own photographs */
            const rail = mRow
              ? (mRow.colours || []).map(c => [c, garmentPhoto(mRow.sku, c, 'packshot-front')])
                  .filter(x => x[1])
              : imgs.map(c => [c, IM[c]]);
            return rail.length > 1 ? `<div class="pdp-rail">
            ${rail.slice(0,12).map(([c, u]) => `
              <button class="pdp-thumb ${c===cfg.colour?'on':''}" data-act="cfgColour" data-c="${c}"
                aria-label="${esc(COLOURS[c]?COLOURS[c].name:c)}"><img src="${u}" alt="" loading="lazy"></button>`).join('')}
          </div>` : ''; })()}
          <div class="place-map">
            <div class="place-map-h">
              <span class="fgrp-l">Where your identity goes</span>
              <span class="t-xs muted">${cfg.placements.length} of 3</span>
            </div>
            <div class="place-grid">
              ${P_POS.map(x => {
                const ix = used.indexOf(x);
                const full = ix === -1 && cfg.placements.length >= 3;
                return `<button class="place-cell ${ix>-1?'on':''}" data-act="togglePlace" data-p="${x}"
                  ${full?'disabled':''}>
                  <span class="place-n">${ix>-1 ? ix+1 : '+'}</span>
                  <span>${esc(S.positions_lib[x]||x)}</span></button>`;}).join('')}
            </div>
          </div>
        </div>

        <!-- what you decide -------------------------------------------- -->
        <div class="pdp-cfg">
          <span class="tag tag--merch tag--plain" data-go="public:collection:${merchSlug(p.cat)}">${esc(catName(p.cat))}</span>
          <h1 class="display pdp-t">${esc(p.name)}</h1>
          <!-- The reference is ours, not theirs; the colour count is the swatch
               grid a few centimetres below; the minimum is stated where the
               quantity is asked for. What is left is what a buyer reads. -->
          <div class="pdp-meta">
            ${weightLabel(p, mRow) ? `<span>${esc(weightLabel(p, mRow))}</span>` : ''}
            ${mRow && clothWords(mRow).length
              ? `<span>${esc(clothWords(mRow).join(' · '))}</span>` : ''}
            ${mRow && P_SIZES.length ? `<span>Sizes ${esc(sizeRange(P_SIZES))}</span>`
              : (p.matrix ? `<span>Sizes vary by garment</span>` : '')}
          </div>
          ${lowNow ? `<div class="pdp-from"><span class="pdp-from-l">From</span>
            <b>${money(lowNow.price)}</b>
            <span>per piece · product only, excl. VAT</span></div>`
            : `<div class="pdp-from"><b>Price on request</b>
            <span>quoted when your request is reviewed</span></div>`}
          ${(() => { const d = [leadSentence(p.desc), specSentence(p)].filter(Boolean).join(' ');
            return d.length > 24 ? `<p class="pdp-desc">${esc(d)}</p>` : ''; })()}

          ${p.matrix ? demoSteps(p) : ''}
          ${p.matrix && !mReady ? `<p class="pdp-gate">Answer the ${nWord(mSteps)} above and the rest of the
            page opens against that cloth — each one is a different reference, with its own colours,
            sizes and price.</p>` : ''}

          ${!mReady ? '' : `<div class="pdp-rest ${mJustOpen ? 'pdp-rest--in' : ''}">
          <div class="pdp-step ${mLock}"${mInert}>
            <div class="step-h"><span class="step-n">${mN(1)}</span><span class="step-t">Colour</span>
              <span class="step-v">${esc(COLOURS[cfg.colour]?COLOURS[cfg.colour].name:cfg.colour)}</span></div>
            <div class="sw-grid">
              ${P_COLS.map(c => `<button class="pdp-sw ${c===cfg.colour?'on':''}" data-act="cfgColour"
                data-c="${c}" title="${esc(COLOURS[c]?COLOURS[c].name:c)}"
                style="background:${COLOURS[c]?COLOURS[c].hex:'#ccc'}"></button>`).join('')}
            </div>
          </div>

          ${p.quoteOnly ? '' : `
          <div class="pdp-step ${mLock}"${mInert}>
            <div class="step-h"><span class="step-n">${mN(2)}</span><span class="step-t">Quantity</span>
              <span class="step-v">${pcs(cfg.qty)}</span></div>
            ${p.breaks.length > 1 ? `
            <div class="qgrid">
              ${p.breaks.map(b => {
                const save = first && first.price ? Math.round((1 - b.price/first.price)*100) : 0;
                return `<button class="qcard ${b.qty===cfg.qty?'on':''} ${splitN?'qcard--off':''}"
                  data-act="cfgQtyTier" data-q="${b.qty}"${splitN?' disabled':''}>
                  <b class="num">${b.qty}</b>
                  <span class="num">${money(b.price)}</span>
                  <em>${save>0?'−'+save+'%':''}</em></button>`;}).join('')}
            </div>` : ''}
            <div class="qx">
              <label class="qx-f"><span class="fld-l">${splitN ? 'Total from your sizes' : 'Exact quantity'}</span>
                <input class="inp qx-i" type="number" inputmode="numeric" min="${p.moq}" step="1"
                  id="cfgqty" value="${cfg.qty}" data-act="cfgQtyExact" aria-describedby="qtyhint"
                  ${splitN ? 'readonly' : ''}></label>
              ${q ? `<div class="qx-r"><span class="fld-l">At this quantity</span>
                <b class="num">${money(q.base * xp)} <em>per piece</em></b></div>` : ''}
            </div>

            ${sizeSplitPanel(cfg, P_SIZES, splitN)}
            <p class="opt-hint" id="qtyhint">Minimum ${p.moq} piece${p.moq === 1 ? '' : 's'}. ${
              p.breaks.length > 1
                ? 'The tiers are shortcuts — type any number and the price follows it.'
                : 'The price does not move with quantity on this one, so tell us the exact number you need.'
              } What is shown is per piece for the garment
              with the included spec, before personalisation and before VAT; sizes are split later.</p>
          </div>`}
          ${p.quoteOnly ? `
          <div class="pdp-step">
            <div class="step-h"><span class="step-n">${mN(2)}</span><span class="step-t">Quantity</span>
              <span class="step-v">${pcs(cfg.qty)}</span></div>
            <!-- With no tiers above it this field is the whole step, so it gets
                 the same panel the priced products give it rather than the small
                 generic one it had, which read as an afterthought. -->
            <div class="qx qx--solo">
              <label class="qx-f"><span class="fld-l">${splitN ? 'Total from your sizes' : 'How many do you need?'}</span>
                <input class="inp qx-i" type="number" inputmode="numeric" min="1" step="1"
                  id="cfgqty" value="${cfg.qty}" data-act="cfgQtyExact" aria-describedby="qtyhintq"
                  ${splitN ? 'readonly' : ''}></label>
              <div class="qx-r"><span class="fld-l">Price</span>
                <b class="num">On request</b></div>
            </div>
            ${sizeSplitPanel(cfg, P_SIZES, splitN)}
            <p class="opt-hint" id="qtyhintq">We price this one by hand, so there are no quantity tiers to
              choose between — tell us how many you need and we will quote it, usually within a working day.</p>
          </div>` : ''}

          <div class="pdp-step pdp-step--pers ${mLock}"${mInert}>
            <!-- Quantity is a step whether or not the price is quoted, so it
                 takes the same number either way and this one follows it. -->
            <div class="step-h"><span class="step-n">${mN(3)}</span>
              <span class="step-t">Personalisation</span>
              <span class="step-v">${cfg.placements.length} placement${cfg.placements.length>1?'s':''} · ${
                 esc(includedShort(S.decoRates))}</span></div>

            ${cfg.placements.map((pl, i) => {
              const extra = extraFor(pl, i);
              /* One placement needs no frame of its own — the step is already a
                 box, and a box inside a box costs a header and two paddings for
                 nothing. Two or three do need separating, so they keep cards. */
              const solo = cfg.placements.length === 1;
              /* Named for a screen reader: on its own the control announces only
                 its current value, and "Front" says nothing about what it sets. */
              const sel = `<select class="inp inp--sm" data-act="plPos" data-i="${i}" style="flex:1"
                    aria-label="Where placement ${i + 1} goes">
                    ${P_POS.map(x => `<option value="${x}" ${x===pl.pos?'selected':''}
                      ${used.includes(x)&&x!==pl.pos?'disabled':''}>${esc(S.positions_lib[x]||x)}</option>`).join('')}
                  </select>`;
              const cost = `<span class="t-sm num ${extra>0.004?'':'muted'}">${
                    extra>0.004?'+'+money(extra):'included'}</span>`;
              return `
              <div class="${solo ? 'place-flat' : 'place-card'}">
                ${solo ? `<div class="orow"><span class="opt-lbl">Placement</span>
                  <div class="ochips ochips--sel">${sel}${cost}</div></div>`
                : `<div class="place-card-h">
                  <span class="place-badge">${i+1}</span>
                  ${sel}${cost}
                  <button class="btn btn--quiet btn--sm" data-act="rmPlace" data-i="${i}">Remove</button>
                </div>`}
                <div class="place-opts">
                  <div class="orow"><span class="opt-lbl">Method</span>
                    <div>
                      <div class="ochips">
                        ${P_PERS.map(m => `<button class="ochip ${m===pl.method?'on':''} ${
                          methodQuoteOnly(rc, m) ? 'ochip--q' : ''}"
                          data-act="plMethod" data-i="${i}" data-m="${m}"
                          aria-pressed="${m===pl.method}">${esc(methodShort(m))}${
                          methodQuoteOnly(rc, m) ? '<span class="ochip-q">on request</span>' : ''}</button>`).join('')}
                      </div>
                      <p class="ometa"><span>${esc(methodFull(pl.method))} — ${
                          esc((methodCost(pl.method)).toLowerCase())}</span>
                        <button class="lnk mhelp-a" data-act="mHelp" aria-expanded="${!!UI.mHelp}">${
                          UI.mHelp ? 'Hide' : 'What are these?'}</button></p>
                      ${UI.mHelp ? methodHelp(P_PERS) : ''}
                    </div></div>
                  <div class="orow"><span class="opt-lbl">Size</span>
                    <div class="ochips">
                      ${['small','medium','large'].map(z => `<button class="ochip ${z===pl.size?'on':''}"
                        data-act="plSize" data-i="${i}" data-z="${z}">${z[0].toUpperCase()+z.slice(1)}</button>`).join('')}
                      <span class="ochips-n">${pl.size==='small'?'up to 99 mm'
                        :pl.size==='medium'?'100–150 mm':'over 150 mm'}</span>
                    </div></div>
                  ${pl.method === 'screen' ? `
                  <div class="orow"><span class="opt-lbl">Ink colours</span>
                    <div class="ochips">
                      ${[1,2,3,4].map(n => `<button class="ochip ${n===pl.colours?'on':''}"
                        data-act="plColours" data-i="${i}" data-n="${n}">${n}</button>`).join('')}
                    </div></div>` : ''}
                  <div class="orow"><span class="opt-lbl">Artwork</span>
                    ${pl.art
                      ? `<div class="art-on"><span>▣ ${esc(pl.art)}</span>
                          <button class="btn btn--quiet btn--sm" data-act="plArtClear" data-i="${i}">Replace</button></div>`
                      : `<button class="art-line" data-act="plArt" data-i="${i}"
                          title="Vector preferred — AI, EPS, PDF or SVG.">Upload your logo
                          <span>vector preferred, or send it later</span></button>`}
                  </div>
                </div>
              </div>`;}).join('')}

            ${canAdd ? `<div class="orow orow--add"><span></span><div><button class="lnk" data-act="addPlace">
              + Add placement ${cfg.placements.length + 1} of 3</button></div></div>`
              : `<p class="opt-hint">${cfg.placements.length >= 3
                  ? 'Three placements is the maximum on one garment.'
                  : 'Every placement on this product is in use.'}</p>`}
          </div>

          ${p.quoteOnly ? `
          <div class="pdp-sum">
            <div class="chip">Price on request</div>
            <p class="t-sm muted" style="margin-top:10px">We hold no standing cost for this one, so it is
              priced when your request is reviewed. Add it to your quote with the quantity and personalisation
              you need and the amount comes back with the reviewed quote.</p>
          </div>`
          : `<div class="pdp-sum">
            <div class="eyebrow">Your quote</div>
            <div style="margin-top:12px">
              ${q.lines.map(l => `<div class="sum-row">
                <span><span class="med">${esc(l.label)}</span><span class="sum-note">${esc(l.note)}</span></span>
                <span class="num">${l.quote ? '<span class="chip">quoted</span>'
                  : l.unit >= 0.005 ? money(l.unit) : 'included'}</span></div>`).join('')}
              <div class="sum-row sum-sep"><span class="med">Per piece</span>
                <span class="num med">${money(q.unit * xp)}</span></div>
              <div class="sum-row sum-row--sub"><span class="muted">× ${cfg.qty} piece${cfg.qty === 1 ? '' : 's'}</span>
                <span class="num">${money(q.goods * xp)}</span></div>
              ${q.setup.map(su => `<div class="sum-row">
                <span class="muted">${esc(su.name)}${su.plain ? '' : ' setup'}<span class="sum-note">${
                  esc(su.note || 'one-off, per job — not per piece')}</span></span>
                <span class="num">${su.unknown ? '<span class="chip">quoted</span>' : money(su.cost)}</span></div>`).join('')}
              <div class="sum-total"><span>Total</span><span class="num">${money(q.total * xp)}</span></div>
              <div class="sum-eff">${money(q.effective * xp)} per piece with the setup spread over ${pcs(cfg.qty)} · excludes VAT</div>
            </div>
            <div class="sum-row sum-sep"><span class="muted">Setup charges</span>
              <span class="num">${q.setup.length ? 'shown above' : 'none for this configuration'}</span></div>
            <div class="sum-row"><span class="muted">Delivery</span>
              <span class="num">confirmed in the reviewed quote</span></div>
            <div class="sum-row"><span class="muted">Tax</span><span class="num">excl. VAT</span></div>
            <div class="pdp-deliver">
              <div class="sum-row"><span class="muted">Estimated production</span>
                <span class="num med">${esc(p.lead)} from approval</span></div>
              <p class="sum-eff pdl-n">Production time is not an arrival date — destination and schedule are
                confirmed with the quote. <button class="lnk pdl-a" data-act="askEarlier">Need it
                sooner?</button></p>
            </div>
          </div>`}

          <button class="btn btn--primary btn--lg btn--block" style="margin-top:16px"
            data-act="addToQuote" data-id="${p.id}">${UI.editLine != null ? 'Update this line' : 'Add to quote'}</button>
          <button class="btn btn--ghost btn--block" style="margin-top:8px" data-act="artHelp" data-id="${p.id}">
            Request help with this item</button>
          <div class="nopay">
            <p class="nopay-t">There is no checkout on this site.</p>
            <p class="nopay-d">Adding this builds a request, not an order. Nothing is charged here and no card is
              asked for. We read it, check the artwork, the stock and the dates, and send back a quote you can
              accept or ignore — usually within one working day.</p>
          </div>
          </div>`}
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight">
    <div class="pub-wrap">
      <div class="pdp-tabs">
        ${['Specification','Decoration limits','Sizes & colours','How it works'].map(t =>
          `<button class="tab ${(UI.pdpTab||'Specification')===t?'tab--on':''}"
            data-act="pdpTab" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      ${pdpTabBody(p, p.deco || [])}
    </div>
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secHead('—', 'More in ' + esc(catName(p.cat).toLowerCase()), 'The rest of the collection.',
        catList(p.cat).length + ' products in ' + esc(catName(p.cat).toLowerCase()) + ', on the same basis.',
        {merch:true, left:true,
         after:`<div class="shd-a" data-go="public:collection:${merchSlug(p.cat)}">${arrow('View the collection')}</div>`})}
      <div class="pgrid pgrid--4">
        ${S.merchProducts.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4).map(pcard).join('')}
      </div>
    </div>
  </section>

  ${(() => {
    const other = S.merchProducts.filter(x => x.cat !== p.cat && prodImg(x));
    const pick = ['Accessories','T-shirts','Sweatshirts','Outerwear','Polos']
      .filter(c => c !== p.cat)
      .map(c => other.find(x => x.cat === c)).filter(Boolean).slice(0, 4);
    const list = pick.length ? pick : other.slice(0, 4);
    return `
  <section class="pub-sec pub-sec--warm">
    <div class="pub-wrap">
      ${secHead('—', 'Goes well with', 'Across the catalogue.',
        'Products that take the same mark in a different place.', {merch:true, left:true})}
      <div class="pgrid pgrid--4">${list.map(pcard).join('')}</div>
    </div>
  </section>`;})()}

  ${reviewsSlot()}

  ${faqSection('merch', '—')}

  ${!mReady ? '' : `<div class="buybar">
    <div class="buybar-in">
      <div class="buybar-fig">
        <b class="num">${p.quoteOnly ? 'Price on request' : money(q.total * xp)}</b>
        <span>${p.quoteOnly ? 'quoted within a working day'
          : money(q.effective * xp) + ' per piece · ' + pcs(cfg.qty) + ' · '
            + cfg.placements.length + ' placement' + (cfg.placements.length>1?'s':'')}</span>
      </div>
      <span class="spacer"></span>
      <button class="btn btn--primary" data-act="addToQuote" data-id="${p.id}">
        ${UI.editLine != null ? 'Update this line' : 'Add to quote'}</button>
    </div>
  </div>`}
  `, 'product');
}

function pdpTabBody(p, decoRows){
  const tab = UI.pdpTab || 'Specification';
  if(tab === 'Decoration limits') return `
    <div class="tw"><table class="tbl">
      <thead><tr><th>Placement</th><th>Method</th><th class="tnum">Max width</th>
        <th class="tnum">Max height</th><th class="tnum">Max colours</th><th>Artwork</th></tr></thead>
      <tbody>${decoRows.length ? decoRows.map(d => `<tr>
        <td class="med">${esc(S.positions_lib[d.position]||d.position)}</td>
        <td>${esc((S.personalization[d.method]||{}).name||d.method)}</td>
        <td class="tnum num">${d.w||'—'} mm</td><td class="tnum num">${d.h||'—'} mm</td>
        <td class="tnum num">${d.colours||'—'}</td><td class="t-xs">${esc(d.artwork||'')}</td></tr>`).join('')
        : '<tr><td colspan="6" class="tbl-empty">No decoration limits recorded for this product.</td></tr>'}
      </tbody></table></div>
    <p class="t-xs muted" style="margin-top:12px">Maximums are the printable area, not a recommendation.
      We proof every placement before production.</p>`;

  if(tab === 'Sizes & colours') return `
    <div class="grid grid-2" style="align-items:start">
      <div class="card"><div class="eyebrow">Sizes</div>
        <div class="wrap-row" style="margin-top:12px;gap:6px">
          ${(p.sizes||[]).map(z => `<span class="chip">${esc(z)}</span>`).join('') || '<span class="t-sm muted">One size</span>'}
        </div>
        <p class="t-xs muted" style="margin-top:12px">Size splits are confirmed on the order, not now.
          Larger sizes may carry a surcharge, shown on the quote.</p></div>
      <div class="card"><div class="eyebrow">Colours — ${p.colours.length}</div>
        <div class="stack-2" style="margin-top:12px">
          ${p.colours.map(c => `<div class="row" style="gap:8px">
            <span class="sw" style="background:${COLOURS[c]?COLOURS[c].hex:'#ccc'}"></span>
            <span class="t-sm">${esc(COLOURS[c]?COLOURS[c].name:c)}</span>
            <span class="spacer"></span><span class="mono-ref">${(COLOURS[c]||{}).ss||''}</span></div>`).join('')}
        </div></div>
    </div>`;

  if(tab === 'How it works') return `
    <div class="grid grid-4">
      ${[['01','Configure and request','Pick the colour, the quantity and where your identity goes. Send it as a quote request — nothing is ordered.'],
         ['02','Proof within a day','We come back with a firm price and a placement proof showing your artwork at real size on the garment.'],
         ['03','You approve','Approve the proof and the price. That approval is what authorises production, and it is recorded.'],
         ['04','Production and delivery','Made, quality-checked and shipped. Your artwork stays on file, so the next run matches this one.']]
        .map(([n,h,t]) => `<div class="card"><div class="eyebrow">${n}</div>
          <div class="t-h5" style="margin-top:8px">${h}</div>
          <p class="t-sm muted" style="margin-top:8px">${t}</p></div>`).join('')}
    </div>
    <div class="banner" style="margin-top:20px"><div>
      <div class="banner-t">Setup is charged once, not per piece</div>
      <div class="banner-d">Embroidery setup is €35 and screen setup €40, per job. Reorder the same
        artwork later and you do not pay it again.</div></div></div>`;

  return `
    <div class="grid grid-2" style="align-items:start">
      <div class="card">
        <div class="eyebrow">Specification</div>
        <dl class="kv" style="margin-top:12px">
          <dt>PAMUUC reference</dt><dd class="num">${p.ref}</dd>
          <dt>Category</dt><dd>${esc(p.cat)}</dd>
          ${p.weight ? `<dt>Weight</dt><dd>${p.weight} g/m²</dd>` : ''}
          ${p.materials ? `<dt>Composition</dt><dd>${esc(p.materials)}</dd>` : ''}
          <dt>Colours</dt><dd>${p.colours.length}</dd>
          <dt>Sizes</dt><dd>${(p.sizes||[]).length || 1}</dd>
          <dt>Minimum order</dt><dd>${pcs(p.moq)}</dd>
          <dt>Lead time</dt><dd>${esc(p.lead)} from artwork approval</dd>
          <dt>Personalisation</dt><dd>${p.pers.map(m=>(S.personalization[m]||{}).name||m).join(', ')}</dd>
        </dl>
      </div>
      <div class="card">
        <div class="eyebrow">What the price includes</div>
        <div class="stack-2" style="margin-top:12px">
          ${[['The garment itself','At the quantity break you choose.'],
             ['Two standard placements','One embroidery and one one-colour screen, up to 99 mm.'],
             ['Your own label sewn in','And the supplier\'s label removed.'],
             ['Individual packaging','Each piece bagged, ready to hand out.']]
            .map(([h,t]) => `<div class="factline"><span class="med">${h}</span><span class="muted">${t}</span></div>`).join('')}
        </div>
        <div class="sep"></div>
        <div class="eyebrow">Priced on top</div>
        <div class="stack-2" style="margin-top:10px">
          ${[['Extra placements','Anything beyond the one the price carries.'],
             ['Larger or multi-colour work','Above 99 mm, or more than one ink colour.'],
             ['Setup','Once per job, not per piece.'],
             ['Oversize and speciality colours','4XL and up, heathers and special dyes.']]
            .map(([h,t]) => `<div class="factline"><span class="med">${h}</span><span class="muted">${t}</span></div>`).join('')}
        </div>
      </div>
    </div>`;
}

/* ---- The nine-question qualification journey --------------------------- */
/* ---- the brief ----------------------------------------------------------
   Nine questions, answered by choosing. Q1 decides which two you see next,
   so nobody is asked about treatment rooms when they run a shop. Every
   question offers Other. Contact details are asked once, at the end.

   Two of the nine — headcount and how many designs — are the ones that
   actually qualify a project, because people ÷ designs decides whether each
   garment reaches a quantity it can be made well at. qualify() below turns
   that ratio into a verdict the studio sees on the inquiry. */

const KEYLETTER = 'ABCDEFGHIJ';
const O = (v, d) => ({v, d});
const OTHER = O('Other');

const Q_TYPE = {
  key:'Establishment', mode:'one',
  t:'What kind of establishment are we dressing?',
  h:'Everything after this is shaped by your answer, so the questions you see next will be specific to you.',
  opts:[O('Hotel or resort'), O('Restaurant or restaurant group'), O('Spa and wellness'),
        O('Private clinic'), O('Members club or private venue'), O('Retail or showroom'), OTHER],
};
const BRANCH_OF = {
  'Hotel or resort':'hotel', 'Restaurant or restaurant group':'restaurant',
  'Spa and wellness':'spa', 'Private clinic':'clinic',
  'Members club or private venue':'club', 'Retail or showroom':'retail', 'Other':'other',
};

const BRANCHES = {
  hotel:[
    {key:'Property size', mode:'one', t:'How many rooms does the property have?',
     h:'Room count is the quickest read on the size of the teams behind it.',
     opts:[O('Under 30', 'Boutique'), O('30 to 80'), O('80 to 150'), O('150 to 300'),
           O('300 or more'), O('Not sure'), OTHER]},
    {key:'Departments', mode:'many', t:'Which departments would wear it?',
     h:'Choose any that apply. A hotel wardrobe is usually several of these, not one.',
     opts:[O('Reception and welcome'), O('Restaurant and bar'), O('Housekeeping'),
           O('Spa and wellness'), O('Concierge and guest services'), O('Kitchen'),
           O('Management'), OTHER]},
  ],
  restaurant:[
    {key:'Venues', mode:'one', t:'How many venues are we dressing?',
     h:'One kitchen and five kitchens are different projects, even at the same headcount.',
     opts:[O('One'), O('Two or three'), O('Four to seven'), O('Eight to fifteen'),
           O('More than fifteen'), O('Still deciding'), OTHER]},
    {key:'Teams', mode:'many', t:'Which teams would wear it?',
     h:'Choose any that apply.',
     opts:[O('Front of house'), O('Bar team'), O('Kitchen'), O('Hosts and reception'),
           O('Sommelier and floor management'), O('Management'), OTHER]},
  ],
  spa:[
    {key:'Treatment rooms', mode:'one', t:'How many treatment rooms?',
     h:'It tells us the size of the therapist team, which is the hardest group to fit.',
     opts:[O('1 to 3'), O('4 to 6'), O('7 to 12'), O('More than 12'),
           O('We are inside a hotel'), O('Not sure'), OTHER]},
    {key:'Roles', mode:'many', t:'Which roles would wear it?',
     h:'Choose any that apply.',
     opts:[O('Therapists'), O('Reception'), O('Fitness and studio'),
           O('Housekeeping and laundry'), O('Retail and product'), O('Management'), OTHER]},
  ],
  clinic:[
    {key:'Practice type', mode:'one', t:'What kind of practice is it?',
     h:'This decides which requirements we have to assess before proposing anything.',
     opts:[O('Aesthetic and dermatology'), O('Dental'), O('Medical or general practice'),
           O('Surgical'), O('Multi-specialty'), O('Veterinary'), OTHER]},
    {key:'Roles', mode:'many', t:'Which roles would wear it?',
     h:'Choose any that apply.',
     opts:[O('Clinical practitioners'), O('Nursing and assistants'), O('Reception and admin'),
           O('Technicians'), O('Cleaning and sterilisation'), O('Management'), OTHER]},
  ],
  club:[
    {key:'Space use', mode:'one', t:'What does the space mainly do?',
     h:'A dining room and an events floor put very different demands on the same jacket.',
     opts:[O('Dining and bar'), O('Events and private hire'), O('Sport and wellness'),
           O('Coworking and members lounge'), O('A mix'),
           O('Residential or private household'), OTHER]},
    {key:'Teams', mode:'many', t:'Which teams would wear it?',
     h:'Choose any that apply.',
     opts:[O('Service and floor'), O('Reception and membership'), O('Kitchen'),
           O('Events team'), O('Housekeeping'), O('Management'), OTHER]},
  ],
  retail:[
    {key:'Locations', mode:'one', t:'How many locations?',
     h:'Replenishment across sites changes the specification as much as the design does.',
     opts:[O('One'), O('Two to four'), O('Five to ten'), O('More than ten'),
           O('Pop-up or seasonal'), O('Still deciding'), OTHER]},
    {key:'Roles', mode:'many', t:'Which roles would wear it?',
     h:'Choose any that apply.',
     opts:[O('Shop floor and sales'), O('Stockroom and logistics'), O('Visual merchandising'),
           O('Store management'), O('Events and activations'), O('Head office'), OTHER]},
  ],
  other:[
    {key:'Operation', mode:'one', t:'How would you describe the operation?',
     h:'Close enough is fine — we will get to the detail on the call.',
     opts:[O('Hospitality of some kind'), O('Healthcare or wellbeing'), O('A workplace or office'),
           O('Events and catering'), O('Transport or travel'),
           O('Culture, museum or venue'), OTHER]},
    {key:'Teams', mode:'many', t:'Which teams would wear it?',
     h:'Choose any that apply.',
     opts:[O('Guest or customer facing'), O('Operations'), O('Technical and maintenance'),
           O('Reception and admin'), O('Food and beverage'), O('Management'), OTHER]},
  ],
};

const COMMON = [
  {key:'Direction', mode:'many', max:2,
   t:'Which directions feel right?',
   h:'Pick one or two. Not a design brief — just a direction.',
   opts:[O('Minimalist', 'Reduced detail, clean lines, quiet'),
         O('Scandinavian', 'Light, functional, unfussy, natural materials'),
         O('Japanese', 'Layered, generous cut, considered proportion'),
         O('Mediterranean', 'Linen, warmth, relaxed formality'),
         O('Classic tailoring', 'Structured, formal, traditional hospitality'),
         O('Industrial or utility', 'Workwear roots, pockets, hard-wearing'),
         O('Warm and traditional', 'Rich colour, texture, a sense of history'),
         O('Technical or sport', 'Performance fabrics, movement, modern'), OTHER]},

  {key:'People to dress', mode:'one',
   t:'How many people would wear the uniform?',
   h:'The single most useful number: it decides whether each garment reaches a workable quantity.',
   opts:[O('Fewer than 10'), O('10 to 25'), O('26 to 60'), O('61 to 150'),
         O('More than 150'), O('Not sure yet'), OTHER]},

  {key:'Designs', mode:'one',
   t:'Would everyone wear the same thing?',
   h:'Each design is a production run of its own, so this drives cost and timing more than anything else.',
   opts:[O('Yes — one uniform for everyone', 'One design, worn by every department'),
         O('Almost — the same design in different colours', 'Still one design to make. Colour or trim tells the teams apart'),
         O('A few departments need something different', 'Roughly two or three designs'),
         O('Most departments need their own', 'Roughly four to six designs'),
         O('Every role is dressed differently', 'Seven designs or more'),
         O('We honestly do not know — advise us', 'Very common, and usually the most useful conversation to have'),
         OTHER]},

  {key:'Timing', mode:'one',
   t:'When do you need them?',
   h:'Development runs 4 to 6 weeks, production 3 to 5. Knowing the date early protects it.',
   opts:[O('Within 3 months'), O('In 3 to 6 months'), O('In 6 to 12 months'),
         O('More than 12 months away'), O('Tied to an opening or refurbishment date'),
         O('No fixed date yet'), OTHER]},

  {key:'Budget range', mode:'one',
   t:'What budget do you have in mind?',
   h:'A range is fine. It helps us propose something real rather than something aspirational.',
   guide:'As a guide, a custom project generally starts around €120 per person across the garments in the range.',
   opts:[O('Under €10,000'), O('€10,000 to €25,000'), O('€25,000 to €50,000'),
         O('€50,000 to €100,000'), O('More than €100,000'), O('Prefer to discuss it'), OTHER]},

  {key:'What is not working', mode:'many',
   t:'What is not working at the moment?',
   h:'Choose as many as apply. Usually the most useful answer on the form.',
   opts:[O('It does not look right for the space'), O('It wears out too quickly'),
         O('The team dislikes wearing it'), O('Departments look disconnected'),
         O('Reordering is difficult or inconsistent'), O('It does not fit different body types'),
         O('It does not survive our laundry'), O('Staff wear their own clothes'),
         O('Nothing — this is a new opening'), OTHER]},
];

/* The nine, assembled for whoever is answering. */
function quizQs(){
  const b = BRANCH_OF[(UI.answers || {})['Establishment']];
  return [Q_TYPE, ...(b ? BRANCHES[b] : []), ...COMMON];
}
const QUIZ_TOTAL = 9;

/* ---- company qualification ---------------------------------------------
   VAT numbers are format-checked here, per member state. The VIES lookup
   itself is a server call — a browser cannot reach VIES, and would not be
   trusted to if it could — so the field records a status and the real
   verification happens when the brief is reviewed. The screen says so. */
const EU_VAT = {
  AT:[/^U\d{8}$/, 'U12345678'],            BE:[/^[01]\d{9}$/, '0123456789'],
  BG:[/^\d{9,10}$/, '123456789'],          CY:[/^\d{8}[A-Z]$/, '12345678L'],
  CZ:[/^\d{8,10}$/, '12345678'],           DE:[/^\d{9}$/, '123456789'],
  DK:[/^\d{8}$/, '12345678'],              EE:[/^\d{9}$/, '123456789'],
  EL:[/^\d{9}$/, '123456789'],             ES:[/^[A-Z0-9]\d{7}[A-Z0-9]$/, 'B12345678'],
  FI:[/^\d{8}$/, '12345678'],              FR:[/^[A-Z0-9]{2}\d{9}$/, 'XX123456789'],
  HR:[/^\d{11}$/, '12345678901'],          HU:[/^\d{8}$/, '12345678'],
  IE:[/^(\d{7}[A-Z]{1,2}|\d[A-Z+*]\d{5}[A-Z])$/, '1234567A'],
  IT:[/^\d{11}$/, '12345678901'],          LT:[/^(\d{9}|\d{12})$/, '123456789'],
  LU:[/^\d{8}$/, '12345678'],              LV:[/^\d{11}$/, '12345678901'],
  MT:[/^\d{8}$/, '12345678'],              NL:[/^\d{9}B\d{2}$/, '123456789B01'],
  PL:[/^\d{10}$/, '1234567890'],           PT:[/^\d{9}$/, '123456789'],
  RO:[/^\d{2,10}$/, '12345678'],           SE:[/^\d{12}$/, '123456789001'],
  SI:[/^\d{8}$/, '12345678'],              SK:[/^\d{10}$/, '1234567890'],
};
const COUNTRIES = [
  ['Spain','ES'],['France','FR'],['Portugal','PT'],['Italy','IT'],['Germany','DE'],
  ['Netherlands','NL'],['Belgium','BE'],['Ireland','IE'],['Austria','AT'],['Poland','PL'],
  ['Sweden','SE'],['Denmark','DK'],['Finland','FI'],['Greece','EL'],['Czechia','CZ'],
  ['Romania','RO'],['Hungary','HU'],['Croatia','HR'],['Bulgaria','BG'],['Slovakia','SK'],
  ['Slovenia','SI'],['Lithuania','LT'],['Latvia','LV'],['Estonia','EE'],['Luxembourg','LU'],
  ['Cyprus','CY'],['Malta','MT'],
  ['United Kingdom','GB'],['Switzerland','CH'],['Norway','NO'],
  ['Outside Europe','--'],['More than one country','--'],
];
const codeFor = (name) => (COUNTRIES.find(c => c[0] === name) || [])[1] || '--';
const isEU = (name) => !!EU_VAT[codeFor(name)];

/* Returns the state of the number as typed. 'pending' means the format is
   right and the VIES lookup is still owed — never that it has passed. */
function vatState(a){
  a = a || {};
  const country = a['Country'] || 'Spain';
  const code = codeFor(country);
  if(!isEU(country)) return {state:'not-required', code,
    text:'A VAT number is not needed for this destination. We confirm the billing entity when we quote.'};
  if(a['No VAT']) return {state:'not-registered', code,
    text:'Recorded as not VAT registered. We will confirm the billing arrangement before invoicing.'};
  const raw = (a['VAT'] || '').toUpperCase().replace(/[\s.\-]/g, '');
  if(!raw) return {state:'missing', code,
    text:`Needed for delivery in ${country}, or tick that you are not registered.`};
  const body = raw.startsWith(code) ? raw.slice(code.length) : raw;
  const [re, example] = EU_VAT[code];
  if(!re.test(body)) return {state:'format-invalid', code, example,
    text:`That does not match the ${country} format. Example: ${code}${example}.`};
  return {state:'pending', code, value:code + body,
    text:`Format checks out. We verify ${code + body} against VIES when we review your brief.`};
}

/* ---- qualification ------------------------------------------------------
   Headcount and design count are worth little apart. Divided, they give
   people per design, which is what decides whether a style reaches a
   workable production quantity. */
const HEAD_N = {'Fewer than 10':7, '10 to 25':18, '26 to 60':43, '61 to 150':105, 'More than 150':220};
const DESIGN_N = {
  'Yes — one uniform for everyone':1,
  'Almost — the same design in different colours':1,
  'A few departments need something different':2.5,
  'Most departments need their own':5,
  'Every role is dressed differently':8,
};

function qualify(a){
  a = a || {};
  const head = HEAD_N[a['People to dress']] || null;
  const designs = DESIGN_N[a['Designs']] || null;
  const per = head && designs ? head / designs : null;
  const flags = [];
  const add = (level, w, text) => flags.push({level, w, text});

  if(head === null) add('warn', -1, 'Headcount not given. Ask on the call before anything else — nothing else can be sized without it.');
  else if(head < 10) add('stop', -3, 'Below the scale where per-style minimums work comfortably.');
  else if(head >= 105) add('ok', 2, 'Headcount carries a multi-garment range comfortably.');

  if(designs === null) add('warn', -1, 'Design count undecided. Usually the most useful conversation to have on the call.');

  if(per !== null){
    if(per < 10) add('stop', -3, `About ${Math.round(per)} people per design. Per-style minimums will not be met as scoped.`);
    else if(per < 25) add('warn', -1, `About ${Math.round(per)} people per design. Check per-style minimums before quoting.`);
    else add('ok', 2, `About ${Math.round(per)} people per design, comfortably above per-style minimums.`);
  }

  if(a['Budget range'] === 'Prefer to discuss it') add('warn', -1, 'No budget range given. Establish one before scoping.');
  if(a['Budget range'] === 'Under €10,000' && head && head >= 61)
    add('warn', -2, 'Budget looks light against the headcount. Worth resolving before development.');
  if(a['Timing'] === 'Within 3 months')
    add('warn', -1, 'Development is 4 to 6 weeks and production 3 to 5. Little margin at this date.');
  if(a['Timing'] === 'Tied to an opening or refurbishment date')
    add('warn', -1, 'Date is tied to an opening. Confirm the real deadline, not the target.');
  if((a['What is not working'] || []).includes('Nothing — this is a new opening'))
    add('ok', 1, 'New opening. No legacy garments to replace or match.');

  /* who is actually buying */
  const auth = a['Authority'];
  if(auth === 'I decide this') add('ok', 1, 'Speaking to the decision maker.');
  else if(auth === 'I am gathering information for someone else')
    add('warn', -1, 'Not the decision maker. Identify who signs off before scoping.');
  else if(auth === 'A committee or procurement process decides')
    add('warn', -1, 'Committee or procurement decision. Expect a longer cycle and a formal process.');
  else if(auth === 'Not sure yet') add('warn', -1, 'Decision route unclear. Establish it on the call.');

  if(a['Email'] && isFreeMail(a['Email']))
    add('warn', -1, 'Personal email domain. Confirm the trading entity before invoicing.');

  const v = vatState(a);
  if(v.state === 'pending') add('ok', 1, `VAT ${v.value} captured, format valid. Verify against VIES before invoicing.`);
  else if(v.state === 'missing') add('warn', -1, `No VAT number for an EU delivery to ${a['Country']}. Needed before invoicing.`);
  else if(v.state === 'format-invalid') add('warn', -2, 'VAT number does not match the country format. Re-check before invoicing.');
  else if(v.state === 'not-registered') add('warn', -1, 'Not VAT registered. Confirm the billing arrangement.');

  const score = flags.reduce((t, f) => t + f.w, 0);
  const verdict = flags.some(f => f.level === 'stop') ? 'stop' : score < 0 ? 'warn' : 'ok';
  return {score, verdict, flags, head, designs,
          per: per === null ? null : Math.round(per)};
}

/* ---- the screens -------------------------------------------------------- */
function quizIntro(){
  return pubShellBare(`
  <div class="tf-bar"><span style="width:0%"></span></div>
  <section class="tf">
    <div class="tf-in">
      <span class="news"><b>9 questions</b>about 90 seconds</span>
      <h1 class="tf-q tf-q--intro">Tell us what your teams do all day</h1>
      <p class="tf-h">Nine questions, one at a time. Three change with the kind of place you run.</p>
      <ol class="intro-l">
        ${[['01','Every question has an <em>Other</em>, so nothing here can block you.'],
           ['02','Your contact details come at the end — not before.'],
           ['03','We read it ourselves and reply within two working days.']]
          .map(([n, t]) => `<li><span class="intro-n">${n}</span><span>${t}</span></li>`).join('')}
      </ol>
      <div class="tf-foot">
        <button class="btn btn--quiet" data-go="public:custom">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formNext">Start</button>
        <span class="tf-hint">No account is created by answering this, and nothing is shared with anyone.</span>
      </div>
    </div>
  </section>
  `, 'form');
}

function pubForm(){
  const step = UI.formStep = UI.formStep || 0;
  if(step === 0) return quizIntro();
  const qs = quizQs();
  if(step === qs.length + 1) return pubAboutYou();
  if(step > qs.length + 1) return pubAboutCompany();
  const q = qs[step - 1];
  const a = UI.answers = UI.answers || {};
  const chosen = q.mode === 'many' ? (a[q.key] || []) : [a[q.key]];
  const done = q.mode === 'many' ? chosen.length > 0 : !!a[q.key];
  const atMax = q.max && chosen.length >= q.max;
  return pubShellBare(`
  <div class="tf-bar"><span style="width:${Math.round((step / (QUIZ_TOTAL + CONTACT_STEPS)) * 100)}%"></span></div>
  <section class="tf">
    <div class="tf-in">
      <div class="tf-n"><b>${String(step).padStart(2, '0')}</b> of ${QUIZ_TOTAL}</div>
      <h1 class="tf-q">${q.t}</h1>
      <p class="tf-h">${q.h}</p>
      ${q.guide ? `<p class="tf-guide">${q.guide}</p>` : ''}
      ${q.mode === 'many' ? `<p class="tf-multi">${q.max
        ? `Choose up to ${q.max}${atMax ? ' · choosing another replaces the first' : ''}`
        : 'Choose any that apply'}</p>` : ''}

      <div class="tf-opts ${q.opts.some(o => o.d) ? 'tf-opts--desc' : ''}" role="group" aria-label="${esc(q.t)}">
        ${q.opts.map((o, i) => {
          const on = chosen.includes(o.v);
          return `<button class="tf-o ${on ? 'tf-o--on' : ''}" data-act="pick" data-v="${esc(o.v)}"
            aria-pressed="${on}">
            <span class="tf-key">${KEYLETTER[i]}</span>
            <span class="tf-lab">${esc(o.v)}${o.d ? `<em class="tf-desc">${esc(o.d)}</em>` : ''}</span>
            <span class="tf-tick">✓</span>
          </button>`;}).join('')}
      </div>

      <div class="tf-foot">
        <button class="btn btn--quiet" data-act="formBack">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formNext"
          ${done ? '' : 'disabled'}>${done ? 'OK' : 'Choose an answer'}</button>
        <span class="tf-hint">${done ? 'Press Enter to continue'
          : `Press ${KEYLETTER[0]}–${KEYLETTER[q.opts.length - 1]} to choose`}</span>
      </div>
    </div>
  </section>
  `, 'form');
}

/* ---- the two qualification screens -------------------------------------
   Split deliberately: who is asking, then who is buying. They are different
   questions and the second one decides how an invoice can be raised. */
const CONTACT_STEPS = 2;

const AUTHORITY = [
  O('I decide this', 'The budget and the sign-off are mine'),
  O('I recommend, someone else signs off', 'Tell us who else needs to see the proposal'),
  O('I am gathering information for someone else', 'We will keep it readable for them'),
  O('A committee or procurement process decides', 'Useful to know early — it changes the timeline'),
  O('Not sure yet'),
];

const FREE_MAIL = ['gmail.com','googlemail.com','hotmail.com','hotmail.es','hotmail.fr','outlook.com',
  'live.com','yahoo.com','yahoo.es','ymail.com','icloud.com','me.com','aol.com','gmx.com','gmx.net',
  'protonmail.com','proton.me','mail.com','yandex.com','free.fr','orange.fr','wanadoo.fr'];
const isFreeMail = (e) => FREE_MAIL.includes(String(e || '').split('@')[1] ? String(e).split('@')[1].toLowerCase() : '');

function briefField(n, l, type, help, a, err){
  return `
  <label class="fld ${err[n] ? 'fld--err' : ''}">
    <span class="fld-l">${l}</span>
    <input class="inp inp--lg" type="${type}" name="${n}" value="${esc(a[n] || '')}">
    ${help ? `<span class="fld-h t-xs muted">${help}</span>` : ''}
    ${err[n] ? `<span class="fld-e t-xs">${err[n]}</span>` : ''}
  </label>`;
}

function briefErrBanner(err){
  const k = Object.keys(err || {});
  return k.length ? `<div class="banner banner--stop" id="ferr"><div>
    <div class="banner-t">${k.length} still needed</div>
    <div class="banner-d">${k.map(x => esc(err[x])).join(' ')}</div></div></div>` : '';
}

/* Screen 10 — who is asking, and whether it is their decision. */
function pubAboutYou(){
  const a = UI.answers = UI.answers || {}, err = UI.formErr || {};
  const chosen = a['Authority'];
  return pubShellBare(`
  <div class="tf-bar"><span style="width:${Math.round((QUIZ_TOTAL / (QUIZ_TOTAL + CONTACT_STEPS)) * 100)}%"></span></div>
  <section class="tf">
    <div class="tf-in">
      <div class="tf-n"><b>About you</b> · 1 of 2</div>
      <h1 class="tf-q">Who should we reply to?</h1>
      <p class="tf-h">The only place we ask for your details, and we use them only to answer you.</p>
      ${briefErrBanner(err)}
      <form class="tf-form" onsubmit="return false">
        ${briefField('Contact name', 'Your name', 'text', '', a, err)}
        ${briefField('Role', 'Your role', 'text', 'So we know who else needs to be in the conversation.', a, err)}
      </form>
      <p class="tf-multi">Is this your decision to make?</p>
      <div class="tf-opts tf-opts--desc" role="group" aria-label="Decision authority">
        ${AUTHORITY.map((o, i) => `<button class="tf-o ${chosen === o.v ? 'tf-o--on' : ''}"
          data-act="pickField" data-k="Authority" data-v="${esc(o.v)}" aria-pressed="${chosen === o.v}">
          <span class="tf-key">${KEYLETTER[i]}</span>
          <span class="tf-lab">${esc(o.v)}${o.d ? `<em class="tf-desc">${esc(o.d)}</em>` : ''}</span>
          <span class="tf-tick">✓</span></button>`).join('')}
      </div>
      <div class="tf-foot">
        <button class="btn btn--quiet" data-act="formBack">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formNext">Continue</button>
        <span class="tf-hint">We reply within two working days.</span>
      </div>
    </div>
  </section>
  `, 'form');
}

/* Screen 11 — the buying entity. This is what an invoice is raised against. */
function pubAboutCompany(){
  const a = UI.answers = UI.answers || {}, err = UI.formErr || {};
  const v = vatState(a);
  const eu = isEU(a['Country'] || 'Spain');
  const free = a['Email'] && isFreeMail(a['Email']);
  const tone = {'pending':'go', 'not-required':'flow', 'not-registered':'flow',
                'format-invalid':'stop', 'missing':'wait'}[v.state];
  return pubShellBare(`
  <div class="tf-bar"><span style="width:${Math.round(((QUIZ_TOTAL + 1) / (QUIZ_TOTAL + CONTACT_STEPS)) * 100)}%"></span></div>
  <section class="tf">
    <div class="tf-in">
      <div class="tf-n"><b>About the company</b> · 2 of 2</div>
      <h1 class="tf-q">Who are we invoicing?</h1>
      <p class="tf-h">The buying entity — not always the same site that wears the uniform.</p>
      ${briefErrBanner(err)}
      <form class="tf-form tf-form--wide" onsubmit="return false">
        ${briefField('Company', 'Company or organisation', 'text', 'The registered name, if you have one.', a, err)}
        ${briefField('Email', 'Company email', 'email', 'Where the proposal goes.', a, err)}
        ${free ? `<div class="banner banner--wait"><div>
          <div class="banner-d">That is a personal email domain. Perfectly fine for a sole trader — we will
            just confirm the billing entity before invoicing.</div></div></div>` : ''}

        <label class="fld"><span class="fld-l">Delivery country</span>
          <select class="inp inp--lg" name="Country" data-act="setCountry">
            ${COUNTRIES.map(([n]) => `<option ${(a['Country'] || 'Spain') === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <span class="fld-h t-xs muted">Decides whether a VAT number is needed.</span></label>

        ${eu ? `
        <div class="vat ${a['No VAT'] ? 'vat--off' : ''}">
          <label class="fld"><span class="fld-l">VAT number${a['No VAT'] ? ' <span class="muted">· not registered</span>' : ''}</span>
            <div class="vat-row">
              <span class="vat-cc">${v.code}</span>
              <input class="inp vat-inp" type="text" name="VAT" value="${esc(a['VAT'] || '')}"
                placeholder="${esc((EU_VAT[v.code] || [])[1] || '')}" ${a['No VAT'] ? 'disabled' : ''}>
              <button class="vat-go" data-act="checkVat" ${a['No VAT'] ? 'disabled' : ''}>Check</button>
            </div>
            ${err['VAT'] ? `<span class="fld-e t-xs">${err['VAT']}</span>` : ''}
          </label>
          <p class="vat-note vat-note--${tone}">${esc(v.text)}</p>
          <label class="chk vat-chk"><input type="checkbox" data-act="noVat" ${a['No VAT'] ? 'checked' : ''}>
            <span class="t-sm">We are not VAT registered</span></label>
        </div>` : `
        <div class="banner banner--flow"><div>
          <div class="banner-d">${esc(v.text)}</div></div></div>`}

        ${briefField('Phone', 'Phone', 'tel', 'Optional. Only if you would rather we call.', a, err)}
      </form>
      <div class="tf-foot">
        <button class="btn btn--quiet" data-act="formBack">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formNext">Review your brief</button>
        <span class="tf-hint">We use these details to answer you and to raise the proposal.
          <a class="lnk" data-go="public:privacy">Privacy Notice</a></span>
      </div>
    </div>
  </section>
  `, 'form');
}

function pubReview(){
  const a = UI.answers || {};
  const qs = quizQs();
  const val = (q) => {
    const v = a[q.key];
    if(q.mode === 'many') return (v || []).length ? v.join(' · ') : 'Not answered';
    return v || 'Not answered';
  };
  return pubShellBare(`
  <div class="tf-bar"><span style="width:100%"></span></div>
  <section class="tf tf--wide">
    <div class="tf-in">
      <div class="tf-n"><b>Review</b></div>
      <h1 class="tf-q">Check your brief.</h1>
      <p class="tf-h">Change anything before you send it. Sending this requests a review — it does not place an
        order or create a project.</p>
      <dl class="rv">
        ${qs.map((q, i) => `
        <div class="rv-r">
          <dt>${esc(q.t)}</dt>
          <dd><span>${esc(val(q))}</span>
            <button class="lnk lnk--sm" data-act="formGoto" data-i="${i + 1}">Change</button></dd>
        </div>`).join('')}
        <div class="rv-r">
          <dt>Who should we reply to?</dt>
          <dd><span>${esc(a['Contact name'] || '—')}${a['Role'] ? ', ' + esc(a['Role']) : ''}<br>
            <span class="t-xs muted">${esc(a['Authority'] || 'Decision route not given')}</span></span>
            <button class="lnk lnk--sm" data-act="formGoto" data-i="${qs.length + 1}">Change</button></dd>
        </div>
        <div class="rv-r">
          <dt>Who are we invoicing?</dt>
          <dd><span>${esc(a['Company'] || '—')} · ${esc(a['Email'] || '—')} · ${esc(a['Country'] || 'Spain')}<br>
            <span class="t-xs muted">${(() => { const v = vatState(a);
              return v.state === 'pending' ? 'VAT ' + esc(v.value) + ' · awaiting VIES verification'
                : v.state === 'not-registered' ? 'Not VAT registered'
                : v.state === 'not-required' ? 'VAT not required for this destination'
                : 'VAT number not provided'; })()}</span></span>
            <button class="lnk lnk--sm" data-act="formGoto" data-i="${qs.length + 2}">Change</button></dd>
        </div>
      </dl>
      <div class="tf-foot tf-foot--wide">
        <button class="btn btn--quiet" data-act="formBack">← Back</button>
        <button class="btn btn--primary btn--lg" data-act="formSubmit">Submit your brief</button>
        <span class="tf-hint">We read it ourselves and reply within two working days.</span>
      </div>
    </div>
  </section>
  `, 'review');
}

function pubDone(){
  const inq = UI.lastInquiry;
  return pubShell(`
  <div class="q-wrap" style="text-align:center">
    <div class="eyebrow" style="color:var(--go)">Received</div>
    <h1 class="t-h2" style="margin-top:16px">Thank you — your inquiry is with us.</h1>
    <p class="t-lead" style="margin-top:20px">Your reference is <strong class="num">${esc(inq ? inq.ref : 'INQ-0149')}</strong>. We review every inquiry ourselves and reply either way, usually within two working days.</p>
    <div class="card" style="margin-top:40px;text-align:left">
      <div class="eyebrow">What happens next</div>
      <div class="stack-3" style="margin-top:16px">
        ${[['Now','We read what you sent and check it against what we can genuinely do well.'],
           ['Within 2 days','You hear from us either way. If we are not the right studio we will say so, and usually suggest someone who is.'],
           ['If it is a fit','We arrange a first call — about forty-five minutes on the work itself.'],
           ['After the call','If it goes ahead, we open your account and build the project before you ever log in.']]
          .map(([w,t]) => `<div class="factline"><span class="med">${w}</span><span class="muted">${t}</span></div>`).join('')}
      </div>
    </div>
    <div class="banner banner--go" style="margin-top:24px;text-align:left">
      <div><div class="banner-t">Prototype note</div>
      <div class="banner-d">That submission wrote a real record. Switch to the Studio Back Office and open Inquiries — ${esc(inq ? inq.ref : 'the new inquiry')} is at the top of the qualification queue, with a notification and a task attached to it.</div></div>
    </div>
    <div class="btn-row" style="margin-top:32px;justify-content:center">
      <button class="btn btn--ghost" data-go="public:home">Back to the site</button>
      <button class="btn btn--primary" data-act="peekInquiry">Open it in the Studio →</button>
    </div>
  </div>
  `, 'form');
}

/* ---- Sectors / Process / Work (short editorial pages) ------------------ */
/* ---- Login -------------------------------------------------------------- */
function pubLogin(){
  const custs = S.users.filter(u => u.side === 'customer');
  const rows = (side, title, note) => `
    <div class="card">
      <div class="eyebrow">${title}</div>
      <p class="t-xs muted" style="margin:8px 0 16px">${note}</p>
      <div class="stack-2">
        ${side === 'customer' && !custs.length ? `<div class="card card--quiet">
          <div class="t-sm med">No customer accounts yet</div>
          <p class="t-xs muted" style="margin-top:6px">A customer account is opened in the Back Office, from a qualified
            inquiry. The contact who wrote in becomes its first administrator and appears here.</p>
          </div>` : ''}
        ${side === 'customer' && custs.length ? `
          <p class="t-xs muted" style="margin:0 0 12px">A customer signs in the way they were invited to — with
            Google, or with a code sent to their address. There is no password to choose, lose or reset.</p>` : ''}
        ${S.users.filter(u => u.side === side).map(u => `
          <button class="rw" data-act="${side === 'customer' ? 'custSignIn' : 'login'}" data-u="${u.id}"
            style="border:1px solid var(--line);padding:12px">
            <span class="av ${side==='studio'?'av--studio':''}">${u.init}</span>
            <span class="rw-main">
              <span class="rw-t">${esc(u.name)}</span>
              <span class="rw-s">${esc(u.title)} · ${ROLE_NAMES[u.role]}</span>
            </span>
            <span class="rw-side"><span class="t-xs faint">Sign in →</span></span>
          </button>`).join('')}
      </div>
    </div>`;
  return pubShell(`
  <div class="q-wrap" style="max-width:840px">
    <div class="eyebrow">Sign in</div>
    <h1 class="t-h2" style="margin-top:12px">Choose who you are</h1>
    <p class="t-sm muted" style="margin-top:12px;margin-bottom:32px">This prototype has no passwords. Pick a person and you will see exactly what their role and scope permit — the same <code style="font-size:12px">can()</code> function decides both, so the two accounts cannot drift apart.</p>
    <div class="grid grid-2">
      ${rows('customer', custs.length ? 'Customer — ' + esc(account(custs[0].account).name) : 'Customer',
        'An account administrator sees everything on their company account. Members can be scoped to a single project.')}
      ${rows('studio','PAMUUC — Studio Back Office','Master sees and controls everything. The Account Manager sees assigned work without cost or margin. Finance sees money and just enough operational context.')}
    </div>
  </div>`, 'login');
}
/* ============================================================================
   PAMUUC SUITE — Customer Account
   Selective, guided, action-focused. Everything here is a projection of the
   same records the Studio operates. There is no "create project" action.
   ========================================================================= */

/* ---- shared application shell (account + studio) ----------------------- */
function appShell(o){
  const u = user(SESSION.user);
  const side = u.side;
  const unread = unreadCount(side);
  return `
  <div class="app">
    <aside class="side">
      <div class="side-hd">
        <div class="brand brand--sm" data-go="${side==='customer'?'account:overview':'studio:overview'}">${mark('mk--lockup')}PAMUUC<span class="brand-bar">|</span><span class="brand-sub">${side==='customer'?'ACCOUNT':'STUDIO'}</span></div>
        <div class="side-scope">${o.scope}</div>
      </div>
      <nav class="side-nav">
        ${o.nav.map(g => g.group
          ? `<div class="side-grp">${esc(g.group)}</div>`
          : `<button class="nv ${o.page===g.p?'nv--on':''}" data-go="${side==='customer'?'account':'studio'}:${g.p}">
               <span class="nv-i">${g.i}</span><span class="nv-n">${esc(g.n)}</span>
               ${g.badge ? `<span class="badge-n">${g.badge}</span>` : ''}
             </button>`).join('')}
      </nav>
      <div class="side-ft">
        <button class="ub" data-act="userMenu" style="width:100%">
          <span class="av ${side==='studio'?'av--studio':''}">${u.init}</span>
          <span style="flex:1;text-align:left;min-width:0">
            <span style="display:block;font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis">${esc(u.name)}</span>
            <span style="display:block;color:var(--muted);font-size:11px">${ROLE_NAMES[u.role]}</span>
          </span>
        </button>
      </div>
    </aside>

    <div class="main">
      <header class="top glass">
        <span class="top-t">${esc(o.title)}</span>
        <span class="spacer"></span>
        <button class="btn btn--quiet btn--sm" data-act="theme" title="Light / dark">◐</button>
        <button class="iconbtn" data-go="${side==='customer'?'account:messages':'studio:comms'}" title="Messages">✉</button>
        <button class="iconbtn" data-go="${side==='customer'?'account:notifications':'studio:notifications'}" title="Notifications">
          ◔${unread ? `<span class="badge-n">${unread}</span>` : ''}</button>
        <button class="btn btn--ghost btn--sm" data-act="logout">Sign out</button>
      </header>
      <main class="body ${o.narrow?'body--narrow':''}">${o.body}</main>
    </div>

    <nav class="mob-nav glass">
      ${o.nav.filter(g => !g.group).slice(0,5).map(g => `
        <button class="nv ${o.page===g.p?'nv--on':''}" data-go="${side==='customer'?'account':'studio'}:${g.p}" style="flex:1">
          <span class="nv-i">${g.i}</span><span>${esc(g.n.split(' ')[0])}</span></button>`).join('')}
    </nav>
  </div>`;
}

function accNav(page){
  const u = user(SESSION.user);
  const acc = myAccount();
  const actions = myOpenItems().length;
  const nav = [
    {p:'overview',  n:'Overview',    i:'◎', badge:actions || 0},
    {p:'projects',  n:'Projects',    i:'▤'},
    {p:'reorders',  n:'Reorders',    i:'↻'},
  ];
  if(acc.modules.merchandise) nav.push({p:'merchandise', n:'Merchandise', i:'◈'});
  nav.push({p:'documents', n:'Documents', i:'▣'});
  nav.push({group:'Communication'});
  nav.push({p:'messages', n:'Messages', i:'✉'});
  nav.push({p:'notifications', n:'Notifications', i:'◔', badge:unreadCount('customer') || 0});
  nav.push({group:'Account'});
  nav.push({p:'settings', n:'Team & settings', i:'⚙'});
  return nav;
}

function accShell(page, title, body){
  const acc = myAccount();
  return appShell({page, title, body, nav:accNav(page),
    scope:`${esc(acc.name)}<br><span class="faint">${ROLE_NAMES[user(SESSION.user).role]} · ${esc(acc.country)}</span>`});
}

/* ---- Overview ---------------------------------------------------------- */
function accOverview(){
  const u = user(SESSION.user);
  const acc = myAccount();
  const items = myOpenItems();
  const projs = myProjects().filter(p => !p.completed);
  const done = myProjects().filter(p => p.completed);
  const delivered = S.shipments.filter(s => s.account === acc.id).reduce((t,s)=>t+s.pieces,0);
  const roles = new Set(); S.projects.filter(p=>p.account===acc.id&&p.completed)
    .forEach(p => p.positions.forEach(x => roles.add(x.name)));
  const approved = S.garments.filter(g => {
    const p = project(g.project); return p && p.account===acc.id && g.state==='approved';}).length;
  const feed = S.events.filter(e => e.account === acc.id && e.customerVisible).slice(0,8);

  return accShell('overview', 'Overview', `
    <div class="page-hd">
      <div class="eyebrow">${esc(acc.name)}</div>
      <h1 class="t-h2">Good morning, ${esc(u.name.split(' ')[0])}.</h1>
      <p class="page-sub">With PAMUUC since ${dateShort(acc.since)} · Your Account Manager is
        <span class="med">${esc(user(acc.am).name)}</span> · Last activity ${ago(S.events[0]?.at)}</p>
    </div>

    ${items.length ? `
    <section class="stack-3" style="margin-bottom:32px">
      <div class="row-between">
        <h2 class="t-h4">Needs your attention</h2>
        <span class="chip">${items.length} open</span>
      </div>
      <div class="rows">
        ${items.map(i => `
          <button class="rw" data-act="openItem" data-kind="${i.kind}" data-id="${i.id}" data-project="${i.project||''}">
            <span class="rw-flag rw-flag--${i.urgency}"></span>
            <span class="rw-main">
              <span class="rw-t">${esc(i.title)}</span>
              <span class="rw-s">${esc(i.sub)}${i.project ? ' · ' + esc(project(i.project).name) : ''}</span>
            </span>
            <span class="rw-side"><span class="btn btn--ghost btn--sm">${i.cta}</span></span>
          </button>`).join('')}
      </div>
    </section>` : `
    <div class="banner banner--go" style="margin-bottom:32px"><div>
      <div class="banner-t">You are up to date</div>
      <div class="banner-d">Nothing is waiting on you. We will tell you when something is.</div></div></div>`}

    <section class="stack-3" style="margin-bottom:32px">
      <h2 class="t-h4">Active projects</h2>
      ${projs.length ? `<div class="grid grid-2">${projs.map(p => {
        const v = views.customerProject(p);
        return `<button class="card" data-go="account:project:${p.id}" style="text-align:left;cursor:pointer">
          <div class="row-between" style="align-items:flex-start">
            <div><div class="t-h5">${esc(p.name)}</div>
              <div class="mono-ref">${p.ref}</div></div>
            ${pill(p.opStatus)}
          </div>
          <div class="tl" style="margin:16px 0">
            ${p.stages.map(sid => {
              const i = p.stages.indexOf(sid), cur = p.stages.indexOf(p.stage);
              return `<div class="tl-s ${i<cur?'tl-s--done':i===cur?'tl-s--now':''}" style="min-width:0">
                <div class="tl-n" style="font-size:11px">${stageDef(sid).name}</div></div>`;}).join('')}
          </div>
          <div class="stack-2">
            <div class="factline"><span>Now</span><span>${esc(v.doing)}</span></div>
            <div class="factline"><span>You</span><span class="med">${esc(v.youDo)}</span></div>
            ${p.nextMilestone ? `<div class="factline"><span>Next</span><span class="muted">${esc(milestoneLabel(p, p.nextMilestone))}</span></div>` : ''}
          </div>
        </button>`;}).join('')}</div>`
        : `<div class="empty"><div class="empty-t">No active projects</div>
           <div class="empty-d">Your completed garments remain available in Reorders. Contact ${esc(user(acc.am).name)} to begin a new project.</div>
           <button class="btn btn--ghost" data-go="account:reorders">Go to Reorders</button></div>`}
    </section>

    <section class="stack-3" style="margin-bottom:32px">
      <h2 class="t-h4">Your account in numbers</h2>
      <div class="grid grid-4">
        ${[[projs.length,'Active projects','Projects in an active stage'],
           [done.length,'Completed projects','Delivered and closed'],
           [approved,'Approved garments','Locked at an approved revision'],
           [delivered.toLocaleString('en-GB'),'Garments delivered','Delivered units, net of returns'],
           [roles.size,'Roles dressed','Distinct positions in completed deliveries'],
           [S.reorders.filter(r=>r.account===acc.id).length,'Reorders placed','From archived specifications'],
           [acc.locations.length,'Locations served','Delivery destinations on file'],
           ['81%','Documented provenance','Share of delivered units with mill and country on file']]
          .map(([v,l,n]) => `<div class="tile"><div class="tile-v num">${v}</div>
            <div class="tile-l">${l}</div><div class="tile-n">${n}</div></div>`).join('')}
      </div>
    </section>

    <section class="stack-3" style="margin-bottom:32px">
      <div class="row-between"><h2 class="t-h4">Commercial position</h2>
        <span class="t-xs faint">Calculated ${dateShort(S.today)}</span></div>
      <div class="grid grid-3">
        <div class="tile"><div class="tile-v num">${money(acc.balance)}</div>
          <div class="tile-l">Outstanding balance</div>
          <div class="tile-n">Issued minus recorded payments and credits</div></div>
        <div class="tile"><div class="tile-v num">${money(S.documents.filter(d=>d.account===acc.id&&d.state==='paid').reduce((t,d)=>t+(d.amount||0),0))}</div>
          <div class="tile-l">Paid to date</div>
          <div class="tile-n">All settled invoices on this account</div></div>
        <div class="tile"><div class="tile-v num">${money(64.00)}</div>
          <div class="tile-l">Chef jacket — last reorder unit price</div>
          <div class="tile-n">Same as the original approved unit price. No development fee was charged on the reorder.</div></div>
      </div>
      <p class="t-xs muted">Every figure links back to stored records. We do not show an estimated saving as a confirmed one — where a comparison cannot be defended, we show spend history instead.</p>
    </section>

    <section class="stack-3">
      <h2 class="t-h4">Recent activity</h2>
      <div class="card"><div class="feed">
        ${feed.map((e,i) => `<div class="fe ${i===0?'fe--now':''}">
          <div>${esc(e.text)}</div>
          <div class="fe-m">${dateTime(e.at)} · ${esc(user(e.actor).name)}</div></div>`).join('')}
      </div></div>
    </section>
  `);
}

/* ---- Projects list ----------------------------------------------------- */
function accProjects(){
  const ps = myProjects();
  return accShell('projects', 'Projects', `
    <div class="page-hd">
      <h1 class="t-h2">Projects</h1>
      <p class="page-sub">Each project shows the stage it is in now. Completed stages stay available inside the project, in History.</p>
    </div>
    ${ps.length ? `<div class="stack">${ps.map(p => {
      const v = views.customerProject(p);
      return `<div class="card">
        <div class="row-between" style="align-items:flex-start;flex-wrap:wrap">
          <div>
            <div class="row" style="gap:8px"><h2 class="t-h4">${esc(p.name)}</h2>${pill(p.opStatus)}</div>
            <div class="mono-ref" style="margin-top:4px">${p.ref} · target ${dateShort(p.target)}</div>
          </div>
          <button class="btn btn--primary btn--sm" data-go="account:project:${p.id}">Open project</button>
        </div>
        <div class="tl" style="margin:20px 0">
          ${p.stages.map(sid => {
            const i = p.stages.indexOf(sid), cur = p.stages.indexOf(p.stage);
            return `<div class="tl-s ${i<cur?'tl-s--done':i===cur?'tl-s--now':''}">
              <div class="tl-n">${stageDef(sid).name}</div>
              <div class="tl-m">${i<cur?'Complete':i===cur?st(p.opStatus).label:''}</div></div>`;}).join('')}
        </div>
        <div class="grid grid-3" style="gap:20px">
          <div><div class="stage-lbl">What we are doing</div><div class="stage-txt">${esc(v.doing)}</div></div>
          <div><div class="stage-lbl">What you need to do</div><div class="stage-txt med">${esc(v.youDo)}</div></div>
          <div><div class="stage-lbl">Next milestone</div><div class="stage-txt muted">${
            esc(milestoneLabel(p, p.nextMilestone))}</div></div>
        </div>
        <div class="row" style="margin-top:16px;gap:16px">
          <span class="t-xs faint">Responsible now: <span class="med">${esc(v.responsible)}</span></span>
          <span class="t-xs faint">Updated ${ago(p.lastUpdate)}</span>
          <span class="t-xs faint">Version ${p.version}</span>
        </div>
      </div>`;}).join('')}</div>`
    : `<div class="empty"><div class="empty-t">No projects yet</div>
       <div class="empty-d">PAMUUC creates every project after a first call. When yours is ready it will appear here.</div></div>`}
    <p class="t-xs muted" style="margin-top:24px">There is no "new project" action here, and there will not be. A uniform project has too many dependent decisions to be assembled from a form — we build it with you and publish it when it is ready.</p>
  `);
}

/* ---- the step spine ------------------------------------------------------
   A project is a sequence, so it is drawn as one. The step you are on is open
   and carries everything that step needs; finished steps collapse to a line
   with the date they closed; steps ahead say only what they will involve. The
   alternative — every section on one page, all equally loud — makes the reader
   work out where they are before they can do anything. */
/* The sequence a project runs through. Design is the only optional step, so
   this is the one place that decides what a project's steps are. */
function projectStages(withDesign){
  return STAGES.map(x => x.id).filter(x => x !== 'design' || withDesign);
}

/* How a step is billed, said the same way wherever it appears. Only three
   steps are billed at all, and two of them are taken in full before the work
   starts — which is the single thing a customer most wants stated plainly. */
function stagePay(sid, side){
  const d = stageDef(sid), pay = d && d.pay;
  if(!pay) return null;
  if(pay.kind === 'advance') return side === 'studio'
    ? '100% in advance — the step does not open until it is settled'
    : 'Paid in full before this step starts';
  return side === 'studio' ? 'Invoiced on the account terms' : 'Invoiced on your account terms';
}

function stageDoneWhen(p, sid){
  const e = (p.stageLog || []).find(x => x.stage === sid);
  return e ? 'Completed ' + dateShort(String(e.at).slice(0,10)) : 'Completed';
}

/* Everything genuinely waiting on the customer that lives somewhere else — a
   decision behind a modal, an invoice in Documents. Work belonging to the step
   itself is left to the step's own workspace directly below, rather than
   listed twice in two different voices. */
function accYourPart(p, v){
  const items = [];
  v.approvals.forEach(a => items.push({
    t: a.kind,
    d: a.summary || 'A decision is needed before this step can close.',
    btn:`<button class="btn btn--primary btn--sm" data-act="openApproval" data-id="${esc(a.id)}">Review and decide</button>`}));
  S.documents.filter(d => d.project === p.id && d.visible &&
      (d.state === 'payment_due' || d.state === 'overdue')).forEach(d => items.push({
    t:`${d.title} — ${money(d.amount * 1.21)}`,
    d:`Due ${dateShort(d.due)}. Pay by bank transfer; we confirm it here once it reaches our account.`,
    btn:`<button class="btn btn--primary btn--sm" data-act="openDoc" data-id="${esc(d.id)}">See how to pay</button>`}));
  S.documents.filter(d => d.project === p.id && d.visible && d.state === 'payment_sent').forEach(d => items.push({
    t:`${d.title} — transfer sent`,
    d:'Nothing further from you. We will confirm here once it reaches our account.',
    btn:''}));

  if(!items.length) return `<p class="pstep-none">Nothing needs you on this step right now.</p>`;
  return `<div class="pstep-part">
    <div class="pstep-lbl">Your part now</div>
    <div class="pstep-dos">${items.map(it => `
      <div class="pstep-do">
        <div class="pstep-do-b"><div class="pstep-do-t">${esc(it.t)}</div><div class="pstep-do-d">${esc(it.d)}</div></div>
        ${it.btn}</div>`).join('')}</div></div>`;
}

function accStepper(p, v, cur){
  return `<ol class="pstep-list">${p.stages.map((sid, i) => {
    const d = stageDef(sid);
    if(i < cur) return `<li class="pstep pstep--done">
      <span class="pstep-i" aria-hidden="true">✓</span>
      <div class="pstep-b"><div class="pstep-n">${esc(d.name)}</div>
        <div class="pstep-m">${esc(stageDoneWhen(p, sid))}</div></div></li>`;
    if(i > cur) return `<li class="pstep pstep--later">
      <span class="pstep-i" aria-hidden="true">${i + 1}</span>
      <div class="pstep-b"><div class="pstep-n">${esc(d.name)}</div>
        <div class="pstep-m">${esc(d.blurb)}</div>
        ${stagePay(sid) ? `<div class="pstep-pay">${esc(stagePay(sid))}</div>` : ''}</div></li>`;
    return `<li class="pstep pstep--now" aria-current="pstep">
      <span class="pstep-i" aria-hidden="true">${i + 1}</span>
      <div class="pstep-b">
        <div class="pstep-hd">
          <div><div class="pstep-n">${esc(d.name)}</div>
            <div class="pstep-m">${esc(d.blurb)}</div>
            ${stagePay(sid) ? `<div class="pstep-pay">${esc(stagePay(sid))}</div>` : ''}</div>
          ${pill(p.opStatus)}
        </div>
        <div class="pstep-say">
          <div><span class="pstep-lbl">What we are doing</span><p>${esc(v.doing)}</p></div>
          <div><span class="pstep-lbl">What happens after this</span><p class="muted">${esc(v.next)}</p></div>
        </div>
        ${accYourPart(p, v)}
        <div class="pstep-work">${accStageWorkspace(p, v)}</div>
      </div></li>`;
  }).join('')}</ol>`;
}

/* The material that is true at every step — the proposal, the drawings, the
   money, the record — kept one click away instead of stacked under the step
   and competing with it. Anything holding something open says so on the fold. */
function accRef(p, v, cv, cur, files, feed){
  const open = a => a ? `<span class="pref-n">${a}</span>` : '';
  const blocks = [
    {t:'What we are proposing', n:0,               h:accProposal(p, v)},
    {t:'Design work',           n:0,               h:accDesigns(p, v)},
    {t:'Your decisions',        n:v.approvals.length, h:accDecisions(p, v)},
    {t:'Payments',              n:S.documents.filter(d=>d.project===p.id&&d.visible&&
                                    (d.state==='payment_due'||d.state==='overdue')).length,
                                                   h:accPayments(p, v)},
  ].filter(b => b.h);
  return `
    <h2 class="t-h4 pref-hd">Everything in this project</h2>
    <div class="prefs">
      ${blocks.map(b => `<details class="pref"${b.n ? ' open' : ''}>
        <summary class="pref-s">${esc(b.t)}${open(b.n)}</summary>
        <div class="pref-b">${b.h}</div></details>`).join('')}

      <details class="pref">
        <summary class="pref-s">Conversation with ${esc(user(p.am).name)}</summary>
        <div class="pref-b">
          ${cv && cv.messages.filter(m => !m.internal).length ? cv.messages.filter(m => !m.internal).map(m => `
            <div class="msg">
              <span class="av ${user(m.by).side==='studio'?'av--studio':''}">${user(m.by).init}</span>
              <div class="msg-b">
                <div class="msg-h"><span class="msg-a">${esc(user(m.by).name)}</span>
                  <span class="msg-r">${user(m.by).side==='studio'?'PAMUUC':esc(myAccount().name)} · ${dateTime(m.at)}</span></div>
                <div class="msg-t">${esc(m.text)}</div>
              </div>
            </div>`).join('') : '<p class="t-sm muted">No messages yet.</p>'}
          <div style="margin-top:16px">
            <label class="fld"><span class="fld-l">Write to ${esc(user(p.am).name)}</span>
              <textarea class="inp" id="msgbox" placeholder="Anything about this project…"></textarea></label>
            <div class="btn-row" style="margin-top:8px;justify-content:space-between">
              <span class="t-xs faint">You will get an email saying we replied, with a link back here.</span>
              <button class="btn btn--primary btn--sm" data-act="send" data-cv="${cv?cv.id:''}">Send</button>
            </div>
          </div>
        </div>
      </details>

      <details class="pref">
        <summary class="pref-s">Documents${files.length ? `<span class="pref-n pref-n--quiet">${files.length}</span>` : ''}</summary>
        <div class="pref-b"><div class="stack-2">
          ${files.length ? files.map(d => `
            <div class="rw rw--static">
              <span class="rw-main"><span class="rw-t">${esc(d.title)}</span>
                <span class="rw-s">${esc(d.num)} · ${d.amount ? money(d.amount * 1.21) : '—'}</span></span>
              <span class="rw-side">${pill(d.state)}
                <button class="btn btn--ghost btn--sm" data-act="openDoc" data-id="${esc(d.id)}">Preview</button>
                <button class="btn btn--ghost btn--sm" data-act="dlDoc" data-id="${esc(d.id)}">Download</button>
              </span></div>`).join('')
            : '<p class="t-sm muted">Nothing shared yet.</p>'}
        </div></div>
      </details>

      <details class="pref">
        <summary class="pref-s">Activity</summary>
        <div class="pref-b">
          <div class="feed">
            ${feed.length ? feed.map((e, i) => `<div class="fe ${i===0?'fe--now':''}">
              <div class="t-sm">${esc(e.text)}</div>
              <div class="fe-m">${dateTime(e.at)}</div></div>`).join('')
              : '<p class="t-sm muted">Nothing recorded yet.</p>'}
          </div>
        </div>
      </details>

      ${cur > 0 ? `<details class="pref">
        <summary class="pref-s">History<span class="pref-n pref-n--quiet">${cur} step${cur>1?'s':''} done</span></summary>
        <div class="pref-b"><div class="stack-3">
          ${p.stages.slice(0, cur).map(sid => `
            <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
              <div><div class="t-sm med">${stageDef(sid).name}</div>
                <div class="t-xs muted">${esc(stageDef(sid).blurb)}</div></div>
              <span class="t-xs muted">${esc(stageDoneWhen(p, sid))}</span></div>`).join('')}
          ${S.changeRequests.filter(c => c.project===p.id && c.state==='incorporated').map(c => `
            <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
              <div><div class="t-sm med">${esc(c.title)}</div>
                <div class="t-xs muted">${esc(c.outcome||'')}</div></div>${pill('incorporated')}</div>`).join('')}
        </div></div>
      </details>` : ''}
    </div>`;
}

/* ---- Project detail: stage-driven -------------------------------------- */
function accProject(id){
  const p = project(id);
  if(!p || p.account !== user(SESSION.user).account) return accShell('projects','Project', '<div class="empty">Not found.</div>');
  if(!can(user(SESSION.user),'project','view',{project:p.id}))
    return accShell('projects','Project', `<div class="empty"><div class="empty-t">Not shared with you</div>
      <div class="empty-d">Your account administrator controls which projects you can see. Ask ${esc(user(myAccount().am).name)} or your admin for access.</div></div>`);

  const v = views.customerProject(p);
  const cur = p.stages.indexOf(p.stage);
  const cv = S.conversations.find(c => c.project === p.id);
  const files = S.documents.filter(d => d.project === p.id && d.visible);
  const feed = S.events.filter(e => e.project === p.id && e.customerVisible).slice(0,10);

  return accShell('projects', p.name, `
    <div class="crumbs" style="margin-bottom:16px">
      <a data-go="account:projects">Projects</a><span>›</span><span>${esc(p.name)}</span>
    </div>

    <div class="prj-hd">
      <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <h1 class="t-h3">${esc(p.name)}</h1>
          <div class="mono-ref" style="margin-top:4px">${p.ref} · version ${p.version}, published ${dateTime(p.publishedAt)}</div>
        </div>
        <div class="prj-am">
          <span class="av av--studio">${user(p.am).init}</span>
          <div><div class="t-sm med">${esc(user(p.am).name)}</div>
            <div class="t-xs muted">${esc(user(p.am).title)} · step ${cur + 1} of ${p.stages.length}</div></div>
        </div>
      </div>
    </div>

    ${v.gate.blocked && v.gate.state !== 'draft' ? `
      <div class="banner banner--wait" style="margin-bottom:24px"><div>
        <div class="banner-t">${esc(v.gate.label)} — ${st(v.gate.state).label.toLowerCase()}</div>
        <div class="banner-d">${esc(v.gate.why)}</div>
      </div></div>` : ''}

    ${accStepper(p, v, cur)}

    ${accRef(p, v, cv, cur, files, feed)}

  `);
}

/* ---- what the studio has put in front of you ----------------------------
   One place that answers the three questions a customer actually has: what
   are you proposing, what does it cost, and what do you need from me. It
   sits above the stage workspace because it is true at every stage. */

function accDecisions(p, v){
  const open = v.decisions.filter(a => a.state === 'awaiting_customer');
  const done = v.decisions.filter(a => a.state !== 'awaiting_customer');
  if(!v.decisions.length) return '';
  return `
  <section>
    <h2 class="t-h4" style="margin-bottom:12px">Your decisions</h2>
    ${open.length ? `<div class="stack-3">
      ${open.map(a => `<div class="pp-dec">
        <div class="pp-dec-b">
          <div class="t-h5">${esc(a.kind)}</div>
          <p class="t-sm muted" style="margin-top:6px">${esc(a.summary)}</p>
          <div class="t-xs faint" style="margin-top:8px">${esc(a.rev)}${a.due ? ' · answer needed by ' + dateShort(a.due) : ''}</div>
        </div>
        <button class="btn btn--primary btn--sm" data-act="openApproval" data-id="${a.id}">Accept or decline</button>
      </div>`).join('')}
    </div>` : `<div class="card card--quiet"><span class="t-sm muted">Nothing is waiting on you right now.</span></div>`}
    ${done.length ? `<details class="card" style="margin-top:12px">
      <summary style="cursor:pointer" class="t-sm med">${done.length} decision${done.length>1?'s':''} already made</summary>
      <div class="stack-2" style="margin-top:12px">
        ${done.map(a => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line);gap:12px">
          <div style="min-width:0"><div class="t-sm">${esc(a.kind)}</div>
            <div class="t-xs muted">${a.decidedAt ? dateTime(a.decidedAt) : ''}${a.comment ? ' — “' + esc(a.comment) + '”' : ''}</div></div>
          ${pill(a.state)}</div>`).join('')}
      </div></details>` : ''}
  </section>`;
}

function accProposal(p, v){
  const gs = v.garments;
  if(!v.note && !v.boards.length && !gs.length) return '';
  return `
  <section>
    <div class="row-between" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <h2 class="t-h4">What we are proposing</h2>
      <span class="t-xs faint">Version ${p.version} · ${dateTime(p.publishedAt)}</span>
    </div>

    ${v.note ? `<div class="card" style="margin-bottom:16px">
      <p class="t-sm" style="white-space:pre-wrap">${esc(v.note)}</p>
      <div class="row" style="margin-top:14px;gap:10px">
        <span class="av av--studio">${v.am.init}</span>
        <div><div class="t-sm med">${esc(v.am.name)}</div>
          <div class="t-xs muted">${esc(v.am.title)}</div></div>
      </div>
    </div>` : ''}

    ${v.boards.length ? `<div class="pp-boards">
      ${v.boards.map(b => `<figure class="pp-board">
        <img src="${b.src}" alt="${esc(b.cap || 'Reference image')}" loading="lazy">
        ${b.cap ? `<figcaption>${esc(b.cap)}</figcaption>` : ''}
      </figure>`).join('')}
    </div>` : ''}

    ${gs.length ? `<div class="pp-line">
      ${gs.map(g => {
        const im = (g.images || [])[0];
        const pieces = garmentPieces(g);
        return `<div class="pp-item">
          <div class="pp-item-m">${im
            ? `<img src="${im.src}" alt="${esc(im.cap || g.name)}" loading="lazy">`
            : `<span class="pp-item-ph">${g.glyph}</span>`}</div>
          <div class="pp-item-b">
            <div class="row-between" style="align-items:flex-start;gap:8px;flex-wrap:wrap">
              <div style="min-width:0">
                <div class="t-sm med">${esc(g.name)}</div>
                <div class="t-xs muted">${esc(p.positions.find(x => x.id === g.position)?.name || '')}</div>
              </div>
              ${pill(g.state)}
            </div>
            ${g.summary ? `<p class="t-sm muted" style="margin-top:8px">${esc(g.summary)}</p>` : ''}
            <div class="wrap-row" style="margin-top:10px;gap:6px">
              <span class="chip">${esc(FABRICS[g.fabric] ? FABRICS[g.fabric].name : g.fabric)}</span>
              <span class="chip">${esc(S.personalization[g.pers.method].name)}</span>
              ${(g.colourways||[]).map(c => `<span class="sw" title="${esc(COLOURS[c.colour].name)}" style="background:${COLOURS[c.colour].hex}"></span>`).join('')}
            </div>
            <div class="pp-item-f">
              <span class="t-xs muted">${pieces ? pieces + ' piece' + (pieces === 1 ? '' : 's') : 'Quantities not set yet'}</span>
              <span class="t-sm num ${g.unitPrice != null ? 'med' : 'muted'}">${g.unitPrice != null
                ? money(g.unitPrice) + ' each' + (garmentValue(g) ? ' · ' + money(garmentValue(g)) : '')
                : 'Price to follow'}</span>
            </div>
          </div>
        </div>`;}).join('')}
    </div>` : ''}

    ${v.money.total ? `<div class="pp-total">
      <div>
        <div class="t-xs faint">Total as proposed today, before VAT</div>
        <div class="t-h4 num" style="margin-top:4px">${money(v.money.total)}</div>
      </div>
      <div class="t-xs muted" style="max-width:44ch;text-align:right">
        ${v.money.unpriced
          ? `${v.money.unpriced} garment${v.money.unpriced > 1 ? 's are' : ' is'} not priced yet. Nothing is charged until you have accepted it.`
          : 'Nothing here is charged until you have accepted it and a payment step falls due.'}
      </div>
    </div>` : ''}
  </section>`;
}

function accDesigns(p, v){
  const all = (p.designs || []).filter(z => z.state === 'published');
  if(!all.length) return '';
  return `
  <section>
    <h2 class="t-h4" style="margin-bottom:12px">Design work</h2>
    <div class="stack-3">
      ${all.map(z => {
        const gate = z.gate ? milestones(p).find(m => m.id === z.gate) : null;
        const held = gate && gate.state !== 'paid';
        return `<div class="card">
          <div class="row-between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
            <div style="min-width:0"><div class="t-h5">${esc(z.title)}</div>
              <div class="t-xs muted" style="margin-top:2px">${esc(z.by)}</div></div>
            ${held ? pill('payment_due') : pill('published')}
          </div>
          ${z.note ? `<p class="t-sm muted" style="margin-top:10px">${esc(z.note)}</p>` : ''}
          ${held ? `<div class="pp-held">
            <div class="pp-held-t">Ready and waiting</div>
            <p class="t-sm muted" style="margin-top:6px">This work is released once <strong>${esc(gate.label)}</strong>
              (${money(gate.amount)}) is settled. It exists, it is finished, and it is yours the moment that is done.</p>
            <div class="btn-row" style="margin-top:12px">
              <button class="btn btn--primary btn--sm" data-go="account:documents">Go to the payment</button></div>
          </div>`
          : `${z.file ? `<div class="dsn-doc" style="margin-top:12px">
              <span class="dsn-ico" aria-hidden="true">PDF</span>
              <div class="dsn-b"><div class="dsn-t">${esc(z.file.name)}</div>
                <div class="dsn-m">${fileSize(z.file.size)}${z.publishedAt?' · published '+dateShort(String(z.publishedAt).slice(0,10)):''}</div></div>
              <span class="btn-row" style="flex-wrap:nowrap">
                <button class="btn btn--primary btn--sm" data-act="pvFile" data-dz="${esc(z.id)}" data-p="${esc(p.id)}">Preview</button>
                <button class="btn btn--ghost btn--sm" data-act="dlFile" data-dz="${esc(z.id)}" data-p="${esc(p.id)}">Download</button>
              </span>
            </div>` : ''}
            ${(z.images||[]).length ? `<div class="pp-boards" style="margin-top:12px">
              ${z.images.map((im, ix) => `<figure class="pp-board" data-act="pvImg"
                  data-p="${esc(p.id)}" data-dz="${esc(z.id)}" data-i="${ix}" tabindex="0"
                  role="button" aria-label="Open ${esc(im.cap || z.title)}">
                <img src="${im.src}" alt="${esc(im.cap || z.title)}" loading="lazy">
                ${im.cap ? `<figcaption>${esc(im.cap)}</figcaption>` : ''}</figure>`).join('')}
            </div>` : ''}`}
        </div>`;}).join('')}
    </div>
  </section>`;
}

function accPayments(p, v){
  const ms = v.milestones.filter(m => m.state !== 'draft');
  if(!ms.length) return '';
  const paid = ms.filter(m => m.state === 'paid').reduce((t,m) => t + m.amount, 0);
  return `
  <section>
    <div class="row-between" style="margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <h2 class="t-h4">Payments on this project</h2>
      <span class="t-xs faint num">${money(paid)} of ${money(ms.reduce((t,m) => t + m.amount, 0))} settled</span>
    </div>
    <div class="stack-2">
      ${ms.map(m => {
        const dd = m.docId ? doc(m.docId) : null;
        const now = m.stage === p.stage && m.state !== 'paid';
        return `<div class="pp-pay ${now ? 'pp-pay--now' : ''}">
          <div class="pp-pay-b">
            <div class="t-sm med">${esc(m.label)}</div>
            ${m.what ? `<div class="t-xs muted" style="margin-top:4px">${esc(m.what)}</div>` : ''}
            <div class="t-xs faint" style="margin-top:6px">
              ${m.stage ? 'Holds ' + stageDef(m.stage).name : 'Does not hold a stage'}${m.due ? ' · due ' + dateShort(m.due) : ''}${dd ? ' · ' + dd.num : ''}</div>
          </div>
          <div class="pp-pay-a">
            <span class="t-sm num med">${money(m.amount)}</span>
            ${pill(m.state)}
            ${dd && (dd.state === 'payment_due' || dd.state === 'overdue')
              ? `<button class="btn btn--primary btn--sm" data-act="openDoc" data-id="${dd.id}">See how to pay</button>`
              : dd ? `<button class="btn btn--quiet btn--sm" data-act="openDoc" data-id="${dd.id}">View</button>` : ''}
          </div>
        </div>`;}).join('')}
    </div>
  </section>`;
}

/* ---- Stage workspaces --------------------------------------------------- */
function accStageWorkspace(p, v){
  /* The three steps before an account exists have no workspace: they happened
     by email and on a call, and the step itself already says so. */
  if(['enquiry','qualification','first_call'].includes(p.stage)) return '';
  if(p.stage === 'design')        return accWsDesign(p, v);
  if(p.stage === 'project_build') return accWsBuild(p, v);
  if(p.stage === 'development')   return accWsDevelop(p, v);
  if(p.stage === 'production')    return accWsProduction(p, v);
  return accWsDelivery(p, v);
}

/* ---- Design: one document ------------------------------------------------
   What a customer buys when they pay a design fee is a drawing, and what they
   receive is the file of it. So this step shows that file and nothing else —
   no boards, no galleries, no commentary competing with the thing they paid
   for. Held until the fee is settled, and downloadable the moment it is. §7.5 */
function designDoc(p){
  return (p.designs || []).filter(z => z.state === 'published' && z.file)
    .sort((a,b) => String(b.at).localeCompare(String(a.at)))[0] || null;
}

function accWsDesign(p, v){
  const doc0 = designDoc(p);
  /* the fee that holds this step, whether or not it is the gate right now */
  const fee = milestones(p).find(m => m.stage === 'design' && m.state !== 'not_required');
  const invoice = fee && fee.docId ? doc(fee.docId) : null;
  const paid = !fee || fee.state === 'paid';
  /* a declared transfer is recorded on the invoice, not on the payment step —
     the step only moves when the money is actually seen */
  const sent = !!invoice && invoice.state === 'payment_sent';

  if(doc0 && paid) return `
    <section>
      <div class="dsn">
        <div class="dsn-doc">
          <span class="dsn-ico" aria-hidden="true">PDF</span>
          <div class="dsn-b">
            <div class="dsn-t">${esc(doc0.title)}</div>
            <div class="dsn-m">${esc(doc0.file.name)}${doc0.file.size?' · '+fileSize(doc0.file.size):''} ·
              ${esc(doc0.by)} · published ${dateShort(String(doc0.publishedAt || doc0.at).slice(0,10))}</div>
          </div>
          <span class="btn-row" style="flex-wrap:nowrap">
            <button class="btn btn--primary btn--sm" data-act="pvFile" data-dz="${esc(doc0.id)}" data-p="${esc(p.id)}">Preview</button>
            <button class="btn btn--ghost btn--sm" data-act="dlFile" data-dz="${esc(doc0.id)}" data-p="${esc(p.id)}">Download</button>
          </span>
        </div>
        ${doc0.note ? `<p class="dsn-note">${esc(doc0.note)}</p>` : ''}
        <p class="dsn-next">The garments in this drawing are built at the next step, where the fabrics,
          colours, quantities and sizes are settled with you one by one.</p>
      </div>
    </section>`;

  if(doc0 && !paid) return `
    <section>
      <div class="dsn">
        <div class="dsn-held">
          <span class="dsn-ico dsn-ico--off" aria-hidden="true">PDF</span>
          <div class="dsn-b">
            <div class="dsn-t">${esc(doc0.title)} is ready</div>
            <div class="dsn-m">${sent
              ? 'You have told us the transfer is sent. The drawing unlocks here as soon as it reaches our account — usually the next working day.'
              : `It is released once ${esc(fee.label.toLowerCase())} is settled.`}</div>
          </div>
          ${!sent && invoice ? `<button class="btn btn--primary btn--sm" data-act="openDoc" data-id="${esc(invoice.id)}">See how to pay</button>` : ''}
        </div>
      </div>
    </section>`;

  return `
    <section>
      <div class="dsn">
        <div class="dsn-wait">
          <div class="dsn-t">The drawing is being made</div>
          <p class="dsn-m">Your designer is working from the brief below. When it is finished it appears
            here as a single document you can download and keep.</p>
        </div>
        <div class="dsn-brief">
          <div class="eyebrow">The brief it is being drawn from</div>
          <p class="t-sm" style="margin-top:8px">${esc(p.brief)}</p>
        </div>
      </div>
    </section>`;
}

function accWsBuild(p, v){
  const editable = !v.gate.blocked;
  return `
  <section>
    <div class="row-between" style="margin-bottom:12px">
      <h2 class="t-h4">Positions and garments</h2>
      <span class="t-xs faint">${p.positions.length} positions · ${v.garments.length} garments · ${projectPieces(p)} pieces</span>
    </div>
    ${v.openCRs.length ? `<div class="banner banner--wait" style="margin-bottom:16px"><div>
      <div class="banner-t">${v.openCRs.length} request${v.openCRs.length>1?'s':''} under review</div>
      <div class="banner-d">Your approved specification is unchanged until we accept a request and build it into a new revision.</div>
      <div class="stack-2" style="margin-top:12px">
        ${v.openCRs.map(c => `<div class="row-between">
          <span class="t-sm">${esc(c.title)}</span>${pill(c.state)}</div>`).join('')}
      </div></div></div>` : ''}

    <div class="stack">
      ${p.positions.map(pos => `
        <div class="card card--flush">
          <div class="row-between" style="padding:16px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:12px">
            <div>
              <div class="t-h5">${esc(pos.name)}</div>
              <div class="t-xs muted">${pos.people} people in this role</div>
            </div>
            <div class="btn-row">
              <button class="btn btn--ghost btn--sm" data-act="reqRename" data-pos="${pos.id}" data-p="${p.id}"
                ${editable?'':'disabled'}>Request a name change</button>
              <button class="btn btn--ghost btn--sm" data-act="reqGarment" data-pos="${pos.id}" data-p="${p.id}"
                ${editable?'':'disabled'}>Request another garment</button>
            </div>
          </div>
          <div style="padding:20px" class="stack">
            ${pos.garments.map(gid => accGarmentCard(garment(gid), p, editable)).join('')}
          </div>
        </div>`).join('')}
    </div>
    ${editable ? `<div class="banner" style="margin-top:16px"><div>
      <div class="banner-t">Changes you make here are drafts</div>
      <div class="banner-d">Edit quantities and colours freely. Nothing reaches production until you submit it and we accept it into a new revision.</div></div></div>` : ''}
  </section>`;
}

function accGarmentCard(g, p, editable){
  if(!g) return '';
  const b = base(g.base);
  const total = g.colourways.reduce((t,c) => t + (+c.qty||0), 0);
  const dirty = UI.dirty && UI.dirty[g.id];
  return `
  <div class="gcard">
    <div class="gcard-hd">
      <div class="gcard-th">${(g.images||[]).length
        ? `<img src="${g.images[0].src}" alt="${esc(g.images[0].cap || g.name)}" loading="lazy">`
        : g.glyph}</div>
      <div style="flex:1;min-width:0">
        <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <div class="t-h5">${esc(g.name)}</div>
            <div class="mono-ref">${b.ref} ${g.baseV} · revision ${g.rev}</div>
          </div>
          ${pill(g.state)}
        </div>
        <div class="wrap-row" style="margin-top:10px;gap:8px">
          <span class="chip">${esc(FABRICS[g.fabric] ? FABRICS[g.fabric].name : g.fabric)}</span>
          <span class="chip">${esc(S.personalization[g.pers.method].name)} · ${esc(S.positions_lib[g.pers.pos])}</span>
          ${FABRICS[g.fabric] && FABRICS[g.fabric].prov ? '<span class="chip">Provenance on file</span>' : ''}
          ${g.unitPrice != null ? `<span class="chip chip--on">${money(g.unitPrice)} per piece</span>` : ''}
        </div>
        ${g.summary ? `<p class="t-sm muted" style="margin-top:10px">${esc(g.summary)}</p>` : ''}
      </div>
    </div>
    <div class="gcard-b">
      ${(g.images||[]).length > 1 ? `<div class="pp-strip">
        ${g.images.slice(1).map(im => `<figure class="pp-strip-i">
          <img src="${im.src}" alt="${esc(im.cap || g.name)}" loading="lazy">
          ${im.cap ? `<figcaption>${esc(im.cap)}</figcaption>` : ''}</figure>`).join('')}
      </div>` : ''}
      ${editable ? `
      <label class="field" style="margin-bottom:16px">
        <span class="field-l">Fabric</span>
        <span class="field-h">Only fabrics we have mapped to this garment base are offered. Ask us if you want one that is not here.</span>
        <select class="inp" data-act="pickFabric" data-g="${g.id}" style="max-width:340px">
          ${b.fabrics.filter(f => FABRICS[f]).map(f => `<option value="${f}" ${f===g.fabric?'selected':''}>${esc(FABRICS[f].name)} — ${esc(FABRICS[f].spec)}</option>`).join('')}
        </select>
      </label>` : ''}

      <div class="row-between" style="margin-bottom:8px">
        <span class="field-l" style="margin:0">Colours and quantities</span>
        <span class="t-sm num">Total <span class="med">${total}</span></span>
      </div>
      ${g.colourways.map(cw => `
        <div class="cw">
          <div class="row">
            <span class="sw sw--lg" style="background:${COLOURS[cw.colour].hex}"></span>
            <div>
              <div class="t-sm med">${esc(COLOURS[cw.colour].name)}
                ${COLOURS[cw.colour].custom ? '<span class="chip" style="margin-left:6px">Custom</span>':''}</div>
              <div class="t-xs muted">${cwSum(cw) === cw.qty
                ? `<span class="sum-ok">Size split sums to ${cw.qty}</span>`
                : `<span class="sum-bad">Size split sums to ${cwSum(cw)}, quantity is ${cw.qty}</span>`}</div>
            </div>
          </div>
          <input class="inp inp--num" type="number" min="0" value="${cw.qty}"
            data-act="setQty" data-g="${g.id}" data-cw="${cw.id}" ${editable?'':'disabled'}>
          ${editable && g.colourways.length > 1 ? `<button class="btn btn--quiet btn--sm" data-act="rmCw" data-g="${g.id}" data-cw="${cw.id}">Remove</button>` : '<span></span>'}
        </div>`).join('')}

      ${editable ? `
      <div class="wrap-row" style="margin-top:12px;gap:8px">
        <span class="t-xs muted">Add a colour:</span>
        ${b.colours.filter(c => !g.colourways.some(x => x.colour === c)).map(c => `
          <button class="sw-btn" data-act="addCw" data-g="${g.id}" data-c="${c}">
            <span class="sw" style="background:${COLOURS[c].hex}"></span>${esc(COLOURS[c].name)}</button>`).join('')}
        <button class="btn btn--quiet btn--sm" data-act="reqColour" data-g="${g.id}">Request another colour</button>
      </div>` : ''}

      ${dirty ? `<div class="banner banner--wait" style="margin-top:16px"><div>
        <div class="banner-t">You have unsubmitted changes on this garment</div>
        <div class="banner-d">Nothing has changed in our records yet. Submit them for review and we will tell you what we can accept.</div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn--primary btn--sm" data-act="submitCr" data-g="${g.id}" data-p="${p.id}">Submit changes for review</button>
          <button class="btn btn--quiet btn--sm" data-act="discardCr" data-g="${g.id}">Discard</button>
        </div></div></div>` : ''}
    </div>
  </div>`;
}

function accWsDevelop(p, v){
  /* Once every garment is approved the only thing left in this step is the
     lock: final quantities and size splits, which used to be a step of its
     own and is really the last thing Development does. */
  const gs = S.garments.filter(g => g.project === p.id);
  if(gs.length && gs.every(g => g.state === 'approved')) return accWsPrePro(p, v);
  return accWsFitting(p, v);
}

function accWsFitting(p, v){
  const meeting = S.meetings.find(m => m.project === p.id && ['proposed','alternative'].includes(m.state));
  const accepted = S.meetings.find(m => m.project === p.id && m.state === 'accepted');
  const approvedN = v.garments.filter(g => g.state === 'approved').length;
  return `
  <section>
    <div class="row-between" style="margin-bottom:12px">
      <h2 class="t-h4">Samples and fittings</h2>
      <span class="chip">${approvedN} of ${v.garments.length} approved</span>
    </div>

    ${meeting ? `
    <div class="card" style="margin-bottom:16px">
      <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div><div class="t-h5">${esc(meeting.kind)}</div>
          <div class="t-xs muted" style="margin-top:4px">${esc(meeting.method)} · ${esc(meeting.location)}</div></div>
        ${pill(meeting.state)}
      </div>
      ${meeting.state === 'proposed' ? `
      <p class="t-sm muted" style="margin:16px 0 12px">Choose the time that works for your team. Accepting one closes the others.</p>
      <div class="wrap-row">
        ${meeting.slots.map(s => `<button class="btn btn--ghost" data-act="acceptSlot" data-m="${meeting.id}" data-s="${esc(s)}">${dateTime(s)}</button>`).join('')}
        <button class="btn btn--quiet" data-act="altSlot" data-m="${meeting.id}">None of these work</button>
      </div>` : `<p class="t-sm muted" style="margin-top:12px">We have your note and will propose new times. Your original proposals are kept.</p>`}
    </div>` : ''}

    ${accepted ? `<div class="banner banner--go" style="margin-bottom:16px"><div>
      <div class="banner-t">Fitting confirmed — ${dateTime(accepted.chosen)}</div>
      <div class="banner-d">${esc(accepted.method)} at ${esc(accepted.location)}.</div></div></div>` : ''}

    <div class="banner" style="margin-bottom:16px"><div>
      <div class="banner-t">Each garment is approved on its own</div>
      <div class="banner-d">Approving one garment locks it at its revision. Any garment you send back goes into another round without touching the ones you have already approved. Three rounds is the limit — after that we resolve it with you directly rather than making a fourth sample.</div></div></div>

    <div class="stack">
      ${v.garments.map(g => {
        const canAct = ['feedback_required','ready_fitting','fitting_scheduled'].includes(g.state);
        return `
        <div class="gcard">
          <div class="gcard-hd">
            <div class="gcard-th">${g.glyph}</div>
            <div style="flex:1;min-width:0">
              <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
                <div>
                  <div class="t-h5">${esc(g.name)}</div>
                  <div class="mono-ref">Revision ${g.rev} · ${esc(FABRICS[g.fabric].name)}</div>
                </div>
                <div class="row" style="gap:8px">
                  <span class="chip">Round ${g.round} of 3</span>
                  ${pill(g.state)}
                </div>
              </div>
              <div class="bar" style="margin-top:12px;max-width:180px">
                <div class="bar-f ${g.state==='approved'?'bar-f--go':g.round>=3?'bar-f--wait':''}" style="width:${Math.min(100,(g.round/3)*100)}%"></div>
              </div>
            </div>
          </div>
          <div class="gcard-b">
            <p class="t-sm muted">${esc(g.notes || '')}</p>
            ${(g.feedback||[]).length ? `<div class="stack-2" style="margin-top:12px">
              ${g.feedback.map(f => `<div class="card card--quiet" style="padding:12px">
                <div class="t-xs faint">${esc(user(f.by).name)} · ${dateShort(f.at)}</div>
                <div class="t-sm" style="margin-top:4px">${esc(f.text)}</div></div>`).join('')}
            </div>` : ''}

            ${g.state === 'manual_resolution' ? `
              <div class="banner banner--stop" style="margin-top:16px"><div>
                <div class="banner-t">We will contact you about this garment</div>
                <div class="banner-d">This is the third round and it is still not right. Rather than make a fourth sample we would like to talk about the options — a different cloth, a higher quantity, or leaving this garment out of the project. ${esc(user(p.am).name)} will call you.</div></div></div>`
            : g.state === 'approved' ? `
              <div class="banner banner--go" style="margin-top:16px"><div>
                <div class="banner-t">Approved and locked at revision ${g.rev}</div>
                <div class="banner-d">Approved ${dateShort(g.approvedAt)}. Nothing that happens to the other garments will change this one.</div></div></div>`
            : canAct ? `
              <div style="margin-top:16px">
                <label class="field"><span class="field-l">Fitting feedback</span>
                  <span class="field-h">Tell us what happened when a real person wore it doing real work. That is more useful than a measurement.</span>
                  <textarea class="inp" id="fb_${g.id}" placeholder="Where it binds, what falls out, what people said…"></textarea></label>
                <div class="btn-row">
                  <button class="btn btn--primary btn--sm" data-act="approveG" data-g="${g.id}">Approve this garment</button>
                  <button class="btn btn--ghost btn--sm" data-act="changesG" data-g="${g.id}">Request changes</button>
                </div>
              </div>`
            : `<div class="banner" style="margin-top:16px"><div>
                <div class="banner-t">${st(g.state).label}</div>
                <div class="banner-d">${esc(st(g.state).say)}</div></div></div>`}
          </div>
        </div>`;}).join('')}
    </div>
  </section>`;
}

function accWsPrePro(p, v){
  const problems = gateBlockers(p).filter(b => b.kind === 'data');
  const pf = S.documents.find(d => d.project === p.id && d.type === 'Pro forma' && d.visible);
  return `
  <section>
    <h2 class="t-h4" style="margin-bottom:12px">Final production matrix</h2>
    ${problems.length ? `<div class="banner banner--stop" style="margin-bottom:16px"><div>
      <div class="banner-t">${problems.length} thing${problems.length>1?'s':''} to resolve before we can lock this</div>
      <div class="banner-d">Every colourway quantity must equal the sum of its size split.</div>
      <ul class="stack-2" style="margin-top:8px">${problems.map(b => `<li class="t-sm">· ${esc(b.text)}</li>`).join('')}</ul>
    </div></div>` : `<div class="banner banner--go" style="margin-bottom:16px"><div>
      <div class="banner-t">Every quantity balances</div>
      <div class="banner-d">Size splits match their colourway quantities. This is ready to lock.</div></div></div>`}

    <div class="stack">
      ${v.garments.filter(g => g.state === 'approved').map(g => `
        <div class="gcard">
          <div class="gcard-hd">
            <div class="gcard-th">${g.glyph}</div>
            <div style="flex:1">
              <div class="t-h5">${esc(g.name)}</div>
              <div class="mono-ref">Revision ${g.rev} · ${esc(FABRICS[g.fabric].name)} · ${esc(S.personalization[g.pers.method].name)} at ${esc(S.positions_lib[g.pers.pos])}</div>
            </div>
          </div>
          <div class="gcard-b">
            ${g.colourways.map(cw => `
              <div style="padding:12px 0;border-bottom:1px solid var(--line)">
                <div class="row-between">
                  <div class="row"><span class="sw" style="background:${COLOURS[cw.colour].hex}"></span>
                    <span class="t-sm med">${esc(COLOURS[cw.colour].name)}</span></div>
                  <span class="t-sm num">${pcs(cw.qty)}
                    ${cwSum(cw)===cw.qty?'<span class="sum-ok">· balanced</span>':`<span class="sum-bad">· split is ${cwSum(cw)}</span>`}</span>
                </div>
                <div class="sizes">
                  ${Object.keys(cw.sizes||{}).length ? Object.keys(cw.sizes).map(sz => `
                    <div class="size-f"><span class="size-l">${esc(sz)}</span>
                      <input class="size-i" type="number" min="0" value="${cw.sizes[sz]}"
                        data-act="setSize" data-g="${g.id}" data-cw="${cw.id}" data-s="${esc(sz)}"></div>`).join('')
                    : SIZES.map(sz => `<div class="size-f"><span class="size-l">${sz}</span>
                      <input class="size-i" type="number" min="0" value="0"
                        data-act="setSize" data-g="${g.id}" data-cw="${cw.id}" data-s="${sz}"></div>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </div>`).join('')}
    </div>

    <div class="card" style="margin-top:24px">
      <div class="eyebrow">Delivery destinations</div>
      <div class="stack-2" style="margin-top:12px">
        ${myAccount().locations.map(l => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <div><div class="t-sm med">${esc(l.name)}</div><div class="t-xs muted">${esc(l.addr)}</div></div>
          <span class="t-sm num">${l.people} people</span></div>`).join('')}
      </div>
    </div>

    <div class="btn-row" style="margin-top:24px">
      <button class="btn btn--primary btn--lg" data-act="approveSpec" data-p="${p.id}" ${problems.length?'disabled':''}>
        Approve the production specification</button>
      ${pf ? `<button class="btn btn--ghost btn--lg" data-go="account:documents">Review the pro forma</button>` : ''}
    </div>
    ${problems.length ? '<p class="t-xs muted" style="margin-top:8px">Resolve the quantities above to enable this.</p>' : ''}
  </section>`;
}

function accWsProduction(p, v){
  return `<section><h2 class="t-h4" style="margin-bottom:12px">Production</h2>
    <div class="card">
      <div class="banner banner--go"><div><div class="banner-t">Specification locked</div>
        <div class="banner-d">Your garments are being manufactured against the snapshot you approved. Changes at this stage affect price and timing and need a new approval.</div></div></div>
      <div class="sep"></div>
      <div class="eyebrow">Confirmed quantities</div>
      <div class="tw" style="margin-top:12px;border:0;box-shadow:none">
        <table class="tbl"><thead><tr><th>Garment</th><th>Colour</th><th class="tnum">Quantity</th><th>State</th></tr></thead>
        <tbody>${v.garments.flatMap(g => g.colourways.map(cw => `<tr>
          <td>${esc(g.name)}</td><td><span class="row"><span class="sw" style="background:${COLOURS[cw.colour].hex}"></span>${esc(COLOURS[cw.colour].name)}</span></td>
          <td class="tnum num">${cw.qty}</td><td>${pill('in_production')}</td></tr>`)).join('')}</tbody></table>
      </div>
      <div class="sep"></div>
      <div class="eyebrow">Milestones</div>
      <div class="feed" style="margin-top:12px">
        ${[['Fabric received and inspected','2026-08-14','done'],
           ['Cutting complete','2026-08-29','done'],
           ['Assembly in progress','2026-09-08','now'],
           ['Quality review','2026-10-02',''],
           ['Ready for dispatch','2026-10-10','']]
          .map(([t,d,s]) => `<div class="fe ${s==='now'?'fe--now':''}">
            <div class="t-sm ${s?'':'muted'}">${t}</div><div class="fe-m">${dateShort(d)}${s==='done'?' · complete':s==='now'?' · in progress':' · estimated'}</div></div>`).join('')}
      </div>
    </div></section>`;
}

function accWsDelivery(p, v){
  const ships = S.shipments.filter(s => s.project === p.id);
  return `<section><h2 class="t-h4" style="margin-bottom:12px">Delivery</h2>
    ${p.completed ? `<div class="banner banner--go" style="margin-bottom:16px"><div>
      <div class="banner-t">Project complete — delivered ${dateShort(p.deliveredOn)}</div>
      <div class="banner-d">${v.garments.filter(g=>g.reorderable).length} approved garments are available to reorder from their archived specifications.</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn btn--primary btn--sm" data-go="account:reorders">Go to Reorders</button></div>
    </div></div>` : ''}
    <div class="card">
      ${ships.length ? ships.map(s => `
        <div class="row-between" style="padding:12px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:8px">
          <div><div class="t-sm med">${esc(s.dest)}</div>
            <div class="t-xs muted">${esc(s.carrier)} · ${esc(s.tracking)} · ${s.pieces} pieces</div></div>
          <div class="row" style="gap:8px">${pill(s.state)}
            <span class="t-xs muted">${dateShort(s.at)}</span></div>
        </div>`).join('') : '<p class="t-sm muted">No shipments yet.</p>'}
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn--ghost btn--sm" data-act="confirmReceipt">Confirm receipt</button>
        <button class="btn btn--quiet btn--sm" data-act="reportIssue">Report an issue</button>
      </div>
    </div></section>`;
}

/* ---- Reorders ---------------------------------------------------------- */
function accReorders(){
  const items = myReorderables();
  return accShell('reorders', 'Reorders', `
    <div class="page-hd">
      <h1 class="t-h2">Reorders</h1>
      <p class="page-sub">Garments approved and delivered in completed projects. A reorder clones the exact archived production snapshot — the same fabric, colour, artwork position and measurements. We never quietly substitute a newer base.</p>
    </div>
    ${items.length ? `<div class="grid grid-2">${items.map(g => {
      const p = project(g.project);
      return `<div class="card">
        <div class="row" style="align-items:flex-start;gap:16px">
          <div class="gcard-th" style="width:64px;height:80px;font-size:28px">${g.glyph}</div>
          <div style="flex:1;min-width:0">
            <div class="row-between" style="align-items:flex-start">
              <div><div class="t-h5">${esc(g.name)}</div>
                <div class="mono-ref">${base(g.base).ref} · revision ${g.rev} (locked)</div></div>
              ${pill('approved')}
            </div>
            <div class="stack-2" style="margin-top:12px">
              <div class="factline"><span>From</span><span>${esc(p.name)}</span></div>
              <div class="factline"><span>Fabric</span><span>${esc(FABRICS[g.fabric].name)}</span></div>
              <div class="factline"><span>Identity</span><span>${esc(S.personalization[g.pers.method].name)} at ${esc(S.positions_lib[g.pers.pos])}</span></div>
              <div class="factline"><span>Colours</span><span class="row" style="gap:6px">
                ${g.colourways.map(cw => `<span class="sw" style="background:${COLOURS[cw.colour].hex}" title="${esc(COLOURS[cw.colour].name)}"></span>`).join('')}</span></div>
              <div class="factline"><span>Last order</span><span>${g.lastQty} pieces · ${dateShort(g.lastOrdered)}</span></div>
              <div class="factline"><span>Unit price</span><span class="num med">${money(g.unitPrice)}</span></div>
            </div>
          </div>
        </div>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn--primary btn--sm" data-act="startReorder" data-g="${g.id}">Reorder this garment</button>
          <span class="t-xs faint">Lead time confirmed on quote</span>
        </div>
      </div>`;}).join('')}</div>`
      : `<div class="empty"><div class="empty-t">Nothing to reorder yet</div>
         <div class="empty-d">When a project is delivered, its approved garments appear here and stay available at their archived specification.</div></div>`}

    ${S.reorders.length ? `
    <section style="margin-top:32px">
      <h2 class="t-h4" style="margin-bottom:12px">Reorder history</h2>
      <div class="tw"><table class="tbl">
        <thead><tr><th>Garment</th><th>Submitted</th><th class="tnum">Pieces</th><th class="tnum">Value</th><th>Status</th></tr></thead>
        <tbody>${S.reorders.filter(r => r.account === myAccount().id).map(r => `<tr>
          <td>${esc(garment(r.garment).name)}</td><td>${dateShort(r.at)}</td>
          <td class="tnum num">${r.qty}</td><td class="tnum num">${money(r.value)}</td>
          <td>${pill(r.state)}</td></tr>`).join('')}</tbody></table></div>
    </section>` : ''}
  `);
}

/* ---- Merchandise (customer side) --------------------------------------- */
function accMerch(){
  const acc = myAccount();
  const qs = S.merchQuotes.filter(q => q.account === acc.id || !q.account);
  return accShell('merchandise', 'Merchandise', `
    <div class="page-hd"><h1 class="t-h2">Merchandise</h1>
      <p class="page-sub">Quote requests, approved products and orders for ${esc(acc.name)}.</p></div>
    ${qs.length ? `
      <h2 class="t-h4" style="margin-bottom:12px">Quote requests</h2>
      <div class="stack-3">${qs.map(q => `
        <div class="card">
          <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div><div class="t-h5">${q.qty} × ${esc(q.productName)}</div>
              <div class="mono-ref">${esc(q.ref||'')} · ${esc(q.colourName)} · requested ${dateTime(q.at)}</div></div>
            <div class="row" style="gap:8px">${pillMerch('Merchandise')}${pill(q.state)}</div>
          </div>
          <div class="stack-2" style="margin-top:12px">
            ${(q.placements||[]).map((pl,i) => `<div class="factline">
              <span>Placement ${i+1}</span>
              <span>${esc(pl.posName)} — ${esc(pl.methodName)}, ${esc(pl.size)}${
                pl.method==='screen'?', '+pl.colours+' colour'+(pl.colours>1?'s':''):''}${
                pl.art?' · '+esc(pl.art):' · artwork to follow'}</span></div>`).join('')}
            ${q.quotedUnit ? `
              <div class="factline"><span>Your price</span>
                <span class="num med">${money(q.quotedUnit)} per piece · ${money(q.quotedTotal)} total</span></div>
              ${q.quoteNote ? `<div class="factline"><span>From the studio</span><span>${esc(q.quoteNote)}</span></div>` : ''}`
            : q.total ? `<div class="factline"><span>Indicative</span><span class="num med">${money(q.total)}</span></div>`
            : `<div class="factline"><span>Price</span><span class="muted">We are preparing it.</span></div>`}
            <div class="factline"><span>Where it stands</span><span>${esc(st(q.state).say)}</span></div>
          </div>
        </div>`).join('')}</div>
      <p class="t-xs muted" style="margin-top:16px">Requests you send from the merchandise website appear here and in our studio at the same moment — it is one record, not two.</p>`
    : `<div class="empty">
        <div class="empty-t">No merchandise activity yet</div>
        <div class="empty-d">Browse the catalogue and send us a quote request. You will stay signed in, and what we already know about ${esc(acc.name)} is carried into the request.</div>
        <button class="btn btn--primary" data-act="toMerch">Browse merchandise</button>
      </div>`}
  `);
}

/* ---- Documents --------------------------------------------------------- */
function accDocuments(){
  const acc = myAccount();
  const tab = UI.docTab || 'Overview';
  const all = S.documents.filter(d => d.account === acc.id && d.visible);
  const tabs = ['Overview','Payment terms','Pro forma','Invoice','Contract'];
  const list = tab === 'Overview' ? all : all.filter(d => d.type === tab);
  const needs = all.filter(d => ['payment_due','overdue','signature_required'].includes(d.state));
  const canPay = can(user(SESSION.user),'payments','act');

  const row = (d) => `
    <div class="rw rw--static" style="align-items:flex-start">
      ${['overdue'].includes(d.state) ? '<span class="rw-flag rw-flag--stop"></span>' :
        ['payment_due','signature_required'].includes(d.state) ? '<span class="rw-flag rw-flag--wait"></span>' : ''}
      <span class="rw-main">
        <span class="rw-t">${esc(d.title)}</span>
        <span class="rw-s">${d.num} · ${esc(d.type)} · issued ${dateShort(d.issued)}${d.due?` · due ${dateShort(d.due)}`:''}${d.project?` · ${esc(project(d.project).name)}`:''}</span>
      </span>
      <span class="rw-side">
        ${d.amount ? `<span class="t-sm num med">${money(d.amount, acc.currency)}</span>` : ''}
        ${pill(d.state)}
        <button class="btn btn--ghost btn--sm" data-act="openDoc" data-id="${d.id}">Preview</button>
        <button class="btn btn--ghost btn--sm" data-act="dlDoc" data-id="${d.id}">Download</button>
      </span>
    </div>`;

  return accShell('documents', 'Documents', `
    <div class="page-hd"><h1 class="t-h2">Documents</h1>
      <p class="page-sub">Every commercial and legal record on this account. Issued documents are corrected by a new version or a credit note — never overwritten.</p></div>
    <div class="tabs" style="margin-bottom:20px">
      ${tabs.map(t => `<button class="tab ${tab===t?'tab--on':''}" data-act="docTab" data-t="${esc(t)}">${t}${t==='Overview'&&needs.length?` (${needs.length})`:''}</button>`).join('')}
    </div>

    ${tab === 'Overview' && needs.length ? `
      <h2 class="t-h4" style="margin-bottom:12px">Needs attention</h2>
      <div class="rows" style="margin-bottom:24px">${needs.map(row).join('')}</div>
      <h2 class="t-h4" style="margin-bottom:12px">All documents</h2>` : ''}

    ${list.length ? `<div class="rows">${list.map(row).join('')}</div>`
      : `<div class="empty"><div class="empty-t">Nothing here</div>
         <div class="empty-d">No ${esc(tab.toLowerCase())} documents on this account yet.</div></div>`}

    ${!canPay ? '<p class="t-xs muted" style="margin-top:16px">Payment actions are hidden for your role. Your account administrator can act on invoices.</p>' : ''}
  `);
}

/* ---- Messages ---------------------------------------------------------- */
function accMessages(){
  const acc = myAccount();
  /* A conversation whose project has gone — a state saved before the seed
     changed shape, say — must not take the whole page down with it. */
  const cvs = S.conversations.filter(c => c.account === acc.id && (!c.project || project(c.project)));
  const openId = UI.openCv || (cvs[0] && cvs[0].id);
  const cv = by(S.conversations, openId);
  return accShell('messages', 'Messages', `
    <div class="page-hd"><h1 class="t-h2">Messages</h1>
      <p class="page-sub">One conversation per project. We reply here, and email you a pointer rather than reproducing project detail in your inbox.</p></div>
    <div class="cols">
      <div class="card">
        ${cv ? `
          <div class="row-between" style="margin-bottom:16px">
            <div><div class="t-h5">${esc(cv.project ? project(cv.project).name : 'Your account')}</div>
              <div class="mono-ref">${cv.project ? project(cv.project).ref : esc(acc.name)}</div></div>
            ${pill(cv.state === 'needs_reply' ? 'waiting_pamuuc' : 'waiting_customer')}
          </div>
          ${cv.messages.filter(m=>!m.internal).map(m => `
            <div class="msg">
              <span class="av ${user(m.by).side==='studio'?'av--studio':''}">${user(m.by).init}</span>
              <div class="msg-b">
                <div class="msg-h"><span class="msg-a">${esc(user(m.by).name)}</span>
                  <span class="msg-r">${user(m.by).side==='studio'?'PAMUUC':esc(acc.name)} · ${dateTime(m.at)}</span></div>
                <div class="msg-t">${esc(m.text)}</div></div>
            </div>`).join('')}
          <div style="margin-top:16px">
            <textarea class="inp" id="msgbox" placeholder="Write a message…"></textarea>
            <div class="btn-row" style="margin-top:8px;justify-content:flex-end">
              <button class="btn btn--primary btn--sm" data-act="send" data-cv="${cv.id}">Send</button></div>
          </div>` : '<div class="empty"><div class="empty-t">No conversations</div></div>'}
      </div>
      <div class="stack-2">
        ${cvs.map(c => `<button class="card" data-act="openCv" data-id="${c.id}"
          style="text-align:left;cursor:pointer;${c.id===openId?'border-color:var(--navy)':''}">
          <div class="row-between"><span class="t-sm med">${esc(c.project ? project(c.project).name : 'Your account')}</span>
            ${c.state==='needs_reply'?'<span class="dot"></span>':''}</div>
          <div class="t-xs muted" style="margin-top:4px">${c.messages.filter(m=>!m.internal).length} messages · ${ago(c.messages[c.messages.length-1]?.at)}</div>
        </button>`).join('')}
      </div>
    </div>
  `);
}

/* ---- Notifications ------------------------------------------------------ */
/* Whether something is still being asked of you is a fact about the record, not
   about the message. A flag written on the message only clears on the one path
   that remembers to clear it — decide the same thing from the project page, or
   have the studio settle it from their side, and the list would go on asking
   forever. So each notification names its record and the record answers. */
const NTF_OPEN = {
  approval: (id)    => { const a = by(S.approvals, id); return !!a && a.state === 'awaiting_customer'; },
  document: (id, n) => { const d = by(S.documents, id); if(!d) return false;
                         /* once a transfer is declared the customer has done their
                            part and it is the studio that owes a look at the bank */
                         return n.to === 'studio' ? d.state === 'payment_sent'
                              : (d.state === 'payment_due' || d.state === 'overdue'); },
  milestone:(id)    => { for(const p of S.projects){ const m = by(p.milestones || [], id);
                           if(m) return m.state !== 'paid' && m.state !== 'cancelled'; } return false; },
  garment:  (id)    => { const g = garment(id);         return !!g && g.state === 'feedback_required'; },
  quote:    (id)    => { const q = by(S.merchQuotes, id); return !!q && q.state === 'quoted'; },
  inquiry:  (id)    => { const i = by(S.inquiries, id); return !!i && !!(i.slots && i.slots.length); },
  /* these two ask you to go and look, so looking is the whole of the answer */
  design:   (id, n) => !n.read,
  account:  ()      => false,
};
function nOpen(n){
  if(!n.action) return false;
  const r = n.ref && NTF_OPEN[n.ref.kind];
  if(r) return !!r(n.ref.id, n);
  return !n.answered;           /* older records, and anything with no subject */
}
/* Something you have already dealt with is not unread, whatever the flag says. */
function nUnread(n){ return !n.read && !(n.action && !nOpen(n)); }

/* The studio's own vocabulary — "waiting on customer" — describes the studio's
   queue. From this side of the screen the only question is whether something
   is being asked of you, so that is what the list says. */
function nState(n){
  if(n.action) return nOpen(n) ? {cls:'need', word:'Needs you'} : {cls:'done', word:'Done'};
  return {cls:'info', word:'Update'};
}

/* Every one of these doubles as the body of an email, where the button exists
   to carry the reader back to the site. In the account that same button would
   land them where they already are, so here it points at the thing itself —
   and "Open my account", which has nowhere left to go, drops out. */
function nAction(n){
  if(!n.cta || !nOpen(n)) return null;
  if(n.cta.act !== 'goSignIn')
    return {label:n.cta.label, attrs:`data-act="${esc(n.cta.act)}"${n.cta.id ? ` data-id="${esc(n.cta.id)}"` : ''}`};
  if(n.project) return {label:'Open the project', attrs:`data-go="account:project:${esc(n.project)}"`};
  return null;
}

function nDayHead(key){
  if(key === S.today) return 'Today';
  /* Parsed and formatted in the same zone. Going out through toISOString to
     step back a day reads the clock in UTC and, east of Greenwich, hands back
     the day before the one it meant. */
  const y = new Date(Date.parse(S.today + 'T00:00:00Z') - 86400000);
  if(!isNaN(y) && key === y.toISOString().slice(0,10)) return 'Yesterday';
  const dt = new Date(key + 'T12:00');
  return isNaN(dt) ? key : dt.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
}
function nTime(at){
  const dt = new Date(String(at).replace(' ','T'));
  return isNaN(dt) ? String(at) : dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}

function nRow(n){
  const s = nState(n);
  const cta = nAction(n);
  const choices = (n.choices && nOpen(n)) ? n.choices : null;
  const where = n.project ? project(n.project) : null;
  const klass = extra => `class="ntf ${nUnread(n) ? 'ntf--new' : ''} ${
    s.cls === 'need' ? 'ntf--need' : ''} ${extra || ''}" data-n="${esc(n.id)}"`;
  const cls = klass('');
  const body = `
    <span class="ntf-top">
      <span class="ntf-t">${esc(n.text)}</span>
      <span class="ntf-st ntf-st--${s.cls}">${s.word}</span>
    </span>
    <span class="ntf-m">${[where ? esc(where.name) : '', nTime(n.at)].filter(Boolean).join(' · ')}</span>`;

  /* A row that asks something carries the answer with it. Sending someone to
     another page to do what the message already described is a step that
     exists only because the message could not hold a button. */
  if(choices) return `<div ${cls}>${body}
    <span class="ntf-do">${choices.options.map(o => `<button class="btn btn--ghost btn--sm"
      data-act="${esc(choices.act)}" data-id="${esc(choices.id)}"
      data-v="${esc(o.v)}">${esc(o.label)}</button>`).join('')}</span></div>`;
  if(cta) return `<div ${cls}>${body}
    <span class="ntf-do"><button class="btn btn--primary btn--sm" ${cta.attrs}>${esc(cta.label)}</button></span></div>`;
  if(n.action && nOpen(n) && where) return `<div ${cls}>${body}
    <span class="ntf-do"><button class="btn btn--primary btn--sm"
      data-go="account:project:${esc(n.project)}">Open the project</button></span></div>`;
  if(where) return `<button ${klass('ntf--go')} data-go="account:project:${esc(n.project)}">${body}</button>`;
  return `<div ${cls}>${body}</div>`;
}

function accNotifications(){
  const acc = myAccount() || {};
  /* Scoped to this account. Anything raised before the account existed belongs
     to the inquiry it came from and was answered by email at the time — it is
     not part of the record here, and another company's never was. */
  const ns = S.notifications.filter(n => n.to === 'customer' && n.account === acc.id);
  const filt = UI.nFilter || 'All';
  const list = filt === 'Needs you' ? ns.filter(nOpen)
             : filt === 'Updates'   ? ns.filter(n => !nOpen(n))
             : ns;
  const waiting = ns.filter(nOpen).length;
  const unread  = ns.filter(nUnread).length;

  /* Grouped by day, because that is how someone catching up reads a list:
     newest first, with the date said once instead of on every line. */
  const days = [];
  list.forEach(n => {
    const key = String(n.at).slice(0,10);
    const last = days[days.length - 1];
    if(last && last.key === key) last.items.push(n); else days.push({key, items:[n]});
  });

  const empty = filt === 'Needs you'
    ? {t:'Nothing waiting', d:'No one is asking you for anything right now.'}
    : filt === 'Updates'
    ? {t:'No updates yet', d:'Changes we make to your projects will be listed here.'}
    : {t:'Nothing yet', d:'When we publish something, change a price, or need a decision from you, it appears here — and in your inbox.'};

  return accShell('notifications', 'Notifications', `
    <div class="page-hd"><div class="row-between">
      <div><h1 class="t-h2">Notifications</h1>
        <p class="page-sub">${waiting
          ? `${waiting} ${waiting === 1 ? 'thing needs' : 'things need'} an answer from you. Everything else is here for the record.`
          : 'Nothing is waiting on you. Everything here is for the record.'}</p></div>
      ${unread ? '<button class="btn btn--ghost btn--sm" data-act="markRead">Mark all read</button>' : ''}
    </div></div>
    <div class="tabs" style="margin-bottom:var(--sp-6)">
      ${['All','Needs you','Updates'].map(t => `<button class="tab ${filt===t?'tab--on':''}" data-act="nFilter" data-t="${t}">${t}${
        t === 'Needs you' && waiting ? `<span class="badge-n">${waiting}</span>` : ''}</button>`).join('')}
    </div>
    ${days.length ? `<div class="stack-6">${days.map(d => `
      <section>
        <h2 class="ntf-day">${esc(nDayHead(d.key))}</h2>
        <div class="ntf-list">${d.items.map(nRow).join('')}</div>
      </section>`).join('')}</div>`
      : `<div class="empty"><div class="empty-t">${esc(empty.t)}</div><div class="empty-d">${esc(empty.d)}</div></div>`}
  `);
}

/* ---- Settings / team ---------------------------------------------------- */
function accSettings(){
  const acc = myAccount();
  const u = user(SESSION.user);
  const team = S.users.filter(x => x.account === acc.id);
  const isAdmin = can(u,'customer_team','manage');
  return accShell('settings', 'Team & settings', `
    <div class="page-hd"><h1 class="t-h2">Team &amp; settings</h1>
      <p class="page-sub">Who at ${esc(acc.name)} can see and do what.</p></div>
    <div class="cols">
      <div class="stack-6">
        <section>
          <div class="row-between" style="margin-bottom:12px">
            <h2 class="t-h4">People</h2>
            ${isAdmin ? '<button class="btn btn--ghost btn--sm" data-act="inviteUser">Invite someone</button>' : ''}
          </div>
          <div class="rows">
            ${team.map(x => `<div class="rw rw--static">
              <span class="av">${x.init}</span>
              <span class="rw-main"><span class="rw-t">${esc(x.name)}${x.id===u.id?' <span class="chip">You</span>':''}</span>
                <span class="rw-s">${esc(x.title)} · ${ROLE_NAMES[x.role]}</span></span>
              <span class="rw-side">
                <span class="t-xs muted">${x.role==='cust_admin'?'All company projects':`${(x.projects||[]).length} project`}</span>
                ${isAdmin && x.id!==u.id ? '<button class="btn btn--quiet btn--sm">Manage</button>' : ''}
              </span></div>`).join('')}
          </div>
          ${!isAdmin ? '<p class="t-xs muted" style="margin-top:12px">Only an account administrator can invite or manage people.</p>' : ''}
        </section>
        <section>
          <h2 class="t-h4" style="margin-bottom:12px">Locations</h2>
          <div class="rows">${acc.locations.map(l => `<div class="rw rw--static">
            <span class="rw-main"><span class="rw-t">${esc(l.name)}</span><span class="rw-s">${esc(l.addr)}</span></span>
            <span class="rw-side"><span class="t-sm num">${l.people} people</span></span></div>`).join('')}</div>
        </section>
      </div>
      <div class="stack">
        <div class="card">
          <div class="eyebrow">Account</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Company</dt><dd>${esc(acc.name)}</dd>
            <dt>Customer since</dt><dd>${dateShort(acc.since)}</dd>
            <dt>Account Manager</dt><dd>${esc(user(acc.am).name)}</dd>
            <dt>Payment terms</dt><dd>${esc(acc.terms)}</dd>
            <dt>Currency</dt><dd>${acc.currency}</dd>
            <dt>VAT</dt><dd class="num">${esc(acc.vat)}</dd>
          </dl>
          <p class="t-xs muted" style="margin-top:12px">Payment terms and modules are set by PAMUUC. Ask ${esc(user(acc.am).name)} to change them.</p>
        </div>
        <div class="card">
          <div class="eyebrow">What you can see</div>
          <div class="stack-2" style="margin-top:12px">
            ${Object.entries(acc.modules).map(([k,on]) => `<div class="row-between">
              <span class="t-sm">${k[0].toUpperCase()+k.slice(1)}</span>
              ${on ? pill('active') : pill('hidden')}</div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `);
}
/* ============================================================================
   PAMUUC SUITE — Studio Back Office
   Dense and operational. Same records, same components, more control.
   Everything it can do is gated by can() — the roles differ, the code does not.
   ========================================================================= */

function stNav(page){
  const u = user(SESSION.user);
  const q = studioQueues(u);
  const nav = [
    {p:'overview',  n:'Overview',   i:'◎'},
    {p:'inquiries', n:'Inquiries',  i:'✧', badge:q.inquiries.length || 0},
    {p:'customers', n:'Customers',  i:'⌂'},
    {p:'projects',  n:'Projects',   i:'▤'},
    {group:'Library'},
    {p:'bases',     n:'Pamuuc Bases', i:'▧'},
    {p:'merch',     n:'Merchandising', i:'◈'},
    {group:'Commercial'},
    {p:'finance',   n:'Finance',    i:'€'},
    {p:'billing',   n:'Documents & Billing', i:'▣', badge:q.overdue.length || 0},
    {group:'Operations'},
    {p:'comms',     n:'Communications', i:'✉', badge:q.threads.length || 0},
    {p:'team',      n:'Team & Access', i:'⚇'},
    {p:'settings',  n:'Content & Settings', i:'⚙'},
    {p:'audit',     n:'Audit Log',  i:'⧉'},
  ];
  /* a role that cannot open a section does not see it */
  return nav.filter(g => {
    if(g.group) return true;
    if(g.p === 'team')     return can(u,'team','view');
    if(g.p === 'settings') return can(u,'settings','view');
    if(g.p === 'audit')    return can(u,'audit_all','view');
    if(g.p === 'finance')  return can(u,'finance','view');
    return true;
  });
}

function stShell(page, title, body, narrow){
  const u = user(SESSION.user);
  const scopeText = u.role === 'master' ? 'Master View<br><span class="faint">Full authority · all customers</span>'
    : u.role === 'am' ? `Account Manager<br><span class="faint">${S.projects.filter(p=>p.am===u.id).length} assigned projects</span>`
    : 'Finance Director<br><span class="faint">Financial authority · read-only operations</span>';
  return appShell({page, title, body, narrow, nav:stNav(page), scope:scopeText});
}

/* ---- Overview: exceptions and decisions, not every record -------------- */
function stOverview(){
  const u = user(SESSION.user);
  const q = studioQueues(u);
  const f = financeTotals();
  const queue = (title, items, render, empty) => `
    <section class="stack-3">
      <div class="row-between"><h2 class="t-h4">${title}</h2>
        ${items.length ? `<span class="chip">${items.length}</span>` : ''}</div>
      ${items.length ? `<div class="rows">${items.map(render).join('')}</div>`
        : `<div class="card card--quiet"><span class="t-sm muted">${empty}</span></div>`}
    </section>`;

  return stShell('overview', 'Overview', `
    <div class="page-hd">
      <h1 class="t-h2">Overview</h1>
      <p class="page-sub">Exceptions and decisions. Everything that is running normally is deliberately not on this page.</p>
    </div>

    <div class="grid grid-4" style="margin-bottom:32px">
      ${[[q.inquiries.length,'Inquiries to qualify'],
         [q.requests.length,'Customer requests to review'],
         [q.approvals.length,'Approvals with the customer'],
         [q.exceptions.length,'Garments needing resolution']]
        .map(([v,l]) => `<div class="tile"><div class="tile-v num">${v}</div><div class="tile-l">${l}</div></div>`).join('')}
    </div>

    ${can(u,'finance','view') ? `<div class="grid grid-4" style="margin-bottom:32px">
      ${[[money(f.issued),'Issued'],[money(f.collected),'Collected'],
         [money(f.outstanding),'Outstanding'],[money(f.overdue),'Overdue']]
        .map(([v,l],i) => `<div class="tile"><div class="tile-v num" ${i===3&&f.overdue?'style="color:var(--stop)"':''}>${v}</div>
          <div class="tile-l">${l}</div></div>`).join('')}
    </div>` : ''}

    <div class="grid grid-2" style="align-items:start;gap:32px">
      <div class="stack-8">
        ${queue('New inquiries awaiting qualification', q.inquiries, i => `
          <button class="rw" data-go="studio:inquiry:${i.id}">
            <span class="rw-flag rw-flag--wait"></span>
            <span class="rw-main"><span class="rw-t">${esc(i.company)}</span>
              <span class="rw-s">${i.ref} · ${esc(i.sector)} · ${esc(i.people)} people · ${ago(i.submitted)}</span></span>
            <span class="rw-side">${pill(i.state)}</span></button>`,
          'Nothing waiting to be qualified.')}

        ${queue('Customer requests awaiting review', q.requests, c => `
          <button class="rw" data-go="studio:project:${c.project}">
            <span class="rw-flag rw-flag--wait"></span>
            <span class="rw-main"><span class="rw-t">${esc(c.title)}</span>
              <span class="rw-s">${esc(account(c.account).name)} · ${esc(project(c.project).ref)} · ${ago(c.at)}</span></span>
            <span class="rw-side">${pill(c.state)}</span></button>`,
          'No open customer requests.')}

        ${queue('Garments needing a Master resolution', q.exceptions, g => `
          <button class="rw" data-go="studio:project:${g.project}">
            <span class="rw-flag rw-flag--stop"></span>
            <span class="rw-main"><span class="rw-t">${esc(g.name)} — round ${g.round}</span>
              <span class="rw-s">${esc(project(g.project).ref)} · ${esc(account(project(g.project).account).name)}</span></span>
            <span class="rw-side">${pill(g.state)}</span></button>`,
          'No garments have reached the round limit.')}
      </div>

      <div class="stack-8">
        ${queue('Projects blocked or at risk', [...new Set([...q.blocked,...q.atRisk])], p => `
          <button class="rw" data-go="studio:project:${p.id}">
            <span class="rw-flag rw-flag--${p.risk?'wait':'stop'}"></span>
            <span class="rw-main"><span class="rw-t">${esc(p.name)}</span>
              <span class="rw-s">${p.ref} · ${stageDef(p.stage).name} · ${gateBlockers(p).length} blocker${gateBlockers(p).length===1?'':'s'}</span></span>
            <span class="rw-side">${p.risk?pill('at_risk'):pill('blocked')}</span></button>`,
          'Nothing blocked.')}

        ${queue('Approvals sitting with customers', q.approvals, a => `
          <button class="rw" data-go="studio:project:${a.project}">
            <span class="rw-main"><span class="rw-t">${esc(a.kind)}</span>
              <span class="rw-s">${esc(account(a.account).name)} · due ${dateShort(a.due)}</span></span>
            <span class="rw-side">${pill(a.state)}</span></button>`,
          'No approvals outstanding.')}

        ${can(u,'finance','view') ? queue('Overdue invoices', q.overdue, d => `
          <button class="rw" data-go="studio:billing">
            <span class="rw-flag rw-flag--stop"></span>
            <span class="rw-main"><span class="rw-t">${esc(d.title)}</span>
              <span class="rw-s">${d.num} · ${esc(account(d.account).name)} · due ${dateShort(d.due)}</span></span>
            <span class="rw-side"><span class="t-sm num med">${money(d.amount)}</span>${pill(d.state)}</span></button>`,
          'Nothing overdue.') : ''}

        <section class="stack-3">
          <h2 class="t-h4">Workload by Account Manager</h2>
          <div class="card">
            ${S.users.filter(x => ['master','am'].includes(x.role)).map(x => {
              const n = S.projects.filter(p => p.am === x.id && !p.completed).length;
              return `<div class="row-between" style="padding:8px 0">
                <span class="row"><span class="av av--studio">${x.init}</span>
                  <span class="t-sm">${esc(x.name)}</span></span>
                <span class="row" style="gap:12px"><span class="bar" style="width:100px">
                  <span class="bar-f" style="display:block;width:${Math.min(100,n*33)}%"></span></span>
                  <span class="t-sm num">${n}</span></span></div>`;}).join('')}
          </div>
        </section>
      </div>
    </div>
  `);
}

/* ---- Inquiries ---------------------------------------------------------- */
function stInquiries(){
  return stShell('inquiries', 'Inquiries', `
    <div class="page-hd"><h1 class="t-h2">Inquiries</h1>
      <p class="page-sub">The qualification queue. An inquiry cannot become a project without a decision, a first call, an owner and a discovery summary.</p></div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Reference</th><th>Company</th><th>Type</th><th>Sector</th><th>People</th>
        <th>Submitted</th><th>Status</th><th>Reviewer</th></tr></thead>
      <tbody>${S.inquiries.map(i => `<tr class="clickable" data-go="studio:inquiry:${i.id}">
        <td class="num">${i.ref}</td><td class="med">${esc(i.company)}</td>
        <td>${i.type === 'Merchandise' ? pillMerch('Merchandise') : 'Custom uniforms'}</td>
        <td>${esc(i.sector)}</td><td class="num">${esc(i.people)}</td>
        <td>${dateShort(i.submitted)}</td><td>${pill(i.state)}</td>
        <td>${i.reviewer ? esc(user(i.reviewer).name) : '<span class="faint">Unassigned</span>'}</td>
      </tr>`).join('')}</tbody></table></div>
  `);
}

function stInquiry(id){
  const i = by(S.inquiries, id);
  if(!i) return stShell('inquiries','Inquiry','<div class="empty">Not found.</div>');
  const u = user(SESSION.user);
  const isMaster = u.role === 'master';
  const steps = [
    ['submitted','Submitted'],['qualified','Accepted for discovery'],
    ['call_scheduled','First call scheduled'],['ready_account','Ready for account'],
    ['converted','Converted']];
  const at = steps.findIndex(s => s[0] === i.state);

  return stShell('inquiries', i.company, `
    <div class="crumbs" style="margin-bottom:16px">
      <a data-go="studio:inquiries">Inquiries</a><span>›</span><span>${i.ref}</span></div>

    <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;margin-bottom:24px">
      <div><div class="row" style="gap:8px"><h1 class="t-h3">${esc(i.company)}</h1>${pill(i.state)}</div>
        <div class="mono-ref" style="margin-top:4px">${i.ref} · ${esc(i.contact)} · ${esc(i.email)} · submitted ${dateTime(i.submitted)}</div></div>
    </div>

    <div class="tl" style="margin-bottom:24px">
      ${steps.map((s,ix) => `<div class="tl-s ${ix<at?'tl-s--done':ix===at?'tl-s--now':''}">
        <div class="tl-n">${s[1]}</div></div>`).join('')}
    </div>

    ${i.qualification ? (() => {
      const q = i.qualification;
      const tone = q.verdict === 'stop' ? 'stop' : q.verdict === 'warn' ? 'wait' : 'go';
      const head = q.verdict === 'stop' ? 'Does not qualify as scoped'
                 : q.verdict === 'warn' ? 'Qualifies with questions to resolve'
                 : 'Qualifies';
      return `
      <div class="card" style="margin-bottom:24px">
        <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:12px">
          <div>
            <div class="eyebrow">Qualification</div>
            <h2 class="t-h4" style="margin-top:6px">${head}</h2>
          </div>
          <div class="row" style="gap:8px">
            ${q.per !== null ? `<span class="chip">${q.per} people per design</span>` : ''}
            ${q.head !== null ? `<span class="chip">${q.head} people</span>` : ''}
            ${q.designs !== null ? `<span class="chip">${q.designs} design${q.designs === 1 ? '' : 's'}</span>` : ''}
            <span class="pill-s pill-s--${tone === 'go' ? 'go' : tone === 'wait' ? 'wait' : 'flow'}">score ${q.score > 0 ? '+' : ''}${q.score}</span>
          </div>
        </div>
        <div class="stack-2" style="margin-top:16px">
          ${q.flags.map(f => `<div class="banner banner--${f.level === 'stop' ? 'stop' : f.level === 'warn' ? 'wait' : 'go'}">
            <div><div class="banner-d">${esc(f.text)}</div></div></div>`).join('')
            || '<p class="t-sm muted">No flags raised.</p>'}
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:16px">
          ${i.authority && i.authority !== '—' ? `<span class="chip">${esc(i.authority)}</span>` : ''}
          ${i.vatStatus === 'pending' ? `<span class="chip">VAT ${esc(i.vat)} · verify on VIES</span>`
            : i.vatStatus === 'not-registered' ? `<span class="chip">Not VAT registered</span>`
            : i.vatStatus === 'not-required' ? `<span class="chip">VAT not required</span>`
            : i.vatStatus === 'missing' ? `<span class="chip">No VAT number</span>` : ''}
        </div>
        <p class="t-xs muted" style="margin-top:12px">People divided by designs is the qualifier: it decides
          whether each garment reaches a quantity it can be made well at. Everything else is context.</p>
      </div>`;
    })() : ''}

    ${i.state === 'archived' ? `<div class="banner banner--stop" style="margin-bottom:24px"><div>
      <div class="banner-t">Declined and archived</div>
      <div class="banner-d">${esc(i.declineReason || '')}</div></div></div>` : ''}

    <div class="cols">
      <div class="stack-6">
        <section>
          <h2 class="t-h4" style="margin-bottom:12px">Submitted answers</h2>
          <div class="card"><dl class="kv">
            ${Object.entries(i.answers || {}).map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
          </dl>
          ${(i.files||[]).length ? `<div class="sep"></div><div class="eyebrow">Uploaded files</div>
            <div class="wrap-row" style="margin-top:8px">${i.files.map(f => `<span class="chip">▣ ${esc(f)}</span>`).join('')}</div>` : ''}
          </div>
        </section>

        ${i.discovery ? `<section><h2 class="t-h4" style="margin-bottom:12px">Discovery notes</h2>
          <div class="card"><p class="t-sm" style="white-space:pre-wrap">${esc(i.discovery)}</p></div></section>` : ''}

        <section>
          <h2 class="t-h4" style="margin-bottom:12px">Decisions</h2>
          <div class="card">
            ${i.state === 'submitted' ? `
              <p class="t-sm muted" style="margin-bottom:16px">${isMaster ? 'Accept or decline. Either way the applicant hears from us.' :
                'Only Master can accept or decline an inquiry. You can add notes and prepare it.'}</p>
              <div class="btn-row">
                <button class="btn btn--primary" data-act="inqAccept" data-id="${i.id}" ${isMaster?'':'disabled'}>Accept for discovery</button>
                <button class="btn btn--ghost" data-act="inqInfo" data-id="${i.id}">Request more information</button>
                <button class="btn btn--danger" data-act="inqDecline" data-id="${i.id}" ${isMaster?'':'disabled'}>Decline</button>
              </div>`
            : i.awaitingSend ? `
              <p class="t-sm muted" style="margin-bottom:16px">The invitation is written and waiting in
                Communications. It has not gone out yet, so this is still with us, not with them.</p>
              <div class="btn-row">
                <button class="btn btn--primary" data-go="studio:comms">Review and send it</button>
                <button class="btn btn--quiet" data-act="inqOffer" data-id="${i.id}">Offer different times</button>
              </div>`
            : i.state === 'qualified' ? `
              <p class="t-sm muted" style="margin-bottom:16px">Accepted. Arrange the first discovery call — an account is not opened before it happens.</p>
              <button class="btn btn--primary" data-act="inqOffer" data-id="${i.id}">Offer times for the first call</button>
              <button class="btn btn--ghost" data-act="inqSchedule" data-id="${i.id}">Set a time myself</button>`
            : i.state === 'waiting_customer' ? `
              <p class="t-sm muted" style="margin-bottom:16px">Four times were offered and sent. Nothing moves
                until they pick one — or until you book it for them.</p>
              <div class="btn-row">
                <button class="btn btn--ghost" data-act="inqSchedule" data-id="${i.id}">Book it for them</button>
                <button class="btn btn--quiet" data-act="inqOffer" data-id="${i.id}">Offer different times</button>
              </div>`
            : i.state === 'call_scheduled' ? `
              <p class="t-sm muted" style="margin-bottom:16px">Call booked for ${dateTime(i.callAt)}. Record the discovery once it happens.</p>
              <button class="btn btn--primary" data-act="inqComplete" data-id="${i.id}">Record discovery and complete</button>`
            : i.state === 'ready_account' ? `
              <div class="banner banner--go" style="margin-bottom:16px"><div>
                <div class="banner-t">Ready for an account and a project</div>
                <div class="banner-d">Activating the account and creating the project are two separate recorded actions. Neither happens automatically.</div></div></div>
              <button class="btn btn--primary" data-act="inqActivate" data-id="${i.id}" ${isMaster?'':'disabled'}>Activate customer account</button>
              ${isMaster?'':'<p class="t-xs muted" style="margin-top:8px">Master activates accounts.</p>'}`
            : i.state === 'converted' ? `
              <div class="banner banner--go"><div><div class="banner-t">Account activated</div>
                <div class="banner-d">Open the customer to build and publish the first project.</div>
                <div class="btn-row" style="margin-top:12px">
                  <button class="btn btn--primary btn--sm" data-go="studio:customer:${i.accountId}">Open customer →</button></div></div></div>`
            : '<p class="t-sm muted">No further action.</p>'}
          </div>
        </section>
      </div>

      <div class="stack">
        <div class="card"><div class="eyebrow">Routing</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Type</dt><dd>${esc(i.type)}</dd>
            <dt>Country</dt><dd>${esc(i.country)}</dd>
            <dt>Scope</dt><dd>${esc(i.scope)}</dd>
            <dt>Reviewer</dt><dd>${i.reviewer ? esc(user(i.reviewer).name) : 'Unassigned'}</dd>
            <dt>Existing match</dt><dd>${S.accounts.some(a => a.name === i.company) ? 'Matched to an existing account' : 'No match found'}</dd>
          </dl>
        </div>
        <div class="card"><div class="eyebrow">Why this is gated</div>
          <p class="t-xs muted" style="margin-top:8px">The public questionnaire creates an inquiry and nothing else. It does not open an account, and it never creates a project. That boundary is what stops an unqualified form submission becoming an operational commitment.</p>
        </div>
      </div>
    </div>
  `);
}

/* ---- Customers ---------------------------------------------------------- */
function stCustomers(){
  return stShell('customers', 'Customers', `
    <div class="page-hd"><h1 class="t-h2">Customers</h1>
      <p class="page-sub">Every account, with what is waiting on each side.</p></div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Customer</th><th>Country</th><th>Manager</th><th class="tnum">Active</th>
        <th class="tnum">Waiting on them</th><th class="tnum">Waiting on us</th><th class="tnum">Balance</th>
        <th>Last activity</th><th>Status</th></tr></thead>
      <tbody>${S.accounts.map(a => {
        const ps = S.projects.filter(p => p.account === a.id && !p.completed);
        const theirs = S.approvals.filter(x => x.account === a.id && x.state === 'awaiting_customer').length;
        const ours = S.changeRequests.filter(c => c.account === a.id && ['submitted','under_review'].includes(c.state)).length;
        const last = S.events.find(e => e.account === a.id);
        return `<tr class="clickable" data-go="studio:customer:${a.id}">
          <td class="med">${esc(a.name)}</td><td>${esc(a.country)}</td><td>${esc(user(a.am).name)}</td>
          <td class="tnum num">${ps.length}</td>
          <td class="tnum num">${theirs || '—'}</td><td class="tnum num">${ours || '—'}</td>
          <td class="tnum num">${a.balance ? money(a.balance, a.currency) : '—'}</td>
          <td>${ago(last?.at)}</td><td>${pill(a.status)}</td></tr>`;}).join('')}</tbody></table></div>
  `);
}

function stCustomer(id){
  const a = account(id);
  if(!a) return stShell('customers','Customer','<div class="empty">Not found.</div>');
  const u = user(SESSION.user);
  const ps = S.projects.filter(p => p.account === a.id);
  const docs = S.documents.filter(d => d.account === a.id);
  const tab = UI.custTab || 'Overview';
  const tabs = ['Overview','Projects','Documents','Account configuration'];

  const cfgRow = (label, val, note) => `
    <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line);gap:16px;align-items:flex-start">
      <div style="flex:1"><div class="t-sm med">${label}</div>
        ${note?`<div class="t-xs muted" style="margin-top:2px">${note}</div>`:''}</div>
      <div style="flex:none">${val}</div></div>`;

  return stShell('customers', a.name, `
    <div class="crumbs" style="margin-bottom:16px">
      <a data-go="studio:customers">Customers</a><span>›</span><span>${esc(a.name)}</span></div>

    <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:24px">
      <div><div class="row" style="gap:8px"><h1 class="t-h3">${esc(a.name)}</h1>${pill(a.status)}</div>
        <div class="mono-ref" style="margin-top:4px">${esc(a.city)}, ${esc(a.country)} · customer since ${dateShort(a.since)} · ${esc(user(a.am).name)}</div></div>
      <div class="btn-row">
        <button class="btn btn--ghost btn--sm" data-act="previewAs" data-acc="${a.id}">Preview the customer account</button>
        ${can(u,'project','create') ? `<button class="btn btn--primary btn--sm" data-act="newProject" data-acc="${a.id}">Create a project</button>` : ''}
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:24px">
      ${[[ps.filter(p=>!p.completed).length,'Active projects'],
         [ps.filter(p=>p.completed).length,'Completed'],
         [S.garments.filter(g=>ps.some(p=>p.id===g.project)&&g.state==='approved').length,'Approved garments'],
         [money(a.balance,a.currency),'Outstanding']]
        .map(([v,l]) => `<div class="tile"><div class="tile-v num">${v}</div><div class="tile-l">${l}</div></div>`).join('')}
    </div>

    <div class="tabs" style="margin-bottom:20px">
      ${tabs.map(t => `<button class="tab ${tab===t?'tab--on':''}" data-act="custTab" data-t="${esc(t)}">${t}</button>`).join('')}
    </div>

    ${tab === 'Overview' ? `
      <div class="cols">
        <div class="stack-6">
          <section><h2 class="t-h4" style="margin-bottom:12px">Projects</h2>
            <div class="rows">${ps.map(p => `<button class="rw" data-go="studio:project:${p.id}">
              <span class="rw-main"><span class="rw-t">${esc(p.name)}</span>
                <span class="rw-s">${p.ref} · ${stageDef(p.stage).name} · v${p.version} · updated ${ago(p.lastUpdate)}</span></span>
              <span class="rw-side">${p.risk?pill('at_risk'):''}${pill(p.opStatus)}</span></button>`).join('')}</div>
          </section>
          <section><h2 class="t-h4" style="margin-bottom:12px">Locations</h2>
            <div class="rows">${a.locations.length ? a.locations.map(l => `<div class="rw rw--static">
              <span class="rw-main"><span class="rw-t">${esc(l.name)}</span><span class="rw-s">${esc(l.addr)}</span></span>
              <span class="rw-side"><span class="t-sm num">${l.people} people</span></span></div>`).join('')
              : '<div class="tbl-empty">No locations recorded yet.</div>'}</div>
          </section>
          <section><h2 class="t-h4" style="margin-bottom:12px">Internal notes</h2>
            <div class="card"><p class="t-sm muted">Marta decides; Jordi is consulted on anything touching F&amp;B. Procurement is light — no tender process. Prefers a call to a document.</p>
            <p class="t-xs faint" style="margin-top:8px">Never visible to the customer.</p></div>
          </section>
        </div>
        <div class="stack">
          <div class="card"><div class="eyebrow">Commercial</div>
            <dl class="kv" style="margin-top:12px">
              <dt>Terms</dt><dd>${esc(a.terms)}</dd>
              <dt>Currency</dt><dd>${a.currency}</dd>
              <dt>VAT</dt><dd class="num">${esc(a.vat)}</dd>
              <dt>Balance</dt><dd class="num">${money(a.balance,a.currency)}</dd>
            </dl></div>
          <div class="card"><div class="eyebrow">People</div>
            <div class="stack-2" style="margin-top:12px">
              ${S.users.filter(x => x.account === a.id).map(x => `<div class="row">
                <span class="av">${x.init}</span><div><div class="t-sm">${esc(x.name)}</div>
                  <div class="t-xs muted">${ROLE_NAMES[x.role]}</div></div></div>`).join('')}
            </div></div>
        </div>
      </div>`
    : tab === 'Projects' ? `
      <div class="rows">${ps.map(p => `<button class="rw" data-go="studio:project:${p.id}">
        <span class="rw-main"><span class="rw-t">${esc(p.name)}</span>
          <span class="rw-s">${p.ref} · ${stageDef(p.stage).name} · ${gateBlockers(p).length} blockers</span></span>
        <span class="rw-side">${pill(p.opStatus)}</span></button>`).join('')}</div>`
    : tab === 'Documents' ? `
      <div class="tw"><table class="tbl">
        <thead><tr><th>Document</th><th>Number</th><th>Type</th><th>Issued</th><th class="tnum">Amount</th><th>Status</th><th>Visible</th></tr></thead>
        <tbody>${docs.map(d => `<tr><td>${esc(d.title)}</td><td class="num">${d.num}</td><td>${esc(d.type)}</td>
          <td>${dateShort(d.issued)}</td><td class="tnum num">${money(d.amount,a.currency)}</td>
          <td>${pill(d.state)}</td><td>${d.visible?'Yes':'<span class="faint">Internal</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : `
      <div class="cols">
        <div class="card">
          <div class="eyebrow">What this customer can see and do</div>
          <p class="t-xs muted" style="margin:8px 0 16px">These settings drive the real Customer Account. The preview uses the same rules — there is no separately maintained mock view to drift out of date.</p>
          ${cfgRow('Account status', pill(a.status))}
          ${Object.entries(a.modules).map(([k,on]) =>
            cfgRow(k[0].toUpperCase()+k.slice(1), on?pill('active'):pill('hidden'),
              k==='merchandise'?'Hidden accounts see no merchandise navigation at all.':'')).join('')}
          ${cfgRow('Payment terms', `<span class="t-sm">${esc(a.terms)}</span>`)}
          ${cfgRow('Approval authority', '<span class="t-sm">Account Admin only</span>', 'Members can comment but not approve for the company.')}
          ${cfgRow('Account Manager shown', `<span class="t-sm">${esc(user(a.am).name)}</span>`)}
        </div>
        <div class="stack">
          <div class="cvp">
            <div class="cvp-hd"><span class="eyebrow" style="color:var(--navy)">Preview as</span></div>
            <div class="stack-2">
              ${S.users.filter(x => x.account === a.id).map(x => `
                <button class="btn btn--ghost btn--block btn--sm" data-act="previewAs" data-acc="${a.id}" data-u="${x.id}">
                  ${esc(x.name)} — ${ROLE_NAMES[x.role]}</button>`).join('')}
            </div>
            <p class="t-xs muted" style="margin-top:12px">Opens the real Customer Account under that person's permissions.</p>
          </div>
          <div class="card"><div class="eyebrow">Deferred, deliberately</div>
            <p class="t-xs muted" style="margin-top:8px">Per-customer field overrides and custom catalogues are specified but not built here. Global defaults plus this preview cover almost every real case; the override matrix is the most expensive thing in the spec relative to what a studio with a handful of accounts needs.</p></div>
        </div>
      </div>`}
  `);
}

/* ---- Projects list ------------------------------------------------------ */
function stProjects(){
  const u = user(SESSION.user);
  const ps = S.projects.filter(p => u.role === 'master' || u.role === 'finance' || p.am === u.id);
  return stShell('projects', 'Projects', `
    <div class="page-hd"><div class="row-between" style="flex-wrap:wrap;gap:12px">
      <div><h1 class="t-h2">Projects</h1>
        <p class="page-sub">${u.role === 'am' ? 'Your assigned projects.' : 'Every project, with its blockers and its next commercial gate.'}</p></div>
      <button class="btn btn--primary" data-act="newProjectPick">Start a project</button>
    </div></div>
    ${ps.length ? '' : `<div class="empty"><div class="empty-t">No projects yet</div>
      <div class="empty-d">A project belongs to a customer account, so it starts from one. Open an account and
        start it there, or pick the account here.</div>
      <button class="btn btn--primary" data-act="newProjectPick">Start a project</button></div>`}
    <div class="tw"><table class="tbl">
      <thead><tr><th>Project</th><th>Customer</th><th>Manager</th><th>Stage</th>
        <th>Internal status</th><th>Customer sees</th><th class="tnum">Blockers</th><th>Next gate</th><th>Updated</th></tr></thead>
      <tbody>${ps.map(p => {
        const b = gateBlockers(p); const g = gateFor(p);
        return `<tr class="clickable" data-go="studio:project:${p.id}">
          <td><span class="med">${esc(p.name)}</span><br><span class="mono-ref">${p.ref}</span></td>
          <td>${esc(account(p.account).name)}</td><td>${esc(user(p.am).name)}</td>
          <td>${stageDef(p.stage).name}</td>
          <td>${p.risk?pill('at_risk'):pill(p.opStatus)}</td>
          <td>${pill(p.opStatus)}${p.draftDirty?'<br><span class="t-xs" style="color:var(--wait)">draft ahead of v'+p.version+'</span>':''}</td>
          <td class="tnum num" ${b.length?'style="color:var(--stop);font-weight:700"':''}>${b.length||'—'}</td>
          <td>${g.blocked?esc(g.label):'<span class="faint">—</span>'}</td>
          <td>${ago(p.lastUpdate)}</td></tr>`;}).join('')}</tbody></table></div>
  `);
}

/* ---- the back office's own step view -------------------------------------
   Seven equal tabs make you decide where to look before you can do anything.
   This answers the only question that matters on opening a project: what has
   to be true before it moves, and what can I do about it from here. §7.2 */
const BLOCKER_TAB = {commercial:'Commercials', garment:'Build', data:'Build', request:'Changes & decisions'};

function stThisStep(p, v, u, ns){
  const b = v.blockers;
  const waiting = v.responsible;
  const stage = stageDef(p.stage);

  const todo = [];
  if(p.draftDirty) todo.push({t:`Draft is ahead of published v${p.version}`,
    d:'The customer is still looking at the last published version.',
    btn:`<button class="btn btn--primary btn--sm" data-act="publish" data-p="${p.id}">Publish v${p.version+1}</button>`});
  v.allApprovals.filter(a => a.state === 'awaiting_customer').forEach(a => todo.push({
    t:`${a.kind} — with the customer`, d:`Asked ${ago(a.askedAt)}${a.due?', due '+dateShort(a.due):''}. Nothing to do until they answer.`, btn:''}));
  S.documents.filter(d => d.project === p.id && d.state === 'payment_sent').forEach(d => todo.push({
    t:`${d.num} — customer says it is transferred`,
    d:`${money(d.amount*1.21)}${d.payRef?' · their reference '+esc(d.payRef):''}. Check the bank, then record it.`,
    btn:can(u,'payments','settle')
      ? `<button class="btn btn--primary btn--sm" data-act="openDoc" data-id="${esc(d.id)}">Record payment received</button>`
      : '<span class="t-xs muted">Finance records this.</span>'}));

  return `
    <section class="stst">
      <div class="stst-gate">
        <div class="pstep-lbl">${ns ? `To move to ${esc(stageDef(ns).name)}` : 'To close this project'}</div>
        ${b.length ? `<div class="pstep-dos" style="margin-top:10px">
          ${b.map(x => `<div class="pstep-do pstep-do--stop">
            <div class="pstep-do-b"><div class="pstep-do-t">${esc(x.text)}</div>
              <div class="pstep-do-d">${esc(x.why)}</div></div>
            ${BLOCKER_TAB[x.kind] ? `<button class="btn btn--ghost btn--sm" data-act="prjTab"
              data-t="${esc(BLOCKER_TAB[x.kind])}">Open ${esc(BLOCKER_TAB[x.kind])}</button>` : ''}
          </div>`).join('')}</div>
          <div class="btn-row" style="margin-top:12px">
            ${can(u,'phase_advance','do',{project:p.id})
              ? `<button class="btn btn--ghost btn--sm" data-act="mvStage" data-p="${p.id}">Move to another step…</button>` : ''}
            ${can(u,'phase_override','do')
              ? `<button class="btn btn--danger btn--sm" data-act="override" data-p="${p.id}">Advance anyway, with a reason</button>`
              : '<span class="t-xs muted">Only Master can push past a gate.</span>'}
          </div>`
        : `<div class="stst-clear">
            <span>Nothing is holding this step.</span>
            <span class="btn-row">
              ${ns && can(u,'phase_advance','do',{project:p.id})
                ? `<button class="btn btn--primary btn--sm" data-act="advance" data-p="${p.id}">Advance to ${esc(stageDef(ns).name)}</button>`
                : ''}
              ${can(u,'phase_advance','do',{project:p.id})
                ? `<button class="btn btn--ghost btn--sm" data-act="mvStage" data-p="${p.id}">Move to another step…</button>` : ''}
            </span>
          </div>`}
      </div>

      <div class="stst-do">
        <div class="pstep-lbl">On your desk</div>
        ${todo.length ? `<div class="pstep-dos" style="margin-top:10px">
          ${todo.map(it => `<div class="pstep-do">
            <div class="pstep-do-b"><div class="pstep-do-t">${esc(it.t)}</div>
              <div class="pstep-do-d">${it.d}</div></div>${it.btn}</div>`).join('')}</div>`
        : '<p class="t-sm muted" style="margin-top:8px">Nothing outstanding on this project.</p>'}
      </div>

      <div class="stst-see">
        <div class="pstep-lbl">What the customer is being told right now</div>
        <div class="stst-mirror">
          <div><span class="t-xs faint">What we are doing</span><p class="t-sm">${esc(v.doing)}</p></div>
          <div><span class="t-xs faint">What they need to do</span><p class="t-sm med">${esc(v.youDo)}</p></div>
        </div>
      </div>
    </section>`;
}

/* ---- the back office, walked rather than filed -------------------------
   Nine equal tabs made you decide where to look before you could do anything,
   and none of them told you where the project actually was. The journey is the
   navigation now: the eight steps are the rail, clicking one shows that step
   and the work that belongs to it, and the handful of things true at every
   step sit underneath where they do not compete. Nothing was taken away —
   every tab still exists, in the place it belongs to. §7.6 */

/* Which body of work belongs to which step. The pre-account steps have no
   workspace of their own — they happened by email and on a call — so they get
   the record of where the project came from instead. */
const STEP_WORK = {
  design:        'Proposal & design',
  project_build: 'Build',
  development:   'Build',
  production:    'Build',
  delivery:      'Build',
};
/* Kept out of the rail because they are not moments in the journey: they are
   true at every step of it. */
const CROSS_TABS = ['Overview','Commercials','Changes & decisions','Conversation','Activity & audit'];

function stWay(p, v, sel, tab){
  const cur = p.stages.indexOf(p.stage);
  return `<ol class="way" aria-label="Project steps">
    ${p.stages.map((sid, i) => {
      const d = stageDef(sid);
      const state = i < cur ? 'done' : i === cur ? 'now' : 'ahead';
      const on = !tab && sid === sel;
      return `<li><button class="way-s way-s--${state} ${on ? 'way-s--on' : ''}"
        data-act="prjStep" data-s="${esc(sid)}" data-p="${esc(p.id)}" ${on ? 'aria-current="true"' : ''}>
        <span class="way-i">${state === 'done' ? '✓' : i + 1}</span>
        <span class="way-n">${esc(d.name)}</span>
        <span class="way-m">${state === 'done' ? esc(stageDoneWhen(p, sid).replace('Completed ', ''))
          : state === 'now' ? st(p.opStatus).label : 'Not started'}</span>
      </button></li>`;
    }).join('')}
  </ol>`;
}

/* Where a project came from, for the three steps that happened before it had
   an account: the enquiry as it was written, and what was decided about it. */
function stStepOrigin(p, sid){
  const acc = account(p.account);
  const inq = S.inquiries.find(i => i.accountId === p.account) || null;
  const when = (p.stageLog || []).find(x => x.stage === sid);
  const rows = [];
  if(inq){
    rows.push(['Enquiry', `${inq.ref || '—'} · ${dateShort(inq.submitted)}`]);
    if(inq.company) rows.push(['Company', inq.company]);
    if(inq.contact) rows.push(['Wrote in', inq.contact]);
    if(inq.callAt)  rows.push(['First call', slotLabel ? slotLabel(inq.callAt) : String(inq.callAt)]);
    if(inq.discovery) rows.push(['Call notes', inq.discovery]);
  } else {
    rows.push(['Account opened', dateShort(acc.since)]);
    rows.push(['Account Manager', user(p.am).name]);
  }
  return `
    <div class="stack-5">
      <div class="card">
        <div class="eyebrow">What we were told</div>
        <p class="t-sm" style="margin-top:10px;white-space:pre-wrap">${esc(p.brief || 'No brief recorded.')}</p>
      </div>
      <div class="card">
        <div class="eyebrow">The record</div>
        <div class="stack-2" style="margin-top:12px">
          ${rows.map(([k, val]) => `<div class="factline"><span>${esc(k)}</span><span class="med">${esc(val)}</span></div>`).join('')}
          ${when ? `<div class="factline"><span>Closed</span><span class="med">${dateTime(when.at)}</span></div>` : ''}
        </div>
        ${inq ? `<div class="btn-row" style="margin-top:14px">
          <button class="btn btn--ghost btn--sm" data-go="studio:inquiries">Open the enquiry board</button></div>` : ''}
      </div>
    </div>`;
}

/* One step, opened. The step the project is actually on gets the working view —
   what is blocking it, what is on your desk, what the customer is being told.
   A finished or future step shows the same work, with its state said plainly. */
function stStepPanel(p, v, u, ns, sid, cv){
  const d = stageDef(sid);
  const cur = p.stages.indexOf(p.stage), i = p.stages.indexOf(sid);
  const state = i < cur ? 'done' : i === cur ? 'now' : 'ahead';
  const work = STEP_WORK[sid];

  const head = `
    <div class="stw-hd">
      <div>
        <div class="row" style="gap:10px;align-items:baseline;flex-wrap:wrap">
          <h2 class="t-h4">${esc(d.name)}</h2>
          ${state === 'done' ? pill('complete') : state === 'now' ? pill(p.opStatus) : '<span class="chip">Not started</span>'}
          ${stagePay(sid, 'studio') ? `<span class="pstep-pay">${esc(stagePay(sid, 'studio'))}</span>` : ''}
        </div>
        <p class="t-sm muted" style="margin-top:6px">${esc(d.blurb)}</p>
      </div>
      ${state === 'done' ? `<div class="stw-when">${esc(stageDoneWhen(p, sid))}</div>`
        : state === 'now' ? `<div class="stw-who"><span class="stw-lbl" style="margin:0">Waiting on</span>
            <div class="t-sm med">${esc(v.responsible)}</div></div>` : ''}
    </div>`;

  /* the pre-account steps carry their record rather than a workspace */
  if(!work) return `<section class="stw">${head}${stStepOrigin(p, sid)}</section>`;

  return `<section class="stw">
    ${head}
    ${state === 'now' ? stThisStep(p, v, u, ns) : ''}
    ${state === 'ahead' ? `<div class="banner"><div>
      <div class="banner-t">This step has not started</div>
      <div class="banner-d">You are looking at it early. Everything here can be prepared now and it stays a draft
        until the project reaches this step${p.stages[cur] ? ' — it is on ' + esc(stageDef(p.stage).name) + ' at the moment' : ''}.</div>
    </div></div>` : ''}
    <div class="stw-work">
      <div class="stw-lbl">${esc(work === 'Build' ? 'The garments and positions' : work)}</div>
      ${stProjectTab(p, v, work, u, cv)}
    </div>
  </section>`;
}

/* ---- Project detail ------------------------------------------------------ */
function stProject(id){
  const p = project(id);
  if(!p) return stShell('projects','Project','<div class="empty">Not found.</div>');
  const u = user(SESSION.user);
  const v = views.studioProject(p, u);
  const cur = p.stages.indexOf(p.stage);
  /* Two axes, not nine tabs: which step you are looking at, and — when you
     want it — one of the views that spans the whole project. */
  const tab = UI.prjTab || null;
  /* The chosen step belongs to the project it was chosen in. Keyed this way it
     cannot follow you into the next project, however you got there — a click,
     a back button or a link from somewhere else. */
  const sel = (UI.prjStepFor === p.id && p.stages.includes(UI.prjStep)) ? UI.prjStep : p.stage;
  const tabs = CROSS_TABS.concat(can(u,'phase_override','do') ? ['Override'] : []);
  const cv = S.conversations.find(c => c.project === p.id);
  const ns = nextStage(p);

  return stShell('projects', p.name, `
    <div class="crumbs" style="margin-bottom:16px">
      <a data-go="studio:projects">Projects</a><span>›</span>
      <a data-go="studio:customer:${p.account}">${esc(account(p.account).name)}</a><span>›</span><span>${p.ref}</span></div>

    <div class="stagehd stagehd--slim">
      <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:16px">
        <div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <h1 class="t-h3">${esc(p.name)}</h1>${pill(p.opStatus)}${p.risk?pill('at_risk'):''}
            ${p.draftDirty?'<span class="chip" style="color:var(--wait)">Draft ahead of published v'+p.version+'</span>':''}
          </div>
          <div class="mono-ref" style="margin-top:4px">${p.ref} · ${esc(account(p.account).name)} · owner ${esc(v.owner.name)} · published v${p.version} on ${dateTime(p.publishedAt)}</div>
        </div>
        <div class="btn-row">
          ${can(u,'publish','do',{project:p.id}) ? `<button class="btn ${p.draftDirty?'btn--primary':'btn--ghost'} btn--sm" data-act="publish" data-p="${p.id}">
            ${p.draftDirty?'Publish version '+(p.version+1):'Republish'}</button>` : ''}
          ${ns && can(u,'phase_advance','do',{project:p.id}) ? `<button class="btn btn--ghost btn--sm" data-act="advance" data-p="${p.id}">Advance to ${stageDef(ns).name}</button>` : ''}
          ${can(u,'phase_advance','do',{project:p.id}) ? `<button class="btn btn--ghost btn--sm" data-act="mvStage" data-p="${p.id}">Move step…</button>` : ''}
        </div>
      </div>
    </div>

    ${stWay(p, v, sel, tab)}

    ${v.blockers.length ? `<button class="wayblock" data-act="prjStep" data-s="${esc(p.stage)}" data-p="${esc(p.id)}">
      <span class="wayblock-n">${v.blockers.length}</span>
      <span>${v.blockers.length === 1 ? 'thing is' : 'things are'} holding ${esc(stageDef(p.stage).name)}${
        nextStage(p) ? ' shut against ' + esc(stageDef(nextStage(p)).name) : ''}</span>
      <span class="wayblock-go">See them →</span>
    </button>` : ''}

    <div class="tabs tabs--quiet">
      <span class="tabs-l">Across the project</span>
      ${tabs.map(t => {
        const n = t === 'Changes & decisions'
          ? v.allCRs.filter(c => ['submitted','under_review'].includes(c.state)).length
          : t === 'Build' ? v.garments.length : 0;
        return `<button class="tab ${tab===t?'tab--on':''}" data-act="prjTab" data-t="${esc(t)}">${t}${n ? ' (' + n + ')' : ''}</button>`;
      }).join('')}
    </div>

    <div class="cols cols--wide">
      <div>${!tab ? stStepPanel(p, v, u, ns, sel, cv)
        : tab === 'Override' ? stOverride(p, v, u)
        : stProjectTab(p, v, tab, u, cv)}</div>
      <div class="stack">
        <div class="cvp">
          <div class="cvp-hd">
            <span class="eyebrow" style="color:var(--navy)">What the customer sees</span>
            <span class="t-xs num">v${p.version}</span>
          </div>
          <div class="stack-2">
            <div class="factline"><span>Stage</span><span class="med">${stageDef(p.stage).name}</span></div>
            <div class="factline"><span>Status</span><span>${st(p.opStatus).label}</span></div>
            <div class="factline"><span>They must</span><span>${esc(v.youDo)}</span></div>
            <div class="factline"><span>Published</span><span>${dateTime(p.publishedAt)}</span></div>
          </div>
          ${p.draftDirty ? `<div class="banner banner--wait" style="margin-top:12px;padding:10px"><div>
            <div class="banner-t">Draft ahead of published</div>
            <div class="banner-d">Your working changes are not visible. Publish to release them.</div></div></div>` : ''}
          <button class="btn btn--ghost btn--sm btn--block" style="margin-top:12px"
            data-act="previewAs" data-acc="${p.account}">Open the customer view →</button>
        </div>

        <div class="card"><div class="eyebrow">Ownership</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Owner</dt><dd>${esc(v.owner.name)}</dd>
            <dt>Account Manager</dt><dd>${esc(v.am.name)}</dd>
            <dt>Created</dt><dd>${dateShort(p.created)}</dd>
            <dt>Target</dt><dd>${dateShort(p.target)}</dd>
            <dt>Pieces</dt><dd class="num">${projectPieces(p)}</dd>
          </dl></div>

        ${v.showCost ? (() => {
          const val = projectValue(p);
          /* The cost estimate is indicative; the sell price is not — it is
             what was actually typed against each garment and line. */
          const cost = val.pieces * 22.4;
          const marg = val.total > 0 ? (1 - cost / val.total) * 100 : null;
          return `<div class="card"><div class="eyebrow">Cost and margin</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Priced to the customer</dt><dd class="num">${money(val.total)}</dd>
            <dt>Estimated cost</dt><dd class="num">${money(cost)}</dd>
            <dt>Gross margin</dt><dd class="num" style="color:var(--${marg == null ? 'muted' : marg < 35 ? 'stop' : marg < 50 ? 'wait' : 'go'})">${marg == null ? '—' : marg.toFixed(1) + '%'}</dd>
            <dt>Scheduled to be paid</dt><dd class="num">${money(milestonesTotal(p))}</dd>
          </dl>
          <p class="t-xs faint" style="margin-top:8px">The sell price is what you typed against each garment and line.
            The cost is an estimate at ${money(22.4)} a piece. Never projected into the customer view.</p>
        </div>`;})() : `<div class="card card--quiet"><div class="eyebrow">Cost and margin</div>
          <p class="t-xs muted" style="margin-top:8px">Hidden for your role. The field is not fetched, not just visually suppressed.</p></div>`}
      </div>
    </div>
  `);
}

/* ---- the Back Office project screen, tab by tab -------------------------
   The Build tab is the one that matters: it is where a project is actually
   made, and it can be used at any point in the project's life. Nothing here
   is a wizard that runs once. */

function boGarmentRow(g, p, u){
  const b = base(g.base);
  const pieces = garmentPieces(g);
  const val = garmentValue(g);
  const img = (g.images || [])[0];
  return `
  <div class="bo-g">
    <button class="bo-g-m" data-act="gImages" data-g="${g.id}" title="Images on this garment">
      ${img ? `<img src="${img.src}" alt="${esc(img.cap || g.name)}">`
            : `<span class="bo-g-ph">${g.glyph}</span>`}
      <span class="bo-g-n">${(g.images||[]).length || 'Add'}</span>
    </button>
    <div class="bo-g-b">
      <div class="row-between" style="align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div style="min-width:0">
          <div class="t-sm med">${esc(g.name)}</div>
          <div class="mono-ref">${b.ref} ${g.baseV} · rev ${g.rev}${g.round ? ' · round ' + g.round + '/3' : ''}</div>
        </div>
        ${pill(g.state)}
      </div>
      <div class="wrap-row" style="margin-top:8px;gap:6px">
        <span class="chip">${esc(FABRICS[g.fabric] ? FABRICS[g.fabric].name : g.fabric)}</span>
        <span class="chip">${esc(S.personalization[g.pers.method].name)} · ${esc(S.positions_lib[g.pers.pos])}</span>
        <span class="chip">${g.colourways.length} colour${g.colourways.length === 1 ? '' : 's'}</span>
        <span class="chip">${pieces} piece${pieces === 1 ? '' : 's'}</span>
        ${g.unitPrice != null
          ? `<span class="chip chip--on">${money(g.unitPrice)} each${val ? ' · ' + money(val) : ''}</span>`
          : `<span class="chip bo-chip-warn">No price yet</span>`}
      </div>
    </div>
    <div class="bo-g-a">
      <button class="btn btn--ghost btn--sm" data-act="gEdit" data-g="${g.id}">Edit</button>
      <button class="btn btn--ghost btn--sm" data-act="gAsk" data-g="${g.id}">Send for a decision</button>
      ${g.state === 'changes_requested' && g.round < 3 ? `<button class="btn btn--primary btn--sm" data-act="authRound" data-g="${g.id}">Authorise round ${g.round+1}</button>` : ''}
      ${g.state === 'in_development' && p.stage === 'development' ? `<button class="btn btn--ghost btn--sm" data-act="readyFit" data-g="${g.id}">Ready for fitting</button>` : ''}
      ${g.state === 'manual_resolution' ? `<button class="btn btn--danger btn--sm" data-act="resolveG" data-g="${g.id}">Resolve</button>` : ''}
      <button class="btn btn--quiet btn--sm" data-act="gRemove" data-g="${g.id}">Remove</button>
    </div>
  </div>`;
}

function stProjectTab(p, v, tab, u, cv){
  if(tab === 'Build'){
    const val = projectValue(p);
    return `
    <div class="stack">
      <div class="bo-bar">
        <div>
          <div class="t-sm med">${p.positions.length} position${p.positions.length === 1 ? '' : 's'} · ${v.garments.length} garment${v.garments.length === 1 ? '' : 's'} · ${val.pieces} piece${val.pieces === 1 ? '' : 's'}</div>
          <div class="t-xs muted">Add, change or take out anything here at any point. Edits are drafts until you publish.</div>
        </div>
        <div class="btn-row">
          <button class="btn btn--ghost btn--sm" data-act="addPos" data-p="${p.id}">Add a position</button>
          ${p.draftDirty ? `<button class="btn btn--primary btn--sm" data-act="publish" data-p="${p.id}">Publish version ${p.version+1}</button>` : ''}
        </div>
      </div>

      ${p.positions.length ? p.positions.map(pos => `
        <div class="card card--flush">
          <div class="row-between bo-pos-h">
            <div>
              <div class="t-h5">${esc(pos.name)}</div>
              <div class="t-xs muted">${pos.people} ${pos.people === 1 ? 'person' : 'people'} · ${pos.garments.length} garment${pos.garments.length === 1 ? '' : 's'}</div>
            </div>
            <div class="btn-row">
              <button class="btn btn--ghost btn--sm" data-act="editPos" data-p="${p.id}" data-pos="${pos.id}">Edit</button>
              <button class="btn btn--primary btn--sm" data-act="addGarment" data-p="${p.id}" data-pos="${pos.id}">Add a garment</button>
              <button class="btn btn--quiet btn--sm" data-act="rmPos" data-p="${p.id}" data-pos="${pos.id}">Remove</button>
            </div>
          </div>
          <div class="bo-pos-b">
            ${pos.garments.length
              ? pos.garments.map(gid => { const g = garment(gid); return g ? boGarmentRow(g, p, u) : ''; }).join('')
              : `<button class="bo-empty" data-act="addGarment" data-p="${p.id}" data-pos="${pos.id}">
                   <span class="t-sm med">No garments on ${esc(pos.name)} yet</span>
                   <span class="t-xs muted">Choose one from Pamuuc Bases, give it a fabric, colours and a price.</span>
                 </button>`}
          </div>
        </div>`).join('')
      : `<button class="bo-empty bo-empty--lg" data-act="addPos" data-p="${p.id}">
          <span class="t-h5">Start with a position</span>
          <span class="t-sm muted">A position is a role you are dressing — Reception, Bar, Housekeeping. Garments hang off it.</span>
        </button>`}

      <div class="bo-note">
        <div class="t-sm med">Taking something out is a recorded act</div>
        <p class="t-xs muted" style="margin-top:6px">Removing an approved garment withdraws any decision the customer
          has already made on it and writes the reason to the audit log. The customer sees the garment disappear from
          the project at the next publish, and the reason in the activity feed.</p>
      </div>
    </div>`;
  }

  if(tab === 'Proposal & design'){
    const boards = p.boards || [];
    const designs = p.designs || [];
    const ms = milestones(p);
    return `
    <div class="stack-6">
      <section>
        <div class="row-between" style="margin-bottom:12px;flex-wrap:wrap;gap:12px">
          <h2 class="t-h4">What you are proposing</h2>
          <div class="btn-row">
            <button class="btn btn--ghost btn--sm" data-act="editNote" data-p="${p.id}">${p.proposal && p.proposal.note ? 'Edit the covering note' : 'Write a covering note'}</button>
            <button class="btn btn--primary btn--sm" data-act="askProposal" data-p="${p.id}">Send the proposal for a decision</button>
          </div>
        </div>
        <div class="card">
          ${p.proposal && p.proposal.note
            ? `<p class="t-sm" style="white-space:pre-wrap">${esc(p.proposal.note)}</p>`
            : `<p class="t-sm muted">Nothing written yet. This is the note that sits at the top of the proposal the
                 customer reads — what you are recommending, and why.</p>`}
        </div>
      </section>

      <section>
        <div class="row-between" style="margin-bottom:12px">
          <h2 class="t-h4">Boards and references</h2>
          <button class="btn btn--ghost btn--sm" data-act="addBoard" data-p="${p.id}">Add images</button>
        </div>
        ${boards.length ? `<div class="bo-grid">
          ${boards.map(b => `<figure class="bo-im">
            <img src="${b.src}" alt="${esc(b.cap || 'Board image')}">
            <figcaption>
              <span>${esc(b.cap || 'Untitled')}</span>
              <button class="bo-x" data-act="rmBoard" data-p="${p.id}" data-im="${b.id}" title="Remove">×</button>
            </figcaption>
          </figure>`).join('')}
        </div>` : `<button class="bo-empty" data-act="addBoard" data-p="${p.id}">
          <span class="t-sm med">No boards yet</span>
          <span class="t-xs muted">Moodboards, fabric shots, reference photography — whatever you want them to see
            alongside the garments.</span></button>`}
      </section>

      <section>
        <div class="row-between" style="margin-bottom:12px">
          <h2 class="t-h4">Design work</h2>
          <button class="btn btn--ghost btn--sm" data-act="addDesign" data-p="${p.id}">Add a design</button>
        </div>
        ${designs.length ? `<div class="stack-3">
          ${designs.map(dz => {
            const gate = dz.gate ? ms.find(m => m.id === dz.gate) : null;
            const held = gate && gate.state !== 'paid';
            return `<div class="card">
              <div class="row-between" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
                <div style="min-width:0">
                  <div class="t-h5">${esc(dz.title)}</div>
                  <div class="t-xs muted" style="margin-top:2px">${esc(dz.by)} · added ${dateTime(dz.at)}</div>
                </div>
                <div class="row" style="gap:8px">
                  ${pill(dz.state === 'published' ? 'published' : 'draft')}
                  ${gate ? `<span class="chip ${held ? 'bo-chip-warn' : 'chip--on'}">${held ? 'Held until ' : 'Released by '}${esc(gate.label)}</span>` : ''}
                </div>
              </div>
              ${dz.note ? `<p class="t-sm muted" style="margin-top:10px">${esc(dz.note)}</p>` : ''}
              ${(dz.images||[]).length ? `<div class="bo-grid bo-grid--sm" style="margin-top:12px">
                ${dz.images.map(im => `<figure class="bo-im"><img src="${im.src}" alt="${esc(im.cap||dz.title)}">
                  <figcaption><span>${esc(im.cap||'')}</span></figcaption></figure>`).join('')}
              </div>` : ''}
              <div class="btn-row" style="margin-top:12px">
                ${dz.state === 'draft'
                  ? `<button class="btn btn--primary btn--sm" data-act="pubDesign" data-p="${p.id}" data-dz="${dz.id}">Release to the customer</button>`
                  : `<span class="t-xs muted">Released ${dateTime(dz.publishedAt)}${held ? ' — still held behind the payment step above' : ''}</span>`}
                <button class="btn btn--quiet btn--sm" data-act="rmDesign" data-p="${p.id}" data-dz="${dz.id}">Remove</button>
              </div>
            </div>`;}).join('')}
        </div>` : `<button class="bo-empty" data-act="addDesign" data-p="${p.id}">
          <span class="t-sm med">No design work on this project</span>
          <span class="t-xs muted">Upload what the designer made, and tie it to the payment step that releases it.
            The customer sees that it exists and what it is waiting on.</span></button>`}
      </section>
    </div>`;
  }

  if(tab === 'Changes & decisions') return `
    <div class="stack-6">
      <section>
        <div class="row-between" style="margin-bottom:12px">
          <h2 class="t-h4">Decisions you have asked for</h2>
          <button class="btn btn--ghost btn--sm" data-act="askAny" data-p="${p.id}">Ask for a decision</button>
        </div>
        ${v.allApprovals.length ? `<div class="rows">${v.allApprovals.map(a => `<div class="rw rw--static">
          <span class="rw-main"><span class="rw-t">${esc(a.kind)}</span>
            <span class="rw-s">${esc(a.rev)}${a.due ? ' · due ' + dateShort(a.due) : ''}${a.decidedAt ? ` · ${st(a.state).label.toLowerCase()} ${dateTime(a.decidedAt)} by ${esc(user(a.decidedBy).name)}` : ''}</span>
            ${a.comment ? `<span class="rw-s" style="color:var(--ink)">“${esc(a.comment)}”</span>` : ''}</span>
          <span class="rw-side">${pill(a.state)}
            ${a.state === 'awaiting_customer' ? `<button class="btn btn--quiet btn--sm" data-act="pullDecision" data-id="${a.id}">Withdraw</button>` : ''}</span></div>`).join('')}</div>`
        : '<div class="card card--quiet"><span class="t-sm muted">Nothing has been sent for a decision yet.</span></div>'}
        <p class="t-xs muted" style="margin-top:12px">Every decision names a fixed revision, so a later edit cannot inherit an old answer.</p>
      </section>

      <section><h2 class="t-h4" style="margin-bottom:12px">Customer change requests</h2>
        ${v.allCRs.length ? `<div class="stack-3">${v.allCRs.map(c => `
          <div class="card">
            <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
              <div><div class="t-h5">${esc(c.title)}</div>
                <div class="t-xs muted" style="margin-top:2px">${esc(user(c.by).name)} · ${dateTime(c.at)} · owner ${esc(user(c.owner).name)}</div></div>
              ${pill(c.state)}
            </div>
            <p class="t-sm muted" style="margin-top:12px">${esc(c.reason)}</p>
            <div class="card card--quiet" style="margin-top:12px">
              <div class="eyebrow">Before → requested</div>
              <div class="diff" style="margin-top:8px">
                ${c.changes.map(ch => `<span class="diff-k">${esc(ch.field)}</span>
                  <span><span class="was">${esc(ch.was)}</span><span class="arrow">→</span><span class="now">${esc(ch.now)}</span></span>`).join('')}
              </div>
            </div>
            ${c.outcome ? `<div class="banner banner--go" style="margin-top:12px"><div>
              <div class="banner-t">${st(c.state).label} · ${dateTime(c.decidedAt)}</div>
              <div class="banner-d">${esc(c.outcome)}</div></div></div>` : ''}
            ${['submitted','under_review'].includes(c.state) && can(u,'change_request','decide',{project:p.id}) ? `
              <div class="btn-row" style="margin-top:12px">
                <button class="btn btn--primary btn--sm" data-act="crDecide" data-id="${c.id}" data-o="approved">Approve</button>
                <button class="btn btn--ghost btn--sm" data-act="crDecide" data-id="${c.id}" data-o="partially_approved">Partially approve</button>
                <button class="btn btn--ghost btn--sm" data-act="crDecide" data-id="${c.id}" data-o="clarification">Ask a question</button>
                <button class="btn btn--danger btn--sm" data-act="crDecide" data-id="${c.id}" data-o="declined">Decline</button>
              </div>` : ''}
            ${['approved','partially_approved'].includes(c.state) ? `
              <div class="banner banner--wait" style="margin-top:12px"><div>
                <div class="banner-t">Decided, but not yet real</div>
                <div class="banner-d">A decision is not an implementation. Incorporate it into a new revision to change the specification.</div>
                <div class="btn-row" style="margin-top:8px">
                  <button class="btn btn--primary btn--sm" data-act="crIncorporate" data-id="${c.id}">Incorporate into a new revision</button>
                </div></div></div>` : ''}
          </div>`).join('')}</div>` : '<div class="card card--quiet"><span class="t-sm muted">No requests on this project.</span></div>'}
      </section>
    </div>`;

  if(tab === 'Commercials'){
    const gs = v.garments;
    const val = projectValue(p);
    const ms = milestones(p);
    const scheduled = milestonesTotal(p);
    const gap = val.total - scheduled;
    return `
    <div class="stack-6">
      <section>
        <div class="row-between" style="margin-bottom:12px;flex-wrap:wrap;gap:12px">
          <div><h2 class="t-h4">What this project costs</h2>
            <p class="t-xs muted" style="margin-top:4px">Typed in, garment by garment. Nothing here comes from a rate card.</p></div>
          <button class="btn btn--ghost btn--sm" data-act="addLine" data-p="${p.id}">Add a cost line</button>
        </div>
        <div class="tw"><table class="tbl">
          <thead><tr><th>Line</th><th>Basis</th><th class="tnum">Pieces</th><th class="tnum">Unit</th><th class="tnum">Amount</th><th></th></tr></thead>
          <tbody>
            ${gs.map(g => `<tr>
              <td class="med">${esc(g.name)}</td>
              <td class="t-xs muted">${esc(p.positions.find(x => x.id === g.position)?.name || '—')} · ${esc(FABRICS[g.fabric] ? FABRICS[g.fabric].name : g.fabric)}</td>
              <td class="tnum num">${garmentPieces(g)}</td>
              <td class="tnum num">${g.unitPrice != null ? money(g.unitPrice) : '<span class="faint">—</span>'}</td>
              <td class="tnum num">${garmentValue(g) != null ? money(garmentValue(g)) : '<span class="faint">not priced</span>'}</td>
              <td><button class="btn btn--quiet btn--sm" data-act="gPrice" data-g="${g.id}">${g.unitPrice != null ? 'Change' : 'Set a price'}</button></td>
            </tr>`).join('')}
            ${(p.lines||[]).map(l => `<tr>
              <td class="med">${esc(l.label)}</td>
              <td class="t-xs muted">${esc(l.note || 'Fixed line')}</td>
              <td class="tnum">—</td><td class="tnum">—</td>
              <td class="tnum num">${money(l.amount)}</td>
              <td><button class="btn btn--quiet btn--sm" data-act="rmLine" data-p="${p.id}" data-l="${l.id}">Remove</button></td>
            </tr>`).join('')}
            ${!gs.length && !(p.lines||[]).length ? '<tr><td colspan="6" class="tbl-empty">Nothing priced yet.</td></tr>' : ''}
          </tbody>
          ${gs.length || (p.lines||[]).length ? `<tfoot><tr>
            <td colspan="4" class="med">Total as proposed</td>
            <td class="tnum num med">${money(val.total)}</td><td></td></tr></tfoot>` : ''}
        </table></div>
        ${val.unpriced ? `<div class="banner banner--wait" style="margin-top:12px"><div>
          <div class="banner-t">${val.unpriced} garment${val.unpriced > 1 ? 's have' : ' has'} no price</div>
          <div class="banner-d">The customer sees “price to follow” against ${val.unpriced > 1 ? 'them' : 'it'}, not a guess.</div></div></div>` : ''}
      </section>

      <section>
        <div class="row-between" style="margin-bottom:12px;flex-wrap:wrap;gap:12px">
          <div><h2 class="t-h4">Payment steps</h2>
            <p class="t-xs muted" style="margin-top:4px">You decide what is paid, when, and what it releases. A step holds its stage shut until it is settled.</p></div>
          <button class="btn btn--primary btn--sm" data-act="addMs" data-p="${p.id}">Add a payment step</button>
        </div>
        ${ms.length ? `<div class="stack-2">
          ${ms.map(m => `<div class="bo-ms ${m.state === 'paid' ? 'bo-ms--done' : ''}">
            <div class="bo-ms-b">
              <div class="t-sm med">${esc(m.label)}</div>
              ${m.what ? `<p class="t-xs muted" style="margin-top:4px">${esc(m.what)}</p>` : ''}
              <div class="t-xs faint" style="margin-top:6px">
                ${m.stage ? 'Holds ' + stageDef(m.stage).name + ' shut' : 'Does not hold a stage'}${m.due ? ' · payable by ' + dateShort(m.due) : ''} · ${esc(m.kind)}${m.docId && doc(m.docId) ? ' · ' + doc(m.docId).num : ''}</div>
            </div>
            <div class="bo-ms-n"><span class="t-sm num med">${money(m.amount)}</span>${pill(m.state)}</div>
            <div class="bo-ms-a">
              ${m.state === 'draft' ? `<button class="btn btn--primary btn--sm" data-act="pubMs" data-p="${p.id}" data-m="${m.id}">Issue it</button>` : ''}
              <button class="btn btn--ghost btn--sm" data-act="editMs" data-p="${p.id}" data-m="${m.id}">Edit</button>
              ${m.state !== 'paid' ? `<button class="btn btn--quiet btn--sm" data-act="rmMs" data-p="${p.id}" data-m="${m.id}">Remove</button>` : ''}
            </div>
          </div>`).join('')}
          <div class="bo-ms-tot">
            <span class="t-sm med">Scheduled across ${ms.length} step${ms.length === 1 ? '' : 's'}</span>
            <span class="t-sm num med">${money(scheduled)}</span>
            <span class="t-xs ${Math.abs(gap) < 0.5 ? 'muted' : ''}" ${Math.abs(gap) < 0.5 ? '' : 'style="color:var(--wait)"'}>
              ${Math.abs(gap) < 0.5 ? 'Matches the proposed total'
                : gap > 0 ? money(gap) + ' of the project is not scheduled yet'
                          : money(-gap) + ' more is scheduled than the project is priced at'}</span>
          </div>
        </div>`
        : `<button class="bo-empty" data-act="addMs" data-p="${p.id}">
            <span class="t-sm med">No payment steps on this project</span>
            <span class="t-xs muted">Nothing gates it. Add a step, name it, set the amount, and choose the stage it holds shut.</span>
          </button>`}
      </section>

      <section><h2 class="t-h4" style="margin-bottom:12px">Documents</h2>
        <div class="tw"><table class="tbl">
          <thead><tr><th>Document</th><th>Number</th><th>Issued</th><th class="tnum">Amount</th><th>Status</th><th>Visible</th><th></th></tr></thead>
          <tbody>${v.documents.length ? v.documents.map(d => `<tr>
            <td>${esc(d.title)}</td><td class="num">${d.num}</td><td>${dateShort(d.issued)}</td>
            <td class="tnum num">${money(d.amount)}</td><td>${pill(d.state)}</td>
            <td>${d.visible ? 'Yes' : '<span class="faint">Internal</span>'}</td>
            <td>${!d.visible && can(u,'invoice','publish') ? `<button class="btn btn--ghost btn--sm" data-act="pubDoc" data-id="${d.id}">Publish</button>` : ''}</td>
          </tr>`).join('') : '<tr><td colspan="7" class="tbl-empty">No documents yet. Issuing a payment step creates one.</td></tr>'}</tbody></table></div>
      </section>
    </div>`;
  }

  if(tab === 'Conversation') return `
    <div class="card">
      ${cv && cv.messages.length ? cv.messages.map(m => `
        <div class="msg ${m.internal?'msg--internal':''}">
          <span class="av ${user(m.by).side==='studio'?'av--studio':''}">${user(m.by).init}</span>
          <div class="msg-b">
            <div class="msg-h"><span class="msg-a">${esc(user(m.by).name)}</span>
              <span class="msg-r">${m.internal?'Internal note — never customer visible':user(m.by).side==='studio'?'PAMUUC':esc(account(p.account).name)} · ${dateTime(m.at)}</span></div>
            <div class="msg-t">${esc(m.text)}</div></div>
        </div>`).join('') : '<p class="t-sm muted">No conversation yet.</p>'}
      <div style="margin-top:16px">
        <textarea class="inp" id="msgbox" placeholder="Reply to the customer…"></textarea>
        <div class="btn-row" style="margin-top:8px;justify-content:flex-end">
          <button class="btn btn--ghost btn--sm" data-act="send" data-cv="${cv?cv.id:''}" data-internal="1">Add an internal note</button>
          <button class="btn btn--primary btn--sm" data-act="send" data-cv="${cv?cv.id:''}">Send to customer</button>
        </div>
      </div>
    </div>`;

  if(tab === 'Activity & audit') return `
    <div class="stack-6">
      <section><h2 class="t-h4" style="margin-bottom:12px">Activity</h2>
        <div class="card"><div class="feed">
          ${S.events.filter(e => e.project === p.id).slice(0,30).map((e,i) => `
            <div class="fe ${i===0?'fe--now':''}"><div class="t-sm">${esc(e.text)}</div>
              <div class="fe-m">${dateTime(e.at)} · ${esc(user(e.actor).name)}${e.customerVisible?'':' · internal'}</div></div>`).join('')
            || '<p class="t-sm muted">Nothing yet.</p>'}
        </div></div></section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Audit</h2>
        <div class="tw"><table class="tbl">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Was</th><th>Now</th><th>Reason</th></tr></thead>
          <tbody>${S.audit.filter(a => a.record === p.ref || a.record === p.id ||
            S.garments.some(g => g.project === p.id && g.id === a.record)).map(a => `<tr>
            <td>${dateTime(a.at)}</td><td>${esc(user(a.actor).name)}<br><span class="t-xs muted">${esc(a.role)}</span></td>
            <td>${esc(a.action)}</td><td class="muted">${esc(a.was ?? '—')}</td><td class="med">${esc(a.now ?? '—')}</td>
            <td class="t-xs muted">${esc(a.reason || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="tbl-empty">No audit entries.</td></tr>'}
          </tbody></table></div></section>
    </div>`;

  /* Overview */
  const val = projectValue(p);
  return `
    <div class="stack-6">
      <section><h2 class="t-h4" style="margin-bottom:12px">Brief</h2>
        <div class="card">${p.brief ? `<p class="t-sm">${esc(p.brief)}</p>`
          : '<p class="t-sm muted">No brief recorded. Add one so everyone works from the same words.</p>'}</div></section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Garment states</h2>
        <div class="tw"><table class="tbl">
          <thead><tr><th>Garment</th><th>Position</th><th>Base</th><th>Rev</th><th class="tnum">Round</th><th class="tnum">Pieces</th><th class="tnum">Value</th><th>State</th></tr></thead>
          <tbody>${v.garments.length ? v.garments.map(g => `<tr>
            <td><span class="med">${esc(g.name)}</span></td>
            <td>${esc(p.positions.find(x => x.id === g.position)?.name || '—')}</td>
            <td class="num">${base(g.base).ref} ${g.baseV}</td><td class="num">${g.rev}</td>
            <td class="tnum num" ${g.round>=3?'style="color:var(--stop);font-weight:700"':''}>${g.round}/3</td>
            <td class="tnum num">${garmentPieces(g)}</td>
            <td class="tnum num">${garmentValue(g) != null ? money(garmentValue(g)) : '<span class="faint">—</span>'}</td>
            <td>${pill(g.state)}</td></tr>`).join('')
            : '<tr><td colspan="8" class="tbl-empty">No garments yet — build the project on the Build tab.</td></tr>'}</tbody></table></div>
      </section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Where this project stands</h2>
        <div class="rows">
          <div class="rw rw--static"><span class="rw-main"><span class="rw-t">Priced</span>
            <span class="rw-s">${val.unpriced ? val.unpriced + ' garment' + (val.unpriced>1?'s':'') + ' still without a price' : 'Every garment has a price'}</span></span>
            <span class="rw-side"><span class="t-sm num med">${money(val.total)}</span></span></div>
          <div class="rw rw--static"><span class="rw-main"><span class="rw-t">Scheduled to be paid</span>
            <span class="rw-s">${milestones(p).length} payment step${milestones(p).length === 1 ? '' : 's'}</span></span>
            <span class="rw-side"><span class="t-sm num">${money(milestonesTotal(p))}</span></span></div>
          <div class="rw rw--static"><span class="rw-main"><span class="rw-t">Waiting on the customer</span>
            <span class="rw-s">${v.allApprovals.filter(a => a.state === 'awaiting_customer').length} decision${v.allApprovals.filter(a => a.state === 'awaiting_customer').length === 1 ? '' : 's'}</span></span>
            <span class="rw-side">${v.allApprovals.filter(a => a.state === 'awaiting_customer').length ? pill('awaiting_customer') : pill('complete')}</span></div>
        </div>
      </section>
    </div>`;
}

/* ---- Pamuuc Bases -------------------------------------------------------- */
function stBases(){
  const openId = UI.openBase;
  const b = openId ? base(openId) : null;
  return stShell('bases', 'Pamuuc Bases', `
    <div class="page-hd"><div class="row-between" style="flex-wrap:wrap;gap:12px">
      <div><h1 class="t-h2">Pamuuc Bases</h1>
        <p class="page-sub">The controlled library of reusable garment foundations. A project garment references a base <em>version</em> — updating a base never changes an already approved project garment.</p></div>
      <div class="btn-row">
        <button class="btn btn--ghost btn--sm" data-act="csvImport">Import CSV</button>
        <button class="btn btn--ghost btn--sm" data-act="newFabric">Add a fabric</button>
        <button class="btn btn--primary btn--sm" data-act="newBase">New base</button>
      </div>
    </div></div>
    <div class="cols">
      <div class="tw"><table class="tbl">
        <thead><tr><th>Ref</th><th>Base</th><th>Category</th><th>Version</th><th class="tnum">Fabrics</th>
          <th class="tnum">Colours</th><th class="tnum">Used in</th><th>Status</th></tr></thead>
        <tbody>${S.bases.map(x => `<tr class="clickable" data-act="openBase" data-id="${x.id}">
          <td class="num">${x.ref}</td><td><span class="med">${x.glyph} ${esc(x.name)}</span></td>
          <td>${esc(x.cat)}</td><td class="num">${x.v}</td>
          <td class="tnum num">${x.fabrics.length}</td><td class="tnum num">${x.colours.length}</td>
          <td class="tnum num">${x.used}</td><td>${pill(x.status)}</td></tr>`).join('')}</tbody></table>

        <h2 class="t-h4" style="margin:28px 0 12px">Fabric library</h2>
        <table class="tbl">
          <thead><tr><th>Ref</th><th>Fabric</th><th>Specification</th><th>Provenance</th><th class="tnum">On bases</th></tr></thead>
          <tbody>${Object.keys(FABRICS).map(k => { const f = FABRICS[k];
            const on = S.bases.filter(b2 => b2.fabrics.includes(k)).length;
            return `<tr><td class="num">${esc(f.ref)}</td>
              <td><span class="med">${esc(f.name)}</span>${f.custom ? ' <span class="chip">added</span>' : ''}</td>
              <td class="t-sm muted">${esc(f.spec)}</td>
              <td>${f.prov ? 'Documented' : '<span class="faint">Not documented</span>'}</td>
              <td class="tnum num">${on || '—'}</td></tr>`;}).join('')}</tbody></table>
        <p class="t-xs muted" style="margin-top:12px">A fabric added here can be put on any base and chosen on any
          garment. Adding one never changes a project garment that has already been approved.</p>
      </div>

      <div class="stack">
        ${b ? `
        <div class="card">
          <div class="row-between" style="align-items:flex-start">
            <div><div class="t-h4">${b.glyph} ${esc(b.name)}</div>
              <div class="mono-ref">${b.ref} · ${b.v}</div></div>
            ${pill(b.status)}
          </div>
          <p class="t-sm muted" style="margin-top:12px">${esc(b.spec)}</p>
          <div class="sep"></div>
          <div class="eyebrow">Supported fabrics</div>
          <div class="stack-2" style="margin-top:8px">
            ${b.fabrics.filter(f => FABRICS[f]).map(f => `<div class="row-between"><span class="t-sm">${esc(FABRICS[f].name)}${FABRICS[f].custom ? ' <span class="chip">added</span>' : ''}</span>
              <span class="t-xs muted">${esc(FABRICS[f].ref)}</span></div>`).join('')}
            ${Object.keys(FABRICS).filter(f => !b.fabrics.includes(f)).length ? `
              <select class="inp" style="margin-top:8px" data-act="baseAddFab" data-b="${b.id}">
                <option value="">Offer another fabric on this base…</option>
                ${Object.keys(FABRICS).filter(f => !b.fabrics.includes(f))
                  .map(f => `<option value="${f}">${esc(FABRICS[f].name)} — ${esc(FABRICS[f].spec)}</option>`).join('')}
              </select>` : ''}
          </div>
          <div class="sep"></div>
          <div class="eyebrow">Supported colours</div>
          <div class="wrap-row" style="margin-top:8px;gap:6px">
            ${b.colours.map(c => `<span class="sw-btn"><span class="sw" style="background:${COLOURS[c].hex}"></span>${esc(COLOURS[c].name)}</span>`).join('')}
          </div>
          <div class="sep"></div>
          <div class="eyebrow">Personalisation</div>
          <p class="t-sm" style="margin-top:8px">${b.pers.map(x => S.personalization[x].name).join(', ')}<br>
            <span class="muted">at ${b.pos.map(x => S.positions_lib[x]).join(', ')}</span></p>
          <div class="sep"></div>
          <div class="eyebrow">Used in</div>
          <div class="stack-2" style="margin-top:8px">
            ${S.garments.filter(g => g.base === b.id).map(g => `<button class="row-between" data-go="studio:project:${g.project}"
              style="width:100%;background:transparent;border:0;padding:6px 0;cursor:pointer;text-align:left">
              <span class="t-sm">${esc(project(g.project).ref)} — ${esc(g.name)}</span>
              <span class="t-xs muted">${g.baseV} · rev ${g.rev}</span></button>`).join('') || '<span class="t-sm muted">Not used yet.</span>'}
          </div>
        </div>` : '<div class="card card--quiet"><span class="t-sm muted">Select a base to see its options, versions and where it is used.</span></div>'}
      </div>
    </div>
  `);
}

/* ---- Merchandising ------------------------------------------------------- */
function stMerch(){
  const u = user(SESSION.user);
  return stShell('merch', 'Merchandising', `
    <div class="page-hd"><div class="row-between" style="flex-wrap:wrap;gap:12px">
      <div><div class="row" style="gap:8px"><h1 class="t-h2">Merchandising</h1>${pillMerch('Merchandise')}</div>
        <p class="page-sub">The operational source for the public catalogue and for customer merchandise activity. Studio red identifies this line of business and nothing else.</p></div>
      <div class="btn-row">
        <button class="btn ${S.merchProducts.some(p=>p.imported)?'btn--ghost':'btn--primary'} btn--sm" data-act="openImport">Import catalogue CSV</button>
        ${can(u,'merch_publish','do') ? '<button class="btn btn--ghost btn--sm" data-act="newProduct">New product</button>' : ''}
      </div>
    </div></div>

    ${S.merchProducts.some(p => p.imported) ? `<div class="banner banner--go" style="margin-bottom:24px"><div>
      <div class="banner-t">Catalogue imported from CSV</div>
      <div class="banner-d">${S.merchProducts.filter(p=>p.imported).length} products are live on the public catalogue and in every customer's Merchandise section. Import again to replace them, or reset the prototype to go back to the seeded set.</div></div></div>` : ''}

    ${S.decoRates ? `<section style="margin-bottom:32px">
      <h2 class="t-h4" style="margin-bottom:12px">Decoration price — as the quote calculates it</h2>
      <p class="t-sm muted" style="margin-bottom:12px">Read straight from the rate card, the same way a
        customer quote reads it, so this table and the quote can never disagree.</p>
      <div class="grid grid-2">${Object.entries(S.decoRates.methods).map(([meth,m]) => {
        const mine = S.decoRates.rates.filter(r => r.method === meth);
        /* the sheet prices per piece, so a rate is `price`; a catalogue brought
           in through the CSV importer calls the same number `cost` */
        const per = (r) => r.price != null ? r.price : r.cost;
        const prov = (r) => r.provisional
          ? ' <span class="chip" style="color:var(--wait)">provisional</span>' : '';
        const head = `<div class="row-between" style="align-items:baseline">
            <div class="t-h5">${esc(S.personalization[meth] ? S.personalization[meth].name : meth)}</div>
            <span class="t-xs muted">setup ${m.setup==null
              ? '<span style="color:var(--wait)">none recorded</span>' : money(m.setup)}</span>
          </div>`;
        /* a method we have not priced yet says so, rather than drawing an
           empty table that looks like a rate of nothing */
        if((m.status && m.status !== 'priced') || !mine.length)
          return `<div class="card">${head}
            <p class="t-sm muted" style="margin-top:12px">No rate recorded yet — a placement using this
              method goes on the request to be priced when we review the artwork.</p></div>`;

        let body;
        if(m.pricedBy === 'size'){
          body = `<table class="tbl" style="min-width:0">
            <thead><tr><th>Band</th><th>Artwork</th><th class="tnum">Per piece</th></tr></thead>
            <tbody>${['small','medium','large'].map(b => {
              const r = mine.find(x => x.band === b); if(!r) return '';
              const range = b==='small' ? `up to ${m.bandSmall} mm`
                : b==='medium' ? `${m.bandSmall+1}–${m.bandMedium} mm` : `over ${m.bandMedium} mm`;
              return `<tr><td>${b}${prov(r)}</td><td class="t-xs muted">${range}</td>
                <td class="tnum num">${money(per(r))}</td></tr>`; }).join('')}</tbody></table>`;
        } else {
          /* priced by quantity, with a column per ink colour the card carries */
          const inks = [...new Set(mine.map(r => r.ink).filter(v => v != null))].sort((a,b) => a-b);
          const qtys = [...new Set(mine.map(r => r.qtyMin).filter(v => v != null))].sort((a,b) => a-b);
          const cell = (q, ink) => mine.find(r => r.qtyMin === q && r.ink === ink);
          body = `<table class="tbl" style="min-width:0">
            <thead><tr><th>Qty</th>${inks.map(c =>
              `<th class="tnum">${c} col</th>`).join('')}</tr></thead>
            <tbody>${qtys.map(q => `<tr><td class="num">${q}+</td>${inks.map(c => {
              const r = cell(q, c);
              return `<td class="tnum num">${r ? money(per(r)) : '<span class="muted">—</span>'}</td>`;
            }).join('')}</tr>`).join('')}</tbody></table>`;
        }
        return `<div class="card">${head}
          <div class="tw" style="margin-top:12px;border:0;box-shadow:none">${body}</div>
        </div>`; }).join('')}</div>
    </section>` : ''}

    ${S.merchQuotes.length ? (() => {
      /* Open work first and closed work after it, because the list is a queue:
         what is waiting on us has to be readable without reading past what is
         already settled. */
      const open = S.merchQuotes.filter(q => q.state !== 'won' && q.state !== 'lost');
      const shut = S.merchQuotes.filter(q => q.state === 'won' || q.state === 'lost');
      const card = (q) => `
        <div class="card">
          <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div>
              <div class="t-h5">${q.qty} × ${esc(q.productName)}</div>
              <div class="mono-ref">${esc(q.ref||'')} · ${esc(q.colourName)}${q.express?' · express':''}</div>
            </div>
            <div class="row" style="gap:8px">
              ${q.total ? `<span class="t-sm num med">${money(q.total)}</span>` : pillMerch('To price')}
              ${pill(q.state)}
            </div>
          </div>
          <div class="tw" style="margin-top:12px;border:0;box-shadow:none">
            <table class="tbl" style="min-width:0"><thead><tr>
              <th>Placement</th><th>Method</th><th>Size</th><th class="tnum">Colours</th><th>Artwork</th></tr></thead>
            <tbody>${(q.placements||[]).map(pl => `<tr>
              <td class="med">${esc(pl.posName)}</td><td>${esc(pl.methodName)}</td>
              <td>${esc(pl.size)}</td><td class="tnum num">${pl.method==='screen'?pl.colours:'—'}</td>
              <td>${pl.art ? '▣ '+esc(pl.art) : '<span class="faint">to follow</span>'}</td></tr>`).join('')
              || '<tr><td colspan="5" class="tbl-empty">No placement detail.</td></tr>'}
            </tbody></table>
          </div>
          ${q.quotedUnit ? `
          <div class="factline" style="margin-top:8px">
            <span>Quoted</span>
            <span class="num med">${money(q.quotedUnit)} per piece · ${money(q.quotedTotal)} total</span></div>` : ''}
          ${q.quoteNote ? `<p class="t-xs muted" style="margin-top:4px">“${esc(q.quoteNote)}”</p>` : ''}
          ${q.lostReason ? `<p class="t-xs muted" style="margin-top:4px">Closed: ${esc(q.lostReason)}</p>` : ''}
          <div class="row-between" style="margin-top:12px;flex-wrap:wrap;gap:8px">
            <span class="t-xs muted">${q.account?esc(account(q.account).name):'From the public website — no account yet'} · ${dateTime(q.at)}</span>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              ${q.state === 'submitted' ? `
                <button class="btn btn--primary btn--sm" data-act="mqPrice" data-id="${q.id}">Send the price</button>
                <button class="btn btn--ghost btn--sm" data-act="mqLost" data-id="${q.id}">Close</button>` : ''}
              ${q.state === 'quoted' ? `
                <button class="btn btn--primary btn--sm" data-act="mqWon" data-id="${q.id}">Mark confirmed</button>
                <button class="btn btn--ghost btn--sm" data-act="mqPrice" data-id="${q.id}">Revise the price</button>
                <button class="btn btn--ghost btn--sm" data-act="mqLost" data-id="${q.id}">Close</button>` : ''}
              ${q.state === 'won' || q.state === 'lost' ? `
                <button class="btn btn--quiet btn--sm" data-act="mqReopen" data-id="${q.id}">Reopen</button>` : ''}
            </div>
          </div>
        </div>`;
      return `
    <section style="margin-bottom:32px">
      <div class="row-between" style="margin-bottom:12px;align-items:baseline">
        <h2 class="t-h4">Quote requests</h2>
        <span class="t-xs muted">${open.length} open · ${shut.length} closed</span>
      </div>
      ${open.length ? `<div class="stack-3">${open.map(card).join('')}</div>`
        : `<p class="t-sm muted">Nothing open. Every request has been answered.</p>`}
      ${shut.length ? `
      <h3 class="t-h5" style="margin:24px 0 12px">Confirmed and closed</h3>
      <div class="stack-3">${shut.map(card).join('')}</div>` : ''}
    </section>`; })() : ''}

    <h2 class="t-h4" style="margin-bottom:12px">Catalogue</h2>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Ref</th><th>Product</th><th>Category</th><th class="tnum">Colours</th>
        <th class="tnum">MOQ</th><th class="tnum">From</th><th>Personalisation</th><th>Lead</th><th>Status</th></tr></thead>
      <tbody>${S.merchProducts.map(p => `<tr class="tbl-go" data-go="studio:product:${p.id}">
        <td class="num">${p.ref}</td>
        <td><span class="med">${p.glyph} ${esc(p.name)}</span>${p.handle?`<br><span class="mono-ref">/${esc(p.handle)}</span>`:''}</td>
        <td>${esc(p.cat)}</td>
        <td class="tnum num">${p.colours.length}${p.images&&p.images.length?` <span class="t-xs faint">· ${p.images.length} img</span>`:''}</td>
        <td class="tnum num">${p.moq}</td><td class="tnum num">${(() => {
          const b = catFrom(p); return b ? money(b.price) : '—'; })()}</td>
        <td class="t-xs">${p.pers.map(x => S.personalization[x] ? S.personalization[x].name : x).join(', ')}</td>
        <td class="t-xs">${esc(p.lead)}</td><td>${pill(p.status || 'published')}</td></tr>`).join('')}</tbody></table></div>
    ${!can(u,'merch_publish','do') ? '<p class="t-xs muted" style="margin-top:12px">Publishing to the public catalogue is a Master action.</p>' : ''}
  `);
}

/* ---- one product, every field ---------------------------------------------
   The catalogue table says what a product is; this says what it is made of,
   and lets it be changed. Everything the public site reads comes from here —
   the ladder it prices from, the colours it offers, the methods it allows and
   the photographs it resolves. Edited as a form and saved in one go rather
   than field by field: a price ladder half-changed is worse than one not
   changed at all. */
function stProduct(id){
  const u = user(SESSION.user);
  const p = by(S.merchProducts, id);
  if(!p) return stShell('merch', 'Product', `<div class="empty"><div class="empty-t">No such product</div>
    <div class="empty-d">It may have been removed from the catalogue.</div>
    <button class="btn btn--primary" data-go="studio:merch">Back to merchandise</button></div>`);
  const may = can(u, 'merch_publish', 'do');
  const fld = (lbl, id2, val, type) => `
    <label class="field"><span class="field-l">${lbl}</span>
      <input class="inp" id="${id2}" type="${type||'text'}" value="${esc(val == null ? '' : val)}"></label>`;
  const area = (lbl, id2, val, rows) => `
    <label class="field"><span class="field-l">${lbl}</span>
      <textarea class="inp" id="${id2}" rows="${rows||3}">${esc(val || '')}</textarea></label>`;
  const chips = (list, on, act2) => list.map(x => `
    <button class="chip ${on.includes(x.k) ? 'chip--on' : ''}" data-act="${act2}" data-id="${p.id}"
      data-v="${esc(x.k)}">${esc(x.n)}</button>`).join('');

  const methods = Object.keys(S.personalization || {}).map(k => ({k, n:S.personalization[k].name || k}));
  const places  = Object.keys(S.positions_lib || {}).map(k => ({k, n:S.positions_lib[k]}));
  const allCols = Object.keys(COLOURS);

  return stShell('merch', esc(p.name), `
    <nav class="crumb">${crumb([['Merchandising','studio:merch']], p.name)}</nav>
    <div class="page-hd"><div class="row-between" style="flex-wrap:wrap;gap:12px">
      <div><h1 class="t-h2">${p.glyph || ''} ${esc(p.name)}</h1>
        <p class="page-sub">${esc(p.ref)} · ${(p.matrix||[]).length} garment${(p.matrix||[]).length===1?'':'s'} ·
          ${(p.colours||[]).length} colours · ${esc(p.cat || '—')}</p></div>
      <div class="row" style="gap:8px">${pill(p.status || 'published')}
        <button class="btn btn--primary" data-act="mpSave" data-id="${p.id}" ${may?'':'disabled'}>Save changes</button></div>
    </div></div>
    ${may ? '' : '<div class="banner"><div><div class="banner-t">Read only</div><div class="banner-d">Changing the catalogue is a Master action.</div></div></div>'}

    <div class="cols">
      <div class="stack-4">
        <section class="card">
          <h2 class="t-h4">Identity</h2>
          ${fld('Name', 'mpName', p.name)}
          ${fld('Reference', 'mpRef', p.ref)}
          ${fld('URL handle', 'mpHandle', p.handle)}
          ${fld('Category', 'mpCat', p.cat)}
          ${fld('Glyph', 'mpGlyph', p.glyph)}
          <label class="field"><span class="field-l">Status</span>
            <select class="inp" id="mpStatus">${['draft','published','hidden','archived'].map(x =>
              `<option value="${x}"${(p.status||'published')===x?' selected':''}>${x}</option>`).join('')}</select></label>
        </section>

        <section class="card">
          <h2 class="t-h4">Commercial</h2>
          <div class="grid grid-2 gap-md">
            ${fld('Minimum order', 'mpMoq', p.moq, 'number')}
            ${fld('Cloth weight (g/m²)', 'mpWeight', p.weight)}
            ${fld('Lead time', 'mpLead', p.lead)}
            ${fld('Country of origin', 'mpCountry', p.country)}
          </div>
          <label class="field field--row" style="margin-top:12px">
            <input type="checkbox" id="mpQuote"${p.quoteOnly?' checked':''}>
            <span>Priced by hand — no ladder shown on the website</span></label>
        </section>

        <section class="card">
          <h2 class="t-h4">Price ladder</h2>
          <p class="t-xs muted">Per piece, excluding VAT and personalisation. A bracket that does not lower the
            price is dropped when the site loads — there is nothing to choose between.</p>
          <div class="stack-2" id="mpBreaks" style="margin-top:12px">
            ${(p.breaks||[]).map((b, i) => `
              <div class="row" style="gap:8px;align-items:center">
                <input class="inp" id="mpQty${i}" type="number" value="${b.qty}" style="width:7rem"
                  aria-label="Bracket ${i + 1}: quantity">
                <span class="t-xs muted">pieces at</span>
                <input class="inp" id="mpPrice${i}" type="number" step="0.01" value="${b.price}" style="width:8rem"
                  aria-label="Bracket ${i + 1}: price per piece">
                <button class="btn btn--quiet btn--sm" data-act="mpDropBreak" data-id="${p.id}" data-i="${i}">Remove</button>
              </div>`).join('') || '<p class="t-sm muted">No ladder — this one is quoted by hand.</p>'}
          </div>
          <button class="btn btn--ghost btn--sm" data-act="mpAddBreak" data-id="${p.id}" style="margin-top:12px">Add a bracket</button>
        </section>

        <section class="card">
          <h2 class="t-h4">Copy</h2>
          ${area('Description', 'mpDesc', p.desc, 4)}
          ${area('Materials', 'mpMaterials', p.materials, 2)}
          ${area('Care', 'mpCare', p.care, 2)}
          ${area('Provenance', 'mpProv', p.prov, 2)}
        </section>
      </div>

      <div class="stack-4">
        <section class="card">
          <h2 class="t-h4">Colours <span class="t-xs muted">${(p.colours||[]).length}</span></h2>
          <p class="t-xs muted">What the website offers. A colour is only reachable if a garment below carries it.</p>
          <div class="sw-grid" style="margin-top:12px">
            ${allCols.map(c => `<button class="pdp-sw ${(p.colours||[]).includes(c)?'on':''}"
              data-act="mpColour" data-id="${p.id}" data-v="${c}" title="${esc(COLOURS[c].name)}"
              style="background:${COLOURS[c].hex}"></button>`).join('')}
          </div>
        </section>

        <section class="card">
          <h2 class="t-h4">Sizes</h2>
          ${area('One per line', 'mpSizes', (p.sizes||[]).join('\n'), 6)}
        </section>

        <section class="card">
          <h2 class="t-h4">Personalisation</h2>
          <p class="t-xs muted">Methods allowed on this product. Prices come from the rate card, which is shared
            by every product — it is on the Merchandising page.</p>
          <div class="chip-row" style="margin-top:12px">${chips(methods, p.pers || [], 'mpMethod')}</div>
          <h3 class="t-h5" style="margin-top:20px">Placements</h3>
          <div class="chip-row" style="margin-top:8px">${chips(places, p.pos || [], 'mpPos')}</div>
        </section>

        <section class="card">
          <h2 class="t-h4">Images</h2>
          <p class="t-xs muted">Every photograph has an address on the studio's host, built from the garment, the
            colour and the angle. That address is what a live site requests. This prototype cannot request it —
            an artifact may not load images from another host — so it carries copies and shows those instead.
            The addresses below are real and are what deploys.</p>
          <label class="field" style="margin-top:12px"><span class="field-l">Where images come from</span>
            <select class="inp" id="mpImgSrc">
              <option value="embedded"${imageMode()==='embedded'?' selected':''}>Embedded copies — visible here</option>
              <option value="cdn"${imageMode()==='cdn'?' selected':''}>CDN addresses — correct for the live site</option>
            </select></label>
          <p class="t-xs faint">Switching to CDN makes every image on the prototype blank, because the host is
            blocked here. It is the right setting for the real build and the wrong one for showing the mockup.</p>
        </section>
      </div>
    </div>

    <section style="margin-top:32px">
      <div class="row-between" style="align-items:baseline;flex-wrap:wrap;gap:12px">
        <h2 class="t-h4">Variants <span class="t-xs muted">${(p.matrix||[]).length}</span></h2>
        <span class="t-xs muted">Each is a real garment: its own cut, cloth, ladder, colours and photographs.</span>
      </div>
      <div class="stack-3" style="margin-top:12px">
        ${(p.matrix||[]).map((m, mi) => {
          const openV = UI.vOpen === m.sku;
          return `
          <article class="card">
            <button class="row-between" data-act="mpVariant" data-sku="${esc(m.sku)}"
              style="width:100%;text-align:left;cursor:pointer;background:none;border:0;padding:0;gap:12px;flex-wrap:wrap">
              <span><span class="t-sm med">${esc(m.sku)}</span>
                <span class="t-xs muted"> · ${esc(CUT_FOR[m.g] || m.g || '')} · ${esc(m.f || '')} · ${esc(m.w || '?')} g/m²</span></span>
              <span class="t-xs faint">${(m.colours||[]).length} colours ·
                ${(m.breaks||[]).length ? money((m.breaks[0]||{}).price) : 'by hand'} ·
                ${(m.colours||[]).filter(c => garmentPhoto(m.sku, c, 'studio-01', true)).length} photographed
                · ${openV ? 'close' : 'open'}</span>
            </button>
            ${openV ? `
            <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px">
              <div class="grid grid-4 gap-md">
                ${fld('Code', 'vSku'+mi, m.sku)}
                ${fld('Cut', 'vG'+mi, m.g)}
                ${fld('Fit', 'vF'+mi, m.f)}
                ${fld('Cloth weight', 'vW'+mi, m.w)}
              </div>
              ${area('Sizes, one per line', 'vSizes'+mi, (m.sizes||[]).join('\n'), 3)}

              <h3 class="t-h5" style="margin-top:16px">Price ladder</h3>
              <div class="stack-2">
                ${(m.breaks||[]).map((b, bi) => `
                  <div class="row" style="gap:8px;align-items:center">
                    <input class="inp" id="vQty${mi}_${bi}" type="number" value="${b.qty}" style="width:6.5rem"
                      aria-label="${esc(m.sku)} bracket ${bi + 1}: quantity">
                    <span class="t-xs muted">at</span>
                    <input class="inp" id="vPrice${mi}_${bi}" type="number" step="0.01" value="${b.price}" style="width:7.5rem"
                      aria-label="${esc(m.sku)} bracket ${bi + 1}: price per piece">
                    <button class="btn btn--quiet btn--sm" data-act="mpDropVBreak" data-id="${p.id}"
                      data-sku="${esc(m.sku)}" data-i="${bi}">Remove</button>
                  </div>`).join('') || '<p class="t-sm muted">Quoted by hand.</p>'}
              </div>
              <button class="btn btn--ghost btn--sm" data-act="mpAddVBreak" data-id="${p.id}"
                data-sku="${esc(m.sku)}" style="margin-top:8px">Add a bracket</button>

              <h3 class="t-h5" style="margin-top:20px">Colours and their photographs</h3>
              <p class="t-xs muted">Leave an address empty to use the one the naming convention produces.
                Type one to override it.</p>
              <div class="stack-2" style="margin-top:8px">
                ${(m.colours||[]).map((c, ci) => {
                  const nm2 = (COLOURS[c]||{}).name || c;
                  const auto = garmentPhotoURL(m.sku, nm2, 'studio-01');
                  const own = ((m.images||{})[c] || {});
                  const cur = typeof own === 'string' ? own : (own['studio-01'] || '');
                  const shot = garmentPhoto(m.sku, c, 'studio-01', true);
                  return `
                  <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
                    <span class="pdp-sw" style="background:${COLOURS[c]?COLOURS[c].hex:'#ccc'};width:22px;height:22px;flex:none"></span>
                    <span class="t-xs" style="width:9rem;flex:none">${esc(nm2)}</span>
                    <input class="inp" id="vImg${mi}_${ci}" value="${esc(cur)}"
                      aria-label="Image address for ${esc(m.sku)} in ${esc(nm2)}"
                      placeholder="${esc(auto)}" style="flex:1;min-width:16rem;font-size:var(--fs-xs)">
                    <span class="t-xs ${shot?'muted':'faint'}" style="width:5rem;flex:none">${shot?'on file':'missing'}</span>
                    <button class="btn btn--quiet btn--sm" data-act="mpDropColour" data-id="${p.id}"
                      data-sku="${esc(m.sku)}" data-v="${c}">Remove</button>
                  </div>`;}).join('') || '<p class="t-sm muted">No colours on this variant.</p>'}
              </div>

              <div class="row" style="gap:8px;margin-top:20px;flex-wrap:wrap">
                <button class="btn btn--primary btn--sm" data-act="mpVariantSave" data-id="${p.id}" data-sku="${esc(m.sku)}" data-i="${mi}">Save this variant</button>
                <button class="btn btn--danger btn--sm" data-act="mpDropVariant" data-id="${p.id}" data-sku="${esc(m.sku)}">Remove the variant</button>
              </div>
            </div>` : ''}
          </article>`;}).join('') || '<p class="t-sm muted">No variants.</p>'}
      </div>
      <button class="btn btn--ghost btn--sm" data-act="mpAddVariant" data-id="${p.id}" style="margin-top:12px">Add a variant</button>
    </section>
  `);
}

/* ---- Finance ------------------------------------------------------------- */
function stFinance(){
  const u = user(SESSION.user);
  const f = financeTotals();
  const showCost = can(u,'cost_margin','view');
  return stShell('finance', 'Finance', `
    <div class="page-hd"><h1 class="t-h2">Finance</h1>
      <p class="page-sub">Issued, collected and outstanding across every customer.</p></div>
    <div class="grid grid-4" style="margin-bottom:32px">
      ${[[money(f.issued),'Revenue issued',`${f.count} documents`],
         [money(f.collected),'Revenue collected','Settled in full'],
         [money(f.outstanding),'Outstanding receivables','Issued minus payments'],
         [money(f.overdue),'Overdue','Past the due date']]
        .map(([v,l,n],i) => `<div class="tile"><div class="tile-v num" ${i===3&&f.overdue?'style="color:var(--stop)"':''}>${v}</div>
          <div class="tile-l">${l}</div><div class="tile-n">${n}</div></div>`).join('')}
    </div>

    <div class="grid grid-2" style="align-items:start;gap:32px">
      <section><h2 class="t-h4" style="margin-bottom:12px">By customer</h2>
        <div class="tw"><table class="tbl" style="min-width:0">
          <thead><tr><th>Customer</th><th class="tnum">Issued</th><th class="tnum">Collected</th><th class="tnum">Outstanding</th></tr></thead>
          <tbody>${S.accounts.map(a => {
            const ds = S.documents.filter(d => d.account === a.id && d.amount);
            const iss = ds.filter(d => d.state !== 'draft').reduce((t,d)=>t+d.amount,0);
            const col = ds.filter(d => d.state === 'paid').reduce((t,d)=>t+d.amount,0);
            return `<tr><td class="med">${esc(a.name)}</td>
              <td class="tnum num">${money(iss)}</td><td class="tnum num">${money(col)}</td>
              <td class="tnum num" ${iss-col?'style="color:var(--wait)"':''}>${money(iss-col)}</td></tr>`;}).join('')}
          </tbody></table></div>
      </section>

      <section><h2 class="t-h4" style="margin-bottom:12px">${showCost ? 'Cost and margin' : 'Cost and margin — restricted'}</h2>
        ${showCost ? `<div class="tw"><table class="tbl" style="min-width:0">
          <thead><tr><th>Project</th><th class="tnum">Est. cost</th><th class="tnum">Value</th><th class="tnum">Margin</th></tr></thead>
          <tbody>${S.projects.map(p => { const pieces = projectPieces(p);
            const cost = pieces*22.4, val = pieces*57.9;
            return `<tr><td>${esc(p.ref)}</td><td class="tnum num">${money(cost)}</td>
              <td class="tnum num">${money(val)}</td>
              <td class="tnum num" style="color:var(--go)">${val?((val-cost)/val*100).toFixed(1):'—'}%</td></tr>`;}).join('')}
          </tbody></table></div>`
        : `<div class="card card--quiet"><p class="t-sm muted">Cost, margin, supplier commitments and variance are visible to Master and Finance Director only. Account Managers can be granted selected commercial permissions without receiving full company financial access.</p></div>`}
      </section>
    </div>
  `);
}

/* ---- Documents & Billing -------------------------------------------------- */
function stBilling(){
  const u = user(SESSION.user);
  const filt = UI.billFilter || 'All';
  const list = filt === 'All' ? S.documents : S.documents.filter(d => d.state === filt.toLowerCase().replace(' ','_'));
  return stShell('billing', 'Documents & Billing', `
    <div class="page-hd"><h1 class="t-h2">Documents &amp; Billing</h1>
      <p class="page-sub">Every customer-facing commercial and legal document. Issued financial and signed legal records are corrected by a new version, a credit note or a cancellation — never overwritten.</p></div>
    <div class="tabs" style="margin-bottom:20px">
      ${['All','Draft','Payment due','Paid','Overdue','Signed'].map(t =>
        `<button class="tab ${filt===t?'tab--on':''}" data-act="billFilter" data-t="${t}">${t}</button>`).join('')}
    </div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Number</th><th>Document</th><th>Customer</th><th>Project</th><th>Type</th>
        <th>Issued</th><th>Due</th><th class="tnum">Amount</th><th>Status</th><th>Visible</th><th></th></tr></thead>
      <tbody>${list.map(d => `<tr>
        <td class="num">${d.num}</td><td>${esc(d.title)}</td>
        <td>${esc(account(d.account).name)}</td>
        <td>${d.project?esc(project(d.project).ref):'—'}</td><td>${esc(d.type)}</td>
        <td>${dateShort(d.issued)}</td><td>${dateShort(d.due)}</td>
        <td class="tnum num">${money(d.amount)}</td><td>${pill(d.state)}</td>
        <td>${d.visible?'Yes':'<span class="faint">Internal</span>'}</td>
        <td><span class="btn-row" style="flex-wrap:nowrap">
          <button class="btn btn--ghost btn--sm" data-act="openDoc" data-id="${d.id}">Preview</button>
          <button class="btn btn--ghost btn--sm" data-act="dlDoc" data-id="${d.id}">Download</button>
          ${!d.visible && can(u,'invoice','publish') ? `<button class="btn btn--ghost btn--sm" data-act="pubDoc" data-id="${d.id}">Publish</button>`:''}
        </span></td>
      </tr>`).join('')}</tbody></table></div>
  `);
}

/* ---- Communications ------------------------------------------------------- */
/* What actually left the building. The prototype cannot post email, so it
   keeps every message it would have sent and renders it as the reader gets it
   — subject, words, and the buttons that carry the answer back. Reviewing the
   copy is then reading it, not imagining it. */
/* Messages the platform has written and not yet sent. The words can be changed
   here — what is released is what was read, not what was generated. */
function reviewView(){
  const q = S.drafts || [];
  const open = UI.draftOpen || (q[0] && q[0].id);
  const d0 = q.find(m => m.id === open);
  return `
    <div class="cols">
      <div>
        ${d0 ? `
        <article class="card mail">
          <div class="mail-hd">
            <div><div class="t-h5">${esc(d0.subject)}</div>
              <div class="mono-ref">to ${esc(d0.to)}${d0.toName?' · '+esc(d0.toName):''} · written ${dateTime(d0.at)}</div></div>
            ${pill('ready_approval')}
          </div>
          <div class="mail-bd">
            <label class="field"><span class="field-l">Subject</span>
              <input class="inp" id="dsubj" value="${esc(d0.subject)}"></label>
            <label class="field"><span class="field-l">Message</span>
              <textarea class="inp" id="dbody" rows="7">${esc((d0.lines||[]).join('\n\n'))}</textarea></label>
            ${d0.choices ? `<p class="t-xs muted">Carries ${d0.choices.options.length} buttons:
              ${d0.choices.options.map(o => esc(o.label)).join(' · ')}</p>` : ''}
            ${d0.cta ? `<p class="t-xs muted">Carries one button: ${esc(d0.cta.label)}</p>` : ''}
            <div class="row" style="gap:8px;margin-top:16px;flex-wrap:wrap">
              <button class="btn btn--primary btn--sm" data-act="draftSend" data-id="${d0.id}">Send it</button>
              <button class="btn btn--ghost btn--sm" data-act="draftSave" data-id="${d0.id}">Save changes</button>
              <button class="btn btn--danger btn--sm" data-act="draftDrop" data-id="${d0.id}">Do not send</button>
            </div>
          </div>
        </article>`
        : `<div class="empty"><div class="empty-t">Nothing waiting</div>
           <div class="empty-d">Anything the platform writes that asks a customer for something waits here until
           you have read it. Updates that only tell them something go straight to the daily summary.</div></div>`}
      </div>
      <div>
        <h3 class="t-h5" style="margin-bottom:12px">To review ${q.length ? `<span class="badge-n">${q.length}</span>` : ''}</h3>
        <div class="stack-2">
          ${q.length ? q.map(m => `<button class="card" data-act="openDraft" data-id="${m.id}"
            style="text-align:left;cursor:pointer;${m.id===open?'border-color:var(--navy)':''}">
            <div class="t-sm med">${esc(m.subject)}</div>
            <div class="t-xs muted" style="margin-top:4px">${esc(m.to)}</div>
            <div class="t-xs faint" style="margin-top:4px">${dateTime(m.at)}</div>
          </button>`).join('') : '<p class="t-sm muted">Empty.</p>'}
        </div>
      </div>
    </div>`;
}

/* The two ways in, and neither is a password. Kept in its own function because
   the modal repaints when a code is issued and the body has to be rebuilt. */
function signInBody(who){
  const acc = account(who.account);
  const addr = who.email || accEmail(acc);
  const o = UI.otp && UI.otp.user === who.id ? UI.otp : null;
  return `<div class="stack">
    <button class="btn btn--ghost btn--block" data-act="googleSignIn" data-u="${who.id}">
      <span style="font-weight:500">G</span>&nbsp;&nbsp;Continue with Google</button>
    <div class="row" style="align-items:center;gap:12px;margin:4px 0">
      <span style="flex:1;height:1px;background:var(--line)"></span>
      <span class="t-xs faint">or</span>
      <span style="flex:1;height:1px;background:var(--line)"></span>
    </div>
    ${o ? `
      <p class="t-sm">We sent a six-digit code to <span class="med">${esc(addr)}</span>.</p>
      <div class="banner"><div><div class="banner-t">Prototype — the code is shown, not emailed</div>
        <div class="banner-d">It would only ever arrive by email. Here it is: <span class="num med">${o.code}</span></div></div></div>
      <label class="field"><span class="field-l">Six-digit code</span>
        <input class="inp" id="otpCode" inputmode="numeric" maxlength="6" placeholder="······"></label>
      <div class="row" style="gap:8px">
        <button class="btn btn--primary" data-act="otpVerify">Sign in</button>
        <button class="btn btn--quiet btn--sm" data-act="otpSend" data-u="${who.id}">Send another</button>
      </div>`
    : `
      <p class="t-sm muted">We will send a one-time code to <span class="med">${esc(addr)}</span>. It is valid once
        and expires shortly — there is nothing to remember and nothing to steal.</p>
      <button class="btn btn--primary btn--block" data-act="otpSend" data-u="${who.id}">Email me a code</button>`}
    <p class="t-xs faint">PAMUUC never asks for a password. If a message ever does, it is not from us.</p>
  </div>`;
}

function outboxView(){
  const sent = S.outbox || [], held = S.digest || [];
  const open = UI.mailOpen || (sent[0] && sent[0].id);
  const letter = (m) => `
    <article class="card mail">
      <div class="mail-hd">
        <div><div class="t-h5">${esc(m.subject)}</div>
          <div class="mono-ref">to ${esc(m.to)}${m.toName?' · '+esc(m.toName):''} · ${dateTime(m.at)}</div></div>
        ${m.kind === 'decision' ? pill('waiting_customer') : pill('published')}
      </div>
      <div class="mail-bd">
        ${(m.lines || []).map(l => `<p>${esc(l)}</p>`).join('')}
        ${m.choices ? `<div class="mail-cta">${m.choices.options.map(o =>
          `<button class="mail-btn" data-act="${esc(m.choices.act)}" data-id="${esc(m.choices.id)}"
            data-v="${esc(o.v)}">${esc(o.label)}</button>`).join('')}</div>
          <p class="t-xs faint">The buttons work. Press one to see what happens when they do — before they
            have an account, this message is the only place they can answer from.</p>` : ''}
        ${m.cta ? `<div class="mail-cta"><button class="mail-btn mail-btn--go"
          data-act="${esc(m.cta.act)}"${m.cta.id?` data-id="${esc(m.cta.id)}"`:''}>${esc(m.cta.label)}</button></div>` : ''}
        <p class="mail-foot">PAMUUC Studio · Barcelona — you are receiving this because you contacted us
          about ${esc(m.toName || 'your request')}.</p>
      </div>
    </article>`;
  return `
    <div class="cols">
      <div>
        ${sent.length ? sent.filter(m => m.id === open).map(letter).join('')
          : `<div class="empty"><div class="empty-t">Nothing sent yet</div>
             <div class="empty-d">Messages appear here the moment an action sends one — offering call times,
             sending a price, publishing something for approval.</div></div>`}
        ${held.length ? `
        <section style="margin-top:24px">
          <h3 class="t-h5" style="margin-bottom:8px">Waiting for tomorrow's summary</h3>
          <div class="row-between" style="margin-bottom:12px;gap:12px;flex-wrap:wrap">
            <p class="t-xs muted" style="margin:0;max-width:52ch">${held.length} update${held.length===1?'':'s'} that did not
              need answering. They go out as one message per account, so a decision is never buried among them.
              In the real build this is a scheduled job; here it is a button.</p>
            <button class="btn btn--ghost btn--sm" data-act="sendDigest">Send today's summary</button>
          </div>
          <div class="stack-2">${held.slice(0,8).map(m => `
            <div class="factline"><span>${esc(m.subject)}</span>
              <span class="t-xs muted">${esc(m.to)} · ${dateTime(m.at)}</span></div>`).join('')}</div>
        </section>` : ''}
      </div>
      <div>
        <h3 class="t-h5" style="margin-bottom:12px">Sent</h3>
        <div class="stack-2">
          ${sent.length ? sent.map(m => `<button class="card" data-act="openMail" data-id="${m.id}"
            style="text-align:left;cursor:pointer;${m.id===open?'border-color:var(--navy)':''}">
            <div class="row-between"><span class="t-sm med">${esc(m.subject)}</span>
              ${m.kind==='decision'?'<span class="dot"></span>':''}</div>
            <div class="t-xs muted" style="margin-top:4px">${esc(m.to)}</div>
            <div class="t-xs faint" style="margin-top:4px">${dateTime(m.at)}</div>
          </button>`).join('') : '<p class="t-sm muted">No messages yet.</p>'}
        </div>
      </div>
    </div>`;
}

function stComms(){
  const openId = UI.openCv || S.conversations[0]?.id;
  const cv = by(S.conversations, openId);
  const filt = UI.cvFilter || 'All';
  const list = filt === 'All' ? S.conversations
    : filt === 'Needs reply' ? S.conversations.filter(c => c.state === 'needs_reply')
    : S.conversations.filter(c => c.state === 'waiting_customer');
  return stShell('comms', 'Communications', `
    <div class="page-hd"><h1 class="t-h2">Communications</h1>
      <p class="page-sub">Every customer thread, with internal notes in the same place and visibly separate. One history — the platform and email do not diverge.</p></div>
    <div class="tabs" style="margin-bottom:20px">
      ${['All','Needs reply','To review','Waiting on customer','Sent'].map(t =>
        `<button class="tab ${filt===t?'tab--on':''}" data-act="cvFilter" data-t="${t}">${t}</button>`).join('')}
    </div>
    ${filt === 'To review' ? reviewView() : filt === 'Sent' ? outboxView() : `
    <div class="cols">
      <div class="card">
        ${cv ? `
          <div class="row-between" style="margin-bottom:16px;flex-wrap:wrap;gap:8px">
            <div><div class="t-h5">${esc(account(cv.account).name)}</div>
              <div class="mono-ref">${esc(project(cv.project)?.ref || '')} · owner ${esc(user(cv.owner).name)}</div></div>
            ${pill(cv.state === 'needs_reply' ? 'waiting_pamuuc' : 'waiting_customer')}
          </div>
          ${cv.messages.map(m => `
            <div class="msg ${m.internal?'msg--internal':''}">
              <span class="av ${user(m.by).side==='studio'?'av--studio':''}">${user(m.by).init}</span>
              <div class="msg-b">
                <div class="msg-h"><span class="msg-a">${esc(user(m.by).name)}</span>
                  <span class="msg-r">${m.internal?'Internal note':user(m.by).side==='studio'?'PAMUUC':esc(account(cv.account).name)} · ${dateTime(m.at)}</span></div>
                <div class="msg-t">${esc(m.text)}</div></div>
            </div>`).join('')}
          <div style="margin-top:16px">
            <textarea class="inp" id="msgbox" placeholder="Reply…"></textarea>
            <div class="btn-row" style="margin-top:8px;justify-content:flex-end">
              <button class="btn btn--ghost btn--sm" data-act="send" data-cv="${cv.id}" data-internal="1">Internal note</button>
              <button class="btn btn--primary btn--sm" data-act="send" data-cv="${cv.id}">Send to customer</button>
            </div>
          </div>` : '<div class="empty"><div class="empty-t">No conversation selected</div></div>'}
      </div>
      <div class="stack-2">
        ${list.map(c => `<button class="card" data-act="openCv" data-id="${c.id}"
          style="text-align:left;cursor:pointer;${c.id===openId?'border-color:var(--navy)':''}">
          <div class="row-between"><span class="t-sm med">${esc(account(c.account).name)}</span>
            ${c.state==='needs_reply'?'<span class="dot"></span>':''}</div>
          <div class="t-xs muted" style="margin-top:4px">${esc(project(c.project)?.name || '')}</div>
          <div class="t-xs faint" style="margin-top:4px">${c.messages.length} messages · ${ago(c.messages[c.messages.length-1]?.at)}</div>
        </button>`).join('')}
      </div>
    </div>`}
  `);
}

/* ---- Team & Access -------------------------------------------------------- */
function stTeam(){
  const modules = ['Inquiries','Customers','Projects','Phase changes','Bases','Merchandise publication',
    'Quotes','Invoices','Cost and margin','Communications','Team and roles','Settings','Audit log'];
  const matrix = {
    'Inquiries':['Full','Assigned only','View'],
    'Customers':['Full','Assigned','View + finance fields'],
    'Projects':['Full','Assigned','Read + finance fields'],
    'Phase changes':['Full + override','Advance when gates pass','No'],
    'Bases':['Full','View and use','View cost fields'],
    'Merchandise publication':['Full','No','No'],
    'Quotes':['Full','Draft, send with permission','Full review'],
    'Invoices':['Full','View assigned','Full'],
    'Cost and margin':['Full','Hidden by default','Full'],
    'Communications':['Full','Assigned','Finance threads'],
    'Team and roles':['Full','No','No'],
    'Settings':['Full','No','Finance settings only'],
    'Audit log':['Full','Own and assigned','Finance and access'],
  };
  return stShell('team', 'Team & Access', `
    <div class="page-hd"><div class="row-between" style="flex-wrap:wrap;gap:12px">
      <div><h1 class="t-h2">Team &amp; Access</h1>
        <p class="page-sub">Reusable role templates, plus scope. A role says what you can do; scope says which records you can do it to.</p></div>
      <button class="btn btn--primary btn--sm" data-act="inviteStaff">Invite an internal user</button>
    </div></div>

    <section style="margin-bottom:32px">
      <h2 class="t-h4" style="margin-bottom:12px">People</h2>
      <div class="rows">${S.users.filter(u => u.side === 'studio').map(u => `
        <div class="rw rw--static"><span class="av av--studio">${u.init}</span>
          <span class="rw-main"><span class="rw-t">${esc(u.name)}</span>
            <span class="rw-s">${esc(u.title)} · ${ROLE_NAMES[u.role]} · last access today</span></span>
          <span class="rw-side">
            <span class="t-xs muted">${u.role === 'am' ? S.projects.filter(p=>p.am===u.id).length + ' projects' : 'All records'}</span>
            ${pill('active')}<button class="btn btn--quiet btn--sm">Manage</button></span></div>`).join('')}
      </div>
    </section>

    <section>
      <h2 class="t-h4" style="margin-bottom:12px">Default permission matrix</h2>
      <div class="tw"><table class="tbl">
        <thead><tr><th>Area</th><th>Master View</th><th>Account Manager</th><th>Finance Director</th></tr></thead>
        <tbody>${modules.map(m => `<tr><td class="med">${m}</td>
          ${matrix[m].map(x => `<td class="${x==='No'?'faint':''}">${esc(x)}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
      <p class="t-xs muted" style="margin-top:12px">This table is documentation of the same <code style="font-size:12px">can()</code> function the interface calls. Sign in as an Account Manager or Finance Director and the navigation, the buttons and the cost fields change accordingly.</p>
    </section>
  `);
}

/* ---- Settings ------------------------------------------------------------ */
function stSettings(){
  const sec = (title, rows) => `
    <section style="margin-bottom:32px">
      <h2 class="t-h4" style="margin-bottom:12px">${title}</h2>
      <div class="rows">${rows.map(([n,v,src]) => `<div class="rw rw--static">
        <span class="rw-main"><span class="rw-t">${n}</span><span class="rw-s">${v}</span></span>
        <span class="rw-side"><span class="chip ${src==='Override'?'chip--on':''}">${src}</span></span></div>`).join('')}</div>
    </section>`;
  return stShell('settings', 'Content & Settings', `
    <div class="page-hd"><h1 class="t-h2">Content &amp; Settings</h1>
      <p class="page-sub">Global defaults, and where a customer overrides one. The interface always shows which is which.</p></div>

    ${sec('Project stages', STAGES.map(s => [s.name, s.blurb, s.id==='design'?'Conditional':'Global default']))}

    ${sec('Status vocabulary', [
      ['Controlled dictionary', `${Object.keys(STATUS).length} states, each with a colour family and a plain-language customer sentence`, 'Global default'],
      ['Colour families', 'Neutral · Blue · Amber · Green · Red — colour is supporting information, never the only signal', 'Global default'],
      ['Merchandise red', 'Studio red identifies the merchandise line of business and nothing else. Danger uses a separate crimson.', 'Global default'],
    ])}

    ${sec('Libraries', [
      ['Fabrics', `${Object.keys(FABRICS).length} active fabrics`, 'Global default'],
      ['Colours', `${Object.keys(COLOURS).length} colours, 1 custom`, 'Global default'],
      ['Fabrics', `${Object.keys(FABRICS).length} in the library, ${(S.customFabrics||[]).length} added by hand`, 'Global default'],
      ['Personalisation methods', Object.values(S.personalization).map(x=>x.name).join(', '), 'Global default'],
      ['Positions', Object.values(S.positions_lib).join(', '), 'Global default'],
      ['Size systems', SIZES.join(' · ') + ' and One size', 'Global default'],
    ])}

    ${sec('Commercial', [
      ['Default payment terms', '30 days from invoice date', 'Global default'],
      ['Per-account overrides', S.accounts.length
        ? S.accounts.map(a2 => a2.name + ' — ' + a2.terms).join(' · ')
        : 'None — every account is on the default until you change it', 'Override'],
      ['Project pricing', 'Entered by hand, per garment and per line. No rate card.', 'Global default'],
      ['Payment steps', 'Written per project: what is paid, when, and which stage it holds shut', 'Global default'],
      ['Currencies', 'EUR', 'Global default'],
      ['Prototype round limit', 'Three rounds per garment, then a recorded Master resolution', 'Global default'],
    ])}

    ${sec('Public website', [
      ['Qualification form', 'Nine question pages plus a review step', 'Global default'],
      ['Form creates', 'Inquiry only — never an account, never a project', 'Global default'],
      ['Merchandise catalogue', `${S.merchProducts.length} products published`, 'Global default'],
    ])}
  `);
}

/* ---- Audit log ------------------------------------------------------------ */
function stAudit(){
  return stShell('audit', 'Audit Log', `
    <div class="page-hd"><h1 class="t-h2">Audit Log</h1>
      <p class="page-sub">Access changes, phase overrides, visibility changes, approvals, document publication, financial status changes, specification revisions and archival. Actions taken in this prototype are appended live.</p></div>
    <div class="tw"><table class="tbl">
      <thead><tr><th>When</th><th>Actor</th><th>Role</th><th>Record</th><th>Action</th>
        <th>Previous</th><th>New</th><th>Reason</th><th>Source</th></tr></thead>
      <tbody>${S.audit.map(a => `<tr>
        <td>${dateTime(a.at)}</td><td class="med">${esc(user(a.actor).name)}</td><td>${esc(a.role)}</td>
        <td class="num">${esc(a.record)}</td><td>${esc(a.action)}</td>
        <td class="muted">${esc(a.was ?? '—')}</td><td class="med">${esc(a.now ?? '—')}</td>
        <td class="t-xs muted">${esc(a.reason || '—')}</td><td class="t-xs">${esc(a.source)}</td></tr>`).join('')}
      </tbody></table></div>
  `);
}

function stNotifications(){
  const ns = S.notifications.filter(n => n.to === 'studio');
  return stShell('notifications', 'Notifications', `
    <div class="page-hd"><div class="row-between">
      <div><h1 class="t-h2">Notifications</h1>
        <p class="page-sub">One event model. Each event decides whether it becomes an activity entry, a notification, a task or an approval — never four parallel mechanisms.</p></div>
      <button class="btn btn--ghost btn--sm" data-act="markRead">Mark all read</button></div></div>
    ${ns.length ? `<div class="rows">${ns.map(n => `<button class="rw" ${n.project?`data-go="studio:project:${n.project}"`:'data-go="studio:inquiries"'}>
      ${n.action?'<span class="rw-flag rw-flag--wait"></span>':''}
      <span class="rw-main"><span class="rw-t">${esc(n.text)}</span>
        <span class="rw-s">${dateTime(n.at)}${n.account?' · '+esc(account(n.account).name):''}</span></span>
      <span class="rw-side">${n.action?pill('waiting_pamuuc'):pill('published')}${!n.read?'<span class="dot"></span>':''}</span>
    </button>`).join('')}</div>` : '<div class="empty"><div class="empty-t">Nothing here</div></div>'}
  `);
}
/* ============================================================================
   PAMUUC SUITE — router, modals, event wiring
   ========================================================================= */

let MODAL = null;

/* The hash is a convenience for deep links only. Inside an about:srcdoc frame
   (the artifact viewer) writing location.hash throws, and inside a sandboxed
   frame reading it can too — neither may ever stop the app from rendering. */
function go(surface, page, param, sub){
  /* a new list starts at the first page rather than inheriting the last one */
  if(page !== ROUTE.page || param !== ROUTE.params.id) UI.shown = null;
  /* `sub` carries the garment a product link was opened on */
  ROUTE = {surface, page, params:{id:param, sku:sub}};
  try{ location.hash = '#/' + surface + '/' + page
    + (param ? '/' + param : '') + (param && sub ? '/' + sub : ''); }catch(e){}
  try{ window.scrollTo(0,0); }catch(e){}
  render();
}

function readHash(){
  let raw = '';
  try{ raw = location.hash || ''; }catch(e){}
  const parts = raw.replace(/^#\/?/,'').split('/').filter(Boolean);
  if(!parts.length) return {surface:'public', page:'home', params:{}};
  return {surface:parts[0] || 'public', page:parts[1] || 'home', params:{id:parts[2], sku:parts[3]}};
}


/* ---- quote basket ---------------------------------------------------------
   Adding a line saves a requested configuration. It does not contact anyone.
   The request becomes a lead only when contact details are captured and the
   submission is accepted — a button click is not a conversion. */
/* ---- the size split ------------------------------------------------------
   Optional. A buyer who already knows they need ten smalls and twenty mediums
   should not have to add them up, and the split is what the studio needs to
   cut the order anyway. When it is used it IS the quantity — one number,
   derived — so the ladder, the ticket and the quote cannot disagree with it. */
const splitTotal = (c) => Object.values((c && c.split) || {})
  .reduce((t, n) => t + (+n || 0), 0);
const splitPairs = (c) => Object.entries((c && c.split) || {})
  .filter(([, n]) => +n > 0);

function addToQuote(id){
  const p = by(S.merchProducts, id); if(!p) return;
  const c = UI.cfg;
  const rq = S.decoRates && !p.quoteOnly ? quoteLines(p, S.decoRates, c) : null;
  const line = {
    product:p.id, productName:p.name, ref:p.ref, img:prodImg(p),
    qty:c.qty, colour:c.colour, colourName:(COLOURS[c.colour] || {}).name || c.colour,
    placements:(c.placements || []).map(pl => ({
      pos:pl.pos, posName:S.positions_lib[pl.pos] || pl.pos,
      method:pl.method, methodName:(S.personalization[pl.method] || {}).name || pl.method,
      size:pl.size, colours:pl.colours, art:pl.art})),
    art:(c.placements || []).some(pl => pl.art),
    artHelp:!!c.artHelp,
    /* the size run, when they gave us one — this is what gets cut */
    sizes:splitPairs(c).map(([sz, n]) => ({size:sz, qty:+n})),
    unit:rq ? rq.unit : null, total:rq ? rq.total : null,
    quoteOnly:!!p.quoteOnly, cfg:JSON.parse(JSON.stringify(c)),
  };
  UI.quote = UI.quote || [];
  const editing = UI.editLine != null && UI.quote[UI.editLine] != null;
  if(editing){ UI.quote[UI.editLine] = line; UI.editLine = null; }
  else UI.quote.push(line);
  /* Open the basket. A message that something was added, while the basket it
     was added to stays shut, asks the reader to take it on trust; showing the
     line where it now lives, under a running total, is the confirmation. Only
     on the public site — the drawer is not mounted on the other two surfaces,
     and a flag set here would spring it open on the next merchandise page. */
  if(ROUTE.surface === 'public') UI.drawer = true;
  render();
  toast(editing ? 'Line updated' : 'Added to your quote',
    lineSummary(line) + ' — nothing is ordered or charged.');
}

function collectContact(){
  const q = UI.qc = UI.qc || {}, err = {};
  ['name','email','company','postcode','phone','date'].forEach(n => {
    const el = document.querySelector('[name="' + n + '"]');
    if(el) q[n] = el.value;
  });
  const sel = document.querySelector('[name="country"]'); if(sel) q.country = sel.value;
  const notes = document.querySelector('[name="notes"]'); if(notes) q.notes = notes.value;
  if(!q.name)    err.name = 'Enter a name so we know who to reply to.';
  if(!q.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q.email))
    err.email = 'Enter an email address so we can send the quote.';
  if(!q.company) err.company = 'Enter the company or organisation this is for.';
  UI.qcErr = err;
  if(Object.keys(err).length){ render(); const s = $('qerrsum'); if(s) s.scrollIntoView({block:'center'}); return false; }
  return true;
}

function submitQuoteRequest(){
  const q = UI.qc || {}, lines = UI.quote || [];
  if(!lines.length || !q.email) return;
  let ref = '';
  lines.forEach(l => {
    const rec = act.submitMerchQuote({
      account: SESSION && user(SESSION.user).account || null,
      product:l.product, productName:l.productName, ref:l.ref, qty:l.qty,
      colour:l.colour, colourName:l.colourName, placements:l.placements, sizes:l.sizes,
      express:false, unit:l.unit, total:l.total, quoteOnly:l.quoteOnly,
      method:(l.placements[0] || {}).method, methodName:(l.placements[0] || {}).methodName || '',
      pos:(l.placements[0] || {}).pos, posName:(l.placements[0] || {}).posName || '',
      art:l.art ? 'attached' : (l.artHelp ? 'help requested' : 'to follow'),
      contact:{name:q.name, email:q.email, company:q.company,
               country:q.country || 'Spain', postcode:q.postcode || '',
               phone:q.phone || '', date:q.noDate ? 'Not fixed' : (q.date || 'Not provided'),
               notes:(q.notes || '') + (UI.quotePres
                 ? (q.notes ? '\n\n' : '') + 'Branded presentation requested (' + money(PRESENTATION) + ').'
                 : '')},
    });
    if(!ref) ref = rec.id;
  });
  UI.qDone = {ref:String(ref).toUpperCase(), email:q.email, company:q.company || '', lines:lines.length,
    units:quoteUnits(), country:q.country || 'Spain',
    date:q.noDate ? 'Date not fixed' : (q.date || 'Not provided')};
  UI.quote = []; UI.qc = {}; UI.qcErr = {}; UI.quotePres = false;
  go('public','qdone');
}

/* One assisted enquiry path. It records a real enquiry, marked as awaiting
   qualification — it never counts as a completed nine topic brief. */
function assistedEnquiry(kind, fields){
  const v = {}; let missing = 0;
  fields.forEach(n => {
    const el = document.querySelector('[name="' + n + '"]');
    v[n] = el ? el.value.trim() : '';
    if(el && el.required && !v[n]) missing++;
  });
  if(missing){
    modalStub('A few details are still needed',
      'Name, email and company are needed before we can reply. Nothing you have typed has been lost.');
    return;
  }
  const label = {advice:'Initial advice request', help:'Help choosing merchandise', contact:'Contact message'}[kind];
  emit('public.enquiry', {
    text: label + ' from ' + (v[fields[2]] || 'an unnamed company'),
    notify:'studio', kind:'action', actionRequired:true,
    notifyText: label + ' — awaiting qualification',
    audit:label, record:v[fields[1]] || '—', was:'—', now:'awaiting qualification'});
  save();
  openModal({title:'Request sent',
    sub:label + ' · awaiting qualification',
    body:`<div class="stack">
      <div class="banner banner--go"><div>
        <div class="banner-t">We have your message and we will reply by email</div>
        <div class="banner-d">This is an enquiry, not an order and not an account. It joins the qualification
          queue with the questions we still need to ask marked against it.</div></div></div>
      <p class="t-sm muted">If a uniform project is what you need, the nine topic brief asks the questions we
        would ask on a first call, and it is faster than a conversation that has to cover them anyway.</p></div>`,
    actions:`<button class="btn btn--quiet" data-act="closeModal">Close</button>
      <button class="btn btn--primary" data-go="public:form">Start your project brief</button>`});
}


/* Repricing a line from the drawer runs the same calculation the product page
   runs, so the drawer and the product page can never disagree. */
function setLineQty(i, qty){
  const l = (UI.quote || [])[i]; if(!l || !qty) return;
  const p = by(S.merchProducts, l.product);
  l.qty = qty; if(l.cfg) l.cfg.qty = qty;
  const rq = p && S.decoRates && !p.quoteOnly ? quoteLines(p, S.decoRates, l.cfg || {qty}) : null;
  l.unit = rq ? rq.unit : null;
  l.total = rq ? rq.total : null;
  render();
}


/* ---- the brief ----------------------------------------------------------
   Answers live in UI.answers under the key each question declares, so the
   review, the submission and the studio back office all read one shape. */
function quizAnswered(q){
  const a = UI.answers || {};
  return q.mode === 'many' ? (a[q.key] || []).length > 0 : !!a[q.key];
}

function pickAnswer(v){
  const step = UI.formStep || 0;
  const qs = quizQs();
  const q = qs[step - 1]; if(!q) return;
  const a = UI.answers = UI.answers || {};

  if(q.mode === 'many'){
    const cur = a[q.key] = a[q.key] || [];
    const i = cur.indexOf(v);
    if(i > -1) cur.splice(i, 1);
    else {
      /* a capped question rolls: choosing a third drops the first */
      if(q.max && cur.length >= q.max) cur.shift();
      cur.push(v);
    }
    render();
    return;
  }

  const wasType = q.key === 'Establishment';
  const before = a[q.key];
  a[q.key] = v;
  /* changing the establishment changes which two questions come next, so the
     old branch answers cannot be carried across */
  if(wasType && before && before !== v){
    const old = BRANCHES[BRANCH_OF[before]] || [];
    old.forEach(x => { delete a[x.key]; });
  }
  render();
  /* a single choice advances on its own, the way this kind of form behaves */
  setTimeout(() => {
    const now = UI.formStep || 0;
    const list = quizQs();
    if(ROUTE.page === 'form' && now >= 1 && now <= list.length && list[now - 1].key === q.key){
      UI.formStep = now + 1; render();
    }
  }, 260);
}

function readCompanyFields(){
  const a = UI.answers = UI.answers || {};
  ['Company','Email','VAT','Phone','Contact name','Role'].forEach(n => {
    const el = document.querySelector('[name="' + n + '"]');
    if(el) a[n] = el.value.trim();
  });
  const c = document.querySelector('[name="Country"]');
  if(c) a['Country'] = c.value;
}

function collectAboutYou(){
  const a = UI.answers = UI.answers || {}, err = {};
  readCompanyFields();
  if(!a['Contact name']) err['Contact name'] = 'Enter a name so we know who to reply to.';
  if(!a['Role'])         err['Role'] = 'Enter your role.';
  if(!a['Authority'])    err['Authority'] = 'Tell us whether this is your decision to make.';
  UI.formErr = err;
  if(Object.keys(err).length){ render(); const s = $('ferr'); if(s) s.scrollIntoView({block:'center'}); return false; }
  return true;
}

function collectAboutCompany(){
  const a = UI.answers = UI.answers || {}, err = {};
  readCompanyFields();
  if(!a['Company']) err['Company'] = 'Enter the company or organisation we would invoice.';
  if(!a['Email'] || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a['Email']))
    err['Email'] = 'Enter a company email address so we can send the proposal.';
  /* a wrong VAT number is worse than none: it blocks, a missing one does not */
  const v = vatState(a);
  if(v.state === 'format-invalid') err['VAT'] = v.text;
  a['VAT status'] = v.state;
  a['VAT checked'] = v.state === 'pending' ? v.value : '';
  UI.formErr = err;
  if(Object.keys(err).length){ render(); const s = $('ferr'); if(s) s.scrollIntoView({block:'center'}); return false; }
  return true;
}

/* Letter keys choose, Enter continues — the brief is operable without a mouse. */
function briefKey(e){
  if(ROUTE.surface !== 'public' || ROUTE.page !== 'form') return;
  if(/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) return;
  const step = UI.formStep || 0;
  const qs = quizQs();
  if(e.key === 'Enter'){
    if(step === 0){ e.preventDefault(); UI.formStep = 1; render(); return; }
    if(step >= 1 && step <= qs.length && quizAnswered(qs[step - 1])){
      e.preventDefault(); UI.formStep = step + 1; render();
    }
    return;
  }
  if(step < 1 || step > qs.length) return;
  const i = KEYLETTER.indexOf((e.key || '').toUpperCase());
  if(i < 0) return;
  const opts = [...document.querySelectorAll('.tf-o')];
  if(opts[i]){ e.preventDefault(); opts[i].click(); }
}

/* ---- render -------------------------------------------------------------- */
/* A photograph that is not on the CDN yet must not leave a broken frame. The
   error event does not bubble, so this listens on the capture phase and swaps
   in the placeholder — which means a colour lights up the moment its file is
   uploaded, with nothing here to change. */
document.addEventListener('error', (e) => {
  const el = e.target;
  if(!el || el.tagName !== 'IMG' || el.dataset.phDone) return;
  if((el.src || '').indexOf('cdn.shopify.com') < 0) return;
  /* One source file was a PNG behind a .jpg name, and Shopify stored it by its
     real type. Try that once before giving up on the shot. */
  if(!el.dataset.altTried && el.src.indexOf('.jpg') > -1){
    el.dataset.altTried = '1';
    el.src = el.src.replace('.jpg', '.png');
    return;
  }
  el.dataset.phDone = '1';
  const thumb = el.closest('.pdp-thumb');
  if(thumb){
    const rail = thumb.closest('.pdp-rail');
    thumb.remove();                    /* a colour with no shot leaves no gap */
    /* and a rail that loses every thumbnail leaves no empty strip either */
    if(rail && !rail.querySelector('.pdp-thumb')) rail.remove();
  } else el.src = PLACEHOLDER;
}, true);

function render(){
  const r = ROUTE;
  let html = '';

  if(r.surface === 'public'){
    switch(r.page){
      case 'custom':   html = pubCustom(); break;
      case 'merch':       html = pubMerch(); break;
      case 'build':       html = pubBuild(r.params.id); break;
      case 'collections': html = pubCollections(); break;
      case 'collection':  html = pubCollection(r.params.id); break;
      case 'products':    html = pubProducts(); break;
      case 'search':      html = pubSearch(); break;
      case 'method':      html = pubMethod(); break;
      case 'howto':       html = pubHowTo(); break;
      case 'merchhelp':   html = pubMerchHelp(); break;
      case 'product':     html = pubProduct(r.params.id); break;
      case 'quote':       html = pubQuote(); break;
      case 'qcontact':    html = pubQContact(); break;
      case 'qreview':     html = pubQReview(); break;
      case 'qdone':       html = pubQDone(); break;
      case 'about':       html = pubAbout(); break;
      case 'contact':     html = pubContact(); break;
      case 'privacy':     html = pubPrivacy(); break;
      case 'cookies':     html = pubCookies(); break;
      case 'terms':       html = pubTerms(); break;
      case 'accessibility': html = pubAccessibility(); break;
      case 'blog':        html = pubBlog(); break;
      case 'post':        html = pubPost(r.params.id); break;
      case 'form':     html = pubForm(); break;
      case 'review':   html = pubReview(); break;
      case 'done':     html = pubDone(); break;
      case 'login':    html = pubLogin(); break;
      default:         html = (r.page && r.page !== 'home') ? pubNotFound(r.page) : pubHome();
    }
  } else if(r.surface === 'account'){
    if(!SESSION || user(SESSION.user).side !== 'customer'){ ROUTE = {surface:'public',page:'login',params:{}}; return render(); }
    switch(r.page){
      case 'projects':      html = accProjects(); break;
      case 'project':       html = accProject(r.params.id); break;
      case 'reorders':      html = accReorders(); break;
      case 'merchandise':   html = accMerch(); break;
      case 'documents':     html = accDocuments(); break;
      case 'messages':      html = accMessages(); break;
      case 'notifications': html = accNotifications(); break;
      case 'settings':      html = accSettings(); break;
      default:              html = accOverview();
    }
  } else {
    if(!SESSION || user(SESSION.user).side !== 'studio'){ ROUTE = {surface:'public',page:'login',params:{}}; return render(); }
    switch(r.page){
      case 'inquiries':     html = stInquiries(); break;
      case 'inquiry':       html = stInquiry(r.params.id); break;
      case 'customers':     html = stCustomers(); break;
      case 'customer':      html = stCustomer(r.params.id); break;
      case 'projects':      html = stProjects(); break;
      case 'project':       html = stProject(r.params.id); break;
      case 'bases':         html = stBases(); break;
      case 'merch':         html = stMerch(); break;
      case 'product':       html = stProduct(r.params.id); break;
      case 'finance':       html = stFinance(); break;
      case 'billing':       html = stBilling(); break;
      case 'comms':         html = stComms(); break;
      case 'team':          html = stTeam(); break;
      case 'settings':      html = stSettings(); break;
      case 'audit':         html = stAudit(); break;
      case 'notifications': html = stNotifications(); break;
      default:              html = stOverview();
    }
  }

  /* A render replaces every node, so anything being typed into loses its
     caret. Remember the focused field by id — an id survives the swap where
     the node cannot — and hand it back once the new page is in place. */
  const had = document.activeElement;
  const keep = had && had.id && /^(INPUT|TEXTAREA|SELECT)$/.test(had.tagName)
    ? {id: had.id,
       start: (() => { try { return had.selectionStart; } catch(err){ return null; } })(),
       end:   (() => { try { return had.selectionEnd;   } catch(err){ return null; } })()}
    : null;

  $('root').innerHTML = html + surfaceSwitch();
  try{ applySeo(ROUTE); }catch(err){}
  /* the fixed action bar needs the body to reserve room for it */
  document.body.classList.toggle('has-bar', html.indexOf('class="buybar') > -1);
  /* the public site has no bottom mobile nav, so the surface switcher can stay
     at the bottom there instead of covering the top of a hero */
  document.body.classList.toggle('is-public', r.surface === 'public');
  paintModal();
  paintToasts();
  afterRender();

  /* only if nothing else claimed focus in the meantime — a modal opening has
     a better claim on it than the field someone was last in */
  const holder = document.activeElement;
  if(keep && (!holder || holder === document.body || holder === document.documentElement)){
    const back = $(keep.id);
    if(back){
      back.focus();
      /* number inputs have no selection to restore; reassigning the value
         puts the caret at the end, which is where typing left it */
      if(keep.start != null){ try{ back.setSelectionRange(keep.start, keep.end); }catch(err){} }
      else if(back.value != null){ const v = back.value; back.value = ''; back.value = v; }
    }
  }
}

/* ---- in-page navigation -------------------------------------------------
   The Studio is one page, so its nav travels down it. A jump from anywhere
   else routes to the page first and lands on the section once it exists. */
function scrollToSection(id){
  const el = document.getElementById(id);
  if(!el) return;
  /* land on where the section starts reading — its panel or its heading —
     rather than on the whitespace above it */
  const target = el.querySelector('.shd, .panel') || el;
  const quiet = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches;
  const y = target.getBoundingClientRect().top + window.scrollY - 72;
  window.scrollTo({top: Math.max(y, 0), behavior: quiet ? 'auto' : 'smooth'});
}

function jumpTo(id){
  if(ROUTE.surface === 'public' && ROUTE.page === 'custom'){ scrollToSection(id); return; }
  UI.jumpTo = id;
  go('public', 'custom');
}

/* Behaviour that needs elements in the document. render() replaces the whole
   tree, so anything observed has to be re-attached each time. */
let MORE_OBS = null;
const quietMotion = () => typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion:reduce)').matches;

/* One card plus the gap: the rail moves by whole cards, so a card never
   comes to rest half cut off. */
function carouStep(track){
  const card = track.querySelector('.cc');
  if(!card) return Math.round(track.clientWidth * 0.8);
  const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
  return Math.round(card.getBoundingClientRect().width + gap);
}

/* A smooth scrollBy starts from wherever the animation has reached, so two
   quick presses of the same button travel barely more than one. The target is
   held on the element instead and each press adds a card to it — but only
   while the press is recent. A held target that outlived its animation is a
   position the reader has since scrolled away from by hand, and following it
   would jump them somewhere they did not ask to be. */
const CAROU_HOLD = 700;
function carouMove(track, dir){
  const max = Math.max(0, track.scrollWidth - track.clientWidth);
  const held = Number(track.dataset.carouTo);
  const since = carouNow() - (Number(track.dataset.carouAt) || 0);
  const from = Number.isFinite(held) && since < CAROU_HOLD ? held : track.scrollLeft;
  const to = Math.max(0, Math.min(max, from + carouStep(track) * dir));
  track.dataset.carouTo = String(to);
  track.dataset.carouAt = String(carouNow());
  /* The easing lives in CSS on the track, where prefers-reduced-motion can
     switch it off. Some engines — embedded webviews among them — drop a
     smooth scroll on a nested container without reporting it, which would
     leave the rail looking dead, so the position is checked once the
     animation should have finished and set outright if it never moved. */
  track.scrollLeft = to;
  clearTimeout(track.__carouFix);
  track.__carouFix = setTimeout(() => {
    if(Math.abs(track.scrollLeft - to) < 4) return;
    const eased = track.style.scrollBehavior;
    track.style.scrollBehavior = 'auto';
    track.scrollLeft = to;
    track.style.scrollBehavior = eased;
    syncCarou(track);
  }, 420);
}
const carouNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/* The buttons and the rail read the scroll position rather than counting
   clicks, so a drag, a trackpad swipe and a keypress all leave them right. */
function syncCarou(track){
  const wrap = track.closest('.carou');
  if(!wrap) return;
  const max = track.scrollWidth - track.clientWidth;
  const at = Math.round(track.scrollLeft);
  const prev = wrap.querySelector('[data-d="-1"]'), next = wrap.querySelector('[data-d="1"]');
  if(prev) prev.disabled = at <= 1;
  if(next) next.disabled = at >= max - 1;
  const bar = wrap.querySelector('[data-carou-bar]');
  if(bar){
    const seen = max > 0 ? track.clientWidth / track.scrollWidth : 1;
    const pos = max > 0 ? at / max : 0;
    bar.style.width = Math.max(12, Math.round(seen * 100)) + '%';
    bar.style.marginLeft = Math.round(pos * (100 - Math.max(12, seen * 100))) + '%';
  }
  wrap.classList.toggle('carou--still', max <= 1);
}

/* scroll does not bubble, so this listens in the capture phase rather than
   binding to the track on every render. */
document.addEventListener('scroll', (e) => {
  const t = e.target;
  if(t && t.dataset && t.dataset.carouTrack !== undefined) syncCarou(t);
}, true);

function afterRender(){
  document.querySelectorAll('[data-carou-track]').forEach(syncCarou);
  if(UI.jumpTo){ const id = UI.jumpTo; UI.jumpTo = null; requestAnimationFrame(() => scrollToSection(id)); }
  if(MORE_OBS){ MORE_OBS.disconnect(); MORE_OBS = null; }
  const more = $('more');
  if(!more || typeof IntersectionObserver === 'undefined') return;
  /* the button is the real control; this just saves the reader reaching for it */
  MORE_OBS = new IntersectionObserver((entries) => {
    if(!entries.some(e => e.isIntersecting)) return;
    const btn = more.querySelector('[data-act="more"]');
    if(btn) btn.click();
  }, {rootMargin:'600px 0px'});
  MORE_OBS.observe(more);
}

/* the prototype's own affordance — not part of the product */
function surfaceSwitch(){
  const s = ROUTE.surface;
  const cust = SESSION && user(SESSION.user).side === 'customer';
  const stud = SESSION && user(SESSION.user).side === 'studio';
  const narrow = typeof window !== 'undefined' && window.innerWidth < 820;
  return `<div class="switch">
    <button class="${s==='public'?'on':''}" data-go="public:home">Website</button>
    <button class="${s==='account'?'on':''}" data-act="jumpAccount">${narrow?'Account':'Customer Account'}</button>
    <button class="${s==='studio'?'on':''}" data-act="jumpStudio">${narrow?'Studio':'Studio Back Office'}</button>
    <button data-act="reset" title="Reset every record">↺</button>
  </div>`;
}

function paintToasts(){
  let el = $('toasts');
  if(!el){ el = document.createElement('div'); el.id = 'toasts'; el.className = 'toasts'; document.body.appendChild(el); }
  el.innerHTML = TOASTS.map(t => `<div class="toast"><div class="toast-t">${esc(t.title)}</div>
    ${t.detail?`<div class="toast-d">${esc(t.detail)}</div>`:''}</div>`).join('');
}

function paintModal(){
  let el = $('modal');
  if(!el){ el = document.createElement('div'); el.id = 'modal'; document.body.appendChild(el); }
  el.innerHTML = MODAL ? `<div class="scrim" data-act="closeModalBg">
    <div class="modal ${MODAL.wide?'modal--wide':''}" role="dialog" aria-modal="true">
      <div class="modal-h">
        <div><h2 class="t-h4">${esc(MODAL.title)}</h2>
          ${MODAL.sub?`<p class="t-xs muted" style="margin-top:4px">${MODAL.sub}</p>`:''}</div>
        <button class="iconbtn" data-act="closeModal">✕</button>
      </div>
      <div class="modal-b">${MODAL.body}</div>
      ${MODAL.foot?`<div class="modal-f">${MODAL.foot}</div>`:''}
    </div></div>` : '';
}
function openModal(m){ MODAL = m; paintModal(); }
function closeModal(){ MODAL = null; paintModal(); }

/* ---- modal builders ------------------------------------------------------ */
function modalApproval(id){
  const a = by(S.approvals, id); if(!a) return;
  const g = a.target ? garment(a.target) : null;
  const d = a.target ? doc(a.target) : null;
  const p = a.project ? project(a.project) : null;
  openModal({
    title:a.kind, sub:`${esc(a.rev)}${a.due ? ' · due ' + dateShort(a.due) : ''}`,
    body:`
      <div class="stack">
        <div class="banner"><div><div class="banner-t">What you are being asked</div>
          <div class="banner-d">${esc(a.summary)}</div></div></div>

        ${g ? `<div class="card card--quiet">
          <div class="eyebrow">The garment this is about</div>
          <div class="row" style="gap:12px;margin-top:10px;align-items:flex-start">
            ${(g.images||[]).length
              ? `<img src="${g.images[0].src}" alt="${esc(g.images[0].cap||g.name)}" class="pp-thumb">`
              : `<span class="gcard-th" style="width:52px;height:64px">${g.glyph}</span>`}
            <div style="flex:1;min-width:0">
              <div class="t-sm med">${esc(g.name)}</div>
              <div class="mono-ref">${base(g.base).ref} ${g.baseV} · revision ${g.rev}${g.round ? ' · round ' + g.round : ''}</div>
              <div class="wrap-row" style="margin-top:8px;gap:6px">
                <span class="chip">${esc(FABRICS[g.fabric] ? FABRICS[g.fabric].name : g.fabric)}</span>
                <span class="chip">${esc(S.personalization[g.pers.method].name)} · ${esc(S.positions_lib[g.pers.pos])}</span>
                ${g.unitPrice != null ? `<span class="chip chip--on">${money(g.unitPrice)} per piece</span>` : ''}
              </div>
              ${g.summary ? `<p class="t-sm muted" style="margin-top:10px">${esc(g.summary)}</p>` : ''}
            </div>
          </div></div>` : ''}

        ${d ? `<div class="paper">
          <h4>PAMUUC | STUDIO</h4>
          <p style="margin-top:4px">Pamuk Studio S.L · Barcelona · ${esc(d.num)}</p>
          <table><thead><tr><th>Description</th><th class="n">Amount</th></tr></thead>
          <tbody><tr><td>${esc(d.title)}</td><td class="n">${money(d.amount)}</td></tr>
          <tr><td>VAT 21%</td><td class="n">${money(d.amount*0.21)}</td></tr>
          <tr><td><strong>Total</strong></td><td class="n"><strong>${money(d.amount*1.21)}</strong></td></tr></tbody></table>
          <p style="margin-top:8px">Issued ${dateShort(d.issued)}${d.due ? ' · due ' + dateShort(d.due) : ''}</p>
        </div>` : ''}

        ${!g && !d && p ? `<div class="card card--quiet">
          <div class="eyebrow">What this covers</div>
          <div class="stack-2" style="margin-top:10px">
            <div class="factline"><span>Project</span><span class="med">${esc(p.name)}</span></div>
            <div class="factline"><span>Stage</span><span>${stageDef(p.stage).name}</span></div>
            <div class="factline"><span>Garments</span><span>${S.garments.filter(x=>x.project===p.id).length}</span></div>
            ${projectValue(p).total ? `<div class="factline"><span>Value as proposed</span>
              <span class="num med">${money(projectValue(p).total)}</span></div>` : ''}
          </div></div>` : ''}

        <label class="field"><span class="field-l">Your comment
            <span class="faint">(required if you ask for changes or decline)</span></span>
          <textarea class="inp" id="apcomment" placeholder="Tell us what you want different, or why this is a no…"></textarea></label>
        <p class="t-xs muted">Your decision is recorded against this exact revision. A later revision needs a new
          decision — an old one can never carry forward.</p>
      </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--danger" data-act="apDecide" data-id="${a.id}" data-d="decline">Decline</button>
      <button class="btn btn--ghost" data-act="apDecide" data-id="${a.id}" data-d="changes">Ask for changes</button>
      <button class="btn btn--primary" data-act="apDecide" data-id="${a.id}" data-d="approve">Accept</button>`,
  });
}

/* The studio's own details, in one place, so the letterhead, the payment
   instructions and the invoice all say the same thing. */
const STUDIO = {
  name:'Pamuk Studio S.L', trading:'PAMUUC | STUDIO',
  addr:'Carrer example 00, 08003 Barcelona, Spain',
  vat:'ESB00000000', iban:'ES00 0000 0000 0000 0000 0000', bic:'XXXXESMMXXX',
};

/* What a document says, as blocks. The same description drives the preview on
   screen and the PDF that downloads, so the two can never drift apart. */
function docBlocks(d){
  const acc = account(d.account) || {};
  const prj = d.project ? project(d.project) : null;
  const money0 = (n) => money(n, acc.currency);
  const isMoney = !!d.amount;
  const vat = isMoney ? d.amount * 0.21 : 0;
  /* A pro forma states a number without asking for it, and a contract is not
     billed at all. Using an invoice's words on either one is how a document
     ends up promising something it does not mean. */
  const isPro = d.type === 'Pro forma';
  const isAgreement = d.type === 'Contract' || d.type === 'Terms';

  const B = [
    {text:STUDIO.trading, size:17, bold:true},
    {text:`${STUDIO.name} · ${STUDIO.addr} · VAT ${STUDIO.vat}`, size:8.5, gap:2},
    {rule:true, gap:20},
    /* the eyebrow needs clearance for the title's ascenders, not its own lead */
    {text:String(d.type || 'Document').toUpperCase(), size:9, bold:true, gap:9},
    {text:d.title, size:20, bold:true, gap:4},
    {text:d.num, size:10, gap:18},
  ];

  B.push({text:isAgreement ? 'AGREED WITH' : 'BILLED TO', size:8, bold:true, gap:4});
  B.push({text:acc.name || '—', size:11, bold:true});
  if(acc.city || acc.country) B.push({text:[acc.city, acc.country].filter(Boolean).join(', '), size:10});
  if(acc.vat) B.push({text:'VAT ' + acc.vat, size:10});
  B.push({space:10});

  B.push({text:'Issued', right:dateShort(d.issued), size:10});
  if(d.due)  B.push({text:isAgreement ? 'Sign by' : isPro ? 'Valid until' : 'Payable by',
                     right:dateShort(d.due), size:10});
  if(prj)    B.push({text:'Project', right:`${prj.ref} — ${prj.name}`, size:10});
  if(acc.terms && isMoney) B.push({text:'Terms', right:acc.terms, size:10});
  B.push({text:'Status', right:st(d.state).label, size:10, gap:16});

  if(isMoney){
    B.push({rule:true, gap:10});
    B.push({text:'DESCRIPTION', right:'AMOUNT', size:8, bold:true, boldRight:true, gap:6});
    (d.items && d.items.length ? d.items : [{label:d.title, amount:d.amount}]).forEach(it => {
      B.push({text:it.label, right:money0(it.amount), size:10.5});
      if(it.note) B.push({text:it.note, size:9, gap:2});
    });
    B.push({space:6});
    B.push({text:'Subtotal', right:money0(d.amount), size:10.5});
    B.push({text:'VAT 21%', right:money0(vat), size:10.5, gap:4});
    B.push({rule:true, gap:8});
    B.push({text:d.state === 'paid' ? 'Total paid' : isPro ? 'Indicative total' : 'Total due',
            right:money0(d.amount + vat), size:13, bold:true, boldRight:true, gap:20});
  }

  /* the body of a contract or a terms sheet is its clauses */
  (d.body || []).forEach(para => {
    if(para.h) B.push({text:para.h, size:11, bold:true, gap:3});
    if(para.t) B.push({text:para.t, size:10.5, lead:15, gap:12});
  });

  /* A pro forma carries no payment instructions: nothing is owed on it yet,
     and printing an IBAN under an indicative number invites a transfer we
     would then have to send back. */
  if(isPro){
    B.push({text:'NOT A REQUEST FOR PAYMENT', size:8, bold:true, gap:5});
    B.push({text:'Nothing is owed on this document. The invoice follows once the specification is locked.',
            size:10.5, gap:18});
  } else if(isMoney && d.state !== 'paid'){
    B.push({text:'HOW TO PAY', size:8, bold:true, gap:5});
    B.push({text:`Bank transfer to ${STUDIO.name}.`, size:10.5});
    B.push({text:`IBAN ${STUDIO.iban}   BIC ${STUDIO.bic}`, size:10.5});
    B.push({text:`Quote ${d.num} as the reference so we can match it.`, size:10.5, gap:6});
    B.push({text:'A payment is recorded here once it reaches our account, not when it is sent.',
            size:9, gap:18});
  } else if(isMoney){
    B.push({text:'PAID', size:8, bold:true, gap:5});
    B.push({text:`Received${d.paidAt ? ' ' + dateShort(String(d.paidAt).slice(0,10)) : ''}. Nothing further is due on this document.`,
            size:10.5, gap:18});
  }

  if(d.type === 'Contract' || d.state === 'signature_required' || d.state === 'signed'){
    B.push({rule:true, gap:14});
    B.push({text:'SIGNED FOR ' + (acc.name || 'the customer').toUpperCase(), size:8, bold:true, gap:22});
    B.push({text:'Name, position, date', size:9, gap:18});
  }

  B.push({rule:true, gap:10});
  B.push({text:`Version ${d.v || 1}. Corrections are issued as a new version or a credit note; ` +
               `this record is never overwritten. ${STUDIO.name}, VAT ${STUDIO.vat}.`, size:8, lead:11});
  return B;
}

/* An uploaded file always wins — if someone attached the signed contract, that
   is the contract. Otherwise the record is rendered into one. */
function docFile(d){
  if(d.file && d.file.src) return {name:d.file.name, src:d.file.src};
  const safe = `${d.num} ${d.title}`.replace(/[\/\\:*?"<>|]/g, '-').slice(0, 80);
  return {name:`PAMUUC ${safe}.pdf`, src:pdfBuild(docBlocks(d)).dataUri};
}

/* The preview. Rendered from the very blocks the PDF is built from, so what is
   read on screen and what lands in the download are the same document. */
function docPaper(d){
  const html = docBlocks(d).map(b => {
    if(b.rule)  return '<hr class="pp-rule">';
    if(b.space) return `<div style="height:${Math.round(b.space * 0.7)}px"></div>`;
    const w = b.bold ? '600' : '400';
    const sz = (b.size || 10.5) * 1.22;
    if(b.right != null) return `<div class="pp-row">
      <span style="font-size:${sz}px;font-weight:${w}">${esc(b.text)}</span>
      <span style="font-size:${sz}px;font-weight:${b.boldRight ? '600' : '400'}" class="num">${esc(b.right)}</span></div>`;
    /* a heading needs air above it, which on the page comes from the gap on
       the block before it — in flow, it has to be asked for */
    const top = b.bold && (b.size || 0) >= 11 ? 14 : 0;
    return `<p style="font-size:${sz}px;font-weight:${w};margin:${top}px 0 ${Math.round((b.gap || 0) * 0.7)}px">${esc(b.text)}</p>`;
  }).join('');
  return `<div class="paper pp-doc">${html}</div>`;
}

function modalDoc(id){
  const d = doc(id); if(!d) return;
  /* When someone has attached the real thing — a counter-signed contract, a
     scanned invoice — that file is the document, so that is what is shown.
     Only a record with no file of its own is rendered from its fields. */
  if(d.file && d.file.src){
    return modalFile(d.file.name, d.file.src,
      `${esc(d.num)} · ${esc(d.type)}${d.file.size ? ' · ' + fileSize(d.file.size) : ''}`,
      `<button class="btn btn--primary" data-act="dlDoc" data-id="${esc(d.id)}">Download</button>`);
  }
  const u = user(SESSION.user);
  const mine = u.side === 'customer' && can(u,'payments','act');
  const canSettle = can(u,'payments','settle');
  const due = d.state === 'payment_due' || d.state === 'overdue';
  openModal({
    title:d.title, sub:`${d.num} · ${esc(d.type)} · ${pill(d.state)}`,
    body:`<div class="stack">
      ${docPaper(d)}
      ${due ? `
        <div class="banner banner--${d.state==='overdue'?'stop':'wait'}"><div>
          <div class="banner-t">${d.state==='overdue'?'This payment is late':'Payment due '+dateShort(d.due)}</div>
          <div class="banner-d">${/Development/i.test(d.title)
            ? 'Paying this authorises technical files and the first prototype round.'
            : 'Paying this releases the next stage of work.'}</div></div></div>` : ''}
      ${due && mine ? `
        <div class="card">
          <h4 class="t-h5">How to pay</h4>
          <p class="t-sm muted" style="margin-top:4px">Bank transfer. Quote ${esc(d.num)} as the reference so we can match it.</p>
          <div class="factline"><span>Account name</span><span class="med">Pamuk Studio S.L</span></div>
          <div class="factline"><span>IBAN</span><span class="med">ES00 0000 0000 0000 0000 0000</span></div>
          <div class="factline"><span>Reference</span><span class="med">${esc(d.num)}</span></div>
          <label class="fld" style="margin-top:12px"><span class="fld-l">Your transfer reference (optional)</span>
            <input class="inp" id="payref" placeholder="So we can find it on the statement"></label>
        </div>` : ''}
      ${d.state === 'payment_sent' ? `
        <div class="banner banner--flow"><div>
          <div class="banner-t">Transfer sent${d.declaredAt?' — '+dateTime(d.declaredAt):''}</div>
          <div class="banner-d">${mine
            ? 'Nothing further is needed from you. We will confirm here once it reaches our account.'
            : 'The customer says this has been transferred. Confirm it against the bank before recording it.'}</div>
          </div></div>` : ''}
    </div>`,
    /* Two different acts: the customer says they have sent it, and PAMUUC says
       it arrived. Neither button is ever shown to the other side. */
    /* Download sits on every document for every reader — a customer and the
       studio are looking at the same record and both need the file of it. The
       action beside it is the one thing that differs by side. */
    foot: `<button class="btn btn--ghost" data-act="closeModal">Close</button>
       <button class="btn btn--ghost" data-act="dlDoc" data-id="${d.id}">Download PDF</button>` + (
       due && mine
         ? `<button class="btn btn--primary" data-act="declarePay" data-id="${d.id}">I have sent the transfer</button>`
       : (due || d.state === 'payment_sent') && canSettle
         ? `<button class="btn btn--primary" data-act="payDoc" data-id="${d.id}">Record payment received</button>`
       : ''),
  });
}

function modalReorder(gid){
  const g = garment(gid); if(!g) return;
  UI.ro = {lines:g.colourways.map(c => ({cw:c.id, colour:c.colour, qty:0})), dest:myAccount().locations[0]?.name || ''};
  const draw = () => `
    <div class="stack">
      <div class="banner banner--go"><div>
        <div class="banner-t">Cloned from the archived revision ${g.rev} snapshot</div>
        <div class="banner-d">${esc(FABRICS[g.fabric].name)} · ${esc(S.personalization[g.pers.method].name)} at ${esc(S.positions_lib[g.pers.pos])}. We will not silently substitute a newer base, fabric or artwork — any substitution becomes an explicit change you have to accept.</div></div></div>
      <div>
        <div class="field-l">Colours and quantities</div>
        ${g.colourways.map(c => `<div class="cw">
          <span class="row"><span class="sw sw--lg" style="background:${COLOURS[c.colour].hex}"></span>
            <span class="t-sm med">${esc(COLOURS[c.colour].name)}</span></span>
          <input class="inp inp--num" type="number" min="0" value="0" data-act="roQty" data-cw="${c.id}">
          <span class="t-xs muted num">${money(g.unitPrice)} ea</span>
        </div>`).join('')}
      </div>
      <label class="field"><span class="field-l">Deliver to</span>
        <select class="inp" id="rodest">
          ${myAccount().locations.map(l => `<option>${esc(l.name)}</option>`).join('')}
        </select></label>
      <div class="card card--quiet"><div class="row-between">
        <span class="t-sm muted">Indicative at the last approved unit price</span>
        <span class="t-h4 num" id="rototal">${money(0)}</span></div>
        <div class="t-xs muted" style="margin-top:6px">We confirm availability, price and timing before anything is produced. No development fee applies to a reorder.</div></div>
    </div>`;
  openModal({title:'Reorder — ' + g.name, sub:`${base(g.base).ref} · revision ${g.rev} (locked)`,
    body:draw(),
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="roSubmit" data-g="${g.id}">Submit reorder request</button>`});
}

function modalRequest(kind, o){
  const titles = {rename:'Request a position name change', garment:'Request another garment', colour:'Request another colour'};
  const p = o.p ? project(o.p) : null;
  const pos = o.pos && p ? p.positions.find(x => x.id === o.pos) : null;
  const g = o.g ? garment(o.g) : null;
  let body = '';
  if(kind === 'rename') body = `
    <label class="field"><span class="field-l">Current name</span>
      <input class="inp" value="${esc(pos.name)}" disabled></label>
    <label class="field"><span class="field-l">What should it be called?</span>
      <input class="inp" id="rqval" placeholder="Treatment Team"></label>`;
  if(kind === 'garment') body = `
    <p class="t-sm muted" style="margin-bottom:16px">You are asking for another garment inside <strong>${esc(pos.name)}</strong>. We will tell you whether it is feasible, what it does to price and timing, and which base it would use.</p>
    <label class="field"><span class="field-l">What garment?</span>
      <input class="inp" id="rqval" placeholder="A lightweight gilet for the terrace shift"></label>`;
  if(kind === 'colour') body = `
    <p class="t-sm muted" style="margin-bottom:16px">The colours offered on <strong>${esc(g.name)}</strong> are the ones we have mapped and tested against its fabric. Anything else needs a lab dip.</p>
    <label class="field"><span class="field-l">What colour?</span>
      <input class="inp" id="rqval" placeholder="A warmer sand, closer to our lobby stone"></label>`;
  openModal({title:titles[kind],
    body:`<div class="stack">${body}
      <label class="field"><span class="field-l">Why? <span class="faint">(this is the part that helps us)</span></span>
        <textarea class="inp" id="rqwhy" placeholder="What changed, or what is not working…"></textarea></label>
      <div class="banner"><div><div class="banner-t">This does not change anything yet</div>
        <div class="banner-d">Your request is reviewed before it touches the approved specification. If we accept it, we build it into a new revision and publish that — so you always know exactly what is agreed.</div></div></div>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="rqSubmit" data-kind="${kind}" data-p="${o.p||''}" data-pos="${o.pos||''}" data-g="${o.g||''}">Submit request</button>`});
}

function modalBuilder(accId, step){
  step = step || 1;
  UI.build = UI.build || {account:accId, name:'', design:false, target:'', brief:'',
    positions:[{name:'', people:'', garments:[]}], am:'u_nuria'};
  const b = UI.build;
  const steps = ['Project information','Positions','Garments','Customer access','Review & create'];
  let body = '';

  if(step === 1) body = `
    <label class="field"><span class="field-l">Project name</span>
      <input class="inp" id="bname" value="${esc(b.name)}" placeholder="Front of House Wardrobe"></label>
    <label class="field"><span class="field-l">Customer</span>
      <input class="inp" value="${esc(account(accId).name)}" disabled></label>
    <label class="field"><span class="field-l">Target delivery</span>
      <input class="inp" type="date" id="btarget" value="${esc(b.target)}"></label>
    <label class="field"><span class="field-l">Brief</span>
      <textarea class="inp" id="bbrief" placeholder="What the wardrobe has to do, and the constraints it lives under.">${esc(b.brief)}</textarea></label>
    <label class="choice ${b.design?'choice--on':''}">
      <input type="checkbox" id="bdesign" ${b.design?'checked':''}>
      <span><span class="choice-t">This project includes paid design work</span>
        <span class="choice-d">Adds the conditional Design stage. Leave it off and the project starts at Development — the customer never sees a stage that does not apply to them.</span></span></label>`;

  if(step === 2) body = `
    <p class="t-sm muted" style="margin-bottom:16px">A position is a role you are dressing. The customer can complete or request changes to these, but cannot create them.</p>
    ${b.positions.map((p,i) => `<div class="card card--quiet" style="margin-bottom:12px">
      <div class="grid grid-2">
        <label class="field" style="margin:0"><span class="field-l">Position ${i+1}</span>
          <input class="inp" data-act="bpos" data-i="${i}" data-f="name" value="${esc(p.name)}" placeholder="Front of House"></label>
        <label class="field" style="margin:0"><span class="field-l">People</span>
          <input class="inp" type="number" data-act="bpos" data-i="${i}" data-f="people" value="${esc(p.people)}" placeholder="50"></label>
      </div></div>`).join('')}
    <button class="btn btn--ghost btn--sm" data-act="bAddPos">Add another position</button>`;

  if(step === 3) body = `
    <p class="t-sm muted" style="margin-bottom:16px">A quick start, if you already know. You can skip this entirely
      and add garments properly on the project — with fabric, colours, images and a price — once it exists.</p>
    ${b.positions.filter(p => p.name).map((p,i) => `
      <div class="card card--quiet" style="margin-bottom:12px">
        <div class="t-sm med" style="margin-bottom:8px">${esc(p.name)} — ${p.people} people</div>
        <div class="wrap-row">
          ${S.bases.filter(x => x.status === 'active').map(x => `
            <button class="sw-btn ${(p.garments||[]).includes(x.id)?'sw-btn--on':''}" data-act="bGarment" data-i="${i}" data-b="${x.id}">
              ${x.glyph} ${esc(x.name)}</button>`).join('')}
        </div>
      </div>`).join('') || '<p class="t-sm muted">Add a position with a name first.</p>'}`;

  if(step === 4) body = `
    <p class="t-sm muted" style="margin-bottom:16px">What the customer may do inside this project.</p>
    <div class="stack-2">
      ${[['Complete people counts and quantities','Editable'],
         ['Choose from published fabrics and colours','Editable'],
         ['Add colourway lines','Editable'],
         ['Rename a position','Request only'],
         ['Add or remove a garment','Request only'],
         ['Request an unmapped colour or fabric','Request only'],
         ['Approve revisions and commercial documents','Account Admin only'],
         ['Technical files, costs, supplier notes','Hidden']]
        .map(([n,v]) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
          <span class="t-sm">${n}</span><span class="chip ${v==='Hidden'?'':'chip--on'}">${v}</span></div>`).join('')}
    </div>`;

  if(step === 5){
    const issues = [];
    if(!b.name) issues.push('The project has no name.');
    if(!b.positions.some(p=>p.name)) issues.push('No positions have been created.');
    body = `
      ${issues.length ? `<div class="banner banner--stop" style="margin-bottom:16px"><div>
        <div class="banner-t">${issues.length} thing${issues.length>1?'s':''} block this</div>
        <ul class="stack-2" style="margin-top:8px">${issues.map(i=>`<li class="t-sm">· ${esc(i)}</li>`).join('')}</ul>
      </div></div>` : `<div class="banner banner--go" style="margin-bottom:16px"><div>
        <div class="banner-t">Ready to create</div>
        <div class="banner-d">This creates the project as a draft and opens it. The customer sees nothing until you
          have added images, prices and payment steps and published it.</div></div></div>`}
      <div class="cvp">
        <div class="cvp-hd"><span class="eyebrow" style="color:var(--navy)">Exactly what the customer will see</span></div>
        <div class="stack-2">
          <div class="factline"><span>Project</span><span class="med">${esc(b.name || '—')}</span></div>
          <div class="factline"><span>Steps</span><span>${
            projectStages(b.design).map(x => stageDef(x).name).join(' → ')}</span></div>
          <div class="factline"><span>Opens in</span><span>${b.design?'Design':'Project Build'}</span></div>
          <div class="factline"><span>Positions</span><span>${b.positions.filter(p=>p.name).map(p=>`${p.name} (${p.people||0})`).join(', ') || '—'}</span></div>
          <div class="factline"><span>Garments</span><span>${b.positions.flatMap(p=>(p.garments||[]).map(g=>base(g).name)).join(', ') || '—'}</span></div>
        </div>
      </div>
      <p class="t-xs muted" style="margin-top:16px">This is the skeleton, not the project. Everything that makes it
        real — garments, fabrics, images, prices and the payment schedule — is added next, on the project itself, and
        can be changed at any point after that.</p>`;
    UI.buildIssues = issues;
  }

  openModal({wide:true, title:'Create a project — ' + account(accId).name,
    sub:`Step ${step} of 5 · ${steps[step-1]}`,
    body:`<div class="q-prog" style="margin-bottom:20px">${steps.map((_,i)=>`<i class="${i+1<step?'done':i+1===step?'on':''}"></i>`).join('')}</div>${body}`,
    foot:`<button class="btn btn--quiet" data-act="closeModal">Cancel</button>
      ${step>1?`<button class="btn btn--ghost" data-act="bStep" data-s="${step-1}">← Back</button>`:''}
      ${step<5?`<button class="btn btn--primary" data-act="bStep" data-s="${step+1}">Continue →</button>`
        :`<button class="btn btn--primary" data-act="bPublish" ${UI.buildIssues.length?'disabled':''}>Create it and start building</button>`}`});
}

function modalResolve(gid){
  const g = garment(gid); if(!g) return;
  openModal({title:'Manual resolution — ' + g.name,
    sub:`Round ${g.round} reached without approval · ${project(g.project).ref}`,
    body:`<div class="stack">
      <div class="banner banner--stop"><div><div class="banner-t">Why this is here</div>
        <div class="banner-d">A garment gets three prototype rounds. A fourth is not a technical decision, it is a commercial one, so the system stops and asks for an explicit Master resolution rather than quietly making another sample.</div></div></div>
      <div class="card card--quiet"><p class="t-sm">${esc(g.notes)}</p></div>
      <div class="field-l">Resolution</div>
      <div class="stack-2">
        ${[['exception','Approve as an exception','Accept the current revision and lock it. The project can advance.'],
           ['requote','Revise scope and issue a new commercial proposal','Resets to round 1 against a new agreement — a different cloth, or a higher quantity.'],
           ['drop','Close this garment','Removed from the project. The other garments are unaffected.']]
          .map(([v,t,d]) => `<label class="choice"><input type="radio" name="res" value="${v}">
            <span><span class="choice-t">${t}</span><span class="choice-d">${d}</span></span></label>`).join('')}
      </div>
      <label class="field"><span class="field-l">Reason <span style="color:var(--stop)">(required — this goes in the audit log)</span></span>
        <textarea class="inp" id="resreason" placeholder="Why this is the right call."></textarea></label>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="resolveDo" data-g="${g.id}">Record the resolution</button>`});
}

/* Pick any step. Every stage is offered, with what moving there would mean and
   whether it needs explaining, so the consequence is visible before the click
   rather than discovered after it. */
function modalMoveStage(pid){
  const p = project(pid); if(!p) return;
  const u = user(SESSION.user);
  const cur = p.stages.indexOf(p.stage);
  const say = {
    back:'Goes back. Steps after it stop counting as finished.',
    next:'The next step. Nothing is blocking it.',
    force:'The next step, past conditions that are not met.',
    skip:'Skips the steps in between and marks them closed.',
  };
  openModal({
    title:'Move this project to another step', sub:`${p.ref} · now in ${stageDef(p.stage).name}`,
    body:`<div class="stack">
      <div class="mv">
        ${p.stages.map((sid, i) => {
          const k = STAGE_MOVE.kindOf(p, sid);
          const here = i === cur;
          const ok = k && STAGE_MOVE.allowed(u, p, k);
          return `<label class="mv-o ${here?'mv-o--here':''} ${ok?'':'mv-o--off'}">
            <input type="radio" name="mvstage" value="${esc(sid)}" ${ok?'':'disabled'}>
            <span class="mv-b">
              <span class="mv-n">${i+1}. ${esc(stageDef(sid).name)}</span>
              <span class="mv-d">${here ? 'Where the project is now.'
                : ok ? esc(say[k]) : k === 'back' || k === 'next'
                  ? 'You do not manage this project.' : 'Only Master can move a project out of sequence.'}</span>
            </span>
            ${k === 'back' && ok ? '<span class="mv-tag">back</span>' : ''}
          </label>`;
        }).join('')}
      </div>
      <label class="field"><span class="field-l">Reason <span class="faint">— required for anything but a plain advance</span></span>
        <textarea class="inp" id="mvreason" placeholder="Why the project is moving here. Written to the audit log."></textarea></label>
      <p class="t-xs muted">The customer is told the step changed, and that nothing they have already approved is undone.</p>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="mvStageDo" data-p="${p.id}">Move project</button>`});
}

/* Master's escape hatch. Every controlled state on the project, each one
   settable directly, each change written to the audit log with a reason. It
   exists because a prototype of a real business will always have a record that
   is simply wrong, and the alternative is editing the data by hand. */
function stOverride(p, v, u){
  if(!can(u,'phase_override','do')) return `<div class="empty">
    <div class="empty-t">Master only</div>
    <div class="empty-d">Overriding a record is restricted to Master. Ask ${esc((S.users.find(x=>x.role==='master')||{}).name || 'a Master user')}.</div></div>`;

  const sel = (kind, id, cur) => `<select class="inp inp--sm" data-act="ovPick"
      data-kind="${esc(kind)}" data-id="${esc(id)}" aria-label="State">
      ${(OVERRIDE_STATES[kind]||[]).map(o => `<option value="${esc(o)}" ${o===cur?'selected':''}>${esc(st(o).label)}</option>`).join('')}
    </select>`;
  const row = (kind, id, name, sub, cur) => `<tr>
      <td><span class="med">${esc(name)}</span>${sub?`<br><span class="mono-ref">${esc(sub)}</span>`:''}</td>
      <td>${pill(cur)}</td>
      <td>${sel(kind, id, cur)}</td>
    </tr>`;

  const gates = Object.keys(p.gates || {});
  return `
    <section class="stack-6">
      <div class="banner banner--stop"><div>
        <div class="banner-t">Overrides bypass the rules that normally protect these records</div>
        <div class="banner-d">Each change is written to the audit log with your name and your reason, and takes effect
          immediately. The customer is not notified — an override corrects our own record. When they should hear about
          it, use the ordinary action instead.</div></div></div>

      <div>
        <h3 class="t-h4">Which step the project is on</h3>
        <p class="t-sm muted" style="margin-top:4px">Currently ${esc(stageDef(p.stage).name)}, step ${p.stages.indexOf(p.stage)+1} of ${p.stages.length}.</p>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn--primary btn--sm" data-act="mvStage" data-p="${p.id}">Move to another step…</button>
        </div>
      </div>

      <div>
        <h3 class="t-h4">Every state on this project</h3>
        <label class="field" style="margin-top:12px"><span class="field-l">Reason <span style="color:var(--stop)">(required)</span></span>
          <input class="inp" id="ovrreason" placeholder="Why these records are being corrected."></label>
        <div class="tw" style="margin-top:16px"><table class="tbl">
          <thead><tr><th>Record</th><th>Now</th><th>Set to</th></tr></thead>
          <tbody>
            ${row('project', p.id, p.name, p.ref + ' · internal status', p.opStatus)}
            ${gates.map(g => row('gate', p.id + '|' + g, g.replace(/_/g,' '), 'commercial gate', p.gates[g])).join('')}
            ${(p.milestones||[]).map(m => row('milestone', m.id, m.label, 'payment step · ' + money(m.amount), m.state)).join('')}
            ${S.documents.filter(d => d.project === p.id).map(d => row('document', d.id, d.title, d.num, d.state)).join('')}
            ${v.garments.map(g => row('garment', g.id, g.name, 'round ' + g.round, g.state)).join('')}
            ${v.allApprovals.map(a => row('approval', a.id, a.kind, 'decision', a.state)).join('')}
          </tbody></table></div>
        <p class="t-xs muted" style="margin-top:10px">Changing a row applies it straight away. Every one lands in
          <button class="lnk" data-go="studio:audit">the audit log</button> with what it was, what it became and why.</p>
      </div>
    </section>`;
}

function modalOverride(pid){
  const p = project(pid);
  openModal({title:'Override the stage gate', sub:p.ref + ' · ' + stageDef(p.stage).name,
    body:`<div class="stack">
      <div class="banner banner--stop"><div><div class="banner-t">You are advancing past unmet conditions</div>
        <div class="banner-d">The customer will see the new stage. The override, your name and your reason are written to the audit log permanently.</div></div></div>
      <ul class="stack-2">${gateBlockers(p).map(b=>`<li class="t-sm">· ${esc(b.text)}</li>`).join('')}</ul>
      <label class="field"><span class="field-l">Reason <span style="color:var(--stop)">(required)</span></span>
        <textarea class="inp" id="ovreason" placeholder="Why this override is justified."></textarea></label>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--danger" data-act="overrideDo" data-p="${p.id}">Override and advance</button>`});
}

function modalStub(title, body){
  openModal({title, body:`<div class="banner"><div><div class="banner-t">Specified, not built in this prototype</div>
    <div class="banner-d">${body}</div></div></div>`,
    foot:`<button class="btn btn--primary" data-act="closeModal">Understood</button>`});
}



/* ---- building a project, one record at a time ---------------------------
   Each of these edits exactly one thing and writes exactly one action. The
   draft lives on UI while the modal is open, so changing a base can redraw
   the fabrics and colours it offers without losing what has been typed. */

function readGD(){
  const d = UI.gd; if(!d) return;
  if($('gd_name'))  d.name  = $('gd_name').value;
  if($('gd_price')) d.unitPrice = $('gd_price').value;
  if($('gd_sum'))   d.summary = $('gd_sum').value;
  if($('gd_notes')) d.notes = $('gd_notes').value;
  if($('gd_fab'))   d.fabric = $('gd_fab').value;
  if($('gd_meth'))  d.method = $('gd_meth').value;
  if($('gd_pos'))   d.pos   = $('gd_pos').value;
}

function modalGarment(){
  const d = UI.gd; if(!d) return;
  const editing = !!d.editing;
  const b = d.base ? base(d.base) : null;
  const usable = S.bases.filter(x => x.status !== 'draft');

  const body = `
    <div class="stack">
      ${!editing ? `
      <div>
        <span class="field-l">Which base is it built on?</span>
        <span class="field-h">A base carries the block, the construction and the sizes. Draft bases cannot be used.</span>
        <div class="bo-bases">
          ${usable.map(x => `<button class="bo-base ${d.base === x.id ? 'bo-base--on' : ''}" data-act="gdBase" data-b="${x.id}">
            <span class="bo-base-g">${x.glyph}</span>
            <span class="bo-base-n">${esc(x.name)}</span>
            <span class="bo-base-r">${x.ref} ${x.v}${x.status === 'restricted' ? ' · restricted' : ''}</span>
          </button>`).join('')}
        </div>
      </div>` : `<div class="card card--quiet">
        <div class="eyebrow">Base</div>
        <div class="t-sm med" style="margin-top:6px">${b.glyph} ${esc(b.name)} <span class="mono-ref">${b.ref} ${b.v}</span></div>
      </div>`}

      ${b ? `
      ${b.status === 'restricted' ? `<div class="banner banner--wait"><div>
        <div class="banner-t">${b.ref} is restricted</div>
        <div class="banner-d">${esc(b.spec)}</div></div></div>` : ''}

      <label class="field"><span class="field-l">What is it called on this project?</span>
        <span class="field-h">The customer reads this name, so call it what they call it.</span>
        <input class="inp" id="gd_name" value="${esc(d.name || b.name)}" placeholder="${esc(b.name)}"></label>

      <div class="grid grid-2">
        <label class="field" style="margin:0"><span class="field-l">Fabric</span>
          <select class="inp" id="gd_fab">
            ${b.fabrics.map(f => FABRICS[f] ? `<option value="${f}" ${f === d.fabric ? 'selected' : ''}>${esc(FABRICS[f].name)} — ${esc(FABRICS[f].spec)}</option>` : '').join('')}
          </select></label>
        <label class="field" style="margin:0"><span class="field-l">Price to the customer, per piece</span>
          <input class="inp" id="gd_price" type="number" min="0" step="0.01" value="${d.unitPrice != null ? d.unitPrice : ''}" placeholder="Leave empty if it is not priced yet"></label>
      </div>
      <button class="btn btn--quiet btn--sm" data-act="gdNewFabric" style="align-self:flex-start">The fabric is not in the list</button>

      <div class="grid grid-2">
        <label class="field" style="margin:0"><span class="field-l">Identity</span>
          <select class="inp" id="gd_meth">
            ${b.pers.map(m => `<option value="${m}" ${m === d.method ? 'selected' : ''}>${esc(S.personalization[m].name)}</option>`).join('')}
          </select></label>
        <label class="field" style="margin:0"><span class="field-l">Where it sits</span>
          <select class="inp" id="gd_pos">
            ${b.pos.map(x => `<option value="${x}" ${x === d.pos ? 'selected' : ''}>${esc(S.positions_lib[x])}</option>`).join('')}
          </select></label>
      </div>

      <div><span class="field-l">Colours</span>
        <span class="field-h">Each colour becomes a line the customer fills quantities into. You can add more later.</span>
        <div class="wrap-row" style="margin-top:8px">
          ${b.colours.map(c => `<button class="sw-btn ${(d.colours||[]).includes(c) ? 'sw-btn--on' : ''}" data-act="gdColour" data-c="${c}">
            <span class="sw" style="background:${COLOURS[c].hex}"></span>${esc(COLOURS[c].name)}</button>`).join('')}
        </div>
      </div>

      <label class="field"><span class="field-l">What you are proposing, in a line or two</span>
        <span class="field-h">This is what the customer reads under the garment. Optional.</span>
        <textarea class="inp" id="gd_sum" placeholder="A lighter poplin than the one they have now, cut for a full shift on the floor.">${esc(d.summary || '')}</textarea></label>

      <label class="field"><span class="field-l">Internal note</span>
        <textarea class="inp" id="gd_notes" placeholder="Never shown to the customer.">${esc(d.notes || '')}</textarea></label>
      ` : '<p class="t-sm muted">Choose a base to carry on.</p>'}
    </div>`;

  openModal({
    title: editing ? 'Edit ' + (d.name || 'garment') : 'Add a garment',
    sub: editing ? 'Changes are a draft until the project is published' : 'It is added as a draft at revision 1',
    body,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="gdSave" ${b ? '' : 'disabled'}>${editing ? 'Save the garment' : 'Add the garment'}</button>`,
  });
}

function modalImages(gid){
  const g = garment(gid); if(!g) return;
  const ims = g.images || [];
  openModal({
    title:'Images — ' + g.name, sub:`${ims.length} attached`,
    body:`<div class="stack">
      <p class="t-sm muted">The first image is the one the customer sees on the garment. Files are read here on your
        machine and stored with the record, so they travel with the project.</p>
      ${ims.length ? `<div class="bo-grid bo-grid--sm">
        ${ims.map((im,i) => `<figure class="bo-im">
          <img src="${im.src}" alt="${esc(im.cap || g.name)}">
          <figcaption>
            <span>${i === 0 ? 'Cover · ' : ''}${esc(im.cap || im.tag)}</span>
            <button class="bo-x" data-act="gRmImage" data-g="${g.id}" data-im="${im.id}" title="Remove">×</button>
          </figcaption></figure>`).join('')}
      </div>` : '<p class="t-sm muted">Nothing attached yet.</p>'}
      <label class="field" style="margin:0"><span class="field-l">Caption for what you add next</span>
        <input class="inp" id="im_cap" placeholder="Sample in ecru, second round"></label>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Close</button>
      <button class="btn btn--primary" data-act="gAddImage" data-g="${g.id}">Choose images…</button>`,
  });
}

function modalPosition(pid, posId){
  const p = project(pid); if(!p) return;
  const pos = posId ? p.positions.find(x => x.id === posId) : null;
  openModal({
    title: pos ? 'Edit ' + pos.name : 'Add a position',
    sub:'A position is a role you are dressing',
    body:`<div class="stack">
      <label class="field" style="margin:0"><span class="field-l">Name</span>
        <input class="inp" id="pos_name" value="${esc(pos ? pos.name : '')}" placeholder="Reception and welcome"></label>
      <label class="field" style="margin:0"><span class="field-l">How many people are in it</span>
        <input class="inp" type="number" min="0" id="pos_people" value="${pos ? pos.people : ''}" placeholder="24"></label>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="posSave" data-p="${p.id}" data-pos="${posId || ''}">${pos ? 'Save' : 'Add the position'}</button>`,
  });
}

function modalFabric(back){
  openModal({
    title:'Add a fabric', sub:'It joins the library and can be used on any base',
    body:`<div class="stack">
      <div class="grid grid-2">
        <label class="field" style="margin:0"><span class="field-l">Name</span>
          <input class="inp" id="fb_name" placeholder="Washed linen–cotton"></label>
        <label class="field" style="margin:0"><span class="field-l">Reference</span>
          <input class="inp" id="fb_ref" placeholder="FB-048"></label>
      </div>
      <label class="field" style="margin:0"><span class="field-l">Specification</span>
        <span class="field-h">Weight, composition, where it is made — the line that appears wherever this fabric is named.</span>
        <input class="inp" id="fb_spec" placeholder="210 g/m², 55% linen 45% cotton, Portugal"></label>
      <label class="choice"><input type="checkbox" id="fb_prov">
        <span><span class="choice-t">Provenance is documented</span>
          <span class="choice-d">Tick only if you hold the certificate. It is shown to the customer as a claim you stand behind.</span></span></label>
      <div><span class="field-l">Offer it on these bases</span>
        <div class="wrap-row" style="margin-top:8px">
          ${S.bases.map(b => `<label class="sw-btn"><input type="checkbox" class="fb-base" value="${b.id}" style="margin-right:6px">${b.glyph} ${esc(b.name)}</label>`).join('')}
        </div></div>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="${back ? 'gdBack' : 'closeModal'}">Cancel</button>
      <button class="btn btn--primary" data-act="fbSave" data-back="${back ? '1' : ''}">Add the fabric</button>`,
  });
}

function modalMilestone(pid, mid){
  const p = project(pid); if(!p) return;
  const m = mid ? milestones(p).find(x => x.id === mid) : null;
  const val = projectValue(p);
  const scheduled = milestonesTotal(p) - (m ? m.amount : 0);
  openModal({
    title: m ? 'Edit ' + m.label : 'Add a payment step',
    sub: m && m.state !== 'draft' ? 'Issued — the customer can already see this' : 'Internal until you issue it',
    body:`<div class="stack">
      <label class="field" style="margin:0"><span class="field-l">What is it called</span>
        <span class="field-h">The customer reads this on the invoice and in the project.</span>
        <input class="inp" id="ms_label" value="${esc(m ? m.label : '')}" placeholder="Development — technical files and first prototypes"></label>
      <div class="grid grid-2">
        <label class="field" style="margin:0"><span class="field-l">Amount, before VAT</span>
          <input class="inp" type="number" min="0" step="0.01" id="ms_amount" value="${m ? m.amount : ''}" placeholder="5400"></label>
        <label class="field" style="margin:0"><span class="field-l">Payable by</span>
          <input class="inp" type="date" id="ms_due" value="${m && m.due ? m.due : ''}"></label>
      </div>
      <div class="grid grid-2">
        <label class="field" style="margin:0"><span class="field-l">Which stage does it hold shut?</span>
          <select class="inp" id="ms_stage">
            <option value="">Nothing — it does not gate a stage</option>
            ${p.stages.map(sid => `<option value="${sid}" ${m && m.stage === sid ? 'selected' : ''}>${stageDef(sid).name}</option>`).join('')}
          </select></label>
        <label class="field" style="margin:0"><span class="field-l">Issued as</span>
          <select class="inp" id="ms_kind">
            ${['Invoice','Pro forma','Deposit'].map(k => `<option ${m && m.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
          </select></label>
      </div>
      <label class="field" style="margin:0"><span class="field-l">What it releases</span>
        <span class="field-h">Said plainly. This is the sentence the customer sees when the stage is held.</span>
        <textarea class="inp" id="ms_what" placeholder="Technical files and the first prototype round begin once this is settled.">${esc(m ? m.what : '')}</textarea></label>
      <div class="card card--quiet">
        <div class="stack-2">
          <div class="factline"><span>Project as priced</span><span class="num">${money(val.total)}</span></div>
          <div class="factline"><span>Already scheduled${m ? ', excluding this step' : ''}</span><span class="num">${money(scheduled)}</span></div>
        </div></div>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="msSave" data-p="${p.id}" data-m="${mid || ''}">${m ? 'Save' : 'Add the step'}</button>`,
  });
}

function modalLine(pid){
  openModal({
    title:'Add a cost line', sub:'Anything that is not priced per garment',
    body:`<div class="stack">
      <label class="field" style="margin:0"><span class="field-l">Line</span>
        <input class="inp" id="ln_label" placeholder="Design fee — external design partner"></label>
      <label class="field" style="margin:0"><span class="field-l">Amount</span>
        <input class="inp" type="number" min="0" step="0.01" id="ln_amount" placeholder="4800"></label>
      <label class="field" style="margin:0"><span class="field-l">Basis</span>
        <input class="inp" id="ln_note" placeholder="Fixed fee, agreed on the first call"></label>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="lnSave" data-p="${pid}">Add the line</button>`,
  });
}

function modalDesign(pid){
  const p = project(pid); if(!p) return;
  const imgs = UI.dzImgs || [];
  openModal({
    title:'Add design work', sub:'What the designer made',
    body:`<div class="stack">
      <div class="grid grid-2">
        <label class="field" style="margin:0"><span class="field-l">Title</span>
          <input class="inp" id="dz_title" value="${esc(UI.dzTitle || '')}" placeholder="Front of house — first direction"></label>
        <label class="field" style="margin:0"><span class="field-l">Who made it</span>
          <input class="inp" id="dz_by" value="${esc(UI.dzBy || '')}" placeholder="Design partner"></label>
      </div>
      <label class="field" style="margin:0"><span class="field-l">What it is</span>
        <textarea class="inp" id="dz_note" placeholder="Three directions for the restaurant and bar team, drawn on the approved block.">${esc(UI.dzNote || '')}</textarea></label>
      <label class="field" style="margin:0"><span class="field-l">Held until this is paid</span>
        <span class="field-h">The customer sees that the work exists and what it is waiting on. Leave it open if the design is not being charged for separately.</span>
        <select class="inp" id="dz_gate">
          <option value="">Not held — release it freely</option>
          ${milestones(p).map(m => `<option value="${m.id}">${esc(m.label)} — ${money(m.amount)}${m.state === 'paid' ? ' (already paid)' : ''}</option>`).join('')}
        </select></label>
      <div class="field" style="margin:0"><span class="field-l">The document the customer receives</span>
        <span class="field-h">A design fee buys a drawing, and this is the file of it. It is the only thing
          shown on their Design step, so it should stand on its own.</span>
        ${UI.dzFile ? `<div class="dsn-doc" style="margin-top:8px">
          <span class="dsn-ico" aria-hidden="true">PDF</span>
          <div class="dsn-b"><div class="dsn-t">${esc(UI.dzFile.name)}</div>
            <div class="dsn-m">${fileSize(UI.dzFile.size)}</div></div>
          <button class="btn btn--ghost btn--sm" data-act="dzDropFile">Remove</button>
        </div>` : '<p class="t-sm muted" style="margin-top:8px">No document attached yet.</p>'}
      </div>
      ${imgs.length ? `<div class="bo-grid bo-grid--sm">
        ${imgs.map(im => `<figure class="bo-im"><img src="${im.src}" alt=""><figcaption><span>${esc(im.cap||'')}</span></figcaption></figure>`).join('')}
      </div>` : ''}
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--ghost" data-act="dzPickFile" data-p="${p.id}">Choose the PDF…</button>
      <button class="btn btn--ghost" data-act="dzAddImages" data-p="${p.id}">Add images…</button>
      <button class="btn btn--primary" data-act="dzSave" data-p="${p.id}">Add the design</button>`,
  });
}

function modalAsk(pid, target){
  const p = project(pid); if(!p) return;
  const g = target ? garment(target) : null;
  const preset = g
    ? {t:`${g.name} — approve as specified`,
       s:`${g.name} on ${base(g.base).ref} ${g.baseV}, in ${FABRICS[g.fabric] ? FABRICS[g.fabric].name : g.fabric}` +
         (g.unitPrice != null ? `, at ${money(g.unitPrice)} per piece` : '') +
         '. Accept it to lock this garment into the project, or tell us what should change.'}
    : {t:`${p.name} — the proposal`,
       s:`Everything we are proposing for ${p.name}: the positions, the garments, the fabrics and the prices as they stand today.`};
  const due = new Date(S.today); due.setDate(due.getDate() + 14);
  openModal({
    title:'Ask the customer to decide', sub:g ? esc(g.name) : esc(p.name),
    body:`<div class="stack">
      <label class="field" style="margin:0"><span class="field-l">What are you asking them?</span>
        <input class="inp" id="ak_title" value="${esc(preset.t)}"></label>
      <label class="field" style="margin:0"><span class="field-l">What it means if they accept</span>
        <textarea class="inp" id="ak_sum" style="min-height:110px">${esc(preset.s)}</textarea></label>
      <label class="field" style="margin:0"><span class="field-l">Answer needed by</span>
        <input class="inp" type="date" id="ak_due" value="${due.toISOString().slice(0,10)}"></label>
      <p class="t-xs muted">They can accept, ask for changes, or decline. Whichever they choose is recorded against
        version ${Math.max(1, p.version)} and cannot be carried forward to a later one.</p>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="akSend" data-p="${p.id}" data-g="${target || ''}">Send it</button>`,
  });
}

function modalNote(pid){
  const p = project(pid); if(!p) return;
  openModal({
    title:'The covering note', sub:'The first thing the customer reads on the proposal',
    body:`<div class="stack">
      <label class="field" style="margin:0"><span class="field-l">Note</span>
        <textarea class="inp" id="pn_note" style="min-height:180px" placeholder="What you are recommending, and why it answers what they told you.">${esc(p.proposal ? p.proposal.note : '')}</textarea></label>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--primary" data-act="pnSave" data-p="${p.id}">Save the note</button>`,
  });
}

function modalRemoveG(gid){
  const g = garment(gid); if(!g) return;
  const locked = g.state === 'approved';
  openModal({
    title:'Remove ' + g.name, sub:st(g.state).label,
    body:`<div class="stack">
      ${locked ? `<div class="banner banner--stop"><div>
        <div class="banner-t">This garment is approved</div>
        <div class="banner-d">The customer has accepted it as specified. Removing it withdraws that acceptance and
          takes the garment out of the project at the next publish.</div></div></div>` : ''}
      <label class="field" style="margin:0"><span class="field-l">Why is it coming out?${locked ? '' : ' <span class="faint">(optional)</span>'}</span>
        <textarea class="inp" id="rm_reason" placeholder="The concierge coat drops out — six pieces will never reach the melton minimum."></textarea></label>
    </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--danger" data-act="gRemoveDo" data-g="${g.id}">Remove it</button>`,
  });
}

/* ---- catalogue CSV import (Studio → Merchandising) ----------------------- */
function modalImport(){
  const v = UI.importResult;
  const V = csvVocab();
  const ref = (label, vals) => `<div style="margin-bottom:10px">
    <div class="t-xs med">${label}</div>
    <div class="wrap-row" style="gap:4px;margin-top:4px">
      ${vals.map(x => `<code class="chip" style="font-size:11px">${esc(x)}</code>`).join('')}</div></div>`;

  const body = !v ? `
    <div class="stack">
      <div class="banner"><div>
        <div class="banner-t">Paste or drop your filled merch-catalogue.csv</div>
        <div class="banner-d">It is checked against exactly the same rules as the terminal validator — one rule set, not two. Nothing changes until you commit.</div></div></div>
      <div id="dropzone" class="empty" style="padding:32px;cursor:pointer">
        <div class="empty-t">Drop the CSV here</div>
        <div class="empty-d">or paste its contents into the box below</div>
      </div>
      <label class="field"><span class="field-l">CSV contents</span>
        <textarea class="inp" id="csvbox" style="min-height:160px;font-size:12px"
          placeholder="row_type,ref,handle,name,category,status,moq,..."></textarea></label>
      <details class="card card--quiet">
        <summary class="t-sm med" style="cursor:pointer">Allowed values</summary>
        <div style="margin-top:12px">
          ${ref('row_type', CSV_ROW_TYPES)}
          ${ref('colours / colour', V.colours)}
          ${ref('personalisation_methods / method', V.methods)}
          ${ref('personalisation_positions / position', V.positions)}
          ${ref('sizes', [...V.sizes, 'One size'])}
          ${ref('status', CSV_STATUSES)}
          ${ref('size_band', ['small','medium','large'])}
          ${ref('priced_by', ['size','quantity'])}
        </div>
      </details>
    </div>`
  : `
    <div class="stack">
      <div class="grid grid-4">
        ${[[v.byType.product.length,'Products'],[v.byType.variant.length,'Variants'],
           [v.byType.image.length,'Images'],[v.byType.deco_rate.length,'Rate rows']]
          .map(([n,l]) => `<div class="tile"><div class="tile-v num">${n}</div><div class="tile-l">${l}</div></div>`).join('')}
      </div>
      ${v.ok
        ? `<div class="banner banner--go"><div><div class="banner-t">No errors — ${v.index.size} products ready</div>
           <div class="banner-d">${v.warnings} warning${v.warnings===1?'':'s'}. Warnings never block an import.</div></div></div>`
        : `<div class="banner banner--stop"><div><div class="banner-t">${v.errors} error${v.errors===1?'':'s'} — nothing will be imported</div>
           <div class="banner-d">Fix these in the spreadsheet and paste it again.</div></div></div>`}
      ${v.report.length ? `<div class="tw" style="max-height:260px;overflow-y:auto">
        <table class="tbl" style="min-width:0"><thead><tr><th>Line</th><th>Column</th><th>What is wrong</th></tr></thead>
        <tbody>${v.report.slice(0,120).map(r => `<tr>
          <td class="num">${r.line}</td>
          <td class="t-xs"><code>${esc(r.col)}</code></td>
          <td class="t-xs">${r.sev === 'ERROR' ? pill('error') : pill('warning')} ${esc(r.msg)}</td>
        </tr>`).join('')}</tbody></table>
        ${v.report.length > 120 ? `<div class="tbl-empty">…and ${v.report.length - 120} more</div>` : ''}
      </div>` : ''}
      ${v.ok ? `<div class="card card--quiet">
        <div class="eyebrow">Preview</div>
        <div class="stack-2" style="margin-top:8px">
          ${catalogueToProducts(v).slice(0,6).map(p => `<div class="row-between">
            <span class="t-sm">${p.glyph} <span class="med">${esc(p.name)}</span>
              <span class="mono-ref">/${esc(p.handle)}</span></span>
            <span class="row" style="gap:6px">
              ${p.colours.slice(0,6).map(c => `<span class="sw" style="background:${COLOURS[c]?COLOURS[c].hex:'#ccc'};width:14px;height:14px"></span>`).join('')}
              <span class="t-xs num">${money(p.from)}</span></span></div>`).join('')}
          ${v.index.size > 6 ? `<div class="t-xs faint">…and ${v.index.size - 6} more</div>` : ''}
        </div></div>` : ''}
      <p class="t-xs muted">Images are referenced by URL. They will render on Shopify and on the real site, but not inside this published prototype — its content policy blocks external images. The URLs are still validated and carried through.</p>
    </div>`;

  openModal({wide:true, title:'Import catalogue CSV',
    sub: v ? 'Step 2 of 2 · review' : 'Step 1 of 2 · paste or drop the file',
    body,
    foot: !v
      ? `<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
         <button class="btn btn--primary" data-act="csvCheck">Check the file</button>`
      : `<button class="btn btn--ghost" data-act="csvBack">← Paste a different file</button>
         <button class="btn btn--primary" data-act="csvCommit" ${v.ok?'':'disabled'}>
           Import ${v.index.size} product${v.index.size===1?'':'s'}</button>`});

  /* drag-and-drop, wired after the modal is in the DOM */
  const dz = $('dropzone');
  if(dz){
    const stop = e => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter','dragover'].forEach(n => dz.addEventListener(n, e => {
      stop(e); dz.style.borderColor = 'var(--navy)'; dz.style.background = 'var(--navy-quiet)'; }));
    ['dragleave','drop'].forEach(n => dz.addEventListener(n, e => {
      stop(e); dz.style.borderColor = ''; dz.style.background = ''; }));
    dz.addEventListener('drop', e => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if(!f) return;
      const rd = new FileReader();
      rd.onload = () => { const box = $('csvbox'); if(box){ box.value = rd.result; }
        UI.importResult = validateCatalogue(String(rd.result)); modalImport(); };
      rd.readAsText(f);
    });
    dz.addEventListener('click', () => { const box = $('csvbox'); if(box) box.focus(); });
  }
}

/* ---- event delegation ----------------------------------------------------- */
document.addEventListener('click', (e) => {
  const goEl = e.target.closest('[data-go]');
  const actEl = e.target.closest('[data-act]');
  const jumpEl = e.target.closest('[data-jump]');

  /* Touching a notification — the row, or the button inside it — is the one
     moment we can be sure it was read. Marked before the action runs, so the
     navigation it may trigger cannot outrun it. */
  const ntfEl = e.target.closest('[data-n]');
  if(ntfEl){
    const n = by(S.notifications, ntfEl.dataset.n);
    if(n && !n.read){ n.read = true; save(); }
  }

  /* a jump from the narrow-screen sheet has to close the sheet first, or the
     section it travels to is behind it */
  if(jumpEl && !actEl){
    const id = jumpEl.dataset.jump;
    if(UI.menu){
      UI.menu = false; UI.jumpTo = id;
      if(ROUTE.surface === 'public' && ROUTE.page === 'custom') render(); else go('public','custom');
      return;
    }
    jumpTo(id); return;
  }

  if(actEl){
    const a = actEl.dataset.act;
    const d = actEl.dataset;

    /* --- chrome --- */
    if(a === 'theme'){
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try{ localStorage.setItem('pamuuc_theme', next); }catch(err){}
      return;
    }
    if(a === 'closeModal' || (a === 'closeModalBg' && e.target.classList.contains('scrim'))){ closeModal(); return; }
    if(a === 'closeModalBg') return;
    if(a === 'reset'){ resetAll(); return; }
    if(a === 'logout'){ SESSION = null; save(); go('public','home'); return; }
    if(a === 'userMenu'){ modalStub('Signed in as ' + user(SESSION.user).name,
      'Profile, notification preferences and security settings live here. Use the switcher at the bottom of the screen to change who you are signed in as.'); return; }
    if(a === 'jumpAccount'){
      if(SESSION && user(SESSION.user).side === 'customer'){ go('account','overview'); return; }
      const c = S.users.find(x => x.side === 'customer');
      if(!c){ go('public','login');
        toast('No customer account yet', 'Qualify an inquiry in the Back Office and activate the account — the contact who wrote in becomes its first user.');
        return; }
      SESSION = {user:c.id}; save(); go('account','overview'); return;
    }
    if(a === 'jumpStudio'){
      if(SESSION && user(SESSION.user).side === 'studio') go('studio','overview');
      else { SESSION = {user:'u_leo'}; save(); go('studio','overview'); }
      return;
    }
    /* How a customer actually gets in. No password is asked for, stored or
       accepted anywhere: Google carries the identity, or a code sent to the
       address we already hold does. The code is shown on screen here because
       the prototype has no mail server — in the real thing it only ever
       arrives by email. */
    if(a === 'custSignIn'){
      const who = user(d.u); if(!who) return;
      UI.otp = null;
      openModal({title:'Sign in', sub:esc(who.name) + ' · ' + esc(account(who.account).name),
        body:signInBody(who),
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>`});
      return; }
    if(a === 'otpSend'){
      const who = user(d.u); if(!who) return;
      UI.otp = {user:who.id, code:String(Math.floor(100000 + Math.random() * 900000))};
      if(MODAL) MODAL.body = signInBody(who);
      const acc = account(who.account);
      emit('auth.code', {account:acc.id, customerVisible:false,
        text:`Sign-in code sent to ${who.email || accEmail(acc)}`,
        audit:'Sign-in code issued', record:who.name, was:'—', now:'sent'});
      paintModal(); return; }
    if(a === 'otpVerify'){
      const typed = $('otpCode') ? $('otpCode').value.trim() : '';
      if(!UI.otp || typed !== UI.otp.code){
        if($('otpCode')) $('otpCode').classList.add('inp--err');
        toast('That code does not match', 'Check the six digits, or ask for another.'); return; }
      const uid2 = UI.otp.user; UI.otp = null; closeModal();
      SESSION = {user:uid2}; save(); go('account','overview');
      toast('Signed in', 'No password was used, and none is stored.'); return; }
    if(a === 'googleSignIn'){
      const who = user(d.u); if(!who) return;
      closeModal(); SESSION = {user:who.id}; save(); go('account','overview');
      toast('Signed in with Google', 'In the real build this is the Google consent screen.'); return; }
    if(a === 'goSignIn'){ go('account','home'); return; }

    if(a === 'login'){ SESSION = {user:d.u}; save();
      go(user(d.u).side === 'customer' ? 'account' : 'studio', 'overview'); return; }
    if(a === 'previewAs'){
      const who = d.u || (d.acc && S.users.find(x => x.side === 'customer' && x.account === d.acc))
        || S.users.find(x => x.side === 'customer');
      if(!who){ toast('Nobody to preview as', 'This account has no users yet.'); return; }
      SESSION = {user:who.id || who}; save(); go('account','overview');
      toast('Previewing the customer account', 'Same permissions, same published data — not a separate mock.');
      return;
    }
    if(a === 'peekInquiry'){ SESSION = {user:'u_leo'}; save(); go('studio','inquiries'); return; }
    if(a === 'toMerch'){ go('public','merch'); return; }

    /* --- public form --- */
    /* --- the brief: choose, never type (except the last screen) --- */
    if(a === 'pick'){ pickAnswer(d.v); return; }
    if(a === 'pickField'){ UI.answers = UI.answers || {}; UI.answers[d.k] = d.v; render(); return; }
    if(a === 'noVat'){
      UI.answers = UI.answers || {};
      readCompanyFields();
      UI.answers['No VAT'] = !UI.answers['No VAT'];
      render(); return;
    }
    if(a === 'checkVat'){ readCompanyFields(); render(); return; }
    if(a === 'formNext'){
      const step = UI.formStep || 0;
      if(step === 0){ UI.formStep = 1; render(); return; }        /* intro */
      const qs = quizQs();
      if(step === qs.length + 1){ if(collectAboutYou()) { UI.formStep = step + 1; render(); } return; }
      if(step > qs.length + 1){ if(collectAboutCompany()) go('public','review'); return; }
      if(!quizAnswered(qs[step - 1])) return;
      UI.formStep = step + 1; render(); return;
    }
    if(a === 'formBack'){
      if(ROUTE.page === 'review'){ UI.formStep = quizQs().length + CONTACT_STEPS; go('public','form'); return; }
      const step = UI.formStep || 0;
      if(step === 0){ go('public','custom'); return; }
      UI.formStep = step - 1; UI.formErr = null; render(); return;
    }

    if(a === 'formGoto'){ UI.formStep = +d.i; UI.formErr = null; go('public','form'); return; }
    if(a === 'formSubmit'){
      UI.lastInquiry = act.submitInquiry(UI.answers || {}, qualify(UI.answers || {}));
      UI.formStep = 0; UI.answers = {};
      go('public','done'); return;
    }

    /* --- merchandise config --- */
    if(a === 'menu'){ UI.menu = !UI.menu; render(); return; }
    if(a === 'skip'){ const m = $('main'); if(m){ m.setAttribute('tabindex','-1'); m.focus(); } return; }
    /* --- offers --- */
    if(a === 'offerHide'){ markOfferSeen(d.id, 'bar'); render(); return; }
    if(a === 'offerOpen'){
      /* opening it deliberately cancels the timed one */
      if(OFFER_TIMER){ clearTimeout(OFFER_TIMER); OFFER_TIMER = null; }
      UI.popup = d.id; UI.popupDone = null; render(); return;
    }
    if(a === 'offerClose'){
      const id = UI.popup;
      UI.popup = null; UI.popupDone = null;
      if(id) markOfferSeen(id, 'popup');
      render(); return;
    }
    if(a === 'offerSubmit'){
      const el = $('opop_email'), v = (el ? el.value : '').trim();
      /* enough of a check to catch a slip, not enough to argue with a real address */
      if(!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(v)){
        if(el){ el.classList.add('inp--err'); el.focus(); }
        toast('That address does not look right', 'We need somewhere to send the code.');
        return;
      }
      act.joinOffer(d.id, v);
      UI.popupDone = v; render(); return;
    }

    if(a === 'lang'){ modalStub('Español · Français · English',
      'Spanish and French are launch requirements, with equivalent critical flows and their own routes. The copy is not translated in this prototype, so the control shows the structure rather than pretending the translations exist.'); return; }

    /* --- FAQ: reveal the remaining questions without a re-render, so any
       answer the visitor already opened stays open --- */
    if(a === 'faqMore'){
      const box = $(d.f); if(!box) return;
      const all = box.classList.toggle('faq--all');
      actEl.textContent = all ? 'Show fewer questions'
        : 'Show ' + Math.max(0, box.querySelectorAll('.faq-i--more').length) + ' more questions';
      actEl.setAttribute('aria-expanded', all ? 'true' : 'false');
      return;
    }

    /* --- product list filters --- */
    if(a === 'fCat' || a === 'fMethod'){ UI.shown = null;
      const f = listState(), key = a === 'fCat' ? 'cats' : 'methods';
      const i = f[key].indexOf(d.v);
      if(i > -1) f[key].splice(i, 1); else f[key].push(d.v);
      UI.fltOpen = true; render(); return;
    }
    if(a === 'fCatAll'){ UI.shown = null; listState().cats = []; render(); return; }
    if(a === 'fSeg'){ const f = listState(); const i = f.seg.indexOf(d.v);
      i < 0 ? f.seg.push(d.v) : f.seg.splice(i, 1); UI.shown = null; render(); return; }
    if(a === 'fFit'){ const f = listState(); const i = f.fit.indexOf(d.v);
      i < 0 ? f.fit.push(d.v) : f.fit.splice(i, 1); UI.shown = null; render(); return; }
    if(a === 'fWt'){ UI.shown = null; listState().wt = d.v || ''; render(); return; }
    if(a === 'rmSeg'){ const f = listState(); f.seg = f.seg.filter(x => x !== d.v); UI.shown = null; render(); return; }
    if(a === 'rmFit'){ const f = listState(); f.fit = f.fit.filter(x => x !== d.v); UI.shown = null; render(); return; }
    if(a === 'rmWt'){ listState().wt = ''; UI.shown = null; render(); return; }
    if(a === 'fQtyV'){ UI.shown = null; listState().qty = d.v || ''; render(); return; }
    if(a === 'fPrice'){ UI.shown = null; const f = listState(); f.price = f.price === d.v ? '' : d.v; UI.fltOpen = true; render(); return; }
    if(a === 'fQty'){ UI.shown = null; const el = $('fqty'); listState().qty = el ? el.value : ''; UI.fltOpen = true; render(); return; }
    if(a === 'rmCat'){ const f = listState(); f.cats = f.cats.filter(x => x !== d.v); render(); return; }
    if(a === 'rmMethod'){ const f = listState(); f.methods = f.methods.filter(x => x !== d.v); render(); return; }
    if(a === 'rmQty'){ listState().qty = ''; render(); return; }
    if(a === 'rmPrice'){ listState().price = ''; render(); return; }
    if(a === 'fToggle'){ UI.fOpen = !UI.fOpen; render(); return; }
    /* clearing empties the filters but leaves the panel as the reader left it */
    if(a === 'fClear'){ UI.shown = null; UI.flt = null; listState(); render(); return; }
    if(a === 'dirDim'){ UI.dirDim = d.v; render(); return; }
    if(a === 'dirTab'){ UI.dirTab = d.v; render(); return; }
    if(a === 'openDrawer'){ UI.drawer = true; render(); return; }
    if(a === 'closeDrawer'){ UI.drawer = false; render(); return; }
    if(a === 'more'){ UI.shown = (UI.shown || PAGE_STEP) + PAGE_STEP; render(); return; }
    /* ---- the garment browser. A changed question starts the list again at
       the top, so the answer is not hidden below a page the reader already
       scrolled past. ---- */
    if(a === 'gbSeg' || a === 'gbFit'){
      const g = UI.gb; if(!g) return;
      const k = a === 'gbSeg' ? 'seg' : 'fit';
      const i = g[k].indexOf(d.v);
      i < 0 ? g[k].push(d.v) : g[k].splice(i, 1);
      g.shown = GB_STEP; render(); return; }
    if(a === 'gbWt'){ const g = UI.gb; if(!g) return;
      g.wt = g.wt === d.v ? '' : d.v; g.shown = GB_STEP; render(); return; }
    if(a === 'gbQClr'){ const g = UI.gb; if(!g) return;
      g.q = ''; g.shown = GB_STEP; render(); return; }
    if(a === 'gbClr'){ const g = UI.gb; if(!g) return;
      g.q = ''; g.seg = []; g.fit = []; g.wt = ''; g.shown = GB_STEP; render(); return; }
    if(a === 'gbMore'){ const g = UI.gb; if(!g) return;
      g.shown = (g.shown || GB_STEP) + GB_STEP; render(); return; }
    /* a different kind of garment is a different list: the search and the
       filters from the last one would silently narrow it */
    if(a === 'gbPick' || a === 'gbUnpick'){
      const g = UI.gb; if(!g) return;
      g.pick = a === 'gbPick' ? d.v : '';
      g.q = ''; g.seg = []; g.fit = []; g.wt = ''; g.shown = GB_STEP;
      render();
      /* the answer replaces the question in place, so put the reader at it */
      const el = $('every'); if(el) el.scrollIntoView({block:'start'});
      return; }

    if(a === 'carouPrev' || a === 'carouNext'){
      const t = $(d.c + '-t'); if(!t) return;
      const card = t.querySelector('.pcard');
      const step = card ? card.getBoundingClientRect().width + 20 : 320;
      t.scrollBy({left:(a === 'carouNext' ? 1 : -1) * step * 2, behavior:'smooth'});
      return;
    }
    if(a === 'doSearch'){ const el = $('q'); UI.q = el ? el.value : ''; go('public','search'); return; }

    /* --- quote basket --- */
    if(a === 'addToQuote'){ addToQuote(d.id); return; }
    if(a === 'artHelp'){
      const p = by(S.merchProducts, d.id);
      UI.cfg = UI.cfg || {}; UI.cfg.artHelp = true;
      openModal({title:'Request help with this item',
        sub:p ? esc(p.name) + ' · your configuration is kept' : '',
        body:`<div class="stack">
          <p class="t-sm">What help do you need? Your colour, quantity and placements stay on the request.</p>
          <div class="chip-row">
            ${['Preparing a logo file','Adapting existing artwork','Choosing a placement','Discussing a new design']
              .map(x => `<span class="chip">${x}</span>`).join('')}
          </div>
          <p class="t-xs muted">Any chargeable design work is scoped and approved before it starts. We do not
            offer free original design or unlimited revisions.</p></div>`,
        actions:`<button class="btn btn--quiet" data-act="closeModal">Close</button>
          <button class="btn btn--primary" data-go="public:merchhelp">Describe what you need</button>`});
      return; }
    if(a === 'askEarlier'){ modalStub('Ask about an earlier date',
      'An earlier date is assessed against production capacity and material availability for your configuration, so it is a question rather than an option to select. Add the date you need to your quote request and we will answer it with the quote.'); return; }
    if(a === 'qRemove'){
      const l = (UI.quote || [])[+d.i]; if(!l) return;
      UI.quote.splice(+d.i, 1); render();
      toast('Removed from your quote', esc(l.productName) + ' is no longer in the request.');
      return; }
    if(a === 'qDup'){
      const l = (UI.quote || [])[+d.i]; if(!l) return;
      UI.quote.splice(+d.i + 1, 0, JSON.parse(JSON.stringify(l))); render(); return; }
    if(a === 'qEdit'){
      const l = (UI.quote || [])[+d.i]; if(!l) return;
      UI.cfg = JSON.parse(JSON.stringify(l.cfg)); UI.editLine = +d.i;
      go('public','product', l.product); return; }
    if(a === 'qcFixed'){ UI.qc = UI.qc || {}; UI.qc.noDate = !UI.qc.noDate; render(); return; }
    if(a === 'qcNext'){ if(collectContact()) go('public','qreview'); return; }
    /* Read the form before sending it. submitQuoteRequest works from the
       contact details already collected, and nothing collected them: the only
       button that does sits on a review page no link reaches, so the request
       button on the contact page called a function that returned on its first
       line and said nothing. Collecting here also keeps the review page
       working — with no fields on screen it keeps what was collected before. */
    if(a === 'qSubmit'){ if(collectContact()) submitQuoteRequest(); return; }
    /* This offered account access and then said it was not built, while the
       action that opens one sat finished a few hundred lines away. Without an
       account the request has nowhere to be read: the studio prices it and the
       customer never sees the figure. */
    if(a === 'openMerchAcc'){
      const d0 = UI.qDone || {};
      openModal({title:'Set up account access',
        sub:d0.ref ? 'Request ' + esc(d0.ref) : '',
        body:`<div class="stack">
          <p class="t-sm muted">Your request is saved either way. An account is where you read the price when
            we send it, and where the next one starts from what we already know.</p>
          <label class="field"><span class="field-l">Work email</span>
            <input class="inp" id="acEmail" type="email" value="${esc(d0.email || '')}"></label>
          <label class="field"><span class="field-l">Company</span>
            <input class="inp" id="acCompany" type="text" value="${esc(d0.company || '')}"></label></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Not now</button>
          <button class="btn btn--primary" data-act="acCreate">Open my account</button>`});
      return; }

    /* --- assisted enquiries --- */
    if(a === 'advToggle'){ UI.advOpen = !UI.advOpen; render();
      if(UI.advOpen) requestAnimationFrame(() => {
        const f = document.querySelector('#adv input'); if(f) f.focus({preventScroll:true});
      });
      return; }
    if(a === 'advCall'){ UI.advCall = !UI.advCall; render(); return; }
    if(a === 'advSubmit'){ assistedEnquiry('advice', ['adv_name','adv_email','adv_co','adv_msg']); return; }
    if(a === 'helpSubmit'){ assistedEnquiry('help', ['h_name','h_email','h_co','h_msg']); return; }
    if(a === 'contactSubmit'){ assistedEnquiry('contact', ['c_name','c_email','c_co','c_msg']); return; }
    if(a === 'cSvc'){ UI.cSvc = d.v; render(); return; }
    if(a === 'askSample'){ modalStub('Ask about a sample',
      'Sample availability, cost and timing differ per product, so this is a request rather than a price. Tell us the product and quantity you are considering and we will confirm what is available.'); return; }
    if(a === 'cookieStub'){ modalStub('Cookie settings',
      'The published control records a choice per category and lets it be withdrawn as easily as it was given. The categories are generated from what the live site actually loads.'); return; }
    if(a === 'briefSector'){ UI.answers = UI.answers || {}; UI.answers['Sector'] = (sectorById(d.s) || {}).n || '';
      UI.formStep = 0; go('public','form'); return; }
    if(a === 'briefCase'){ UI.answers = UI.answers || {}; UI.caseCtx = d.c;
      UI.formStep = 0; go('public','form'); return; }
    if(a === 'carou'){
      const track = actEl.closest('.carou')?.querySelector('[data-carou-track]');
      if(track) carouMove(track, Number(d.d) || 1);
      return; }
    if(a === 'dOpen'){ const c = UI.cfg || (UI.cfg = {}); c.open = c.open === d.v ? null : d.v; render(); return; }
    /* the question mark: it carries its own action, so the card beneath it is
       not selected by the same click */
    if(a === 'gInfo'){ UI.gInfo = UI.gInfo === d.v ? null : d.v; render(); return; }
    if(a === 'cfgView'){ const c = UI.cfg; if(!c) return; c.view = d.v; render(); return; }
    if(a === 'cfgSplitOpen'){ const c = UI.cfg; if(!c) return;
      const wasOpen = !!(c.splitOpen || splitTotal(c));
      c.splitOpen = !wasOpen;
      /* closing it puts the quantity back in their hands rather than leaving
         a hidden split still deciding it */
      if(wasOpen) delete c.split;
      render(); return; }
    if(a === 'cfgSplitClear'){ const c = UI.cfg; if(!c) return;
      delete c.split; c.splitOpen = true; render(); return; }
    if(a === 'dGender' || a === 'dFit' || a === 'dSku'){
      const c = UI.cfg || (UI.cfg = {});
      c.open = null;
      /* an answer higher up can invalidate the garment chosen below it */
      if(a === 'dGender'){ c.g = d.v; c.f = null; c.sku = null; }
      else if(a === 'dFit'){ c.f = d.v; c.sku = null; }
      else { c.sku = d.v; }
      render(); return; }
    if(a === 'bGender'){ const b = buildState(); b.gender = d.v; b.fit = b.weight = b.style = b.colour = b.method = null; render(); return; }
    if(a === 'bFit'){    const b = buildState(); b.fit = d.v;    b.weight = b.style = b.colour = b.method = null; render(); return; }
    if(a === 'bWeight'){ const b = buildState(); b.weight = d.v; b.style = b.colour = b.method = null;
      const only = buildPool(b, 3); if(only.length === 1) b.style = only[0].id;
      render(); return; }
    if(a === 'bStyle'){  const b = buildState(); b.style = d.v;  b.colour = b.method = null; render(); return; }
    if(a === 'bColour'){ const b = buildState(); b.colour = d.v; render(); return; }
    if(a === 'bMethod'){ const b = buildState(); b.method = d.v; render(); return; }
    if(a === 'bReset'){  UI.build = {cat: buildState().cat}; render(); return; }
    /* The finder narrows to a product; the quantity, the placements and the
       size run are chosen on the product page and it never collected any of
       them — so "Add to quote" here read the configuration that page builds,
       found nothing, and threw on the first field. It hands the answers over
       instead, and the product page opens already holding them. */
    if(a === 'bConfigure'){
      const b = buildState();
      const p = by(S.merchProducts, b.style); if(!p) return;
      const cols = p.colours || [], meths = p.pers || [], poss = p.pos || [];
      /* The finder counts fits across the whole product, so it can offer a fit
         that exists only in a cut other than the one chosen — carried over as
         a pair, that lands the product page on a question with no answers. So
         each answer is kept only while it still leaves a garment to choose. */
      let g = b.gender || null, f = b.fit || null;
      if(g && f && !demoOptions(p, g, f).length) f = null;
      if(g && !demoOptions(p, g, null).length) g = null;
      UI.cfg = {id:p.id, g:g, f:f, sku:null,
        colour:cols.includes(b.colour) ? b.colour : cols[0],
        qty:p.moq || 1,
        placements:[{pos:poss[0], method:meths.includes(b.method) ? b.method : meths[0],
                     size:'small', colours:1, art:null}], open:null};
      UI.editLine = null; UI.drawer = false;
      go('public', 'product', p.id); return; }
    if(a === 'merchCat'){ UI.merchCat = d.cat; render(); return; }
    if(a === 'mailStub'){ modalStub('hello@pamuuc.com',
      'In the live site this is a mail link. Here it stays inside the prototype so nothing opens a mail client you did not ask for.'); return; }
    if(a === 'legalStub'){ modalStub(d.k,
      'Legal pages are drafted outside this prototype. The footer carries the links so the structure and the crawl path are right from the start.'); return; }
    if(a === 'cfgColour'){ UI.cfg.colour = d.c; render(); return; }
    if(a === 'cfgMethod'){ UI.cfg.method = d.m;
      const p = by(S.merchProducts, UI.cfg.id);
      if(!p.pos.includes(UI.cfg.pos)) UI.cfg.pos = p.pos[0];
      render(); return; }
    if(a === 'cfgPos'){ UI.cfg.pos = d.p; render(); return; }
    if(a === 'cfgQtyTier'){ UI.cfg.qty = +d.q; render(); return; }
    if(a === 'pdpTab'){ UI.pdpTab = d.t; render(); return; }
    if(a === 'addPlace'){
      const p = by(S.merchProducts, UI.cfg.id);
      const free = p.pos.find(x => !UI.cfg.placements.some(y => y.pos === x));
      if(free) UI.cfg.placements.push({pos:free, method:p.pers[0], size:'small', colours:1, art:null});
      render(); return;
    }
    if(a === 'rmPlace'){ UI.cfg.placements.splice(+d.i,1); render(); return; }
    if(a === 'togglePlace'){
      const p = by(S.merchProducts, UI.cfg.id);
      const ix = UI.cfg.placements.findIndex(x => x.pos === d.p);
      if(ix > -1){ if(UI.cfg.placements.length > 1) UI.cfg.placements.splice(ix,1); }
      else if(UI.cfg.placements.length < 3)
        UI.cfg.placements.push({pos:d.p, method:p.pers[0], size:'small', colours:1, art:null});
      render(); return;
    }
    if(a === 'mHelp'){ UI.mHelp = !UI.mHelp; render(); return; }
    if(a === 'qPres'){ UI.quotePres = !UI.quotePres; render();
      toast(UI.quotePres ? 'Branded presentation added' : 'Branded presentation removed',
        UI.quotePres ? 'It is listed on your request — nothing is charged here.'
                     : 'Removed from your request.'); return; }
    if(a === 'plMethod'){ UI.cfg.placements[+d.i].method = d.m;
      if(d.m !== 'screen') UI.cfg.placements[+d.i].colours = 1; render(); return; }
    if(a === 'plSize'){ UI.cfg.placements[+d.i].size = d.z; render(); return; }
    if(a === 'plColours'){ UI.cfg.placements[+d.i].colours = +d.n; render(); return; }
    if(a === 'plArtClear'){ UI.cfg.placements[+d.i].art = null; render(); return; }
    if(a === 'plArt'){
      const i = +d.i;
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.ai,.eps,.pdf,.svg,.png,.jpg,.jpeg';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if(f){ UI.cfg.placements[i].art = f.name; toast('Artwork attached', f.name); render(); }
      });
      inp.click(); return;
    }
    if(a === 'acCreate'){
      const email = $('acEmail') ? $('acEmail').value.trim() : '';
      const company = $('acCompany') ? $('acCompany').value.trim() : '';
      if(!email || !/@/.test(email)){ if($('acEmail')) $('acEmail').classList.add('inp--err');
        toast('A work email, please', 'It is how we send the quote and the proof.'); return; }
      const acc = act.openMerchAccount(company || email.split('@')[1], email);
      closeModal(); go('account','merchandise');
      return;
    }
    if(a === 'addCw'){ act.addColourway(d.g, d.c); (UI.dirty = UI.dirty||{})[d.g] = true; render(); return; }
    if(a === 'rmCw'){ act.removeColourway(d.g, d.cw); (UI.dirty = UI.dirty||{})[d.g] = true; render(); return; }
    if(a === 'discardCr'){ delete UI.dirty[d.g]; render(); return; }
    if(a === 'submitCr'){
      const g = garment(d.g);
      act.submitChangeRequest({project:d.p, garment:d.g, account:user(SESSION.user).account,
        title:`Quantity and colour changes on ${g.name}`,
        reason:'Submitted from the project workspace.',
        changes:g.colourways.map(c => ({field:'Colourway — ' + COLOURS[c.colour].name, was:'previous', now:c.qty + ' pieces'}))});
      delete UI.dirty[d.g]; render(); return;
    }
    if(a === 'reqRename'){ modalRequest('rename', {p:d.p, pos:d.pos}); return; }
    if(a === 'reqGarment'){ modalRequest('garment', {p:d.p, pos:d.pos}); return; }
    if(a === 'reqColour'){ modalRequest('colour', {g:d.g, p:garment(d.g).project}); return; }
    if(a === 'rqSubmit'){
      const val = $('rqval') ? $('rqval').value : '';
      const why = $('rqwhy') ? $('rqwhy').value : '';
      if(!val.trim()){ $('rqval').classList.add('inp--err'); return; }
      const p = project(d.p || garment(d.g).project);
      const pos = d.pos ? p.positions.find(x => x.id === d.pos) : null;
      const titles = {rename:`Rename position "${pos?pos.name:''}" to "${val}"`,
        garment:`Add a garment to ${pos?pos.name:''}: ${val}`, colour:`Add a colour: ${val}`};
      const changes = d.kind === 'rename' ? [{field:'Position name', was:pos.name, now:val}]
        : d.kind === 'garment' ? [{field:'Garments in ' + (pos?pos.name:''), was:String(pos?pos.garments.length:0), now:String((pos?pos.garments.length:0)+1) + ' (requested)'}]
        : [{field:'Colourway', was:'—', now:val}];
      const cr = {project:p.id, garment:d.g || null, account:user(SESSION.user).account,
        title:titles[d.kind], reason:why || 'No reason given.', changes};
      if(d.kind === 'rename') cr.applyPositionName = {was:pos.name, now:val};
      act.submitChangeRequest(cr);
      closeModal(); render(); return;
    }

    /* --- approvals, fittings, meetings --- */
    if(a === 'openApproval'){ modalApproval(d.id); return; }
    if(a === 'apDecide'){
      const c = $('apcomment') ? $('apcomment').value : '';
      if(d.d !== 'approve' && !c.trim()){
        $('apcomment').classList.add('inp--err'); $('apcomment').focus();
        toast('Tell us why', 'A change or a no needs a reason we can act on.'); return; }
      act.decideApproval(d.id, d.d, c);
      closeModal(); render(); return;
    }
    if(a === 'approveG'){
      const t = $('fb_' + d.g); act.approveGarment(d.g, t ? t.value : ''); render(); return; }
    if(a === 'changesG'){
      const t = $('fb_' + d.g);
      if(!t || !t.value.trim()){ if(t){ t.classList.add('inp--err'); t.focus(); } toast('Tell us what to change','We need the detail to make the next sample right.'); return; }
      act.requestGarmentChanges(d.g, t.value); render(); return;
    }
    if(a === 'acceptSlot'){ act.acceptSlot(d.m, d.s); render(); return; }
    if(a === 'altSlot'){ act.requestAlternative(d.m, 'None of the proposed times work for the spa team.'); render(); return; }
    if(a === 'approveSpec'){
      toast('Specification approved','A locked production snapshot now exists. The pro forma is the next gate.');
      render(); return; }
    if(a === 'confirmReceipt'){ toast('Receipt confirmed','Thank you — recorded against the shipment.'); return; }
    if(a === 'reportIssue'){ modalStub('Report an issue','An issue opens a conversation thread linked to the shipment, with an owner and a resolution state.'); return; }

    /* --- documents --- */
    if(a === 'openDoc'){ modalDoc(d.id); return; }
    if(a === 'payDoc'){ act.payDocument(d.id); closeModal(); render(); return; }
    if(a === 'declarePay'){
      const r = $('payref'); act.declarePayment(d.id, r ? r.value : '');
      closeModal(); render(); return; }
    if(a === 'pubDoc'){ act.publishDocument(d.id); render(); return; }
    if(a === 'docTab'){ UI.docTab = d.t; render(); return; }

    /* --- reorders --- */
    if(a === 'startReorder'){ modalReorder(d.g); return; }
    if(a === 'roQty'){ return; }
    if(a === 'roSubmit'){
      const lines = [...document.querySelectorAll('[data-act="roQty"]')]
        .map(i => ({cw:i.dataset.cw, qty:+i.value||0})).filter(l => l.qty > 0);
      if(!lines.length){ toast('Enter a quantity','Tell us how many of each colour you need.'); return; }
      act.submitReorder(d.g, lines, $('rodest') ? $('rodest').value : '');
      closeModal(); render(); return;
    }

    /* --- messaging --- */
    if(a === 'send'){
      const box = $('msgbox');
      if(!box || !box.value.trim()) return;
      act.sendMessage(d.cv, box.value, d.internal === '1');
      render(); return;
    }
    if(a === 'openCv'){ UI.openCv = d.id; render(); return; }
    if(a === 'openMail'){ UI.mailOpen = d.id; render(); return; }
    if(a === 'sendDigest'){
      const groups = [...new Set((S.digest || []).map(m => m.account || ''))];
      let n = 0;
      groups.forEach(g => { if(act.sendDigest(g || null)) n++; });
      render();
      toast(n ? 'Summaries sent' : 'Nothing to send',
        n ? `${n} message${n===1?'':'s'} went out, one per account.` : 'No updates are waiting.');
      return; }
    if(a === 'openDraft'){ UI.draftOpen = d.id; render(); return; }
    if(a === 'draftSave' || a === 'draftSend'){
      const m = (S.drafts || []).find(x => x.id === d.id); if(!m) return;
      if($('dsubj')) m.subject = $('dsubj').value.trim() || m.subject;
      if($('dbody')) m.lines = $('dbody').value.split(/\n\s*\n/).map(l => l.trim()).filter(Boolean);
      if(a === 'draftSave'){ save(); render(); toast('Saved', 'It stays here until you send it.'); return; }
      S.drafts = S.drafts.filter(x => x.id !== d.id);
      m.state = 'sent'; m.at = nowStamp();
      S.outbox.unshift(m);
      UI.draftOpen = null;
      emit('mail.sent', {account:m.account || null, text:`Message sent: ${m.subject}`,
        audit:'Customer message sent', record:m.id, was:'draft', now:'sent'});
      /* an inquiry that was holding for this message is now genuinely theirs */
      (S.inquiries || []).forEach(i => {
        if(i.awaitingSend && i.slots && i.email === m.to){
          i.awaitingSend = false; i.state = 'waiting_customer';
        }
      });
      save(); render(); toast('Sent', 'It is in Sent, and they can answer from it.'); return; }
    if(a === 'draftDrop'){
      const m = (S.drafts || []).find(x => x.id === d.id); if(!m) return;
      S.drafts = S.drafts.filter(x => x.id !== d.id); UI.draftOpen = null;
      emit('mail.dropped', {account:m.account || null, text:`Message not sent: ${m.subject}`,
        audit:'Customer message withheld', record:m.id, was:'draft', now:'withheld'});
      save(); render(); toast('Not sent', 'Nothing left the studio.'); return; }
    if(a === 'cvFilter'){ UI.cvFilter = d.t; render(); return; }
    if(a === 'markRead'){ act.markRead(user(SESSION.user).side); render(); return; }
    if(a === 'nFilter'){ UI.nFilter = d.t; render(); return; }

    /* --- studio: the catalogue, edited --- */
    if(a === 'mpSave'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      const v = (i) => { const el = $(i); return el ? el.value.trim() : null; };
      const num = (i) => { const x = v(i); return x === null || x === '' ? null : Number(x); };
      const set = (k, x) => { if(x !== null) p2[k] = x; };
      set('name', v('mpName')); set('ref', v('mpRef')); set('handle', v('mpHandle'));
      set('cat', v('mpCat')); set('glyph', v('mpGlyph')); set('status', v('mpStatus'));
      set('lead', v('mpLead')); set('country', v('mpCountry')); set('weight', v('mpWeight'));
      set('desc', v('mpDesc')); set('materials', v('mpMaterials'));
      set('care', v('mpCare')); set('prov', v('mpProv'));
      const moq = num('mpMoq'); if(moq) p2.moq = moq;
      p2.quoteOnly = !!($('mpQuote') && $('mpQuote').checked);
      if($('mpImgSrc')) S.imageSource = $('mpImgSrc').value;
      if($('mpSizes')) p2.sizes = $('mpSizes').value.split(/\n/).map(x => x.trim()).filter(Boolean);
      /* the ladder, read back in order and cleaned of anything unusable */
      const ladder = [];
      for(let i = 0; $('mpQty' + i); i++){
        const q = Number($('mpQty' + i).value), pr = Number($('mpPrice' + i).value);
        if(q > 0 && pr >= 0) ladder.push({qty:q, price:+pr.toFixed(2)});
      }
      ladder.sort((x, y) => x.qty - y.qty);
      if(ladder.length){ p2.breaks = ladder; p2.from = ladder[0].price; p2.quoteOnly = p2.quoteOnly || false; }
      else { p2.breaks = []; p2.from = null; p2.quoteOnly = true; }
      emit('merch.product_edited', {text:`${p2.name} edited`, customerVisible:false,
        notify:'studio', kind:'update', notifyText:`Catalogue: ${p2.name} updated`,
        audit:'Merchandise product edited', record:p2.ref, was:'—', now:p2.status || 'published'});
      save(); render(); toast('Saved', 'The website reads this immediately.'); return; }
    if(a === 'mpAddBreak'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      const last = (p2.breaks || [])[(p2.breaks || []).length - 1];
      p2.breaks = (p2.breaks || []).concat([{qty:last ? last.qty * 2 : 1, price:last ? last.price : 0}]);
      save(); render(); return; }
    if(a === 'mpDropBreak'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      p2.breaks = (p2.breaks || []).filter((_, i) => i !== +d.i);
      save(); render(); return; }
    if(a === 'mpColour' || a === 'mpMethod' || a === 'mpPos'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      const key = a === 'mpColour' ? 'colours' : a === 'mpMethod' ? 'pers' : 'pos';
      const list = p2[key] = p2[key] || [];
      const at = list.indexOf(d.v);
      if(at > -1) list.splice(at, 1); else list.push(d.v);
      save(); render(); return; }
    if(a === 'mpVariant'){ UI.vOpen = UI.vOpen === d.sku ? null : d.sku; render(); return; }
    if(a === 'mpVariantSave'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      const m = (p2.matrix || []).find(x => x.sku === d.sku); if(!m) return;
      const i = d.i, g = (n) => { const el = $(n + i); return el ? el.value.trim() : null; };
      const was = m.sku;
      if(g('vSku')) m.sku = g('vSku');
      if(g('vG') !== null) m.g = g('vG');
      if(g('vF') !== null) m.f = g('vF');
      if(g('vW') !== null) m.w = g('vW');
      if($('vSizes' + i)) m.sizes = $('vSizes' + i).value.split(/\n/).map(x => x.trim()).filter(Boolean);
      const ladder = [];
      for(let b = 0; $('vQty' + i + '_' + b); b++){
        const q = Number($('vQty' + i + '_' + b).value), pr = Number($('vPrice' + i + '_' + b).value);
        if(q > 0 && pr >= 0) ladder.push({qty:q, price:+pr.toFixed(2)});
      }
      ladder.sort((x, y) => x.qty - y.qty);
      m.breaks = ladder; m.price = ladder.length ? ladder[0].price : null;
      m.quoteOnly = !ladder.length;
      /* addresses written by hand; an empty one goes back to the convention */
      m.images = m.images || {};
      (m.colours || []).forEach((c, ci) => {
        const el = $('vImg' + i + '_' + ci); if(!el) return;
        const val = el.value.trim();
        if(val) m.images[c] = {'studio-01':val}; else delete m.images[c];
      });
      if(was !== m.sku && UI.vOpen === was) UI.vOpen = m.sku;
      emit('merch.variant_edited', {text:`${m.sku} edited`, customerVisible:false,
        audit:'Merchandise variant edited', record:m.sku, was, now:m.sku});
      save(); render(); toast('Saved', `${m.sku} updated.`); return; }
    if(a === 'mpAddVBreak' || a === 'mpDropVBreak'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      const m = (p2.matrix || []).find(x => x.sku === d.sku); if(!m) return;
      if(a === 'mpAddVBreak'){
        const last = (m.breaks || [])[(m.breaks || []).length - 1];
        m.breaks = (m.breaks || []).concat([{qty:last ? last.qty * 2 : 1, price:last ? last.price : 0}]);
      } else m.breaks = (m.breaks || []).filter((_, i) => i !== +d.i);
      save(); render(); return; }
    if(a === 'mpDropColour'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      const m = (p2.matrix || []).find(x => x.sku === d.sku); if(!m) return;
      m.colours = (m.colours || []).filter(c => c !== d.v);
      if(m.images) delete m.images[d.v];
      /* a colour no garment carries is not a colour the product has */
      const still = (p2.matrix || []).some(x => (x.colours || []).includes(d.v));
      if(!still) p2.colours = (p2.colours || []).filter(c => c !== d.v);
      save(); render(); return; }
    if(a === 'mpDropVariant'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      if((p2.matrix || []).length <= 1){
        toast('That is the last variant', 'A product with no garments cannot be configured or priced.'); return; }
      p2.matrix = (p2.matrix || []).filter(x => x.sku !== d.sku);
      p2.colours = (p2.colours || []).filter(c => p2.matrix.some(x => (x.colours || []).includes(c)));
      UI.vOpen = null;
      emit('merch.variant_removed', {text:`${d.sku} removed from ${p2.name}`, customerVisible:false,
        audit:'Merchandise variant removed', record:d.sku, was:'in catalogue', now:'removed'});
      save(); render(); toast('Removed', `${d.sku} is no longer in the catalogue.`); return; }
    if(a === 'mpAddVariant'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      const like = (p2.matrix || [])[0] || {};
      const n = (p2.matrix || []).length + 1;
      const m = {sku:(p2.ref || 'PM') + '-NEW-' + n, g:like.g || 'U', f:like.f || 'regular',
        w:like.w || '', colours:[], sizes:(like.sizes || []).slice(),
        pers:(p2.pers || []).slice(), pos:(p2.pos || []).slice(),
        breaks:[], price:null, quoteOnly:true, images:{}};
      p2.matrix = (p2.matrix || []).concat([m]);
      UI.vOpen = m.sku;
      save(); render(); toast('Variant added', 'Give it a code, a ladder and its colours.'); return; }

    if(a === 'mpGarment'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      const m = (p2.matrix || []).find(x => x.sku === d.sku); if(!m) return;
      const shots = (m.colours || []).map(c => ({c, name:(COLOURS[c]||{}).name || c,
        has:!!garmentPhoto(m.sku, c, 'studio-01', true)}));
      openModal({title:esc(m.sku), sub:`${esc(CUT_FOR[m.g] || m.g || '')} · ${esc(m.f || '')} · ${esc(m.w || '?')} g/m²`,
        body:`<div class="stack">
          <div class="grid grid-2 gap-md">
            <label class="field"><span class="field-l">Cloth weight (g/m²)</span>
              <input class="inp" id="mgW" value="${esc(m.w || '')}"></label>
            <label class="field"><span class="field-l">Fit</span>
              <input class="inp" id="mgF" value="${esc(m.f || '')}"></label>
          </div>
          <h4 class="t-h5">Price ladder</h4>
          <div class="stack-2">${(m.breaks||[]).map((b, i) => `
            <div class="row" style="gap:8px;align-items:center">
              <input class="inp" id="mgQty${i}" type="number" value="${b.qty}" style="width:6.5rem">
              <span class="t-xs muted">at</span>
              <input class="inp" id="mgPrice${i}" type="number" step="0.01" value="${b.price}" style="width:7.5rem">
            </div>`).join('') || '<p class="t-sm muted">Quoted by hand.</p>'}</div>
          <h4 class="t-h5">Photographs</h4>
          <p class="t-xs muted">The file each colour resolves to on the studio's image host. A colour with no
            shot falls back to its flat packshot, and then to the placeholder.</p>
          <div class="stack-2">${shots.map(x => `
            <div class="factline"><span>${esc(x.name)}</span>
              <span class="t-xs ${x.has?'':'muted'}">${esc(m.sku)}_${esc(x.name.replace(/ /g,'_'))}_studio-01.jpg
                ${x.has ? '' : ' · missing'}</span></div>`).join('')}</div>
        </div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--primary" data-act="mpGarmentSave" data-id="${p2.id}" data-sku="${esc(m.sku)}">Save this garment</button>`});
      return; }
    if(a === 'mpGarmentSave'){
      const p2 = by(S.merchProducts, d.id); if(!p2) return;
      const m = (p2.matrix || []).find(x => x.sku === d.sku); if(!m) return;
      if($('mgW')) m.w = $('mgW').value.trim();
      if($('mgF')) m.f = $('mgF').value.trim();
      const ladder = [];
      for(let i = 0; $('mgQty' + i); i++){
        const q = Number($('mgQty' + i).value), pr = Number($('mgPrice' + i).value);
        if(q > 0 && pr >= 0) ladder.push({qty:q, price:+pr.toFixed(2)});
      }
      if(ladder.length){ ladder.sort((x, y) => x.qty - y.qty); m.breaks = ladder; m.price = ladder[0].price; }
      emit('merch.garment_edited', {text:`${m.sku} edited`, customerVisible:false,
        audit:'Merchandise garment edited', record:m.sku, was:'—', now:'saved'});
      closeModal(); save(); render(); toast('Saved', `${m.sku} updated.`); return; }

    /* --- studio: offering times for the first call --- */
    if(a === 'inqOffer'){
      const i = by(S.inquiries, d.id); if(!i) return;
      const slots = nextSlots();
      openModal({title:'Offer times for the first call',
        sub:esc(i.company),
        body:`<div class="stack">
          <p class="t-sm muted">${esc(i.contact || i.company)} gets these four to choose from. Whichever they
            take becomes the call — nobody has to agree a time by reply.</p>
          <div class="stack-2">${slots.map((w, n) => `
            <label class="field field--row"><input type="checkbox" id="slot${n}" checked>
              <span>${esc(slotLabel(w))}</span></label>`).join('')}</div></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--primary" data-act="inqOfferDo" data-id="${i.id}"
            data-w="${esc(slots.join('|'))}">Send the invitation</button>`});
      return; }
    if(a === 'inqOfferDo'){
      const all = String(d.w || '').split('|').filter(Boolean);
      const keep = all.filter((w, n) => { const el = $('slot' + n); return !el || el.checked; });
      if(!keep.length){ toast('Pick at least one time', 'They need something to choose from.'); return; }
      act.proposeSlots(d.id, keep); closeModal(); render();
      toast('Invitation sent', 'It is in Communications, and they can answer from it.'); return; }

    /* --- the customer answering from a notification --- */
    if(a === 'pickSlot'){
      act.takeSlot(d.id, d.v);
      const n = S.notifications.find(x => x.choices && x.choices.id === d.id && !x.answered);
      if(n){ n.answered = d.v; n.read = true; }
      render(); toast('Booked', 'We have sent you a confirmation.'); return; }

    /* --- studio: merchandise quotes --- */
    if(a === 'mqPrice'){
      const q = by(S.merchQuotes, d.id); if(!q) return;
      const suggested = q.quotedUnit || q.unit || '';
      openModal({title:'Send the price',
        sub:`${q.qty} × ${esc(q.productName)}`,
        body:`<div class="stack">
          <p class="t-sm muted">${q.unit
            ? 'The site already showed a price for this configuration. Confirm it or set your own.'
            : 'This one is priced by hand, so the customer has not seen a figure yet.'}</p>
          <label class="field"><span class="field-l">Price per piece</span>
            <input class="inp" id="mqunit" type="number" min="0" step="0.01" value="${suggested}"
              aria-label="Price per piece"></label>
          <label class="field"><span class="field-l">Note to the customer (optional)</span>
            <textarea class="inp" id="mqnote" placeholder="Setup and delivery are included at this quantity."></textarea></label></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--primary" data-act="mqPriceDo" data-id="${q.id}">Send the price</button>`});
      return; }
    if(a === 'mqPriceDo'){
      act.priceMerchQuote(d.id, $('mqunit') ? $('mqunit').value : '', $('mqnote') ? $('mqnote').value : '');
      closeModal(); render();
      toast('Price sent', 'The customer can see it on their quote and in their account.'); return; }
    if(a === 'mqWon'){ act.closeMerchQuote(d.id, 'won'); render();
      toast('Confirmed', 'It moves to the confirmed list below.'); return; }
    if(a === 'mqLost'){
      const q = by(S.merchQuotes, d.id); if(!q) return;
      openModal({title:'Close without an order',
        sub:`${q.qty} × ${esc(q.productName)}`,
        body:`<div class="stack"><p class="t-sm muted">The customer is told it is closed, not why. The reason stays here.</p>
          <label class="field"><span class="field-l">Internal reason</span>
            <textarea class="inp" id="mqreason" placeholder="Went elsewhere on lead time."></textarea></label></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--danger" data-act="mqLostDo" data-id="${q.id}">Close it</button>`});
      return; }
    if(a === 'mqLostDo'){
      act.closeMerchQuote(d.id, 'lost', $('mqreason') ? $('mqreason').value : '');
      closeModal(); render(); return; }
    if(a === 'mqReopen'){ act.reopenMerchQuote(d.id); render();
      toast('Reopened', 'It is back in the open list.'); return; }

    /* --- studio: inquiries --- */
    if(a === 'inqAccept'){ act.qualifyInquiry(d.id,'accept'); render(); return; }
    if(a === 'inqDecline'){
      openModal({title:'Decline this inquiry',
        body:`<div class="stack"><p class="t-sm muted">We reply either way. The internal reason and the customer message are separate records.</p>
          <label class="field"><span class="field-l">Internal reason</span>
            <textarea class="inp" id="decreason" placeholder="Below minimum quantity and outside lead time."></textarea></label></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--danger" data-act="inqDeclineDo" data-id="${d.id}">Decline and notify</button>`});
      return;
    }
    if(a === 'inqDeclineDo'){
      act.qualifyInquiry(d.id,'decline', $('decreason') ? $('decreason').value : '');
      closeModal(); render(); return;
    }
    if(a === 'inqInfo'){ act.qualifyInquiry(d.id,'more_info'); render(); return; }
    if(a === 'inqSchedule'){
      openModal({title:'Schedule the first discovery call',
        body:`<div class="stack"><p class="t-sm muted">An account is not opened before this call happens.</p>
          <label class="field"><span class="field-l">When</span>
            <input class="inp" type="datetime-local" id="callwhen" value="2026-09-18T11:00"></label></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--primary" data-act="inqScheduleDo" data-id="${d.id}">Schedule</button>`});
      return;
    }
    if(a === 'inqScheduleDo'){
      act.scheduleCall(d.id, ($('callwhen').value || '').replace('T',' '));
      closeModal(); render(); return;
    }
    if(a === 'inqComplete'){
      openModal({title:'Record the discovery call',
        body:`<div class="stack">
          <p class="t-sm muted">Structured notes are required before an inquiry can be marked ready for an account. This is the gate that stops a form submission becoming an operational commitment.</p>
          <label class="field"><span class="field-l">Objectives, roles, people, style, services, timing, budget, constraints</span>
            <textarea class="inp" id="discnotes" style="min-height:140px" placeholder="What they actually need, and what they think they need."></textarea></label></div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--primary" data-act="inqCompleteDo" data-id="${d.id}">Mark discovery complete</button>`});
      return;
    }
    if(a === 'inqCompleteDo'){
      const n = $('discnotes').value;
      if(!n.trim()){ $('discnotes').classList.add('inp--err'); return; }
      act.completeCall(d.id, n); closeModal(); render(); return;
    }
    if(a === 'inqActivate'){
      const acc = act.activateAccount(d.id);
      closeModal(); go('studio','customer',acc.id);
      toast('Account activated','Now create the project. Activation and project creation are two separate recorded actions.');
      return;
    }

    /* --- studio: projects --- */
    if(a === 'prjTab'){ UI.prjTab = d.t; render(); return; }
    /* Choosing a step is choosing the journey, so it puts away whichever
       across-the-project view was open. */
    if(a === 'prjStep'){ UI.prjStep = d.s; UI.prjStepFor = d.p || ROUTE.param; UI.prjTab = null; render(); return; }
    if(a === 'custTab'){ UI.custTab = d.t; render(); return; }
    if(a === 'publish'){ act.publishProject(d.p); render(); return; }
    if(a === 'advance'){
      const p = project(d.p);
      if(gateBlockers(p).length){ modalOverride(d.p); return; }
      act.advanceStage(d.p); render(); return;
    }
    if(a === 'override'){ modalOverride(d.p); return; }
    if(a === 'mvStage'){ modalMoveStage(d.p); return; }
    if(a === 'mvStageDo'){
      const pick = document.querySelector('input[name="mvstage"]:checked');
      if(!pick){ toast('Pick a step', 'Choose where the project should go.'); return; }
      const r = $('mvreason') ? $('mvreason').value : '';
      const p2 = project(d.p);
      const kind = p2 && STAGE_MOVE.kindOf(p2, pick.value);
      if(kind && STAGE_MOVE.needsReason(kind) && !r.trim()){
        $('mvreason').classList.add('inp--err'); $('mvreason').focus();
        toast('A reason is required', 'Anything other than a plain advance is recorded with why.'); return; }
      act.setStage(d.p, pick.value, r); closeModal(); render(); return;
    }
    if(a === 'overrideDo'){
      const r = $('ovreason').value;
      if(!r.trim()){ $('ovreason').classList.add('inp--err'); return; }
      act.advanceStage(d.p, r); closeModal(); render(); return;
    }
    if(a === 'crDecide'){
      const notes = {approved:'Accepted in full.', partially_approved:'Accepted in part — see the revision.',
        clarification:'We have asked a question in the project conversation.', declined:'We cannot accept this as specified.'};
      act.decideChangeRequest(d.id, d.o, notes[d.o]); render(); return;
    }
    if(a === 'crIncorporate'){ act.incorporateChangeRequest(d.id); render(); return; }
    if(a === 'authRound'){ act.authoriseRound(d.g); render(); return; }
    if(a === 'readyFit'){ act.readyForFitting(d.g); render(); return; }
    if(a === 'resolveG'){ modalResolve(d.g); return; }
    if(a === 'resolveDo'){
      const sel = document.querySelector('input[name="res"]:checked');
      const reason = $('resreason').value;
      if(!sel){ toast('Choose a resolution','One of the three options must be selected.'); return; }
      if(!reason.trim()){ $('resreason').classList.add('inp--err'); return; }
      act.resolveException(d.g, sel.value, reason); closeModal(); render(); return;
    }
    /* --- studio: building the project ------------------------------------ */
    if(a === 'addPos'){ modalPosition(d.p, null); return; }
    if(a === 'editPos'){ modalPosition(d.p, d.pos); return; }
    if(a === 'posSave'){
      const nm = $('pos_name').value.trim();
      if(!nm){ $('pos_name').classList.add('inp--err'); $('pos_name').focus(); return; }
      const people = $('pos_people').value;
      if(d.pos) act.updatePosition(d.p, d.pos, {name:nm, people});
      else act.addPosition(d.p, nm, people);
      closeModal(); render(); return;
    }
    if(a === 'rmPos'){
      const p = project(d.p); const pos = p.positions.find(x => x.id === d.pos);
      openModal({title:'Remove ' + (pos ? pos.name : 'this position'),
        sub:pos && pos.garments.length ? `${pos.garments.length} garment${pos.garments.length>1?'s come':' comes'} out with it` : '',
        body:`<div class="stack">
          <p class="t-sm muted">Every garment on this position is removed from the project too.</p>
          <label class="field" style="margin:0"><span class="field-l">Reason <span class="faint">(optional)</span></span>
            <textarea class="inp" id="rm_reason" placeholder="The spa opens in phase two — this position moves to its own project."></textarea></label>
        </div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--danger" data-act="rmPosDo" data-p="${d.p}" data-pos="${d.pos}">Remove it</button>`});
      return;
    }
    if(a === 'rmPosDo'){
      act.removePosition(d.p, d.pos, $('rm_reason') ? $('rm_reason').value.trim() : '');
      closeModal(); render(); return;
    }

    if(a === 'addGarment'){
      const b = S.bases.find(x => x.status === 'active');
      UI.gd = {project:d.p, position:d.pos, base:b ? b.id : null,
        name:'', fabric:b ? b.fabrics[0] : null, method:b ? b.pers[0] : null,
        pos:b ? b.pos[0] : null, colours:b ? [b.colours[0]] : [],
        unitPrice:'', summary:'', notes:'', editing:null};
      modalGarment(); return;
    }
    if(a === 'gEdit'){
      const g = garment(d.g); if(!g) return;
      UI.gd = {project:g.project, position:g.position, base:g.base, name:g.name,
        fabric:g.fabric, method:g.pers.method, pos:g.pers.pos,
        colours:g.colourways.map(c => c.colour),
        unitPrice:g.unitPrice != null ? g.unitPrice : '',
        summary:g.summary || '', notes:g.notes || '', editing:g.id};
      modalGarment(); return;
    }
    if(a === 'gdBase'){
      readGD(); const b = base(d.b); if(!b) return;
      UI.gd.base = b.id;
      if(!b.fabrics.includes(UI.gd.fabric)) UI.gd.fabric = b.fabrics[0];
      if(!b.pers.includes(UI.gd.method))    UI.gd.method = b.pers[0];
      if(!b.pos.includes(UI.gd.pos))        UI.gd.pos = b.pos[0];
      UI.gd.colours = (UI.gd.colours || []).filter(c => b.colours.includes(c));
      if(!UI.gd.colours.length) UI.gd.colours = [b.colours[0]];
      modalGarment(); return;
    }
    if(a === 'gdColour'){
      readGD();
      const list = UI.gd.colours = UI.gd.colours || [];
      const ix = list.indexOf(d.c);
      if(ix > -1){ if(list.length > 1) list.splice(ix,1); } else list.push(d.c);
      modalGarment(); return;
    }
    if(a === 'gdNewFabric'){ readGD(); modalFabric(true); return; }
    if(a === 'gdBack'){ modalGarment(); return; }
    if(a === 'gdSave'){
      readGD(); const gd = UI.gd; if(!gd || !gd.base) return;
      if(gd.editing){
        act.updateGarment(gd.editing, {
          name:gd.name || base(gd.base).name, fabric:gd.fabric,
          pers:{method:gd.method, pos:gd.pos},
          unitPrice:gd.unitPrice, summary:gd.summary, notes:gd.notes});
        /* colourways follow the colours that are ticked, and keep the
           quantities already entered against the ones that stay */
        const g = garment(gd.editing);
        g.colourways = g.colourways.filter(c => gd.colours.includes(c.colour));
        gd.colours.forEach(c => { if(!g.colourways.some(x => x.colour === c))
          g.colourways.push({id:uid('cw'), colour:c, qty:0, sizes:{}}); });
        save();
      } else {
        act.addGarment(gd.project, gd.position, gd);
      }
      UI.gd = null; closeModal(); render(); return;
    }
    if(a === 'gRemove'){ modalRemoveG(d.g); return; }
    if(a === 'gRemoveDo'){
      const g = garment(d.g);
      const reason = $('rm_reason') ? $('rm_reason').value.trim() : '';
      if(g && g.state === 'approved' && !reason){
        $('rm_reason').classList.add('inp--err'); $('rm_reason').focus();
        toast('A reason is needed', 'This garment was approved by the customer.'); return; }
      act.removeGarment(d.g, reason); closeModal(); render(); return;
    }
    if(a === 'gPrice'){
      const g = garment(d.g); if(!g) return;
      openModal({title:'Price — ' + g.name, sub:`${garmentPieces(g)} pieces as scoped`,
        body:`<div class="stack">
          <label class="field" style="margin:0"><span class="field-l">Price to the customer, per piece</span>
            <span class="field-h">Typed in, not calculated. Leave it empty and the customer sees “price to follow”.</span>
            <input class="inp" type="number" min="0" step="0.01" id="gp_price" value="${g.unitPrice != null ? g.unitPrice : ''}"></label>
        </div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
          <button class="btn btn--primary" data-act="gPriceDo" data-g="${g.id}">Save</button>`});
      return;
    }
    if(a === 'gPriceDo'){
      act.updateGarment(d.g, {unitPrice:$('gp_price').value}); closeModal(); render(); return; }

    /* --- images --- */
    if(a === 'gImages'){ modalImages(d.g); return; }
    if(a === 'gAddImage'){
      const cap = $('im_cap') ? $('im_cap').value.trim() : '';
      pickImage(true, (list) => {
        list.forEach((im, i) => act.addImage('garment', d.g, {src:im.src, cap:i === 0 ? cap : '', tag:'Reference'}));
        modalImages(d.g); render();
      });
      return;
    }
    if(a === 'gRmImage'){ act.removeImage('garment', d.g, d.im); modalImages(d.g); render(); return; }
    if(a === 'addBoard'){
      pickImage(true, (list) => {
        list.forEach(im => act.addImage('project', d.p, {src:im.src, cap:'', tag:'Board'}));
        render();
      });
      return;
    }
    if(a === 'rmBoard'){ act.removeImage('project', d.p, d.im); render(); return; }

    /* --- fabrics --- */
    if(a === 'newFabric'){ modalFabric(false); return; }
    if(a === 'fbSave'){
      const nm = $('fb_name').value.trim();
      if(!nm){ $('fb_name').classList.add('inp--err'); $('fb_name').focus(); return; }
      const bases = Array.from(document.querySelectorAll('.fb-base:checked')).map(x => x.value);
      const f = act.addFabric({name:nm, ref:$('fb_ref').value.trim(), spec:$('fb_spec').value.trim(),
        prov:$('fb_prov').checked, bases});
      if(d.back){
        /* came from the garment editor: put the new fabric on this base and select it */
        if(UI.gd && UI.gd.base){ act.addFabricToBase(UI.gd.base, f.id); UI.gd.fabric = f.id; }
        modalGarment();
      } else { closeModal(); }
      render(); return;
    }

    /* --- design work --- */
    if(a === 'addDesign'){ UI.dzImgs = []; UI.dzFile = null; UI.dzTitle = UI.dzBy = UI.dzNote = ''; modalDesign(d.p); return; }
    if(a === 'dzPickFile'){
      UI.dzTitle = $('dz_title').value; UI.dzBy = $('dz_by').value; UI.dzNote = $('dz_note').value;
      pickFile('application/pdf', (f) => { UI.dzFile = f; modalDesign(d.p); });
      return;
    }
    if(a === 'dzDropFile'){
      UI.dzTitle = $('dz_title').value; UI.dzBy = $('dz_by').value; UI.dzNote = $('dz_note').value;
      UI.dzFile = null; modalDesign(d.p); return;
    }
    if(a === 'dlDoc'){
      const dd = doc(d.id); if(!dd) return;
      const f = docFile(dd);
      downloadFile(f.name, f.src);
      return;
    }
    if(a === 'pvImg'){
      const p2 = project(d.p); if(!p2) return;
      const z = (p2.designs || []).find(x => x.id === d.dz);
      const im = z && (z.images || [])[+d.i];
      if(im) modalFile(im.cap || z.title, im.src, esc(z.title) + ' · ' + esc(z.by), '');
      return;
    }
    if(a === 'pvFile'){
      const p2 = project(d.p); if(!p2) return;
      const z = (p2.designs || []).find(x => x.id === d.dz);
      if(z && z.file) modalFile(z.file.name, z.file.src,
        `${esc(z.title)} · ${esc(z.by)}${z.file.size ? ' · ' + fileSize(z.file.size) : ''}`,
        `<button class="btn btn--primary" data-act="dlFile" data-dz="${esc(z.id)}" data-p="${esc(p2.id)}">Download</button>`);
      return;
    }
    if(a === 'dlFile'){
      const p2 = project(d.p); if(!p2) return;
      const z = (p2.designs || []).find(x => x.id === d.dz);
      if(z && z.file) downloadFile(z.file.name, z.file.src);
      return;
    }
    if(a === 'dzAddImages'){
      UI.dzTitle = $('dz_title').value; UI.dzBy = $('dz_by').value; UI.dzNote = $('dz_note').value;
      pickImage(true, (list) => {
        UI.dzImgs = (UI.dzImgs || []).concat(list.map(im => ({id:uid('im'), src:im.src, cap:''})));
        modalDesign(d.p);
      });
      return;
    }
    if(a === 'dzSave'){
      const t = $('dz_title').value.trim();
      if(!t){ $('dz_title').classList.add('inp--err'); $('dz_title').focus(); return; }
      act.addDesign(d.p, {title:t, by:$('dz_by').value.trim() || 'Design partner',
        note:$('dz_note').value.trim(), gate:$('dz_gate').value || null,
        images:UI.dzImgs || [], file:UI.dzFile || null});
      UI.dzImgs = []; UI.dzFile = null; closeModal(); render(); return;
    }
    if(a === 'pubDesign'){ act.publishDesign(d.p, d.dz); render(); return; }
    if(a === 'rmDesign'){ act.removeDesign(d.p, d.dz); render(); return; }

    /* --- money --- */
    if(a === 'addLine'){ modalLine(d.p); return; }
    if(a === 'lnSave'){
      const l = $('ln_label').value.trim();
      if(!l){ $('ln_label').classList.add('inp--err'); $('ln_label').focus(); return; }
      act.addLine(d.p, {label:l, amount:$('ln_amount').value, note:$('ln_note').value.trim()});
      closeModal(); render(); return;
    }
    if(a === 'rmLine'){ act.removeLine(d.p, d.l); render(); return; }
    if(a === 'addMs'){ modalMilestone(d.p, null); return; }
    if(a === 'editMs'){ modalMilestone(d.p, d.m); return; }
    if(a === 'msSave'){
      const l = $('ms_label').value.trim();
      if(!l){ $('ms_label').classList.add('inp--err'); $('ms_label').focus(); return; }
      const patch = {label:l, amount:$('ms_amount').value, due:$('ms_due').value || null,
        stage:$('ms_stage').value || null, kind:$('ms_kind').value, what:$('ms_what').value.trim()};
      if(d.m) act.updateMilestone(d.p, d.m, patch); else act.addMilestone(d.p, patch);
      closeModal(); render(); return;
    }
    if(a === 'rmMs'){ act.removeMilestone(d.p, d.m); render(); return; }
    if(a === 'pubMs'){ act.publishMilestone(d.p, d.m); render(); return; }

    /* --- asking for a decision --- */
    if(a === 'askAny'){ modalAsk(d.p, null); return; }
    if(a === 'askProposal'){ modalAsk(d.p, null); return; }
    if(a === 'gAsk'){ const g = garment(d.g); modalAsk(g.project, g.id); return; }
    if(a === 'akSend'){
      const t = $('ak_title').value.trim();
      if(!t){ $('ak_title').classList.add('inp--err'); $('ak_title').focus(); return; }
      act.requestDecision(d.p, {title:t, summary:$('ak_sum').value.trim(),
        target:d.g || null, due:$('ak_due').value || null});
      closeModal(); render(); return;
    }
    if(a === 'pullDecision'){ act.withdrawDecision(d.id); render(); return; }
    if(a === 'editNote'){ modalNote(d.p); return; }
    if(a === 'pnSave'){
      const p = project(d.p);
      p.proposal = p.proposal || {note:'', publishedAt:null, version:0};
      p.proposal.note = $('pn_note').value;
      act.touch(p); save(); closeModal(); render(); return;
    }

    if(a === 'newProject'){ UI.build = null; modalBuilder(d.acc, 1); return; }
    /* A project belongs to an account, and the Projects page had no way to say
       which — so starting one meant knowing to go via Customers. Ask here. */
    if(a === 'newProjectPick'){
      const accs = S.accounts.filter(x => x.status === 'active');
      if(!accs.length){ modalStub('No accounts yet',
        'A project belongs to a customer account. Open one from a qualified inquiry first.'); return; }
      if(accs.length === 1){ UI.build = null; modalBuilder(accs[0].id, 1); return; }
      openModal({title:'Which account is this for?',
        body:`<div class="stack-2">${accs.map(x => `
          <button class="rw" data-act="newProject" data-acc="${x.id}" style="border:1px solid var(--line);padding:12px">
            <span class="rw-main"><span class="rw-t">${esc(x.name)}</span>
              <span class="rw-s">${esc(x.city || '')}${x.country?' · '+esc(x.country):''}</span></span>
            <span class="rw-side"><span class="t-xs faint">Start →</span></span></button>`).join('')}</div>`,
        foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>`});
      return; }
    if(a === 'bStep'){
      const b = UI.build;
      if($('bname')) b.name = $('bname').value;
      if($('btarget')) b.target = $('btarget').value;
      if($('bbrief')) b.brief = $('bbrief').value;
      if($('bdesign')) b.design = $('bdesign').checked;
      modalBuilder(b.account, +d.s); return;
    }
    if(a === 'bAddPos'){ UI.build.positions.push({name:'',people:'',garments:[]}); modalBuilder(UI.build.account, 2); return; }
    if(a === 'bGarment'){
      const p = UI.build.positions[+d.i];
      p.garments = p.garments || [];
      const ix = p.garments.indexOf(d.b);
      if(ix > -1) p.garments.splice(ix,1); else p.garments.push(d.b);
      modalBuilder(UI.build.account, 3); return;
    }
    if(a === 'bPublish'){
      const p = act.createProject(UI.build);
      UI.build = null; UI.prjTab = 'Build'; closeModal(); go('studio','project',p.id);
      toast('Project created as a draft',
        'Add garments, images, prices and payment steps. The customer sees it when you publish.');
      return;
    }

    if(a === 'openBase'){ UI.openBase = d.id; render(); return; }
    if(a === 'newBase'){ modalStub('New Pamuuc Base','Creates a base with its fabrics, colours, personalisation options, size system, construction attributes and costing inputs, at version 1 in Draft.'); return; }
    if(a === 'openImport'){ UI.importResult = null; modalImport(); return; }
    if(a === 'csvCheck'){
      const box = $('csvbox');
      if(!box || !box.value.trim()){ toast('Nothing to check', 'Paste the CSV contents or drop the file.'); return; }
      UI.importResult = validateCatalogue(box.value);
      modalImport(); return;
    }
    if(a === 'csvBack'){ UI.importResult = null; modalImport(); return; }
    if(a === 'csvCommit'){
      const v = UI.importResult;
      if(!v || !v.ok) return;
      act.importCatalogue(v);
      UI.importResult = null; closeModal(); render(); return;
    }
    if(a === 'csvImport'){ UI.importResult = null; modalImport(); return; }
    if(a === 'newProduct'){ modalStub('New merchandise product','Creates a product with variants, colourways, minimums, price rules, personalisation compatibility, artwork requirements and lead time, in Draft.'); return; }
    if(a === 'inviteStaff'){ modalStub('Invite an internal user','Sends an invitation, assigns one or more role templates and optionally scopes access to named customers or projects.'); return; }
    if(a === 'inviteUser'){ modalStub('Invite a colleague','Account administrators can invite people from their own company and choose whether each one sees all projects or only named ones.'); return; }
    if(a === 'billFilter'){ UI.billFilter = d.t; render(); return; }
    if(a === 'openItem'){
      if(d.kind === 'approval'){ modalApproval(d.id); return; }
      if(d.kind === 'document'){ modalDoc(d.id); return; }
      if(d.kind === 'fitting' || d.kind === 'meeting'){ go('account','project',d.project); return; }
      go('account','project',d.project); return;
    }
    return;
  }

  if(goEl){
    const [surface, page, param, sub] = goEl.dataset.go.split(':');
    /* leaving a section resets its transient tab state */
    UI.menu = false; UI.drawer = false; MODAL = null;
    if(page !== 'project'){ UI.prjTab = null; UI.prjStep = null; UI.prjStepFor = null; }
    if(page !== 'customer') UI.custTab = null;
    go(surface, page, param, sub);
  }
});

/* live inputs */
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-act]');
  if(!el) return;
  const a = el.dataset.act, d = el.dataset;
  if(a === 'setQty'){ act.setColourwayQty(d.g, d.cw, el.value); (UI.dirty = UI.dirty||{})[d.g] = true;
    const g = garment(d.g); const cw = g.colourways.find(c=>c.id===d.cw);
    const box = el.closest('.cw').querySelector('.t-xs');
    if(box) box.innerHTML = cwSum(cw) === cw.qty
      ? `<span class="sum-ok">Size split sums to ${cw.qty}</span>`
      : `<span class="sum-bad">Size split sums to ${cwSum(cw)}, quantity is ${cw.qty}</span>`;
    return; }
  if(a === 'setSize'){ act.setSize(d.g, d.cw, d.s, el.value); render(); return; }
  if(a === 'cfgQty'){ UI.cfg.qty = +el.value||0; render(); return; }
  /* typed into as you go — render() carries the caret back to #gbq */
  if(a === 'gbQ'){ const g = UI.gb; if(!g) return;
    g.q = el.value; g.shown = GB_STEP; render(); return; }
  /* One size's quantity. The total is derived from the split, so this is the
     only place the number is entered — render() carries the caret back. */
  if(a === 'cfgSize'){
    const c = UI.cfg; if(!c) return;
    c.split = c.split || {};
    const n = Math.max(0, Math.floor(+el.value) || 0);
    if(n > 0) c.split[d.s] = n; else delete c.split[d.s];
    if(!Object.keys(c.split).length){ delete c.split; }
    render(); return; }
  if(a === 'dQty'){ setLineQty(+d.i, +el.value); return; }
  if(a === 'cfgQtyExact'){
    /* an empty box is not a quantity: leave the last one standing so they can
       clear it and retype. `change` below settles whatever they leave behind. */
    if(!el.value.trim()) return;
    const v = Math.max(1, Math.floor(+el.value) || 1);
    if(v === UI.cfg.qty) return;
    UI.cfg.qty = v;
    /* the tiers, the rate, the ticket and the estimate all price off this
       number, so it has to re-render; render() carries the caret across */
    render();
    return; }
  if(a === 'roQty'){
    const g = garment(document.querySelector('[data-act="roSubmit"]').dataset.g);
    const total = [...document.querySelectorAll('[data-act="roQty"]')].reduce((t,i)=>t+(+i.value||0),0);
    const el2 = $('rototal'); if(el2) el2.textContent = money(total * (g.unitPrice||0));
    return; }
  if(a === 'bpos'){ UI.build.positions[+d.i][d.f] = el.value; return; }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act]');
  if(!el) return;
  const a = el.dataset.act;
  if(a === 'ovPick'){
    /* a select fires change, never click — a control registered only in the
       click dispatcher is a dead control, which this build has shipped before */
    const r = $('ovrreason') ? $('ovrreason').value : '';
    if(!r.trim()){
      $('ovrreason').classList.add('inp--err'); $('ovrreason').focus();
      toast('A reason is required', 'Every override is recorded with why.'); render(); return; }
    act.overrideState(el.dataset.kind, el.dataset.id, el.value, r);
    render(); return;
  }
  if(a === 'pickFabric'){ act.setFabric(el.dataset.g, el.value); render(); return; }
  if(a === 'baseAddFab'){ if(el.value){ act.addFabricToBase(el.dataset.b, el.value); render(); } return; }
  if(a === 'dQty'){ setLineQty(+el.dataset.i, +el.value); return; }
  if(a === 'gbSort'){ const g = UI.gb; if(!g) return;
    g.sort = el.value; g.shown = GB_STEP; render(); return; }
  if(a === 'setCountry'){
    /* the country decides whether a VAT number is asked for at all, so this
       has to re-render — and it has to be on change, not click */
    UI.answers = UI.answers || {};
    readCompanyFields();
    UI.answers['Country'] = el.value;
    render(); return;
  }
  if(a === 'cfgQtyExact'){
    /* whatever they left in the box becomes a real quantity here */
    const p = by(S.merchProducts, UI.cfg.id);
    const min = p && !p.quoteOnly ? (p.moq || 1) : 1;
    const v = Math.max(min, Math.floor(+el.value) || min);
    if(v !== UI.cfg.qty){ UI.cfg.qty = v; render(); } else if(String(v) !== el.value){ el.value = v; }
    return; }
  if(a === 'qcSet'){ UI.qc = UI.qc || {}; UI.qc[el.dataset.f] = el.value; return; }
  if(a === 'fSort'){ listState().sort = el.value; UI.shown = null; render(); return; }
  /* Where a placement goes. It is a <select>, so it never reached the click
     dispatcher its three siblings use — the control drew, disabled the
     positions already taken, and then did nothing at all when you chose one. */
  if(a === 'plPos'){
    const c = UI.cfg; if(!c || !c.placements) return;
    const pl = c.placements[+el.dataset.i]; if(!pl) return;
    if(c.placements.some((x, n) => n !== +el.dataset.i && x.pos === el.value)) return;
    pl.pos = el.value; render(); return; }
});

/* One project open at a time, and the photograph belongs to whichever it is.
   `toggle` does not bubble, so this listens in the capture phase rather than
   binding to every <details> on each render. */
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if(!d.classList || !d.classList.contains('case') || !d.open) return;
  document.querySelectorAll('.case[open]').forEach(x => { if(x !== d) x.open = false; });
  const c = CASES.find(x => x.id === d.dataset.c);
  const box = document.getElementById('workfig');
  if(!c || !box) return;
  const img = box.querySelector('img');
  if(img){ img.src = workPhoto(c); img.alt = c.alt || c.title; }
  const cap = box.querySelector('.cap');
  if(cap) cap.innerHTML = `<b>${esc(c.tag)}</b><span>${esc(c.link)}</span>`;
}, true);

document.addEventListener('keydown', (e) => {
  briefKey(e);
  if(e.key === 'Escape' && MODAL){ closeModal(); return; }
  if(e.key === 'Escape' && UI.drawer){ UI.drawer = false; render(); }
});

window.addEventListener('hashchange', () => {
  const r = readHash();
  if(r.surface !== ROUTE.surface || r.page !== ROUTE.page || r.params.id !== ROUTE.params.id){
    ROUTE = r; render();
  }
});


/* ============================================================================
   SEO and GEO

   Search engines and answer engines want two different things and this does
   both in one place, on every render.

   SEO — a unique title and description per page, a canonical URL, Open Graph
   and Twitter cards so a shared link renders, a robots directive that allows
   large image previews and uncapped snippets, and JSON-LD describing what
   the page actually is.

   GEO — an answer engine cites what it can lift cleanly and attribute. So
   every article states its answer in one block near the top ("The short
   answer"), marked up as `speakable`; every page carries an explicit
   publisher, author and date; the FAQ is real question-and-answer markup
   rather than prose; and nothing load-bearing is hidden behind an
   interaction. Structured data is emitted for the thing the page is, never
   for content that is not on it.
   ========================================================================= */

const SITE = {
  name:'PAMUUC Studio',
  legal:'Pamuk Studio S.L',
  origin:'https://pamuuc-studio.com',
  logo:'https://pamuuc-studio.com/assets/images/favicon-icon.png',
  city:'Barcelona', country:'ES',
  email:'info@pamuuc.com',
  sameAs:['https://pamuuc.com'],
};

/* Slugs follow the keyword research's own architecture for the merchandise
   tree, so the prototype's canonicals match the pages that will be built. */
const MERCH_SLUG = {
  'T-shirts':'t-shirts', 'Polos':'polo-shirts', 'Shirts':'shirts',
  'Sweatshirts':'sweatshirts', 'Outerwear':'jackets', 'Pants & shorts':'joggers-and-shorts',
};
const merchSlug = (cat) => MERCH_SLUG[cat] || String(cat || '').toLowerCase()
  .replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

const canonicalFor = (r) => {
  /* English sits at the root. A language segment marks a TRANSLATION, so /en/
     would be a second address for pages that already live at /. */
  const o = SITE.origin, M = o + '/merchandise';
  if(r.page === 'custom' || r.page === 'home') return o + '/';
  if(r.page === 'blog')  return o + '/blog/';
  if(r.page === 'post')  return o + '/blog/' + (r.params.id || '') + '/';
  if(r.page === 'merch')       return M + '/';
  if(r.page === 'products')    return M + '/products/';
  if(r.page === 'collections') return M + '/collections/';
  if(r.page === 'collection')  return M + '/' + merchSlug(catFromSlug(r.params.id) || r.params.id) + '/';
  if(r.page === 'product'){
    const pr = by(S.merchProducts, r.params.id);
    if(!pr) return M + '/products/';
    /* The supplied handles are category-shaped ("t-shirts" inside T-shirts),
       so the product slug comes from its name instead: it cannot collide with
       the category above it, and it carries the term people search for. */
    return M + '/' + merchSlug(pr.cat) + '/' + merchSlug(pr.name) + '/';
  }
  if(r.page === 'method')    return M + '/personalisation/';
  if(r.page === 'howto')     return M + '/how-to-order/';
  if(r.page === 'quote')     return M + '/quote/';
  if(r.page === 'build')     return M + '/find-a-product/';
  if(r.page === 'merchhelp') return M + '/help/';
  return o + '/';
};

function setMeta(sel, attr, key, val){
  let el = document.head.querySelector(sel);
  if(!el){ el = document.createElement(sel.split('[')[0]); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute(sel.startsWith('link') ? 'href' : 'content', val);
}

function orgNode(){
  return {'@type':'Organization', '@id':SITE.origin + '/#organization',
    name:SITE.name, legalName:SITE.legal, url:SITE.origin + '/',
    email:SITE.email, sameAs:SITE.sameAs,
    logo:{'@type':'ImageObject', url:SITE.logo},
    address:{'@type':'PostalAddress', addressLocality:SITE.city, addressCountry:SITE.country},
    areaServed:['ES','EU'],
    knowsAbout:['Custom uniforms','Hotel uniforms','Hospitality uniforms','Uniform design',
      'Workwear fabric selection','Industrial laundry compatibility','Garment fitting']};
}

/* ---- merchandise titles and descriptions --------------------------------
   Every merchandise page used to inherit the uniforms title and canonicalise
   to the homepage, so eighteen product pages declared themselves the same URL.

   The lead terms come from the September 2026 keyword study: "branded
   merchandise" and "custom t shirts" from the 250 curated terms, the rest from
   the 750-term discovery set. Descriptions are BUILT FROM THE CATALOGUE rather
   than written out, so a weight span or colour count cannot drift away from
   what the page actually shows, and nothing is claimed that the data does not
   hold — the study's own rule. */
const MERCH_TITLE = {
  merch:       'Branded merchandise for companies',
  products:    'Branded apparel catalogue for companies',
  collections: 'Branded apparel by product family',
  method:      'Personalisation by product and artwork',
  howto:       'How to order branded merchandise',
  quote:       'Build a merchandise request for review',
  build:       'Find the right branded garment',
  merchhelp:   'Help choosing branded merchandise',
};
const CAT_TITLE = {
  'T-shirts':'Custom T-shirts for companies',
  'Polos':'Branded polo shirts for companies',
  'Shirts':'Branded shirts for companies',
  'Sweatshirts':'Personalised sweatshirts and hoodies',
  'Outerwear':'Branded jackets and outerwear',
  'Pants & shorts':'Branded joggers, trousers and shorts',
};
const METHOD_WORD = {embroidery:'embroidery', screen:'screen print',
                     dtf:'DTF transfer', dtg:'direct-to-garment'};

/* the facts a description can safely state, read off the products themselves */
/* The supplied product copy runs to about 410 characters, and 327 of those are
   the same four sentences on all eighteen: choose gender, fit, weight, colour
   and size; one placement is included; extras are separate; price depends on
   quantity. Every one of those is demonstrated by the page itself a few
   centimetres below — the journey, the quote ticket, the bracket cards. So the
   page keeps the opening sentence, which says what the garment is and who it
   is for, and lets the rest of the page do the explaining.

   Done at render rather than in the data: the next catalogue import brings the
   same boilerplate back, and this way it never reaches the page. */
/* A second sentence built from the garment itself. It names the cuts, the fits
   and the decoration in words — things the page expresses as controls further
   down, which a search engine cannot read — and deliberately repeats nothing
   from the meta line above it (reference, weight, colours, minimum). */
const SEG_WORD  = {U:'unisex', W:"women's", M:"men's", K:"kids'", B:'baby'};
const SEG_ORDER = ['U','W','M','K','B'];
/* the same ladder the filters and the journey use — "fitted" became slim */
const FIT_WORD  = {regular:'regular', fitted:'slim', relaxed:'relaxed', heavy:'oversized'};
const FIT_ORDER = ['regular','fitted','relaxed','heavy'];
const DECO_WORD = {embroidery:'embroidered', screen:'screen printed',
                   dtf:'DTF printed', dtg:'direct-to-garment printed'};
function joinWords(xs, last){
  if(!xs.length) return '';
  if(xs.length === 1) return xs[0];
  return xs.slice(0, -1).join(', ') + ' ' + (last || 'and') + ' ' + xs[xs.length - 1];
}
function specSentence(p){
  const segs = [], fits = [], decos = [];
  (p.matrix || []).forEach(m => {
    if(m.g && !segs.includes(m.g)) segs.push(m.g);
    if(m.f && !fits.includes(m.f)) fits.push(m.f);
    (m.pers || []).forEach(k => {
      if(DECO_WORD[k] && !decos.includes(k) && !methodQuoteOnly(S.decoRates, k)) decos.push(k);
    });
  });
  const g = SEG_ORDER.filter(k => segs.includes(k)).map(k => SEG_WORD[k]);
  const f = FIT_ORDER.filter(k => fits.includes(k)).map(k => FIT_WORD[k]);
  const d = Object.keys(DECO_WORD).filter(k => decos.includes(k)).map(k => DECO_WORD[k]);
  const out = [];
  if(g.length){
    out.push('Made in ' + joinWords(g) + (g.length === 1 ? ' cut' : ' cuts')
      + (f.length ? (f.length === 1 ? ', in a ' + f[0] + ' fit' : ', in ' + joinWords(f) + ' fits') : '') + '.');
  } else if(f.length){
    out.push(f.length === 1 ? 'Made in a ' + f[0] + ' fit.' : 'Made in ' + joinWords(f) + ' fits.');
  }
  if(d.length) out.push(joinWords(d.slice(0, 3), 'or').replace(/^./, c => c.toUpperCase()) + ' to your artwork.');
  return out.join(' ');
}

function leadSentence(t){
  const x = String(t || '').trim();
  if(!x) return '';
  const m = x.match(/^[^.!?]*[.!?]/);
  const first = m ? m[0].trim() : x;
  /* a one-word opener is not a sentence worth keeping alone */
  return first.split(/\s+/).length < 4 ? x : first;
}

function merchFacts(list){
  const ws = [], ms = new Set(), cols = new Set();
  let from = Infinity;
  (list || []).forEach(p => (p.matrix || []).forEach(m => {
    if(+m.w) ws.push(+m.w);
    (m.pers || []).forEach(k => { if(METHOD_WORD[k] && !methodQuoteOnly(S.decoRates, k)) ms.add(k); });
    (m.colours || []).forEach(c => cols.add(c));
    if(m.price != null) from = Math.min(from, m.price);
  }));
  return {
    n: (list || []).length,
    gsm: ws.length ? (Math.min(...ws) + '–' + Math.max(...ws) + ' g/m²') : '',
    colours: cols.size,
    methods: [...ms].map(k => METHOD_WORD[k]),
    from: from < Infinity ? from : null,
  };
}
function methodSentence(ms){
  if(!ms.length) return '';
  const x = ms.slice(0, 3);
  const t = x.length === 1 ? x[0] : x.slice(0, -1).join(', ') + ' or ' + x[x.length - 1];
  return t[0].toUpperCase() + t.slice(1);   /* it always starts a sentence */
}
/* a description is cut around 155 characters, so build to fit and stop */
function fit(parts, max){
  let out = '';
  for(const t of parts){
    if(!t) continue;
    const next = out ? out + ' ' + t : t;
    if(next.length > max) break;
    out = next;
  }
  return out;
}

/* what the page is, said in the vocabulary a crawler and an answer engine
   both read. Only ever describes what is actually rendered. */
function seoFor(r){
  const url = canonicalFor(r);
  const graph = [orgNode(), {'@type':'WebSite', '@id':SITE.origin + '/#website',
    url:SITE.origin + '/', name:SITE.name,
    publisher:{'@id':SITE.origin + '/#organization'}, inLanguage:'en'}];

  /* a title is cut around 60 characters in a result and a description around
     155, so both are written to fit rather than trimmed by the engine */
  let title = 'Custom uniforms for hotels and hospitality | ' + SITE.name;
  let desc  = 'Custom uniforms developed around your roles, working conditions and brand. Six stages, each ending in an approval you give, and a specification we archive.';
  let image = SITE.origin + '/assets/images/hero-desktop.webp';

  const MERCH_PAGES = ['merch','products','collections','collection','product',
                       'method','howto','quote','build','merchhelp'];
  if(r.surface === 'public' && MERCH_PAGES.includes(r.page)){
    const all = S.merchProducts || [];
    if(r.page === 'product'){
      const pr = by(all, r.params.id);
      if(pr){
        const f = merchFacts([pr]);
        title = pr.name + ' | ' + SITE.name;
        desc = fit([
          pr.name + ',' + (f.gsm ? ' ' + f.gsm + ',' : '') +
            (f.colours ? ' ' + f.colours + ' colours.' : ''),
          methodSentence(f.methods) + (f.methods.length ? '.' : ''),
          f.from != null ? 'From ' + money(f.from) + ' per piece, minimum one.'
                         : 'Priced on request.',
          'Reviewed before production.'], 155);
        graph.push(crumbNode([['Merchandise', SITE.origin + '/merchandise/'],
                              [pr.cat, SITE.origin + '/merchandise/' + merchSlug(pr.cat) + '/'],
                              [pr.name, url]]));
      }
    } else if(r.page === 'collection'){
      /* the route carries the slug ("t-shirts"), not the display name, so it
         has to be resolved the same way the page resolves it — keyed on the
         display name this produced a "t-shirts" title and "0 products" */
      const cat = catFromSlug(r.params.id) || r.params.id;
      const list = all.filter(x => x.cat === cat);
      const f = merchFacts(list);
      title = (CAT_TITLE[cat] || cat) + ' | ' + SITE.name;
      desc = fit([
        f.n + ' ' + (f.n === 1 ? 'product' : 'products') +
          (f.gsm ? ', ' + f.gsm : '') + (f.colours ? ', ' + f.colours + ' colours.' : '.'),
        methodSentence(f.methods) + (f.methods.length ? '.' : ''),
        f.from != null ? 'From ' + money(f.from) + ' per piece, minimum one.' : '',
        'Every request is reviewed before production.'], 155);
      graph.push(crumbNode([['Merchandise', SITE.origin + '/merchandise/'], [cat, url]]));
    } else {
      const f = merchFacts(all);
      title = (MERCH_TITLE[r.page] || 'Branded merchandise') + ' | ' + SITE.name;
      if(r.page === 'merch' || r.page === 'products' || r.page === 'collections'){
        desc = fit([
          'Custom apparel for company merchandise:',
          'T-shirts, polos, sweatshirts, hoodies, jackets and joggers.',
          methodSentence(f.methods) + (f.methods.length ? '.' : ''),
          'Minimum one piece, reviewed before production.'], 155);
      } else if(r.page === 'method'){
        desc = fit(['Which personalisation a garment carries, and why.',
          methodSentence(f.methods) + (f.methods.length ? ',' : ''),
          'matched to the cloth and the artwork you supply.',
          'Reviewed before production.'], 155);
      } else if(r.page === 'quote'){
        desc = fit(['Build a merchandise request and send it for review.',
          'Nothing is charged on the site and no card is asked for.',
          'A quote comes back, usually within one working day.'], 155);
      } else if(r.page === 'howto'){
        desc = fit(['From choosing a garment to an approved order:',
          'the four stages, and the four things you are asked to approve.',
          'No payment is taken when a request is sent.'], 155);
      } else {
        desc = fit(['Custom apparel for company merchandise.',
          'Choose the garment, the cloth weight, the colour and the personalisation.',
          'Minimum one piece, reviewed before production.'], 155);
      }
      if(r.page !== 'merch') graph.push(crumbNode([
        ['Merchandise', SITE.origin + '/merchandise/'],
        [(MERCH_TITLE[r.page] || '').replace(' | ' + SITE.name, ''), url]]));
    }
  }
  else if(r.page === 'blog'){
    const list = postsFor('custom');
    title = 'Journal — uniform fabric, laundry and fitting | ' + SITE.name;
    desc  = 'Notes from the workshop on fabric, laundry, fitting and reordering. ' + list.length +
            ' articles, each answering a question asked before an order.';
    graph.push({'@type':'Blog', '@id':url + '#blog', url, name:'PAMUUC Studio Journal',
      description:desc, inLanguage:'en',
      publisher:{'@id':SITE.origin + '/#organization'}});
    graph.push({'@type':'ItemList', '@id':url + '#list', itemListOrder:'https://schema.org/ItemListOrderDescending',
      numberOfItems:list.length,
      itemListElement:list.map((p, i) => ({'@type':'ListItem', position:i + 1,
        url:SITE.origin + '/blog/' + p.id + '/', name:p.title}))});
    graph.push(crumbNode([['Journal', url]]));
  }
  else if(r.page === 'post'){
    const p = postById(r.params.id);
    if(p){
      title = p.title + ' | ' + SITE.name;
      desc  = p.lede;
      const words = (p.body || []).reduce((t, s) =>
        t + (s.h + ' ' + (s.p || []).join(' ') + ' ' + (s.li || []).join(' ')).split(/\s+/).length, 0);
      graph.push({'@type':'BlogPosting', '@id':url + '#article',
        mainEntityOfPage:{'@type':'WebPage', '@id':url},
        headline:p.title, description:p.lede, url,
        datePublished:isoDate(p.date), dateModified:isoDate(p.date),
        inLanguage:'en', wordCount:words, timeRequired:'PT' + readMinutes(p) + 'M',
        articleSection:p.sector || p.cat,
        keywords:[p.sector || p.cat, 'custom uniforms', 'uniform specification', SITE.city],
        about:(p.takeaways || []).slice(0, 4).map(k => ({'@type':'Thing', name:k})),
        author:{'@id':SITE.origin + '/#organization'},
        publisher:{'@id':SITE.origin + '/#organization'},
        image:[SITE.origin + '/assets/images/blog/' + p.id + '.jpg'],
        /* the block an answer engine should read first */
        speakable:{'@type':'SpeakableSpecification', cssSelector:['.po-t', '.po-key-l']}});
      graph.push(crumbNode([['Journal', SITE.origin + '/blog/'], [p.title, url]]));
    }
  }
  else if(r.page === 'custom' || r.page === 'home'){
    graph.push({'@type':'Service', '@id':url + '#service',
      name:'Custom uniform design and production', serviceType:'Custom uniform programme',
      provider:{'@id':SITE.origin + '/#organization'},
      areaServed:{'@type':'Country', name:'Spain'},
      audience:{'@type':'BusinessAudience', name:'Hotels, restaurants, clinics, spas and retail teams'},
      description:desc});
    /* the twelve questions on the page, as question-and-answer markup */
    graph.push({'@type':'FAQPage', '@id':url + '#faq',
      mainEntity:STUDIO_FAQ.map(([q, a]) => ({'@type':'Question', name:q,
        acceptedAnswer:{'@type':'Answer', text:a}}))});
    graph.push(crumbNode([['Custom uniforms', url]]));
  }

  return {title, desc, url, image, graph};
}

function crumbNode(trail){
  return {'@type':'BreadcrumbList', itemListElement:[{'@type':'ListItem', position:1,
      name:SITE.name, item:SITE.origin + '/'}].concat(
    trail.map((t, i) => ({'@type':'ListItem', position:i + 2, name:t[0], item:t[1]})))};
}

function applySeo(r){
  if(typeof document === 'undefined') return;
  const s = seoFor(r);
  document.title = s.title;
  setMeta('meta[name="description"]', 'name', 'description', s.desc);
  setMeta('meta[name="robots"]', 'name', 'robots',
    'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
  setMeta('link[rel="canonical"]', 'rel', 'canonical', s.url);
  setMeta('meta[property="og:type"]', 'property', 'og:type', r.page === 'post' ? 'article' : 'website');
  setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE.name);
  setMeta('meta[property="og:locale"]', 'property', 'og:locale', 'en_GB');
  setMeta('meta[property="og:title"]', 'property', 'og:title', s.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', s.desc);
  setMeta('meta[property="og:url"]', 'property', 'og:url', s.url);
  setMeta('meta[property="og:image"]', 'property', 'og:image', s.image);
  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', s.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', s.desc);

  /* The five languages the site serves. English is the unprefixed URL and the
     default; a prefix is only ever added for a translation. */
  document.head.querySelectorAll('link[rel="alternate"][data-seo]').forEach(x => x.remove());
  const path = s.url.replace(SITE.origin, '');
  [['en', ''], ['es', '/es'], ['fr', '/fr'], ['de', '/de'], ['it', '/it'], ['x-default', '']]
    .forEach(([lang, pre]) => {
      const l = document.createElement('link');
      l.rel = 'alternate'; l.hreflang = lang; l.href = SITE.origin + pre + path;
      l.setAttribute('data-seo', '1');
      document.head.appendChild(l);
    });

  let ld = document.getElementById('ld-json');
  if(!ld){ ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'ld-json';
    document.head.appendChild(ld); }
  ld.textContent = JSON.stringify({'@context':'https://schema.org', '@graph':s.graph});
}

/* ---- boot ----------------------------------------------------------------- */
(function boot(){
  try{
    const t = localStorage.getItem('pamuuc_theme');
    if(t) document.documentElement.setAttribute('data-theme', t);
  }catch(e){}
  try{
    restore();
    /* a restored state never passed through the seed, so it has to be ordered
       here as well — this is where the sorted seed was being overwritten */
    try{ orderColours(S); }catch(e){}
    /* every ladder in the returned sheet already starts at one piece, so the
       old routine that forced minimums down and extrapolated low brackets
       has nothing left to do */
    ROUTE = readHash();
    if((ROUTE.surface === 'account' || ROUTE.surface === 'studio') && !SESSION)
      ROUTE = {surface:'public', page:'login', params:{}};
    render();
  }catch(e){
    /* never leave a blank page: say what broke rather than showing nothing */
    const root = document.getElementById('root');
    if(root) root.innerHTML = '<div class="wrap" style="padding:48px 0">' +
      '<div class="banner banner--stop"><div>' +
      '<div class="banner-t">The prototype could not start</div>' +
      '<div class="banner-d">' + esc(String(e && e.message || e)) + '</div>' +
      '</div></div></div>';
    throw e;
  }
})();
