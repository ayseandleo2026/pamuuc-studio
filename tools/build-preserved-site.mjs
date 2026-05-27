import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const BASE_URL = "https://pamuuc-studio.com";
const LASTMOD = "2026-05-27";
const SHOPIFY_FILES_URL = "https://cdn.shopify.com/s/files/1/0577/3688/8485/files";
const FONTS_DIR = path.join(DIST, "assets", "fonts");
const FAVICON_URL = `${SHOPIFY_FILES_URL}/Icon_Logo_Red.png?v=1772224283`;

const fontAssets = [
  {
    family: "Gilmer",
    label: "Light",
    weight: "300",
    fileName: "Gilmer-Light.woff2",
    url: `${SHOPIFY_FILES_URL}/Gilmer_Light.woff?v=1712156359`,
  },
  {
    family: "Gilmer",
    label: "Regular",
    weight: "400",
    fileName: "Gilmer-Regular.woff2",
    url: `${SHOPIFY_FILES_URL}/Gilmer_Regular.woff?v=1712156359`,
  },
  {
    family: "Gilmer",
    label: "Bold",
    weight: "700",
    fileName: "Gilmer-Bold.woff2",
    url: `${SHOPIFY_FILES_URL}/Gilmer_Bold.woff?v=1712156359`,
  },
  {
    family: "Gilmer",
    label: "Heavy",
    weight: "800",
    fileName: "Gilmer-Heavy.woff2",
    url: `${SHOPIFY_FILES_URL}/Gilmer_Heavy.woff?v=1712156359`,
  },
  {
    family: "Gilmer",
    label: "Heavy",
    weight: "900",
    fileName: "Gilmer-Heavy.woff2",
    url: `${SHOPIFY_FILES_URL}/Gilmer_Heavy.woff?v=1712156359`,
    duplicateFaceOnly: true,
  },
];

const indexableRoutes = [
  "/",
  "/fr/",
  "/it/",
  "/es/",
  "/de/",
  "/en/blog/",
  "/en/blog/custom-dental-clinic-uniforms-barcelona/",
  "/en/blog/custom-hospitality-uniforms/",
  "/en/blog/wellness-studio-uniform-system/",
  "/fr/blog/",
  "/fr/blog/uniformes-clinique-dentaire-sur-mesure-barcelone/",
  "/fr/blog/uniformes-hotellerie-personnalises/",
  "/fr/blog/uniformes-studios-bien-etre/",
  "/it/blog/",
  "/it/blog/divise-clinica-dentale-personalizzate-barcellona/",
  "/it/blog/divise-hospitalita-personalizzate/",
  "/it/blog/divise-studi-benessere/",
  "/es/blog/",
  "/es/blog/uniformes-clinica-dental-personalizados-barcelona/",
  "/es/blog/uniformes-hosteleria-personalizados/",
  "/es/blog/uniformes-estudios-bienestar/",
  "/de/blog/",
  "/de/blog/uniformen-zahnarztpraxen-barcelona/",
  "/de/blog/uniformen-hotellerie/",
  "/de/blog/uniformen-wellness-studios/",
];

const legalRouteBases = [
  "/privacy-policy/",
  "/cookie-policy/",
  "/terms-and-conditions/",
  "/legal-notice/",
];

const languages = ["en", "fr", "it", "es", "de"];
const localizedLanguages = ["fr", "it", "es", "de"];

const blogClusters = [
  {
    routes: {
      en: "/en/blog/",
      fr: "/fr/blog/",
      it: "/it/blog/",
      es: "/es/blog/",
      de: "/de/blog/",
    },
  },
  {
    routes: {
      en: "/en/blog/custom-dental-clinic-uniforms-barcelona/",
      fr: "/fr/blog/uniformes-clinique-dentaire-sur-mesure-barcelone/",
      it: "/it/blog/divise-clinica-dentale-personalizzate-barcellona/",
      es: "/es/blog/uniformes-clinica-dental-personalizados-barcelona/",
      de: "/de/blog/uniformen-zahnarztpraxen-barcelona/",
    },
  },
  {
    routes: {
      en: "/en/blog/custom-hospitality-uniforms/",
      fr: "/fr/blog/uniformes-hotellerie-personnalises/",
      it: "/it/blog/divise-hospitalita-personalizzate/",
      es: "/es/blog/uniformes-hosteleria-personalizados/",
      de: "/de/blog/uniformen-hotellerie/",
    },
  },
  {
    routes: {
      en: "/en/blog/wellness-studio-uniform-system/",
      fr: "/fr/blog/uniformes-studios-bien-etre/",
      it: "/it/blog/divise-studi-benessere/",
      es: "/es/blog/uniformes-estudios-bienestar/",
      de: "/de/blog/uniformen-wellness-studios/",
    },
  },
];

