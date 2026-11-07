// ======================= src/liveFleet.jsx =======================
// ⭐ 2026-11-05 배차현황 실시간 관제 — 배차완료 오더의 지입·직영·임대 기사(기사앱 사용) 실시간 위치
//
//  데이터 출처: 기사앱(src/driver/DriverHome.jsx)이 drivers/{uid} 문서에 location{lat,lng}·speed(km/h)·
//  status(운송중/상차중…)·updatedAt 을 30초 안팎으로 기록하고, 이동 경로는 gps_tracks(driverId·date·timestamp)에 쌓는다.
//
//  읽기 비용: 화면(실시간배차현황·배차현황·고정노선현황·배차관리 등록내역·모바일)은 이미 drivers 컬렉션을
//  통째로 구독하고 있으므로, 표의 LIVE 표시는 그 데이터를 차량번호 기준으로 한 번만 묶은 공용 색인
//  (모듈 스토어)에서 꺼내 쓴다 → 추가 읽기 0. 줄마다 구독하지 않는다.
//  지도 창(LiveFleetMaps.jsx — 따로 떼어 필요할 때만 받음)을 열었을 때만 그 기사 1명의 문서 + 최근 이동경로를
//  onSnapshot으로 구독하고, 창을 닫으면 바로 끊는다.
//
//  미배차현황(UnassignedStatus·MobileUnassignedList)에는 넣지 않는다(배차완료 오더 전용).
import React from "react";
import { createPortal } from "react-dom";
import { LIVE_MONO, liveTsMs, LIVE_FRESH_MS, LIVE_RECENT_MS, LIVE_HIDE_MS, liveState, liveAgeText, LIVE_COLORS, useLiveNow, ensureLiveStyles } from "./liveCore";
// 예전 경로(./liveFleet)로 가져다 쓰는 화면이 그대로 동작하게 다시 내보낸다
export { LIVE_MONO, liveTsMs, LIVE_FRESH_MS, LIVE_RECENT_MS, LIVE_HIDE_MS, liveState, liveAgeText, LIVE_COLORS, useLiveNow, ensureLiveStyles };

const LiveFleetMaps = React.lazy(() => import("./LiveFleetMaps"));

export const FLEET_GRADES = new Set(["지입", "직영", "임대"]);
export const normLivePlate = (v) => String(v || "").replace(/[\s-]/g, "").toUpperCase();


// ─── 공용 색인(스토어) ──────────────────────────────────────────────────────
// 차량번호(정규화) → { id, plate, name, phone, grade, lat, lng, speed, status, updatedMs, ... }
// 같은 차량번호로 기사관리(PC) 문서와 기사앱 문서가 따로 있을 수 있어 묶어서 본다:
//  등급은 어느 문서든 지입/직영/임대면 인정, 위치는 가장 최근 위치가 있는 문서(=기사앱 uid 문서)를 쓴다.
let _src = null;
let _index = new Map();
let _version = 0;
const _subs = new Set();
const _entryCache = new Map(); // id → entry (내용이 같으면 같은 객체 재사용 → 줄 단위 재렌더 최소화)

