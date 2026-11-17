// ======================= src/routePreset.js =======================
// ⭐ 2026-11-17 노선별 고정 특수운임 — 화면 쪽(구독 · 저장 · 오더에 적용). 계산 규칙은 functions/routePresetCore.mjs(서버 · 테스트 공용)
//  · 저장: forkliftPresets/{회사__rt__거래처__상차지__하차지} (v2 문서) — 예전 "상차지 기억"(v1) 문서도 같은 컬렉션에서 읽는다
//  · 적용: applyRoutePresets(오더, 프리셋 목록) → 맞는 노선 항목을 특수운임에 넣고(auto 표시) 청구 · 기사운임 · 수수료를 forkliftCore 규칙으로 맞춘다
//    (PC 오더등록 · 복사 · 수정 팝업 · 모바일은 [특수운임] 버튼(SpecialFareButton)이 노선이 바뀔 때 · 저장 때는 addDispatch · 모바일 saveOne 이 한 번 더)
import React from "react";
import { collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db, auth } from "./firebase";
import { getTenant } from "./fsTenant";
import { parsePresetDoc, presetDocId, presetDocData } from "../functions/routePresetCore.mjs";
import { applyRoutePresets } from "./routePresetApply.js";

export * from "../functions/routePresetCore.mjs";
export { applyRoutePresets };

const COL = "forkliftPresets";

// ── 회사 프리셋 구독(한 번만 · 여러 화면 공용) ──
let cache = null; let cacheCo = ""; const subs = new Set(); let unsub = null; let readyWaiters = [];
function ensureSub() {
  const co = getTenant() || "";
  if (unsub && co === cacheCo) return;
  if (unsub) { try { unsub(); } catch { /* 무시 */ } unsub = null; cache = null; }
  cacheCo = co;
  try {
    unsub = onSnapshot(collection(db, COL), (s) => {
      cache = s.docs.map((d) => parsePresetDoc(d.data() || {}, d.id));
      subs.forEach((f) => f(cache)); readyWaiters.forEach((f) => f(cache)); readyWaiters = [];
    }, () => { cache = cache || []; subs.forEach((f) => f(cache)); readyWaiters.forEach((f) => f(cache)); readyWaiters = []; });
  } catch { cache = []; }
}
export function useRoutePresets() {
  const [list, setList] = React.useState(cache || []);
  React.useEffect(() => {
    subs.add(setList); ensureSub(); if (cache) setList(cache);
    return () => { subs.delete(setList); if (!subs.size && unsub) { unsub(); unsub = null; cache = null; } };
  }, []);
  return list;
}
// 지금 있는 목록(없으면 빈 배열) · 기다리기(최대 ms)
export const routePresetsNow = () => { ensureSub(); return cache || []; };
export function routePresetsReady(ms = 1500) {
  ensureSub();
  if (cache) return Promise.resolve(cache);
  return new Promise((res) => { const t = setTimeout(() => res(cache || []), ms); readyWaiters.push((v) => { clearTimeout(t); res(v); }); });
}
// 저장할 때 한 번 더(노선이 맞는 프리셋이 있으면 넣는다 · 실패해도 오더 등록은 그대로)
export async function withRoutePresets(order, opts) {
  try {
    if (!order || order.특수운임수동 === true) return order;
    const list = await routePresetsReady();
    return list.length ? applyRoutePresets(order, list, opts) : order;
  } catch { return order; }
}

// ── 저장 · 삭제 ──
const by = () => auth?.currentUser?.displayName || (auth?.currentUser?.email || "").split("@")[0] || "";
export async function saveRoutePreset(p, { oldId = "" } = {}) {
  const co = getTenant() || "";
  const id = presetDocId(co, p);
  await setDoc(doc(db, COL, id), { ...presetDocData(p), ...(co ? { companyName: co } : {}), updatedBy: by(), updatedAt: serverTimestamp() });
  if (oldId && oldId !== id) await deleteDoc(doc(db, COL, oldId)).catch(() => {});
  return id;
}
export const deleteRoutePreset = (id) => deleteDoc(doc(db, COL, id));
export const routePresetIdOf = (p) => presetDocId(getTenant() || "", p);

// ── 기존 자료(지난 오더) 읽기 — 상차일이 months 개월 안인 이 회사 오더(orders · dispatch) ──
export async function loadSeedOrders(months = 6) {
  const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() - months);
  const from = d.toISOString().slice(0, 10);
  const out = []; const seen = new Set();
  for (const col of ["orders", "dispatch"]) {
    try {
      const s = await getDocs(query(collection(db, col), where("상차일", ">=", from)));
      s.docs.forEach((x) => { if (seen.has(x.id)) return; seen.add(x.id); out.push({ _id: x.id, ...x.data() }); });
    } catch (e) { if (col === "orders") throw e; }
  }
  return { orders: out, from };
}
