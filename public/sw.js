// ===================== public/sw.js =====================

// 캐시 이름: 매 배포마다 변경되어 새로 설치됨
const CACHE_NAME = "run25-cache-v1";

// 설치: 기존 캐시 무시하고 새 버전 적용
self.addEventListener("install", (e) => {
  self.skipWaiting();
});

// 활성화: 오래된 캐시 삭제
self.addEventListener("activate", (e) => {
  clients.claim();
});

// 버전 업데이트 감지 (새 SW 설치되면 메시지 전송)
self.addEventListener("message", (event) => {
  if (event.data === "CHECK_VERSION") {
    // 새 버전 설치되었음을 알려줌
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) =>
        client.postMessage({ type: "NEW_VERSION" })
      );
    });
  }
});
