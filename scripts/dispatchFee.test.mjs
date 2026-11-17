// ⭐ 2026-11-17 배차현황 수수료 — 줄 수수료와 합계 칩이 같은 식인지(운송사 제보 화면 숫자 그대로)
// 실행: node scripts/dispatchFee.test.mjs
//  제보: 기사 이광범 · 운임구분 "영진차량"(수수료 10%) · 지게차 180,000(기사운임에서 차감) 15건
//   줄:   청구 1,074,499 · 기사 787,049 · 수수료 107,450(= 청구 10%)
//   칩:   청구 8,532,709 · 기사 4,979,438 · 수수료 3,553,271(41.6%)  ← 청구 합 − 기사 합(지게차 2,700,000을 안 뺌)
//   맞는 칩 수수료: 853,271(10.0%) = 줄 수수료 합 = 청구 − 기사 − 회사가 지게차 기사에게 준 돈
import { fareFormChange, fareIsManual } from "../src/fareRulesCore.js";
import { forkliftApply, orderProfit, paidOut, profitTotals } from "../src/forkliftCore.js";

let pass = 0, fail = 0;
const eq = (a, b, msg) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++; if (!ok) console.log("  ✗", msg, "→", JSON.stringify(a), "기대", JSON.stringify(b)); };
const n = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
const rules = [{ id: "y", name: "영진차량", type: "percent", value: 10, active: true }];
const FORK = { 지게차비용: "180000", 지게차부담: "기사" };
const fork = (o) => forkliftApply(o, { ...o, ...FORK }, "__forklift");

// 1) 지게차를 먼저 넣고 → 운임구분 → 청구운임 (제보 화면 순서)
let o = fork({ 청구운임: "", 기사운임: "" });
eq([n(o.청구운임), n(o.기사운임), n(o.수수료)], [0, -180000, 0], "청구 없이 지게차만: 기사 −180,000 · 수수료 0(줄 12~15)");
o = fareFormChange(o, "운임구분", "영진차량", rules);
o = fareFormChange(o, "청구운임", "1074499", rules);
eq([n(o.청구운임), n(o.기사운임), n(o.수수료)], [1074499, 787049, 107450], "청구 1,074,499 → 기사 787,049(967,049 − 지게차 180,000) · 수수료 107,450");
eq(orderProfit(o), 107450, "줄 수수료(orderProfit) = 107,450");
eq(n(o.청구운임) - n(o.기사운임), 287450, "청구 − 기사 = 287,450(회사가 지게차 기사에게 줄 180,000 포함)");
eq(paidOut(o), 180000, "회사가 따로 지급 = 180,000");
eq(fareIsManual(o, rules), false, "지게차 기사 차감만 있으면 '직접 고침(↺ 규칙대로)'으로 보지 않는다");
eq(fareFormChange(o, "기사운임", "787049", rules).운임수동, false, "같은 기사운임을 다시 넣어도 수동 아님");
eq(fareFormChange(o, "기사운임", "800000", rules).운임수동, true, "다른 기사운임 → 수동");

// 2) 운임 먼저 → 지게차 나중 — 순서가 달라도 같은 결과
let p = fareFormChange({ 청구운임: "", 기사운임: "" }, "운임구분", "영진차량", rules);
p = fareFormChange(p, "청구운임", "726299", rules);
eq([n(p.기사운임), n(p.수수료)], [653669, 72630], "지게차 전: 기사 653,669 · 수수료 72,630");
p = fork(p);
eq([n(p.청구운임), n(p.기사운임), n(p.수수료), orderProfit(p)], [726299, 473669, 72630, 72630], "지게차 후: 기사 473,669 · 수수료 72,630(제보 2번 줄)");
// 청구운임을 고쳐도 지게차 차감은 한 번만
p = fareFormChange(p, "청구운임", "726300", rules);
eq([n(p.기사운임), orderProfit(p)], [473670, 72630], "청구 다시 고쳐도 기사 차감 180,000은 한 번만");
p = fareFormChange(p, "청구운임", "726299", rules);
// [↺ 규칙대로]도 차감 유지
eq(n(fareFormChange(p, "__reapply", null, rules).기사운임), 473669, "규칙대로 다시 계산해도 지게차 차감 유지");

// 3) 지게차 칸이 빠진 폼으로 규칙을 다시 돌리면(예전 모바일 '일부 수정') 차감이 사라진다 — 오더 칸을 같이 넘겨야 한다
const bare = fareFormChange({ 청구운임: 1074499, 기사운임: 787049, 운임구분: "영진차량" }, "__reapply", null, rules, { asString: false, withFee: false });
eq(bare.기사운임, 967049, "지게차 칸 없이 계산하면 967,049(차감 빠짐) — 그래서 모바일은 오더 전체를 넘긴다");
const full = fareFormChange({ ...o, 청구운임: 1074499, 기사운임: 787049 }, "__reapply", null, rules, { asString: false, withFee: false });
eq(full.기사운임, 787049, "오더 칸을 같이 넘기면 787,049 그대로");

// 4) 15건 합계 — 줄 1~11(청구 있는 오더) + 줄 12~15(청구 0 · 기사 −180,000)
const sales = [1074499, 726299, 748000, 748000, 748000, 748000, 748000, 748000, 748000, 748000, 747911];
const rows = sales.map((s) => fareFormChange(fork(fareFormChange({ 청구운임: "", 기사운임: "" }, "운임구분", "영진차량", rules)), "청구운임", String(s), rules));
for (let i = 0; i < 4; i++) rows.push(fork({ 청구운임: "", 기사운임: "" }));
const t = profitTotals(rows);
eq(t.cnt, 15, "총 15건");
eq(t.sale, 8532709, "청구 합 8,532,709");
eq(t.drv, 4979438, "기사 합 4,979,438(제보 칩과 같음)");
eq(t.paid, 2700000, "회사가 지게차 기사에게 준 돈 180,000 × 15 = 2,700,000");
eq(t.fee, 853271, "수수료 합 853,271 = 줄 수수료 합");
eq(t.fee, rows.reduce((a, r) => a + orderProfit(r), 0), "칩 수수료 = 줄 수수료 합(같은 함수)");
eq(t.sale - t.drv, 3553271, "예전 칩 식(청구 합 − 기사 합) = 3,553,271 — 2,700,000 많았다");
eq(Math.round((t.fee / t.sale) * 1000) / 10, 10, "수수료율 10.0%(예전 41.6%)");
eq(rows.reduce((a, r) => a + n(r.수수료), 0), 853271, "저장되는 수수료 칸도 같은 합");

// 5) 화면에서 고치는 중인 값(get)으로 합계
eq(profitTotals([o], (r) => ({ ...r, 기사운임: "700000" })).fee, 1074499 - 700000 - 180000, "get으로 고친 값 반영");
eq(profitTotals([]).fee, 0, "빈 목록");
eq(profitTotals([{ 청구운임: "100,000", 기사운임: "90,000" }]), { cnt: 1, sale: 100000, drv: 90000, paid: 0, fee: 10000 }, "지게차 없는 오더는 예전과 같음");

console.log(`배차현황 수수료(줄 · 합계) 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
