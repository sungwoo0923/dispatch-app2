// ======================= src/loginSessions.js =======================
// ⭐ 로그인 관리(2026-10-22 요청) — 계정마다 "PC 1대 + 모바일 1대"까지만 동시에 로그인.
//  - 로그인하면 loginSessions/{세션ID} 문서를 하나 만든다(이 기기 = 이 브라우저).
//  - 같은 종류(PC↔PC, 모바일↔모바일) 기기가 이미 로그인돼 있으면 "기존 로그인 끊고 로그인할지" 묻는다.
//  - 끊긴 기기는 자기 세션 문서를 지켜보다가 active:false가 되면 바로 로그아웃된다.
//  - 최고관리자는 중복 로그인 제한 없음(목록에는 그대로 보인다).
// 문서: { uid, email, name, role, companyName, kind:"pc"|"mobile", device, createdAt, lastSeen,
//         active, endedAt, endReason:"logout"|"duplicate"|"kicked"|"password"|"admin", endedBy }
import { db, auth } from "./firebase";
import {
  collection, doc, setDoc, updateDoc, getDoc, getDocs, query, where, onSnapshot, serverTimestamp, writeBatch,
} from "firebase/firestore";
import { beforeAuthStateChanged } from "firebase/auth";

export const SESSIONS_COLL = "loginSessions";
const LS_KEY = "kpLoginSession"; // { uid, id }
const STALE_DAYS = 30; // 30일 넘게 활동이 없던 세션은 중복 판단에서 뺀다(브라우저를 지웠거나 안 쓰는 기기)
const HEARTBEAT_MS = 10 * 60 * 1000;

export const KIND_LABEL = { pc: "PC", mobile: "모바일" };
export const END_REASON_LABEL = {
  logout: "로그아웃",
  duplicate: "다른 기기 로그인으로 끊김",
  kicked: "연결 끊기",
  password: "비밀번호 변경",
  admin: "관리자가 끊음",
  expired: "장기간 미사용",
};

export function isTotalMasterRole(role, email) {
  return role === "totalMaster" || email === "tjddnqkf@naver.com";
}

// 기기 종류 — 휴대폰(앱 포함)은 모바일, 태블릿·PC는 PC
export function getDeviceKind() {
  try {
    if (window.Capacitor?.isNativePlatform?.()) return "mobile";
    const ua = navigator.userAgent.toLowerCase();
    const isIpad = (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || ua.includes("ipad");
    if (isIpad || ua.includes("tablet")) return "pc";
    return /iphone|ipod|android(?!.*tablet)/.test(ua) || window.innerWidth < 768 ? "mobile" : "pc";
  } catch {
    return "pc";
  }
}

// 사람이 알아보기 쉬운 기기 이름(예: "Windows · Chrome", "Android · 앱")
export function getDeviceLabel() {
  try {
    const ua = navigator.userAgent;
    const os = /Windows/i.test(ua) ? "Windows" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Android/i.test(ua) ? "Android"
      : /Mac OS X/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "기타";
    const app = window.Capacitor?.isNativePlatform?.() ? "앱"
      : /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/i.test(ua) ? "삼성인터넷" : /KAKAOTALK/i.test(ua) ? "카카오톡"
        : /Whale/i.test(ua) ? "웨일" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "브라우저";
    return `${os} · ${app}`;
  } catch {
    return "알 수 없는 기기";
  }
}

export function getStoredSession() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; }
}
function storeSession(v) {
  try { v ? localStorage.setItem(LS_KEY, JSON.stringify(v)) : localStorage.removeItem(LS_KEY); } catch { /* 무시 */ }
}
export function getMySessionId() {
  const s = getStoredSession();
  return s && s.uid === auth.currentUser?.uid ? s.id : null;
}

const tsMs = (t) => (t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : 0);
export const sessionLastMs = (s) => Math.max(tsMs(s.lastSeen), tsMs(s.createdAt));
const isLive = (s) => s.active !== false && Date.now() - sessionLastMs(s) < STALE_DAYS * 86400000;

