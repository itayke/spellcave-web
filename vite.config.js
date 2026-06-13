import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pure HTML/React build — no Phaser. Assets served from /public/assets.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
  },
});