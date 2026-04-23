#!/usr/bin/env ruby
# frozen_string_literal: true

require "cgi"
require "fileutils"
require "json"
require "yaml"

ROOT = File.expand_path("..", __dir__)
COPY_DIR = File.join(ROOT, "docs", "copy-source")

LANGUAGE_ORDER = %w[en fr it es de].freeze
OG_LOCALES = {
  "en" => "en_US",
  "fr" => "fr_FR",
  "it" => "it_IT",
  "es" => "es_ES",
  "de" => "de_DE"
}.freeze

TEXT_FILES = {
  "en" => "Pamuuc Studio English Text.txt",
  "fr" => "Pamuuc Studio French Text.txt",
  "it" => "Pamuuc Studio Italian Text.txt",
  "es" => "Pamuuc Studio Spanish Text.txt",
  "de" => "Pamuuc Studio German Text.txt"
}.freeze

HOME_FILES = {
  "en" => "index.html",
  "fr" => "fr/index.html",
  "it" => "it/index.html",
  "es" => "es/index.html",
  "de" => "de/index.html"
}.freeze

BLOG_INDEX_FILES = {
  "en" => "en/blog/index.html",
  "fr" => "fr/blog/index.html",
  "it" => "it/blog/index.html",
  "es" => "es/blog/index.html",
  "de" => "de/blog/index.html"
}.freeze

LEGAL_FILES = {
  "privacy" => {
    "en" => "privacy-policy.html",
    "fr" => "fr/privacy-policy.html",
    "it" => "it/privacy-policy.html",
    "es" => "es/privacy-policy.html",
    "de" => "de/privacy-policy.html"
  },
  "cookie" => {
    "en" => "cookie-policy.html",
    "fr" => "fr/cookie-policy.html",
    "it" => "it/cookie-policy.html",
    "es" => "es/cookie-policy.html",
    "de" => "de/cookie-policy.html"
  },
  "terms" => {
    "en" => "terms-and-conditions.html",
    "fr" => "fr/terms-and-conditions.html",
    "it" => "it/terms-and-conditions.html",
    "es" => "es/terms-and-conditions.html",
    "de" => "de/terms-and-conditions.html"
  },
  "legal_notice" => {
    "en" => "legal-notice.html",
    "fr" => "fr/legal-notice.html",
    "it" => "it/legal-notice.html",
    "es" => "es/legal-notice.html",
    "de" => "de/legal-notice.html"
  }
}.freeze

ARTICLE_CONFIG = {
  "dental" => {
    "image" => "/assets/images/blog/custom-dental-clinic-uniforms-barcelona.jpg",
    "paths" => {
      "en" => "/en/blog/custom-dental-clinic-uniforms-barcelona/",
      "fr" => "/fr/blog/uniformes-clinique-dentaire-sur-mesure-barcelone/",
      "it" => "/it/blog/divise-clinica-dentale-personalizzate-barcellona/",
      "es" => "/es/blog/uniformes-clinica-dental-personalizados-barcelona/",
      "de" => "/de/blog/uniformen-zahnarztpraxen-barcelona/"
    },
    "files" => {
      "en" => "en/blog/custom-dental-clinic-uniforms-barcelona/index.html",
      "fr" => "fr/blog/uniformes-clinique-dentaire-sur-mesure-barcelone/index.html",
      "it" => "it/blog/divise-clinica-dentale-personalizzate-barcellona/index.html",
      "es" => "es/blog/uniformes-clinica-dental-personalizados-barcelona/index.html",
      "de" => "de/blog/uniformen-zahnarztpraxen-barcelona/index.html"
    },
    "related_order" => %w[hospitality wellness]
  },
  "hospitality" => {
    "image" => "/assets/images/blog/custom-hospitality-uniforms.jpg",
    "paths" => {
      "en" => "/en/blog/custom-hospitality-uniforms/",
      "fr" => "/fr/blog/uniformes-hotellerie-personnalises/",
      "it" => "/it/blog/divise-hospitalita-personalizzate/",
      "es" => "/es/blog/uniformes-hosteleria-personalizados/",
      "de" => "/de/blog/uniformen-hotellerie/"
    },
    "files" => {
      "en" => "en/blog/custom-hospitality-uniforms/index.html",
      "fr" => "fr/blog/uniformes-hotellerie-personnalises/index.html",
      "it" => "it/blog/divise-hospitalita-personalizzate/index.html",
      "es" => "es/blog/uniformes-hosteleria-personalizados/index.html",
      "de" => "de/blog/uniformen-hotellerie/index.html"
    },
    "related_order" => %w[dental wellness]
  },
  "wellness" => {
    "image" => "/assets/images/blog/wellness-studio-uniform-system.jpg",
    "paths" => {
      "en" => "/en/blog/wellness-studio-uniform-system/",
      "fr" => "/fr/blog/uniformes-studios-bien-etre/",
      "it" => "/it/blog/divise-studi-benessere/",
      "es" => "/es/blog/uniformes-estudios-bienestar/",
      "de" => "/de/blog/uniformen-wellness-studios/"
    },
    "files" => {
      "en" => "en/blog/wellness-studio-uniform-system/index.html",
      "fr" => "fr/blog/uniformes-studios-bien-etre/index.html",
      "it" => "it/blog/divise-studi-benessere/index.html",
      "es" => "es/blog/uniformes-estudios-bienestar/index.html",
      "de" => "de/blog/uniformen-wellness-studios/index.html"
    },
    "related_order" => %w[dental hospitality]
  }
}.freeze

