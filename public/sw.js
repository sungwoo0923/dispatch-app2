// ===================== public/sw.js (최종 안정버전) =====================

// ★★ 여기에 버전 명시 ★★
// 배포할 때마다 이 숫자만 수동으로 바꿔주면 된다
const VERSION = "2025-02-10-01";

// === 반드시 이렇게 VERSION 로그를 출력해야 함 ===
console.log("Service Worker Loaded. VERSION =", VERSION);

// 설치
self.addEventListener("install", () => {
  self.skipWaiting();
});

// 활성화
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 메시지 수신
self.addEventListener("message", (event) => {
  if (event.data?.type === "CHECK_VERSION") {
    const clientVersion = event.data?.version;

    // 버전이 다를 때만 업데이트 안내
    if (clientVersion !== VERSION) {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "NEW_VERSION" })
        );
      });
    }
  }

  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