function buildIndex(drivers) {
  const groups = new Map();
  for (const d of drivers || []) {
    if (!d) continue;
    const plate = normLivePlate(d.차량번호 || d.carNo);
    if (!plate) continue;
    let g = groups.get(plate);
    if (!g) { g = { grade: "", live: null, liveMs: -1, base: null }; groups.set(plate, g); }
    if (FLEET_GRADES.has(d.등급)) { g.grade = g.grade || d.등급; if (!g.base) g.base = d; }
    const loc = d.location;
    if (loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng)) && Number(loc.lat) !== 0) {
      const ms = liveTsMs(d.updatedAt) || liveTsMs(d.heartbeatAt);
      if (ms > g.liveMs) { g.live = d; g.liveMs = ms; }
    }
  }
  const next = new Map();
  const seen = new Set();
  groups.forEach((g, plate) => {
    if (!g.grade || !g.live) return;
    const d = g.live, b = g.base || d;
    const lat = Number(d.location.lat), lng = Number(d.location.lng);
    const speed = Math.max(0, Math.round(Number(d.speed) || 0));
    const status = String(d.status || d.mainStatus || d.state || "").trim();
    const name = String(d.이름 || d.name || b.이름 || b.name || "").trim();
    const phone = String(d.전화번호 || d.phone || b.전화번호 || b.phone || "").trim();
    const shown = String(d.차량번호 || d.carNo || b.차량번호 || plate).trim();
    const hb = liveTsMs(d.heartbeatAt);
    const sig = `${d.id}|${lat}|${lng}|${speed}|${status}|${g.liveMs}|${hb}|${g.grade}|${name}|${phone}|${shown}`;
    let e = _entryCache.get(d.id);
    if (!e || e.__sig !== sig) {
      e = { __sig: sig, id: d.id, plate: shown, key: plate, name, phone, grade: g.grade, lat, lng, speed, status, updatedMs: g.liveMs, heartbeatMs: hb, totalDistance: Number(d.totalDistance) || 0 };
      _entryCache.set(d.id, e);
    }
    seen.add(d.id);
    next.set(plate, e);
  });
  for (const id of _entryCache.keys()) if (!seen.has(id)) _entryCache.delete(id);
  return next;
}

