# Blog images

Last reviewed: `2026-08-27`

Store blog cover images in this folder.

## Responsive derivatives

Each master has generated siblings at 480w, 800w and 1200w in both formats:

```
custom-hospitality-uniforms.jpg        <- master, 1600w
custom-hospitality-uniforms.webp       <- master, 1600w
custom-hospitality-uniforms-480.jpg    <- generated
custom-hospitality-uniforms-480.webp   <- generated
...
```

The masters keep their bare filename because that is the URL `og:image` and the
JSON-LD `image` field point at, and they are the 1600w entry in every `srcset`.

After adding or replacing a master, regenerate the derivatives and commit them
with it:

```
npm install sharp && node tools/generate-blog-images.mjs
```

`sharp` is deliberately not a dependency of the site build, which runs on plain
Node with no install step. It is only needed to run this one tool.

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
