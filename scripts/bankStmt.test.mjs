// 🏦 2026-11-19 통장 거래내역 읽기 · 출금 ↔ 지출결의 맞추기 테스트 — node scripts/bankStmt.test.mjs
import assert from "node:assert/strict";
import { parseStatement, normDate, summarize, depositsOf, matchWithdrawals, ledgerKeys, txnLedgerKey } from "../src/bankStmtCore.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

t("날짜 모양 여러 가지", () => {
  assert.equal(normDate("2026.11.19 09:12:33"), "2026-11-19");
  assert.equal(normDate("2026/1/5"), "2026-01-05");
  assert.equal(normDate("20261119"), "2026-11-19");
  assert.equal(normDate("11-19", 2026), "2026-11-19");
  assert.equal(normDate(46345), "2026-11-19"); // 엑셀 날짜 숫자
  assert.equal(normDate("합계"), "");
});

t("기업은행 — 위에 제목 줄 · 입금액/출금액 두 칸 · 합계 줄 건너뜀", () => {
  const aoa = [
    ["거래내역조회"], ["계좌번호", "123-456"], [],
    ["거래일시", "출금액", "입금액", "잔액", "거래내용", "상대계좌예금주명", "메모"],
    ["2026-11-18 10:01:00", "", "1,100,000", "5,000,000", "(주)한빛물류", "한빛물류", ""],
    ["2026-11-18 15:30:00", "85,000", "", "4,915,000", "주유비", "SK주유소", "11월 주유"],
    ["합계", "85,000", "1,100,000", "", "", "", ""],
  ];
  const { txns, skipped } = parseStatement(aoa);
  assert.equal(txns.length, 2); assert.equal(skipped, 1);
  assert.deepEqual([txns[0].in, txns[0].out, txns[0].time], [1100000, 0, "10:01:00"]);
  assert.equal(txns[1].out, 85000); assert.equal(txns[1].memo, "11월 주유");
  const s = summarize(txns); assert.equal(s.in, 1100000); assert.equal(s.out, 85000);
  assert.deepEqual(depositsOf(txns), [{ amount: 1100000, name: "(주)한빛물류", date: "20261118", _bankId: txns[0].id }]);
});

t("국민 · 농협 — 맡기신금액/찾으신금액", () => {
  const { txns } = parseStatement([["거래일자", "거래시간", "적요", "보낸분/받는분", "찾으신금액", "맡기신금액", "잔액"], ["2026.11.17", "09:00", "인터넷", "홍길동", "0", "300000", "1"], ["2026.11.17", "11:00", "타행이체", "정비소", "120000", "0", "1"]]);
  assert.equal(txns.length, 2); assert.equal(txns[0].in, 300000); assert.equal(txns[1].out, 120000);
});

t("거래금액 + 구분 칸", () => {
  const { txns } = parseStatement([["날짜", "구분", "거래금액", "입금자명"], ["2026-11-01", "입금", "50,000", "김철수"], ["2026-11-02", "출금", "20,000", "식대"]]);
  assert.equal(txns[0].in, 50000); assert.equal(txns[1].out, 20000); assert.equal(txns[0].name, "김철수");
});

t("머리줄이 없으면 알려 준다", () => {
  const r = parseStatement([["아무", "칸"], ["1", "2"]]);
  assert.equal(r.txns.length, 0); assert.ok(r.error);
});

t("출금 ↔ 지급 대기 지출결의(문서 전체 · 지출 내역 한 줄)", () => {
  const outs = [
    { date: "2026-11-18", name: "SK주유소", memo: "", out: 85000 },
    { date: "2026-11-18", name: "정비소", memo: "", out: 120000 },
    { date: "2026-11-18", name: "모르는곳", memo: "", out: 7777 },
  ];
  const at = Date.parse("2026-11-17T10:00:00+09:00");
  const docs = [
    { id: "A", amount: 85000, drafter: { name: "김경리" }, data: { lines: [{ vendor: "SK주유소", total: 85000 }] }, line: [{ at }] },
    { id: "B", amount: 200000, drafter: { name: "박기사" }, data: { lines: [{ vendor: "정비소", total: 120000 }, { vendor: "세차장", total: 80000 }] }, line: [{ at }] },
  ];
  const m = matchWithdrawals(outs, docs);
  assert.deepEqual([m.get(0).docId, m.get(0).lineIdx, m.get(0).sure], ["A", null, true]);
  assert.deepEqual([m.get(1).docId, m.get(1).lineIdx], ["B", 0]);
  assert.equal(m.has(2), false);
  // 이미 체크한 줄은 다시 맞추지 않는다
  const m2 = matchWithdrawals(outs, [{ ...docs[1], paidLines: { 0: { at: 1 } } }]);
  assert.equal(m2.has(1), false);
});

t("같은 금액 출금 두 건은 한 문서를 나눠 갖지 않는다", () => {
  const outs = [{ date: "2026-11-18", name: "a", out: 50000 }, { date: "2026-11-18", name: "b", out: 50000 }];
  const m = matchWithdrawals(outs, [{ id: "X", amount: 50000, data: { lines: [] }, line: [{ at: Date.now() }] }]);
  assert.equal(m.size, 1);
});

t("장부에 이미 있는지", () => {
  const keys = ledgerKeys([{ date: "2026-11-18", type: "지출", amount: 85000 }]);
  assert.equal(keys.has(txnLedgerKey({ date: "2026-11-18", in: 0, out: 85000 })), true);
  assert.equal(keys.has(txnLedgerKey({ date: "2026-11-18", in: 85000, out: 0 })), false);
});

console.log(`\n통장 내역 테스트 ${n}개 통과`);
