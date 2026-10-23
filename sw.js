// Service Worker: App startet auch offline. Eigene Dateien zuerst aus dem Netz (damit Updates sofort
// ankommen), bei fehlender Verbindung aus dem Zwischenspeicher. Anfragen an Microsoft und Anthropic
// werden nie zwischengespeichert.
const CACHE = "dm-v1.2.0";
const SHELL = [
  "./",
  "index.html",
  "redirect.html",
  "redirect.js",
  "styles.css",
  "manifest.webmanifest",
  "js/app.js",
  "js/config.js",
  "js/store.js",
  "js/naming.js",
  "js/pdf.js",
  "js/scan.js",
  "js/onedrive.js",
  "js/ai.js",
  "vendor/msal-browser.min.js",
  "vendor/msal-redirect-bridge.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Anmelde-Rückgaben nie aus dem Speicher bedienen
  if (url.pathname.endsWith("/redirect.html") && (url.search || url.hash)) return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const net = await Promise.race([
          // "no-cache": immer beim Server nachfragen, damit Updates sofort ankommen
          fetch(req.mode === "navigate" ? req : new Request(req, { cache: "no-cache" })),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
        ]);
        if (net && net.ok && url.search === "") cache.put(req, net.clone());
        return net;
      } catch {
        const hit = (await cache.match(req, { ignoreSearch: true })) ||
          (req.mode === "navigate" ? await cache.match("index.html") : null);
        if (hit) return hit;
        return new Response("Offline", { status: 503 });
      }
    })()
  );
});
