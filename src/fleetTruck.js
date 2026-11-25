// ======================= src/fleetTruck.js =======================
// 🚚 2026-11-25 관제현황 리디자인(관제실 다크) — 지도 위 차량을 '위에서 본 트럭'으로(사용자가 시안 ①번을 고름)
//  · 운전석 색 = 지금 상태(운송 파랑 · 상차 보라 · 하차 주황 · 대기 노랑 · 이상 빨강) · 미접속은 흐리게
//  · 트럭 머리는 달리는 방향 — 기사앱이 방향을 보내지 않아서, 화면에서 바로 전 위치 → 지금 위치로 계산해 기억한다
//  · PC 관제현황(FleetManagement) · 휴대폰 관제 지도(MobileFleetView)가 같이 쓴다
import L from "leaflet";

// 통합 상태(computeFleetPhase) → 트럭 색(어두운 지도에서 잘 보이는 색)
export const TRUCK_PHASE_COLORS = {
  운송중: "#3B82F6",
  상차지진입: "#8B5CF6", 상차지도착: "#A855F7",
  하차지진입: "#FB923C", 하차지도착: "#F97316",
  배차대기: "#F59E0B", 오더확인중: "#FBBF24",
  휴차: "#94A3B8", 출근전: "#7C8BA5", 퇴근: "#64748B",
};
export const TRUCK_ALERT = "#EF4444";
export const truckColor = (phase) => TRUCK_PHASE_COLORS[phase] || "#94A3B8";

// 상태 묶음(요약 칸 · 아래 분포 띠)
export const PHASE_GROUPS = [
  { key: "run", label: "운송", color: "#3B82F6", phases: ["운송중"] },
  { key: "load", label: "상차", color: "#A855F7", phases: ["상차지진입", "상차지도착"] },
  { key: "unload", label: "하차", color: "#F97316", phases: ["하차지진입", "하차지도착"] },
  { key: "wait", label: "대기", color: "#F59E0B", phases: ["배차대기", "오더확인중"] },
  { key: "rest", label: "휴차 · 퇴근", color: "#64748B", phases: ["휴차", "출근전", "퇴근"] },
];

