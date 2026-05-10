// Vite + React + PWA config for the Sunpath web app.
// Module: infra/build.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      // Serve the manifest in `vite dev` too so e2e/PWA smoke tests pass
      // without needing a full production build.
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Sunpath',
        short_name: 'Sunpath',
        description: 'Field intelligence for solar door-to-door teams',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0a',
        theme_color: '#f59e0b',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        // Pull in our payload-less Web Push handler so notifications work
        // even when the workbox-generated SW is in charge of the lifecycle.
        importScripts: ['pwa-push.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.includes('tile.openstreetmap.org') ||
              url.hostname.includes('basemaps.cartocdn.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          dexie: ['dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
})