const localizedBlogSlugs = {
  fr: {
    "custom-dental-clinic-uniforms-barcelona": "uniformes-clinique-dentaire-sur-mesure-barcelone",
    "custom-hospitality-uniforms": "uniformes-hotellerie-personnalises",
    "wellness-studio-uniform-system": "uniformes-studios-bien-etre",
  },
  it: {
    "custom-dental-clinic-uniforms-barcelona": "divise-clinica-dentale-personalizzate-barcellona",
    "custom-hospitality-uniforms": "divise-hospitalita-personalizzate",
    "wellness-studio-uniform-system": "divise-studi-benessere",
  },
  es: {
    "custom-dental-clinic-uniforms-barcelona": "uniformes-clinica-dental-personalizados-barcelona",
    "custom-hospitality-uniforms": "uniformes-hosteleria-personalizados",
    "wellness-studio-uniform-system": "uniformes-estudios-bienestar",
  },
  de: {
    "custom-dental-clinic-uniforms-barcelona": "uniformen-zahnarztpraxen-barcelona",
    "custom-hospitality-uniforms": "uniformen-hotellerie",
    "wellness-studio-uniform-system": "uniformen-wellness-studios",
  },
};

const rootFiles = [
  "index.html",
  "404.html",
  "CNAME",
  ".nojekyll",
  "favicon.svg",
  "robots.txt",
  "styles.css",
  "script.js",
];

const rootDirectories = [
  "assets",
  ".well-known",
  "fr",
  "it",
  "es",
  "de",
  "privacy-policy",
  "cookie-policy",
  "terms-and-conditions",
  "legal-notice",
];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function shouldCopy(src) {
  const rel = toPosix(path.relative(ROOT, src));
  const name = path.basename(src);

  if (name === ".DS_Store") return false;
  if (rel === "assets/images/blog/README.md") return false;
  if (rel === "en/index.html") return false;
  return true;
}

function copyPath(sourceRelative, destinationRelative = sourceRelative) {
  const source = path.join(ROOT, sourceRelative);
  const destination = path.join(DIST, destinationRelative);
  if (!fs.existsSync(source)) return;

  fs.cpSync(source, destination, {
    recursive: true,
    filter: shouldCopy,
  });
}

function routeToFile(route) {
  if (route === "/") return path.join(DIST, "index.html");
  return path.join(DIST, route.replace(/^\//, ""), "index.html");
}

function walkFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolute, predicate));
    } else if (predicate(absolute)) {
      files.push(absolute);
    }
  }

  return files;
}

