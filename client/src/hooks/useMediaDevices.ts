/**
 * useMediaDevices Hook
 * ====================
 * 
 * Bu hook, kullanıcının kamera ve mikrofonuna erişimi yönetir.
 * 
 * navigator.mediaDevices.getUserMedia() API'sini kullanarak
 * medya cihazlarına erişim sağlar.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface MediaDeviceInfo {
    deviceId: string;
    label: string;
    kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

interface UseMediaDevicesReturn {
    // State
    localStream: MediaStream | null;
    videoEnabled: boolean;
    audioEnabled: boolean;
    devices: {
        cameras: MediaDeviceInfo[];
        microphones: MediaDeviceInfo[];
        speakers: MediaDeviceInfo[];
    };

    // Metodlar
    startMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream | null>;
    stopMedia: () => void;
    toggleVideo: () => void;
    toggleAudio: () => void;
    getDevices: () => Promise<void>;
    changeAudioInput: (deviceId: string) => Promise<void>;
    changeVideoInput: (deviceId: string) => Promise<void>;
}

export function useMediaDevices(): UseMediaDevicesReturn {
    const streamRef = useRef<MediaStream | null>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [videoEnabled, setVideoEnabled] = useState(false);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [devices, setDevices] = useState<{
        cameras: MediaDeviceInfo[];
        microphones: MediaDeviceInfo[];
        speakers: MediaDeviceInfo[];
    }>({
        cameras: [],
        microphones: [],
        speakers: [],
    });

    /**
     * Mevcut cihazları listele
     */
    const getDevices = useCallback(async () => {
        try {
            // Önce izin almak için geçici bir stream oluştur (Ayrı ayrı dene)
            // (izin verilmeden cihaz isimleri gizli kalır)

            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioStream.getTracks().forEach(track => track.stop());
            } catch (e) {
                console.warn('Mikrofon izni alınamadı (useMediaDevices):', e);
            }

            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                videoStream.getTracks().forEach(track => track.stop());
            } catch (e) {
                console.warn('Kamera izni alınamadı (useMediaDevices):', e);
            }

            // Şimdi cihazları listele
            const deviceList = await navigator.mediaDevices.enumerateDevices();

            const cameras: MediaDeviceInfo[] = [];
            const microphones: MediaDeviceInfo[] = [];
            const speakers: MediaDeviceInfo[] = [];

            deviceList.forEach(device => {
                const info: MediaDeviceInfo = {
                    deviceId: device.deviceId,
                    label: device.label || `${device.kind} ${device.deviceId.slice(0, 5)}`,
                    kind: device.kind as MediaDeviceInfo['kind'],
                };

                switch (device.kind) {
                    case 'videoinput':
                        cameras.push(info);
                        break;
                    case 'audioinput':
                        microphones.push(info);
                        break;
                    case 'audiooutput':
                        speakers.push(info);
                        break;
                }
            });

            setDevices({ cameras, microphones, speakers });
            console.log('📷 Kameralar:', cameras);
            console.log('🎤 Mikrofonlar:', microphones);
            console.log('🔊 Hoparlörler:', speakers);
        } catch (error) {
            console.error('❌ Cihazlar listelenemedi:', error);
        }
    }, []);

    /**
     * Kamera ve mikrofonu başlat
     */
    const startMedia = useCallback(async (
        constraints: MediaStreamConstraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,          // Yüksek kalite ses
                channelCount: 2,             // Stereo
            },
        }
    ): Promise<MediaStream | null> => {
        try {
            console.log('📹 Medya başlatılıyor...');

            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            streamRef.current = stream;
            setLocalStream(stream);

            // Video track var mı?
            const videoTrack = stream.getVideoTracks()[0];
            setVideoEnabled(videoTrack?.enabled ?? false);

            // Audio track var mı?
            const audioTrack = stream.getAudioTracks()[0];
            setAudioEnabled(audioTrack?.enabled ?? false);

            console.log('✅ Medya başlatıldı!');
            console.log('📹 Video:', videoTrack?.label);
            console.log('🎤 Ses:', audioTrack?.label);

            return stream;
        } catch (error) {
            console.error('❌ Medya erişim hatası:', error);

            // Kullanıcıya anlaşılır hata mesajı
            if (error instanceof DOMException) {
                switch (error.name) {
                    case 'NotAllowedError':
                        alert('Kamera/mikrofon izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.');
                        break;
                    case 'NotFoundError':
                        alert('Kamera veya mikrofon bulunamadı.');
                        break;
                    case 'OverconstrainedError':
                        alert('İstenen kamera/mikrofon ayarları desteklenmiyor.');
                        break;
                    default:
                        alert(`Medya hatası: ${error.message}`);
                }
            }

            return null;
        }
    }, []);

    /**
     * Medyayı durdur
     */
    const stopMedia = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
                track.stop();
                console.log(`🛑 Track durduruldu: ${track.kind}`);
            });
            streamRef.current = null;
            setLocalStream(null);
            setVideoEnabled(false);
            setAudioEnabled(false);
        }
    }, []);

    /**
     * Videoyu aç/kapat
     */
    const toggleVideo = useCallback(() => {
        if (streamRef.current) {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setVideoEnabled(videoTrack.enabled);
                console.log(`📹 Video: ${videoTrack.enabled ? 'açık' : 'kapalı'}`);
            }
        }
    }, []);

    /**
     * Sesi aç/kapat
     */
    const toggleAudio = useCallback(() => {
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setAudioEnabled(audioTrack.enabled);
                console.log(`🎤 Ses: ${audioTrack.enabled ? 'açık' : 'kapalı'}`);
            }
        }
    }, []);

    // Cleanup: Component unmount olduğunda medyayı durdur
    useEffect(() => {
        return () => {
            stopMedia();
        };
    }, [stopMedia]);

    return {
        localStream,
        videoEnabled,
        audioEnabled,
        devices,
        startMedia,
        stopMedia,
        toggleVideo,
        toggleAudio,
        getDevices,
        changeAudioInput: async (deviceId: string) => {
            if (!localStream) return;
            // Stop current audio track
            localStream.getAudioTracks().forEach(t => t.stop());

            // Start new with specific device
            await startMedia({
                audio: { deviceId: { exact: deviceId } },
                video: videoEnabled // Keep video state
            });
        },
        changeVideoInput: async (deviceId: string) => {
            if (!localStream) return;
            // Stop current video track
            localStream.getVideoTracks().forEach(t => t.stop());

            // Start new with specific device
            await startMedia({
                audio: audioEnabled, // Keep audio state
                video: { deviceId: { exact: deviceId } }
            });
        }
    };
}
