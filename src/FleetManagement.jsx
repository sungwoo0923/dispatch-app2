// ======================= FleetManagement.jsx =======================
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { db, auth } from "./firebase";
import {
  collection, onSnapshot, doc, updateDoc, setDoc, getDoc, getDocs,
  query, where, orderBy, limit, deleteDoc, writeBatch,
} from "firebase/firestore";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";

// ─── 상수 ────────────────────────────────────────────────────────────────────

const NAVY = "#1B2B4B";
const NAVY_DARK = "#131e35";
const NAVY_LIGHT = "#243454";

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
      <span style={{ fontSize: 14, fontWeight: 700, color: "#1B2B4B" }}>{status || "확인중"}</span>
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
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", color: "#d1d5db", marginBottom: 6, textTransform: "uppercase" }}>FLEET MANAGEMENT</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: NAVY }}>{heading}</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6 }}>{sub}</div>
        </div>
        <div key={animKey} style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: i < entered.length ? NAVY : "white", border: `2px solid ${i < entered.length ? NAVY : "#d1d5db"}`, transition: "all .15s" }} />
          ))}
        </div>
        {error && <div style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "#ef4444", background: "#fef2f2", borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[1,2,3,4,5,6,7,8,9,null,0,"←"].map((d, i) => (
            <button key={i} onClick={() => d !== null && handleKey(d === "←" ? "back" : String(d))} disabled={d === null}
              style={{ height: 52, borderRadius: 12, border: "1px solid #e5e7eb", background: d === "←" ? "#f3f4f6" : "#f8f9fb", color: d === "←" ? "#6b7280" : NAVY, fontSize: d === "←" ? 15 : 18, fontWeight: 600, cursor: d === null ? "default" : "pointer", opacity: d === null ? 0 : 1, fontFamily: "inherit" }}
            >{d}</button>
          ))}
        </div>
        {mode === "verify" && (
          <button onClick={() => { localStorage.removeItem(FLEET_PIN_KEY); setMode("setup1"); setEntered(""); setError(""); setFirstPin(""); }}
            style={{ width: "100%", marginTop: 16, textAlign: "center", fontSize: 12, color: "#d1d5db", background: "none", border: "none", cursor: "pointer" }}>
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
              <div style={{ fontSize: 14, fontWeight: 800, color: stage === "pin" ? "#ef4444" : "#3b82f6", marginBottom: 6 }}>
                {stage === "pin" ? title : "비밀번호 설정"}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", whiteSpace: "pre-line" }}>{subText}</div>
            </div>
            <div key={animKey} style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: i < entered.length ? dotColor : "white", border: `2px solid ${i < entered.length ? dotColor : "#d1d5db"}`, transition: "all .15s" }} />
              ))}
            </div>
            {error && <div style={{ textAlign: "center", fontSize: 12, color: "#ef4444", marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[1,2,3,4,5,6,7,8,9,null,0,"←"].map((d, i) => (
                <button key={i} onClick={() => d !== null && handleKey(d === "←" ? "back" : String(d))} disabled={d === null}
                  style={{ height: 46, borderRadius: 10, border: "1px solid #e5e7eb", background: d === "←" ? "#f3f4f6" : "#f8f9fb", color: "#374151", fontSize: d === "←" ? 14 : 17, fontWeight: 600, cursor: d === null ? "default" : "pointer", opacity: d === null ? 0 : 1, fontFamily: "inherit" }}
                >{d}</button>
              ))}
            </div>
            <button onClick={onCancel} style={{ width: "100%", marginTop: 14, padding: "10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ width: 54, height: 54, background: "#fef2f2", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="26" height="26" fill="none" stroke="#ef4444" strokeWidth="1.8" viewBox="0 0 24 24">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 6 }}>정말 삭제하시겠습니까?</div>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>이 작업은 되돌릴 수 없습니다</div>
            </div>
            <button onClick={onConfirmed} style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: "#ef4444", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>
              완전 삭제
            </button>
            <button onClick={onCancel} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
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
        <p style={{ color: "rgba(255,255,255,.65)", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", margin: "0 0 8px" }}>{label}</p>
        <p style={{ color: "#fff", fontSize: 32, fontWeight: 800, lineHeight: 1, margin: 0 }}>{value}</p>
        {sub && <p style={{ color: "rgba(255,255,255,.45)", fontSize: 12, margin: "7px 0 0" }}>{sub}</p>}
      </div>
    );
  }
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 22px" }}>
      <p style={{ color: "#6b7280", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", margin: "0 0 8px" }}>{label}</p>
      <p style={{ color: accent || NAVY, fontSize: 32, fontWeight: 800, lineHeight: 1, margin: 0 }}>{value}</p>
      {sub && <p style={{ color: "#9ca3af", fontSize: 12, margin: "7px 0 0" }}>{sub}</p>}
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
        <p style={{ fontSize: 14, fontWeight: 600 }}>조건에 맞는 기사가 없습니다</p>
      </div>
    );
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr style={{ background: "#f4f6fa", borderBottom: "2px solid #e5e7eb", position: "sticky", top: 0, zIndex: 1 }}>
          {COL_HEADERS.map(col => (
            <th key={col} style={{ padding: "11px 14px", textAlign: "left", color: "#374151", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", letterSpacing: "-.01em" }}>
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
              <td style={{ padding: "11px 14px", color: "#9ca3af", fontWeight: 600, fontSize: 13 }}>{idx + 1}</td>

              {/* 이름 */}
              <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.active ? "#10b981" : "#d1d5db", display: "inline-block", flexShrink: 0 }} title={d.active ? "접속중" : "미접속"} />
                  <span style={{ color: sel ? "#1e3a5f" : "#111827", fontWeight: 700, fontSize: 14 }}>{d.이름 || "-"}</span>
                </div>
              </td>

              {/* 차량번호 */}
              <td style={{ padding: "11px 14px", color: "#1B2B4B", whiteSpace: "nowrap", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>
                {d.차량번호 || "-"}
              </td>

              {/* 차종 */}
              <td style={{ padding: "11px 14px", color: "#374151", whiteSpace: "nowrap", fontSize: 13 }}>
                {d.vehicleType || "-"}
              </td>

              {/* 현재상태 */}
              <td style={{ padding: "11px 14px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[d.상태] || "#9ca3af", display: "inline-block" }} />
                  <span style={{ color: "#1B2B4B", fontWeight: 700, fontSize: 13 }}>{d.상태 || "대기"}</span>
                </span>
              </td>

              {/* 속력 */}
              <td style={{ padding: "11px 14px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {(d.speed || 0) > 0 ? (
                  <span style={{ fontSize: 13, fontWeight: 700, color: (d.speed||0) > 80 ? "#ef4444" : "#1B2B4B" }}>{d.speed} km/h</span>
                ) : (
                  <span style={{ fontSize: 12, color: "#d1d5db" }}>–</span>
                )}
              </td>

              {/* 주행시간 */}
              <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                {(() => {
                  const ws = d.workStartAt;
                  if (!ws) return <span style={{ fontSize: 12, color: "#d1d5db" }}>–</span>;
                  const start = ws?.toDate?.() || (ws?.seconds ? new Date(ws.seconds * 1000) : null);
                  if (!start) return <span style={{ fontSize: 12, color: "#d1d5db" }}>–</span>;
                  const isOut = d.상태 === "퇴근" || d.상태 === "최종퇴근";
                  const ms = isOut && d.근무시간
                    ? d.근무시간 * 60 * 1000
                    : Date.now() - start.getTime();
                  const h = Math.floor(ms / 3600000);
                  const m = Math.floor((ms % 3600000) / 60000);
                  return <span style={{ fontSize: 12, color: "#374151", fontVariantNumeric: "tabular-nums" }}>{h > 0 ? `${h}시간 ` : ""}{m}분</span>;
                })()}
              </td>

              {/* 이동거리 */}
              <td style={{ padding: "11px 14px", color: "#374151", whiteSpace: "nowrap", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                {(d.총거리 || 0).toFixed(1)} km
              </td>

              {/* 업데이트 */}
              <td style={{ padding: "11px 14px", color: "#6b7280", whiteSpace: "nowrap", fontSize: 13 }}>
                {timeAgo(d.updatedAt)}
              </td>

              {/* 활성화 */}
              <td style={{ padding: "11px 12px", whiteSpace: "nowrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, background: d.active ? "#f0fdf4" : "#f3f4f6", border: `1px solid ${d.active ? "#86efac" : "#e5e7eb"}` }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: d.active ? "#10b981" : "#d1d5db", display: "inline-block", animation: d.active ? "fmBlink 2s ease-in-out infinite" : "none" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: d.active ? "#15803d" : "#9ca3af" }}>{d.active ? "활성" : "비활성"}</span>
                </span>
              </td>

              {/* 첨부 사진 */}
              <td style={{ padding: "11px 10px", whiteSpace: "nowrap", textAlign: "center" }}>
                {(() => {
                  const driverPhotos = todayPhotos.filter(p => p.uid === d.id);
                  if (!driverPhotos.length) return <span style={{ fontSize: 12, color: "#d1d5db" }}>–</span>;
                  return (
                    <button
                      onClick={e => { e.stopPropagation(); onViewPhotos?.({ driverName: d.이름, photos: driverPhotos }); }}
                      style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer" }}
                      title="사진 보기"
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(27,43,75,0.08)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <svg width="16" height="16" fill="none" stroke={NAVY} strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, background: "#059669", color: "white", fontSize: 9, fontWeight: 800, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
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
              <div style={{ fontSize: 13, lineHeight: 1.7, fontFamily: "'Noto Sans KR',sans-serif" }}>
                <span style={{ fontWeight: 700, color }}>● {p.status}</span>
                <div style={{ color: "#6b7280", marginTop: 2 }}>{formatTime(p.timestamp)}</div>
                {p.dwell > 60000 && (
                  <div style={{ color: "#9ca3af", fontSize: 12 }}>체류 {formatMs(p.dwell)}</div>
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
              <div style={{ fontSize: 13, lineHeight: 1.8, minWidth: 155, fontFamily: "'Noto Sans KR',sans-serif" }}>
                <div style={{ fontWeight: 800, color: NAVY, marginBottom: 4, fontSize: 14 }}>
                  {d.이름 || "-"}
                  <span style={{ fontWeight: 500, color: "#6b7280", fontFamily: "monospace", fontSize: 12, marginLeft: 6 }}>{d.차량번호 || ""}</span>
                </div>
                <StatusBadge status={d.상태} size={8} />
                <div style={{ color: "#6b7280", marginTop: 4, fontSize: 13 }}>이동거리: {(d.총거리 || 0).toFixed(1)} km</div>
                <div style={{ color: "#9ca3af", fontSize: 12 }}>업데이트: {timeAgo(d.updatedAt)}</div>
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
          <span style={{ fontSize: 13, fontWeight: 700, color: statusColor, background: `${statusColor}18`, padding: "2px 8px", borderRadius: 99 }}>{log.status}</span>
          <span style={{ fontSize: 12, color: "#4b5563", fontWeight: 600 }}>{timeAgo(log.timestamp)}</span>
        </div>
        {hasLoc && (
          <div
            onClick={() => setShowCoords(v => !v)}
            style={{ fontSize: 12, color: "#6b7280", marginBottom: 1, cursor: "pointer", textDecoration: "underline dotted", display: "inline-block" }}
            title={showCoords ? "클릭하여 주소 표시" : "클릭하여 좌표 표시"}
          >
            {showCoords
              ? `${log.location.lat.toFixed(5)}, ${log.location.lng.toFixed(5)}`
              : (address || "주소 조회중...")}
          </div>
        )}
      </div>
      <div style={{ fontSize: 12, color: "#4b5563", flexShrink: 0, paddingTop: 2, fontWeight: 600, whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</div>
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
      <div style={{ padding: "36px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
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
              <span style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>{group.name}</span>
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 700, letterSpacing: "0.04em" }}>{group.carNo}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: statusColor, background: `${statusColor}18`, padding: "2px 8px", borderRadius: 99 }}>{group.latestStatus}</span>
              <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>{group.logs.length}건</span>
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
            <span style={{ fontSize: 19, fontWeight: 800, color: NAVY }}>{data.이름 || "-"}</span>
            <span style={{ fontSize: 13, color: "#374151", background: "#f0f2f5", padding: "3px 9px", borderRadius: 5, fontWeight: 700, letterSpacing: "0.04em" }}>{data.차량번호 || "-"}</span>
            {data.vehicleType && data.vehicleType !== "-" && (
              <span style={{ fontSize: 13, color: "#6b7280", padding: "3px 9px", border: "1px solid #e5e7eb", borderRadius: 99 }}>{data.vehicleType}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 7, flexWrap: "wrap" }}>
            <StatusBadge status={data.상태} size={9} />
            {dwellMs !== null && dwellMs > 60000 && (
              <span style={{ fontSize: 13, color: "#6b7280" }}>
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
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", margin: "0 0 6px" }}>{label}</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: color || NAVY, margin: 0 }}>{val}</p>
          </div>
        ))}
      </div>

      {/* 출근지 / 도착지 */}
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
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase" }}>{label}</span>
              <div style={{ display: "flex", gap: 5 }}>
                {onClear && (
                  <button onClick={onClear} style={{ padding: "2px 8px", borderRadius: 5, border: "1px solid #e5e7eb", background: "white", color: "#9ca3af", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>해제</button>
                )}
                {onSet && (
                  <button onClick={onSet} style={{ padding: "2px 8px", borderRadius: 5, border: `1px solid ${NAVY}`, background: "white", color: NAVY, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{loc ? "수정" : "설정"}</button>
                )}
              </div>
            </div>
            {loc ? (
              <div style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{loc.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</div>
              </div>
            ) : defaultLoc ? (
              <div style={{ background: "#f8f9fb", border: "1px dashed #d1d5db", borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 1 }}>{defaultLabel}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{defaultLoc.name}</div>
              </div>
            ) : (
              <div style={{ background: "#f8f9fb", border: "1px dashed #d1d5db", borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ fontSize: 12, color: "#9ca3af" }}>미설정</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Log history */}
      {logs.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", letterSpacing: ".09em", textTransform: "uppercase", margin: 0 }}>상태 이력 (이동 동선)</p>
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
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1B2B4B" }}>{log.status}</span>
                      {duration !== null && duration > 60000 && (
                        <span style={{ fontSize: 12, color: "#4b5563", fontWeight: 600 }}>{formatMs(duration)} 체류</span>
                      )}
                    </div>
                    {log.location?.lat != null && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {log.location.lat.toFixed(5)}, {log.location.lng.toFixed(5)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#4b5563", flexShrink: 0, fontWeight: 700, whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</div>
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
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{d.name || "-"}</div>
        <div style={{ fontSize: 13, color: "#374151", marginTop: 2, fontWeight: 700, letterSpacing: "0.04em" }}>{d.carNo || "-"}</div>
      </div>
      <span style={{ fontSize: 13, color: "#374151", padding: "3px 10px", border: "1px solid #e5e7eb", borderRadius: 99, background: "#fafafa", flexShrink: 0 }}>
        {d.vehicleType || "-"}
      </span>
      {d.companyName && (
        <span style={{ fontSize: 12, color: "#6b7280", padding: "3px 10px", border: "1px solid #e5e7eb", borderRadius: 99, background: "#f9fafb", flexShrink: 0 }}>
          {d.companyName}
        </span>
      )}
      <div style={{ fontSize: 14, color: "#374151", flex: 1, minWidth: 110 }}>{d.phone || "-"}</div>
      <div style={{ fontSize: 13, color: "#9ca3af", flexShrink: 0 }}>{d.createdAt ? formatDate(d.createdAt) : "-"}</div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        {canApprove ? (
          <>
            <button
              onClick={() => handleApprove(d.uid, true)}
              disabled={approvingId === d.uid}
              style={{ padding: "7px 18px", borderRadius: 8, border: "none", background: NAVY, color: "white", fontSize: 14, fontWeight: 700, cursor: approvingId === d.uid ? "not-allowed" : "pointer", opacity: approvingId === d.uid ? 0.6 : 1 }}
            >
              {approvingId === d.uid ? "처리중..." : "승인"}
            </button>
            <button
              onClick={() => handleApprove(d.uid, false)}
              disabled={!!approvingId}
              style={{ padding: "7px 15px", borderRadius: 8, border: "1px solid #fca5a5", background: "white", color: "#dc2626", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              거절
            </button>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700, background: "#d1fae5", padding: "3px 11px", borderRadius: 99 }}>승인됨</span>
            <button
              onClick={() => handleApprove(d.uid, false)}
              disabled={!!approvingId}
              style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid #e5e7eb", background: "white", color: "#9ca3af", fontSize: 13, cursor: "pointer" }}
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
            <span style={{ fontSize: 15, fontWeight: 800, color: "#92400e" }}>가입 승인 대기 ({pending.length}명)</span>
          </div>
          {pending.map(d => <DriverRow key={d.uid} d={d} canApprove={true} />)}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#10b981" }} />
          <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>등록 기사 ({approved.length}명)</span>
        </div>
        {approved.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>승인된 기사가 없습니다</div>
        ) : (
          approved.map(d => <DriverRow key={d.uid} d={d} canApprove={false} />)
        )}
      </div>
    </div>
  );
}

// ─── HistoryTab ──────────────────────────────────────────────────────────────

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

  useEffect(() => {
    if (!applied) return;
    setLoading(true);
    setLogs([]);
    setGpsDist(null);
    const from = new Date(applied.from + "T00:00:00+09:00");
    const to = new Date(applied.to + "T23:59:59+09:00");

    const logUnsub = onSnapshot(
      query(collection(db, "driver_logs"), where("uid", "==", applied.driverId)),
      (snap) => {
        const filtered = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(l => { const t = resolveTs(l.timestamp); return t && t >= from && t <= to; })
          .sort((a, b) => (resolveTs(a.timestamp)?.getTime()||0) - (resolveTs(b.timestamp)?.getTime()||0));
        setLogs(filtered);
        setLoading(false);
      },
      () => setLoading(false)
    );

    const gpsUnsub = onSnapshot(
      query(collection(db, "gps_tracks"), where("driverId", "==", applied.driverId), limit(2000)),
      (snap) => {
        const tracks = snap.docs.map(d => d.data())
          .filter(t => { const ts = resolveTs(t.timestamp); return ts && ts >= from && ts <= to; })
          .sort((a, b) => (resolveTs(a.timestamp)?.getTime()||0) - (resolveTs(b.timestamp)?.getTime()||0));
        let dist = 0;
        for (let i = 1; i < tracks.length; i++) dist += haversineKm(tracks[i-1].lat, tracks[i-1].lng, tracks[i].lat, tracks[i].lng);
        setGpsDist(dist > 0.01 ? dist : null);
      }
    );

    const photoUnsub = onSnapshot(
      query(collection(db, "driver_photo_logs"), where("uid", "==", applied.driverId)),
      (snap) => {
        const photos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(p => { const t = resolveTs(p.timestamp); return t && t >= from && t <= to; })
          .sort((a, b) => (resolveTs(a.timestamp)?.getTime()||0) - (resolveTs(b.timestamp)?.getTime()||0));
        setDriverPhotos(photos);
      }
    );

    return () => { logUnsub(); gpsUnsub(); photoUnsub(); };
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
          <span style={{ fontSize: 14, fontWeight: 800, color: NAVY, whiteSpace: "nowrap" }}>기사 이력 조회</span>
          <select
            value={selId}
            onChange={e => setSelId(e.target.value)}
            style={{ flex: "0 0 auto", width: 180, maxWidth: 200, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, color: "#374151", background: "#fafafa", outline: "none" }}
          >
            <option value="">기사 선택</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.이름} ({d.차량번호})</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={fromDate} max={todayStr} onChange={e => setFromDate(e.target.value)}
              style={{ padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, color: "#374151", background: "#fafafa", outline: "none" }} />
            <span style={{ color: "#9ca3af", fontSize: 13 }}>~</span>
            <input type="date" value={toDate} max={todayStr} onChange={e => setToDate(e.target.value)}
              style={{ padding: "7px 8px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 13, color: "#374151", background: "#fafafa", outline: "none" }} />
          </div>
          <button
            onClick={() => {
              if (!selId) return;
              const d = drivers.find(x => x.id === selId);
              setApplied({ driverId: selId, from: fromDate, to: toDate, driverName: d?.이름 || "", carNo: d?.차량번호 || "" });
            }}
            disabled={!selId}
            style={{ padding: "8px 20px", borderRadius: 7, border: "none", background: selId ? NAVY : "#e5e7eb", color: selId ? "white" : "#9ca3af", fontSize: 13, fontWeight: 700, cursor: selId ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
          >
            조회
          </button>
        </div>
      </div>

      {/* 결과 */}
      {applied && (loading ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "48px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>조회 중...</div>
      ) : logs.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#6b7280", fontWeight: 700 }}>해당 기간의 기록이 없습니다</div>
          <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 6 }}>{applied.from === applied.to ? applied.from : `${applied.from} ~ ${applied.to}`}</div>
        </div>
      ) : (
        <>
          {/* 기사 헤더 */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px 24px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="22" height="22" fill="none" stroke="white" strokeWidth="1.7" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{applied.driverName}</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{applied.carNo} · {applied.from === applied.to ? applied.from : `${applied.from} ~ ${applied.to}`}</div>
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
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 7 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* 날짜별 타임라인 */}
          {groupedByDate.map(([dateKey, dateLogs]) => (
            <div key={dateKey} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 22px", background: "#f8f9fb", borderBottom: "1px solid #eaecf0", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{dateKey}</span>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>{dateLogs.length}건</span>
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
                          <span style={{ fontSize: 14, fontWeight: 800, color, background: `${color}15`, padding: "2px 10px", borderRadius: 99 }}>{log.status}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", fontVariantNumeric: "tabular-nums" }}>{t ? formatTime(t) : "--"}</span>
                          {durMs != null && durMs > 60000 && (
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>{formatMs(durMs)} 체류</span>
                          )}
                        </div>
                        {log.location?.lat != null && (
                          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
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
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 10, letterSpacing: "0.05em" }}>첨부 사진 · 클릭하면 크게 봅니다</div>
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
                              <div style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{p.actionType}</div>
                              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{t ? `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}` : "-"}</div>
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
                <div style={{ color:"white", fontWeight:700, fontSize:14 }}>{p.driverName} — {p.actionType}</div>
                <div style={{ color:"rgba(255,255,255,0.55)", fontSize:12, marginTop:2 }}>{t ? `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")} ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}` : ""} · {index+1}/{photos.length}</div>
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
                <button onClick={() => setHistPhotoLightbox(null)} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
            </div>
            <div onClick={e => e.stopPropagation()} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", width:"100%", padding:"72px 60px 60px" }}>
              <img src={p.imageBase64} alt={p.actionType} style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", transform:`rotate(${rotation}deg)`, transition:"transform .25s", borderRadius:8, boxShadow:"0 4px 40px rgba(0,0,0,0.6)" }} />
            </div>
            {index > 0 && (
              <button onClick={e => { e.stopPropagation(); setHistPhotoLightbox(lb => ({ ...lb, index: lb.index - 1, rotation: 0 })); }} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, color:"white", width:44, height:44, fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
            )}
            {index < photos.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setHistPhotoLightbox(lb => ({ ...lb, index: lb.index + 1, rotation: 0 })); }} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, color:"white", width:44, height:44, fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
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
        <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 20 }}>{title}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            value={addr}
            onChange={e => setAddr(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="예: 인천시 서구 당하동 완정로8번길"
            style={{ flex: 1, padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none", fontFamily: "inherit" }}
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: NAVY, color: "white", fontSize: 13, fontWeight: 700, cursor: searching ? "not-allowed" : "pointer", opacity: searching ? 0.6 : 1, whiteSpace: "nowrap", fontFamily: "inherit" }}
          >
            {searching ? "..." : "검색"}
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 10 }}>{error}</div>}
        {result && (
          <div style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 9, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{result.name}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{result.lat.toFixed(5)}, {result.lng.toFixed(5)}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={() => result && onSave(result)}
            disabled={!result}
            style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: result ? NAVY : "#e5e7eb", color: result ? "white" : "#9ca3af", fontSize: 14, fontWeight: 700, cursor: result ? "pointer" : "not-allowed", fontFamily: "inherit" }}
          >
            저장
          </button>
          <button onClick={onCancel} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #e5e7eb", background: "white", color: "#6b7280", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
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
          <span style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>출근기록부</span>
          <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 600 }}>{dateLabel}</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
            <button onClick={() => goDay(-1)} style={{ padding: "6px 13px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>이전일</button>
            <input type="date" value={selectedDate} max={todayStr} onChange={e => setSelectedDate(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 7, fontSize: 14, color: "#374151", outline: "none" }} />
            <button onClick={() => goDay(1)} disabled={selectedDate >= todayStr}
              style={{ padding: "6px 13px", border: "1px solid #e5e7eb", borderRadius: 7, background: "#fff", cursor: selectedDate >= todayStr ? "default" : "pointer", fontSize: 13, fontWeight: 600, color: selectedDate >= todayStr ? "#d1d5db" : "#374151" }}>다음일</button>
            {selectedDate !== todayStr && (
              <button onClick={() => setSelectedDate(todayStr)} style={{ padding: "6px 13px", border: "none", borderRadius: 7, background: NAVY, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>오늘</button>
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
              <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", letterSpacing: ".06em", marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 출근 기록 테이블 */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "13px 20px", borderBottom: "1px solid #f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>출근 현황</span>
          <span style={{ fontSize: 14, color: "#6b7280" }}>{attendance.length}명 출근</span>
        </div>
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#9ca3af", fontSize: 15 }}>불러오는 중...</div>
        ) : attendance.length === 0 ? (
          <div style={{ padding: "44px", textAlign: "center", color: "#9ca3af", fontSize: 15 }}>해당 날짜에 출근 기록이 없습니다</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
            <thead>
              <tr style={{ background: "#f4f6fa", borderBottom: "2px solid #e5e7eb", position: "sticky", top: 0, zIndex: 1 }}>
                {["#", "기사명", "차량번호", "출근시각", "퇴근시각", "근무시간", "이동거리", "연료비", "상태"].map(col => (
                  <th key={col} style={{ padding: "12px 16px", textAlign: "left", color: "#374151", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attendance.map((row, i) => (
                <tr key={row.uid} style={{ borderBottom: "1px solid #f0f2f5", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                  <td style={{ padding: "12px 16px", color: "#9ca3af", fontWeight: 600, fontSize: 14 }}>{i + 1}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 700, color: "#111827", fontSize: 15 }}>{row.name}</td>
                  <td style={{ padding: "12px 16px", color: NAVY, fontWeight: 700, fontSize: 14, letterSpacing: "0.04em", fontVariantNumeric: "tabular-nums" }}>{row.carNo}</td>
                  <td style={{ padding: "12px 16px", color: "#1B2B4B", fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 14 }}>{fmtT(row.checkIn)}</td>
                  <td style={{ padding: "12px 16px", color: row.checkOut ? "#374151" : "#9ca3af", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
                    {fmtT(row.checkOut)}
                    {row.isFinal && <span style={{ marginLeft: 7, fontSize: 11, color: "#6b7280", background: "#f3f4f6", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>최종</span>}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 14 }}>{fmtWork(row.checkIn, row.checkOut)}</td>
                  <td style={{ padding: "12px 16px", color: "#374151", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
                    {row.distance != null
                      ? `${row.distance.toFixed(1)} km`
                      : (() => { const live = drivers.find(d => d.id === row.uid); return live ? `${(live.총거리 || 0).toFixed(1)} km` : "--"; })()}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#374151", fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
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
                      ? <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700, background: "#d1fae5", padding: "3px 10px", borderRadius: 99 }}>근무중</span>
                      : row.isFinal
                        ? <span style={{ fontSize: 13, color: "#374151", background: "#f3f4f6", padding: "3px 10px", borderRadius: 99 }}>최종퇴근</span>
                        : <span style={{ fontSize: 13, color: "#6b7280", background: "#f3f4f6", padding: "3px 10px", borderRadius: 99 }}>퇴근</span>
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
          <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 12 }}>미출근 기사 ({noShow.length}명)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {noShow.map(d => (
              <div key={d.id} style={{ padding: "7px 16px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fafafa", fontSize: 14, color: "#374151", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#d1d5db", display: "inline-block" }} />
                {d.이름}
                <span style={{ color: "#9ca3af", fontWeight: 500, fontSize: 13 }}>{d.차량번호}</span>
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

  useEffect(() => {
    const unsubs = drivers.map(d =>
      onSnapshot(doc(db, "cargo_temp", d.id), snap => {
        if (snap.exists()) setTempData(prev => ({ ...prev, [d.id]: snap.data() }));
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
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, color: "#374151", background: "#f9fafb" }}>
          {["전체", "정상", "이탈", "오프라인", "미연결"].map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ position: "relative", flex: "1 1 160px" }}>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="차량번호, 이름..." style={{ width: "100%", padding: "7px 10px 7px 32px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, background: "#f9fafb", outline: "none", boxSizing: "border-box" }} />
          <svg width="14" height="14" fill="none" stroke="#9ca3af" strokeWidth="2" viewBox="0 0 24 24" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeLinecap="round"/></svg>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer", userSelect: "none" }}>
          <div onClick={() => setActiveOnly(v => !v)} style={{ width: 36, height: 20, borderRadius: 10, background: activeOnly ? NAVY : "#e5e7eb", position: "relative", cursor: "pointer", transition: "background .2s" }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 2, left: activeOnly ? 18 : 2, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
          </div>
          활성 차량만 보기
        </label>
        <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>총 {filtered.length}건</span>
        <button onClick={() => setAlarmModal(true)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${NAVY}`, background: NAVY, color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>온도알림 설정</button>
      </div>

      {/* 테이블 */}
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f4f6fa", borderBottom: "2px solid #e5e7eb" }}>
              {["ID", "차량정보", "알림명", "온도A (℃)", "온도B (℃)", "업데이트", "상태"].map(h => (
                <th key={h} style={{ padding: "11px 14px", textAlign: "left", color: "#374151", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "40px 20px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>조건에 맞는 차량이 없습니다</td></tr>
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
                  <td style={{ padding: "11px 14px", color: "#9ca3af", fontWeight: 600, fontSize: 12 }}>{idx + 1}</td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    <div style={{ fontWeight: 700, color: NAVY, fontSize: 13 }}>{d.이름 || "-"}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{d.차량번호} {d.vehicleType ? `· ${d.vehicleType}` : ""}</div>
                  </td>
                  <td style={{ padding: "11px 14px", color: "#374151", fontSize: 12 }}>
                    {matchAlarm ? <span style={{ fontWeight: 600, color: "#dc2626" }}>{matchAlarm.name}</span> : <span style={{ color: "#d1d5db" }}>–</span>}
                  </td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    {temp != null ? (
                      <span style={{ fontWeight: 800, fontSize: 14, color: temp <= -18 ? "#3b82f6" : temp <= 0 ? "#06b6d4" : temp > 25 ? "#ef4444" : "#374151", fontVariantNumeric: "tabular-nums" }}>{temp > 0 ? "+" : ""}{temp.toFixed(1)}℃</span>
                    ) : <span style={{ color: "#d1d5db", fontSize: 12 }}>–</span>}
                  </td>
                  <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                    {tempB != null ? (
                      <span style={{ fontWeight: 800, fontSize: 14, color: tempB <= -18 ? "#3b82f6" : tempB <= 0 ? "#06b6d4" : tempB > 25 ? "#ef4444" : "#374151", fontVariantNumeric: "tabular-nums" }}>{tempB > 0 ? "+" : ""}{tempB.toFixed(1)}℃</span>
                    ) : <span style={{ color: "#d1d5db", fontSize: 12 }}>–</span>}
                  </td>
                  <td style={{ padding: "11px 14px", color: "#6b7280", fontSize: 12, whiteSpace: "nowrap" }}>
                    {updAt ? `${String(updAt.getHours()).padStart(2,"0")}:${String(updAt.getMinutes()).padStart(2,"0")}` : "–"}
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, background: sc.bg, border: `1px solid ${sc.border}`, fontSize: 11, fontWeight: 700, color: sc.color }}>
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
              <div style={{ color: "white", fontWeight: 800, fontSize: 15 }}>온도알림 설정</div>
              <button onClick={() => setAlarmModal(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, color: "white", fontSize: 18, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 20 }}>
              {/* 새 알림 추가 */}
              <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 12, padding: "16px", marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 12 }}>새 알림 추가</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input placeholder="알림명 (예: 냉동 유지)" value={newAlarm.name} onChange={e => setNewAlarm(p => ({...p, name: e.target.value}))} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, outline: "none" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4, fontWeight: 600 }}>온도A 범위</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input placeholder="-20" value={newAlarm.minA} onChange={e => setNewAlarm(p => ({...p, minA: e.target.value}))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, outline: "none" }} />
                      <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>~</span>
                      <input placeholder="0" value={newAlarm.maxA} onChange={e => setNewAlarm(p => ({...p, maxA: e.target.value}))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, outline: "none" }} />
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>℃</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4, fontWeight: 600 }}>온도B 범위</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input placeholder="-10" value={newAlarm.minB} onChange={e => setNewAlarm(p => ({...p, minB: e.target.value}))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, outline: "none" }} />
                      <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>~</span>
                      <input placeholder="0" value={newAlarm.maxB} onChange={e => setNewAlarm(p => ({...p, maxB: e.target.value}))} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, outline: "none" }} />
                      <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>℃</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <select value={newAlarm.condition} onChange={e => setNewAlarm(p => ({...p, condition: e.target.value}))} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, background: "white" }}>
                    {["하나 이상 이탈 시", "모두 이탈 시"].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <button onClick={() => { if (!newAlarm.name.trim()) return; setAlarmSettings(prev => [...prev, { ...newAlarm, id: Date.now() }]); setNewAlarm({ name: "", minA: "", maxA: "", minB: "", maxB: "", condition: "하나 이상 이탈 시" }); }} style={{ padding: "8px 18px", borderRadius: 8, background: NAVY, color: "white", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>추가</button>
                </div>
              </div>

              {/* 알림 목록 */}
              {alarmSettings.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f4f6fa", borderBottom: "2px solid #e5e7eb" }}>
                      {["알림명", "온도A 최고/최저", "온도B 최고/최저", "알림조건", ""].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#374151", fontWeight: 700, fontSize: 11 }}>{h}</th>
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
                          <button onClick={() => setAlarmSettings(prev => prev.filter(x => x.id !== a.id))} style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>삭제</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {alarmSettings.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "20px 0" }}>등록된 알림이 없습니다</div>}
            </div>
          </div>
        </div>
      )}

      {/* IoT 연동 안내 */}
      <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 16px", marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>센서 데이터 경로</div>
        <div style={{ fontSize: 11, color: "#78350f", lineHeight: 1.7 }}>
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
          <div style={{ color:"white", fontWeight:800, fontSize:16, marginBottom:6 }}>적재함 카메라 관제</div>
          <div style={{ color:"rgba(255,255,255,0.75)", fontSize:13, lineHeight:1.7 }}>
            차량 적재함 내부에 IP 카메라 또는 LTE 카메라를 설치하면 관리자가 실시간 영상을 확인할 수 있습니다.<br/>
            기사 앱에서도 현재 적재 상태를 영상으로 확인할 수 있습니다.
          </div>
          <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
            {["RTSP 스트림 지원", "HLS / DASH 호환", "모바일 뷰어 포함"].map(tag => (
              <span key={tag} style={{ background:"rgba(255,255,255,0.15)", borderRadius:20, padding:"3px 10px", color:"rgba(255,255,255,0.9)", fontSize:11, fontWeight:600 }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 연동 절차 */}
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", padding:"20px 24px" }}>
        <div style={{ fontSize:14, fontWeight:800, color:NAVY, marginBottom:16 }}>연동 절차</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:12 }}>
          {[
            { step:1, title:"카메라 설치", desc:"적재함 내부에 LTE 또는 WiFi IP 카메라를 설치합니다", icon:"📷" },
            { step:2, title:"스트림 URL 등록", desc:"Firestore cargo_camera/{driverId}에 streamUrl을 등록합니다", icon:"🔗" },
            { step:3, title:"HLS 변환 서버", desc:"RTSP → HLS 변환 서버(예: MediaMTX) 구성 후 토큰 발급", icon:"⚙️" },
            { step:4, title:"실시간 모니터링", desc:"이 화면에서 모든 차량 카메라를 동시에 확인합니다", icon:"🖥️" },
          ].map(s => (
            <div key={s.step} style={{ background:"#f8fafc", borderRadius:10, padding:"14px 16px", border:"1px solid #e5e7eb" }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{s.icon}</div>
              <div style={{ fontSize:12, fontWeight:800, color:NAVY, marginBottom:4 }}>STEP {s.step}. {s.title}</div>
              <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 카메라 그리드 */}
      <div style={{ background:"white", borderRadius:14, border:"1px solid #e5e7eb", overflow:"hidden" }}>
        <div style={{ padding:"14px 20px", borderBottom:"1px solid #e5e7eb" }}>
          <div style={{ fontSize:14, fontWeight:800, color:NAVY }}>카메라 모니터</div>
          <div style={{ fontSize:12, color:"#9ca3af", marginTop:2 }}>카메라가 연결된 차량의 영상이 자동으로 표시됩니다</div>
        </div>
        {drivers.length === 0 ? (
          <div style={{ padding:"40px 20px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>등록된 기사가 없습니다</div>
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
                        <div style={{ fontSize:12, color:"#6b7280" }}>카메라 미연결</div>
                      </div>
                    )}
                    {hasStream && (
                      <div style={{ position:"absolute", top:8, left:8, background:"rgba(239,68,68,0.9)", borderRadius:6, padding:"2px 8px", display:"flex", alignItems:"center", gap:4 }}>
                        <div style={{ width:5, height:5, borderRadius:"50%", background:"white", animation:"fmBlink 1s ease-in-out infinite" }} />
                        <span style={{ fontSize:10, color:"white", fontWeight:700 }}>LIVE</span>
                      </div>
                    )}
                  </div>
                  {/* 기사 정보 */}
                  <div style={{ padding:"10px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:NAVY }}>{d.이름}</div>
                      <div style={{ fontSize:11, color:"#9ca3af" }}>{d.차량번호}</div>
                    </div>
                    <div style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20, background: hasStream ? "#fef2f2" : "#f3f4f6", color: hasStream ? "#ef4444" : "#9ca3af" }}>
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
        <div style={{ fontSize:12, fontWeight:700, color:"#92400e", marginBottom:6 }}>💡 권장 카메라 장비</div>
        <div style={{ fontSize:12, color:"#78350f", lineHeight:1.7 }}>
          Reolink Go, TP-Link Tapo LTE 카메라 등 SIM 카드 내장 IP 카메라 또는 WiFi 카메라를 권장합니다.
          Firestore 경로 <code style={{ background:"rgba(0,0,0,0.06)", padding:"1px 5px", borderRadius:4, fontSize:11 }}>cargo_camera / {"{"} driverId {"}"}</code>에
          <code style={{ background:"rgba(0,0,0,0.06)", padding:"1px 5px", borderRadius:4, fontSize:11, marginLeft:4 }}>streamUrl (HLS)</code>,
          <code style={{ background:"rgba(0,0,0,0.06)", padding:"1px 5px", borderRadius:4, fontSize:11, marginLeft:4 }}>active: true</code> 필드를 등록하면 즉시 표시됩니다.
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

export default function FleetManagement() {
  // Tab persistence across parent-tab switches → sessionStorage
  const [mainTab, setMainTab] = useState(() => sfGet("fm_tab", "tracking"));

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
  const drivers = useMemo(() => {
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
        };
      })
      .sort((a, b) => statusPriority(a) - statusPriority(b));
  }, [driversRaw, usersMap]);

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
            <h1 style={{ fontSize: 19, fontWeight: 800, color: NAVY, margin: 0, letterSpacing: "-0.02em" }}>지입차량 관제</h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "2px 0 0" }}>실시간 차량 모니터링 시스템</p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {loading ? (
            <span style={{ fontSize: 13, color: "#9ca3af" }}>데이터 불러오는 중...</span>
          ) : lastUpdated ? (
            <span style={{ fontSize: 13, color: "#6b7280" }}>갱신: {lastUpdated.toLocaleTimeString("ko-KR")}</span>
          ) : null}

          <button
            onClick={() => setCompanyLocModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 15px", borderRadius: 8, border: "1px solid #d1d5db",
              background: "white", cursor: "pointer",
              fontSize: 14, fontWeight: 700, color: NAVY,
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
              fontSize: 14, fontWeight: 700, color: loading ? "#9ca3af" : NAVY,
            }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            새로고침
          </button>

          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 99, border: "1px solid #d1fae5", fontSize: 13, color: "#065f46", fontWeight: 600, background: "#f0fdf4" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block", animation: "fmLivePulse 2s infinite" }} />
            실시간 연결
          </span>
        </div>
      </div>

      {/* ═══ 메인 탭 ═══ */}
      <div style={{ display: "flex", gap: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", padding: 4, position: "relative", zIndex: 10 }}>
        {[["tracking", "관제현황"], ["history", "이력 조회"], ["attendance", "출근기록부"], ["temperature", "온도 관제"], ["cargo-camera", "적재함 카메라"], ["registration", "기사 등록 관리"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMainTab(key)}
            style={{
              flex: 1, padding: "10px 18px", border: "none", borderRadius: 7,
              background: mainTab === key ? NAVY : "transparent",
              color: mainTab === key ? "#fff" : "#6b7280",
              fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all .15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {label}
            {key === "registration" && pendingCount > 0 && (
              <span style={{ background: "#ef4444", color: "white", fontSize: 12, fontWeight: 800, padding: "1px 7px", borderRadius: 99 }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── 긴급 알림 배너 (모든 탭에서 상시 표시) ─── */}
      {emergencyAlerts.length > 0 && (
        <div style={{ background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)", borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 4, animation: "fmBlink 0.8s ease-in-out infinite", boxShadow: "0 4px 24px rgba(239,68,68,0.4)" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "white", fontWeight: 900, fontSize: 15, marginBottom: 6 }}>🚨 긴급 상황 발생! ({emergencyAlerts.length}건)</div>
            {emergencyAlerts.map(alert => {
              const t = alert.timestamp?.toDate?.() || (alert.timestamp?.seconds ? new Date(alert.timestamp.seconds * 1000) : null);
              return (
                <div key={alert.id} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ color: "white", fontWeight: 800, fontSize: 14 }}>{alert.driverName || "-"} · {alert.carNo || "-"}</div>
                    {alert.location && <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 }}>위치: {alert.location.lat.toFixed(4)}, {alert.location.lng.toFixed(4)}</div>}
                    <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 1 }}>{t ? `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")} 발생` : ""}</div>
                  </div>
                  <button
                    onClick={async () => { try { await updateDoc(doc(db, "emergency_alerts", alert.id), { resolved: true, resolvedAt: new Date() }); } catch (_) {} }}
                    style={{ padding: "8px 18px", borderRadius: 10, border: "2px solid white", background: "white", color: "#ef4444", fontSize: 13, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}
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
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>출발지 변경 요청 {locChangeRequests.length}건</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>기사가 출발지 변경을 요청했습니다</span>
              </div>
              {locChangeRequests.map((req) => (
                <div key={req.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{req.driverName || "-"}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", background: "#f3f4f6", padding: "2px 8px", borderRadius: 5, fontFamily: "monospace" }}>{req.carNo || "-"}</span>
                  {req.currentLocation?.name && (
                    <span style={{ fontSize: 12, color: "#6b7280" }}>현재: {req.currentLocation.name}</span>
                  )}
                  <span style={{ fontSize: 12, color: "#6b7280", marginLeft: "auto" }}>{timeAgo(req.requestedAt)}</span>
                  <button
                    onClick={() => {
                      const drv = drivers.find(d => d.id === req.uid);
                      if (drv) {
                        setCheckInLocModal({ driverId: req.uid, driverName: req.driverName || drv.이름, initialLoc: drv.checkInLocation || null });
                      }
                    }}
                    style={{ padding: "3px 11px", borderRadius: 6, border: "1px solid #d1d5db", background: "white", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    출발지 설정
                  </button>
                  <button
                    onClick={async () => { try { await updateDoc(doc(db, "location_change_requests", req.id), { status: "dismissed" }); } catch (_) {} }}
                    style={{ padding: "3px 11px", borderRadius: 6, border: "1px solid #e5e7eb", background: "white", color: "#9ca3af", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
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
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>충돌 감지 알림 {collisionAlerts.length}건</span>
                <span style={{ fontSize: 12, color: "#6b7280" }}>기기에서 강한 충격이 감지되었습니다</span>
              </div>
              {collisionAlerts.map((alert) => (
                <div key={alert.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 14px", borderBottom: "1px solid #f3f4f6", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{alert.driverName || "-"}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", background: "#f3f4f6", padding: "2px 8px", borderRadius: 5, fontFamily: "monospace" }}>{alert.carNo || "-"}</span>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>충격 {alert.magnitude} m/s²</span>
                  {alert.location?.lat && (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{alert.location.lat.toFixed(4)}, {alert.location.lng.toFixed(4)}</span>
                  )}
                  <span style={{ fontSize: 12, color: "#6b7280", marginLeft: "auto" }}>{timeAgo(alert.timestamp)}</span>
                  <button
                    onClick={async () => { try { await updateDoc(doc(db, "collision_alerts", alert.id), { resolved: true }); } catch (_) {} }}
                    style={{ padding: "3px 11px", borderRadius: 6, border: "1px solid #d1d5db", background: "white", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
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
                style={{ width: "100%", paddingLeft: 34, paddingRight: 10, paddingTop: 9, paddingBottom: 9, border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, color: "#374151", outline: "none", background: "#fafafa", boxSizing: "border-box" }}
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
                      fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
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
            <span style={{ fontSize: 13, color: "#6b7280", marginLeft: "auto", whiteSpace: "nowrap", fontWeight: 600 }}>
              {filteredRows.length}명 / 전체 {drivers.length}명
            </span>
          </div>

          {/* 날짜별 동선 조회 */}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#6b7280", whiteSpace:"nowrap" }}>동선 날짜</span>
            <input
              type="date"
              value={selectedTrackDate}
              max={todayDate}
              onChange={e => setSelectedTrackDate(e.target.value)}
              style={{ padding:"5px 8px", border:"1px solid #e5e7eb", borderRadius:7, fontSize:13, color:NAVY, outline:"none", width:"auto" }}
            />
            {selectedTrackDate !== yesterdayDate && (
              <button
                onClick={() => setSelectedTrackDate(yesterdayDate)}
                style={{ padding:"5px 11px", border:"1px solid #e5e7eb", borderRadius:7, background:"white", color:"#374151", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}
              >
                어제
              </button>
            )}
            {selectedTrackDate !== todayDate && (
              <button
                onClick={() => setSelectedTrackDate(todayDate)}
                style={{ padding:"5px 11px", border:"none", borderRadius:7, background:NAVY, color:"white", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}
              >
                오늘
              </button>
            )}
          </div>

          {/* 테이블 + 지도 */}
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", minHeight: 520 }}>
            <div style={{ flex: "0 0 40%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>기사 목록</span>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{filteredRows.length}명</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
                <DriverTable rows={filteredRows} selectedId={selected?.id} onSelect={handleSelect} onFocusMap={handleFocusMap} onContextMenu={handleContextMenu} todayPhotos={todayDriverPhotos} onViewPhotos={setPhotoViewerPhotos} />
              </div>
            </div>

            <div style={{ flex: "1 1 60%", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", minWidth: 0, minHeight: 520, position: "relative", isolation: "isolate" }}>
              <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1000, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ background: "rgba(255,255,255,0.93)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 13px", fontSize: 13, fontWeight: 700, color: NAVY, backdropFilter: "blur(4px)", boxShadow: "0 1px 6px rgba(0,0,0,.08)", display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  1분 주기 갱신
                  <span style={{ color: "#6b7280", fontWeight: 500 }}>{filteredRows.filter(d => d.location).length}대</span>
                </div>
                <button
                  onClick={handleMapRefresh}
                  title="지도 위치 즉시 새로고침"
                  style={{ background: "rgba(255,255,255,0.93)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 700, color: NAVY, backdropFilter: "blur(4px)", boxShadow: "0 1px 6px rgba(0,0,0,.08)", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  새로고침
                </button>
                <button
                  onClick={() => setFitAllCount(c => c + 1)}
                  title="전체 기사 위치 맞추기"
                  style={{ background: "rgba(255,255,255,0.93)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 11px", fontSize: 12, fontWeight: 600, color: NAVY, backdropFilter: "blur(4px)", boxShadow: "0 1px 6px rgba(0,0,0,.08)", cursor: "pointer" }}
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
                <span style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>실시간 활동 피드</span>
                <span style={{ fontSize: 13, color: "#9ca3af" }}>기사가 버튼을 누를 때마다 즉시 기록</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>최근 {filteredActivityLogs.length}건</span>
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

      {/* ═══ 이력 조회 ═══ */}
      {mainTab === "history" && <HistoryTab drivers={drivers} defaultDriverId={historyPreselect} />}
      {mainTab === "attendance" && <AttendanceTab drivers={drivers} />}

      {/* ═══ 온도 관제 ═══ */}
      {mainTab === "temperature" && <TemperatureTab drivers={drivers} />}

      {/* ═══ 적재함 카메라 ═══ */}
      {mainTab === "cargo-camera" && <CargoCameraTab drivers={drivers} />}

      {/* ═══ 기사 등록 관리 ═══ */}
      {mainTab === "registration" && <RegistrationTab usersMap={usersMap} myCompanyName={myCompanyName} />}

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
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{contextMenu.driver.이름}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 1 }}>{contextMenu.driver.차량번호}</div>
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
                  fontSize: 13, color: item.disabled ? "#d1d5db" : "#374151", fontWeight: 600, textAlign: "left",
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
                <div style={{ color:"white", fontWeight:800, fontSize:16 }}>{photoViewerPhotos.driverName} 첨부 사진</div>
                <div style={{ color:"rgba(255,255,255,0.6)", fontSize:12, marginTop:2 }}>오늘 업로드된 사진 {photoViewerPhotos.photos.length}장 · 클릭하면 크게 봅니다</div>
              </div>
              <button onClick={() => setPhotoViewerPhotos(null)} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", fontSize:18, width:32, height:32, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
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
                        <div style={{ fontSize:12, fontWeight:700, color:NAVY }}>{p.actionType}</div>
                        <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{t ? `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}` : "-"}</div>
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
                <div style={{ color:"white", fontWeight:700, fontSize:14 }}>{p.driverName} — {p.actionType}</div>
                <div style={{ color:"rgba(255,255,255,0.55)", fontSize:12, marginTop:2 }}>{t ? `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")} ${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}` : ""} · {index+1}/{photos.length}</div>
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
                  style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", width:36, height:36, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
              </div>
            </div>
            {/* 이미지 */}
            <div onClick={e => e.stopPropagation()} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", width:"100%", padding:"72px 60px 60px" }}>
              <img src={p.imageBase64} alt={p.actionType} style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", transform:`rotate(${rotation}deg)`, transition:"transform .25s", borderRadius:8, boxShadow:"0 4px 40px rgba(0,0,0,0.6)" }} />
            </div>
            {/* 이전/다음 */}
            {index > 0 && (
              <button onClick={e => { e.stopPropagation(); setPhotoLightbox(lb => ({ ...lb, index: lb.index - 1, rotation: 0 })); }}
                style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, color:"white", width:44, height:44, fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
            )}
            {index < photos.length - 1 && (
              <button onClick={e => { e.stopPropagation(); setPhotoLightbox(lb => ({ ...lb, index: lb.index + 1, rotation: 0 })); }}
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.15)", border:"none", borderRadius:10, color:"white", width:44, height:44, fontSize:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
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
            <div style={{ color:"white", fontWeight:700, fontSize:13 }}>사진 업로드</div>
            <div style={{ color:"rgba(255,255,255,0.8)", fontSize:12, marginTop:2 }}>{newPhotoToast.driverName} ({newPhotoToast.carNo}) — {newPhotoToast.actionType}</div>
          </div>
          <button onClick={() => setNewPhotoToast(null)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.5)", fontSize:18, cursor:"pointer" }}>×</button>
        </div>
      )}

    </div>
  );
}

// ======================= END =======================
