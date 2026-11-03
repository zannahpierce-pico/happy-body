// Service worker: precache everything on install, serve cache-first, and tell the
// page when a new version is waiting. Bump VERSION whenever any file changes.
const VERSION = 'hb-v1.1.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/program.js',
  './js/timer.js',
  './js/audio.js',
  './js/wakelock.js',
  './js/figure.js',
  './js/session.js',
  './js/photos.js',
  './js/data/exercises.js',
  './js/views/today.js',
  './js/views/program.js',
  './js/views/streak.js',
  './js/views/progress.js',
  './js/views/settings.js',
  './js/views/exercise.js',
  './fonts/ArchivoBlack.woff2',
  './fonts/Archivo-var.woff2',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') return cache.match('./index.html');
      throw e;
    }
  })());
});
