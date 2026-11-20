// ======================= functions/profitCore.mjs =======================
// ⭐ 2026-11-17 수익(수수료 · 이익 · 마진) 계산 한 곳 — 화면(src)과 서버(functions)가 같은 파일을 쓴다
//  화면: src/forkliftCore.js 가 이 파일을 가져와 다시 내보낸다(orderProfit · paidOut · profitTotals …)
//  서버: functions/aiAssistant.js · functions/dailyReport.js 가 import("./profitCore.mjs") 로 쓴다
//  다른 파일을 가져오지 않는다(브라우저 · Node 공용) · 테스트 scripts/profitEverywhere.test.mjs
//
//  수익(수수료) = 청구운임 − 기사운임 − 회사가 따로 지급한 돈(paidOut)
//   paidOut = 지게차비용(지게차 기사에게는 늘 회사가 준다) + 특수운임 중 받는사람 "외부" 항목 합(인력·주차장 등)
//  저장된 수수료 · 외부지급합 칸은 예전 식으로 남아 있을 수 있어 믿지 않고, 오더 칸에서 늘 다시 계산한다.

export const fkNum = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};
export const fkAmount = (o) => Math.max(0, fkNum(o?.지게차비용));

// 특수운임 종류 — 받는사람(payee) · 부담(mode) 기본값
export const SPECIAL_TYPES = [
  { key: "지게차", label: "지게차비용", payee: "외부", mode: "기사", desc: "지게차 기사에게 회사가 지급" },
  { key: "대기료", label: "대기료", payee: "기사", mode: "청구", desc: "상하차 대기 시간 보상" },
  { key: "수작업", label: "수작업·인력 상하차비", payee: "외부", mode: "청구", desc: "인력·수작업 상하차 인건비" },
  { key: "경유", label: "경유(추가 상하차지)", payee: "기사", mode: "청구", desc: "추가 상차·하차지 운임" },
  { key: "할증", label: "야간·휴일·긴급 할증", payee: "기사", mode: "청구", desc: "야간·주말·긴급 운행" },
  { key: "통행료", label: "통행료·주차비", payee: "기사", mode: "청구", desc: "기사가 낸 통행료·주차비 보전" },
  { key: "기타", label: "기타(직접 입력)", payee: "기사", mode: "청구", desc: "이름을 직접 정하는 항목" },
];
export const sfType = (k) => SPECIAL_TYPES.find((t) => t.key === k) || SPECIAL_TYPES[SPECIAL_TYPES.length - 1];
export const sfItems = (o) => (Array.isArray(o?.특수운임) ? o.특수운임 : []).filter((x) => x && fkNum(x.금액) > 0);
// 받는사람 "없음" = 거래처에 추가 청구만 하고 따로 주는 돈은 없음
export const sfPayee = (it) => (it?.받는사람 === "외부" || it?.받는사람 === "기사" || it?.받는사람 === "없음" ? it.받는사람 : sfType(it?.종류).payee);
export const sfMode = (it) => {
  const m = ["기사", "회사", "청구"].includes(it?.부담) ? it.부담 : sfType(it?.종류).mode;
  if (sfPayee(it) === "없음") return "청구";
  return sfPayee(it) === "기사" && m === "기사" ? "청구" : m; // 기사에게 주는 돈을 기사에게서 뺄 수는 없다
};
// D = 기사운임에서 뺀 양(음수 = 더한 양) · C = 청구운임에 더한 양 · ext = 회사가 따로 지급(외부)
export function sfTotals(o) {
  let D = 0, C = 0, ext = 0;
  for (const it of sfItems(o)) {
    const a = Math.max(0, fkNum(it.금액)); const m = sfMode(it);
    if (sfPayee(it) === "없음") { C += a; continue; }
    if (sfPayee(it) === "기사") D -= a; else { ext += a; if (m === "기사") D += a; }
    if (m === "청구") C += a;
  }
  return { D, C, ext };
}

// 회사가 따로 지급하는 돈 합계(지게차 + 외부 특수운임)
export const paidOut = (o) => fkAmount(o) + sfTotals(o).ext;
// 수익(수수료) — 배차표 · 정산 · 매출 · 보고서 · AI 가 모두 이 식을 쓴다
export const orderProfit = (o) => fkNum(o?.청구운임) - fkNum(o?.기사운임) - paidOut(o);
// 🛠 2026-11-20 운임을 고칠 때 저장할 수수료 — PC patchDispatch(wasAuto)와 같은 규칙을 한 곳에(모바일도 같이 쓴다)
//  예전 수수료가 비었거나 자동 계산 값(청구 − 기사 − 회사 지급분 · 또는 청구 − 기사)이었으면 새 값으로 다시 계산하고,
//  사람이 직접 넣은 수수료면 그대로 둔다. prev 가 없으면(새 오더) 계산 값.
export function nextFee(prev, next) {
  if (!prev) return orderProfit(next);
  const f = prev.수수료;
  const auto = f == null || String(f).trim() === "" || fkNum(f) === orderProfit(prev) || fkNum(f) === fkNum(prev.청구운임) - fkNum(prev.기사운임)
    || fkNum(f) === fkNum(prev.청구운임) - fkNum(prev.기사운임) - Math.max(0, fkNum(prev.외부지급합 != null ? prev.외부지급합 : prev.지게차비용));
  return auto ? orderProfit(next) : fkNum(f);
}
// 매입(회사가 이 오더로 내보내는 돈) = 기사운임 + 회사가 따로 지급한 돈 → 매출 − 매입 = 수익
export const orderCost = (o) => fkNum(o?.기사운임) + paidOut(o);
// 수익률(%) — 매출 0이면 0
export const profitRate = (profit, sale) => (fkNum(sale) ? (Number(profit) / fkNum(sale)) * 100 : 0);

// 합계 — 줄마다 보이는 수수료(orderProfit)를 그대로 더한다
//  rows: 오더 배열 · get(r): 화면에서 고치는 중인 값을 덮어쓴 오더를 돌려주는 함수(없으면 오더 그대로)
//  반환 { cnt, sale(청구 합), drv(기사 합), paid(회사가 따로 지급한 합), buy(매입 = drv + paid), fee(수수료 합 = sale − drv − paid) }
export function profitTotals(rows = [], get = null) {
  let sale = 0, drv = 0, paid = 0, cnt = 0;
  for (const r0 of rows || []) {
    const r = get ? get(r0) : r0;
    cnt += 1; sale += fkNum(r?.청구운임); drv += fkNum(r?.기사운임); paid += paidOut(r);
  }
  return { cnt, sale, drv, paid, buy: drv + paid, fee: sale - drv - paid };
}
