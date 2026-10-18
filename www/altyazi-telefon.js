// Uygulama içinde YouTube altyazısı: sunucu (Cloudflare) bot doğrulamasına takılıyor; telefon kendi bağlantısıyla, Capacitor yerel HTTP ile alır.
// Resmî olmayan yol (YouTube Android istemcisinin istekleri; belgesiz, bozulabilir). Kağan sorumluluğu üstlendi (2026-10-18); özellik kapatılabilir:
// ALTYAZI_TELEFON = false yapılırsa uygulama da sunucuya döner. Aynı video 6 saat bellekte tutulur (gereksiz istek gitmesin).
import { satirlar } from './altyazi-satirlar.js';

export const ALTYAZI_TELEFON = true;
const H = () => window.Capacitor?.Plugins?.CapacitorHttp;
const bellek = new Map();
const AND = 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip';

export async function altyaziTelefondan(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw new Error('Geçersiz video.');
  const eski = bellek.get(id);
  if (eski && Date.now() - eski.z < 6 * 3600e3) return eski.d;
  const http = H(); if (!http) throw new Error('Yerel ağ bileşeni yok.');
  const sayfa = await http.get({ url: `https://www.youtube.com/watch?v=${id}`, headers: { 'Accept-Language': 'en-US,en', 'User-Agent': 'Mozilla/5.0' }, responseType: 'text' });
  const anahtar = (String(sayfa.data).match(/"INNERTUBE_API_KEY":\s*"([A-Za-z0-9_-]+)"/) || [])[1];
  if (!anahtar) throw new Error('YouTube yanıt vermedi.');
  const p = await http.post({ url: `https://www.youtube.com/youtubei/v1/player?key=${anahtar}`, headers: { 'Content-Type': 'application/json', 'User-Agent': AND }, data: { context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38' } }, videoId: id }, responseType: 'json' });
  const d = typeof p.data === 'string' ? JSON.parse(p.data) : p.data;
  const izler = (d?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []).filter((t) => t.languageCode?.startsWith('en'));
  const iz = izler.find((t) => t.kind !== 'asr') || izler[0];
  if (!iz) { if (d?.playabilityStatus?.status === 'LOGIN_REQUIRED') throw new Error('YouTube bu videoyu telefondan da vermiyor.'); return { yok: true }; }
  const r = await http.get({ url: iz.baseUrl.replace(/&fmt=[^&]*/, '') + '&fmt=json3', headers: { 'User-Agent': AND }, responseType: 'json' });
  const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  const h = { otomatik: iz.kind === 'asr', olaylar: j.events || [] };
  const sonuc = { otomatik: h.otomatik, baslik: d?.videoDetails?.title || '', kanal: d?.videoDetails?.author || '', sure: +d?.videoDetails?.lengthSeconds || 0, satirlar: satirlar(h) };
  bellek.set(id, { z: Date.now(), d: sonuc });
  return sonuc;
}
