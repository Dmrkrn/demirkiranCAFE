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
    electronVersion: process.versions.electron,
});

// Window nesnesine eklediğimizi TypeScript'e bildirmek için
// src/types/electron.d.ts dosyasında tanım yapılacak
