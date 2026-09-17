/* ============================================================================
   Pull the photography out of the mockup and into real files
   ---------------------------------------------------------------------------
   The suite mockup is an Artifact, and the Artifact CSP will not fetch an image
   from anywhere else — so every photograph in it is a base64 data URI inside a
   JavaScript file. Around 62MB of them. That is the right answer inside an
   Artifact and the wrong one on a website: a data URI cannot be cached, cannot
   be lazy-loaded, cannot be served smaller to a phone, and holds up first paint
   behind a JavaScript parse.

   So this reads the packs once and writes real files. It is a build tool rather
   than a one-off script because the mockup is still the source of the design:
   when a pack is regenerated, this runs again.

   Output
     src/images/catalogue/   the SKU shots — on-model, back, packshot
     src/images/merch/       editorial: heroes, sector photography, covers
     src/images/catalogue/manifest.json   key -> file, for the page builder

   Run:  node tools/extract-images.mjs [--dry]
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOCKUP = join(ROOT, 'mockup');
const DRY = process.argv.includes('--dry');

/* Which file holds what, and where each one lands. `names` are the bindings the
   pack creates; a pack may use `var`, a bare `const` or `window.X`, and the
   three are reached differently, so all three are tried for every name. */
/* `set` mirrors PACK_NAMES in the mockup's app.js — model / back / swatch /
   alt. It is not decoration: HEROALT and SWATCH both key an image as
   `PM-HOD-002_Black_packshot-front`, and the two are different photographs.
   The app tells them apart by which pack it looked in, so the files have to
   keep that distinction or 193 product pages get the wrong garment. */
const PACKS = [
  { file: 'photos.js',        names: ['PHOTOS'],      out: 'merch' },
  { file: 'home.js',          names: ['HOME_PHOTOS'], out: 'merch' },
  { file: 'merch-hero.js',    names: ['MERCH_HERO'],  out: 'merch', single: 'merch-hero' },
  { file: 'covers.js',        names: ['COVERS'],      out: 'merch', field: 'src', prefix: 'cover-' },
  { file: 'shots-model.js',   names: ['MODEL'],       out: 'catalogue', set: 'model' },
  { file: 'shots-model-1.js', names: ['MODEL_1'],     out: 'catalogue', set: 'model' },
  { file: 'shots-model-2.js', names: ['MODEL_2'],     out: 'catalogue', set: 'model' },
  { file: 'shots-back.js',    names: ['MODELB'],      out: 'catalogue', set: 'back' },
  { file: 'shots-swatch.js',  names: ['SWATCH'],      out: 'catalogue', set: 'swatch' },
  { file: 'shots-hero-alt.js',names: ['HEROALT'],     out: 'catalogue', set: 'alt' },
];

const EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif', 'image/svg+xml': 'svg',
};

/* A pack key is `PM-BDS-001_Blue_soul_studio-01` — SKU, colour, shot. It is
   already unique and already describes the file, so it becomes the filename
   almost as it stands. Lowercased, because a repo that is case-insensitive on
   a Mac and case-sensitive on the server is a class of bug not worth having. */
const slug = (k) => String(k)
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')      /* heroMobile -> hero-Mobile */
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-|-$/g, '');

