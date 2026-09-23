import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), cesium(), tailwindcss()],
    server: {
        host: '0.0.0.0', // Alternatively, use '0.0.0.0'
        port: 5173, // Optional: Specify a fixed port if you want
    },
});
