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

/** pathname -> the route the app should be on. Generated from the same table
    the builder used, so the two cannot disagree. */
function routeTable(M, site, LOCALES) {
  const table = {};
  for (const loc of LOCALES) {
    for (const p of pageList(M, site, loc)) {
      const [kind, arg] = p.id.split(':');
      const page = { chooser: 'home', merch: 'merch', products: 'products',
        collections: 'collections', method: 'method', howto: 'howto',
        merchhelp: 'merchhelp', quote: 'quote', about: 'about', contact: 'contact',
        search: 'search', product: 'product', collection: 'collection', build: 'build' }[kind];
      if (!page) continue;
      table[p.url] = { page, id: kind === 'product' ? p.arg : (kind === 'build' ? p.arg : arg), loc };
    }
  }
  return table;
}

/* The shim is a real file, not a template literal — see the note at the top
   of tools/merch-shim.js for the four bugs that cost. It is concatenated
   verbatim, never interpolated. */
const SHIM = readFileSync(join(HERE, 'merch-shim.js'), 'utf8');

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
    SEED_GUARD,
    app,
    SHIM,
  ].join('\n;\n');
}
