// ======================= src/firebaseMessaging.js =======================

import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from "firebase/messaging";
import { auth, db } from "./firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// 📌 iOS Safari 등 환경에서 messaging 미지원 방지
let messaging = null;
(async () => {
  if (await isSupported()) {
    messaging = getMessaging();
    console.log("📌 Messaging Supported");
  } else {
    console.warn("🚫 Messaging Not Supported in this Browser");
  }
})();

// 🔥 FCM Token 요청 & Firestore 저장
export const requestForToken = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.log("❌ 로그인되어 있지 않음 - 토큰 저장 안함");
      return null;
    }

    if (!messaging) {
      console.log("⚠ 브라우저에서 Push 미지원 (iOS Private Mode 등)");
      return null;
    }

    const vapidKey = import.meta.env.VITE_VAPID_KEY;
    if (!vapidKey) {
      console.error("❌ VAPID KEY 누락!! .env 설정 필요");
      return null;
    }

    const token = await getToken(messaging, { vapidKey });

    if (!token) {
      console.warn("🚫 Token 없음 (알림 권한 거부 or HTTPS 미적용)");
      return null;
    }

    console.log("📌 Token:", token);

    // 🔥 Firestore 저장
    await setDoc(
      doc(db, "fcmTokens", currentUser.uid),
      {
        uid: currentUser.uid,
        token,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("🔥 Firestore에 FCM 토큰 저장 완료");
    return token;
  } catch (err) {
    console.error("❌ Token 요청 중 오류:", err);
    return null;
  }
};

// 🔔 앱 실행 중 포그라운드 알림 허용
export const onMessageListener = () => {
  if (!messaging) return Promise.resolve(null);

  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      console.log("📩 Foreground Message 수신!", payload);
      resolve(payload);
    });
  });
};
