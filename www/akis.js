// Video keşfet akışı v0 (Kağan 2026-10-18): tam ekran dikey kaydırmalı kısa videolar, İngilizce altyazı kelime kelime, kelimeye dokununca ilk anlam, listeye ekle.
// Havuz: akis.json (elle süzülmüş YouTube kısa videoları: gömülebilir, İngilizce, uygun, ≤90 sn). Aynı anda TEK oynatıcı (YouTube şartı): görünen kart etkin olur.
// Altyazı: uygulamada telefon alır (altyazi-telefon.js), sitede sunucudan. Sıralama v0: karışık, aynı kanal art arda yok, aynı tür en çok 2 art arda.
import { ytYukle, kokBul, ogrenmeyeDeger } from './klip.js';
import { PAKET } from './ortam.js';
import { ALTYAZI_TELEFON, altyaziTelefondan } from './altyazi-telefon.js';

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function sirala(liste) {
  const k = liste.map((x) => ({ x, r: Math.random() })).sort((a, b) => a.r - b.r).map((o) => o.x);
  const sonuc = [];
  while (k.length) {
    const son = sonuc[sonuc.length - 1], onceki = sonuc[sonuc.length - 2];
    let i = k.findIndex((v) => (!son || v.kanal !== son.kanal) && !(son && onceki && v.tur === son.tur && v.tur === onceki.tur));
    if (i < 0) i = 0;
    sonuc.push(k.splice(i, 1)[0]);
  }
  return sonuc;
}

