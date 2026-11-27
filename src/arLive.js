// ======================= src/arLive.js =======================
// 💰 2026-11-27 미수금 한 숫자 — 시뮬레이션에서 같은 날 미수금이 4가지로 나왔다
//  (미수금관리 684만 · 경리 HOME 1,104만 · 경영 HOME 1,450만 · 정산 홈 3,473만).
//  이제 "미수금"을 보여 주는 화면은 이 훅 하나를 쓴다 = 회계관리 · 경영 분석 · 경영 브리핑과 같은 식(functions/arCore.mjs)
//   · 대상: 올해 배차완료 오더 + 고정거래처(취소 · 운송사 전송 사본 · 끈 운송업체 오더 제외)
//   · 청구액 = 거래처 · 청구월마다 공급가 합 × 1.1(부가세 포함)
//   · 받은 돈 = arPaidByClient(입금 기록 arPayments · 은행 자동 매칭 · 회계 [입금 처리] + 정산완료 · 입금완료 오더 + 예전 회계 합계)
//   · 미수금 = 청구액 − 받은 돈(0 아래로는 안 내려감) · 받은 돈이 청구액보다 많으면 overpaid 로 따로 알려 준다
import React from "react";
import { useOrderHistory } from "./orderHistory";
import { liveRows } from "./execAnalyticsCore";
import { useRouteCarrierFilter } from "./routeCarriers";
import { useCompanyRows } from "./companyColStore";
import { useArPaid } from "./arPaidLive";
import { receivablesOf, paidAmountOf } from "./arAging";

const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 미수금 요약 계산(순수 함수 — 테스트 · 데모용)
//  반환 { total, over30, clients, list, overpaid: [{ client, amount }], overpaidSum }
export function arSummaryOf({ orders = [], fixedRows = [], paid = {}, today }) {
  const all = receivablesOf({ orders, fixedRows, paid, today });
  const list = all.filter((x) => x.outstanding > 0);
  const total = list.reduce((s, x) => s + x.outstanding, 0);
  const over30 = list.reduce((s, x) => s + (x.aging?.b60 || 0) + (x.aging?.b90 || 0) + (x.aging?.over || 0), 0);
  // 💸 과입금 — 받은 돈이 올해 청구액보다 많은 거래처(예: 우리마트 558만원). 예전엔 어느 화면에도 안 보였다
  const overpaid = all.map((x) => ({ client: x.client, amount: paidAmountOf(x.paid) - x.billed })).filter((x) => x.amount > 10).sort((a, b) => b.amount - a.amount);
  return { total, over30, clients: list.length, list, overpaid, overpaidSum: overpaid.reduce((s, x) => s + x.amount, 0) };
}

// company: 회사 · dispatchData: 화면이 받는 오더(useOrderHistory 로 올해 1월부터 채워진다) · enabled: false 면 계산 안 함
//  반환: 위 요약 + ready(올해 오더 · 받은 돈을 다 읽었는지). 다 읽기 전에는 ready:false — 화면은 "불러오는 중"으로 보여 준다
export function useCompanyReceivables({ company, dispatchData = [], enabled = true }) {
  const today = kstToday();
  const year = today.slice(0, 4);
  const { loadRange } = useOrderHistory() || {};
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    if (!enabled || !loadRange || !company) return undefined;
    let alive = true;
    Promise.resolve(loadRange(`${year}-01-01`, today)).then((r) => { if (alive && r !== null) setLoaded(true); }).catch(() => {});
    return () => { alive = false; };
  }, [enabled, loadRange, company, year, today]);
  const carrierF = useRouteCarrierFilter(enabled ? company : "");
  const rows = React.useMemo(() => (enabled ? liveRows(dispatchData).filter((r) => carrierF.isCountable(r)) : []), [enabled, dispatchData, carrierF]);
  const paid = useArPaid({ company: enabled ? company : "", orders: rows, year });
  const fixedRows = useCompanyRows("fixedClients", enabled ? company : "");
  return React.useMemo(() => {
    if (!enabled || !paid || !loaded) return { ready: false, total: 0, over30: 0, clients: 0, list: [], overpaid: [], overpaidSum: 0 };
    return { ready: true, ...arSummaryOf({ orders: rows, fixedRows: fixedRows || [], paid, today }) };
  }, [enabled, paid, loaded, rows, fixedRows, today]);
}
