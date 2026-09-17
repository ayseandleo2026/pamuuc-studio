# PAMUUC — Public website structure

> **Superseded, 11 September 2026.** The site was rebuilt to the *Pamuk Website
> Structure and Conversion Specification*. The branch names are now Pamuk Studio
> and Pamuk Merchandise, the Studio home has eight defined sections, merchandise
> gained a quote basket (add → basket → contact → review → received) in place of
> submitting from the product page, and the shared root is a compact service
> choice rather than a full-viewport split. This file documents the earlier
> structure; see the specification for the current one.

One domain, two sites. The root is a split gateway; past it you are inside either
**Custom Uniform Projects** or **Merchandise**. Each branch has its own home, its own
navigation and its own vocabulary. Neither borrows the other's nav — the only crossings
are one header button, the footer, and the gateway itself.

Structure only. Nothing here describes the design language.

---

## Route map

| Route | Page | Branch |
|---|---|---|
| `/` | Gateway — the split | none |
| `/custom` | Custom uniforms — home | Custom |
| `/sectors` | Sectors | Custom |
| `/process` | Process | Custom |
| `/work` | Selected work | Custom |
| `/form` → `/review` → `/done` | Inquiry questionnaire | Custom |
| `/merch` | Merchandise — home | Merchandise |
| `/collections` | Collections index | Merchandise |
| `/collection/<slug>` | One collection | Merchandise |
| `/products` | All products | Merchandise |
| `/method` | Personalisation | Merchandise |
| `/product/<id>` | Product page | Merchandise |
| `/login` | Customer login | shared |

Collection slugs are derived from the catalogue's own categories, so an imported CSV
cannot leave the collections empty.

---

## Shared chrome

### Header — changes per branch

| | Gateway | Custom | Merchandise |
|---|---|---|---|
| Brand | → `/` | → `/` | → `/` |
| Branch label | — | Custom Uniforms | Merchandise |
| Nav | — | Overview · Sectors · Process · Work | Collections · All products · Personalisation |
| Cross-link | — | → Merchandise | → Custom Uniforms |
| Right | Customer login | Customer login · Start your project | Customer login · Browse all products |

Below 900px the nav collapses into a menu sheet: the branch's own pages first, then the
way across to the other site, then login. Below 620px the branch label drops.

### Footer — identical on every page, gateway included

Five columns:

1. **Identity** — brand, address, company registration, email, phone, opening hours
2. **Custom uniform projects** — Overview · Sectors · Process · Selected work · Start a project
3. **Merchandise** — Merchandise home · Collections · All products · Personalisation
4. **Collections** — all seven collections, linked individually
5. **Account** — Customer login · Start a project

Base bar: copyright · Privacy policy · Terms and conditions · Cookie policy · Legal notice

---

# Part 1 — Home page (the gateway)

A choice, not a landing page. Two halves, then an indexable band, then the footer.

### 1. The split — fills the first screen

Two equal halves, side by side on desktop, stacked on mobile. Each half is a single
click target and carries:

- Label (Offer one / Offer two)
- Title — *Custom uniform projects* / *Merchandise*
- One-paragraph description
- Three supporting facts
- Entry call to action

| | Left half | Right half |
|---|---|---|
| Title | Custom uniform projects | Merchandise |
| Fact 1 | Built around your org chart | 184 products across seven collections |
| Fact 2 | Prototypes fitted on your own people | Embroidery, screen print, transfer and DTG |
| Fact 3 | Reorder from the approved specification | Minimums from 25 pieces |
| Goes to | `/custom` | `/merch` |

### 2. Introduction band — below the split

Carries the page's `h1` and the only body copy the root has. It exists so the strongest
URL on the site is not an image with no text on it.

- Eyebrow — Barcelona · since 2019
- `h1` — *Uniforms designed for the work, not adapted from stock.*
- Paragraph covering both offers
- Six sector tags

### 3. Footer

---

# Part 2 — Custom Uniform Projects

Five pages plus a nine-step inquiry flow.

## 2.1 Overview — `/custom`

| # | Section | Contents |
|---|---|---|
| 1 | Hero | `h1`, description, two CTAs (Start your project · See the six stages) |
| 2 | What the project is | *Four things a custom project gives you that a catalogue cannot* — 4 numbered cards |
| 3 | Process | *Six stages, each ending in a decision that is yours* — 6 stage cards, 2 CTAs |
| 4 | Sectors | *Where a uniform decision is operational, not decorative* — 6 cards, 1 CTA |
| 5 | By the numbers | *Four figures we can trace to a stored record* — 4 statistics |
| 6 | Selected work | *Three projects, described honestly* — 3 cards, 1 CTA |
| 7 | Closing CTA | *Start with a conversation, not a brief* — 2 CTAs |

## 2.2 Sectors — `/sectors`

Breadcrumb: Custom uniforms / Sectors

| # | Section | Contents |
|---|---|---|
| 1 | Page head | `h1`, description |
| 2 | Sector list | 6 entries, each: role coverage, constraints, typical project size |
| 3 | Closing CTA | *Your sector is not on the list?* |

The six: Hospitality · Wellness & spa · Healthcare · Retail & flagship ·
Corporate & events · Food production

## 2.3 Process — `/process`

