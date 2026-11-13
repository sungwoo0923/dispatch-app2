// ======================= src/orderHistoryCache.js =======================
// ⚡ 2026-11-13 예전 오더(13개월) PC 보관 — 매번 전부 다시 받지 않게
//  예전: PC를 열 때마다(새로고침 포함) 13개월 오더 전체를 서버에서 다시 받았다 → 오더 1만 건이면 매번 약 28MB · 1만 건 읽기
//  이제: 한 번 받은 것은 이 PC(IndexedDB)에 두고, 다음부터는 "그 뒤에 바뀐 오더 · 지워진 오더"만 받아 합친다
//   · 회사별로 따로 보관(다른 회사 것과 섞이지 않게) · 로그인 계정이 바뀌어도 회사가 같으면 같이 쓴다(읽기 권한은 서버 규칙이 그대로 지킨다)
//   · 초기화 · 복원 · 가져오기 취소(dataVersion 변경)나 3일이 지나면 전체를 새로 받는다(수정 시각 없이 저장된 변경까지 맞추기 위해)
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "./firebase";

const DB_NAME = "kpOrderHistory"; const STORE = "full"; const VER = 1;
export const HISTORY_CACHE_MAX_AGE = 3 * 86400000;

function openDb() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idb(mode, fn) {
  const d = await openDb();
  try { return await new Promise((res, rej) => { const tx = d.transaction(STORE, mode); const rq = fn(tx.objectStore(STORE)); tx.oncomplete = () => res(rq?.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }
  finally { d.close(); }
}
// Firestore 시각(Timestamp)은 그대로 저장하면 모양이 깨져서 숫자로 바꿔 두었다가 꺼낼 때 되돌린다
const pack = (v) => {
  if (v instanceof Timestamp) return { __kpTs: v.toMillis() };
  if (Array.isArray(v)) return v.map(pack);
  if (v && typeof v === "object") { const o = {}; for (const k in v) { const x = v[k]; if (typeof x !== "function") o[k] = pack(x); } return o; }
  return v;
};
const unpack = (v) => {
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = unpack(v[i]); return v; }
  if (v && typeof v === "object") { if (typeof v.__kpTs === "number") return Timestamp.fromMillis(v.__kpTs); for (const k in v) v[k] = unpack(v[k]); return v; }
  return v;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

// → { savedAt, fullAt, dv, hStart, liveStart, docs: [{ col, id, data }] } | null
export async function readHistoryCache(company) {
  if (!company || typeof indexedDB === "undefined") return null;
  try {
    const c = await idb("readonly", (s) => s.get(company));
    if (!c || c.v !== VER || !Array.isArray(c.docs)) return null;
    for (let i = 0; i < c.docs.length; i++) { if (i && i % 1500 === 0) await tick(); c.docs[i].data = unpack(c.docs[i].data); }
    return c;
  } catch { return null; }
}
export async function writeHistoryCache(company, meta, docs) {
  if (!company || typeof indexedDB === "undefined") return;
  try {
    const out = new Array(docs.length);
    for (let i = 0; i < docs.length; i++) { if (i && i % 1500 === 0) await tick(); out[i] = { col: docs[i].col, id: docs[i].id, data: pack(docs[i].data) }; }
    await idb("readwrite", (s) => s.put({ v: VER, ...meta, docs: out }, company));
  } catch { /* 저장 공간 부족 등 — 보관 없이 예전처럼 동작 */ }
}
export async function clearHistoryCache(company) { try { await idb("readwrite", (s) => (company ? s.delete(company) : s.clear())); } catch { /* 무시 */ } }

// 보관해 둔 시각(since) 뒤에 바뀐 오더 · 지워진 오더만 받는다 → { changed: [{col,id,data}], deleted: ["col/id"] }
//  수정 시각 칸이 서버시각/숫자 두 형식이라 둘 다(실시간 맞춤 subscribeOrderSync 와 같은 기준) + gap(보관 때의 실시간 범위 시작 ~ 지금 실시간 범위 시작) 날짜 구간 전체
export async function fetchHistoryDelta({ since, gapFrom, gapTo }) {
  const t = since - 10 * 60 * 1000; const ts = Timestamp.fromMillis(t);
  const changed = new Map();
  const add = (col, snap) => snap.docs.forEach((d) => changed.set(`${col}/${d.id}`, { col, id: d.id, data: d.data() || {} }));
  const jobs = [];
  ["orders", "dispatch"].forEach((col) => {
    [where("updatedAt", ">=", t), where("updatedAt", ">=", ts), where("_lastModified", ">=", t), where("createdAt", ">=", t), where("createdAt", ">=", ts)]
      .forEach((w) => jobs.push(getDocs(query(collection(db, col), w)).then((s) => add(col, s))));
    if (gapFrom && gapTo && gapFrom < gapTo) jobs.push(getDocs(query(collection(db, col), where("상차일", ">=", gapFrom), where("상차일", "<", gapTo))).then((s) => add(col, s)));
  });
  let deleted = [];
  jobs.push(getDocs(query(collection(db, "deletedOrders"), where("at", ">=", ts))).then((s) => { deleted = s.docs.map((d) => d.data() || {}).filter((x) => x.col && x.id).map((x) => `${x.col}/${x.id}`); }));
  await Promise.all(jobs); // 하나라도 실패하면 예외 → 호출한 쪽이 전체를 새로 받는다
  return { changed: [...changed.values()], deleted };
}
