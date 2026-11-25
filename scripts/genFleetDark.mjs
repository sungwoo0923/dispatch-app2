// 지입차관리 관제실 다크 테마 만들기 — node scripts/genFleetDark.mjs
//  지입차관리 화면들은 색이 코드 곳곳에 직접 적혀 있어(흰 바탕 · 남색 글씨 · 옅은 테두리), 하나하나 고치지 않고
//  그 화면들이 쓰는 색을 모아 "밝은 바탕 → 어두운 판 · 진한 글씨 → 밝은 글씨 · 옅은 테두리 → 어두운 선"으로 바꾸는 규칙을 만든다.
//  결과: src/fleetDarkTheme.js (FleetManagement 맨 바깥 .fm-dark 안에서만 적용)
//  지입차관리 화면에 새 색을 쓰면 이걸 다시 돌린다.
import fs from "fs";

const FILES = [
  "src/FleetManagement.jsx", "src/FleetControlDeck.jsx", "src/VehicleExpenseInbox.jsx", "src/VehicleCarePanel.jsx", "src/VehicleLedger.jsx",
  "src/FleetPayDocs.jsx", "src/fleetGeo.jsx", "src/mapLeaflet.jsx", "src/FixedRoutes.jsx", "src/FixedRouteStatus.jsx", "src/RouteBoard.jsx",
  "src/CustomDatePicker.jsx", "src/CustomSelect.jsx", "src/fleetDispatchWay.jsx", "src/fleetGrades.jsx", "src/DriverContextMenu.jsx",
];
const src = FILES.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");

const norm = (h) => { h = h.replace("#", "").toLowerCase(); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return h.length === 6 ? h : null; };
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// 바탕
function bgFor(h) {
  const c = rgb(h), L = lum(c), [hu, s] = hsl(c);
  if (L > 0.6) {
    if (s > 0.35 && L < 0.97) return `hsla(${Math.round(hu)}, 70%, 55%, .14)`; // 옅은 색 바탕(빨강 · 초록 안내 등) → 그 색의 어두운 빛
    if (L > 0.93) return "#0E1A30"; // 흰색 · 거의 흰색 → 판
    return "#0B1526";              // 옅은 회색 → 한 단 더 어두운 판
  }
  if (["0f1a30", "1b2b4b", "0b1428"].includes(h)) return "#1D3A6B"; // 프로그램 남색(표 머리 · 고른 버튼) → 어두운 판 위에서 보이는 파랑(관제현황 자체 색은 그대로)
  return null;
}
// 글씨
function fgFor(h) {
  const c = rgb(h), L = lum(c), [hu, s] = hsl(c);
  if (L > 0.45) return null;
  if (s < 0.3 || L < 0.03) return L < 0.08 ? "#E6EDF8" : L < 0.2 ? "#B9C6DC" : "#93A3BE";
  return `hsl(${Math.round(hu)}, ${Math.round(Math.min(90, s * 100))}%, 72%)`; // 진한 빨강 · 파랑 글씨 → 밝은 같은 색
}
// 테두리
function bdFor(h) { const L = lum(rgb(h)); return L > 0.55 ? "#22345A" : null; }

const css = [];
const rgbStr = (h) => `rgb(${rgb(h).join(", ")})`;
const seen = new Set();
const hexes = new Set([...src.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)].map((m) => norm(m[0])).filter(Boolean));
hexes.add("ffffff");
for (const h of hexes) {
  const r = rgbStr(h);
  const bg = bgFor(h), fg = fgFor(h), bd = bdFor(h);
  if (bg) css.push(`.fm-dark [style^="background: ${r}"],.fm-dark [style*="; background: ${r}"],.fm-dark [style^="background-color: ${r}"],.fm-dark [style*="; background-color: ${r}"]{background:${bg} !important}`);
  if (fg) css.push(`.fm-dark [style^="color: ${r}"],.fm-dark [style*="; color: ${r}"]{color:${fg} !important}`);
  if (bd) css.push(`.fm-dark [style*="solid ${r}"],.fm-dark [style*="dashed ${r}"]{border-color:${bd} !important}`);
  seen.add(h);
}
// 'white' 낱말
css.push(`.fm-dark [style^="background: white"],.fm-dark [style*="; background: white"],.fm-dark [style^="background-color: white"],.fm-dark [style*="; background-color: white"]{background:#0E1A30 !important}`);

