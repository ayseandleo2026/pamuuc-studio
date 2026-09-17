# PAMUUC — website intake

One Cloudflare Worker behind both sides of the site. The site itself stays
static on GitHub Pages; only the forms post here.

| Route | What it is |
| --- | --- |
| `POST /enquiry` | Custom Uniforms — replaces the Formspree endpoint |
| `POST /quote` | Merchandise — a configured basket, optionally with artwork |
| `POST /subscribe` | the offer pop-up |
| `GET /artwork/<key>` | the uploaded file, at an unguessable URL |
| `GET /health` | is it up |

## How a request is answered

The studio email has **Reply-To set to the customer**. Answering a quote is
hitting Reply in the inbox — that is the whole mechanism, and it needs no
portal, no login and no back office.

Three places a request lands, in order of durability:

1. **Email** to `simone@pamuuc-studio.com` — the request itself.
2. **A row in the Google Sheet** — so requests are countable rather than buried
   in a thread.
3. **KV, for 90 days** — a safety net if either of the above fails. Deliberately
   not the system of record: it holds names and addresses, and personal data you
   do not keep is personal data you cannot lose.

## Deploying

From this folder:

```bash
npx wrangler login
npx wrangler deploy
```

Then set the four secrets. These never appear in the repo — the repo is public.

```bash
npx wrangler secret put SMTP_HOST
npx wrangler secret put SMTP_USER
npx wrangler secret put SMTP_PASS
npx wrangler secret put SHEET_URL
```

- `SMTP_HOST` — Purelymail's outgoing server
- `SMTP_USER` / `SMTP_PASS` — the `simone@pamuuc-studio.com` mailbox and an
  **app password**, not the account password
- `SHEET_URL` — the Apps Script deployment URL from the step below

Everything else is in `wrangler.toml` and is not sensitive.

Check it is alive:

```bash
curl https://pamuuc-intake.<your-subdomain>.workers.dev/health
```

## The Google Sheet

Sheet: **PAMUUC — Requests (website intake)**.

In the sheet: **Extensions → Apps Script**, replace everything with the script
below, then **Deploy → New deployment → Web app**, with *Execute as* **Me** and
*Who has access* **Anyone**. Copy the deployment URL into `SHEET_URL` above.

"Anyone" sounds alarming and is not: the URL is unguessable, the script only
appends, and it never reads anything back out.

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var body = JSON.parse(e.postData.contents);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) { return body[h] == null ? '' : body[h]; });
  sheet.appendRow(row);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

It maps by column heading, so reordering or adding columns in the sheet needs no
change here. Put these in row 1 — spelling and case must match, and any you leave
out are simply not recorded:

```
Reference · Received · Type · Name · Company · Email · Phone · Country · Website
Product · SKU · Colour · Quantity · Fit · Weight · Personalisation · Placement
Project type · Team size · Timeline · Proposed call
Artwork · Artwork file · Offer code · Message · Consent · Locale · Source
Status · Answered
```

`Status` and `Answered` are left blank on purpose — they are yours to fill in.

## Pointing the site at it

One constant in the site's content config:

```json
"form": { "endpoint": "https://pamuuc-intake.<your-subdomain>.workers.dev" }
```

The enquiry form posts to `/enquiry`, the merchandise quote to `/quote`, the
offer pop-up to `/subscribe`.

## Why SMTP and not an email API

So PAMUUC keeps sending through the mailbox it already pays for. Workers can
open TCP sockets; only port 25 is blocked, and that is the server-to-server
relay port, not the submission port. `src/smtp.js` speaks SMTP over implicit
TLS on 465.

The caveat: Purelymail is mailbox hosting, not a transactional sender. Mail to
your own domain will be fine. The **customer confirmation** is the one that
depends on Purelymail's reputation. If it ever starts landing in spam, replacing
`sendMail()` with an HTTP call to Resend or Postmark is the only change — every
caller stays as it is.

## Artwork

Goes to the `pamuuc-artwork` R2 bucket, and reaches the studio email two ways:
**attached** when it is under 8MB, and **linked** always. Attaching matters — an
attachment is still in the thread a year later and opens on a phone. But logos
also arrive as 40MB AI and EPS files, and a message that size is refused by the
receiving server, which would take the whole request down with it. So: attach
under the cap, link above it, link either way, and the email says which happened.

The bucket is not public; files come back only through `/artwork/<key>`, which is
unguessable, uncached and `noindex`.

Limits live at the top of `src/index.js` — `MAX_ARTWORK` (25MB, what we accept at
all) and `ATTACH_MAX` (8MB, what we attach).

## Spam

A honeypot field (`_gotcha`) that no human fills in, and an origin allow-list.
If that stops being enough, Cloudflare Turnstile is free and invisible and slots
in at the top of `handleIntake`.