LEGAL_SLUGS = {
  "privacy" => "privacy-policy",
  "cookie" => "cookie-policy",
  "terms" => "terms-and-conditions",
  "legal_notice" => "legal-notice"
}.freeze

LEGAL_HEADINGS = {
  "en" => [
    "Technical and usage data",
    "How to exercise your rights",
    "Essential cookies",
    "Analytics cookies",
    "Analytics provider",
    "Effect of blocking cookies"
  ],
  "fr" => [
    "Données techniques et d’usage",
    "Comment exercer vos droits",
    "Cookies essentiels",
    "Cookies analytiques",
    "Fournisseur analytique",
    "Effet du blocage des cookies"
  ],
  "it" => [
    "Dati tecnici e di utilizzo",
    "Come esercitare i tuoi diritti",
    "Cookie essenziali",
    "Cookie analitici",
    "Fornitore analitico",
    "Effetti del blocco dei cookie"
  ],
  "es" => [
    "Datos técnicos y de uso",
    "Cómo ejercer tus derechos",
    "Cookies esenciales",
    "Cookies analíticas",
    "Proveedor analítico",
    "Efecto de bloquear las cookies"
  ],
  "de" => [
    "Technische Daten und Nutzungsdaten",
    "So üben Sie Ihre Rechte aus",
    "Essenzielle Cookies",
    "Analyse-Cookies",
    "Anbieter der Analyse",
    "Auswirkungen der Blockierung von Cookies"
  ]
}.freeze

RELATED_MARKERS = {
  "en" => "Related reading",
  "fr" => "Lectures associées",
  "it" => "Letture correlate",
  "es" => "Lecturas relacionadas",
  "de" => "Weiterführende Lektüre"
}.freeze

SERVICE_MARKERS = {
  "en" => "Studio services",
  "fr" => "Services du studio",
  "it" => "Servizi dello studio",
  "es" => "Servicios del estudio",
  "de" => "Studioleistungen"
}.freeze

AUTHOR_PREFIXES = {
  "en" => /^By\s+/i,
  "fr" => /^Par\s+/i,
  "it" => /^Di\s+/i,
  "es" => /^Por\s+/i,
  "de" => /^Von\s+/i
}.freeze

SECTOR_DETAIL_PATHS = %w[
  /sectors/hotel-uniforms/
  /sectors/restaurant-uniforms/
  /sectors/wellness-uniforms/
  /sectors/medical-clinic-uniforms/
  /sectors/service-team-uniforms/
  /sectors/guest-service-uniforms/
].freeze

def value_after_colon(line)
  line[(line.index(":") + 1)..]&.strip.to_s
end

