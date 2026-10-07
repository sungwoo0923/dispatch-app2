// src/mobile/MobileFleetView.jsx — 지입차량 관제 (모바일)
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { db, auth } from "../firebase";
import {
  collection, onSnapshot, query, where, orderBy, limit, doc, updateDoc,
} from "firebase/firestore";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap,
} from "react-leaflet";
import L from "leaflet";
import { getDrivingRoute, geocodeAddress, haversineKm } from "../tmapFareCalc";

const NAVY = "#1B2B4B";
// 전화번호 하이픈 자동 포맷 (DispatchApp.jsx formatPhone과 동일 규칙)
function formatPhone(phone) {
  const p = String(phone ?? "").replace(/[^\d]/g, "");
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
}
const STATUS_COLORS = {
  운송중: "#10b981", 출근: "#3b82f6", 상차중: "#f59e0b",
  하차중: "#8b5cf6", 대기: "#6b7280", 휴식: "#9ca3af",
  퇴근: "#374151", 복귀중: "#06b6d4", 휴차: "#374151",
};
const STATUS_ORDER = ["운송중", "상차중", "하차중", "복귀중", "출근", "대기", "휴식", "퇴근"];

// KPI 카드용 단색 라인 아이콘(path만) — 헤더의 알림벨/새로고침과 같은 톤.
// <svg stroke={accent}> 안에 그대로 끼워 쓴다.
const KPI_ICONS = {
  truck: <><rect x="1" y="5" width="14" height="10" rx="1.5" /><path d="M15 9h4l3 3v3h-7z" /><circle cx="6" cy="18" r="1.8" /><circle cx="18" cy="18" r="1.8" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></>,
  route: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M6 8.2V14a3 3 0 0 0 3 3h3a3 3 0 0 1 3 3v-2" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
};

function resolveTs(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  if (typeof ts === "number") return new Date(ts);
  return null;
}

