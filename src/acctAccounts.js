// ======================= src/acctAccounts.js =======================
// 📒 2026-11-08 계정과목 — 회사별 목록 + 경리만 추가
//  · 지출결의·법인카드 사용보고의 계정과목은 이 목록에서만 고른다(예전 "✎ 직접 입력" 없앰 — 같은 비용이 여러 이름으로 흩어지던 문제)
//  · 목록 = 기본 계정(EXPENSE_ACCOUNTS) + 회사가 추가한 계정(acctAccounts/{회사}.items)
//  · 추가는 경리 담당만(경리관리자·경리사무원·재무/경리/회계/총무 부서·통합 역할의 경리 화면·최고관리자)
//    → 화면에서 [+ 추가] 버튼을 경리에게만 보이고, firestore.rules › acctAccounts 가 서버에서 한 번 더 막는다
//  · 전표·재무제표(테스트운송사 시범)는 CHART(계정과목표: 코드·분류)로 차변·대변을 나눈다
import { arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import React from "react";
import { auth, db } from "./firebase";
import { isPayrollStaff } from "./payrollAccess";

export { EXPENSE_ACCOUNTS, CHART, KIND_LABEL, accountOf, normalSide } from "./acctChart";
import { EXPENSE_ACCOUNTS } from "./acctChart";

// 경리 담당인가(계정과목 추가·전표 작성) — 급여 담당과 같은 기준(payrollAccess.isPayrollStaff)
export const canEditAccounts = (me, email = auth.currentUser?.email || "") => isPayrollStaff(me || {}, email);

// 회사 계정과목 목록(기본 + 회사 추가분) — 실시간
export function useAccountList(company) {
  const [extra, setExtra] = React.useState([]);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(doc(db, "acctAccounts", String(company)), (s) => setExtra(s.exists() ? (s.data().items || []).filter(Boolean) : []), () => setExtra([]));
  }, [company]);
  return React.useMemo(() => {
    const out = [...EXPENSE_ACCOUNTS];
    extra.forEach((x) => { const t = String(x).trim(); if (t && !out.includes(t)) out.splice(out.length - 1, 0, t); }); // "기타"는 맨 아래 유지
    return out;
  }, [extra]);
}

// 계정과목 추가(경리만 — 서버 규칙도 같은 기준)
export async function addAccount(company, name) {
  const t = String(name || "").trim().replace(/\s+/g, " ");
  if (!t) throw new Error("계정과목 이름을 입력해 주세요.");
  if (t.length > 20) throw new Error("계정과목 이름은 20자 이내로 입력해 주세요.");
  if (/[/\\#?[\]]/.test(t)) throw new Error("계정과목 이름에 / \\ # ? [ ] 는 쓸 수 없어요.");
  await setDoc(doc(db, "acctAccounts", String(company)), {
    companyName: String(company), items: arrayUnion(t), updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "",
  }, { merge: true });
  return t;
}
