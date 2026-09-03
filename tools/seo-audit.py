#!/usr/bin/env python3
"""Machine-checkable portion of the 20-control SEO/AI audit specification.
Scores each control Pass / Partial / Fail / Manual against the built site."""
import re, json, pathlib, collections, sys

D = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'dist')
PAGES = sorted(D.rglob('*.html'))
F = {}          # findings per control
def add(c, level, msg): F.setdefault(c, []).append((level, msg))

html = {}
for p in PAGES:
    rel = ('/' + str(p.relative_to(D))).replace('/index.html', '/')
    html[rel or '/'] = p.read_text()

indexable = {u: h for u, h in html.items()
             if not re.search(r'<meta[^>]+name="robots"[^>]*noindex', h, re.I)}

# ── C1 discovery / index / render ────────────────────────────────────────────
for u, h in indexable.items():
    body = h[h.index('<main'):h.index('</main>')] if '<main' in h else h
    text = re.sub(r'<[^>]+>', ' ', re.sub(r'<(script|style)\b.*?</\1>', '', body, flags=re.S))
    if len(text.split()) < 150: add(1, 'FAIL', f'{u}: only {len(text.split())} words server-rendered')
    if re.search(r'<meta[^>]+nosnippet', h, re.I): add(1, 'FAIL', f'{u}: nosnippet set')
    if 'max-snippet' in h and 'max-snippet:-1' not in h: add(1, 'WARN', f'{u}: max-snippet limits AI/snippet use')
noscript_dep = [u for u, h in indexable.items() if '<noscript>' in h and 'enable JavaScript' in h]
if noscript_dep: add(1, 'FAIL', f'{len(noscript_dep)} page(s) require JS for content')

# ── C2 canonical / sitemap ───────────────────────────────────────────────────
sm = (D / 'sitemap.xml').read_text() if (D / 'sitemap.xml').exists() else ''
smurls = set(re.findall(r'<loc>([^<]+)</loc>', sm))
canon = {}
for u, h in indexable.items():
    m = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', h)
    if not m: add(2, 'FAIL', f'{u}: no canonical'); continue
    canon[u] = m.group(1)
    if not m.group(1).startswith('https://'): add(2, 'FAIL', f'{u}: canonical not absolute https')
    if m.group(1).rstrip('/') + '/' != m.group(1) and not m.group(1).endswith(('.xml', '.txt')):
        add(2, 'WARN', f'{u}: canonical without trailing slash')
missing = set(canon.values()) - smurls
if missing: add(2, 'FAIL', f'{len(missing)} canonical URL(s) absent from sitemap')
extra = smurls - set(canon.values())
if extra: add(2, 'FAIL', f'{len(extra)} sitemap URL(s) not canonical of any page')
if re.search(r'<lastmod>', sm) is None: add(2, 'WARN', 'sitemap has no lastmod')

# ── C9 internal links / orphans ──────────────────────────────────────────────
inbound, body_in = collections.Counter(), collections.Counter()
for u, h in html.items():
    body = h[h.index('<main'):h.index('</main>')] if '<main' in h else ''
    for href in set(re.findall(r'<a\b[^>]+href="(/[^"#?]*)"', h)): inbound[href] += 1
    for href in set(re.findall(r'<a\b[^>]+href="(/[^"#?]*)"', body)): body_in[href] += 1
orphans = [u for u in indexable if u != '/' and inbound.get(u, 0) == 0]
if orphans: add(9, 'FAIL', f'{len(orphans)} orphan page(s): {sorted(orphans)[:6]}')
chrome_only = [u for u in indexable if u != '/' and body_in.get(u, 0) == 0]
if chrome_only: add(9, 'WARN', f'{len(chrome_only)} page(s) linked only from header/footer, never contextually')
generic = []
for u, h in html.items():
    for txt in re.findall(r'<a\b[^>]*>([^<]{1,40})</a>', h):
        if txt.strip().lower() in ('click here', 'read more', 'here', 'link', 'more'):
            generic.append((u, txt.strip()))
