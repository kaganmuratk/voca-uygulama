// Kelime klipleri: YouTube'un resmî gömülü oynatıcısı (kendi altyazısı ve düğmeleri kapalı) + bizim altyazımız.
// Klip = kelimenin geçtiği cümle (+ kısa bağlam). Cümle bitince durur. Altyazıdaki kelimeye dokununca kısa anlam çıkar.
import { bicimRegex } from './bicim.js';
import { kokAdaylari } from './kok.js';
import { PAKET } from './ortam.js';
import { KopruOyuncu } from './yt-koprusu.js';

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let ytHazir = null;
export function ytYukle() {
  if (ytHazir) return ytHazir;
  ytHazir = new Promise((ok) => {
    // uygulama paketinde YouTube doğrudan gömülemez (Hata 153): köprü sayfasındaki oynatıcı, YT.Player ile aynı adlarla
    if (PAKET) { window.YT = { Player: KopruOyuncu }; return ok(); }
    if (window.YT?.Player) return ok();
    const once = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { once?.(); ok(); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    document.head.appendChild(s);
  });
  return ytHazir;
}
// Masaüstü ses kaydırıcısı (Kağan 2026-10-17): yalnız fare (hover + hassas imleç) olan cihazlarda; telefon/tablette cihazın ses tuşları yeter.
// YouTube oynatıcısının setVolume'u ile; düzey tarayıcıda hatırlanır. Hız düğmesinin soluna girer.
const SES_ANAHTAR = 'voca-ses';
export const masaustuMu = () => { try { return matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; } };
export function sesKontrolu(satir, oynatici) {
  if (!satir || !masaustuMu()) return null;
  let duzey = 100, son = 100;
  try { const h = localStorage.getItem(SES_ANAHTAR); if (h !== null && Number.isFinite(+h)) duzey = Math.min(100, Math.max(0, +h)); } catch {}
  if (duzey > 0) son = duzey;
  const kutu = document.createElement('span'); kutu.className = 'kk-ses';
  kutu.innerHTML = '<button class="kk" type="button" aria-label="Sesi kapat / aç"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path class="dalga" d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/></svg></button><input type="range" min="0" max="100" step="1" aria-label="Ses düzeyi">';
  const dugme = kutu.querySelector('button'), cubuk = kutu.querySelector('input');
  satir.insertBefore(kutu, satir.querySelector('[data-k="hiz"]') || null);
  const goster = () => { cubuk.value = duzey; dugme.classList.toggle('sessiz', duzey === 0); };
  const uygula = () => { try { oynatici()?.setVolume?.(duzey); } catch {} };
  const ayarla = (d) => { duzey = Math.min(100, Math.max(0, d)); if (duzey > 0) son = duzey; try { localStorage.setItem(SES_ANAHTAR, String(duzey)); } catch {} goster(); uygula(); };
  cubuk.addEventListener('input', () => ayarla(+cubuk.value));
  dugme.addEventListener('click', () => ayarla(duzey === 0 ? son : 0));
  goster();
  return { uygula };
}
const TR_ANAHTAR = 'voca-klip-tr';
// işlev kelimeleri (zamir, bağlaç, edat, tanımlık, yardımcı fiil): altyazıda tıklanmaz; isim/fiil/sıfat/zarf tıklanır
let KOLAY = new Set();
fetch('/kolay.json').then((r) => r.json()).then((l) => { KOLAY = new Set(l); }).catch(() => {});
const varyant = (w) => [w, w.replace(/ies$/, 'y'), w.replace(/ied$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ed$/, ''), w.replace(/d$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/ier$/, 'y'), w.replace(/iest$/, 'y'), w.replace(/er$/, ''), w.replace(/est$/, ''), w.replace(/ly$/, '')];
export function ogrenmeyeDeger(ham, ilk) {
  if (/[’']/.test(ham) && !/[’']s$/.test(ham)) return false;      // don't, it's, I'm
  const w = ham.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z-]/g, '');
  if (w.length < 3 || /\d/.test(ham)) return false;
  if (!ilk && /^[A-Z]/.test(ham.replace(/^[^A-Za-z]+/, ''))) return false; // cümle ortasında büyük harf: özel ad
  return !KOLAY.has(w);
}
const trAcik = () => { try { return localStorage.getItem(TR_ANAHTAR) !== '0'; } catch { return true; } };

