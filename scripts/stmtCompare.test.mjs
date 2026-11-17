// 업체 명세서 비교 테스트 — node scripts/stmtCompare.test.mjs
import assert from "node:assert/strict";
import { normPlate, plateMatch, sameName, parseAmount, parseDate, classifyHeader, detectHeader, rowsFromTable, textToTable, parseLooseLines, compareStatement, guessByContent, ocrTable } from "../src/stmtCompareCore.js";

// 값 정리
assert.equal(normPlate(" 서울 12-가 3456 "), "서울12가3456");
assert.equal(plateMatch("서울12가3456", "12가 3456"), "core", "지역 빼고 같다");
assert.equal(plateMatch("88바1234", "88-바-1234"), "exact");
assert.equal(plateMatch("88바1234", "1234"), "last4", "끝 4자리만");
assert.equal(plateMatch("88바1234", "88바1235"), "");
assert.ok(sameName("김철수 기사", "김철수") && sameName("김철수(지입)", "김 철수") && !sameName("김철수", "김철호"));
assert.deepEqual([parseAmount("150,000원"), parseAmount(160000.4), parseAmount("(5,000)"), parseAmount("")], [150000, 160000, -5000, 0]);
assert.equal(parseDate(46329), "2026-11-03", "엑셀 날짜 숫자");
assert.equal(parseDate("2026.11.3"), "2026-11-03");
assert.equal(parseDate("26/11/03"), "2026-11-03");
assert.equal(parseDate("11/3", "2026-11"), "2026-11-03");
assert.equal(parseDate("11월 3일", "2026-11"), "2026-11-03");
assert.equal(parseDate("12/31", "2027-01"), "2026-12-31", "연말 · 연초");
assert.equal(parseDate("3", "2026-11"), "2026-11-03");
assert.equal(parseDate(3, "2026-11"), "2026-11-03");

// 제목 줄 찾기
assert.equal(classifyHeader("차번").field, "plate");
assert.equal(classifyHeader("기사운임"), null, "기사운임은 청구 금액이 아니다");
assert.equal(classifyHeader("세액"), null);
assert.equal(classifyHeader("상차일").field, "date");
assert.equal(classifyHeader("상차지").field, "from");
assert.equal(classifyHeader("성명").field, "name");
const sheet = [
  ["거래명세서"], ["공급받는자", "가나상사"], [],
  ["No", "일자", "상차", "하차", "차량번호", "기사", "공급가액", "세액", "합계금액"],
  [1, "11/03", "인천", "평택", "88바 1234", "김철수", "150,000", "15,000", "165,000"],
  [2, "11/04", "인천", "평택", "77-사-5678", "이영희", 160000, 16000, 176000],
  [3, "11/06", "화성", "부산", "12가3456", "박민수", 300000, 30000, 330000],
  [4, "11/09", "인천", "대구", "99아9999", "최지훈", 200000, 20000, 220000],
  ["합계", "", "", "", "", "", 810000, 81000, 891000],
];
const H = detectHeader(sheet);
assert.equal(H.headerRow, 3);
assert.deepEqual(H.map, { date: 1, from: 2, to: 3, plate: 4, name: 5, amount: 6 }, "공급가액을 금액으로(합계금액 · 세액이 아니라)");
const T = rowsFromTable(sheet, { ...H, ym: "2026-11" });
assert.equal(T.rows.length, 4, "합계 줄은 줄에서 뺀다");
assert.equal(T.statedTotal, 810000, "업체가 적은 합계");
assert.equal(T.rows[0].route, "인천 → 평택");

// 비교
const ours = [
  { _id: "a", 상차일: "2026-11-03", 차량번호: "88바1234", 이름: "김철수", 청구운임: 150000, 상차지명: "인천센터", 하차지명: "평택" }, // 일치
  { _id: "b", 상차일: "2026-11-05", 차량번호: "77사5678", 이름: "이영희", 청구운임: 150000, 상차지명: "인천", 하차지명: "평택" }, // 날짜 1일 · 금액 다름
  { _id: "c", 상차일: "2026-11-06", 차량번호: "서울12가3456", 이름: "박민호", 청구운임: 300000, 상차지명: "화성", 하차지명: "울산" }, // 기사 다름 · 구간 참고
  { _id: "d", 상차일: "2026-11-20", 차량번호: "55나5555", 이름: "정우성", 청구운임: 100000 }, // 우리만
];
const R = compareStatement(ours, T.rows, { statedTotal: T.statedTotal });
const byId = (id) => R.rows.find((r) => r.our?.id === id);
assert.equal(byId("a").status, "ok");
assert.equal(byId("b").status, "bad");
assert.equal(byId("b").cells.date.st, "warn", "날짜 1일 차이는 주의");
assert.equal(byId("b").cells.amount.msg, "금액 다름: 우리 150,000 / 업체 160,000");
assert.equal(byId("c").cells.name.st, "bad");
assert.equal(byId("c").cells.plate.st, "info", "지역만 다른 차량번호는 일치");
assert.equal(byId("c").cells.route.st, "info", "구간은 참고만(불일치로 세지 않음)");
assert.equal(byId("d").status, "ours");
assert.equal(R.rows.filter((r) => r.status === "theirs").length, 1, "99아9999는 업체만");
assert.deepEqual(R.sum, { ok: 1, bad: 2, warn: 0, ours: 1, theirs: 1 });
assert.deepEqual([R.totals.ours, R.totals.theirs, R.totals.diff, R.totals.same, R.vat], [700000, 810000, 110000, false, false]);
assert.equal(R.allSame, false);

