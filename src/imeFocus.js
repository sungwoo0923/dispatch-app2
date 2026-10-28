// ======================= src/imeFocus.js =======================
// ⌨️ 한글 입력 우선(2026-10-28) — 팝업이 열리며 자동으로 커서를 넣는 입력칸에서 첫 글자가 영문으로 들어가던 문제.
//  원인: 크롬(윈도우)은 "글자 입력칸"에 포커스가 있을 때만 한글 입력기를 켠다.
//   ① 팝업 바탕(div)에 먼저 포커스를 두고 첫 키를 받은 뒤 입력칸으로 넘기면, 그 첫 키는 입력기가 꺼진 상태라 영문.
//   ② 화면이 그려지는 도중(React autoFocus) 포커스를 주면 입력기가 붙기 전에 첫 키가 들어갈 때가 있다.
//  해결: 화면이 다 그려진 다음 입력칸에 직접 포커스를 준다(바탕 div 경유 X). 사용자가 한/영으로 영문을 고른 경우는 그대로.
export function focusIme(el) {
  if (!el) return;
  requestAnimationFrame(() => setTimeout(() => {
    if (!el.isConnected) return;
    try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  }, 0));
}
// autoFocus 대신 ref={imeFocusRef} — 처음 나타날 때 한 번만
export function imeFocusRef(el) {
  if (el && !el.dataset.kpImeFocused) { el.dataset.kpImeFocused = "1"; focusIme(el); }
}
