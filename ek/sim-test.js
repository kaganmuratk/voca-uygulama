// iOS Simulator (CI) akış testi — KENDİ VİDEO AKIŞI: gerçek mp4'ler (canlı siteden, Range ile), gerçek WebKit.
// Aşama 1: 10 kaydırma, 5 sn arayla (normal kullanım). Aşama 2: hızlı seri kaydırma (700 ms arayla 8 kart). Günlük yerel sunucuya (127.0.0.1:8099).
const Http = window.Capacitor?.Plugins?.CapacitorHttp;
const gonder = (o) => { try { Http.post({ url: 'http://127.0.0.1:8099/log', headers: { 'Content-Type': 'application/json' }, data: { ts: Date.now(), ...o } }); } catch (e) { /* günlük yok */ } };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const asama = localStorage.getItem('sim-asama') || 'normal';
gonder({ olay: 'basla', asama, ua: navigator.userAgent, w: innerWidth, h: innerHeight });
addEventListener('error', (e) => gonder({ olay: 'js-hata', mesaj: String(e.message), kaynak: e.filename + ':' + e.lineno }));
addEventListener('unhandledrejection', (e) => gonder({ olay: 'js-red', mesaj: String(e.reason?.message || e.reason) }));
const snap = (etiket) => {
  const aktifKart = document.querySelector('.kv-kart.oynuyor, .kv-kart.yukleniyor, .kv-kart.durdu');
  const kartlar = [...document.querySelectorAll('.kv-kart')];
  const ai = aktifKart ? kartlar.indexOf(aktifKart) : -1;
  const sr = (() => { const r = aktifKart?.querySelector('.kv-sahne')?.getBoundingClientRect(); return r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null; })();
  const pp = [-1, 0, 1, 2].map((d) => { const k = kartlar[ai + d]; const v = k?.querySelector('video'); return v ? { d, rs: v.readyState, hz: v.dataset.hazir === '1', p: v.paused, t: +v.currentTime.toFixed(2), src: !!v.dataset.kaynak, m: v.muted } : null; });
  return { olay: 'snap', asama, etiket, ai, kart: aktifKart ? aktifKart.className.replace('kv-kart', '').trim() : '-', sr, pp, dbg: aktifKart?.querySelector('.kv-dbg')?.textContent || '', satir: aktifKart?.querySelector('.kv-satir')?.textContent?.trim().slice(0, 50) || '', hata: aktifKart?.querySelector('.kv-durum')?.textContent || '' };
};
(async () => {
  await bekle(5000);
  location.hash = '#/video';
  for (let k = 0; k < 100 && !document.querySelector('.kv-kart'); k++) await bekle(200);
  const liste = document.querySelector('.kv-liste'); if (!liste) { gonder({ olay: 'hata', mesaj: 'kv-liste yok', govde: document.body.innerText.slice(0, 200) }); gonder({ olay: 'bitti' }); return; }
  const dur = setInterval(() => gonder(snap('ara')), 200);
  await bekle(9000);
  gonder({ olay: 'isaret', etiket: 'ilk-video-bitti' });
  const kartlar = () => document.querySelectorAll('.kv-kart');
  const gec = (i) => { const k = kartlar()[i]; if (k) liste.scrollTo({ top: k.offsetTop, behavior: 'smooth' }); };
  if (asama === 'normal') {
    for (let i = 1; i <= 7; i++) { gonder({ olay: 'isaret', etiket: 'kaydir', i }); gec(i); await bekle(5000); }
    // altyazıyı sürükle (programlı): konum değişkeni
    liste.style.setProperty('--ay', '0.5'); gonder({ olay: 'isaret', etiket: 'ay-0.5' }); await bekle(2500);
    liste.style.setProperty('--ay', '0.16'); await bekle(1500);
    clearInterval(dur); gonder({ olay: 'isaret', etiket: 'asama-bitti', asama });
    localStorage.setItem('sim-asama', 'hizli'); location.hash = '#/'; location.reload();
  } else {
    for (let i = 1; i <= 6; i++) { gonder({ olay: 'isaret', etiket: 'kaydir', i }); gec(i); await bekle(1100); }
    await bekle(4000);
    clearInterval(dur); gonder({ olay: 'isaret', etiket: 'asama-bitti', asama }); gonder({ olay: 'bitti' });
  }
})();
