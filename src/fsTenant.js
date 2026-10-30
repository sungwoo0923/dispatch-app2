// ======================= src/fsTenant.js =======================
// 🏢 운송사(회사)별 데이터 분리 — 2026-10-30
//  오더·기사·거래처·하차지 등은 모든 운송사가 같은 저장소를 쓰고, 문서마다 companyName(회사)이
//  적혀 있다. 그런데 화면들이 회사를 거르지 않고 읽어서, 새 운송사에 다른 운송사 오더·지입차가 보였다.
//  화면 코드 수백 곳을 하나하나 고치는 대신, 앱 전체의 "firebase/firestore"를 이 파일로 바꿔 끼워
//  (vite alias) 한 곳에서 처리한다.
//   ① 읽기: 회사 데이터 컬렉션의 목록 조회(onSnapshot·getDocs)에서 다른 회사 문서를 빼고 넘긴다.
//   ② 쓰기: 새로 만드는 문서(addDoc·setDoc·batch.set)에 회사명이 없으면 지금 회사를 적는다.
//  회사가 정해지지 않은 화면(로그인 전 업로드 링크, 화주사 화면, 관리자 관리센터)은 거르지 않는다.
//  ⚠️ 회사명이 없는 예전 문서는 기본 회사(DEFAULT_COMPANY)의 것으로 본다(엄격 컬렉션).
//     기사앱 위치·로그처럼 서버/네이티브가 회사명 없이 쓰는 기록은 "회사명이 다를 때만" 뺀다(느슨한 컬렉션).
import * as base from "kp-firestore-base";

export * from "kp-firestore-base";

const DEFAULT_CO = "돌캐";
// 회사명이 없으면 기본 회사로 보는 컬렉션
const STRICT = new Set([
  "orders", "dispatch", "dispatch_test", "drivers", "clients", "places", "fixedClients", "users", "recurringOrders",
  "deletedOrders", "driver_completed_archive",
  // 사내 업무(공지·일정·인수인계·게시판·전자결재·메일·인사·근태 신청·회계)
  "notices", "schedules", "handovers", "boardPosts", "approvals", "approvalLines", "notifications",
  "scheduledEmails", "emailLogs", "hrResumes", "attendanceRequests", "attendanceChangeRequests", "acctPayments",
]);
// 회사명이 있을 때만 비교하는 컬렉션 — 서버(Cloud Functions)·기사앱 네이티브가 회사명 없이 쓰는 기록
const LOOSE = new Set([
  "driver_logs", "gps_tracks", "liveLocations", "driver_photo_logs", "driver_documents", "driver_notifications",
  "location_change_requests", "emergency_alerts", "collision_alerts", "cargo_temp", "cargo_camera",
  "deliverySignatureHistory", "attendance", "holidays", "driver_uploads", "fleet_settings", "importBatches",
]);
// 서버 조회에 회사 조건을 붙일 컬렉션(직원 목록은 화주사 연동 때문에 화면에서만 거름)
const INJECT = new Set([...STRICT].filter((c) => c !== "users"));
// 쓸 때 회사명을 붙일 컬렉션(users는 가입·승인에서 따로 정하므로 제외)
const STAMP = new Set([...STRICT, ...LOOSE].filter((c) => c !== "users"));

let tenant = "";      // 지금 회사 — 비면 거르지 않음
let bypass = 0;       // 관리자 관리센터처럼 전체를 봐야 하는 화면(>0이면 거르지 않음)
const norm = (v) => String(v ?? "").trim();
export function setTenant(co) { tenant = norm(co); }
// 🔒 2단계(서버 규칙 잠금) — 예전 문서에 회사명을 다 채운 뒤(관리센터 › 운송사 분리) 켜진다.
//  켜지면 회사 데이터 조회에 "companyName == 우리 회사" 조건을 붙여 서버에서부터 우리 회사 것만 받는다
//  (서버 규칙이 회사가 다른 조회를 거부하므로 반드시 필요).
let serverFilter = (() => { try { return localStorage.getItem("kpServerFilter") === "1"; } catch { return false; } })();
export function setServerFilter(on) { serverFilter = !!on; try { localStorage.setItem("kpServerFilter", on ? "1" : "0"); } catch { /* 무시 */ } }
export const isServerFilterOn = () => serverFilter;
export function getTenant() { return bypass > 0 ? "" : tenant; }
export function pushTenantBypass() { bypass += 1; return () => { bypass = Math.max(0, bypass - 1); }; }

