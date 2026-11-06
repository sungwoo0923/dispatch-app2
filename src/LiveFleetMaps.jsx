// ======================= src/LiveFleetMaps.jsx =======================
// ⭐ 2026-11-05 배차현황 실시간 관제 — 지도 창(필요할 때만 따로 받아오는 파일)
//  · kind="one"  : 오더 1건의 기사 실시간 위치(자동 따라가기) + 상/하차지 + 최근 이동경로 + 속도·수신시각·남은거리/도착예상
//  · kind="fleet": 지금 목록(필터 결과)의 배차완료 지입·직영·임대 기사 전체를 한 지도에
//  지도는 지입차관리 › 관제현황과 같은 Leaflet + OpenStreetMap(흑백 톤) · 트럭 마커 · mapLeaflet의 이동경로 선을 그대로 쓴다.
//  읽기: 창이 열린 동안만 drivers/{id} 1건 + gps_tracks(그 기사 · 오늘 · 최근 3시간) 구독, 닫으면 해제.
//  ⭐ 2026-11-06 화면 조각은 src/liveTrackView.jsx(로지스웹 허브와 같이 씀)로 옮겼다 — 여기는 데이터(구독)만.
import React from "react";
import { Marker } from "react-leaflet";
import { db } from "./firebase";
import { collection, doc, onSnapshot, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import { useAddrGeo, useRemainInfo, computeFleetPhase, fleetStepIndex } from "./fleetGeo";
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
// 목록 전체 — 배차완료 지입·직영·임대 기사 한 지도에
// ═════════════════════════════════════════════════════════════════════════════
function FleetMapModal({ rows, mobile, onClose }) {
  const groups = useLiveFleetRows(rows);
  const { index } = useFleetLiveIndex();
  const now = useLiveNow();
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState("all"); // all | live | moving | idle
  const [sel, setSel] = React.useState(null);
  const [fly, setFly] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [fitKey, setFitKey] = React.useState(1);
  const [tileErr, setTileErr] = React.useState(false);
  const onTileError = React.useCallback(() => setTileErr(true), []);

  const items = React.useMemo(() => groups.map((g) => {
    const e = index.get(g.key);
    if (!e) return null;
    const s = liveState(e, now);
    const ord = [...g.orders].sort((a, b) => `${a.상차일 || ""} ${a.상차시간 || ""}`.localeCompare(`${b.상차일 || ""} ${b.상차시간 || ""}`));
    return { id: g.id, e, s, orders: ord, moving: s !== "stale" && e.speed >= 5 };
  }).filter((x) => x && x.s !== "none").sort((a, b) => (b.e.updatedMs || 0) - (a.e.updatedMs || 0)), [groups, index, now]);

  const counts = { all: items.length, live: items.filter((x) => x.s === "live").length, moving: items.filter((x) => x.moving).length };
  counts.idle = items.length - counts.moving;
  const qq = q.trim().toLowerCase();
  const shown = items.filter((x) => (tab === "all" || (tab === "live" ? x.s === "live" : tab === "moving" ? x.moving : !x.moving))
    && (!qq || [x.e.plate, x.e.name, ...x.orders.map((o) => `${o.거래처명 || ""} ${o.상차지명 || ""} ${o.하차지명 || ""}`)].join(" ").toLowerCase().includes(qq) || normLivePlate(x.e.plate).toLowerCase().includes(qq.replace(/\s/g, ""))));
  const selItem = items.find((x) => x.id === sel) || null;
  const fitPoints = React.useMemo(() => items.map((x) => [x.e.lat, x.e.lng]), [items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const center = fitPoints[0] || [37.45, 126.95];
  const pick = (x) => { setSel(x.id); setFly({ lat: x.e.lat, lng: x.e.lng, t: Date.now() }); };

  const TABS = [["all", "전체"], ["live", "LIVE"], ["moving", "운행중"], ["idle", "정차"]];
  const header = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Eyebrow>LIVE · 실시간 관제</Eyebrow>
        <div style={{ marginTop: 6, fontSize: 19, fontWeight: 900, letterSpacing: "-.01em" }}>배차완료 차량 관제</div>
        <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: "rgba(207,224,255,.55)" }}>지입 · 직영 · 임대 기사앱 위치 · 지금 목록 기준</div>
      </div>
      <CloseBtn onClose={onClose} />
    </div>
  );
  const kpis = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
      {[["관제 대상", "UNITS", counts.all, "#fff"], ["LIVE", "ONLINE", counts.live, "#A7F3D0"], ["운행중", "MOVING", counts.moving, C.accent]].map(([l, en, v, c]) => (
        <div key={en} className="kp-lv-tile" style={{ padding: "9px 11px" }}>
          <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 8.5, fontWeight: 800, letterSpacing: ".22em", color: "rgba(143,176,240,.6)" }}>{en}</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 2 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.7)" }}>{l}</span>
            <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: c, fontVariantNumeric: "tabular-nums" }}>{v}</span>
          </div>
        </div>
      ))}
    </div>
  );
  const filters = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 12, background: "rgba(255,255,255,.04)", border: `1px solid ${C.line}` }}>
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ flex: 1, height: 30, borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer", border: "none", background: tab === k ? "rgba(143,176,240,.95)" : "transparent", color: tab === k ? C.ink : "rgba(207,224,255,.7)" }}>
            {l} <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10.5, opacity: 0.75 }}>{counts[k]}</span>
          </button>
        ))}
      </div>
      <div style={{ position: "relative" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8FB0F0" strokeWidth="2.4" strokeLinecap="round" style={{ position: "absolute", left: 11, top: 11 }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="차량번호 · 기사 · 거래처 · 상하차지" autoComplete="off"
          style={{ width: "100%", height: 36, padding: "0 12px 0 32px", borderRadius: 11, border: `1px solid ${C.line}`, background: "rgba(255,255,255,.05)", color: "#fff", fontSize: 12.5, fontWeight: 600, outline: "none" }} />
      </div>
    </div>
  );
  const list = (
    <div className="kp-lv-scroll" style={{ display: "flex", flexDirection: "column", gap: 7, overflowY: "auto", minHeight: 0, flex: 1, paddingRight: 2 }}>
      {shown.length === 0 && (
        <div style={{ padding: "28px 8px", textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "rgba(207,224,255,.5)", lineHeight: 1.6 }}>
          {items.length ? "조건에 맞는 차량이 없습니다" : <>지금 목록에 기사앱 위치가 잡힌<br />배차완료 지입·직영·임대 차량이 없습니다</>}
        </div>
      )}
      {shown.map((x) => {
        const o = x.orders[0];
        const on = x.id === sel;
        return (
          <button key={x.id} type="button" onClick={() => pick(x)} data-kp-live-item={x.e.plate}
            style={{ textAlign: "left", padding: "10px 12px", borderRadius: 14, cursor: "pointer", color: "#fff", background: on ? "linear-gradient(135deg,rgba(45,76,130,.85),rgba(27,43,75,.85))" : "rgba(255,255,255,.035)", border: `1px solid ${on ? C.accent : C.line}`, boxShadow: on ? "0 0 0 3px rgba(143,176,240,.15)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={`kp-live-dot ${x.s === "live" ? "on" : ""}`} style={{ background: LIVE_COLORS[x.s] }} />
              <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 14, fontWeight: 800 }}>{x.e.plate}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(207,224,255,.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.e.name}</span>
              <span style={{ marginLeft: "auto", flexShrink: 0, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 11, fontWeight: 700, color: x.moving ? "#A7F3D0" : "rgba(207,224,255,.55)" }}>{x.s === "stale" ? "—" : `${x.e.speed}km/h`}</span>
            </div>
            <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "rgba(207,224,255,.6)" }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{o ? `${o.상차지명 || "-"} → ${o.하차지명 || "-"}` : ""}</span>
              {x.orders.length > 1 && <span style={{ flexShrink: 0, fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10, color: C.accent }}>+{x.orders.length - 1}</span>}
              <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 11 }}>{liveAgeText(x.e.updatedMs, now)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
  const selCard = selItem && (
    <div onClick={(e) => e.stopPropagation()} data-kp="live-sel"
      style={{ ...(mobile ? { position: "relative", flexShrink: 0 } : { position: "absolute", left: 16, bottom: 16, width: 390, zIndex: 1002 }), padding: mobile ? 12 : 14, borderRadius: 18, background: C.glass, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(143,176,240,.3)", boxShadow: "0 18px 40px rgba(0,0,0,.45)", animation: "kpLiveIn .18s ease-out", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`kp-live-dot ${selItem.s === "live" ? "on" : ""}`} style={{ background: LIVE_COLORS[selItem.s] }} />
        <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 17, fontWeight: 800 }}>{selItem.e.plate}</span>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{selItem.e.name}</span>
        <GradeTag grade={selItem.e.grade} />
        <button type="button" onClick={() => setSel(null)} aria-label="닫기" style={{ marginLeft: "auto", width: 26, height: 26, borderRadius: 8, border: "none", background: "rgba(255,255,255,.08)", color: "#CFE0FF", cursor: "pointer" }}>×</button>
      </div>
      <div style={{ display: "flex", gap: 14, fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.7)" }}>
        <span>속도 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{selItem.s === "stale" ? "—" : `${selItem.e.speed}km/h`}</b></span>
        <span>수신 <b style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: "#fff" }}>{hms(selItem.e.updatedMs)}</b> · {liveAgeText(selItem.e.updatedMs, now)}</span>
        {selItem.e.status && <span>기사앱 <b style={{ color: "#A7F3D0" }}>{selItem.e.status}</b></span>}
      </div>
      <div className="kp-lv-scroll" style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: mobile ? 132 : 210, overflowY: "auto" }}>
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
      <BaseMap center={center} zoom={10} onTileError={onTileError}>
        <MapGlue follow={false} center={null} fitKey={fitKey} fitPoints={fitPoints} />
        <FlyTo target={fly} />
        {items.map((x) => (
          <Marker key={x.id} position={[x.e.lat, x.e.lng]} icon={truckIcon({ plate: x.e.plate, state: x.s, selected: x.id === sel, speed: x.e.speed })}
            zIndexOffset={x.id === sel ? 1000 : x.s === "live" ? 500 : 0} eventHandlers={{ click: () => pick(x) }} />
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
          <span className={`kp-live-dot ${counts.live ? "on" : ""}`} style={{ background: counts.live ? LIVE_COLORS.live : LIVE_COLORS.stale }} />
          <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em", color: "#A7F3D0" }}>LIVE</span>
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
            <div style={{ padding: "12px 14px 10px", display: "flex", flexDirection: "column", gap: 10, borderBottom: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}><Eyebrow>LIVE · 실시간 관제</Eyebrow><div style={{ marginTop: 3, fontSize: 16, fontWeight: 900 }}>배차완료 차량 관제 <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", color: C.accent, fontSize: 14 }}>{counts.all}</span></div></div>
                <CloseBtn onClose={onClose} />
              </div>
              <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 12, background: "rgba(255,255,255,.04)", border: `1px solid ${C.line}` }}>
                {TABS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTab(k)} style={{ flex: 1, height: 30, borderRadius: 9, fontSize: 12, fontWeight: 800, border: "none", background: tab === k ? "rgba(143,176,240,.95)" : "transparent", color: tab === k ? C.ink : "rgba(207,224,255,.7)" }}>
                    {l} <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10.5, opacity: 0.75 }}>{counts[k]}</span>
                  </button>
                ))}
              </div>
            </div>
            {map}
            {/* 모바일: 고른 차량 카드는 지도를 가리지 않게 아래 칸에(목록 대신) */}
            <div className="kp-lv-scroll" style={{ maxHeight: selItem ? "48vh" : "34vh", overflowY: selItem ? "auto" : "hidden", display: "flex", flexDirection: "column", padding: "10px 12px 16px", borderTop: `1px solid ${C.line}` }}>{selItem ? selCard : list}</div>
          </>
        ) : (
          <>
            <div style={{ width: 352, flexShrink: 0, padding: "20px 16px 16px 20px", display: "flex", flexDirection: "column", gap: 14, minHeight: 0, borderRight: `1px solid ${C.line}`, background: "linear-gradient(180deg,rgba(27,43,75,.55),rgba(11,20,40,.25))" }}>
              {header}
              {kpis}
              {filters}
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
