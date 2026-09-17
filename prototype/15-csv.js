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
   The list price already carries the cheapest two placements (one small
   embroidery + one 1-colour screen). So a customer's first two placements at
   the standard spec are included; anything beyond that is priced on top. */
const SIZE_MM = {small:80, medium:130, large:200};
const STD = {method:'embroidery', size:'small', colours:1};

function placementUnit(rc, pl, qty){
  const c = decoCost(rc, pl.method, qty, pl.colours || 1, SIZE_MM[pl.size] || 80);
  return c ? c.unit : 0;
}
/* what the list price already covers, per placement slot */
function includedUnit(rc, qty, slot){
  if(slot === 0) return placementUnit(rc, {method:'embroidery', size:'small', colours:1}, qty);
  if(slot === 1) return placementUnit(rc, {method:'screen', size:'small', colours:1}, qty);
  return 0;                                   // a third placement is not included
}
function quoteLines(p, rc, cfg){
  const qty = cfg.qty, out = {lines:[], setup:[], unit:0, setupTotal:0};
  if(!p.breaks || !p.breaks.length) return out;
  const b = p.breaks.filter(x => x.qty <= qty).pop() || p.breaks[0];
  out.base = b.price;
  out.lines.push({label:'Garment, printed', note:'includes two standard placements', unit:b.price});

  (cfg.placements || []).forEach((pl, i) => {
    const full = placementUnit(rc, pl, qty);
    const inc  = includedUnit(rc, qty, i);
    const extra = Math.max(0, full - inc) * (rc.mult || 1.55);
    if(extra > 0.004) out.lines.push({
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
function decoCost(rc, method, qty, colours, longestMm){
  const m = rc.methods[method];
  if(!m) return null;
  let unit = null, provisional = false;
  if(m.pricedBy === 'size'){
    const band = longestMm == null ? 'small'
      : longestMm <= (m.bandSmall || 99) ? 'small'
      : longestMm <= (m.bandMedium || 150) ? 'medium' : 'large';
    const r = rc.rates.find(x => x.method === method && x.band === band);
    if(r){ unit = r.cost; provisional = r.provisional; }
  } else {
    const ladder = rc.rates.filter(x => x.method === method && x.qtyMin != null)
      .sort((a,b) => a.qtyMin - b.qtyMin);
    let hit = null;
    for(const r of ladder) if(qty >= r.qtyMin) hit = r;
    if(hit){ unit = hit.cost * (m.mult[Math.min(colours||1,4)] || 1); provisional = hit.provisional; }
  }
  if(unit == null) return null;
  return {setup: m.setup, unit, total: (m.setup || 0) + unit * qty, provisional};
}