// 컬렉션 이름(최상위 컬렉션만) — 실제 SDK와 점검용 가짜 SDK 모두 지원
function topCollectionId(ref) {
  if (!ref) return "";
  try {
    if (ref.type === "collection") return ref.parent ? "" : ref.id;
    if (ref.type === "query") {
      const q = ref._query;
      if (q?.collectionGroup) return "";
      const p = q?.path;
      if (p && typeof p.length === "number") return p.length === 1 ? p.lastSegment() : "";
    }
    if (Array.isArray(ref.__segs)) return ref.__segs.length === 1 ? ref.__segs[0] : "";
  } catch { /* 모르면 거르지 않음 */ }
  return "";
}
function docCollectionId(ref) {
  try {
    if (ref?.type === "document") return ref.parent && !ref.parent.parent ? ref.parent.id : "";
    if (Array.isArray(ref?.__segs)) return ref.__segs.length === 2 ? ref.__segs[0] : "";
  } catch { /* 무시 */ }
  return "";
}

function keeper(col) {
  const t = getTenant();
  if (!t) return null;
  if (STRICT.has(col)) {
    return (d) => {
      let c;
      try { c = d.get("companyName"); } catch { c = undefined; }
      // 화주사 계정은 여러 운송사와 연동되는 거래 상대라 목록에서 빼지 않는다(화면이 연동된 곳만 다시 거름)
      if (col === "users") { try { if (d.get("role") === "shipper") return true; } catch { /* 무시 */ } }
      // 화주사가 등록한 오더는 company(=받는 운송사)에 회사가 적혀 있다
      if (!norm(c)) { try { c = d.get("company") || d.get("운송사명"); } catch { /* 무시 */ } }
      return (norm(c) || DEFAULT_CO) === t;
    };
  }
  if (LOOSE.has(col)) {
    return (d) => {
      let c;
      try { c = d.get("companyName"); } catch { c = undefined; }
      return !norm(c) || norm(c) === t;
    };
  }
  return null;
}

// 걸러낸 QuerySnapshot — 화면 코드가 쓰는 모양(docs·size·empty·forEach·docChanges·metadata·query) 그대로
function wrapSnap(snap, keep) {
  if (!snap || !keep) return snap;
  const docs = snap.docs.filter(keep);
  if (docs.length === snap.docs.length) return snap;
  return {
    docs, size: docs.length, empty: docs.length === 0,
    forEach: (fn, thisArg) => docs.forEach(fn, thisArg),
    docChanges: (opts) => snap.docChanges(opts).filter((ch) => keep(ch.doc)),
    metadata: snap.metadata, query: snap.query,
    isEqual: (o) => snap.isEqual?.(o),
  };
}

// 회사 조건을 붙인 조회 — 색인이 아직 없으면(failed-precondition) 조건 없이 다시 해서 화면이 비지 않게 한다
function injected(ref) {
  const t = getTenant();
  if (!serverFilter || !t) return null;
  const col = topCollectionId(ref);
  if (!INJECT.has(col)) return null;
  try { return base.query(ref, base.where("companyName", "==", t)); } catch { return null; }
}
const needsIndex = (e) => e && (e.code === "failed-precondition" || /index/i.test(String(e.message || "")));
const warnIndex = (e) => { try { console.error("[운송사 분리] 색인이 아직 없어 회사 조건 없이 조회합니다 —", e?.message || e); } catch { /* 무시 */ } };

