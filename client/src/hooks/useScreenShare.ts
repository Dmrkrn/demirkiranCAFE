/**
 * useScreenShare Hook
 * ====================
 * 
 * Bu hook, Electron'un desktopCapturer API'sini kullanarak
 * ekran paylaşımını yönetir.
 * 
 * Ekran Paylaşımı Nasıl Çalışır?
 * ------------------------------
 * 1. Electron'dan mevcut ekranları/pencereleri listele
 * 2. Kullanıcı hangi ekranı paylaşacağını seçsin
 * 3. Seçilen kaynaktan MediaStream al
 * 4. Bu stream'i ayrı bir Producer olarak sunucuya gönder
 * 
 * Neden Normal Kameradan Farklı?
 * ------------------------------
 * - Ekran paylaşımı için farklı codec ayarları kullanırız
 * - Text/kod paylaşımı için çözünürlük önemli (frame rate değil)
 * - Oyun paylaşımı için frame rate önemli (çözünürlük değil)
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// Electron'dan gelen kaynak tipi
interface DesktopSource {
    id: string;
    name: string;
    thumbnail: string; // Base64 data URL
}

interface UseScreenShareReturn {
    // State
    isSharing: boolean;
    screenStream: MediaStream | null;
    availableSources: DesktopSource[];
    selectedSourceId: string | null;

    // Metodlar
    getSources: () => Promise<DesktopSource[]>;
    startScreenShare: (sourceId: string, includeAudio?: boolean) => Promise<MediaStream | null>;
    stopScreenShare: () => void;
}

export function useScreenShare(): UseScreenShareReturn {
    const streamRef = useRef<MediaStream | null>(null);
    const [isSharing, setIsSharing] = useState(false);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [availableSources, setAvailableSources] = useState<DesktopSource[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

    /**
     * Electron'dan mevcut ekran ve pencere kaynaklarını al
     */
    const getSources = useCallback(async (): Promise<DesktopSource[]> => {
        // Electron API mevcut mu kontrol et
        if (!window.electronAPI) {
            console.warn('⚠️ Electron API bulunamadı. Tarayıcıda ekran paylaşımı için farklı yöntem gerekli.');

            // Tarayıcıda getDisplayMedia kullan (fallback)
            // Bu durumda sadece boş dizi döner, kullanıcı doğrudan paylaşır
            return [];
        }

        try {
            console.log('🖥️ Ekran kaynakları alınıyor...');
            const sources = await window.electronAPI.getDesktopSources();

            console.log('📋 Mevcut kaynaklar:', sources.map(s => s.name));
            setAvailableSources(sources);

            return sources;
        } catch (error) {
            console.error('❌ Ekran kaynakları alınamadı:', error);
            return [];
        }
    }, []);

    /**
     * Ekran paylaşımını başlat
     * @param sourceId - Electron'dan seçilen kaynak ID'si (veya boş string tarayıcı için)
     * @param includeAudio - Sistem sesini dahil et (varsayılan: sadece tam ekran için true)
     */
    const startScreenShare = useCallback(async (sourceId: string, includeAudio: boolean = true): Promise<MediaStream | null> => {
        try {
            console.log('🖥️ Ekran paylaşımı başlatılıyor...', { sourceId, includeAudio });

            let stream: MediaStream;

            if (window.electronAPI && sourceId) {
                // Pencere paylaşımında ses dahil edilmez (demirkiranCAFE sesi gitmemesi için)
                const isWindowShare = sourceId.startsWith('window:');

                console.log(`🖥️ Kaynak türü: ${isWindowShare ? 'PENCERE' : 'TAM EKRAN'}`);

                // Video + Audio birlikte al (Electron için)
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId,
                        },
                        // @ts-ignore - Windows/Electron deneysel özellik (Uygulama kendi sesini duymasın)
                        systemAudio: 'exclude',
                    } as any,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId,
                            minWidth: 1280,
                            maxWidth: 1920,
                            minHeight: 720,
                            maxHeight: 1080,
                            minFrameRate: 60,
                            maxFrameRate: 60,
                        },
                    } as MediaTrackConstraints,
                });

                // Pencere paylaşımında ses dahil edilsin mi? (includeAudio)
                // Kendi sesimizi engellemek için restrictOwnAudio constraint kullanıyoruz ve işe yarayacağını umuyoruz.
                if (!includeAudio) {
                    const audioTracks = stream.getAudioTracks();
                    audioTracks.forEach(track => {
                        stream.removeTrack(track);
                        track.stop();
                        console.log('🔇 Audio track kaldırıldı (pencere paylaşımı)');
                    });
                } else {
                    console.log('🔊 Tam ekran paylaşımı: Ses dahil');
                }

                // Audio track için constraints'leri sonradan uygula (Echo Cancellation)
                const audioTrack = stream.getAudioTracks()[0];
                if (audioTrack) {
                    try {
                        // Chrome/WebRTC'nin gelişmiş yankı engelleme ayarları
                        await audioTrack.applyConstraints({
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true, // Echo'yu bastırmak için önemli!
                            // @ts-ignore - Standart olmayan constraintler
                            googEchoCancellation: true,
                            googAutoGainControl: true,
                            googNoiseSuppression: true,
                            googHighpassFilter: true, // İnsan sesi dışındaki frekansları kes
                            googAudioMirroring: false,
                            // @ts-ignore - Deneysel özellik (Hoparlörden kendi sesini duyma)
                            suppressLocalAudioPlayback: true,
                            // @ts-ignore - Kendi sesini (uygulama sesini) yayına katma
                            restrictOwnAudio: true,
                        });
                        console.log('✅ Ekran paylaşımı ses kısıtlamaları uygulandı (Google Constraints)');
                    } catch (err) {
                        console.warn('⚠️ Ses kısıtlamaları uygulanamadı:', err);
                    }
                }
            } else {
                // Tarayıcıda - getDisplayMedia kullan (sistem dialog açılır)
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                        frameRate: 60, // 60 FPS
                    },
                    audio: true, // Sistem sesi
                });
            }

            // Optimize for motion (spor/oyun)
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                // @ts-ignore
                if (videoTrack.contentHint !== undefined) {
                    // @ts-ignore
                    videoTrack.contentHint = 'motion';
                }
            }

            streamRef.current = stream;
            setScreenStream(stream);
            setIsSharing(true);
            setSelectedSourceId(sourceId);

            // Kullanıcı "Paylaşımı Durdur" dediğinde
            stream.getVideoTracks()[0].onended = () => {
                console.log('🛑 Ekran paylaşımı kullanıcı tarafından durduruldu');
                stopScreenShare();
            };

            console.log('✅ Ekran paylaşımı başladı!');
            return stream;
        } catch (error) {
            console.error('❌ Ekran paylaşımı hatası:', error);

            if (error instanceof DOMException) {
                switch (error.name) {
                    case 'NotAllowedError':
                        alert('Ekran paylaşımı izni reddedildi.');
                        break;
                    case 'NotFoundError':
                        alert('Paylaşılabilir ekran bulunamadı.');
                        break;
                    default:
                        alert(`Ekran paylaşımı hatası: ${error.message}`);
                }
            }

            return null;
        }
    }, []);

    /**
     * Ekran paylaşımını durdur
     */
    const stopScreenShare = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
                console.log('🛑 Ekran track durduruldu');
            });
            streamRef.current = null;
            setScreenStream(null);
            setIsSharing(false);
            setSelectedSourceId(null);
        }
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            stopScreenShare();
        };
    }, [stopScreenShare]);

    // Pencere değişikliği algılama - Paylaşılan kaynak hala mevcut mu kontrol et
    useEffect(() => {
        if (!isSharing || !selectedSourceId || !window.electronAPI) {
            return;
        }

        // Sadece pencere paylaşımlarını kontrol et (screen: değil window:)
        if (!selectedSourceId.startsWith('window:')) {
            return;
        }

        const checkSourceAvailability = async () => {
            try {
                const sources = await window.electronAPI!.getDesktopSources();
                const sourceExists = sources.some(s => s.id === selectedSourceId);

                if (!sourceExists) {
                    console.log('⚠️ Paylaşılan pencere kapandı, yayın durduruluyor...');
                    stopScreenShare();
                }
            } catch (error) {
                console.error('Kaynak kontrolü hatası:', error);
            }
        };

        // Her 2 saniyede bir kontrol et
        const intervalId = setInterval(checkSourceAvailability, 2000);

        return () => {
            clearInterval(intervalId);
        };
    }, [isSharing, selectedSourceId, stopScreenShare]);

    return {
        isSharing,
        screenStream,
        availableSources,
        selectedSourceId,
        getSources,
        startScreenShare,
        stopScreenShare,
    };
}
