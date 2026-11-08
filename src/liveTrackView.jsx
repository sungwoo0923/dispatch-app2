// ======================= src/liveTrackView.jsx =======================
// ⭐ 2026-11-06 실시간 관제 지도 화면(Firebase를 쓰지 않는 순수 화면) — LiveFleetMaps.jsx에서 떼어냈다.
//  배차 프로그램(LiveFleetMaps.jsx — drivers/gps_tracks)과 로지스웹 허브(cafe-site/src/hub/HubLiveTrack.jsx — hubLive)가
//  같은 지도 · 트럭 마커 · 이동경로 선 · 운행 단계 · 속도/수신/남은거리/도착예상 패널을 그대로 쓴다.
import React from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { LeafletTrack } from "./mapLeaflet";
import { cleanTrack } from "./mapStyle";
import { haversineKm } from "./tmapFareCalc";
import { LIVE_MONO as MONO, LIVE_COLORS, liveState, liveAgeText, useLiveNow } from "./liveCore";

export const C = { ink: "#0B1428", deep: "#0F1A30", navy: "#1B2B4B", steel: "#2D4C82", accent: "#8FB0F0", line: "rgba(143,176,240,.16)", glass: "rgba(15,26,48,.72)" };
export const Z = 10000040;
export const noop = () => {};
export const STEP_LABELS = ["상차이동", "상차진입", "상차도착", "하차이동", "하차진입", "하차도착"];

export const kstDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const hms = (ms) => { if (!ms) return "--:--:--"; const d = new Date(ms); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":"); };
const hm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtPhone = (p) => { const d = String(p || "").replace(/\D/g, ""); if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`; if (d.length === 10) return d.startsWith("02") ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; return String(p || ""); };
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`);
export const telOf = (e, o) => String(e?.phone || o?.전화번호 || "").replace(/[^\d+]/g, "");
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ─── 마커(관제현황 liveTruckIcon과 같은 모양 · 네이비 톤 + LIVE 펄스) ─────────────────
// 같은 모양이면 같은 아이콘 객체를 재사용(다시 그릴 때 마커가 깜빡이지 않게)
const _iconCache = new Map();
function cachedIcon(key, make) {
  let ic = _iconCache.get(key);
  if (!ic) { if (_iconCache.size > 400) _iconCache.clear(); ic = make(); _iconCache.set(key, ic); }
  return ic;
}
export function truckIcon(o) {
  return cachedIcon(`t|${o.plate}|${o.state}|${o.selected ? 1 : 0}|${o.speed || 0}`, () => makeTruckIcon(o));
}
function makeTruckIcon({ plate, state, selected, speed }) {
  const bg = state === "stale" ? "#64748B" : C.navy;
  const size = selected ? 46 : 40;
  const ring = LIVE_COLORS[state] || LIVE_COLORS.stale;
  const pulse = state === "live" || state === "recent"
    ? `<span style="position:absolute;inset:0;border-radius:50%;background:${ring};opacity:.35;animation:kpLivePing 1.9s cubic-bezier(0,0,.2,1) infinite;"></span>` : "";
  const shadow = selected ? `box-shadow:0 0 0 3px #fff,0 0 0 6px ${C.accent},0 8px 20px rgba(11,20,40,.45);` : `box-shadow:0 0 0 2px #fff,0 4px 12px rgba(11,20,40,.35);`;
  const truck = `<svg width="${selected ? 24 : 21}" height="${selected ? 24 : 21}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h13v11H1z"/><path d="M14 8h4l3 3v4h-7z"/><circle cx="5.5" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/></svg>`;
  const dot = `<span style="position:absolute;right:-1px;top:-1px;width:11px;height:11px;border-radius:50%;background:${ring};border:2px solid #fff;"></span>`;
  const spd = speed > 0 && state !== "stale" ? `<span style="margin-left:6px;color:${C.accent};font-weight:700;">${speed}km/h</span>` : "";
  const label = plate ? `<div style="margin-top:5px;white-space:nowrap;background:${C.ink};color:#fff;font:800 12px ${MONO};padding:3px 8px;border-radius:8px;border:1.5px solid ${selected ? C.accent : C.steel};box-shadow:0 3px 10px rgba(11,20,40,.35);letter-spacing:.02em;">${esc(plate)}${spd}</div>` : "";
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateX(-50%);position:absolute;left:50%;top:0;"><div style="position:relative;width:${size}px;height:${size}px;">${pulse}<div style="position:relative;width:100%;height:100%;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;${shadow}">${truck}</div>${dot}</div>${label}</div>`,
    className: "", iconSize: [0, 0], iconAnchor: [0, size / 2],
  });
}
export function pinIcon(label, color) {
  return cachedIcon(`p|${label}|${color}`, () => L.divIcon({
    html: `<div style="position:absolute;left:0;top:0;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;"><div style="background:${color};color:#fff;font:900 11.5px 'Noto Sans KR',sans-serif;padding:3px 9px;border-radius:8px;border:2px solid #fff;box-shadow:0 3px 10px rgba(11,20,40,.35);white-space:nowrap;">${esc(label)}</div><div style="width:2px;height:7px;background:${color};"></div><div style="width:10px;height:10px;border-radius:50%;background:${color};border:2.5px solid #fff;margin-top:-1px;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div></div>`,
    className: "", iconSize: [0, 0], iconAnchor: [0, 0],
  }));
}

