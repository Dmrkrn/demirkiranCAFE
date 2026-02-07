import React from 'react';

interface LinkifiedTextProps {
    text: string;
}

export const LinkifiedText: React.FC<LinkifiedTextProps> = ({ text }) => {
    // URL regex pattern (simple version)
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;

    const parts = text.split(urlRegex);
    const matches = text.match(urlRegex);

    if (!matches) {
        return <>{text}</>;
    }

    return (
        <>
            {parts.map((part, i) => {
                // If part matches a URL
                if (matches.includes(part)) {
                    const href = part.startsWith('www.') ? `http://${part}` : part;
                    return (
                        <a
                            key={i}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="chat-link"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                // Electron'da harici tarayıcıda aç
                                if (window.electronAPI?.openExternal) {
                                    window.electronAPI.openExternal(href);
                                } else {
                                    // Web'de yeni sekmede aç
                                    window.open(href, '_blank');
                                }
                            }}
                        >
                            {part}
                        </a>
                    );
                }
                // Regular text
                if (!part) return null; // Filter out undefined/empty parts caused by capture groups
                return <span key={i}>{part}</span>;
            })}
        </>
    );
};