export async function listUserSessions(uid) {
  const snap = await getDocs(query(collection(db, SESSIONS_COLL), where("uid", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * 로그인 직후 1번 호출 — 이 기기 세션을 확인/등록한다.
 * 반환: { status: "ok" } | { status: "conflict", conflicts: [...] } | { status: "revoked", reason }
 */
export async function checkLoginSession(user, info) {
  const kind = getDeviceKind();
  const stored = getStoredSession();
  if (stored && stored.uid === user.uid && stored.id) {
    const snap = await getDoc(doc(db, SESSIONS_COLL, stored.id));
    if (snap.exists()) {
      const d = snap.data();
      if (d.active === false) {
        storeSession(null);
        return { status: "revoked", reason: d.endReason || "kicked" };
      }
      return { status: "ok", id: stored.id };
    }
    storeSession(null); // 문서가 없어졌으면 새 로그인처럼 처리
  }
  if (isTotalMasterRole(info.role, user.email)) {
    const id = await createSession(user, info, kind);
    return { status: "ok", id };
  }
  const conflicts = (await listUserSessions(user.uid)).filter((s) => s.kind === kind && isLive(s));
  if (conflicts.length) return { status: "conflict", conflicts, kind };
  const id = await createSession(user, info, kind);
  return { status: "ok", id };
}

export async function createSession(user, info, kind = getDeviceKind()) {
  const ref = doc(collection(db, SESSIONS_COLL));
  await setDoc(ref, {
    uid: user.uid,
    email: user.email || "",
    name: info.name || "",
    role: info.role || "",
    companyName: info.companyName || "",
    kind,
    device: getDeviceLabel(),
    createdAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    active: true,
  });
  storeSession({ uid: user.uid, id: ref.id });
  return ref.id;
}

// 세션 여러 개를 끊는다(문서는 기록으로 남겨둔다)
export async function endSessions(ids, reason, endedBy = "") {
  if (!ids.length) return;
  const batch = writeBatch(db);
  ids.forEach((id) => batch.update(doc(db, SESSIONS_COLL, id), {
    active: false, endedAt: serverTimestamp(), endReason: reason, endedBy,
  }));
  await batch.commit();
}

// "기존 로그인 끊고 로그인" — 겹치는 세션을 끊고 이 기기를 등록
export async function replaceAndCreate(user, info, conflicts) {
  await endSessions(conflicts.map((c) => c.id), "duplicate", getDeviceLabel());
  return createSession(user, info);
}

// 내 세션이 끊기는지 지켜본다 — 끊기면 onRevoked(reason)
export function watchMySession(id, onRevoked) {
  let fired = false;
  const unsub = onSnapshot(doc(db, SESSIONS_COLL, id), (snap) => {
    if (fired) return;
    // 캐시에만 있는 "문서 없음"은 무시(오프라인 첫 로딩 등) — 서버가 확인해준 경우만 반영
    if (!snap.exists() && snap.metadata.fromCache) return;
    const d = snap.data();
    if (!snap.exists() || d?.active === false) {
      fired = true;
      storeSession(null);
      onRevoked(d?.endReason || "kicked");
    }
  }, () => { /* 권한 오류 등은 무시 — 로그인 자체는 막지 않는다 */ });
  return unsub;
}

// 마지막 활동 시각 갱신(10분마다, 화면이 보일 때만)
export function startHeartbeat(id) {
  const beat = () => {
    if (document.visibilityState !== "visible") return;
    updateDoc(doc(db, SESSIONS_COLL, id), { lastSeen: serverTimestamp(), device: getDeviceLabel() }).catch(() => {});
  };
  beat();
  const t = setInterval(beat, HEARTBEAT_MS);
  const onVis = () => { if (document.visibilityState === "visible") beat(); };
  document.addEventListener("visibilitychange", onVis);
  return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
}

// 로그아웃 버튼을 누르면(어디서 누르든) 로그아웃되기 "직전"에 이 기기 세션을 종료로 기록한다.
// 로그아웃 뒤에는 권한이 없어 기록할 수 없으므로 beforeAuthStateChanged를 쓴다.
let endOnSignOutInstalled = false;
export function installEndOnSignOut() {
  if (endOnSignOutInstalled) return;
  endOnSignOutInstalled = true;
  beforeAuthStateChanged(auth, async (next) => {
    if (next) return;
    const id = getMySessionId();
    if (!id) return;
    storeSession(null);
    try {
      await Promise.race([
        updateDoc(doc(db, SESSIONS_COLL, id), { active: false, endedAt: serverTimestamp(), endReason: "logout" }),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch { /* 이미 끊긴 세션 등 — 무시 */ }
  });
}

export function timeAgo(ms) {
  if (!ms) return "-";
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}일 전` : new Date(ms).toLocaleDateString("ko-KR");
}
