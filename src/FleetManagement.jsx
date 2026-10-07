// ======================= FleetManagement.jsx =======================
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { db, auth } from "./firebase";
import {
  collection, onSnapshot, doc, updateDoc, setDoc, getDoc, getDocs, addDoc,
  query, where, orderBy, limit, deleteDoc, writeBatch, documentId, serverTimestamp,
} from "firebase/firestore";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { getDrivingRoute } from "./tmapFareCalc";
import CustomDatePicker from "./CustomDatePicker";
import RouteMapModal from "./RouteMapModal";

// ─── 상수 ────────────────────────────────────────────────────────────────────

const NAVY = "#1B2B4B";
const NAVY_DARK = "#131e35";
const NAVY_LIGHT = "#243454";

// 전화번호 하이픈 자동 포맷 (DispatchApp.jsx formatPhone과 동일 규칙)
function formatPhone(phone) {
  const p = String(phone ?? "").replace(/[^\d]/g, "");
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return p;
}

// KPI 카드용 단색 라인 아이콘(path만) — 모바일 지입차관리와 동일한 스타일.
// <svg stroke={accent}> 안에 그대로 끼워 쓴다.
const KPI_ICONS = {
  truck: <><rect x="1" y="5" width="14" height="10" rx="1.5" /><path d="M15 9h4l3 3v3h-7z" /><circle cx="6" cy="18" r="1.8" /><circle cx="18" cy="18" r="1.8" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></>,
  route: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M6 8.2V14a3 3 0 0 0 3 3h3a3 3 0 0 1 3 3v-2" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>,
};

const STATUS_COLORS = {
  운행중:   "#10b981",
  출근:     "#3b82f6",
  상차중:   "#f59e0b",
  하차중:   "#8b5cf6",
  대기:     "#6b7280",
  휴식:     "#9ca3af",
  휴차:     "#374151",
  퇴근:     "#374151",
  최종퇴근: "#374151",
  복귀중:   "#06b6d4",
};

const STATUS_ORDER = ["운행중", "상차중", "하차중", "복귀중", "출근", "대기", "휴식", "퇴근"];
const STATUS_FILTER_OPTIONS = ["전체", "운행중", "출근", "상차중", "하차중", "복귀중", "대기", "휴식", "휴차", "퇴근"];

const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

// ─── 타임스탬프 유틸 ──────────────────────────────────────────────────────────
// Handles Firestore Timestamp, { seconds, nanoseconds }, number (ms), and null

function resolveTs(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  if (typeof ts === "number") return new Date(ts);
  return null;
}

