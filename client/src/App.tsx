import { useRef, useEffect, useState, useCallback } from 'react';
import logo from './assets/logo.png';
import { useSocket, useMediasoup, useMediaDevices, useScreenShare, useVoiceActivity, useQualitySettings, usePing } from './hooks';
import { useAudioLevel } from './hooks/useAudioLevel';
import { ScreenSharePicker } from './components/ScreenSharePicker';
import { QualitySelector } from './components/QualitySelector';
import { Avatar } from './components/Avatar';
import { TitleBar } from './components/TitleBar';
import { PingMeter } from './components/PingMeter';
import { SettingsPanel, loadKeybinds } from './components/SettingsPanel';
import UpdateNotifier from './components/UpdateNotifier';
import { playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound } from './utils/sounds';
import { MicIcon, MicOffIcon, HeadphonessIcon, HeadphonesOffIcon, VideoIcon } from './components/Icons';
import { mapDomCodeToUiohook } from './utils/keymapping';
import './styles/App.css';

/**
 * Ana Uygulama Bileşeni (Global Keybinds Eklendi)
 * ================================================
 * 
 * 1. Socket.io ile sunucuya bağlan
 * 2. mediasoup Device'ı yükle
 * 3. Transport'ları oluştur
 * 4. Kamera/mikrofon produce et
 * 5. Diğer kullanıcıları consume et
 * 6. Ekran paylaşımı (YENİ!)
 */
