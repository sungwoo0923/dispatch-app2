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
export const pcBootStore = createMiniStore({ cache: {}, cacheCount: {}, server: {}, base: {}, added: 0, modified: 0, removed: 0 });

// 오더 실시간 구독 1개의 첫 진입 진행 추적기 — onSnapshot(..., { includeMetadataChanges: true }) 콜백 맨 앞에서 호출
// 저장본(캐시)을 먼저 보여준 경우, 서버와 맞춰질 때까지 들어온 변경(신규/수정/삭제)을 센다.
export function makeBootTracker(store, name) {
  let first = true;
  let hadCache = false;
  let synced = false;
  return (snap) => {
    const fromCache = snap.metadata.fromCache;
    if (first) {
      first = false;
      if (fromCache && snap.size > 0) hadCache = true;
      store.set((st) => ({ ...st, cache: { ...st.cache, [name]: true }, cacheCount: { ...st.cacheCount, [name]: snap.size } }));
    } else if (!synced && hadCache) {
      const c = { added: 0, modified: 0, removed: 0 };
      snap.docChanges().forEach((ch) => { c[ch.type] += 1; });
      if (c.added || c.modified || c.removed) store.set((st) => ({ ...st, added: st.added + c.added, modified: st.modified + c.modified, removed: st.removed + c.removed }));
    }
    if (!synced && !fromCache) {
      synced = true;
      store.set((st) => ({ ...st, server: { ...st.server, [name]: true }, cacheCount: { ...st.cacheCount, [name]: snap.size } }));
    }
  };
}

export function markBootBase(store, name) {
  if (store.get().base[name]) return;
  store.set((st) => ({ ...st, base: { ...st.base, [name]: true } }));
}
