import Foundation
import UIKit
import AVFoundation
import Capacitor

// Voca yerel video oynatıcı: video, web görünümünün ALTINDAKİ bir katmanda AVPlayer ile oynar (iOS'un kendi oynatıcısı:
// Düşük Güç Modu / otomatik başlatma kısıtı yok). Arayüz (altyazı, düğmeler) web görünümünde kalır; web görünümü şeffaf yapılır.
// JS: Capacitor.registerPlugin('VocaVideo'). Olaylar: ilkKare, zaman {t, d}, bitti, hata {m}.
@objc(VocaVideoPlugin)
public class VocaVideoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VocaVideoPlugin"
    public let jsName = "VocaVideo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ac", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kapat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "oynat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "duraklat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "surdur", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sesAyarla", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hizAyarla", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "onceden", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "durdur", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "onbellekListesi", returnType: CAPPluginReturnPromise)
    ]

    private let player = AVPlayer()
    private var oynatici: UIView?
    private var katman: AVPlayerLayer?
    private var zamanGozlemci: Any?
    private var durumGozlemci: NSKeyValueObservation?
    private var hazirGozlemci: NSKeyValueObservation?
    private var itemGozlemci: NSKeyValueObservation?
    private var bittiGozlemci: NSObjectProtocol?
    private var hiz: Float = 1
    private var baslangic = Date()
    private var onbellek: [String: AVPlayerItem] = [:]
    private var onbellekSira: [String] = []
    private var ilkKareGonderildi = false

    override public func load() {
        player.automaticallyWaitsToMinimizeStalling = false
        player.isMuted = true
        player.actionAtItemEnd = .none
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
        zamanGozlemci = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.05, preferredTimescale: 600), queue: .main) { [weak self] t in
            guard let self = self, self.player.currentItem != nil else { return }
            let d = self.player.currentItem?.duration.seconds ?? 0
            self.notifyListeners("zaman", data: ["t": t.seconds, "d": d.isFinite ? d : 0])
        }
        arkaPlanKur()
        bittiGozlemci = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] n in
            guard let self = self, let it = n.object as? AVPlayerItem, it === self.player.currentItem else { return }
            self.player.seek(to: .zero) { _ in if self.player.rate == 0 && self.beklenenOynuyor { self.player.rate = self.hiz } }
            self.notifyListeners("bitti", data: [:])
        }
    }

    private var beklenenOynuyor = false
    private var arkaPlandaOynuyordu = false

    // uygulama arka plana gidince ses/video durur, dönünce kaldığı yerden sürer
    private func arkaPlanKur() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            self.arkaPlandaOynuyordu = self.beklenenOynuyor
            self.player.pause()
        }
        nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            if self.arkaPlandaOynuyordu && self.beklenenOynuyor { self.player.playImmediately(atRate: self.hiz) }
            self.arkaPlandaOynuyordu = false
        }
    }

    // yol çözümü: http(s) adresi olduğu gibi, "/akis-video/x.mp4" gibi yollar uygulama paketindeki public klasöründen
    private func adres(_ s: String) -> URL? {
        if s.hasPrefix("http://") || s.hasPrefix("https://") { return yerelKopya(s) ?? URL(string: s) }
        let yol = s.hasPrefix("/") ? String(s.dropFirst()) : s
        let u = Bundle.main.bundleURL.appendingPathComponent("public").appendingPathComponent(yol)
        return FileManager.default.fileExists(atPath: u.path) ? u : nil
    }

    // kalıcı disk önbelleği: sunucudaki videolar sıradakiler önden telefona iner (Caches/voca-video/<kimlik>.mp4); sonraki açılışta ilk video internetsiz hazırdır. En çok 12 dosya tutulur.
    private let onbellekSiniri = 12
    private var indirilenler = Set<String>()
    private lazy var onbellekKlasoru: URL = {
        let u = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("voca-video")
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()

    private func kimlik(_ s: String) -> String? {
        guard let u = URL(string: s) else { return nil }
        let k = u.deletingPathExtension().lastPathComponent
        return k.isEmpty ? nil : k
    }

    private func yerelKopya(_ s: String) -> URL? {
        guard let k = kimlik(s) else { return nil }
        let u = onbellekKlasoru.appendingPathComponent(k + ".mp4")
        return FileManager.default.fileExists(atPath: u.path) ? u : nil
    }

    private func diskeIndir(_ s: String) {
        guard let k = kimlik(s), let u = URL(string: s), yerelKopya(s) == nil, !indirilenler.contains(k) else { return }
        indirilenler.insert(k)
        let hedef = onbellekKlasoru.appendingPathComponent(k + ".mp4")
        URLSession.shared.downloadTask(with: u) { [weak self] tmp, yanit, _ in
            if let tmp = tmp, (yanit as? HTTPURLResponse)?.statusCode == 200 {
                try? FileManager.default.removeItem(at: hedef)
                try? FileManager.default.moveItem(at: tmp, to: hedef)
            }
            DispatchQueue.main.async { self?.indirilenler.remove(k); self?.onbellekTemizle() }
        }.resume()
    }

    private func onbellekTemizle() {
        let fm = FileManager.default
        guard let l = try? fm.contentsOfDirectory(at: onbellekKlasoru, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let sirali = l.sorted { (a, b) in
            let da = (try? a.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let db = (try? b.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return da > db
        }
        for u in sirali.dropFirst(onbellekSiniri) { try? fm.removeItem(at: u) }
    }

    @objc func onbellekListesi(_ call: CAPPluginCall) {
        let l = (try? FileManager.default.contentsOfDirectory(at: onbellekKlasoru, includingPropertiesForKeys: nil)) ?? []
        call.resolve(["ids": l.filter { $0.pathExtension == "mp4" }.map { $0.deletingPathExtension().lastPathComponent }])
    }

    private func item(_ s: String) -> AVPlayerItem? {
        if let o = onbellek[s] { onbellek[s] = nil; onbellekSira.removeAll { $0 == s }; return o }
        guard let u = adres(s) else { return nil }
        let it = AVPlayerItem(asset: AVURLAsset(url: u))
        it.preferredForwardBufferDuration = 4
        return it
    }

    private func gozlemKur(_ it: AVPlayerItem) {
        itemGozlemci = it.observe(\.status, options: [.new]) { [weak self] it, _ in
            if it.status == .failed {
                self?.notifyListeners("hata", data: ["m": it.error?.localizedDescription ?? "hata"])
            }
        }
    }

    @objc func ac(_ call: CAPPluginCall) {
        let x = call.getDouble("x") ?? 0, y = call.getDouble("y") ?? 0
        let w = call.getDouble("w") ?? 0, h = call.getDouble("h") ?? 0
        DispatchQueue.main.async {
            guard let wv = self.bridge?.webView, let ust = wv.superview else { call.reject("web görünümü yok"); return }
            wv.isOpaque = false
            wv.backgroundColor = .clear
            wv.scrollView.backgroundColor = .clear
            if self.oynatici == nil {
                let v = UIView()
                v.backgroundColor = .black
                v.isUserInteractionEnabled = false
                ust.insertSubview(v, belowSubview: wv)
                let k = AVPlayerLayer(player: self.player)
                k.videoGravity = .resizeAspectFill
                v.layer.addSublayer(k)
                self.oynatici = v; self.katman = k
                self.hazirGozlemci = k.observe(\.isReadyForDisplay, options: [.new]) { [weak self] k, _ in
                    guard let self = self, k.isReadyForDisplay, !self.ilkKareGonderildi else { return }
                    self.ilkKareGonderildi = true
                    self.notifyListeners("ilkKare", data: ["ms": Int(Date().timeIntervalSince(self.baslangic) * 1000)])
                }
            }
            self.oynatici?.frame = CGRect(x: wv.frame.minX + x, y: wv.frame.minY + y, width: w, height: h)
            self.katman?.frame = CGRect(x: 0, y: 0, width: w, height: h)
            self.oynatici?.isHidden = false
            call.resolve()
        }
    }

    @objc func kapat(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.player.pause(); self.player.replaceCurrentItem(with: nil)
            self.beklenenOynuyor = false
            self.oynatici?.isHidden = true
            call.resolve()
        }
    }

    @objc func oynat(_ call: CAPPluginCall) {
        guard let src = call.getString("src") else { call.reject("src yok"); return }
        let sessiz = call.getBool("sessiz") ?? true
        hiz = Float(call.getDouble("hiz") ?? 1)
        DispatchQueue.main.async {
            guard let it = self.item(src) else { call.reject("video bulunamadı"); return }
            self.ilkKareGonderildi = false
            self.baslangic = Date()
            self.beklenenOynuyor = true
            self.gozlemKur(it)
            self.player.isMuted = sessiz
            self.player.replaceCurrentItem(with: it)
            self.player.seek(to: .zero)
            self.player.playImmediately(atRate: self.hiz)
            call.resolve()
        }
    }

    @objc func duraklat(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.beklenenOynuyor = false; self.player.pause(); call.resolve() }
    }

    @objc func surdur(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.beklenenOynuyor = true; self.player.playImmediately(atRate: self.hiz); call.resolve() }
    }

    @objc func durdur(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.beklenenOynuyor = false
            self.player.pause()
            self.player.seek(to: .zero)
            call.resolve()
        }
    }

    @objc func sar(_ call: CAPPluginCall) {
        let t = call.getDouble("t") ?? 0
        DispatchQueue.main.async { self.player.seek(to: CMTime(seconds: t, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { _ in call.resolve() } }
    }

    @objc func sesAyarla(_ call: CAPPluginCall) {
        let s = call.getBool("sessiz") ?? true
        DispatchQueue.main.async { self.player.isMuted = s; call.resolve() }
    }

    @objc func hizAyarla(_ call: CAPPluginCall) {
        hiz = Float(call.getDouble("hiz") ?? 1)
        DispatchQueue.main.async { if self.player.rate != 0 { self.player.rate = self.hiz }; call.resolve() }
    }

    // sıradaki videoyu önden hazırla (ilk parçalar iner); en çok 3 tane tutulur
    @objc func onceden(_ call: CAPPluginCall) {
        guard let src = call.getString("src") else { call.resolve(); return }
        DispatchQueue.main.async {
            if src.hasPrefix("http") { self.diskeIndir(src) }
            if self.onbellek[src] == nil, let u = self.adres(src) {
                let it = AVPlayerItem(asset: AVURLAsset(url: u))
                it.preferredForwardBufferDuration = 4
                self.onbellek[src] = it; self.onbellekSira.append(src)
                while self.onbellekSira.count > 3 { let eski = self.onbellekSira.removeFirst(); self.onbellek[eski] = nil }
                it.asset.loadValuesAsynchronously(forKeys: ["playable"], completionHandler: nil)
            }
            call.resolve()
        }
    }
}
