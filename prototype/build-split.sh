#!/bin/bash
# PAMUUC SUITE — build the multi-file prototype for publishing.
# Same sources as build.sh; the catalogue and the fonts become their own
# files so the page itself stays small and parses immediately.
set -e
cd "$(dirname "$0")"
OUT=build
mkdir -p "$OUT"
rm -f "$OUT"/index.html "$OUT"/fonts.css "$OUT"/app.css "$OUT"/data.js "$OUT"/catalogue.js "$OUT"/app.js

if grep -l '</script' 10-data.js 12-catalogue.js 15-csv.js 20-store.js 25-actions.js 30-public.js 40-account.js 50-studio.js 60-app.js 2>/dev/null; then
  echo "FAIL: a source file contains a literal </script"; exit 1
fi

cat 01-fonts.css                             > "$OUT/fonts.css"
cat 02-tokens.css 03-components.css 04-layout.css 05-editorial.css > "$OUT/app.css"
cat 10-data.js                               > "$OUT/data.js"
cat 12-catalogue.js                          > "$OUT/catalogue.js"
cat 15-csv.js 20-store.js 25-actions.js 30-public.js 40-account.js 50-studio.js 60-app.js > "$OUT/app.js"

cat > "$OUT/index.html" <<'HTML'
<title>PAMUUC Suite</title>
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="app.css">
<div id="root"><noscript>This prototype needs JavaScript.</noscript></div>
<script>
/* If any part of the app fails to load, say so instead of showing a blank page. */
window.addEventListener('error', function(e){
  var t = e.target;
  if(!t || (t.tagName !== 'SCRIPT' && t.tagName !== 'LINK')) return;
  var root = document.getElementById('root');
  if(root && !root.dataset.failed){
    root.dataset.failed = '1';
    root.innerHTML = '<div style="max-width:640px;margin:80px auto;padding:0 24px;'
      + 'font:16px/1.5 system-ui,sans-serif"><strong>The prototype could not finish loading.</strong>'
      + '<p>' + (t.src || t.href || 'a file') + ' did not load. Reload the page to try again.</p></div>';
  }
}, true);
</script>
<script src="data.js"></script>
<script src="catalogue.js"></script>
<script src="app.js"></script>
HTML

# A local copy carrying the head the publisher injects, so narrow-viewport
# testing behaves the way the published page will.
{ echo '<!doctype html><html><head><meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1">'
  echo '<style>:root{color-scheme:light}body{margin:0;padding:0;background:#faf9f5;color:#141413}img{max-width:100%}</style>'
  echo '</head><body>'
  cat "$OUT/index.html"
  echo '</body></html>'; } > "$OUT/_local.html"

echo "built $OUT:"
for f in index.html fonts.css app.css data.js catalogue.js app.js; do
  printf '  %-14s %8s bytes\n' "$f" "$(wc -c < "$OUT/$f" | tr -d ' ')"
done