// altyazı kelimesi → sözlük başlığı (basit kök bulma)
export function kokBul(t, dizin) {
  const w = t.toLowerCase().replace(/[’']s$/, '').replace(/[^a-z-]/g, '');
  if (!w) return null;
  const var_ = (x) => dizin.find((d) => d.k === x);
  for (const a of kokAdaylari(w)) {   // düzensiz (went → go) ve ünsüz ikizlenmesi (running → run) dahil
    const d = var_(a); if (d) return d;
  }
  return null;
}

// gizle: pratikte "Videodan dinle, yaz" — hedef kelime alt yazıda boşluk, kap'tan 'gizli' sınıfı kalkınca görünür
export function klipOynatici(kap, kelime, klipler, { dizin, ac, gizle = false }) {
  if (!klipler.length) { kap.innerHTML = '<p class="klip-yok">Bu kelime için henüz klip yok.</p>'; return () => {}; }
  let i = 0, oyn = null, hiz = 1, bitti = false, izleyici = null, zamanlar = [];
  kap.innerHTML = `
    <div class="klip-ekran"><div id="ytOyn"></div><div class="klip-kapak" aria-hidden="true"></div><div class="klip-bekle" hidden aria-label="Yükleniyor"><i></i></div></div>
    <div class="klip-alt">
      <p class="klip-en" aria-live="polite"></p>
      <p class="klip-tr"></p>
      <div class="klip-sozluk" hidden></div>
    </div>
    <div class="klip-kontrol">
      <button class="kk" data-k="geri" aria-label="Önceki klip">‹</button>
      <span class="kk-sayac"></span>
      <button class="kk" data-k="ileri" aria-label="Sonraki klip">›</button>
      <span class="kk-ara"></span>
      <button class="kk" data-k="oyna" aria-label="Oynat / durdur">▶</button>
      <button class="kk" data-k="tekrar" aria-label="Klibi tekrarla">↻</button>
      <button class="kk kk-yazi" data-k="hiz" aria-label="Hız">1×</button>
      <button class="kk kk-yazi ${trAcik() ? 'acik' : ''}" data-k="tr" aria-label="Türkçe satırı aç / kapat">TR</button>
    </div>
`;
  const $ = (s) => kap.querySelector(s);
  const sesK = sesKontrolu(kap.querySelector('.klip-kontrol'), () => oyn);
  // Türkçe satır: YouTube TR parçaları (trP: [ilk kelime sırası, metin]) oynarken karşılığı söylenince görünür;
  // hedef kelimenin Türkçe karşılığı (trV) İngilizcedeki gibi boyalı (Kağan, 2026-10-15)
  // Türkçe satır: YouTube TR parçası (trP: [ilk kelime sırası, metin]) karşılığı söylenince başlar; parçanın kelimeleri o
  // parçanın İngilizcesi konuşulurken sırayla açılır (Türkçe sözdizimi farklı: kelime kelime birebir eş yok, parça sınırı
  // konuşmaya bağlı, içi süreye yayılır; Kağan 2026-10-15). Hedef kelimenin Türkçe karşılığı (trV) boyalı.
  const trHtml = (k) => {
    if (!k.tr) return '';
    const N = zamanlar.length;
    const ps = k.trP?.length ? k.trP : [[0, k.tr]];
    const vb = k.trV ? k.tr.indexOf(k.trV) : -1, vs = vb + (k.trV?.length || 0);
    let o = 0; const out = [];
    ps.forEach(([n, m], pi) => {
      const son = pi + 1 < ps.length ? ps[pi + 1][0] : N;
      const ws = m.split(/(\s+)/), say = ws.filter((w) => w.trim()).length || 1;
      let j = 0;
      for (const w of ws) {
        if (!w) continue;
        if (!w.trim()) { out.push(w); o += w.length; continue; }
        const b = o; o += w.length;
        const kn = n + Math.floor((j++ * Math.max(1, son - n)) / say);
        const hedef = vb >= 0 && b < vs && o > vb;
        out.push(`<span class="tr-p${hedef ? ' tr-hedef' : ''}" data-n="${kn}">${e(w)}</span>`);
      }
    });
    return out.join('');
  };
  const trHepsi = () => kap.querySelectorAll('.tr-p.bekliyor').forEach((x) => x.classList.remove('bekliyor'));
  const altyazi = () => {
    const k = klipler[i];
    const r = bicimRegex(kelime);
    // karaoke: her kelimeye tahmini başlangıç zamanı (satır içinde harf uzunluğuna orantılı)
    zamanlar = [];
    const dilim = (metin, t0, t1) => {
      const ps = metin.split(/\s+/).filter(Boolean), top = ps.reduce((a, p) => a + p.length + 1, 0) || 1;
      let acc = 0; return ps.map((p) => { const t = t0 + (t1 - t0) * (acc / top); acc += p.length + 1; return t; });
    };
    let tOnce = k.once ? dilim(k.once, k.bas, k.cbas) : [], tCumle = dilim(k.cumle, k.cbas, k.son - .5);
    // dizinden gelen gerçek kelime zamanları (altyazı akışında birebir eşlenmiş). Dizin yalnız harf/rakam içeren
    // kelimeleri sayar; burada da aynı kuralla dağıtılır ("—" gibi işaretler bir önceki kelimenin zamanını alır).
    if (k.zaman?.length) {
      const say = (t) => /[a-z0-9']/i.test(t.toLowerCase().replace(/’/g, "'"));
      let z = 0, son = k.bas;
      const dagit = (metin) => metin.split(/\s+/).filter(Boolean).map((t) => { if (say(t) && z < k.zaman.length) son = k.zaman[z++]; return son; });
      tOnce = k.once ? dagit(k.once) : []; tCumle = dagit(k.cumle);
    }
    let sira = 0, kaynak = null;
    const kelimeler = (metin, soluk) => metin.split(/(\s+)/).map((p) => {
      if (/^\s+$/.test(p) || !p) return p;
      const vurgu = r.test(p.replace(/[^\w'-]/g, ''));
      const ilk = sira === 0;
      const t = (kaynak === 'once' ? tOnce : tCumle)[sira++];
      zamanlar.push(t);
      const n = zamanlar.length - 1;
      // öğrenmeye değer kelime tıklanabilir (altı noktalı), temel kelime düz metin (karaoke yine çalışır)
      return vurgu || ogrenmeyeDeger(p, ilk)
        ? `<button class="sozcuk ${vurgu ? 'hedef' : 'tik'} ${soluk ? 'soluk' : ''}" data-s="${e(p)}" data-n="${n}">${e(p)}</button>`
        : `<span class="sozcuk duz" data-n="${n}">${e(p)}</span>`;
    }).join('');
    // çok kelimeli ifadeyi bütün olarak vurgula
    let en = k.cumle, html;
    kaynak = 'once'; sira = 0; const onceHtml = k.once ? kelimeler(k.once, true) : '';
    kaynak = 'cumle'; sira = 0;
    const m = kelime.includes(' ') ? en.match(r) : null;
    if (m) html = kelimeler(en.slice(0, m.index)) + `<mark class="hedef-ifade">${kelimeler(m[0])}</mark>` + kelimeler(en.slice(m.index + m[0].length));
    else html = kelimeler(en);
    $('.klip-en').innerHTML = (k.once ? `<span class="once">${onceHtml}</span> ` : '') + html;
    $('.klip-tr').innerHTML = trHtml(k);
    $('.klip-tr').hidden = !trAcik() || !k.tr;
    $('.klip-sozluk').hidden = true;
    $('.kk-sayac').textContent = `${i + 1} / ${klipler.length}`;
    kap.querySelector('[data-k="geri"]').disabled = i === 0;
    kap.querySelector('[data-k="ileri"]').disabled = i === klipler.length - 1;
  };
  // Oynarken oynatıcıya komut GÖNDERİLMEZ (altyazı/ses/hız komutları telefonda YouTube'un kontrol katmanını,
  // yani ekrandaki durdur simgesini gösteriyor). Altyazı dil ayarıyla (hl=en, cc_load_policy=0) baştan kapalı.
  // Sayfa açılınca video arka planda sessizce ısınır, ilk klibin başında hazır bekler; oynat'a basınca anında başlar.
  let isiniyor = false, hazir = false;
  const isit = () => { isiniyor = true; hazir = false; oyn.mute(); oyn.seekTo(klipler[i].bas, true); oyn.playVideo(); };
  const yukle = () => {
    const k = klipler[i]; bitti = false; altyazi(); kapakResim(); kapak(true);
    // kullanıcı bastığı için doğrudan sesli başlar
    isiniyor = false; hazir = false; oyn?.unMute();
    bekle(true);
    oyn?.loadVideoById({ videoId: k.v, startSeconds: k.bas });
  };
  const kapakResim = () => { $('.klip-kapak').style.backgroundImage = `url(https://i.ytimg.com/vi/${klipler[i].v}/hqdefault.jpg)`; };
  const kapak = (goster) => $('.klip-kapak').classList.toggle('gizli', !goster);
  // yükleniyor işareti (Kağan, 2026-10-15): klip geçişinde ~1 sn ekran donuk görünüyordu
  const bekle = (acik) => { $('.klip-bekle').hidden = !acik; };
  const durumGoster = (oynuyor) => { kap.querySelector('[data-k="oyna"]').textContent = oynuyor ? '❚❚' : '▶'; };
  const karaoke = (t) => {
    let n = -1; for (let j = 0; j < zamanlar.length; j++) if (zamanlar[j] <= t) n = j;
    kap.querySelectorAll('.sozcuk.su-an').forEach((x) => { if (+x.dataset.n !== n) x.classList.remove('su-an'); });
    if (n >= 0) kap.querySelector(`.sozcuk[data-n="${n}"]`)?.classList.add('su-an');
    // yalnız oynarken parça parça; oynamıyorken satır bütün (okunabilsin)
    const oynuyor = oyn?.getPlayerState?.() === 1;
    if (klipler[i].tr) kap.querySelectorAll('.tr-p').forEach((x) => x.classList.toggle('bekliyor', oynuyor && +x.dataset.n > n));
  };
  // YouTube alt yazısını kapat: modülü kaldır + iz seçimini boşalt (en çok bildirilen iki yol birlikte)
  const ytAltyaziKapat = () => { try { oyn.setOption('captions', 'track', {}); } catch {} try { oyn.unloadModule('captions'); oyn.unloadModule('cc'); } catch {} };
  let altyaziKapandi = -1; // klip başına ilk oynamada bir kez daha
  ytYukle().then(() => {
    const k = klipler[0];
    oyn = window.vocaOyn = new YT.Player($('#ytOyn'), {
      videoId: k.v, host: 'https://www.youtube-nocookie.com',
      playerVars: { start: Math.floor(k.bas), autoplay: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, rel: 0, playsinline: 1, cc_load_policy: 0, cc_lang_pref: 'en', hl: 'en', modestbranding: 1 },
      events: {
        // YouTube bazen (özellikle girişsiz, tarayıcı/ülke ayarına göre) kendi alt yazısını açıyor → bizimkiyle çift oluyordu
        // (Kağan, 2026-10-15). Alt yazı modülü her yüklendiğinde kaldırılır.
        onApiChange: () => ytAltyaziKapat(),
        onReady: () => {
          // ısınma YOK (iPhone'da sessiz başlatıp hemen durdurmak tutmuyor). Kendiliğinden başlama YOK (Kağan 2026-10-14): yalnız oynat'a basınca.
          sesK?.uygula();
        },
        onStateChange: (ev) => {
          if (ev.data === 1 && isiniyor) {
            // ısınma bitti: başa dön, sesi aç, bekle (kapak hâlâ üstte)
            isiniyor = false; oyn.pauseVideo(); oyn.seekTo(klipler[i].bas, true); oyn.unMute(); hazir = true;
            return;
          }
          if (ev.data === 3) bekle(true); // arabelleğe alıyor
          if (ev.data === 1) {
            if (altyaziKapandi !== i) { altyaziKapandi = i; ytAltyaziKapat(); }
            bekle(false); kapak(false); durumGoster(true);
            clearInterval(izleyici); izleyici = setInterval(() => {
              const t = oyn.getCurrentTime();
              if (t >= klipler[i].son) { oyn.pauseVideo(); bitti = true; }
              karaoke(t);
              if (bitti) trHepsi();
            }, 60);
          } else if (!isiniyor) {
            if (ev.data === 0 || ev.data === 2) bekle(false); // durdu/bitti; -1 ve 5 (henüz başlamadı) sırasında işaret kalır
            clearInterval(izleyici); durumGoster(false);
            if (ev.data === 0) { bitti = true; trHepsi(); }
            // durunca kapak gelmez: videonun durduğu kare görünür (Kağan 2026-10-14). Kapak yalnız hiç oynamamışken.
          }
        },
      },
    });
  });
  altyazi(); kapakResim();
  let otoOynadi = false;
  const oynatDurdur = () => {
    if (!oyn) return;
    if (oyn.getPlayerState() === 1 && !isiniyor) { oyn.pauseVideo(); return; }
    isiniyor = false;
    if (oyn.isMuted?.()) oyn.unMute();
    const t = oyn.getCurrentTime();
    if (bitti || t >= klipler[i].son - .2 || t < klipler[i].bas - .5) oyn.seekTo(klipler[i].bas, true);
    bitti = false; bekle(true); oyn.playVideo();
  };
  // ekrana dokunmak da oynat/durdur (YouTube simgesi göründüğü için çalışması gerekir; Kağan 2026-10-14)
  $('.klip-ekran').onclick = oynatDurdur;
  kap.querySelector('.klip-kontrol').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b || !oyn) return;
    const k = b.dataset.k;
    if (k === 'geri' && i > 0) { i--; yukle(); }
    if (k === 'ileri' && i < klipler.length - 1) { i++; yukle(); }
    if (k === 'oyna') oynatDurdur();
    if (k === 'tekrar') { isiniyor = false; if (oyn.isMuted?.()) oyn.unMute(); bitti = false; bekle(true); oyn.seekTo(klipler[i].bas, true); oyn.playVideo(); }
    if (k === 'hiz') { hiz = hiz === 1 ? .75 : hiz === .75 ? .5 : 1; oyn.setPlaybackRate(hiz); b.textContent = (hiz === 1 ? '1' : String(hiz).replace('0.', ',')) + '×'; }
    if (k === 'tr') { const a = !trAcik(); try { localStorage.setItem(TR_ANAHTAR, a ? '1' : '0'); } catch {} b.classList.toggle('acik', a); $('.klip-tr').hidden = !a || !klipler[i].tr; }
  });
  // altyazıdaki kelime → kısa anlam
  $('.klip-en').addEventListener('click', (ev) => {
    const b = ev.target.closest('button.sozcuk'); if (!b || (gizle && kap.classList.contains('gizli'))) return;
    const kutu = $('.klip-sozluk');
    // aynı kelimeye tekrar dokununca kapanır
    if (b.classList.contains('secik')) { b.classList.remove('secik'); kutu.hidden = true; return; }
    const d = kokBul(b.dataset.s, dizin);
    kap.querySelectorAll('.sozcuk.secik').forEach((x) => x.classList.remove('secik')); b.classList.add('secik');
    kutu.hidden = false;
    kutu.innerHTML = d
      ? `<div class="ks-bas"><b>${e(d.k)}</b>${d.s ? ` <span class="seviye">${d.s}</span>` : ''}${d.k !== kelime ? `<button class="ks-git" data-k="${e(d.k)}">Detay →</button>` : ''}</div>
         <ol class="ks-anlamlar">${(d.an?.length ? d.an : [['', d.tr]]).map(([t, tr]) => `<li>${t ? `<i>${e(t)}</i> ` : ''}${e(tr)}</li>`).join('')}</ol>
         ${(d.an?.length || 0) > 1 ? '<p class="ks-not">Bu cümledeki anlamı için altındaki Türkçe satıra bak.</p>' : ''}`
      : `<b>${e(b.dataset.s.replace(/[^\w'-]/g, ''))}</b><span class="ks-tr ks-yok">Sözlükte henüz yok</span>`;
    const g = kutu.querySelector('.ks-git'); if (g) g.onclick = () => ac(g.dataset.k);
  });
  return () => { clearInterval(izleyici); try { oyn?.destroy(); } catch {} };
}
