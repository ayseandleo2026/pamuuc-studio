# GitHub Pages Indexing Checklist

Last reviewed: `2026-04-22`

This checklist is the operating document for making `studio.pamuuc.com` consistently indexable while remaining on GitHub Pages.

## Why this matters

For this project, GitHub Pages hosting is not the indexing problem by itself. Google can index static Jekyll sites very well when:

- the live pages return `200`,
- the important pages contain indexable HTML content,
- the important pages are linked through crawlable `<a href="...">` links,
- canonicals and `hreflang` are consistent,
- the sitemap only contains canonical URLs,
- and the published site actually matches the repository.

The main failure mode on GitHub Pages is usually not hosting. It is letting content architecture, duplicate URLs, or publishing drift undermine otherwise valid pages.

## Technical launch checklist

### GitHub Pages deployment

- Set the repository Pages publishing source to `GitHub Actions`.
- Keep deployment on the dedicated workflow in [deploy-pages.yml](/Users/useraccount/Desktop/pamuuc-studio-redesign-feedback-v3/.github/workflows/deploy-pages.yml).
- Do not rely on manual branch publishing for the long term.
- Keep `bundle exec jekyll build` as the only source of deployed output.
- Make sure failed audits block deployment.

### URL architecture

- Keep `/` as the only canonical English homepage.
- Keep `/en/` only as a redirect alias to `/`.
- Keep pretty URLs for legal and landing pages.
- Use directory URLs such as `/sectors/hotel-uniforms/`, not mixed `.html` variants.
- Avoid publishing the same English content at multiple permanent URLs.

### Indexability

- Every indexable page must return `200`.
- Every indexable page must include a self-canonical absolute URL.
- Every indexable page must include `index,follow,max-image-preview:large`.
- Every legal or utility page must include `noindex,follow,max-image-preview:large`.
- Keep the `robots` and `googlebot` meta values aligned.

### Multilingual setup

- Home and blog clusters must keep reciprocal `hreflang`.
- Do not list non-existent translated URLs in `hreflang`.
- If a translated landing page does not exist yet, keep user navigation pointed somewhere useful, but do not claim a nonexistent SEO alternate.
- Keep `x-default` on the canonical English version for English-led clusters.

### Sitemap

- Only include canonical URLs that should be indexed.
- Do not include redirects.
- Do not include legal pages.
- Do not include the `/en/` alias homepage.
- Add every new canonical landing page to [`_data/indexable_urls.yml`](/Users/useraccount/Desktop/pamuuc-studio-redesign-feedback-v3/_data/indexable_urls.yml).

### Internal linking

- Important discovery paths must be real `<a href="...">` links.
- Do not leave core commercial content discoverable only through buttons and modal triggers.
- Link new landing pages from the homepage.
- Link related blog posts back to service or sector pages where relevant.
- Add at least one crawlable link from `https://pamuuc.com/` to `https://studio.pamuuc.com/`.

### Assets and rendering

- Keep image paths absolute or correctly relative.
- Avoid console errors on primary indexable pages.
- Do not rely on JavaScript-only content for essential SEO copy.
- Keep the main text content present in HTML before user interaction.

## Build checklist before every deploy

1. Run `bundle exec jekyll build`.
2. Run `ruby scripts/static_indexing_audit.rb _site`.
3. Spot-check the homepage, a sector page, a blog page, and a legal page locally.
4. Confirm the sitemap matches the intended canonical set.
5. Confirm there are no legacy `.html` legal links.

## Post-deploy checklist

1. Check `https://studio.pamuuc.com/`.
2. Check `https://studio.pamuuc.com/sitemap.xml`.
3. Check `https://studio.pamuuc.com/robots.txt`.
4. Check one new landing page such as `https://studio.pamuuc.com/sectors/hotel-uniforms/`.
5. Use Search Console URL Inspection on `/`, `/sectors/`, `/process/`, `/production/`, and the main sector pages.
6. Re-submit the sitemap.
7. Recheck the Page indexing report after 7 to 14 days.

## What not to do

- Do not add pages to the sitemap before they are live.
- Do not create URLs that only duplicate modal text without adding meaningful structure.
- Do not keep links pointing to deprecated URL variants.
- Do not assume GitHub Pages branch publishing is equivalent to a controlled build pipeline.
