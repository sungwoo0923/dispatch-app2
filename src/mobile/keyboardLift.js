// ======================= src/mobile/keyboardLift.js =======================
// ⌨️ 2026-11-24 휴대폰 자판이 입력칸 · 자동완성 드롭다운(거래처명 · 상하차지명 등)을 가리지 않게
//  사용자 요청: "거래처명 · 상하차지명 드롭다운을 누르면 자판 때문에 드롭다운이 안 보여"
//  · 입력칸에 들어가면(자판이 올라온 뒤) 그 칸을 화면 위쪽(72px)으로 올려, 아래로 열리는 목록이 자판 위에 보이게 한다
//  · 자판 높이를 --kp-kb 로 알려 준다(모바일 입력 화면 아래 여백 — 끝 칸도 위로 올릴 수 있게)
//  · 칸이 들어 있는 스크롤 상자(overflow auto)가 있으면 그 상자를, 없으면 화면(window)을 굴린다. 고정 창(모달) 안 칸은 건드리지 않는다
//  · data-no-kblift 가 달린 곳 안은 건너뛴다
const FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=date]):not([type=time]):not([type=file]):not([type=button]):not([readonly]), textarea';
const TOP = 72;   // 올린 뒤 칸 위치(위에서)
const ROOM = 230; // 칸 아래에 남겨야 할 자리(드롭다운 높이 쯤)

function scroller(el) {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) return p;
    if (cs.position === "fixed") return "fixed";
  }
  return null;
}

export function installKeyboardLift() {
  if (typeof window === "undefined" || window.__kpKbLift) return () => {};
  window.__kpKbLift = true;
  let t = 0; let cur = null;
  const vv = window.visualViewport;
  const kbH = () => (vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0);
  const setVar = () => { try { document.documentElement.style.setProperty("--kp-kb", `${Math.round(kbH())}px`); } catch { /* 무시 */ } };
  const lift = () => {
    setVar();
    const el = cur;
    if (!el || document.activeElement !== el || !el.isConnected || el.closest("[data-no-kblift]")) return;
    const vh = vv ? vv.height : window.innerHeight;
    const r = el.getBoundingClientRect();
    if (r.top >= TOP - 8 && r.bottom + ROOM <= vh) return; // 이미 잘 보임
    const dy = r.top - TOP;
    const box = scroller(el);
    if (box === "fixed") return;
    if (box) box.scrollBy({ top: dy, behavior: "smooth" });
    else window.scrollBy({ top: dy, behavior: "smooth" });
  };
  const onFocus = (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || !el.matches(FIELD)) return;
    cur = el; clearTimeout(t); t = setTimeout(lift, 320);
  };
  const onVV = () => { setVar(); if (!cur || document.activeElement !== cur) return; clearTimeout(t); t = setTimeout(lift, 120); };
  const onBlur = () => { setTimeout(() => { if (!document.activeElement?.matches?.(FIELD)) { cur = null; setVar(); } }, 60); };
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onBlur);
  vv?.addEventListener("resize", onVV);
  return () => {
    window.__kpKbLift = false; clearTimeout(t);
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onBlur);
    vv?.removeEventListener("resize", onVV);
  };
}
