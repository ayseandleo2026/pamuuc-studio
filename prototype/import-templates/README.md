# Merchandise CSV import

**One file you fill in: `merch-catalogue.csv`.** Plain CSV, UTF-8, one header
row, 55 columns. Open it in Excel or Numbers and save back as CSV.

```bash
node validate-merch-csv.mjs                          # check ./merch-catalogue.csv
node validate-merch-csv.mjs cat.csv                  # check a filled file
node validate-merch-csv.mjs --rates cat.csv          # print the expanded cost grid
node validate-merch-csv.mjs cat.csv --shopify out.csv   # emit a Shopify import file
node validate-merch-csv.mjs --reference              # regenerate merch-reference.csv
```

## The pipeline

```
merch-catalogue.csv          ← the master. You edit this, and only this.
        │
        ├── --shopify ──►  shopify-products.csv   ← generated, never hand-edited
        │                  upload in Shopify admin → Products → Import
        │
        └── read directly by our own site
```

**Why not just keep a Shopify CSV and be done?** Because Shopify's format cannot
hold half of what this catalogue knows. Its grain is one row per variant keyed on
handle; a decoration rate row in that file would be imported as a junk product.
It has no field for minimum order quantity, quantity price breaks, lead time,
decoration limits or the rate card. And maintaining two files by hand guarantees
they drift.

So the master file holds everything, and Shopify gets a generated export. What
Shopify has no native home for is written as **product metafields**, which
survive the import and are readable by the storefront and by our own site:

| Metafield | Holds |
|---|---|
| `pamuuc.ref` | `MP-01` — our permanent identity |
| `pamuuc.moq` | minimum order quantity |
| `pamuuc.price_breaks` | the whole quantity ladder as JSON |
| `pamuuc.lead_weeks_min` / `_max` | lead time |
| `pamuuc.personalisation_methods` / `_positions` | what is offered |
| `pamuuc.artwork_required` | yes / no |
| `pamuuc.materials`, `.care`, `.provenance`, `.country_of_origin` | spec block |
| `pamuuc.decoration` | max size, colours and artwork format per method × position, as JSON |

Shopify carries **one** price per variant, so the export uses the lowest
quantity break as the retail price and puts the full ladder in
`pamuuc.price_breaks`. The decoration rate card is not exported at all — it is
not product data.

### Header dialect

Shopify has two header sets in circulation: the long-standing one (`Handle`,
`Body (HTML)`, `Image Src`) and the current export format (`URL handle`,
`Description`, `Product image URL`). The exporter defaults to **legacy**, which
has the broadest acceptance:

```bash
node validate-merch-csv.mjs cat.csv --shopify out.csv --dialect current
```

**Confirm this before a bulk import.** Export one product from Shopify admin and
compare its header row — that is ground truth, and it takes a minute.

The validator exits non-zero on any error and prints a line-and-column report.
Nothing imports until it is clean. Warnings never block an import.

**The example rows are rejected on purpose.** The template ships with rows whose
`ref` starts with `EXAMPLE-`, so you can see what good looks like. The validator
refuses them, so you cannot accidentally publish demo data. Delete them once you
have your own rows.

---

## The one thing to understand: `row_type`

Column A. Every row is one of six kinds, and each kind uses a different part
of the sheet. Leave the columns a row doesn't use **blank**.

| `row_type` | One row per | Fills |
|---|---|---|
| `product` | product | `ref` … `images` |
| `variant` | product × colour | `ref`, `status`, `supplier_ref`, `colour` … `reorder_point` |
| `image` | image | `ref`, `colour` (optional), `image_url` … `image_position` |
| `decoration` | product × method × position | `ref`, `method` … `artwork_format` |
| `deco_method` | decoration method (studio-wide) | `method`, `setup_cost` … `mult_4_colours` |
| `deco_rate` | priced band (studio-wide) | `method`, `size_band` … `provisional` |

