// Voca service worker: arayüz kabuğu ve ses dosyaları önbellekte; API her zaman ağdan.
const KABUK = 'voca-v47';
const DOSYALAR = ['/', '/index.html', '/stil.css', '/uyg.js', '/klip.js', '/video.js', '/bicim.js', '/kolay.json', '/ikon.svg', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(KABUK).then((c) => c.addAll(DOSYALAR))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== KABUK && x !== 'voca-ses-2').map((x) => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || u.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  if (u.pathname.startsWith('/ses/')) {
    e.respondWith(caches.open('voca-ses-2').then(async (c) => (await c.match(e.request)) || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // kabuk: önce ağ, olmazsa önbellek (güncellemeler hemen gelsin)
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) caches.open(KABUK).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});
