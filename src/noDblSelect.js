// ======================= src/noDblSelect.js =======================
// ⭐ 2026-11-10 엣지(Edge) 미니 도구창 끄기 — 엣지는 글자가 선택되면 "복사·추가 작업·검색·숨기기" 작은 창을 띄운다.
//  버튼·표·카드를 빠르게 두 번 누르면(더블클릭) 글자가 선택돼 이 창이 잠깐 떴다 사라졌다.
//  → 입력칸·문서 본문(복사할 만한 곳)이 아닌 곳에서는 더블클릭으로 글자가 선택되지 않게 막는다.
//    · 더블클릭 동작(오더 열기·사이드바 등)은 그대로 — 글자 선택만 막는다(mousedown 기본 동작만 취소)
//    · Shift·Alt를 누른 채 더블클릭하거나, 드래그로 고르는 선택은 그대로 된다
//    · 복사가 필요한 영역은 data-allow-select 를 붙이면 예외
const ALLOW = [
  "input", "textarea", "select", "[contenteditable='']", "[contenteditable='true']",
  "[data-allow-select]", "article", "pre", "code", ".kp-doc", ".ProseMirror", "[data-doc-body]",
].join(",");

export function installNoDblSelect() {
  if (typeof document === "undefined" || window.__kpNoDblSelect) return;
  window.__kpNoDblSelect = true;
  document.addEventListener("mousedown", (e) => {
    if (e.detail < 2 || e.button !== 0 || e.shiftKey || e.altKey) return;
    const t = e.target;
    if (!(t instanceof Element) || t.closest(ALLOW)) return;
    e.preventDefault(); // 두 번째 누름의 "단어 선택"만 막는다(click·dblclick 이벤트는 그대로 발생)
  }, true);
  // 혹시 남은 선택도 UI 위라면 바로 지운다
  document.addEventListener("dblclick", (e) => {
    const t = e.target;
    if (!(t instanceof Element) || t.closest(ALLOW) || e.shiftKey || e.altKey) return;
    const sel = window.getSelection?.();
    if (sel && !sel.isCollapsed) { try { sel.removeAllRanges(); } catch { /* 무시 */ } }
  }, true);
}
