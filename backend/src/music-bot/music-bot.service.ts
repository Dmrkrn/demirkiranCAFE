import { Injectable, Logger } from '@nestjs/common';
import ytSearch from 'yt-search';

export interface QueueItem {
    url: string;
    title: string;
    thumbnail?: string;
    duration?: string;
    requestedBy: string;
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
     * Fetch video info
     * GÜNCELLEME: `play-dl` arka planda stream indirdiği için `yt-search` ile saf scraping'e geçildi. 
     * Asla indirme yapmaz, sadece YouTube'da arama yapıp başlık, süre, thumbnail ve link çeker.
     */
    private async getVideoInfo(url: string): Promise<{ title: string; duration?: string; thumbnail?: string; exactUrl: string }> {
        try {
            // "Wegh Geri Ver" gibi düz metin de gelse, veya YouTube linki de olsa 
            // ytSearch, arka planda youtube HTML sayfasını çok hızlı okuyup bize sonucu veriyor.
            const result = await ytSearch(url);

            if (result && result.videos.length > 0) {
                const bestMatch = result.videos[0];
                return {
                    title: bestMatch.title || 'Bilinmeyen Şarkı',
                    duration: bestMatch.timestamp, // "3:45" formatında
                    thumbnail: bestMatch.thumbnail,
                    exactUrl: bestMatch.url,
                };
            }
        } catch (error) {
            this.logger.error(`Info fetch failed (yt-search): ${error.message}`);
        }

        return { title: 'Bilinmeyen Müzik İsteği', exactUrl: url };
    }

    /**
     * Request a song to play
     */
    async play(url: string, requestedBy: string): Promise<{ success: boolean; message: string; title?: string }> {
        try {
            const info = await this.getVideoInfo(url);
            this.logger.log(`🎵 Şarkı bulundu: ${info.title}`);

            const item: QueueItem = {
                url: info.exactUrl,
                title: info.title,
                thumbnail: info.thumbnail,
                duration: info.duration,
                requestedBy,
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
            return { success: false, message: `❌ Şarkı çalınamadı: ${error.message}` };
        }
    }

    /**
     * Starts broadcasting the next song to all clients
     */
    public playNext(): void {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        if (this.queue.length > 0) {
            const nextItem = this.queue.shift()!;
            this.nowPlaying = {
                ...nextItem,
                startedAt: Date.now(),
            };
            this.isPaused = false;

            this.logger.log(`🎵 Şimdi çalıyor: ${this.nowPlaying.title}`);
            this.onQueueChange?.({ queue: this.getQueue().queue });
            this.onNowPlayingChange?.({ nowPlaying: this.nowPlaying });
        } else {
            this.nowPlaying = null;
            this.logger.log('🎵 Kuyruk bitti');
            this.onNowPlayingChange?.({ nowPlaying: null });
        }

        this.isTransitioning = false;
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

        this.onNowPlayingChange?.({ nowPlaying: null });
        this.onQueueChange?.({ queue: [] });
        return `⏹️ Durduruldu: **${stopped}** (Kuyruk temizlendi)`;
    }

    /**
     * Pause / Resume Broadcast Syncing
     */
    pause(): string {
        if (!this.nowPlaying) return '❌ Çalan bir şarkı yok!';

        this.isPaused = !this.isPaused;
        // Broadcast the play/pause state change to clients
        // Re-emitting the same track forces clients to evaluate the local paused state
        this.onNowPlayingChange?.({ nowPlaying: this.nowPlaying });

        return this.isPaused ? `⏸️ Duraklatıldı: **${this.nowPlaying.title}**` : `▶️ Devam: **${this.nowPlaying.title}**`;
    }

    getQueue(): { nowPlaying: NowPlaying | null; queue: QueueItem[]; isPaused: boolean } {
        return {
            nowPlaying: this.nowPlaying,
            queue: [...this.queue],
            isPaused: this.isPaused
        };
    }

    isPlaying(): boolean {
        return this.nowPlaying !== null && !this.isPaused;
    }
}
