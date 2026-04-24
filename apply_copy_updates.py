from pathlib import Path
from bs4 import BeautifulSoup, NavigableString
import html
import os
import re

# Paths default to script-relative locations so the script is portable.
# Override by setting PAMUUC_SITE_ROOT and/or PAMUUC_COPY_DIR in the environment.
_DEFAULT_ROOT = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("PAMUUC_SITE_ROOT", _DEFAULT_ROOT)).resolve()
COPY = Path(os.environ.get("PAMUUC_COPY_DIR", _DEFAULT_ROOT / "copy")).resolve()

LANGS = {
    "en": {"file": "Pamuuc Studio English Text.txt", "home": ROOT / "index.html", "home_href": "/"},
    "fr": {"file": "Pamuuc Studio French Text.txt", "home": ROOT / "fr/index.html", "home_href": "/fr/"},
    "it": {"file": "Pamuuc Studio Italian Text.txt", "home": ROOT / "it/index.html", "home_href": "/it/"},
    "es": {"file": "Pamuuc Studio Spanish Text.txt", "home": ROOT / "es/index.html", "home_href": "/es/"},
    "de": {"file": "Pamuuc Studio German Text.txt", "home": ROOT / "de/index.html", "home_href": "/de/"},
}
LANG_ORDER = ["en", "fr", "it", "es", "de"]
LANG_NAMES = {"en": "English", "fr": "Français", "it": "Italiano", "es": "Español", "de": "Deutsch"}

PAGE_MARKERS = ("PAGE:", "PÁGINA:")
TITLE_MARKERS = ("TITLE:", "TÍTULO:")
DESC_MARKERS = ("DESCRIPTION:", "DESCRIPCIÓN:")


def marker_value(line, markers):
    for marker in markers:
        if line.startswith(marker):
            return line[len(marker):].strip()
    return None


def parse_file(path):
    lines = [line.rstrip() for line in path.read_text(encoding="utf-8").splitlines()]
    starts = [i for i, line in enumerate(lines) if any(line.strip().startswith(m) for m in PAGE_MARKERS)]
    pages = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(lines)
        chunk = [line for line in lines[start:end] if not line.strip().startswith("===")]
        page = title = desc = None
        body_start = 0
        for i, line in enumerate(chunk):
            stripped = line.strip()
            page = page or marker_value(stripped, PAGE_MARKERS)
            title_value = marker_value(stripped, TITLE_MARKERS)
            desc_value = marker_value(stripped, DESC_MARKERS)
            if title_value is not None:
                title = title_value
            if desc_value is not None:
                desc = desc_value
                body_start = i + 1
                break
        pages.append(
            {
                "page": page,
                "title": title,
                "desc": desc,
                "body": [line.strip() for line in chunk[body_start:] if line.strip()],
                "raw_body": "\n".join(chunk[body_start:]).strip(),
            }
        )
    return pages


COPIES = {code: parse_file(COPY / info["file"]) for code, info in LANGS.items()}


def body_blocks(raw):
    groups = []
    for block in re.split(r"\n\s*\n", raw.strip()):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        if all(line.startswith("- ") for line in lines):
            groups.extend(lines)
        elif any(line.startswith("- ") for line in lines):
            buf = []
            for line in lines:
                if line.startswith("- "):
                    if buf:
                        groups.append(" ".join(buf))
                        buf = []
                    groups.append(line)
                else:
                    buf.append(line)
            if buf:
                groups.append(" ".join(buf))
        else:
            groups.append(" ".join(lines))
    return groups


def clean_bullet(value):
    return value[2:].strip() if value.startswith("- ") else value


def set_text(element, value):
    if element is None:
        return
    element.clear()
    element.append(NavigableString(value))


def ensure_meta(soup, name=None, prop=None):
    attrs = {"name": name} if name else {"property": prop}
    element = soup.find("meta", attrs=attrs)
    if element is None:
        element = soup.new_tag("meta", attrs=attrs)
        soup.head.append(element)
    return element


