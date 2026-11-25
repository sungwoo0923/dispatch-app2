// ⭐ 2026-11-17 수익(수수료 · 이익 · 마진) 한 식 — 화면 · 정산 · 분석 · 서버가 모두 같은 숫자를 내는지
// 실행: node scripts/profitEverywhere.test.mjs
//  식: 수익 = 청구운임 − 기사운임 − 회사가 따로 지급(지게차비용 + 받는사람 "외부" 특수운임)
//  · 계산 원본은 functions/profitCore.mjs 하나 — src/forkliftCore.js 가 다시 내보내고, 서버(AI 비서 · 일일 보고 · 배차표 동기화)는 import() 한다
//  · 저장된 수수료 · 외부지급합 칸은 예전 식으로 남아 있을 수 있어 믿지 않는다
import * as PC from "../functions/profitCore.mjs";
import * as FC from "../src/forkliftCore.js";
import { profitOf as teamProfitOf, saleOf as saleOfTeam } from "../src/teamReportCore.js";
import { calcIncentive, toInt as salesToInt } from "../src/salesCore.js";
import { summarizeSettle } from "../src/settleCore.js";
import { clientMatrix } from "../src/freight/freightCore.js";
import { buildUpdate, localAnswer } from "../src/aiAssistantCore.js";
import { carrierFarePatch } from "../functions/carrierFareCore.mjs";

let pass = 0, fail = 0;
const eq = (a, b, msg) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++; if (!ok) console.log("  ✗", msg, "→", JSON.stringify(a), "기대", JSON.stringify(b)); };

// 1) 화면(src)과 서버(functions)가 같은 함수
for (const k of ["fkNum", "fkAmount", "SPECIAL_TYPES", "sfType", "sfItems", "sfPayee", "sfMode", "sfTotals", "paidOut", "orderProfit", "orderCost", "profitRate", "profitTotals"]) {
  eq(FC[k] === PC[k], true, `forkliftCore.${k} = profitCore.${k}(같은 함수)`);
}

// 2) 오더 예시 — 지게차 세 방식 · 외부 특수운임 · 기사에게 주는 특수운임 · 청구만(없음) · 문자열 금액 · 저장값이 틀린 오더
const ym = "2026-11";
// 📏 2026-11-25 매출 합계는 배차완료 오더만(functions/salesRule.mjs) — 아래 예시는 모두 배차완료(ok() 로 붙인다)
const ok = (o) => ({ 배차상태: "배차완료", ...o });
const O = [
  { _id: "a", 거래처명: "가", 상차일: `${ym}-03`, 청구운임: "500,000", 기사운임: "300,000", 지게차비용: "100000", 지게차부담: "기사" }, // 100,000
  { _id: "b", 거래처명: "가", 상차일: `${ym}-03`, 청구운임: 500000, 기사운임: 400000, 지게차비용: 100000, 지게차부담: "회사" },        // 0
  { _id: "c", 거래처명: "나", 상차일: `${ym}-04`, 청구운임: 600000, 기사운임: 400000, 지게차비용: 100000, 지게차부담: "청구" },        // 100,000
  { _id: "d", 거래처명: "나", 상차일: `${ym}-04`, 청구운임: 330000, 기사운임: 250000, 특수운임: [{ 종류: "수작업", 금액: 30000, 받는사람: "외부", 부담: "청구" }] }, // 50,000
  { _id: "e", 거래처명: "다", 상차일: `${ym}-05`, 청구운임: 320000, 기사운임: 270000, 특수운임: [{ 종류: "대기료", 금액: 20000 }] },   // 50,000(기사에게 주는 돈은 기사운임에 이미 들어 있다)
  { _id: "f", 거래처명: "다", 상차일: `${ym}-05`, 청구운임: 310000, 기사운임: 250000, 특수운임: [{ 종류: "기타", 금액: 10000, 받는사람: "없음" }] }, // 60,000
  // 저장된 외부지급합 · 수수료가 예전 값(특수운임을 나중에 넣고 안 맞춤) — 오더 칸 기준으로 다시 계산해야 한다
  { _id: "g", 거래처명: "라", 상차일: `${ym}-06`, 청구운임: 400000, 기사운임: 300000, 지게차비용: 50000, 특수운임: [{ 종류: "수작업", 금액: 20000, 받는사람: "외부", 부담: "회사" }], 외부지급합: 50000, 수수료: "100000" }, // 30,000
  { _id: "h", 거래처명: "라", 상차일: `${ym}-06`, 청구운임: 200000, 기사운임: 180000 }, // 20,000(지게차 없음 — 예전과 같다)
].map(ok);
const want = [100000, 0, 100000, 50000, 50000, 60000, 30000, 20000];
eq(O.map(PC.orderProfit), want, "오더별 수익");
eq(O.map(PC.paidOut), [100000, 100000, 100000, 30000, 0, 0, 70000, 0], "오더별 회사가 따로 지급");
eq(O.map((o) => PC.fkNum(o.청구운임) - PC.orderCost(o)), want, "매출 − 매입(기사 + 회사 지급) = 수익");
const T = PC.profitTotals(O);
const sumWant = want.reduce((a, b) => a + b, 0);
eq([T.cnt, T.fee, T.buy, T.sale - T.buy], [8, sumWant, T.drv + T.paid, sumWant], "합계 = 줄 수익 합 · 매입 = 기사 + 회사 지급");
eq(PC.profitRate(T.fee, T.sale).toFixed(4), ((sumWant / T.sale) * 100).toFixed(4), "수익률");
eq(O.map(teamProfitOf), want, "팀 실적 보고서(teamReportCore.profitOf)");

