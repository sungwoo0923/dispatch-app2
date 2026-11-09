// 차량관리 — 실제 데이터 모양 차이 방어 테스트(이상한 모양을 넣어도 오류 없이 · 날짜는 항상 YYYY-MM-DD 글자)
// 실행: node scripts/vehicleCareShape.test.mjs
import {
  toYmd, arr, normCare, normCareLogs, careSummary, itemStatus, itemsFor, consumableRows, carePushPlan,
  monthlyCostReport, careItemsFromRepairs, reconcileCards, buildActiveDays,
} from "../functions/fleetCareCore.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass += 1; else { fail += 1; console.log("  ✗", m); } };
const noThrow = (fn, m) => { try { const r = fn(); ok(true, m); return r; } catch (e) { ok(false, `${m} → ${e.message}`); return null; } };
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const isYmdOrEmpty = (s) => s === "" || YMD.test(s);
const TODAY = "2026-11-09";
// Firestore Timestamp 흉내(toDate·seconds)
const ts = (ymd) => { const d = new Date(`${ymd}T03:00:00Z`); return { seconds: Math.floor(+d / 1000), nanoseconds: 0, toDate: () => d }; };
const rawTs = (ymd) => ({ _seconds: Math.floor(+new Date(`${ymd}T03:00:00Z`) / 1000) }); // 서버에서 직렬화된 모양

console.log("[1] 날짜 읽기(toYmd)");
ok(toYmd("2026-05-01") === "2026-05-01", "YYYY-MM-DD");
ok(toYmd("2026.5.1") === "2026-05-01", "2026.5.1");
ok(toYmd("2026년 5월 1일") === "2026-05-01", "한글 날짜");
ok(toYmd("20260501") === "2026-05-01", "8자리");
ok(toYmd("2026-05-01T23:10:00") === "2026-05-01", "시간 붙은 글자");
ok(toYmd(ts("2026-05-01")) === "2026-05-01", "Timestamp(toDate)");
ok(toYmd(rawTs("2026-05-01")) === "2026-05-01", "Timestamp(_seconds)");
ok(toYmd(new Date("2026-05-01T03:00:00Z")) === "2026-05-01", "Date");
ok(toYmd(Date.parse("2026-05-01T03:00:00Z")) === "2026-05-01", "밀리초 숫자");
ok(toYmd(46143) === "2026-05-01", "엑셀 일련번호");
for (const bad of ["", null, undefined, "abc", "2026-13-01", "2026-00-10", {}, [], 0, 123, NaN, true, new Date("x")]) ok(toYmd(bad) === "", `잘못된 값 ${JSON.stringify(bad)} → 빈 값`);

console.log("[2] 배열 칸(arr)");
ok(arr(undefined).length === 0 && arr("x").length === 0 && arr(5).length === 0, "undefined·글자·숫자 → []");
ok(arr({ a: { 일자: "2026-01-01" }, b: { 일자: "2026-02-01" } }).length === 2, "객체 → 값 목록");
ok(arr([{ a: 1 }, null, "x", { b: 2 }]).length === 2, "배열 안 null·글자는 뺀다");
ok(arr(ts("2026-01-01")).length === 0, "Timestamp는 배열로 보지 않는다");