function sameIndex(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

export function publishFleetDrivers(drivers) {
  if (!Array.isArray(drivers) || drivers === _src) return;
  _src = drivers;
  const next = buildIndex(drivers);
  if (sameIndex(next, _index)) return;
  _index = next;
  _version++;
  _subs.forEach((fn) => { try { fn(); } catch { /* 무시 */ } });
}

const subscribe = (fn) => { _subs.add(fn); return () => _subs.delete(fn); };

// 화면 최상위(또는 표 컴포넌트)에서 이미 받아둔 drivers 배열을 넘기기만 하면 된다(추가 읽기 없음)
export function useFleetLivePublish(drivers) {
  React.useEffect(() => { publishFleetDrivers(drivers); }, [drivers]);
}

// 차량번호 하나 → 실시간 항목(없으면 null). 그 기사 항목이 바뀔 때만 다시 그린다.
export function useFleetLiveEntry(plate) {
  const key = normLivePlate(plate);
  const get = React.useCallback(() => (key ? _index.get(key) || null : null), [key]);
  return React.useSyncExternalStore(subscribe, get, get);
}

// 색인 전체(관제 지도·툴바 버튼용)
export function useFleetLiveIndex() {
  const v = React.useSyncExternalStore(subscribe, () => _version, () => _version);
  return React.useMemo(() => ({ index: _index, version: v }), [v]);
}
export const getFleetLiveEntry = (plate) => _index.get(normLivePlate(plate)) || null;


const shortAge = (ms, now) => liveAgeText(ms, now).replace(" 전", "");

const kstYmd = (offDays = 0) => new Date(Date.now() + 9 * 3600e3 + offDays * 86400e3).toISOString().slice(0, 10);
const ymd10 = (v) => String(v || "").trim().slice(0, 10);

// 배차완료 + 오늘 운행(어제~내일 사이에 걸친) 오더만 — 한 달 전 오더에 "지금 위치"가 붙으면 헷갈린다
export function isLiveEligibleOrder(o) {
  if (!o) return false;
  const st = String(o.배차상태 || "").trim();
  if (st !== "배차완료") return false;
  if (!normLivePlate(o.차량번호)) return false;
  const p = ymd10(o.상차일 || o.입고일 || o.하차일);
  const d = ymd10(o.하차일 || o.입고일 || o.상차일);
  if (!p && !d) return true;
  const y = kstYmd(-1), t = kstYmd(1);
  return (p || d) <= t && (d || p) >= y;
}


// ─── 표 안의 LIVE 표시(차량번호 칸) ─────────────────────────────────────────────
// order 하나만 넘기면 된다. 지입·직영·임대 + 기사앱 위치 + 배차완료(오늘 운행)일 때만 보인다.
const autoMobile = (m) => (m ?? (typeof window !== "undefined" && window.innerWidth < 768));

// ⭐ 2026-11-05 variant — "chip"(예전 LIVE 칩) · "pin"(PC 표: 칸 왼쪽 위 모서리의 6px 점 — 칸 너비를 전혀 안 늘린다.
//  입력칸 바로 앞에 폭 0 기준점을 두고 그 왼쪽 위 모서리에 겹쳐 그린다) · "compact"(모바일 카드: 점 + "3분" 만 보이는 작은 칩)
export function LiveDriverChip({ order, mobile, className = "", variant = "chip" }) {
  const entry = useFleetLiveEntry(isLiveEligibleOrder(order) ? order.차량번호 : "");
  if (!entry) return null; // 대부분의 줄은 여기서 끝(시계 구독도 안 함)
  if (variant === "pin") return <LivePinInner order={order} entry={entry} className={className} />;
  return <LiveChipInner order={order} entry={entry} mobile={mobile} className={className} compact={variant === "compact"} />;
}
// ⭐ 2026-11-05 표 안 LIVE — 칩이 차량번호 칸을 넓히던 문제: 칸 모서리에 겹쳐 그리는 작은 점(absolute)으로 바꿨다.
//  점에 마우스를 올리면 기사·마지막 수신 시각, 누르면 실시간 지도(예전 칩과 같은 창).
function LivePinInner({ order, entry, className }) {
  const now = useLiveNow();
  const [open, setOpen] = React.useState(false);
  ensureLiveStyles();
  const st = liveState(entry, now);
  if (st === "none" && !open) return null;
  const stop = (e) => { e.stopPropagation(); };
  return (
    <>
      <span className="kp-live-anchor"><button type="button" className={`kp-live-pin ${className}`} data-kp-live={st}
        title={`${st === "live" ? "LIVE" : st === "recent" ? "GPS" : "LAST"} · ${entry.grade} · ${entry.name || entry.plate} — 눌러서 실시간 위치 보기 (마지막 수신 ${liveAgeText(entry.updatedMs, now)}${entry.speed ? ` · ${entry.speed}km/h` : ""})`}
        aria-label="실시간 위치 보기"
        onClick={(e) => { stop(e); setOpen(true); }} onDoubleClick={stop} onMouseDown={stop} onPointerDown={stop} onTouchStart={stop} onContextMenu={stop}>
        <span className={`kp-live-dot ${st === "live" ? "on" : ""}`} style={{ background: LIVE_COLORS[st] }} />
      </button></span>
      {open && <LiveMapPortal kind="one" order={order} plate={order.차량번호} mobile={autoMobile(false)} onClose={() => setOpen(false)} />}
    </>
  );
}
function LiveChipInner({ order, entry, mobile, className, compact = false }) {
  const now = useLiveNow();
  const [open, setOpen] = React.useState(false);
  ensureLiveStyles();
  const st = liveState(entry, now);
  if (st === "none" && !open) return null;
  const stop = (e) => { e.stopPropagation(); };
  const label = st === "live" ? "LIVE" : st === "recent" ? "GPS" : "LAST";
  return (
    <>
      <button type="button" className={`kp-live-chip ${compact ? "c" : mobile ? "m" : ""} ${className}`}
        title={`${entry.grade} · ${entry.name || entry.plate} — 실시간 위치 보기 (마지막 수신 ${liveAgeText(entry.updatedMs, now)}${entry.speed ? ` · ${entry.speed}km/h` : ""})`}
        onClick={(e) => { stop(e); setOpen(true); }} onDoubleClick={stop} onMouseDown={stop} onPointerDown={stop} onTouchStart={stop} onContextMenu={stop}
        data-kp-live={st}>
        <span className={`kp-live-dot ${st === "live" ? "on" : ""}`} style={{ background: LIVE_COLORS[st] }} />
        {!compact && <span className="t" style={{ color: st === "live" ? "#A7F3D0" : st === "recent" ? "#CFFAFE" : "#CBD5E1" }}>{label}</span>}
        <span className="a">{shortAge(entry.updatedMs, now)}</span>
      </button>
      {open && <LiveMapPortal kind="one" order={order} plate={order.차량번호} mobile={autoMobile(mobile)} onClose={() => setOpen(false)} />}
    </>
  );
}

// 지도 창은 body로 띄운다(표의 zoom/overflow 영향 없이) + 따로 떼어낸 파일을 그때 받는다
export function LiveMapPortal(props) {
  if (typeof document === "undefined") return null;
  // React 포털 이벤트는 React 트리를 따라 표의 줄(<tr>)까지 올라간다 → 줄의 두 번 누르기·키 입력·오른쪽 클릭 처리가
  // 지도 창 조작에 반응하지 않도록 여기서 끊는다.
  return createPortal(
    <div style={{ display: "contents" }} {...STOP_EVENTS}>
      <React.Suspense fallback={<LiveLoadingVeil />}>
        <LiveFleetMaps {...props} />
      </React.Suspense>
    </div>,
    document.body
  );
}
const stopEv = (e) => e.stopPropagation();
const STOP_EVENTS = Object.fromEntries(["onClick", "onDoubleClick", "onMouseDown", "onMouseUp", "onPointerDown", "onPointerUp", "onTouchStart", "onTouchEnd", "onTouchMove",
  "onKeyDown", "onKeyUp", "onKeyPress", "onKeyDownCapture", "onChange", "onInput", "onFocus", "onBlur", "onContextMenu", "onWheel", "onScroll"].filter((k) => !k.endsWith("Capture")).map((k) => [k, stopEv]));
function LiveLoadingVeil() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000050, background: "rgba(6,12,26,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "kpLiveFade .15s ease-out" }}>
      <div style={{ fontFamily: LIVE_MONO, fontVariantNumeric: "tabular-nums", fontSize: 11, fontWeight: 800, letterSpacing: ".3em", color: "#8FB0F0" }}>LIVE · LOADING</div>
    </div>
  );
}

