// Videodan kelime (Kağan, 2026-10-15): herhangi bir YouTube videosunu Voca'da izle, İngilizce altyazı bizim (kelime zamanlı),
// kelimeye dokununca anlamı çıkar, listene ekle. Altyazı sunucudan gelir (/api/altyazi, src/altyazi.js); oynatıcı ve görünüm
// kelime klipleriyle aynı (klip.js): YouTube'un kendi düğmeleri ve alt yazısı kapalı, kontroller bizim.
import { ytYukle, kokBul, ogrenmeyeDeger, sesKontrolu } from './klip.js';

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sure = (t) => { t = Math.max(0, Math.floor(t || 0)); const s = t % 60, d = Math.floor(t / 60) % 60, sa = Math.floor(t / 3600); return (sa ? sa + ':' + String(d).padStart(2, '0') : d) + ':' + String(s).padStart(2, '0'); };
export const videoKimligi = (s) => { s = (s || '').trim(); const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([A-Za-z0-9_-]{11})/) || s.match(/^([A-Za-z0-9_-]{11})$/); return m && m[1]; };

export function videoSayfasi(kap, { dizin, ac, istek, ekle, girisli, girisGerekli, bildir }) {
  kap.innerHTML = `
    <div class="liste-ust"><h1 class="baslik-l">Video</h1></div>
    <form class="vid-form" autocomplete="off">
      <input class="girdi" name="link" inputmode="url" placeholder="YouTube bağlantısını yapıştır" aria-label="YouTube bağlantısı">
      <button class="btn">Aç</button>
    </form>
    <p class="vid-durum" aria-live="polite"></p>
    <div class="vid" hidden>
      <div class="vid-sahne">
        <div class="klip-ekran vid-ekran"><div id="vidYt"></div><div class="klip-bekle" hidden aria-label="Yükleniyor"><i></i></div></div>
        <div class="vid-altyazi"><p class="klip-en vid-satir" aria-live="off"></p></div>
        <div class="klip-sozluk vid-kart" hidden></div>
        <button class="kk vid-cik" data-k="tam" aria-label="Tam ekrandan çık">✕</button>
      </div>
      <input class="vid-cubuk" type="range" min="0" max="1000" value="0" aria-label="Videoda konum">
      <div class="klip-kontrol">
        <button class="kk" data-k="geri" aria-label="5 saniye geri">↺5</button>
        <button class="kk" data-k="oyna" aria-label="Oynat / durdur">▶</button>
        <button class="kk" data-k="ileri" aria-label="5 saniye ileri">5↻</button>
        <span class="kk-sayac vid-zaman">0:00</span>
        <span class="kk-ara"></span>
        <button class="kk kk-yazi" data-k="hiz" aria-label="Hız">1×</button>
        <button class="kk vid-tam-btn" data-k="tam" aria-label="Tam ekran"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
      </div>
      <p class="klip-kaynak vid-bilgi"></p>
    </div>`;
  const $ = (s) => kap.querySelector(s);
  const sesK = sesKontrolu($('.klip-kontrol'), () => oyn);
  let oyn = null, satirlar = [], sira = -1, izleyici = null, hiz = 1, uzunluk = 0, surukleniyor = false;
  const durum = (m) => { $('.vid-durum').textContent = m || ''; };
  const bekle = (a) => { $('.klip-bekle').hidden = !a; };
  const oynuyor = () => oyn?.getPlayerState?.() === 1;

  const ciz = (i) => {
    const p = $('.vid-satir');
    if (i < 0) { p.innerHTML = ''; return; }
    p.innerHTML = satirlar[i].k.map(([w, t], n) => (ogrenmeyeDeger(w, n === 0)
      ? `<button class="sozcuk tik" data-s="${e(w)}" data-t="${t}">${e(w)}</button>`
      : `<span class="sozcuk duz" data-t="${t}">${e(w)}</span>`)).join(' ');
  };
  const tik = () => {
    const t = oyn.getCurrentTime();
    let i = -1;
    for (let k = 0; k < satirlar.length && satirlar[k].bas <= t; k++) i = k;
    if (i >= 0 && t >= satirlar[i].son) i = -1;
    if (i !== sira) { sira = i; ciz(i); }
    // karaoke: söylenen son kelime
    let n = null; kap.querySelectorAll('.vid-satir .sozcuk').forEach((x) => { if (+x.dataset.t <= t + 0.05) n = x; });
    kap.querySelectorAll('.vid-satir .su-an').forEach((x) => { if (x !== n) x.classList.remove('su-an'); });
    n?.classList.add('su-an');
    if (!surukleniyor && uzunluk) $('.vid-cubuk').value = Math.round((t / uzunluk) * 1000);
    $('.vid-zaman').textContent = `${sure(t)} / ${sure(uzunluk)}`;
  };
  const ytAltyaziKapat = () => { try { oyn.setOption('captions', 'track', {}); } catch {} try { oyn.unloadModule('captions'); oyn.unloadModule('cc'); } catch {} };

  async function ac_(id) {
    if (!girisli()) return girisGerekli();
    kartKapat(); durum('Altyazı alınıyor…'); $('.vid').hidden = true;
    let d;
    try { d = await istek('/altyazi?v=' + id); } catch (x) { durum(x.message === 'giriş' ? '' : (x.message || 'Altyazı alınamadı.')); return; }
    if (d.yok) { durum('Bu videonun İngilizce altyazısı yok. İngilizce altyazılı bir video dene.'); return; }
    satirlar = d.satirlar || []; sira = -1; uzunluk = d.sure || 0;
    durum('');
    $('.vid').hidden = false;
    $('.vid-bilgi').textContent = [d.baslik, d.kanal].filter(Boolean).join(' · ') + (d.otomatik ? ' · otomatik altyazı' : '');
    await ytYukle();
    if (oyn) { oyn.loadVideoById({ videoId: id }); return; }
    bekle(true);
    oyn = new YT.Player($('#vidYt'), {
      videoId: id, host: 'https://www.youtube-nocookie.com',
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, rel: 0, playsinline: 1, cc_load_policy: 0, cc_lang_pref: 'en', hl: 'en', modestbranding: 1 },
      events: {
        onApiChange: ytAltyaziKapat,
        onReady: () => { bekle(false); uzunluk = oyn.getDuration?.() || uzunluk; sesK?.uygula(); },
        onStateChange: (ev) => {
          if (ev.data === 3) bekle(true);
          if (ev.data === 1) { ytAltyaziKapat(); bekle(false); kartKapat(); uzunluk = oyn.getDuration?.() || uzunluk; clearInterval(izleyici); izleyici = setInterval(tik, 80); }
          else { if (ev.data !== 3) bekle(false); clearInterval(izleyici); if (oyn) tik(); }
          $('[data-k="oyna"]').textContent = ev.data === 1 ? '❚❚' : '▶';
        },
        onError: (ev) => durum(ev.data === 101 || ev.data === 150 ? 'Bu videonun sahibi başka sitelerde oynatılmasına izin vermiyor.' : 'Video oynatılamadı.'),
      },
    });
  }

  // kelime → kısa anlam kartı (klip kartıyla aynı) + listeme ekle
  const kartKapat = () => { const k = $('.vid-kart'); if (k) k.hidden = true; kap.querySelectorAll('.vid-satir .secik').forEach((x) => x.classList.remove('secik')); };
  $('.vid-satir').addEventListener('click', (ev) => {
    const b = ev.target.closest('button.sozcuk'); if (!b) return;
    if (b.classList.contains('secik')) { kartKapat(); return; }
    if (oynuyor()) oyn.pauseVideo();
    kartKapat(); b.classList.add('secik');
    const yaz = b.dataset.s.replace(/[^\w'’-]/g, '');
    const d = kokBul(yaz, dizin || []);
    const kart = $('.vid-kart'); kart.hidden = false;
    kart.innerHTML = (d
      ? `<div class="ks-bas"><b>${e(d.k)}</b>${d.s ? ` <span class="seviye">${d.s}</span>` : ''}<button class="ks-git" data-k="${e(d.k)}">Detay →</button></div>
         <ol class="ks-anlamlar">${(d.an?.length ? d.an : [['', d.tr]]).map(([t, tr]) => `<li>${t ? `<i>${e(t)}</i> ` : ''}${e(tr)}</li>`).join('')}</ol>`
      : `<div class="ks-bas"><b>${e(yaz)}</b></div><p class="ks-not">Sözlükte henüz yok; listene eklersen sözlüğe ekleme sırasına girer.</p>`)
      + `<div class="vid-kart-alt"><button class="btn kucuk" data-ekle="${e(d ? d.k : yaz.toLowerCase())}">Listeme ekle</button><button class="btn hayalet kucuk" data-devam>Devam et</button></div>`;
    const g = kart.querySelector('.ks-git'); if (g) g.onclick = () => { tamCik(); ac(g.dataset.k); };
    kart.querySelector('[data-ekle]').onclick = async (x) => { await ekle(x.target.dataset.ekle); x.target.textContent = 'Eklendi ✓'; x.target.disabled = true; };
    kart.querySelector('[data-devam]').onclick = () => { kartKapat(); oyn?.playVideo(); };
  });

  // tam ekran: sahne (video + bizim altyazı + kart) tam ekran olur; destek yoksa (iPhone) sayfa içi tam ekran
  const sahne = $('.vid-sahne');
  const tamMi = () => sahne.classList.contains('tam');
  const tamAc = async () => {
    sahne.classList.add('tam'); document.body.classList.add('vid-tam');
    try { await sahne.requestFullscreen?.({ navigationUI: 'hide' }); await screen.orientation?.lock?.('landscape'); } catch {}
  };
  function tamCik() {
    sahne.classList.remove('tam'); document.body.classList.remove('vid-tam');
    try { screen.orientation?.unlock?.(); } catch {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  const tamDinle = () => { if (!document.fullscreenElement && tamMi()) tamCik(); };
  document.addEventListener('fullscreenchange', tamDinle);

  kap.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b || !oyn) return;
    const k = b.dataset.k, t = oyn.getCurrentTime();
    if (k === 'oyna') oynuyor() ? oyn.pauseVideo() : (kartKapat(), oyn.playVideo());
    if (k === 'geri') oyn.seekTo(Math.max(0, t - 5), true);
    if (k === 'ileri') oyn.seekTo(t + 5, true);
    if (k === 'hiz') { hiz = hiz === 1 ? .75 : hiz === .75 ? .5 : 1; oyn.setPlaybackRate(hiz); b.textContent = (hiz === 1 ? '1' : String(hiz).replace('0.', ',')) + '×'; }
    if (k === 'tam') tamMi() ? tamCik() : tamAc();
  });
  // ekrana dokunmak oynat/durdur
  $('.vid-ekran').onclick = () => { if (!oyn) return; oynuyor() ? oyn.pauseVideo() : (kartKapat(), oyn.playVideo()); };
  const cubuk = $('.vid-cubuk');
  cubuk.oninput = () => { surukleniyor = true; $('.vid-zaman').textContent = `${sure((cubuk.value / 1000) * uzunluk)} / ${sure(uzunluk)}`; };
  cubuk.onchange = () => { surukleniyor = false; if (oyn && uzunluk) oyn.seekTo((cubuk.value / 1000) * uzunluk, true); };

  $('.vid-form').onsubmit = (ev) => {
    ev.preventDefault();
    const id = videoKimligi(ev.target.link.value);
    if (!id) { durum('Bu bir YouTube bağlantısı değil.'); return; }
    ac_(id);
  };
  return () => { clearInterval(izleyici); document.removeEventListener('fullscreenchange', tamDinle); document.body.classList.remove('vid-tam'); try { oyn?.destroy(); } catch {} };
}
