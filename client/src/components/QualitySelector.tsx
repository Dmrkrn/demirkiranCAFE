/**
 * QualitySelector Bileşeni
 * =========================
 * 
 * Video kalitesi seçici dropdown.
 */

import { QualityPreset, QUALITY_PRESETS } from '../hooks/useQualitySettings';
import './QualitySelector.css';

interface QualitySelectorProps {
    currentQuality: QualityPreset;
    onQualityChange: (quality: QualityPreset) => void;
}

const qualityLabels: Record<QualityPreset, { label: string; icon: string }> = {
    low: { label: '360p', icon: '📶' },
    medium: { label: '720p', icon: '📶📶' },
    high: { label: '1080p', icon: '📶📶📶' },
    ultra: { label: '1080p 60fps', icon: '🔥' },
};

export function QualitySelector({ currentQuality, onQualityChange }: QualitySelectorProps) {
    return (
        <div className="quality-selector">
            <label>Kalite:</label>
            <select
                value={currentQuality}
                onChange={(e) => onQualityChange(e.target.value as QualityPreset)}
            >
                {Object.entries(qualityLabels).map(([key, { label, icon }]) => (
                    <option key={key} value={key}>
                        {icon} {label}
                    </option>
                ))}
            </select>
            <div className="quality-info">
                {QUALITY_PRESETS[currentQuality].width}x{QUALITY_PRESETS[currentQuality].height} @ {QUALITY_PRESETS[currentQuality].frameRate}fps
            </div>
        </div>
    );
}