`ref` ties the first three together — a `variant` row's `ref` is the product it
belongs to. **`deco_method` and `deco_rate` rows have no `ref`**: the rate card
is studio-wide, not per product.

**A file of only `product` rows is completely valid.** That is the way to start.
Add `variant` rows when you begin holding stock or issuing SKUs,
`decoration` rows to record what physically fits where, and the two rate-card
row types to cost them. You never need a second file.

Keep each product's rows together, product row first. Nothing enforces it — the
validator reads products first whatever the order — but a scattered file is
miserable to maintain.

```
product     MP-01  Heavy canvas tote  …  ecru|ink|forest  screen|embroidery  …
variant     MP-01                        ecru   MP01-ECR  140  40
variant     MP-01                        ink    MP01-INK   85  40
decoration  MP-01                        screen      left_chest  220×260  4  …
decoration  MP-01                        embroidery  left_chest   90×90   6  …
product     MP-02  Six-panel cap      …
```

## `product` rows

| Column | Required | Notes |
|---|---|---|
| `ref` | yes | Unique, `MP-01` format. Permanent identity — never reuse or renumber. |
| `handle` | yes | The **public URL slug**, on Shopify and on our own site — `heavy-canvas-tote`. Lower case, hyphens, no spaces. Changing it breaks every existing link and every search result, so treat it as permanent. |
| `name` | yes | Under 80 characters or it truncates on the listing card. |
| `category` | yes | Free text, but a new value creates a new filter on the public catalogue. |
| `status` | yes | `draft` · `published` · `hidden` · `archived` |
| `moq` | yes | Minimum order quantity, whole number. |
| `currency` | yes | 3-letter code, `EUR`. |
| `price_25` … `price_500` | at least one | Unit price at that quantity or above. Leave a break blank if you do not offer it. |
| `cost_price` | no | Internal. Never shown to a customer, never sent to the public site. |
| `lead_weeks_min` / `lead_weeks_max` | yes | Whole weeks, min ≤ max. |
| `colours` | yes | Pipe-separated colour **keys** — `ecru\|ink\|forest`. |
| `sizes` | yes | `One size`, or pipe-separated from `XS\|S\|M\|L\|XL\|XXL`. The two cannot be mixed. |
| `personalisation_methods` | yes | Pipe-separated keys — `screen\|embroidery`. |
| `personalisation_positions` | yes | Pipe-separated keys — `left_chest\|hem`. |
| `artwork_required` | yes | `yes` or `no`. |
| `description` | yes | The customer-facing paragraph. Under 40 characters is flagged as too thin. |
| `materials`, `weight_gsm`, `care` | no | Specification block on the product page. |
| `provenance`, `country_of_origin` | no | A provenance claim without a country is flagged — it cannot be substantiated. |
| `supplier`, `supplier_ref` | no | Internal. |
| `images` | no | Pipe-separated filenames. |

## `variant` rows

`ref` · `status` · `colour` · `sku` · `price_adjustment` · `stock_on_hand` ·
`reorder_point` · `supplier_ref`

The colour must already be listed in that product's `colours` column — that
cross-check is the point of the row.

## `image` rows

`ref` · `colour` *(optional)* · `image_url` · `image_alt` · `image_position`

One row per image, which is exactly how Shopify models them.

- `image_url` must be a **full `https://` URL**. Shopify fetches the file from
  that address — it is not a local filename. Host them wherever you like
  (a CDN, Shopify Files, S3) as long as the URL is public at import time.
- `image_position` orders them. **Position 1 is the thumbnail.**
- `image_alt` is required for accessibility and read by search engines. Blank
  is warned about, never silently accepted.
- **Leave `colour` blank for a product image.** Set it and the row becomes the
  *variant* image for that colour — it lands in Shopify's `Variant Image`
  column instead of being a gallery row.

A product with no image row publishes without a photograph, and the validator
says so.

## `decoration` rows — what physically fits

`ref` · `method` · `position` · `max_width_mm` · `max_height_mm` ·
`max_colours` · `artwork_format` · `notes`

