# Blog Workflow

Last reviewed: `2026-03-27`

This repository uses pure static HTML for the blog. That is a good fit for Google Search because the content, links, metadata, and structured data are present in the initial HTML response.

## Current blog architecture

- English blog index: `en/blog/index.html`
- Spanish blog index: `es/blog/index.html`
- French blog index: `fr/blog/index.html`
- Italian blog index: `it/blog/index.html`
- Post pages: one folder per localized slug with `index.html` inside
- No root-language blog index exists at `/blog/`

Example localized post set:

- `en/blog/custom-hospitality-uniforms/index.html`
- `es/blog/uniformes-hosteleria-personalizados/index.html`
- `fr/blog/uniformes-hotellerie-personnalises/index.html`
- `it/blog/divise-hospitalita-personalizzate/index.html`

## SEO principles we are following

- Keep blog content server-rendered in HTML.
- Keep internal discovery links as normal `<a href="...">` links.
- Use one canonical URL per page and make it self-referencing.
- Connect localized equivalents with reciprocal `hreflang` tags plus `x-default`.
- Keep only live, indexable, canonical URLs in `sitemap.xml`.
- Do not leave removed sections in navigation, internal links, or the sitemap.
- Do not rely on a sitemap alone to get pages indexed. Google still needs crawlable links and `200 OK` live responses.

Relevant Google documentation:

- [Localized versions of your pages](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [SEO link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)
- [Robots meta tags](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- [How to write title links](https://developers.google.com/search/docs/appearance/title-link)
- [How to write meta descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Image SEO best practices](https://developers.google.com/search/docs/appearance/google-images)

## New post checklist

1. Create one translated slug per language.
2. Add the 4 localized post files:
   - `en/.../index.html`
   - `es/.../index.html`
   - `fr/.../index.html`
   - `it/.../index.html`
3. Give each post:
   - a unique `<title>`
   - a unique `<meta name="description">`
   - self-referencing canonical
   - `hreflang` links to EN/ES/FR/IT equivalents and `x-default`
   - `og:url` matching the canonical
   - `BlogPosting` JSON-LD
   - `BreadcrumbList` JSON-LD
4. Add the new post card to each localized blog index.
5. Keep blog cards in reverse chronological order.
6. Update related-articles blocks on all posts in that language:
   - show the latest 3 posts in that language excluding the current one
   - if fewer than 3 exist, keep empty placeholders to preserve layout
7. Add the 4 canonical post URLs to `sitemap.xml`.
8. Update `lastmod` for:
   - the 4 new post URLs
   - the affected blog index pages
9. Add the post image in `assets/images/blog/`.
10. Verify the page uses that image consistently in:
   - visible markup
   - Open Graph metadata
   - structured data
11. Re-check `robots.txt` and make sure it still points to `https://studio.pamuuc.com/sitemap.xml`.

## Required SEO consistency per post

- `<link rel="canonical" href="...current page..." />`
- `hreflang="en"`, `hreflang="es"`, `hreflang="fr"`, `hreflang="it"`, `hreflang="x-default"`
- Open Graph and Twitter metadata using absolute URLs
- `BlogPosting` fields:
  - `headline`
  - `description`
  - `image`
  - `datePublished`
  - `dateModified`
  - `author`
  - `publisher`
  - `mainEntityOfPage`

## Title and description guidance

Based on current Google Search guidance:

- Write a specific title for each page.
- Match the visible page topic and headline.
- Avoid boilerplate-only titles.
- Keep descriptions informative and page-specific.
- Do not duplicate the same description across many posts.
- Do not stuff keywords or city names unnaturally.

Practical rule for this site:

- Put the real subject first.
- Keep the brand at the end if needed.
- Make localized titles and descriptions sound native, not machine-translated.

## Localized publishing rules

- Translate slugs by language. Never reuse an English slug in another language.
- Every localized page must point to the full language cluster.
- The cluster must be reciprocal: if EN points to FR, FR must point back to EN.
- `x-default` should point to the global fallback URL used by the site.
- If a localized version does not exist yet, do not invent it in `hreflang`.

## Image rules for blog posts

- Use descriptive filenames based on the English slug.
- Keep the filename stable after publish whenever possible.
- Make sure the image is high quality and relevant to the article.
- Provide meaningful `alt` text in the page markup.
- Keep the image close to the relevant text and article context.

## Sitemap rules

- Include only canonical, indexable URLs.
- Do not include removed pages, redirected pages, blocked pages, or `404` pages.
- Absolute URLs only.
- Keep the sitemap aligned with the current live site structure.
- One sitemap is enough for this site as long as it lists all language URLs.

## Deployment checks after adding posts

Run these checks before and after publish:

1. Confirm the new files exist in all 4 languages.
2. Confirm the canonical and `og:url` match the intended live URL.
3. Confirm all `hreflang` URLs are real.
4. Confirm the new post is linked from the localized blog index.
5. Confirm the new post URL is present in `sitemap.xml`.
6. Confirm the live URL returns `200 OK` after deploy.
7. Confirm the live sitemap is reachable.
8. In Search Console, request indexing for:
   - the 4 new post URLs
   - the affected blog index URLs

## Site-specific learnings from the March 2026 audit

- The biggest indexing failures were not metadata failures. They were live URL availability failures.
- A page that returns `404` will not be recovered by a good sitemap or correct `hreflang`.
- Removing a section means removing it everywhere:
  - files
  - links
  - CTAs
  - sitemap entries
  - supporting assets if no longer used
- Static HTML made auditing easier and reduced rendering ambiguity for Googlebot.
- The current publishable site is cleanest when the sitemap lists only the 41 live, intended URLs.
