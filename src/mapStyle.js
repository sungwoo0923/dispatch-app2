// ⭐ 프로그램 전체 지도 공용 스타일
//  1) 예정 경로: 티맵처럼 두껍게 + 구간별 교통상황 색(원활/서행/지체/정체)
//     — /api/route 응답의 segments: [{ c: 0~4, path: [[lng,lat],...] }]
//  2) 기사 실제 이동 동선: 점을 다닥다닥 찍지 않고, GPS 튐을 걸러낸 매끈한 선
//     + 출발점/현재 위치만 표시
//  Tmap(Tmapv2) 지도와 Leaflet 지도 둘 다 지원한다.
import { haversineKm } from "./tmapFareCalc";

export const TRAFFIC = {
  0: { color: "#3b82f6", label: "정보없음" },
  1: { color: "#16a34a", label: "원활" },
  2: { color: "#f59e0b", label: "서행" },
  3: { color: "#f97316", label: "지체" },
  4: { color: "#dc2626", label: "정체" },
};
export const TRACK_COLOR = "#7c3aed"; // 실제 이동 동선(보라) — 교통 색과 겹치지 않게
const CASING = "#ffffff";

// 경로 데이터 → 색 구간 목록 [{ color, points: [[lat,lng],...] }]
export function routeSegments(routeData) {
  const segs = Array.isArray(routeData?.segments) ? routeData.segments : [];
  if (segs.length) {
    return segs
      .filter(s => Array.isArray(s.path) && s.path.length >= 2)
      .map(s => ({ c: s.c || 0, color: (TRAFFIC[s.c] || TRAFFIC[0]).color, points: s.path.map(([lng, lat]) => [lat, lng]) }));
  }
  const path = Array.isArray(routeData?.path) ? routeData.path : [];
  return path.length >= 2 ? [{ c: 0, color: TRAFFIC[0].color, points: path.map(([lng, lat]) => [lat, lng]) }] : [];
}

// GPS 동선 정리
//  ⭐ 정차 중(실내·주차장) GPS/와이파이 위치가 수십~수백m씩 튀어 지도에 "낙서"처럼
//  보였다. ① 오차가 큰 점 제외 ② 40m 이내 촘촘한 점 솎기 ③ 비현실적 속도(순간이동) 제외
//  ④ 갔다가 바로 되돌아오는 "튀는 점"(A→B→A 모양) 제거
export function cleanTrack(points, { minGapKm = 0.1, maxJumpKmh = 140, maxAccuracyM = 50 } = {}) {
  const pts = (points || []).filter(p => p && p.lat != null && p.lng != null
    && !(p.accuracy != null && p.accuracy > maxAccuracyM));
  let out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = out[out.length - 1];
    if (!prev) { out.push(p); continue; }
    const km = haversineKm(prev.lat, prev.lng, p.lat, p.lng);
    if (km < minGapKm) continue;
    // 정차 중 튐 방지 — 기준점에서 벗어난 점이라도, 바로 다음 점들이 다시 기준점 근처로
    // 돌아오면 실제로 출발한 게 아니라 GPS 튐이다(진짜 출발이면 계속 멀어진다).
    const n1 = pts[i + 1], n2 = pts[i + 2];
    const back = (n) => n && haversineKm(prev.lat, prev.lng, n.lat, n.lng) < minGapKm * 1.5;
    if (back(n1) || back(n2)) continue;
    const t1 = tsMs(prev.timestamp), t2 = tsMs(p.timestamp);
    if (t1 && t2 && t2 > t1) {
      const kmh = km / ((t2 - t1) / 3600000);
      if (kmh > maxJumpKmh) continue; // GPS 튐
    }
    out.push(p);
  }
  // 튀는 점 제거(두 번 반복 — 연속 튐도 정리)
  for (let pass = 0; pass < 2; pass++) {
    const res = [];
    for (let i = 0; i < out.length; i++) {
      const a = res[res.length - 1], b = out[i], c = out[i + 1];
      if (a && c) {
        const ab = haversineKm(a.lat, a.lng, b.lat, b.lng);
        const bc = haversineKm(b.lat, b.lng, c.lat, c.lng);
        const ac = haversineKm(a.lat, a.lng, c.lat, c.lng);
        if (ab > 0.06 && bc > 0.06 && ac < 0.5 * Math.min(ab, bc)) continue;
      }
      res.push(b);
    }
    out = res;
  }
  return out;
}
function tsMs(t) {
  if (!t) return null;
  if (typeof t === "number") return t;
  if (t.toMillis) return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  return null;
}

// ─── Tmap(Tmapv2) ─────────────────────────────────────────────────────────
// 반환값: 그려진 오버레이 배열(지울 때 clearTmapOverlays에 넘김)
export function drawTmapTrafficRoute(map, routeData, { weight = 8 } = {}) {
  const T = window.Tmapv2;
  if (!T || !map) return [];
  const segs = routeSegments(routeData);
  const all = segs.flatMap(s => s.points);
  const overlays = [];
  if (all.length >= 2) {
    // 흰 테두리(케이싱) — 지도 위에서 선이 또렷하게 보이게
    overlays.push(new T.Polyline({
      path: all.map(([lat, lng]) => new T.LatLng(lat, lng)),
      strokeColor: CASING, strokeWeight: weight + 4, strokeOpacity: 1, map,
    }));
  }
  segs.forEach(s => {
    overlays.push(new T.Polyline({
      path: s.points.map(([lat, lng]) => new T.LatLng(lat, lng)),
      strokeColor: s.color, strokeWeight: weight, strokeOpacity: 1, map,
    }));
  });
  return overlays;
}

export function drawTmapTrack(map, points, { weight = 5 } = {}) {
  const T = window.Tmapv2;
  if (!T || !map) return [];
  const pts = cleanTrack(points);
  if (pts.length < 2) return [];
  const path = pts.map(p => new T.LatLng(p.lat, p.lng));
  return [
    new T.Polyline({ path, strokeColor: CASING, strokeWeight: weight + 3, strokeOpacity: 0.9, map }),
    new T.Polyline({ path, strokeColor: TRACK_COLOR, strokeWeight: weight, strokeOpacity: 0.85, map }),
    new T.Marker({
      position: path[0], map,
      icon: dotIcon("#ffffff", TRACK_COLOR), iconSize: new T.Size(16, 16), iconAnchor: new T.Point(8, 8),
      title: "출발",
    }),
  ];
}

export function clearTmapOverlays(list) {
  (list || []).forEach(o => { try { o.setMap(null); } catch { /* noop */ } });
}

export function dotIcon(fill, stroke) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${fill}" stroke="${stroke}" stroke-width="3"/></svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

// 지도 좌하단 범례 HTML(문자열) — 필요한 곳에서 dangerouslySetInnerHTML 없이 React로 그리도록
export const TRAFFIC_LEGEND = [1, 2, 4, 0].map(c => ({ c, ...TRAFFIC[c] }));
