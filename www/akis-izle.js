// Akış ölçümü: her video geçişi için uygulama kendi ölçer, GEÇTİ/KALDI kararını verir ve sunucuya yollar (Kağan 2026-11-03: dosya/ekran görüntüsü atmadan sorunun çözülüp çözülmediği bilinsin).
// Kişisel veri yok: rastgele cihaz kodu, kod sürümü, video kimliği, ms değerleri, karar. Ortak saat = epoch ms (JS Date.now, Swift Date().timeIntervalSince1970).
import { SITE, PAKET } from './ortam.js';

export const KOD = 'v119';
const cihaz = (() => {
  try { let c = localStorage.getItem('voca-izle-cihaz'); if (!c) { c = Math.random().toString(36).slice(2, 10); localStorage.setItem('voca-izle-cihaz', c); } return c; } catch { return 'x' + Math.random().toString(36).slice(2, 8); }
})();
const kuyruk = [];
window.__izleKayit = kuyruk.slice();   // tarayıcıda (uygulama dışı) gönderim yok; denemede buradan okunur
let zamanlayici = 0;

// Kararlar (eşikler Ortak'la Video-Mimari-Plani §6'ya göre): her biri true = GEÇTİ, false = KALDI, null = ölçülemedi
export function karar(k) {
  const hareket = k.hareketEp && k.oynatEp ? k.hareketEp - k.oynatEp : null;
  const donuk = k.hareketEp && k.kapakEp ? k.hareketEp - k.kapakEp : null;
  const a = hareket === null ? null : hareket <= 150;
  const b = donuk === null ? null : donuk <= 40;
  const c = k.titreme === 0;
  const d = k.oynaYanlis === 0;
  const parca = k.tcEp && k.oynatEp ? { kopru: k.tcEp - k.oynatEp, calma: k.tpEp ? k.tpEp - k.tcEp : null, ilerle: k.tpEp && k.hareketEp ? k.hareketEp - k.tpEp : null } : null;   // oynat→playImmediately, playImmediately→playing durumu, playing→ilk hareket
  const sicrama = k.kapakT == null ? null : k.kapakT <= 0.15;   // kapak kalktığında video kaç sn ilerlemişti (ileri sıçrama)
  const kalan = [];
  if (a === false) kalan.push('hareket' + hareket);
  if (b === false) kalan.push('donuk' + donuk);
  if (sicrama === false) kalan.push('sicrama' + k.kapakT);
  if (k.ct != null && k.ct > 0.15) kalan.push('ilkkareEski' + k.ct);   // ilk kare bildirilirken oynatıcı başta değildi (seek bitmeden)
  if (!c) kalan.push('titreme' + k.titreme);
  if (!d) kalan.push('oyna' + k.oynaYanlis);
  return { hareket, donuk, parca, a, b, c, d, gecti: kalan.length === 0 && a !== null, sebep: kalan.join(',') };
}

export function izleKaydet(k) {
  const kr = karar(k);
  kuyruk.push({ ...k, ...kr });
  window.__izleKayit = kuyruk.slice(-50);
  clearTimeout(zamanlayici); zamanlayici = setTimeout(gonder, 3000);
}

async function gonder() {
  if (!PAKET || !kuyruk.length) return;
  const parti = kuyruk.splice(0, 20);
  try {
    const H = window.Capacitor?.Plugins?.CapacitorHttp;
    if (!H) throw new Error('yok');
    const r = await H.post({ url: SITE + '/api/izle', headers: { 'Content-Type': 'application/json', 'X-Voca-App': '1', 'X-Izle': 'voca-izle-9f3kq2' }, data: { cihaz, kod: KOD, kayitlar: parti } });
    if (r.status < 200 || r.status >= 300) throw new Error('http ' + r.status);
  } catch { kuyruk.unshift(...parti); if (kuyruk.length > 200) kuyruk.splice(0, kuyruk.length - 200); }
  if (kuyruk.length) { clearTimeout(zamanlayici); zamanlayici = setTimeout(gonder, 15000); }
}
export const izleGonder = () => gonder();
