import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MediasoupModule } from './mediasoup/mediasoup.module';
import { MusicBotModule } from './music-bot/music-bot.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MediasoupModule,
    MusicBotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

