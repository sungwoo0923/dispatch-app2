// ======================= src/mobileBack.js =======================
// 🔙 2026-11-10 모바일 뒤로가기 — 화면 위에 덮어 뜬 창(차량 관리대장 · 영수증 상세 등)을 휴대폰 뒤로가기(안드로이드 버튼 · 아이폰 밀기)로 닫는다
//  · useBackClose(열림, 닫기함수): 창이 열려 있는 동안 "뒤로 = 닫기"로 등록(여러 개면 맨 위 것부터)
//  · runMobileBack(): MobileApp 뒤로가기 처리에서 가장 먼저 부른다 — 닫은 창이 있으면 true(화면 이동 없음)
import React from "react";

const stack = [];
export function runMobileBack() {
  const fn = stack[stack.length - 1];
  if (!fn) return false;
  try { fn(); } catch { /* 무시 */ }
  return true;
}
export function useBackClose(active, onClose) {
  const ref = React.useRef(onClose);
  ref.current = onClose;
  React.useEffect(() => {
    if (!active) return undefined;
    const fn = () => ref.current?.();
    stack.push(fn);
    return () => { const i = stack.lastIndexOf(fn); if (i >= 0) stack.splice(i, 1); };
  }, [active]);
}
