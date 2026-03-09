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
    threshold = 10,              // Daha hassas (Fısıltıyı bile algılar)
    smoothingTimeConstant = 0.02, // Çok daha hızlı tepki (Kelimelerin başını yutmaması için)
}: UseVoiceActivityProps): UseVoiceActivityReturn {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [volume, setVolume] = useState(0);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /**
     * VAD'ı başlat
     */
    const startDetection = useCallback(() => {
        if (!stream || intervalRef.current) return;

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

            // Analiz fonksiyonu - closure'da analyser'ı yakala
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let lastSpeechTime = 0;
            const HOLD_TIME = 500; // 500ms hold time

            const analyze = () => {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
                const normalizedVolume = Math.min(100, Math.round((average / 255) * 100));
                setVolume(normalizedVolume);

                const now = Date.now();
                // Eşik karşılaştırmasını normalize edilmiş birimle (0-100) yap ki UI ayarıyla tam eşleşsin
                if (normalizedVolume > threshold) {
                    setIsSpeaking(true);
                    lastSpeechTime = now;
                } else {
                    // Sessizlik süresi HOLD_TIME'ı geçtiyse kapat
                    if (now - lastSpeechTime > HOLD_TIME) {
                        setIsSpeaking(false);
                    }
                }
            };

            // Analizi setInterval ile başlat
            // 20ms = 50 fps (Daha sık kontrol, daha hızlı açılış)
            intervalRef.current = setInterval(analyze, 20);

            console.log('🎤 VAD başlatıldı');
        } catch (error) {
            console.error('❌ VAD başlatılamadı:', error);
        }
    }, [stream, smoothingTimeConstant, threshold]);

    /**
     * VAD'ı durdur
     */
    const stopDetection = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }

        if (audioContextRef.current) {
            const ctx = audioContextRef.current;
            if (ctx.state !== 'closed') {
                ctx.close().catch(e => console.warn('VAD AudioContext kapanırken hata (önemsiz):', e));
            }
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
