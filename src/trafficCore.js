// ======================= src/trafficCore.js =======================
// 🚦 2026-11-22 관제센터 1단계 — 교통 돌발상황(사고 · 공사 · 통제) 공용 데이터
//  · 모든 지도(Leaflet · Tmap · PC · 모바일)가 이 모듈 하나를 같이 쓴다.
//  · 데이터: /api/traffic?kind=events (국가교통정보센터 ITS 전국 돌발상황 — 서버가 대신 받아 1분 캐시)
//    → 지도가 몇 개 열려 있어도 브라우저당 90초에 1번만 받는다(구독자가 없으면 멈춘다).
//  · 켜기/끄기: 지도 위 [교통정보] 버튼. 이 기기에 기억하고, 열린 지도 전부에 같이 적용된다.
import React from "react";
import { eventsUrl, cctvUrl, parseEvents, parseCctv, prettyMessage } from "./itsCore.js";
export { prettyMessage };

export const TRAFFIC_KINDS = {
  accident: { label: "사고", icon: "🚨", color: "#EF4444", rank: 0 },
  disaster: { label: "재난", icon: "⚠️", color: "#A855F7", rank: 1 },
  hazard:   { label: "돌발", icon: "⚠️", color: "#F59E0B", rank: 2 },
  weather:  { label: "기상", icon: "🌧️", color: "#3B82F6", rank: 3 },
  work:     { label: "공사", icon: "🚧", color: "#F97316", rank: 4 },
  etc:      { label: "기타", icon: "ℹ️", color: "#64748B", rank: 5 },
};
export const CONTROL_META = { label: "통제", icon: "⛔", color: "#DC2626" };
export const kindMeta = (ev) => (ev?.blocked ? { ...TRAFFIC_KINDS[ev.kind] || TRAFFIC_KINDS.etc, ...CONTROL_META } : TRAFFIC_KINDS[ev?.kind] || TRAFFIC_KINDS.etc);
// 관제에서 "문제"(빨강)로 볼 돌발 — 공사 · 기상 · 기타는 "주의"(노랑)
// 🚦 2026-11-22 사장님 요청 — 몇 달째 이어지는 공사(부분통제)는 배차에 의미가 적어 기본으로 숨긴다
//  "장기 공사" = 공사 · 기타 중 전면통제가 아니고, 시작한 지 하루(LONG_WORK_MS)가 넘은 것
export const LONG_WORK_MS = 24 * 3600 * 1000;
export function isLongWork(ev, now = Date.now()) {
  if (!ev || ev.blocked || (ev.kind !== "work" && ev.kind !== "etc")) return false;
  const t = Date.parse(ev.start || "");
  return !t || now - t > LONG_WORK_MS;
}
// 관제 · 지도에 기본으로 보일 돌발(장기 공사 빼고)
export const isRelevant = (ev, now = Date.now()) => !isLongWork(ev, now);
export const isSevere = (ev) => !!ev && (ev.blocked || ev.kind === "accident" || ev.kind === "disaster" || ev.kind === "hazard");

