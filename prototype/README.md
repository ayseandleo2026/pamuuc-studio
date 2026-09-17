# PAMUUC Suite — connected platform prototype

A working prototype of all three surfaces — public website, Customer Account,
Studio Back Office — built from **one dataset**. It is not three mockups that
look alike; it is one store with three projections, which is the only way to
demonstrate the specification's central claim.

Published as an Artifact: <https://claude.ai/code/artifact/311419b9-1e32-4f42-a04d-aee35f21fdbb>

```bash
bash build.sh          # concatenates the sources into pamuuc-suite.html
node smoke.js          # renders all 121 screens for every role, headless
node wf.js             # the §16 acceptance criteria, as assertions
node import-check.js   # CSV → mockup, end to end
browser-audit.js       # paste into the console: overflow, 11px floor,
                       # broken images, every route in both themes
```

Merchandise catalogue data is populated from a single CSV — the template, a
reference sheet of every allowed value, and a validator live in
[`import-templates/`](import-templates/).

```bash
node import-templates/validate-merch-csv.mjs <file>
```

`build.sh` refuses to build if a source file contains a literal `</script`.
`wf.js` exits non-zero on a failure — wire it into CI beside the site's own
`node tools/build.mjs --check` and the specification stops being a document
people remember to honour.

## Why the files are split this way

```
01-fonts.css      Gilmer, five weights, embedded as data: URIs (129 KB)
02-tokens.css     the ONLY palette — shared with the marketing site
03-components.css one status pill, one card, one table, one timeline
04-layout.css     three surfaces, three densities, same chrome language
10-data.js        STATUS dictionary, STAGES, and the canonical fixture
20-store.js       can(), emit(), and views.* — the three projections
25-actions.js     the only place state is mutated
30/40/50-*.js     public / account / studio screens
60-app.js         router, modals, event delegation
```

**`views.*` in `20-store.js` is the load-bearing part.** Three pure functions
project the same record for three audiences, so "the customer sees a summary,
Studio sees margin" is enforced by code rather than by two hand-maintained
mockups drifting apart. If a record cannot be written as those functions, it is
not specified well enough yet.

## The fixture story

One Barcelona hotel group, chosen to exercise every hard rule at once:

- **PRJ-2418** — Prototype Fitting. Design was purchased, so six stages show.
  Five garments: three approved at round 1 and locked; the wrap jacket at
  round 2; the wool overcoat at round 3 in Manual Resolution. One garment
  carries three colourways including a custom colour.
- **PRJ-2455** — Development, **no** Design stage, development invoice unpaid,
  so the commercial gate is closed. Two open change requests.
- **PRJ-2201** — Completed and delivered. Feeds Reorders from locked snapshots.
- **PRJ-2390** — Another account, in Production, for Studio list variety.

## Sign-ins

No passwords. Marta Riera (Account Admin) and Jordi Vila (Member, scoped to one
project) on the customer side; Leonardo Gobbato (Master), Núria Batlle (Account
Manager) and Sergi Roig (Finance Director) on the studio side. The same `can()`
call drives navigation, buttons and field visibility for all five.

## Known decisions and gaps

- **`--navy` and `--band` hex values were not recoverable.** The previous
  `pamuuc-suite.html` no longer exists on disk, so defensible values were
  chosen. They are one line each in `02-tokens.css`.
- **`--accent:#7F1D16` in the marketing site's `src/css/site.css` is the same
  value this token layer reserves for Merchandise only.** The two codebases
  disagree about red and must be reconciled before either ships.
- **The marketing site publishes three process phases; this uses six.** Fixing
  that means editing `content/home.<loc>.json` in all five languages.
- **Per-customer field overrides are deliberately not built.** Global defaults
  plus "preview as" cover almost every real case at this scale.
- Persistence is `localStorage`, wrapped in try/catch, for per-viewer
  convenience only. The reset button in the surface switcher clears it.