export function MapGlue({ follow, center, fitKey, fitPoints, onUserMove }) {
  const map = useMap();
  // ⭐ 2026-11-08 지도를 손으로 끌거나 확대하면 "따라가기"를 끈다 — 예전엔 위치가 올 때마다 기사 쪽으로 되돌아가
  //  휴대폰에서 지도가 "안 움직이는" 것처럼 보였다
  React.useEffect(() => {
    if (!onUserMove) return undefined;
    const off = () => onUserMove();
    map.on("dragstart", off); map.on("zoomstart", off);
    const el = map.getContainer();
    el.addEventListener("touchstart", off, { passive: true });
    return () => { map.off("dragstart", off); map.off("zoomstart", off); el.removeEventListener("touchstart", off); };
  }, [map, onUserMove]);
  React.useEffect(() => { const t = setTimeout(() => map.invalidateSize(), 140); return () => clearTimeout(t); }, [map]);
  const centerKey = center ? `${center[0].toFixed(5)},${center[1].toFixed(5)}` : "";
  React.useEffect(() => { if (follow && center) map.panTo(center, { animate: true, duration: 0.8 }); }, [follow, centerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!fitKey || !fitPoints?.length) return;
    if (fitPoints.length === 1) map.setView(fitPoints[0], 14, { animate: true });
    else map.fitBounds(L.latLngBounds(fitPoints), { padding: [70, 70], maxZoom: 14, animate: true });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
export function FlyTo({ target }) {
  const map = useMap();
  React.useEffect(() => { if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 13), { duration: 0.7 }); }, [target, map]);
  return null;
}

export function BaseMap({ center, zoom = 13, children, onTileError }) {
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom zoomControl={false} attributionControl style={{ height: "100%", width: "100%" }}>
      <TileLayer className="kp-lv-tiles" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" eventHandlers={{ tileerror: onTileError }} />
      {children}
    </MapContainer>
  );
}

export const MAP_CSS = `
.kp-lv-map .leaflet-container{background:radial-gradient(800px 400px at 70% 0%,rgba(45,76,130,.35),transparent 60%),linear-gradient(rgba(143,176,240,.07) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,rgba(143,176,240,.07) 1px,transparent 1px) 0 0/28px 28px,#0F1A30;font-family:inherit}
.kp-lv-tiles{filter:grayscale(.85) contrast(.95) brightness(1.04)}
.kp-lv-map .leaflet-control-attribution{background:rgba(11,20,40,.6);color:#8FB0F0;font-size:9px}
.kp-lv-map .leaflet-control-attribution a{color:#CFE0FF}
.kp-lv-scroll::-webkit-scrollbar{width:6px}.kp-lv-scroll::-webkit-scrollbar-thumb{background:rgba(143,176,240,.22);border-radius:6px}
.kp-lv-tile{border:1px solid rgba(143,176,240,.14);background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.015));border-radius:16px}
.kp-lv-ghost{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#E6EEFF}
.kp-lv-ghost:hover{background:rgba(255,255,255,.1);border-color:rgba(143,176,240,.5)}
`;

