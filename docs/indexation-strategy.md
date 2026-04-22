# Google Indexation Strategy

## Current diagnosis

As of April 22, 2026, the GitHub Pages stack is not the main reason the site has struggled to index. The stronger issue was architecture: too much of the site's real commercial intent lived inside homepage buttons and modal panels instead of on standalone URLs.

The main blockers identified in the repo and live structure were:

- the English homepage previously existed at both `/` and `/en/`, which split canonical signals
- legal and utility URLs had too much prominence relative to commercial pages
- key sector, process, and production topics existed mainly as interaction content instead of crawlable landing pages
- the studio subdomain is still relatively new and needs stronger internal and external linking support

Technical basics were already broadly sound:

- `robots.txt` allows crawling
- canonical tags exist
- `hreflang` tags exist for the multilingual home and blog clusters
- the site is static HTML-first, which is a strength for search rendering

## Rules now implemented in this repo

- `/` is the canonical English homepage.
- `/en/` is a redirect-only alias and is excluded from the canonical indexable set.
- Legal pages default to `noindex,follow,max-image-preview:large`.
- `sitemap.xml` is generated from [`_data/indexable_urls.yml`](/Users/useraccount/Desktop/pamuuc-studio-redesign-feedback-v3/_data/indexable_urls.yml) and only includes canonical URLs intended for indexing.
- The homepage now links with normal `<a href>` anchors to new landing pages for sectors, process, and production.
- New English landing pages now exist at:
  - `/sectors/`
  - `/sectors/hotel-uniforms/`
  - `/sectors/restaurant-uniforms/`
  - `/sectors/wellness-uniforms/`
  - `/sectors/medical-clinic-uniforms/`
  - `/sectors/service-team-uniforms/`
  - `/sectors/guest-service-uniforms/`
  - `/process/`
  - `/production/`
- The build now includes a deterministic static audit via [`scripts/static_indexing_audit.rb`](/Users/useraccount/Desktop/pamuuc-studio-redesign-feedback-v3/scripts/static_indexing_audit.rb) so canonical, robots, alternate, and internal-link regressions fail before deployment.
- GitHub Pages publishing is now defined through [`deploy-pages.yml`](/Users/useraccount/Desktop/pamuuc-studio-redesign-feedback-v3/.github/workflows/deploy-pages.yml) instead of relying on a looser branch-publish setup.

## Publishing workflow

When publishing a new indexable page:

1. Add a self-referencing canonical.
2. Add `hreflang` annotations only for true localized equivalents.
3. Add the canonical URL to [`_data/indexable_urls.yml`](/Users/useraccount/Desktop/pamuuc-studio-redesign-feedback-v3/_data/indexable_urls.yml).
4. Link the page from at least one already indexable page with a crawlable `<a href="...">`.
5. Exclude legal, redirect, thank-you, or utility pages from the sitemap.
6. Run the static audit locally or in CI before deployment.

## GitHub Pages operating model

For this project, the correct GitHub Pages approach is:

- keep the site static and server-rendered with Jekyll
- deploy through GitHub Actions, not by trusting ad hoc branch publishing
- keep the `CNAME` aligned with `studio.pamuuc.com`
- keep the custom domain verified in GitHub Pages settings
- let CI fail on broken canonicals, missing pages, or legacy URLs before a release goes live

This is the important distinction: GitHub Pages can host an indexable site well, but only if the content architecture, internal links, and deployment checks are clean.

## Search Console workflow

After the next deploy:

1. Open Google Search Console for the exact property `https://studio.pamuuc.com/`.
2. Submit `https://studio.pamuuc.com/sitemap.xml`.
3. Inspect and request indexing for these URLs first:
   - `https://studio.pamuuc.com/`
   - `https://studio.pamuuc.com/sectors/`
   - `https://studio.pamuuc.com/sectors/hotel-uniforms/`
   - `https://studio.pamuuc.com/process/`
   - `https://studio.pamuuc.com/production/`
   - `https://studio.pamuuc.com/en/blog/`
   - the three English blog posts
4. Recheck the Page indexing report 7 to 14 days later.
5. Compare indexed URLs against the sitemap set, not against legal or redirect pages.

## External actions still needed

These actions are outside the repo and still matter a lot:

- add a prominent crawlable link from `https://pamuuc.com/` to `https://studio.pamuuc.com/`
- add supporting links from relevant Shopify pages or editorial content on `pamuuc.com` to the new landing pages
- verify the custom domain in GitHub if it is not already verified
- keep HTTPS enforced in GitHub Pages settings

## Strategic recommendation

The right strategy is no longer "fix metadata and wait." The better model is:

- keep the current visual system
- keep the static Jekyll build
- keep `/` as the English canonical homepage
- keep `/fr/`, `/it/`, and `/es/` as multilingual homepage variants
- use the new English landing-page cluster for high-intent sector and commercial discovery
- expand localized landing pages only when there is real translated content to support them

If the site continues to grow, the next structural improvement should be moving the repeated landing-page content into Jekyll data so new sector or service pages can be published consistently without manual duplication.
