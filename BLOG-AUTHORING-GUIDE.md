# Blog authoring guide — PAMUUC | STUDIO

**Audience: an AI model, or a person, adding an article to pamuuc-studio.com.**

This is a specification, not advice. The build enforces most of it and refuses to
publish anything that breaks a rule. Follow it literally.

One article = **6 files changed**: five content files (one per language) and one
edit to `content/site.json`. An article that exists in fewer than five languages
is not publishable — the hreflang cluster would be incomplete and the build fails.

---

## 0. Before you write anything

Run this and confirm it prints `clean.`:

```bash
node tools/build.mjs --check
```

If it does not, the repository is already broken. Fix that first; do not add work
on top of it.

---

## 1. Pick the article key and the five slugs

The **key** identifies the article across languages. Lowercase, one word if
possible, never changes afterwards: `hospitality`, `dental`, `wellness`,
`laundry`, `sizing`.

The **slug** is the URL segment, and it is different in every language because it
must read naturally and carry that language's keywords.

Slug rules, all enforced:

- lowercase `a-z`, digits, single hyphens; nothing else — no accents, no
  underscores, no trailing hyphen
- maximum 60 characters, 3–7 words
- describes the article's subject, in that language, with the primary keyword
  first: `uniformes-hosteleria-personalizados`, not `articulo-3`
- **never reuse or edit a slug that has already been published.** A published URL
  is permanent. If a slug is wrong, the article stays where it is.

Then register the article in `content/site.json`:

```json
"postSlugs": {
  "hospitality": { "en": "...", "es": "...", "fr": "...", "it": "...", "de": "..." },
  "laundry": {
    "en": "industrial-laundry-uniform-fabrics",
    "es": "tejidos-uniformes-lavanderia-industrial",
    "fr": "tissus-uniformes-blanchisserie-industrielle",
    "it": "tessuti-divise-lavanderia-industriale",
    "de": "uniformstoffe-industriewaesche"
  }
},
"postOrder": ["laundry", "hospitality", "dental", "wellness"]
```

`postOrder` controls the order on the journal index and in the feeds. Newest
first. Add the new key at the front.

---

## 2. Add the cover image

Two files, same base name, in `src/images/blog/`:

| File | Format | Size | Notes |
|---|---|---|---|
| `<name>.webp` | WebP, quality ~80 | **1040 × 500 px exactly** | what visitors load |
| `<name>.jpg` | JPEG, quality ~82 | **1040 × 500 px exactly** | referenced by `og:image` and by the article schema |

- `<name>` follows the same character rules as a slug and is shared by all five
  languages — one cover per article, not one per language.
- Use either original PAMUUC photography or an original AI-generated editorial
  image grounded in real visual references. Never use a stock photo of a
  stranger's workplace, a copied composition, or a logo on a coloured background.
- An AI-generated cover is publishable only when all of the following are true:
  - research starts from multiple real references for the sector, garments,
    materials, working context, architecture and light; prefer PAMUUC-owned
    references whenever they exist
  - every reference URL or local asset path and its specific purpose is recorded
    in the publishing report; a reference is evidence and visual grounding, not a
    template to reproduce
  - the prompt does not request the style of a named artist or photographer and
    does not ask to recreate a single source image, recognisable person, artwork,
    logo, trade dress or client identity
  - the result is materially original in composition, pose, wardrobe details,
    setting, crop and lighting; it must look like a PAMUUC editorial image rather
    than a variation of any one reference
  - the final candidate is compared with every reference and rejected if it is a
    near-copy, could be mistaken for a real client project, or contains a visible
    third-party brand, invented logo or unapproved likeness
- Both files must exist or the build fails.

---

## 3. Write the five content files

One file per language: `content/posts/<key>.<locale>.md`, where `<locale>` is
`en`, `es`, `fr`, `it` or `de`.

The file is **a JSON object, then a line containing exactly `---`, then markdown**.
Nothing else. No YAML. No front matter fences.

```
{
  "key": "laundry",
  "locale": "en",
  "slug": "industrial-laundry-uniform-fabrics",
  "title": "Fabrics that survive industrial laundry",
  "headline": "Which uniform fabrics actually survive industrial laundry",
  "description": "What 60-cycle testing shows about cotton blends, elastane and reinforced seams in hospitality and clinical uniforms.",
  "kicker": "Materials",
  "published": "2026-09-04",
  "modified": "2026-09-04",
  "author": "Leonardo Gobbato",
  "cover": "industrial-laundry-fabrics",
  "coverAlt": "Uniform shirts after sixty industrial wash cycles, laid out for inspection",
  "coverCaption": "Sixty cycles at 60 °C, photographed in the studio.",
  "takeaways": [
    "Organic cotton blended with 12–15% synthetic fibre held colour and shape best across sixty cycles.",
    "Collars, cuffs and pocket mouths fail first; reinforcing those three points extends garment life more than heavier fabric does.",
    "Easy-care finishes lose most of their effect after roughly forty industrial cycles."
  ],
  "keywords": ["industrial laundry", "uniform fabrics", "workwear durability"],
  "about": ["Textile durability", "Hospitality uniforms"]
}
---
Opening paragraph. State the situation and the finding in the first two sentences.
No throat-clearing, no "in today's fast-paced world".

## First section heading

Body text.

- A list item
- Another list item

## Second section heading

More body text with an [internal link](/en/blog/custom-hospitality-uniforms/).
```

### Front matter fields

