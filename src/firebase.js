
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
  persistentMultipleTabManager,
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

// IndexedDB 영구 캐시 시도 → 실패 시 기본 메모리 캐시로 폴백.
// ⭐ persistentSingleTabManager → persistentMultipleTabManager로 변경: 관리자 화면의
// "모바일 미리보기"(같은 origin의 iframe으로 앱을 한 번 더 로드)를 열면, 같은
// IndexedDB를 두고 기존 탭과 미리보기가 서로 독점 접근권을 다투다 미리보기 쪽이
// "Failed to obtain exclusive access to persistence layer" 오류로 캐시 없이(메모리
// 전용) 동작하던 문제가 있었다. 여러 탭/프레임이 동시에 열려도 서로 캐시를 공유하며
// 정상 동작하게 한다.
function createDb() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
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
  if (!messaging) { console.warn("[FCM] 이 브라우저는 푸시 메시징을 지원하지 않습니다."); return; }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") { console.warn("[FCM] 알림 권한이 허용되지 않았습니다:", permission); return; }
  const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY;
  // ⭐ VAPID 키가 설정 안 돼 있으면 getToken()이 아예 토큰을 발급 못 받는다 — 이러면
  // 서비스워커/권한이 전부 정상이어도 푸시 자체가 불가능하다(fcmToken이 저장 안 되니
  // Cloud Function이 보낼 대상이 없음). Vercel 프로젝트 환경변수에
  // VITE_FCM_VAPID_KEY가 설정돼 있는지 꼭 확인해야 한다(Firebase 콘솔 → 프로젝트 설정
  // → 클라우드 메시징 → 웹 구성 → 키 쌍 생성).
  if (!vapidKey) {
    console.error("[FCM] VITE_FCM_VAPID_KEY가 설정되지 않았습니다 — 푸시 토큰을 발급받을 수 없습니다.");
    return;
  }
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
  try {
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
    if (!token) { console.warn("[FCM] 토큰을 발급받지 못했습니다."); return; }
    await updateDoc(doc(db, "users", user.uid), { fcmToken: token });
    console.log("[FCM] 토큰 저장 완료");
  } catch (e) {
    console.error("[FCM] 토큰 발급/저장 실패:", e);
  }
}

// ⭐ onMessage()가 돌려주는 구독 해제 함수를 그대로 반환해야 한다 — 예전엔
// 이 async 함수가 그 값을 안 돌려주고 있어서(암묵적으로 undefined 반환),
// 호출하는 쪽(MobileApp.jsx)이 "unsubscribe = initForegroundFCM(...)"로
// 받은 게 사실 Promise였고, cleanup에서 "typeof unsubscribe === 'function'"이
// 항상 false라 구독 해제가 한 번도 안 됐다. 그 결과 리스너가 리렌더될 때마다
// (알림음소거/알람 토글 등으로 이 effect가 재실행될 때마다) 계속 쌓여서, 포그라운드
// 알림 하나에 토스트가 2번·4번씩 겹쳐 뜨는 원인이 됐다.
export async function initForegroundFCM(cb) {
  const messaging = await messagingPromise;
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => cb?.(payload));
}

// ======================= END =======================
