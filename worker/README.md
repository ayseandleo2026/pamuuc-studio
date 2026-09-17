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

**Sheet:** [PAMUUC — Requests (website intake)](https://docs.google.com/spreadsheets/d/1jbd6FyobCuyV_9xLAaH100R_pXUXNJcqQeJIexGYyAg/edit)
**Script:** [`sheet/Code.gs`](sheet/Code.gs)

There is nothing to set up in the sheet itself. The script writes its own
header row — 29 columns — and adds a column if the Worker ever starts sending
a field the sheet does not have. Typing the headings by hand would only be a
chance to mistype one, and a mistyped heading fails silently: the column simply
stays empty forever.

### Setting it up

1. Open the sheet.
2. **Extensions → Apps Script.** A tab opens with an empty `Code.gs`.
3. Select everything in the editor and paste in the contents of
   [`worker/sheet/Code.gs`](sheet/Code.gs).
4. **Save** (⌘S). Name the project `PAMUUC intake` if it asks.
5. *Optional:* choose **`setUp`** in the function dropdown and press **Run** —
   this draws the header row now instead of when the first request arrives.
   Google will ask you to authorise the script the first time; it only ever
   touches this one spreadsheet.
6. **Deploy → New deployment.**
   - Click the gear beside *Select type* and choose **Web app**.
   - *Description:* `intake`
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
   - **Deploy**, authorise if asked, and copy the **Web app URL**.

"Anyone" sounds alarming and is not. The URL is unguessable, the script only
appends or updates a row, and it never reads anything back out. It is the same
posture as a form endpoint.

### Check it before wiring it in — and not in your own browser

This is the step that catches the one mistake everybody makes, and it only
catches it if you do it **signed out**.

Opening the Web app URL in your normal browser proves nothing: you are signed
in as the owner, so it works whatever *Who has access* is set to. The Worker
is not signed in as anybody. Test the way the Worker will:

```bash
curl -sSL "PASTE_THE_WEB_APP_URL_HERE"
```

or open the URL in a **private window**. You want:

```json
{"ok":true,"sheet":"Requests","rows":0,"columns":0}
```

`"columns":0` is correct before the first request — the header row is drawn on
the first write, or when you run `setUp` from the editor.

If instead you get a page of HTML saying **"Impossibile aprire il file in questo
momento"** / **"Sorry, unable to open the file at this time"**, the deployment is
private. Fix it:

**Deploy → Manage deployments → ✏️ (edit) → Who has access: _Anyone_ → Deploy.**

Not *Anyone with a Google Account* — that still refuses the Worker, which has
no account. *Anyone* is right here: the URL is unguessable, the script only
appends or updates one row, and it never reads anything back out.

Get this wrong and nothing tells you. The Worker treats a sheet failure as
non-fatal — the customer's request still succeeds and the studio still gets the
email — so the only symptom is a spreadsheet that stays empty.

### Then give it to the Worker

```bash
npx wrangler secret put SHEET_URL
```

and paste the same URL.

### What it does that the obvious version does not

- **Builds its own header row**, so the sheet and the Worker cannot drift apart.
- **Adds a column** for a field it has not seen, instead of dropping it. That
  is how you avoid discovering months later that "Proposed call" was never
  being recorded.
- **Takes a lock.** Two forms submitted in the same second would otherwise read
  the same last row and one would overwrite the other.
- **Updates rather than duplicates** when a reference it already holds comes
  round again.
- **Never throws.** A failure here costs a row in a spreadsheet — the request
  itself was already emailed to the studio before this ran.

### Re-deploying after an edit

Apps Script keeps serving the deployed version, not the saved one. After
changing the script: **Deploy → Manage deployments → ✏️ → Version: New version
→ Deploy.** The URL stays the same, so `SHEET_URL` does not change.

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
