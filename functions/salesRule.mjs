// ======================= functions/salesRule.mjs =======================
// 📏 2026-11-25 "매출"에 넣는 오더 한 규칙 — 매출관리 · 홈 · 일일 경영 보고 · 팀 실적 · 담당자 실적 · 경영 분석 · 월간 보고 ·
//  월 비교 · 인사이트 · 영업 · AI 비서(화면 · 서버)가 모두 이 파일 하나를 쓴다(사용자 결정: 배차완료 기준).
//  화면: src/salesRule.js 가 다시 내보낸다 · 서버: functions/aiAssistant.js · functions/dailyReport.js 가 import() 한다
//  다른 파일은 profitCore.mjs 만 가져온다(브라우저 · Node 공용) · 테스트 scripts/salesRule.test.mjs
//
//  매출(청구운임 합) · 매입 · 수익(수수료) · 마진을 셀 때 넣는 것
//   1) 배차상태가 "배차완료"인 오더 — 배차중 · 미배차(기사운임이 비어 수익이 부풀려 보이는 오더)는 빼요
//   2) 취소 오더(배차상태 "배차취소" · 상태 취소/배차취소/오더취소/취소됨)는 빼요
//   3) 화주사 화면에 보낸 사본(source "transport_transmit")은 빼요 — 원본 오더가 이미 매출이라 두 번 세지 않게
//   4) 고정거래처 매출(fixedClients · 날짜별로 따로 적는 매출)은 배차완료로 보고 더해요(fixedSalesRow)
//  달 기준 = 🗓 2026-11-25 청구월(마감월 → 없으면 상차일 달 · 고정거래처는 날짜 달) — functions/arCore.mjs monthOf 그대로(salesMonthOf)
//   예) 10/31 상차 · 마감월 11월 오더 → 11월 매출. 일 매출(오늘 매출 · 일별 그래프)은 상차일 그대로
//  오늘 오더 · 미배차 · 배차중 건수처럼 "매출"이 아닌 운영 숫자는 이 규칙을 쓰지 않는다.
import { fkNum, orderProfit } from "./profitCore.mjs";
import { monthOf as arMonthOf } from "./arCore.mjs"; // 🗓 청구월(마감월) 한 정의 — 미수금 · 회계 · 거래명세서와 같은 함수

export const CANCEL_STATES = ["취소", "배차취소", "오더취소", "취소됨"];
export const isCancelledOrder = (o) => o?.배차상태 === "배차취소" || CANCEL_STATES.includes(o?.상태);
export const isShipperCopy = (o) => o?.source === "transport_transmit";
export const isDoneOrder = (o) => String(o?.배차상태 || "").trim() === "배차완료";
// ⭐ 매출에 넣는 오더인지 — 화면 · 서버 공용
export const isSalesOrder = (o) => !!o && isDoneOrder(o) && !isCancelledOrder(o) && !isShipperCopy(o);
export const salesDateOf = (o) => String(o?.상차일자 || o?.상차일 || o?.상차 || o?.날짜 || "").slice(0, 10);
// 매출 달 = 청구월(마감월 우선) — 미수금 · 회계 · 정산과 같은 한 정의(arCore.monthOf)
export const salesMonthOf = (o) => arMonthOf(o) || salesDateOf(o).slice(0, 7);
// 청구월 안의 날짜 — 상차일이 청구월과 다르면(이월) 청구월 1일로 본다(월 누계 그래프 · "N일까지" 비교용, arCore 나이 계산과 같은 규칙)
export const salesBillDateOf = (o) => { const m = salesMonthOf(o); const d = salesDateOf(o); return !m ? d : d.slice(0, 7) === m ? d : `${m}-01`; };
export const salesBillDayOf = (o) => Number(salesBillDateOf(o).slice(8, 10)) || 1;

// 고정거래처 매출 한 줄 → 오더 모양(매출관리 Settlement 가 쓰던 식 그대로)
//  수수료 = 적어 둔 수수료가 있으면 그 값, 없으면 max(청구 − 기사, 0)
export function fixedSalesRow(r) {
  const sale = fkNum(r?.청구운임);
  const driver = fkNum(r?.기사운임);
  const fee = r?.수수료 !== undefined && r?.수수료 !== null && String(r.수수료).trim() !== "" ? fkNum(r.수수료) : Math.max(sale - driver, 0);
  return {
    상차일: r?.날짜 || r?.상차일 || "",
    출발지: r?.출발지 || "",
    도착지: r?.도착지 || "",
    거래처명: r?.거래처명 || "",
    청구운임: sale,
    기사운임: driver,
    수수료: fee,
    배차상태: "배차완료",
    __fixed: true, // 고정거래처(오더가 아님 — 오더 건수에는 안 센다)
  };
}
export const fixedSalesRows = (fixedRows) => (Array.isArray(fixedRows) ? fixedRows : []).map(fixedSalesRow);
// 매출 줄 = 매출 오더 + 고정거래처
export const salesRows = (orders = [], fixedRows = []) => [...(orders || []).filter(isSalesOrder), ...fixedSalesRows(fixedRows)];

// 매출 합계 — 넣는 줄만 더한다 { cnt, sale, drv, paid, buy, profit }
//  수익 = 줄마다 orderProfit(청구 − 기사 − 회사가 따로 지급) 합
export function salesTotals(rows = []) {
  let cnt = 0, sale = 0, drv = 0, profit = 0;
  for (const r of rows || []) {
    if (!isSalesOrder(r)) continue;
    cnt += 1; sale += fkNum(r.청구운임); drv += fkNum(r.기사운임); profit += orderProfit(r);
  }
  const buy = sale - profit;
  return { cnt, sale, drv, paid: buy - drv, buy, profit };
}

// 화면에 적는 기준 문구(모든 화면이 같은 말)
export const SALES_RULE_LABEL = "매출·수익은 배차완료 오더 + 고정거래처 기준(취소 · 배차중 · 미배차 제외, 상차일 기준) — 매출관리와 같아요";
