// ===================== public/sw.js (FINAL STABLE VERSION) =====================

// ★★ 배포할 때마다 MUST: VERSION 숫자 증가 ★★
const VERSION = "2025-02-10-03";

console.log("Service Worker Loaded. VERSION =", VERSION);

// INSTALL
self.addEventListener("install", () => {
  console.log("SW installing…");
  self.skipWaiting();
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  console.log("SW activating…");
  event.waitUntil(self.clients.claim());
});

// MESSAGE
self.addEventListener("message", (event) => {
  const data = event.data || {};

  // 버전 체크
  if (data.type === "CHECK_VERSION") {
    const clientVersion = data.version;

    console.log("SW CHECK_VERSION → client:", clientVersion, "server:", VERSION);

    if (clientVersion !== VERSION) {
      console.log("SW → NEW VERSION DETECTED!");

      self.clients.matchAll().then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "NEW_VERSION" })
        );
      });
    }
  }

  // 강제 업데이트
  if (data.type === "SKIP_WAITING") {
    console.log("SW: SKIP_WAITING received → activating new SW");
    self.skipWaiting();
  }
});

// FETCH: 캐시 무효화
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() =>
      caches.match(event.request)
    )
  );
});

// ===================== END =====================