def update_head(soup, code, title, desc, canonical_path):
    soup.html["lang"] = code
    if soup.title:
        soup.title.string = title
    ensure_meta(soup, name="description")["content"] = desc
    ensure_meta(soup, name="robots")["content"] = "index,follow,max-image-preview:large"
    ensure_meta(soup, name="googlebot")["content"] = "index,follow,max-image-preview:large"
    canonical = soup.find("link", rel="canonical")
    if canonical is None:
        canonical = soup.new_tag("link", rel="canonical")
        soup.head.append(canonical)
    canonical["href"] = "https://studio.pamuuc.com" + canonical_path
    for tag in soup.find_all("link", rel="alternate"):
        tag.decompose()
    insert = canonical
    for hreflang, path in {"en": "/", "fr": "/fr/", "it": "/it/", "es": "/es/", "de": "/de/", "x-default": "/"}.items():
        tag = soup.new_tag("link", rel="alternate")
        tag["hreflang"] = hreflang
        tag["href"] = "https://studio.pamuuc.com" + path
        insert.insert_after(tag)
        insert = tag
    ensure_meta(soup, prop="og:title")["content"] = title
    ensure_meta(soup, prop="og:description")["content"] = desc
    ensure_meta(soup, prop="og:url")["content"] = "https://studio.pamuuc.com" + canonical_path
    ensure_meta(soup, name="twitter:title")["content"] = title
    ensure_meta(soup, name="twitter:description")["content"] = desc


def nav_items_from_blog(code):
    items = []
    for line in COPIES[code][1]["body"]:
        if line.startswith("- "):
            value = clean_bullet(line)
            if value.lower() in {"home", "accueil", "inicio", "inizio", "startseite"}:
                break
            items.append(value)
    return items[1:6]


def update_language_switchers(soup, active):
    for nav in soup.select("nav.language-switcher"):
        nav.clear()
        for code in LANG_ORDER:
            link = soup.new_tag("a")
            link["class"] = "lang-link" + (" is-active" if code == active else "")
            link["data-lang-switch"] = code
            link["href"] = LANGS[code]["home_href"]
            link.string = code.upper()
            nav.append(link)
    panel = soup.select_one(".language-modal-actions")
    if panel:
        panel.clear()
        for code in LANG_ORDER:
            button = soup.new_tag("button")
            button["class"] = "lang-choice"
            button["data-lang-choice"] = code
            button["@click"] = f"selectLanguage('{code}')"
            button["type"] = "button"
            button.string = LANG_NAMES[code]
            panel.append(button)


def update_header(soup, code):
    brand = soup.select_one(".brand")
    if brand:
        brand["href"] = LANGS[code]["home_href"]
    nav = soup.select_one(".site-nav-list")
    if nav:
        nav.clear()
        labels = nav_items_from_blog(code)
        hrefs = [
            f"{LANGS[code]['home_href']}#sectors",
            f"{LANGS[code]['home_href']}#process",
            f"{LANGS[code]['home_href']}#projects",
            "/en/blog/" if code == "en" else f"/{code}/blog/",
            f"{LANGS[code]['home_href']}#contact",
        ]
        for i, label in enumerate(labels):
            item = soup.new_tag("li")
            link = soup.new_tag("a", href=hrefs[i])
            if i == len(labels) - 1:
                link["class"] = "nav-cta"
            link.string = label
            item.append(link)
            nav.append(item)
    button = soup.select_one(".menu-toggle")
    if button:
        menu_label = COPIES[code][1]["body"][1]
        button["aria-label"] = menu_label
        set_text(button.select_one(".sr-only"), menu_label)


def new_li(soup, value):
    item = soup.new_tag("li")
    item.string = clean_bullet(value)
    return item


def replace_children_text(elements, values):
    for element, value in zip(elements, values):
        set_text(element, clean_bullet(value))


