import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MediasoupService } from './mediasoup.service';
import { types as mediasoupTypes } from 'mediasoup';

/**
 * SignalingGateway
 * ================
 * 
 * WebSocket üzerinden client-server iletişimini yönetir.
 * 
 * "Signaling" Nedir?
 * ------------------
 * WebRTC bağlantısı kurulmadan önce client'ların birbirleriyle
 * bazı bilgileri paylaşması gerekir:
 * - RTP Capabilities (hangi codec'leri destekliyorum?)
 * - ICE Candidates (bana nasıl ulaşabilirsin?)
 * - DTLS Parameters (şifreleme ayarları)
 * 
 * Bu bilgiler WebSocket üzerinden takas edilir, buna "Signaling" denir.
 * Asıl medya (ses/video) WebRTC üzerinden akar.
 */
@WebSocketGateway({
    cors: {
        origin: '*', // Production'da kısıtla!
    },
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(SignalingGateway.name);

    // Client bilgilerini tutmak için
    private clients: Map<string, {
        socket: Socket;
        username?: string; // Kullanıcı adı
        rtpCapabilities?: mediasoupTypes.RtpCapabilities;
        sendTransportId?: string;
        recvTransportId?: string;
        producers: string[];
        consumers: string[];
    }> = new Map();

    constructor(private readonly mediasoupService: MediasoupService) { }

    /**
     * Client bağlandığında
     */
    handleConnection(client: Socket) {
        this.logger.log(`🔌 Client bağlandı: ${client.id}`);

        this.clients.set(client.id, {
            socket: client,
            producers: [],
            consumers: [],
        });

        // Bağlanan client'a hoşgeldin mesajı
        client.emit('welcome', {
            message: 'DemirkiranCAFE\'ye hoşgeldin!',
            clientId: client.id,
        });
    }

    /**
     * Client ayrıldığında
     */
    handleDisconnect(client: Socket) {
        this.logger.log(`🔌 Client ayrıldı: ${client.id}`);

        // Mediasoup kaynaklarını temizle
        this.mediasoupService.cleanupClient(client.id);

        // Client bilgilerini sil
        this.clients.delete(client.id);

        // Diğer client'lara haber ver
        this.server.emit('peer-left', { peerId: client.id });
    }

    /**
     * 1. ADIM: Router RTP Capabilities Al
     * ------------------------------------
     * Client önce sunucunun hangi codec'leri desteklediğini öğrenmeli.
     * Bu bilgiyle kendi mediasoup-client Device'ını yapılandırır.
     */
    @SubscribeMessage('getRouterRtpCapabilities')
    handleGetRouterRtpCapabilities(@ConnectedSocket() client: Socket) {
        this.logger.log(`📋 RTP Capabilities istendi: ${client.id}`);

        const rtpCapabilities = this.mediasoupService.getRouterRtpCapabilities();

        return { rtpCapabilities };
    }

    /**
     * 2. ADIM: Transport Oluştur (Gönderme veya Alma için)
     * ----------------------------------------------------
     * Client medya göndermek veya almak için bir "Transport" ister.
     * Bu, güvenli bir tünel gibidir.
     */
    @SubscribeMessage('createWebRtcTransport')
    async handleCreateWebRtcTransport(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { type: 'send' | 'recv' },
    ) {
        this.logger.log(`📡 Transport istendi (${data.type}): ${client.id}`);

        const transportParams = await this.mediasoupService.createWebRtcTransport(client.id);

        if (!transportParams) {
            return { error: 'Transport oluşturulamadı' };
        }

        // Client bilgilerini güncelle
        const clientInfo = this.clients.get(client.id);
        if (clientInfo) {
            if (data.type === 'send') {
                clientInfo.sendTransportId = transportParams.id;
            } else {
                clientInfo.recvTransportId = transportParams.id;
            }
        }

        return { transportParams };
    }

    /**
     * 3. ADIM: Transport'u Bağla (DTLS Handshake)
     * -------------------------------------------
     * Client, transport'u kullanmaya başlamadan önce
     * DTLS (şifreleme) parametrelerini gönderir.
     */
    @SubscribeMessage('connectTransport')
    async handleConnectTransport(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { transportId: string; dtlsParameters: mediasoupTypes.DtlsParameters },
    ) {
        this.logger.log(`🔗 Transport bağlantısı: ${client.id} - ${data.transportId}`);

        try {
            await this.mediasoupService.connectTransport(
                client.id,
                data.transportId,
                data.dtlsParameters,
            );
            return { success: true };
        } catch (error) {
            this.logger.error(`Transport bağlantı hatası: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * 4. ADIM: Produce (Medya Göndermeye Başla)
     * -----------------------------------------
     * Client kamerasından veya mikrofonundan gelen medyayı
     * sunucuya göndermeye başlar.
     */
    @SubscribeMessage('produce')
    async handleProduce(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: {
            transportId: string;
            kind: mediasoupTypes.MediaKind;
            rtpParameters: mediasoupTypes.RtpParameters;
            appData?: Record<string, unknown>;
        },
    ) {
        this.logger.log(`📹 Produce isteği (${data.kind}): ${client.id}`);

        try {
            const producer = await this.mediasoupService.createProducer(
                client.id,
                data.transportId,
                data.kind,
                data.rtpParameters,
            );

            if (!producer) {
                return { error: 'Producer oluşturulamadı' };
            }

            // Client bilgilerini güncelle
            const clientInfo = this.clients.get(client.id);
            if (clientInfo) {
                clientInfo.producers.push(producer.id);
            }

            // Diğer client'lara yeni producer'ı bildir
            client.broadcast.emit('new-producer', {
                producerId: producer.id,
                peerId: client.id,
                kind: data.kind,
            });

            return { producerId: producer.id };
        } catch (error) {
            this.logger.error(`Produce hatası: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * 5. ADIM: Consume (Başka Birinin Medyasını Al)
     * ---------------------------------------------
     * Client, başka bir kullanıcının producer'ını tüketmek ister.
     * Sunucu gerekli parametreleri döndürür.
     */
    @SubscribeMessage('consume')
    async handleConsume(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: {
            producerId: string;
            rtpCapabilities: mediasoupTypes.RtpCapabilities;
        },
    ) {
        this.logger.log(`👁️ Consume isteği: ${client.id} -> ${data.producerId}`);

        const clientInfo = this.clients.get(client.id);
        if (!clientInfo?.recvTransportId) {
            return { error: 'Receive transport bulunamadı' };
        }

        try {
            const consumer = await this.mediasoupService.createConsumer(
                client.id,
                clientInfo.recvTransportId,
                data.producerId,
                data.rtpCapabilities,
            );

            if (!consumer) {
                return { error: 'Consumer oluşturulamadı' };
            }

            // Client bilgilerini güncelle
            clientInfo.consumers.push(consumer.id);

            return {
                consumerId: consumer.id,
                producerId: consumer.producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
            };
        } catch (error) {
            this.logger.error(`Consume hatası: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Mevcut tüm producer'ları listele
     * Yeni katılan client mevcut yayıncıları görmek için bunu kullanır
     */
    @SubscribeMessage('getProducers')
    handleGetProducers(@ConnectedSocket() client: Socket) {
        this.logger.log(`📋 Producer listesi istendi: ${client.id}`);

        const producers = this.mediasoupService.getAllProducers();

        // Kendi producer'larını hariç tut
        const clientInfo = this.clients.get(client.id);
        const ownProducerIds = clientInfo?.producers ?? [];

        const otherProducers = producers.filter(p => !ownProducerIds.includes(p.id));

        return { producers: otherProducers };
    }

    /**
     * Client RTP Capabilities'ini kaydet
     * Consume işlemi için gerekli
     */
    @SubscribeMessage('saveRtpCapabilities')
    handleSaveRtpCapabilities(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { rtpCapabilities: mediasoupTypes.RtpCapabilities },
    ) {
        const clientInfo = this.clients.get(client.id);
        if (clientInfo) {
            clientInfo.rtpCapabilities = data.rtpCapabilities;
        }
        return { success: true };
    }

    // Oda şifresi (basit güvenlik)
    private readonly ROOM_PASSWORD = '19071907';

    /**
     * Kullanıcı adını ayarla ve odaya katıl
     * Şifre kontrolü yapılır
     */
    @SubscribeMessage('setUsername')
    handleSetUsername(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { username: string; password?: string },
    ) {
        // Şifre kontrolü
        if (data.password !== this.ROOM_PASSWORD) {
            this.logger.warn(`🚫 Yanlış şifre denemesi: ${client.id}`);
            return { success: false, error: 'Yanlış şifre!' };
        }

        const clientInfo = this.clients.get(client.id);
        if (clientInfo) {
            clientInfo.username = data.username;
            this.logger.log(`👤 Kullanıcı adı ayarlandı: ${client.id} -> ${data.username}`);

            // Diğer client'lara haber ver
            client.broadcast.emit('peer-joined', {
                peerId: client.id,
                username: data.username,
            });
        }
        return { success: true };
    }

    /**
     * Sohbet Mesajı Gönder
     * --------------------
     * Client bir mesaj gönderir, sunucu tüm client'lara dağıtır.
     */
    @SubscribeMessage('chat-message')
    handleChatMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { message: string },
    ) {
        const clientInfo = this.clients.get(client.id);
        const username = clientInfo?.username || 'Anonim';

        this.logger.log(`💬 Mesaj: ${username}: ${data.message}`);

        // Tüm client'lara mesajı gönder (gönderen dahil)
        this.server.emit('chat-message', {
            id: `${client.id}-${Date.now()}`,
            senderId: client.id,
            senderName: username,
            message: data.message,
            timestamp: new Date().toISOString(),
        });

        return { success: true };
    }

    /**
     * Mevcut kullanıcıları listele
     */
    @SubscribeMessage('getUsers')
    handleGetUsers(@ConnectedSocket() client: Socket) {
        const users = Array.from(this.clients.entries())
            .filter(([id]) => id !== client.id)
            .map(([id, info]) => ({
                id,
                username: info.username || 'Anonim',
            }));

        return { users };
    }
}
