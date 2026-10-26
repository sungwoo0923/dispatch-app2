// ======================= src/bootProgress.js =======================
// ⭐ PC 첫 진입 로딩 화면(KpBootScreen) 진행 상황 — 실시간 구독들이 직접 여기에 기록하고,
// 로딩 화면만 이 값을 읽어 다시 그린다(본 화면 전체를 다시 그리지 않음).
import { useSyncExternalStore } from "react";

export function createMiniStore(init) {
  let v = init;
  const subs = new Set();
  return {
    get: () => v,
    set: (n) => { v = typeof n === "function" ? n(v) : n; subs.forEach((f) => f()); },
    sub: (f) => { subs.add(f); return () => subs.delete(f); },
  };
}
export const useMiniStore = (st) => useSyncExternalStore(st.sub, st.get);

// cache: 컬렉션별 폰/PC 저장본(캐시) 첫 응답 / server: 서버와 맞춰짐 / base: 기사·거래처 등 기본 데이터
export const pcBootStore = createMiniStore({ cache: {}, cacheCount: {}, todayCount: {}, server: {}, base: {}, added: 0, modified: 0, removed: 0 });
// 로딩 화면에 보여줄 "오늘(상차일) 오더" 건수 — KST 기준
const kstTodayStr = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const countToday = (snap) => { const t = kstTodayStr(); let n = 0; snap.docs.forEach((d) => { if (String(d.get("상차일") || "").slice(0, 10) === t) n += 1; }); return n; };

// ⭐ "수정"으로 세지 않을 시스템용 값 — 사람이 고친 게 아니라 서버가 자동으로 바꾸는 값들.
// 예) 오더 1건을 등록하면 구글시트 자동 연동이 시트에 줄을 끼워 넣으면서 그 아래 오더 수십 건의
// "_gsheetSync(시트 줄번호)"를 1씩 민다 → 아무도 안 고쳤는데 "수정 20"으로 보였다.
const SYSTEM_KEYS = new Set(["_gsheetSync", "_lastModified", "updatedAt", "urgentPushSentAt", "_id", "id", "__col"]);
const norm = (v) => {
  if (v == null) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (Array.isArray(v)) return v.map(norm);
  if (typeof v === "object") {
    const o = {};
    Object.keys(v).sort().forEach((k) => { o[k] = norm(v[k]); });
    return o;
  }
  return v;
};
// 사람이 볼 만한 내용이 실제로 바뀌었는지(시스템용 값만 바뀐 건 false)
export function isMeaningfulChange(prev, next) {
  if (!prev || !next) return true;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) {
    if (SYSTEM_KEYS.has(k)) continue;
    if (JSON.stringify(norm(prev[k])) !== JSON.stringify(norm(next[k]))) return true;
  }
  return false;
}

// 오더 실시간 구독 1개의 첫 진입 진행 추적기 — onSnapshot(..., { includeMetadataChanges: true }) 콜백 맨 앞에서 호출
// 저장본(캐시)을 먼저 보여준 경우, 서버와 맞춰질 때까지 들어온 변경(신규/수정/삭제)을 센다.
export function makeBootTracker(store, name) {
  let first = true;
  let hadCache = false;
  let synced = false;
  const prevData = new Map(); // 서버와 맞춰지기 전까지 직전 내용(수정 여부 비교용)
  return (snap) => {
    const fromCache = snap.metadata.fromCache;
    if (first) {
      first = false;
      if (fromCache && snap.size > 0) hadCache = true;
      if (hadCache) snap.docs.forEach((d) => prevData.set(d.id, d.data()));
      store.set((st) => ({ ...st, cache: { ...st.cache, [name]: true }, cacheCount: { ...st.cacheCount, [name]: snap.size }, todayCount: { ...st.todayCount, [name]: countToday(snap) } }));
    } else if (!synced && hadCache) {
      const c = { added: 0, modified: 0, removed: 0 };
      snap.docChanges().forEach((ch) => {
        const next = ch.type === "removed" ? null : ch.doc.data();
        if (ch.type !== "modified" || isMeaningfulChange(prevData.get(ch.doc.id), next)) c[ch.type] += 1;
        if (next) prevData.set(ch.doc.id, next); else prevData.delete(ch.doc.id);
      });
      if (c.added || c.modified || c.removed) store.set((st) => ({ ...st, added: st.added + c.added, modified: st.modified + c.modified, removed: st.removed + c.removed }));
    }
    if (!synced && !fromCache) {
      synced = true;
      prevData.clear();
      store.set((st) => ({ ...st, server: { ...st.server, [name]: true }, cacheCount: { ...st.cacheCount, [name]: snap.size }, todayCount: { ...st.todayCount, [name]: countToday(snap) } }));
    }
  };
}

export function markBootBase(store, name) {
  if (store.get().base[name]) return;
  store.set((st) => ({ ...st, base: { ...st.base, [name]: true } }));
}
