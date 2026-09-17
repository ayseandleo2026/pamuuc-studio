/* ============================================================================
   The merchandise pages, assembled
   ---------------------------------------------------------------------------
   Puts the three pieces together: the mockup draws the body, merch-static.mjs
   makes it a website's HTML, and build.mjs's own head() wraps it so every page
   carries the same canonical, hreflang, CSP and structured data as the rest of
   the site. Nothing here draws anything — if a page looks wrong, it looks
   wrong in the mockup too, which is the point.
   ========================================================================= */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadMockup } from './merch-render.mjs';
import { pageList, catLookup, productSlug } from './merch-routes.mjs';
import { linkify, dimension, displayClasses, wireForms } from './merch-static.mjs';
import { translate } from './merch-strings.mjs';

/* Titles and descriptions are written, not scraped. Scraping looked tempting —
   every page has an h1 and a lede — but the lede on half of them belongs to
   the FAQ block further down, and a product's lede is "4 products in t-shirts",
   which describes the family rather than the thing being sold. A meta
   description is the sentence that appears under the link in a search result;
   it is worth writing.

   Lengths are held inside the audit's limits: title 15-65, description 50-170. */
const META = {
  chooser: {
    title: 'PAMUUC | Custom uniforms and branded merchandise',
    description: 'Uniforms developed around how your team works, and branded merchandise you personalise yourself. Two services from one studio in Barcelona.',
  },
  merch: {
    title: 'Branded merchandise for companies | PAMUUC',
    description: 'Custom apparel for staff, events and company merchandise. Choose the garment, the cloth, the colour and the personalisation, and we quote it by hand.',
  },
  products: {
    title: 'All branded apparel you can personalise | PAMUUC',
    description: 'Every garment in the catalogue, compared by what actually decides it: cloth weight, the personalisation it takes and the quantity it starts from.',
  },
  collections: {
    title: 'Branded merchandise by product family | PAMUUC',
    description: 'Seven families of branded clothing. Open one to compare the products in it, the quantities they start from and the personalisation each garment carries.',
  },
  method: {
    title: 'Personalisation methods and artwork | PAMUUC',
    description: 'Embroidery, screen print, transfer and embossing — what each one suits, what it costs to set up, and the artwork each method needs from you.',
  },
  howto: {
    title: 'How to order branded merchandise | PAMUUC',
    description: 'From choosing a garment to approving the quote: what happens at each step, what we need from you, and how long the whole thing takes.',
  },
  merchhelp: {
    title: 'Help with a merchandise request | PAMUUC',
    description: 'Answers on quantities, artwork, delivery and pricing for branded merchandise — and a way to ask us something the page does not cover.',
  },
  quote: {
    title: 'Request a merchandise quote | PAMUUC',
    description: 'Tell us the garment, the quantity and the personalisation, and a person prices it by hand. Nothing is ordered and nothing is charged until you approve it.',
  },
  about: {
    title: 'About PAMUUC | Barcelona uniform studio',
    description: 'A Barcelona studio making uniforms and branded clothing since 2019, for teams who wear their work every day. Who we are and how we work.',
  },
  contact: {
    title: 'Contact PAMUUC | Barcelona',
    description: 'Tell us what you need and one of us reads it properly. Custom uniforms, branded merchandise, or a question about an order already under way.',
  },
  search: {
    title: 'Search branded merchandise | PAMUUC',
    description: 'Search the catalogue of branded apparel by garment, cloth weight, colour and the personalisation each product will take.',
  },
};

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/* Whole sentences up to the limit. Cutting mid-sentence and adding an ellipsis
   is what makes a search result look automated. */
function sentences(text, min, max) {
  const parts = String(text || '').split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of parts) {
    if (out && (out + ' ' + s).length > max) break;
    out = out ? out + ' ' + s : s;
    if (out.length >= min) { if (out.length > max) break; }
  }
  return out.length > max ? out.slice(0, max - 1).replace(/\s+\S*$/, '') : out;
}

function metaFor(page, M) {
  if (META[page.id]) return META[page.id];

  if (page.id.startsWith('product:')) {
    const p = (M.S.merchProducts || []).find((x) => x.id === page.arg);
    if (p) {
      return {
        title: `${p.name} with your logo | PAMUUC`,
        description: sentences(p.desc, 50, 170) || `${p.name} personalised with your logo, for teams, events and company merchandise.`,
      };
    }
  }
  if (page.id.startsWith('collection:') || page.id.startsWith('build:')) {
    const slug = page.id.split(':')[1];
    const cat = M.categories().find((c) => c.slug === slug);
    const name = cat ? cat.name : slug;
    const n = (M.S.merchProducts || []).filter((p) => cat && p.cat === cat.cat).length;
    if (page.id.startsWith('build:')) {
      return {
        title: `Choose ${name.toLowerCase()} by what you need | PAMUUC`,
        description: `Answer four questions — who wears it, the fit, the weight and the finish — and the ${name.toLowerCase()} in the catalogue narrow to the one that suits your team.`.slice(0, 170),
      };
    }
    return {
      title: `Branded ${name.toLowerCase()} for companies | PAMUUC`,
      description: `${n} ${n === 1 ? 'product' : 'products'} in ${name.toLowerCase()}, compared on the same basis: cloth weight, the personalisation each takes, and the quantity it starts from.`.slice(0, 170),
    };
  }
  return null;
}

