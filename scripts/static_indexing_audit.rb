#!/usr/bin/env ruby
# frozen_string_literal: true

require "cgi"
require "pathname"
require "uri"
require "yaml"

SITE_DIR = Pathname.new(ARGV.fetch(0, "_site")).expand_path
ROOT_DIR = Pathname.pwd
SITE_CONFIG = YAML.safe_load(File.read(ROOT_DIR.join("_config.yml")), permitted_classes: [], aliases: false) || {}
SITE_URL = SITE_CONFIG.fetch("url")
INDEXABLE_URLS = YAML.safe_load(File.read(ROOT_DIR.join("_data/indexable_urls.yml")), permitted_classes: [], aliases: false) || []
LEGAL_PATHS = %w[
  /privacy-policy/
  /cookie-policy/
  /terms-and-conditions/
  /legal-notice/
  /fr/privacy-policy/
  /fr/cookie-policy/
  /fr/terms-and-conditions/
  /fr/legal-notice/
  /it/privacy-policy/
  /it/cookie-policy/
  /it/terms-and-conditions/
  /it/legal-notice/
  /es/privacy-policy/
  /es/cookie-policy/
  /es/terms-and-conditions/
  /es/legal-notice/
].freeze
DISALLOWED_INTERNAL_PATTERNS = [
  %r{/en/(?:["'#?]|$)},
  %r{/privacy-policy\.html(?:["'#?]|$)},
  %r{/cookie-policy\.html(?:["'#?]|$)},
  %r{/terms-and-conditions\.html(?:["'#?]|$)},
  %r{/legal-notice\.html(?:["'#?]|$)}
].freeze
ASSET_EXTENSIONS = /\.(?:css|js|svg|png|jpe?g|webp|gif|ico)$/i

def built_file_for(path)
  clean = path.sub(%r{\A/}, "")
  return SITE_DIR.join("index.html") if clean.empty?
  return SITE_DIR.join(clean, "index.html") if path.end_with?("/")

  SITE_DIR.join(clean)
end

def canonical_href(html)
  html[/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i, 1] ||
    html[/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i, 1]
end

def robots_content(html, name)
  html[/<meta[^>]+name=["']#{Regexp.escape(name)}["'][^>]+content=["']([^"']+)["']/i, 1] ||
    html[/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']#{Regexp.escape(name)}["']/i, 1]
end

def alternate_map(html)
  tags = html.scan(/<link[^>]+rel=["']alternate["'][^>]*>/i)
  tags.each_with_object({}) do |tag, hash|
    href = tag[/href=["']([^"']+)["']/i, 1]
    hreflang = tag[/hreflang=["']([^"']+)["']/i, 1]
    hash[hreflang] = href if href && hreflang
  end
end

def all_html_files
  Dir.glob(SITE_DIR.join("**/*.html").to_s).map { |path| Pathname.new(path) }.sort
end

def internal_asset_references(html)
  patterns = [
    /(?:src|href|content)=["']([^"']+)["']/i,
    /srcset=["']([^"']+)["']/i
  ]

  values = []
  patterns.each do |pattern|
    html.scan(pattern).flatten.each { |match| values << match }
  end

  values.flat_map do |value|
    value.split(",").map do |candidate|
      candidate.strip.split(/\s+/).first
    end
  end.compact.uniq.select do |value|
    value.match?(ASSET_EXTENSIONS) &&
      !value.match?(%r{\A(?:https?:)?//}i) &&
      !value.start_with?("data:")
  end
end

def internal_page_references(html)
  html.scan(/href=["']([^"']+)["']/i).flatten.uniq.reject do |href|
    href.start_with?("#", "mailto:", "tel:", "javascript:") || href.match?(%r{\Ahttps?://}i)
  end
end

def resolve_site_reference(file_path, href)
  base_dir = file_path.dirname
  clean = href.split("#", 2).first.split("?", 2).first
  return nil if clean.empty?

  if clean.start_with?("/")
    built_file_for(clean)
  else
    Pathname.new(File.expand_path(clean, base_dir))
  end
end

def expected_robots(path)
  LEGAL_PATHS.include?(path) ? "noindex,follow,max-image-preview:large" : "index,follow,max-image-preview:large"
end

failures = []

INDEXABLE_URLS.each do |entry|
  path = entry.fetch("loc")
  file = built_file_for(path)
  unless file.exist?
    failures << "Missing built file for #{path}: expected #{file}"
    next
  end

  html = file.read
  expected_canonical = "#{SITE_URL}#{path}"
  canonical = canonical_href(html)
  failures << "Canonical mismatch for #{path}: #{canonical.inspect} != #{expected_canonical.inspect}" unless canonical == expected_canonical

  expected_robot_value = expected_robots(path)
  failures << "Robots mismatch for #{path}: #{robots_content(html, 'robots').inspect} != #{expected_robot_value.inspect}" unless robots_content(html, "robots") == expected_robot_value
  failures << "Googlebot mismatch for #{path}: #{robots_content(html, 'googlebot').inspect} != #{expected_robot_value.inspect}" unless robots_content(html, "googlebot") == expected_robot_value

  expected_alternates = entry.fetch("alternates").each_with_object({}) do |alternate, hash|
    hash[alternate.fetch("lang")] = "#{SITE_URL}#{alternate.fetch('path')}"
  end
  actual_alternates = alternate_map(html)
  failures << "Alternate mismatch for #{path}" unless expected_alternates == actual_alternates

  internal_asset_references(html).each do |asset_ref|
    target = resolve_site_reference(file, asset_ref)
    next if target && target.exist?

    failures << "Broken asset reference in #{file.relative_path_from(SITE_DIR)}: #{asset_ref}"
  end
end

all_html_files.each do |file|
  html = file.read
  relative = file.relative_path_from(SITE_DIR).to_s

  DISALLOWED_INTERNAL_PATTERNS.each do |pattern|
    next unless html.match?(pattern)

    failures << "Disallowed legacy URL pattern #{pattern.inspect} found in #{relative}"
  end

  internal_page_references(html).each do |href|
    target = resolve_site_reference(file, href)
    next if target.nil?

    if href.end_with?("/") || href.start_with?("/") || !File.extname(href).empty?
      unless target.exist?
        failures << "Broken internal page link in #{relative}: #{href}"
      end
    end
  end
end

homepage = built_file_for("/")
if homepage.exist?
  homepage_html = homepage.read
  required_links = [
    "/sectors/",
    "/sectors/hotel-uniforms/",
    "/process/",
    "/production/",
    "/en/blog/"
  ]
  required_links.each do |href|
    failures << "Homepage is missing required crawlable link #{href}" unless homepage_html.include?(%Q{href="#{href}"})
  end
end

if failures.any?
  warn failures.join("\n")
  exit 1
end

puts "Static indexing audit passed for #{SITE_DIR}"
