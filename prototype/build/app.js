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
/* ============================================================================
   PAMUUC SUITE — store, permissions, projections
   One dataset. One emit(). Three views. Nothing else may write state.
   ========================================================================= */

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
    if(module === 'payments')        return r === 'cust_admin' && acc.modules.payments;
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
    });
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
    if(p.stage === 'design'){
      doing = 'Our design partner is developing the direction from your brief.';
      youDo = 'Nothing yet. We will publish the concepts for review when they arrive.';
      next  = 'Design concepts published for your review.';
    } else if(p.stage === 'development'){
      if(gate.blocked){
        doing = 'Waiting for the development invoice to be approved and paid before technical files begin.';
        youDo = 'Approve the development invoice in Documents.';
        responsible = 'You'; next = 'Technical files and the first prototype round.';
      } else {
        doing = 'Turning the approved direction into technical files, fabrics and quantities.';
        youDo = openCRs.length ? 'Nothing right now — we are reviewing your open requests.' :
          'Check your positions, garments, fabrics, colours and quantities, and tell us about anything that should change.';
        responsible = openCRs.length ? 'PAMUUC' : 'You';
        next = 'Prototypes are made and a fitting is arranged.';
      }
    } else if(p.stage === 'prototype_fitting'){
      const waiting = gs.filter(g => ['feedback_required','ready_fitting','fitting_scheduled'].includes(g.state));
      const stuck = gs.filter(g => g.state === 'manual_resolution');
      doing = 'Making and revising samples, one garment at a time.';
      youDo = waiting.length ? `Give fitting feedback on ${waiting.length} garment${waiting.length>1?'s':''}.` :
              stuck.length ? 'Nothing — we will contact you directly about the garment that needs resolving.' :
              'Confirm the proposed fitting date.';
      responsible = waiting.length ? 'You' : 'PAMUUC';
      next = 'Every garment approved, then Pre Production.';
    } else if(p.stage === 'pre_production'){
      doing = 'Compiling the final production matrix from your approved garments.';
      youDo = 'Confirm quantities and size splits, then approve the production specification and pro forma.';
      responsible = 'You';
      next = 'Production begins once the pro forma is approved and paid.';
    } else if(p.stage === 'production'){
      doing = 'Your garments are being manufactured against the locked specification.';
      youDo = 'Nothing. We will tell you when milestones are reached.';
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
      showCost:can(u,'cost_margin','view'),
      account:account(p.account),
    });
  },
};

/* ---- commercial gates -------------------------------------------------- */
function gateFor(p){
  const g = p.gates || {};
  if(p.stage === 'development' && g.development_invoice !== 'paid'){
    return {blocked:true, key:'development_invoice', state:g.development_invoice,
      label:'Development invoice', why:'Technical files and prototype authorisation begin only after the development invoice is approved and paid.'};
  }
  if(p.stage === 'pre_production' && g.production_proforma !== 'paid'){
    return {blocked:true, key:'production_proforma', state:g.production_proforma,
      label:'Production pro forma', why:'Production is released only after the production specification and pro forma are approved and the required payment is recorded.'};
  }
  return {blocked:false};
}