function toKSTDate(ts) {
  const d = resolveTs(ts);
  if (!d) return null;
  const kst = new Date(d.getTime() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
}

function kstDateStr(d = new Date()) {
  return new Date((d instanceof Date ? d : new Date(d)).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
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

function formatMs(ms) {
  if (!ms || ms <= 0) return "0분";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간 ${m % 60}분`;
}

function formatMinutes(min) {
  if (!min || min <= 0) return "0분";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function formatTime(ts) {
  const d = resolveTs(ts);
  if (!d) return "--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(ts) {
  const d = resolveTs(ts);
  if (!d) return "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// ─── sessionStorage 캐시 ──────────────────────────────────────────────────────
// Converts Firestore Timestamps → ms numbers before storing; works on reload

function sfGet(key, fallback) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function sfSet(key, val) {
  try {
    sessionStorage.setItem(key, JSON.stringify(val, (_k, v) => {
      if (v && typeof v === "object" && "seconds" in v && "nanoseconds" in v) return v.seconds * 1000;
      if (v && typeof v === "object" && typeof v.toDate === "function") return v.toDate().getTime();
      return v;
    }));
  } catch {}
}

// ─── 모듈 레벨 PIN 상태 (F5 새로고침 시 초기화, 탭 전환 시 유지) ──────────────
let _fleetPinVerified = false;
const FLEET_PIN_KEY = "exec_intel_pin_v1"; // 경영인텔리전스와 동일 PIN

// ─── 역지오코딩 캐시 (Nominatim) ─────────────────────────────────────────────
const _geoCache = new Map();
let _geoQueue = [];
let _geoProcessing = false;

function enqueueGeocode(lat, lng, cb) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (_geoCache.has(key)) { cb(_geoCache.get(key)); return; }
  _geoQueue.push({ lat, lng, key, cb });
  _processGeoQueue();
}

async function _processGeoQueue() {
  if (_geoProcessing || _geoQueue.length === 0) return;
  _geoProcessing = true;
  const { lat, lng, key, cb } = _geoQueue.shift();
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko`,
      { headers: { "User-Agent": "KPFlowDispatch/1.0" } }
    );
    const data = await res.json();
    const a = data.address || {};
    const parts = [
      a.city || a.county || a.state,
      a.suburb || a.quarter || a.neighbourhood || a.village,
      a.road || a.pedestrian,
    ].filter(Boolean);
    const addr = parts.length ? parts.join(" ") : (data.display_name || "").split(",")[0].trim();
    _geoCache.set(key, addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    cb(_geoCache.get(key));
  } catch {
    const fb = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    _geoCache.set(key, fb);
    cb(fb);
  }
  await new Promise(r => setTimeout(r, 1200));
  _geoProcessing = false;
  _processGeoQueue();
}

// ─── 날짜+시간 포맷 ───────────────────────────────────────────────────────────
function formatDateTime(ts) {
  const d = resolveTs(ts);
  if (!d) return "--";
  return `${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function statusPriority(d) {
  const activeBonus = d.active ? 0 : 1000;
  const idx = STATUS_ORDER.indexOf(d.상태);
  return activeBonus + (idx === -1 ? 999 : idx);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Leaflet 마커 ─────────────────────────────────────────────────────────────
// Active drivers show a pulsing ring; inactive show a static dot

function makeIcon(color, active, name) {
  const ring1 = active ? `<div style="position:absolute;top:-7px;left:-7px;right:-7px;bottom:5px;border-radius:12px;background:${color};opacity:.22;animation:fmRing 1.8s infinite ease-out;pointer-events:none;"></div>` : "";
  const ring2 = active ? `<div style="position:absolute;top:-4px;left:-4px;right:-4px;bottom:6px;border-radius:10px;background:${color};opacity:.15;animation:fmRing 1.8s infinite ease-out;animation-delay:.5s;pointer-events:none;"></div>` : "";
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
  const color = STATUS_COLORS[status] || "#9ca3af";
  return makeIcon(color, !!active, name);
}

// ─── MapRecenter ──────────────────────────────────────────────────────────────

function MapRecenter({ center }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (!center) return;
    const key = center._t ? `${center.lat},${center.lng},${center._t}` : `${center.lat},${center.lng}`;
    if (prev.current === key) return;
    prev.current = key;
    if (center._t) {
      // 실시간 추적: zoom 변경 없이 부드럽게 pan
      map.panTo([center.lat, center.lng], { animate: true, duration: 0.8 });
    } else {
      map.setView([center.lat, center.lng], 14, { animate: true });
    }
  }, [center, map]);
  return null;
}

// ─── FitPath ─────────────────────────────────────────────────────────────────

function FitPath({ points, resetKey }) {
  const map = useMap();
  const fittedKeyRef = useRef(null);
  useEffect(() => {
    if (points.length < 2) return;
    if (fittedKeyRef.current === resetKey) return; // 같은 기사 선택 중엔 재조정 안 함
    fittedKeyRef.current = resetKey;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
  }, [points, map, resetKey]);
  return null;
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, size = 9 }) {
  const color = STATUS_COLORS[status] || "#9ca3af";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: size, height: size, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontSize: 16, fontWeight: 700, color: "#1B2B4B" }}>{status || "확인중"}</span>
    </span>
  );
}

// ─── FleetPinGate ────────────────────────────────────────────────────────────

function FleetPinGate({ onVerified }) {
  const hasPin = !!localStorage.getItem(FLEET_PIN_KEY);
  const [mode, setMode] = React.useState(hasPin ? "verify" : "setup1");
  const [entered, setEntered] = React.useState("");
  const [firstPin, setFirstPin] = React.useState("");
  const [error, setError] = React.useState("");
  const [animKey, setAnimKey] = React.useState(0);

  const bump = () => { setAnimKey(k => k + 1); setEntered(""); setError(""); };

  const handleKey = (d) => {
    if (d === "back") { setEntered(p => p.slice(0, -1)); return; }
    if (entered.length >= 6) return;
    const next = entered + d;
    setEntered(next);
    if (next.length < 6) return;
    setTimeout(() => {
      if (mode === "verify") {
        if (next === localStorage.getItem(FLEET_PIN_KEY)) onVerified();
        else { setError("비밀번호가 올바르지 않습니다"); bump(); }
      } else if (mode === "setup1") {
        setFirstPin(next); setEntered(""); setMode("setup2");
      } else if (mode === "setup2") {
        if (next === firstPin) { localStorage.setItem(FLEET_PIN_KEY, next); onVerified(); }
        else { setError("비밀번호가 일치하지 않습니다"); setFirstPin(""); setMode("setup1"); bump(); }
      }
    }, 200);
  };

  const heading = mode === "verify" ? "보안 인증" : mode === "setup1" ? "비밀번호 설정" : "비밀번호 확인";
  const sub = mode === "verify" ? "지입차 관제 시스템 — 6자리 비밀번호" :
    mode === "setup1" ? "사용할 6자리 비밀번호를 입력하세요" : "비밀번호를 한 번 더 입력하여 확인하세요";

  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f6f9", borderRadius: 12 }}>
      <div style={{ background: "white", borderRadius: 20, boxShadow: "0 4px 24px rgba(27,43,75,.12)", padding: "40px 44px", width: 340 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 58, height: 58, background: NAVY, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8Z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", color: "#d1d5db", marginBottom: 6, textTransform: "uppercase" }}>FLEET MANAGEMENT</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: NAVY }}>{heading}</div>
          <div style={{ fontSize: 15, color: "#9ca3af", marginTop: 6 }}>{sub}</div>
        </div>
        <div key={animKey} style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: i < entered.length ? NAVY : "white", border: `2px solid ${i < entered.length ? NAVY : "#d1d5db"}`, transition: "all .15s" }} />
          ))}
        </div>
        {error && <div style={{ textAlign: "center", fontSize: 14, fontWeight: 600, color: "#ef4444", background: "#fef2f2", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[1,2,3,4,5,6,7,8,9,null,0,"←"].map((d, i) => (
            <button key={i} onClick={() => d !== null && handleKey(d === "←" ? "back" : String(d))} disabled={d === null}
              style={{ height: 52, borderRadius: 12, border: "1px solid #e5e7eb", background: d === "←" ? "#f3f4f6" : "#f8f9fb", color: d === "←" ? "#6b7280" : NAVY, fontSize: d === "←" ? 15 : 18, fontWeight: 600, cursor: d === null ? "default" : "pointer", opacity: d === null ? 0 : 1, fontFamily: "inherit" }}
            >{d}</button>
          ))}
        </div>
        {mode === "verify" && (
          <button onClick={() => { localStorage.removeItem(FLEET_PIN_KEY); setMode("setup1"); setEntered(""); setError(""); setFirstPin(""); }}
            style={{ width: "100%", marginTop: 16, textAlign: "center", fontSize: 14, color: "#d1d5db", background: "none", border: "none", cursor: "pointer" }}>
            비밀번호를 잊으셨나요? — 재설정
          </button>
        )}
      </div>
    </div>
  );
}

// ─── PinConfirmModal ──────────────────────────────────────────────────────────
// Handles three scenarios:
//   "setup1"→"setup2" : no PIN stored yet (first time on this device/browser)
//   "pin"             : PIN exists — verify it
//   "confirm"         : PIN verified — show final "완전 삭제" confirmation

function PinConfirmModal({ onConfirmed, onCancel, title = "삭제 확인" }) {
  const hasPin = !!localStorage.getItem(FLEET_PIN_KEY);
  const [stage, setStage] = React.useState(hasPin ? "pin" : "setup1");
  const [entered, setEntered] = React.useState("");
  const [firstPin, setFirstPin] = React.useState("");
  const [error, setError] = React.useState("");
  const [animKey, setAnimKey] = React.useState(0);

  const bump = (msg) => { setError(msg); setAnimKey(k => k + 1); setEntered(""); };

  const handleKey = (d) => {
    if (d === "back") { setEntered(p => p.slice(0, -1)); return; }
    if (entered.length >= 6) return;
    const next = entered + d;
    setEntered(next);
    if (next.length < 6) return;
    setTimeout(() => {
      if (stage === "pin") {
        if (next === localStorage.getItem(FLEET_PIN_KEY)) {
          setStage("confirm"); setEntered(""); setError("");
        } else {
          bump("비밀번호가 올바르지 않습니다");
        }
      } else if (stage === "setup1") {
        setFirstPin(next); setEntered(""); setError(""); setStage("setup2");
      } else if (stage === "setup2") {
        if (next === firstPin) {
          localStorage.setItem(FLEET_PIN_KEY, next);
          setStage("confirm"); setEntered(""); setError("");
        } else {
          setFirstPin(""); setStage("setup1");
          bump("비밀번호가 일치하지 않습니다. 다시 입력하세요");
        }
      }
    }, 200);
  };

  const dotColor = stage === "setup2" ? "#3b82f6" : "#ef4444";

  const subText = {
    pin: "비밀번호를 입력하세요",
    setup1: "이 기기에 등록된 비밀번호가 없습니다.\n사용할 6자리 비밀번호를 설정하세요",
    setup2: "비밀번호를 한 번 더 입력하세요",
  }[stage];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "white", borderRadius: 16, padding: "32px 36px", width: 320, boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
        {stage !== "confirm" ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: stage === "pin" ? "#ef4444" : "#3b82f6", marginBottom: 6 }}>
                {stage === "pin" ? title : "비밀번호 설정"}
              </div>
              <div style={{ fontSize: 15, color: "#6b7280", whiteSpace: "pre-line" }}>{subText}</div>
            </div>
            <div key={animKey} style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: i < entered.length ? dotColor : "white", border: `2px solid ${i < entered.length ? dotColor : "#d1d5db"}`, transition: "all .15s" }} />
              ))}
            </div>
            {error && <div style={{ textAlign: "center", fontSize: 14, color: "#ef4444", marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[1,2,3,4,5,6,7,8,9,null,0,"←"].map((d, i) => (
                <button key={i} onClick={() => d !== null && handleKey(d === "←" ? "back" : String(d))} disabled={d === null}
                  style={{ height: 46, borderRadius: 10, border: "1px solid #e5e7eb", background: d === "←" ? "#f3f4f6" : "#f8f9fb", color: "#374151", fontSize: d === "←" ? 14 : 17, fontWeight: 600, cursor: d === null ? "default" : "pointer", opacity: d === null ? 0 : 1, fontFamily: "inherit" }}
                >{d}</button>
              ))}
            </div>
            <button onClick={onCancel} style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>취소</button>
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ width: 54, height: 54, background: "#fef2f2", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="26" height="26" fill="none" stroke="#ef4444" strokeWidth="1.8" viewBox="0 0 24 24">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 6 }}>정말 삭제하시겠습니까?</div>
              <div style={{ fontSize: 15, color: "#9ca3af" }}>이 작업은 되돌릴 수 없습니다</div>
            </div>
            <button onClick={onConfirmed} style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#ef4444", color: "white", fontSize: 17, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
              완전 삭제
            </button>
            <button onClick={onCancel} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              취소
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, primary, accent }) {
  if (primary) {
    return (
      <div style={{ background: `linear-gradient(135deg,${NAVY_DARK} 0%,${NAVY_LIGHT} 100%)`, borderRadius: 12, padding: "18px 22px", boxShadow: "0 2px 8px rgba(27,43,75,.18)" }}>
        <p style={{ color: "rgba(255,255,255,.65)", fontSize: 14, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", margin: "0 0 8px" }}>{label}</p>
        <p style={{ color: "#fff", fontSize: 34, fontWeight: 800, lineHeight: 1, margin: 0 }}>{value}</p>
        {sub && <p style={{ color: "rgba(255,255,255,.45)", fontSize: 14, margin: "7px 0 0" }}>{sub}</p>}
      </div>
    );
  }
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 22px" }}>
      <p style={{ color: "#6b7280", fontSize: 14, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", margin: "0 0 8px" }}>{label}</p>
      <p style={{ color: accent || NAVY, fontSize: 34, fontWeight: 800, lineHeight: 1, margin: 0 }}>{value}</p>
      {sub && <p style={{ color: "#9ca3af", fontSize: 14, margin: "7px 0 0" }}>{sub}</p>}
    </div>
  );
}

// ─── DriverTable ─────────────────────────────────────────────────────────────
// Selection uses light-blue highlight so dark text stays readable

const COL_HEADERS = ["#", "이름", "차량번호", "차종", "현재상태", "속력", "주행시간", "이동거리", "업데이트", "활성화", "첨부", ""];

function DriverTable({ rows, selectedId, onSelect, onFocusMap, onContextMenu, todayPhotos = [], onViewPhotos }) {
  if (rows.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "52px 24px", color: "#9ca3af" }}>
        <svg width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.4" viewBox="0 0 24 24" style={{ marginBottom: 12 }}>
          <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" strokeLinecap="round" />
        </svg>
        <p style={{ fontSize: 16, fontWeight: 600 }}>조건에 맞는 기사가 없습니다</p>
      </div>
    );
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
      <thead>
        <tr style={{ background: "#f4f6fa", borderBottom: "2px solid #e5e7eb", position: "sticky", top: 0, zIndex: 1 }}>
          {COL_HEADERS.map(col => (
            <th key={col} style={{ padding: "11px 14px", textAlign: "left", color: "#374151", fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", letterSpacing: "-.01em" }}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((d, idx) => {
          const sel = d.id === selectedId;
          // Use light-blue selection so text stays dark (readable)
          const bg = sel ? "#dbeafe" : idx % 2 === 0 ? "#fff" : "#fafbfc";
          return (
            <tr
              key={d.id}
              onClick={() => onSelect(d)}
              onContextMenu={e => { e.preventDefault(); onContextMenu?.(e, d); }}
              style={{
                background: bg,
                borderBottom: "1px solid #f0f2f5",
                borderLeft: sel ? `3px solid ${NAVY}` : "3px solid transparent",
                cursor: "pointer",
                transition: "background .1s",
              }}
              onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "#eef2ff"; }}
              onMouseLeave={e => { if (!sel) e.currentTarget.style.background = bg; }}
            >
              {/* # */}
              <td style={{ padding: "11px 14px", color: "#9ca3af", fontWeight: 600, fontSize: 15 }}>{idx + 1}</td>

              {/* 이름 */}
              <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.active ? "#10b981" : "#d1d5db", display: "inline-block", flexShrink: 0 }} title={d.active ? "접속중" : "미접속"} />
                  <span style={{ color: sel ? "#1e3a5f" : "#111827", fontWeight: 700, fontSize: 16 }}>{d.이름 || "-"}</span>
                </div>
              </td>

              {/* 차량번호 */}
              <td style={{ padding: "11px 14px", color: "#1B2B4B", whiteSpace: "nowrap", fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>
                {d.차량번호 || "-"}
              </td>

              {/* 차종 */}
              <td style={{ padding: "11px 14px", color: "#374151", whiteSpace: "nowrap", fontSize: 15 }}>
                {d.vehicleType || "-"}
              </td>

              {/* 현재상태 */}
              <td style={{ padding: "11px 14px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[d.상태] || "#9ca3af", display: "inline-block" }} />
                  <span style={{ color: "#1B2B4B", fontWeight: 700, fontSize: 15 }}>{d.상태 || "대기"}</span>
                </span>
              </td>

              {/* 속력 */}
              <td style={{ padding: "11px 14px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {(d.speed || 0) > 0 ? (
                  <span style={{ fontSize: 15, fontWeight: 700, color: (d.speed||0) > 80 ? "#ef4444" : "#1B2B4B" }}>{d.speed} km/h</span>
                ) : (
                  <span style={{ fontSize: 14, color: "#d1d5db" }}>–</span>
                )}
              </td>

              {/* 주행시간 */}
              <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                {(() => {
                  const ws = d.workStartAt;
                  if (!ws) return <span style={{ fontSize: 14, color: "#d1d5db" }}>–</span>;
                  const start = ws?.toDate?.() || (ws?.seconds ? new Date(ws.seconds * 1000) : null);
                  if (!start) return <span style={{ fontSize: 14, color: "#d1d5db" }}>–</span>;
                  const isOut = d.상태 === "퇴근" || d.상태 === "최종퇴근";
                  const ms = isOut && d.근무시간
                    ? d.근무시간 * 60 * 1000
                    : Date.now() - start.getTime();
                  const h = Math.floor(ms / 3600000);
                  const m = Math.floor((ms % 3600000) / 60000);
                  return <span style={{ fontSize: 14, color: "#374151", fontVariantNumeric: "tabular-nums" }}>{h > 0 ? `${h}시간 ` : ""}{m}분</span>;
                })()}
              </td>

              {/* 이동거리 */}
              <td style={{ padding: "11px 14px", color: "#374151", whiteSpace: "nowrap", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
                {(d.총거리 || 0).toFixed(1)} km
              </td>

              {/* 업데이트 */}
              <td style={{ padding: "11px 14px", color: "#6b7280", whiteSpace: "nowrap", fontSize: 15 }}>
                {timeAgo(d.updatedAt)}
              </td>

              {/* 활성화 */}
              <td style={{ padding: "11px 12px", whiteSpace: "nowrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, background: d.active ? "#f0fdf4" : "#f3f4f6", border: `1px solid ${d.active ? "#86efac" : "#e5e7eb"}` }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: d.active ? "#10b981" : "#d1d5db", display: "inline-block", animation: d.active ? "fmBlink 2s ease-in-out infinite" : "none" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: d.active ? "#15803d" : "#9ca3af" }}>{d.active ? "활성" : "비활성"}</span>
                </span>
              </td>

              {/* 첨부 사진 */}
              <td style={{ padding: "11px 10px", whiteSpace: "nowrap", textAlign: "center" }}>
                {(() => {
                  const driverPhotos = todayPhotos.filter(p => p.uid === d.id);
                  if (!driverPhotos.length) return <span style={{ fontSize: 14, color: "#d1d5db" }}>–</span>;
                  return (
                    <button
                      onClick={e => { e.stopPropagation(); onViewPhotos?.({ driverName: d.이름, photos: driverPhotos }); }}
                      style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer" }}
                      title="사진 보기"
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(27,43,75,0.08)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <svg width="16" height="16" fill="none" stroke={NAVY} strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, background: "#059669", color: "white", fontSize: 11, fontWeight: 800, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
                        {driverPhotos.length}
                      </span>
                    </button>
                  );
                })()}
              </td>

              {/* 지도 포커스 */}
              <td style={{ padding: "11px 10px", whiteSpace: "nowrap" }}>
                {d.location && (
                  <button
                    onClick={e => { e.stopPropagation(); onFocusMap?.(d.location); onSelect(d); }}
                    title="지도에서 현재위치 보기"
                    style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #e5e7eb", borderRadius: 7, background: "#f8f9fb", cursor: "pointer", color: NAVY, padding: 0, flexShrink: 0 }}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="12" cy="9" r="2.5"/>
                    </svg>
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── FleetMap ────────────────────────────────────────────────────────────────

function FitAll({ count, drivers }) {
  const map = useMap();
  const prevCount = useRef(count);
  useEffect(() => {
    if (count === prevCount.current) return;
    prevCount.current = count;
    const locs = drivers.filter(d => d.location?.lat).map(d => [d.location.lat, d.location.lng]);
    if (locs.length > 0) map.fitBounds(L.latLngBounds(locs), { padding: [50, 50], maxZoom: 14, animate: true });
  }, [count, drivers, map]);
  return null;
}

function FleetMap({ drivers, center, onSelect, selectedPath = [], roadPath = [], fitAllCount = 0, selectedDriver = null }) {
  const defaultCenter = center || { lat: 37.5665, lng: 126.9780 };
  // Prefer OSRM road-following path; fall back to direct GPS waypoints
  const displayPath = roadPath.length >= 2 ? roadPath : selectedPath;
  const pathPositions = displayPath.map(p => [p.lat, p.lng]);

  return (
    <MapContainer center={[defaultCenter.lat, defaultCenter.lng]} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%", minHeight: 480, position: "relative" }}>
      <MapRecenter center={center} />
      <FitAll count={fitAllCount} drivers={drivers} />
      {selectedPath.length >= 2 && <FitPath points={selectedPath} resetKey={selectedDriver?.id} />}
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />

      {/* 이동 경로 선 (OSRM 도로 경로) */}
      {pathPositions.length >= 2 && (
        <Polyline positions={pathPositions} color={NAVY} weight={4} opacity={0.75} />
      )}

      {/* 경로 포인트 (상태 변경 위치) */}
      {selectedPath.map((p, i) => {
        const color = STATUS_COLORS[p.status] || "#9ca3af";
        const isFirst = i === selectedPath.length - 1; // 가장 오래된 = 출근
        const isLast = i === 0; // 가장 최근
        return (
          <CircleMarker
            key={i}
            center={[p.lat, p.lng]}
            radius={isFirst || isLast ? 8 : 5}
            color="#fff"
            weight={2}
            fillColor={color}
            fillOpacity={1}
          >
            <Popup>
              <div style={{ fontSize: 15, lineHeight: 1.7, fontFamily: "'Noto Sans KR',sans-serif" }}>
                <span style={{ fontWeight: 700, color }}>● {p.status}</span>
                <div style={{ color: "#6b7280", marginTop: 2 }}>{formatTime(p.timestamp)}</div>
                {p.dwell > 60000 && (
                  <div style={{ color: "#9ca3af", fontSize: 14 }}>체류 {formatMs(p.dwell)}</div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* 현재 위치 마커 */}
      {drivers.map(d =>
        d.location ? (
          <Marker
            key={d.id}
            position={[d.location.lat, d.location.lng]}
            icon={getIcon(d.상태, d.active, d.이름)}
            eventHandlers={{ click: () => onSelect?.(d) }}
          >
            <Popup offset={[0, -12]}>
              <div style={{ fontSize: 15, lineHeight: 1.8, minWidth: 155, fontFamily: "'Noto Sans KR',sans-serif" }}>
                <div style={{ fontWeight: 800, color: NAVY, marginBottom: 4, fontSize: 16 }}>
                  {d.이름 || "-"}
                  <span style={{ fontWeight: 500, color: "#6b7280", fontFamily: "monospace", fontSize: 14, marginLeft: 6 }}>{d.차량번호 || ""}</span>
                </div>
                <StatusBadge status={d.상태} size={8} />
                <div style={{ color: "#6b7280", marginTop: 4, fontSize: 15 }}>이동거리: {(d.총거리 || 0).toFixed(1)} km</div>
                <div style={{ color: "#9ca3af", fontSize: 14 }}>업데이트: {timeAgo(d.updatedAt)}</div>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}

// ─── ActivityLogItem ──────────────────────────────────────────────────────────

function ActivityLogItem({ log, isLast }) {
  const [address, setAddress] = useState(null);
  const [showCoords, setShowCoords] = useState(false);
  const hasLoc = log.location?.lat != null;
  const statusColor = STATUS_COLORS[log.status] || "#9ca3af";

  useEffect(() => {
    if (hasLoc) enqueueGeocode(log.location.lat, log.location.lng, setAddress);
  }, [hasLoc, log.location?.lat, log.location?.lng]);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 20px", borderBottom: !isLast ? "1px solid #f0f2f5" : "none" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4, flexShrink: 0 }}>
        <div style={{ width: 9, height: 9, borderRadius: "50%", background: statusColor, boxShadow: `0 0 0 3px ${statusColor}22` }} />
        {!isLast && <div style={{ width: 1, minHeight: 18, flex: 1, background: "#e5e7eb", marginTop: 4 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: statusColor, background: `${statusColor}18`, padding: "2px 8px", borderRadius: 99 }}>{log.status}</span>
          <span style={{ fontSize: 14, color: "#4b5563", fontWeight: 600 }}>{timeAgo(log.timestamp)}</span>
        </div>
        {hasLoc && (
          <div
            onClick={() => setShowCoords(v => !v)}
            style={{ fontSize: 14, color: "#6b7280", marginBottom: 1, cursor: "pointer", textDecoration: "underline dotted", display: "inline-block" }}
            title={showCoords ? "클릭하여 주소 표시" : "클릭하여 좌표 표시"}
          >
            {showCoords
              ? `${log.location.lat.toFixed(5)}, ${log.location.lng.toFixed(5)}`
              : (address || "주소 조회중...")}
          </div>
        )}
      </div>
      <div style={{ fontSize: 14, color: "#4b5563", flexShrink: 0, paddingTop: 2, fontWeight: 600, whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</div>
    </div>
  );
}

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

function ActivityFeed({ logs, driversMap, onDeleteAll }) {
  const grouped = useMemo(() => {
    const map = {};
    logs.forEach(log => {
      const k = log.uid || "unknown";
      if (!map[k]) {
        const info = driversMap[k] || {};
        map[k] = {
          uid: k,
          name: log.driverName || info.이름 || k.slice(0, 8) || "-",
          carNo: log.carNo || info.차량번호 || "-",
          latestStatus: log.status,
          logs: [],
        };
      }
      map[k].logs.push(log);
    });
    return Object.values(map).sort((a, b) => {
      const at = resolveTs(a.logs[0]?.timestamp)?.getTime() || 0;
      const bt = resolveTs(b.logs[0]?.timestamp)?.getTime() || 0;
      return bt - at;
    });
  }, [logs, driversMap]);

  if (grouped.length === 0) {
    return (
      <div style={{ padding: "36px 16px", textAlign: "center", color: "#9ca3af", fontSize: 16 }}>
        기사가 버튼을 누르면 여기에 즉시 표시됩니다
      </div>
    );
  }

  return (
    <div>
      {grouped.map((group, gi) => {
        const statusColor = STATUS_COLORS[group.latestStatus] || "#9ca3af";
        return (
          <div key={group.uid} style={{ borderBottom: gi < grouped.length - 1 ? "2px solid #f0f2f5" : "none" }}>
            {/* Driver group header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", background: "#f8f9fb", borderBottom: "1px solid #eaecf0" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{group.name}</span>
              <span style={{ fontSize: 15, color: "#6b7280", fontWeight: 700, letterSpacing: "0.04em" }}>{group.carNo}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: statusColor, background: `${statusColor}18`, padding: "2px 8px", borderRadius: 99 }}>{group.latestStatus}</span>
              <span style={{ fontSize: 14, color: "#9ca3af", marginLeft: "auto" }}>{group.logs.length}건</span>
            </div>
            {/* Log items */}
            {group.logs.map((log, i) => (
              <ActivityLogItem key={log.id} log={log} isLast={i === group.logs.length - 1} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── DriverDetailPanel ────────────────────────────────────────────────────────

function DriverDetailPanel({ data, logs, onClose, onDeleteLogs, checkInLoc, companyDefaultLoc, onSetCheckInLoc, onClearCheckInLoc, dropLoc, onSetDropLoc, onClearDropLoc, sessionWorkMs, sessionIsActive, sessionGpsDist, onFocusMap }) {
  if (!data) return null;

  const lastLog = logs[0];
  const dwellMs = lastLog ? (() => {
    const d = resolveTs(lastLog.timestamp);
    return d ? Date.now() - d.getTime() : null;
  })() : null;

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "24px 28px", position: "relative", boxShadow: "0 2px 12px rgba(27,43,75,.07)" }}>
      <button
        onClick={onClose}
        style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f8f9fb", cursor: "pointer", color: "#6b7280", padding: 0 }}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="24" height="24" fill="none" stroke="white" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" /></svg>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 21, fontWeight: 800, color: NAVY }}>{data.이름 || "-"}</span>
            <span style={{ fontSize: 15, color: "#374151", background: "#f0f2f5", padding: "3px 9px", borderRadius: 5, fontWeight: 700, letterSpacing: "0.04em" }}>{data.차량번호 || "-"}</span>
            {data.vehicleType && data.vehicleType !== "-" && (
              <span style={{ fontSize: 15, color: "#6b7280", padding: "3px 9px", border: "1px solid #e5e7eb", borderRadius: 99 }}>{data.vehicleType}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 7, flexWrap: "wrap" }}>
            <StatusBadge status={data.상태} size={9} />
            {dwellMs !== null && dwellMs > 60000 && (
              <span style={{ fontSize: 15, color: "#6b7280" }}>
                현재 상태 <strong style={{ color: "#374151" }}>{formatMs(dwellMs)}</strong> 경과
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 22 }}>
        {[
          { label: "이동거리", val: sessionGpsDist != null && sessionGpsDist > 0 ? `${sessionGpsDist.toFixed(2)} km` : `${(data.총거리 || 0).toFixed(2)} km` },
          { label: "근무시간", val: sessionWorkMs != null && sessionWorkMs > 0 ? formatMs(sessionWorkMs) : (sessionIsActive ? formatMs(Date.now() - (resolveTs(data.workStartAt)?.getTime()||Date.now())) : formatMinutes(data.근무시간)) },
          { label: "접속상태", val: data.active ? "접속중" : "미접속", color: data.active ? "#10b981" : "#9ca3af" },
          data.location ? { label: "현재 좌표", val: `${data.location.lat.toFixed(4)}, ${data.location.lng.toFixed(4)}` } : null,
        ].filter(Boolean).map(({ label, val, color }) => (
          <div key={label} style={{ background: "#f8f9fb", borderRadius: 9, padding: "13px 15px", border: "1px solid #eaecf0" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", margin: "0 0 6px" }}>{label}</p>
            <p style={{ fontSize: 17, fontWeight: 800, color: color || NAVY, margin: 0 }}>{val}</p>
          </div>
        ))}
      </div>

      {/* 출근지 / 도착지 — 지입차는 고정 노선이 없어 반경 설정 자체가 필요 없다 */}
      {data.등급 !== "지입" && (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          {
            label: "출근지",
            loc: checkInLoc,
            defaultLoc: companyDefaultLoc,
            defaultLabel: "회사 기본 출근지",
            onSet: onSetCheckInLoc,
            onClear: checkInLoc ? onClearCheckInLoc : null,
          },
          {
            label: "도착지",
            loc: dropLoc,
            defaultLoc: null,
            defaultLabel: null,
            onSet: onSetDropLoc,
            onClear: dropLoc ? onClearDropLoc : null,
          },
        ].map(({ label, loc, defaultLoc, defaultLabel, onSet, onClear }) => (
          <div key={label}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase" }}>{label}</span>
              <div style={{ display: "flex", gap: 5 }}>
                {onClear && (
                  <button onClick={onClear} style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid #e5e7eb", background: "white", color: "#9ca3af", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>해제</button>
                )}
                {onSet && (
                  <button onClick={onSet} style={{ padding: "2px 8px", borderRadius: 5, border: `1px solid ${NAVY}`, background: "white", color: NAVY, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{loc ? "수정" : "설정"}</button>
                )}
              </div>
            </div>
            {loc ? (
              <div style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc.name}</div>
                <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</div>
              </div>
            ) : defaultLoc ? (
              <div style={{ background: "#f8f9fb", border: "1px dashed #d1d5db", borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 1 }}>{defaultLabel}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{defaultLoc.name}</div>
              </div>
            ) : (
              <div style={{ background: "#f8f9fb", border: "1px dashed #d1d5db", borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ fontSize: 14, color: "#9ca3af" }}>미설정</div>
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {/* Log history */}
      {logs.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#6b7280", letterSpacing: ".09em", textTransform: "uppercase", margin: 0 }}>상태 이력 (이동 동선)</p>
            {onDeleteLogs && (
              <button
                onClick={onDeleteLogs}
                title="이력 삭제"
                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #fca5a5", borderRadius: 7, background: "white", cursor: "pointer", color: "#ef4444", padding: 0, flexShrink: 0 }}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2" strokeLinecap="round"/></svg>
              </button>
            )}
          </div>
          <div style={{ maxHeight: 250, overflowY: "auto" }}>
            {logs.map((log, i) => {
              const nextLog = logs[i + 1];
              const logTs = resolveTs(log.timestamp);
              const nextTs = resolveTs(nextLog?.timestamp);
              const duration = logTs && nextTs ? logTs.getTime() - nextTs.getTime()
                : i === 0 && logTs ? Date.now() - logTs.getTime() : null;
              const color = STATUS_COLORS[log.status] || "#9ca3af";
              return (
                <div
                  key={log.id}
                  onClick={() => log.location?.lat != null && onFocusMap && onFocusMap(log.location)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    paddingBottom: 11, marginBottom: 11,
                    borderBottom: i < logs.length - 1 ? "1px solid #f0f2f5" : "none",
                    cursor: log.location?.lat != null && onFocusMap ? "pointer" : "default",
                    borderRadius: 6, padding: "4px 4px 11px",
                  }}
                  onMouseEnter={e => { if (log.location?.lat != null && onFocusMap) e.currentTarget.style.background = "#f8f9fb"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                >
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#1B2B4B" }}>{log.status}</span>
                      {duration !== null && duration > 60000 && (
                        <span style={{ fontSize: 14, color: "#4b5563", fontWeight: 600 }}>{formatMs(duration)} 체류</span>
                      )}
                    </div>
                    {log.location?.lat != null && (
                      <div style={{ fontSize: 14, color: "#6b7280", marginTop: 2 }}>
                        {log.location.lat.toFixed(5)}, {log.location.lng.toFixed(5)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 14, color: "#4b5563", flexShrink: 0, fontWeight: 700, whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── RegistrationTab ─────────────────────────────────────────────────────────

function RegistrationTab({ usersMap, myCompanyName }) {
  const [approvingId, setApprovingId] = useState(null);

  const driverList = useMemo(() => {
    return Object.entries(usersMap)
      .filter(([, u]) => !myCompanyName || !u.companyName || u.companyName === myCompanyName)
      .map(([uid, u]) => ({ uid, ...u }))
      .sort((a, b) => {
        if (a.approved !== b.approved) return a.approved ? 1 : -1;
        const at = resolveTs(b.createdAt)?.getTime() || 0;
        const bt = resolveTs(a.createdAt)?.getTime() || 0;
        return at - bt;
      });
  }, [usersMap]);

  const pending = driverList.filter(d => !d.approved);
  const approved = driverList.filter(d => d.approved);

  const handleApprove = async (uid, doApprove) => {
    if (approvingId) return;
    setApprovingId(uid);
    try {
      await updateDoc(doc(db, "users", uid), { approved: doApprove });
      try { await updateDoc(doc(db, "drivers", uid), { approved: doApprove }); } catch (_) {}
    } catch (e) {
      console.error("approve error:", e);
    } finally {
      setApprovingId(null);
    }
  };

  const DriverRow = ({ d, canApprove }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 0", borderBottom: "1px solid #f0f2f5", flexWrap: "wrap" }}>
      <div style={{ width: 9, height: 9, borderRadius: "50%", background: d.approved ? "#10b981" : "#f59e0b", flexShrink: 0 }} />
      <div style={{ minWidth: 90, flex: "0 0 auto" }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>{d.name || "-"}</div>
        <div style={{ fontSize: 15, color: "#374151", marginTop: 2, fontWeight: 700, letterSpacing: "0.04em" }}>{d.carNo || "-"}</div>
      </div>
      <span style={{ fontSize: 15, color: "#374151", padding: "3px 10px", border: "1px solid #e5e7eb", borderRadius: 99, background: "#fafafa", flexShrink: 0 }}>
        {d.vehicleType || "-"}
      </span>
      {d.companyName && (
        <span style={{ fontSize: 14, color: "#6b7280", padding: "3px 10px", border: "1px solid #e5e7eb", borderRadius: 99, background: "#f9fafb", flexShrink: 0 }}>
          {d.companyName}
        </span>
      )}
      <div style={{ fontSize: 16, color: "#374151", flex: 1, minWidth: 110 }}>{d.phone ? formatPhone(d.phone) : "-"}</div>
      <div style={{ fontSize: 15, color: "#9ca3af", flexShrink: 0 }}>{d.createdAt ? formatDate(d.createdAt) : "-"}</div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {canApprove ? (
          <>
            <button
              onClick={() => handleApprove(d.uid, true)}
              disabled={approvingId === d.uid}
              style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: NAVY, color: "white", fontSize: 16, fontWeight: 700, cursor: approvingId === d.uid ? "not-allowed" : "pointer", opacity: approvingId === d.uid ? 0.6 : 1 }}
            >
              {approvingId === d.uid ? "처리중..." : "승인"}
            </button>
            <button
              onClick={() => handleApprove(d.uid, false)}
              disabled={!!approvingId}
              style={{ padding: "7px 15px", borderRadius: 8, border: "1px solid #fca5a5", background: "white", color: "#dc2626", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
            >
              거절
            </button>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 15, color: "#10b981", fontWeight: 700, background: "#d1fae5", padding: "3px 11px", borderRadius: 99 }}>승인됨</span>
            <button
              onClick={() => handleApprove(d.uid, false)}
              disabled={!!approvingId}
              style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid #e5e7eb", background: "white", color: "#9ca3af", fontSize: 15, cursor: "pointer" }}
            >
              취소
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {pending.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "20px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#f59e0b" }} />
            <span style={{ fontSize: 17, fontWeight: 800, color: "#92400e" }}>가입 승인 대기 ({pending.length}명)</span>
          </div>
          {pending.map(d => <DriverRow key={d.uid} d={d} canApprove={true} />)}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#10b981" }} />
          <span style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>등록 기사 ({approved.length}명)</span>
        </div>
        {approved.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: "#9ca3af", fontSize: 16 }}>승인된 기사가 없습니다</div>
        ) : (
          approved.map(d => <DriverRow key={d.uid} d={d} canApprove={false} />)
        )}
      </div>
    </div>
  );
}

// ─── HistoryTab ──────────────────────────────────────────────────────────────

// ─── 주소 축약 유틸 ───────────────────────────────────────────────────────────
// "충북 청주시 서원구 2순환로1814번길87(장성동)" → "충북청주" 처럼 시/도 + 시/군/구
// 수준으로만 줄여서, 관제 카드에서 전체 지번주소 대신 한눈에 보이는 대략적 위치로 쓴다.
const PROVINCE_ABBR = {
  "서울특별시": "서울", "서울시": "서울", "서울": "서울",
  "부산광역시": "부산", "부산시": "부산", "부산": "부산",
  "대구광역시": "대구", "대구시": "대구", "대구": "대구",
  "인천광역시": "인천", "인천시": "인천", "인천": "인천",
  "광주광역시": "광주", "광주시": "광주", "광주": "광주",
  "대전광역시": "대전", "대전시": "대전", "대전": "대전",
  "울산광역시": "울산", "울산시": "울산", "울산": "울산",
  "세종특별자치시": "세종", "세종시": "세종", "세종": "세종",
  "경기도": "경기", "경기": "경기",
  "강원특별자치도": "강원", "강원도": "강원", "강원": "강원",
  "충청북도": "충북", "충북": "충북",
  "충청남도": "충남", "충남": "충남",
  "전북특별자치도": "전북", "전라북도": "전북", "전북": "전북",
  "전라남도": "전남", "전남": "전남",
  "경상북도": "경북", "경북": "경북",
  "경상남도": "경남", "경남": "경남",
  "제주특별자치도": "제주", "제주도": "제주", "제주": "제주",
};

function abbrevAddr(addr) {
  const s = String(addr || "").trim();
  if (!s) return "";
  const tokens = s.split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  const t0 = tokens[0];
  const prov = PROVINCE_ABBR[t0] || (t0.length > 2 ? t0.slice(0, 2) : t0);
  const t1 = tokens[1] || "";
  // "청주시"→"청주"처럼 "시"만 줄인다. "서구"/"남동구"/"○○군"처럼 구/군으로 끝나는
  // 이름은 그 글자를 지우면(예: "서") 오히려 뜻이 불분명해지므로 그대로 둔다
  // (예: "인천 서구" → "인천서구", "충북 청주시" → "충북청주").
  const city = t1
    .replace(/(특별자치시|특별자치도|광역시|자치시)$/, "")
    .replace(/시$/, "");
  return city ? `${prov}${city}` : prov;
}

// ─── 요일 유틸 ────────────────────────────────────────────────────────────────
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

// ─── 오더 진행상태 판정 ────────────────────────────────────────────────────────
// 이 앱의 오더 데이터에는 "상차중/운송중" 같은 실시간 상태 필드가 없으므로(그건
// 기사용 GPS 앱 연동이 필요한 별도 체계), 선택한 날짜와 상/하차 예정시간을 기준으로
// 예정/운송중/완료를 근사 계산한다. 배차관리에서 오더를 등록/수정하는 즉시
// dispatchData가 실시간으로 갱신되므로 이 판정도 그때그때 다시 계산된다.
// 상태는 색깔이 아니라 작은 점(dot) 하나로만 구분하고, 글자색은 전부 동일한 짙은
// 회색으로 통일한다 — 예전처럼 상태마다 배경색이 있는 알록달록한 뱃지를 쓰면 카드가
// 늘어날수록 화면이 산만해져서, 점 색깔만 옅게 다르고 나머지는 차분한 단색으로 맞췄다.
const PROG_META = {
  scheduled: { label: "상차 예정", dot: "#94a3b8" },
  progress: { label: "운송중", dot: "#1B2B4B" },
  done: { label: "완료", dot: "#16a34a" },
};
// ⭐ 지입 기사 오더 — 개별 오더 행의 "상태" 칸도 시간 추정이 아니라 실제
// 기사확인상태로 보여준다(완료 처리해도 "운송중"으로 계속 보이던 버그 수정).
const FLEET_CHECK_PROG_META = {
  대기: { label: "확인대기", dot: "#f59e0b" },
  수락: { label: "운송중", dot: "#1B2B4B" },
  완료: { label: "운송완료", dot: "#16a34a" },
  거절: { label: "거절", dot: "#ef4444" },
};
// ⭐ 사용자 요청 — 카드 어딘가에 묻혀 있던 "배차대기" 표시를 차량번호 옆 전용
// 컬럼(배차상태)으로 옮기고, 운송중/배차완료까지 상황별로 구분해 보여준다.
function driverDispatchStatus(orders, todayStr, live) {
  // ⭐ 사용자 요청 — 휴차 처리한 기사는 배차 여부와 무관하게 "휴차"로 보여야 한다.
  if (live?.status === "휴차" || live?.mainStatus === "휴차") {
    return { label: "휴차", bg: "#e5e7eb", color: "#374151" };
  }
  if (!orders.length) return { label: "배차대기", bg: "#fef3c7", color: "#92400e" };
  // ⭐ 지입 기사 오더수락 플로우 — 기사확인상태가 있으면(차량번호를 지입 기사에게
  // 배정한 오더) 시간 추정 대신 실제 수락 여부로 상태를 보여준다.
  const checkStates = orders.map(r => r.기사확인상태).filter(Boolean);
  if (checkStates.includes("수락")) return { label: "운송중", bg: "#dbeafe", color: "#1e40af" };
  if (checkStates.includes("대기")) return { label: "오더확인중", bg: "#fef3c7", color: "#92400e" };
  // ⭐ 버그수정 — "완료"/"거절" 상태를 전혀 체크하지 않아서, 배정된 오더가 전부
  // 운송완료(또는 거절)됐는데도 시간 기반 폴백으로 떨어져 "운송중"이 계속 떠 있었다.
  // 지입 기사는 오더를 다 마치면 다음 배차를 받을 수 있는 대기 상태로 봐야 한다.
  if (checkStates.length > 0 && checkStates.every(s => s === "완료" || s === "거절")) {
    return { label: "배차대기", bg: "#fef3c7", color: "#92400e" };
  }
  const progs = orders.map(r => computeOrderProgress(r, r.상차일, todayStr));
  if (progs.includes("progress")) return { label: "운송중", bg: "#dbeafe", color: "#1e40af" };
  if (progs.every(p => p === "done")) return { label: "배차완료", bg: "#dcfce7", color: "#166534" };
  return { label: "배차예정", bg: "#eef1f6", color: "#374151" };
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

// ─── 이동거리/예상시간 뱃지 ────────────────────────────────────────────────────
// ⭐ 버그수정 — 예전엔 직선거리*1.25 근사치를 썼는데, 강/산업단지 등으로 실제
// 도로가 크게 우회하는 구간은 오차가 너무 컸다(직선 3.4km인데 실도로 18km인
// 사례 보고됨). 배차등록 폼의 지도가 이미 쓰고 있는 실제 도로경로 API
// (tmap/routes, getDrivingRoute)로 통일해 정확한 거리/시간을 쓴다. 같은
// 주소쌍은 캐시하고, 요청은 순차 처리해 API 과호출을 막는다.
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
  if (!fromAddr || !toAddr) return <span style={{ fontSize: 14, color: "#d1d5db" }}>-</span>;
  if (info === undefined) return <span style={{ fontSize: 14, color: "#d1d5db" }}>계산중…</span>;
  if (!info) return <span style={{ fontSize: 14, color: "#d1d5db" }}>-</span>;
  const timeLabel = info.minutes >= 60 ? `${Math.floor(info.minutes / 60)}시간 ${info.minutes % 60}분` : `${info.minutes}분`;
  return (
    <span style={{ fontSize: 14, color: "#111827", fontWeight: 700, whiteSpace: "nowrap" }}>
      약 {info.km}km · {timeLabel}
    </span>
  );
}

// ─── 정보 라벨 필드 (작은 회색 라벨 + 짙은 값) ─────────────────────────────────
function InfoField({ label, value, children, mono }) {
  return (
    // ⭐ 사용자 요청 — 선이 없어 칸 사이 간격이 애매해 보였다. 왼쪽에 구분선 +
    // 여백을 줘서 각 항목이 딱 떨어져 보이게 하고, 라벨 글씨도 표 헤더(상태/
    // 거래처 등)와 비슷한 체감 크기로 키운다.
    <div style={{ minWidth: 0, paddingLeft: 14, borderLeft: "1px solid #e5e7eb" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      {/* ⭐ 사용자 피드백 — whiteSpace:nowrap + overflow:hidden 조합 때문에 칸이
          좁으면 값 끝이 그냥 잘려서 안 보였다(말줄임표도 없이). 줄바꿈을 허용해
          내용이 전부 보이게 바꾼다. */}
      <div style={{ fontSize: 15, fontWeight: 800, color: "#111827", fontFamily: mono ? "monospace" : undefined, wordBreak: "break-word" }}>
        {children != null ? children : (value || "-")}
      </div>
    </div>
  );
}

// ─── 실시간 위치 뱃지 ─────────────────────────────────────────────────────────
// 기사 앱(GPS)에 로그인해 승인된 기사만 위치 신호가 있다 — 그 외는 "위치 미연동"으로
// 명확히 구분해서, 신호가 없는 걸 오류로 오해하지 않게 한다.
function LiveLocationBadge({ live }) {
  const [addr, setAddr] = useState(null);
  useEffect(() => {
    if (live?.location?.lat != null) enqueueGeocode(live.location.lat, live.location.lng, setAddr);
    else setAddr(null);
  }, [live?.location?.lat, live?.location?.lng]);

  if (!live) return <span style={{ fontSize: 14, fontWeight: 700, color: "#c1c7d0" }}>위치 미연동</span>;
  if (!live.location) return <span style={{ fontSize: 14, fontWeight: 700, color: "#c1c7d0" }}>{live.active ? "위치 확인중" : "오프라인"}</span>;
  return (
    <span style={{ fontSize: 14, fontWeight: 700, color: "#1f2937" }}>
      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: live.active ? "#16a34a" : "#9ca3af", marginRight: 6 }} />
      {addr || "조회중…"}
      <span style={{ color: "#9ca3af", fontWeight: 500 }}> · {timeAgo(live.updatedAt)}</span>
    </span>
  );
}

// ─── 담당자 배지 + 위임 ─────────────────────────────────────────────────────
// 지입차 1대를 책임지는 배차자를 drivers/{id}.담당자에 저장해 보여준다. 위임
// 권한(관리자 이상)이 있는 사람에게만 변경 버튼을 노출하고, 눌렀을 때 같은
// 회사 배차자(staff) 목록에서 새 담당자를 고르는 작은 드롭다운을 연다.
function ManagerBadge({ driver, staff, canDelegate, onAssign }) {
  const [open, setOpen] = useState(false);
  const mgr = driver.담당자;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: mgr ? "#374151" : "#c1c7d0" }}>
        {mgr ? mgr.name : "담당자 미지정"}
      </span>
      {canDelegate && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
        >
          위임
        </button>
      )}
      {/* ⭐ 버그수정 — 예전엔 position:absolute로 버튼 바로 밑에 띄웠는데, 이 카드의
          바깥 div가 둥근 모서리 때문에 overflow:hidden이라 메뉴가 잘려서(화면엔
          안 보이게) "눌러도 아무 반응 없음"처럼 보였다. 화면 중앙 모달로 바꿔
          어떤 카드에서 눌러도 항상 보이게 한다. */}
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 10050, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 12, width: 280, maxHeight: "70vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,.3)" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f2f5", fontSize: 15, fontWeight: 800, color: NAVY }}>
              {driver.이름} 담당자 위임
            </div>
            <div style={{ padding: 6 }}>
              {staff.length === 0 && (
                <div style={{ padding: "16px 12px", fontSize: 13, color: "#9ca3af", textAlign: "center" }}>배차자가 없습니다</div>
              )}
              {staff.map(s => (
                <div key={s.id}
                  onClick={() => { onAssign(driver.id, s); setOpen(false); }}
                  style={{ padding: "10px 12px", borderRadius: 8, fontSize: 14, fontWeight: mgr?.uid === s.id ? 800 : 600, color: mgr?.uid === s.id ? NAVY : "#374151", cursor: "pointer", background: mgr?.uid === s.id ? "#eef1f6" : "transparent" }}
                >
                  {s.name}
                </div>
              ))}
              {mgr && (
                <div
                  onClick={() => { onAssign(driver.id, null); setOpen(false); }}
                  style={{ padding: "10px 12px", borderRadius: 8, fontSize: 13, color: "#ef4444", cursor: "pointer", borderTop: "1px solid #f3f4f6", marginTop: 4 }}
                >
                  담당자 해제
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 기사에게 오더 요약 전달 (SMS/카카오톡용 텍스트) ───────────────────────────
function buildDriverSummaryText(driver, orders, selectedDate, rangeEndDate) {
  const rangeLabel = rangeEndDate && rangeEndDate !== selectedDate ? `${selectedDate} ~ ${rangeEndDate}` : selectedDate;
  const lines = [`[${rangeLabel} 배차 안내]`, `기사: ${driver.이름} (${driver.차량번호})`, ""];
  orders.forEach((r, i) => {
    const from = r.상차지명 || abbrevAddr(r.상차지주소) || "-";
    const to = r.하차지명 || abbrevAddr(r.하차지주소) || "-";
    lines.push(`${i + 1}. ${from} → ${to}`);
    lines.push(`   상차 ${r.상차시간 || "즉시"} / 하차 ${r.하차시간 || "즉시"}${r.하차일 && r.하차일 !== r.상차일 ? `(${r.하차일})` : ""}`);
    if (r.거래처명) lines.push(`   거래처: ${r.거래처명}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

function handleSendToDriver(driver, orders, selectedDate, rangeEndDate) {
  const text = buildDriverSummaryText(driver, orders, selectedDate, rangeEndDate);
  try { navigator.clipboard?.writeText(text); } catch {}
  const phone = (driver.전화번호 || "").replace(/[^\d]/g, "");
  if (phone && phone.length >= 9) {
    window.location.href = `sms:${phone}?body=${encodeURIComponent(text)}`;
  } else {
    window.alert("배차 내용이 클립보드에 복사되었습니다.\n카카오톡/문자에 붙여넣기 하세요.");
  }
}

// ─── 오더 우클릭 메뉴 — "기사복사" 텍스트 생성 ────────────────────────────────
// ⭐ 사용자 요청 — DispatchApp.jsx "기사복사 선택 모달"(복사 방식 선택)과 완전동일한
// 포맷으로 노선표 오더 한 건을 복사할 수 있어야 한다. 이 화면엔 경유지(상차/하차
// 경유목록)·거래처(mergedClients) 데이터가 없어 그 부분만 제외하고, 경유지가 없는
// (가장 흔한) 건에 대해선 원본과 동일한 텍스트가 나오도록 포팅했다.
function parseWon(v) {
  return Number(String(v || "0").replace(/[^\d]/g, "")) || 0;
}

function getYoil(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][date.getDay()];
}

// kg/g으로 입력해도 항상 톤 단위 문자열로 통일 (DispatchApp.jsx toTonUnit과 동일)
function toTonUnit(v = "") {
  const str = String(v ?? "").trim();
  if (!str) return "";
  const m = str.match(/^([\d.]+)\s*(kg|g|톤|ton|t)?$/i);
  if (!m) return str;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return str;
  const unit = (m[2] || "톤").toLowerCase();
  let tons;
  if (unit === "kg") tons = num / 1000;
  else if (unit === "g") tons = num / 1000000;
  else tons = num;
  let formatted = tons.toFixed(3).replace(/\.?0+$/, "");
  if (formatted === "" || formatted === "-") formatted = "0";
  return `${formatted}톤`;
}

function buildContactLine(name, phone) {
  if (!name && !phone) return "";
  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim();
  if (cleanPhone) return `담당자 : ${cleanName} (${formatPhone(cleanPhone)})`;
  return `담당자 : ${cleanName}`;
}

// 기사전달용 업로드 링크 — DispatchApp.jsx buildShortUploadUrl과 동일하게 /u/{code}로
// 줄여 shortLinks에 저장한다. 토큰이 없거나 잠겨있으면 새로 발급.
function buildFleetUploadUrl(order) {
  let token = order.업로드토큰;
  if (!token || order.업로드잠금) {
    token = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    updateDoc(doc(db, order.__col || "orders", order._id), { 업로드토큰: token, 업로드잠금: false }).catch(() => {});
  }
  const code = String(token || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || Math.random().toString(36).slice(2, 10);
  setDoc(doc(db, "shortLinks", code), { id: order._id, t: token, createdAt: serverTimestamp() }, { merge: true }).catch(() => {});
  return `${window.location.origin}/u/${code}`;
}

function buildOrderCopyText(order, driver, mode) {
  const r = order;
  const plate = driver?.차량번호 || r.차량번호 || "";
  const name = driver?.이름 || r.이름 || "";
  const phone = formatPhone(driver?.전화번호 || r.전화번호 || "");
  const fare = parseWon(r.청구운임);
  const pay = r.지급방식 || "";
  const payLabel = pay === "계산서" ? "부가세별도" : (pay === "선불" || pay === "착불") ? pay : "";
  const yoil = getYoil(r.상차일 || "");

  if (mode === "basic") return `${plate} ${name} ${phone}`;
  if (mode === "fare") {
    return `${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
  }

  // 익일/지정일 하차 판별 (전체 상세 · 기사 전달용 공통)
  const pickupTime = (r.상차시간 || "").trim() || "즉시";
  const dropTimeRaw = (r.하차시간 || "").trim() || "즉시";
  let dateNotice = "";
  let dropTimeText = dropTimeRaw;
  if (r.상차일 && r.하차일) {
    const s = new Date(r.상차일), e = new Date(r.하차일);
    const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    const diffDays = Math.round((e0 - s0) / (1000 * 60 * 60 * 24));
    const sm = s.getMonth() + 1, sd = s.getDate(), em = e.getMonth() + 1, ed = e.getDate();
    if (diffDays === 1) {
      dateNotice = `익일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
      dropTimeText = `${em}/${ed} ${dropTimeRaw}`;
    } else if (diffDays >= 2) {
      dateNotice = `지정일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
      dropTimeText = `${em}/${ed} ${dropTimeRaw}`;
    }
  }

  const pCon = buildContactLine(r.상차지담당자, r.상차지담당자번호);
  const dCon = buildContactLine(r.하차지담당자, r.하차지담당자번호);
  const totTon = r.차량톤수 ? toTonUnit(r.차량톤수) : "-";
  const totCargo = (r.화물내용 && r.화물내용 !== "없음") ? r.화물내용 : "";

  if (mode === "full") {
    const fanOut = `상차지 : ${r.상차지명 || "-"}
${r.상차지주소 || "-"}${pCon ? `\n${pCon}` : ""}
상차시간 : ${pickupTime}${r.상차시간기준 ? ` (${r.상차시간기준})` : ""}
상차방법 : ${r.상차방법 || "-"}

하차지 : ${r.하차지명 || "-"}
${r.하차지주소 || "-"}${dCon ? `\n${dCon}` : ""}
하차시간 : ${dropTimeText}${r.하차시간기준 ? ` (${r.하차시간기준})` : ""}
하차방법 : ${r.하차방법 || "-"}`;

    return `${dateNotice}${r.상차일 || ""} ${yoil}${r.운행유형 === "왕복" ? "\n[왕복운행]" : ""}

${fanOut}

중량 : ${totTon}${totCargo ? ` / ${totCargo}` : ""} ${r.차량종류 || ""}
결제방법 : ${r.지급방식 || "-"}

${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
  }

  if (mode === "driver") {
    const isCold = /냉장|냉동/.test(r.차량종류 || "");
    const dateText = `${r.상차일 || ""} ${yoil}`;
    const driverNote = (r.전달사항 || "").trim();
    const driverNoteText = driverNote ? `\n\n📢 전달사항\n${driverNote}` : "";
    const uploadUrl = buildFleetUploadUrl(r);
    const companyName = (localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "").trim() || "-";

    const fanOutD = `상차 : ${r.상차지명 || "-"} / ${r.상차시간 || "즉시"}${r.상차시간기준 ? ` (${r.상차시간기준})` : ""}
${r.상차지주소 || ""}${pCon ? `\n${pCon}` : ""}
상차방법 : ${r.상차방법 || "-"}

하차 : ${r.하차지명 || "-"} / ${dropTimeText}${r.하차시간기준 ? ` (${r.하차시간기준})` : ""}
${r.하차지주소 || ""}${dCon ? `\n${dCon}` : ""}
하차방법 : ${r.하차방법 || "-"}`;

    return `[파렛전표/거래명세서 업로드]
(파렛전표/명세서없으면 미업로드)
👇👇👇👇👇👇👇👇👇👇👇👇
${uploadUrl}

${isCold ? "*냉장(0~10도유지),냉동(-18도이하)*\n" : "*관련 서류 업로드 필수*\n"}${r.지급방식 === "착불" ? "*착불건입니다*" : r.지급방식 === "선불" ? "*선불건입니다*" : "*결제일 링크 참고하세요*"}
${dateNotice}${dateText}${r.운행유형 === "왕복" ? "\n[왕복운행]" : ""}

${fanOutD}

화물 : ${totTon}${totCargo ? ` / ${totCargo}` : ""} ${r.차량종류 || "-"}
결제방법 : ${r.지급방식 === "계산서" ? `계산서(${r.배차방식 === "24시" ? "24시발행" : companyName})` : (r.지급방식 || "-")}${driverNoteText}

※ 인수증(파렛전표) 서명 받은 후 업로드필수
KPP/아주파렛트 상차시 각각 전표업로드 필수
${isCold ? "※ 거래명세서/타코메타 기록지 함께 촬영업로드" : "※ 거래명세서 서류 업로드"}
※ 서류/전표 없는 건이면 업로드 하지마세요
※ 미업로드 시 운임 지급 지연될 수 있습니다`.replace(/\n{3,}/g, "\n\n").trim();
  }

  return "";
}

// ─── 오더 재발송 — 기사확인상태:"대기"를 null→"대기"로 두 번 빠르게 써서
// Cloud Function(notifyFleetDriverNewOrder)의 "새로 대기로 바뀐 경우만" 가드를
// 다시 통과시킨다(functions/index.js 561행). 차량번호는 그대로 두므로 다른
// 안전망 로직과는 충돌하지 않는다 — 순수 클라이언트 처리로 충분하다.
async function resendOrderToDriver(order, driver) {
  const col = order.__col || "orders";
  try {
    await updateDoc(doc(db, col, order._id), { 기사확인상태: null });
    await new Promise((res) => setTimeout(res, 400));
    await updateDoc(doc(db, col, order._id), { 기사확인상태: "대기" });
    addDoc(collection(db, "driver_notifications"), {
      driverId: driver.id,
      type: "new_order",
      orderId: order._id,
      title: "배차오더가 도착했습니다",
      body: `${order.거래처명 || ""} ${order.상차지명 || "-"} → ${order.하차지명 || "-"}`,
      createdAt: serverTimestamp(),
      read: false,
    }).catch(() => {});
    window.alert("기사에게 오더를 다시 전송했습니다.");
  } catch {
    window.alert("재발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

// ─── 우클릭 컨텍스트 메뉴 ─────────────────────────────────────────────────────
// position:fixed로 클릭 좌표에 띄우고, 바깥 클릭/ESC로 닫는다. ManagerBadge의
// 드롭다운(흰 배경+그림자+네이비 포인트)과 같은 톤으로 맞춘다.
function OrderContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const W = 210, H = items.length * 36 + 12;
    let left = x, top = y;
    if (left + W > window.innerWidth) left = Math.max(8, window.innerWidth - W - 8);
    if (top + H > window.innerHeight) top = Math.max(8, window.innerHeight - H - 8);
    setPos({ left, top });
  }, [x, y, items.length]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed", left: pos.left, top: pos.top, zIndex: 100000,
        background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb",
        boxShadow: "0 10px 40px rgba(0,0,0,.25)", padding: 6, minWidth: 190,
      }}
    >
      {items.map((it, i) => (
        <div
          key={i}
          onClick={() => { if (it.disabled) return; onClose(); it.onClick(); }}
          title={it.disabled ? it.disabledReason : undefined}
          style={{
            padding: "8px 12px", borderRadius: 7, fontSize: 13, fontWeight: 700,
            cursor: it.disabled ? "not-allowed" : "pointer",
            color: it.disabled ? "#c1c7d0" : (it.danger ? "#b91c1c" : "#374151"),
            background: "transparent", transition: "background .12s",
          }}
          onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = "#eef1f6"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {it.label}
        </div>
      ))}
    </div>
  );
}

// ─── 오더 수정 모달 ───────────────────────────────────────────────────────────
// ⭐ 사용자 요청 — DispatchApp.jsx의 "오더복사/수정 패널"은 이 화면과 다른 파일/
// state에 묶여있어 그대로 재사용하기 어렵다(editTarget/copyTarget이 DispatchApp
// 내부 state). 그 대신 자주 고치는 핵심 필드만 담은 가벼운 자체 수정 모달로
// 구현 — 저장은 이 화면 다른 쓰기들과 동일하게 r.__col 기준 updateDoc 직접 호출.
function OrderEditModal({ order, onClose }) {
  const [form, setForm] = useState(() => ({
    상차지명: order.상차지명 || "",
    상차지주소: order.상차지주소 || "",
    하차지명: order.하차지명 || "",
    하차지주소: order.하차지주소 || "",
    상차일: order.상차일 || "",
    상차시간: order.상차시간 || "",
    하차일: order.하차일 || "",
    하차시간: order.하차시간 || "",
    화물내용: order.화물내용 || "",
    차량톤수: order.차량톤수 || "",
    차량종류: order.차량종류 || "",
    기사운임: order.기사운임 ? String(order.기사운임).replace(/[^\d]/g, "") : "",
    전달사항: order.전달사항 || "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const patch = { ...form, 기사운임: form.기사운임 ? Number(form.기사운임) : 0 };
      await updateDoc(doc(db, order.__col || "orders", order._id), patch);
      onClose();
    } catch {
      window.alert("저장에 실패했습니다.");
      setSaving(false);
    }
  };

  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, color: "#111827", boxSizing: "border-box" };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 4, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 100010, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, width: "min(560px, 100%)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 10px 40px rgba(0,0,0,.3)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: NAVY, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>오더 수정</span>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={labelStyle}>상차지명</label><input style={inputStyle} value={form.상차지명} onChange={set("상차지명")} /></div>
          <div><label style={labelStyle}>하차지명</label><input style={inputStyle} value={form.하차지명} onChange={set("하차지명")} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>상차지 주소</label><input style={inputStyle} value={form.상차지주소} onChange={set("상차지주소")} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>하차지 주소</label><input style={inputStyle} value={form.하차지주소} onChange={set("하차지주소")} /></div>
          <div><label style={labelStyle}>상차일</label><CustomDatePicker value={form.상차일} onChange={(e) => setForm((f) => ({ ...f, 상차일: e.target.value }))} /></div>
          <div><label style={labelStyle}>상차시간</label><input style={inputStyle} value={form.상차시간} onChange={set("상차시간")} placeholder="즉시" /></div>
          <div><label style={labelStyle}>하차일</label><CustomDatePicker value={form.하차일} onChange={(e) => setForm((f) => ({ ...f, 하차일: e.target.value }))} /></div>
          <div><label style={labelStyle}>하차시간</label><input style={inputStyle} value={form.하차시간} onChange={set("하차시간")} placeholder="즉시" /></div>
          <div><label style={labelStyle}>화물내용</label><input style={inputStyle} value={form.화물내용} onChange={set("화물내용")} /></div>
          <div><label style={labelStyle}>차량톤수</label><input style={inputStyle} value={form.차량톤수} onChange={set("차량톤수")} /></div>
          <div><label style={labelStyle}>차량종류</label><input style={inputStyle} value={form.차량종류} onChange={set("차량종류")} /></div>
          <div><label style={labelStyle}>기사운임</label><input style={inputStyle} value={form.기사운임} onChange={(e) => setForm((f) => ({ ...f, 기사운임: e.target.value.replace(/[^\d]/g, "") }))} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={labelStyle}>메모(전달사항)</label><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.전달사항} onChange={set("전달사항")} /></div>
        </div>
        <div style={{ padding: "0 18px 18px", display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>취소</button>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: NAVY, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? .6 : 1 }}>{saving ? "저장중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── 기사복사 모달 ────────────────────────────────────────────────────────────
// ⭐ 사용자 요청 — DispatchApp.jsx "복사 방식 선택"(기사복사) 팝업과 완전동일한
// 옵션 구성(차량/기사/연락처, 운임포함, 전체상세, 기사전달용)을 노선표 오더 한
// 건에 대해 그대로 제공. "기사 전달용"은 원본처럼 전송 전 문자 확인 팝업을 띄운다.
function OrderCopyModal({ order, driver, onClose }) {
  const [smsConfirm, setSmsConfirm] = useState(null);

  const doCopy = (mode) => {
    const text = buildOrderCopyText(order, driver, mode);
    try { navigator.clipboard?.writeText(text); } catch {}
    if (mode === "driver") {
      setSmsConfirm({ phone: driver?.전화번호 || "", body: text });
    } else {
      onClose();
      window.alert("복사되었습니다. 메신저에 붙여넣기 하세요.");
    }
  };

  if (smsConfirm) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100020, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#fff", borderRadius: 16, width: 360, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.2)" }}>
          <div style={{ background: NAVY, padding: "14px 18px" }}>
            <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 15, margin: 0 }}>문자 메시지 전송</h3>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ background: "#f8f9fb", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#374151" }}>
              <span style={{ fontWeight: 700, color: NAVY }}>{smsConfirm.phone ? formatPhone(smsConfirm.phone) : "번호 없음"}</span>으로 문자를 전송하시겠습니까?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>취소</button>
              <button
                onClick={() => {
                  const phone = (smsConfirm.phone || "").replace(/[^\d]/g, "");
                  if (phone) window.location.href = `sms:${phone}?body=${encodeURIComponent(smsConfirm.body)}`;
                  onClose();
                }}
                style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: NAVY, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >문자 보내기</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100020, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: 320, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: NAVY, padding: "14px 18px" }}>
          <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 15, margin: 0 }}>복사 방식 선택</h3>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => doCopy("basic")} style={{ padding: "10px 0", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>차량번호 / 기사명 / 전화번호</button>
          <button onClick={() => doCopy("fare")} style={{ padding: "10px 0", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>운임 포함 (부가세/선불/착불)</button>
          <button onClick={() => doCopy("full")} style={{ padding: "10px 0", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>전체 상세 (상하차 + 화물정보 + 차량)</button>
          <button onClick={() => doCopy("driver")} style={{ padding: "10px 0", borderRadius: 10, border: "none", background: NAVY, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>기사 전달용 (상세 + 전달메시지)</button>
          <button onClick={onClose} style={{ padding: "8px 0", border: "none", background: "transparent", color: "#9ca3af", fontSize: 12, cursor: "pointer", marginTop: 2 }}>취소</button>
        </div>
      </div>
    </div>
  );
}

// ─── 기사별 노선 카드 ─────────────────────────────────────────────────────────

const ROUTE_COLS = ["순번", "상태", "거래처", "상차지", "하차지", "상차", "하차", "화물정보", "이동정보", "기사운임", "배차담당자", "오더확인", "첨부"];
// ⭐ 지입 기사 오더수락/거절 플로우 — 기사확인상태 값을 관리자 화면 배지로 표시.
// ⭐ 사용자 요청 — 뱃지 색이 알록달록했다. 프로그램 색감(네이비+그레이, 거절만
// 포인트로 빨강 테두리)에 맞춰 차분하게 다시 설계.
const ORDER_CHECK_META = {
  대기: { label: "확인대기", bg: "#eef1f6", color: NAVY, border: "1px solid #d7deea" },
  수락: { label: "승인", bg: NAVY, color: "#fff", border: "1px solid " + NAVY },
  거절: { label: "거절", bg: "#fff", color: "#b91c1c", border: "1px solid #fca5a5" },
  완료: { label: "운송완료", bg: "#eef1f6", color: NAVY, border: "1px solid #c7d2e3" },
};

// ⭐ 사용자 요청 — 지입 기사가 "오늘 사진 전송현황"에서 올린 상차/하차완료 사진을
// 4/5파트 배차현황의 첨부 아이콘과 동일하게 지입차관리 노선표에서도 볼 수 있어야
// 한다. 같은 orders/{id}/attachments 서브컬렉션을 보는 간단한 뷰어(회전/재업로드
// 등 고급 기능은 빼고 보기 전용으로).
function FleetAttachButton({ orderId, col = "orders", attachCount = 0 }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition mx-auto"
        title="첨부파일 보기"
        style={{ border: "none", background: "transparent", cursor: "pointer" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={attachCount > 0 ? "#059669" : "#cbd5e1"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        {attachCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {attachCount}
          </span>
        )}
      </button>
      {open && <FleetAttachViewer orderId={orderId} col={col} onClose={() => setOpen(false)} />}
    </>
  );
}

function FleetAttachViewer({ orderId, col = "orders", onClose }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!orderId) return;
    return onSnapshot(collection(db, col, orderId, "attachments"), (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
  }, [orderId, col]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "min(640px, 100%)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,.3)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #f0f2f5" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>첨부파일 ({items.length}장)</span>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, color: "#9ca3af", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {items.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#9ca3af", fontSize: 14, padding: "30px 0" }}>첨부된 사진이 없습니다.</div>
          ) : items.map(it => (
            <a key={it.id} href={it.url} target="_blank" rel="noreferrer" style={{ display: "block", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", textDecoration: "none" }}>
              <img src={it.url} alt={it.name} style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} />
              <div style={{ fontSize: 10, color: "#6b7280", padding: "5px 7px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// 오더를 등록/배차한 담당자 표시 — 3파트 등록폼과 동일한 우선순위로 폴백한다.
// ⭐ 사용자 요청 — 이름 필드가 하나도 없으면 마지막엔 이메일을 그대로 보여주고
// 있었다. staffByEmail(이메일→실명 매핑)이 있으면 이메일 대신 실명으로 바꿔 보여준다.
function creatorLabel(r, staffByEmail) {
  // ⭐ 사용자 요청 — 오더 등록 당시 실명(myRealName)이 비어있으면 createdByName에
  // 이메일이 그대로 저장돼버린 과거 데이터가 있다. 저장된 값이 이메일 모양이면
  // staffByEmail(이메일→실명)에서 실명을 다시 찾아 보여준다.
  const isEmailLike = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ""));
  const email = r?.createdByEmail || r?.createdBy || "";
  const stored = r?.등록자명 || r?.createdByName || r?.등록자 || "";
  const fromStaff = email && staffByEmail?.[email];
  if (stored && !isEmailLike(stored)) return stored;
  if (fromStaff && !isEmailLike(fromStaff)) return fromStaff;
  return stored || fromStaff || email || "-";
}

function DriverRouteCard({ driver, orders, selectedDate, rangeEndDate, isSingleDay = true, todayStr, isOffDay, live, onOpenDetail, staff, canDelegate, onAssignManager, index, staffByEmail }) {
  const first = orders[0];
  const last = orders[orders.length - 1];
  const hasConflict = isOffDay && orders.length > 0;
  // ⭐ 사용자 요청 — 오늘 운임 합계를 상세보기까지 안 들어가도 카드에서 바로 보이게.
  // 지입차는 우리가 기사에게 지급하는 "기사운임" 기준이어야 한다(청구운임은 화주에게
  // 받는 금액이라 기사 입장에선 의미가 다름).
  const fareSum = orders.reduce((s, r) => s + (Number(String(r.기사운임 || 0).replace(/[^\d]/g, "")) || 0), 0);

  // ⭐ 사용자 요청 — 오더 행 우클릭으로 경로보기/수정/재발송/문자메시지/기사복사를
  // 바로 할 수 있어야 한다.
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, order }
  const [routeMapOrder, setRouteMapOrder] = useState(null);
  const [editOrder, setEditOrder] = useState(null);
  const [copyOrder, setCopyOrder] = useState(null);

  const openRowMenu = (e, order) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, order });
  };

  const ctxItems = ctxMenu ? [
    { label: "경로보기 (거리·시간)", onClick: () => setRouteMapOrder(ctxMenu.order) },
    { label: "수정", onClick: () => setEditOrder(ctxMenu.order) },
    {
      label: "재발송",
      disabled: ctxMenu.order.기사확인상태 !== "대기",
      disabledReason: "확인대기 상태의 오더만 재발송할 수 있습니다.",
      onClick: () => resendOrderToDriver(ctxMenu.order, driver),
    },
    {
      label: "문자메시지",
      disabled: !driver.전화번호,
      disabledReason: "기사 연락처가 없습니다.",
      onClick: () => handleSendToDriver(driver, [ctxMenu.order], ctxMenu.order.상차일, ctxMenu.order.상차일),
    },
    { label: "기사복사", onClick: () => setCopyOrder(ctxMenu.order) },
  ] : [];

  return (
    <div style={{ background: "#fff", border: `1px solid ${hasConflict ? "#f59e0b" : "#e5e7eb"}`, borderRadius: 12, overflow: "hidden" }}>
      {/* 헤더: 기사 기본정보를 라벨 붙은 그리드로 — 값 글자는 짙은 색으로 가독성 확보 */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f0f2f5", display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", rowGap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 160 }}>
          {index != null && (
            <span style={{ fontSize: 13, fontWeight: 800, color: "#9ca3af", minWidth: 20, textAlign: "right", flexShrink: 0 }}>{index}</span>
          )}
          <div style={{ width: 36, height: 36, borderRadius: 9, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" fill="none" stroke="white" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" /></svg>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{driver.이름}</span>
              <span style={{ fontSize: 12, fontWeight: 800, padding: "1px 7px", borderRadius: 6, background: driver.등급 === "직영" ? NAVY : "#eef1f6", color: driver.등급 === "직영" ? "#fff" : "#374151" }}>{driver.등급}</span>
            </div>
          </div>
        </div>

        {/* ⭐ 사용자 요청 — "배차대기" 표시가 이름 옆에 묻혀 있었는데, 차량번호 옆에
            전용 컬럼(배차상태)으로 빼고 운송중/배차완료까지 상황별로 보여준다. */}
        <InfoField label="배차상태">
          {(() => {
            const st = driverDispatchStatus(orders, todayStr, live);
            return (
              <span style={{ fontSize: 13, fontWeight: 800, padding: "3px 9px", borderRadius: 6, background: st.bg, color: st.color, display: "inline-block" }}>{st.label}</span>
            );
          })()}
        </InfoField>
        <InfoField label="차량번호" value={driver.차량번호} mono />
        <InfoField label="연락처" value={driver.전화번호 && driver.전화번호 !== "-" ? formatPhone(driver.전화번호) : "-"} mono />
        <InfoField label="거주지" value={driver.거주지 || "-"} />
        <InfoField label="근무가능요일">
          {(driver.근무요일 && driver.근무요일.length) ? (
            // ⭐ 사용자 요청 — 오늘 요일을 빨간 동그라미로 바로 눈에 띄게 표시
            <span style={{ display: "inline-flex", gap: 4 }}>
              {driver.근무요일.map(w => {
                const isToday = w === weekdayKoOf(todayStr);
                return (
                  <span key={w} style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 20, height: 20, borderRadius: "50%", fontSize: 13, fontWeight: 800,
                    color: isToday ? "#fff" : "#111827",
                    background: isToday ? "#ef4444" : "transparent",
                  }}>{w}</span>
                );
              })}
            </span>
          ) : "전일 가능"}
        </InfoField>
        <InfoField label="실시간 위치"><LiveLocationBadge live={live} /></InfoField>
        <InfoField label="담당자">
          <ManagerBadge driver={driver} staff={staff} canDelegate={canDelegate} onAssign={onAssignManager} />
        </InfoField>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={() => handleSendToDriver(driver, orders, selectedDate, rangeEndDate)} disabled={!orders.length}
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: orders.length ? "#fff" : "#f9fafb", color: orders.length ? "#374151" : "#d1d5db", fontSize: 13, fontWeight: 700, cursor: orders.length ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
            기사에게 전달
          </button>
          <button onClick={() => onOpenDetail(driver)}
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid " + NAVY, background: "#fff", color: NAVY, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            상세보기
          </button>
        </div>
      </div>

      {hasConflict && (
        <div style={{ padding: "9px 16px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 13, fontWeight: 700, color: "#92400e" }}>
          근무 불가 요일({weekdayKoOf(selectedDate)})에 배차가 등록되어 있습니다 — 일정을 확인해주세요.
        </div>
      )}

      {orders.length === 0 ? (
        <div style={{ padding: "16px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
          {!isSingleDay
            ? "해당 기간 배차 내역이 없습니다"
            : selectedDate > todayStr ? "예정된 배차가 없습니다" : selectedDate < todayStr ? "배차 내역이 없습니다" : "오늘 배차 내역이 없습니다"}
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                {/* ⭐ 사용자 요청 — 헤더가 너무 밋밋해서(연회색 작은 글씨) 네이비 배경 +
                    흰색 굵은 글씨 + 중앙정렬로 프로그램 색감에 맞춤 */}
                <tr style={{ background: NAVY }}>
                  {ROUTE_COLS.map(h => (
                    <th key={h} style={{ padding: "9px 16px", fontSize: 12, fontWeight: 800, color: "#fff", textAlign: "center", letterSpacing: ".02em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((r, i) => {
                  const fleetMeta = r.기사확인상태 ? FLEET_CHECK_PROG_META[r.기사확인상태] : null;
                  const prog = computeOrderProgress(r, r.상차일, todayStr);
                  const meta = fleetMeta || PROG_META[prog];
                  const isBlinking = fleetMeta ? r.기사확인상태 === "수락" : prog === "progress";
                  return (
                    <tr key={r._id || i} style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : "none" }} onContextMenu={(e) => openRowMenu(e, r)}>
                      <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 13, fontWeight: 700, color: "#9ca3af" }}>{i + 1}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: "50%", background: meta.dot, flexShrink: 0,
                            animation: isBlinking ? "fmBlink 2.4s ease-in-out infinite" : "none",
                          }} />
                          {/* ⭐ 사용자 요청 — 상태/상차지/하차지/이동정보 글씨가 거래처·상차·하차·
                              운임 칸보다 작아 보였다. 전부 14px/700으로 통일. */}
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>{meta.label}</span>
                          {/* ⭐ 사용자 요청 — 완료시간이 줄바꿈으로 아래에 따로 뜨던 걸 한 줄로 합침 */}
                          {r.기사확인상태 === "완료" && r.기사완료일시?.toDate && (
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>
                              {(() => { const t = r.기사완료일시.toDate(); return `(${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")})`; })()}
                            </span>
                          )}
                        </span>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 14, fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{r.거래처명 || "-"}</td>
                      {/* ⭐ 상차지/하차지 — 예전엔 이름 아래 줄바꿈으로 "날짜 · 주소"가 작고 흐리게
                          있었는데, 날짜는 상차/하차 컬럼으로 옮기고 주소는 이름 옆에 가로로,
                          더 잘 보이는 색/굵기로 붙인다. */}
                      <td style={{ padding: "10px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{r.상차지명 || "-"}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#4b5563", marginLeft: 8 }}>{abbrevAddr(r.상차지주소) || "-"}</span>
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{r.하차지명 || "-"}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#4b5563", marginLeft: 8 }}>{abbrevAddr(r.하차지주소) || "-"}</span>
                      </td>
                      {/* ⭐ 상차/하차 — 상차지/하차지 칸에 있던 날짜를 여기로 옮겨 시간과 함께 표시 */}
                      <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 14, color: "#111827", fontWeight: 700, whiteSpace: "nowrap" }}>{r.상차일 || "-"} {r.상차시간 || "즉시"}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 14, color: "#111827", fontWeight: 700, whiteSpace: "nowrap" }}>{r.하차일 || "-"} {r.하차시간 || "즉시"}</td>
                      {/* ⭐ 사용자 요청 — 지입차관리 노선표에 화물내용/톤수/차량종류가 안 보여서 추가 */}
                      <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 14, color: "#374151", fontWeight: 700, whiteSpace: "nowrap" }}>
                        {[r.차량종류, r.차량톤수, r.화물내용].filter(Boolean).join(" · ") || "-"}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <RouteDistanceBadge fromAddr={r.상차지주소} toAddr={r.하차지주소} />
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 14, fontWeight: 700, color: NAVY, whiteSpace: "nowrap" }}>
                        {r.기사운임 ? `${Number(String(r.기사운임).replace(/[^\d]/g, "")).toLocaleString()}원` : "-"}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center", fontSize: 14, color: "#374151", fontWeight: 700, whiteSpace: "nowrap" }}>{creatorLabel(r, staffByEmail)}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                        {r.기사확인상태 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span
                              title={r.기사확인상태 === "거절" ? (r.기사거절사유 || "사유 없음") : undefined}
                              style={{ fontSize: 13, fontWeight: 800, padding: "3px 9px", borderRadius: 6, background: ORDER_CHECK_META[r.기사확인상태]?.bg, color: ORDER_CHECK_META[r.기사확인상태]?.color, border: ORDER_CHECK_META[r.기사확인상태]?.border, cursor: r.기사확인상태 === "거절" ? "help" : "default" }}
                            >
                              {ORDER_CHECK_META[r.기사확인상태]?.label || r.기사확인상태}
                            </span>
                            {/* ⭐ 사용자 요청 — 거절 내역을 확인했으면 지울 수 있는 버튼 */}
                            {r.기사확인상태 === "거절" && (
                              <button
                                onClick={() => {
                                  if (!window.confirm("거절 내역을 삭제할까요?")) return;
                                  updateDoc(doc(db, "orders", r._id), {
                                    기사확인상태: null, 기사거절사유: null, 기사확인일시: null,
                                  }).catch(() => {});
                                }}
                                title="거절 내역 삭제"
                                style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid #d1d5db", background: "#fff", color: "#9ca3af", fontSize: 11, lineHeight: "16px", cursor: "pointer", flexShrink: 0 }}
                              >✕</button>
                            )}
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, color: "#d1d5db" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 16px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <FleetAttachButton orderId={r._id} col={r.__col || "orders"} attachCount={r.attachCount || 0} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 요약: 첫 오더 상/하차 예상시간 + (2건 이상이면) 마지막 오더 하차완료 예상 */}
          <div style={{ padding: "9px 16px", background: "#f8f9fb", borderTop: "1px solid #f0f2f5", fontSize: 13, color: "#374151", fontWeight: 600 }}>
            {isSingleDay ? "오늘 총" : "조회기간 총"} <b style={{ color: NAVY }}>{orders.length}</b>건 · 운임 합계 <b style={{ color: NAVY }}>{fareSum.toLocaleString()}원</b> · 첫 상차 <b>{first.상차일}{" "}{first.상차시간 || "즉시"}</b> → 첫 오더 하차예상 <b>{first.하차시간 || "즉시"}</b>
            {orders.length > 1 && (
              <> · 마지막 오더 하차완료 예상 <b>{last.하차시간 || "즉시"}{last.하차일 && last.하차일 !== first.상차일 ? `(${last.하차일})` : ""}</b></>
            )}
          </div>
        </>
      )}

      {ctxMenu && <OrderContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />}
      {routeMapOrder && (
        <RouteMapModal
          pickupAddr={routeMapOrder.상차지주소}
          dropAddr={routeMapOrder.하차지주소}
          pickupName={routeMapOrder.상차지명}
          dropName={routeMapOrder.하차지명}
          onClose={() => setRouteMapOrder(null)}
        />
      )}
      {editOrder && <OrderEditModal order={editOrder} onClose={() => setEditOrder(null)} />}
      {copyOrder && <OrderCopyModal order={copyOrder} driver={driver} onClose={() => setCopyOrder(null)} />}
    </div>
  );
}

// ─── 기사 상세 모달 (기존 전체 이력/주요노선/엑셀다운로드 기능 이관) ─────────────

// ⭐ 사용자 요청 — 지입차는 직원 같은 개념이라, 사업자등록증/보험증/차량등록증 같은
// 서류를 올려두고 언제든 미리보기·다운로드할 수 있어야 한다. 클라이언트 첨부파일
// (CLIENT_FILE_BASE64_LIMIT)과 동일하게 base64로 Firestore에 저장 — 별도 Storage
// 설정 없이 바로 동작하고, 파일당 문서가 분리돼 있어 여러 건 보관에도 안전하다.
const DRIVER_DOC_BASE64_LIMIT = 900_000;
function compressDriverDocImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function DriverDocumentsPanel({ driverId }) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { name, dataUrl, type }

  useEffect(() => {
    if (!driverId) return;
    return onSnapshot(
      query(collection(db, "driver_documents"), where("driverId", "==", driverId)),
      (snap) => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0))),
      () => {}
    );
  }, [driverId]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = file.type.startsWith("image/") ? await compressDriverDocImage(file) : await new Promise((res) => {
        const r = new FileReader();
        r.onload = (ev) => res(ev.target.result);
        r.readAsDataURL(file);
      });
      if (dataUrl.length > DRIVER_DOC_BASE64_LIMIT) {
        alert("파일이 너무 큽니다. 더 작은 파일을 사용하거나 이미지를 압축해서 다시 올려주세요.");
        return;
      }
      await addDoc(collection(db, "driver_documents"), {
        driverId, fileName: file.name, fileType: file.type || "", dataUrl,
        uploadedAt: { seconds: Math.floor(Date.now() / 1000) },
      });
    } catch (e) {
      alert("업로드 중 오류가 발생했습니다: " + (e?.message || e));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("이 서류를 삭제할까요?")) return;
    await deleteDoc(doc(db, "driver_documents", id)).catch(() => {});
  };

  const download = (d) => {
    const a = document.createElement("a");
    a.href = d.dataUrl; a.download = d.fileName;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>서류함 ({docs.length})</span>
        <label style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${NAVY}`, background: NAVY, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {uploading ? "업로드중..." : "+ 서류 업로드"}
          <input type="file" accept="image/*,.pdf" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
        </label>
      </div>
      {docs.length === 0 ? (
        <div style={{ padding: 30, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>등록된 서류가 없습니다. 사업자등록증·보험증·차량등록증 등을 올려두세요.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, padding: 14 }}>
          {docs.map(d => (
            <div key={d.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#f9fafb" }}>
              <div
                onClick={() => d.fileType?.startsWith("image/") && setLightbox(d)}
                style={{ height: 90, borderRadius: 6, background: "#fff", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8, cursor: d.fileType?.startsWith("image/") ? "pointer" : "default", overflow: "hidden" }}
              >
                {d.fileType?.startsWith("image/") ? (
                  <img src={d.dataUrl} alt={d.fileName} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                ) : (
                  <span style={{ fontSize: 28 }}>📄</span>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }} title={d.fileName}>{d.fileName}</div>
              <div style={{ display: "flex", gap: 5 }}>
                <button onClick={() => download(d)} style={{ flex: 1, padding: "5px 0", borderRadius: 5, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>다운로드</button>
                <button onClick={() => handleDelete(d.id)} style={{ padding: "5px 9px", borderRadius: 5, border: "1px solid #fca5a5", background: "#fff", color: "#ef4444", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {lightbox && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setLightbox(null)}>
          <img src={lightbox.dataUrl} alt={lightbox.fileName} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

// 오늘로부터 n개월 전 날짜(YYYY-MM-DD, KST) — 조회기간 하한 계산용.
function monthsAgoKstDateStr(n) {
  const d = new Date(Date.now() + 9 * 3600 * 1000); // KST
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

function DriverRouteDetailModal({ driver, dispatchData, onClose, role = "" }) {
  // ⭐ 사용자 요청 — 예전엔 기간을 비워두면 "전체 이력"이 기본으로 떴다. 항상
  // 당일 배차부터 보여주고, 사용자가 직접 기간을 선택했을 때만 그 범위로 바뀌게
  // 기본값을 오늘로 둔다.
  const todayForRange = kstDateStr();
  const [fromDate, setFromDate] = useState(todayForRange);
  const [toDate, setToDate] = useState(todayForRange);
  const [orderSearch, setOrderSearch] = useState("");
  // 관리자/최고관리자만 기간 제한 없이 조회 가능, 그 이하 직급은 최근 3개월까지만.
  const isUnrestricted = role === "admin" || role === "totalMaster";
  const minAllowedDate = isUnrestricted ? null : monthsAgoKstDateStr(3);
  const clampDate = (v) => (minAllowedDate && v && v < minAllowedDate) ? minAllowedDate : v;

  const toWon = (v) => Number(String(v || "0").replace(/[^\d]/g, "")) || 0;

  const allDriverOrders = useMemo(() => {
    const name = (driver.이름 || "").trim();
    const plate = (driver.차량번호 || "").trim();
    if (!name && !plate) return [];
    return (dispatchData || [])
      .filter(r => {
        const rName = (r.이름 || "").trim();
        const rPlate = (r.차량번호 || "").trim();
        return (!!name && rName === name) || (!!plate && rPlate === plate);
      })
      .sort((a, b) => String(b.상차일 || "").localeCompare(String(a.상차일 || "")));
  }, [driver, dispatchData]);

  const driverOrders = useMemo(() => {
    return allDriverOrders.filter(r => {
      const d = String(r.상차일 || "");
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      if (orderSearch.trim()) {
        const s = orderSearch.trim().toLowerCase();
        const hay = `${r.거래처명 || ""} ${r.상차지명 || ""} ${r.하차지명 || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [allDriverOrders, fromDate, toDate, orderSearch]);

  const totalFare = driverOrders.reduce((s, r) => s + toWon(r.청구운임), 0);
  const totalDriverFare = driverOrders.reduce((s, r) => s + toWon(r.기사운임), 0);
  const totalMargin = totalFare - totalDriverFare;

  const topRoutes = useMemo(() => {
    const map = new Map();
    allDriverOrders.forEach(r => {
      const from = (r.상차지명 || "").trim() || "-";
      const to = (r.하차지명 || "").trim() || "-";
      const key = `${from}→${to}`;
      if (!map.has(key)) map.set(key, { from, to, count: 0, fareSum: 0, lastDate: "" });
      const g = map.get(key);
      g.count += 1;
      g.fareSum += toWon(r.청구운임);
      if ((r.상차일 || "") > g.lastDate) g.lastDate = r.상차일 || "";
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  }, [allDriverOrders]);

  const handleExport = () => {
    if (!driverOrders.length) return;
    const rows = driverOrders.map(r => ({
      상차일: r.상차일 || "", 거래처명: r.거래처명 || "", 상차지명: r.상차지명 || "",
      하차지명: r.하차지명 || "", 차량종류: r.차량종류 || "", 배차상태: r.배차상태 || "",
      청구운임: toWon(r.청구운임), 기사운임: toWon(r.기사운임), 수수료: toWon(r.청구운임) - toWon(r.기사운임),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "노선내역");
    XLSX.writeFile(wb, `${driver.이름}_노선내역.xlsx`);
  };

  // ⭐ 사용자 요청 — 관리자가 PC에서 지입차별 "오늘 매출"/"누적 매출"을 바로 볼 수
  // 있어야 한다. 위 totalFare 등은 fromDate/toDate/검색 필터에 따라 바뀌는 "조회
  // 결과" 통계라 다른 목적이고, 이건 필터와 무관하게 항상 같은 값을 보여줘야 해서
  // allDriverOrders(전체 이력)에서 별도로 계산한다.
  const todayRevenueStr = kstDateStr();
  const todayRevenue = allDriverOrders.filter(r => (r.상차일 || "") === todayRevenueStr).reduce((s, r) => s + toWon(r.청구운임), 0);
  const cumulativeRevenue = allDriverOrders.reduce((s, r) => s + toWon(r.청구운임), 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      {/* ⭐ 사용자 요청 — 맨 아래 오더 목록 표가 가로로 길어서 잘려 보였다. 1040px
          고정폭 대신 뷰포트에 맞춰 넓게(최대 1500px) 쓴다. */}
      <div style={{ background: "#f4f6f9", borderRadius: 14, width: "min(1500px, 95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,.25)" }} onClick={e => e.stopPropagation()}>
        <div style={{ position: "sticky", top: 0, background: NAVY, padding: "16px 20px", display: "flex", alignItems: "center", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{driver.이름} <span style={{ fontWeight: 600, fontSize: 14, color: "rgba(255,255,255,.7)", fontFamily: "monospace" }}>{driver.차량번호}</span></div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{driver.등급} · {driver.전화번호 ? formatPhone(driver.전화번호) : ""}{driver.거주지 ? ` · 거주지 ${driver.거주지}` : ""}</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 8, background: "rgba(255,255,255,.15)", cursor: "pointer", color: "#fff", padding: 0 }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: NAVY, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)" }}>오늘 매출</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{todayRevenue.toLocaleString()}원</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>누적 매출 (전체 이력)</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: NAVY }}>{cumulativeRevenue.toLocaleString()}원</div>
            </div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>오더 건수</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{driverOrders.length}건</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>청구운임 합계</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{totalFare.toLocaleString()}원</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>기사운임 합계</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{totalDriverFare.toLocaleString()}원</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>수수료(마진)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#f59e0b" }}>{totalMargin.toLocaleString()}원</div>
            </div>
          </div>

          <DriverDocumentsPanel driverId={driver.id} />

          {topRoutes.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontSize: 16, fontWeight: 800, color: NAVY }}>
                주요 노선 (전체 이력 기준, 빈도순)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, padding: 14 }}>
                {topRoutes.map((rt, i) => (
                  <div key={i} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#f9fafb" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
                      {rt.from} <span style={{ color: "#9ca3af" }}>→</span> {rt.to}
                    </div>
                    <div style={{ fontSize: 13, color: "#6b7280", display: "flex", justifyContent: "space-between" }}>
                      <span>{rt.count}회</span>
                      <span>평균 {Math.round(rt.fareSum / rt.count).toLocaleString()}원</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>최근 {rt.lastDate || "-"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>기간</span>
            <CustomDatePicker value={fromDate} onChange={e => setFromDate(clampDate(e.target.value))} placeholder="시작일"
              className="h-[34px] px-3 rounded-lg text-[13px] font-bold border border-gray-300 bg-white cursor-pointer" />
            <span style={{ color: "#9ca3af" }}>~</span>
            <CustomDatePicker value={toDate} onChange={e => setToDate(clampDate(e.target.value))} placeholder="종료일"
              className="h-[34px] px-3 rounded-lg text-[13px] font-bold border border-gray-300 bg-white cursor-pointer" />
            <button onClick={() => { setFromDate(todayForRange); setToDate(todayForRange); }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: 13, cursor: "pointer" }}>
              오늘로 초기화
            </button>
            {!isUnrestricted && (
              <span style={{ fontSize: 12, color: "#9ca3af" }}>최근 3개월까지만 조회 가능</span>
            )}
            <input
              placeholder="거래처/상하차지 검색"
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value)}
              style={{ flex: 1, minWidth: 160, padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, outline: "none" }}
            />
            <button onClick={handleExport} disabled={!driverOrders.length}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "1px solid " + NAVY,
                background: driverOrders.length ? NAVY : "#e5e7eb", color: driverOrders.length ? "#fff" : "#9ca3af",
                fontSize: 13, fontWeight: 700, cursor: driverOrders.length ? "pointer" : "not-allowed",
              }}>
              엑셀 다운로드
            </button>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
                <thead>
                  <tr style={{ background: NAVY }}>
                    {["상차일", "거래처명", "상차지명", "하차지명", "차량종류", "배차상태", "청구운임", "기사운임"].map(h => (
                      <th key={h} style={{ padding: "10px 8px", color: "#fff", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverOrders.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>배차 이력이 없습니다.</td></tr>
                  ) : driverOrders.map((r, i) => (
                    <tr key={r._id || i} style={{ borderTop: "1px solid #f3f4f6", background: i % 2 ? "#fafbfc" : "#fff" }}>
                      <td style={{ padding: "9px 8px", textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>{r.상차일 || ""}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center" }}>{r.거래처명 || ""}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center" }}>{r.상차지명 || ""}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center" }}>{r.하차지명 || ""}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", whiteSpace: "nowrap" }}>{r.차량종류 || ""}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", whiteSpace: "nowrap" }}>{r.배차상태 || ""}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>{toWon(r.청구운임).toLocaleString()}원</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", color: "#10b981", fontWeight: 700, whiteSpace: "nowrap" }}>{toWon(r.기사운임).toLocaleString()}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 노선관리 탭 (지입/직영 전체 차량 실시간 관제) ─────────────────────────────
// 진입 시 지입/직영 기사 전원의 "선택 날짜" 오더 진행상황을 카드 목록으로 한눈에
// 보여준다. dispatchData는 부모(DispatchApp)의 실시간 배차 데이터를 그대로 받으므로,
// 실시간배차현황/배차현황에서 지입/직영 기사에게 배차되는 순간 자동으로 반영된다.
// 기사 1명의 전체 이력/주요노선/엑셀다운로드는 카드의 "상세보기"로 이동했다.
function RouteManagementTab({ drivers, dispatchData, liveDrivers = [], staff = [], canDelegate = false, onAssignManager, myUid = null, staffByEmail = {}, role = "" }) {
  const [q, setQ] = useState("");
  const todayStr0 = kstDateStr();
  // ⭐ 사용자 요청 — 예전엔 날짜 선택이 하루만 가능했는데, 5파트(배차현황)와 동일하게
  // 시작일~종료일을 고르고 "조회"를 눌러야 실제로 반영되는 방식으로 바꾼다.
  // dayMode(어제/당일/내일)는 그대로 유지하되, 누르면 시작일=종료일=그 날짜로 즉시
  // 적용(5파트의 어제/당일/내일 버튼과 동일 동작). 임의 기간은 드래프트
  // (rangeStart/rangeEnd)만 바꾸고, "조회"를 눌러야 appliedStart/appliedEnd로
  // 반영되어 화면이 다시 계산된다.
  const [dayMode, setDayMode] = useState("today"); // "yesterday" | "today" | "tomorrow" | "" (임의 기간)
  const [rangeStart, setRangeStart] = useState(todayStr0);
  const [rangeEnd, setRangeEnd] = useState(todayStr0);
  const [appliedStart, setAppliedStart] = useState(todayStr0);
  const [appliedEnd, setAppliedEnd] = useState(todayStr0);
  const [detailDriver, setDetailDriver] = useState(null);
  const [onlyIdle, setOnlyIdle] = useState(false); // 배차 없는(오늘 놀고 있는) 차량만 보기
  // ⭐ 사용자 요청 — 배차자마다 담당 지입차가 따로 있어서, 들어오자마자 "내 담당
  // 차량"부터 보여야 한다. 전체 차량을 보는 기능은 토글로 그대로 유지.
  const [scope, setScope] = useState("mine");

  const liveByFleetId = useMemo(() => new Map(liveDrivers.map(d => [d.id, d])), [liveDrivers]);

  const todayStr = todayStr0;
  const isSingleDay = appliedStart === appliedEnd;
  // 근무가능요일 충돌 경고는 "하루"를 볼 때만 의미가 있다 — 기간 조회 중엔 생략.
  const weekdayLabel = isSingleDay ? weekdayKoOf(appliedStart) : "";

  const scopedDrivers = useMemo(
    () => scope === "mine" ? drivers.filter(d => d.담당자?.uid === myUid) : drivers,
    [drivers, scope, myUid]
  );

  const filteredDrivers = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return scopedDrivers;
    return scopedDrivers.filter(d =>
      (d.이름 || "").toLowerCase().includes(query) ||
      (d.차량번호 || "").toLowerCase().includes(query) ||
      (d.거주지 || "").toLowerCase().includes(query)
    );
  }, [scopedDrivers, q]);

  // 조회 기간(상차일 기준) 오더를 차량번호 우선, 없으면 이름으로 매칭해 빠르게 찾을 수
  // 있도록 인덱스를 만든다.
  const ordersByPlate = useMemo(() => {
    const m = new Map();
    (dispatchData || []).forEach(r => {
      const d = r.상차일 || "";
      if (!d || d < appliedStart || d > appliedEnd) return;
      const p = (r.차량번호 || "").trim();
      if (!p) return;
      if (!m.has(p)) m.set(p, []);
      m.get(p).push(r);
    });
    return m;
  }, [dispatchData, appliedStart, appliedEnd]);

  const ordersByName = useMemo(() => {
    const m = new Map();
    (dispatchData || []).forEach(r => {
      const d = r.상차일 || "";
      if (!d || d < appliedStart || d > appliedEnd) return;
      const n = (r.이름 || "").trim();
      if (!n) return;
      if (!m.has(n)) m.set(n, []);
      m.get(n).push(r);
    });
    return m;
  }, [dispatchData, appliedStart, appliedEnd]);

  const driverRows = useMemo(() => {
    const rows = filteredDrivers.map(d => {
      const plate = (d.차량번호 || "").trim();
      const name = (d.이름 || "").trim();
      const raw = (plate && ordersByPlate.get(plate)) || (name && ordersByName.get(name)) || [];
      const orders = [...raw].sort((a, b) => {
        const dd = (a.상차일 || "").localeCompare(b.상차일 || "");
        if (dd !== 0) return dd;
        return (parseTimeToMin(a.상차시간) ?? 9999) - (parseTimeToMin(b.상차시간) ?? 9999);
      });
      const isOffDay = isSingleDay && (d.근무요일 && d.근무요일.length) ? !d.근무요일.includes(weekdayLabel) : false;
      return { driver: d, orders, isOffDay, live: liveByFleetId.get(d.id) || null };
    });
    return rows.sort((a, b) => {
      if ((a.orders.length > 0) !== (b.orders.length > 0)) return a.orders.length > 0 ? -1 : 1;
      const at = a.orders[0] ? (parseTimeToMin(a.orders[0].상차시간) ?? 9999) : 9999;
      const bt = b.orders[0] ? (parseTimeToMin(b.orders[0].상차시간) ?? 9999) : 9999;
      if (at !== bt) return at - bt;
      return (a.driver.이름 || "").localeCompare(b.driver.이름 || "", "ko");
    });
  }, [filteredDrivers, ordersByPlate, ordersByName, weekdayLabel, liveByFleetId]);

  const dispatchedCount = driverRows.filter(r => r.orders.length > 0).length;
  const visibleRows = onlyIdle ? driverRows.filter(r => r.orders.length === 0) : driverRows;

  // ⭐ 사용자 요청 — 상단 KPI를 "총 등록/접속중/운행중/근무중" 대신 담당 기준으로:
  // 총 등록기사, 내 담당차량, 내 담당차량 중 배차중, 내 담당차량 중 배차완료.
  // 토글(scope)과 무관하게 항상 "내 담당" 수치를 보여주기 위해 drivers(전체
  // 지입/직영)에서 직접 다시 집계한다 — search/scope 필터의 영향을 받지 않게.
  const kpi = useMemo(() => {
    const mine = drivers.filter(d => d.담당자?.uid === myUid);
    const myOrders = (d) => {
      const plate = (d.차량번호 || "").trim();
      const name = (d.이름 || "").trim();
      return (plate && ordersByPlate.get(plate)) || (name && ordersByName.get(name)) || [];
    };
    const inProgress = mine.filter(d => myOrders(d).some(r => r.배차상태 === "배차중")).length;
    const completed = mine.filter(d => myOrders(d).some(r => r.배차상태 === "배차완료")).length;
    return { total: drivers.length, mine: mine.length, inProgress, completed };
  }, [drivers, myUid, ordersByPlate, ordersByName]);

  return (
    <div>
      {/* KPI — 담당 기준 요약 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "총 등록기사", value: kpi.total, icon: KPI_ICONS.truck, accent: NAVY },
          { label: "내 담당차량", value: kpi.mine, icon: KPI_ICONS.user, accent: "#2563eb" },
          { label: "내 담당 · 배차중", value: kpi.inProgress, icon: KPI_ICONS.route, accent: "#f59e0b" },
          { label: "내 담당 · 배차완료", value: kpi.completed, icon: KPI_ICONS.check, accent: "#16a34a" },
        ].map(c => (
          <div key={c.label} style={{
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: "16px 18px",
            display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: c.accent }} />
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${c.accent}14`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={c.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {c.icon}
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", marginBottom: 2 }}>{c.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#111827", lineHeight: 1 }}>{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 상단 바: 검색 + 어제/당일/내일 + KPI */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          placeholder="기사명, 차량번호, 거주지 검색"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, minWidth: 220, outline: "none", boxSizing: "border-box" }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {["yesterday", "today", "tomorrow"].map((mode, i) => {
            const labels = ["어제", "당일", "내일"];
            const active = dayMode === mode;
            return (
              <button key={mode} onClick={() => {
                const offset = mode === "yesterday" ? -86400000 : mode === "tomorrow" ? 86400000 : 0;
                const d = kstDateStr(new Date(Date.now() + offset));
                setDayMode(mode); setRangeStart(d); setRangeEnd(d); setAppliedStart(d); setAppliedEnd(d);
              }}
                style={{
                  height: 34, padding: "0 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
                  background: active ? NAVY : "#f3f4f6", color: active ? "#fff" : "#374151", transition: "all .12s",
                }}>
                {labels[i]}
              </button>
            );
          })}
        </div>
        {/* ⭐ 사용자 요청 — 5파트(배차현황)와 동일한 시작일~종료일 + 조회 버튼. 날짜만
            바꾸고 아직 조회를 안 누른 상태면(draft !== applied) 버튼이 깜빡여 클릭을
            유도한다. */}
        <CustomDatePicker value={rangeStart} onChange={(e) => { setDayMode(""); setRangeStart(e.target.value); }}
          placeholder="시작일" className="h-[34px] px-3 rounded-lg text-[13px] font-bold border border-gray-300 bg-white cursor-pointer" />
        <span style={{ color: "#9ca3af", fontSize: 13 }}>~</span>
        <CustomDatePicker value={rangeEnd} onChange={(e) => { setDayMode(""); setRangeEnd(e.target.value); }}
          placeholder="종료일" className="h-[34px] px-3 rounded-lg text-[13px] font-bold border border-gray-300 bg-white cursor-pointer" />
        <button
          onClick={() => { if (!rangeStart || !rangeEnd) return; if (rangeStart > rangeEnd) { window.alert("시작일이 종료일보다 늦을 수 없습니다."); return; } setAppliedStart(rangeStart); setAppliedEnd(rangeEnd); }}
          className={rangeStart && rangeEnd && (rangeStart !== appliedStart || rangeEnd !== appliedEnd) ? "animate-pulse" : ""}
          style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", background: NAVY, color: "#fff" }}>
          조회
        </button>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          {isSingleDay ? `${appliedStart} (${weekdayKoOf(appliedStart)})` : `${appliedStart} ~ ${appliedEnd}`}
        </span>
        <button onClick={() => setOnlyIdle(v => !v)}
          style={{
            height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid " + (onlyIdle ? NAVY : "#d1d5db"),
            fontSize: 13, fontWeight: 700, cursor: "pointer", background: onlyIdle ? NAVY : "#fff", color: onlyIdle ? "#fff" : "#374151",
          }}>
          미배차만 보기
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, fontSize: 14, color: "#6b7280" }}>
          <span>{scope === "mine" ? "내 담당" : "전체"} <b style={{ color: NAVY }}>{scopedDrivers.length}</b>대</span>
          <span>배차 <b style={{ color: "#111827" }}>{dispatchedCount}</b>대</span>
          <span>미배차 <b style={{ color: "#111827" }}>{scopedDrivers.length - dispatchedCount}</b>대</span>
        </div>
      </div>

      {/* 내 담당 / 전체 토글 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14, background: "#f3f4f6", borderRadius: 8, padding: 3, width: "fit-content" }}>
        {[["mine", "내 담당 차량", drivers.filter(d => d.담당자?.uid === myUid).length], ["all", "전체 지입차", drivers.length]].map(([key, label, count]) => (
          <button key={key} onClick={() => setScope(key)}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
              background: scope === key ? NAVY : "transparent", color: scope === key ? "#fff" : "#6b7280", transition: "all .12s",
              display: "flex", alignItems: "center", gap: 6,
            }}>
            {label}
            <span style={{
              fontSize: 11, fontWeight: 800, padding: "1px 6px", borderRadius: 99,
              background: scope === key ? "rgba(255,255,255,.22)" : "#e5e7eb", color: scope === key ? "#fff" : "#6b7280",
            }}>{count}</span>
          </button>
        ))}
      </div>

      {driverRows.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 16 }}>
          {scope === "mine"
            ? <>아직 담당 지정된 차량이 없습니다.<br />위 "전체 지입차"에서 담당자를 지정해주세요.</>
            : <>지입/직영 등급 기사가 없습니다.<br />기사관리에서 등급을 지정해주세요.</>}
        </div>
      ) : visibleRows.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 16 }}>
          미배차 차량이 없습니다 — 전원 배차 완료.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleRows.map(({ driver, orders, isOffDay, live }, i) => (
            <DriverRouteCard
              key={driver.id}
              index={i + 1}
              driver={driver}
              orders={orders}
              selectedDate={appliedStart}
              rangeEndDate={appliedEnd}
              isSingleDay={isSingleDay}
              todayStr={todayStr}
              isOffDay={isOffDay}
              live={live}
              onOpenDetail={setDetailDriver}
              staff={staff}
              canDelegate={canDelegate}
              onAssignManager={onAssignManager}
              staffByEmail={staffByEmail}
            />
          ))}
        </div>
      )}

      {detailDriver && (
        <DriverRouteDetailModal driver={detailDriver} dispatchData={dispatchData} onClose={() => setDetailDriver(null)} role={role} />
      )}
    </div>
  );
}

function HistoryTab({ drivers, defaultDriverId }) {
  const todayStr = kstDateStr();

  const [selId, setSelId] = useState(defaultDriverId || "");

  useEffect(() => {
    if (defaultDriverId) setSelId(defaultDriverId);
  }, [defaultDriverId]);
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [applied, setApplied] = useState(null);
  const [logs, setLogs] = useState([]);
  const [gpsDist, setGpsDist] = useState(null);
  const [loading, setLoading] = useState(false);
  const [driverPhotos, setDriverPhotos] = useState([]); // photos for applied driver+date range
  const [histPhotoLightbox, setHistPhotoLightbox] = useState(null); // { photos[], index, rotation }

  // ⭐ Firestore 읽기/연결 절감 — 과거 특정 기간을 조회하는 화면인데도 onSnapshot
  // (실시간 지속 연결)을 써서, 조회 중 그 기사의 새 로그가 하나만 찍혀도 다시
  // 전체를 재조회하고 있었다. 실시간으로 갱신될 필요가 없는 이력조회이므로
  // getDocs(1회성)로 바꿔 연결을 계속 열어두지 않게 한다.
  useEffect(() => {
    if (!applied) return;
    let cancelled = false;
    setLoading(true);
    setLogs([]);
    setGpsDist(null);
    const from = new Date(applied.from + "T00:00:00+09:00");
    const to = new Date(applied.to + "T23:59:59+09:00");

    (async () => {
      try {
        const [logSnap, gpsSnap, photoSnap] = await Promise.all([
          getDocs(query(collection(db, "driver_logs"), where("uid", "==", applied.driverId))),
          getDocs(query(collection(db, "gps_tracks"), where("driverId", "==", applied.driverId), limit(2000))),
          getDocs(query(collection(db, "driver_photo_logs"), where("uid", "==", applied.driverId))),
        ]);
        if (cancelled) return;

        const filtered = logSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(l => { const t = resolveTs(l.timestamp); return t && t >= from && t <= to; })
          .sort((a, b) => (resolveTs(a.timestamp)?.getTime()||0) - (resolveTs(b.timestamp)?.getTime()||0));
        setLogs(filtered);

        const tracks = gpsSnap.docs.map(d => d.data())
          .filter(t => { const ts = resolveTs(t.timestamp); return ts && ts >= from && ts <= to; })
          .sort((a, b) => (resolveTs(a.timestamp)?.getTime()||0) - (resolveTs(b.timestamp)?.getTime()||0));
        let dist = 0;
        for (let i = 1; i < tracks.length; i++) dist += haversineKm(tracks[i-1].lat, tracks[i-1].lng, tracks[i].lat, tracks[i].lng);
        setGpsDist(dist > 0.01 ? dist : null);

        const photos = photoSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(p => { const t = resolveTs(p.timestamp); return t && t >= from && t <= to; })
          .sort((a, b) => (resolveTs(a.timestamp)?.getTime()||0) - (resolveTs(b.timestamp)?.getTime()||0));
        setDriverPhotos(photos);
      } catch (e) {
        console.error("이력조회 오류:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [applied]);

  const summary = useMemo(() => {
    if (!logs.length) return null;
    let checkInTime = null, finalCheckOutTime = null, tripCount = 0;
    logs.forEach(log => {
      const t = resolveTs(log.timestamp);
      if (!t) return;
      const s = log.status || log.mainStatus || "";
      if (s === "출근" && !checkInTime) checkInTime = t;
      if (s === "최종퇴근") finalCheckOutTime = t;
      if (!finalCheckOutTime && (log.status === "퇴근" || log.mainStatus === "퇴근")) finalCheckOutTime = t;
      if (s === "운행중") tripCount++;
    });
    const endTime = finalCheckOutTime || (checkInTime ? new Date() : null);
    const workMs = checkInTime && endTime ? endTime.getTime() - checkInTime.getTime() : 0;
    return { checkInTime, checkOutTime: finalCheckOutTime, workMs, tripCount };
  }, [logs]);

  const groupedByDate = useMemo(() => {
    const groups = {};
    logs.forEach(log => {
      const t = resolveTs(log.timestamp);
      if (!t) return;
      const key = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [logs]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 검색 패널 */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 18px" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: NAVY, whiteSpace: "nowrap" }}>기사 이력 조회</span>
          <select
            value={selId}
            onChange={e => setSelId(e.target.value)}
            style={{ flex: "0 0 auto", width: 180, maxWidth: 200, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 15, color: "#374151", background: "#fafafa", outline: "none" }}
          >
            <option value="">기사 선택</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.이름} ({d.차량번호})</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={fromDate} max={todayStr} onChange={e => setFromDate(e.target.value)}
              style={{ padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 15, color: "#374151", background: "#fafafa", outline: "none" }} />
            <span style={{ color: "#9ca3af", fontSize: 15 }}>~</span>
            <input type="date" value={toDate} max={todayStr} onChange={e => setToDate(e.target.value)}
              style={{ padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 15, color: "#374151", background: "#fafafa", outline: "none" }} />
          </div>
          <button
            onClick={() => {
              if (!selId) return;
              const d = drivers.find(x => x.id === selId);
              setApplied({ driverId: selId, from: fromDate, to: toDate, driverName: d?.이름 || "", carNo: d?.차량번호 || "" });
            }}
            disabled={!selId}
            style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: selId ? NAVY : "#e5e7eb", color: selId ? "white" : "#9ca3af", fontSize: 15, fontWeight: 700, cursor: selId ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
          >
            조회
          </button>
        </div>
      </div>

      {/* 결과 */}
      {applied && (loading ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "48px", textAlign: "center", color: "#9ca3af", fontSize: 16 }}>조회 중...</div>
      ) : logs.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: 16, color: "#6b7280", fontWeight: 700 }}>해당 기간의 기록이 없습니다</div>
          <div style={{ fontSize: 15, color: "#9ca3af", marginTop: 6 }}>{applied.from === applied.to ? applied.from : `${applied.from} ~ ${applied.to}`}</div>
        </div>
      ) : (
        <>
          {/* 기사 헤더 */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 24px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="22" height="22" fill="none" stroke="white" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{applied.driverName}</div>
              <div style={{ fontSize: 15, color: "#6b7280", marginTop: 2 }}>{applied.carNo} · {applied.from === applied.to ? applied.from : `${applied.from} ~ ${applied.to}`}</div>
            </div>
          </div>

          {/* 요약 카드 */}
          {summary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              {[
                { label: "출근 시각", val: summary.checkInTime ? formatTime(summary.checkInTime) : "--" },
                { label: "퇴근 시각", val: summary.checkOutTime ? formatTime(summary.checkOutTime) : "--" },
                { label: "총 근무시간", val: summary.workMs > 0 ? formatMs(summary.workMs) : "--" },
                { label: "운행 횟수", val: `${summary.tripCount}회` },
                { label: "이동거리", val: gpsDist != null ? `${gpsDist.toFixed(1)} km` : "--" },
                { label: "상태 변경", val: `${logs.length}건` },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "14px 18px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 7 }}>{label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* 날짜별 타임라인 */}
          {groupedByDate.map(([dateKey, dateLogs]) => (
            <div key={dateKey} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 22px", background: "#f8f9fb", borderBottom: "1px solid #eaecf0", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{dateKey}</span>
                <span style={{ fontSize: 15, color: "#9ca3af" }}>{dateLogs.length}건</span>
              </div>
              <div style={{ padding: "8px 0" }}>
                {dateLogs.map((log, i) => {
                  const t = resolveTs(log.timestamp);
                  const nextT = resolveTs(dateLogs[i + 1]?.timestamp);
                  const durMs = t && nextT ? nextT.getTime() - t.getTime() : null;
                  const color = STATUS_COLORS[log.status] || "#9ca3af";
                  return (
                    <div key={log.id} style={{ display: "flex", alignItems: "flex-start", padding: "0 22px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24, flexShrink: 0 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, border: "2px solid #fff", boxShadow: `0 0 0 2px ${color}50`, flexShrink: 0, marginTop: 13 }} />
                        {i < dateLogs.length - 1 && <div style={{ width: 1, background: "#e5e7eb", flex: 1, minHeight: 18 }} />}
                      </div>
                      <div style={{ flex: 1, paddingLeft: 12, paddingTop: 9, paddingBottom: i < dateLogs.length - 1 ? 4 : 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color, background: `${color}15`, padding: "2px 10px", borderRadius: 99 }}>{log.status}</span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: "#374151", fontVariantNumeric: "tabular-nums" }}>{t ? formatTime(t) : "--"}</span>
                          {durMs != null && durMs > 60000 && (
                            <span style={{ fontSize: 14, color: "#9ca3af" }}>{formatMs(durMs)} 체류</span>
                          )}
                        </div>
                        {log.location?.lat != null && (
                          <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                            {log.location.lat.toFixed(5)}, {log.location.lng.toFixed(5)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 해당 날짜 사진 첨부 */}
              {(() => {
                const dayPhotos = driverPhotos.filter(p => p.logDate === dateKey);
                if (!dayPhotos.length) return null;
                return (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>첨부 사진 · 클릭하면 크게 봅니다</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                      {dayPhotos.map((p, photoIdx) => {
                        const t = resolveTs(p.timestamp);
                        return (
                          <div key={p.id} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer" }}
                            onClick={() => setHistPhotoLightbox({ photos: dayPhotos, index: photoIdx, rotation: 0 })}>
                            <div style={{ position: "relative", overflow: "hidden" }}>
                              <img src={p.imageBase64} alt={p.actionType} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block", transition: "transform .2s" }}
                                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"} />
                            </div>
                            <div style={{ padding: "6px 10px", background: "#f9fafb" }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{p.actionType}</div>
                              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>{t ? `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}` : "-"}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
        </>
      ))}

      {/* HistoryTab 라이트박스 */}
      {histPhotoLightbox && (() => {
        const { photos, index, rotation } = histPhotoLightbox;
        const p = photos[index];
        const t = resolveTs(p.timestamp);
        const handleDownload = () => {
          const a = document.createElement("a");
          a.href = p.imageBase64;
          a.download = `${p.driverName || "driver"}_${p.actionType}_${t ? `${String(t.getHours()).padStart(2,"0")}${String(t.getMinutes()).padStart(2,"0")}` : index}.jpg`;
          a.click();
        };
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:299999, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}
            onClick={() => setHistPhotoLightbox(null)}>
            <div style={{ position:"absolute", top:0, left:0, right:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", background:"rgba(0,0,0,0.5)", zIndex:1 }}
              onClick={e => e.stopPropagation()}>
              <div>
                <div style={{ color:"white", fontWeight:700, fontSize: 16 }}>{p.driverName} — {p.actionType}</div>
                <div style={{ color:"rgba(255,255,255,0.55)", fontSize: 14, marginTop:2 }}>{t ? `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")} ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}` : ""} · {index+1}/{photos.length}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <button onClick={() => setHistPhotoLightbox(lb => ({ ...lb, rotation: (lb.rotation - 90 + 360) % 360 }))} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
                <button onClick={() => setHistPhotoLightbox(lb => ({ ...lb, rotation: (lb.rotation + 90) % 360 }))} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M16 3h5v5"/></svg>
                </button>
                <button onClick={handleDownload} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button onClick={() => setHistPhotoLightbox(null)} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", fontSize: 20, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
            </div>
            <div onClick={e => e.stopPropagation()} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", width:"100%", padding:"72px 60px 60px" }}>
              <img src={p.imageBase64} alt={p.actionType} style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", transform:`rotate(${rotation}deg)`, transition:"transform .25s", borderRadius:8, boxShadow:"0 4px 40px rgba(0,0,0,0.6)" }} />
            </div>
            {index > 0 && (
              <button onClick={e => { e.stopPropagation(); setHistPhotoLightbox(lb => ({ ...lb, index: lb.index - 1, rotation: 0 })); }} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, color:"white", width:44, height:44, fontSize: 24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
            )}
            {index < photos.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setHistPhotoLightbox(lb => ({ ...lb, index: lb.index + 1, rotation: 0 })); }} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, color:"white", width:44, height:44, fontSize: 24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            )}
            {photos.length > 1 && (
              <div onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, left:0, right:0, display:"flex", justifyContent:"center", gap:8, padding:"12px 20px 16px", background:"rgba(0,0,0,0.5)" }}>
                {photos.map((ph, i) => (
                  <div key={ph.id} onClick={() => setHistPhotoLightbox(lb => ({ ...lb, index: i, rotation: 0 }))} style={{ width:48, height:48, borderRadius:6, overflow:"hidden", cursor:"pointer", border:i === index ? "2px solid white" : "2px solid rgba(255,255,255,0.2)", flexShrink:0 }}>
                    <img src={ph.imageBase64} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── 정산관리 탭 (지입기사 월별 정산서) ────────────────────────────────────────
// DispatchApp.jsx의 거래명세서(거래처용 청구서)와 같은 틀을 쓰되, 수신자가
// 거래처가 아니라 지입기사이고 금액 기준도 청구운임이 아니라 기사운임이다 —
// "회사가 거래처에 받을 돈"이 아니라 "회사가 기사에게 줄 돈"을 정리하는 문서.

// 거래명세서의 _parseWaypointList/mergeViaNames와 동일 로직 — DispatchApp.jsx가
// export하지 않아 그대로 가져올 수 없으므로 이 파일 안에 복제한다.
function _fmParseWaypointList(v) {
  if (Array.isArray(v) && v.length > 0) return v;
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {}
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const ks = Object.keys(v);
    if (ks.length > 0 && ks.every(k => /^\d+$/.test(k)))
      return ks.sort((a, b) => Number(a) - Number(b)).map(k => v[k]);
    if (v.업체명) return [v];
  }
  return [];
}
function fmMergeViaNames(waypointLists) {
  const names = [];
  for (const list of waypointLists) {
    for (const s of _fmParseWaypointList(list)) {
      const name = String(s?.업체명 || "").trim();
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names.join(", ");
}

// 거래명세서의 numberToKorean과 동일 — 합계금액을 "일금 ○○원정"으로 표기.
function fmNumberToKorean(num) {
  if (!num || num === 0) return "영";
  const units = ["", "만", "억", "조"];
  const nums = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const tens = ["", "십", "백", "천"];
  let result = "";
  let n = Math.abs(Math.round(num));
  let unitIndex = 0;
  while (n > 0) {
    const chunk = n % 10000;
    if (chunk > 0) {
      let chunkStr = "";
      let c = chunk;
      for (let i = 0; i < 4; i++) {
        const digit = c % 10;
        if (digit > 0) {
          const digitStr = (digit === 1 && i > 0) ? "" : nums[digit];
          chunkStr = digitStr + tens[i] + chunkStr;
        }
        c = Math.floor(c / 10);
      }
      result = chunkStr + units[unitIndex] + result;
    }
    n = Math.floor(n / 10000);
    unitIndex++;
  }
  return num < 0 ? "마이너스 " + result : result;
}

// 거래명세서의 addCanvasAsMultiPagePdf와 동일 — 내용이 길면 억지로 한 페이지에
// 욱여넣지 않고 A4 높이만큼 잘라 페이지를 늘린다.
function fmAddCanvasAsMultiPagePdf(pdf, canvas, { format = "PNG" } = {}) {
  const pageWidthMm = 210, pageHeightMm = 297;
  const pageHeightPx = Math.floor((canvas.width * pageHeightMm) / pageWidthMm);
  let renderedPx = 0;
  let pageIdx = 0;
  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
    const sliceImgData = pageCanvas.toDataURL(format === "JPEG" ? "image/jpeg" : "image/png");
    const sliceHeightMm = (sliceHeightPx * pageWidthMm) / canvas.width;
    if (pageIdx > 0) pdf.addPage();
    pdf.addImage(sliceImgData, format, 0, 0, pageWidthMm, sliceHeightMm);
    renderedPx += sliceHeightPx;
    pageIdx++;
  }
  return pdf;
}

// HandoverFareReport.jsx의 CANCELED_STATUSES와 동일 — 취소된 오더는 정산 대상에서 뺀다.
const FM_CANCELED_STATUSES = ["취소", "배차취소", "오더취소", "취소됨"];

function FleetSettlementTab({ drivers = [], dispatchData = [], role = "", companyName = "" }) {
  const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
  const won = (n) => toInt(n).toLocaleString();

  const [selId, setSelId] = useState("");
  const todayStr0 = kstDateStr();
  const [rangeStart, setRangeStart] = useState(`${todayStr0.slice(0, 7)}-01`);
  const [rangeEnd, setRangeEnd] = useState(todayStr0);
  const [applied, setApplied] = useState(null); // { driverId, start, end }
  const [rowFilter, setRowFilter] = useState("");

  // 이번달/지난달 퀵셀렉트 — 거래명세서와 동일한 기능.
  const setThisMonth = () => {
    const ym = todayStr0.slice(0, 7);
    const lastDay = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    setRangeStart(`${ym}-01`); setRangeEnd(`${ym}-${String(lastDay).padStart(2, "0")}`);
  };
  const setLastMonth = () => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    setRangeStart(`${ym}-01`); setRangeEnd(`${ym}-${String(lastDay).padStart(2, "0")}`);
  };

  const selectedDriver = useMemo(() => drivers.find(d => d.id === selId) || null, [drivers, selId]);

  // ⭐ RouteManagementTab의 ordersByPlate/ordersByName과 동일한 매칭 규칙 —
  // 차량번호가 있으면 차량번호 우선, 없으면 이름으로 매칭한다.
  const rowsRaw = useMemo(() => {
    if (!applied) return [];
    const driver = drivers.find(d => d.id === applied.driverId);
    if (!driver) return [];
    const plate = (driver.차량번호 || "").trim();
    const name = (driver.이름 || "").trim();
    let list = (dispatchData || []).filter(r => {
      const rPlate = (r.차량번호 || "").trim();
      const rName = (r.이름 || "").trim();
      return (plate && rPlate === plate) || (!plate && name && rName === name);
    });
    list = list.filter(r => (r.배차상태 || "") !== "배차취소" && !FM_CANCELED_STATUSES.includes(r.배차상태 || ""));
    // 기사에게 줄 돈이 0원인 오더는 정산서에 넣을 필요가 없다 (거래명세서가
    // 청구운임 0원 오더를 제외하는 것과 동일한 이유).
    list = list.filter(r => toInt(r.기사운임) > 0);
    if (applied.start) list = list.filter(r => (r.상차일 || "") >= applied.start);
    if (applied.end) list = list.filter(r => (r.상차일 || "") <= applied.end);
    return list.sort((a, b) => (a.상차일 || "").localeCompare(b.상차일 || ""));
  }, [dispatchData, drivers, applied]);

  const filterTerms = useMemo(
    () => rowFilter.split(/[,，]/).map(s => s.trim().toLowerCase()).filter(Boolean),
    [rowFilter]
  );
  const rows = useMemo(() => {
    if (filterTerms.length === 0) return rowsRaw;
    return rowsRaw.filter(r => {
      const via = fmMergeViaNames([r.경유상차목록, r.경유지_상차, r.경유하차목록, r.경유지_하차]);
      const hay = [r.거래처명, r.상차지명, r.하차지명, r.화물내용, via].join(" ").toLowerCase();
      return filterTerms.some(t => hay.includes(t));
    });
  }, [rowsRaw, filterTerms]);

  const mapped = useMemo(() => rows.map((r, i) => {
    const viaLists = [r.경유상차목록, r.경유지_상차, r.경유하차목록, r.경유지_하차];
    const via = fmMergeViaNames(viaLists);
    const 공급가액 = toInt(r.기사운임);
    return {
      idx: i + 1,
      날짜: r.상차일 || "",
      거래처명: r.거래처명 || "",
      상차지: r.상차지명 || r.상차지 || "",
      하차지: r.하차지명 || r.하차지 || "",
      경유지: via || "-",
      화물내용: r.화물내용 || "",
      톤수: r.차량톤수 || r.차량종류 || "",
      기사명: r.이름 || r.기사명 || "",
      차량번호: r.차량번호 || "",
      공급가액,
      세액: Math.round(공급가액 * 0.1),
    };
  }), [rows]);

  const 합계공급가 = mapped.reduce((a, b) => a + b.공급가액, 0);
  const 합계세액 = mapped.reduce((a, b) => a + b.세액, 0);

  // ★ 공급자(우리 회사) 정보 — 거래명세서의 COMPANY_PRINT와 동일한 소스
  // (transportApplications, 회사관리에서 등록한 사업자정보)를 그대로 읽어온다.
  // 회사마다 로그인 계정이 다르므로 companyName으로 자기 회사 문서를 찾는다.
  const [companyInfoDoc, setCompanyInfoDoc] = useState(null);
  useEffect(() => {
    const co = (companyName || "").trim();
    if (!co) return;
    const unsub = onSnapshot(collection(db, "transportApplications"), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      let found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규" && d.status === "approved");
      if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.type === "신규");
      if (!found) found = docs.find(d => (d.companyName || "").trim() === co && d.status === "approved");
      setCompanyInfoDoc(found || null);
    }, () => {});
    return () => unsub();
  }, [companyName]);

  const supplier = useMemo(() => {
    const d = companyInfoDoc || {};
    const co = (companyName || d.companyName || "").trim();
    const phone = d.phone || d.연락처 || "";
    const fax = d.fax || d.팩스 || d.팩스번호 || "";
    const contactParts = [];
    if (phone) contactParts.push(`TEL ${phone}`);
    if (fax) contactParts.push(`FAX ${fax}`);
    return {
      name: co,
      ceo: d.representative || d.대표자 || d.ceo || "",
      bizNo: d.businessNumber || d.사업자번호 || "",
      type: d.업태 || "운수업",
      item: d.종목 || "화물운송주선",
      addr: d.address || d.주소 || "",
      contact: contactParts.join(" / "),
      bank: d.계좌은행 ? `${d.계좌은행} ${d.계좌번호 || ""}`.trim() : "",
      email: d.email || "",
      seal: d.직인이미지 || "/seal.png",
    };
  }, [companyInfoDoc, companyName]);

  // ★ 공급받는자(지입기사) 정보 — drivers 컬렉션에는 사업자번호/주소 필드가 없어
  // (등급관리/기사등록에서 받는 값이 이름·차량번호·전화번호·거주지뿐) 있는
  // 값만 보여주고 없는 항목은 "-"로 둔다. 비어도 화면이 깨지지 않는다.
  const recipient = useMemo(() => {
    const d = selectedDriver || {};
    return {
      name: d.이름 || "",
      plate: d.차량번호 || "",
      phone: d.전화번호 ? formatPhone(d.전화번호) : "",
      addr: d.거주지 || "",
    };
  }, [selectedDriver]);

  const totalAmt = 합계공급가 + 합계세액;

  const runSearch = () => {
    if (!selId) { window.alert("지입기사를 먼저 선택하세요."); return; }
    if (!rangeStart || !rangeEnd) { window.alert("조회 기간을 입력하세요."); return; }
    if (rangeStart > rangeEnd) { window.alert("시작일이 종료일보다 늦을 수 없습니다."); return; }
    setApplied({ driverId: selId, start: rangeStart, end: rangeEnd });
  };

  const savePDF = async () => {
    const area = document.getElementById("settlementArea");
    if (!area) return;
    const canvas = await html2canvas(area, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF("p", "mm", "a4");
    fmAddCanvasAsMultiPagePdf(pdf, canvas, { format: "PNG" });
    pdf.save(`정산서_${recipient.name || "기사"}_${applied?.start || ""}~${applied?.end || ""}.pdf`);
  };

  const saveAsImage = async () => {
    const area = document.getElementById("settlementArea");
    if (!area) return;
    const canvas = await html2canvas(area, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const a = document.createElement("a");
    a.download = `정산서_${recipient.name || "기사"}_${applied?.start || ""}~${applied?.end || ""}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const downloadExcel = () => {
    if (!applied || !mapped.length) { window.alert("먼저 조회를 실행하세요."); return; }
    const rowsForSheet = mapped.map(m => ({
      날짜: m.날짜, 거래처명: m.거래처명, 상차지: m.상차지, 하차지: m.하차지, 경유지: m.경유지,
      화물내용: m.화물내용, 톤수: m.톤수, 기사명: m.기사명, 차량번호: m.차량번호,
      공급가액: m.공급가액, 세액: m.세액, 합계: m.공급가액 + m.세액,
    }));
    rowsForSheet.push({ 날짜: "", 거래처명: "", 상차지: "", 하차지: "", 경유지: "", 화물내용: "", 톤수: "", 기사명: "", 차량번호: "소 계", 공급가액: 합계공급가, 세액: 합계세액, 합계: totalAmt });
    const ws = XLSX.utils.json_to_sheet(rowsForSheet);
    const wb = XLSX.utils.book_new();
    wb.Props = { Title: "정산서" };
    XLSX.utils.book_append_sheet(wb, ws, "정산서");
    XLSX.writeFile(wb, `정산서_${recipient.name || "기사"}_${applied?.start || ""}~${applied?.end || ""}.xlsx`);
  };

  return (
    <div>
      {/* 검색 바 — 거래명세서/노선관리와 동일한 시작일~종료일 + 조회 패턴 */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: NAVY, whiteSpace: "nowrap" }}>지입기사 정산서</span>
          <select
            value={selId}
            onChange={e => setSelId(e.target.value)}
            style={{ flex: "0 0 auto", width: 190, maxWidth: 220, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 15, color: "#374151", background: "#fafafa", outline: "none" }}
          >
            <option value="">기사 선택</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.이름} ({d.차량번호})</option>)}
          </select>
          <CustomDatePicker value={rangeStart} onChange={e => setRangeStart(e.target.value)} placeholder="시작일"
            className="h-[34px] px-3 rounded-lg text-[13px] font-bold border border-gray-300 bg-white cursor-pointer" />
          <span style={{ color: "#9ca3af", fontSize: 13 }}>~</span>
          <CustomDatePicker value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} placeholder="종료일"
            className="h-[34px] px-3 rounded-lg text-[13px] font-bold border border-gray-300 bg-white cursor-pointer" />
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={setThisMonth} style={{ padding: "7px 12px", borderRadius: 7, border: "none", background: "#f3f4f6", color: "#6b7280", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>이번달</button>
            <button onClick={setLastMonth} style={{ padding: "7px 12px", borderRadius: 7, border: "none", background: "#f3f4f6", color: "#6b7280", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>지난달</button>
          </div>
          <button onClick={runSearch}
            style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: NAVY, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            조회
          </button>
          <button onClick={() => { setSelId(""); setApplied(null); setRowFilter(""); }}
            style={{ padding: "8px 16px", borderRadius: 7, border: "1px solid #d1d5db", background: "#fff", color: "#6b7280", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            초기화
          </button>
          {applied && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
              <button onClick={downloadExcel} style={{ padding: "7px 14px", borderRadius: "7px 0 0 7px", border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>엑셀</button>
              <button onClick={savePDF} style={{ padding: "7px 14px", borderRadius: 0, border: "1px solid #d1d5db", borderLeft: "none", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>PDF</button>
              <button onClick={saveAsImage} style={{ padding: "7px 14px", borderRadius: "0 7px 7px 0", border: "1px solid #d1d5db", borderLeft: "none", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>이미지저장</button>
            </div>
          )}
        </div>
        {applied && (
          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="세부검색 (거래처/상하차지/화물내용, 쉼표로 여러 개)"
              value={rowFilter}
              onChange={e => setRowFilter(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid #e5e7eb", fontSize: 13, width: 280, outline: "none" }}
            />
            {rowFilter && <button onClick={() => setRowFilter("")} style={{ padding: "6px 10px", borderRadius: 7, border: "none", background: "#f3f4f6", color: "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>검색초기화</button>}
          </div>
        )}
      </div>

      {!applied ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 15 }}>
          지입기사와 기간을 선택한 뒤 조회하세요.
        </div>
      ) : (
        <>
          {/* 요약 카드 — 발급 전에 한눈에 보이는 총 운행건수/총 지급액 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            <div style={{ background: NAVY, borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)" }}>총 운행건수</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{mapped.length}건</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>공급가액 합계</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: NAVY }}>{won(합계공급가)}원</div>
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>세액 포함 총 지급액</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#111827" }}>{won(totalAmt)}원</div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 60, textAlign: "center", color: "#9ca3af", fontSize: 15 }}>
              해당 기간에 정산할 운행 내역이 없습니다. (기사운임 0원·배차취소 오더는 제외됩니다)
            </div>
          ) : (
            <div id="settlementArea" style={{ width: "100%", maxWidth: 1100, margin: "0 auto", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,.05)" }}>
              {/* 헤더 */}
              <div style={{ background: NAVY, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>정산서</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,.6)", marginTop: 4 }}>정산기간 : {applied.start} ~ {applied.end}</div>
                </div>
                <div style={{ textAlign: "right", color: "rgba(255,255,255,.7)", fontSize: 12, lineHeight: 1.8 }}>
                  <div>{supplier.name} · 대표 {supplier.ceo}</div>
                  <div>{supplier.contact}</div>
                  <div>{supplier.bank}</div>
                </div>
              </div>

              {/* 공급자/공급받는자 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ padding: 20, borderRight: "1px solid #e5e7eb" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.08em" }}>공급받는자 (지입기사)</div>
                  <table style={{ width: "100%", fontSize: 13 }}><tbody>
                    {[["성명", recipient.name], ["차량번호", recipient.plate], ["연락처", recipient.phone], ["거주지", recipient.addr]].map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "6px 12px 6px 0", color: "#6b7280", fontWeight: 600, width: 80 }}>{k}</td>
                        <td style={{ padding: "6px 0", color: "#111827", fontWeight: 600 }}>{v || "-"}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
                <div style={{ padding: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.08em" }}>공급자 (운송회사)</div>
                  <table style={{ width: "100%", fontSize: 13 }}><tbody>
                    {[["상호", supplier.name], ["대표자", supplier.ceo], ["사업자번호", supplier.bizNo], ["주소", supplier.addr]].map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "6px 12px 6px 0", color: "#6b7280", fontWeight: 600, width: 80 }}>{k}</td>
                        <td style={{ padding: "6px 0", color: "#111827", fontWeight: 600 }}>{v || "-"}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              </div>

              {/* 합계금액 한글 표기 */}
              <div style={{ padding: "12px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><span style={{ fontSize: 13, fontWeight: 700, color: "#6b7280" }}>지급금액</span> <span style={{ fontSize: 12, color: "#9ca3af" }}>(공급가액+부가세)</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>일금 {fmNumberToKorean(totalAmt)} 원정</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#1d4ed8" }}>(￦ {won(totalAmt)})</span>
                </div>
              </div>

              {/* 내역 테이블 */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: NAVY }}>
                      {["No", "날짜", "거래처명", "상차지", "하차지", "경유지", "화물내용", "톤수", "기사명", "차량번호", "공급가액", "세액(10%)"].map(h => (
                        <th key={h} style={{ padding: "9px 10px", color: "#fff", fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.map((m, i) => (
                      <tr key={m.idx} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "7px 10px", textAlign: "center", color: "#9ca3af" }}>{m.idx}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", whiteSpace: "nowrap" }}>{m.날짜}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{m.거래처명 || "-"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{m.상차지}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{m.하차지}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{m.경유지}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{m.화물내용 || "-"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", whiteSpace: "nowrap" }}>{m.톤수 || "-"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{m.기사명}</td>
                        <td style={{ padding: "7px 10px", textAlign: "center", whiteSpace: "nowrap" }}>{m.차량번호}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 700 }}>{won(m.공급가액)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", color: "#1d4ed8" }}>{won(m.세액)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: NAVY }}>
                      <td colSpan={10} style={{ padding: "10px 16px", color: "#fff", fontWeight: 700, textAlign: "center" }}>합 계</td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: "#fff", fontWeight: 700 }}>{won(합계공급가)}</td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: "#93c5fd", fontWeight: 700 }}>{won(합계세액)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div style={{ padding: "16px 24px", background: "#f0f2f6", borderTop: `2px solid ${NAVY}`, fontSize: 15, fontWeight: 700, color: NAVY, textAlign: "center" }}>
                입금계좌: {supplier.bank || "-"} &nbsp;&nbsp;|&nbsp;&nbsp; 문의: {supplier.email || supplier.contact || "-"}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── CheckInLocModal ─────────────────────────────────────────────────────────

function CheckInLocModal({ title, initialLoc, onSave, onCancel }) {
  const [addr, setAddr] = React.useState(initialLoc?.name || "");
  const [result, setResult] = React.useState(initialLoc?.lat ? initialLoc : null);
  const [searching, setSearching] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSearch = async () => {
    const kw = addr.trim();
    if (!kw) return;
    setSearching(true);
    setError("");
    setResult(null);
    try {
      const url1 = `https://apis.openapi.sk.com/tmap/searchAddress?version=1&format=json&queryVersion=1&fullAddrOnOff=Y&searchKeyword=${encodeURIComponent(kw)}&countPerPage=1&appKey=${TMAP_KEY}`;
      const d1 = await fetch(url1).then(r => r.json());
      const coords1 = d1?.coordinateInfo?.coordinate;
      const first = Array.isArray(coords1) ? coords1[0] : coords1;
      if (first?.lat && first?.lon) {
        setResult({ name: kw, lat: parseFloat(first.lat), lng: parseFloat(first.lon) });
        return;
      }
      const url2 = `https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&format=json&fullAddr=${encodeURIComponent(kw)}`;
      const d2 = await fetch(url2, { headers: { appKey: TMAP_KEY, Accept: "application/json" } }).then(r => r.json());
      const coord = d2?.coordinateInfo?.coordinate?.[0];
      if (coord?.lat && coord?.lon) {
        setResult({ name: kw, lat: parseFloat(coord.lat), lng: parseFloat(coord.lon) });
        return;
      }
      setError("주소를 찾을 수 없습니다. 도로명 또는 지번 주소를 입력하세요.");
    } catch {
      setError("검색 중 오류가 발생했습니다.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "white", borderRadius: 16, padding: "28px 32px", width: 420, maxWidth: "90vw", boxShadow: "0 8px 32px rgba(0,0,0,.2)", fontFamily: "'Pretendard','Noto Sans KR',sans-serif" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#111827", marginBottom: 20 }}>{title}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            value={addr}
            onChange={e => setAddr(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="예: 인천시 서구 당하동 완정로8번길"
            style={{ flex: 1, padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 15, outline: "none", fontFamily: "inherit" }}
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: NAVY, color: "white", fontSize: 15, fontWeight: 700, cursor: searching ? "not-allowed" : "pointer", opacity: searching ? 0.6 : 1, whiteSpace: "nowrap", fontFamily: "inherit" }}
          >
            {searching ? "..." : "검색"}
          </button>
        </div>
        {error && <div style={{ fontSize: 14, color: "#ef4444", marginBottom: 10 }}>{error}</div>}
        {result && (
          <div style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 9, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{result.name}</div>
            <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 3 }}>{result.lat.toFixed(5)}, {result.lng.toFixed(5)}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={() => result && onSave(result)}
            disabled={!result}
            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: result ? NAVY : "#e5e7eb", color: result ? "white" : "#9ca3af", fontSize: 16, fontWeight: 700, cursor: result ? "pointer" : "not-allowed", fontFamily: "inherit" }}
          >
            저장
          </button>
          <button onClick={onCancel} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AttendanceTab ────────────────────────────────────────────────────────────

function AttendanceTab({ drivers }) {
  const todayStr = kstDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [allLogs, setAllLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "driver_logs"), orderBy("timestamp", "desc"), limit(3000)),
      (snap) => { setAllLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false)
    );
  }, []);

  const goDay = (delta) => {
    const d = new Date(selectedDate + "T12:00:00+09:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(kstDateStr(d));
  };

  const { attendance, noShow } = useMemo(() => {
    // Sort logs oldest-first for forward-scan session tracking
    const sorted = [...allLogs].sort((a, b) =>
      (resolveTs(a.timestamp)?.getTime()||0) - (resolveTs(b.timestamp)?.getTime()||0)
    );
    const byDriver = {};
    // Step 1: find all check-ins on the selected date (KST)
    sorted.forEach(log => {
      if (log.status !== "출근") return;
      if (toKSTDate(log.timestamp) !== selectedDate) return;
      const t = resolveTs(log.timestamp);
      if (!t) return;
      const uid = log.uid;
      if (!byDriver[uid]) byDriver[uid] = { uid, name: log.driverName || "-", carNo: log.carNo || "-", checkIn: t, checkOut: null, isFinal: false, distance: null };
      else if (t < byDriver[uid].checkIn) byDriver[uid].checkIn = t;
    });
    // Step 2: for each driver, scan forward from check-in for final checkout (may be next day)
    Object.values(byDriver).forEach(d => {
      const checkInMs = d.checkIn.getTime();
      for (const log of sorted) {
        const t = resolveTs(log.timestamp);
        if (!t || log.uid !== d.uid || t.getTime() <= checkInMs) continue;
        if (log.status === "최종퇴근") {
          d.checkOut = t; d.isFinal = true; d.distance = log.finalDistance ?? null;
          break;
        }
        if (log.status === "퇴근" && (!d.checkOut || t > d.checkOut)) d.checkOut = t;
      }
    });
    const attendedUids = new Set(Object.keys(byDriver));
    const noShow = selectedDate === todayStr ? drivers.filter(d => !attendedUids.has(d.id)) : [];
    return {
      attendance: Object.values(byDriver).sort((a, b) => (a.checkIn?.getTime() || 0) - (b.checkIn?.getTime() || 0)),
      noShow,
    };
  }, [allLogs, selectedDate, drivers, todayStr]);

  const fmtT = (d) => d ? `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` : "--";
  const fmtWork = (i, o) => {
    if (!i) return "--";
    const ms = (o || new Date()).getTime() - i.getTime();
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    const txt = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    if (!o) return <span style={{ color: "#10b981", fontWeight: 700 }}>{txt} (근무중)</span>;
    return txt;
  };

  const dateLabel = (() => {
    const d = new Date(selectedDate);
    return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${["일","월","화","수","목","금","토"][d.getDay()]})`;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 날짜 네비게이션 */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>출근기록부</span>
          <span style={{ fontSize: 16, color: "#6b7280", fontWeight: 600 }}>{dateLabel}</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
            <button onClick={() => goDay(-1)} style={{ padding: "6px 13px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "#374151" }}>이전일</button>
            <input type="date" value={selectedDate} max={todayStr} onChange={e => setSelectedDate(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 16, color: "#374151", outline: "none" }} />
            <button onClick={() => goDay(1)} disabled={selectedDate >= todayStr}
              style={{ padding: "6px 13px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: selectedDate >= todayStr ? "default" : "pointer", fontSize: 15, fontWeight: 600, color: selectedDate >= todayStr ? "#d1d5db" : "#374151" }}>다음일</button>
            {selectedDate !== todayStr && (
              <button onClick={() => setSelectedDate(todayStr)} style={{ padding: "6px 13px", border: "none", borderRadius: 7, background: NAVY, color: "#fff", cursor: "pointer", fontSize: 15, fontWeight: 700 }}>오늘</button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0f2f5" }}>
          {[
            { label: "출근", val: attendance.length, color: NAVY },
            { label: "미출근", val: Math.max(0, drivers.length - attendance.length), color: attendance.length < drivers.length ? "#dc2626" : "#374151" },
            { label: "근무중", val: attendance.filter(r => !r.checkOut).length, color: "#10b981" },
            { label: "퇴근 완료", val: attendance.filter(r => r.checkOut).length, color: "#374151" },
            { label: "전체 등록", val: drivers.length, color: "#6b7280" },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#9ca3af", letterSpacing: ".06em", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 출근 기록 테이블 */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "13px 20px", borderBottom: "1px solid #f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>출근 현황</span>
          <span style={{ fontSize: 16, color: "#6b7280" }}>{attendance.length}명 출근</span>
        </div>
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontSize: 17 }}>불러오는 중...</div>
        ) : attendance.length === 0 ? (
          <div style={{ padding: "44px", textAlign: "center", color: "#9ca3af", fontSize: 17 }}>해당 날짜에 출근 기록이 없습니다</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 17 }}>
            <thead>
              <tr style={{ background: "#f4f6fa", borderBottom: "2px solid #e5e7eb", position: "sticky", top: 0, zIndex: 1 }}>
                {["#", "기사명", "차량번호", "출근시각", "퇴근시각", "근무시간", "이동거리", "연료비", "상태"].map(col => (
                  <th key={col} style={{ padding: "12px 16px", textAlign: "left", color: "#374151", fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attendance.map((row, i) => (
                <tr key={row.uid} style={{ borderBottom: "1px solid #f0f2f5", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                  <td style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: 600, fontSize: 16 }}>{i + 1}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 700, color: "#111827", fontSize: 17 }}>{row.name}</td>
                  <td style={{ padding: "12px 16px", color: NAVY, fontWeight: 700, fontSize: 16, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>{row.carNo}</td>
                  <td style={{ padding: "12px 16px", color: "#1B2B4B", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 16 }}>{fmtT(row.checkIn)}</td>
                  <td style={{ padding: "12px 16px", color: row.checkOut ? "#374151" : "#9ca3af", fontVariantNumeric: "tabular-nums", fontSize: 16 }}>
                    {fmtT(row.checkOut)}
                    {row.isFinal && <span style={{ marginLeft: 7, fontSize: 13, color: "#6b7280", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>최종</span>}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 16 }}>{fmtWork(row.checkIn, row.checkOut)}</td>
                  <td style={{ padding: "12px 16px", color: "#374151", fontVariantNumeric: "tabular-nums", fontSize: 16 }}>
                    {row.distance != null
                      ? `${row.distance.toFixed(1)} km`
                      : (() => { const live = drivers.find(d => d.id === row.uid); return live ? `${(live.총거리 || 0).toFixed(1)} km` : "--"; })()}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#374151", fontVariantNumeric: "tabular-nums", fontSize: 16 }}>
                    {(() => {
                      const live = drivers.find(d => d.id === row.uid);
                      const km = row.distance != null ? row.distance : (live ? live.총거리 || 0 : null);
                      if (km == null || km <= 0) return "--";
                      const vt = String(live?.vehicleType || "").replace(/\s/g,"");
                      const eff = /25|28/.test(vt)?3.0:/11|15|18/.test(vt)?3.5:/1[^0-9]|2\.5|소형/.test(vt)?5.5:4.0;
                      return `${Math.round(km/eff*1750).toLocaleString()}원`;
                    })()}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {!row.checkOut
                      ? <span style={{ fontSize: 15, color: "#10b981", fontWeight: 700, background: "#d1fae5", padding: "3px 10px", borderRadius: 99 }}>근무중</span>
                      : row.isFinal
                        ? <span style={{ fontSize: 15, color: "#374151", background: "#f3f4f6", padding: "3px 10px", borderRadius: 99 }}>최종퇴근</span>
                        : <span style={{ fontSize: 15, color: "#6b7280", background: "#f3f4f6", padding: "3px 10px", borderRadius: 99 }}>퇴근</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 미출근 기사 (오늘만 표시) */}
      {selectedDate === todayStr && noShow.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 24px" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>미출근 기사 ({noShow.length}명)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {noShow.map(d => (
              <div key={d.id} style={{ padding: "7px 16px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa", fontSize: 16, color: "#374151", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#d1d5db", display: "inline-block" }} />
                {d.이름}
                <span style={{ color: "#9ca3af", fontWeight: 500, fontSize: 15 }}>{d.차량번호}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 온도 관제 탭 ─────────────────────────────────────────────────────────────
function TemperatureTab({ drivers }) {
  const [tempData, setTempData] = useState({});
  const [alarmSettings, setAlarmSettings] = useState([]); // { id, name, minA, maxA, minB, maxB, condition }
  const [alarmModal, setAlarmModal] = useState(false);
  const [editAlarm, setEditAlarm] = useState(null);
  const [filterStatus, setFilterStatus] = useState("전체");
  const [filterVehicle, setFilterVehicle] = useState("전체");
  const [searchQ, setSearchQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [newAlarm, setNewAlarm] = useState({ name: "", minA: "", maxA: "", minB: "", maxB: "", condition: "하나 이상 이탈 시" });

  // ⭐ Firestore 읽기/연결 절감 — 예전엔 기사 1명당 onSnapshot(doc(...)) 리스너를 하나씩
  // 만들어서, 기사 수만큼 개별 실시간 연결이 동시에 열려있었다(기사 100명이면 연결
  // 100개). drivers 배열의 참조가 바뀔 때마다(리렌더로 새 배열이 생성될 때마다) 전부
  // 해제 후 재생성되기도 했다. documentId()로 최대 30개씩 묶어(Firestore 'in' 쿼리
  // 한도) 훨씬 적은 수의 리스너로 합친다.
  useEffect(() => {
    const ids = drivers.map(d => d.id).filter(Boolean);
    if (!ids.length) { setTempData({}); return; }
    const chunks = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const unsubs = chunks.map(chunk =>
      onSnapshot(query(collection(db, "cargo_temp"), where(documentId(), "in", chunk)), snap => {
        setTempData(prev => {
          const next = { ...prev };
          snap.docs.forEach(d => { next[d.id] = d.data(); });
          return next;
        });
      }, () => {})
    );
    return () => unsubs.forEach(u => u());
  }, [drivers]);

  const getTempStatus = (td) => {
    if (!td || td.temperature == null) return "미연결";
    const t = td.temperature;
    const updAt = td.updatedAt?.toDate?.() || (td.updatedAt?.seconds ? new Date(td.updatedAt.seconds * 1000) : null);
    if (!updAt || Date.now() - updAt.getTime() > 10 * 60 * 1000) return "오프라인";
    // Check alarms
    for (const alarm of alarmSettings) {
      const minA = parseFloat(alarm.minA), maxA = parseFloat(alarm.maxA);
      if (!isNaN(minA) && !isNaN(maxA) && (t < minA || t > maxA)) return "이탈";
    }
    return "정상";
  };

  const filtered = drivers.filter(d => {
    const td = tempData[d.id];
    const status = getTempStatus(td);
    if (filterStatus !== "전체" && status !== filterStatus) return false;
    if (activeOnly && status === "미연결") return false;
    if (searchQ && !d.이름?.includes(searchQ) && !d.차량번호?.includes(searchQ)) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* 필터 + 버튼 바 */}
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, color: "#374151", background: "#f9fafb" }}>
          {["전체", "정상", "이탈", "오프라인", "미연결"].map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ position: "relative", flex: "1 1 160px" }}>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="차량번호, 이름..." style={{ width: "100%", padding: "7px 10px 7px 32px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, background: "#f9fafb", outline: "none", boxSizing: "border-box" }} />
          <svg width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2" viewBox="0 0 24 24" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/></svg>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: "#374151", cursor: "pointer", userSelect: "none" }}>
          <div onClick={() => setActiveOnly(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: activeOnly ? NAVY : "#e5e7eb", position: "relative", cursor: "pointer", transition: "background .2s" }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 2, left: activeOnly ? 18 : 2, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
          </div>
          활성 차량만 보기
        </label>
        <span style={{ fontSize: 14, color: "#9ca3af", marginLeft: "auto" }}>총 {filtered.length}건</span>
        <button onClick={() => setAlarmModal(true)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${NAVY}`, background: NAVY, color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>온도알림 설정</button>
      </div>

      {/* 테이블 */}
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <thead>
            <tr style={{ background: "#f4f6fa", borderBottom: "2px solid #e5e7eb" }}>
              {["ID", "차량정보", "알림명", "온도A (℃)", "온도B (℃)", "업데이트", "상태"].map(h => (
                <th key={h} style={{ padding: "11px 14px", textAlign: "left", color: "#374151", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "40px 20px", textAlign: "center", color: "#9ca3af", fontSize: 15 }}>조건에 맞는 차량이 없습니다</td></tr>
            ) : filtered.map((d, idx) => {
              const td = tempData[d.id];
              const temp = td?.temperature;
              const tempB = td?.temperatureB;
              const status = getTempStatus(td);
              const updAt = td?.updatedAt?.toDate?.() || (td?.updatedAt?.seconds ? new Date(td.updatedAt.seconds * 1000) : null);
              const matchAlarm = alarmSettings.find(a => {
                const minA = parseFloat(a.minA), maxA = parseFloat(a.maxA);
                return temp != null && !isNaN(minA) && !isNaN(maxA) && (temp < minA || temp > maxA);
              });
              const statusColors = { 정상: { bg: "#f0fdf4", color: "#15803d", border: "#86efac" }, 이탈: { bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" }, 오프라인: { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" }, 미연결: { bg: "#f3f4f6", color: "#9ca3af", border: "#e5e7eb" } };
              const sc = statusColors[status] || statusColors["미연결"];
              const bg = idx % 2 === 0 ? "#fff" : "#fafbfc";
              return (
                <tr key={d.id} style={{ background: bg, borderBottom: "1px solid #f0f2f5" }}>
                  <td style={{ padding: "11px 14px", color: "#9ca3af", fontWeight: 600, fontSize: 14 }}>{idx + 1}</td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    <div style={{ fontWeight: 700, color: NAVY, fontSize: 15 }}>{d.이름 || "-"}</div>
                    <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 1 }}>{d.차량번호} {d.vehicleType ? `· ${d.vehicleType}` : ""}</div>
                  </td>
                  <td style={{ padding: "11px 14px", color: "#374151", fontSize: 14 }}>
                    {matchAlarm ? <span style={{ fontWeight: 600, color: "#dc2626" }}>{matchAlarm.name}</span> : <span style={{ color: "#d1d5db" }}>–</span>}
                  </td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    {temp != null ? (
                      <span style={{ fontWeight: 800, fontSize: 16, color: temp <= -18 ? "#3b82f6" : temp <= 0 ? "#06b6d4" : temp > 25 ? "#ef4444" : "#374151", fontVariantNumeric: "tabular-nums" }}>{temp > 0 ? "+" : ""}{temp.toFixed(1)}℃</span>
                    ) : <span style={{ color: "#d1d5db", fontSize: 14 }}>–</span>}
                  </td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    {tempB != null ? (
                      <span style={{ fontWeight: 800, fontSize: 16, color: tempB <= -18 ? "#3b82f6" : tempB <= 0 ? "#06b6d4" : tempB > 25 ? "#ef4444" : "#374151", fontVariantNumeric: "tabular-nums" }}>{tempB > 0 ? "+" : ""}{tempB.toFixed(1)}℃</span>
                    ) : <span style={{ color: "#d1d5db", fontSize: 14 }}>–</span>}
                  </td>
                  <td style={{ padding: "11px 14px", color: "#6b7280", fontSize: 14, whiteSpace: "nowrap" }}>
                    {updAt ? `${String(updAt.getHours()).padStart(2,"0")}:${String(updAt.getMinutes()).padStart(2,"0")}` : "–"}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: sc.bg, border: `1px solid ${sc.border}`, fontSize: 13, fontWeight: 700, color: sc.color }}>
                      {status === "이탈" && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "fmBlink 0.8s ease-in-out infinite", display: "inline-block" }} />}
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 온도알림 설정 모달 */}
      {alarmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setAlarmModal(false)}>
          <div style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ background: NAVY, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ color: "white", fontWeight: 800, fontSize: 17 }}>온도알림 설정</div>
              <button onClick={() => setAlarmModal(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, color: "white", fontSize: 20, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 20 }}>
              {/* 새 알림 추가 */}
              <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px", marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12 }}>새 알림 추가</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input placeholder="알림명 (예: 냉동 유지)" value={newAlarm.name} onChange={e => setNewAlarm(p => ({...p, name: e.target.value}))} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, outline: "none" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 4, fontWeight: 600 }}>온도A 범위</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input placeholder="-20" value={newAlarm.minA} onChange={e => setNewAlarm(p => ({...p, minA: e.target.value}))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, outline: "none" }} />
                      <span style={{ fontSize: 14, color: "#9ca3af", flexShrink: 0 }}>~</span>
                      <input placeholder="0" value={newAlarm.maxA} onChange={e => setNewAlarm(p => ({...p, maxA: e.target.value}))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, outline: "none" }} />
                      <span style={{ fontSize: 13, color: "#9ca3af", flexShrink: 0 }}>℃</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 4, fontWeight: 600 }}>온도B 범위</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input placeholder="-10" value={newAlarm.minB} onChange={e => setNewAlarm(p => ({...p, minB: e.target.value}))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, outline: "none" }} />
                      <span style={{ fontSize: 14, color: "#9ca3af", flexShrink: 0 }}>~</span>
                      <input placeholder="0" value={newAlarm.maxB} onChange={e => setNewAlarm(p => ({...p, maxB: e.target.value}))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, outline: "none" }} />
                      <span style={{ fontSize: 13, color: "#9ca3af", flexShrink: 0 }}>℃</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <select value={newAlarm.condition} onChange={e => setNewAlarm(p => ({...p, condition: e.target.value}))} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 15, background: "white" }}>
                    {["하나 이상 이탈 시", "모두 이탈 시"].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <button onClick={() => { if (!newAlarm.name.trim()) return; setAlarmSettings(prev => [...prev, { ...newAlarm, id: Date.now() }]); setNewAlarm({ name: "", minA: "", maxA: "", minB: "", maxB: "", condition: "하나 이상 이탈 시" }); }} style={{ padding: "8px 18px", borderRadius: 8, background: NAVY, color: "white", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>추가</button>
                </div>
              </div>

              {/* 알림 목록 */}
              {alarmSettings.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: "#f4f6fa", borderBottom: "2px solid #e5e7eb" }}>
                      {["알림명", "온도A 최고/최저", "온도B 최고/최저", "알림조건", ""].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#374151", fontWeight: 700, fontSize: 13 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alarmSettings.map((a, i) => (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f0f2f5" }}>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: NAVY }}>{a.name}</td>
                        <td style={{ padding: "9px 12px", color: "#374151" }}>{a.maxA !== "" ? `${a.maxA}℃` : "–"}<br/><span style={{ color: "#9ca3af" }}>{a.minA !== "" ? `${a.minA}℃` : "–"}</span></td>
                        <td style={{ padding: "9px 12px", color: "#374151" }}>{a.maxB !== "" ? `${a.maxB}℃` : "–"}<br/><span style={{ color: "#9ca3af" }}>{a.minB !== "" ? `${a.minB}℃` : "–"}</span></td>
                        <td style={{ padding: "9px 12px", color: "#6b7280" }}>{a.condition}</td>
                        <td style={{ padding: "9px 12px" }}>
                          <button onClick={() => setAlarmSettings(prev => prev.filter(x => x.id !== a.id))} style={{ fontSize: 13, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>삭제</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {alarmSettings.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 15, padding: "20px 0" }}>등록된 알림이 없습니다</div>}
            </div>
          </div>
        </div>
      )}

      {/* IoT 연동 안내 */}
      <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 16px", marginTop: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>센서 데이터 경로</div>
        <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.7 }}>
          Firestore <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3 }}>cargo_temp / {"{driverId}"}</code> 에
          <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3, marginLeft: 4 }}>temperature</code>
          <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3, marginLeft: 4 }}>temperatureB</code>
          <code style={{ background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 3, marginLeft: 4 }}>updatedAt</code> 필드 기록 시 즉시 반영됩니다.
        </div>
      </div>
    </div>
  );
}

// ─── 적재함 카메라 탭 ─────────────────────────────────────────────────────────
function CargoCameraTab({ drivers }) {
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [streamTokens, setStreamTokens] = useState({});

  // Subscribe to stream tokens/status
  useEffect(() => {
    const unsubs = drivers.map(d => {
      return onSnapshot(
        doc(db, "cargo_camera", d.id),
        snap => {
          if (snap.exists()) setStreamTokens(prev => ({ ...prev, [d.id]: snap.data() }));
        },
        () => {}
      );
    });
    return () => unsubs.forEach(u => u());
  }, [drivers]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* 안내 배너 */}
      <div style={{ background:"linear-gradient(135deg, #1B2B4B 0%, #2d4a7a 100%)", borderRadius:14, padding:"20px 24px", display:"flex", alignItems:"flex-start", gap:16 }}>
        <div style={{ width:48, height:48, borderRadius:12, background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.9L15 14"/><rect x="1" y="6" width="14" height="12" rx="2"/></svg>
        </div>
        <div>
          <div style={{ color:"white", fontWeight:800, fontSize: 18, marginBottom:6 }}>적재함 카메라 관제</div>
          <div style={{ color:"rgba(255,255,255,0.75)", fontSize: 15, lineHeight:1.7 }}>
            차량 적재함 내부에 IP 카메라 또는 LTE 카메라를 설치하면 관리자가 실시간 영상을 확인할 수 있습니다.<br/>
            기사 앱에서도 현재 적재 상태를 영상으로 확인할 수 있습니다.
          </div>
          <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
            {["RTSP 스트림 지원", "HLS / DASH 호환", "모바일 뷰어 포함"].map(tag => (
              <span key={tag} style={{ background:"rgba(255,255,255,0.15)", borderRadius:20, padding:"3px 10px", color:"rgba(255,255,255,0.9)", fontSize: 13, fontWeight:600 }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 연동 절차 */}
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", padding:"20px 24px" }}>
        <div style={{ fontSize: 16, fontWeight:800, color:NAVY, marginBottom:16 }}>연동 절차</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:12 }}>
          {[
            { step:1, title:"카메라 설치", desc:"적재함 내부에 LTE 또는 WiFi IP 카메라를 설치합니다", icon:"📷" },
            { step:2, title:"스트림 URL 등록", desc:"Firestore cargo_camera/{driverId}에 streamUrl을 등록합니다", icon:"🔗" },
            { step:3, title:"HLS 변환 서버", desc:"RTSP → HLS 변환 서버(예: MediaMTX) 구성 후 토큰 발급", icon:"⚙️" },
            { step:4, title:"실시간 모니터링", desc:"이 화면에서 모든 차량 카메라를 동시에 확인합니다", icon:"🖥️" },
          ].map(s => (
            <div key={s.step} style={{ background:"#f8fafc", borderRadius:10, padding:"14px 16px", border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize: 24, marginBottom:8 }}>{s.icon}</div>
              <div style={{ fontSize: 14, fontWeight:800, color:NAVY, marginBottom:4 }}>STEP {s.step}. {s.title}</div>
              <div style={{ fontSize: 14, color:"#6b7280", lineHeight:1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 카메라 그리드 */}
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid #e5e7eb" }}>
          <div style={{ fontSize: 16, fontWeight:800, color:NAVY }}>카메라 모니터</div>
          <div style={{ fontSize: 14, color:"#9ca3af", marginTop:2 }}>카메라가 연결된 차량의 영상이 자동으로 표시됩니다</div>
        </div>
        {drivers.length === 0 ? (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"#9ca3af", fontSize: 15 }}>등록된 기사가 없습니다</div>
        ) : (
          <div style={{ padding:16, display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:12 }}>
            {drivers.map(d => {
              const cam = streamTokens[d.id];
              const hasStream = cam?.streamUrl && cam?.active;
              return (
                <div key={d.id} style={{ borderRadius:10, border:"1px solid #e5e7eb", overflow:"hidden", background:"#fafafa" }}>
                  {/* 카메라 뷰 */}
                  <div style={{ aspectRatio:"16/9", background:"#111827", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
                    {hasStream ? (
                      <video
                        src={cam.streamUrl}
                        autoPlay muted playsInline
                        style={{ width:"100%", height:"100%", objectFit:"cover" }}
                        onError={e => { e.target.style.display = "none"; }}
                      />
                    ) : (
                      <div style={{ textAlign:"center" }}>
                        <svg width="32" height="32" fill="none" stroke="#4b5563" strokeWidth="1.5" viewBox="0 0 24 24" style={{ marginBottom:8, display:"block", margin:"0 auto 8px" }}><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.87v6.26a1 1 0 0 1-1.447.9L15 14"/><rect x="1" y="6" width="14" height="12" rx="2"/><line x1="1" y1="1" x2="23" y2="23" stroke="#6b7280"/></svg>
                        <div style={{ fontSize: 14, color:"#6b7280" }}>카메라 미연결</div>
                      </div>
                    )}
                    {hasStream && (
                      <div style={{ position:"absolute", top:8, left:8, background:"rgba(239,68,68,0.9)", borderRadius:6, padding:"2px 8px", display:"flex", alignItems:"center", gap:4 }}>
                        <div style={{ width:5, height:5, borderRadius:"50%", background:"white", animation:"fmBlink 1s ease-in-out infinite" }} />
                        <span style={{ fontSize: 12, color:"white", fontWeight:700 }}>LIVE</span>
                      </div>
                    )}
                  </div>
                  {/* 기사 정보 */}
                  <div style={{ padding:"10px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight:700, color:NAVY }}>{d.이름}</div>
                      <div style={{ fontSize: 13, color:"#9ca3af" }}>{d.차량번호}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight:700, padding:"2px 8px", borderRadius:20, background: hasStream ? "#fef2f2" : "#f3f4f6", color: hasStream ? "#ef4444" : "#9ca3af" }}>
                      {hasStream ? "● LIVE" : "● OFF"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 권장 장비 */}
      <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:12, padding:"14px 18px" }}>
        <div style={{ fontSize: 14, fontWeight:700, color:"#92400e", marginBottom:6 }}>💡 권장 카메라 장비</div>
        <div style={{ fontSize: 14, color:"#78350f", lineHeight:1.7 }}>
          Reolink Go, TP-Link Tapo LTE 카메라 등 SIM 카드 내장 IP 카메라 또는 WiFi 카메라를 권장합니다.
          Firestore 경로 <code style={{ background:"rgba(0,0,0,0.06)", padding:"1px 5px", borderRadius:4, fontSize: 13 }}>cargo_camera / {"{"} driverId {"}"}</code>에
          <code style={{ background:"rgba(0,0,0,0.06)", padding:"1px 5px", borderRadius:4, fontSize: 13, marginLeft:4 }}>streamUrl (HLS)</code>,
          <code style={{ background:"rgba(0,0,0,0.06)", padding:"1px 5px", borderRadius:4, fontSize: 13, marginLeft:4 }}>active: true</code> 필드를 등록하면 즉시 표시됩니다.
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

// Inject pulse/ring keyframe animations once into <head> so markers always animate
// regardless of how many times divIcon HTML is re-created
(function injectFleetCSS() {
  if (typeof document === "undefined" || document.getElementById("fm-keyframes")) return;
  const s = document.createElement("style");
  s.id = "fm-keyframes";
  s.textContent = `
    @keyframes fmRing{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.8);opacity:0}}
    @keyframes fmDot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.25);opacity:.8}}
    @keyframes fmBlink{0%,100%{opacity:1}50%{opacity:0}}
  `;
  document.head.appendChild(s);
})();

export default function FleetManagement({ dispatchData = [], role = "" }) {
  // Tab persistence across parent-tab switches → sessionStorage
  // ⭐ 사용자 요청 — 지입차관리에 들어왔을 때 노선/배차상태/담당 차량이 먼저
  // 보여야 하므로, 기본 진입 탭을 실시간관제가 아닌 노선관리로 바꾼다.
  const [mainTab, setMainTab] = useState(() => sfGet("fm_tab", "route"));

  // Data — init from sessionStorage so page appears populated immediately on re-mount
  const [driversRaw, setDriversRaw] = useState(() => sfGet("fm_drivers_raw", []));
  const [usersMap,   setUsersMap]   = useState(() => sfGet("fm_users_map", {}));
  const [activityLogs, setActivityLogs] = useState(() => sfGet("fm_activity_logs", []));

  const [loading,     setLoading]     = useState(() => sfGet("fm_drivers_raw", []).length === 0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const [gpsTracks, setGpsTracks] = useState([]);
  const [roadPath, setRoadPath] = useState([]);
  const todayDate = kstDateStr();
  const yesterdayDate = kstDateStr(new Date(Date.now() - 86400_000));
  const [selectedTrackDate, setSelectedTrackDate] = useState(todayDate);
  const [pinModal, setPinModal] = useState(null); // { title, onConfirmed }
  const [companyDefaultLoc, setCompanyDefaultLoc] = useState(null);
  const [checkInLocModal, setCheckInLocModal] = useState(null); // { driverId, driverName, initialLoc }
  const [dropLocModal, setDropLocModal] = useState(null); // { driverId, driverName, initialLoc }
  const [companyLocModal, setCompanyLocModal] = useState(false);

  const [collisionAlerts, setCollisionAlerts] = useState([]);
  const [locChangeRequests, setLocChangeRequests] = useState([]);
  const [myCompanyName, setMyCompanyName] = useState(null);
  const [companyStaffRaw, setCompanyStaffRaw] = useState([]); // users(role: totalMaster/admin/user) — 담당자 위임 대상
  const myUid = auth.currentUser?.uid || null;
  const canDelegate = ["admin", "totalMaster"].includes(
    companyStaffRaw.find(u => u.id === myUid)?.role
  );
  const companyStaff = useMemo(
    () => companyStaffRaw
      .filter(u => !myCompanyName || u.companyName === myCompanyName)
      .map(u => ({ id: u.id, name: u.name || u.email || "이름없음" }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [companyStaffRaw, myCompanyName]
  );
  const myStaffName = companyStaff.find(u => u.id === myUid)?.name
    || auth.currentUser?.displayName || auth.currentUser?.email || "나";
  // ⭐ 사용자 요청 — 노선표 "배차담당자" 칸이 이름을 못 찾으면 계정 이메일을
  // 그대로 보여주고 있었다. 이메일 → 실명 매핑을 만들어 creatorLabel이 최종
  // 폴백으로 이메일 대신 이름을 쓸 수 있게 한다.
  const staffByEmail = useMemo(
    () => Object.fromEntries(companyStaffRaw.filter(u => u.email).map(u => [u.email, u.name || u.email])),
    [companyStaffRaw]
  );

  // 지입차 담당자 배정/위임 — drivers/{driverId} 문서의 담당자 필드를 바로 갱신한다.
  const assignDriverManager = useCallback(async (driverId, staff) => {
    try {
      await updateDoc(doc(db, "drivers", driverId), {
        담당자: staff ? { uid: staff.id, name: staff.name } : null,
      });
      // ⭐ 사용자 요청 — 오더 등록할 때 뜨는 상단 중앙 토스트와 동일한 방식/지속시간
      // (window.__sflowShowToast, DispatchApp.jsx가 마운트 시 노출해둔 전역 함수)으로
      // "누가 누구에게 위임했다"를 알려준다.
      const target = driversRaw.find(d => d.id === driverId);
      const label = target ? `${target.이름 || target.name || "기사"}(${target.차량번호 || target.carNo || "-"})` : "기사";
      const msg = staff
        ? `${myStaffName}님이 ${label}을 ${staff.name}님에게 위임했습니다`
        : `${myStaffName}님이 ${label}의 담당자를 해제했습니다`;
      window.__sflowShowToast?.(msg, "dispatch");
    } catch (e) { console.error("담당자 배정 실패:", e); alert("담당자 배정에 실패했습니다: " + (e?.message || e)); }
  }, [driversRaw, myStaffName]);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, driver }
  const [todayDriverPhotos, setTodayDriverPhotos] = useState([]); // today's driver_photo_logs for all drivers
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState(null); // { driverName, photos[] }
  const [photoLightbox, setPhotoLightbox] = useState(null); // { photos[], index, rotation }
  const [emergencyAlerts, setEmergencyAlerts] = useState([]); // unresolved emergency_alerts
  const emergencyAudioRef = useRef(null); // AudioContext for alarm sound
  const emergencyIntervalRef = useRef(null); // interval for repeating alarm
  const [newPhotoToast, setNewPhotoToast] = useState(null); // { driverName, actionType }
  const [historyPreselect, setHistoryPreselect] = useState(null);
  const [fitAllCount, setFitAllCount] = useState(0);
  const [searchQuery,   setSearchQuery]  = useState("");
  const [statusFilter,  setStatusFilter] = useState("전체");
  const [selected,      setSelected]     = useState(null);
  const [mapCenter,     setMapCenter]    = useState(null);
  const [selectedDriverLogs, setSelectedDriverLogs] = useState([]);

  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const osrmKeyRef  = useRef(null);  // "<driverId>-<date>" — prevents OSRM re-run on GPS point additions
  const osrmDoneRef = useRef(false); // true once OSRM succeeded for current key
  const lastMapRefreshRef = useRef(0); // ms timestamp of last map-center pan (throttled to 1 min)

  // Persist tab choice
  useEffect(() => { sfSet("fm_tab", mainTab); }, [mainTab]);

  // 현재 로그인한 관리자의 회사명 조회
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, "users", uid)).then(snap => {
      if (snap.exists()) setMyCompanyName(snap.data().companyName || null);
    }).catch(() => {});
  }, []);

  // 오늘 기사 사진 로그 실시간 구독 + 신규 업로드 알림
  const photoFirstLoad = useRef(true);
  useEffect(() => {
    const q = query(collection(db, "driver_photo_logs"), where("logDate", "==", todayDate));
    return onSnapshot(q, snap => {
      const photos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!photoFirstLoad.current) {
        snap.docChanges().forEach(ch => {
          if (ch.type === "added") {
            const p = ch.doc.data();
            setNewPhotoToast({ driverName: p.driverName || "-", carNo: p.carNo || "", actionType: p.actionType || "" });
            setTimeout(() => setNewPhotoToast(null), 5000);
          }
        });
      }
      photoFirstLoad.current = false;
      setTodayDriverPhotos(photos);
    });
  }, [todayDate]);

  // 긴급 알림 구독 + 알람 사운드
  useEffect(() => {
    const q = query(collection(db, "emergency_alerts"), where("resolved", "==", false));
    return onSnapshot(q, snap => {
      const alerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEmergencyAlerts(alerts);
      if (alerts.length > 0) {
        // Start repeating alarm if not already playing
        if (!emergencyIntervalRef.current) {
          const playAlarm = () => {
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)();
              [[880, 0, 0.15], [660, 0.18, 0.15], [880, 0.36, 0.15], [660, 0.54, 0.15]].forEach(([freq, delay, dur]) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = "square"; osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
                osc.start(ctx.currentTime + delay);
                osc.stop(ctx.currentTime + delay + dur);
              });
            } catch (_) {}
          };
          playAlarm();
          emergencyIntervalRef.current = setInterval(playAlarm, 3000);
        }
      } else {
        // No active alerts — stop alarm
        if (emergencyIntervalRef.current) {
          clearInterval(emergencyIntervalRef.current);
          emergencyIntervalRef.current = null;
        }
      }
    }, () => {});
  }, []);

  // Stop alarm on unmount
  useEffect(() => {
    return () => {
      if (emergencyIntervalRef.current) clearInterval(emergencyIntervalRef.current);
    };
  }, []);

  // ── 구독 ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const subs = [];

    // 1. Root drivers collection
    subs.push(onSnapshot(
      collection(db, "drivers"),
      (snap) => {
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setDriversRaw(arr);
        sfSet("fm_drivers_raw", arr);
        setLastUpdated(new Date());
        setLoading(false);
      },
      (err) => { console.error("drivers:", err); setLoading(false); }
    ));

    // 2. Users with role = driver
    subs.push(onSnapshot(
      query(collection(db, "users"), where("role", "==", "driver")),
      (snap) => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = d.data(); });
        setUsersMap(m);
        sfSet("fm_users_map", m);
      },
      (err) => console.error("users:", err)
    ));

    // 2-1. 배차자(관리자/일반) 목록 — "담당자 위임" 선택지로 쓴다. 회사 필터는
    // myCompanyName 로드 전에도 일단 전체를 받아두고 화면에서 걸러 쓴다.
    subs.push(onSnapshot(
      collection(db, "users"),
      (snap) => {
        const arr = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(u => ["totalMaster", "admin", "user"].includes(u.role));
        setCompanyStaffRaw(arr);
      },
      (err) => console.error("users(staff):", err)
    ));

    // 3. Collision alerts (unresolved, last 24h)
    subs.push(onSnapshot(
      query(collection(db, "collision_alerts"), where("resolved", "==", false), limit(20)),
      (snap) => {
        const cutoff = Date.now() - 86400000;
        const arr = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => (resolveTs(a.timestamp)?.getTime() || 0) > cutoff)
          .sort((a, b) => (resolveTs(b.timestamp)?.getTime()||0) - (resolveTs(a.timestamp)?.getTime()||0));
        setCollisionAlerts(arr);
      },
      () => {}
    ));

    // 4. Activity feed
    subs.push(onSnapshot(
      query(collection(db, "driver_logs"), orderBy("timestamp", "desc"), limit(50)),
      (snap) => {
        const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setActivityLogs(arr);
        sfSet("fm_activity_logs", arr);
      },
      (err) => console.error("driver_logs:", err)
    ));

    return () => subs.forEach(u => u?.());
  }, [refreshKey]);

  // ── 회사 기본 출근지 구독 ────────────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(
      doc(db, "fleet_settings", "default"),
      (snap) => setCompanyDefaultLoc(snap.exists() ? (snap.data().defaultCheckInLocation || null) : null),
      (err) => console.error("fleet_settings:", err)
    );
  }, []);

  // ── 출발지 변경 요청 구독 ───────────────────────────────────────────────
  useEffect(() => {
    return onSnapshot(
      query(collection(db, "location_change_requests"), where("status", "==", "pending"), limit(50)),
      (snap) => {
        const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        reqs.sort((a, b) => (resolveTs(b.requestedAt)?.getTime() || 0) - (resolveTs(a.requestedAt)?.getTime() || 0));
        setLocChangeRequests(reqs);
      },
      () => {}
    );
  }, []);

  // ── 선택 기사 로그 구독 ───────────────────────────────────────────────────
  // Use uid-only query (single-field index, no composite index needed) and sort client-side
  useEffect(() => {
    if (!selected?.id) { setSelectedDriverLogs([]); return; }
    return onSnapshot(
      query(collection(db, "driver_logs"), where("uid", "==", selected.id)),
      (snap) => {
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        logs.sort((a, b) => {
          const at = resolveTs(a.timestamp)?.getTime() || 0;
          const bt = resolveTs(b.timestamp)?.getTime() || 0;
          return bt - at;
        });
        setSelectedDriverLogs(logs);
      },
      (err) => console.error("selected logs:", err)
    );
  }, [selected?.id]);

  // ── GPS 트랙 구독 (선택된 기사, 선택 날짜) ───────────────────────────────
  // Composite indexes for (driverId+date+timestamp) may not exist in Firestore yet,
  // so we query by driverId only (single-field auto-index) and filter+sort client-side.
  useEffect(() => {
    if (!selected?.id) { setGpsTracks([]); return; }
    return onSnapshot(
      query(
        collection(db, "gps_tracks"),
        where("driverId", "==", selected.id),
        limit(2000)
      ),
      (snap) => {
        const tracks = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => toKSTDate(t.timestamp) === selectedTrackDate)
          .sort((a, b) => {
            const at = resolveTs(a.timestamp)?.getTime() || 0;
            const bt = resolveTs(b.timestamp)?.getTime() || 0;
            return at - bt;
          });
        setGpsTracks(tracks);
      },
      (err) => console.error("gps_tracks:", err)
    );
  }, [selected?.id, selectedTrackDate]);

  // ── 합성 drivers ─────────────────────────────────────────────────────────
  // Only include drivers who registered via DriverRegister (have usersMap entry)
  // AND have been approved. Filters out all old/orphaned drivers collection docs.
  const allFleetDrivers = useMemo(() => {
    return driversRaw
      .filter(raw => {
        const u = usersMap[raw.id];
        if (!u || u.approved !== true) return false;
        if (myCompanyName && u.companyName && u.companyName !== myCompanyName) return false;
        return true;
      })
      .map(raw => {
        const u = usersMap[raw.id];
        return {
          id: raw.id,
          이름: (u.name || raw.name || "").trim() || "-",
          차량번호: (u.carNo || raw.carNo || "").trim() || "-",
          vehicleType: u.vehicleType || raw.vehicleType || "-",
          phone: u.phone || raw.phone || "-",
          등급: raw.등급 || "일반",
          approved: true,
          상태: raw.status || raw.mainStatus || raw.state || "대기",
          location: raw.location || null,
          총거리: raw.totalDistance || 0,
          근무시간: raw.workMinutes || 0,
          updatedAt: raw.updatedAt,
          active: raw.active === true,
          speed: raw.speed || 0,
          workStartAt: raw.workStartAt || null,
          checkInLocation: raw.checkInLocation || null,
          dropLocation: raw.dropLocation || null,
          담당자: raw.담당자 || null,
        };
      })
      .sort((a, b) => statusPriority(a) - statusPriority(b));
  }, [driversRaw, usersMap]);

  // 지입차관리는 기사관리에서 등급을 "지입"/"직영"으로 지정한 기사만 대상으로 한다 —
  // 일반/블랙 등급 기사는 여기 표시되지 않고, 기사관리에서 등급을 바꾸면 실시간으로
  // 이 화면들(관제현황/이력조회/출근기록부/온도관제/적재함카메라/기사등록관리/노선관리)에
  // 자동으로 반영/제외된다.
  const drivers = useMemo(
    () => allFleetDrivers.filter(d => d.등급 === "지입" || d.등급 === "직영"),
    [allFleetDrivers]
  );

  // 노선관리는 GPS/앱 연동(usersMap 승인) 여부와 무관하게, 기사관리(PC)에서 등급을
  // "지입"/"직영"으로 지정한 기사라면 전부 보여야 한다 — 노선/오더 이력은 모바일 앱
  // 가입 여부와 관계없이 배차 데이터만으로 조회 가능하기 때문이다. allFleetDrivers는
  // "drivers" 문서에 매칭되는 usersMap(앱 가입+승인) 항목이 있어야만 포함시키므로,
  // 기사관리에서만 등록하고 기사용 앱은 아직 안 쓰는 지입 기사는 여기서 누락되는 문제가
  // 있었다 — driversRaw(기사관리가 쓰는 "drivers" 컬렉션 원본)에서 직접 등급만
  // 필터링한다.
  const routeDrivers = useMemo(() => {
    return driversRaw
      .filter(raw => raw.등급 === "지입" || raw.등급 === "직영")
      .map(raw => ({
        id: raw.id,
        이름: (raw.이름 || raw.name || "").trim() || "-",
        차량번호: (raw.차량번호 || raw.carNo || "").trim() || "-",
        전화번호: (raw.전화번호 || raw.phone || "").trim() || "-",
        등급: raw.등급,
        거주지: raw.거주지 || "",
        근무요일: raw.근무요일 || [],
        담당자: raw.담당자 || null,
      }))
      .sort((a, b) => a.이름.localeCompare(b.이름, "ko"));
  }, [driversRaw]);

  const driversMap = useMemo(() => {
    const m = {};
    drivers.forEach(d => { m[d.id] = d; });
    return m;
  }, [drivers]);

  // ── 선택 기사 이동 경로 (출근 → 최종퇴근 구간) ──────────────────────────
  // Prefer continuous gps_tracks; fall back to sparse driver_logs status points
  const selectedPath = useMemo(() => {
    // Session time window: 출근 ~ 최종퇴근
    const sorted = [...selectedDriverLogs].sort(
      (a, b) => (resolveTs(a.timestamp)?.getTime() || 0) - (resolveTs(b.timestamp)?.getTime() || 0)
    );
    const checkInLog  = sorted.find(l => l.status === "출근"      && toKSTDate(l.timestamp) === selectedTrackDate);
    const checkOutLog = [...sorted].reverse().find(l => l.status === "최종퇴근" && toKSTDate(l.timestamp) === selectedTrackDate);
    const checkInTime  = checkInLog  ? resolveTs(checkInLog.timestamp)?.getTime()  : null;
    const checkOutTime = checkOutLog ? resolveTs(checkOutLog.timestamp)?.getTime() : null;

    // Use GPS tracks when we have actual continuous waypoints
    if (gpsTracks.length >= 2) {
      const sessionTracks = checkInTime
        ? gpsTracks.filter(t => {
            const ts = resolveTs(t.timestamp)?.getTime() || 0;
            return ts >= checkInTime && (checkOutTime == null || ts <= checkOutTime);
          })
        : gpsTracks;
      const tracksToUse = sessionTracks.length >= 2 ? sessionTracks : gpsTracks;
      return tracksToUse.map(t => {
        const ts = resolveTs(t.timestamp)?.getTime() || 0;
        let status = "운행중";
        for (let i = sorted.length - 1; i >= 0; i--) {
          const logTs = resolveTs(sorted[i].timestamp)?.getTime() || 0;
          if (logTs <= ts) { status = sorted[i].status; break; }
        }
        return { lat: t.lat, lng: t.lng, status, timestamp: t.timestamp, dwell: null };
      });
    }
    // Fallback: use status change log positions from selected date's session
    const sessionStart = sorted.findIndex(l => l.status === "출근" && toKSTDate(l.timestamp) === selectedTrackDate);
    let sessionLogs = sessionStart >= 0
      ? sorted.slice(sessionStart)
      : sorted.filter(l => toKSTDate(l.timestamp) === selectedTrackDate);
    // Cut off at 최종퇴근
    const endIdx = sessionLogs.findIndex(l => l.status === "최종퇴근");
    if (endIdx >= 0) sessionLogs = sessionLogs.slice(0, endIdx + 1);
    const withLoc = sessionLogs.filter(l => l.location?.lat != null);
    if (withLoc.length === 0) return [];
    return withLoc.map((l, i, arr) => {
      const nextLog = arr[i + 1];
      const thisTs = resolveTs(l.timestamp);
      const nextTs = resolveTs(nextLog?.timestamp);
      const dwell = thisTs && nextTs ? nextTs.getTime() - thisTs.getTime() : null;
      return { lat: l.location.lat, lng: l.location.lng, status: l.status, timestamp: l.timestamp, dwell };
    });
  }, [selectedDriverLogs, gpsTracks, selectedTrackDate]);

  // ── 선택 날짜 세션 데이터 ──────────────────────────────────────────────────
  const sessionForDate = useMemo(() => {
    if (!selected?.id || !selectedDriverLogs.length) return { logs: [], workMs: 0, isActive: false };
    const sorted = [...selectedDriverLogs].sort((a, b) =>
      (resolveTs(a.timestamp)?.getTime()||0) - (resolveTs(b.timestamp)?.getTime()||0)
    );
    const checkInIdx = sorted.findIndex(l => l.status === "출근" && toKSTDate(l.timestamp) === selectedTrackDate);
    if (checkInIdx < 0) return { logs: [], workMs: 0, isActive: false };
    let endIdx = sorted.length - 1;
    let isFinalOut = false;
    for (let i = checkInIdx + 1; i < sorted.length; i++) {
      if (sorted[i].status === "최종퇴근") { endIdx = i; isFinalOut = true; break; }
    }
    const sessionLogs = sorted.slice(checkInIdx, endIdx + 1);
    const checkInTime = resolveTs(sorted[checkInIdx].timestamp);
    const endTime = isFinalOut ? resolveTs(sorted[endIdx].timestamp) : null;
    const workMs = endTime ? endTime.getTime() - checkInTime.getTime() : Date.now() - checkInTime.getTime();
    return { logs: sessionLogs, workMs, isActive: !isFinalOut };
  }, [selectedDriverLogs, selectedTrackDate, selected?.id]);

  // ── GPS 거리 (선택 날짜 트랙 기반) ─────────────────────────────────────────
  const sessionGpsDist = useMemo(() => {
    if (gpsTracks.length < 2) return 0;
    let dist = 0;
    for (let i = 1; i < gpsTracks.length; i++)
      dist += haversineKm(gpsTracks[i-1].lat, gpsTracks[i-1].lng, gpsTracks[i].lat, gpsTracks[i].lng);
    return dist;
  }, [gpsTracks]);

  // ── 실제 도로 경로 (OSRM) ─────────────────────────────────────────────────
  // Only re-fetches when driver or date changes — NOT on every new GPS point.
  useEffect(() => {
    const key = `${selected?.id ?? "none"}-${selectedTrackDate}`;

    // Driver or date changed → reset and prepare for a new fetch
    if (osrmKeyRef.current !== key) {
      osrmKeyRef.current = key;
      osrmDoneRef.current = false;
      setRoadPath([]);
    }

    // Already fetched successfully for this driver+date → keep existing road path
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

  // ── 필터링 ────────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const kw = searchQuery.trim().replace(/\s/g, "");
    return drivers.filter(d => {
      const carNoClean = (d.차량번호 || "").replace(/\s/g, "");
      const matchQ = !kw ||
        carNoClean.includes(kw) ||
        (d.이름 !== "-" && d.이름.includes(kw));
      const matchF = statusFilter === "전체" || d.상태 === statusFilter;
      return matchQ && matchF;
    });
  }, [drivers, searchQuery, statusFilter]);

  // 활동 피드: 승인된 기사의 로그만 표시
  const filteredActivityLogs = useMemo(() =>
    activityLogs.filter(log => driversMap[log.uid]),
    [activityLogs, driversMap]
  );

  // ── KPI ──────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => ({
    total: drivers.length,
    connected: drivers.filter(d => d.active).length,
    driving: drivers.filter(d => d.상태 === "운행중").length,
    onDuty: drivers.filter(d => ["출근", "상차중", "하차중", "운행중", "복귀중"].includes(d.상태)).length,
  }), [drivers]);

  const pendingCount = useMemo(() =>
    Object.values(usersMap).filter(u => !u.approved).length,
    [usersMap]
  );

  // ── 핸들러 ───────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setLoading(true);
    setRefreshKey(k => k + 1);
  }, []);

  const handleSelect = useCallback((d) => {
    setSelected(prev => (prev?.id === d.id ? null : d));
    if (d.location) setMapCenter(d.location);
  }, []);

  const handleFocusMap = useCallback((loc) => {
    if (loc?.lat) setMapCenter({ lat: loc.lat, lng: loc.lng, _t: Date.now() });
  }, []);

  const handleMapRefresh = useCallback(() => {
    const sel = selectedRef.current;
    const updated = sel ? drivers.find(d => d.id === sel.id) : null;
    const loc = updated?.location ?? sel?.location;
    if (loc?.lat) {
      lastMapRefreshRef.current = Date.now();
      setMapCenter({ lat: loc.lat, lng: loc.lng, _t: Date.now() });
    }
  }, [drivers]);

  const handleContextMenu = useCallback((e, d) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, driver: d });
  }, []);

  // Keep selected in sync with live data updates + auto-follow on map (1분 주기, 퇴근 시 중단)
  useEffect(() => {
    const sel = selectedRef.current;
    if (!sel) return;
    const updated = drivers.find(d => d.id === sel.id);
    if (!updated) return;
    setSelected(updated);
    const isCheckedOut = ["퇴근", "최종퇴근"].includes(updated.상태);
    if (updated.location && !isCheckedOut &&
        (updated.location.lat !== sel.location?.lat || updated.location.lng !== sel.location?.lng)) {
      const now = Date.now();
      if (now - lastMapRefreshRef.current >= 60000) {
        lastMapRefreshRef.current = now;
        setMapCenter({ lat: updated.location.lat, lng: updated.location.lng, _t: Date.now() });
      }
    }
  }, [drivers]);

  // ── 피드 전체 삭제 ────────────────────────────────────────────────────────
  const handleDeleteFeedLogs = useCallback(() => {
    setPinModal({
      title: "활동 피드 전체 삭제",
      onConfirmed: async () => {
        setPinModal(null);
        try {
          const logsToDelete = [...filteredActivityLogs];
          for (let i = 0; i < logsToDelete.length; i += 499) {
            const batch = writeBatch(db);
            logsToDelete.slice(i, i + 499).forEach(log => batch.delete(doc(db, "driver_logs", log.id)));
            await batch.commit();
          }
          const affectedUids = [...new Set(filteredActivityLogs.map(l => l.uid).filter(Boolean))];
          for (const uid of affectedUids) {
            const trackSnap = await getDocs(query(collection(db, "gps_tracks"), where("driverId", "==", uid)));
            for (let i = 0; i < trackSnap.docs.length; i += 499) {
              const batch = writeBatch(db);
              trackSnap.docs.slice(i, i + 499).forEach(d => batch.delete(d.ref));
              await batch.commit();
            }
          }
        } catch (e) { console.error("feed delete:", e); }
      },
    });
  }, [filteredActivityLogs]);

  // ── 선택 기사 로그 삭제 ───────────────────────────────────────────────────
  const handleDeleteDriverLogs = useCallback(() => {
    if (!selected) return;
    setPinModal({
      title: `${selected.이름} 이력 삭제`,
      onConfirmed: async () => {
        setPinModal(null);
        try {
          for (let i = 0; i < selectedDriverLogs.length; i += 499) {
            const batch = writeBatch(db);
            selectedDriverLogs.slice(i, i + 499).forEach(log => batch.delete(doc(db, "driver_logs", log.id)));
            await batch.commit();
          }
          const trackSnap = await getDocs(query(collection(db, "gps_tracks"), where("driverId", "==", selected.id)));
          for (let i = 0; i < trackSnap.docs.length; i += 499) {
            const batch = writeBatch(db);
            trackSnap.docs.slice(i, i + 499).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        } catch (e) { console.error("driver logs delete:", e); }
      },
    });
  }, [selected, selectedDriverLogs]);

  // ── 출근지 저장 ───────────────────────────────────────────────────────────
  const handleSaveDriverCheckInLoc = useCallback(async (loc) => {
    if (!checkInLocModal) return;
    try {
      await updateDoc(doc(db, "drivers", checkInLocModal.driverId), { checkInLocation: loc });
    } catch (e) { console.error("checkInLocation save:", e); }
    setCheckInLocModal(null);
  }, [checkInLocModal]);

  const handleClearDriverCheckInLoc = useCallback(async () => {
    if (!selected) return;
    try {
      await updateDoc(doc(db, "drivers", selected.id), { checkInLocation: null });
    } catch (e) { console.error("clear checkInLocation:", e); }
  }, [selected]);

  const handleSaveDriverDropLoc = useCallback(async (loc) => {
    if (!dropLocModal) return;
    try {
      await updateDoc(doc(db, "drivers", dropLocModal.driverId), { dropLocation: loc });
    } catch (e) { console.error("dropLocation save:", e); }
    setDropLocModal(null);
  }, [dropLocModal]);

  const handleClearDriverDropLoc = useCallback(async () => {
    if (!selected) return;
    try {
      await updateDoc(doc(db, "drivers", selected.id), { dropLocation: null });
    } catch (e) { console.error("clear dropLocation:", e); }
  }, [selected]);

  const handleSaveCompanyLoc = useCallback(async (loc) => {
    try {
      await setDoc(doc(db, "fleet_settings", "default"), { defaultCheckInLocation: loc }, { merge: true });
    } catch (e) { console.error("company loc save:", e); }
    setCompanyLocModal(false);
  }, []);

  // ─── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 16, padding: "4px 0",
      fontFamily: "'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif",
    }}>

      {/* ═══ 헤더 ═══ */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "15px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" fill="none" stroke="white" strokeWidth="1.7" viewBox="0 0 24 24">
              <rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 3v5h-7V8Z" />
              <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 21, fontWeight: 800, color: NAVY, margin: 0, letterSpacing: "-0.02em" }}>지입차량 관제</h1>
            <p style={{ fontSize: 15, color: "#6b7280", margin: "2px 0 0" }}>실시간 차량 모니터링 시스템</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {loading ? (
            <span style={{ fontSize: 15, color: "#9ca3af" }}>데이터 불러오는 중...</span>
          ) : lastUpdated ? (
            <span style={{ fontSize: 15, color: "#6b7280" }}>갱신: {lastUpdated.toLocaleTimeString("ko-KR")}</span>
          ) : null}

          <button
            onClick={() => setCompanyLocModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 15px", borderRadius: 8, border: "1px solid #d1d5db",
              background: "white", cursor: "pointer",
              fontSize: 16, fontWeight: 700, color: NAVY,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="10" r="3"/></svg>
            기본 출근지
          </button>

          <button
            onClick={handleRefresh}
            disabled={loading}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 15px", borderRadius: 8, border: "1px solid #d1d5db",
              background: loading ? "#f9fafb" : "white", cursor: loading ? "not-allowed" : "pointer",
              fontSize: 16, fontWeight: 700, color: loading ? "#9ca3af" : NAVY,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            새로고침
          </button>

          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 99, border: "1px solid #d1fae5", fontSize: 15, color: "#065f46", fontWeight: 600, background: "#f0fdf4" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block", animation: "fmLivePulse 2s infinite" }} />
            실시간 연결
          </span>
        </div>
      </div>

      {/* ═══ 메인 레이아웃: 왼쪽 메뉴 + 오른쪽 콘텐츠 ═══ */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* ── 왼쪽 메뉴 ── */}
        <div style={{
          width: 190, flexShrink: 0, background: "#fff", border: "1px solid #e5e7eb",
          borderRadius: 10, padding: 6, display: "flex", flexDirection: "column", gap: 2,
          position: "sticky", top: 12,
        }}>
          {[
            ["tracking", "관제현황"],
            ["route", "노선관리"],
            ["settlement", "정산관리"],
            ["history", "이력 조회"],
            ["attendance", "출근기록부"],
            ["temperature", "온도 관제"],
            ["cargo-camera", "적재함 카메라"],
            ["registration", "기사 등록 관리"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMainTab(key)}
              style={{
                padding: "11px 14px", border: "none", borderRadius: 7, textAlign: "left",
                background: mainTab === key ? NAVY : "transparent",
                color: mainTab === key ? "#fff" : "#374151",
                fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "all .15s",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}
            >
              {label}
              {key === "registration" && pendingCount > 0 && (
                <span style={{ background: "#ef4444", color: "white", fontSize: 14, fontWeight: 800, padding: "1px 7px", borderRadius: 99 }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── 오른쪽 콘텐츠 ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ─── 긴급 알림 배너 (모든 탭에서 상시 표시) ─── */}
      {emergencyAlerts.length > 0 && (
        <div style={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 4, animation: "fmBlink 0.8s ease-in-out infinite", boxShadow: "0 4px 24px rgba(239,68,68,0.4)" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "white", fontWeight: 900, fontSize: 17, marginBottom: 6 }}>🚨 긴급 상황 발생! ({emergencyAlerts.length}건)</div>
            {emergencyAlerts.map(alert => {
              const t = alert.timestamp?.toDate?.() || (alert.timestamp?.seconds ? new Date(alert.timestamp.seconds * 1000) : null);
              return (
                <div key={alert.id} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ color: "white", fontWeight: 800, fontSize: 16 }}>{alert.driverName || "-"} · {alert.carNo || "-"}</div>
                    {alert.location && <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 }}>위치: {alert.location.lat.toFixed(4)}, {alert.location.lng.toFixed(4)}</div>}
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 1 }}>{t ? `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")} 발생` : ""}</div>
                  </div>
                  <button
                    onClick={async () => { try { await updateDoc(doc(db, "emergency_alerts", alert.id), { resolved: true, resolvedAt: new Date() }); } catch (_) {} }}
                    style={{ padding: "8px 18px", borderRadius: 10, border: "2px solid white", background: "white", color: "#ef4444", fontSize: 15, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}
                  >확인 완료</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 관제현황 ═══ */}
      {mainTab === "tracking" && (
        <>
          {/* KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <KpiCard label="총 등록" value={kpi.total} sub="전체 기사 수" primary />
            <KpiCard label="현재 접속중" value={kpi.connected} sub="앱 활성" />
            <KpiCard label="운행중" value={kpi.driving} sub="현재 주행" accent="#10b981" />
            <KpiCard label="근무중" value={kpi.onDuty} sub="출근~복귀 합산" />
          </div>

          {/* 출발지 변경 요청 */}
          {locChangeRequests.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #d1d5db", borderLeft: "3px solid #374151", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#f8f9fb", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>출발지 변경 요청 {locChangeRequests.length}건</span>
                <span style={{ fontSize: 14, color: "#6b7280" }}>기사가 출발지 변경을 요청했습니다</span>
              </div>
              {locChangeRequests.map((req) => (
                <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{req.driverName || "-"}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#374151", background: "#f3f4f6", padding: "2px 8px", borderRadius: 5, fontFamily: "monospace" }}>{req.carNo || "-"}</span>
                  {req.currentLocation?.name && (
                    <span style={{ fontSize: 14, color: "#6b7280" }}>현재: {req.currentLocation.name}</span>
                  )}
                  <span style={{ fontSize: 14, color: "#6b7280", marginLeft: "auto" }}>{timeAgo(req.requestedAt)}</span>
                  <button
                    onClick={() => {
                      const drv = drivers.find(d => d.id === req.uid);
                      if (drv) {
                        setCheckInLocModal({ driverId: req.uid, driverName: req.driverName || drv.이름, initialLoc: drv.checkInLocation || null });
                      }
                    }}
                    style={{ padding: "3px 11px", borderRadius: 6, border: "1px solid #d1d5db", background: "white", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                  >
                    출발지 설정
                  </button>
                  <button
                    onClick={async () => { try { await updateDoc(doc(db, "location_change_requests", req.id), { status: "dismissed" }); } catch (_) {} }}
                    style={{ padding: "3px 11px", borderRadius: 6, border: "1px solid #e5e7eb", background: "white", color: "#9ca3af", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                  >
                    닫기
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 충돌 감지 알림 */}
          {collisionAlerts.length > 0 && (
            <div style={{ background: "#fff", border: "1px solid #d1d5db", borderLeft: "3px solid #1B2B4B", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: "#f8f9fb", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1B2B4B", flexShrink: 0, animation: "fmBlink 1s ease-in-out infinite" }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>충돌 감지 알림 {collisionAlerts.length}건</span>
                <span style={{ fontSize: 14, color: "#6b7280" }}>기기에서 강한 충격이 감지되었습니다</span>
              </div>
              {collisionAlerts.map((alert) => (
                <div key={alert.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{alert.driverName || "-"}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#374151", background: "#f3f4f6", padding: "2px 8px", borderRadius: 5, fontFamily: "monospace" }}>{alert.carNo || "-"}</span>
                  <span style={{ fontSize: 15, color: "#6b7280" }}>충격 {alert.magnitude} m/s²</span>
                  {alert.location?.lat && (
                    <span style={{ fontSize: 14, color: "#9ca3af" }}>{alert.location.lat.toFixed(4)}, {alert.location.lng.toFixed(4)}</span>
                  )}
                  <span style={{ fontSize: 14, color: "#6b7280", marginLeft: "auto" }}>{timeAgo(alert.timestamp)}</span>
                  <button
                    onClick={async () => { try { await updateDoc(doc(db, "collision_alerts", alert.id), { resolved: true }); } catch (_) {} }}
                    style={{ padding: "3px 11px", borderRadius: 6, border: "1px solid #d1d5db", background: "white", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                  >
                    확인 완료
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 검색 + 필터 */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 220px", minWidth: 160 }}>
              <svg width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2.2" viewBox="0 0 24 24" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="기사명 / 차량번호 검색  예) 88어8888"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: "100%", paddingLeft: 34, paddingRight: 10, paddingTop: 9, paddingBottom: 9, border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 16, color: "#374151", outline: "none", background: "#fafafa", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {STATUS_FILTER_OPTIONS.map(opt => {
                const active = statusFilter === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => setStatusFilter(opt)}
                    style={{
                      padding: "6px 12px", borderRadius: 7,
                      border: active ? `1.5px solid ${NAVY}` : "1px solid #e5e7eb",
                      background: active ? NAVY : "#fff",
                      color: active ? "#fff" : "#374151",
                      fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                      display: "inline-flex", alignItems: "center", gap: 5,
                    }}
                  >
                    {opt !== "전체" && (
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "rgba(255,255,255,.75)" : (STATUS_COLORS[opt] || "#9ca3af"), display: "inline-block" }} />
                    )}
                    {opt}
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 15, color: "#6b7280", marginLeft: "auto", whiteSpace: "nowrap", fontWeight: 600 }}>
              {filteredRows.length}명 / 전체 {drivers.length}명
            </span>
          </div>

          {/* 날짜별 동선 조회 */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
            <span style={{ fontSize: 14, fontWeight:700, color:"#6b7280", whiteSpace:"nowrap" }}>동선 날짜</span>
            <input
              type="date"
              value={selectedTrackDate}
              max={todayDate}
              onChange={e => setSelectedTrackDate(e.target.value)}
              style={{ padding:"5px 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize: 15, color:NAVY, outline:"none", width:"auto" }}
            />
            {selectedTrackDate !== yesterdayDate && (
              <button
                onClick={() => setSelectedTrackDate(yesterdayDate)}
                style={{ padding:"5px 11px", border:"1px solid #e5e7eb", borderRadius:7, background:"white", color:"#374151", fontSize: 14, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}
              >
                어제
              </button>
            )}
            {selectedTrackDate !== todayDate && (
              <button
                onClick={() => setSelectedTrackDate(todayDate)}
                style={{ padding:"5px 11px", border:"none", borderRadius:7, background:NAVY, color:"white", fontSize: 14, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}
              >
                오늘
              </button>
            )}
          </div>

          {/* 테이블 + 지도 */}
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", minHeight: 520 }}>
            <div style={{ flex: "0 0 40%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>기사 목록</span>
                <span style={{ fontSize: 15, color: "#6b7280", fontWeight: 600 }}>{filteredRows.length}명</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
                <DriverTable rows={filteredRows} selectedId={selected?.id} onSelect={handleSelect} onFocusMap={handleFocusMap} onContextMenu={handleContextMenu} todayPhotos={todayDriverPhotos} onViewPhotos={setPhotoViewerPhotos} />
              </div>
            </div>

            <div style={{ flex: "1 1 60%", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", minWidth: 0, minHeight: 520, position: "relative", isolation: "isolate" }}>
              <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1000, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ background: "rgba(255,255,255,0.93)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 13px", fontSize: 15, fontWeight: 700, color: NAVY, backdropFilter: "blur(4px)", boxShadow: "0 1px 6px rgba(0,0,0,.08)", display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  1분 주기 갱신
                  <span style={{ color: "#6b7280", fontWeight: 500 }}>{filteredRows.filter(d => d.location).length}대</span>
                </div>
                <button
                  onClick={handleMapRefresh}
                  title="지도 위치 즉시 새로고침"
                  style={{ background: "rgba(255,255,255,0.93)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 11px", fontSize: 14, fontWeight: 700, color: NAVY, backdropFilter: "blur(4px)", boxShadow: "0 1px 6px rgba(0,0,0,.08)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  새로고침
                </button>
                <button
                  onClick={() => setFitAllCount(c => c + 1)}
                  title="전체 기사 위치 맞추기"
                  style={{ background: "rgba(255,255,255,0.93)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 11px", fontSize: 14, fontWeight: 600, color: NAVY, backdropFilter: "blur(4px)", boxShadow: "0 1px 6px rgba(0,0,0,.08)", cursor: "pointer" }}
                >
                  전체 보기
                </button>
              </div>
              <FleetMap drivers={filteredRows} center={mapCenter} onSelect={handleSelect} selectedPath={selectedPath} roadPath={roadPath} fitAllCount={fitAllCount} selectedDriver={selected} />
            </div>
          </div>

          {/* 선택 기사 상세 */}
          {selected && (
            <DriverDetailPanel
              data={selected}
              logs={sessionForDate.logs.length > 0 ? [...sessionForDate.logs].reverse() : selectedDriverLogs}
              onClose={() => { setSelected(null); setSelectedDriverLogs([]); setGpsTracks([]); setRoadPath([]); }}
              onDeleteLogs={handleDeleteDriverLogs}
              checkInLoc={selected.checkInLocation || null}
              companyDefaultLoc={companyDefaultLoc}
              onSetCheckInLoc={() => setCheckInLocModal({ driverId: selected.id, driverName: selected.이름, initialLoc: selected.checkInLocation || null })}
              onClearCheckInLoc={handleClearDriverCheckInLoc}
              dropLoc={selected.dropLocation || null}
              onSetDropLoc={() => setDropLocModal({ driverId: selected.id, driverName: selected.이름, initialLoc: selected.dropLocation || null })}
              onClearDropLoc={handleClearDriverDropLoc}
              sessionWorkMs={sessionForDate.workMs}
              sessionIsActive={sessionForDate.isActive}
              sessionGpsDist={sessionGpsDist}
              onFocusMap={handleFocusMap}
            />
          )}

          {/* 실시간 활동 피드 */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#10b981", display: "inline-block", animation: "fmLivePulse 2s infinite" }} />
                <span style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>실시간 활동 피드</span>
                <span style={{ fontSize: 15, color: "#9ca3af" }}>기사가 버튼을 누를 때마다 즉시 기록</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15, color: "#6b7280", fontWeight: 600 }}>최근 {filteredActivityLogs.length}건</span>
                {filteredActivityLogs.length > 0 && (
                  <button
                    onClick={handleDeleteFeedLogs}
                    title="피드 전체 삭제"
                    style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #fca5a5", borderRadius: 7, background: "white", cursor: "pointer", color: "#ef4444", padding: 0 }}
                  >
                    <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2" strokeLinecap="round"/></svg>
                  </button>
                )}
              </div>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <ActivityFeed logs={filteredActivityLogs} driversMap={driversMap} onDeleteAll={handleDeleteFeedLogs} />
            </div>
          </div>
        </>
      )}

      {/* ═══ 노선관리 ═══ */}
      {mainTab === "route" && (
        <RouteManagementTab
          drivers={routeDrivers}
          dispatchData={dispatchData}
          liveDrivers={drivers}
          staff={companyStaff}
          canDelegate={canDelegate}
          onAssignManager={assignDriverManager}
          myUid={myUid}
          staffByEmail={staffByEmail}
          role={role}
        />
      )}

      {/* ═══ 정산관리 ═══ */}
      {/* routeDrivers를 쓰는 이유는 RouteManagementTab과 동일 — 기사용 앱 가입/승인
          여부와 무관하게 기사관리에서 등급만 지입/직영으로 지정되면 정산 대상이어야
          하기 때문이다. */}
      {mainTab === "settlement" && (
        <FleetSettlementTab drivers={routeDrivers} dispatchData={dispatchData} role={role} companyName={myCompanyName} />
      )}

      {/* ═══ 이력 조회 ═══ */}
      {mainTab === "history" && <HistoryTab drivers={drivers} defaultDriverId={historyPreselect} />}
      {mainTab === "attendance" && <AttendanceTab drivers={drivers} />}

      {/* ═══ 온도 관제 ═══ */}
      {mainTab === "temperature" && <TemperatureTab drivers={drivers} />}

      {/* ═══ 적재함 카메라 ═══ */}
      {mainTab === "cargo-camera" && <CargoCameraTab drivers={drivers} />}

      {/* ═══ 기사 등록 관리 ═══ */}
      {mainTab === "registration" && <RegistrationTab usersMap={usersMap} myCompanyName={myCompanyName} />}

        </div>
      </div>

      <style>{`
        @keyframes fmLivePulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>

      {pinModal && (
        <PinConfirmModal
          title={pinModal.title}
          onConfirmed={pinModal.onConfirmed}
          onCancel={() => setPinModal(null)}
        />
      )}

      {checkInLocModal && (
        <CheckInLocModal
          title={`${checkInLocModal.driverName} 출근지 설정`}
          initialLoc={checkInLocModal.initialLoc}
          onSave={handleSaveDriverCheckInLoc}
          onCancel={() => setCheckInLocModal(null)}
        />
      )}

      {dropLocModal && (
        <CheckInLocModal
          title={`${dropLocModal.driverName} 도착지 설정`}
          initialLoc={dropLocModal.initialLoc}
          onSave={handleSaveDriverDropLoc}
          onCancel={() => setDropLocModal(null)}
        />
      )}

      {companyLocModal && (
        <CheckInLocModal
          title="회사 기본 출근지 설정"
          initialLoc={companyDefaultLoc}
          onSave={handleSaveCompanyLoc}
          onCancel={() => setCompanyLocModal(false)}
        />
      )}

      {/* 우클릭 컨텍스트 메뉴 */}
      {contextMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            onClick={() => setContextMenu(null)}
            onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}
          />
          <div style={{
            position: "fixed",
            top: Math.min(contextMenu.y, window.innerHeight - 160),
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,.13)", zIndex: 9999, minWidth: 170, overflow: "hidden",
          }}>
            <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #f0f2f5" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{contextMenu.driver.이름}</div>
              <div style={{ fontSize: 14, color: "#6b7280", marginTop: 1 }}>{contextMenu.driver.차량번호}</div>
            </div>
            {[
              {
                label: "현재위치로 이동",
                icon: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" strokeLinecap="round"/><circle cx="12" cy="9" r="2.5"/></svg>,
                disabled: !contextMenu.driver.location,
                action: () => { handleFocusMap(contextMenu.driver.location); setContextMenu(null); },
              },
              {
                label: "기사 선택 / 상세보기",
                icon: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" strokeLinecap="round"/></svg>,
                action: () => { handleSelect(contextMenu.driver); setContextMenu(null); },
              },
              {
                label: "이력 조회",
                icon: <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
                action: () => { setHistoryPreselect(contextMenu.driver.id); setMainTab("history"); setContextMenu(null); },
              },
            ].map((item, i) => (
              <button
                key={i}
                onClick={item.disabled ? undefined : item.action}
                style={{
                  width: "100%", padding: "9px 14px", display: "flex", alignItems: "center", gap: 9,
                  background: "none", border: "none", cursor: item.disabled ? "default" : "pointer",
                  fontSize: 15, color: item.disabled ? "#d1d5db" : "#374151", fontWeight: 600, textAlign: "left",
                }}
                onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = "#f3f4f6"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ─── 사진 뷰어 모달 ─── */}
      {photoViewerPhotos && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
          onClick={() => setPhotoViewerPhotos(null)}>
          <div style={{ background:"white", borderRadius:20, width:"100%", maxWidth:560, maxHeight:"85vh", overflow:"hidden", display:"flex", flexDirection:"column" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background:NAVY, padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <div>
                <div style={{ color:"white", fontWeight:800, fontSize: 18 }}>{photoViewerPhotos.driverName} 첨부 사진</div>
                <div style={{ color:"rgba(255,255,255,0.6)", fontSize: 14, marginTop:2 }}>오늘 업로드된 사진 {photoViewerPhotos.photos.length}장 · 클릭하면 크게 봅니다</div>
              </div>
              <button onClick={() => setPhotoViewerPhotos(null)} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", fontSize: 20, width:32, height:32, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <div style={{ overflowY:"auto", padding:20, flex:1 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {photoViewerPhotos.photos.map((p, idx) => {
                  const t = p.timestamp?.toDate?.() || (p.timestamp?.seconds ? new Date(p.timestamp.seconds * 1000) : null);
                  return (
                    <div key={p.id} style={{ borderRadius:12, overflow:"hidden", border:"1px solid #e5e7eb", boxShadow:"0 1px 4px rgba(0,0,0,0.06)", cursor:"pointer" }}
                      onClick={() => setPhotoLightbox({ photos: photoViewerPhotos.photos, index: idx, rotation: 0 })}>
                      <div style={{ position:"relative", overflow:"hidden" }}>
                        <img src={p.imageBase64} alt={p.actionType} style={{ width:"100%", aspectRatio:"4/3", objectFit:"cover", display:"block", transition:"transform .2s" }}
                          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04)"}
                          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"} />
                        <div style={{ position:"absolute", top:6, right:6, background:"rgba(0,0,0,0.4)", borderRadius:6, padding:"2px 6px" }}>
                          <svg width="12" height="12" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                        </div>
                      </div>
                      <div style={{ padding:"8px 12px", background:"#f9fafb" }}>
                        <div style={{ fontSize: 14, fontWeight:700, color:NAVY }}>{p.actionType}</div>
                        <div style={{ fontSize: 13, color:"#9ca3af", marginTop:2 }}>{t ? `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}` : "-"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 사진 라이트박스 ─── */}
      {photoLightbox && (() => {
        const { photos, index, rotation } = photoLightbox;
        const p = photos[index];
        const t = p.timestamp?.toDate?.() || (p.timestamp?.seconds ? new Date(p.timestamp.seconds * 1000) : null);
        const handleDownload = () => {
          const a = document.createElement("a");
          a.href = p.imageBase64;
          a.download = `${p.driverName || "driver"}_${p.actionType}_${t ? `${String(t.getHours()).padStart(2,"0")}${String(t.getMinutes()).padStart(2,"0")}` : index}.jpg`;
          a.click();
        };
        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:199999, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}
            onClick={() => setPhotoLightbox(null)}>
            {/* 툴바 */}
            <div style={{ position:"absolute", top:0, left:0, right:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", background:"rgba(0,0,0,0.5)", zIndex:1 }}
              onClick={e => e.stopPropagation()}>
              <div>
                <div style={{ color:"white", fontWeight:700, fontSize: 16 }}>{p.driverName} — {p.actionType}</div>
                <div style={{ color:"rgba(255,255,255,0.55)", fontSize: 14, marginTop:2 }}>{t ? `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")} ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}` : ""} · {index+1}/{photos.length}</div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <button onClick={() => setPhotoLightbox(lb => ({ ...lb, rotation: (lb.rotation - 90 + 360) % 360 }))}
                  style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }} title="왼쪽 회전">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
                <button onClick={() => setPhotoLightbox(lb => ({ ...lb, rotation: (lb.rotation + 90) % 360 }))}
                  style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }} title="오른쪽 회전">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M16 3h5v5"/></svg>
                </button>
                <button onClick={handleDownload}
                  style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }} title="저장">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button onClick={() => setPhotoLightbox(null)}
                  style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", fontSize: 20, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
            </div>
            {/* 이미지 */}
            <div onClick={e => e.stopPropagation()} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", width:"100%", padding:"72px 60px 60px" }}>
              <img src={p.imageBase64} alt={p.actionType} style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", transform:`rotate(${rotation}deg)`, transition:"transform .25s", borderRadius:8, boxShadow:"0 4px 40px rgba(0,0,0,0.6)" }} />
            </div>
            {/* 이전/다음 */}
            {index > 0 && (
              <button onClick={e => { e.stopPropagation(); setPhotoLightbox(lb => ({ ...lb, index: lb.index - 1, rotation: 0 })); }}
                style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, color:"white", width:44, height:44, fontSize: 24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
            )}
            {index < photos.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setPhotoLightbox(lb => ({ ...lb, index: lb.index + 1, rotation: 0 })); }}
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, color:"white", width:44, height:44, fontSize: 24, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            )}
            {/* 썸네일 스트립 */}
            {photos.length > 1 && (
              <div onClick={e => e.stopPropagation()} style={{ position:"absolute", bottom:0, left:0, right:0, display:"flex", justifyContent:"center", gap:8, padding:"12px 20px 16px", background:"rgba(0,0,0,0.5)" }}>
                {photos.map((ph, i) => (
                  <div key={ph.id} onClick={() => setPhotoLightbox(lb => ({ ...lb, index: i, rotation: 0 }))} style={{ width:48, height:48, borderRadius:6, overflow:"hidden", cursor:"pointer", border:i === index ? "2px solid white" : "2px solid rgba(255,255,255,0.2)", flexShrink:0 }}>
                    <img src={ph.imageBase64} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── 신규 사진 업로드 알림 토스트 ─── */}
      {newPhotoToast && (
        <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", zIndex:999999, background:"linear-gradient(135deg, #1B2B4B 0%, #2d4a7a 100%)", borderRadius:16, boxShadow:"0 8px 32px rgba(0,0,0,0.25)", padding:"12px 20px", display:"flex", alignItems:"center", gap:12, minWidth:300, maxWidth:"90vw" }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="18" height="18" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ color:"white", fontWeight:700, fontSize: 15 }}>사진 업로드</div>
            <div style={{ color:"rgba(255,255,255,0.8)", fontSize: 14, marginTop:2 }}>{newPhotoToast.driverName} ({newPhotoToast.carNo}) — {newPhotoToast.actionType}</div>
          </div>
          <button onClick={() => setNewPhotoToast(null)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.5)", fontSize: 20, cursor:"pointer" }}>×</button>
        </div>
      )}

    </div>
  );
}

// ======================= END =======================
