// iOS Simulator (CI) otomatik akış testi: Voca Deney içinde #/video açılır, sırayla kaydırılır, durum yerel günlük sunucusuna gönderilir.
// İki kip arka arkaya: 'ikili' (iki oynatıcı, hızlı yol) ve 'tek' (voca-tek=1). Sonuçlar + ekran videosu CI çıktısında.
const Http = window.Capacitor?.Plugins?.CapacitorHttp;
const gonder = (o) => { try { Http.post({ url: 'http://127.0.0.1:8099/log', headers: { 'Content-Type': 'application/json' }, data: { ts: Date.now(), ...o } }); } catch (e) { /* günlük yok */ } };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const asama = localStorage.getItem('sim-asama') || 'ikili';
gonder({ olay: 'basla', asama, ua: navigator.userAgent, w: innerWidth, h: innerHeight });
addEventListener('error', (e) => gonder({ olay: 'js-hata', mesaj: String(e.message), kaynak: e.filename + ':' + e.lineno }));
addEventListener('unhandledrejection', (e) => gonder({ olay: 'js-red', mesaj: String(e.reason?.message || e.reason) }));
const snap = (etiket) => {
  const kat = [...document.querySelectorAll('.akis-katman')].map((x) => { const r = x.getBoundingClientRect(), cs = getComputedStyle(x); return { gor: x.classList.contains('gorunur'), op: cs.opacity, y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  const kart = document.querySelector('.akis-kart.oynuyor, .akis-kart.yukleniyor, .akis-kart.durdu');
  const dbg = [...document.querySelectorAll('.akis-dbg')].map((x) => x.textContent).find(Boolean) || '';
  const kapak = kart?.querySelector('.akis-kapak'); const satir = kart?.querySelector('.akis-satir')?.textContent?.trim().slice(0, 50) || '';
  const hata = kart?.querySelector('.akis-durum')?.textContent || '';
  return { olay: 'snap', asama, etiket, kart: kart ? kart.className.replace('akis-kart', '').trim() : '-', id: kart?.dataset.id, kat, kapakOp: kapak ? getComputedStyle(kapak).opacity : null, dbg, satir, hata };
};
(async () => {
  await bekle(5000);
  location.hash = '#/video';
  for (let k = 0; k < 100 && !document.querySelector('.akis-kart'); k++) await bekle(200);
  const liste = document.querySelector('.akis-liste'); if (!liste) { gonder({ olay: 'hata', mesaj: 'akis-liste yok' }); return; }
  const dur = setInterval(() => gonder(snap('ara')), 300);
  await bekle(9000);   // ilk video
  gonder({ olay: 'isaret', etiket: 'ilk-video-bitti' });
  for (let i = 1; i <= 10; i++) {
    const kartlar = document.querySelectorAll('.akis-kart'); if (!kartlar[i]) break;
    gonder({ olay: 'isaret', etiket: 'kaydir', i });
    liste.scrollTo({ top: kartlar[i].offsetTop, behavior: 'smooth' });
    await bekle(5000);
  }
  clearInterval(dur);
  gonder({ olay: 'isaret', etiket: 'asama-bitti', asama });
  if (asama === 'ikili') { localStorage.setItem('sim-asama', 'tek'); localStorage.setItem('voca-tek', '1'); location.hash = '#/'; location.reload(); }
  else gonder({ olay: 'bitti' });
})();
