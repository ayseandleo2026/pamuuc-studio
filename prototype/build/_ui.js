/* ============================================================================
   PAMUUC — UI GEOMETRY AUDIT
   The structural audit proves nothing overflows. This one proves the page
   uses its space: how wide a heading is allowed to be against the column it
   sits in, how many characters a line of body text carries, and whether a
   screen leaves a void under its content.

   Run: window.eval(await (await fetch('/_ui.js')).text()); __ui({part:'public'})
   ========================================================================= */
window.__ui = function(opts){
  const o = opts || {}, part = o.part || 'public';
  document.documentElement.classList.add('audit-still');
  const rows = [];

  const PUBLIC = [
    ['home',{}],['custom',{}],['sectors',{}],['process',{}],['work',{}],['studiohelp',{}],
    ['merch',{}],['collections',{}],['products',{}],['method',{}],['howto',{}],
    ['merchhelp',{}],['blog',{}],['about',{}],['contact',{}],['login',{}],
    ['privacy',{}],['terms',{}],['accessibility',{}],['quote',{}],
  ];

  function colOf(el){
    /* the column this element is laid out in */
    let p = el.parentElement;
    while(p && p !== document.body){
      const w = p.getBoundingClientRect().width;
      if(w > 0) return w;
      p = p.parentElement;
    }
    return window.innerWidth;
  }
  function lines(el){
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    return Math.max(1, Math.round(el.getBoundingClientRect().height / lh));
  }
  /* width of the longest rendered line, via a range over the text */
  function longestLine(el){
    const r = document.createRange(); let max = 0;
    for(const n of el.childNodes){
      if(n.nodeType !== 3) continue;
      r.selectNodeContents(n);
      for(const rect of r.getClientRects()) max = Math.max(max, rect.width);
    }
    if(!max) max = el.getBoundingClientRect().width;
    return max;
  }

  function scan(label){
    const root = document.getElementById('root');

    /* headings: is the box allowed to use its column? */
    root.querySelectorAll('h1,h2,.display,.pull,.tf-q,.page-title,.sec-title,.gate2-t').forEach(el => {
      const txt = (el.textContent || '').trim();
      if(txt.length < 12) return;
      const box = el.getBoundingClientRect().width;
      const col = colOf(el);
      const n = lines(el);
      const longest = longestLine(el);
      /* a heading that shares its row with something else is not cramped —
         it is laid out. Only judge it against the box it was actually given. */
      const par = el.parentElement;
      const pd = par ? getComputedStyle(par).display : '';
      const shares = /grid|flex/.test(pd) && par.children.length > 1;
      const fill = longest / box;
      if(n > 1 && fill < 0.8)
        rows.push({label, kind:'text does not fill its box', text:txt.slice(0, 46),
          lines:n, fills:+(fill * 100).toFixed(0) + '%', box:Math.round(box)});
      if(!shares && n > 1 && box / col < 0.72)
        rows.push({label, kind:'heading box too narrow', text:txt.slice(0, 46),
          lines:n, used:+((box / col) * 100).toFixed(0) + '%', box:Math.round(box), col:Math.round(col)});
      /* a last line carrying one short word */
      if(n > 1){
        const words = txt.split(/\s+/);
        if(words.length > 3 && words[words.length - 1].length <= 4 && fill > 0.9)
          rows.push({label, kind:'heading orphan', text:txt.slice(0, 46), lines:n});
      }
    });

    /* body text: characters per line */
    root.querySelectorAll('.lede,.page-desc,.sec-desc,.tf-h,.t-body,.intro-l li').forEach(el => {
      const txt = (el.textContent || '').trim();
      if(txt.length < 80) return;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      const w = el.getBoundingClientRect().width;
      const ch = w / (fs * 0.5);           /* ≈ average glyph advance */
      const col = colOf(el);
      if(ch < 42) rows.push({label, kind:'measure too narrow', text:txt.slice(0, 40),
        chars:Math.round(ch), w:Math.round(w), col:Math.round(col)});
      if(ch > 98) rows.push({label, kind:'measure too wide', text:txt.slice(0, 40),
        chars:Math.round(ch), w:Math.round(w)});
    });

    /* the content column against the viewport */
    const wrap = root.querySelector('.pub-wrap, .tf-in, .co, .read');
    if(wrap){
      const w = wrap.getBoundingClientRect().width;
      const use = w / window.innerWidth;
      if(use < 0.62) rows.push({label, kind:'column narrow', used:+(use * 100).toFixed(0) + '%',
        w:Math.round(w), vw:window.innerWidth});
    }

    /* a full-height screen whose content leaves a large void */
    const tf = root.querySelector('.tf');
    if(tf){
      const inner = tf.querySelector('.tf-in');
      if(inner){
        const void_ = tf.getBoundingClientRect().height - inner.getBoundingClientRect().height;
        if(void_ > 320) rows.push({label, kind:'screen void', px:Math.round(void_),
          content:Math.round(inner.getBoundingClientRect().height)});
      }
    }
  }

  function run(label, fn){
    try{ fn(); render(); }catch(e){ rows.push({label, kind:'THREW', text:e.message}); return; }
    scan(label);
  }

  if(part === 'public'){
    for(const [page, ui] of PUBLIC)
      run(page, () => { SESSION = null; UI = Object.assign({}, ui); ROUTE = {surface:'public', page, params:{}}; });
  }
  if(part === 'brief'){
    run('brief/intro', () => { SESSION=null; UI={formStep:0,answers:{}}; ROUTE={surface:'public',page:'form',params:{}}; });
    for(let st = 1; st <= 9; st++)
      run('brief/' + st, () => { UI={formStep:st,answers:{'Establishment':'Hotel or resort'}}; ROUTE={surface:'public',page:'form',params:{}}; });
    run('brief/about-you', () => { UI={formStep:10,answers:{'Establishment':'Hotel or resort'}}; ROUTE={surface:'public',page:'form',params:{}}; });
    run('brief/about-company', () => { UI={formStep:11,answers:{'Establishment':'Hotel or resort','Country':'Spain'}}; ROUTE={surface:'public',page:'form',params:{}}; });
    run('brief/review', () => { UI={answers:{'Establishment':'Hotel or resort','Contact name':'M','Role':'GM','Company':'G','Email':'m@x.com','Country':'Spain'}}; ROUTE={surface:'public',page:'review',params:{}}; });
  }
  if(part === 'detail'){
    const prod = S.merchProducts.find(p => !p.quoteOnly && (p.imgOrder||[]).length > 2);
    run('product', () => { SESSION=null; UI={}; ROUTE={surface:'public',page:'product',params:{id:prod.id}}; });
    run('collection', () => { UI={}; ROUTE={surface:'public',page:'collection',params:{id:'sweatshirts'}}; });
    run('sector', () => { UI={}; ROUTE={surface:'public',page:'sector',params:{id:'hospitality'}}; });
    run('case', () => { UI={}; ROUTE={surface:'public',page:'case',params:{id:CASES[0].id}}; });
    run('post', () => { UI={}; ROUTE={surface:'public',page:'post',params:{id:POSTS[0].id}}; });
    const line = {product:'m_asher',productName:'Asher',ref:'MP-1',img:null,qty:100,colour:'black',
      colourName:'Black',placements:[],art:false,artHelp:false,sizes:false,unit:12.5,total:1250,quoteOnly:false,cfg:{}};
    run('checkout', () => { UI={quote:[line],qc:{}}; ROUTE={surface:'public',page:'qcontact',params:{}}; });
  }

  document.documentElement.classList.remove('audit-still');
  SESSION = null; UI = {}; ROUTE = {surface:'public', page:'home', params:{}}; render();
  return {part, issues: rows.length, rows: rows.slice(0, 40)};
};
