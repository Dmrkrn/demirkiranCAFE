/**
 * useVoiceActivity Hook
 * =======================
 * 
 * Voice Activity Detection (VAD) - Ses Aktivite Algılama
 * 
 * Bu hook, kullanıcının konuşup konuşmadığını algılar.
 * 
 * Nasıl Çalışır?
 * --------------
 * 1. AudioContext oluştur (Web Audio API)
 * 2. Audio stream'i AnalyserNode'a bağla
 * 3. Her frame'de ses seviyesini ölç
 * 4. Eşik değerin üstündeyse "konuşuyor" olarak işaretle
 * 
 * Neden Önemli?
 * -------------
 * - UI'da konuşan kişiyi vurgulama
 * - Push-to-talk özelliği
 * - Otomatik mikrofon kontrolü
 * - Daha düşük bant genişliği (sessizken video kalitesini düşürme)
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceActivityProps {
    stream: MediaStream | null;
    threshold?: number;  // Ses eşiği (0-255 arası, varsayılan: 30)
    smoothingTimeConstant?: number;  // Yumuşatma (0-1 arası, varsayılan: 0.8)
}

interface UseVoiceActivityReturn {
    isSpeaking: boolean;
    volume: number;  // 0-100 arası ses seviyesi
    startDetection: () => void;
    stopDetection: () => void;
}

export function useVoiceActivity({
    stream,
    threshold = 30,
    smoothingTimeConstant = 0.8,
}: UseVoiceActivityProps): UseVoiceActivityReturn {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [volume, setVolume] = useState(0);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const isRunningRef = useRef(false);

    /**
     * Ses seviyesini analiz et
     */
    const analyzeVolume = useCallback(() => {
        if (!analyserRef.current || !isRunningRef.current) return;

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Ortalama ses seviyesini hesapla
        const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

        // 0-100 arasına normalize et
        const normalizedVolume = Math.min(100, Math.round((average / 255) * 100));
        setVolume(normalizedVolume);

        // Eşik kontrolü
        setIsSpeaking(average > threshold);

        // Sonraki frame'i planla
        animationFrameRef.current = requestAnimationFrame(analyzeVolume);
    }, [threshold]);

    /**
     * VAD'ı başlat
     */
    const startDetection = useCallback(() => {
        if (!stream || isRunningRef.current) return;

        try {
            // AudioContext oluştur
            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;

            // Analyser oluştur
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;  // Daha hızlı analiz için küçük FFT
            analyser.smoothingTimeConstant = smoothingTimeConstant;
            analyserRef.current = analyser;

            // Stream'i AudioContext'e bağla
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            sourceRef.current = source;

            // Analizi başlat
            isRunningRef.current = true;
            analyzeVolume();

            console.log('🎤 VAD başlatıldı');
        } catch (error) {
            console.error('❌ VAD başlatılamadı:', error);
        }
    }, [stream, smoothingTimeConstant, analyzeVolume]);

    /**
     * VAD'ı durdur
     */
    const stopDetection = useCallback(() => {
        isRunningRef.current = false;

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        analyserRef.current = null;
        setIsSpeaking(false);
        setVolume(0);

        console.log('🛑 VAD durduruldu');
    }, []);

    // Stream değiştiğinde yeniden başlat
    useEffect(() => {
        if (stream) {
            startDetection();
        }
        return () => {
            stopDetection();
        };
    }, [stream, startDetection, stopDetection]);

    return {
        isSpeaking,
        volume,
        startDetection,
        stopDetection,
    };
}