export function onSnapshot(ref, ...args) {
  const col = topCollectionId(ref);
  if (!col || !(STRICT.has(col) || LOOSE.has(col))) return base.onSnapshot(ref, ...args);
  const wrapFn = (fn) => (typeof fn === "function" ? (snap) => fn(wrapSnap(snap, keeper(col))) : fn);
  // onSnapshot(ref, cb, err) / (ref, options, cb, err) / (ref, { next, error }) / (ref, options, { next })
  const fi = args.findIndex((a) => typeof a === "function");
  const build = (onIndexErr) => args.map((a, i) => {
    if (i === fi) return wrapFn(a);
    if (fi !== -1 && i === fi + 1 && typeof a === "function" && onIndexErr) return (e) => (needsIndex(e) ? onIndexErr(e) : a(e));
    if (fi === -1 && a && typeof a === "object" && typeof a.next === "function") {
      return { ...a, next: wrapFn(a.next), error: (e) => (onIndexErr && needsIndex(e) ? onIndexErr(e) : a.error?.(e)) };
    }
    return a;
  });
  let q = injected(ref);
  if (!q) {
    // 스위치가 켜졌는데 이 화면이 아직 모르는 경우 — 서버가 거부(permission-denied)하면 켜고 회사 조건으로 다시 구독
    if (!(getTenant() && INJECT.has(col))) return base.onSnapshot(ref, ...build(null));
    let u2 = null; let stop2 = false;
    const heal = (e) => {
      if (stop2 || !e || e.code !== "permission-denied") return false;
      setServerFilter(true);
      const q2 = injected(ref);
      if (!q2) return false;
      try { u2?.(); } catch { /* 무시 */ }
      u2 = base.onSnapshot(q2, ...build(null));
      return true;
    };
    let a3 = args.map((a, i) => {
      if (i === fi) return wrapFn(a);
      if (fi !== -1 && i === fi + 1 && typeof a === "function") return (e) => { if (!heal(e)) a(e); };
      if (fi === -1 && a && typeof a === "object" && typeof a.next === "function") return { ...a, next: wrapFn(a.next), error: (e) => { if (!heal(e)) a.error?.(e); } };
      return a;
    });
    if (fi !== -1 && typeof args[fi + 1] !== "function") { a3 = [...a3]; a3.splice(fi + 1, 0, (e) => { if (!heal(e)) console.warn(e); }); }
    u2 = base.onSnapshot(ref, ...a3);
    return () => { stop2 = true; try { u2?.(); } catch { /* 무시 */ } };
  }
  let unsub = null; let stopped = false;
  const fallback = (e) => { warnIndex(e); if (stopped) return; try { unsub?.(); } catch { /* 무시 */ } unsub = base.onSnapshot(ref, ...build(null)); };
  // 오류 콜백이 없던 구독도 색인 오류는 받아서 되살린다
  let a2 = build(fallback);
  if (fi !== -1 && typeof args[fi + 1] !== "function") { a2 = [...a2]; a2.splice(fi + 1, 0, (e) => (needsIndex(e) ? fallback(e) : console.warn(e))); }
  unsub = base.onSnapshot(q, ...a2);
  return () => { stopped = true; try { unsub?.(); } catch { /* 무시 */ } };
}

