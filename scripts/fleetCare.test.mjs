// 차량관리 자동화 단위 테스트 — node scripts/fleetCare.test.mjs
import { itemsFor, itemStatus, consumableRows, repairCareKeys, careItemsFromRepairs, carePushPlan, stageOf, monthlyCostReport, parseCardSheet, reconcileCards, buildActiveDays, cardTxId, CARE_ITEMS } from "../functions/fleetCareCore.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗", m); } };
const T = "2026-11-09";
const veh = { 톤: "5톤", 적재함: "윙바디" };

// ① 소모품 항목·주기
const keys = CARE_ITEMS.map((c) => c.key);
["brakeFluid", "belt", "wiper", "airFilter", "fuelFilter", "transOil", "coolant", "battery", "brake"].forEach((k) => ok(keys.includes(k), `소모품 항목 ${k}`));
const it0 = itemsFor(veh, {}, {}).find((x) => x.key === "engineOil");
ok(it0.km === 15000 && it0.months === 6, "기본 주기(중형 엔진오일 15,000km·6개월)");
ok(itemsFor(veh, {}, { engineOil: { km: 10000 } }).find((x) => x.key === "engineOil").km === 10000, "회사별 주기가 기본값보다 우선");
ok(itemsFor(veh, { intervals: { engineOil: { km: 8000 } } }, { engineOil: { km: 10000 } }).find((x) => x.key === "engineOil").km === 8000, "차량별 주기가 회사별보다 우선");

// ② 상태 — 다음 예정 km·날짜
const care = { odometer: 114700, items: { engineOil: { km: 100000, date: "2026-06-01" } } };
const st = itemStatus(it0, care, T);
ok(st.nextKm === 115000 && st.leftKm === 300 && st.level === 1, `남은 300km → 임박 (${st.text})`);
ok(st.dueDate === "2026-12-01" && st.daysLeft === 22, "다음 예정일 2026-12-01 · 22일");
const rows = consumableRows(veh, care, {}, T);
ok(rows.find((r) => r.key === "engineOil").status === "임박", "소모품 표 상태 임박");
ok(rows.find((r) => r.key === "wiper").status === "기록 없음", "기록 없으면 '기록 없음'");
ok(itemStatus(it0, { odometer: 116000, items: care.items }, T).level === 2, "km 초과 → 초과");

// ③ 정비 이력 → 마지막 교체
ok(repairCareKeys({ 구분: "엔진오일", 내용: "엔진오일·에어필터 교환" }).sort().join() === "airFilter,engineOil", "정비 글자로 항목 찾기(여러 개)");
ok(repairCareKeys({ 구분: "브레이크", 내용: "브레이크오일 교환" }).join() === "brakeFluid", "브레이크오일 ≠ 브레이크패드");
ok(repairCareKeys({ 구분: "타이어", 내용: "타이어 위치교환" }).join() === "tireRotate", "타이어 위치교환 ≠ 타이어 교체");
const up = careItemsFromRepairs([{ 일자: "2026-10-01", 구분: "엔진오일", 주행거리: "110000" }, { 일자: "2026-11-01", 구분: "배터리" }], { engineOil: { km: 100000, date: "2026-06-01" } });
ok(up.engineOil?.date === "2026-10-01" && up.engineOil.km === 110000 && up.battery?.date === "2026-11-01", "최근 정비가 마지막 교체로");
ok(Object.keys(careItemsFromRepairs([{ 일자: "2026-05-01", 구분: "엔진오일" }], { engineOil: { km: 100000, date: "2026-06-01" } })).length === 0, "기존 기록보다 오래된 정비는 덮어쓰지 않음");

// ④ 알림 계획 — 단계가 바뀔 때만
ok(stageOf({ daysLeft: 7 }) === "d7" && stageOf({ daysLeft: 1 }) === "d1" && stageOf({ daysLeft: 0 }) === "d0" && stageOf({ daysLeft: 20 }) === "", "D-7·D-1·당일 단계");
ok(stageOf({ leftKm: 300 }) === "km500" && stageOf({ leftKm: 900 }) === "", "남은 500km 이하 단계");
const drv = { vehicle: veh, care: { odometer: 114700, items: { engineOil: { km: 100000, date: "2026-06-01" } }, dates: { insurance: "2026-11-16" } } };
const p1 = carePushPlan(drv, { 검사만기: "2026-11-10" }, {}, T);
ok(p1.notify.length === 3, `엔진오일 km500 · 보험 D-7 · 검사 D-1 알림 3건 (${p1.notify.map((x) => x.text).join(" / ")})`);
const p2 = carePushPlan({ ...drv, careNotified: p1.nextState }, { 검사만기: "2026-11-10" }, {}, T);
ok(p2.notify.length === 0, "같은 단계는 다시 안 알림(하루 중복 방지)");
const p3 = carePushPlan({ ...drv, careNotified: p1.nextState }, { 검사만기: "2026-11-10" }, {}, "2026-11-10");
ok(p3.notify.some((x) => x.key === "vl_검사만기" && x.stage === "d0"), "다음날 당일 단계로 다시 알림");

