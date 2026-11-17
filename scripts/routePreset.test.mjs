// 노선별 고정 특수운임 테스트 — node scripts/routePreset.test.mjs
//  functions/routePresetCore.mjs(찾기 · 자동 적용 계획 · 기존 자료 분석) + src/routePresetApply.js(오더에 적용 — forkliftCore 규칙)
import assert from "node:assert/strict";
import {
  AUTO, isNightLoad, parsePresetDoc, presetDocData, presetError, matchRoutePreset, planRoutePreset, applyPlanToRec, seedProposals, proposalsToPresets, itemsFromOrder, presetDocId,
} from "../functions/routePresetCore.mjs";
import { applyRoutePresets } from "../src/routePresetApply.js";
import { orderProfit, specialApplyAll } from "../src/forkliftCore.js";
import { fareFormChange, fareIsManual } from "../src/fareRulesCore.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n += 1; };
const P = (d, id = "x") => parsePresetDoc(presetDocData(d), id);

// ── 프리셋(에이제이 예시) ──
const presets = [
  P({ 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "트레이더스 칠곡", items: [{ 종류: "지게차", 금액: 35000, 부담: "청구" }] }, "a"),
  P({ 거래처명: "에이제이", 하차지명: "에브리데이 여주", items: [{ 종류: "지게차", 금액: 50000, 부담: "청구" }, { 종류: "할증", 이름: "야상", 금액: 20000, 받는사람: "없음", 부담: "청구", 조건: "야간" }] }, "b"),
  P({ 거래처명: "에이제이", 상차지명: "에이제이", items: [{ 종류: "대기료", 금액: 10000, 받는사람: "기사", 부담: "청구" }] }, "c"),
  parsePresetDoc({ 거래처명: "에이제이", 상차지명: "베베숲", 지게차비용: 30000, 지게차부담: "기사" }, "old"), // 예전 상차지 기억(v1) — 자동 적용 안 함
];
ok(presets[3].legacy && presets[3].사용 === false && presets[3].items[0].금액 === 30000, "v1 문서도 읽는다(자동 적용은 꺼짐)");
eq(presetError({ 거래처명: "에이제이", items: [{ 종류: "지게차", 금액: 1 }] }), "상차지나 하차지 중 하나는 입력해 주세요", "노선 없음");
ok(presetDocId("JY로지스틱스", { 거래처명: "에이제이", 하차지명: "트레이더스 칠곡" }) === "JY로지스틱스__rt__에이제이_____트레이더스칠곡", "문서 ID");

// 야간 상차
ok(isNightLoad({ 상차시간: "18:00" }) && isNightLoad({ 상차시간: "02:30" }) && !isNightLoad({ 상차시간: "09:00" }) && !isNightLoad({ 상차시간: "05:00" }), "18:00~05:00");
ok(isNightLoad({ 상차시간: "오후 8시" }) && isNightLoad({ 메모: "야상 · 대행료/50,000" }) && !isNightLoad({ 메모: "주간" }), "오후 8시 · 시트 꼬리표 야상");

// 찾기: 거래처+상차지+하차지 > 거래처+하차지 > 거래처+상차지 · 칸마다 먼저 찾은 것
{
  const m = matchRoutePreset({ 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "트레이더스칠곡" }, presets);
  eq(m.items.map((x) => [x.종류, x.금액]), [["지게차", 35000], ["대기료", 10000]], "칠곡: 지게차 35,000(정확) + 대기료(거래처+상차지)");
  const day = matchRoutePreset({ 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "에브리데이 여주", 상차시간: "10:00" }, presets);
  eq(day.items.map((x) => [x.종류, x.금액]), [["지게차", 50000], ["대기료", 10000]], "여주 낮: 야상 없음");
  const night = matchRoutePreset({ 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "에브리데이 여주", 상차시간: "21:00" }, presets);
  eq(night.items.map((x) => [x.종류, x.이름, x.금액]), [["지게차", "", 50000], ["할증", "야상", 20000], ["대기료", "", 10000]], "여주 밤: 야상 +20,000");
  eq(matchRoutePreset({ 거래처명: "에이제이", 상차지명: "베베숲", 하차지명: "어딘가" }, presets).items, [], "v1 상차지 기억은 자동 적용 안 함");
}