// 날짜만 하루 다르면 일치(주의)로 센다 · 날짜 창(3일)을 넘으면 짝을 안 짓는다
const R2 = compareStatement([{ _id: "x", 상차일: "2026-11-03", 차량번호: "88바1234", 이름: "김철수", 청구운임: 100000 }], [{ date: "2026-11-04", plate: "88바1234", name: "김철수", amount: 100000 }]);
assert.deepEqual([R2.rows[0].status, R2.sum.ok, R2.sum.warn, R2.allSame], ["warn", 1, 1, true]);
const R3 = compareStatement([{ _id: "x", 상차일: "2026-11-03", 차량번호: "88바1234", 청구운임: 100000 }], [{ date: "2026-11-10", plate: "88바1234", amount: 100000 }]);
assert.deepEqual([R3.sum.ours, R3.sum.theirs], [1, 1]);

// 같은 차가 여러 번 — 날짜가 가까운 것끼리
const same = [1, 2, 3].map((d) => ({ _id: `s${d}`, 상차일: `2026-11-0${d}`, 차량번호: "88바1234", 이름: "김철수", 청구운임: 100000 * d }));
const R4 = compareStatement(same, [3, 1, 2].map((d) => ({ date: `2026-11-0${d}`, plate: "88바 1234", name: "김철수", amount: 100000 * d })));
assert.deepEqual([R4.sum.ok, R4.sum.bad], [3, 0], "같은 차 여러 번도 날짜로 짝");

// 차량번호가 없으면 이름으로
const R5 = compareStatement([{ _id: "n", 상차일: "2026-11-03", 차량번호: "88바1234", 이름: "김철수", 청구운임: 100000 }], [{ date: "2026-11-03", plate: "", name: "김철수", amount: 100000 }]);
assert.deepEqual([R5.rows[0].kind, R5.rows[0].status, R5.rows[0].cells.plate.st], ["pair", "ok", "none"]);

// 부가세 포함으로 적은 명세서
const R6 = compareStatement(same, same.map((o) => ({ date: o.상차일, plate: o.차량번호, name: o.이름, amount: Math.round(o.청구운임 * 1.1) })));
assert.deepEqual([R6.vat, R6.sum.bad, R6.totals.same, R6.totals.ours], [true, 0, true, 660000]);

// 업체 합계 줄이 줄 합과 다르면 알린다
const R7 = compareStatement(same.slice(0, 1), [{ date: "2026-11-01", plate: "88바1234", name: "김철수", amount: 100000 }], { statedTotal: 120000 });
assert.deepEqual([R7.totals.statedMismatch, R7.totals.theirs, R7.totals.same], [true, 120000, false]);

// 붙여넣은 글(탭) · 줄 글
const tt = textToTable("일자\t차량번호\t성명\t운임\n11/03\t88바1234\t김철수\t150,000\n11/04\t77사5678\t이영희\t160,000");
const H2 = detectHeader(tt);
assert.deepEqual(H2.map, { date: 0, plate: 1, name: 2, amount: 3 });
assert.equal(rowsFromTable(tt, { ...H2, ym: "2026-11" }).rows[1].date, "2026-11-04");
const L = parseLooseLines("11/03 인천-평택 88바 1234 김철수 150,000원\n11/04 77사5678 이영희 160,000\n합계 310,000", "2026-11");
assert.deepEqual(L.rows.map((r) => [r.date, normPlate(r.plate), r.name, r.amount]), [["2026-11-03", "88바1234", "김철수", 150000], ["2026-11-04", "77사5678", "이영희", 160000]]);
assert.equal(L.statedTotal, 310000);

// 제목 줄 없는 표 — 내용으로 짐작
const G = guessByContent([["11/03", "88바1234", "김철수", "150,000"], ["11/04", "77사5678", "이영희", "160,000"], ["11/05", "12가3456", "박민수", "170,000"]]);
assert.deepEqual(G, { plate: 1, date: 0, amount: 3, name: 2 });

// 캡처 글자 인식 → 표(빈칸이 있어도 제목 위치에 맞춘다)
const box = (text, x0, y0) => ({ text, bbox: { x0, y0, x1: x0 + text.length * 10, y1: y0 + 14 } });
const OT = ocrTable([box("일자", 0, 0), box("차량번호", 100, 2), box("기사", 250, 1), box("금액", 400, 0),
  box("11/03", 0, 30), box("88바1234", 100, 31), box("김철수", 250, 29), box("150,000", 395, 30),
  box("11/04", 0, 60), box("77사5678", 100, 61), box("160,000", 395, 60)]);
assert.deepEqual(OT, [["일자", "차량번호", "기사", "금액"], ["11/03", "88바1234", "김철수", "150,000"], ["11/04", "77사5678", "", "160,000"]]);

console.log("stmtCompare: 모두 통과");