console.log("[3] 점검 요약(careSummary) — 이상한 모양");
const weird = [
  { name: "care 없음", drv: {} },
  { name: "drv undefined", drv: undefined },
  { name: "care 글자", drv: { care: "x" } },
  { name: "vehicle 글자", drv: { vehicle: "1톤", care: { odometer: "120,000" } } },
  { name: "items 배열", drv: { care: { items: [1, 2], dates: [] } } },
  { name: "items 값 글자", drv: { care: { items: { engineOil: "2026-01-01" } } } },
  { name: "Timestamp 날짜", drv: { vehicle: { 톤: "5톤" }, care: { odometer: "152,300", odometerAt: ts("2026-11-01"), items: { engineOil: { km: "140,000", date: ts("2026-03-01") }, tire: { km: 100000, date: rawTs("2025-01-02") } }, dates: { inspection: ts("2026-11-20"), insurance: "2026.12.31", contract: 46143 } } } },
  { name: "빈 문자열·null", drv: { care: { odometer: "", items: { engineOil: { km: "", date: "" }, airFilter: null }, dates: { inspection: "", insurance: null } } } },
  { name: "잘못된 날짜", drv: { care: { odometer: 1000, items: { engineOil: { km: 500, date: "어제" } }, dates: { inspection: "2026-99-99" } } } },
  { name: "intervals 이상", drv: { care: { odometer: 50000, intervals: { engineOil: { km: "7,500", months: "" } }, items: { engineOil: { km: 45000, date: "2026-10-01" } } } } },
];
for (const w of weird) {
  const s = noThrow(() => careSummary(w.drv, {}, TODAY), `careSummary · ${w.name}`);
  if (!s) continue;
  ok(typeof s.odometer === "number" && Number.isFinite(s.odometer), `${w.name}: odometer 숫자`);
  ok(typeof s.odometerAt === "string", `${w.name}: odometerAt 글자(객체가 화면에 그려지지 않게)`);
  ok(s.list.every((x) => !x.dueDate || YMD.test(x.dueDate)), `${w.name}: dueDate 형식`);
  ok(s.list.every((x) => typeof x.text === "string" && !/NaN|undefined|object/.test(x.text)), `${w.name}: 표시 글자에 NaN·undefined 없음`);
  noThrow(() => consumableRows(w.drv?.vehicle, w.drv?.care, {}, TODAY).forEach((r) => { if (!isYmdOrEmpty(r.lastDate) || !isYmdOrEmpty(r.nextDate)) throw new Error(`날짜 ${r.lastDate}/${r.nextDate}`); }), `consumableRows · ${w.name}`);
  noThrow(() => carePushPlan({ ...(w.drv || {}), careNotified: "x" }, { 보험만기: ts("2026-11-10"), 검사만기: 46143, 할부만기: "" }, {}, TODAY), `carePushPlan · ${w.name}`);
}
const t = careSummary(weird[6].drv, {}, TODAY);
ok(t.odometer === 152300, `"152,300" → 152300 (지금 ${t.odometer})`);
ok(t.odometerAt === "2026-11-01", "odometerAt Timestamp → 2026-11-01");
const oil = t.list.find((x) => x.key === "engineOil");
ok(oil && oil.nextKm === 155000 && oil.leftKm === 2700, `엔진오일 "140,000"+15000 → 다음 155,000km · 남은 2,700km (지금 ${oil?.nextKm}/${oil?.leftKm})`);
ok(oil && oil.dueDate === "2026-09-01" && oil.level === 2, `엔진오일 Timestamp 날짜 + 6개월 → 2026-09-01 지남 (지금 ${oil?.dueDate})`);
ok(t.list.find((x) => x.key === "inspection")?.dueDate === "2026-11-20", "정기검사 Timestamp 만기");
ok(t.list.find((x) => x.key === "insurance")?.dueDate === "2026-12-31", "보험 2026.12.31");
ok(t.list.find((x) => x.key === "contract")?.dueDate === "2026-05-01", "지입계약 엑셀 일련번호");
const iv = itemsFor({}, weird[9].drv.care).find((x) => x.key === "engineOil");
ok(iv.km === 7500 && typeof iv.km === "number", `차량별 주기 "7,500" → 7500 숫자 (지금 ${iv.km})`);
ok(careSummary({ care: { setupDone: true } }).setupDone === true && careSummary({}).setupDone === false, "careSummary에 setupDone(차량관리 '미설정' 표시)");
ok(itemStatus(itemsFor({ 톤: "1톤" })[0], { odometer: "8,000", items: { engineOil: { km: "1,000" } } }, TODAY).leftKm === 500, "itemStatus: 콤마 km");

