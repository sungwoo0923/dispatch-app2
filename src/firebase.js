
// ======================= src/firebase.js (FINAL FIXED) =======================
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  addDoc,
  getDocs,
  collection,
  serverTimestamp,
  deleteDoc,
  onSnapshot,
} from "firebase/firestore";
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

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ====================================================
// Firebase Export
// ====================================================
export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  doc,
  getDoc,
  setDoc,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  collection,
  serverTimestamp,
  onSnapshot,
};

// ====================================================
// ⭐ 안정화된 컬렉션 분기 함수
// ====================================================
export function getCollections() {
  const role = localStorage.getItem("role");

  // 기사/미로그인/권한없음 → 실 서비스 drivers 사용
  if (!role || role === "driver") {
    return {
      dispatch: "dispatch",
      drivers: "drivers",
      clients: "clients",
    };
  }

  // TEST 계정 분기
  if (role === "test") {
    return {
      dispatch: "dispatch_test",
      drivers: "drivers_test",
      clients: "clients_test",
    };
  }

  // 관리자/직원 → 실 서비스
  return {
    dispatch: "dispatch",
    drivers: "drivers",
    clients: "clients",
  };
}

// ====================================================
// FCM (기존 유지)
// ====================================================
export const messagingPromise = isSupported().then((supported) => {
  if (!supported) return null;
  try { return getMessaging(app); } catch { return null; }
});

export async function saveFcmToken(user) {
  if (!user) return;
  const messaging = await messagingPromise;
  if (!messaging) return;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;
  const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY;
  const token = await getToken(messaging, { vapidKey });
  if (!token) return;
  await updateDoc(doc(db, "users", user.uid), { fcmToken: token });
}

export async function initForegroundFCM(cb) {
  const messaging = await messagingPromise;
  if (!messaging) return;
  onMessage(messaging, (payload) => cb?.(payload));
}

// ======================= END =======================
