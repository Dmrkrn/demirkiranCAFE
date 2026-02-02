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
    minimizeWindow: () => void;
    maximizeWindow: () => void;
    closeWindow: () => void;
    onUpdateAvailable: (callback: (info: any) => void) => void;
    onUpdateProgress: (callback: (progress: any) => void) => void;
    onUpdateDownloaded: (callback: (info: any) => void) => void;
    installUpdate: () => void;
    updateGlobalKeybinds: (keybinds: { toggleMic: number | null, toggleSpeaker: number | null }) => void;
    onGlobalShortcutTriggered: (callback: (action: string) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export { };
