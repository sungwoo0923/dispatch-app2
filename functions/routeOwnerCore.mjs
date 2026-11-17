// ======================= functions/routeOwnerCore.mjs =======================
// ⭐ 2026-11-17 담당노선 주인(배차담당자 자동 지정) — 순수 함수(서버 · 화면 같이 쓴다 · 테스트 scripts/routeOwner.test.mjs)
//  · 직원이 [내 담당 설정]에서 노선(담당노선구분 — 녹수내수 · 아산내수 …)을 고르고 저장하면
//    ① 그 노선 오더의 배차담당자를 그 직원으로 바꾼다(화면이 묻고 · 최종마감 · 취소 · 고정노선 오더는 그대로)
//    ② 회사 설정 companySettings/{회사}.routeGroupOwners = { 노선: { uid, name, email, at } } 에 적어 두고
//       앞으로 그 노선에 들어오는 새 오더(구글시트 실시간 반영 · 직접 가져오기 · 프로그램 등록/수정)는 배차담당자가 비어 있을 때 이 직원으로 채운다
//  · 배차담당자 = 오더를 등록한 직원 칸(등록자명 · createdByName · createdByUid · createdByEmail · 작성자 …) — src/orderOwner.js applyOwner 와 같은 칸
//  · 화면(src)은 "../functions/routeOwnerCore.mjs" 로 가져다 쓴다(carrierMigrateCore 와 같은 방식 — 서버와 규칙이 갈라지지 않게)

export const RG_NONE = "(미지정)";
// 오더의 노선 — 담당노선구분 칸, 없으면 구글시트에서 가져온 탭 이름(이전출처 "탭!줄")
export const routeGroupOf = (row) => String(row?.담당노선구분 || String(row?.이전출처 || "").split("!")[0] || "").trim();

const s = (v) => String(v ?? "").trim();
const lower = (v) => s(v).toLowerCase();
const CANCEL = new Set(["취소", "배차취소", "오더취소", "취소됨"]);

// 취소 · 삭제 · 화주 전송 사본 · 블라인드 — 손대지 않는다
export const isCancelledOrder = (o) => !o || o.source === "transport_transmit" || s(o.배차상태) === "배차취소" || CANCEL.has(s(o.상태))
  || o.deleted === true || o.isDeleted === true || o._deleted === true || o.블라인드 === true;
// 고정노선(배차표) 오더 — 배차담당자가 "고정노선"으로 보이고 배차표 시트와 따로 맞춘다 → 손대지 않는다
export const isFixedRouteOrder = (o) => !!o && (!!s(o.배차표Id) || o.source === "fixedRoute" || s(o.등록기기) === "고정노선" || s(o.배차확정자) === "고정노선");

// 최종마감(정산관리 2차 승인) 잠금 — arDesk kind "close" 문서(거래처 × 월). src/closeFlow.js isFinalLocked · src/closeInbox.jsx 와 같은 기준
export const closeKeyOf = (o) => `${s(o?.거래처명)}|${s(o?.마감월).slice(0, 7) || s(o?.상차일).slice(0, 7)}`;
const finalLocked = (d) => !!d && d.status === "approved" && !d.unlocked;
// closes: Map("거래처|YYYY-MM" → close 문서) 또는 arDesk 문서 배열
export function closeMapOf(closes) {
  if (closes instanceof Map) return closes;
  const m = new Map();
  (Array.isArray(closes) ? closes : []).forEach((d) => { if (d && d.kind === "close") m.set(`${s(d.client)}|${s(d.yyyymm)}`, d); });
  return m;
}
export const isLockedOrder = (o, closes) => { const c = s(o?.거래처명); if (!c) return false; return finalLocked(closeMapOf(closes).get(closeKeyOf(o))); };

// 배차담당자가 비었나 — 등록자 칸이 모두 비었고 작성자도 사람(이메일)이 아니다(구글시트에서 온 오더는 작성자 = "구글시트 실시간")
const OWNER_KEYS = ["등록자명", "createdByName", "등록자", "createdByEmail", "createdByUid", "createdBy", "등록자이메일", "authorEmail"];
export const ownerEmpty = (o) => !!o && OWNER_KEYS.every((k) => !s(o[k])) && !s(o.작성자).includes("@");

// 이미 그 직원이 배차담당자인가(다시 저장해도 또 쓰지 않게)
export function isOwnedBy(o, owner) {
  if (!o || !owner) return false;
  const nm = s(o.등록자명 || o.createdByName);
  if (nm !== s(owner.name)) return false;
  if (owner.uid && s(o.createdByUid) !== s(owner.uid)) return false;
  if (owner.email && lower(o.createdByEmail) !== lower(owner.email)) return false;
  return true;
}

