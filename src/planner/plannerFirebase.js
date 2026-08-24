// src/planner/plannerFirebase.js
// ⭐ KP-Planner는 배차프로그램과 같은 Firebase 프로젝트/같은 도메인(origin)을 쓰지만,
// Firebase Auth 로그인 세션은 기본적으로 "같은 origin이면 하나만" 공유되기 때문에
// 배차프로그램과 같은 auth 인스턴스를 그대로 재사용하면 한쪽에서 로그아웃할 때
// 다른 쪽도 같이 로그아웃되는 문제가 생긴다("KP-Planner 로그아웃하면 배차프로그램도
// 같이 로그아웃됨"). 이름이 다른 두 번째 Firebase App 인스턴스를 만들면 세션 저장
// 키(localStorage/IndexedDB 네임스페이스)가 서로 달라져서 완전히 독립된 로그인
// 세션을 갖게 된다 — 같은 프로젝트/데이터베이스를 보되, 로그인은 서로 무관하다.
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";
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

const PLANNER_APP_NAME = "kp-planner";

const plannerApp = getApps().some((a) => a.name === PLANNER_APP_NAME)
  ? getApp(PLANNER_APP_NAME)
  : initializeApp(firebaseConfig, PLANNER_APP_NAME);

export const plannerAuth = getAuth(plannerApp);

function createPlannerDb() {
  try {
    return initializeFirestore(plannerApp, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: false }),
      }),
    });
  } catch {
    return getFirestore(plannerApp);
  }
}
export const plannerDb = createPlannerDb();

// 영수증 사진 업로드용 — plannerAccounts/plannerEntries와 같은 프로젝트를 쓰되,
// 파일은 kp-planner/ 하위 경로에만 저장한다(배차프로그램 파일과 섞이지 않게).
export const plannerStorage = getStorage(plannerApp);
