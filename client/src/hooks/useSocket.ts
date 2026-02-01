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

// Sunucu adresi (geliştirme için localhost)
const SERVER_URL = 'http://localhost:3000';

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
}

export function useSocket(): UseSocketReturn {
    const socketRef = useRef<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [clientId, setClientId] = useState<string | null>(null);

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
        });

        // Yeni kullanıcı katıldığında
        socket.on('peer-joined', (data: { peerId: string }) => {
            console.log('👤 Yeni kullanıcı katıldı:', data.peerId);
        });

        // Kullanıcı ayrıldığında
        socket.on('peer-left', (data: { peerId: string }) => {
            console.log('👋 Kullanıcı ayrıldı:', data.peerId);
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
        emit,
        request,
        onChatMessage,
    };
}