def update_footer_cookie(soup, code, body):
    set_text(soup.select_one(".footer-brand p"), body[246])
    info = soup.select_one(".footer-links-info")
    if info:
        labels = body[247:253]
        hrefs = [
            "/sitemap.xml",
            "https://pamuuc.com",
            f"{LANGS[code]['home_href']}#services",
            f"{LANGS[code]['home_href']}#projects",
            "/en/blog/" if code == "en" else f"/{code}/blog/",
        ]
        info.clear()
        title = soup.new_tag("p")
        title["class"] = "footer-links-title"
        title.string = labels[0]
        info.append(title)
        for label, href in zip(labels[1:], hrefs):
            link = soup.new_tag("a", href=href)
            link.string = label
            if href.startswith("https://"):
                link["rel"] = "noopener noreferrer"
                link["target"] = "_blank"
            info.append(link)
    policies = soup.select_one(".footer-links-policies")
    if policies:
        labels = body[253:258]
        base = "" if code == "en" else f"/{code}/"
        paths = ["privacy-policy/", "cookie-policy/", "terms-and-conditions/", "legal-notice/"]
        policies.clear()
        title = soup.new_tag("p")
        title["class"] = "footer-links-title"
        title.string = labels[0]
        policies.append(title)
        for label, path in zip(labels[1:], paths):
            link = soup.new_tag("a", href=base + path)
            link.string = label
            policies.append(link)
    set_text(soup.select_one("#language-modal-title"), body[262])
    set_text(soup.select_one(".language-modal-panel p"), body[263])
    set_text(soup.select_one(".cookie-banner p"), body[268])
    set_text(soup.select_one("#cookie-accept"), body[269])
    set_text(soup.select_one("#cookie-reject"), body[270])
    set_text(soup.select_one(".modal-close"), body[271])


