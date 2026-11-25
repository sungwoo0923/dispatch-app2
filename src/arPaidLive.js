// ======================= src/arPaidLive.js =======================
// 🔗 2026-11-25 거래처별 받은 돈(미수금 계산용) — 회계관리 · 거래처정산과 같은 한 식(functions/arCore.mjs arPaidByClient)
//  = 정본 입금 기록(arPayments · 은행 자동 매칭 · 회계 [입금 처리]) + 정산완료 · 입금완료 오더 + 예전 회계 합계(acctPayments.ar) 중 안 겹친 몫
//  일일 경영 보고 · 경영 분석 · 경영 브리핑이 쓴다(예전엔 acctPayments.ar 만 봐서 회계 화면 미수금과 달랐다)
import React from "react";
import { db } from "./firebase";
import { loadAcctPayments, useArPayments } from "./acctPayments";
import { arPaidByClient } from "./arAging";

// orders: 그 해 오더(정산완료 · 입금완료 칸을 본다) · demoAr: 데모 화면 수금 값(있으면 그대로)
// 반환: { 거래처: 받은 돈 } · 아직 못 읽었으면 null
export function useArPaid({ company, orders = [], year, demoAr = null }) {
  const yr = String(year || "");
  const [acct, setAcct] = React.useState(null);
  React.useEffect(() => {
    if (demoAr || !company || !yr) return undefined;
    let alive = true;
    loadAcctPayments(db, Number(yr), company).then((d) => { if (alive) setAcct({ ar: d.ar || {}, log: d.log || [] }); }).catch(() => { if (alive) setAcct({ ar: {}, log: [] }); });
    return () => { alive = false; };
  }, [demoAr, company, yr]);
  const arPays = useArPayments(demoAr ? "" : company);
  return React.useMemo(() => {
    if (demoAr) return demoAr;
    if (!acct) return null;
    return arPaidByClient({ orders, arPayments: arPays, acct, year: yr });
  }, [demoAr, acct, orders, arPays, yr]);
}
