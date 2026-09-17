/* ============================================================================
   Turning the app's HTML into a website's HTML
   ---------------------------------------------------------------------------
   The mockup draws the pages; this makes them crawlable, stable and auditable
   without editing a line of the mockup. Three passes:

     links   `data-go="public:products"` becomes a real href. Most of them are
             already <a> elements with no href, so most of this is filling one
             attribute in. The rest are <button>/<article>/<div>/<span>, which
             become <a> — safe here because every class involved sets its own
             `display`, and `a{color:inherit;text-decoration:none}` is already
             in the stylesheet, so nothing moves. data-go is left in place: the
             runtime app still uses it, and the href is what a crawler follows.

     images  width and height, read from the file at extraction time. The build
             audit refuses an <img> without them, rightly — thirty photographs
             landing on a listing without reserved space is a visible lurch.

     drops   controls pointing at the customer account and the back office.
             Neither surface is being built, and 104 dead links in a header is
             worse than no control at all.
   ========================================================================= */
import { urlFor, DROPPED } from './merch-routes.mjs';

/* Classes that set their own `display`, read from the mockup's stylesheet. A
   <div> turned into an <a> goes inline unless something says otherwise, so the
   few that rely on the default box get marked and picked up by one CSS rule
   rather than guessing per class. */
export function displayClasses(css) {
  const out = new Set();
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\bdisplay\s*:/.test(m[2])) continue;
    for (const sel of m[1].split(',')) {
      for (const cls of sel.trim().matchAll(/\.([A-Za-z0-9_-]+)/g)) out.add(cls[1]);
    }
  }
  return out;
}

const ATTR = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

/**
 * @param {string} html
 * @param {string} loc
 * @param {object} site      content/site.json
 * @param {Set}    hasDisplay  from displayClasses()
 */
export function linkify(html, loc, site, hasDisplay, cats) {
  const stats = { filled: 0, converted: 0, dropped: 0, unknown: new Map(), marked: 0, nested: 0 };

  /* Match an opening tag carrying data-go, then find its matching close. Only
     the tags the mockup actually uses for navigation are considered, so a
     data-go on something exotic is reported rather than silently mangled. */
  const OPEN = /<(a|button|article|div|span)\b([^>]*\bdata-go="([^"]*)"[^>]*)>/g;

  let out = '';
  let last = 0;
  for (const m of [...html.matchAll(OPEN)]) {
    const [full, tag, attrs, target] = m;
    const start = m.index;
    out += html.slice(last, start);
    last = start + full.length;

    const page = target.split(':')[1];

    /* a surface this site does not have: take the whole element out */
    if (DROPPED.has(page)) {
      const end = closeOf(html, tag, last);
      if (end >= 0) { last = end; stats.dropped++; continue; }
      /* no matching close found — leave it, but strip the dead navigation */
      out += `<${tag}${attrs.replace(/\sdata-go="[^"]*"/, '')}>`;
      stats.dropped++;
      continue;
    }

    const href = urlFor(target, loc, site, cats);
    if (!href) {
      stats.unknown.set(target, (stats.unknown.get(target) || 0) + 1);
      out += full;
      continue;
    }

    if (tag === 'a') {
      /* already an anchor: fill the href in, replacing a placeholder if any */
      const cleaned = attrs.replace(/\shref="[^"]*"/, '');
      out += `<a href="${href}"${cleaned}>`;
      stats.filled++;
    } else {
      /* becomes an anchor. Keep every attribute, including data-go, so the
         runtime app behaves exactly as it does in the mockup. */
      const cls = ATTR(`<x ${attrs}>`, 'class') || '';
      const boxed = cls.split(/\s+/).some((c) => c && hasDisplay.has(c));
      const mark = boxed ? '' : ' data-blk';
      if (!boxed) stats.marked++;
      out += `<a href="${href}"${mark}${attrs}>`;
      stats.converted++;
      const end = closeOf(html, tag, last);
      if (end >= 0) {
        /* The interior is copied through untouched, which means a data-go
           nested inside this one is deliberately left as it was. That is not
           an oversight: <a> inside <a> is invalid and browsers break it apart.
           The card becomes the link; the chip inside it stays a button and
           keeps working at runtime, and its URL is reachable from the index
           page anyway, so nothing becomes uncrawlable. */
        const inner = html.slice(last, end - (`</${tag}>`).length);
        stats.nested += (inner.match(/\sdata-go="/g) || []).length;
        out += inner + '</a>';
        last = end;
      } else {
        /* no matching close: emitting an unclosed <a> would swallow the rest
           of the page, so put the original tag back instead */
        out = out.slice(0, out.length - `<a href="${href}"${mark}${attrs}>`.length) + full;
        stats.converted--;
      }
    }
  }
  out += html.slice(last);
  return { html: out, stats };
}

/* Walks forward counting nesting, so a card containing another <div> closes in
   the right place. Returns the index just past the matching close tag. */
function closeOf(html, tag, from) {
  const re = new RegExp(`<(/?)${tag}\\b`, 'g');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      const close = html.indexOf('>', m.index);
      return close < 0 ? -1 : close + 1;
    }
  }
  return -1;
}

/** width and height on every <img>, from the manifest. */
export function dimension(html, manifest) {
  /* url -> {w,h}; built once per build, not per page */
  if (!dimension._byUrl || dimension._for !== manifest) {
    dimension._byUrl = new Map();
    for (const e of Object.values(manifest)) if (e.w && e.h) dimension._byUrl.set(e.url, e);
    dimension._for = manifest;
  }
  const byUrl = dimension._byUrl;
  const stats = { sized: 0, unknown: [] };

  const out = html.replace(/<img\b[^>]*>/g, (tag) => {
    if (/\bwidth=/.test(tag) && /\bheight=/.test(tag)) return tag;
    const src = ATTR(tag, 'src');
    const e = src && byUrl.get(src);
    if (!e) { if (src) stats.unknown.push(src); return tag; }
    stats.sized++;
    return tag.replace(/^<img\b/, `<img width="${e.w}" height="${e.h}"`);
  });
  return { html: out, stats };
}

/** Points the mockup's forms at the live intake Worker. */
export function wireForms(html, endpoint) {
  if (!endpoint) return { html, stats: { wired: 0 } };
  let wired = 0;
  const out = html.replace(/<form\b([^>]*)>/g, (tag, attrs) => {
    if (/\baction=/.test(attrs)) return tag;
    wired++;
    const kind = /data-intake="([^"]*)"/.exec(attrs)?.[1] || 'quote';
    return `<form action="${endpoint}/${kind}" method="post" enctype="multipart/form-data"${attrs}>`;
  });
  return { html: out, stats: { wired } };
}
