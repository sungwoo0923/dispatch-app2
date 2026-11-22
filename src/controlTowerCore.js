// ======================= src/controlTowerCore.js =======================
// 🛰️ 2026-11-22 관제센터 1단계 — 차량 한 대의 관제 상태 판정(순수 계산 · 화면/DB 없음 · node 테스트 가능)
//
//  정상(초록) · 지연 예상(노랑) · 문제(빨강) · 신호 끊김(회색)
//   · 신호 끊김: 기사앱 위치가 15분 넘게 안 들어옴(liveState = stale)
//   · 문제:     가는 길 · 근처에 사고 / 통제 / 재난 / 돌발(고장 · 낙하물) · 예정에 없는 곳에서 40분 넘게 정차
//   · 지연 예상: 하차 약속 시간보다 10분 넘게 늦을 듯 · 상차 시간이 15분 넘게 지났는데 상차 전 ·
//               가는 길에 공사 · 기상 · 예정에 없는 곳에서 20분 넘게 정차
//  도착 예상은 1단계에서 직선거리 × 1.3 ÷ 평균 45km/h 로 어림한다(2단계에서 Tmap 실제 경로 시간으로 바꾼다).
import { distKm, incidentsNear, isSevere, kindMeta, isRelevant } from "./trafficCore.js";

export const LEVELS = {
  alert: { key: "alert", label: "문제", en: "ALERT", color: "#F87171", rank: 0 },
  delay: { key: "delay", label: "지연 예상", en: "DELAY", color: "#FBBF24", rank: 1 },
  lost:  { key: "lost",  label: "신호 끊김", en: "LOST", color: "#94A3B8", rank: 2 },
  ok:    { key: "ok",    label: "정상", en: "NORMAL", color: "#34D399", rank: 3 },
};
export const LEVEL_ORDER = ["alert", "delay", "lost", "ok"];

export const ROAD_FACTOR = 1.3;   // 직선 → 도로 거리
export const AVG_KMH = 45;        // 화물차 평균(시내 · 고속 섞어서)
export const LOADING_MIN = 30;    // 상차 작업
const STOP_DELAY_MIN = 20, STOP_ALERT_MIN = 40;
const AT_SITE_PHASES = new Set(["상차지진입", "상차지도착", "하차지진입", "하차지도착"]);

export const driveMin = (km) => Math.round((km * ROAD_FACTOR) / AVG_KMH * 60);

