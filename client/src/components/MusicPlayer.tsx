import { useState, useEffect, useCallback, useRef } from 'react';
import ReactPlayer from 'react-player';
import './MusicPlayer.css';

interface MusicPlayerProps {
    socket: any;
    request: <T, R>(event: string, data?: T) => Promise<R>;
    // Ses artık react-player ile kendi üzerinde olduğu için ekstra app.tsx'e bağlamamıza gerek yok, kendi volümü yönetiyoruz
    botVolume?: number;
    botMuted?: boolean;
    onBotVolumeChange?: (volume: number) => void;
    onBotMutedChange?: (muted: boolean) => void;
}

interface NowPlaying {
    title: string;
    url: string;
    thumbnail?: string;
    requestedBy: string;
    startedAt: number;
}

interface QueueItem {
    url: string;
    title: string;
    duration?: string;
    requestedBy: string;
}

/**
 * MusicPlayer - Embedded Discord-Style Visual MP3 Bot
 * 
 * Sunucu tarafını tamamen hafiflettik! Artık videolar sunucuda inme veya ffmpeg ile çevrilme ile 
 * uğraşmıyor. Şarkı listesi sunucudan Socket üzerinden dağılıyor ve "bu bilgisayardaki" 
 * React Player üzerinden pürüzsüz orijinal YouTube sesiyle anında çalıyor.
 */
