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

Three sets of words are not in these files:

- **Page titles and meta descriptions** — the lines that appear in a Google
  result — are in `content/merch.meta.<loc>.json`, one file per language, all
  five written and reviewed.
- **The three intake emails** are in `worker/src/emails.js`, English only.
- **Strings only the browser ever draws.** The offer banner's pop-up is built
  by JavaScript after the page loads, so `extract-copy.mjs` never sees it and
  it is not in `merch.en.json`. Those live in the locale files as entries whose
  key is not in the English source — twelve of them today. `translate-status`
  counts against the English source, so they are invisible to it; that is the
  only thing in these files not driven by the extractor.

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

  es  ████████████████████████████   1111/1119
  fr  ████████████████████████████   1104/1119
  it  ████████████████████████████   1112/1119
  de  ████████████████████████████   1107/1119
```

**Those are complete.** The shortfall is the counter, not the work: a value
that equals its English key reads as untranslated, and some of them genuinely
are the same word — *Journal*, *Total*, *Unisex*, *Polos*, *Anorak*, *Bomber*,
and in French *Collections*, *Contact*, *Placement*, *Certification*. Eight in
Spanish, fifteen in French, seven in Italian, twelve in German. Each was
checked; none is a gap.

All of it is machine translation that has not yet been read by a native
speaker. The register was checked by rule and is formal throughout — no *tú*,
*tu*, *du* or informal *tuo* anywhere in the four files. Terms worth a second
opinion, because they recur hundreds of times:

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

## The runtime pass, and why it was wrong twice

Every static page is translated at build time: `/es/merchandise/` really does
say *Productos* and *Colecciones*, and that is what a crawler reads and what
paints first.

Then the page loads the mockup's own JavaScript — the thing that makes the
configurator work — and that code redraws the page in English. A second pass,
`retext()` in `tools/merch-shim.js`, walks the new DOM and puts the language
back. Getting that pass to agree with the build took three fixes, and each one
looked fine in the JSON while being wrong on the screen.

**The tokenizer was eating its own escapes.** The shim used to be a template
literal inside a `.mjs` file, and a template literal consumes one level of
escaping before the string is ever written: `\s` collapsed to `s`, so
`"Products"` was keyed as `"Product"` and `Collections` came out *Coleccións*.
The shim is a real `.js` file now, read and concatenated, never interpolated.
Do not put it back.

**The rules were not shipped.** Only the exact key→value map reached the
browser. The `patterns` — the rules that translate the labels the catalogue
generates from a number — stayed behind on the build machine, so every
`20 options available` on all 31 product cards and every product page reverted
to English a second after load, in all four languages, while the static HTML
those pages were served as was perfectly correct. `patterns`,
`colourPreposition` and the colour list now ship alongside the map, and
`lookup()` in the shim applies the same three rules in the same order as
`translate()` in `tools/merch-strings.mjs`. **If you add a rule to one, add it
to the other.**

**A sentence with a name in it can never match a key.** The offer confirmation
reads *We have confirmed it to you@company.com.* — one text node, with an
address in the middle of it, so no fixed key will ever equal it. It is a
`patterns` entry, the same mechanism the counts use: the address is data, the
words around it are language.

### Checking it

Build-time and runtime are separate surfaces and a change can fix one and
break the other, so check both:

```bash
node tools/build.mjs && python3 -m http.server 8802 --directory dist
```

Static: fetch a page and read it. Runtime: open it, let the JavaScript settle,
then walk the DOM and ask the dictionary whether each text node *could* have
been translated. Anything it can translate that is still English is a leak —
that test is exact, unlike grepping for English words, which flags *options
disponibles* in French. All four languages are clean on every page type,
including the product configurator and both states of the offer pop-up.

---

## The one thing that is not in these files

The mockup saves its whole world to `localStorage` under `pamuuc_suite_v12`,
and restores it on load. That is correct for a prototype — your work survives a
reload — and a slow-acting copy bug on a website, because `restore()` replaces
the catalogue and the offers wholesale and only refreshes them when a count
changes. A reworded sentence, a new price, a changed minimum: none of those
move a count, so a returning visitor keeps whatever the site said the day they
first arrived.

It surfaced here as a banner still reading wording that had been deleted from
the repository and appeared in no built file. `tools/merch-seed-guard.js` runs
before the mockup's own files and clears the key; the shim replaces `save()`
with a no-op so nothing pins a new one. The quote basket, consent, theme and
the first-order marker have their own keys and are untouched.
