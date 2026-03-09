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
    streamUrl?: string;
}

interface QueueItem {
    url: string;
    title: string;
    duration?: string;
    requestedBy: string;
    streamUrl?: string;
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
    // Persist Volume check
    const [localVolume, setLocalVolume] = useState(() => {
        const stored = localStorage.getItem('musicBotVolume');
        return stored ? parseInt(stored) : 70;
    });
    const [localMuted, setLocalMuted] = useState(false);

    // Panel açık/kapalı durumu
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [useIframeFallback, setUseIframeFallback] = useState(false);

    // Sürükleme (drag) state'leri
    const [panelPos, setPanelPos] = useState({ x: 200, y: 150 });
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // Queue Sort Drag n Drop
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
    // YouTube IFrame API & HTML5 Audio
    // ========================
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // YouTube IFrame script'ini yükle
    useEffect(() => {
        if ((window as any).YT) return;
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
    }, []);

    // Şarkı değiştiğinde fallback state'ini sıfırla
    useEffect(() => {
        setUseIframeFallback(false);
    }, [nowPlaying?.url]);

    // Şarkı değiştiğinde oynatıcıları güncelle
    useEffect(() => {
        if (!nowPlaying) {
            // İkisi de kapatılsın
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.destroy(); } catch { }
                ytPlayerRef.current = null;
            }
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
            return;
        }

