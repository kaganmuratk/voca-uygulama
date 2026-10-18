// Uygulama içi küçük yerel önbellek (IndexedDB anahtar-değer): sözlük güncellemesi, son kelime listesi, son hesap bilgisi (çevrimdışı açılış için).
const AD = 'voca-yerel';
const ac = () => new Promise((ok, no) => { const r = indexedDB.open(AD, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
export async function yerelOku(k) {
  try { const d = await ac(); return await new Promise((ok) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result ?? null); q.onerror = () => ok(null); }); } catch { return null; }
}
export async function yerelYaz(k, v) {
  try { const d = await ac(); await new Promise((ok) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); }); } catch { /* depolama kapalı: önbellek isteğe bağlı */ }
}
