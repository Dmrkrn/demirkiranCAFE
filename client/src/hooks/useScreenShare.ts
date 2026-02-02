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
    startScreenShare: (sourceId: string) => Promise<MediaStream | null>;
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
     */
    const startScreenShare = useCallback(async (sourceId: string): Promise<MediaStream | null> => {
        try {
            console.log('🖥️ Ekran paylaşımı başlatılıyor...');

            let stream: MediaStream;

            if (window.electronAPI && sourceId) {
                // Electron içinde - chromeMediaSource kullan
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: sourceId,
                        }
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
