// ======================= src/routeCarriers.js =======================
// ⭐ 2026-11-05 고정노선현황 › 운송업체 설정 — 정산·매출에 넣을 운송업체 고르기(회사별)
//  · 화주사 구글시트 배차표의 "운송업체" 칸은 양식 열(kind:"extra", 이름에 운송업체/운송사)이라
//    오더에는 추가정보["운송업체"](= 열 이름) 로 저장된다(functions/routeBoardSync.js fieldsOf · src/RouteBoard.jsx).
//  · 설정: routeCarrierSettings/{회사} = { companyName, carriers:[{ name, on, rate? }], removed:[이름], updatedAt, updatedBy }
//      rate = 💸 2026-11-09 수수료율(%) — 비어 있는 기사운임을 청구운임 × (1 − rate%)로 자동 계산(functions/carrierFareCore.mjs)
//      on:false(선택 해제) 또는 removed(삭제)인 운송업체의 고정노선 오더(배차표Id 있는 오더)는 정산·매출 계산에서 뺀다.
//  · 기본값: 설정을 한 번도 저장하지 않은 회사는 지금과 똑같이 전부 포함(필터 없음).
//    시트에 새로 생긴 업체(설정에 아직 없는 이름)는 포함한다.
//  · ⭐ 2026-11-06 설정을 한 번이라도 저장한 회사는 운송업체 칸이 빈 고정노선 오더를 끈 업체와 똑같이 뺀다(뺄 업체가 없어도).
//    (2026-11-07 규칙 점검 — 예전 머리말 "빈 오더도 포함"은 이 변경 전 설명이라 고쳤다)
//  · 일반 오더(배차표Id 없음)는 어떤 경우에도 영향 없음.
//  ⭐ 2026-11-06 끄거나 삭제한 업체의 오더는 정산·매출뿐 아니라 프로그램 어디에도 보이지 않게(isVisible = 같은 기준)
//    · PC: DispatchApp 데이터 입구(useRealtimeCollections 결과 바로 뒤)에서 한 번 거름 → 모든 화면·숫자·검색·엑셀이 그대로 따른다
//    · 모바일: MobileApp 오더 상태 바로 뒤에서 한 번 거름
//    · 시트 연동(서버)은 그대로 — 오더는 계속 맞춰지고 저장소에 남는다. 운송업체 설정 창만 숨긴 업체·건수를 보여 준다(다시 켤 수 있게)
import React from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { getTenant } from "./fsTenant";
import { db, auth } from "./firebase";
import { isDemoOn } from "./devDemoData";
import { cleanRate } from "../functions/carrierFareCore.mjs"; // 💸 2026-11-09 업체별 수수료율

const COL = "routeCarrierSettings";
const CARRIER_KEY_RE = /운송업체|운송사/;
export const carrierKey = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

// 오더의 운송업체(시트 "운송업체" 칸) — 없으면 ""
export function carrierOf(o) {
  const ex = o?.추가정보;
  if (ex && typeof ex === "object") {
    const direct = String(ex.운송업체 ?? "").trim();
    if (direct) return direct;
    for (const k of Object.keys(ex)) {
      if (CARRIER_KEY_RE.test(k)) { const v = String(ex[k] ?? "").trim(); if (v) return v; }
    }
  }
  return String(o?.운송업체 ?? "").trim();
}

// 설정 → 뺄 업체 열쇠 목록(정렬) — 비면 필터 없음
export function excludedKeysOf(setting) {
  if (!setting) return [];
  const list = Array.isArray(setting.carriers) ? setting.carriers : [];
  const off = new Set();
  (Array.isArray(setting.removed) ? setting.removed : []).forEach((n) => { const k = carrierKey(n); if (k) off.add(k); });
  list.forEach((c) => { const k = carrierKey(c?.name); if (!k) return; if (c.on === false) off.add(k); else off.delete(k); }); // 목록에 켜져 있으면(다시 추가) 살린다
  return [...off].sort();
}

// 정산·매출에 넣을 오더인지 판단하는 함수 — 뺄 업체가 없으면 null(= 전부 포함)
export function makeIsCountable(setting) {
  // ⭐ 2026-11-06 운송업체 칸이 빈 고정노선 오더 = 끈 업체와 똑같이 숨김·정산 제외(설정을 한 번이라도 저장한 회사만)
  if (!setting) return null;
  const off = new Set(excludedKeysOf(setting));
  return (o) => {
    if (!o?.배차표Id) return true; // 일반 오더는 그대로
    const c = carrierOf(o);
    if (!c) return false;
    return !off.has(carrierKey(c));
  };
}
const ALL = () => true;

