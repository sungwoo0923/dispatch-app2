// ======================= src/closeFlow.js =======================
// ✅ 2026-11-16 2단계 마감(순수 함수) — 배차자가 내 거래처를 먼저 1차 마감하고, 경리팀이 2차로 검증해 업체에 넘긴다
//  화면은 src/CloseFlow.jsx(배차현황 › 월 마감 = 배차자 · 정산관리 › 마감 검증 = 경리) · 테스트 scripts/closeFlow.test.mjs
//  기록: arDesk 컬렉션 kind "close"(거래처 × 월 한 문서) · kind "dayclose"(배차자 × 날짜 일 마감)
//  상태: none(1차 마감 전) → submitted(경리 검증 대기) → approved(2차 승인) / rejected(반려 → 고쳐서 다시 올림)
import { n, monthOf } from "./settleCore.js";

// ✅ 2026-11-16 검증 단계 — 배차자가 거래처 오더를 다 보고 [검증 완료] → 그 다음 [1차 마감]이 열린다
export const CLOSE_STATUS = {
  none: { label: "검증 전", tone: "mute" },
  verified: { label: "검증 완료", tone: "blue" },
  submitted: { label: "경리 검증 대기", tone: "warn" },
  rejected: { label: "반려됨", tone: "bad" },
  approved: { label: "최종마감", tone: "ok" }, // 🔒 2026-11-16 경리 확인 = 최종마감 — 배차 쪽은 고치기 · 추가 · 삭제 잠금(경리팀 일시해제 가능)
};
export const statusOf = (doc) => (doc && CLOSE_STATUS[doc.status] ? doc.status : "none");

// 자동 검사 — 🛠 2026-11-16 모두 "확인할 것"(막지 않음). 그대로 맞는 오더도 있어서 검증은 확인 후 언제든 할 수 있다.
//  같은 날 같은 구간 중복 검사는 뺐다(하루에 같은 구간을 여러 번 도는 일이 흔하다 — 사용자 요청)
//  block: true 는 빨강(꼭 봐야 할 것) · false 는 주황 — 표시 색만 다르다
export const CLOSE_RULES = [
  { key: "blank", label: "청구운임 빈칸", desc: "청구운임이 0원이에요", block: true },
  { key: "unassigned", label: "배차 미완료", desc: "지난 날짜인데 아직 배차완료가 아니에요", block: true },
  { key: "noDriver", label: "기사운임 빈칸", desc: "청구운임은 있는데 기사운임이 0원이에요", block: false }, // 🧹 2026-11-16 역마진 검사는 뺐다(사용자 요청)
];
export const DIFF_LIMIT = 0.3; // 지난달보다 30% 넘게 차이 나면 알려 준다

const isCancel = (o) => o?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(o?.상태);
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const prevYmOf = (ym) => { const [y, m] = String(ym).split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7); };

// 오더를 등록한 사람 — 이메일(소문자) 또는 uid 목록
const CREATOR_KEYS = ["createdByEmail", "createdByUid", "createdBy", "작성자", "등록자이메일", "authorEmail"];
export function creatorIds(o) {
  const out = [];
  CREATOR_KEYS.forEach((k) => { const s = String(o?.[k] || "").trim().toLowerCase(); if (s) out.push(s); });
  return out;
}
export const isMine = (o, me) => {
  const ids = [me?.email, me?.uid].map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
  if (!ids.length) return false;
  return creatorIds(o).some((x) => ids.includes(x));
};

// 한 묶음(거래처 × 월 또는 배차자 × 날짜) 오더의 자동 검사
export function closeChecks(rows, today = kstToday()) {
  const out = { blank: [], unassigned: [], noDriver: [] };
  (rows || []).forEach((o) => {
    const pay = String(o.지급방식 || "");
    if (n(o.청구운임) <= 0 && !/손실|착불/.test(pay)) out.blank.push(o);
    if ((o.배차상태 || "") !== "배차완료" && String(o.상차일 || "") < today) out.unassigned.push(o);
    if (n(o.청구운임) > 0 && n(o.기사운임) <= 0 && !/손실|착불/.test(pay)) out.noDriver.push(o);
  });
  return out;
}
export const blockCount = (checks) => CLOSE_RULES.filter((r) => r.block).reduce((a, r) => a + (checks?.[r.key]?.length || 0), 0);
// 오더 한 건이 걸린 검사 — 월 마감 표에 빨강(block) · 주황(warn) 글씨로
export function issuesOf(o, checks) {
  return CLOSE_RULES.filter((r) => (checks?.[r.key] || []).includes(o)).map((r) => ({ key: r.key, label: r.label, block: r.block }));
}
export const warnCount = (checks) => CLOSE_RULES.filter((r) => !r.block).reduce((a, r) => a + (checks?.[r.key]?.length || 0), 0);

