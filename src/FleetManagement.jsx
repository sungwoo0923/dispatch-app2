// ======================= FleetManagement.jsx =======================
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { db } from "./firebase";
import {
  collection, onSnapshot, doc, updateDoc, setDoc,
  query, where, orderBy, limit, deleteDoc, writeBatch,
} from "firebase/firestore";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";

// ─── 상수 ────────────────────────────────────────────────────────────────────

const NAVY = "#1B2B4B";
const NAVY_DARK = "#131e35";
const NAVY_LIGHT = "#243454";

const STATUS_COLORS = {
  운행중: "#10b981",
  출근:   "#3b82f6",
  상차중: "#f59e0b",
  하차중: "#8b5cf6",
  대기:   "#6b7280",
  휴식:   "#9ca3af",
  퇴근:   "#374151",
  복귀중: "#06b6d4",
};

const STATUS_ORDER = ["운행중", "상차중", "하차중", "복귀중", "출근", "대기", "휴식", "퇴근"];
const STATUS_FILTER_OPTIONS = ["전체", "운행중", "출근", "상차중", "하차중", "복귀중", "대기", "휴식", "퇴근"];

const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

// ─── 타임스탬프 유틸 ──────────────────────────────────────────────────────────
// Handles Firestore Timestamp, { seconds, nanoseconds }, number (ms), and null

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

function makeIcon(color, active) {
  const ring = active
    ? `<div style="position:absolute;inset:-5px;border-radius:50%;background:${color};opacity:.25;animation:fmRing 1.8s infinite ease-out;"></div>`
    : "";
  const pulse = active ? "animation:fmDot 1.8s infinite ease-in-out;" : "";
  return L.divIcon({
    html: `
      <div style="position:relative;width:16px;height:16px;display:flex;align-items:center;justify-content:center;">
        ${ring}
        <div style="width:14px;height:14px;background:${color};border-radius:50%;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);position:relative;z-index:1;${pulse}"></div>
      </div>`,
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -12],
  });
}

function getIcon(status, active) {
  const color = STATUS_COLORS[status] || "#9ca3af";
  return makeIcon(color, !!active);
}

// ─── MapRecenter ──────────────────────────────────────────────────────────────

function MapRecenter({ center }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (!center) return;
    const key = `${center.lat},${center.lng}`;
    if (prev.current === key) return;
    prev.current = key;
    map.setView([center.lat, center.lng], 14, { animate: true });
  }, [center, map]);
  return null;
}

// ─── FitPath ─────────────────────────────────────────────────────────────────

function FitPath({ points }) {
  const map = useMap();
  const prevLen = useRef(0);
  useEffect(() => {
    if (points.length < 2) return;
    if (points.length === prevLen.current) return;
    prevLen.current = points.length;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: true });
  }, [points, map]);
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

const COL_HEADERS = ["#", "이름", "차량번호", "차종", "현재상태", "이동거리", "업데이트"];

