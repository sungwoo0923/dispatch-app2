// 특수운임(지게차 + 대기료·수작업·경유·할증·통행료·기타) 단위 테스트 — node scripts/specialFare.test.mjs
import { specialApplyAll, orderProfit, paidOut, forkliftApply, forkliftClear, specialLines, hasSpecial, specialCount, sfMode } from "../src/forkliftCore.js";
import { fareFormChange } from "../src/fareRulesCore.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; if (!ok) console.log(`  ✗ ${name} → ${JSON.stringify(got)} 기대 ${JSON.stringify(want)}`); };
const v = (o) => [Number(o.청구운임), Number(o.기사운임), Number(o.수수료), orderProfit(o)];
const base = { 청구운임: "500000", 기사운임: "400000", 수수료: "100000" };

// 1) 지게차만(기사 차감)
let o = specialApplyAll(base, { fork: { 지게차비용: 100000, 지게차부담: "기사" } });
eq("지게차 기사 차감", v(o), [500000, 300000, 100000, 100000]);
eq("지게차 외부지급합", paidOut(o), 100000);
// 2) 대기료(기사에게 · 추가 청구) → 청구 +, 기사 +, 수익 그대로
o = specialApplyAll(base, { items: [{ 종류: "대기료", 금액: 30000 }] });
eq("대기료 추가 청구", v(o), [530000, 430000, 100000, 100000]);
// 3) 대기료(기사에게 · 회사 부담) → 기사 +, 수익 −
o = specialApplyAll(base, { items: [{ 종류: "대기료", 금액: 30000, 부담: "회사" }] });
eq("대기료 회사 부담", v(o), [500000, 430000, 70000, 70000]);
// 4) 기사에게 주는 돈을 기사 차감으로 고르면 추가 청구로 바뀐다
eq("기사 받는 돈은 기사 차감 불가", sfMode({ 종류: "대기료", 부담: "기사" }), "청구");
// 5) 수작업(외부 · 추가 청구) → 청구 +, 회사가 따로 지급, 수익 그대로
o = specialApplyAll(base, { items: [{ 종류: "수작업", 금액: 50000 }] });
eq("수작업 외부 추가 청구", v(o), [550000, 400000, 100000, 100000]);
eq("수작업 외부지급", paidOut(o), 50000);
// 6) 수작업(외부 · 기사 차감)
o = specialApplyAll(base, { items: [{ 종류: "수작업", 금액: 50000, 부담: "기사" }] });
eq("수작업 기사 차감", v(o), [500000, 350000, 100000, 100000]);
// 7) 여러 항목 조합: 지게차(기사 차감 100k) + 대기료(청구 30k) + 통행료(회사 10k) + 기타 외부 회사 20k
o = specialApplyAll(base, { fork: { 지게차비용: 100000, 지게차부담: "기사" }, items: [
  { 종류: "대기료", 금액: 30000 }, { 종류: "통행료", 금액: 10000, 부담: "회사" }, { 종류: "기타", 이름: "보조비", 금액: 20000, 부담: "회사", 받는사람: "외부" },
] });
// 청구 = 500+30 = 530 · 기사 = 400 −100 +30 +10 = 340 · 외부 = 100+20 = 120 · 수익 = 530 − 340 − 120 = 70
eq("조합", v(o), [530000, 340000, 70000, 70000]);
eq("조합 건수", specialCount(o), 4);
eq("조합 내역", specialLines(o).length, 4);
// 8) 전부 빼기 → 원래 운임
const back = specialApplyAll(o, {});
eq("전부 빼기 복원", v(back), [500000, 400000, 100000, 100000]);
eq("빼면 특수 없음", hasSpecial(back), false);
// 9) 다시 적용 → 같은 결과(두 번 적용해도 쌓이지 않음)
const again = specialApplyAll(specialApplyAll(base, { items: [{ 종류: "경유", 금액: 40000 }] }), { items: [{ 종류: "경유", 금액: 40000 }] });
eq("재적용 중복 없음", v(again), [540000, 440000, 100000, 100000]);
// 10) 금액만 바꾸기
const changed = specialApplyAll(again, { items: [{ 종류: "경유", 금액: 10000 }] });
eq("금액 변경", v(changed), [510000, 410000, 100000, 100000]);
// 11) 지게차만 빼기(forkliftClear) — 다른 항목은 그대로
let mix = specialApplyAll(base, { fork: { 지게차비용: 100000, 지게차부담: "기사" }, items: [{ 종류: "대기료", 금액: 30000 }] });
mix = forkliftClear(mix);
eq("지게차만 빼기", v(mix), [530000, 430000, 100000, 100000]);
// 12) 청구운임을 사람이 바꾸면 그 값 그대로(조정은 유지)
let ed = specialApplyAll(base, { items: [{ 종류: "대기료", 금액: 30000 }] });
ed = forkliftApply(ed, { ...ed, 청구운임: "600000" }, "청구운임");
eq("청구 직접 수정", [Number(ed.청구운임), Number(ed.기사운임), Number(ed.수수료)], [600000, 430000, 170000]);
// 13) 운임구분 재계산과 함께 — 7% 규칙, 청구 500,000 → 기사 465,000 기준에 대기료(기사에게) +30,000
const rules = [{ name: "월대", type: "percent", value: 7 }];
let fr = fareFormChange({ 청구운임: "500000", 기사운임: "" }, "운임구분", "월대", rules);
const fr0 = Number(fr.기사운임);
fr = specialApplyAll(fr, { items: [{ 종류: "대기료", 금액: 30000, 부담: "회사" }] });
eq("운임구분 + 대기료(회사)", Number(fr.기사운임), fr0 + 30000);
fr = fareFormChange(fr, "운임구분수수료율", "10", rules);
eq("수수료율 바꾸면 기준 다시 계산 + 대기료 유지", Number(fr.기사운임), 450000 + 30000);
eq("그때 수익", orderProfit(fr), 500000 - 480000);

console.log(`특수운임 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
