// ======================= src/acctPayments.js =======================
// 💳 미수·미지급 입금(수금·지급) 처리 기록 — 2026-11-01 회사별로 분리
//  예전에는 연도("2026") 문서 하나를 모든 운송사가 같이 써서 서로 덮어썼다.
//  이제 "회사__연도" 문서에 저장하고, 예전 연도 문서는 우리 회사 것일 때만 읽어 이어 쓴다.
import React from "react";
import { doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc, deleteField, writeBatch, serverTimestamp, arrayUnion, collection, onSnapshot, query, where } from "firebase/firestore";
import { buildArMonths, arPaidMapOf, planForClient } from "../functions/arMatchCore.mjs";
import { fullyPaidMonths, autoSettleRevertsOf, autoSettleTag } from "../functions/arCore.mjs";
import { auth, db } from "./firebase";
import { getTenant } from "./fsTenant";
import { DEFAULT_COMPANY } from "./firebase";

const coOf = (company) => String(company || getTenant() || DEFAULT_COMPANY || "").trim();
export const payDocId = (year, company) => `${coOf(company)}__${year}`;

export async function loadAcctPayments(db, year, company) {
  const co = coOf(company);
  const s = await getDoc(doc(db, "acctPayments", payDocId(year, co)));
  if (s.exists()) return { ar: s.data().ar || {}, ap: s.data().ap || {}, log: Array.isArray(s.data().log) ? s.data().log : [] };
  try {
    const old = await getDoc(doc(db, "acctPayments", String(year)));
    if (old.exists()) {
      const d = old.data();
      const mine = d.companyName ? d.companyName === co : co === DEFAULT_COMPANY;
      if (mine) return { ar: d.ar || {}, ap: d.ap || {} };
    }
  } catch { /* 예전 문서 읽기 실패는 무시 */ }
  return { ar: {}, ap: {} };
}

// ⭐ 2026-11-18 entry({ type: "ar"|"ap", name, amount, reset }) 를 주면 처리 기록(log)에 한 줄 남긴다 — 회계 장부 상세 내역(언제 · 얼마)
//  merge 로 저장(기록 칸이 지워지지 않게) · ar · ap 는 늘 거래처/기사 전체 값을 넘긴다(키를 지우지 않음)
export function saveAcctPayments(db, year, company, ar, ap, entry) {
  const co = coOf(company);
  // 🔗 2026-11-25 entry.paymentIds = 같은 돈을 적은 정본 입금 기록(arPayments) — 미수금 계산은 이 줄을 세지 않는다(arCore legacyAcctArOf)
  const log = entry && entry.name ? { log: arrayUnion({ type: entry.type === "ap" ? "ap" : "ar", name: String(entry.name), amount: Number(entry.amount) || 0, ...(entry.reset ? { reset: true } : {}), ...(Array.isArray(entry.paymentIds) && entry.paymentIds.length ? { paymentIds: entry.paymentIds } : {}), at: Date.now(), by: auth?.currentUser?.email || "" }) } : {};
  return setDoc(doc(db, "acctPayments", payDocId(year, co)), { ar, ap, companyName: co, year: Number(year), ...log }, { merge: true });
}

// 🔗 2026-11-25 거래처정산 › 미수금관리 입금 기록(arPayments, 은행 자동 매칭 포함) — 회계관리 미수금이 같이 본다(arAging.paidWithSettled)
//  읽기 권한이 없으면 빈 목록(회계 미수금은 예전처럼 오더의 정산완료 · 입금완료만 본다)
export function useArPayments(company) {
  const co = coOf(company);
  const [rows, setRows] = React.useState([]);
  React.useEffect(() => {
    if (!co) { setRows([]); return undefined; }
    return onSnapshot(query(collection(db, "arPayments"), where("company", "==", co)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))), () => setRows([]));
  }, [co]);
  return rows;
}

