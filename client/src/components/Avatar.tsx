/**
 * Avatar Bileşeni
 * ================
 * 
 * Kullanıcı avatarlarını gösterir.
 * DiceBear API kullanarak kullanıcı adına göre benzersiz avatar oluşturur.
 * 
 * DiceBear Nedir?
 * ---------------
 * Ücretsiz, açık kaynak avatar oluşturma API'si.
 * Kullanıcı adını hash'leyerek her zaman aynı avatarı döndürür.
 * 
 * Stiller:
 * - avataaars: Cartoon tarzı
 * - bottts: Robot tarzı
 * - identicon: GitHub tarzı
 * - initials: Baş harfler
 * - lorelei: Minimalist
 * - pixel-art: Piksel sanat
 */

import { useMemo } from 'react';
import './Avatar.css';

// Avatar stilleri
export type AvatarStyle =
    | 'avataaars'
    | 'bottts'
    | 'identicon'
    | 'initials'
    | 'lorelei'
    | 'pixel-art'
    | 'thumbs';

interface AvatarProps {
    name: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    style?: AvatarStyle;
    isSpeaking?: boolean;
    isOnline?: boolean;
}

// DiceBear API URL'i oluştur
const getAvatarUrl = (name: string, style: AvatarStyle): string => {
    // Kullanıcı adını URL-safe yap
    const seed = encodeURIComponent(name.trim().toLowerCase());
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
};

// Size mapping
const sizeMap = {
    sm: 24,
    md: 32,
    lg: 48,
    xl: 64,
};

export function Avatar({
    name,
    size = 'md',
    style = 'avataaars',
    isSpeaking = false,
    isOnline = true,
}: AvatarProps) {
    // Avatar URL'ini memo'la (gereksiz yeniden oluşturmayı önle)
    const avatarUrl = useMemo(() => getAvatarUrl(name, style), [name, style]);

    const pixelSize = sizeMap[size];

    return (
        <div
            className={`avatar avatar-${size} ${isSpeaking ? 'avatar-speaking' : ''}`}
            style={{ width: pixelSize, height: pixelSize }}
        >
            <img
                src={avatarUrl}
                alt={`${name} avatarı`}
                className="avatar-image"
                loading="lazy"
            />
            {/* Online durumu göstergesi */}
            {isOnline && <span className="avatar-status avatar-online" />}
            {/* Konuşma göstergesi */}
            {isSpeaking && <span className="avatar-speaking-ring" />}
        </div>
    );
}

/**
 * Baş harflerden avatar oluştur (fallback)
 */
export function InitialsAvatar({
    name,
    size = 'md',
    isSpeaking = false,
}: Omit<AvatarProps, 'style'>) {
    const initials = name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    const pixelSize = sizeMap[size];

    // İsme göre renk oluştur
    const hue = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;

    return (
        <div
            className={`avatar avatar-${size} avatar-initials ${isSpeaking ? 'avatar-speaking' : ''}`}
            style={{
                width: pixelSize,
                height: pixelSize,
                backgroundColor: `hsl(${hue}, 60%, 45%)`,
            }}
        >
            <span className="initials-text">{initials}</span>
            {isSpeaking && <span className="avatar-speaking-ring" />}
        </div>
    );
}
