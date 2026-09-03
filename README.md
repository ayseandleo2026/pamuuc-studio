# PAMUUC | STUDIO — pamuuc-studio.com

Static site for a Barcelona uniform design and production studio, in five
languages. No framework, no build dependencies, no third-party request before
consent. Node 20+ is the only requirement.

```bash
node tools/build.mjs           # build the site into dist/
node tools/build.mjs --check   # audit only, writes nothing (runs in CI)
npx serve dist                 # preview at http://localhost:3000
```

`dist/` is generated and git-ignored. GitHub Actions builds it on every push to
`main` and deploys it to GitHub Pages.

## How the site is put together

```
content/            the only place words and URLs live
  site.json         locales, URL map, brand, endpoints, UI strings
  home.<loc>.json   the homepage, section by section, one file per language
  ui.<loc>.json     blog index and article chrome
  legal.<loc>.json  privacy, cookies, terms, legal notice
  posts/<key>.<loc>.md   one article: JSON front matter, "---", markdown body
src/                everything that is not words
  css/critical.css  inlined into every page (header + hero, ~5 KB)
  css/site.css      the whole stylesheet, deferred and cached site-wide
  js/site.js        nav, language menu, table of contents, form, consent
  fonts/            Gilmer, subset to latin — 19 KB a weight
  brand/            the icon, drawn through a CSS mask so it takes the ink colour
  images/           photography and blog covers
  static/           CNAME, .nojekyll, favicon, .well-known/security.txt
tools/build.mjs     the generator and the audit
```

**Adding or editing an article: read `BLOG-AUTHORING-GUIDE.md`.** It is written
to be followed literally, including by another model.

## What the generator guarantees

- **URLs.** `content/site.json` owns every URL. Canonicals, the hreflang cluster
  (five locales plus `x-default`), the sitemap's `xhtml:link` alternates, the RSS
  feeds and the internal links are all derived from it, so they cannot disagree.
- **Structured data.** One `@graph` per page. `Organization` and `Person` are
  declared once and referenced by `@id`; the homepage adds `Service` and
  `FAQPage`, the journal adds `Blog`, each article adds `BlogPosting` and
  `BreadcrumbList`.
- **No layout shift.** Every image is emitted with intrinsic `width`/`height` and
  a CSS `aspect-ratio` box.
- **Text width.** Set once in `site.css` through `--measure-title`,
  `--measure-lead` and `--measure-prose`. An inline `max-width` on a text block
  is reported by the audit.
- **Nothing third-party before consent.** Analytics loads only after an explicit
  opt-in, so a first visit makes zero external requests and the CSP needs no
  `unsafe-eval` and no inline script.

## The audit

`node tools/build.mjs --check` exits non-zero on:

- a canonical that does not match the page's own URL
- a missing, duplicated or mismatched `<html lang>` / `<h1>`
- an hreflang cluster missing a locale or `x-default`
- an indexable page that should be `noindex`, or the reverse
- an `<img>` without `alt`, `width` or `height`
- invalid JSON-LD
- a title under 15 characters or a meta description under 50
- an article whose `slug` disagrees with `content/site.json`
- unsupported markdown in an article body

It warns on over-long titles and descriptions, inline `max-width` on text, and
links to internal URLs the site does not publish.

## URLs

25 indexable, 5 `noindex` legal hubs, plus redirect stubs for the old policy
pages. The English homepage is at `/`; every other locale is prefixed. Blog paths
were kept exactly as they were, so nothing that was already indexed had to move.

```
/  /es/  /fr/  /it/  /de/                          5 homepages
/en/blog/  /es/blog/  /fr/blog/  /it/blog/  /de/blog/   5 journal indexes
/<loc>/blog/<slug>/ × 3 articles × 5 locales       15 articles
/legal/  /es/legal/  …                             5 hubs, noindex, not in the sitemap
```

## Conventions

- British English in the English copy; the studio's own wording in the other four.
- The brand is **PAMUUC | STUDIO** set in Gilmer Heavy. In prose it is written
  "Pamuuc Studio". The legal entity, "Pamuk Studio S.L", never changes.
- Minimum order quantity is **10 pieces per style**. If that changes it changes in
  `content/home.<loc>.json` for all five languages at once.
