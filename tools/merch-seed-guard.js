/* ============================================================================
   Boot from the seed, never from a visitor's saved copy
   ---------------------------------------------------------------------------
   Concatenated BEFORE the mockup's own files, because app.js ends in an IIFE
   that calls restore() — by the time the shim at the other end of the bundle
   runs, the damage is already done.

   The mockup persists its whole world under pamuuc_suite_v12: accounts,
   projects, the catalogue, the offers. Reloading and finding your work still
   there is the right behaviour for a prototype you are clicking through.

   On a public website it is a slow-acting copy bug. restore() replaces S
   wholesale, and only two things are refreshed from the seed afterwards:
   positions_lib, and the catalogue when catSig differs. catSig is

       products : garments : price-breaks

   — three counts. So a price change, a reworded description, a new offer, a
   changed minimum: none of them move a single count, none of them refresh
   anything, and a returning visitor keeps whatever the site said on the day
   they first arrived. It surfaced as the first-order banner still reading
   "Applied to the quote, before you approve it." — wording that was removed
   from the repository, present in no built file, and still on the screen,
   served out of a 320KB blob in localStorage.

   Nothing on the merchandise side needs resuming. The quote basket is kept
   separately by the shim (pamuuc_merch_quote), and consent, theme and the
   first-order marker have their own keys. So the saved state is cleared here
   before app.js can read it, and the shim stops save() writing another.

   Deliberately narrow: only keys beginning pamuuc_suite_. The mockup's own
   pruneOldState() already removes superseded versions of its key, so matching
   the prefix rather than one version means a future v13 cannot reintroduce
   this.
   ========================================================================= */
/* ---------------------------------------------------------------------------
   And the flash.

   app.js ends in a boot IIFE that calls readHash() and render(). At that
   moment the shim has not loaded, so readHash() is still the mockup's own — it
   reads location.hash, finds none, and returns the HOME page. render() then
   writes the home page into #root, over the correct server-rendered HTML,
   and a fraction of a second later the shim installs the real router and
   renders the page you actually asked for. That is the "it shows another page
   for a moment" — it is not a cache, it is the app briefly disagreeing with
   the URL.

   render() writes through $('root'), and $ is document.getElementById. So the
   first render is given a detached element to write into. Nothing is painted,
   the server-rendered HTML stays exactly where it is, and the shim hands the
   real #root back before the first render that knows the route. The static
   markup and the app's markup are the same markup, so the swap is invisible.

   If the shim never loads, the decoy is never handed back and the page stays
   as served: not interactive, but correct and fully navigable, because every
   control was turned into a real link at build time. That is the right way to
   fail.
   ------------------------------------------------------------------------ */
(function () {
  try {
    var real = document.getElementById.bind(document);
    var decoy = document.createElement('div');
    decoy.id = 'root';
    document.getElementById = function (id) { return id === 'root' ? decoy : real(id); };
    window.__MERCH_REAL_ROOT__ = function () { document.getElementById = real; };
  } catch (e) { /* nothing to undo: the app renders as it did before */ }
})();

(function () {
  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.indexOf('pamuuc_suite_') === 0) localStorage.removeItem(k);
    }
  } catch (e) {
    /* Private browsing, blocked storage, a full quota. restore() is wrapped in
       its own try/catch and returns false, which is exactly the outcome this
       was arranging anyway — so there is nothing to recover from. */
  }
})();
