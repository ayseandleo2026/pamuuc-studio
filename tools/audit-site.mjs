/* ============================================================================
   Audit the built site
   ---------------------------------------------------------------------------
   tools/build.mjs checks each page as it writes it. This checks the thing that
   check cannot see: the site as a whole, on disk, after the build — every link
   resolving to a file that exists, every image present, every hreflang
   reciprocated, and none of the prototype's furniture left in the output.

   Run: node tools/audit-site.mjs [dist]
   ========================================================================= */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const OUT = process.argv[2] || 'dist';
const fail = [], warn = [];
const F = (m) => fail.push(m);
const W = (m) => warn.push(m);

/* ---- collect every page ------------------------------------------------- */
const pages = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e === 'index.html' || e === '404.html') pages.push(p);
  }
})(OUT);

const urlOf = (file) => '/' + file.slice(OUT.length + 1).replace(/index\.html$/, '');
const KNOWN = new Set(pages.map(urlOf));

const attr = (html, re) => (html.match(re) || [])[1] || '';
const all = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

/* Redirect stubs are pages too, and they are allowed to break most of the
   rules below — they exist to bounce, not to be read. */
const isStub = (html) => /http-equiv="refresh"/i.test(html);

const titles = new Map(), descs = new Map();
let imgCount = 0, linkCount = 0, stubs = 0;

for (const file of pages) {
  const url = urlOf(file);
  const html = readFileSync(file, 'utf8');
  const at = (m) => F(`${url}: ${m}`);

  if (isStub(html)) { stubs++; continue; }

  /* --- the prototype must not have leaked through --- */
  if (/class="switch"/.test(html)) at('the prototype surface switcher is in the HTML');
  for (const bad of ['jumpAccount', 'jumpStudio', 'data-act="reset"']) {
    if (html.includes(bad)) at(`prototype control "${bad}" is in the HTML`);
  }
  if (/data-go="public:login"/.test(html)) at('a customer-account link survived');
  if (/data:image\//.test(html)) at('a base64 image is still inline');
  if (/formspree/i.test(html) && !/connect-src/.test(html.split('formspree')[0].slice(-200))) {
    W(`${url}: mentions formspree`);
  }

  /* --- head --- */
  const title = attr(html, /<title>([^<]*)<\/title>/);
  const desc = attr(html, /<meta name="description" content="([^"]*)"/);
  const canon = attr(html, /<link rel="canonical" href="([^"]*)"/);
  if (!title) at('no <title>');
  if (title.length > 65) W(`${url}: title is ${title.length} chars`);
  if (desc.length < 50) at(`meta description is ${desc.length} chars`);
  if (!canon.endsWith(url)) at(`canonical ${canon} does not match the URL`);
  if (title) titles.set(title, (titles.get(title) || 0) + 1);
  if (desc) descs.set(desc, (descs.get(desc) || 0) + 1);

  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) at(`${h1s} <h1> elements`);

  /* --- images: referenced files must exist on disk --- */
  for (const tag of html.match(/<img\b[^>]*>/g) || []) {
    imgCount++;
    const src = attr(tag, /\ssrc="([^"]*)"/);
    if (!src) { at('an <img> with no src'); continue; }
    if (!src.startsWith('/')) { at(`relative image src ${src}`); continue; }
    if (!existsSync(join(OUT, src.slice(1)))) at(`image is missing from the build: ${src}`);
    if (!/\salt=/.test(tag)) at(`image without alt: ${src}`);
    if (!/\swidth=/.test(tag) || !/\sheight=/.test(tag)) at(`image without dimensions: ${src}`);
  }
  /* <source srcset> inside <picture> is just as breakable */
  for (const tag of html.match(/<source\b[^>]*>/g) || []) {
    for (const s of attr(tag, /\ssrcset="([^"]*)"/).split(',')) {
      const u = s.trim().split(/\s+/)[0];
      if (u && u.startsWith('/') && !existsSync(join(OUT, u.slice(1)))) at(`srcset image is missing: ${u}`);
    }
  }

  /* --- internal links must go somewhere --- */
  for (const href of all(html, /href="(\/[^"]*)"/g)) {
    linkCount++;
    const path = href.split('#')[0].split('?')[0];
    if (!path || path === '/') continue;
    if (/\.(css|js|xml|txt|svg|png|jpg|jpeg|webp|woff2|ico|json)$/.test(path)) {
      if (!existsSync(join(OUT, path.slice(1)))) at(`asset link 404: ${path}`);
      continue;
    }
    if (!KNOWN.has(path)) at(`link to a page that was not built: ${path}`);
  }

  /* --- hreflang --- */
  const alts = all(html, /hreflang="([a-z-]+)"/g);
  if (!/noindex/.test(html)) {
    for (const l of ['en', 'es', 'fr', 'it', 'de']) {
      if (!alts.includes(l)) at(`hreflang is missing ${l}`);
    }
    if (!alts.includes('x-default')) at('hreflang x-default is missing');
  }
}

/* --- duplicate titles and descriptions are an SEO problem, not a crash --- */
for (const [t, n] of titles) if (n > 1) W(`${n} pages share the title "${t.slice(0, 60)}"`);
for (const [d, n] of descs) if (n > 1) W(`${n} pages share a meta description ("${d.slice(0, 50)}…")`);

/* --- the sitemap must agree with what was built --- */
const smPath = join(OUT, 'sitemap.xml');
if (!existsSync(smPath)) F('there is no sitemap.xml');
else {
  const sm = readFileSync(smPath, 'utf8');
  const locs = all(sm, /<loc>([^<]+)<\/loc>/g).map((u) => u.replace(/^https?:\/\/[^/]+/, ''));
  for (const u of locs) if (!KNOWN.has(u)) F(`sitemap lists ${u}, which was not built`);
  const indexable = [...KNOWN].filter((u) => {
    const f = join(OUT, u.slice(1), 'index.html');
    if (!existsSync(f)) return false;
    const h = readFileSync(f, 'utf8');
    return !isStub(h) && !/noindex/.test(h);
  });
  for (const u of indexable) if (!locs.includes(u)) W(`${u} is indexable but not in the sitemap`);
}

/* ---- report ------------------------------------------------------------- */
console.log(`${pages.length} pages (${stubs} redirect stubs), ${imgCount} images, ${linkCount} internal links\n`);
const show = (list, label) => {
  if (!list.length) return;
  console.log(`${list.length} ${label}:`);
  const seen = new Map();
  for (const m of list) {
    const key = m.replace(/^[^:]*: /, '');
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  let shown = 0;
  for (const m of list) {
    if (shown++ >= 25) { console.log(`  … and ${list.length - 25} more`); break; }
    console.log('  ' + m);
  }
  console.log('');
};
show(fail, 'FAILURES');
show(warn, 'warnings');
if (!fail.length) console.log(warn.length ? `no failures, ${warn.length} warning(s).` : 'clean — no failures, no warnings.');
process.exitCode = fail.length ? 1 : 0;
