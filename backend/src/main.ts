import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './adapters/socket-io.adapter';

async function bootstrap() {
  try {
    console.log('🚀 Backend başlatılıyor...');
    const app = await NestFactory.create(AppModule);

    // Custom Socket.io Adapter'ı kullan (Payload limiti için şart)
    app.useWebSocketAdapter(new SocketIoAdapter(app));

    // CORS ayarları (HTTP için)
    app.enableCors({
      origin: '*',
      credentials: true,
    });

    const port = process.env.PORT ?? 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`✅ Backend çalışıyor: http://localhost:${port}`);
    console.log(`📡 Ağ Erişimi: http://${require('os').networkInterfaces()['Wi-Fi']?.[1]?.address || 'IP_ADRESINIZ'}:${port}`);
  } catch (error) {
    console.error('❌ Backend başlatma hatası:', error);
    process.exit(1);
  }
}
bootstrap();

