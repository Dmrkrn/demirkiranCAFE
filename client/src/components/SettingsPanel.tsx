import React, { useState, useEffect, useCallback } from 'react';
import './SettingsPanel.css';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

interface MediaDeviceInfo {
    deviceId: string;
    label: string;
    kind: string;
}

interface Keybinds {
    toggleMic: string;
    toggleSpeaker: string;
}

// localStorage'dan keybind'leri yükle
const loadKeybinds = (): Keybinds => {
    try {
        const saved = localStorage.getItem('demirkiran-keybinds');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error('Keybind yüklenemedi:', e);
    }
    return { toggleMic: 'KeyM', toggleSpeaker: 'KeyD' };
};

// Keybind'leri kaydet
const saveKeybinds = (keybinds: Keybinds) => {
    localStorage.setItem('demirkiran-keybinds', JSON.stringify(keybinds));
};

// Tuş kodunu okunabilir formata çevir
const formatKeyCode = (code: string): string => {
    if (code.startsWith('Key')) return code.replace('Key', '');
    if (code.startsWith('Digit')) return code.replace('Digit', '');
    if (code === 'Space') return 'Space';
    if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
    if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
    if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
    return code;
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
    const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
    const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
    const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);

    const [selectedMic, setSelectedMic] = useState<string>('');
    const [selectedSpeaker, setSelectedSpeaker] = useState<string>('');
    const [selectedCamera, setSelectedCamera] = useState<string>('');

    const [micVolume, setMicVolume] = useState<number>(100);
    const [speakerVolume, setSpeakerVolume] = useState<number>(100);
    const [micThreshold, setMicThreshold] = useState<number>(() => {
        const saved = localStorage.getItem('demirkiran-mic-threshold');
        return saved ? Number(saved) : 20;
    });

    // Keybind state
    const [keybinds, setKeybinds] = useState<Keybinds>(loadKeybinds);
    const [recordingKey, setRecordingKey] = useState<'toggleMic' | 'toggleSpeaker' | null>(null);

    // Keybind kaydetme
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!recordingKey) return;

        e.preventDefault();
        e.stopPropagation();

        const newKeybinds = { ...keybinds, [recordingKey]: e.code };
        setKeybinds(newKeybinds);
        saveKeybinds(newKeybinds);
        setRecordingKey(null);
    }, [recordingKey, keybinds]);

    useEffect(() => {
        if (recordingKey) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [recordingKey, handleKeyDown]);

    useEffect(() => {
        const loadDevices = async () => {
            try {
                // Önce izin al
                await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

                const devices = await navigator.mediaDevices.enumerateDevices();

                setAudioInputs(devices.filter(d => d.kind === 'audioinput').map(d => ({
                    deviceId: d.deviceId,
                    label: d.label || `Mikrofon ${d.deviceId.slice(0, 5)}`,
                    kind: d.kind
                })));

                setAudioOutputs(devices.filter(d => d.kind === 'audiooutput').map(d => ({
                    deviceId: d.deviceId,
                    label: d.label || `Hoparlör ${d.deviceId.slice(0, 5)}`,
                    kind: d.kind
                })));

                setVideoInputs(devices.filter(d => d.kind === 'videoinput').map(d => ({
                    deviceId: d.deviceId,
                    label: d.label || `Kamera ${d.deviceId.slice(0, 5)}`,
                    kind: d.kind
                })));

                // İlk cihazları seç
                const firstMic = devices.find(d => d.kind === 'audioinput');
                const firstSpeaker = devices.find(d => d.kind === 'audiooutput');
                const firstCamera = devices.find(d => d.kind === 'videoinput');

                if (firstMic) setSelectedMic(firstMic.deviceId);
                if (firstSpeaker) setSelectedSpeaker(firstSpeaker.deviceId);
                if (firstCamera) setSelectedCamera(firstCamera.deviceId);

            } catch (err) {
                console.error('Cihazlar yüklenemedi:', err);
            }
        };

        if (isOpen) {
            loadDevices();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>Ayarlar</h2>
                    <button className="close-btn" onClick={onClose}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                    </button>
                </div>

                <div className="settings-content">
                    {/* Ses Girişi */}
                    <div className="settings-section">
                        <h3>🎤 Mikrofon</h3>
                        <select
                            value={selectedMic}
                            onChange={(e) => setSelectedMic(e.target.value)}
                            className="settings-select"
                        >
                            {audioInputs.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label}
                                </option>
                            ))}
                        </select>
                        <div className="volume-control">
                            <span>Giriş Ses Seviyesi</span>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={micVolume}
                                onChange={(e) => setMicVolume(Number(e.target.value))}
                                className="volume-slider"
                            />
                            <span className="volume-value">{micVolume}%</span>
                        </div>
                        <div className="volume-control">
                            <span>Mikrofon Eşik Değeri</span>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={micThreshold}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setMicThreshold(val);
                                    localStorage.setItem('demirkiran-mic-threshold', String(val));
                                }}
                                className="volume-slider threshold-slider"
                            />
                            <span className="volume-value">{micThreshold}%</span>
                        </div>
                        <p className="settings-hint">Eşik değerinin altındaki sesler iletilmez (gürültü azaltma)</p>
                    </div>

                    {/* Ses Çıkışı */}
                    <div className="settings-section">
                        <h3>🔊 Hoparlör</h3>
                        <select
                            value={selectedSpeaker}
                            onChange={(e) => setSelectedSpeaker(e.target.value)}
                            className="settings-select"
                        >
                            {audioOutputs.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label}
                                </option>
                            ))}
                        </select>
                        <div className="volume-control">
                            <span>Çıkış Ses Seviyesi</span>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={speakerVolume}
                                onChange={(e) => setSpeakerVolume(Number(e.target.value))}
                                className="volume-slider"
                            />
                            <span className="volume-value">{speakerVolume}%</span>
                        </div>
                    </div>

                    {/* Kamera */}
                    <div className="settings-section">
                        <h3>📹 Kamera</h3>
                        <select
                            value={selectedCamera}
                            onChange={(e) => setSelectedCamera(e.target.value)}
                            className="settings-select"
                        >
                            {videoInputs.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Kısayol Tuşları */}
                    <div className="settings-section">
                        <h3>⌨️ Kısayol Tuşları</h3>

                        <div className="keybind-row">
                            <span className="keybind-label">Mikrofonu Aç/Kapat</span>
                            <button
                                className={`keybind-btn ${recordingKey === 'toggleMic' ? 'recording' : ''}`}
                                onClick={() => setRecordingKey('toggleMic')}
                            >
                                {recordingKey === 'toggleMic'
                                    ? 'Bir tuşa bas...'
                                    : formatKeyCode(keybinds.toggleMic)}
                            </button>
                        </div>

                        <div className="keybind-row">
                            <span className="keybind-label">Sesi Kapat/Aç (Deaf)</span>
                            <button
                                className={`keybind-btn ${recordingKey === 'toggleSpeaker' ? 'recording' : ''}`}
                                onClick={() => setRecordingKey('toggleSpeaker')}
                            >
                                {recordingKey === 'toggleSpeaker'
                                    ? 'Bir tuşa bas...'
                                    : formatKeyCode(keybinds.toggleSpeaker)}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="settings-footer">
                    <button className="save-btn" onClick={onClose}>
                        Kaydet ve Kapat
                    </button>
                </div>
            </div>
        </div>
    );
};

// Export keybinds loader for use in App
export { loadKeybinds, type Keybinds };
