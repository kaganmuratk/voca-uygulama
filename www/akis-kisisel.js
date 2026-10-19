// Kişisel keşfet (v1, cihazda, model yok — basit puanlar; plan: Voca-Akisi-Plani §9.3/9.6). Her videonun etiketlerine (tür, alt tür, hashtag, kanal) kişisel ağırlık yazılır;
// akış sırası açılışta bu ağırlıklar + listendeki kelimelerin videoda geçmesi + görülmemişlik ile kurulur. Aynı kanal art arda yok, aynı türden en çok 2 art arda, ~%20 keşif.
import { yerelOku, yerelYaz } from './yerel.js';
import { profilPlanla } from './profil-senkron.js';

const ANAHTAR = 'akis-sinyal';
const HAFTA = 7 * 24 * 3600 * 1000;
export const PUAN = { tam: 2, tekrar: 3, kaydet: 5, kaydiSil: -5, kelime: 1, hizli: -2, ilgisiz: -5 };   // başlangıç değerleri (denemeyle ayarlanır)
let D = null, yazZ = null;   // { w: {etiket: puan}, gor: {id: sayı}, an: son eskitme zamanı }

export const etiketler = (v) => [v.ilgi && 'i:' + v.ilgi, v.zor && 'z:' + v.zor, v.tur && 't:' + v.tur, v.alt && 'a:' + v.alt, v.etiket && 'e:' + v.etiket, v.kanal && v.kanal !== 'Kaynak belirtilmemiş' && 'k:' + v.kanal, ...(v.konu || []).slice(0, 3).map((k) => 'o:' + k)].filter(Boolean);   // genel ilgi + zorluk + tür + alt tür + hashtag + kanal + konu kelimeleri

