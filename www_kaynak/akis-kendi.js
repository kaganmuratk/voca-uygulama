// Kendi sunucumuzdan video akışı (Kağan 2026-10-18: "TikTok/Instagram gibi, bekleme yok, tam ekran"): YouTube oynatıcısı YOK, ana sayfada düz <video> öğeleri.
// Videolar arkada TAM indirilip blob olarak cihazda tutulur (sıradaki 3 video + başlangıçta ilk 2): kaydırınca ağ beklenmez, sunucunun Range desteği gerekmez.
// Altyazı videonun ÜSTÜNDE, aşağı-yukarı sürüklenebilir (konum hatırlanır); kelimeye dokununca video durur ve ilk anlam çıkar. Kaydet düğmesi: yerel liste (Hesap'ta görünür).
import { kokBul, ogrenmeyeDeger } from './klip.js';
import { SITE, PAKET, jsonAl } from './ortam.js';
import { kisalt } from './akis.js';
import { yerelOku, yerelYaz } from './yerel.js';

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mutlak = (y) => (PAKET ? SITE + y : y);
const AY_ANAHTAR = 'voca-altyazi-ust';   // altyazının üstten konumu (sahne yüksekliğinin oranı; varsayılan 0,5 = ekranın ortası)
const ayOku = () => { try { const v = parseFloat(localStorage.getItem(AY_ANAHTAR)); return Number.isFinite(v) ? Math.min(0.88, Math.max(0.1, v)) : 0.5; } catch { return 0.5; } };
const HIZLAR = [1, 1.25, 1.5, 2, 0.75, 0.5];
function hizOku() { try { const v = parseFloat(localStorage.getItem('voca-hiz')); return HIZLAR.includes(v) ? v : 1; } catch { return 1; } }
const ayYaz = (v) => { try { localStorage.setItem(AY_ANAHTAR, String(v)); } catch { /* depolama kapalı */ } };

// ——— modül düzeyi: liste sırası ve indirilen videolar (uygulama açılışında ısınma + akış sayfası aynı depoyu kullanır) ———
const DEPO = { sira: null, blob: new Map(), hata: new Map(), indiriliyor: new Set(), isci: false, hedefler: () => [] };
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
async function indir(v, bitti) {
  if (DEPO.blob.has(v.id) || DEPO.indiriliyor.has(v.id) || (DEPO.hata.get(v.id) || 0) >= 2) return;
  DEPO.indiriliyor.add(v.id);
  try {
    let r = PAKET ? await fetch(v.mp4).catch(() => null) : null;   // uygulamada pilot videolar pakette gömülü (anında); yoksa sunucudan
    if (!r || !r.ok || !/video/.test(r.headers.get('content-type') || '')) r = await fetch(mutlak(v.mp4));
    if (!r.ok) throw new Error('http ' + r.status);
    const b = new Blob([await r.arrayBuffer()], { type: 'video/mp4' });
    DEPO.blob.set(v.id, URL.createObjectURL(b));
    DEPO.hata.delete(v.id);
  } catch { DEPO.hata.set(v.id, (DEPO.hata.get(v.id) || 0) + 1); }
  finally { DEPO.indiriliyor.delete(v.id); bitti?.(v); }
}
async function isci(bitti) {   // tek işçi: o an gereken en öncelikli videoyu indirir (etkin video ağı rakiplerle paylaşmaz)
  if (DEPO.isci) return; DEPO.isci = true;
  try { for (;;) { const s = DEPO.hedefler().find((v) => v && !DEPO.blob.has(v.id) && (DEPO.hata.get(v.id) || 0) < 2); if (!s) break; await indir(s, bitti); } }
  finally { DEPO.isci = false; }
}
// Uygulama açılışında çağrılır: liste alınır, sıra belirlenir, ilk 2 video indirilmeye başlar (Video sekmesi açılınca hazır olsun).
export async function akisOnYukle() {
  try {
    if (!DEPO.sira) { const l = await jsonAl('/akis-kendi.json'); if (!Array.isArray(l) || !l.length) return; DEPO.sira = sirala(l); }
    DEPO.hedefler = () => DEPO.sira.slice(0, 2);
    await isci();
  } catch { /* ısınma isteğe bağlı */ }
}
const KAYIT = (ad) => 'kayit:' + (ad || '');
export async function kayitlariOku(ad) { const l = await yerelOku(KAYIT(ad)); return Array.isArray(l) ? l : []; }

