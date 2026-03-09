# DemirkıranCAFE: Mimari ve Teknoloji Raporu

Bu rapor, DemirkıranCAFE projesinin altyapısını, kullanılan teknolojileri ve bu teknolojilerin neden seçildiğini detaylıca açıklar. Bir geliştirici veya sistem yöneticisi ile konuşurken projenin tüm noktalarına hakim olmanızı sağlayacak bir rehber niteliğindedir.

---

## 1. Genel Bakış ve Proje Amacı
**DemirkıranCAFE**, Discord alternatifleri tasarlanırken hafif, düşük gecikmeli (low-latency) iletişim, anlık mesajlaşma ve eşzamanlı video/ekran paylaşımı yapabilen; "odalar" (main, dev, side) bazlı bir masaüstü (ve potansiyel web) iletişim çözümüdür. 

Eşzamanlı müzik botu, ses algılama (VAD) gibi özelliklere sahip olan bu uygulama, yüksek performanslı bir ses-görüntü yönlendirme sistemi üzerine kurulmuştur.

---

## 2. Temel Mimari Bileşenleri

Proje klasik bir Monolitik sunucu ve İstemci (Client) mimarisinden ziyade, WebSocket ve WebRTC'nin birlikte harmanlandığı, medya iletişim yükünün özel bir servise devredildiği **SFU (Selective Forwarding Unit)** mimarisini kullanır.

### Nedir Bu SFU? (Neden P2P Kullanmadık?)
- **P2P (Peer-to-Peer):** Herkes kamerasını ve sesini odaya bağlı olan *diğer herkese* tek tek yollar. Odada 10 kişi varsa, bilgisayarınız 9 defa veriyi upload etmek zorunda kalır. Çok hızlı internet ister, CPU'yu sömürür.
- **SFU (Mediasoup ile):** Herkes kamerasını ve sesini *sadece sunucuya* 1 kez yollar. Sunucu (SFU), bu veriyi alır ve odadaki diğer kişilere o dağıtır. 
  - **Neden Seçtik?** Bant genişliği tasarrufu sağlar, 50-100 kişilik odalarda bile düşük internet bağlantısıyla sorunsuz çalışır. Modern uygulamalar (Discord, Google Meet, Zoom) bu mantığı kullanır.

---

## 3. Backend (Sunucu) Teknolojileri

Backend'in ana amacı Odaları yönetmek (Socket.IO üzerinden) ve Ses/Görüntü aktarımını (Mediasoup üzerinden) yönlendirmektir.

### **NestJS (Node.js Framework)**
- **Neden Seçildi?** Düz Express.js yazmak yerine, projenin kurumsal ve modüler bir yapıda (Controller, Service, Module) olması için seçildi. Nesne yönelimli programlama (OOP) ve TypeScript desteği kusursuzdur.
- **Görevleri:** Tüm Socket.IO Gateway'lerini barındırmak. Müzik Botu, Chat ve Mediasoup servislerini birbirinden bağımsız modüller olarak yönetmek.

### **Mediasoup (WebRTC SFU Motoru)**
- **Neden Seçildi?** Açık kaynak dünyasındaki **en performanslı, C++ tabanlı** WebRTC medya sunucusudur. CPU kullanımı çok düşüktür ve ultra düşük gecikme sağlar.
- **Nasıl Çalışır?** `Worker` (Çekirdek), `Router` (Oda) ve `Transport/Producer/Consumer` hiyerarşisiyle çalışır. Backend'deki `mediasoup.service.ts` bu karmaşık yapıyı yönetir.

### **Socket.IO**
- **Neden Seçildi?** WebRTC (Mediasoup) için cihazların birbirini bulması (Signaling) gerekir. Kullanıcıların chat mesajları, "odaya girdi/çıktı" bildirimleri veya Müzik Botunun anlık saniye/kuyruk eşitlemesi için gerçek zamanlı, çift yönlü ve kopmalara karşı dayanıklı olduğu için seçilmiştir.

---

## 4. Frontend (İstemci) Teknolojileri

Frontend, uygulamanın masaüstü kısmını ve kullanıcı arayüzünü oluşturur. Yüksek akıcılık ve native masaüstü hissiyatı hedeflenmiştir.

### **Electron.js**
- **Neden Seçildi?** Web standartlarıyla (HTML/CSS/JS) Windows/Mac/Linux için masaüstü uygulaması geliştirmemizi sağlar. Discord ve Slack de bu altyapıyı kullanır. 
- **Bize ne kattı?** Bildirim sistemleri, sistem tepsisi (tray), kısayol (keybind) yönetimi, otomatik güncellemeler (Auto Updater) yapabilmemizi sağladı.

### **React 19 & TypeScript**
- **Neden Seçildi?** Arayüzün bileşen tabanlı (component-based) olup kolay yönetilebilmesi için React seçildi. TypeScript ise koddaki hataların (yanlış değişken tipleri vb.) biz daha kodu yazarken editör tarafından yakalanması için elzemdi. Componentler arası gereksiz re-render'ları (kasmaları) önlemek için Custom Hook mantığı kullanıldı.

