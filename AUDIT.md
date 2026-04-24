# Pamuuc Studio — Technical Audit

**Site:** studio.pamuuc.com (GitHub Pages, static, multilingual)
**Audited:** 24 April 2026
**Scope:** Code quality, SEO, accessibility, performance, security, i18n, forms, legal/compliance, CI/CD
**Depth:** Executive summary + prioritized fix plan

---

## TL;DR

The site is structurally solid — there's a clear design system, a real CSP, proper structured data, a well-marked-up form with a honeypot and consent checkbox, substantive GDPR legal pages, and sensible preconnect/preload hints. The main problems are concentrated in three areas:

1. **The German homepage is broken.** `/de/` is running on an older template — no Alpine/GSAP, a completely different (and simpler) form with inconsistent field names, and a visible bug where a large block of site copy is flattened into a single `<ul>` at `/de/#categories`. EN/ES/FR/IT share the current design system; DE does not.
2. **Multilingual SEO signals are inconsistent.** `hreflang="de"` is missing from every page except DE's own, canonicals for `/de` vs `/de/` are inconsistent, and the sitemap omits sectors, process, production, services (non-root), and every legal page.
3. **Images are enormous.** `assets/images/` is 11 MB; the hero/system/approach/continuity SVGs are 600–800 KB each because they contain base64-embedded raster images. The three blog JPEGs are 950 KB – 1.2 MB each. This will dominate LCP on mobile.

Everything else is polish, with two additional moderate concerns: a build script committed to the repo and deployed to GitHub Pages (`apply_copy_updates.py`), and CSS duplication across an inline critical block, `styles.css` (4,215 lines), and a modular `assets/css/` system.

---

## Findings by Severity

### Critical — fix first

**C1. `/de/index.html` is on a different, older template.**
- No Alpine, no GSAP, no CSP, no JSON-LD, no canonical with trailing slash, no structured data.
- The form is a different component entirely, with different `name` attributes (`team_size`, `project_type`, `message` instead of `team-size`, `project-type`, `brief`), no honeypot, no `aria-live` status region, and a `required` consent checkbox whose `<span>` has no link to the actual privacy/terms pages.
- `/de/#categories` contains a large `<ul class="clean-list">` that concatenates copy from the entire page (process phases, FAQ, team bios, contact copy, etc.) into a single flat list — looks like output from a broken build step in `apply_copy_updates.py`.
- Canonical is `https://studio.pamuuc.com/de` (no trailing slash) while ES/FR/IT canonicals all use the trailing slash form.

**C2. `hreflang` is broken across languages.**
- Homepage `/`, `/en/`, `/es/`, `/fr/`, `/it/` all declare alternates for EN/FR/IT/ES + x-default but **not DE**. Only `/de/index.html` itself references DE. This means Google will not reliably associate the German page with the rest of the language cluster.
- Same issue on legal pages: `/privacy-policy/`, `/cookie-policy/`, `/terms-and-conditions/`, `/legal-notice/` list EN/FR/IT/ES/x-default but no DE, even though `/de/privacy-policy/` etc. exist.
- `/de/privacy-policy/` includes hreflang for all five languages but is missing `x-default`.

