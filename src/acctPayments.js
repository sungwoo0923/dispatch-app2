// ======================= src/acctPayments.js =======================
// 💳 미수·미지급 입금(수금·지급) 처리 기록 — 2026-11-01 회사별로 분리
//  예전에는 연도("2026") 문서 하나를 모든 운송사가 같이 써서 서로 덮어썼다.
//  이제 "회사__연도" 문서에 저장하고, 예전 연도 문서는 우리 회사 것일 때만 읽어 이어 쓴다.
import React from "react";
import { doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp, arrayUnion, collection, onSnapshot, query, where } from "firebase/firestore";
import { buildArMonths, arPaidMapOf, planForClient } from "../functions/arMatchCore.mjs";
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
//  orders: 회계 장부가 보는 올해 오더 · pays: 지금 입금 기록(arPayments) · 결과 [기록 id]
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
  const b = writeBatch(db); const ids = [];
  parts.forEach((a) => {
    const ref = doc(collection(db, "arPayments")); ids.push(ref.id);
    b.set(ref, { company: co, client, yyyymm: a.yyyymm, amount: a.amount, full: a.full, depositName: client, depositDate: today, at: serverTimestamp(), by: auth?.currentUser?.email || "", source: "acct", acctYear: Number(year) || Number(today.slice(0, 4)), depositKey });
  });
  await b.commit();
  return ids;
}
// 회계관리 [초기화] — 그 거래처 · 연도의 회계 입금 기록(source "acct")만 지운다(자금 장부 줄은 서버가 같이 지움)
export async function removeAcctDeposits({ company, client, year }) {
  const co = coOf(company);
  const s = await getDocs(query(collection(db, "arPayments"), where("company", "==", co)));
  const mine = s.docs.filter((d) => { const x = d.data() || {}; return x.source === "acct" && x.client === client && Number(x.acctYear) === Number(year); });
  await Promise.all(mine.map((d) => deleteDoc(d.ref)));
  return mine.length;
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
