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

const messaging = firebase.messaging();

// --------------------------------------------------
// 📱 백그라운드 푸시 수신
// --------------------------------------------------
messaging.onBackgroundMessage((payload) => {
  console.log("[FCM] Background message:", payload);

  const title =
    payload?.notification?.title ||
    payload?.data?.title ||
    "새 알림";

  const body =
    payload?.notification?.body ||
    payload?.data?.body ||
    "";

  self.registration.showNotification(title, {
    body,
    icon: "/icons/sflow-icon.png",
    badge: "/icons/sflow-icon.png",
    data: payload?.data || {},
  });
});

// --------------------------------------------------
// 🔁 알림 클릭 → 앱 포커싱
// --------------------------------------------------
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
