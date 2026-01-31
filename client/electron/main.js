/**
 * Electron Ana Süreci (Main Process)
 * ==================================
 * 
 * Electron'da iki tür süreç vardır:
 * 
 * 1. **Main Process (Bu Dosya)**:
 *    - Node.js ortamında çalışır
 *    - Pencere oluşturma, sistem olayları
 *    - Dosya sistemi erişimi
 * 
 * 2. **Renderer Process (React App)**:
 *    - Chromium tarayıcısında çalışır
 *    - UI (HTML/CSS/JS)
 *    - Güvenlik nedeniyle sistem erişimi kısıtlı
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Development modunda mı?
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Ana pencereyi oluştur
 */
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 800,
        minHeight: 600,

        // Pencere stilleri (Discord benzeri görünüm)
        backgroundColor: '#1a1a2e', // Koyu arka plan
        frame: true, // Sistem pencere çerçevesi

        // Web ayarları
        webPreferences: {
            nodeIntegration: false,           // Güvenlik: Node.js API'lerini kapatıyoruz
            contextIsolation: true,           // Güvenlik: Renderer'ı izole ediyoruz
            preload: path.join(__dirname, 'preload.js'), // Köprü script
        },
    });

    // Development'ta Vite dev server'dan yükle
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        // DevTools'u aç (geliştirme için)
        mainWindow.webContents.openDevTools();
    } else {
        // Production'da build edilmiş dosyaları yükle
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Pencere kapandığında
    mainWindow.on('closed', () => {
        // macOS'ta pencere kapansa bile uygulama çalışmaya devam eder
        // Windows/Linux'ta uygulama kapanır
    });

    return mainWindow;
}

/**
 * Uygulama hazır olduğunda
 */
app.whenReady().then(() => {
    createWindow();

    // macOS: Dock'a tıklandığında pencere yoksa yenisini aç
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
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
 * Renderer <-> Main arasında mesajlaşma için
 * 
 * Ekran paylaşımı için desktopCapturer gibi özellikler
 * burada expose edilecek
 */
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
