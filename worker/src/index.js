/* ============================================================================
   PAMUUC — website intake
   ---------------------------------------------------------------------------
   One Worker behind both sides of pamuuc-studio.com. The site stays static on
   GitHub Pages; only the forms post here.

     POST /enquiry    Custom Uniforms — replaces the Formspree endpoint
     POST /quote      Merchandise — a configured basket, optionally with artwork
     POST /subscribe  the offer pop-up
     GET  /artwork/:key   the uploaded file, at an unguessable URL
     GET  /health

   Where a request ends up, in order of durability:
     1. an email to the studio, with Reply-To set to the customer, so answering
        is just hitting Reply in the inbox — that is the whole "answer the
        customer" mechanism, and it needs no portal;
     2. a row in the Google Sheet, so requests are countable;
     3. a record in KV with a TTL, purely as a safety net if either of those
        fails. It is deliberately not the system of record: it holds names and
        addresses, and personal data you do not keep is personal data you
        cannot lose.

   No secret appears in this file. Everything sensitive is a Worker secret.
   ========================================================================= */
import { sendMail } from './smtp.js';
/* The three templates live in emails.js and nowhere else. The preview that
   was approved is rendered by these same functions, so the mail that goes out
   cannot quietly drift from the mail that was signed off. */
import { studioEmail, customerEmail, offerEmail } from './emails.js';

/* Only these origins may post. A public endpoint with an open CORS policy is
   somebody else's free mailer within a fortnight. */
const ALLOWED = [
  'https://pamuuc-studio.com',
  'https://www.pamuuc-studio.com',
  'http://localhost:3000',
  'http://localhost:8801',
];

const KEEP_DAYS = 90;
const MAX_ARTWORK = 25 * 1024 * 1024;   /* 25 MB — what we will accept at all */
/* Base64 inflates by a third, so 8MB of artwork is ~11MB on the wire. Most
   mail servers refuse a message over 25MB total, and a refusal here would lose
   the request — so anything larger travels as a link only. */
const ATTACH_MAX = 8 * 1024 * 1024;

const json = (data, status, origin) => new Response(JSON.stringify(data), {
  status: status || 200,
  headers: { 'content-type': 'application/json; charset=UTF-8', ...cors(origin) },
});