export function MusicPlayer({
    socket, request,
}: MusicPlayerProps) {
    const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
    const [queue, setQueue] = useState<QueueItem[]>([]);

    // Player durumları
    const [isPlaying, setIsPlaying] = useState(false);
    const [isServerPaused, setIsServerPaused] = useState(false);
    const [localVolume, setLocalVolume] = useState(70);
    const [localMuted, setLocalMuted] = useState(false);

    // UI durumları
    const [isExpanded, setIsExpanded] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    const playerRef = useRef<any>(null);

    // Socket event listener'ları
    useEffect(() => {
        if (!socket) return;

        const handleNowPlaying = (data: { nowPlaying: NowPlaying | null, isPaused: boolean }) => {
            setNowPlaying(data.nowPlaying);
            setIsServerPaused(data.isPaused || false);
            // Eğer müzik varsa ve sunucu duraklatmadıysa çal
            setIsPlaying(!!data.nowPlaying && !data.isPaused);
        };

        const handleQueueUpdate = (data: { queue: QueueItem[], isPaused: boolean }) => {
            setQueue(data.queue || []);
        };

        socket.on('music-now-playing', handleNowPlaying);
        socket.on('music-queue-update', handleQueueUpdate);

        // İlk yüklemede mevcut durumu al
        request<any, any>('music-queue').then((data: any) => {
            if (data) {
                setNowPlaying(data.nowPlaying);
                setQueue(data.queue || []);
                setIsServerPaused(data.isPaused || false);
                setIsPlaying(!!data.nowPlaying && !data.isPaused);
            }
        }).catch(() => { });

        return () => {
            socket.off('music-now-playing', handleNowPlaying);
            socket.off('music-queue-update', handleQueueUpdate);
        };
    }, [socket, request]);

    const handlePlayRequest = useCallback(async () => {
        if (!urlInput.trim()) return;
        setIsLoading(true);
        setStatusMessage('🔍 Şarkı aranıyor...');
        try {
            const result = await request<{ url: string }, any>('music-play', { url: urlInput.trim() });
            setStatusMessage(result?.message || '');
            setUrlInput('');
        } catch (err) {
            setStatusMessage('❌ Şarkı çalınamadı');
        }
        setIsLoading(false);
        setTimeout(() => setStatusMessage(''), 5000);
    }, [urlInput, request]);

    const handleSkip = useCallback(async () => {
        const result = await request<any, any>('music-skip');
        setStatusMessage(result?.message || '');
        setTimeout(() => setStatusMessage(''), 3000);
    }, [request]);

    const handleStop = useCallback(async () => {
        const result = await request<any, any>('music-stop');
        setStatusMessage(result?.message || '');
        setTimeout(() => setStatusMessage(''), 3000);
    }, [request]);

    const handlePause = useCallback(async () => {
        const result = await request<any, any>('music-pause');
        setStatusMessage(result?.message || '');
        setTimeout(() => setStatusMessage(''), 3000);
    }, [request]);

    // React Player Music Bittiğinde sunucuya sıradakini açmasını söyle
    const handleMusicEnded = () => {
        if (socket) {
            socket.emit('music-ended');
        }
    };

    return (
        <div className={`music-player ${isExpanded ? 'expanded' : ''}`}>
            {/* Görünmez (veya minik widget) React YouTube Player */}
            {nowPlaying && (
                <div style={{ display: isExpanded ? 'block' : 'none', width: '100%', height: '120px', borderRadius: '8px', overflow: 'hidden', marginBottom: '10px' }}>
                    <ReactPlayer
                        ref={playerRef}
                        url={nowPlaying.url}
                        playing={isPlaying}
                        volume={localVolume / 100}
                        muted={localMuted}
                        onEnded={handleMusicEnded}
                        onError={(e) => {
                            console.error("Player Hatası", e);
                            handleSkip(); // Hata varsa otopass geç
                        }}
                        width="100%"
                        height="100%"
                        controls={true} // Elfsight widget tarzı kendi UI'sı olsun
                        config={{
                            youtube: {
                                // @ts-ignore - react-player type definitions
                                playerVars: { showinfo: 0, rel: 0, autoplay: 1 }
                            }
                        }}
                    />
                </div>
            )}

            {/* Compact Bar */}
            <div className="music-player-bar" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="music-player-icon">
                    {nowPlaying ? (
                        <div className="spinning-disc" style={{
                            backgroundImage: nowPlaying.thumbnail ? `url(${nowPlaying.thumbnail})` : 'none',
                            animationPlayState: isPlaying ? 'running' : 'paused'
                        }}>🎵</div>
                    ) : (
                        <span className="music-icon">🎵</span>
                    )}
                </div>
                <div className="music-player-info">
                    {nowPlaying ? (
                        <>
                            <span className="music-title">{nowPlaying.title}</span>
                            <span className="music-requester" style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                • {nowPlaying.requestedBy} | Cihazda Çalıyor
                            </span>
                        </>
                    ) : (
                        <span className="music-idle">Müzik Botu (Cihaz Oynatıcısı)</span>
                    )}
                </div>

                <div className="music-controls-mini" onClick={(e) => e.stopPropagation()}>
                    {nowPlaying && (
                        <>
                            <button onClick={handlePause} title="Duraklat/Devam" className="neon-btn">
                                {isServerPaused ? '▶️' : '⏸️'}
                            </button>
                            <button onClick={handleSkip} title="Atla" className="neon-btn">⏭️</button>
                            <button onClick={handleStop} title="Durdur" className="neon-btn danger">⏹️</button>
                        </>
                    )}
                </div>
            </div>

            {/* Expanded Panel */}
            {isExpanded && (
                <div className="music-player-expanded">
                    {/* Local Volume Control (Sadece bu bilgisayarın sesini ayarlar) */}
                    <div className="music-volume-row">
                        <button
                            className="volume-label"
                            onClick={() => setLocalMuted(!localMuted)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                            {localMuted ? '🔇' : localVolume > 50 ? '🔊' : '🔉'}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={localVolume}
                            onChange={(e) => setLocalVolume(parseInt(e.target.value))}
                            className="music-volume-slider"
                            title={`Cihaz Sesi: ${localVolume}%`}
                        />
                        <span className="volume-value">{localVolume}%</span>
                    </div>

                    {/* URL Input */}
                    <div className="music-input-row">
                        <input
                            type="text"
                            placeholder="Şarkı adı, YT veya Spotify linki..."
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePlayRequest()}
                            disabled={isLoading}
                        />
                        <button onClick={handlePlayRequest} disabled={isLoading || !urlInput.trim()} className="neon-btn">
                            {isLoading ? '⏳' : '▶️'}
                        </button>
                    </div>

                    {statusMessage && <div className="music-status">{statusMessage}</div>}

                    {queue.length > 0 && (
                        <div className="music-queue">
                            <div className="music-queue-label">📋 Sırada Bekleyenler ({queue.length})</div>
                            {queue.map((item, i) => (
                                <div key={i} className="music-queue-item">
                                    <span className="queue-index">{i + 1}.</span>
                                    <div className="queue-details">
                                        <span className="queue-title">{item.title}</span>
                                        <span className="queue-duration">{item.duration || 'Bilinmiyor'}</span>
                                    </div>
                                    <span className="queue-req">👤 {item.requestedBy}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
