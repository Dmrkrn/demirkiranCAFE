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
    low: {
        width: 640,
        height: 360,
        frameRate: 15,
        maxBitrate: 150000,  // 150 kbps
    },
    medium: {
        width: 1280,
        height: 720,
        frameRate: 30,
        maxBitrate: 500000,  // 500 kbps
    },
    high: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        maxBitrate: 1500000,  // 1.5 Mbps
    },
    ultra: {
        width: 1920,
        height: 1080,
        frameRate: 60,
        maxBitrate: 3000000,  // 3 Mbps
    },
} as const;

export type QualityPreset = keyof typeof QUALITY_PRESETS;

// Simulcast katmanları
export const SIMULCAST_ENCODINGS: types.RtpEncodingParameters[] = [
    {
        rid: 'r0',
        maxBitrate: 100000,
        scaleResolutionDownBy: 4,  // 1/4 çözünürlük (örn: 1080p -> 270p)
        scalabilityMode: 'S1T3',
    },
    {
        rid: 'r1',
        maxBitrate: 300000,
        scaleResolutionDownBy: 2,  // 1/2 çözünürlük (örn: 1080p -> 540p)
        scalabilityMode: 'S1T3',
    },
    {
        rid: 'r2',
        maxBitrate: 900000,
        // scaleResolutionDownBy: 1 (tam çözünürlük)
        scalabilityMode: 'S1T3',
    },
];

// Ekran paylaşımı için özel encodings (text/kod için optimize)
export const SCREEN_SHARE_ENCODINGS: types.RtpEncodingParameters[] = [
    {
        maxBitrate: 1500000,  // 1.5 Mbps
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
    const [currentQuality, setCurrentQuality] = useState<QualityPreset>('medium');

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
