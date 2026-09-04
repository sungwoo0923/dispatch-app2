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
  // ⭐ icon과 badge는 용도가 정반대라 파일을 분리했다 —
  // - icon(알림 배너에 크게 뜨는 아이콘, 아이폰이 실제로 쓰는 자리): 흰
  //   배경이 있는 불투명 버전(icon-192x192-notif.png)을 쓴다. 투명 배경
  //   버전을 쓰면 아이폰(Safari)이 투명한 부분을 검은색으로 채워버려서
  //   로고가 검은 사각형 안에 담긴 것처럼 보이는 문제가 있었다.
  // - badge(안드로이드 잠금화면/상태바의 작은 아이콘): 반대로 투명 배경
  //   버전(icon-192x192.png)을 써야 한다. 안드로이드는 이 자리를 색상은
  //   무시하고 알파(투명도) 정보만으로 실루엣을 그려서 단색으로 보여주는데,
  //   불투명한 이미지를 주면 실루엣이 아니라 도형 전체가 흰색으로 꽉 찬
  //   것처럼 나온다.
  // ⭐ 아이콘 URL에 빌드 버전을 쿼리스트링으로 붙인다 — 아이콘은 캐시 우선으로
  // 돌아가므로(위 fetch 핸들러 참고), 새 아이콘을 배포해도 파일명이 그대로면
  // 계속 옛 캐시를 돌려준다. 버전이 바뀔 때마다 URL 자체가 달라지게 하면
  // 캐시 키가 자동으로 새로 생겨서, push 처리 중 네트워크를 타지 않고도
  // 배포마다 확실히 새 아이콘을 받아온다.
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: `/icons/icon-192x192-notif.png?v=${VERSION}`,
      badge: `/icons/icon-192x192.png?v=${VERSION}`,
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

  // ⭐ manifest.json은 HTML과 동일하게 항상 네트워크 — 설치 프롬프트가 오래된
  // 정보를 계속 캐시에서 보여주는 문제가 있었다. (아이콘은 여기 안 넣는다 —
  // 아래 설명 참고.)
  if (url.pathname === "/manifest.json") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request))
    );
    return;
  }

  // ⚠️ 아이콘(/icons/)은 한때 여기서 manifest.json과 같이 "항상 네트워크"로
  // 뺐었는데, 이게 아이폰 백그라운드 푸시를 깨뜨렸다 — showNotification()이
  // icon/badge 이미지를 불러올 때도 이 서비스워커의 fetch 처리를 거치는데,
  // iOS는 푸시 이벤트 처리에 쓸 수 있는 시간을 아주 짧게 제한한다. 아이콘을
  // 매번 네트워크로 새로 받아오게 하면, 마침 기기가 막 깨어난 직후라 네트워크가
  // 아직 준비 안 된 타이밍에 그 짧은 시간 안에 못 끝나서 알림 자체가 통째로
  // 안 뜨는 일이 있었다(안드로이드는 이 시간 제한이 느슨해 괜찮았지만 아이폰만
  // 갑자기 푸시가 안 오는 걸로 나타났다). 아이콘은 원래대로 캐시 우선(즉시,
  // 네트워크 의존 없음)으로 되돌리고, "새 아이콘을 올려도 캐시에 갇혀서 안 바뀌는"
  // 문제는 대신 URL에 빌드 버전을 붙여 캐시를 무효화하는 방식으로 해결한다 —
  // showNotification() 호출부(위)에서 아이콘 경로에 `?v=${VERSION}`을 붙였다.
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((res) => {
            if (!res || res.status !== 200) return res;
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return res;
          })
          .catch(() => new Response("", { status: 404 }));
      })
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
