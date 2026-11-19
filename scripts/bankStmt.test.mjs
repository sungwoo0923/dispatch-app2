// 🏦 2026-11-19 통장 거래내역 읽기 · 출금 ↔ 지출결의 맞추기 테스트 — node scripts/bankStmt.test.mjs
import assert from "node:assert/strict";
import { parseStatement, normDate, summarize, depositsOf, matchWithdrawals, ledgerKeys, txnLedgerKey, presetByBankName, savedOf, BANK_PRESETS } from "../src/bankStmtCore.js";

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

t("은행 고르기 — 카카오뱅크 · 토스뱅크(거래금액 한 칸, 출금은 −)", () => {
  const k = parseStatement([["카카오뱅크 거래내역"], ["거래일시", "구분", "거래금액", "거래 후 잔액", "거래구분", "내용", "메모"], ["2026.11.18 10:00:00", "입금", "50,000", "1", "일반입금", "김철수", ""], ["2026.11.18 11:00:00", "출금", "-12,000", "1", "체크카드", "편의점", ""]], { bank: "kakao" });
  assert.deepEqual(k.txns.map((x) => [x.in, x.out, x.name]), [[50000, 0, "김철수"], [0, 12000, "편의점"]]);
  const tb = parseStatement([["거래 일시", "적요", "거래 유형", "거래 금액", "거래 후 잔액"], ["2026-11-18 09:00", "급여", "이체", "-3,000,000", "1"], ["2026-11-18 10:00", "한빛물류", "입금", "1,100,000", "1"]], { bank: "toss" });
  assert.deepEqual(tb.txns.map((x) => [x.in, x.out]), [[0, 3000000], [1100000, 0]]);
});

t("은행 고르기 — 국민(출금액(원) · 보낸분/받는분) · 우리(지급)", () => {
  const kb = parseStatement([["거래일시", "적요", "보낸분/받는분", "송금메모", "출금액(원)", "입금액(원)", "잔액(원)", "거래점"], ["2026.11.18 10:00:00", "인터넷", "홍길동", "11월", "0", "300,000", "1", "x"]], { bank: "kb" });
  assert.deepEqual([kb.txns[0].in, kb.txns[0].name, kb.txns[0].memo], [300000, "홍길동", "11월"]);
  const wr = parseStatement([["거래일시", "적요", "기재내용", "지급(원)", "입금(원)", "거래후 잔액(원)"], ["2026.11.18 10:00", "타행", "정비소", "120,000", "0", "1"]], { bank: "woori" });
  assert.deepEqual([wr.txns[0].out, wr.txns[0].name], [120000, "정비소"]);
});

t("칸을 직접 고르면 다음에도 그 이름으로 찾는다", () => {
  const aoa = [["일", "들어온돈", "나간돈", "누구"], ["2026-11-18", "1000", "", "갑"]];
  const first = parseStatement(aoa);
  assert.equal(first.txns.length, 0); // 자동으로는 못 찾음
  const map = { date: 0, in: 1, out: 2, name: 3 };
  const fixed = parseStatement(aoa, { map, headerRow: 0 });
  assert.equal(fixed.txns[0].in, 1000);
  const saved = savedOf(map, aoa[0]);
  assert.deepEqual(saved, { date: "일", in: "들어온돈", out: "나간돈", name: "누구" });
  assert.equal(parseStatement(aoa, { saved }).txns[0].name, "갑");
});

t("통장 이름으로 은행 맞추기", () => {
  assert.equal(presetByBankName("IBK기업은행"), "ibk"); assert.equal(presetByBankName("국민"), "kb"); assert.equal(presetByBankName("카카오뱅크"), "kakao"); assert.equal(presetByBankName(""), "");
  assert.ok(BANK_PRESETS.length >= 15);
});

console.log(`\n통장 내역 테스트 ${n}개 통과`);
