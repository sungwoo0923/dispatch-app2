import { useEffect } from "react";

// 모달/사이드패널처럼 화면을 덮는 오버레이가 떠 있는 동안 뒤쪽 배경이
// 스크롤되지 않도록 막는다. iOS Safari는 body에 overflow:hidden만 줘서는
// 배경이 계속 스크롤/바운스되므로(안드로이드 크롬은 그걸로 충분), body
// 자체를 position:fixed로 고정하고 스크롤 위치를 기억했다가 닫힐 때
// 되돌리는 방식을 함께 쓴다. Modal/SidePanel 등 여러 오버레이 컴포넌트가
// 동일한 body[data-modal-open] 표시를 공유해, 하단 고정 탭바를 오버레이가
// 떠 있는 동안 숨기는 index.css 규칙도 함께 적용된다.
//
// 모달 안에서 또 다른 모달을 여는 중첩 팝업(예: 센터 상세 팝업 안의 주소
// 검색 팝업)에서는 두 인스턴스가 동시에 이 훅을 쓴다. 각자 독립적으로
// "이전 스타일"을 캡처/복원하면, 안쪽 팝업이 먼저 닫힐 때 자기가 열릴
// 당시 이미 잠겨 있던 body 스타일을 "원래 상태"로 착각해 되돌리면서도
// data-modal-open을 지워버려, 바깥 팝업이 아직 떠 있는데도 하단 탭바가
// 다시 나타나 버튼을 덮어버리는 문제가 있었다. 참조 카운트를 둬서 가장
// 바깥(처음) 잠금만 실제 페이지 스타일을 캡처/복원하도록 한다.
let lockCount = 0;
let savedStyle = null;
let savedScrollY = 0;

export function useBodyScrollLock(open) {
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      savedStyle = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.width = "100%";
      body.dataset.modalOpen = "true";
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0 && savedStyle) {
        body.style.overflow = savedStyle.overflow;
        body.style.position = savedStyle.position;
        body.style.top = savedStyle.top;
        body.style.width = savedStyle.width;
        delete body.dataset.modalOpen;
        window.scrollTo(0, savedScrollY);
        savedStyle = null;
      }
    };
  }, [open]);
}
