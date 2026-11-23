// ======================= src/backdropGuard.js =======================
// 🪟 2026-11-23 팝업 바깥(어두운 배경)을 눌러도 팝업이 닫히지 않게 — 프로그램 전체(사용자 요청: "모든 팝업은 뒤를 찍는다고 닫아지면 안돼")
//  · 각 화면 코드를 고치지 않고 한 번에: 창(window) 맨 앞 단계(capture)에서 "어두운 배경 그 자체"를 누른 이벤트만 멈춘다
//    → 배경에 걸린 onClick / onMouseDown 닫기가 실행되지 않는다(× · 닫기 · 취소 · Esc 로 닫는다)
//  · 판정: 누른 곳이 화면의 대부분(가로 90% · 세로 85% 이상)을 덮는 층이고, 그 층(또는 바로 위 2단계 안)이
//    position: fixed 이며 반투명 배경(투명도 5~95%) 또는 흐림(backdrop-filter)이 있는 경우 = 팝업 뒤 어두운 배경
//    → 팝업 안의 내용(카드 · 버튼 · 입력칸)을 누른 건 그대로 · 투명한 "바깥 누르면 닫힘"(드롭다운 · 메뉴)도 그대로
//    · 흰 바탕 전체 화면(불투명)은 팝업 배경이 아니라 그대로
//  · 예외: data-backdrop-close 가 붙은 층(왼쪽 메뉴 · 옆 서랍처럼 바깥을 눌러 닫는 게 자연스러운 곳)
//  ⚠ 기본 동작(스크롤 · 포커스)은 막지 않고 전달만 멈춘다(stopPropagation)
// 🛠 2026-11-23 "누르기 · 클릭"만 막는다 — 떼기(mouseup · pointerup · touchend)까지 막았더니 지도를 끌다가 팝업 바깥에서 손을 떼면
//  지도가 "끌기 끝"을 못 받아 마우스를 계속 따라다녔다(관제센터). 떼기는 그대로 전달해 끌기 · 선택이 정상으로 끝나게.
const EVENTS = ["pointerdown", "mousedown", "click", "touchstart"];

const alphaOf = (color) => {
  const m = String(color || "").match(/rgba?\(([^)]+)\)/);
  if (!m) return 0;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length >= 4 ? Number(parts[3]) : 1;
};
const covers = (el) => {
  const r = el.getBoundingClientRect();
  return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.85;
};
const dimmed = (el) => {
  const cs = getComputedStyle(el);
  const a = alphaOf(cs.backgroundColor);
  const blur = cs.backdropFilter && cs.backdropFilter !== "none";
  return (a > 0.05 && a < 0.95) || (blur && a < 0.95);
};

// 누른 요소가 팝업 뒤 어두운 배경인가
export function isDimBackdrop(target) {
  const el = target && target.nodeType === 1 ? target : null;
  if (!el || el === document.body || el === document.documentElement) return false;
  if (el.closest?.("[data-backdrop-close]")) return false;
  if (!covers(el)) return false; // 팝업 안 내용을 누른 것
  if (alphaOf(getComputedStyle(el).backgroundColor) >= 0.95) return false; // 불투명한 판(화면을 꽉 채운 팝업 카드 · 흰 전체 화면)은 내용
  // 자신 또는 위로 2단계 안에 "고정 + 반투명" 층이 있어야 팝업 배경
  let n = el;
  for (let i = 0; i < 3 && n && n !== document.body; i++, n = n.parentElement) {
    if (!covers(n)) break;
    const pos = getComputedStyle(n).position;
    if ((pos === "fixed" || pos === "absolute") && dimmed(n)) {
      // absolute 배경이면 그 위가 fixed 여야(팝업 상자 안의 배경)
      if (pos === "fixed" || (n.parentElement && getComputedStyle(n.parentElement).position === "fixed")) return true;
    }
  }
  return false;
}

let installed = false;
export function installBackdropGuard() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // ⚡ 2026-11-23 한 번 누르면 pointerdown · mousedown · click 이 잇달아 온다 — 같은 곳이면 0.6초 동안 판정을 다시 쓴다(매번 크기 · 스타일을 재지 않게)
  let last = { t: null, at: 0, v: false };
  const stop = (e) => {
    const now = Date.now();
    let v;
    if (last.t === e.target && now - last.at < 600) v = last.v;
    else { v = isDimBackdrop(e.target); last = { t: e.target, at: now, v }; }
    if (v) e.stopPropagation();
  };
  EVENTS.forEach((t) => window.addEventListener(t, stop, { capture: true, passive: true }));
}
