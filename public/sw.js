/* Tagebuch — Service Worker
   Ziel: die App startet offline sofort, Einträge liegen ohnehin in IndexedDB. */

/* Version bei jeder Auslieferung hochzählen – alte Caches werden beim
   Aktivieren entfernt, sonst hält eine installierte App die alte Oberfläche fest. */
const VERSION = "tagebuch-v3";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Seitenaufrufe: erst Netz (frische Version), sonst die gecachte Hülle.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put("/", fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match(request)) || (await cache.match("/")) || Response.error();
        }
      })(),
    );
    return;
  }

  // API-Antworten gehören nicht in den Cache – ein zwischengespeicherter
  // Anmeldestatus oder Feed führt zu falschen Anzeigen. Bilder sind die
  // Ausnahme: sie sind unveränderlich und offline wertvoll.
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/photos/")) {
    return;
  }

  // Statische Assets: sofort aus dem Cache, im Hintergrund erneuern.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => undefined);
      return cached || (await network) || Response.error();
    })(),
  );
});
