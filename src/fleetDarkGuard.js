// ======================= src/fleetDarkGuard.js =======================
// 🛰 2026-11-26 지입차관리 다크 지킴이 — 색 바꿈 규칙(fleetDarkTheme.js)이 못 잡은 곳을 화면에서 바로 고친다
//  (예: 다른 CSS가 !important 로 칠한 흰 줄, 클래스로 준 흰 바탕, 데이터가 있어야 그려지는 표)
//  · .fm-dark 안(밖에 뜨는 창 .fm-pop 포함)에서 밝은 바탕(흰색 · 아주 옅은 회색) → 어두운 판, 옅은 색 바탕 → 같은 색의 어두운 빛
//  · 어두운 바탕 위 어두운 글씨(대비 3 미만) → 밝은 글씨
//  · 화면이 바뀔 때만(MutationObserver · 0.35초 모아서) 돈다. 지도 · 사진 · 그림은 건드리지 않는다
const SKIP0 = "img,video,canvas,svg,path,iframe,.leaflet-tile-pane,.leaflet-tile,.lw-tk,.fm-keep-light";
// 🌙 2026-11-26 기사앱 · 오더등록 디자인 시안도 같은 지킴이를 쓴다 — 지킴이마다 따로(C = { root, skip, saved })
//  saved: 바꾼 칸의 원래 값 — 지킴이를 끄면 되돌린다(디자인을 다시 바꿨을 때 어두운 칸이 남지 않게)
// (예전 설명) 기사앱도 같은 지킴이를 쓴다(.kpd-dark) — 어느 바깥 틀(ROOT) 안을 고칠지 · 건너뛸 것(SKIP)을 지킴이마다 정한다
const DEF = { root: ".fm-dark", skip: SKIP0, saved: null };
// 칸 하나 바꾸기 — 지킴이가 원래 값을 기억해야 하면 처음 바꿀 때 한 번만 적어 둔다
const setP = (el, prop, val, C) => {
  if (C.saved) {
    let m = C.saved.get(el); if (!m) { m = {}; C.saved.set(el, m); }
    if (!(prop in m)) m[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
  }
  el.style.setProperty(prop, val, "important");
};
const parse = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c || ""); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
// 글씨 아래 바탕 밝기 — 그러데이션(번호판 등) 위 글씨는 모르는 바탕이라 건드리지 않는다(null)
const bgUnder = (el, root = "") => {
  for (let e = el; e; e = e.parentElement) {
    // 🛠 지킴이가 방금 바꾼 바탕은 그 값으로 — 칸에 transition 이 있으면 계산된 색이 잠깐 예전(흰색) 값이라 글씨를 안 고쳤다
    const inl = e.style ? parse(e.style.getPropertyValue("background-color") || e.style.getPropertyValue("background")) : null;
    if (inl && inl[3] > 0.5) return lum(inl);
    const st = getComputedStyle(e);
    const c = parse(st.backgroundColor);
    if (c && c[3] > 0.5) return lum(c);
    if (/gradient|url\(/.test(st.backgroundImage)) return null;
    if (root && e.matches?.(root)) return 0.005; // 🎨 지킴이 바깥 틀까지 와도 바탕이 없으면 어두운 화면으로 본다
  }
  return 0.005;
};

function fixEl(el, C = DEF) {
  if (!el.closest(C.root)) return 0;
  if (el.closest(C.skip)) return 0;
  const cs = getComputedStyle(el);
  if (cs.display === "none") return 0;
  let n = 0;
  // 🛠 2026-11-26 밝은 그러데이션 바탕(예: 노선 카드 머리 #FBFCFE → #F4F7FB)도 어두운 판으로 — 예전엔 그러데이션은 건너뛰어 흰 띠로 남았다.
  //  색이 모두 밝은 그러데이션만(어두운 · 색 있는 그러데이션은 그대로) · 그림(url)은 건드리지 않는다
  if (/linear-gradient|radial-gradient/.test(cs.backgroundImage) && !/url\(/.test(cs.backgroundImage)) {
    const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]*\)/g)].map((m) => parse(m[0])).filter(Boolean);
    // 진하게 칠한 밝은 색이 있어야(흰 격자선처럼 옅은 무늬만 있는 어두운 카드는 그대로)
    if (stops.length && stops.some((c) => c[3] > 0.5 && lum(c) > 0.75) && stops.every((c) => c[3] < 0.05 || lum(c) > 0.75)) { setP(el, "background", "#0E1A30", C); n += 1; }
  }
  const bg = parse(cs.backgroundColor);
  if (bg && bg[3] > 0.5 && !/gradient|url\(/.test(cs.backgroundImage)) {
    const L = lum(bg);
    if (L > 0.6) {
      const [h, s] = hsl(bg);
      setP(el, "background-color", s > 0.35 && L < 0.97 ? `hsla(${Math.round(h)}, 70%, 55%, .16)` : L > 0.93 ? "#0E1A30" : "#0B1526", C);
      n += 1;
    }
  }
  // 글씨(이 요소가 직접 글을 가진 경우만)
  if ([...el.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) {
    const fg = parse(cs.color);
    const b = fg ? bgUnder(el, C.root === DEF.root ? "" : C.root) : null;
    if (fg && b != null) {
      const a = lum(fg);
      const cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (cr < 3 && b < 0.2) { setP(el, "color", a < 0.08 ? "#E6EDF8" : "#B9C6DC", C); n += 1; }
    }
    // 표 안 글씨는 13px보다 작지 않게(작아서 안 보인다는 의견)
    if (parseFloat(cs.fontSize) < 13 && el.closest("td,th")) { setP(el, "font-size", "13px", C); n += 1; }
  }
  return n;
}
// node 와 그 안 전부(바탕부터 고쳐야 글씨 대비가 맞아서 위에서 아래 순서)
function fixTree(node, C = DEF) {
  if (!node || node.nodeType !== 1) return 0;
  if (!node.closest(C.root)) {
    let n = 0;
    node.querySelectorAll?.(C.root).forEach((r) => { n += fixTree(r, C); });
    return n;
  }
  let n = fixEl(node, C);
  node.querySelectorAll("*").forEach((el) => { n += fixEl(el, C); });
  return n;
}
function fixAll(scope, C) {
  let n = 0;
  (scope.querySelectorAll ? scope.querySelectorAll(C.root) : []).forEach((r) => { n += fixTree(r, C); });
  return n;
}
export function fixFleetDark(scope = document) { return fixAll(scope, DEF); }

// 지입차관리가 열려 있는 동안만 켠다
//  🛠 2026-11-26 새로 붙은 칸은 화면에 그려지기 전에(MutationObserver 안에서 바로) 고친다 — 0.35초 늦게 고쳐 흰 표가 잠깐 보이던 문제
//  그 밖의 변화(마우스 · 고른 줄 등)는 0.25초 모아서 한 번 더 훑는다. 지도(타일 · 트럭) 안 변화는 뺀다
export function startFleetDarkGuard() { return startDarkGuard(".fm-dark", SKIP0); }
// 🌙 기사앱 — startDarkGuard(".kpd-dark", "…,.kpd-keep") · 오더등록 디자인 시안 — startDarkGuard(".of-skin-dark", …, { restore: true }). 지킴이마다 따로 돈다
export function startDarkGuard(root, skip = SKIP0, { restore = false } = {}) {
  const C = { root, skip, saved: restore ? new Map() : null };
  let t = null;
  // 바탕을 바꾼 뒤에야 글씨 대비가 맞게 잡히는 칸이 있어(글씨를 먼저 본 경우) 무언가 바꿨으면 한 번 더 훑는다
  const sweep = () => { t = null; try { if (fixAll(document, C) > 0) fixAll(document, C); } catch { /* 무시 */ } };
  const later = () => { if (!t) t = setTimeout(sweep, 250); };
  const mo = new MutationObserver((recs) => {
    let other = false;
    for (const r of recs) {
      if (r.target.closest && r.target.closest(".leaflet-container")) continue;
      if (r.type === "childList") { r.addedNodes.forEach((nd) => { try { if (fixTree(nd, C) > 0) fixTree(nd, C); } catch { /* 무시 */ } }); }
      // 🛠 2026-11-26 칸의 style 만 바뀐 경우(데이터가 들어와 줄 색이 바뀜 등)도 그려지기 전에 바로 고친다 — 예전엔 0.25초 뒤라 흰색이 잠깐 보였다
      else if (r.attributeName === "style") { try { if (r.target.closest?.(C.root)) fixEl(r.target, C); } catch { /* 무시 */ } }
      else other = true;
    }
    if (other) later();
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  sweep();
  return () => {
    mo.disconnect(); if (t) clearTimeout(t);
    // 원래 값으로 되돌리기(restore 켠 지킴이만)
    if (C.saved) C.saved.forEach((m, el) => { Object.entries(m).forEach(([prop, [v, pr]]) => { try { if (v) el.style.setProperty(prop, v, pr); else el.style.removeProperty(prop); } catch { /* 무시 */ } }); });
  };
}
