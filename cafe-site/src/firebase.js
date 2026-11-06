// ======================= cafe-site/src/firebase.js =======================
// 배차마당(cafe-site)은 운송 프로그램(dispatch-app2) 본체와 빌드/배포는
// 완전히 분리되어 있지만, 같은 Firebase 프로젝트를 사용해 Auth 계정과
// cafeOrders 컬렉션을 공유한다. 설정값은 본체의 src/firebase.js와 동일하다.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  authDomain: "dispatch-app-9b92f.firebaseapp.com",
  projectId: "dispatch-app-9b92f",
  storageBucket: "dispatch-app-9b92f.firebasestorage.app",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a",
  measurementId: "G-1NVFMVHQ28",
};

// ⭐ 2026-11-06 테스트 전용 — VITE_USE_EMULATOR=1로 띄울 때만 로컬 가상 서버(Firebase 에뮬레이터)에 붙는다.
//  본체(src/firebase.js)와 같은 가상 프로젝트 이름(demo-kpflow)을 써서 두 앱이 같은 가상 데이터를 본다.
const USE_EMU = import.meta.env.VITE_USE_EMULATOR === "1";
if (USE_EMU) firebaseConfig.projectId = "demo-kpflow";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
if (USE_EMU) { try { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); } catch { /* 무시 */ } }

// IndexedDB 영구 캐시 시도 → 실패 시 기본 메모리 캐시로 폴백 (본체와 동일한 방식)
function createDb() {
  if (USE_EMU) {
    const d = getFirestore(app);
    try { connectFirestoreEmulator(d, "127.0.0.1", 8080); } catch { /* 무시 */ }
    return d;
  }
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
