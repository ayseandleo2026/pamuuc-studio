# SEO and AI visibility — audit record

Scored against *PAMUUC Studio SEO AI Audit Specification* (OpenAI Codex / Deep
Research, 4 September 2026), twenty controls in dependency order.

**Method.** Controls marked *automated* are checked by `tools/seo-audit.py`
against the built `dist/`, plus live HTTP checks against the production host.
Controls marked *manual* need first-party data, client permission, or an
account this repository cannot reach; they are scored **Blocked** with the
named owner of the missing input. No control is scored Pass on assumption.

Re-run: `node tools/build.mjs && node tools/seo-audit.py`

---

## Scores

| # | Control | Class | Score | Note |
|---|---------|-------|-------|------|
| 1 | Discovery, crawl, index, policy eligibility | Gate | **Pass** | 40 indexable pages, all server-rendered, no nosnippet, no JS dependency for content |
| 2 | Canonical domain, redirects, URL consistency, sitemap | Gate | **Pass** | http→https, www→apex, no-slash→slash all 301 in one hop; 40 canonicals = 40 sitemap URLs |
| 3 | Measurement baseline and qualified outcomes | Gate | **Blocked** | Needs Search Console + GA4 access. Definitions drafted in `SEO-MEASUREMENT.md` |
| 4 | Audience, keyword, prompt, intent map | Demand | **Partial** | Hypothesis map drafted in `SEO-INTENT-MAP.md`; needs validation against real query data |
| 5 | Commercial service page architecture | Demand | **Fail** | No sector pages exist. Sector content is 66–105 words each — too thin to publish without studio input |
| 6 | Complete service decision information | Conversion | **Partial** | 16 of 17 required facts present on the homepage; compliance/sustainability absent |
| 7 | Original, first-hand, non-commodity editorial | Content | **Blocked** | Requires studio knowledge to assess and extend; 6 article families exist |
| 8 | Indexable case studies and verifiable proof | Proof | **Fail** | Three projects are summarised on the homepage; none has its own page. Needs client permission |
| 9 | Topic hubs, internal links, cannibalisation | Architecture | **Pass** | Zero orphans; every indexable page has real `<a href>` inbound links |
| 10 | Authorship, expertise, sourcing, transparency | Trust | **Fail** | `Person` markup on 30 pages but no author or About page exists to point at |
| 11 | On-page relevance and search presentation | Relevance | **Pass** | 40 unique titles and descriptions, one `<h1>` each, no heading jumps |
| 12 | Business entity consistency and site trust | Trust | **Partial** | Organization carries legalName, vatID, address, areaServed, logo and now contactPoint; only `sameAs` is outstanding |
| 13 | External authority, links, mentions, reviews | Authority | **Blocked** | Off-site. Needs Search Console Links + a client permission process |
| 14 | Multilingual and regional implementation | Expansion | **Pass** | 5 locales, reciprocal hreflang with x-default, self-referencing canonicals |
| 15 | Accurate structured data | Enhancement | **Pass** | 155 objects, all valid, all required properties present, all matching visible content |
| 16 | Local search and Google Business Profile | Local | **Blocked** | Off-site. Eligibility question: does the Barcelona studio receive clients? |
| 17 | Mobile, Core Web Vitals, accessibility | Experience | **Partial** | CLS 0, TTFB 167 ms, 123 KB, 0 third-party requests. LCP/INP need field data from PageSpeed Insights |
| 18 | Image and video discoverability | Media | **Pass** | Every image has alt text, explicit dimensions and a loading hint; 135 sitemap image entries |
| 19 | AI crawler and snippet access policy | AI access | **Pass** | Explicit three-group policy in `robots.txt` (fixed — see below) |
| 20 | Agent readability and enquiry execution | Agent execution | **Pass** | `<main>` landmark, labelled controls, real links and buttons, keyboard-operable |

**9 Pass · 4 Partial · 3 Fail · 4 Blocked**

---

## Faults found and fixed

**Control 19 — no crawler policy existed.** `robots.txt` named no bot at all.
Every crawler fell through the wildcard, so search visibility, user-directed
retrieval and model training were one undifferentiated decision nobody had
made. Now stated as three explicit groups. All remain allowed; the training
group is the one real business choice and is a one-word edit.

**Control 20 — the form status region was never announced.** The paragraph
that reports "sending", success and failure was a bare `<p>`. A screen reader
or agent submitting the form was told nothing about the outcome, which fails
the control's requirement to "recover from validation errors, and reach a
clear confirmation step". It now carries `role="status"`, `aria-live="polite"`
and `aria-atomic="true"`.

**Control 15 — `Organization.contactPoint` was absent.** Google lists it as
recommended. Added with contact type, email, area served and available
languages — every value already stated on the page. `sameAs` deliberately
stays out until the studio confirms its official profile URLs; an unverified
profile link is worse than none.

**Control 1 — `noindex` defeated by `Disallow`.** The legal pages carried
`<meta name="robots" content="noindex">` *and* were disallowed in
`robots.txt`. A crawler blocked from fetching a page can never read its
noindex, which left those URLs eligible to appear as bare links. The
`Disallow` lines are removed; the noindex now does its job.

---

## Open faults, and who can close them

| Control | Fault | Needs |
|---|---|---|
| 5 | No sector pages | Studio: role programmes, operational detail and proof per sector. Publishing 66–105-word pages would be the thin, scaled content the specification rejects |
| 8 | No case study pages | Client permission to name projects, publish photography, and state outcomes |
| 10 | No author or About page | Real role, relevant project experience, and a photograph for the named author |
| 6 | No compliance/sustainability facts | Actual certifications and fabric standards, with evidence. Must not be inferred |
| 12 | `sameAs` unverified | Official social and directory profile URLs, plus the legal entity name |
| 3 | No baseline | Search Console and GA4 access |
| 16 | GBP eligibility unknown | Whether the Barcelona studio receives clients at a real address |

## Known limitation

`https://pamuuc-studio.com/index.html` returns 200 rather than redirecting to
`/`. GitHub Pages serves the file directly and offers no server-side rewrite.
The canonical tag on that URL points at `/`, which is the documented
consolidation signal, so the duplicate is annotated rather than eliminated.
Removing it entirely would require a host with rewrite rules.
