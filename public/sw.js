// ===================== public/sw.js (최종 안정버전 수정본) =====================

// ★★ 반드시 클라이언트 버전과 다르게 변경 ★★
const VERSION = "2025-02-10-02";  // ← 버전만 올려주면 업데이트 감지됨

// 설치
console.log("SW v102");   // 콘솔에서 버전 표시

self.addEventListener("install", () => self.skipWaiting());

// 활성화
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 메시지 수신
self.addEventListener("message", (event) => {
  if (event.data?.type === "CHECK_VERSION") {
    const clientVersion = event.data?.version;

    // 버전 비교 → 다르면 새버전 알림
    if (clientVersion !== VERSION) {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "NEW_VERSION" })
        );
      });
    }
  }

  // 즉시 활성화
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
