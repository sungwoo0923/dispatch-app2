// ======================= src/firebase.js =======================
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

// Firebase 설정 유지
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
// Auth & Firestore Export (⭐ 핵심 추가)
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
// 아래 메시징 관련 기존 코드 그대로 유지
// ====================================================
export const isTestUser = (u) => u?.role === "test";

export const getCollections = (user) => {
  const test = isTestUser(user);
  return test
    ? { dispatch: "dispatch_test", drivers: "drivers_test", clients: "clients_test" }
    : { dispatch: "dispatch", drivers: "drivers", clients: "clients" };
};

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
