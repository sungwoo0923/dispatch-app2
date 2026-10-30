// ======================= src/emailCheck.js =======================
// 가입 화면 이메일 중복확인 — 로그인 전에는 보안 규칙상 users 목록을 읽을 수 없어
// (permission-denied) "확인 중 오류"가 떴다. 순서: ① Firestore 직접 조회(로그인 상태면 됨)
// → ② 서버 함수 checkEmail(로그인 없이 "사용 중 여부"만 알려줌) → ③ 둘 다 안 되면
// 확인 보류로 통과(가입 버튼을 누를 때 Firebase가 중복 이메일을 한 번 더 막는다).
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db, auth, FUNCTIONS_BASE } from "./firebase";

export async function checkEmailAvailable(email) {
  const e = String(email || "").trim();
  // 로그인 전이면 직접 조회는 어차피 거부되니 건너뛰고 바로 서버로(왕복 1번 절약)
  if (auth.currentUser) try {
    const snap = await getDocs(query(collection(db, "users"), where("email", "==", e), limit(1)));
    return snap.empty ? "free" : "used";
  } catch { /* 로그인 전 — 서버로 */ }
  try {
    const r = await fetch(`${FUNCTIONS_BASE}/checkEmail?e=${encodeURIComponent(e)}`);
    if (r.ok) { const j = await r.json(); if (typeof j.used === "boolean") return j.used ? "used" : "free"; }
  } catch { /* 서버 함수 배포 전 */ }
  return "unknown";
}

// 가입 화면이 열리자마자 서버 함수를 깨워 둔다(처음 부를 때 몇 초 걸리는 "콜드 스타트"를 미리 치움)
export function warmSignupFunctions() {
  try { fetch(`${FUNCTIONS_BASE}/checkEmail?ping=1`).catch(() => {}); } catch { /* 무시 */ }
}