def split_blocks(lines)
  blocks = []
  current = []

  lines.each do |line|
    stripped = line.strip
    if stripped.empty?
      unless current.empty?
        blocks << current.join("\n")
        current = []
      end
      next
    end

    current << stripped
  end

  blocks << current.join("\n") unless current.empty?
  blocks
end

def parse_document(path)
  raw = File.read(path, encoding: "UTF-8")
  raw.split(/\n={10,}\n+/).map do |segment|
    lines = segment.lines.map(&:chomp)
    meta_start = lines.index { |line| line.strip.match?(/^(?:PAGE|PÁGINA):/i) }
    next unless meta_start

    trimmed = lines[meta_start..]
    {
      "page" => value_after_colon(trimmed[0]),
      "title" => value_after_colon(trimmed[1]),
      "description" => value_after_colon(trimmed[2]),
      "blocks" => split_blocks(trimmed[3..] || [])
    }
  end.compact
end

def strip_site_suffix(text)
  text.sub(/\s+\|\s+Pamuuc Studio\z/, "")
end

def locale_root(lang)
  lang == "en" ? "/" : "/#{lang}/"
end

def locale_page(lang, slug)
  lang == "en" ? "/#{slug}/" : "/#{lang}/#{slug}/"
end

def locale_blog_root(lang)
  lang == "en" ? "/en/blog/" : "/#{lang}/blog/"
end

def path_with_hash(root_path, anchor)
  "#{root_path}##{anchor}"
end

def escape_html(text)
  CGI.escapeHTML(text.to_s)
end

def frontmatter_document(frontmatter, body = "")
  yaml = frontmatter.to_yaml.sub(/\A---\s*\n/, "")
  +"---\n#{yaml}---\n#{body}"
end

def ensure_directory(path)
  FileUtils.mkdir_p(File.dirname(path))
end

def write_file(relative_path, content)
  absolute_path = File.join(ROOT, relative_path)
  ensure_directory(absolute_path)
  File.write(absolute_path, content)
end

def english_default(paths)
  paths["en"]
end

def alternates_for(paths, x_default: nil)
  alternates = {}
  LANGUAGE_ORDER.each do |lang|
    alternates[lang] = paths.fetch(lang)
  end
  alternates["x-default"] = x_default || english_default(paths)
  alternates
end

def language_paths_for(paths)
  LANGUAGE_ORDER.each_with_object({}) do |lang, result|
    result[lang] = paths.fetch(lang)
  end
end

def blog_post_frontmatter(lang, article_key, page_data, meta_items:, author_line:, related_posts:, service_blocks:)
  article_paths = ARTICLE_CONFIG.fetch(article_key).fetch("paths")
  article_title = strip_site_suffix(page_data.fetch("title"))
  root_path = locale_root(lang)
  blog_root = locale_blog_root(lang)
  author = author_line&.sub(AUTHOR_PREFIXES.fetch(lang), "")

  frontmatter = {}
  frontmatter["layout"] = "blog-post"
  frontmatter["lang"] = lang
  frontmatter["page_type"] = "blog-post"
  frontmatter["title"] = page_data.fetch("title")
  frontmatter["description"] = page_data.fetch("description")
  frontmatter["og_type"] = "article"
  frontmatter["og_locale"] = OG_LOCALES.fetch(lang)
  frontmatter["canonical_path"] = article_paths.fetch(lang)
  frontmatter["home_path"] = root_path
  frontmatter["sectors_path"] = locale_page(lang, "sectors")
  frontmatter["process_path"] = locale_page(lang, "process")
  frontmatter["production_path"] = locale_page(lang, "production")
  frontmatter["projects_path"] = path_with_hash(root_path, "projects")
  frontmatter["faq_path"] = path_with_hash(root_path, "faq")
  frontmatter["contact_path"] = path_with_hash(root_path, "contact")
  frontmatter["blog_path"] = blog_root
  frontmatter["styles"] = ["/assets/css/shared.css", "/assets/css/pages/blog.css"]
  frontmatter["use_alpine"] = true
  frontmatter["alpine_component"] = "pamuucHome()"
  frontmatter["alternates"] = alternates_for(article_paths)
  frontmatter["language_paths"] = language_paths_for(article_paths)
  frontmatter["date_published"] = "2026-03-10"
  frontmatter["date_modified"] = "2026-03-10"
  frontmatter["date_label"] = meta_items.shift
  frontmatter["meta_items"] = meta_items
  frontmatter["author"] = author if author && !author.empty?
  frontmatter["article_kicker"] = page_data.fetch("article_kicker")
  frontmatter["article_title"] = article_title
  frontmatter["breadcrumb_current"] = article_title
  frontmatter["cover_image"] = ARTICLE_CONFIG.fetch(article_key).fetch("image")
  frontmatter["cover_alt"] = article_title
  frontmatter["og_image"] = ARTICLE_CONFIG.fetch(article_key).fetch("image")
  frontmatter["og_image_alt"] = article_title
  frontmatter["related_heading"] = RELATED_MARKERS.fetch(lang)
  frontmatter["related_posts"] = related_posts
  frontmatter["service_kicker"] = SERVICE_MARKERS.fetch(lang)
  frontmatter["service_title"] = service_blocks[0]
  frontmatter["service_copy"] = service_blocks[1]
  frontmatter["service_cta"] = service_blocks[2]
  frontmatter["service_href"] = root_path
  frontmatter
