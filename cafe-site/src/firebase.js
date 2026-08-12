// ======================= cafe-site/src/firebase.js =======================
// 배차마당(cafe-site)은 운송 프로그램(dispatch-app2) 본체와 빌드/배포는
// 완전히 분리되어 있지만, 같은 Firebase 프로젝트를 사용해 Auth 계정과
// cafeOrders 컬렉션을 공유한다. 설정값은 본체의 src/firebase.js와 동일하다.
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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

// 예전에는 IndexedDB 영구 캐시(persistentLocalCache + 멀티탭 tabManager)를 썼는데,
// 이 사이트는 여러 미리보기 배포/여러 탭에서 동시에 열리는 경우가 많고, 멀티탭
// 소유권 조정 과정에서 탭마다 BatchGetDocuments가 반복 발생해 Firestore 무료
// 요금제(Spark) 일일 읽기 한도를 예상보다 훨씬 빨리 소진시키는 원인이 됐다
// ("Quota exceeded" 팝업 + 콘솔의 resource-exhausted 429 반복이 그 증상이다).
// 실시간 게시판이라 오프라인 캐시가 꼭 필요하지도 않으므로, 기본 메모리 캐시로
// 되돌려 불필요한 읽기를 줄인다. 그래도 반복적으로 quota 문제가 발생한다면
// Firebase 콘솔에서 Firestore 사용량을 확인하고 Blaze(종량제) 요금제로 전환이
// 필요할 수 있다 — 이건 코드가 아니라 프로젝트 설정(과금) 문제라 여기서 고칠 수 없다.
export const db = getFirestore(app);
export const storage = getStorage(app);