### **Vite**
- **Neden Seçildi?** Eski sistem Webpack yerine modern ve saniyeler içinde anında güncellemeleri ekrana yansıtan, inanılmaz hızlı bir derleyicidir (bundler). 

---

## 5. Öne Çıkan Özellikler ve Algoritmalar

Olası mülakatlarda veya projenin özellikleri sorulduğunda anlatman gereken teknik çözümler:

### **Global Keybinds & uIOhook**
Uygulama arka plandayken (örneğin siz oyun oynarken) mikrofonu `M` tuşuyla kapatmak için standart web tarayıcı API'leri yetmezdi (çünkü tarayıcı arkadayken klavyeyi dinleyemez). Bunun için sistemin düşük seviye klavye dinleyicisine bağlanan `uiohook-napi` kütüphanesini `main.js` (Node) kısmına gömdük.

### **Voice Activity Detection (VAD - Ses Algılama Sistemi)**
Kullanıcıların mikrofonu açık olsa bile, etraftaki ufak tıkırtılar veya nefes sesi karşıya gidip interneti harcamasın (ve yeşil halka yanmasın) diye AudioWorklet kullanıldı. 
- **Nasıl çalışır?** Kullanıcının ses dalgaları AnalyserNode ile ölçülür (`useVoiceActivity.ts`). Eğer ses belirli bir desibel eşiğini (threshold) aşarsa yayın başlar, altına düştüğünde sistem yayını keser.

### **Discord Tarzı Senkron Müzik Botu (Watch2Gether Mantığı)**
Piyasada müzik botları genellikle sunucuya şarkıyı MP3 / Ses dosyası olarak indirip onu bir sanal mikrofon üzerinden kanala geri yükler. Bu; sunucunun kotasını, CPU'sunu ve bellek sınırlarını çok hızlı tüketir ve çok geç tepki verir (şarkının indirilmesini beklemek).
- **Bizim Yaklaşımımız:** Şarkıyı sunucu indirmez. `yt-search` modülü ile sadece YouTube'dan videonun linki, süresi ve kapağı getirilir. Sunucu bir "Kronometre" gibi çalışır. Kullanıcı odaya girdiğinde sunucu der ki: *"Ben 3 dakika önce bir video başlattım. Linki bu."* Kullanıcının React uygulaması (*MusicPlayer.tsx*) bu bilgiyi alır, kendi arka planındaki görünmez YouTube Iframe player'ında (video player) videoyu `Date.now() - başlatmaZamanı` saniyesine sararak **herkesin aynı anda aynı saniyeyi** duymasını sağlar. Cihazlar sesi doğrudan YouTube üzerinden çeker, sunucu rahat eder.

### **Cihaz Hatırlama ve Oda Güvenliği (UUID Sistemi)**
Kullanıcı girişlerinde, kişilerin her seferinde "Şifreyi hatalı girdin" sorunları yaşamaması için `crypto.randomUUID()` ile bilgisayara kazınan (LocalStorage) eşsiz bir ID oluştururuz. Kullanıcı tekrar giriş yaptığında isim ve şifreye gerek kalmadan bu Token üzerinden hızlı geçiş (seamless login) yapar.

---

## 6. Projenin DevOps & Dağıtım Süreçleri

### **Docker (Backend)**
- `Dockerfile` ve `docker-compose.yml` kullanılarak uygulamanın çalışması için gerekli ortam (Node.js, Mediasoup'un ihtiyaç duyduğu C++ derleyiciler ve TCP/UDP network izinleri) kapsama / konteyner içine alındı. 
- **Avantajı:** "Benim bilgisayarımda çalışıyordu, sunucuda çalışmıyor" problemi bitti. Aynı imaj, indirildiği her yerde saniyesinde ayağa kalkabilir. Ayrıca UDP port aralıkları güvenlik için `40000-40100` ile sınırlandırılıp performans artırıldı.

### **Electron Builder - Auto Update (Frontend)**
- Geliştirilen Frontend Node kodları `electron-builder` ile sıkıştırılıp, `Asar` formatına (kodları gizleme formatı) dönüştürülür. Çıkan `.exe` dosyası doğrudan GitHub Releases ile yayınlanır. 
- İstemciler açılışta `.blockmap` mantığıyla dosyayı tarar, bir versiyon değişikliği sezerse Github deposundan sessizce sadece farkı indirip kullanıcıya "yeni sürüm yükleniyor" ibaresi sunar.

---

## Sonuç

DemirkıranCAFE, sıradan bir chat uygulaması değildir. Altında `SFU medya yönlendirmesi`, `IFrame zaman bükme senkronizasyonu (Müzik botu)`, `Düşük seviyeli klavye okuma (Global Keys)` ve `Ses Genliği analizcileri (VAD)` gibi ciddi donanım-ağ mühendisliği barındıran entegre, modern ve profesyonel bir Discord klonudur. Uzun süreli çalışmalara ve binlerce kişiyi idare edebilme altyapısına hazır şekilde Docker üzerinde konumlandırılmıştır.
