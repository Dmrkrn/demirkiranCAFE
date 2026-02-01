import { useState, useEffect, useRef, useCallback } from 'react';
import logo from './assets/logo.png';
import { useSocket, useMediasoup, useMediaDevices, useScreenShare, useVoiceActivity, useQualitySettings, usePing } from './hooks';
import { useAudioLevel } from './hooks/useAudioLevel';
import { ScreenSharePicker } from './components/ScreenSharePicker';
import { QualitySelector } from './components/QualitySelector';
import { Avatar } from './components/Avatar';
import { TitleBar } from './components/TitleBar';
import { PingMeter } from './components/PingMeter';
import { SettingsPanel, loadKeybinds } from './components/SettingsPanel';
import { playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound } from './utils/sounds';
import './styles/App.css';

/**
 * Ana Uygulama Bileşeni (Ekran Paylaşımı Eklendi)
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
    const [isJoined, setIsJoined] = useState(false);
    const [joiningStatus, setJoiningStatus] = useState<'idle' | 'connecting' | 'error'>('idle');
    const [showScreenPicker, setShowScreenPicker] = useState(false);

    // Chat state
    const [showSettings, setShowSettings] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [chatMessages, setChatMessages] = useState<Array<{
        id: string;
        senderId: string;
        senderName: string;
        message: string;
        timestamp: string;
    }>>([]);

    // Kullanıcı Ses Seviyeleri (0-100)
    const [userVolumes, setUserVolumes] = useState<Record<string, number>>({});

    // Video elementleri için ref
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const screenVideoRef = useRef<HTMLVideoElement>(null);

    // Custom Hooks
    const { isConnected, clientId, request, emit, onChatMessage, peers, fetchPeers, socket } = useSocket();
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
        consumeProducer, // <-- Import added
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

    // Electron API kontrolü
    const [isElectron, setIsElectron] = useState(false);

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
                const willBeMuted = audioTrack.enabled;
                toggleAudio();
                if (willBeMuted) {
                    playMuteSound();
                } else {
                    playUnmuteSound();
                }
            }
        }
    }, [localStream, toggleAudio]);

    // Sesi kapat/aç - Deafen (sesli bildirimle)
    const handleToggleDeafen = useCallback(() => {
        const newDeafened = !isDeafened;
        setIsDeafened(newDeafened);
        if (newDeafened) playDeafenSound();
        else playUndeafenSound();
    }, [isDeafened]);

    // Global keybind listener
    useEffect(() => {
        const keybinds = loadKeybinds();

        const handleKeyDown = (e: KeyboardEvent) => {
            // Settings paneli açıkken keybind'leri dinleme
            if (showSettings) return;

            // Input elementlerinde keybind'leri dinleme
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (e.code === keybinds.toggleMic) {
                e.preventDefault();
                handleToggleMic();
            } else if (e.code === keybinds.toggleSpeaker) {
                e.preventDefault();
                handleToggleDeafen();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSettings, handleToggleMic, handleToggleDeafen]);

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
    const handleJoinRoom = async () => {
        if (!username.trim()) {
            alert('Lütfen bir kullanıcı adı girin!');
            return;
        }

        if (!isConnected) {
            alert('Sunucuya bağlı değil! Backend çalışıyor mu?');
            return;
        }

        try {
            setJoiningStatus('connecting');

            // Adım 0: Önce kimliğimizi sunucuya kaydettirelim!
            // Böylece sonraki işlemlerimizde adımız "Anonim" görünmez.
            const userResponse = await request('setUsername', { username, password: roomPassword }) as { success: boolean; error?: string };
            if (!userResponse || !userResponse.success) {
                throw new Error(userResponse?.error || 'Kullanıcı adı alınamadı');
            }
            // Başarılı olursa (ama daha tam katılmadık, UI dönebilir)

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

            setIsJoined(true);
            setJoiningStatus('idle');
            console.log('✅ Odaya başarıyla katıldın!');

            // Mevcut kullanıcıları getir
            fetchPeers();

        } catch (error) {
            console.error('❌ Odaya katılma hatası:', error);
            setJoiningStatus('error');
            alert(`Hata: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
        }
    };

    /**
     * Odadan Ayrıl
     */
    const handleLeaveRoom = () => {
        closeAll();
        stopMedia();
        stopScreenShare();
        setIsJoined(false);
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
                // Ekran paylaşımını produce et
                const screenTrack = stream.getVideoTracks()[0];
                if (screenTrack) {
                    await produceVideo(screenTrack);
                    console.log('🖥️ Ekran paylaşımı producer oluşturuldu');
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
            // Ekran paylaşımını produce et
            const screenTrack = stream.getVideoTracks()[0];
            if (screenTrack) {
                await produceVideo(screenTrack);
                console.log('🖥️ Ekran paylaşımı producer oluşturuldu');
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
        <div className="app">
            <TitleBar />
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
                        <div className="room-name">Ana Oda</div>
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
                    </div>

                    <div className="users-section">
                        <h3>Kullanıcılar</h3>
                        {isJoined && (
                            <div className={`user-item user-self ${isSpeaking ? 'user-speaking-active' : ''}`}>
                                <Avatar name={username} size="sm" isSpeaking={isSpeaking} />
                                <span className="user-name">{username} (Sen)</span>
                                <div className="user-status-icons">
                                    <button
                                        className={`status-btn ${!audioEnabled ? 'muted' : ''}`}
                                        onClick={handleToggleMic}
                                        title={audioEnabled ? 'Mikrofonu Kapat (M)' : 'Mikrofonu Aç (M)'}
                                    >
                                        {audioEnabled ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                                            </svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        className={`status-btn ${isDeafened ? 'muted' : ''}`}
                                        onClick={handleToggleDeafen}
                                        title={isDeafened ? 'Sesi Aç (D)' : 'Sesi Kapat (D)'}
                                    >
                                        {isDeafened ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M4.34 2.93L2.93 4.34 7.29 8.7 7 9H3v6h4l5 5v-6.59l4.18 4.18c-.65.49-1.38.88-2.18 1.11v2.06c1.34-.3 2.57-.92 3.61-1.75l2.05 2.05 1.41-1.41L4.34 2.93zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-7-8l-1.88 1.88L12 7.76zm4.5 8c0-1.77-1.02-3.29-2.5-4.03v1.79l2.48 2.48c.01-.08.02-.16.02-.24z" />
                                            </svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M12 3c-4.97 0-9 4.03-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h4c1.1 0 2-.9 2-2v-7c0-4.97-4.03-9-9-9z" />
                                            </svg>
                                        )}
                                    </button>
                                    {isSharing && <span className="user-sharing">🖥️</span>}
                                </div>
                            </div>
                        )}
                        {peers.map((peer) => (
                            <SidebarPeer
                                key={peer.id}
                                peer={peer}
                                consumers={consumers}
                                volume={userVolumes[peer.id] ?? 100}
                                onVolumeChange={handleVolumeChange}
                            />
                        ))}
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
                                <h1>Hoş Geldin!</h1>
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
                                    onChange={(e) => setRoomPassword(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                                    className="username-input password-input"
                                    disabled={joiningStatus === 'connecting'}
                                />

                                <button
                                    onClick={handleJoinRoom}
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
                                            <div className="video-container screen-share-video">
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
                                        {consumers
                                            .filter(c => c.kind === 'video')
                                            .map((consumer) => {
                                                const peerName = peers.find(p => p.id === consumer.peerId)?.username || 'Kullanıcı';
                                                return (
                                                    <div key={consumer.id} className="video-container">
                                                        <VideoPlayer stream={consumer.stream} />
                                                        <div className="video-label">{peerName}</div>
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
    );
}

/**
 * Video Player Bileşeni
 */
function VideoPlayer({ stream }: { stream: MediaStream }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const isSpeaking = useAudioLevel(stream);

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`video-element ${isSpeaking ? 'speaking' : ''}`}
        />
    );
}

/**
 * Audio Player Bileşeni
 * Tarayıcı autoplay politikasına uygun şekilde ses çalar
 */
function AudioPlayer({ stream, muted, volume = 100 }: { stream: MediaStream; muted: boolean, volume?: number }) {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !stream) return;

        audio.srcObject = stream;

        // Tarayıcı autoplay politikasına uygun şekilde play et
        const playAudio = async () => {
            try {
                await audio.play();
                console.log('🔊 Audio playback started');
            } catch (error) {
                console.warn('⚠️ Audio autoplay blocked, waiting for user interaction');
                // Kullanıcı etkileşiminden sonra tekrar dene
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

    // Volume değişikliğini uygula
    useEffect(() => {
        if (audioRef.current) {
            // HTMLMediaElement volume 0.0 - 1.0 arasıdır
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

    // Konuşuyor mu? (Eğer mute'lu ise konuşmuyor say)
    const rawIsSpeaking = useAudioLevel(audioConsumer?.stream || null);
    const isSpeaking = rawIsSpeaking && !peer.isMicMuted;

    // Sağ tık menüsü state'i (basitçe her zaman gösterilen slider yerine hover ile gösterilebilir, ama şimdilik inline yapalım)
    const [showVolume, setShowVolume] = useState(false);

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
                    <span className="user-media">
                        {hasVideo && '📹'}
                        {peer.isMicMuted ? '🔴' : (audioConsumer ? '🎤' : '')}
                        {peer.isDeafened && '🔇'}
                    </span>
                </div>
                {/* Volume Slider - Hover yapınca veya volume değişmişse göster */}
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
                {peer.isDeafened && <span style={{ fontSize: '0.7rem', color: 'red' }}>Sağırlaştırıldı</span>}
            </div>
        </div>
    );
}

export default App;
