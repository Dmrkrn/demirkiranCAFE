import { Module } from '@nestjs/common';
import { MusicBotService } from './music-bot.service';
import { MusicBotGateway } from './music-bot.gateway';
import { MediasoupModule } from '../mediasoup/mediasoup.module';

@Module({
    imports: [MediasoupModule],
    providers: [MusicBotService, MusicBotGateway],
    exports: [MusicBotService],
})
export class MusicBotModule { }
