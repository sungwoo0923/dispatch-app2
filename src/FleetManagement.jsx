// ======================= FleetManagement.jsx — 지입차량 관제 센터 =======================
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { db, auth, getCollections } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// ─── 상수 ────────────────────────────────────────────────────────────────────

const NAVY      = "#1B2B4B";
const NAVY_DARK = "#131e35";
const NAVY_LIGHT = "#243454";

const STATUS_DOT = {
  운행중: "#10b981",
  출근:   "#3b82f6",
  상차중: "#f59e0b",
  하차중: "#8b5cf6",
  대기:   "#9ca3af",
  휴식:   "#6b7280",
  퇴근:   "#1f2937",
};

const STATUS_ORDER = ["운행중", "상차중", "하차중", "출근", "대기", "휴식", "퇴근"];
const STATUS_FILTER_OPTIONS = ["전체", "운행중", "출근", "상차중", "하차중", "대기", "휴식", "퇴근"];

// ─── Leaflet 마커 아이콘 ──────────────────────────────────────────────────────

function makeIcon(color, pulse) {
  return L.divIcon({
    html: `
      <div style="
        width:14px; height:14px;
        background:${color};
        border-radius:50%;
        border:2.5px solid #ffffff;
        box-shadow:0 1px 6px rgba(0,0,0,0.35);
        ${pulse ? "animation:fmPulse 1.6s infinite ease-in-out;" : ""}
      "></div>
      <style>
        @keyframes fmPulse {
          0%   { transform:scale(1);   opacity:1; }
          50%  { transform:scale(1.45); opacity:0.75; }
          100% { transform:scale(1);   opacity:1; }
        }
      </style>
    `,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

const ICONS = Object.fromEntries(
  Object.entries(STATUS_DOT).map(([status, color]) => [
    status,
    makeIcon(color, status === "운행중"),
  ])
);
const ICON_DEFAULT = makeIcon("#9ca3af", false);

function getIcon(status) {
  return ICONS[status] || ICON_DEFAULT;
}

// ─── 지도 중심 이동 ───────────────────────────────────────────────────────────

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

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return "-";
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 30) return "방금";
  if (diffSec < 60) return `${diffSec}초 전`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  return `${Math.floor(diffHr / 24)}일 전`;
}

function formatMinutes(min) {
  if (!min || min <= 0) return "0분";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return `${h}시간 ${m}분`;
}

function statusPriority(d) {
  const activeBonus = d.active ? 0 : 1000;
  const idx = STATUS_ORDER.indexOf(d.상태);
  return activeBonus + (idx === -1 ? 999 : idx);
}

// ─── 컴포넌트: 상태 도트 ──────────────────────────────────────────────────────

function StatusDot({ status, size = 8, showLabel = true, labelStyle }) {
  const color = STATUS_DOT[status] || "#9ca3af";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {showLabel && (
        <span style={{ color: "#374151", fontSize: 12, fontWeight: 500, ...labelStyle }}>
          {status || "확인중"}
        </span>
      )}
    </span>
  );
}

// ─── 컴포넌트: KPI 카드 ────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, primary, accent }) {
  if (primary) {
    return (
      <div
        style={{
          background: `linear-gradient(135deg, ${NAVY_DARK} 0%, ${NAVY_LIGHT} 100%)`,
          borderRadius: 12,
          padding: "18px 22px",
          minWidth: 0,
          boxShadow: "0 2px 8px rgba(27,43,75,0.18)",
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          {label}
        </p>
        <p style={{ color: "#fff", fontSize: 30, fontWeight: 800, lineHeight: 1, margin: 0 }}>{value}</p>
        {sub && (
          <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 10, marginTop: 7, margin: "7px 0 0" }}>{sub}</p>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "18px 22px",
        minWidth: 0,
      }}
    >
      <p style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <p style={{ color: accent || NAVY, fontSize: 30, fontWeight: 800, lineHeight: 1, margin: 0 }}>{value}</p>
      </div>
      {sub && (
        <p style={{ color: "#c4c9d4", fontSize: 10, marginTop: 7, margin: "7px 0 0" }}>{sub}</p>
      )}
    </div>
  );
}