function cors(origin) {
  const ok = ALLOWED.includes(origin);
  return {
    'access-control-allow-origin': ok ? origin : ALLOWED[0],
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
}

const clean = (s, max) => String(s == null ? '' : s).trim().slice(0, max || 500);

/* Enough to catch a typo, not enough to argue with a real address. */
const isEmail = (s) => /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(String(s || ''));

function reference(prefix) {
  const d = new Date();
  const ym = String(d.getUTCFullYear()).slice(2) + String(d.getUTCMonth() + 1).padStart(2, '0');
  const rand = [...crypto.getRandomValues(new Uint8Array(3))]
    .map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${prefix}-${ym}-${rand}`;
}

/* The sheet is a convenience, so a failure there must never fail the request —
   the customer has already been told we have it. */
async function appendSheet(env, row) {
  if (!env.SHEET_URL) return;
  try {
    await fetch(env.SHEET_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(row),
    });
  } catch (e) {
    console.error('sheet append failed', e.message);
  }
}

async function store(env, ref, record) {
  if (!env.REQUESTS) return;
  try {
    await env.REQUESTS.put(ref, JSON.stringify(record), {
      expirationTtl: KEEP_DAYS * 24 * 60 * 60,
    });
  } catch (e) {
    console.error('kv put failed', e.message);
  }
}

/* ---- handlers ----------------------------------------------------------- */

async function readForm(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    const j = await request.json();
    return { fields: j, file: null };
  }
  const fd = await request.formData();
  const fields = {}; let file = null;
  for (const [k, v] of fd.entries()) {
    if (typeof v === 'string') fields[k] = v;
    else if (!file && v.size) file = v;
  }
  return { fields, file };
}

async function handleIntake(kind, request, env, origin) {
  const { fields, file } = await readForm(request);

  /* Hidden fields no human fills in. Cheap, and it stops the bulk of it.
     `website` is the live Custom Uniforms form's honeypot — src/js/site.js
     bails if it has a value — so a request carrying one is a bot, not somebody
     telling us their web address. It is named here rather than inferred,
     because reading it as a real field would have put spam in the studio's
     inbox dressed as a customer's URL. */
  if (clean(fields._gotcha) || clean(fields.website)) {
    return json({ ok: true, ref: reference('X') }, 200, origin);
  }

  const f = {
    name: clean(fields.name, 120),
    company: clean(fields.company, 160),
    email: clean(fields.email, 200),
    phone: clean(fields.phone, 60),
    country: clean(fields.country, 80),
    product: clean(fields.product, 200),
    sku: clean(fields.sku, 80),
    colour: clean(fields.colour, 80),
    quantity: clean(fields.quantity, 40),
    fit: clean(fields.fit, 60),
    weight: clean(fields.weight, 60),
    personalisation: clean(fields.personalisation, 120),
    placement: clean(fields.placement, 120),
    code: clean(fields.code, 40).toUpperCase(),
    /* Custom Uniforms asks a great deal more than Merchandise does, and the
       studio has to see all of it — an enquiry with the team size and the
       timeline missing is a phone call we did not need to make. The hyphenated
       names are the live form's; they stay as they are so the form does not
       have to change. */
    teamSize: clean(fields['team-size'], 60),
    projectType: clean(fields['project-type'], 160),
    timeline: clean(fields.timeline, 120),
    meeting: clean(fields['meeting-datetime'], 40),
    /* the enquiry form calls the message "brief" */
    message: clean(fields.message || fields.brief, 4000),
    consent: clean(fields.consent, 20),
    locale: clean(fields.locale, 8) || 'en',
  };
  if (!isEmail(f.email)) return json({ ok: false, error: 'email' }, 400, origin);
  if (!f.name && !f.company) return json({ ok: false, error: 'name' }, 400, origin);

  const ref = reference(kind === 'quote' ? 'QTE' : 'ENQ');

  /* Artwork goes to R2 and comes back two ways: attached to the studio email
     when it is small enough to attach safely, and always as a link.
     Attaching matters — an attachment is there in the thread a year later, and
     opens on a phone. But logos also arrive as 40MB AI and EPS files, and a
     message that large is refused by the receiving server, which would take the
     whole request down with it. So: attach under the cap, link above it, link
     always. */
  let artworkUrl = null;
  let attachments = [];
  if (file && env.ARTWORK) {
    if (file.size > MAX_ARTWORK) return json({ ok: false, error: 'artwork_too_large' }, 413, origin);
    const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'artwork';
    const key = `${ref}/${crypto.randomUUID()}/${safeName}`;
    /* read once, use for both — streaming to R2 would consume the body */
    const buf = await file.arrayBuffer();
    await env.ARTWORK.put(key, buf, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
    f.artworkName = file.name;
    f.artworkSize = buf.byteLength;
    artworkUrl = `${new URL(request.url).origin}/artwork/${encodeURIComponent(key)}`;
    if (buf.byteLength <= ATTACH_MAX) {
      attachments = [{
        filename: safeName,
        contentType: file.type || 'application/octet-stream',
        bytes: new Uint8Array(buf),
      }];
    } else {
      f.artworkTooBigToAttach = true;
    }
  }

  const record = { ref, kind, at: new Date().toISOString(), ...f, artwork: artworkUrl };
  await store(env, ref, record);

  const to = env.STUDIO_TO;
  const s = studioEmail(kind, ref, f, artworkUrl);
  const c = customerEmail(kind, ref, f);

  /* The studio notification is the one that must not fail — it is the request.
     The customer confirmation is a courtesy; if it bounces we still have the
     job, so it is sent on a best-effort basis and never fails the response. */
  await sendMail(env, { to, subject: s.subject, text: s.text, html: s.html, replyTo: f.email, attachments });
  try {
    await sendMail(env, { to: f.email, subject: c.subject, text: c.text, html: c.html, replyTo: to });
  } catch (e) {
    console.error('customer confirmation failed', e.message);
  }

  await appendSheet(env, {
    Reference: ref, Received: record.at, Type: kind === 'quote' ? 'Merchandise' : 'Custom uniforms',
    Name: f.name, Company: f.company, Email: f.email, Phone: f.phone, Country: f.country,
    Product: f.product, SKU: f.sku, Colour: f.colour, Quantity: f.quantity,
    Fit: f.fit, Weight: f.weight, Personalisation: f.personalisation, Placement: f.placement,
    'Project type': f.projectType, 'Team size': f.teamSize, Timeline: f.timeline,
    'Proposed call': f.meeting,
    Artwork: artworkUrl || '', 'Artwork file': f.artworkName || '',
    'Offer code': f.code, Message: f.message, Consent: f.consent,
    Locale: f.locale, Source: origin || '', Status: 'New', Answered: '',
  });

  return json({ ok: true, ref }, 200, origin);
}

async function handleSubscribe(request, env, origin) {
  const { fields } = await readForm(request);
  if (clean(fields._gotcha)) return json({ ok: true }, 200, origin);
  const email = clean(fields.email, 200);
  const code = clean(fields.code, 40).toUpperCase() || 'FIRST';
  if (!isEmail(email)) return json({ ok: false, error: 'email' }, 400, origin);

  await store(env, `SUB-${Date.now()}-${email}`, { kind: 'subscribe', email, code, at: new Date().toISOString() });

  const m = offerEmail(code, env.OFFER_TIERS ? JSON.parse(env.OFFER_TIERS) : null);
  try {
    await sendMail(env, {
      to: email, replyTo: env.STUDIO_TO,
      subject: m.subject, text: m.text, html: m.html,
    });
  } catch (e) {
    console.error('code email failed', e.message);
    return json({ ok: false, error: 'send' }, 502, origin);
  }

  await appendSheet(env, {
    Reference: '', Received: new Date().toISOString(), Type: 'Subscriber',
    Email: email, 'Offer code': code, Source: origin || '', Status: 'Subscribed',
  });
  return json({ ok: true }, 200, origin);
}

async function handleArtwork(request, env, origin) {
  if (!env.ARTWORK) return new Response('Not configured', { status: 500 });
  const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/artwork\//, ''));
  const obj = await env.ARTWORK.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const h = new Headers(cors(origin));
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('content-disposition', `attachment; filename="${key.split('/').pop()}"`);
  /* unguessable, but never indexed and never cached at the edge */
  h.set('cache-control', 'private, no-store');
  h.set('x-robots-tag', 'noindex, nofollow');
  return new Response(obj.body, { headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === '/health') return json({ ok: true, at: new Date().toISOString() }, 200, origin);
    if (url.pathname.startsWith('/artwork/') && request.method === 'GET') {
      return handleArtwork(request, env, origin);
    }

    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, origin);
    if (origin && !ALLOWED.includes(origin)) return json({ ok: false, error: 'origin' }, 403, origin);

    try {
      if (url.pathname === '/quote')     return await handleIntake('quote', request, env, origin);
      if (url.pathname === '/enquiry')   return await handleIntake('enquiry', request, env, origin);
      if (url.pathname === '/subscribe') return await handleSubscribe(request, env, origin);
      return json({ ok: false, error: 'not_found' }, 404, origin);
    } catch (e) {
      /* The customer must never see an SMTP transcript. */
      console.error(url.pathname, e && e.stack || e);
      return json({ ok: false, error: 'server' }, 500, origin);
    }
  },
};
