import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { MediasoupService } from '../mediasoup/mediasoup.service';
import { types as mediasoupTypes } from 'mediasoup';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as https from 'https';

export interface QueueItem {
    url: string;
    title: string;
    duration?: string;
    requestedBy: string;
}

export interface NowPlaying {
    title: string;
    url: string;
    requestedBy: string;
    startedAt: number;
}

@Injectable()
export class MusicBotService implements OnModuleInit {
    private readonly logger = new Logger(MusicBotService.name);

    // Müzik kuyruğu
    private queue: QueueItem[] = [];
    private nowPlaying: NowPlaying | null = null;
    private isPaused = false;

    // mediasoup
    private plainTransport: mediasoupTypes.PlainTransport | null = null;
    private audioProducer: mediasoupTypes.Producer | null = null;

    // FFmpeg process
    private ffmpegProcess: ChildProcess | null = null;
    private ytdlpProcess: ChildProcess | null = null;
    private playbackSessionId = 0;  // Race condition guard
    private isTransitioning = false;  // Double playNext guard

    // Temp directory
    private readonly tempDir = path.join(os.tmpdir(), 'music-bot');

    // Event callback (gateway'e bildirim için)
    private onNowPlayingChange: ((data: any) => void) | null = null;
    private onQueueChange: ((data: any) => void) | null = null;
    private onProducerReady: ((producerId: string) => void) | null = null;

    constructor(private readonly mediasoupService: MediasoupService) { }

    async onModuleInit() {
        // Temp dizini oluştur
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        this.logger.log('🎵 MusicBotService başlatıldı');
    }

    /**
     * Event callback'lerini ayarla
     */
    setCallbacks(
        onNowPlayingChange: (data: any) => void,
        onQueueChange: (data: any) => void,
        onProducerReady?: (producerId: string) => void,
    ) {
        this.onNowPlayingChange = onNowPlayingChange;
        this.onQueueChange = onQueueChange;
        if (onProducerReady) this.onProducerReady = onProducerReady;
    }

    /**
     * PlainTransport + Producer oluştur
     * Bu sadece bir kez yapılır, sonra FFmpeg çıkışı buraya bağlanır
     */
    private async ensureTransport(): Promise<boolean> {
        if (this.plainTransport && this.audioProducer) {
            return true;
        }

        const router = this.mediasoupService.getRouter();
        if (!router) {
            this.logger.error('❌ Router bulunamadı!');
            return false;
        }

        try {
            // PlainTransport oluştur (FFmpeg'den RTP alacak)
            this.plainTransport = await router.createPlainTransport({
                listenInfo: {
                    protocol: 'udp',
                    ip: '127.0.0.1',
                },
                rtcpMux: true,
                comedia: true, // FFmpeg bağlandığında otomatik remote IP/port ayarlanır
            });

            this.logger.log(`🚇 PlainTransport oluşturuldu - port: ${this.plainTransport.tuple.localPort} `);

            // Audio producer oluştur
            this.audioProducer = await this.plainTransport.produce({
                kind: 'audio',
                rtpParameters: {
                    codecs: [
                        {
                            mimeType: 'audio/opus',
                            payloadType: 101,
                            clockRate: 48000,
                            channels: 2,
                            parameters: {
                                minptime: 10,
                                useinbandfec: 1,
                            },
                        },
                    ],
                    encodings: [{ ssrc: 11111111 }],
                },
                appData: { isBot: true, botType: 'music' },
            });

            this.logger.log(`🎵 Audio producer oluşturuldu: ${this.audioProducer.id} `);

            // Producer'ı mediasoup servisine kaydet (getAllProducers'da görünsün)
            this.mediasoupService.registerExternalProducer(this.audioProducer);

            // Gateway'e bildir (new-producer broadcast için)
            this.onProducerReady?.(this.audioProducer.id);

            return true;
        } catch (error) {
            this.logger.error(`❌ Transport / Producer oluşturma hatası: ${error.message} `);
            return false;
        }
    }

    /**
     * URL tipini tespit et
     */
    private isSpotifyUrl(url: string): boolean {
        return url.includes('spotify.com') || url.includes('open.spotify');
    }

