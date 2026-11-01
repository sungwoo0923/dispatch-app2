
// ======================= src/firebase.js (FINAL FIXED) =======================
import * as FS from "firebase/firestore";
import * as AUTH from "firebase/auth";
import * as STG from "firebase/storage";
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
  deleteField,
  arrayRemove,
  arrayUnion,
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
// ⚠️ 접속 정보는 코드에 고정한다 — Vercel에 예전부터 있던 VITE_FIREBASE_* 값이 잘못된 키라
// 환경변수에서 읽게 바꿨더니 로그인이 전부 "api-key-not-valid"로 실패했다.
const firebaseConfig = {
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  authDomain: "dispatch-app-9b92f.firebaseapp.com",
  projectId: "dispatch-app-9b92f",
  storageBucket: "dispatch-app-9b92f.firebasestorage.app",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a",
  measurementId: "G-1NVFMVHQ28",
};
// 🧪 2026-11-02 테스트 전용 — VITE_USE_EMULATOR=1로 띄울 때만 로컬 가상 서버(Firebase 에뮬레이터)에 붙는다.
//  실제 배포(Vercel)에는 이 값이 없으므로 아무 영향 없다. 가상 회사로 권한별 실제 동작을 시험할 때 쓴다.
const USE_EMU = import.meta.env.VITE_USE_EMULATOR === "1";
if (USE_EMU) firebaseConfig.projectId = "demo-kpflow";
// 회사명이 비어있는 옛 문서를 어느 회사 소속으로 볼지
export const DEFAULT_COMPANY = "돌캐";
export const FUNCTIONS_BASE = USE_EMU ? "http://127.0.0.1:5001/demo-kpflow/us-central1" : `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
if (USE_EMU) { try { AUTH.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); } catch { /* 무시 */ } }

// IndexedDB 영구 캐시 시도 → 실패 시 기본 메모리 캐시로 폴백.
// ⭐ 한 라운드 persistentMultipleTabManager로 바꿔봤었는데(관리자 화면 "모바일
// 미리보기" iframe이 캐시 독점권을 못 얻어 뜨던 경고를 없애려는 목적), 그게
// 오히려 훨씬 심각한 사고를 냈다 — multiple-tab 모드는 탭 간 조율(리더 선출/변경
// 알림)에 localStorage를 많이 쓰는데, 이 프로그램은 오더 등록/수정이 잦아 그
// localStorage 용량 한도(수 MB)를 실제로 넘겨버렸다. 그 결과 "QuotaExceededError:
// Failed to execute 'setItem' on 'Storage'"가 나면서 Firestore SDK 내부 상태가
// 깨지고("FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state") 화면 자체가
// 정상적으로 안 뜨는 사고로 이어졌다(실사용 환경에서 재현 확인됨). "미리보기
// 캐시 경고"는 미리보기가 메모리 캐시로 도는 것뿐인 경미한 문제였는데, 그걸 고치려다
// 훨씬 큰 문제(전체 사용자 화면 크래시)를 만든 셈이라 원래 방식으로 되돌린다.
// ⭐ 휴대폰(앱) — 앱을 껐다가 몇 초 안에 다시 켜면, 꺼진 앱이 쥐고 있던 저장소 사용권(최대 약 5초)이 아직 남아 있어
// 새로 켠 앱이 폰에 저장된 오더를 못 쓰고 "메모리 저장"으로 떨어졌다 → 저장된 오더 없이 LTE로 처음부터 받느라
// 첫 화면이 "0 / N건"에서 한참 멈췄다. 휴대폰은 창이 하나뿐이라 사용권을 바로 가져오게 한다.
// (PC는 탭·관리자 화면의 모바일 미리보기 등 여러 창이 같이 쓰므로 지금처럼 둔다)
const IS_PHONE = typeof navigator !== "undefined" && /iphone|ipod|android(?!.*tablet)/i.test(navigator.userAgent || "") && !/ipad|tablet/i.test(navigator.userAgent || "");
function createDb() {
  if (USE_EMU) { const d = getFirestore(app); try { FS.connectFirestoreEmulator(d, "127.0.0.1", 8080); } catch { /* 무시 */ } return d; }
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager({ forceOwnership: IS_PHONE }),
      }),
    });
  } catch {
    return getFirestore(app);
  }
}
export const db = createDb();
// ⚡ 첫 로딩 "저장된 오더 불러오기" 단축 — PC에 저장된 오더가 많아지면 저장본에서 찾는 데 오래 걸렸다.
//  자주 쓰는 조회(상차일 범위 등)에 맞춰 저장본 안에 색인을 자동으로 만들어 두게 한다(SDK 기능, 서버 비용 없음).
try {
  const mgr = FS.getPersistentCacheIndexManager?.(db);
  if (mgr) FS.enablePersistentCacheIndexAutoCreation?.(mgr);
} catch { /* 지원 안 하는 환경 — 그대로 */ }
export const storage = getStorage(app);
if (USE_EMU) { try { STG.connectStorageEmulator(storage, "127.0.0.1", 9199); } catch { /* 무시 */ } }

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

// ⭐ 2026-11-01 로그아웃할 때 이 기기 알림 연결을 끊는다 — 한 휴대폰으로 A회사 → B회사 계정을 바꿔 쓰면
//  예전 계정 문서에 같은 기기 토큰이 남아, 지금 쓰지 않는 회사 알림까지 이 기기로 오던 문제
// ⭐ 2026-11-01 버그수정 — 예전엔 어느 기기에서 로그아웃하든 토큰을 지워서, PC에서 로그아웃만 해도
//  핸드폰(앱) 알림 연결이 끊겨 인사발령·결재 등 모든 푸시가 안 갔다. 이제 "이 기기 토큰"일 때만 지운다
// ⭐ 2026-11-02 로그아웃이 느리던 문제 — 예전엔 FCM 서버에 토큰을 다시 묻고(getToken)·계정 문서를 읽은 뒤(getDoc) 고쳐 써서
//  안드로이드·느린 통신에서 몇 초씩 걸렸다. 이제 이 기기에 기억해 둔 토큰으로 "한 번만" 쓴다(서버는 fcmTokensOut에 든 기기는 안 보낸다)
const FCM_LOCAL_KEY = "kpFcmToken";
export async function clearFcmToken(uid) {
  if (!uid) return;
  let mine = "";
  try { mine = localStorage.getItem(FCM_LOCAL_KEY) || ""; } catch { /* 무시 */ }
  if (!mine) return; // 이 기기는 알림 등록을 한 적이 없다(PC 등)
  try { await updateDoc(doc(db, "users", uid), { fcmTokens: arrayRemove(mine), fcmTokensOut: arrayUnion(mine) }); } catch { /* 무시 */ }
}

export async function saveFcmToken(user) {
  if (!user) return;
  const messaging = await messagingPromise;
  if (!messaging) { console.warn("[FCM] 이 브라우저는 푸시 메시징을 지원하지 않습니다."); return; }
  // ⭐ 아이폰은 버튼을 누를 때만 권한을 물을 수 있다(자동 요청은 무시·거부됨) — 이미 허용이면 바로 진행
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission().catch(() => "default");
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
    // ⭐ 2026-11-02 한 계정 여러 기기(안드로이드·아이폰·PC) — 최근 기기 5대까지 fcmTokens에 함께 저장(서버가 모두에게 보낸다)
    let list = [token];
    try { const cur = (await getDoc(doc(db, "users", user.uid))).data() || {}; list = [token, ...[cur.fcmToken, ...(Array.isArray(cur.fcmTokens) ? cur.fcmTokens : [])].filter((t) => t && t !== token)]; } catch { /* 무시 */ }
    await updateDoc(doc(db, "users", user.uid), { fcmToken: token, fcmTokenAt: Date.now(), fcmTokens: [...new Set(list)].slice(0, 5), fcmTokensOut: arrayRemove(token) });
    try { localStorage.setItem(FCM_LOCAL_KEY, token); } catch { /* 무시 */ }
    console.log("[FCM] 토큰 저장 완료");
  } catch (e) {
    console.error("[FCM] 토큰 발급/저장 실패:", e);
  }
}

// ⭐ "설정은 다 켜놨는데 이 기기만 푸시가 안 온다"는 리포트가 나올 때, 지금까지는
// saveFcmToken()이 실패해도 console 로그만 남기고 조용히 return해서, 특히
// 아이폰처럼 사용자가 개발자도구를 열어 확인하기 어려운 기기에서는 "어디서
// 왜 막혔는지"를 전혀 알 수 없었다. saveFcmToken()과 똑같은 단계를 그대로
// 밟되, 각 단계에서 실패하면 그 이유를 사람이 읽을 수 있는 문자열로 돌려준다
// (alert()으로 그 기기 화면에 바로 띄워서 확인할 수 있게 — 모바일 설정의
// "FCM 토큰 진단" 버튼에서 사용).
export async function diagnoseFcmToken(user) {
  if (!user) return { ok: false, reason: "로그인 정보가 없습니다." };
  if (!("Notification" in window)) return { ok: false, reason: "이 브라우저는 알림(Notification API)을 지원하지 않습니다." };

  const messaging = await messagingPromise;
  if (!messaging) {
    return {
      ok: false,
      reason:
        "이 브라우저/환경은 Firebase 메시징을 지원하지 않는다고 판단됐습니다(isSupported()===false). " +
        "아이폰의 경우 홈 화면에 앱을 추가해 그 아이콘으로 실행 중인지 확인해주세요 — Safari 탭에서 직접 열면 지원되지 않을 수 있습니다.",
    };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    try { permission = await Notification.requestPermission(); } catch (e) { return { ok: false, reason: `권한 요청 자체가 실패했습니다: ${e?.message || e}` }; }
  }
  if (permission !== "granted") {
    return { ok: false, reason: `알림 권한이 "${permission}" 상태입니다. 기기 설정 > 이 앱 > 알림에서 허용으로 바꿔주세요.` };
  }

  const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY;
  if (!vapidKey) {
    return { ok: false, reason: "VITE_FCM_VAPID_KEY가 설정되어 있지 않습니다(배포 환경변수 누락) — 개발자에게 알려주세요." };
  }

  let swRegistration;
  try {
    swRegistration = ("serviceWorker" in navigator) ? await navigator.serviceWorker.ready : undefined;
  } catch (e) {
    return { ok: false, reason: `서비스워커 준비 확인 중 오류: ${e?.message || e}` };
  }
  if (!swRegistration) {
    return { ok: false, reason: "서비스워커가 등록돼 있지 않습니다 — 앱을 완전히 종료했다가 다시 열어주세요." };
  }

  try {
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: swRegistration });
    if (!token) return { ok: false, reason: "getToken()이 토큰 없이 빈 값을 반환했습니다(원인 불명 — iOS Safari 자체 버그일 수 있음)." };
    let list = [token];
    try { const cur = (await getDoc(doc(db, "users", user.uid))).data() || {}; list = [token, ...[cur.fcmToken, ...(Array.isArray(cur.fcmTokens) ? cur.fcmTokens : [])].filter((t) => t && t !== token)]; } catch { /* 무시 */ }
    await updateDoc(doc(db, "users", user.uid), { fcmToken: token, fcmTokenAt: Date.now(), fcmTokens: [...new Set(list)].slice(0, 5), fcmTokensOut: arrayRemove(token) });
    try { localStorage.setItem(FCM_LOCAL_KEY, token); } catch { /* 무시 */ }
    return { ok: true, token };
  } catch (e) {
    return { ok: false, reason: `토큰 발급 중 오류: ${e?.name || ""} ${e?.message || e}` };
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
