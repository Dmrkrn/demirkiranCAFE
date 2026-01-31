import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    console.log('🚀 Backend başlatılıyor...');
    const app = await NestFactory.create(AppModule);

    // CORS ayarları (Electron client için gerekli)
    app.enableCors({
      origin: '*',
      credentials: true,
    });

    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`✅ Backend çalışıyor: http://localhost:${port}`);
  } catch (error) {
    console.error('❌ Backend başlatma hatası:', error);
    process.exit(1);
  }
}
bootstrap();

