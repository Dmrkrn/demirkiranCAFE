<h1 align="center">
  <img src="client/build/icon.png" width="48" alt="Icon">
  DemirkiranCAFE
</h1>

<p align="center">
  <strong>🎮 Arkadaşlar arası düşük gecikmeli, şifreli sesli ve görüntülü iletişim uygulaması.</strong><br>
  <em>A low-latency, encrypted voice and video communication app for friends.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/framework-Electron-9cf.svg" alt="Electron">
  <img src="https://img.shields.io/badge/backend-NestJS-E0234E.svg" alt="NestJS">
  <img src="https://img.shields.io/badge/webrtc-Mediasoup-333333.svg" alt="Mediasoup">
</p>

<p align="center">
  <a href="#-türkçe"><b>🇹🇷 TÜRKÇE</b></a> •
  <a href="#-english"><b>🇺🇸 ENGLISH</b></a>
</p>

---

<br/>

<h2 id="-türkçe">🇹🇷 Türkçe Dokümantasyon</h2>

DemirkiranCAFE, oyuncular ve arkadaş grupları için geliştirilmiş Discord benzeri, **özel sunucu mantığıyla çalışan** bir iletişim uygulamasıdır. Arka planda **Mediasoup (SFU)** mimarisi kullanarak ağ yormadan 1080p 60FPS'e kadar kamera ve ekran paylaşımı sunar.

### 📸 Arayüz & Özellikler

<div align="center">
  <img src="screenshots/main.JPG" width="80%" alt="Ana Sohbet - Main Chat">
  <p><i>Karanlık tema, modern arayüz ve kullanıcı dostu ses kontrolleri.</i></p>
</div>

<br/>

<div align="center">
  <img src="screenshots/screen.JPG" width="45%" alt="Ekran Paylaşımı">
  <img src="screenshots/music.JPG" width="45%" alt="Müzik Botu">
  <p><i>1080p 60FPS Ekran Paylaşımı ve YouTube Destekli Senkron Müzik Botu</i></p>
</div>

<br/>

<div align="center">
  <img src="screenshots/settings1.JPG" width="45%" alt="Ayarlar Cihazlar">
  <img src="screenshots/settings2.JPG" width="45%" alt="Ayarlar Kısayollar">
  <p><i>Gelişmiş Cihaz Yönetimi ve Özelleştirilebilir Kısayol Tuşları (Global uIOhook)</i></p>
</div>

<br/>

### ✨ Gelişmiş Özellikler

- 🎤 **Düşük Gecikmeli Ses & Video:** Mediasoup SFU mimarisi sayesinde sunucu medya akışlarını çözüp tekrar işlemez, doğrudan yönlendirir. Tüketim minimumdadır.
- 🎵 **Senkron Müzik Botu:** YouTube videolarını ve müziklerini odadaki herkesle *aynı anda, senkronize* dinleyin. Ses seviyesi lokal ayarlanabilir.
- 🖥️ **Donanım Hızlandırmalı Ekran Paylaşımı:** WebRTC üzerinden akıcı oyun ve ekran paylaşımı.
- 🎛️ **Bireysel Ses Kontrolleri:** Discord'da olduğu gibi odadaki her kullanıcının sesini ayrı ayrı kısıp açabilirsiniz.
- ⌨️ **Global Kısayol Tuşları (Hotkeys):** Oyun oynarken arkada çalışsa bile (uIOhook) mikrofonu `M`, hoparlörü `D` tuşu ile kapatıp açabilirsiniz (Özelleştirilebilir).
- 🔄 **Otomatik Güncelleme:** Electron-Updater ile yeni sürümler yayımlandığında arka planda otomatik güncellenir.

<br/>

### 🛠 Teknolojiler & Mimari

Uygulama **Client-Server** yapısında çalışır.

| Kategori | Teknoloji | Açıklama |
| :--- | :--- | :--- |
| **Frontend** | React 19 + Vite | Gelişmiş state yönetimi (Zustand) ve modern UI. |
| **Desktop App** | Electron | Çapraz platform masaüstü çerçevesi. |
| **Backend** | NestJS | Güvenilir ve modüler arka uç mimarisi. |
| **Realtime Media** | **Mediasoup (SFU)** | WebRTC Selective Forwarding Unit. Medya trafiğini yönetir. |
| **Signaling** | Socket.IO | Oda katılımı, müzik botu senkronu ve WebRTC sinyalleşmesi. |
| **Global Hooks** | uIOhook-Napi | Oyun oynarken bile arka planda global klavye dinleme. |

#### 🏗️ SFU (Selective Forwarding Unit) Mimarisi 
Geleneksel P2P (Peer-to-Peer) yapısında 10 kişilik bir odada herkes birbirine görüntü gönderir (Ağ kartı çöker). SFU mimarisi (Mediasoup) ile herkes görüntüsünü **sadece 1 kez sunucuya gönderir**, sunucu bu görüntüyü diğer 9 kişiye yönlendirir. İstemci yorulmaz.