        // 1. Yeni Yöntem: Arka kapıdan gelen direkt HTML5 Ses akışı (Piped API vb.)
        if (nowPlaying.streamUrl && !useIframeFallback) {
            // IFrame varsa yok et
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.destroy(); } catch { }
                ytPlayerRef.current = null;
            }

            // HTML5 Audio ayarla
            if (!audioRef.current) {
                audioRef.current = new Audio(nowPlaying.streamUrl);
            } else {
                audioRef.current.src = nowPlaying.streamUrl;
            }

            const audio = audioRef.current;
            audio.crossOrigin = "anonymous";
            audio.volume = localMuted || isDeafened ? 0 : localVolume / 100;

            // Senkronizasyon (İleri sarma)
            if (nowPlaying.startedAt) {
                const elapsed = (Date.now() - nowPlaying.startedAt - totalPausedDurationRef.current) / 1000;
                if (elapsed > 2) audio.currentTime = elapsed;
            }

            audio.onended = () => {
                if (socket && nowPlaying?.url) socket.emit('music-ended', { url: nowPlaying.url });
            };
            audio.onplay = () => setIsPlaying(true);
            audio.onpause = () => setIsPlaying(false);
            audio.onerror = (e) => {
                console.error("HTML5 Audio Error fallback to IFrame", e);
                // HTML5 oynayamazsa veya stream patlarsa fallback olarak IFrame'i tetikle
                setStatusMessage('⚠️ Ses akışı kesildi, IFrame\'e geçiliyor...');
                setTimeout(() => setStatusMessage(''), 3000);
                // IFrame kurmayı dene
                setUseIframeFallback(true);
            };

            audio.play().catch(err => {
                console.warn("Audio play blocked", err);
                setStatusMessage('⚠️ Otomatik oynatma engellendi, oynat tuşuna basın.');
                setTimeout(() => setStatusMessage(''), 3000);
            });

            setIsPlaying(true);
            return;
        }

        // 2. Fallback Eski Yöntem: YouTube IFrame Modu (Eğer streamUrl yoksa)
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
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
                host: 'https://www.youtube-nocookie.com', // Embed kısıtlamalarını atlamak için nocookie domain
                playerVars: {
                    autoplay: 1, controls: 1, modestbranding: 1,
                    rel: 0, playsinline: 1, enablejsapi: 1,
                    origin: window.location.origin,
                },
                events: {
                    onReady: (event: any) => {
                        // Electron production fix: YT.Player tarafından oluşturulan iframe'e
                        // gerekli 'allow' özelliklerini enjekte et
                        try {
                            const iframe = document.querySelector('#yt-music-player iframe, iframe#yt-music-player') as HTMLIFrameElement;
                            if (iframe) {
                                iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
                            }
                        } catch { }

                        event.target.setVolume(localVolume);
                        if (localMuted || isDeafened || localVolume === 0) {
                            event.target.mute();
                        } else {
                            event.target.unMute();
                        }
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
                            if (socket && nowPlaying?.url) socket.emit('music-ended', { url: nowPlaying.url });
                        } else if (event.data === YT.PlayerState.PLAYING) {
                            setIsPlaying(true);
                        } else if (event.data === YT.PlayerState.PAUSED) {
                            setIsPlaying(false);
                        }
                    },
                    onError: (event: any) => {
                        const errorCode = event.data;
                        console.error('YouTube Player Error:', errorCode);

                        // Kullanıcıya neden atlandığını göster
                        const errorMessages: Record<number, string> = {
                            2: '❌ Geçersiz video ID\'si',
                            5: '❌ HTML5 oynatıcı hatası',
                            100: '❌ Bu video bulunamadı veya kaldırılmış',
                            101: '⚠️ Şarkı IFrame\'de çalınamıyor (Telif), atlamak için "⏭" tuşuna basın.',
                            150: '⚠️ Şarkı IFrame\'de çalınamıyor (Telif), atlamak için "⏭" tuşuna basın.',
                        };
                        setStatusMessage(errorMessages[errorCode] || `❌ YouTube Hatası: ${errorCode}`);
                        setTimeout(() => setStatusMessage(''), 5000);

                        // NOT: Manuel olarak atlamaları tercih ederiz. global skipten kaçınmak için.
                        // handleSkip(); 
                    },
                },
            });
        };

        if ((window as any).YT && (window as any).YT.Player) {
            createPlayer();
        } else {
            (window as any).onYouTubeIframeAPIReady = createPlayer;
        }
    }, [nowPlaying?.url, nowPlaying?.streamUrl, nowPlaying?.startedAt, useIframeFallback]);

    // Ses seviyesi ve mute kontrolü
    useEffect(() => {
        const isMuted = localMuted || isDeafened || localVolume === 0;

        // Save local setting to persist
        localStorage.setItem('musicBotVolume', localVolume.toString());

        // IFrame Volume
        if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === 'function') {
            ytPlayerRef.current.setVolume(localVolume);
            if (isMuted) {
                ytPlayerRef.current.mute();
            } else {
                ytPlayerRef.current.unMute();
            }
        }

        // HTML5 Audio Volume
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? 0 : localVolume / 100;
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

            // IFrame Sync
            if (ytPlayerRef.current) {
                try {
                    if (shouldPlay && typeof ytPlayerRef.current.playVideo === 'function') {
                        ytPlayerRef.current.playVideo();
                    } else if (!shouldPlay && data.nowPlaying && typeof ytPlayerRef.current.pauseVideo === 'function') {
                        ytPlayerRef.current.pauseVideo();
                    }
                } catch { }
            }

            // HTML5 Audio Sync
            if (audioRef.current) {
                try {
                    if (shouldPlay) {
                        audioRef.current.play().catch(() => { });
                    } else {
                        audioRef.current.pause();
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

    const handleSort = useCallback(async (oldIndex: number, newIndex: number) => {
        if (oldIndex === newIndex) return;

        // Optimistic UI Update so visual drag finishes immediately without lag
        const newD = [...queue];
        const [movedItem] = newD.splice(oldIndex, 1);
        newD.splice(newIndex, 0, movedItem);
        setQueue(newD);

        const result = await request<{ oldIndex: number, newIndex: number }, any>('music-move', { oldIndex, newIndex });
        if (result?.message) setStatusMessage(result.message);
        setTimeout(() => setStatusMessage(''), 3000);
    }, [queue, request]);

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
                🎵 {nowPlaying ? `${nowPlaying.title.slice(0, 20)}${nowPlaying.title.length > 20 ? '...' : ''} (👤 ${nowPlaying.requestedBy})` : 'Müzik Botu'}
            </button>

            {/* YouTube Player - HER ZAMAN DOM'da, asla unmount edilmez */}
            <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden', pointerEvents: 'none' }}>
                <div id="yt-music-player"></div>
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
                                <div
                                    key={`${i}-${item.title}`}
                                    className={`music-panel-queue-item ${draggingIndex === i ? 'dragging' : ''} ${dragOverIndex === i ? 'drag-over' : ''}`}
                                    draggable
                                    onDragStart={(e) => {
                                        setDraggingIndex(i);
                                        // required for firefox 
                                        e.dataTransfer.setData('text/plain', i.toString());
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        if (dragOverIndex !== i) setDragOverIndex(i);
                                    }}
                                    onDragLeave={(e) => {
                                        e.preventDefault();
                                        if (dragOverIndex === i) setDragOverIndex(null);
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (draggingIndex !== null && draggingIndex !== i) {
                                            handleSort(draggingIndex, i);
                                        }
                                        setDraggingIndex(null);
                                        setDragOverIndex(null);
                                    }}
                                    onDragEnd={() => {
                                        setDraggingIndex(null);
                                        setDragOverIndex(null);
                                    }}
                                >
                                    <span className="queue-idx">{i + 1}.</span>
                                    <span className="queue-name">{item.title}</span>
                                    <span className="queue-by">👤 {item.requestedBy}</span>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                        <button
                                            onClick={() => handleRemove(i)}
                                            className="panel-ctrl-btn danger"
                                            style={{ width: '20px', height: '20px', padding: 0, fontSize: '10px' }}
                                            title="Kuyruktan Çıkar"
                                        >
                                            ✕
                                        </button>
                                        <div
                                            title="Tut ve sürükle"
                                            style={{ cursor: 'grab', fontSize: '14px', color: '#94a3b8', padding: '0 4px', userSelect: 'none' }}
                                        >
                                            ☰
                                        </div>
                                    </div>
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