def update_home(code):
    info = LANGS[code]
    if code == "de" and "hero-section" not in info["home"].read_text(encoding="utf-8"):
        info["home"].write_text((ROOT / "fr/index.html").read_text(encoding="utf-8"), encoding="utf-8")
    soup = BeautifulSoup(info["home"].read_text(encoding="utf-8"), "html.parser")
    page = COPIES[code][0]
    body = page["body"]
    update_head(soup, code, page["title"], page["desc"], "/" if code == "en" else f"/{code}/")
    if soup.body:
        soup.body["data-language"] = code
        soup.body["data-page-type"] = "home"
    update_header(soup, code)
    update_language_switchers(soup, code)

    direct_pairs = [
        (".hero-copy .eyebrow", 0), (".hero-copy h1", 1), (".hero-copy .hero-lead", 2),
        (".floating-proof-top strong", 9), (".floating-proof-top span", 10),
        (".floating-proof-bottom strong", 11), (".floating-proof-bottom span", 12),
        ("#services .section-kicker", 13), ("#services h2", 14), ("#services .section-heading p:not(.section-kicker)", 15),
        ("#services .service-topline", 16), ("#services .service-card h3", 17), ("#services .service-card > p", 18), ("#services .card-hint", 22),
        (".logo-band-inner > p", 23), ("#sectors .section-kicker", 30), ("#sectors h2", 31), ("#sectors .section-heading p:not(.section-kicker)", 32),
        ("#approach .section-kicker", 39), ("#approach .method-copy > p:not(.section-kicker)", 40),
        ("#categories .section-kicker", 49), ("#categories h2", 50), ("#categories .category-copy > p:not(.section-kicker):not(.scope-label)", 51),
        ("#process .section-kicker", 82), ("#process h2", 83), ("#process .section-heading p:not(.section-kicker)", 84),
        ("#personalised .section-kicker", 112), ("#personalised h2", 113), ("#personalised .category-copy > p:not(.section-kicker)", 114),
        ("#parameters .section-kicker", 137), ("#parameters h2", 138), ("#parameters .section-heading p:not(.section-kicker)", 139),
        ("#continuity .section-kicker", 154), ("#continuity h2", 155), ("#continuity .section-heading p:not(.section-kicker)", 156),
        ("#projects .section-kicker", 173), ("#projects h2", 174), ("#projects .section-heading p:not(.section-kicker)", 175),
        ("#team .section-kicker", 185), ("#team h2", 186), ("#team .section-heading p:not(.section-kicker)", 187),
        ("#faq .section-kicker", 197), ("#faq h2", 198), ("#faq .section-heading p:not(.section-kicker)", 199),
        ("#contact .section-kicker", 208), ("#contact h2", 209), ("#contact .cta-copy > p:not(.section-kicker)", 210),
        ("#contact .form-hint", 213), ("#contact .field-note", 241), ("#contact button[type='submit']", 245),
    ]
    for selector, index in direct_pairs:
        set_text(soup.select_one(selector), body[index])

    replace_children_text(soup.select(".hero-pill-row .pill"), body[3:7])
    replace_children_text(soup.select(".hero-actions .button"), body[7:9])
    feature_list = soup.select_one("#services .feature-list")
    if feature_list:
        feature_list.clear()
        for item in body[19:22]:
            feature_list.append(new_li(soup, item))
    replace_children_text(soup.select(".logo-band-points span"), body[24:30])
    for action in soup.select("#sectors .section-actions"):
        action.decompose()
    replace_children_text(soup.select("#sectors .sector-pill"), body[33:39])

    for card, base in zip(soup.select("#approach .method-card"), [41, 43, 45, 47]):
        if "—" in body[base]:
            number, title = [part.strip() for part in body[base].split("—", 1)]
        else:
            number, title = body[base], ""
        set_text(card.select_one(".method-number"), number)
        set_text(card.select_one("h3"), title)
        set_text(card.select_one("p"), body[base + 1])

    labels = soup.select("#categories .scope-label")
    if len(labels) >= 3:
        set_text(labels[0], body[52])
        set_text(labels[1], body[64])
        set_text(labels[2], body[73])
    replace_children_text(soup.select(".pill-grid-garments .pill"), body[53:64])
    replace_children_text(soup.select(".pill-grid-branding .pill"), body[65:73])
    replace_children_text(soup.select(".pill-grid-technical .pill"), body[74:82])

    for card, base in zip(soup.select("#process .phase-card"), [85, 91, 97]):
        if "—" in body[base]:
            phase, title = [part.strip() for part in body[base].split("—", 1)]
        else:
            phase, title = body[base], ""
        set_text(card.select_one(".phase-tag"), phase)
        set_text(card.select_one("h3"), title)
        set_text(card.select_one(".phase-description"), body[base + 1])
        list_el = card.select_one("ul")
        if list_el:
            list_el.clear()
            for item in body[base + 2:base + 5]:
                list_el.append(new_li(soup, item))
        set_text(card.select_one(".card-hint"), body[base + 5])

    stat_band = soup.select_one("#process .stat-band")
    if stat_band:
        if not soup.select_one("#process .stat-band-label"):
            label = soup.new_tag("h3")
            label["class"] = "stat-band-label"
            stat_band.insert_before(label)
        set_text(soup.select_one("#process .stat-band-label"), body[103])
        for item, base in zip(soup.select("#process .stat-item"), [104, 106, 108, 110]):
            set_text(item.select_one("strong"), body[base])
            set_text(item.select_one("span"), body[base + 1])

    for detail, base in zip(soup.select("#personalised details"), [115, 119, 123, 127]):
        set_text(detail.select_one("summary"), body[base])
        set_text(detail.select_one(".accordion-body p"), body[base + 1])
        list_el = detail.select_one("ul")
        if list_el:
            list_el.clear()
            for item in body[base + 2:base + 4]:
                list_el.append(new_li(soup, item))
    for material, base in zip(soup.select("#personalised .material-card"), [131, 133, 135]):
        set_text(material.select_one("h3"), body[base])
        set_text(material.select_one("p"), body[base + 1])

    for card in soup.select("#parameters .parameter-card")[3:]:
        card.decompose()
    parameter_cards = soup.select("#parameters .parameter-card")
    if parameter_cards:
        set_text(parameter_cards[0].select_one("h3"), body[140])
        set_text(parameter_cards[0].select_one(".parameter-note"), body[141])
        set_text(parameter_cards[0].select_one(".card-hint"), body[142])
    if len(parameter_cards) > 1:
        set_text(parameter_cards[1].select_one("h3"), body[143])
        set_text(parameter_cards[1].select_one(".parameter-note"), body[144])
        set_text(parameter_cards[1].select_one(".card-hint"), body[153])
        value_stack = parameter_cards[1].select_one(".value-stack")
        if value_stack:
            value_stack.decompose()
    if len(parameter_cards) > 2:
        set_text(parameter_cards[2].select_one("h3"), body[147])
        set_text(parameter_cards[2].select_one(".parameter-note"), body[148])
        set_text(parameter_cards[2].select_one(".card-hint"), body[153])
        list_el = parameter_cards[2].select_one("ul")
        if list_el:
            list_el.clear()
            for item in body[149:153]:
                list_el.append(new_li(soup, item))

    rows = soup.select("#continuity .comparison-row")
    if len(rows) >= 4:
        replace_children_text(rows[0].select("div"), [body[157], body[158], ""])
        replace_children_text(rows[1].select("div"), [body[159], body[160], body[161]])
        replace_children_text(rows[2].select("div"), [body[162], body[163], body[164]])
        replace_children_text(rows[3].select("div"), [body[165], body[166], body[167]])
    replace_children_text(soup.select("#continuity .loop-card span"), body[168:173])

    for card, base in zip(soup.select("#projects .project-card"), [176, 179, 182]):
        set_text(card.select_one(".project-tag"), body[base])
        set_text(card.select_one("h3"), body[base + 1])
        set_text(card.select_one("p"), body[base + 2])
    for card, base in zip(soup.select("#team .team-card"), [188, 191, 194]):
        set_text(card.select_one("h3"), body[base])
        set_text(card.select_one(".team-role"), body[base + 1])
        set_text(card.select_one("p:not(.team-role)"), body[base + 2])
    for detail, base in zip(soup.select("#faq details"), [200, 202, 204, 206]):
        set_text(detail.select_one("summary"), body[base])
        set_text(detail.select_one(".accordion-body p"), body[base + 1])

    reassurance = soup.select_one("#contact .reassurance-card")
    if reassurance:
        reassurance.clear()
        paragraph = soup.new_tag("p")
        paragraph.string = body[211]
        reassurance.append(paragraph)
    ctas = soup.select("#contact .cta-actions .button")
    if ctas:
        set_text(ctas[0], body[212])
        for extra in ctas[1:]:
            extra.decompose()
    form_labels = [body[214], body[215], body[216], body[217], body[218], body[225], body[233], body[240], body[242], body[243]]
    for label, value in zip(soup.select("#contact .form-field > label:not(.checkbox-label)"), form_labels):
        set_text(label, value)
    select_values = [
        [body[219], body[220], body[221], body[222], body[223], body[224]],
        [body[226], body[227], body[228], body[229], body[230], body[231], body[232]],
        [body[234], body[235], body[236], body[237], body[238], body[239]],
    ]
    for select, values in zip(soup.select("#contact select"), select_values):
        select.clear()
        for i, value in enumerate(values):
            option = soup.new_tag("option")
            option.string = value
            if i == 0:
                option["disabled"] = ""
                option["selected"] = ""
                option["value"] = ""
            select.append(option)
    consent = soup.select_one("#contact .checkbox-label span")
    if consent:
        consent.clear()
        consent.append(NavigableString(body[244]))

    update_footer_cookie(soup, code, body)

    modal_groups = {
        "modal-service-custom": body[272:292],
        "modal-sector-hotels": body[292:313],
        "modal-sector-restaurants": body[313:327],
        "modal-sector-wellness": body[327:339],
        "modal-sector-medical": body[339:355],
        "modal-sector-service": body[355:368],
        "modal-sector-guest": body[368:380],
        "modal-phase-1": body[380:390],
        "modal-phase-2": body[390:400],
        "modal-phase-3": body[400:409],
        "modal-parameter-quantities": body[409:416],
        "modal-parameter-pricing": body[416:418],
        "modal-parameter-timing": body[418:429],
    }
    for template_id, values in modal_groups.items():
        template = soup.find("template", id=template_id)
        if not template:
            continue
        template.clear()
        article = soup.new_tag("article")
        article["class"] = "modal-article"
        template.append(article)
        if values:
            heading = soup.new_tag("h2")
            heading.string = values[0]
            article.append(heading)
            current_list = None
            for value in values[1:]:
                if value.startswith("- "):
                    if current_list is None:
                        current_list = soup.new_tag("ul")
                        article.append(current_list)
                    current_list.append(new_li(soup, value))
                else:
                    current_list = None
                    paragraph = soup.new_tag("p")
                    paragraph.string = value
                    article.append(paragraph)
    cost_driver = soup.find("template", id="modal-parameter-cost-drivers")
    if cost_driver:
        cost_driver.decompose()

    info["home"].write_text(str(soup), encoding="utf-8")