| Field | Required | Rule (enforced by the build) |
|---|---|---|
| `key` | yes | matches the file name and `postSlugs` |
| `locale` | yes | matches the file name |
| `slug` | yes | identical to `postSlugs.<key>.<locale>` |
| `title` | yes | **≤ 45 characters.** This is the `<title>`; the build appends ` \| Pamuuc Studio`. Keyword first, no clickbait |
| `headline` | yes | **≤ 95 characters.** The on-page `<h1>`. Fuller than `title`, still one line of thought |
| `description` | yes | **70–170 characters.** The meta description and the card text. One sentence, states what the reader gets. No "Learn more about…" |
| `kicker` | yes | ≤ 34 characters. The category shown above the title, e.g. `Materials`, `Hospitality case` |
| `published` | yes | `YYYY-MM-DD`. Never change it after publication |
| `modified` | yes | `YYYY-MM-DD`, ≥ `published`. **Update this whenever you edit the body.** It feeds `dateModified` and the visible "Updated" line |
| `author` | yes | `Leonardo Gobbato` unless told otherwise |
| `cover` | yes | base name of the two files in `src/images/blog/`, no extension |
| `coverAlt` | yes | ≥ 15 characters, describes what is in the photograph. Not the article title |
| `coverCaption` | no | one sentence shown under the cover |
| `takeaways` | no, but write them | array of **3–5 strings, each ≤ 160 characters**. Each one a complete finding, not a topic label. This block is what search snippets and AI answers lift |
| `keywords` | no | array of 3–6 real search phrases |
| `about` | no | array of 1–3 topic names |

### The markdown subset

**Only these constructs exist. Anything else fails the build.**

| Allowed | Written as |
|---|---|
| Section heading | `## Section heading` — becomes `<h2>` and a table-of-contents anchor |
| Sub-heading | `### Sub-heading` |
| Paragraph | plain text, blank line between paragraphs |
| List | consecutive lines each starting `- `; the whole block must be list lines |
| Bold | `**bold**` |
| Italic | `*italic*` |
| Link | `[text](/en/blog/some-article/)` |

**Forbidden, and each one fails the build:** `# ` (the h1 comes from `headline`),
raw HTML of any kind, tables, blockquotes, code fences, images in the body,
footnotes, emoji, and any inline `style` attribute.

### Body rules

- **Minimum 400 words.** Aim for 700–1,100. Below 400 the build refuses it.
- **At least three `## ` sections.** Two headings may not produce the same anchor —
  if two sections would slugify identically, rewrite one.
- First paragraph answers the question in the title. Do not save the finding for
  the end.
- One idea per paragraph, 2–4 sentences.
- At least **two internal links**: one to another article, one to a homepage
  section (`/en/#process`, `/en/#projects`, `/en/#contact` and their localized
  equivalents). Use the target language's URLs — never link an Italian article to
  an English page.
- No external links unless the source is named and load-bearing.
- Every number must come from the studio's own work. **Do not invent figures,
  dates, client names or test results.** If a number is not supplied to you, write
  the sentence without it.
- No superlatives about the studio ("the best", "world-class"). Show the work.

### Translation

The five files are the same article, not five different ones: same structure,
same section count, same claims, same numbers.

- Write the source language first, then translate.
- Translate the meaning, not the words. A French reader must not be able to tell
  it started in English.
- The slug, `title`, `headline`, `description` and `kicker` are all localized —
  they are not the English strings with accents added.
- Do not translate: the brand (`PAMUUC | STUDIO`, written `Pamuuc Studio` in
  prose), the legal entity `Pamuk Studio S.L`, place names, `info@pamuuc.com`.
- Minimum order quantity is **10 pieces per style** in every language. Woven
  garments are efficient from 10–15 pieces per style; knitwear needs 100–150.

---

## 4. Verify, then hand it over

```bash
node tools/build.mjs --check   # must print "clean."
node tools/build.mjs           # writes dist/
npx serve dist                 # look at all five language versions
```

The audit fails on: a slug that disagrees with `site.json`, a missing cover file,
a body under 400 words, fewer than three `## ` sections, an over-long `title` or
`headline`, a `description` outside 70–170 characters, a malformed date, a
`modified` earlier than `published`, unsupported markdown, a duplicate heading
anchor, a missing `alt`, invalid JSON-LD, or an incomplete hreflang cluster.

Fix what it reports. Never edit `dist/` — it is generated and git-ignored, and
every change there is destroyed by the next build.

Commit all six files together:

```bash
git add content/ src/images/blog/
git commit -m "Add article: <key>"
git push
```

The GitHub Action runs the audit again and deploys only if it passes.

---

## 5. Checklist

- [ ] `postSlugs.<key>` has all five locales; `postOrder` has the key, newest first
- [ ] `src/images/blog/<cover>.webp` and `.jpg`, both 1040 × 500
- [ ] if the cover is AI-generated: real references documented and originality
      review passed with no copied composition, likeness, logo or client identity
- [ ] five files `content/posts/<key>.<locale>.md`
- [ ] every front matter field present and inside its limit
- [ ] `takeaways`: 3–5 real findings
- [ ] body ≥ 400 words, ≥ 3 `## ` sections, ≥ 2 internal links in the right language
- [ ] no invented numbers, names or dates
- [ ] `node tools/build.mjs --check` prints `clean.`
- [ ] no file under `dist/` was edited

## What you must never do

1. Change or delete an already published slug, or any URL in `content/site.json`.
2. Edit anything in `dist/`.
3. Add a script, font, stylesheet, tracker, iframe or image from another domain.
   The Content-Security-Policy blocks it and the page will break.
4. Add raw HTML to an article body.
5. Publish in fewer than five languages.
6. Invent a client name, a quantity, a date, a certification or a test result.
7. Change `published` on an existing article, or leave `modified` stale after an edit.
