/**
 * useMediasoup Hook
 * ==================
 * 
 * Bu hook, mediasoup-client kütüphanesini yönetir.
 * 
 * Mediasoup-client Nedir?
 * -----------------------
 * Sunucudaki mediasoup SFU ile konuşmak için kullanılan istemci kütüphanesi.
 * 
 * Temel Kavramlar:
 * 
 * 1. **Device**: Tarayıcının medya yeteneklerini yönetir
 *    - Hangi codec'leri destekliyor?
 *    - RTP parametreleri neler?
 * 
 * 2. **Transport**: Sunucu ile aramızdaki "tünel"
 *    - SendTransport: Biz video/ses gönderiyoruz
 *    - RecvTransport: Başkalarının video/sesini alıyoruz
 * 
 * 3. **Producer**: Medya gönderici
 *    - Kameradan video producer
 *    - Mikrofondan audio producer
 * 
 * 4. **Consumer**: Medya alıcı
 *    - Başkasının producer'ını tüketir
 *    - Video elementine bağlanır
 */

import { useCallback, useRef, useState } from 'react';
import { Device, types } from 'mediasoup-client';

// RTP Capabilities tipi (sunucudan gelecek)
type RtpCapabilities = types.RtpCapabilities;

interface UseMediasoupProps {
    // Socket üzerinden request gönderme fonksiyonu
    request: <T, R>(event: string, data?: T) => Promise<R>;
}

interface Producer {
    id: string;
    kind: 'audio' | 'video';
    producer: types.Producer;
}

interface Consumer {
    id: string;
    producerId: string;
    peerId: string; // <-- YENİ: Hangi kullanıcıya ait
    kind: 'audio' | 'video';
    consumer: types.Consumer;
    stream: MediaStream;
}

interface UseMediasoupReturn {
    // State
    isDeviceLoaded: boolean;
    producers: Producer[];
    consumers: Consumer[];

    // Metodlar
    loadDevice: () => Promise<boolean>;
    createTransports: () => Promise<boolean>;
    produceVideo: (track: MediaStreamTrack) => Promise<string | null>;
    produceAudio: (track: MediaStreamTrack) => Promise<string | null>;
    consumeAll: () => Promise<void>;
    closeAll: () => void;
}

