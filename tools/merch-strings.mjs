/* ============================================================================
   The merchandise copy, as something you can read
   ---------------------------------------------------------------------------
   The merchandise wording lives inside mockup/app.js, interleaved with the
   markup that draws it. That is fine for the mockup and useless for review or
   translation: nobody can proofread 850KB of JavaScript, and nobody should
   have to edit it to change a sentence.

   So the same tokenizer does two jobs. Reading, it pulls every distinct string
   out of the rendered pages into content/merch.<loc>.json. Writing, it puts a
   translation back in the same places. Because it is one function used both
   ways, a string that can be extracted can always be replaced — there is no
   second parser to fall out of step with the first.

   What counts as copy: text between tags, and the four attributes a reader
   actually meets — alt, title, placeholder, aria-label. Everything else in the
   HTML is structure.
   ========================================================================= */

/* Text that is not language: prices, sizes, SKUs, counts. Translating "350
   g/m²" or "PM-TSH-012" produces noise in a review file and risks a bad
   substitution later, so they never enter the catalogue. */
const NOT_COPY = [
  /^[\s\d.,:;€$£%+\-/×x²°()[\]]+$/,          /* numbers and punctuation alone */
  /^[A-Z]{2,4}-[A-Z0-9]{2,6}-\d{2,4}$/,      /* a SKU */
  /^\d+\s*(g\/m²|gsm|cm|mm|kg|ml)$/i,        /* a measurement */
  /^(XXS|XS|S|M|L|XL|2XL|3XL|4XL|5XL|XXL|XXXL)$/,
  /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u,
  /^&[a-z#0-9]+;$/i,
];

const isCopy = (s) => {
  const t = s.trim();
  if (t.length < 2) return false;
  if (!/\p{L}{2}/u.test(t)) return false;             /* needs real letters */
  return !NOT_COPY.some((re) => re.test(t));
};

/* The key is the string with its whitespace collapsed, so the same sentence
   wrapped differently in two templates is one entry rather than two. */
export const keyOf = (s) => s.replace(/\s+/g, ' ').trim();

const ATTRS = ['alt', 'title', 'placeholder', 'aria-label'];

/**
 * Walks a page's copy. `fn(key)` returns a replacement, or null to leave it.
 * Returns the rewritten HTML; pass a collector as `fn` to extract instead.
 */
function mapCopy(html, fn) {
  let out = '';
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { out += text(html.slice(i)); break; }

    out += text(html.slice(i, lt));

    /* skip the contents of script and style wholesale — it is code, not copy */
    const skip = /^<(script|style)\b/i.exec(html.slice(lt, lt + 8));
    if (skip) {
      const close = html.toLowerCase().indexOf(`</${skip[1].toLowerCase()}>`, lt);
      const end = close < 0 ? html.length : close + skip[1].length + 3;
      out += html.slice(lt, end);
      i = end;
      continue;
    }

    const gt = html.indexOf('>', lt);
    if (gt < 0) { out += html.slice(lt); break; }
    out += tag(html.slice(lt, gt + 1));
    i = gt + 1;
  }
  return out;

  /* a run of text between two tags */
  function text(chunk) {
    if (!chunk || !isCopy(chunk)) return chunk;
    /* leading and trailing whitespace is layout, not copy: keep it exactly */
    const lead = chunk.match(/^\s*/)[0];
    const tail = chunk.match(/\s*$/)[0];
    const body = chunk.slice(lead.length, chunk.length - tail.length);
    const key = keyOf(body);
    const rep = fn(key);
    if (rep == null) return chunk;
    /* Nothing was translated, so hand back exactly what came in. keyOf
       collapses the newlines a template put inside a sentence, and writing the
       collapsed form back would rewrite every English page for no reason —
       this keeps an untranslated build byte-identical to no build step at all. */
    if (rep === key) return chunk;
    return lead + rep + tail;
  }

  /* the handful of attributes a reader meets */
  function tag(t) {
    if (t.startsWith('</') || t.startsWith('<!')) return t;
    return t.replace(/\s(alt|title|placeholder|aria-label)="([^"]*)"/g, (whole, name, val) => {
      if (!ATTRS.includes(name) || !isCopy(val)) return whole;
      const key = keyOf(val);
      const rep = fn(key);
      if (rep == null || rep === key) return whole;
      return ` ${name}="${rep.replace(/"/g, '&quot;')}"`;
    });
  }
}

