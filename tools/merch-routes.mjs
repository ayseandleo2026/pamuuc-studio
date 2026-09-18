/* ============================================================================
   Where every page lives
   ---------------------------------------------------------------------------
   The mockup navigates by `data-go="public:product:m_t_shirts"` and a click
   handler. A website navigates by URL. This is the one place that says which
   is which, so the builder, the audit and the runtime router cannot disagree.

   Three rules shaped it:

   1. URLs that already rank do not move. The journal and the legal pages keep
      the addresses they have had; the mockup's own copies of them are mapped
      onto those rather than published alongside, because two pages competing
      for one query is worse than either alone.

   2. The root becomes the chooser, and custom uniforms moves to its own
      address with a 301. That was decided knowing it costs the ranking the
      root currently holds.

   3. Path segments stay English in every language, while the content is
      translated. Localised slugs are better SEO and can be added later behind
      redirects without breaking anything; doing it now would mean inventing
      and maintaining ~275 translated path segments before the site has ever
      been seen. The blog already has localised slugs and keeps them.
   ========================================================================= */

/* Surfaces the mockup links to that this site does not have. The customer
   account is 104 links in the mockup's header alone; the back office is
   three. Both are prototype surfaces, deliberately not being built, so their
   controls come out rather than becoming dead links. */
export const DROPPED = new Set(['login', 'studiohelp']);

/* id -> slug: m_t_shirts -> t-shirts, m_padded_jackets_parkas -> padded-jackets-parkas */
export const productSlug = (id) => String(id).replace(/^m_/, '').replace(/_/g, '-');

const prefix = (site, loc) => site.locales[loc].prefix;      /* '/' or '/es/' */

/**
 * The URL for a mockup navigation target, in one language.
 * @param {string} target  e.g. "public:product:m_t_shirts"
 * @returns {string|null}  a path, or null if this target has no page here
 */
export function urlFor(target, loc, site, cats) {
  const [, page, ...rest] = String(target).split(':');
  const param = rest.join(':');
  const p = prefix(site, loc);
  const merch = `${p}merchandise/`;

  switch (page) {
    case 'home':          return p;
    case 'custom':        return `${p}custom-uniforms/`;
    /* the enquiry form is a section of the custom uniforms page, not a page */
    case 'form':          return `${p}custom-uniforms/#brief`;

    case 'merch':         return merch;
    case 'products':      return `${merch}products/`;
    /* A product link can carry the garment it was opened on:
       "public:product:m_joggers:PM-JOG-008". That is a preselection, not a
       different page — the page, its canonical and its content are the same —
       so it rides in the query, where a static host ignores it and the runtime
       shim can still read it. Putting it in the path would publish 174 near
       duplicates of 31 pages. */
    case 'product': {
      if (!param) return null;
      const [id, sku] = param.split(':');
      return `${merch}products/${productSlug(id)}/` + (sku ? `?g=${encodeURIComponent(sku)}` : '');
    }
    case 'collections':   return `${merch}collections/`;
    case 'collection': {
      if (!param) return null;
      /* the mockup names a family three different ways; one of them is the URL */
      const slug = (cats && cats.get(param)) || param;
      return `${merch}collections/${slug}/`;
    }
    case 'method':        return `${merch}how-it-works/`;
    case 'howto':         return `${merch}how-to-order/`;
    case 'merchhelp':     return `${merch}help/`;
    case 'quote':         return `${merch}quote/`;
    case 'search':        return `${merch}search/`;
    /* the guided flow is keyed by the family's NAME ("Outerwear"), and the
       mockup's own slug for that family is not a slugified name ("jackets"),
       so it is looked up rather than derived */
    case 'build': {
      const slug = param && cats ? cats.get(param) : null;
      return slug ? `${merch}build/${slug}/` : null;
    }

    case 'about':         return `${p}about/`;
    case 'contact':       return `${p}contact/`;

    /* already live, already ranking — the mockup's copies map onto these */
    /* The MERCHANDISE journal. The mockup has always had two — pubBlog() reads
       the branch and postsFor() splits on cat === 'Merchandise' — but only the
       custom uniforms one was ever built, mapped onto the blog that already
       ranked. Both are published now, so this one gets its own address inside
       the merchandise family, where the rest of its pages live. The uniforms
       journal keeps /blog/ and every ranking it has. */
    case 'blog':          return `${p}merchandise/journal/`;
    case 'post':          return postURL(param, loc, site);
    case 'privacy':       return `${site.legalPrefix[loc]}#privacy`;
    case 'cookies':       return `${site.legalPrefix[loc]}#cookies`;
    case 'terms':         return `${site.legalPrefix[loc]}#terms`;
    case 'accessibility': return `${site.legalPrefix[loc]}#accessibility`;

    default:              return null;
  }
}