// 거래처 × 월 마감판
//  closeOf(client, ym) → arDesk close 문서 · me → 지금 사용자(배차자 화면이면 내 거래처 표시)
export function closeBoard(orders, ym, { closeOf = () => null, me = null, today = kstToday() } = {}) {
  const live = (orders || []).filter((o) => !isCancel(o) && o?.source !== "transport_transmit" && String(o.거래처명 || "").trim());
  const prev = prevYmOf(ym);
  const prevSale = new Map();
  const byClient = new Map();
  live.forEach((o) => {
    const c = String(o.거래처명).trim(); const m = monthOf(o);
    if (m === prev) prevSale.set(c, (prevSale.get(c) || 0) + n(o.청구운임));
    if (m !== ym) return;
    const x = byClient.get(c) || { client: c, rows: [], sale: 0, buy: 0, mineCount: 0 };
    x.rows.push(o); x.sale += n(o.청구운임); x.buy += n(o.기사운임); if (me && isMine(o, me)) x.mineCount += 1;
    byClient.set(c, x);
  });
  return [...byClient.values()].map((x) => {
    const checks = closeChecks(x.rows, today);
    const doc = closeOf(x.client, ym);
    const status = statusOf(doc);
    const ps = prevSale.get(x.client) || 0;
    const diff = ps > 0 ? (x.sale - ps) / ps : 0;
    const snap = doc?.snapshot;
    // ⚠ 2026-11-27 최종마감 뒤 오더 건수나 오더 금액(청구운임 합)이 바뀌면 '마감 후 변경'.
    //  명세서 화면에서 고친 금액은 오더를 바꾸지 않아서 여기 안 잡힌다 — 오더 쪽(운송팀) 변경만 잡힌다.
    //  실무: 운송팀은 명세서 '금액 바뀜' 배지를 못 보므로, 금액만 바뀐 경우도 월 마감 · 정산 홈에 같이 떠야 경리 · 운송이 같은 걸 본다.
    //  경리가 확인하고 [일시해제] → [다시 잠금]하면 지금 건수 · 금액으로 다시 마감된다(스냅숏 갱신)
    const changed = !!snap && status !== "none" && (snap.count !== x.rows.length || Math.round(snap.sale) !== Math.round(x.sale));
    return {
      client: x.client, ym, count: x.rows.length, sale: x.sale, buy: x.buy, rows: x.rows, checks,
      block: blockCount(checks), warn: warnCount(checks), prevSale: ps, diff, bigDiff: ps > 0 && Math.abs(diff) > DIFF_LIMIT,
      mine: x.mineCount > 0, doc, status, changed,
    };
  }).sort((a, b) => b.sale - a.sale);
}

// 지금 할 수 있는 일
// 검증: 고칠 것이 없고(검증 전 · 반려 · 검증 뒤 금액이 바뀜 · 마감 뒤 금액이 바뀜)
export const canVerify = (row) => !!row && (row.status === "none" || row.status === "rejected" || ((row.status === "verified" || row.status === "submitted") && row.changed)); // 확인할 것이 있어도 된다(화면이 한 번 묻는다)
// 1차 마감: 검증 완료이고 그 뒤로 금액이 그대로일 때만
export const canSubmit = (row) => !!row && row.status === "verified" && !row.changed;
export const canApprove = (row) => !!row && row.status === "submitted" && !row.changed;
export const canReject = (row) => !!row && (row.status === "submitted" || row.status === "approved");
export const canUnlock = (row, mode) => !!row && (mode === "acct" ? row.status === "approved" || row.status === "submitted" : row.status === "submitted" || row.status === "verified");

// 저장할 값 만들기(기록은 최근 30개)
const logOf = (doc, entry) => [entry, ...((doc?.log) || [])].slice(0, 30);
const who = (me) => ({ email: String(me?.email || "").toLowerCase(), name: me?.name || String(me?.email || "").split("@")[0] }); // 👤 기록엔 이름(없으면 계정 앞부분)
export function verifyPatch(row, me, now = Date.now()) {
  const w = who(me);
  return { kind: "close", client: row.client, yyyymm: row.ym, status: "verified", reason: "",
    verifiedBy: w.email, verifiedByName: w.name, verifiedAt: now, snapshot: { count: row.count, sale: row.sale },
    log: logOf(row.doc, { at: now, by: w.name, act: row.status === "rejected" ? "고쳐서 다시 검증" : "검증 완료", note: "" }) };
}
export function submitPatch(row, me, note = "", now = Date.now()) {
  const w = who(me);
  return { kind: "close", client: row.client, yyyymm: row.ym, status: "submitted", reason: "",
    submittedBy: w.email, submittedByName: w.name, submittedAt: now, snapshot: { count: row.count, sale: row.sale },
    log: logOf(row.doc, { at: now, by: w.name, act: row.status === "rejected" ? "고쳐서 다시 1차 마감" : "1차 마감", note }) };
}
export function approvePatch(row, me, now = Date.now()) {
  const w = who(me);
  return { kind: "close", client: row.client, yyyymm: row.ym, status: "approved", approvedBy: w.email, approvedByName: w.name, approvedAt: now,
    unlocked: false, snapshot: { count: row.count, sale: row.sale }, log: logOf(row.doc, { at: now, by: w.name, act: "최종마감", note: "" }) };
}
export function rejectPatch(row, me, reason, now = Date.now()) {
  const w = who(me);
  return { kind: "close", client: row.client, yyyymm: row.ym, status: "rejected", reason: String(reason || "").trim(), rejectedBy: w.email, rejectedByName: w.name, rejectedAt: now,
    log: logOf(row.doc, { at: now, by: w.name, act: "반려", note: String(reason || "").trim() }) };
}
export function unlockPatch(row, me, note = "", now = Date.now()) {
  const w = who(me);
  return { kind: "close", client: row.client, yyyymm: row.ym, status: "none",
    log: logOf(row.doc, { at: now, by: w.name, act: row.status === "verified" ? "검증 취소" : "마감 풀기", note }) };
}