export async function sinyalYukle() {
  if (D) return D;
  D = (await yerelOku(ANAHTAR)) || { w: {}, gor: {}, iyi: [], gizli: [], an: Date.now() }; if (!D.iyi) D.iyi = []; if (!D.gizli) D.gizli = [];
  const hf = Math.floor((Date.now() - (D.an || Date.now())) / HAFTA);
  if (hf > 0) { for (const k of Object.keys(D.w)) { D.w[k] *= Math.pow(0.8, hf); if (Math.abs(D.w[k]) < 0.05) delete D.w[k]; } D.an = Date.now(); }   // haftada ×0,8 eskir
  return D;
}
const kaydet = () => { clearTimeout(yazZ); yazZ = setTimeout(() => { if (D) { yerelYaz(ANAHTAR, D); profilPlanla(); } }, 800); };
export const sinyalSifirla = () => { D = null; };   // senkron sonrası yerel kaydı yeniden oku
export async function olay(v, tur, katsayi = 1) {   // tur: PUAN anahtarı
  const d = await sinyalYukle(); const p = (PUAN[tur] || 0) * katsayi;
  if (p > 0 && ['kaydet', 'tam', 'tekrar'].includes(tur) && !d.iyi.includes(v.id)) { d.iyi.push(v.id); if (d.iyi.length > 25) d.iyi.shift(); }   // beğenilen videolar: komşuları (benzer) öne alınır
  for (const e of etiketler(v)) {
    if (tur === 'ilgisiz' && e.startsWith('z:')) continue;   // "ilgilenmiyorum" konuyla ilgilidir, zorlukla değil
    d.w[e] = Math.max(-10, Math.min(20, (d.w[e] || 0) + (e.startsWith('k:') || e.startsWith('o:') || (tur === 'ilgisiz' && e.startsWith('i:')) ? p / 2 : p)));
  }
  kaydet();
}
export async function gizle(v) { const d = await sinyalYukle(); if (!d.gizli.includes(v.id)) d.gizli.push(v.id); kaydet(); }   // 'ilgilenmiyorum' dediklerin akıştan çıkar
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
  { const kalan0 = liste.filter((v) => !d.gizli.includes(v.id)); if (kalan0.length >= 5) liste = kalan0; }   // gizlenenler çıkar (çok az kalırsa akış boşalmasın)
  const iyiKomsu = new Set(); for (const v of liste) if (d.iyi.includes(v.id)) for (const b of v.benzer || []) iyiKomsu.add(b);
  const puan = new Map(liste.map((v) => {
    let p = etiketler(v).reduce((a, e) => a + (d.w[e] || 0), 0);
    p += Math.min(3, eslesenler(v, set).length) * 2;            // listendeki kelime geçiyor
    p -= (d.gor[v.id] || 0) * 4;                                 // görülmüş videolar sona
    if (iyiKomsu.has(v.id)) p += 3;                              // beğendiğin videoların 'benzer' bağlantıları
    return [v.id, p + Math.random() * 1.5];
  }));
  const kalan = [...liste], sonuc = [];
  while (kalan.length) {
    const son = sonuc[sonuc.length - 1], onceki = sonuc[sonuc.length - 2];
    const son4 = sonuc.slice(-4);   // aynı genel ilgi son 4 videoda en çok 2 kez: akış tek konuya kilitlenmez
    const uygun = (v) => (!son || !v.kanal || v.kanal === 'Kaynak belirtilmemiş' || v.kanal !== son.kanal) && !(son && onceki && v.tur === son.tur && v.tur === onceki.tur) && !(v.ilgi && son4.filter((x) => x.ilgi === v.ilgi).length >= 2);
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

// ——— ilk açılışta genel ilgi alanları ("futbol/basketbol" gibi dar değil; havuzdaki genel gruplar) ———
const ILGI_KEY = 'voca-ilgi-tamam';
export const ilgiSorulduMu = () => { try { return !!localStorage.getItem(ILGI_KEY); } catch { return true; } };
export function ilgiSecenekleri(liste) { const n = new Map(); for (const v of liste) if (v.ilgi) n.set(v.ilgi, (n.get(v.ilgi) || 0) + 1); return [...n.keys()]; }
export async function ilgiKaydet(secilen, seviye) {
  const d = await sinyalYukle();
  for (const i of secilen) d.w['i:' + i] = (d.w['i:' + i] || 0) + 4;
  const sv = { yeni: { kolay: 3, zor: -2 }, orta: { orta: 2, kolay: 1 }, ileri: { zor: 3, kolay: -1 } }[seviye] || {};
  for (const [z, p] of Object.entries(sv)) d.w['z:' + z] = (d.w['z:' + z] || 0) + p;
  kaydet(); try { localStorage.setItem(ILGI_KEY, '1'); } catch { /* depolama kapalı */ }
}
export function ilgiSor(kap, secenekler) {   // kap'a tam ekran kart çizer; seçim bitince söz çözülür
  return new Promise((bitti) => {
    const sec = new Set(); let sev = 'orta';
    kap.innerHTML = `<div class="ilgi-kap"><div class="ilgi-ic">
      <h2>Nelerden hoşlanırsın?</h2><p>Akışı sana göre kuralım. İstediğin kadar seç, sonradan kullandıkça kendiliğinden ayarlanır.</p>
      <div class="ilgi-chip">${secenekler.map((s) => `<button type="button" data-i="${s}">${s}</button>`).join('')}</div>
      <h3>İngilizcen nasıl?</h3>
      <div class="ilgi-sev"><button type="button" data-s="yeni">Yeni başlıyorum</button><button type="button" data-s="orta" class="acik">Orta</button><button type="button" data-s="ileri">İleri</button></div>
      <div class="ilgi-alt"><button type="button" class="btn vurgu buyuk" id="ilgiTamam">Akışı başlat</button><button type="button" class="ilgi-atla" id="ilgiAtla">Şimdilik geç</button></div></div></div>`;
    kap.querySelectorAll('.ilgi-chip button').forEach((b) => { b.onclick = () => { b.classList.toggle('acik'); sec.has(b.dataset.i) ? sec.delete(b.dataset.i) : sec.add(b.dataset.i); }; });
    kap.querySelectorAll('.ilgi-sev button').forEach((b) => { b.onclick = () => { sev = b.dataset.s; kap.querySelectorAll('.ilgi-sev button').forEach((x) => x.classList.toggle('acik', x === b)); }; });
    kap.querySelector('#ilgiTamam').onclick = async () => { await ilgiKaydet([...sec], sev); bitti(true); };
    kap.querySelector('#ilgiAtla').onclick = () => { try { localStorage.setItem(ILGI_KEY, '1'); } catch { /* yok */ } bitti(false); };
  });
}