// ── 자동 적용(forkliftCore 규칙) ──
{
  const base = { 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "트레이더스 칠곡", 청구운임: "300000", 기사운임: "270000", 수수료: "30000" };
  const a = applyRoutePresets(base, presets);
  eq([a.지게차비용, a.지게차부담, a.지게차자동, a.청구운임, a.기사운임], ["35000", "청구", AUTO, "345000", "280000"], "칠곡: 지게차 35,000 청구 추가 · 대기료 10,000 기사에게(청구 추가)");
  eq(a.특수운임.map((x) => [x.종류, x.금액, x.auto]), [["대기료", 10000, AUTO]], "자동 항목 표시(auto)");
  eq(orderProfit(a), 30000, "수익 그대로(청구 345,000 − 기사 280,000 − 지게차 35,000)");
  ok(applyRoutePresets(a, presets) === a, "다시 적용해도 그대로(같은 객체)");
  // 노선을 바꾸면 자동 항목을 다시 계산 — 칠곡 → 여주(낮): 지게차 50,000
  const b = applyRoutePresets({ ...a, 하차지명: "에브리데이 여주", 상차시간: "09:00" }, presets);
  eq([b.지게차비용, b.청구운임, b.기사운임, b.특수운임.length], ["50000", "360000", "280000", 1], "여주로 바꾸면 지게차 50,000(35,000은 되돌림)");
  // 밤으로 바꾸면 야상 +20,000(청구만)
  const c = applyRoutePresets({ ...b, 상차시간: "22:00" }, presets);
  eq([c.청구운임, c.기사운임, orderProfit(c)], ["380000", "280000", 50000], "야상 2만원: 청구만(수익 +20,000)");
  // 다른 노선으로 → 자동 항목 모두 빠지고 운임은 원래대로
  const d = applyRoutePresets({ ...c, 거래처명: "다른 회사" }, presets);
  eq([d.청구운임, d.기사운임, d.지게차비용, (d.특수운임 || []).length, d.지게차자동], ["300000", "270000", "", 0, ""], "노선이 안 맞으면 자동 항목을 빼고 원래 운임");
  // 사람이 넣은 지게차는 그대로(자동 지게차 안 넣음) · 다른 칸(대기료)만 자동
  const manual = specialApplyAll(base, { fork: { 지게차비용: 40000, 지게차부담: "기사" }, items: [] });
  const m2 = applyRoutePresets(manual, presets);
  eq([m2.지게차비용, m2.지게차부담, m2.지게차자동, m2.특수운임.map((x) => x.종류)], ["40000", "기사", "", ["대기료"]], "수동 지게차는 그대로 · 대기료만 자동");
  // 팝업에서 직접 적용(특수운임수동) → 아무것도 안 함
  ok(applyRoutePresets({ ...base, 특수운임수동: true }, presets).지게차비용 === undefined, "특수운임수동이면 건너뜀");
  // 서버용 계산(applyPlanToRec)이 화면(specialApplyAll)과 같은 값
  for (const o of [base, { ...base, 하차지명: "에브리데이 여주", 상차시간: "23:00" }, manual]) {
    const x = applyRoutePresets(o, presets); const y = applyPlanToRec(o, planRoutePreset(o, presets));
    eq(["청구운임", "기사운임", "수수료", "외부지급합", "특수기사차감", "특수청구추가"].map((k) => String(y[k])), ["청구운임", "기사운임", "수수료", "외부지급합", "특수기사차감", "특수청구추가"].map((k) => String(x[k])), `서버 계산 = 화면 계산 (${o.하차지명})`);
  }
  // strict(구글시트 가져오기): 시트 줄에 이미 특수운임(예: 기타 2만원)이 있으면 지게차 외 자동 항목은 안 넣는다(두 번 더하지 않게)
  const sheetRow = { ...base, 하차지명: "에브리데이 여주", 메모: "야상", 특수운임: [{ 종류: "기타", 이름: "기타", 금액: 20000, 받는사람: "없음", 부담: "청구" }], 특수청구추가: 20000, 청구운임: "320000" };
  const s = applyPlanToRec(sheetRow, planRoutePreset(sheetRow, presets, { strict: true }));
  eq([s.특수운임.length, s.지게차비용, s.청구운임], [1, 50000, "370000"], "strict: 시트에 있던 항목만 · 지게차만 자동");
  const fk = { ...sheetRow, 지게차비용: 50000, 지게차부담: "청구", 지게차청구추가: 50000 };
  ok(planRoutePreset(fk, presets, { strict: true }) === null, "시트에 지게차(대행료)가 있으면 아무것도 안 더함");
}

// ── 운임 규칙(운임구분)과 함께 — 규칙이 계산한 기사운임에서 차감분이 "규칙대로"로 보인다 ──
{
  const rules = [{ id: "r1", name: "일대", type: "percent", value: 10, active: true }];
  let f = fareFormChange({ 거래처명: "에이제이", 상차지명: "에이제이", 하차지명: "트레이더스 칠곡", 운임구분: "일대" }, "청구운임", "300000", rules);
  eq([f.기사운임, f.수수료], ["270000", "30000"], "규칙: 10%");
  const fp = [P({ 거래처명: "에이제이", 하차지명: "트레이더스 칠곡", items: [{ 종류: "지게차", 금액: 35000, 부담: "기사" }] })];
  f = applyRoutePresets(f, fp);
  eq([f.청구운임, f.기사운임, f.수수료, f.지게차기사차감], ["300000", "235000", "30000", 35000], "지게차 기사 차감 35,000");
  ok(!fareIsManual(f, rules), "차감분은 규칙대로(직접 고침 아님)");
  f = fareFormChange(f, "청구운임", "400000", rules);
  eq([f.기사운임, f.수수료], ["325000", "40000"], "청구를 바꿔도 규칙 − 차감");
}

