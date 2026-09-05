// ======================= gom-hour-site/src/firebase.js =======================
// GOM_Hour 주문페이지는 배차관리 프로그램(dispatch-app2) 본체와 빌드/배포가
// 완전히 분리되어 있지만, 같은 Firebase 프로젝트를 그대로 사용해 Firestore의
// gomOrders / gomOptions / gomSettings / gomPickupCapacity 컬렉션만 공유한다.
// 설정값은 본체·cafe-site의 src/firebase.js와 동일하다.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
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

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// IndexedDB 영구 캐시 시도 → 실패 시 기본 메모리 캐시로 폴백 (본체와 동일한 방식)
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
