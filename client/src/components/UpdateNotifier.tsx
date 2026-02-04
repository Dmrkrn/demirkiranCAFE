import React, { useEffect, useState } from 'react';
import './UpdateNotifier.css';

const UpdateNotifier: React.FC = () => {
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'downloaded'>('idle');
    const [progress, setProgress] = useState(0);
    const [version, setVersion] = useState<string>('');

    useEffect(() => {
        // Electron ortamında değilsek başlama
        if (!window.electronAPI) return;

        // Güncelleme bulundu
        window.electronAPI.onUpdateAvailable((info: any) => {
            setUpdateStatus('available');
            setVersion(info.version);
            console.log('📢 Güncelleme bulundu:', info.version);
        });

        // İndirme ilerlemesi
        window.electronAPI.onUpdateProgress((info: any) => {
            setUpdateStatus('downloading');
            setProgress(info.percent);
        });

        // İndirme tamamlandı
        window.electronAPI.onUpdateDownloaded(() => {
            setUpdateStatus('downloaded');
            console.log('✅ Güncelleme indirildi!');

            // 3 saniye sonra otomatik başlat
            setTimeout(() => {
                handleInstall();
            }, 3000);
        });

        return () => {
            // Preload (v1.0.4) listeners are slightly different based on implementation, 
            // usually they don't return cleanup functions unless we designed them to.
            // Our current preload.js doesn't return cleanup, so we skip for now 
            // or just let them stay since this is a global singleton component.
        };
    }, []);

    const handleInstall = () => {
        if (window.electronAPI) {
            window.electronAPI.installUpdate();
        }
    };

    const RocketIcon = () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
    );

    if (updateStatus === 'idle') return null;

    return (
        <div className="update-notifier-container">
            <div className="update-banner">
                <div className="update-content">
                    <div className="update-text">
                        <RocketIcon />
                        {updateStatus === 'available' && `Yeni güncelleme bulundu: v${version}`}
                        {updateStatus === 'downloading' && `Güncelleniyor... %${Math.round(progress)}`}
                        {updateStatus === 'downloaded' && `Güncelleme tamamlandı! Yeniden başlatılıyor...`}
                    </div>
                    {updateStatus === 'downloaded' && (
                        <button className="update-button" disabled>
                            Yeniden Başlatılıyor...
                        </button>
                    )}
                </div>

                {updateStatus === 'downloading' && (
                    <div className="update-progress-container">
                        <div
                            className="update-progress-bar"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

export default UpdateNotifier;
