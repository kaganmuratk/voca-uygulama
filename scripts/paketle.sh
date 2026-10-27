#!/bin/sh
# Voca arayüzünü uygulamanın içine koyar: ../kelime/public → www.
# Gömülü: arayüz, sözlük (sozluk.json: açılış ağı beklemesin, çevrimdışı arama çalışsın), akış altyazıları.
# Pilot videolar (akis-video/, ~20 MB) pakette gömülü: ilk video anında; servis çalışanı (uygulamada gereksiz), oynatıcı köprüsü.
set -e
KAYNAK="${1:-$HOME/Projeler/kelime/public}"
cd "$(dirname "$0")/.."
rm -rf www && mkdir www
rsync -a --exclude 'ses/' --exclude 'sw.js' --exclude 'oynatici*.html' --exclude '_headers' --exclude 'robots.txt' "$KAYNAK"/ www/
# gömülü yalnızca akis-kendi.json'daki videolar (havuz çalışması public/'e henüz listelenmemiş dosya bırakabilir)
python3 - <<'PY'
import json, os
d = json.load(open('www/akis-kendi.json')); d = d if isinstance(d, list) else d.get('videolar', [])
ids = {v['id'] for v in d[:int(os.environ.get('GOMULU_SAYI', '2'))]}   # varsayılan: ilk 2 video gömülü (ilk açılış), kalanı sunucudan akar (manifestte sunucu:true)
for k in ('akis-video', 'akis-altyazi'):
    for f in os.listdir('www/' + k):
        if f.split('.')[0] not in ids: os.remove(f'www/{k}/{f}')
for v in d: v['sunucu'] = v['id'] not in ids   # pakette olmayanlar sunucudan (yerel oynatıcı http adresiyle açar, kapak da sunucudan)
json.dump(d, open('www/akis-kendi.json', 'w'), ensure_ascii=False)
PY
# sözlük: canlı sunucudan (derleme anındaki sürüm); başarısız olursa önceki kopya kullanılır
if curl -sf --max-time 60 -H 'X-Voca-App: 1' https://voca.revelalabs.com.tr/api/sozluk -o www/sozluk.json.tmp && [ "$(wc -c < www/sozluk.json.tmp)" -gt 500000 ]; then mv www/sozluk.json.tmp www/sozluk.json; cp www/sozluk.json sozluk.son.json; else rm -f www/sozluk.json.tmp; [ -f sozluk.son.json ] && cp sozluk.son.json www/sozluk.json; fi
[ -s www/sozluk.json ] || { echo "HATA: sozluk.json yok" >&2; exit 1; }
echo "www hazır: $(du -sh www | cut -f1), $(find www -type f | wc -l) dosya, sözlük $(wc -c < www/sozluk.json) bayt"
