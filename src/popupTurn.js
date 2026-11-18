// ======================= src/popupTurn.js =======================
// 🪟 2026-11-18 접속 팝업 차례 정하기 — 여러 팝업이 한꺼번에 화면 가운데 겹쳐 뜨지 않게 한 번에 하나만
//  사용자 요청: "공지사항 · 전자결재 등이 따로따로 화면 가운데 뜬다 → 하나로 묶어서"
//  · 알림 브리핑(NotifyCenter — 공지 · 결재 · 인사 · 인수인계를 한 창에 묶음)이 맨 먼저
//  · 그다음 인사발령 축하 → 생일 축하 → 일일 경영 보고(임원) 순서
//  사용: const myTurn = usePopupTurn("birthday", wantToShow) — 내 차례일 때만 true
import React from "react";

export const POPUP_ORDER = ["notify", "orderCongrats", "birthday", "briefing"];
const want = new Map(); // id → true
const listeners = new Set();
let version = 0;
const emit = () => { version += 1; listeners.forEach((f) => f()); };
const subscribe = (f) => { listeners.add(f); return () => listeners.delete(f); };
const snap = () => version;

// 지금 차례인 팝업 id(보여 주고 싶은 것 중 순서가 가장 앞)
export function currentTurn() {
  const rank = (id) => { const i = POPUP_ORDER.indexOf(id); return i < 0 ? POPUP_ORDER.length : i; };
  return [...want.keys()].sort((a, b) => rank(a) - rank(b))[0] || "";
}
export function setWant(id, on) {
  const had = want.has(id);
  if (on && !had) { want.set(id, true); emit(); } else if (!on && had) { want.delete(id); emit(); }
}
export function usePopupTurn(id, wantToShow) {
  React.useSyncExternalStore(subscribe, snap, snap);
  React.useEffect(() => { setWant(id, !!wantToShow); return () => setWant(id, false); }, [id, wantToShow]);
  return !!wantToShow && currentTurn() === id;
}
// 테스트용
export const _reset = () => { want.clear(); emit(); };
