/* ============================================================================
   The language switcher, written once
   ---------------------------------------------------------------------------
   The mockup's control was a stub: a button reading "EN" on every page in
   every language, wired to a modal that explained that the translations did
   not exist yet. They exist now, so the control has to do the thing it was
   standing in for.

   The hard part is not the markup, it is that this markup has to be produced
   twice — once by the builder into the static HTML a crawler and a no-script
   visitor read, and again by the browser every time app.js redraws the page
   and the stub comes back. Two copies of the same markup is how the two halves
   of this site drift apart, so there is one copy, here, in plain ES5 that runs
   unchanged in Node (through a vm, as the builder already runs the mockup) and
   in the browser (concatenated into the bundle ahead of the shim).

   What it renders, for the page you are actually on:

     header   a real menu of the five languages, each an <a href> to the
              equivalent page — not the home page. Leaving a product to land on
              the home page is the single most common way a switcher wastes the
              click that used it.

     footer   the same links inline, because a dropdown in a footer is a
              dropdown nobody opens.

   Both are ordinary links. Middle-click, ctrl-click, "open in new tab" and a
   crawler following the markup all work, which a button never would.
   ========================================================================= */
(function (root) {
  'use strict';

  var ORDER = ['en', 'es', 'fr', 'it', 'de'];

  function esc(s) {
    return String(s == null ? '' : s)
      .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
      .split('"').join('&quot;');
  }

  /**
   * @param opts.urls    {en:'/merchandise/', es:'/es/merchandise/', …} for THIS page
   * @param opts.loc     the language being rendered
   * @param opts.labels  {en:'English', …} from content/site.json
   * @param opts.title   the accessible name for the control, already translated
   * @param opts.inline  true for the footer's row of links
   */
  function langHTML(opts) {
    var urls = opts.urls || {};
    var loc = opts.loc || 'en';
    var labels = opts.labels || {};
    var title = opts.title || 'Language';
    var list = [];
    for (var i = 0; i < ORDER.length; i++) if (urls[ORDER[i]]) list.push(ORDER[i]);
    /* Nothing to switch to is not an error — a page that exists in one
       language only should show no control rather than a dead one. */
    if (list.length < 2) return '';

    if (opts.inline) {
      var row = [];
      for (var j = 0; j < list.length; j++) {
        var l = list[j];
        row.push('<a href="' + esc(urls[l]) + '" hreflang="' + l + '" lang="' + l + '"'
          + (l === loc ? ' aria-current="true"' : '') + '>' + esc(labels[l] || l.toUpperCase()) + '</a>');
      }
      return '<span class="mlang-row">' + row.join('<i aria-hidden="true"> · </i>') + '</span>';
    }

    var items = [];
    for (var k = 0; k < list.length; k++) {
      var c = list[k];
      items.push('<a href="' + esc(urls[c]) + '" hreflang="' + c + '" lang="' + c + '" role="menuitem"'
        + (c === loc ? ' aria-current="true"' : '') + '>'
        + '<span>' + esc(labels[c] || c) + '</span>'
        + '<span class="mlang-c">' + c.toUpperCase() + '</span></a>');
    }
    /* The id is per-render and per-instance: the header control and the one on
       the photo hero can both be on the page, and two elements sharing an id
       would point aria-controls at whichever the browser found first. */
    var id = 'mlang-' + (opts.instance || 0);
    return '<div class="mlang">'
      + '<button class="btn btn--quiet btn--sm mlang-b" type="button" data-mlang="' + id + '"'
      + ' aria-expanded="false" aria-haspopup="true" aria-controls="' + id + '"'
      + ' aria-label="' + esc(title) + '">' + loc.toUpperCase()
      + '<svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true" focusable="false">'
      + '<path d="M1 1l3.5 3.5L8 1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'
      + '</button>'
      + '<div class="mlang-m" id="' + id + '" role="menu" hidden>' + items.join('') + '</div>'
      + '</div>';
  }

  root.langHTML = langHTML;
  root.LANG_ORDER = ORDER;
})(typeof window !== 'undefined'
  ? (window.__MERCH_LANG__ = window.__MERCH_LANG__ || {})
  : (this.__MERCH_LANG__ = this.__MERCH_LANG__ || {}));