// ── 회사별 설정 구독(같은 회사는 화면 여러 곳이 한 구독을 같이 쓴다) ──
const store = new Map(); // 회사 → { data, ready, subs:Set, unsub }
const demoMode = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };
const demoKey = (co) => `kpDemoRouteCarriers:${co}`;
function emit(e) { e.subs.forEach((fn) => { try { fn(); } catch { /* 무시 */ } }); }
function entryOf(co) {
  let e = store.get(co);
  if (e) return e;
  e = { data: null, ready: false, subs: new Set(), unsub: null };
  store.set(co, e);
  if (demoMode()) { // 🧪 개발 점검(/preview?demo=1) — 서버 대신 이 브라우저에만 저장
    try { e.data = JSON.parse(localStorage.getItem(demoKey(co)) || "null"); } catch { e.data = null; }
    e.ready = true;
    return e;
  }
  try {
    e.unsub = onSnapshot(doc(db, COL, co), (s) => { e.data = s?.exists?.() ? (s.data() || null) : null; e.ready = true; emit(e); },
      () => { e.ready = true; emit(e); }); // 못 읽으면(권한 등) 지금처럼 전부 포함
  } catch { e.ready = true; }
  return e;
}
const coOf = (company) => String(company || getTenant() || (() => { try { return localStorage.getItem("userCompany") || ""; } catch { return ""; } })() || "").trim();

export function useRouteCarrierSetting(company) {
  const co = coOf(company);
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (!co) return undefined;
    const e = entryOf(co);
    e.subs.add(force);
    force();
    return () => { e.subs.delete(force); };
  }, [co]);
  if (!co) return { company: "", setting: null, ready: true };
  const e = entryOf(co);
  return { company: co, setting: e.data, ready: e.ready };
}

// ⭐ 정산·매출 집계 입구에서 쓰는 훅 — { isCountable(order), active, sig, ready, filter(rows) }
export function useRouteCarrierFilter(company) {
  const { setting, ready, company: co } = useRouteCarrierSetting(company);
  return React.useMemo(() => {
    const pred = makeIsCountable(setting);
    const sig = excludedKeysOf(setting).join("|");
    // ⭐ 2026-11-06 isVisible — 화면에 보일 오더인지(정산·매출 포함 기준과 똑같다)
    return { company: co, ready, active: !!pred, sig, isCountable: pred || ALL, isVisible: pred || ALL, filter: (rows) => (pred && Array.isArray(rows) ? rows.filter(pred) : rows) };
  }, [setting, ready, co]);
}
// 행 목록을 바로 걸러 주는 훅(같은 배열이면 같은 결과 — 화면이 쓸데없이 다시 그려지지 않게)
export function useCountableRows(rows, company) {
  const f = useRouteCarrierFilter(company);
  return React.useMemo(() => f.filter(rows), [rows, f]);
}

export async function saveRouteCarrierSetting(company, { carriers = [], removed = [] }) {
  const co = coOf(company);
  if (!co) throw new Error("회사 정보가 없습니다");
  const seen = new Set();
  // 💸 2026-11-09 업체별 수수료율(rate, %) — 켜기/끄기와 상관없이 업체마다(functions/carrierFareCore.mjs)
  const clean = carriers.map((c) => { const rate = cleanRate(c?.rate); return { name: String(c?.name || "").trim(), on: c?.on !== false, ...(rate != null ? { rate } : {}) }; })
    .filter((c) => c.name && !seen.has(carrierKey(c.name)) && seen.add(carrierKey(c.name)));
  const live = new Set(clean.map((c) => carrierKey(c.name)));
  const rm = [...new Set(removed.map((n) => String(n || "").trim()).filter((n) => n && !live.has(carrierKey(n))))];
  const data = { companyName: co, carriers: clean, removed: rm, updatedAt: Date.now(), updatedBy: auth?.currentUser?.email || "" };
  if (demoMode()) {
    const e = entryOf(co);
    try { localStorage.setItem(demoKey(co), JSON.stringify(data)); } catch { /* 무시 */ }
    e.data = data; e.ready = true; emit(e);
    return data;
  }
  await setDoc(doc(db, COL, co), data);
  return data;
}

// 오더 목록에서 운송업체 이름 모으기(고정노선 오더만) — [{ name, count }] 많은 순
export function carriersInOrders(rows) {
  const m = new Map();
  (rows || []).forEach((o) => {
    if (!o?.배차표Id) return;
    const n = carrierOf(o); if (!n) return;
    const k = carrierKey(n);
    const e = m.get(k) || { name: n, count: 0 };
    e.count += 1; m.set(k, e);
  });
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}
