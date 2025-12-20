// ===================== public/sw.js =====================
// ★ 배포 시 VERSION 반드시 변경 ★
const VERSION = "2025-02-10-06";

console.log("[SW] Loaded. VERSION =", VERSION);

// INSTALL: 새 SW 설치 (즉시 대기 상태)
self.addEventListener("install", () => {
  console.log("[SW] Installing...");
  self.skipWaiting(); // waiting 상태로 즉시 진입
});

// ACTIVATE: 기존 캐시 정리 + 제어권 확보
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");

  event.waitUntil(
    (async () => {
      // 🔥 모든 캐시 제거 (기기별 불일치 방지)
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));

      await self.clients.claim();
      console.log("[SW] Activated & caches cleared");
    })()
  );
});

// MESSAGE: 클라이언트 ↔ SW 통신
self.addEventListener("message", async (event) => {
  const data = event.data || {};

  // 🔎 버전 체크 요청
  if (data.type === "CHECK_VERSION") {
    if (data.version !== VERSION) {
      console.log("[SW] New version detected");

      const clients = await self.clients.matchAll();
      clients.forEach((client) =>
        client.postMessage({ type: "UPDATE_AVAILABLE" })
      );
    }
  }

  // 🔥 사용자가 "업데이트" 클릭
  if (data.type === "APPLY_UPDATE") {
    console.log("[SW] APPLY_UPDATE received");

    // 새 SW 즉시 활성화
    await self.skipWaiting();

    const clients = await self.clients.matchAll();
    clients.forEach((client) =>
      client.postMessage({ type: "UPDATE_APPLIED" })
    );
  }
});

// FETCH: 네트워크 우선 (안정)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ===================== END =====================
