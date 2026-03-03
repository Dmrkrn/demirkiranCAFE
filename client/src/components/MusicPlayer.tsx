import { useState, useEffect, useCallback, useRef } from 'react';
import './MusicPlayer.css';

interface MusicPlayerProps {
    socket: any;
    request: <T, R>(event: string, data?: T) => Promise<R>;
    isDeafened?: boolean;
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

function extractVideoId(url: string): string | null {
    try {
        const u = new URL(url);
        if (u.hostname.includes('youtu.be')) {
            return u.pathname.slice(1).split('/')[0];
        }
        if (u.hostname.includes('youtube.com')) {
            if (u.pathname.startsWith('/embed/')) {
                return u.pathname.split('/embed/')[1]?.split('?')[0] || null;
            }
            return u.searchParams.get('v');
        }
    } catch { }
    return null;
}

export function MusicPlayer({
    socket, request, isDeafened = false,
}: MusicPlayerProps) {
    const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
    const [queue, setQueue] = useState<QueueItem[]>([]);

    const [isPlaying, setIsPlaying] = useState(false);
    const [localVolume, setLocalVolume] = useState(70);
    const [localMuted, setLocalMuted] = useState(false);

    // Panel açık/kapalı durumu
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    // Sürükleme (drag) state'leri
    const [panelPos, setPanelPos] = useState({ x: 200, y: 150 });
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const ytPlayerRef = useRef<any>(null);
    const totalPausedDurationRef = useRef<number>(0);

    // ========================
    // Drag İşlemleri
    // ========================
    const handleDragStart = useCallback((e: React.MouseEvent) => {
        isDragging.current = true;
        dragOffset.current = {
            x: e.clientX - panelPos.x,
            y: e.clientY - panelPos.y,
        };
        e.preventDefault();
    }, [panelPos]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            setPanelPos({
                x: Math.max(0, Math.min(window.innerWidth - 360, e.clientX - dragOffset.current.x)),
                y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y)),
            });
        };
        const handleMouseUp = () => {
            isDragging.current = false;
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // ========================
    // YouTube IFrame API
    // ========================
    useEffect(() => {
        if ((window as any).YT) return;
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    }, []);

    useEffect(() => {
        if (!nowPlaying) {
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.destroy(); } catch { }
                ytPlayerRef.current = null;
            }
            return;
        }

        const videoId = extractVideoId(nowPlaying.url);
        if (!videoId) return;

        const createPlayer = () => {
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.destroy(); } catch { }
                ytPlayerRef.current = null;
            }

            ytPlayerRef.current = new (window as any).YT.Player('yt-music-player', {
                height: '140',
                width: '100%',
                videoId: videoId,
                playerVars: {
                    autoplay: 1, controls: 1, modestbranding: 1,
                    rel: 0, playsinline: 1, enablejsapi: 1,
                    origin: window.location.origin,
                },
                events: {
                    onReady: (event: any) => {
                        event.target.setVolume(localVolume);
                        if (localMuted || isDeafened) { event.target.mute(); } else { event.target.unMute(); }
                        event.target.playVideo();
                        setIsPlaying(true);
                        if (nowPlaying?.startedAt) {
                            const elapsed = (Date.now() - nowPlaying.startedAt - totalPausedDurationRef.current) / 1000;
                            if (elapsed > 2) event.target.seekTo(elapsed, true);
                        }
                    },
                    onStateChange: (event: any) => {
                        const YT = (window as any).YT;
                        if (event.data === YT.PlayerState.ENDED) {
                            if (socket) socket.emit('music-ended');
                        } else if (event.data === YT.PlayerState.PLAYING) {
                            setIsPlaying(true);
                        } else if (event.data === YT.PlayerState.PAUSED) {
                            setIsPlaying(false);
                        }
                    },
                    onError: (event: any) => {
                        console.error('YouTube Player Error:', event.data);
                        handleSkip();
                    },
                },
            });
        };

        if ((window as any).YT && (window as any).YT.Player) {
            createPlayer();
        } else {
            (window as any).onYouTubeIframeAPIReady = createPlayer;
        }
    }, [nowPlaying?.url]);

    useEffect(() => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
            ytPlayerRef.current.setVolume(localVolume);
            if (localMuted || isDeafened) { ytPlayerRef.current.mute(); } else { ytPlayerRef.current.unMute(); }
        }
    }, [localVolume, localMuted, isDeafened]);

    // ========================
    // Socket Events
    // ========================
    useEffect(() => {
        if (!socket) return;

        const handleNowPlaying = (data: { nowPlaying: NowPlaying | null, isPaused: boolean }) => {
            setNowPlaying(data.nowPlaying);
            const shouldPlay = !!data.nowPlaying && !data.isPaused;
            setIsPlaying(shouldPlay);
            if (ytPlayerRef.current) {
                try {
                    if (shouldPlay && typeof ytPlayerRef.current.playVideo === 'function') {
                        ytPlayerRef.current.playVideo();
                    } else if (!shouldPlay && data.nowPlaying && typeof ytPlayerRef.current.pauseVideo === 'function') {
                        ytPlayerRef.current.pauseVideo();
                    }
                } catch { }
            }
        };

        const handleQueueUpdate = (data: { queue: QueueItem[] }) => {
            setQueue(data.queue || []);
        };

        socket.on('music-now-playing', handleNowPlaying);
        socket.on('music-queue-update', handleQueueUpdate);

        request<any, any>('music-queue').then((data: any) => {
            if (data) {
                setNowPlaying(data.nowPlaying);
                setQueue(data.queue || []);
                setIsPlaying(!!data.nowPlaying && !data.isPaused);
                totalPausedDurationRef.current = data.totalPausedDuration || 0;
            }
        }).catch(() => { });

        return () => {
            socket.off('music-now-playing', handleNowPlaying);
            socket.off('music-queue-update', handleQueueUpdate);
        };
    }, [socket, request]);

    // ========================
    // Actions
    // ========================
    const handlePlayRequest = useCallback(async () => {
        if (!urlInput.trim()) return;
        setIsLoading(true);
        setStatusMessage('🔍 Şarkı aranıyor...');
        try {
            const result = await request<{ url: string }, any>('music-play', { url: urlInput.trim() });
            setStatusMessage(result?.message || '');
            setUrlInput('');
        } catch {
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

    const handleRemove = useCallback(async (index: number) => {
        const result = await request<{ index: number }, any>('music-remove', { index });
        setStatusMessage(result?.message || '');
        setTimeout(() => setStatusMessage(''), 3000);
    }, [request]);

    const handleStop = useCallback(async () => {
        const result = await request<any, any>('music-stop');
        setStatusMessage(result?.message || '');
        setTimeout(() => setStatusMessage(''), 3000);
    }, [request]);

    const togglePlayPause = useCallback(async () => {
        if (!nowPlaying) return;
        if (ytPlayerRef.current) {
            try {
                if (isPlaying) { ytPlayerRef.current.pauseVideo(); } else { ytPlayerRef.current.playVideo(); }
            } catch { }
        }
        await request<any, any>('music-pause');
        setIsPlaying(!isPlaying);
    }, [isPlaying, nowPlaying, request]);

    // ========================
    // Render
    // ========================
    return (
        <>
            {/* Sidebar Butonu */}
            <button
                className={`room-btn ${nowPlaying ? 'has-music' : ''}`}
                onClick={() => setIsPanelOpen(!isPanelOpen)}
                style={{
                    padding: '5px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    background: isPanelOpen ? '#6d28d9' : '#44337a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    width: '100%',
                }}
            >
                🎵 {nowPlaying ? nowPlaying.title.slice(0, 20) + (nowPlaying.title.length > 20 ? '...' : '') : 'Müzik Botu'}
            </button>

            {/* YouTube Player - HER ZAMAN DOM'da, asla unmount edilmez */}
            <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden', pointerEvents: 'none' }}>
                <div id="yt-music-player" />
            </div>

            {/* Sürüklenebilir Panel */}
            {isPanelOpen && (
                <div
                    className="music-panel"
                    style={{
                        left: panelPos.x,
                        top: panelPos.y,
                    }}
                >
                    {/* Başlık Çubuğu (Sürükle + Kapat) */}
                    <div
                        className="music-panel-header"
                        onMouseDown={handleDragStart}
                    >
                        <span className="music-panel-title">
                            🎵 Müzik Botu
                        </span>
                        <div className="music-panel-header-controls">
                            {nowPlaying && (
                                <>
                                    <button onClick={togglePlayPause} className="panel-ctrl-btn" title="Duraklat/Devam">
                                        {isPlaying ? '⏸' : '▶'}
                                    </button>
                                    <button onClick={handleSkip} className="panel-ctrl-btn" title="Atla">⏭</button>
                                    <button onClick={handleStop} className="panel-ctrl-btn danger" title="Durdur">⏹</button>
                                </>
                            )}
                            <button
                                onClick={() => setIsPanelOpen(false)}
                                className="panel-ctrl-btn close"
                                title="Alta Al"
                            >✕</button>
                        </div>
                    </div>

                    {/* Now Playing Bilgisi (YouTube player gizli div'de çalıyor) */}
                    {nowPlaying && (
                        <div className="music-panel-now-playing">
                            <div className="music-panel-track-info">
                                <div className="music-panel-track-title">{nowPlaying.title}</div>
                                <div className="music-panel-track-requester">👤 {nowPlaying.requestedBy}</div>
                            </div>
                        </div>
                    )}

                    {/* Volume */}
                    <div className="music-panel-volume">
                        <button
                            onClick={() => setLocalMuted(!localMuted)}
                            className="panel-ctrl-btn"
                            style={{ fontSize: '14px' }}
                        >
                            {localMuted || isDeafened ? '🔇' : localVolume > 50 ? '🔊' : '🔉'}
                        </button>
                        <input
                            type="range" min="0" max="100"
                            value={localVolume}
                            onChange={(e) => setLocalVolume(parseInt(e.target.value))}
                            className="music-volume-slider"
                        />
                        <span className="volume-value">{localVolume}%</span>
                    </div>

                    {/* Şarkı Ekle */}
                    <div className="music-panel-input">
                        <input
                            type="text"
                            placeholder="Şarkı adı veya YouTube linki..."
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePlayRequest()}
                            disabled={isLoading}
                        />
                        <button onClick={handlePlayRequest} disabled={isLoading || !urlInput.trim()} className="panel-ctrl-btn add">
                            {isLoading ? '⏳' : '▶'}
                        </button>
                    </div>

                    {statusMessage && <div className="music-panel-status">{statusMessage}</div>}

                    {/* Queue */}
                    {queue.length > 0 && (
                        <div className="music-panel-queue">
                            <div className="music-panel-queue-label">📋 Sırada ({queue.length})</div>
                            {queue.map((item, i) => (
                                <div key={i} className="music-panel-queue-item">
                                    <span className="queue-idx">{i + 1}.</span>
                                    <span className="queue-name">{item.title}</span>
                                    <span className="queue-by">👤 {item.requestedBy}</span>
                                    <button
                                        onClick={() => handleRemove(i)}
                                        className="panel-ctrl-btn danger"
                                        style={{ width: '20px', height: '20px', padding: 0, fontSize: '10px', marginLeft: 'auto' }}
                                        title="Kuyruktan Çıkar"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {!nowPlaying && !queue.length && (
                        <div className="music-panel-empty">
                            Henüz müzik yok. Yukarıdan bir şarkı ekle!
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