if generic: add(9, 'WARN', f'{len(generic)} non-descriptive anchor(s)')

# ── C11 titles / headings / descriptions ─────────────────────────────────────
titles, descs = {}, {}
for u, h in indexable.items():
    t = re.search(r'<title>(.*?)</title>', h, re.S)
    d = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]*)"', h)
    h1 = re.findall(r'<h1\b[^>]*>(.*?)</h1>', h, re.S)
    if t: titles.setdefault(t.group(1).strip(), []).append(u)
    if d: descs.setdefault(d.group(1), []).append(u)
    if len(h1) != 1: add(11, 'FAIL', f'{u}: {len(h1)} h1')
    lv = [int(x) for x in re.findall(r'<h([1-6])\b', h)]
    for a, b in zip(lv, lv[1:]):
        if b > a + 1: add(11, 'FAIL', f'{u}: heading jump h{a}->h{b}'); break
    if t and not (15 <= len(t.group(1).strip()) <= 65): add(11, 'WARN', f'{u}: title {len(t.group(1).strip())} chars')
    if d and not (70 <= len(d.group(1)) <= 170): add(11, 'WARN', f'{u}: description {len(d.group(1))} chars')
for v, us in titles.items():
    if len(us) > 1: add(11, 'FAIL', f'duplicate title on {us}')
for v, us in descs.items():
    if len(us) > 1: add(11, 'FAIL', f'duplicate description on {us}')

# ── C14 multilingual ─────────────────────────────────────────────────────────
for u, h in indexable.items():
    if not re.search(r'<html[^>]+lang="[a-z]{2}"', h): add(14, 'FAIL', f'{u}: no lang attribute')
    alts = re.findall(r'rel="alternate"[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"', h)
    if not alts: continue
    langs = [a for a, _ in alts]
    if 'x-default' not in langs: add(14, 'FAIL', f'{u}: no x-default')
    self_c = canon.get(u)
    if self_c and self_c not in [href for _, href in alts]:
        add(14, 'FAIL', f'{u}: hreflang set does not include its own canonical')
    for _, href in alts:
        if href not in smurls: add(14, 'WARN', f'{u}: hreflang target not in sitemap: {href}')

# ── C15 structured data ──────────────────────────────────────────────────────
REQ = {'Organization': ['name', 'url'], 'BlogPosting': ['headline', 'author', 'datePublished', 'image'],
       'BreadcrumbList': ['itemListElement'], 'Person': ['name'], 'FAQPage': ['mainEntity'],
       'WebSite': ['url'], 'Service': ['name']}
