// ======================= src/acctPayments.js =======================
// 💳 미수·미지급 입금(수금·지급) 처리 기록 — 2026-11-01 회사별로 분리
//  예전에는 연도("2026") 문서 하나를 모든 운송사가 같이 써서 서로 덮어썼다.
//  이제 "회사__연도" 문서에 저장하고, 예전 연도 문서는 우리 회사 것일 때만 읽어 이어 쓴다.
import { doc, getDoc, setDoc, arrayUnion } from "firebase/firestore";
import { auth } from "./firebase";
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
  const log = entry && entry.name ? { log: arrayUnion({ type: entry.type === "ap" ? "ap" : "ar", name: String(entry.name), amount: Number(entry.amount) || 0, ...(entry.reset ? { reset: true } : {}), at: Date.now(), by: auth?.currentUser?.email || "" }) } : {};
  return setDoc(doc(db, "acctPayments", payDocId(year, co)), { ar, ap, companyName: co, year: Number(year), ...log }, { merge: true });
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