Method and position must both be offered by that product. A product that
advertises personalisation with no decoration row cannot be quoted, and the
validator warns about it.

**These rows carry no price.** They used to, and that was wrong: screen-print
cost depends on the order quantity, which is not known when you write the
catalogue, and embroidery cost depends on the artwork size, not on the garment.
Cost comes from the rate card below.

## The rate card — `deco_method` and `deco_rate`

Studio-wide, written once, used by every product. **These are costs. Margin is
applied later.**

A `deco_method` row says how a method is priced:

| Column | Notes |
|---|---|
| `method` | `embroidery` · `screen` · `dtf` · `dtg` … |
| `setup_cost` | Per job. Blank means none recorded, and the validator warns. |
| `priced_by` | `size` or `quantity` — decides which column the rate rows use |
| `band_small_max_mm` / `band_medium_max_mm` | Size-band ceilings, measured on the longest dimension. Small ≤ 99, medium 100–150, large above. |
| `mult_2_colours` … `mult_4_colours` | **Absolute** against 1 colour |

A `deco_rate` row is one priced band:

`method` · `size_band` (small/medium/large) *or* `qty_min` · `unit_cost` ·
`provisional` · `notes`

Size-priced methods use `size_band` and leave `qty_min` blank. Quantity-priced
methods do the reverse. `qty_min` is the **lowest quantity the rate applies to**,
so "less than 25 units costs 4.30" becomes `qty_min = 10, unit_cost = 4.30`
(covering 10–24).

### Colour multipliers are absolute, not cumulative

The rule as stated is cumulative — 2 colours is 20% more than 1, 3 is 10% more
than 2, 4 is 5% more than 3. Stored that way it is ambiguous and easy to
mis-apply, so the file holds the compounded result against 1 colour:

| Colours | Stated | Stored |
|---|---|---|
| 1 | base | 1.000 |
| 2 | +20% on 1 colour | **1.200** |
| 3 | +10% on 2 colours | 1.20 × 1.10 = **1.320** |
| 4 | +5% on 3 colours | 1.32 × 1.05 = **1.386** |

`--rates` prints the expanded grid so you can check it at a glance:

```
Screen print  (screen)   setup 40.00 EUR   priced by quantity
    qty          1 col   2 col   3 col   4 col
    1+            4.50    5.40    5.94    6.24
    10+           4.30    5.16    5.68    5.96
    25+           4.10    4.92    5.41    5.68
    50+           3.70    4.44    4.88    5.13
    100+          2.64    3.17    3.48    3.66   ← interpolated
    250+          1.68    2.02    2.22    2.33   ← interpolated
    500+          1.20    1.44    1.58    1.66
```

### The 100+ and 250+ bands are interpolated

Only the anchors at 50 (3.70) and 500 (1.20) were quoted. The two bands between
them are filled geometrically — a constant percentage decline per doubling —
because per-piece run cost decays toward a floor rather than falling in a
straight line:

```
price ∝ qty^-0.4890          fitted on (50, 3.70) and (500, 1.20)
100+   3.70 × (100/50)^-0.489 = 2.64
250+   3.70 × (250/50)^-0.489 = 1.68
```

Both rows are marked `provisional`, so they are flagged on every run until the
supplier confirms them.

**The curve does not fit the whole ladder, and that is worth checking.** From 1
to 50 pieces the price falls about 5% per doubling; from 50 to 500 it has to
fall 28.7% per doubling to reach 1.20. That is a real change of shape. If setup
is genuinely separate at 40 €, a per-piece run cost that is nearly flat to 50
and then collapses is unusual — worth confirming the 3.70 and the 1.20 are
measured the same way.

### Worked example

100 tote bags, screen print, 2 colours, left chest:

```
setup                                              40.00
100 × 3.17  (100+ band, 1 colour 2.64 × 1.200)    317.00
                                          total   357.00   = 3.57 / piece
```

## `merch-reference.csv` — generated, do not edit