types = collections.Counter()
for u, h in indexable.items():
    for blob in re.findall(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try: obj = json.loads(blob)
        except Exception as e: add(15, 'FAIL', f'{u}: invalid JSON-LD ({e})'); continue
        for o in (obj.get('@graph') or [obj]):
            t = o.get('@type')
            if isinstance(t, list): t = t[0]
            types[t] += 1
            for prop in REQ.get(t, []):
                if prop not in o: add(15, 'FAIL', f'{u}: {t} missing required "{prop}"')
            img = o.get('image')
            if isinstance(img, str) and not img.startswith('http'):
                add(15, 'FAIL', f'{u}: {t}.image not absolute')

# ── C18 images ───────────────────────────────────────────────────────────────
for u, h in indexable.items():
    for im in re.findall(r'<img\b[^>]*>', h):
        src = (re.search(r'src="([^"]+)"', im) or [None, ''])[1]
        if 'alt=' not in im: add(18, 'FAIL', f'{u}: img without alt {src[:44]}')
        elif re.search(r'alt="\s*"', im) is None and len((re.search(r'alt="([^"]*)"', im) or [None,''])[1]) < 8:
            add(18, 'WARN', f'{u}: very short alt {src[:44]}')
        if 'width=' not in im or 'height=' not in im: add(18, 'FAIL', f'{u}: img without dimensions {src[:44]}')
        if 'loading=' not in im and 'fetchpriority' not in im: add(18, 'WARN', f'{u}: img without loading hint {src[:44]}')

# ── C19 AI crawler policy ────────────────────────────────────────────────────
robots = (D / 'robots.txt').read_text() if (D / 'robots.txt').exists() else ''
NEEDED = ['OAI-SearchBot', 'GPTBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'ClaudeBot']
absent = [b for b in NEEDED if b.lower() not in robots.lower()]
if absent: add(19, 'FAIL', f'robots.txt states no policy for: {", ".join(absent)}')
if 'Sitemap:' not in robots: add(19, 'FAIL', 'robots.txt has no Sitemap directive')

# ── C20 agent / accessibility ────────────────────────────────────────────────
for u, h in indexable.items():
    if '<main' not in h: add(20, 'FAIL', f'{u}: no <main> landmark')
    if 'aria-label' not in h and '<nav' in h: add(20, 'WARN', f'{u}: <nav> without aria-label')
    for inp in re.findall(r'<(?:input|select|textarea)\b[^>]*>', h):
        i = re.search(r'\bid="([^"]+)"', inp)
        if not i: continue
        if f'for="{i.group(1)}"' not in h and 'aria-label' not in inp and 'type="hidden"' not in inp:
            add(20, 'FAIL', f'{u}: control #{i.group(1)} has no label')
    # a control wrapped in <label> is implicitly associated and needs no for=
    for m in re.finditer(r'<(?:input|select|textarea)\b[^>]*>', h):
        inp = m.group(0)
        if 'type="hidden"' in inp or re.search(r'\bid="', inp): continue
        before = h[:m.start()]
        if before.count('<label') <= before.count('</label>') and 'aria-label' not in inp:
            add(20, 'WARN', f'{u}: unlabelled control with no id and no wrapping label')
    st = re.search(r'<[^>]+data-form-status[^>]*>', h)
    if st and 'aria-live' not in st.group(0) and 'role="status"' not in st.group(0):
        add(20, 'FAIL', f'{u}: form status region is not announced (no role/aria-live)')

# ── report ───────────────────────────────────────────────────────────────────
NAMES = {1:'Discovery, crawl, index, policy eligibility',2:'Canonical, redirects, URL consistency, sitemap',
 3:'Measurement baseline and qualified outcomes',4:'Audience, keyword, prompt, intent map',
 5:'Commercial service page architecture',6:'Complete service decision information',
 7:'Original first-hand editorial content',8:'Indexable case studies and verifiable proof',
 9:'Topic hubs, internal links, cannibalisation',10:'Authorship, expertise, sourcing, transparency',
 11:'On-page relevance and search presentation',12:'Business entity consistency and site trust',
 13:'External authority, links, mentions, reviews',14:'Multilingual and regional implementation',
 15:'Accurate structured data',16:'Local search and Google Business Profile',
 17:'Mobile, Core Web Vitals, accessibility',18:'Image and video discoverability',
 19:'AI crawler and snippet access policy',20:'Agent readability and enquiry execution'}
AUTOMATED = {1,2,9,11,14,15,18,19,20}
print(f'pages {len(PAGES)}  indexable {len(indexable)}  sitemap {len(smurls)}\n')
print(f'{"#":>3}  {"CONTROL":48} {"SCORE":8} FINDINGS')
for c in range(1, 21):
    f = F.get(c, [])
    fails = [x for x in f if x[0] == 'FAIL']; warns = [x for x in f if x[0] == 'WARN']
    if c not in AUTOMATED: score = 'MANUAL'
    elif fails: score = 'FAIL'
    elif warns: score = 'PARTIAL'
    else: score = 'PASS'
    print(f'{c:>3}  {NAMES[c][:48]:48} {score:8} {len(fails)} fail / {len(warns)} warn')
print()
for c in sorted(F):
    print(f'--- control {c}: {NAMES[c]}')
    for lvl, msg in F[c][:14]: print(f'    {lvl:5} {msg}')
    if len(F[c]) > 14: print(f'    ... {len(F[c])-14} more')
print('\nstructured data types:', dict(types))
