# SEO Playbook

Last reviewed: `2026-03-27`

This file captures the current SEO operating model for `studio.pamuuc.com` and the main learnings from the latest audit.

## Current indexable scope

The intended public indexable set is:

- Homepages:
  - `/`
  - `/en/`
  - `/fr/`
  - `/it/`
  - `/es/`
- Blog indexes:
  - `/en/blog/`
  - `/fr/blog/`
  - `/it/blog/`
  - `/es/blog/`
- Blog articles:
  - 3 per language at the moment
- Legal pages:
  - privacy policy
  - cookie policy
  - terms and conditions
  - legal notice

The merchandising section is intentionally removed from the publishable site for now and must stay out of the sitemap until it comes back as live `200` pages.

## Current local status

Latest local audit result:

- `41` sitemap URLs
- `41` matched files
- `0` canonical issues
- `0` indexability-meta issues
- `0` broken internal links
- `0` leftover merchandising references in the publishable tree

This means the repository is locally ready for deployment. Live indexing still depends on the deployed URLs returning `200 OK`.

## What Google needs from this site

Based on current Google Search documentation, the site should keep doing the following:

- Return HTML pages with the main content already present.
- Use crawlable `<a href>` links for important discovery paths.
- Keep one self-canonical per page.
- Keep reciprocal `hreflang` sets across localized equivalents.
- Keep only canonical, live URLs in the sitemap.
- Keep pages indexable with `robots` and `googlebot` directives allowing `index,follow`.
- Keep `robots.txt` open and pointing to the sitemap.

Primary references:

- [Localized versions of your pages](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [SEO link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Robots meta tags](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [Page indexing report](https://support.google.com/webmasters/answer/7440203)

## Architecture rules for this project

### 1. Multilingual URLs

- Each language URL is its own page and can index separately.
- We do not need a separate sitemap per language.
- We do need:
  - self-canonical URLs
  - reciprocal `hreflang`
  - internal links
  - live `200` responses

### 2. Sitemap management

- One sitemap is enough.
- Every URL in the sitemap must be:
  - canonical
  - live
  - intended for indexing
- Never leave removed sections in the sitemap.
- Update `lastmod` when a page materially changes.

### 3. Internal linking

- Use standard anchors, not click handlers without hrefs.
- Keep key pages linked from the homepage, nav, footer, blog indexes, and relevant posts.
- New pages should not rely only on the sitemap for discovery.

### 4. Canonicals

- Each page should self-canonical unless there is a deliberate consolidation strategy.
- `og:url` should match the canonical.
- Do not canonicalize localized pages to another language version.

### 5. Robots controls

- Public pages should keep `index,follow,max-image-preview:large`.
- If a page should not index, remove it from the sitemap as well.
- Do not use `noindex` and then expect sitemap inclusion to override it.

## High-value learnings from the latest audit

### Availability beats metadata

The strongest practical lesson was that a `404` category page will not index, regardless of how correct the sitemap, canonical, or `hreflang` setup is. Deployment state matters more than markup polish.

### Removal has to be complete

When a section is paused, it should be removed from:

- page files
- nav links
- CTAs
- blog links
- sitemap entries
- supporting modules when no longer used

Partial removal creates crawl waste and confusing Search Console reports.

### Static HTML is an advantage here

Because this project ships content directly in HTML, it avoids many JavaScript rendering risks. For this site, that is a real SEO strength and should be preserved.

### Search Console should be used as feedback, not as the first source of truth

The first checks should always be:

1. Does the live URL return `200`?
2. Is the page linked internally?
3. Is it in the sitemap?
4. Is it self-canonical and indexable?

Only after those pass should Search Console status categories be interpreted.

## How to read the main Search Console statuses

From Google's Page indexing report guidance, these are the statuses most relevant to this site:

- `Discovered - currently not indexed`
  - Google knows the URL but has not crawled it yet.
  - Common causes for this site: weak internal linking, too many low-priority URLs, newly deployed pages, or crawl scheduling delays.
- `Crawled - currently not indexed`
  - Google crawled it but did not index it.
  - Common causes for this site: page quality signals, thin differentiation, or duplicate-like templates with weak unique value.
- `Duplicate without user-selected canonical`
  - Usually means Google thinks another URL is the main version.
  - Re-check canonicals, internal links, and localized clustering.
- `Not found (404)`
  - Fix the live route or remove it from the sitemap and internal links.

## Title, description, and image guidance

Based on current Google documentation:

- Titles should be unique, descriptive, and closely match visible page content.
- Descriptions should summarize the page well, but Google may still rewrite snippets.
- Images should be relevant, high quality, and used in clear page context.
- Image filenames can be descriptive, but the surrounding text and `alt` text matter too.

## Post-deploy checklist

After every meaningful release:

1. Open the live homepage in every language.
2. Open the live blog index in every language.
3. Open every new article URL.
4. Open the live sitemap.
5. Confirm `robots.txt` still references the correct sitemap.
6. Check that removed sections are not still linked or listed.
7. Submit the sitemap in Search Console.
8. Request indexing only for the most important changed URLs.

## Safe operating rules for future changes

- Do not add future sections to the sitemap before they are truly live.
- Do not publish placeholder pages that are meant to rank later.
- Do not create localized URLs without real localized content.
- Do not leave stale canonicals after moving or deleting content.
- Do not assume indexing problems are fixed until the live site is checked.
