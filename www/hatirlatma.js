// Günlük yerel hatırlatma (yalnız uygulama; sunucu/push yok): @capacitor/local-notifications. iOS en çok 64 bekleyen bildirim tutar:
// önümüzdeki 14 günün her biri için bir tane planlanır, uygulama her açılışta yeniden planlar (hatırlatma kullanıcı açık tuttukça sürer).
const ANAHTAR = 'voca-hatirlatma';
const METINLER = ['Bugünkü kelimelerin seni bekliyor.', 'Birkaç dakika pratik, kelimeleri kalıcı yapar.', 'Bugün hangi kelimeyi öğreneceksin?', 'Kısa bir pratik zamanı.', 'Video akışında yeni kelimeler var.'];
export const ayarOku = () => { try { const a = JSON.parse(localStorage.getItem(ANAHTAR) || 'null'); return a && typeof a === 'object' ? { acik: !!a.acik, saat: +a.saat || 19, dakika: +a.dakika || 0 } : { acik: false, saat: 19, dakika: 0 }; } catch { return { acik: false, saat: 19, dakika: 0 }; } };
export const ayarYaz = (a) => { try { localStorage.setItem(ANAHTAR, JSON.stringify(a)); } catch { /* depolama kapalı */ } };
const eklenti = () => window.Capacitor?.Plugins?.LocalNotifications || null;
export const hatirlatmaVar = () => !!eklenti();
const GUN = 14, ID0 = 1000;

// Planlanacak anlar: bugünden başlayarak GUN gün, her gün saat:dakika; geçmiş an atlanır (saat: yerel).
export function anlar(simdi, saat, dakika) {
  const sonuc = [];
  for (let g = 0; g < GUN + 1 && sonuc.length < GUN; g++) {
    const t = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() + g, saat, dakika, 0, 0);
    if (t.getTime() > simdi.getTime() + 30000) sonuc.push(t);
  }
  return sonuc;
}

export async function hatirlatmaUygula(ayar = ayarOku(), simdi = new Date()) {
  const LN = eklenti(); if (!LN) return { tamam: false, mesaj: 'Bu cihazda bildirim desteklenmiyor.' };
  try { await LN.cancel({ notifications: Array.from({ length: GUN + 1 }, (_, i) => ({ id: ID0 + i })) }); } catch { /* ilk kez: iptal edilecek yok */ }
  if (!ayar.acik) return { tamam: true, mesaj: 'Hatırlatma kapalı.' };
  let izin = await LN.checkPermissions().catch(() => ({ display: 'prompt' }));
  if (izin.display !== 'granted') izin = await LN.requestPermissions();
  if (izin.display !== 'granted') return { tamam: false, mesaj: 'Bildirim izni verilmedi. Ayarlar > Voca > Bildirimler\'den açabilirsin.' };
  const liste = anlar(simdi, ayar.saat, ayar.dakika).map((t, i) => ({ id: ID0 + i, title: 'Voca', body: METINLER[(t.getDate() + i) % METINLER.length], schedule: { at: t, allowWhileIdle: true } }));
  await LN.schedule({ notifications: liste });
  return { tamam: true, mesaj: `Hatırlatma ayarlandı (her gün ${String(ayar.saat).padStart(2, '0')}:${String(ayar.dakika).padStart(2, '0')}).` };
}
