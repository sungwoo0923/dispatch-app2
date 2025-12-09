// ===================== public/sw.js (FINAL PERFECT) =====================

// 설치: 즉시 대기 없이 설치
self.addEventListener("install", () => {
  self.skipWaiting();
});

// 활성화: 기존 페이지도 즉시 제어
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 메시지 처리
self.addEventListener("message", (event) => {
  const data = event.data;

  // 새 버전 알림 트리거
  if (data === "CHECK_VERSION") {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) =>
        client.postMessage({ type: "NEW_VERSION" })
      );
    });
  }

  // 업데이트 즉시 적용
  if (data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
