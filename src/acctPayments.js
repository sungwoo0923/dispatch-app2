// ======================= src/acctPayments.js =======================
// 💳 미수·미지급 입금(수금·지급) 처리 기록 — 2026-11-01 회사별로 분리
//  예전에는 연도("2026") 문서 하나를 모든 운송사가 같이 써서 서로 덮어썼다.
//  이제 "회사__연도" 문서에 저장하고, 예전 연도 문서는 우리 회사 것일 때만 읽어 이어 쓴다.
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getTenant } from "./fsTenant";
import { DEFAULT_COMPANY } from "./firebase";

const coOf = (company) => String(company || getTenant() || DEFAULT_COMPANY || "").trim();
export const payDocId = (year, company) => `${coOf(company)}__${year}`;

export async function loadAcctPayments(db, year, company) {
  const co = coOf(company);
  const s = await getDoc(doc(db, "acctPayments", payDocId(year, co)));
  if (s.exists()) return { ar: s.data().ar || {}, ap: s.data().ap || {} };
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

export function saveAcctPayments(db, year, company, ar, ap) {
  const co = coOf(company);
  return setDoc(doc(db, "acctPayments", payDocId(year, co)), { ar, ap, companyName: co, year: Number(year) });
}