/* everything standing between this project and its next stage */
function gateBlockers(p){
  const out = [];
  const gs = S.garments.filter(g => g.project === p.id);
  const gate = gateFor(p);
  if(gate.blocked) out.push({kind:'commercial', text:`${gate.label} is ${st(gate.state).label.toLowerCase()}`, why:gate.why});

  if(p.stage === 'prototype_fitting'){
    gs.filter(g => g.state !== 'approved').forEach(g => {
      out.push({kind:'garment', text:`${g.name} — ${st(g.state).label.toLowerCase()} (round ${g.round})`,
        why: g.state === 'manual_resolution'
          ? 'Three prototype rounds reached without approval. A Master resolution is required before this project can advance.'
          : 'Every required garment needs an approved prototype revision.', garment:g.id});
    });
  }
  if(p.stage === 'pre_production'){
    gs.forEach(g => g.colourways.forEach(cw => {
      const sum = Object.values(cw.sizes||{}).reduce((a,b)=>a+(+b||0),0);
      if(sum !== cw.qty) out.push({kind:'data',
        text:`${g.name} — ${COLOURS[cw.colour].name}: size split sums to ${sum}, quantity is ${cw.qty}`,
        why:'Every colourway quantity must equal the sum of its size split.'});
    }));
  }
  if(p.stage === 'development'){
    const openCR = S.changeRequests.filter(c => c.project === p.id &&
      ['submitted','under_review','clarification'].includes(c.state));
    if(openCR.length) out.push({kind:'request',
      text:`${openCR.length} customer request${openCR.length>1?'s':''} unresolved`,
      why:'Development changes must be resolved before the stage closes.'});
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
  return S.notifications.filter(n => n.to === side && !n.read).length;
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

/* ---- seeded history so activity feeds are not empty -------------------- */
function seedHistory(){
  const h = [
    ['2026-04-02 09:00','Project created in the Studio Back Office','prj_2418','u_nuria'],
    ['2026-04-08 16:20','Contract CTR-2026-018 published','prj_2418','u_sergi'],
    ['2026-06-12 10:05','Version 5 published to the customer','prj_2418','u_nuria'],
    ['2026-06-24 14:22','Marta Riera approved the project structure','prj_2418','u_marta'],
    ['2026-07-09 08:40','Development invoice INV-2026-0258 recorded as paid','prj_2418','u_sergi'],
    ['2026-07-11 11:00','Stage advanced: Development → Prototype Fitting','prj_2418','u_nuria'],
    ['2026-08-22 11:00','Change request accepted: third colourway in Marítim blue','prj_2418','u_nuria'],
    ['2026-08-28 17:30','First fitting completed at Hotel Marítim Barceloneta','prj_2418','u_nuria'],
    ['2026-08-28 17:45','Long sleeve shirt approved at round 1','prj_2418','u_marta'],
    ['2026-08-28 17:46','Tailored apron approved at round 1','prj_2418','u_marta'],
    ['2026-08-29 09:05','Service tunic approved at round 1','prj_2418','u_marta'],
    ['2026-09-02 12:10','Wrap jacket: changes requested, round 2 authorised','prj_2418','u_marta'],
    ['2026-09-08 15:00','Wool overcoat: round 3 not approved — manual resolution required','prj_2418','u_nuria'],
    ['2026-09-04 11:20','Version 7 published to the customer','prj_2418','u_nuria'],
    ['2026-08-26 09:00','Project created in the Studio Back Office','prj_2455','u_nuria'],
    ['2026-09-05 12:00','Version 2 published to the customer','prj_2455','u_nuria'],
    ['2026-09-08 17:30','Customer request: rename position','prj_2455','u_marta'],
    ['2026-09-09 10:14','Customer request: add Sand colourway','prj_2455','u_marta'],
    ['2026-03-19 09:30','Delivery confirmed — 88 pieces received','prj_2201','u_marta'],
    ['2026-03-19 09:35','3 garments published to Reorders','prj_2201','u_nuria'],
  ];
  h.forEach(([at,text,proj,actor]) => S.events.push({
    id:uid('ev'), type:'history', at, actor, project:proj,
    account:project(proj)?.account, text, customerVisible:true}));
  S.events.sort((a,b) => String(b.at).localeCompare(String(a.at)));

  /* a small standing audit trail */
  [['2026-07-11 11:00','u_nuria','prj_2418','Stage advanced','development','prototype_fitting',null],
   ['2026-08-22 11:00','u_nuria','cr_3','Change request decided','submitted','approved',null],
   ['2026-09-04 11:20','u_nuria','prj_2418','Published version','6','7',null],
   ['2026-09-08 15:00','u_leo','g_coat','Garment state changed','changes_requested','manual_resolution','Round limit reached at round 3'],
   ['2026-02-11 10:00','u_leo','acc_maritim','Account activated','—','active',null],
  ].forEach(([at,actor,record,action,was,now,reason]) => S.audit.push({
    id:uid('au'), at, actor, role:ROLE_NAMES[user(actor).role], record, action, was, now, reason, source:'user'}));

  /* standing notifications */
  S.notifications.push(
    {id:uid('nt'), at:'2026-09-09 16:55', to:'customer', kind:'action', read:false, action:true,
     text:'Choose a date for the second fitting on the Wrap jacket', project:'prj_2418', account:'acc_maritim'},
    {id:uid('nt'), at:'2026-09-05 12:02', to:'customer', kind:'action', read:false, action:true,
     text:'Development invoice INV-2026-0311 is ready for your approval', project:'prj_2455', account:'acc_maritim'},
    {id:uid('nt'), at:'2026-08-29 09:06', to:'customer', kind:'update', read:true, action:false,
     text:'Three garments were approved at the first fitting', project:'prj_2418', account:'acc_maritim'},
    {id:uid('nt'), at:'2026-09-09 08:31', to:'studio', kind:'action', read:false, action:true,
     text:'New inquiry INQ-0148 from Casa Vela Restaurants', project:null, account:null},
    {id:uid('nt'), at:'2026-09-09 10:14', to:'studio', kind:'action', read:false, action:true,
     text:'Change request from Grup Marítim: add a Sand colourway', project:'prj_2455', account:'acc_maritim'},
  );
}
seedHistory();

/* ---- persistence: per-viewer convenience only, never load-bearing ------ */
const SKEY = 'pamuuc_suite_v1';
function save(){
  try{ localStorage.setItem(SKEY, JSON.stringify({S, SESSION})); }catch(e){}
}
function restore(){
  try{
    const raw = localStorage.getItem(SKEY);
    if(!raw) return false;
    const o = JSON.parse(raw);
    if(o && o.S && o.S.projects){ S = o.S; SESSION = o.SESSION || null; return true; }
  }catch(e){}
  return false;
}
function resetAll(){
  try{ localStorage.removeItem(SKEY); }catch(e){}
  S = JSON.parse(JSON.stringify(SEED));
  seedHistory();
  SESSION = null; UI = {};
  go('public','home');
  toast('Prototype reset', 'Every record is back to its seeded state.');
}
/* ============================================================================
   PAMUUC SUITE — actions
   The ONLY place state is mutated. Every action emits exactly one event,
   and the event decides activity, notification, task and audit.
   ========================================================================= */
const act = {

  /* ---- public → studio ------------------------------------------------- */
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
      terms:'30 days from invoice date', currency:'EUR', vat:'—',
      locations:[], modules:{projects:true,reorders:true,merchandise:true,documents:true,payments:true},
      balance:0, fromInquiry:i.ref,
    };
    S.accounts.push(acc);
    i.state = 'converted'; i.accountId = acc.id;
    emit('account.activated', {account:acc.id,
      text:`Customer account activated for ${acc.name}`,
      notify:'studio', kind:'update', notifyText:`Account activated: ${acc.name}`,
      audit:'Account activated', record:acc.name, was:'—', now:'active'});
    save();
    return acc;
  },

  /* ---- studio project builder ------------------------------------------ */
  createProject(d){
    const n = 2460 + S.projects.length;
    const p = {
      id:uid('prj'), ref:'PRJ-'+n, account:d.account, name:d.name,
      am:d.am || SESSION.user, owner:SESSION.user,
      stages:d.design ? ['design','development','prototype_fitting','pre_production','production','delivery']
                      : ['development','prototype_fitting','pre_production','production','delivery'],
      stage:d.design ? 'design' : 'development', opStatus:'not_started', risk:null,
      published:false, version:0, publishedAt:null, draftDirty:true,
      created:S.today, target:d.target || null, brief:d.brief || '',
      gates:{design_fee:d.design?'draft':'not_required', development_invoice:'draft', production_proforma:'not_required'},
      positions:(d.positions||[]).map((pos,ix) => ({
        id:uid('pos'), name:pos.name, people:+pos.people||0, garments:[]})),
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
      audit:'Published version', record:p.ref, was:String(was), now:String(p.version)});
    toast('Published', `${p.ref} version ${p.version} is now visible to the customer.`);
    save();
  },

  advanceStage(id, reason){
    const p = project(id); if(!p) return;
    const ns = nextStage(p); if(!ns) return;
    const blockers = gateBlockers(p);
    const was = p.stage;
    p.stage = ns; p.lastUpdate = nowStamp();
    p.opStatus = ns === 'delivery' ? 'in_progress' : 'in_progress';
    if(ns === 'pre_production') p.gates.production_proforma = 'draft';
    emit('project.stage', {project:p.id, account:p.account,
      text:`Stage advanced: ${stageDef(was).name} → ${stageDef(ns).name}` + (reason ? ' (override)' : ''),
      notify:'customer', kind:'update',
      notifyText:`${p.name} has moved to ${stageDef(ns).name}`,
      audit: reason ? 'Stage override' : 'Stage advanced', record:p.ref, was, now:ns, reason:reason || null});
    toast('Stage advanced', `${p.ref} is now in ${stageDef(ns).name}.` +
      (blockers.length && reason ? ' Gate overridden and recorded.' : ''));
    save();
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
    a.state = decision === 'approve' ? 'approved' : 'changes_requested';
    a.decidedAt = nowStamp(); a.decidedBy = SESSION.user; a.comment = comment || '';
    emit('approval.decided', {project:a.project, account:a.account,
      text:`${a.kind} — ${st(a.state).label.toLowerCase()} by ${user(SESSION.user).name}`,
      notify:'studio', kind:'action', actionRequired:decision !== 'approve',
      notifyText:`${account(a.account).name} ${decision === 'approve' ? 'approved' : 'requested changes on'}: ${a.kind}`,
      audit:'Approval decided', record:a.id, was, now:a.state, reason:comment || null});
    toast(decision === 'approve' ? 'Approved' : 'Changes requested',
      decision === 'approve' ? 'Recorded against this exact revision.' : 'PAMUUC has been notified.');
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

  payDocument(id){
    const d = doc(id); if(!d) return;
    const was = d.state; d.state = 'paid'; d.paidAt = nowStamp();
    const p = d.project ? project(d.project) : null;
    if(p){
      if(/Development/i.test(d.title)) p.gates.development_invoice = 'paid';
      if(d.type === 'Pro forma')       p.gates.production_proforma = 'paid';
      p.lastUpdate = nowStamp();
    }
    const acc = account(d.account); if(acc) acc.balance = Math.max(0, acc.balance - (d.amount||0));
    /* close the matching approval */
    const a = S.approvals.find(x => x.target === d.id && x.state === 'awaiting_customer');
    if(a){ a.state = 'approved'; a.decidedAt = nowStamp(); a.decidedBy = SESSION.user; }
    emit('doc.paid', {project:d.project, account:d.account,
      text:`${d.num} recorded as paid — ${money(d.amount)}`,
      notify:'studio', kind:'update', notifyText:`Payment recorded: ${d.num}`,
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

  /* ---- catalogue import ------------------------------------------------- */
  importCatalogue(v){
    const products = catalogueToProducts(v);
    const before = S.merchProducts.length;
    S.merchProducts = products;
    S.decoRates = catalogueToRates(v);
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
    S.notifications.filter(n => n.to === side).forEach(n => n.read = true);
    save();
  },
};
/* ============================================================================
   PAMUUC SUITE — public website
   One domain, two businesses. The root is a service choice; past it you are in
   Pamuk Studio (custom uniform development) or Pamuk Merchandise (catalogue
   products personalised to order). Structure follows the website structure and
   conversion specification of 11 September 2026.

   Two rules that specification is strict about and that the code enforces:
   - An enquiry creates an enquiry. A quote request creates a quote request.
     Neither is an order, an account, or a project.
   - Nothing states a number the business has not approved. Where a figure is
     unconfirmed the copy says it is confirmed on review.
   ========================================================================= */

const PUB_BRANCH = {
  custom:'custom', sectors:'custom', sector:'custom', process:'custom',
  work:'custom', case:'custom', form:'custom', review:'custom', done:'custom',
  studiohelp:'custom',
  merch:'merch', collections:'merch', collection:'merch', products:'merch',
  product:'merch', search:'merch', method:'merch', howto:'merch',
  merchhelp:'merch', quote:'merch', qcontact:'merch', qreview:'merch', qdone:'merch',
};

const BRANCH_NAV = {
  custom:[{p:'sectors',n:'Sectors'},{p:'process',n:'Process'},{p:'work',n:'Work'},{p:'blog',n:'Journal'}],
  merch: [{p:'products',n:'Products'},{p:'collections',n:'Collections'},
          {p:'method',n:'Personalisation'},{p:'howto',n:'How to order'},{p:'blog',n:'Journal'}],
};

const BRANCH_META = {
  custom:{name:'Pamuk Studio', short:'Studio', home:'custom', other:'merch',
          cta:{p:'form', n:'Start your project brief'}},
  merch: {name:'Pamuk Merchandise', short:'Merchandise', home:'merch', other:'custom',
          cta:null},
};

/* ---- collections -------------------------------------------------------- */
const CAT_ORDER = ['T-shirts','Polos','Shirts','Sweatshirts','Outerwear','Pants & shorts','Accessories'];
const CAT_LABEL = {'Pants & shorts':'Trousers and shorts'};
const CAT_COPY = {
  'T-shirts':      'Compare fits, weights and colours for your next branded run.',
  'Polos':         'Explore collared options for teams and everyday brand wear.',
  'Shirts':        'Choose shirts to personalise for a consistent team presence.',
  'Sweatshirts':   'Explore layers for your team, audience or next event.',
  'Outerwear':     'Find jackets and outer layers with suitable branding options.',
  'Pants & shorts':'Complete a coordinated selection with the right lower layers.',
  'Accessories':   'Add the details that carry your brand beyond the garment.',
};
const CAT_COVER = {
  'T-shirts':'m_asher', 'Polos':'m_coaster_vintage', 'Shirts':'m_stanley_denim_shirt',
  'Sweatshirts':'m_astor', 'Outerwear':'m_brooker', 'Pants & shorts':'m_barreler',
  'Accessories':'m_bucket_hat',
};
const catName = (c) => CAT_LABEL[c] || c;
const catSlug = (c) => String(c).toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const catList = (c) => S.merchProducts.filter(p => p.cat === c);
function catsInUse(){
  const present = [...new Set(S.merchProducts.map(p => p.cat).filter(Boolean))];
  return CAT_ORDER.filter(c => present.includes(c))
    .concat(present.filter(c => !CAT_ORDER.includes(c)).sort());
}
const catFromSlug = (s) => catsInUse().find(c => catSlug(c) === s) || null;
const catCopy = (c) => CAT_COPY[c] ||
  `Products in the ${String(catName(c)).toLowerCase()} collection, quoted and decorated on the same terms as the rest of the catalogue.`;

function prodImg(p){
  if(!p) return null;
  const pi = p.img || {};
  return (p.imgOrder || []).map(c => pi[c]).find(Boolean) || null;
}
const imgOf  = (id) => prodImg(by(S.merchProducts, id));
const catImg = (c)  => imgOf(CAT_COVER[c]) || prodImg(S.merchProducts.find(p => p.cat === c && prodImg(p)));

/* ---- sectors ------------------------------------------------------------ */
const SECTORS = [
  {id:'hospitality', n:'Hotels and restaurants',
   d:'A coordinated identity across reception, service and the teams behind the scenes.',
   roles:['Reception and guest services','Restaurant and bar','Kitchen and pass','Housekeeping and operations'],
   req:['Guest-facing identity alongside an industrial laundry cycle','Movement and layering across an eleven-hour split shift','Food service exposure and frequent replacement','Departmental distinction without four separate wardrobes'],
   tags:['High laundry cycles', 'Split shifts', 'Guest-facing identity', 'Departmental distinction']},
  {id:'wellness', n:'Wellness and spas',
   d:'Uniforms considered around treatments, movement and the atmosphere of your space.',
   roles:['Therapists','Reception','Treatment support'],
   req:['Bending and reach through the shoulder and bicep','Coverage that stays correct during treatment','Product contact and frequent cleaning','A quiet register that suits the room'],
   tags:['Range of movement', 'Treatment coverage', 'Product contact', 'Quiet colour']},
  {id:'healthcare', n:'Healthcare teams',
   d:'Garment requirements shaped around your roles and working environment.',
   roles:['Clinical','Support','Hospitality','Administration'],
   req:['Care routines and laundry compatibility','Fit and wearer dignity across a wide size range','Role recognition without a visible hierarchy','Any specialist standard identified and assessed separately'],
   tags:['Industrial wash', 'Wide size range', 'Role recognition', 'Documented materials']},
  {id:'retail', n:'Retail teams',
   d:'Clothing that connects your team with the brand and the experience in store.',
   roles:['Floor','Stockroom','Visual','Management'],
   req:['Standing and reaching through a full shift','Role recognition on a busy floor','Replenishment against a fixed core','Seasonal layers over a consistent base'],
   tags:['All-day standing', 'Seasonal layers', 'Fixed core', 'Floor recognition']},
  {id:'corporate', n:'Corporate teams and events',
   d:'A consistent team presence across meetings, service and public facing occasions.',
   roles:['Hosts','Crew','Stand teams','Hospitality'],
   req:['A programme or a single event, priced differently','Reuse after storage between occasions','A size range wider than the headcount suggests','Short lead times against a fixed date'],
   tags:['Short lead times', 'Storage between events', 'Wide size curve', 'One-off or programme']},
  {id:'food', n:'Food production teams',
   d:'A brief built around the tasks, care requirements and conditions of your workplace.',
   roles:['Line','Packing','Quality','Visitors'],
   req:['Hygiene and laundry requirements to assess','Colour-coded zones where they apply','A scheduled replacement cycle','A specification that can be reproduced exactly'],
   tags:['Hygiene requirements', 'Colour-coded zones', 'Scheduled replacement', 'Reproducible spec']},
];
const sectorById = (id) => SECTORS.find(s => s.id === id) || null;

/* ---- chrome ------------------------------------------------------------- */
function pubShell(inner, page){
  const branch = PUB_BRANCH[page] || null;
  const meta   = branch ? BRANCH_META[branch] : null;
  const other  = meta ? BRANCH_META[meta.other] : null;
  const nav    = branch ? BRANCH_NAV[branch] : [];
  const lines  = quoteCount();
  return `
  <a class="skip" href="#main" data-act="skip">Skip to content</a>
  <div class="pub">
    <header class="pub-hd glass">
      <div class="pub-hd-in">
        <span class="brand" data-go="public:${meta ? meta.home : 'home'}">PAMUUC<span class="brand-bar">|</span><span class="brand-sub">${meta ? esc(meta.short.toUpperCase()) : 'STUDIO'}</span></span>
        <nav class="pub-nav" aria-label="${meta ? esc(meta.name) : 'Main'}">
          ${nav.map(x => `<a data-go="public:${x.p}" class="${page === x.p ? 'on' : ''}">${x.n}</a>`).join('')}
        </nav>
        <span class="spacer"></span>
        ${branch === 'merch' ? `<button class="btn btn--quiet btn--sm hd-hide-md" data-go="public:search" aria-label="Search products">Search</button>` : ''}
        ${meta ? `<button class="btn btn--quiet btn--sm hd-hide-lg" data-go="public:home">Choose a service</button>` : ''}
        ${other ? `<button class="btn btn--quiet btn--sm hd-hide-md" data-go="public:${other.home}">${other.short}</button>` : ''}
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
    ${UI.menu ? menuSheet(branch, meta, other) : ''}
    <main id="main">${inner}</main>
    ${pubFooter(branch)}
  </div>
  ${UI.drawer ? quoteDrawer() : ''}`;
}

function menuSheet(branch, meta, other){
  const nav = branch ? BRANCH_NAV[branch] : [];
  return `
  <div class="hd-sheet">
    <div class="hd-sheet-in">
      ${meta ? `
        <div class="eyebrow">${esc(meta.name)}</div>
        <a class="hd-sheet-link" data-go="public:${meta.home}">${esc(meta.name)} home</a>
        ${nav.map(x => `<a class="hd-sheet-link" data-go="public:${x.p}">${x.n}</a>`).join('')}
        ${branch === 'merch'
          ? `<a class="hd-sheet-link" data-go="public:search">Search products</a>
             <a class="hd-sheet-link hd-sheet-link--cta" data-go="public:quote">Your quote request${quoteCount() ? ' (' + quoteCount() + ')' : ''}</a>`
          : `<a class="hd-sheet-link hd-sheet-link--cta" data-go="public:${meta.cta.p}">${meta.cta.n}</a>`}
      ` : ''}
      <div class="eyebrow hd-sheet-eyebrow">${other ? 'The other service' : 'Choose a service'}</div>
      ${other
        ? `<a class="hd-sheet-link" data-go="public:${other.home}">${esc(other.name)}</a>
           <a class="hd-sheet-link" data-go="public:home">Choose a service</a>`
        : `<a class="hd-sheet-link" data-go="public:custom">Pamuk Studio — custom uniforms</a>
           <a class="hd-sheet-link" data-go="public:merch">Pamuk Merchandise</a>`}
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
      <div class="eyebrow">${title}</div>
      ${links.map(([n, p]) => `<a class="ft-link" data-go="public:${p}">${n}</a>`).join('')}
    </div>`;
  const studioCol = col('Pamuk Studio', [['Custom uniforms','custom'],['Sectors','sectors'],
    ['Process','process'],['Work','work'],['Start your project brief','form'],['Journal','blog'],['Studio help','studiohelp']]);
  const merchCol = col('Pamuk Merchandise', [['Merchandise','merch'],['Products','products'],
    ['Collections','collections'],['Personalisation','method'],['How to order','howto'],['Journal','blog'],['Merchandise help','merchhelp']]);
  return `
  <footer class="pub-ft">
    <div class="pub-wrap">
      <div class="ft-grid">
        ${branch === 'merch' ? merchCol + studioCol : studioCol + merchCol}
        <div class="ft-col">
          <div class="eyebrow">Company</div>
          <a class="ft-link" data-go="public:about">About Pamuk</a>
          <a class="ft-link" data-go="public:contact">Contact</a>
          <a class="ft-link" data-go="public:login">Customer login</a>
          <a class="ft-link" data-go="public:accessibility">Accessibility</a>
        </div>
        <div class="ft-col ft-col--legal">
          <div class="eyebrow">Legal</div>
          <a class="ft-link" data-go="public:privacy">Privacy notice</a>
          <a class="ft-link" data-go="public:cookies">Cookie settings</a>
          <a class="ft-link" data-go="public:terms">Terms</a>
          <p class="t-xs muted ft-addr">Pamuk Studio S.L · Barcelona<br>
            Legal and registration details are confirmed before publication.</p>
        </div>
      </div>
      <div class="ft-base">
        <span class="t-xs muted">© ${new Date().getFullYear()} Pamuk Studio S.L.</span>
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
function pcard(p){
  const im = prodImg(p);
  const nc = (p.colours || []).length;
  return `
  <div class="pcard" data-go="public:product:${p.id}">
    <div class="pcard-img">
      ${im ? `<img src="${im}" alt="${esc(p.name)}" loading="lazy">`
           : `<span class="pcard-ph">${p.glyph}</span>`}
    </div>
    <div class="pcard-b">
      <div class="t-h5">${esc(p.name)}</div>
      <div class="t-xs muted">Ref. ${esc(p.ref)}${p.weight ? ' · ' + esc(p.weight) + ' g/m²' : ''}</div>
      <div class="pcard-price num">
        ${p.quoteOnly
          ? `<span class="chip">Price on request</span>`
          : `<b>${money(p.from)}</b> <span class="t-sm muted">per piece at ${p.moq}</span>`}
      </div>
      <div class="t-xs muted pcard-basis">${p.quoteOnly
        ? 'Quoted on review · excl. VAT'
        : 'Product only; personalisation extra · excl. VAT'}</div>
      <div class="t-xs muted">Minimum ${p.moq} pieces · ${nc} colour${nc === 1 ? '' : 's'}</div>
      <span class="btn btn--ghost btn--sm pcard-cta">Configure for a quote</span>
    </div>
  </div>`;
}


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

/* ---- the shared root: a service choice, not a third homepage ----------- */
function pubHome(){
  const halves = [
    {page:'custom', t:'Custom Uniforms', img:imgOf('m_stanley_oxford_shirt'),
     alt:'A uniform shirt worn on shift'},
    {page:'merch', t:'Merchandise', img:imgOf('m_bomber_2_0'),
     alt:'Decorated jackets from the catalogue'},
  ];
  return pubShellGate(`
  <section class="gate2">
    <span class="gate2-mark" data-go="public:home">PAMUUC<em>STUDIO</em></span>
    ${halves.map(h => `
    <button class="gate2-h" data-go="public:${h.page}">
      ${h.img ? `<img class="gate2-img" src="${h.img}" alt="${esc(h.alt)}">` : ''}
      <span class="gate2-veil"></span>
      <span class="gate2-t">${h.t}</span>
    </button>`).join('')}
  </section>

  <section class="pub-sec pub-sec--tight">
    <div class="pub-wrap">
      ${secIx('—', 'Barcelona · since 2019', 'Pamuk Studio S.L')}
      <h1 class="display">Uniforms and merchandise for your business.</h1>
      <div class="split split--wide gate-intro-row">
        <p class="lede">Develop uniforms around your team’s work, or choose products to personalise with your brand.
          Pamuk Studio designs, develops and produces from Barcelona; Pamuk Merchandise configures and decorates a
          catalogue we already stand behind. Two services, one workshop, one standard of record keeping.</p>
        <div class="split-b">
          <div class="chip-row">
            ${SECTORS.map(x => `<span class="chip chip--lg">${x.n}</span>`).join('')}
          </div>
          <div class="btn-row btn-row--top">
            <button class="btn btn--ghost btn--sm" data-go="public:login">Customer login</button>
            <button class="btn btn--quiet btn--sm" data-act="theme" aria-label="Switch light and dark">◐</button>
            <button class="btn btn--quiet btn--sm" data-act="lang">EN</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--dark">
    <div class="pub-wrap">
      ${secIx('—', 'Which service fits your project')}
      <div class="split split--bottom">
        <div class="split-b">
          <h2 class="pull">Choose Pamuk Studio when you need a uniform programme developed around specific roles, fits, fabrics or garment details.</h2>
          <div class="btn-row btn-row--top"><button class="btn btn--onphoto btn--lg" data-go="public:custom">Explore custom uniforms</button></div>
        </div>
        <div class="split-b">
          <h2 class="pull">Choose Pamuk Merchandise when you want to select existing products and add your logo or artwork.</h2>
          <div class="btn-row btn-row--top"><button class="btn btn--onphoto btn--lg" data-go="public:merch">Browse merchandise</button></div>
        </div>
      </div>
      <p class="t-sm assist" style="color:var(--on-band-dim)">Unsure where to start?
        <a class="lnk" data-go="public:contact" style="color:var(--on-band)">Tell us what you need.</a></p>
    </div>
  </section>
  `);
}

/* ---- Studio FAQ, twelve questions, six shown ---------------------------- */
const STUDIO_FAQ = [
  ['What is the difference between custom uniforms and personalised merchandise?',
   'Custom uniforms are developed around your team’s roles, garment requirements and brand. Merchandise starts with existing products that you select and personalise. If you are unsure which route fits, describe the outcome you need and we’ll help you identify the next step.'],
  ['What is the minimum quantity for a custom project?',
   'Minimum quantities depend on the garments and production requirements. Tell us your team size, roles and approximate quantities in the brief. We’ll review whether the project is a fit and explain the relevant minimums before you commit.'],
  ['How much does a uniform project cost?',
   'As a guide, a custom project generally starts around €120 per person across the garments in the range. Where it lands depends on the development scope, fabrics, quantities and personalisation. Share a range if you have one, or select “Not decided yet”, and we’ll discuss a suitable scope before confirming costs.'],
  ['How long does a project take?',
   'Timing depends on development, prototype review, material availability, approvals and production. Include your preferred date when you enquire. We’ll assess it with the project scope and confirm the schedule before the work moves into the relevant stages.'],
  ['Do we need a finished design before contacting you?',
   'No. You can start with your team, the work they do and the result you want. If design work is needed, we’ll discuss whether it should be included in your project scope. Existing references and brand guidelines can be shared when useful.'],
  ['What happens after we send the brief?',
   'The Studio reviews your information and contacts you about the next step. Where the project is a fit, this includes discovery before an account and custom project are set up. Sending the brief does not place an order.'],
  ['Can different roles have different garments?',
   'Your brief can include different positions, garment types and approximate quantities. We’ll use that information to define the proposed range. The Studio sets up the project and publishes the agreed options so the team can review the relevant decisions.'],
  ['How do prototypes and fittings work?',
   'The project sets out the prototype and fitting arrangements. Feedback and approval are recorded for each garment, so an approved item does not need to restart when another needs changes. The scope explains the included review rounds and how additional work is handled.'],
  ['How are fabrics and care requirements chosen?',
   'Tell us how the garments will be used and cleaned, including any workplace requirements. These inform development and material choices. Specific performance or certification requirements must be assessed and confirmed for the proposed garments.'],
  ['Can you use our colours, logos and brand details?',
   'Share your guidelines or references if available. We’ll review the relevant colours, trims and personalisation within the project scope. Proposed details and any limitations are confirmed through the appropriate review and approval steps.'],
  ['Can we request reorders or supply more than one location?',
   'Include expected repeat needs and delivery locations in the brief. We’ll review the requirements with the project. A reorder is checked against the approved garment record, current availability, pricing and timing before it is confirmed.'],
  ['Can we start before every detail is decided?',
   'Yes. Answer what you know and use “Not sure yet” where offered. You can explain what still needs deciding. If you only need an initial conversation, use the advice enquiry below and we’ll follow up with the appropriate questions.'],
];

/* ---- adapted reference sections -----------------------------------------
   Six devices taken from a reference set Leo supplied, rebuilt around what a
   uniform studio actually has: sectors, roles, requirements, stages and the
   archived specification. No performance statistics, because none are
   measured; the figures below are structural facts about the method. */

/* 1. A directory of everything the site covers. Real routes, crawlable,
      grouped the way a buyer thinks: by sector, by role, by requirement. */
function dirBlock(){
  const dim = UI.dirDim || 'roles';
  const tab = UI.dirTab || 'all';
  const dims = [['sectors','Sectors'],['roles','Roles'],['reqs','Requirements']];
  const inTab = (s) => tab === 'all' || s.id === tab;
  let links = [];
  if(dim === 'sectors')
    links = SECTORS.filter(inTab).map(s => [`${s.n} uniforms`, s.id]);
  if(dim === 'roles')
    SECTORS.filter(inTab).forEach(s => s.roles.forEach(r =>
      links.push([`Uniforms for ${r.toLowerCase()}`, s.id])));
  if(dim === 'reqs')
    SECTORS.filter(inTab).forEach(s => (s.tags || []).forEach(t =>
      links.push([`${t} — ${s.n.toLowerCase()}`, s.id])));
  return `
  <section class="pub-sec pub-sec--tight surface-2 dirsec">
    <div class="pub-wrap">
      <h2 class="t-h2 dir-t">Explore uniform projects</h2>
      <div class="dir-pills">
        ${dims.map(([v, n]) => `<button class="pill ${dim === v ? 'pill--on' : ''}"
          data-act="dirDim" data-v="${v}" aria-pressed="${dim === v}">${n}</button>`).join('')}
      </div>
      <div class="dir-tabs" role="tablist">
        ${[['all','All sectors'], ...SECTORS.map(s => [s.id, s.n])].map(([v, n]) =>
          `<button class="dtab ${tab === v ? 'dtab--on' : ''}" data-act="dirTab" data-v="${v}"
            role="tab" aria-selected="${tab === v}">${n}</button>`).join('')}
      </div>
      <div class="dir-grid">
        ${links.map(([n, id]) => `<a class="dir-l" data-go="public:sector:${id}">${esc(n)}</a>`).join('')}
      </div>
      <p class="t-xs muted note">Every link opens the sector it belongs to. We publish a page only where we
        have something specific to say about the work, rather than generating one per search term.</p>
    </div>
  </section>`;
}

/* 2. Four steps. The public summary of a process the process page sets out
      in six formal stages. */
const START_STEPS = [
  ['Share your brief in nine short topics',
   'Your roles, sites, approximate quantities and timing. Answer what you know and mark what is still undecided — “Not sure yet” is a real answer.'],
  ['We review it and come back to you',
   'We read the brief, decide whether the project is a fit, and arrange discovery where it is. If it is not right for us, we say so then rather than after three weeks.'],
  ['Develop the garments and fit them',
   'Fabric and construction are chosen against your wash cycle. Prototypes are fitted on your own people, doing the actual work, and approved one garment at a time.'],
  ['Approve, produce, and keep the record',
   'Production follows the approved specification once the required approvals and payment are in place. The approved revision is archived so a reorder matches.'],
];

function stepsBlock(ix){
  return `
  <section class="pub-sec pub-sec--tight">
    <div class="pub-wrap">
      ${secIx(ix || '—', 'How a project starts', 'Four steps')}
      <h2 class="display steps-t">Start a uniform project in four steps.</h2>
      <div class="grid grid-4 gap-lg steps-g">
        ${START_STEPS.map(([h, p], k) => `
        <div class="scard">
          <div class="scard-n">${String(k + 1).padStart(2, '0')}</div>
          <h3 class="scard-h">${h}</h3>
          <p class="scard-p">${p}</p>
        </div>`).join('')}
      </div>
      <div class="btn-row btn-row--top steps-cta">
        <button class="btn btn--primary btn--lg" data-go="public:form">Start your project brief</button>
        <button class="btn btn--quiet" data-go="public:process">See the six formal stages</button>
      </div>
    </div>
  </section>`;
}

/* 3. Four figures. Structural facts about how a project runs, not measured
      performance — we publish no statistic we cannot trace to a record. */
function figuresBlock(ix){
  const figs = [
    ['€120', 'Per person, from', 'Where a custom project generally starts, across the garments in the range. Development, fabric and quantity move it from there.'],
    ['6', 'Stages', 'Each one ends in a decision that is yours to make, and every approval is recorded against the project.'],
    ['3', 'Prototype rounds', 'Included per garment and stated in your proposal. A further round is an authorised exception, not a silent cost.'],
    ['0', 'Charged at enquiry', 'The brief starts a review and a conversation. Nothing is ordered and nothing is charged.'],
  ];
  return `
  <section class="pub-sec sec--dark">
    <div class="pub-wrap">
      <div class="fig-h">
        ${secIx(ix || '—', 'How the work is governed', 'Facts, not forecasts')}
      </div>
      <div class="figs">
        ${figs.map(([v, l, n]) => `
        <div class="figc">
          <div class="figc-v">${v}</div>
          <div class="figc-l">${l}</div>
          <p class="figc-n">${n}</p>
        </div>`).join('')}
      </div>
      <p class="t-xs fig-note">These are properties of the process, not performance claims. Where we cannot
        trace a number to a stored record, we do not publish it.</p>
    </div>
  </section>`;
}

/* 4. What a project includes: six cards, each carrying a small artefact of
      the actual method rather than a stock illustration. */
function includesBlock(ix){
  const art = {
    plan: `<div class="art art--rows">
      ${[['Reception','Shirt · apron'],['Restaurant','Jacket · trouser'],['Kitchen','Chef jacket'],['Housekeeping','Tunic']]
        .map(([r, g]) => `<div class="art-r"><span>${r}</span><span class="art-m">${g}</span></div>`).join('')}
    </div>`,
    fabric: `<div class="art art--chips">
      ${[['Twill','280 g/m²'],['Piqué','220 g/m²'],['Melton','480 g/m²'],['Poplin','130 g/m²']]
        .map(([n, w]) => `<div class="art-chip"><b>${n}</b><span>${w}</span></div>`).join('')}
    </div>`,
    proto: `<div class="art art--rows">
      ${[['Chef jacket','Approved','go'],['Service trouser','Approved','go'],['Wrap jacket','Changes requested','wait'],['Apron','Round 2','flow']]
        .map(([n, st, k]) => `<div class="art-r"><span>${n}</span><span class="pill-s pill-s--${k}">${st}</span></div>`).join('')}
    </div>`,
    brand: `<div class="art art--brand">
      <div class="art-label">YOUR MARK<span>woven label · 40 × 12 mm</span></div>
      <div class="art-sw">${['#13304F','#002B2A','#7F1D16','#F3EDE4'].map(c =>
        `<span style="background:${c}"></span>`).join('')}</div>
    </div>`,
    spec: `<div class="art art--spec">
      <div class="art-spec-h"><b>Chef jacket</b><span class="pill-s pill-s--go">Revision 4</span></div>
      ${[['Fabric','Cotton twill 280 g/m²'],['Colour','Custom navy · lab dip 3'],['Positions','Chest · collar'],['Sizes','XS–3XL, 9 steps']]
        .map(([k, v]) => `<div class="art-r"><span class="art-m">${k}</span><span>${v}</span></div>`).join('')}
    </div>`,
    reorder: `<div class="art art--reorder">
      <div class="art-r"><span class="art-m">Approved revision</span><span>Rev. 4</span></div>
      <div class="art-r"><span class="art-m">Reordered</span><span>88 pieces</span></div>
      <div class="art-r"><span class="art-m">Unit price</span><span>Unchanged</span></div>
      <div class="art-check">Produced against the archived file, not a memory</div>
    </div>`,
  };
  const items = [
    ['Role and garment plan','Who needs what, from individual positions to a coordinated team wardrobe. Roles first, garments second.', art.plan],
    ['Fabric and construction','Weight, composition and finish selected against your wash cycle and climate, not against a mood board.', art.fabric],
    ['Prototypes and fitting','Samples tried on the people who will wear them, doing the actual work. Feedback recorded per garment.', art.proto],
    ['Brand details','Colours, trims and personalisation developed within the agreed scope, at a size that survives laundry.', art.brand],
    ['An archived specification','The approved revision stored with its measurements, fabrics, colours and suppliers.', art.spec],
    ['A reorder that matches','Produced against the archived file, then rechecked for availability, price and timing.', art.reorder],
  ];
  return `
  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx(ix || '—', 'What a project includes', 'Six parts')}
      <div class="split split--bottom sol-h">
        <h2 class="display sol-t">The details that make the uniform yours.</h2>
        <div class="split-b">
          <p class="lede">Your brief defines what we develop, which decisions need your approval, and what is
            included. Every part below produces something you can hold or read — a sample, a record, a decision.</p>
          <div class="btn-row btn-row--top">
            <button class="btn btn--ghost" data-go="public:process">See the development process</button>
          </div>
        </div>
      </div>
      <div class="sol-g">
        ${items.map(([h, p, a]) => `
        <article class="sol">
          <h3 class="sol-ht">${h}</h3>
          <p class="sol-p">${p}</p>
          ${a}
        </article>`).join('')}
      </div>
    </div>
  </section>`;
}

/* 5. The opening: copy on the left, the work on the right, and the artefact
      the whole method turns on floating over it. */
function studioHero(){
  return `
  <section class="shero">
    <div class="pub-wrap shero-in">
      <div class="shero-copy">
        <span class="news"><b>Barcelona</b>Uniform design and production since 2019</span>
        <h1 class="display shero-t">Custom uniforms for the way your team works.</h1>
        <p class="lede shero-d">Developed around your roles, working conditions and brand. Six stages, each one
          ending in an approval you give — and an archived specification so the second order matches the first.</p>
        <div class="btn-row btn-row--top">
          <button class="btn btn--primary btn--lg" data-go="public:form">Start your project brief</button>
          <button class="btn btn--ghost btn--lg" data-go="public:work">See our work</button>
        </div>
      </div>
      <div class="shero-media">
        <div class="media media--4x5 shero-img">
          ${imgOf('m_palmer') ? `<img src="${imgOf('m_palmer')}" alt="A shirt developed for service roles, worn on shift">` : ''}
        </div>
        <div class="shero-card">
          <div class="shero-card-h">
            <span class="eyebrow">Archived specification</span>
            <span class="pill-s pill-s--go">Approved</span>
          </div>
          <div class="shero-card-t">Chef jacket · Revision 4</div>
          ${[['Fabric','Cotton twill 280 g/m²'],['Colour','Custom navy · lab dip 3'],['Fitted on','11 wearers, 2 rounds'],['Reorder','At the same specification']]
            .map(([k, v]) => `<div class="art-r"><span class="art-m">${k}</span><span>${v}</span></div>`).join('')}
          <div class="shero-card-f">An example of the record a project leaves behind.</div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ---- S1 to S8 -----------------------------------------------------------
   Eight chapters, each with a different composition: a full-bleed opening,
   an asymmetric case split, a sector index, offset scope cards, a dark
   process band, oversized practical facts, the FAQ, and the invitation. */
function pubCustom(){
  const c0 = CASES[0];
  return pubShell(`
  ${studioHero()}

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx('01', 'Selected work', 'Three projects published')}
      <div class="split split--wide">
        <div class="split-b hovr" data-go="public:case:${c0.id}">
          ${fig(imgOf(c0.img), c0.title, c0.status, c0.sector, '3x2')}
        </div>
        <div class="split-b">
          <div class="shead"><h2 class="display">See how a brief becomes a uniform.</h2><p class="lede" style="margin-top:var(--sp-5)">${c0.constraint}</p></div>
          <div class="ilist" style="margin-top:var(--sp-6)">
            ${CASES.slice(1, 3).map((c, k) => `
            <div class="ilist-r" data-go="public:case:${c.id}" style="cursor:pointer;grid-template-columns:44px 1fr">
              <span class="ilist-n">0${k + 2}</span>
              <div><div class="eyebrow">${esc(c.sector)} · ${esc(c.status)}</div>
                <div class="ilist-h" style="margin-top:6px">${esc(c.title)}</div>
                <p class="t-sm muted" style="margin-top:6px">${c.scope}</p></div>`).join('')}
          </div>
          <div style="margin-top:var(--sp-5)" data-go="public:work">${arrow('All projects and development work')}</div>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('02', 'Roles and sectors', 'Six environments')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">Start with the people wearing the uniform.</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">Different roles place different demands on clothing.
            We begin with the work, the setting and the team.</p>
        </div>
        <div class="ilist split-b">
          ${SECTORS.map((x, k) => `
          <div class="ilist-r sect" data-go="public:sector:${x.id}">
            <span class="ilist-n">${String(k + 1).padStart(2, '0')}</span>
            <div class="ilist-h">${x.n}</div>
            <div><p class="t-sm muted">${x.d}</p>${arrow('Explore')}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>
  </section>

  ${includesBlock('03')}

  ${stepsBlock('04')}

  ${figuresBlock('05')}

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('06', 'Questions before starting', 'Twelve answers')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">Questions before you start?</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">The essentials about scope, development and the next step.</p>
          <div style="margin-top:var(--sp-5)" data-go="public:studiohelp">${arrow('All Studio questions')}</div>
        </div>
        <div class="split-b">${faqBlock(STUDIO_FAQ, 'faq-studio')}</div>
      </div>
    </div>
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx('07', 'Start the conversation', 'Nine short topics')}
      <div class="split">
        <div class="split-b">
          <div class="shead"><h2 class="display" >Tell us what your team needs.</h2><p class="lede" style="margin-top:var(--sp-5)">Start with your roles, approximate quantities and preferred timing.
            You can leave undecided details open and review your answers before sending.</p></div>
          <div class="btn-row btn-row--top">
            <button class="btn btn--primary btn--lg" data-go="public:form">Start your project brief</button>
          </div>
          <p class="t-sm muted s8-sup">Nine short topics, then a review. No account needed.</p>
        </div>
        <div class="split-b">
          <details class="disc">
            <summary class="disc-q">Prefer an initial conversation?</summary>
            <div class="disc-b">
              <p class="t-sm muted">Send a short introduction. We’ll follow up with the questions needed to assess the project.</p>
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
                <p class="t-xs muted">We use these details to respond to your enquiry.
                  <a class="lnk" data-go="public:privacy">Read our Privacy Notice.</a></p>
              </form>
            </div>
          </details>
        </div>
      </div>
    </div>
  </section>
  ${dirBlock()}
  `, 'custom');
}

/* ---- cases -------------------------------------------------------------- */
const CASES = [
  {id:'maritim_hotels', title:'Grup Marítim Hotels', sector:'Hotels and restaurants',
   status:'In production', img:'m_coaster_vintage',
   scope:'102 people · 5 garments · 4 roles across three Barcelona properties',
   constraint:'Three properties needed one wardrobe without erasing what makes each property different. A custom blue is used only at the Barceloneta site, carried in a trim rather than a whole garment.',
   decision:'The range was built per role rather than per property, with one colour variable. That kept five garments in production instead of fifteen.',
   result:'Three of the five garments were approved at the first fitting. The wrap jacket failed because the sleeve bound through the bicep during service — a fault that only appears when the sample is fitted on someone doing the actual work. The wool overcoat is unresolved at six pieces, because melton will not hang correctly below twenty.',
   media:'Development example · garment shown in use'},
  {id:'bonanova', title:'Clínica Bonanova', sector:'Healthcare teams',
   status:'In production', img:'m_asher',
   scope:'140 people · 1 garment · two colourways across every department',
   constraint:'Four incompatible legacy garments were in use across departments, with no reproducible specification for any of them.',
   decision:'One clinical tunic in two colourways encodes department without reading as a hierarchy. Ordinary professional clothing only; no protective or certified specification is claimed.',
   result:'Two prototype rounds. The first was rejected on pocket depth — a pen fell out when staff bent over a bed, which nobody predicted in the specification review and no amount of drawing would have caught.',
   media:'Development example · tunic construction'},
  {id:'restaurant_maritim', title:'Restaurant Marítim', sector:'Hotels and restaurants',
   status:'Delivered', img:'m_brooker',
   scope:'22 people · 3 garments · 88 pieces, single site',
   constraint:'A kitchen and pass wardrobe that had to survive a service laundry cycle and be reorderable by someone who was not involved in the first order.',
   decision:'Chef jacket, apron and service trouser were specified against the actual laundry contract, and the approved revision was archived with its measurements and fabrics.',
   result:'Reordered once already, from the archived revision-4 specification, at the same unit price. That is the point of archiving the snapshot rather than the design.',
   media:'Delivered project · service wardrobe'},
];
const caseById = (id) => CASES.find(c => c.id === id) || null;

function pubSectors(){
  return pubShell(`
  ${pageHead('Pamuk Studio · Sectors', 'Custom uniforms for your working environment.',
    'Explore the roles and requirements that shape a uniform project, then tell us about your team.',
    {crumb: crumb([['Pamuk Studio','custom']], 'Sectors')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="grid grid-3 gap-lg">
        ${SECTORS.map(s => `
        <div class="card sect" data-go="public:sector:${s.id}">
          <h2 class="t-h4 card-t">${s.n}</h2>
          <p class="t-sm muted">${s.d}</p>
          <span class="lnk">${esc(s.n)} uniforms</span>
        </div>`).join('')}
      </div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">Role specific development</h2><p class="sec-desc">A uniform programme is built from roles, not from a single garment repeated across a team. The brief asks which positions you need to dress so the proposed range matches how the work is actually divided.</p></div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary" data-go="public:form">Start your project brief</button>
      </div>
    </div>
  </section>
  ${dirBlock()}
  ${faqSection('custom', '—')}
  `, 'sectors');
}

function pubSector(id){
  const s = sectorById(id);
  if(!s) return pubShell(pageHead('Pamuk Studio', 'That sector page does not exist.',
    'Every sector we work in is listed on the sectors overview.',
    {after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:sectors">See all sectors</button></div>`}), 'sectors');
  const c = CASES.find(x => x.sector === s.n) || CASES[0];
  return pubShell(`
  ${pageHead('Pamuk Studio · Sector', `Custom uniforms for ${s.n.toLowerCase()}.`, s.d,
    {crumb: crumb([['Pamuk Studio','custom'],['Sectors','sectors']], s.n)})}

  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${secIx('01', 'Roles and garments', s.roles.length + ' role groups')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">One team identity, different roles.</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">These are the role groups a brief in this sector
            usually covers. The garment list is developed with you; it is not a fixed package.</p>
        </div>
        <div class="ilist split-b">
          ${s.roles.map((r, k) => `<div class="ilist-r" style="grid-template-columns:44px 1fr">
            <span class="ilist-n">${String(k + 1).padStart(2, '0')}</span>
            <div class="ilist-h">${r}</div></div>`).join('')}
        </div>
      </div>
      <div style="margin-top:var(--sp-8)">
        ${ph('SECTOR_' + s.id.toUpperCase(), '21x9', 'A real supported role context in this sector. No protective or certified implication without evidence.')}
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--dark">
    <div class="pub-wrap">
      ${secIx('02', 'Working requirements', 'Assessed before design')}
      <div class="shead"><h2 class="display" >Built around the work.</h2><p class="lede" style="margin-top:var(--sp-5)">The considerations we assess before proposing
        fabric, cut or construction for this environment.</p></div>
      <div class="nums" style="margin-top:var(--sp-8)">
        ${s.req.map((r, k) => `<div class="num-b"><div class="num-v">${String(k + 1).padStart(2, '0')}</div>
          <div class="num-n">${r}</div></div>`).join('')}
      </div>
      ${s.id === 'healthcare' || s.id === 'food' ? `
      <div class="banner banner--wait banner--top"><div>
        <div class="banner-t">Specialist requirements are assessed, not assumed</div>
        <div class="banner-d">This is ordinary professional clothing. Protective, sterile, flame resistant or certified garments are a separate assessment, and any required standard has to be confirmed for the proposed garments before it is offered.</div>
      </div></div>` : ''}
    </div>
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx('03', 'Relevant evidence', esc(c.status))}
      <div class="shead"><h2 class="display" >A closer look at the project.</h2>
      <div class="feat" style="margin-top:var(--sp-7)">
        <article class="feat-main" data-go="public:case:${c.id}">
          <div class="feat-img"><img src="${imgOf(c.img) || ''}" alt="${esc(c.title)}" loading="lazy"></div>
          <div class="feat-b">
            <div class="eyebrow">${esc(c.sector)} · ${esc(c.status)}</div>
            <h3 class="t-h3 card-t">${esc(c.title)}</h3>
            <p class="t-sm muted">${c.scope}</p>
            <p class="t-body feat-p">${c.constraint}</p>
            <span class="lnk">View project — ${esc(c.title)}</span>
          </div>
        </article>
        <div class="feat-side">
          <div class="card">
            <div class="eyebrow">How we develop the range</div>
            <ol class="steps">
              <li><b>Define the project.</b> Brief review and discovery establish scope and suitability.</li>
              <li><b>Develop and review.</b> Garments are developed and prototypes fitted on your people.</li>
              <li><b>Approve and deliver.</b> Production follows the approved details and commercial requirements.</li>
            </ol>
            <div class="card-foot t-xs">Minimums and timing are confirmed on review of your brief.</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('04', 'Enquiry', 'Sector prefilled, and editable')}
      <h2 class="display" >Tell us about your team.</h2><p class="lede" style="margin-top:var(--sp-5);max-width:62ch">Your sector is already filled in on the brief,
        and you can change it. Nine short topics, then a review.</p></div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary btn--lg" data-act="briefSector" data-s="${s.id}">Start your project brief</button>
        <button class="btn btn--quiet" data-go="public:contact">Ask a question first</button>
      </div>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'sector');
}

function pubProcess(){
  const detail = {
    design:            ['The proposed direction is part of the purchased scope.','Review and decide on the direction.','Skipped when design is not part of what you bought.'],
    development:       ['The Studio develops the agreed garment details — positions, fabrics, colours, quantities and a technical file per style.','Review the requested decisions.','Configured development authorisation applies.'],
    prototype_fitting: ['Garments are assessed and feedback is recorded for each one individually.','Provide fitting feedback, or approve each garment.','Included rounds and fitting arrangements are stated in the project scope.'],
    pre_production:    ['Approved garments, quantities, sizes, artwork and commercial details are locked for production.','Approve the published production information and the relevant pro forma.','All required garment approvals, or recorded authorised exceptions.'],
    production:        ['Work follows the approved production version.','Respond only if a controlled change requires a decision.','Required approvals and payment received.'],
    delivery:          ['Shipment and receipt information are available.','Review delivery and report issues through support.','Agreed logistics and confirmed shipment data.'],
  };
  return pubShell(`
  ${pageHead('Pamuk Studio · Process', 'From your brief to an approved uniform range.',
    'See what happens at each stage, what you will review, and what needs to be agreed before the project moves forward.',
    {crumb: crumb([['Pamuk Studio','custom']], 'Process')})}

  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${secIx('01', 'Before the project', 'Qualification and discovery')}
      <div class="shead"><h2 class="display" >Before the project</h2><p class="sec-desc">Brief review and discovery establish scope and suitability. You supply the initial context and join discovery where appropriate. An account and a project follow qualification — they are not created by the brief.</p></div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('02', 'The formal project stages', 'Six stages')}
      <div class="shead"><h2 class="display" >The formal project stages</h2><p class="sec-desc">Six stages. Nothing moves on until the stage before it is approved, and every approval is recorded against the project.</p></div>
      <div class="stack proc-stack">
        ${STAGES.map((s, i) => {
          const d = detail[s.id] || [s.blurb, '—', '—'];
          return `<div class="card proc">
            <div class="grid grid-2 gap-lg">
              <div>
                <div class="eyebrow">Stage ${String(i + 1).padStart(2, '0')}${i === 0 ? ' · only if design is bought' : ''}</div>
                <h3 class="t-h3 card-t">${s.name}</h3>
                <p class="t-sm muted">${d[0]}</p>
              </div>
              <div>
                <div class="eyebrow">Your action</div>
                <p class="t-body proc-p">${d[1]}</p>
                <div class="eyebrow proc-eyebrow">Dependency</div>
                <p class="t-sm muted">${d[2]}</p>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      ${secIx('03', 'Prototypes and approval', 'Per garment')}
      <div class="shead"><h2 class="display" >Prototypes and approval</h2><p class="sec-desc">A prototype round exists to find what a drawing cannot. Feedback and approval are recorded per garment, so an approved item is not reopened when another needs changing.</p></div>
      <div class="grid grid-2 gap-lg">
        <div class="card">
          <h3 class="t-h4 card-t">What review is for</h3>
          <p class="t-sm muted">Fit on the people who will wear the garment, doing the actual work. Most failures we see are movement faults — a sleeve that binds, a pocket that empties when someone bends — and they do not appear in a specification review.</p>
        </div>
        <div class="card">
          <h3 class="t-h4 card-t">Included rounds</h3>
          <p class="t-sm muted">The number of prototype rounds included per garment is set in your proposal. A further round is handled as an authorised exception rather than absorbed silently. We do not offer unlimited revisions.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('04', 'Commercial and delivery dependencies', 'Before production release')}
      <div class="shead"><h2 class="display" >Commercial and delivery dependencies</h2><p class="sec-desc">Production is released when the approvals and the required payment are in place — not when the previous stage ends.</p></div>
      <div class="grid grid-3 gap-lg">
        ${[['Approvals','Each required garment approval, or a recorded authorised exception, before the specification is locked.'],
           ['Payment','The required amount stated in your proposal, confirmed received.'],
           ['Reorders','A reorder starts from the approved garment record and is checked for current availability, price and timing.']]
          .map(([h, p]) => `<div class="card"><h3 class="t-h4 card-t">${h}</h3><p class="t-sm muted">${p}</p></div>`).join('')}
      </div>
    </div>
  </section>

  <section class="pub-sec">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">Tell us about your team.</h2><p class="sec-desc">Nine short topics, then a review. Sending the brief requests a review; it does not place an order.</p></div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary btn--lg" data-go="public:form">Start your project brief</button>
      </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'process');
}

function pubWork(){
  return pubShell(`
  ${pageHead('Pamuk Studio · Work', 'Uniform projects and development work.',
    'Explore the brief, the garment decisions and the status of each project. Every case names what failed first, because that is the part of the process worth reading.',
    {crumb: crumb([['Pamuk Studio','custom']], 'Work')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${secIx('—', 'Projects', CASES.length + ' published')}
      <div class="grid grid-3 gap-lg">
        ${CASES.map(c => `
        <article class="coll" data-go="public:case:${c.id}">
          <div class="coll-img"><img src="${imgOf(c.img) || ''}" alt="${esc(c.title)}" loading="lazy"></div>
          <div class="coll-b">
            <div class="eyebrow">${esc(c.sector)} · ${esc(c.status)}</div>
            <h2 class="t-h4 card-t">${esc(c.title)}</h2>
            <p class="t-sm muted">${c.scope}</p>
            <span class="lnk">View project — ${esc(c.title)}</span>
          </div>
        </article>`).join('')}
      </div>
      <p class="t-xs muted note">Status is stated per project. A development example is labelled as one and is not presented as delivered client work.</p>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'work');
}

function pubCase(id){
  const c = caseById(id);
  if(!c) return pubShell(pageHead('Pamuk Studio', 'That project does not exist.',
    'Every published project is listed on the work overview.',
    {after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:work">See all work</button></div>`}), 'work');
  return pubShell(`
  ${pageHead('Pamuk Studio · Project', esc(c.title), c.scope,
    {crumb: crumb([['Pamuk Studio','custom'],['Work','work']], c.title),
     after:`<div class="chip-row"><span class="chip">${esc(c.sector)}</span><span class="chip">${esc(c.status)}</span></div>`})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="feat">
        <figure class="feat-main feat-main--static">
          <div class="feat-img"><img src="${imgOf(c.img) || ''}" alt="${esc(c.title)}"></div>
          <figcaption class="t-xs muted feat-cap">${esc(c.media)}</figcaption>
        </figure>
        <div class="feat-side">
          <div class="card">
            <div class="eyebrow">The requirement</div>
            <p class="t-body card-t">${c.constraint}</p>
          </div>
          <div class="card">
            <div class="eyebrow">The decision</div>
            <p class="t-body card-t">${c.decision}</p>
          </div>
        </div>
      </div>
      <div class="banner banner--wait banner--top"><div>
        <div class="banner-t">What we learned</div>
        <div class="banner-d">${c.result}</div>
      </div></div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      <div class="shead"><h2 class="sec-title">Planning uniforms for a similar team?</h2><p class="sec-desc">Tell us about your roles, scope and timing. We’ll carry this project across as context — your answers stay your own.</p></div>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary btn--lg" data-act="briefCase" data-c="${c.id}">Discuss a similar project</button>
        <button class="btn btn--quiet" data-go="public:work">See other projects</button>
      </div>
    </div>
  </section>
  ${faqSection('custom', '—')}
  `, 'case');
}

function pubStudioHelp(){
  const groups = [['Starting', STUDIO_FAQ.slice(0, 4)],
                  ['Development', STUDIO_FAQ.slice(4, 9)],
                  ['Delivery and reorders', STUDIO_FAQ.slice(9)]];
  return pubShell(`
  ${pageHead('Pamuk Studio · Help', 'Help with your uniform project.',
    'The questions we are asked before a brief is sent. If your question is not here, ask it directly and we will answer it.',
    {crumb: crumb([['Pamuk Studio','custom']], 'Help')})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap stack">
      ${groups.map(([g, items]) => `
        <div>
          <div class="shead"><h2 class="sec-title">${g}</h2>
          <div class="faq faq--all">
            ${items.map(q => `<details class="faq-i"><summary class="faq-q">${q[0]}</summary>
              <div class="faq-a"><p class="t-sm">${q[1]}</p></div></details>`).join('')}
          </div>
        </div>`).join('')}
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary" data-go="public:form">Start your project brief</button>
        <button class="btn btn--quiet" data-go="public:contact">Ask a question</button>
      </div>
    </div>
  </section>
  `, 'studiohelp');
}

/* ---- Merchandise FAQ ---------------------------------------------------- */
const MERCH_FAQ = [
  ['Do I pay when I request a quote?',
   'No. You select and configure products, then send a request for review. We confirm the proposal and any artwork requirements before you approve the relevant details and complete the agreed payment.'],
  ['What is the minimum order quantity?',
   'Minimums depend on the product and personalisation. Check the product page for the relevant quantity. If your request is below that amount or the minimum needs review, contact us with the product and quantity you have in mind.'],
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
      return `<button class="cst ${on ? 'cst--on' : ''}" data-go="public:collection:${catSlug(c)}"
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
   any, so the section ships as a designed slot naming the fields a verified
   source has to supply. */
function reviewsSlot(){
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
  <section class="pub-sec pub-sec--tight surface-2 ${branch === 'merch' ? 'sec--red' : ''}">
    <div class="pub-wrap">
      ${secIx(ix || '—', 'Frequently asked questions', 'Twelve answers')}
      <div class="split split--narrow split--sticky">
        <div class="split-b">
          <h2 class="pull">Questions before you decide?</h2>
          <p class="t-sm muted" style="margin-top:var(--sp-4)">The essentials, answered here. Read all of them on
            the help page, or ask us something that is not covered.</p>
          <div style="margin-top:var(--sp-5)" data-go="public:${help}">${arrow('All questions')}</div>
          <div style="margin-top:var(--sp-3)" data-go="public:contact">${arrow('Contact our team')}</div>
        </div>
        <div class="split-b">${faqBlock(items, 'faq-' + branch + '-' + (ix || 'x'))}</div>
      </div>
    </div>
  </section>`;
}

/* ---- Merchandise home --------------------------------------------------- */
function pubMerch(){
  const top = ['m_asher','m_coaster_vintage','m_stanley_denim_shirt','m_archer_vintage','m_bomber',
               'm_bucket_hat','m_astor','m_barreler','m_brooker','m_duffle_bag']
    .map(id => by(S.merchProducts, id)).filter(Boolean);
  const ten = top.length >= 10 ? top.slice(0, 10)
            : S.merchProducts.filter(p => prodImg(p)).slice(0, 10);
  /* the two largest families lead the page */
  const lead = catsInUse().map(c => ({c, n: catList(c).length}))
    .sort((a, b) => b.n - a.n).slice(0, 2);
  return pubShell(`
  <section class="bleed bleed--tall">
    ${imgOf('m_bomber_2_0') ? `<img class="bleed-img" src="${imgOf('m_bomber_2_0')}" alt="Catalogue products carrying a decoration example">` : ''}
    <span class="bleed-veil"></span>
    <div class="pub-wrap bleed-in">
      <div class="eyebrow">Pamuk Merchandise</div>
      <h1 class="display" >Merchandise selected by you, personalised for your brand.</h1>
      <p class="lede" style="margin-top:var(--sp-6)">Clothing and accessories you configure and we
        review. Choose the product, the colour and the personalisation, and we quote it before anything is made.</p>
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary btn--lg" data-go="public:collections">Browse the collections</button>
        <button class="btn btn--onphoto btn--lg" data-go="public:howto">How ordering works</button>
      </div>
      <p class="cap" style="margin-top:var(--sp-7)"><b>No payment when you request a quote</b><span>Catalogue products · decoration example</span></p>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--red">
    <div class="pub-wrap">
      ${secIx('01', 'Where most programmes start', 'Two largest families')}
    </div>
    <div class="duo">
      ${lead.map(({c, n}, k) => `
      <article class="duo-h hovr" data-go="public:collection:${catSlug(c)}">
        ${catImg(c) ? `<img class="duo-img" src="${catImg(c)}" alt="${esc(catName(c))}" loading="lazy">` : ''}
        <span class="duo-veil"></span>
        <span class="duo-ix">${String(k + 1).padStart(2, '0')}</span>
        <div class="duo-b">
          <h2 class="duo-t">${esc(catName(c))}</h2>
          <p class="duo-d">${catCopy(c)}</p>
          <span class="duo-m">${n} products · from ${money(catList(c).filter(p => !p.quoteOnly).map(p => p.from).sort((a, b) => a - b)[0])}</span>
          <span class="gate-go">View collection<span></span></span>
        </div>
      </article>`).join('')}
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2 sec--red">
    <div class="pub-wrap">
      ${secIx('02', 'Ten to start from', 'Chosen for how they carry decoration')}
      ${carousel('c-top', ten.map(pcard), 'Selected products')}
      <div class="btn-row btn-row--top">
        <button class="btn btn--primary" data-go="public:products">View all ${S.merchProducts.length} products</button>
      </div>
    </div>
  </section>

  <section class="pub-sec sec--red">
    <div class="pub-wrap">
      ${secIx('03', 'Quality and certification', 'What is checked, and what is claimed')}
      <div class="split">
        <div class="card card--pad">
          <div class="eyebrow">Checked on every product we list</div>
          <h2 class="t-h3 card-t">What we verify before a product reaches the catalogue</h2>
          <ul class="ticks">
            ${['Fabric weight in g/m², stated on the product, because weight changes how a print reads',
               'Composition and construction, so a decoration method can be matched to the surface',
               'The decoration methods and placements the garment actually supports',
               'Colour range and size range held against the supplier record, not a marketing page',
               'Mill and country of manufacture where the supplier documents it']
              .map(x => `<li>${x}</li>`).join('')}
          </ul>
        </div>
        <div class="card card--pad">
          <div class="eyebrow">Certification</div>
          <h2 class="t-h3 card-t">Claimed per product, never across the catalogue</h2>
          <p class="t-sm muted">Our suppliers hold recognised textile and social certifications, but they apply to
            specific products and production runs — not to everything we sell. A badge is shown on a product only
            once the certificate is on file for that product.</p>
          <div class="certs">
            ${['Organic content','Recycled content','Chemical safety','Social compliance']
              .map(x => `<div class="cert"><span class="cert-n">${x}</span>
                <span class="cert-s">Confirmed per product</span></div>`).join('')}
          </div>
          <div class="card-foot t-xs">Ask us which certifications apply to the products in your request and we
            will send the certificates that cover them.</div>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--dark sec--red">
    <div class="pub-wrap">
      <div class="reass">
        ${[['No payment at request','Configure and send. Nothing is charged until you approve a reviewed quote.'],
           ['A proof before production','Where a proof is required you approve the artwork, size and position first.'],
           ['Artwork kept on file','An approved file is archived, so a repeat run skips setup where the method is unchanged.'],
           ['One workshop','Every method is produced in house, so a t-shirt and an overcoat carry the same mark.']]
          .map(([h, p], k) => `<div class="reass-i">
            <span class="reass-n">${String(k + 1).padStart(2, '0')}</span>
            <div><div class="reass-h">${h}</div><p class="reass-p">${p}</p></div>
          </div>`).join('')}
      </div>
    </div>
  </section>

  ${faqSection('merch', '04')}
  `, 'merch');
}

function collCard(c){
  const im = catImg(c), n = catList(c).length;
  return `
  <div class="coll" data-go="public:collection:${catSlug(c)}">
    <div class="coll-img">${im ? `<img src="${im}" alt="${esc(catName(c))}" loading="lazy">` : ''}</div>
    <div class="coll-b">
      <h3 class="t-h4 card-t">${esc(catName(c))}</h3>
      <p class="t-sm muted">${catCopy(c)}</p>
      <div class="card-foot t-xs num">${n} product${n === 1 ? '' : 's'}</div>
    </div>
  </div>`;
}

/* ---- product filters: real catalogue fields, not marketing labels ------ */
function listState(){
  const f = UI.flt = UI.flt || {};
  f.cats = f.cats || []; f.methods = f.methods || []; f.sort = f.sort || 'recommended';
  f.qty = f.qty || ''; f.price = f.price || '';
  return f;
}
function applyFilters(list){
  const f = listState();
  let out = list.slice();
  if(f.cats.length)    out = out.filter(p => f.cats.includes(p.cat));
  if(f.methods.length) out = out.filter(p => (p.pers || []).some(m => f.methods.includes(m)));
  if(f.qty)            out = out.filter(p => p.moq <= (+f.qty || 0));
  if(f.price === 'u20')   out = out.filter(p => !p.quoteOnly && p.from < 20);
  if(f.price === '20_40') out = out.filter(p => !p.quoteOnly && p.from >= 20 && p.from < 40);
  if(f.price === 'o40')   out = out.filter(p => !p.quoteOnly && p.from >= 40);
  if(f.price === 'req')   out = out.filter(p => p.quoteOnly);
  /* a product with no comparable price sorts after the priced ones */
  if(f.sort === 'plh')  out.sort((a, b) => (a.quoteOnly - b.quoteOnly) || (a.from - b.from));
  if(f.sort === 'phl')  out.sort((a, b) => (a.quoteOnly - b.quoteOnly) || (b.from - a.from));
  if(f.sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
function activeChips(){
  const f = listState(), out = [];
  f.cats.forEach(c => out.push([catName(c), 'rmCat', c]));
  f.methods.forEach(m => out.push([(S.personalization[m] || {}).name || m, 'rmMethod', m]));
  if(f.qty) out.push([`Quantity ${f.qty}`, 'rmQty', '']);
  if(f.price) out.push([{u20:'Under €20', '20_40':'€20–€40', o40:'€40 and over', req:'Price on request'}[f.price], 'rmPrice', '']);
  return out;
}
function filterBar(scope){
  const f = listState(), chips = activeChips();
  const methods = Object.keys(S.personalization || {});
  return `
  <div class="flt">
    <details class="flt-d" ${UI.fltOpen ? 'open' : ''}>
      <summary class="flt-q">Filter${chips.length ? ` <span class="badge-n">${chips.length}</span>` : ''}</summary>
      <div class="flt-b">
        ${scope === 'all' ? `<fieldset class="flt-g"><legend class="eyebrow">Collection</legend>
          <div class="chip-row">${catsInUse().map(c => `<button class="tab ${f.cats.includes(c) ? 'tab--on' : ''}"
            data-act="fCat" data-v="${esc(c)}" aria-pressed="${f.cats.includes(c)}">${esc(catName(c))}</button>`).join('')}</div>
        </fieldset>` : ''}
        <fieldset class="flt-g"><legend class="eyebrow">Personalisation method</legend>
          <div class="chip-row">${methods.map(m => `<button class="tab ${f.methods.includes(m) ? 'tab--on' : ''}"
            data-act="fMethod" data-v="${esc(m)}" aria-pressed="${f.methods.includes(m)}">${esc((S.personalization[m] || {}).name || m)}</button>`).join('')}</div>
          <p class="t-xs muted">Final artwork suitability is reviewed for your design.</p>
        </fieldset>
        <fieldset class="flt-g"><legend class="eyebrow">Price at the product minimum</legend>
          <div class="chip-row">${[['u20','Under €20'],['20_40','€20–€40'],['o40','€40 and over'],['req','Price on request']]
            .map(([v, n]) => `<button class="tab ${f.price === v ? 'tab--on' : ''}" data-act="fPrice" data-v="${v}"
              aria-pressed="${f.price === v}">${n}</button>`).join('')}</div>
        </fieldset>
        <fieldset class="flt-g"><legend class="eyebrow">Quantity you need</legend>
          <label class="fld"><span class="fld-l">Show products whose minimum fits this quantity</span>
            <input class="inp inp--sm" type="number" min="1" id="fqty" value="${esc(f.qty)}" placeholder="e.g. 75"></label>
          <button class="btn btn--ghost btn--sm" data-act="fQty">Apply quantity</button>
        </fieldset>
      </div>
    </details>
    <label class="fld fld--inline"><span class="fld-l">Sort</span>
      <select class="inp inp--sm" data-act="fSort">
        ${[['recommended','Recommended'],['plh','Price low to high'],['phl','Price high to low'],['name','Name A–Z']]
          .map(([v, n]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${n}</option>`).join('')}
      </select></label>
  </div>
  ${chips.length ? `<div class="applied">
    <span class="t-xs muted">Applied:</span>
    ${chips.map(([n, a, v]) => `<button class="chip chip--x" data-act="${a}" data-v="${esc(v)}">${esc(n)} ✕</button>`).join('')}
    <button class="btn btn--quiet btn--sm" data-act="fClear">Clear all</button>
  </div>` : ''}`;
}

/* ---- listing pages ------------------------------------------------------
   The reference leads with a category strip and a dense grid, and pages by
   scrolling. We keep a real "Load more" control beside the observer so the
   list is operable by keyboard and the remaining count is always stated. */
const PAGE_STEP = 24;

function listBody(list, total, emptyMsg){
  const shown = Math.min(UI.shown || PAGE_STEP, list.length);
  const rest  = list.length - shown;
  if(!list.length) return `
    <div class="card card--quiet empty">
      <h3 class="t-h4">${emptyMsg}</h3>
      <p class="t-sm muted">Remove a filter, or ask us to help find an option.</p>
      <div class="btn-row btn-row--top">
        <button class="btn btn--ghost btn--sm" data-act="fClear">Clear all filters</button>
        <button class="btn btn--quiet btn--sm" data-go="public:merchhelp">Get help choosing</button>
      </div>
    </div>`;
  return `
    <div class="grid grid-auto pgrid">${list.slice(0, shown).map(pcard).join('')}</div>
    <div class="more" id="more">
      <span class="t-sm muted num">Showing ${shown} of ${list.length}${
        total && total !== list.length ? ` · ${total} in the catalogue` : ''}</span>
      ${rest > 0
        ? `<button class="btn btn--ghost" data-act="more">Load ${Math.min(rest, PAGE_STEP)} more</button>`
        : `<span class="t-sm muted">End of the list</span>`}
    </div>`;
}

function pubProducts(){
  const all = S.merchProducts, list = applyFilters(all);
  return pubShell(`
  ${pageHead('Pamuk Merchandise', 'Personalised clothing.',
    'Every product you can personalise, with its minimum, its colour range and the price basis on the card. Filter by collection, method, price or the quantity you actually need.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Products'),
     after: catStrip(null) + searchBar('')})}
  <section class="pub-sec pub-sec--top sec--red">
    <div class="pub-wrap">
      ${filterBar('all')}
      ${listBody(list, all.length, 'No products match these filters.')}
    </div>
  </section>
  ${faqSection('merch', '—')}
  ${seoBlock('all')}
  `, 'products');
}

function pubCollection(slug){
  const c = catFromSlug(slug);
  if(!c) return pubShell(pageHead('Pamuk Merchandise', 'That collection does not exist.',
    'Every collection in the catalogue is listed on the collections page.',
    {red:true, after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:collections">See all collections</button></div>`})
    + faqSection('merch', '—'), 'collections');
  const all = catList(c), list = applyFilters(all);
  return pubShell(`
  ${pageHead('Pamuk Merchandise', `Personalised ${catName(c).toLowerCase()}.`, catCopy(c),
    {red:true, crumb: crumb([['Pamuk Merchandise','merch'],['Collections','collections']], catName(c)),
     after: catStrip(c)})}
  <section class="pub-sec pub-sec--top sec--red">
    <div class="pub-wrap">
      ${filterBar('cat')}
      ${listBody(list, all.length, `No ${catName(c).toLowerCase()} match these filters.`)}
    </div>
  </section>
  ${faqSection('merch', '—')}
  ${seoBlock(c)}
  `, 'collection');
}

/* The reference closes a listing with a substantial written block. It is
   guidance for a buyer, not a keyword field. */
function seoBlock(scope){
  const c = scope === 'all' ? null : scope;
  return `
  <section class="pub-sec pub-sec--tight sec--red">
    <div class="pub-wrap">
      <div class="split split--narrow split--sticky guide">
        <div class="split-b">
          <span class="sec-ix">Guidance</span>
          <h2 class="sec-title">${c ? `Choosing ${catName(c).toLowerCase()} for a branded run`
            : 'Choosing personalised clothing for your company'}</h2>
          <div class="btn-row btn-row--top read-cta">
            <button class="btn btn--ghost" data-go="public:method">How personalisation is priced</button>
            <button class="btn btn--quiet" data-go="public:merchhelp">Get help choosing</button>
          </div>
        </div>
        <div class="split-b">
      <p class="t-body">${c ? catCopy(c) + ' ' : ''}The decision that matters most is
        rarely the garment — it is the weight of the fabric and the surface it gives a decoration. A light jersey
        takes a large screen print cleanly and reads as a campaign piece; a heavier loopback or a brushed fleece
        holds embroidery without puckering and survives more washes. Compare weight in g/m² before comparing the
        starting price, because two products at the same price can behave completely differently under the same mark.</p>
      <p class="t-body">Quantity changes the method as much as the cost. Below about a
        hundred pieces a transfer usually makes more sense than screens, because the setup per colour has nowhere to
        amortise. Above it, screen printing becomes the cheaper answer and stays that way as the run grows. Embroidery
        is priced on the area it covers rather than the colours it uses, which is why a small chest mark on a heavier
        garment is often the most economical way to carry an identity.</p>
      <p class="t-body">Everything in the catalogue is decorated in our own workshop and
        quoted before it is made. Minimums and lead times are stated per product, artwork is reviewed for suitability
        rather than accepted blindly, and an approved file is archived so a second run matches the first. If you are
        unsure which product suits your artwork, send us the file and the quantity and we will tell you which
        garments in this list will carry it well.</p>
        </div>
      </div>
    </div>
  </section>`;
}

function pubCollections(){
  return pubShell(`
  ${pageHead('Pamuk Merchandise', 'Explore merchandise by product.',
    'Choose a category to compare products, quantities and available personalisation.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Collections'), after: searchBar('')})}
  <section class="pub-sec pub-sec--top sec--red">
    <div class="pub-wrap">
      <div class="grid gap-lg coll-grid" data-n="${catsInUse().length}">
        ${catsInUse().map(c => collCard(c)).join('')}
      </div>
    </div>
  </section>
  ${faqSection('merch', '—')}
  ${seoBlock('all')}
  `, 'collections');
}

function pubSearch(){
  const q = (UI.q || '').trim();
  const hit = !q ? [] : S.merchProducts.filter(p =>
    (p.name + ' ' + p.ref + ' ' + p.cat + ' ' + (p.desc || '')).toLowerCase().includes(q.toLowerCase()));
  const list = q ? applyFilters(hit) : [];
  return pubShell(`
  ${pageHead('Pamuk Merchandise', q ? `Results for “${esc(q)}”` : 'Search products',
    q ? `${hit.length} product${hit.length === 1 ? '' : 's'} match this term. Search covers product names, references and categories.`
      : 'Search by product name, garment type or reference. You can also browse the collections.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Search'), after: catStrip(null) + searchBar(q)})}
  <section class="pub-sec pub-sec--top sec--red">
    <div class="pub-wrap">
      ${!q ? `<div class="grid gap-lg coll-grid" data-n="${catsInUse().length}">
                ${catsInUse().map(c => collCard(c)).join('')}</div>`
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

/* ---- blog ---------------------------------------------------------------
   Written from what the workshop actually knows. Every piece answers a
   question a buyer asks before ordering, so it earns its place rather than
   filling a content calendar. */
const POSTS = [
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
const postById = (id) => POSTS.find(p => p.id === id) || null;

function pubBlog(){
  const [lead, ...rest] = POSTS;
  return pubShell(`
  ${pageHead('Pamuk', 'What we have learned making these.',
    'Notes from the workshop on fabric, decoration, fitting and reordering. Each one answers a question we are actually asked before an order.')}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${secIx('—', 'Latest', POSTS.length + ' articles')}
      <article class="split split--wide hovr post-lead" data-go="public:post:${lead.id}">
        <div class="split-b">${fig(imgOf(lead.img), lead.title, lead.cat, lead.date + ' · ' + lead.read + ' read', '3x2')}</div>
        <div class="split-b">
          <div class="eyebrow">${esc(lead.cat)} · ${esc(lead.read)} read</div>
          <div class="shead"><h2 class="display" style="margin-top:var(--sp-4)">${esc(lead.title)}</h2><p class="lede" style="margin-top:var(--sp-5)">${esc(lead.lede)}</p></div></div>
          <div style="margin-top:var(--sp-5)">${arrow('Read the article')}</div>
        </div>
      </article>
      <div class="grid grid-3 gap-lg" style="margin-top:var(--sp-9)">
        ${rest.map(p => `
        <article class="coll hovr" data-go="public:post:${p.id}">
          <div class="coll-img"><img src="${imgOf(p.img) || ''}" alt="${esc(p.title)}" loading="lazy"></div>
          <div class="coll-b">
            <div class="eyebrow">${esc(p.cat)} · ${esc(p.read)} read</div>
            <h3 class="t-h4 card-t">${esc(p.title)}</h3>
            <p class="t-sm muted">${esc(p.lede)}</p>
            <div class="card-foot t-xs">${esc(p.date)}</div>
          </div>
        </article>`).join('')}
      </div>
    </div>
  </section>
  ${faqSection('merch', '—')}
  `, 'blog');
}

function pubPost(id){
  const p = postById(id);
  if(!p) return pubShell(pageHead('Pamuk', 'That article does not exist.',
    'Everything we have published is listed on the journal.',
    {after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:blog">All articles</button></div>`}), 'blog');
  const more = POSTS.filter(x => x.id !== p.id).slice(0, 3);
  return pubShell(`
  ${pageHead(esc(p.cat) + ' · ' + esc(p.read) + ' read', esc(p.title), esc(p.lede),
    {crumb: crumb([['Journal','blog']], p.title)})}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      ${fig(imgOf(p.img), p.title, p.cat, p.date, '21x9')}
      <div class="split split--narrow split--sticky" style="margin-top:var(--sp-9)">
        <div class="split-b">
          <div class="eyebrow">Published</div>
          <p class="t-sm muted">${esc(p.date)}</p>
          <div class="eyebrow" style="margin-top:var(--sp-5)">In this article</div>
          <ol class="steps">${p.body.map(([h]) => `<li>${esc(h)}</li>`).join('')}</ol>
        </div>
        <div class="split-b read">
          ${p.body.map(([h, t]) => `<h2 class="t-h3" style="margin-top:var(--sp-7)">${esc(h)}</h2>
            <p class="t-body" style="margin-top:var(--sp-4)">${esc(t)}</p>`).join('')}
          <div class="btn-row btn-row--top">
            <button class="btn btn--primary" data-go="public:${p.cat === 'Merchandise' ? 'products' : 'form'}">
              ${p.cat === 'Merchandise' ? 'Browse products' : 'Start your project brief'}</button>
            <button class="btn btn--quiet" data-go="public:blog">More articles</button>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class="pub-sec pub-sec--tight surface-2">
    <div class="pub-wrap">
      ${secIx('—', 'Keep reading', more.length + ' articles')}
      <div class="grid grid-3 gap-lg">
        ${more.map(x => `
        <article class="coll hovr" data-go="public:post:${x.id}">
          <div class="coll-img"><img src="${imgOf(x.img) || ''}" alt="${esc(x.title)}" loading="lazy"></div>
          <div class="coll-b">
            <div class="eyebrow">${esc(x.cat)} · ${esc(x.read)} read</div>
            <h3 class="t-h4 card-t">${esc(x.title)}</h3>
            <div class="card-foot t-xs">${esc(x.date)}</div>
          </div>
        </article>`).join('')}
      </div>
    </div>
  </section>
  ${faqSection(p.cat === 'Merchandise' ? 'merch' : 'custom', '—')}
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
  ${pageHead('Pamuk Merchandise · Personalisation', 'Find the right personalisation for your product.',
    'Compare the available finishes and see what information helps us review your artwork. Product compatibility and the final proof determine what can be produced.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Personalisation')})}
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
  ${pageHead('Pamuk Merchandise · How to order', 'From product selection to your approved order.',
    'Four steps, and four different things you may be asked to approve. No payment is taken when you submit a quote request.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'How to order')})}
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
  ${pageHead('Pamuk Merchandise · Help', 'Help with your merchandise request.',
    'The questions buyers ask before sending a quote request, and a direct route if yours is not answered here.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Help')})}
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
      <h2 class="sec-title">Get help choosing</h2><p class="sec-desc">Tell us the product you have in mind, your approximate quantity and preferred date. Quantity and date are optional if they are not decided.</p></div>
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
function quoteKnown(){
  let known = 0, unresolved = 0;
  (UI.quote || []).forEach(l => { if(l.total == null) unresolved++; else known += l.total; });
  return {known, unresolved};
}
function lineSummary(l){
  const pl = (l.placements || []);
  return `${l.qty} × ${esc(l.productName)} · ${esc(l.colourName)}`
    + (pl.length ? ` · ${pl.length} placement${pl.length === 1 ? '' : 's'}` : ' · no personalisation');
}

function pubQuote(){
  const lines = UI.quote || [];
  const {known, unresolved} = quoteKnown();
  if(!lines.length) return pubShell(`
    ${pageHead('Pamuk Merchandise · Quote request', 'Your quote request is empty.',
      'Add products to compare and request a quote. Nothing is ordered or charged when you send a request.',
      {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Quote request'),
       after:`<div class="btn-row btn-row--top">
         <button class="btn btn--primary btn--lg" data-go="public:products">Browse products</button>
         <button class="btn btn--quiet" data-go="public:merchhelp">Get help choosing</button></div>`})}
    ${faqSection('merch', '—')}
  `, 'quote');
  return pubShell(`
  ${pageHead('Pamuk Merchandise · Quote request', 'Your quote request.',
    'Review the products and personalisation you want us to assess. Nothing is ordered or charged when you send this request.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch']], 'Quote request')})}
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
                </div>
                <div class="qline-amt num">${l.total == null
                  ? `<span class="chip">Price on review</span>`
                  : `<b>${money(l.total)}</b><span class="t-xs muted"> excl. VAT</span>`}</div>
              </div>
              <div class="qline-facts">
                <span class="t-sm num">${l.qty} pieces</span>
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
        </div>

        <aside class="qsum">
          <h2 class="t-h4">Request summary</h2>
          <dl class="dl">
            <div class="dl-r"><dt>Configurations</dt><dd class="num">${lines.length}</dd></div>
            <div class="dl-r"><dt>Total units</dt><dd class="num">${quoteUnits()}</dd></div>
            <div class="dl-r"><dt>${unresolved ? 'Known subtotal' : 'Products and personalisation'}</dt>
              <dd class="num">${money(known)}</dd></div>
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
                <div class="dline-n">${esc(l.productName)} · ${esc(l.colourName)}</div>
                <div class="dline-p num">${l.total == null ? '<span class="chip">On review</span>' : money(l.total)}</div>
              </div>
              <div class="dline-r">
                <label class="dqty">
                  <span class="vh">Quantity for ${esc(l.productName)}</span>
                  <select class="inp inp--xs" data-act="dQty" data-i="${i}">
                    ${tiers.map(q => `<option value="${q}" ${q === l.qty ? 'selected' : ''}>${q}</option>`).join('')}
                  </select>
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
      <div class="drow drow--t">
        <span>${unresolved ? 'Known subtotal' : 'Estimated total'}</span>
        <span class="num">${money(known)}</span>
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
  const label = studio ? 'Back to Pamuk Studio' : 'Back to your quote';
  return `
  <div class="pub pub--bare">
    <header class="co-hd">
      <div class="co-hd-in">
        <button class="co-back" data-go="public:${back}" aria-label="${label}">←</button>
        <span class="brand" data-go="public:${home}">PAMUUC<span class="brand-bar">|</span><span class="brand-sub">${studio ? 'STUDIO' : 'MERCHANDISE'}</span></span>
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
              <div class="co-line-n">${esc(l.productName)} · ${esc(l.colourName)}</div>
              <div class="num co-line-p">${l.total == null ? '<span class="chip">On review</span>' : money(l.total)}</div>
            </div>
            <div class="co-line-m">
              <span class="num">${l.qty} pieces</span>
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
  ${pageHead('Pamuk Merchandise · Quote request', 'Check your quote request.',
    'Review what we will assess. You can change any part before sending it.',
    {red:true, crumb: crumb([['Pamuk Merchandise','merch'],['Quote request','quote']], 'Check request')})}
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
  ${pageHead('Pamuk Merchandise', 'Your quote request has been received.',
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
  ${pageHead('Pamuk', 'Meet Pamuk.',
    'Pamuk Studio S.L designs, develops and produces uniforms and branded merchandise from Barcelona. Two services share one workshop, one set of decoration rules and one standard of record keeping.')}
  <section class="pub-sec pub-sec--top">
    <div class="pub-wrap">
      <div class="grid grid-2 gap-lg">
        <div class="card">
          <div class="eyebrow">Pamuk Studio</div>
          <h2 class="t-h3 card-t">Custom uniform development</h2>
          <p class="t-sm muted">Garments developed around your roles, fitted on your own people and archived as an approved specification so a reorder matches the first run.</p>
          <a class="lnk" data-go="public:custom">Explore custom uniforms</a>
        </div>
        <div class="card">
          <div class="eyebrow eyebrow-red">Pamuk Merchandise</div>
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
  ${pageHead('Pamuk', 'Tell us what you need.',
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
  ${pageHead('Pamuk', title, intro)}
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
  ${pageHead('Pamuk', 'We couldn’t find this page.',
    'The link may be out of date. Choose a service below, or search the merchandise catalogue.',
    {after:`<div class="btn-row btn-row--top">
      <button class="btn btn--primary" data-go="public:custom">Custom uniforms</button>
      <button class="btn btn--ghost" data-go="public:merch">Merchandise</button>
      <button class="btn btn--quiet" data-go="public:search">Search products</button></div>`})}
  `, page || 'home');
}