    /**
     * Şarkı bilgisi al
     */
    private getVideoInfo(url: string): Promise<{ title: string; duration?: string }> {
        return new Promise((resolve) => {
            let fetchUrl = '';

            if (this.isSpotifyUrl(url)) {
                fetchUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                fetchUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
            } else {
                resolve({ title: 'Bilinmeyen Müzik İsteği' });
                return;
            }

            https.get(fetchUrl, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        let title = json.title || '';

                        // Sanatçı adını başlığa ekle (eğer zaten içinde yoksa)
                        if (json.author_name && title && !title.toLowerCase().includes(json.author_name.toLowerCase()) && json.author_name !== 'YouTube') {
                            title = `${json.author_name} - ${title}`;
                        } else if (!title && json.author_name) {
                            title = json.author_name;
                        }

                        resolve({ title: title.trim() || 'Gizli veya Bilinmeyen Şarkı' });
                    } catch {
                        resolve({ title: 'Şarkı Adı Alınamadı' });
                    }
                });
            }).on('error', () => {
                resolve({ title: 'Bağlantı Hatası (Metadata)' });
            });
        });
    }

    /**
     * Şarkı çal
     */
    async play(url: string, requestedBy: string): Promise<{ success: boolean; message: string; title?: string }> {
        try {
            // Şarkı bilgisi al
            const info = await this.getVideoInfo(url);
            this.logger.log(`🎵 Şarkı bulundu: ${info.title} `);

            const item: QueueItem = {
                url,
                title: info.title,
                duration: info.duration,
                requestedBy,
            };

            // Eğer şu an çalan bir şey yoksa direkt başlat
            if (!this.nowPlaying) {
                await this.startPlaying(item);
                return { success: true, message: `🎵 Çalınıyor: ** ${info.title}** `, title: info.title };
            } else {
                // Kuyruğa ekle
                this.queue.push(item);
                this.onQueueChange?.({ queue: this.getQueue() });
                return {
                    success: true,
                    message: `📋 Kuyruğa eklendi(#${this.queue.length}): ** ${info.title}** `,
                    title: info.title,
                };
            }
        } catch (error) {
            this.logger.error(`❌ Play hatası: ${error.message} `);
            return { success: false, message: `❌ Şarkı çalınamadı: ${error.message} ` };
        }
    }

    /**
     * Şarkıyı başlat (FFmpeg + yt-dlp pipeline)
     */
    private async startPlaying(item: QueueItem): Promise<void> {
        // Yeni session başlat — eski close handler'ları devre dışı kalır
        this.playbackSessionId++;
        const sessionId = this.playbackSessionId;

        // Varsa eski processleri kapat
        this.killProcesses();

        // Transport hazırla
        const ready = await this.ensureTransport();
        if (!ready || !this.plainTransport) {
            throw new Error('Transport hazırlanamadı');
        }

        const rtpPort = this.plainTransport.tuple.localPort;

        this.nowPlaying = {
            title: item.title,
            url: item.url,
            requestedBy: item.requestedBy,
            startedAt: Date.now(),
        };

        // URL tipine göre query oluştur (Bot protection ve Rate Limit aşmak için ytsearch/scsearch kullanıyoruz)
        let searchQuery = item.url;
        let isDirectUrl = true;

        if (this.isSpotifyUrl(item.url)) {
            // Spotify IP ban (Rate Limit) yediğimiz için ytsearch kullanıyoruz. OEmbed sayesinde gerçek adı elimizde.
            // Android player_client ile aratarak bot korumasını eziyoruz. Eğer IP YouTube'dan tamamen banlıysa scsearch'e de düşecek.
            searchQuery = `ytsearch1:${item.title.replace(' - ', ' ').replace(/[^a-zA-Z0-9 ıIğĞüÜşŞiİöÖçÇ]/g, '')}`;
            isDirectUrl = false;
            this.logger.log(`🔄 Spotify linki güvenli YouTube aramasına çevrildi: ${searchQuery}`);
        } else if (item.url.includes('youtube.com') || item.url.includes('youtu.be')) {
            // Önce direkt URL dene, YouTube IP ban (bot check) atarsa stderr'den yakalayıp ytsearch'e düşeceğiz.
            searchQuery = item.url;
            isDirectUrl = true;
        }

        this.logger.log(`🎵 Pipeline başlatılıyor: ${searchQuery} → port ${rtpPort} `);

        // yt-dlp → FFmpeg → RTP
        // spotdl kullanmıyoruz çünkü rate limit yedik, yt-dlp her şeyi ytsearch ile bulabilir.
        const isWindows = os.platform() === 'win32';

        const ytDlpArgs = [
            '-f', 'bestaudio',
            '-o', '-',
            '--no-playlist',
            '--js-runtimes', 'node',
            '--rm-cache-dir', // Bot korumalarını temizlemek için
        ];

        // 🍪 DİSCORD BOTLARININ GİZLİ SİLAHI: Çerezler (Cookies)
        // Eğer sunucu dizininde cookies.txt varsa onu kullan, yoksa ios/tv istemcisi taklidi yap
        const cookiesPath = path.join(process.cwd(), 'cookies.txt');
        if (fs.existsSync(cookiesPath)) {
            this.logger.log('🍪 cookies.txt bulundu! YouTube bot koruması tamamen devreden çıkıyor.');
            ytDlpArgs.push('--cookies', cookiesPath);
        } else {
            this.logger.log('⚠️ cookies.txt bulunamadı. Anonim (ios,tv) istemcisiyle deneniyor...');
            ytDlpArgs.push('--extractor-args', 'youtube:player_client=ios,tv,web_creator'); // Android artık GVS PO Token istiyor, iOS ve TV daha güvenli
        }

        ytDlpArgs.push(isWindows ? `"${searchQuery}"` : searchQuery);

        this.ytdlpProcess = spawn('yt-dlp', ytDlpArgs, { shell: isWindows });

        this.ffmpegProcess = spawn('ffmpeg', [
            '-i', 'pipe:0',        // stdin'den oku (yt-dlp çıkışı)
            '-map', '0:a:0',       // Sadece ses
            '-acodec', 'libopus',  // Opus codec
            '-ab', '128k',         // 128kbps bitrate
            '-ac', '2',            // Stereo
            '-ar', '48000',        // 48kHz sample rate
            '-f', 'rtp',           // RTP format
            '-ssrc', '11111111',   // Producer'daki SSRC ile aynı
            '-payload_type', '101', // Producer'daki payload type ile aynı
            `rtp://127.0.0.1:${rtpPort}`,
        ], { shell: isWindows });

        // yt-dlp stdout → FFmpeg stdin
        if (this.ytdlpProcess.stdout && this.ffmpegProcess.stdin) {
            this.ytdlpProcess.stdout.pipe(this.ffmpegProcess.stdin);
            this.logger.log('🔗 yt-dlp → FFmpeg pipe bağlandı');
        } else {
            this.logger.error('❌ Pipe bağlanamadı! stdout/stdin null');
        }

        // yt-dlp debug log (Gerçek ismi yakalamak ve bot hatalarını yakalamak için)
        this.ytdlpProcess.stderr?.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) {
                this.logger.log(`📥 yt-dlp: ${msg.substring(0, 200)}`);

                // Gerçek ismi parse et: "[download] Destination: Gerçek Şarkı İsmi" veya "[youtube] Extracting URL: " değilse
                if (msg.includes('[download] Destination:')) {
                    const realTitle = msg.split('Destination:')[1].trim().replace('.webm', '').replace('.m4a', '');
                    if (this.nowPlaying && realTitle !== '-') {
                        this.nowPlaying.title = realTitle;
                        this.onNowPlayingChange?.({
                            nowPlaying: this.nowPlaying,
                            producerId: this.audioProducer?.id,
                        });
                        this.logger.log(`✨ Şarkı gerçek ismi bulundu: ${realTitle}`);
                    }
                }

                // Bot protection hatası yakalama
                if (msg.includes('Sign in to confirm you’re not a bot')) {
                    this.logger.error(`❌ YOUTUBE BOT KORUMASI DEVREDE! Bu link yt-dlp ile çalınamıyor: ${item.url}`);

                    if (sessionId === this.playbackSessionId) {
                        const safeTitle = item.title.replace(' - ', ' ').replace(/[^a-zA-Z0-9 ıIğĞüÜşŞiİöÖçÇ]/g, '');

                        // Direkt URL patladıysa -> YT Search Android Client Fallback'ine geç
                        if (isDirectUrl) {
                            this.logger.log(`🔄 Bot korumasını aşmak için ytsearch1 (Android Client) fall-back uygulanıyor...`);
                            this.queue.unshift({ ...item, url: `ytsearch1:${safeTitle || 'music'}` });
                            this.killProcesses();
                        }
                        // YT Search patladıysa -> SoundCloud Fallback'ine geç (Son Şans, Kesin Çözüm)
                        else if (searchQuery.startsWith('ytsearch')) {
                            this.logger.log(`🔄 YouTube tamamen bloke etti. Kesin çözüm için scsearch1 (SoundCloud) fall-back uygulanıyor...`);
                            this.queue.unshift({ ...item, url: `scsearch1:${safeTitle || 'music'}` });
                            this.killProcesses();
                        }
                    }
                }
            }
        });

        // FFmpeg debug log
        this.ffmpegProcess.stderr?.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg.includes('Error') || msg.includes('error')) {
                // "Error parsing Opus packet header" zararsızdır, loglamayalım
                if (!msg.includes('parsing Opus packet header')) {
                    this.logger.log(`🎬 FFmpeg Hata/Uyarı: ${msg.substring(0, 200)}`);
                }
            }
        });

        // Şarkı bittiğinde sıradakini çal (SADECE bu session'a ait FFmpeg için)
        this.ffmpegProcess.on('close', (code) => {
            this.logger.log(`🎵 FFmpeg kapandı (code: ${code}, session: ${sessionId})`);
            // Eski session'dan gelen close event'i ignore et
            if (sessionId !== this.playbackSessionId) {
                return;
            }
            // FFmpeg her durumda (error, bitiş) kapanırsa playNext'i çağırır ki kuyruk devam etsin
            if (code === 0 || code === 255 || code === null || code === 183 || code === 1) {
                this.playNext();
            }
        });

        this.ytdlpProcess.on('close', (code) => {
            this.logger.log(`📥 yt-dlp kapandı (code: ${code})`);
        });

        this.ytdlpProcess.on('error', (err) => {
            this.logger.error(`❌ yt-dlp spawn hatası: ${err.message}`);
        });

        this.ffmpegProcess.on('error', (err) => {
            this.logger.error(`❌ FFmpeg spawn hatası: ${err.message}`);
        });

        // stdin error (pipe kırılırsa)
        this.ffmpegProcess.stdin?.on('error', (err) => {
            this.logger.error(`❌ FFmpeg stdin hatası: ${err.message}`);
        });

        // Broadcast: Şu an çalan
        this.onNowPlayingChange?.({
            nowPlaying: this.nowPlaying,
            producerId: this.audioProducer?.id,
        });

        this.logger.log(`🎵 Çalınıyor: ${item.title} → RTP port ${rtpPort}`);
    }

    /**
     * Sıradaki şarkıya geç
     */
    private async playNext(): Promise<void> {
        // Double-trigger guard
        if (this.isTransitioning) {
            this.logger.log('⚠️ playNext zaten çalışıyor, skip');
            return;
        }
        this.isTransitioning = true;

        try {
            if (this.queue.length > 0) {
                const nextItem = this.queue.shift()!;
                this.onQueueChange?.({ queue: this.getQueue() });
                await this.startPlaying(nextItem);
            } else {
                this.nowPlaying = null;
                this.onNowPlayingChange?.({ nowPlaying: null, producerId: null });
                this.logger.log('🎵 Kuyruk bitti');
            }
        } finally {
            this.isTransitioning = false;
        }
    }

    /**
     * Sıradaki şarkıya atla
     */
    async skip(requestedBy: string): Promise<string> {
        if (!this.nowPlaying) {
            return '❌ Çalan bir şarkı yok!';
        }
        const skipped = this.nowPlaying.title;
        this.killProcesses();
        await this.playNext();
        return `⏭️ Atlandı: **${skipped}**`;
    }

    /**
     * Durdur
     */
    stop(): string {
        if (!this.nowPlaying) {
            return '❌ Çalan bir şarkı yok!';
        }
        const stopped = this.nowPlaying.title;
        this.killProcesses();
        this.nowPlaying = null;
        this.queue = [];
        this.onNowPlayingChange?.({ nowPlaying: null, producerId: null });
        this.onQueueChange?.({ queue: [] });
        return `⏹️ Durduruldu: **${stopped}** (Kuyruk temizlendi)`;
    }

    /**
     * Duraklat / Devam
     */
    pause(): string {
        if (!this.nowPlaying) {
            return '❌ Çalan bir şarkı yok!';
        }
        if (this.ffmpegProcess) {
            if (this.isPaused) {
                // Devam et - SIGCONT
                this.ffmpegProcess.kill('SIGCONT');
                this.ytdlpProcess?.kill('SIGCONT');
                this.isPaused = false;
                return `▶️ Devam: **${this.nowPlaying.title}**`;
            } else {
                // Duraklat - SIGSTOP
                this.ffmpegProcess.kill('SIGSTOP');
                this.ytdlpProcess?.kill('SIGSTOP');
                this.isPaused = true;
                return `⏸️ Duraklatıldı: **${this.nowPlaying.title}**`;
            }
        }
        return '❌ Process bulunamadı!';
    }

    /**
     * Kuyruk listesi
     */
    getQueue(): { nowPlaying: NowPlaying | null; queue: QueueItem[] } {
        return {
            nowPlaying: this.nowPlaying,
            queue: [...this.queue],
        };
    }

    /**
     * Producer ID (client'lar consume etmek için)
     */
    getProducerId(): string | null {
        return this.audioProducer?.id ?? null;
    }

    /**
     * Çalıyor mu?
     */
    isPlaying(): boolean {
        return this.nowPlaying !== null && !this.isPaused;
    }

    /**
     * Process'leri temizle
     */
    private killProcesses(): void {
        if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
            this.ffmpegProcess.kill('SIGKILL');
            this.ffmpegProcess = null;
        }
        if (this.ytdlpProcess && !this.ytdlpProcess.killed) {
            this.ytdlpProcess.kill('SIGKILL');
            this.ytdlpProcess = null;
        }
        this.isPaused = false;
    }
}
