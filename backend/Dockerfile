# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS build

# Mediasoup C++ native modülü için gerekli build araçları
RUN apk add --no-cache python3 py3-pip make g++ linux-headers

WORKDIR /app

# Bağımlılıkları yükle (Bu aşamada Mediasoup derlenir - Yaklaşık 5-10 dk sürer)
COPY package*.json ./
RUN npm ci

# Kaynak kodu kopyala ve build al
COPY . .
RUN npm run build

# Gereksiz dev dependencies'leri temizle (Ama derlenmiş mediasoup kalsın)
RUN npm prune --omit=dev

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-alpine AS production

# Mediasoup worker'ın çalışması için gerekli kütüphaneler
RUN apk add --no-cache libstdc++

WORKDIR /app

# Derlenmiş dosyaları ve temizlenmiş node_modules'u kopyala
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

# Uygulama portu
EXPOSE 3000

# Mediasoup UDP portları
EXPOSE 40000-49999/udp

CMD ["node", "dist/main.js"]
