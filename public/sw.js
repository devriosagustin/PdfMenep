const CACHE = 'pwa-shell-v1';
const PRECACHE = ['/', '/pwa.webmanifest', '/icon.svg'];

self.addEventListener('install', (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  ),
);

self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (
    e.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !PRECACHE.includes(url.pathname)
  ) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(
      (c) =>
        c ||
        fetch(e.request)
          .then((r) => {
            if (r.ok) {
              caches.open(CACHE).then((cache) => cache.put(e.request, r.clone()));
            }
            return r;
          })
          .catch(() => c),
    ),
  );
});
