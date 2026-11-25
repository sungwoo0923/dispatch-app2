// Leaflet(react-leaflet) 지도용 공용 레이어 — mapStyle.js와 같은 스타일
import React, { useMemo, useEffect, useRef, useState } from "react";
import { Polyline, CircleMarker, Tooltip } from "react-leaflet";
import { routeSegments, cleanTrack, TRACK_COLOR, TRAFFIC_LEGEND } from "./mapStyle";
import { getDrivingPathByCoords } from "./tmapFareCalc";

// 🛣 2026-11-25 동선이 직선으로 나오던 문제 — 기사앱 위치는 몇 분 간격으로 남아 고속도로에서는 점 사이가 수십 km 벌어진다.
//  두 점 사이가 GAP_KM 넘게 벌어진 구간만 실제 도로 경로로 채운다(OSRM 먼저 · 안 되면 티맵 — 티맵은 운임 계산과 같은 하루 한도를 써서 아낀다).
//  길을 찾는 동안 · 못 찾으면 그 구간만 점선
const GAP_KM = 0.8;
const MAX_GAPS = 30; // 한 번에 길을 찾는 구간 수(긴 구간부터)
async function fetchRoad(a, b) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 7000);
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, { signal: ctl.signal });
    clearTimeout(t);
    if (res.ok) {
      const r = (await res.json())?.routes?.[0];
      const c = r?.geometry?.coordinates;
      if (c?.length >= 2) return { path: c.map(([lng, lat]) => [lat, lng]), km: r.distance ? r.distance / 1000 : null };
    }
  } catch { /* 티맵으로 */ }
  return getDrivingPathByCoords(a, b).catch(() => null);
}
const roadCache = new Map(); // "lat,lng>lat,lng" → [[lat,lng]…] | null(못 찾음)
const pairKey = (a, b) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
function kmBetween(a, b) {
  const R = 6371, r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// 점 목록 → { solids: [[[lat,lng]…]…], dashes: [[[lat,lng],[lat,lng]]…] }
function useRoadSnapped(pts) {
  const [, setVer] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const gaps = useMemo(() => {
    const g = [];
    for (let i = 1; i < pts.length; i++) {
      const d = kmBetween(pts[i - 1], pts[i]);
      if (d > GAP_KM) g.push({ a: pts[i - 1], b: pts[i], d, k: pairKey(pts[i - 1], pts[i]) });
    }
    return g;
  }, [pts]);
  useEffect(() => {
    const todo = [...gaps].filter((g) => !roadCache.has(g.k)).sort((x, y) => y.d - x.d).slice(0, MAX_GAPS);
    if (!todo.length) return;
    let stop = false;
    (async () => {
      for (let i = 0; i < todo.length && !stop; i += 4) {
        await Promise.all(todo.slice(i, i + 4).map(async (g) => {
          if (roadCache.has(g.k)) return;
          const r = await fetchRoad(g.a, g.b);
          const path = r?.path?.length >= 2 ? r.path : null;
          // 도로 경로가 곧은 거리의 4배를 넘으면(엉뚱한 길) 쓰지 않는다
          roadCache.set(g.k, path && (!r.km || r.km <= g.d * 4 + 2) ? path : null);
        }));
        if (!stop && alive.current) setVer((v) => v + 1);
      }
    })();
    return () => { stop = true; };
  }, [gaps]);
  const solids = [], dashes = [];
  let cur = pts.length ? [[pts[0].lat, pts[0].lng]] : [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (kmBetween(a, b) > GAP_KM) {
      const road = roadCache.get(pairKey(a, b));
      if (road) { cur.push(...road, [b.lat, b.lng]); continue; }
      if (cur.length >= 2) solids.push(cur);
      dashes.push([[a.lat, a.lng], [b.lat, b.lng]]);
      cur = [[b.lat, b.lng]];
      continue;
    }
    cur.push([b.lat, b.lng]);
  }
  if (cur.length >= 2) solids.push(cur);
  return { solids, dashes };
}

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
  const { solids, dashes } = useRoadSnapped(pts);
  if (pts.length < 2) return null;
  const positions = pts.map(p => [p.lat, p.lng]);
  return (
    <>
      {solids.map((line, i) => <Polyline key={`w${i}`} positions={line} pathOptions={{ color: "#ffffff", weight: 9, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />)}
      {solids.map((line, i) => <Polyline key={`c${i}`} positions={line} pathOptions={{ color: TRACK_COLOR, weight: 5, opacity: 0.85, lineCap: "round", lineJoin: "round" }} />)}
      {dashes.map((line, i) => <Polyline key={`d${i}`} positions={line} pathOptions={{ color: TRACK_COLOR, weight: 3, opacity: 0.6, dashArray: "4 8", lineCap: "round" }} />)}
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
