/* ============================================================================
   The three emails
   ---------------------------------------------------------------------------
   Email is not the web. Gmail strips <style>, Outlook renders through Word, and
   neither can be relied on for flexbox, grid, custom properties or webfonts.
   So: tables for layout, styles inline on every element, explicit colour on
   every piece of text, 600px, and a system font stack — Gilmer will not load,
   and a stack that degrades gracefully beats one that degrades to Times.

   One shell, three bodies. The same functions render the preview and the live
   mail, so what is approved is what sends. §18
   ========================================================================= */

const NAVY = '#011251';
const PAPER = '#F4F2ED';
const RED = '#7F1D16';
const INK = '#0A1024';
const MUTED = '#59617A';
const LINE = '#DFDCD4';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* The line a client shows next to the subject. Without one it pulls the first
   words of the body, which is usually the masthead. */
const preheader = (s) => `<div style="display:none;max-height:0;overflow:hidden;opacity:0;` +
  `mso-hide:all;font-size:1px;line-height:1px;color:#ffffff">${esc(s)}` +
  '&#8203;'.repeat(90) + '</div>';

/**
 * @param {object} o {accent, eyebrow, preheader, body, footNote}
 */
function shell(o) {
  const accent = o.accent || NAVY;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(o.title || 'PAMUUC')}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-text-size-adjust:100%">
${preheader(o.preheader || '')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAPER}">
<tr><td align="center" style="padding:28px 12px 40px">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
         style="width:600px;max-width:100%;background:#FFFFFF;border:1px solid ${LINE}">

    <!-- masthead: a rule in the accent, so the two lines of business are told
         apart at a glance without a second logo -->
    <tr><td style="height:3px;background:${accent};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:22px 32px 0">
      <span style="font:600 13px/1 ${FONT};letter-spacing:.14em;color:${NAVY}">PAMUUC</span>
      <span style="font:400 13px/1 ${FONT};color:${LINE};padding:0 6px">|</span>
      <span style="font:400 13px/1 ${FONT};letter-spacing:.14em;color:${MUTED}">STUDIO</span>
    </td></tr>

    ${o.eyebrow ? `<tr><td style="padding:24px 32px 0">
      <span style="font:700 11px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${accent}">${esc(o.eyebrow)}</span>
    </td></tr>` : ''}

    ${o.body}

    <tr><td style="padding:28px 32px 26px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="border-top:1px solid ${LINE};padding-top:16px">
          ${o.footNote ? `<p style="margin:0 0 10px;font:400 12px/1.5 ${FONT};color:${MUTED}">${o.footNote}</p>` : ''}
          <p style="margin:0;font:400 11px/1.6 ${FONT};color:${MUTED}">
            Pamuk Studio S.L, trading as PAMUUC &middot; Barcelona, Spain &middot; VAT ESB27664994<br>
            <a href="https://pamuuc-studio.com" style="color:${MUTED};text-decoration:underline">pamuuc-studio.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>

  </table>
