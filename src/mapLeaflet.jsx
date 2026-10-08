// Leaflet(react-leaflet) 지도용 공용 레이어 — mapStyle.js와 같은 스타일
import React, { useMemo } from "react";
import { Polyline, CircleMarker, Tooltip } from "react-leaflet";
import { routeSegments, cleanTrack, TRACK_COLOR, TRAFFIC_LEGEND } from "./mapStyle";

// 기사 실제 이동 동선 — 점 대신 매끈한 선 + 출발점, 상태가 바뀐 지점만 작은 마커
export function LeafletTrack({ points, statusPoints, statusColors = {}, showStatusChanges = true }) {
  const pts = useMemo(() => cleanTrack(points), [points]);
  const changes = useMemo(() => {
    if (!showStatusChanges) return [];
    const out = [];
    let prev = null;
    for (const p of statusPoints || points || []) {
      if (p?.status && p.status !== prev) { out.push(p); prev = p.status; }
    }
    return out.slice(1); // 첫 상태는 출발점과 같음
  }, [points, statusPoints, showStatusChanges]);
  if (pts.length < 2) return null;
  const positions = pts.map(p => [p.lat, p.lng]);
  return (
    <>
      <Polyline positions={positions} pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
      <Polyline positions={positions} pathOptions={{ color: TRACK_COLOR, weight: 5, opacity: 0.85, lineCap: "round", lineJoin: "round" }} />
      <CircleMarker center={positions[0]} radius={7} pathOptions={{ color: TRACK_COLOR, weight: 3, fillColor: "#fff", fillOpacity: 1 }}>
        <Tooltip direction="top" offset={[0, -6]}>출발</Tooltip>
      </CircleMarker>
      {changes.map((p, i) => (
        <CircleMarker key={i} center={[p.lat, p.lng]} radius={5}
          pathOptions={{ color: "#fff", weight: 2, fillColor: statusColors[p.status] || TRACK_COLOR, fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -4]}>{p.status}</Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

// 예정 경로 — 두꺼운 선 + 교통상황 색
export function LeafletTrafficRoute({ routeData, weight = 8 }) {
  const segs = useMemo(() => routeSegments(routeData), [routeData]);
  if (!segs.length) return null;
  const all = segs.flatMap(s => s.points);
  return (
    <>
      <Polyline positions={all} pathOptions={{ color: "#ffffff", weight: weight + 4, opacity: 1, lineCap: "round", lineJoin: "round" }} />
      {segs.map((s, i) => (
        <Polyline key={i} positions={s.points} pathOptions={{ color: s.color, weight, opacity: 1, lineCap: "round", lineJoin: "round" }} />
      ))}
    </>
  );
}

// 지도 위 범례(교통상황 + 실제 동선)
export function MapLegend({ showTraffic = true, showTrack = true, style }) {
  return (
    <div style={{
      position: "absolute", left: 10, bottom: 10, zIndex: 1000, background: "rgba(255,255,255,0.94)",
      borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: "#374151",
      display: "flex", gap: 10, alignItems: "center", boxShadow: "0 1px 6px rgba(0,0,0,.12)", ...style,
    }}>
      {showTraffic && TRAFFIC_LEGEND.map(t => (
        <span key={t.c} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 16, height: 5, borderRadius: 3, background: t.color, display: "inline-block" }} />{t.label}
        </span>
      ))}
      {showTrack && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 16, height: 5, borderRadius: 3, background: TRACK_COLOR, display: "inline-block" }} />실제 이동
        </span>
      )}
    </div>
  );
}