function writeRobots() {
  fs.writeFileSync(
    path.join(DIST, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`,
  );
}

function writeSitemap() {
  const urls = indexableRoutes
    .map((route) => `  <url><loc>${BASE_URL}${route}</loc><lastmod>${LASTMOD}</lastmod></url>`)
    .join("\n");

  fs.writeFileSync(
    path.join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1024) {
    throw new Error(`Downloaded asset is unexpectedly small: ${url}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, buffer);
}

async function installSelfHostedBrandAssets() {
  fs.mkdirSync(FONTS_DIR, { recursive: true });

  for (const font of fontAssets) {
    if (font.duplicateFaceOnly) continue;
    await downloadFile(font.url, path.join(FONTS_DIR, font.fileName));
  }

  await downloadFile(FAVICON_URL, path.join(DIST, "favicon.png"));

  const fontFaces = fontAssets
    .map(
      (font) => `@font-face {
  font-family: "${font.family}";
  src: url("./${font.fileName}") format("woff2");
  font-weight: ${font.weight};
  font-style: normal;
  font-display: swap;
}`,
    )
    .join("\n\n");

  fs.writeFileSync(
    path.join(FONTS_DIR, "fonts.css"),
    `${fontFaces}\n\n:root {
  font-family: "Gilmer", Arial, Helvetica, sans-serif;
}\n`,
  );
}

function patchBlogAlternates() {
  const alternateLinkPattern = /<link\b(?=[^>]*\brel=["']alternate["'])(?=[^>]*\bhreflang=)[^>]*>\s*/g;
  const canonicalLinkPattern = /(<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\/?>)/;

  for (const cluster of blogClusters) {
    const alternates = [
      ...languages.map(
        (lang) =>
          `<link href="${BASE_URL}${cluster.routes[lang]}" hreflang="${lang}" rel="alternate"/>`,
      ),
      `<link href="${BASE_URL}${cluster.routes.en}" hreflang="x-default" rel="alternate"/>`,
    ].join("\n");

    for (const route of Object.values(cluster.routes)) {
      const file = routeToFile(route);
      let html = fs.readFileSync(file, "utf8");
      html = html.replace(alternateLinkPattern, "");
      if (!canonicalLinkPattern.test(html)) {
        throw new Error(`Missing canonical link in ${toPosix(path.relative(ROOT, file))}`);
      }
      html = html.replace(canonicalLinkPattern, `$1\n${alternates}`);
      fs.writeFileSync(file, html);
    }
  }
}

function injectFontsCss(html) {
  if (html.includes("/assets/fonts/fonts.css")) return html;

  const fontLink = '<link href="/assets/fonts/fonts.css" rel="stylesheet"/>\n';
  const stylesheetPattern =
    /(<link\b(?=[^>]*\brel=["'](?:preload|stylesheet)["'])(?=[^>]*\bhref=["'][^"']*(?:styles\.css|assets\/css\/shared\.css))[^>]*>)/i;

  if (stylesheetPattern.test(html)) {
    return html.replace(stylesheetPattern, `${fontLink}$1`);
  }

  return html.replace("</head>", `${fontLink}</head>`);
}

function removeGoogleFonts(html) {
  return html
    .replace(/<noscript>\s*<link\b(?=[^>]*\bhref=["']https:\/\/fonts\.googleapis\.com)[\s\S]*?<\/noscript>\s*/gi, "")
    .replace(/<link\b(?=[^>]*\bhref=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com)[^>]*>\s*/gi, "");
}

function patchHeadAssets(html) {
  return injectFontsCss(
    removeGoogleFonts(html)
      .replace(/<link\b(?=[^>]*\brel=["'](?:shortcut\s+)?icon["'])[^>]*>\s*/gi, '<link href="/favicon.png" rel="icon" type="image/png"/>\n')
      .replaceAll(" https://fonts.googleapis.com", "")
      .replaceAll(" https://fonts.gstatic.com", "")
      .replaceAll("Poppins", "Gilmer"),
  );
}

function localizedRouteForEnglishRoute(englishRoute, language) {
  if (!language || language === "en") return englishRoute;
  if (englishRoute === "/en/blog/") return `/${language}/blog/`;

  const cluster = blogClusters.find((candidate) => candidate.routes.en === englishRoute);
  return cluster?.routes[language] ?? englishRoute;
}

function patchJsonLdRouteStrings(html, language) {
  if (!language || language === "en") return html;

  return html.replace(
    /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/g,
    (full, rawJson) => {
      let data;
      try {
        data = JSON.parse(rawJson);
      } catch {
        return full;
      }

      const replaceValue = (value) => {
        if (typeof value === "string" && value.startsWith(BASE_URL)) {
          const url = new URL(value);
          const localizedRoute = localizedRouteForEnglishRoute(url.pathname, language);
          return `${BASE_URL}${localizedRoute}`;
        }

        if (Array.isArray(value)) return value.map(replaceValue);

        if (value && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [key, replaceValue(nestedValue)]),
          );
        }

        return value;
      };

      const patched = JSON.stringify(replaceValue(data), null, 2).replaceAll("<", "\\u003c");
      return `<script type="application/ld+json">\n${patched}\n</script>`;
    },
  );
}

function patchGeneratedHtml() {
  const htmlFiles = walkFiles(DIST, (file) => file.endsWith(".html"));

  for (const file of htmlFiles) {
    let html = fs.readFileSync(file, "utf8");
    const original = html;
    const relative = toPosix(path.relative(DIST, file));
    const language = localizedLanguages.find((lang) => relative.startsWith(`${lang}/`));
    const prefix = language ? `/${language}` : "";
    const inLegalPage = legalRouteBases.some((routeBase) =>
      relative === routeBase.replace(/^\//, "") + "index.html" ||
      localizedLanguages.some((lang) => relative === `${lang}${routeBase}index.html`),
    );

    html = html
      .replaceAll("https://studio.pamuuc.com", BASE_URL)
      .replaceAll("https://www.pamuuc-studio.com", BASE_URL)
      .replaceAll('href="/legal/"', 'href="/legal-notice/"');
    html = patchHeadAssets(html);

    if (inLegalPage) {
      const homeHref = prefix ? `${prefix}/` : "/";
      html = html.replaceAll('href="./"', `href="${homeHref}"`);
      html = html.replaceAll('href="en/blog/"', `href="${prefix ? `${prefix}/blog/` : "/en/blog/"}"`);

      for (const routeBase of legalRouteBases) {
        const bare = routeBase.replace(/^\//, "");
        html = html.replaceAll(`href="${bare}"`, `href="${prefix}${routeBase}"`);
      }
    }

    if (language && relative.includes("/blog/")) {
      for (const [englishSlug, localizedSlug] of Object.entries(localizedBlogSlugs[language] ?? {})) {
        html = html.replaceAll(`../${englishSlug}/`, `../${localizedSlug}/`);
      }
      html = patchJsonLdRouteStrings(html, language);
    }

    if (html !== original) {
      fs.writeFileSync(file, html);
    }
  }

  patchBlogAlternates();
}

function patchCssAssets() {
  const cssFiles = walkFiles(DIST, (file) => file.endsWith(".css"));

  for (const file of cssFiles) {
    const css = fs.readFileSync(file, "utf8");
    const patched = css.replaceAll("Poppins", "Gilmer");
    if (patched !== css) {
      fs.writeFileSync(file, patched);
    }
  }
}

async function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  for (const file of rootFiles) copyPath(file);
  for (const directory of rootDirectories) copyPath(directory);

  fs.mkdirSync(path.join(DIST, "en"), { recursive: true });
  copyPath("en/blog", "en/blog");

  await installSelfHostedBrandAssets();
  writeRobots();
  writeSitemap();
  patchGeneratedHtml();
  patchCssAssets();
}

function resolveSitePath(fromFile, rawTarget) {
  if (!rawTarget || rawTarget.startsWith("#")) return null;
  if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(rawTarget)) return null;

  const target = rawTarget.split("#")[0].split("?")[0];
  if (!target) return null;

  if (target.startsWith("/")) {
    return path.posix.normalize(target);
  }

  const relativeFromDist = toPosix(path.relative(DIST, fromFile));
  const currentRoute = `/${path.posix.dirname(relativeFromDist)}/`;
  return path.posix.normalize(path.posix.join(currentRoute, target));
}

function sitePathExists(sitePath) {
  if (!sitePath || sitePath === "/") return fs.existsSync(path.join(DIST, "index.html"));

  const clean = sitePath.replace(/^\//, "");
  const asFile = path.join(DIST, clean);
  const asIndex = path.join(DIST, clean, "index.html");

  return fs.existsSync(asFile) || fs.existsSync(asIndex);
}

function validateInternalLinks() {
  const missing = [];
  const htmlFiles = walkFiles(DIST, (file) => file.endsWith(".html"));
  const attributePattern = /\b(?:href|src|action)=["']([^"']+)["']/g;

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    let match;
    while ((match = attributePattern.exec(html))) {
      const sitePath = resolveSitePath(file, match[1]);
      if (sitePath && !sitePathExists(sitePath)) {
        missing.push(`${toPosix(path.relative(DIST, file))} -> ${match[1]}`);
      }
    }
  }

  if (missing.length) {
    throw new Error(`Broken internal targets:\n${missing.slice(0, 40).join("\n")}`);
  }
}

function validate() {
  const failures = [];

  if (fs.existsSync(path.join(DIST, "en", "index.html"))) {
    failures.push("dist/en/index.html should not exist; / is the English canonical homepage.");
  }

  for (const unwanted of walkFiles(DIST, (file) => path.basename(file) === ".DS_Store")) {
    failures.push(`Unwanted macOS file copied: ${toPosix(path.relative(DIST, unwanted))}`);
  }

  for (const font of fontAssets.filter((asset) => !asset.duplicateFaceOnly)) {
    if (!fs.existsSync(path.join(FONTS_DIR, font.fileName))) {
      failures.push(`Self-hosted font missing: ${font.fileName}`);
    }
  }

  if (!fs.existsSync(path.join(FONTS_DIR, "fonts.css"))) {
    failures.push("Self-hosted font stylesheet missing: assets/fonts/fonts.css");
  }

  if (!fs.existsSync(path.join(DIST, "favicon.png"))) {
    failures.push("Downloaded PNG favicon missing: favicon.png");
  }

  const deployedTextFiles = walkFiles(DIST, (file) => /\.(?:html|css|js|xml|txt)$/i.test(file));
  for (const file of deployedTextFiles) {
    const contents = fs.readFileSync(file, "utf8");
    if (/fonts\.(?:googleapis|gstatic)\.com/i.test(contents)) {
      failures.push(`Google Fonts dependency remains in ${toPosix(path.relative(DIST, file))}`);
    }
  }

  for (const route of indexableRoutes) {
    const file = routeToFile(route);
    if (!fs.existsSync(file)) {
      failures.push(`Sitemap route missing a file: ${route}`);
      continue;
    }
    const html = fs.readFileSync(file, "utf8");
    if (/noindex/i.test(html.match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0] ?? "")) {
      failures.push(`Indexable route has noindex robots meta: ${route}`);
    }
    if (!html.includes(`<link href="${BASE_URL}${route}" rel="canonical"`)) {
      failures.push(`Indexable route canonical mismatch: ${route}`);
    }
  }

  const sitemap = fs.readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  if (sitemapUrls.length !== indexableRoutes.length) {
    failures.push(`Sitemap should contain ${indexableRoutes.length} URLs, found ${sitemapUrls.length}.`);
  }

  for (const route of indexableRoutes) {
    if (!sitemapUrls.includes(`${BASE_URL}${route}`)) {
      failures.push(`Sitemap missing indexable route: ${route}`);
    }
  }

  for (const url of sitemapUrls) {
    if (legalRouteBases.some((routeBase) => url.includes(routeBase))) {
      failures.push(`Policy/legal URL should not be in sitemap: ${url}`);
    }
  }

  for (const routeBase of legalRouteBases) {
    for (const route of [routeBase, ...localizedLanguages.map((lang) => `/${lang}${routeBase}`)]) {
      const file = routeToFile(route);
      if (!fs.existsSync(file)) {
        failures.push(`Policy/legal page missing: ${route}`);
        continue;
      }
      const robotsMeta = fs
        .readFileSync(file, "utf8")
        .match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0];
      if (!robotsMeta || !/noindex/i.test(robotsMeta)) {
        failures.push(`Policy/legal page must be noindex: ${route}`);
      }
    }
  }

  for (const cluster of blogClusters) {
    for (const route of Object.values(cluster.routes)) {
      const html = fs.readFileSync(routeToFile(route), "utf8");
      for (const lang of [...languages, "x-default"]) {
        if (!html.includes(`hreflang="${lang}"`)) {
          failures.push(`Blog route missing hreflang ${lang}: ${route}`);
        }
      }
    }
  }

  validateInternalLinks();

  if (failures.length) {
    throw new Error(`Build validation failed:\n${failures.join("\n")}`);
  }

  console.log(`Built preserved Pamuuc Studio site in dist/`);
  console.log(`Indexable URLs: ${indexableRoutes.length}`);
  console.log(`Noindex policy/legal pages: ${legalRouteBases.length * (localizedLanguages.length + 1)}`);
  console.log(`Self-hosted fonts: ${fontAssets.filter((asset) => !asset.duplicateFaceOnly).length}`);
}

await build();
validate();
