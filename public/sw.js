// ===================== public/sw.js (정리본) =====================

// 설치: 기존 SW 무시하고 즉시 새 버전 활성화 대기
self.addEventListener("install", () => self.skipWaiting());

// 활성화: 기존 탭에서도 즉시 제어권 가져가기
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 버전 체크 명령 받으면 새 버전 알림 전송
self.addEventListener("message", (event) => {
  if (event.data === "CHECK_VERSION") {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) =>
        client.postMessage({ type: "NEW_VERSION" })
      );
    });
  }
});