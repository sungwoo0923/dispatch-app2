// 시트에서 차량번호를 지우면 기사명 · 전화번호도 비운다 — node scripts/sheetClearDriver.test.mjs
import { reconcileOrders } from "../functions/carrierMigrateCore.mjs";
let fails = 0;
const ok = (c, m) => { if (c) console.log("✓", m); else { fails++; console.error("✗", m); } };
const base = { 이전출처: "롯데베르살리스!590", 상차일: "2026-11-26", 상차지명: "울산", 하차지명: "이네오스", 청구운임: 466000, 배차상태: "배차완료" };
// ① 시트에서 차량 · 기사 · 연락처를 모두 지움 — 이름 · 전화번호가 프로그램 값(_programKeys)으로 남아 있던 경우
const ex1 = [{ id: "a", data: { ...base, 차량번호: "전남85바5266", 이름: "도경모", 전화번호: "010-8999-4970", _sheetKeys: ["차량번호", "청구운임"], _programKeys: ["이름", "전화번호"], _sheetBase: { 이름: "", 전화번호: "" } } }];
const r1 = reconcileOrders(ex1, [{ ...base, 배차상태: "배차중" }]);
const p1 = r1.update[0]?.patch || {};
ok(p1.차량번호 === "" && p1.이름 === "" && p1.전화번호 === "", "차량번호를 지우면 기사명 · 전화번호도 비움");
// ② 이미 차량번호는 비었는데 기사명 · 전화번호만 남은 오더(예전에 생긴 것) — 다음 연동 때 바로잡음
const ex2 = [{ id: "b", data: { ...base, 차량번호: "", 이름: "도경모", 전화번호: "010-8999-4970", _sheetKeys: ["청구운임"], _programKeys: ["이름", "전화번호"], _sheetBase: { 이름: "", 전화번호: "" } } }];
const p2 = reconcileOrders(ex2, [{ ...base }]).update[0]?.patch || {};
ok(p2.이름 === "" && p2.전화번호 === "", "남아 있던 기사명 · 전화번호 정리");
// ③ 프로그램에서 막 배차해 아직 시트에 못 쓴 차량(차량번호가 _programKeys) — 그대로 둔다
const ex3 = [{ id: "c", data: { ...base, 차량번호: "전남85바5266", 이름: "도경모", 전화번호: "010-8999-4970", _sheetKeys: ["청구운임"], _programKeys: ["차량번호", "이름", "전화번호"], _sheetBase: { 차량번호: "", 이름: "", 전화번호: "" } } }];
const r3 = reconcileOrders(ex3, [{ ...base }]);
const p3 = r3.update[0]?.patch || {};
ok(!("차량번호" in p3) && !("이름" in p3) && !("전화번호" in p3), "프로그램에서 배차한 차량 · 기사는 그대로");
// ④ 시트에 차량 · 기사가 그대로 있으면 아무것도 안 바뀜
const ex4 = [{ id: "d", data: { ...base, 차량번호: "전남85바5266", 이름: "도경모", 전화번호: "010-8999-4970", _sheetKeys: ["차량번호", "이름", "전화번호", "청구운임", "상차일", "상차지명", "하차지명", "이전출처", "배차상태"] } }];
const r4 = reconcileOrders(ex4, [{ ...base, 차량번호: "전남85바5266", 이름: "도경모", 전화번호: "010-8999-4970" }]);
ok(!r4.update.length, "차량 · 기사가 있으면 그대로");
if (fails) { console.error(`sheetClearDriver: ${fails}개 실패`); process.exit(1); } else console.log("sheetClearDriver: 모두 통과");
