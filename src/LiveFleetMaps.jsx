// ======================= src/LiveFleetMaps.jsx =======================
// ⭐ 2026-11-05 배차현황 실시간 관제 — 지도 창(필요할 때만 따로 받아오는 파일)
//  🛰️ 2026-11-22 kind="fleet" 는 "운송 관제센터"로 — 정상 · 지연 예상 · 문제 · 신호 끊김 + 교통 돌발상황(ITS) + CCTV
//  · kind="one"  : 오더 1건의 기사 실시간 위치(자동 따라가기) + 상/하차지 + 최근 이동경로 + 속도·수신시각·남은거리/도착예상
//  · kind="fleet": 지금 목록(필터 결과)의 배차완료 지입·직영·임대 기사 전체를 한 지도에
//  지도는 지입차관리 › 관제현황과 같은 Leaflet + OpenStreetMap(흑백 톤) · 트럭 마커 · mapLeaflet의 이동경로 선을 그대로 쓴다.
//  읽기: 창이 열린 동안만 drivers/{id} 1건 + gps_tracks(그 기사 · 오늘 · 최근 3시간) 구독, 닫으면 해제.
//  ⭐ 2026-11-06 화면 조각은 src/liveTrackView.jsx(로지스웹 허브와 같이 씀)로 옮겼다 — 여기는 데이터(구독)만.
import React from "react";
import { Marker, Polyline } from "react-leaflet";
import { db } from "./firebase";
import { collection, doc, onSnapshot, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import { useAddrGeo, useRemainInfo, computeFleetPhase, fleetStepIndex, getCachedGeo, prefetchGeo, pickCurrentOrder, isLoaded } from "./fleetGeo";
import { useTrafficOn, useIncidents, trafficStatusText } from "./trafficCore"; // 🚦 2026-11-22 교통 돌발상황
import { openCctv } from "./trafficCctv";
import { LEVELS, LEVEL_ORDER, classifyVehicle, countLevels, updateStopMemo, hhmm } from "./controlTowerCore"; // 🛰️ 관제 상태 판정
import {
  LIVE_MONO as MONO, LIVE_COLORS, liveState, liveAgeText, liveTsMs, useLiveNow, useFleetLiveEntry, useFleetLiveIndex,
  useLiveFleetRows, normLivePlate,
} from "./liveFleet";
import {
  C, noop, kstDate, hms, truckIcon, MapGlue, FlyTo, BaseMap, Eyebrow, GradeTag, RouteLine, CallButtons, IconBtn, CloseBtn, TileNotice, Shell, telOf, LiveTrackView,
} from "./liveTrackView";

const TRACK_WINDOW_MS = 3 * 3600 * 1000;

// ─── 구독 훅(창이 열린 동안만) ────────────────────────────────────────────────
function useDriverDocLive(id) {
  const [d, setD] = React.useState(null);
  React.useEffect(() => {
    if (!id) return undefined;
    const un = onSnapshot(doc(db, "drivers", id), (s) => { if (s.exists && s.exists()) setD({ id, ...s.data() }); }, () => {});
    return () => un();
  }, [id]);
  return d;
}
function useRecentTrack(id) {
  const [pts, setPts] = React.useState([]);
  React.useEffect(() => {
    if (!id) { setPts([]); return undefined; }
    const since = Date.now() - TRACK_WINDOW_MS;
    const apply = (snap) => {
      const list = [];
      snap.docs.forEach((x) => {
        const p = x.data();
        if (p.driverId && p.driverId !== id) return; // (점검용 가짜 데이터는 조건 없이 오므로 한 번 더 거른다)
        const ms = liveTsMs(p.timestamp);
        if (p.lat == null || p.lng == null || (ms && ms < since)) return;
        list.push({ lat: Number(p.lat), lng: Number(p.lng), timestamp: ms, accuracy: p.accuracy, speed: p.speed });
      });
      list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setPts(list.slice(-400));
    };
    let un2 = null;
    // 오늘·최근 3시간만(색인: driverId+date+timestamp — 경로보기와 같은 색인). 색인 오류면 오늘 전체로 한 번만 대신 조회.
    const un1 = onSnapshot(
      query(collection(db, "gps_tracks"), where("driverId", "==", id), where("date", "==", kstDate()), where("timestamp", ">=", Timestamp.fromMillis(since)), orderBy("timestamp", "asc"), limit(600)),
      apply,
      () => { if (!un2) un2 = onSnapshot(query(collection(db, "gps_tracks"), where("driverId", "==", id), where("date", "==", kstDate())), apply, () => setPts([])); }
    );
    return () => { un1(); if (un2) un2(); };
  }, [id]);
  return pts;
}

// 기사 문서(창 전용 구독)와 공용 색인 중 더 최신 값
function mergeLive(entry, d) {
  if (!d?.location || d.location.lat == null) return entry;
  const ms = liveTsMs(d.updatedAt) || liveTsMs(d.heartbeatAt);
  if (entry && ms <= (entry.updatedMs || 0)) return entry;
  return {
    ...(entry || {}), id: d.id, lat: Number(d.location.lat), lng: Number(d.location.lng), speed: Math.max(0, Math.round(Number(d.speed) || 0)),
    status: String(d.status || d.mainStatus || d.state || entry?.status || ""), updatedMs: ms,
    name: entry?.name || d.이름 || d.name || "", phone: entry?.phone || d.전화번호 || d.phone || "", plate: entry?.plate || d.차량번호 || d.carNo || "", grade: entry?.grade || d.등급 || "",
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// 오더 1건 — 기사 실시간 관제(배차 프로그램: 공용 색인 + drivers/{id} + gps_tracks) · 화면은 liveTrackView.jsx
// ═════════════════════════════════════════════════════════════════════════════
function LiveTrackModal({ order, plate, mobile, onClose }) {
  const entry0 = useFleetLiveEntry(plate || order?.차량번호);
  const [frozen] = React.useState(entry0); // 색인에서 빠져도(등급 변경 등) 창은 유지
  const docLive = useDriverDocLive((entry0 || frozen)?.id);
  const entry = mergeLive(entry0 || frozen, docLive);
  const track = useRecentTrack(entry?.id);
  const now = useLiveNow();
  const pickupGeo = useAddrGeo(order?.상차지주소 || null);
  const dropGeo = useAddrGeo(order?.하차지주소 || null);
  const loc = entry ? { lat: entry.lat, lng: entry.lng } : null;
  const st = liveState(entry, now);
  const phase = entry ? computeFleetPhase({ driverStatus: entry.status, orders: [{ ...order, 기사확인상태: "수락" }], location: loc }) : null;
  const step = phase ? fleetStepIndex(order, phase) : -1;
  const remain = useRemainInfo(order, st === "stale" ? null : loc, phase);
  return <LiveTrackView order={order} entry={entry} track={track} pickupGeo={pickupGeo} dropGeo={dropGeo} phase={phase} step={step} remain={remain} mobile={mobile} onClose={onClose} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// 목록 전체 — 🛰️ 2026-11-22 운송 관제센터(예전 "배차완료 차량 관제"를 키웠다)
//  · 배차완료 지입·직영·임대 기사 전체를 한 지도에 + 교통 돌발상황(사고 · 공사 · 통제)
//  · 차량마다 정상(초록) · 지연 예상(노랑) · 문제(빨강) · 신호 끊김(회색) — 판정은 controlTowerCore.js
//  · "주의 필요" 목록이 위로 — 누르면 그 차량으로 이동 + 왜 주의인지 · 가는 길 돌발 · CCTV · 전화
// ═════════════════════════════════════════════════════════════════════════════
const asAccepted = (orders) => orders.map((o) => (o.기사확인상태 === "수락" ? o : { ...o, 기사확인상태: "수락" }));

// 주소 좌표(캐시에 없으면 받아오고, 받아오면 다시 그린다)
function useGeoPrefetch(addrs) {
  const [, setTick] = React.useState(0);
  const key = addrs.join("#");
  React.useEffect(() => {
    let alive = true;
    addrs.forEach((a) => { if (a && !getCachedGeo(a)) prefetchGeo(a).then(() => { if (alive) setTick((t) => t + 1); }); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

function LevelDot({ level, size = 9, pulse }) {
  const c = LEVELS[level]?.color || LEVELS.ok.color;
  return <span className={`kp-live-dot ${pulse ? "on" : ""}`} style={{ width: size, height: size, background: c, boxShadow: level === "alert" ? `0 0 0 3px ${c}33` : undefined }} />;
}

function ReasonList({ reasons, max = 4, onEvent, compact }) {
  if (!reasons?.length) return <div style={{ fontSize: 11.5, fontWeight: 700, color: "#A7F3D0" }}>특이사항 없음 · 정상 운행 중</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 3 : 5 }}>
      {reasons.slice(0, max).map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: compact ? 11.5 : 12, fontWeight: 700, color: LEVELS[r.level].color, minWidth: 0 }}>
          <span style={{ flexShrink: 0, width: 5, height: 5, borderRadius: 5, background: LEVELS[r.level].color }} />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{r.text}</span>
          {r.ev && onEvent && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onEvent(r.ev); }}
              style={{ marginLeft: "auto", flexShrink: 0, height: 22, padding: "0 8px", borderRadius: 7, border: "1px solid rgba(143,176,240,.35)", background: "rgba(143,176,240,.1)", color: "#CFE0FF", fontSize: 10.5, fontWeight: 800, cursor: "pointer" }}>
              📹 CCTV
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function FleetMapModal({ rows, mobile, onClose }) {
  const groups = useLiveFleetRows(rows);
  const { index } = useFleetLiveIndex();
  const now = useLiveNow();
  const [trafficOn] = useTrafficOn();
  const traffic = useIncidents(trafficOn);
  const stopMemo = React.useRef(new Map());
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("all"); // all | watch | moving | idle | alert | delay | lost | ok
  const [sel, setSel] = React.useState(null);
  const [fly, setFly] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [fitKey, setFitKey] = React.useState(1);
  const [tileErr, setTileErr] = React.useState(false);
  const onTileError = React.useCallback(() => setTileErr(true), []);

  const base = React.useMemo(() => groups.map((g) => {
    const e = index.get(g.key);
    if (!e) return null;
    const s = liveState(e, now);
    const ord = [...g.orders].sort((a, b) => `${a.상차일 || ""} ${a.상차시간 || ""}`.localeCompare(`${b.상차일 || ""} ${b.상차시간 || ""}`));
    return { id: g.id, e, s, orders: ord, moving: s !== "stale" && e.speed >= 5 };
  }).filter((x) => x && x.s !== "none"), [groups, index, now]);

  useGeoPrefetch(base.flatMap((x) => x.orders.flatMap((o) => [o.상차지주소, o.하차지주소])).filter(Boolean));

  const items = base.map((x) => {
    const acc = asAccepted(x.orders);
    const cur = pickCurrentOrder(acc) || acc[0] || null;
    const loc = { lat: x.e.lat, lng: x.e.lng };
    const phase = computeFleetPhase({ driverStatus: x.e.status, orders: acc, location: x.s === "stale" ? null : loc });
    const loaded = cur ? isLoaded(cur, loc) : false;
    const pickupGeo = getCachedGeo(cur?.상차지주소), dropGeo = getCachedGeo(cur?.하차지주소);
    const stop = updateStopMemo(stopMemo.current, x.id, x.e, now);
    const c = classifyVehicle({ entry: x.e, live: x.s, order: cur, phase, loaded, pickupGeo, dropGeo, events: traffic.items, stop, now });
    return { ...x, cur, phase, ...c };
  }).sort((a, b) => (LEVELS[a.level].rank - LEVELS[b.level].rank) || ((b.e.updatedMs || 0) - (a.e.updatedMs || 0)));

  const lv = countLevels(items);
  const counts = { all: items.length, watch: lv.alert + lv.delay + lv.lost, moving: items.filter((x) => x.moving).length, ...lv };
  counts.idle = items.length - counts.moving;
  const affecting = new Map();
  items.forEach((x) => x.near.forEach((n) => affecting.set(n.ev.id, n.ev)));
  const qq = q.trim().toLowerCase();
  const matchTab = (x) => tab === "all" || (tab === "watch" ? x.level !== "ok" : tab === "moving" ? x.moving : tab === "idle" ? !x.moving : x.level === tab);
  const shown = items.filter((x) => matchTab(x)
    && (!qq || [x.e.plate, x.e.name, ...x.orders.map((o) => `${o.거래처명 || ""} ${o.상차지명 || ""} ${o.하차지명 || ""}`)].join(" ").toLowerCase().includes(qq) || normLivePlate(x.e.plate).toLowerCase().includes(qq.replace(/\s/g, ""))));
  const selItem = items.find((x) => x.id === sel) || null;
  const fitPoints = React.useMemo(() => items.map((x) => [x.e.lat, x.e.lng]), [items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const center = fitPoints[0] || [37.45, 126.95];
  const pick = (x) => { setSel(x.id); setFly({ lat: x.e.lat, lng: x.e.lng, t: Date.now() }); };
  const highlight = React.useMemo(() => new Set((selItem?.near || []).map((n) => n.ev.id)), [selItem]);
  const trafficNote = trafficOn ? trafficStatusText(traffic) : "교통정보 꺼짐";

  const TABS = [["all", "전체"], ["watch", "주의"], ["moving", "운행중"], ["idle", "정차"]];
  const tabBar = (
    <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 12, background: "rgba(255,255,255,.04)", border: `1px solid ${C.line}` }}>
      {TABS.map(([k, l]) => (
        <button key={k} type="button" onClick={() => setTab(k)} style={{ flex: 1, height: 30, borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer", border: "none", background: tab === k ? "rgba(143,176,240,.95)" : "transparent", color: tab === k ? C.ink : k === "watch" && counts.watch ? "#FBBF24" : "rgba(207,224,255,.7)" }}>
          {l} <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10.5, opacity: 0.75 }}>{counts[k]}</span>
        </button>
      ))}
    </div>
  );
  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Eyebrow>CONTROL · 관제센터</Eyebrow>
        <div style={{ marginTop: 6, fontSize: 19, fontWeight: 900, letterSpacing: "-.01em" }}>운송 관제센터</div>
        <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: "rgba(207,224,255,.55)" }}>배차완료 지입 · 직영 · 임대 차량 · 지금 목록 기준</div>
      </div>
      <CloseBtn onClose={onClose} />
    </div>
  );
  // 상태 4칸 — 누르면 그 상태만
  const kpis = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: mobile ? 5 : 7 }}>
      {LEVEL_ORDER.map((k) => {
        const L0 = LEVELS[k], on = tab === k, n = counts[k];
        return (
          <button key={k} type="button" onClick={() => setTab(on ? "all" : k)} className="kp-lv-tile" data-kp-level={k}
            style={{ padding: mobile ? "6px 7px" : "8px 9px", textAlign: "left", cursor: "pointer", color: "#fff", borderColor: on ? L0.color : undefined, boxShadow: on ? `0 0 0 2px ${L0.color}55` : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <LevelDot level={k} size={7} pulse={k === "alert" && n > 0} />
              <span style={{ fontSize: mobile ? 10.5 : 11, fontWeight: 800, color: "rgba(207,224,255,.8)", whiteSpace: "nowrap" }}>{L0.label}</span>
            </div>
            <div style={{ marginTop: 2, fontFamily: MONO, fontSize: mobile ? 18 : 21, fontWeight: 800, color: n ? L0.color : "rgba(207,224,255,.35)", fontVariantNumeric: "tabular-nums" }}>{n}</div>
          </button>
        );
      })}
    </div>
  );
  const trafficLine = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 11, background: affecting.size ? "rgba(248,113,113,.1)" : "rgba(255,255,255,.03)", border: `1px solid ${affecting.size ? "rgba(248,113,113,.35)" : C.line}`, fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.8)" }}>
      <span>🚦</span>
      {trafficNote
        ? <span style={{ color: "rgba(207,224,255,.6)" }}>{trafficNote}</span>
        : <span>우리 차량 가는 길 · 근처 돌발 <b style={{ fontFamily: MONO, color: affecting.size ? "#F87171" : "#A7F3D0" }}>{affecting.size}</b>건</span>}
      {!trafficNote && traffic.at > 0 && <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10.5, color: "rgba(207,224,255,.45)" }}>{hms(traffic.at).slice(0, 5)} 기준</span>}
    </div>
  );
  const search = (
    <div style={{ position: "relative" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8FB0F0" strokeWidth="2.4" strokeLinecap="round" style={{ position: "absolute", left: 11, top: 11 }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="차량번호 · 기사 · 거래처 · 상하차지" autoComplete="off"
        style={{ width: "100%", height: 36, padding: "0 12px 0 32px", borderRadius: 11, border: `1px solid ${C.line}`, background: "rgba(255,255,255,.05)", color: "#fff", fontSize: 12.5, fontWeight: 600, outline: "none" }} />
    </div>
  );
  const list = (
    <div className="kp-lv-scroll" style={{ display: "flex", flexDirection: "column", gap: 7, overflowY: "auto", minHeight: 0, flex: 1, paddingRight: 2 }}>
      {shown.length === 0 && (
        <div style={{ padding: "28px 8px", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "rgba(207,224,255,.5)", lineHeight: 1.6 }}>
          {items.length ? (tab === "watch" ? "주의가 필요한 차량이 없어요 👍" : "조건에 맞는 차량이 없어요") : <>지금 목록에 기사앱 위치가 잡힌<br />배차완료 지입·직영·임대 차량이 없어요</>}
        </div>
      )}
      {shown.map((x) => {
        const o = x.cur || x.orders[0];
        const on = x.id === sel;
        const L0 = LEVELS[x.level];
        return (
          <button key={x.id} type="button" onClick={() => pick(x)} data-kp-live-item={x.e.plate} data-kp-level={x.level}
            style={{ textAlign: "left", padding: "10px 12px", borderRadius: 14, cursor: "pointer", color: "#fff", background: on ? "linear-gradient(135deg,rgba(45,76,130,.85),rgba(27,43,75,.85))" : "rgba(255,255,255,.035)", border: `1px solid ${on ? C.accent : x.level === "ok" ? C.line : `${L0.color}66`}`, borderLeft: `3px solid ${L0.color}`, boxShadow: on ? "0 0 0 3px rgba(143,176,240,.15)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <LevelDot level={x.level} pulse={x.level === "alert" || x.s === "live"} />
              <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 14, fontWeight: 800 }}>{x.e.plate}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(207,224,255,.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.e.name}</span>
              <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: L0.color }}>{L0.label}</span>
            </div>
            <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "rgba(207,224,255,.6)" }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{o ? `${o.상차지명 || "-"} → ${o.하차지명 || "-"}` : ""}</span>
              {x.orders.length > 1 && <span style={{ flexShrink: 0, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10, color: C.accent }}>+{x.orders.length - 1}</span>}
              <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontSize: 11, color: x.moving ? "#A7F3D0" : "rgba(207,224,255,.55)" }}>{x.s === "stale" ? liveAgeText(x.e.updatedMs, now) : `${x.e.speed}km/h`}</span>
            </div>
            {x.reasons.length > 0 && <div style={{ marginTop: 6 }}><ReasonList reasons={x.reasons} max={2} compact /></div>}
          </button>
        );
      })}
    </div>
  );
  const selCard = selItem && (
    <div onClick={(e) => e.stopPropagation()} data-kp="live-sel"
      style={{ ...(mobile ? { position: "relative", flexShrink: 0 } : { position: "absolute", left: 16, bottom: 16, width: 400, zIndex: 1002 }), padding: mobile ? 12 : 14, borderRadius: 18, background: C.glass, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: `1px solid ${selItem.level === "ok" ? "rgba(143,176,240,.3)" : `${LEVELS[selItem.level].color}88`}`, boxShadow: "0 18px 40px rgba(0,0,0,.45)", animation: "kpLiveIn .18s ease-out", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <LevelDot level={selItem.level} size={10} pulse />
        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 17, fontWeight: 800 }}>{selItem.e.plate}</span>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{selItem.e.name}</span>
        <GradeTag grade={selItem.e.grade} />
        <span style={{ fontSize: 11, fontWeight: 900, color: LEVELS[selItem.level].color }}>{LEVELS[selItem.level].label}</span>
        <button type="button" onClick={() => setSel(null)} aria-label="닫기" style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: 8, border: "none", background: "rgba(255,255,255,.08)", color: "#CFE0FF", cursor: "pointer" }}>×</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.7)" }}>
        <span>속도 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{selItem.s === "stale" ? "—" : `${selItem.e.speed}km/h`}</b></span>
        <span>수신 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{hms(selItem.e.updatedMs)}</b> · {liveAgeText(selItem.e.updatedMs, now)}</span>
        {selItem.phase && <span>단계 <b style={{ color: "#A7F3D0" }}>{selItem.phase}</b></span>}
        {selItem.etaDrop && <span>하차 예상 <b style={{ fontFamily: MONO, color: selItem.dropDue && selItem.etaDrop > selItem.dropDue + 600000 ? "#FBBF24" : "#fff" }}>{hhmm(selItem.etaDrop)}</b>{selItem.dropDue ? <> · 약속 <b style={{ fontFamily: MONO, color: "#fff" }}>{hhmm(selItem.dropDue)}</b></> : null}</span>}
      </div>
      <div className="kp-lv-tile" style={{ padding: "9px 11px" }}>
        <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, letterSpacing: ".22em", color: "rgba(143,176,240,.6)", marginBottom: 6 }}>STATUS · 관제 판단</div>
        <ReasonList reasons={selItem.reasons} max={5} onEvent={openCctv} />
      </div>
      <div className="kp-lv-scroll" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: mobile ? 132 : 170, overflowY: "auto" }}>
        {selItem.orders.map((o) => (
          <div key={o._id || o.id} className="kp-lv-tile" style={{ padding: "9px 11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.거래처명 || "-"}</span>
              <button type="button" onClick={() => setDetail(o)} style={{ flexShrink: 0, height: 24, padding: "0 9px", borderRadius: 8, border: "1px solid rgba(143,176,240,.45)", background: "rgba(143,176,240,.12)", color: "#CFE0FF", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>상세 관제 →</button>
            </div>
            <RouteLine order={o} />
          </div>
        ))}
      </div>
      <CallButtons tel={telOf(selItem.e, selItem.orders[0])} compact />
    </div>
  );
  const map = (
    <div style={{ position: "relative", flex: 1, minWidth: 0, minHeight: mobile ? "34vh" : 0 }}>
      <BaseMap center={center} zoom={10} onTileError={onTileError} trafficHighlight={highlight}>
        <MapGlue follow={false} center={null} fitKey={fitKey} fitPoints={fitPoints} />
        <FlyTo target={fly} />
        {selItem?.target && selItem.s !== "stale" && (
          <Polyline positions={[[selItem.e.lat, selItem.e.lng], [selItem.target.lat, selItem.target.lng]]} pathOptions={{ color: LEVELS[selItem.level].color, weight: 3, opacity: 0.85, dashArray: "6 8" }} />
        )}
        {items.map((x) => (
          <Marker key={x.id} position={[x.e.lat, x.e.lng]} icon={truckIcon({ plate: x.e.plate, state: x.s, selected: x.id === sel, speed: x.e.speed, tone: LEVELS[x.level].color })}
            zIndexOffset={x.id === sel ? 1000 : x.level === "alert" ? 700 : x.s === "live" ? 500 : 0} eventHandlers={{ click: () => pick(x) }} />
        ))}
      </BaseMap>
      <TileNotice show={tileErr} />
      <div style={{ position: "absolute", right: 14, top: 14, zIndex: 1001, display: "flex", gap: 6 }}>
        <IconBtn onClick={() => { setSel(null); setFitKey((k) => k + 1); }} title="모든 차량이 보이게">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          전체 보기
        </IconBtn>
      </div>
      <div style={{ position: "absolute", left: 14, top: 14, zIndex: 1001 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 26, padding: "0 10px", borderRadius: 999, background: "rgba(11,20,40,.72)", border: "1px solid rgba(143,176,240,.25)" }}>
          <span className={`kp-live-dot ${counts.alert ? "on" : ""}`} style={{ background: counts.alert ? LEVELS.alert.color : counts.all ? LIVE_COLORS.live : LIVE_COLORS.stale }} />
          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", color: counts.alert ? "#FCA5A5" : "#A7F3D0" }}>{counts.alert ? `ALERT ${counts.alert}` : "LIVE"}</span>
          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 11, fontWeight: 700, color: "#CFE0FF" }}>{hms(now).slice(0, 5)} KST</span>
        </span>
      </div>
      {!mobile && selCard}
    </div>
  );

  return (
    <>
      <Shell mobile={mobile} onClose={detail ? noop : onClose} wide>
        {mobile ? (
          <>
            <div style={{ padding: "12px 14px 10px", display: "flex", flexDirection: "column", gap: 8, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}><Eyebrow>CONTROL · 관제센터</Eyebrow><div style={{ marginTop: 3, fontSize: 16, fontWeight: 900 }}>운송 관제센터 <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: C.accent, fontSize: 14 }}>{counts.all}</span></div></div>
                <CloseBtn onClose={onClose} />
              </div>
              {kpis}
              {tabBar}
            </div>
            {map}
            {/* 모바일: 고른 차량 카드는 지도를 가리지 않게 아래 칸에(목록 대신) */}
            <div className="kp-lv-scroll" style={{ maxHeight: selItem ? "50vh" : "36vh", overflowY: selItem ? "auto" : "hidden", display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px 16px", borderTop: `1px solid ${C.line}` }}>
              {selItem ? selCard : <>{trafficLine}{list}</>}
            </div>
          </>
        ) : (
          <>
            <div style={{ width: 372, flexShrink: 0, padding: "20px 16px 16px 20px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0, borderRight: `1px solid ${C.line}`, background: "linear-gradient(180deg,rgba(27,43,75,.55),rgba(11,20,40,.25))" }}>
              {header}
              {kpis}
              {trafficLine}
              {tabBar}
              {search}
              {list}
            </div>
            {map}
          </>
        )}
      </Shell>
      {detail && <LiveTrackModal order={detail} plate={detail.차량번호} mobile={mobile} onClose={() => setDetail(null)} />}
    </>
  );
}

export default function LiveFleetMaps({ kind, ...p }) {
  return kind === "fleet" ? <FleetMapModal {...p} /> : <LiveTrackModal {...p} />;
}
