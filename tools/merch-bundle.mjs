/* ============================================================================
   The runtime bundle
   ---------------------------------------------------------------------------
   The static HTML is what a crawler reads and what paints first. This is what
   makes the page work for a person: choosing a colour, a quantity, a placement,
   adding to a quote. Without it the catalogue is a brochure of the mockup
   rather than the mockup.

   It is the mockup's own files, concatenated in the order its index.html loads
   them, plus two things:

     images  the packs as URL maps instead of base64. Same keys, same lookups,
             so app.js cannot tell the difference — but ~400KB of text rather
             than 62MB of data URIs.

     router  the app navigates by location.hash; a website navigates by path.
             readHash() and go() are the only two functions that care, and both
             are plain top-level declarations in a classic script, so they can
             be replaced from a script appended after. Nothing in app.js is
             edited — which is what keeps the runtime page and the built page
             the same page.

   Everything shares one global scope, exactly as it does in the mockup's
   index.html, which is why this is one concatenated classic script and not
   modules.
   ========================================================================= */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageList, urlFor } from './merch-routes.mjs';
import { packSource } from './merch-render.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/* the order mockup/index.html loads them in; the photo packs are replaced */
const APP_FILES = ['journal.js', 'data.js', 'catalogue.js', 'app.js'];

/* The pack objects come from tools/merch-render.mjs — the same function the
   builder uses, so the runtime and the build cannot disagree about what an
   image is called. It also had its own copy of the covers parser here, which
   expected quoted keys and so produced an empty COVERS on every build. */

/* Targets the app links to that this bundle does not route: the legal pages,
   the custom uniforms side and the journal, all built by the other builder.
   The static HTML gets their href from linkify, but the app redraws its own
   markup without one — so after hydration the footer's Privacy, Terms, Cookie
   settings and Accessibility links, and the only route to Custom Uniforms,
   became dead <a> elements with no href, no history entry and no way to open
   in a new tab. relink() needs to know them too. */
function offsiteLinks(site, LOCALES) {
  const out = {};
  const targets = ['public:privacy', 'public:terms', 'public:cookies',
    'public:accessibility', 'public:custom', 'public:form', 'public:blog'];
  for (const loc of LOCALES) {
    for (const t of targets) {
      const u = urlFor(t, loc, site);
      if (u) out[loc + '|' + t] = u;
    }
  }
  return out;
}

const PAGE_OF = { chooser: 'home', merch: 'merch', products: 'products',
  collections: 'collections', method: 'method', howto: 'howto',
  merchhelp: 'merchhelp', quote: 'quote', about: 'about', contact: 'contact',
  search: 'search', product: 'product', collection: 'collection', build: 'build' };

/** page|id for one entry of pageList — the key both tables below are cut on. */
function routeKey(p) {
  const [kind, arg] = p.id.split(':');
  const page = PAGE_OF[kind];
  if (!page) return null;
  const id = kind === 'product' || kind === 'build' ? p.arg : arg;
  return { page, id, key: page + '|' + (id || '') };
}

/** pathname -> the route the app should be on. Generated from the same table
    the builder used, so the two cannot disagree. */
function routeTable(M, site, LOCALES) {
  const table = {};
  for (const loc of LOCALES) {
    for (const p of pageList(M, site, loc)) {
      const r = routeKey(p);
      if (r) table[p.url] = { page: r.page, id: r.id, loc };
    }
  }
  return table;
}

/** page|id -> {en: url, es: url, …}: the same page in every language.
    One table serves two jobs that were both broken in the same way — the
    switcher, which sent every visitor to the home page, and the hreflang set,
    which kept the first page's languages after a client-side navigation. */
function langTable(M, site, LOCALES) {
  const table = {};
  for (const loc of LOCALES) {
    for (const p of pageList(M, site, loc)) {
      const r = routeKey(p);
      if (!r) continue;
      (table[r.key] || (table[r.key] = {}))[loc] = p.url;
    }
  }
  return table;
}

/* The shim is a real file, not a template literal — see the note at the top
   of tools/merch-shim.js for the four bugs that cost. It is concatenated
   verbatim, never interpolated. */
const SHIM = readFileSync(join(HERE, 'merch-shim.js'), 'utf8');

/* The switcher's markup, shared with the static builder so the control the
   crawler reads and the control that survives a redraw cannot differ. */
const LANG = readFileSync(join(HERE, 'merch-lang.js'), 'utf8');

/* Runs before the mockup's own files: app.js boots from an IIFE at its end, so
   a saved state has already been restored by the time the shim is reached. */
const SEED_GUARD = readFileSync(join(HERE, 'merch-seed-guard.js'), 'utf8');

