/* ============================================================================
   What is translated, what is left, and what to do next
   ---------------------------------------------------------------------------
   Reads content/merch.en.json and each content/merch.<loc>.json and reports.
   Strings are ordered by how many pages carry them, so the top of the list is
   always the work that changes the most pages.

     node tools/translate-status.mjs              coverage for every language
     node tools/translate-status.mjs es           what Spanish still needs
     node tools/translate-status.mjs es 50        the next 50, in priority order
     node tools/translate-status.mjs es --csv     all of it as CSV, for a translator
     node tools/translate-status.mjs --check      non-zero exit if any language is short

   See TRANSLATION.md.
   ========================================================================= */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
const LOCALES = Object.keys(site.locales).filter((l) => l !== 'en');

const en = JSON.parse(readFileSync(join(ROOT, 'content/merch.en.json'), 'utf8'));
const KEYS = Object.keys(en.copy);

/* which pages each string appears on — written by tools/extract-copy.mjs */
const wherePath = join(ROOT, 'content/merch.where.json');
const GUIDE = existsSync(wherePath) ? JSON.parse(readFileSync(wherePath, 'utf8')) : {};
const WHERE = GUIDE.where || {};
const COUNT = GUIDE.count || {};
const reach = (k) => COUNT[k] ?? (WHERE[k] || []).length;

const dictOf = (loc) => {
  const f = join(ROOT, `content/merch.${loc}.json`);
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, 'utf8')).copy || {};
};

const done = (d, k) => !!(d && d[k] && d[k] !== k);
const bar = (n, total, width = 28) => {
  const on = Math.round((n / total) * width);
  return '█'.repeat(on) + '·'.repeat(width - on);
};

const args = process.argv.slice(2);
const loc = args.find((a) => LOCALES.includes(a));
const csv = args.includes('--csv');
const check = args.includes('--check');
const limit = Number(args.find((a) => /^\d+$/.test(a))) || 40;

/* ---- one language, in detail -------------------------------------------- */
if (loc) {
  const d = dictOf(loc);
  if (!d) { console.log(`content/merch.${loc}.json does not exist yet.`); process.exit(1); }
  const todo = KEYS.filter((k) => !done(d, k)).sort((a, b) => reach(b) - reach(a) || b.length - a.length);

  if (csv) {
    const out = [['english', loc, 'pages', 'where'].join('\t')]
      .concat(KEYS.map((k) => [k, d[k] && d[k] !== k ? d[k] : '', reach(k), (WHERE[k] || []).slice(0, 4).join(' ')]
        .map((c) => String(c).replace(/\t/g, ' ')).join('\t')));
    const f = join(ROOT, `content/merch.${loc}.tsv`);
    writeFileSync(f, out.join('\n') + '\n');
    console.log(`content/merch.${loc}.tsv — ${KEYS.length} rows, tab separated.`);
    console.log('Opens in Numbers or Excel. Fill the second column, then run:');
    console.log(`  node tools/translate-status.mjs ${loc} --import`);
    process.exit(0);
  }

  if (args.includes('--import')) {
    const f = join(ROOT, `content/merch.${loc}.tsv`);
    if (!existsSync(f)) { console.log(`${f} is not there — run --csv first.`); process.exit(1); }
    const rows = readFileSync(f, 'utf8').split('\n').slice(1).filter(Boolean);
    const file = join(ROOT, `content/merch.${loc}.json`);
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    let added = 0, unknown = 0;
    for (const row of rows) {
      const [k, v] = row.split('\t');
      if (!v || !v.trim()) continue;
      if (!en.copy[k]) { unknown++; continue; }
      if (doc.copy[k] !== v) { doc.copy[k] = v; added++; }
    }
    doc._translated = KEYS.filter((k) => done(doc.copy, k)).length;
    doc._of = KEYS.length;
    writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
    console.log(`${added} translations imported into content/merch.${loc}.json (${doc._translated}/${KEYS.length}).`);
    if (unknown) console.log(`${unknown} row(s) had an English column that is no longer in the source — skipped.`);
    console.log('Now: node tools/build.mjs');
    process.exit(0);
  }

  const n = KEYS.length - todo.length;
  console.log(`${loc}  ${bar(n, KEYS.length)}  ${n}/${KEYS.length}\n`);
  console.log(`Next ${Math.min(limit, todo.length)}, most-used first:\n`);
  for (const k of todo.slice(0, limit)) {
    const pages = reach(k);
    console.log(`  [${String(pages).padStart(2)} page${pages === 1 ? ' ' : 's'}]  ${k}`);
  }
  if (todo.length > limit) console.log(`\n  … and ${todo.length - limit} more. Add a number to see further.`);
  process.exit(0);
}

/* ---- every language, summary -------------------------------------------- */
console.log(`${KEYS.length} strings on the merchandise side\n`);
let short = false;
for (const l of LOCALES) {
  const d = dictOf(l);
  if (!d) { console.log(`  ${l}  ${bar(0, KEYS.length)}  no file yet`); short = true; continue; }
  const n = KEYS.filter((k) => done(d, k)).length;
  if (n < KEYS.length) short = true;
  console.log(`  ${l}  ${bar(n, KEYS.length)}  ${String(n).padStart(4)}/${KEYS.length}`);
}
console.log(`\n  node tools/translate-status.mjs <lang>   what that language still needs`);
if (check && short) {
  console.log('\nAt least one language is incomplete.');
  process.exitCode = 1;
}
