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
 * Discord tarzı müzik botu gateway'i.
 * Bot, sanal bir kullanıcı olarak ses kanalına katılır.
 * Producer'ı normal signaling akışıyla tüm client'lara dağıtılır.
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
                this.server.emit('music-now-playing', data);
                this.logger.log(`🎵 Now Playing: ${data.nowPlaying?.title || 'Yok'}`);
            },
            // onQueueChange - kuyruk değişti
            (data) => {
                this.server.emit('music-queue-update', data);
            },
            // onProducerReady - bot producer oluşturuldu → tüm client'lara bildir
            // Bu sayede normal signaling akışıyla auto-consume olur (Discord gibi)
            (producerId: string) => {
                this.server.emit('new-producer', {
                    producerId,
                    peerId: 'music-bot',
                    kind: 'audio',
                    appData: { isBot: true, botType: 'music' },
                });
                this.logger.log(`🎵 Bot producer broadcast edildi: ${producerId}`);
            },
        );
        this.logger.log('🎵 MusicBotGateway hazır');
    }

    @SubscribeMessage('music-play')
    async handlePlay(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { url: string },
    ) {
        const username = (client as any).username || 'Anonim';
        this.logger.log(`🎵 Play: ${data.url} (${username})`);
        return await this.musicBotService.play(data.url, username);
    }

    @SubscribeMessage('music-skip')
    async handleSkip(@ConnectedSocket() client: Socket) {
        const username = (client as any).username || 'Anonim';
        return { message: await this.musicBotService.skip(username) };
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
}