// ── 이 노선 고정으로 저장(오더 → 항목) ──
{
  const o = specialApplyAll({ 청구운임: "300000", 기사운임: "250000", 상차시간: "21:00" }, { fork: { 지게차비용: 35000, 지게차부담: "청구" }, items: [{ 종류: "할증", 이름: "야상", 금액: 20000, 받는사람: "없음", 부담: "청구" }] });
  eq(itemsFromOrder(o).map((x) => [x.종류, x.금액, x.부담, x.조건]), [["지게차", 35000, "청구", "항상"], ["할증", 20000, "청구", "야간"]], "야상 할증은 밤 오더면 '야간 상차일 때만'");
}

// ── 기존 자료로 자동 설정 ──
{
  const mk = (to, i, extra = {}) => ({ 거래처명: "에이제이", 상차지명: i % 4 === 0 ? "에이제이 " : "에이제이", 하차지명: to, 상차일: `2026-10-${String(1 + i).padStart(2, "0")}`, 상차시간: "10:00", 청구운임: "300000", 기사운임: "250000", 배차상태: "배차완료", ...extra });
  const rows = [];
  // 트레이더스 칠곡: 10건 중 9건 지게차 35,000(청구) → 제안(90%)
  for (let i = 0; i < 10; i += 1) rows.push(mk("트레이더스 칠곡", i, i === 3 ? {} : { 지게차비용: 35000, 지게차부담: "청구" }));
  // 에브리데이 여주: 6건 모두 지게차 50,000 · 밤 3건만 야상 2만원
  for (let i = 0; i < 6; i += 1) rows.push(mk("에브리데이 여주", i, { 지게차비용: "50000", 지게차부담: "청구", ...(i % 2 ? { 상차시간: "", 메모: "야상", 특수운임: [{ 종류: "할증", 이름: "야상", 금액: 20000, 받는사람: "없음", 부담: "청구", 메모: "구글시트 이전" }] } : {}) }));
  // 쿠팡: 5건 중 2건만 대기료 → 제안 안 함(40%)
  for (let i = 0; i < 5; i += 1) rows.push(mk("쿠팡 안성", i, i < 2 ? { 특수운임: [{ 종류: "대기료", 금액: 10000 }] } : {}));
  // 2건뿐인 노선 → 제안 안 함 · 취소 오더는 안 셈
  rows.push(mk("작은 곳", 1, { 지게차비용: 10000 }), mk("작은 곳", 2, { 지게차비용: 10000 }), mk("작은 곳", 3, { 지게차비용: 10000, 배차상태: "배차취소" }));
  const S = seedProposals(rows);
  const brief = S.map((p) => [p.하차지명, p.상차지명, p.item.종류, p.item.금액, p.item.부담, p.item.조건, p.count, p.total]);
  eq(brief, [
    ["에브리데이 여주", "", "지게차", 50000, "청구", "항상", 6, 6],
    ["에브리데이 여주", "", "할증", 20000, "청구", "야간", 3, 3],
    ["트레이더스 칠곡", "", "지게차", 35000, "청구", "항상", 9, 10],
  ], "제안: 칠곡 지게차 35,000 · 여주 지게차 50,000 · 여주 야상 2만원(야간 상차일 때만)");
  ok(S.every((p) => p.status === "new"), "새 제안");
  const docs = proposalsToPresets(S, []);
  eq(docs.map((d) => [d.하차지명, d.items.map((x) => `${x.종류}${x.금액}${x.조건}`)]), [["에브리데이 여주", ["지게차50000항상", "할증20000야간"]], ["트레이더스 칠곡", ["지게차35000항상"]]], "같은 노선은 한 문서로");
  const saved = docs.map((d, i) => P(d, `s${i}`));
  ok(seedProposals(rows, { existing: saved }).every((p) => p.status === "same"), "이미 저장한 것은 '같음'");
  // 저장한 프리셋으로 다시 적용 — 밤 여주 오더는 지게차 + 야상, 낮은 지게차만
  const nightOrder = applyRoutePresets(mk("에브리데이 여주", 0, { 상차시간: "19:30" }), saved);
  eq([nightOrder.지게차비용, nightOrder.특수운임.map((x) => x.이름), nightOrder.청구운임], ["50000", ["야상"], "370000"], "저장한 프리셋 적용(밤)");
}

console.log(`routePreset OK (${n})`);
