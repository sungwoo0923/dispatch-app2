// 🗺 2026-11-26 이동 기록 다시보기 — 기사 하루(출근 → 퇴근) 또는 오더 한 건의 실제 다닌 길을 지도에 그리고,
//  얼마나 달렸는지 · 얼마나 걸렸는지 · 어디서 얼마나 쉬었는지를 보여 준다. 재생 버튼을 누르면 트럭이 그 길을 다시 달린다.
//  자료: gps_tracks(기사앱이 30초 · 50m 마다 남기는 위치) · driver_logs(출근 · 퇴근) · 배차 오더(상차 도착 · 상차 완료 · 운송 완료 시각)
//  색: A 관제실 다크 / B 지도 중심 라이트(FleetControlDeck 의 LW_VARS 를 같이 쓴다)
import React from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { useRoadSnapped, kmBetween } from "./mapLeaflet";
import { makeTruckIcon, bearingDeg, TRUCK_CSS } from "./fleetTruck";
import { LW_VARS } from "./FleetControlDeck";

// ── 시간 · 숫자 ────────────────────────────────────────────────
export const tsOf = (v) => {
  if (!v) return 0;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const t = Date.parse(String(v).replace(" ", "T"));
  return Number.isFinite(t) ? t : 0;
};
const p2 = (n) => String(n).padStart(2, "0");
const hm = (ms) => { if (!ms) return "-"; const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const durText = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}분`;
  return `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}`;
};
const kmText = (km) => (km >= 100 ? `${Math.round(km)}` : km >= 10 ? km.toFixed(1) : km.toFixed(2));
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const shiftDate = (s, n) => { const d = new Date(`${s}T12:00:00+09:00`); d.setDate(d.getDate() + n); return kstDate(d); };
const WD = "일월화수목금토";
const dateLabel = (s) => { const d = new Date(`${s}T12:00:00+09:00`); return `${d.getMonth() + 1}.${p2(d.getDate())} (${WD[d.getDay()]})`; };

// ── 계산 ──────────────────────────────────────────────────────
// GPS 튐(정확도 낮음 · 말이 안 되는 속도)을 빼고 시간 순으로
export function cleanPoints(raw) {
  const pts = raw
    .map((t) => ({ lat: Number(t.lat), lng: Number(t.lng), t: tsOf(t.timestamp), speed: Number(t.speed) || 0, acc: t.accuracy != null ? Number(t.accuracy) : null }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.t && !(p.acc != null && p.acc > 60))
    .sort((a, b) => a.t - b.t);
  const out = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev) {
      const km = kmBetween(prev, p);
      const h = (p.t - prev.t) / 3600000;
      if (h > 0 && km / h > 150) continue; // 순간 이동 = 튐
    }
    out.push(p);
  }
  return out;
}
// 같은 자리(150m 안)에 5분 넘게 머문 곳 = 쉰 곳
export function findStops(pts, { radiusKm = 0.15, minMs = 5 * 60000 } = {}) {
  const stops = [];
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && kmBetween(pts[i], pts[j + 1]) <= radiusKm) j++;
    const dur = pts[j].t - pts[i].t;
    if (dur >= minMs) { stops.push({ lat: pts[i].lat, lng: pts[i].lng, from: pts[i].t, to: pts[j].t, ms: dur }); i = j + 1; } else i++;
  }
  return stops;
}
export function statsOf(pts, t0, t1) {
  const seg = pts.filter((p) => p.t >= t0 && p.t <= t1);
  let km = 0, maxKmh = 0;
  for (let i = 1; i < seg.length; i++) {
    const d = kmBetween(seg[i - 1], seg[i]);
    km += d;
    const h = (seg[i].t - seg[i - 1].t) / 3600000;
    if (h > 0 && h < 0.25) maxKmh = Math.max(maxKmh, Math.min(140, d / h)); // 15분 넘게 비면 속도 계산에서 뺀다
    maxKmh = Math.max(maxKmh, Math.min(140, seg[i].speed || 0));
  }
  const stops = findStops(seg);
  const stopMs = stops.reduce((s, x) => s + x.ms, 0);
  const span = seg.length ? seg[seg.length - 1].t - seg[0].t : 0;
  const totalMs = Math.max(0, (t1 === Infinity ? (seg[seg.length - 1]?.t || 0) : t1) - (t0 === -Infinity ? (seg[0]?.t || 0) : t0));
  const driveMs = Math.max(0, span - stopMs);
  return { pts: seg, km, totalMs: totalMs || span, driveMs, stopMs, stops, maxKmh: Math.round(maxKmh), avgKmh: driveMs > 0 ? Math.round(km / (driveMs / 3600000)) : 0 };
}
// 그 시각의 위치(두 점 사이를 이어서)
function posAt(pts, t) {
  if (!pts.length) return null;
  if (t <= pts[0].t) return { ...pts[0], hd: pts[1] ? bearingDeg(pts[0], pts[1]) : 0 };
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t >= t) {
      const a = pts[i - 1], b = pts[i];
      const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      const km = kmBetween(a, b);
      const h = (b.t - a.t) / 3600000;
      return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, t, speed: h > 0 && km > 0.03 ? Math.round(Math.min(140, km / h)) : 0, hd: km > 0.01 ? bearingDeg(a, b) : null };
    }
  }
  const last = pts[pts.length - 1];
  return { ...last, speed: 0, hd: null };
}

// 오더 → 구간(상차지로 가는 길 + 실은 뒤 하차지까지)
function orderSegments(orders, dayStart, dayEnd) {
  const list = orders
    .filter((r) => r.기사확인상태 !== "거절")
    .map((r) => ({ r, arrive: tsOf(r.상차지도착일시), loaded: tsOf(r.상차완료일시), done: tsOf(r.기사완료일시) }))
    .filter((o) => o.arrive || o.loaded || o.done)
    .sort((a, b) => (a.arrive || a.loaded || a.done) - (b.arrive || b.loaded || b.done));
  let prevEnd = dayStart;
  return list.map((o, i) => {
    const start = o.arrive || o.loaded || o.done;
    const end = o.done || dayEnd;
    const seg = { key: `o${i}`, idx: i + 1, r: o.r, approachFrom: prevEnd && prevEnd < start ? prevEnd : start, start, loaded: o.loaded, end, finished: !!o.done };
    prevEnd = end;
    return seg;
  });
}

// ── 지도 조각 ─────────────────────────────────────────────────
function Snapped({ pts, color, weight = 5, opacity = 0.95, dashed = false }) {
  const { solids, dashes } = useRoadSnapped(pts);
  return (
    <>
      {solids.map((s, i) => <Polyline key={`s${i}`} positions={s} pathOptions={{ color, weight, opacity, lineCap: "round", lineJoin: "round", dashArray: dashed ? "6 9" : undefined }} />)}
      {dashes.map((s, i) => <Polyline key={`d${i}`} positions={s} pathOptions={{ color, weight: Math.max(2, weight - 2), opacity: opacity * 0.7, dashArray: "4 8" }} />)}
    </>
  );
}
function FitTo({ pts, k }) {
  const map = useMap();
  React.useEffect(() => {
    if (!pts.length) return;
    try {
      if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 14);
      else map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
    } catch { /* 무시 */ }
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
const pinIcon = (text, bg) => L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-100%);display:inline-flex;flex-direction:column;align-items:center"><span style="padding:3px 8px;border-radius:8px;background:${bg};color:#fff;font:900 13px 'Noto Sans KR',sans-serif;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.35);border:2px solid #fff">${text}</span><span style="width:2px;height:8px;background:${bg}"></span></div>`,
  iconSize: [0, 0],
});

