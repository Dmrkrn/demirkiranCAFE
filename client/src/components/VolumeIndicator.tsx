/**
 * VolumeIndicator Bileşeni
 * =========================
 * 
 * Ses seviyesi göstergesi (mikrofon ikonu yanında)
 * VAD durumunu görsel olarak gösterir.
 */

import './VolumeIndicator.css';

interface VolumeIndicatorProps {
    volume: number;  // 0-100
    isSpeaking: boolean;
}

export function VolumeIndicator({ volume, isSpeaking }: VolumeIndicatorProps) {
    // 5 çubuklu gösterge
    const bars = 5;
    const activeBarCount = Math.ceil((volume / 100) * bars);

    return (
        <div className={`volume-indicator ${isSpeaking ? 'speaking' : ''}`}>
            {Array.from({ length: bars }).map((_, i) => (
                <div
                    key={i}
                    className={`volume-bar ${i < activeBarCount ? 'active' : ''}`}
                    style={{ height: `${(i + 1) * 4}px` }}
                />
            ))}
        </div>
    );
}
