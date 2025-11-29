/* ================= firebase-messaging-sw.js ================ */
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.6.11/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  projectId: "dispatch-app-9b92f",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a",
});

// 백그라운드 알림 처리
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  console.log("📩 [BG] Received:", payload);

  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png"
  });
});
