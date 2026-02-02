import React, { useEffect, useState } from 'react';
import './TitleBar.css';

export const TitleBar: React.FC = () => {
    const [version, setVersion] = useState<string>('');

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.getAppVersion().then(setVersion);
        }
    }, []);
    // Electron ortamında değilsek render etme (Browser fallback)
    if (!window.electronAPI) return null;

    const handleMinimize = () => window.electronAPI?.minimizeWindow();
    const handleMaximize = () => window.electronAPI?.maximizeWindow();
    const handleClose = () => window.electronAPI?.closeWindow();

    return (
        <header className="title-bar">
            <div className="title-bar-drag-region">
                <div className="app-title">
                    DemirkıranCAFE
                    {version && <span style={{ fontSize: '0.7em', opacity: 0.6, marginLeft: '8px' }}>v{version}</span>}
                </div>
            </div>
            <div className="window-controls">
                <button className="control-btn minimize-btn" onClick={handleMinimize} title="Küçült">
                    <svg width="10" height="1"><rect width="10" height="1" fill="currentColor" /></svg>
                </button>
                <button className="control-btn maximize-btn" onClick={handleMaximize} title="Büyüt">
                    <svg width="10" height="10"><rect width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
                </button>
                <button className="control-btn close-btn" onClick={handleClose} title="Kapat">
                    <svg width="10" height="10">
                        <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                </button>
            </div>
        </header>
    );
};
