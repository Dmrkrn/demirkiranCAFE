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
import { ConfigService } from '@nestjs/config';

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
    maxHttpBufferSize: 1e8 // 100MB (Dosya yükleme için)
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

    constructor(
        private readonly mediasoupService: MediasoupService,
        private readonly configService: ConfigService
    ) { }

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

        // RommId bilgisini al (silmeden önce)
        const clientInfo = this.clients.get(client.id);
        const roomId = (clientInfo as any)?.roomId || 'main'; // Fallback

        // Mediasoup kaynaklarını temizle
        this.mediasoupService.cleanupClient(client.id);

        // Client bilgilerini sil
        this.clients.delete(client.id);

        // Diğer client'lara haber ver (Sadece o odadakilere)
        this.server.to(roomId).emit('peer-left', { peerId: client.id });
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
                data.appData,
            );

            if (!producer) {
                return { error: 'Producer oluşturulamadı' };
            }

            // Client bilgilerini güncelle
            const clientInfo = this.clients.get(client.id);
            if (clientInfo) {
                clientInfo.producers.push(producer.id);
            }

            // Diğer client'lara yeni producer'ı bildir (SADECE AYNI ODADAKİLERE)
            const roomId = (clientInfo as any).roomId || 'main';
            client.to(roomId).emit('new-producer', {
                producerId: producer.id,
                peerId: client.id,
                kind: data.kind,
                appData: data.appData,
            });

            return { producerId: producer.id };
        } catch (error) {
            this.logger.error(`Produce hatası: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Producer'ı Kapat
     * ----------------
     * Client bir yayını (örn: ekran paylaşımı) durdurduğunda çağrılır.
     * Sunucu tarafındaki producer'ı kapatır ve consumer'lara haber verir.
     */
    @SubscribeMessage('closeProducer')
    handleCloseProducer(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { producerId: string },
    ) {
        this.logger.log(`🛑 Close Producer isteği: ${client.id} -> ${data.producerId}`);

        const clientInfo = this.clients.get(client.id);
        if (!clientInfo) return;

        // Producer'ı listemizden sil
        const index = clientInfo.producers.indexOf(data.producerId);
        if (index !== -1) {
            clientInfo.producers.splice(index, 1);
        }

        // Mediasoup servisinden kapat (bu işlem otomatik olarak "producerclose" event'ini tetikler)
        // Ancak bu event transport üzerinden consumer'a gider.
        // Bizim ayrıyeten socket.io ile de bildirmemiz iyi olabilir (garanti olsun diye)

        // Not: MediasoupService'de "closeProducer" yok, direct producer objesine erişip kapatmamız lazım.
        // Şimdilik getAllProducers() sadece liste dönüyor.
        // Hızlı çözüm: MediasoupService'e closeProducer ekleyelim veya burada yönetelim.
        // Ama servisteki map private.
        // O yüzden servise bir metod ekleyeceğiz.

        this.mediasoupService.closeProducer(data.producerId);

        // Odaya bildir
        const roomId = (clientInfo as any).roomId || 'main';
        client.to(roomId).emit('producer-closed', {
            producerId: data.producerId,
            peerId: client.id,
        });

        return { success: true };
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

            // Producer sahibini bul (peerId) - bot ise 'music-bot'
            const producerOwnerEntry = Array.from(this.clients.entries())
                .find(([_, info]) => info.producers.includes(data.producerId));
            const producerPeerId = producerOwnerEntry
                ? producerOwnerEntry[0]
                : (consumer.appData?.isBot ? 'music-bot' : null);

            return {
                consumerId: consumer.id,
                producerId: consumer.producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                peerId: producerPeerId, // <-- YENİ: Stream'in kime ait olduğu
                appData: consumer.appData, // <-- YENİ
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
        const clientRoomId = (clientInfo as any).roomId || 'main';

        // Sadece aynı odadaki producer'ları filtrele + bot producer'ları dahil et
        const otherProducers = producers.filter(p => {
            if (ownProducerIds.includes(p.id)) return false;

            // Bot producer'ları her zaman dahil et
            if (p.appData?.isBot) return true;

            // Producer sahibini bul
            const producerOwnerEntry = Array.from(this.clients.entries())
                .find(([_, info]) => info.producers.includes(p.id));

            if (!producerOwnerEntry) return false;

            const ownerInfo = producerOwnerEntry[1];
            const ownerRoomId = (ownerInfo as any).roomId || 'main';

            return ownerRoomId === clientRoomId;
        }).map(p => ({
            ...p,
            peerId: p.appData?.isBot ? 'music-bot' : undefined,
        }));

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


    /**
     * Kullanıcı adını ayarla ve odaya katıl
     * Şifre kontrolü yapılır
     */
    @SubscribeMessage('setUsername')
    handleSetUsername(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { username: string; password?: string; roomId?: string; deviceId?: string },
    ) {
        const roomId = data.roomId || 'main'; // Varsayılan: Ana Oda
        let requiredPassword = '';

        if (roomId === 'dev') {
            requiredPassword = this.configService.get<string>('DEV_ROOM_PASSWORD', 'dev123');
        } else {
            requiredPassword = this.configService.get<string>('ROOM_PASSWORD', 'fallbackPassword');
        }

        // Şifre kontrolü (Trim uygula)
        const cleanInput = (data.password || '').trim();
        const cleanRequired = (requiredPassword || '').trim();

        if (cleanInput !== cleanRequired) {
            this.logger.warn(`🚫 Yanlış şifre denemesi (${roomId}): ${client.id}. Beklenen: '${cleanRequired}', Gelen: '${cleanInput}'`);
            return { success: false, error: 'Yanlış şifre!' };
        }

        const clientInfo = this.clients.get(client.id);
        if (clientInfo) {
            (clientInfo as any).roomId = roomId; // Type hack, better to update interface
            (clientInfo as any).deviceId = data.deviceId; // Cihaz UUID
            clientInfo.username = data.username;

            // Socket.io odasına katıl
            // Önceki odalardan çık ve o odalardaki kullanıcılara haber ver
            client.rooms.forEach(r => {
                if (r !== client.id) {
                    // Eski odaya "peer-left" gönder (diğer kullanıcılar görsün)
                    client.to(r).emit('peer-left', { peerId: client.id });
                    client.leave(r);
                }
            });
            client.join(roomId);

            this.logger.log(`👤 Kullanıcı katıldı: ${client.id} -> ${data.username} @ ${roomId}`);

            // Diğer client'lara haber ver (Sadece o odadakiler duysun/görsün)
            client.to(roomId).emit('peer-joined', {
                peerId: client.id,
                username: data.username,
                deviceId: data.deviceId,
                roomId: roomId
            });
        }
        return { success: true };
    }

    /**
     * Sohbet Mesajı Gönder (Odaya Özel)
     */
    @SubscribeMessage('chat-message')
    handleChatMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { message: string; file?: { name: string; type: string; data: string } },
    ) {
        const clientInfo = this.clients.get(client.id);
        const username = clientInfo?.username || 'Anonim';
        const roomId = (clientInfo as any).roomId || 'main';

        this.logger.log(`💬 Mesaj (${roomId}): ${username}: ${data.message} ${data.file ? '[DOSYA]' : ''}`);

        // Sadece o odadakilere gönder
        this.server.to(roomId).emit('chat-message', {
            id: `${client.id}-${Date.now()}`,
            senderId: client.id,
            senderName: username,
            message: data.message,
            file: data.file, // Dosyayı olduğu gibi ilet
            timestamp: new Date().toISOString(),
        });

        return { success: true };
    }

    /**
     * Kullanıcı Durumunu Güncelle (Global Görünürlük)
     */
    @SubscribeMessage('updatePeerStatus')
    handleUpdatePeerStatus(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { isMicMuted?: boolean; isDeafened?: boolean },
    ) {
        const clientInfo = this.clients.get(client.id);
        if (clientInfo) {
            Object.assign(clientInfo, data);
            this.logger.log(`🔄 Status update: ${client.id} -> ${JSON.stringify(data)}`);
            client.broadcast.emit('peer-status-update', {
                peerId: client.id,
                status: data,
            });
        }
        return { success: true };
    }

    /**
     * Mevcut kullanıcıları listele (Global)
     */
    @SubscribeMessage('getUsers')
    handleGetUsers(@ConnectedSocket() client: Socket) {
        const users = Array.from(this.clients.entries())
            .filter(([id]) => id !== client.id)
            .map(([id, info]) => ({
                id,
                username: info.username || 'Anonim',
                deviceId: (info as any).deviceId,
                roomId: (info as any).roomId || 'main',
                isMicMuted: (info as any).isMicMuted,
                isDeafened: (info as any).isDeafened,
            }));

        return { users };
    }
}
