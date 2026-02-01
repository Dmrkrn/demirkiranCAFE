/**
 * ChatPanel Bileşeni
 * ===================
 * 
 * Gerçek zamanlı sohbet paneli.
 * Socket.io üzerinden mesaj gönderir ve alır.
 */

import { useState, useRef, useEffect } from 'react';
import { Avatar } from './Avatar';
import './ChatPanel.css';

interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    message: string;
    timestamp: string;
}

interface ChatPanelProps {
    messages: ChatMessage[];
    onSendMessage: (message: string) => void;
    currentUserId: string;
    isOpen: boolean;
    onClose: () => void;
}

export function ChatPanel({
    messages,
    onSendMessage,
    currentUserId,
    isOpen,
    onClose,
}: ChatPanelProps) {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Yeni mesaj geldiğinde aşağı kaydır
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Panel açıldığında input'a focus
    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus();
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = inputValue.trim();
        if (trimmed) {
            onSendMessage(trimmed);
            setInputValue('');
        }
    };

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    };

    if (!isOpen) return null;

    return (
        <div className="chat-panel">
            <div className="chat-header">
                <h3>💬 Sohbet</h3>
                <button className="chat-close-btn" onClick={onClose}>✕</button>
            </div>

            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="chat-empty">
                        <span>💬</span>
                        <p>Henüz mesaj yok</p>
                        <p className="chat-empty-hint">İlk mesajı sen gönder!</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isOwnMessage = msg.senderId === currentUserId;
                        return (
                            <div
                                key={msg.id}
                                className={`chat-message ${isOwnMessage ? 'own-message' : ''}`}
                            >
                                {!isOwnMessage && (
                                    <Avatar name={msg.senderName} size="sm" />
                                )}
                                <div className="message-content">
                                    {!isOwnMessage && (
                                        <span className="message-sender">{msg.senderName}</span>
                                    )}
                                    <div className="message-bubble">
                                        {msg.message}
                                    </div>
                                    <span className="message-time">{formatTime(msg.timestamp)}</span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={handleSubmit}>
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Mesaj yaz..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="chat-input"
                    maxLength={500}
                />
                <button
                    type="submit"
                    className="chat-send-btn"
                    disabled={!inputValue.trim()}
                >
                    ➤
                </button>
            </form>
        </div>
    );
}
