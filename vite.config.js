import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Capacitor's WebView serves assets at the file:// root, so it needs base: '/'.
// GitHub Pages serves under /healthtrace/ (the repo name), so the normal build
// keeps that. Toggle via CAPACITOR_BUILD=true npm run build (used by the
// android-release workflow).
const isCapacitor = process.env.CAPACITOR_BUILD === 'true';
const base = isCapacitor ? '/' : '/healthtrace/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'HealthTrace',
        short_name: 'HealthTrace',
        description: 'Track your blood work, vitals, and health trends. Offline-first, 100% on your device.',
        theme_color: '#4F46E5',
        background_color: '#F5F7FA',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The PDF reader is ~1.5 MB of engine and worker, and most sessions
        // never open a PDF. Keeping it out of the precache means the app
        // installs light; the runtime rule below caches it the first time
        // someone actually opens a report, and it works offline after that.
        globIgnores: ['**/pdf.worker*.js', '**/pdf-*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Purge old precached assets and take control immediately, so a new
        // deploy never leaves a client with a stale index.html pointing at
        // asset hashes that no longer exist.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Keep the PDF engine once it has been fetched, so the second
            // report opens offline.
            urlPattern: /\/assets\/pdf(?:\.worker)?[-.][\w.-]*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs',
              expiration: { maxEntries: 4 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-static', cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
});
