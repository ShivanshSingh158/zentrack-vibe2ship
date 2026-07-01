import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * DEV API NOTE:
 * All /api/* routes are served by Vercel's local dev server.
 * To develop locally with real API routes (including Gemini proxy,
 * YouTube, transcripts, auth, notifications), run:
 *
 *   npx vercel dev
 *
 * instead of `npm run dev`. Vercel dev starts Vite AND the Node.js
 * serverless functions together on the same port, so fetch('/api/...')
 * works identically in development and production.
 *
 * If you MUST use plain `npm run dev` (Vite only), API calls will 404.
 * That is intentional — API keys must not be duplicated into Vite config.
 */




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
  build: {
    minify: true,
    rollupOptions: {
      // ✅ CRITICAL-DEPS FIX: Exclude server-only packages from the browser bundle.
      // firebase-admin (~1.5 MB) and twilio (~1 MB) are server-side SDKs that use
      // Node.js-only APIs (fs, http, crypto). They MUST NOT appear in browser output.
      // node-fetch is dead weight in the browser (native fetch exists).
      // youtube-transcript uses Node.js APIs and cannot run in a browser context.
      external: [
        'firebase-admin',
        'firebase-admin/app',
        'firebase-admin/auth',
        'firebase-admin/firestore',
        'twilio',
        'node-fetch',
        'youtube-transcript',
      ],
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) {
            return 'recharts';
          }
        }
      }
    }
  },
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
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB to accommodate html2pdf
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
