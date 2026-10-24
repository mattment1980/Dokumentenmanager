/**
 * Service Worker
 *
 * 1. Offline-Start: Eigene Dateien werden zuerst aus dem Netz geladen (damit Updates sofort
 *    ankommen) und bei fehlender Verbindung aus dem Zwischenspeicher bedient.
 *    Anfragen an Microsoft und Anthropic laufen nie über den Zwischenspeicher.
 * 2. Teilen-Menü (Android): Geteilte Dateien kommen als POST an "./share-target". Sie werden im
 *    Cache "dm-share" abgelegt und von der App nach dem Start abgeholt
 *    (js/importers/sources.js → checkShareInbox). Sie verlassen das Gerät dabei nicht.
 *
 * Pflege: CACHE muss zur Version in js/core/config.js passen; SHELL muss alle Dateien der App
 * enthalten. Beides prüft tests/unit/release.test.mjs.
 */
const CACHE = "dm-v2.0.0";
const SHARE_CACHE = "dm-share";
const SHELL = [
  "./",
  "index.html",
  "redirect.html",
  "redirect.js",
  "styles.css",
  "manifest.webmanifest",
  "js/app.js",
  "js/core/archive.js",
  "js/core/config.js",
  "js/core/events.js",
  "js/core/icons.js",
  "js/core/pipeline.js",
  "js/core/router.js",
  "js/core/state.js",
  "js/core/structure.js",
  "js/core/ui.js",
  "js/core/uploader.js",
  "js/documents/filetypes.js",
  "js/documents/job.js",
  "js/documents/naming.js",
  "js/documents/pdf.js",
  "js/documents/scan.js",
  "js/importers/index.js",
  "js/importers/mail.js",
  "js/importers/sources.js",
  "js/screens/crop.js",
  "js/screens/done.js",
  "js/screens/home.js",
  "js/screens/login.js",
  "js/screens/mail.js",
  "js/screens/pages.js",
  "js/screens/parts.js",
  "js/screens/review.js",
  "js/screens/route.js",
  "js/screens/settings.js",
  "js/screens/setup.js",
  "js/screens/shared.js",
  "js/services/ai.js",
  "js/services/onedrive.js",
  "js/services/storage.js",
  "vendor/msal-browser.min.js",
  "vendor/msal-redirect-bridge.min.js",
  "vendor/msgreader.esm.js",
  "vendor/pdf-lib.esm.min.js",
  "vendor/postal-mime.esm.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.method === "POST" && url.pathname.endsWith("/share-target")) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== "GET") return;
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
        const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await cache.match("index.html") : null);
        if (hit) return hit;
        return new Response("Offline", { status: 503 });
      }
    })(),
  );
});

/** Nimmt geteilte Dateien entgegen, legt sie lokal ab und öffnet die App. */
async function receiveShare(req) {
  const app = new URL("./", self.registration.scope);
  try {
    const fd = await req.formData();
    await caches.delete(SHARE_CACHE);
    const cache = await caches.open(SHARE_CACHE);
    let count = 0;
    for (const f of fd.getAll("files")) {
      if (!(f instanceof File) || !f.size) continue;
      await cache.put(
        new URL(`__share/${count}`, app).href,
        new Response(f, { headers: { "content-type": f.type || "application/octet-stream", "x-name": encodeURIComponent(f.name || `Datei-${count + 1}`) } }),
      );
      count++;
    }
    const meta = { count, title: String(fd.get("title") || ""), text: String(fd.get("text") || ""), url: String(fd.get("url") || ""), at: Date.now() };
    await cache.put(new URL("__share/meta", app).href, new Response(JSON.stringify(meta), { headers: { "content-type": "application/json" } }));
  } catch (err) {
    console.error("Teilen fehlgeschlagen", err);
  }
  return Response.redirect(new URL("./?share=1", app).href, 303);
}
