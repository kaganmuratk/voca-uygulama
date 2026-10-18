// Çalışma ortamı: sitede mi, uygulamada (arayüz paketin içinden yüklenmiş) mı?
// Uygulamada arayüz capacitor://localhost (iOS) ya da https://localhost (Android) kökeninden gelir; sunucuya yerel HTTP ile gidilir (CORS yok),
// videolar kendi sitemizdeki köprü sayfasıyla (YouTube Hata 153 olmasın) oynar.
export const SITE = 'https://voca.revelalabs.com.tr';
export const PAKET = !!window.Capacitor && location.origin !== SITE;

const ANAHTAR = 'voca-jeton';
export const jetonOku = () => { try { return localStorage.getItem(ANAHTAR) || ''; } catch { return ''; } };
export const jetonYaz = (j) => { try { j ? localStorage.setItem(ANAHTAR, j) : localStorage.removeItem(ANAHTAR); } catch { /* depolama kapalı */ } };

// Sitede göreli adres, uygulamada mutlak adres (ses dosyaları gibi sunucudaki dosyalar için)
export const sunucuAdresi = (yol) => (PAKET ? SITE + yol : yol);

// /api isteği: uygulamada Capacitor yerel HTTP + Bearer jeton, sitede çerezli fetch. Dönüş: { durum, veri }
export async function apiIstek(yol, { method = 'GET', govde } = {}) {
  const basliklar = govde ? { 'Content-Type': 'application/json' } : {};
  if (!PAKET) {
    const r = await fetch('/api' + yol, { method, headers: basliklar, body: govde ? JSON.stringify(govde) : undefined, credentials: 'same-origin' });
    return { durum: r.status, veri: await r.json().catch(() => ({})) };
  }
  const jeton = jetonOku();
  if (jeton) basliklar.Authorization = 'Bearer ' + jeton;
  basliklar['X-Voca-App'] = '1';
  const H = window.Capacitor?.Plugins?.CapacitorHttp;
  if (!H) throw new Error('Yerel ağ bileşeni yok.');
  const r = await H.request({ url: SITE + '/api' + yol, method, headers: basliklar, data: govde, responseType: 'json' });
  const veri = typeof r.data === 'string' ? (() => { try { return JSON.parse(r.data); } catch { return {}; } })() : (r.data || {});
  return { durum: r.status, veri };
}

// Sunucudaki herkese açık JSON dosyası (akış listesi, altyazı vb.): uygulamada Capacitor yerel HTTP (CORS yok), sitede fetch. Başarısızsa null.
export async function jsonAl(yol) {
  try {
    if (!PAKET) { const r = await fetch(yol, { cache: 'no-cache' }); return r.ok ? await r.json() : null; }
    const H = window.Capacitor?.Plugins?.CapacitorHttp; if (!H) return null;
    const r = await H.get({ url: SITE + yol, headers: { 'X-Voca-App': '1' }, responseType: 'json' });
    if (r.status < 200 || r.status >= 300) return null;
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  } catch { return null; }
}
