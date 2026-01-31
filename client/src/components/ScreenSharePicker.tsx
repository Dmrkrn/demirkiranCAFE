/**
 * ScreenSharePicker Bileşeni
 * ==========================
 * 
 * Ekran paylaşımı için kaynak seçim modal'ı.
 * Discord'daki "Hangi ekranı paylaşmak istersin?" ekranı gibi.
 */

import { useEffect, useState } from 'react';
import './ScreenSharePicker.css';

interface DesktopSource {
    id: string;
    name: string;
    thumbnail: string;
}

interface ScreenSharePickerProps {
    sources: DesktopSource[];
    onSelect: (sourceId: string) => void;
    onCancel: () => void;
}

export function ScreenSharePicker({ sources, onSelect, onCancel }: ScreenSharePickerProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'screen' | 'window'>('all');

    // Escape tuşu ile kapat
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    // Kaynakları filtrele
    const filteredSources = sources.filter(source => {
        if (filter === 'all') return true;
        if (filter === 'screen') return source.name.toLowerCase().includes('screen') || source.name.toLowerCase().includes('ekran');
        if (filter === 'window') return !source.name.toLowerCase().includes('screen') && !source.name.toLowerCase().includes('ekran');
        return true;
    });

    const handleShare = () => {
        if (selectedId) {
            onSelect(selectedId);
        }
    };

    return (
        <div className="screen-picker-overlay" onClick={onCancel}>
            <div className="screen-picker-modal" onClick={e => e.stopPropagation()}>
                <div className="screen-picker-header">
                    <h2>🖥️ Ekran Paylaş</h2>
                    <p>Hangi ekran veya pencereyi paylaşmak istiyorsun?</p>
                </div>

                <div className="screen-picker-filters">
                    <button
                        className={`filter-button ${filter === 'all' ? 'active' : ''}`}
                        onClick={() => setFilter('all')}
                    >
                        Tümü
                    </button>
                    <button
                        className={`filter-button ${filter === 'screen' ? 'active' : ''}`}
                        onClick={() => setFilter('screen')}
                    >
                        Ekranlar
                    </button>
                    <button
                        className={`filter-button ${filter === 'window' ? 'active' : ''}`}
                        onClick={() => setFilter('window')}
                    >
                        Pencereler
                    </button>
                </div>

                <div className="screen-picker-grid">
                    {filteredSources.length === 0 ? (
                        <div className="no-sources">
                            <span>😕</span>
                            <p>Paylaşılabilir kaynak bulunamadı</p>
                        </div>
                    ) : (
                        filteredSources.map(source => (
                            <div
                                key={source.id}
                                className={`source-item ${selectedId === source.id ? 'selected' : ''}`}
                                onClick={() => setSelectedId(source.id)}
                            >
                                <div className="source-thumbnail">
                                    <img src={source.thumbnail} alt={source.name} />
                                </div>
                                <div className="source-name" title={source.name}>
                                    {source.name}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="screen-picker-footer">
                    <button className="cancel-button" onClick={onCancel}>
                        İptal
                    </button>
                    <button
                        className="share-button"
                        onClick={handleShare}
                        disabled={!selectedId}
                    >
                        Paylaş
                    </button>
                </div>
            </div>
        </div>
    );
}
