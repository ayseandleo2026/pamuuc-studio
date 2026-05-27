# Blog images

Last reviewed: `2026-03-27`

Store blog cover images in this folder.

## Naming convention

- `custom-hospitality-uniforms.jpg`
- `wellness-studio-uniform-system.jpg`
- `custom-dental-clinic-uniforms-barcelona.jpg`
- Future posts: `<slug-en>.jpg` (or approved extension)

Keep filenames stable after a page is published whenever possible. If an image is replaced, prefer replacing it in place rather than renaming it and updating multiple metadata references.

## SEO rules for blog images

Based on current Google image guidance:

- Use descriptive filenames.
- Use high-quality, relevant images.
- Keep the image near the main article content.
- Add meaningful `alt` text in the page markup.
- Use the same image path consistently across:
  - page markup
  - Open Graph metadata
  - structured data image fields

For this project, the practical rule is:

- One primary blog image per article family
- English-slug filename
- Reused across localized versions unless there is a real reason to change it

## Do not do this

- Do not use generic names like `image1.jpg`.
- Do not create different filenames per language unless the asset is actually different.
- Do not change filenames casually after deploy.
- Do not leave placeholder assets in final article metadata without verifying they are intentional.

Reference:

- [Image SEO best practices](https://developers.google.com/search/docs/appearance/google-images)
