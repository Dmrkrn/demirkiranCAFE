import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import { types as mediasoupTypes } from 'mediasoup';
import * as os from 'os';

/**
 * MediasoupService
 * ================
 * 
 * Bu servis, mediasoup'un temel yapı taşlarını yönetir:
 * 
 * 1. **Worker**: C++ tabanlı alt süreç. Asıl medya işlemlerini yapar.
 *    - Her CPU çekirdeği için 1 worker açarız (performans için)
 *    - Worker ölürse yenisini açarız
 * 
 * 2. **Router**: Bir "oda" gibi düşün. Aynı router'a bağlı client'lar 
 *    birbirlerinin medyasını alabilir.
 *    - Codec ayarları burada tanımlanır (VP8, H264, Opus)
 * 
 * 3. **Transport**: Client ile sunucu arasındaki "tünel"
 *    - WebRtcTransport: Hem gönderme hem alma için
 */
@Injectable()
export class MediasoupService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(MediasoupService.name);

    // Worker havuzu - CPU çekirdek sayısına göre
    private workers: mediasoupTypes.Worker[] = [];
    private nextWorkerIndex = 0;

    // Ana Router - Tek oda olduğu için tek router yeterli
    private router: mediasoupTypes.Router | null = null;

    // Transport'ları takip etmek için (client id -> transport)
    private transports: Map<string, mediasoupTypes.WebRtcTransport> = new Map();

    // Producer'ları takip etmek için (producer id -> producer)
    private producers: Map<string, mediasoupTypes.Producer> = new Map();

    // Consumer'ları takip etmek için (consumer id -> consumer)
    private consumers: Map<string, mediasoupTypes.Consumer> = new Map();

    /**
     * Desteklenen Codec'ler
     * --------------------
     * Opus: Ses için. Düşük latency, adaptif bitrate
     * VP8: Video için. Açık kaynak, her yerde çalışır
     * H264: Video için. GPU hızlandırma desteği (varsa daha iyi performans)
     */
    private readonly mediaCodecs: mediasoupTypes.RtpCodecCapability[] = [
        {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2,
        },
        {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000,
            parameters: {},
        },
        {
            kind: 'video',
            mimeType: 'video/VP9',
            clockRate: 90000,
            parameters: {
                'profile-id': 2,
                'x-google-start-bitrate': 1000,
            },
        },
        {
            kind: 'video',
            mimeType: 'video/H264',
            clockRate: 90000,
            parameters: {
                'packetization-mode': 1,
                'profile-level-id': '42e01f',
                'level-asymmetry-allowed': 1,
            },
        },
    ] as mediasoupTypes.RtpCodecCapability[];

    /**
     * NestJS modül başlatıldığında çağrılır
     * Worker'ları ve ana Router'ı oluşturur
     */
    async onModuleInit() {
        this.logger.log('🚀 MediasoupService başlatılıyor...');

        // CPU çekirdek sayısını al (performans için worker sayısını buna göre ayarla)
        const numCpus = os.cpus().length;
        this.logger.log(`📊 CPU çekirdek sayısı: ${numCpus}`);

        // Her çekirdek için bir worker oluştur
        for (let i = 0; i < numCpus; i++) {
            await this.createWorker();
        }

        this.logger.log(`✅ ${this.workers.length} worker oluşturuldu`);

        // Ana router'ı oluştur (tek oda için tek router)
        await this.createRouter();
    }

    /**
     * Modül kapanırken worker'ları temizle
     */
    async onModuleDestroy() {
        this.logger.log('🛑 MediasoupService kapatılıyor...');

        for (const worker of this.workers) {
            worker.close();
        }

        this.workers = [];
        this.router = null;
    }

    /**
     * Yeni bir Worker oluşturur
     * -------------------------
     * Worker, mediasoup'un C++ tarafında çalışan alt süreçtir.
     * Asıl RTP paket yönlendirmesi burada yapılır.
     */
    private async createWorker(): Promise<mediasoupTypes.Worker> {
        const worker = await mediasoup.createWorker({
            logLevel: 'warn',
            logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
            // UDP port aralığı - Firewall'da açık olmalı
            rtcMinPort: 40000,
            rtcMaxPort: 40100,
        });

        worker.on('died', (error) => {
            this.logger.error(`❌ Worker öldü! Hata: ${error.message}`);

            // Worker'ı listeden çıkar
            const index = this.workers.indexOf(worker);
            if (index !== -1) {
                this.workers.splice(index, 1);
            }

            // Yeni worker oluştur (self-healing)
            this.createWorker().then(() => {
                this.logger.log('♻️ Yeni worker oluşturuldu (recovery)');
            });
        });

        this.workers.push(worker);
        this.logger.debug(`🔧 Worker oluşturuldu (PID: ${worker.pid})`);

        return worker;
    }

    /**
     * Round-robin ile bir sonraki worker'ı seç
     * Yükü worker'lar arasında dağıtmak için
     */
    private getNextWorker(): mediasoupTypes.Worker {
        const worker = this.workers[this.nextWorkerIndex];
        this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
        return worker;
    }

    /**
     * Ana Router'ı oluşturur
     * ----------------------
     * Router, bir "oda" gibi. Aynı router'a bağlı herkes
     * birbirinin Producer'larını (medya kaynaklarını) tüketebilir.
     */
    private async createRouter(): Promise<void> {
        const worker = this.getNextWorker();

        this.router = await worker.createRouter({
            mediaCodecs: this.mediaCodecs,
        });

        this.logger.log('🎯 Ana Router oluşturuldu');
        this.logger.log(`📝 Router RTP Capabilities hazır`);
    }

    /**
     * Router'ın RTP yeteneklerini döndürür
     * Client bu bilgiyi kullanarak kendi Device'ını yapılandırır
     */
    getRouterRtpCapabilities(): mediasoupTypes.RtpCapabilities | null {
        return this.router?.rtpCapabilities ?? null;
    }

    /**
     * WebRTC Transport oluşturur
     * --------------------------
     * Transport, client ile sunucu arasındaki "boru hattı"dır.
     * Hem medya göndermek (produce) hem almak (consume) için kullanılır.
     * 
     * @param clientId - Client'ın benzersiz kimliği
     * @returns Transport parametreleri (ICE, DTLS bilgileri)
     */
    async createWebRtcTransport(clientId: string): Promise<{
        id: string;
        iceParameters: mediasoupTypes.IceParameters;
        iceCandidates: mediasoupTypes.IceCandidate[];
        dtlsParameters: mediasoupTypes.DtlsParameters;
    } | null> {
        if (!this.router) {
            this.logger.error('Router henüz hazır değil!');
            return null;
        }

        // VPS Public IP - .env'den oku veya hardcode
        const publicIp = process.env.ANNOUNCED_IP || '157.230.125.137';

        // WebRTC Transport oluştur
        const transport = await this.router.createWebRtcTransport({
            listenIps: [
                {
                    ip: '0.0.0.0',      // Tüm arayüzlerden dinle
                    announcedIp: publicIp,  // VPS Public IP (bu olmadan WebRTC çalışmaz!)
                },
            ],
            enableUdp: true,
            enableTcp: true,    // Fallback için TCP de aç
            preferUdp: true,    // UDP tercih et (düşük latency)
            initialAvailableOutgoingBitrate: 1000000, // 1 Mbps başlangıç
        });

        // Transport'u kaydet
        this.transports.set(`${clientId}-${transport.id}`, transport);

        // Transport kapandığında temizle
        transport.on('routerclose', () => {
            this.logger.log(`🔌 Transport router kapandığı için kapandı: ${transport.id}`);
            this.transports.delete(`${clientId}-${transport.id}`);
        });

        this.logger.log(`📡 WebRTC Transport oluşturuldu: ${transport.id} (Client: ${clientId}, IP: ${publicIp})`);

        return {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        };
    }

    /**
     * Transport'u client'ın DTLS parametreleriyle bağlar
     * Bu, güvenli bağlantının kurulmasını sağlar
     */
    async connectTransport(
        clientId: string,
        transportId: string,
        dtlsParameters: mediasoupTypes.DtlsParameters,
    ): Promise<void> {
        const transport = this.findTransport(clientId, transportId);

        if (!transport) {
            throw new Error(`Transport bulunamadı: ${transportId}`);
        }

        await transport.connect({ dtlsParameters });
        this.logger.log(`🔗 Transport bağlandı: ${transportId}`);
    }

    /**
     * Producer oluşturur (Medya gönderme)
     * ----------------------------------
     * Client kameradan/mikrofondan gelen medyayı sunucuya gönderir.
     * Sunucu bu "Producer"ı diğer client'lara dağıtabilir.
     */
    async createProducer(
        clientId: string,
        transportId: string,
        kind: mediasoupTypes.MediaKind,
        rtpParameters: mediasoupTypes.RtpParameters,
        appData?: Record<string, unknown>,
    ): Promise<{ id: string } | null> {
        const transport = this.findTransport(clientId, transportId);

        if (!transport) {
            throw new Error(`Transport bulunamadı: ${transportId}`);
        }

        const producer = await transport.produce({
            kind,
            rtpParameters,
            appData,
        });

        this.producers.set(producer.id, producer);

        producer.on('transportclose', () => {
            this.logger.log(`📹 Producer transport kapandığı için kapandı: ${producer.id}`);
            this.producers.delete(producer.id);
        });

        this.logger.log(`📹 ${kind === 'video' ? 'Video' : 'Ses'} Producer oluşturuldu: ${producer.id}`);

        return { id: producer.id };
    }

    /**
     * Producer'ı kapat
     */
    closeProducer(producerId: string) {
        const producer = this.producers.get(producerId);
        if (producer) {
            producer.close();
            this.producers.delete(producerId);
            this.logger.log(`🛑 Producer kapatıldı (Manual): ${producerId}`);
        }
    }

    /**
     * Consumer oluşturur (Medya alma)
     * ------------------------------
     * Başka bir client'ın Producer'ını bu client'a iletir.
     */
    async createConsumer(
        clientId: string,
        transportId: string,
        producerId: string,
        rtpCapabilities: mediasoupTypes.RtpCapabilities,
    ): Promise<{
        id: string;
        producerId: string;
        kind: mediasoupTypes.MediaKind;
        rtpParameters: mediasoupTypes.RtpParameters;
        appData: any;
    } | null> {
        if (!this.router) {
            return null;
        }

        // Client bu producer'ı tüketebilir mi kontrol et
        if (!this.router.canConsume({ producerId, rtpCapabilities })) {
            this.logger.warn(`⚠️ Client bu producer'ı tüketemez: ${producerId}`);
            return null;
        }

        const transport = this.findTransport(clientId, transportId);
        if (!transport) {
            throw new Error(`Transport bulunamadı: ${transportId}`);
        }

        const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: false, // Hemen başlat
        });

        this.consumers.set(consumer.id, consumer);

        consumer.on('transportclose', () => {
            this.logger.log(`👁️ Consumer transport kapandığı için kapandı: ${consumer.id}`);
            this.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
            this.logger.log(`👁️ Consumer producer kapandığı için kapandı: ${consumer.id}`);
            this.consumers.delete(consumer.id);
        });

        this.logger.log(`👁️ Consumer oluşturuldu: ${consumer.id} -> ${producerId}`);

        return {
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            appData: consumer.appData,
        };
    }

    /**
     * Tüm aktif producer'ları döndürür
     * Yeni katılan client'ların mevcut yayınları görmesi için
     */
    getAllProducers(): { id: string; kind: mediasoupTypes.MediaKind; appData: any }[] {
        return Array.from(this.producers.values()).map((p) => ({
            id: p.id,
            kind: p.kind,
            appData: p.appData,
        }));
    }

    /**
     * Client ayrıldığında kaynaklarını temizler
     */
    cleanupClient(clientId: string): void {
        // Transport'ları temizle
        for (const [key, transport] of this.transports.entries()) {
            if (key.startsWith(clientId)) {
                transport.close();
                this.transports.delete(key);
            }
        }
        this.logger.log(`🧹 Client kaynakları temizlendi: ${clientId}`);
    }

    /**
     * Transport'u bul
     */
    private findTransport(clientId: string, transportId: string): mediasoupTypes.WebRtcTransport | undefined {
        return this.transports.get(`${clientId}-${transportId}`);
    }
}
