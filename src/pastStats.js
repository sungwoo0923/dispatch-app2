// ======================= src/pastStats.js =======================
// ⚡ 2026-11-24 LTE 속도 — 지난 기간 일별 매출·수익 집계(buildPastStats)만 따로 뗀 작은 파일.
//  예전엔 HomeDeck.jsx(차트 라이브러리 recharts 포함)에 있어서, 일일 경영 보고(dailyReportCore)가 이 함수 하나 때문에
//  모바일 첫 화면에서 차트 라이브러리(약 110KB)까지 같이 받았다. 계산은 HomeDeck과 똑같다(HomeDeck은 여기서 다시 내보낸다).
import { creatorOf } from "./monthCompare";
import { orderProfit, fkNum } from "./forkliftCore"; // ⭐ 2026-11-17 수익 = 청구 − 기사 − 회사가 따로 지급(지게차·외부 특수운임) — 배차표 수수료와 같은 식
import { isSalesOrder, salesBillDateOf } from "./salesRule"; // 📏 2026-11-25 매출 · 수익은 배차완료(+ 고정거래처)만 — 매출관리와 같은 함수(functions/salesRule.mjs)

const toWon = (v) => fkNum(v); // 🛠 2026-11-25 수익(orderProfit)과 같은 금액 읽기 — 예전엔 소수점을 지워 200000.4 → 2,000,004
const dateOf = (r) => String(r?.상차일자 || r?.상차일 || r?.상차 || "").slice(0, 10);

// ─── 지난 기간 집계(하루 1번) — 일별 / 청구일별 / 이번 달 담당자별 / 이번 달 거래처별 ─────────────
//  days[상차일] = [매출, 수익, 건수] — 📏 2026-11-25 매출 · 수익은 배차완료 오더(isSalesOrder)만 더하고, 건수는 예전처럼 취소 아닌 오더 전부(운영 숫자)
//  bill[청구일] = [매출, 수익] — 🗓 2026-11-25 달 · 연 매출용. 청구일 = 청구월(마감월) 안의 날짜(이월 오더는 청구월 1일 · salesRule.salesBillDateOf)
//    → 달 합계는 bill 로(미수금 · 회계와 같은 청구월), 오늘 매출 · 일별 그래프는 days 로(상차일)
//  staff · clients: 이번 달 — 매출 · 수익은 청구월, 건수는 상차일 달
//  고정거래처 줄(__fixed · salesRule.fixedSalesRow)은 매출 · 수익만 더하고 오더 건수에는 안 센다
//  isMoney: 매출에 넣을 줄인지(기본 = isSalesOrder) — 컨테이너 · 해상 · 항공 홈(FreightHomeDeck)은 예전처럼 진행 중 건도 넣고 상차일 달로 센다
export function buildPastStats(rows, thisMonth, isMoney = isSalesOrder) {
  const days = {}, bill = {}, staff = {}, clients = {};
  const inland = isMoney === isSalesOrder;
  for (const r of rows) {
    const d = dateOf(r);
    if (!d) continue;
    const money = isMoney(r);
    const s = money ? toWon(r.청구운임) : 0, p = money ? orderProfit(r) : 0; // ⭐ 2026-11-17 수익 식 · 📏 2026-11-25 배차완료만
    const c = r.__fixed ? 0 : 1;
    const e = days[d] || (days[d] = [0, 0, 0]);
    e[0] += s; e[1] += p; e[2] += c;
    const bd = money ? (inland ? salesBillDateOf(r) || d : d) : "";
    if (bd) { const b = bill[bd] || (bill[bd] = [0, 0]); b[0] += s; b[1] += p; }
    const cntIn = d.startsWith(thisMonth);
    const moneyIn = !!bd && bd.startsWith(thisMonth);
    if (cntIn || moneyIn) {
      const k = creatorOf(r) || "미지정";
      const st = staff[k] || (staff[k] = [0, 0, 0]);
      if (moneyIn) { st[0] += s; st[1] += p; }
      if (cntIn) st[2] += c;
      const cn = String(r.거래처명 || "").trim();
      if (cn && moneyIn) clients[cn] = (clients[cn] || 0) + s;
    }
  }
  return { days, bill, staff, clients, month: thisMonth };
}
// 🗓 청구일별 합 → [매출, 수익] (from ~ to: 청구일 "YYYY-MM-DD" 범위)
export const sumBill = (bill, from, to) => Object.entries(bill || {}).reduce((a, [d, v]) => (d >= from && d <= to ? [a[0] + v[0], a[1] + v[1]] : a), [0, 0]);
