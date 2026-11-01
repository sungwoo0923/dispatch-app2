// src/freeEmail.js
// ⭐ 2026-11-01 삭제된 계정(직원 삭제·운송사 삭제)의 이메일로 다른 사람이 다시 가입할 때 —
// 서버가 남아 있던 로그인 계정을 지워 주면 true(그 뒤 가입을 다시 시도)
import { FUNCTIONS_BASE } from "./firebase";
export async function freeDeletedEmail(email) {
  try {
    const r = await fetch(`${FUNCTIONS_BASE}/freeDeletedEmail?e=${encodeURIComponent(String(email || "").trim())}`);
    if (!r.ok) return false;
    const j = await r.json();
    return j?.freed === true;
  } catch { return false; }
}
