// ===================== public/sw.js (FINAL - SAFE) =====================
const VERSION = "2025-02-10-06";

console.log("[SW] Loaded. VERSION =", VERSION);

// --------------------------------------------------
// INSTALL: 설치만 하고 대기 (🔥 skipWaiting 금지)
// --------------------------------------------------
self.addEventListener("install", () => {
  console.log("[SW] Installing...");
  // 아무것도 안 함 → waiting 상태 유지
});

// --------------------------------------------------
// ACTIVATE: 제어권 확보
// --------------------------------------------------
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(self.clients.claim());
});

// --------------------------------------------------
// MESSAGE: 사용자 액션으로만 업데이트 적용
// --------------------------------------------------
self.addEventListener("message", async (event) => {
  const { type } = event.data || {};

  if (type === "APPLY_UPDATE") {
    console.log("[SW] APPLY_UPDATE received");
    await self.skipWaiting(); // ✅ 여기서만 활성화
  }
});

// --------------------------------------------------
// FETCH: 네트워크 우선 (안정)
// --------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
// ===================== END =====================
