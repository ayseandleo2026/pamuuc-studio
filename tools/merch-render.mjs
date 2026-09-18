/* ============================================================================
   The merchandise pages, drawn by the mockup's own code
   ---------------------------------------------------------------------------
   The suite mockup is a single-page app, but its ~3,600 lines of page
   renderers touch the DOM exactly zero times: every pub* function takes data
   and returns a string of HTML. So they run here, in a Node vm with a small
   DOM stub, and the static site is built from their output.

   That is the whole point. The design cannot drift from the approved mockup,
   because the mockup is what draws it — the same arrangement as the intake
   emails, where one module renders both the preview and the live mail.

   Two things are swapped on the way through:

     images   the mockup carries photographs as base64 data URIs, because the
              Artifact CSP admits no external host. Here the pack objects are
              rewritten to the extracted files' URLs before anything renders,
              so app.js itself is never edited.

     links    the app navigates by `data-go="public:products"` and a click
              handler. A website navigates by <a href>. The attribute is
              rewritten into a real link, which is also what makes the
              catalogue crawlable.

   ========================================================================= */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/* Browser scripts share one global lexical scope — a top-level `const` in
   journal.js is visible to app.js. Running each file through its own
   runInContext would give each its own scope, so they are concatenated and run
   as one script, which is what the browser effectively does. */
/* The files the build genuinely needs: the design, the data and the copy. All
   four are in git. */
const REQUIRED = ['journal.js', 'data.js', 'catalogue.js', 'app.js'];

/* The photograph packs. These are ~60MB of base64 and are NOT in git, because
   tools/extract-images.mjs has already turned them into the real files the
   site ships. They are not needed either: every data URI in them is replaced
   by a manifest URL before anything renders, so only the KEYS ever mattered —
   and the manifest holds every key. When the packs are present they are used;
   when they are not, they are rebuilt from the manifest, which is what lets a
   fresh clone build. */
const PACK_FILES = [
  'photos.js', 'home.js', 'covers.js', 'merch-hero.js',
  'shots-model.js', 'shots-model-1.js', 'shots-model-2.js',
  'shots-back.js', 'shots-swatch.js', 'shots-hero-alt.js',
];

/* Which prefix each pack's keys carry in the manifest. Mirrors PACK_NAMES in
   app.js and the `set` column in tools/extract-images.mjs — HEROALT and SWATCH
   share key names for different photographs, so the set is part of the key. */
const PACK_PREFIX = {
  PHOTOS: '', HOME_PHOTOS: '', COVERS: 'cover-',
  MODEL: 'model/', MODEL_1: 'model/', MODEL_2: 'model/',
  MODELB: 'back/', SWATCH: 'swatch/', HEROALT: 'alt/',
};

const noop = () => {};
const stubEl = () => ({
  dataset: {}, style: {},
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop, removeEventListener: noop, appendChild: noop,
  setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
  querySelector: () => null, querySelectorAll: () => [], closest: () => null,
  focus: noop, blur: noop, scrollIntoView: noop, remove: noop, click: noop,
  innerHTML: '', outerHTML: '', textContent: '', value: '', checked: false, children: [],
});

/**
 * Boots the mockup once and hands back a renderer.
 * @param {string} mockupDir  the mockup/ folder
 * @param {object} manifest   key -> {url}, from tools/extract-images.mjs
 */
/**
 * The pack objects as JavaScript, built from the image manifest. Same variable
 * names and same keys as the real packs; the values are URLs rather than base64,
 * which is what they would have been rewritten to anyway.
 */
export function packSource(manifest, covers) {
  const out = [];
  for (const [name, prefix] of Object.entries(PACK_PREFIX)) {
    if (name === 'COVERS') continue;
    const map = {};
    for (const [key, e] of Object.entries(manifest)) {
      if (prefix) { if (key.startsWith(prefix)) map[key.slice(prefix.length)] = e.url; }
      else if (!key.includes('/') && !key.startsWith('cover-') && key !== 'merch-hero') map[key] = e.url;
    }
    out.push(`var ${name} = ${JSON.stringify(map)};`);
  }
  /* COVERS carries alt text and a caption beside each image, and those are
     content — they come from content/merch.covers.json, not the manifest. */
  const cov = {};
  for (const [key, meta] of Object.entries(covers || {})) {
    const e = manifest['cover-' + key];
    if (e) cov[key] = { src: e.url, alt: meta.alt || '', cap: meta.cap || '' };
  }
  out.push(`var COVERS = ${JSON.stringify(cov)};`);
  out.push(`window.MERCH_HERO = ${JSON.stringify((manifest['merch-hero'] || {}).url || '')};`);
  return out.join('\n');
}