end

def build_article_html(blocks)
  blocks.map do |block|
    if !block.include?("\n") && !block.match?(/[.!?…:]$/) && block.length < 120
      "<h2>#{escape_html(block)}</h2>"
    else
      "<p>#{escape_html(block.gsub("\n", " "))}</p>"
    end
  end.join("\n\n") + "\n"
end

def parse_article_page(lang, page_data, article_key)
  blocks = page_data.fetch("blocks")
  raise "Unexpected article structure for #{lang} #{article_key}" if blocks.length < 14

  article_kicker, article_title = blocks.fetch(5).split("\n", 2)
  meta_blocks = blocks.fetch(6).split("\n").reject { |line| line == "•" }

  related_index = blocks.index(RELATED_MARKERS.fetch(lang))
  service_index = blocks.index { |block| block.split("\n").first == SERVICE_MARKERS.fetch(lang) }
  raise "Missing related marker for #{lang} #{article_key}" unless related_index
  raise "Missing service marker for #{lang} #{article_key}" unless service_index

  body_blocks = blocks[7...related_index]
  related_blocks = blocks[(related_index + 1)...service_index]
  service_parts = blocks.fetch(service_index).split("\n")
  service_blocks = [service_parts[1], service_parts[2], blocks.fetch(service_index + 1)]
  author_line = meta_blocks.find { |line| line.match?(AUTHOR_PREFIXES.fetch(lang)) }

  related_posts = ARTICLE_CONFIG.fetch(article_key).fetch("related_order").each_with_index.map do |related_key, index|
    related_lines = related_blocks.fetch(index).split("\n")
    {
      "title" => related_lines.fetch(0),
      "description" => related_lines.fetch(1),
      "cta_label" => related_lines.fetch(2),
      "href" => ARTICLE_CONFIG.fetch(related_key).fetch("paths").fetch(lang)
    }
  end

  frontmatter = blog_post_frontmatter(
    lang,
    article_key,
    {
      "title" => page_data.fetch("title"),
      "description" => page_data.fetch("description"),
      "article_kicker" => article_kicker
    },
    meta_items: meta_blocks.dup,
    author_line: author_line,
    related_posts: related_posts,
    service_blocks: service_blocks
  )

  [frontmatter, build_article_html(body_blocks)]
end