/**
 * @param {object} deps  from build.mjs: { ROOT, site, LOCALES, head, abs }
 * @returns {{pages: Array, clusters: Array, problems: Array}}
 */
/* content/merch.<loc>.json, when it exists. A language with no file, or with
   gaps in it, falls back to English string by string rather than page by page:
   a half-translated page is still more use than an English one, and the build
   reports exactly what is missing. */
function dictionaries(ROOT, LOCALES) {
  const out = {};
  for (const loc of LOCALES) {
    const f = join(ROOT, `content/merch.${loc}.json`);
    if (!existsSync(f)) { out[loc] = null; continue; }
    const d = JSON.parse(readFileSync(f, 'utf8'));
    out[loc] = d.copy || d;
  }
  return out;
}

export function buildMerch({ ROOT, site, LOCALES, intakeEndpoint }) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'src/images/catalogue/manifest.json'), 'utf8'));
  const M = loadMockup(join(ROOT, 'mockup'), manifest);
  const hasDisplay = displayClasses(readFileSync(join(ROOT, 'mockup/app.css'), 'utf8'));
  const cats = catLookup(M);
  const problems = [];
  const dicts = dictionaries(ROOT, LOCALES);
  const COLOURS = new Set(JSON.parse(readFileSync(join(ROOT, 'content/merch.colours.json'), 'utf8')));
  const untranslated = {};

  /* one cluster per page id, holding its URL in each language */
  const ids = pageList(M, site, LOCALES[0]).map((p) => p.id);
  const clusters = ids.map((id) => {
    const urls = {};
    for (const loc of LOCALES) {
      const p = pageList(M, site, loc).find((x) => x.id === id);
      if (p) urls[loc] = p.url;
    }
    const sample = pageList(M, site, LOCALES[0]).find((x) => x.id === id);
    return { id: 'merch:' + id, type: 'page', priority: sample.priority || '0.6', noindex: !!sample.noindex, urls };
  });

  /* The clusters are wanted before build.mjs has finished initialising — they
     go in its cluster list — but the pages need head(), which closes over
     things defined further down that file. So the work is split: clusters now,
     HTML when asked. */
  const renderPages = (head) => {
  const pages = [];
  for (const loc of LOCALES) {
    for (const p of pageList(M, site, loc)) {
      let body;
      try { body = p.arg ? M.render(p.render, p.arg) : M.render(p.render); }
      catch (e) { problems.push(`${p.id} (${loc}) did not render: ${e.message}`); continue; }

      const meta = metaFor(p, M);
      if (!meta) { problems.push(`${p.id} has no title or description`); continue; }

      /* Translated before anything else touches it: linkify and the dimension
         pass work on attributes and tags, and the copy pass works on text, so
         doing copy first keeps each of them reading what it expects. */
      if (dicts[loc]) {
        const t = translate(body, dicts[loc], COLOURS);
        body = t.html;
        if (t.miss.length) {
          untranslated[loc] = untranslated[loc] || new Set();
          for (const m of t.miss) untranslated[loc].add(m);
        }
      }

      const a = linkify(body, loc, site, hasDisplay, cats);
      const b = dimension(a.html, manifest);
      const c = wireForms(b.html, intakeEndpoint);
      let html = c.html;

      /* #root is where the app renders. The static HTML goes inside it so the
         page is complete before any script runs; when the bundle boots it
         re-renders the same markup into the same element, and the page becomes
         interactive without changing what it looks like.

         head() emits its own skip link; the mockup's would be a second one
         pointing at the same target, which a screen reader reads out twice */
      html = html.replace(/^\s*<a class="skip"[^>]*>[\s\S]*?<\/a>\s*/, '');

      /* The chooser is the one page the mockup gives no h1 — it opens on the
         two doors, and its heading sits further down as an h2. Promoting that
         one is honest: it is the page's heading, and it reads as one. */
      if (p.id === 'chooser') {
        html = html.replace(/<h2 class="display shd-t">/, '<h1 class="display shd-t">')
                   .replace(/<\/h2>/, '</h1>');
      }

      for (const [t, n] of a.stats.unknown) problems.push(`${p.id} (${loc}): ${n}x link to unmapped target ${t}`);
      for (const u of b.stats.unknown) problems.push(`${p.id} (${loc}): image not in the manifest — ${u}`);

      pages.push({
        url: p.url, loc, cluster: clusters.find((c2) => c2.id === 'merch:' + p.id),
        html: head({
          loc, url: p.url, title: meta.title, description: meta.description,
          cluster: clusters.find((c2) => c2.id === 'merch:' + p.id),
        }) + `<div id="root">` + html + `</div>` + '\n</body>\n</html>\n',
      });
    }
  }
  return pages;
  };

  /* url -> the title and description this builder gave that page, so the
     runtime router can restore them on a client-side navigation instead of
     letting the app write its own. */
  const metaByUrl = {};
  for (const loc of LOCALES) {
    for (const p of pageList(M, site, loc)) {
      const m = metaFor(p, M);
      if (m) metaByUrl[p.url] = m;
    }
  }

  return {
    clusters, problems, M, renderPages, metaByUrl, dicts,
    /* what each language is still missing, for the build's own report */
    untranslated: () => Object.fromEntries(
      Object.entries(untranslated).map(([l, set]) => [l, [...set]])),
  };
}

export { productSlug };
