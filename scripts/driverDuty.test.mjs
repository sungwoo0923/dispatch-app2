// 기사 근무 계산 단위 테스트 — 주행거리 누적 · 퇴근 미처리 판단 · 오더 수정 비교
// 실행: node scripts/driverDuty.test.mjs
import { accumulateOdometer, liveOdometer, missedCheckoutPlan, isOnDuty } from "../functions/driverDutyCore.mjs";
import { snapshotOrder, changedFields, changedLabels, changeDiff } from "../src/orderChange.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗", m); } };
const at = (s) => Date.parse(`${s}+09:00`);

// ── 주행거리 누적
let r = accumulateOdometer({ odometer: 100000, odoAccum: {} }, "2026-11-09", 100.04);
ok(r && r.odometer === 100100 && r.add === 100, "100,000 + 오늘 100km = 100,100");
ok(accumulateOdometer({ odometer: 100100, odoAccum: { "2026-11-09": 100 } }, "2026-11-09", 50) === null, "같은 날 두 번 누적 안 함");
ok(accumulateOdometer({ odometer: 0 }, "2026-11-09", 100) === null, "처음 키로수 없으면 누적 안 함");
r = accumulateOdometer({ odometer: 100000 }, "2026-11-09", 0);
ok(r && r.odometer === 100000 && r.add === 0, "이동 0km면 그대로(기록만)");
r = accumulateOdometer({ odometer: 100000 }, "2026-11-09", 5000);
ok(r && r.odometer === 100000 && r.record < 0, "하루 1,500km 넘으면 GPS 오류로 보고 누적 안 함");
r = accumulateOdometer({ odometer: 100000 }, "2026-11-09", 120, { manual: 100150 });
ok(r && r.odometer === 100150 && r.manual, "퇴근 때 계기판 직접 입력하면 그 값");
ok(liveOdometer({ status: "운행중", care: { odometer: 100000 }, totalDistance: 42.6 }) === 100043, "운행 중 표시 = 기준 + 오늘 이동");
ok(liveOdometer({ status: "퇴근", isFinalCheckout: true, care: { odometer: 100100 }, totalDistance: 0 }) === 100100, "퇴근 후 표시 = 기준");

// ── 근무 중 판단
ok(isOnDuty({ status: "출근" }) && isOnDuty({ status: "운행중" }), "출근·운행중 = 근무 중");
ok(!isOnDuty({ status: "대기" }) && !isOnDuty({ status: "퇴근" }) && !isOnDuty({ status: "휴차" }), "대기(출근 전)·퇴근·휴차 = 근무 아님");
ok(!isOnDuty({ status: "출근", isFinalCheckout: true }), "최종퇴근 후 = 근무 아님");

// ── 퇴근 미처리
const D = { status: "출근", workDate: "2026-11-09", 퇴근시간: "18:00" };
ok(missedCheckoutPlan(D, at("2026-11-09T18:30:00"), at("2026-11-09T18:20:00")).stage === "none", "퇴근시간 +30분은 아직 없음");
ok(missedCheckoutPlan(D, at("2026-11-09T19:10:00"), at("2026-11-09T19:05:00")).stage === "remind", "+1시간·이동 중 → 알림");
ok(missedCheckoutPlan(D, at("2026-11-09T19:40:00"), at("2026-11-09T18:50:00")).stage === "flag", "+1시간·30분 넘게 정지 → 관제 퇴근 미처리");
let p = missedCheckoutPlan(D, at("2026-11-10T00:10:00"), at("2026-11-09T19:12:00"));
ok(p.stage === "auto" && p.date === "2026-11-09" && p.checkoutAt === at("2026-11-09T19:12:00"), "자정 지나면 자동 퇴근 · 마지막 이동 시각");
p = missedCheckoutPlan(D, at("2026-11-10T07:00:00"), 0);
ok(p.stage === "auto" && p.checkoutAt === at("2026-11-09T18:00:00"), "이동 기록 없으면 퇴근시간으로");
ok(missedCheckoutPlan(D, at("2026-11-10T01:00:00"), at("2026-11-10T00:50:00")).stage === "none", "자정 넘겨 운행 중(최근 이동)이면 자동 퇴근 안 함");
ok(missedCheckoutPlan({ status: "출근", workDate: "2026-11-09" }, at("2026-11-09T19:30:00"), at("2026-11-09T19:29:00")).stage === "none", "퇴근시간 없으면 19:00 기준(+1시간 전)");
ok(missedCheckoutPlan({ status: "퇴근", isFinalCheckout: true, workDate: "2026-11-08" }, at("2026-11-09T09:00:00")).stage === "none", "이미 퇴근 → 대상 아님");

// ── 오더 수정 비교(재승인 팝업)
const base = { 상차지명: "경동", 상차지주소: "인천 서구", 하차지명: "부산", 기사운임: "300000", 전달사항: "" };
const o = { ...base, 기사확인값: snapshotOrder(base), 상차지명: "경동 2공장", 전달사항: "지게차 있음" };
ok(changedLabels(changedFields(o)).join(",") === "상차지,전달사항", "바뀐 항목: 상차지·전달사항");
const diff = changeDiff(o);
ok(diff.length === 2 && diff[0].label === "상차지" && diff[0].before.includes("경동") && diff[0].after.includes("경동 2공장"), "이전값 → 새값");

console.log(`기사 근무 계산 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
