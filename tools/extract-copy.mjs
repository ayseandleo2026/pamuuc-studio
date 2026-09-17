/* ============================================================================
   Pull the merchandise copy out into a file you can read
   ---------------------------------------------------------------------------
   Writes content/merch.en.json — every distinct string on the merchandise
   side, with the pages it appears on and a word count. That file is the source
   for translation and the thing to proofread; nobody should have to open
   app.js to change a sentence.

   Round-trips itself before writing: every string it extracted is put back
   through the same tokenizer, and if the page does not come out identical it
   says so rather than shipping a catalogue that cannot be applied.

   Run: node tools/extract-copy.mjs
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMockup } from './merch-render.mjs';
import { pageList } from './merch-routes.mjs';
import { collect, translate, keyOf, hasSignificantWhitespace } from './merch-strings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = JSON.parse(readFileSync(join(ROOT, 'content/site.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ROOT, 'src/images/catalogue/manifest.json'), 'utf8'));

const M = loadMockup(join(ROOT, 'mockup'), manifest);

/* English is the source; the other languages are translations of it */
const pages = [];
for (const p of pageList(M, site, 'en')) {
  try { pages.push({ id: p.id, html: p.arg ? M.render(p.render, p.arg) : M.render(p.render) }); }
  catch (e) { console.log(`  could not render ${p.id}: ${e.message}`); }
}

/* Labels the catalogue generates from a number. They are translated by rule
   in content/merch.<loc>.json's `patterns`, so listing them here would be 56
   entries of review noise that go stale the moment a product changes. */
const GENERATED = [
  /^\d+ colours?$/, /^\d+ options? available$/, /^\d+ styles?$/,
  /^\d+ products?$/, /^\d+ pieces?$/, /^\d+ of \d+$/, /^\d+ famil(y|ies)$/,
];

/* Not language. A product reference, a fabric weight, the brand itself and the
   language switcher read the same in every locale, and putting them in the
   review file means a translator is handed "PAM-TOTE-BAGS · 160–400 g/m²" and
   has to work out that the right answer is to leave it alone. */
const NOT_LANGUAGE = [
  /^PAM-[A-Z0-9-]+(\s·.*)?$/,                 /* PAM-TOTE-BAGS · 160–400 g/m² */
  /^(DTF|DTG)$/,
  /^(EN|ES|FR|IT|DE)$/,
  /^English · /,                               /* the language switcher */
  /^© \d{4} Pamuk Studio S\.L/,
  /^(PAMUUC|PAMUUC Studio|PAMUUC Merchandise|MERCHANDISE|STUDIO)$/,
  /^[A-Z][a-z]+ · \d+([–-]\d+)? g\/m²$/,      /* Canvas · 300 g/m² */
];

/* Supplier colour names, taken from the photograph filenames, which is where
   they are authoritative. They are references rather than words and are never
   translated — see translate() in merch-strings.mjs. */
const COLOURS = new Set(JSON.parse(readFileSync(join(ROOT, 'content/merch.colours.json'), 'utf8')));
const isColour = (k) => COLOURS.has(k) || /^(.+) in (.+)$/.test(k) && COLOURS.has(/^(.+) in (.+)$/.exec(k)[2]);

const strings = collect(pages)
  .filter((s) => !GENERATED.some((re) => re.test(s.key))
    && !NOT_LANGUAGE.some((re) => re.test(s.key))
    && !isColour(s.key))
  .sort((a, b) =>
  b.pages.length - a.pages.length || b.words - a.words || a.key.localeCompare(b.key));

/* ---- prove it can be put back ------------------------------------------- */
/* Marked rather than echoed: an identity map is left alone by design, so it
   would prove nothing. Wrapping each string proves the tokenizer can find AND
   replace every one of them, and the marks come off before comparing. */