def parse_blog_index(lang, page_data)
  blocks = page_data.fetch("blocks")
  raise "Unexpected blog index structure for #{lang}" if blocks.length < 13
  index_kicker, index_title = blocks.fetch(5).split("\n", 2)

  posts = %w[dental hospitality wellness].each_with_index.map do |article_key, index|
    meta_block = blocks.fetch(7 + (index * 2))
    date_label, title = meta_block.split("\n", 2)
    {
      "date" => "2026-03-10",
      "date_label" => date_label,
      "title" => title,
      "excerpt" => blocks.fetch(8 + (index * 2)),
      "href" => ARTICLE_CONFIG.fetch(article_key).fetch("paths").fetch(lang),
      "image" => ARTICLE_CONFIG.fetch(article_key).fetch("image"),
      "image_alt" => title
    }
  end

  index_paths = BLOG_INDEX_FILES.keys.each_with_object({}) do |language, result|
    result[language] = locale_blog_root(language)
  end

  root_path = locale_root(lang)
  frontmatter = {}
  frontmatter["layout"] = "blog-index"
  frontmatter["lang"] = lang
  frontmatter["page_type"] = "blog"
  frontmatter["title"] = page_data.fetch("title")
  frontmatter["description"] = page_data.fetch("description")
  frontmatter["og_locale"] = OG_LOCALES.fetch(lang)
  frontmatter["canonical_path"] = locale_blog_root(lang)
  frontmatter["home_path"] = root_path
  frontmatter["sectors_path"] = locale_page(lang, "sectors")
  frontmatter["process_path"] = locale_page(lang, "process")
  frontmatter["production_path"] = locale_page(lang, "production")
  frontmatter["projects_path"] = path_with_hash(root_path, "projects")
  frontmatter["faq_path"] = path_with_hash(root_path, "faq")
  frontmatter["contact_path"] = path_with_hash(root_path, "contact")
  frontmatter["blog_path"] = locale_blog_root(lang)
  frontmatter["styles"] = ["/assets/css/shared.css", "/assets/css/pages/blog.css"]
  frontmatter["use_alpine"] = true
  frontmatter["alpine_component"] = "pamuucHome()"
  frontmatter["alternates"] = alternates_for(index_paths, x_default: "/en/blog/")
  frontmatter["language_paths"] = language_paths_for(index_paths)
  frontmatter["index_kicker"] = index_kicker
  frontmatter["index_title"] = index_title
  frontmatter["index_intro"] = blocks.fetch(6)
  frontmatter["posts"] = posts
  frontmatter
end

def render_legal_dynamic_line(block)
  separator = block.index(":")
  return nil unless separator

  label = block[0...separator].strip
  value = block[(separator + 1)..].strip

  case value.downcase
  when "pamuuc organic clothing s.l."
    "<p>#{escape_html(label)}: {{ site.data.company.name }}</p>"
  when "b0541782"
    "<p>#{escape_html(label)}: {{ site.data.company.nif }}</p>"
  when "info@pamuuc.com"
    "<p>#{escape_html(label)}: {{ site.data.company.email }}</p>"
  when "studio.pamuuc.com"
    "<p>#{escape_html(label)}: {{ site.data.company.website }}</p>"
  else
    if value.match?(/^\[.*\]$/)
      if label.match?(/office|siège|sede|domicilio|sit/i)
        "{% if site.data.company.registered_office %}<p>#{escape_html(label)}: {{ site.data.company.registered_office }}</p>{% endif %}"
      elsif label.match?(/registry|registre|registro|mercantil|register/i)
        "{% if site.data.company.mercantile_registry_details %}<p>#{escape_html(label)}: {{ site.data.company.mercantile_registry_details }}</p>{% endif %}"
      end
    end
  end
end

def render_legal_body(lang, page_data)
  blocks = page_data.fetch("blocks")
  heading_set = LEGAL_HEADINGS.fetch(lang)
  title, last_updated = blocks.fetch(0).split("\n", 2)

  html = []
  html << '<main id="main" class="legal-main">'
  html << "  <div class=\"container\">"
  html << "    <article class=\"legal-card\">"
  html << "      <h1>#{escape_html(title)}</h1>"
  html << "      <p>#{escape_html(last_updated)}</p>"

  section_open = false

  blocks[1..].each do |block|
    first_line, *rest_lines = block.split("\n")
    break if first_line == "Pamuuc Studio"

    if first_line.match?(/^\d+\./) || heading_set.include?(first_line)
      html << "      </section>" if section_open
      html << "      <section>"
      html << "        <h2>#{escape_html(first_line)}</h2>"
      section_open = true
      lines = rest_lines
    else
      lines = [first_line, *rest_lines]
    end

    until lines.empty?
      if lines.first.start_with?("- ")
        html << "        <ul>"
        while lines.first&.start_with?("- ")
          html << "          <li>#{escape_html(lines.shift.sub(/^- /, "").strip)}</li>"
        end
        html << "        </ul>"
        next
      end

      current = lines.shift
      dynamic_line = render_legal_dynamic_line(current)
      if dynamic_line
        html << "        #{dynamic_line}"
      else
        html << "        <p>#{escape_html(current)}</p>"
      end
    end
  end

  html << "      </section>" if section_open
  html << "    </article>"
  html << "  </div>"
  html << "</main>"
  html.join("\n") + "\n"
