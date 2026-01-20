const CACHE = "qr-compare-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Only handle GET
  if (req.method !== "GET") return;

  // Same-origin: cache-first (fast + offline)
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        return (
          cached ||
          fetch(req).then((resp) => {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return resp;
          })
        );
      })
    );
    return;
  }

  // Cross-origin (CDN): network-first, fallback to cache
  e.respondWith(
    fetch(req)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(req))
  );
});