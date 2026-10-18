#!/bin/sh
# kelime/public → www + sim yamaları (YouTube yerine yerel <video>, gri kapak, test betiği)
set -e
cd "$(dirname "$0")/.."
rm -rf www && mkdir www
rsync -a --exclude 'ses/' --exclude 'sw.js' --exclude 'oynatici*.html' --exclude '_headers' --exclude 'robots.txt' ${1:-$HOME/Projeler/kelime/public}/ www/
cp ek/* www/
python3 - <<'P'
p='www/akis.js'; s=open(p).read(); s=s.replace('https://i.ytimg.com/vi/${v.id}/hqdefault.jpg','./sim-kapak.png'); open(p,'w').write(s)
p='www/yt-koprusu.js'; s=open(p).read()
s=s.replace("if (typeof m.ses === 'boolean') this.sessiz = m.ses;","if (typeof m.ses === 'boolean') this.sessiz = m.ses; if (typeof m.kare === 'number') this.kare = m.kare;")
s=s.replace("this.cerceve.src = SITE + '/oynatici.html?' + q;","this.cerceve.src = './sim-oynatici.html?' + q;")
open(p,'w').write(s)
p='www/index.html'; s=open(p).read(); s=s.replace('</body>','<script type="module" src="/sim-test.js"></script></body>',1); open(p,'w').write(s)
P
grep -c sim-oynatici www/yt-koprusu.js; grep -c sim-kapak www/akis.js
