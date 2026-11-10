// ======================= pnk-site/src/firebase.js =======================
// PnK PROJECT 인트라넷 — 로지스웹 운송 프로그램(src/firebase.js) · 로지스웹 허브(cafe-site)와 같은 Firebase 프로젝트를 쓴다.
//  로그인 계정은 그대로 같고, 인트라넷 데이터는 pnk 로 시작하는 컬렉션(pnkMembers · pnkPosts …)과 Storage pnk/ 경로에만 둔다.
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken as getAppCheckToken } from "firebase/app-check";
import { setupAppCheck } from "../../src/appCheckClient";
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
// ⭐ 2026-11-06 포트는 VITE_EMU_AUTH_PORT · VITE_EMU_FS_PORT · VITE_EMU_STORAGE_PORT 로 바꿀 수 있다(기본 9099 · 8080 · 9199).
export const USE_EMU = import.meta.env.VITE_USE_EMULATOR === "1";
const EMU_AUTH = Number(import.meta.env.VITE_EMU_AUTH_PORT || 9099);
const EMU_FS = Number(import.meta.env.VITE_EMU_FS_PORT || 8080);
const EMU_ST = Number(import.meta.env.VITE_EMU_STORAGE_PORT || 9199);
if (USE_EMU) firebaseConfig.projectId = "demo-kpflow"; // (Storage 버킷 이름은 본체와 같게 둔다 — 관리센터가 같은 서류를 본다)

const app = initializeApp(firebaseConfig);
// 🛡 2026-11-08 App Check — 인트라넷 Vercel 프로젝트의 VITE_APPCHECK_SITE_KEY 가 없으면 아무것도 안 한다(본체와 같은 키를 써도 된다).
//  설명: src/appCheckClient.js · docs/appcheck-setup.md. 서버 함수 주소로 가는 fetch 에 토큰 헤더를 붙이고, 호출형(httpsCallable)은 SDK가 붙인다.
export const appCheck = setupAppCheck({
  app,
  sdk: { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken: getAppCheckToken },
  siteKey: import.meta.env.VITE_APPCHECK_SITE_KEY,
  debug: import.meta.env.VITE_APPCHECK_DEBUG,
  functionsBase: `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`,
  disabled: USE_EMU,
});

// ⭐ 2026-11-07 로그인 유지 — getAuth 기본 저장은 이 기기 IndexedDB(없으면 localStorage, 둘 다 browserLocal 계열)라
//  앱(브라우저)을 껐다 켜도 로그아웃 전까지 계속 로그인돼 있다. 인트라넷도 같은 방식.
//  (세션 저장으로 바꾸지 말 것 — 차주가 매번 로그인해야 하고, 문자 인증 · 기기 등록 흐름도 다시 탄다)
export const auth = getAuth(app);
if (USE_EMU) { try { connectAuthEmulator(auth, `http://127.0.0.1:${EMU_AUTH}`, { disableWarnings: true }); } catch { /* 무시 */ } }

// IndexedDB 영구 캐시 시도 → 실패 시 기본 메모리 캐시로 폴백 (본체와 동일한 방식)
function createDb() {
  if (USE_EMU) {
    const d = getFirestore(app);
    try { connectFirestoreEmulator(d, "127.0.0.1", EMU_FS); } catch { /* 무시 */ }
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

// 자료실 파일 — Storage pnk/files/ 경로(규칙: storage.rules)
export const storage = getStorage(app);
if (USE_EMU) { try { connectStorageEmulator(storage, "127.0.0.1", EMU_ST); } catch { /* 무시 */ } }
