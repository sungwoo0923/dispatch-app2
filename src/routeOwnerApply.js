// ======================= src/routeOwnerApply.js =======================
// ⭐ 2026-11-17 담당노선 주인 — [내 담당 설정]을 저장할 때 오더 배차담당자 바꾸기 · 회사 노선 주인표 저장 · 새 오더 자동 지정
//  규칙(어떤 오더를 바꾸나 · 표를 어떻게 합치나)은 functions/routeOwnerCore.mjs(서버와 같이 씀 · 테스트 scripts/routeOwner.test.mjs)
//  · 노선 주인표: companySettings/{회사}.routeGroupOwners = { 노선: { uid, name, email, at } } — 직원도 이 칸만 고칠 수 있다(firestore.rules)
//  · 오더 쓰기: 400건씩 묶어서(writeBatch). 바뀐 칸은 배차담당자 칸뿐이라 구글시트로 다시 쓰지 않는다(functions/sheetPushCore.mjs 가 보는 칸이 아님)
//  · 최종마감(정산관리 2차 승인) · 취소 · 고정노선 오더는 그대로. 같은 사람으로 이미 된 오더는 다시 쓰지 않는다(여러 번 눌러도 같다)
import { collection, doc, getDoc, getDocs, query, where, writeBatch, runTransaction, arrayUnion, onSnapshot } from "firebase/firestore";
import { db, auth } from "./firebase";
import { updateDoc } from "./orderWrite";
import { selectOwnerTargets, mergeOwnerMap, ownableGroups, ownerPatch, autoOwnerPatch, closeMapOf, routeGroupOf } from "../functions/routeOwnerCore.mjs";

const BATCH = 400;
const COLS = ["orders", "dispatch"];
const s = (v) => String(v ?? "").trim();

// ── 회사 노선 주인표(화면이 켜져 있는 동안 구독해 두고, 오더 등록 · 수정 때 바로 꺼내 쓴다) ──────────
let OWNERS = { co: "", map: null };
let unsub = null;
export function watchRouteOwners(company) {
  const co = s(company);
  if (OWNERS.co === co && unsub) return;
  if (unsub) { unsub(); unsub = null; }
  OWNERS = { co, map: null };
  if (!co) return;
  unsub = onSnapshot(doc(db, "companySettings", co), (snap) => { OWNERS = { co, map: (snap.exists() && snap.data()?.routeGroupOwners) || null }; }, () => {});
}
export const routeOwnerMapNow = () => OWNERS.map;
// 등록 · 수정하는 오더에 넣을 배차담당자 칸(노선 주인이 있고 배차담당자가 비었을 때만) — 없으면 null
export const routeOwnerFill = (order) => autoOwnerPatch(order, OWNERS.map);

// ── 저장 전 준비: 무엇을 몇 건 바꿀지 ───────────────────────────────────────
//  rows: 화면이 이미 들고 있는 오더(불러온 기간) — 서버에서 그 노선 오더를 한 번 더 찾아 합친다(같은 오더면 서버 쪽)
export async function planRouteOwners({ company, me, list, rows = [] }) {
  const co = s(company);
  const groups = ownableGroups(list);
  let prevMap = {};
  try { prevMap = (await getDoc(doc(db, "companySettings", co))).data()?.routeGroupOwners || {}; } catch { prevMap = {}; }
  const merge = mergeOwnerMap(prevMap, me, list);
  if (!groups.length) return { co, groups, merge, targets: { change: [], locked: [], skipped: {}, byGroup: {} }, closesOk: true, serverOk: true };
  // 최종마감 기록 — 못 읽으면 잠금을 확인할 수 없으니 오더는 바꾸지 않는다(closesOk=false)
  let closes = null;
  try { closes = closeMapOf((await getDocs(query(collection(db, "arDesk"), where("companyName", "==", co)))).docs.map((d) => d.data())); } catch { closes = null; }
  const want = new Set(groups);
  // 다른 회사 오더는 절대 건드리지 않는다(최고관리자는 서버 조회에 회사 조건이 안 붙는다 → 결과를 회사로 한 번 더 거른다)
  const found = (rows || []).filter((r) => want.has(routeGroupOf(r)) && (!s(r.companyName) || s(r.companyName) === co));
  let serverOk = true;
  const qs = [];
  for (const col of COLS) {
    for (let i = 0; i < groups.length; i += 10) qs.push([col, query(collection(db, col), where("담당노선구분", "in", groups.slice(i, i + 10)))]);
    // 담당노선구분 칸이 생기기 전(2026-11-13 전)에 가져온 오더는 탭 이름(이전출처 "탭!줄")으로만 노선을 안다
    groups.forEach((g) => qs.push([col, query(collection(db, col), where("이전출처", ">=", `${g}!`), where("이전출처", "<", `${g}!\uf8ff`))]));
  }
  const parts = await Promise.all(qs.map(([col, q]) => getDocs(q).then((snap) => snap.docs.map((d) => ({ ...d.data(), __col: col, _id: d.id })).filter((x) => s(x.companyName) === co)).catch((e) => { serverOk = false; console.warn("담당노선 오더 찾기 실패", col, e?.message || e); return []; })));
  const targets = selectOwnerTargets([...found, ...parts.flat()], groups, me, { closes: closes || new Map() });
  return { co, groups, merge, targets: closes ? targets : { ...targets, change: [] }, closesOk: !!closes, serverOk };
}

// ── 오더 배차담당자 바꾸기(400건씩) ─────────────────────────────────────────
export async function applyOwnerToOrders(orders, me, { onProgress } = {}) {
  const myEmail = s(auth.currentUser?.email);
  const now = Date.now();
  const payloadOf = (o) => {
    const p = ownerPatch(o, me);
    if (!p) return null;
    const before = s(o.등록자명 || o.createdByName || o.등록자 || o.createdByEmail || o.작성자) || null;
    return { ...p, _lastModified: now, 최종수정자: myEmail, history: arrayUnion({ at: now, user: myEmail || "unknown", field: "배차담당자", before, after: p.등록자명 }) };
  };
  let done = 0; let failed = 0;
  const list = (orders || []).filter((o) => s(o?._id));
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    try {
      const b = writeBatch(db);
      chunk.forEach((o) => { const p = payloadOf(o); if (p) b.update(doc(db, o.__col || "orders", o._id), p); });
      await b.commit();
      done += chunk.length;
    } catch (e) {
      // 묶음 중 한 건이라도(그사이 지워진 오더 등) 안 되면 묶음 전체가 실패한다 → 한 건씩 다시
      console.warn("배차담당자 묶음 저장 실패: 한 건씩 다시", e?.message || e);
      for (const o of chunk) {
        const p = payloadOf(o);
        try { if (p) await updateDoc(doc(db, o.__col || "orders", o._id), p); done += 1; } catch { failed += 1; }
      }
    }
    onProgress?.({ done: done + failed, total: list.length });
  }
  return { done, failed };
}

// ── 회사 노선 주인표 저장(트랜잭션 — 동시에 두 사람이 저장해도 서로 지우지 않게) ─────────────────
export async function saveRouteOwnerMap(company, me, list, { claim = true } = {}) {
  const co = s(company);
  if (!co || !s(me?.uid)) return null;
  const ref = doc(db, "companySettings", co);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const prev = (snap.exists() && snap.data()?.routeGroupOwners) || {};
    const m = mergeOwnerMap(prev, me, list, { claim });
    if (!m.changed) return m;
    if (snap.exists()) tx.update(ref, { routeGroupOwners: m.next });
    else tx.set(ref, { companyName: co, routeGroupOwners: m.next });
    return m;
  });
}
