// Video keşfet akışı v0 (Kağan 2026-10-18): tam ekran dikey kaydırmalı kısa videolar, İngilizce altyazı kelime kelime, kelimeye dokununca ilk anlam, listeye ekle.
// Havuz: akis.json (elle süzülmüş YouTube kısa videoları: gömülebilir, İngilizce, uygun, ≤90 sn). Aynı anda TEK oynatıcı (YouTube şartı): görünen kart etkin olur.
// Altyazı: uygulamada telefon alır (altyazi-telefon.js), sitede sunucudan. Sıralama v0: karışık, aynı kanal art arda yok, aynı tür en çok 2 art arda.
import { ytYukle, kokBul, ogrenmeyeDeger } from './klip.js';
import { PAKET } from './ortam.js';
import { ALTYAZI_TELEFON, altyaziTelefondan } from './altyazi-telefon.js';

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Uzun altyazı satırlarını (23 kelimeye kadar çıkıyor) en çok iki ekran satırına sığacak parçalara böl: yerleşim zıplamasın, kelime kesilmesin.
const SATIR_MAX = 62;
export function kisalt(satirlar) {
  const uzun = (k) => k.map((x) => x[0]).join(' ').length > SATIR_MAX;
  const bol = (s) => {
    if (!uzun(s.k) || s.k.length < 2) return [s];
    let en = 1, fark = Infinity;
    const top = s.k.map((x) => x[0]).join(' ').length;
    for (let i = 1, uz = 0; i < s.k.length; i++) { uz += s.k[i - 1][0].length + 1; const f = Math.abs(uz - top / 2); if (f < fark) { fark = f; en = i; } }
    const a = { bas: s.bas, son: Math.min(s.son, s.k[en][1]), k: s.k.slice(0, en) }, b = { bas: s.k[en][1], son: s.son, k: s.k.slice(en) };
    return [...bol(a), ...bol(b)];
  };
  return satirlar.flatMap(bol);
}

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

  // Altyazı önce build'te hazırlanmış statik dosyadan (/akis-altyazi/<id>.json: anında, YouTube'a gitmez); yoksa eski yol (telefon/sunucu).
  const altyaziAl = (id) => {
    if (altyaziOnbellek.has(id)) return altyaziOnbellek.get(id);
    const p = (async () => {
      try {
        const r = await fetch('/akis-altyazi/' + id + '.json');
        if (r.ok) { const d = await r.json(); if (Array.isArray(d.satirlar) && d.satirlar.length) return d; }
      } catch { /* statik yok: eski yola düş */ }
      return PAKET && ALTYAZI_TELEFON ? altyaziTelefondan(id) : istek('/altyazi?v=' + id, { sessiz: true });
    })();
    altyaziOnbellek.set(id, p);
    p.then((d) => { if (d?.hata) altyaziOnbellek.delete(id); }, () => altyaziOnbellek.delete(id));   // hata kalıcı olmasın
    return p;
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
    if (kapakBekle && t >= kapakEsik) { kapakBekle = false; kartEl(aktif)?.classList.add('oynuyor'); }
    if (HATA_AYIKLA) { const d = kartEl(aktif)?.querySelector('.akis-dbg'); if (d) { d.hidden = false; d.textContent = `t ${t.toFixed(1)} · durum ${oyn.getPlayerState?.()} · satır ${sira + 1}/${satirlar.length} · mesaj ${oyn.mesaj ?? '-'} · geçiş ${gecisYol} ${gecisMs}ms`; } }
    let n = -1;
    for (let k = 0; k < satirlar.length && satirlar[k].bas <= t; k++) n = k;
    if (n >= 0 && t >= satirlar[n].son) n = -1;
    if (n !== sira) { sira = n; ciz(aktif, n); }
    const p = kartEl(aktif)?.querySelector('.akis-satir'); if (!p) return;
    let su = null; p.querySelectorAll('.sozcuk').forEach((x) => { if (+x.dataset.t <= t + 0.05) su = x; });
    p.querySelectorAll('.su-an').forEach((x) => { if (x !== su) x.classList.remove('su-an'); });
    su?.classList.add('su-an');
  };

  // İKİ kalıcı oynatıcı (Kağan 2026-10-18: "bekleme/beyaz ekran istemiyorum"): biri oynar, diğeri sıradaki videoyu sessiz/duraklatılmış önceden yükler.
  // Kaydırınca hazır olan oynatıcı hemen devralır (anında başlar); hazır değilse etkin oynatıcıya loadVideoById (iframe yeniden kurulmaz).
  // Oynatıcılar listenin içinde kayan üst katmandır; oynamaya başlayana kadar gizli, altta kapak görünür (beyaz ekran olmaz).
  const yeniP = () => ({ oyn: null, katman: null, hazir: false, id: '', rol: 'bos', onHazir: false, sessiz: false, bekleyen: null });
  const P = [yeniP(), yeniP()]; window.__akisP = P; let kapakBekle = false, kapakEsik = 0.3, konumZaman = 0, ai = 0, kart = null, benim = 0, gecis = false, onYuklendi = false, katman = null, gecisT0 = 0, gecisYol = '-', gecisMs = 0, hizliHata = (() => { try { return localStorage.getItem('voca-tek') === '1' ? 99 : 0; } catch { return 0; } })();   // voca-tek=1: tek oynatıcı kipi (deney/yedek)
  const akt = () => P[ai], yed = () => P[1 - ai];
  const katmanKonumla = () => {
    const k = kartEl(aktif)?.querySelector('.akis-sahne') || liste.querySelector('.akis-sahne'); if (!k) return;
    if (!k.offsetWidth || !k.offsetHeight) return;
    for (const p of P) if (p.katman) Object.assign(p.katman.style, { top: '0', left: '0', transform: `translate(${k.offsetLeft}px, ${k.offsetTop}px)`, width: k.offsetWidth + 'px', height: k.offsetHeight + 'px' });   // ikisi de tam boyutlu, aynı yerde (yedek opacity 0)
  };
  const baslat = (v) => {   // aktif oynatıcıda video başlat (sıfırdan yükle)
    const p = akt(); gecis = true; p.id = v.id; p.onHazir = false;
    if (p.sessiz) { try { p.oyn.unMute(); p.sessiz = false; } catch { /* yok */ } }
    try { p.oyn.loadVideoById({ videoId: v.id, startSeconds: 0 }); } catch { /* hazır değil */ }
  };
  const kur = async (p, id, otomatik) => {
    await ytYukle();
    if (p.oyn) return;
    p.katman = document.createElement('div'); p.katman.className = 'akis-katman'; const ic = document.createElement('div'); p.katman.append(ic); liste.append(p.katman); katmanKonumla();
    p.id = id;
    p.oyn = new YT.Player(ic, {
      videoId: id, host: 'https://www.youtube-nocookie.com',
      playerVars: { autoplay: otomatik ? 1 : 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, rel: 0, playsinline: 1, cc_load_policy: 0, cc_lang_pref: 'en', hl: 'en', modestbranding: 1 },
      events: {
        onReady: () => {
          p.hazir = true;
          if (p.bekleyen && p.bekleyen.id !== p.id) { const v2 = p.bekleyen; p.bekleyen = null; if (p.rol === 'aktif') baslat(v2); else onYukle(v2); }
          else if (p.rol === 'aktif') { try { p.oyn.playVideo(); } catch { /* hazır değil */ } }
          else if (p.rol === 'onyukleme') { try { p.oyn.mute(); p.sessiz = true; p.oyn.playVideo(); } catch { /* hazır değil */ } }
        },
        onStateChange: (ev) => {
          if (p.rol === 'onyukleme') {   // arkada hazırlanan: ilk karede dur, başa sar, bekle
            if (ev.data === 1) { try { p.oyn.pauseVideo(); p.oyn.seekTo(0, true); } catch { /* yok */ } p.onHazir = true; }
            return;
          }
          if (p.rol !== 'aktif' || !kart) return;
          if (gecis && ev.data !== 1) return;   // yeni videoya geçerken eskinin kalıntı olaylarını yoksay
          if (ev.data === 1) {
            gecis = false; if (gecisT0) { gecisMs = Math.round(performance.now() - gecisT0); gecisT0 = 0; } p.katman.classList.add('gorunur'); kart.classList.remove('yukleniyor', 'durdu'); kapakBekle = true; kapakEsik = gecisYol === 'hızlı' ? 0.05 : 0.3; clearInterval(izleyici); izleyici = setInterval(tik, 80);
            if (!onYuklendi) { onYuklendi = true; onHazirla(aktif); }
          }
          else if (ev.data === 0) { try { p.oyn.seekTo(0, true); p.oyn.playVideo(); } catch { /* bitti */ } }
          else if (ev.data === 2) { kart.classList.add('durdu'); if (kapakBekle && p.oyn.getCurrentTime() > 0.05) { kapakBekle = false; kart.classList.add('oynuyor'); } clearInterval(izleyici); tik(); }
        },
        onError: (ev) => {
          if (p.rol !== 'aktif') { p.onHazir = false; p.id = ''; return; }   // arkadaki bozuksa o kartta normal yoldan denenir
          if (!kart) return; const i = aktif, bn = benim; kart.classList.remove('yukleniyor');
          durum(i, ev.data === 101 || ev.data === 150 ? 'Bu videonun sahibi başka yerlerde oynatılmasına izin vermiyor, sonrakine geçiliyor…' : 'Video oynatılamadı, sonrakine geçiliyor…');
          setTimeout(() => { if (bn === sayac) kartEl(i + 1)?.scrollIntoView({ behavior: 'smooth' }); }, 1200);
        },
      },
    });
  };
  // Hızlı yolda sesi açma tutmadıysa (iPhone kullanıcı dokunuşu ister) video sessiz oynar: sıfırdan sesli yükle, olmazsa kullanıcıya söyle
  const sesDenetle = (p, bn, v, i) => setTimeout(() => {
    if (bn !== sayac || p.rol !== 'aktif' || !p.oyn.isMuted?.()) return;
    try { p.oyn.unMute(); p.sessiz = false; } catch { /* yok */ }
    setTimeout(() => { if (bn === sayac && p.rol === 'aktif' && p.oyn.isMuted?.()) durum(i, 'Ses kapalı. Açmak için videoya dokun.'); }, 700);
  }, 900);
  // sıradaki videoyu yedek oynatıcıda önceden yükle (sessiz, ilk karede durur)
  function onYukle(v) {
    const p = yed(); if (p.id === v.id && p.onHazir) return;
    p.rol = 'onyukleme'; p.onHazir = false; p.id = v.id;
    if (!p.oyn) { kur(p, v.id, false); return; }   // hazır olunca sessiz oynatıp ilk karede durdurur
    if (!p.hazir) { p.bekleyen = v; return; }
    try { p.oyn.mute(); p.sessiz = true; p.oyn.loadVideoById({ videoId: v.id, startSeconds: 0 }); } catch { /* yok */ }
  }

  function birak() {
    clearInterval(izleyici); izleyici = null; kapakBekle = false;
    const p = akt(); try { p.oyn?.mute(); p.sessiz = !!p.oyn; p.oyn?.pauseVideo(); } catch { /* yok */ }   // eski videonun sesi anında kesilsin (duraklatma mesajı gecikebiliyor)
    p.katman?.classList.remove('gorunur');
    satirlar = []; sira = -1;
    const eski = kartEl(aktif);
    if (eski) { eski.classList.remove('oynuyor', 'durdu'); eski.querySelector('.akis-satir').innerHTML = ''; durum(aktif, ''); }
    sozlukKapat();
  }

  // sıradaki videonun yedekte yüklenmesi + kapak ve altyazı önbelleği; altyazısız videoyu ona gelmeden listeden çıkar
  const onHazirla = (i) => {
    if (videolar[i + 1] && hizliHata < 2) onYukle(videolar[i + 1]);   // hızlı yol çalışmıyorsa arkada boşuna yükleme
    for (const n of [i + 1, i + 2, i + 3]) {
      const v = videolar[n]; if (!v) continue;
      if (n <= i + 2) { const im = new Image(); im.src = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`; }
      if (altyaziOnbellek.has(v.id)) continue;
      altyaziAl(v.id).then((d) => {
        if (!d || !d.yok) return;
        const k = liste.querySelector(`.akis-kart[data-id="${v.id}"]`); const idx = k ? [...liste.children].indexOf(k) : -1;
        if (idx > aktif) { k.remove(); videolar.splice(videolar.findIndex((x) => x.id === v.id), 1); }
      }).catch(() => {});
    }
  };

  async function etkinles(i) {
    if (i === aktif) return;
    birak();
    aktif = i; const bn = ++sayac; benim = bn; const v = videolar[i]; kart = kartEl(i); onYuklendi = false;
    if (!v || !kart) return;
    kart.classList.add('yukleniyor'); durum(i, '');
    satirlar = []; bitti = false;
    const hedef = yed(); gecisT0 = performance.now();
    if (hizliHata < 2 && hedef.oyn && hedef.hazir && hedef.onHazir && hedef.id === v.id) {   // HIZLI YOL
      gecisYol = 'hızlı';
      akt().rol = 'bos'; akt().onHazir = false;
      ai = 1 - ai; const p = akt(); p.rol = 'aktif'; oyn = p.oyn; katman = p.katman;
      katmanKonumla(); gecis = true;
      try { p.oyn.unMute(); p.sessiz = false; p.oyn.playVideo(); } catch { /* yok */ }   // zaten 0. sn'de hazır bekliyor: seekTo yeniden arabelleğe aldırıp sesi/görüntüyü takıyordu
      setTimeout(() => { if (bn === sayac && p.oyn.getPlayerState?.() !== 1) { hizliHata++; baslat(v); } }, 800);   // devralma tutmadıysa (ör. iPhone) normal yükleme; iki kez tutmazsa hızlı yol kapanır
      sesDenetle(p, bn, v, i);
    } else {
      gecisYol = 'normal';
      const p = akt(); p.rol = 'aktif'; oyn = p.oyn; katman = p.katman;
      if (!p.oyn) { await kur(p, v.id, true); if (bn !== sayac) return; oyn = p.oyn; katman = p.katman; }
      katmanKonumla();
      if (!p.hazir) { if (p.id !== v.id) p.bekleyen = v; }   // hazır olunca doğru videoyla başlar
      else if (p.id !== v.id) baslat(v);
      else if (p.oyn.getPlayerState?.() === 1 && !gecis && !p.katman.classList.contains('gorunur')) { p.katman.classList.add('gorunur'); kart.classList.remove('yukleniyor', 'durdu'); kapakBekle = true; kapakEsik = gecisYol === 'hızlı' ? 0.05 : 0.3; clearInterval(izleyici); izleyici = setInterval(tik, 80); if (!onYuklendi) { onYuklendi = true; onHazirla(i); } }   // kurulurken zaten başlamışsa
    }
    // ağ takılırsa (durum 3 = arabelleğe alıyor) 7 sn sonra videoyu bir kez yeniden iste; yine olmazsa sonrakine geç
    setTimeout(() => {
      if (bn !== sayac || akt().oyn?.getPlayerState?.() === 1) return;
      if (akt().oyn?.getPlayerState?.() === 3) { baslat(v); setTimeout(() => { if (bn === sayac && akt().oyn?.getPlayerState?.() !== 1 && akt().oyn?.getPlayerState?.() === 3) { durum(i, 'Video açılmadı, sonrakine geçiliyor…'); setTimeout(() => { if (bn === sayac) kartEl(i + 1)?.scrollIntoView({ behavior: 'smooth' }); }, 1200); } }, 7000); }
    }, 7000);
    let d;
    try { d = await altyaziAl(v.id); } catch (x) { d = { hata: x.message || 'Altyazı alınamadı.' }; }
    if (bn !== sayac) return;
    if (d.yok || d.hata || !(d.satirlar || []).length) {
      durum(i, d.hata ? d.hata : 'Bu videonun İngilizce altyazısı yok, sonrakine geçiliyor…');
      setTimeout(() => { if (bn === sayac) kartEl(i + 1)?.scrollIntoView({ behavior: 'smooth' }); }, d.hata ? 4000 : 800);
      return;
    }
    satirlar = kisalt(d.satirlar);
    // iPhone kendiliğinden başlatmazsa (kullanıcı dokunuşu gerekir) kapaktaki oynat işareti görünsün
    setTimeout(() => { if (bn === sayac && oyn && oyn.getPlayerState?.() !== 1) { kart.classList.remove('yukleniyor'); kart.classList.add('durdu'); } }, 3500);
  }

  async function basla() {
    try { videolar = sirala(await (await fetch('/akis.json')).json()); } catch { liste.innerHTML = '<p class="akis-bos">Videolar yüklenemedi. İnternetini kontrol et.</p>'; return; }
    liste.innerHTML = videolar.map((v) => `
      <article class="akis-kart" data-id="${v.id}">
        <div class="akis-sahne">
          <img class="akis-kapak" src="https://i.ytimg.com/vi/${v.id}/hqdefault.jpg" alt="" loading="lazy">
          <div class="akis-tap"></div>
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
    addEventListener('resize', katmanKonumla);
    konumZaman = setInterval(katmanKonumla, 250);   // iOS'ta yerleşim geç oturabiliyor (sahne bir an 0 genişlikte kalıyordu): katman her zaman sahneyle hizalı kalsın
    try { new ResizeObserver(katmanKonumla).observe(liste); } catch { /* eski WebView */ }
    akt().rol = 'aktif'; kur(akt(), videolar[0].id, true).then(() => { oyn = akt().oyn; katman = akt().katman; });   // iframe, ilk kaydırmadan önce yüklensin
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
      if (oyn.isMuted?.()) { oyn.unMute(); durum(i, ''); return; }   // sessiz kaldıysa dokunuş sesi açar
      oyn.getPlayerState?.() === 1 ? oyn.pauseVideo() : oyn.playVideo();
    }
  });
  liste.addEventListener('scroll', () => { if (!liste.querySelector('.akis-sozluk:not([hidden])')) return; sozlukKapat(); }, { passive: true });

  basla();
  return () => { sayac++; clearInterval(izleyici); gozlemci?.disconnect(); removeEventListener('resize', katmanKonumla); clearInterval(konumZaman); for (const p of P) try { p.oyn?.destroy(); } catch { /* yok */ } };
}

// Uygulama açılışında YouTube ve köprü sayfasını ısıt (ilk video açılışı beklemesin): görünmez bir oynatıcı kurar, birkaç sn sonra yok eder.
export async function akisIsit() {
  try {
    await ytYukle();
    const l = await (await fetch('/akis.json')).json(); const v = l[Math.floor(Math.random() * l.length)];
    const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.append(h);
    const p = new YT.Player(h, { videoId: v.id, host: 'https://www.youtube-nocookie.com', playerVars: { autoplay: 0, controls: 0, playsinline: 1, modestbranding: 1 } });
    setTimeout(() => { try { p.destroy(); } catch { /* yok */ } h.remove(); }, 12000);
  } catch { /* ısınma isteğe bağlı */ }
}
