// Service worker: precache everything on install, serve cache-first, and tell the
// page when a new version is waiting. Bump VERSION whenever any file changes.
const VERSION = 'hb-v2.1.22';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/merge.js',
  './js/sync.js',
  './js/config.js',
  './js/program.js',
  './js/timer.js',
  './js/audio.js',
  './js/wakelock.js',
  './js/figure.js',
  './js/session.js',
  './js/photos.js',
  './js/data/exercises.js',
  './js/data/clips.js',
  './audio/say/bend.mp3',
  './audio/say/curl-and-press.mp3',
  './audio/say/done.mp3',
  './audio/say/exhale.mp3',
  './audio/say/extend.mp3',
  './audio/say/hold.mp3',
  './audio/say/inhale.mp3',
  './audio/say/left.mp3',
  './audio/say/left-arm.mp3',
  './audio/say/lie-still.mp3',
  './audio/say/lift.mp3',
  './audio/say/lower.mp3',
  './audio/say/next-1-1.mp3',
  './audio/say/next-1-2.mp3',
  './audio/say/next-1-3.mp3',
  './audio/say/next-1-4.mp3',
  './audio/say/next-1-5.mp3',
  './audio/say/next-1-6.mp3',
  './audio/say/next-2-1.mp3',
  './audio/say/next-2-2.mp3',
  './audio/say/next-2-3.mp3',
  './audio/say/next-2-4.mp3',
  './audio/say/next-2-5.mp3',
  './audio/say/next-2-6.mp3',
  './audio/say/next-3-1.mp3',
  './audio/say/next-3-2.mp3',
  './audio/say/next-3-3.mp3',
  './audio/say/next-3-4.mp3',
  './audio/say/next-3-5.mp3',
  './audio/say/next-3-6.mp3',
  './audio/say/pause.mp3',
  './audio/say/press.mp3',
  './audio/say/raise.mp3',
  './audio/say/return.mp3',
  './audio/say/right.mp3',
  './audio/say/right-arm.mp3',
  './audio/say/roll-down.mp3',
  './audio/say/roll-up.mp3',
  './audio/say/sequence-complete.mp3',
  './audio/say/squat.mp3',
  './audio/say/squat-and-stand.mp3',
  './audio/say/stand.mp3',
  './audio/say/stretch.mp3',
  './audio/say/twist.mp3',
  './js/views/today.js',
  './js/views/program.js',
  './js/views/streak.js',
  './js/views/progress.js',
  './js/views/settings.js',
  './js/views/exercise.js',
  './fonts/HankenGrotesk-var.woff2',
  './fonts/BigShouldersDisplay-var.woff2',
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
