import { Module } from '@nestjs/common';
import { MediasoupService } from './mediasoup.service';
import { SignalingGateway } from './signaling.gateway';

/**
 * MediasoupModule
 * ===============
 * 
 * mediasoup ile ilgili tüm bileşenleri bir araya getirir:
 * - MediasoupService: Worker, Router, Transport yönetimi
 * - SignalingGateway: WebSocket iletişimi
 */
@Module({
    providers: [MediasoupService, SignalingGateway],
    exports: [MediasoupService],
})
export class MediasoupModule { }
