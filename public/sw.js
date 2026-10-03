// Offline support for the timer.
//
// The goal: once the app has loaded online even one time, every page works with no connection at
// all — in a tunnel, on a plane, at a venue with no signal — and solves recorded meanwhile stay in
// the browser's own database until the connection comes back (the app syncs them then).
//
//  * Built assets (/_next/static/…) have hashed names and never change, so they're served from the
//    cache first and only fetched once.
//  * Pages and everything else are network-first, but with a short timeout when there's a saved
//    copy to fall back on: on a weak connection a saved page is shown after ~1.5s instead of the app
//    hanging on a request that may never finish. The request still finishes in the background and
//    is saved for next time. With nothing saved, it waits for the network as long as it takes.
//  * A saved page names the exact scripts it needs, so trimming the static cache never evicts one
//    that a saved page still refers to — and when a new worker takes over, open pages are told
//    ({type:"updated"}) so they can offer a reload instead of running on a mix of old and new.
//  * After the app has loaded, it asks this worker to "warm" the cache: save every page and every
//    script/style they (and the scripts they load later) refer to, so pages never opened before
//    work offline too.
//
// Bump VERSION on any change here; activate() drops caches from older versions.
const VERSION = "v6";
const STATIC = `cube-static-${VERSION}`;
const PAGES = `cube-pages-${VERSION}`;
/** How long a page load waits for the network before showing the saved copy (only when there is one). */
const NAVIGATION_TIMEOUT_MS = 1500;
/** The same for everything else that goes network-first (the manifest, icons, other same-origin files). */
const NETWORK_TIMEOUT_MS = 4000;
const MAX_STATIC_ENTRIES = 2500;
const OFFLINE_PAGE = "/offline";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== STATIC && n !== PAGES).map((n) => caches.delete(n)));
      await self.clients.claim();
      await announce({ type: "updated" });
    })(),
  );
});

/** Pages are keyed by path alone, so /?scramble=… and /?jump=analyze share the one saved shell. */
function pageKey(url) {
  return new Request(url.origin + url.pathname);
}

const isCacheable = (res) => res && res.status === 200 && (res.type === "basic" || res.type === "default");

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

async function networkFirst(event, request, key, timeoutMs) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then((res) => {
    // Kept alive until saved, even when the saved copy was shown instead (still allowed here: the
    // waitUntil below hasn't settled yet).
    if (isCacheable(res)) event.waitUntil(cache.put(key, res.clone()).catch(() => {}));
    return res;
  });
  // Whatever happens, let a slow request finish in the background so it's saved for next time.
  event.waitUntil(network.catch(() => {}));
  // The clock starts with the request, not after the cache lookup.
  const fast = withTimeout(network, timeoutMs);
  const saved = await cache.match(key);
  // Nothing saved: wait for the network however long it takes (a slow page beats no page), else say so.
  if (!saved) return network;
  // A saved page names only hashed scripts, and trim() never evicts one a saved page still needs —
  // so falling back early is safe even when the saved copy is from an older build.
  return (await fast) ?? saved;
}

/**
 * A worker's own address comes from the response it was loaded from, and a saved response carries
 * the address it was saved under — without the "#params=…" the app's worker script needs to start.
 * A freshly built response has no address of its own, so the worker keeps the one it asked for.
 */
async function synthetic(res) {
  return new Response(await res.blob(), { status: res.status, headers: res.headers });
}

async function staticFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return request.destination === "worker" ? synthetic(hit) : hit;
  const res = await fetch(request);
  if (isCacheable(res)) {
    cache.put(request, res.clone());
    trim(cache);
  }
  return res;
}

/** Every built asset named by a saved page: evicting one would leave that page unable to start offline or on a slow connection. */
async function referencedAssets() {
  const keep = new Set();
  try {
    const pages = await caches.open(PAGES);
    for (const req of await pages.keys()) {
      const res = await pages.match(req);
      if (!res || !(res.headers.get("content-type") || "").includes("text/html")) continue;
      for (const u of assetsIn(await res.text())) keep.add(u);
    }
  } catch {
    // Can't tell what's referenced: the caller then keeps everything rather than guess.
    return null;
  }
  return keep;
}

