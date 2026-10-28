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
        CAPPluginMethod(name: "onbellekListesi", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tani", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "kapakAl", returnType: CAPPluginReturnPromise)
    ]

    // oynatıcı havuzu: şu an oynayan + önceki + sıradaki 2 video ayrı AVPlayer'larda önceden hazırlanır (item yüklü, ilk kare çözülmüş, preroll yapılmış);
    // kaydırınca yeni video yüklenmez, hazır oynatıcının katmanı öne alınıp oynatılır (replaceCurrentItem+seek gecikmesi, ~150-250 ms, ortadan kalkar)
    private final class Yuva {
        let player = AVPlayer()
        var katman: AVPlayerLayer?
        var src: String?
        var damga = Date.distantPast
        var durumG: NSKeyValueObservation?
        var hazirG: NSKeyValueObservation?
        var zamanG: Any?
    }
    private let yuvaSayisi = 4   // şu anki + önceki + sıradaki 2
    private var yuvalar: [Yuva] = []
    private var aktif: Yuva!
    private var player: AVPlayer { aktif.player }
    private var oynatici: UIView?
    private var bittiGozlemci: NSObjectProtocol?
    private var hiz: Float = 1
    private var baslangic = Date()
    private var ilkKareGonderildi = false
    private var sonHazirdi = false, sonKopru = 0   // tanı: son oynatma havuzdan mı geldi, JS çağrısı yerel tarafa kaç ms'de ulaştı

    private func ilkKareBildir(_ yol: String) {
        ilkKareGonderildi = true
        notifyListeners("ilkKare", data: ["ms": Int(Date().timeIntervalSince(baslangic) * 1000), "hv": sonHazirdi, "kopru": sonKopru, "yol": yol])
    }

    override public func load() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
        for _ in 0..<yuvaSayisi {
            let y = Yuva()
            y.player.automaticallyWaitsToMinimizeStalling = false   // preroll(atRate:) için de şart
            y.player.isMuted = true
            y.player.actionAtItemEnd = .none
            y.zamanG = y.player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.05, preferredTimescale: 600), queue: .main) { [weak self, weak y] t in
                guard let self = self, let y = y, y === self.aktif, y.player.currentItem != nil else { return }
                let d = y.player.currentItem?.duration.seconds ?? 0
                if !self.ilkKareGonderildi, y.player.timeControlStatus == .playing, t.seconds > 0.04 {   // isReadyForDisplay yeni videoda değişmezse "ilk kare" hiç gelmezdi (kapak videonun üstünde kalıp donuk görünürdü): oynatma ilerliyorsa kare çizilmiştir
                    self.ilkKareBildir("zaman")
                }
                self.notifyListeners("zaman", data: ["t": t.seconds, "d": d.isFinite ? d : 0])
            }
            yuvalar.append(y)
        }
        aktif = yuvalar[0]
        NotificationCenter.default.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            for y in self.yuvalar where y !== self.aktif { self.yuvaBosalt(y) }   // bellek azsa komşu oynatıcıları bırak, şu anki sürer
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
        for u in sirali.filter({ $0.pathExtension == "mp4" }).dropFirst(onbellekSiniri) { try? fm.removeItem(at: u) }
        for u in sirali.filter({ $0.pathExtension == "jpg" }).dropFirst(onbellekSiniri * 5) { try? fm.removeItem(at: u) }
    }

    // kapak resmi: web görünümü sunucudan gelen kapağı çözemedi ("Cannot decode", telefonda ölçüldü 2026-10-27) → yerel taraf indirip diske yazar, JS dosya adresiyle gösterir
    private func kapakIndir(_ s: String, tamam: @escaping (URL?) -> Void) {
        guard let k = kimlik(s), let u = URL(string: s) else { tamam(nil); return }
        let hedef = onbellekKlasoru.appendingPathComponent(k + ".k2.jpg")   // k2: kapaklar videonun 0. karesinden yeniden üretildi (eski önbellek geçersiz)
        if FileManager.default.fileExists(atPath: hedef.path) { tamam(hedef); return }
        URLSession.shared.downloadTask(with: u) { tmp, yanit, _ in
            guard let tmp = tmp, (yanit as? HTTPURLResponse)?.statusCode == 200 else { DispatchQueue.main.async { tamam(nil) }; return }
            try? FileManager.default.removeItem(at: hedef)
            try? FileManager.default.moveItem(at: tmp, to: hedef)
            DispatchQueue.main.async { tamam(hedef) }
        }.resume()
    }

    @objc func kapakAl(_ call: CAPPluginCall) {
        guard let src = call.getString("src") else { call.reject("src yok"); return }
        kapakIndir(src) { u in if let u = u { call.resolve(["yol": u.path]) } else { call.reject("indirilemedi") } }
    }

    // tanı: ses neden gelmiyor? (sessiz bayrağı, ses seviyesi, videoda ses izi, oturum kategorisi, çıkış yolu)
    @objc func tani(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let s = AVAudioSession.sharedInstance()
            let izler = self.player.currentItem?.asset.tracks(withMediaType: .audio).count ?? -1
            call.resolve([
                "muted": self.player.isMuted,
                "vol": Double(self.player.volume),
                "izler": izler,
                "kategori": s.category.rawValue.replacingOccurrences(of: "AVAudioSessionCategory", with: ""),
                "cikti": Double(s.outputVolume),
                "rota": s.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ","),
                "diger": s.isOtherAudioPlaying
            ])
        }
    }

    @objc func onbellekListesi(_ call: CAPPluginCall) {
        let l = (try? FileManager.default.contentsOfDirectory(at: onbellekKlasoru, includingPropertiesForKeys: nil)) ?? []
        call.resolve(["ids": l.filter { $0.pathExtension == "mp4" }.map { $0.deletingPathExtension().lastPathComponent }])
    }

    private func item(_ s: String) -> AVPlayerItem? {
        guard let u = adres(s) else { return nil }
        let it = AVPlayerItem(asset: AVURLAsset(url: u))
        it.preferredForwardBufferDuration = 4
        return it
    }

    private func yuvaBosalt(_ y: Yuva) {
        y.player.pause(); y.player.replaceCurrentItem(with: nil)
        y.durumG = nil; y.src = nil; y.damga = .distantPast
    }

    // item'i yuvaya yükler; hazır olunca preroll ile ilk kareye ve oynatmaya hazırlar
    private func yukle(_ y: Yuva, src: String, item it: AVPlayerItem) {
        y.player.pause()
        y.src = src
        y.player.replaceCurrentItem(with: it)
        y.durumG = it.observe(\.status, options: [.new]) { [weak self, weak y] it, _ in
            guard let self = self, let y = y else { return }
            if it.status == .readyToPlay {
                if y.player.rate == 0 { y.player.preroll(atRate: 1) { _ in } }
            } else if it.status == .failed {
                y.src = nil
                if y === self.aktif { self.notifyListeners("hata", data: ["m": it.error?.localizedDescription ?? "hata"]) }
            }
        }
    }

    // şu anki dışındaki yuva: önce boş olan, yoksa en eski kullanılan. Korunan videoların (şu an açılacak + sıradaki 2) yuvası, zorla değilse ezilmez:
    // JS komşuları oynatmadan ÖNCE ister, korunmazsa az sonra açılacak videonun hazır yuvası boşa gidiyordu (telefonda ölçüldü: havuz0, ~120 ms)
    private var koru = Set<String>()
    private var bekleyen: [String] = []
    private func bosYuva(zorla: Bool = false) -> Yuva? {
        let aday = yuvalar.filter { $0 !== aktif && (zorla || $0.src == nil || !koru.contains($0.src!)) }
        return aday.first { $0.src == nil } ?? aday.min { $0.damga < $1.damga }
    }

    // komşuyu havuza al; yer yoksa (korunanlar dolu) bekletir, oynatma geçişinden sonra yerleştirilir
    private func yerlestir(_ src: String) {
        if let y = yuvalar.first(where: { $0.src == src && $0.player.currentItem != nil }) {
            if y !== aktif { y.damga = Date() }
        } else if let it = item(src), let y = bosYuva() {
            yukle(y, src: src, item: it)
            y.damga = Date()
        } else if !bekleyen.contains(src) { bekleyen.append(src) }
    }

    private func katmanGorunur(_ y: Yuva) {
        CATransaction.begin(); CATransaction.setDisableActions(true)
        for o in yuvalar { o.katman?.opacity = (o === y) ? 1 : 0 }
        CATransaction.commit()
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
                self.oynatici = v
                for y in self.yuvalar {
                    let k = AVPlayerLayer(player: y.player)
                    k.videoGravity = .resizeAspectFill
                    k.opacity = (y === self.aktif) ? 1 : 0
                    v.layer.addSublayer(k)
                    y.katman = k
                    y.hazirG = k.observe(\.isReadyForDisplay, options: [.new]) { [weak self, weak y] k, _ in
                        guard let self = self, let y = y, y === self.aktif, k.isReadyForDisplay, !self.ilkKareGonderildi else { return }
                        self.ilkKareBildir("kvo")
                    }
                }
            }
            self.oynatici?.frame = CGRect(x: wv.frame.minX + x, y: wv.frame.minY + y, width: w, height: h)
            CATransaction.begin(); CATransaction.setDisableActions(true)
            for yy in self.yuvalar { yy.katman?.frame = CGRect(x: 0, y: 0, width: w, height: h) }
            CATransaction.commit()
            self.oynatici?.isHidden = false
            call.resolve()
        }
    }

    @objc func kapat(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            for y in self.yuvalar { self.yuvaBosalt(y) }
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
            let onceki = self.aktif!
            if let t0 = call.getDouble("t0") { self.sonKopru = Int(Date().timeIntervalSince1970 * 1000 - t0) }
            var y = self.yuvalar.first { $0.src == src && $0.player.currentItem != nil }
            let hazirdi = y != nil
            self.sonHazirdi = hazirdi
            if y == nil {
                guard let it = self.item(src), let bos = (onceki.src == nil ? onceki : self.bosYuva(zorla: true)) else { call.reject("video bulunamadı"); return }
                self.yukle(bos, src: src, item: it)
                y = bos
            }
            guard let yeni = y else { call.reject("video bulunamadı"); return }
            self.ilkKareGonderildi = false
            self.baslangic = Date()
            self.beklenenOynuyor = true
            if onceki !== yeni {
                onceki.player.pause(); onceki.player.isMuted = true
                onceki.player.seek(to: .zero)   // geri kaydırınca da hazır beklesin
            }
            yeni.damga = Date()
            self.aktif = yeni
            yeni.player.isMuted = sessiz
            self.katmanGorunur(yeni)
            let baslat = { yeni.player.playImmediately(atRate: self.hiz) }
            if hazirdi && yeni.player.currentTime().seconds > 0.05 {
                yeni.player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero) { _ in DispatchQueue.main.async { baslat() } }
            } else { baslat() }
            if hazirdi, yeni.katman?.isReadyForDisplay == true {   // kare zaten çözülmüş: KVO yeniden tetiklenmez, ilk kare hemen
                self.ilkKareBildir("hazir")
            }
            let sirada = self.bekleyen; self.bekleyen = []
            for b in sirada { self.yerlestir(b) }   // geçiş bitti, eski yuva boşaldı: bekleyen komşular yerleşir
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

    // sıradaki videoyu önden hazırla: diske iner, "hazir" ise oynatıcı havuzunda ilk kareye hazırlanır
    @objc func onceden(_ call: CAPPluginCall) {
        guard let src = call.getString("src") else { call.resolve(); return }
        let koruYeni = (call.getArray("koru") as? [String]).map { Set($0) }
        DispatchQueue.main.async {
            if let k = koruYeni { self.koru = k }
            if src.hasPrefix("http") {
                self.diskeIndir(src)
                self.kapakIndir(src.replacingOccurrences(of: ".mp4", with: ".jpg")) { _ in }
            }
            // "hazir": yalnız en yakın 2 komşu oynatıcı havuzuna alınır; sonrakiler yalnız diske iner
            if call.getBool("hazir") ?? false {
                self.yerlestir(src)
            }
            call.resolve()
        }
    }
}
