// Offline play: the game's own files (three.js included) are cached on install and served
// cache-first; the webfont is cached the first time it loads. Bump VERSION whenever a file changes.
const VERSION = 'tumbangpreso-v4';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'src/main.mjs', 'src/sim.mjs', 'src/view3d.mjs', 'src/audio.mjs', 'src/rng.mjs', 'src/people.mjs', 'src/envpack.mjs', 'src/crowd.mjs', 'src/post.mjs', 'src/tex.mjs', 'src/vendor/three.module.min.js', 'src/vendor/three-mocap.min.js', 'src/vendor/three-fx.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !font) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: url.origin === location.origin });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match('index.html')) || Response.error();
    }
  }));
});
