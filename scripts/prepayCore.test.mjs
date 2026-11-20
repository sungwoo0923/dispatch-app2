// node scripts/prepayCore.test.mjs — 선정산 파일 → 용차지급 매칭(src/prepayCore.js)
// 실제 업체 파일 대신 같은 모양의 가짜 줄로 검사한다(개인정보 없음).
import assert from "node:assert/strict";
import {
  parsePrepayRows, isPrepaySheet, invoiceDateOf, payDateHintOf, normalizeBankName,
  amountClose, matchPrepay, driverPayDiff, driverPatchFrom,
} from "../src/prepayCore.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ✓", name); };

const HEAD = [null, "NO", "선정산 신청액(vat 포함)", "지급예정일", "상환예정일", "차주업체명", "사업자번호", "대표자명", "은행명", "계좌번호", "예금주명", "차주휴대폰번호", "국세청승인번호", "차량번호", null, null, "필수입력필요"];
const row = (amt, note, co, biz, ceo, bank, acct, holder, appr, plate) => [null, null, amt, note, null, co, biz, ceo, bank, acct, holder, null, appr, plate];
const sheet = [
  [],
  HEAD,
  row(54780, "지급완료", "가나용달", "121-04-00001", "홍길동", "농협", "3521000000001", "홍길동", "20261012-41000195-a0000001", "경기93자0001"),
  row(1100000, "11/10 선정산 지급완료", "다라화물", "317-01-00002", "김철수", "국민", "46150100000002", "김철수", "20261031-70261101-00000002", "충남80아0002"),
  row(330000, null, "마바물류", "201-20-00003", "이영희", "카카오", "3333010000003", "이영희", "20261016-41000195-a0000003", "부산92아0003"),
  row(500000, null, "사아운수", "555-08-00004", "박민수", "신한", "110000000004", "박민수", "20261015-41000195-a0000004", "대전88아0004"),
  row(220000, null, "자차운수", "666-08-00005", "최지훈", "아이엠", "50400000005", "최지훈", "20261015-41000195-a0000005", "서울82바0005"),
  [], [],
];

t("선정산 양식 알아보기 · 빈 줄 건너뛰기", () => {
  assert.equal(isPrepaySheet(sheet), true);
  assert.equal(isPrepaySheet([["차량번호", "기사명", "상차일", "운송료"]]), false);
  assert.equal(parsePrepayRows(sheet).length, 5);
});

t("국세청승인번호 앞 8자리 = 계산서 작성일자", () => {
  assert.equal(invoiceDateOf("20261031-70261101-22751759"), "2026-10-31");
  assert.equal(invoiceDateOf("abc"), "");
});

t("지급예정일 메모에서 날짜 찾기", () => {
  assert.equal(payDateHintOf("11/10 선정산 지급완료", "2026-10-31"), "2026-11-10");
  assert.equal(payDateHintOf("지급완료", "2026-10-12"), "");
  assert.equal(payDateHintOf("2026.11.03", ""), "2026-11-03");
  assert.equal(payDateHintOf("1/5 지급", "2026-12-28"), "2027-01-05");
});

t("은행 짧은 이름 → 프로그램 은행 이름", () => {
  assert.equal(normalizeBankName("국민"), "KB국민");
  assert.equal(normalizeBankName("농협"), "NH농협");
  assert.equal(normalizeBankName("기업"), "IBK기업");
  assert.equal(normalizeBankName("카카오"), "카카오뱅크");
  assert.equal(normalizeBankName("케이"), "케이뱅크");
  assert.equal(normalizeBankName("아이엠"), "iM뱅크(대구)");
  assert.equal(normalizeBankName("신한은행"), "신한");
});

t("금액 비교 — 부가세 포함 · 산재보험료 차주분 빠진 금액도 같은 금액", () => {
  assert.equal(amountClose(55000, 50000), true);
  assert.equal(amountClose(54780, 50000), true); // 산재 220원 빠짐
  assert.equal(amountClose(60000, 50000), false);
});

