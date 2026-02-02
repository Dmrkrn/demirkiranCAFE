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

    if (updateStatus === 'idle') return null;

    return (
        <div className="update-notifier-container">
            <div className="update-banner">
                <div className="update-content">
                    <div className="update-text">
                        <span>✨</span>
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