async function trim(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;
  if (excess <= 0) return;
  const keep = await referencedAssets();
  if (!keep) return;
  // Oldest first, skipping anything a saved page still needs (so the cache may stay a little over the cap).
  const victims = keys.filter((k) => !keep.has(new URL(k.url).pathname)).slice(0, excess);
  await Promise.all(victims.map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Next's in-app navigation data requests: not worth saving. Offline they fail and Next falls
  // back to a normal page load, which is served from the saved copy below.
  if (url.searchParams.has("_rsc") || request.headers.has("rsc")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".bin")) {
    event.respondWith(staticFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await networkFirst(event, request, pageKey(url), NAVIGATION_TIMEOUT_MS);
        } catch {
          const cache = await caches.open(PAGES);
          return (await cache.match(pageKey(url))) ?? (await cache.match(new Request(self.location.origin + OFFLINE_PAGE))) ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        return await networkFirst(event, request, request, NETWORK_TIMEOUT_MS);
      } catch {
        const saved = await (await caches.open(PAGES)).match(request);
        return saved ?? Response.error();
      }
    })(),
  );
});

// --- Warming ---------------------------------------------------------------

const ASSET_RE = /static\/(?:chunks|media|css)\/[A-Za-z0-9_\-.~%]+\.(?:js|css|woff2?|wasm)/g;

function assetsIn(text) {
  const found = new Set();
  for (const m of text.matchAll(ASSET_RE)) found.add(`/_next/${m[0]}`);
  return found;
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift());
    }),
  );
}

let warming = null;

async function warm(routes, extras) {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  const origin = self.location.origin;
  const seen = new Set();
  const queue = [];
  const enqueue = (urls) => {
    for (const u of urls) {
      if (!seen.has(u)) {
        seen.add(u);
        queue.push(u);
      }
    }
  };

  await pool([...routes, ...extras.filter((e) => !e.includes("."))], 4, async (path) => {
    try {
      const res = await fetch(path, { credentials: "same-origin" });
      if (!isCacheable(res)) return;
      await pages.put(new Request(origin + path), res.clone());
      enqueue(assetsIn(await res.text()));
    } catch {
      // Offline or a flaky moment: whatever got saved is still useful; the next warm fills the rest.
    }
  });

  for (const file of extras.filter((e) => e.includes("."))) {
    // The big solver table is served from the static cache; small files like the icon and the
    // manifest follow the same network-first path as pages.
    const cache = file.endsWith(".bin") ? statics : pages;
    try {
      if (await cache.match(origin + file)) continue;
      const res = await fetch(file);
      if (isCacheable(res)) await cache.put(new Request(origin + file), res);
    } catch {
      // Same as above.
    }
  }

  // Scripts refer to further scripts (anything loaded on demand), so keep following until nothing
  // new turns up. Already-saved ones are read back from the cache rather than downloaded again.
  await pool(Array.from({ length: 6 }), 6, async () => {
    while (queue.length) {
      const path = queue.shift();
      try {
        let res = await statics.match(path);
        if (!res) {
          const fetched = await fetch(path);
          if (!isCacheable(fetched)) continue;
          await statics.put(new Request(origin + path), fetched.clone());
          res = fetched;
        }
        if (path.endsWith(".js") || path.endsWith(".css")) enqueue(assetsIn(await res.clone().text()));
      } catch {
        // Skip it; it's picked up the next time it's actually used or warmed.
      }
    }
  });
  trim(statics);
}

async function announce(message) {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage(message);
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "warm" || !Array.isArray(data.routes)) return;
  if (!warming) {
    warming = warm(data.routes, Array.isArray(data.extras) ? data.extras : [])
      .then(() => announce({ type: "warmed", at: Date.now(), cache: PAGES }))
      .catch(() => {})
      .finally(() => {
        warming = null;
      });
  }
  event.waitUntil(warming);
});
