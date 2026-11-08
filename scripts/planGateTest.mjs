// 요금제 가상 테스트 — 라이트·베이직·스탠다드·프로 운송사가 들어갔을 때 메뉴가 요금표대로 열리고/잠기는지,
// 직원 계정 한도(10명 → 11번째 차단), 요금 사다리(아래 요금제 + 초과 요금 ≈ 위 요금제)를 확인한다.
// 실행: node scripts/planGateTest.mjs
import fs from "fs";
import { PLAN_IDS, PLAN_DEFAULTS, PLAN_RATES, FEATURE_ROWS, MENU_FEATURE, homeItemFeature, planIncludes, seatCheck } from "../src/planCore.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log("  ✗", msg); } };
const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const DA = src("DispatchApp.jsx"), MA = src("mobile/MobileApp.jsx"), HD = src("HomeDashboard.jsx");

// ── 1) 실제 화면 코드의 메뉴 목록을 읽어 온다(PC 왼쪽 메뉴 + 부서 메뉴 + 임원 메뉴)
const side = [...DA.match(/const KP_SIDE_GROUPS = \[([\s\S]*?)\n\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((x) => !/^(배차|운임|기사 · 거래처|매출 · 정산|부서 업무|관리)$/.test(x));
const dept = [...DA.match(/const DEPT_MENUS = \{([\s\S]*?)\n\};/)[1].matchAll(/\[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
const ALL = [...new Set([...side, ...dept, "출근기록부", "직원관리", "연차관리", "입퇴사관리"])];

// ── 2) 요금표(기대값) — 이 메뉴는 이 요금제부터
const EXPECT = {
  지입차관리: "standard", 인사이트: "pro", 전자결재: "basic", 결재함: "basic", 결재대기: "basic", 자금현황: "basic",
  인사관리부: "basic", 출근기록부: "basic", 직원관리: "basic", 연차관리: "basic", 입퇴사관리: "basic", 증명서발급: "basic",
  회계관리: "basic", 자금관리: "basic", 비품관리: "basic", 경영분석: "standard", 일일경영보고: "standard",
};
const rank = (id) => PLAN_IDS.indexOf(id);
const pcState = (planId, m) => (MENU_FEATURE[m] && !planIncludes(planId, MENU_FEATURE[m]) ? "locked" : "ok"); // menuState 첫 줄과 같은 규칙

console.log("\n[1] PC 메뉴 잠금 (요금제 × 메뉴)");
const table = [];
for (const m of ALL) {
  const row = { 메뉴: m };
  for (const p of PLAN_IDS) {
    const st = pcState(p, m);
    const want = EXPECT[m] ? (rank(p) >= rank(EXPECT[m]) ? "ok" : "locked") : "ok";
    ok(st === want, `${p} · ${m}: ${st} (기대 ${want})`);
    row[p] = st === "ok" ? "✓" : "🔒";
  }
  table.push(row);
}
console.table(table);
ok(planIncludes(null, "fleet") && planIncludes(null, "insight"), "요금제 미지정 회사 → 전부 열림");

console.log("[2] 화면 코드에 잠금이 실제로 걸려 있는지");
const ms = DA.slice(DA.indexOf("const menuState = (m) => {"), DA.indexOf("const menuState = (m) => {") + 400);
ok(/^\s*const menuState = \(m\) => \{\s*\/\/[^\n]*\n\s*if \(MENU_FEATURE\[m\] && !planIncludes\(planId, MENU_FEATURE\[m\]\)\) return "locked";/.test(ms), "PC menuState: 요금제 잠금이 맨 먼저(부서·임원 메뉴보다 앞)");
ok(/handleMenuClick[\s\S]{0,300}openPlanLock\(MENU_FEATURE\[m\]\)/.test(DA), "PC 메뉴 클릭: 잠긴 메뉴는 요금제 안내 창");
ok(/planIncludes\(planCM, "hr"\)[^\n]*출근기록부[^\n]*인사관리부/.test(DA), "PC 회사관리: 출근기록부·인사관리부 탭은 베이직부터, 회사정보는 전 요금제");
ok(/featureOn\("call24"\)/.test(DA), "PC 24시콜 전송: 프로만");
ok(/const ok = \(m\) => menuOk\(m\) && \(!MENU_FEATURE\[m\] \|\| planIncludes\(planIdM, MENU_FEATURE\[m\]\)\)/.test(MA), "모바일 메뉴: PC와 같은 요금제 기준");
ok(/const deptOk = \(m\) => \(!MENU_FEATURE\[m\] \|\| planIncludes\(planIdM/.test(MA), "모바일 부서 메뉴(인사·회계·자금·비품·증명서): 요금제 기준");
ok(/planIncludes\(planId, "groupware"\)/.test(HD), "홈 전자결재·메일·게시판·인수인계: 베이직부터");
for (const k of ["ap:x", "mail", "board:x", "인수인계"]) ok(homeItemFeature(k) === "groupware", `홈 항목 ${k} → groupware`);
ok(FEATURE_ROWS.every((f) => PLAN_IDS.includes(f.min)), "기능표의 시작 요금제가 모두 올바름");

console.log("[3] 직원 계정 한도");
const std = PLAN_DEFAULTS.find((p) => p.id === "standard");
const staff = (n) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, role: "user", approved: true }));
ok(std.seats === 10, `스탠다드 포함 인원 10명 (지금 ${std.seats})`);
ok(seatCheck(std, 0, staff(9)).ok === true, "9명 승인 → 10번째 승인 가능");
ok(seatCheck(std, 0, staff(10)).ok === false, "10명 승인 → 11번째 승인 차단");
ok(seatCheck(std, 1, staff(10)).ok === true, "추가 계정 1명 구매 → 11번째 승인 가능");
ok(seatCheck(std, 1, staff(11)).ok === false, "추가 1명까지 다 쓰면 → 12번째 차단");
const mixed = [...staff(9), { role: "driver", approved: true }, { role: "shipper", approved: true }, { role: "user", approved: true, employmentStatus: "퇴사" }, { role: "user", approved: false }, { role: "user", approved: true, noAccount: true }, { role: "totalMaster", approved: true }];
ok(seatCheck(std, 0, mixed).used === 9, "기사·화주·퇴사·승인대기·계정없는 인사기록·최고관리자는 인원에서 제외");

console.log("[4] 요금 사다리");
const P = Object.fromEntries(PLAN_DEFAULTS.map((p) => [p.id, p]));
const bill = (p, staffN, orders, fleet = 0) => p.price + Math.max(0, staffN - p.seats) * PLAN_RATES.extraSeat + Math.max(0, orders - p.orders) * PLAN_RATES.extraOrder + Math.max(0, fleet - p.fleet) * PLAN_RATES.fleetPerVehicle;
for (let i = 0; i < 3; i++) {
  const lo = P[PLAN_IDS[i]], hi = P[PLAN_IDS[i + 1]];
  ok(lo.price < hi.price && lo.seats < hi.seats && lo.orders < hi.orders, `${lo.name} < ${hi.name} (가격·인원·오더)`);
  const atHi = bill(lo, hi.seats, hi.orders);
  ok(atHi >= hi.price, `${lo.name}로 ${hi.name} 규모 사용 시 ${atHi.toLocaleString()}원 ≥ ${hi.name} ${hi.price.toLocaleString()}원 (상향이 이득)`);
}
ok(P.lite.fleet === 0 && P.basic.fleet === 0 && !planIncludes("basic", "fleet"), "라이트·베이직: 지입차관리 메뉴 없음(포함 0대 = 미포함)");
ok(P.standard.fleet > 0 && P.pro.fleet > P.standard.fleet, "스탠다드·프로: 지입차 포함 대수 있음");

console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
