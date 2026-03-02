import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MusicBotService } from './music-bot.service';

/**
 * MusicBotGateway
 * ===============
 * 
 * Watch2Gether tarzı yerleşik müzik botu gateway'i.
 * Sunucu tarafında indirme yapmaz, sadece state (çalıyor, durdu)
 * ve URL bilgilerini client'lardaki oynatıcılara senkronize eder.
 */
@WebSocketGateway({
    cors: { origin: '*' },
})
export class MusicBotGateway implements OnModuleInit {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(MusicBotGateway.name);

    constructor(private readonly musicBotService: MusicBotService) { }

    onModuleInit() {
        this.musicBotService.setCallbacks(
            // onNowPlayingChange - şu an çalan bilgisi
            (data) => {
                // Send the current playing track and also the paused state of the service
                this.server.emit('music-now-playing', {
                    nowPlaying: data.nowPlaying,
                    isPaused: this.musicBotService.getQueue().isPaused
                });
                this.logger.log(`🎵 Now Playing Sync: ${data.nowPlaying?.title || 'Yok'} (Paused: ${this.musicBotService.getQueue().isPaused})`);
            },
            // onQueueChange - kuyruk değişti
            (data) => {
                this.server.emit('music-queue-update', data);
            }
        );
        this.logger.log('🎵 MusicBotGateway hazır (Watch2Gether Mode)');
    }

    @SubscribeMessage('music-play')
    async handlePlay(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { url: string },
    ) {
        const username = (client as any).username || 'Anonim';
        this.logger.log(`🎵 Play İstendi: ${data.url} (${username})`);
        return await this.musicBotService.play(data.url, username);
    }

    @SubscribeMessage('music-skip')
    handleSkip(@ConnectedSocket() client: Socket) {
        const username = (client as any).username || 'Anonim';
        return { message: this.musicBotService.skip(username) };
    }

    @SubscribeMessage('music-stop')
    handleStop(@ConnectedSocket() client: Socket) {
        return { message: this.musicBotService.stop() };
    }

    @SubscribeMessage('music-pause')
    handlePause(@ConnectedSocket() client: Socket) {
        return { message: this.musicBotService.pause() };
    }

    @SubscribeMessage('music-queue')
    handleQueue(@ConnectedSocket() client: Socket) {
        return this.musicBotService.getQueue();
    }

    // YENİ: Client'taki React Player şarkı bittiğini bildirdiğinde
    @SubscribeMessage('music-ended')
    handleMusicEnded(@ConnectedSocket() client: Socket) {
        this.logger.log(`🎵 Şarkı bitti (Client bildirdi), sıradakine geçiliyor...`);
        this.musicBotService.playNext();
    }
}