end

def legal_frontmatter(lang, legal_key, page_data)
  page_paths = LEGAL_FILES.fetch(legal_key).transform_values do |relative_file|
    if relative_file == "privacy-policy.html"
      "/privacy-policy/"
    elsif relative_file == "cookie-policy.html"
      "/cookie-policy/"
    elsif relative_file == "terms-and-conditions.html"
      "/terms-and-conditions/"
    elsif relative_file == "legal-notice.html"
      "/legal-notice/"
    else
      relative_file.sub(/\.html\z/, "/").prepend("/")
    end
  end

  frontmatter = {}
  frontmatter["layout"] = "legal"
  frontmatter["lang"] = lang
  frontmatter["active_language"] = lang
  frontmatter["page_type"] = "legal"
  frontmatter["title"] = page_data.fetch("title")
  frontmatter["description"] = page_data.fetch("description")
  frontmatter["canonical_path"] = page_paths.fetch(lang)
  frontmatter["home_path"] = locale_root(lang)
  frontmatter["styles"] = ["/assets/css/shared.css", "/assets/css/pages/legal.css"]
  frontmatter["alternates"] = alternates_for(page_paths)
  frontmatter["language_paths"] = language_paths_for(page_paths)
  frontmatter
end

def replace_required(content, pattern, replacement, context)
  raise "Could not update #{context}" unless content.match?(pattern)

  content.sub(pattern, replacement)
end

def replace_frontmatter_line(content, key, value, context)
  lines = content.lines
  index = lines.index { |line| line.start_with?("#{key}:") }
  raise "Could not update #{context}" unless index

  lines[index] = "#{key}: #{value}\n"
  lines.join
end

