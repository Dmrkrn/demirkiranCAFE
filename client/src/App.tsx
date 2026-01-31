import { useState, useEffect } from 'react';
import './styles/App.css';

/**
 * Ana Uygulama Bileşeni
 * =====================
 * 
 * Bu, uygulamanın ana React bileşenidir.
 * Şimdilik basit bir "bağlantı" ekranı göstereceğiz.
 * 
 * İlerleyen adımlarda:
 * - Socket.io bağlantısı
 * - Mediasoup-client entegrasyonu
 * - Video grid UI
 */
function App() {
    const [isConnected, setIsConnected] = useState(false);
    const [username, setUsername] = useState('');
    const [roomStatus, setRoomStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

    // Electron API kontrolü
    const [isElectron, setIsElectron] = useState(false);

    useEffect(() => {
        // Electron içinde mi çalışıyoruz?
        setIsElectron(typeof window !== 'undefined' && 'electronAPI' in window);
    }, []);

    const handleConnect = () => {
        if (!username.trim()) {
            alert('Lütfen bir kullanıcı adı girin!');
            return;
        }

        setRoomStatus('connecting');

        // TODO: Socket.io bağlantısı burada yapılacak
        // Şimdilik simüle ediyoruz
        setTimeout(() => {
            setRoomStatus('connected');
            setIsConnected(true);
        }, 1000);
    };

    return (
        <div className="app">
            {/* Sol Sidebar - Kullanıcı listesi */}
            <aside className="sidebar">
                <div className="logo">
                    <span className="logo-icon">☕</span>
                    <span className="logo-text">DemirkiranCAFE</span>
                </div>

                <div className="room-info">
                    <div className="room-name">Ana Oda</div>
                    <div className="room-status">
                        {roomStatus === 'connected' ? (
                            <span className="status-connected">● Bağlı</span>
                        ) : (
                            <span className="status-disconnected">○ Bağlı Değil</span>
                        )}
                    </div>
                </div>

                <div className="users-section">
                    <h3>Kullanıcılar</h3>
                    {isConnected && (
                        <div className="user-item">
                            <span className="user-avatar">👤</span>
                            <span className="user-name">{username}</span>
                            <span className="user-speaking">🎤</span>
                        </div>
                    )}
                </div>

                <div className="sidebar-footer">
                    {isElectron && (
                        <div className="electron-badge">
                            🖥️ Electron Uygulaması
                        </div>
                    )}
                </div>
            </aside>

            {/* Ana İçerik - Video Grid veya Bağlantı Ekranı */}
            <main className="main-content">
                {!isConnected ? (
                    <div className="connect-screen">
                        <div className="connect-card">
                            <h1>Hoş Geldin!</h1>
                            <p>Odaya katılmak için kullanıcı adını gir</p>

                            <input
                                type="text"
                                placeholder="Kullanıcı Adı"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                                className="username-input"
                            />

                            <button
                                onClick={handleConnect}
                                className="connect-button"
                                disabled={roomStatus === 'connecting'}
                            >
                                {roomStatus === 'connecting' ? 'Bağlanıyor...' : 'Odaya Katıl'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="room-view">
                        <div className="video-grid">
                            {/* Video elementleri buraya gelecek */}
                            <div className="video-placeholder">
                                <div className="placeholder-avatar">👤</div>
                                <div className="placeholder-name">{username}</div>
                                <div className="placeholder-text">Kamera kapalı</div>
                            </div>
                        </div>

                        {/* Alt Kontrol Çubuğu */}
                        <div className="control-bar">
                            <button className="control-button mic-button" title="Mikrofon">
                                🎤
                            </button>
                            <button className="control-button camera-button" title="Kamera">
                                📷
                            </button>
                            <button className="control-button screen-button" title="Ekran Paylaş">
                                🖥️
                            </button>
                            <button className="control-button leave-button" title="Ayrıl" onClick={() => setIsConnected(false)}>
                                📴
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
