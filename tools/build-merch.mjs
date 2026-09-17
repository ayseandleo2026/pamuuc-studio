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
import { pageList, catLookup } from './merch-routes.mjs';
import { linkify, dimension, displayClasses, wireForms } from './merch-static.mjs';
import { translate } from './merch-strings.mjs';

/* Titles and descriptions are written, not scraped. Scraping looked tempting —
   every page has an h1 and a lede — but the lede on half of them belongs to
   the FAQ block further down, and a product's lede is "4 products in t-shirts",
   which describes the family rather than the thing being sold. A meta
   description is the sentence that appears under the link in a search result;
   it is worth writing.

   Lengths are held inside the audit's limits: title 15-65, description 50-170. */
/* Titles and meta descriptions — the lines that appear under a link in a
   search result — live in content/merch.meta.<loc>.json so they can be
   translated and proofread like everything else. They were literals here, in
   English, which meant 280 pages across four languages carried an English
   title under a Spanish, French, Italian or German page. */
function metaFor(page, M, meta, dict) {
  const pages = meta.pages || {};
  const T = meta.templates || {};
  const W = meta.words || { product: 'product', products: 'products' };
  if (pages[page.id]) return pages[page.id];

  /* A translated string, when the language has one; the English otherwise. */
  const say = (t) => (dict && dict[t]) || t;
  const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

  if (page.id.startsWith('product:')) {
    const p = (M.S.merchProducts || []).find((x) => x.id === page.arg);
    if (!p) return null;
    const name = say(p.name);
    /* A long product name plus the template can run past the 65 characters
       Google will show. Rather than truncate mid-word — which reads as a bug —
       drop the phrase and keep the name, which is the part that matters. */
    let title = fill(T.product.title, { name });
    if (title.length > 65) title = `${name} | PAMUUC`;
    if (title.length > 65) title = `${name.slice(0, 54).replace(/\s+\S*$/, '')} | PAMUUC`;
    return {
      title,
      /* the product's own description, translated if the catalogue copy is */
      description: sentences(say(p.desc), 50, 170)
        || fill(T.product.title, { name }).slice(0, 170),
    };
  }

  if (page.id.startsWith('collection:') || page.id.startsWith('build:')) {
    const slug = page.id.split(':')[1];
    const cat = M.categories().find((c) => c.slug === slug);
    const rawName = cat ? cat.name : slug;
    const name = say(rawName).toLowerCase();
    const n = (M.S.merchProducts || []).filter((p) => cat && p.cat === cat.cat).length;
    const kind = page.id.startsWith('build:') ? T.build : T.collection;
    return {
      title: fill(kind.title, { name }).slice(0, 65),
      description: fill(kind.description, { name, n, products: n === 1 ? W.product : W.products }).slice(0, 170),
    };
  }
  return null;
}


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
    /* The whole document, not just `copy`. translate() also reads `patterns`
       and `colourPreposition` off it, and handing it the copy object alone
       left both undefined — so the number rules and the colour composition
       silently did nothing while looking like they worked. */
    out[loc] = JSON.parse(readFileSync(f, 'utf8'));
  }
  return out;
}

export function buildMerch({ ROOT, site, LOCALES, intakeEndpoint }) {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'src/images/catalogue/manifest.json'), 'utf8'));
  const covers = existsSync(join(ROOT, 'content/merch.covers.json'))
    ? JSON.parse(readFileSync(join(ROOT, 'content/merch.covers.json'), 'utf8')).covers
    : {};
  const M = loadMockup(join(ROOT, 'mockup'), manifest, covers);
  const hasDisplay = displayClasses(readFileSync(join(ROOT, 'mockup/app.css'), 'utf8'));
  const cats = catLookup(M);
  const problems = [];
  const dicts = dictionaries(ROOT, LOCALES);
  /* One meta file per language, falling back to English per field rather than
     per file, so a half-translated language still gets what it has. */
  const metaEn = JSON.parse(readFileSync(join(ROOT, 'content/merch.meta.en.json'), 'utf8'));
  const metas = {};
  for (const loc of LOCALES) {
    const f = join(ROOT, `content/merch.meta.${loc}.json`);
    if (loc === 'en' || !existsSync(f)) { metas[loc] = metaEn; continue; }
    const m = JSON.parse(readFileSync(f, 'utf8'));
    metas[loc] = {
      pages: { ...metaEn.pages, ...(m.pages || {}) },
      templates: { ...metaEn.templates, ...(m.templates || {}) },
      words: { ...metaEn.words, ...(m.words || {}) },
    };
  }
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

      const meta = metaFor(p, M, metas[loc], (dicts[loc] || {}).copy);
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
      const m = metaFor(p, M, metas[loc], (dicts[loc] || {}).copy);
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