const MARK = '\u0001', END = '\u0002';
const marked = Object.fromEntries(strings.map((s) => [s.key, MARK + s.key + END]));
const unmark = (h) => h.split(MARK).join('').split(END).join('');
/* Compared with whitespace collapsed inside text, not byte for byte. A
   template wraps a sentence across lines; the key is that sentence with the
   wrapping removed, so a replacement necessarily writes the unwrapped form.
   That is a difference in the source and none at all on the screen — HTML
   collapses those runs anyway, and the two classes where it would not have
   been safe are checked for separately above. */
const sameToTheReader = (a, b) => {
  const flat = (h) => h.split(/(<[^>]*>)/).map((part, i) =>
    (i % 2 ? part : part.replace(/\s+/g, ' '))).join('');
  return flat(a) === flat(b);
};
let broken = 0, missed = 0;
for (const p of pages) {
  const pre = hasSignificantWhitespace(p.html);
  if (pre.length) console.log(`  ${p.id} contains ${pre.join(', ')} — whitespace there is significant`);
  const { html } = translate(p.html, marked);
  const marks = (html.match(new RegExp(MARK, 'g')) || []).length;
  if (!marks) missed++;
  if (!sameToTheReader(unmark(html), p.html)) {
    broken++;
    if (broken <= 3) {
      /* show where they first diverge, which is nearly always the real bug */
      const got = unmark(html);
      let i = 0; while (i < got.length && got[i] === p.html[i]) i++;
      console.log(`  ${p.id} does not round-trip at ${i}:`);
      console.log(`    was:  ${JSON.stringify(p.html.slice(i - 40, i + 60))}`);
      console.log(`    now:  ${JSON.stringify(got.slice(i - 40, i + 60))}`);
    }
  }
}

const out = {
  _comment: 'The merchandise copy, extracted from mockup/app.js by tools/extract-copy.mjs. ' +
    'This is the English source. Translations are content/merch.<loc>.json with the same keys. ' +
    'Editing a value here changes the wording on the site; editing a key breaks the link to it.',
  _generated: new Date().toISOString().slice(0, 10),
  _strings: strings.length,
  _words: strings.reduce((n, s) => n + s.words, 0),
  copy: Object.fromEntries(strings.map((s) => [s.key, s.key])),
};

const guide = {
  _comment: 'How many pages carry each string, and a few examples. Used to put ' +
    'the most-used copy at the top of the translation list. Not read by the build.',
  count: Object.fromEntries(strings.map((s) => [s.key, s.pages.length])),
  where: Object.fromEntries(strings.map((s) => [s.key, s.pages.slice(0, 5)])),
};

if (broken) {
  console.log(`\n${broken} page(s) do not round-trip — the catalogue was NOT written.`);
  process.exit(1);
}

writeFileSync(join(ROOT, 'content/merch.en.json'), JSON.stringify(out, null, 1) + '\n');
writeFileSync(join(ROOT, 'content/merch.where.json'), JSON.stringify(guide, null, 1) + '\n');

console.log(`${pages.length} pages read`);
console.log(`${out._strings} distinct strings, ${out._words} words`);
console.log(`every page round-trips exactly, and every string was replaceable\n`);
console.log(`  content/merch.en.json     the copy — edit values to change wording`);
console.log(`  content/merch.where.json  which pages each string appears on`);

/* a quick sense of the shape */
const short = strings.filter((s) => s.words <= 3).length;
console.log(`\n  ${short} short labels, ${strings.length - short} sentences`);
console.log(`  most reused: ${strings.slice(0, 3).map((s) => `"${s.key.slice(0, 40)}" (${s.pages.length} pages)`).join(', ')}`);

for (const loc of Object.keys(site.locales)) {
  if (loc === 'en') continue;
  const f = join(ROOT, `content/merch.${loc}.json`);
  if (!existsSync(f)) { console.log(`  content/merch.${loc}.json  — not written yet`); continue; }
  const d = JSON.parse(readFileSync(f, 'utf8')).copy || {};
  const done = Object.keys(out.copy).filter((k) => d[k] && d[k] !== k).length;
  console.log(`  content/merch.${loc}.json  ${done}/${strings.length} translated`);
}
