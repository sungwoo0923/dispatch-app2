// ======================= src/firebaseMessaging.js =======================

import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { auth, db } from "./firebase";
import { doc, setDoc } from "firebase/firestore";

const messaging = getMessaging();

// 🔥 FCM Token 요청 & Firestore 저장
export const requestForToken = async () => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.log("❌ 로그인되어 있지 않음 - 토큰 저장 안함");
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey:
        "BIyTmgaR2qjQ7RoUJ7Epj1iR49MtzPuP2oByfw7g27Z00qcy_QB_1BYe1zPOSIMm5ecqypy-Q2LmGAgsDbG7dtM",
    });

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
        updatedAt: new Date(),
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
export const onMessageListener = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      console.log("📩 Foreground Message 수신!", payload);
      resolve(payload);
    });
  });
