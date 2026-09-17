/* ============================================================================
   The runtime shim, as a real file
   ---------------------------------------------------------------------------
   This lived in a template literal inside merch-bundle.mjs and it cost four
   bugs, because a template literal eats one level of escaping and none of it
   shows up in review:

     a lone backtick closed the literal;
     a lone \n cut a string in half;
     and every \s in a regex became a plain s. That last one is why the
     translation half-worked: the key for "Products" was computed by matching
     the LETTER s, giving "Product", which is in no dictionary — and
     "Collections" keyed as "Collection" with the trailing s handed back by a
     \s*$ that was really s*$. That is where "Coleccions" came from.

   It is a plain file now: read and concatenated, never interpolated, so what
   is written here is exactly what ships.
   ========================================================================= */
/* ---- path routing --------------------------------------------------------
   app.js is untouched; these two globals are simply replaced. In a classic
   script a top-level `function` becomes a property of the global object, so
   reassigning it here is what every later call resolves to — and `ROUTE` is a
   top-level `let`, which this script shares because it is part of the same
   global lexical scope. */
(function () {
  var TABLE = window.__MERCH_ROUTES__ || {};
  var BY_ROUTE = {};
  for (var url in TABLE) {
    var r = TABLE[url];
    BY_ROUTE[r.loc + '|' + r.page + '|' + (r.id || '')] = url;
  }
  var LOC = (document.documentElement.lang || 'en');
  var META = window.__MERCH_META__ || {};

  /* app.js sets document.title from its own page label on every render. That
     label is the heading, not the search-result title, and the one the builder
     wrote is the one that was audited — so it is put back after each render.
     The description moves with it, because a client-side navigation that
     leaves the previous page's description behind is worse than no change. */
  function applyMeta() {
    var m = META[norm(location.pathname)];
    if (!m) return;
    document.title = m.title;
    var d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', m.description);
    var c = document.querySelector('link[rel="canonical"]');
    if (c) c.setAttribute('href', location.origin + norm(location.pathname));
  }

  function norm(p) { return p.replace(/\/*$/, '/') || '/'; }

  function routeForPath(path, search) {
    var hit = TABLE[norm(path)];
    if (!hit) return null;
    /* ?g= is the garment a product link was opened on — the same preselection
       the mockup carries as the route's sku */
    var sku = null;
    var m = /[?&]g=([^&]+)/.exec(search || '');
    if (m) { try { sku = decodeURIComponent(m[1]); } catch (e) { sku = m[1]; } }
    return { surface: 'public', page: hit.page, params: { id: hit.id, sku: sku } };
  }

  /* A page this bundle does not know — the custom uniforms page, the journal,
     anything the other builder owns. Returning null means "let the browser
     handle it", which is the correct answer for a link off this side. */
  function urlForRoute(surface, page, param) {
    if (surface !== 'public') return null;
    return BY_ROUTE[LOC + '|' + page + '|' + (param || '')] || null;
  }

  readHash = function () {
    return routeForPath(location.pathname, location.search) || { surface: 'public', page: 'home', params: {} };
  };

  go = function (surface, page, param, sub) {
    var url = urlForRoute(surface, page, param);
    if (page !== ROUTE.page || param !== ROUTE.params.id) UI.shown = null;
    ROUTE = { surface: surface, page: page, params: { id: param, sku: sub } };
    if (url) { try { history.pushState({}, '', url); } catch (e) {} }
    try { window.scrollTo(0, 0); } catch (e) {}
    render();
    applyMeta();
  };

  /* A real link is a real link: middle-click, ctrl-click and "open in new tab"
     have to keep working, so only a plain left click is taken over. */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    var href = a.getAttribute('href') || '';
    if (!href.startsWith('/') || href.startsWith('//')) return;
    var hash = href.indexOf('#');
    var noHash = hash >= 0 ? href.slice(0, hash) : href;
    var q = noHash.indexOf('?');
    var path = q >= 0 ? noHash.slice(0, q) : noHash;
    var r = routeForPath(path, q >= 0 ? noHash.slice(q) : '');
    if (!r) return;                       /* not ours — let the browser go */

    /* The app has its own delegated handler for data-go, and it calls go(),
       which is the override above and already pushes one history entry. It
       does NOT call preventDefault, because it was written when these were
       buttons rather than links — so that is all this does for them. Doing
       the navigation here as well pushed a second entry for one click, and
       the back button then appeared to do nothing. */
    e.preventDefault();
    if (a.hasAttribute('data-go')) return;

    ROUTE = r;
    try { history.pushState({}, '', href); } catch (err) {}
    try { window.scrollTo(0, 0); } catch (err) {}
    render();
    applyMeta();
  }, true);

  window.addEventListener('popstate', function () {
    var r = routeForPath(location.pathname, location.search);
    if (r) { ROUTE = r; render(); applyMeta(); }
  });

  /* The app redraws in English — its strings live in its own source. So the
     same catalogue the builder used is applied to the DOM after every render.
     A TreeWalker over text nodes rather than a rewrite of innerHTML: it leaves
     the markup, the event bindings and the scroll position alone, and it is
     far the cheaper of the two. */
  var COPY = window.__MERCH_COPY__ || null;
  var COPY_ATTRS = ['alt', 'title', 'placeholder', 'aria-label'];

  function retext(root) {
    if (!COPY) return;
    var base = root || document.body;
    /* The app builds some labels by concatenation, and the DOM keeps those as
       adjacent text nodes rather than one. Matching per node then sees
       "Collection" and "s" separately: the first has an entry, the second does
       not, and the label comes out "Coleccións". normalize() merges adjacent
       text into a single node first, which is what the builder's tokenizer
       sees when it works on the HTML string. */
    base.normalize();
    var w = document.createTreeWalker(base, NodeFilter.SHOW_TEXT, null);
    var n, hits = [];
    while ((n = w.nextNode())) {
      var par = n.parentNode;
      if (!par) continue;
      var tn = par.tagName;
      if (tn === 'SCRIPT' || tn === 'STYLE') continue;
      var raw = n.nodeValue;
      var key = raw.replace(/\s+/g, ' ').trim();
      if (!key) continue;
      var hit = COPY[key];
      if (hit && hit !== key) hits.push([n, raw, hit]);
    }
    for (var i = 0; i < hits.length; i++) {
      var raw2 = hits[i][1];
      hits[i][0].nodeValue = raw2.match(/^\s*/)[0] + hits[i][2] + raw2.match(/\s*$/)[0];
    }
    var els = base.querySelectorAll('[alt],[title],[placeholder],[aria-label]');
    for (var j = 0; j < els.length; j++) {
      for (var k = 0; k < COPY_ATTRS.length; k++) {
        var v = els[j].getAttribute(COPY_ATTRS[k]);
        if (!v) continue;
        var kk = v.replace(/\s+/g, ' ').trim();
        var h2 = COPY[kk];
        if (h2 && h2 !== kk) els[j].setAttribute(COPY_ATTRS[k], h2);
      }
    }
  }

  /* app.js redraws into #root, and its own markup navigates by data-go with
     no href. That is fine for clicking — its handler still works — but it
     costs middle-click, ctrl-click and "open in new tab", which on a product
     catalogue people genuinely use. So after every render the same table the
     builder used puts the href back. */
  function relink() {
    var els = document.querySelectorAll('[data-go]:not([href])');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var t = el.getAttribute('data-go') || '';
      var bits = t.split(':');
      if (bits[0] !== 'public') continue;
      var url = BY_ROUTE[LOC + '|' + bits[1] + '|' + (bits.slice(2).join(':') || '')];
      if (!url) url = BY_ROUTE[LOC + '|' + bits[1] + '|'];
      if (!url) continue;
      if (el.tagName === 'A') { el.setAttribute('href', url); continue; }
      /* The app draws a product card as <article data-go>, so there is nothing
         to put an href on. The builder turns those into anchors; do the same
         here, or the card is clickable but cannot be opened in a new tab —
         which on a catalogue people actually do. Children are moved rather
         than re-parsed, and the click handlers are delegated on document, so
         nothing is lost in the swap. */
      var a = document.createElement('a');
      for (var j = 0; j < el.attributes.length; j++) {
        a.setAttribute(el.attributes[j].name, el.attributes[j].value);
      }
      a.setAttribute('href', url);
      if (!el.className || el.className.indexOf('gate2') === -1) {
        /* the same fallback the builder marks, for a box with no display rule */
        var cs = window.getComputedStyle(el).display;
        if (cs === 'inline') a.setAttribute('data-blk', '');
      }
      while (el.firstChild) a.appendChild(el.firstChild);
      if (el.parentNode) el.parentNode.replaceChild(a, el);
    }
  }

  /* Both corrections belong after every draw, not just the first, so render
     itself is wrapped. It is a top-level function declaration in a classic
     script, which makes it a global property and therefore replaceable. */
  var innerRender = render;
  render = function () {
    var r = innerRender.apply(this, arguments);
    try { retext(); applyMeta(); relink(); } catch (e) {}
    return r;
  };

  /* ---- sending the request somewhere -------------------------------------
     The mockup is a prototype: submitQuoteRequest() writes the request into
     localStorage and shows a confirmation. Nothing leaves the browser — there
     is not one fetch in the whole of app.js. On a real site that is the worst
     failure there is, because it looks exactly like success.

     So the three functions that finish a request are wrapped, the same way
     go() and render() are. app.js is not edited, the prototype's own
     behaviour still runs, and the request additionally goes to the intake
     Worker, which emails the studio and appends the sheet. */
  var INTAKE = window.__MERCH_INTAKE__ || '';

  /* The prototype keeps only the artwork's FILE NAME — pl.art = f.name — and
     drops the file. It builds its file input with createElement and never puts
     it in the document, so there is no element to delegate from. Wrapping
     createElement is the one hook that catches it without touching app.js. */
  var ARTWORK = {};
  var realCreate = document.createElement.bind(document);
  document.createElement = function (tag) {
    var el = realCreate(tag);
    if (String(tag).toLowerCase() === 'input') {
      el.addEventListener('change', function () {
        if (el.type === 'file' && el.files && el.files[0]) ARTWORK[el.files[0].name] = el.files[0];
      });
    }
    return el;
  };

  function send(path, form) {
    if (!INTAKE) return;
    try {
      fetch(INTAKE + path, { method: 'POST', body: form })
        .then(function (r) { return r.ok ? null : r.text(); })
        .then(function (bad) { if (bad && window.console) console.error('intake ' + path, bad.slice(0, 200)); })
        .catch(function (e) { if (window.console) console.error('intake ' + path, e); });
    } catch (e) { if (window.console) console.error('intake ' + path, e); }
  }

  /* One request, however many products are on it: the Worker issues one
     reference and the studio answers one email. The first line fills the
     structured fields the quote email lays out; every line is written into the
     message, so nothing is lost for a basket of three. */
  function describe(lines) {
    return lines.map(function (l, i) {
      var pl = (l.placements || []).map(function (x) {
        return '    ' + (x.posName || x.pos) + ' — ' + (x.methodName || x.method)
          + (x.size ? ', ' + x.size : '') + (x.art ? ', artwork: ' + x.art : '');
      }).join('\n');
      var sizes = (l.sizes || []).filter(function (s) { return s.qty; })
        .map(function (s) { return s.size + '×' + s.qty; }).join(' ');
      return (i + 1) + '. ' + l.productName + ' (' + (l.ref || '')
        + ((l.cfg && l.cfg.sku) ? ' \u00b7 ' + l.cfg.sku : '') + ')\n'
        + '    ' + l.qty + ' × ' + (l.colourName || l.colour)
        + (l.unit ? ', ' + l.unit + ' each' : '') + (l.quoteOnly ? ', price on request' : '')
        + (sizes ? '\n    sizes: ' + sizes : '')
        + (pl ? '\n' + pl : '')
        + (l.artHelp ? '\n    help requested with artwork' : '');
    }).join('\n\n');
  }

  function postQuote(lines, q) {
    if (!lines.length) return;
    var first = lines[0], p0 = (first.placements || [])[0] || {};
    var f = new FormData();
    var put = function (k, v) { f.append(k, v == null ? '' : String(v)); };

    put('name', q.name); put('email', q.email); put('company', q.company);
    put('phone', q.phone); put('country', q.country);
    /* cfg.sku is the garment actually chosen (PM-TSH-012); first.ref is the
       product family (PAM-TSHIRTS). The studio needs the former to price it,
       so it leads and the family follows. */
    put('product', first.productName);
    put('sku', (first.cfg || {}).sku || first.ref);
    put('colour', first.colourName || first.colour); put('quantity', first.qty);
    put('fit', (first.cfg || {}).f);
    put('weight', (first.cfg || {}).weight || '');
    put('personalisation', p0.methodName || p0.method);
    put('placement', p0.posName || p0.pos);
    put('code', window.__MERCH_OFFER_CODE__ || '');
    put('locale', document.documentElement.lang || 'en');

    var notes = q.notes ? q.notes + '\n\n' : '';
    var when = q.date && q.date !== 'Not provided' ? 'Needed by: ' + q.date + '\n\n' : '';
    put('message', notes + when
      + (lines.length > 1 ? lines.length + ' products on this request:\n\n' : 'On this request:\n\n')
      + describe(lines));

    /* the first real artwork file anyone attached, if the browser still has it */
    for (var i = 0; i < lines.length; i++) {
      var pls = lines[i].placements || [];
      for (var j = 0; j < pls.length; j++) {
        var file = pls[j].art && ARTWORK[pls[j].art];
        if (file) { f.append('artwork', file, file.name); i = lines.length; break; }
      }
    }
    send('/quote', f);
  }

  if (typeof submitQuoteRequest === 'function') {
    var innerSubmit = submitQuoteRequest;
    submitQuoteRequest = function () {
      /* captured first: the original empties UI.quote and UI.qc on its way out */
      var lines = (UI.quote || []).slice();
      var q = Object.assign({}, UI.qc || {});
      var out = innerSubmit.apply(this, arguments);
      try { postQuote(lines, q); } catch (e) { if (window.console) console.error('postQuote', e); }
      return out;
    };
  }

  /* the offer pop-up: the code is emailed by the Worker, not by the prototype */
  if (typeof act === 'object' && act && typeof act.joinOffer === 'function') {
    var innerJoin = act.joinOffer;
    act.joinOffer = function (id, email) {
      var out = innerJoin.apply(this, arguments);
      try {
        var f = new FormData();
        f.append('email', email || '');
        /* id is the offer's internal key (of_first); the customer-facing
           code is o.code (FIRST), and that is what the email tells them to
           quote. Sending the id would email somebody "Your code is OF_FIRST". */
        var offer = ((typeof S !== 'undefined' && S.offers) || []).filter(function (o) { return o.id === id; })[0];
        f.append('code', String((offer && offer.code) || id || '').toUpperCase());
        f.append('locale', document.documentElement.lang || 'en');
        send('/subscribe', f);
      } catch (e) { if (window.console) console.error('joinOffer', e); }
      return out;
    };
  }

  /* app.js boots at the end of its own file, which is BEFORE this shim exists,
     so it has already read the (empty) hash and rendered the home page over
     the server-rendered one. Nothing is wrong with that render except that it
     is the wrong page — so now that the real router is installed, the route is
     read again and the page drawn once more. One extra render at boot is the
     price of not editing app.js, which is a price worth paying. */
  try {
    ROUTE = readHash();
    render();
  } catch (e) {
    /* a failed re-render must not take the server-rendered page with it */
    if (window.console && console.error) console.error('merch router', e);
  }
  retext();
  applyMeta();

  /* render() is not the only way the page changes: the app also patches parts
     of the DOM directly, and anything it writes that way arrives in English
     and unlinked. Rather than chase each of those call sites — there are
     dozens, and a new one would silently regress — the root is observed and
     the two passes re-applied when it changes. Debounced to the end of the
     task so a render that touches a hundred nodes costs one pass, and
     disconnected while they run so they cannot retrigger themselves. */
  if (COPY && window.MutationObserver) {
    var root = document.getElementById('root') || document.body;
    var queued = false;
    var observer = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      setTimeout(function () {
        queued = false;
        observer.disconnect();
        try { retext(root); relink(); } catch (e) {}
        observer.observe(root, { childList: true, subtree: true, characterData: true });
      }, 0);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }
})();

