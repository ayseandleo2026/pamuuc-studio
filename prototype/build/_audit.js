/* ============================================================================
   PAMUUC SUITE — browser audit
   The Node suites (smoke / wf / import-check) prove the markup and the maths.
   This proves the PAINTED page: overflow, the 11px floor, broken images,
   leaked `undefined`, and the fixed action bar covering content — across every
   route in both themes.

   Run it:
     1. bash build.sh
     2. wrap the build and serve it:
        { echo '<!doctype html><html><head><meta charset="utf-8">'
          echo '<meta name="viewport" content="width=device-width,initial-scale=1">'
          echo '<style>body{margin:0}img{max-width:100%}</style>'
          cat pamuuc-suite.html; echo '</html>'; } > ../dist/_full.html
     3. open it over http (the preview pane refuses file://) and paste the
        expression below into the console.

   It returns {routesChecked, defects, list}. `defects: 0` is the bar.
   Note the preview pane does not repaint while hidden, so screenshots taken
   after a programmatic scroll are stale — trust these measurements, not them.
   ========================================================================= */
/* Structural audit, run in the page against every route and both themes.
   Returns a list of defects, empty when the build is clean. */
/* Registers window.__audit(opts). Run it in slices — the whole site in one
   call outgrows the console's timeout once the grids are 184 cards deep.
     __audit({part:'public'})  __audit({part:'collections'})
     __audit({part:'app'})     __audit({part:'detail'})
   Each returns {part, checked, defects, list}. `defects: 0` is the bar. */