function loadPack(file, names) {
  const src = readFileSync(join(MOCKUP, file), 'utf8');
  const ctx = {
    window: { addEventListener() {}, dispatchEvent() {} },
    CustomEvent: function () {},
    console: { log() {}, warn() {}, error() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  /* `var X` lands on the context, `const X` does not, and `window.X` lands on
     the window — so the pack is run with a tail expression that hands back
     whichever of the three exists. */
  const tail = `\n;({${names.map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : (window.${n} || null)`).join(', ')}});`;
  return vm.runInContext(src + tail, ctx, { filename: file });
}

function decode(uri) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
  if (!m) return null;
  return { mime: m[1], bytes: Buffer.from(m[2], 'base64') };
}


/* Pixel dimensions, straight out of the file's header. The build audit refuses
   an <img> without width and height — rightly: without them the page reflows
   as each photograph lands, and with 30 of them on a listing that is a visible
   lurch. Reading them here means reading each file once, ever, instead of on
   every build. */
function dimensions(buf, mime) {
  try {
    if (mime === 'image/jpeg' || mime === 'image/jpg') {
      let i = 2;                                   /* past SOI */
      while (i < buf.length) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const marker = buf[i + 1];
        /* SOF0-SOF15, excluding the four that are not frame headers */
        if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
          return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        }
        if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
        i += 2 + buf.readUInt16BE(i + 2);
      }
    }
    if (mime === 'image/webp') {
      /* RIFF....WEBP then one of three chunk layouts */
      const fmt = buf.toString('ascii', 12, 16);
      if (fmt === 'VP8 ') {
        return { w: buf.readUInt16LE(26) & 0x3FFF, h: buf.readUInt16LE(28) & 0x3FFF };
      }
      if (fmt === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3FFF) + 1, h: ((b >> 14) & 0x3FFF) + 1 };
      }
      if (fmt === 'VP8X') {
        return {
          w: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1,
          h: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1,
        };
      }
    }
    if (mime === 'image/png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch { /* a header we cannot read is reported, not guessed */ }
  return null;
}

const manifest = {};
const seen = new Map();          /* filename -> sha, to catch two packs colliding */
let written = 0, skipped = 0, b64Total = 0, fileTotal = 0;
const problems = [];

for (const pack of PACKS) {
  const path = join(MOCKUP, pack.file);
  if (!existsSync(path)) { problems.push(`${pack.file} is not there — skipped`); continue; }

  b64Total += statSync(path).size;
  const loaded = loadPack(pack.file, pack.names);

  for (const name of pack.names) {
    const obj = loaded[name];
    if (!obj) { problems.push(`${pack.file} defines no ${name}`); continue; }

    /* three shapes: a bare string, a flat map of strings, a map of records */
    const entries = pack.single
      ? [[pack.single, obj]]
      : Object.entries(obj).map(([k, v]) => [k, pack.field ? v && v[pack.field] : v]);

    for (const [key, value] of entries) {
      if (typeof value !== 'string' || !value.startsWith('data:')) continue;
      const img = decode(value);
      if (!img) { problems.push(`${name}.${key} is not base64`); continue; }

      const ext = EXT[img.mime] || 'bin';
      if (ext === 'bin') problems.push(`${name}.${key} has an unknown type ${img.mime}`);

      const file = `${(pack.prefix || '') + slug(key)}.${ext}`;
      const rel = pack.set ? `${pack.out}/${pack.set}/${file}` : `${pack.out}/${file}`;
      /* The manifest is keyed the way the app looks an image up: by set, then by
         the key the catalogue uses. The prefix belongs in the key as well as in
         the filename — COVERS and PHOTOS both hold a `hospitality` and a
         `wellness`, and without it the last pack read wins and two sector
         photographs quietly become blog cover art. */
      const mkey = (pack.set ? `${pack.set}/` : '') + (pack.prefix || '') + key;

      /* Two packs writing the same filename with different pictures would mean
         one silently replacing the other, and nobody would notice until a
         product page showed the wrong garment. */
      const sha = img.bytes.length + ':' + img.bytes.subarray(0, 64).toString('hex');
      if (seen.has(rel)) {
        if (seen.get(rel) !== sha) problems.push(`COLLISION: ${rel} written twice with different images (${name}.${key})`);
        skipped++;
        continue;
      }
      seen.set(rel, sha);

      if (manifest[mkey]) problems.push(`COLLISION: manifest key "${mkey}" written twice (${name}.${key})`);
      const dim = dimensions(img.bytes, img.mime);
      if (!dim) problems.push(`no dimensions readable from ${name}.${key} (${img.mime})`);
      manifest[mkey] = {
        file: rel, url: `/assets/images/${rel}`, bytes: img.bytes.length, pack: name,
        w: dim ? dim.w : null, h: dim ? dim.h : null,
      };
      fileTotal += img.bytes.length;

      if (!DRY) {
        const dest = join(ROOT, 'src/images', rel);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, img.bytes);
      }
      written++;
    }
  }
}

if (!DRY) {
  const dest = join(ROOT, 'src/images/catalogue/manifest.json');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(manifest, null, 1));
}

const mb = (n) => (n / 1048576).toFixed(1) + 'MB';
console.log(`${DRY ? '[dry run] ' : ''}${written} images written, ${skipped} duplicates skipped`);
console.log(`base64 in JavaScript: ${mb(b64Total)}   real files: ${mb(fileTotal)}   saved: ${mb(b64Total - fileTotal)}`);
if (!DRY) console.log(`manifest: src/images/catalogue/manifest.json (${Object.keys(manifest).length} keys)`);
if (problems.length) {
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems.slice(0, 40)) console.log('  ' + p);
  if (problems.length > 40) console.log(`  ... and ${problems.length - 40} more`);
  if (problems.some((p) => p.startsWith('COLLISION'))) process.exitCode = 1;
}
