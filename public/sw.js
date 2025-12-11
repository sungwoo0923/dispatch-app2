// ===================== public/sw.js (FINAL STABLE VERSION) =====================

// ★★ SW 버전 (배포할 때마다 반드시 숫자를 증가시켜야 한다) ★★
// CLIENT_VERSION 과 절대 같아선 안 된다. 다를 때 업데이트 감지됨.
const VERSION = "2025-02-10-03";

console.log("Service Worker Loaded. VERSION =", VERSION);

// -------------------------------------------------------
// INSTALL: 새 서비스워커가 즉시 설치됨
// -------------------------------------------------------
self.addEventListener("install", (event) => {
  console.log("SW installing…");
  self.skipWaiting(); // 바로 활성화 준비
});

// -------------------------------------------------------
// ACTIVATE: 새 서비스워커가 페이지를 장악
// -------------------------------------------------------
self.addEventListener("activate", (event) => {
  console.log("SW activating…");
  event.waitUntil(self.clients.claim());
});

// -------------------------------------------------------
// MESSAGE EVENT: 클라이언트가 SW에 메시지 전달할 때 처리
// -------------------------------------------------------
self.addEventListener("message", (event) => {
  const data = event.data || {};

  // 1) 버전 체크 요청
  if (data.type === "CHECK_VERSION") {
    const clientVersion = data.version;

    console.log("SW CHECK_VERSION → client:", clientVersion, "server:", VERSION);

    // 버전이 다르면 새 업데이트 감지
    if (clientVersion !== VERSION) {
      console.log("SW → NEW VERSION DETECTED!");

      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "NEW_VERSION" });
        });
      });
    }
  }

  // 2) 즉시 업데이트 활성화 요청 (SKIP_WAITING)
  if (data.type === "SKIP_WAITING") {
    console.log("SW: SKIP_WAITING received → Activating new version");
    self.skipWaiting();
  }
});

// -------------------------------------------------------
// FETCH HOOK: 캐시를 완전히 무시하고 항상 최신 파일 다운로드
// 구버전 SW 또는 캐시 잔존 문제를 근본적으로 해결한다
// -------------------------------------------------------
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(() =>
      caches.match(event.request)
    )
  );
});

// ===================== END OF SERVICE WORKER =====================
