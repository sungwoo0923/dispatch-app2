// ===================== public/sw.js =====================
const VERSION = "2026-01-07-02";
const CACHE_NAME = `dispatch-app-cache-${VERSION}`;
const OFFLINE_URL = "/";

console.log("[SW] Loaded", VERSION);

// --------------------------------------------------
// 🔔 Firebase Cloud Messaging (BACKGROUND)
// --------------------------------------------------
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  projectId: "dispatch-app-9b92f",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[FCM][background]", payload);

  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "새 알림";

  const options = {
    body:
      payload?.notification?.body ||
      payload?.data?.body ||
      "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    vibrate: [200, 100, 200],
    data: payload?.data || {}
  };

  self.registration.showNotification(title, options);
});

// --------------------------------------------------
// INSTALL: PWA 필수 리소스 캐시 (🔥 핵심)
// --------------------------------------------------
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        OFFLINE_URL,
        "/manifest.json"
      ])
    )
  );
  self.skipWaiting(); // PWA 인식 필수
});

// --------------------------------------------------
// ACTIVATE
// --------------------------------------------------
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// --------------------------------------------------
// MESSAGE: 업데이트 수동 적용
// --------------------------------------------------
self.addEventListener("message", async (event) => {
  if (event.data?.type === "APPLY_UPDATE") {
    console.log("[SW] APPLY_UPDATE");
    await self.skipWaiting();
  }
});



// --------------------------------------------------
// FETCH: 네트워크 우선 + 오프라인 fallback (🔥 PWA 판정 핵심)
// --------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return res;
      })
      .catch(() =>
        caches.match(event.request).then(
          (res) => res || caches.match(OFFLINE_URL)
        )
      )
  );
});

// ===================== END =====================
