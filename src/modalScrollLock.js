// ======================= src/modalScrollLock.js =======================
// 🪟 2026-11-10 전역 팝업 스크롤 잠금 — 팝업(화면을 덮는 고정 오버레이)이 떠 있을 때 손가락·마우스 휠 스크롤이
//  팝업 안에서만 움직이고, 뒤 화면(본문·기사앱 스크롤 상자)이 따라 움직이지 않게 한다. PC·모바일·기사앱 공통.
//  · 판정: 스크롤을 시작한 지점의 조상 중 "position: fixed 이고 화면의 대부분을 덮는 요소" = 팝업 오버레이
//  · 그 팝업 안에서 그 방향으로 더 스크롤할 수 있는 상자가 있으면 그대로 두고, 없으면(끝에 닿음·스크롤 없는 팝업) 막는다
//    → 팝업 끝에서 뒤 화면으로 스크롤이 넘어가던 문제(scroll chaining)·뒤 화면이 왔다갔다 하던 문제가 없어진다
//  · 팝업이 아닌 곳(일반 화면)은 아무것도 건드리지 않는다. 각 화면 코드를 고치지 않고 한 번에 적용된다.
const isOverlay = (el) => {
  if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement) return false;
  const cs = getComputedStyle(el);
  if (cs.position !== "fixed") return false;
  const r = el.getBoundingClientRect();
  return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.85;
};
const canScroll = (el, dx, dy) => {
  const cs = getComputedStyle(el);
  if (dy) {
    const oy = cs.overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && el.scrollHeight > el.clientHeight + 1) {
      if (dy < 0 && el.scrollTop > 0) return true; // 위로(내용을 아래로) 더 갈 수 있음
      if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
    }
  }
  if (dx) {
    const ox = cs.overflowX;
    if ((ox === "auto" || ox === "scroll" || ox === "overlay") && el.scrollWidth > el.clientWidth + 1) {
      if (dx < 0 && el.scrollLeft > 0) return true;
      if (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
    }
  }
  return false;
};
// 대상 → 가장 가까운 팝업 오버레이까지 올라가며: 그 안에서 스크롤 가능한 상자가 있나
// ⚡ 2026-11-23 휠 · 손가락 스크롤은 1초에 수십 번 온다 — 같은 곳에서 계속 굴리면 "팝업 안인가" 판정을 0.5초 동안 다시 쓰고
//  (예전엔 매번 위로 올라가며 모든 상자의 스타일 · 크기를 다시 재서 긴 표에서 스크롤이 버벅였다)
const _chainCache = { target: null, at: 0, chain: null, overlay: null };
function decide(target, dx, dy) {
  let chain; let overlay = null;
  const now = Date.now();
  if (_chainCache.target === target && now - _chainCache.at < 500) { chain = _chainCache.chain; overlay = _chainCache.overlay; }
  else {
    let el = target && target.nodeType === 1 ? target : target?.parentElement;
    chain = [];
    while (el && el !== document.body && el !== document.documentElement) {
      chain.push(el);
      if (isOverlay(el)) { overlay = el; break; }
      el = el.parentElement;
    }
    Object.assign(_chainCache, { target, at: now, chain, overlay });
  }
  if (!overlay) return "pass"; // 팝업 밖(일반 화면) — 그대로
  // 지도·캔버스처럼 스스로 끌기를 처리하는 곳은 그대로
  if (chain.some((n) => n.matches?.(".leaflet-container, canvas, [data-allow-drag], input[type=range]"))) return "pass";
  return chain.some((n) => canScroll(n, dx, dy)) ? "pass" : "block";
}

let installed = false;
export function installModalScrollLock() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  let sx = 0, sy = 0, target = null, axis = "";
  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { target = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; target = e.target; axis = "";
  }, { passive: true, capture: true });
  // 🛠 2026-11-24 휴대폰에서 스크롤이 가끔 안 먹던 것 — 손가락이 살짝 옆으로 먼저 움직이면 첫 움직임을 "옆으로"로 보고 막았는데,
  //  iOS 는 첫 touchmove 를 막으면 그 손가락 동작 전체를 스크롤하지 않는다(위아래로 밀어도 안 움직임).
  //  → 방향이 분명해질 때까지(8px)는 "어느 쪽으로든 움직일 수 있는 상자가 있으면" 두고, 방향이 정해지면 그 방향으로만 판단한다
  document.addEventListener("touchmove", (e) => {
    if (!target || e.touches.length !== 1 || !e.cancelable) return;
    const t = e.touches[0];
    const dx = sx - t.clientX, dy = sy - t.clientY; // 양수 = 아래/오른쪽 내용 보기
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 2 && ady < 2) return;
    if (!axis && Math.max(adx, ady) >= 8) axis = adx > ady * 1.2 ? "x" : "y";
    const res = axis === "x" ? decide(target, dx, 0) : axis === "y" ? decide(target, 0, dy)
      : (decide(target, dx, 0) === "pass" || decide(target, 0, dy) === "pass" ? "pass" : "block");
    if (res === "block") e.preventDefault();
  }, { passive: false, capture: true });
  document.addEventListener("wheel", (e) => {
    if (!e.cancelable || e.ctrlKey) return; // ctrl+휠 = 확대
    const ax = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (decide(e.target, ax ? e.deltaX : 0, ax ? 0 : e.deltaY) === "block") e.preventDefault();
  }, { passive: false, capture: true });
}
export const __test = { decide, isOverlay, canScroll };