function DriverTable({ rows, selectedId, onSelect }) {
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

              {/* 이동거리 */}
              <td style={{ padding: "11px 14px", color: "#374151", whiteSpace: "nowrap", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                {(d.총거리 || 0).toFixed(1)} km
              </td>

              {/* 업데이트 */}
              <td style={{ padding: "11px 14px", color: "#6b7280", whiteSpace: "nowrap", fontSize: 13 }}>
                {timeAgo(d.updatedAt)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── FleetMap ────────────────────────────────────────────────────────────────

function FleetMap({ drivers, center, onSelect, selectedPath = [], roadPath = [] }) {
  const defaultCenter = center || { lat: 37.5665, lng: 126.9780 };
  // Prefer OSRM road-following path; fall back to direct GPS waypoints
  const displayPath = roadPath.length >= 2 ? roadPath : selectedPath;
  const pathPositions = displayPath.map(p => [p.lat, p.lng]);

  return (
    <MapContainer center={[defaultCenter.lat, defaultCenter.lng]} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%", minHeight: 480 }}>
      <MapRecenter center={center} />
      {selectedPath.length >= 2 && <FitPath points={selectedPath} />}
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
            icon={getIcon(d.상태, d.active)}
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
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{timeAgo(log.timestamp)}</span>
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
      <div style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0, paddingTop: 2, fontWeight: 600, whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</div>
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

function DriverDetailPanel({ data, logs, onClose, onDeleteLogs, checkInLoc, companyDefaultLoc, onSetCheckInLoc, onClearCheckInLoc }) {
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 10, marginBottom: 22 }}>
        {[
          { label: "이동거리", val: `${(data.총거리 || 0).toFixed(2)} km` },
          { label: "근무시간", val: formatMinutes(data.근무시간) },
          { label: "접속상태", val: data.active ? "접속중" : "미접속", color: data.active ? "#10b981" : "#9ca3af" },
          data.location ? { label: "현재 좌표", val: `${data.location.lat.toFixed(4)}, ${data.location.lng.toFixed(4)}` } : null,
          (() => {
            const dist = data.총거리 || 0;
            const startTs = resolveTs(data.workStartAt);
            if (dist > 0 && startTs) {
              const hrs = (Date.now() - startTs.getTime()) / 3600000;
              const avg = hrs > 0 ? Math.round(dist / hrs) : 0;
              return { label: "평균 속도", val: `${avg} km/h` };
            }
            return null;
          })(),
        ].filter(Boolean).map(({ label, val, color }) => (
          <div key={label} style={{ background: "#f8f9fb", borderRadius: 9, padding: "13px 15px", border: "1px solid #eaecf0" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", margin: "0 0 6px" }}>{label}</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: color || NAVY, margin: 0 }}>{val}</p>
          </div>
        ))}
      </div>

      {/* 출근지 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", letterSpacing: ".09em", textTransform: "uppercase", margin: 0 }}>출근지</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {checkInLoc && onClearCheckInLoc && (
              <button
                onClick={onClearCheckInLoc}
                title="개별 설정 해제 (회사 기본값으로)"
                style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "white", color: "#9ca3af", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                해제
              </button>
            )}
            {onSetCheckInLoc && (
              <button
                onClick={onSetCheckInLoc}
                style={{ padding: "4px 12px", borderRadius: 7, border: `1px solid ${NAVY}`, background: "white", color: NAVY, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                {checkInLoc ? "수정" : "설정"}
              </button>
            )}
          </div>
        </div>
        {checkInLoc ? (
          <div style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 9, padding: "11px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{checkInLoc.name}</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{checkInLoc.lat.toFixed(5)}, {checkInLoc.lng.toFixed(5)}</div>
          </div>
        ) : companyDefaultLoc ? (
          <div style={{ background: "#f8f9fb", border: "1px dashed #d1d5db", borderRadius: 9, padding: "11px 14px" }}>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 2 }}>회사 기본 출근지 적용</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{companyDefaultLoc.name}</div>
          </div>
        ) : (
          <div style={{ background: "#f8f9fb", border: "1px dashed #d1d5db", borderRadius: 9, padding: "11px 14px" }}>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>출근지가 설정되지 않았습니다</div>
          </div>
        )}
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
                <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, paddingBottom: 11, marginBottom: 11, borderBottom: i < logs.length - 1 ? "1px solid #f0f2f5" : "none" }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1B2B4B" }}>{log.status}</span>
                      {duration !== null && duration > 60000 && (
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>{formatMs(duration)} 체류</span>
                      )}
                    </div>
                    {log.location?.lat != null && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {log.location.lat.toFixed(5)}, {log.location.lng.toFixed(5)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0, fontWeight: 600, whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</div>
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

function RegistrationTab({ usersMap }) {
  const [approvingId, setApprovingId] = useState(null);

  const driverList = useMemo(() => {
    return Object.entries(usersMap)
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

function HistoryTab({ drivers }) {
  const _td = new Date();
  const todayStr = `${_td.getFullYear()}-${String(_td.getMonth()+1).padStart(2,"0")}-${String(_td.getDate()).padStart(2,"0")}`;

  const [selId, setSelId] = useState("");
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [applied, setApplied] = useState(null);
  const [logs, setLogs] = useState([]);
  const [gpsDist, setGpsDist] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!applied) return;
    setLoading(true);
    setLogs([]);
    setGpsDist(null);
    const from = new Date(applied.from + "T00:00:00");
    const to = new Date(applied.to + "T23:59:59");

    const logUnsub = onSnapshot(
      query(collection(db, "driver_logs"), where("uid", "==", applied.driverId), limit(500)),
      (snap) => {
        const filtered = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(l => { const t = l.timestamp?.toDate?.(); return t && t >= from && t <= to; })
          .sort((a, b) => (a.timestamp?.toDate?.()?.getTime()||0) - (b.timestamp?.toDate?.()?.getTime()||0));
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
    return () => { logUnsub(); gpsUnsub(); };
  }, [applied]);

  const summary = useMemo(() => {
    if (!logs.length) return null;
    let checkInTime = null, checkOutTime = null, workMs = 0, tripCount = 0;
    let lastT = null, lastS = null;
    logs.forEach(log => {
      const t = resolveTs(log.timestamp);
      if (!t) return;
      if (log.status === "출근" && !checkInTime) checkInTime = t;
      if (log.status === "퇴근") checkOutTime = t;
      if (log.status === "운행중") tripCount++;
      if (lastT && lastS && lastS !== "퇴근" && lastS !== "대기" && lastS !== "휴식") workMs += t.getTime() - lastT.getTime();
      lastT = t; lastS = log.status;
    });
    return { checkInTime, checkOutTime, workMs, tripCount };
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
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "22px 26px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: NAVY, marginBottom: 18 }}>기사 이력 조회</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px", minWidth: 180 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>기사 선택</div>
            <select
              value={selId}
              onChange={e => setSelId(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, color: "#374151", background: "#fafafa", outline: "none" }}
            >
              <option value="">기사를 선택하세요</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.이름} ({d.차량번호})</option>)}
            </select>
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>조회 기간</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="date" value={fromDate} max={todayStr} onChange={e => setFromDate(e.target.value)}
                style={{ padding: "9px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, color: "#374151", background: "#fafafa", outline: "none" }} />
              <span style={{ color: "#9ca3af", fontSize: 13 }}>~</span>
              <input type="date" value={toDate} max={todayStr} onChange={e => setToDate(e.target.value)}
                style={{ padding: "9px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, color: "#374151", background: "#fafafa", outline: "none" }} />
            </div>
          </div>
          <button
            onClick={() => {
              if (!selId) return;
              const d = drivers.find(x => x.id === selId);
              setApplied({ driverId: selId, from: fromDate, to: toDate, driverName: d?.이름 || "", carNo: d?.차량번호 || "" });
            }}
            disabled={!selId}
            style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: selId ? NAVY : "#e5e7eb", color: selId ? "white" : "#9ca3af", fontSize: 14, fontWeight: 700, cursor: selId ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
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
            </div>
          ))}
        </>
      ))}
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
  const [pinModal, setPinModal] = useState(null); // { title, onConfirmed }
  const [companyDefaultLoc, setCompanyDefaultLoc] = useState(null);
  const [checkInLocModal, setCheckInLocModal] = useState(null); // { driverId, driverName, initialLoc }
  const [companyLocModal, setCompanyLocModal] = useState(false);

  const [collisionAlerts, setCollisionAlerts] = useState([]);
  const [searchQuery,   setSearchQuery]  = useState("");
  const [statusFilter,  setStatusFilter] = useState("전체");
  const [selected,      setSelected]     = useState(null);
  const [mapCenter,     setMapCenter]    = useState(null);
  const [selectedDriverLogs, setSelectedDriverLogs] = useState([]);

  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Persist tab choice
  useEffect(() => { sfSet("fm_tab", mainTab); }, [mainTab]);

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

  // ── 선택 기사 로그 구독 ───────────────────────────────────────────────────
  // Use uid-only query (single-field index, no composite index needed) and sort client-side
  useEffect(() => {
    if (!selected?.id) { setSelectedDriverLogs([]); return; }
    return onSnapshot(
      query(collection(db, "driver_logs"), where("uid", "==", selected.id), limit(100)),
      (snap) => {
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        logs.sort((a, b) => {
          const at = resolveTs(a.timestamp)?.getTime() || 0;
          const bt = resolveTs(b.timestamp)?.getTime() || 0;
          return bt - at;
        });
        setSelectedDriverLogs(logs.slice(0, 30));
      },
      (err) => console.error("selected logs:", err)
    );
  }, [selected?.id]);

  // ── GPS 트랙 구독 (선택된 기사, 오늘) ─────────────────────────────────────
  // Composite indexes for (driverId+date+timestamp) may not exist in Firestore yet,
  // so we query by driverId only (single-field auto-index) and filter+sort client-side.
  useEffect(() => {
    if (!selected?.id) { setGpsTracks([]); return; }
    const today = new Date().toISOString().slice(0, 10);
    return onSnapshot(
      query(
        collection(db, "gps_tracks"),
        where("driverId", "==", selected.id),
        limit(2000)
      ),
      (snap) => {
        const tracks = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => {
            const d = resolveTs(t.timestamp);
            return d && d.toISOString().slice(0, 10) === today;
          })
          .sort((a, b) => {
            const at = resolveTs(a.timestamp)?.getTime() || 0;
            const bt = resolveTs(b.timestamp)?.getTime() || 0;
            return at - bt;
          });
        setGpsTracks(tracks);
      },
      (err) => console.error("gps_tracks:", err)
    );
  }, [selected?.id]);

  // ── 합성 drivers ─────────────────────────────────────────────────────────
  // Only include drivers who registered via DriverRegister (have usersMap entry)
  // AND have been approved. Filters out all old/orphaned drivers collection docs.
  const drivers = useMemo(() => {
    return driversRaw
      .filter(raw => {
        const u = usersMap[raw.id];
        return u && u.approved === true;
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
        };
      })
      .sort((a, b) => statusPriority(a) - statusPriority(b));
  }, [driversRaw, usersMap]);

  const driversMap = useMemo(() => {
    const m = {};
    drivers.forEach(d => { m[d.id] = d; });
    return m;
  }, [drivers]);

  // ── 선택 기사 이동 경로 ───────────────────────────────────────────────────
  // Prefer continuous gps_tracks; fall back to sparse driver_logs status points
  const selectedPath = useMemo(() => {
    // Use GPS tracks when we have actual continuous waypoints
    if (gpsTracks.length >= 2) {
      return gpsTracks.map(t => ({
        lat: t.lat,
        lng: t.lng,
        status: "운행중",
        timestamp: t.timestamp,
        dwell: null,
      }));
    }
    // Fallback: use status change log positions
    const withLoc = selectedDriverLogs.filter(l => l.location?.lat != null);
    if (withLoc.length === 0) return [];
    return [...withLoc].reverse().map((l, i, arr) => {
      const nextLog = arr[i + 1];
      const thisTs = resolveTs(l.timestamp);
      const nextTs = resolveTs(nextLog?.timestamp);
      const dwell = thisTs && nextTs ? nextTs.getTime() - thisTs.getTime() : null;
      return {
        lat: l.location.lat,
        lng: l.location.lng,
        status: l.status,
        timestamp: l.timestamp,
        dwell,
      };
    });
  }, [selectedDriverLogs, gpsTracks]);

  // ── 실제 도로 경로 (OSRM) ─────────────────────────────────────────────────
  // Fetch road-following geometry so the map line follows actual roads, not straight lines.
  // Waypoints are sampled to ≤25 before sending to keep URL short.
  useEffect(() => {
    setRoadPath([]);
    if (selectedPath.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        // Sample to max 25 waypoints
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
        }
      } catch (_) {
        // Silently fall back to straight-line selectedPath in FleetMap
      }
    }, 800); // small debounce to avoid firing on every live GPS update

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

  // Keep selected in sync with live data updates
  useEffect(() => {
    const sel = selectedRef.current;
    if (!sel) return;
    const updated = drivers.find(d => d.id === sel.id);
    if (updated) setSelected(updated);
  }, [drivers]);

  // ── 피드 전체 삭제 ────────────────────────────────────────────────────────
  const handleDeleteFeedLogs = useCallback(() => {
    setPinModal({
      title: "활동 피드 전체 삭제",
      onConfirmed: async () => {
        setPinModal(null);
        try {
          const batch = writeBatch(db);
          filteredActivityLogs.forEach(log => batch.delete(doc(db, "driver_logs", log.id)));
          await batch.commit();
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
          const batch = writeBatch(db);
          selectedDriverLogs.forEach(log => batch.delete(doc(db, "driver_logs", log.id)));
          await batch.commit();
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
      <div style={{ display: "flex", gap: 0, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", padding: 4 }}>
        {[["tracking", "관제현황"], ["history", "이력 조회"], ["registration", "기사 등록 관리"]].map(([key, label]) => (
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

          {/* 충돌 감지 알림 */}
          {collisionAlerts.length > 0 && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: collisionAlerts.length > 0 ? 10 : 0 }}>
                <svg width="15" height="15" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#991b1b" }}>충돌 감지 알림 ({collisionAlerts.length}건)</span>
                <span style={{ fontSize: 12, color: "#b91c1c" }}>기사의 기기에서 강한 충격이 감지되었습니다</span>
              </div>
              {collisionAlerts.map((alert, i) => (
                <div key={alert.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderTop: "1px solid #fecaca", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{alert.driverName || "-"}</span>
                  <span style={{ fontSize: 13, color: "#374151", fontWeight: 700, background: "#f3f4f6", padding: "2px 9px", borderRadius: 5, fontFamily: "monospace" }}>{alert.carNo || "-"}</span>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>충격 {alert.magnitude} m/s²</span>
                  {alert.location?.lat && (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{alert.location.lat.toFixed(4)}, {alert.location.lng.toFixed(4)}</span>
                  )}
                  <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>{timeAgo(alert.timestamp)}</span>
                  <button
                    onClick={async () => { try { await updateDoc(doc(db, "collision_alerts", alert.id), { resolved: true }); } catch (_) {} }}
                    style={{ padding: "4px 13px", borderRadius: 6, border: "1px solid #fca5a5", background: "white", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
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

          {/* 테이블 + 지도 */}
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", minHeight: 520 }}>
            <div style={{ flex: "0 0 40%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f0f2f5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>기사 목록</span>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{filteredRows.length}명</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
                <DriverTable rows={filteredRows} selectedId={selected?.id} onSelect={handleSelect} />
              </div>
            </div>

            <div style={{ flex: "1 1 60%", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", minWidth: 0, minHeight: 520, position: "relative" }}>
              <div style={{ position: "absolute", top: 12, left: 12, zIndex: 1000, background: "rgba(255,255,255,0.93)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 13px", fontSize: 13, fontWeight: 700, color: NAVY, backdropFilter: "blur(4px)", boxShadow: "0 1px 6px rgba(0,0,0,.08)" }}>
                실시간 위치
                <span style={{ marginLeft: 8, color: "#6b7280", fontWeight: 500 }}>{filteredRows.filter(d => d.location).length}대</span>
              </div>
              <FleetMap drivers={filteredRows} center={mapCenter} onSelect={handleSelect} selectedPath={selectedPath} roadPath={roadPath} />
            </div>
          </div>

          {/* 선택 기사 상세 */}
          {selected && (
            <DriverDetailPanel
              data={selected}
              logs={selectedDriverLogs}
              onClose={() => { setSelected(null); setSelectedDriverLogs([]); setGpsTracks([]); setRoadPath([]); }}
              onDeleteLogs={handleDeleteDriverLogs}
              checkInLoc={selected.checkInLocation || null}
              companyDefaultLoc={companyDefaultLoc}
              onSetCheckInLoc={() => setCheckInLocModal({ driverId: selected.id, driverName: selected.이름, initialLoc: selected.checkInLocation || null })}
              onClearCheckInLoc={handleClearDriverCheckInLoc}
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
      {mainTab === "history" && <HistoryTab drivers={drivers} />}

      {/* ═══ 기사 등록 관리 ═══ */}
      {mainTab === "registration" && <RegistrationTab usersMap={usersMap} />}

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

      {companyLocModal && (
        <CheckInLocModal
          title="회사 기본 출근지 설정"
          initialLoc={companyDefaultLoc}
          onSave={handleSaveCompanyLoc}
          onCancel={() => setCompanyLocModal(false)}
        />
      )}
    </div>
  );
}

// ======================= END =======================
