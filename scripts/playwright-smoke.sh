#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://studio.pamuuc.com}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${2:-output/playwright/phase6-${TIMESTAMP}}"
SESSION="phase6-smoke"

mkdir -p "$OUT_DIR"

pw() {
  npx --yes --package @playwright/cli playwright-cli -s="$SESSION" "$@"
}

json_from_eval() {
  ruby -rjson -e 'text = STDIN.read; json = text[/### Result\s*(\{.*?\})\s*### Ran/m, 1] || text[/\{.*?\}/m]; abort("No JSON found in Playwright output") unless json; puts JSON.pretty_generate(JSON.parse(json))'
}

path_from_cli_output() {
  ruby -e 'text = STDIN.read; path = text[/\.playwright-cli\/[^\s)]+\.(png|yml)/, 0]; abort("No artifact path found in Playwright output") unless path; puts path'
}

take_screenshot() {
  local destination="$1"
  local output
  local source_path

  output="$(pw screenshot)"
  source_path="$(printf "%s" "$output" | path_from_cli_output)"
  cp "$source_path" "$destination"
}

open_mobile_menu() {
  local snapshot_output
  local snapshot_path
  local menu_ref

  snapshot_output="$(pw snapshot)"
  snapshot_path="$(printf "%s" "$snapshot_output" | path_from_cli_output)"
  menu_ref="$(ruby -e 'path = ARGV.fetch(0); text = File.read(path); ref = text[/button ".*menu.*".*\[ref=(e\d+)\]/i, 1]; abort("No mobile menu ref found") unless ref; puts ref' "$snapshot_path")"
  pw click "$menu_ref" >/dev/null
}

normalized_base="${BASE_URL%/}"

SUMMARY_FILE="$OUT_DIR/home-smoke.md"
{
  echo "# Phase 6 Smoke QA"
  echo
  echo "- Base URL: ${BASE_URL}"
  echo "- Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
  echo
} >"$SUMMARY_FILE"

pw open "${normalized_base}/" >/dev/null

for path in / /en/ /fr/ /it/ /es/; do
  page_url="${normalized_base}${path}"
  pw goto "$page_url" >/dev/null

  {
    echo "## ${path}"
    pw eval "({ url: location.href, title: document.title, h1: document.querySelector('h1')?.textContent?.trim(), lang: document.documentElement.lang, hasForm: !!document.querySelector('#contact-form'), hasMenu: !!document.querySelector('.menu-toggle'), bodyPageType: document.body?.dataset.pageType || null })" | json_from_eval
    echo
  } >>"$SUMMARY_FILE"
done

pw goto "${normalized_base}/en/" >/dev/null
pw resize 1440 980 >/dev/null
take_screenshot "${OUT_DIR}/en-home-desktop.png"

{
  echo "## /en/ Console Errors"
  pw console error
  echo
} >>"$SUMMARY_FILE"

pw resize 390 844 >/dev/null
take_screenshot "${OUT_DIR}/en-home-mobile.png"

{
  echo "## /en/ Mobile State"
  pw eval "({ width: window.innerWidth, hasMenuButton: !!document.querySelector('.menu-toggle'), menuVisible: !!document.querySelector('.site-nav.is-open') })" | json_from_eval
  echo
} >>"$SUMMARY_FILE"

pw goto "${normalized_base}/fr/" >/dev/null
pw resize 390 844 >/dev/null
open_mobile_menu
take_screenshot "${OUT_DIR}/fr-home-mobile-menu.png"

{
  echo "## /fr/ Mobile Menu"
  pw eval "({ menuVisible: !!document.querySelector('.site-nav.is-open'), mobileLanguageVisible: !!document.querySelector('.mobile-language-dropdown.is-open') })" | json_from_eval
  echo
} >>"$SUMMARY_FILE"

pw goto "${normalized_base}/" >/dev/null
pw resize 390 844 >/dev/null
take_screenshot "${OUT_DIR}/root-mobile.png"

{
  echo "## / Root Modal"
  pw eval "({ languageModalVisible: !!document.querySelector('#language-modal.is-visible'), bodyClasses: document.body.className })" | json_from_eval
  echo
} >>"$SUMMARY_FILE"

pw close >/dev/null

echo "Smoke QA complete."
echo "Summary: ${SUMMARY_FILE}"
echo "Artifacts: ${OUT_DIR}"
