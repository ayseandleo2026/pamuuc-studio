#!/bin/bash
# PAMUUC SUITE — build the single-file prototype
set -e
cd "$(dirname "$0")"
OUT=pamuuc-suite.html

# refuse to build if any source would break out of the <script> block
if grep -l '</script' 10-data.js 12-catalogue.js 15-csv.js 20-store.js 25-actions.js 30-public.js 40-account.js 50-studio.js 60-app.js 2>/dev/null; then
  echo "FAIL: a source file contains a literal </script"; exit 1
fi

{
  echo '<title>PAMUUC Suite</title>'
  echo '<style>'
  cat 01-fonts.css 02-tokens.css 03-components.css 04-layout.css 05-editorial.css
  echo '</style>'
  echo '<div id="root"></div>'
  echo '<script>'
  cat 10-data.js 12-catalogue.js 15-csv.js 20-store.js 25-actions.js 30-public.js 40-account.js 50-studio.js 60-app.js
  echo '</script>'
} > "$OUT"

mkdir -p build
{ echo '<!doctype html><html><head><meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '<style>body{margin:0}img{max-width:100%}</style>'
  cat "$OUT"; echo '</html>'; } > build/_full.html
cp browser-audit.js build/_audit.js
cp ui-audit.js build/_ui.js

echo "built $OUT — $(wc -c < "$OUT" | tr -d ' ') bytes (audit copy in build/_full.html)"
