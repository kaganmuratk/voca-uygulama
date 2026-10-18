// Uygulama içinde YouTube oynatıcısı: arayüz capacitor:// kökeninden yüklendiği için YouTube doğrudan gömmeye Hata 153 veriyor.
// Çözüm: kendi sitemizdeki /oynatici.html sayfasını iframe ile aç (YouTube oynatıcıyı bizim https adresimizin açtığını görür),
// postMessage ile yönet. Bu sınıf YT.Player'ın klip.js/video.js'te kullanılan alt kümesini aynı adlarla verir.
import { SITE } from './ortam.js';

let sayac = 0;
export class KopruOyuncu {
  constructor(hedef, secenek = {}) {
    this.k = { t: 0, durum: -1, sure: 0, hiz: 1 }; this.zT = 0; this.mesaj = 0;
    this.sessiz = false; this.ses = 100; this.olay = secenek.events || {};
    this.hazirMi = false; this.kimlik = 'k' + (++sayac);
    const pv = secenek.playerVars || {};
    const q = new URLSearchParams({ v: secenek.videoId || '', c: String(pv.controls ?? 0), id: this.kimlik });
    if (pv.start) q.set('s', String(pv.start));
    if (pv.autoplay) q.set('a', '1');
    this.cerceve = document.createElement('iframe');
    this.cerceve.src = SITE + '/oynatici.html?' + q;
    this.cerceve.allow = 'autoplay; encrypted-media; fullscreen';
    this.cerceve.setAttribute('playsinline', '');
    this.cerceve.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block';
    const kap = typeof hedef === 'string' ? document.querySelector(hedef) : hedef;
    kap.replaceChildren(this.cerceve);
    this.dinle = (e) => {
      const m = e.data;
      if (!m || m.voca !== 1 || e.source !== this.cerceve.contentWindow) return;
      if (m.tur === 'hazir') { this.hazirMi = true; this.olay.onReady?.({ target: this }); this.olay.onApiChange?.({}); }
      else if (m.tur === 'hata') this.olay.onError?.({ data: m.kod });
      else if (m.tur === 'zaman') {
        const onceki = this.k.durum;
        this.k = { t: m.t, durum: m.durum, sure: m.sure, hiz: m.hiz }; if (typeof m.ses === 'boolean') this.sessiz = m.ses; this.zT = performance.now(); this.mesaj++;
        if (m.durum !== onceki) this.olay.onStateChange?.({ data: m.durum, target: this });
      }
    };
    window.addEventListener('message', this.dinle);
  }
  gonder(m) { try { this.cerceve.contentWindow?.postMessage({ voca: 1, ...m }, '*'); } catch { /* sayfa yüklenmedi */ } }
  playVideo() { this.gonder({ komut: 'oynat' }); }
  pauseVideo() { this.gonder({ komut: 'durdur' }); }
  seekTo(t) { this.k.t = t; this.gonder({ komut: 'git', t }); }
  // Köprüden gelen zaman seyrekleşirse (iOS arka plan iframe zamanlayıcıları kısılabilir) oynarken yerel saatle ileri say
  getCurrentTime() { const g = this.k.durum === 1 && this.zT ? (performance.now() - this.zT) / 1000 : 0; return this.k.t + Math.min(g, 3) * (this.k.hiz || 1); }
  getDuration() { return this.k.sure; }
  getPlayerState() { return this.k.durum; }
  getPlaybackRate() { return this.k.hiz; }
  setPlaybackRate(h) { this.k.hiz = h; this.gonder({ komut: 'hiz', h }); }
  setVolume(n) { this.ses = n; this.gonder({ komut: 'ses', n }); }
  mute() { this.sessiz = true; this.gonder({ komut: 'sessiz', b: true }); }
  unMute() { this.sessiz = false; this.gonder({ komut: 'sessiz', b: false }); }
  isMuted() { return this.sessiz; }
  loadVideoById(a) { const v = typeof a === 'string' ? a : a.videoId, bas = typeof a === 'string' ? 0 : (a.startSeconds || 0); this.gonder({ komut: 'yukle', v, bas }); }
  // YouTube'un kendi altyazısını kapatma köprü sayfasında yapılır
  setOption() {} unloadModule() {}
  destroy() { window.removeEventListener('message', this.dinle); this.cerceve.remove(); }
}