function App() {
    const [username, setUsername] = useState('');
    const [roomPassword, setRoomPassword] = useState('');
    const [selectedRoom, setSelectedRoom] = useState<'main' | 'dev'>('main'); // Oda seçimi
    const [joiningStatus, setJoiningStatus] = useState<'idle' | 'connecting' | 'joined'>('idle');
    const isJoined = joiningStatus === 'joined'; // Derived state for backward compatibility
    const [showSettings, setShowSettings] = useState(false);
    const [showScreenPicker, setShowScreenPicker] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false); // Restore isDeafened
    const [chatMessages, setChatMessages] = useState<Array<{
        id: string;
        senderId: string;
        senderName: string;
        message: string;
        timestamp: string;
    }>>([]);

    // Kullanıcı Ses Seviyeleri (0-100)
    const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});

    // Oda Değiştirme Fonksiyonu
    const handleSwitchRoom = async (targetRoom: 'main' | 'dev') => {
        // Zaten o odadaysak ve bağlıysak işlem yapma
        if (targetRoom === selectedRoom && joiningStatus === 'joined') return;

        console.log(`🔄 Odaya geçiş hazırlanıyor: ${targetRoom}`);

        // 1. Hedef odayı seç
        setSelectedRoom(targetRoom);

        // 2. Mevcut bağlantıyı kopar ve Login ekranına dön
        if (joiningStatus !== 'idle') {
            closeAll();
            stopMedia();
            stopScreenShare();
            setJoiningStatus('idle');
        }

        // 3. Şifre alanını temizle
        setRoomPassword('');
    };



    // Video elementleri için ref
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const screenVideoRef = useRef<HTMLVideoElement>(null);

    // Custom Hooks
    const { isConnected, clientId, request, emit, onChatMessage, peers, fetchPeers, socket, sendStatusUpdate } = useSocket();
    const {
        localStream,
        videoEnabled,
        audioEnabled,
        startMedia,
        stopMedia,
        toggleVideo,
        toggleAudio
    } = useMediaDevices();

    const {
        consumers,
        loadDevice,
        createTransports,
        produceVideo,
        produceAudio,
        consumeAll,
        consumeProducer,
        closeProducer,
        closeAll,
    } = useMediasoup({ request });

    const {
        isSharing,
        screenStream,
        availableSources,
        getSources,
        startScreenShare,
        stopScreenShare,
    } = useScreenShare();

    // VAD (Voice Activity Detection)
    const { isSpeaking } = useVoiceActivity({ stream: localStream });

    // Kalite Ayırları
    const { currentQuality, setQuality } = useQualitySettings();

    // Ping Ölçer
    const { ping, pingStatus } = usePing();

    // Screen Share Producer ID'lerini takip et (Kapatmak için)
    const screenProducerIdRef = useRef<string | null>(null);
    const screenAudioProducerIdRef = useRef<string | null>(null);

    // Ekran paylaşımı durduğunda producer'ları kapat (UI Cleanup Bug Fix)
    useEffect(() => {
        if (!isSharing) {
            if (screenProducerIdRef.current) {
                closeProducer(screenProducerIdRef.current);
                screenProducerIdRef.current = null;
                console.log('🛑 Ekran video producer kapatıldı');
            }
            if (screenAudioProducerIdRef.current) {
                closeProducer(screenAudioProducerIdRef.current);
                screenAudioProducerIdRef.current = null;
                console.log('🛑 Ekran audio producer kapatıldı');
            }
        }
    }, [isSharing]); // isSharing false olduğunda çalışır

    // Electron API kontrolü
    const [isElectron, setIsElectron] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);

    useEffect(() => {
        setIsElectron(typeof window !== 'undefined' && 'electronAPI' in window);
    }, []);

    // Local video'yu video elementine bağla
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    // Screen video'yu video elementine bağla
    useEffect(() => {
        if (screenVideoRef.current && screenStream) {
            screenVideoRef.current.srcObject = screenStream;
        }
    }, [screenStream]);


    // Mikrofonu aç/kapat (sesli bildirimle)
    const handleToggleMic = useCallback(() => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                const willBeMuted = audioTrack.enabled; // enabled=true ise mute edilecek demektir
                toggleAudio();

                // Sunucuya bildir
                sendStatusUpdate({ isMicMuted: willBeMuted });

                if (willBeMuted) {
                    playMuteSound();
                } else {
                    playUnmuteSound();
                }
            }
        }
    }, [localStream, toggleAudio, sendStatusUpdate]);

    // Sesi kapat/aç - Deafen (sesli bildirimle)
    // Sesi kapat/aç - Deafen (sesli bildirimle)
    const handleToggleDeafen = useCallback(() => {
        const newDeafened = !isDeafened;
        setIsDeafened(newDeafened);

        // Sunucuya bildir
        sendStatusUpdate({ isDeafened: newDeafened });

        if (newDeafened) playDeafenSound();
        else playUndeafenSound();
    }, [isDeafened, sendStatusUpdate]);

    // 1. Keybind Konfigürasyonunu Main Process'e Gönder (Sadece ayarlar kapandığında veya mount olunca)
    useEffect(() => {
        if (!isElectron) return;

        const keybinds = loadKeybinds();
        if (window.electronAPI && window.electronAPI.updateGlobalKeybinds) {
            const uiohookKeybinds = {
                toggleMic: mapDomCodeToUiohook(keybinds.toggleMic),
                toggleSpeaker: mapDomCodeToUiohook(keybinds.toggleSpeaker)
            };
            window.electronAPI.updateGlobalKeybinds(uiohookKeybinds);
        }
    }, [isElectron, showSettings]); // Sadece ayarlar değişince güncelle

    // 2. Global Listener (Olayları Dinle)
    useEffect(() => {
        const keybinds = loadKeybinds();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (showSettings) return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (e.code === keybinds.toggleMic) {
                if (!isElectron) {
                    e.preventDefault();
                    handleToggleMic();
                }
            } else if (e.code === keybinds.toggleSpeaker) {
                if (!isElectron) {
                    e.preventDefault();
                    handleToggleDeafen();
                }
            }
        };

        if (!isElectron) {
            window.addEventListener('keydown', handleKeyDown);
        }

        // Electron Global Listener
        let cleanupGlobal: (() => void) | undefined;
        if (window.electronAPI && window.electronAPI.onGlobalShortcutTriggered) {
            cleanupGlobal = window.electronAPI.onGlobalShortcutTriggered((action: string) => {
                console.log("Global shortcut triggered:", action); // Debug log
                // Ses efektleri handle fonksiyonlarının içinde var, çalışması lazım.
                if (action === 'toggleMic') handleToggleMic();
                if (action === 'toggleSpeaker') handleToggleDeafen();
            });
        }

        return () => {
            if (!isElectron) window.removeEventListener('keydown', handleKeyDown);
            if (cleanupGlobal) cleanupGlobal();
        };
    }, [handleToggleMic, handleToggleDeafen, showSettings, isElectron]); // Listener fonksiyonları değişirse bu hook yenilenir

    // Yeni producer (stream) açıldığında otomatik consume et
    useEffect(() => {
        if (!socket || !isJoined) return;

        const handleNewProducer = async (data: { producerId: string; peerId: string }) => {
            console.log('🆕 Yeni producer algılandı:', data.producerId, 'from', data.peerId);
            try {
                // Eğer producer bize ait değilse consume et
                if (data.peerId !== clientId) {
                    await consumeProducer(data.producerId);
                }
            } catch (error) {
                console.error('❌ Auto-consume hatası:', error);
            }
        };

        socket.on('new-producer', handleNewProducer);

        return () => {
            socket.off('new-producer', handleNewProducer);
        };
    }, [socket, clientId, isJoined, consumeProducer]);

    // Chat mesajlarını dinle - sadece odaya katıldıktan sonra
    const seenMessageIds = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!isJoined) return;

        const cleanup = onChatMessage((msg) => {
            // Status mesajlarını filtrele (eski client'lardan gelebilir)
            if (msg.message.startsWith('{') && msg.message.includes('"type":"status"')) {
                return; // Gösterme
            }

            // Duplicate kontrolü - aynı ID'li mesaj zaten gösterilmiş mi?
            if (seenMessageIds.current.has(msg.id)) {
                console.log('🔄 Duplicate mesaj engellendi:', msg.id);
                return;
            }
            seenMessageIds.current.add(msg.id);

            setChatMessages((prev) => [...prev, msg]);
            playUnmuteSound();
        });
        return cleanup;
    }, [onChatMessage, isJoined]);

    /**
     * Mesaj gönder
     */
    const handleSendMessage = (message: string) => {
        emit('chat-message', { message });
    };

    /**
     * Odaya Katıl
     */
    /**
     * Odaya Katıl
     */
    const handleJoinRoom = async (overrideRoomId?: string, overridePassword?: string) => {
        const roomIdToJoin = overrideRoomId || selectedRoom;
        const passwordToUse = overridePassword !== undefined ? overridePassword : roomPassword;

        if (!username.trim()) {
            setLoginError('Lütfen bir kullanıcı adı girin.');
            return;
        }

        if (!isConnected) {
            setLoginError('Sunucuya bağlı değil! Backend çalışıyor mu?');
            return;
        }

        setLoginError(null); // Hataları temizle

        try {
            setJoiningStatus('connecting');

            // Adım 0: Önce kimliğimizi sunucuya kaydettirelim!
            const userResponse = await request('setUsername', {
                username,
                password: passwordToUse,
                roomId: roomIdToJoin
            }) as { success: boolean; error?: string };

            if (!userResponse || !userResponse.success) {
                throw new Error(userResponse?.error || 'Kullanıcı adı alınamadı');
            }

            console.log('📱 Adım 1: Device yükleniyor...');
            const deviceLoaded = await loadDevice();
            if (!deviceLoaded) throw new Error('Device yüklenemedi');

            console.log('🚇 Adım 2: Transport\'lar oluşturuluyor...');
            const transportsCreated = await createTransports();
            if (!transportsCreated) throw new Error('Transport oluşturulamadı');

            // Adım 3: Sadece mikrofonu başlat (kamera kapalı kalacak)
            console.log('🎤 Adım 3: Mikrofon başlatılıyor...');
            const stream = await startMedia({ video: false, audio: true });
            if (!stream) throw new Error('Mikrofon başlatılamadı');

            // Adım 4: Audio produce et
            console.log('🎤 Adım 4: Audio produce ediliyor...');
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                await produceAudio(audioTrack);
            }

            console.log('👀 Adım 5: Diğer kullanıcılar consume ediliyor...');
            await consumeAll();

            setJoiningStatus('joined');
            console.log('✅ Odaya başarıyla katıldın!');

            // Mevcut kullanıcıları getir
            fetchPeers();

        } catch (error) {
            console.error('❌ Odaya katılma hatası:', error);
            setJoiningStatus('idle'); // Tekrar denemeye izin ver
            setLoginError(error instanceof Error ? error.message : 'Bağlantı hatası oluştu');
        }
    };

    /**
     * Odadan Ayrıl
     */
    const handleLeaveRoom = () => {
        closeAll();
        stopMedia();
        stopScreenShare();
        setJoiningStatus('idle');
        console.log('👋 Odadan ayrıldın');
    };

    /**
     * Kamera Toggle
     * Kamera kapalıysa: kamerayı aç ve produce et
     * Kamera açıksa: toggle et (track'i disable/enable yap)
     */
    const handleCameraToggle = async () => {
        if (!videoEnabled && !localStream?.getVideoTracks().length) {
            // İlk kez kamera açılıyor - getUserMedia ile video al
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                const videoTrack = stream.getVideoTracks()[0];
                if (videoTrack) {
                    // Mevcut stream'e ekle
                    localStream?.addTrack(videoTrack);
                    // Produce et
                    await produceVideo(videoTrack);
                    console.log('📷 Kamera açıldı ve produce edildi');
                }
            } catch (error) {
                console.error('❌ Kamera açılamadı:', error);
                alert('Kamera açılamadı. İzin verildi mi?');
            }
        } else {
            // Normal toggle
            toggleVideo();
        }
    };

    /**
     * Ekran Paylaşımı Başlat
     */
    const handleScreenShareClick = async () => {
        if (isSharing) {
            // Zaten paylaşıyorsa durdur
            stopScreenShare();
            return;
        }

        if (isElectron) {
            // Electron'da picker göster
            await getSources();
            setShowScreenPicker(true);
        } else {
            // Tarayıcıda doğrudan getDisplayMedia kullan
            const stream = await startScreenShare('');
            if (stream) {
                // Video produce et
                const screenTrack = stream.getVideoTracks()[0];
                if (screenTrack) {
                    const pid = await produceVideo(screenTrack);
                    screenProducerIdRef.current = pid;
                    console.log('🖥️ Ekran paylaşımı video producer oluşturuldu:', pid);
                }

                // Audio produce et (Sistem sesi varsa)
                const audioTrack = stream.getAudioTracks()[0];
                if (audioTrack) {
                    const pid = await produceAudio(audioTrack);
                    screenAudioProducerIdRef.current = pid;
                    console.log('🔊 Ekran paylaşımı audio producer oluşturuldu:', pid);
                }
            }
        }
    };

    /**
     * Ekran kaynağı seçildiğinde
     */
    const handleScreenSourceSelect = async (sourceId: string) => {
        setShowScreenPicker(false);

        const stream = await startScreenShare(sourceId);
        if (stream) {
            // Video produce et
            const screenTrack = stream.getVideoTracks()[0];
            if (screenTrack) {
                const pid = await produceVideo(screenTrack);
                screenProducerIdRef.current = pid;
                console.log('🖥️ Ekran paylaşımı video producer oluşturuldu:', pid);
            }

            // Audio produce et (Sistem sesi varsa)
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                const pid = await produceAudio(audioTrack);
                screenAudioProducerIdRef.current = pid;
                console.log('🔊 Ekran paylaşımı audio producer oluşturuldu:', pid);
            }
        }
    };

    // Kullanıcı ses seviyesini değiştir
    const handleVolumeChange = (peerId: string, volume: number) => {
        setUserVolumes(prev => ({
            ...prev,
            [peerId]: volume
        }));
    };

    return (
        <div className="app-container">
            <TitleBar />
            <UpdateNotifier />

            <div className="app-body">
                {/* Ekran Paylaşımı Picker Modal */}
                {showScreenPicker && (
                    <ScreenSharePicker
                        sources={availableSources}
                        onSelect={handleScreenSourceSelect}
                        onCancel={() => setShowScreenPicker(false)}
                    />
                )}

                {/* Settings Panel */}
                <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />



                {/* Sol Sidebar */}
                <div className="app-content-wrapper">
                    <aside className="sidebar">
                        <div className="logo">
                            <img src={logo} alt="Logo" className="logo-img" />
                            <span className="logo-text">DemirkıranCAFE</span>
                        </div>

                        <div className="room-info">
                            <div className="room-name">
                                {selectedRoom === 'main' ? 'Ana Oda' : 'Geliştirme Odası'}
                            </div>
                            <div className="room-status">
                                {isConnected ? (
                                    <span className="status-connected">● Sunucuya Bağlı</span>
                                ) : (
                                    <span className="status-disconnected">○ Bağlantı Yok</span>
                                )}
                            </div>
                            {clientId && (
                                <div className="client-id">ID: {clientId.slice(0, 8)}...</div>
                            )}

                            <div className="room-selector" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <button
                                    className={`room-btn ${selectedRoom === 'main' ? 'active' : ''}`}
                                    onClick={() => handleSwitchRoom('main')}
                                    style={{ padding: '5px', fontSize: '0.8rem', cursor: 'pointer', background: selectedRoom === 'main' ? '#2563eb' : '#333', color: 'white', border: 'none', borderRadius: '4px' }}
                                >
                                    🏠 Ana Oda
                                </button>
                                <button
                                    className={`room-btn ${selectedRoom === 'dev' ? 'active' : ''}`}
                                    onClick={() => handleSwitchRoom('dev')}
                                    style={{ padding: '5px', fontSize: '0.8rem', cursor: 'pointer', background: selectedRoom === 'dev' ? '#2563eb' : '#333', color: 'white', border: 'none', borderRadius: '4px' }}
                                >
                                    🛠️ Geliştirme Odası
                                </button>
                            </div>
                        </div>

                        <div className="users-section">
                            <h3>Kullanıcılar</h3>
                            <div className="room-group">
                                <h4 style={{ fontSize: '0.8rem', color: '#888', marginBottom: '5px', textTransform: 'uppercase' }}>🏠 Ana Oda</h4>
                                {isJoined && selectedRoom === 'main' && (
                                    <div className={`user-item user-self ${isSpeaking ? 'user-speaking-active' : ''}`}>
                                        <Avatar name={username} size="sm" isSpeaking={isSpeaking} />
                                        <span className="user-name">{username} (Sen)</span>
                                        <div className="user-status-icons">
                                            <button
                                                className={`status-btn ${!audioEnabled ? 'muted' : ''}`}
                                                onClick={handleToggleMic}
                                                title={audioEnabled ? 'Mikrofonu Kapat (M)' : 'Mikrofonu Aç (M)'}
                                            >
                                                {audioEnabled ? <MicIcon /> : <MicOffIcon />}
                                            </button>
                                            <button
                                                className={`status-btn ${isDeafened ? 'muted' : ''}`}
                                                onClick={handleToggleDeafen}
                                                title={isDeafened ? 'Sesi Aç (D)' : 'Sesi Kapat (D)'}
                                            >
                                                {isDeafened ? <HeadphonesOffIcon /> : <HeadphonessIcon />}
                                            </button>
                                            {isSharing && (
                                                <span className="status-icon" title="Ekran Paylaşıyor">
                                                    🖥️
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {peers.filter(p => !p.roomId || p.roomId === 'main').map((peer) => (
                                    <SidebarPeer
                                        key={peer.id}
                                        peer={peer}
                                        consumers={consumers}
                                        volume={userVolumes[peer.id] ?? 100}
                                        onVolumeChange={handleVolumeChange}
                                    />
                                ))}
                            </div>

                            <div className="room-group" style={{ marginTop: '15px' }}>
                                <h4 style={{ fontSize: '0.8rem', color: '#888', marginBottom: '5px', textTransform: 'uppercase' }}>🛠️ Geliştirme Odası</h4>
                                {isJoined && selectedRoom === 'dev' && (
                                    <div className={`user-item user-self ${isSpeaking ? 'user-speaking-active' : ''}`}>
                                        <Avatar name={username} size="sm" isSpeaking={isSpeaking} />
                                        <span className="user-name">{username} (Sen)</span>
                                        <div className="user-status-icons">
                                            <button
                                                className={`status-btn ${!audioEnabled ? 'muted' : ''}`}
                                                onClick={handleToggleMic}
                                                title={audioEnabled ? 'Mikrofonu Kapat (M)' : 'Mikrofonu Aç (M)'}
                                            >
                                                {audioEnabled ? <MicIcon /> : <MicOffIcon />}
                                            </button>
                                            <button
                                                className={`status-btn ${isDeafened ? 'muted' : ''}`}
                                                onClick={handleToggleDeafen}
                                                title={isDeafened ? 'Sesi Aç (D)' : 'Sesi Kapat (D)'}
                                            >
                                                {isDeafened ? <HeadphonesOffIcon /> : <HeadphonessIcon />}
                                            </button>
                                            {isSharing && (
                                                <span className="status-icon" title="Ekran Paylaşıyor">
                                                    🖥️
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {peers.filter(p => p.roomId === 'dev').map((peer) => (
                                    <SidebarPeer
                                        key={peer.id}
                                        peer={peer}
                                        consumers={consumers}
                                        volume={userVolumes[peer.id] ?? 100}
                                        onVolumeChange={handleVolumeChange}
                                    />
                                ))}
                            </div>

                        </div>

                        <div className="sidebar-footer">
                            <PingMeter ping={ping} status={pingStatus} />
                            <button className="settings-btn" onClick={() => setShowSettings(true)} title="Ayarlar">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                                </svg>
                            </button>
                        </div>
                    </aside>

                    {/* Ana İçerik */}
                    <main className="main-content">
                        {!isJoined ? (
                            <div className="connect-screen">
                                <div className="connect-card">
                                    <h1>{selectedRoom === 'main' ? 'Ana Oda' : 'Geliştirme Odası'}'na Hoş Geldin!</h1>
                                    <p>Odaya katılmak için bilgilerini gir</p>

                                    <input
                                        type="text"
                                        placeholder="Kullanıcı Adı"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="username-input"
                                        disabled={joiningStatus === 'connecting'}
                                    />

                                    <input
                                        type="password"
                                        placeholder="Oda Şifresi"
                                        value={roomPassword}
                                        onChange={(e) => {
                                            setRoomPassword(e.target.value);
                                            if (loginError) setLoginError(null);
                                        }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                                        className={`username-input password-input ${loginError ? 'input-error' : ''}`}
                                        disabled={joiningStatus === 'connecting'}
                                    />

                                    {loginError && (
                                        <div className="error-message" style={{ color: '#ff4444', marginBottom: '10px', fontSize: '0.9rem', textAlign: 'center' }}>
                                            {loginError}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => handleJoinRoom()}
                                        className="connect-button"
                                        disabled={joiningStatus === 'connecting' || !isConnected}
                                    >
                                        {joiningStatus === 'connecting' ? 'Bağlanıyor...' :
                                            !isConnected ? 'Sunucu Bekleniyor...' : 'Odaya Katıl'}
                                    </button>

                                    {!isConnected && (
                                        <p className="warning-text">
                                            ⚠️ Backend'e bağlanılamıyor. <code>npm run start:dev</code> çalışıyor mu?
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="room-view">
                                {/* Video ve Chat container - yan yana */}
                                <div className="room-content">
                                    {/* Sol: Video Grid */}
                                    <div className="video-section">
                                        <div className="video-grid">
                                            {/* Kendi video'muz */}
                                            <div className="video-container self-video">
                                                <video
                                                    ref={localVideoRef}
                                                    autoPlay
                                                    muted
                                                    playsInline
                                                    className={`video-element ${!videoEnabled ? 'hidden' : ''}`}
                                                />
                                                {!videoEnabled && (
                                                    <div className="video-placeholder-content">
                                                        <Avatar name={username} size="xl" isSpeaking={isSpeaking} />
                                                        <div className="placeholder-name">{username}</div>
                                                        <div className="placeholder-text">Kamera kapalı</div>
                                                    </div>
                                                )}
                                                <div className="video-label">{username} (Sen)</div>
                                            </div>

                                            {/* Ekran paylaşımı video'su */}
                                            {isSharing && screenStream && (
                                                <div
                                                    className="video-container screen-share-video"
                                                    onClick={(e) => {
                                                        const target = e.currentTarget;
                                                        if (document.fullscreenElement) {
                                                            document.exitFullscreen();
                                                        } else {
                                                            target.requestFullscreen().catch(err => console.error("Fullscreen error:", err));
                                                        }
                                                    }}
                                                    title="Tam ekran için tıkla"
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <video
                                                        ref={screenVideoRef}
                                                        autoPlay
                                                        muted
                                                        playsInline
                                                        className="video-element"
                                                    />
                                                    <div className="video-label">🖥️ Ekran Paylaşımı</div>
                                                </div>
                                            )}

                                            {/* Diğer kullanıcıların video'ları */}
                                            {peers.filter(p => (!p.roomId && selectedRoom === 'main') || p.roomId === selectedRoom).map((peer) => {
                                                const videoConsumer = consumers.find(c => c.peerId === peer.id && c.kind === 'video');
                                                const hasVideo = !!videoConsumer;

                                                return (
                                                    <div
                                                        key={peer.id}
                                                        className={`video-container ${hasVideo ? 'remote-video' : 'remote-no-video'}`}
                                                        onClick={(e) => {
                                                            const target = e.currentTarget;
                                                            if (document.fullscreenElement) {
                                                                document.exitFullscreen();
                                                            } else {
                                                                target.requestFullscreen().catch(err => console.error("Fullscreen error:", err));
                                                            }
                                                        }}
                                                        title={hasVideo ? "Tam ekran için tıkla" : `${peer.username} (Kamera kapalı)`}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        {hasVideo ? (
                                                            <VideoPlayer stream={videoConsumer.stream} />
                                                        ) : (
                                                            <div className="video-placeholder-content">
                                                                <Avatar name={peer.username} size="xl" />
                                                                <div className="placeholder-name">{peer.username}</div>
                                                                <div className="placeholder-text">Kamera kapalı</div>
                                                            </div>
                                                        )}

                                                        <div className="video-label">
                                                            <span>{peer.username}</span>
                                                            <div className="video-status-icons" style={{ display: 'flex', gap: '4px', marginLeft: '6px' }}>
                                                                {peer.isMicMuted && (
                                                                    <MicOffIcon size={14} style={{ color: '#ff4d4d' }} />
                                                                )}
                                                                {peer.isDeafened && (
                                                                    <HeadphonesOffIcon size={14} style={{ color: '#ff4d4d' }} />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Sağ: Chat Panel */}
                                    <div className="chat-section">
                                        <div className="chat-header-integrated">
                                            <h3>💬 Sohbet</h3>
                                        </div>
                                        <div className="chat-messages-integrated">
                                            {chatMessages.length === 0 ? (
                                                <div className="chat-empty-integrated">
                                                    <span>💬</span>
                                                    <p>Henüz mesaj yok</p>
                                                </div>
                                            ) : (
                                                chatMessages.map((msg) => {
                                                    const isOwnMessage = msg.senderId === clientId;
                                                    return (
                                                        <div
                                                            key={msg.id}
                                                            className={`chat-msg ${isOwnMessage ? 'own' : ''}`}
                                                        >
                                                            <Avatar name={msg.senderName} size="sm" />
                                                            <div className="msg-content">
                                                                <span className="msg-sender">{msg.senderName}</span>
                                                                <div className="msg-bubble">{msg.message}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                        <form className="chat-input-integrated" onSubmit={(e) => {
                                            e.preventDefault();
                                            const input = e.currentTarget.querySelector('input') as HTMLInputElement;
                                            if (input.value.trim()) {
                                                handleSendMessage(input.value.trim());
                                                input.value = '';
                                            }
                                        }}>
                                            <input
                                                type="text"
                                                placeholder="Mesaj yaz..."
                                                maxLength={500}
                                            />
                                            <button type="submit">➤</button>
                                        </form>
                                    </div>
                                </div>

                                {/* Kontrol Çubuğu */}
                                <div className="control-bar">
                                    {/* Kalite Seçici */}
                                    <QualitySelector
                                        currentQuality={currentQuality}
                                        onQualityChange={setQuality}
                                    />

                                    <div className="control-buttons">

                                        <button
                                            className={`control-button camera-button ${!videoEnabled ? 'muted' : ''}`}
                                            onClick={handleCameraToggle}
                                            title={videoEnabled ? 'Kamerayı Kapat' : 'Kamerayı Aç'}
                                        >
                                            {videoEnabled ? '📷' : '📷'}
                                        </button>
                                        <button
                                            className={`control-button screen-button ${isSharing ? 'active' : ''}`}
                                            onClick={handleScreenShareClick}
                                            title={isSharing ? 'Ekran Paylaşımını Durdur' : 'Ekran Paylaş'}
                                        >
                                            🖥️
                                        </button>
                                        <button
                                            className="control-button leave-button"
                                            onClick={handleLeaveRoom}
                                            title="Odadan Ayrıl"
                                        >
                                            📴
                                        </button>
                                    </div>
                                </div>

                                {/* Audio Elements for Remote Streams (GÖRÜNMEZ AMA SES VERİR) */}
                                {consumers.filter(c => c.kind === 'audio').map(consumer => (
                                    <AudioPlayer
                                        key={consumer.id}
                                        stream={consumer.stream}
                                        muted={isDeafened}
                                        volume={userVolumes[consumer.peerId] ?? 100}
                                    />
                                ))}
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}

/**
 * Video Player Bileşeni
 */
function VideoPlayer({ stream }: { stream: MediaStream }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const isSpeaking = useAudioLevel(stream);
    const [stats, setStats] = useState('');

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }

        // Basit çözünürlük takibi (Debug için)
        const interval = setInterval(() => {
            if (videoRef.current) {
                const { videoWidth, videoHeight } = videoRef.current;
                if (videoWidth) {
                    setStats(`${videoWidth}x${videoHeight}`);
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [stream]);

    return (
        <div className="video-wrapper" style={{ position: 'relative' }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                className={`video-element ${isSpeaking ? 'speaking' : ''}`}
            />
            {stats && <div style={{
                position: 'absolute',
                top: 5,
                left: 5,
                background: 'rgba(0,0,0,0.5)',
                color: 'white',
                padding: '2px 5px',
                fontSize: '10px',
                borderRadius: '4px',
                pointerEvents: 'none'
            }}>{stats}</div>}
        </div>
    );
}

/**
 * Audio Player Bileşeni
 */
function AudioPlayer({ stream, muted, volume = 100 }: { stream: MediaStream; muted: boolean, volume?: number }) {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !stream) return;

        audio.srcObject = stream;

        const playAudio = async () => {
            try {
                await audio.play();
                console.log('🔊 Audio playback started');
            } catch (error) {
                console.warn('⚠️ Audio autoplay blocked, waiting for user interaction');
                const handleInteraction = async () => {
                    try {
                        await audio.play();
                        console.log('🔊 Audio playback started after interaction');
                        document.removeEventListener('click', handleInteraction);
                    } catch (e) {
                        console.error('Audio play failed:', e);
                    }
                };
                document.addEventListener('click', handleInteraction);
            }
        };

        playAudio();
    }, [stream]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume / 100;
        }
    }, [volume]);

    return (
        <audio
            ref={audioRef}
            muted={muted}
            playsInline
            style={{ display: 'none' }}
        />
    );
}

/**
 * Sidebar Peer Bileşeni (Ses aktivitesi için)
 */
function SidebarPeer({
    peer,
    consumers,
    volume,
    onVolumeChange
}: {
    peer: { id: string, username: string, isMicMuted?: boolean, isDeafened?: boolean },
    consumers: any[],
    volume: number,
    onVolumeChange: (id: string, vol: number) => void
}) {
    const peerConsumers = consumers.filter(c => c.peerId === peer.id);
    const hasVideo = peerConsumers.some(c => c.kind === 'video');
    const audioConsumer = peerConsumers.find(c => c.kind === 'audio');

    const rawIsSpeaking = useAudioLevel(audioConsumer?.stream || null);
    const isSpeaking = rawIsSpeaking && !peer.isMicMuted;

    const [showVolume, setShowVolume] = useState(false);
    const hasScreen = peerConsumers.some(c => c.stream?.getVideoTracks()[0]?.label?.toLowerCase().includes('screen') || c.appData?.source === 'screen');

    return (
        <div
            className={`user-item ${isSpeaking ? 'speaking' : ''}`}
            onMouseEnter={() => setShowVolume(true)}
            onMouseLeave={() => setShowVolume(false)}
        >
            <Avatar name={peer.username} size="sm" />
            <div className="user-info-col" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="user-name">{peer.username}</span>
                    <div className="user-status-icons">
                        <span className={`status-icon ${peer.isMicMuted ? 'muted' : ''}`} title={peer.isMicMuted ? 'Mikrofon Kapalı' : 'Mikrofon Açık'}>
                            {peer.isMicMuted ? <MicOffIcon size={16} /> : (audioConsumer ? <MicIcon size={16} /> : <MicOffIcon size={16} style={{ opacity: 0.5 }} />)}
                        </span>
                        <span className={`status-icon ${peer.isDeafened ? 'muted' : ''}`} title={peer.isDeafened ? 'Ses Kapalı' : 'Ses Açık'}>
                            {peer.isDeafened ? <HeadphonesOffIcon size={16} /> : <HeadphonessIcon size={16} />}
                        </span>
                        {hasVideo &&
                            <span className="status-icon" title="Kamera Açık">
                                <VideoIcon size={16} />
                            </span>
                        }
                        {hasScreen &&
                            <span className="status-icon" title="Ekran Paylaşıyor">
                                🖥️
                            </span>
                        }
                    </div>
                </div>
                {(showVolume || volume !== 100) && audioConsumer && (
                    <div className="user-volume-control" onClick={e => e.stopPropagation()} style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '0.7rem' }}>🔊</span>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={volume}
                            onChange={(e) => onVolumeChange(peer.id, Number(e.target.value))}
                            style={{ width: '100%', height: '4px' }}
                            title={`Ses Seviyesi: ${volume}%`}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
