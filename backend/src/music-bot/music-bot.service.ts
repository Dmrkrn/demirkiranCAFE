import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MediasoupService } from '../mediasoup/mediasoup.service';
import { types as mediasoupTypes } from 'mediasoup';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

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

            this.logger.log(`🚇 PlainTransport oluşturuldu - port: ${this.plainTransport.tuple.localPort}`);

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

            this.logger.log(`🎵 Audio producer oluşturuldu: ${this.audioProducer.id}`);

            // Producer'ı mediasoup servisine kaydet (getAllProducers'da görünsün)
            this.mediasoupService.registerExternalProducer(this.audioProducer);

            // Gateway'e bildir (new-producer broadcast için)
            this.onProducerReady?.(this.audioProducer.id);

            return true;
        } catch (error) {
            this.logger.error(`❌ Transport/Producer oluşturma hatası: ${error.message}`);
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
     * URL'den şarkı bilgisi al (YouTube veya Spotify)
     */
    private getVideoInfo(url: string): Promise<{ title: string; duration?: string }> {
        if (this.isSpotifyUrl(url)) {
            return this.getSpotifyInfo(url);
        }
        return this.getYouTubeInfo(url);
    }

    /**
     * YouTube URL'den şarkı bilgisi al
     */
    private getYouTubeInfo(url: string): Promise<{ title: string; duration?: string }> {
        return new Promise((resolve, reject) => {
            const ytdlp = spawn('yt-dlp', [
                '--print', '%(title)s',
                '--print', '%(duration_string)s',
                '--no-playlist',
                '--js-runtimes', 'node',
                url,
            ]);

            let output = '';
            let errorOutput = '';

            ytdlp.stdout.on('data', (data) => {
                output += data.toString();
            });

            ytdlp.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            ytdlp.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`yt-dlp info hatası: ${errorOutput}`));
                    return;
                }
                const lines = output.trim().split('\n');
                resolve({
                    title: lines[0] || 'Bilinmeyen Şarkı',
                    duration: lines[1] || undefined,
                });
            });
        });
    }

    /**
     * Spotify URL'den şarkı bilgisi al
     */
    private getSpotifyInfo(url: string): Promise<{ title: string; duration?: string }> {
        return new Promise((resolve, reject) => {
            const spotdl = spawn('spotdl', [
                'url', url,
                '--print-errors',
                '--output', '/dev/null',
            ]);

            let output = '';
            let errorOutput = '';

            spotdl.stdout.on('data', (data) => {
                output += data.toString();
            });

            spotdl.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            spotdl.on('close', (code) => {
                // spotdl çıkışından title al, yoksa URL'yi kullan
                const title = output.trim().split('\n')[0] || url.split('/').pop() || 'Spotify Şarkısı';
                resolve({ title });
            });

            // Timeout: 10 saniye bekle, olmadı title olarak URL ver
            setTimeout(() => {
                spotdl.kill();
                const fallbackTitle = url.split('/').pop() || 'Spotify Şarkısı';
                resolve({ title: fallbackTitle });
            }, 10000);
        });
    }

    /**
     * Şarkı çal
     */
    async play(url: string, requestedBy: string): Promise<{ success: boolean; message: string; title?: string }> {
        try {
            // Şarkı bilgisi al
            const info = await this.getVideoInfo(url);
            this.logger.log(`🎵 Şarkı bulundu: ${info.title}`);

            const item: QueueItem = {
                url,
                title: info.title,
                duration: info.duration,
                requestedBy,
            };

            // Eğer şu an çalan bir şey yoksa direkt başlat
            if (!this.nowPlaying) {
                await this.startPlaying(item);
                return { success: true, message: `🎵 Çalınıyor: **${info.title}**`, title: info.title };
            } else {
                // Kuyruğa ekle
                this.queue.push(item);
                this.onQueueChange?.({ queue: this.getQueue() });
                return {
                    success: true,
                    message: `📋 Kuyruğa eklendi (#${this.queue.length}): **${info.title}**`,
                    title: info.title,
                };
            }
        } catch (error) {
            this.logger.error(`❌ Play hatası: ${error.message}`);
            return { success: false, message: `❌ Şarkı çalınamadı: ${error.message}` };
        }
    }

    /**
     * Şarkıyı başlat (FFmpeg + yt-dlp pipeline)
     */
    private async startPlaying(item: QueueItem): Promise<void> {
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

        // URL tipine göre audio pipeline seç
        if (this.isSpotifyUrl(item.url)) {
            // Spotify: spotdl → FFmpeg → RTP
            this.ytdlpProcess = spawn('spotdl', [
                'download', item.url,
                '--output', `${this.tempDir}/current.{output-ext}`,
                '--format', 'opus',
                '--overwrite', 'force',
            ]);

            // spotdl bitince dosyayı FFmpeg'e ver
            this.ytdlpProcess.on('close', (spotdlCode) => {
                if (spotdlCode === 0) {
                    // İndirilen dosyayı bul ve FFmpeg'e ver
                    const files = fs.readdirSync(this.tempDir).filter(f => f.startsWith('current'));
                    const audioFile = files[0] ? path.join(this.tempDir, files[0]) : null;
                    if (audioFile && fs.existsSync(audioFile)) {
                        this.ffmpegProcess = spawn('ffmpeg', [
                            '-re',
                            '-i', audioFile,
                            '-acodec', 'libopus',
                            '-ab', '128k',
                            '-ac', '2',
                            '-ar', '48000',
                            '-f', 'rtp',
                            '-ssrc', '11111111',
                            '-payload_type', '101',
                            `rtp://127.0.0.1:${rtpPort}`,
                        ]);

                        this.ffmpegProcess.on('close', (code) => {
                            // Temizle
                            try { fs.unlinkSync(audioFile); } catch { }
                            this.logger.log(`🎵 FFmpeg kapandı (code: ${code})`);
                            if (code === 0 || code === 255) this.playNext();
                        });

                        this.ffmpegProcess.on('error', (err) => {
                            this.logger.error(`❌ FFmpeg hatası: ${err.message}`);
                        });
                    }
                } else {
                    this.logger.error(`❌ spotdl hatası (code: ${spotdlCode})`);
                    this.playNext();
                }
            });
        } else {
            // YouTube: yt-dlp → FFmpeg → RTP
            this.logger.log(`🎵 YouTube pipeline başlatılıyor: ${item.url} → port ${rtpPort}`);

            this.ytdlpProcess = spawn('yt-dlp', [
                '-f', 'bestaudio',
                '-o', '-',
                '--no-playlist',
                '--js-runtimes', 'node',
                item.url,
            ]);

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
            ]);

            // yt-dlp stdout → FFmpeg stdin
            if (this.ytdlpProcess.stdout && this.ffmpegProcess.stdin) {
                this.ytdlpProcess.stdout.pipe(this.ffmpegProcess.stdin);
                this.logger.log('🔗 yt-dlp → FFmpeg pipe bağlandı');
            } else {
                this.logger.error('❌ Pipe bağlanamadı! stdout/stdin null');
            }

            // yt-dlp debug log
            this.ytdlpProcess.stderr?.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg) this.logger.log(`📥 yt-dlp: ${msg.substring(0, 200)}`);
            });

            // FFmpeg debug log
            this.ffmpegProcess.stderr?.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg.includes('Error') || msg.includes('error') || msg.includes('rtp://')) {
                    this.logger.log(`🎬 FFmpeg: ${msg.substring(0, 200)}`);
                }
            });

            // Şarkı bittiğinde sıradakini çal
            this.ffmpegProcess.on('close', (code) => {
                this.logger.log(`🎵 FFmpeg kapandı (code: ${code})`);
                if (code === 0 || code === 255) {
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
        } // end YouTube branch

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
        if (this.queue.length > 0) {
            const nextItem = this.queue.shift()!;
            this.onQueueChange?.({ queue: this.getQueue() });
            await this.startPlaying(nextItem);
        } else {
            // Kuyruk boş
            this.nowPlaying = null;
            this.onNowPlayingChange?.({ nowPlaying: null, producerId: null });
            this.logger.log('🎵 Kuyruk bitti');
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
