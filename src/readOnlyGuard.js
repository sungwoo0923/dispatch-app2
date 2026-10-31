// ======================= src/readOnlyGuard.js =======================
// 🔒 조회 전용 가드(2026-11-01) — 지금 화면(메뉴)이 "조회"만 허락된 권한이면
//  수정·저장·삭제·등록 같은 버튼을 누르거나, 표의 칸을 두 번 눌러 수정 창을 열려 할 때
//  바로 "수정 권한이 없습니다"를 띄우고 막는다(창이 열린 뒤 저장했다고 나오고 실제로는 안 바뀌던 문제).
//  · 메뉴 이동·조회·검색·닫기·다운로드·인쇄 등은 그대로 쓸 수 있다.
//  · 특정 버튼을 예외로 두려면 그 버튼(또는 감싼 요소)에 data-ro-allow 를 붙인다.
import React from "react";

const EDIT_RX = /(저장|수정|삭제|등록|확정|적용|업로드|올리기|추가|변경|승인|반려|일괄|배차하기|배차 완료|배차완료|취소 처리|복사해 등록|붙여넣기|불러와 등록|전송|발송|보내기|교체|되돌리기|복구|초기화|정산 처리|마감|완료 처리|^\+\s)/;
const SAFE_RX = /(조회|검색|닫기|취소$|보기|다운|엑셀|CSV|인쇄|이전|다음|새로고침|필터|정렬|전체|오늘|최적화|로그아웃|메뉴|접기|펼치기|확인$|복사$|내역)/;
const isNavArea = (el) => !!el.closest(".kp-topnav, nav, aside, [data-ro-allow], .kp-side, [role=navigation]");

export function useReadOnlyGuard(active, notify) {
  const ref = React.useRef(notify);
  ref.current = notify;
  React.useEffect(() => {
    if (!active) return undefined;
    const say = () => (ref.current ? ref.current("조회 권한만 있어 수정할 수 없습니다.\n수정이 필요하면 관리자에게 권한을 요청해 주세요.") : window.alert("조회 권한만 있어 수정할 수 없습니다."));
    const onClick = (e) => {
      const el = e.target?.closest?.("button, [role=button], input[type=submit], a");
      if (!el || isNavArea(el)) return;
      const text = String(el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 16) return;
      if (SAFE_RX.test(text) && !/(수정|삭제|저장|등록)/.test(text)) return;
      if (!EDIT_RX.test(text)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      say();
    };
    // 표·카드를 두 번 눌러 수정 창 여는 동작
    const onDbl = (e) => {
      const el = e.target?.closest?.("td, tr, [data-editable]");
      if (!el || isNavArea(el)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      say();
    };
    const onSubmit = (e) => { e.preventDefault(); e.stopPropagation(); say(); };
    window.addEventListener("click", onClick, true);
    window.addEventListener("dblclick", onDbl, true);
    window.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("dblclick", onDbl, true);
      window.removeEventListener("submit", onSubmit, true);
    };
  }, [active]);
}