export function useMediasoup({ request }: UseMediasoupProps): UseMediasoupReturn {
    // Device - mediasoup-client'ın ana objesi
    const deviceRef = useRef<Device | null>(null);

    // Transport'lar
    const sendTransportRef = useRef<types.Transport | null>(null);
    const recvTransportRef = useRef<types.Transport | null>(null);

    // State
    const [isDeviceLoaded, setIsDeviceLoaded] = useState(false);
    const [producers, setProducers] = useState<Producer[]>([]);
    const [consumers, setConsumers] = useState<Consumer[]>([]);

    /**
     * ADIM 1: Device'ı Yükle
     * ----------------------
     * Sunucudan Router RTP Capabilities'i al ve Device'ı yapılandır.
     * Bu, hangi codec'lerin kullanılacağını belirler.
     */
    const loadDevice = useCallback(async (): Promise<boolean> => {
        try {
            console.log('📱 Device yükleniyor...');

            // Sunucudan RTP yeteneklerini al
            const { rtpCapabilities } = await request<void, { rtpCapabilities: RtpCapabilities }>(
                'getRouterRtpCapabilities'
            );

            console.log('📋 RTP Capabilities alındı:', rtpCapabilities);

            // Device oluştur
            const device = new Device();

            // Device'ı sunucunun yetenekileriyle yapılandır
            await device.load({ routerRtpCapabilities: rtpCapabilities });

            deviceRef.current = device;
            setIsDeviceLoaded(true);

            console.log('✅ Device yüklendi!');
            console.log('📹 Video gönderebilir:', device.canProduce('video'));
            console.log('🎤 Ses gönderebilir:', device.canProduce('audio'));

            return true;
        } catch (error) {
            console.error('❌ Device yüklenemedi:', error);
            return false;
        }
    }, [request]);

    /**
     * ADIM 2: Transport'ları Oluştur
     * ------------------------------
     * Gönderme ve alma için ayrı transport'lar oluştur.
     */
    const createTransports = useCallback(async (): Promise<boolean> => {
        if (!deviceRef.current) {
            console.error('Device henüz yüklenmedi!');
            return false;
        }

        try {
            // === SEND TRANSPORT (Video/ses göndermek için) ===
            console.log('📤 Send Transport oluşturuluyor...');

            const sendParams = await request<{ type: string }, {
                transportParams: {
                    id: string;
                    iceParameters: types.IceParameters;
                    iceCandidates: types.IceCandidate[];
                    dtlsParameters: types.DtlsParameters;
                };
            }>('createWebRtcTransport', { type: 'send' });

            const sendTransport = deviceRef.current.createSendTransport(sendParams.transportParams);

            // Transport bağlantı eventi (DTLS handshake)
            sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                try {
                    await request('connectTransport', {
                        transportId: sendTransport.id,
                        dtlsParameters,
                    });
                    callback(); // Başarılı
                } catch (error) {
                    errback(error as Error);
                }
            });

            // Produce eventi (yeni producer oluşturulduğunda)
            sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
                try {
                    const { producerId } = await request<
                        { transportId: string; kind: string; rtpParameters: types.RtpParameters },
                        { producerId: string }
                    >('produce', {
                        transportId: sendTransport.id,
                        kind,
                        rtpParameters,
                    });
                    callback({ id: producerId }); // Producer ID'yi döndür
                } catch (error) {
                    errback(error as Error);
                }
            });

            sendTransportRef.current = sendTransport;
            console.log('✅ Send Transport oluşturuldu:', sendTransport.id);

            // === RECV TRANSPORT (Başkalarını izlemek için) ===
            console.log('📥 Recv Transport oluşturuluyor...');

            const recvParams = await request<{ type: string }, {
                transportParams: {
                    id: string;
                    iceParameters: types.IceParameters;
                    iceCandidates: types.IceCandidate[];
                    dtlsParameters: types.DtlsParameters;
                };
            }>('createWebRtcTransport', { type: 'recv' });

            const recvTransport = deviceRef.current.createRecvTransport(recvParams.transportParams);

            // Transport bağlantı eventi
            recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                try {
                    await request('connectTransport', {
                        transportId: recvTransport.id,
                        dtlsParameters,
                    });
                    callback();
                } catch (error) {
                    errback(error as Error);
                }
            });

            recvTransportRef.current = recvTransport;
            console.log('✅ Recv Transport oluşturuldu:', recvTransport.id);

            return true;
        } catch (error) {
            console.error('❌ Transport oluşturulamadı:', error);
            return false;
        }
    }, [request]);

    /**
     * ADIM 3: Video Produce Et
     * ------------------------
     * Kameradan gelen video track'ini sunucuya gönder.
     */
    const produceVideo = useCallback(async (track: MediaStreamTrack): Promise<string | null> => {
        if (!sendTransportRef.current) {
            console.error('Send transport yok!');
            return null;
        }

        try {
            console.log('📹 Video producer oluşturuluyor...');

            const producer = await sendTransportRef.current.produce({
                track,
                // Simulcast ayarları (çoklu kalite)
                encodings: [
                    { maxBitrate: 100000, scaleResolutionDownBy: 4 },  // Low: 1/4 çözünürlük
                    { maxBitrate: 300000, scaleResolutionDownBy: 2 },  // Medium: 1/2 çözünürlük
                    { maxBitrate: 900000 },                            // High: Tam çözünürlük
                ],
                codecOptions: {
                    videoGoogleStartBitrate: 1000,
                },
            });

            setProducers(prev => [...prev, { id: producer.id, kind: 'video', producer }]);
            console.log('✅ Video producer oluşturuldu:', producer.id);

            return producer.id;
        } catch (error) {
            console.error('❌ Video producer oluşturulamadı:', error);
            return null;
        }
    }, []);

    /**
     * ADIM 4: Audio Produce Et
     * ------------------------
     * Mikrofondan gelen ses track'ini sunucuya gönder.
     */
    const produceAudio = useCallback(async (track: MediaStreamTrack): Promise<string | null> => {
        if (!sendTransportRef.current) {
            console.error('Send transport yok!');
            return null;
        }

        try {
            console.log('🎤 Audio producer oluşturuluyor...');

            const producer = await sendTransportRef.current.produce({ track });

            setProducers(prev => [...prev, { id: producer.id, kind: 'audio', producer }]);
            console.log('✅ Audio producer oluşturuldu:', producer.id);

            return producer.id;
        } catch (error) {
            console.error('❌ Audio producer oluşturulamadı:', error);
            return null;
        }
    }, []);

    /**
     * ADIM 5: Tüm Producer'ları Consume Et
     * ------------------------------------
     * Odadaki diğer kullanıcıların video/seslerini al.
     */
    const consumeAll = useCallback(async () => {
        if (!recvTransportRef.current || !deviceRef.current) {
            console.error('Transport veya device yok!');
            return;
        }

        try {
            console.log('👀 Mevcut producer\'lar alınıyor...');

            // Sunucudan mevcut producer listesini al
            const { producers: producerList } = await request<void, {
                producers: { id: string; kind: 'audio' | 'video' }[];
            }>('getProducers');

            console.log('📋 Producer listesi:', producerList);

            // Her producer için consumer oluştur
            for (const prod of producerList) {
                await consumeProducer(prod.id);
            }
        } catch (error) {
            console.error('❌ Consume hatası:', error);
        }
    }, [request]);



    /**
     * Tek bir producer'ı consume et
     */
    const consumeProducer = async (producerId: string) => {
        if (!recvTransportRef.current || !deviceRef.current) return;

        try {
            // Sunucudan consume bilgilerini al
            const consumeParams = await request<
                { producerId: string; rtpCapabilities: RtpCapabilities },
                {
                    consumerId: string;
                    producerId: string;
                    kind: 'audio' | 'video';
                    rtpParameters: types.RtpParameters;
                    peerId: string; // <-- YENİ
                }
            >('consume', {
                producerId,
                rtpCapabilities: deviceRef.current.rtpCapabilities,
            });

            // Consumer oluştur
            const consumer = await recvTransportRef.current.consume({
                id: consumeParams.consumerId,
                producerId: consumeParams.producerId,
                kind: consumeParams.kind,
                rtpParameters: consumeParams.rtpParameters,
            });

            // MediaStream oluştur (video elementine bağlamak için)
            const stream = new MediaStream([consumer.track]);

            setConsumers(prev => [...prev, {
                id: consumer.id,
                producerId: consumeParams.producerId,
                peerId: consumeParams.peerId, // <-- YENİ
                kind: consumeParams.kind,
                consumer,
                stream,
            }]);

            console.log(`✅ ${consumeParams.kind} consumer oluşturuldu:`, consumer.id, 'user:', consumeParams.peerId);
        } catch (error) {
            console.error('❌ Consumer oluşturulamadı:', error);
        }
    };

    /**
     * Temizlik: Tüm producer ve consumer'ları kapat
     */
    const closeAll = useCallback(() => {
        // Producer'ları kapat
        producers.forEach(p => p.producer.close());
        setProducers([]);

        // Consumer'ları kapat
        consumers.forEach(c => c.consumer.close());
        setConsumers([]);

        // Transport'ları kapat
        sendTransportRef.current?.close();
        recvTransportRef.current?.close();
        sendTransportRef.current = null;
        recvTransportRef.current = null;

        console.log('🧹 Tüm mediasoup kaynakları temizlendi');
    }, [producers, consumers]);

    return {
        isDeviceLoaded,
        producers,
        consumers,
        loadDevice,
        createTransports,
        produceVideo,
        produceAudio,
        consumeAll,
        closeAll,
    };
}