// ⑤ 월 비용 리포트
const rep = monthlyCostReport({
  ym: "2026-10",
  vehicles: [{ id: "v1", 차량번호: "경기12가3456", 보험료: 1200000, repairs: [{ 일자: "2026-10-03", 구분: "엔진오일", 공가: 100000 }, { 일자: "2026-10-20", 구분: "판금·도색", 공가: 200000, 부가세: 0 }, { 일자: "2026-09-01", 구분: "타이어", 공가: 999999 }], structures: [] }],
  drivers: [{ 차량번호: "12가3456", odoAccum: { "2026-10-01": 300, "2026-10-02": 200, "2026-09-30": 999 } }],
  txs: [{ plateKey: "12가3456", type: "유류", date: "2026-10-05", amount: 300000 }, { plateKey: "12가3456", type: "하이패스", date: "2026-10-06", amount: 20000 }],
});
const r0 = rep.rows[0];
ok(r0.consumable === 110000 && r0.repair === 200000, `소모품 110,000(부가세 포함) · 정비 200,000 (${r0.consumable}/${r0.repair})`);
ok(r0.fuel === 300000 && r0.hipass === 20000 && r0.insurance === 100000, "유류·하이패스·보험(연 ÷12)");
ok(r0.km === 500 && r0.total === 730000 && r0.perKm === 1460, `주행 500km · 합계 730,000 · km당 1,460 (${r0.km}/${r0.total}/${r0.perKm})`);

// ⑥ 카드 내역 읽기
const fuel = parseCardSheet([["유류카드 이용내역"], ["이용일시", "차량번호", "카드번호", "가맹점명", "주유량", "이용금액"], ["2026.10.05 08:12", "경기12가3456", "1234-****-****-7788", "SK 평택주유소", "100.5", "180,000"], ["합계", "", "", "", "", "180,000"]]);
ok(fuel.rows.length === 1 && fuel.type === "유류" && fuel.rows[0].date === "2026-10-05" && fuel.rows[0].time === "08:12" && fuel.rows[0].amount === 180000, "유류카드 양식 자동 인식(머리줄 2번째 줄·합계 줄 무시)");
const hp = parseCardSheet([["통행일자", "통행시간", "입구영업소", "통행료", "OBU번호"], ["20261006", "13:05", "서평택", "4,300", "99887766"]]);
ok(hp.type === "하이패스" && hp.rows[0].date === "2026-10-06" && hp.rows[0].amount === 4300 && hp.rows[0].cardNo === "99887766", "하이패스 양식(통행료·영업소) 자동 인식");
ok(cardTxId("태진", fuel.rows[0]) === cardTxId("태진", { ...fuel.rows[0] }), "같은 줄은 같은 문서 id(중복 업로드 방지)");

// ⑦ 대조
const vehicles = [{ id: "v1", 차량번호: "경기12가3456", 유류카드번호: "1234-5678-9012-7788" }, { id: "v2", 차량번호: "서울34나5678", 하이패스카드번호: "99887766" }];
const active = buildActiveDays({ orders: [{ 차량번호: "경기12가3456", 상차일: "2026-10-05" }], drivers: [{ 차량번호: "서울34나5678", odoAccum: { "2026-10-07": 50 } }] });
const res = reconcileCards([
  { ...fuel.rows[0] },
  { type: "유류", date: "2026-10-09", time: "09:00", amount: 150000, plate: "경기12가3456", cardNo: "" },
  { type: "하이패스", date: "2026-10-06", time: "13:05", amount: 4300, plate: "경기12가3456", cardNo: "99887766" },
  { type: "유류", date: "2026-10-05", amount: 900000, plate: "", cardNo: "0000-1111" },
], vehicles, active);
const [a, b, c, d] = res.rows;
ok(a.match === "plate" && a.flags.length === 0, "운행한 날 · 등록 차량 → 정상");
ok(b.flags.includes("noTrip"), "운행 없는 날 사용 표시");
ok(c.flags.includes("otherCard"), "다른 차량 카드(차량번호 ≠ 카드 등록 차량)");
ok(d.flags.includes("unmatched"), "차량 미확인");
ok(reconcileCards([{ type: "유류", date: "2026-10-05", amount: 700000, plate: "경기12가3456" }], vehicles, active).rows[0].flags.includes("amount"), "이상 금액(유류 1회 60만원 초과)");
ok(res.summary.find((s) => s.plate === "경기12가3456").fuel === 330000, "차량별 합계");

console.log(`차량관리 자동화 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
