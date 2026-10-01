/* Kernl service worker: makes the app installable, opens quickly, and shows push notifications. */
const CACHE = "kernl-v3"; // bump to clear old saved copies

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

/*
 * Pages: network first (always fresh data), falling back to the cached app when offline or when the server
 * answers with an error (e.g. for the minute Render restarts during an update). Only good pages are cached. Never /api.
 */
const RETRY_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kernl</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#f2f4f7;color:#111">
<div style="max-width:340px;text-align:center;padding:16px"><h1 style="font-size:22px">Kernl is updating</h1>
<p>This usually takes about a minute. The page will reload by itself.</p>
<p><button onclick="location.reload()" style="font:inherit;padding:10px 18px;border:0;border-radius:8px;background:#1b5fb4;color:#fff">Try again</button></p></div>
<script>setTimeout(() => location.reload(), 15000)</script></body>`;
const retryPage = () => new Response(RETRY_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then(async (res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
            return res;
          }
          if (res.status >= 500) return (await caches.match("/")) || retryPage();
          return res;
        })
        .catch(async () => (await caches.match("/")) || retryPage()),
    );
    return;
  }
  // The app's code and styles: file names change with every update, so a saved copy is always right.
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener("push", (e) => {
  let data = { title: "Kernl", body: "", url: "/" };
  try {
    data = { ...data, ...e.data.json() };
  } catch {
    /* plain text */
  }
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: data.url } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === location.origin);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
