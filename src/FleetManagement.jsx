// ======================= FleetManagement.jsx =======================
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { db } from "./firebase";
import {
  collection, onSnapshot, doc, updateDoc,
  query, where, orderBy, limit,
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

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function statusPriority(d) {
  const activeBonus = d.active ? 0 : 1000;
  const idx = STATUS_ORDER.indexOf(d.상태);
  return activeBonus + (idx === -1 ? 999 : idx);
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
      </div>
      <style>
        @keyframes fmRing{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.8);opacity:0}}
        @keyframes fmDot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.25);opacity:.8}}
      </style>`,
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
              <td style={{ padding: "11px 14px", color: "#1B2B4B", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono','Courier New',monospace", fontSize: 13, fontWeight: 700, letterSpacing: ".03em" }}>
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

function FleetMap({ drivers, center, onSelect, selectedPath = [] }) {
  const defaultCenter = center || { lat: 37.5665, lng: 126.9780 };
  const pathPositions = selectedPath.map(p => [p.lat, p.lng]);

  return (
    <MapContainer center={[defaultCenter.lat, defaultCenter.lng]} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%", minHeight: 480 }}>
      <MapRecenter center={center} />
      {selectedPath.length >= 2 && <FitPath points={selectedPath} />}
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />

      {/* 이동 경로 선 */}
      {pathPositions.length >= 2 && (
        <Polyline positions={pathPositions} color={NAVY} weight={3} opacity={0.65} dashArray="6 4" />
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

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

function ActivityFeed({ logs, driversMap }) {
  if (logs.length === 0) {
    return (
      <div style={{ padding: "36px 16px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
        기사가 버튼을 누르면 여기에 즉시 표시됩니다
      </div>
    );
  }
  return (
    <div>
      {logs.map((log, i) => {
        const statusColor = STATUS_COLORS[log.status] || "#9ca3af";
        const driverInfo = driversMap[log.uid] || {};
        const name = log.driverName || driverInfo.이름 || log.uid?.slice(0, 8) || "-";
        const carNo = log.carNo || driverInfo.차량번호 || "-";
        const hasLoc = log.location?.lat != null;
        return (
          <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "13px 20px", borderBottom: i < logs.length - 1 ? "1px solid #f0f2f5" : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 4, flexShrink: 0 }}>
              <div style={{ width: 11, height: 11, borderRadius: "50%", background: statusColor, boxShadow: `0 0 0 3px ${statusColor}22` }} />
              {i < logs.length - 1 && <div style={{ width: 1, minHeight: 20, flex: 1, background: "#e5e7eb", marginTop: 5 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{name}</span>
                <span style={{ fontSize: 13, color: "#6b7280", fontFamily: "monospace" }}>{carNo}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: statusColor, background: `${statusColor}18`, padding: "2px 9px", borderRadius: 99 }}>
                  {log.status}
                </span>
              </div>
              {hasLoc && (
                <div style={{ fontSize: 13, color: "#374151", marginBottom: 3 }}>
                  위치: {log.location.lat.toFixed(5)}, {log.location.lng.toFixed(5)}
                </div>
              )}
              <div style={{ fontSize: 13, color: "#9ca3af" }}>{timeAgo(log.timestamp)}</div>
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", flexShrink: 0, paddingTop: 2, fontWeight: 600 }}>{formatTime(log.timestamp)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── DriverDetailPanel ────────────────────────────────────────────────────────

function DriverDetailPanel({ data, logs, onClose }) {
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
            <span style={{ fontSize: 13, color: "#374151", fontFamily: "monospace", background: "#f0f2f5", padding: "3px 9px", borderRadius: 5, fontWeight: 700 }}>{data.차량번호 || "-"}</span>
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
          data.speed > 0 ? { label: "현재 속도", val: `${data.speed} km/h` } : null,
        ].filter(Boolean).map(({ label, val, color }) => (
          <div key={label} style={{ background: "#f8f9fb", borderRadius: 9, padding: "13px 15px", border: "1px solid #eaecf0" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", margin: "0 0 6px" }}>{label}</p>
            <p style={{ fontSize: 15, fontWeight: 800, color: color || NAVY, margin: 0 }}>{val}</p>
          </div>
        ))}
      </div>

      {/* Log history */}
      {logs.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", letterSpacing: ".09em", textTransform: "uppercase", margin: "0 0 12px" }}>상태 이력 (이동 동선)</p>
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
                      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                        {log.location.lat.toFixed(5)}, {log.location.lng.toFixed(5)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "#9ca3af", flexShrink: 0, fontWeight: 600 }}>{formatTime(log.timestamp)}</div>
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
        <div style={{ fontSize: 13, color: "#6b7280", fontFamily: "monospace", marginTop: 2, fontWeight: 600 }}>{d.carNo || "-"}</div>
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

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

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

    // 3. Activity feed
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

  // ── 선택 기사 로그 구독 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selected?.id) { setSelectedDriverLogs([]); return; }
    return onSnapshot(
      query(collection(db, "driver_logs"), where("uid", "==", selected.id), orderBy("timestamp", "desc"), limit(30)),
      (snap) => setSelectedDriverLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.error("selected logs:", err)
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
  // Points are in desc order from Firestore; reverse for chronological path
  const selectedPath = useMemo(() => {
    const withLoc = selectedDriverLogs.filter(l => l.location?.lat != null);
    if (withLoc.length === 0) return [];
    // Compute dwell time between consecutive points
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
  }, [selectedDriverLogs]);

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
        {[["tracking", "관제현황"], ["registration", "기사 등록 관리"]].map(([key, label]) => (
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
              <FleetMap drivers={filteredRows} center={mapCenter} onSelect={handleSelect} selectedPath={selectedPath} />
            </div>
          </div>

          {/* 선택 기사 상세 */}
          {selected && (
            <DriverDetailPanel
              data={selected}
              logs={selectedDriverLogs}
              onClose={() => { setSelected(null); setSelectedDriverLogs([]); }}
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
              <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 600 }}>최근 {filteredActivityLogs.length}건</span>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              <ActivityFeed logs={filteredActivityLogs} driversMap={driversMap} />
            </div>
          </div>
        </>
      )}

      {/* ═══ 기사 등록 관리 ═══ */}
      {mainTab === "registration" && <RegistrationTab usersMap={usersMap} />}

      <style>{`
        @keyframes fmLivePulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </div>
  );
}

// ======================= END =======================