**C3. Sitemap is incomplete.**
`sitemap.xml` contains home + services (in each language) and blog posts. It is missing:
- All sector pages (`/sectors/`, `/sectors/hotel-uniforms/`, etc. — 7 URLs).
- `/process/`, `/production/`.
- Every legal page (root and localized) — 20 URLs total.
- `/en/services/` (EN services under /en exists? — it doesn't; the EN services lives at `/services/`, which *is* included, fine).
- All entries lack `<lastmod>`, `<changefreq>`, and `<priority>`.

### High — material impact

**H1. Image weight — 11 MB of assets, 600 KB – 1.2 MB per hero image.**
- `hero-desktop.svg`, `hero-mobile.svg`, `system-desktop.svg`, `continuity-desktop.svg`, `approach-mobile.svg`, `project-multi-role-service-team.svg`: 629 KB – 782 KB each. Each is an SVG wrapper around base64-encoded raster data (grep confirmed `data:image` in every one). They offer none of SVG's benefits (scalability, gzip compression, DOM styling) and all of raster's drawbacks.
- Blog JPEGs `custom-hospitality-uniforms.jpg` (1.2 MB), `custom-dental-clinic-uniforms-barcelona.jpg` (1.2 MB), `wellness-studio-uniform-system.jpg` (948 KB) are not compressed or served as WebP/AVIF.
- `social-home-preview.png` (687 KB) is oversized for a social card; ~200 KB JPEG is sufficient.
- No `<picture>` with WebP source, no `loading="lazy"` audit, no `fetchpriority="high"` on hero.

**H2. `apply_copy_updates.py` is committed to the repo and deployed to GitHub Pages.**
- 31 KB Python script with `ROOT = Path("/Users/useraccount/Desktop/pamuuc-studio-redesign-feedback-v3")` and `COPY = Path("/Users/useraccount/Downloads")` hardcoded — useless on any other machine and leaks your local directory layout.
- `.github/workflows/deploy-pages.yml` uploads the entire repo root (`path: .`), so the script is served at `https://studio.pamuuc.com/apply_copy_updates.py`. I scanned it — no API keys, tokens, or credentials, so not a security incident, just repo hygiene plus a small information disclosure.

**H3. CSS — three overlapping systems.**
- Inline critical CSS in `<head>` (~8 KB) on every home page.
- `/styles.css` — 4,215 lines / 76 KB, unminified, contains `.merch-service-grid`, `.merch-pricing-grid`, `.merch-showcase-*` and similar classes that do not appear in **any** HTML in the repo (dead code).
- `/assets/css/base.css`, `components.css`, `layout.css`, `shared.css` + `/assets/css/pages/home.css` (modular system).
- It's unclear which is the source of truth; the modular files look like a refactor-in-progress. Every non-DE page loads both `/styles.css` and the modular files, duplicating resets and tokens.

**H4. CSP is weakened by `'unsafe-inline'` + `'unsafe-eval'`.**
- Root `index.html` line 58 allows `'unsafe-eval'` in `script-src` because Alpine.js 3 uses `new Function()` for `x-*` expressions.
- Other pages (e.g. `terms-and-conditions/index.html`) have a stricter CSP without `'unsafe-eval'` — fine, they don't use Alpine, so the policy is correct *there*.
- `'unsafe-inline'` is allowed for scripts on every page, which largely defeats CSP's XSS protection. This is a common compromise for static sites that use inline GA bootstrap, but it's worth flagging.
- Feasible fixes: pre-compile Alpine expressions (hard), or switch the home-page dynamic UI to a lighter framework-free implementation (moderate), or accept the trade-off and document it.

**H5. Canonical URL trailing-slash inconsistency.**
- `/de/index.html` canonical: `https://studio.pamuuc.com/de` (no slash).
- `/es/`, `/fr/`, `/it/` canonicals: `https://studio.pamuuc.com/es/` (with slash).
- GitHub Pages serves both `/de` and `/de/` (same page), but the canonical mismatch can confuse crawlers and split link equity.

**H6. `alpine-home.js` (17 KB) + Alpine CDN load on pages that don't use it.**
- `sectors/index.html`, `process/index.html`, `production/index.html` all load `assets/js/alpine-home.js` and the 35 KB Alpine CDN bundle. Grep of those pages for `x-data`, `@click`, `x-show` etc. suggests they don't actually bind any Alpine directives (confirmed for `services/index.html`, which correctly omits Alpine). ~50 KB of wasted JS per non-home page view.

### Medium — polish and maintainability

**M1. Formspree endpoint is public and discoverable.** Anyone can submit to `https://formspree.io/f/mlgpvble`. The honeypot (`sr-only` "website" input) is good; add Formspree's built-in reCAPTCHA or hCaptcha in the Formspree dashboard to harden against automated spam.

**M2. DE form is a separate, worse form.** Different field names break any downstream parsing (e.g., Zapier/CRM mapping) that expects consistent keys across submissions. Missing honeypot and no consent-link. Should be replaced with the same form component as ES/FR/IT.

**M3. Consent checkbox links are relative.** On `/index.html` line 913, the consent label links `href="privacy-policy/"` and `href="terms-and-conditions/"`. These resolve correctly from `/` but would break if the same form block were reused under a different path. Use absolute `/privacy-policy/` for safety.

**M4. Logo and favicon come from Shopify's CDN.**
- `https://cdn.shopify.com/.../Name_Logo_Red.png` (logo, every page).
- `https://cdn.shopify.com/.../Icon_Logo_Red.png` (favicon, every page — overrides the local `/favicon.svg`).
- External dependency on an unrelated vendor, extra DNS + TLS, and the files are cache-busted by Shopify's `?v=` query. You already have a local `/favicon.svg` (237 bytes) — use it and self-host the logo.

**M5. `social-home-preview.png` — 687 KB is large for Open Graph.** Target ~150–300 KB JPEG at 1200×630.

**M6. The `phone` field is `required` on the English form.** B2B prospects may prefer to leave it blank and be contacted by email. Consider removing the `required` attribute; leave the field, but let people submit without it.

**M7. `en/index.html` is a meta-refresh + `window.location.replace` redirect to `/`.** This works but adds a round-trip and a brief legal card flash. GitHub Pages doesn't natively support 301 redirects via `.htaccess`, but since you're already serving an HTML redirect, consider just deleting `/en/index.html` entirely — links point to `/` directly anyway.

**M8. No `og:locale` on root.** DE has `og:locale` `de_DE`; the other language homes don't. Add `og:locale` (e.g. `en`, `fr_FR`, etc.) and `og:locale:alternate` for siblings.

**M9. `web-vitals.attribution.js`** (11.5 KB) in `assets/vendor/` is fine to keep minified, but consider replacing it with the official package from a CDN via SRI if you can, or removing it entirely if you're not actually using the attribution data.

**M10. `404.html` is English-only.** A French visitor who mistypes a URL under `/fr/` gets an English 404. GH Pages uses a single global `/404.html`; one path is to detect `document.referrer` or the URL's language prefix in JS and swap copy, or simply include all five languages stacked on the page with CSS-only language-dir switching.

**M11. `.gitignore` doesn't exclude the build script or OS cruft** beyond `.DS_Store`. Add `apply_copy_updates.py`, `/.venv/`, `/__pycache__/`, `*.pyc`, `.idea/`, `.vscode/` as appropriate.

**M12. `robots.txt` is minimal.** Fine as-is, but consider explicit `Disallow: /apply_copy_updates.py` (belt-and-braces) until that file is removed. Once it's gone, robots.txt is fine.

### Low — minor

**L1.** `index.html` has three separate JSON-LD blocks (Organization, ProfessionalService, WebSite). `WebSite.inLanguage` lists `["en","fr","it","es"]` — add `"de"`.

**L2.** `autocomplete="on"` on the form element plus `autocomplete="name"` / `"email"` / `"tel"` / `"organization"` on fields is redundant; the field-level hints are what matter.

**L3.** The `<meta http-equiv="Content-Security-Policy">` tag is slightly less effective than a real HTTP header (doesn't apply to the initial parse). With GitHub Pages you can't set headers, so this is the best you can do — note it.

**L4.** The `<meta name="description">` on `/de/index.html` is substantive; good. But several localized services pages (e.g. `/es/services/`, `/fr/services/`, `/it/services/`) weren't sampled here — check they all have unique descriptions and not shared boilerplate.

**L5.** `script.js` at repo root is a 150-byte shim that dynamically imports `assets/js/main.js`. That extra round-trip could be eliminated by loading `assets/js/main.js` directly (or adding `<link rel="modulepreload" href="/assets/js/main.js">`).

**L6.** Consider adding a `security.txt` at `/.well-known/security.txt` with your disclosure email.

---

## What's Working Well

- Real, substantive GDPR privacy policy with company NIF, retention periods, Formspree disclosure, data subject rights.
- Proper CSP with `form-action https://formspree.io` lock-down and `upgrade-insecure-requests`.
- SRI integrity hashes on GSAP CDN scripts.
- Skip-link (`<a class="skip-link" href="#main">`), `aria-label` on brand, `aria-live="polite"` status region on the form.
- Honeypot, consent checkbox, input `type="email"`/`tel`/`datetime-local`, `autocomplete` hints.
- `.nojekyll` present; favicon `/favicon.svg` exists; CNAME configured.
- Preconnect + font preload with `print`-then-`all` pattern to avoid render-blocking.
- Three valid JSON-LD blocks for home page.
- `noindex,follow` on `404.html` (correct).
- GA consent model: cookie banner defaults to neither state; analytics only loads after accept.

---

## Prioritized Fix Plan

Effort estimates assume one engineer familiar with the codebase.

### Week 1 — Critical path (≈ 1–2 days)

| # | Action | Effort | Why |
|---|--------|--------|-----|
| 1 | **Regenerate `/de/index.html` from the same source/template as ES/FR/IT.** Remove the flattened `<ul class="clean-list">` data dump. Replace the separate DE form with the same component used elsewhere, ensuring field names match (`team-size`, `project-type`, `brief`, honeypot, consent link). Set canonical to `https://studio.pamuuc.com/de/` (with slash). | 3–4 h | C1 |
| 2 | **Add `hreflang="de"` alternate to root, `/en/`, `/es/`, `/fr/`, `/it/`** plus all localized legal pages. Add `x-default` to `/de/*`. | 1–2 h | C2 |
| 3 | **Rebuild `sitemap.xml`** to include sectors (7 URLs), process, production, all legal pages (×5 langs), `/de/services/`. Add `<lastmod>` for each. | 1 h | C3 |
| 4 | **Normalize trailing slashes** — canonicals, hreflang hrefs, sitemap entries, in-page links. Pick trailing-slash-everywhere and stick with it. | 1 h | H5 |

### Week 2 — High impact (≈ 2–3 days)

| # | Action | Effort | Why |
|---|--------|--------|-----|
| 5 | **Re-export the large SVGs as real SVG** (no embedded raster) *or* convert them to optimized JPEG/WebP and switch to `<picture>` with WebP+JPEG fallback. Target <200 KB per hero, <100 KB for project editorials. | 3–4 h | H1 |
| 6 | **Compress blog JPEGs to ≤250 KB** (quality 75–82, 1600 px max width) and generate WebP siblings. | 1 h | H1 |
| 7 | **Resize `social-home-preview.png`** to 1200×630 JPEG ≤ 300 KB. | 15 min | M5 |
| 8 | **Remove `apply_copy_updates.py` from the deployed artifact.** Two options: (a) move the script to a separate `scripts/` repo, (b) keep it in this repo but exclude from Pages upload by moving `.github/workflows/deploy-pages.yml` to use a subdirectory (`path: site/`) or by adding a build step that copies only shipped files to `_site/`. Either way, remove the hardcoded `/Users/useraccount/` paths — use `Path(__file__).resolve().parent`. | 1–2 h | H2 |
| 9 | **Stop loading `alpine-home.js` + Alpine CDN** on `sectors/`, `process/`, `production/`. Create a shared interactivity bundle for these pages if they need any JS, or drop Alpine entirely from them. | 1–2 h | H6 |

### Week 3 — Cleanup (≈ 2 days)

| # | Action | Effort | Why |
|---|--------|--------|-----|
| 10 | **Consolidate CSS.** Pick one system. Recommended: keep `/styles.css` as the single compiled/minified output, remove the modular `assets/css/` files (or keep them as source and compile to `styles.css` in CI), and purge `.merch-*` + any other unreferenced rules. Target: <35 KB minified. | 4–6 h | H3 |
| 11 | **Replace Shopify-hosted logo and favicon** with self-hosted files in `/assets/images/`. Remove the `cdn.shopify.com` `preconnect` and the CDN entry from CSP `img-src`. | 1 h | M4 |
| 12 | **Harden CSP on non-home pages.** The terms/privacy/cookie/legal pages don't need `'unsafe-eval'` (already correct) and might not need `'unsafe-inline'` for scripts if you move inline GA bootstrap to a nonce or external file. | 2 h | H4 |
| 13 | **Form UX polish.** Make `phone` optional; change consent-link `href`s to absolute paths; enable Formspree reCAPTCHA. | 30 min | M1–M3, M6 |
| 14 | **Delete `/en/index.html`** (or keep only if you have inbound links pointing at it). Update any internal references. | 15 min | M7 |
| 15 | **Add `og:locale` + `og:locale:alternate` to every page, add `"de"` to `WebSite.inLanguage`, add 404 localization.** | 1 h | M8, M10, L1 |
| 16 | **Tidy `.gitignore`**, add `security.txt`, document the CSP trade-off in the README. | 30 min | M11, L6 |

### Ongoing

- Add a simple pre-deploy check to CI that fails the build if (a) hreflang count per page < 6 (EN+FR+IT+ES+DE+x-default), (b) any image under `assets/images/` exceeds 300 KB, (c) sitemap URL count doesn't match the HTML-file count minus redirects. Catches regressions early.

---

## Quick Verification Checks You Can Run

```bash
# 1. Confirm DE is missing hreflang on root
grep -oE 'hreflang="[a-z-]+"' index.html | sort -u
# Expected: de, en, es, fr, it, x-default — currently missing 'de'

# 2. Find any image over 300KB
find assets/images -type f -size +300k -exec ls -lh {} \;

# 3. Confirm apply_copy_updates.py is deployed
# After next deploy: curl -I https://studio.pamuuc.com/apply_copy_updates.py
# Should eventually return 404, not 200

# 4. Verify sitemap coverage
# Count HTML files vs sitemap URLs
find . -name "index.html" -not -path "*/.git/*" | wc -l   # pages
grep -c "<loc>" sitemap.xml                                # sitemap entries
```

---

## Out of Scope for This Audit

- Live performance measurement (Lighthouse/WebPageTest) — recommended as a follow-up once images are optimized.
- Cross-browser rendering / visual regression.
- Content quality review (copy, tone, brand consistency).
- Analytics event taxonomy.
- E2E testing of form submission reaching the inbox.

If you'd like me to tackle any of these next, or start implementing the Week 1 fixes, just say the word.
