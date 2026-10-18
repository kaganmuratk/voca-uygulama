// Kendi sunucumuzdan video akışı (Kağan 2026-10-18: "TikTok/Instagram gibi, bekleme yok"): YouTube oynatıcısı YOK, ana sayfada düz <video> öğeleri.
// Sıradaki 2 video önceden yüklenir ve ilk karede bekler (kaydırınca anında), uzaktakilerin kaynağı bırakılır (iOS aynı anda az video çözücü verir).
// Altyazı videonun ÜSTÜNDE, aşağı-yukarı sürüklenebilir (konum hatırlanır); kelimeye dokununca ilk anlam. Altyazı: build'te hazırlanmış /akis-altyazi/<id>.json.
import { kokBul, ogrenmeyeDeger } from './klip.js';
import { SITE, PAKET } from './ortam.js';
import { kisalt } from './akis.js';

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mutlak = (y) => (PAKET ? SITE + y : y);
const AY_ANAHTAR = 'voca-altyazi-y';   // altyazının alttan uzaklığı (sahne yüksekliğinin oranı)
const ayOku = () => { try { const v = parseFloat(localStorage.getItem(AY_ANAHTAR)); return Number.isFinite(v) ? Math.min(0.82, Math.max(0.03, v)) : 0.16; } catch { return 0.16; } };
const ayYaz = (v) => { try { localStorage.setItem(AY_ANAHTAR, String(v)); } catch { /* depolama kapalı */ } };

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

