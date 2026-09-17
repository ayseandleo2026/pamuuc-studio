/* ============================================================================
   The responsive audit, run in a real browser
   ---------------------------------------------------------------------------
   Pasted into the page at the served origin. It loads each page into an iframe
   sized to each viewport, which is the only way to exercise the media queries
   for twenty screen sizes without resizing the window twenty times — and the
   only way to do it inside one call rather than forty.

   The viewports are the twenty most-used screen sizes reported for 2026 by
   StatCounter and the trackers that republish it, chosen to cover every aspect
   ratio in real use: 9:16 and 9:19.5 and 9:20 phones, 3:4 and 4:3 tablets,
   16:9 and 16:10 laptops, and 21:9.

   What it looks for is deliberately narrow — things that are wrong at any
   size, not things that are merely different:

     overflow   the page scrolls sideways, or an element sticks out past the
                viewport. Nothing on this site is meant to.
     clipped    a nowrap element whose text is wider than its own box, which
                is how "Custom Crewneck Sw…" happens.
     collision  two header controls occupying the same pixels.
     wrapped    the offer bar or the filter row on more than one line.
     tiny       a control under 32px in either direction, which fails a thumb.
   ========================================================================= */
(function (root) {
  'use strict';

  /* w, h, and what the size is, so a failure names a device rather than a number */
  var VIEWPORTS = [
    [320, 568, 'iPhone SE 1st gen · 9:16 · the floor'],
    [360, 640, 'Android 9:16 · still common in Asia'],
    [360, 800, 'Galaxy A/S · 9:20 · #1 mobile worldwide'],
    [375, 667, 'iPhone SE 2/3 · 9:16'],
    [375, 812, 'iPhone 13 mini · 19.5:9'],
    [390, 844, 'iPhone 14/15/16 · 19.5:9 · #2 mobile'],
    [393, 852, 'iPhone 15/16 Pro · 19.5:9 · #3 mobile'],
    [412, 915, 'Pixel / Galaxy · 20:9'],
    [414, 896, 'iPhone XR/11 · 19.5:9'],
    [430, 932, 'iPhone Pro Max · 19.5:9'],
    [768, 1024, 'iPad portrait · 3:4 · 55% of tablets'],
    [810, 1080, 'iPad 10.2 portrait · 3:4'],
    [820, 1180, 'iPad Air portrait · 3:4'],
    [1024, 768, 'iPad landscape · 4:3'],
    [1024, 1366, 'iPad Pro 12.9 portrait · 3:4'],
    [1280, 720, 'laptop · 16:9'],
    [1280, 800, 'MacBook Air · 16:10'],
    [1366, 768, '#2 desktop worldwide · 16:9'],
    [1440, 900, 'MacBook Pro · 16:10'],
    [1536, 864, '#3 desktop · Windows at 125% · 16:9'],
    [1920, 1080, '#1 desktop worldwide · 16:9'],
    [2560, 1440, 'QHD · 16:9'],
    [3440, 1440, 'ultrawide · 21:9'],
  ];

  function box(el) { return el.getBoundingClientRect(); }
  function name(el) {
    var c = (el.className || '').toString().trim().split(/\s+/)[0] || '';
    return el.tagName.toLowerCase() + (c ? '.' + c : '');
  }

  /** Everything wrong on one loaded document at its current size. */
  function check(doc, win) {
    var out = [];
    var W = win.innerWidth;
    var add = function (kind, what, detail) { out.push({ kind: kind, what: what, detail: detail }); };

    /* --- the page itself must not scroll sideways --- */
    var de = doc.documentElement;
    if (de.scrollWidth > W + 1) add('overflow', 'page', de.scrollWidth + 'px wide in ' + W);

    /* --- nor may anything stick out of it --- */
    var all = doc.querySelectorAll('body *');
    var seen = {};
    for (var i = 0; i < all.length; i++) {
      var el = all[i], b = box(el), s = win.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || !b.width || !b.height) continue;
      if (s.position === 'fixed') continue;           /* drawers and veils are meant to */

      /* out of the viewport sideways */
      if (b.right > W + 1 || b.left < -1) {
        /* only report the OUTERMOST offender: a card sticking out drags its
           children with it and would otherwise report forty times */
        var p = el.parentElement, inherited = false;
        while (p && p !== doc.body) {
          var pb = box(p);
          if (pb.right > W + 1 || pb.left < -1) { inherited = true; break; }
          p = p.parentElement;
        }
        if (!inherited && !seen['o' + name(el)]) {
          seen['o' + name(el)] = 1;
          add('overflow', name(el), Math.round(b.left) + '→' + Math.round(b.right) + ' of ' + W);
        }
      }

      /* text cut off inside its own box */
      if ((s.whiteSpace === 'nowrap' || s.textOverflow === 'ellipsis')
          && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0
          && s.overflowX !== 'auto' && s.overflowX !== 'scroll') {
        if (!seen['c' + name(el)]) {
          seen['c' + name(el)] = 1;
          add('clipped', name(el), el.scrollWidth + ' in ' + el.clientWidth + ' — "'
            + (el.textContent || '').trim().slice(0, 24) + '"');
        }
      }
    }

    /* --- the two bands the owner asked to stay on one line --- */
    var bar = doc.querySelector('.obar-in');
    if (bar) {
      var lh = parseFloat(win.getComputedStyle(bar).lineHeight) || 18;
      var lines = Math.round((box(bar).height - 14) / lh);
      if (lines > 1) add('wrapped', '.obar-in', lines + ' lines');
    }
    var row = doc.querySelector('.fscroll');
    if (row) {
      var pills = row.querySelectorAll('.fp');
      if (pills.length > 1) {
        var tops = {}, n = 0;
        for (var k = 0; k < pills.length; k++) {
          var t = Math.round(box(pills[k]).top);
          if (!tops[t]) { tops[t] = 1; n++; }
        }
        if (n > 1) add('wrapped', '.fscroll', n + ' rows of pills');
      }
    }

    /* --- header controls must not share pixels --- */
    var hd = doc.querySelector('.pub-hd-in');
    if (hd) {
      var items = [];
      for (var c = 0; c < hd.children.length; c++) {
        var ch = hd.children[c];
        if (win.getComputedStyle(ch).display === 'none') continue;
        var cb = box(ch);
        if (cb.width) items.push({ el: ch, b: cb });
      }
      for (var a = 0; a < items.length; a++) {
        for (var z = a + 1; z < items.length; z++) {
          if (items[a].b.right > items[z].b.left + 1 && items[z].b.right > items[a].b.left + 1) {
            add('collision', name(items[a].el) + ' / ' + name(items[z].el),
              Math.round(items[a].b.right) + ' over ' + Math.round(items[z].b.left));
          }
        }
      }
      /* and the lockup must not be squashed under its own text */
      var brand = hd.querySelector('.brand');
      if (brand && brand.scrollWidth > brand.clientWidth + 1) {
        add('clipped', '.brand', brand.scrollWidth + ' in ' + brand.clientWidth);
      }
    }

    /* --- a control too small to hit --- */
    var hits = doc.querySelectorAll('button, a.btn, .fp, .mlang-b');
    for (var q = 0; q < hits.length; q++) {
      var hb = box(hits[q]);
      if (!hb.width || !hb.height) continue;
      if (win.getComputedStyle(hits[q]).display === 'none') continue;
      if (hb.height < 32 || hb.width < 24) {
        if (!seen['t' + name(hits[q])]) {
          seen['t' + name(hits[q])] = 1;
          add('tiny', name(hits[q]), Math.round(hb.width) + '×' + Math.round(hb.height));
        }
      }
    }
    return out;
  }

  /** Loads one url at one size and returns its findings. */
  function probe(url, w, h, settle) {
    return new Promise(function (resolve) {
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-10000px;top:0;border:0;'
        + 'width:' + w + 'px;height:' + h + 'px';
      f.src = url;
      f.onload = function () {
        /* the merchandise pages redraw themselves after boot; checking before
           that would audit the static HTML rather than what a visitor sees */
        setTimeout(function () {
          var found;
          try { found = check(f.contentDocument, f.contentWindow); }
          catch (e) { found = [{ kind: 'error', what: url, detail: e.message }]; }
          f.remove();
          resolve(found);
        }, settle || 1200);
      };
      document.body.appendChild(f);
    });
  }

  root.VIEWPORTS = VIEWPORTS;
  root.probe = probe;
  root.run = function (urls, sizes, settle) {
    var jobs = [];
    (sizes || VIEWPORTS).forEach(function (v) {
      urls.forEach(function (u) { jobs.push([u, v]); });
    });
    var results = [];
    return jobs.reduce(function (chain, job) {
      return chain.then(function () {
        return probe(job[0], job[1][0], job[1][1], settle).then(function (found) {
          found.forEach(function (f) {
            results.push({ size: job[1][0] + '×' + job[1][1], device: job[1][2], page: job[0], ...f });
          });
        });
      });
    }, Promise.resolve()).then(function () { return results; });
  };
})(window.__RESP__ = window.__RESP__ || {});