def common_head(title, desc, code, canonical):
    alternates = "".join(
        f'<link rel="alternate" hreflang="{hreflang}" href="https://studio.pamuuc.com{path}"/>'
        for hreflang, path in {"en": "/", "fr": "/fr/", "it": "/it/", "es": "/es/", "de": "/de/", "x-default": "/"}.items()
    )
    return (
        f'<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>'
        f'<title>{html.escape(title)}</title><meta name="description" content="{html.escape(desc)}"/>'
        f'<meta name="robots" content="index,follow,max-image-preview:large"/><meta name="googlebot" content="index,follow,max-image-preview:large"/>'
        f'<link rel="canonical" href="https://studio.pamuuc.com{canonical}"/>{alternates}'
        f'<meta property="og:type" content="website"/><meta property="og:title" content="{html.escape(title)}"/>'
        f'<meta property="og:description" content="{html.escape(desc)}"/><meta property="og:url" content="https://studio.pamuuc.com{canonical}"/>'
        f'<meta property="og:site_name" content="Pamuuc Studio"/><meta property="og:image" content="https://studio.pamuuc.com/assets/images/social-home-preview.png"/>'
        f'<meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="{html.escape(title)}"/>'
        f'<meta name="twitter:description" content="{html.escape(desc)}"/><meta name="theme-color" content="#fcf9f3"/>'
        f'<link rel="stylesheet" href="/styles.css"/><link rel="stylesheet" href="/assets/css/shared.css"/><link rel="stylesheet" href="/assets/css/pages/blog.css"/>'
        f'<script defer src="/script.js"></script></head>'
    )


