// Kalıcı video önbelleği (IndexedDB): indirilen akış videoları uygulama kapanınca silinmez; tavan aşılınca en eski kullanılan silinir.
// Uygulama boyutuna girmez (cihazdaki uygulama verisi). Tavan: 150 MB. Hesap > "Önbelleği temizle".
const AD = 'voca-video', TAVAN = 150 * 1024 * 1024;
const ac = () => new Promise((ok, no) => {
  const r = indexedDB.open(AD, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('v', { keyPath: 'id' });
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const iste = (q) => new Promise((ok) => { q.onsuccess = () => ok(q.result ?? null); q.onerror = () => ok(null); });
export async function depodanOku(id) {   // → ArrayBuffer | null (kullanım zamanını günceller)
  try {
    const d = await ac(), s = d.transaction('v', 'readwrite').objectStore('v');
    const k = await iste(s.get(id)); if (!k) return null;
    s.put({ ...k, t: Date.now() });
    return k.buf;
  } catch { return null; }
}
export async function depoyaYaz(id, buf) {
  try {
    const d = await ac();
    await new Promise((ok) => { const t = d.transaction('v', 'readwrite'); t.objectStore('v').put({ id, buf, boyut: buf.byteLength, t: Date.now() }); t.oncomplete = () => ok(); t.onerror = () => ok(); t.onabort = () => ok(); });
    await temizle(d);
  } catch { /* depolama kapalı ya da dolu: video yine de oynar, yalnız kalıcı olmaz */ }
}
async function tumu(d) {
  return await new Promise((ok) => {
    const l = [], q = d.transaction('v').objectStore('v').openCursor();
    q.onsuccess = () => { const c = q.result; if (c) { l.push({ id: c.value.id, boyut: c.value.boyut || 0, t: c.value.t || 0 }); c.continue(); } else ok(l); };
    q.onerror = () => ok(l);
  });
}
async function temizle(d) {   // tavanı aşarsa en eski kullanılandan sil
  const l = await tumu(d); let top = l.reduce((a, x) => a + x.boyut, 0);
  if (top <= TAVAN) return;
  l.sort((a, b) => a.t - b.t);
  for (const x of l) {
    if (top <= TAVAN) break;
    await new Promise((ok) => { const t = d.transaction('v', 'readwrite'); t.objectStore('v').delete(x.id); t.oncomplete = () => ok(); t.onerror = () => ok(); });
    top -= x.boyut;
  }
}
export async function depoBoyutu() { try { const d = await ac(); return (await tumu(d)).reduce((a, x) => a + x.boyut, 0); } catch { return 0; } }
export async function depoyuBosalt() {
  try { const d = await ac(); await new Promise((ok) => { const t = d.transaction('v', 'readwrite'); t.objectStore('v').clear(); t.oncomplete = () => ok(); t.onerror = () => ok(); }); } catch { /* yok */ }
}
