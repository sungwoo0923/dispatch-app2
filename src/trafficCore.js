// ======================= src/trafficCore.js =======================
// 🚦 2026-11-22 관제센터 1단계 — 교통 돌발상황(사고 · 공사 · 통제) 공용 데이터
//  · 모든 지도(Leaflet · Tmap · PC · 모바일)가 이 모듈 하나를 같이 쓴다.
//  · 데이터: /api/traffic?kind=events (국가교통정보센터 ITS 전국 돌발상황 — 서버가 대신 받아 1분 캐시)
//    → 지도가 몇 개 열려 있어도 브라우저당 90초에 1번만 받는다(구독자가 없으면 멈춘다).
//  · 켜기/끄기: 지도 위 [교통정보] 버튼. 이 기기에 기억하고, 열린 지도 전부에 같이 적용된다.
import React from "react";

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
.kp-trf-btn .dot{width:8px;height:8px;border-radius:50%}
.kp-trf-pop .leaflet-popup-content{margin:10px 12px;font-family:'Noto Sans KR',system-ui,sans-serif}`;
  document.head.appendChild(st);
}

// ─── 켜기/끄기(기기에 기억 · 열린 지도 모두 같이) ─────────────────────────────────
const LS_KEY = "kp_traffic_layer";
let _on = (() => { try { return localStorage.getItem(LS_KEY) !== "0"; } catch { return true; } })();
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

// ─── 돌발상황 데이터(브라우저 하나에 하나 · 90초마다) ──────────────────────────────
const POLL_MS = 90 * 1000;
let _state = { status: "idle", items: [], at: 0, reason: "" }; // status: idle | loading | ok | no-key | error | unavailable
const _subs = new Set();
let _timer = null, _inflight = null;
const emit = () => _subs.forEach((fn) => { try { fn(); } catch { /* 무시 */ } });

async function load() {
  if (_inflight) return _inflight;
  if (_state.status === "idle") { _state = { ..._state, status: "loading" }; emit(); }
  _inflight = (async () => {
    try {
      const r = await fetch("/api/traffic?kind=events", { cache: "no-store" });
      // 중계 함수가 없는 사이트(로지스웹 허브 등)에서는 버튼까지 숨긴다
      if (r.status === 404 || !/json/.test(r.headers.get("content-type") || "")) { _state = { status: "unavailable", items: [], at: Date.now(), reason: "" }; stop(); return; }
      const j = await r.json();
      if (j?.ok) _state = { status: "ok", items: Array.isArray(j.items) ? j.items : [], at: Date.now(), reason: "" };
      else _state = { status: j?.reason === "no-key" ? "no-key" : "error", items: _state.items, at: Date.now(), reason: j?.message || j?.reason || "" };
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
export function visibleIncidents(items, bounds, zoom) {
  if (!Array.isArray(items) || !items.length) return [];
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
  const r = await fetch(`/api/traffic?kind=cctv&lat=${lat}&lng=${lng}&r=0.06`);
  const j = await r.json();
  const v = { ok: !!j?.ok, reason: j?.reason || "", items: (j?.items || []).map((c) => ({ ...c, km: distKm(lat, lng, c.lat, c.lng) })) };
  _cctvCache.set(k, { at: Date.now(), v });
  return v;
}
