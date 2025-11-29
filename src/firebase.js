// ======================= src/firebase.js =======================
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  getMessaging,
  onMessage,
  getToken,
  isSupported,
} from "firebase/messaging";

// ====================================================
// Firebase 설정
// ====================================================
const firebaseConfig = {
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  authDomain: "dispatch-app-9b92f.firebaseapp.com",
  projectId: "dispatch-app-9b92f",
  storageBucket: "dispatch-app-9b92f.firebasestorage.app",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a",
  measurementId: "G-1NVFMVHQ28",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// ====================================================
// Export Firebase services
// ====================================================
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ====================================================
// 🔥 테스트 계정 판정
// ====================================================
export const isTestUser = (u) => {
  if (!u) return false;
  return u.role === "test";
};

// ====================================================
// 🔥 컬렉션 분기 — test 계정은 별도 컬렉션
// ====================================================
export const getCollections = (user) => {
  const test = isTestUser(user);
  return test
    ? {
        dispatch: "dispatch_test",
        drivers: "drivers_test",
        clients: "clients_test",
      }
    : {
        dispatch: "dispatch",
        drivers: "drivers",
        clients: "clients",
      };
};

// ====================================================
// 🔔 Messaging 지원 여부 확인 (HTTPS + Service Worker 필요)
// ====================================================
export const messagingPromise = isSupported().then((supported) => {
  if (!supported) {
    console.warn("📵 이 브라우저에서는 푸시 알림이 지원되지 않음");
    return null;
  }
  try {
    return getMessaging(app);
  } catch (error) {
    console.error("Messaging 초기화 오류:", error);
    return null;
  }
});

// ====================================================
// 🔔 FCM Token 요청 + Firestore에 저장하는 함수
// ====================================================
export async function saveFcmToken(user) {
  if (!user) return;

  const messaging = await messagingPromise;
  if (!messaging) return; // 지원 안하는 브라우저면 스킵

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("알림 권한 거부됨");
      return;
    }

    const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY;
    const token = await getToken(messaging, { vapidKey });

    if (token) {
      console.log("📌 FCM Token 발급:", token);

      // Firestore에 token 저장
      await updateDoc(doc(db, "users", user.uid), {
        fcmToken: token,
      });
    }

  } catch (err) {
    console.error("FCM Token error:", err);
  }
}

// ====================================================
// 📌 앱 실행 중 수신되는 알림 처리
// ====================================================
export async function initForegroundFCM(anyCallback) {
  const messaging = await messagingPromise;
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    console.log("📩 Foreground Push:", payload);
    anyCallback?.(payload);
  });
}

// ======================= END =======================