export function akisSayfasi(kap, { dizin, istek, ekle, girisli, girisGerekli, bildir }) {
  kap.innerHTML = `
    <div class="akis">
      <div class="akis-ust"><span class="akis-baslik">Video</span><a class="akis-link" href="#/video/link">Bağlantıyla aç</a></div>
      <div class="akis-liste" tabindex="-1"><p class="akis-bos">Videolar yükleniyor…</p></div>
    </div>`;
  const liste = kap.querySelector('.akis-liste');
  let videolar = [], aktif = -1, oyn = null, satirlar = [], sira = -1, izleyici = null, sayac = 0, gozlemci = null, bitti = false;
  const HATA_AYIKLA = PAKET; // deney sürümünde küçük tanı satırı (t, durum, satır, mesaj sayısı); kararlı olunca kapatılır
  const altyaziOnbellek = new Map();

  const altyaziAl = async (id) => {
    if (altyaziOnbellek.has(id)) return altyaziOnbellek.get(id);
    const d = PAKET && ALTYAZI_TELEFON ? await altyaziTelefondan(id) : await istek('/altyazi?v=' + id, { sessiz: true });
    altyaziOnbellek.set(id, d);
    return d;
  };
  const kartEl = (i) => liste.children[i];
  const durum = (i, m) => { const el = kartEl(i)?.querySelector('.akis-durum'); if (el) { el.textContent = m || ''; el.hidden = !m; } };

  const sozlukKapat = () => {
    liste.querySelectorAll('.akis-sozluk').forEach((x) => { x.hidden = true; });
    liste.querySelectorAll('.akis-satir .secik').forEach((x) => x.classList.remove('secik'));
  };
  const ciz = (i, n) => {
    const p = kartEl(aktif)?.querySelector('.akis-satir'); if (!p) return;
    if (n < 0) { p.innerHTML = ''; return; }
    p.innerHTML = satirlar[n].k.map(([w, t], j) => (ogrenmeyeDeger(w, j === 0)
      ? `<button class="sozcuk tik" data-s="${e(w)}" data-t="${t}">${e(w)}</button>`
      : `<span class="sozcuk duz" data-t="${t}">${e(w)}</span>`)).join(' ');
  };
  const tik = () => {
    if (!oyn) return;
    const t = oyn.getCurrentTime();
    if (HATA_AYIKLA) { const d = kartEl(aktif)?.querySelector('.akis-dbg'); if (d) { d.hidden = false; d.textContent = `t ${t.toFixed(1)} · durum ${oyn.getPlayerState?.()} · satır ${sira + 1}/${satirlar.length} · mesaj ${oyn.mesaj ?? '-'}`; } }
    let n = -1;
    for (let k = 0; k < satirlar.length && satirlar[k].bas <= t; k++) n = k;
    if (n >= 0 && t >= satirlar[n].son) n = -1;
    if (n !== sira) { sira = n; ciz(aktif, n); }
    const p = kartEl(aktif)?.querySelector('.akis-satir'); if (!p) return;
    let su = null; p.querySelectorAll('.sozcuk').forEach((x) => { if (+x.dataset.t <= t + 0.05) su = x; });
    p.querySelectorAll('.su-an').forEach((x) => { if (x !== su) x.classList.remove('su-an'); });
    su?.classList.add('su-an');
  };

  function birak() {
    clearInterval(izleyici); izleyici = null;
    try { oyn?.destroy(); } catch { /* oynatıcı yok */ }
    oyn = null; satirlar = []; sira = -1;
    const eski = kartEl(aktif);
    if (eski) { eski.classList.remove('oynuyor', 'durdu'); eski.querySelector('.akis-yt').replaceChildren(); eski.querySelector('.akis-satir').innerHTML = ''; durum(aktif, ''); }
    sozlukKapat();
  }

  async function etkinles(i) {
    if (i === aktif) return;
    birak();
    aktif = i; const benim = ++sayac; const v = videolar[i]; const kart = kartEl(i);
    if (!v || !kart) return;
    kart.classList.add('yukleniyor'); durum(i, '');
    satirlar = []; bitti = false;
    // oynatıcı hemen başlar (altyazı beklenmez); altyazı paralel gelir
    await ytYukle();
    if (benim !== sayac) return;
    oyn = new YT.Player(kart.querySelector('.akis-yt'), {
      videoId: v.id, host: 'https://www.youtube-nocookie.com',
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, rel: 0, playsinline: 1, cc_load_policy: 0, cc_lang_pref: 'en', hl: 'en', modestbranding: 1 },
      events: {
        onReady: () => { try { oyn.playVideo(); } catch { /* hazır değil */ } },
        onStateChange: (ev) => {
          if (benim !== sayac) return;
          if (ev.data === 1) { kart.classList.remove('yukleniyor', 'durdu'); kart.classList.add('oynuyor'); clearInterval(izleyici); izleyici = setInterval(tik, 80); }
          else if (ev.data === 0) { try { oyn.seekTo(0, true); oyn.playVideo(); } catch { /* bitti */ } }
          else if (ev.data === 2) { kart.classList.add('durdu'); clearInterval(izleyici); tik(); }
        },
        onError: (ev) => { kart.classList.remove('yukleniyor'); durum(i, ev.data === 101 || ev.data === 150 ? 'Bu videonun sahibi başka yerlerde oynatılmasına izin vermiyor, sonrakine geçiliyor…' : 'Video oynatılamadı, sonrakine geçiliyor…'); setTimeout(() => { if (benim === sayac) kartEl(i + 1)?.scrollIntoView({ behavior: 'smooth' }); }, 2000); },
      },
    });
    let d;
    try { d = await altyaziAl(v.id); } catch (x) { d = { hata: x.message || 'Altyazı alınamadı.' }; }
    if (benim !== sayac) return;
    if (d.yok || d.hata || !(d.satirlar || []).length) {
      durum(i, d.hata ? d.hata : 'Bu videonun İngilizce altyazısı yok, sonrakine geçiliyor…');
      setTimeout(() => { if (benim === sayac) kartEl(i + 1)?.scrollIntoView({ behavior: 'smooth' }); }, d.hata ? 4000 : 1400);
      return;
    }
    satirlar = d.satirlar;
    // sıradaki iki videonun altyazısını önceden al (geçişte beklenmesin)
    for (const n of [i + 1, i + 2]) if (videolar[n] && !altyaziOnbellek.has(videolar[n].id)) altyaziAl(videolar[n].id).catch(() => {});
    // iPhone kendiliğinden başlatmazsa (kullanıcı dokunuşu gerekir) kapaktaki oynat işareti görünsün
    setTimeout(() => { if (benim === sayac && oyn && oyn.getPlayerState?.() !== 1) { kart.classList.remove('yukleniyor'); kart.classList.add('durdu'); } }, 3500);
  }

  async function basla() {
    try { videolar = sirala(await (await fetch('/akis.json')).json()); } catch { liste.innerHTML = '<p class="akis-bos">Videolar yüklenemedi. İnternetini kontrol et.</p>'; return; }
    liste.innerHTML = videolar.map((v) => `
      <article class="akis-kart" data-id="${v.id}">
        <div class="akis-sahne">
          <img class="akis-kapak" src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy">
          <div class="akis-yt"></div>
          <button class="akis-oyna" aria-label="Oynat"><svg viewBox="0 0 24 24" width="44" height="44"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></button>
          <div class="klip-bekle akis-bekle"><i></i></div>
          <p class="akis-durum" hidden></p>
        </div>
        <div class="akis-alt">
          <p class="akis-satir klip-en" aria-live="off"></p>
          <p class="akis-bilgi">${e(v.baslik)} · ${e(v.kanal)}</p>
          <p class="akis-dbg" hidden></p>
          <div class="akis-sozluk klip-sozluk" hidden></div>
        </div>
      </article>`).join('');
    gozlemci = new IntersectionObserver((kayitlar) => {
      for (const k of kayitlar) if (k.isIntersecting && k.intersectionRatio >= 0.7) etkinles([...liste.children].indexOf(k.target));
    }, { root: liste, threshold: [0.7] });
    [...liste.children].forEach((k) => gozlemci.observe(k));
  }

  // dokunuşlar: videoya dokun = oynat/durdur; kelimeye dokun = ilk anlam kartı
  liste.addEventListener('click', (ev) => {
    const kart = ev.target.closest('.akis-kart'); if (!kart) return;
    const i = [...liste.children].indexOf(kart);
    const b = ev.target.closest('button.sozcuk');
    if (b && i === aktif) {
      if (b.classList.contains('secik')) { sozlukKapat(); oyn?.playVideo(); return; }
      try { oyn?.pauseVideo(); } catch { /* yok */ }
      sozlukKapat(); b.classList.add('secik');
      const yaz = b.dataset.s.replace(/[^\w'’-]/g, '');
      const d = kokBul(yaz, dizin || []);
      const ilk = d?.an?.[0] || (d ? ['', d.tr] : null);
      const k = kart.querySelector('.akis-sozluk'); k.hidden = false;
      k.innerHTML = (d && ilk
        ? `<div class="ks-bas"><b>${e(d.k)}</b>${d.s ? ` <span class="seviye">${d.s}</span>` : ''}</div><p class="ks-ilk">${ilk[0] ? `<i>${e(ilk[0])}</i> ` : ''}${e(ilk[1])}</p>`
        : `<div class="ks-bas"><b>${e(yaz)}</b></div><p class="ks-not">Sözlükte henüz yok; listene eklersen sözlüğe ekleme sırasına girer.</p>`)
        + `<div class="vid-kart-alt"><button class="btn kucuk" data-ekle="${e(d ? d.k : yaz.toLowerCase())}">Listeme ekle</button><button class="btn hayalet kucuk" data-devam>Devam et</button></div>`;
      k.querySelector('[data-ekle]').onclick = async (x) => { if (!girisli()) return girisGerekli(); await ekle(x.target.dataset.ekle); x.target.textContent = 'Eklendi ✓'; x.target.disabled = true; };
      k.querySelector('[data-devam]').onclick = () => { sozlukKapat(); oyn?.playVideo(); };
      return;
    }
    if (ev.target.closest('.akis-sozluk')) return;
    if (ev.target.closest('.akis-sahne') && i === aktif && oyn) {
      sozlukKapat();
      oyn.getPlayerState?.() === 1 ? oyn.pauseVideo() : oyn.playVideo();
    }
  });
  liste.addEventListener('scroll', () => { if (!liste.querySelector('.akis-sozluk:not([hidden])')) return; sozlukKapat(); }, { passive: true });

  basla();
  return () => { sayac++; clearInterval(izleyici); gozlemci?.disconnect(); try { oyn?.destroy(); } catch { /* yok */ } };
}
