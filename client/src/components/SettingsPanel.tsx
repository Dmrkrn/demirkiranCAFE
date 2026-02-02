import React, { useState, useEffect, useCallback } from 'react';
import './SettingsPanel.css';

interface SettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onMicChange?: (deviceId: string) => void;
    onSpeakerChange?: (deviceId: string) => void;
    onCameraChange?: (deviceId: string) => void;
}

interface MediaDeviceInfo {
    deviceId: string;
    label: string;
    kind: string;
}

export interface Keybinds {
    toggleMic: string;
    toggleSpeaker: string;
}

// localStorage'dan keybind'leri yükle
export const loadKeybinds = (): Keybinds => {
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

    // Turkish Q Layout Mappings (Approximate for display)
    if (code === 'Semicolon') return 'Ş';
    if (code === 'Quote') return 'İ';
    if (code === 'BracketLeft') return 'Ğ';
    if (code === 'BracketRight') return 'Ü';
    if (code === 'Comma') return 'Ö';
    if (code === 'Period') return 'Ç';
    if (code === 'Slash') return '.';
    if (code === 'Backslash') return ',';
    if (code === 'Backquote') return '"';
    if (code === 'Equal') return '-';
    if (code === 'Minus') return '*';

    return code;
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, onMicChange, onSpeakerChange, onCameraChange }) => {
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
        return saved ? Number(saved) : 10; // Default now 10
    });

    // Test & Visualization State
    const [testStream, setTestStream] = useState<MediaStream | null>(null);
    const [testVolume, setTestVolume] = useState(0);
    const [isTestSpeaking, setIsTestSpeaking] = useState(false);
    const [isLoopbackEnabled, setIsLoopbackEnabled] = useState(false);
    const analyserRef = React.useRef<AnalyserNode | null>(null);
    const animationRef = React.useRef<number | null>(null);
    const audioContextRef = React.useRef<AudioContext | null>(null);
    const loopbackAudioRef = React.useRef<HTMLAudioElement>(null);

    // Keybind state
    const [keybinds, setKeybinds] = useState<Keybinds>(loadKeybinds);
    const [recordingKey, setRecordingKey] = useState<'toggleMic' | 'toggleSpeaker' | null>(null);

    // Advanced Settings
    const [drmBypass, setDrmBypass] = useState(false);

    // Load initial settings
    useEffect(() => {
        const loadSettings = async () => {
            if (window.electronAPI?.getSettings) {
                const settings = await window.electronAPI.getSettings();
                if (settings && typeof settings.drmBypass === 'boolean') {
                    setDrmBypass(settings.drmBypass);
                }
            }
        };
        loadSettings();
    }, []);

    const toggleDrmBypass = (enabled: boolean) => {
        setDrmBypass(enabled);
        if (window.electronAPI?.saveSettings) {
            window.electronAPI.saveSettings({ drmBypass: enabled });
        }
    };

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

    // Cleanup function for test resources
    const stopTest = useCallback(() => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        if (testStream) {
            testStream.getTracks().forEach(t => t.stop());
            setTestStream(null);
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setIsLoopbackEnabled(false);
        setTestVolume(0);
        setIsTestSpeaking(false);
    }, [testStream]);

    // Stop test when closing
    useEffect(() => {
        if (!isOpen) {
            stopTest();
        }
    }, [isOpen, stopTest]);

    // Start Test Stream when Mic Selected and Panel Open
    useEffect(() => {
        if (!isOpen || !selectedMic) return;

        let active = true;

        const startMicTest = async () => {
            // Stop previous test if any
            if (testStream) {
                testStream.getTracks().forEach(t => t.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: { exact: selectedMic } }
                });

                if (!active) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                setTestStream(stream);

                const audioContext = new AudioContext();
                audioContextRef.current = audioContext;
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                analyserRef.current = analyser;

                const dataArray = new Uint8Array(analyser.frequencyBinCount);

                const analyze = () => {
                    if (!active) return;
                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
                    const normalizedVolume = Math.min(100, Math.round((average / 255) * 100));

                    setTestVolume(normalizedVolume);
                    setIsTestSpeaking(average > micThreshold);

                    animationRef.current = requestAnimationFrame(analyze);
                };
                analyze();

            } catch (err) {
                console.error("Test stream error:", err);
            }
        };

        startMicTest();

        return () => {
            active = false;
            // Don't stop here to allow smooth switching, handled by logic above or close effect
        };
    }, [isOpen, selectedMic, micThreshold]);

    useEffect(() => {
        const loadDevices = async () => {
            try {
                // Önce izin al (Ayrı ayrı dene, biri yoksa diğeri çalışsın)
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    // İzin alındı, hemen kapat
                    audioStream.getTracks().forEach(track => track.stop());
                } catch (e) {
                    console.warn('Mikrofon izni alınamadı veya cihaz yok:', e);
                }

                try {
                    const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                    // İzin alındı, hemen kapat
                    videoStream.getTracks().forEach(track => track.stop());
                } catch (e) {
                    console.warn('Kamera izni alınamadı veya cihaz yok:', e);
                }

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

                // İlk cihazları seç (Zaten seçili değilse)
                if (!selectedMic) {
                    const firstMic = devices.find(d => d.kind === 'audioinput');
                    if (firstMic) setSelectedMic(firstMic.deviceId);
                }
                if (!selectedSpeaker) {
                    const firstSpeaker = devices.find(d => d.kind === 'audiooutput');
                    if (firstSpeaker) setSelectedSpeaker(firstSpeaker.deviceId);
                }
                if (!selectedCamera) {
                    const firstCamera = devices.find(d => d.kind === 'videoinput');
                    if (firstCamera) setSelectedCamera(firstCamera.deviceId);
                }

            } catch (err) {
                console.error('Cihazlar yüklenemedi:', err);
            }
        };

        if (isOpen) {
            loadDevices();
        }
    }, [isOpen, selectedMic, selectedSpeaker, selectedCamera]);

    // Loopback için Hoparlör Seçimi ve srcObject ataması
    useEffect(() => {
        if (isLoopbackEnabled && loopbackAudioRef.current) {
            const audio = loopbackAudioRef.current;

            // Stream ata
            if (testStream && audio.srcObject !== testStream) {
                audio.srcObject = testStream;
            }

            // Hoparlör seçimi
            if (selectedSpeaker && (audio as any).setSinkId) {
                (audio as any).setSinkId(selectedSpeaker)
                    .then(() => console.log('🔊 Loopback hoparlörü ayarlandı:', selectedSpeaker))
                    .catch((e: any) => console.error('❌ Loopback hoparlörü ayarlanamadı:', e));
            }
        }
    }, [isLoopbackEnabled, selectedSpeaker, testStream]);

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
                            onChange={(e) => {
                                setSelectedMic(e.target.value);
                                onMicChange?.(e.target.value);
                            }}
                            className="settings-select"
                        >
                            {audioInputs.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                    {device.label}
                                </option>
                            ))}
                        </select>

                        {/* Mic Test Visualizer */}
                        <div className="mic-test-area" style={{ margin: '15px 0', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span style={{ fontSize: '0.9rem' }}>Mikrofon Testi</span>
                                <span style={{ fontSize: '0.8rem', color: isTestSpeaking ? '#4ade80' : '#888' }}>
                                    {isTestSpeaking ? 'Algılanıyor' : 'Sessiz'}
                                </span>
                            </div>
                            {/* Simple Visualizer Bar */}
                            <div style={{ height: '10px', width: '100%', background: '#333', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
                                <div
                                    style={{
                                        width: `${testVolume}%`,
                                        height: '100%',
                                        background: isTestSpeaking ? '#4ade80' : '#fbbf24',
                                        transition: 'width 0.1s ease',
                                    }}
                                />
                                {/* Threshold Indicator */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: `${micThreshold}%`,
                                        top: 0,
                                        bottom: 0,
                                        width: '2px',
                                        background: 'red',
                                        zIndex: 10
                                    }}
                                    title="Eşik Değeri"
                                />
                            </div>

                            <button
                                onClick={() => setIsLoopbackEnabled(!isLoopbackEnabled)}
                                style={{
                                    marginTop: '10px',
                                    padding: '8px 12px',
                                    fontSize: '0.8rem',
                                    background: isLoopbackEnabled ? '#dc2626' : '#2563eb',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                {isLoopbackEnabled ? 'Testi Durdur' : 'Sesimi Duy (Loopback Test)'}
                            </button>
                            {/* Loopback Audio Element */}
                            {testStream && isLoopbackEnabled && (
                                <audio
                                    ref={loopbackAudioRef}
                                    autoPlay
                                    playsInline
                                    style={{ display: 'none' }}
                                />
                            )}
                        </div>

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
                            <span title="Bu seviyenin altındaki sesler iletilmez">Mikrofon Eşik Değeri (VAD)</span>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                value={micThreshold}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setMicThreshold(val);
                                    localStorage.setItem('demirkiran-mic-threshold', String(val));
                                }}
                                className="volume-slider threshold-slider"
                            />
                            <span className="volume-value">{micThreshold}</span>
                        </div>
                        <p className="settings-hint">Kırmızı çizgi eşik değeridir. Ses çubuğu bu çizgiyi geçtiğinde sesiniz karşıya gider.</p>
                    </div>

                    {/* Ses Çıkışı */}
                    <div className="settings-section">
                        <h3>🔊 Hoparlör</h3>
                        <select
                            value={selectedSpeaker}
                            onChange={(e) => {
                                setSelectedSpeaker(e.target.value);
                                onSpeakerChange?.(e.target.value);
                            }}
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
                            onChange={(e) => {
                                setSelectedCamera(e.target.value);
                                onCameraChange?.(e.target.value);
                            }}
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

                    {/* Gelişmiş Ayarlar */}
                    <div className="settings-section">
                        <h3>⚙️ Gelişmiş Ayarlar</h3>
                        <div className="settings-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontWeight: 600 }}>DRM Bypass Modu</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    TOD, Netflix gibi platformlardaki siyah ekran sorununu aşmak için donanım hızlandırmayı kapatır. (Yeniden başlatma gerektirir)
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={drmBypass}
                                onChange={(e) => toggleDrmBypass(e.target.checked)}
                                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                            />
                        </div>
                    </div>

                    <div className="settings-footer-info" style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.8rem', opacity: 0.5 }}>
                        DemirkıranCAFE v1.0.6 • Made with ❤️
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

