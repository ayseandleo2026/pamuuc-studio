/* Mobile layout audit — development only, not part of the build.
   Walks every page dist/ publishes at phone widths and reports the four
   faults that are visible to a visitor and invisible to the content audit:

     scroll    the page scrolls sideways
     overflow  a box sits outside the viewport
     tiny      text under the 11px floor
     dead      a flex/grid box far taller than what it holds
     clip      text cut off by an overflow:hidden ancestor

   The site itself has no dependencies and this must not change that, so
   Playwright is not vendored in. Install it anywhere and point Node at it:

     npm install playwright && npx playwright install chromium
     node tools/serve.mjs &
     NODE_PATH=./node_modules node tools/mobile-audit.mjs
     NODE_PATH=./node_modules node tools/mobile-audit.mjs --width 320,375

   Exits non-zero when a page has a fault, so it can gate a release.
*/
import { chromium } from 'playwright';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:8791';
const flag = process.argv.indexOf('--width');
const widths = ((flag > -1 && (process.argv[flag].split('=')[1] || process.argv[flag + 1])) || '320,375,414')
  .split(',').map(Number).filter(Boolean);

/* Every index.html under dist/ is a page; 404.html is one too. */
async function pages(dir = DIST, base = '') {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'assets' || e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...await pages(join(dir, e.name), base + '/' + e.name));
    else if (e.name === 'index.html') out.push(base + '/');
    else if (e.name === '404.html') out.push(base + '/404.html');
  }
  return out.sort();
}

/* Runs in the page. Deliberately off-screen things (the skip link, the
   honeypot) sit at -9999px and are not faults. */
const probe = () => {
  const W = document.documentElement.clientWidth;
  const sel = e => {
    let s = e.tagName.toLowerCase();
    if (e.id) s += '#' + e.id;
    if (typeof e.className === 'string' && e.className.trim())
      s += '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.');
    return s;
  };
  const vis = e => {
    const cs = getComputedStyle(e);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length;
  };
  const r = { scroll: document.documentElement.scrollWidth - W, overflow: [], tiny: [], dead: [], clip: [] };
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    const cs = getComputedStyle(e), box = e.getBoundingClientRect();
    if (box.left < -500) continue;
    if (cs.position !== 'fixed' && box.width > 0 && (box.right > W + 1 || box.left < -1))
      r.overflow.push(`${sel(e)} right=${box.right.toFixed(0)}`);
    const ownText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (ownText) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 11) r.tiny.push(`${sel(e)} ${fs}px`);
      if (/hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY) &&
          (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1))
        r.clip.push(`${sel(e)} "${e.textContent.trim().slice(0, 24)}"`);
    }
    /* Slack under the last child is only a fault when it is not matched above
       it: a box that centres its content is meant to have room on both sides,
       while a lone gap at the bottom is a basis applied down the wrong axis. */
    if ((cs.display === 'flex' || cs.display === 'grid') && e.children.length) {
      let bottom = 0, top = Infinity;
      for (const c of e.children) {
        if (!vis(c)) continue;
        const cr = c.getBoundingClientRect();
        if (cr.bottom > bottom) bottom = cr.bottom;
        if (cr.top < top) top = cr.top;
      }
      const below = box.bottom - parseFloat(cs.paddingBottom) - bottom;
      const above = top - box.top - parseFloat(cs.paddingTop);
      if (bottom && below > 60 && below - above > 60)
        r.dead.push(`${sel(e)} +${Math.round(below)}px under, ${Math.round(above)}px over`);
    }
  }
  for (const k of ['overflow', 'tiny', 'dead', 'clip']) r[k] = [...new Set(r[k])];
  return r;
};

const urls = await pages();
const browser = await chromium.launch();
let faults = 0, checked = 0;

for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  /* Consent is a decision, not a layout state: settle it so the notice does
     not sit over the fold on every single page. */
  await ctx.addInitScript(() => { try { localStorage.setItem('pamuuc-consent', 'reject'); } catch {} });
  for (const u of urls) {
    await page.goto(ORIGIN + u, { waitUntil: 'load' });
    await page.waitForTimeout(180);
    const r = await page.evaluate(probe);
    checked++;
    const bad = r.scroll > 0 || r.overflow.length || r.tiny.length || r.dead.length || r.clip.length;
    if (!bad) continue;
    faults++;
    console.log(`\n${width}px  ${u}`);
    if (r.scroll > 0) console.log(`  scroll    page is ${r.scroll}px wider than the screen`);
    for (const x of r.overflow.slice(0, 6)) console.log(`  overflow  ${x}`);
    for (const x of r.tiny.slice(0, 6)) console.log(`  tiny      ${x}`);
    for (const x of r.dead.slice(0, 6)) console.log(`  dead      ${x}`);
    for (const x of r.clip.slice(0, 6)) console.log(`  clip      ${x}`);
  }
  await ctx.close();
}
await browser.close();

console.log(`\n${checked} page/width combinations checked at ${widths.join(', ')}px.`);
console.log(faults ? `${faults} with faults.` : 'clean.');
process.exit(faults ? 1 : 0);
