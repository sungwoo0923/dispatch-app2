import { useEffect } from "react";

// 모달/사이드패널처럼 화면을 덮는 오버레이가 떠 있는 동안 뒤쪽 배경이
// 스크롤되지 않도록 막는다. iOS Safari는 body에 overflow:hidden만 줘서는
// 배경이 계속 스크롤/바운스되므로(안드로이드 크롬은 그걸로 충분), body
// 자체를 position:fixed로 고정하고 스크롤 위치를 기억했다가 닫힐 때
// 되돌리는 방식을 함께 쓴다. Modal/SidePanel 등 여러 오버레이 컴포넌트가
// 동일한 body[data-modal-open] 표시를 공유해, 하단 고정 탭바를 오버레이가
// 떠 있는 동안 숨기는 index.css 규칙도 함께 적용된다.
export function useBodyScrollLock(open) {
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.dataset.modalOpen = "true";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      delete body.dataset.modalOpen;
      window.scrollTo(0, scrollY);
    };
  }, [open]);
}
