// 🧾 2026-11-08 전표·재무제표 계산 단위 테스트(테스트운송사 시범 기능)
//  실행: node scripts/journalCore.test.mjs
import assert from "node:assert/strict";
import { entriesFromApproval, entriesFromOrders, entriesFromLedger, openingEntry, buildJournal, trialBalance, incomeStatement, balanceSheet, accountLedger, journalCsv, isBalanced, sumSide } from "../src/journalCore.js";
import { accountOf, normalSide } from "../src/acctChart.js";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };

const spend = { id: "a1", cat: "expense", form: "spend", status: "approved", amount: 110000, docNo: "EX-1", title: "사무용품",
  data: { account: "소모품비", pay: "계좌이체", date: "2026-11-03", lines: [{ vendor: "문구점", supply: "100000", vat: "10000", total: "110000" }] } };

t("계정과목표 — 이름·별칭·사용자 계정", () => {
  assert.equal(accountOf("보통예금").kind, "asset");
  assert.equal(accountOf("임차료").name, "지급임차료");
  assert.equal(accountOf("협회비").kind, "expense");
  assert.equal(accountOf("협회비").custom, true);
  assert.equal(normalSide(accountOf("운송수입")), "C");
  assert.equal(normalSide(accountOf("이자수익")), "C");
  assert.equal(normalSide(accountOf("잡손실")), "D");
});

t("지출결의 최종 승인 → 발생 전표(비용·부가세대급금 / 미지급금)", () => {
  const [e] = entriesFromApproval(spend);
  assert.equal(e.date, "2026-11-03");
  assert.ok(isBalanced(e));
  assert.deepEqual(e.lines.map((l) => [l.side, l.acct, l.amount]), [["D", "소모품비", 100000], ["D", "부가세대급금", 10000], ["C", "미지급금", 110000]]);
});

t("지급완료 → 지급 전표(미지급금 / 보통예금) · 현금이면 현금", () => {
  const paid = { ...spend, paid: { at: 1, date: "2026-11-05" } };
  const es = entriesFromApproval(paid);
  assert.equal(es.length, 2);
  assert.deepEqual(es[1].lines.map((l) => [l.side, l.acct, l.amount]), [["D", "미지급금", 110000], ["C", "보통예금", 110000]]);
  assert.equal(es[1].date, "2026-11-05");
  const cash = entriesFromApproval({ ...paid, data: { ...paid.data, pay: "현금" } });
  assert.equal(cash[1].lines[1].acct, "현금");
});

t("승인 전·반려·금액 0·근태 문서는 전표 없음", () => {
  assert.equal(entriesFromApproval({ ...spend, status: "pending" }).length, 0);
  assert.equal(entriesFromApproval({ ...spend, status: "rejected" }).length, 0);
  assert.equal(entriesFromApproval({ ...spend, amount: 0 }).length, 0);
  assert.equal(entriesFromApproval({ ...spend, cat: "leave" }).length, 0);
});

t("가지급금 신청은 자산(가지급금) · 법인카드 사용보고는 지급 전표 없음", () => {
  const adv = entriesFromApproval({ id: "a2", cat: "expense", form: "advance", status: "approved", amount: 300000, data: {}, paid: { at: 1, date: "2026-11-02" } });
  assert.equal(adv[0].lines[0].acct, "가지급금");
  const card = entriesFromApproval({ id: "a3", cat: "expense", form: "card", status: "approved", amount: 50000, data: { account: "복리후생비", date: "2026-11-02" }, paid: { at: 1 } });
  assert.equal(card.length, 1);
  assert.equal(card[0].lines[0].acct, "복리후생비");
});

t("세액이 합계보다 크게 적혀도 전표는 균형", () => {
  const [e] = entriesFromApproval({ ...spend, amount: 5000, data: { ...spend.data, lines: [{ vat: "9000" }] } });
  assert.ok(isBalanced(e));
});

t("배차완료 오더 → 월별 매출(부가세 포함 외상매출금) · 원가 전표, 취소·배차중 제외", () => {
  const orders = [
    { 배차상태: "배차완료", 상차일: "2026-10-03", 청구운임: "200,000", 기사운임: "150000" },
    { 배차상태: "배차완료", 상차일: "2026-10-20", 청구운임: 100000, 기사운임: 80000 },
    { 배차상태: "배차중", 상차일: "2026-10-21", 청구운임: 999999 },
    { 배차상태: "배차완료", 상차일: "2026-10-22", 청구운임: 50000, 지급방식: "취소" },
    { 배차상태: "배차완료", 상차일: "2026-11-01", 청구운임: 10000, 기사운임: 7000, source: "transport_transmit" },
  ];
  const es = entriesFromOrders(orders);
  assert.equal(es.length, 2);
  const sale = es.find((e) => e.id === "sale_2026-10");
  assert.equal(sale.date, "2026-10-31");
  assert.deepEqual(sale.lines.map((l) => [l.side, l.acct, l.amount]), [["D", "외상매출금", 330000], ["C", "운송수입", 300000], ["C", "부가세예수금", 30000]]);
  assert.equal(es.find((e) => e.id === "cost_2026-10").lines[0].amount, 230000);
  es.forEach((e) => assert.ok(isBalanced(e)));
});

