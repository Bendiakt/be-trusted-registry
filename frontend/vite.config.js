import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:5000',
      '/ws': { target: 'ws://localhost:5000', ws: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    // Split vendor bundles so the browser can cache them independently from
    // app code. Each chunk is content-hashed by Vite so cache busting is free.
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React runtime — changes almost never
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // i18n — large but stable; split so app code cache is unaffected
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
    // Warn (not fail) if a single chunk exceeds 600 kB after minification.
    chunkSizeWarningLimit: 600,
  },
  // ── Vitest configuration ────────────────────────────────────────────────────
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
  },
})
