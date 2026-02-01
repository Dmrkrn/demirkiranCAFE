import { useEffect, useState, useRef } from 'react';

export function useAudioLevel(stream: MediaStream | null, threshold = 0.05) {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);

    useEffect(() => {
        if (!stream) {
            setIsSpeaking(false);
            return;
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (!audioTrack || !audioTrack.enabled) {
            setIsSpeaking(false);
            return;
        }

        // AudioContext oluştur (veya window üzerinde varsa kullan şimdilik hooks içinde yönetmek daha güvenli)
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;

        let source: MediaStreamAudioSourceNode | null = null;
        try {
            source = ctx.createMediaStreamSource(stream);
            source.connect(analyser);
        } catch (err) {
            console.error("Audio Source Error:", err);
            return;
        }

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        let animationId: number;

        const update = () => {
            if (!analyser) return;
            analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            // Sadece belirli frekans aralığını da alabiliriz ama ortalama da yeterli
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }

            const average = sum / bufferLength;
            // 255 üzerinden normalize et
            const normalized = average / 255;

            // Threshold kontrolü (Hysteresis eklenebilir titremeyi azaltmak için)
            // Konuşuyorsa true döndür
            setIsSpeaking(normalized > threshold);

            animationId = requestAnimationFrame(update);
        };

        update();

        return () => {
            cancelAnimationFrame(animationId);
            if (source) source.disconnect();
            if (ctx.state !== 'closed') ctx.close();
        };
    }, [stream, threshold]);

    return isSpeaking;
}
