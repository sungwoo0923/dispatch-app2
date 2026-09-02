
// ======================= src/firebase.js (FINAL FIXED) =======================
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
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

// IndexedDB 영구 캐시 시도 → 실패 시 기본 메모리 캐시로 폴백
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: false }),
      }),
    });
  } catch {
    return getFirestore(app);
  }
}
export const db = createDb();
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

  // 관리자/직원/경리 → 실 서비스
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
  // ⭐ serviceWorkerRegistration을 안 넘기면 getToken()이 자기가 알아서
  // "/firebase-messaging-sw.js"를 새로 등록하려 든다 — 이 앱은 이미 main.jsx에서
  // "/sw.js"를 루트 스코프에 등록해두고 있어서(그리고 그 안에서 FCM 처리까지
  // 합쳐뒀다, public/sw.js 참고), 서비스워커가 같은 스코프에 두 개 등록되며 충돌해
  // 백그라운드 푸시가 불안정했다. 이미 등록/활성화된 그 서비스워커를 그대로 써서
  // 충돌 자체를 없앤다.
  let swRegistration;
  try {
    swRegistration = ("serviceWorker" in navigator) ? await navigator.serviceWorker.ready : undefined;
  } catch {
    swRegistration = undefined;
  }
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
  if (!token) return;
  await updateDoc(doc(db, "users", user.uid), { fcmToken: token });
}

export async function initForegroundFCM(cb) {
  const messaging = await messagingPromise;
  if (!messaging) return;
  onMessage(messaging, (payload) => cb?.(payload));
}

// ======================= END =======================