export function loadMockup(mockupDir, manifest, covers) {
  const gone = REQUIRED.filter((f) => !existsSync(join(mockupDir, f)));
  if (gone.length) {
    throw new Error(`the mockup is missing ${gone.join(', ')} — these are the design and the data, and they are in git.`);
  }

  /* Use the real packs when they are here, otherwise rebuild them. Either way
     the values become manifest URLs, so the output is the same. */
  const havePacks = PACK_FILES.every((f) => existsSync(join(mockupDir, f)));
  const packJS = havePacks
    ? PACK_FILES.map((f) => readFileSync(join(mockupDir, f), 'utf8')).join('\n;\n')
    : packSource(manifest, covers);

  const src = [packJS, ...REQUIRED.map((f) => readFileSync(join(mockupDir, f), 'utf8'))].join('\n;\n');

  const rootEl = stubEl();
  const store = new Map();
  const ctx = {
    console: { log: noop, warn: noop, error: noop, info: noop },
    document: {
      addEventListener: noop, removeEventListener: noop,
      /* #root exists on the real page and the boot code writes into it, so it
         exists here too — letting the app boot for real is a better signal
         than skipping it. Everything else is genuinely absent. */
      getElementById: (id) => (id === 'root' ? rootEl : null),
      querySelector: (q) => (q === '#root' ? rootEl : null),
      querySelectorAll: () => [],
      createElement: stubEl, documentElement: stubEl(), body: stubEl(), head: stubEl(),
      readyState: 'complete', title: '', cookie: '',
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k), clear: () => store.clear(),
    },
    location: { hash: '', pathname: '/', href: 'https://pamuuc-studio.com/', search: '', origin: 'https://pamuuc-studio.com' },
    history: { pushState: noop, replaceState: noop },
    navigator: { userAgent: 'node', language: 'en', languages: ['en'] },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop }),
    requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: noop,
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    crypto: globalThis.crypto, fetch: () => Promise.reject(new Error('no network at build time')),
    CustomEvent: function (t, o) { return { type: t, ...(o || {}) }; },
    Event: function (t) { return { type: t }; },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    IntersectionObserver: function () { return { observe: noop, disconnect: noop, unobserve: noop }; },
    ResizeObserver: function () { return { observe: noop, disconnect: noop, unobserve: noop }; },
    scrollTo: noop, scrollBy: noop, alert: noop, confirm: () => false, print: noop, open: () => null,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    innerWidth: 1280, innerHeight: 900, devicePixelRatio: 1,
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'mockup.js', timeout: 120000 });

  /* ---- swap the data URIs for the extracted files ----------------------- */
  const url = (key) => (manifest[key] ? manifest[key].url : null);
  const swapped = { hit: 0, miss: [] };

  const packs = vm.runInContext(
    '({ PHOTOS: typeof PHOTOS !== "undefined" ? PHOTOS : null,' +
    '   HOME_PHOTOS: typeof HOME_PHOTOS !== "undefined" ? HOME_PHOTOS : null,' +
    '   COVERS: typeof COVERS !== "undefined" ? COVERS : null,' +
    '   MODEL: typeof MODEL !== "undefined" ? MODEL : null,' +
    '   MODEL_1: typeof MODEL_1 !== "undefined" ? MODEL_1 : null,' +
    '   MODEL_2: typeof MODEL_2 !== "undefined" ? MODEL_2 : null,' +
    '   MODELB: typeof MODELB !== "undefined" ? MODELB : null,' +
    '   SWATCH: typeof SWATCH !== "undefined" ? SWATCH : null,' +
    '   HEROALT: typeof HEROALT !== "undefined" ? HEROALT : null })', ctx);

  for (const [name, obj] of Object.entries(packs)) {
    if (!obj) continue;
    const prefix = PACK_PREFIX[name] ?? '';
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      const isStr = typeof v === 'string' && v.startsWith('data:');
      const isRec = v && typeof v === 'object' && typeof v.src === 'string' && v.src.startsWith('data:');
      if (!isStr && !isRec) continue;
      const u = url(prefix + key);
      if (!u) { swapped.miss.push(`${name}.${key}`); continue; }
      if (isStr) obj[key] = u; else v.src = u;
      swapped.hit++;
    }
  }
  const heroUrl = url('merch-hero');
  if (heroUrl) ctx.MERCH_HERO = heroUrl;
  /* the memoised card picks were computed against the old pack values */
  vm.runInContext('typeof bindPacks === "function" && bindPacks()', ctx);

  const fn = (name) => vm.runInContext(`typeof ${name} === "function" ? ${name} : null`, ctx);
  const S = vm.runInContext('typeof S !== "undefined" ? S : null', ctx);

  return {
    S,
    swapped,
    /** Sets a field on the app's UI state before a render.
        The journal is the one place whose output depends on which branch you
        arrived from — pubBlog() and pubPost() both read UI.lastBranch — and a
        builder has no navigation history to have set it. Leaving it to the
        order pages happen to be rendered in would work today and break the day
        somebody reorders the list. */
    /** Runs an expression inside the app's own scope, so a pricing check
        exercises the real quoteLines() rather than a copy of it. */
    evalIn(expr) { return vm.runInContext(expr, ctx); },

    setUI(patch) {
      vm.runInContext('Object.assign(UI, ' + JSON.stringify(patch) + ');', ctx);
    },

    /** Calls a pub* renderer and returns its HTML. */
    render(name, ...args) {
      const f = fn(name);
      if (!f) throw new Error(`the mockup has no renderer called ${name}`);
      return f(...args) || '';
    },
    /** The product families, which are what a "collection" is here — derived
        from the catalogue rather than listed anywhere, so they are read from
        the mockup's own helpers instead of being restated. */
    categories() {
      const list = vm.runInContext('typeof catsInUse === "function" ? catsInUse() : []', ctx) || [];
      const slug = fn('merchSlug'), name = fn('catName'), alt = fn('catSlug');
      /* The mockup has two slug functions for a family and they disagree:
         merchSlug('Outerwear') is 'jackets', catSlug('Outerwear') is
         'outerwear'. Inside an SPA that is invisible. As a URL it is two
         addresses for one page, so both are reported and the builder picks
         one. */
      return [...list].map((c) => ({
        cat: c,
        slug: slug ? slug(c) : String(c),
        altSlug: alt ? alt(c) : null,
        name: name ? name(c) : String(c),
      }));
    },
  };
}