Every allowed value for every controlled field, with its human label.
Regenerated from `../10-data.js` with `--reference`, so the template, the
validator and the running catalogue cannot drift apart. If you add a colour to
the platform, regenerate this rather than typing the key by hand.

---

## Three places this is stricter than the prototype

Each is a gap the CSV exposed:

1. **Price breaks instead of a single "from" price.** The prototype carries one
   `from` value. Real merchandise is quoted in quantity bands, and a catalogue
   without them cannot produce a quote. The validator rejects a price that rises
   with quantity, and a cost price above the highest-quantity break — that break
   would sell at a loss.

2. **Lead time as two integers, not "3–4 weeks".** Free text cannot be sorted,
   filtered, or added to a production date.

3. **Decoration constraints as their own rows.** The prototype knows *which*
   methods and positions a product allows, but not the maximum size, colour
   count or setup fee at each one. You cannot quote or proof without those.

## What the validator checks

- **field count per row** — 55 columns is wide enough that one missed comma
  shifts every value after it; this is caught before anything else
- `row_type` valid, and cells filled in on a row type that does not use them
- `ref` unique and correctly formatted; duplicates named by line number
- every colour, method, position and size against the live vocabularies
- price breaks never rise with quantity
- cost price below the lowest customer price
- MOQ consistent with the price breaks actually offered
- lead time min ≤ max
- `One size` not mixed with lettered sizes
- variant and decoration rows reference a product that exists **in the file**
- a variant colour the product actually declares
- one variant row per product × colour; SKUs unique across the file
- decoration rows reference a method and position that product offers
- one decoration row per product × method × position
- every declared colour has a variant row, once variant rows are in use
- every product advertising personalisation has at least one decoration row
- stock at or below the reorder point while published
- `handle` present, URL-safe, and not absurdly long
- image URLs are absolute `https://`, look like image files, are not duplicated,
  and do not collide on position; alt text present and within Shopify's 512 cap
- a variant image names a colour the product actually declares
- every product has at least one image
- **rate card**: every advertised method has a `deco_method` row and at least
  one rate; size-priced methods have all three bands; the quantity ladder never
  rises with quantity; gaps in the ladder are named; colour multipliers never
  fall as colours are added; provisional rates are flagged on every run

---

## Open questions on the cost data

Six things are unresolved. Each changes a real quote, and each is one cell to
fix once answered.

1. **The 500+ screen rate was given twice, differently** — 1.54 first, then
   1.20. The file holds **1.20**, and the 100+ / 250+ interpolation is built on
   it, so if 1.54 was the right figure both interpolated bands move with it.

2. **Are 2.64 (100+) and 1.68 (250+) acceptable?** They are interpolated, not
   quoted. Both are marked provisional until confirmed.

3. **Is the screen setup fee per job or per screen?** 40 € flat is what was
   given. Trade practice is usually one screen per colour, which would make a
   4-colour job 160 € of setup rather than 40 €. On a 25-piece run that is the
   difference between 6.02 and 10.82 a piece.

4. **Is setup charged per position?** A left-chest and a back print on the same
   order — one setup or two?

5. **Do DTF and DTG carry a setup cost?** None was given. Blank is recorded, not
   zero, and the validator warns on every run until it is filled in.

6. **DTG is stored as DTF + 50%** — 0.90 / 1.35 / 1.80. That came from "around
   50% more", so all three rows are marked `provisional` and flagged on every
   run. Replace them with real numbers when you have them.

Two smaller ones:

- **`heat` (heat transfer) has no rate.** DTF is itself a heat-transfer process,
  so `heat` may now be redundant. It is still in the vocabulary and still used
  by one fixture product, and the validator warns that it cannot be costed.
  Retire it, or price it.
- **`woven_label` has no rate either** — same warning, same decision.

Embroidery has no quantity breaks recorded. If a 500-piece embroidery run costs
less per piece than a 25-piece run, that is not yet represented: `embroidery`
would need `priced_by` to account for both size and quantity, which the current
model does not support. Worth saying now if it is true.
