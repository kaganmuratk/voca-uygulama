// Kişisel keşfet (v1, cihazda, model yok — basit puanlar; plan: Voca-Akisi-Plani §9.3/9.6). Her videonun etiketlerine (tür, alt tür, hashtag, kanal) kişisel ağırlık yazılır;
// akış sırası açılışta bu ağırlıklar + listendeki kelimelerin videoda geçmesi + görülmemişlik ile kurulur. Aynı kanal art arda yok, aynı türden en çok 2 art arda, ~%20 keşif.
import { yerelOku, yerelYaz } from './yerel.js';

const ANAHTAR = 'akis-sinyal';
const HAFTA = 7 * 24 * 3600 * 1000;
export const PUAN = { tam: 2, tekrar: 3, kaydet: 5, kaydiSil: -5, kelime: 1, hizli: -2 };   // başlangıç değerleri (denemeyle ayarlanır)
let D = null, yazZ = null;   // { w: {etiket: puan}, gor: {id: sayı}, an: son eskitme zamanı }

export const etiketler = (v) => [v.tur && 't:' + v.tur, v.alt && 'a:' + v.alt, v.etiket && 'e:' + v.etiket, v.kanal && v.kanal !== 'Kaynak belirtilmemiş' && 'k:' + v.kanal].filter(Boolean);

export async function sinyalYukle() {
  if (D) return D;
  D = (await yerelOku(ANAHTAR)) || { w: {}, gor: {}, an: Date.now() };
  const hf = Math.floor((Date.now() - (D.an || Date.now())) / HAFTA);
  if (hf > 0) { for (const k of Object.keys(D.w)) { D.w[k] *= Math.pow(0.8, hf); if (Math.abs(D.w[k]) < 0.05) delete D.w[k]; } D.an = Date.now(); }   // haftada ×0,8 eskir
  return D;
}
const kaydet = () => { clearTimeout(yazZ); yazZ = setTimeout(() => { if (D) yerelYaz(ANAHTAR, D); }, 800); };
export async function olay(v, tur, katsayi = 1) {   // tur: PUAN anahtarı
  const d = await sinyalYukle(); const p = (PUAN[tur] || 0) * katsayi;
  for (const e of etiketler(v)) d.w[e] = Math.max(-10, Math.min(20, (d.w[e] || 0) + (e.startsWith('k:') ? p / 2 : p)));
  kaydet();
}
export async function goruldu(v) { const d = await sinyalYukle(); d.gor[v.id] = (d.gor[v.id] || 0) + 1; kaydet(); }

// listendeki kelime formları: kelime listesi ('liste:<ad>') yerel kopyadan
export async function listeKelimeleri() {
  try {
    const b = await yerelOku('ben'); if (!b || !b.ad) return new Set();
    const l = await yerelOku('liste:' + b.ad); return new Set(((l && l.kelimeler) || []).map((k) => String(k.kelime).toLowerCase()));
  } catch { return new Set(); }
}
const adaylar = (w) => [w, w.replace(/ies$/, 'y'), w.replace(/ied$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ly$/, '')];
export function eslesenler(v, set) {   // videodaki (sz) kelimelerden listede olanlar
  if (!set || !set.size || !v.sz) return [];
  const o = []; for (const w of v.sz) { const k = adaylar(w).find((a) => a.length >= 3 && set.has(a)); if (k && !o.includes(k)) o.push(k); }
  return o;
}

export async function sirala(liste, { set } = {}) {
  const d = await sinyalYukle(); set = set || await listeKelimeleri();
  const puan = new Map(liste.map((v) => {
    let p = etiketler(v).reduce((a, e) => a + (d.w[e] || 0), 0);
    p += Math.min(3, eslesenler(v, set).length) * 2;            // listendeki kelime geçiyor
    p -= (d.gor[v.id] || 0) * 4;                                 // görülmüş videolar sona
    return [v.id, p + Math.random() * 1.5];
  }));
  const kalan = [...liste], sonuc = [];
  while (kalan.length) {
    const son = sonuc[sonuc.length - 1], onceki = sonuc[sonuc.length - 2];
    const uygun = (v) => (!son || !v.kanal || v.kanal === 'Kaynak belirtilmemiş' || v.kanal !== son.kanal) && !(son && onceki && v.tur === son.tur && v.tur === onceki.tur);
    let havuz = kalan.filter(uygun); if (!havuz.length) havuz = kalan;
    let secim;
    if (sonuc.length % 5 === 4) {   // keşif: ağırlığı en düşük / hiç denenmemiş türden
      const turP = (v) => d.w['t:' + v.tur] || 0;
      const kesif = [...havuz].sort((a, b) => turP(a) - turP(b) || Math.random() - 0.5).slice(0, 3);
      secim = kesif[Math.floor(Math.random() * kesif.length)];
    } else secim = havuz.reduce((a, b) => (puan.get(b.id) > puan.get(a.id) ? b : a));
    sonuc.push(secim); kalan.splice(kalan.indexOf(secim), 1);
  }
  return sonuc;
}