</td></tr></table>
</body></html>`;
}

/* A label/value row. Empty values are dropped rather than printed blank — an
   email full of "Phone: —" reads as a form, not a message.

   The label column is a fixed 130px rather than shrink-to-fit: each section is
   its own table, and left to themselves they each pick a different column
   width, so the values zig-zag down the page from section to section. */
const row = (k, v) => v
  ? `<tr>
      <td width="130" style="width:130px;padding:7px 16px 7px 0;font:400 13px/1.45 ${FONT};color:${MUTED};vertical-align:top">${esc(k)}</td>
      <td style="padding:7px 0;font:500 14px/1.45 ${FONT};color:${INK};vertical-align:top">${v}</td>
    </tr>`
  : '';

/* Email cannot do tabs, so it does the next best thing: a labelled section
   with a hairline above it. A quote carries fifteen facts about one garment,
   and fifteen rows in a row is a spreadsheet, not a message.

   rows  label/value pairs, empties dropped
   extra raw html under them, inside the same section
   box    lays the section on paper with an accent edge — for the two things
          that must not be skim-read past: the mark, and a proposed call */
function group(label, rows, opts) {
  const o = opts || {};
  const inner = (rows || []).filter(Boolean).join('');
  if (!inner && !o.extra) return '';
  const content =
    (inner ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${inner}</table>` : '') +
    (o.extra || '');

  return `<tr><td style="padding:${o.first ? '20' : '24'}px 32px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${o.first ? '' : `<tr><td style="border-top:1px solid ${LINE};font-size:0;line-height:0;padding:0 0 18px">&nbsp;</td></tr>`}
      <tr><td style="padding:0 0 ${o.box ? '10' : '4'}px;font:700 10px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${MUTED}">${esc(label)}</td></tr>
      <tr><td style="padding:0">${o.box ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
               style="background:${PAPER};border-left:3px solid ${o.accent || NAVY}">
          <tr><td style="padding:14px 18px">${content}</td></tr>
        </table>` : content}</td></tr>
    </table>
  </td></tr>`;
}

/* A datetime-local field arrives as "2026-10-02T14:30". Printed raw it looks
   like a database dump; and parsing it with Date() alone would read it as UTC,
   which is not what the customer picked. So: pull the parts out by hand and
   only use Date for the weekday. */
function when(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(v || '').trim());
  if (!m) return String(v || '');
  const [, y, mo, d, hh, mm] = m;
  let day = '';
  try {
    day = new Date(Date.UTC(+y, +mo - 1, +d)).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  } catch { day = `${d}/${mo}/${y}`; }
  return hh ? `${day} at ${hh}:${mm}` : day;
}

/* The plain-text half of every message. Same sections, same order — a client
   that shows text instead of html must not show a worse email. */
function tsec(title, lines) {
  const body = lines.filter(Boolean).join('');
  return body ? `\n${title.toUpperCase()}\n${body}` : '';
}

const tline = (k, v) => (v ? `${k}: ${v}\n` : '');

const fileSize = (n) => n == null ? '' :
  n < 1024 ? `${n} B` :
  n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;

/* ---- 1. to the studio: a request has arrived ---------------------------- */
export function studioEmail(kind, ref, f, artworkUrl) {
  const merch = kind === 'quote';
  const accent = merch ? RED : NAVY;
  const what = merch ? 'Merchandise quote' : 'New enquiry';
  const summary = [f.quantity && `${f.quantity} pieces`, f.product, f.personalisation]
    .filter(Boolean).join(' · ');

  const body = `
    <tr><td style="padding:10px 32px 0">
      <h1 style="margin:0;font:400 30px/1.15 ${FONT};color:${INK};letter-spacing:-.01em">${esc(ref)}</h1>
      <p style="margin:8px 0 0;font:400 15px/1.5 ${FONT};color:${MUTED}">
        ${esc(f.company || f.name)}${f.country ? ' &middot; ' + esc(f.country) : ''}
      </p>
    </td></tr>

    ${group('Who', [
      row('Contact', esc([f.name, f.lastName].filter(Boolean).join(' '))),
      row('Email', `<a href="mailto:${esc(f.email)}" style="color:${accent};text-decoration:underline">${esc(f.email)}</a>`),
      row('Phone', esc(f.phone)),
      row('Marketing', f.marketingOptIn === 'yes' ? 'Asked to hear from us' : ''),
    ], { first: true })}

    ${merch ? group('The garment', [
      row('Product', esc(f.product)),
      row('Reference', esc(f.sku)),
      row('Colour', esc(f.colour)),
      row('Fit', esc(f.fit)),
      row('Cloth', esc(f.weight)),
    ]) : ''}

    ${merch ? group('The order', [
      row('Quantity', f.quantity ? `<span style="font-size:17px">${esc(f.quantity)}</span> <span style="color:${MUTED};font-weight:400">pieces</span>` : ''),
    ]) : ''}

    ${!merch ? group('The project', [
      row('Looking for', esc(f.projectType)),
      row('Team size', esc(f.teamSize)),
      row('Timeline', esc(f.timeline)),
    ]) : ''}

    ${!merch && f.meeting ? group('They proposed a call', [], {
      box: true, accent,
      extra: `<span style="font:500 17px/1.4 ${FONT};color:${INK}">${esc(when(f.meeting))}</span>`,
    }) : ''}

    ${merch ? group('The mark', [
      row('Method', esc(f.personalisation)),
      row('Where', esc(f.placement)),
    ], {
      box: true, accent,
      extra: artworkUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px">
          <tr><td style="background:${NAVY}">
            <a href="${esc(artworkUrl)}"
               style="display:inline-block;padding:11px 20px;font:500 14px/1 ${FONT};color:#FFFFFF;text-decoration:none">
              Download the artwork</a>
          </td></tr>
        </table>
        <p style="margin:9px 0 0;font:400 12px/1.5 ${FONT};color:${MUTED}">
          ${esc(f.artworkName || 'artwork')}${f.artworkSize ? ' &middot; ' + fileSize(f.artworkSize) : ''}${
            f.artworkTooBigToAttach
              ? ' &middot; too large to attach, use the link'
              : ' &middot; also attached to this email'}
        </p>`
        : `<p style="margin:${f.personalisation || f.placement ? '12' : '0'}px 0 0;font:400 13px/1.5 ${FONT};color:${MUTED}">
             No artwork came with the request.</p>`,
    }) : ''}

    ${f.message ? group(merch ? 'What they wrote' : 'The brief', [
      `<tr><td colspan="2" style="padding:0;font:400 15px/1.6 ${FONT};color:${INK};white-space:pre-wrap">${esc(f.message)}</td></tr>`,
    ]) : ''}
  `;

  const text =
    `${what} — ${ref}\n${f.company || f.name}${f.country ? ' · ' + f.country : ''}\n` +

    tsec('Who', [
      tline('Contact', [f.name, f.lastName].filter(Boolean).join(' ')), tline('Email', f.email),
      tline('Phone', f.phone),
    ]) +

    (merch ? tsec('The garment', [
      tline('Product', f.product), tline('Reference', f.sku), tline('Colour', f.colour),
      tline('Fit', f.fit), tline('Cloth', f.weight),
    ]) : '') +

    (merch ? tsec('The order', [
      tline('Quantity', f.quantity && `${f.quantity} pieces`),
    ]) : '') +

    (!merch ? tsec('The project', [
      tline('Looking for', f.projectType), tline('Team size', f.teamSize),
      tline('Timeline', f.timeline),
    ]) : '') +

    (!merch ? tsec('They proposed a call', [tline('When', f.meeting && when(f.meeting))]) : '') +

    (merch ? tsec('The mark', [
      tline('Method', f.personalisation), tline('Where', f.placement),
      artworkUrl
        ? `Artwork: ${f.artworkName || ''}${f.artworkSize ? ' (' + fileSize(f.artworkSize) + ')' : ''}` +
          `${f.artworkTooBigToAttach ? ' — too large to attach, use the link' : ' — also attached'}\n${artworkUrl}\n`
        : 'Artwork: none sent with the request\n',
    ]) : '') +

    (f.message ? tsec(merch ? 'What they wrote' : 'The brief', [f.message + '\n']) : '') +

    `\nReply to this email and it goes straight to ${f.email}.\n`;

  return {
    subject: `${what} — ${ref}${f.company ? ' — ' + f.company : ''}`,
    text,
    html: shell({
      title: `${what} ${ref}`, accent, eyebrow: what,
      preheader: summary || `${f.company || f.name}`,
      body,
      footNote: `Reply to this email and it goes straight to <a href="mailto:${esc(f.email)}" style="color:${MUTED}">${esc(f.email)}</a>.`,
    }),
  };
}

/* ---- 2. to the customer: we have it ------------------------------------- */
export function customerEmail(kind, ref, f) {
  const merch = kind === 'quote';
  const accent = merch ? RED : NAVY;
  const head = merch ? 'We have your request.' : 'We have your enquiry.';
  const next = merch
    ? 'We price it by hand and come back to you, usually within two working days. Nothing is ordered and nothing is charged until you approve the quote.'
    : 'One of us reads it properly and comes back to you, usually within two working days.';

  const body = `
    <tr><td style="padding:10px 32px 0">
      <h1 style="margin:0;font:400 28px/1.2 ${FONT};color:${INK};letter-spacing:-.01em">${esc(head)}</h1>
      <p style="margin:12px 0 0;font:400 16px/1.6 ${FONT};color:${INK}">${esc(next)}</p>
    </td></tr>

    ${group('Your reference', [], {
      box: true, accent,
      extra: `<span style="font:500 20px/1.3 ${FONT};color:${INK}">${esc(ref)}</span>`,
      first: true,
    })}

    ${merch ? group('What you asked for', [
      row('Product', esc(f.product)),
      row('Colour', esc(f.colour)),
      row('Fit', esc(f.fit)),
      row('Quantity', f.quantity ? `${esc(f.quantity)} <span style="color:${MUTED};font-weight:400">pieces</span>` : ''),
      row('Personalisation', esc(f.personalisation)),
      row('Placement', esc(f.placement)),
      row('Your artwork', f.artworkName ? `${esc(f.artworkName)}<span style="color:${MUTED};font-weight:400">${f.artworkSize ? ' &middot; ' + fileSize(f.artworkSize) : ''} &middot; received</span>` : ''),
    ]) : ''}

    ${!merch ? group('What you told us', [
      row('Looking for', esc(f.projectType)),
      row('Team size', esc(f.teamSize)),
      row('Timeline', esc(f.timeline)),
    ]) : ''}

    ${!merch && f.meeting ? group('The call you proposed', [], {
      box: true, accent,
      extra: `<span style="font:500 16px/1.4 ${FONT};color:${INK}">${esc(when(f.meeting))}</span>
        <p style="margin:6px 0 0;font:400 13px/1.5 ${FONT};color:${MUTED}">We confirm the time when we reply.</p>`,
    }) : ''}

    ${f.firstOrder ? `<tr><td style="padding:24px 32px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="border-left:3px solid ${accent};background:${PAPER}">
        <tr><td style="padding:13px 18px;font:400 14px/1.5 ${FONT};color:${INK}">
          Your first order discount is on this request. There is no code to quote — we apply it
          when we price the quote, before you approve it.
        </td></tr>
      </table>
    </td></tr>` : ''}

    <tr><td style="padding:24px 32px 0">
      <p style="margin:0;font:400 14px/1.6 ${FONT};color:${MUTED}">
        If anything above is wrong, reply to this email — it reaches the person handling it.
      </p>
    </td></tr>
  `;

  const text =
    `${head}\n\n${next}\n\nYour reference is ${ref}.\n` +

    (merch ? tsec('What you asked for', [
      tline('Product', f.product), tline('Colour', f.colour), tline('Fit', f.fit),
      tline('Quantity', f.quantity && `${f.quantity} pieces`),
      tline('Personalisation', f.personalisation), tline('Placement', f.placement),
      tline('Your artwork', f.artworkName && `${f.artworkName} — received`),
    ]) : tsec('What you told us', [
      tline('Looking for', f.projectType), tline('Team size', f.teamSize),
      tline('Timeline', f.timeline),
      tline('The call you proposed', f.meeting && when(f.meeting)),
    ])) +

    (f.firstOrder ? `\nYour first order discount is on this request. There is no code to quote — we apply it when we price the quote.\n` : '') +
    `\nIf anything above is wrong, reply to this email — it reaches the person handling it.\n\n` +
    `Pamuk Studio S.L, trading as PAMUUC — Barcelona\n`;

  return {
    subject: `${ref} — we have your ${merch ? 'request' : 'enquiry'}`,
    text,
    html: shell({
      title: head, accent, eyebrow: merch ? 'Merchandise' : 'Custom uniforms',
      preheader: `${next.split('.')[0]}.`,
      body,
    }),
  };
}

/* ---- 3. to the customer: the offer code --------------------------------- */
export function offerEmail(code, tiers) {
  const list = tiers && tiers.length ? tiers : [
    { pct: 5, say: 'Under 100 pieces' },
    { pct: 7, say: '100 to 499 pieces' },
    { pct: 10, say: '500 pieces and over' },
  ];
  const best = list.reduce((a, t) => Math.max(a, t.pct), 0);

  const body = `
    <tr><td style="padding:10px 32px 0">
      <h1 style="margin:0;font:400 28px/1.2 ${FONT};color:${INK};letter-spacing:-.01em">
        Your first order discount is set up.
      </h1>
      <p style="margin:12px 0 0;font:400 16px/1.6 ${FONT};color:${INK}">
        There is nothing to remember and no code to quote. Send us a request and we apply the
        discount when we price it, before you approve anything. The rate follows the quantity.
      </p>
    </td></tr>

    <tr><td style="padding:24px 32px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${list.map((t) => `<tr><td style="padding:0 0 8px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background:${PAPER};border-left:3px solid ${RED}">
            <tr>
              <td width="78" style="padding:13px 0 13px 18px;font:500 24px/1 ${FONT};color:${RED};white-space:nowrap">
                ${t.pct}<span style="font-size:14px">%</span>
              </td>
              <td style="padding:13px 18px 13px 0;font:400 14px/1.4 ${FONT};color:${INK}">${esc(t.say)}</td>
            </tr>
          </table>
        </td></tr>`).join('')}
      </table>
    </td></tr>

    <tr><td style="padding:16px 32px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="background:${NAVY}">
          <a href="https://pamuuc-studio.com/merchandise/"
             style="display:inline-block;padding:12px 22px;font:500 14px/1 ${FONT};color:#FFFFFF;text-decoration:none">
            Start choosing</a>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:20px 32px 0">
      <p style="margin:0;font:400 14px/1.6 ${FONT};color:${MUTED}">
        One discount per account, on the first order. Nothing is charged when you request a quote —
        a person prices it and you decide.
      </p>
    </td></tr>
  `;

  const text =
    `Your first order discount is set up.\n\n` +
    `There is nothing to remember and no code to quote. Send us a request and we apply the discount when we price it, before you approve anything.\n\n` +
    list.map((t) => `${t.say}: ${t.pct}%`).join('\n') + '\n\n' +
    `One discount per account, on the first order. Nothing is charged when you request a quote.\n\n` +
    `Pamuk Studio S.L, trading as PAMUUC — Barcelona\n`;

  return {
    subject: 'Your first order discount is set up',
    text,
    html: shell({
      title: 'Your first order discount', accent: RED, eyebrow: 'First order',
      preheader: `Up to ${best}% off your first order, by quantity.`,
      body,
      footNote: 'You are getting this because you asked about the first order discount on pamuuc-studio.com. ' +
        '<a href="{{unsubscribe}}" style="color:' + MUTED + ';text-decoration:underline">Unsubscribe</a>.',
    }),
  };
}
