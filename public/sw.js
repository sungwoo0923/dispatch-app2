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
// ⭐ firebase-messaging-compat SDK의 messaging.onBackgroundMessage()를 쓰던
// 걸 걷어내고, 표준 Push API(self.addEventListener("push", ...))를 직접
// 처리하는 방식으로 바꿨다. onBackgroundMessage는 "이 메시지에 notification
// 필드가 있는지"에 따라 브라우저가 알아서 띄울지/우리 핸들러를 부를지가
// SDK 내부에서 갈리는데, 이 판단 기준이 브라우저(특히 Safari)마다 미묘하게
// 달라 안드로이드에서는 브라우저 자동표시 + 우리 커스텀표시가 겹쳐 알림이
// 두 개(아이콘도 서로 다르게) 뜨는 사고로, 아이폰(Safari)에서는 반대로
// 아예 아무것도 안 뜨는 사고로 이어졌다(서버는 이미 notification 없이
// data로만 보내도록 고쳐뒀지만, SDK가 그 상황을 브라우저마다 다르게
// 다루는 것 자체가 문제였다). 원인이 된 SDK의 내부 분기 로직 자체를
// 아예 안 쓰고, 모든 브라우저에서 동일하게 "push 이벤트가 오면 무조건
// 우리가 직접 파싱해서 알림 하나만 띄운다"로 통일해 이 불일치를 없앤다.
// (firebase-messaging-compat import는 더 이상 필요 없어 제거함.)
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    console.warn("[SW] push payload 파싱 실패:", e);
  }
  // 서버는 notification 없이 data로만 보낸다(functions/index.js의
  // sendPushAndCleanup 참고) — 그래도 혹시 모를 다른 발송 경로를 위해
  // payload.notification도 폴백으로 읽는다.
  const data = payload.data || {};
  const title = data.title || payload.notification?.title || "새 알림";
  const body = data.body || payload.notification?.body || "";

  // ⭐ vibrate/tag/renotify — 안드로이드에서 "시스템 알림음만 나고 배너(헤드업)는
  // 안 뜬다"는 문제 리포트가 있었다. 헤드업 표시 여부 자체는 안드로이드가 그
  // 사이트/앱의 알림 채널 중요도(설정 > 앱 > 알림)로 최종 결정해 웹 코드로 100%
  // 강제할 수는 없지만, vibrate(진동 패턴이 있으면 더 눈에 띄는 알림으로 취급되는
  // 경향이 있음)와 tag+renotify(같은 태그로 여러 번 와도 매번 다시 알려줌 — 기본값은
  // 조용히 이전 알림을 덮어쓰기만 함)를 채워주면 실제로 체감되는 경우가 많다.
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      vibrate: [200, 100, 200],
      tag: data.tag || `kpflow-${Date.now()}`,
      renotify: true,
      data,
    })
  );
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