function timeAgo(ts) {
  const d = resolveTs(ts);
  if (!d) return "-";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 30) return "방금";
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function formatDateTime(ts) {
  const d = resolveTs(ts);
  if (!d) return "--";
  return `${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function statusPriority(d) {
  const bonus = d.active ? 0 : 1000;
  const idx = STATUS_ORDER.indexOf(d.상태);
  return bonus + (idx === -1 ? 999 : idx);
}

// ─── 요일 유틸 (PC 지입차관리와 동일) ──────────────────────────────────────────
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
function weekdayKoOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  return WEEKDAYS_KO[d.getDay()] || "";
}
function nowKstMinutes() {
  const d = new Date(Date.now() + 9 * 3600000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function parseTimeToMin(t) {
  const m = String(t || "").match(/(\d{1,2}):(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
function computeOrderProgress(order, selectedDate, todayStr) {
  if (selectedDate < todayStr) return "done";
  if (selectedDate > todayStr) return "scheduled";
  const nowMin = nowKstMinutes();
  const pickMin = parseTimeToMin(order.상차시간);
  const dropMin = parseTimeToMin(order.하차시간);
  const sameDay = !order.하차일 || order.하차일 === order.상차일;
  if (sameDay && dropMin != null && nowMin >= dropMin) return "done";
  if (pickMin != null && nowMin < pickMin) return "scheduled";
  return "progress";
}
// PC 지입차관리(FleetManagement.jsx)의 driverDispatchStatus 포팅 — ⭐ 사용자 피드백:
// 이미 오더를 수락해 운송중인 기사가 카드엔 GPS/출퇴근 로그만 반영된 "출근"으로만
// 보여서, 기사확인상태(지입 기사 오더수락 플로우: 대기/수락/완료/거절)를 우선
// 반영하도록 맞춘다. 기사확인상태 플로우가 없는 일반 오더만 시간 기반 추정으로 폴백.
function driverDispatchStatus(orders, todayStr, driver) {
  if (driver?.상태 === "휴차") {
    return { label: "휴차", dot: "#374151", bg: "#e5e7eb", color: "#374151" };
  }
  if (!orders.length) return { label: "배차대기", dot: "#f59e0b", bg: "#fef3c7", color: "#92400e" };
  const checkStates = orders.map(r => r.기사확인상태).filter(Boolean);
  if (checkStates.includes("수락")) return { label: "운송중", dot: "#2563eb", bg: "#dbeafe", color: "#1e40af" };
  if (checkStates.includes("대기")) return { label: "오더확인중", dot: "#f59e0b", bg: "#fef3c7", color: "#92400e" };
  if (checkStates.length > 0 && checkStates.every(s => s === "완료" || s === "거절")) {
    return { label: "배차대기", dot: "#f59e0b", bg: "#fef3c7", color: "#92400e" };
  }
  const progs = orders.map(r => computeOrderProgress(r, r.상차일, todayStr));
  if (progs.includes("progress")) return { label: "운송중", dot: "#2563eb", bg: "#dbeafe", color: "#1e40af" };
  if (progs.every(p => p === "done")) return { label: "배차완료", dot: "#16a34a", bg: "#dcfce7", color: "#166534" };
  return { label: "배차예정", dot: "#6b7280", bg: "#eef1f6", color: "#374151" };
}

// ─── 이동거리/예상시간 뱃지 (PC RouteDistanceBadge 포팅, 모바일 폭에 맞춰 축소) ───
// ⭐ 버그수정 — PC와 동일하게 직선거리*1.25 근사치 대신 실제 도로경로 API
// (getDrivingRoute)로 통일 — 강/산업단지 우회 구간에서 거리가 너무 짧게
// 나오던 문제 수정.
const _routeDistCache = new Map();
let _routeDistQueue = [];
let _routeDistProcessing = false;
function enqueueRouteDist(fromAddr, toAddr, cb) {
  const key = `${fromAddr}→${toAddr}`;
  if (_routeDistCache.has(key)) { cb(_routeDistCache.get(key)); return; }
  _routeDistQueue.push({ fromAddr, toAddr, key, cb });
  _processRouteDistQueue();
}
async function _processRouteDistQueue() {
  if (_routeDistProcessing || _routeDistQueue.length === 0) return;
  _routeDistProcessing = true;
  const { fromAddr, toAddr, key, cb } = _routeDistQueue.shift();
  try {
    const result = await getDrivingRoute(fromAddr, toAddr);
    _routeDistCache.set(key, result);
    cb(result);
  } catch {
    cb(null);
  }
  await new Promise(r => setTimeout(r, 350));
  _routeDistProcessing = false;
  _processRouteDistQueue();
}
function RouteDistanceBadge({ fromAddr, toAddr }) {
  const [info, setInfo] = useState(() =>
    fromAddr && toAddr ? _routeDistCache.get(`${fromAddr}→${toAddr}`) : null
  );
  useEffect(() => {
    if (!fromAddr || !toAddr) return;
    const key = `${fromAddr}→${toAddr}`;
    if (_routeDistCache.has(key)) { setInfo(_routeDistCache.get(key)); return; }
    setInfo(undefined);
    enqueueRouteDist(fromAddr, toAddr, setInfo);
  }, [fromAddr, toAddr]);
  if (!fromAddr || !toAddr) return <span style={{ fontSize: 12, color: "#c1c7d0" }}>-</span>;
  if (info === undefined) return <span style={{ fontSize: 12, color: "#c1c7d0" }}>계산중…</span>;
  if (!info) return <span style={{ fontSize: 12, color: "#c1c7d0" }}>-</span>;
  const timeLabel = info.minutes >= 60 ? `${Math.floor(info.minutes / 60)}시간 ${info.minutes % 60}분` : `${info.minutes}분`;
  return (
    <span style={{ fontSize: 12, color: "#374151", fontWeight: 700, whiteSpace: "nowrap" }}>
      약 {info.km}km · {timeLabel}
    </span>
  );
}

// ─── "운송중" 세부 상태 (상차지진입/상차지도착/하차지진입/하차지도착) ─────────
// ⭐ 사용자 요청 — PC FleetManagement.jsx와 동일하게, "운송중" 라벨을 기사 실시간
// GPS와 지금 향하는 목적지(상차 전엔 상차지, 상차 후~하차 전엔 하차지) 간 거리로
// 세분화한다. 주소는 한 번만 지오코딩해 캐시(RouteDistanceBadge와 동일한 캐시+
// 순차처리 패턴)하고, 실패/위치없음이면 조용히 기존 "운송중" 라벨로 되돌아간다.
const _destGeoCache = new Map();
let _destGeoQueue = [];
let _destGeoProcessing = false;
function enqueueDestGeo(addr, cb) {
  if (_destGeoCache.has(addr)) { cb(_destGeoCache.get(addr)); return; }
  _destGeoQueue.push({ addr, cb });
  _processDestGeoQueue();
}
async function _processDestGeoQueue() {
  if (_destGeoProcessing || _destGeoQueue.length === 0) return;
  _destGeoProcessing = true;
  const { addr, cb } = _destGeoQueue.shift();
  let result = null;
  try {
    const g = await geocodeAddress(addr);
    result = g ? { lat: g.lat, lng: g.lon } : null;
  } catch { result = null; }
  // ⭐ 버그수정 — 실패(null)까지 캐시에 영구 저장해버리면, API가 한 번 일시적으로
  // (레이트리밋 등) 실패했을 때 그 주소는 영원히 "하차지진입/도착"으로 못 바뀌고
  // 계속 "이동중"에 멈춰 있었다. 성공한 결과만 캐시하고, 실패는 캐시하지 않아
  // 다음 요청 때 다시 시도되게 한다.
  if (result) _destGeoCache.set(addr, result);
  cb(result);
  await new Promise(r => setTimeout(r, 350));
  _destGeoProcessing = false;
  _processDestGeoQueue();
}
function useDestGeo(addr) {
  const [geo, setGeo] = useState(() => (addr ? _destGeoCache.get(addr) : null) ?? null);
  useEffect(() => {
    if (!addr) { setGeo(null); return; }
    let cancelled = false;
    let retryTimer = null;
    const attempt = () => {
      if (cancelled) return;
      if (_destGeoCache.has(addr)) { setGeo(_destGeoCache.get(addr)); return; }
      setGeo(undefined);
      enqueueDestGeo(addr, (result) => {
        if (cancelled) return;
        setGeo(result);
        // 실패(null)면 30초 뒤 자동 재시도 — API 레이트리밋/일시 오류로 인한
        // 실패가 화면에 영구히 남지 않도록 한다.
        if (!result) retryTimer = setTimeout(attempt, 30000);
      });
    };
    attempt();
    return () => { cancelled = true; if (retryTimer) clearTimeout(retryTimer); };
  }, [addr]);
  return geo; // undefined = 조회중, null = 실패/없음, {lat,lng} = 성공
}

function kstDateStrLocal(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

// ⭐ 보강 — "상차지를 다녀왔다"는 기억이 화면을 보고 있는 동안의 세션 상태로만
// 있으면, 관리자가 기사 출발 이후에 새로고침/재진입할 때 다시 "상차지진입"으로
// 잘못 보일 수 있다. 오늘자 GPS 기록(gps_tracks)에 상차지 1km 이내로 찍힌 점이
// 하나라도 있으면 "다녀온 이력"으로 간주해, 새로고침해도 계속 정확하게 뜨게 한다.
function useVisitedPickup(driverId, pickupGeo) {
  const [visited, setVisited] = useState(false);
  useEffect(() => {
    setVisited(false);
    if (!driverId || !pickupGeo) return;
    const dateStr = kstDateStrLocal();
    const unsub = onSnapshot(
      query(collection(db, "gps_tracks"), where("driverId", "==", driverId), where("date", "==", dateStr)),
      (snap) => {
        const hit = snap.docs.some((d) => {
          const p = d.data();
          if (p.lat == null || p.lng == null) return false;
          return haversineKm(p.lat, p.lng, pickupGeo.lat, pickupGeo.lng) <= 1;
        });
        if (hit) setVisited(true);
      },
      () => {}
    );
    return () => unsub();
  }, [driverId, pickupGeo]);
  return visited;
}
// driverDispatchStatus가 "운송중"을 반환하게 만든 그 오더(상/하차지 주소가
// 필요하므로) — checkStates.includes("수락") 로직과 동일한 우선순위로 찾는다.
function findActiveTransitOrder(orders, todayStr) {
  return orders.find(r => {
    if (r.기사확인상태) return r.기사확인상태 === "수락";
    return computeOrderProgress(r, r.상차일, todayStr) === "progress";
  }) || null;
}
// "운송중" 라벨 하나를 세분화 라벨로 바꿔 보여준다 — 그 외엔 항상 fallback 그대로.
// ⭐ 버그수정 — 예전엔 기사가 앱에서 "상차 시작/상차완료" 버튼을 직접 눌러야만
// (driver.상태가 "운송중"으로 바뀌어야만) 하차지 방향으로 인식했는데, 실제로는 버튼을
// 안 누르고 그냥 운전만 해도 상태가 갱신돼야 한다. 버튼 상태는 더 이상 보지 않고,
// 순수하게 GPS 거리만으로 판단한다: 상차지 1km 이내면 "상차지도착"(한 번이라도
// 들어왔었다는 걸 visitedPickup으로 기억해둔다), 그 뒤 상차지를 벗어나면(1km 초과)
// 하차지에 가까워지기 전까지 "이동중", 하차지 5km/1km 이내면 하차지진입/도착.
function TransitPhaseLabel({ order, driver, fallback }) {
  const pickupGeo = useDestGeo(order?.상차지주소 || null);
  const dropGeo = useDestGeo(order?.하차지주소 || null);
  const hasLoc = driver?.location?.lat != null && driver?.location?.lng != null;

  const pickupDist = (hasLoc && pickupGeo) ? haversineKm(driver.location.lat, driver.location.lng, pickupGeo.lat, pickupGeo.lng) : null;
  const dropDist = (hasLoc && dropGeo) ? haversineKm(driver.location.lat, driver.location.lng, dropGeo.lat, dropGeo.lng) : null;
  const visitedFromHistory = useVisitedPickup(driver?.id, pickupGeo);
  const visitedPickup = visitedFromHistory || (pickupDist != null && pickupDist <= 1);

  let label;
  if (pickupDist != null && pickupDist <= 1) label = "상차지도착";
  else if (dropDist != null && dropDist <= 1) label = "하차지도착";
  else if (dropDist != null && dropDist <= 5) label = "하차지진입";
  else if (!visitedPickup && pickupDist != null && pickupDist <= 5) label = "상차지진입";
  else if (visitedPickup) label = "이동중";
  // ⭐ 버그수정 — 기사 앱을 막 켠 직후처럼 GPS 첫 위치가 아직 서버에 안 올라온
  // 순간엔 거리 계산 자체가 불가능해 조용히 "운송중"(기본값)으로 보였다. 이러면
  // "진짜 이동중"과 "위치를 아직 못 받음"이 똑같이 보여 혼동을 준다 — 구분해서 표시.
  else if (!hasLoc) label = "위치 확인중";
  else label = fallback;

  // ⭐ 임시 진단용 — 상차지 주소가 좌표로 정확히 변환됐는지 직접 눈으로 확인하기
  // 위해 추가. 원인 확인되는 대로 제거.
  const fmt = (p) => p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : (p === null ? "실패" : "...");
  const dbg = ` [상:${fmt(pickupGeo)}=${pickupDist?.toFixed(2) ?? "?"}km 하:${fmt(dropGeo)}=${dropDist?.toFixed(2) ?? "?"}km]`;
  return <>{label}<span style={{ fontSize: 9, color: "#9ca3af", fontWeight: 400 }}>{dbg}</span></>;
}

// ─── 바로 전화 버튼 — ⭐ 사용자 요청: 원격 모니터링 중 상세진입 없이 바로 전화 ───
function CallButton({ phone, compact }) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) return null;
  return (
    <a
      href={`tel:${digits}`}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
        width: compact ? 32 : undefined, height: compact ? 32 : undefined,
        padding: compact ? 0 : "7px 12px", borderRadius: compact ? "50%" : 8,
        background: NAVY, color: "#fff", fontSize: 12, fontWeight: 700,
        textDecoration: "none", flexShrink: 0,
      }}
    >
      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      {!compact && "전화"}
    </a>
  );
}

// ─── 지도 헬퍼 컴포넌트 ──────────────────────────────────────────────────────

function MapRecenter({ center }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (!center) return;
    const key = center._t ? `${center.lat},${center.lng},${center._t}` : `${center.lat},${center.lng}`;
    if (prev.current === key) return;
    prev.current = key;
    if (center._t) {
      // 실시간 추적: zoom 변경 없이 부드럽게 이동
      map.panTo([center.lat, center.lng], { animate: true, duration: 0.8 });
    } else {
      map.setView([center.lat, center.lng], 14, { animate: true });
    }
  }, [center, map]);
  return null;
}

function FitPath({ points, resetKey }) {
  const map = useMap();
  const fittedKeyRef = useRef(null);
  useEffect(() => {
    if (points.length < 2) return;
    if (fittedKeyRef.current === resetKey) return; // 같은 기사 선택 중엔 재조정 안 함
    fittedKeyRef.current = resetKey;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [30, 50], maxZoom: 15, animate: true });
  }, [points, map, resetKey]);
  return null;
}

function makeIcon(color, active, name) {
  const ring1 = active ? `<div style="position:absolute;top:-7px;left:-7px;right:-7px;bottom:5px;border-radius:12px;background:${color};opacity:.22;animation:mfvRing 1.8s infinite ease-out;pointer-events:none;"></div>` : "";
  const ring2 = active ? `<div style="position:absolute;top:-4px;left:-4px;right:-4px;bottom:6px;border-radius:10px;background:${color};opacity:.15;animation:mfvRing 1.8s infinite ease-out;animation-delay:.5s;pointer-events:none;"></div>` : "";
  const label = name ? `<div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(27,43,75,0.88);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;pointer-events:none;letter-spacing:0.02em;box-shadow:0 1px 4px rgba(0,0,0,0.2);">${name}</div>` : "";
  const truckSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="14" viewBox="0 0 26 16"><rect x="1" y="1" width="16" height="11" rx="2" fill="white" opacity="0.95"/><path d="M17 4.5L23 7V14H17V4.5Z" fill="white" opacity="0.92"/><line x1="17" y1="8" x2="22" y2="9.5" stroke="${color}" stroke-width="1" opacity="0.6"/><circle cx="5" cy="14" r="2.2" fill="${color}" stroke="white" stroke-width="1.5"/><circle cx="20" cy="14" r="2.2" fill="${color}" stroke="white" stroke-width="1.5"/><rect x="3" y="3" width="5" height="4.5" rx="0.5" fill="${color}" opacity="0.35"/><rect x="9" y="3" width="5" height="4.5" rx="0.5" fill="${color}" opacity="0.35"/></svg>`;
  return L.divIcon({
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;width:44px;">${ring1}${ring2}${label}<div style="position:relative;width:44px;height:32px;background:${color};border-radius:10px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.38);z-index:1;"><div style="display:flex;align-items:center;justify-content:center;">${truckSvg}</div></div><div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:9px solid ${color};z-index:1;margin-top:-1px;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.25));"></div></div>`,
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -46],
  });
}

