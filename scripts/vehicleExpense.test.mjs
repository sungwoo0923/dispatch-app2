// 차량 비용 영수증 · 정기 차량 사진 계산 테스트 — node scripts/vehicleExpense.test.mjs
import assert from "node:assert/strict";
import { parseReceiptText, autoChecks, checkLevel, checkHeadline, photoPeriod, daysLeft, spendPresetOf, bizNoOk, hashDistance } from "../src/vehicleExpenseCore.js";
let n = 0; const ok = (t) => { n++; console.log("  ✓", t); };

const R1 = `스피드메이트 평택점
사업자 125-81-34567 대표 홍길동
경기 평택시 포승읍 평택항로 268
TEL 031-683-0000
2026-11-08 14:32
엔진오일(10W30) 7L 62,000
오일필터 15,000
공임 8,000
합계 85,000
신한카드 ****-****-****-1234
승인번호 30128841`;
const a = parseReceiptText(R1);
assert.equal(a.vendor, "스피드메이트 평택점"); assert.equal(a.bizNo, "1258134567"); assert.equal(a.date, "2026-11-08"); assert.equal(a.time, "14:32");
assert.equal(a.amount, 85000); assert.equal(a.cardApproval, "30128841"); assert.equal(a.cardLast4, "1234"); assert.equal(a.phone, "031-683-0000");
assert.ok(a.kinds.includes("engineOil")); assert.equal(a.pay, "personalCard"); assert.ok(a.items.some((x) => /오일필터/.test(x)));
ok("영수증 글 → 상호·사업자번호·날짜·시간·합계·승인번호·카드 끝자리·항목·결제수단");

const b = parseReceiptText("한국타이어 T'station 오산점\n26/11/02 09:10\n타이어 교체 2개 480,000원\n현금영수증\n합 계 480,000");
assert.equal(b.date, "2026-11-02"); assert.equal(b.amount, 480000); assert.ok(b.kinds.includes("tire")); assert.equal(b.pay, "cash");
ok("두 자리 연도 · 현금영수증 · 합계 띄어쓰기");

assert.equal(bizNoOk("1258134567"), bizNoOk("125-81-34567"));
const base = { id: "x", amount: 85000, scan: { amount: 85000 }, bizNo: "", date: "2026-11-08", createdAt: Date.parse("2026-11-08T06:00:00Z"), captured: true, takenAt: Date.parse("2026-11-08T05:39:00Z"), kinds: ["engineOil"], km: 184320, cardApproval: "30128841", imgHash: "f".repeat(64) };
let c = autoChecks(base, { biz: { state: "active", label: "계속" }, care: { items: { engineOil: { km: 136110, date: "2026-05-02" } } }, others: [], nowMs: base.createdAt });
assert.equal(checkLevel(c.filter((x) => x.k !== "biz")), "ok");
assert.ok(c.find((x) => x.k === "cycle").text.includes("48,210"));
ok("자동 점검 — 통과 · 정비 주기 km 차이");
c = autoChecks({ ...base, amount: 95000 }, { others: [{ id: "y", cardApproval: "30128841", amount: 85000, date: "2026-10-28", driverName: "박민준" }] });
assert.equal(checkLevel(c), "bad"); assert.equal(checkHeadline(c), "중복 의심");
assert.equal(c.find((x) => x.k === "amount").level, "warn");
c = autoChecks({ ...base, id: "orig" }, { others: [{ id: "later", cardApproval: "30128841", amount: 95000, createdAt: base.createdAt + 60000 }] });
assert.equal(c.find((x) => x.k === "dup").level, "ok");
ok("같은 승인번호 → 나중에 올린 쪽만 중복 의심(원본은 통과) · 금액 다름");
c = autoChecks({ ...base, cardApproval: "", imgHash: "f".repeat(62) + "00" }, { others: [{ id: "z", imgHash: "f".repeat(64) }] });
assert.equal(c.find((x) => x.k === "dup").level, "bad"); assert.equal(hashDistance("ffff", "fffe"), 1);
c = autoChecks({ ...base, cardApproval: "", imgHash: "0".repeat(32) + "f".repeat(32) }, { others: [{ id: "z", imgHash: "f".repeat(64) }] });
assert.equal(c.find((x) => x.k === "dup").level, "ok");
ok("거의 같은 사진 → 중복 의심");
c = autoChecks({ ...base, date: "2026-08-01" }, { nowMs: base.createdAt });
assert.equal(checkHeadline(c.filter((x) => x.k !== "biz")), "날짜 오래됨");
ok("오래된 영수증");

const w = photoPeriod({ cycle: "weekly", dueDow: 5 }, "2026-11-12");
assert.deepEqual([w.key, w.start, w.end, w.due], ["W2026-11-09", "2026-11-09", "2026-11-15", "2026-11-13"]);
assert.equal(daysLeft(w.due, "2026-11-11"), 2);
const mo = photoPeriod({ cycle: "monthly", dueDay: 31 }, "2026-02-10");
assert.deepEqual([mo.key, mo.end, mo.due], ["M2026-02", "2026-02-28", "2026-02-28"]);
const bi1 = photoPeriod({ cycle: "biweekly", dueDow: 5 }, "2026-11-10"); const bi2 = photoPeriod({ cycle: "biweekly", dueDow: 5 }, "2026-11-16");
assert.equal(daysLeft(bi1.end, bi1.start), 13); assert.ok(bi2.key === bi1.key || daysLeft(bi2.start, bi1.end) === 1);
assert.equal(photoPeriod({ cycle: "weekly", dueDow: 0 }, "2026-11-10").due, "2026-11-15");
assert.equal(photoPeriod({ cycle: "daily" }, "2026-11-10").key, "D2026-11-10");
ok("사진 주기 — 매주(금 마감) · 매월(말일 보정) · 2주 · 일요일 마감 · 매일");

const p = spendPresetOf([{ id: "a", date: "2026-11-08", vendor: "스피드메이트", carNo: "경기99바7001", driverName: "김철수", kinds: ["engineOil"], amount: 85000, pay: "personalCard", image: "data:1" }, { id: "b", date: "2026-11-08", vendor: "한국타이어", carNo: "경기99바7002", driverName: "이영호", kinds: ["tire"], amount: 480000, pay: "personalCard", image: "data:2" }]);
assert.equal(p.title, "11월 차량 정비비 (2건)"); assert.equal(p.data.account, "차량유지비"); assert.equal(p.data.pay, "개인카드(정산 요청)");
assert.equal(p.data.lines.length, 2); assert.equal(p.data.lines[1].total, "480000"); assert.deepEqual(p.data.vexIds, ["a", "b"]); assert.equal(p.images.length, 2);
ok("지출결의서 자동 입력 — 제목·계정과목·결제수단·지출 내역·증빙 사진·영수증 연결");
console.log(`\n${n}개 통과`);
