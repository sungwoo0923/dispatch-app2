// src/mobile/MobileFleetView.jsx — 지입차량 관제 (모바일)
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { db } from "../firebase";
import {
  collection, onSnapshot, query, where, orderBy, limit,
} from "firebase/firestore";
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap,
} from "react-leaflet";
import L from "leaflet";

const NAVY = "#1B2B4B";
const STATUS_COLORS = {
  운행중: "#10b981", 출근: "#3b82f6", 상차중: "#f59e0b",
  하차중: "#8b5cf6", 대기: "#6b7280", 휴식: "#9ca3af",
  퇴근: "#374151", 복귀중: "#06b6d4",
};
const STATUS_ORDER = ["운행중", "상차중", "하차중", "복귀중", "출근", "대기", "휴식", "퇴근"];

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

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function MobileFleetView() {
  const [driversRaw, setDriversRaw] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [expandedId, setExpandedId] = useState(null);
  const [activeSection, setActiveSection] = useState("drivers"); // "drivers" | "map" | "feed" | "attendance"
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
      return tracks.map(t => ({ lat: t.lat, lng: t.lng, status: "운행중", timestamp: t.timestamp }));
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

  // OSRM 도로 경로 (실제 도로 추적)
  useEffect(() => {
    setRoadPath([]);
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
        if (geometry) setRoadPath(geometry.map(([lng, lat]) => ({ lat, lng })));
      } catch (_) {}
    }, 800);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selectedPath]);

  // drivers 합성
  const drivers = useMemo(() => {
    return driversRaw
      .filter(raw => { const u = usersMap[raw.id]; return u && u.approved === true; })
      .map(raw => {
        const u = usersMap[raw.id];
        return {
          id: raw.id,
          이름: (u.name || raw.name || "").trim() || "-",
          차량번호: (u.carNo || raw.carNo || "").trim() || "-",
          vehicleType: u.vehicleType || raw.vehicleType || "-",
          phone: u.phone || raw.phone || "-",
          상태: raw.status || raw.mainStatus || "대기",
          location: raw.location || null,
          총거리: raw.totalDistance || 0,
          updatedAt: raw.updatedAt,
          active: raw.active === true,
          speed: raw.speed || 0,
          workStartAt: raw.workStartAt || null,
        };
      })
      .sort((a, b) => statusPriority(a) - statusPriority(b));
  }, [driversRaw, usersMap]);

  const driversMap = useMemo(() => {
    const m = {}; drivers.forEach(d => { m[d.id] = d; }); return m;
  }, [drivers]);

  const filtered = useMemo(() => {
    const kw = searchQ.trim().replace(/\s/g, "");
    return drivers.filter(d => {
      const matchQ = !kw || (d.차량번호 || "").replace(/\s/g, "").includes(kw) || d.이름.includes(kw);
      const matchF = statusFilter === "전체" || d.상태 === statusFilter;
      return matchQ && matchF;
    });
  }, [drivers, searchQ, statusFilter]);

  const kpi = useMemo(() => ({
    total: drivers.length,
    connected: drivers.filter(d => d.active).length,
    driving: drivers.filter(d => d.상태 === "운행중").length,
    onDuty: drivers.filter(d => ["출근","상차중","하차중","운행중","복귀중"].includes(d.상태)).length,
  }), [drivers]);

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

  // 지도에서 선택 기사 live 동기화 + 자동 추적 (출근~최종퇴근 중)
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
        setMapCenter({ lat: updated.location.lat, lng: updated.location.lng, _t: Date.now() });
      }
    }
  }, [drivers]); // eslint-disable-line

  const STATUS_OPTS = ["전체", "운행중", "출근", "상차중", "하차중", "대기", "퇴근"];

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

      {/* KPI 2×2 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "16px 16px 0" }}>
        {[
          { label: "총 등록 기사", val: kpi.total, primary: true },
          { label: "접속중", val: kpi.connected, color: "#3b82f6" },
          { label: "운행중", val: kpi.driving, color: "#10b981" },
          { label: "근무중", val: kpi.onDuty, color: "#f59e0b" },
        ].map(({ label, val, primary, color }) => (
          <div key={label} style={{
            background: primary ? NAVY : "white",
            borderRadius: 14, padding: "14px 16px",
            border: primary ? "none" : "1px solid #e5e7eb",
            boxShadow: primary ? "0 2px 8px rgba(27,43,75,.2)" : "none",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: primary ? "rgba(255,255,255,.55)" : "#6b7280", marginBottom: 6, letterSpacing: ".05em" }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: primary ? "#fff" : (color || NAVY), lineHeight: 1 }}>{val}</div>
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
        {[["drivers", "기사 목록"], ["map", "지도"], ["feed", "활동"], ["attendance", "출근기록"]].map(([key, label]) => (
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
              {drivers.length === 0 ? "등록된 기사가 없습니다" : "검색 결과가 없습니다"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(d => {
                const color = STATUS_COLORS[d.상태] || "#9ca3af";
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
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: d.active ? "#f0fdf4" : "#f9fafb", border: `1.5px solid ${d.active ? "#bbf7d0" : "#e5e7eb"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <div style={{ width: 12, height: 12, borderRadius: "50%", background: color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{d.이름}</span>
                          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, letterSpacing: "0.04em" }}>{d.차량번호}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color, background: `${color}18`, padding: "2px 8px", borderRadius: 99 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
                            {d.상태 || "대기"}
                          </span>
                          {d.vehicleType !== "-" && (
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>{d.vehicleType}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 12, color: "#9ca3af" }}>{timeAgo(d.updatedAt)}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginTop: 2 }}>{d.총거리.toFixed(1)} km</div>
                      </div>
                    </div>

                    {/* 확장 상세 */}
                    {expanded && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f0f2f5" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          {(() => {
                            const km = d.총거리 || 0;
                            const vt = String(d.vehicleType || "").replace(/\s/g,"");
                            const eff = /25|28/.test(vt)?3.0:/11|15|18/.test(vt)?3.5:/1[^0-9]|2\.5|소형/.test(vt)?5.5:4.0;
                            const fuelCost = km > 0 ? Math.round(km/eff*1750) : 0;
                            return [
                              ["연락처", d.phone || "-"],
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

            {/* 실시간 갱신 배지 */}
            <div style={{ position: "absolute", top: 10, left: 10, zIndex: 1000, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ background: "rgba(27,43,75,0.82)", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: "rgba(255,255,255,0.9)", fontWeight: 700, display: "flex", alignItems: "center", gap: 5, backdropFilter: "blur(4px)" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "mfvBlink 1.5s ease-in-out infinite" }} />
                30초 주기 갱신
              </div>
              {mapSelected && (
                <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: 8, padding: "5px 10px", fontSize: 11, color: NAVY, fontWeight: 700, backdropFilter: "blur(4px)" }}>
                  {mapSelected.이름} · {timeAgo(mapSelected.updatedAt)}
                </div>
              )}
            </div>
            {/* 경로 로딩 표시 */}
            {mapSelected && selectedPath.length >= 2 && roadPath.length < 2 && (
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