// ── 창 ───────────────────────────────────────────────────────
export default function DriverDayReplay({ driver, date: date0, orders = [], light = false, onClose }) {
  const today = kstDate();
  const [date, setDate] = React.useState(date0 || today);
  const [raw, setRaw] = React.useState(null); // null = 불러오는 중
  const [logs, setLogs] = React.useState([]);
  const [err, setErr] = React.useState("");
  const [segKey, setSegKey] = React.useState("day");
  const [t, setT] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(120); // 1초에 몇 초
  const [fitK, setFitK] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 그날 위치 · 출퇴근 기록 불러오기
  React.useEffect(() => {
    if (!driver?.id) return undefined;
    let alive = true;
    setRaw(null); setLogs([]); setErr(""); setSegKey("day"); setPlaying(false);
    (async () => {
      try {
        const [g, l] = await Promise.all([
          getDocs(query(collection(db, "gps_tracks"), where("driverId", "==", driver.id), where("date", "==", date))),
          getDocs(query(collection(db, "driver_logs"), where("uid", "==", driver.id), where("logDate", "==", date))).catch(() => null),
        ]);
        if (!alive) return;
        setRaw(g.docs.map((d) => d.data()));
        setLogs(l ? l.docs.map((d) => d.data()).map((x) => ({ status: x.status, t: tsOf(x.timestamp) })).filter((x) => x.t).sort((a, b) => a.t - b.t) : []);
      } catch (e) {
        if (!alive) return;
        setRaw([]); setErr("위치 기록을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.");
        console.error("replay:", e);
      }
    })();
    return () => { alive = false; };
  }, [driver?.id, date]);

  const pts = React.useMemo(() => cleanPoints(raw || []), [raw]);
  const dayOrders = React.useMemo(() => orders.filter((r) => String(r.상차일 || "") === date || String(r.하차일 || "") === date), [orders, date]);

  const checkIn = logs.find((x) => x.status === "출근")?.t || 0;
  const checkOut = [...logs].reverse().find((x) => x.status === "퇴근" || x.status === "최종퇴근")?.t || 0;
  const dayStart = checkIn || pts[0]?.t || 0;
  const dayEnd = (checkOut && checkOut > dayStart ? checkOut : 0) || pts[pts.length - 1]?.t || 0;
  const segs = React.useMemo(() => orderSegments(dayOrders, dayStart, dayEnd), [dayOrders, dayStart, dayEnd]);

  const cur = segKey === "day" ? null : segs.find((s) => s.key === segKey) || null;
  const t0 = cur ? cur.approachFrom : dayStart;
  const t1 = cur ? cur.end : dayEnd;
  const st = React.useMemo(() => statsOf(pts, t0 - 1, t1 + 1), [pts, t0, t1]);
  const approach = React.useMemo(() => (cur && cur.approachFrom < cur.start ? statsOf(pts, cur.approachFrom - 1, cur.start + 1) : null), [pts, cur]);
  const haul = React.useMemo(() => (cur ? statsOf(pts, cur.start - 1, cur.end + 1) : null), [pts, cur]);

  // 재생 — 구간이 바뀌면 처음으로
  React.useEffect(() => { setT(st.pts[0]?.t || t0); setPlaying(false); setFitK((k) => k + 1); }, [segKey, raw]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!playing) return undefined;
    let last = performance.now(), raf = 0;
    const end = st.pts[st.pts.length - 1]?.t || t1;
    const step = (now) => {
      const dt = now - last; last = now;
      setT((v) => {
        const nv = v + dt * speed;
        if (nv >= end) { setPlaying(false); return end; }
        return nv;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, st.pts, t1]);

  const rs = st.pts[0]?.t || t0, re = st.pts[st.pts.length - 1]?.t || t1;
  const here = posAt(st.pts, t);
  const lastHd = React.useRef(0);
  if (here?.hd != null) lastHd.current = here.hd;
  const travelled = React.useMemo(() => st.pts.filter((p) => p.t <= t), [st.pts, t]);
  const drivenKm = travelled.reduce((s, p, i) => (i ? s + kmBetween(travelled[i - 1], p) : 0), 0);

  // 그날 있었던 일(시간 순)
  const events = React.useMemo(() => {
    const ev = [];
    if (checkIn) ev.push({ t: checkIn, k: "in", label: "출근", color: "var(--lw-ok)" });
    segs.forEach((s) => {
      const nm = s.r.거래처명 || `오더 ${s.idx}`;
      if (tsOf(s.r.상차지도착일시)) ev.push({ t: tsOf(s.r.상차지도착일시), k: s.key, label: `상차지 도착 · ${s.r.상차지명 || nm}`, color: "var(--lw-purple)" });
      if (s.loaded) ev.push({ t: s.loaded, k: s.key, label: `상차 완료 · ${nm}`, color: "var(--lw-blue)" });
      if (s.finished) ev.push({ t: s.end, k: s.key, label: `운송 완료 · ${s.r.하차지명 || nm}`, color: "var(--lw-ok)" });
    });
    findStops(pts, { minMs: 15 * 60000 }).forEach((x) => ev.push({ t: x.from, k: "stop", label: `${durText(x.ms)} 멈춤`, color: "var(--lw-warn)", stop: x }));
    if (checkOut) ev.push({ t: checkOut, k: "out", label: "퇴근", color: "var(--lw-red)" });
    return ev.sort((a, b) => a.t - b.t);
  }, [segs, pts, checkIn, checkOut]);

  const loading = raw === null;
  const empty = !loading && pts.length < 2;
  const C1 = light ? "#1D4ED8" : "#38BDF8";
  const pct = re > rs ? ((t - rs) / (re - rs)) * 100 : 0;

  const startPt = st.pts[0], endPt = st.pts[st.pts.length - 1];
  const pickupPt = cur ? posAt(pts, cur.start) : null;
  const dropPt = cur?.finished ? posAt(pts, cur.end) : null;

  const Stat = ({ label, v, unit, sub }) => (
    <div style={{ padding: "10px 12px", borderRadius: 12, background: "var(--lw-panel2)", border: "1px solid var(--lw-line)", minWidth: 0 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--lw-sub)", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ marginTop: 2, display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" }}><b style={{ fontSize: 22, fontWeight: 900, color: "var(--lw-strong)" }}>{v}</b>{unit && <span style={{ fontSize: 13, fontWeight: 800, color: "var(--lw-sub)" }}>{unit}</span>}</div>
      {sub && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--lw-dim)", marginTop: 1, lineHeight: 1.4, overflowWrap: "anywhere" }}>{sub}</div>}
    </div>
  );
  const chip = (on) => ({ height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${on ? "transparent" : "var(--lw-line2)"}`, background: on ? (light ? "#0F1A30" : "#1B2E54") : "transparent", color: on ? "#fff" : "var(--lw-sub2)", font: "inherit", fontSize: 13.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 });
  const btn = { height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid var(--lw-line2)", background: "var(--lw-btn)", color: "var(--lw-text)", font: "inherit", fontSize: 13.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" };

  return createPortal(
    <div className={`lwv${light ? " light" : ""} fm-keep-light`} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 99985, background: "rgba(3,8,18,.55)", display: "flex", alignItems: "stretch", justifyContent: "center", padding: "max(12px, env(safe-area-inset-top)) 12px 12px", fontFamily: "'Pretendard','Noto Sans KR',sans-serif" }}>
      <style>{`${LW_VARS}${TRUCK_CSS}
.lwv .lw-dark-tiles{filter:invert(1) hue-rotate(200deg) brightness(.92) contrast(1.08) saturate(.5)}
.lwv .lw-light-tiles{filter:grayscale(.7) contrast(1.02) brightness(1.03)}
.lwv-body{display:grid;grid-template-columns:minmax(0,1fr) 360px;min-height:0;flex:1}
.lwv-side{border-left:1px solid var(--lw-line);display:flex;flex-direction:column;min-height:0}
.lwv-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.lwv input[type=range]{accent-color:${C1}}
@media (max-width:900px){.lwv-body{grid-template-columns:1fr;grid-template-rows:52vh auto;overflow-y:auto}.lwv-side{border-left:0;border-top:1px solid var(--lw-line)}}
`}</style>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="이동 기록 다시보기"
        style={{ width: "min(1400px, 100%)", display: "flex", flexDirection: "column", borderRadius: 18, overflow: "hidden", background: "var(--lw-panel)", color: "var(--lw-text)", border: "1px solid var(--lw-line2)", boxShadow: "0 30px 80px rgba(0,0,0,.5)" }}>
        {/* 머리 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--lw-line)", background: "linear-gradient(180deg,var(--lw-head1),var(--lw-head2))", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".18em", color: "var(--lw-blue2)" }}>ROUTE REPLAY</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <b style={{ fontSize: 20, fontWeight: 900 }}>{driver?.이름 || "-"}</b>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--lw-soft)" }}>{driver?.차량번호 && driver.차량번호 !== "-" ? driver.차량번호 : ""}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--lw-sub)" }}>이동 기록</span>
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <button type="button" style={btn} onClick={() => setDate(shiftDate(date, -1))} aria-label="하루 전">‹</button>
            <label style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 6, position: "relative" }}>
              <span style={{ fontWeight: 900 }}>{dateLabel(date)}{date === today ? " · 오늘" : ""}</span>
              <input type="date" value={date} max={today} onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)}
                style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} aria-label="날짜 고르기" />
            </label>
            <button type="button" style={{ ...btn, opacity: date >= today ? 0.4 : 1 }} disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))} aria-label="하루 뒤">›</button>
            <button type="button" onClick={onClose} aria-label="닫기" style={{ ...btn, width: 36, padding: 0, fontSize: 18 }}>×</button>
          </div>
        </div>

        {/* 구간 고르기 */}
        <div style={{ display: "flex", gap: 6, padding: "10px 16px", borderBottom: "1px solid var(--lw-line)", overflowX: "auto" }}>
          <button type="button" style={chip(segKey === "day")} onClick={() => setSegKey("day")}>하루 전체{checkIn || checkOut ? ` · ${checkIn ? hm(checkIn) : "?"} 출근 → ${checkOut ? `${hm(checkOut)} 퇴근` : "퇴근 전"}` : ""}</button>
          {segs.map((s) => (
            <button key={s.key} type="button" style={chip(segKey === s.key)} onClick={() => setSegKey(s.key)} title={`${s.r.상차지명 || ""} → ${s.r.하차지명 || ""}`}>
              오더 {s.idx} · {s.r.거래처명 || "-"} · {(s.r.상차지명 || "상차")} → {(s.r.하차지명 || "하차")}{s.finished ? "" : " (진행 중)"}
            </button>
          ))}
          {!loading && segs.length === 0 && dayOrders.length > 0 && <span style={{ alignSelf: "center", fontSize: 13, fontWeight: 700, color: "var(--lw-dim)", whiteSpace: "nowrap" }}>오더 {dayOrders.length}건 — 기사앱 상차 · 완료 기록이 없어 오더별로 나누지 못했어요</span>}
        </div>

        <div className="lwv-body">
          {/* 지도 */}
          <div style={{ position: "relative", minHeight: 320, background: "var(--lw-mapbg)" }}>
            <MapContainer center={[37.45, 126.9]} zoom={10} scrollWheelZoom style={{ position: "absolute", inset: 0, background: "var(--lw-mapbg)" }}>
              <TileLayer className={light ? "lw-light-tiles" : "lw-dark-tiles"} tileSize={512} zoomOffset={-1} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              <FitTo pts={st.pts.length ? st.pts : pts} k={fitK} />
              {/* 하루 전체는 흐리게 깔고, 고른 구간을 진하게 */}
              {cur && pts.length >= 2 && <Snapped pts={pts} color={light ? "#94A3B8" : "#3B5B97"} weight={4} opacity={0.5} />}
              {approach && approach.pts.length >= 2 && <Snapped pts={approach.pts} color={light ? "#64748B" : "#7FA4E6"} weight={5} dashed />}
              {(cur ? haul?.pts : st.pts)?.length >= 2 && <Snapped pts={cur ? haul.pts : st.pts} color={C1} weight={6} />}
              {travelled.length >= 2 && <Polyline positions={travelled.map((p) => [p.lat, p.lng])} pathOptions={{ color: light ? "#F97316" : "#FBBF24", weight: 4, opacity: 0.9 }} />}
              {st.stops.map((x, i) => (
                <CircleMarker key={i} center={[x.lat, x.lng]} radius={Math.min(16, 7 + x.ms / 900000)} pathOptions={{ color: "#F59E0B", weight: 2, fillColor: "#FBBF24", fillOpacity: 0.35 }}
                  eventHandlers={{ click: () => setT(x.from) }}>
                  <Tooltip direction="top">{`${hm(x.from)}~${hm(x.to)} · ${durText(x.ms)} 멈춤`}</Tooltip>
                </CircleMarker>
              ))}
              {startPt && !cur && <Marker position={[startPt.lat, startPt.lng]} icon={pinIcon(`출발 ${hm(startPt.t)}`, "#16A34A")} />}
              {endPt && !cur && <Marker position={[endPt.lat, endPt.lng]} icon={pinIcon(`${checkOut ? "퇴근" : "마지막"} ${hm(endPt.t)}`, "#DC2626")} />}
              {pickupPt && <Marker position={[pickupPt.lat, pickupPt.lng]} icon={pinIcon(`상차 ${hm(cur.start)}`, "#7C3AED")} />}
              {dropPt && <Marker position={[dropPt.lat, dropPt.lng]} icon={pinIcon(`하차 ${hm(cur.end)}`, "#16A34A")} />}
              {here && st.pts.length >= 2 && <Marker position={[here.lat, here.lng]} zIndexOffset={2000}
                icon={makeTruckIcon({ color: C1, heading: lastHd.current, label: `${hm(t)} · ${here.speed || 0}km/h`, selected: true })} />}
            </MapContainer>
            {(loading || empty || err) && (
              <div style={{ position: "absolute", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--lw-mapbg) 70%, transparent)" }}>
                <div style={{ padding: "16px 20px", borderRadius: 14, background: "var(--lw-float)", border: "1px solid var(--lw-line2)", fontSize: 15.5, fontWeight: 800, textAlign: "center", lineHeight: 1.6, maxWidth: 360 }}>
                  {loading ? "위치 기록을 불러오는 중이에요" : err || <>이날은 남은 위치 기록이 없어요<br /><span style={{ fontSize: 13.5, color: "var(--lw-sub)" }}>기사앱을 켜고 출근해야 다닌 길이 남아요</span></>}
                </div>
              </div>
            )}
            <button type="button" style={{ ...btn, position: "absolute", top: 12, right: 12, zIndex: 1000 }} onClick={() => setFitK((k) => k + 1)}>전체 보기</button>
          </div>

          {/* 오른쪽: 숫자 · 재생 · 있었던 일 */}
          <aside className="lwv-side">
            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, borderBottom: "1px solid var(--lw-line)" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--lw-sub2)" }}>{cur ? `오더 ${cur.idx} · ${cur.r.거래처명 || "-"}` : `${dateLabel(date)} 하루`}</div>
              <div className="lwv-stats">
                <Stat label="이동 거리" v={kmText(st.km)} unit="km" sub={cur && approach ? `상차지까지 ${kmText(approach.km)}km · 운송 ${kmText(haul?.km || 0)}km` : "GPS 기록 기준"} />
                <Stat label="걸린 시간" v={durText(st.totalMs)} sub={`${hm(t0 || rs)} → ${cur && !cur.finished ? "진행 중" : hm(t1 || re)}`} />
                <Stat label="달린 시간" v={durText(st.driveMs)} sub={`평균 ${st.avgKmh}km/h · 최고 ${st.maxKmh}km/h`} />
                <Stat label="멈춘 시간" v={durText(st.stopMs)} sub={`5분 넘게 멈춘 곳 ${st.stops.length}곳`} />
              </div>
              {cur && haul && (
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--lw-sub)", lineHeight: 1.6 }}>
                  {approach && <div>상차지까지 <b style={{ color: "var(--lw-text)" }}>{durText(approach.totalMs)}</b> ({hm(cur.approachFrom)} → {hm(cur.start)})</div>}
                  {cur.loaded > 0 && <div>상차에 <b style={{ color: "var(--lw-text)" }}>{durText(cur.loaded - cur.start)}</b> ({hm(cur.start)} 도착 → {hm(cur.loaded)} 상차 완료)</div>}
                  <div>{cur.finished ? "실은 뒤 하차 완료까지" : "실은 뒤 지금까지"} <b style={{ color: "var(--lw-text)" }}>{durText((cur.end || Date.now()) - (cur.loaded || cur.start))}</b></div>
                </div>
              )}
              {/* 재생 */}
              <div style={{ padding: "10px 12px", borderRadius: 12, background: "var(--lw-panel2)", border: "1px solid var(--lw-line)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" disabled={st.pts.length < 2} onClick={() => { if (t >= re) setT(rs); setPlaying((v) => !v); }}
                    style={{ ...btn, background: light ? "#0F1A30" : "#38BDF8", color: light ? "#fff" : "#04111F", border: 0, minWidth: 84, fontWeight: 900 }}>{playing ? "멈춤" : t >= re && re > rs ? "다시 재생" : "재생"}</button>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[[60, "1분"], [120, "2분"], [300, "5분"]].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setSpeed(v)} title={`1초에 ${l}씩`} style={{ ...btn, height: 30, padding: "0 8px", fontSize: 12.5, background: speed === v ? "var(--lw-chip-on)" : "transparent", color: speed === v ? "#fff" : "var(--lw-sub2)" }}>{l}/초</button>
                    ))}
                  </div>
                </div>
                <input type="range" min={rs} max={re} step={1000} value={Math.min(re, Math.max(rs, t))} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
                  style={{ width: "100%", marginTop: 10 }} aria-label="재생 위치" disabled={st.pts.length < 2} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 800, color: "var(--lw-sub)" }}>
                  <span>{hm(rs)}</span>
                  <span style={{ color: "var(--lw-text)" }}>{hm(t)} · 여기까지 {kmText(drivenKm)}km · {Math.round(pct)}%</span>
                  <span>{hm(re)}</span>
                </div>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 160, overflowY: "auto", padding: "10px 14px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--lw-sub2)", marginBottom: 6 }}>이날 있었던 일</div>
              {events.length === 0 && <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--lw-dim)", padding: "8px 0" }}>{loading ? "불러오는 중…" : "기록된 일이 없어요"}</div>}
              {events.map((e, i) => (
                <button key={i} type="button" onClick={() => { if (e.k.startsWith("o")) setSegKey(e.k); setPlaying(false); setTimeout(() => setT(e.t), 0); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", border: 0, borderBottom: "1px solid var(--lw-line3)", background: "transparent", color: "var(--lw-text)", font: "inherit", textAlign: "left", cursor: "pointer" }}>
                  <span style={{ width: 46, flexShrink: 0, fontSize: 14, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{hm(e.t)}</span>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: e.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 800, minWidth: 0, overflowWrap: "anywhere" }}>{e.label}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
