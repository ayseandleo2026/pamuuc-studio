/* ============================================================================
   A very small SMTP client for Cloudflare Workers
   ---------------------------------------------------------------------------
   Workers can open TCP sockets, and SMTP is just a conversation over one. Only
   port 25 is blocked by the runtime — that is the server-to-server relay port,
   not the submission ports (465 implicit TLS, 587 STARTTLS). We use 465, which
   is TLS from the first byte and so avoids upgrading the stream mid-session.

   This exists so PAMUUC keeps sending through the mailbox it already pays for
   instead of adding a transactional vendor. If deliverability ever becomes a
   problem, replacing sendMail() with an HTTP API call is the only change.
   ========================================================================= */
import { connect } from 'cloudflare:sockets';

const CRLF = '\r\n';
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (s) => {
  const bytes = enc.encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

/* Bytes to base64, in chunks. String.fromCharCode.apply on a whole multi-megabyte
   array blows the stack — the failure is a RangeError halfway through a send,
   which is a miserable thing to debug from a mail log. */
function b64Bytes(u8) {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + step));
  }
  const raw = btoa(bin);
  /* RFC 2045 wants no line longer than 76 characters in a base64 body. Some
     servers accept one enormous line; enough of them do not. */
  return raw.replace(/(.{76})/g, '$1' + CRLF);
}

/* A header value with anything outside ASCII has to be encoded, or the subject
   line arrives as mojibake the moment a customer is called Núria. */
const header = (s) =>
  /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;

/* In DATA, a line consisting of a single dot ends the message — so any line
   that legitimately starts with a dot must be doubled. Miss this and a message
   silently truncates at the first such line.

   The leading `^\.` matters even though today's callers always put headers in
   front of the body: it makes the function correct on its own terms rather
   than correct only because of how it happens to be called. */
const dotStuff = (s) => s.replace(/^\./, '..').replace(/\r\n\./g, '\r\n..');

class Conversation {
  constructor(socket) {
    this.writer = socket.writable.getWriter();
    this.reader = socket.readable.getReader();
    this.buf = '';
  }
  /* An SMTP reply may span several lines: continuations are "250-", the last
     line is "250 ". Reading until the space form is what makes multi-line
     greetings and EHLO capability lists safe. */
  async expect(code) {
    for (;;) {
      const m = this.buf.match(/^(?:\d{3}-[^\n]*\n)*(\d{3})([ -])([^\n]*)\n/);
      if (m && m[2] === ' ') {
        const got = m[1];
        const line = this.buf.slice(0, m[0].length).trim();
        this.buf = this.buf.slice(m[0].length);
        if (code && !got.startsWith(code)) {
          throw new Error(`SMTP expected ${code}, got ${line}`);
        }
        return got;
      }
      const { value, done } = await this.reader.read();
      if (done) throw new Error('SMTP connection closed unexpectedly');
      this.buf += dec.decode(value, { stream: true });
    }
  }
  async say(line, code) {
    await this.writer.write(enc.encode(line + CRLF));
    return code === null ? null : this.expect(code);
  }
  async close() {
    try { await this.writer.close(); } catch { /* already gone */ }
  }
}

/* Builds the whole DATA payload. Separated from the conversation above so it
   can be tested without a socket: the nesting of multipart/mixed around
   multipart/alternative is the part that silently misbehaves, and it is pure
   data in, data out. */
export function buildMessage(from, fromName, msg) {
    /* Three shapes, depending on what the message carries:
       plain text            -> text/plain
       text + html           -> multipart/alternative
       text + html + files   -> multipart/mixed wrapping the alternative
     Nesting matters: a client shows the alternative and lists the files. Put
     the attachment inside the alternative instead and it becomes a third
     "version" of the body, which some clients then show *instead* of the HTML. */
  const rcpts = [].concat(msg.to);
  const files = (msg.attachments || []).filter((a) => a && a.bytes && a.bytes.length);
  const alt = `alt_${crypto.randomUUID().replace(/-/g, '')}`;
  const mix = `mix_${crypto.randomUUID().replace(/-/g, '')}`;

  /* Both body parts go out base64. Two reasons, and the first one is not
     optional: a mail line may not exceed 998 octets, and generated HTML runs to
     lines of several thousand — a message like that is rejected by some servers
     and silently mangled by others, which is the worst kind of bug to own.
     Base64 wraps at 76 and carries UTF-8 through untouched into the bargain. */
  const textPart = [
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Bytes(enc.encode(msg.text || '')),
  ].join(CRLF);

  const htmlPart = msg.html ? [
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64Bytes(enc.encode(msg.html)),
  ].join(CRLF) : null;

  const altPart = htmlPart
    ? [`--${alt}`, textPart, `--${alt}`, htmlPart, `--${alt}--`].join(CRLF)
    : textPart;

  const topType = files.length
    ? `multipart/mixed; boundary="${mix}"`
    : msg.html
      ? `multipart/alternative; boundary="${alt}"`
      : 'text/plain; charset=UTF-8';

  const head = [
    `From: ${header(fromName)} <${from}>`,
    `To: ${rcpts.join(', ')}`,
    msg.replyTo ? `Reply-To: ${msg.replyTo}` : null,
    `Subject: ${header(msg.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`,
    'MIME-Version: 1.0',
    `Content-Type: ${topType}`,
  ].filter(Boolean).join(CRLF);

  let body;
  if (files.length) {
    const parts = [
      '',
      `--${mix}`,
      htmlPart
        ? `Content-Type: multipart/alternative; boundary="${alt}"`
        : null,
      htmlPart ? '' : null,
      altPart,
    ];
    for (const a of files) {
      parts.push(
        `--${mix}`,
        `Content-Type: ${a.contentType || 'application/octet-stream'}; name="${a.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${a.filename}"`,
        '',
        b64Bytes(a.bytes),
      );
    }
    parts.push(`--${mix}--`, '');
    body = parts.filter((x) => x !== null).join(CRLF);
  } else if (htmlPart) {
    body = CRLF + CRLF + altPart + CRLF;
  } else {
    /* a text-only message needs the encoding header on the top level, since
       there is no part to carry it */
    return [head, 'Content-Transfer-Encoding: base64', '', b64Bytes(enc.encode(msg.text || ''))].join(CRLF);
  }
  return head + body;
}

/**
 * @param {object} env   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_FROM_NAME
 * @param {object} msg   {to, subject, text, html, replyTo}
 */
export async function sendMail(env, msg) {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT || 465);
  const from = env.MAIL_FROM;
  const fromName = env.MAIL_FROM_NAME || 'PAMUUC Studio';
  if (!host || !from || !env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP is not configured (host, user, pass, from)');
  }

  const socket = connect({ hostname: host, port }, { secureTransport: 'on' });
  const c = new Conversation(socket);

  try {
    await c.expect('220');
    await c.say(`EHLO ${from.split('@')[1]}`, '250');

    await c.say('AUTH LOGIN', '334');
    await c.say(b64(env.SMTP_USER), '334');
    await c.say(b64(env.SMTP_PASS), '235');

    await c.say(`MAIL FROM:<${from}>`, '250');
    for (const to of [].concat(msg.to)) await c.say(`RCPT TO:<${to}>`, '250');

    await c.say('DATA', '354');

    await c.say(dotStuff(buildMessage(from, fromName, msg)) + CRLF + '.', '250');
    await c.say('QUIT', null);
  } finally {
    await c.close();
  }
}
