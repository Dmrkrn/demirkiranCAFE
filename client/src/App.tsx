import { useState, useEffect, useRef } from 'react';
import { useSocket, useMediasoup, useMediaDevices, useScreenShare, useVoiceActivity, useQualitySettings } from './hooks';
import { ScreenSharePicker } from './components/ScreenSharePicker';
import { QualitySelector } from './components/QualitySelector';
import { VolumeIndicator } from './components/VolumeIndicator';
import { Avatar } from './components/Avatar';
import { ChatPanel } from './components/ChatPanel';
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
    const [isJoined, setIsJoined] = useState(false);
    const [joiningStatus, setJoiningStatus] = useState<'idle' | 'connecting' | 'error'>('idle');
    const [showScreenPicker, setShowScreenPicker] = useState(false);

    // Chat state
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<Array<{
        id: string;
        senderId: string;
        senderName: string;
        message: string;
        timestamp: string;
    }>>([]);

    // Video elementleri için ref
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const screenVideoRef = useRef<HTMLVideoElement>(null);

    // Custom Hooks
    const { isConnected, clientId, request, emit, onChatMessage } = useSocket();
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
        isDeviceLoaded,
        consumers,
        loadDevice,
        createTransports,
        produceVideo,
        produceAudio,
        consumeAll,
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
    const { isSpeaking, volume } = useVoiceActivity({ stream: localStream });

    // Kalite Ayarları
    const { currentQuality, setQuality, getConstraints } = useQualitySettings();

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

    // Chat mesajlarını dinle
    useEffect(() => {
        const unsubscribe = onChatMessage((msg) => {
            setChatMessages(prev => [...prev, msg]);
        });
        return unsubscribe;
    }, [onChatMessage]);

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

            // Adım 6: Kullanıcı adını sunucuya gönder (sohbet için)
            emit('setUsername', { username });

            setIsJoined(true);
            setJoiningStatus('idle');
            console.log('✅ Odaya başarıyla katıldın!');

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

    return (
        <div className="app">
            {/* Ekran Paylaşımı Picker Modal */}
            {showScreenPicker && (
                <ScreenSharePicker
                    sources={availableSources}
                    onSelect={handleScreenSourceSelect}
                    onCancel={() => setShowScreenPicker(false)}
                />
            )}

            {/* Sol Sidebar */}
            <aside className="sidebar">
                <div className="logo">
                    <span className="logo-icon">☕</span>
                    <span className="logo-text">DemirkiranCAFE</span>
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
                            {audioEnabled && <span className="user-mic-icon">🎤</span>}
                            {isSharing && <span className="user-sharing">🖥️</span>}
                        </div>
                    )}
                    {consumers.map((consumer) => (
                        <div key={consumer.id} className="user-item">
                            <Avatar name={`User-${consumer.id.slice(0, 4)}`} size="sm" />
                            <span className="user-name">Kullanıcı</span>
                            <span className="user-media">{consumer.kind === 'video' ? '📹' : '🎤'}</span>
                        </div>
                    ))}
                </div>

                <div className="sidebar-footer">
                    {isElectron && audioEnabled && (
                        <div className="footer-volume">
                            <VolumeIndicator volume={volume} isSpeaking={isSpeaking} />
                        </div>
                    )}
                    {isElectron && (
                        <div className="electron-badge">Electron</div>
                    )}
                </div>
            </aside>

            {/* Ana İçerik */}
            <main className="main-content">
                {!isJoined ? (
                    <div className="connect-screen">
                        <div className="connect-card">
                            <h1>Hoş Geldin!</h1>
                            <p>Odaya katılmak için kullanıcı adını gir</p>

                            <input
                                type="text"
                                placeholder="Kullanıcı Adı"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                                className="username-input"
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
                                        .map((consumer) => (
                                            <div key={consumer.id} className="video-container">
                                                <VideoPlayer stream={consumer.stream} />
                                                <div className="video-label">Kullanıcı</div>
                                            </div>
                                        ))}
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
                                                    {!isOwnMessage && (
                                                        <Avatar name={msg.senderName} size="sm" />
                                                    )}
                                                    <div className="msg-content">
                                                        {!isOwnMessage && (
                                                            <span className="msg-sender">{msg.senderName}</span>
                                                        )}
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
                                    className={`control-button mic-button ${!audioEnabled ? 'muted' : ''} ${isSpeaking ? 'speaking' : ''}`}
                                    onClick={toggleAudio}
                                    title={audioEnabled ? 'Mikrofonu Kapat' : 'Mikrofonu Aç'}
                                >
                                    {audioEnabled ? '🎤' : '🔇'}
                                </button>

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
                    </div>
                )}
            </main>

        </div>
    );
}

/**
 * Video Player Bileşeni
 */
function VideoPlayer({ stream }: { stream: MediaStream }) {
    const videoRef = useRef<HTMLVideoElement>(null);

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
            className="video-element"
        />
    );
}

export default App;
