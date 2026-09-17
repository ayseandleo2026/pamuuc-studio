# Translating the merchandise side

The custom uniforms pages have always had their copy in `content/home.*.json`,
one file per language. The merchandise pages did not: their wording lives
inside `mockup/app.js`, interleaved with the markup that draws it, because that
side is rendered by the approved mockup's own code rather than reimplemented.

So the copy was pulled out into files that read like the others. This is how to
review it and how to finish it.

---

## Where everything is

| File | What it is |
| --- | --- |
| **`content/merch.en.json`** | **The English source.** Every distinct string on the merchandise side. Keys and values are both English — editing a **value** changes the wording on the site. |
| **`content/merch.es.json`** | Spanish. Same keys, translated values. |
| `content/merch.fr.json` · `merch.it.json` · `merch.de.json` | French, Italian, German. |
| `content/merch.where.json` | How many pages carry each string, and examples. Used to sort the work; not read by the build. |
| `content/merch.colours.json` | The 117 supplier colour names. Never translated — see below. |

A missing or empty value falls back to English **for that one string**, not for
the page. A half-translated language is still a half-translated page rather
than an English one.

### Where it is *not*

Two sets of words are not in these files:

- **Page titles and meta descriptions** — the lines that appear in a Google
  result — are in `tools/build-merch.mjs`, in the `META` block near the top.
  **These are still English in all five languages.** They matter more for
  search than anything else on the page, so they need doing before launch.
- **The three intake emails** are in `worker/src/emails.js`, also English only.

---

## Reviewing what exists

### In context, which is the only way to judge copy

```bash
node tools/build.mjs && python3 -m http.server 8802 --directory dist
```

Then open `localhost:8802`. The merchandise side starts at `/merchandise/`,
`/es/merchandise/`, `/fr/merchandise/` and so on. Read the pages, not the JSON —
a sentence that looks fine in a list can be wrong above the button it belongs to.

### As a list

```bash
node tools/translate-status.mjs          # coverage, every language
node tools/translate-status.mjs es       # what Spanish still needs, most-used first
node tools/translate-status.mjs es 200   # the next 200
```

The order matters: a string on 56 pages is worth more than one on a single
product page, so the top of the list is always the highest-leverage work.

---

## Finishing the translation

Two ways. Use whichever suits who is doing it.

### 1. Edit the JSON directly

Open `content/merch.es.json` and fill in the values under `copy`. The key is the
English; the value is what the site shows.

```json
"copy": {
  "All products": "Todos los productos",
  "Add to quote": "Añadir al presupuesto",
  "Price on request": ""            ← empty: falls back to English
}
```

Do not edit the **keys**. A changed key no longer matches the English source and
that string silently reverts.

Then:

```bash
node tools/build.mjs
node tools/translate-status.mjs
```

### 2. Hand it to a translator as a spreadsheet

```bash
node tools/translate-status.mjs es --csv
```

Writes `content/merch.es.tsv` — English in column A, the translation in column
B, and how many pages use it in column C. It opens in Numbers or Excel. When it
comes back, put the file where it was and:

```bash
node tools/translate-status.mjs es --import
node tools/build.mjs
```

Rows whose English column no longer exists are skipped and reported, so an old
spreadsheet cannot quietly reintroduce dead strings.

---

## Rules the translation follows

### Formal, in all four languages

The live site is formal and the merchandise side has to match, or the two halves
sound like different companies. Spanish `home.es.json` has 106 *usted* markers
against 1 informal; Italian uses *Lei* ("Ci parli del suo progetto"); French
*vous*; German *Sie*.

My first pass was informal in Spanish and Italian. It was corrected — but if you
find an informal leftover, that is a bug, not a choice.

### Three things are never translated

They are handled by rule so they cannot go stale when the catalogue changes, and
they are kept out of the review files so nobody has to decide about them:

| | Example | Why |
| --- | --- | --- |
| **Supplier colour names** | `Fraiche Peche`, `French Navy`, `Heather Grey` | They are references, not words. The trade keeps them in English, and the supplier's own catalogue uses them. All 117 are in `content/merch.colours.json`. |
| **Generated counts** | `8 colours`, `20 options available` | The number is data. Only the words move, through the `patterns` list at the top of each language file — so a product gaining a colour does not turn its label English. |
| **Product references** | `PAM-TOTE-BAGS · 160–400 g/m²`, `DTF`, `DTG` | A reference and a fabric weight read the same everywhere. |

`PRODUCT in COLOUR` alt text (`Custom Tank Top in White`) is composed: the
product name is translated, the colour is not, and the preposition comes from
`colourPreposition` in each language file.

### Keep the placeholders

A few strings carry `&amp;` or `&#39;` because they come from HTML. Leave the
entity as it is — `Sizes &amp; colours` becomes `Tallas &amp; colores`, not
`Tallas & colores`. The build decodes them on the way to the browser.

---

## Where it stands

```
1119 strings on the merchandise side

  es  ██████······················   225/1119
  fr  █████·······················   218/1119
  it  ██████······················   225/1119
  de  ██████······················   222/1119
```

Those 225 are the highest-traffic strings — navigation, footer, the FAQ, the
product page's core, the product names — so the vocabulary decisions that get
repeated across the site are already made and are what to check first. Terms
worth a second opinion:

| English | es | fr | it | de |
| --- | --- | --- | --- | --- |
| artwork | arte | fichier | file grafico | Druckdaten |
| quote | presupuesto | devis | preventivo | Angebot |
| personalisation | personalización | personnalisation | personalizzazione | Veredelung |
| weight (g/m²) | gramaje | grammage | grammatura | Flächengewicht |
| setup | preparación | préparation | preparazione | Einrichtung |
| placement | colocación | placement | posizionamento | Platzierung |

If any of those is not the word PAMUUC uses with suppliers and customers, change
it in the four files before the rest is translated — they recur hundreds of
times.

---

## Regenerating the source

If the mockup changes — new products, reworded pages — the English source is
rebuilt from it:

```bash
node tools/extract-copy.mjs
```

This rewrites `content/merch.en.json` and `merch.where.json`. Translations are
**not** touched: existing keys keep their translations, new strings appear
untranslated, and strings that no longer exist simply stop being used.

It refuses to write anything unless every page round-trips — that is, unless
every string it extracted can be put back exactly where it came from. If that
check fails, the extraction is wrong and nothing is overwritten.

---

## Known defect — read before publishing

**Build-time translation is correct. The runtime pass is not.**

Every static page is right: `/es/merchandise/` really does say *Productos* and
*Colecciones*. That is what Google indexes and what a visitor sees on first
paint.

But the merchandise pages then load the mockup's own JavaScript, which is what
makes the configurator work — choosing a colour, a quantity, a placement. That
code redraws the page **in English**, and a translation pass is supposed to put
the language back. It does so only partly: some strings translate, some stay
English, and `Collections` comes out as `Coleccións`.

So a Spanish visitor currently sees the page flip partly back to English a
moment after it loads. `normalize()` on the text nodes, HTML-entity decoding and
a `MutationObserver` did not fix it and the cause is not yet found.

**This has to be fixed before the site is published in any language other than
English.** Finishing the translation is still worth doing — it is the same
dictionary either way — but the two jobs are independent and this one blocks
launch.
