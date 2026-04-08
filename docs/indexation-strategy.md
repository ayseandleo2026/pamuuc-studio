# Google Indexation Strategy

## Current diagnosis

As of April 8, 2026, the studio site is very new and is hosted on a separate subdomain: `https://studio.pamuuc.com/`.

The main issues identified in this repo were:

- The English homepage existed at both `/` and `/en/`, which split canonical signals.
- The sitemap listed legal and utility pages, even though those pages are not the URLs we want Google to prioritize.
- The site had very few index-worthy commercial URLs compared with the number of utility URLs.
- The parent domain `https://pamuuc.com/` does not appear to link prominently to the studio subdomain from its homepage, which weakens discovery and trust for a new subdomain.

Technical basics were already in good shape:

- `robots.txt` allows crawling.
- Canonical tags exist.
- `hreflang` tags exist.
- The live homepage and a live article both passed Lighthouse SEO checks on April 8, 2026.

## Rules now implemented in this repo

- `/` is the canonical English homepage.
- `/en/` is now a redirect-only alias that points to `/`.
- English legal aliases under `/en/` now redirect to the canonical root legal URLs.
- Legal pages default to `noindex,follow,max-image-preview:large`.
- `sitemap.xml` is now generated from [`_data/indexable_urls.yml`](/Users/useraccount/Desktop/pamuuc-studio-redesign-feedback-v3/_data/indexable_urls.yml) and only includes canonical URLs we actually want indexed.
- The sitemap now publishes `xhtml:link` alternates for each multilingual URL cluster.
- English internal links from blog pages now point to the canonical root homepage and root legal URLs instead of the old `/en/` aliases.

## Publishing workflow

When publishing a new indexable page:

1. Add a self-referencing canonical.
2. Add full `hreflang` annotations for every language variant, including `x-default` where appropriate.
3. Add the canonical URL to [`_data/indexable_urls.yml`](/Users/useraccount/Desktop/pamuuc-studio-redesign-feedback-v3/_data/indexable_urls.yml).
4. Make sure the page is linked from at least one crawlable `<a href="...">` link on an already indexed page.
5. Do not add legal, policy, redirect, thank-you, or other utility pages to the sitemap.

## Search Console workflow

After the next deploy:

1. Open Google Search Console for the exact property `https://studio.pamuuc.com/`.
2. Submit `https://studio.pamuuc.com/sitemap.xml`.
3. Inspect and request indexing for these URLs:
   - `https://studio.pamuuc.com/`
   - `https://studio.pamuuc.com/fr/`
   - `https://studio.pamuuc.com/it/`
   - `https://studio.pamuuc.com/es/`
   - `https://studio.pamuuc.com/en/blog/`
   - the three English blog posts
4. Recheck the Page indexing report 7 to 14 days later.
5. Compare which URLs are indexed against the sitemap list, not against utility pages.

## External actions still needed

These actions are outside this repository and still matter a lot:

- Add a prominent crawlable link from `https://pamuuc.com/` to `https://studio.pamuuc.com/`.
- Add supporting links from relevant Shopify pages or blog content on `pamuuc.com` to the studio homepage and the most important studio articles.
- If the studio is the long-term content hub, consider adding at least 3 to 6 more high-intent landing pages with their own URLs, not only modal content inside the homepage.

## Strategic recommendation

The current static build is not the problem by itself. A static site can index very well.

The better strategy is:

- keep the site static,
- keep `/` as the single English canonical homepage,
- keep language variants in `/fr/`, `/it/`, and `/es/`,
- keep the sitemap focused on canonical commercial and editorial URLs,
- grow the site with dedicated crawlable landing pages for service and sector intents.

If future growth requires many more multilingual landing pages, the next structural improvement should be moving repeated content blocks into Jekyll data and templates so new indexable pages can be added consistently without manual duplication.
