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
  search: 'search', product: 'product', collection: 'collection', build: 'build',
  merchblog: 'blog', merchpost: 'post' };

/** page|id for one entry of pageList — the key both tables below are cut on. */
function routeKey(p) {
  const [kind, arg] = p.id.split(':');
  const page = PAGE_OF[kind];
  if (!page) return null;
  const id = kind === 'product' || kind === 'build' || kind === 'merchpost' ? p.arg : arg;
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

/* ---------------------------------------------------------------------------
   Responsive corrections, from the audit across the twenty most-used screen
   sizes of 2026 (tools/responsive-harness.js). Each one is a real failure at a
   real size, not a preference.
   ------------------------------------------------------------------------ */

/* The headline price. At 34px with -.03em the decimal point is crushed between
   two nines and "9.99" reads as one number. The cents get the tracking back
   plus a hair of margin — a seam, not a gap. */
.pdp-from b .cts{font-style:normal;letter-spacing:0;margin-left:.07em}

/* The filter pills are <button> in the mockup and <a> here, and a link does not
   centre its own text the way a button does. With min-height:40px and nothing
   centring it, the label sat 4px from the top of the pill with 23px of air
   underneath. Specificity has to beat a[data-blk]{display:block} above. */
a[data-blk].fp,.fp{display:inline-flex;align-items:center;justify-content:center}

/* The filter row is a horizontal scroller, and on a phone it was being sliced
   at the page gutter — a pill cut in half 16px short of the edge reads as a
   layout fault rather than as "there is more, push it". Pulled out to the
   screen edge and padded back in, so the pills start where the text starts and
   scroll off the actual edge. */
@media (max-width:900px){
  .fscroll{margin-left:calc(var(--sp-4) * -1);margin-right:calc(var(--sp-4) * -1);
    padding-left:var(--sp-4);padding-right:var(--sp-4);
    scroll-padding-left:var(--sp-4)}
}

/* The offer bar: one line at every width, in every language.
   ---------------------------------------------------------------------------
   Making it nowrap stopped it wrapping and started it colliding. The dismiss is
   position:absolute, so the centred sentence beside it cannot see it; English
   happened to be short enough to clear it and French was not — "Voir l'offre"
   ran 17px under the ✕ on a Galaxy. Reserving padding for it would only move
   the guess, so below 620 the dismiss goes into the flow instead and the
   overlap becomes impossible rather than unlikely.

   The label on the link goes at the same width. The five languages are not the
   same length — "Voir l'offre" is 72px where "See how" is 44 — and a phone has
   no room for the longest of them beside a sentence. The chevron stays, the
   button keeps its accessible name, and the sentence is what a reader needs. */
.obar-in{flex-wrap:nowrap}
.obar-t{white-space:nowrap;min-width:0;overflow:hidden;text-overflow:ellipsis}
@media (max-width:620px){
  .obar{display:flex;align-items:center}
  .obar-in{flex:1;min-width:0;padding:7px var(--sp-2) 7px var(--sp-4);justify-content:flex-start}
  .obar-x{position:static;transform:none;flex:none;margin-right:var(--sp-3)}
  .obar-go-l{display:none}
  /* With the label gone an underlined chevron reads as a stray character, so
     it becomes the same round outlined control the rest of the site uses. */
  .obar-go{min-width:26px;height:26px;justify-content:center;text-decoration:none;
    border:1px solid color-mix(in srgb,#FFFFFF 45%,transparent);border-radius:var(--radius-full)}
  .obar-go:hover{background:color-mix(in srgb,#FFFFFF 15%,transparent)}
}
/* Two steps down, because the longest sentence of the five is French at 278px
   and the narrowest real screen is 320. */
@media (max-width:420px){ .obar-in{font-size:var(--fs-xs)} }
@media (max-width:360px){
  .obar-in{font-size:var(--fs-micro);padding-left:var(--sp-3)}
  .obar-x{margin-right:var(--sp-2)}
}

/* The mockup draws its own skip link, and head() emits one too, so every
   merchandise page carried two — the builder strips the mockup's from the
   static HTML but app.js puts it back the moment it boots. The one inside
   #root is the app's copy. */
#root .skip{display:none}

/* Controls below the 24px minimum of WCAG 2.5.8. All three were wide enough
   and too short — a thumb misses them on a phone. */
.obar-go{min-height:24px}
.obar-x{min-width:24px;min-height:24px}
.step-h{min-height:24px}

/* The header at phone widths. Five controls and a lockup at a 24px gap come to
   394px, so at 375 — the iPhone SE and the 13 mini, both still everywhere —
   the Menu button hung 19px off the side and took the whole page into a
   sideways scroll with it. The brand also had flex-shrink working on it, which
   squashed the lockup to 3px at 320 while its text carried on across the
   language switcher. */
.brand{flex:none}
@media (max-width:480px){
  .pub-hd-in{gap:var(--sp-3)}
  /* "| MERCHANDISE" goes: the page under it says which side you are on, and
     the mark and the name do not. */
  .brand .brand-bar,.brand .brand-sub{display:none}
}
@media (max-width:480px){
  /* The light/dark toggle is the one control with a system-level equivalent —
     prefers-color-scheme still decides — so it is what gives way when the
     header runs out of room. It has to go on every phone, not only the narrow
     ones: the label on the primary button is "Quote" in English and
     "Presupuesto" in Spanish, and that alone took the header past 390, which
     is the iPhone 14/15/16. It returns above 480. */
  .pub-hd-in [data-act="theme"]{display:none}
}
@media (max-width:380px){
  .pub-hd-in{gap:var(--sp-2);padding:0 var(--sp-3)}
}

/* The garment card, rebuilt around a tier rather than a weight.
   ---------------------------------------------------------------------------
   The tier is the headline and carries the weight of the type; the
   composition is the reading line; the actual grams are a footnote, because
   only some buyers want them and none of them want them first. */
.gopt{grid-template-rows:auto auto auto}
.gopt-t{display:flex;align-items:baseline;gap:var(--sp-2);flex-wrap:wrap;
  font-size:var(--fs-md);font-weight:500;letter-spacing:-.008em}
/* the qualifier — "Garment dyed", "Recycled" — is a note on the tier, not a
   second heading competing with it */
.gopt-x{font-style:normal;font-size:var(--fs-xs);font-weight:400;color:var(--muted);
  letter-spacing:0}
.gopt-m{grid-column:1;font-size:var(--fs-sm);color:var(--ink);line-height:1.4;
  margin-top:2px}
/* quiet, and last */
.gopt-w{grid-column:1;font-size:var(--fs-micro);color:var(--faint);
  font-variant-numeric:tabular-nums;letter-spacing:.02em;margin-top:4px}

/* The breadcrumb, given the same air on every page.
   ---------------------------------------------------------------------------
   Measured across the templates it was 41px clear of the band above it on the
   listings, 56px on the flat pages and ZERO on the product page — where its
   section carries no top padding, so the first line of navigation sat flush
   against the bottom edge of the red offer bar. That is the one that looked
   wrong, and it is the page most people land on.

   The product page gets the listings' 40px. The bottom is levelled to 24px
   everywhere, so the breadcrumb reads as its own band rather than as a caption
   belonging to whatever happens to be above or below it. */
.pdp-crumb{margin-top:var(--sp-8)}
.crumb{margin-bottom:var(--sp-6)}
.mph .crumb,.pdp-crumb{margin-bottom:var(--sp-6)}
/* The separator was 24% opacity — close to invisible against the page and
   doing none of the work a separator exists to do. */
.crumb-sep{color:color-mix(in srgb,var(--ink) 40%,transparent)}

/* A product name is not a caption, and four of the five languages are longer
   than English. The card title was one line with an ellipsis, which is fine for
   "Custom T-Shirt" and cuts "Camiseta de manga larga personalizada" and
   "T-shirt personnalisé à manches longues" mid-word. Two lines, then ellipsis:
   the grid stays tidy and the name survives. */
.pc-t{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
  overflow:hidden;text-overflow:ellipsis}

/* At the narrowest real screen — 320, the first iPhone SE — a Spanish or
   French label simply does not fit a button on one line, and .btn is nowrap,
   so instead of wrapping it pushed the whole page sideways: 347px of content
   in a 320px window on the French collection page. Below 380 a label may take
   a second line, and a word longer than the column breaks rather than
   deciding the width of the document. */
@media (max-width:380px){
  .btn{white-space:normal;min-width:0}
  body{overflow-wrap:break-word}
}

/* Two more places where a fixed nowrap meets a longer language. The card's
   spec line is hard-cut mid-word at "9 grammages", and the fact row's value
   cannot shrink because a flex child defaults to min-width:auto. */
.pc-var span{white-space:normal}
.factline{min-width:0}
.factline > *{min-width:0}

/* The two doors on the chooser. A grid item defaults to min-width:auto, so the
   card was sized by its widest child rather than by its column: "Explore custom
   uniforms →" is 262px on one line, which made a 312px card sit in a 288px
   track and took the whole page into a sideways scroll at 320. The card may
   shrink now, and at that width the label is allowed the second line it needs
   rather than deciding the width of the page. */
.pick{min-width:0}
@media (max-width:380px){
  .pick{padding:var(--sp-6)}
  .pick .btn{white-space:normal;text-align:center}
}

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
