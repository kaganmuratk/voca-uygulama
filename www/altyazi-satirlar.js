// YouTube altyazı olayları → kelime zamanlı satırlar. src/altyazi.js (sunucu) ile aynı mantık; uygulamada (PAKET) telefon kendi alır.
// olaylar → satırlar [{bas, son, k: [[kelime, t], ...]}]
export function satirlar({ otomatik, olaylar }) {
  const ham = [];
  for (const e of olaylar) {
    if (!e.segs) continue;
    const kel = [];
    for (const s of e.segs) for (const w of (s.utf8 || '').replace(/\n/g, ' ').split(/\s+/).filter(Boolean)) kel.push([w, (e.tStartMs + (s.tOffsetMs || 0)) / 1000]);
    if (!kel.length) continue;
    const bas = e.tStartMs / 1000, son = (e.tStartMs + (e.dDurationMs || 3000)) / 1000;
    if (!otomatik) {
      // insan yazımı: satırın kelimeleri satır süresine harf uzunluğuyla yayılır (kelime zamanı yok)
      const top = kel.reduce((a, [w]) => a + w.length + 1, 0) || 1; let acc = 0;
      for (const x of kel) { x[1] = bas + (son - bas) * 0.9 * (acc / top); acc += x[0].length + 1; }
    }
    ham.push({ bas, son, k: kel });
  }
  let out = ham;
  if (otomatik) {
    // YouTube otomatik satırları kendi bölüyor (duraklamada son kelime sonraki satıra düşüyordu). Kelimelerden yeniden kur:
    // 1,2 sn'den uzun boşluk (YouTube parça başı kelimeden sonrakini hep +1 sn yazıyor) ya da 7 kelime / 40 harf → yeni satır.
    const kel = ham.flatMap((s) => s.k); out = []; let cur = [];
    const kapat = () => { if (cur.length) out.push({ bas: cur[0][1], k: cur }); cur = []; };
    kel.forEach((x, i) => {
      const uz = cur.reduce((a, [w]) => a + w.length + 1, 0) + x[0].length;
      if (cur.length && (x[1] - kel[i - 1][1] > 1.2 || cur.length >= 7 || uz > 40)) kapat();
      cur.push(x);
    });
    kapat();
    out.forEach((s, i) => { const sonK = s.k[s.k.length - 1][1]; s.son = i + 1 < out.length ? Math.min(out[i + 1].bas, sonK + 1.5) : sonK + 1.5; });
  } else {
    for (let i = 0; i + 1 < out.length; i++) out[i].son = Math.min(out[i].son, out[i + 1].bas);
  }
  return out.map((s) => ({ bas: +s.bas.toFixed(2), son: +s.son.toFixed(2), k: s.k.map(([w, t]) => [w, +t.toFixed(2)]) }));
}

