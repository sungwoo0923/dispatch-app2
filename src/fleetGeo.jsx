// 지입차관리(PC/모바일)와 기사앱에서 같이 쓰는 위치 관련 공용 기능.
//  - 간단주소: "경기도 김포시 김포한강5로385" → "김포구래동", "인천 서구 북항로 28-29" → "인천서구"
//  - 주소 좌표(useAddrGeo): 지오코딩 결과 캐시
//  - 하차 도착예상시간(DropEtaText): 상차지 도착시각 + 30분(상차 작업) + 실도로 소요시간
import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { geocodeAddress, geocodeAddressDetail, getDrivingRouteByCoords, haversineKm } from "./tmapFareCalc";

// ─── 간단주소 ────────────────────────────────────────────────────────────────
const METRO = { 서울: "서울", 부산: "부산", 대구: "대구", 인천: "인천", 광주: "광주", 대전: "대전", 울산: "울산", 세종: "세종" };
const PROVINCE = {
  경기: "경기", 강원: "강원", 충북: "충북", 충남: "충남", 전북: "전북", 전남: "전남", 경북: "경북", 경남: "경남", 제주: "제주",
  충청북: "충북", 충청남: "충남", 전라북: "전북", 전라남: "전남", 경상북: "경북", 경상남: "경남", 전북특별자치: "전북", 강원특별자치: "강원", 제주특별자치: "제주",
};
function sidoShort(t) {
  const base = String(t || "").replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
  if (METRO[base]) return { short: METRO[base], metro: true };
  if (PROVINCE[base]) return { short: PROVINCE[base], metro: false };
  return null;
}
const cityShort = (t) => String(t || "").split(" ")[0].replace(/(시|군)$/, "");
// 동/읍/면 이름의 숫자 행정동 꼬리 제거("역삼1동" → "역삼동")
const dongShort = (t) => String(t || "").replace(/\d+(동|가)$/, "$1");

// 주소 텍스트만으로 만들 수 있는 간단주소. dong이 필요한데 텍스트에 없으면 needApi=true.
function shortAddrFromText(addr) {
  const tokens = String(addr || "").replace(/\(.*?\)/g, " ").split(/\s+/).filter(Boolean);
  if (!tokens.length) return { text: "", needApi: false };
  let sd = sidoShort(tokens[0]);
  let i = sd ? 1 : 0;
  if (!sd) {
    // "김포시 김포한강5로385"처럼 시/도가 생략된 주소 — 시/군으로 시작하면 도 지역으로 본다.
    if (/(시|군)$/.test(tokens[0])) sd = { short: "", metro: false };
    else return { text: tokens.slice(0, 2).join(" "), needApi: true };
  }
  const gu = tokens[i] || "";
  if (sd.metro) {
    if (sd.short === "세종") {
      const d = tokens.slice(i).find(t => /(동|읍|면)$/.test(t) && !/(로|길)/.test(t));
      return { text: `세종${d ? dongShort(d) : ""}`, needApi: !d };
    }
    return { text: `${sd.short}${gu}`, needApi: false };
  }
  const city = cityShort(gu);
  // 시 아래 구가 있는 경우("수원시 영통구 매탄동") 구는 건너뛰고 동/읍/면을 찾는다.
  const rest = tokens.slice(i + 1);
  const d = rest.find(t => /^[가-힣\d]+(동|읍|면|가)$/.test(t) && !/(로|길)\d*(동|가)?$/.test(t) && !/^\d/.test(t));
  if (d) return { text: `${city}${dongShort(d)}`, needApi: false };
  return { text: city ? `${sd.short}${city}` : sd.short, needApi: true };
}

function shortAddrFromDetail(g, fallback) {
  const sd = sidoShort(g.city_do);
  const dong = dongShort(g.eup_myun || g.legalDong || g.adminDong || "");
  if (sd?.metro) {
    if (sd.short === "세종") return `세종${dong}`;
    return `${sd.short}${String(g.gu_gun || "").split(" ")[0]}`;
  }
  const city = cityShort(g.gu_gun);
  if (city && dong) return `${city}${dong}`;
  if (city) return `${sd?.short || ""}${city}`;
  return fallback;
}

