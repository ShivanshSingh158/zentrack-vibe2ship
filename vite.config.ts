import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ── Emits /version.json on every build with the current timestamp ─────────────
// The UpdatePrompt component fetches this (cache: 'no-store') and compares
// against the timestamp baked into the bundle at build time — 100% reliable.
const versionJsonPlugin = (): Plugin => ({
  name: 'version-json',
  generateBundle() {
    const buildTime = Date.now();
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ v: buildTime, built: new Date(buildTime).toISOString() }),
    });
  },
});

export default defineConfig({
  // Bake the build timestamp into the bundle — used by UpdatePrompt to detect staleness
  define: {
    __APP_BUILD_TIME__: JSON.stringify(Date.now()),
  },
  plugins: [
    react(),
    versionJsonPlugin(),
    VitePWA({
      // autoUpdate so SW takes over silently — version.json handles the UI notification
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Cache the app shell: all JS/CSS/HTML/images except the FCM SW itself
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        // Don't let Workbox cache version.json — it must always be fetched fresh
        globIgnores: ['firebase-messaging-sw.js', 'version.json'],
        navigateFallbackDenylist: [/^\/__/, /^\/api\//],
        runtimeCaching: [
          {
            // Explicitly bypass cache for version.json so polling always gets server version
            urlPattern: /\/version\.json$/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/www\.gstatic\.com\/firebasejs\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-sdk',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'cloudinary-uploads',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      manifest: {
        name: 'Zentrack',
        short_name: 'Zentrack',
        description: 'Calm productivity and progress tracking — all in one place.',
        theme_color: '#09090b',
        background_color: '#09090b',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