// Altyazı TEK ekran satırı: kelimeler ölçülen genişliğe göre parçalara bölünür (parça zamanı = ilk kelimesinin zamanı)
function tekSatir(satirlar, genislik, olc) {
  const sonuc = [];
  for (const s of satirlar) {
    let cur = [];
    const kapat = (son) => { if (cur.length) sonuc.push({ bas: cur[0][1], son, k: cur }); cur = []; };
    s.k.forEach((x, i) => {
      if (cur.length && olc(cur.map((y) => y[0]).concat(x[0]).join(' ')) > genislik) kapat(Math.max(x[1], cur[0][1] + 0.3));
      cur.push(x);
    });
    kapat(s.son);
  }
  return sonuc;
}

export function kendiAkis(kap, { dizin, ekle, girisli, girisGerekli, videolar: ham, kullanici, baslangic }) {
  kap.innerHTML = `
    <div class="kv">
      <a class="kv-link" href="#/video/link">Bağlantıyla aç</a>
      <div class="kv-liste" tabindex="-1"></div>
    </div>`;
  document.body.classList.add('video-tam');
  const liste = kap.querySelector('.kv-liste');
  let videolar = DEPO.sira && DEPO.sira.length === ham.length ? DEPO.sira : (DEPO.sira = sirala(ham));
  if (baslangic) { const k = videolar.findIndex((v) => v.id === baslangic); if (k > 0) videolar = [videolar[k], ...videolar.slice(0, k), ...videolar.slice(k + 1)]; DEPO.sira = videolar; }
  let hiz = hizOku(), basili = false, basiliSon = 0, otoEngelli = false, aktif = -1, satirlar = [], sira = -1, izleyici = null, sayac = 0, gozlemci = null, sesAcik = false, kullaniciDurdu = false, gecisT0 = 0, gecisMs = 0, kayitli = new Set();
  const altyaziOnbellek = new Map();
  liste.style.setProperty('--ust', String(ayOku()));
  const kart = (i) => liste.children[i];
  const vid = (i) => kart(i)?.querySelector('video');
  const durum = (i, m) => { const el = kart(i)?.querySelector('.kv-durum'); if (el) { el.textContent = m || ''; el.hidden = !m; } };
  const ad = () => (kullanici ? kullanici() : '');

  const altyaziAl = (id) => {
    if (altyaziOnbellek.has(id)) return altyaziOnbellek.get(id);
    const yol = '/akis-altyazi/' + id + '.json';   // uygulamada pakette hazır; yoksa sunucudan
    const yerel = fetch(yol).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const p = yerel.then((d) => d || (PAKET ? jsonAl(yol) : null)).then((d) => d || { yok: true });
    altyaziOnbellek.set(id, p); return p;
  };

  const SAKLA_ONCE = 0, SAKLA_SONRA = 1;   // iPhone aynı anda az video çözücü verir: yalnız oynayan + sıradaki video kaynağı bağlı (diğerleri blob olarak bellekte)
  liste.innerHTML = videolar.map((v) => `
    <article class="kv-kart" data-id="${v.id}">
      <div class="kv-sahne">
        <video class="kv-vid" playsinline webkit-playsinline muted loop preload="none" disablepictureinpicture poster="${e(mutlak(v.kapak))}"></video>
        <div class="kv-tap"></div>
        <div class="kv-oyna" hidden aria-hidden="true"><svg viewBox="0 0 24 24" width="40" height="40"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></div>
        <div class="kv-bekle"><i></i></div>
        <div class="kv-yan">
          <button class="kv-dugme kv-kaydet" type="button" aria-label="Kaydet" aria-pressed="false"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/></svg><span>Kaydet</span></button>
          <button class="kv-dugme kv-hiz" type="button" aria-label="Hız"><b>1x</b><span>Hız</span></button>
          <button class="kv-dugme kv-kel" type="button" aria-label="Videodaki kelimeler"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 6h16M4 12h10M4 18h16"/></svg><span>Kelimeler</span></button>
          <button class="kv-dugme kv-paylas" type="button" aria-label="Paylaş"><svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/></svg><span>Paylaş</span></button>
        </div>
        <div class="kv-hizrozet" hidden>2x ▸▸</div>
        <div class="kv-kelpanel" hidden></div>
        <div class="kv-altyazi"><p class="kv-satir" aria-live="off"></p><span class="kv-satir kv-olc" aria-hidden="true"></span></div>
        <div class="kv-sozluk" hidden></div>
        <p class="kv-durum" hidden></p>
      </div>
    </article>`).join('');

  // ——— kaydedilenler ———
  (async () => { kayitli = new Set((await kayitlariOku(ad())).map((v) => v.id)); liste.querySelectorAll('.kv-kaydet').forEach((b) => { const id = b.closest('.kv-kart').dataset.id; b.classList.toggle('acik', kayitli.has(id)); b.setAttribute('aria-pressed', String(kayitli.has(id))); }); })();
  async function kaydetDegistir(id, b) {
    const v = videolar.find((x) => x.id === id); if (!v) return;
    const l = await kayitlariOku(ad()); const var_ = l.some((x) => x.id === id);
    const yeni = var_ ? l.filter((x) => x.id !== id) : [{ id: v.id, baslik: v.baslik, kanal: v.kanal, tur: v.tur, sure: v.sure, mp4: v.mp4, kapak: v.kapak }, ...l];
    await yerelYaz(KAYIT(ad()), yeni);
    if (var_) kayitli.delete(id); else kayitli.add(id);
    b.classList.toggle('acik', !var_); b.setAttribute('aria-pressed', String(!var_));
    durum(aktif, var_ ? 'Kayıtlardan çıkarıldı.' : 'Kaydedildi. Hesap > Kaydedilen videolar.'); const bn = sayac; setTimeout(() => { if (bn === sayac) durum(aktif, ''); }, 1600);
  }

  // ——— indirme + kaynak verme ———
  const idx = (id) => videolar.findIndex((v) => v.id === id);
  function kaynakVer(j) {
    const v = videolar[j], el = vid(j); if (!v || !el || el.dataset.kaynak) return;
    const u = DEPO.blob.get(v.id); if (!u) return;
    el.dataset.kaynak = '1'; el.preload = 'auto'; el.muted = true; el.src = u; el.load();
    if (j === aktif) oynat(j);
    else {   // arkada: sessiz oynat, ilk kare çizilince durdur, başa al (kaydırınca anında açılsın)
      const bitir = () => { el.removeEventListener('playing', bitir); if (vid(aktif) !== el) { try { el.pause(); el.currentTime = 0; } catch { /* yok */ } } el.dataset.hazir = '1'; };
      el.addEventListener('playing', bitir);
      el.play().catch(() => { /* ön yükleme reddedilirse kart etkinleşince normal başlar */ });
    }
  }
  function sakla(i) {   // pencere dışı videoların bellek ve kaynağını bırak
    videolar.forEach((v, j) => {
      const el = vid(j); if (!el) return;
      if (j >= i - SAKLA_ONCE && j <= i + SAKLA_SONRA) return;
      if (j >= i - 2 && j <= i + 4 && !el.dataset.kaynak) return;   // pencere içinde ama kaynağı yok: blob'a dokunma
      if (el.dataset.kaynak) { try { el.pause(); } catch { /* yok */ } el.removeAttribute('src'); el.load(); delete el.dataset.kaynak; delete el.dataset.hazir; delete el.dataset.basladi; }
      const u = DEPO.blob.get(v.id); if (u && (j < i - 2 || j > i + 4) && j !== 0 && j !== 1) { URL.revokeObjectURL(u); DEPO.blob.delete(v.id); }
    });
  }
  function komsulariHazirla(i) {
    DEPO.hedefler = () => [videolar[i], videolar[i + 1], videolar[i + 2], videolar[i + 3], videolar[i - 1]];
    for (let j = i; j <= i + 1; j++) if (videolar[j] && DEPO.blob.has(videolar[j].id)) kaynakVer(j);
    sakla(i);
    isci((v) => { const j = idx(v.id); if (j >= 0 && j >= aktif - 1 && j <= aktif + 3) kaynakVer(j); });
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
  const hizUygula = (el) => { if (!el) return; try { el.defaultPlaybackRate = hiz; el.playbackRate = basili ? 2 : hiz; } catch { /* yok */ } };
  const hizYazi = () => liste.querySelectorAll('.kv-hiz b').forEach((b) => { b.textContent = hiz + 'x'; });
  async function paylas(v) {
    const url = SITE + '/#/video/ac/' + v.id, P = window.Capacitor?.Plugins?.Share;
    try {
      if (P) await P.share({ title: 'Voca', text: v.baslik, url, dialogTitle: 'Paylaş' });
      else if (navigator.share) await navigator.share({ title: 'Voca', text: v.baslik, url });
      else { await navigator.clipboard.writeText(url); durum(aktif, 'Bağlantı kopyalandı.'); const bn = sayac; setTimeout(() => { if (bn === sayac) durum(aktif, ''); }, 1600); }
    } catch { /* kullanıcı iptal etti */ }
  }
  let panelDevam = false;
  function kelPaneliKapat() { const p = kart(aktif)?.querySelector('.kv-kelpanel'); if (p) p.hidden = true; if (panelDevam && !kullaniciDurdu) vid(aktif)?.play().catch(() => {}); panelDevam = false; }
  async function kelPaneliAc(k, v) {   // videodaki öğrenmeye değer kelimeler: kelime + seviye + ilk anlam + ekle
    const p = k.querySelector('.kv-kelpanel'), el = vid(aktif);
    if (!p.hidden) return kelPaneliKapat();
    sozlukKapat(); panelDevam = !!el && !el.paused; try { el?.pause(); } catch { /* yok */ }
    const d = await altyaziAl(v.id), gor = new Set(), satir = [];
    for (const s of (d?.satirlar || [])) s.k.forEach(([w], j) => {
      if (!ogrenmeyeDeger(w, j === 0)) return;
      const kk = kokBul(w.replace(/[^\w'’-]/g, ''), dizin || []); if (!kk || gor.has(kk.k)) return;
      gor.add(kk.k); satir.push(kk);
    });
    p.innerHTML = `<div class="kp-bas"><b>Bu videodaki kelimeler</b><button class="kp-kapat" type="button" aria-label="Kapat">×</button></div>` + (satir.length
      ? `<ul>${satir.slice(0, 40).map((x) => `<li><div><b>${e(x.k)}</b>${x.s ? ` <span class="seviye">${x.s}</span>` : ''}<br><i>${e((x.an?.[0]?.[1]) || x.tr || '')}</i></div><button class="kp-ekle" type="button" data-ekle="${e(x.k)}" aria-label="Listeme ekle">+</button></li>`).join('')}</ul>`
      : '<p class="kp-bos">Bu videoda sözlüğümüzden öğrenmeye değer kelime bulamadım.</p>');
    p.hidden = false;
  }
  function yenidenYukle(el) {   // takılmış video öğesi: kaynağı söküp yeniden bağla (bazen iOS çözücüsü ilk bağlamada takılıyor)
    const u = el.currentSrc || el.src; if (!u) return;
    try { el.pause(); el.removeAttribute('src'); el.load(); el.src = u; el.load(); } catch { /* yok */ }
  }
  function oynat(i) {   // etkin kartın videosu hazırsa sesli başlat (olmazsa sessiz); takılırsa kendini kurtarır
    const el = vid(i), k = kart(i), bn = sayac; if (!el || !k || el.dataset.basladi === String(bn)) return;
    el.dataset.basladi = String(bn);
    if (Math.abs(el.currentTime) > 0.2) { try { el.currentTime = 0; } catch { /* yok */ } }
    const engelle = () => {   // gerçekten engelli (Düşük Güç Modu vb.): spinner KALMAZ, oynat simgesi çıkar
      otoEngelli = true; if (bn !== sayac || el.dataset.kullanici === String(bn)) return;
      k.classList.remove('yukleniyor'); k.classList.add('durdu'); k.dataset.oto = '1'; k.querySelector('.kv-oyna').hidden = false; durum(i, 'Başlatmak için dokun.');
    };
    const dene = (ikinci) => {
      el.muted = false;
      el.play().then(() => { sesAcik = true; }).catch(() => {
        if (bn !== sayac || el.dataset.kullanici === String(bn)) return; el.muted = true;
        el.play().then(() => { if (bn === sayac) durum(i, 'Ses kapalı. Açmak için ekrana dokun.'); }).catch(() => {
          if (bn !== sayac || el.dataset.kullanici === String(bn)) return;
          if (!ikinci) { yenidenYukle(el); setTimeout(() => { if (bn === sayac) dene(true); }, 250); } else engelle();   // önce kaynağı yeniden bağlayıp bir kez daha dene (iOS çözücü takılması)
        });
      });
    };
    hizUygula(el);
    dene(false);
    setTimeout(() => {   // 2,5 sn içinde hâlâ oynamıyorsa (kullanıcı durdurmadıysa, simge yoksa): kaynağı yeniden bağla, bir kez daha
      if (bn !== sayac || !el.paused || kullaniciDurdu || el.dataset.kullanici === String(bn) || k.classList.contains('durdu') || el.dataset.kurtarma === String(bn)) return;
      el.dataset.kurtarma = String(bn); yenidenYukle(el); setTimeout(() => { if (bn === sayac) dene(true); }, 250);
    }, 2500);
    const oynadi = () => { if (bn !== sayac) return; el.removeEventListener('playing', oynadi); gecisMs = Math.round(performance.now() - gecisT0); k.classList.remove('yukleniyor', 'durdu'); delete k.dataset.oto; k.classList.add('oynuyor'); hizUygula(el); const oy = k.querySelector('.kv-oyna'); if (oy) oy.hidden = true; };
    if (!el.paused && el.readyState >= 3) oynadi(); else el.addEventListener('playing', oynadi);
  }
  function etkinles(i) {
    if (i === aktif) return;
    const onceki = aktif;
    if (onceki >= 0) { const o = vid(onceki); if (o) { try { o.muted = true; o.pause(); } catch { /* yok */ } } kart(onceki)?.classList.remove('oynuyor', 'durdu', 'yukleniyor'); const oy = kart(onceki)?.querySelector('.kv-oyna'); if (oy) oy.hidden = true; }
    clearInterval(izleyici); sozlukKapat(); liste.querySelectorAll('.kv-kelpanel').forEach((p) => { p.hidden = true; }); panelDevam = false; basili = false; satirlar = []; sira = -1; kullaniciDurdu = false;
    aktif = i; const bn = ++sayac; const k = kart(i), el = vid(i), v = videolar[i];
    if (!k || !el) return;
    durum(i, ''); gecisT0 = performance.now();
    komsulariHazirla(i);
    if (el.dataset.kaynak) {   // indirilmiş: anında
      oynat(i);
    } else {
      setTimeout(() => { if (bn === sayac && !k.classList.contains('oynuyor') && !k.classList.contains('durdu')) k.classList.add('yukleniyor'); }, 600);   // spinner yalnız 0,6 sn'den uzun beklemede (kısa beklemede titreme yapmasın); indirme bitince kaynakVer → oynat
      setTimeout(() => {   // 7 sn'de inmediyse doğrudan adresten dene (yedek)
        if (bn !== sayac || el.dataset.kaynak) return;
        el.dataset.kaynak = '1'; el.preload = 'auto'; el.muted = true; el.src = mutlak(v.mp4); el.load(); oynat(i);
      }, 7000);
    }
    izleyici = setInterval(tik, 50);
    altyaziAl(v.id).then((d) => { if (bn !== sayac) return; const olcEl = kart(i).querySelector('.kv-olc'); const olc = (t) => { olcEl.textContent = t; return olcEl.getBoundingClientRect().width; }; satirlar = (d && Array.isArray(d.satirlar)) ? tekSatir(d.satirlar, Math.round(liste.clientWidth * 0.66), olc) : []; });
    setTimeout(() => { if (bn === sayac && el.readyState < 3 && !el.error && el.dataset.kaynak) { durum(i, 'Video açılmadı, sonrakine geçiliyor…'); setTimeout(() => { if (bn === sayac) kart(i + 1)?.scrollIntoView({ behavior: 'smooth' }); }, 1500); } }, 14000);
  }

  liste.querySelectorAll('video').forEach((el, i) => {
    el.addEventListener('waiting', () => { if (i === aktif) { const k = kart(i); setTimeout(() => { if (i === aktif && vid(i) === el && el.readyState < 3) k.classList.add('yukleniyor'); }, 350); } });
    el.addEventListener('playing', () => { kart(i).classList.remove('yukleniyor'); });
    el.addEventListener('error', () => { if (i === aktif && el.dataset.kaynak && el.src) { durum(i, 'Video yüklenemedi, sonrakine geçiliyor…'); setTimeout(() => { if (i === aktif) kart(i + 1)?.scrollIntoView({ behavior: 'smooth' }); }, 1500); } });
  });

  gozlemci = new IntersectionObserver((kayitlar) => {
    for (const k of kayitlar) if (k.isIntersecting && k.intersectionRatio >= 0.7) etkinles([...liste.children].indexOf(k.target));
  }, { root: liste, threshold: [0.7] });
  [...liste.children].forEach((k) => gozlemci.observe(k));
  hizYazi(); komsulariHazirla(0);

  // ——— dokunuşlar ———
  const sesiAc = () => { sesAcik = true; const el = vid(aktif); if (el && el.muted) { el.muted = false; durum(aktif, ''); } };   // dokunuş = kullanıcı hareketi: sesi açabiliriz
  liste.addEventListener('touchend', sesiAc, { passive: true });
  let surukleSonu = 0;
  liste.addEventListener('click', (ev) => {
    sesiAc();
    const k = ev.target.closest('.kv-kart'); if (!k) return;
    if (Date.now() - surukleSonu < 350 || Date.now() - basiliSon < 350) { ev.preventDefault(); ev.stopPropagation(); return; }   // sürükleme / basılı tutma (2x) sonrası click yutulur
    const kb = ev.target.closest('.kv-kaydet');
    if (kb) { kaydetDegistir(k.dataset.id, kb); return; }
    const i = [...liste.children].indexOf(k), el = vid(i), v = videolar[i];
    if (ev.target.closest('.kv-hiz')) { hiz = HIZLAR[(HIZLAR.indexOf(hiz) + 1) % HIZLAR.length]; try { localStorage.setItem('voca-hiz', String(hiz)); } catch { /* yok */ } hizYazi(); hizUygula(el); return; }
    if (ev.target.closest('.kv-paylas')) { paylas(v); return; }
    if (ev.target.closest('.kv-kel')) { if (i === aktif) kelPaneliAc(k, v); return; }
    if (ev.target.closest('.kp-kapat')) { kelPaneliKapat(); return; }
    const ke = ev.target.closest('.kp-ekle');
    if (ke) { if (!girisli()) return girisGerekli(); ekle(ke.dataset.ekle).then(() => { ke.textContent = '✓'; ke.disabled = true; }); return; }
    if (ev.target.closest('.kv-kelpanel')) return;
    // 'otomatik başlamadı' durumunda HER dokunuş (altyazı kelimesi dahil) yalnızca videoyu başlatır
    if (i === aktif && k.dataset.oto === '1' && el) {
      el.dataset.kullanici = String(sayac); delete k.dataset.oto; kullaniciDurdu = false; k.classList.remove('durdu'); k.querySelector('.kv-oyna').hidden = true; durum(i, '');
      if (el.readyState < 2 || el.error) yenidenYukle(el);
      el.muted = false; hizUygula(el);
      el.play().catch(() => { el.muted = true; el.play().catch(() => { yenidenYukle(el); setTimeout(() => el.play().catch(() => { k.classList.add('durdu'); k.dataset.oto = '1'; k.querySelector('.kv-oyna').hidden = false; }), 250); }); });
      return;
    }
    const b = ev.target.closest('button.sozcuk');
    if (b && i === aktif) {   // kelimeye dokun: video HEMEN durur (durmuşsa da çalışır), ilk anlam çıkar
      if (b.classList.contains('secik')) { sozlukKapat(); if (!kullaniciDurdu) el?.play().catch(() => {}); return; }
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
      s.querySelector('[data-devam]').onclick = () => { sozlukKapat(); if (!kullaniciDurdu) el?.play().catch(() => {}); else el?.play().then(() => { kullaniciDurdu = false; k.classList.remove('durdu'); k.querySelector('.kv-oyna').hidden = true; }).catch(() => {}); };
      return;
    }
    if (ev.target.closest('.kv-sozluk')) return;
    if (ev.target.closest('.kv-altyazi')) return;
    if (ev.target.closest('.kv-sahne') && i === aktif && el) {
      if (!k.querySelector('.kv-sozluk').hidden) { sozlukKapat(); if (!kullaniciDurdu) { el.play().catch(() => {}); return; } }
      const oy = k.querySelector('.kv-oyna');
      if (el.paused) { kullaniciDurdu = false; oy.hidden = true; k.classList.remove('durdu'); durum(i, ''); if (el.readyState < 2 || el.error) yenidenYukle(el); el.muted = false; el.play().catch(() => { yenidenYukle(el); setTimeout(() => el.play().catch(() => { el.muted = true; el.play().catch(() => { k.classList.add('durdu'); oy.hidden = false; }); }), 200); }); }
      else { kullaniciDurdu = true; el.pause(); oy.hidden = false; k.classList.add('durdu'); delete k.dataset.oto; }   // simge YALNIZ kullanıcı durdurunca; altyazı kelimeleri yine tıklanabilir (simge dokunuşu engellemez)
    }
  });
  liste.addEventListener('scroll', () => { if (liste.querySelector('.kv-sozluk:not([hidden])')) sozlukKapat(); if (liste.querySelector('.kv-kelpanel:not([hidden])')) { liste.querySelectorAll('.kv-kelpanel').forEach((p) => { p.hidden = true; }); panelDevam = false; } }, { passive: true });
  // ——— basılı tut = 2x (TikTok/Instagram gibi), bırakınca eski hıza dön ———
  liste.addEventListener('pointerdown', (ev) => {
    if (!ev.target.closest('.kv-tap')) return;
    const k = ev.target.closest('.kv-kart'), el = vid(aktif);
    if (!el || kart(aktif) !== k || el.paused) return;
    const y0 = ev.clientY, x0 = ev.clientX;
    const z = setTimeout(() => { basili = true; hizUygula(el); const r = k.querySelector('.kv-hizrozet'); if (r) r.hidden = false; }, 380);
    const bit = (m) => {
      if (m.type === 'pointermove' && Math.abs(m.clientY - y0) < 12 && Math.abs(m.clientX - x0) < 12) return;   // küçük titreme
      clearTimeout(z); removeEventListener('pointerup', bit); removeEventListener('pointercancel', bit); removeEventListener('pointermove', bit);
      if (basili) { basili = false; basiliSon = Date.now(); hizUygula(vid(aktif)); k.querySelector('.kv-hizrozet').hidden = true; }
    };
    addEventListener('pointerup', bit); addEventListener('pointercancel', bit); addEventListener('pointermove', bit);
  });

  // ——— altyazıyı aşağı-yukarı sürükleme (Kaydet düğmesi SABİT kalır) ———
  liste.addEventListener('pointerdown', (ev) => {
    const ca = ev.target.closest('.kv-altyazi'); if (!ca) return;
    const h = ca.closest('.kv-sahne').getBoundingClientRect().height;
    const y0 = ev.clientY, u0 = ayOku(); let surukleniyor = false;
    const tasi = (m) => {
      const dy = m.clientY - y0;
      if (!surukleniyor && Math.abs(dy) < 8) return;
      if (!surukleniyor) { surukleniyor = true; ca.classList.add('suruklenen'); }
      m.preventDefault();
      liste.style.setProperty('--ust', String(Math.min(0.88, Math.max(0.1, u0 + dy / h))));
    };
    const bitir = () => {
      removeEventListener('pointermove', tasi); removeEventListener('pointerup', bitir); removeEventListener('pointercancel', bitir);
      if (surukleniyor) { ca.classList.remove('suruklenen'); ayYaz(parseFloat(liste.style.getPropertyValue('--ust'))); surukleSonu = Date.now(); }
    };
    addEventListener('pointermove', tasi, { passive: false }); addEventListener('pointerup', bitir); addEventListener('pointercancel', bitir);   // pencere düzeyinde: parmak satırdan çıksa da sürükleme sürer
  });

  return () => {
    sayac++; clearInterval(izleyici); gozlemci?.disconnect(); document.body.classList.remove('video-tam');
    liste.querySelectorAll('video').forEach((el) => { try { el.pause(); } catch { /* yok */ } el.removeAttribute('src'); el.load(); });
    DEPO.hedefler = () => (DEPO.sira ? DEPO.sira.slice(0, 2) : []);
  };
}
