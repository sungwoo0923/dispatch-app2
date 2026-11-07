// src/companyColStore.js
// ⭐ 2026-11-06 자금현황·수입/지출 장부 속도 — 같은 회사 컬렉션(acctLedger·acctFunds·acctRecurring)을
//   화면마다 따로 구독하던 것을 한 곳에서 한 번만 구독하고 함께 쓴다.
//   · 자금 현황 ↔ 수입·지출 장부 탭을 오가거나, 경리 대시보드(useFundsSummary)에서 넘어와도 다시 받지 않는다
//   · 화면을 닫아도 3분 동안은 구독을 유지 → 다시 열면 바로 보인다(그 사이 바뀐 내용도 실시간 반영)
//   · 장부 문서에는 영수증 사진(base64)이 들어 있어 무겁다 — 여러 번 내려받지 않는 것이 가장 큰 효과
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";

const LINGER_MS = 3 * 60 * 1000;
const stores = new Map(); // key → { rows, listeners:Set, unsub, timer }

function getStore(name, company, field) {
  const key = `${name}|${field}|${company}`;
  let st = stores.get(key);
  if (!st) {
    st = { rows: null, listeners: new Set(), unsub: null, timer: null };
    stores.set(key, st);
  }
  return st;
}
function start(st, name, company, field) {
  if (st.unsub) return;
  st.unsub = onSnapshot(query(collection(db, name), where(field, "==", company)),
    (s) => { st.rows = s.docs.map((d) => ({ id: d.id, ...d.data() })); st.listeners.forEach((f) => f()); },
    () => { st.rows = st.rows || []; st.listeners.forEach((f) => f()); });
}

export function useCompanyRows(name, company, field = "companyName") {
  const co = String(company || "").trim();
  const st = co ? getStore(name, co, field) : null;
  const subscribe = React.useCallback((cb) => {
    if (!st) return () => {};
    clearTimeout(st.timer); st.timer = null;
    st.listeners.add(cb);
    start(st, name, co, field);
    return () => {
      st.listeners.delete(cb);
      if (!st.listeners.size) {
        st.timer = setTimeout(() => { if (!st.listeners.size && st.unsub) { st.unsub(); st.unsub = null; } }, LINGER_MS);
      }
    };
  }, [st, name, co, field]);
  const get = React.useCallback(() => (st ? st.rows : null), [st]);
  return React.useSyncExternalStore(subscribe, get, get);
}
