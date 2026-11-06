// ======================= src/routeSheetPush.js =======================
// 💰 2026-11-06 고정노선(배차표) 오더를 프로그램에서 고치면 → 바로 시트에 쓰기(서버 sync 1번)
//  · 서버의 자동 맞춤이 "시트가 바뀌었을 때만"(Drive modifiedTime) 시트를 읽게 바뀌어, 프로그램에서 고친 값은 여기서 바로 밀어 준다
//  · 같은 양식은 2.5초 안에 여러 번 고쳐도 한 번만 보낸다 · 둘러보기(데모)·로그인 전에는 보내지 않음
import { auth, FUNCTIONS_BASE } from "./firebase";

const timers = new Map();
const isPreview = () => { try { return window.location.pathname.startsWith("/preview"); } catch { return false; } };

async function pushNow(boardId) {
  const token = await auth.currentUser?.getIdToken?.().catch(() => "");
  if (!token) return null;
  const res = await fetch(`${FUNCTIONS_BASE}/routeBoardSheet`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "sync", boardId, reason: "program-edit" }),
  });
  try { return await res.json(); } catch { return null; }
}

export function requestRouteSheetPush(boardId, delay = 2500) {
  const id = String(boardId || "").trim();
  if (!id || isPreview() || !auth.currentUser) return;
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => { timers.delete(id); pushNow(id).catch(() => {}); }, delay));
}
