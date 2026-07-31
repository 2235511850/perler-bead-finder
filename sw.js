// sw.js —— 简易缓存：app shell
const CACHE = 'perler-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/state.js',
  './js/parser.js',
  './js/router.js',
  './js/views/boardSetup.js',
  './js/views/patternList.js',
  './js/views/patternEdit.js',
  './js/views/patternDetail.js',
  './js/views/colorFinder.js',
  './js/views/boardView.js',
  'https://cdn.jsdelivr.net/npm/idb@8/build/umd.js',
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 缓存优先
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      // 只缓存同源 + 已知 CDN
      if (url.origin === location.origin || url.host.includes('jsdelivr.net') || url.host.includes('tailwindcss.com')) {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});