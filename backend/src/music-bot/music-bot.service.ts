import { Injectable, Logger } from '@nestjs/common';
import ytSearch from 'yt-search';
import { execFile } from 'child_process';
import { existsSync } from 'fs';

export interface QueueItem {
    url: string;
    title: string;
    thumbnail?: string;
    duration?: string;
    requestedBy: string;
    streamUrl?: string; // Piped API üzerinden çekilen ham ses (MP3/M4A) dosyası
}

export interface NowPlaying extends QueueItem {
    startedAt: number;
}

@Injectable()
export class MusicBotService {
    private readonly logger = new Logger(MusicBotService.name);

    private queue: QueueItem[] = [];
    private nowPlaying: NowPlaying | null = null;
    private isPaused = false;
    private isTransitioning = false;
    private pausedAt: number | null = null;        // Duraklatma anının timestamp'i
    private totalPausedDuration = 0;               // Toplam duraklatılmış süre (ms)

    // Callbacks for Gateway
    private onNowPlayingChange?: (data: { nowPlaying: NowPlaying | null }) => void;
    private onQueueChange?: (data: { queue: QueueItem[] }) => void;

    /**
     * Initializes callbacks assigned by the gateway
     */
    setCallbacks(
        onNowPlayingChange: (data: { nowPlaying: NowPlaying | null }) => void,
        onQueueChange: (data: { queue: QueueItem[] }) => void,
    ) {
        this.onNowPlayingChange = onNowPlayingChange;
        this.onQueueChange = onQueueChange;
    }

    /**
     * yt-dlp ile direkt ses stream URL'si çek (Piped başarısız olduğunda fallback)
     * cookies.txt varsa YouTube Premium hesabıyla bot korumasını aşar
     */
    private getStreamUrlViaYtDlp(videoId: string): Promise<string | null> {
        return new Promise((resolve) => {
            // Residential proxy URL (YouTube datacenter IP'leri engelliyor)
            const proxyUrl = process.env.PROXY_URL;

            const args = [
                '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
                '--get-url',
                '--no-playlist',
                '--no-check-certificates',
                '--js-runtimes', 'node',
                ...(proxyUrl ? ['--proxy', proxyUrl] : []),
                `https://www.youtube.com/watch?v=${videoId}`,
            ];

            this.logger.log(`🔧 yt-dlp fallback başlatılıyor (proxy: ${proxyUrl ? 'VAR' : 'YOK'})...`);

            execFile('yt-dlp', args, { timeout: 30000 }, (error, stdout, stderr) => {
                if (error) {
                    this.logger.warn(`yt-dlp hatası: ${error.message}`);
                    if (stderr) this.logger.debug(`yt-dlp stderr: ${stderr.substring(0, 200)}`);
                    resolve(null);
                    return;
                }

                const url = stdout.trim().split('\n')[0]; // İlk URL'yi al
                if (url && url.startsWith('http')) {
                    this.logger.log(`✅ yt-dlp başarılı! Stream URL çekildi.`);
                    resolve(url);
                } else {
                    this.logger.warn(`yt-dlp geçersiz çıktı: ${url?.substring(0, 100)}`);
                    resolve(null);
                }
            });
        });
    }