// ─── 거리 계산 ────────────────────────────────────────────────────────────────
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
export function distKm(aLat, aLng, bLat, bLng) {
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
// 점 p 에서 선분 a→b 까지 거리(km)와 선분 위 위치 t(0=a, 1=b). 짧은 거리라 평면 근사로 충분하다.
export function segDistKm(p, a, b) {
  const kx = 111.32 * Math.cos(rad((a.lat + b.lat) / 2)), ky = 110.57;
  const ax = a.lng * kx, ay = a.lat * ky, bx = b.lng * kx, by = b.lat * ky, px = p.lng * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return { km: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

// 차량 위치 · 가는 곳 기준 "근처/가는 길"에 있는 돌발 — 관제센터 경보에 쓴다
//  · 가는 길: 지금 위치 → 목적지 직선 1.5km 폭 안(실제 도로 경로는 2단계에서 Tmap 경로로 바꾼다)
//  · 근처: 지금 위치 반경 3km
export function incidentsNear(events, pos, target, { aheadKm = 1.5, nearKm = 3 } = {}) {
  if (!pos || !Array.isArray(events) || !events.length) return [];
  const out = [];
  for (const ev of events) {
    const d = distKm(pos.lat, pos.lng, ev.lat, ev.lng);
    if (d <= nearKm) { out.push({ ev, km: d, where: "near" }); continue; }
    if (target && d < 400) {
      const s = segDistKm(ev, pos, target);
      if (s.km <= aheadKm && s.t > 0.02) out.push({ ev, km: d, where: "ahead" });
    }
  }
  return out.sort((a, b) => (kindMeta(a.ev).rank - kindMeta(b.ev).rank) || a.km - b.km);
}

export function eventTitle(ev) {
  const m = kindMeta(ev);
  const road = [ev.road, ev.dir && ev.dir !== "-" ? `(${ev.dir})` : ""].filter(Boolean).join(" ");
  return `${m.label}${ev.detail && ev.detail !== ev.type ? ` · ${ev.detail}` : ""}${road ? ` — ${road}` : ""}`;
}
export function eventTimeText(ev) {
  const t = Date.parse(ev?.start || "");
  if (!t) return "";
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  return d.toDateString() === today.toDateString() ? `${hm} 발생` : `${d.getMonth() + 1}/${d.getDate()} ${hm}부터`;
}

// ─── 지도 버튼 · 아이콘 공용 스타일 ───────────────────────────────────────────
let _styled = false;
export function ensureTrafficStyles() {
  if (_styled || typeof document === "undefined") return;
  _styled = true;
  const st = document.createElement("style");
  st.textContent = `@keyframes kpTrfPing{0%{transform:scale(.7);opacity:.45}80%,100%{transform:scale(1.7);opacity:0}}
.kp-trf-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:999px;font:800 12px 'Noto Sans KR',system-ui,sans-serif;cursor:pointer;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.18)}
.kp-trf-btn.l{background:#fff;color:#1B2B4B;border:1px solid #D5DDEA}.kp-trf-btn.l.on{background:#1B2B4B;color:#fff;border-color:#1B2B4B}
.kp-trf-btn.d{background:rgba(11,20,40,.78);color:#CFE0FF;border:1px solid rgba(143,176,240,.3)}.kp-trf-btn.d.on{background:rgba(143,176,240,.95);color:#0B1428;border-color:transparent}
.kp-trf-row{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.kp-trf-btn.sub{height:26px;padding:0 9px;font-size:11px}
.kp-trf-btn .dot{width:8px;height:8px;border-radius:50%}
.kp-trf-pop .leaflet-popup-content{margin:10px 12px;font-family:'Noto Sans KR',system-ui,sans-serif}`;
  document.head.appendChild(st);
}

// ─── 켜기/끄기(기기에 기억 · 열린 지도 모두 같이) ─────────────────────────────────
// 🚦 2026-11-23 기본은 숨김(사용자 요청: "교통정보가 너무 많아 — 누르면 나오게, 모든 지도") → 새 저장 이름으로 모두 꺼진 채 시작
const LS_KEY = "kp_traffic_layer_v2";
let _on = (() => { try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; } })();
const _onSubs = new Set();
export const isTrafficOn = () => _on;
export function setTrafficOn(v) {
  _on = !!v;
  try { localStorage.setItem(LS_KEY, _on ? "1" : "0"); } catch { /* 저장 못 해도 이번 화면은 적용 */ }
  _onSubs.forEach((fn) => { try { fn(); } catch { /* 무시 */ } });
}
export const subscribeTrafficOn = (fn) => { _onSubs.add(fn); return () => _onSubs.delete(fn); };
export function useTrafficOn() {
  const on = React.useSyncExternalStore(subscribeTrafficOn, isTrafficOn, isTrafficOn);
  return [on, setTrafficOn];
}

// 장기 공사 보기(기본 꺼짐 · 기기에 기억)
const LW_KEY = "kp_traffic_longwork";
let _lw = (() => { try { return localStorage.getItem(LW_KEY) === "1"; } catch { return false; } })();
export const isLongWorkOn = () => _lw;
export function setLongWorkOn(v) {
  _lw = !!v;
  try { localStorage.setItem(LW_KEY, _lw ? "1" : "0"); } catch { /* 무시 */ }
  _onSubs.forEach((fn) => { try { fn(); } catch { /* 무시 */ } });
}
export function useLongWorkOn() {
  const on = React.useSyncExternalStore(subscribeTrafficOn, isLongWorkOn, isLongWorkOn);
  return [on, setLongWorkOn];
}

// ─── 돌발상황 데이터(브라우저 하나에 하나 · 90초마다) ──────────────────────────────
const POLL_MS = 90 * 1000;
let _state = { status: "idle", items: [], at: 0, reason: "" }; // status: idle | loading | ok | no-key | error | unavailable
const _subs = new Set();
let _timer = null, _inflight = null;
const emit = () => _subs.forEach((fn) => { try { fn(); } catch { /* 무시 */ } });

// ─── ITS 부르기 ───────────────────────────────────────────────────────────────
// ITS가 클라우드 서버 접속을 막아서(2026-11-22) 브라우저가 직접 부른다. 키는 /api/traffic?kind=config 에서 한 번 받는다.
let _key = null; // null = 아직 · "" = 키 없음 · undefined = 이 사이트엔 중계 함수 없음
async function getKey() {
  if (_key !== null) return _key;
  const r = await fetch("/api/traffic?kind=config", { cache: "no-store" });
  if (r.status === 404 || !/json/.test(r.headers.get("content-type") || "")) { _key = undefined; return _key; }
  const j = await r.json();
  _key = j?.ok ? String(j.key || "") : "";
  return _key;
}
const isNative = () => typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.();
// 기사앱(안드로이드)은 네이티브 HTTP로(웹 보안 규칙 CORS 영향 없음), 브라우저는 fetch
async function getJson(url, ms = 12000) {
  if (isNative()) {
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.get({ url, connectTimeout: ms, readTimeout: ms });
      return typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    } catch { /* 아래 fetch 로 */ }
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    return JSON.parse(await r.text());
  } finally { clearTimeout(t); }
}

async function load() {
  if (_inflight) return _inflight;
  if (_state.status === "idle") { _state = { ..._state, status: "loading" }; emit(); }
  _inflight = (async () => {
    try {
      const key = await getKey();
      // 중계 함수가 없는 사이트(로지스웹 허브 등)에서는 버튼까지 숨긴다
      if (key === undefined) { _state = { status: "unavailable", items: [], at: Date.now(), reason: "" }; stop(); return; }
      if (!key) { _state = { status: "no-key", items: [], at: Date.now(), reason: "" }; return; }
      try {
        _state = { status: "ok", items: parseEvents(await getJson(eventsUrl(key))), at: Date.now(), reason: "" };
      } catch (direct) {
        // 직접 연결이 안 되면 서버로 한 번 더(나중에 고정 IP 중계를 붙이면 이쪽이 살아난다)
        const r = await fetch("/api/traffic?kind=events", { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (j?.ok) _state = { status: "ok", items: Array.isArray(j.items) ? j.items : [], at: Date.now(), reason: "" };
        else _state = { status: "error", items: _state.items, at: Date.now(), reason: `ITS 연결 실패 (${String(direct?.message || direct).slice(0, 80)})` };
      }
    } catch (e) {
      _state = { status: "error", items: _state.items, at: Date.now(), reason: String(e?.message || e) };
    } finally { _inflight = null; emit(); }
  })();
  return _inflight;
}
function start() {
  if (_timer || _state.status === "unavailable") return;
  if (!_state.at || Date.now() - _state.at > POLL_MS) load();
  _timer = setInterval(() => { if (typeof document === "undefined" || document.visibilityState !== "hidden") load(); }, POLL_MS);
}
function stop() { if (_timer) { clearInterval(_timer); _timer = null; } }

export function subscribeIncidents(fn) {
  _subs.add(fn);
  if (_subs.size === 1) start();
  return () => { _subs.delete(fn); if (!_subs.size) stop(); };
}
export const getIncidentState = () => _state;
export const refreshIncidents = () => load();

// enabled=false 면 받지 않는다(교통정보를 끈 지도)
const noopSub = () => () => {};
const EMPTY = { status: "off", items: [], at: 0, reason: "" };
export function useIncidents(enabled = true) {
  return React.useSyncExternalStore(enabled ? subscribeIncidents : noopSub, enabled ? getIncidentState : () => EMPTY, () => EMPTY);
}

// 지도 영역 + 확대 수준에 맞게 보여 줄 것만 — 멀리서 볼 땐 공사 · 기타는 숨겨 화면이 복잡하지 않게
export function visibleIncidents(items, bounds, zoom, { longWork = false, now = Date.now() } = {}) {
  if (!Array.isArray(items) || !items.length) return [];
  if (!longWork) items = items.filter((ev) => !isLongWork(ev, now));
  const pad = bounds ? Math.max(0.05, (bounds.north - bounds.south) * 0.1) : 0;
  const minor = zoom != null && zoom < 10;
  const out = items.filter((ev) => {
    if (bounds && (ev.lat < bounds.south - pad || ev.lat > bounds.north + pad || ev.lng < bounds.west - pad || ev.lng > bounds.east + pad)) return false;
    if (minor && !ev.blocked && (ev.kind === "work" || ev.kind === "etc")) return false;
    return true;
  });
  return out.slice(0, 400);
}

export function trafficStatusText(st) {
  if (!st) return "";
  if (st.status === "no-key") return "교통정보 연결 전 (ITS 인증키 필요)";
  if (st.status === "error") return "교통정보를 잠시 못 받았어요";
  if (st.status === "loading" || st.status === "idle") return "교통정보 불러오는 중";
  return "";
}

// ─── CCTV(사고 근처) ──────────────────────────────────────────────────────────
const _cctvCache = new Map();
export async function fetchCctvNear(lat, lng) {
  const k = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = _cctvCache.get(k);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.v;
  const key = await getKey().catch(() => "");
  if (!key) return { ok: false, reason: "no-key", items: [] };
  const r = 0.06, box = { minX: lng - r, maxX: lng + r, minY: lat - r, maxY: lat + r };
  const one = (type, cctvType) => getJson(cctvUrl(key, type, cctvType, box), 8000).then(parseCctv).catch(() => []);
  // 4 = 실시간 스트리밍(HTTPS) · 1 = 실시간 스트리밍(HLS). 로지스웹은 https 라 https 주소를 먼저.
  let list = (await Promise.all([one("ex", 4), one("its", 4)])).flat();
  if (!list.length) list = (await Promise.all([one("ex", 1), one("its", 1)])).flat();
  const items = list.map((c) => ({ ...c, km: distKm(lat, lng, c.lat, c.lng) })).sort((a, b) => a.km - b.km).slice(0, 12);
  const v = { ok: true, reason: "", items };
  if (items.length) _cctvCache.set(k, { at: Date.now(), v });
  return v;
}
