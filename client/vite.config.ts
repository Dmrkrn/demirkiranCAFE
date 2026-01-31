import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],

    // Electron için base path ayarı
    base: './',

    // Build çıktısı
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },

    // Development server
    server: {
        port: 5173,
        strictPort: true,
    },

    // Path aliasları (temiz import'lar için)
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