/** One line of CSS for the elements the builder turned into links. */
export const MERCH_CSS = `
/* Prototype furniture that must never reach a customer. The app redraws the
   page after it boots, so removing these from the built HTML alone is not
   enough — they come back on the next render. A stylesheet rule holds for
   both, and .switch in particular carries a "reset every record" button. */
.switch{display:none !important}
[data-go="public:login"],[data-go="public:studiohelp"]{display:none !important}

/* Elements the static builder turned into <a> that had no display of their own.
   Only these are touched: a class that already sets display keeps it, because
   a rule like a.pc{display:block} would beat .pc{display:flex} on specificity
   and flatten the card. */
a[data-blk]{display:block}

/* The quote drawer scrolls as one list. The summary rows and the presentation
   card used to sit in the pinned footer, which on a laptop left the products
   themselves about two lines of scrollable height; they are in the scrolling
   body now, and the footer keeps only the total and the button. .dsum is the
   seam between the two — it needs the rule the footer's border used to give. */
.dsum{margin-top:var(--sp-5);padding-top:var(--sp-5);border-top:1px solid var(--line)}
.dsum .btn--block{margin-top:var(--sp-4)}
/* Room to scroll past the last control rather than ending flush against the
   footer, which reads as "there is nothing more" when there is. */
.drawer-body{padding-bottom:var(--sp-6)}
/* A short window is exactly where this went wrong, so the footer is capped and
   given its own scroll rather than being allowed to grow without limit again. */
.drawer-foot{max-height:45vh;overflow-y:auto}
/* On a laptop the browser's own chrome takes a third of the screen before the
   page gets any, and the drawer is full height — so the two bands that do not
   scroll give some of their padding back rather than charging it to the list. */
@media (max-height:780px){
  .drawer-h{padding:var(--sp-4) var(--sp-6)}
  .drawer-foot{padding:var(--sp-4) var(--sp-6)}
  .drawer-foot .btn--block{margin-top:var(--sp-3)}
}

/* The language switcher. The mockup had a stub button and no menu to style,
   so this is new — but it is the merchandise side's own tokens throughout, and
   the shape deliberately matches the switcher the custom uniforms pages have
   had all along, because they are one site and this is one control. */
.mlang{position:relative;display:inline-flex}
.mlang-b{gap:var(--sp-1);letter-spacing:.06em}
.mlang-b svg{opacity:.7;transition:transform var(--dur-focus) var(--ease)}
.mlang-b[aria-expanded="true"] svg{transform:rotate(180deg)}
.mlang-m{position:absolute;right:0;top:calc(100% + var(--sp-2));z-index:70;
  min-width:12rem;padding:var(--sp-1);background:var(--surface);
  border:1px solid var(--line);border-radius:var(--radius-md);box-shadow:var(--shadow-3)}
.mlang-m[hidden]{display:none}
.mlang-m a{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-5);
  padding:var(--sp-2) var(--sp-3);border-radius:var(--radius-sm);
  font-size:var(--fs-sm);color:var(--ink);white-space:nowrap}
.mlang-m a:hover{background:var(--surface-2)}
.mlang-c{font-size:var(--fs-xs);letter-spacing:.06em;color:var(--muted)}
.mlang-m a[aria-current="true"]{font-weight:500}
.mlang-m a[aria-current="true"] .mlang-c{color:var(--ink)}

/* On the hero photograph the control sits on the image, where the quiet
   button's border and ink would disappear. Same rule the mockup's own
   btn--onphoto uses, applied to the button this replaced it with. */
.mlang--onphoto .mlang-b{background:transparent;border-color:rgba(244,242,237,.55);color:#F4F2ED}
.mlang--onphoto .mlang-b:hover:not(:disabled){background:rgba(244,242,237,.12);border-color:#F4F2ED}

/* The footer's row of names, in place of the stub that listed three languages
   and did nothing. */
.mlang-row{color:var(--muted);font-size:var(--fs-sm)}
.mlang-row a{color:var(--muted)}
.mlang-row a:hover{color:var(--ink)}
.mlang-row a[aria-current="true"]{color:var(--ink)}
.mlang-row i{font-style:normal;opacity:.5}
`;

export function merchJS({ ROOT, site, LOCALES, M, manifest, metaByUrl, intake, covers }) {
  const mockupDir = join(ROOT, 'mockup');
  const app = APP_FILES.map((f) => readFileSync(join(mockupDir, f), 'utf8')).join('\n;\n');
  const table = routeTable(M, site, LOCALES);
  return [
    '/* PAMUUC merchandise — generated by tools/merch-bundle.mjs. Do not edit. */',
    packSource(manifest, covers),
    `window.__MERCH_ROUTES__ = ${JSON.stringify(table)};`,
    `window.__MERCH_META__ = ${JSON.stringify(metaByUrl || {})};`,
    `window.__MERCH_INTAKE__ = ${JSON.stringify(intake || '')};`,
    `window.__MERCH_STUDIO_EMAIL__ = ${JSON.stringify(site.intake.studioEmail || 'simone@pamuuc-studio.com')};`,
    `window.__MERCH_OFFSITE__ = ${JSON.stringify(offsiteLinks(site, LOCALES))};`,
    `window.__MERCH_LANGS__ = ${JSON.stringify(langTable(M, site, LOCALES))};`,
    `window.__MERCH_LOCALES__ = ${JSON.stringify(Object.fromEntries(
      LOCALES.map((l) => [l, site.locales[l].label])))};`,
    `window.__MERCH_LANG_TITLE__ = ${JSON.stringify(Object.fromEntries(
      LOCALES.map((l) => [l, (site.strings[l] || {}).language || 'Language'])))};`,
    SEED_GUARD,
    LANG,
    app,
    SHIM,
  ].join('\n;\n');
}