export function kendiAkis(kap, { dizin, ekle, girisli, girisGerekli, videolar: ham }) {
  kap.innerHTML = `
    <div class="kv">
      <div class="kv-ust"><span class="kv-baslik">Video</span><a class="kv-link" href="#/video/link">Bağlantıyla aç</a></div>
      <div class="kv-liste" tabindex="-1"></div>
    </div>`;
  const liste = kap.querySelector('.kv-liste');
  const videolar = sirala(ham);
  let aktif = -1, satirlar = [], sira = -1, izleyici = null, sayac = 0, gozlemci = null, sesAcik = false, kullaniciDurdu = false, gecisT0 = 0, gecisMs = 0, gecisYol = '-';
  const altyaziOnbellek = new Map();
  const kart = (i) => liste.children[i];
  const vid = (i) => kart(i)?.querySelector('video');
  const durum = (i, m) => { const el = kart(i)?.querySelector('.kv-durum'); if (el) { el.textContent = m || ''; el.hidden = !m; } };

  const altyaziAl = (id) => {
    if (altyaziOnbellek.has(id)) return altyaziOnbellek.get(id);
    const yol = '/akis-altyazi/' + id + '.json';   // uygulamada pakette hazır; yoksa sunucudan
    const al = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const p = al(yol).then((d) => d || (PAKET ? al(SITE + yol) : null)).then((d) => d || { yok: true });
    altyaziOnbellek.set(id, p); return p;
  };

  liste.innerHTML = videolar.map((v) => `
    <article class="kv-kart" data-id="${v.id}">
      <div class="kv-sahne">
        <video class="kv-vid" playsinline webkit-playsinline muted loop preload="none" disablepictureinpicture poster="${e(mutlak(v.kapak))}"></video>
        <div class="kv-tap"></div>
        <button class="kv-oyna" hidden aria-label="Oynat"><svg viewBox="0 0 24 24" width="46" height="46"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></button>
        <div class="kv-bekle"><i></i></div>
        <div class="kv-altyazi"><p class="kv-satir" aria-live="off"></p></div>
        <div class="kv-sozluk" hidden></div>
        <p class="kv-durum" hidden></p>
      </div>
      <p class="kv-bilgi">${e(v.baslik)} · ${e(v.kanal)}</p>
      <p class="kv-dbg" hidden></p>
    </article>`).join('');
  liste.style.setProperty('--ay', String(ayOku()));

  // ——— önceden yükleme ———
  const ONCE = 1, SONRA = 2;
  function bagla(j) {   // video kaynağı + ilk kare hazır
    const v = videolar[j], el = vid(j); if (!v || !el || el.dataset.kaynak) return;
    el.dataset.kaynak = '1'; el.preload = 'auto'; el.muted = true; el.src = mutlak(v.mp4);
    if (j !== aktif) {   // arkada: sessiz oynat, ilk kare çizilince durdur ve başa al (kaydırınca anında açılsın)
      const bitir = () => { el.removeEventListener('playing', bitir); if (vid(aktif) !== el) { try { el.pause(); el.currentTime = 0; } catch { /* yok */ } } el.dataset.hazir = '1'; };
      el.addEventListener('playing', bitir);
      el.play().catch(() => { /* iOS ön yüklemeye izin vermezse kart etkinleşince normal başlar */ });
    }
  }
  function birak(j) { const el = vid(j); if (!el || !el.dataset.kaynak) return; try { el.pause(); } catch { /* yok */ } el.removeAttribute('src'); el.load(); delete el.dataset.kaynak; delete el.dataset.hazir; }
  function komsulariHazirla(i) {
    for (let j = 0; j < videolar.length; j++) { if (j >= i - ONCE && j <= i + SONRA) bagla(j); else birak(j); }
    for (const n of [i + 1, i + 2, i + 3]) if (videolar[n]) altyaziAl(videolar[n].id);
  }

  // ——— altyazı ———
  const ciz = (i, n) => {
    const p = kart(i)?.querySelector('.kv-satir'); if (!p) return;
    if (n < 0) { p.innerHTML = ''; return; }
    p.innerHTML = satirlar[n].k.map(([w, t], j) => (ogrenmeyeDeger(w, j === 0)
      ? `<button class="sozcuk tik" data-s="${e(w)}" data-t="${t}">${e(w)}</button>`
      : `<span class="sozcuk duz" data-t="${t}">${e(w)}</span>`)).join(' ');
  };
  const sozlukKapat = () => {
    liste.querySelectorAll('.kv-sozluk').forEach((x) => { x.hidden = true; });
    liste.querySelectorAll('.kv-satir .secik').forEach((x) => x.classList.remove('secik'));
  };
  const tik = () => {
    const el = vid(aktif); if (!el) return;
    const t = el.currentTime;
    const d = kart(aktif)?.querySelector('.kv-dbg');
    if (PAKET && d) { d.hidden = false; d.textContent = `t ${t.toFixed(1)} · hazır ${el.readyState} · geçiş ${gecisYol} ${gecisMs}ms · ses ${el.muted ? 'kapalı' : 'açık'}`; }
    let n = -1;
    for (let k = 0; k < satirlar.length && satirlar[k].bas <= t; k++) n = k;
    if (n >= 0 && t >= satirlar[n].son) n = -1;
    if (n !== sira) { sira = n; ciz(aktif, n); }
    const p = kart(aktif)?.querySelector('.kv-satir'); if (!p) return;
    let su = null; p.querySelectorAll('.sozcuk').forEach((x) => { if (+x.dataset.t <= t + 0.05) su = x; });
    p.querySelectorAll('.su-an').forEach((x) => { if (x !== su) x.classList.remove('su-an'); });
    su?.classList.add('su-an');
  };

  // ——— etkinleştirme ———
  function etkinles(i) {
    if (i === aktif) return;
    const onceki = aktif;
    if (onceki >= 0) { const o = vid(onceki); if (o) { try { o.muted = true; o.pause(); } catch { /* yok */ } } kart(onceki)?.classList.remove('oynuyor', 'durdu', 'yukleniyor'); const oy = kart(onceki)?.querySelector('.kv-oyna'); if (oy) oy.hidden = true; }
    clearInterval(izleyici); sozlukKapat(); satirlar = []; sira = -1; kullaniciDurdu = false;
    aktif = i; const bn = ++sayac; const k = kart(i), el = vid(i), v = videolar[i];
    if (!k || !el) return;
    durum(i, ''); gecisT0 = performance.now();
    const hazirdi = el.dataset.hazir === '1';
    gecisYol = hazirdi ? 'hazır' : 'yükleme';
    komsulariHazirla(i);
    if (!hazirdi) k.classList.add('yukleniyor');
    if (Math.abs(el.currentTime) > 0.2) { try { el.currentTime = 0; } catch { /* yok */ } }
    // önce sesli dene (iOS kullanıcı dokunuşu ister); olmazsa sessiz başlat ve söyle; o da olmazsa oynat simgesi
    el.muted = false;
    el.play().then(() => { sesAcik = true; }).catch(() => {
      el.muted = true;
      el.play().then(() => { if (bn === sayac) durum(i, 'Ses kapalı. Açmak için ekrana dokun.'); }).catch(() => { k.classList.add('durdu'); k.querySelector('.kv-oyna').hidden = false; });
    });
    const oynadi = () => { if (bn !== sayac) return; el.removeEventListener('playing', oynadi); gecisMs = Math.round(performance.now() - gecisT0); k.classList.remove('yukleniyor', 'durdu'); k.classList.add('oynuyor'); };
    if (!el.paused && el.readyState >= 3) oynadi(); else el.addEventListener('playing', oynadi);
    izleyici = setInterval(tik, 50);
    altyaziAl(v.id).then((d) => { if (bn !== sayac) return; satirlar = (d && Array.isArray(d.satirlar)) ? kisalt(d.satirlar) : []; });
    // 8 sn'de açılmadıysa söyle ve geç
    setTimeout(() => { if (bn === sayac && el.readyState < 3 && !el.error) { durum(i, 'Video açılmadı, sonrakine geçiliyor…'); setTimeout(() => { if (bn === sayac) kart(i + 1)?.scrollIntoView({ behavior: 'smooth' }); }, 1500); } }, 8000);
  }

  liste.querySelectorAll('video').forEach((el, i) => {
    el.addEventListener('waiting', () => { if (i === aktif) { const k = kart(i); k.dataset.bekle = String(Date.now()); setTimeout(() => { if (k.dataset.bekle && vid(i) === el && el.readyState < 3) k.classList.add('yukleniyor'); }, 350); } });
    el.addEventListener('playing', () => { const k = kart(i); delete k.dataset.bekle; k.classList.remove('yukleniyor'); });
    el.addEventListener('error', () => { if (i === aktif && el.dataset.kaynak) { durum(i, 'Video yüklenemedi, sonrakine geçiliyor…'); setTimeout(() => { if (i === aktif) kart(i + 1)?.scrollIntoView({ behavior: 'smooth' }); }, 1500); } });
  });

  gozlemci = new IntersectionObserver((kayitlar) => {
    for (const k of kayitlar) if (k.isIntersecting && k.intersectionRatio >= 0.7) etkinles([...liste.children].indexOf(k.target));
  }, { root: liste, threshold: [0.7] });
  [...liste.children].forEach((k) => gozlemci.observe(k));
  komsulariHazirla(0);

  // ——— dokunuşlar ———
  const sesiAc = () => { sesAcik = true; const el = vid(aktif); if (el && el.muted) { el.muted = false; durum(aktif, ''); } };   // dokunuş = kullanıcı hareketi: sesi açabiliriz
  liste.addEventListener('touchend', sesiAc, { passive: true });
  let surukleSonu = 0;   // altyazı sürüklemesinden hemen sonra gelen "click" yutulsun
  liste.addEventListener('click', (ev) => {
    if (Date.now() - surukleSonu < 350) { ev.preventDefault(); ev.stopPropagation(); return; }
    sesiAc();
    const k = ev.target.closest('.kv-kart'); if (!k) return;
    const i = [...liste.children].indexOf(k), el = vid(i);
    const b = ev.target.closest('button.sozcuk');
    if (b && i === aktif) {
      if (b.classList.contains('secik')) { sozlukKapat(); el?.play(); return; }
      try { el?.pause(); } catch { /* yok */ }
      sozlukKapat(); b.classList.add('secik');
      const yaz = b.dataset.s.replace(/[^\w'’-]/g, '');
      const d = kokBul(yaz, dizin || []);
      const ilk = d?.an?.[0] || (d ? ['', d.tr] : null);
      const s = k.querySelector('.kv-sozluk'); s.hidden = false;
      s.innerHTML = (d && ilk
        ? `<div class="ks-bas"><b>${e(d.k)}</b>${d.s ? ` <span class="seviye">${d.s}</span>` : ''}</div><p class="ks-ilk">${ilk[0] ? `<i>${e(ilk[0])}</i> ` : ''}${e(ilk[1])}</p>`
        : `<div class="ks-bas"><b>${e(yaz)}</b></div><p class="ks-not">Sözlükte henüz yok; listene eklersen sözlüğe ekleme sırasına girer.</p>`)
        + `<div class="vid-kart-alt"><button class="btn kucuk" data-ekle="${e(d ? d.k : yaz.toLowerCase())}">Listeme ekle</button><button class="btn hayalet kucuk" data-devam>Devam et</button></div>`;
      s.querySelector('[data-ekle]').onclick = async (x) => { if (!girisli()) return girisGerekli(); await ekle(x.target.dataset.ekle); x.target.textContent = 'Eklendi ✓'; x.target.disabled = true; };
      s.querySelector('[data-devam]').onclick = () => { sozlukKapat(); el?.play(); };
      return;
    }
    if (ev.target.closest('.kv-sozluk')) return;
    if (ev.target.closest('.kv-altyazi')) return;
    if (ev.target.closest('.kv-sahne') && i === aktif && el) {
      sozlukKapat();
      const oy = k.querySelector('.kv-oyna');
      if (el.paused) { kullaniciDurdu = false; oy.hidden = true; k.classList.remove('durdu'); el.play().catch(() => {}); }
      else { kullaniciDurdu = true; el.pause(); oy.hidden = false; k.classList.add('durdu'); }   // simge YALNIZ kullanıcı durdurunca görünür
    }
  });
  liste.addEventListener('scroll', () => { if (liste.querySelector('.kv-sozluk:not([hidden])')) sozlukKapat(); }, { passive: true });

  // ——— altyazıyı aşağı-yukarı sürükleme ———
  liste.addEventListener('pointerdown', (ev) => {
    const ca = ev.target.closest('.kv-altyazi'); if (!ca) return;
    const sahne = ca.closest('.kv-sahne'), h = sahne.getBoundingClientRect().height;
    const y0 = ev.clientY, ay0 = ayOku(); let surukleniyor = false;
    const tasi = (m) => {
      const dy = y0 - m.clientY;
      if (!surukleniyor && Math.abs(dy) < 8) return;
      if (!surukleniyor) { surukleniyor = true; ca.classList.add('suruklenen'); try { ca.setPointerCapture(ev.pointerId); } catch { /* yok */ } }
      m.preventDefault();
      liste.style.setProperty('--ay', String(Math.min(0.82, Math.max(0.03, ay0 + dy / h))));
    };
    const bitir = () => {
      ca.removeEventListener('pointermove', tasi); ca.removeEventListener('pointerup', bitir); ca.removeEventListener('pointercancel', bitir);
      if (surukleniyor) { ca.classList.remove('suruklenen'); ayYaz(parseFloat(liste.style.getPropertyValue('--ay'))); surukleSonu = Date.now(); }
    };
    ca.addEventListener('pointermove', tasi); ca.addEventListener('pointerup', bitir); ca.addEventListener('pointercancel', bitir);
  });

  return () => { sayac++; clearInterval(izleyici); gozlemci?.disconnect(); for (let j = 0; j < videolar.length; j++) birak(j); };
}
