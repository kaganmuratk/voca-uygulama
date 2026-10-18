// Voca arayüzü: tek sayfa, hash yönlendirme. Ekranlar: giriş · ara (+ toplu ekle) · kelime (öğren) · liste · pratik · geçmiş · hesap.
// Ara ve kelime sayfaları girişsiz de açılır; liste, ekleme ve pratik giriş ister.
import { bicimRegex, kacis } from './bicim.js';
import { klipOynatici } from './klip.js';
import { akisSayfasi, akisIsit } from './akis.js';
import { kendiAkis, akisOnYukle, kayitlariOku } from './akis-kendi.js';
import { yerelOku, yerelYaz } from './yerel.js';
import { ayarOku as hatAyarOku, ayarYaz as hatAyarYaz, hatirlatmaUygula, hatirlatmaVar } from './hatirlatma.js';
import { PAKET, SITE, sunucuAdresi, apiIstek, jetonYaz, jsonAl } from './ortam.js';
import { videoSayfasi } from './video.js';
let klipTemizle = () => {};
const $ = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];
const uyg = $('#uyg');
// web sitesi yalnız sözlük; hesap/liste/pratik/video yalnız uygulamada (Capacitor kabuğu) açılır (Kağan 2026-10-18)
const UYGULAMA = !!window.Capacitor || navigator.userAgent.includes('VocaApp');
// Kağan 2026-10-18: web sitesinde bütün kelimeler tutarlı olsun diye BASİT görünür (yalnız tür + Türkçe anlam). Ayrıntılı veri (tanım, örnek, ses, video) silinmedi,
// (uygulamada da aynı: Kağan 2026-10-18 "şu an ses olmaması gerek, hepsi basit modda") sunucuda duruyor; "ayrıntılı sürümü canlıya al" denince WEB_BASIT = false yap (src/sayfa.js'teki aynı bayrakla birlikte).
const WEB_BASIT = true;
const basitle = (s) => (s.hafif ? s : {
  kelime: s.kelime, ipa: {}, ses: {}, seviye: s.seviye, hafif: true, pv: [], deyimRef: [], deyimler: [], ileri: [], turemis: [],
  anlamlar: s.anlamlar.filter((a, i, l) => a.tr && l.findIndex((x) => x.tr === a.tr) === i).slice(0, 6).map((a, i) => ({ id: 'a' + i, tur: a.tur, turTr: a.turTr, baslik: '', seviye: a.seviye, gram: '', tr: a.tr, tanim: '', ornekler: [], esler: [], enEslesme: '', ornekTr: [], ornekHedef: [] })),
});
document.body.classList.toggle('uygulama', UYGULAMA);
const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const OYNAT = '<svg viewBox="0 0 10 12"><path d="M0 0l10 6-10 6z"/></svg>';

let BEN = null, BEN_BAKILDI = false;

// tema: sistem / açık / koyu (bu cihazda saklanır)
const temaOku = () => { try { return localStorage.getItem('voca-tema') || 'sistem'; } catch { return 'sistem'; } };
function temaUygula(t = temaOku()) {
  const kok = document.documentElement;
  if (t === 'sistem') delete kok.dataset.tema; else kok.dataset.tema = t === 'acik' ? 'acik' : 'koyu';
}
temaUygula();

// ——— sunucu ———
async function istek(yol, { method = 'GET', govde, sessiz } = {}) {
  let sonuc;
  try { sonuc = await apiIstek(yol, { method, govde }); }
  catch (x) { const h = new Error('Bağlantı yok. İnternetini kontrol et.'); h.cevrimdisi = true; throw h; }   // uygulama çevrimdışıyken ham ağ hatası yerine anlaşılır mesaj
  const { durum, veri: v } = sonuc;
  if (v.token) jetonYaz(v.token);            // uygulama: giriş/kayıt jetonu cihazda saklanır
  if (yol === '/cikis') { jetonYaz(''); yerelYaz('ben', null); if (BEN) yerelYaz('liste:' + (BEN.ad || ''), null); }
  if (durum === 401 && !sessiz && yol !== '/giris') { BEN = null; jetonYaz(''); yerelYaz('ben', null); girisGerekli(); throw new Error('giriş'); }
  if (durum < 200 || durum >= 300) throw new Error(v.hata || 'Bir şeyler ters gitti.');
  return v;
}

function bildir(m) {
  const b = $('#bildirim');
  b.textContent = m; b.classList.add('acik');
  clearTimeout(bildir.z); bildir.z = setTimeout(() => b.classList.remove('acik'), 2600);
}
const git = (h) => { if (location.hash === h) yonlendir(); else location.hash = h; };
// misafir bir işlem yapmak isteyince: bulunduğu yeri hatırla, giriş/kayıt ekranına götür, sonra geri getir
function girisGerekli() {
  try { sessionStorage.setItem('voca-sonra', location.hash && location.hash !== '#/giris' ? location.hash : '#/'); } catch {}
  git('#/giris');
}
const yukleniyor = () => { uyg.innerHTML = '<div class="yukleniyor"><i></i></div>'; };

// Kelime listem: sunucudan; çevrimdışıysa (uygulama) son kaydedilen kopya. Başarılı her okuma cihaza yazılır.
async function listeAl() {
  try { const g = await istek('/kelimeler'); yerelYaz('liste:' + (BEN?.ad || ''), g); return g; }
  catch (x) { if (!x.cevrimdisi) throw x; const g = await yerelOku('liste:' + (BEN?.ad || '')); if (g) { listeCevrimdisi = true; return g; } throw x; }
}
let listeCevrimdisi = false;

// ——— sözlük dizini (arama, filtre, öneri) ———
let DIZIN = null;
let SIK = [];
let DIZIN_SOZ = null;
// Uygulamada sözlük cihazda hazır (pakete gömülü /sozluk.json, güncellemesi IndexedDB'de): açılış ağı beklemez, çevrimdışı da çalışır.
// Sitede (sunucudan) eskisi gibi. Arkadan sunucudaki güncel sözlük alınıp bir sonraki açılış için saklanır.
const dizin = () => DIZIN ? Promise.resolve(DIZIN) : (DIZIN_SOZ ||= (async () => {
  if (PAKET) {
    let r = await yerelOku('sozluk');
    if (!r) { try { r = await (await fetch('/sozluk.json')).json(); } catch { r = null; } }
    if (r && Array.isArray(r.kelimeler) && r.kelimeler.length) {
      SIK = r.sik || []; DIZIN = r.kelimeler;
      istek('/sozluk', { sessiz: true }).then((g) => { if (Array.isArray(g.kelimeler) && g.kelimeler.length > 1000) yerelYaz('sozluk', g); }).catch(() => {});
      return DIZIN;
    }
  }
  const r = await istek('/sozluk'); SIK = r.sik || []; return (DIZIN = r.kelimeler);
})());
const SOZLUK_HAS = (w) => DIZIN?.some((x) => x.k === w.toLowerCase());
const SEVIYELER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TURLER = ['isim', 'fiil', 'sıfat', 'zarf', 'phrasal verb', 'kalıp', 'deyim'];

// ——— ses ———
let calan = null;
function sesCal(kelime, bolge, dugme) {
  if (calan) { calan.pause(); $$('.ses.caliyor').forEach((x) => x.classList.remove('caliyor')); }
  if (/\s/.test(kelime) || !kelime) {
    // çok kelimeli ifadelerin Cambridge kaydı yok: tarayıcının sesi
    const u = new SpeechSynthesisUtterance(kelime);
    u.lang = bolge === 'uk' ? 'en-GB' : 'en-US'; u.rate = .9;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    return;
  }
  const sesYol = `/ses/${encodeURIComponent(kelime.replace(/\s+/g, '-'))}-${bolge}.mp3`;
  calan = new Audio(sesYol);   // uygulamada pakette (yerel); sitede sunucudan
  if (PAKET) { const k = calan; k.addEventListener('error', () => { if (calan === k) { calan = new Audio(SITE + sesYol); calan.onended = calan.onerror = () => dugme?.classList.remove('caliyor'); calan.play().catch(() => {}); } }, { once: true }); }
  dugme?.classList.add('caliyor');
  calan.onended = calan.onerror = () => dugme?.classList.remove('caliyor');
  calan.play().catch(() => dugme?.classList.remove('caliyor'));
}

function vurgula(cumle, kelime) {
  const m = cumle.match(bicimRegex(kelime));
  if (!m) return e(cumle);
  return e(cumle.slice(0, m.index)) + '<mark>' + e(m[0]) + '</mark>' + e(cumle.slice(m.index + m[0].length));
}

