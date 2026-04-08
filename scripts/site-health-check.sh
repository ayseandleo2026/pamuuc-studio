#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:4173}"
SESSION="site-health"

pw() {
  npx --yes --package @playwright/cli playwright-cli -s="$SESSION" "$@"
}

extract_json_result() {
  ruby -e '
    text = STDIN.read
    json = text[/### Result\s*(\{.*\})\s*### Ran/m, 1] || text[/\{.*\}/m]
    abort("No JSON result found in Playwright output") unless json
    puts json
  '
}

extract_canonical_href() {
  ruby -e '
    html = STDIN.read
    canonical =
      html[/<link[^>]+rel=["\x27]canonical["\x27][^>]+href=["\x27]([^"\x27]+)["\x27]/i, 1] ||
      html[/<link[^>]+href=["\x27]([^"\x27]+)["\x27][^>]+rel=["\x27]canonical["\x27]/i, 1]
    abort("No canonical link found") unless canonical
    puts canonical
  '
}

extract_meta_refresh_target() {
  ruby -e '
    html = STDIN.read
    tag = html[/<meta[^>]+http-equiv=["\x27]refresh["\x27][^>]*>/i] || html[/<meta[^>]+content=["\x27][^"\x27]+["\x27][^>]+http-equiv=["\x27]refresh["\x27][^>]*>/i]
    abort("No refresh meta tag found") unless tag
    content = tag[/content=["\x27]([^"\x27]+)["\x27]/i, 1]
    abort("No refresh content found") unless content
    target = content[/url=(.+)\z/i, 1]
    abort("No refresh URL found") unless target
    puts target.strip
  '
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"

  if [[ "$haystack" != *"$needle"* ]]; then
    echo "FAIL: ${message}" >&2
    exit 1
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"

  if [[ "$haystack" == *"$needle"* ]]; then
    echo "FAIL: ${message}" >&2
    exit 1
  fi
}

trap 'pw close >/dev/null 2>&1 || true' EXIT

robots_txt="$(curl -fsSL "${BASE_URL%/}/robots.txt")"
sitemap_xml="$(curl -fsSL "${BASE_URL%/}/sitemap.xml")"
home_html="$(curl -fsSL "${BASE_URL%/}/")"
en_alias_html="$(curl -fsSL "${BASE_URL%/}/en/")"
check_paths_json="$(
  ruby -ryaml -rjson -e '
    data = YAML.load_file("_data/indexable_urls.yml")
    abort("No indexable URLs found") unless data.is_a?(Array) && !data.empty?
    puts JSON.generate(data.map { |entry| entry.fetch("loc") })
  '
)"
legal_paths=(
  "/privacy-policy/"
  "/cookie-policy/"
  "/terms-and-conditions/"
  "/legal-notice/"
  "/fr/privacy-policy/"
  "/fr/cookie-policy/"
  "/fr/terms-and-conditions/"
  "/fr/legal-notice/"
  "/it/privacy-policy/"
  "/it/cookie-policy/"
  "/it/terms-and-conditions/"
  "/it/legal-notice/"
  "/es/privacy-policy/"
  "/es/cookie-policy/"
  "/es/terms-and-conditions/"
  "/es/legal-notice/"
)

assert_contains "$robots_txt" "User-agent: *" "robots.txt should allow crawler targeting"
assert_contains "$robots_txt" "Sitemap:" "robots.txt should publish a sitemap"

assert_contains "$sitemap_xml" "<xhtml:link" "sitemap.xml should publish hreflang alternates"
assert_not_contains "$sitemap_xml" "/privacy-policy/</loc>" "sitemap.xml should not include legal pages"
assert_not_contains "$sitemap_xml" "/cookie-policy/</loc>" "sitemap.xml should not include legal pages"
assert_not_contains "$sitemap_xml" "/terms-and-conditions/</loc>" "sitemap.xml should not include legal pages"
assert_not_contains "$sitemap_xml" "/legal-notice/</loc>" "sitemap.xml should not include legal pages"
assert_not_contains "$sitemap_xml" "<loc>https://studio.pamuuc.com/en/</loc>" "sitemap.xml should not include the English alias homepage"

home_canonical="$(printf '%s' "$home_html" | extract_canonical_href)"
if [[ "$home_canonical" != "https://studio.pamuuc.com/" ]]; then
  echo "FAIL: homepage canonical should be https://studio.pamuuc.com/ but was ${home_canonical}" >&2
  exit 1
fi

en_alias_target="$(printf '%s' "$en_alias_html" | extract_meta_refresh_target)"
if [[ "$en_alias_target" != "/" ]]; then
  echo "FAIL: English alias should meta-refresh to / but was ${en_alias_target}" >&2
  exit 1
fi

for legal_path in "${legal_paths[@]}"; do
  legal_html="$(curl -fsSL "${BASE_URL%/}${legal_path}")"
  assert_contains "$legal_html" 'name="robots"' "legal page ${legal_path} should still output a robots meta tag"
  assert_contains "$legal_html" 'noindex,follow,max-image-preview:large' "legal page ${legal_path} should be noindex"
  legal_canonical="$(printf '%s' "$legal_html" | extract_canonical_href)"
  expected_legal_canonical="https://studio.pamuuc.com${legal_path}"
  if [[ "$legal_canonical" != "$expected_legal_canonical" ]]; then
    echo "FAIL: legal page ${legal_path} canonical should be ${expected_legal_canonical} but was ${legal_canonical}" >&2
    exit 1
  fi
done

pw open about:blank >/dev/null
audit_json="$(
  BASE_URL="$BASE_URL" CHECK_PATHS="$check_paths_json" pw run-code --filename scripts/playwright-site-health.js | extract_json_result
)"

printf '%s\n' "$audit_json" | ruby -rjson -e '
  payload = JSON.parse(STDIN.read)
  failures = []

  {
    "console warnings/errors" => payload["console"],
    "failed requests" => payload["requestFailed"],
    "bad HTTP responses" => payload["badResponses"]
  }.each do |label, entries|
    next if entries.nil? || entries.empty?
    failures << "#{label}: #{entries.size}\n#{JSON.pretty_generate(entries)}"
  end

  {
    "desktop pages with broken images" => payload["pageAuditsDesktop"],
    "mobile pages with broken images" => payload["pageAuditsMobile"]
  }.each do |label, entries|
    broken = Array(entries).filter { |entry| Array(entry["brokenImages"]).any? }
    next if broken.empty?
    failures << "#{label}: #{broken.size}\n#{JSON.pretty_generate(broken)}"
  end

  page_audits_desktop = payload["pageAuditsDesktop"] || []
  page_audits_mobile = payload["pageAuditsMobile"] || []
  root_page = page_audits_desktop.find { |entry| entry["path"] == "/" }

  if root_page && root_page["canonical"] != "https://studio.pamuuc.com/"
    failures << "homepage canonical mismatch: #{root_page["canonical"].inspect}"
  end

  unless page_audits_desktop.any? { |entry| entry["path"] == "/en/blog/" }
    failures << "missing /en/blog/ desktop audit entry"
  end

  unless page_audits_mobile.any? { |entry| entry["path"] == "/en/blog/" }
    failures << "missing /en/blog/ mobile audit entry"
  end

  if failures.any?
    warn failures.join("\n\n")
    exit 1
  end

  puts JSON.pretty_generate(payload)
'

echo "Site health check passed for ${BASE_URL}"
