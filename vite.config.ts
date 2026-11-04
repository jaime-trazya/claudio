/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages publica el sitio en https://<usuario>.github.io/<repositorio>/
// Por eso "base" debe ser el nombre del repositorio.
const REPO = 'claudio'
const base = process.env.VITE_BASE ?? `/${REPO}/`

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // "prompt": la nueva versión se instala solo cuando el usuario pulsa "Actualizar".
      // El service worker solo cachea archivos de la app; nunca toca IndexedDB.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png', 'splash/*.png'],
      manifest: {
        id: base,
        name: 'Claudio · Finanzas',
        short_name: 'Claudio',
        description: 'Tus finanzas personales, guardadas solo en tu iPhone.',
        lang: 'es',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f3f5f7',
        theme_color: '#f3f5f7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