const wrapGet = (fn) => async (ref, ...rest) => {
  const q = injected(ref);
  let snap;
  if (q) {
    try { snap = await fn(q, ...rest); } catch (e) { if (!needsIndex(e)) throw e; warnIndex(e); snap = await fn(ref, ...rest); }
  } else {
    try { snap = await fn(ref, ...rest); } catch (e) {
      // 스위치가 켜진 뒤 처음 — 서버 거부면 켜고 회사 조건으로 한 번 더
      const c0 = topCollectionId(ref);
      if (e?.code !== "permission-denied" || !getTenant() || !INJECT.has(c0)) throw e;
      setServerFilter(true);
      const q2 = injected(ref);
      if (!q2) throw e;
      snap = await fn(q2, ...rest);
    }
  }
  const col = topCollectionId(ref);
  return col ? wrapSnap(snap, keeper(col)) : snap;
};
export const getDocs = wrapGet(base.getDocs);
export const getDocsFromCache = base.getDocsFromCache ? wrapGet(base.getDocsFromCache) : undefined;
export const getDocsFromServer = base.getDocsFromServer ? wrapGet(base.getDocsFromServer) : undefined;
export async function getCountFromServer(ref, ...rest) {
  const t = getTenant();
  const col = topCollectionId(ref);
  // 건수 세기(모바일 첫 로딩 "오늘 N건" 등) — 기본 회사가 아닌 운송사는 문서마다 회사명이 있으니
  // 스위치와 상관없이 서버에서 회사 조건으로 센다. 색인이 아직 없으면 받아서 직접 센다.
  const q = injected(ref) || (t && t !== DEFAULT_CO && INJECT.has(col) ? base.query(ref, base.where("companyName", "==", t)) : null);
  if (q) {
    try { return await base.getCountFromServer(q, ...rest); } catch (e) {
      if (!needsIndex(e)) throw e; warnIndex(e);
      const snap = wrapSnap(await base.getDocs(ref), keeper(col));
      const n = snap.size;
      return { data: () => ({ count: n }) };
    }
  }
  return base.getCountFromServer(ref, ...rest);
}

const stampData = (col, data) => {
  const t = getTenant();
  if (!t || !STAMP.has(col) || !data || typeof data !== "object" || Array.isArray(data)) return data;
  if ("companyName" in data) return data;
  return { ...data, companyName: t };
};
// 이름으로 문서 번호를 만드는 컬렉션(하차지·기본거래처) — 운송사끼리 같은 업체명을 쓰면 같은 문서를
// 덮어쓰게 되므로, 기본 회사가 아닌 운송사는 "회사__이름"으로 따로 만든다(예전 문서는 그대로).
const KEYED = new Set(["places", "clients", "fleet_settings", "acctPayments"]); // fleet_settings/default = 회사 기본 출근지, acctPayments/{연도}
const prefixOf = () => { const t = getTenant(); return t && t !== DEFAULT_CO ? `${t.replace(/\//g, "_")}__` : ""; };
const keyId = (col, id) => {
  const pre = prefixOf();
  if (!pre || !KEYED.has(col) || typeof id !== "string" || !id || id.startsWith(pre)) return id;
  return pre + id;
};
export function doc(first, ...rest) {
  try {
    if (rest.length === 2 && typeof rest[0] === "string" && !rest[0].includes("/") && first && first.type !== "collection" && first.type !== "document") {
      return base.doc(first, rest[0], keyId(rest[0], rest[1]));
    }
    if (rest.length === 1 && typeof rest[0] === "string" && !rest[0].includes("/") && first && (first.type === "collection" || Array.isArray(first.__segs))) {
      const col = topCollectionId(first);
      if (col) return base.doc(first, keyId(col, rest[0]));
    }
  } catch { /* 그대로 */ }
  return base.doc(first, ...rest);
}

export function addDoc(ref, data) { return base.addDoc(ref, stampData(topCollectionId(ref), data)); }
export function setDoc(ref, data, ...rest) { return base.setDoc(ref, stampData(docCollectionId(ref), data), ...rest); }
export function writeBatch(db) {
  const b = base.writeBatch(db);
  const set = b.set.bind(b);
  b.set = (ref, data, ...rest) => set(ref, stampData(docCollectionId(ref), data), ...rest);
  return b;
}

// 기사 통합 업로드 링크(/driver-upload)에 회사를 붙인다 — 같은 날 같은 차량·이름이 다른 운송사에 있어도 섞이지 않게
export function withCo(url) {
  const t = getTenant();
  if (!t) return url;
  return `${url}${url.includes("?") ? "&" : "?"}co=${encodeURIComponent(t)}`;
}
