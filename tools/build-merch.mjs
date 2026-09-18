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
import { pageList, catLookup, urlFor, productSlug } from './merch-routes.mjs';
import { linkify, dimension, displayClasses, wireForms, langSwitch } from './merch-static.mjs';
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


/* ---- structured data ------------------------------------------------------
   The custom uniforms page has carried Organization and FAQPage from the
   start; the 31 product pages had nothing at all, which for a catalogue is
   the markup that matters most.

   What is claimed here is only what the page itself shows. lowPrice is the
   same "from" figure printed on the page, so the two cannot disagree — a
   price in the markup that does not match the page is worse than no price.
   A product priced on request gets no offer node rather than a made-up one,
   and the minimum order quantity is stated because it is a real condition of
   that price.
   ========================================================================= */
function productLD(p, url, meta, site, imageUrl, say, printedFrom) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': site.origin + url + '#product',
    name: say(p.name),
    description: meta.description,
    sku: p.ref,
    category: say(p.cat),
    brand: { '@type': 'Brand', name: site.brand.plain },
    url: site.origin + url,
  };
  if (imageUrl) node.image = site.origin + imageUrl;

  /* Only when the page prints a price. quoteOnly products say "price on
     request", and inventing a number for them would be a lie in markup. */
  /* p.from is the price at ONE piece, which is the dearest the product ever
     is — the page's headline "From" figure is the cheapest quantity break. So
     the range comes from the breaks themselves: low is what the page shows,
     high is the single-piece price. Publishing p.from as lowPrice would have
     claimed 14.99 on a page printing 7.99, which is the kind of mismatch
     Google penalises and a reader would notice first. */
  /* The ladder in p.breaks is the product's own, but a family can contain a
     garment that is cheaper than any rung on it — tank tops bottom out at 9.99
     in the data while the page prints "From 9.49". So lowPrice is taken from
     the figure the page actually shows, and the data only sets the ceiling.
     Deriving it from the rendered page is the one way the two cannot drift. */
  const prices = (p.breaks || []).map((b) => Number(b.price)).filter((n) => n > 0);
  if (!p.quoteOnly && prices.length) {
    const fromData = Math.min(...prices);
    const low = printedFrom && printedFrom < fromData ? printedFrom : fromData;
    const high = Math.max(...prices, low);
    node.offers = {
      '@type': 'AggregateOffer',
      priceCurrency: 'EUR',
      lowPrice: low.toFixed(2),
      highPrice: high.toFixed(2),
      offerCount: prices.length,
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: site.brand.plain },
      /* per piece, garment only, before personalisation and before VAT —
         which is what the page says beside the same number */
      eligibleQuantity: { '@type': 'QuantitativeValue', minValue: p.moq || 1, unitCode: 'C62' },
    };
  }
  return node;
}

function breadcrumbLD(trail, site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, item: site.origin + t.url,
    })),
  };
}

function collectionLD(name, url, products, site, urlOf) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    url: site.origin + url,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem', position: i + 1, url: site.origin + urlOf(p),
      })),
    },
  };
}

/** Which nodes a given page carries. */
function structuredData(page, M, meta, site, loc, imageUrl, say, printedFrom) {
  const out = [];
  const home = { name: 'PAMUUC', url: site.locales[loc].prefix };
  const merch = { name: say('Merchandise'), url: urlFor('public:merch', loc, site) };

  if (page.id.startsWith('product:')) {
    const p = (M.S.merchProducts || []).find((x) => x.id === page.arg);
    if (!p) return out;
    const cat = M.categories().find((c) => c.cat === p.cat);
    out.push(productLD(p, page.url, meta, site, imageUrl, say, printedFrom));
    out.push(breadcrumbLD([
      home, merch,
      ...(cat ? [{ name: say(cat.name), url: urlFor('public:collection:' + cat.slug, loc, site, catLookup(M)) }] : []),
      { name: say(p.name), url: page.url },
    ], site));
    return out;
  }

  if (page.id.startsWith('collection:')) {
    const cat = M.categories().find((c) => c.slug === page.id.split(':')[1]);
    if (!cat) return out;
    const items = (M.S.merchProducts || []).filter((x) => x.cat === cat.cat);
    out.push(collectionLD(say(cat.name), page.url, items, site,
      (x) => `${site.locales[loc].prefix}merchandise/products/${productSlug(x.id)}/`));
    out.push(breadcrumbLD([home, merch, { name: say(cat.name), url: page.url }], site));
    return out;
  }

  if (page.id === 'merch') {
    out.push(breadcrumbLD([home, merch], site));
    return out;
  }

  if (page.id === 'products' || page.id === 'collections') {
    const items = M.S.merchProducts || [];
    if (page.id === 'products') {
      out.push(collectionLD(meta.title.split(' | ')[0], page.url, items, site,
        (x) => `${site.locales[loc].prefix}merchandise/products/${productSlug(x.id)}/`));
    }
    out.push(breadcrumbLD([home, merch, { name: meta.title.split(' | ')[0], url: page.url }], site));
  }
  return out;
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
  /* page id -> {en: url, es: url, …}. One walk of the same page list the
     router and the builder use, so the switcher can never offer a URL the
     site does not publish. */
  const urlsById = {};
  for (const l of LOCALES) {
    for (const q of pageList(M, site, l)) (urlsById[q.id] || (urlsById[q.id] = {}))[l] = q.url;
  }

  const renderPages = (head, consentBar) => {
  const pages = [];
  for (const loc of LOCALES) {
    for (const p of pageList(M, site, loc)) {
      let body;
      /* Declared, not inferred from render order — see setUI in merch-render. */
      if (p.branch) { try { M.setUI({ lastBranch: p.branch }); } catch (e) {} }
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
      /* The switcher points at this same page in the other languages, taken
         from the page list rather than assembled from the path — a product
         whose slug differs, or a page one language does not have, is then
         simply absent from the menu instead of a 404 in it. */
      const d = langSwitch(c.html, {
        urls: urlsById[p.id] || {}, loc,
        labels: Object.fromEntries(LOCALES.map((l) => [l, site.locales[l].label])),
        title: (site.strings[loc] || {}).language || 'Language',
      });
      if (!d.stats.replaced) problems.push(`${p.id} (${loc}): the language switcher was not placed`);
      let html = d.html;

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

      /* The picture the page actually leads with, so the markup points at the
         same image a reader sees rather than a different one. */
      const firstImg = (a.html.match(/<img\b[^>]*\ssrc="([^"]+)"/) || [])[1] || null;
      /* the "From" figure the page prints, so the markup can quote the same one */
      const printedFrom = (() => {
        const m = /class="pdp-from"[\s\S]{0,200}?<b[^>]*>\s*€\s*([\d.,]+)/.exec(a.html);
        return m ? Number(String(m[1]).replace(',', '.')) : null;
      })();
      const extraLD = structuredData(p, M, meta, site, loc, firstImg, (t) => {
        const d = (dicts[loc] || {}).copy;
        return (d && d[t]) || t;
      }, printedFrom);

      pages.push({
        url: p.url, loc, cluster: clusters.find((c2) => c2.id === 'merch:' + p.id),
        html: head({
          loc, url: p.url, title: meta.title, description: meta.description,
          cluster: clusters.find((c2) => c2.id === 'merch:' + p.id), extraLD,
        }) + `<div id="root">` + html + `</div>`
          /* Outside #root on purpose: the app replaces everything inside it on
             every render, and a consent choice must not be undone by redrawing
             the page. */
          + (consentBar ? '\n' + consentBar(loc) : '')
          + '\n</body>\n</html>\n',
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