<br/>

### 🚀 Kurulum

#### 🎮 Kullanıcılar İçin (Oynamaya Hazır)
1. **[Releases](https://github.com/Dmrkrn/demirkiranCAFE/releases)** sayfasından en güncel `DemirkiranCAFE Setup X.X.X.exe` sürümünü indirin.
2. Kurulumu tamamlayın, yönetici onayı verin (Global klavye kısayolları için gereklidir).
3. Kullanıcı adınızı ve ODA Şifrenizi girip sohbete katılın.

#### 👨‍💻 Geliştiriciler İçin (Derleme)
Bütün projeyi kendi sunucunuza (Örn: DigitalOcean VPS) kurmak ve düzenlemek için:

**1. Sunucu (Backend) Kurulumu**
```bash
git clone https://github.com/Dmrkrn/demirkiranCAFE.git
cd demirkiranCAFE/backend
npm install
# .env ayarlarını kendi IP'nize göre yapın
npm run start:dev
# veya Docker ile: docker-compose up -d --build
```

**2. Masaüstü İstemci (Client) Kurulumu**
```bash
cd demirkiranCAFE/client
npm install
npm run electron:dev # Geliştirici modunda çalıştır

# .exe Çıktısı Almak İçin:
npm run electron:build
```

---
<br/><br/>

<h2 id="-english">🇺🇸 English Documentation</h2>

DemirkiranCAFE is a privately hosted, Discord-like communication app designed for gamers and friend groups. Utilizing **Mediasoup (SFU)** architecture, it provides up to 1080p 60FPS camera and screen sharing with minimal network overhead.

### ✨ Key Features

- 🎤 **Low-Latency Voice & Video:** Powered by Mediasoup SFU. The server routes media streams directly without CPU-heavy transcoding.
- 🎵 **Synchronized Music Bot:** Listen to YouTube music and videos perfectly synced with everyone in the room. Local volume control is supported.
- 🖥️ **Hardware-Accelerated Screen Share:** Fluid game and desktop sharing over WebRTC.
- 🎛️ **Per-User Volume Controls:** Adjust the specific volume of any individual user in the room, just like Discord.
- ⌨️ **Global Hotkeys:** Toggle your Mic (`M`) or Deafen (`D`) even while alt-tabbed or in-game, powered by low-level `uIOhook` (Fully customizable in Settings).
- 🔄 **Auto-Updates:** Seamless background updates via Electron-Updater when a new release is published.

### 🛠 Tech Stack & Architecture

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React 19 + Vite | State management (Zustand) & modern UI. |
| **Desktop App** | Electron | Cross-platform desktop framework. |
| **Backend** | NestJS | Scalable Node.js server framework. |
| **Media Server**| **Mediasoup (SFU)** | WebRTC Selective Forwarding Unit for routing tracks. |
| **Signaling** | Socket.IO | Room joins, synchronized music bot states, WebRTC signaling. |
| **Global Hooks** | uIOhook-Napi | OS-level keyboard listeners for background hotkeys. |

#### 🏗️ Why SFU (Selective Forwarding Unit)?
In standard P2P, in a 10-person room, you upload your video 9 times (crushing your bandwidth). With Mediasoup SFU, you upload your video **exactly once** to the server, and the server distributes it to the other 9 people. Your bandwidth usage stays minimal.

<br/>

### 🚀 Installation

#### 🎮 For Users
1. Download the latest `DemirkiranCAFE Setup X.X.X.exe` from the **[Releases](https://github.com/Dmrkrn/demirkiranCAFE/releases)** page.
2. Install the app (Administrator privileges may be requested by Windows for Global Hotkeys to function inside games).
3. Enter your Username and the Room Password to join!

#### 👨‍💻 For Developers (Build from Source)

**1. Backend Setup**
```bash
git clone https://github.com/Dmrkrn/demirkiranCAFE.git
cd demirkiranCAFE/backend
npm install
# Configure your .env config with your public IP
npm run start:dev
```

**2. Client Setup**
```bash
cd demirkiranCAFE/client
npm install
npm run electron:dev # Run in development mode

# To Compile to .exe:
npm run electron:build
```

---

<div align="center">
  <h3>👨‍💻 Developer</h3>
  <b>Dmrkrn</b><br>
  <a href="https://github.com/Dmrkrn">GitHub</a> • 
  <a href="https://www.linkedin.com/in/dmrkrn/">LinkedIn</a> • 
  <a href="https://dmrkrn.com/">Portfolio</a>
  <br><br>
  <i>Licensed under the MIT License.</i>
</div>