// "14:00" · "14시30분" · "오후 2시" · "2:30" → 하루 중 분. "당일" · "즉시" · "익일" 등은 null.
export function parseHm(v) {
  const s = String(v || "").trim();
  const m = s.match(/(오전|오후|AM|PM|am|pm)?\s*(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/);
  if (!m) return null;
  let h = Number(m[2]);
  const mm = m[3] ? Number(m[3]) : 0;
  if (/오후|pm/i.test(m[1] || "") && h < 12) h += 12;
  if (/오전|am/i.test(m[1] || "") && h === 12) h = 0;
  if (h > 24 || mm > 59) return null;
  return h * 60 + mm;
}
const ymd10 = (v) => { const s = String(v || "").trim().slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; };
export function kstToday(now = Date.now()) { return new Date(now + 9 * 3600e3).toISOString().slice(0, 10); }
// 날짜 + 시간 → ms(KST). 시간이 없으면 null
export function dueMs(date, time, now = Date.now()) {
  const min = parseHm(time);
  if (min == null) return null;
  const d = ymd10(date) || kstToday(now);
  const base = Date.parse(`${d}T00:00:00+09:00`);
  return Number.isFinite(base) ? base + min * 60000 : null;
}
export const hhmm = (ms) => {
  if (!ms) return "--:--";
  const d = new Date(ms + 9 * 3600e3);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
export const minText = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`);

// 정차 기억 — 화면이 열린 동안 차량별로 "멈춘 자리 · 멈춘 시각"을 들고 있는다(추가 읽기 없음)
//  300m 넘게 움직이거나 속도가 5km/h 이상이면 다시 센다.
export function updateStopMemo(memo, id, entry, now = Date.now()) {
  if (!entry || entry.lat == null) return null;
  const prev = memo.get(id);
  if ((entry.speed || 0) >= 5) { const v = { lat: entry.lat, lng: entry.lng, since: null }; memo.set(id, v); return v; }
  if (!prev || distKm(prev.lat, prev.lng, entry.lat, entry.lng) > 0.3) { const v = { lat: entry.lat, lng: entry.lng, since: now }; memo.set(id, v); return v; }
  if (prev.since == null) prev.since = now;
  return prev;
}

/**
 * 차량 한 대 판정
 * @param {object} p
 *  entry      { lat, lng, speed, updatedMs }
 *  live       liveState 값(live | recent | stale)
 *  order      지금 진행 중인 오더(없으면 null)
 *  phase      computeFleetPhase 결과(운송중 · 상차지도착 …)
 *  loaded     상차를 마쳤는지
 *  pickupGeo  { lat, lng } | null
 *  dropGeo    { lat, lng } | null
 *  events     교통 돌발 목록(trafficCore)
 *  stop       updateStopMemo 결과
 *  now
 */
export function classifyVehicle({ entry, live, order, phase, loaded, pickupGeo, dropGeo, events = [], stop, now = Date.now() }) {
  const reasons = [];
  const add = (level, text, extra) => reasons.push({ level, text, ...extra });
  const pos = entry && entry.lat != null ? { lat: entry.lat, lng: entry.lng } : null;
  const stale = live === "stale";

  if (stale) add("lost", `신호 끊김 · ${minText(Math.max(1, Math.round((now - (entry?.updatedMs || now)) / 60000)))}째`);

  // 가는 곳 — 상차 전이면 상차지, 상차 후면 하차지
  const target = loaded ? dropGeo : (pickupGeo || dropGeo);
  let near = [];
  if (pos && !stale && phase !== "하차지도착") {
    near = incidentsNear(events.filter((ev) => isRelevant(ev, now)), pos, target); // 장기 공사는 경보에서 뺀다
    for (const n of near.slice(0, 3)) {
      const m = kindMeta(n.ev);
      const where = n.where === "near" ? `근처 ${n.km < 1 ? `${Math.round(n.km * 1000)}m` : `${n.km.toFixed(1)}km`}` : `가는 길 ${n.km.toFixed(1)}km 앞`;
      add(isSevere(n.ev) ? "alert" : "delay", `${where} ${m.label}${n.ev.road ? ` (${n.ev.road})` : ""}`, { ev: n.ev });
    }
  }

  // 예정에 없는 정차
  if (!stale && stop?.since && !AT_SITE_PHASES.has(phase) && order) {
    const m = Math.round((now - stop.since) / 60000);
    if (m >= STOP_ALERT_MIN) add("alert", `예정에 없는 정차 ${minText(m)}`);
    else if (m >= STOP_DELAY_MIN) add("delay", `정차 ${minText(m)}째`);
  }

  // 도착 예상 · 약속 시간
  let etaDrop = null, dropDue = null, pickDue = null;
  if (order) {
    dropDue = dueMs(order.하차일 || order.상차일, order.하차시간, now);
    pickDue = dueMs(order.상차일, order.상차시간, now);
    // 하차일이 비어 있고 하차 시간이 상차 시간보다 이르면 다음 날 하차(야간 운행)로 본다
    if (dropDue && pickDue && !String(order.하차일 || "").trim() && dropDue < pickDue) dropDue += 86400000;
    if (pos && !stale && dropGeo) {
      if (loaded || !pickupGeo) etaDrop = now + driveMin(distKm(pos.lat, pos.lng, dropGeo.lat, dropGeo.lng)) * 60000;
      else {
        const toPick = AT_SITE_PHASES.has(phase) && /상차/.test(phase) ? 0 : driveMin(distKm(pos.lat, pos.lng, pickupGeo.lat, pickupGeo.lng));
        etaDrop = now + (toPick + LOADING_MIN + driveMin(distKm(pickupGeo.lat, pickupGeo.lng, dropGeo.lat, dropGeo.lng))) * 60000;
      }
    }
    if (etaDrop && dropDue && phase !== "하차지도착") {
      const late = Math.round((etaDrop - dropDue) / 60000);
      if (late > 10) add("delay", `하차 약 ${minText(late)} 늦을 듯 (약속 ${hhmm(dropDue)})`);
    }
    if (!loaded && pickDue && !/상차지도착/.test(phase || "")) {
      const over = Math.round((now - pickDue) / 60000);
      if (over > 15) add("delay", `상차 시간 ${minText(over)} 지남 (약속 ${hhmm(pickDue)})`);
    }
  }

  const level = reasons.length ? LEVEL_ORDER.find((l) => reasons.some((r) => r.level === l)) : "ok";
  reasons.sort((a, b) => LEVELS[a.level].rank - LEVELS[b.level].rank);
  return { level, reasons, near, etaDrop, dropDue, pickDue, target };
}

export function countLevels(list) {
  const c = { alert: 0, delay: 0, lost: 0, ok: 0 };
  for (const x of list) c[x.level] = (c[x.level] || 0) + 1;
  return c;
}