/* ---- Merchandise: one product ---------------------------------------- */
function pubProduct(id){
  const p = by(S.merchProducts, id);
  if(!p) return pubShell(pageHead('Merchandise', 'That product does not exist.',
    'The link may be out of date. Every product in the catalogue is listed on the all-products page.',
    {red:true, after:`<div class="btn-row btn-row--top"><button class="btn btn--primary" data-go="public:products">Browse all products</button></div>`}), 'products');
  const IM = p.img || {};
  const imgs = (p.imgOrder || []).filter(c => IM[c]);
  const rc = S.decoRates;

  const cfg = UI.cfg = UI.cfg && UI.cfg.id === id ? UI.cfg : {
    id, colour:(imgs[0] || p.colours[0]), qty:p.moq,
    placements:[{pos:p.pos[0], method:p.pers[0], size:'small', colours:1, art:null}],
  };
  if(!p.colours.includes(cfg.colour)) cfg.colour = p.colours[0];

  const q = rc && !p.quoteOnly ? quoteLines(p, rc, cfg) : null;
  const shot = IM[cfg.colour] || (imgs.length ? IM[imgs[0]] : null);
  const first = (p.breaks||[])[0];
  const used = cfg.placements.map(x => x.pos);
  const canAdd = cfg.placements.length < 3 && p.pos.some(x => !used.includes(x));
  const mult = (rc && rc.mult) || 1.55;
  const xp = 1;

  /* cost of one placement as configured, above what the price already covers */
  const extraFor = (pl, i) => {
    if(!rc) return 0;
    const full = placementUnit(rc, pl, cfg.qty);
    return Math.max(0, full - includedUnit(rc, cfg.qty, i)) * mult;
  };

  return pubShell(`
  <section class="pub-sec pub-sec--tight">
    <div class="pub-wrap">
      <nav class="crumb">${crumb(
        [['Merchandise','merch'], ['All products','products'],
         ...(p.cat ? [[esc(p.cat), 'collection:' + catSlug(p.cat)]] : [])], p.name)}</nav>

      <div class="pdp">
        <!-- media ------------------------------------------------------ -->
        <div class="pdp-media">
          <div class="pdp-rail">
            ${imgs.slice(0,8).map(c => `
              <button class="pdp-thumb ${c===cfg.colour?'on':''}" data-act="cfgColour" data-c="${c}"
                aria-label="${esc(COLOURS[c]?COLOURS[c].name:c)}"><img src="${IM[c]}" alt="" loading="lazy"></button>`).join('')}
          </div>
          <div class="pdp-hero">
            <div class="pdp-badges">
              <span class="chip">${esc(p.lead)}</span>
              <span class="chip">Min ${p.moq}</span>
              <span class="chip">${(p.colours || []).length} colours</span>
            </div>
            ${shot ? `<img src="${shot}" alt="${esc(p.name)} in ${esc(COLOURS[cfg.colour]?COLOURS[cfg.colour].name:'')}">`
                   : `<span style="font-size:88px">${p.glyph}</span>`}
          </div>
          <div class="place-map">
            <div class="place-map-h">
              <span class="eyebrow">Where your identity goes</span>
              <span class="t-xs muted">${cfg.placements.length} of 3</span>
            </div>
            <div class="place-grid">
              ${p.pos.map(x => {
                const ix = used.indexOf(x);
                const full = ix === -1 && cfg.placements.length >= 3;
                return `<button class="place-cell ${ix>-1?'on':''}" data-act="togglePlace" data-p="${x}"
                  ${full?'disabled':''}>
                  <span class="place-n">${ix>-1 ? ix+1 : '+'}</span>
                  <span>${esc(S.positions_lib[x]||x)}</span></button>`;}).join('')}
            </div>
          </div>
        </div>

        <!-- options ---------------------------------------------------- -->
        <div class="pdp-cfg">
          <h1 class="t-h2">${esc(p.name)}</h1>
          <div class="wrap-row" style="gap:8px;margin-top:8px">
            <span class="mono-ref">${p.ref}</span>
            <span class="t-xs muted">${esc(p.ss||'')}</span>
            ${p.weight ? `<span class="chip">${p.weight} g/m²</span>` : ''}
            <span class="chip">${p.colours.length} colours</span>
          </div>
          ${!p.quoteOnly ? `<div class="pdp-from">${money(p.from)}
            <span class="t-sm muted" style="font-size:14px">per piece from ${p.moq}</span></div>` : ''}

          <div class="pdp-step">
            <div class="step-h"><span class="step-n">1</span><span class="step-t">Colour</span>
              <span class="step-v">${esc(COLOURS[cfg.colour]?COLOURS[cfg.colour].name:cfg.colour)}</span></div>
            <div class="sw-grid">
              ${p.colours.map(c => `<button class="pdp-sw ${c===cfg.colour?'on':''}" data-act="cfgColour"
                data-c="${c}" title="${esc(COLOURS[c]?COLOURS[c].name:c)}"
                style="background:${COLOURS[c]?COLOURS[c].hex:'#ccc'}"></button>`).join('')}
            </div>
          </div>

          ${p.quoteOnly ? '' : `
          <div class="pdp-step">
            <div class="step-h"><span class="step-n">2</span><span class="step-t">Quantity</span>
              <span class="step-v">${cfg.qty} pieces</span></div>
            <div class="qgrid">
              ${p.breaks.map(b => {
                const save = first && first.price ? Math.round((1 - b.price/first.price)*100) : 0;
                return `<button class="qcard ${b.qty===cfg.qty?'on':''}" data-act="cfgQtyTier" data-q="${b.qty}">
                  <b class="num">${b.qty}</b>
                  <span class="num">${money(b.price)}</span>
                  <em>${save>0?'−'+save+'%':''}</em></button>`;}).join('')}
            </div>
            <label class="fld fld--qty"><span class="fld-l">Exact quantity</span>
              <input class="inp inp--sm" type="number" min="${p.moq}" step="1" id="cfgqty" value="${cfg.qty}"
                data-act="cfgQtyExact" aria-describedby="qtyhint">
              <span class="fld-h t-xs muted" id="qtyhint">Minimum ${p.moq} pieces. The tiers above are shortcuts — enter the number you actually need.</span></label>
            <p class="opt-hint">Price shown is per piece at that quantity, for the product and the included spec. Sizes can follow: quantity is the number of pieces.</p>
          </div>`}
          ${p.quoteOnly ? `
          <div class="pdp-step">
            <div class="step-h"><span class="step-n">2</span><span class="step-t">Quantity</span>
              <span class="step-v">${cfg.qty} pieces</span></div>
            <label class="fld fld--qty"><span class="fld-l">Exact quantity</span>
              <input class="inp inp--sm" type="number" min="1" step="1" id="cfgqty" value="${cfg.qty}"
                data-act="cfgQtyExact">
              <span class="fld-h t-xs muted">We price this product manually, and we still need the quantity to do it.</span></label>
          </div>` : ''}

          <div class="pdp-step">
            <div class="step-h"><span class="step-n">${p.quoteOnly?2:3}</span>
              <span class="step-t">Personalisation</span>
              <span class="step-v">${cfg.placements.length} placement${cfg.placements.length>1?'s':''} · two included</span></div>

            ${cfg.placements.map((pl, i) => {
              const extra = extraFor(pl, i);
              return `
              <div class="place-card">
                <div class="place-card-h">
                  <span class="place-badge">${i+1}</span>
                  <select class="inp inp--sm" data-act="plPos" data-i="${i}" style="flex:1">
                    ${p.pos.map(x => `<option value="${x}" ${x===pl.pos?'selected':''}
                      ${used.includes(x)&&x!==pl.pos?'disabled':''}>${esc(S.positions_lib[x]||x)}</option>`).join('')}
                  </select>
                  <span class="t-sm num ${extra>0.004?'':'muted'}">${extra>0.004?'+'+money(extra):'included'}</span>
                  ${cfg.placements.length > 1
                    ? `<button class="btn btn--quiet btn--sm" data-act="rmPlace" data-i="${i}">Remove</button>` : ''}
                </div>
                <div class="place-opts">
                  <div><span class="opt-lbl">Method</span>
                    <div class="wrap-row" style="gap:4px">
                      ${p.pers.map(m => `<button class="qty-pill sm ${m===pl.method?'on':''}"
                        data-act="plMethod" data-i="${i}" data-m="${m}">${esc((S.personalization[m]||{}).name||m)}</button>`).join('')}
                    </div></div>
                  <div><span class="opt-lbl">Size<span class="opt-cost">${
                      pl.size==='small'?'up to 99 mm':pl.size==='medium'?'100–150 mm':'over 150 mm'}</span></span>
                    <div class="wrap-row" style="gap:4px">
                      ${['small','medium','large'].map(z => `<button class="qty-pill sm ${z===pl.size?'on':''}"
                        data-act="plSize" data-i="${i}" data-z="${z}">${z[0].toUpperCase()+z.slice(1)}</button>`).join('')}
                    </div></div>
                  ${pl.method === 'screen' ? `
                  <div><span class="opt-lbl">Ink colours</span>
                    <div class="wrap-row" style="gap:4px">
                      ${[1,2,3,4].map(n => `<button class="qty-pill sm ${n===pl.colours?'on':''}"
                        data-act="plColours" data-i="${i}" data-n="${n}">${n}</button>`).join('')}
                    </div></div>` : ''}
                  <div><span class="opt-lbl">Artwork</span>
                    ${pl.art
                      ? `<div class="art-on"><span>▣ ${esc(pl.art)}</span>
                          <button class="btn btn--quiet btn--sm" data-act="plArtClear" data-i="${i}">Replace</button></div>`
                      : `<button class="art-drop" data-act="plArt" data-i="${i}">
                          <span class="med">Upload your logo</span>
                          <span class="opt-hint" style="margin:0">Vector preferred — AI, EPS, PDF or SVG.
                            You can also send it later.</span></button>`}
                  </div>
                </div>
              </div>`;}).join('')}

            ${canAdd ? `<button class="btn btn--ghost btn--block" data-act="addPlace">
              + Add placement ${cfg.placements.length + 1} of 3</button>`
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
                <span class="num">${l.unit >= 0.005 ? money(l.unit) : 'included'}</span></div>`).join('')}
              <div class="sum-row sum-sep"><span class="med">Per piece</span>
                <span class="num med">${money(q.unit * xp)}</span></div>
              <div class="sum-row"><span class="muted">× ${cfg.qty} pieces</span>
                <span class="num">${money(q.goods * xp)}</span></div>
              ${q.setup.map(su => `<div class="sum-row">
                <span class="muted">${esc(su.name)} setup<span class="sum-note">one-off, per job — not per piece</span></span>
                <span class="num">${su.unknown ? '<span class="chip">quoted</span>' : money(su.cost)}</span></div>`).join('')}
              <div class="sum-total"><span>Total</span><span class="num">${money(q.total * xp)}</span></div>
              <div class="sum-eff">${money(q.effective * xp)} per piece with the setup spread over ${cfg.qty} pieces · excludes VAT</div>
            </div>
            <div class="sum-row sum-sep"><span class="muted">Setup charges</span>
              <span class="num">${q.setup.length ? 'shown above' : 'none for this configuration'}</span></div>
            <div class="sum-row"><span class="muted">Delivery</span>
              <span class="num">confirmed in the reviewed quote</span></div>
            <div class="sum-row"><span class="muted">Tax</span><span class="num">excl. VAT</span></div>
            <div class="pdp-deliver" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--line)">
              <div><div class="t-xs muted">Estimated production</div>
                <div class="t-sm med">${esc(p.lead)} from approval</div>
                <div class="t-xs muted">Production time is not an arrival date. Destination and schedule are confirmed with the quote.</div></div>
              <button class="btn btn--quiet btn--sm" data-act="askEarlier">Ask about an earlier date</button>
            </div>
          </div>`}

          <button class="btn btn--primary btn--lg btn--block" style="margin-top:16px"
            data-act="addToQuote" data-id="${p.id}">${UI.editLine != null ? 'Update this line' : 'Add to quote'}</button>
          <button class="btn btn--ghost btn--block" style="margin-top:8px" data-act="artHelp" data-id="${p.id}">
            Request help with this item</button>
          <p class="t-xs muted" style="margin-top:10px">Adding this to your quote does not place an order and
            nothing is charged. We review the configuration, artwork and availability before confirming the quote.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight">
    <div class="pub-wrap">
      <div class="tabs" style="margin-bottom:24px">
        ${['Specification','Decoration limits','Sizes & colours','How it works'].map(t =>
          `<button class="tab ${(UI.pdpTab||'Specification')===t?'tab--on':''}"
            data-act="pdpTab" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      ${pdpTabBody(p, p.deco || [])}
    </div>
  </section>

  <section class="pub-sec pub-sec--tight surface-2 sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'Start from a template', 'Applied to this garment')}
      <div class="grid grid-auto">
        ${['CHEST_MARK','BACK_STATEMENT','SLEEVE_DETAIL','FULL_FRONT','WOVEN_LABEL'].map(t =>
          ph('TEMPLATE_' + t, '4x5', t.replace(/_/g, ' ').toLowerCase() + ' shown on this garment, at real scale')).join('')}
      </div>
      <p class="t-xs muted note">A template is an example placement at a real size, not a proof of your artwork.
        Each one is photographed on the actual garment before it is published here.</p>
    </div>
  </section>

  <section class="pub-sec pub-sec--tight sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'More in ' + esc(catName(p.cat).toLowerCase()), catList(p.cat).length + ' in this collection')}
      <div class="grid grid-auto">
        ${S.merchProducts.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4).map(pcard).join('')}
      </div>
    </div>
  </section>

  ${(() => {
    const other = S.merchProducts.filter(x => x.cat !== p.cat && prodImg(x));
    const pick = ['Accessories','T-shirts','Sweatshirts','Outerwear','Polos']
      .filter(c => c !== p.cat)
      .map(c => other.find(x => x.cat === c)).filter(Boolean).slice(0, 5);
    const list = pick.length ? pick : other.slice(0, 5);
    return `
  <section class="pub-sec pub-sec--tight surface-2 sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'Goes well with', 'Across the catalogue')}
      <div class="grid grid-auto">${list.map(pcard).join('')}</div>
    </div>
  </section>`;})()}

  ${(() => { const c = CASES[0]; return `
  <section class="pub-sec sec--red">
    <div class="pub-wrap">
      ${secIx('—', 'A programme we produced', esc(c.status))}
      <div class="split split--wide">
        <div class="split-b hovr" data-go="public:case:${c.id}">
          ${fig(imgOf(c.img), c.title, c.status, c.sector, '3x2')}
        </div>
        <div class="split-b">
          <blockquote class="pull" style="margin:0">“${esc(c.constraint)}”</blockquote>
          <p class="t-sm muted" style="margin-top:var(--sp-5)">${esc(c.title)} · ${esc(c.scope)}</p>
          <div style="margin-top:var(--sp-5)" data-go="public:case:${c.id}">${arrow('Read the full project')}</div>
        </div>
      </div>
    </div>
  </section>`;})()}

  ${reviewsSlot()}

  ${faqSection('merch', '—')}

  <div class="buybar">
    <div class="buybar-in">
      <div class="buybar-fig">
        <b class="num">${p.quoteOnly ? 'Price on request' : money(q.total * xp)}</b>
        <span>${p.quoteOnly ? 'quoted within a working day'
          : money(q.effective * xp) + ' per piece · ' + cfg.qty + ' pcs · '
            + cfg.placements.length + ' placement' + (cfg.placements.length>1?'s':'')}</span>
      </div>
      <span class="spacer"></span>
      <button class="btn btn--primary" data-act="addToQuote" data-id="${p.id}">
        ${UI.editLine != null ? 'Update this line' : 'Add to quote'}</button>
    </div>
  </div>
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
          <dt>Supplier reference</dt><dd class="num">${esc(p.ss||'—')}</dd>
          <dt>Category</dt><dd>${esc(p.cat)}</dd>
          ${p.weight ? `<dt>Weight</dt><dd>${p.weight} g/m²</dd>` : ''}
          ${p.materials ? `<dt>Composition</dt><dd>${esc(p.materials)}</dd>` : ''}
          <dt>Colours</dt><dd>${p.colours.length}</dd>
          <dt>Sizes</dt><dd>${(p.sizes||[]).length || 1}</dd>
          <dt>Minimum order</dt><dd>${p.moq} pieces</dd>
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
          ${[['A third placement','Anything beyond the two included.'],
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
    text:`Needed for an ${country} delivery, or tick that you are not registered.`};
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
        <div class="vat">
          <label class="fld"><span class="fld-l">VAT number ${a['No VAT'] ? '<span class="muted">(not registered)</span>' : ''}</span>
            <div class="vat-row">
              <span class="vat-cc">${v.code}</span>
              <input class="inp inp--lg" type="text" name="VAT" value="${esc(a['VAT'] || '')}"
                placeholder="${esc((EU_VAT[v.code] || [])[1] || '')}" ${a['No VAT'] ? 'disabled' : ''}>
              <button class="btn btn--ghost" data-act="checkVat" ${a['No VAT'] ? 'disabled' : ''}>Check</button>
            </div>
            ${err['VAT'] ? `<span class="fld-e t-xs">${err['VAT']}</span>` : ''}
          </label>
          <div class="banner banner--${tone}"><div>
            <div class="banner-d">${esc(v.text)}</div></div></div>
          <label class="chk"><input type="checkbox" data-act="noVat" ${a['No VAT'] ? 'checked' : ''}>
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
  const rows = (side, title, note) => `
    <div class="card">
      <div class="eyebrow">${title}</div>
      <p class="t-xs muted" style="margin:8px 0 16px">${note}</p>
      <div class="stack-2">
        ${S.users.filter(u => u.side === side).map(u => `
          <button class="rw" data-act="login" data-u="${u.id}" style="border:1px solid var(--line);padding:12px">
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
      ${rows('customer','Customer — Grup Marítim Hotels','Marta sees everything on the company account. Jordi is a member scoped to one project only.')}
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
        <div class="brand brand--sm" data-go="${side==='customer'?'account:overview':'studio:overview'}">PAMUUC<span class="brand-bar">|</span><span class="brand-sub">${side==='customer'?'ACCOUNT':'STUDIO'}</span></div>
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
            ${p.nextMilestone ? `<div class="factline"><span>Next</span><span class="muted">${esc(p.nextMilestone)}</span></div>` : ''}
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
          <div><div class="stage-lbl">Next milestone</div><div class="stage-txt muted">${esc(p.nextMilestone || '—')}</div></div>
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

    <div class="stagehd" style="margin-bottom:24px">
      <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;margin-bottom:20px">
        <div>
          <div class="row" style="gap:8px"><h1 class="t-h3">${esc(p.name)}</h1>${pill(p.opStatus)}</div>
          <div class="mono-ref" style="margin-top:4px">${p.ref} · version ${p.version}, published ${dateTime(p.publishedAt)}</div>
        </div>
        ${v.approvals.length ? `<button class="btn btn--primary" data-act="openApproval" data-id="${v.approvals[0].id}">
          ${esc(v.approvals[0].kind.length > 34 ? 'Review approval' : v.approvals[0].kind)}</button>` : ''}
      </div>
      <div class="tl">
        ${p.stages.map(sid => {
          const i = p.stages.indexOf(sid);
          return `<div class="tl-s ${i<cur?'tl-s--done':i===cur?'tl-s--now':''}">
            <div class="tl-n">${stageDef(sid).name}</div>
            <div class="tl-m">${i<cur?'✓ Complete':i===cur?st(p.opStatus).label:'Not started'}</div></div>`;}).join('')}
      </div>
      <p class="t-sm muted" style="margin-top:16px;max-width:80ch">${esc(v.stageBlurb)}</p>
      <div class="stage-now">
        <div class="stage-col"><div class="stage-lbl">What PAMUUC is doing</div><div class="stage-txt">${esc(v.doing)}</div></div>
        <div class="stage-col"><div class="stage-lbl">What you need to do</div><div class="stage-txt med">${esc(v.youDo)}</div></div>
        <div class="stage-col"><div class="stage-lbl">Responsible now</div><div class="stage-txt">${esc(v.responsible)}</div></div>
        <div class="stage-col"><div class="stage-lbl">What happens next</div><div class="stage-txt muted">${esc(v.next)}</div></div>
      </div>
    </div>

    ${v.gate.blocked ? `
      <div class="banner banner--wait" style="margin-bottom:24px"><div>
        <div class="banner-t">${esc(v.gate.label)} — ${st(v.gate.state).label.toLowerCase()}</div>
        <div class="banner-d">${esc(v.gate.why)}</div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn btn--primary btn--sm" data-go="account:documents">Go to Documents</button></div>
      </div></div>` : ''}

    <div class="cols">
      <div class="stack-6">
        ${accStageWorkspace(p, v)}

        <section>
          <h2 class="t-h4" style="margin-bottom:12px">Project conversation</h2>
          <div class="card">
            ${cv && cv.messages.filter(m=>!m.internal).length ? cv.messages.filter(m=>!m.internal).map(m => `
              <div class="msg">
                <span class="av ${user(m.by).side==='studio'?'av--studio':''}">${user(m.by).init}</span>
                <div class="msg-b">
                  <div class="msg-h"><span class="msg-a">${esc(user(m.by).name)}</span>
                    <span class="msg-r">${user(m.by).side==='studio'?'PAMUUC':esc(myAccount().name)} · ${dateTime(m.at)}</span></div>
                  <div class="msg-t">${esc(m.text)}</div>
                </div>
              </div>`).join('') : '<p class="t-sm muted">No messages yet.</p>'}
            <div style="margin-top:16px">
              <textarea class="inp" id="msgbox" placeholder="Write to ${esc(user(p.am).name)}…"></textarea>
              <div class="btn-row" style="margin-top:8px;justify-content:space-between">
                <span class="t-xs faint">You will get an email saying we replied, with a link back here. We keep the detail on the platform.</span>
                <button class="btn btn--primary btn--sm" data-act="send" data-cv="${cv?cv.id:''}">Send</button>
              </div>
            </div>
          </div>
        </section>

        ${cur > 0 ? `
        <section>
          <details class="card">
            <summary style="cursor:pointer" class="t-h5">History — ${cur} completed stage${cur>1?'s':''}</summary>
            <div class="stack-3" style="margin-top:16px">
              ${p.stages.slice(0,cur).map(sid => `
                <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
                  <div><div class="t-sm med">${stageDef(sid).name}</div>
                    <div class="t-xs muted">${esc(stageDef(sid).blurb)}</div></div>
                  ${pill('complete')}</div>`).join('')}
              ${S.changeRequests.filter(c=>c.project===p.id&&c.state==='incorporated').map(c => `
                <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
                  <div><div class="t-sm med">${esc(c.title)}</div>
                    <div class="t-xs muted">${esc(c.outcome||'')}</div></div>${pill('incorporated')}</div>`).join('')}
            </div>
          </details>
        </section>` : ''}
      </div>

      <div class="stack">
        <div class="card">
          <div class="eyebrow">Your Account Manager</div>
          <div class="row" style="margin-top:12px">
            <span class="av av--studio">${user(p.am).init}</span>
            <div><div class="t-sm med">${esc(user(p.am).name)}</div>
              <div class="t-xs muted">${esc(user(p.am).title)}</div></div>
          </div>
        </div>

        <div class="card">
          <div class="eyebrow">Files and documents</div>
          <div class="stack-2" style="margin-top:12px">
            ${files.length ? files.map(d => `
              <button class="row-between" data-go="account:documents" style="width:100%;background:transparent;border:0;padding:8px 0;cursor:pointer;text-align:left;border-bottom:1px solid var(--line)">
                <span><span class="t-sm">${esc(d.title)}</span>
                  <span class="mono-ref" style="display:block">${d.num}</span></span>
                ${pill(d.state)}</button>`).join('')
              : '<p class="t-sm muted">Nothing shared yet.</p>'}
          </div>
        </div>

        <div class="card">
          <div class="eyebrow">Activity</div>
          <div class="feed" style="margin-top:12px">
            ${feed.map((e,i) => `<div class="fe ${i===0?'fe--now':''}">
              <div class="t-sm">${esc(e.text)}</div>
              <div class="fe-m">${dateTime(e.at)}</div></div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `);
}

/* ---- Stage workspaces --------------------------------------------------- */
function accStageWorkspace(p, v){
  if(p.stage === 'design')            return accWsDesign(p, v);
  if(p.stage === 'development')       return accWsDevelopment(p, v);
  if(p.stage === 'prototype_fitting') return accWsFitting(p, v);
  if(p.stage === 'pre_production')    return accWsPrePro(p, v);
  if(p.stage === 'production')        return accWsProduction(p, v);
  return accWsDelivery(p, v);
}

function accWsDesign(p, v){
  return `<section><h2 class="t-h4" style="margin-bottom:12px">Design</h2>
    <div class="card">
      <div class="banner"><div><div class="banner-t">Waiting for design</div>
        <div class="banner-d">Our design partner is working from your brief. We will publish the concepts here for review, and propose dates for a design review meeting.</div></div></div>
      <div class="sep"></div>
      <div class="eyebrow">Confirmed brief</div>
      <p class="t-sm" style="margin-top:8px">${esc(p.brief)}</p>
    </div></section>`;
}

function accWsDevelopment(p, v){
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
      <div class="gcard-th">${g.glyph}</div>
      <div style="flex:1;min-width:0">
        <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            <div class="t-h5">${esc(g.name)}</div>
            <div class="mono-ref">${b.ref} ${g.baseV} · revision ${g.rev}</div>
          </div>
          ${pill(g.state)}
        </div>
        <div class="wrap-row" style="margin-top:10px;gap:8px">
          <span class="chip">${esc(FABRICS[g.fabric].name)}</span>
          <span class="chip">${esc(S.personalization[g.pers.method].name)} · ${esc(S.positions_lib[g.pers.pos])}</span>
          ${FABRICS[g.fabric].prov ? '<span class="chip">Provenance on file</span>' : ''}
        </div>
      </div>
    </div>
    <div class="gcard-b">
      ${editable ? `
      <label class="field" style="margin-bottom:16px">
        <span class="field-l">Fabric</span>
        <span class="field-h">Only fabrics we have mapped to this garment base are offered. Ask us if you want one that is not here.</span>
        <select class="inp" data-act="pickFabric" data-g="${g.id}" style="max-width:340px">
          ${b.fabrics.map(f => `<option value="${f}" ${f===g.fabric?'selected':''}>${esc(FABRICS[f].name)} — ${esc(FABRICS[f].spec)}</option>`).join('')}
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

function accWsFitting(p, v){
  const meeting = S.meetings.find(m => m.project === p.id && ['proposed','alternative'].includes(m.state));
  const accepted = S.meetings.find(m => m.project === p.id && m.state === 'accepted');
  const approvedN = v.garments.filter(g => g.state === 'approved').length;
  return `
  <section>
    <div class="row-between" style="margin-bottom:12px">
      <h2 class="t-h4">Prototype fitting</h2>
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
                  <span class="t-sm num">${cw.qty} pieces
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
            ${q.total ? `<div class="factline"><span>Indicative</span><span class="num med">${money(q.total)}</span></div>` : ''}
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
        <button class="btn btn--ghost btn--sm" data-act="openDoc" data-id="${d.id}">Open</button>
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
  const cvs = S.conversations.filter(c => c.account === acc.id);
  const openId = UI.openCv || (cvs[0] && cvs[0].id);
  const cv = by(S.conversations, openId);
  return accShell('messages', 'Messages', `
    <div class="page-hd"><h1 class="t-h2">Messages</h1>
      <p class="page-sub">One conversation per project. We reply here, and email you a pointer rather than reproducing project detail in your inbox.</p></div>
    <div class="cols">
      <div class="card">
        ${cv ? `
          <div class="row-between" style="margin-bottom:16px">
            <div><div class="t-h5">${esc(project(cv.project).name)}</div>
              <div class="mono-ref">${project(cv.project).ref}</div></div>
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
          <div class="row-between"><span class="t-sm med">${esc(project(c.project).name)}</span>
            ${c.state==='needs_reply'?'<span class="dot"></span>':''}</div>
          <div class="t-xs muted" style="margin-top:4px">${c.messages.filter(m=>!m.internal).length} messages · ${ago(c.messages[c.messages.length-1]?.at)}</div>
        </button>`).join('')}
      </div>
    </div>
  `);
}

/* ---- Notifications ------------------------------------------------------ */
function accNotifications(){
  const ns = S.notifications.filter(n => n.to === 'customer');
  const filt = UI.nFilter || 'All';
  const list = filt === 'All' ? ns : filt === 'Action required' ? ns.filter(n=>n.action) : ns.filter(n=>!n.action);
  return accShell('notifications', 'Notifications', `
    <div class="page-hd"><div class="row-between">
      <div><h1 class="t-h2">Notifications</h1>
        <p class="page-sub">Action required is separated from updates on purpose. A badge appears only when something is genuinely waiting on you.</p></div>
      <button class="btn btn--ghost btn--sm" data-act="markRead">Mark all read</button>
    </div></div>
    <div class="tabs" style="margin-bottom:20px">
      ${['All','Action required','Updates'].map(t => `<button class="tab ${filt===t?'tab--on':''}" data-act="nFilter" data-t="${t}">${t}</button>`).join('')}
    </div>
    ${list.length ? `<div class="rows">${list.map(n => `
      <button class="rw" ${n.project?`data-go="account:project:${n.project}"`:''}>
        ${n.action ? '<span class="rw-flag rw-flag--wait"></span>' : ''}
        <span class="rw-main">
          <span class="rw-t">${esc(n.text)}</span>
          <span class="rw-s">${dateTime(n.at)}${n.project?' · '+esc(project(n.project).name):''}</span>
        </span>
        <span class="rw-side">
          ${n.action ? pill('waiting_customer') : pill('published')}
          ${!n.read ? '<span class="dot"></span>' : ''}
        </span></button>`).join('')}</div>`
      : '<div class="empty"><div class="empty-t">Nothing here</div><div class="empty-d">You are up to date.</div></div>'}
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
            : i.state === 'qualified' ? `
              <p class="t-sm muted" style="margin-bottom:16px">Accepted. Arrange the first discovery call — an account is not opened before it happens.</p>
              <button class="btn btn--primary" data-act="inqSchedule" data-id="${i.id}">Schedule the first call</button>`
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
    </div></div>
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

/* ---- Project detail ------------------------------------------------------ */
function stProject(id){
  const p = project(id);
  if(!p) return stShell('projects','Project','<div class="empty">Not found.</div>');
  const u = user(SESSION.user);
  const v = views.studioProject(p, u);
  const cur = p.stages.indexOf(p.stage);
  const tab = UI.prjTab || 'Overview';
  const tabs = ['Overview','Roles & garments','Changes & approvals','Commercials','Conversation','Activity & audit'];
  const cv = S.conversations.find(c => c.project === p.id);
  const ns = nextStage(p);

  return stShell('projects', p.name, `
    <div class="crumbs" style="margin-bottom:16px">
      <a data-go="studio:projects">Projects</a><span>›</span>
      <a data-go="studio:customer:${p.account}">${esc(account(p.account).name)}</a><span>›</span><span>${p.ref}</span></div>

    <div class="stagehd" style="margin-bottom:24px">
      <div class="row-between" style="align-items:flex-start;flex-wrap:wrap;gap:16px;margin-bottom:20px">
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
          ${ns && can(u,'phase_advance','do',{project:p.id}) ? `<button class="btn btn--ghost btn--sm" data-act="advance" data-p="${p.id}"
            ${v.blockers.length?'':''}>Advance to ${stageDef(ns).name}</button>` : ''}
        </div>
      </div>
      <div class="tl">
        ${p.stages.map(sid => {
          const i = p.stages.indexOf(sid);
          return `<div class="tl-s ${i<cur?'tl-s--done':i===cur?'tl-s--now':''}">
            <div class="tl-n">${stageDef(sid).name}</div>
            <div class="tl-m">${i<cur?'✓':i===cur?st(p.opStatus).label:''}</div></div>`;}).join('')}
      </div>
      <div class="stage-now">
        <div class="stage-col"><div class="stage-lbl">Waiting on</div><div class="stage-txt med">${esc(v.responsible)}</div></div>
        <div class="stage-col"><div class="stage-lbl">Next milestone</div><div class="stage-txt">${esc(p.nextMilestone || '—')}</div></div>
        <div class="stage-col"><div class="stage-lbl">Next commercial gate</div>
          <div class="stage-txt">${v.gate.blocked ? esc(v.gate.label)+' — '+st(v.gate.state).label.toLowerCase() : 'None outstanding'}</div></div>
        <div class="stage-col"><div class="stage-lbl">Open blockers</div>
          <div class="stage-txt ${v.blockers.length?'':''}">${v.blockers.length || 'None'}</div></div>
      </div>
    </div>

    ${v.blockers.length ? `<div class="banner banner--stop" style="margin-bottom:24px"><div>
      <div class="banner-t">${v.blockers.length} thing${v.blockers.length>1?'s':''} between this project and ${ns?stageDef(ns).name:'completion'}</div>
      <ul class="stack-2" style="margin-top:8px">
        ${v.blockers.map(b => `<li class="t-sm">· ${esc(b.text)}<br><span class="t-xs muted">${esc(b.why)}</span></li>`).join('')}
      </ul>
      ${can(u,'phase_override','do') ? `<div class="btn-row" style="margin-top:12px">
        <button class="btn btn--danger btn--sm" data-act="override" data-p="${p.id}">Override the gate with a recorded reason</button>
      </div>` : '<p class="t-xs muted" style="margin-top:8px">Only Master can override a gate.</p>'}
    </div></div>` : ''}

    <div class="tabs" style="margin-bottom:20px">
      ${tabs.map(t => `<button class="tab ${tab===t?'tab--on':''}" data-act="prjTab" data-t="${esc(t)}">${t}
        ${t==='Changes & approvals' && v.allCRs.filter(c=>['submitted','under_review'].includes(c.state)).length
          ? ` (${v.allCRs.filter(c=>['submitted','under_review'].includes(c.state)).length})` : ''}</button>`).join('')}
    </div>

    <div class="cols cols--wide">
      <div>${stProjectTab(p, v, tab, u, cv)}</div>
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

        ${v.showCost ? `<div class="card"><div class="eyebrow">Cost and margin</div>
          <dl class="kv" style="margin-top:12px">
            <dt>Estimated cost</dt><dd class="num">${money(projectPieces(p)*22.4)}</dd>
            <dt>Customer value</dt><dd class="num">${money(projectPieces(p)*57.9)}</dd>
            <dt>Gross margin</dt><dd class="num" style="color:var(--go)">61.3%</dd>
          </dl>
          <p class="t-xs faint" style="margin-top:8px">Hidden from Account Managers by default and never projected into the customer view.</p>
        </div>` : `<div class="card card--quiet"><div class="eyebrow">Cost and margin</div>
          <p class="t-xs muted" style="margin-top:8px">Hidden for your role. The field is not fetched, not just visually suppressed.</p></div>`}
      </div>
    </div>
  `);
}

function stProjectTab(p, v, tab, u, cv){
  if(tab === 'Roles & garments') return `
    <div class="stack">
      ${p.positions.map(pos => `
        <div class="card card--flush">
          <div class="row-between" style="padding:16px 20px;border-bottom:1px solid var(--line)">
            <div><div class="t-h5">${esc(pos.name)}</div>
              <div class="t-xs muted">${pos.people} people · ${pos.garments.length} garments</div></div>
            <button class="btn btn--ghost btn--sm" data-act="addGarment" data-p="${p.id}" data-pos="${pos.id}">Add a garment from Bases</button>
          </div>
          <div style="padding:16px 20px" class="stack-3">
            ${pos.garments.map(gid => { const g = garment(gid); if(!g) return '';
              return `<div class="row-between" style="padding:12px;border:1px solid var(--line);gap:12px;flex-wrap:wrap">
                <div class="row" style="gap:12px;flex:1;min-width:200px">
                  <span style="font-size:22px">${g.glyph}</span>
                  <div><div class="t-sm med">${esc(g.name)}</div>
                    <div class="mono-ref">${base(g.base).ref} ${g.baseV} · rev ${g.rev} · ${esc(FABRICS[g.fabric].name)}</div></div>
                </div>
                <div class="row" style="gap:8px;flex-wrap:wrap">
                  <span class="chip">Round ${g.round}/3</span>
                  ${pill(g.state)}
                  ${g.state==='changes_requested' && g.round < 3 ? `<button class="btn btn--primary btn--sm" data-act="authRound" data-g="${g.id}">Authorise round ${g.round+1}</button>`:''}
                  ${g.state==='in_development' && p.stage==='prototype_fitting' ? `<button class="btn btn--ghost btn--sm" data-act="readyFit" data-g="${g.id}">Mark ready for fitting</button>`:''}
                  ${g.state==='manual_resolution' ? `<button class="btn btn--danger btn--sm" data-act="resolveG" data-g="${g.id}">Resolve</button>`:''}
                </div>
              </div>`;}).join('')}
          </div>
        </div>`).join('')}
    </div>
    <p class="t-xs muted" style="margin-top:16px">Each garment carries its own state and round counter. The project stays in Prototype Fitting while any required garment is unresolved; approved garments stay locked regardless.</p>`;

  if(tab === 'Changes & approvals') return `
    <div class="stack-6">
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

      <section><h2 class="t-h4" style="margin-bottom:12px">Approvals</h2>
        <div class="rows">${v.allApprovals.map(a => `<div class="rw rw--static">
          <span class="rw-main"><span class="rw-t">${esc(a.kind)}</span>
            <span class="rw-s">${esc(a.rev)} · due ${dateShort(a.due)}${a.decidedAt?` · decided ${dateTime(a.decidedAt)} by ${esc(user(a.decidedBy).name)}`:''}</span></span>
          <span class="rw-side">${pill(a.state)}</span></div>`).join('')}</div>
        <p class="t-xs muted" style="margin-top:12px">Every approval references a fixed revision, so a later edit cannot inherit an old approval.</p>
      </section>
    </div>`;

  if(tab === 'Commercials') return `
    <div class="stack-6">
      <section><h2 class="t-h4" style="margin-bottom:12px">Commercial gates</h2>
        <div class="rows">
          ${Object.entries(p.gates).map(([k,val]) => `<div class="rw rw--static">
            <span class="rw-main"><span class="rw-t">${k.replace(/_/g,' ').replace(/^\w/,c=>c.toUpperCase())}</span>
              <span class="rw-s">${k==='development_invoice'?'Authorises technical files and prototype rounds':
                k==='production_proforma'?'Authorises production release':'Authorises external design work'}</span></span>
            <span class="rw-side">${pill(val)}</span></div>`).join('')}
        </div></section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Documents</h2>
        <div class="tw"><table class="tbl">
          <thead><tr><th>Document</th><th>Number</th><th>Issued</th><th class="tnum">Amount</th><th>Status</th><th>Visible</th><th></th></tr></thead>
          <tbody>${v.documents.map(d => `<tr>
            <td>${esc(d.title)}</td><td class="num">${d.num}</td><td>${dateShort(d.issued)}</td>
            <td class="tnum num">${money(d.amount)}</td><td>${pill(d.state)}</td>
            <td>${d.visible?'Yes':'<span class="faint">Internal</span>'}</td>
            <td>${!d.visible && can(u,'invoice','publish') ? `<button class="btn btn--ghost btn--sm" data-act="pubDoc" data-id="${d.id}">Publish</button>`:''}</td>
          </tr>`).join('')}</tbody></table></div>
        ${!can(u,'invoice','publish') ? '<p class="t-xs muted" style="margin-top:12px">Publishing invoices is a Finance or Master action. You can request one.</p>' : ''}
      </section>
    </div>`;

  if(tab === 'Conversation') return `
    <div class="card">
      ${cv ? cv.messages.map(m => `
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
          ${S.events.filter(e => e.project === p.id).slice(0,20).map((e,i) => `
            <div class="fe ${i===0?'fe--now':''}"><div class="t-sm">${esc(e.text)}</div>
              <div class="fe-m">${dateTime(e.at)} · ${esc(user(e.actor).name)}${e.customerVisible?'':' · internal'}</div></div>`).join('')}
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
  return `
    <div class="stack-6">
      <section><h2 class="t-h4" style="margin-bottom:12px">Brief</h2>
        <div class="card"><p class="t-sm">${esc(p.brief)}</p></div></section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Garment states</h2>
        <div class="tw"><table class="tbl">
          <thead><tr><th>Garment</th><th>Position</th><th>Base</th><th>Rev</th><th class="tnum">Round</th><th class="tnum">Pieces</th><th>State</th></tr></thead>
          <tbody>${v.garments.map(g => `<tr>
            <td><span class="med">${esc(g.name)}</span></td>
            <td>${esc(p.positions.find(x => x.id === g.position)?.name || '—')}</td>
            <td class="num">${base(g.base).ref} ${g.baseV}</td><td class="num">${g.rev}</td>
            <td class="tnum num" ${g.round>=3?'style="color:var(--stop);font-weight:700"':''}>${g.round}/3</td>
            <td class="tnum num">${g.colourways.reduce((t,c)=>t+c.qty,0)}</td>
            <td>${pill(g.state)}</td></tr>`).join('')}</tbody></table></div>
      </section>
      <section><h2 class="t-h4" style="margin-bottom:12px">Internal tasks</h2>
        <div class="rows">
          ${[['Chase lab-dip approval — Marítim blue','u_nuria','2026-09-12','flow'],
             ['Prepare the overcoat options paper for Marta','u_leo','2026-09-15','wait'],
             ['Confirm melton minimum with the Italian mill','u_nuria','2026-09-18','flow']]
            .map(([t,who,d,f]) => `<div class="rw rw--static">
              <span class="rw-main"><span class="rw-t">${t}</span>
                <span class="rw-s">${esc(user(who).name)} · due ${dateShort(d)}</span></span>
              <span class="rw-side">${pill(f==='wait'?'waiting_pamuuc':'in_progress')}</span></div>`).join('')}
        </div>
        <p class="t-xs muted" style="margin-top:12px">Internal tasks are never projected into the customer view.</p>
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
          <td class="tnum num">${x.used}</td><td>${pill(x.status)}</td></tr>`).join('')}</tbody></table></div>

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
            ${b.fabrics.map(f => `<div class="row-between"><span class="t-sm">${esc(FABRICS[f].name)}</span>
              <span class="t-xs muted">${esc(FABRICS[f].ref)}</span></div>`).join('')}
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
      <h2 class="t-h4" style="margin-bottom:12px">Decoration cost — expanded from the rate card</h2>
      <p class="t-sm muted" style="margin-bottom:12px">Cost only. Margin is applied later.</p>
      <div class="grid grid-2">${Object.entries(S.decoRates.methods).map(([meth,m]) => {
        const mine = S.decoRates.rates.filter(r => r.method === meth);
        return `<div class="card">
          <div class="row-between" style="align-items:baseline">
            <div class="t-h5">${esc(S.personalization[meth] ? S.personalization[meth].name : meth)}</div>
            <span class="t-xs muted">setup ${m.setup==null?'<span style="color:var(--wait)">none recorded</span>':money(m.setup)}</span>
          </div>
          <div class="tw" style="margin-top:12px;border:0;box-shadow:none">
          <table class="tbl" style="min-width:0"><thead><tr>
            ${m.pricedBy==='size'
              ? '<th>Band</th><th>Artwork</th><th class="tnum">Per piece</th>'
              : '<th>Qty</th>' + [1,2,3,4].filter(c=>m.mult[c]!=null).map(c=>`<th class="tnum">${c} col</th>`).join('')}
          </tr></thead><tbody>
            ${m.pricedBy==='size'
              ? ['small','medium','large'].map(b => { const r = mine.find(x=>x.band===b); if(!r) return '';
                  const range = b==='small'?`up to ${m.bandSmall} mm`:b==='medium'?`${m.bandSmall+1}–${m.bandMedium} mm`:`over ${m.bandMedium} mm`;
                  return `<tr><td>${b}${r.provisional?' <span class="chip" style="color:var(--wait)">provisional</span>':''}</td>
                    <td class="t-xs muted">${range}</td><td class="tnum num">${money(r.cost)}</td></tr>`; }).join('')
              : mine.filter(r=>r.qtyMin!=null).sort((a,b)=>a.qtyMin-b.qtyMin).map(r =>
                  `<tr><td class="num">${r.qtyMin}+${r.provisional?' <span class="chip" style="color:var(--wait)">prov.</span>':''}</td>` +
                  [1,2,3,4].filter(c=>m.mult[c]!=null).map(c=>`<td class="tnum num">${money(r.cost*m.mult[c])}</td>`).join('') + '</tr>').join('')}
          </tbody></table></div>
        </div>`; }).join('')}</div>
    </section>` : ''}

    ${S.merchQuotes.length ? `
    <section style="margin-bottom:32px">
      <h2 class="t-h4" style="margin-bottom:12px">Quote requests</h2>
      <div class="stack-3">${S.merchQuotes.map(q => `
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
          <div class="row-between" style="margin-top:12px">
            <span class="t-xs muted">${q.account?esc(account(q.account).name):'From the public website — no account yet'} · ${dateTime(q.at)}</span>
            <button class="btn btn--ghost btn--sm">Build a quote</button>
          </div>
        </div>`).join('')}</div>
    </section>` : ''}

    <h2 class="t-h4" style="margin-bottom:12px">Catalogue</h2>
    <div class="tw"><table class="tbl">
      <thead><tr><th>Ref</th><th>Product</th><th>Category</th><th class="tnum">Colours</th>
        <th class="tnum">MOQ</th><th class="tnum">From</th><th>Personalisation</th><th>Lead</th><th>Status</th></tr></thead>
      <tbody>${S.merchProducts.map(p => `<tr>
        <td class="num">${p.ref}</td>
        <td><span class="med">${p.glyph} ${esc(p.name)}</span>${p.handle?`<br><span class="mono-ref">/${esc(p.handle)}</span>`:''}</td>
        <td>${esc(p.cat)}</td>
        <td class="tnum num">${p.colours.length}${p.images&&p.images.length?` <span class="t-xs faint">· ${p.images.length} img</span>`:''}</td>
        <td class="tnum num">${p.moq}</td><td class="tnum num">${money(p.from)}</td>
        <td class="t-xs">${p.pers.map(x => S.personalization[x] ? S.personalization[x].name : x).join(', ')}</td>
        <td class="t-xs">${esc(p.lead)}</td><td>${pill(p.status || 'published')}</td></tr>`).join('')}</tbody></table></div>
    ${!can(u,'merch_publish','do') ? '<p class="t-xs muted" style="margin-top:12px">Publishing to the public catalogue is a Master action.</p>' : ''}
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
        <td>${!d.visible && can(u,'invoice','publish') ? `<button class="btn btn--ghost btn--sm" data-act="pubDoc" data-id="${d.id}">Publish</button>`:''}</td>
      </tr>`).join('')}</tbody></table></div>
  `);
}

/* ---- Communications ------------------------------------------------------- */
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
      ${['All','Needs reply','Waiting on customer'].map(t =>
        `<button class="tab ${filt===t?'tab--on':''}" data-act="cvFilter" data-t="${t}">${t}</button>`).join('')}
    </div>
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
    </div>
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
      ['Personalisation methods', Object.values(S.personalization).map(x=>x.name).join(', '), 'Global default'],
      ['Positions', Object.values(S.positions_lib).join(', '), 'Global default'],
      ['Size systems', SIZES.join(' · ') + ' and One size', 'Global default'],
    ])}

    ${sec('Commercial', [
      ['Default payment terms', '30 days from invoice date', 'Global default'],
      ['Grup Marítim payment terms', '30 days from invoice date', 'Override'],
      ['Clínica Bonanova payment terms', '45 days from invoice date', 'Override'],
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
function go(surface, page, param){
  /* a new list starts at the first page rather than inheriting the last one */
  if(page !== ROUTE.page || param !== ROUTE.params.id) UI.shown = null;
  ROUTE = {surface, page, params:{id:param}};
  try{ location.hash = '#/' + surface + '/' + page + (param ? '/' + param : ''); }catch(e){}
  try{ window.scrollTo(0,0); }catch(e){}
  render();
}

function readHash(){
  let raw = '';
  try{ raw = location.hash || ''; }catch(e){}
  const parts = raw.replace(/^#\/?/,'').split('/').filter(Boolean);
  if(!parts.length) return {surface:'public', page:'home', params:{}};
  return {surface:parts[0] || 'public', page:parts[1] || 'home', params:{id:parts[2]}};
}


/* ---- quote basket ---------------------------------------------------------
   Adding a line saves a requested configuration. It does not contact anyone.
   The request becomes a lead only when contact details are captured and the
   submission is accepted — a button click is not a conversion. */
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
    artHelp:!!c.artHelp, sizes:false,
    unit:rq ? rq.unit : null, total:rq ? rq.total : null,
    quoteOnly:!!p.quoteOnly, cfg:JSON.parse(JSON.stringify(c)),
  };
  UI.quote = UI.quote || [];
  if(UI.editLine != null && UI.quote[UI.editLine]){ UI.quote[UI.editLine] = line; UI.editLine = null; }
  else UI.quote.push(line);
  render();
  toast('Added to your quote', lineSummary(line) + ' — nothing is ordered or charged.');
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
      colour:l.colour, colourName:l.colourName, placements:l.placements,
      express:false, unit:l.unit, total:l.total, quoteOnly:l.quoteOnly,
      method:(l.placements[0] || {}).method, methodName:(l.placements[0] || {}).methodName || '',
      pos:(l.placements[0] || {}).pos, posName:(l.placements[0] || {}).posName || '',
      art:l.art ? 'attached' : (l.artHelp ? 'help requested' : 'to follow'),
      contact:{name:q.name, email:q.email, company:q.company,
               country:q.country || 'Spain', postcode:q.postcode || '',
               phone:q.phone || '', date:q.noDate ? 'Not fixed' : (q.date || 'Not provided'),
               notes:q.notes || ''},
    });
    if(!ref) ref = rec.id;
  });
  UI.qDone = {ref:String(ref).toUpperCase(), email:q.email, lines:lines.length,
    units:quoteUnits(), country:q.country || 'Spain',
    date:q.noDate ? 'Date not fixed' : (q.date || 'Not provided')};
  UI.quote = []; UI.qc = {}; UI.qcErr = {};
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
function render(){
  const r = ROUTE;
  let html = '';

  if(r.surface === 'public'){
    switch(r.page){
      case 'custom':   html = pubCustom(); break;
      case 'merch':       html = pubMerch(); break;
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
      case 'sector':      html = pubSector(r.params.id); break;
      case 'case':        html = pubCase(r.params.id); break;
      case 'studiohelp':  html = pubStudioHelp(); break;
      case 'about':       html = pubAbout(); break;
      case 'contact':     html = pubContact(); break;
      case 'privacy':     html = pubPrivacy(); break;
      case 'cookies':     html = pubCookies(); break;
      case 'terms':       html = pubTerms(); break;
      case 'accessibility': html = pubAccessibility(); break;
      case 'blog':        html = pubBlog(); break;
      case 'post':        html = pubPost(r.params.id); break;
      case 'sectors':  html = pubSectors(); break;
      case 'process':  html = pubProcess(); break;
      case 'work':     html = pubWork(); break;
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

  $('root').innerHTML = html + surfaceSwitch();
  /* the fixed action bar needs the body to reserve room for it */
  document.body.classList.toggle('has-bar', html.indexOf('class="buybar') > -1);
  /* the public site has no bottom mobile nav, so the surface switcher can stay
     at the bottom there instead of covering the top of a hero */
  document.body.classList.toggle('is-public', r.surface === 'public');
  paintModal();
  paintToasts();
  afterRender();
}

/* Behaviour that needs elements in the document. render() replaces the whole
   tree, so anything observed has to be re-attached each time. */
let MORE_OBS = null;
function afterRender(){
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
  openModal({
    title:a.kind, sub:`${esc(a.rev)} · due ${dateShort(a.due)}`,
    body:`
      <div class="stack">
        <div class="banner"><div><div class="banner-t">What you are approving</div>
          <div class="banner-d">${esc(a.summary)}</div></div></div>
        ${g ? `<div class="card card--quiet">
          <div class="eyebrow">What changed since the last revision</div>
          <div class="diff" style="margin-top:8px">
            <span class="diff-k">Revision</span><span><span class="was">${g.rev-1}</span><span class="arrow">→</span><span class="now">${g.rev}</span></span>
            <span class="diff-k">Sleeve, bicep</span><span><span class="was">Standard block</span><span class="arrow">→</span><span class="now">+18 mm ease</span></span>
            <span class="diff-k">Cuff</span><span><span class="was">Two-fold</span><span class="arrow">→</span><span class="now">Soft single-fold</span></span>
            <span class="diff-k">Prototype round</span><span><span class="now">${g.round} of a maximum of 3</span></span>
          </div></div>` : ''}
        ${d ? `<div class="paper">
          <h4>PAMUUC | STUDIO</h4>
          <p style="margin-top:4px">Pamuk Studio S.L · Barcelona · ${esc(d.num)}</p>
          <table><thead><tr><th>Description</th><th class="n">Amount</th></tr></thead>
          <tbody><tr><td>${esc(d.title)}</td><td class="n">${money(d.amount)}</td></tr>
          <tr><td>VAT 21%</td><td class="n">${money(d.amount*0.21)}</td></tr>
          <tr><td><strong>Total</strong></td><td class="n"><strong>${money(d.amount*1.21)}</strong></td></tr></tbody></table>
          <p style="margin-top:8px">Issued ${dateShort(d.issued)} · due ${dateShort(d.due)}</p>
        </div>` : ''}
        <label class="field"><span class="field-l">Comment <span class="faint">(required if you request changes)</span></span>
          <textarea class="inp" id="apcomment" placeholder="Anything we should know…"></textarea></label>
        <p class="t-xs muted">Your decision is recorded against this exact revision. A later revision needs a new approval — an old approval can never carry forward.</p>
      </div>`,
    foot:`<button class="btn btn--ghost" data-act="closeModal">Cancel</button>
      <button class="btn btn--ghost" data-act="apDecide" data-id="${a.id}" data-d="changes">Request changes</button>
      <button class="btn btn--primary" data-act="apDecide" data-id="${a.id}" data-d="approve">Approve</button>`,
  });
}

function modalDoc(id){
  const d = doc(id); if(!d) return;
  const canPay = can(user(SESSION.user),'payments','act');
  openModal({
    title:d.title, sub:`${d.num} · ${esc(d.type)} · ${pill(d.state)}`,
    body:`<div class="stack">
      <div class="paper">
        <h4>PAMUUC | STUDIO</h4>
        <p style="margin-top:4px">Pamuk Studio S.L · Carrer example, Barcelona · VAT ESB00000000</p>
        <p style="margin-top:10px"><strong>${esc(d.type)} ${esc(d.num)}</strong><br>
          ${esc(account(d.account).name)}<br>${d.project?esc(project(d.project).name):''}</p>
        ${d.amount ? `<table><thead><tr><th>Description</th><th class="n">Amount</th></tr></thead>
          <tbody><tr><td>${esc(d.title)}</td><td class="n">${money(d.amount)}</td></tr>
          <tr><td>VAT 21%</td><td class="n">${money(d.amount*0.21)}</td></tr>
          <tr><td><strong>Total due</strong></td><td class="n"><strong>${money(d.amount*1.21)}</strong></td></tr></tbody></table>`
          : '<p style="margin-top:10px">Terms document — no amount.</p>'}
        <p style="margin-top:10px">Issued ${dateShort(d.issued)}${d.due?` · payable by ${dateShort(d.due)}`:''}${d.paidAt?` · paid ${dateShort(d.paidAt)}`:''}</p>
        <p style="margin-top:10px;color:#666">Version ${d.v}. Corrections are issued as a new version or a credit note; this record is never overwritten.</p>
      </div>
      ${d.state === 'payment_due' || d.state === 'overdue' ? `
        <div class="banner banner--${d.state==='overdue'?'stop':'wait'}"><div>
          <div class="banner-t">${d.state==='overdue'?'This payment is late':'Payment due '+dateShort(d.due)}</div>
          <div class="banner-d">${/Development/i.test(d.title)
            ? 'Approving and paying this authorises technical files and the first prototype round.'
            : 'Approving this releases the next stage of work.'}</div></div></div>` : ''}
    </div>`,
    foot: (d.state === 'payment_due' || d.state === 'overdue') && canPay
      ? `<button class="btn btn--ghost" data-act="closeModal">Close</button>
         <button class="btn btn--primary" data-act="payDoc" data-id="${d.id}">Approve and pay ${money(d.amount*1.21)}</button>`
      : `<button class="btn btn--ghost" data-act="closeModal">Close</button>`,
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
  const steps = ['Project information','Positions','Garments','Options','Quantities','Customer access','Review & publish'];
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
    <p class="t-sm muted" style="margin-bottom:16px">Choose garments from Pamuuc Bases. Draft and restricted bases cannot be added.</p>
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
    <p class="t-sm muted" style="margin-bottom:16px">Map which fabrics, colours and personalisation the customer may choose from. Anything you do not map here, they must request.</p>
    ${b.positions.flatMap(p => (p.garments||[]).map(bid => { const x = base(bid); return `
      <div class="card card--quiet" style="margin-bottom:12px">
        <div class="t-sm med">${x.glyph} ${esc(x.name)} <span class="mono-ref">${x.ref} ${x.v}</span></div>
        <div class="stack-2" style="margin-top:8px">
          <div class="factline"><span>Fabrics</span><span>${x.fabrics.map(f=>FABRICS[f].name).join(', ')}</span></div>
          <div class="factline"><span>Colours</span><span class="row" style="gap:4px">${x.colours.map(c=>`<span class="sw" style="background:${COLOURS[c].hex}"></span>`).join('')}</span></div>
          <div class="factline"><span>Identity</span><span>${x.pers.map(m=>S.personalization[m].name).join(', ')}</span></div>
        </div></div>`;})).join('') || '<p class="t-sm muted">Add garments first.</p>'}`;

  if(step === 5) body = `
    <p class="t-sm muted" style="margin-bottom:16px">Seed the structure. The customer completes the detail — pieces per person, colourway lines and size splits — inside the published project.</p>
    <div class="rows">
      ${b.positions.filter(p=>p.name).map(p => `<div class="rw rw--static">
        <span class="rw-main"><span class="rw-t">${esc(p.name)}</span>
          <span class="rw-s">${p.people||0} people · ${(p.garments||[]).length} garments</span></span>
        <span class="rw-side"><span class="t-sm num">${(p.garments||[]).length * (+p.people||0)} pieces at 1 each</span></span></div>`).join('')}
    </div>
    <div class="banner" style="margin-top:16px"><div><div class="banner-t">Size splits are validated, not assumed</div>
      <div class="banner-d">Pre Production will not let the project advance while any colourway quantity disagrees with the sum of its size split.</div></div></div>`;

  if(step === 6) body = `
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

  if(step === 7){
    const issues = [];
    if(!b.name) issues.push('The project has no name.');
    b.positions.filter(p=>p.name).forEach(p => { if(!(p.garments||[]).length) issues.push(`Position "${p.name}" has no garment.`); });
    if(!b.positions.some(p=>p.name)) issues.push('No positions have been created.');
    body = `
      ${issues.length ? `<div class="banner banner--stop" style="margin-bottom:16px"><div>
        <div class="banner-t">${issues.length} thing${issues.length>1?'s':''} block publication</div>
        <ul class="stack-2" style="margin-top:8px">${issues.map(i=>`<li class="t-sm">· ${esc(i)}</li>`).join('')}</ul>
      </div></div>` : `<div class="banner banner--go" style="margin-bottom:16px"><div>
        <div class="banner-t">Ready to publish</div>
        <div class="banner-d">This creates the project and publishes version 1 to the customer.</div></div></div>`}
      <div class="cvp">
        <div class="cvp-hd"><span class="eyebrow" style="color:var(--navy)">Exactly what the customer will see</span></div>
        <div class="stack-2">
          <div class="factline"><span>Project</span><span class="med">${esc(b.name || '—')}</span></div>
          <div class="factline"><span>Stages</span><span>${(b.design?['Design']:[]).concat(['Development','Prototype Fitting','Pre Production','Production','Delivery']).join(' → ')}</span></div>
          <div class="factline"><span>Opens in</span><span>${b.design?'Design':'Development'}</span></div>
          <div class="factline"><span>Positions</span><span>${b.positions.filter(p=>p.name).map(p=>`${p.name} (${p.people||0})`).join(', ') || '—'}</span></div>
          <div class="factline"><span>Garments</span><span>${b.positions.flatMap(p=>(p.garments||[]).map(g=>base(g).name)).join(', ') || '—'}</span></div>
        </div>
      </div>
      <p class="t-xs muted" style="margin-top:16px">Publication is a recorded action. After it, you can keep editing a working draft while the customer continues to see the last published version.</p>`;
    UI.buildIssues = issues;
  }

  openModal({wide:true, title:'Create a project — ' + account(accId).name,
    sub:`Step ${step} of 7 · ${steps[step-1]}`,
    body:`<div class="q-prog" style="margin-bottom:20px">${steps.map((_,i)=>`<i class="${i+1<step?'done':i+1===step?'on':''}"></i>`).join('')}</div>${body}`,
    foot:`<button class="btn btn--quiet" data-act="closeModal">Cancel</button>
      ${step>1?`<button class="btn btn--ghost" data-act="bStep" data-s="${step-1}">← Back</button>`:''}
      ${step<7?`<button class="btn btn--primary" data-act="bStep" data-s="${step+1}">Continue →</button>`
        :`<button class="btn btn--primary" data-act="bPublish" ${UI.buildIssues.length?'disabled':''}>Create and publish version 1</button>`}`});
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
      if(SESSION && user(SESSION.user).side === 'customer') go('account','overview');
      else { SESSION = {user:'u_marta'}; save(); go('account','overview'); }
      return;
    }
    if(a === 'jumpStudio'){
      if(SESSION && user(SESSION.user).side === 'studio') go('studio','overview');
      else { SESSION = {user:'u_leo'}; save(); go('studio','overview'); }
      return;
    }
    if(a === 'login'){ SESSION = {user:d.u}; save();
      go(user(d.u).side === 'customer' ? 'account' : 'studio', 'overview'); return; }
    if(a === 'previewAs'){
      SESSION = {user:d.u || 'u_marta'}; save(); go('account','overview');
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
    if(a === 'fPrice'){ UI.shown = null; const f = listState(); f.price = f.price === d.v ? '' : d.v; UI.fltOpen = true; render(); return; }
    if(a === 'fQty'){ UI.shown = null; const el = $('fqty'); listState().qty = el ? el.value : ''; UI.fltOpen = true; render(); return; }
    if(a === 'rmCat'){ const f = listState(); f.cats = f.cats.filter(x => x !== d.v); render(); return; }
    if(a === 'rmMethod'){ const f = listState(); f.methods = f.methods.filter(x => x !== d.v); render(); return; }
    if(a === 'rmQty'){ listState().qty = ''; render(); return; }
    if(a === 'rmPrice'){ listState().price = ''; render(); return; }
    if(a === 'fClear'){ UI.shown = null; UI.flt = null; listState(); render(); return; }
    if(a === 'dirDim'){ UI.dirDim = d.v; render(); return; }
    if(a === 'dirTab'){ UI.dirTab = d.v; render(); return; }
    if(a === 'openDrawer'){ UI.drawer = true; render(); return; }
    if(a === 'closeDrawer'){ UI.drawer = false; render(); return; }
    if(a === 'more'){ UI.shown = (UI.shown || PAGE_STEP) + PAGE_STEP; render(); return; }
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
    if(a === 'qSubmit'){ submitQuoteRequest(); return; }
    if(a === 'openMerchAcc'){ modalStub('Account access',
      'A secure access link is sent to the address on the request. Your quote request is saved either way — declining account access never discards it.'); return; }

    /* --- assisted enquiries --- */
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
      if(d.d === 'changes' && !c.trim()){ $('apcomment').classList.add('inp--err'); return; }
      act.decideApproval(d.id, d.d === 'approve' ? 'approve' : 'changes', c);
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
    if(a === 'cvFilter'){ UI.cvFilter = d.t; render(); return; }
    if(a === 'markRead'){ act.markRead(user(SESSION.user).side); render(); return; }
    if(a === 'nFilter'){ UI.nFilter = d.t; render(); return; }

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
    if(a === 'custTab'){ UI.custTab = d.t; render(); return; }
    if(a === 'publish'){ act.publishProject(d.p); render(); return; }
    if(a === 'advance'){
      const p = project(d.p);
      if(gateBlockers(p).length){ modalOverride(d.p); return; }
      act.advanceStage(d.p); render(); return;
    }
    if(a === 'override'){ modalOverride(d.p); return; }
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
    if(a === 'newProject'){ UI.build = null; modalBuilder(d.acc, 1); return; }
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
      act.publishProject(p.id);
      UI.build = null; closeModal(); go('studio','project',p.id); return;
    }
    if(a === 'addGarment'){ modalStub('Add a garment from Pamuuc Bases',
      'Opens the base picker filtered to active bases compatible with this position, then attaches the chosen base version to the project as a new project garment at revision 1.'); return; }
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
    const [surface, page, param] = goEl.dataset.go.split(':');
    /* leaving a section resets its transient tab state */
    UI.menu = false; UI.drawer = false; MODAL = null;
    if(page !== 'project') UI.prjTab = null;
    if(page !== 'customer') UI.custTab = null;
    go(surface, page, param);
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
  if(a === 'dQty'){ setLineQty(+d.i, +el.value); return; }
  if(a === 'cfgQtyExact'){
    const p = by(S.merchProducts, UI.cfg.id);
    const min = p && !p.quoteOnly ? p.moq : 1;
    const v = Math.max(0, Math.floor(+el.value || 0));
    /* keep what they typed; only warn below the minimum, never silently raise it */
    UI.cfg.qty = v; UI.cfg.qtyLow = v > 0 && v < min ? min : 0;
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
  if(a === 'pickFabric'){ act.setFabric(el.dataset.g, el.value); render(); return; }
  if(a === 'dQty'){ setLineQty(+el.dataset.i, +el.value); return; }
  if(a === 'setCountry'){
    /* the country decides whether a VAT number is asked for at all, so this
       has to re-render — and it has to be on change, not click */
    UI.answers = UI.answers || {};
    readCompanyFields();
    UI.answers['Country'] = el.value;
    render(); return;
  }
  if(a === 'qcSet'){ UI.qc = UI.qc || {}; UI.qc[el.dataset.f] = el.value; return; }
  if(a === 'fSort'){ listState().sort = el.value; UI.shown = null; render(); return; }
});

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

/* ---- boot ----------------------------------------------------------------- */
(function boot(){
  try{
    const t = localStorage.getItem('pamuuc_theme');
    if(t) document.documentElement.setAttribute('data-theme', t);
  }catch(e){}
  try{
    restore();
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