    /**
     * Fetch video info and raw Audio Stream URL via Piped API
     */
    private async getVideoInfo(url: string, disableStreamFetch = false): Promise<{ title: string; duration?: string; thumbnail?: string; exactUrl: string; streamUrl?: string; videoId?: string }> {
        try {
            let searchQuery = url;
            let extractedVideoId = '';

            // Handle YouTube URLs cleanly
            if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) {
                const urlObj = new URL(url);
                extractedVideoId = urlObj.searchParams.get('v') || urlObj.pathname.replace('/', '');
                if (extractedVideoId) {
                    searchQuery = extractedVideoId;
                }
            }

            // 1. YouTube Search for basic metadata
            const result = await ytSearch(searchQuery);

            if (result && result.videos.length > 0) {
                const bestMatch = result.videos[0];
                const videoId = extractedVideoId || bestMatch.videoId;

                let streamUrl: string | undefined = undefined;

                // 2. yt-dlp ile direkt ses stream'i çek (Proxy destekli ve daha stabil olduğu için ÖNCELİKLİ)
                if (!disableStreamFetch && videoId) {
                    this.logger.log(`Tüm yöntemlerden önce yt-dlp deneniyor... (Kullanıcı İsteği)`);
                    streamUrl = await this.getStreamUrlViaYtDlp(videoId) || undefined;

                    // 3. Eğer yt-dlp başarısız olursa (örn: IP engeli, hız sınırı), Piped API'leri fallback olarak dene
                    if (!streamUrl) {
                        this.logger.warn(`yt-dlp stream çekemedi. Piped alt ağları deneniyor...`);
                        const pipedInstances = [
                            'https://pipedapi.kavin.rocks',
                            'https://api.piped.projectsegfau.lt',
                            'https://pipedapi.tokhmi.xyz',
                            'https://pipedapi.smnz.de',
                            'https://piped-api.lunar.icu'
                        ];

                        for (const api of pipedInstances) {
                            try {
                                const pipedResponse = await fetch(`${api}/streams/${videoId}`, {
                                    signal: AbortSignal.timeout(3000) // 3 second timeout per instance
                                });

                                if (pipedResponse.ok) {
                                    const pipedData = await pipedResponse.json();

                                    if (pipedData && pipedData.audioStreams && pipedData.audioStreams.length > 0) {
                                        // Get reliable m4a/webm streams
                                        const audioStream = pipedData.audioStreams.find((s: any) => s.mimeType.includes('m4a') || s.mimeType.includes('mp4') || s.mimeType.includes('webm')) || pipedData.audioStreams[0];

                                        if (audioStream && audioStream.url) {
                                            streamUrl = audioStream.url;
                                            this.logger.log(`🎧 Arka kapıdan ses stream'i (${api}) üzerinden yakalandı: ${bestMatch.title}`);
                                            break; // Stop trying other APIs once successful
                                        }
                                    }
                                }
                            } catch (streamErr: any) {
                                // If it fails or times out, loop continues to the next instance
                                this.logger.debug(`Piped Stream Fetch Failed (${api}) - Testing next...`);
                            }
                        }

                        if (!streamUrl) {
                            this.logger.warn(`yt-dlp ve tüm Piped alt ağları başarısız oldu. Son çare: YouTube IFrame kullanılacak: ${bestMatch.title}`);
                        }
                    }
                }

                return {
                    title: bestMatch.title || 'Bilinmeyen Şarkı',
                    duration: bestMatch.timestamp,
                    thumbnail: bestMatch.thumbnail,
                    exactUrl: bestMatch.url,
                    streamUrl,
                    videoId,
                };
            }
        } catch (error: any) {
            this.logger.error(`Info fetch failed (yt-search): ${error.message}`);
        }