function getIcon(status, active, name) {
  return makeIcon(STATUS_COLORS[status] || "#9ca3af", !!active, name);
}

// 담당자 표시 + 위임 — PC 지입차관리(FleetManagement.jsx)의 ManagerBadge와 동일한
// 역할. 모바일은 드롭다운 대신 탭하면 펼쳐지는 리스트로 보여준다.
function MobileManagerBadge({ driver, staff, canDelegate, onAssign }) {
  const [open, setOpen] = useState(false);
  const mgr = driver.담당자;
  return (
    <div style={{ background: "#f8f9fb", borderRadius: 9, padding: "10px 12px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>담당자</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: mgr ? NAVY : "#c1c7d0" }}>{mgr ? mgr.name : "미지정"}</div>
        </div>
        {canDelegate && (
          <button onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
            style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", fontSize: 11, fontWeight: 700 }}>
            위임
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 8, borderTop: "1px solid #e5e7eb", paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          {staff.length === 0 && <div style={{ fontSize: 12, color: "#9ca3af", padding: "4px 2px" }}>배차자가 없습니다</div>}
          {staff.map(s => (
            <div key={s.id} onClick={(e) => { e.stopPropagation(); onAssign(driver.id, s); setOpen(false); }}
              style={{ padding: "7px 8px", borderRadius: 6, fontSize: 13, fontWeight: mgr?.uid === s.id ? 800 : 600, color: mgr?.uid === s.id ? NAVY : "#374151", background: mgr?.uid === s.id ? "#eef1f6" : "transparent" }}>
              {s.name}
            </div>
          ))}
          {mgr && (
            <div onClick={(e) => { e.stopPropagation(); onAssign(driver.id, null); setOpen(false); }}
              style={{ padding: "7px 8px", fontSize: 12, color: "#ef4444" }}>
              담당자 해제
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function MobileFleetView({ dispatchData = [], userCompany = "", onRegisterBack }) {
  const [driversRaw, setDriversRaw] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [expandedId, setExpandedId] = useState(null);
  const [activeSection, setActiveSection] = useState("drivers"); // "drivers" | "map" | "feed" | "attendance"
  // ⭐ 사용자 요청 — 배차자마다 담당 지입차가 따로 있어서 "내 차량"부터 기본으로
  // 보여준다. 전체 지입차 보기는 토글로 유지.
  const [scope, setScope] = useState("mine"); // "mine" | "all"
  const [companyStaffRaw, setCompanyStaffRaw] = useState([]);
  const myUid = auth.currentUser?.uid || null;
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);

  // 지도 관련 상태
  const [mapSelected, setMapSelected] = useState(null);
  const [selectedDriverLogs, setSelectedDriverLogs] = useState([]);
  const [gpsTracks, setGpsTracks] = useState([]);
  const [roadPath, setRoadPath] = useState([]);
  const [mapCenter, setMapCenter] = useState(null);
  const prevMapLocRef = useRef(null);
  const osrmKeyRef  = useRef(null);  // "<driverId>-<date>" — prevents OSRM re-run on GPS additions
  const osrmDoneRef = useRef(false); // true once OSRM succeeded for current key
  const lastMapRefreshRef = useRef(0); // throttle auto-pan to 1 minute

  // 기본 구독
  useEffect(() => {
    const subs = [];
    subs.push(onSnapshot(collection(db, "drivers"),
      (snap) => { setDriversRaw(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    ));
    subs.push(onSnapshot(query(collection(db, "users"), where("role", "==", "driver")),
      (snap) => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); setUsersMap(m); }
    ));
    subs.push(onSnapshot(collection(db, "users"),
      (snap) => setCompanyStaffRaw(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => ["totalMaster","admin","user"].includes(u.role)))
    ));
    subs.push(onSnapshot(
      query(collection(db, "driver_logs"), orderBy("timestamp", "desc"), limit(30)),
      (snap) => setActivityLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    ));
    subs.push(onSnapshot(
      query(collection(db, "driver_logs"), orderBy("timestamp", "desc"), limit(2000)),
      (snap) => setAttendanceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    ));
    return () => subs.forEach(u => u?.());
  }, []);

  // 선택 기사 로그 구독
  useEffect(() => {
    if (!mapSelected?.id) { setSelectedDriverLogs([]); return; }
    return onSnapshot(
      query(collection(db, "driver_logs"), where("uid", "==", mapSelected.id), orderBy("timestamp", "desc"), limit(30)),
      (snap) => setSelectedDriverLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
  }, [mapSelected?.id]);

  // GPS 트랙 구독 (선택 날짜, 클라이언트 필터)
  useEffect(() => {
    if (!mapSelected?.id) { setGpsTracks([]); return; }
    return onSnapshot(
      query(collection(db, "gps_tracks"), where("driverId", "==", mapSelected.id), limit(2000)),
      (snap) => {
        const tracks = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => {
            const d = resolveTs(t.timestamp);
            return d && d.toISOString().slice(0, 10) === selectedDate;
          })
          .sort((a, b) => (resolveTs(a.timestamp)?.getTime() || 0) - (resolveTs(b.timestamp)?.getTime() || 0));
        setGpsTracks(tracks);
      },
      () => {}
    );
  }, [mapSelected?.id, selectedDate]);

  // selectedPath 계산 (출근 → 최종퇴근 구간, gpsTracks 우선)
  const selectedPath = useMemo(() => {
    // 출근 시각: driver.workStartAt 또는 오늘 "출근" 로그
    const checkInLog = selectedDriverLogs.find(l =>
      l.status === "출근" && resolveTs(l.timestamp)?.toISOString().slice(0, 10) === selectedDate
    );
    const checkInTime = checkInLog
      ? resolveTs(checkInLog.timestamp)?.getTime()
      : (mapSelected?.workStartAt ? resolveTs(mapSelected.workStartAt)?.getTime() : null);
    // 최종퇴근 시각
    const checkOutLog = [...selectedDriverLogs].find(l =>
      l.status === "최종퇴근" && resolveTs(l.timestamp)?.toISOString().slice(0, 10) === selectedDate
    );
    const checkOutTime = checkOutLog ? resolveTs(checkOutLog.timestamp)?.getTime() : null;

    if (gpsTracks.length >= 2) {
      const sessionTracks = checkInTime
        ? gpsTracks.filter(t => {
            const ts = resolveTs(t.timestamp)?.getTime() || 0;
            return ts >= checkInTime && (checkOutTime == null || ts <= checkOutTime);
          })
        : gpsTracks;
      const tracks = sessionTracks.length >= 2 ? sessionTracks : gpsTracks;
      return tracks.map(t => ({ lat: t.lat, lng: t.lng, status: "운송중", timestamp: t.timestamp }));
    }
    const withLoc = selectedDriverLogs.filter(l => {
      if (!l.location?.lat) return false;
      const ts = resolveTs(l.timestamp)?.getTime();
      if (!ts) return false;
      if (checkInTime && ts < checkInTime) return false;
      if (checkOutTime && ts > checkOutTime) return false;
      return true;
    });
    if (withLoc.length === 0) return [];
    return [...withLoc].reverse().map(l => ({
      lat: l.location.lat, lng: l.location.lng,
      status: l.status, timestamp: l.timestamp,
    }));
  }, [selectedDriverLogs, gpsTracks, selectedDate, mapSelected?.workStartAt]);

  // OSRM 도로 경로 — 기사/날짜 변경 시에만 재계산 (30초 GPS 업데이트 때는 스킵)
  useEffect(() => {
    const key = `${mapSelected?.id ?? "none"}-${selectedDate}`;

    if (osrmKeyRef.current !== key) {
      osrmKeyRef.current = key;
      osrmDoneRef.current = false;
      setRoadPath([]);
    }

    if (osrmDoneRef.current) return;
    if (selectedPath.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        let wps = selectedPath;
        if (selectedPath.length > 25) {
          const step = Math.ceil(selectedPath.length / 24);
          wps = selectedPath.filter((_, i) => i % step === 0);
          if (wps[wps.length - 1] !== selectedPath[selectedPath.length - 1]) {
            wps = [...wps, selectedPath[selectedPath.length - 1]];
          }
        }
        const coords = wps.map(p => `${p.lng},${p.lat}`).join(";");
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
          { signal: controller.signal }
        );
        const data = await res.json();
        const geometry = data.routes?.[0]?.geometry?.coordinates;
        if (geometry) {
          setRoadPath(geometry.map(([lng, lat]) => ({ lat, lng })));
          osrmDoneRef.current = true;
        }
      } catch (_) {}
    }, 800);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selectedPath]);

  // drivers 합성 — PC 지입차관리(routeDrivers)와 동일하게 등급(지입/직영)만 기준으로
  // 삼는다. ⭐ 버그수정 — 예전엔 기사앱 가입+승인(usersMap)까지 요구해서, PC
  // 기사관리에서 "+ 기사 등록"으로 만든(아직 앱에 가입 안 한) 지입차는 모바일
  // 지입차관리에서 통째로 0건으로 보였다. 앱 가입 여부와 무관하게 목록엔 항상
  // 보이고, GPS/위치는 가입된 기사만 자연히 채워지는 식으로 둔다.
  const drivers = useMemo(() => {
    return driversRaw
      .filter(raw => raw.등급 === "지입" || raw.등급 === "직영")
      .map(raw => {
        const u = usersMap[raw.id] || {};
        return {
          id: raw.id,
          이름: (u.name || raw.이름 || raw.name || "").trim() || "-",
          차량번호: (u.carNo || raw.차량번호 || raw.carNo || "").trim() || "-",
          vehicleType: u.vehicleType || raw.vehicleType || "-",
          phone: u.phone || raw.전화번호 || raw.phone || "-",
          상태: raw.status || raw.mainStatus || "대기",
          location: raw.location || null,
          총거리: raw.totalDistance || 0,
          updatedAt: raw.updatedAt,
          active: raw.active === true,
          speed: raw.speed || 0,
          workStartAt: raw.workStartAt || null,
          담당자: raw.담당자 || null,
          등급: raw.등급 || "",
          거주지: raw.거주지 || "",
          근무요일: raw.근무요일 || [],
        };
      })
      .sort((a, b) => statusPriority(a) - statusPriority(b));
  }, [driversRaw, usersMap]);

  const driversMap = useMemo(() => {
    const m = {}; drivers.forEach(d => { m[d.id] = d; }); return m;
  }, [drivers]);

  // 위임 대상 배차자 목록 + 위임 권한(관리자 이상) — PC 지입차관리와 동일 기준.
  const companyStaff = useMemo(
    () => companyStaffRaw
      .filter(u => !userCompany || u.companyName === userCompany)
      .map(u => ({ id: u.id, name: u.name || u.email || "이름없음" }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [companyStaffRaw, userCompany]
  );
  const canDelegate = ["admin", "totalMaster"].includes(
    companyStaffRaw.find(u => u.id === myUid)?.role
  );
  const assignDriverManager = useCallback(async (driverId, staff) => {
    try {
      await updateDoc(doc(db, "drivers", driverId), { 담당자: staff ? { uid: staff.id, name: staff.name } : null });
    } catch (e) { console.error("담당자 배정 실패:", e); alert("담당자 배정에 실패했습니다."); }
  }, []);

  // 오늘자 오더를 차량번호 우선, 없으면 이름으로 매칭 — PC 노선관리 탭과 동일한 방식.
  const todayStr = new Date().toISOString().slice(0, 10);
  const ordersByPlate = useMemo(() => {
    const m = new Map();
    (dispatchData || []).forEach(r => {
      if ((r.상차일 || "") !== todayStr) return;
      const p = (r.차량번호 || "").trim();
      if (p) { if (!m.has(p)) m.set(p, []); m.get(p).push(r); }
    });
    return m;
  }, [dispatchData, todayStr]);
  const ordersByName = useMemo(() => {
    const m = new Map();
    (dispatchData || []).forEach(r => {
      if ((r.상차일 || "") !== todayStr) return;
      const n = (r.이름 || "").trim();
      if (n) { if (!m.has(n)) m.set(n, []); m.get(n).push(r); }
    });
    return m;
  }, [dispatchData, todayStr]);
  const ordersFor = useCallback((d) => {
    const plate = (d.차량번호 || "").trim();
    const name = (d.이름 || "").trim();
    return (plate && ordersByPlate.get(plate)) || (name && ordersByName.get(name)) || [];
  }, [ordersByPlate, ordersByName]);

  // ⭐ 사용자 요청 — 관리자가 모바일에서도 지입차별 오늘/누적 매출을 볼 수 있어야
  // 한다. ordersFor는 오늘 오더만 매칭하므로, 날짜 제한 없이 전체 이력에서
  // 직접 청구운임을 합산한다.
  const toWon = useCallback((v) => Number(String(v || "0").replace(/[^\d]/g, "")) || 0, []);
  const revenueFor = useCallback((d) => {
    const plate = (d.차량번호 || "").trim();
    const name = (d.이름 || "").trim();
    const all = (dispatchData || []).filter(r => {
      const rPlate = (r.차량번호 || "").trim();
      const rName = (r.이름 || "").trim();
      return (!!plate && rPlate === plate) || (!!name && rName === name);
    });
    const today = all.filter(r => (r.상차일 || "") === todayStr).reduce((s, r) => s + toWon(r.청구운임), 0);
    const cumulative = all.reduce((s, r) => s + toWon(r.청구운임), 0);
    return { today, cumulative };
  }, [dispatchData, todayStr, toWon]);

  const scopedDrivers = useMemo(
    () => scope === "mine" ? drivers.filter(d => d.담당자?.uid === myUid) : drivers,
    [drivers, scope, myUid]
  );

  const filtered = useMemo(() => {
    const kw = searchQ.trim().replace(/\s/g, "");
    return scopedDrivers.filter(d => {
      const matchQ = !kw || (d.차량번호 || "").replace(/\s/g, "").includes(kw) || d.이름.includes(kw);
      const matchF = statusFilter === "전체" || d.상태 === statusFilter;
      return matchQ && matchF;
    });
  }, [scopedDrivers, searchQ, statusFilter]);

  // ⭐ 사용자 요청 — 총 등록/접속중/운송중/근무중 대신 담당 기준으로 변경:
  // 총 등록기사, 내 담당차량, 내 담당차량 중 배차중, 내 담당차량 중 배차완료.
  const kpi = useMemo(() => {
    const mine = drivers.filter(d => d.담당자?.uid === myUid);
    const inProgress = mine.filter(d => ordersFor(d).some(r => r.배차상태 === "배차중")).length;
    const completed = mine.filter(d => ordersFor(d).some(r => r.배차상태 === "배차완료")).length;
    return { total: drivers.length, mine: mine.length, inProgress, completed };
  }, [drivers, myUid, ordersFor]);

  const filteredFeed = useMemo(() =>
    activityLogs.filter(l => {
      if (!driversMap[l.uid]) return false;
      const t = resolveTs(l.timestamp);
      return t && t.toISOString().slice(0, 10) === selectedDate;
    }),
    [activityLogs, driversMap, selectedDate]
  );

  const handleMapSelect = useCallback((d) => {
    setMapSelected(prev => prev?.id === d.id ? null : d);
    if (prev => prev?.id === d.id) {
      setGpsTracks([]); setRoadPath([]);
    }
  }, []);

  // 기사 목록에서 "지도 보기" 클릭
  const handleViewOnMap = useCallback((d, e) => {
    e.stopPropagation();
    setMapSelected(d);
    setActiveSection("map");
  }, []);

  // ⭐ 버그수정 — "지도에서 경로 보기"로 들어간 뒤 뒤로가기를 누르면 MobileApp의
  // 전역 뒤로가기 핸들러가 무조건 배차내역(list)으로 보내버려서, 바로 전 화면(기사
  // 목록)으로 한 단계만 돌아가는 게 불가능했다. 현재 내부 화면 상태를 ref로 최신화해
  // 두고, MobileApp이 뒤로가기 시 먼저 이 콜백을 불러 내부에서 처리 가능하면(true)
  // list로 점프하지 않고 지도→목록, 펼친 카드→접힘 순으로 한 단계씩만 되돌린다.
  const navStateRef = useRef({ activeSection, mapSelected, expandedId });
  useEffect(() => {
    navStateRef.current = { activeSection, mapSelected, expandedId };
  });
  useEffect(() => {
    if (typeof onRegisterBack !== "function") return;
    onRegisterBack(() => {
      const { activeSection: sec, mapSelected: sel, expandedId: exp } = navStateRef.current;
      if (sec === "map" && sel) { setMapSelected(null); setGpsTracks([]); setRoadPath([]); return true; }
      if (sec !== "drivers") { setActiveSection("drivers"); return true; }
      if (exp) { setExpandedId(null); return true; }
      return false;
    });
    return () => onRegisterBack(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 지도에서 선택 기사 live 동기화 + 자동 추적 (1분 주기, 퇴근 시 중단)
  useEffect(() => {
    if (!mapSelected) return;
    const updated = drivers.find(d => d.id === mapSelected.id);
    if (!updated) return;
    setMapSelected(updated);
    const isCheckedOut = ["퇴근", "최종퇴근"].includes(updated.상태);
    if (updated.location && !isCheckedOut) {
      const locKey = `${updated.location.lat.toFixed(5)},${updated.location.lng.toFixed(5)}`;
      if (prevMapLocRef.current !== locKey) {
        prevMapLocRef.current = locKey;
        const now = Date.now();
        if (now - lastMapRefreshRef.current >= 60000) {
          lastMapRefreshRef.current = now;
          setMapCenter({ lat: updated.location.lat, lng: updated.location.lng, _t: Date.now() });
        }
      }
    }
  }, [drivers]); // eslint-disable-line

  const handleMapRefresh = useCallback(() => {
    const updated = mapSelected ? drivers.find(d => d.id === mapSelected.id) : null;
    const loc = updated?.location ?? mapSelected?.location;
    if (loc?.lat) {
      lastMapRefreshRef.current = Date.now();
      setMapCenter({ lat: loc.lat, lng: loc.lng, _t: Date.now() });
    }
  }, [mapSelected, drivers]);

  // ⭐ 사용자 요청 — 휴차(휴무) 기사를 따로 걸러볼 수 있는 칩이 빠져 있었다.
  const STATUS_OPTS = ["전체", "운송중", "출근", "상차중", "하차중", "대기", "휴차", "퇴근"];

  // 평균 속도 계산
  const avgSpeed = useMemo(() => {
    if (!mapSelected) return null;
    const dist = mapSelected.총거리 || 0;
    const startTs = resolveTs(mapSelected.workStartAt);
    if (dist > 0 && startTs) {
      const hrs = (Date.now() - startTs.getTime()) / 3600000;
      return hrs > 0 ? Math.round(dist / hrs) : 0;
    }
    return null;
  }, [mapSelected]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${NAVY}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
        <div style={{ fontSize: 14, color: "#6b7280" }}>불러오는 중...</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const displayPath = roadPath.length >= 2 ? roadPath : selectedPath;

  return (
    <div style={{ fontFamily: "'Noto Sans KR',sans-serif", paddingBottom: 24 }}>

      {/* KPI 2×2 그리드 — 담당 기준. 사용자 요청: 알록달록한 이모지 대신 헤더의
          알림벨/새로고침 아이콘과 같은 단색 라인 아이콘 스타일로 통일 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "16px 16px 0" }}>
        {[
          { label: "총 등록기사", val: kpi.total, icon: KPI_ICONS.truck, accent: NAVY },
          { label: "내 담당차량", val: kpi.mine, icon: KPI_ICONS.user, accent: "#2563eb" },
          { label: "내 담당 · 배차중", val: kpi.inProgress, icon: KPI_ICONS.route, accent: "#f59e0b" },
          { label: "내 담당 · 배차완료", val: kpi.completed, icon: KPI_ICONS.check, accent: "#16a34a" },
        ].map(({ label, val, icon, accent }) => (
          <div key={label} style={{
            background: "white", borderRadius: 14, padding: "14px 16px",
            border: "1px solid #e5e7eb", position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accent }} />
            <div style={{ marginBottom: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {icon}
              </svg>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 2, letterSpacing: ".03em" }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#111827", lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* 날짜 선택 */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"12px 16px 0" }}>
        <span style={{ fontSize:12, fontWeight:700, color:"#6b7280", whiteSpace:"nowrap" }}>조회 날짜</span>
        <input
          type="date"
          value={selectedDate}
          max={today}
          onChange={e => setSelectedDate(e.target.value)}
          style={{ flex:1, padding:"7px 10px", border:"1px solid #e5e7eb", borderRadius:8, fontSize:13, color:"#1B2B4B", background:"#f9fafb", outline:"none" }}
        />
        {selectedDate !== today && (
          <button
            onClick={() => setSelectedDate(today)}
            style={{ padding:"7px 12px", border:"none", borderRadius:8, background:"#1B2B4B", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}
          >
            오늘
          </button>
        )}
      </div>

      {/* 섹션 탭 */}
      <div style={{ display: "flex", margin: "16px 16px 0", background: "#f4f6fa", borderRadius: 10, padding: 3, flexWrap: "nowrap" }}>
        {[["drivers", "기사 목록"], ["map", "지도"], ["feed", "상태 로그"], ["attendance", "출근기록"]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveSection(key)} style={{
            flex: 1, padding: "8px 4px", borderRadius: 8, border: "none",
            background: activeSection === key ? NAVY : "transparent",
            color: activeSection === key ? "#fff" : "#6b7280",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
          }}>
            {label}
            {key === "feed" && filteredFeed.length > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 99 }}>
                {filteredFeed.length}
              </span>
            )}
            {key === "map" && drivers.filter(d => d.location).length > 0 && (
              <span style={{ background: activeSection === "map" ? "rgba(255,255,255,.25)" : "#10b981", color: "#fff", fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 99 }}>
                {drivers.filter(d => d.location).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ 기사 목록 ═══ */}
      {activeSection === "drivers" && (
        <div style={{ padding: "12px 16px 0" }}>
          {/* 내 차량 / 전체 토글 */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10, background: "#f3f4f6", borderRadius: 8, padding: 3 }}>
            {[["mine", "내 담당 차량", drivers.filter(d => d.담당자?.uid === myUid).length], ["all", "전체 지입차", drivers.length]].map(([key, label, count]) => (
              <button key={key} onClick={() => setScope(key)} style={{
                flex: 1, padding: "7px 4px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
                background: scope === key ? NAVY : "transparent", color: scope === key ? "#fff" : "#6b7280", transition: "all .12s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}>
                {label}
                <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 99, background: scope === key ? "rgba(255,255,255,.22)" : "#e5e7eb", color: scope === key ? "#fff" : "#6b7280" }}>{count}</span>
              </button>
            ))}
          </div>
          {/* 검색 */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <svg width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2.2" viewBox="0 0 24 24" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/>
            </svg>
            <input
              type="text" placeholder="기사명 / 차량번호" value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              style={{ width: "100%", paddingLeft: 36, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: "1px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", background: "#fafafa", boxSizing: "border-box" }}
            />
          </div>
          {/* 상태 필터 */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 4, scrollbarWidth: "none" }}>
            {STATUS_OPTS.map(opt => {
              const active = statusFilter === opt;
              return (
                <button key={opt} onClick={() => setStatusFilter(opt)} style={{
                  padding: "5px 12px", borderRadius: 99, border: active ? `1.5px solid ${NAVY}` : "1px solid #e5e7eb",
                  background: active ? NAVY : "white", color: active ? "#fff" : "#374151",
                  fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0,
                }}>
                  {opt}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8, fontWeight: 600 }}>{filtered.length}명 표시</div>

          {filtered.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
              {drivers.length === 0 ? "등록된 기사가 없습니다"
                : scopedDrivers.length === 0 ? <>아직 담당 지정된 차량이 없습니다.<br/>"전체 지입차"에서 담당자를 지정해주세요.</>
                : "검색 결과가 없습니다"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((d, idx) => {
                const todays = ordersFor(d);
                // ⭐ TASK1 — 카드 배지는 GPS/출퇴근 로그(d.상태)가 아니라 실제 오더
                // 진행상태(기사확인상태)를 우선 반영한다. 색상도 여기서 통일해 쓴다.
                const dispatchStatus = driverDispatchStatus(todays, todayStr, d);
                const color = dispatchStatus.dot;
                const activeOrder = todays[0] || null;
                const expanded = expandedId === d.id;
                return (
                  <div
                    key={d.id}
                    onClick={() => setExpandedId(expanded ? null : d.id)}
                    style={{
                      background: "white", borderRadius: 14, padding: "14px 16px",
                      border: `1px solid ${expanded ? NAVY : "#e5e7eb"}`,
                      boxShadow: expanded ? "0 2px 12px rgba(27,43,75,.12)" : "none",
                      cursor: "pointer", transition: "all .15s",
                    }}
                  >
                    {/* 기본 행 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af", minWidth: 16, textAlign: "right", flexShrink: 0 }}>{idx + 1}</span>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: d.active ? "#f0fdf4" : "#f9fafb", border: `1.5px solid ${d.active ? "#bbf7d0" : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <div style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{d.이름}</span>
                          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, letterSpacing: "0.04em" }}>{d.차량번호}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: dispatchStatus.color, background: dispatchStatus.bg, padding: "2px 8px", borderRadius: 99 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: dispatchStatus.dot, display: "inline-block" }} />
                            {(() => {
                              if (dispatchStatus.label !== "운송중") return dispatchStatus.label;
                              const transitOrder = findActiveTransitOrder(todays, todayStr);
                              return transitOrder
                                ? <TransitPhaseLabel order={transitOrder} driver={d} fallback={dispatchStatus.label} />
                                : dispatchStatus.label;
                            })()}
                          </span>
                          {d.vehicleType !== "-" && (
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>{d.vehicleType}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 12, color: "#9ca3af" }}>{timeAgo(d.updatedAt)}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginTop: 2 }}>{d.총거리.toFixed(1)} km</div>
                        </div>
                        {/* ⭐ TASK2 — 상세진입 없이 바로 전화할 수 있는 버튼 (PC엔 없음, 모바일 원격관제 요청) */}
                        <CallButton phone={d.phone} compact />
                      </div>
                    </div>

                    {/* 오늘 노선/거주지/근무요일 — ⭐ TASK2·3: 카드를 펼치지 않아도(탭 없이도)
                        바로 보여야 한다는 사용자 요청. 상/하차지·시간·화물정보·이동정보를
                        여기서 보여주고, 상세(매출/연료비 등)는 펼쳤을 때만 보여준다. */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f3f4f6" }} onClick={e => e.stopPropagation()}>
                      {activeOrder ? (
                        <div style={{ background: "#f0f4ff", borderRadius: 9, padding: "10px 12px", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
                              {activeOrder.상차지명 || "-"} <span style={{ color: "#9ca3af" }}>→</span> {activeOrder.하차지명 || "-"}
                            </div>
                            {todays.length > 1 && (
                              <span style={{ fontSize: 11, fontWeight: 800, color: "#6b7eac", flexShrink: 0 }}>+{todays.length - 1}건 더</span>
                            )}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 5 }}>
                            <div style={{ fontSize: 12, color: "#4b5563" }}>상차 {activeOrder.상차시간 || "즉시"}</div>
                            <div style={{ fontSize: 12, color: "#4b5563" }}>하차예상 {activeOrder.하차시간 || "즉시"}{activeOrder.하차일 && activeOrder.하차일 !== activeOrder.상차일 ? ` (${activeOrder.하차일})` : ""}</div>
                            <div style={{ fontSize: 12, color: "#6b7eac" }}>{[activeOrder.차량종류, activeOrder.차량톤수].filter(Boolean).join(" · ") || "-"}</div>
                            <div style={{ fontSize: 12, color: "#6b7eac", wordBreak: "break-word" }}>{activeOrder.화물내용 || "-"}</div>
                          </div>
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #e0e7ff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <RouteDistanceBadge fromAddr={activeOrder.상차지주소} toAddr={activeOrder.하차지주소} />
                            {activeOrder.기사운임 && <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>기사운임 {Number(String(activeOrder.기사운임).replace(/[^\d]/g, "")).toLocaleString()}원</span>}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>오늘 배차된 오더가 없습니다</div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div style={{ background: "#f8f9fb", borderRadius: 9, padding: "10px 12px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>거주지</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{d.거주지 || "-"}</div>
                        </div>
                        <div style={{ background: "#f8f9fb", borderRadius: 9, padding: "10px 12px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>근무가능요일</div>
                          {(d.근무요일 && d.근무요일.length) ? (
                            <span style={{ display: "inline-flex", gap: 3 }}>
                              {d.근무요일.map(w => {
                                const isToday = w === weekdayKoOf(todayStr);
                                return (
                                  <span key={w} style={{
                                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    width: 18, height: 18, borderRadius: "50%", fontSize: 12, fontWeight: 800,
                                    color: isToday ? "#fff" : "#111827",
                                    background: isToday ? "#ef4444" : "transparent",
                                  }}>{w}</span>
                                );
                              })}
                            </span>
                          ) : <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>전일 가능</div>}
                        </div>
                      </div>
                    </div>

                    {/* 확장 상세 */}
                    {expanded && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f0f2f5" }}>
                        <MobileManagerBadge driver={d} staff={companyStaff} canDelegate={canDelegate} onAssign={assignDriverManager} />

                        {/* 오늘/누적 매출 */}
                        {(() => {
                          const rev = revenueFor(d);
                          return (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                              <div style={{ background: NAVY, borderRadius: 9, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.6)", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>오늘 매출</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{rev.today.toLocaleString()}원</div>
                              </div>
                              <div style={{ background: "#f8f9fb", borderRadius: 9, padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>누적 매출</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{rev.cumulative.toLocaleString()}원</div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* 오늘 배차 노선 전체 — 첫 건은 카드 상단(탭 없이도 보임)에 이미 나오므로,
                            오더가 2건 이상일 때만 나머지까지 펼쳐서 전부 보여준다. */}
                        {(() => {
                          if (todays.length < 2) return null;
                          return todays.map((r, i) => (
                            <div key={r._id || i} style={{ background: "#f0f4ff", borderRadius: 9, padding: "10px 12px", marginBottom: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7eac", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>
                                오늘 노선 {todays.length > 1 ? `${i + 1}/${todays.length}` : ""} · {r.배차상태 || "배차중"}
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
                                {r.상차지명 || "-"} <span style={{ color: "#9ca3af" }}>→</span> {r.하차지명 || "-"}
                              </div>
                              <div style={{ fontSize: 12, color: "#4b5563", marginTop: 3 }}>
                                상차 {r.상차시간 || "즉시"} · 하차예상 {r.하차시간 || "즉시"}{r.하차일 && r.하차일 !== r.상차일 ? ` (${r.하차일})` : ""}
                              </div>
                              {r.거래처명 && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>거래처: {r.거래처명}</div>}
                              {/* ⭐ 사용자 요청 — 화물내용/톤수/차량종류도 보여야 하고, 운임은 청구운임이
                                  아니라 기사에게 지급하는 기사운임이어야 한다. */}
                              {(r.차량종류 || r.차량톤수 || r.화물내용) && (
                                <div style={{ fontSize: 11, color: "#6b7eac", marginTop: 2 }}>
                                  {[r.차량종류, r.차량톤수].filter(Boolean).join(" · ")}{r.화물내용 ? ` · ${r.화물내용}` : ""}
                                </div>
                              )}
                              {r.기사운임 && <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginTop: 2 }}>기사운임 {Number(String(r.기사운임).replace(/[^\d]/g, "")).toLocaleString()}원</div>}
                            </div>
                          ));
                        })()}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          {(() => {
                            const km = d.총거리 || 0;
                            const vt = String(d.vehicleType || "").replace(/\s/g,"");
                            const eff = /25|28/.test(vt)?3.0:/11|15|18/.test(vt)?3.5:/1[^0-9]|2\.5|소형/.test(vt)?5.5:4.0;
                            const fuelCost = km > 0 ? Math.round(km/eff*1750) : 0;
                            return [
                              ["연락처", d.phone ? formatPhone(d.phone) : "-"],
                              ["차량종류", d.vehicleType || "-"],
                              ["이동거리", `${km.toFixed(2)} km`],
                              ["연료비 추정", km > 0 ? `${fuelCost.toLocaleString()}원` : "-"],
                            ];
                          })().map(([label, val]) => (
                            <div key={label} style={{ background: "#f8f9fb", borderRadius: 9, padding: "10px 12px" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{val}</div>
                            </div>
                          ))}
                        </div>
                        {d.location && (
                          <div style={{ marginTop: 0, background: "#f0f4ff", borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            <svg width="14" height="14" fill="none" stroke={NAVY} strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span style={{ fontSize: 12, color: NAVY, fontWeight: 600 }}>
                              {d.location.lat.toFixed(5)}, {d.location.lng.toFixed(5)}
                            </span>
                          </div>
                        )}
                        {/* 지도 보기 버튼 */}
                        <button
                          onClick={(e) => handleViewOnMap(d, e)}
                          style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: NAVY, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
                        >
                          <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          지도에서 경로 보기
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ 지도 ═══ */}
      {activeSection === "map" && (
        <div>
          {/* 기사 선택 칩 */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "12px 16px 8px", scrollbarWidth: "none" }}>
            {drivers.map(d => {
              const color = STATUS_COLORS[d.상태] || "#9ca3af";
              const sel = mapSelected?.id === d.id;
              return (
                <button key={d.id}
                  onClick={() => {
                    if (sel) { setMapSelected(null); setGpsTracks([]); setRoadPath([]); }
                    else setMapSelected(d);
                  }}
                  style={{
                    padding: "6px 13px", borderRadius: 99,
                    border: sel ? `2px solid ${NAVY}` : "1px solid #e5e7eb",
                    background: sel ? NAVY : "white",
                    color: sel ? "#fff" : "#374151",
                    fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sel ? "rgba(255,255,255,.7)" : color, display: "inline-block" }} />
                  {d.이름}
                  {d.active && !sel && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />}
                </button>
              );
            })}
            {drivers.length === 0 && (
              <span style={{ fontSize: 13, color: "#9ca3af", padding: "6px 0" }}>등록된 기사가 없습니다</span>
            )}
          </div>

          {/* 지도 */}
          <div style={{ height: "58vh", minHeight: 360, position: "relative" }}>
            <MapContainer
              center={mapSelected?.location ? [mapSelected.location.lat, mapSelected.location.lng] : [37.5665, 126.9780]}
              zoom={mapSelected?.location ? 14 : 11}
              scrollWheelZoom
              style={{ height: "100%", width: "100%" }}
            >
              <MapRecenter center={mapCenter || mapSelected?.location} />
              {displayPath.length >= 2 && <FitPath points={displayPath} resetKey={mapSelected?.id} />}
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />

              {/* 실제 도로 경로 선 */}
              {displayPath.length >= 2 && (
                <Polyline
                  positions={displayPath.map(p => [p.lat, p.lng])}
                  color={NAVY} weight={4} opacity={0.8}
                />
              )}

              {/* 경로 상태 포인트 */}
              {selectedPath.map((p, i) => {
                const color = STATUS_COLORS[p.status] || "#9ca3af";
                const isFirst = i === selectedPath.length - 1;
                const isLast = i === 0;
                if (gpsTracks.length >= 2 && !isFirst && !isLast) return null; // dense tracks: only endpoints
                return (
                  <CircleMarker
                    key={i}
                    center={[p.lat, p.lng]}
                    radius={isFirst || isLast ? 8 : 5}
                    color="#fff" weight={2.5}
                    fillColor={color} fillOpacity={1}
                  >
                    <Popup>
                      <div style={{ fontSize: 13, fontFamily: "'Noto Sans KR',sans-serif", lineHeight: 1.7 }}>
                        <span style={{ fontWeight: 700, color }}>● {p.status}</span>
                        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>{formatDateTime(p.timestamp)}</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

              {/* 기사 현재 위치 마커 */}
              {drivers.map(d => d.location ? (
                <Marker
                  key={d.id}
                  position={[d.location.lat, d.location.lng]}
                  icon={getIcon(d.상태, d.active, d.이름)}
                  eventHandlers={{ click: () => setMapSelected(prev => prev?.id === d.id ? null : d) }}
                >
                  <Popup offset={[0, -46]}>
                    <div style={{ fontSize: 13, lineHeight: 1.8, minWidth: 140, fontFamily: "'Noto Sans KR',sans-serif" }}>
                      <div style={{ fontWeight: 800, color: NAVY, marginBottom: 3, fontSize: 14 }}>
                        {d.이름}
                        <span style={{ fontWeight: 600, color: "#6b7280", fontSize: 11, marginLeft: 6 }}>{d.차량번호}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLORS[d.상태] || "#9ca3af", display: "inline-block" }} />
                        <span style={{ fontWeight: 700, color: STATUS_COLORS[d.상태] || "#9ca3af", fontSize: 13 }}>{d.상태}</span>
                      </div>
                      <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>이동거리: {d.총거리.toFixed(1)} km</div>
                      <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 1 }}>{timeAgo(d.updatedAt)}</div>
                    </div>
                  </Popup>
                </Marker>
              ) : null)}
            </MapContainer>

            {/* 갱신 배지 + 새로고침 버튼 */}
            <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1000, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ background: "rgba(27,43,75,0.82)", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: "rgba(255,255,255,0.9)", fontWeight: 700, display: "flex", alignItems: "center", gap: 5, backdropFilter: "blur(4px)" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "mfvBlink 1.5s ease-in-out infinite" }} />
                  1분 주기 갱신
                </div>
                <button
                  onClick={handleMapRefresh}
                  title="위치 즉시 새로고침"
                  style={{ background: "rgba(255,255,255,0.93)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: NAVY, backdropFilter: "blur(4px)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  새로고침
                </button>
              </div>
              {mapSelected && (
                <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: NAVY, fontWeight: 700, backdropFilter: "blur(4px)" }}>
                  {mapSelected.이름} · {timeAgo(mapSelected.updatedAt)}
                </div>
              )}
            </div>
            {/* 경로 로딩 표시 — 기사/날짜 변경 시에만 잠깐 표시 */}
            {mapSelected && selectedPath.length >= 2 && roadPath.length < 2 && !osrmDoneRef.current && (
              <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1000, background: "rgba(255,255,255,.92)", borderRadius: 8, padding: "5px 11px", fontSize: 12, color: "#6b7280", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(4px)" }}>
                <div style={{ width: 10, height: 10, border: `2px solid ${NAVY}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
                경로 계산중...
              </div>
            )}
          </div>

          {/* 선택 기사 하단 정보 카드 */}
          {mapSelected ? (
            <div style={{ padding: "14px 16px", background: "white", borderTop: "2px solid #e5e7eb" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 900, color: NAVY }}>{mapSelected.이름}</span>
                    <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, letterSpacing: "0.04em" }}>{mapSelected.차량번호}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[mapSelected.상태] || "#9ca3af", display: "inline-block" }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: STATUS_COLORS[mapSelected.상태] || "#9ca3af" }}>{mapSelected.상태}</span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{timeAgo(mapSelected.updatedAt)}</span>
                  </div>
                </div>
                <button
                  onClick={() => { setMapSelected(null); setGpsTracks([]); setRoadPath([]); }}
                  style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 8, padding: "6px 12px", fontSize: 13, color: "#6b7280", cursor: "pointer", fontWeight: 600 }}
                >
                  닫기
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  { label: "이동거리", val: `${mapSelected.총거리.toFixed(1)} km` },
                  { label: "평균 속도", val: avgSpeed !== null ? `${avgSpeed} km/h` : "-" },
                  {
                    label: "경로 포인트",
                    val: gpsTracks.length > 0 ? `${gpsTracks.length}개` : `${selectedPath.length}개`,
                    sub: gpsTracks.length > 0 ? "GPS" : "상태기록",
                  },
                ].map(({ label, val, sub }) => (
                  <div key={label} style={{ background: "#f8f9fb", borderRadius: 9, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{val}</div>
                    {sub && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
                  </div>
                ))}
              </div>

              {/* 현재 좌표 */}
              {mapSelected.location && (
                <div style={{ marginTop: 8, background: "#f0f4ff", borderRadius: 9, padding: "9px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="13" height="13" fill="none" stroke={NAVY} strokeWidth="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span style={{ fontSize: 12, color: NAVY, fontWeight: 600 }}>
                    {mapSelected.location.lat.toFixed(5)}, {mapSelected.location.lng.toFixed(5)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: "16px", background: "#f8f9fb", borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>
              위에서 기사를 선택하면 이동 경로가 표시됩니다
            </div>
          )}
        </div>
      )}

      {/* ═══ 실시간 활동 피드 ═══ */}
      {activeSection === "feed" && (
        <div style={{ padding: "12px 16px 0" }}>
          {filteredFeed.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
              기사가 버튼을 누르면 여기에 표시됩니다
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {filteredFeed.map((log, i) => {
                const color = STATUS_COLORS[log.status] || "#9ca3af";
                const name = log.driverName || driversMap[log.uid]?.이름 || "-";
                const carNo = log.carNo || driversMap[log.uid]?.차량번호 || "-";
                return (
                  <div key={log.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "13px 0", borderBottom: i < filteredFeed.length - 1 ? "1px solid #f0f2f5" : "none",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 3, flexShrink: 0 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: `0 0 0 3px ${color}22` }} />
                      {i < filteredFeed.length - 1 && (
                        <div style={{ width: 1, minHeight: 16, flex: 1, background: "#e5e7eb", marginTop: 4 }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>{name}</span>
                        <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, letterSpacing: "0.04em" }}>{carNo}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color, background: `${color}18`, padding: "2px 8px", borderRadius: 99 }}>{log.status}</span>
                      </div>
                      {log.location?.lat != null && (
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2 }}>
                          {log.location.lat.toFixed(5)}, {log.location.lng.toFixed(5)}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{formatDateTime(log.timestamp)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ 출근기록 ═══ */}
      {activeSection === "attendance" && (
        <MobileAttendance logs={attendanceLogs} drivers={drivers} />
      )}

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes mfvRing{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.2);opacity:0}}
        @keyframes mfvBlink{0%,100%{opacity:1}50%{opacity:.4}}
      `}</style>
    </div>
  );
}

// ─── MobileAttendance ─────────────────────────────────────────────────────────

function MobileAttendance({ logs, drivers }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const goDay = (delta) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const { attendance, noShow } = useMemo(() => {
    const from = new Date(selectedDate + "T00:00:00");
    const to   = new Date(selectedDate + "T23:59:59");
    const byDriver = {};
    logs.forEach(log => {
      const t = resolveTs(log.timestamp);
      if (!t || t < from || t > to) return;
      if (!["출근", "퇴근", "최종퇴근"].includes(log.status)) return;
      const uid = log.uid;
      if (!byDriver[uid]) byDriver[uid] = { uid, name: log.driverName || "-", carNo: log.carNo || "-", checkIn: null, checkOut: null, isFinal: false, distance: null };
      const e = byDriver[uid];
      if (log.status === "출근" && (!e.checkIn || t < e.checkIn)) e.checkIn = t;
      if ((log.status === "퇴근" || log.status === "최종퇴근") && (!e.checkOut || t > e.checkOut)) {
        e.checkOut = t;
        if (log.status === "최종퇴근") { e.isFinal = true; e.distance = log.finalDistance ?? null; }
      }
    });
    const attendedUids = new Set(Object.keys(byDriver));
    const noShow = selectedDate === todayStr ? drivers.filter(d => !attendedUids.has(d.id)) : [];
    return {
      attendance: Object.values(byDriver).sort((a, b) => (a.checkIn?.getTime() || 0) - (b.checkIn?.getTime() || 0)),
      noShow,
    };
  }, [logs, selectedDate, drivers, todayStr]);

  const fmtT = (d) => d ? `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` : "--";

  const dateLabel = (() => {
    const d = new Date(selectedDate);
    return `${d.getMonth()+1}/${d.getDate()} (${["일","월","화","수","목","금","토"][d.getDay()]})`;
  })();

  return (
    <div style={{ padding: "12px 16px 0" }}>
      {/* 날짜 네비 */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>출근기록부</span>
          <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{dateLabel}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={() => goDay(-1)} style={{ padding: "5px 11px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>이전</button>
            <button onClick={() => goDay(1)} disabled={selectedDate >= todayStr}
              style={{ padding: "5px 11px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", fontSize: 12, fontWeight: 600, color: selectedDate >= todayStr ? "#d1d5db" : "#374151", cursor: selectedDate >= todayStr ? "default" : "pointer" }}>다음</button>
            {selectedDate !== todayStr && (
              <button onClick={() => setSelectedDate(todayStr)} style={{ padding: "5px 11px", border: "none", borderRadius: 7, background: NAVY, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>오늘</button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "출근", val: attendance.length, color: NAVY },
            { label: "미출근", val: Math.max(0, drivers.length - attendance.length), color: attendance.length < drivers.length ? "#dc2626" : "#374151" },
            { label: "근무중", val: attendance.filter(r => !r.checkOut).length, color: "#10b981" },
            { label: "전체", val: drivers.length, color: "#6b7280" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: ".05em" }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 출근 목록 */}
      {attendance.length === 0 ? (
        <div style={{ padding: "30px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>출근 기록이 없습니다</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {attendance.map((row, i) => {
            const workMs = row.checkIn && row.checkOut ? row.checkOut.getTime() - row.checkIn.getTime() : null;
            const workStr = workMs ? (() => { const h = Math.floor(workMs/3600000), m = Math.floor((workMs%3600000)/60000); return h > 0 ? `${h}시간 ${m}분` : `${m}분`; })() : null;
            return (
              <div key={row.uid} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>{i + 1}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{row.name}</span>
                    <span style={{ fontSize: 12, color: NAVY, fontWeight: 700, letterSpacing: "0.04em" }}>{row.carNo}</span>
                  </div>
                  {!row.checkOut
                    ? <span style={{ fontSize: 12, color: "#10b981", fontWeight: 700, background: "#d1fae5", padding: "2px 9px", borderRadius: 99 }}>근무중</span>
                    : row.isFinal
                      ? <span style={{ fontSize: 12, color: "#374151", background: "#f3f4f6", padding: "2px 9px", borderRadius: 99 }}>최종퇴근</span>
                      : <span style={{ fontSize: 12, color: "#6b7280", background: "#f3f4f6", padding: "2px 9px", borderRadius: 99 }}>퇴근</span>
                  }
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                  <div>
                    <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700 }}>출근</span>
                    <div style={{ color: "#1B2B4B", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtT(row.checkIn)}</div>
                  </div>
                  <div>
                    <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700 }}>퇴근</span>
                    <div style={{ color: row.checkOut ? "#374151" : "#9ca3af", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtT(row.checkOut)}</div>
                  </div>
                  {workStr && (
                    <div>
                      <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700 }}>근무시간</span>
                      <div style={{ color: "#374151", fontWeight: 700 }}>{workStr}</div>
                    </div>
                  )}
                  {(() => {
                    const dist = row.distance != null ? row.distance : (drivers.find(d => d.id === row.uid)?.총거리 ?? null);
                    return dist != null ? (
                      <div>
                        <span style={{ color: "#9ca3af", fontSize: 11, fontWeight: 700 }}>이동거리</span>
                        <div style={{ color: "#374151", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{dist.toFixed(1)} km</div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 미출근 기사 (오늘만) */}
      {selectedDate === todayStr && noShow.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 10 }}>미출근 기사 ({noShow.length}명)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {noShow.map(d => (
              <div key={d.id} style={{ padding: "5px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, color: "#374151", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#d1d5db", display: "inline-block" }} />
                {d.이름} <span style={{ color: "#9ca3af", fontWeight: 500, fontSize: 12 }}>{d.차량번호}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