window.__audit = function(opts){
  const o = opts || {}, part = o.part || 'public';
  const themes = o.themes || ['light','dark'];
  const bad = [];
  let checked = 0;
  /* measure the resting state, not a frame of an entrance animation */
  document.documentElement.classList.add('audit-still');

  const PUBLIC = [
    ['public','home'],['public','custom'],['public','sectors'],['public','process'],
    ['public','work'],['public','form'],['public','login'],['public','studiohelp'],
    ['public','merch'],['public','collections'],['public','products'],['public','method'],
    ['public','search'],['public','howto'],['public','merchhelp'],['public','quote'],
    ['public','about'],['public','contact'],['public','privacy'],['public','cookies'],
    ['public','terms'],['public','accessibility'],['public','blog'],
  ];
  const APP = [
    ['account','overview'],['account','projects'],['account','reorders'],
    ['account','merchandise'],['account','documents'],['account','messages'],
    ['account','notifications'],['account','settings'],
    ['studio','overview'],['studio','inquiries'],['studio','customers'],['studio','projects'],
    ['studio','bases'],['studio','merch'],['studio','finance'],['studio','billing'],
    ['studio','comms'],['studio','team'],['studio','settings'],['studio','audit'],
  ];

  /* Content inside a scroller (a table in overflow-x:auto) or inside a clipping
     box (overflow:hidden) never reaches the viewport, so it is not a layout
     break. Only overflow that actually escapes to the page counts. */
  function contained(el){
    for(let p = el.parentElement; p && p !== document.body; p = p.parentElement){
      const ov = getComputedStyle(p).overflowX;
      if(ov === 'auto' || ov === 'scroll' || ov === 'hidden') return true;
    }
    return false;
  }

  function checkNow(label){
    checked++;
    const de = document.documentElement;
    if(de.scrollWidth > window.innerWidth + 1)
      bad.push(`${label}: horizontal overflow (${de.scrollWidth} > ${window.innerWidth})`);
    const root = document.getElementById('root');
    const txt = root.textContent || '';
    ['undefined','NaN','[object Object]'].forEach(t => {
      if(txt.includes(t)) bad.push(`${label}: "${t}" leaked into the page`);
    });
    root.querySelectorAll('img').forEach(im => {
      if(!im.hasAttribute('alt')) bad.push(`${label}: <img> without alt`);
      if(im.complete && im.naturalWidth === 0 && im.getAttribute('src'))
        bad.push(`${label}: image failed to load`);
    });
    /* every element that carries its own text, capped so a 184-card grid does
       not make the sweep outlast the console */
    const els = [...root.querySelectorAll('*')].filter(el =>
      [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
    els.slice(0, 1200).forEach(el => {
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if(fs && fs < 11 && !el.closest('.paper'))
        bad.push(`${label}: text below the 11px floor (${fs}px) — "${(el.textContent||'').trim().slice(0,24)}"`);
      const r = el.getBoundingClientRect();
      if(r.width && (r.right > window.innerWidth + 1 || r.left < -1) && !contained(el))
        bad.push(`${label}: element out of the viewport — "${(el.textContent||'').trim().slice(0,24)}"`);
    });
    const bar = root.querySelector('.buybar');
    if(bar){
      const pb = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
      if(pb < bar.getBoundingClientRect().height)
        bad.push(`${label}: action bar (${Math.round(bar.getBoundingClientRect().height)}px) exceeds body padding (${pb}px)`);
    }
  }

  function run(label, fn){
    try{ fn(); render(); }
    catch(e){ bad.push(`${label}: THREW ${e.message}`); return; }
    checkNow(label);
  }

  for(const theme of themes){
    document.documentElement.setAttribute('data-theme', theme);

    if(part === 'public' || part === 'app'){
      for(const [surface, page] of (part === 'public' ? PUBLIC : APP)){
        run(`${theme}/${surface}/${page}`, () => {
          SESSION = surface === 'account' ? {user:'u_marta'}
                  : surface === 'studio'  ? {user:'u_leo'} : null;
          UI = {}; ROUTE = {surface, page, params:{}};
        });
      }
    }

    if(part === 'studio'){
      for(const sec of SECTORS){
        run(`${theme}/sector/${sec.id}`, () => { SESSION=null; UI={}; ROUTE={surface:'public',page:'sector',params:{id:sec.id}}; });
      }
      for(const c of CASES){
        run(`${theme}/case/${c.id}`, () => { SESSION=null; UI={}; ROUTE={surface:'public',page:'case',params:{id:c.id}}; });
      }
      run(`${theme}/sector(unknown)`, () => { UI={}; ROUTE={surface:'public',page:'sector',params:{id:'nope'}}; });
      run(`${theme}/404`, () => { UI={}; ROUTE={surface:'public',page:'no-such-page',params:{}}; });
      run(`${theme}/brief/intro`, () => { SESSION=null; UI={formStep:0,answers:{}}; ROUTE={surface:'public',page:'form',params:{}}; });
      for(const b of Object.keys(BRANCHES)){
        const type = Object.keys(BRANCH_OF).find(k => BRANCH_OF[k] === b);
        for(let st = 1; st <= 9; st++){
          run(`${theme}/brief/${b}/${st}`, () => {
            SESSION=null; UI={formStep:st, answers:{'Establishment':type}};
            ROUTE={surface:'public',page:'form',params:{}};
          });
        }
      }
      run(`${theme}/brief/about-you`, () => { UI={formStep:10,answers:{'Establishment':'Hotel or resort'}}; ROUTE={surface:'public',page:'form',params:{}}; });
      run(`${theme}/brief/about-company`, () => { UI={formStep:11,answers:{'Establishment':'Hotel or resort','Country':'Spain'}}; ROUTE={surface:'public',page:'form',params:{}}; });
      run(`${theme}/brief/vat-invalid`, () => { UI={formStep:11,answers:{'Establishment':'Hotel or resort','Country':'Spain','VAT':'nope'}}; ROUTE={surface:'public',page:'form',params:{}}; });
      run(`${theme}/brief/vat-nonEU`, () => { UI={formStep:11,answers:{'Establishment':'Hotel or resort','Country':'Outside Europe'}}; ROUTE={surface:'public',page:'form',params:{}}; });
      run(`${theme}/brief/review`, () => { UI={answers:{'Establishment':'Hotel or resort','Contact name':'M','Role':'GM','Company':'G','Email':'m@x.com','Country':'Spain'}}; ROUTE={surface:'public',page:'review',params:{}}; });
      run(`${theme}/search(term)`, () => { UI={q:'hoodie'}; ROUTE={surface:'public',page:'search',params:{}}; });
      for(const x of POSTS){
        run(`${theme}/post/${x.id}`, () => { SESSION=null; UI={}; ROUTE={surface:'public',page:'post',params:{id:x.id}}; });
      }
      run(`${theme}/post(unknown)`, () => { UI={}; ROUTE={surface:'public',page:'post',params:{id:'nope'}}; });
      run(`${theme}/products(page 2)`, () => { UI={shown:48}; ROUTE={surface:'public',page:'products',params:{}}; });
      run(`${theme}/search(none)`, () => { UI={q:'zzzzz'}; ROUTE={surface:'public',page:'search',params:{}}; });
    }

    if(part === 'quote'){
      const line = {product:'m_asher',productName:'Asher',ref:'MP-1',img:null,qty:100,colour:'black',
        colourName:'Black',placements:[{pos:'front',posName:'Front',method:'embroidery',
        methodName:'Embroidery',size:'small',colours:1,art:null}],art:false,artHelp:false,sizes:false,
        unit:12.5,total:1250,quoteOnly:false,cfg:{id:'m_asher',qty:100}};
      run(`${theme}/quote(lines)`, () => { SESSION=null; UI={quote:[line]}; ROUTE={surface:'public',page:'quote',params:{}}; });
      run(`${theme}/drawer`, () => { SESSION=null; UI={quote:[line],drawer:true}; ROUTE={surface:'public',page:'merch',params:{}}; });
      run(`${theme}/drawer(empty)`, () => { UI={drawer:true}; ROUTE={surface:'public',page:'merch',params:{}}; });
      run(`${theme}/qcontact`, () => { UI={quote:[line]}; ROUTE={surface:'public',page:'qcontact',params:{}}; });
      run(`${theme}/qcontact(errors)`, () => { UI={quote:[line],qcErr:{name:'Enter a name.'}}; ROUTE={surface:'public',page:'qcontact',params:{}}; });
      run(`${theme}/qreview`, () => { UI={quote:[line],qc:{name:'A',email:'a@b.c',company:'C'}}; ROUTE={surface:'public',page:'qreview',params:{}}; });
      run(`${theme}/qdone`, () => { UI={qDone:{ref:'Q1',email:'a@b.c',lines:1,units:100,country:'Spain',date:'Not fixed'}}; ROUTE={surface:'public',page:'qdone',params:{}}; });
      run(`${theme}/products(filtered)`, () => { UI={flt:{cats:['Polos'],methods:[],sort:'plh',qty:'',price:''}}; ROUTE={surface:'public',page:'products',params:{}}; });
      run(`${theme}/products(empty)`, () => { UI={flt:{cats:['Polos'],methods:[],sort:'recommended',qty:'1',price:'o40'}}; ROUTE={surface:'public',page:'products',params:{}}; });
    }

    if(part === 'collections'){
      for(const c of catsInUse()){
        run(`${theme}/collection/${catSlug(c)}`, () => {
          SESSION = null; UI = {}; ROUTE = {surface:'public', page:'collection', params:{id:catSlug(c)}};
        });
      }
      run(`${theme}/collection(unknown)`, () => {
        SESSION = null; UI = {}; ROUTE = {surface:'public', page:'collection', params:{id:'not-a-collection'}};
      });
      run(`${theme}/products(filtered)`, () => {
        SESSION = null; UI = {merchCat:'Polos'}; ROUTE = {surface:'public', page:'products', params:{}};
      });
    }

    if(part === 'detail'){
      const prod = S.merchProducts.find(p => !p.quoteOnly && (p.imgOrder||[]).length > 2);
      const qo   = S.merchProducts.find(p => p.quoteOnly);
      run(`${theme}/product`, () => {
        SESSION = null; UI = {}; ROUTE = {surface:'public', page:'product', params:{id:prod.id}};
      });
      if(qo) run(`${theme}/product(quote-only)`, () => {
        UI = {}; ROUTE = {surface:'public', page:'product', params:{id:qo.id}};
      });
      run(`${theme}/product(unknown)`, () => {
        UI = {}; ROUTE = {surface:'public', page:'product', params:{id:'nope'}};
      });
      run(`${theme}/account-project`, () => {
        SESSION = {user:'u_marta'}; UI = {}; ROUTE = {surface:'account', page:'project', params:{id:'prj_2418'}};
      });
      run(`${theme}/studio-project`, () => {
        SESSION = {user:'u_leo'}; UI = {}; ROUTE = {surface:'studio', page:'project', params:{id:'prj_2418'}};
      });
    }
  }

  document.documentElement.classList.remove('audit-still');
  document.documentElement.removeAttribute('data-theme');
  SESSION = null; UI = {}; ROUTE = {surface:'public', page:'home', params:{}}; render();
  const uniq = [...new Set(bad)];
  return {part, checked, defects:uniq.length, list:uniq.slice(0, 25)};
};
