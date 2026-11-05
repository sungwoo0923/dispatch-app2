// ======================= src/LiveFleetMaps.jsx =======================
// ⭐ 2026-11-05 배차현황 실시간 관제 — 지도 창(필요할 때만 따로 받아오는 파일)
//  · kind="one"  : 오더 1건의 기사 실시간 위치(자동 따라가기) + 상/하차지 + 최근 이동경로 + 속도·수신시각·남은거리/도착예상
//  · kind="fleet": 지금 목록(필터 결과)의 배차완료 지입·직영·임대 기사 전체를 한 지도에
//  지도는 지입차관리 › 관제현황과 같은 Leaflet + OpenStreetMap(흑백 톤) · 트럭 마커 · mapLeaflet의 이동경로 선을 그대로 쓴다.
//  읽기: 창이 열린 동안만 drivers/{id} 1건 + gps_tracks(그 기사 · 오늘 · 최근 3시간) 구독, 닫으면 해제.
import React from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { db } from "./firebase";
import { collection, doc, onSnapshot, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import { LeafletTrack } from "./mapLeaflet";
import { cleanTrack } from "./mapStyle";
import { haversineKm } from "./tmapFareCalc";
import { useAddrGeo, useRemainInfo, computeFleetPhase, fleetStepIndex } from "./fleetGeo";
import {
  LIVE_MONO as MONO, LIVE_COLORS, liveState, liveAgeText, liveTsMs, useLiveNow, useFleetLiveEntry, useFleetLiveIndex,
  useLiveFleetRows, normLivePlate,
} from "./liveFleet";

const C = { ink: "#0B1428", deep: "#0F1A30", navy: "#1B2B4B", steel: "#2D4C82", accent: "#8FB0F0", line: "rgba(143,176,240,.16)", glass: "rgba(15,26,48,.72)" };
const Z = 10000040;
const noop = () => {};
const TRACK_WINDOW_MS = 3 * 3600 * 1000;
const STEP_LABELS = ["상차이동", "상차진입", "상차도착", "하차이동", "하차진입", "하차도착"];

const kstDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const hms = (ms) => { if (!ms) return "--:--:--"; const d = new Date(ms); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":"); };
const hm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtPhone = (p) => { const d = String(p || "").replace(/\D/g, ""); if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`; if (d.length === 10) return d.startsWith("02") ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`; return String(p || ""); };
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`);
const telOf = (e, o) => String(e?.phone || o?.전화번호 || "").replace(/[^\d+]/g, "");
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ─── 마커(관제현황 liveTruckIcon과 같은 모양 · 네이비 톤 + LIVE 펄스) ─────────────────
// 같은 모양이면 같은 아이콘 객체를 재사용(다시 그릴 때 마커가 깜빡이지 않게)
const _iconCache = new Map();
function cachedIcon(key, make) {
  let ic = _iconCache.get(key);
  if (!ic) { if (_iconCache.size > 400) _iconCache.clear(); ic = make(); _iconCache.set(key, ic); }
  return ic;
}
function truckIcon(o) {
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
function pinIcon(label, color) {
  return cachedIcon(`p|${label}|${color}`, () => L.divIcon({
    html: `<div style="position:absolute;left:0;top:0;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;"><div style="background:${color};color:#fff;font:900 11.5px 'Noto Sans KR',sans-serif;padding:3px 9px;border-radius:8px;border:2px solid #fff;box-shadow:0 3px 10px rgba(11,20,40,.35);white-space:nowrap;">${esc(label)}</div><div style="width:2px;height:7px;background:${color};"></div><div style="width:10px;height:10px;border-radius:50%;background:${color};border:2.5px solid #fff;margin-top:-1px;box-shadow:0 1px 4px rgba(0,0,0,.3);"></div></div>`,
    className: "", iconSize: [0, 0], iconAnchor: [0, 0],
  }));
}

function MapGlue({ follow, center, fitKey, fitPoints }) {
  const map = useMap();
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
function FlyTo({ target }) {
  const map = useMap();
  React.useEffect(() => { if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 13), { duration: 0.7 }); }, [target, map]);
  return null;
}

function BaseMap({ center, zoom = 13, children, onTileError }) {
  return (
    <MapContainer center={center} zoom={zoom} scrollWheelZoom zoomControl={false} attributionControl style={{ height: "100%", width: "100%" }}>
      <TileLayer className="kp-lv-tiles" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" eventHandlers={{ tileerror: onTileError }} />
      {children}
    </MapContainer>
  );
}

const MAP_CSS = `
.kp-lv-map .leaflet-container{background:radial-gradient(800px 400px at 70% 0%,rgba(45,76,130,.35),transparent 60%),linear-gradient(rgba(143,176,240,.07) 1px,transparent 1px) 0 0/28px 28px,linear-gradient(90deg,rgba(143,176,240,.07) 1px,transparent 1px) 0 0/28px 28px,#0F1A30;font-family:inherit}
.kp-lv-tiles{filter:grayscale(.85) contrast(.95) brightness(1.04)}
.kp-lv-map .leaflet-control-attribution{background:rgba(11,20,40,.6);color:#8FB0F0;font-size:9px}
.kp-lv-map .leaflet-control-attribution a{color:#CFE0FF}
.kp-lv-scroll::-webkit-scrollbar{width:6px}.kp-lv-scroll::-webkit-scrollbar-thumb{background:rgba(143,176,240,.22);border-radius:6px}
.kp-lv-tile{border:1px solid rgba(143,176,240,.14);background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.015));border-radius:16px}
.kp-lv-ghost{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#E6EEFF}
.kp-lv-ghost:hover{background:rgba(255,255,255,.1);border-color:rgba(143,176,240,.5)}
`;

// ─── 구독 훅(창이 열린 동안만) ────────────────────────────────────────────────
function useDriverDocLive(id) {
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    if (!id) return undefined;
    const un = onSnapshot(doc(db, "drivers", id), (s) => { if (s.exists && s.exists()) setD({ id, ...s.data() }); }, () => {});
    return () => un();
  }, [id]);
  return d;
}
function useRecentTrack(id) {
  const [pts, setPts] = React.useState([]);
  React.useEffect(() => {
    if (!id) { setPts([]); return undefined; }
    const since = Date.now() - TRACK_WINDOW_MS;
    const apply = (snap) => {
      const list = [];
      snap.docs.forEach((x) => {
        const p = x.data();
        if (p.driverId && p.driverId !== id) return; // (점검용 가짜 데이터는 조건 없이 오므로 한 번 더 거른다)
        const ms = liveTsMs(p.timestamp);
        if (p.lat == null || p.lng == null || (ms && ms < since)) return;
        list.push({ lat: Number(p.lat), lng: Number(p.lng), timestamp: ms, accuracy: p.accuracy, speed: p.speed });
      });
      list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setPts(list.slice(-400));
    };
    let un2 = null;
    // 오늘·최근 3시간만(색인: driverId+date+timestamp — 경로보기와 같은 색인). 색인 오류면 오늘 전체로 한 번만 대신 조회.
    const un1 = onSnapshot(
      query(collection(db, "gps_tracks"), where("driverId", "==", id), where("date", "==", kstDate()), where("timestamp", ">=", Timestamp.fromMillis(since)), orderBy("timestamp", "asc"), limit(600)),
      apply,
      () => { if (!un2) un2 = onSnapshot(query(collection(db, "gps_tracks"), where("driverId", "==", id), where("date", "==", kstDate())), apply, () => setPts([])); }
    );
    return () => { un1(); if (un2) un2(); };
  }, [id]);
  return pts;
}

// 기사 문서(창 전용 구독)와 공용 색인 중 더 최신 값
function mergeLive(entry, d) {
  if (!d?.location || d.location.lat == null) return entry;
  const ms = liveTsMs(d.updatedAt) || liveTsMs(d.heartbeatAt);
  if (entry && ms <= (entry.updatedMs || 0)) return entry;
  return {
    ...(entry || {}), id: d.id, lat: Number(d.location.lat), lng: Number(d.location.lng), speed: Math.max(0, Math.round(Number(d.speed) || 0)),
    status: String(d.status || d.mainStatus || d.state || entry?.status || ""), updatedMs: ms,
    name: entry?.name || d.이름 || d.name || "", phone: entry?.phone || d.전화번호 || d.phone || "", plate: entry?.plate || d.차량번호 || d.carNo || "", grade: entry?.grade || d.등급 || "",
  };
}

function trackKm(pts) {
  const c = cleanTrack(pts);
  let km = 0;
  for (let i = 1; i < c.length; i++) km += haversineKm(c[i - 1].lat, c[i - 1].lng, c[i].lat, c[i].lng);
  return km;
}

// ─── 작은 UI 조각 ──────────────────────────────────────────────────────────
// "LIVE · 실시간 관제" — 영문은 넓게, 한글은 좁게(한글에 넓은 자간을 주면 글자가 흩어져 보인다)
function Eyebrow({ children, color = C.accent }) {
  const [en, ko] = String(children).split(" · ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color, whiteSpace: "nowrap" }}>
      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: ".3em" }}>{en}</span>
      {ko && <><span style={{ width: 3, height: 3, borderRadius: 3, background: color, opacity: 0.6 }} /><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em" }}>{ko}</span></>}
    </div>
  );
}
function LiveBadge({ state, now, ms }) {
  const label = state === "live" ? "LIVE" : state === "recent" ? "GPS" : "LAST";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 10px", borderRadius: 999, background: "rgba(11,20,40,.7)", border: `1px solid ${state === "live" ? "rgba(52,211,153,.45)" : "rgba(143,176,240,.25)"}`, backdropFilter: "blur(8px)" }}>
      <span className={`kp-live-dot ${state === "live" ? "on" : ""}`} style={{ background: LIVE_COLORS[state] || LIVE_COLORS.stale }} />
      <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", color: state === "live" ? "#A7F3D0" : "#CBD5E1" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#CFE0FF", fontVariantNumeric: "tabular-nums" }}>{hms(ms)}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(207,224,255,.6)" }}>{liveAgeText(ms, now)}</span>
    </span>
  );
}
function GradeTag({ grade }) {
  if (!grade) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 7px", borderRadius: 6, background: "rgba(143,176,240,.14)", border: "1px solid rgba(143,176,240,.3)", color: "#CFE0FF", fontSize: 11, fontWeight: 800 }}>{grade}</span>;
}
function Stat({ label, en, value, unit, sub, accent }) {
  return (
    <div className="kp-lv-tile" style={{ padding: "11px 13px", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.7)" }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: ".22em", color: "rgba(143,176,240,.55)" }}>{en}</span>
      </div>
      <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap", overflow: "hidden" }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: accent || "#fff", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {unit && <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.6)" }}>{unit}</span>}
      </div>
      {sub && <div style={{ marginTop: 2, fontSize: 11, fontWeight: 600, color: "rgba(207,224,255,.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
}
function Stepper({ step }) {
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
function RouteLine({ order }) {
  const row = (tag, color, name, addr, date, time) => (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, background: color, color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 1px 0 rgba(255,255,255,.2)" }}>{tag}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name || "-"}</span>
          <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: C.accent }}>{[String(date || "").slice(5).replace("-", "."), time].filter(Boolean).join(" ")}</span>
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
function CallButtons({ tel, compact }) {
  if (!tel) return null;
  const h = compact ? 40 : 44;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <a href={`tel:${tel}`} onClick={(e) => e.stopPropagation()} style={{ flex: 1, height: h, borderRadius: 14, background: "linear-gradient(180deg,#FFFFFF,#E6EEFF)", color: C.ink, fontSize: 14, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none", boxShadow: "0 6px 18px rgba(143,176,240,.25)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.59a16 16 0 0 0 6 6l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.7 16z" /></svg>
        전화하기 <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.steel }}>{fmtPhone(tel)}</span>
      </a>
      <a href={`sms:${tel}`} onClick={(e) => e.stopPropagation()} className="kp-lv-ghost" title="문자" style={{ width: h, height: h, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      </a>
    </div>
  );
}
function IconBtn({ on, onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ height: 34, padding: "0 12px", borderRadius: 11, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, cursor: "pointer", backdropFilter: "blur(8px)",
        background: on ? "rgba(143,176,240,.95)" : "rgba(11,20,40,.72)", color: on ? C.ink : "#E6EEFF", border: `1px solid ${on ? "#CFE0FF" : "rgba(143,176,240,.28)"}`, boxShadow: "0 4px 14px rgba(11,20,40,.35)" }}>
      {children}
    </button>
  );
}
function CloseBtn({ onClose }) {
  return (
    <button type="button" onClick={onClose} aria-label="닫기" className="kp-lv-ghost" style={{ width: 34, height: 34, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  );
}
function TileNotice({ show }) {
  if (!show) return null;
  return (
    <div style={{ position: "absolute", left: "50%", top: 58, transform: "translateX(-50%)", zIndex: 1001, padding: "6px 12px", borderRadius: 10, background: "rgba(11,20,40,.8)", border: "1px solid rgba(143,176,240,.25)", color: "#CFE0FF", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", pointerEvents: "none" }}>
      지도 배경을 불러오지 못했습니다 · 좌표 격자로 표시 중
    </div>
  );
}
function Shell({ mobile, onClose, wide, children }) {
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
// 오더 1건 — 기사 실시간 관제
// ═════════════════════════════════════════════════════════════════════════════
function LiveTrackModal({ order, plate, mobile, onClose }) {
  const entry0 = useFleetLiveEntry(plate || order?.차량번호);
  const [frozen] = React.useState(entry0); // 색인에서 빠져도(등급 변경 등) 창은 유지
  const docLive = useDriverDocLive((entry0 || frozen)?.id);
  const entry = mergeLive(entry0 || frozen, docLive);
  const track = useRecentTrack(entry?.id);
  const now = useLiveNow();
  const [follow, setFollow] = React.useState(true);
  const [fitKey, setFitKey] = React.useState(0);
  const [tileErr, setTileErr] = React.useState(false);
  const pickupGeo = useAddrGeo(order?.상차지주소 || null);
  const dropGeo = useAddrGeo(order?.하차지주소 || null);
  const loc = entry ? { lat: entry.lat, lng: entry.lng } : null;
  const st = liveState(entry, now);
  const phase = entry ? computeFleetPhase({ driverStatus: entry.status, orders: [{ ...order, 기사확인상태: "수락" }], location: loc }) : null;
  const step = phase ? fleetStepIndex(order, phase) : -1;
  const remain = useRemainInfo(order, st === "stale" ? null : loc, phase);
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

  if (!entry) {
    return (
      <Shell mobile={mobile} onClose={onClose}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 30 }}>
          <Eyebrow>LIVE · 실시간 관제</Eyebrow>
          <div style={{ fontSize: 16, fontWeight: 800 }}>기사앱 위치 정보가 없습니다</div>
          <div style={{ fontSize: 13, color: "rgba(207,224,255,.6)" }}>{order?.차량번호} · 기사앱에 로그인해 위치를 보내고 있는지 확인해 주세요.</div>
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
        <MapGlue follow={follow} center={center} fitKey={fitKey} fitPoints={fitPoints} />
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
        <span style={{ fontFamily: MONO, color: C.accent }}>{entry.lat.toFixed(5)}, {entry.lng.toFixed(5)}</span>
      </div>
    </div>
  );

  const panel = (
    <div className="kp-lv-scroll" style={{ width: mobile ? "100%" : 372, flexShrink: 0, overflowY: "auto", maxHeight: mobile ? "54vh" : "none", padding: mobile ? "14px 16px 22px" : "20px 20px 22px", display: "flex", flexDirection: "column", gap: 14,
      borderLeft: mobile ? "none" : `1px solid ${C.line}`, borderTop: mobile ? `1px solid ${C.line}` : "none", background: "linear-gradient(180deg,rgba(27,43,75,.55),rgba(11,20,40,.25))" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Eyebrow>LIVE · 실시간 관제</Eyebrow>
          <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 24, fontWeight: 800, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.plate || order?.차량번호}</div>
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
        <span>최근 3시간 이동 <b style={{ fontFamily: MONO, color: "#CFE0FF" }}>{kmTrack.toFixed(1)}</b> km · <b style={{ fontFamily: MONO, color: "#CFE0FF" }}>{track.length}</b>개 지점</span>
        <span style={{ fontFamily: MONO }}>{hms(now).slice(0, 5)} KST</span>
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

// ═════════════════════════════════════════════════════════════════════════════
// 목록 전체 — 배차완료 지입·직영·임대 기사 한 지도에
// ═════════════════════════════════════════════════════════════════════════════
function FleetMapModal({ rows, mobile, onClose }) {
  const groups = useLiveFleetRows(rows);
  const { index } = useFleetLiveIndex();
  const now = useLiveNow();
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("all"); // all | live | moving | idle
  const [sel, setSel] = React.useState(null);
  const [fly, setFly] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [fitKey, setFitKey] = React.useState(1);
  const [tileErr, setTileErr] = React.useState(false);
  const onTileError = React.useCallback(() => setTileErr(true), []);

  const items = React.useMemo(() => groups.map((g) => {
    const e = index.get(g.key);
    if (!e) return null;
    const s = liveState(e, now);
    const ord = [...g.orders].sort((a, b) => `${a.상차일 || ""} ${a.상차시간 || ""}`.localeCompare(`${b.상차일 || ""} ${b.상차시간 || ""}`));
    return { id: g.id, e, s, orders: ord, moving: s !== "stale" && e.speed >= 5 };
  }).filter((x) => x && x.s !== "none").sort((a, b) => (b.e.updatedMs || 0) - (a.e.updatedMs || 0)), [groups, index, now]);

  const counts = { all: items.length, live: items.filter((x) => x.s === "live").length, moving: items.filter((x) => x.moving).length };
  counts.idle = items.length - counts.moving;
  const qq = q.trim().toLowerCase();
  const shown = items.filter((x) => (tab === "all" || (tab === "live" ? x.s === "live" : tab === "moving" ? x.moving : !x.moving))
    && (!qq || [x.e.plate, x.e.name, ...x.orders.map((o) => `${o.거래처명 || ""} ${o.상차지명 || ""} ${o.하차지명 || ""}`)].join(" ").toLowerCase().includes(qq) || normLivePlate(x.e.plate).toLowerCase().includes(qq.replace(/\s/g, ""))));
  const selItem = items.find((x) => x.id === sel) || null;
  const fitPoints = React.useMemo(() => items.map((x) => [x.e.lat, x.e.lng]), [items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const center = fitPoints[0] || [37.45, 126.95];
  const pick = (x) => { setSel(x.id); setFly({ lat: x.e.lat, lng: x.e.lng, t: Date.now() }); };

  const TABS = [["all", "전체"], ["live", "LIVE"], ["moving", "운행중"], ["idle", "정차"]];
  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Eyebrow>LIVE · 실시간 관제</Eyebrow>
        <div style={{ marginTop: 6, fontSize: 19, fontWeight: 900, letterSpacing: "-.01em" }}>배차완료 차량 관제</div>
        <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: "rgba(207,224,255,.55)" }}>지입 · 직영 · 임대 기사앱 위치 · 지금 목록 기준</div>
      </div>
      <CloseBtn onClose={onClose} />
    </div>
  );
  const kpis = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
      {[["관제 대상", "UNITS", counts.all, "#fff"], ["LIVE", "ONLINE", counts.live, "#A7F3D0"], ["운행중", "MOVING", counts.moving, C.accent]].map(([l, en, v, c]) => (
        <div key={en} className="kp-lv-tile" style={{ padding: "9px 11px" }}>
          <div style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: ".22em", color: "rgba(143,176,240,.6)" }}>{en}</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.7)" }}>{l}</span>
            <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</span>
          </div>
        </div>
      ))}
    </div>
  );
  const filters = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 12, background: "rgba(255,255,255,.04)", border: `1px solid ${C.line}` }}>
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ flex: 1, height: 30, borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer", border: "none", background: tab === k ? "rgba(143,176,240,.95)" : "transparent", color: tab === k ? C.ink : "rgba(207,224,255,.7)" }}>
            {l} <span style={{ fontFamily: MONO, fontSize: 10.5, opacity: 0.75 }}>{counts[k]}</span>
          </button>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8FB0F0" strokeWidth="2.4" strokeLinecap="round" style={{ position: "absolute", left: 11, top: 11 }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="차량번호 · 기사 · 거래처 · 상하차지" autoComplete="off"
          style={{ width: "100%", height: 36, padding: "0 12px 0 32px", borderRadius: 11, border: `1px solid ${C.line}`, background: "rgba(255,255,255,.05)", color: "#fff", fontSize: 12.5, fontWeight: 600, outline: "none" }} />
      </div>
    </div>
  );
  const list = (
    <div className="kp-lv-scroll" style={{ display: "flex", flexDirection: "column", gap: 7, overflowY: "auto", minHeight: 0, flex: 1, paddingRight: 2 }}>
      {shown.length === 0 && (
        <div style={{ padding: "28px 8px", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "rgba(207,224,255,.5)", lineHeight: 1.6 }}>
          {items.length ? "조건에 맞는 차량이 없습니다" : <>지금 목록에 기사앱 위치가 잡힌<br />배차완료 지입·직영·임대 차량이 없습니다</>}
        </div>
      )}
      {shown.map((x) => {
        const o = x.orders[0];
        const on = x.id === sel;
        return (
          <button key={x.id} type="button" onClick={() => pick(x)} data-kp-live-item={x.e.plate}
            style={{ textAlign: "left", padding: "10px 12px", borderRadius: 14, cursor: "pointer", color: "#fff", background: on ? "linear-gradient(135deg,rgba(45,76,130,.85),rgba(27,43,75,.85))" : "rgba(255,255,255,.035)", border: `1px solid ${on ? C.accent : C.line}`, boxShadow: on ? "0 0 0 3px rgba(143,176,240,.15)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={`kp-live-dot ${x.s === "live" ? "on" : ""}`} style={{ background: LIVE_COLORS[x.s] }} />
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 800 }}>{x.e.plate}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(207,224,255,.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.e.name}</span>
              <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: x.moving ? "#A7F3D0" : "rgba(207,224,255,.55)" }}>{x.s === "stale" ? "—" : `${x.e.speed}km/h`}</span>
            </div>
            <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "rgba(207,224,255,.6)" }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{o ? `${o.상차지명 || "-"} → ${o.하차지명 || "-"}` : ""}</span>
              {x.orders.length > 1 && <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 10, color: C.accent }}>+{x.orders.length - 1}</span>}
              <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 11 }}>{liveAgeText(x.e.updatedMs, now)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
  const selCard = selItem && (
    <div onClick={(e) => e.stopPropagation()} data-kp="live-sel"
      style={{ ...(mobile ? { position: "relative", flexShrink: 0 } : { position: "absolute", left: 16, bottom: 16, width: 390, zIndex: 1002 }), padding: mobile ? 12 : 14, borderRadius: 18, background: C.glass, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(143,176,240,.3)", boxShadow: "0 18px 40px rgba(0,0,0,.45)", animation: "kpLiveIn .18s ease-out", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`kp-live-dot ${selItem.s === "live" ? "on" : ""}`} style={{ background: LIVE_COLORS[selItem.s] }} />
        <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800 }}>{selItem.e.plate}</span>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{selItem.e.name}</span>
        <GradeTag grade={selItem.e.grade} />
        <button type="button" onClick={() => setSel(null)} aria-label="닫기" style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: 8, border: "none", background: "rgba(255,255,255,.08)", color: "#CFE0FF", cursor: "pointer" }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.7)" }}>
        <span>속도 <b style={{ fontFamily: MONO, color: "#fff" }}>{selItem.s === "stale" ? "—" : `${selItem.e.speed}km/h`}</b></span>
        <span>수신 <b style={{ fontFamily: MONO, color: "#fff" }}>{hms(selItem.e.updatedMs)}</b> · {liveAgeText(selItem.e.updatedMs, now)}</span>
        {selItem.e.status && <span>기사앱 <b style={{ color: "#A7F3D0" }}>{selItem.e.status}</b></span>}
      </div>
      <div className="kp-lv-scroll" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: mobile ? 132 : 210, overflowY: "auto" }}>
        {selItem.orders.map((o) => (
          <div key={o._id || o.id} className="kp-lv-tile" style={{ padding: "9px 11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.거래처명 || "-"}</span>
              <button type="button" onClick={() => setDetail(o)} style={{ flexShrink: 0, height: 24, padding: "0 9px", borderRadius: 8, border: "1px solid rgba(143,176,240,.45)", background: "rgba(143,176,240,.12)", color: "#CFE0FF", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>상세 관제 →</button>
            </div>
            <RouteLine order={o} />
          </div>
        ))}
      </div>
      <CallButtons tel={telOf(selItem.e, selItem.orders[0])} compact />
    </div>
  );
  const map = (
    <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: mobile ? "34vh" : 0 }}>
      <BaseMap center={center} zoom={10} onTileError={onTileError}>
        <MapGlue follow={false} center={null} fitKey={fitKey} fitPoints={fitPoints} />
        <FlyTo target={fly} />
        {items.map((x) => (
          <Marker key={x.id} position={[x.e.lat, x.e.lng]} icon={truckIcon({ plate: x.e.plate, state: x.s, selected: x.id === sel, speed: x.e.speed })}
            zIndexOffset={x.id === sel ? 1000 : x.s === "live" ? 500 : 0} eventHandlers={{ click: () => pick(x) }} />
        ))}
      </BaseMap>
      <TileNotice show={tileErr} />
      <div style={{ position: "absolute", right: 14, top: 14, zIndex: 1001, display: "flex", gap: 6 }}>
        <IconBtn onClick={() => { setSel(null); setFitKey((k) => k + 1); }} title="모든 차량이 보이게">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          전체 보기
        </IconBtn>
      </div>
      <div style={{ position: "absolute", left: 14, top: 14, zIndex: 1001 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 10px", borderRadius: 999, background: "rgba(11,20,40,.72)", border: "1px solid rgba(143,176,240,.25)" }}>
          <span className={`kp-live-dot ${counts.live ? "on" : ""}`} style={{ background: counts.live ? LIVE_COLORS.live : LIVE_COLORS.stale }} />
          <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", color: "#A7F3D0" }}>LIVE</span>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#CFE0FF" }}>{hms(now).slice(0, 5)} KST</span>
        </span>
      </div>
      {!mobile && selCard}
    </div>
  );

  return (
    <>
      <Shell mobile={mobile} onClose={detail ? noop : onClose} wide>
        {mobile ? (
          <>
            <div style={{ padding: "12px 14px 10px", display: "flex", flexDirection: "column", gap: 10, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}><Eyebrow>LIVE · 실시간 관제</Eyebrow><div style={{ marginTop: 3, fontSize: 16, fontWeight: 900 }}>배차완료 차량 관제 <span style={{ fontFamily: MONO, color: C.accent, fontSize: 14 }}>{counts.all}</span></div></div>
                <CloseBtn onClose={onClose} />
              </div>
              <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 12, background: "rgba(255,255,255,.04)", border: `1px solid ${C.line}` }}>
                {TABS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTab(k)} style={{ flex: 1, height: 30, borderRadius: 9, fontSize: 12, fontWeight: 800, border: "none", background: tab === k ? "rgba(143,176,240,.95)" : "transparent", color: tab === k ? C.ink : "rgba(207,224,255,.7)" }}>
                    {l} <span style={{ fontFamily: MONO, fontSize: 10.5, opacity: 0.75 }}>{counts[k]}</span>
                  </button>
                ))}
              </div>
            </div>
            {map}
            {/* 모바일: 고른 차량 카드는 지도를 가리지 않게 아래 칸에(목록 대신) */}
            <div className="kp-lv-scroll" style={{ maxHeight: selItem ? "48vh" : "34vh", overflowY: selItem ? "auto" : "hidden", display: "flex", flexDirection: "column", padding: "10px 12px 16px", borderTop: `1px solid ${C.line}` }}>{selItem ? selCard : list}</div>
          </>
        ) : (
          <>
            <div style={{ width: 352, flexShrink: 0, padding: "20px 16px 16px 20px", display: "flex", flexDirection: "column", gap: 14, minHeight: 0, borderRight: `1px solid ${C.line}`, background: "linear-gradient(180deg,rgba(27,43,75,.55),rgba(11,20,40,.25))" }}>
              {header}
              {kpis}
              {filters}
              {list}
            </div>
            {map}
          </>
        )}
      </Shell>
      {detail && <LiveTrackModal order={detail} plate={detail.차량번호} mobile={mobile} onClose={() => setDetail(null)} />}
    </>
  );
}

export default function LiveFleetMaps({ kind, ...p }) {
  return kind === "fleet" ? <FleetMapModal {...p} /> : <LiveTrackModal {...p} />;
}
