<h1 align="center">DemirkiranCAFE</h1>

<p align="center">
  <strong>🎮 Arkadaşlar arası sesli/görüntülü iletişim uygulaması / Real-time voice & video communication app for friends</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.4-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey.svg" alt="Platform">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

<p align="center">
  <a href="#-türkçe">🇹🇷 Türkçe</a> •
  <a href="#-english">🇬🇧 English</a>
</p>

---

<h2 id="-türkçe">🇹🇷 Türkçe</h2>

<p align="center">
  <a href="#-özellikler">Özellikler</a> •
  <a href="#-kurulum">Kurulum</a> •
  <a href="#%EF%B8%8F-teknolojiler">Teknolojiler</a> •
  <a href="#-mimari">Mimari</a>
</p>

### 📸 Ekran Görüntüleri

<div align="center">
  <img src="screenshots/login.png" width="45%" alt="Giriş Ekranı">
  <img src="screenshots/main.png" width="45%" alt="Ana Sohbet">
</div>
<div align="center">
  <img src="screenshots/screenshare.png" width="45%" alt="Ekran Paylaşımı">
  <img src="screenshots/settings.png" width="45%" alt="Ayarlar">
</div>
<div align="center">
  <br/>
  <h3>Yeni Arayüz (v1.0.4)</h3>
  <img src="README_assets/screenshot_v1.0.7.png" width="80%" alt="v1.0.4 Arayüzü">
</div>

### ✨ Özellikler

| Özellik | Açıklama |
|---------|----------|
| 🎤 **Sesli Sohbet** | Düşük gecikmeli, yüksek kaliteli ses iletimi |
| 📹 **Görüntülü Sohbet** | 1080p'ye kadar video kalitesi |
| 🖥️ **Ekran Paylaşımı** | Oyun, uygulama veya tam ekran paylaşımı |
| 👥 **10 Kullanıcı** | Eşzamanlı 10 kişiye kadar destek |
| 🔐 **Şifre Koruması** | Özel oda erişimi için şifre sistemi |
| 🔄 **Otomatik Güncelleme** | Yeni sürümler otomatik indirilir |
| 🎨 **Modern Arayüz** | Discord benzeri koyu tema tasarım |
| ⌨️ **Kısayol Tuşları** | M: Mikrofon, D: Sağır modu |

### 🚀 Kurulum

#### Kullanıcılar İçin (Hazır Uygulama)

1. [Releases](https://github.com/Dmrkrn/demirkiranCAFE/releases) sayfasından son sürümü indir
2. `DemirkiranCAFE Setup X.X.X.exe` dosyasını çalıştır
3. Kurulumu tamamla ve uygulamayı aç
4. Kullanıcı adı ve oda şifresini girerek bağlan

#### Geliştiriciler İçin

**Gereksinimler:** Node.js 18+, Python 3.x, Visual Studio Build Tools

**Backend:**
```bash
cd backend
npm install
npm run start:dev
```

**Client:**
```bash
cd client
npm install
npm run electron:dev
```

**Production Build:**
```bash
cd client
npm run electron:build
```

### 🛠️ Teknolojiler

*   **Backend:** NestJS, mediasoup (SFU), Socket.io, TypeScript
*   **Frontend:** Electron, React 19, Vite, mediasoup-client, TypeScript
*   **Altyapı:** WebRTC, DTLS/SRTP, electron-updater, electron-builder

### 🏗️ Mimari

Uygulama **mediasoup** kullanarak SFU (Selective Forwarding Unit) mimarisi üzerine kuruludur. Bu sayede sunucu streamleri transcode etmez, sadece yönlendirir. Bu da düşük CPU kullanımı ve yüksek performans sağlar.

### 📝 Güncelleme Geçmişi

**v1.0.4 (2026-02-02)**
- 🎨 **Arayüz İyileştirmeleri**: İkonlar yenilendi ve hizalama sorunları giderildi.
- 🎛️ **Gelişmiş Ses Kontrolü**: Kullanıcı bazlı ses seviyesi ayarı eklendi.
- 🖥️ **Tam Ekran Modu**: Videolara tıklayarak tam ekran yapabilme özelliği.
- 🎤 **Mikrofon Testi**: Ayarlar panelinde görsel mikrofon testi ve loopback özelliği.

---

<h2 id="-english">🇬🇧 English</h2>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-installation">Installation</a> •
  <a href="#%EF%B8%8F-tech-stack">Tech Stack</a> •
  <a href="#-architecture">Architecture</a>
</p>

### 📸 Screenshots

*(See screenshots above / Yukarıdaki ekran görüntülerine bakınız)*

### ✨ Features

| Feature | Description |
|---------|-------------|
| 🎤 **Voice Chat** | Low latency, high quality audio transmission |
| 📹 **Video Chat** | Up to 1080p video quality |
| 🖥️ **Screen Share** | Share games, apps or full screen |
| 👥 **10 Users** | Support for up to 10 concurrent users |
| 🔐 **Password Protection** | Room password system for privacy |
| 🔄 **Auto Update** | Automatically downloads new versions |
| 🎨 **Modern UI** | Discord-like dark theme design |
| ⌨️ **Shortcuts** | M: Toggle Mic, D: Deafen |

### 🚀 Installation

#### For Users (Ready to Use)

1. Download the latest version from [Releases](https://github.com/Dmrkrn/demirkiranCAFE/releases)
2. Run `DemirkiranCAFE Setup X.X.X.exe`
3. Complete installation and launch the app
4. Connect using your username and room password

#### For Developers

**Prerequisites:** Node.js 18+, Python 3.x, Visual Studio Build Tools

**Backend:**
```bash
cd backend
npm install
npm run start:dev
```

**Client:**
```bash
cd client
npm install
npm run electron:dev
```

**Production Build:**
```bash
cd client
npm run electron:build
```

### 🛠️ Tech Stack

*   **Backend:** NestJS, mediasoup (SFU), Socket.io, TypeScript
*   **Frontend:** Electron, React 19, Vite, mediasoup-client, TypeScript
*   **Infrastructure:** WebRTC, DTLS/SRTP, electron-updater, electron-builder

### 🏗️ Architecture

The application is built on **mediasoup** using SFU (Selective Forwarding Unit) architecture. The server routes media streams without transcoding, ensuring low CPU usage and high performance.

### 📝 Changelog

**v1.0.4 (2026-02-02)**
- 🎨 **UI Improvements**: Updated icons and fixed alignment issues.
- 🎛️ **Advanced Audio Control**: Added per-user volume control.
- 🖥️ **Fullscreen Mode**: Click on videos to toggle fullscreen.
- 🎤 **Mic Test**: Visual microphone test and loopback feature in settings.
- 🐛 **Bug Fixes**: Resolved layout shifts and build issues.

---

## 👨‍💻 Developer

**Dmrkrn**

- GitHub: [@Dmrkrn](https://github.com/Dmrkrn)
- LinkedIn: [@Dmrkrn](https://www.linkedin.com/in/dmrkrn/)
- Portfolio: [@Dmrkrn](https://dmrkrn.com/)

## 📄 License

This project is licensed under the [MIT](LICENSE) license.