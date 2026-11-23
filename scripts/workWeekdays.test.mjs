// 🗓 근무 요일(회사 전체 + 직원별) · 쉬는 날 · 휴가 일수 단위 테스트
// 실행: node scripts/workWeekdays.test.mjs
import { register } from "node:module";
register("./extResolve.mjs", import.meta.url); // src는 확장자 없이 가져오므로 .js를 붙여 찾게
const { DEFAULT_WORK_WEEKDAYS, normWeekdays, workWeekdaysOf, isRestDay, isOffDay, weekdaysText, workDaysBetween } = await import("../src/attendanceUtils.js");
const { bizDays, leaveUseOf, offWord } = await import("../src/approvalForms.js");

let pass = 0, fail = 0;
const eq = (a, b, msg) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : fail++; if (!ok) console.log("  ✗", msg, "→", JSON.stringify(a), "기대", JSON.stringify(b)); };

// 2026-11-21 토 · 11-22 일 · 11-23 월
const SAT = "2026-11-21", SUN = "2026-11-22", MON = "2026-11-23";
const MON_SAT = [1, 2, 3, 4, 5, 6], WEEKEND = [0, 6];

// 1) 우선순위: 직원 설정 → 회사 설정 → 월~금
eq(workWeekdaysOf({}, null), DEFAULT_WORK_WEEKDAYS, "아무것도 안 정하면 월~금");
eq(workWeekdaysOf({}, MON_SAT), MON_SAT, "회사가 월~토면 직원도 월~토");
eq(workWeekdaysOf({ workWeekdays: WEEKEND }, MON_SAT), [0, 6], "직원을 따로 토·일로 정하면 그것");
eq(workWeekdaysOf({ workWeekdays: null }, MON_SAT), MON_SAT, "직원 설정을 지우면(null) 회사 설정");
eq(workWeekdaysOf({ workWeekdays: [] }, MON_SAT), MON_SAT, "빈 배열도 회사 설정");
eq(normWeekdays([6, 1, 1, "3", 9]), [1, 3, 6], "중복 · 잘못된 값 정리");

// 2) 쉬는 날
eq([isRestDay(SAT, DEFAULT_WORK_WEEKDAYS), isRestDay(SAT, MON_SAT), isRestDay(MON, WEEKEND), isRestDay(SUN, WEEKEND)], [true, false, true, false], "근무 요일이 아닌 날 = 쉬는 날");
eq(isOffDay("2026-12-25", MON_SAT, []), true, "공휴일(성탄절)은 근무 요일이어도 쉬는 날");
eq(isOffDay(MON, MON_SAT, [{ date: MON, label: "창립기념일" }]), true, "회사 지정 휴일도 쉬는 날");

// 3) 글자
eq([weekdaysText([1, 2, 3, 4, 5]), weekdaysText(MON_SAT), weekdaysText(WEEKEND), weekdaysText([1, 3, 5]), weekdaysText([0, 1, 2, 3, 4, 5, 6])], ["월~금", "월~토", "토·일", "월·수·금", "매일"], "요일 글자");

// 4) 휴가 일수 — 금~월(11-20 ~ 11-23)
const range = { start: "2026-11-20", end: SUN.replace("22", "23") };
eq(bizDays(range), 2, "월~금 직원: 금 · 월 = 2일(예전과 같음)");
eq(bizDays({ ...range, workWeekdays: MON_SAT }), 3, "월~토 직원: 금 · 토 · 월 = 3일");
eq(bizDays({ ...range, workWeekdays: WEEKEND }), 2, "토·일 직원: 토 · 일 = 2일");
eq(workDaysBetween("2026-11-20", "2026-11-23", MON_SAT, []), 3, "workDaysBetween 도 같은 값");
eq(offWord(range), "주말·공휴일", "예전 문서 글자 그대로");
eq(offWord({ workWeekdays: MON_SAT }), "쉬는 날·공휴일", "근무 요일이 있으면 '쉬는 날'");
eq(leaveUseOf({ cat: "leave", form: "annual", data: { kind: "연차", period: { ...range, workWeekdays: MON_SAT } } }).days, 3, "전자결재 연차도 저장된 근무 요일로 셈");
eq(leaveUseOf({ cat: "leave", form: "annual", data: { kind: "연차", period: range } }).days, 2, "근무 요일 없는 예전 문서는 그대로");

console.log(`workWeekdays: ${pass} 통과 · ${fail} 실패`);
if (fail) process.exit(1);