t("장부 → 전표(기사지급·수금·수기 지출·수입) · 전자결재 자동 줄과 0원 줄 제외", () => {
  const rows = [
    { id: "r1", date: "2026-11-02", type: "지출", auto: "drvpay", amount: 230000 },
    { id: "r2", date: "2026-11-03", type: "수입", auto: "collect", amount: 330000, vendor: "A상사" },
    { id: "r3", date: "2026-11-04", type: "지출", account: "통신비", method: "법인카드", amount: 55000 },
    { id: "r4", date: "2026-11-04", type: "수입", account: "이자수입", amount: 1200 },
    { id: "r5", date: "2026-11-04", type: "지출", auto: "approval", amount: 110000, account: "소모품비" },
    { id: "r6", date: "2026-11-04", type: "지출", auto: "drvpay", amount: 0 },
    { id: "r7", date: "2026-01-01", type: "지출", account: "통신비", amount: 1000 },
  ];
  const es = entriesFromLedger(rows, { from: "2026-10-01" });
  assert.deepEqual(es.map((e) => e.id), ["led_r1", "led_r2", "led_r3", "led_r4"]);
  assert.equal(es[2].lines[1].acct, "미지급금");
  assert.equal(es[3].lines[1].acct, "이자수익");
  es.forEach((e) => assert.ok(isBalanced(e)));
});

t("기초 잔액 — 통장·현금 차변, 대출 대변, 차액은 자본 · 카드 제외", () => {
  const e = openingEntry([
    { name: "운영통장", kind: "보통예금", openingBalance: 10000000, openingDate: "2026-10-01" },
    { name: "시재", kind: "현금", openingBalance: 500000, openingDate: "2026-09-15" },
    { name: "대출", kind: "대출", openingBalance: 3000000, openingDate: "2026-10-01" },
    { name: "카드", kind: "법인카드", openingBalance: 5000000 },
  ]);
  assert.equal(e.date, "2026-09-15");
  assert.ok(isBalanced(e));
  assert.equal(e.lines.find((l) => l.acct === "자본금").amount, 7500000);
  assert.equal(openingEntry([]), null);
});

t("전체 흐름 — 시산표 차대 일치 · 손익 · 재무상태표 균형(자산 = 부채 + 자본)", () => {
  const journal = buildJournal({
    approvals: [{ ...spend, paid: { at: 1, date: "2026-11-05" } }],
    orders: [{ 배차상태: "배차완료", 상차일: "2026-10-03", 청구운임: 300000, 기사운임: 230000 }],
    ledger: [{ id: "r1", date: "2026-11-02", type: "지출", auto: "drvpay", amount: 230000 }, { id: "r2", date: "2026-11-03", type: "수입", auto: "collect", amount: 330000 }],
    funds: [{ name: "운영통장", kind: "보통예금", openingBalance: 1000000, openingDate: "2026-10-01" }],
    manual: [{ id: "m1", date: "2026-11-30", memo: "감가상각", lines: [{ side: "D", acct: "기타", amount: 10000 }, { side: "C", acct: "비품", amount: 10000 }] }],
  });
  assert.ok(journal.every((e) => e.balanced));
  assert.equal(journal[0].id, "opening");
  assert.match(journal[0].no, /^20261001-001$/);
  const tb = trialBalance(journal);
  assert.equal(tb.reduce((s, a) => s + a.debit, 0), tb.reduce((s, a) => s + a.credit, 0));
  const is = incomeStatement(journal);
  assert.equal(is.totals.revenue, 300000);
  assert.equal(is.totals.cogs, 230000);
  assert.equal(is.totals.gross, 70000);
  assert.equal(is.totals.sga, 110000);
  assert.equal(is.totals.net, -40000); // 판관비 = 소모품비 100,000(공급가액) + 수동 전표 10,000
  const bs = balanceSheet(journal);
  assert.equal(bs.totals.check, 0);
  // 보통예금 = 1,000,000 − 230,000 + 330,000 − 110,000
  assert.equal(bs.assets.find((a) => a.name === "보통예금").balance, 990000);
  // 외상매출금 330,000 − 수금 330,000 = 0 → 재무상태표에서 빠짐
  assert.equal(bs.assets.find((a) => a.name === "외상매출금"), undefined);
  // 기간 손익 — 10월만
  assert.equal(incomeStatement(journal, { from: "2026-10-01", to: "2026-10-31" }).totals.net, 70000);
  // 계정별 원장 누적 잔액
  const led = accountLedger(journal, "보통예금");
  assert.equal(led[led.length - 1].balance, 990000);
});

t("기초 잔액 날짜 이전 장부·결재는 전표에서 뺀다(이중 반영 방지)", () => {
  const journal = buildJournal({
    ledger: [{ id: "old", date: "2026-09-01", type: "지출", account: "통신비", amount: 1000 }],
    approvals: [{ ...spend, data: { ...spend.data, date: "2026-09-02" } }],
    funds: [{ name: "운영통장", kind: "보통예금", openingBalance: 1000, openingDate: "2026-10-01" }],
  });
  assert.deepEqual(journal.map((e) => e.id), ["opening"]);
});

t("CSV(더존·위하고 일반전표 올리기용) — BOM · 머리글 · 줄 수", () => {
  const journal = buildJournal({ approvals: [spend] });
  const csv = journalCsv(journal);
  assert.ok(csv.startsWith("﻿"));
  const rows = csv.slice(1).split("\r\n");
  assert.equal(rows[0], '"일자","전표번호","구분","계정코드","계정과목","거래처","적요","차변","대변"');
  assert.equal(rows.length, 1 + 3);
  assert.equal(sumSide(journal[0].lines, "D"), 110000);
});

console.log(`journalCore: ${n}개 통과`);
