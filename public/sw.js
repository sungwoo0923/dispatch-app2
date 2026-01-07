// ===================== public/sw.js =====================
const VERSION = "2026-01-07-03";
const CACHE_NAME = `dispatch-app-cache-${VERSION}`;
const OFFLINE_URL = "/";

console.log("[SW] Loaded", VERSION);

// --------------------------------------------------
// INSTALL — 🔥 PWA 판정 핵심 (절대 실패하면 안 됨)
// --------------------------------------------------
self.addEventListener("install", (event) => {
  console.log("[SW] Installing...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "/",
        "/index.html",
        "/manifest.json",
      ])
    )
  );
  self.skipWaiting();
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

  // 🔥 activate 이후에만 Firebase 로드
  initFirebaseMessaging();
});

// --------------------------------------------------
// 🔔 Firebase Cloud Messaging (AFTER ACTIVATE)
// --------------------------------------------------
function initFirebaseMessaging() {
  try {
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
      const title =
        payload?.notification?.title ||
        payload?.data?.title ||
        "새 알림";

      self.registration.showNotification(title, {
        body:
          payload?.notification?.body ||
          payload?.data?.body ||
          "",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        data: payload?.data || {},
      });
    });

    console.log("[SW] Firebase Messaging ready");
  } catch (e) {
    console.warn("[SW] Firebase init skipped", e);
  }
}

// --------------------------------------------------
// FETCH
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
