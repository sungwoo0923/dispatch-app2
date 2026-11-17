// ======================= src/stickyTableHead.js =======================
// ⭐ 2026-11-17 표 머리줄 고정 — 목록이 길어 아래로 내려도 엑셀처럼 칸 이름(머리줄)이 맨 위에 붙어 따라온다(프로그램의 모든 목록 표)
//
//  왜 CSS 한 줄(thead { position: sticky })로는 안 되나
//   · sticky 는 "가장 가까운 스크롤 상자" 기준으로 붙는다. 넓은 표는 거의 다 옆으로 밀어 보는 상자(overflow-x-auto) 안에 있는데,
//     이 상자는 위아래로는 스크롤되지 않고 표 길이만큼 늘어나서 → 머리줄이 붙을 곳이 없어 같이 올라가 버렸다.
//
//  그래서 이렇게 한다(화면마다 고치지 않고 여기 한 곳에서 자동으로)
//   1) 표가 이미 높이가 정해진 스크롤 상자 안에 있으면(팝업 목록 · 왼쪽 메뉴 화면의 본문 등) → 머리줄만 고정(data-kp-st)
//   2) 표를 감싼 상자가 표 길이만큼 늘어나는 상자면(옆 스크롤 상자 · 카드) → 그 상자 높이를 "지금 화면 아래 끝까지"로
//      정해(data-kp-st-wrap · --kp-st-h) 그 안에서 위아래로 스크롤 → 머리줄 고정. 표가 화면보다 짧으면 아무것도 바꾸지 않는다.
//   3) 빼는 표: 거래명세서 문서(#invoiceArea) · 팝업(role=dialog · 화면에 고정된 창) 안 · 머리줄이 없거나 숨긴 표(휴대폰 카드 모양)
//      · 줄이 몇 개 안 되는 표 · 표 안의 표 · data-kp-nosticky 를 붙인 표
//   · 모양(높이 제한 · 머리줄 고정)은 index.css 의 [data-kp-st] · [data-kp-st-wrap] 규칙. 인쇄 · 캡처(html2canvas) 땐 꺼진다(.kp-st-off).
//   · 화면 맞춤(ScreenFit 표 zoom) · 칸 끌어 옮기기(ColumnLayout) · 오른쪽 클릭 메뉴는 머리줄 칸(th)을 건드리지 않으므로 그대로 동작
const SKIP = "#invoiceArea, [data-kp-nosticky], [role=dialog], [data-kp-dialog], [data-kp=inv-fit]";
const MIN_BODY_ROWS = 4; // 이보다 줄이 적은 표는 안 건드린다
const PAD = 12; // 화면 아래 여유(px)
const MAX_UP = 4; // 표를 감쌀 상자는 표에서 4단계 위까지만 찾는다(화면 전체 틀을 상자로 만들지 않게)

const isScrollY = (v) => v === "auto" || v === "scroll";
const scrollBox = (cs) => !["visible", "clip"].includes(cs.overflowX) || !["visible", "clip"].includes(cs.overflowY);
const blockish = (cs) => /^(block|flow-root|flex|grid|list-item)$/.test(cs.display);
const clear = (cs) => { const c = cs.backgroundColor; return (!c || c === "transparent" || /rgba\(.*,\s*0\)$/.test(c)) && (!cs.backgroundImage || cs.backgroundImage === "none"); };
const outerSeen = new WeakSet(); // 한 번이라도 "높이가 정해진 스크롤 상자"로 확인된 상자(내용이 줄어 넘치지 않아도 계속 그렇게 본다)
const boundedY = (el, cs) => isScrollY(cs.overflowY) && (outerSeen.has(el) || el.scrollHeight > el.clientHeight + 1);

// 표 하나 — 어떻게 고정할지 계획(아무것도 안 하면 null)
export function planTable(t) {
  if (!t.isConnected || !t.offsetParent) return null;
  const head = t.tHead;
  if (!head || !head.rows.length) return null;
  if (t.rows.length - head.rows.length < MIN_BODY_ROWS) return null;
  if (t.closest(SKIP) || t.parentElement?.closest("table")) return null;
  if (getComputedStyle(head).display === "none") return null;
  const th = t.getBoundingClientRect().height;
  if (th < 120) return null;
  let first = null, kind = null, ded = null, outer = null, up = 0;
  for (let a = t.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (cs.position === "fixed") return null; // 팝업 · 옆에서 나오는 창
    if (!first) {
      up += 1;
      if (a.hasAttribute("data-kp-st-wrap")) { first = a; kind = "wrap"; continue; }
      if (scrollBox(cs)) {
        first = a;
        if (boundedY(a, cs)) { outerSeen.add(a); kind = "inner"; break; }
        kind = up <= MAX_UP && a.tagName !== "MAIN" && th >= 0.75 * a.scrollHeight ? "wrap" : (ded ? "wrapDed" : null);
        if (!kind) return null;
        continue;
      }
      if (!ded && up <= MAX_UP && a.tagName !== "MAIN" && blockish(cs) && th >= 0.75 * a.scrollHeight) ded = a;
      continue;
    }
    if (boundedY(a, cs)) { outerSeen.add(a); outer = a; break; }
  }
  if (!first) { if (!ded) return null; kind = "wrapDed"; }
  if (kind === "inner") return { t, wrap: null, box: first };
  const w = kind === "wrapDed" ? ded : first;
  // 상자 높이 = 지금 보이는 영역(본문 스크롤 상자 또는 창)에서 상자 윗변 아래 남은 높이
  const viewH = outer ? outer.clientHeight : window.innerHeight;
  const top0 = outer ? outer.getBoundingClientRect().top + outer.clientTop - outer.scrollTop : -window.scrollY;
  const off = w.getBoundingClientRect().top - top0;
  let h = off <= viewH * 0.45 ? viewH - off - PAD : viewH - PAD * 2; // 위쪽 도구 줄이 너무 길면 화면 높이만큼
  h = Math.round(Math.max(h, Math.min(320, viewH - PAD * 2)));
  const content = w.scrollHeight;
  const was = w.hasAttribute("data-kp-st-wrap");
  if (content <= h + (was ? -40 : 24)) return null; // 화면 안에 다 들어오면 그대로(경계에서 깜빡이지 않게 여유)
  return { t, wrap: w, h, box: w };
}

