const VERSION = "BUILD_PLACEHOLDER";
const CACHE_NAME = `dispatch-app-cache-${VERSION}`;

console.log("[SW] Loaded", VERSION);

// --------------------------------------------------
// 🔔 FCM 백그라운드 푸시 — 카카오톡처럼 앱이 백그라운드/완전종료 상태에서도
// 알림창이 뜨게 하는 부분.
// ⚠️ 예전엔 이 처리를 firebase-messaging-sw.js라는 별도 서비스워커에 따로
// 두고 있었는데, 이 파일(/sw.js)이 루트 스코프("/")에서 별도로 등록되면서
// activate 시 self.clients.claim()으로 제어권을 가져가버려 두 서비스워커가
// 같은 스코프를 두고 충돌했다 — 앱을 완전히 꺼둔 상태에서 푸시가 안 오거나
// 불안정했던 원인으로 보인다. 서비스워커를 하나로 합쳐(app이 등록하는 이
// /sw.js 안에 FCM 처리까지 같이 넣어) 충돌 자체를 없앤다.
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  projectId: "dispatch-app-9b92f",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[SW][FCM] Background message:", payload);

  const title = payload?.notification?.title || payload?.data?.title || "새 알림";
  const body = payload?.notification?.body || payload?.data?.body || "";

  // ⭐ vibrate/tag/renotify — 안드로이드에서 "시스템 알림음만 나고 배너(헤드업)는
  // 안 뜬다"는 문제 리포트가 있었다. 헤드업 표시 여부 자체는 안드로이드가 그
  // 사이트/앱의 알림 채널 중요도(설정 > 앱 > 알림)로 최종 결정해 웹 코드로 100%
  // 강제할 수는 없지만, vibrate(진동 패턴이 있으면 더 눈에 띄는 알림으로 취급되는
  // 경향이 있음)와 tag+renotify(같은 태그로 여러 번 와도 매번 다시 알려줌 — 기본값은
  // 조용히 이전 알림을 덮어쓰기만 함)를 채워주면 실제로 체감되는 경우가 많다.
  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    vibrate: [200, 100, 200],
    tag: payload?.data?.tag || `kpflow-${Date.now()}`,
    renotify: true,
    data: payload?.data || {},
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("/app");
    })
  );
});

// --------------------------------------------------
// MESSAGE — 업데이트 즉시 적용
// --------------------------------------------------
self.addEventListener("message", (event) => {
  if (event.data?.type === "APPLY_UPDATE") {
    self.skipWaiting();
  }
});

// --------------------------------------------------
// INSTALL — waiting 상태로 대기 (skipWaiting 제거!)
// --------------------------------------------------
self.addEventListener("install", () => {
  console.log("[SW] Installing...", VERSION);
  // 🔥 자동 skipWaiting 제거 — 사용자가 "업데이트" 버튼 눌러야 적용
});

// --------------------------------------------------
// ACTIVATE — 이전 캐시 전부 삭제 + 즉시 제어권 확보
// --------------------------------------------------
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...", VERSION);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// --------------------------------------------------
// FETCH — HTML은 항상 네트워크 / 나머지는 캐시 우선
// --------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // sw.js 자체는 캐시하지 않음
  if (url.pathname === "/sw.js") return;

  // HTML은 항상 네트워크(브라우저 HTTP 캐시까지 완전히 건너뛰어, 배포 직후에도
  // 예전 index.html이 참조하던 예전 JS 청크 해시가 남아있지 않도록 한다)
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // 나머지: 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((res) => {
          if (!res || res.status !== 200) return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return res;
        })
        .catch(() => new Response("Offline", { status: 503 }));
    })
  );
});
