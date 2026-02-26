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
 * Müzik botu socket event'lerini yönetir.
 * Chat komutları veya direkt socket event'leri ile kontrol edilir.
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
        // Event callback'lerini ayarla
        this.musicBotService.setCallbacks(
            // onNowPlayingChange
            (data) => {
                this.server.emit('music-now-playing', data);
                this.logger.log(`🎵 Now Playing broadcast: ${data.nowPlaying?.title || 'Yok'}`);
            },
            // onQueueChange
            (data) => {
                this.server.emit('music-queue-update', data);
            },
        );
        this.logger.log('🎵 MusicBotGateway hazır');
    }

    /**
     * Şarkı çal
     * Data: { url: string }
     */
    @SubscribeMessage('music-play')
    async handlePlay(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { url: string },
    ) {
        const username = (client as any).username || 'Anonim';
        this.logger.log(`🎵 Play isteği: ${data.url} (${username})`);

        const result = await this.musicBotService.play(data.url, username);

        // Sonucu sadece isteyen client'a gönder
        return result;
    }

    /**
     * Şarkı atla
     */
    @SubscribeMessage('music-skip')
    async handleSkip(@ConnectedSocket() client: Socket) {
        const username = (client as any).username || 'Anonim';
        const message = await this.musicBotService.skip(username);
        return { message };
    }

    /**
     * Durdur
     */
    @SubscribeMessage('music-stop')
    handleStop(@ConnectedSocket() client: Socket) {
        const message = this.musicBotService.stop();
        return { message };
    }

    /**
     * Duraklat / Devam
     */
    @SubscribeMessage('music-pause')
    handlePause(@ConnectedSocket() client: Socket) {
        const message = this.musicBotService.pause();
        return { message };
    }

    /**
     * Kuyruk bilgisi
     */
    @SubscribeMessage('music-queue')
    handleQueue(@ConnectedSocket() client: Socket) {
        return this.musicBotService.getQueue();
    }

    /**
     * Producer ID bilgisi (client consume etmek için)
     */
    @SubscribeMessage('music-producer-id')
    handleProducerId(@ConnectedSocket() client: Socket) {
        return { producerId: this.musicBotService.getProducerId() };
    }
}
