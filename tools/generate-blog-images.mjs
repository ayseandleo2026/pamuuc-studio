// Generates the responsive derivatives for blog cover images.
//
// The site build is intentionally dependency-free, so this is NOT part of it.
// Run it by hand after adding or replacing a master image, then commit the
// output alongside the master:
//
//   npm install sharp && node tools/generate-blog-images.mjs
//
// Masters live at assets/images/blog/<slug>.jpg (plus a matching .webp) and
// stay untouched: they are the 1600w entry in every srcset, and the URL that
// og:image and the JSON-LD image field point at. This script only fills in the
// smaller widths beside them.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BLOG_IMAGES = path.join(ROOT, "assets", "images", "blog");

// Widths cover 1x and 2x for both layouts: cards render at roughly 390-580 CSS
// px in the 3-up grid and up to ~730 in the single-column phone layout, article
// covers at up to ~1060.
const WIDTHS = [480, 800, 1200];
const MASTER_WIDTH = 1600;
const JPEG_QUALITY = 80;
const WEBP_QUALITY = 78;

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error(
    "sharp is not installed. This tool is not part of the site build; run\n" +
      "  npm install sharp\n" +
      "and try again.",
  );
  process.exit(1);
}

function masters() {
  return fs
    .readdirSync(BLOG_IMAGES)
    .filter((name) => name.endsWith(".jpg") && !/-\d+\.jpg$/.test(name))
    .map((name) => path.join(BLOG_IMAGES, name));
}

const found = masters();
if (!found.length) {
  console.error(`No master images found in ${path.relative(ROOT, BLOG_IMAGES)}`);
  process.exit(1);
}

let written = 0;

for (const master of found) {
  const slug = path.basename(master, ".jpg");
  const meta = await sharp(master).metadata();

  if (meta.width !== MASTER_WIDTH) {
    console.warn(
      `${slug}.jpg is ${meta.width}px wide, expected ${MASTER_WIDTH}px. ` +
        "Derivatives are still generated, but check the srcset entries.",
    );
  }

  for (const width of WIDTHS) {
    if (width >= meta.width) continue;

    const pipeline = sharp(master).resize({ width, withoutEnlargement: true });

    const jpeg = path.join(BLOG_IMAGES, `${slug}-${width}.jpg`);
    await pipeline.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(jpeg);

    const webp = path.join(BLOG_IMAGES, `${slug}-${width}.webp`);
    await pipeline.clone().webp({ quality: WEBP_QUALITY }).toFile(webp);

    written += 2;
    const kb = (file) => `${Math.round(fs.statSync(file).size / 1024)}KB`;
    console.log(`  ${slug}-${width}  jpg ${kb(jpeg)}  webp ${kb(webp)}`);
  }
}

console.log(`\nWrote ${written} derivatives for ${found.length} master images.`);