def common_header(code):
    labels = nav_items_from_blog(code)
    hrefs = [
        f"{LANGS[code]['home_href']}#sectors",
        f"{LANGS[code]['home_href']}#process",
        f"{LANGS[code]['home_href']}#projects",
        "/en/blog/" if code == "en" else f"/{code}/blog/",
        f"{LANGS[code]['home_href']}#contact",
    ]
    nav = ""
    for i, label in enumerate(labels):
        class_attr = ' class="nav-cta"' if i == len(labels) - 1 else ""
        nav += f'<li><a{class_attr} href="{hrefs[i]}">{html.escape(label)}</a></li>'
    language_links = "".join(
        f'<a class="lang-link{" is-active" if lang == code else ""}" data-lang-switch="{lang}" href="{LANGS[lang]["home_href"]}">{lang.upper()}</a>'
        for lang in LANG_ORDER
    )
    menu_label = COPIES[code][1]["body"][1]
    skip = COPIES[code][1]["body"][0]
    return (
        f'<a class="skip-link" href="#main">{html.escape(skip)}</a><header class="site-header" id="top"><div class="container header-inner">'
        f'<a aria-label="Pamuuc Studio" class="brand" href="{LANGS[code]["home_href"]}"><img alt="Pamuuc Studio" class="brand-logo" height="34" '
        f'src="https://cdn.shopify.com/s/files/1/0577/3688/8485/files/Name_Logo_Red.png?v=1772223889" width="190"/></a>'
        f'<button aria-controls="site-nav" aria-expanded="false" aria-label="{html.escape(menu_label)}" class="menu-toggle" type="button">'
        f'<span></span><span></span><span></span><span class="sr-only">{html.escape(menu_label)}</span></button>'
        f'<nav aria-label="Main navigation" class="site-nav" id="site-nav"><ul class="site-nav-list">{nav}</ul></nav>'
        f'<nav aria-label="Language selector" class="language-switcher">{language_links}</nav></div></header>'
    )