// ——— yönlendirme ———
// bütün sayfalar girişsiz görülebilir; işlem yapınca giriş istenir
const YOLLAR = [
  // web sitesi yalnız sözlük (Kağan 2026-10-18); bu ekranlar uygulamada (uygulamada kural hiç eklenmez, yoksa ilk eşleşme ekranı boş bırakır)
  ...(UYGULAMA ? [] : [[/^#\/(giris|hesap|liste|pratik|video|gecmis)(\/.*)?$/, () => git('#/ara')]]),

  [/^#\/?$/, () => ara()],
  [/^#\/ara$/, () => ara()],
  [/^#\/ekle$/, () => ara({ ekle: true })],
  [/^#\/liste$/, liste],
  [/^#\/pratik$/, () => { if (pratikDurum.gecis) { pratikDurum.gecis = false; return; } return pratik(); }],
  [/^#\/pratik\/serbest$/, () => git('#/pratik')],
  [/^#\/pratik\/rapor\/(\d+)$/, (m) => pratikRapor(+m[1])],
  [/^#\/gecmis$/, () => git('#/pratik')], // Geçmiş artık Pratik ekranında
  [/^#\/k\/(.+)$/, (m) => ogren(decodeURIComponent(m[1]))],
  [/^#\/video$/, akisAc],
  [/^#\/video\/yt$/, akisAc],
  [/^#\/video\/ac\/([\w-]{11})$/, (m) => akisAc(m[1])],
  [/^#\/video\/link$/, videoAc],
  [/^#\/giris$/, giris],
  [/^#\/hesap$/, hesap],
];
async function yonlendir() {
  let h = location.hash || '#/';
  if (pratikDurum.aktif && !h.startsWith('#/pratik')) pratikDurum.aktif = false;
  klipTemizle(); klipTemizle = () => {};
  if (!BEN_BAKILDI) {
    try { BEN = await istek('/ben', { sessiz: true }); if (BEN) yerelYaz('ben', BEN); }
    catch (x) { BEN = x.cevrimdisi ? await yerelOku('ben') : null; }   // çevrimdışı açılışta son bilinen hesap (liste önbellekten gelir)
    BEN_BAKILDI = true;
  }
  document.body.classList.toggle('misafir', !BEN);
  const ad = h.startsWith('#/hesap') || h.startsWith('#/giris') ? 'hesap' : h.startsWith('#/liste') ? 'liste' : h.startsWith('#/pratik') || h.startsWith('#/gecmis') ? 'pratik' : h.startsWith('#/video') ? 'video' : h.startsWith('#/ara') || h.startsWith('#/ekle') || h === '#/' || h === '#' ? 'ara' : '';
  $$('[data-yol]').forEach((a) => a.classList.toggle('aktif', a.dataset.yol === ad));
  document.body.dataset.sayfa = h.startsWith('#/giris') ? 'giris' : ad;   // renk alanları (stil.css: telefonda sayfa başına bir üst renk)
  document.body.dataset.ekran = '';
  for (const [r, f] of YOLLAR) {
    const m = h.match(r);
    if (m) { window.scrollTo(0, 0); try { await f(m); } catch (x) { if (x.message !== 'giriş') hataGoster(x); } document.body.dataset.ekran = uyg.querySelector('.basliksoz') ? 'kelime' : ''; hosgeldin(); return; }
  }
  git('#/');
}
function hataGoster(x) { uyg.innerHTML = `<div class="dar bos"><h1 class="baslik-l">${e(x.message)}</h1><p><a class="btn hayalet" href="#/">Ana sayfa</a></p></div>`; }
window.addEventListener('hashchange', yonlendir);


// ——— hoş geldin (yalnız ilk girişte, bir kez) ———
function hosgeldin() {
  if (!BEN || $('.karsilama')) return;
  const anahtar = 'voca-hosgeldin-' + BEN.ad;
  try { if (localStorage.getItem(anahtar)) return; } catch { return; }
  const d = document.createElement('div');
  d.className = 'karsilama';
  d.innerHTML = `<div class="karsilama-kutu kart" role="dialog" aria-modal="true" aria-labelledby="hg-b">
    <h2 class="baslik-l" id="hg-b">Hoş geldin.</h2>
    <ol class="adimlar">
      <li><span><b>Ekle.</b> Ara'da kelimeyi bulup ekle; birden fazla kelimeyi topluca da yapıştırabilirsin.</span></li>
      <li><span><b>Öğren.</b> Kelimenin sayfasında anlamlarına, sesine, videolarına bak; pratikte sorulacak anlamları seç.</span></li>
      <li><span><b>Pratik yap.</b> İstediğin kelimelerle, istediğin zaman. Her kelimede ne kadar iyi olduğunu görürsün.</span></li>
    </ol>
    <button class="btn vurgu buyuk" id="hg-tamam">Başla <span class="ok">→</span></button>
  </div>`;
  document.body.appendChild(d);
  const kapat = () => { try { localStorage.setItem(anahtar, '1'); } catch {} d.remove(); };
  $('#hg-tamam').onclick = kapat;
  d.addEventListener('click', (ev) => { if (ev.target === d) kapat(); });
  $('#hg-tamam').focus();
}

// ——— GİRİŞ ———
function giris() {
  if (BEN) return git('#/');
  uyg.innerHTML = `
  <section class="giris">
    <div>
      <h1 class="baslik-l">Giriş</h1>
      <p class="alt-yazi">Kelime eklemek ve pratik yapmak için giriş yap ya da hesap aç.</p>
    </div>
    <form class="kart" id="gform" novalidate>
      <div class="sekme" role="tablist">
        <button type="button" class="aktif" data-k="giris">Giriş</button>
        <button type="button" data-k="kayit">Hesap aç</button>
      </div>
      <label class="alan"><span>E-posta</span><input class="girdi" name="ad" type="email" autocomplete="email" required maxlength="120" autocapitalize="none" spellcheck="false" inputmode="email"></label>
      <label class="alan"><span>Parola</span><input class="girdi" name="parola" type="password" autocomplete="current-password" required minlength="8"><small class="kayit-not" hidden>En az 8 karakter.</small></label>
      <p class="hata-yazi" id="ghata"></p>
      <button class="btn vurgu buyuk" type="submit"><span id="gyazi">Giriş yap</span> <span class="ok">→</span></button>
    </form>
  </section>`;
  let kip = 'giris';
  $$('.sekme button').forEach((b) => b.onclick = () => {
    kip = b.dataset.k;
    $$('.sekme button').forEach((x) => x.classList.toggle('aktif', x === b));
    $('#gyazi').textContent = kip === 'giris' ? 'Giriş yap' : 'Hesap aç';
    $('.kayit-not').hidden = kip === 'giris';
    $('[name=parola]').autocomplete = kip === 'giris' ? 'current-password' : 'new-password';
  });
  $('#gform').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    $('#ghata').textContent = '';
    try {
      BEN = await istek('/' + kip, { method: 'POST', govde: { ad: f.get('ad'), parola: f.get('parola') } });
      let sonra = '#/'; try { sonra = sessionStorage.getItem('voca-sonra') || '#/'; sessionStorage.removeItem('voca-sonra'); } catch {}
      git(sonra);
    } catch (x) { $('#ghata').textContent = x.message; }
  };
}

// ——— HESAP (ayarlar) ———
async function hesap() {
  if (!BEN) return giris();
  const tema = temaOku();
  uyg.innerHTML = `
  <div class="dar hesap">
    <h1 class="baslik-l">Hesap</h1>

    <section class="ayar-grup">
      <div class="bolum-bas"><h2>Görünüm</h2></div>
      <div class="ayar-satir"><div class="ayar-ad"><b>Tema</b></div><select class="btn hayalet kucuk secim-dugme" id="tema" aria-label="Tema">${[['sistem', 'Sistem'], ['acik', 'Açık'], ['koyu', 'Koyu']].map(([k, ad]) => `<option value="${k}" ${k === tema ? 'selected' : ''}>${ad}</option>`).join('')}</select></div>
      <div class="ayar-satir"><div class="ayar-ad"><b>Tanıtım ekranları</b><span>İlk girişteki anlatımlar</span></div><button class="btn hayalet kucuk" id="rehber">Göster</button></div>
      ${PAKET && hatirlatmaVar() ? `<div class="ayar-satir"><div class="ayar-ad"><b>Günlük hatırlatma</b><span>Her gün bu saatte bildirim</span></div><input type="time" class="btn hayalet kucuk" id="hatSaat" value="${String(hatAyarOku().saat).padStart(2, '0')}:${String(hatAyarOku().dakika).padStart(2, '0')}" aria-label="Hatırlatma saati"><button class="btn ${hatAyarOku().acik ? '' : 'hayalet'} kucuk" id="hatAc">${hatAyarOku().acik ? 'Açık' : 'Kapalı'}</button></div>` : ''}
    </section>

    <section class="ayar-grup">
      <div class="bolum-bas"><h2>Kaydedilen videolar</h2></div>
      <div id="kayitSirasi" class="kayit-sirasi"><p class="kayit-bos">Yükleniyor…</p></div>
    </section>

    <section class="ayar-grup">
      <div class="bolum-bas"><h2>Giriş bilgileri</h2></div>
      <div class="ayar-satir acilir" id="aEposta">
        <div class="ayar-ad"><b>E-posta</b><span>${e(BEN.ad)}</span></div><button class="btn hayalet kucuk ac">Değiştir</button>
        <form class="ayar-form" hidden>
          <input class="girdi" name="yeni" type="email" autocomplete="email" placeholder="Yeni e-posta" required>
          <input class="girdi" name="parola" type="password" autocomplete="current-password" placeholder="Mevcut parola" required>
          <div class="ayar-eylem"><button class="btn kucuk" type="submit">Kaydet</button><button class="btn hayalet kucuk kapa" type="button">Vazgeç</button></div><p class="hata-yazi"></p>
        </form>
      </div>
      <div class="ayar-satir acilir" id="aParola">
        <div class="ayar-ad"><b>Parola</b></div><button class="btn hayalet kucuk ac">Değiştir</button>
        <form class="ayar-form" hidden>
          <input class="girdi" name="parola" type="password" autocomplete="current-password" placeholder="Mevcut parola" required>
          <input class="girdi" name="yeni" type="password" autocomplete="new-password" placeholder="Yeni parola (en az 8 karakter)" required minlength="8">
          <p>Değiştirince diğer cihazlardaki oturumlar kapanır.</p>
          <div class="ayar-eylem"><button class="btn kucuk" type="submit">Kaydet</button><button class="btn hayalet kucuk kapa" type="button">Vazgeç</button></div><p class="hata-yazi"></p>
        </form>
      </div>
    </section>

    <section class="ayar-grup">
      <div class="bolum-bas"><h2>Veriler</h2></div>
      <div class="ayar-satir"><div class="ayar-ad"><b>Verilerini indir</b><span>Kelimeler ve pratik geçmişi</span></div>${PAKET ? '' : '<a class="btn hayalet kucuk" href="/api/hesap/veri" download>İndir</a>'}</div>
      <div class="ayar-satir"><div class="ayar-ad"><b>Oturum</b><span>Bu cihazda</span></div><button class="btn hayalet kucuk" id="cikis">Çıkış yap</button></div>
    </section>

    <section class="ayar-sil acilir" id="aSil">
      <button class="metin-dugme sil-bag ac">Hesabı sil</button>
      <form class="ayar-form" hidden>
        <p>Hesabın, kelimelerin ve pratik geçmişin kalıcı olarak silinir. Onaylamak için parolanı yaz.</p>
        <input class="girdi" name="parola" type="password" autocomplete="current-password" placeholder="Mevcut parola" required>
        <div class="ayar-eylem"><button class="btn sil kucuk" type="submit">Hesabı kalıcı olarak sil</button><button class="btn hayalet kucuk kapa" type="button">Vazgeç</button></div><p class="hata-yazi"></p>
      </form>
    </section>
  </div>`;
  $('#tema').onchange = (ev) => { try { localStorage.setItem('voca-tema', ev.target.value); } catch {} temaUygula(ev.target.value); };
  kayitlariOku(BEN.ad).then((l) => {
    const kutu = $('#kayitSirasi'); if (!kutu) return;
    kutu.innerHTML = l.length
      ? l.map((v) => `<a class="kayit-kart" href="#/video/ac/${v.id}"><img src="${e(sunucuAdresi(v.kapak))}" alt="" loading="lazy"><span>${e(v.baslik)}</span></a>`).join('')
      : '<p class="kayit-bos">Henüz video kaydetmedin. Video akışında Kaydet düğmesine dokun.</p>';
  });
  if ($('#hatAc')) {
    const uygula = async (ayar) => { const r = await hatirlatmaUygula(ayar).catch((x) => ({ tamam: false, mesaj: x.message })); bildir(r.mesaj); if (!r.tamam) { ayar.acik = false; } hatAyarYaz(ayar); $('#hatAc').textContent = ayar.acik ? 'Açık' : 'Kapalı'; $('#hatAc').classList.toggle('hayalet', !ayar.acik); };
    $('#hatAc').onclick = () => uygula({ ...hatAyarOku(), acik: !hatAyarOku().acik });
    $('#hatSaat').onchange = (ev) => { const [s, d] = ev.target.value.split(':').map(Number); if (Number.isFinite(s)) uygula({ ...hatAyarOku(), saat: s, dakika: d || 0, acik: hatAyarOku().acik }); };
  }
  $('#rehber').onclick = () => {
    try { localStorage.removeItem('voca-hosgeldin-' + BEN.ad); localStorage.removeItem('voca-pratik-nasil'); } catch {}
    bildir('Tanıtım ekranları yeniden gösterilecek.'); hosgeldin();
  };
  $('#cikis').onclick = async () => { await istek('/cikis', { method: 'POST' }).catch(() => {}); BEN = null; bildir('Çıkış yapıldı.'); git('#/'); };
  // satır içinde açılan formlar
  $$('.acilir').forEach((sat) => {
    const f = $('form', sat), ac = $('.ac', sat);
    ac.onclick = () => { f.hidden = false; ac.hidden = true; sat.classList.add('acik'); $('input', f).focus(); };
    $('.kapa', sat).onclick = () => { f.reset(); f.hidden = true; ac.hidden = false; sat.classList.remove('acik'); $('.hata-yazi', f).textContent = ''; };
  });
  const form = (id, yol, sonra, sor) => {
    $(id + ' form').onsubmit = async (ev) => {
      ev.preventDefault();
      if (sor && !window.confirm(sor)) return;
      const h = $(id + ' .hata-yazi'); h.textContent = '';
      try { const r = await istek(yol, { method: 'POST', govde: Object.fromEntries(new FormData(ev.target)), sessiz: true }); sonra(r, ev.target); }
      catch (x) { h.textContent = x.message; }
    };
  };
  form('#aEposta', '/hesap/eposta', (r) => { BEN.ad = r.ad; bildir('E-posta değişti.'); hesap(); });
  form('#aParola', '/hesap/parola', (r, f) => { f.reset(); $('#aParola .kapa').click(); bildir('Parola değişti. Diğer cihazlardaki oturumlar kapandı.'); });
  form('#aSil', '/hesap/sil', () => { BEN = null; bildir('Hesabın silindi.'); git('#/'); }, 'Hesabın ve bütün verilerin kalıcı olarak silinecek. Emin misin?');
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
// ——— etiketler: bir kelime birden fazla etikette olabilir (Kağan, 2026-10-15) ———
const tumEtiketler = (l) => [...new Set(l.flatMap((k) => k.etiketler || []))].sort((a, b) => a.localeCompare(b, 'tr'));
const etikette = (k, x) => (k.etiketler || []).includes(x);
// var olan etiketler düğme olarak; "+ Yeni etiket" ile yenisi. secili: Set (yerinde değişir), degis: her değişimde
function etiketSecici(kap, tum, secili, degis = () => {}, { yeni: yeniVar = true } = {}) {
  const ciz = (yeniAcik = false) => {
    kap.innerHTML = `<div class="etiket-sec">${tum.map((x) => `<button type="button" class="etiket-cip ${secili.has(x) ? 'secili' : ''}" data-x="${e(x)}" aria-pressed="${secili.has(x)}">${e(x)}</button>`).join('')}
      ${yeniAcik || !yeniVar ? '' : `<button type="button" class="etiket-cip yeni">+ Yeni etiket</button>`}</div>
      ${yeniAcik ? `<div class="yeni-etiket"><input class="girdi" maxlength="60" placeholder="Etiket adı" aria-label="Yeni etiket"><button type="button" class="btn kucuk">Ekle</button></div>` : ''}`;
    $$('.etiket-cip[data-x]', kap).forEach((b) => b.onclick = () => { const x = b.dataset.x; secili.has(x) ? secili.delete(x) : secili.add(x); ciz(); degis(); });
    const y = $('.etiket-cip.yeni', kap); if (y) y.onclick = () => { ciz(true); $('.yeni-etiket input', kap).focus(); };
    const g = $('.yeni-etiket input', kap);
    if (g) {
      const ekle = () => { const x = g.value.trim().slice(0, 60); if (x) { if (!tum.includes(x)) tum.push(x); secili.add(x); degis(); } ciz(); };
      $('.yeni-etiket .btn', kap).onclick = ekle;
      g.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ekle(); } if (ev.key === 'Escape') ciz(); };
    }
  };
  ciz();
}
// alttan açılan küçük panel (telefonda başparmak hizasında)
function altPanel(html) {
  const o = document.createElement('div');
  o.className = 'karsilama alt-panel-arka';
  o.innerHTML = `<div class="alt-panel kart" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(o);
  const kapat = () => o.remove();
  o.addEventListener('click', (ev) => { if (ev.target === o) kapat(); });
  return { o, kapat };
}

// durum: yalnız "inceleniyor" (sözlükte yok) gösterilir; öğrenilmedi/pratikte ayrımı kalktı (Kağan, 2026-10-15)
const DURUM_AD = { bekliyor: 'inceleniyor' };
const durumSinif = (d) => (d === 'pratik' ? 'pratikte' : d); // "pratik" sınıfı pratik ekranına ait
function satir(k) {
  const durum = durumSinif(k.durum);
  const sag = skorOf(k) != null ? `<span class="${skorSinif(skorOf(k))}">%${skorOf(k)}</span>` : '';
  return `<a class="satir" href="#/k/${encodeURIComponent(k.kelime)}">
    <div><div class="k">${e(k.kelime)}</div><div class="t">${k.tr ? e(k.tr) : ''}${k.etiketler?.length ? ` · <span class="etiket-k">${e(k.etiketler.join(', '))}</span>` : ''}</div></div>
    <div class="sag">${sag}${k.durum === 'bekliyor' ? `<span class="durum ${durum}">${DURUM_AD[k.durum]}</span>` : ''}<span class="ok">→</span></div>
  </a>`;
}

// ——— sözlük listesi (Ara'da): arama + seviye/tür/durum filtresi aynı satırda ———
const ARA_SIMGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>';
async function sozlukListesi(kap, { odak = false, baslangic = '' } = {}) {
  const d = await dizin();
  const benim = BEN ? new Map((await listeAl()).kelimeler.map((k) => [k.kelime, k])) : new Map();
  const f = { q: baslangic, s: '', t: '', d: '' };
  kap.innerHTML = `
    <div class="arama">
      <label class="arama-kutu">${ARA_SIMGE}<input class="arama-girdi" type="search" placeholder="Kelime ya da Türkçesi" value="${e(baslangic)}" autocapitalize="none" spellcheck="false" aria-label="Sözlükte ara"></label>
      <select class="secici" data-f="s" aria-label="Seviye"><option value="">Her seviye</option>${SEVIYELER.map((x) => `<option>${x}</option>`).join('')}</select>
      <select class="secici" data-f="t" aria-label="Tür"><option value="">Her tür</option>${TURLER.filter((t) => d.some((x) => x.t.includes(t))).map((x) => `<option>${x}</option>`).join('')}</select>
      ${BEN ? `<select class="secici" data-f="d" aria-label="Listemde"><option value="">Hepsi</option><option value="var">Listemde</option><option value="yok">Listemde değil</option></select>` : ''}
    </div>
    <div class="satirlar sozluk-sonuc"></div>`;
  const sonuc = $('.sozluk-sonuc', kap);
  const vitrin = (() => { // açılışta bir kez karıştırılır, yazarken/eklerken değişmez
    const harita = new Map(d.map((x) => [x.k, x])), havuz = SIK.slice();
    for (let i = havuz.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [havuz[i], havuz[j]] = [havuz[j], havuz[i]]; }
    return havuz.slice(0, 40).map((k) => harita.get(k)).filter(Boolean);
  })();
  const ciz = () => {
    const q = f.q.trim().toLowerCase();
    let r = d.filter((x) => (!f.s || x.s === f.s) && (!f.t || x.t.includes(f.t)) && (!f.d || (f.d === 'var') === benim.has(x.k)));
    if (!q && !f.s && !f.t && !f.d && SIK.length) { // ilk ekran: sık kullanılan kelimelerden karışık seçki (her açılışta farklı)
      r = vitrin;
    } else if (q) r = r.filter((x) => x.k.includes(q) || x.tr.toLowerCase().includes(q)).sort((a, b) => (b.k.startsWith(q) - a.k.startsWith(q)) || a.k.localeCompare(b.k));
    sonuc.innerHTML = r.length ? r.slice(0, 60).map((x) => {
      const b = benim.get(x.k);
      return `<div class="satir sozluk-satir">
        <a href="#/k/${encodeURIComponent(x.k)}" class="satir-bag"><div class="k">${e(x.k)}</div><div class="t">${e(x.tr)}</div></a>
        <div class="sag">${x.s ? `<span class="seviye">${x.s}</span>` : ''}<span class="tur-k">${e(x.t.filter((t) => t !== 'deyim').join(' · '))}</span>
          ${b ? `<span class="durum ${durumSinif(b.durum)}">listende</span>` : `<button class="ekle-dugme" data-k="${e(x.k)}" aria-label="${e(x.k)} listeme ekle">+</button>`}</div>
      </div>`;
    }).join('') : `<div class="bos"><p>Sözlükte yok${q ? `: <b>${e(q)}</b>` : ''}.${q && !f.s && !f.t && !f.d ? ` <a href="#/ekle" id="yineEkle">İnceleme iste →</a>` : ''}</p></div>`;
    $$('.ekle-dugme', sonuc).forEach((b) => b.onclick = async () => {
      if (!BEN) return girisGerekli();
      b.disabled = true;
      const r = await istek('/kelimeler', { method: 'POST', govde: { kelimeler: [b.dataset.k] } });
      benim.set(b.dataset.k, { durum: 'yeni' }); ciz();
      etiketPaneli(r.eklenen[0]?.id, b.dataset.k, [...benim.values()]);
    });
    if ($('#yineEkle')) $('#yineEkle').onclick = () => { try { sessionStorage.setItem('voca-ekle', q); } catch {} };
  };
  $('.arama-girdi', kap).oninput = (ev) => { f.q = ev.target.value; ciz(); };
  $$('[data-f]', kap).forEach((x) => x.onchange = () => { f[x.dataset.f] = x.value; ciz(); });
  ciz();
  if (odak) $('.arama-girdi', kap).focus();
}

// tek kelime eklendikten sonra: "listene eklendi" + isteğe bağlı etiket
function etiketPaneli(id, ad, liste) {
  if (!id) return;
  const tum = tumEtiketler(liste), secili = new Set();
  const { o, kapat } = altPanel(`<h2 class="alt-panel-bas"><b>${e(ad)}</b> listene eklendi</h2><p class="alt-panel-not">Etiket ver (isteğe bağlı)</p><div id="epSec"></div><div class="pa-eylem"><button class="btn vurgu" id="epTamam">Tamam</button></div>`);
  etiketSecici($('#epSec', o), tum, secili);
  $('#epTamam', o).onclick = async () => {
    if (secili.size) await istek('/kelimeler/' + id, { method: 'PATCH', govde: { etiketler: [...secili] } }).catch((x) => bildir(x.message));
    kapat(); bildir(secili.size ? 'Etiket verildi.' : `${ad} listene eklendi.`);
  };
}

// ——— ARA: sözlükte arama; "Birden fazla kelime ekle" ayrı bir düğmeyle açılır ———
async function ara({ ekle: topluAcik = false } = {}) {
  yukleniyor();
  await dizin();
  let hazir = ''; try { hazir = sessionStorage.getItem('voca-ekle') || ''; sessionStorage.removeItem('voca-ekle'); } catch {}
  if (hazir) topluAcik = true;
  uyg.innerHTML = `
  <div class="liste-ust"><h1 class="baslik-l">Ara</h1><button class="toplu-bag" id="topluBtn" aria-expanded="false"><i aria-hidden="true">+</i><span>Toplu ekle</span></button></div>
  <div id="toplu" hidden></div>
  <section id="sozluk" class="ara-sozluk"></section>`;
  const toplu = $('#toplu'), btn = $('#topluBtn');
  const ac = async (acik) => {
    toplu.hidden = !acik; btn.setAttribute('aria-expanded', acik); btn.classList.toggle('acik', acik); $('span', btn).textContent = acik ? 'Kapat' : 'Toplu ekle'; $('i', btn).textContent = acik ? '×' : '+';
    if (acik && !toplu.innerHTML) await topluEkle(toplu, hazir);
    if (acik) $('#eform textarea')?.focus();
  };
  btn.onclick = () => ac(toplu.hidden);
  await sozlukListesi($('#sozluk'), { odak: !topluAcik && !matchMedia('(hover: none)').matches });
  if (topluAcik) await ac(true);
}

// toplu ekleme: yapıştır → onay → ekle
async function topluEkle(kap, hazir = '') {
  const l = BEN ? await listeAl() : { kelimeler: [] };
  const etiketler = tumEtiketler(l.kelimeler), etSecili = new Set();
  kap.innerHTML = `
  <div class="ekle-izgara">
    <form class="kart" id="eform">
      <label class="alan"><span>Kelimeler · her satıra bir tane</span><textarea class="metin" name="metin" placeholder="coherent&#10;take into account&#10;inevitable" autocapitalize="none" spellcheck="false" required>${e(hazir)}</textarea></label>
      <div class="alan"><span>Etiket · isteğe bağlı</span><div id="topluEt"></div></div>
      <div><button class="btn vurgu" type="submit">Devam <span class="ok">→</span></button></div>
    </form>
    <div id="onay" hidden></div>
  </div>`;
  const form = $('#eform');
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const metin = form.metin.value.trim(); if (!metin) return form.metin.focus();
    const { ogeler } = await istek('/kontrol', { method: 'POST', govde: { metin } });
    onayGoster(ogeler, [...etSecili]);
  };
  etiketSecici($('#topluEt'), etiketler, etSecili);
}

function onayGoster(ogeler, etiketler) {
  const kutu = $('#onay'); kutu.hidden = false; $('#eform').hidden = true;
  // her öğe: { girdi, kelime (sözlükte), secilen (eklenecek ad), dahil }
  const S = ogeler.map((o) => ({ ...o, secilen: o.kelime, dahil: !o.listede }));
  const ciz = () => {
    const var_ = S.filter((o) => o.kelime && !o.listede);
    const yok = S.filter((o) => !o.kelime);
    const listede = S.filter((o) => o.kelime && o.listede);
    const sayi = S.filter((o) => o.dahil && (o.secilen || o.istek)).length;
    kutu.innerHTML = `<div class="kart onay">
      ${var_.length ? `<div class="bolum-bas"><h2>Eklenecek</h2><span class="sayi">${var_.length}</span></div>
        ${var_.map((o) => `<label class="onay-satir"><input type="checkbox" class="sec" data-i="${S.indexOf(o)}" ${o.dahil ? 'checked' : ''}><span class="k">${e(o.kelime)}</span><span class="t">${e(o.tr)}${o.girdi.toLowerCase() !== o.kelime ? ` <span class="etiket-k">· ${e(o.girdi)} → ${e(o.kelime)}</span>` : ''}</span></label>`).join('')}` : ''}
      ${yok.length ? `<div class="bolum-bas" style="margin-top:22px"><h2>Sözlükte yok</h2><span class="sayi">${yok.length}</span></div>
        ${yok.map((o) => { const i = S.indexOf(o); return `<div class="onay-yok">
          <div class="k">${e(o.girdi)}</div>
          <div class="cipler">${o.oneriler.map((w) => `<button type="button" class="cip ${o.secilen === w ? 'secili' : ''}" data-i="${i}" data-w="${e(w)}">${o.secilen === w ? '✓ ' : 'Bunu mu demek istedin: '}<b>${e(w)}</b></button>`).join('')}
            <button type="button" class="cip ${o.istek ? 'secili' : ''}" data-i="${i}" data-istek="1">${o.istek ? '✓ ' : ''}İnceleme iste</button>
            <button type="button" class="cip ${!o.dahil ? 'secili' : ''}" data-i="${i}" data-cikar="1">Ekleme</button></div>
          ${o.istek ? `<div class="istek-form">
            <p>Bu kelime sözlüğümüzde yok. İnceleyip doğrulayınca ekleyeceğiz; o zamana kadar listende "inceleniyor" olarak durur. Yardımcı olmak istersen:</p>
            <input class="girdi" data-i="${i}" data-alan="cumle" maxlength="400" placeholder="Nerede gördün? (cümle, isteğe bağlı)" value="${e(o.cumle || '')}">
            <input class="girdi" data-i="${i}" data-alan="anlam" maxlength="300" placeholder="Sence ne anlama geliyor? (isteğe bağlı)" value="${e(o.anlam || '')}">
          </div>` : ''}
        </div>`; }).join('')}` : ''}
      ${listede.length ? `<p class="etiket-k" style="margin-top:18px">Zaten listende: ${listede.map((o) => e(o.kelime)).join(', ')}</p>` : ''}
      <div class="onay-eylem"><button type="button" class="btn hayalet" id="geri">← Düzenle</button><button type="button" class="btn vurgu" id="onayla" ${sayi ? '' : 'disabled'}>${sayi} kelimeyi ekle</button></div>
    </div>`;
    $$('.onay-satir .sec', kutu).forEach((c) => c.onchange = () => { S[c.dataset.i].dahil = c.checked; ciz(); });
    $$('[data-w]', kutu).forEach((b) => b.onclick = () => { const o = S[b.dataset.i]; o.secilen = o.secilen === b.dataset.w ? null : b.dataset.w; o.istek = false; o.dahil = true; ciz(); });
    $$('[data-istek]', kutu).forEach((b) => b.onclick = () => { const o = S[b.dataset.i]; o.secilen = null; o.istek = !o.istek; o.dahil = true; ciz(); });
    $$('[data-cikar]', kutu).forEach((b) => b.onclick = () => { const o = S[b.dataset.i]; o.dahil = false; o.secilen = null; o.istek = false; ciz(); });
    $$('[data-alan]', kutu).forEach((g) => g.oninput = () => { S[g.dataset.i][g.dataset.alan] = g.value; });
    $('#geri').onclick = () => { kutu.hidden = true; $('#eform').hidden = false; };
    $('#onayla').onclick = async () => {
      if (!BEN) { try { sessionStorage.setItem('voca-ekle', S.filter((o) => o.dahil).map((o) => o.secilen || o.girdi).join('\n')); } catch {} return girisGerekli(); }
      const liste = S.filter((o) => o.dahil && o.secilen).map((o) => o.secilen);
      const istekler = S.filter((o) => o.dahil && o.istek && !o.secilen);
      const pratik = true;
      const r = liste.length ? await istek('/kelimeler', { method: 'POST', govde: { kelimeler: liste, etiketler, pratik } }) : { eklenen: [] };
      for (const o of istekler) await istek('/istek', { method: 'POST', govde: { kelime: o.girdi, cumle: o.cumle || '', anlam: o.anlam || '', etiketler } });
      const sozlukte = r.eklenen.filter((x) => x.sozlukte);
      kutu.innerHTML = `<div class="kart onay">
        <h2 class="baslik-l">${sozlukte.length} kelime eklendi.</h2>
        ${istekler.length ? `<p class="etiket-k" style="margin-top:8px">${istekler.length} kelime incelemeye gönderildi.</p>` : ''}
        <div class="onay-eylem">${sozlukte.length ? `<a class="btn vurgu" href="#/pratik">Pratiğe başla <span class="ok">→</span></a>` : ''}<a class="btn hayalet" href="#/liste">Kelimelerim</a><button class="btn hayalet" id="yeniden">Başka ekle</button></div>
      </div>`;
      $('#yeniden').onclick = () => { $('#onay').hidden = true; $('#eform').hidden = false; $('#eform').reset(); $('#eform textarea').focus(); };
    };
  };
  ciz();
}

// ——— ÖĞREN (kelime sayfası; girişsiz de açılır) ———
const ORIN = { tr: 'Türkçe karşılık', ornek: 'örnek cümle', tanim: 'tanım' };
// Kağan (2026-10-15): Orin etiketi arayüzde gösterilmez; işaret veride (orin alanı) kalır, rapor Kağan'a ayrıca verilir.
const orinIsaret = (x) => false && x.orin?.length ? `<span class="orin" title="${e(x.orin.map((a) => ORIN[a]).join(', '))} Orin tarafından eklendi ya da düzeltildi${x.trCambridge ? ' · önceki karşılık: ' + x.trCambridge : ''}">orin</span>` : '';



async function ogren(ad) {
  yukleniyor();
  await dizin();
  let { sozluk: s, benim: b, klipler = [] } = await istek('/kelime/' + encodeURIComponent(ad));
  if (s && WEB_BASIT) { s = basitle(s); klipler = []; }
  if (!s) {
    uyg.innerHTML = `<a class="geri" href="#/liste">← Kelimelerim</a>
      <div class="ogren-bas"><div><h1 class="basliksoz">${e(ad)}<span class="nokta">.</span></h1></div></div>
      <div class="dar bos"><p class="alt-yazi">${b ? 'İnceleniyor. Sözlüğe eklenince kartı burada açılır.' : 'Bu kelime sözlükte yok.'}</p>
      ${b ? '<p style="margin-top:24px"><button class="btn hayalet" id="kaldir">Listemden çıkar</button></p>' : ''}</div>`;
    if (b) $('#kaldir').onclick = async () => { await istek('/kelimeler/' + b.id, { method: 'DELETE' }); bildir('Çıkarıldı.'); git('#/liste'); };
    return;
  }
  const secim = new Set(b?.secim || []);
  const turler = [...new Set(s.anlamlar.map((a) => a.turTr))].filter(Boolean);
  // tür ve seviye üstte yazılı; anlamın yanında yalnız üsttekinden farklıysa gösterilir
  const turGoster = (a) => a.turTr && (turler.length > 1 || a.turTr !== turler[0]);
  const seviyeGoster = (a) => a.seviye && a.seviye !== s.seviye;
  const cok = /\s/.test(s.kelime);
  // örnekler (en fazla 3): Türkçesi varsa baştaki çizgiye dokununca satır Türkçeye döner, çizgi + olur (Kağan, 2026-10-15)
  const trVurgula = (t, h) => {
    const p = (h || '').split(' ... ')[0]; if (!p) return e(t);
    const i = t.toLocaleLowerCase('tr').indexOf(p.toLocaleLowerCase('tr'));
    return i < 0 ? e(t) : e(t.slice(0, i)) + '<mark>' + e(t.slice(i, i + p.length)) + '</mark>' + e(t.slice(i + p.length));
  };
  const ornekListe = (a) => !a.ornekler.length ? '' : `<ul class="ornekler">${a.ornekler.map((o, i) => {
    const t = a.ornekTr?.[i];
    return t ? `<li class="ceviri-var" data-en="${e(vurgula(o, s.kelime))}" data-tr="${e(trVurgula(t, a.ornekHedef?.[i]))}"><button class="ornek-dug" type="button" aria-label="Türkçesini göster">–</button><span class="ornek-metin">${vurgula(o, s.kelime)}</span></li>`
      : `<li>${vurgula(o, s.kelime)}</li>`;
  }).join('')}</ul>`;
  const anlamHtml = (a, i, deyim) => `
    <article class="anlam ${secim.has(a.id) ? 'secili' : ''}" data-id="${a.id}">
      <div>${b ? `<input type="checkbox" class="sec" aria-label="Bu anlamı öğren" ${secim.has(a.id) ? 'checked' : ''}>` : `<span class="no">${String(i + 1).padStart(2, '0')}</span>`}</div>
      <div>
        <div class="ust-bilgi">${[b ? `<span>${String(i + 1).padStart(2, '0')}</span>` : '', deyim ? '<span>deyim · kalıp</span>' : turGoster(a) ? `<span>${e(a.turTr)}</span>` : '', a.baslik ? `<span lang="en">${e(a.baslik.toLowerCase())}</span>` : ''].filter(Boolean).join('<span class="ayrac">·</span>')}${seviyeGoster(a) ? `<span class="seviye">${a.seviye}</span>` : ''}${orinIsaret(a)}</div>
        ${deyim ? `<div class="ifade">${e(a.ifade)}</div>` : ''}
        <p class="tr">${e(a.tr)}</p>
        ${a.tanim ? `<p class="tanim">${e(a.tanim)}</p>` : ''}
        ${a.esler?.length ? `<div class="esler"><span class="esler-ad">Eş anlamlı</span><span class="esler-k">${a.esler.map((x) => SOZLUK_HAS(x) ? `<a href="#/k/${encodeURIComponent(x)}" lang="en">${e(x)}</a>` : `<span lang="en">${e(x)}</span>`).join('')}</span></div>` : ''}
        ${ornekListe(a)}
      </div>
    </article>`;
  const seslerHtml = cok
    ? `<button class="ses" data-b="uk"><span class="oynat">${OYNAT}</span><b>UK</b><span>sentetik</span></button><button class="ses" data-b="us"><span class="oynat">${OYNAT}</span><b>US</b><span>sentetik</span></button>`
    : ['uk', 'us'].filter((x) => s.ipa[x] || s.ses[x]).map((x) => `<button class="ses" data-b="${x}"><span class="oynat">${OYNAT}</span><b>${x.toUpperCase()}</b><span>/${e(s.ipa[x])}/</span></button>`).join('');
  uyg.innerHTML = `
  <a class="geri" href="${b ? '#/liste' : '#/ara'}">← ${b ? 'Kelimelerim' : 'Ara'}</a>
  <header class="ogren-bas">
    <div>
      <div class="turler"><span class="ust-tur">${turler.map(e).join(' · ') || 'kalıp'}</span>${s.seviye ? `<span class="seviye">${s.seviye}</span>` : ''}</div>
      <h1 class="basliksoz">${e(s.kelime)}<span class="nokta">.</span></h1>
      ${seslerHtml ? `<div class="sesler">${seslerHtml}</div>` : ''}
    </div>
    <div class="listede">
      ${b ? `        ${b.etiketler?.length ? `<span class="etiket-k">${e(b.etiketler.join(', '))}</span>` : ''}`
        : `<button class="btn vurgu" id="listeEkle">Listeme ekle <span class="ok">+</span></button>`}
    </div>
  </header>
  <div class="ogren-izgara">
    <div>
      <section class="bolum" style="margin-top:32px">
        <div class="bolum-bas"><h2>Anlamlar</h2><span class="sayi" id="secimSay">${b ? '' : s.anlamlar.length}</span></div>
        ${s.anlamlar.map((a, i) => anlamHtml(a, i)).join('')}
      </section>
      ${s.deyimler.length ? `
      <section class="bolum">
        <div class="bolum-bas"><h2>Deyimler ve kalıplar</h2><span class="sayi">${s.deyimler.length}</span></div>
        ${s.deyimler.map((a, i) => anlamHtml(a, s.anlamlar.length + i, true)).join('')}
      </section>` : ''}
      ${s.ileri.length ? `
      <details class="diger">
        <summary><h2>Diğer anlamlar · ${s.ileri.length}</h2></summary>
        ${s.ileri.map((a, i) => anlamHtml(a, s.anlamlar.length + s.deyimler.length + i)).join('')}
      </details>` : ''}
      ${s.hafif ? '' : `<section class="video-kutu">
        <div class="bolum-bas"><h2>Videolarda</h2></div>
        <div class="klip" id="klip"></div>
      </section>`}

    </div>
    <aside class="yan">
      ${s.turemis.length ? `<div class="kart"><h3 class="etiket-mono">Aynı aileden</h3><div class="turemis">${s.turemis.map((t) => `<div><span style="text-align:left"><b>${e(t.ifade)}</b><i>${e(t.tur)}</i></span><span>${e(t.tr)} ${orinIsaret(t)}</span></div>`).join('')}</div></div>` : ''}
      ${b ? `<div class="kart"><h3 class="etiket-mono">Etiketler</h3><div id="ogrenEt"></div>
        <button class="metin-dugme" id="kaldir">Listemden çıkar</button></div>` : ''}
    </aside>
  </div>
`;

  $$('.ses').forEach((d) => d.onclick = () => sesCal(s.kelime, d.dataset.b, d));
  $$('.ornek-dug').forEach((d) => d.onclick = () => {
    const li = d.closest('li'), tr = li.classList.toggle('tr-acik');
    $('.ornek-metin', li).innerHTML = tr ? li.dataset.tr : li.dataset.en;
    d.textContent = tr ? '+' : '–'; d.setAttribute('aria-label', tr ? 'İngilizcesini göster' : 'Türkçesini göster');
  });

  // video klipleri (kendi oynatıcımız)
  if (!s.hafif) klipTemizle = klipOynatici($('#klip'), s.kelime, klipler, { dizin: DIZIN, ac: (w) => git('#/k/' + encodeURIComponent(w)) });

  if (!b) {
    if ($('#listeEkle')) $('#listeEkle').onclick = async () => { if (!BEN) return girisGerekli(); await istek('/kelimeler', { method: 'POST', govde: { kelimeler: [s.kelime] } }); bildir('Listene eklendi.'); ogren(s.kelime); };
    return;
  }
  // anlam seçimi: pratikte hangi anlamların sorulacağı; kendiliğinden kaydolur
  const secimYaz = () => { if ($('#secimSay')) $('#secimSay').textContent = `${secim.size} anlam pratikte`; };
  let kayitZ;
  $$('.anlam .sec').forEach((c) => c.onchange = () => {
    const a = c.closest('.anlam'); const id = a.dataset.id;
    c.checked ? secim.add(id) : secim.delete(id);
    a.classList.toggle('secili', c.checked);
    secimYaz();
    clearTimeout(kayitZ);
    kayitZ = setTimeout(() => istek('/kelimeler/' + b.id, { method: 'PATCH', govde: { secim: [...secim] } }).catch((x) => bildir(x.message)), 400);
  });
  secimYaz();
  // etiketler: seçince kendiliğinden kaydolur
  istek('/kelimeler').then((l) => {
    const secili = new Set(b.etiketler || []), tum = tumEtiketler(l.kelimeler);
    let z; etiketSecici($('#ogrenEt'), tum, secili, () => {
      clearTimeout(z); z = setTimeout(() => istek('/kelimeler/' + b.id, { method: 'PATCH', govde: { etiketler: [...secili] } }).then(() => bildir('Etiketler kaydedildi.')).catch((x) => bildir(x.message)), 500);
    });
  }).catch(() => {});
  $('#kaldir').onclick = async () => {
    if (!window.confirm(`${s.kelime} listenden çıkarılsın mı? Pratik geçmişi de silinir.`)) return;
    await istek('/kelimeler/' + b.id, { method: 'DELETE' }); bildir('Çıkarıldı.'); git('#/liste');
  };
}

// ——— KELİMELERİM ———
let listeFiltre = { q: '', g: 'tum', s: '', sr: 'yeni' };
// Videodan kelime (Kağan, 2026-10-15): herhangi bir YouTube videosu + bizim altyazı + kelimeye dokun
// Video keşfet akışı (v0): tam ekran dikey kaydırmalı kısa videolar
async function akisAc(baslangic) {
  await dizin();
  uyg.innerHTML = '<section class="sayfa-akis"></section>';
  const ortak = { dizin: DIZIN, istek, bildir, girisGerekli, girisli: () => !!BEN, ekle: async (w) => { await istek('/kelimeler', { method: 'POST', govde: { kelimeler: [w] } }); bildir('Listene eklendi.'); } };
  // Kendi sunucumuzdaki videolar varsa onlar (anında geçiş); yoksa ya da #/video/yt ise YouTube akışı
  let kendi = [];
  if (!location.hash.startsWith('#/video/yt')) {
    kendi = (await jsonAl('/akis-kendi.json')) || [];
    if (!kendi.length && PAKET) { try { kendi = await (await fetch('/akis-kendi.json')).json(); } catch { /* pakette de yok */ } }   // ağ yoksa pakette gelen son liste
    if (!Array.isArray(kendi)) kendi = [];
  }
  klipTemizle = kendi.length ? kendiAkis(uyg.firstElementChild, { ...ortak, videolar: kendi, kullanici: () => BEN?.ad || '', baslangic: typeof baslangic === 'string' ? baslangic : '' }) : akisSayfasi(uyg.firstElementChild, ortak);
}
async function videoAc() {
  await dizin();
  uyg.innerHTML = '<section class="dar sayfa-video"></section>';
  klipTemizle = videoSayfasi(uyg.firstElementChild, {
    dizin: DIZIN, ac: (w) => git('#/k/' + encodeURIComponent(w)), istek, bildir, girisGerekli, girisli: () => !!BEN,
    ekle: async (w) => { await istek('/kelimeler', { method: 'POST', govde: { kelimeler: [w] } }); bildir('Listene eklendi.'); },
  });
}

async function liste() {
  if (!BEN) {
    uyg.innerHTML = `<div class="liste-ust"><h1 class="baslik-l">Kelimelerim</h1></div>
      <p class="alt-yazi">Eklediğin kelimeler burada durur. Ara'da bir kelime bulup ekleyince listen oluşur.</p>
      <div class="pa-eylem"><a class="btn vurgu buyuk" href="#/ara">Kelime ara <span class="ok">→</span></a></div>`;
    return;
  }
  yukleniyor();
  listeCevrimdisi = false;
  const [l, d] = await Promise.all([listeAl(), dizin()]);
  if (listeCevrimdisi) setTimeout(() => bildir('Çevrimdışısın: son kaydedilen liste gösteriliyor.'), 400);
  const bilgi = new Map(d.map((x) => [x.k, x]));
  const etiketler = tumEtiketler(l.kelimeler);
  const say = (f) => l.kelimeler.filter(f).length;
  const F = {
    tum: ['Her durum', () => true],
    bek: ['İnceleniyor', (k) => k.durum === 'bekliyor'],
  };
  // en fazla üç filtre (Kağan, 2026-10-14): Göster (durum + etiket bir arada) · Seviye · Sırala
  if (!F[listeFiltre.g] && !etiketler.includes(listeFiltre.g.slice(2))) listeFiltre.g = 'tum';
  uyg.innerHTML = `
  <div class="liste-ust"><h1 class="baslik-l">Kelimelerim</h1>${l.kelimeler.length ? `<button class="toplu-bag" id="secBtn"><span>Seç</span></button>` : ''}</div>
  <div class="arama liste-arama">
    <label class="arama-kutu">${ARA_SIMGE}<input class="arama-girdi" id="ara" type="search" placeholder="Listende ara" value="${e(listeFiltre.q)}" autocapitalize="none" spellcheck="false" aria-label="Listende ara"></label>
    <select class="secici" data-f="g" aria-label="Göster">${Object.entries(F).filter(([k, [, f]]) => k === 'tum' || say(f)).map(([k, [ad, f]]) => `<option value="${k}" ${listeFiltre.g === k ? 'selected' : ''}>${k === 'tum' ? 'Hepsi' : ad + ' · ' + say(f)}</option>`).join('')}
      ${etiketler.length ? `<optgroup label="Etiket">${etiketler.map((x) => `<option value="e:${e(x)}" ${listeFiltre.g === 'e:' + x ? 'selected' : ''}>${e(x)}</option>`).join('')}</optgroup>` : ''}</select>
    <select class="secici" data-f="s" aria-label="Seviye"><option value="">Her seviye</option>${SEVIYELER.map((x) => `<option ${x === listeFiltre.s ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <select class="secici" data-f="sr" aria-label="Sırala">${[['yeni', 'En yeni'], ['az', 'Alfabetik'], ['yanlis', 'En düşük skor'], ['eski', 'Uzun süredir bakılmayan']].map(([v, ad]) => `<option value="${v}" ${v === listeFiltre.sr ? 'selected' : ''}>${ad}</option>`).join('')}</select>
  </div>
  <section class="liste-sonuc"><div class="satirlar" id="satirlar"></div></section>
  <div class="secim-cubuk" id="secCubuk" hidden><span id="secSay"></span><span class="secim-eylem"><button class="btn hayalet kucuk" id="secEt">Etiket</button><button class="btn hayalet kucuk" id="secSil">Sil</button><button class="btn kucuk" id="secBitti">Bitti</button></span></div>`;
  // seç modu: birkaç kelimeyi seçip toplu etiket ver / çıkar ya da listeden sil
  let secMod = false; const secili = new Set();
  const ciz = () => {
    const q = listeFiltre.q.toLowerCase();
    const g = listeFiltre.g, gf = g.startsWith('e:') ? (k) => etikette(k, g.slice(2)) : F[g]?.[1] || (() => true);
    const r = l.kelimeler.filter(gf)
      .filter((k) => !listeFiltre.s || bilgi.get(k.kelime)?.s === listeFiltre.s)
      .filter((k) => !q || k.kelime.includes(q) || k.tr.toLowerCase().includes(q))
      .sort(listeFiltre.sr === 'az' ? (a, b) => a.kelime.localeCompare(b.kelime)
        : listeFiltre.sr === 'yanlis' ? (a, b) => (skorOf(a) ?? 101) - (skorOf(b) ?? 101)
        : listeFiltre.sr === 'eski' ? (a, b) => (a.ist?.son || 0) - (b.ist?.son || 0)
        : (a, b) => b.olusturma - a.olusturma || b.id - a.id);
    $('#satirlar').innerHTML = r.length ? r.map((k) => secMod
      ? `<button class="satir sec-satir ${secili.has(k.id) ? 'secili' : ''}" data-id="${k.id}" aria-pressed="${secili.has(k.id)}"><i class="kutu"></i><div><div class="k">${e(k.kelime)}</div><div class="t">${k.tr ? e(k.tr) : ''}${k.etiketler?.length ? ` · <span class="etiket-k">${e(k.etiketler.join(', '))}</span>` : ''}</div></div></button>`
      : satir(k)).join('') : `<div class="bos"><p>${l.kelimeler.length ? 'Eşleşen kelime yok.' : 'Listen boş. <a href="#/ara">Kelime ara →</a>'}</p></div>`;
    $$('.sec-satir').forEach((b) => b.onclick = () => { const id = +b.dataset.id; secili.has(id) ? secili.delete(id) : secili.add(id); ciz(); });
    $('#secCubuk').hidden = !secMod;
    $('#secSay').textContent = `${secili.size} seçili`;
    $('#secEt').disabled = $('#secSil').disabled = !secili.size;
  };
  if ($('#secBtn')) $('#secBtn').onclick = () => { secMod = !secMod; secili.clear(); $('#secBtn span').textContent = secMod ? 'Vazgeç' : 'Seç'; ciz(); };
  $('#secBitti').onclick = () => $('#secBtn').click();
  $('#secSil').onclick = async () => {
    if (!window.confirm(`${secili.size} kelime listenden çıkarılsın mı? Pratik geçmişleri de silinir.`)) return;
    await istek('/kelimeler/toplu', { method: 'POST', govde: { idler: [...secili], sil: true } });
    bildir(`${secili.size} kelime çıkarıldı.`); liste();
  };
  $('#secEt').onclick = () => {
    const secK = l.kelimeler.filter((k) => secili.has(k.id));
    const ekle = new Set(), cikar = new Set(), mevcut = tumEtiketler(secK);
    const { o, kapat } = altPanel(`<h2 class="alt-panel-bas">${secili.size} kelimeye etiket</h2>
      <p class="alt-panel-not">Ekle</p><div id="tpEkle"></div>
      ${mevcut.length ? `<p class="alt-panel-not">Çıkar</p><div id="tpCikar"></div>` : ''}
      <div class="pa-eylem"><button class="btn vurgu" id="tpTamam">Kaydet</button><button class="metin-dugme" id="tpVaz">Vazgeç</button></div>`);
    etiketSecici($('#tpEkle', o), [...etiketler], ekle);
    if (mevcut.length) etiketSecici($('#tpCikar', o), mevcut, cikar, () => {}, { yeni: false });
    $('#tpVaz', o).onclick = kapat;
    $('#tpTamam', o).onclick = async () => {
      if (ekle.size || cikar.size) await istek('/kelimeler/toplu', { method: 'POST', govde: { idler: [...secili], etiketEkle: [...ekle], etiketCikar: [...cikar] } });
      kapat(); bildir('Etiketler güncellendi.'); liste();
    };
  };
  $('#ara').oninput = (ev) => { listeFiltre.q = ev.target.value; ciz(); };
  $$('[data-f]').forEach((s) => s.onchange = () => { listeFiltre[s.dataset.f] = s.value; ciz(); });
  ciz();
}

// ——— PRATİK ———
// Takvim, kilit, seri yok: kişi kelimeleri ve soru türlerini seçer, istediği an çıkar.
// Yanlış bilinen soru birkaç soru sonra yeniden gelir (doğru bilinene ya da atlanana kadar); her deneme kaydedilir.
const pratikDurum = { aktif: false };
const normal = (s) => s.toLowerCase().replace(/[’`]/g, "'").replace(/\([^)]*\)/g, ' ').replace(/\b(sb|sth|someone|something|somebody)\b/g, ' ').replace(/[^a-z' -]/g, ' ').replace(/\s+/g, ' ').trim();
const normalTr = (s) => s.toLocaleLowerCase('tr').replace(/\([^)]*\)/g, ' ').replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u').replace(/[^a-zçğıöşü -]/g, ' ').replace(/\s+/g, ' ').trim();
function mesafe(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2][j - 2] + 1 : Infinity);
  return d[a.length][b.length];
}
// harf harf fark: yanlış/eksik harfleri göster
function farkHtml(yazilan, dogru) {
  const a = yazilan, b = dogru;
  const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) d[i][j] = a[i] === b[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  let i = 0, j = 0, o = '';
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { o += e(a[i]); i++; j++; }
    else if (d[i + 1][j] >= d[i][j + 1]) { o += `<del>${e(a[i])}</del>`; i++; }
    else { o += `<ins>${e(b[j])}</ins>`; j++; }
  }
  while (i < a.length) o += `<del>${e(a[i++])}</del>`;
  while (j < b.length) o += `<ins>${e(b[j++])}</ins>`;
  return o;
}

const TUR_AD = { tr: 'Türkçeden İngilizceye', entr: 'İngilizceden Türkçeye', tanim: 'Tanımdan bul', dinle: 'Dinle, yaz', bosluk: 'Boşluğu doldur', ifade: 'Deyimi tamamla', es: 'Eş anlamlılardan bul', video: 'Videodan dinle, yaz', anlam: 'Hangi anlam?' };

// ——— pratik sistemi (Pratik-Sistemi-Plani.md) ———
// aşamalar: 0 tanıma · 1 hatırlama · 2 üretme. Aşama kelimeye ait, skordan çıkar (turdan bağımsız).
const ASAMA = [['entr', 'dinle', 'anlam'], ['tanim', 'es', 'bosluk'], ['tr', 'video']];
const skorOf = (k) => (k.ist?.n ? k.ist.skor ?? null : null);
const asamaOf = (k) => { const s = skorOf(k); return s == null || k.ist.n < 2 || s < 50 ? 0 : s < 85 || k.ist.n < 4 ? 1 : 2; };
const soruAdedi = (k) => { const s = skorOf(k); return s == null || s < 50 ? 3 : s < 85 ? 2 : 1; };
const TUR_HEDEF = 20, TEKRAR_EN_COK = 5;

const ogeleri = (k) => k.secim.map((id) => [...k.sozluk.anlamlar, ...k.sozluk.deyimler, ...(k.sozluk.ileri || [])].find((a) => a.id === id)).filter(Boolean);
// bir kelimede bir türden sorulabilecek FARKLI soruların listesi (boşsa o tür bu kelimeye sorulamaz)
function sorular(k, tur) {
  const s = k.sozluk;
  const og = ogeleri(k).length ? ogeleri(k) : [s.anlamlar[0]];
  const r = bicimRegex(s.kelime);
  const ornekli = (oge) => (oge.ornekler || []).filter((c) => r.test(c) && c.split(' ').length >= 4);
  if (tur === 'tr') return og.map((oge) => ({ oge }));
  if (tur === 'entr') return og.filter((o) => o.tr).map((oge) => ({ oge }));
  if (tur === 'tanim') return og.filter((o) => o.tanim && !o.id.startsWith('d')).map((oge) => ({ oge }));
  if (tur === 'dinle') return s.hafif ? [] : [{ oge: og[0] }];
  if (tur === 'es') return og.filter((o) => (o.esler || []).length >= 2).map((oge) => ({ oge }));
  if (tur === 'video') return (k.klipler || []).filter((c) => r.test(c.cumle)).map((klip) => ({ oge: og[0], klip }));
  if (tur === 'anlam') return og.length < 2 ? [] : og.filter((o) => o.tr).flatMap((oge) => ornekli(oge).slice(0, 2).map((cumle) => ({ oge, cumle })));
  if (tur === 'bosluk') { const g = new Set(); return og.flatMap((oge) => ornekli(oge).filter((c) => !g.has(c) && g.add(c)).map((cumle) => ({ oge, cumle }))); }
  return [];
}
// bir soru kur: kelime + tür + kaçıncı varyant
function alistirma(k, tur, v = 0) {
  const s = k.sozluk, liste = sorular(k, tur);
  const { oge, cumle: c, klip } = liste[v % liste.length];
  const deyim = oge.id.startsWith('d');
  const r = bicimRegex(s.kelime);
  if (tur === 'tr' && deyim) tur = 'ifade';
  const cevap = s.kelime;
  if (tur === 'bosluk') {
    const m = c.match(r);
    return { tur, oge, deyim, cumle: c, once: c.slice(0, m.index), sonra: c.slice(m.index + m[0].length), cevap: m[0], kok: cevap };
  }
  if (tur === 'video') { const m = klip.cumle.match(r); return { tur, oge, deyim, klip, cevap: m ? m[0] : cevap, kok: cevap }; }
  if (tur === 'anlam') {
    const og = ogeleri(k).filter((o) => o.tr);
    return { tur, oge, deyim, cumle: c, secenekler: og.map((o) => ({ id: o.id, tr: o.tr })).sort(() => Math.random() - .5), cevap: oge.tr, kok: cevap };
  }
  if (tur === 'ifade') {
    const m = oge.ifade.match(r) || oge.ifade.match(new RegExp(kacis(cevap.split(' ')[0]), 'i'));
    return { tur, oge, deyim, cumle: oge.ifade, once: m ? oge.ifade.slice(0, m.index) : '', sonra: m ? oge.ifade.slice(m.index + m[0].length) : oge.ifade, cevap: m ? m[0] : cevap, kok: cevap };
  }
  if (tur === 'tanim') return { tur, oge, deyim, tanim: oge.tanim.replace(new RegExp(r.source, 'gi'), '____'), cevap, kok: cevap };
  if (tur === 'entr') {
    // Türkçe cevap: virgülle ayrılmış karşılıklardan biri yeter
    const secenek = (t) => t.split(/[,;/]/).map(normalTr).filter(Boolean);
    const diger = [...s.anlamlar, ...s.deyimler].filter((a) => a.id !== oge.id).flatMap((a) => secenek(a.tr || ''));
    return { tur, oge, deyim, cevap: oge.tr, secenekler: secenek(oge.tr), diger, kok: cevap };
  }
  return { tur, oge, deyim, cevap, kok: cevap }; // tr, dinle, es
}
function puanla(a, yazilan) {
  if (a.tur === 'entr') {
    const y = normalTr(yazilan);
    if (!y) return 'yanlis';
    if (a.secenekler.some((x) => x === y)) return 'dogru';
    if (a.secenekler.some((x) => y.length >= 4 && (x.includes(y) || y.includes(x)))) return 'dogru'; // "ilgili" ⊂ "konuyla ilgili"
    if (a.secenekler.some((x) => mesafe(y, x) <= (x.length <= 5 ? 1 : 2))) return 'yakin';
    return 'yanlis';
  }
  const y = normal(yazilan), d = normal(a.cevap), kok = normal(a.kok);
  const esik = d.length <= 5 ? 1 : 2;
  const bos = a.tur === 'bosluk' || a.tur === 'video';
  if (y === d || (bos && y === kok)) return 'dogru';
  if (y && (mesafe(y, d) <= esik || (bos && mesafe(y, kok) <= esik))) return 'yakin';
  return 'yanlis';
}

// kelime istatistiği: "7/10 · 3 gün önce"
function once(ms) {
  if (!ms) return '';
  const f = Date.now() - ms;
  if (f < 3600e3) return 'az önce';
  if (f < 86400e3) return Math.round(f / 3600e3) + ' saat önce';
  const g = Math.round(f / 86400e3);
  return g === 1 ? 'dün' : g + ' gün önce';
}
const istBilen = (o) => (o?.dogru || 0) + (o?.yakin || 0);

// yarıda bırakılan tur tarayıcıda saklanır, tekrar girince devam edilebilir
const OTURUM = () => 'voca-tur-' + (BEN?.ad || '');
const oturumOku = () => { try { const o = JSON.parse(localStorage.getItem(OTURUM()) || 'null'); return o && o.surum === 2 && Date.now() - o.t < 3 * 86400e3 && o.kuyruk?.length ? o : null; } catch { return null; } };
const oturumYaz = (o) => { try { o ? localStorage.setItem(OTURUM(), JSON.stringify(o)) : localStorage.removeItem(OTURUM()); } catch {} };

// tur planı: hangi kelime kaç soru (skora göre 3/2/1), hedef ~20 soru; sığmazsa en çok ihtiyacı olanlar girer
function turPlanla(kartlar) {
  const ihtiyac = (k) => [skorOf(k) ?? -1, k.ist?.son || 0];
  let L = kartlar.map((k) => ({ k, n: soruAdedi(k) }));
  const top = () => L.reduce((t, x) => t + x.n, 0);
  // fazlaysa: önce skoru en yüksek kelimelerin sorusu azalır
  const azalt = [...L].sort((a, b) => (skorOf(b.k) ?? -1) - (skorOf(a.k) ?? -1));
  for (let tur = 0; tur < 3 && top() > TUR_HEDEF; tur++) for (const x of azalt) { if (top() <= TUR_HEDEF) break; if (x.n > 1) x.n--; }
  if (top() > TUR_HEDEF) L = L.sort((a, b) => { const [s1, t1] = ihtiyac(a.k), [s2, t2] = ihtiyac(b.k); return s1 - s2 || t1 - t2; }).slice(0, TUR_HEDEF);
  // az kelimede (1-3) tur çok kısa kalmasın: kelime başına en fazla 4
  for (let tur = 0; tur < 4 && top() < 8; tur++) for (const x of L) if (x.n < 4 && top() < 8) x.n++;
  // sıra: aynı kelime art arda gelmesin (kalanı en çok olan, sonuncusundan farklı olan seçilir)
  const kalan = new Map(L.map((x) => [x.k.id, x.n])), sira = [];
  let son = null;
  while ([...kalan.values()].some((n) => n > 0)) {
    const aday = [...kalan].filter(([id, n]) => n > 0 && id !== son).sort((a, b) => b[1] - a[1] || Math.random() - .5)[0] || [...kalan].find(([, n]) => n > 0);
    sira.push({ id: aday[0] }); kalan.set(aday[0], aday[1] - 1); son = aday[0];
  }
  return { kelimeSay: L.length, sira };
}
// soru türü çalışırken seçilir: kelimenin bu turdaki aşamasından, bu turda sorulmamış, en uzun süredir sorulmamış tür
function turSec(T, id) {
  const k = T.kartlar[id], d = T.kd[id];
  let a = d.asama;
  if (T.cozulen < 3) a = Math.min(a, 1); // ısınma: ilk 3 soru üretme aşamasından gelmez
  for (const st of [a, a - 1, a + 1, a - 2, a + 2].filter((x) => x >= 0 && x <= 2)) {
    let havuz = ASAMA[st].filter((t) => sorular(k, t).length && !d.used.includes(t));
    if (havuz.length > 1) havuz = havuz.filter((t) => t !== T.sonTur);
    if (havuz.length) return havuz.sort((x, y) => (k.ist?.turSon?.[x] || 0) - (k.ist?.turSon?.[y] || 0))[0];
  }
  // hepsi kullanıldıysa (yeniden sorulan kelime): aşamadan en az kullanılan
  const hepsi = ASAMA.flat().filter((t) => sorular(k, t).length);
  return hepsi.sort((x, y) => d.used.filter((u) => u === x).length - d.used.filter((u) => u === y).length)[0] || 'tr';
}
// pratik ana ekranı = başlat + geçmiş (ayrı Geçmiş sayfası yok; Kağan, 2026-10-14)
// kelime skoru: "bu kelime sorulsa bilme ihtimalin" (sunucuda FSRS + son 5 cevap). %85+ iyi · %50-84 orta · altı zayıf
const skorSinif = (x) => (x >= 85 ? 'iyi' : x >= 50 ? 'orta' : 'kotu');
const zorSirala = (l) => l.filter((k) => k.ist?.n).sort((a, b) => (skorOf(a) ?? 0) - (skorOf(b) ?? 0) || (a.ist.son || 0) - (b.ist.son || 0));
// zorlandıkların: skoru %50'nin altında (zamanı da hesaba katar: uzun süre bakmadığın kelime de düşer)
const zorMu = (k) => skorOf(k) != null && skorOf(k) < 50;
const TARIH = (ms) => { const d = new Date(ms), f = Date.now() - ms; return f < 86400e3 && d.getDate() === new Date().getDate() ? 'Bugün ' + d.toTimeString().slice(0, 5) : f < 2 * 86400e3 ? 'Dün' : `${d.getDate()} ${AYLAR[d.getMonth()]}`; };
const turSatir = (t) => `<a class="tur-satir" href="#/pratik/rapor/${t.id}">
  <span class="ts-tarih">${TARIH(t.baslangic)}</span>
  <span class="ts-ozet"><b>${t.dogru || 0}</b>/${t.n} doğru<small> · ${t.kelime} kelime</small></span>
  <span class="bar" aria-hidden="true"><i style="width:${((t.dogru || 0) / t.n) * 100}%"></i></span><span class="ok">→</span></a>`;
const sayiSinif = (b, n) => (b === n ? 'iyi' : b === 0 ? 'kotu' : 'orta');
const kelimeIstSatir = (k) => `<a class="ist-satir-k skor-satir" href="#/k/${encodeURIComponent(k.kelime)}">
  <span class="k">${e(k.kelime)}</span>
  <span class="bar ${skorSinif(skorOf(k))}" aria-hidden="true"><i style="width:${skorOf(k)}%"></i></span>
  <span class="deger ${skorSinif(skorOf(k))}">%${skorOf(k)}</span>
  <span class="son">${once(k.ist.son)}</span></a>`;
// uzun liste: ilk n satır, gerisi "Daha fazla göster" ile
const kisaListe = (satirlar, n, id) => satirlar.length <= n ? satirlar.join('')
  : satirlar.slice(0, n).join('') + `<div class="gizli-satirlar" id="${id}" hidden>${satirlar.slice(n).join('')}</div><button class="daha-fazla" data-ac="${id}">Daha fazla göster · ${satirlar.length - n}</button>`;

async function pratik() {
  if (!BEN) {
    uyg.innerHTML = `<section class="pratik-ana">
      <div class="pa-bas"><div class="liste-ust"><h1 class="baslik-l">Pratik</h1></div>
      <p class="alt-yazi">Kelimelerini seç, soruları cevapla, hangisinde zorlandığını gör.</p>
      <div class="pa-eylem"><button class="btn vurgu buyuk" id="misafirBasla">Pratiğe başla <span class="ok">→</span></button></div></div></section>`;
    $('#misafirBasla').onclick = girisGerekli;
    return;
  }
  yukleniyor();
  const [l, g] = await Promise.all([istek('/kelimeler'), istek('/gecmis')]);
  const kelimeler = l.kelimeler.filter((k) => k.durum !== 'bekliyor');
  const kayit = oturumOku();
  const zor = kelimeler.filter(zorMu);
  const pratikli = zorSirala(kelimeler);
  const turlar = g.turlar || [];
  // düğmeler: ana düğme tam genişlik; ikincil düğmeler altında eşit genişlikte yan yana
  const ikincil = [kayit && kelimeler.length ? `<button class="btn hayalet" id="basla">Yeni tur</button>` : '', zor.length ? `<button class="btn hayalet" id="zorBasla">Zorlandıkların · ${zor.length}</button>` : ''].filter(Boolean);
  uyg.innerHTML = `<section class="pratik-ana">
    <div class="pa-bas">
      <div class="liste-ust"><h1 class="baslik-l">Pratik</h1></div>
      <p class="alt-yazi">${kelimeler.length ? `${kelimeler.length} kelimen var.` : 'Listende kelime yok.'}${kayit ? ` Yarım kalan turunda ${kayit.kuyruk.length} soru kaldı.` : ''}</p>
      <div class="pa-eylem">
        ${kayit ? `<button class="btn vurgu buyuk" id="devamEt">Devam et <span class="ok">→</span></button>`
          : kelimeler.length ? `<button class="btn vurgu buyuk" id="basla">Pratiğe başla <span class="ok">→</span></button>`
          : `<a class="btn vurgu buyuk" href="#/ara">Kelime ara <span class="ok">→</span></a>`}
        ${ikincil.length ? `<div class="pa-ikincil ${ikincil.length === 1 ? 'tek' : ''}">${ikincil.join('')}</div>` : ''}
      </div>
    </div>
    ${turlar.length ? `<section class="bolum">
      <div class="bolum-bas"><h2>Son turlar</h2></div>
      ${kisaListe(turlar.map(turSatir), 3, 'dahaTur')}
    </section>` : ''}
    ${pratikli.length ? `<section class="bolum">
      <div class="bolum-bas"><h2>Kelimeler</h2></div>
      <div class="ist-liste">${kisaListe(pratikli.map(kelimeIstSatir), 6, 'dahaKelime')}</div>
    </section>` : ''}
  </section>`;
  $$('.daha-fazla').forEach((b) => b.onclick = () => { $('#' + b.dataset.ac).hidden = false; b.remove(); });
  if ($('#devamEt')) $('#devamEt').onclick = () => turOyna(kayit);
  if ($('#basla')) $('#basla').onclick = () => sihirbaz(kelimeler); // yarım tur, yeni tur başlayınca silinir
  if ($('#zorBasla')) $('#zorBasla').onclick = () => sihirbaz(kelimeler, { zor: true });
}

// ——— yeni tur: tek ekran — hangi kelimeler? (soru türü ve uzunluk planlayıcıda) ———
async function sihirbaz(kelimeler, { zor = false } = {}) {
  const etiketler = tumEtiketler(kelimeler);
  const gruplar = [['Hepsi', () => true], ...(kelimeler.some(zorMu) ? [['Zorlandıkların', zorMu]] : []), ...etiketler.map((x) => [x, (k) => etikette(k, x)])];
  let grup = zor && kelimeler.some(zorMu) ? 1 : 0, tekTek = false;
  const secili = new Set(kelimeler.filter(gruplar[grup][1]).map((k) => k.id));
  const sf = { q: '', et: '', d: '' }; // tek tek seçimdeki arama ve filtre
  let kartlar = null;
  istek('/pratik/onizleme', { method: 'POST', govde: { kelimeler: kelimeler.map((k) => k.id) } }).then((v) => { kartlar = v.kartlar; ozet(); }).catch(() => {});
  const ozet = () => {
    if (!$('#turOzet')) return;
    if (!secili.size) { $('#turOzet').textContent = 'Kelime seç.'; return; }
    if (!kartlar) { $('#turOzet').textContent = '…'; return; }
    const p = turPlanla(kartlar.filter((k) => secili.has(k.id)));
    $('#turOzet').textContent = `Bu turda ${p.kelimeSay} kelime, ${p.sira.length} soru${p.kelimeSay < secili.size ? ` · kalan ${secili.size - p.kelimeSay} kelime sonraki turda` : ''}`;
  };
  const ciz = () => {
    uyg.innerHTML = `<section class="pratik sihirbaz"><a class="geri" href="#/pratik" id="geri">← Pratik</a><div class="soru">
      <h1 class="baslik-l">Hangi kelimeler?</h1>
      <div class="buyuk-secenekler">${gruplar.map(([ad, f], i) => `<button class="buyuk-secenek ${!tekTek && i === grup ? 'secili' : ''}" data-g="${i}"><b>${e(ad)}</b><span>${kelimeler.filter(f).length} kelime</span></button>`).join('')}
        <button class="buyuk-secenek ${tekTek ? 'secili' : ''}" id="tekTekBtn"><b>Kendim seçeceğim</b><span>${tekTek ? 'aşağıdan seç' : 'kelimeleri tek tek seç'}</span></button></div>
      ${tekTek ? `<div class="kelime-sec">
        <div class="arama">
          <label class="arama-kutu">${ARA_SIMGE}<input class="arama-girdi" id="ksAra" type="search" placeholder="Kelime ya da Türkçesi" value="${e(sf.q)}" autocapitalize="none" spellcheck="false" aria-label="Kelime ara"></label>
          ${etiketler.length ? `<select class="secici" id="ksEt" aria-label="Etiket"><option value="">Her etiket</option>${etiketler.map((x) => `<option ${x === sf.et ? 'selected' : ''}>${e(x)}</option>`).join('')}</select>` : ''}
          <select class="secici" id="ksD" aria-label="Durum">${[['', 'Her durum'], ['zor', 'Zorlandıkların'], ['hic', 'Hiç pratik yapılmayan']].map(([v, ad]) => `<option value="${v}" ${v === sf.d ? 'selected' : ''}>${ad}</option>`).join('')}</select>
        </div>
        <div class="ks-ust"><span id="ksSayi"></span><span class="ks-eylem"><button class="metin-dugme" id="ksHepsi">Görünenleri seç</button><button class="metin-dugme" id="ksTemizle">Seçimi temizle</button></span></div>
        <div class="ks-liste" id="ksListe"></div>
      </div>` : ''}
      <p class="tur-ozet" id="turOzet"></p>
      <div class="pa-eylem"><button class="btn vurgu buyuk" id="ileri" ${secili.size ? '' : 'disabled'}>Başla <span class="ok">→</span></button></div>
    </div></section>`;
    $('#geri').onclick = (ev) => { ev.preventDefault(); pratik(); };
    $$('[data-g]').forEach((b) => b.onclick = () => { grup = +b.dataset.g; tekTek = false; secili.clear(); kelimeler.filter(gruplar[grup][1]).forEach((k) => secili.add(k.id)); ciz(); });
    $('#tekTekBtn').onclick = () => { if (!tekTek) { tekTek = true; ciz(); } }; // klavye kendiliğinden açılmasın: odak yok
    if (tekTek) {
      const gorunen = () => {
        const q = sf.q.trim().toLowerCase();
        return kelimeler.filter((k) => (!sf.et || etikette(k, sf.et)) && (!q || k.kelime.includes(q) || (k.tr || '').toLowerCase().includes(q))
          && (!sf.d || (sf.d === 'zor' ? zorMu(k) : !k.ist?.n)));
      };
      const liste = () => {
        const g = gorunen();
        $('#ksListe').innerHTML = g.length ? g.map((k) => `<button class="ks-satir ${secili.has(k.id) ? 'secili' : ''}" data-id="${k.id}" aria-pressed="${secili.has(k.id)}"><i class="kutu"></i><span class="k">${e(k.kelime)}</span><span class="t">${e(k.tr || '')}</span>${skorOf(k) != null ? `<span class="ks-ist ${skorSinif(skorOf(k))}">%${skorOf(k)}</span>` : ''}</button>`).join('') : '<p class="bos-k">Eşleşen kelime yok.</p>';
        $('#ksSayi').textContent = `${secili.size} kelime seçili`;
        $('#ileri').disabled = !secili.size; ozet();
        $$('#ksListe [data-id]').forEach((b) => b.onclick = () => { const id = +b.dataset.id; secili.has(id) ? secili.delete(id) : secili.add(id); liste(); });
      };
      $('#ksAra').oninput = (ev) => { sf.q = ev.target.value; liste(); };
      if ($('#ksEt')) $('#ksEt').onchange = (ev) => { sf.et = ev.target.value; liste(); };
      $('#ksD').onchange = (ev) => { sf.d = ev.target.value; liste(); };
      $('#ksHepsi').onclick = () => { gorunen().forEach((k) => secili.add(k.id)); liste(); };
      $('#ksTemizle').onclick = () => { secili.clear(); liste(); };
      liste();
    }
    ozet();
    $('#ileri').onclick = async () => {
      $('#ileri').disabled = true;
      try { turOyna(turKur(await istek('/pratik', { method: 'POST', govde: { kelimeler: [...secili] } }))); }
      catch (x) { $('#ileri').disabled = false; if (x.message !== 'giriş') bildir(x.message); }
    };
  };
  ciz();
}

function turKur(v) {
  const p = turPlanla(v.kartlar);
  const kartlar = Object.fromEntries(v.kartlar.map((k) => [k.id, k]));
  const kd = Object.fromEntries(v.kartlar.map((k) => [k.id, { asama: asamaOf(k), used: [], tekrar: 0 }]));
  return { surum: 2, oturum: v.oturum, kartlar, kd, kuyruk: p.sira, toplam: p.sira.length, cozulen: 0, tekrarSay: 0, sonuclar: [], t: Date.now() };
}

function turOyna(T) {
  pratikDurum.aktif = true;
  if (location.hash !== '#/pratik') { pratikDurum.gecis = true; location.hash = '#/pratik'; }
  const kaydet = () => { T.t = Date.now(); oturumYaz(T); };
  kaydet();
  let klipKapat = () => {};
  const sonraki = () => {
    klipKapat(); klipKapat = () => {};
    if (!pratikDurum.aktif) return;
    if (!T.kuyruk.length) { oturumYaz(null); pratikDurum.aktif = false; return pratikRapor(T.oturum); }
    const slot = T.kuyruk[0], { id, tekrar } = slot;
    const k = T.kartlar[id], d = T.kd[id];
    // tür bir kez seçilir ve slota yazılır (sayfa yenilense de aynı soru gelir)
    if (!slot.tur) { slot.tur = turSec(T, id); slot.v = d.used.filter((u) => u === slot.tur).length; kaydet(); }
    const a = alistirma(k, slot.tur, slot.v || 0);
    const kalan = T.kuyruk.length;
    const secmeli = a.tur === 'anlam';
    uyg.innerHTML = `
    <section class="pratik">
      <div class="pratik-ust"><span class="sayac">${T.cozulen + 1} · ${kalan} kaldı</span><div class="cubuk"><i style="width:${(T.cozulen / (T.cozulen + kalan)) * 100}%"></i></div><button class="kapat" title="Bitir" aria-label="Pratiği bitir">×</button></div>
      <div class="soru">
        <div class="tur-ad"><span class="etiket-mono">${TUR_AD[a.tur]}</span>${tekrar ? `<span class="durum ogreniliyor">yeniden</span>` : ''}</div>
        ${a.tur === 'tr' ? `<p class="istem">${e(a.oge.tr)}</p>`
        : a.tur === 'entr' ? `<p class="istem" lang="en">${e(k.kelime)}</p>${a.oge.tanim ? `<div class="ipucu"><span lang="en">“${e(a.oge.tanim)}”</span></div>` : ''}`
        : a.tur === 'tanim' ? `<p class="istem tanim">“${e(a.tanim)}”</p>`
        : a.tur === 'dinle' ? `<div class="dinle-alan"><button class="btn vurgu buyuk" id="dinleUs">${OYNAT}&nbsp; Dinle</button><button class="btn hayalet" id="dinleUk">UK</button><button class="btn hayalet" id="dinleYavas">Yavaş</button></div>`
        : a.tur === 'es' ? `<div class="es-soru">${a.oge.esler.slice(0, 5).map((x) => `<span lang="en">${e(x)}</span>`).join('')}</div>`
        : a.tur === 'video' ? `<div class="klip gizli" id="vklip"></div>`
        : a.tur === 'anlam' ? `<p class="istem cumle" lang="en">${vurgula(a.cumle, k.kelime)}</p><div class="anlam-sec">${a.secenekler.map((x) => `<button class="anlam-secenek" data-id="${x.id}">${e(x.tr)}</button>`).join('')}</div>`
        : `<p class="istem cumle">${e(a.once)}<span class="bosluk">&nbsp;?&nbsp;</span>${e(a.sonra)}</p>`}
        <form class="cevap-alan" id="cform" autocomplete="off" ${secmeli ? 'hidden' : ''}>
          <input class="cevap" id="cevap" placeholder="${a.tur === 'entr' ? 'Türkçesini yaz' : 'İngilizcesini yaz'}" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Cevabın" ${a.tur === 'entr' ? 'lang="tr"' : ''}>
          <div class="pratik-alt"><button type="button" class="metin-dugme" id="atlaBtn">Atla</button><button type="button" class="btn hayalet" id="bilmiyorum">Bilmiyorum</button><button class="btn vurgu" type="submit">Kontrol et <span class="tus">enter</span></button></div>
        </form>
        ${secmeli ? `<div class="pratik-alt"><button type="button" class="metin-dugme" id="atlaBtn2">Atla</button></div>` : ''}
        <div id="sonuc"></div>
      </div>
    </section>`;
    const inp = $('#cevap');
    if (!secmeli && a.tur !== 'video') inp.focus();
    if (a.tur === 'dinle') {
      $('#dinleUs').onclick = () => sesCal(k.kelime, 'us');
      $('#dinleUk').onclick = () => sesCal(k.kelime, 'uk');
      $('#dinleYavas').onclick = () => { const u = new SpeechSynthesisUtterance(k.kelime); u.lang = 'en-US'; u.rate = .6; speechSynthesis.cancel(); speechSynthesis.speak(u); };
    }
    if (a.tur === 'video') klipKapat = klipOynatici($('#vklip'), k.kelime, [a.klip], { dizin: DIZIN || [], ac: () => {}, gizle: true });
    let cevaplandi = false;
    $('.kapat').onclick = () => kapatSor();
    const kayitYaz = async (sonuc, yazilan) => {
      try { return (await istek('/pratik/' + id, { method: 'POST', govde: { sonuc, tur: a.tur, cevap: yazilan, oturum: T.oturum } })).kayit; }
      catch (x) { if (x.message !== 'giriş') bildir('Kaydedilemedi: ' + x.message); return null; }
    };
    const ilerle = (sonuc) => {
      T.kuyruk.shift(); T.cozulen++; T.sonTur = a.tur;
      d.used.push(slot.tur);
      if (sonuc === 'dogru') d.asama = Math.min(2, d.asama + 1); // bildin: sonraki sorusu bir üst aşamadan
      // yanlış: birkaç soru sonra aynı aşamadan farklı türle yeniden (kelime başına en fazla 2, turda en fazla 5)
      if (sonuc === 'yanlis' && d.tekrar < 2 && T.tekrarSay < TEKRAR_EN_COK) {
        d.tekrar++; T.tekrarSay++;
        T.kuyruk.splice(Math.min(3, T.kuyruk.length), 0, { id, tekrar: d.tekrar });
      }
      T.sonuclar.push([id, a.tur, sonuc]); kaydet();
    };
    const atla = () => { if (cevaplandi) return; cevaplandi = true; ilerle('atla'); kayitYaz('atla', ''); sonraki(); };
    $('#atlaBtn').onclick = atla; if ($('#atlaBtn2')) $('#atlaBtn2').onclick = atla;
    const degerlendir = async (yazilan, vazgecti, secimSonuc) => {
      if (cevaplandi) return; cevaplandi = true;
      const ham = secimSonuc || (vazgecti ? 'yanlis' : puanla(a, yazilan));
      const harfFarki = ham === 'yakin'; // küçük yazım farkı: yanlış sayılır, farkı gösterilir
      const sonuc = ham === 'dogru' ? 'dogru' : 'yanlis';
      const bas = sonuc === 'dogru' ? 'Doğru' : vazgecti ? 'Cevap' : harfFarki ? 'Yanlış · küçük yazım farkı' : 'Yanlış';
      if (sonuc === 'yanlis') $('.soru').classList.add('titre');
      inp.disabled = true; $('#cform .pratik-alt').hidden = true; $('#atlaBtn2')?.parentElement.remove();
      $('#vklip')?.classList.remove('gizli');
      ilerle(sonuc);
      const y = a.tur === 'entr' ? normalTr(yazilan) : normal(yazilan), kok = normal(a.kok), dd = a.tur === 'entr' ? '' : normal(a.cevap);
      const baskaAnlam = a.tur === 'entr' && sonuc === 'yanlis' && y && a.diger.some((x) => x === y || mesafe(y, x) <= 1);
      const ornek = !['bosluk', 'anlam', 'video'].includes(a.tur) ? (a.oge.ornekler || []).find((o) => bicimRegex(k.kelime).test(o)) : null;
      const metinli = !secmeli;
      $('#sonuc').innerHTML = `
        <div class="sonuc-bant ${sonuc}">
          <div class="baslik">${bas}</div>
          <div class="kelime">${a.tur === 'entr' || a.tur === 'anlam' ? e(a.oge.tr) : e(a.cevap)} ${a.tur !== 'entr' && a.tur !== 'anlam' ? `<button class="mini-ses" id="dinle" aria-label="Dinle">${OYNAT}</button>` : ''}${(a.tur === 'bosluk' || a.tur === 'video') && normal(a.cevap) !== kok ? `<span class="etiket-k">kök: ${e(a.kok)}</span>` : ''}</div>
          ${harfFarki && a.tur !== 'entr' ? `<div class="fark">${farkHtml(y, y === kok || mesafe(y, kok) < mesafe(y, dd) ? kok : dd)}</div>` : ''}
          ${metinli && sonuc === 'yanlis' && y && !(harfFarki && a.tur !== 'entr') ? `<p>Senin cevabın: <b>${e(yazilan)}</b>${baskaAnlam ? ' · bu, kelimenin başka bir anlamı' : ''}</p>` : ''}
          ${(a.tur === 'bosluk' || a.tur === 'video') && y === kok && kok !== dd ? `<p>Kelime doğru; cümlede <b>${e(a.cevap)}</b> biçiminde geçiyor.</p>` : ''}
          ${a.tur === 'entr' ? `<p lang="en"><b>${e(k.kelime)}</b></p>` : !['tr', 'anlam'].includes(a.tur) ? `<p><b>${e(a.oge.tr)}</b>${a.deyim ? ' · ' + e(a.oge.ifade) : ''}</p>` : ''}
          ${ornek ? `<div class="ornek">${vurgula(ornek, k.kelime)}</div>` : ''}
          ${sonuc === 'yanlis' && T.kuyruk.some((x) => x.id === id && x.tekrar) ? `<p class="kucuk">Birkaç soru sonra yeniden gelecek.</p>` : ''}
          <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;align-items:center"><button class="btn" id="devam">Devam <span class="tus">enter</span></button></div>
        </div>`;
      if ($('#dinle')) $('#dinle').onclick = () => sesCal(k.kelime, 'us');
      const devam = () => { document.removeEventListener('keydown', tus); if (pratikDurum.aktif) sonraki(); };
      const tus = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); devam(); } };
      setTimeout(() => document.addEventListener('keydown', tus), 250);
      $('#devam').onclick = devam;
      kayitYaz(sonuc, a.tur === 'anlam' ? (a.secenekler.find((x) => x.tr === yazilan) || {}).tr || yazilan : yazilan);
    };
    $('#cform').onsubmit = (ev) => { ev.preventDefault(); if (!inp.value.trim()) { inp.focus(); return; } degerlendir(inp.value); };
    $('#bilmiyorum').onclick = () => degerlendir('', true);
    $$('.anlam-secenek').forEach((b) => b.onclick = () => {
      $$('.anlam-secenek').forEach((x) => { x.disabled = true; x.classList.toggle('dogru', x.dataset.id === a.oge.id); });
      if (b.dataset.id !== a.oge.id) b.classList.add('yanlis');
      degerlendir(b.textContent, false, b.dataset.id === a.oge.id ? 'dogru' : 'yanlis');
    });
  };
  // × : sonra devam mı, turu bitirmek mi?
  const kapatSor = () => {
    const o = document.createElement('div');
    o.className = 'karsilama';
    o.innerHTML = `<div class="karsilama-kutu kart kapat-kutu" role="dialog" aria-modal="true">
      <h2 class="baslik-l">Ara mı veriyorsun?</h2>
      <div class="pa-eylem"><button class="btn vurgu" id="kSonra">Sonra devam ederim</button><button class="btn hayalet" id="kBitir">Turu bitir</button><button class="metin-dugme" id="kDon">Pratiğe dön</button></div>
    </div>`;
    document.body.appendChild(o);
    const kapat = () => o.remove();
    o.addEventListener('click', (ev) => { if (ev.target === o) kapat(); });
    $('#kDon').onclick = kapat;
    $('#kSonra').onclick = () => { kapat(); klipKapat(); pratikDurum.aktif = false; kaydet(); pratikRapor(T.oturum, true); };
    $('#kBitir').onclick = () => { kapat(); klipKapat(); pratikDurum.aktif = false; oturumYaz(null); pratikRapor(T.oturum); };
  };
  sonraki();
}

// ——— tur raporu: kaç soru, kaçı doğru; bildiklerin / zorlandıkların ———
async function pratikRapor(id, yarida = false) {
  pratikDurum.aktif = false;
  // raporun kendi adresi olsun: alttaki "Pratik"e basınca giriş sayfası açılsın (aynı adreste tıklama bir şey yapmıyordu)
  if (location.hash !== '#/pratik/rapor/' + id) history.replaceState(null, '', '#/pratik/rapor/' + id);
  yukleniyor();
  const r = await istek('/pratik/oturum/' + id);
  const cevap = r.denemeler.filter((d) => d.sonuc !== 'atla');
  const dogru = cevap.filter((d) => d.sonuc === 'dogru').length;
  const atla = r.denemeler.length - cevap.length;
  const kelimeler = [...new Set(r.denemeler.map((d) => d.kelime))];
  const zor = kelimeler.filter((k) => cevap.some((d) => d.kelime === k && d.sonuc === 'yanlis'));
  const bildi = kelimeler.filter((k) => !zor.includes(k) && cevap.some((d) => d.kelime === k));
  // her kelimenin altında o turdaki soruları: tür, yazdığın, sonuç (yanlışsa doğrusu)
  const [d, lk] = await Promise.all([dizin().catch(() => []), istek('/kelimeler').catch(() => ({ kelimeler: [] }))]);
  const trOf = (w) => d.find((x) => x.k === w)?.tr || '';
  const skorW = new Map(lk.kelimeler.map((x) => [x.kelime, skorOf(x)]));
  const SONUC_AD = { dogru: 'doğru', yakin: 'doğru', yanlis: 'yanlış', atla: 'atlandı' };
  const kelimeKart = (w) => {
    const ds = r.denemeler.filter((x) => x.kelime === w), c = ds.filter((x) => x.sonuc !== 'atla');
    return `<details class="rapor-k">
      <summary><span class="k">${e(w)}</span><span class="deger ${sayiSinif(c.filter((x) => x.sonuc !== 'yanlis').length, c.length)}">${c.filter((x) => x.sonuc !== 'yanlis').length}/${c.length}</span></summary>
      <div class="rapor-ayrinti">${ds.map((x) => `<div class="ra-satir">
        <span class="ra-tur">${TUR_AD[x.tur] || x.tur}</span>
        <span class="ra-cevap">${x.sonuc === 'atla' ? '—' : x.cevap ? e(x.cevap) : '<i>boş</i>'}</span>
        <span class="ra-sonuc ${x.sonuc === 'yanlis' ? 'kotu' : x.sonuc === 'atla' ? '' : 'iyi'}">${SONUC_AD[x.sonuc] || x.sonuc}</span>
        ${x.sonuc === 'yanlis' ? `<span class="ra-dogru">doğrusu: <b>${e(x.tur === 'entr' ? trOf(w) : w)}</b></span>` : ''}</div>`).join('')}
        <a class="metin-dugme" href="#/k/${encodeURIComponent(w)}">Kelimeye git →</a></div>
    </details>`;
  };
  uyg.innerHTML = `<section class="dar rapor">
    <a class="geri" href="#/pratik">← Pratik</a>
    <h1 class="baslik-l">${cevap.length ? `${cevap.length} sorudan <em>${dogru}</em> doğru.` : 'Cevaplanan soru yok.'}</h1>
    ${yarida || atla ? `<p class="alt-yazi">${[yarida ? 'Ara verdin, kaldığın yer kaydedildi.' : '', atla ? `${atla} soru atlandı.` : ''].filter(Boolean).join(' ')}</p>` : ''}
    <div class="pa-eylem rapor-eylem">${yarida && oturumOku() ? `<button class="btn vurgu buyuk" id="devamEt">Devam et <span class="ok">→</span></button>` : `<button class="btn vurgu buyuk" id="yine">Bir tur daha <span class="ok">→</span></button>`}</div>
    ${zor.length ? `<section class="bolum"><div class="bolum-bas"><h2 class="kotu">Zorlandıkların · ${zor.length}</h2></div>${zor.map(kelimeKart).join('')}</section>` : ''}
    ${bildi.length ? `<section class="bolum"><div class="bolum-bas"><h2 class="iyi">Bildiklerin · ${bildi.length}</h2></div>${bildi.map(kelimeKart).join('')}</section>` : ''}
  </section>`;
  if ($('#devamEt')) $('#devamEt').onclick = () => turOyna(oturumOku());
  if ($('#yine')) $('#yine').onclick = async () => {
    try { turOyna(turKur(await istek('/pratik', { method: 'POST', govde: r.oturum.ayar }))); } catch (x) { if (x.message !== 'giriş') bildir(x.message); }
  };
}

// PWA
if (!PAKET && 'serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
yonlendir();
if (PAKET) setTimeout(() => { if (hatAyarOku().acik) hatirlatmaUygula().catch(() => {}); if (!location.hash.startsWith('#/video')) akisOnYukle(); }, 4000);   // 14 günlük bildirim penceresi + akışın ilk 2 videosu önceden   // 14 günlük pencereyi her açılışta yenile   // ilk video açılışı beklemesin
