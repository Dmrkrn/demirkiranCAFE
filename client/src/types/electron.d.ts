/**
 * Electron API TypeScript Tanımları
 * ==================================
 * 
 * Preload script'te expose edilen API'lerin
 * TypeScript tanımlarını burada yapıyoruz.
 */

interface DesktopSource {
    id: string;
    name: string;
    thumbnail: string;
}

interface ElectronAPI {
    getDesktopSources: () => Promise<DesktopSource[]>;
    platform: string;
    electronVersion: string;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };
