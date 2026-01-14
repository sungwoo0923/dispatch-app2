// ===================== public/sw.js =====================
const VERSION = "2026-01-07-05";
const CACHE_NAME = `dispatch-app-cache-${VERSION}`;
const OFFLINE_URL = "/app";

console.log("[SW] Loaded", VERSION);

// --------------------------------------------------
// MESSAGE — 업데이트 즉시 적용
// --------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data?.type === "APPLY_UPDATE") {
    self.skipWaiting();
  }
});

// --------------------------------------------------
// INSTALL — 실패하면 안 됨
// --------------------------------------------------
self.addEventListener("install", () => {
  console.log("[SW] Installing...");
  self.skipWaiting();
});

// --------------------------------------------------
// ACTIVATE — 이전 캐시 정리
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
// FETCH — HTML은 네트워크 / 나머지는 캐시
// --------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // 🔥 HTML 절대 캐시 금지 (구버전 고착 방지)
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return res;
        })
        .catch(() => caches.match(OFFLINE_URL));
    })
  );
});

// ===================== END =====================
