// ======================= src/fleetDarkGuard.js =======================
// 🛰 2026-11-26 지입차관리 다크 지킴이 — 색 바꿈 규칙(fleetDarkTheme.js)이 못 잡은 곳을 화면에서 바로 고친다
//  (예: 다른 CSS가 !important 로 칠한 흰 줄, 클래스로 준 흰 바탕, 데이터가 있어야 그려지는 표)
//  · .fm-dark 안(밖에 뜨는 창 .fm-pop 포함)에서 밝은 바탕(흰색 · 아주 옅은 회색) → 어두운 판, 옅은 색 바탕 → 같은 색의 어두운 빛
//  · 어두운 바탕 위 어두운 글씨(대비 3 미만) → 밝은 글씨
//  · 화면이 바뀔 때만(MutationObserver · 0.35초 모아서) 돈다. 지도 · 사진 · 그림은 건드리지 않는다
const SKIP = "img,video,canvas,svg,path,iframe,.leaflet-tile-pane,.leaflet-tile,.lw-tk,.fm-keep-light";
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
const bgUnder = (el) => {
  for (let e = el; e; e = e.parentElement) {
    const c = parse(getComputedStyle(e).backgroundColor);
    if (c && c[3] > 0.5) return lum(c);
  }
  return 0.005;
};

export function fixFleetDark(scope = document) {
  const roots = scope.querySelectorAll ? scope.querySelectorAll(".fm-dark") : [];
  let n = 0;
  roots.forEach((root) => {
    root.querySelectorAll("*").forEach((el) => {
      if (el.closest(SKIP)) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none") return;
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0.5 && !/gradient|url\(/.test(cs.backgroundImage)) {
        const L = lum(bg);
        if (L > 0.6) {
          const [h, s] = hsl(bg);
          el.style.setProperty("background-color", s > 0.35 && L < 0.97 ? `hsla(${Math.round(h)}, 70%, 55%, .16)` : L > 0.93 ? "#0E1A30" : "#0B1526", "important");
          n += 1;
        }
      }
      // 글씨(이 요소가 직접 글을 가진 경우만)
      if ([...el.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) {
        const fg = parse(cs.color);
        if (fg) {
          const a = lum(fg), b = bgUnder(el);
          const cr = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (cr < 3 && b < 0.2) { el.style.setProperty("color", a < 0.08 ? "#E6EDF8" : "#B9C6DC", "important"); n += 1; }
        }
        // 표 안 글씨는 13px보다 작지 않게(작아서 안 보인다는 의견)
        if (parseFloat(cs.fontSize) < 13 && el.closest("td,th")) { el.style.setProperty("font-size", "13px", "important"); n += 1; }
      }
    });
  });
  return n;
}

// 지입차관리가 열려 있는 동안만 켠다
export function startFleetDarkGuard() {
  let t = null;
  const run = () => { t = null; try { fixFleetDark(document); } catch { /* 무시 */ } };
  const kick = () => { if (!t) t = setTimeout(run, 350); };
  // 지도(타일 · 트럭)가 움직일 때마다 돌지 않게 지도 안 변화는 뺀다 · 글이나 칸이 새로 생길 때만
  const mo = new MutationObserver((recs) => { if (recs.some((r) => !(r.target.closest && r.target.closest(".leaflet-container")))) kick(); });
  mo.observe(document.body, { childList: true, subtree: true });
  kick();
  return () => { mo.disconnect(); if (t) clearTimeout(t); };
}
