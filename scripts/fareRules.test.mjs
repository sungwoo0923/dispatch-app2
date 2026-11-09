// 운임 규칙(운임구분) 계산 단위 테스트 — 기본 수수료율 · 오더별 수수료율 · 재계산 · 빈 값
// 실행: node scripts/fareRules.test.mjs
import { applyFareRule, effectiveFareRule, fareFormChange, farePatchOf, fareIsManual, farePctOf } from "../src/fareRulesCore.js";

let pass = 0, fail = 0;
const eq = (a, b, msg) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++; if (!ok) console.log("  ✗", msg, "→", JSON.stringify(a), "기대", JSON.stringify(b)); };
const rules = [
  { id: "a", name: "월대", type: "percent", value: 7, active: true },
  { id: "b", name: "일대", type: "percent", value: 7, active: true },
  { id: "c", name: "정액", type: "fixed", value: 30000, active: true },
];

// 1) 운임구분 고르면 기본 % 채움 + 계산
let f = fareFormChange({ 청구운임: "300000", 기사운임: "" }, "운임구분", "월대", rules);
eq(f.운임구분수수료율, "7", "월대 선택 → 기본 7% 채움");
eq([f.기사운임, f.수수료], ["279000", "21000"], "300,000 × 7% → 기사 279,000 · 수수료 21,000");

// 2) 이 오더만 10%로
f = fareFormChange(f, "운임구분수수료율", "10", rules);
eq([f.기사운임, f.수수료, f.운임수동], ["270000", "30000", false], "오더별 10% → 기사 270,000 · 수수료 30,000");

// 3) 청구운임 바꾸면 오더의 10%로 다시 계산
f = fareFormChange(f, "청구운임", "500000", rules);
eq([f.기사운임, f.수수료], ["450000", "50000"], "청구 500,000 · 10% 유지");

// 4) 규칙 값을 나중에 바꿔도 저장된 오더 %는 그대로
const rules2 = rules.map((r) => (r.name === "월대" ? { ...r, value: 5 } : r));
eq(effectiveFareRule(f, rules2).value, 10, "규칙 5%로 바꿔도 오더는 10%");
eq(fareFormChange(f, "__reapply", null, rules2).기사운임, "450000", "규칙대로(↺)도 오더 10% 기준");

// 5) 예전 오더(수수료율 칸 없음) → 규칙 값
eq(effectiveFareRule({ 운임구분: "월대" }, rules2).value, 5, "칸 없는 예전 오더 → 규칙 5%");
eq(fareFormChange({ 운임구분: "월대", 청구운임: "100000", 기사운임: "" }, "청구운임", "100000", rules2).기사운임, "95000", "예전 오더 청구 입력 → 5%");

// 6) 빈 값 · 소수
eq(farePctOf({ 운임구분수수료율: "" }), null, "빈 칸 → 규칙 값 사용");
f = fareFormChange({ 운임구분: "월대", 운임구분수수료율: "7", 청구운임: "123457" }, "운임구분수수료율", "7.5", rules);
eq([f.운임구분수수료율, f.기사운임, f.수수료], ["7.5", "114198", "9259"], "7.5% → 원 단위 반올림");
f = fareFormChange({ 운임구분: "월대", 운임구분수수료율: "7", 청구운임: "100000" }, "운임구분수수료율", "", rules);
eq([f.기사운임, f.수수료], ["93000", "7000"], "% 칸을 지우면 규칙 기본 7%");
f = fareFormChange({ 운임구분: "월대", 운임구분수수료율: "7", 청구운임: "" }, "운임구분수수료율", "10", rules);
eq([f.기사운임 ?? "", f.운임구분수수료율], ["", "10"], "청구운임 없으면 기사운임 계산 안 함");

// 7) 사람이 고친 기사운임 → 수동, %를 바꾸면 새 %로 다시
f = fareFormChange({ 운임구분: "월대", 운임구분수수료율: "7", 청구운임: "100000", 기사운임: "93000" }, "기사운임", "90000", rules);
eq([f.운임수동, f.수수료], [true, "10000"], "기사운임 직접 수정 → 수동");
eq(fareIsManual(f, rules), true, "수동 표시");
f = fareFormChange(f, "운임구분수수료율", "8", rules);
eq([f.운임수동, f.기사운임], [false, "92000"], "% 바꾸면 수동 풀리고 8%로");

// 8) 운임구분 다시 고르면 그 구분 기본값
f = fareFormChange(f, "운임구분", "일대", rules);
eq([f.운임구분수수료율, f.기사운임], ["7", "93000"], "일대로 바꾸면 기본 7%");
// 9) 해제 → % 비움
f = fareFormChange(f, "운임구분", "", rules);
eq([f.운임구분수수료율, f.기사운임, f.수수료], ["", "", "100000"], "선택 안 함 → % 비움 · 기사운임 비움");

// 10) 정액 규칙도 오더별 금액(숫자 폼)
f = fareFormChange({ 청구운임: 200000, 기사운임: 0 }, "운임구분", "정액", rules, { asString: false });
eq([f.운임구분수수료율, f.기사운임, f.수수료], [30000, 170000, 30000], "정액 30,000");
f = fareFormChange(f, "운임구분수수료율", "50000", rules, { asString: false });
eq([f.기사운임, f.수수료], [150000, 50000], "이 오더만 정액 50,000");

// 11) 저장값
eq(farePatchOf({ 운임구분: "월대", 운임수동: false, 운임구분수수료율: "10" }), { 운임구분: "월대", 운임수동: false, 운임구분수수료율: 10 }, "저장 → 숫자 10");
eq(farePatchOf({ 운임구분: "월대" }), { 운임구분: "월대", 운임수동: false }, "칸 없으면 저장 안 함");
eq(farePatchOf({ 운임구분: "" }), {}, "운임구분 없으면 아무것도");
eq(applyFareRule(null, 1000), { 기사운임: 1000, 수수료: 0 }, "규칙 없음");

console.log(`운임구분 수수료율 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
