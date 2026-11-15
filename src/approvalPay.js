// ======================= src/approvalPay.js =======================
// 💸 2026-11-15 전자결재 지급 처리 규칙 — PC(Approval.jsx)와 모바일(메뉴 숫자)이 같이 쓴다(모바일 첫 화면에 큰 전자결재 화면을 싣지 않으려고 따로 둔다)
//  · 지급 대상: 비용·지출 결의(법인카드 사용보고 제외) · 금액 > 0 · 최종 승인
//  · 지급할 수 있는 사람: 경리관리자 · 경리사무원 · 최고관리자 · 재무/경리/회계/총무 부서 · 경리 화면으로 바꾼 통합관리자 · 통합인사관리자
//    + 회사에 그런 사람이 아무도 없으면(companyPayFlags.payFallback) 그 문서의 최종 결재자
//  (firestore.rules approvals 지급완료 규칙과 같은 조건)
import React from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";

const PAY_SKIP_FORMS = ["card"];
export const isPayDoc = (d) => d?.cat === "expense" && !PAY_SKIP_FORMS.includes(d?.form) && Number(d?.amount) > 0;
// null(지급 대상 아님) | "wait"(지급 대기) | "paid"(지급완료)
export const payState = (d) => (!isPayDoc(d) || d.status !== "approved" ? null : d.paid?.at ? "paid" : "wait");
const FIN_ROLES = ["test", "acctStaff", "totalMaster"];
export const FIN_TEAM = /재무|경리|회계|총무/;
const MULTI_VIEW = { allMgr: "kpAllMgrView", hrAcct: "kpHrAcctView" };
const acctViewOn = (role) => {
  const key = MULTI_VIEW[role];
  if (!key) return false;
  try { const v = localStorage.getItem(key); return role === "hrAcct" ? v !== "hr" : v === "acct"; } catch { return false; }
};
export const isFinUser = (me) => FIN_ROLES.includes(me?.role) || acctViewOn(me?.role) || FIN_TEAM.test(String(me?.team || ""));

export function usePayFlags(company) {
  const [f, setF] = React.useState(null);
  React.useEffect(() => {
    if (!company) { setF(null); return undefined; }
    return onSnapshot(doc(db, "companyPayFlags", String(company)), (s) => setF(s.exists() ? s.data() : null), () => setF(null));
  }, [company]);
  return f;
}
const lastApprover = (d) => (Array.isArray(d?.line) && d.line.length ? d.line[d.line.length - 1].uid : "");
export const fallbackPayer = (d, me, flags) => flags?.payFallback === true && !!me?.uid && lastApprover(d) === me.uid;

// 지급 대기 건수 — pay: { uid, role, team, company, view }(view 는 화면을 바꿀 때 다시 세려고)
//  경리 권한이면 회사 지출결의 전체, 아니면(경리 없는 회사의 최종 결재자) 내가 결재선에 있는 지출결의만
export function usePayTodo(pay) {
  const uid = pay?.uid || "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const finOn = React.useMemo(() => !!pay && isFinUser({ role: pay.role, team: pay.team }), [pay?.role, pay?.team, pay?.view]);
  const flags = usePayFlags(pay?.company || "");
  const fallbackOn = !finOn && flags?.payFallback === true;
  const [pool, setPool] = React.useState([]);
  React.useEffect(() => {
    if (!uid || !pay?.company || (!finOn && !fallbackOn)) { setPool([]); return undefined; }
    const q = finOn
      ? query(collection(db, "approvals"), where("company", "==", pay.company), where("cat", "==", "expense"))
      : query(collection(db, "approvals"), where("participants", "array-contains", uid));
    return onSnapshot(q, (s) => setPool(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPool([]));
  }, [uid, finOn, fallbackOn, pay?.company]);
  return React.useMemo(() => pool.filter((d) => payState(d) === "wait" && d.cancel?.status !== "pending" && !(d.hiddenBy || []).includes(uid)
    && (finOn || fallbackPayer(d, { uid }, flags))).length, [pool, finOn, flags, uid]);
}