def update_home_hero(section_html, page_data)
  blocks = page_data.fetch("blocks")
  eyebrow, title = blocks.fetch(0).split("\n", 2)
  lead = blocks.fetch(1)
  pills = blocks.fetch(2).split("\n")
  primary_cta, secondary_cta = blocks.fetch(3).split("\n", 2)
  top_label, top_text = blocks.fetch(4).split("\n", 2)
  bottom_label, bottom_text = blocks.fetch(5).split("\n", 2)

  updated = section_html.dup
  updated = replace_required(updated, /<p class="eyebrow">.*?<\/p>/m, "<p class=\"eyebrow\">#{escape_html(eyebrow)}</p>", "hero eyebrow")
  updated = replace_required(updated, /<h1>.*?<\/h1>/m, "<h1>#{escape_html(title)}</h1>", "hero title")
  updated = replace_required(updated, /<p class="hero-lead">.*?<\/p>/m, "<p class=\"hero-lead\">#{escape_html(lead)}</p>", "hero lead")
  pill_markup = pills.map { |pill_text| "<span class=\"pill\">#{escape_html(pill_text)}</span>" }.join("\n")
  updated = replace_required(
    updated,
    /<div aria-label="[^"]*" class="pill-row hero-pill-row">[\s\S]*?<\/div>/m,
    "<div aria-label=\"Studio highlights\" class=\"pill-row hero-pill-row\">\n#{pill_markup}\n</div>",
    "hero pills"
  )
  updated = replace_required(
    updated,
    /<div class="hero-actions">[\s\S]*?<\/div>/m,
    "<div class=\"hero-actions\">\n<a class=\"button button-primary\" href=\"#contact\">#{escape_html(primary_cta)}</a>\n<a class=\"button button-secondary\" href=\"#projects\">#{escape_html(secondary_cta)}</a>\n</div>",
    "hero actions"
  )

  {
    "floating-proof-top" => [top_label, top_text],
    "floating-proof-bottom" => [bottom_label, bottom_text]
  }.each do |class_name, values|
    fragment = updated[%r{<div class="[^"]*#{class_name}[^"]*">.*?</div>}m]
    raise "Could not update #{class_name}" unless fragment

    next_fragment = fragment.sub(/<strong>.*?<\/strong>/m, "<strong>#{escape_html(values[0])}</strong>")
    next_fragment = next_fragment.sub(/<span>.*?<\/span>/m, "<span>#{escape_html(values[1])}</span>")
    updated.sub!(fragment, next_fragment)
  end

  updated
end

def update_home_services(section_html, page_data)
  blocks = page_data.fetch("blocks")
  section_copy = blocks.fetch(6).split("\n")
  service_copy = blocks.fetch(7).split("\n")
  card_hint = blocks.fetch(8)

  updated = section_html.dup
  updated = replace_required(
    updated,
    /<div class="section-heading reveal">[\s\S]*?<\/div>/m,
    "<div class=\"section-heading reveal\">\n<p class=\"section-kicker\">#{escape_html(section_copy[0])}</p>\n<h2>#{escape_html(section_copy[1])}</h2>\n<p>#{escape_html(section_copy[2])}</p>\n</div>",
    "services intro"
  )
  updated = replace_required(updated, /<div class="service-topline">.*?<\/div>/m, "<div class=\"service-topline\">#{escape_html(service_copy[0])}</div>", "service topline")
  updated = replace_required(updated, /<h3>.*?<\/h3>/m, "<h3>#{escape_html(service_copy[1])}</h3>", "service title")
  updated = replace_required(updated, /(<h3>.*?<\/h3>\s*)<p>.*?<\/p>/m, "\\1<p>#{escape_html(service_copy[2])}</p>", "service description")

  feature_items = service_copy[3..].map { |line| line.sub(/^- /, "") }
  feature_markup = feature_items.map { |item| "<li>#{escape_html(item)}</li>" }.join("\n")
  updated = replace_required(updated, /<ul class="feature-list">[\s\S]*?<\/ul>/m, "<ul class=\"feature-list\">\n#{feature_markup}\n</ul>", "service list")

  updated = replace_required(updated, /<span class="card-hint">.*?<\/span>/m, "<span class=\"card-hint\">#{escape_html(card_hint)}</span>", "service card hint")
  updated
end

def patch_home_file(lang, page_data)
  relative_path = HOME_FILES.fetch(lang)
  absolute_path = File.join(ROOT, relative_path)
  content = File.read(absolute_path, encoding: "UTF-8")

  content = replace_frontmatter_line(content, "title", page_data.fetch("title").to_json, "#{relative_path} title")
  content = replace_frontmatter_line(content, "description", page_data.fetch("description").to_json, "#{relative_path} description")

  hero_fragment = content[/<section class="hero-section">.*?<\/section>/m]
  raise "Could not find hero section in #{relative_path}" unless hero_fragment

  content.sub!(hero_fragment, update_home_hero(hero_fragment, page_data))
  services_fragment = content[/<section class="section" id="services">.*?<\/section>/m]
  raise "Could not find services section in #{relative_path}" unless services_fragment

  content.sub!(services_fragment, update_home_services(services_fragment, page_data))
  if content.include?("<footer class=\"site-footer\">")
    content = replace_required(content, /<footer class="site-footer">.*?<\/footer>/m, "{% include page-footer.html %}", "#{relative_path} footer include")
  elsif !content.include?("{% include page-footer.html %}")
    raise "Could not update #{relative_path} footer include"
  end

  if content.include?("class=\"cookie-banner\" id=\"cookie-banner\"")
    content = replace_required(content, /<aside aria-label="[^"]*" aria-live="polite" class="cookie-banner" id="cookie-banner">.*?<\/aside>/m, "{% include cookie-banner.html %}", "#{relative_path} cookie include")
  elsif !content.include?("{% include cookie-banner.html %}")
    raise "Could not update #{relative_path} cookie include"
  end

  if lang == "de"
    content = replace_frontmatter_line(content, "blog_path", "/de/blog/", "#{relative_path} blog path")
    content.gsub!("href=\"../privacy-policy/\"", 'href="privacy-policy/"')
    content.gsub!("href=\"../terms-and-conditions/\"", 'href="terms-and-conditions/"')
  end

  content.sub!(/\n<div :aria-hidden="\(!modalOpen\)\.toString\(\)"[\s\S]*\z/, "\n")
  File.write(absolute_path, content)
end

def patch_de_landing_blog_paths
  %w[de/sectors/index.html de/process/index.html de/production/index.html].each do |relative_path|
    absolute_path = File.join(ROOT, relative_path)
    content = File.read(absolute_path, encoding: "UTF-8")
    next unless content.include?("blog_path: /en/blog/")

    File.write(absolute_path, content.sub("blog_path: /en/blog/", "blog_path: /de/blog/"))
  end
end

def build_indexable_entries
  entries = []

  add_cluster = lambda do |paths, x_default:|
    alternates = LANGUAGE_ORDER.map { |lang| { "lang" => lang, "path" => paths.fetch(lang) } }
    alternates << { "lang" => "x-default", "path" => x_default }
    paths.each_value do |path|
      entries << { "loc" => path, "alternates" => alternates.map(&:dup) }
    end
  end

  home_paths = LANGUAGE_ORDER.each_with_object({}) { |lang, map| map[lang] = locale_root(lang) }
  add_cluster.call(home_paths, x_default: "/")

  %w[sectors process production].each do |slug|
    paths = LANGUAGE_ORDER.each_with_object({}) { |lang, map| map[lang] = locale_page(lang, slug) }
    add_cluster.call(paths, x_default: locale_page("en", slug))
  end

  SECTOR_DETAIL_PATHS.each do |path|
    entries << {
      "loc" => path,
      "alternates" => [
        { "lang" => "en", "path" => path },
        { "lang" => "x-default", "path" => path }
      ]
    }
  end

  blog_index_paths = LANGUAGE_ORDER.each_with_object({}) { |lang, map| map[lang] = locale_blog_root(lang) }
  add_cluster.call(blog_index_paths, x_default: "/en/blog/")

  ARTICLE_CONFIG.each_value do |article|
    add_cluster.call(article.fetch("paths"), x_default: article.fetch("paths").fetch("en"))
  end

  entries
end

documents = TEXT_FILES.transform_values { |filename| parse_document(File.join(COPY_DIR, filename)) }

documents.each do |lang, pages|
  home_page, blog_index_page, dental_page, hospitality_page, wellness_page, privacy_page, cookie_page, terms_page, legal_page = pages

  patch_home_file(lang, home_page)
  write_file(BLOG_INDEX_FILES.fetch(lang), frontmatter_document(parse_blog_index(lang, blog_index_page)))

  {
    "dental" => dental_page,
    "hospitality" => hospitality_page,
    "wellness" => wellness_page
  }.each do |article_key, page_data|
    frontmatter, body = parse_article_page(lang, page_data, article_key)
    write_file(ARTICLE_CONFIG.fetch(article_key).fetch("files").fetch(lang), frontmatter_document(frontmatter, body))
  end

  {
    "privacy" => privacy_page,
    "cookie" => cookie_page,
    "terms" => terms_page,
    "legal_notice" => legal_page
  }.each do |legal_key, page_data|
    write_file(
      LEGAL_FILES.fetch(legal_key).fetch(lang),
      frontmatter_document(legal_frontmatter(lang, legal_key, page_data), render_legal_body(lang, page_data))
    )
  end
end

patch_de_landing_blog_paths
write_file("_data/indexable_urls.yml", build_indexable_entries.to_yaml.sub(/\A---\s*\n/, ""))

puts "Multilingual blog, legal, and homepage shared content synced successfully."
