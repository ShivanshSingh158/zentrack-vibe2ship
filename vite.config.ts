import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// ── Dev-only: serve /api/youtube locally (same logic as Vercel serverless fn) ──
const localApiPlugin = (): Plugin => ({
  name: 'local-api',
  configureServer(server) {
    server.middlewares.use('/api/youtube', async (req: any, res: any) => {
      const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
      const CLIENT = { clientName: 'WEB', clientVersion: '2.20231219.01.00' };

      const url = new URL(req.url, 'http://localhost');
      const playlistId = url.searchParams.get('playlistId');
      if (!playlistId) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing playlistId' })); return; }

      async function fetchNext(pId: string, pIndex: number) {
        const body = { context: { client: CLIENT }, playlistId: pId, playlistIndex: pIndex };
        const r = await fetch(`https://www.youtube.com/youtubei/v1/next?key=${INNERTUBE_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!r.ok) throw new Error(`InnerTube HTTP ${r.status}`);
        return await r.json() as any;
      }

      try {
        const allVideos = new Map<string, {videoId: string; title: string; isDeleted?: boolean}>();
        let playlistTitle: string | null = null;
        let currentIndex = 0;

        for (let page = 0; page < 50; page++) {
          const data = await fetchNext(playlistId, currentIndex);
          
          if (page === 0) {
              const alert = data.alerts?.find((a: any) => a.alertRenderer?.type === 'ERROR');
              if (alert) {
                const msg = alert.alertRenderer?.text?.runs?.[0]?.text || alert.alertRenderer?.text?.simpleText || 'Playlist not found';
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: msg }));
                return;
              }
              if (!playlistTitle) {
                  playlistTitle = data.header?.playlistHeaderRenderer?.title?.simpleText ||
                                  data.metadata?.playlistMetadataRenderer?.title || null;
              }
          }

          let added = 0;
          function check(obj: any) {
              if (!obj || typeof obj !== 'object') return;
              if (obj.playlistPanelVideoRenderer) {
                  const v = obj.playlistPanelVideoRenderer;
                  if (v.videoId && !allVideos.has(v.videoId)) {
                      const t = v.title?.runs?.[0]?.text || v.title?.simpleText || '';
                      if (t !== '[Private video]' && t !== '[Deleted video]') {
                          allVideos.set(v.videoId, { videoId: v.videoId, title: t });
                          added++;
                      } else {
                          allVideos.set(v.videoId, { videoId: v.videoId, title: t, isDeleted: true });
                          added++;
                      }
                  }
              }
              if (Array.isArray(obj)) { obj.forEach(check); return; }
              Object.values(obj).forEach(check);
          }
          check(data);

          if (added === 0) break;
          currentIndex += 190;
        }

        const validVideos = Array.from(allVideos.values()).filter(v => !v.isDeleted);

        if (validVideos.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No videos found. The playlist may be empty, private, or the URL is incorrect.' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ title: playlistTitle || `Playlist (${validVideos.length} videos)`, videos: validVideos }));
      } catch (e: any) {
        console.error('API Error:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message || 'Unknown error' }));
      }
    });
  },
});

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
    localApiPlugin(),
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
