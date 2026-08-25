// src/planner/useLongPress.js — 리스트 행을 "길게 누르면" 수정/삭제 선택 팝업이
// 뜨게 하는 헬퍼. .map() 반복문 안에서 행마다 바로 호출해 쓰는 용도라 React 훅이
// 아니라 그냥 클로저 팩토리로 만들었다(훅은 반복문 안에서 호출할 수 없어서).
//
// onClick까지 이 함수가 함께 돌려준다 — 터치 기기에서는 길게 눌러 팝업이 뜬
// 순간에도(손가락은 아직 안 뗀 상태) 손을 떼면 그 위치에서 click 이벤트가 한 번
// 더 발생해, 팝업이 떠 있는데 원래 onClick(수정창 바로 열기)까지 같이 실행되는
// 문제가 있었다 — 길게 눌러서 팝업을 띄운 경우엔 그 클릭을 무시하도록 fired
// 플래그로 막는다.
export default function longPressHandlers(onLongPress, onClick, ms = 520) {
  let timer = null;
  let fired = false;
  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  return {
    onPointerDown: () => {
      fired = false;
      clear();
      timer = setTimeout(() => {
        fired = true;
        onLongPress();
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: (e) => {
      if (fired) { fired = false; return; }
      onClick?.(e);
    },
    // 모바일 브라우저 기본 길게누르기 메뉴(텍스트 선택/저장 등)가 같이 뜨는 걸 막는다.
    onContextMenu: (e) => { if (fired) e.preventDefault(); },
  };
}
