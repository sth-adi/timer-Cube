// Minimal offline-support service worker for the timer.
//
// Strategy: network-first, falling back to cache. We always prefer a fresh
// network response (this app updates via normal deploys with hashed asset
// names, so we never want to get stuck serving something stale when a
// connection IS available) — the cache exists purely so the timer keeps
// working with no network at all, which matters at practice spots/venues
// with unreliable wifi.
// Bump this whenever a deploy should flush every previously cached asset —
// each deploy renames hashed JS chunk filenames, so a cache left over from
// an old deploy is holding chunk names the server no longer serves. This
// version bump forces activate() (below) to drop that stale bucket instead
// of it lingering (and potentially getting served) indefinitely.
const CACHE_NAME = "cube-timer-cache-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response && response.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        throw new Error("Offline and not cached");
      }
    })(),
  );
});
