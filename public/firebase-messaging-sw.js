/* ================= firebase-messaging-sw.js ================= */

// Firebase v9 compat (Service Worker 전용)
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-messaging-compat.js");

// 🔥 Firebase 초기화
firebase.initializeApp({
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  projectId: "dispatch-app-9b92f",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a",
});

// 🔔 Messaging 인스턴스
const messaging = firebase.messaging();

// =======================================================
// 📱 앱 종료 / 백그라운드 상태 푸시 처리
// =======================================================
messaging.onBackgroundMessage((payload) => {
  console.log("📩 [FCM Background] payload:", payload);

  // notification이 없는 payload 방어
  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "새 알림";

  const body =
    payload?.notification?.body ||
    payload?.data?.body ||
    "";

  const options = {
    body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    vibrate: [200, 100, 200],
    data: payload?.data || {},
  };

  self.registration.showNotification(title, options);
});

// =======================================================
// 🔁 알림 클릭 시 앱 포커싱 (권장)
// =======================================================
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