def common_footer(code):
    body = COPIES[code][0]["body"]
    base = "" if code == "en" else f"/{code}/"
    blog_href = "/en/blog/" if code == "en" else f"/{code}/blog/"
    language_links = "".join(
        f'<a class="lang-link{" is-active" if lang == code else ""}" data-lang-switch="{lang}" href="{LANGS[lang]["home_href"]}">{lang.upper()}</a>'
        for lang in LANG_ORDER
    )
    return (
        f'<footer class="site-footer"><div class="container footer-inner"><div class="footer-brand">'
        f'<img alt="Pamuuc Studio" class="footer-logo" decoding="async" height="30" loading="lazy" '
        f'src="https://cdn.shopify.com/s/files/1/0577/3688/8485/files/Name_Logo_Red.png?v=1772223889" width="170"/>'
        f'<p>{html.escape(body[246])}</p></div><div class="footer-links-columns">'
        f'<nav aria-label="Studio links" class="footer-links footer-links-info"><p class="footer-links-title">{html.escape(body[247])}</p>'
        f'<a href="/sitemap.xml">{html.escape(body[248])}</a><a href="https://pamuuc.com" rel="noopener noreferrer" target="_blank">{html.escape(body[249])}</a>'
        f'<a href="{base}#services">{html.escape(body[250])}</a><a href="{base}#projects">{html.escape(body[251])}</a><a href="{blog_href}">{html.escape(body[252])}</a></nav>'
        f'<nav aria-label="Policy links" class="footer-links footer-links-policies"><p class="footer-links-title">{html.escape(body[253])}</p>'
        f'<a href="{base}privacy-policy/">{html.escape(body[254])}</a><a href="{base}cookie-policy/">{html.escape(body[255])}</a>'
        f'<a href="{base}terms-and-conditions/">{html.escape(body[256])}</a><a href="{base}legal-notice/">{html.escape(body[257])}</a></nav></div>'
        f'<nav aria-label="Language selector" class="language-switcher footer-language-switcher">{language_links}</nav></div></footer>'
        f'<aside aria-label="Cookie preferences" aria-live="polite" class="cookie-banner" id="cookie-banner"><p>{html.escape(body[268])}</p>'
        f'<div class="cookie-actions"><button class="button button-primary" id="cookie-accept" type="button">{html.escape(body[269])}</button>'
        f'<button class="button button-secondary" id="cookie-reject" type="button">{html.escape(body[270])}</button></div></aside>'
    )


