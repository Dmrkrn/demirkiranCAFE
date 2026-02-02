/**
 * useQualitySettings Hook
 * ========================
 * 
 * Video kalite ayarları yönetimi.
 * 
 * Simulcast Nedir?
 * ----------------
 * Aynı video'yu farklı kalitelerde (düşük, orta, yüksek) aynı anda
 * sunucuya gönderme tekniği.
 * 
 * Sunucu, alıcının bant genişliğine göre uygun kaliteyi seçer.
 * 
 * Örnek:
 * - Gönderen: 1080p + 720p + 360p gönderir
 * - Alıcı A (iyi bağlantı): 1080p alır
 * - Alıcı B (zayıf bağlantı): 360p alır
 * 
 * Avantajları:
 * - Dinamik adaptasyon
 * - Düşük latency (transcoding yok)
 * - Her alıcıya en iyi kalite
 */

import { useState, useCallback } from 'react';
import { types } from 'mediasoup-client';

// Kalite profilleri
export const QUALITY_PRESETS = {
    hd60: {
        width: 1280,
        height: 720,
        frameRate: 60,
        maxBitrate: 2500000,  // 2.5 Mbps
    },
    fhd60: {
        width: 1920,
        height: 1080,
        frameRate: 60,
        maxBitrate: 5000000,  // 5 Mbps
    },
} as const;

export type QualityPreset = keyof typeof QUALITY_PRESETS;

// Simulcast katmanları (Kamera için - şimdilik basitleştirildi)
export const SIMULCAST_ENCODINGS: types.RtpEncodingParameters[] = [
    {
        rid: 'r0',
        maxBitrate: 2500000,
        scalabilityMode: 'S1T3',
    },
];

// Ekran paylaşımı için özel encodings (maç/oyun için optimize - Yüksek Bitrate)
export const SCREEN_SHARE_ENCODINGS: types.RtpEncodingParameters[] = [
    {
        maxBitrate: 6000000,  // 6 Mbps (1080p 60fps spor/oyun için gerekli)
        // scaleResolutionDownBy yok - tam çözünürlük
    },
];

interface UseQualitySettingsReturn {
    currentQuality: QualityPreset;
    setQuality: (preset: QualityPreset) => void;
    getConstraints: () => MediaStreamConstraints;
    getSimulcastEncodings: () => types.RtpEncodingParameters[];
    getScreenShareEncodings: () => types.RtpEncodingParameters[];
    estimatedBitrate: number;
}

export function useQualitySettings(): UseQualitySettingsReturn {
    const [currentQuality, setCurrentQuality] = useState<QualityPreset>('hd60');

    /**
     * Kalite presetini ayarla
     */
    const setQuality = useCallback((preset: QualityPreset) => {
        setCurrentQuality(preset);
        console.log(`📊 Kalite ayarlandı: ${preset}`);
    }, []);

    /**
     * Mevcut kaliteye göre MediaStream kısıtlamalarını al
     */
    const getConstraints = useCallback((): MediaStreamConstraints => {
        const preset = QUALITY_PRESETS[currentQuality];

        return {
            video: {
                width: { ideal: preset.width },
                height: { ideal: preset.height },
                frameRate: { ideal: preset.frameRate },
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                // Daha yüksek kalite ses
                sampleRate: 48000,
                channelCount: 1,  // Mono (daha az bant genişliği)
            },
        };
    }, [currentQuality]);

    /**
     * Simulcast encodings döndür
     */
    const getSimulcastEncodings = useCallback((): types.RtpEncodingParameters[] => {
        return SIMULCAST_ENCODINGS;
    }, []);

    /**
     * Ekran paylaşımı encodings döndür
     */
    const getScreenShareEncodings = useCallback((): types.RtpEncodingParameters[] => {
        return SCREEN_SHARE_ENCODINGS;
    }, []);

    /**
     * Tahmini bant genişliği kullanımı
     */
    const estimatedBitrate = QUALITY_PRESETS[currentQuality].maxBitrate;

    return {
        currentQuality,
        setQuality,
        getConstraints,
        getSimulcastEncodings,
        getScreenShareEncodings,
        estimatedBitrate,
    };
}
