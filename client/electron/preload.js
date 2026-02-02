/**
 * Preload Script
 * ==============
 * 
 * Bu script, Main Process ile Renderer Process arasında
 * güvenli bir köprü görevi görür.
 * 
 * contextBridge ile belirli fonksiyonları Renderer'a
 * "expose" ediyoruz. Böylece React tarafından güvenli
 * bir şekilde Electron API'lerine erişebiliriz.
 */

const { contextBridge, ipcRenderer } = require('electron');

// React tarafından erişilebilir API'ler
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Mevcut ekran/pencere kaynaklarını al
     * Ekran paylaşımı için kullanılacak
     */
    getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),

    /**
     * Uygulama platform bilgisi
     */
    platform: process.platform,

    /**
     * Electron versiyonu
     */
    /**
     * Electron versiyonu
     */
    electronVersion: process.versions.electron,

    /**
     * Pencere Kontrolleri
     */
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    /**
     * Güncelleme Kontrolleri
     */
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, info) => callback(info)),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_event, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_event, info) => callback(info)),
    installUpdate: () => ipcRenderer.send('install-update'),

    /**
     * Global Keybinds
     */
    updateGlobalKeybinds: (keybinds) => ipcRenderer.send('update-global-keybinds', keybinds),
    onGlobalShortcutTriggered: (callback) => {
        const listener = (_event, action) => callback(action);
        ipcRenderer.on('global-shortcut-triggered', listener);
        // Return cleanup function
        return () => ipcRenderer.removeListener('global-shortcut-triggered', listener);
    },
    /**
     * Uygulama Ayarları
     */
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
});

// Window nesnesine eklediğimizi TypeScript'e bildirmek için
// src/types/electron.d.ts dosyasında tanım yapılacak
