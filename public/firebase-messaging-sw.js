/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  authDomain: "dispatch-app-9b92f.firebaseapp.com",
  projectId: "dispatch-app-9b92f",
  storageBucket: "dispatch-app-9b92f.firebasestorage.app",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a",
  measurementId: "G-1NVFMVHQ28",
});

const messaging = firebase.messaging();

// 앱 꺼져있을 때 오는 푸시 알림
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] BG message ", payload);

  const title = payload.notification?.title || "RUN25 알림";
  const options = {
    body: payload.notification?.body || "(내용 없음)",
    icon: "/favicon-192.png", // 아이콘 있으면 표시됨
    data: payload.data || {},
  };

  self.registration.showNotification(title, options);
});