// 🔗 2026-11-25 회계관리 [입금 처리] → 정본 입금 기록(arPayments)에 남긴다(미수금관리 · 은행 자동 매칭과 같은 모양 + source "acct")
//  · 청구월 = 그 거래처의 남은 미수 달(마감월 기준)에 오래된 달부터 나눠 넣는다(functions/arMatchCore.mjs planForClient — 미수금 데스크와 같은 식)
//    남는 돈(초과 · 미수 달 없음)은 이번 달 기록으로 · 입금 한 번 = depositKey 하나(자금 장부 한 줄 — 서버 arPaymentLedger)
//  · 자금관리 수입 장부는 서버가 붙인다(예전 addClientCollection 은 부르지 않는다 → 두 번 적히지 않게)
//  ✅ 2026-11-25 이번 입금으로 남은 미수가 0이 된 청구월 → 그 달 오더 정산완료(거래처정산 미수금관리 [정산완료]와 같은 정산상태 · 정산일 키)
//    + 정산자동.{월} = "acct:{depositKey}" 표시 · 바꾼 오더 목록(예전 값 포함)은 그 달 입금 기록 autoSettled 에 → [초기화] 때 이것만 되돌린다
//    일부입금은 그대로(정산완료로 바꾸지 않음) · 이미 정산완료인 오더는 다시 쓰지 않는다
//  orders: 회계 장부가 보는 올해 오더 · pays: 지금 입금 기록(arPayments) · 결과 [기록 id] (+ .settled = 정산완료로 바꾼 오더 수 · .settledMonths = 그 청구월들)
export async function recordAcctDeposit({ company, client, amount, orders = [], pays = [], year, date = "" }) {
  const co = coOf(company); const amt = Math.round(Number(amount) || 0);
  if (!co || !client || amt <= 0) return [];
  const months = buildArMonths({ orders, paidMap: arPaidMapOf(pays), rowOk: (r) => String(r.거래처명 || "") === client });
  const plan = planForClient(months, client, amt);
  const today = String(date || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)).slice(0, 10);
  const parts = plan.alloc.map((a) => ({ yyyymm: a.yyyymm, amount: a.amount, full: !!a.full }));
  const left = amt - parts.reduce((x, a) => x + a.amount, 0);
  if (left > 0) parts.push({ yyyymm: today.slice(0, 7), amount: left, full: false });
  const depositKey = `acct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const tag = autoSettleTag(depositKey);
  const after = [...(pays || []), ...parts.map((a) => ({ client, yyyymm: a.yyyymm, amount: a.amount }))];
  const only = plan.alloc.map((a) => a.yyyymm); // 남는 돈(이번 달 기록)은 보지 않는다 — 이미 다 받은 달을 다시 쓰지 않게
  let fulls = fullyPaidMonths({ orders, payments: after, client, only });
  if (fulls.length) {
    // 회계 화면 오더 목록은 열 때 한 번 받은 것 → 바꿀 오더는 지금 값을 다시 읽고(그 사이 직접 정산완료한 오더는 빼고) 다시 센다
    const fresh = new Map();
    for (const r of fulls.flatMap((f) => f.rows)) if (!fresh.has(r._id)) { const x = await readOrder({ id: r._id, col: r.__col }); if (x) fresh.set(r._id, x); }
    fulls = fullyPaidMonths({ orders: (orders || []).map((r) => (r && fresh.get(r._id)) || r), payments: after, client, only })
      .map((f) => ({ ...f, rows: f.rows.filter((r) => fresh.has(r._id) && r.__col) })).filter((f) => f.rows.length); // 못 읽은 줄(고정거래처 등)은 건드리지 않음
  }
  const marks = new Map(fulls.map((f) => [f.ym, f.rows.map((r) => ({ col: r.__col, id: r._id, prev: { status: r.정산상태?.[f.ym] ?? null, date: r.정산일?.[f.ym] ?? null } }))]));
  const b = writeBatch(db); const ids = [];
  parts.forEach((a) => {
    const ref = doc(collection(db, "arPayments")); ids.push(ref.id);
    const auto = marks.get(a.yyyymm); marks.delete(a.yyyymm); // 같은 달 기록이 둘이면 첫 기록에만
    b.set(ref, { company: co, client, yyyymm: a.yyyymm, amount: a.amount, full: a.full, depositName: client, depositDate: today, at: serverTimestamp(), by: auth?.currentUser?.email || "", source: "acct", acctYear: Number(year) || Number(today.slice(0, 4)), depositKey, ...(auto && auto.length ? { autoSettled: auto } : {}) });
  });
  await b.commit();
  const jobs = fulls.flatMap((f) => f.rows.map((r) => patchOrder(r, { [`정산상태.${f.ym}`]: "정산완료", [`정산일.${f.ym}`]: today, [`정산자동.${f.ym}`]: tag })));
  ids.settled = (await Promise.all(jobs)).filter(Boolean).length;
  ids.settledMonths = fulls.map((f) => f.ym);
  return ids;
}
// 오더 문서 고치기 — 알고 있는 컬렉션 먼저, 안 되면 다른 쪽(거래처정산 일괄정산과 같은 방식 · 최종마감과 상관없는 정산 기록)
async function patchOrder(r, patch) {
  const first = r.__col || r.col || "orders";
  for (const col of [first, first === "orders" ? "dispatch" : "orders"]) {
    try { await updateDoc(doc(db, col, r._id || r.id), patch); return true; } catch { /* 다음 컬렉션 */ }
  }
  console.error("회계 입금 정산완료 반영 실패:", r._id || r.id);
  return false;
}
async function readOrder(m) {
  const first = m.col || "orders";
  for (const col of [first, first === "orders" ? "dispatch" : "orders"]) {
    try { const s = await getDoc(doc(db, col, m.id)); if (s.exists()) return { ...(s.data() || {}), _id: s.id, __col: col }; } catch { /* 다음 컬렉션 */ }
  }
  return null;
}
// 회계관리 [초기화] — 그 거래처 · 연도의 회계 입금 기록(source "acct")만 지운다(자금 장부 줄은 서버가 같이 지움)
//  ✅ 2026-11-25 그 입금으로 정산완료한 오더는 → 남은 입금으로 그 달을 더는 다 받지 않았으면 예전 값으로 되돌린다
//   (정산자동 표시가 그대로인 오더만 — 거래처정산에서 직접 누른 정산완료는 건드리지 않음) · 결과 { removed: 지운 기록 수, reverted: 되돌린 오더 수 }
export async function removeAcctDeposits({ company, client, year, orders = [] }) {
  const co = coOf(company);
  const s = await getDocs(query(collection(db, "arPayments"), where("company", "==", co)));
  const isMine = (x) => x.source === "acct" && x.client === client && Number(x.acctYear) === Number(year);
  const mine = s.docs.filter((d) => isMine(d.data() || {}));
  const rest = s.docs.filter((d) => !isMine(d.data() || {})).map((d) => d.data() || {});
  const marks = mine.flatMap((d) => { const x = d.data() || {}; return (Array.isArray(x.autoSettled) ? x.autoSettled : []).map((m) => ({ ...m, ym: String(x.yyyymm || "").slice(0, 7), tag: autoSettleTag(x.depositKey) })); });
  await Promise.all(mine.map((d) => deleteDoc(d.ref)));
  let reverted = 0;
  if (marks.length) {
    // 바꾼 오더는 지금 값을 다시 읽어 본다(화면 목록이 늦을 수 있음)
    const fresh = new Map();
    for (const m of marks) if (!fresh.has(m.id)) { const r = await readOrder(m); if (r) fresh.set(m.id, r); }
    const list = [...(orders || []).filter((r) => r && !fresh.has(r._id)), ...fresh.values()];
    const back = autoSettleRevertsOf({ orders: list, payments: rest, client, marks });
    const done = await Promise.all(back.map((m) => patchOrder({ _id: m.id, __col: fresh.get(m.id)?.__col || m.col }, {
      [`정산상태.${m.ym}`]: m.prev?.status == null ? deleteField() : m.prev.status,
      [`정산일.${m.ym}`]: m.prev?.date == null ? deleteField() : m.prev.date,
      [`정산자동.${m.ym}`]: deleteField(),
    })));
    reverted = done.filter(Boolean).length;
  }
  return { removed: mine.length, reverted };
}

// 📊 손익보고서 수동 입력(plManual) — 같은 문제(연도 문서 공유) → "회사__연도"
export async function loadPlManual(db, year, company) {
  const co = coOf(company);
  const s = await getDoc(doc(db, "plManual", payDocId(year, co)));
  if (s.exists()) return s.data().rows || {};
  try {
    const old = await getDoc(doc(db, "plManual", String(year)));
    if (old.exists()) { const d = old.data(); if (d.companyName ? d.companyName === co : co === DEFAULT_COMPANY) return d.rows || {}; }
  } catch { /* 무시 */ }
  return {};
}
export function savePlManual(db, year, company, rows) {
  const co = coOf(company);
  return setDoc(doc(db, "plManual", payDocId(year, co)), { rows, companyName: co, year: Number(year) });
}
