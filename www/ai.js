// Voca AI: tek sohbet bileşeni, iki yerde kullanılır — AI sekmesi (tam ekran) ve videoda alttan açılan panel (o videonun cümlesi bağlam).
// Sunucu: ai-sunucu/voca_ai (PC'de; adres + anahtar bir kez girilir, bu cihazda saklanır). Cevaplar "yapay zeka yanıtı"dır, sözlük kaydı değil.
const AYAR = 'voca-ai-ayar', SOHBET = 'voca-ai-sohbet', TAVAN = 60;
const oku = (k, v) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? v; } catch { return v; } };
const yaz = (k, d) => { try { localStorage.setItem(k, JSON.stringify(d)); } catch { /* depolama kapalı */ } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<i>$2</i>').replace(/\n/g, '<br>');
let BEKLEYEN = null;   // yanıt bekleyen istek (sekme değişse de yaşar)
const HAZIR = [['anlam', 'Ne demek?'], ['kullanim', 'Nasıl kullanılır?'], ['tr', 'Türkçesi'], ['ornek', 'Örnek ver']];

async function akisIstek(govde, parca) {   // /sor-akis: yanıt geldikçe parca(tamMetin) çağrılır
  const a = oku(AYAR, null); if (!a?.adres || !a?.anahtar) throw new Error('ayar');
  const r = await fetch(a.adres.replace(/\/+$/, '') + '/sor-akis', { method: 'POST', headers: { 'X-Anahtar': a.anahtar, 'Content-Type': 'application/json' }, body: JSON.stringify(govde) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.hata || 'sunucu ' + r.status); }
  let tam = '';
  if (r.body?.getReader) { const o = r.body.getReader(), dc = new TextDecoder(); for (;;) { const { done, value } = await o.read(); if (done) break; tam += dc.decode(value, { stream: true }); parca(tam); } }
  else { tam = await r.text(); parca(tam); }
  const h = tam.indexOf('[[HATA]]'); if (h >= 0) { if (h === 0 || !tam.slice(0, h).trim()) throw new Error(tam.slice(h + 8).trim() || 'hata'); tam = tam.slice(0, h); }
  return tam.trim();
}

async function istek(yol, govde, yontem = 'POST') {
  const a = oku(AYAR, null); if (!a?.adres || !a?.anahtar) throw new Error('ayar');
  const r = await fetch(a.adres.replace(/\/+$/, '') + yol, { method: yontem, headers: { 'X-Anahtar': a.anahtar, 'Content-Type': 'application/json' }, body: govde ? JSON.stringify(govde) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.hata || 'sunucu ' + r.status); return j;
}

// kap: sohbetin kurulacağı öğe. baglam: () => ({cumle, kelime, liste, zayif}) — o anki içerik. video: true ise hazır düğmeler görünür.
export function aiKur(kap, { baglam = () => ({}), video = false, listeKelimeleri = null } = {}) {
  kap.classList.add('ai-kap');
  const cizAyar = (hata = '') => {
    const a = oku(AYAR, {});
    kap.innerHTML = `<form class="ai-ayar"><p>Voca AI sunucusuna bağlan (bir kez).</p><input name="adres" type="url" placeholder="https://… sunucu adresi" value="${esc(a.adres || '')}" autocapitalize="none" required><input name="anahtar" type="password" placeholder="Anahtar" value="${esc(a.anahtar || '')}" required>${hata ? `<p class="ai-hata">${esc(hata)}</p>` : ''}<button class="btn vurgu" type="submit">Kaydet</button></form>`;
    kap.querySelector('form').onsubmit = (ev) => { ev.preventDefault(); const f = new FormData(ev.target); yaz(AYAR, { adres: String(f.get('adres')).trim(), anahtar: String(f.get('anahtar')).trim() }); cizSohbet(); };
  };
  const cizSohbet = () => {
    kap.innerHTML = `<div class="ai-ust"><b>AI</b><span class="ai-not"></span><button type="button" class="ai-hafiza-d">Hafıza</button><button type="button" class="ai-ayar-d" aria-label="Ayar">⚙</button></div>
      <div class="ai-mesajlar" role="log"></div>
      <form class="ai-giris"><input name="soru" placeholder="${video ? 'Bu video hakkında sor…' : 'İngilizce hakkında sor…'}" autocomplete="off" enterkeyhint="send"><button class="btn vurgu" type="submit">Gönder</button></form>`;
    const msj = kap.querySelector('.ai-mesajlar');
    const ekle = (r, m) => { const d = document.createElement('div'); d.className = 'ai-m ai-' + r; d.innerHTML = md(m); msj.appendChild(d); msj.scrollTop = msj.scrollHeight; return d; };
    oku(SOHBET, []).forEach((g) => ekle(g.r, g.m));
    if (!oku(SOHBET, []).length) ekle('s', video ? 'Bu videoyla ilgili bir şey sor.' : 'İngilizce hakkında bir şey sor.');
    if (BEKLEYEN) {   // başka sekmeye gidip dönüldü: cevap hâlâ yolda, gelince yeniden çizilir
      ekle('s', '…').classList.add('ai-bekle');
      BEKLEYEN.finally(() => { if (kap.isConnected && kap.querySelector('.ai-mesajlar') === msj) cizSohbet(); });
    }
    const gonder = async (soru, tur = '') => {
      if (BEKLEYEN) return;
      const ben = tur ? HAZIR.find((h) => h[0] === tur)[1] : soru;
      const onceki = oku(SOHBET, []).slice(-8);
      yaz(SOHBET, [...oku(SOHBET, []), { r: 'k', m: ben }].slice(-TAVAN));   // gönderilen mesaj hemen kaydolur: ekrandan çıkılsa da kaybolmaz
      ekle('k', ben);
      const d = ekle('s', '…'); d.classList.add('ai-bekle');
      let b = {}; try { b = { ...(await baglam()) }; if (listeKelimeleri) b.liste = [...(await listeKelimeleri())].slice(0, 20); } catch { /* bağlamsız */ }
      BEKLEYEN = (async () => {
        let m, hata = false;
        try { m = await akisIstek({ soru, tur, baglam: b, gecmis: onceki }, (t) => { if (d.isConnected) { d.classList.remove('ai-bekle'); d.innerHTML = md(t.split('[[HATA]]')[0]); msj.scrollTop = msj.scrollHeight; } }); }
        catch (x) { hata = true; m = x.message === 'ayar' ? 'Önce sunucu ayarı gerekli (⚙).' : 'Ulaşılamadı: ' + x.message + '. Telefondaki sunucu açık mı?'; }
        if (!hata) yaz(SOHBET, [...oku(SOHBET, []), { r: 's', m }].slice(-TAVAN));
        BEKLEYEN = null;
        if (d.isConnected) { d.classList.remove('ai-bekle'); if (hata) d.classList.add('ai-hata'); d.innerHTML = md(m); msj.scrollTop = msj.scrollHeight; }
      })();
    };
    kap.querySelector('.ai-giris').onsubmit = (ev) => { ev.preventDefault(); const i = ev.target.soru, s = i.value.trim(); if (!s) return; i.value = ''; gonder(s); };
        kap.querySelector('.ai-ayar-d').onclick = () => cizAyar();
    kap.querySelector('.ai-hafiza-d').onclick = () => cizHafiza();
  };
  async function cizHafiza() {
    kap.innerHTML = `<div class="ai-ust"><b>Hafıza</b><button type="button" class="ai-geri">← Sohbet</button></div><div class="ai-hafiza"><p>…</p></div>`;
    kap.querySelector('.ai-geri').onclick = cizSohbet;
    const k = kap.querySelector('.ai-hafiza');
    const goster = (h) => { k.innerHTML = h.length ? `<ul>${h.map((x, i) => `<li><span>${x.s === 'sabit' ? '📌 ' : ''}${esc(x.m)}</span><button type="button" data-i="${i}" aria-label="Sil">×</button></li>`).join('')}</ul><button class="ai-temizle" type="button">Hepsini sil</button>` : '<p>Henüz bir şey hatırlamıyorum.</p>';
      k.querySelectorAll('li button').forEach((b) => { b.onclick = async () => { try { goster((await istek('/hafiza/' + b.dataset.i, null, 'DELETE')).hafiza); } catch { /* sunucu yok */ } }; });
      k.querySelector('.ai-temizle')?.addEventListener('click', async () => { if (confirm('Bütün hafıza silinsin mi?')) { try { goster((await istek('/hafiza', null, 'DELETE')).hafiza); } catch { /* sunucu yok */ } } }); };
    try { goster((await istek('/hafiza', null, 'GET')).hafiza); } catch (x) { k.innerHTML = `<p class="ai-hata">Ulaşılamadı. ${x.message === 'ayar' ? 'Önce ayar gerekli.' : 'Bilgisayar açık mı?'}</p>`; }
  }
  (oku(AYAR, null)?.adres ? cizSohbet : cizAyar)();
}
