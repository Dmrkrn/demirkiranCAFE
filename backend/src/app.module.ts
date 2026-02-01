import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MediasoupModule } from './mediasoup/mediasoup.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // ConfigModule'ü her yerde kullanabiliriz (import etmeye gerek kalmaz)
    }),
    MediasoupModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }

