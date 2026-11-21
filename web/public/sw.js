// Artha AI service worker: makes the site installable as an app and opens it instantly on repeat visits.
// - hashed build files (/assets/*) and versioned app icons are cache-first: their URLs change when their content does;
// - pages are network-first with a cached fallback, so a deploy shows up at once and the app still opens offline;
// - /api/* is never touched: voice notes, streaming replies and sign-in always go straight to the server.
const VERSION = 'artha-v1';
const ASSETS = `${VERSION}-assets`;
const PAGES = `${VERSION}-pages`;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(PAGES).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(PAGES).then(c => c.put('/', copy)); }
      return res;
    }).catch(() => caches.match('/')));
    return;
  }

  const cacheable = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/app-icon/');
  if (!cacheable) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then(c => c.put(req, copy).then(() => trim(ASSETS, 80))); }
    return res;
  })));
});
