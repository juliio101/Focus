const CACHE = "effingfocus-v1";
const STATIC = [
  "/",
  "/index.html",
  "/App.jsx",
  "/App.css",
  "/main.jsx",
  "/icon-192.png",
  "/icon-512.png"
];

// Install — cache static assets
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

// Activate — clear old caches
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first, fallback to cache
self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  if(e.request.url.includes("firestore.googleapis.com")) return;
  if(e.request.url.includes("firebase")) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match("/index.html")))
  );
});
