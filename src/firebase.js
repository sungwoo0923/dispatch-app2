// ======================= src/firebase.js =======================
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // Storage 포함
import { getMessaging, isSupported } from "firebase/messaging"; // 🔥 Push 추가

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
// 🔥 테스트 계정 판정 (role === "test")
// ====================================================
export const isTestUser = (u) => {
  if (!u) return false;
  return u.role === "test";
};

// ====================================================
// 🔥 컬렉션 분기 — test 계정은 별도 DB 사용
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
// 🔔 FCM Messaging — 지원되는 환경에서만 활성화
// (Chrome + HTTPS + ServiceWorker 등록 필수)
// ====================================================
export const messagingPromise = isSupported().then((supported) => {
  if (!supported) {
    console.warn("⚠️ 이 브라우저에서는 푸시 알림이 지원되지 않음");
    return null;
  }
  try {
    return getMessaging(app);
  } catch (e) {
    console.error("🔴 getMessaging error:", e);
    return null;
  }
});

// ======================= END =======================