const SHORT_CACHE_KEY = "shortAddrCacheV1";
let _shortCache = null;
function shortCache() {
  if (_shortCache) return _shortCache;
  try { _shortCache = JSON.parse(localStorage.getItem(SHORT_CACHE_KEY) || "{}") || {}; } catch { _shortCache = {}; }
  return _shortCache;
}
function saveShortCache() {
  try { localStorage.setItem(SHORT_CACHE_KEY, JSON.stringify(shortCache())); } catch { /* 저장 실패는 무시 */ }
}

const _shortQueue = [];
const _shortWaiters = new Map();
let _shortBusy = false;
async function _runShortQueue() {
  if (_shortBusy || !_shortQueue.length) return;
  _shortBusy = true;
  const addr = _shortQueue.shift();
  let text = null;
  try {
    const g = await geocodeAddressDetail(addr);
    if (g) text = shortAddrFromDetail(g, null);
  } catch { text = null; }
  if (text) { shortCache()[addr] = text; saveShortCache(); }
  (_shortWaiters.get(addr) || []).forEach(cb => cb(text));
  _shortWaiters.delete(addr);
  await new Promise(r => setTimeout(r, 300));
  _shortBusy = false;
  _runShortQueue();
}

export function useShortAddr(addr) {
  const key = String(addr || "").trim();
  const base = shortAddrFromText(key);
  const [apiText, setApiText] = useState(() => (key ? shortCache()[key] : null) || null);
  useEffect(() => {
    if (!key) { setApiText(null); return; }
    const cached = shortCache()[key];
    if (cached) { setApiText(cached); return; }
    setApiText(null);
    if (!base.needApi) return;
    let alive = true;
    const cb = (t) => { if (alive && t) setApiText(t); };
    if (!_shortWaiters.has(key)) { _shortWaiters.set(key, []); _shortQueue.push(key); }
    _shortWaiters.get(key).push(cb);
    _runShortQueue();
    return () => { alive = false; };
  }, [key, base.needApi]);
  if (!key) return "";
  return apiText || base.text || key;
}

export function ShortAddr({ addr, fallback = "-" }) {
  const t = useShortAddr(addr);
  return <>{t || fallback}</>;
}

// ─── 주소 좌표 (캐시) ─────────────────────────────────────────────────────────
const _geoCache = new Map();
const _geoPending = new Map();
function geocodeCached(addr) {
  if (_geoCache.has(addr)) return Promise.resolve(_geoCache.get(addr));
  if (_geoPending.has(addr)) return _geoPending.get(addr);
  const p = geocodeAddress(addr)
    .then(g => {
      const r = g ? { lat: g.lat, lng: g.lon } : null;
      if (r) _geoCache.set(addr, r);
      return r;
    })
    .catch(() => null)
    .finally(() => _geoPending.delete(addr));
  _geoPending.set(addr, p);
  return p;
}

