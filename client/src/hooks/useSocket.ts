/**
 * useSocket Hook
 * ===============
 * 
 * Bu hook, Socket.io bağlantısını yönetir.
 * 
 * WebSocket bağlantısı şu şekilde çalışır:
 * 1. Client, sunucuya bağlanır
 * 2. Sunucu "welcome" mesajı gönderir
 * 3. Client, gerekli event'leri dinlemeye başlar
 * 4. İki taraf da mesaj gönderip alabilir
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Sunucu adresi (Nginx Reverse Proxy üzerinden)
const SERVER_URL = 'https://cafe.cagridemirkiran.com';

interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    message: string;
    timestamp: string;
}

interface UseSocketReturn {
    socket: Socket | null;
    isConnected: boolean;
    clientId: string | null;

    // Socket metodları
    emit: <T>(event: string, data?: T) => void;
    request: <T, R>(event: string, data?: T) => Promise<R>;

    // Chat event listener
    onChatMessage: (callback: (msg: ChatMessage) => void) => () => void;

    // Users
    peers: Array<{ id: string; username: string; deviceId?: string; isMicMuted?: boolean; isDeafened?: boolean; roomId?: string }>;
    fetchPeers: () => Promise<void>;
    // updatePeerStatus sadece local state'i değil, sunucuyu da güncellesin diye ismini değiştirelim veya yeni metod ekleyelim
    // conflict olmaması için: sendStatusUpdate diyelim
    sendStatusUpdate: (status: { isMicMuted?: boolean; isDeafened?: boolean }) => void;
}

export function useSocket(): UseSocketReturn {
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [clientId, setClientId] = useState<string | null>(null);

    // Peer listesi
    const [peers, setPeers] = useState<Array<{ id: string; username: string; deviceId?: string; isMicMuted?: boolean; isDeafened?: boolean; roomId?: string }>>([]);

    /**
     * Peer durumunu güncelle (App.tsx'ten çağrılacak)
     */
    /**
     * Peer durumunu güncelle (Local State + Server Emit)
     */
    const sendStatusUpdate = useCallback((status: { isMicMuted?: boolean; isDeafened?: boolean }) => {
        // 1. Sunucuya bildir
        if (socketRef.current?.connected) {
            socketRef.current.emit('updatePeerStatus', status);
        }
    }, []);

    useEffect(() => {
        // Socket.io bağlantısı oluştur
        const socket = io(SERVER_URL, {
            transports: ['websocket'], // Sadece WebSocket kullan (polling yok)
            autoConnect: true,
        });

        socketRef.current = socket;

        // Bağlantı kurulduğunda
        socket.on('connect', () => {
            console.log('🔌 WebSocket bağlantısı kuruldu!');
            setIsConnected(true);
        });

        // Sunucudan hoşgeldin mesajı
        socket.on('welcome', (data: { message: string; clientId: string }) => {
            console.log('👋 Sunucu mesajı:', data.message);
            console.log('🆔 Client ID:', data.clientId);
            setClientId(data.clientId);
        });

        // Bağlantı koptuğunda
        socket.on('disconnect', (reason) => {
            console.log('❌ Bağlantı koptu:', reason);
            setIsConnected(false);
            setClientId(null);
            setPeers([]); // Peer listesini temizle
        });

        // Yeni kullanıcı katıldığında (veya isim/oda güncellediğinde)
        socket.on('peer-joined', (data: { peerId: string; username: string; deviceId?: string; roomId?: string }) => {
            console.log('👤 Yeni kullanıcı katıldı/güncellendi:', data.peerId, data.username, data.roomId);
            setPeers((prev) => {
                const existingIndex = prev.findIndex(p => p.id === data.peerId);
                if (existingIndex !== -1) {
                    // Varsa güncelle
                    const newPeers = [...prev];
                    newPeers[existingIndex] = { ...newPeers[existingIndex], id: data.peerId, username: data.username, deviceId: data.deviceId, roomId: data.roomId };
                    return newPeers;
                }
                // Yoksa ekle
                return [...prev, { id: data.peerId, username: data.username, deviceId: data.deviceId, roomId: data.roomId }];
            });
        });

        // Kullanıcı ayrıldığında
        socket.on('peer-left', (data: { peerId: string }) => {
            console.log('👋 Kullanıcı ayrıldı:', data.peerId);
            setPeers((prev) => prev.filter(p => p.id !== data.peerId));
        });

        // Kullanıcı durumu güncellendiğinde (Mic/Deafen)
        socket.on('peer-status-update', (data: { peerId: string; status: { isMicMuted?: boolean; isDeafened?: boolean } }) => {
            console.log('🔄 Peer status update:', data.peerId, data.status);
            setPeers(prev => prev.map(p => {
                if (p.id === data.peerId) {
                    return { ...p, ...data.status };
                }
                return p;
            }));
        });

        // Yeni producer (video/ses kaynağı) oluşturulduğunda
        socket.on('new-producer', (data: { producerId: string; peerId: string; kind: string }) => {
            console.log(`📹 Yeni ${data.kind} producer:`, data.producerId, 'from', data.peerId);
        });

        // Bağlantı hatası
        socket.on('connect_error', (error) => {
            console.error('🚨 Bağlantı hatası:', error.message);
        });

        // Component unmount olduğunda bağlantıyı kapat
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    /**
     * Event gönder (Fire-and-forget)
     * Yanıt beklemez
     */
    const emit = useCallback(<T,>(event: string, data?: T) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit(event, data);
        } else {
            console.warn('Socket bağlı değil, mesaj gönderilemedi:', event);
        }
    }, []);

    /**
     * Request gönder ve yanıt bekle
     * Promise döner, async/await ile kullanılabilir
     */
    const request = useCallback(<T, R>(event: string, data?: T): Promise<R> => {
        return new Promise((resolve, reject) => {
            if (!socketRef.current?.connected) {
                reject(new Error('Socket bağlı değil'));
                return;
            }

            // Socket.io'nun callback özelliğini kullan
            socketRef.current.emit(event, data, (response: R | { error: string }) => {
                if (response && typeof response === 'object' && 'error' in response) {
                    reject(new Error(response.error));
                } else {
                    resolve(response as R);
                }
            });
        });
    }, []);

    /**
     * Mevcut kullanıcıları getir
     */
    const fetchPeers = useCallback(async () => {
        try {
            const response = await request<{ users: Array<{ id: string; username: string; deviceId?: string; isMicMuted?: boolean; isDeafened?: boolean }> }, any>('getUsers');
            if (response && response.users) {
                setPeers(response.users);
            }
        } catch (error) {
            console.error('Kullanıcı listesi alınamadı:', error);
        }
    }, [request]);

    /**
     * Chat mesajı dinleyicisi ekle
     * Temizleme fonksiyonu döner
     */
    const onChatMessage = useCallback((callback: (msg: ChatMessage) => void) => {
        const socket = socketRef.current;
        if (socket) {
            socket.on('chat-message', callback);
            return () => {
                socket.off('chat-message', callback);
            };
        }
        return () => { };
    }, []);

    return {
        socket: socketRef.current,
        isConnected,
        clientId,
        peers,
        emit,
        request,
        fetchPeers,
        sendStatusUpdate,
        onChatMessage,
    };
}
