const VERSION = "BUILD_PLACEHOLDER";
const CACHE_NAME = `dispatch-app-cache-${VERSION}`;

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
// INSTALL — waiting 상태로 대기 (skipWaiting 제거!)
// --------------------------------------------------
self.addEventListener("install", () => {
  console.log("[SW] Installing...", VERSION);
  // 🔥 자동 skipWaiting 제거 — 사용자가 "업데이트" 버튼 눌러야 적용
});

// --------------------------------------------------
// ACTIVATE — 이전 캐시 전부 삭제 + 즉시 제어권 확보
// --------------------------------------------------
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...", VERSION);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// --------------------------------------------------
// FETCH — HTML은 항상 네트워크 / 나머지는 캐시 우선
// --------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // sw.js 자체는 캐시하지 않음
  if (url.pathname === "/sw.js") return;

  // HTML은 항상 네트워크
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // 나머지: 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((res) => {
          if (!res || res.status !== 200) return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return res;
        })
        .catch(() => new Response("Offline", { status: 503 }));
    })
  );
});