// 3) 영업 인센티브(salesCore) — 매입 = 기사 + 회사 지급 → 매출이익 = 수익 합
const inc = calcIncentive({ orders: O, accounts: ["가", "나", "다", "라"].map((c) => ({ client: c, uid: "u1", since: "2024-01-01" })), policy: { minMargin: 0, useTiers: false, rate: 10 }, uid: "u1", ym });
eq([inc.sale, inc.profit], [T.sale, sumWant], "영업 인센티브 매출 · 매출이익");

// 4) 정산 홈(settleCore) — 매출이익 = 청구 − 기사 − 회사 지급
const S = summarizeSettle(O, ym, () => "미작성", `${ym}-20`);
eq([S.sale, S.drv, S.paid, S.buy, S.profit], [T.sale, T.drv, T.paid, T.drv + T.paid, sumWant], "정산 홈 매출 · 기사 · 회사 지급 · 매입 · 매출이익");

// 5) 거래처 360(freightCore) — 내륙 배차 오더 수익
const cm = clientMatrix([], O);
eq(cm.reduce((a, c) => a + c.profit, 0), sumWant, "거래처 360 내륙 수익 합");

// 6) AI 비서(화면) — 운임을 고치면 수수료를 지게차까지 빼서 다시 / 이번 달 매출 답
const u = buildUpdate(O[0], [{ field: "청구운임", after: "520000" }]);
eq(u.patch.수수료, "120000", "AI 비서 운임 수정: 520,000 − 300,000 − 지게차 100,000");
const ans = localAnswer("이번달 매출", { dispatches: O, today: `${ym}-20` }) || "";
eq(ans.includes(`수익 ${sumWant.toLocaleString("ko-KR")}`) || ans.includes(`수익 ${sumWant.toLocaleString()}`), true, "AI 비서 이번 달 수익 = 수익 합");

// 7) 운송업체 수수료율 자동(functions/carrierFareCore) — 지게차 오더는 회사 지급분까지 뺀 수수료
const cf = carrierFarePatch({ 배차표Id: "rb", 청구운임: 500000, 기사운임: "", 지게차비용: 50000, 지게차부담: "회사", 추가정보: { 운송업체: "X" } }, { carriers: [{ name: "X", rate: 10 }] });
eq([cf?.기사운임, cf?.수수료], ["450000", "0"], "수수료율 10% · 회사 부담 지게차 50,000 → 수수료 0");
const cf0 = carrierFarePatch({ 배차표Id: "rb", 청구운임: 500000, 기사운임: "", 추가정보: { 운송업체: "X" } }, { carriers: [{ name: "X", rate: 10 }] });
eq(cf0?.수수료, "50000", "지게차 없으면 예전과 같다(청구 − 기사)");

// 7-2) 🛠 2026-11-25 금액 읽기 — 매출(청구운임 합)을 읽는 곳도 수익(orderProfit)과 같은 fkNum 규칙
//  예전엔 parseInt(…replace(/[^\d-]/g, ""))라 소수점을 지웠다: 200000.4 → 2,000,004 · "181818.18"(엑셀 계산 값) → 18,181,818
const odd = [200000.4, "181818.18", "500,000원", "-180,000", "", null, "1,000"];
eq(odd.map((v) => saleOfTeam({ 청구운임: v })), odd.map((v) => PC.fkNum(v)), "팀 실적 매출 읽기 = fkNum");
eq(odd.map(salesToInt), odd.map((v) => PC.fkNum(v)), "영업 인센티브 금액 읽기 = fkNum");
eq(odd.map((v) => PC.fkNum(v)), [200000, 181818, 500000, -180000, 0, 0, 1000], "fkNum 예시 값");

// 8) 서버(functions/*.js)가 쓰는 동적 import 도 같은 결과
const PD = await import("../functions/profitCore.mjs");
eq(O.map(PD.orderProfit), want, "서버 import() 결과도 같다");

console.log(`수익 한 식(profitEverywhere) 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
if (fail) process.exit(1);