export function trackKm(pts) {
  const c = cleanTrack(pts);
  let km = 0;
  for (let i = 1; i < c.length; i++) km += haversineKm(c[i - 1].lat, c[i - 1].lng, c[i].lat, c[i].lng);
  return km;
}

// ─── 작은 UI 조각 ──────────────────────────────────────────────────────────
// "LIVE · 실시간 관제" — 영문은 넓게, 한글은 좁게(한글에 넓은 자간을 주면 글자가 흩어져 보인다)
export function Eyebrow({ children, color = C.accent }) {
  const [en, ko] = String(children).split(" · ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color, whiteSpace: "nowrap" }}>
      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10, fontWeight: 800, letterSpacing: ".3em" }}>{en}</span>
      {ko && <><span style={{ width: 3, height: 3, borderRadius: 3, background: color, opacity: 0.6 }} /><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em" }}>{ko}</span></>}
    </div>
  );
}
export function LiveBadge({ state, now, ms }) {
  const label = state === "live" ? "LIVE" : state === "recent" ? "GPS" : "LAST";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 10px", borderRadius: 999, background: "rgba(11,20,40,.7)", border: `1px solid ${state === "live" ? "rgba(52,211,153,.45)" : "rgba(143,176,240,.25)"}`, backdropFilter: "blur(8px)" }}>
      <span className={`kp-live-dot ${state === "live" ? "on" : ""}`} style={{ background: LIVE_COLORS[state] || LIVE_COLORS.stale }} />
      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", color: state === "live" ? "#A7F3D0" : "#CBD5E1" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#CFE0FF", fontVariantNumeric: "tabular-nums" }}>{hms(ms)}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(207,224,255,.6)" }}>{liveAgeText(ms, now)}</span>
    </span>
  );
}
export function GradeTag({ grade }) {
  if (!grade) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 6, background: "rgba(143,176,240,.14)", border: "1px solid rgba(143,176,240,.3)", color: "#CFE0FF", fontSize: 11, fontWeight: 800 }}>{grade}</span>;
}
export function Stat({ label, en, value, unit, sub, accent }) {
  return (
    <div className="kp-lv-tile" style={{ padding: "11px 13px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.7)" }}>{label}</span>
        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 8.5, fontWeight: 800, letterSpacing: ".22em", color: "rgba(143,176,240,.55)" }}>{en}</span>
      </div>
      <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap", overflow: "hidden" }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: accent || "#fff", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {unit && <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.6)" }}>{unit}</span>}
      </div>
      {sub && <div style={{ marginTop: 2, fontSize: 11, fontWeight: 600, color: "rgba(207,224,255,.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
}
export function Stepper({ step }) {
  if (step < 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {STEP_LABELS.map((lb, i) => {
        const done = i < step, cur = i === step;
        return (
          <div key={lb} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", minWidth: 0 }}>
            {i > 0 && <div style={{ position: "absolute", top: 5, right: "50%", width: "100%", height: 2, background: i <= step ? C.accent : "rgba(143,176,240,.18)" }} />}
            <span className={`kp-live-dot ${cur ? "on" : ""}`} style={{ width: cur ? 12 : 10, height: cur ? 12 : 10, background: cur ? LIVE_COLORS.live : done ? C.accent : "#33476D", border: "2px solid #0F1A30", zIndex: 1 }} />
            <span style={{ marginTop: 5, fontSize: 10.5, fontWeight: cur ? 900 : 700, color: cur ? "#A7F3D0" : done ? "#CFE0FF" : "rgba(207,224,255,.4)", whiteSpace: "nowrap" }}>{lb}</span>
          </div>
        );
      })}
    </div>
  );
}
export function RouteLine({ order }) {
  const row = (tag, color, name, addr, date, time) => (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, background: color, color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,.2)" }}>{tag}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name || "-"}</span>
          <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 11, fontWeight: 700, color: C.accent }}>{[String(date || "").slice(5).replace("-", "."), time].filter(Boolean).join(" ")}</span>
        </div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(207,224,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{addr || ""}</div>
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
      <div style={{ position: "absolute", left: 10.5, top: 22, bottom: 22, width: 1, background: "linear-gradient(#2D4C82,#8FB0F0)", opacity: 0.6 }} />
      {row("상", C.steel, order?.상차지명, order?.상차지주소, order?.상차일, order?.상차시간)}
      {row("하", "#5B6B85", order?.하차지명, order?.하차지주소, order?.하차일, order?.하차시간)}
    </div>
  );
}
export function CallButtons({ tel, compact }) {
  if (!tel) return null;
  const h = compact ? 40 : 44;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <a href={`tel:${tel}`} onClick={(e) => e.stopPropagation()} style={{ flex: 1, height: h, borderRadius: 14, background: "linear-gradient(180deg,#FFFFFF,#E6EEFF)", color: C.ink, fontSize: 14, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", boxShadow: "0 6px 18px rgba(143,176,240,.25)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.59a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.7 16z" /></svg>
        전화하기 <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 12, fontWeight: 700, color: C.steel }}>{fmtPhone(tel)}</span>
      </a>
      <a href={`sms:${tel}`} onClick={(e) => e.stopPropagation()} className="kp-lv-ghost" title="문자" style={{ width: h, height: h, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      </a>
    </div>
  );
}
export function IconBtn({ on, onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ height: 34, padding: "0 12px", borderRadius: 11, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, cursor: "pointer", backdropFilter: "blur(8px)",
        background: on ? "rgba(143,176,240,.95)" : "rgba(11,20,40,.72)", color: on ? C.ink : "#E6EEFF", border: `1px solid ${on ? "#CFE0FF" : "rgba(143,176,240,.28)"}`, boxShadow: "0 4px 14px rgba(11,20,40,.35)" }}>
      {children}
    </button>
  );
}
export function CloseBtn({ onClose }) {
  return (
    <button type="button" onClick={onClose} aria-label="닫기" className="kp-lv-ghost" style={{ width: 34, height: 34, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  );
}
export function TileNotice({ show }) {
  if (!show) return null;
  return (
    <div style={{ position: "absolute", left: "50%", top: 58, transform: "translateX(-50%)", zIndex: 1001, padding: "6px 12px", borderRadius: 10, background: "rgba(11,20,40,.8)", border: "1px solid rgba(143,176,240,.25)", color: "#CFE0FF", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", pointerEvents: "none" }}>
      지도 배경을 불러오지 못했습니다 · 좌표 격자로 표시 중
    </div>
  );
}
export function Shell({ mobile, onClose, wide, children }) {
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div onClick={onClose} onDoubleClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, zIndex: Z, background: "rgba(6,12,26,.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: mobile ? "stretch" : "center", justifyContent: "center", padding: mobile ? 0 : 20, animation: "kpLiveFade .18s ease-out" }}>
      <style>{MAP_CSS}</style>
      <div onClick={(e) => e.stopPropagation()} className="kp-lv-map" data-kp="live-modal"
        style={{ position: "relative", width: mobile ? "100%" : `min(${wide ? 1280 : 1120}px, 100%)`, height: mobile ? "100%" : `min(${wide ? 780 : 720}px, 100%)`, borderRadius: mobile ? 0 : 24, overflow: "hidden",
          display: "flex", flexDirection: mobile ? "column" : "row", background: `linear-gradient(160deg,${C.deep} 0%,${C.ink} 100%)`, color: "#fff",
          border: mobile ? "none" : "1px solid rgba(143,176,240,.22)", boxShadow: "0 30px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06)", animation: mobile ? "kpLiveSheet .22s ease-out" : "kpLiveIn .22s ease-out" }}>
        {children}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 오더 1건 — 기사 실시간 관제 화면(데이터는 밖에서 받는다: 배차 프로그램은 drivers/gps_tracks, 허브는 hubLive)
//  entry: { lat, lng, speed, plate, name, phone, grade, status, updatedMs } · track: [{ lat, lng, timestamp }]
//  order: { 상차지명, 상차지주소, 상차일, 상차시간, 하차지명, 하차지주소, 하차일, 하차시간, 화물내용, 차량톤수, 차량종류, 거래처명, 차량번호, 이름 }
// ═════════════════════════════════════════════════════════════════════════════
export function LiveTrackView({ order, entry, track = [], pickupGeo, dropGeo, phase, step = -1, remain, mobile, onClose, emptyText }) {
  const now = useLiveNow();
  const [follow, setFollow] = React.useState(true);
  const [fitKey, setFitKey] = React.useState(0);
  const [tileErr, setTileErr] = React.useState(false);
  const loc = entry ? { lat: entry.lat, lng: entry.lng } : null;
  const st = liveState(entry, now);
  const straight = React.useMemo(() => {
    if (!loc) return null;
    const target = step >= 3 ? dropGeo : pickupGeo;
    if (!target) return null;
    const km = haversineKm(loc.lat, loc.lng, target.lat, target.lng);
    return { km, label: step >= 3 ? "하차지까지" : "상차지까지" };
  }, [loc?.lat, loc?.lng, pickupGeo, dropGeo, step]); // eslint-disable-line react-hooks/exhaustive-deps
  const kmTrack = React.useMemo(() => trackKm(track), [track]);
  const tel = telOf(entry, order);
  const fitPoints = React.useMemo(() => [loc && [loc.lat, loc.lng], pickupGeo && [pickupGeo.lat, pickupGeo.lng], dropGeo && [dropGeo.lat, dropGeo.lng]].filter(Boolean), [loc?.lat, loc?.lng, pickupGeo, dropGeo]); // eslint-disable-line react-hooks/exhaustive-deps
  const onTileError = React.useCallback(() => setTileErr(true), []);
  const stopFollow = React.useCallback(() => setFollow(false), []);

  if (!entry) {
    return (
      <Shell mobile={mobile} onClose={onClose}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 30 }}>
          <Eyebrow>LIVE · 실시간 관제</Eyebrow>
          <div style={{ fontSize: 16, fontWeight: 800 }}>기사앱 위치 정보가 없습니다</div>
          <div style={{ fontSize: 13, color: "rgba(207,224,255,.6)" }}>{emptyText || `${order?.차량번호 || ""} · 기사앱에 로그인해 위치를 보내고 있는지 확인해 주세요.`}</div>
          <button type="button" onClick={onClose} className="kp-lv-ghost" style={{ marginTop: 10, height: 40, padding: "0 18px", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>닫기</button>
        </div>
      </Shell>
    );
  }

  const remainKm = remain?.km ?? (straight ? Math.round(straight.km * 10) / 10 : null);
  const remainMin = remain?.min ?? (straight ? Math.max(1, Math.round(((straight.km * 1.3) / 55) * 60)) : null);
  const remainLabel = remain?.label || straight?.label || "남은 거리";
  const center = [entry.lat, entry.lng];

  const map = (
    <div style={{ position: "relative", flex: 1, minHeight: mobile ? "46vh" : 0, minWidth: 0 }}>
      <BaseMap center={center} zoom={14} onTileError={onTileError}>
        <MapGlue follow={follow} center={center} fitKey={fitKey} fitPoints={fitPoints} onUserMove={stopFollow} />
        <LeafletTrack points={track} showStatusChanges={false} />
        {pickupGeo && <Marker position={[pickupGeo.lat, pickupGeo.lng]} icon={pinIcon(`상차 · ${order?.상차지명 || ""}`.slice(0, 18), C.steel)} />}
        {dropGeo && <Marker position={[dropGeo.lat, dropGeo.lng]} icon={pinIcon(`하차 · ${order?.하차지명 || ""}`.slice(0, 18), "#5B6B85")} />}
        <Marker position={center} icon={truckIcon({ plate: entry.plate, state: st, selected: true, speed: entry.speed })} zIndexOffset={1000} />
      </BaseMap>
      <TileNotice show={tileErr} />
      <div style={{ position: "absolute", left: 14, top: 14, zIndex: 1001, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <LiveBadge state={st} now={now} ms={entry.updatedMs} />
      </div>
      <div style={{ position: "absolute", right: 14, top: 14, zIndex: 1001, display: "flex", gap: 6 }}>
        <IconBtn on={follow} onClick={() => setFollow((v) => !v)} title="기사 위치를 자동으로 따라가기">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
          따라가기
        </IconBtn>
        <IconBtn onClick={() => { setFollow(false); setFitKey((k) => k + 1); }} title="기사·상차지·하차지가 모두 보이게">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          전체
        </IconBtn>
      </div>
      <div style={{ position: "absolute", left: 14, bottom: 14, zIndex: 1001, display: "flex", gap: 10, alignItems: "center", padding: "6px 10px", borderRadius: 10, background: "rgba(11,20,40,.72)", border: "1px solid rgba(143,176,240,.2)", fontSize: 11, fontWeight: 700, color: "#CFE0FF" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 16, height: 4, borderRadius: 3, background: "#7c3aed" }} />최근 3시간 이동</span>
        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: C.accent }}>{entry.lat.toFixed(5)}, {entry.lng.toFixed(5)}</span>
      </div>
    </div>
  );

  const panel = (
    <div className="kp-lv-scroll" style={{ width: mobile ? "100%" : 372, flexShrink: 0, overflowY: "auto", maxHeight: mobile ? "54vh" : "none", padding: mobile ? "14px 16px 22px" : "20px 20px 22px", display: "flex", flexDirection: "column", gap: 14,
      borderLeft: mobile ? "none" : `1px solid ${C.line}`, borderTop: mobile ? `1px solid ${C.line}` : "none", background: "linear-gradient(180deg,rgba(27,43,75,.55),rgba(11,20,40,.25))" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Eyebrow>LIVE · 실시간 관제</Eyebrow>
          <div style={{ marginTop: 6, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 24, fontWeight: 800, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.plate || order?.차량번호}</div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>{entry.name || order?.이름 || "-"}</span>
            <GradeTag grade={entry.grade} />
            {entry.status && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 20, padding: "0 7px", borderRadius: 6, background: "rgba(52,211,153,.12)", border: "1px solid rgba(52,211,153,.3)", color: "#A7F3D0", fontSize: 11, fontWeight: 800 }}>기사앱 · {entry.status}</span>}
          </div>
        </div>
        <CloseBtn onClose={onClose} />
      </div>

      <div className="kp-lv-tile" style={{ padding: "13px 12px 11px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#CFE0FF" }}>운행 단계</span>
          <span style={{ fontSize: 12, fontWeight: 900, color: phase === "휴차" ? "#CBD5E1" : "#A7F3D0" }}>{phase || "-"}</span>
        </div>
        {step >= 0 ? <Stepper step={step} /> : <div style={{ fontSize: 11.5, color: "rgba(207,224,255,.5)" }}>상·하차지 좌표를 확인하는 중이거나 운행 전입니다</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Stat label="현재 속도" en="SPEED" value={st === "stale" ? "—" : entry.speed} unit={st === "stale" ? "" : "km/h"} sub={st === "stale" ? "수신 끊김" : entry.speed >= 5 ? "이동 중" : "정차 중"} accent={st === "live" && entry.speed >= 5 ? "#A7F3D0" : undefined} />
        <Stat label="최종 수신" en="LAST FIX" value={hms(entry.updatedMs).slice(0, 5)} sub={liveAgeText(entry.updatedMs, now)} />
        <Stat label={remainLabel} en="REMAIN" value={remainKm != null ? remainKm : "—"} unit={remainKm != null ? "km" : ""} sub={remain ? "실도로 기준" : straight ? "직선거리 기준" : "좌표 없음"} />
        <Stat label="도착 예상" en="ETA" value={remainMin != null ? hm(now + remainMin * 60000) : "—"} sub={remainMin != null ? `약 ${fmtMin(remainMin)}${remain ? "" : " (추정)"}` : "상·하차지 좌표 필요"} accent={remainMin != null ? C.accent : undefined} />
      </div>

      <div className="kp-lv-tile" style={{ padding: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#CFE0FF" }}>오더</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>{order?.거래처명 || ""}</span>
        </div>
        <RouteLine order={order} />
        {(order?.화물내용 || order?.차량톤수 || order?.차량종류) && (
          <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px dashed ${C.line}`, fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.65)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {[order?.차량톤수, order?.차량종류, order?.화물내용].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.55)" }}>
        <span>최근 3시간 이동 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: "#CFE0FF" }}>{kmTrack.toFixed(1)}</b> km · <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: "#CFE0FF" }}>{track.length}</b>개 지점</span>
        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{hms(now).slice(0, 5)} KST</span>
      </div>

      <CallButtons tel={tel} compact={mobile} />
    </div>
  );

  return (
    <Shell mobile={mobile} onClose={onClose}>
      {map}
      {panel}
    </Shell>
  );
}