// ─── 툴바 "실시간 관제" 버튼 ─────────────────────────────────────────────────
// rows = 지금 화면에 걸러진 목록. 그중 배차완료 + 지입·직영·임대 기사앱 위치가 있는 기사만 지도에 모은다.
export function useLiveFleetRows(rows) {
  const { index, version } = useFleetLiveIndex();
  return React.useMemo(() => {
    if (!index.size || !Array.isArray(rows) || !rows.length) return [];
    const byId = new Map();
    for (const o of rows) {
      if (!isLiveEligibleOrder(o)) continue;
      const e = index.get(normLivePlate(o.차량번호));
      if (!e) continue;
      let g = byId.get(e.id);
      if (!g) { g = { id: e.id, key: e.key, orders: [] }; byId.set(e.id, g); }
      g.orders.push(o);
    }
    return [...byId.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, version]);
}

export function FleetLiveButton({ rows, mobile, dark = false, size = "sm", className = "", hideWhenEmpty = true }) {
  const groups = useLiveFleetRows(rows);
  const { index } = useFleetLiveIndex();
  const now = useLiveNow();
  const [open, setOpen] = React.useState(false);
  ensureLiveStyles();
  if (hideWhenEmpty && !index.size) return null; // 이 회사에 기사앱 쓰는 지입·직영·임대 기사가 없으면 버튼도 숨김
  const liveN = groups.filter((g) => liveState(index.get(g.key), now) === "live").length;
  const h = size === "lg" ? "h-10 px-3.5 rounded-xl text-[13px]" : size === "md" ? "h-[30px] px-2.5 rounded-lg text-[11.5px]" : "h-[28px] px-2 rounded-lg text-[11px]";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`kp-live-btn ${h} ${className}`}
        style={dark ? { background: "rgba(255,255,255,.06)", borderColor: "rgba(255,255,255,.16)" } : undefined}
        title="배차완료된 지입·직영·임대 기사(기사앱)의 실시간 위치를 지도에서 한 번에 보기">
        <span className={`kp-live-dot ${liveN ? "on" : ""}`} style={{ background: liveN ? LIVE_COLORS.live : LIVE_COLORS.stale }} />
        실시간 관제
        <span className="n">{groups.length}</span>
      </button>
      {open && <LiveMapPortal kind="fleet" rows={rows} mobile={autoMobile(mobile)} onClose={() => setOpen(false)} />}
    </>
  );
}
