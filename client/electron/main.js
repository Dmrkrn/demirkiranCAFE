const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Loglama ayarları
log.transports.file.level = 'info';
autoUpdater.logger = log;
log.info('App starting...');

// Development modunda mı?
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Throttling'i devre dışı bırak (Arka planda çalışması için - AGRESİF)
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// YouTube iframe autoplay için kritik: Kullanıcı etkileşimi olmadan ses çalmaya izin ver
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// WGC (Windows Graphics Capture) yerine eski DXGI/GDI capture zorla (Donma sorununu çözmek için)
app.commandLine.appendSwitch('disable-features', 'WebRtcAllowWgcWindowCapturer');

// Auto-updater ayarları
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

/**
 * Ana pencereyi oluştur
 */
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 800,
        minHeight: 600,
        show: false, // Explicitly show window

        // İkon (Görev çubuğu için)
        icon: path.join(__dirname, '../dist/icon.png'),

        // Pencere stilleri (Discord benzeri görünüm)
        backgroundColor: '#1a1a2e', // Koyu arka plan
        frame: false, // Çerçevesiz pencere (Modern görünüm için)
        titleBarStyle: 'hidden', // macOS için
        autoHideMenuBar: true, // Menu bar'ı gizle

        // Web ayarları
        webPreferences: {
            nodeIntegration: false,           // Güvenlik: Node.js API'lerini kapatıyoruz
            contextIsolation: true,           // Güvenlik: Renderer'ı izole ediyoruz
            preload: path.join(__dirname, 'preload.js'), // Köprü script
            backgroundThrottling: false,      // Ses işleme için throttling'i kapat
            autoplayPolicy: 'no-user-gesture-required', // YouTube iframe ses otomatik oynatma
            webSecurity: false,               // YouTube iframe audio: file:// -> https:// arası izin ver
        },
    });

    // Menü çubuğunu tamamen kaldır (Windows/Linux için)
    mainWindow.setMenuBarVisibility(false);


    // Development'ta Vite dev server'dan yükle
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        // Production'da file:// yerine local HTTP server üzerinden servis et
        // Neden: YouTube iframe, file:// origin'den yüklenince ses çalmayı reddediyor.
        // HTTP üzerinden servis edince origin http://127.0.0.1:PORT olur ve YouTube normal çalışır.
        const distPath = path.join(__dirname, '../dist');

        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.json': 'application/json',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
            '.ttf': 'font/ttf',
            '.map': 'application/json',
        };

        const server = http.createServer((req, res) => {
            let urlPath = req.url.split('?')[0]; // Query string'i temizle
            if (urlPath === '/') urlPath = '/index.html';

            const filePath = path.join(distPath, urlPath);
            const ext = path.extname(filePath).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    // SPA fallback: Dosya bulunamazsa index.html dön
                    fs.readFile(path.join(distPath, 'index.html'), (err2, data2) => {
                        if (err2) {
                            res.writeHead(404);
                            res.end('Not Found');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(data2);
                        }
                    });
                } else {
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(data);
                }
            });
        });

        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            log.info(`🌐 Production HTTP server başlatıldı: http://127.0.0.1:${port}`);
            mainWindow.loadURL(`http://127.0.0.1:${port}`);
        });
    }

    // Pencere kapandığında
    mainWindow.on('closed', () => {
    });

    /**
     * Pencere Kontrol IPC Handler'ları
     */
    ipcMain.on('window-minimize', () => {
        mainWindow.minimize();
    });

    ipcMain.on('window-maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });

    // ready-to-show: İçerik yüklendiğinde pencereyi göster
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    ipcMain.on('window-close', () => {
        mainWindow.close();
    });

    /**
     * Auto-Updater Event'leri
     */
    autoUpdater.on('checking-for-update', () => {
        log.info('🔍 Güncelleme kontrol ediliyor...');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('✅ Güncelleme mevcut:', info.version);
        mainWindow.webContents.send('update-available', info);
    });

    autoUpdater.on('update-not-available', () => {
        log.info('ℹ️ Uygulama güncel');
    });

    autoUpdater.on('download-progress', (progress) => {
        log.info(`📥 İndiriliyor: ${Math.round(progress.percent)}%`);
        mainWindow.webContents.send('update-progress', progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('📦 Güncelleme indirildi, yeniden başlatılacak');
        mainWindow.webContents.send('update-downloaded', info);
    });

    autoUpdater.on('error', (err) => {
        log.error('❌ Güncelleme hatası:', err);
    });

    return mainWindow;
}

/**
 * Uygulama hazır olduğunda
 */
app.whenReady().then(() => {
    createWindow();

    // Production'da güncelleme kontrolü yap
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();
    }

    // macOS: Dock'a tıklandığında pencere yoksa yenisini aç
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// IPC: Güncellemeyi yükle ve uygulamayı yeniden başlat
ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
});

/**
 * Tüm pencereler kapandığında
 */
app.on('window-all-closed', () => {
    // macOS'ta Command+Q yapılana kadar uygulamayı açık tut
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

/**
 * IPC (Inter-Process Communication) Event'leri
 */
// IPC: Desktop Sources
ipcMain.handle('get-desktop-sources', async () => {
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 320, height: 180 },
    });

    return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
    }));
});

// ==========================================
// Global Keybinds (Passive / uIOhook)
// ==========================================
const { uIOhook } = require('uiohook-napi');

let globalKeybinds = {
    toggleMic: null,
    toggleSpeaker: null
};

// Frontend'den keybind map'ini al (uIOhook kodlarıyla)
ipcMain.on('update-global-keybinds', (event, keybinds) => {
    globalKeybinds = keybinds;
});

// Hook event listener
uIOhook.on('input', (e) => {
    if (e.type === 4) {
        if (globalKeybinds.toggleMic && e.keycode === globalKeybinds.toggleMic) {
            const wins = BrowserWindow.getAllWindows();
            wins.forEach(win => win.webContents.send('global-shortcut-triggered', 'toggleMic'));
        }
        if (globalKeybinds.toggleSpeaker && e.keycode === globalKeybinds.toggleSpeaker) {
            const wins = BrowserWindow.getAllWindows();
            wins.forEach(win => win.webContents.send('global-shortcut-triggered', 'toggleSpeaker'));
        }
    }
});

// Hook'u başlat (Biraz gecikmeli başlat ki UI çizilsin)
setTimeout(() => {
    log.info('Starting uIOhook...');
    uIOhook.start();
}, 2000);

// Uygulama kapanırken hook'u durdur
app.on('will-quit', () => {
    uIOhook.stop();
});

// IPC: Open External Link
ipcMain.handle('open-external', async (event, url) => {
    const { shell } = require('electron');
    await shell.openExternal(url);
});

// IPC: App Version
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});
