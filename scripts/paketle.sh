#!/bin/sh
# Voca arayüzünü uygulamanın içine koyar: ../kelime/public → www (ses dosyaları ve servis çalışanı hariç; sesler sunucudan gelir)
set -e
KAYNAK="${1:-$HOME/Projeler/kelime/public}"
cd "$(dirname "$0")/.."
rm -rf www && mkdir www
rsync -a --exclude 'ses/' --exclude 'sw.js' --exclude 'oynatici*.html' --exclude '_headers' --exclude 'robots.txt' "$KAYNAK"/ www/
echo "www hazır: $(du -sh www | cut -f1), $(find www -type f | wc -l) dosya"
