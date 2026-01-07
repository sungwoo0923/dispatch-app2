// ===================== public/sw.js (FINAL + FCM) =====================
const VERSION = "2025-02-10-06";

console.log("[SW] Loaded. VERSION =", VERSION);

// --------------------------------------------------
// 🔔 Firebase Cloud Messaging (BACKGROUND)
// --------------------------------------------------
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
  console.log("📩 [FCM background]", payload);

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
    data: payload?.data || {},
  };

  self.registration.showNotification(title, options);
});

// --------------------------------------------------
// INSTALL: 설치만 하고 대기 (🔥 skipWaiting 금지)
// --------------------------------------------------
self.addEventListener("install", () => {
  console.log("[SW] Installing...");
});

// --------------------------------------------------
// ACTIVATE: 제어권 확보
// --------------------------------------------------
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating...");
  event.waitUntil(self.clients.claim());
});

// --------------------------------------------------
// MESSAGE: 사용자 액션으로만 업데이트 적용
// --------------------------------------------------
self.addEventListener("message", async (event) => {
  const { type } = event.data || {};

  if (type === "APPLY_UPDATE") {
    console.log("[SW] APPLY_UPDATE received");
    await self.skipWaiting();
  }
});

// --------------------------------------------------
// FETCH: 네트워크 우선 (안정)
// --------------------------------------------------
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
// ===================== END =====================