// 배차담당자 바꾸는 칸 — prev(지금 오더)에 맞춰 예전 형식 칸(등록자 · 등록자이메일 · createdBy)도 같이 맞춘다
export function ownerPatch(prev = {}, owner) {
  const name = s(owner?.name);
  if (!name) return null;
  const email = lower(owner?.email);
  const p = { 등록자명: name, createdByName: name, createdByUid: s(owner?.uid) || null };
  if (email) { p.createdByEmail = email; p.작성자 = email; if (s(prev.등록자이메일)) p.등록자이메일 = email; if (s(prev.authorEmail)) p.authorEmail = email; }
  else if (s(prev.createdByEmail)) p.createdByEmail = null; // 예전 담당자 이메일이 남아 있으면 그 사람으로 보인다
  if (s(prev.등록자)) p.등록자 = name;
  if (s(prev.createdBy)) p.createdBy = null; // createdBy 는 예전 uid · 이메일이 섞여 있다 — 지워서 새 담당자로 보이게(patchDispatch 와 같음)
  return p;
}

// 저장한 노선 중 실제로 바꿀 노선(일반오더 = 노선 없는 오더는 직원 여럿이 직접 등록한 것이라 빼고)
export const ownableGroups = (list) => [...new Set((Array.isArray(list) ? list : []).map(s).filter((g) => g && g !== RG_NONE))];

// 바꿀 오더 고르기
//  orders: [{ __col, _id, ...오더 }] (같은 오더가 여러 번 와도 한 번만 — 뒤에 온 것이 이긴다: 서버에서 새로 읽은 것을 뒤에 넣는다)
//  → { change: [오더], locked: [오더], skipped: { cancelled, fixed, already }, byGroup: { 노선: 바꿀 건수 } }
export function selectOwnerTargets(orders, groups, owner, { closes } = {}) {
  const want = new Set(ownableGroups(groups));
  const cm = closeMapOf(closes);
  const uniq = new Map();
  (Array.isArray(orders) ? orders : []).forEach((o) => { if (o && s(o._id)) uniq.set(`${s(o.__col) || "orders"}/${s(o._id)}`, o); });
  const out = { change: [], locked: [], skipped: { cancelled: 0, fixed: 0, already: 0 }, byGroup: {} };
  for (const o of uniq.values()) {
    const g = routeGroupOf(o);
    if (!g || !want.has(g)) continue;
    if (isCancelledOrder(o)) { out.skipped.cancelled += 1; continue; }
    if (isFixedRouteOrder(o)) { out.skipped.fixed += 1; continue; }
    if (isOwnedBy(o, owner)) { out.skipped.already += 1; continue; }
    if (isLockedOrder(o, cm)) { out.locked.push(o); continue; }
    out.change.push(o);
    out.byGroup[g] = (out.byGroup[g] || 0) + 1;
  }
  return out;
}

// 회사 노선 주인표 합치기
//  prev: { 노선: { uid, name, email, at } } · me: { uid, name, email } · list: 이번에 저장한 내 담당
//  · list 의 노선 = 나로(다른 직원이 맡고 있었으면 taken 에 적는다 — 화면이 "○○○ 담당에서 바뀌어요"라고 알린다)
//  · 내가 맡고 있던 노선인데 list 에서 뺐다 = 표에서 지운다(다른 직원 것은 건드리지 않는다). 오더는 그대로
//  · claim:false([담당만 저장]) = 새로 맡지는 않고 뺀 노선만 지운다
//  → { next, taken: [{ group, from }], released: [노선], changed }
export function mergeOwnerMap(prev, me, list, { claim = true, now = Date.now() } = {}) {
  const base = prev && typeof prev === "object" && !Array.isArray(prev) ? prev : {};
  const uid = s(me?.uid);
  const next = {};
  Object.entries(base).forEach(([g, v]) => { if (v && typeof v === "object" && s(v.uid)) next[g] = v; });
  const groups = ownableGroups(list);
  const taken = []; const released = [];
  let changed = Object.keys(next).length !== Object.keys(base).length;
  if (!uid) return { next, taken, released, changed };
  const want = new Set(groups);
  Object.keys(next).forEach((g) => { if (s(next[g].uid) === uid && !want.has(g)) { delete next[g]; released.push(g); changed = true; } });
  if (claim) groups.forEach((g) => {
    const cur = next[g];
    if (cur && s(cur.uid) !== uid) taken.push({ group: g, from: { uid: s(cur.uid), name: s(cur.name) } });
    const v = { uid, name: s(me?.name), email: lower(me?.email) };
    if (!cur || s(cur.uid) !== uid || s(cur.name) !== v.name || lower(cur.email) !== v.email) { next[g] = { ...v, at: now }; changed = true; }
  });
  return { next, taken, released, changed };
}

// 앞으로 들어오는 오더 — 노선 주인이 있고 배차담당자가 비었으면 채울 칸(아니면 null)
export function autoOwnerPatch(order, map) {
  if (!order || !map || typeof map !== "object" || !ownerEmpty(order) || isCancelledOrder(order) || isFixedRouteOrder(order)) return null;
  const g = routeGroupOf(order);
  const owner = g && g !== RG_NONE ? map[g] : null;
  if (!owner || !s(owner.uid) || !s(owner.name)) return null;
  return ownerPatch(order, owner);
}
