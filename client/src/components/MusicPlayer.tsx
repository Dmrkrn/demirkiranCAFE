import { useState, useEffect, useCallback } from 'react';
import './MusicPlayer.css';

interface MusicPlayerProps {
    socket: any;
    request: <T, R>(event: string, data?: T) => Promise<R>;
    consumeProducer: (producerId: string) => Promise<void>;
}

interface NowPlaying {
    title: string;
    url: string;
    requestedBy: string;
    startedAt: number;
}

interface QueueItem {
    url: string;
    title: string;
    duration?: string;
    requestedBy: string;
}

export function MusicPlayer({ socket, request, consumeProducer }: MusicPlayerProps) {
    const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    // Socket event listener'ları
    useEffect(() => {
        if (!socket) return;

        const handleNowPlaying = (data: { nowPlaying: NowPlaying | null; producerId: string | null }) => {
            setNowPlaying(data.nowPlaying);
            // Producer'ı consume et (müzik sesini duymak için)
            if (data.producerId) {
                consumeProducer(data.producerId).catch(console.error);
            }
        };

        const handleQueueUpdate = (data: { queue: QueueItem[] }) => {
            setQueue(data.queue);
        };

        socket.on('music-now-playing', handleNowPlaying);
        socket.on('music-queue-update', handleQueueUpdate);

        // İlk yüklemede mevcut durumu al
        request<any, any>('music-queue').then((data: any) => {
            if (data) {
                setNowPlaying(data.nowPlaying);
                setQueue(data.queue || []);
            }
        }).catch(() => { });

        // Producer ID'yi al ve consume et
        request<any, any>('music-producer-id').then((data: any) => {
            if (data?.producerId) {
                consumeProducer(data.producerId).catch(console.error);
            }
        }).catch(() => { });

        return () => {
            socket.off('music-now-playing', handleNowPlaying);
            socket.off('music-queue-update', handleQueueUpdate);
        };
    }, [socket]);

    const handlePlay = useCallback(async () => {
        if (!urlInput.trim()) return;
        setIsLoading(true);
        setStatusMessage('🔍 Şarkı aranıyor...');
        try {
            const result = await request<{ url: string }, any>('music-play', { url: urlInput.trim() });
            setStatusMessage(result?.message || '');
            setUrlInput('');
        } catch (error) {
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

    return (
        <div className={`music-player ${isExpanded ? 'expanded' : ''}`}>
            {/* Compact Bar */}
            <div className="music-player-bar" onClick={() => setIsExpanded(!isExpanded)}>
                <div className="music-player-icon">
                    {nowPlaying ? (
                        <span className="music-icon spinning">🎵</span>
                    ) : (
                        <span className="music-icon">🎵</span>
                    )}
                </div>
                <div className="music-player-info">
                    {nowPlaying ? (
                        <>
                            <span className="music-title">{nowPlaying.title}</span>
                            <span className="music-requester">• {nowPlaying.requestedBy}</span>
                        </>
                    ) : (
                        <span className="music-idle">Müzik Botu</span>
                    )}
                </div>
                {nowPlaying && (
                    <div className="music-controls-mini" onClick={(e) => e.stopPropagation()}>
                        <button onClick={handlePause} title="Duraklat/Devam">⏯️</button>
                        <button onClick={handleSkip} title="Atla">⏭️</button>
                        <button onClick={handleStop} title="Durdur">⏹️</button>
                    </div>
                )}
            </div>

            {/* Expanded Panel */}
            {isExpanded && (
                <div className="music-player-expanded">
                    {/* URL Input */}
                    <div className="music-input-row">
                        <input
                            type="text"
                            placeholder="YouTube linki yapıştır..."
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
                            disabled={isLoading}
                        />
                        <button onClick={handlePlay} disabled={isLoading || !urlInput.trim()}>
                            {isLoading ? '⏳' : '▶️'}
                        </button>
                    </div>

                    {/* Status Message */}
                    {statusMessage && (
                        <div className="music-status">{statusMessage}</div>
                    )}

                    {/* Şu an çalan */}
                    {nowPlaying && (
                        <div className="music-now-playing">
                            <div className="music-np-label">🎧 Şu an çalıyor:</div>
                            <div className="music-np-title">{nowPlaying.title}</div>
                            <div className="music-np-by">İsteyen: {nowPlaying.requestedBy}</div>
                        </div>
                    )}

                    {/* Kuyruk */}
                    {queue.length > 0 && (
                        <div className="music-queue">
                            <div className="music-queue-label">📋 Kuyruk ({queue.length})</div>
                            {queue.map((item, i) => (
                                <div key={i} className="music-queue-item">
                                    <span className="queue-index">{i + 1}.</span>
                                    <span className="queue-title">{item.title}</span>
                                    {item.duration && <span className="queue-duration">{item.duration}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