// 일 마감 — 배차자 × 날짜. 내 오더만 모아 같은 검사를 한다
export function dayBoard(orders, date, me, today = kstToday()) {
  const rows = (orders || []).filter((o) => !isCancel(o) && o?.source !== "transport_transmit" && String(o.상차일 || "") === date && isMine(o, me));
  const checks = closeChecks(rows, today);
  return { date, rows, count: rows.length, sale: rows.reduce((a, o) => a + n(o.청구운임), 0), checks, block: blockCount(checks), warn: warnCount(checks) };
}

// 정산 홈 숫자 — 검증 대기 · 반려 · 승인 거래처 수
export function closeCounts(board) {
  const c = { none: 0, verified: 0, submitted: 0, rejected: 0, approved: 0 };
  (board || []).forEach((r) => { c[r.status] += 1; });
  return c;
}

// 🔒 2026-11-16 최종마감 잠금 — 경리 확인(approved)이면 배차 쪽은 그 거래처 · 그 달 오더를 고치거나 추가 · 삭제할 수 없다
//  경리팀이 [일시해제]하면 잠깐 풀리고, 고친 뒤 [다시 잠금]하면 그때 금액으로 다시 최종마감
export const isFinalLocked = (doc) => !!doc && doc.status === "approved" && !doc.unlocked;
export function tempUnlockPatch(row, me, note = "", now = Date.now()) {
  const w = who(me);
  return { kind: "close", client: row.client, yyyymm: row.ym, unlocked: true, unlockedBy: w.email, unlockedByName: w.name, unlockedAt: now,
    log: logOf(row.doc, { at: now, by: w.name, act: "일시해제", note }) };
}
export function relockPatch(row, me, now = Date.now()) {
  const w = who(me);
  return { kind: "close", client: row.client, yyyymm: row.ym, status: "approved", unlocked: false, snapshot: { count: row.count, sale: row.sale }, approvedBy: w.email, approvedByName: w.name, approvedAt: now,
    log: logOf(row.doc, { at: now, by: w.name, act: "다시 잠금(최종마감)", note: "" }) };
}

// 🗓 2026-11-27 이월 오더 일괄 지정 — 배차현황 · 월 마감에서 여러 오더를 골라 마감월을 한 번에
//  mode: "next"(각 오더 상차일의 다음 달 · 익월) | "ym"(고른 달) | "clear"(비우기 = 상차일 달로)
export const nextYmOf = (ym) => { const [y, m] = String(ym).split("-").map(Number); const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 7); };
export function carryPatchOf(o, mode, ym = "") {
  const pick = String(o?.상차일 || "").slice(0, 7);
  const cur = String(o?.마감월 || "").slice(0, 7);
  const want = mode === "clear" ? "" : mode === "ym" ? String(ym || "").slice(0, 7) : /^\d{4}-\d{2}$/.test(pick) ? nextYmOf(pick) : "";
  if (mode !== "clear" && !/^\d{4}-\d{2}$/.test(want)) return null;
  if (want === cur) return null; // 이미 그 달
  return { 마감월: want };
}
// 고른 오더 → { todo: [{ o, patch }], same: 이미 그 달인 건수, locked: 최종마감이라 못 바꾸는 건수 }
//  isLocked(o) — 지금 달 또는 바꿀 달이 최종마감(잠금)인지(화면이 arDesk 마감 기록으로 판단해 넘긴다)
export function carryPlan(rows = [], mode, ym = "", isLocked = () => false) {
  const out = { todo: [], same: 0, locked: 0 };
  (rows || []).forEach((o) => {
    const patch = carryPatchOf(o, mode, ym);
    if (!patch) { out.same += 1; return; }
    if (isLocked(o) || isLocked({ ...o, ...patch })) { out.locked += 1; return; }
    out.todo.push({ o, patch });
  });
  return out;
}