Breadcrumb: Custom uniforms / Process

| # | Section | Contents |
|---|---|---|
| 1 | Page head | `h1`, description |
| 2 | The six stages | One entry per stage — what happens, and what you approve |
| 3 | Before and after | *The two parts of a project that are not a stage* — 2 cards |
| 4 | Closing CTA | *Eight questions is the whole of step one* |

Stages: Design (only if design is bought) · Development · Prototype Fitting ·
Pre Production · Production · Delivery

## 2.4 Selected work — `/work`

Breadcrumb: Custom uniforms / Selected work

| # | Section | Contents |
|---|---|---|
| 1 | Page head | `h1`, description |
| 2 | Case list | 3 projects, each: metadata, what it was, *what we learned* |
| 3 | Closing CTA | *Every one of these started with eight questions* |

Cases: Grup Marítim Hotels · Clínica Bonanova · Restaurant Marítim

## 2.5 Inquiry flow — `/form` → `/review` → `/done`

Nine steps, then a review of the answers, then confirmation. Creates an **inquiry only**
— never an account, never a project.

1. Who are you, and what does your business do?
2. Where do your people work?
3. How many people, and in which roles?
4. What garments do you have in mind?
5. What is the budget range, and how do you buy?
6. What should it look like?
7. What matters most in the fabric?
8. When do you need this, and where does it go?
9. Anything else we should know?

---

# Part 3 — Merchandise

An e-commerce structure: home → collections → collection → product.

## 3.1 Merchandise home — `/merch`

| # | Section | Contents |
|---|---|---|
| 1 | Hero | `h1`, description, two CTAs (Browse all products · Shop by collection) |
| 2 | Collections | *Seven collections, ordered the way an order usually grows* — 7 collection cards |
| 3 | Popular right now | *Eight products that carry decoration well* — 8 product cards, 1 CTA |
| 4 | Personalisation | *Four ways to put your identity on a garment* — 4 method cards, 1 CTA |
| 5 | How ordering works | *Four steps from a product page to a delivery* — 4 numbered cards |
| 6 | Closing CTA | *Not sure which product takes your logo best?* |

## 3.2 Collections index — `/collections`

Breadcrumb: Merchandise / Collections

| # | Section | Contents |
|---|---|---|
| 1 | Page head | `h1`, description |
| 2 | Collection cards | 7 cards, each: cover, name, description, product count, starting price |

Order — the order a merchandise programme usually grows in, not alphabetical:

| Collection | Products |
|---|---|
| T-shirts | 44 |
| Polos | 8 |
| Shirts | 10 |
| Sweatshirts | 62 |
| Outerwear | 35 |
| Pants & shorts | 10 |
| Accessories | 15 |

## 3.3 One collection — `/collection/<slug>`

Breadcrumb: Merchandise / Collections / *collection name*

| # | Section | Contents |
|---|---|---|
| 1 | Page head | `h1` = collection name, description, strip of all seven collections |
| 2 | Count bar | Product count · starting price · minimum |
| 3 | Product grid | Every product in the collection |
| 4 | Note | Why colours are shown on the listing |

## 3.4 All products — `/products`

Breadcrumb: Merchandise / All products

| # | Section | Contents |
|---|---|---|
| 1 | Page head | `h1`, description, filter chips (All + seven collections) |
| 2 | Count bar | Product count · active filter |
| 3 | Product grid | All 184 products, or the filtered set |

**Product card** (shared by every grid): image, minimum, lead time, stock colours,
name, starting price or *On request*, Configure.

## 3.5 Personalisation — `/method`

Breadcrumb: Merchandise / Personalisation

| # | Section | Contents |
|---|---|---|
| 1 | Page head | `h1`, description |
| 2 | Method list | 4 entries — what it is, what it suits, what the setup is |
| 3 | Placements and artwork | 3 cards — artwork we can use · what we send back · what happens next time |
| 4 | Closing CTA | *Price your own configuration* |

Methods: Embroidery · Screen print · Transfer (DTF) · Direct to garment

## 3.6 Product page — `/product/<id>`

Breadcrumb: Merchandise / All products / *collection* / *product*

| # | Section | Contents |
|---|---|---|
| 1 | Media column | Hero image, thumbnails, placement map (*where your identity goes*) |
| 2 | Configurator | Title, reference, weight, colour count, price |
| | Step 1 | Colour — swatches |
| | Step 2 | Quantity — price break tiers |
| | Step 3 | Personalisation — up to 3 placements, each with method, size, colours, artwork upload |
| 3 | Quote panel | Garment, per-piece, quantity, setup charges, total, delivery speed |
| 4 | Actions | Request this quote · Ask us to design it |
| 5 | Detail tabs | Specification · Decoration limits · Sizes & colours · How it works |
| 6 | Related | *More in \<collection\>* — 4 products |
| 7 | Action bar | Sticky: running total and Request this quote |

---

## Open questions

- **URL scheme for the live build.** One domain with two sections
  (`/custom-uniforms/`, `/merchandise/`) rather than subdomains, so authority stays
  consolidated. Not yet fixed.
- **Sitemaps** — one, or one per branch.
- **Product refinement** — what is personalisable per product, which methods are allowed
  per product, and how many per product. Deliberately deferred; the structure above does
  not depend on it.
