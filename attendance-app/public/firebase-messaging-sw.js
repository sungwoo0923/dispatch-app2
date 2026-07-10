// 백그라운드(앱이 꺼져있거나 다른 탭을 보고 있을 때) 푸시 알림을 처리하는
// 서비스워커. Vite가 처리하지 않는 정적 파일이라 import.meta.env를 쓸 수
// 없으므로, 등록 시 URL 쿼리스트링으로 넘어온 firebaseConfig 값을 읽는다
// (src/hooks/usePushToken.js 참고).
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const params = new URLSearchParams(self.location.search);
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || "KP-Work";
  const body = payload.notification?.body || payload.data?.body || "";
  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  });
});
