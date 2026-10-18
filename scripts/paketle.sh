#!/bin/sh
# Voca arayüzünü uygulamanın içine koyar: ../kelime/public → www.
# Gömülü: arayüz, sözlük (sozluk.json: açılış ağı beklemesin, çevrimdışı arama çalışsın), akış altyazıları.
# Gömülmeyen: video dosyaları (akis-video/: sunucudan akar), servis çalışanı (uygulamada gereksiz), oynatıcı köprüsü.
set -e
KAYNAK="${1:-$HOME/Projeler/kelime/public}"
cd "$(dirname "$0")/.."
rm -rf www && mkdir www
rsync -a --exclude 'ses/' --exclude 'akis-video/' --exclude 'sw.js' --exclude 'oynatici*.html' --exclude '_headers' --exclude 'robots.txt' "$KAYNAK"/ www/
# sözlük: canlı sunucudan (derleme anındaki sürüm); başarısız olursa önceki kopya kullanılır
if curl -sf --max-time 60 -H 'X-Voca-App: 1' https://voca.revelalabs.com.tr/api/sozluk -o www/sozluk.json.tmp && [ "$(wc -c < www/sozluk.json.tmp)" -gt 500000 ]; then mv www/sozluk.json.tmp www/sozluk.json; cp www/sozluk.json sozluk.son.json; else rm -f www/sozluk.json.tmp; [ -f sozluk.son.json ] && cp sozluk.son.json www/sozluk.json; fi
[ -s www/sozluk.json ] || { echo "HATA: sozluk.json yok" >&2; exit 1; }
echo "www hazır: $(du -sh www | cut -f1), $(find www -type f | wc -l) dosya, sözlük $(wc -c < www/sozluk.json) bayt"