// ─── 컴포넌트: 드라이버 테이블 ───────────────────────────────────────────────────

const COL_HEADERS = ["순번", "이름", "차량번호", "차량종류", "현재상태", "이동거리", "마지막업데이트"];

function DriverTable({ rows, selectedId, onSelect }) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "56px 24px",
          color: "#c4c9d4",
        }}
      >
        <svg
          width="36"
          height="36"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          viewBox="0 0 24 24"
          style={{ marginBottom: 10 }}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
        </svg>
        <p style={{ fontSize: 12, fontWeight: 500, color: "#9ca3af" }}>조건에 맞는 기사가 없습니다</p>
      </div>
    );
  }

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ background: "#f8f9fb", borderBottom: "2px solid #eaecf0", position: "sticky", top: 0, zIndex: 1 }}>
          {COL_HEADERS.map((col) => (
            <th
              key={col}
              style={{
                padding: "9px 12px",
                textAlign: "left",
                color: "#9ca3af",
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((d, idx) => {
          const sel = d.id === selectedId;
          const baseRow  = sel ? NAVY : idx % 2 === 0 ? "#fff" : "#fafbfc";
          const hoverRow = sel ? NAVY : "#f0f3f9";

          return (
            <tr
              key={d.id}
              onClick={() => onSelect(d)}
              style={{
                background: baseRow,
                borderBottom: "1px solid #f0f2f5",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!sel) e.currentTarget.style.background = hoverRow;
              }}
              onMouseLeave={(e) => {
                if (!sel) e.currentTarget.style.background = baseRow;
              }}
            >
              {/* 순번 */}
              <td style={{ padding: "10px 12px", color: sel ? "rgba(255,255,255,0.38)" : "#c4c9d4", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {idx + 1}
              </td>

              {/* 이름 + 접속 도트 */}
              <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    title={d.active ? "접속중" : "미접속"}
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: d.active ? "#10b981" : "#d1d5db",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: sel ? "#fff" : "#111827", fontWeight: 600 }}>
                    {d.이름 || "-"}
                  </span>
                </div>
              </td>

              {/* 차량번호 */}
              <td style={{ padding: "10px 12px", color: sel ? "rgba(255,255,255,0.82)" : "#374151", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono','Courier New',monospace", fontSize: 11, letterSpacing: "0.02em" }}>
                {d.차량번호 || "-"}
              </td>

              {/* 차량종류 */}
              <td style={{ padding: "10px 12px", color: sel ? "rgba(255,255,255,0.6)" : "#6b7280", whiteSpace: "nowrap" }}>
                {d.vehicleType || d.차량종류 || "-"}
              </td>

              {/* 현재상태 */}
              <td style={{ padding: "10px 12px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: sel ? "rgba(255,255,255,0.7)" : (STATUS_DOT[d.상태] || "#9ca3af"),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: sel ? "#fff" : "#374151", fontWeight: 500 }}>
                    {d.상태 || "확인중"}
                  </span>
                </span>
              </td>

              {/* 이동거리 */}
              <td style={{ padding: "10px 12px", color: sel ? "rgba(255,255,255,0.78)" : "#374151", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {(d.총거리 || 0).toFixed(1)} km
              </td>

              {/* 마지막업데이트 */}
              <td style={{ padding: "10px 12px", color: sel ? "rgba(255,255,255,0.45)" : "#9ca3af", whiteSpace: "nowrap" }}>
                {timeAgo(d.updatedAt)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── 컴포넌트: 인라인 지도 ───────────────────────────────────────────────────────

function FleetMap({ drivers, center, onSelect }) {
  const defaultCenter = center || { lat: 37.5665, lng: 126.9780 };

  return (
    <MapContainer
      center={[defaultCenter.lat, defaultCenter.lng]}
      zoom={12}
      scrollWheelZoom
      style={{ height: "100%", width: "100%", minHeight: 480 }}
    >
      <MapRecenter center={center} />
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {drivers.map((d) =>
        d.location ? (
          <Marker
            key={d.id}
            position={[d.location.lat, d.location.lng]}
            icon={getIcon(d.상태)}
            eventHandlers={{ click: () => onSelect?.(d) }}
          >
            <Popup offset={[0, -8]}>
              <div style={{ fontSize: 12, lineHeight: 1.7, minWidth: 140 }}>
                <div style={{ fontWeight: 700, color: NAVY, marginBottom: 4 }}>
                  {d.이름 || "-"}&nbsp;
                  <span style={{ fontWeight: 400, color: "#6b7280", fontFamily: "monospace", fontSize: 11 }}>
                    {d.차량번호 || ""}
                  </span>
                </div>
                <div>
                  <StatusDot status={d.상태} size={7} />
                </div>
                <div style={{ color: "#6b7280", marginTop: 2 }}>
                  이동거리: {(d.총거리 || 0).toFixed(1)} km
                </div>
                <div style={{ color: "#9ca3af", fontSize: 11 }}>
                  업데이트: {timeAgo(d.updatedAt)}
                </div>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}

// ─── 컴포넌트: 통계 블록 ─────────────────────────────────────────────────────────

function StatBlock({ label, value, valueColor, mono }) {
  return (
    <div
      style={{
        background: "#f8f9fb",
        borderRadius: 8,
        padding: "12px 14px",
        border: "1px solid #eaecf0",
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5, margin: "0 0 5px" }}>
        {label}
      </p>
      <p style={{ fontSize: 14, fontWeight: 700, color: valueColor || NAVY, fontFamily: mono ? "'JetBrains Mono','Courier New',monospace" : "inherit", margin: 0 }}>
        {value}
      </p>
    </div>
  );
}

// ─── 컴포넌트: 드라이버 상세 패널 ────────────────────────────────────────────────

function DriverDetailPanel({ data, onClose }) {
  if (!data) return null;

  const updatedAgo   = timeAgo(data.updatedAt);
  const updatedExact = data.updatedAt?.toDate
    ? data.updatedAt.toDate().toLocaleString("ko-KR")
    : "-";

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "22px 26px",
        position: "relative",
        boxShadow: "0 2px 12px rgba(27,43,75,0.07)",
      }}
    >
      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 30,
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #e5e7eb",
          borderRadius: 7,
          background: "#f8f9fb",
          cursor: "pointer",
          color: "#6b7280",
          padding: 0,
        }}
        title="닫기"
      >
        <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: NAVY,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="22" height="22" fill="none" stroke="white" strokeWidth="1.7" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
          </svg>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: NAVY, letterSpacing: "-0.01em" }}>
              {data.이름 || "-"}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#6b7280",
                fontFamily: "'JetBrains Mono','Courier New',monospace",
                background: "#f0f2f5",
                padding: "2px 7px",
                borderRadius: 4,
              }}
            >
              {data.차량번호 || "-"}
            </span>
            {(data.vehicleType || data.차량종류) && (
              <span
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  padding: "2px 8px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 99,
                }}
              >
                {data.vehicleType || data.차량종류}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
            <StatusDot status={data.상태} size={8} labelStyle={{ fontSize: 12, fontWeight: 600 }} />
            <span
              style={{
                width: 1,
                height: 12,
                background: "#e5e7eb",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {updatedAgo} 업데이트
            </span>
            <span style={{ fontSize: 11, color: "#c4c9d4" }}>
              ({updatedExact})
            </span>
          </div>
        </div>
      </div>

      {/* 섹션: 오늘 통계 */}
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#9ca3af",
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          marginBottom: 10,
          margin: "0 0 10px",
        }}
      >
        오늘 운행 현황
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          marginBottom: 0,
        }}
      >
        <StatBlock label="이동거리" value={`${(data.총거리 || 0).toFixed(2)} km`} />
        <StatBlock label="근무시간" value={formatMinutes(data.근무시간)} />
        <StatBlock
          label="접속 상태"
          value={data.active ? "접속중" : "미접속"}
          valueColor={data.active ? "#10b981" : "#9ca3af"}
        />
        <StatBlock label="경로 포인트" value={`${(data.경로 || []).length}개`} />
        {data.location && (
          <StatBlock
            label="현재 좌표"
            value={`${data.location.lat?.toFixed(4)}, ${data.location.lng?.toFixed(4)}`}
            mono
          />
        )}
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function FleetManagement() {
  const [drivers,      setDrivers]      = useState([]);
  const [query,        setQuery]        = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [selected,     setSelected]     = useState(null);
  const [mapCenter,    setMapCenter]    = useState(null);
  const [lastUpdated,  setLastUpdated]  = useState(null);
  const [loading,      setLoading]      = useState(true);

  // ── Firebase 실시간 구독 ──────────────────────────────────────────────────
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) return;

      const { drivers: driversCol } = getCollections(user);

      const unsubSnap = onSnapshot(collection(db, driversCol), async (snap) => {
        const arr = [];

        for (const s of snap.docs) {
          const id = s.id;
          const d  = s.data();

          const uSnap = await getDoc(doc(db, "users", id));
          const u     = uSnap.exists() ? uSnap.data() : {};

          if ((u.role || d.role) !== "driver") continue;

          arr.push({
            id,
            이름:        u.name       || d.name       || "-",
            차량번호:    u.carNo      || d.carNo      || "-",
            vehicleType: u.vehicleType || d.vehicleType || "-",
            차량종류:    u.vehicleType || d.vehicleType || "-",
            role:        u.role        || d.role,
            상태:        d.status      || "대기",
            location:    d.location    || null,
            경로:        d.path        || [],
            총거리:      d.totalDistance || 0,
            근무시간:    d.workMinutes  || 0,
            updatedAt:   d.updatedAt,
            active:      d.active === true,
          });
        }

        // 정렬: active=true 우선, 그 다음 상태 우선순위
        arr.sort((a, b) => statusPriority(a) - statusPriority(b));

        setDrivers(arr);
        setLastUpdated(new Date());
        setLoading(false);
      });

      return () => unsubSnap();
    });

    return () => unsubAuth();
  }, []);

  // ── 필터링 ────────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const kw = query.trim();
    return drivers.filter((d) => {
      const matchQ =
        !kw ||
        (d.차량번호 && d.차량번호.includes(kw)) ||
        (d.이름     && d.이름.includes(kw));
      const matchF = statusFilter === "전체" || d.상태 === statusFilter;
      return matchQ && matchF;
    });
  }, [drivers, query, statusFilter]);

  // ── KPI ──────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => ({
    total:     drivers.length,
    connected: drivers.filter((d) => d.active).length,
    driving:   drivers.filter((d) => d.상태 === "운행중").length,
    onDuty:    drivers.filter((d) => d.상태 === "출근" || d.상태 === "대기").length,
  }), [drivers]);

  // ── 핸들러 ───────────────────────────────────────────────────────────────
  const handleTableSelect = useCallback((d) => {
    if (selected?.id === d.id) {
      setSelected(null);
      return;
    }
    setSelected(d);
    if (d.location) setMapCenter(d.location);
  }, [selected]);

  const handleMapSelect = useCallback((d) => {
    setSelected(d);
    if (d.location) setMapCenter(d.location);
  }, []);

  // ─── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "4px 0",
        fontFamily: "'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif",
      }}
    >

      {/* ════════════════ 헤더 카드 ════════════════ */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "15px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: NAVY,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {/* 트럭 아이콘 */}
            <svg width="21" height="21" fill="none" stroke="white" strokeWidth="1.7" viewBox="0 0 24 24">
              <rect x="1" y="3" width="15" height="13" rx="1" />
              <path d="M16 8h4l3 3v5h-7V8Z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
          </div>
          <div>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: NAVY,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              지입차량 관제
            </h1>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0" }}>
              실시간 차량 모니터링 시스템
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {loading ? (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>데이터 로딩 중...</span>
          ) : lastUpdated ? (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              마지막 갱신: {lastUpdated.toLocaleTimeString("ko-KR")}
            </span>
          ) : null}

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 11px",
              borderRadius: 99,
              border: "1px solid #e5e7eb",
              fontSize: 11,
              color: "#374151",
              fontWeight: 500,
              background: "#fafafa",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#10b981",
                display: "inline-block",
              }}
            />
            실시간 연결
          </span>
        </div>
      </div>

      {/* ════════════════ KPI 행 ════════════════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
        }}
      >
        <KpiCard
          label="총 등록"
          value={kpi.total}
          sub="전체 기사 수"
          primary
        />
        <KpiCard
          label="현재 접속중"
          value={kpi.connected}
          sub="active = true"
        />
        <KpiCard
          label="운행중"
          value={kpi.driving}
          sub="현재 주행 중"
        />
        <KpiCard
          label="출근 / 대기"
          value={kpi.onDuty}
          sub="출근 + 대기 합산"
        />
      </div>

      {/* ════════════════ 검색 + 필터 바 ════════════════ */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: "11px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* 검색 인풋 */}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
          <svg
            width="13"
            height="13"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="기사명 / 차량번호 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: 32,
              paddingRight: 10,
              paddingTop: 7,
              paddingBottom: 7,
              border: "1px solid #e5e7eb",
              borderRadius: 7,
              fontSize: 12,
              color: "#374151",
              outline: "none",
              background: "#fafafa",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 상태 필터 버튼 */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const active = statusFilter === opt;
            return (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                style={{
                  padding: "5px 11px",
                  borderRadius: 6,
                  border: active ? `1.5px solid ${NAVY}` : "1px solid #e5e7eb",
                  background: active ? NAVY : "#fff",
                  color: active ? "#fff" : "#6b7280",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.12s",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                {opt !== "전체" && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: active ? "rgba(255,255,255,0.65)" : (STATUS_DOT[opt] || "#9ca3af"),
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                )}
                {opt}
              </button>
            );
          })}
        </div>

        {/* 결과 카운트 */}
        <span
          style={{
            fontSize: 11,
            color: "#9ca3af",
            marginLeft: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {filteredRows.length}명 표시&nbsp;/&nbsp;전체 {drivers.length}명
        </span>
      </div>

      {/* ════════════════ 2단 레이아웃: 테이블(40%) + 지도(60%) ════════════════ */}
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "stretch",
          minHeight: 520,
        }}
      >
        {/* 왼쪽 패널: 기사 테이블 */}
        <div
          style={{
            flex: "0 0 40%",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {/* 패널 헤더 */}
          <div
            style={{
              padding: "11px 16px",
              borderBottom: "1px solid #f0f2f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, letterSpacing: "-0.01em" }}>
              기사 목록
            </span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {filteredRows.length}명
            </span>
          </div>

          {/* 테이블 스크롤 영역 */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
            <DriverTable
              rows={filteredRows}
              selectedId={selected?.id}
              onSelect={handleTableSelect}
            />
          </div>
        </div>

        {/* 오른쪽 패널: 지도 */}
        <div
          style={{
            flex: "1 1 60%",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            minWidth: 0,
            minHeight: 520,
            position: "relative",
          }}
        >
          {/* 지도 레이블 오버레이 */}
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 1000,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "5px 11px",
              fontSize: 11,
              fontWeight: 600,
              color: NAVY,
              backdropFilter: "blur(4px)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
            }}
          >
            실시간 위치
            <span
              style={{
                marginLeft: 7,
                color: "#9ca3af",
                fontWeight: 400,
              }}
            >
              {filteredRows.filter((d) => d.location).length}대 표시
            </span>
          </div>

          <FleetMap
            drivers={filteredRows}
            center={mapCenter}
            onSelect={handleMapSelect}
          />
        </div>
      </div>

      {/* ════════════════ 선택된 기사 상세 패널 ════════════════ */}
      {selected && (
        <DriverDetailPanel
          data={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ======================= END =======================