// Tailwind 클래스(bg-white · bg-[#F7F9FC] · text-[#0F1A30] · border-[#E3E8F0] · hover:…)
const esc = (cls) => cls.replace(/([:\[\]#\/.])/g, "\\$1");
const classes = new Set([...src.matchAll(/(?:hover:)?(?:bg|text|border|border-[trbl])-(?:white|\[#[0-9A-Fa-f]{3,6}\])/g)].map((m) => m[0]));
for (const cls of classes) {
  const hover = cls.startsWith("hover:");
  const base = hover ? cls.slice(6) : cls;
  const m = base.match(/^(bg|text|border(?:-[trbl])?)-(white|\[#([0-9A-Fa-f]{3,6})\])$/);
  if (!m) continue;
  const h = m[2] === "white" ? "ffffff" : norm(m[3]);
  if (!h) continue;
  const kind = m[1];
  const val = kind === "bg" ? bgFor(h) : kind === "text" ? fgFor(h) : bdFor(h);
  if (!val) continue;
  const prop = kind === "bg" ? "background" : kind === "text" ? "color" : "border-color";
  css.push(`.fm-dark .${esc(cls)}${hover ? ":hover" : ""}{${prop}:${val} !important}`);
}

const head = `
.fm-dark{background:#070D1A;color:#E6EDF8;border-radius:20px;padding:14px !important;border:1px solid #1A2742}
.fm-dark input:not([type=checkbox]):not([type=radio]):not([type=range]),.fm-dark select,.fm-dark textarea{background:#0E1A30 !important;color:#E6EDF8 !important;border-color:#22345A !important}
.fm-dark input::placeholder,.fm-dark textarea::placeholder{color:#5D6E8C !important}
.fm-dark ::-webkit-scrollbar-thumb{background:#22345A !important}
.fm-dark table{color:#E6EDF8}
.fm-dark table tbody tr:nth-child(odd) td{background-color:transparent}
.fm-dark table tbody tr:nth-child(even) td{background-color:rgba(143,176,240,.035)}
.fm-dark table tbody tr:hover td{background-color:rgba(143,176,240,.08)}
.fm-dark table td,.fm-dark table th{border-color:#1A2742}
.fm-dark svg[stroke="#1B2B4B" i],.fm-dark svg[stroke="#0F1A30" i],.fm-dark svg[stroke="#2D4C82" i],.fm-dark svg[stroke="#5B6B85" i],.fm-dark svg[stroke="#374151" i]{stroke:#9FB3D6}
.fm-dark svg [stroke="#1B2B4B" i],.fm-dark svg [stroke="#0F1A30" i]{stroke:#9FB3D6}
.fm-dark svg[fill="#1B2B4B" i],.fm-dark svg [fill="#1B2B4B" i],.fm-dark svg[fill="#0F1A30" i],.fm-dark svg [fill="#0F1A30" i]{fill:#9FB3D6}
.fm-dark hr{border-color:#1A2742}
.fm-dark .leaflet-popup-content-wrapper,.fm-dark .leaflet-popup-tip{background:#0E1A30;color:#E6EDF8}
.fm-dark .fc-nav-btn:hover{background:#13233F !important}
.fm-dark .fc-nav-btn.on,.fm-dark .fc-nav-btn.on:hover{background:linear-gradient(135deg,#1D4ED8,#2563EB) !important;box-shadow:0 0 0 1px rgba(56,189,248,.35),0 8px 18px rgba(37,99,235,.35) !important}
.fm-dark .fc-grid-bg{background:linear-gradient(180deg,#0C1528,#08101F) !important;border-color:#1A2742 !important}
.fm-dark .fc-route-card:hover{border-color:#3B5B97 !important}
`;
const out = `// ======================= src/fleetDarkTheme.js =======================
// 🛰 2026-11-25 지입차관리 전체 = 관제실 다크(관제현황과 같은 톤) — scripts/genFleetDark.mjs 가 만든다(손으로 고치지 말 것)
//  FleetManagement 맨 바깥에 className="fm-dark" 가 붙은 화면(지입차관리 메뉴)에서만 적용된다. 기사관리 › 서류관리처럼
//  다른 메뉴 안에 끼워 쓰는 화면(hideChrome · forceTab)에는 붙지 않는다.
export const FLEET_DARK_CSS = ${JSON.stringify(head + css.join("\n"))};
`;
fs.writeFileSync("src/fleetDarkTheme.js", out);
console.log(`src/fleetDarkTheme.js — 규칙 ${css.length}개 (${(out.length / 1024).toFixed(0)}KB)`);
