// 💸 2026-11-09 운송업체별 수수료율 → 기사운임 자동 계산 단위 테스트 (functions/carrierFareCore.mjs)
// 실행: node scripts/carrierFare.test.mjs
import { cleanRate, rateMapOf, carrierFarePatch, mergedOrder, recalcTargets, autoDriverFare } from "../functions/carrierFareCore.mjs";

let pass = 0, fail = 0;
const eq = (a, b, msg) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (ok) pass++; else { fail++; console.log("  ✗", msg, "\n    got", JSON.stringify(a), "\n    want", JSON.stringify(b)); } };

const set = { carriers: [{ name: "한빛 운송", on: true, rate: 10 }, { name: "동방", on: false, rate: 7.5 }, { name: "율 없음", on: true }] };
const ord = (x) => ({ 배차표Id: "b1", 추가정보: { 운송업체: "한빛운송" }, 청구운임: "280000", 기사운임: "", ...x });

// 수수료율 정리
eq(cleanRate("10"), 10, "10 → 10"); eq(cleanRate("7.55"), 7.6, "소수 1자리"); eq(cleanRate("150"), 100, "100 넘으면 100");
eq(cleanRate(""), null, "빈칸 → null"); eq(cleanRate("abc"), null, "글자 → null"); eq(cleanRate(0), 0, "0% 허용");
eq([...rateMapOf(set).entries()], [["한빛운송", 10], ["동방", 7.5]], "업체 열쇠(공백 무시) → 수수료율, 율 없는 업체 제외");

// 기본 계산
eq(autoDriverFare(280000, 10), 252000, "280,000 × 0.9");
eq(autoDriverFare(123457, 7.5), 114198, "원 단위 반올림");
eq(carrierFarePatch(ord(), set), { 기사운임: "252000", 수수료: "28000", 기사운임자동: true }, "빈 기사운임 → 자동 채움 + 수수료");
eq(carrierFarePatch(ord({ 추가정보: { 운송업체: "동방" } }), set), { 기사운임: "259000", 수수료: "21000", 기사운임자동: true }, "꺼진 업체도 수수료율 적용");
eq(carrierFarePatch(ord({ 추가정보: { "운송사명": "한빛 운송" } }), set)?.기사운임, "252000", "운송사 이름이 다른 칸(운송사명)에 있어도");

// 지키는 경우
eq(carrierFarePatch(ord({ 기사운임: "250000" }), set), null, "사람이 넣은 기사운임은 덮어쓰지 않음");
eq(carrierFarePatch(ord({ 배차표Id: "" }), set), null, "일반 오더는 그대로");
eq(carrierFarePatch(ord({ 추가정보: { 운송업체: "율 없음" } }), set), null, "수수료율 없는 업체 → 계산 안 함");
eq(carrierFarePatch(ord({ 추가정보: {} }), set), null, "운송업체 빈칸 → 계산 안 함");
eq(carrierFarePatch(ord({ 청구운임: "" }), set), null, "청구운임 없음 → 계산 안 함");
eq(carrierFarePatch(ord(), null), null, "설정 없음 → 계산 안 함");

// 자동 계산분 다시 계산
const auto = ord({ 기사운임: "252000", 수수료: "28000", 기사운임자동: true });
eq(carrierFarePatch(auto, set), null, "이미 맞으면 바꿀 것 없음");
eq(carrierFarePatch({ ...auto, 청구운임: "300000" }, set), { 기사운임: "270000", 수수료: "30000", 기사운임자동: true }, "청구운임이 바뀌면 자동분 다시 계산");
eq(carrierFarePatch(auto, { carriers: [{ name: "한빛운송", rate: 15 }] }), { 기사운임: "238000", 수수료: "42000", 기사운임자동: true }, "수수료율이 바뀌면 자동분 다시 계산");
eq(carrierFarePatch(auto, { carriers: [{ name: "한빛운송" }] }), { 기사운임: "", 수수료: "280000", 기사운임자동: false }, "수수료율을 지우면 자동분만 비움");
eq(carrierFarePatch({ ...auto, 기사운임자동: false }, { carriers: [{ name: "한빛운송", rate: 15 }] }), null, "직접 고친 기사운임(자동 해제)은 수수료율이 바뀌어도 그대로");

// 바뀐 값 합치기(서버 patch 의 "추가정보.운송업체" 점 표기)
eq(carrierFarePatch(mergedOrder(ord({ 추가정보: { 운송업체: "율 없음" } }), { "추가정보.운송업체": "한빛운송" }), set)?.기사운임, "252000", "시트에서 운송업체가 바뀌면 그 업체 수수료율로");
eq(carrierFarePatch(mergedOrder(auto, { 기사운임: "260000", 기사운임자동: false }), set), null, "시트에서 들어온 기사운임은 지킴");
eq(carrierFarePatch(mergedOrder(auto, { 기사운임: "", 기사운임자동: false }), set)?.기사운임, "252000", "기사운임을 비우면 다시 자동");

// 일괄 다시 계산 대상
const rows = [ord({ id: "a" }), ord({ id: "b", 기사운임: "1000" }), { ...auto, id: "c" }, ord({ id: "d", 배차표Id: "" })];
eq(recalcTargets(rows, { carriers: [{ name: "한빛운송", rate: 20 }] }).map((t) => [t.order.id, t.patch.기사운임]), [["a", "224000"], ["c", "224000"]], "다시 계산 = 빈칸 + 자동분만");

console.log(`운송업체 수수료율 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
