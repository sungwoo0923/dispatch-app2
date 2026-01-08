// ===================== public/sw.js =====================
const VERSION = "2026-01-07-04";
const CACHE_NAME = `dispatch-app-cache-${VERSION}`;
const OFFLINE_URL = "/";

console.log("[SW] Loaded", VERSION);

// --------------------------------------------------
// INSTALL — ❗ 절대 실패하면 안 됨 (PWA 판정 핵심)
// --------------------------------------------------
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  // ❌ cache.addAll 제거 (설치 실패 원인)
  self.skipWaiting();
});

// --------------------------------------------------
// ACTIVATE
// --------------------------------------------------
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// --------------------------------------------------
// FETCH — 런타임 캐시
// --------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return res;
      })
      .catch(() =>
        caches.match(event.request).then(
          (res) => res || caches.match(OFFLINE_URL)
        )
      )
  );
});

// ===================== END =====================
