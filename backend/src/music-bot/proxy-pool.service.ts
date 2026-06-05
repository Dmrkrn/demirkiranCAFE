import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ProxyInfo {
    host: string;
    port: number;
    username: string;
    password: string;
    url: string; // http://user:pass@host:port formatı
}

@Injectable()
export class ProxyPoolService implements OnModuleInit {
    private readonly logger = new Logger(ProxyPoolService.name);
    private proxies: ProxyInfo[] = [];
    private blacklist = new Map<string, number>(); // proxy url -> blacklist expiry timestamp
    private lastUsedIndex = -1;

    private readonly BLACKLIST_DURATION = 5 * 60 * 1000; // 5 dakika blacklist süresi
    private readonly PROXY_FILE_PATHS = [
        'Webshare residential proxies.txt',
        '/app/proxies.txt',           // Docker container içinde
        join(process.cwd(), 'proxies.txt'),
    ];

    onModuleInit() {
        this.loadProxies();
    }

    /**
     * Proxy dosyasını oku ve listeye yükle
     * Format: host:port:username:password (her satır bir proxy)
     */
    private loadProxies(): void {
        // Önce env variable'dan tek proxy varsa onu da ekle (geriye uyumluluk)
        const envProxy = process.env.PROXY_URL;

        // Dosyadan proxy listesi yüklemeyi dene
        for (const filePath of this.PROXY_FILE_PATHS) {
            if (existsSync(filePath)) {
                try {
                    const content = readFileSync(filePath, 'utf-8');
                    const lines = content.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0 && !line.startsWith('#'));

                    for (const line of lines) {
                        const parts = line.split(':');
                        if (parts.length >= 4) {
                            const [host, portStr, username, password] = parts;
                            const port = parseInt(portStr, 10);

                            if (host && port && username && password) {
                                this.proxies.push({
                                    host,
                                    port,
                                    username,
                                    password,
                                    url: `http://${username}:${password}@${host}:${port}`,
                                });
                            }
                        }
                    }

                    this.logger.log(`✅ ${this.proxies.length} proxy yüklendi: ${filePath}`);
                    break; // İlk başarılı dosyayı kullan
                } catch (err) {
                    this.logger.warn(`Proxy dosyası okunamadı (${filePath}): ${err.message}`);
                }
            }
        }

        // Dosyadan yüklenemezse env variable'ı fallback olarak kullan
        if (this.proxies.length === 0 && envProxy) {
            try {
                const parsed = new URL(envProxy);
                this.proxies.push({
                    host: parsed.hostname,
                    port: parseInt(parsed.port, 10) || 80,
                    username: decodeURIComponent(parsed.username),
                    password: decodeURIComponent(parsed.password),
                    url: envProxy,
                });
                this.logger.log(`⚠️ Dosyadan proxy yüklenemedi, PROXY_URL env kullanılıyor (1 proxy)`);
            } catch {
                this.logger.error(`❌ PROXY_URL parse edilemedi: ${envProxy}`);
            }
        }

        if (this.proxies.length === 0) {
            this.logger.warn(`⚠️ Hiç proxy bulunamadı! yt-dlp proxy'siz çalışacak.`);
        }
    }

    /**
     * Havuzdan rastgele bir proxy seç (blacklist'te olmayanlardan)
     * Her çağrıda farklı bir proxy döndürür
     */
    getRandomProxy(): ProxyInfo | null {
        if (this.proxies.length === 0) return null;

        // Blacklist süresi dolmuş proxy'leri temizle
        const now = Date.now();
        for (const [url, expiry] of this.blacklist.entries()) {
            if (now > expiry) {
                this.blacklist.delete(url);
            }
        }

        // Blacklist'te olmayan proxy'leri filtrele
        const available = this.proxies.filter(p => !this.blacklist.has(p.url));

        if (available.length === 0) {
            // Tüm proxy'ler blacklist'te, blacklist'i temizle ve random seç
            this.logger.warn(`⚠️ Tüm proxy'ler blacklist'te! Blacklist temizleniyor...`);
            this.blacklist.clear();
            return this.proxies[Math.floor(Math.random() * this.proxies.length)];
        }

        // Rastgele seç
        const proxy = available[Math.floor(Math.random() * available.length)];
        return proxy;
    }

    /**
     * Round-robin şeklinde sırayla proxy seç
     */
    getNextProxy(): ProxyInfo | null {
        if (this.proxies.length === 0) return null;

        this.lastUsedIndex = (this.lastUsedIndex + 1) % this.proxies.length;

        // Blacklist'teyse sonrakine geç
        let attempts = 0;
        while (this.blacklist.has(this.proxies[this.lastUsedIndex].url) && attempts < this.proxies.length) {
            this.lastUsedIndex = (this.lastUsedIndex + 1) % this.proxies.length;
            attempts++;
        }

        return this.proxies[this.lastUsedIndex];
    }

    /**
     * Başarısız olan proxy'yi geçici olarak blacklist'e ekle
     */
    blacklistProxy(proxyUrl: string): void {
        this.blacklist.set(proxyUrl, Date.now() + this.BLACKLIST_DURATION);
        this.logger.warn(`🚫 Proxy blacklist'e eklendi (${this.BLACKLIST_DURATION / 1000}s): ${this.maskProxyUrl(proxyUrl)}`);
    }

    /**
     * Havuzdaki toplam proxy sayısı
     */
    getPoolSize(): number {
        return this.proxies.length;
    }

    /**
     * Aktif (blacklist'te olmayan) proxy sayısı
     */
    getAvailableCount(): number {
        const now = Date.now();
        let blacklisted = 0;
        for (const expiry of this.blacklist.values()) {
            if (now <= expiry) blacklisted++;
        }
        return this.proxies.length - blacklisted;
    }

    /**
     * Proxy URL'sini loglar için maskele (şifreyi gizle)
     */
    private maskProxyUrl(url: string): string {
        try {
            const parsed = new URL(url);
            return `${parsed.username}@${parsed.host}`;
        } catch {
            return url.substring(0, 30) + '...';
        }
    }
}
