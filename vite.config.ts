import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  optimizeDeps: {
    include: ['maplibre-gl'],
  },
  server: {
    port: 5173,
    open: false,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
