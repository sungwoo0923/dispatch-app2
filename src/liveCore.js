// ======================= src/liveCore.js =======================
// ⭐ 2026-11-06 실시간 관제 공용 조각(Firebase를 쓰지 않는 순수 코드) — 배차 프로그램(liveFleet.jsx · LiveFleetMaps.jsx)과
//  로지스웹 허브(cafe-site/src/hub/HubLiveTrack.jsx)가 같은 상태 판정 · 시계 · 스타일을 쓴다. liveFleet.jsx가 그대로 다시 내보낸다.
import React from "react";

export const LIVE_MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";

export function liveTsMs(t) {
  if (!t) return 0;
  if (typeof t === "number") return t;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  if (typeof t === "string") { const n = Date.parse(t); return Number.isFinite(n) ? n : 0; }
  return 0;
}

// ─── 상태 판정 ───────────────────────────────────────────────────────────────
export const LIVE_FRESH_MS = 3 * 60 * 1000;   // 3분 안 = LIVE(기사앱이 30초마다 갱신)
export const LIVE_RECENT_MS = 15 * 60 * 1000; // 15분 안 = 최근
export const LIVE_HIDE_MS = 24 * 3600 * 1000; // 하루 넘게 위치가 없으면 표시 안 함(앱을 안 쓴 날)

export function liveState(entry, now = Date.now()) {
  if (!entry) return "none";
  const age = now - (entry.updatedMs || 0);
  if (!entry.updatedMs || age > LIVE_HIDE_MS) return "none";
  if (age <= LIVE_FRESH_MS) return "live";
  if (age <= LIVE_RECENT_MS) return "recent";
  return "stale";
}

export function liveAgeText(ms, now = Date.now()) {
  if (!ms) return "-";
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 45) return "방금";
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(1, m)}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}
export const LIVE_COLORS = { live: "#34D399", recent: "#67E8F9", stale: "#64748B" };

// ─── 공용 시계(LIVE 표시의 "N분 전"만 갱신 — 화면 전체에 타이머 1개) ─────────────
let _now = Date.now();
const _tickSubs = new Set();
let _tickTimer = null;
function tickSubscribe(fn) {
  _tickSubs.add(fn);
  if (!_tickTimer) {
    _tickTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      _now = Date.now();
      _tickSubs.forEach((f) => { try { f(); } catch { /* 무시 */ } });
    }, 15000);
  }
  return () => {
    _tickSubs.delete(fn);
    if (!_tickSubs.size && _tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
  };
}
export function useLiveNow() {
  return React.useSyncExternalStore(tickSubscribe, () => _now, () => _now);
}

// ─── 스타일(한 번만 넣음) ─────────────────────────────────────────────────────
let _styled = false;
export function ensureLiveStyles() {
  if (_styled || typeof document === "undefined") return;
  _styled = true;
  const s = document.createElement("style");
  s.setAttribute("data-kp", "live-fleet");
  s.textContent = `
@keyframes kpLivePing{0%{transform:scale(1);opacity:.75}80%,100%{transform:scale(2.6);opacity:0}}
@keyframes kpLiveIn{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
@keyframes kpLiveFade{from{opacity:0}to{opacity:1}}
@keyframes kpLiveSheet{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes kpLiveScan{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}
.kp-live-dot{position:relative;display:inline-block;width:7px;height:7px;border-radius:999px;flex-shrink:0}
.kp-live-dot.on::after{content:"";position:absolute;inset:0;border-radius:999px;background:inherit;animation:kpLivePing 1.8s cubic-bezier(0,0,.2,1) infinite}
.kp-live-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 7px 0 6px;border-radius:8px;vertical-align:middle;white-space:nowrap;cursor:pointer;
  background:linear-gradient(180deg,#14203A,#0B1428);border:1px solid #2D4C82;color:#fff;box-shadow:0 1px 2px rgba(11,20,40,.25),inset 0 1px 0 rgba(255,255,255,.06);transition:transform .12s,box-shadow .12s,border-color .12s}
.kp-live-chip:hover{border-color:#8FB0F0;box-shadow:0 0 0 3px rgba(143,176,240,.18),0 4px 10px rgba(11,20,40,.3)}
.kp-live-chip:active{transform:scale(.96)}
.kp-live-chip .t{font-family:${LIVE_MONO};font-size:9.5px;font-weight:800;letter-spacing:.14em;line-height:1}
.kp-live-chip .a{font-family:${LIVE_MONO};font-size:10px;font-weight:700;color:#8FB0F0;line-height:1;font-variant-numeric:tabular-nums}
.kp-live-chip.m{height:26px;padding:0 9px 0 8px;border-radius:10px}
.kp-live-chip.m .t{font-size:10px}.kp-live-chip.m .a{font-size:10.5px}
.kp-live-chip.c{height:20px;padding:0 6px 0 5px;gap:4px;border-radius:999px}
.kp-live-chip.c .a{font-size:10.5px;color:#CFE0FF}
.kp-live-anchor{position:relative;display:inline-block;width:0;height:0;vertical-align:middle;overflow:visible}
.kp-live-pin{position:absolute;top:-21px;left:-6px;width:14px;height:14px;padding:0;margin:0;border:0;background:transparent;display:grid;place-items:center;border-radius:999px;cursor:pointer;z-index:2;line-height:0}
.kp-live-pin .kp-live-dot{width:6px;height:6px;box-shadow:0 0 0 1.5px #fff,0 0 0 2.5px rgba(11,20,40,.18)}
.kp-live-pin:hover{background:rgba(52,211,153,.16)}
.kp-live-pin:hover .kp-live-dot{transform:scale(1.25)}
.kp-live-pin:focus-visible{outline:2px solid #8FB0F0;outline-offset:1px}
.kp-live-btn{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;flex-shrink:0;cursor:pointer;font-weight:800;color:#fff;
  background:linear-gradient(135deg,#1B2B4B 0%,#0B1428 100%);border:1px solid #2D4C82;box-shadow:0 2px 6px rgba(11,20,40,.25),inset 0 1px 0 rgba(255,255,255,.08);transition:box-shadow .15s,border-color .15s}
.kp-live-btn:hover{border-color:#8FB0F0;box-shadow:0 0 0 3px rgba(143,176,240,.16),0 4px 12px rgba(11,20,40,.3)}
.kp-live-btn .n{font-family:${LIVE_MONO};font-variant-numeric:tabular-nums;font-weight:800;color:#CFE0FF;background:rgba(143,176,240,.14);border-radius:6px;padding:0 5px;line-height:16px;font-size:10.5px}
`;
  document.head.appendChild(s);
}

