# Blog workflow (GitHub Pages static)

Architecture decision: the blog uses pure static HTML (no Jekyll) because this repository is already static, uses `.nojekyll`, and prioritizes predictable deployment on GitHub Pages.

## Folder structure

- English index: `en/blog/index.html`
- Spanish index: `es/blog/index.html`
- French index: `fr/blog/index.html`
- Italian index: `it/blog/index.html`
- Post pages: one folder per localized slug with `index.html` inside

Example post set:

- `en/blog/custom-hospitality-uniforms/index.html`
- `es/blog/uniformes-hosteleria-personalizados/index.html`
- `fr/blog/uniformes-hotellerie-personnalises/index.html`
- `it/blog/divise-hospitalita-personalizzate/index.html`
- `en/blog/wellness-studio-uniform-system/index.html`
- `es/blog/uniformes-estudios-bienestar/index.html`
- `fr/blog/uniformes-studios-bien-etre/index.html`
- `it/blog/divise-studi-benessere/index.html`
- `en/blog/custom-dental-clinic-uniforms-barcelona/index.html`
- `es/blog/uniformes-clinica-dental-personalizados-barcelona/index.html`
- `fr/blog/uniformes-clinique-dentaire-sur-mesure-barcelone/index.html`
- `it/blog/divise-clinica-dentale-personalizzate-barcellona/index.html`

## New post checklist

1. Create one translated slug per language.
2. Add 4 post files (EN/ES/FR/IT), each with:
   - self-referencing canonical URL
   - `hreflang` links to EN/ES/FR/IT equivalents + `x-default`
   - `BlogPosting` JSON-LD
   - `BreadcrumbList` JSON-LD
3. Add the new post card to each blog index (`en/blog/index.html`, `es/blog/index.html`, `fr/blog/index.html`, `it/blog/index.html`).
4. Keep cards in reverse chronological order (newest first).
5. Update related-articles blocks on all posts in that language:
   - Show the latest 3 posts in that language excluding the current post.
   - If fewer than 3 related posts exist, keep empty placeholder cards (`.blog-related-card-empty`) to preserve layout symmetry.
   - Keep links as normal HTML anchors for crawlability.
6. Add the 4 canonical post URLs to `sitemap.xml` with absolute URLs only.
7. Verify `robots.txt` still allows crawl and still points to the same sitemap URL.
8. Add the post image placeholder in `assets/images/blog/` using the final slug.
9. Reference image paths in post metadata and page markup from `assets/images/blog/`.

## Filename and slug rules

- Use lowercase and hyphens only.
- Translate slugs by language (never reuse one language slug in another language).
- Do not use `.html` post filenames directly; use folder + `index.html` to keep clean URLs.
- Image naming convention: `assets/images/blog/<slug-en>.jpg` (or the approved extension).

## Required SEO consistency per post

- `<link rel="canonical" href="...current page..." />`
- `hreflang="en"`, `hreflang="es"`, `hreflang="fr"`, `hreflang="it"`, `hreflang="x-default"`
- OpenGraph/Twitter metadata with absolute canonical URL
- `BlogPosting` fields:
  - `headline`
  - `description`
  - `image`
  - `datePublished`
  - `dateModified`
  - `author`
  - `publisher`
  - `mainEntityOfPage`

## Safety notes

- Keep content server-rendered in HTML (no JS-only rendering).
- Keep links crawlable (`<a href="...">`).
- Keep styles in `styles.css` under the existing design system tokens and components.
