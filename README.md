# Private Stream App (DemirkiranCAFE)

Arkadaşlar arası kullanım için geliştirilmiş, yüksek performanslı bir sesli/görüntülü iletişim uygulaması.
Discord ve TeamSpeak benzeri, SFU (Selective Forwarding Unit) mimarisi kullanılarak geliştirilmiştir.

## 🚀 Özellikler

- **10 kişiye kadar** eşzamanlı kullanıcı desteği
- **1080p** video kalitesi
- **Ekran paylaşımı** (oyun, uygulama, tam ekran)
- **Düşük gecikme** (low-latency) ses iletimi
- **Masaüstü uygulaması** (Electron)

## 🛠️ Teknoloji Yığını

| Bileşen | Teknoloji |
|---------|-----------|
| **Backend** | NestJS + mediasoup (SFU) |
| **Frontend** | Electron + React (Vite) |
| **Signaling** | Socket.io (WebSocket) |
| **Media** | WebRTC + mediasoup-client |

## 📁 Proje Yapısı

```
/demirkiranCAFE
├── /backend          # NestJS Signaling + SFU Server
├── /client           # Electron + React Desktop App
└── README.md
```

## 🏗️ Mimari

```
┌─────────────┐     WebSocket      ┌─────────────────┐
│   Client 1  │◄──────────────────►│                 │
└─────────────┘     (Signaling)    │                 │
                                   │   NestJS +      │
┌─────────────┐     WebRTC/UDP     │   mediasoup     │
│   Client 2  │◄──────────────────►│   (SFU Server)  │
└─────────────┘     (Media)        │                 │
                                   │                 │
┌─────────────┐     WebRTC/UDP     │                 │
│   Client N  │◄──────────────────►│                 │
└─────────────┘                    └─────────────────┘
```

## 📦 Kurulum

### Backend
```bash
cd backend
npm install
npm run start:dev
```

### Client
```bash
cd client
npm install
npm run dev
```

## 📝 Lisans

MIT
