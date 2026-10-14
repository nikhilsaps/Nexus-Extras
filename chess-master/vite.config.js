import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// STEERING: base './' so all asset paths are relative (ESP serves from a subfolder).
// Dev proxy makes /api same-origin like the ESP, so we never hardcode a host.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  build: {
    outDir: 'dist',
    // Keep the engine worker out of aggressive inlining so it caches well.
    assetsInlineLimit: 0,
  },
})
