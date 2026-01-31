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

const qualityLabels: Record<QualityPreset, string> = {
    low: '360p',
    medium: '720p',
    high: '1080p',
    ultra: '1080p 60fps',
};

export function QualitySelector({ currentQuality, onQualityChange }: QualitySelectorProps) {
    return (
        <div className="quality-selector">
            <label>Kalite:</label>
            <select
                value={currentQuality}
                onChange={(e) => onQualityChange(e.target.value as QualityPreset)}
            >
                {Object.entries(qualityLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                        {label}
                    </option>
                ))}
            </select>
            <div className="quality-info">
                {QUALITY_PRESETS[currentQuality].width}x{QUALITY_PRESETS[currentQuality].height} @ {QUALITY_PRESETS[currentQuality].frameRate}fps
            </div>
        </div>
    );
}