const own = new WeakMap(); // 화면이 직접 머리줄을 고정해 둔 표(그 방식 그대로 둔다)
function headAlreadySticky(t) {
  if (own.has(t)) return own.get(t);
  const head = t.tHead; const c = head.rows[0]?.cells[0];
  const hs = getComputedStyle(head); const cs = c ? getComputedStyle(c) : null;
  const v = (hs.position === "sticky" && hs.top !== "auto") || (!!cs && cs.position === "sticky" && cs.top !== "auto");
  own.set(t, v);
  return v;
}
// 머리줄이 투명하면(뒤 바탕이 비쳐 보이는 표) 스크롤할 때 아래 줄이 비쳐 보이므로 — 바깥 상자 바탕색을 깔아 준다
function headBg(t) {
  const head = t.tHead; const tr = head.rows[head.rows.length - 1]; const c = tr?.cells[0];
  if (![head, head.rows[0], tr, c].every((n) => !n || clear(getComputedStyle(n)))) return "";
  for (let a = t; a && a !== document.documentElement; a = a.parentElement) { const cs = getComputedStyle(a); if (!clear(cs)) return cs.backgroundColor; }
  return "#fff";
}

let on = new Set(); // 지금 고정 표시를 붙인 표 · 상자
export function scanTables(root = document) {
  const next = new Set();
  root.querySelectorAll("table").forEach((t) => {
    let p = null;
    try { p = planTable(t); } catch { p = null; }
    if (!p) return;
    if (p.wrap) {
      const w = p.wrap; next.add(w);
      if (!w.hasAttribute("data-kp-st-wrap")) w.setAttribute("data-kp-st-wrap", "");
      const cur = parseFloat(w.style.getPropertyValue("--kp-st-h")) || 0;
      if (Math.abs(cur - p.h) > 4) w.style.setProperty("--kp-st-h", `${p.h}px`);
    }
    next.add(t);
    // 스크롤 상자에 위 여백(padding)이 있으면 머리줄이 그만큼 아래에 붙어 그 틈으로 줄이 비쳐 보인다 — 여백만큼 위로 올려 붙인다
    const pt = Math.round((parseFloat(getComputedStyle(p.box).paddingTop) || 0) / (parseFloat(t.style.zoom) || 1)); // 화면 맞춤으로 표가 줄어 있으면 그 배율만큼
    if ((parseFloat(t.style.getPropertyValue("--kp-st-top")) || 0) !== -pt) { if (pt) t.style.setProperty("--kp-st-top", `${-pt}px`); else t.style.removeProperty("--kp-st-top"); }
    if (!t.hasAttribute("data-kp-st") && !headAlreadySticky(t)) {
      const bg = headBg(t); if (bg) t.style.setProperty("--kp-st-bg", bg);
      t.setAttribute("data-kp-st", "");
    }
  });
  on.forEach((el) => {
    if (next.has(el) && el.isConnected) return;
    el.removeAttribute("data-kp-st-wrap"); el.removeAttribute("data-kp-st");
    el.style.removeProperty("--kp-st-h"); el.style.removeProperty("--kp-st-bg"); el.style.removeProperty("--kp-st-top");
  });
  on = next;
}

// 캡처(html2canvas)하는 동안 고정을 꺼서 표 전체가 찍히게 — 부르는 곳: lazyLoad.html2canvas 등
export async function withStickyOff(fn) {
  const el = document.documentElement;
  el.classList.add("kp-st-off");
  try { return await fn(); } finally { el.classList.remove("kp-st-off"); }
}

let installed = false;
export function installStickyTableHeads() {
  if (installed || typeof window === "undefined" || typeof MutationObserver === "undefined") return;
  installed = true;
  let timer = 0;
  const run = () => { timer = 0; requestAnimationFrame(() => { try { scanTables(); } catch { /* 무시 */ } }); };
  const soon = (ms = 350) => { if (!timer) timer = setTimeout(run, ms); };
  const mo = new MutationObserver(() => soon());
  const start = () => { mo.observe(document.body, { childList: true, subtree: true }); soon(0); };
  if (document.body) start(); else window.addEventListener("DOMContentLoaded", start, { once: true });
  window.addEventListener("resize", () => soon(150));
  ["kp-screen-fit", "kp-collayout-applied"].forEach((e) => window.addEventListener(e, () => soon(100)));
  setInterval(() => { if (!document.hidden) soon(0); }, 2000); // 탭 전환(숨김 · 보임만 바뀌는 화면) 대비
}