/** Every distinct string in a set of pages, with where it was found. */
export function collect(pages) {
  const found = new Map();
  for (const { id, html } of pages) {
    mapCopy(html, (key) => {
      const e = found.get(key) || { key, pages: new Set(), words: key.split(/\s+/).length };
      e.pages.add(id);
      found.set(key, e);
      return null;                       /* extracting, not replacing */
    });
  }
  return [...found.values()].map((e) => ({ ...e, pages: [...e.pages] }));
}

/* Two classes in the mockup set white-space:pre-wrap, where collapsing a
   newline WOULD change what the reader sees. Neither belongs to a page this
   site builds — they are message threads and design notes on the account and
   back-office surfaces — so this is a tripwire rather than a special case. */
const PRE_CLASSES = ['msg-t', 'dsn-note'];
export const hasSignificantWhitespace = (html) =>
  PRE_CLASSES.filter((c) => html.includes(`class="${c}`) || html.includes(` ${c}"`));

/**
 * Applies a translation to a page. Missing entries are left in English.
 *
 * `dict.copy` is exact strings. `dict.patterns` handles the ones the catalogue
 * generates — "8 colours", "20 options available" — where the number is data
 * and only the words around it are language. Listing those as fixed strings
 * would work until a product gained a colour, at which point the key would
 * stop matching and that one label would quietly turn English again.
 */
export function translate(html, dict, colours) {
  const copy = dict.copy || dict;
  const patterns = (dict.patterns || []).map(([re, to]) => [new RegExp(re), to]);
  /* "Custom Tank Top in White" is a product name, the word "in", and a
     supplier's colour. The colour is a reference — Fraiche Peche is not French
     for anything — so it stays as it is, and only the name and the preposition
     move. Written as a rule because there are 63 of these and they change
     whenever the catalogue does. */
  const inWord = dict.colourPreposition || 'in';
  const colourSet = colours instanceof Set ? colours : new Set(colours || []);
  const miss = new Set();

  /* One string, by the exact map then by rule. Split out so the joined form
     below can ask the same question of each of its parts. */
  const one = (key) => {
    const hit = copy[key];
    if (hit != null && hit !== '') return hit;
    for (const [re, to] of patterns) {
      if (re.test(key)) return key.replace(re, to);
    }
    return null;
  };

  const out = mapCopy(html, (key) => {
    const hit = one(key);
    if (hit != null) return hit;

    const m = /^(.+) in (.+)$/.exec(key);
    if (m && colourSet.has(m[2])) {
      const name = copy[m[1]];
      if (name) return `${name} ${inWord} ${m[2]}`;
      miss.add(m[1]);
      return null;
    }

    /* A card's meta line is several facts joined with " · " — a product name,
       a composition, a cloth band. Each is translatable on its own and the
       join is the only thing defeating the lookup, so translate the parts.
       This used to be covered by writing the whole joined sentence into the
       dictionary by hand; those broke the moment the band words changed, and
       the line came back English in the static HTML of every collection page.
       A rule does not break that way. */
    if (key.indexOf(' \u00b7 ') > -1) {
      const parts = key.split(' \u00b7 ');
      let moved = false;
      const done = parts.map((part) => {
        const t = one(part);
        if (t != null && t !== part) { moved = true; return t; }
        if (!colourSet.has(part)) miss.add(part);
        return part;
      });
      if (moved) return done.join(' \u00b7 ');
    }

    /* a bare colour name is left alone on purpose, not missing */
    if (colourSet.has(key)) return null;

    miss.add(key);
    return null;
  });
  return { html: out, miss: [...miss] };
}