console.log("[4] 정비 이력 → 마지막 교체 · 월 비용 · 카드 대조");
const reps = { a: { 일자: ts("2026-10-02"), 내용: "엔진오일 교환", 주행거리: "150,000" }, b: { 일자: "2026.10.20", 내용: "타이어 교체", 공가: "300,000" }, c: null };
const up = noThrow(() => careItemsFromRepairs(reps, "x"), "careItemsFromRepairs: 객체 이력 · current 글자");
ok(up?.engineOil?.date === "2026-10-02" && up?.engineOil?.km === 150000, "Timestamp 일자·콤마 km 반영");
ok(up?.tire?.date === "2026-10-20", "2026.10.20 반영");
noThrow(() => careItemsFromRepairs(undefined, undefined), "careItemsFromRepairs: 모두 없음");
noThrow(() => careItemsFromRepairs([null, { 일자: 5 }, "x"], { engineOil: { date: ts("2027-01-01") } }), "careItemsFromRepairs: null·숫자 일자 · current Timestamp");
const rep = noThrow(() => monthlyCostReport({ vehicles: [{ id: "v1", 차량번호: " 경기12가3456 ", repairs: reps, structures: "x", 보험료: "1,200,000" }, { 차량번호: "   " }, null, { 차량번호: 1234 }], drivers: [{ 차량번호: "12가3456", 이름: 7, odoAccum: { "2026-10-01": "120", "2026-10-02": "abc" } }, null], txs: undefined, ym: "2026-10" }), "monthlyCostReport: 이상한 모양");
ok(rep && rep.rows.length === 2, `빈 차량번호·null은 빼고 2대 (지금 ${rep?.rows.length})`);
const r1 = rep?.rows.find((r) => r.id === "v1");
ok(r1 && r1.plate === "경기12가3456" && r1.km === 120 && r1.insurance === 100000, "번호판 공백 제거 · km 누적 · 보험료 콤마");
ok(r1 && r1.consumable === 330000 + 0 && r1.driver === "7", `소모품(타이어) 부가세 포함 330,000 (지금 ${r1?.consumable}) · 기사명 글자`);
noThrow(() => reconcileCards(undefined, { a: { 차량번호: "12가3456" } }, new Map()), "reconcileCards: 없음 · 객체 차량");
noThrow(() => buildActiveDays({ orders: { x: { 차량번호: "1", 상차일: ts("2026-10-01") } }, drivers: [{ 차량번호: "1", odoAccum: "x" }] }), "buildActiveDays: 객체 오더 · odoAccum 글자");
ok(buildActiveDays({ orders: [{ 차량번호: "12가3456", 상차일: ts("2026-10-01") }] }).get("12가3456")?.has("2026-10-01"), "상차일 Timestamp도 운행한 날로");

console.log("[5] 기사 문서 care · 기록 정리(normCare · normCareLogs)");
const nc = noThrow(() => normCare({ odometer: "98,000", odometerAt: ts("2026-11-02"), items: { engineOil: { km: "90,000", date: rawTs("2026-08-01") } }, dates: { insurance: ts("2027-01-05") }, intervals: "x" }), "normCare");
ok(nc?.odometer === 98000 && nc?.odometerAt === "2026-11-02" && nc?.items.engineOil.km === 90000 && nc?.items.engineOil.date === "2026-08-01" && nc?.dates.insurance === "2027-01-05", "normCare 값");
ok(typeof normCare(undefined).items === "object" && normCare(null).odometer === 0, "normCare(없음)");
const nl = noThrow(() => normCareLogs({ a: { at: ts("2026-11-01"), date: ts("2026-11-01"), km: "1,000", cost: "50,000" }, b: { at: 5, date: "", kind: "주유" } }), "normCareLogs: 객체");
ok(nl?.length === 2 && nl[0].date === "2026-11-01" && nl[0].cost === 50000 && nl[0].km === 1000, "normCareLogs 값 · 최신순");
ok(nl?.every((l) => typeof l.date === "string" && typeof l.at === "number"), "날짜 글자 · at 숫자");
ok(normCareLogs("x").length === 0 && normCareLogs(undefined).length === 0, "normCareLogs(없음)");

console.log(`\n결과: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
