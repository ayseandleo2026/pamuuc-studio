#!/usr/bin/env node
/**
 * PAMUUC | STUDIO — static site generator
 * ---------------------------------------------------------------------------
 *   node tools/build.mjs           build the site into dist/
 *   node tools/build.mjs --check   audit only, no output written (used in CI)
 *
 * Everything the site publishes comes from content/ and src/. One config file
 * (content/site.json) owns the URL map, so hreflang clusters, canonicals, the
 * sitemap and the feeds are generated together and cannot drift apart.
 *
 * No dependencies. Node 20+.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, sep, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const CHECK = process.argv.includes('--check');

const site = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
const LOCALES = Object.keys(site.locales);
const DEFAULT = site.defaultLocale;
const errors = [];
const warnings = [];

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const abs = (u) => site.origin + u;

/* The merchandise side is drawn by the approved mockup's own renderers — see
   tools/merch-render.mjs for why, and tools/merch-routes.mjs for where each
   page lives. */
const { buildMerch } = await import('./build-merch.mjs');
const { merchJS, MERCH_CSS } = await import('./merch-bundle.mjs');

/* ── tiny helpers ────────────────────────────────────────────────────────── */
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (s = '') => esc(s);
const clean = (s = '') => String(s).replace(/\s+/g, ' ').trim();
const slugify = (s) => clean(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const DATE_FMT = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR', it: 'it-IT', de: 'de-DE' };
const humanDate = (iso, loc) =>
  new Date(iso + 'T09:00:00Z').toLocaleDateString(DATE_FMT[loc], { day: 'numeric', month: 'long', year: 'numeric' });

/* ── URL map ─────────────────────────────────────────────────────────────── */
/* The root is the two-door chooser now, so the custom uniforms page — which
   used to BE the root — has its own address. This was decided knowing it costs
   the ranking the root currently holds: a chooser has almost nothing to rank
   on, and there is no 301 to be had, because `/` still has to serve something.
   The transfer rides on internal linking instead. */
const homeURL = (loc) => site.locales[loc].prefix + 'custom-uniforms/';
const chooserURL = (loc) => site.locales[loc].prefix;
const blogURL = (loc) => site.locales[loc].blog;
const postURL = (key, loc) => blogURL(loc) + site.postSlugs[key][loc] + '/';
const legalURL = (loc) => site.legalPrefix[loc];

/* Built before the cluster list, because the merchandise pages bring their own
   clusters — one per page id, holding that page's URL in all five languages. */
const MERCH = buildMerch({ ROOT, site, LOCALES, intakeEndpoint: site.intake.endpoint });

const clusters = [
  { id: 'home', type: 'page', priority: '1.0', urls: Object.fromEntries(LOCALES.map((l) => [l, homeURL(l)])) },
  { id: 'blog', type: 'page', priority: '0.8', urls: Object.fromEntries(LOCALES.map((l) => [l, blogURL(l)])) },
  ...site.postOrder.map((key) => ({
    id: 'post:' + key, type: 'post', key, priority: '0.7',
    urls: Object.fromEntries(LOCALES.map((l) => [l, postURL(key, l)])),
  })),
  { id: 'legal', type: 'page', noindex: true, urls: Object.fromEntries(LOCALES.map((l) => [l, legalURL(l)])) },
  ...MERCH.clusters,
];

/* ── content ─────────────────────────────────────────────────────────────── */
const HOME = Object.fromEntries(LOCALES.map((l) => [l, json(`content/home.${l}.json`)]));
const UI = Object.fromEntries(LOCALES.map((l) => [l, json(`content/ui.${l}.json`)]));
const LEGAL = Object.fromEntries(LOCALES.map((l) => [l, json(`content/legal.${l}.json`)]));
const S = (loc) => site.strings[loc];

/* Mobile section accordion.
   On mobile each section becomes a bordered tab: the kicker and the <h2>
   are the tab face, everything else — lead included — folds inside. On
   desktop the tab is inert and the grid restores the two-column head the
   rest of the site uses, so nothing about the wide layout changes.

   A checkbox, not <details>: a closed <details> does not lay out its
   non-summary children, so forcing one open on desktop paints the body
   without giving it height and it overlaps the next section. The checkbox
   collapses in pure CSS, so the state is right at first paint with no
   layout shift and the control works with JavaScript off. Every heading
   stays a real <h2> in the HTML at both widths. */
const accordion = (loc, id, open, kicker, title, lead, body) => `<div class="sec-acc">
<input class="sec-acc__cb" type="checkbox" id="acc-${id}"${open ? ' checked' : ''}>
<label class="sec-acc__tab" for="acc-${id}">
<span class="eyebrow sec-acc__kicker">${esc(kicker)}</span>
<h2 class="h2 sec-acc__title">${esc(title)}</h2>
<span class="sec-acc__chev" aria-hidden="true"></span>
</label>
${lead ? `<p class="lead sec-acc__lead">${esc(lead)}</p>` : ''}
<div class="sec-acc__body">
${body}
</div>
</div>`;

const FAQ_VISIBLE = 5;
/* the question carries its own +/- marker, so the native one is suppressed
   in the stylesheet and the classes have to match the sheet that does it */
const faqItem = (items, first) => items
  .map((q, i) => `<details class="faq-i"${first && i === 0 ? ' open' : ''}><summary class="faq-q">${esc(q.q)}</summary><div class="faq-a"><p class="t-sm">${esc(q.a)}</p></div></details>`)
  .join('\n');


/** Posts: `{ json front matter }\n---\n<markdown body>` */
function loadPost(key, loc) {
  const raw = read(`content/posts/${key}.${loc}.md`);
  const cut = raw.indexOf('\n---\n');
  if (cut === -1) { errors.push(`content/posts/${key}.${loc}.md: missing "---" separator`); return null; }
  let fm;
  try { fm = JSON.parse(raw.slice(0, cut)); }
  catch (e) { errors.push(`content/posts/${key}.${loc}.md: front matter is not valid JSON (${e.message})`); return null; }
  const body = raw.slice(cut + 5).trim();
  const where = `content/posts/${key}.${loc}.md`;
  const bad = (m) => errors.push(`${where}: ${m}`);

  for (const field of ['title', 'headline', 'description', 'published', 'modified', 'author', 'cover', 'coverAlt', 'kicker', 'slug']) {
    if (!fm[field]) bad(`front matter field "${field}" is required`);
  }
  if (fm.slug !== site.postSlugs[key]?.[loc]) bad(`slug "${fm.slug}" is not content/site.json postSlugs.${key}.${loc}`);
  if (fm.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.slug)) bad('slug must be lowercase a-z, 0-9 and single hyphens');
  if (fm.slug && fm.slug.length > 60) bad(`slug is ${fm.slug.length} characters (max 60)`);
  if (fm.title && fm.title.length > 45) bad(`title is ${fm.title.length} characters (max 45 — the brand is appended)`);
  if (fm.headline && fm.headline.length > 95) bad(`headline is ${fm.headline.length} characters (max 95)`);
  if (fm.description && (fm.description.length < 70 || fm.description.length > 170)) bad(`description is ${fm.description.length} characters (70-170)`);
  if (fm.kicker && fm.kicker.length > 34) bad(`kicker is ${fm.kicker.length} characters (max 34)`);
  if (fm.coverAlt && fm.coverAlt.length < 15) bad('coverAlt must describe the image (15 characters or more)');
  for (const d of ['published', 'modified']) {
    if (fm[d] && !/^\d{4}-\d{2}-\d{2}$/.test(fm[d])) bad(`${d} must be YYYY-MM-DD`);
  }
  if (fm.published && fm.modified && fm.modified < fm.published) bad('modified is earlier than published');
  for (const ext of ['webp', 'jpg']) {
    if (fm.cover && !existsSync(join(ROOT, `src/images/blog/${fm.cover}.${ext}`))) bad(`src/images/blog/${fm.cover}.${ext} is missing`);
  }
  if (fm.takeaways) {
    if (!Array.isArray(fm.takeaways) || fm.takeaways.length < 3 || fm.takeaways.length > 5) bad('takeaways must be an array of 3 to 5 strings');
    else fm.takeaways.forEach((t) => { if (String(t).length > 160) bad(`a takeaway is ${String(t).length} characters (max 160)`); });
  }
  for (const arr of ['keywords', 'about']) {
    if (fm[arr] && !Array.isArray(fm[arr])) bad(`${arr} must be an array of strings`);
  }

  const blocks = markdown(body, where);
  const words = body.replace(/[#*\-[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
  if (words < 400) bad(`body is ${words} words (minimum 400)`);
  if (blocks.filter((b) => b.t === 'h2').length < 3) bad('body needs at least three "## " sections');
  const ids = blocks.filter((b) => b.id).map((b) => b.id);
  if (new Set(ids).size !== ids.length) bad('two headings produce the same anchor — rewrite one');

  return { ...fm, key, locale: loc, body, blocks };
}
const POSTS = {};
for (const key of site.postOrder) for (const loc of LOCALES) {
  const p = loadPost(key, loc);
  if (p) (POSTS[key] ||= {})[loc] = p;
}

/* ── markdown subset ─────────────────────────────────────────────────────
   Supported, and nothing else: "## h2", "### h3", paragraphs, "- " lists,
   **bold**, *italic*, [text](href). Anything else is reported, not guessed. */
function inline(text, where) {
  let out = esc(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, href) => `<a href="${attr(href)}">${t}</a>`);
  if (/[<>]\s*(script|iframe)/i.test(text)) errors.push(`${where}: raw HTML is not allowed in post bodies`);
  return out;
}
function markdown(src, where) {
  const blocks = [];
  for (const chunk of src.split(/\n{2,}/)) {
    const t = chunk.trim();
    if (!t) continue;
    if (t.startsWith('### ')) blocks.push({ t: 'h3', v: t.slice(4).trim() });
    else if (t.startsWith('## ')) blocks.push({ t: 'h2', v: t.slice(3).trim() });
    else if (t.startsWith('# ')) errors.push(`${where}: "# " is not allowed — the h1 comes from "headline"`);
    else if (/^-\s/m.test(t) && t.split('\n').every((l) => /^-\s/.test(l.trim())))
      blocks.push({ t: 'ul', v: t.split('\n').map((l) => l.trim().replace(/^-\s+/, '')) });
    else if (/^[|>#`]/.test(t)) errors.push(`${where}: unsupported markdown block starting "${t.slice(0, 24)}…"`);
    else blocks.push({ t: 'p', v: t.replace(/\n/g, ' ') });
  }
  return blocks.map((b) => (b.t === 'ul'
    ? { ...b, v: b.v.map((x) => inline(x, where)) }
    : { ...b, v: inline(b.v, where), id: b.t !== 'p' ? slugify(b.v) : undefined }));
}
const wordCount = (post) => post.body.replace(/[#*\-[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
const readTime = (post, loc) => `${Math.max(2, Math.round(wordCount(post) / 200))} ${S(loc).minRead}`;

/* ── layout ──────────────────────────────────────────────────────────────── */
const CRITICAL = read('src/css/critical.css').replace(/\/\*[\s\S]*?\*\//g, '').trim();

function head({ loc, url, title, description, ogTitle, ogDescription, cluster, image, type = 'website', extraLD = [], preloadImage, article, merch }) {
  /* The merchandise pages carry the mockup's stylesheet, which is the design
     that was signed off; the custom uniforms side keeps its own. They are
     separate files rather than one merged sheet because the two sides share
     no classes and merging them would double what either has to download. */
  const stylesheet = merch ? '/assets/css/merch.css' : '/assets/css/site.css';
  const script = merch ? '/assets/js/merch.js' : '/assets/js/site.js';
  const alternates = cluster
    ? LOCALES.filter((l) => cluster.urls[l]).map((l) => `<link rel="alternate" hreflang="${l}" href="${abs(cluster.urls[l])}">`).join('\n')
      + `\n<link rel="alternate" hreflang="x-default" href="${abs(cluster.urls[DEFAULT])}">`
    : '';
  const robots = cluster?.noindex
    ? '<meta name="robots" content="noindex,follow">'
    : '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">';
  const og = image || '/assets/images/social-home-preview.jpg';
  return `<!doctype html>
<html lang="${loc}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<link rel="canonical" href="${abs(url)}">
${robots}
${alternates}
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${attr(site.brand.plain)}">
<meta property="og:locale" content="${site.locales[loc].ogLocale}">
${LOCALES.filter((l) => l !== loc).map((l) => `<meta property="og:locale:alternate" content="${site.locales[l].ogLocale}">`).join('\n')}
<meta property="og:url" content="${abs(url)}">
<meta property="og:title" content="${attr(ogTitle || title)}">
<meta property="og:description" content="${attr(ogDescription || description)}">
<meta property="og:image" content="${abs(og)}">
<meta name="twitter:card" content="summary_large_image">
${article ? `<meta property="article:published_time" content="${article.published}T09:00:00+01:00">
<meta property="article:modified_time" content="${article.modified}T09:00:00+01:00">
<meta property="article:author" content="${attr(article.author)}">` : ''}
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; frame-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' https://www.googletagmanager.com; connect-src 'self' ${site.intake.endpoint} https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com; form-action 'self' ${site.intake.endpoint}; upgrade-insecure-requests">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="theme-color" content="#FBF8F3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0C1413" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/images/favicon-icon.png">
<link rel="alternate" type="application/rss+xml" title="${attr(site.brand.plain)}" href="${loc === DEFAULT ? '/feed.xml' : `/${loc}/feed.xml`}">
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/gilmer-regular.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/gilmer-light.woff2" crossorigin>
${preloadImage || ''}
<style>${CRITICAL}</style>
${merch
  /* The preload-and-promote trick below is driven by site.js, and the
     merchandise pages do not load site.js — they load the app. Without the
     promotion the stylesheet never applies and the page renders unstyled, so
     this side asks for it plainly. */
  ? `<link rel="stylesheet" href="${stylesheet}">`
  : `<link rel="preload" as="style" href="${stylesheet}" data-css>
<noscript><link rel="stylesheet" href="${stylesheet}"></noscript>`}
<script defer src="${script}"></script>
${extraLD.map((o) => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`).join('\n')}
</head>
<body data-ga="${attr(site.analytics.ga4)}">
<a class="skip" href="#main">${esc(S(loc).skip)}</a>`;
}

const orgNode = {
  '@type': 'Organization',
  '@id': abs('/#org'),
  name: site.brand.plain,
  /* The studio publishes two public forms: PAMUUC | STUDIO on the site and
     PAMUUC STUDIO on LinkedIn. Both are declared so the entity resolves
     either way while the studio decides which is canonical. */
  alternateName: site.brand.alternateNames || site.brand.name,
  legalName: site.brand.legalName,
  url: abs('/'),
  logo: abs('/assets/images/logo.png'),
  email: site.brand.email,
  vatID: site.brand.vatID,
  address: { '@type': 'PostalAddress', addressLocality: site.brand.city, addressCountry: site.brand.country },
  areaServed: ['ES', 'FR', 'IT', 'DE', 'Europe'],
  knowsLanguage: LOCALES,
  /* sameAs must point only at profiles the studio has confirmed as its own.
     Verified 4 September 2026: returns 200 and titles itself "PAMUUC STUDIO". */
  ...(site.brand.sameAs?.length ? { sameAs: site.brand.sameAs } : {}),
  /* Google lists contactPoint as recommended for Organization. Every value
     here is already stated on the contact section of the site; nothing is
     asserted that a reader cannot verify. sameAs stays out until the studio
     confirms its official profile URLs — an unverified profile link is worse
     than none. */
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'sales',
    email: site.brand.email,
    areaServed: ['ES', 'FR', 'IT', 'DE', 'Europe'],
    availableLanguage: LOCALES,
  },
};
const personNode = {
  '@type': 'Person',
  '@id': abs('/#leonardo'),
  name: 'Leonardo Gobbato',
  jobTitle: 'Founder and design director',
  worksFor: { '@id': abs('/#org') },
};

function header(loc, current) {
  const ui = UI[loc], str = S(loc);
  /* The site's own localized navigation, from content/home.<loc>.json.
     The last entry is the call to action, not a nav item. */
  const navSource = HOME[loc].nav;
  const nav = navSource.slice(0, -1).map((n) => ({ label: n.label, href: n.href }));
  const cta = navSource[navSource.length - 1];
  const langLinks = LOCALES.map((l) => {
    const target = current?.urls?.[l] || homeURL(l);
    return `<a href="${target}" hreflang="${l}"${l === loc ? ' aria-current="true"' : ''}>${esc(site.locales[l].label)} <span class="muted">${l.toUpperCase()}</span></a>`;
  }).join('\n');
  return `<header class="hdr">
<div class="wrap hdr__in">
<a class="brand" href="${homeURL(loc)}" aria-label="${attr(site.brand.plain)}">
<span class="brand__mark" aria-hidden="true"></span>
<span class="brand__word">PAMUUC <i>|</i> STUDIO</span>
</a>
<nav class="nav" id="nav" aria-label="${attr(str.menu)}" hidden>
<ul>${nav.map((n) => `<li><a href="${attr(n.href)}">${esc(n.label)}</a></li>`).join('')}
<li class="nav__cta"><a href="${attr(cta.href)}">${esc(cta.label)}</a></li></ul>
</nav>
<div class="hdr__end">
<div class="lang">
<button class="lang__btn" data-lang-btn aria-expanded="false" aria-controls="lang-menu" aria-haspopup="true" aria-label="${attr(str.language)}">${loc.toUpperCase()} <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M1 1l3.5 3.5L8 1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
<div class="lang__menu" id="lang-menu" hidden>${langLinks}</div>
</div>
<a class="btn btn--primary btn--sm hdr__cta" href="${attr(cta.href)}">${esc(cta.label)}</a>
<button class="burger" data-burger aria-expanded="false" aria-controls="nav" aria-label="${attr(str.menu)}"><i></i><i></i><i></i></button>
</div>
</div>
</header>`;
}

function footer(loc) {
  const h = HOME[loc], str = S(loc);
  const cols = [
    { title: h.footer.cols[0]?.title || 'Studio', links: [
      ...h.nav.slice(0, -2).map((n) => ({ label: n.label, href: n.href })),
      { label: str.sitemap || 'Sitemap', href: '/sitemap.xml' },
      { label: 'PAMUUC.COM', href: site.brand.external },
    ]},
    { title: str.journal, links: [
      { label: str.allArticles, href: blogURL(loc) },
      ...site.postOrder.slice(0, 2).map((k) => ({ label: POSTS[k][loc].title, href: postURL(k, loc) })),
      { label: 'RSS', href: loc === DEFAULT ? '/feed.xml' : `/${loc}/feed.xml` },
    ]},
    { title: str.legal, links: LEGAL[loc].sections.map((s) => ({ label: s.title, href: legalURL(loc) + '#' + s.id })) },
  ];
  return `<footer class="ftr">
<div class="wrap">
<div class="ftr__grid">
<div>
<a class="brand" href="${homeURL(loc)}"><span class="brand__mark" aria-hidden="true"></span><span class="brand__word">PAMUUC <i>|</i> STUDIO</span></a>
<p class="ftr__about">${esc(h.footer.about)}</p>
</div>
${cols.map((c) => `<div><h2>${esc(c.title)}</h2><ul>${c.links.map((l) => `<li><a href="${attr(l.href)}"${l.href.startsWith('http') ? ' rel="noopener"' : ''}>${esc(l.label)}</a></li>`).join('')}</ul></div>`).join('\n')}
</div>
<div class="ftr__legal">
<p>${esc(h.footer.legal)}</p>
<p>${LOCALES.map((l) => `<a href="${homeURL(l)}" hreflang="${l}">${l.toUpperCase()}</a>`).join(' · ')}</p>
</div>
</div>
</footer>
<div class="consent-bar" data-consent hidden role="region" aria-label="${attr(S(loc).cookieText).slice(0, 60)}">
<p class="consent-bar__t">${esc(S(loc).cookieText)}</p>
<p class="consent-bar__l"><a href="${legalURL(loc)}#cookies">${esc(S(loc).legal)}</a></p>
<div class="consent-bar__a">
<button class="btn btn--primary btn--sm" data-consent-action="granted">${esc(S(loc).cookieAccept)}</button>
<button class="btn btn--ghost btn--sm" data-consent-action="denied">${esc(S(loc).cookieReject)}</button>
</div>
</div>
</body>
</html>`;
}

/* ── detail bodies ───────────────────────────────────────────────────────
   The source content is a flat run of <p> elements: labels, key/value lines
   and prose all look the same. These rules recover the structure from shape
   alone, so they hold in all five languages:
     · a short line with no sentence punctuation, or one followed by a list,
       is a label
     · "Something: short value" is a key/value row, and consecutive rows are
       grouped into one definition list
     · everything else is prose                                              */
const NORM = (s = '') => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const KV = /^([^:]{2,42}):\s*(.{1,90})$/;
const SENTENCE = /[.!?]/;
const isShort = (v) => v.length <= 56 && !SENTENCE.test(v);
/* Source labels arrive in mixed case: some SHOUTED, some sentence case.
   Normalise the shouted ones so a panel reads as one voice. */
const delabel = (v) => {
  const t = v.replace(/\s*:\s*$/, '').trim();
  if (t.length > 3 && t === t.toUpperCase() && /\p{Lu}{3}/u.test(t)) {
    const lower = t.toLocaleLowerCase();
    return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
  }
  return t;
};

function structure(blocks) {
  const items = blocks.map((b) => {
    if (b.t === 'h') return { k: 'label', v: b.v };
    if (b.t === 'ul') return { k: 'ul', v: b.v };
    const kv = b.v.match(KV);
    if (kv && !SENTENCE.test(kv[2])) return { k: 'kv', v: [kv[1].trim(), kv[2].trim()] };
    return { k: isShort(b.v) ? 'short' : 'p', v: b.v };
  });

  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.k === 'kv') {
      const rows = [];
      while (i < items.length && items[i].k === 'kv') rows.push(items[i++].v);
      i--;
      out.push({ t: 'kv', rows });
    } else if (it.k === 'short') {
      let j = i;
      while (j + 1 < items.length && items[j + 1].k === 'short') j++;
      const run = items.slice(i, j + 1);
      /* A label followed by two or more short lines is a list that lost its
         markup in the source; one or two short lines are headings. */
      if (run.length >= 3) {
        out.push({ t: 'label', v: delabel(run[0].v) });
        out.push({ t: 'ul', v: run.slice(1).map((r) => r.v) });
      } else {
        run.forEach((r) => out.push({ t: 'label', v: delabel(r.v) }));
      }
      i = j;
    } else if (it.k === 'label') {
      out.push({ t: 'label', v: delabel(it.v) });
    } else {
      out.push({ t: it.k, v: it.v });
    }
  }
  return out;
}

function renderBlocks(blocks) {
  return structure(blocks).map((b) => {
    if (b.t === 'label') return `<h4>${esc(b.v)}</h4>`;
    if (b.t === 'kv') {
      const wide = b.rows.some(([, v]) => v.length > 40);
      return `<dl class="kv${wide ? ' kv--wide' : ''}">${b.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
    }
    if (b.t === 'ul') return `<ul${b.v.length >= 4 ? ' class="cols"' : ''}>${b.v.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    return `<p>${esc(b.v)}</p>`;
  }).join('\n');
}

/** Drops a leading heading that only repeats the card it sits under. */
function trimEcho(blocks, heading) {
  if (!blocks?.length || blocks[0].t !== 'h' || !heading) return blocks;
  const a = NORM(blocks[0].v), b = NORM(heading);
  return a && b && (a.includes(b) || b.includes(a)) ? blocks.slice(1) : blocks;
}

const disclosure = (loc, blocks, heading) => {
  const body = trimEcho(blocks, heading);
  return !body?.length ? '' :
    `<details class="more"><summary>${esc(S(loc).detail)}</summary><div class="more__body detail">${renderBlocks(body)}</div></details>`;
};


/* ── cover images ────────────────────────────────────────────────────────
   Intrinsic size is read from the file, so width/height are never a guess.
   If narrower variants exist next to the cover (<name>-520.webp, -1040.webp)
   they are offered through srcset; otherwise a single source is emitted.   */
function webpSize(file) {
  const b = readFileSync(file);
  const tag = b.subarray(12, 16).toString('latin1');
  if (tag === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  if (tag === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (tag === 'VP8L') { const n = b.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
  return { w: 1600, h: 1267 };
}

/* The hero is the one photograph that is art-directed, so it is the one that
   is a JPEG rather than a blog cover's webp. Walking to the frame header is
   the only way to learn the size of a file the generator did not make. */
function jpegSize(file) {
  const b = readFileSync(file);
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    // SOF0-SOF15 carry the frame size; C4, C8 and CC are tables, not frames.
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC)
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    if (len < 2) break;
    i += 2 + len;
  }
  throw new Error(`cannot read the size of ${file}`);
}
const photoSize = (rel) => jpegSize(join(ROOT, 'src/images', rel));

/* The two hero files are different shapes — the mobile one is nearly square,
   the desktop one is landscape. The <source> has to carry its own size or the
   browser reserves the desktop box and the hero jumps 46px when the real
   picture lands, taking the card that sits on its bottom edge with it. */
const HERO_D = photoSize('studio/hero.jpg');
const HERO_M = photoSize('studio/heroMobile.jpg');
const coverCache = new Map();
function cover(name) {
  if (coverCache.has(name)) return coverCache.get(name);
  const base = join(ROOT, 'src/images/blog', name);
  const size = webpSize(base + '.webp');
  const variants = [520, 1040].filter((w) => existsSync(`${base}-${w}.webp`));
  const srcset = variants.length
    ? variants.map((w) => `/assets/images/blog/${name}-${w}.webp ${w}w`).concat(`/assets/images/blog/${name}.webp ${size.w}w`).join(', ')
    : '';
  const out = { ...size, src: `/assets/images/blog/${name}.webp`, srcset };
  coverCache.set(name, out);
  return out;
}
const coverImg = (name, alt, { sizes, lazy = true, priority = false }) => {
  const c = cover(name);
  return `<img src="${c.src}"${c.srcset ? ` srcset="${c.srcset}" sizes="${sizes}"` : ''} width="${c.w}" height="${c.h}"`
    + `${priority ? ' fetchpriority="high"' : ''}${lazy ? ' loading="lazy"' : ''} decoding="async" alt="${attr(alt)}">`;
};

const HOW_ICON = {
  design: '<path d="M4 20h16M7 16.5 16.8 6.7a2 2 0 0 0-2.8-2.8L4.2 13.7 3.5 17z"/>',
  fabric: '<path d="M3 8.5 12 4l9 4.5-9 4.5zM3 12.5 12 17l9-4.5M3 16.5 12 21l9-4.5"/>',
  develop:'<path d="M3 7h18v10H3zM7 7v4M11 7v6M15 7v4M19 7v6"/>',
  produce:'<path d="M3 20h18M5 20V10l5 3.3V10l5 3.3V4.5h4V20"/>',
  deliver:'<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5zM3 8.5 12 13l9-4.5M12 13v7"/>',
  reorder:'<path d="M20 12a8 8 0 1 1-2.6-5.9M20 3.5V8h-4.5"/>',
};

const howIcon = (k) => `<span class="how-i" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${HOW_ICON[k] || ''}</svg></span>`;

/* The six small artefacts drawn beside the records in "What is included".
   Each one is the shape of a real document the project leaves behind — a
   plan, a shortlist, a log, a label, a file, a receipt — so the section
   shows what you get rather than asserting it. Values are illustrative. */
const artShell = (a, body, mod = '') => `<div class="art ${mod}">
<div class="art-h"><span class="art-h-l">${esc(a.label)}</span><span class="art-h-m">${esc(a.meta)}</span></div>
<div class="art-b">${body}</div></div>`;

const artRows = (a) => artShell(a, a.rows.map((r) =>
  `<div class="art-r"><span>${esc(r[0])}</span><span class="art-m">${esc(r[1])}</span></div>`).join(''));

const artKeys = (a, extra = '') => artShell(a, a.rows.map((r) =>
  `<div class="art-r"><span class="art-m">${esc(r[0])}</span><span>${esc(r[1])}</span></div>`).join('') + extra);

const ART = {
  plan: (a) => artRows(a),
  fabric: (a) => artShell(a, a.rows.map((r) => `<div class="art-w">
<span class="art-w-n">${esc(r[0])}</span>
<span class="art-w-bar"><i style="width:${Math.round(Number(r[1]) / 480 * 100)}%"></i></span>
<span class="art-w-v">${esc(r[1])} g/m&sup2;</span></div>`).join(''), 'art--weights'),
  proto: (a) => artShell(a, a.rows.map((r) =>
    `<div class="art-r"><span>${esc(r[0])}</span><span class="pill-s pill-s--${esc(r[2])}">${esc(r[1])}</span></div>`).join('')),
  brand: (a) => artShell(a, `<div class="art-label">${esc(a.mark)}<span>${esc(a.note)}</span></div>
<div class="art-sw">${a.swatches.map((c) => `<span title="${attr(c[1])}" style="background:${attr(c[0])}"></span>`).join('')}</div>`, 'art--brand'),
  spec: (a) => artKeys(a),
  reorder: (a) => artKeys(a, `<div class="art-check">${esc(a.check)}</div>`),
};

/* ── page: home ───────────────────────────────────────────────────────────
   The Custom Uniforms page, in the structure the mockup set: a chapter label
   with its index chip, a light display line, rounded panels on a quiet
   ground and one navy band per chapter that needs weight.

   Every word on it is content that already exists and is already translated.
   The chapters map onto the sections the site has always had:

     figures      <- band.stats        industries <- sectors
     how it works <- process.phases    timeline   <- process.stats
     recent work  <- projects.items     includes  <- wardrobe
     questions    <- faq                the brief <- contact

   Nothing is invented here and nothing English-only is introduced, which is
   why the page ships in five languages on the day it is built. */

/* the chapter head: index chip, label, display line, and the sentence beside
   it. Left variant puts the line and the sentence on one row. */
const chapterHead = (ix, label, title, lead, { h1 = false, id = '' } = {}) => `
<div class="shd shd--left"${id ? ` id="${id}"` : ''}>
<span class="tag"><i>${esc(ix)}</i>${esc(label)}</span>
${h1 ? `<h1 class="display shd-t">${esc(title)}</h1>` : `<h2 class="display shd-t">${esc(title)}</h2>`}
${lead ? `<p class="lede shd-d">${esc(lead)}</p>` : ''}
</div>`;

/* A photograph is served as WebP where a WebP twin exists in src/images, and
   as the JPEG itself where it does not. Some frames are supplied as JPEG only. */
const shot = (p) => {
  const webp = p.replace(/\.jpg$/, '.webp');
  return existsSync(join(ROOT, 'src', webp.replace(/^\/assets\//, ''))) ? webp : p;
};

const STUDIO_SHOT = ['hospitality', 'food', 'wellness', 'healthcare', 'corporate', 'retail'];

function renderHome(loc) {
  const h = HOME[loc], str = S(loc), cluster = clusters.find((c) => c.id === 'home');
  const url = homeURL(loc);
  const faqLD = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': abs(url) + '#faq',
    inLanguage: loc,
    mainEntity: h.faq.items.map((q) => ({
      '@type': 'Question', name: clean(q.q),
      acceptedAnswer: { '@type': 'Answer', text: clean(q.a) },
    })),
  };
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      orgNode,
      { '@type': 'WebSite', '@id': abs('/#website'), url: abs('/'), name: site.brand.plain,
        publisher: { '@id': abs('/#org') }, inLanguage: LOCALES },
      { '@type': 'WebPage', '@id': abs(url) + '#webpage', url: abs(url), name: clean(h.meta.title),
        description: clean(h.meta.description), isPartOf: { '@id': abs('/#website') },
        about: { '@id': abs('/#org') }, inLanguage: loc },
      { '@type': 'Service', '@id': abs(url) + '#service', name: clean(h.services.card.h3),
        serviceType: clean(h.services.h2), provider: { '@id': abs('/#org') }, areaServed: 'Europe',
        audience: { '@type': 'BusinessAudience', audienceType: h.sectors.items.map((s) => clean(s.name)).join(', ') },
        hasOfferCatalog: { '@type': 'OfferCatalog', name: clean(h.categories.h2),
          itemListElement: h.sectors.items.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: clean(s.name) } })) } },
    ],
  };

  const preload = `<link rel="preload" as="image" fetchpriority="high" href="/assets/images/studio/heroMobile.jpg" media="(max-width: 1000px)">
<link rel="preload" as="image" fetchpriority="high" href="/assets/images/studio/hero.jpg" media="(min-width: 1001px)">`;

  const sectorKeys = ['sector-hotels', 'sector-restaurants', 'sector-wellness', 'sector-medical', 'sector-service', 'sector-guest'];

  /* Control ids are prefixed: two of these names (timeline, brief) are also
     section ids on the same page, and a duplicate id makes getElementById
     and every in-page link resolve to whichever came first. */
  const fid = (id) => `f-${id}`;
  const field = (id, name, type, required, extra = '') => {
    const label = h.contact.form.labels[id] || id;
    const ph = h.contact.form.placeholders[id];
    const control = type === 'textarea'
      ? `<textarea class="inp" id="${fid(id)}" name="${name}" rows="4" maxlength="2000"${ph ? ` placeholder="${attr(ph)}"` : ''}></textarea>`
      : `<input class="inp" id="${fid(id)}" name="${name}" type="${type}"${required ? ' required aria-required="true"' : ''}${ph ? ` placeholder="${attr(ph)}"` : ''}${extra}>`;
    const help = h.contact.form.helps?.[id];
    return `<label class="fld${required ? ' fld--req' : ''}${type === 'textarea' ? ' bf-full' : ''}">
<span class="fld-l">${esc(label)}</span>${control}${help ? `<span class="fld-h">${esc(help)}</span>` : ''}</label>`;
  };
  const select = (id) => {
    const opts = h.contact.form.options[id] || [];
    return `<label class="fld fld--req"><span class="fld-l">${esc(h.contact.form.labels[id] || id)}</span>
<select class="inp" id="${fid(id)}" name="${id}" required aria-required="true">
${opts.map((o) => `<option value="${attr(o.disabled ? '' : o.t)}"${o.disabled ? ' disabled selected' : ''}>${esc(o.t)}</option>`).join('\n')}
</select></label>`;
  };
  const consent = esc(h.contact.form.consent)
    .replace(/\{privacy:([^}]+)\}/, (m, t) => `<a href="${legalURL(loc)}#privacy">${t}</a>`)
    .replace(/\{terms:([^}]+)\}/, (m, t) => `<a href="${legalURL(loc)}#terms">${t}</a>`);

  return head({ loc, url, title: h.meta.title, description: h.meta.description,
                ogTitle: h.meta.ogTitle, ogDescription: h.meta.ogDescription, cluster,
                extraLD: [graph, faqLD], preloadImage: preload })
+ header(loc, cluster) + `
<main id="main" data-page="custom">

<section class="shero"><div class="wrap"><div class="shero-in">
<div class="shero-copy">
<span class="news"><b>${esc(site.brand.city)}</b>${esc(h.hero.eyebrow.replace(/\s*[·,]\s*Barcel\w*\s*$/i, ''))}</span>
<h1 class="display shero-t">${esc(h.hero.h1)}</h1>
<p class="lede shero-d">${esc(h.hero.lead)}</p>
<div class="btn-row shero-btns">
<a class="btn btn--primary btn--lg btn--arrow" href="#brief">${esc(h.hero.primary)}<i class="btn-a" aria-hidden="true">&#8594;</i></a>
<a class="btn btn--ghost btn--lg btn--arrow" href="#work">${esc(h.hero.secondary)}<i class="btn-a" aria-hidden="true">&#8594;</i></a>
</div>
<p class="t-xs shero-sup">${esc(h.contact.form.hint)}</p>
</div>
<div class="shero-media">
<picture>
<source media="(max-width:1000px)" srcset="/assets/images/studio/heroMobile.jpg" width="${HERO_M.w}" height="${HERO_M.h}">
<img class="shero-img" src="/assets/images/studio/hero.jpg" width="${HERO_D.w}" height="${HERO_D.h}" fetchpriority="high" decoding="async" alt="${attr(h.hero.imageAlt || h.hero.h1)}">
</picture>
<div class="shero-card">
<div class="shero-card-h"><span class="eyebrow">${esc(h.band.kicker)}</span></div>
<div class="shero-card-t">${esc(h.band.text)}</div>
<dl class="shero-card-l">
${h.hero.proofs.map((p) => `<div><dt>${esc(p.label)}</dt><dd>${esc(p.text)}</dd></div>`).join('\n')}
</dl>
</div>
</div>
</div></div></section>

<section class="pub-sec"><div class="wrap">
<div class="band">
<dl class="band-g">
${h.band.stats.map((x) => `<div class="band-c">
<dd class="band-v">${esc(x.v)}${x.u ? `<span class="band-u">${esc(x.u)}</span>` : ''}</dd>
<dt class="band-l">${esc(x.l)}</dt>
<dd class="band-n">${esc(x.n)}</dd>
</div>`).join('\n')}
</dl>
</div>
</div></section>

<section class="pub-sec" id="sectors"><div class="wrap">
${chapterHead('01', h.sectors.kicker, h.sectors.h2, h.sectors.intro)}
<div class="ind-g">
${h.sectors.items.map((x, i) => `<article class="ind">
<div class="ind-m"><img src="/assets/images/studio/${STUDIO_SHOT[i]}.jpg" width="1200" height="900" loading="lazy" decoding="async" alt="${attr(x.alt || x.name)}"></div>
<div class="ind-b">
<span class="ind-n">${String(i + 1).padStart(2, '0')}</span>
<h3 class="ind-t">${esc(x.name)}</h3>
<p class="ind-d">${esc(x.desc || '')}</p>
${disclosure(loc, trimEcho(h.detail[sectorKeys[i]] || [], x.name), x.name)}
</div>
</article>`).join('\n')}
</div>
<p class="handoff"><a href="#brief">${esc(h.sectors.handoff)}</a></p>
</div></section>

<section class="pub-sec surface-2" id="how"><div class="wrap">
${chapterHead('02', h.stages.kicker, h.stages.h2, h.stages.intro)}
<div class="how-g">
${h.stages.items.map((x, i) => `<article class="how">
<div class="how-h">${howIcon(['design','fabric','develop','produce','deliver','reorder'][i])}<span class="how-n">${String(i + 1).padStart(2, '0')}</span></div>
<h3 class="how-t">${esc(x.h)}</h3>
<p class="how-p">${esc(x.p)}</p>
</article>`).join('\n')}
</div>
<p class="handoff"><a href="#brief">${esc(h.process.handoff)}</a></p>
</div></section>

<section class="pub-sec" id="timeline"><div class="wrap">
${chapterHead('03', h.phases.kicker, h.phases.h2, h.phases.intro)}
<ol class="pt">
${h.phases.items.map((x, i) => `<li class="pt-i">
<div class="pt-rail"><span class="pt-dot"></span></div>
<div class="pt-b">
<span class="pt-n">${esc(h.phases.phaseLabel)} ${i + 1}</span>
<h3 class="pt-t">${esc(x.h)}</h3>
<p class="pt-p">${esc(x.p)}</p>
<span class="pt-m">${esc(x.m)}</span>
</div>
</li>`).join('\n')}
</ol>
</div></section>

<section class="pub-sec" id="work"><div class="wrap">
${chapterHead('04', h.projects.kicker, h.projects.h2, h.projects.intro)}
<div class="split split--wide work-s">
<div class="split-b">
<figure class="fig"><div class="media media--4x5">
<img id="workfig-img" src="${attr(shot(h.projects.items[0].img))}" width="1040" height="500" loading="lazy" decoding="async" alt="${attr(h.projects.items[0].alt || h.projects.items[0].h3)}">
</div>
<figcaption class="cap"><b>${esc(h.projects.items[0].tag)}</b><span id="workfig-cap">${esc(h.projects.items[0].linkLabel || '')}</span></figcaption>
</figure>
</div>
<div class="split-b">
<div class="cases">
${h.projects.items.map((x, k) => `<details class="case" data-shot="${attr(shot(x.img))}" data-alt="${attr(x.alt || x.h3)}" data-tag="${attr(x.tag)}" data-cap="${attr(x.linkLabel || '')}"${k === 0 ? ' open' : ''}>
<summary class="case-q">
<span class="case-n">0${k + 1}</span>
<span class="case-t"><span class="case-h">${esc(x.h3)}</span><span class="case-m">${esc(x.tag)}</span></span>
</summary>
<div class="case-b">
<p class="case-scope">${esc(x.p)}</p>
${x.href ? `<a class="btn btn--ghost btn--sm case-cta" href="${attr(x.href)}">${esc(x.linkLabel)}</a>` : ''}
</div>
</details>`).join('\n')}
</div>
<p class="handoff"><a href="#brief">${esc(h.projects.handoff)}</a></p>
</div>
</div>
</div></section>

<section class="pub-sec surface-2" id="includes"><div class="wrap">
${chapterHead('05', h.includes.kicker, h.includes.h2, h.includes.intro)}
<div class="sol-g">
${h.includes.items.map((x, k) => `<article class="sol">
<div class="sol-h"><span class="sol-n">${String(k + 1).padStart(2, '0')}</span><h3 class="sol-ht">${esc(x.h)}</h3></div>
<p class="sol-p">${esc(x.p)}</p>
${ART[x.a](h.includes.art[x.a])}
</article>`).join('\n')}
</div>
<div class="ctabar">
<p class="ctabar__t">${esc(h.wardrobe.ctaText)}</p>
<a class="ctabar__a" href="#brief">${esc(h.wardrobe.ctaLabel)} <span aria-hidden="true">&#8594;</span></a>
</div>
</div></section>

<section class="pub-sec" id="faq"><div class="wrap">
${chapterHead('06', h.faq.kicker, h.faq.h2, h.faq.intro)}
<div class="faq-s"><div class="faq">
${faqItem(h.faq.items.slice(0, FAQ_VISIBLE), true)}
${h.faq.items.length > FAQ_VISIBLE ? `<details class="acc__more"><summary><span class="is-more">${esc(str.faqMore)}</span><span class="is-less">${esc(str.faqLess)}</span></summary>
${faqItem(h.faq.items.slice(FAQ_VISIBLE), false)}
</details>` : ''}
</div></div>
<p class="handoff"><a href="#brief">${esc(h.faq.handoff)}</a></p>
</div></section>

<section class="pub-sec" id="brief"><div class="wrap">
<div class="ask ask--form">
<span class="tag tag--dark"><i>07</i>${esc(h.contact.kicker)}</span>
<h2 class="display ask-t">${esc(h.contact.h2)}</h2>
${h.contact.paras.slice(0, 1).map((p) => `<p class="lede ask-d">${esc(p)}</p>`).join('')}
${h.contact.paras.slice(1).map((p) => `<p class="ask-sup bf-meet">${esc(p)}</p>`).join('')}
<form class="bf" data-form action="${attr(site.form.endpoint)}" method="post"
      data-sending="${attr(str.formSending)}" data-ok="${attr(str.formOk)}" data-error="${attr(str.formError)}">
<div class="bf-g">
${field('name', 'name', 'text', true, ' autocomplete="name" maxlength="100"')}
${field('email', 'email', 'email', true, ' autocomplete="email" maxlength="120" inputmode="email" autocapitalize="none"')}
${field('company', 'company', 'text', true, ' autocomplete="organization" maxlength="120"')}
${field('phone', 'phone', 'tel', false, ' autocomplete="tel" maxlength="30" inputmode="tel"')}
${select('team-size')}
${select('project-type')}
${select('timeline')}
${field('meeting-datetime', 'meeting-datetime', 'datetime-local', false)}
${field('brief', 'brief', 'textarea', false)}
</div>
<p class="hp"><label for="website">Website</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></p>
<label class="consent"><input type="checkbox" name="consent" required aria-required="true"> <span>${consent}</span></label>
<p class="form-status" data-form-status role="status" aria-live="polite" aria-atomic="true" hidden></p>
<div class="bf-f">
<button class="btn btn--onband btn--lg btn--arrow" type="submit">${esc(h.contact.form.submit)}<i class="btn-a" aria-hidden="true">&#8594;</i></button>
<div class="bf-fi">
<p class="t-xs">${esc(h.contact.form.hint)}</p>
<p class="t-xs">${h.contact.emailLabel ? `${esc(h.contact.emailLabel)}: ` : ''}<a class="lnk lnk--onband" href="mailto:${attr(site.brand.email)}">${esc(site.brand.email)}</a></p>
</div>
</div>
</form>
</div>
</div></section>

</main>
` + footer(loc);
}

/* ── page: blog index ────────────────────────────────────────────────────── */
function renderBlogIndex(loc) {
  const ui = UI[loc], str = S(loc), cluster = clusters.find((c) => c.id === 'blog');
  const url = blogURL(loc);
  const posts = site.postOrder.map((k) => POSTS[k][loc])
    .sort((a, b) => b.published.localeCompare(a.published));
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      orgNode,
      { '@type': 'Blog', '@id': abs(url) + '#blog', url: abs(url), name: clean(ui.blogH1),
        description: clean(ui.blogDescription), inLanguage: loc, publisher: { '@id': abs('/#org') },
        blogPost: posts.map((p) => ({ '@type': 'BlogPosting', '@id': abs(postURL(p.key, loc)) + '#article',
          headline: clean(p.headline), url: abs(postURL(p.key, loc)),
          datePublished: p.published, dateModified: p.modified })) },
      { '@type': 'BreadcrumbList', '@id': abs(url) + '#crumbs', itemListElement: [
        { '@type': 'ListItem', position: 1, name: ui.crumbHome || 'Home', item: abs(homeURL(loc)) },
        { '@type': 'ListItem', position: 2, name: ui.crumbBlog || str.journal },
      ] },
    ],
  };
  return head({ loc, url, title: `${ui.blogTitle} | ${site.brand.plain}`, description: ui.blogDescription, cluster, extraLD: [graph] })
+ header(loc, cluster) + `
<main id="main" data-page="blog">
<section class="pub-sec pub-sec--top"><div class="wrap">
<nav class="crumb" aria-label="Breadcrumb">
<a href="${homeURL(loc)}">${esc(ui.crumbHome || 'Home')}</a><span class="crumb-sep">/</span><span class="crumb-here">${esc(ui.crumbBlog || str.journal)}</span>
</nav>
${chapterHead('\u2014', ui.blogKicker, ui.blogH1, ui.blogLead, { h1: true })}

${posts.length ? `<article class="split split--wide jr-lead">
<div class="split-b">
<a class="jr-lead-m" href="${postURL(posts[0].key, loc)}" tabindex="-1" aria-hidden="true">${coverImg(posts[0].cover, posts[0].coverAlt || posts[0].title, { sizes: '(max-width: 900px) 92vw, 46rem' })}</a>
</div>
<div class="split-b jr-lead-b">
<span class="tag tag--sm"><i>01</i>${esc(posts[0].kicker)}</span>
<h2 class="display jr-lead-t"><a href="${postURL(posts[0].key, loc)}">${esc(posts[0].headline)}</a></h2>
<p class="lede jr-lead-d">${esc(posts[0].description)}</p>
<div class="jr-lead-f">
<time datetime="${attr(posts[0].published)}">${esc(humanDate(posts[0].published, loc))}</time>
<span>${esc(readTime(posts[0], loc))}</span>
</div>
</div>
</article>` : ''}

<div class="jr-g">
${posts.slice(1).map((p) => `<article class="jr">
<a class="jr-m" href="${postURL(p.key, loc)}" tabindex="-1" aria-hidden="true">${coverImg(p.cover, p.coverAlt || p.title, { sizes: '(max-width: 720px) 92vw, 22rem' })}</a>
<div class="jr-b">
<span class="jr-k">${esc(p.kicker)}</span>
<h2 class="jr-t"><a href="${postURL(p.key, loc)}">${esc(p.title)}</a></h2>
<p class="jr-d">${esc(p.description)}</p>
<div class="jr-f">
<time datetime="${attr(p.published)}">${esc(humanDate(p.published, loc))}</time>
<span>${esc(readTime(p, loc))}</span>
</div>
</div>
</article>`).join('\n')}
</div>
</div></section>

<section class="pub-sec"><div class="wrap">
<div class="ctabar">
<p class="ctabar__t">${esc(HOME[loc].contact.h2)}</p>
<a class="ctabar__a" href="${homeURL(loc)}#brief">${esc(HOME[loc].hero.primary)} <span aria-hidden="true">&#8594;</span></a>
</div>
</div></section>
</main>
` + footer(loc);
}

/* ── page: article ───────────────────────────────────────────────────────── */
function renderPost(key, loc) {
  const p = POSTS[key][loc], ui = UI[loc], str = S(loc);
  const cluster = clusters.find((c) => c.id === 'post:' + key);
  const url = postURL(key, loc);
  const headings = p.blocks.filter((b) => b.t === 'h2');
  const related = site.postOrder.filter((k) => k !== key).map((k) => POSTS[k][loc]);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      orgNode, personNode,
      { '@type': 'BlogPosting', '@id': abs(url) + '#article',
        isPartOf: { '@id': abs(blogURL(loc)) + '#blog' },
        mainEntityOfPage: abs(url),
        headline: clean(p.headline),
        description: clean(p.description),
        image: [abs(`/assets/images/blog/${p.cover}.jpg`)],
        datePublished: p.published, dateModified: p.modified,
        author: { '@id': abs('/#leonardo') },
        publisher: { '@id': abs('/#org') },
        inLanguage: loc,
        wordCount: wordCount(p),
        articleSection: clean(p.kicker),
        keywords: p.keywords || undefined,
        about: (p.about || []).map((t) => ({ '@type': 'Thing', name: t })),
      },
      { '@type': 'BreadcrumbList', '@id': abs(url) + '#crumbs', itemListElement: [
        { '@type': 'ListItem', position: 1, name: ui.crumbHome || 'Home', item: abs(homeURL(loc)) },
        { '@type': 'ListItem', position: 2, name: ui.crumbBlog || str.journal, item: abs(blogURL(loc)) },
        { '@type': 'ListItem', position: 3, name: clean(p.headline) },
      ] },
    ],
  };
  const preload = `<link rel="preload" as="image" fetchpriority="high" href="/assets/images/blog/${p.cover}.webp" type="image/webp">`;

  const body = p.blocks.map((b) => {
    if (b.t === 'h2') return `<h2 id="${attr(b.id)}">${b.v}</h2>`;
    if (b.t === 'h3') return `<h3 id="${attr(b.id)}">${b.v}</h3>`;
    if (b.t === 'ul') return `<ul>${b.v.map((i) => `<li>${i}</li>`).join('')}</ul>`;
    return `<p>${b.v}</p>`;
  }).join('\n');

  return head({ loc, url, title: `${p.title} | ${site.brand.plain}`, description: p.description, cluster,
                image: `/assets/images/blog/${p.cover}.jpg`, type: 'article', extraLD: [graph],
                preloadImage: preload, article: p })
+ header(loc, cluster) + `
<main id="main" data-page="post">
<article class="po">
<section class="pub-sec pub-sec--top"><div class="wrap">
<nav class="crumb" aria-label="Breadcrumb">
<a href="${homeURL(loc)}">${esc(ui.crumbHome || 'Home')}</a><span class="crumb-sep">/</span>
<a href="${blogURL(loc)}">${esc(ui.crumbBlog || str.journal)}</a><span class="crumb-sep">/</span>
<span class="crumb-here">${esc(p.title)}</span>
</nav>

<div class="po-hd">
<span class="tag tag--sm"><i>&mdash;</i>${esc(p.kicker)}</span>
<h1 class="display po-t">${esc(p.headline)}</h1>
<p class="lede po-d">${esc(p.description)}</p>
<div class="po-meta">
<span><b>${esc(str.published)}</b><time datetime="${attr(p.published)}">${esc(humanDate(p.published, loc))}</time></span>
${p.modified !== p.published ? `<span><b>${esc(str.updated)}</b><time datetime="${attr(p.modified)}">${esc(humanDate(p.modified, loc))}</time></span>` : ''}
<span><b>${esc(str.toc)}</b>${esc(readTime(p, loc))}</span>
<span><b>${esc(str.by)}</b>${esc(p.author)}</span>
</div>
</div>

<figure class="po-m">
${coverImg(p.cover, p.coverAlt, { sizes: '(max-width: 1200px) 92vw, 75rem', lazy: false, priority: true })}
${p.coverCaption ? `<figcaption class="po-cap">${esc(p.coverCaption)}</figcaption>` : ''}
</figure>

${p.takeaways?.length ? `<div class="po-key" id="short-answer">
<div class="po-key-h"><span class="eyebrow">${esc(str.takeaways)}</span><span class="t-xs faint">${esc(readTime(p, loc))}</span></div>
<ul class="po-key-l">${p.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
</div>` : ''}

<div class="po-body">
<aside class="po-rail" data-toc aria-label="${attr(str.toc)}">
<div class="eyebrow">${esc(str.toc)}</div>
<ol class="po-toc">
${p.takeaways?.length ? `<li><a href="#short-answer">${esc(str.takeaways)}</a></li>` : ''}
${headings.map((hh) => `<li><a href="#${attr(hh.id)}">${hh.v.replace(/<[^>]+>/g, '')}</a></li>`).join('\n')}
</ol>
<div class="po-rail-cta"><a class="btn btn--ghost btn--sm btn--arrow" href="${homeURL(loc)}#brief">${esc(HOME[loc].hero.primary)}<i class="btn-a" aria-hidden="true">&#8594;</i></a></div>
</aside>
<div class="po-read">
${body}
<div class="author">
<div class="author__av" aria-hidden="true">${esc(p.author.split(' ').map((w) => w[0]).join('').slice(0, 2))}</div>
<div>
<p><strong>${esc(p.author)}</strong></p>
<p class="muted small">${esc(site.brand.plain)} &mdash; ${esc(site.brand.city)}</p>
</div>
</div>
</div>
</div>
</div></section>

<section class="pub-sec surface-2"><div class="wrap">
${chapterHead('\u2014', str.relatedTitle, str.relatedTitle, '')}
<div class="jr-g">
${related.map((r) => `<article class="jr">
<a class="jr-m" href="${postURL(r.key, loc)}" tabindex="-1" aria-hidden="true">${coverImg(r.cover, r.coverAlt || r.title, { sizes: '(max-width: 720px) 92vw, 22rem' })}</a>
<div class="jr-b">
<span class="jr-k">${esc(r.kicker)}</span>
<h3 class="jr-t"><a href="${postURL(r.key, loc)}">${esc(r.title)}</a></h3>
<p class="jr-d">${esc(r.description)}</p>
<div class="jr-f"><time datetime="${attr(r.published)}">${esc(humanDate(r.published, loc))}</time><span>${esc(readTime(r, loc))}</span></div>
</div>
</article>`).join('\n')}
</div>
</div></section>

<section class="pub-sec"><div class="wrap">
<div class="ctabar">
<p class="ctabar__t">${esc(HOME[loc].contact.h2)}</p>
<a class="ctabar__a" href="${homeURL(loc)}#brief">${esc(HOME[loc].hero.primary)} <span aria-hidden="true">&#8594;</span></a>
</div>
</div></section>
</article>
</main>
` + footer(loc);
}

/* ── page: legal hub ─────────────────────────────────────────────────────── */
function renderLegal(loc) {
  const l = LEGAL[loc], str = S(loc), cluster = clusters.find((c) => c.id === 'legal');
  const url = legalURL(loc);
  const doc = (s) => `<section class="legal__doc" id="${attr(s.id)}">
<h2>${esc(s.title)}</h2>
${s.blocks.map((b) => (b.t === 'h' ? `<h3>${esc(b.v)}</h3>` : b.t === 'ul' ? `<ul>${b.v.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p>${esc(b.v)}</p>`)).join('\n')}
</section>`;
  return head({ loc, url, title: `${str.legal} | ${site.brand.plain}`, description: str.legalIntro, cluster })
+ header(loc, cluster) + `
<nav class="crumbs wrap" aria-label="Breadcrumb">
<ol><li><a href="${homeURL(loc)}">${esc(UI[loc].crumbHome || 'Home')}</a></li><li aria-current="page">${esc(str.legal)}</li></ol>
</nav>
<main id="main">
<section class="section section--tight"><div class="wrap">
<div class="page-head">
<h1 class="h1">${esc(str.legal)}</h1>
<p class="lead">${esc(str.legalIntro)}</p>
</div>
</div></section>
<section class="section section--flush"><div class="wrap legal">
<nav class="legal__nav" aria-label="${attr(str.legal)}">
${l.sections.map((s) => `<a href="#${attr(s.id)}">${esc(s.title)}</a>`).join('\n')}
</nav>
<div class="legal__body">
${l.sections.map(doc).join('\n')}
</div>
</div></section>
</main>
` + footer(loc);
}

/* ── page: 404 ───────────────────────────────────────────────────────────── */
function render404() {
  const loc = DEFAULT, str = S(loc);
  return head({ loc, url: '/404.html', title: `${str.notFound} | ${site.brand.plain}`,
                description: str.notFoundText, cluster: { noindex: true, urls: {} } })
+ header(loc) + `
<main id="main"><div class="wrap error">
<p class="eyebrow">404</p>
<h1 class="h1">${esc(str.notFound)}</h1>
<p class="lead">${esc(str.notFoundText)}</p>
<a class="btn btn--primary" href="/">${esc(str.backHome)}</a>
</div></main>
` + footer(loc);
}

/* ── legacy redirect stubs (GitHub Pages cannot issue 301s) ──────────────── */
const redirectStub = (to) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved</title>
<link rel="canonical" href="${abs(to.split('#')[0])}">
<meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0; url=${to}">
</head>
<body><p>Moved to <a href="${to}">${to}</a>.</p></body>
</html>
`;

/* ── sitemap, feeds, robots ──────────────────────────────────────────────── */
function lastmodFor(cluster) {
  if (cluster.type === 'post') {
    return Object.values(POSTS[cluster.key]).map((p) => p.modified).sort().pop();
  }
  const all = site.postOrder.flatMap((k) => Object.values(POSTS[k]).map((p) => p.modified));
  return all.sort().pop();
}
let PAGE_IMAGES = new Map();
function sitemap() {
  const rows = clusters.filter((c) => !c.noindex).flatMap((c) =>
    Object.entries(c.urls).map(([loc, url]) => `  <url>
    <loc>${abs(url)}</loc>
    <lastmod>${lastmodFor(c)}</lastmod>
    <priority>${c.priority}</priority>
${LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(c.urls[l])}"/>`).join('\n')}
    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(c.urls[DEFAULT])}"/>
${(PAGE_IMAGES.get(url) || []).map((src) => `    <image:image><image:loc>${abs(src)}</image:loc></image:image>`).join('\n')}
  </url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${rows.join('\n')}
</urlset>
`;
}
function feed(loc) {
  const posts = site.postOrder.map((k) => POSTS[k][loc]).sort((a, b) => b.published.localeCompare(a.published));
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(UI[loc].blogH1)}</title>
    <link>${abs(blogURL(loc))}</link>
    <atom:link href="${abs(loc === DEFAULT ? '/feed.xml' : `/${loc}/feed.xml`)}" rel="self" type="application/rss+xml"/>
    <description>${esc(UI[loc].blogDescription)}</description>
    <language>${loc}</language>
    <lastBuildDate>${new Date(posts[0].modified + 'T09:00:00Z').toUTCString()}</lastBuildDate>
${posts.map((p) => `    <item>
      <title>${esc(p.headline)}</title>
      <link>${abs(postURL(p.key, loc))}</link>
      <guid isPermaLink="true">${abs(postURL(p.key, loc))}</guid>
      <pubDate>${new Date(p.published + 'T09:00:00Z').toUTCString()}</pubDate>
      <description>${esc(p.description)}</description>
    </item>`).join('\n')}
  </channel>
</rss>
`;
}
/* Crawler policy. Three separate decisions, stated explicitly rather than
   left to the wildcard, per audit control 19.

   1. Search and citation  — allowed. These bots feed Google, Bing, ChatGPT
      search and Claude search, which is where the studio wants to appear.
   2. User-directed fetch  — allowed. A person has asked an assistant to open
      a specific page; refusing that is refusing a reader.
   3. Model training       — allowed, and this is the one real business choice
      here. To withdraw the site from training corpora, change Allow to
      Disallow under the model-training group only; search visibility is
      unaffected because those are different bots.

   The legal pages are deliberately no longer disallowed. They carry
   <meta name="robots" content="noindex">, and a crawler blocked by robots.txt
   can never read that tag, which left those URLs eligible to appear as bare
   links. Allowing the crawl is what actually keeps them out. */
const robots = () => `# Search and citation crawlers — allowed
User-agent: Googlebot
User-agent: Bingbot
User-agent: OAI-SearchBot
User-agent: Claude-SearchBot
Allow: /

# User-directed retrieval (a reader asked an assistant for this page) — allowed
User-agent: ChatGPT-User
User-agent: Claude-User
Allow: /

# Model training and development — allowed; change to Disallow to withdraw
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
Allow: /

# Everything else
User-agent: *
Allow: /

Sitemap: ${abs('/sitemap.xml')}
`;

/* ── audit ───────────────────────────────────────────────────────────────── */
function audit(url, html, cluster, loc) {
  const at = (m) => `${url}: ${m}`;
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonical !== abs(url)) errors.push(at(`canonical is ${canonical || 'missing'}`));
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) errors.push(at('needs exactly one <h1>'));
  if (html.match(/<html lang="([a-z-]+)"/)?.[1] !== loc) errors.push(at(`<html lang> is not "${loc}"`));
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
  if (title.length < 15) errors.push(at(`title is only ${title.length} characters`));
  if (title.length > 65) warnings.push(at(`title is ${title.length} characters (over 65)`));
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
  if (desc.length < 50) errors.push(at(`meta description is only ${desc.length} characters`));
  if (desc.length > 170) warnings.push(at(`meta description is ${desc.length} characters (over 170)`));
  if (cluster && !cluster.noindex) {
    for (const l of LOCALES) {
      if (!html.includes(`hreflang="${l}" href="${abs(cluster.urls[l])}"`)) errors.push(at(`hreflang cluster is missing ${l}`));
    }
    if (!html.includes('hreflang="x-default"')) errors.push(at('hreflang x-default is missing'));
  }
  if (cluster?.noindex && !/name="robots" content="noindex/.test(html)) errors.push(at('must be noindex'));
  for (const img of html.match(/<img [^>]*>/g) || []) {
    if (/src="(?!\/|data:|https?:)/.test(img)) errors.push(at('<img src> is relative — paths must start with /'));
    if (!/\salt=/.test(img)) errors.push(at('<img> without alt'));
    if (!/width=/.test(img) || !/height=/.test(img)) errors.push(at('<img> without width/height (layout shift)'));
  }
  for (const m of html.matchAll(/style="[^"]*max-width:\s*([\d.]+)(ch|rem|em|px)/g)) {
    warnings.push(at(`inline max-width:${m[1]}${m[2]} — set width in site.css via --measure-*`));
  }
  for (const ld of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(ld[1]); } catch (e) { errors.push(at(`invalid JSON-LD (${e.message})`)); }
  }
  for (const href of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const p = href[1];
    if (/\.(css|js|xml|txt|svg|png|jpg|webp|woff2)$/.test(p)) continue;
    if (!KNOWN_URLS.has(p)) warnings.push(at(`link to unknown internal URL ${p}`));
  }
}

/* ── write ───────────────────────────────────────────────────────────────── */
const pages = [];
for (const loc of LOCALES) {
  pages.push({ url: homeURL(loc), html: renderHome(loc), cluster: clusters.find((c) => c.id === 'home'), loc });
  pages.push({ url: blogURL(loc), html: renderBlogIndex(loc), cluster: clusters.find((c) => c.id === 'blog'), loc });
  for (const key of site.postOrder) {
    pages.push({ url: postURL(key, loc), html: renderPost(key, loc), cluster: clusters.find((c) => c.id === 'post:' + key), loc });
  }
  pages.push({ url: legalURL(loc), html: renderLegal(loc), cluster: clusters.find((c) => c.id === 'legal'), loc });
}
pages.push(...MERCH.renderPages((o) => head({ ...o, merch: true })));
for (const p of MERCH.problems) errors.push(`merchandise: ${p}`);
const KNOWN_URLS = new Set([...pages.map((p) => p.url), ...Object.keys(site.legacyRedirects), '/404.html']);

for (const p of pages) audit(p.url, p.html, p.cluster, p.loc);

if (!CHECK && errors.length === 0) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const writeFile = (rel, body) => {
    const file = join(OUT, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  };
  for (const p of pages) writeFile(p.url.replace(/^\//, '') + 'index.html', p.html);
  writeFile('404.html', render404());
  for (const [from, to] of Object.entries(site.legacyRedirects)) writeFile(from.replace(/^\//, '') + 'index.html', redirectStub(to));
  PAGE_IMAGES = new Map(pages.map((p) => [p.url,
    [...new Set([...p.html.matchAll(/<img\b[^>]*?\bsrc="([^"]+)"/g)].map((m) => m[1]))].filter((src) => src.startsWith('/'))]));
  writeFile('sitemap.xml', sitemap());
  writeFile('robots.txt', robots());
  for (const loc of LOCALES) writeFile(loc === DEFAULT ? 'feed.xml' : `${loc}/feed.xml`, feed(loc));

  cpSync(join(ROOT, 'src/css/site.css'), join(OUT, 'assets/css/site.css'));
  cpSync(join(ROOT, 'src/js/site.js'), join(OUT, 'assets/js/site.js'));
  /* The merchandise side ships the mockup's own stylesheet — the signed-off
     design, unedited — with its webfont faces ahead of it. */
  /* The mockup carries Gilmer as five base64 @font-face rules, because an
     Artifact cannot fetch a font from anywhere. This site already serves those
     exact five faces as .woff2 files, so the merchandise sheet points at them:
     129KB smaller, cached across both sides of the site, and it stops the CSP
     (font-src 'self') from refusing every one of them. */
  const FACES = { 300: 'light', 400: 'regular', 500: 'medium', 700: 'bold', 800: 'heavy' };
  const fontCSS = Object.entries(FACES).map(([weight, name]) =>
    `@font-face{font-family:"Gilmer";font-weight:${weight};font-style:normal;font-display:swap;` +
    `src:url("/assets/fonts/gilmer-${name}.woff2") format("woff2")}`).join('\n');
  writeFile('assets/css/merch.css',
    fontCSS + '\n' +
    readFileSync(join(ROOT, 'mockup/app.css'), 'utf8') + '\n' + MERCH_CSS);
  writeFile('assets/js/merch.js', merchJS({
    ROOT, site, LOCALES, M: MERCH.M, metaByUrl: MERCH.metaByUrl,
    manifest: JSON.parse(readFileSync(join(ROOT, 'src/images/catalogue/manifest.json'), 'utf8')),
  }));
  cpSync(join(ROOT, 'src/fonts'), join(OUT, 'assets/fonts'), { recursive: true });
  cpSync(join(ROOT, 'src/brand'), join(OUT, 'assets/brand'), { recursive: true });
  /* src/images/incoming holds full-resolution originals for future crops.
     They are referenced by nothing, so they must not be published. */
  cpSync(join(ROOT, 'src/images'), join(OUT, 'assets/images'), { recursive: true,
    filter: (src) => !src.includes(`${sep}images${sep}incoming`) });
  cpSync(join(ROOT, 'src/static'), OUT, { recursive: true });
}

/* ── report ──────────────────────────────────────────────────────────────── */
const indexable = clusters.filter((c) => !c.noindex).length * LOCALES.length;
console.log(`${CHECK ? 'checked' : 'built'} ${pages.length} pages (${indexable} indexable) in ${LOCALES.length} languages`);
if (warnings.length) console.log(warnings.map((w) => '  warn  ' + w).join('\n'));
if (errors.length) {
  console.log(errors.map((e) => '  ERROR ' + e).join('\n'));
  console.log(`\n${errors.length} error(s) — nothing was written.`);
  process.exit(1);
}
console.log(warnings.length ? `\n${warnings.length} warning(s), no errors.` : '\nclean.');
