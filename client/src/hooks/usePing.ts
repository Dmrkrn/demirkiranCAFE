import { useState, useEffect, useRef, useCallback } from 'react';

interface UsePingReturn {
    ping: number;
    pingStatus: 'good' | 'medium' | 'bad';
}

export function usePing(serverUrl: string = 'http://157.230.125.137:3000'): UsePingReturn {
    const [ping, setPing] = useState<number>(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const measurePing = useCallback(async () => {
        const startTime = performance.now();
        try {
            // Simple fetch to measure latency
            await fetch(serverUrl, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store'
            });
            const endTime = performance.now();
            const latency = Math.round(endTime - startTime);
            setPing(latency);
        } catch {
            setPing(-1); // Connection error
        }
    }, [serverUrl]);

    useEffect(() => {
        // İlk ölçüm
        measurePing();

        // Her 5 saniyede bir ölç
        intervalRef.current = setInterval(measurePing, 5000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [measurePing]);

    const pingStatus: 'good' | 'medium' | 'bad' =
        ping < 0 ? 'bad' :
            ping < 100 ? 'good' :
                ping < 200 ? 'medium' : 'bad';

    return { ping, pingStatus };
}
