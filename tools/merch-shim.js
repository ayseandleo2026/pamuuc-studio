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
/* ---- consent and analytics ------------------------------------------------
   The merchandise pages load this bundle instead of site.js, and site.js is
   where the consent banner and the analytics loader live. So 280 pages had no
   banner and — because the loader is gated on consent — no analytics at all.
   Nothing was being measured on the entire merchandise side.

   Same storage key and same behaviour as site.js, deliberately: somebody who
   accepted on the custom uniforms side is not asked again here, and a refusal
   there is honoured here. Nothing is requested from Google until a yes. */
(function () {
  var KEY = 'pamuuc-consent';
  var bar = document.querySelector('[data-consent]');

  function loadAnalytics() {
    var id = document.body.dataset.ga;
    if (window.__ga || !id) return;
    window.__ga = 1;
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(g);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true });
  }

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}
  if (stored === 'granted') loadAnalytics();
  if (!bar) return;
  if (!stored) bar.hidden = false;
  bar.addEventListener('click', function (e) {
    var act = e.target.closest && e.target.closest('[data-consent-action]');
    if (!act) return;
    var v = act.dataset.consentAction;
    try { localStorage.setItem(KEY, v); } catch (err) {}
    if (v === 'granted') loadAnalytics();
    bar.hidden = true;
  });
})();

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
  /* The pages this bundle does not route — legal, custom uniforms, the
     journal. Without them the footer's legally required links come back from a
     redraw with no href at all. */
  var OFFSITE = window.__MERCH_OFFSITE__ || {};
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
    applyAlternates();
  }

  /* The title, the description and the canonical were already corrected after
     a client-side navigation; the hreflang set was not, so from the second
     page onwards the head still advertised the FIRST page's five addresses.
     Same table the switcher uses, so a link in the menu and a link in the head
     cannot name different URLs. */
  function applyAlternates() {
    var urls = langsFor(ROUTE);
    if (!urls) return;
    var old = document.querySelectorAll('link[rel="alternate"][hreflang]');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    var head = document.head;
    if (!head) return;
    for (var j = 0; j < ORDER.length; j++) {
      var l = ORDER[j];
      if (urls[l]) head.appendChild(alternate(l, urls[l]));
    }
    if (urls.en) head.appendChild(alternate('x-default', urls.en));
  }

  function alternate(lang, href) {
    var link = document.createElement('link');
    link.setAttribute('rel', 'alternate');
    link.setAttribute('hreflang', lang);
    link.setAttribute('href', location.origin + href);
    return link;
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

  /* The other half of tools/merch-seed-guard.js. That file clears the saved
     state before app.js can restore it; this stops app.js writing a new one,
     which would pin today's copy into the visitor's browser and hand it back
     to them unchanged after the next price change.

     Same mechanism as readHash and go below: a top-level `function save()` in
     a classic script is a property of the global object, so replacing it here
     replaces it for every one of the 85 calls inside app.js without editing a
     line of it. Nothing on this side of the site is lost — the quote basket is
     kept below under its own key, and consent, theme and the first-order
     marker were never part of S. */
  save = function () {};

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
    /* Another language is a real navigation, not a route change. The route
       table holds all five, so without this the switcher would be taken over
       here: the URL would become /fr/…, the page would redraw from the copy
       file THIS document loaded, and the visitor would get a French address
       showing Spanish. The language lives in the document, so changing it
       means fetching a new one. */
    var dest = TABLE[norm(path)];
    if (dest && dest.loc !== LOC) return;

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

  /* The same three rules translate() applies at build time, in the same order.
     They have to be here too: the static page is only what paints first, and
     app.js redraws all of it the moment it boots. An exact-match-only runtime
     meant every generated label reverted to English a second after load. */
  var PATTERNS = (window.__MERCH_PATTERNS__ || []).map(function (p) {
    try { return [new RegExp(p[0]), p[1]]; } catch (e) { return null; }
  }).filter(Boolean);
  var PREP = window.__MERCH_PREP__ || 'in';
  var COLOURS = (function () {
    var m = {}, list = window.__MERCH_COLOURS__ || [];
    for (var i = 0; i < list.length; i++) m[list[i]] = true;
    return m;
  })();
  var IN_COLOUR = /^(.+) in (.+)$/;

  /** A translation for one collapsed string, or null to leave it as it is. */
  function lookup(key) {
    var hit = COPY[key];
    if (hit && hit !== key) return hit;

    /* "Custom Tank Top in White": the product name is language, the supplier's
       colour is a reference. Only the name and the preposition move. */
    var m = IN_COLOUR.exec(key);
    if (m && COLOURS[m[2]]) {
      var name = COPY[m[1]];
      return name ? name + ' ' + PREP + ' ' + m[2] : null;
    }

    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i][0].test(key)) return key.replace(PATTERNS[i][0], PATTERNS[i][1]);
    }

    /* The quote page joins reference names into ONE text node — "Front ·
       Embroidery", "Custom Sherpa Jacket · Black" — and retext() matches whole
       nodes. Every part is already in the dictionary and already translated;
       the join is the only thing defeating the lookup. A pattern cannot help,
       because a pattern's replacement is static text and $1 would come back in
       English.

       Each part is translated if it is known and left alone if it is not, which
       is exactly right here: in "Custom Sherpa Jacket · Black" the product name
       moves and the supplier's colour stays, because a colour has no entry. */
    if (key.indexOf(' \u00b7 ') > -1) {
      var parts = key.split(' \u00b7 '), moved = false;
      var out = parts.map(function (p) {
        var h = COPY[p];
        if (h && h !== p) { moved = true; return h; }
        return p;
      });
      if (moved) return out.join(' \u00b7 ');
    }

    return null;                      /* a bare colour name lands here, kept */
  }

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
      var hit = lookup(key);
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
        var h2 = lookup(kk);
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
      if (!url) url = OFFSITE[LOC + '|public:' + bits[1]];
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

  /* ---- the language switcher ----------------------------------------------
     The builder replaces the mockup's "EN" stub in the static HTML, but app.js
     redraws the header from its own source the moment it boots, which puts the
     stub straight back. So the same replacement runs again after every draw,
     from the same tools/merch-lang.js the builder used. */
  var LANGS = window.__MERCH_LANGS__ || {};
  var LABELS = window.__MERCH_LOCALES__ || {};
  var LANG_TITLE = (window.__MERCH_LANG_TITLE__ || {})[LOC] || 'Language';
  var LANG = (window.__MERCH_LANG__ || {}).langHTML;
  var ORDER = (window.__MERCH_LANG__ || {}).LANG_ORDER || ['en', 'es', 'fr', 'it', 'de'];

  /** This page in every language, or null when it is not one of ours. */
  function langsFor(route) {
    if (!route || route.surface !== 'public') return null;
    var id = route.params && route.params.id;
    return LANGS[route.page + '|' + (id || '')] || null;
  }

  function relang() {
    if (!LANG) return;
    var urls = langsFor(ROUTE);
    var stubs = document.querySelectorAll('[data-act="lang"]');
    if (!stubs.length) return;
    for (var i = 0; i < stubs.length; i++) {
      var el = stubs[i];
      /* No table entry means a page this bundle does not route. Dropping the
         control is right there: a switcher that cannot name the other four
         addresses would be five guesses. */
      var markup = urls ? LANG({
        urls: urls, loc: LOC, labels: LABELS, title: LANG_TITLE,
        inline: el.tagName === 'A', instance: i,
      }) : '';
      var box = document.createElement('span');
      box.innerHTML = markup;
      var made = box.firstChild;
      if (made && /btn--onphoto/.test(el.className || '')) {
        made.className += ' mlang--onphoto';
      }
      if (made) el.parentNode.replaceChild(made, el);
      else el.parentNode.removeChild(el);
    }
  }

  /* One listener for the document rather than one per button: the buttons are
     replaced on every draw, and a listener bound to an element that has just
     been thrown away is a listener that silently stops working. */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-mlang]');
    var open = document.querySelectorAll('.mlang-m:not([hidden])');
    for (var i = 0; i < open.length; i++) {
      var owner = document.querySelector('[data-mlang="' + open[i].id + '"]');
      if (btn && owner === btn) continue;
      open[i].setAttribute('hidden', '');
      if (owner) owner.setAttribute('aria-expanded', 'false');
    }
    if (!btn) return;
    e.preventDefault();
    var menu = document.getElementById(btn.getAttribute('data-mlang'));
    if (!menu) return;
    var wasOpen = !menu.hasAttribute('hidden');
    if (wasOpen) { menu.setAttribute('hidden', ''); btn.setAttribute('aria-expanded', 'false'); }
    else { menu.removeAttribute('hidden'); btn.setAttribute('aria-expanded', 'true'); }
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelectorAll('.mlang-m:not([hidden])');
    for (var i = 0; i < open.length; i++) {
      open[i].setAttribute('hidden', '');
      var owner = document.querySelector('[data-mlang="' + open[i].id + '"]');
      if (owner) { owner.setAttribute('aria-expanded', 'false'); owner.focus(); }
    }
  });

  /* The toasts are drawn outside #root, so neither pass ever reached them.
     paintToasts() appends #toasts to <body>, the MutationObserver below
     watches #root, and five of the six call sites read `render(); toast(…)` —
     so the translation pass had already run by the time the message painted.
     A Spanish visitor clicked "Añadir al presupuesto" and was told "Added to
     your quote".

     The one that did work, the artwork toast, is written the other way round —
     toast(…) then render() — which is what identified the cause.

     Same mechanism as render() below: a top-level function declaration in a
     classic script is a property of the global object, so it can be replaced
     without editing app.js. */
  if (typeof paintToasts === 'function') {
    var innerPaint = paintToasts;
    paintToasts = function () {
      var out = innerPaint.apply(this, arguments);
      try { retext(document.getElementById('toasts')); } catch (e) {}
      return out;
    };
  }

  /* Both corrections belong after every draw, not just the first, so render
     itself is wrapped. It is a top-level function declaration in a classic
     script, which makes it a global property and therefore replaceable. */
  var innerRender = render;
  render = function () {
    var r = innerRender.apply(this, arguments);
    try { retext(); applyMeta(); relink(); relang(); saveQuote(); saveOffers(); } catch (e) {}
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
  var STUDIO = window.__MERCH_STUDIO_EMAIL__ || 'simone@pamuuc-studio.com';

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

  /* Returns a promise that RESOLVES with the Worker's JSON on success and
     REJECTS on anything else. It used to swallow every failure into a
     console.error while the page went on to say "your request has been
     received" — so a customer whose submission failed was told it worked, and
     the basket was emptied behind them so they could not even retry. */
  function send(path, form) {
    if (!INTAKE) return Promise.reject(new Error('no intake endpoint configured'));
    return fetch(INTAKE + path, { method: 'POST', body: form })
      .then(function (r) {
        return r.text().then(function (body) {
          var data = null;
          try { data = JSON.parse(body); } catch (e) {}
          if (!r.ok || !data || data.ok !== true) {
            throw new Error('intake ' + path + ' ' + r.status + ' ' + body.slice(0, 160));
          }
          return data;
        });
      });
  }

  /* One line per product, for the sheet's own column and for the email when a
     basket holds more than one. The long-form describe() below is for a person
     reading an email; this is for a column you can scan, sort and filter — the
     sheet's Product column holds the FIRST product only, so a request whose
     second line was the polo shirt did not answer a search for polo shirts. */
  function summarise(lines) {
    return lines.map(function (l) {
      var pl = (l.placements || []).map(function (x) {
        return (x.posName || x.pos) + ' ' + (x.methodName || x.method);
      }).join(', ');
      return l.productName + ' \u00d7' + l.qty
        + ' \u00b7 ' + ((l.cfg || {}).sku || l.ref || '')
        + ' \u00b7 ' + (l.colourName || l.colour || '')
        + (pl ? ' \u00b7 ' + pl : '');
    }).join('\n');
  }

  /* One request, however many products are on it: the Worker issues one
     reference and the studio answers one email. The first line fills the
     structured fields the quote email lays out, items carries all of them,
     and every line is written into the message in full. */
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
    /* No discount code is issued any more — the studio applies the first
       order rate when it prices the quote. All the request carries is whether
       this person asked about it. */
    try { if (localStorage.getItem('pamuuc_first_order') === 'yes') put('firstOrder', 'yes'); } catch (e) {}
    /* Everything on the request, not just the line that happened to be first. */
    put('items', summarise(lines));
    put('lineCount', lines.length);
    put('locale', document.documentElement.lang || 'en');
    /* The contact step collects a surname and a marketing opt-in and the
       prototype kept neither. Dropping a surname makes the studio's reply
       awkward; dropping an opt-in means somebody who asked to hear from us
       never does, which is the wrong half of a consent question to lose. */
    if (q.lastName) put('lastName', q.lastName);
    if (q.marketingOptIn) put('marketingOptIn', 'yes');

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
    return send('/quote', f);
  }

  if (typeof submitQuoteRequest === 'function') {
    var innerSubmit = submitQuoteRequest;
    submitQuoteRequest = function () {
      /* captured first: the original empties UI.quote and UI.qc on its way out */
      var lines = (UI.quote || []).slice();
      var q = Object.assign({}, UI.qc || {});

      /* collectContact() reads name, email, company, postcode, phone, date,
         country and notes — not the surname, and not the marketing checkbox,
         which the prototype renders with no name and no id at all. Both are on
         screen and both were being thrown away: a surname makes the studio's
         reply less awkward, and an opt-in is the half of a consent question it
         is worst to lose. Read here, before the original redraws the form. */
      try {
        var lastEl = document.querySelector('[name="last"]');
        if (lastEl && lastEl.value.trim()) q.lastName = lastEl.value.trim();
        var optEl = document.querySelector('.co-chk input[type="checkbox"]');
        if (optEl && optEl.checked) q.marketingOptIn = true;
      } catch (e) {}

      var out = innerSubmit.apply(this, arguments);

      var posting;
      try { posting = postQuote(lines, q); }
      catch (e) { posting = Promise.reject(e); }

      posting.then(function (data) {
        /* The confirmation shows a reference the prototype invented locally.
           The business only ever sees the Worker's, so the customer must be
           told that one or they will quote a number nobody can find. */
        if (data && data.ref && UI.qDone) { UI.qDone.ref = String(data.ref); render(); }
      }).catch(function (e) {
        if (window.console) console.error(e);
        /* Put the request back exactly as it was and say so. Telling somebody
           their quote was received when it was not is the worst outcome here:
           they wait, nobody replies, and the lead is gone without a trace. */
        UI.quote = lines;
        UI.qc = q;
        saveQuote();
        ROUTE = { surface: 'public', page: 'qcontact', params: {} };
        render();
        if (typeof toast === 'function') {
          toast('Your request did not send',
            'Nothing has been lost — your products are still here. Please try again, or email ' + STUDIO + '.');
        }
      });
      return out;
    };
  }

  /* the offer pop-up: the Worker sends the confirmation, not the prototype */
  if (typeof act === 'object' && act && typeof act.joinOffer === 'function') {
    var innerJoin = act.joinOffer;
    act.joinOffer = function (id, email) {
      var out = innerJoin.apply(this, arguments);
      try {
        var f = new FormData();
        f.append('email', email || '');
        /* An internal marker for which offer they joined, recorded so the
           studio knows to apply the tier. It is never shown to the customer
           and never something they are asked to quote. */
        f.append('offer', String(id || ''));
        try { localStorage.setItem('pamuuc_first_order', 'yes'); } catch (e2) {}
        f.append('locale', document.documentElement.lang || 'en');
        send('/subscribe', f).catch(function (e) { if (window.console) console.error(e); });
      } catch (e) { if (window.console) console.error('joinOffer', e); }
      return out;
    };
  }

  /* ---- keeping the quote basket ------------------------------------------
     UI.quote lives in memory. In the mockup that was fine: it is one page in
     an artifact and nobody ever reloads it. On a site made of real URLs people
     reload, open a product in a new tab, and come back an hour later — and
     every one of those emptied the basket without a word.

     Only the basket is kept. UI.qc holds the contact details somebody typed
     into the quote form, and leaving a name, an email and a phone number in
     localStorage on a shared machine is not a trade worth making to save
     retyping them.

     Written after every render, which is after anything that could change it,
     including the submit that empties it. */
  var QKEY = 'pamuuc_merch_quote';

  /* ---- the offer, remembered for a day -------------------------------------
     The bar and the pop-up are gated on S.offerSeen, and S is the mockup's
     state — which tools/merch-seed-guard.js now clears on every load and
     save() no longer writes. So "I have seen this" lasted exactly one page.
     Changing language is a fresh document, so it came back then too.

     Two other things kept it coming back even within a session. It was only
     recorded when the pop-up was CLOSED, so a visitor who navigated away
     instead had never seen it; and UI.popupArmed lives in memory, so every new
     page re-armed the timer. Being SHOWN counts as being seen here.

     A day, from the moment it was seen. Not "tomorrow": dismissing something
     at 23:50 and meeting it again at midnight is the same annoyance with a
     tidier implementation. */
  var OKEY = 'pamuuc_offer_seen';
  var DAY = 24 * 60 * 60 * 1000;
  var STAMPS = {};

  function restoreOffers() {
    try {
      var raw = localStorage.getItem(OKEY);
      if (raw) {
        var saved = JSON.parse(raw), now = Date.now();
        for (var id in saved) {
          for (var what in saved[id]) {
            if (now - saved[id][what] < DAY) {
              (STAMPS[id] = STAMPS[id] || {})[what] = saved[id][what];
            }
          }
        }
      }
    } catch (e) { STAMPS = {}; }
    /* The app only ever asks whether the value is truthy. */
    if (typeof S === 'undefined' || !S) return;
    S.offerSeen = S.offerSeen || {};
    for (var i in STAMPS) {
      S.offerSeen[i] = S.offerSeen[i] || {};
      for (var w in STAMPS[i]) S.offerSeen[i][w] = STAMPS[i][w];
    }
  }

  function saveOffers() {
    if (typeof S === 'undefined' || !S) return;
    var changed = false;
    /* on screen is seen: the timer must not re-arm on the next page */
    if (typeof UI !== 'undefined' && UI && UI.popup) {
      S.offerSeen = S.offerSeen || {};
      S.offerSeen[UI.popup] = S.offerSeen[UI.popup] || {};
      if (!S.offerSeen[UI.popup].popup) S.offerSeen[UI.popup].popup = Date.now();
    }
    var seen = S.offerSeen || {};
    for (var id in seen) {
      for (var what in seen[id]) {
        if (!seen[id][what]) continue;
        if (!STAMPS[id]) { STAMPS[id] = {}; }
        /* the app writes a display string; the clock is kept here */
        if (!STAMPS[id][what]) { STAMPS[id][what] = Date.now(); changed = true; }
      }
    }
    if (!changed) return;
    try { localStorage.setItem(OKEY, JSON.stringify(STAMPS)); } catch (e) {}
  }

  function saveQuote() {
    try {
      var lines = (typeof UI !== 'undefined' && UI.quote) || [];
      if (lines.length) localStorage.setItem(QKEY, JSON.stringify(lines));
      else localStorage.removeItem(QKEY);
    } catch (e) {}
  }

  function restoreQuote() {
    try {
      var raw = localStorage.getItem(QKEY);
      if (!raw) return;
      var lines = JSON.parse(raw);
      if (Array.isArray(lines) && lines.length) UI.quote = lines;
    } catch (e) {
      /* a basket we cannot read is a basket we drop, not an error page */
      try { localStorage.removeItem(QKEY); } catch (e2) {}
    }
  }

  restoreQuote();
  /* Before the first render, so a bar or pop-up already seen today never
     paints at all rather than painting and then being taken away. */
  restoreOffers();

  /* app.js boots at the end of its own file, which is BEFORE this shim exists,
     so it has already read the (empty) hash and rendered the home page over
     the server-rendered one. Nothing is wrong with that render except that it
     is the wrong page — so now that the real router is installed, the route is
     read again and the page drawn once more. One extra render at boot is the
     price of not editing app.js, which is a price worth paying. */
  /* The real #root, handed back now that the router knows where it is. Until
     this line the app has been rendering into a detached element and the
     server-rendered HTML has been what the visitor sees — see the note in
     tools/merch-seed-guard.js. */
  try { if (window.__MERCH_REAL_ROOT__) window.__MERCH_REAL_ROOT__(); } catch (e) {}

  try {
    ROUTE = readHash();
    render();
  } catch (e) {
    /* a failed re-render must not take the server-rendered page with it */
    if (window.console && console.error) console.error('merch router', e);
  }
  retext();
  applyMeta();
  /* Belt and braces: the wrapped render above already does this, but it is
     inside a try that swallows, and a page whose switcher silently vanished
     would be hard to notice. relang() is idempotent — with no stub left to
     replace it returns immediately. */
  relang();

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
        try { retext(root); relink(); relang(); } catch (e) {}
        observer.observe(root, { childList: true, subtree: true, characterData: true });
      }, 0);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }
})();