        return { title: 'Bilinmeyen Müzik İsteği', exactUrl: url };
    }

    /**
     * Request a song or playlist to play
     */
    async play(url: string, requestedBy: string): Promise<{ success: boolean; message: string; title?: string }> {
        try {
            // 1. Çalma Listesi (Playlist) Kontrolü
            let listId = '';
            try {
                if (url.includes('list=')) {
                    const urlObj = new URL(url);
                    listId = urlObj.searchParams.get('list') || '';
                }
            } catch {
                const match = url.match(/[?&]list=([^&]+)/);
                if (match) listId = match[1];
            }

            // Eğer geçerli bir çalma listesi ise VE "Mix (RD...)" değilse tüm listeyi getir
            // "RD" ile başlayan çalma listeleri spesifik YouTube mix'leridir ve yt-search bunları çekemez, hata verir.
            if (listId && !listId.startsWith('RD') && !listId.startsWith('LL')) {
                this.logger.log(`🎵 Çalma listesi aranıyor: ${listId}`);
                try {
                    const listResult = await ytSearch({ listId });

                    if (listResult && listResult.videos && listResult.videos.length > 0) {
                        const count = listResult.videos.length;

                        listResult.videos.forEach(video => {
                            this.queue.push({
                                url: `https://www.youtube.com/watch?v=${video.videoId}`,
                                title: video.title,
                                thumbnail: video.thumbnail,
                                duration: '?',
                                requestedBy,
                                streamUrl: undefined // Listeler çok uzun olduğu için başlangıçta Piped stream'leri çekmeyip arka planda fallback bırakılır
                            });
                        });

                        this.onQueueChange?.({ queue: this.getQueue().queue });

                        if (!this.nowPlaying) {
                            this.playNext();
                            return {
                                success: true,
                                message: `🎵 Çalma listesi başlatıldı: **${listResult.title}** (${count} şarkı)`,
                                title: listResult.title
                            };
                        } else {
                            return {
                                success: true,
                                message: `📋 Çalma listesi eklendi: **${listResult.title}** (${count} şarkı)`,
                                title: listResult.title
                            };
                        }
                    }
                } catch (listErr: any) {
                    this.logger.warn(`Liste çekilemedi: ${listErr.message}. Tekil şarkı olarak denenecek.`);
                }
            }

            // 2. Tekil Video (Şarkı) Kontrolü (Stream yakalamaya çalış)
            // RD Mix'ler veya listesi okunamayan şarkılar buraya düşerek ilk şarkıymış gibi yüklenir
            const info = await this.getVideoInfo(url);
            this.logger.log(`🎵 Şarkı bulundu: ${info.title} (Stream URL: ${info.streamUrl ? 'Var' : 'Yok'})`);

            const item: QueueItem = {
                url: info.exactUrl,
                title: info.title,
                thumbnail: info.thumbnail,
                duration: info.duration,
                requestedBy,
                streamUrl: info.streamUrl
            };

            this.queue.push(item);
            this.onQueueChange?.({ queue: this.getQueue().queue });

            if (!this.nowPlaying) {
                this.playNext();
                return { success: true, message: `🎵 Başlatılıyor: **${info.title}**`, title: info.title };
            } else {
                return {
                    success: true,
                    message: `📋 Kuyruğa eklendi (#${this.queue.length}): **${info.title}**`,
                    title: info.title,
                };
            }
        } catch (error) {
            this.logger.error(`❌ Play hatası: ${error.message}`);
            return { success: false, message: `❌ İşlem başarısız: ${error.message}` };
        }
    }

    /**
     * Starts broadcasting the next song to all clients
     */
    public async playNext(): Promise<void> {
        if (this.isTransitioning || Date.now() - (this.nowPlaying?.startedAt || 0) < 1000) return;
        this.isTransitioning = true;

        if (this.queue.length > 0) {
            const nextItem = this.queue.shift()!;

            // Playlist'ten gelen şarkılarda streamUrl olmayabilir, yt-dlp ile çekmeyi dene
            if (!nextItem.streamUrl) {
                try {
                    const urlObj = new URL(nextItem.url);
                    const videoId = urlObj.searchParams.get('v');
                    if (videoId) {
                        this.logger.log(`🔧 Playlist şarkısı için yt-dlp stream çekiliyor: ${nextItem.title}`);
                        const ytDlpUrl = await this.getStreamUrlViaYtDlp(videoId);
                        if (ytDlpUrl) {
                            nextItem.streamUrl = ytDlpUrl;
                        }
                    }
                } catch (e) {
                    this.logger.debug(`playNext yt-dlp fallback URL parse hatası: ${e.message}`);
                }
            }

            this.nowPlaying = {
                ...nextItem,
                startedAt: Date.now(),
            };
            this.isPaused = false;
            this.pausedAt = null;
            this.totalPausedDuration = 0; // Yeni şarkı, sıfırdan başla

            this.logger.log(`🎵 Şimdi çalıyor: ${this.nowPlaying.title}`);
            this.onQueueChange?.({ queue: this.getQueue().queue });
            this.onNowPlayingChange?.({ nowPlaying: this.nowPlaying });
        } else {
            this.nowPlaying = null;
            this.logger.log('🎵 Kuyruk bitti');
            this.onNowPlayingChange?.({ nowPlaying: null });
        }

        // debounce playNext for multi-clients
        setTimeout(() => {
            this.isTransitioning = false;
        }, 1500);
    }

    /**
     * Skip to next
     */
    skip(requestedBy: string): string {
        if (!this.nowPlaying) {
            return '❌ Çalan bir şarkı yok!';
        }
        const skipped = this.nowPlaying.title;
        this.playNext();
        return `⏭️ Atlandı: **${skipped}**`;
    }

    /**
     * Stop and clear queue
     */
    stop(): string {
        if (!this.nowPlaying) {
            return '❌ Çalan bir şarkı yok!';
        }
        const stopped = this.nowPlaying.title;
        this.nowPlaying = null;
        this.queue = [];
        this.isPaused = false;
        this.pausedAt = null;
        this.totalPausedDuration = 0;

        this.onNowPlayingChange?.({ nowPlaying: null });
        this.onQueueChange?.({ queue: [] });
        return `⏹️ Durduruldu: **${stopped}** (Kuyruk temizlendi)`;
    }

    /**
     * Remove a specific song from the queue by index
     */
    removeFromQueue(index: number, requestedBy?: string): { success: boolean; message: string } {
        if (index < 0 || index >= this.queue.length) {
            return { success: false, message: '❌ Geçersiz kuyruk numarası.' };
        }

        const removed = this.queue.splice(index, 1)[0];

        // Broadcast the updated queue to all clients
        this.onQueueChange?.({ queue: this.getQueue().queue });

        const userStr = requestedBy ? ` (${requestedBy})` : '';
        this.logger.log(`🎵 Kuyruktan çıkarıldı: ${removed.title}${userStr}`);

        return { success: true, message: `🗑️ Kuyruktan çıkarıldı: **${removed.title}**` };
    }

    /**
     * Move a song within the queue
     */
    moveInQueue(oldIndex: number, newIndex: number): { success: boolean, message: string } {
        if (oldIndex < 0 || oldIndex >= this.queue.length || newIndex < 0 || newIndex >= this.queue.length) {
            return { success: false, message: '❌ Geçersiz sıraya taşıma işlemi.' };
        }

        const [item] = this.queue.splice(oldIndex, 1);
        this.queue.splice(newIndex, 0, item);

        // Broadcast the updated queue to all clients
        this.onQueueChange?.({ queue: this.getQueue().queue });
        return { success: true, message: `🔄 Sıralama güncellendi.` };
    }

    /**
     * Pause / Resume Broadcast Syncing
     */
    pause(): string {
        if (!this.nowPlaying) return '❌ Çalan bir şarkı yok!';

        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            // Duraklatma anını kaydet
            this.pausedAt = Date.now();
        } else {
            // Devam ederken duraklatılmış süreyi toplama ekle
            if (this.pausedAt) {
                this.totalPausedDuration += Date.now() - this.pausedAt;
                this.pausedAt = null;
            }
        }

        this.onNowPlayingChange?.({ nowPlaying: this.nowPlaying });
        return this.isPaused ? `⏸️ Duraklatıldı: **${this.nowPlaying.title}**` : `▶️ Devam: **${this.nowPlaying.title}**`;
    }

    getQueue(): { nowPlaying: NowPlaying | null; queue: QueueItem[]; isPaused: boolean; totalPausedDuration: number } {
        // Şu an duraklatılmışsa, şimdiye kadarki duraklatma süresini de hesaba kat
        const currentPausedDuration = this.totalPausedDuration +
            (this.isPaused && this.pausedAt ? Date.now() - this.pausedAt : 0);
        return {
            nowPlaying: this.nowPlaying,
            queue: [...this.queue],
            isPaused: this.isPaused,
            totalPausedDuration: currentPausedDuration,
        };
    }

    isPlaying(): boolean {
        return this.nowPlaying !== null && !this.isPaused;
    }
}
