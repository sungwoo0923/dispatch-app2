// ===================== public/sw.js (최종 안정버전 FULL CODE) =====================

// ★★ 반드시 배포 시마다 숫자 올릴 것 ★★
// CLIENT_VERSION 과 반드시 동일해야 정상 업데이트됨
const VERSION = "2025-02-10-02";

// 콘솔 버전 출력
console.log("Service Worker Loaded. VERSION =", VERSION);

// 설치 즉시 skipWaiting
self.addEventListener("install", (event) => {
  console.log("SW installing...");
  self.skipWaiting();
});

// 활성화 시 클라이언트 장악
self.addEventListener("activate", (event) => {
  console.log("SW activating...");
  event.waitUntil(self.clients.claim());
});

// 메시지 처리
self.addEventListener("message", (event) => {
  const data = event.data || {};

  // 1) 버전 체크
  if (data.type === "CHECK_VERSION") {
    const clientVersion = data.version;

    // 다르면 새 버전 알림
    if (clientVersion !== VERSION) {
      console.log("SW version mismatch → NEW VERSION AVAILABLE");

      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "NEW_VERSION" });
        });
      });
    }
  }

  // 2) 즉시 업데이트 적용
  if (data.type === "SKIP_WAITING") {
    console.log("SW: SKIP_WAITING received → Activating new version");
    self.skipWaiting();
  }
});

// ====================================================================
// 캐시 무효화: 모든 요청은 매번 fresh fetch
// 이전 캐시 때문에 구버전 SW가 계속 잡히는 현상 방지
// ====================================================================
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() =>
      caches.match(event.request)
    )
  );
});