t("오더 맞추기 — 같은 날 · 월 합계 · 거래처별 합계 · 지입 · 이미 반영 · 금액 다름", () => {
  const items = parsePrepayRows(sheet);
  const pool = [
    { _id: "a", 차량번호: "경기93자0001", 상차일: "2026-10-12", 기사운임: 50000, 거래처명: "A" },
    // 다라화물 — 10월 한 달 에이제이 오더 3건 합계 1,000,000 (+ 다른 거래처 1건은 빼야 맞음)
    { _id: "b1", 차량번호: "충남80아0002", 상차일: "2026-10-03", 기사운임: 300000, 거래처명: "에이제이" },
    { _id: "b2", 차량번호: "충남 80아 0002", 상차일: "2026-10-15", 기사운임: 300000, 거래처명: "에이제이" },
    { _id: "b3", 차량번호: "충남80아0002", 상차일: "2026-10-28", 기사운임: 400000, 거래처명: "에이제이" },
    { _id: "b4", 차량번호: "충남80아0002", 상차일: "2026-10-20", 기사운임: 150000, 거래처명: "기타" },
    // 마바물류 — 같은 날 2건 합계 300,000
    { _id: "c1", 차량번호: "부산92아0003", 상차일: "2026-10-16", 기사운임: 100000, 거래처명: "A" },
    { _id: "c2", 차량번호: "부산92아0003", 상차일: "2026-10-16", 기사운임: 200000, 거래처명: "B" },
    // 사아운수 — 금액이 다름(확인 필요)
    { _id: "d", 차량번호: "대전88아0004", 상차일: "2026-10-15", 기사운임: 300000, 거래처명: "A" },
  ];
  const all = [...pool, { _id: "z", 차량번호: "서울82바0005", 상차일: "2026-10-15", 기사운임: 200000, 지급상태: "지급완료", 국세청승인번호: "20261015-41000195-a0000005" }];
  const r = Object.fromEntries(matchPrepay(items, pool, { allOrders: all, fleetPlates: new Set() }).map((x) => [x.company, x]));
  assert.equal(r["가나용달"].status, "match"); assert.deepEqual(r["가나용달"].orders.map((o) => o._id), ["a"]);
  assert.equal(r["다라화물"].status, "match"); assert.deepEqual(r["다라화물"].orders.map((o) => o._id).sort(), ["b1", "b2", "b3"]);
  assert.equal(r["마바물류"].status, "match"); assert.equal(r["마바물류"].orders.length, 2);
  assert.equal(r["사아운수"].status, "check"); assert.deepEqual(r["사아운수"].orders.map((o) => o._id), ["d"]);
  assert.equal(r["자차운수"].status, "done");

  const fl = matchPrepay(parsePrepayRows(sheet).slice(0, 1), [], { fleetPlates: new Set(["경기93자0001"]) });
  assert.equal(fl[0].status, "fleet");
});

t("한 오더는 한 줄에만 — 같은 차량 같은 금액 두 장", () => {
  const two = [
    { key: "1", plate: "전남80바7683", plateKey: "전남80바7683", amount: 482070, invoiceDate: "2026-10-29", approvalNo: "x1" },
    { key: "2", plate: "전남80바7683", plateKey: "전남80바7683", amount: 482070, invoiceDate: "2026-10-30", approvalNo: "x2" },
  ];
  const pool = [
    { _id: "p1", 차량번호: "전남80바7683", 상차일: "2026-10-29", 기사운임: 438245 },
    { _id: "p2", 차량번호: "전남80바7683", 상차일: "2026-10-30", 기사운임: 438245 },
  ];
  const r = matchPrepay(two, pool);
  assert.deepEqual(r.map((x) => x.orders[0]._id), ["p1", "p2"]);
});

t("기사관리 정산정보 — 빈 칸만 채우고 다른 값은 따로", () => {
  const it = parsePrepayRows(sheet)[0];
  const { fill, conflicts } = driverPayDiff({ 사업자번호: "1210456401", 정산계좌: { bank: "NH농협", acct: "", holder: "" } }, it);
  assert.equal(fill["사업자번호"], undefined); // 이미 있음(다른 번호) → conflicts
  assert.equal(conflicts[0].path, "사업자번호");
  assert.equal(fill["정산계좌.acct"], "3521000000001");
  const patch = driverPatchFrom({ 정산계좌: { bank: "NH농협" } }, fill);
  assert.deepEqual(patch.정산계좌, { bank: "NH농협", acct: "3521000000001", holder: "홍길동" });
  assert.equal(patch.사업자상호, "가나용달");
});

console.log(`\n선정산 매칭 테스트 ${n}개 통과`);