def filtered_content(page, code):
    blocks = body_blocks(page["raw_body"])
    remove = set()
    for line in blocks[:28]:
        lowered = line.lower()
        if line.startswith("- ") or line in ["EN", "FR", "IT", "ES", "DE"] or any(word in lowered for word in ["menu", "contenu", "contenido", "contenuto", "inhalt"]):
            remove.add(line)
    cut = len(blocks)
    for candidate in [COPIES[code][0]["body"][246], "Pamuuc Studio"]:
        for i, line in enumerate(blocks):
            if i > 10 and line == candidate:
                cut = min(cut, i)
                break
    return [line for line in blocks[:cut] if line not in remove and line not in ["EN", "FR", "IT", "ES", "DE"]]


def render_generic_page(code, page, output, canonical, kind):
    content = filtered_content(page, code) or [page["title"]]
    kicker = content[0] if kind in ["blog-index", "article"] and len(content) > 1 else ""
    h1 = content[1] if kicker else content[0]
    rest = content[2:] if kicker else content[1:]
    heading = (f'<p class="section-kicker">{html.escape(kicker)}</p>' if kicker else "") + f"<h1>{html.escape(h1)}</h1>"
    flow = []
    in_list = False
    for line in rest:
        if line.startswith("- "):
            if not in_list:
                flow.append("<ul>")
                in_list = True
            flow.append(f"<li>{html.escape(clean_bullet(line))}</li>")
        else:
            if in_list:
                flow.append("</ul>")
                in_list = False
            if len(line) < 90 and (line.isupper() or not line.endswith((".", ":", "?", "!"))):
                flow.append(f"<h2>{html.escape(line)}</h2>")
            else:
                flow.append(f"<p>{html.escape(line)}</p>")
    if in_list:
        flow.append("</ul>")
    document = (
        f'<!DOCTYPE html><html lang="{code}">{common_head(page["title"], page["desc"], code, canonical)}'
        f'<body data-language="{code}">{common_header(code)}<main id="main"><section class="section page"><div class="container">'
        f'<div class="section-heading">{heading}</div><div class="text-flow">{"".join(flow)}</div></div></section></main>{common_footer(code)}</body></html>'
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(document, encoding="utf-8")


for language in LANG_ORDER:
    update_home(language)

SLUGS = {
    "en": ["custom-dental-clinic-uniforms-barcelona", "custom-hospitality-uniforms", "wellness-studio-uniform-system"],
    "fr": ["uniformes-clinique-dentaire-sur-mesure-barcelone", "uniformes-hotellerie-personnalises", "uniformes-studios-bien-etre"],
    "it": ["divise-clinica-dentale-personalizzate-barcellona", "divise-hospitalita-personalizzate", "divise-studi-benessere"],
    "es": ["uniformes-clinica-dental-personalizados-barcelona", "uniformes-hosteleria-personalizados", "uniformes-estudios-bienestar"],
    "de": ["uniformen-zahnarztpraxen-barcelona", "uniformen-hotellerie", "uniformen-wellness-studios"],
}
LEGAL_DIRS = ["privacy-policy", "cookie-policy", "terms-and-conditions", "legal-notice"]

for language in LANG_ORDER:
    pages = COPIES[language]
    base = ROOT if language == "en" else ROOT / language
    render_generic_page(language, pages[1], base / "blog/index.html", "/en/blog/" if language == "en" else f"/{language}/blog/", "blog-index")
    for page_index, slug in enumerate(SLUGS[language], start=2):
        render_generic_page(language, pages[page_index], base / f"blog/{slug}/index.html", ("/en/" if language == "en" else f"/{language}/") + f"blog/{slug}/", "article")
    for page_index, directory in enumerate(LEGAL_DIRS, start=5):
        render_generic_page(language, pages[page_index], base / f"{directory}/index.html", ("/" if language == "en" else f"/{language}/") + f"{directory}/", "legal")

for page_index, directory in enumerate(LEGAL_DIRS, start=5):
    render_generic_page("en", COPIES["en"][page_index], ROOT / f"{directory}/index.html", f"/{directory}/", "legal")

print("updated copy across home, blog, articles, and legal pages")