// undefined = 조회중, null = 실패, {lat,lng} = 성공
export function useAddrGeo(addr) {
  const key = String(addr || "").trim();
  const [geo, setGeo] = useState(() => (key ? _geoCache.get(key) : null));
  useEffect(() => {
    if (!key) { setGeo(null); return; }
    if (_geoCache.has(key)) { setGeo(_geoCache.get(key)); return; }
    let alive = true;
    let timer = null;
    const attempt = () => {
      setGeo(undefined);
      geocodeCached(key).then(r => {
        if (!alive) return;
        setGeo(r);
        if (!r) timer = setTimeout(() => alive && attempt(), 30000);
      });
    };
    attempt();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [key]);
  return geo;
}

// ─── 하차 도착예상시간 ──────────────────────────────────────────────────────────
// ⭐ 사용자 요청 — 기사가 상차지(1km 이내)에 도착한 시각을 기준으로 상차 작업
// 30분 뒤 출발한다고 보고, 상차지→하차지 실도로 소요시간을 더해 도착예상시각을 낸다.
export const LOADING_MINUTES = 30;
const ARRIVE_KM = 1;

function kstDateStr(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
const tsMs = (t) => (t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds * 1000 : (typeof t === "number" ? t : null)));

// 오늘 GPS 기록 중 상차지 1km 이내로 처음 찍힌 시각(ms). 없으면 null.
function usePickupArrivalMs(driverId, pickupGeo, sinceMs) {
  const [arrived, setArrived] = useState(null);
  useEffect(() => {
    setArrived(null);
    if (!driverId || !pickupGeo) return;
    const unsub = onSnapshot(
      query(collection(db, "gps_tracks"), where("driverId", "==", driverId), where("date", "==", kstDateStr())),
      (snap) => {
        let first = null;
        snap.docs.forEach((d) => {
          const p = d.data();
          const ms = tsMs(p.timestamp);
          if (p.lat == null || p.lng == null || ms == null) return;
          if (sinceMs && ms < sinceMs) return;
          if (haversineKm(p.lat, p.lng, pickupGeo.lat, pickupGeo.lng) > ARRIVE_KM) return;
          if (first == null || ms < first) first = ms;
        });
        setArrived(first);
      },
      () => {}
    );
    return () => unsub();
  }, [driverId, pickupGeo?.lat, pickupGeo?.lng, sinceMs]);
  return arrived;
}

const _routeMinCache = new Map();
function useRouteMinutes(from, to) {
  const key = from && to ? `${from.lat},${from.lng}→${to.lat},${to.lng}` : null;
  const [min, setMin] = useState(() => (key ? _routeMinCache.get(key) ?? null : null));
  useEffect(() => {
    if (!key) { setMin(null); return; }
    if (_routeMinCache.has(key)) { setMin(_routeMinCache.get(key)); return; }
    let alive = true;
    getDrivingRouteByCoords({ lat: from.lat, lon: from.lng }, { lat: to.lat, lon: to.lng }).then(r => {
      if (!r) return;
      _routeMinCache.set(key, r.minutes);
      if (alive) setMin(r.minutes);
    });
    return () => { alive = false; };
  }, [key]);
  return min;
}

// ⭐ 실시간 위치 기준 경로 소요시간 — 위치가 500m 이상 바뀌었거나 3분이 지나면 다시 조회
//   (Tmap 경로 API의 소요시간은 현재 도로 상황(교통)을 반영한다)
function useLiveRouteMinutes(loc, to) {
  const [state, setState] = useState(null); // { min, at, from }
  useEffect(() => {
    if (!loc || loc.lat == null || !to) return;
    const moved = !state?.from || haversineKm(state.from.lat, state.from.lng, loc.lat, loc.lng) > 0.5;
    const stale = !state?.at || Date.now() - state.at > 3 * 60000;
    if (!moved && !stale) return;
    let alive = true;
    const from = { lat: loc.lat, lng: loc.lng };
    getDrivingRouteByCoords({ lat: from.lat, lon: from.lng }, { lat: to.lat, lon: to.lng }).then(r => {
      if (alive && r) setState({ min: r.minutes, at: Date.now(), from });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc?.lat, loc?.lng, to?.lat, to?.lng]);
  return state?.min ?? null;
}

// ⭐ 사용자 요청 — 하차 도착예상시각
//  · 상차지 도착 후 아직 상차지(1km 이내)에 있으면: (도착시각+30분 상차, 단 이미 지났으면 지금) + 상차지→하차지 소요시간
//  · 상차지를 떠나 이동 중이면: 지금 + "현재 위치→하차지" 실시간 소요시간 (기사가 빨리 출발하면 그만큼 당겨짐)
export function useDropEta(order, driverId, location) {
  const pickupGeo = useAddrGeo(order?.상차지주소 || null);
  const dropGeo = useAddrGeo(order?.하차지주소 || null);
  const sinceMs = tsMs(order?.기사확인일시);
  const arrivedMs = usePickupArrivalMs(driverId, pickupGeo || null, sinceMs);
  const routeMin = useRouteMinutes(pickupGeo || null, dropGeo || null);
  const hasLoc = location?.lat != null && location?.lng != null;
  const atPickup = hasLoc && pickupGeo ? haversineKm(location.lat, location.lng, pickupGeo.lat, pickupGeo.lng) <= ARRIVE_KM : false;
  const departed = arrivedMs != null && hasLoc && !atPickup;
  const liveMin = useLiveRouteMinutes(departed ? location : null, dropGeo || null);
  if (arrivedMs == null) return null;
  if (departed && liveMin != null) return new Date(Date.now() + liveMin * 60000);
  if (routeMin == null) return null;
  const departMs = Math.max(arrivedMs + LOADING_MINUTES * 60000, Date.now());
  return new Date(departMs + routeMin * 60000);
}

const hhmm = (d) => {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
};

export function DropEtaText({ order, driverId, location, style, fallback = null }) {
  const eta = useDropEta(order, driverId, location);
  if (!eta) return fallback;
  return (
    <span style={{ fontWeight: 800, color: "#1d4ed8", ...style }}>{hhmm(eta)} 도착예상</span>
  );
}


// ⭐ 사용자 요청 — 상태에 따라 "남은 거리·예상시간"
//  · 상차지로 가는 중(운송중/상차지진입, 아직 상차지 안 다녀옴): 현재 위치 → 상차지
//  · 상차지를 다녀온 뒤(운송중/하차지진입): 현재 위치 → 하차지
//  · 상차지도착: 상차지 → 하차지(상차 후 남은 운행)
//  실제 도로 기준(티맵). 0.5km 이상 움직였거나 3분 지나면 다시 계산한다.
function useLiveRoute(loc, to) {
  const [state, setState] = useState(null); // { km, min, at, from, key }
  const toKey = to ? `${to.lat},${to.lng}` : "";
  useEffect(() => {
    if (!loc || loc.lat == null || !to) return;
    const same = state?.key === toKey;
    const moved = !same || !state?.from || haversineKm(state.from.lat, state.from.lng, loc.lat, loc.lng) > 0.5;
    const stale = !state?.at || Date.now() - state.at > 3 * 60000;
    if (!moved && !stale) return;
    let alive = true;
    const from = { lat: loc.lat, lng: loc.lng };
    getDrivingRouteByCoords({ lat: from.lat, lon: from.lng }, { lat: to.lat, lon: to.lng }).then(r => {
      if (alive && r) setState({ km: r.km, min: r.minutes, at: Date.now(), from, key: toKey });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc?.lat, loc?.lng, toKey]);
  return state?.key === toKey ? state : null;
}

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`);

export function useRemainInfo(order, location, phase) {
  const pickupGeo = useAddrGeo(order?.상차지주소 || null);
  const dropGeo = useAddrGeo(order?.하차지주소 || null);
  const hasLoc = location?.lat != null && location?.lng != null;
  const visited = !!order?.상차완료일시 || isPickupVisited(order);
  let target = null, label = "", from = hasLoc ? location : null;
  if (phase === "상차지도착") { target = dropGeo; label = "하차지까지"; }
  else if (phase === "하차지도착") { target = null; }
  else if (phase === "하차지진입" || visited) { target = dropGeo; label = "하차지까지"; }
  else if (phase === "운송중" || phase === "상차지진입") { target = pickupGeo; label = "상차지까지"; }
  const r = useLiveRoute(from, target || null);
  if (!target || !r) return null;
  return { label, km: r.km, min: r.min, text: `${label} ${r.km}km · 약 ${fmtMin(r.min)}` };
}

export function RemainText({ order, location, phase, style, fallback = null }) {
  const info = useRemainInfo(order, location, phase);
  if (!info) return fallback;
  return <span style={{ fontWeight: 800, color: "#111827", ...style }}>{info.text}</span>;
}

// ⭐ 사용자 요청 — "하차지까지 15km · 약 32분 (16:05 도착예상)" 한 줄로 합쳐 보여준다.
// 하차지로 가는 중이면 하차 도착예상(useDropEta), 없으면 지금+소요시간. 상차지로 가는 중이면 상차지 도착예상.
export function RemainEtaText({ order, driverId, location, phase, style, etaStyle, fallback = null }) {
  const info = useRemainInfo(order, location, phase);
  const dropEta = useDropEta(order, driverId, location);
  if (!info) {
    if (dropEta) return <span style={{ fontWeight: 800, color: "#1d4ed8", ...style, ...etaStyle }}>{hhmm(dropEta)} 도착예상</span>;
    return fallback;
  }
  const eta = info.label === "하차지까지" ? (dropEta || new Date(Date.now() + info.min * 60000)) : new Date(Date.now() + info.min * 60000);
  return (
    <span style={{ fontWeight: 800, color: "#111827", ...style }}>
      {info.text}
      <span style={{ color: "#1d4ed8", marginLeft: 6, ...etaStyle }}>({hhmm(eta)} 도착예상)</span>
    </span>
  );
}

// ─── 지입 기사 통합 상태(관제현황·노선관리·모바일·기사앱 공통) ───────────────────────
// ⭐ 사용자 요청 — 지입 기사는 출근/상차중/하차중/복귀중/퇴근 버튼 상태 대신
//   배차대기 / 오더확인중 / 운송중 / 상차지진입 / 상차지도착 / 하차지진입 / 하차지도착 / 휴차
// 로 통일해서 보여준다(기사가 출근만 누르고 오더가 없으면 "배차대기").
export const FLEET_PHASE_FILTERS = ["전체", "배차대기", "운송중", "상차지진입", "상차지도착", "하차지진입", "하차지도착", "휴차"];
export const FLEET_PHASE_COLORS = {
  "배차대기": "#92400e", "오더확인중": "#d97706", "운송중": "#1B2B4B",
  "상차지진입": "#2563eb", "상차지도착": "#7c3aed", "하차지진입": "#ea580c", "하차지도착": "#db2777",
  "휴차": "#6b7280",
};

export function getCachedGeo(addr) {
  const k = String(addr || "").trim();
  return k ? _geoCache.get(k) || null : null;
}
export function prefetchGeo(addr) {
  const k = String(addr || "").trim();
  if (!k || _geoCache.has(k)) return Promise.resolve(_geoCache.get(k) || null);
  return geocodeCached(k);
}

const isCanceledRow = (r) => r?.배차상태 === "배차취소" || r?.상태 === "취소";

const normAddr = (a) => String(a || "").replace(/\(.*?\)/g, "").replace(/\s+/g, "").trim();
export function isPickupVisited(order) {
  if (!order?.상차지도착주소 || normAddr(order.상차지도착주소) !== normAddr(order.상차지주소)) return false;
  // ⭐ 예전 기사앱 버그로 "수락하는 순간" 다녀온 것으로 잘못 기록된 경우(근거 없음 + 수락 5초 이내)는 무시
  if (!order.상차지도착근거) {
    const v = tsMs(order.상차지도착일시), a = tsMs(order.기사확인일시);
    if (v && a && Math.abs(v - a) < 5000) return false;
  }
  return true;
}

// ⭐ 상차 완료 여부 — 기사가 "상차완료"를 눌렀거나(상차사진 포함), 상차지에 들렀다가 1km 밖으로
// 벗어났으면(출발) 상차한 것으로 본다. 상차 전에는 하차지가 가까워도 하차지 상태로 보지 않는다.
export function isLoaded(order, location) {
  if (!order) return false;
  if (order.상차완료일시) return true;
  if (!isPickupVisited(order)) return false;
  const pg = getCachedGeo(order.상차지주소);
  if (!pg || location?.lat == null || location?.lng == null) return false;
  return haversineKm(location.lat, location.lng, pg.lat, pg.lng) > 1;
}

// ⭐ 수락한 오더가 여러 건이면 "먼저 수락한 오더"부터 진행한다(운송완료 전까지는 그 오더 기준).
// 기사확인일시(수락 시각) 오름차순, 같으면 상차일·상차시간 순. 수락 시각이 아직 저장 전이면 맨 뒤.
export function sortActiveOrders(orders = []) {
  return (orders || [])
    .filter(r => r?.기사확인상태 === "수락" && !isCanceledRow(r))
    .slice()
    .sort((a, b) => {
      const ta = tsMs(a.기사확인일시) ?? Infinity, tb = tsMs(b.기사확인일시) ?? Infinity;
      if (ta !== tb) return ta - tb;
      return `${a.상차일 || ""} ${a.상차시간 || ""}`.localeCompare(`${b.상차일 || ""} ${b.상차시간 || ""}`);
    });
}
export const pickCurrentOrder = (orders) => sortActiveOrders(orders)[0] || null;

// 진행 단계(가로 진행선) — 상차지로 가는 "운송중"과 상차 후 "운송중"을 구분해 보여준다
export const FLEET_STEPS = ["운송중", "상차지진입", "상차지도착", "하차이동", "하차지진입", "하차지도착"];
export function fleetStepIndex(order, phase) {
  if (phase === "상차지진입") return 1;
  if (phase === "상차지도착") return 2;
  if (phase === "하차지진입") return 4;
  if (phase === "하차지도착") return 5;
  if (phase === "운송중") return (order?.상차완료일시 || isPickupVisited(order)) ? 3 : 0;
  return -1;
}
// ⭐ 사용자 요청 — 단계 이름: 상차이동·상차진입·상차지도착·하차이동·하차진입·하차지도착.
// 칸이 좁아 글자가 겹치면(폴더블 2분할 등) 위에 "상차 / 하차" 묶음 제목을 두고 아래는
// "이동·진입·도착" 2글자만 보여준다 — 겹치지 않으면서 세로로 길어지지도 않는다.
// 상차완료 시각은 위 상차지 정보에 이미 나오므로 여기선 표시하지 않는다.
const STEP_LABELS = ["상차이동", "상차진입", "상차지도착", "하차이동", "하차진입", "하차지도착"];
const STEP_SHORT = ["이동", "진입", "도착", "이동", "진입", "도착"];
export function FleetStepper({ order, phase, large = false }) {
  const cur = fleetStepIndex(order, phase);
  const ref = React.useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cur < 0]);
  if (cur < 0) return null;
  const f = large === true ? 14 : (large || 11);
  // 가장 긴 이름(5글자)이 한 칸에 들어가는지로 판단
  const compact = w > 0 && w / 6 < f * 5 + 6;
  const labels = compact ? STEP_SHORT : STEP_LABELS;
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <style>{`@keyframes kpStepBlink { 0%,100% { box-shadow: 0 0 0 0 rgba(37,99,235,.55); } 50% { box-shadow: 0 0 0 6px rgba(37,99,235,0); } } @keyframes kpStepText { 0%,100% { opacity: 1; } 50% { opacity: .45; } }`}</style>
      {compact && (
        <div style={{ display: "flex", marginBottom: 5 }}>
          {["상차", "하차"].map((g, gi) => {
            const on = gi === 0 ? cur <= 2 : cur >= 3;
            return (
              <div key={g} style={{ flex: 1, display: "flex", alignItems: "center", gap: 5, padding: "0 6px" }}>
                <span style={{ flex: 1, height: 1.5, background: on ? "#93a4c3" : "#e5e7eb" }} />
                <span style={{ fontSize: f, fontWeight: 900, color: on ? "#1B2B4B" : "#9ca3af", whiteSpace: "nowrap" }}>{g}</span>
                <span style={{ flex: 1, height: 1.5, background: on ? "#93a4c3" : "#e5e7eb" }} />
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", width: "100%" }}>
        {labels.map((lb, i) => {
          const done = i < cur, now = i === cur;
          const dot = now ? "#2563eb" : done ? "#1B2B4B" : "#d1d5db";
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", minWidth: 0 }}>
              {i > 0 && <div style={{ position: "absolute", top: 6, right: "50%", width: "100%", height: 3, background: i <= cur ? "#1B2B4B" : "#e5e7eb", zIndex: 0 }} />}
              <div style={{ width: now ? 15 : 13, height: now ? 15 : 13, marginTop: now ? -1 : 0, borderRadius: "50%", background: dot, border: "2px solid #fff", zIndex: 1, animation: now ? "kpStepBlink 1.6s ease-in-out infinite" : "none" }} />
              <div style={{ marginTop: 5, fontSize: f, lineHeight: 1.2, textAlign: "center", whiteSpace: "nowrap", fontWeight: now ? 900 : 700, color: now ? "#2563eb" : done ? "#1B2B4B" : "#9ca3af", animation: now ? "kpStepText 1.6s ease-in-out infinite" : "none" }}>{lb}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 순수 계산 — 좌표는 캐시에 있는 것만 사용(없으면 "운송중"으로 두고 prefetch로 채운다)
export function computeFleetPhase({ driverStatus, orders = [], location }) {
  if (driverStatus === "휴차") return "휴차";
  const live = (orders || []).filter(r => !isCanceledRow(r));
  const active = pickCurrentOrder(live);
  if (active) {
    const pg = getCachedGeo(active.상차지주소);
    const dg = getCachedGeo(active.하차지주소);
    if (location?.lat != null && location?.lng != null) {
      const pd = pg ? haversineKm(location.lat, location.lng, pg.lat, pg.lng) : null;
      const dd = dg ? haversineKm(location.lat, location.lng, dg.lat, dg.lng) : null;
      // ⭐ 버그수정 — "상차지에 이미 다녀왔는지"를 기억하지 않아, 상차 후 상차지에서
      // 1~5km 멀어지면 "운송중"이 아니라 다시 "상차지진입"으로 보였다(상차지 주소를 운행
      // 중에 수정한 경우, 대기하던 자리에서 바로 오더를 받은 경우 모두 해당).
      // 기사앱이 상차지 1km 안에 들어온 적이 있으면 오더에 상차지도착주소를 남긴다 —
      // 그 주소가 지금 상차지 주소와 같으면 "다녀온 것"으로 보고 상차지진입은 건너뛴다.
      // 상차 전: 상차지 거리만 본다(하차지가 가까워도 무시) / 상차 후: 하차지 거리만 본다
      const loaded = isLoaded(active, location);
      if (!loaded) {
        if (pd != null && pd <= 1) return "상차지도착";
        if (pd != null && pd <= 5 && !isPickupVisited(active)) return "상차지진입";
      } else {
        if (dd != null && dd <= 1) return "하차지도착";
        if (dd != null && dd <= 5) return "하차지진입";
      }
    }
    return "운송중";
  }
  if (live.some(r => r.기사확인상태 === "대기")) return "오더확인중";
  return "배차대기";
}

// 화면용 훅 — 필요한 주소 좌표를 받아오고, 받아오면 다시 그린다
export function useFleetPhaseGeo(orders) {
  const [, setTick] = useState(0);
  const key = (orders || []).filter(r => r?.기사확인상태 === "수락").map(r => `${r.상차지주소}|${r.하차지주소}`).join("#");
  useEffect(() => {
    let alive = true;
    (orders || []).filter(r => r?.기사확인상태 === "수락").forEach(r => {
      [r.상차지주소, r.하차지주소].forEach(a => {
        if (a && !getCachedGeo(a)) prefetchGeo(a).then(() => { if (alive) setTick(t => t + 1); });
      });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