// ── 달리는 방향(0 = 북쪽, 시계 방향 도) ──
const lastPos = new Map(); // id → { lat, lng, heading }
const toRad = (d) => (d * Math.PI) / 180;
function distM(a, b) {
  const R = 6371000, dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export function bearingDeg(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
// 위치가 20m 넘게 바뀌면 방향을 새로 잡는다(GPS 흔들림으로 트럭이 빙글빙글 돌지 않게). 처음 보는 차는 hint(동선 마지막 두 점) 또는 북쪽
export function headingFor(id, loc, hint = null) {
  if (!id || !loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return 0;
  const prev = lastPos.get(id);
  if (!prev) {
    const h = Number.isFinite(hint) ? hint : 0;
    lastPos.set(id, { lat: loc.lat, lng: loc.lng, heading: h });
    return h;
  }
  if (distM(prev, loc) > 20) {
    const h = bearingDeg(prev, loc);
    lastPos.set(id, { lat: loc.lat, lng: loc.lng, heading: h });
    return h;
  }
  return prev.heading;
}
// 동선 점 목록의 마지막 방향(선택한 차량을 처음 볼 때)
export function pathHeading(points = []) {
  for (let i = points.length - 1; i > 0; i--) {
    const b = points[i], a = points[i - 1];
    const pa = { lat: a.lat ?? a[0], lng: a.lng ?? a[1] }, pb = { lat: b.lat ?? b[0], lng: b.lng ?? b[1] };
    if (Number.isFinite(pa.lat) && Number.isFinite(pb.lat) && distM(pa, pb) > 15) return bearingDeg(pa, pb);
  }
  return null;
}

// ── 트럭 그림(위에서 본 모습 · 머리가 위) ──
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const TRUCK_DEFS = `<defs>
<linearGradient id="lwTkBox" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#C9D1DE"/><stop offset=".5" stop-color="#FBFCFE"/><stop offset="1" stop-color="#B8C2D2"/></linearGradient>
<linearGradient id="lwTkGlass" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3A5A92"/><stop offset="1" stop-color="#0B1222"/></linearGradient>
<linearGradient id="lwTkCab" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".45" stop-color="#FFF" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
<filter id="lwTkShadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6"/></filter>
</defs>`;
export function truckSvg(color, { w = 20, h = 42 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -50 48 100" width="${w}" height="${h}" style="overflow:visible;display:block">${TRUCK_DEFS}
<ellipse cx="2" cy="4" rx="17" ry="46" fill="#000" opacity=".5" filter="url(#lwTkShadow)"/>
<rect x="-17.5" y="-34" width="3.5" height="8" rx="1.2" fill="#03060C"/><rect x="14" y="-34" width="3.5" height="8" rx="1.2" fill="#03060C"/>
<rect x="-17.5" y="19" width="3.5" height="18" rx="1.2" fill="#03060C"/><rect x="14" y="19" width="3.5" height="18" rx="1.2" fill="#03060C"/>
<rect x="-15" y="-19" width="30" height="64" rx="3" fill="url(#lwTkBox)" stroke="#7D889C" stroke-width=".7"/>
<path d="M-14 -11h28M-14 -3h28M-14 5h28M-14 13h28M-14 21h28M-14 29h28M-14 37h28" stroke="#5B6B85" stroke-opacity=".2" stroke-width=".8"/>
<rect x="-1" y="-17" width="2" height="60" fill="#FFF" opacity=".5"/>
<rect x="-15" y="41" width="30" height="4" rx="1.5" fill="${color}"/>
<rect x="-12" y="-22" width="24" height="3" fill="#121A2A"/>
<rect x="-18.5" y="-37" width="4.5" height="6.5" rx="1.6" fill="${color}"/><rect x="14" y="-37" width="4.5" height="6.5" rx="1.6" fill="${color}"/>
<rect x="-14" y="-45" width="28" height="24" rx="8" fill="${color}"/>
<rect x="-14" y="-45" width="28" height="24" rx="8" fill="url(#lwTkCab)"/>
<path d="M-11.5 -38 Q0 -44.5 11.5 -38 L10 -31.5 Q0 -34.5 -10 -31.5Z" fill="url(#lwTkGlass)"/>
<rect x="-8" y="-29" width="16" height="5" rx="2" fill="#FFF" opacity=".16"/>
<rect x="-12" y="-46.5" width="5" height="2.2" rx="1" fill="#FFF4C2"/><rect x="7" y="-46.5" width="5" height="2.2" rx="1" fill="#FFF4C2"/>
</svg>`;
}

// 지도 표시(Leaflet divIcon) — label: 이름표(차량번호 끝 4자리 · 속도 등) · selected: 하늘색 빛 · alert: 빨강 깜빡 · offline: 흐리게
const iconCache = new Map();
export function makeTruckIcon({ color, heading = 0, label = "", selected = false, alert = false, offline = false, scale = 1.5 }) { // 🛠 2026-11-26 트럭 · 이름표 크게(작아서 안 보인다는 의견)
  const h = Math.round(heading / 5) * 5; // 5도 단위로 묶어 아이콘을 덜 만든다
  const key = [color, h, label, selected, alert, offline, scale].join("|");
  const hit = iconCache.get(key);
  if (hit) return hit;
  const w = Math.round(20 * scale), ht = Math.round(42 * scale);
  const c = alert ? TRUCK_ALERT : color;
  const R = Math.round(32 * scale), RA = Math.round(26 * scale);
  const ring = selected
    ? `<span class="lw-tk-ring" style="position:absolute;left:-${R}px;top:-${R}px;width:${R * 2}px;height:${R * 2}px;border-radius:99px;background:rgba(56,189,248,.32)"></span>`
    : alert ? `<span class="lw-tk-ring" style="position:absolute;left:-${RA}px;top:-${RA}px;width:${RA * 2}px;height:${RA * 2}px;border-radius:99px;background:rgba(239,68,68,.35)"></span>` : "";
  const tag = label
    ? `<span style="position:absolute;left:${Math.round(17 * scale)}px;top:-15px;height:30px;padding:0 10px;border-radius:8px;background:rgba(10,18,34,.92);border:1.5px solid ${selected ? "#38BDF8" : alert ? "#EF4444" : "#3B5B97"};box-shadow:0 4px 12px rgba(0,0,0,.45);display:inline-flex;align-items:center;font:800 ${selected ? 15 : 14}px 'Noto Sans KR',sans-serif;color:#F2F6FC;white-space:nowrap;pointer-events:none">${esc(label)}</span>`
    : "";
  const icon = L.divIcon({
    className: "lw-tk",
    html: `<div style="position:relative;width:0;height:0">${ring}<div class="${alert ? "lw-tk-blink" : ""}" style="position:absolute;left:${-w / 2}px;top:${-ht / 2}px;width:${w}px;height:${ht}px;transform:rotate(${h}deg);opacity:${offline ? 0.45 : 1};filter:${selected ? "drop-shadow(0 0 6px rgba(56,189,248,.9))" : "none"}">${truckSvg(c, { w, h: ht })}</div>${tag}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -24],
  });
  if (iconCache.size > 600) iconCache.clear();
  iconCache.set(key, icon);
  return icon;
}

// 어두운 지도 · 트럭 움직임 CSS(한 번만 넣는다)
export const TRUCK_CSS = `
.lw-tk{background:transparent;border:0}
@keyframes lwTkRing{0%{transform:scale(.5);opacity:.6}100%{transform:scale(1.9);opacity:0}}
.lw-tk-ring{animation:lwTkRing 1.8s ease-out infinite;pointer-events:none}
@keyframes lwTkBlink{0%,100%{opacity:1}50%{opacity:.35}}
.lw-tk-blink{animation:lwTkBlink 1s ease-in-out infinite}
.lw-dark-tiles{filter:invert(1) hue-rotate(200deg) brightness(.92) contrast(1.08) saturate(.5)}
.lw-light-tiles{filter:grayscale(.7) contrast(1.02) brightness(1.03)}
.lw-dark-map .leaflet-container,.lw-dark-map.leaflet-container{background:#08111F}
.lw-dark-map .leaflet-control-zoom a{background:#0E1A30;color:#CFE0FF;border-color:#22345A}
.lw-dark-map .leaflet-control-attribution{background:rgba(8,17,31,.7);color:#6B7A95}
.lw-dark-map .leaflet-control-attribution a{color:#8FB8FF}
`;
