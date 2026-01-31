import { useState, useEffect, useRef } from 'react';
import { useSocket, useMediasoup, useMediaDevices } from './hooks';
import './styles/App.css';

/**
 * Ana Uygulama Bileşeni (Güncellenmiş)
 * ====================================
 * 
 * Artık gerçek WebRTC bağlantısı yapıyor:
 * 1. Socket.io ile sunucuya bağlan
 * 2. mediasoup Device'ı yükle
 * 3. Transport'ları oluştur
 * 4. Kamera/mikrofon produce et
 * 5. Diğer kullanıcıları consume et
 */
function App() {
    const [username, setUsername] = useState('');
    const [isJoined, setIsJoined] = useState(false);
    const [joiningStatus, setJoiningStatus] = useState<'idle' | 'connecting' | 'error'>('idle');

    // Video elementleri için ref
    const localVideoRef = useRef<HTMLVideoElement>(null);

    // Custom Hooks
    const { isConnected, clientId, request } = useSocket();
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

    /**
     * Odaya Katıl
     * -----------
     * 1. Device'ı yükle (codec negotiation)
     * 2. Transport'ları oluştur
     * 3. Kamera/mikrofon başlat
     * 4. Video/ses produce et
     * 5. Diğerlerini consume et
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

            // Adım 1: Device'ı yükle
            console.log('📱 Adım 1: Device yükleniyor...');
            const deviceLoaded = await loadDevice();
            if (!deviceLoaded) throw new Error('Device yüklenemedi');

            // Adım 2: Transport'ları oluştur
            console.log('🚇 Adım 2: Transport\'lar oluşturuluyor...');
            const transportsCreated = await createTransports();
            if (!transportsCreated) throw new Error('Transport oluşturulamadı');

            // Adım 3: Kamera/mikrofon başlat
            console.log('📹 Adım 3: Kamera/mikrofon başlatılıyor...');
            const stream = await startMedia();
            if (!stream) throw new Error('Medya başlatılamadı');

            // Adım 4: Video produce et
            console.log('🎬 Adım 4: Video produce ediliyor...');
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                await produceVideo(videoTrack);
            }

            // Adım 5: Audio produce et
            console.log('🎤 Adım 5: Audio produce ediliyor...');
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                await produceAudio(audioTrack);
            }

            // Adım 6: Mevcut producer'ları consume et
            console.log('👀 Adım 6: Diğer kullanıcılar consume ediliyor...');
            await consumeAll();

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
        setIsJoined(false);
        console.log('👋 Odadan ayrıldın');
    };

    return (
        <div className="app">
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
                        <div className="user-item user-self">
                            <span className="user-avatar">👤</span>
                            <span className="user-name">{username} (Sen)</span>
                            {audioEnabled && <span className="user-speaking">🎤</span>}
                        </div>
                    )}
                    {/* Diğer kullanıcılar consumer listesinden gelecek */}
                    {consumers.map((consumer) => (
                        <div key={consumer.id} className="user-item">
                            <span className="user-avatar">👤</span>
                            <span className="user-name">Kullanıcı</span>
                            <span className="user-media">{consumer.kind === 'video' ? '📹' : '🎤'}</span>
                        </div>
                    ))}
                </div>

                <div className="sidebar-footer">
                    {isElectron && (
                        <div className="electron-badge">🖥️ Electron</div>
                    )}
                    <div className="device-status">
                        {isDeviceLoaded && '✅ Device hazır'}
                    </div>
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
                                        <div className="placeholder-avatar">👤</div>
                                        <div className="placeholder-name">{username}</div>
                                        <div className="placeholder-text">Kamera kapalı</div>
                                    </div>
                                )}
                                <div className="video-label">{username} (Sen)</div>
                            </div>

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

                        {/* Kontrol Çubuğu */}
                        <div className="control-bar">
                            <button
                                className={`control-button mic-button ${!audioEnabled ? 'muted' : ''}`}
                                onClick={toggleAudio}
                                title={audioEnabled ? 'Mikrofonu Kapat' : 'Mikrofonu Aç'}
                            >
                                {audioEnabled ? '🎤' : '🔇'}
                            </button>
                            <button
                                className={`control-button camera-button ${!videoEnabled ? 'muted' : ''}`}
                                onClick={toggleVideo}
                                title={videoEnabled ? 'Kamerayı Kapat' : 'Kamerayı Aç'}
                            >
                                {videoEnabled ? '📷' : '📷'}
                            </button>
                            <button
                                className="control-button screen-button"
                                title="Ekran Paylaş"
                                onClick={() => {/* TODO: Ekran paylaşımı */ }}
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
                )}
            </main>
        </div>
    );
}

/**
 * Video Player Bileşeni
 * Gelen MediaStream'i video elementine bağlar
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
