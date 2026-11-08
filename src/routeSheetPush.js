// ======================= src/routeSheetPush.js =======================
// 💰 2026-11-06 고정노선(배차표) 오더를 프로그램에서 고치면 → 바로 시트에 쓰기(서버 sync 1번)
//  · 서버의 자동 맞춤이 "시트가 바뀌었을 때만"(Drive modifiedTime) 시트를 읽게 바뀌어, 프로그램에서 고친 값은 여기서 바로 밀어 준다
//  · 같은 양식은 2.5초 안에 여러 번 고쳐도 한 번만 보낸다 · 둘러보기(데모)·로그인 전에는 보내지 않음
import { auth, FUNCTIONS_BASE } from "./firebase";

const timers = new Map();
const pendingDates = new Map(); // 🔗 2026-11-08 고친 오더의 상차일 — 서버가 그 날짜(지난달 탭 포함)를 맞춰 시트에 쓴다
const isPreview = () => { try { return window.location.pathname.startsWith("/preview"); } catch { return false; } };

async function pushNow(boardId, dates = []) {
  const token = await auth.currentUser?.getIdToken?.().catch(() => "");
  if (!token) return null;
  const res = await fetch(`${FUNCTIONS_BASE}/routeBoardSheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "sync", boardId, reason: "program-edit", ...(dates.length ? { dates } : {}) }),
  });
  try { return await res.json(); } catch { return null; }
}

// date: 고친 오더의 상차일("YYYY-MM-DD") — 주면 그 날짜를 맞춘다(안 주면 서버 기본 범위: 오늘~2주)
export function requestRouteSheetPush(boardId, delay = 2500, date = "") {
  const id = String(boardId || "").trim();
  if (!id || isPreview() || !auth.currentUser) return;
  const d = String(date || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const set = pendingDates.get(id) || new Set(); set.add(d); pendingDates.set(id, set); }
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => {
    timers.delete(id);
    const ds = [...(pendingDates.get(id) || [])].sort(); pendingDates.delete(id);
    pushNow(id, ds).catch(() => {});
  }, delay));
}
