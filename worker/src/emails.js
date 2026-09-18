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

   Two of the three are written in the customer's language. Their copy is in
   ./email-copy.js, keyed by locale, and reaches here through copyFor(f.locale)
   — English when the locale is missing or unknown. The studio notification is
   not translated: it is read by PAMUUC staff and stays in English whatever
   language the request came in.
   ========================================================================= */

import { copyFor, langOf } from './email-copy.js';

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
 * @param {object} o {accent, eyebrow, preheader, body, footNote, lang}
 */
function shell(o) {
  const accent = o.accent || NAVY;
  return `<!doctype html>
<html lang="${esc(o.lang || 'en')}"><head>
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
/* A basket can hold several products. The structured rows below describe the
   first one, which read as the whole request when it was not — so when there
   is more than one, the heading says so and every product is listed. */
const many = (f) => Number(f.lineCount || 1) > 1;

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
   only use Date for the weekday.

   The weekday and the month are words, so they follow the language of the mail
   they are printed in — English for the studio, the customer's own for the
   confirmation. Locale defaults to English, and the numeric fallback stands if
   a runtime has no data for the language asked for. */
function when(v, locale) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(String(v || '').trim());
  if (!m) return String(v || '');
  const t = copyFor(locale);
  const [, y, mo, d, hh, mm] = m;
  let day = '';
  try {
    day = new Date(Date.UTC(+y, +mo - 1, +d)).toLocaleDateString(t.dateLocale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  } catch { day = `${d}/${mo}/${y}`; }
  return hh ? `${day} ${t.atTime} ${hh}:${mm}` : day;
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

    ${merch ? group(many(f) ? `The first garment of ${esc(f.lineCount)}` : 'The garment', [
      row('Product', esc(f.product)),
      row('Reference', esc(f.sku)),
      row('Colour', esc(f.colour)),
      row('Fit', esc(f.fit)),
      row('Cloth', esc(f.weight)),
    ]) : ''}

    ${merch && many(f) && f.items ? group(`All ${esc(f.lineCount)} products`, [], {
      box: true,
      extra: `<div style="white-space:pre-line;font:400 14px/1.7 ${FONT};color:${INK}">${esc(f.items)}</div>`,
    }) : ''}

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
/* Written in the language the request was made in. f.locale carries it. */
export function customerEmail(kind, ref, f) {
  const merch = kind === 'quote';
  const accent = merch ? RED : NAVY;
  const loc = f.locale;
  const t = copyFor(loc);
  const head = merch ? t.headQuote : t.headEnquiry;
  const next = merch ? t.nextQuote : t.nextEnquiry;

  const body = `
    <tr><td style="padding:10px 32px 0">
      <h1 style="margin:0;font:400 28px/1.2 ${FONT};color:${INK};letter-spacing:-.01em">${esc(head)}</h1>
      <p style="margin:12px 0 0;font:400 16px/1.6 ${FONT};color:${INK}">${esc(next)}</p>
    </td></tr>

    ${group(t.yourReference, [], {
      box: true, accent,
      extra: `<span style="font:500 20px/1.3 ${FONT};color:${INK}">${esc(ref)}</span>`,
      first: true,
    })}

    ${merch ? group(t.askedFor, [
      row(t.lProduct, esc(f.product)),
      row(t.lColour, esc(f.colour)),
      row(t.lFit, esc(f.fit)),
      row(t.lQuantity, f.quantity ? `${esc(f.quantity)} <span style="color:${MUTED};font-weight:400">${esc(t.pieces)}</span>` : ''),
      row(t.lPersonalisation, esc(f.personalisation)),
      row(t.lPlacement, esc(f.placement)),
      row(t.lArtwork, f.artworkName ? `${esc(f.artworkName)}<span style="color:${MUTED};font-weight:400">${f.artworkSize ? ' &middot; ' + fileSize(f.artworkSize) : ''} &middot; ${esc(t.received)}</span>` : ''),
    ]) : ''}

    ${!merch ? group(t.toldUs, [
      row(t.lLookingFor, esc(f.projectType)),
      row(t.lTeamSize, esc(f.teamSize)),
      row(t.lTimeline, esc(f.timeline)),
    ]) : ''}

    ${!merch && f.meeting ? group(t.callProposed, [], {
      box: true, accent,
      extra: `<span style="font:500 16px/1.4 ${FONT};color:${INK}">${esc(when(f.meeting, loc))}</span>
        <p style="margin:6px 0 0;font:400 13px/1.5 ${FONT};color:${MUTED}">${esc(t.confirmTime)}</p>`,
    }) : ''}

    ${f.firstOrder ? `<tr><td style="padding:24px 32px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="border-left:3px solid ${accent};background:${PAPER}">
        <tr><td style="padding:13px 18px;font:400 14px/1.5 ${FONT};color:${INK}">
          ${esc(t.firstOrderHtml)}
        </td></tr>
      </table>
    </td></tr>` : ''}

    <tr><td style="padding:24px 32px 0">
      <p style="margin:0;font:400 14px/1.6 ${FONT};color:${MUTED}">
        ${esc(t.ifWrong)}
      </p>
    </td></tr>
  `;

  const text =
    `${head}\n\n${next}\n\n${t.referenceLine.replace('{ref}', ref)}\n` +

    (merch ? tsec(t.askedFor, [
      tline(t.lProduct, f.product), tline(t.lColour, f.colour), tline(t.lFit, f.fit),
      tline(t.lQuantity, f.quantity && `${f.quantity} ${t.pieces}`),
      tline(t.lPersonalisation, f.personalisation), tline(t.lPlacement, f.placement),
      tline(t.lArtwork, f.artworkName && `${f.artworkName} — ${t.received}`),
    ]) : tsec(t.toldUs, [
      tline(t.lLookingFor, f.projectType), tline(t.lTeamSize, f.teamSize),
      tline(t.lTimeline, f.timeline),
      tline(t.callProposed, f.meeting && when(f.meeting, loc)),
    ])) +

    (f.firstOrder ? `\n${t.firstOrderText}\n` : '') +
    `\n${t.ifWrong}\n\n` +
    /* the legal entity, which is a name and does not translate */
    `Pamuk Studio S.L, trading as PAMUUC — Barcelona\n`;

  return {
    subject: `${ref} — ${merch ? t.subjectQuote : t.subjectEnquiry}`,
    text,
    html: shell({
      title: head, accent, lang: langOf(loc),
      eyebrow: merch ? t.eyebrowMerch : t.eyebrowUniforms,
      preheader: `${next.split('.')[0]}.`,
      body,
    }),
  };
}

/* ---- 3. to the customer: the offer code --------------------------------- */
/* Also written in the customer's language. The pop-up that collects the
   address already sends the page's locale with it. */
export function offerEmail(code, tiers, locale) {
  const t = copyFor(locale);
  const list = tiers && tiers.length ? tiers : [
    { pct: 5, say: 'Under 100 pieces' },
    { pct: 7, say: '100 to 499 pieces' },
    { pct: 10, say: '500 pieces and over' },
  ];
  /* The bands are keyed on their English label, so the three that ship
     translate and a band configured through OFFER_TIERS passes through as the
     studio wrote it. */
  const say = (s) => t.tierSay[s] || s;
  const best = list.reduce((a, x) => Math.max(a, x.pct), 0);

  const body = `
    <tr><td style="padding:10px 32px 0">
      <h1 style="margin:0;font:400 28px/1.2 ${FONT};color:${INK};letter-spacing:-.01em">
        ${esc(t.offerHead)}
      </h1>
      <p style="margin:12px 0 0;font:400 16px/1.6 ${FONT};color:${INK}">
        ${esc(t.offerIntro)}
      </p>
    </td></tr>

    <tr><td style="padding:24px 32px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${list.map((x) => `<tr><td style="padding:0 0 8px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="background:${PAPER};border-left:3px solid ${RED}">
            <tr>
              <td width="78" style="padding:13px 0 13px 18px;font:500 24px/1 ${FONT};color:${RED};white-space:nowrap">
                ${x.pct}<span style="font-size:14px">%</span>
              </td>
              <td style="padding:13px 18px 13px 0;font:400 14px/1.4 ${FONT};color:${INK}">${esc(say(x.say))}</td>
            </tr>
          </table>
        </td></tr>`).join('')}
      </table>
    </td></tr>

    <tr><td style="padding:16px 32px 0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="background:${NAVY}">
          <a href="https://pamuuc-studio.com${esc(t.merchPath)}"
             style="display:inline-block;padding:12px 22px;font:500 14px/1 ${FONT};color:#FFFFFF;text-decoration:none">
            ${esc(t.offerCta)}</a>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:20px 32px 0">
      <p style="margin:0;font:400 14px/1.6 ${FONT};color:${MUTED}">
        ${esc(t.offerSmall)}
      </p>
    </td></tr>
  `;

  const text =
    `${t.offerHead}\n\n` +
    `${t.offerIntroText}\n\n` +
    list.map((x) => `${say(x.say)}: ${x.pct}%`).join('\n') + '\n\n' +
    `${t.offerSmallText}\n\n` +
    /* the legal entity, which is a name and does not translate */
    `Pamuk Studio S.L, trading as PAMUUC — Barcelona\n`;

  return {
    subject: t.offerSubject,
    text,
    html: shell({
      title: t.offerTitle, accent: RED, eyebrow: t.offerEyebrow, lang: langOf(locale),
      preheader: t.offerPreheader.replace('{pct}', best),
      body,
      footNote: esc(t.offerFootNote) +
        `<a href="{{unsubscribe}}" style="color:${MUTED};text-decoration:underline">${esc(t.unsubscribe)}</a>.`,
    }),
  };
}
