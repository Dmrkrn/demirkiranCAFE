#!/bin/bash

# Hata olursa dur
set -e

echo "🚀 Sunucu Kurulumu Başlıyor..."

# 1. Güncelleme
echo "📦 Sistem güncelleniyor..."
apt-get update && apt-get upgrade -y
apt-get install -y curl git build-essential python3 python3-pip net-tools

# 2. Node.js 20 Kurulumu
echo "🟢 Node.js 20 kuruluyor..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 3. PM2 Kurulumu (Uygulamayı ayakta tutmak için)
echo "🔄 PM2 kuruluyor..."
npm install -g pm2

# 4. Projeyi Çek
echo "📂 Proje indiriliyor..."
if [ -d "demirkiranCAFE" ]; then
    echo "Proje zaten var, güncelleniyor..."
    cd demirkiranCAFE
    git pull
else
    git clone https://github.com/Dmrkrn/demirkiranCAFE.git
    cd demirkiranCAFE
fi

# 5. Backend Kurulumu
echo "🛠️ Backend kuruluyor..."
cd backend

# .env Dosyası Oluştur
echo "🔑 .env oluşturuluyor..."
cat > .env << EOL
ROOM_PASSWORD=19071907
PORT=3000
# Public IP (Mediasoup için önemli!)
MEDIASOUP_ANNOUNCED_IP=157.230.125.137
EOL

# Bağımlılıkları Yükle
npm install

# Build Al
echo "🏗️ Build alınıyor..."
npm run build

# 6. Uygulamayı Başlat
echo "▶️ Uygulama başlatılıyor..."
pm2 delete demirkiran-backend 2>/dev/null || true
pm2 start dist/main.js --name "demirkiran-backend"
pm2 save
pm2 startup | tail -n 1 | bash 2>/dev/null || true

# 7. Firewall Ayarları (UFW)
echo "🛡️ Firewall ayarlanıyor..."
ufw allow 22/tcp
ufw allow 3000/tcp
ufw allow 40000:49999/udp
# UFW'yi aktif et (non-interactive)
echo "y" | ufw enable

echo "✅✅✅ KURULUM TAMAMLANDI! ✅✅✅"
echo "Sunucu Adresi: http://157.230.125.137:3000"
