/* Natun Bari Pond service worker
   Rule: the network is always the truth. The cache exists only so the app still
   opens when the phone has no signal. That way any change published to the site
   reaches every installed app on the very next open, with no reinstall. */
const CACHE = 'pond-v8';
const SHELL = ['/', '/index.html', '/app.js', '/styles.css', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

function freshFirst(req, fallbackKey) {
  return fetch(req, { cache: 'no-store' })
    .then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(fallbackKey || req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(fallbackKey || req).then(hit => hit || caches.match('/index.html')));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                                // never cache writes
  if (new URL(req.url).hostname.includes('script.google')) return; // sheet data always live

  if (req.mode === 'navigate') { e.respondWith(freshFirst(req, '/index.html')); return; }

  const p = new URL(req.url).pathname;
  // The app itself: always try the network so a published change arrives at once.
  if (/\.(html|js|css|webmanifest|json)$/.test(p) || p === '/') { e.respondWith(freshFirst(req)); return; }

  // Icons and images never change, so serve them from cache for speed.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    return res;
  })));
});
