# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS build

# Mediasoup C++ native modülü için gerekli build araçları
RUN apk add --no-cache python3 py3-pip make g++ linux-headers

WORKDIR /app

# Bağımlılıkları önce kopyala (cache optimizasyonu)
COPY package*.json ./
RUN npm ci

# Kaynak kodu kopyala ve build al
COPY . .
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-alpine AS production

# Mediasoup runtime için native build araçları gerekli
RUN apk add --no-cache python3 py3-pip make g++ linux-headers

WORKDIR /app

# Sadece production bağımlılıkları
COPY package*.json ./
RUN npm ci --omit=dev

# Build çıktısını kopyala
COPY --from=build /app/dist ./dist

# Uygulama portu
EXPOSE 3000

# Mediasoup UDP portları
EXPOSE 40000-49999/udp

CMD ["node", "dist/main.js"]
