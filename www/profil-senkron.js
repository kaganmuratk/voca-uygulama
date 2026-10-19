// Profil senkronu (2026-10-19): ilgi alanı, akış sinyalleri, kaydedilen videolar telefon ↔ hesap. Sunucu: /api/profil (D1, kullanıcı başına tek JSON).
// Çevrimdışıyken değişiklik yerelde kalır ("kirli" bayrağı); bağlantı gelince (online olayı / sonraki açılış) otomatik gönderilir. Birleştirme saf fonksiyon (testli).
import { yerelOku, yerelYaz } from './yerel.js';

const KIRLI = 'profil-kirli';
const topla = (a, b) => Array.from(new Set([...(a || []), ...(b || [])]));
// Sinyal ağırlığı: aynı etikette büyük mutlak değer kazanır; görülme sayısı büyük olan; beğenilenler birleşim (en fazla 25)
export function birlestir(yerel, uzak) {
  yerel = yerel || {}; uzak = uzak || {};
  const w = { ...(uzak.w || {}) };
  for (const [k, v] of Object.entries(yerel.w || {})) w[k] = Math.abs(v) >= Math.abs(w[k] ?? 0) ? v : w[k];
  const gor = { ...(uzak.gor || {}) };
  for (const [k, v] of Object.entries(yerel.gor || {})) gor[k] = Math.max(v, gor[k] || 0);
  const iyi = topla(uzak.iyi, yerel.iyi).slice(-25);
  const kayit = []; const goruldu = new Set();
  for (const v of [...(yerel.kayit || []), ...(uzak.kayit || [])]) if (v && v.id && !goruldu.has(v.id)) { goruldu.add(v.id); kayit.push(v); }
  return { w, gor, iyi, gizli: topla(uzak.gizli, yerel.gizli), kayit, ilgiTamam: !!(yerel.ilgiTamam || uzak.ilgiTamam) };
}
const ayni = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let calisiyor = false, zaman = null, kimlik = null;
export function profilBaslat(istek, ad) { kimlik = { istek, ad }; if (typeof window !== 'undefined') window.addEventListener('online', () => profilSenkron()); return profilSenkron(); }
export function profilPlanla() { if (!kimlik) return; try { localStorage.setItem(KIRLI, '1'); } catch { /* yok */ } clearTimeout(zaman); zaman = setTimeout(profilSenkron, 4000); }   // değişiklik: 4 sn sonra gönder (art arda olayları toplar)
export async function profilSenkron() {
  if (!kimlik || calisiyor) return { atlandi: true };
  calisiyor = true;
  try {
    const { istek, ad } = kimlik;
    const uzak = await istek('/profil', { sessiz: true });
    const yerel = { ...((await yerelOku('akis-sinyal')) || {}), kayit: (await yerelOku('kayit:' + ad)) || [], ilgiTamam: (() => { try { return !!localStorage.getItem('voca-ilgi-tamam'); } catch { return false; } })() };
    const son = birlestir(yerel, uzak.veri);
    // yerele yaz
    await yerelYaz('akis-sinyal', { w: son.w, gor: son.gor, iyi: son.iyi, gizli: son.gizli, an: yerel.an || Date.now() });
    await yerelYaz('kayit:' + ad, son.kayit);
    if (son.ilgiTamam) { try { localStorage.setItem('voca-ilgi-tamam', '1'); } catch { /* yok */ } }
    const kirli = (() => { try { return !!localStorage.getItem(KIRLI); } catch { return false; } })();
    if (kirli || !ayni(son, uzak.veri)) { await istek('/profil', { method: 'PUT', govde: { veri: son }, sessiz: true }); }
    try { localStorage.removeItem(KIRLI); } catch { /* yok */ }
    return { tamam: true, kayit: son.kayit.length };
  } catch (x) { return { tamam: false, cevrimdisi: !!x.cevrimdisi }; }   // çevrimdışı: kirli bayrağı kalır, sonra yeniden denenir
  finally { calisiyor = false; }
}