/* The mockup keys a journal entry by the English slug the live site already
   uses; site.postSlugs keys by a short name. Match on the English slug so the
   two stay in step without a second mapping to maintain. */
function postURL(id, loc, site) {
  /* A merchandise note lives under the merchandise journal, not under the
     uniforms blog. Checked first, because the two sets are keyed differently:
     these by the mockup's own id, the uniforms ones by the English slug the
     live site already uses. */
  const merch = (site.merchPostSlugs || {})[id];
  if (merch) return `${prefix(site, loc)}merchandise/journal/${merch[loc] || merch.en}/`;

  const key = Object.keys(site.postSlugs).find((k) => site.postSlugs[k].en === id) || id;
  const slugs = site.postSlugs[key];
  if (!slugs) return null;
  return site.locales[loc].blog + slugs[loc] + '/';
}

/**
 * Every page this builder emits, per language.
 * @param {object} M     a loaded mockup (tools/merch-render.mjs)
 * @param {object} site  content/site.json
 */
/** name -> slug for the product families, for urlFor's `cats` argument. */
/* Everything that can name a family — its name, its merchSlug, its catSlug —
   mapped to the one slug the URLs use. */
export const catLookup = (M) => {
  const m = new Map();
  for (const c of M.categories()) {
    m.set(c.cat, c.slug);
    m.set(c.slug, c.slug);
    if (c.altSlug) m.set(c.altSlug, c.slug);
  }
  return m;
};

export function pageList(M, site, loc) {
  const P = M.S.merchProducts || [];
  const cats = M.categories();
  const out = [
    { id: 'chooser',     url: urlFor('public:home', loc, site),        render: 'pubHome',        priority: '1.0' },
    { id: 'merch',       url: urlFor('public:merch', loc, site),       render: 'pubMerch',       priority: '0.9' },
    { id: 'products',    url: urlFor('public:products', loc, site),    render: 'pubProducts',    priority: '0.9' },
    { id: 'collections', url: urlFor('public:collections', loc, site), render: 'pubCollections', priority: '0.8' },
    { id: 'method',      url: urlFor('public:method', loc, site),      render: 'pubMethod',      priority: '0.7' },
    { id: 'howto',       url: urlFor('public:howto', loc, site),       render: 'pubHowTo',       priority: '0.7' },
    { id: 'merchhelp',   url: urlFor('public:merchhelp', loc, site),   render: 'pubMerchHelp',   priority: '0.6' },
    { id: 'quote',       url: urlFor('public:quote', loc, site),       render: 'pubQuote',       priority: '0.6' },
    { id: 'about',       url: urlFor('public:about', loc, site),       render: 'pubAbout',       priority: '0.6' },
    { id: 'contact',     url: urlFor('public:contact', loc, site),     render: 'pubContact',     priority: '0.6' },
    /* search has nothing to index — it is a form over the catalogue */
    { id: 'search',      url: urlFor('public:search', loc, site),      render: 'pubSearch',      noindex: true },
    /* The merchandise journal and its notes. branch is declared rather than
       inferred: pubBlog() and pubPost() both read UI.lastBranch to decide which
       journal they are, and a builder has no navigation history to have set it. */
    { id: 'merchblog',   url: urlFor('public:blog', loc, site),        render: 'pubBlog',
      branch: 'merch', priority: '0.6' },
  ];
  for (const id of Object.keys(site.merchPostSlugs || {})) {
    out.push({
      id: 'merchpost:' + id, url: urlFor('public:post:' + id, loc, site),
      render: 'pubPost', arg: id, branch: 'merch', priority: '0.6',
    });
  }
  for (const p of P) {
    out.push({
      id: 'product:' + p.id, url: urlFor('public:product:' + p.id, loc, site),
      render: 'pubProduct', arg: p.id, priority: '0.8',
    });
  }
  for (const c of cats) {
    out.push({
      id: 'collection:' + c.slug, url: urlFor('public:collection:' + c.slug, loc, site),
      render: 'pubCollection', arg: c.slug, priority: '0.7',
    });
    out.push({
      id: 'build:' + c.slug, url: `${prefix(site, loc)}merchandise/build/${c.slug}/`,
      render: 'pubBuild', arg: c.cat, priority: '0.5',
    });
  }
  return out;
}
