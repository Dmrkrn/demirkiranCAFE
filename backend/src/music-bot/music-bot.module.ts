import { Module } from '@nestjs/common';
import { MusicBotService } from './music-bot.service';
import { MusicBotGateway } from './music-bot.gateway';
import { MusicBotController } from './music-bot.controller';
import { MediasoupModule } from '../mediasoup/mediasoup.module';
import { ProxyPoolService } from './proxy-pool.service';

@Module({
    imports: [MediasoupModule],
    controllers: [MusicBotController],
    providers: [ProxyPoolService, MusicBotService, MusicBotGateway],
    exports: [MusicBotService],
})
export class MusicBotModule { }
