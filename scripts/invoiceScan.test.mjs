// node scripts/invoiceScan.test.mjs — 증빙서류(계산서) 스캔 글 해석 점검
import assert from "node:assert/strict";
import { parseInvoiceText, checkAmount } from "../src/invoiceScan.js";

// 1) 홈택스 전자세금계산서(Vision 줄 순서)
const hometax = `전자세금계산서
승인번호 20261110-41000000-12345678
공급자 등록번호 123-45-67890 공급받는자 등록번호 234-56-78901
상호(법인명) 테스트운송사 성명 홍길동 상호(법인명) 동원F&B(주) 성명 김철수
작성일자 2026-11-10 공급가액 400,000 세액 40,000
11 10 운송료 400,000 40,000
합계금액 440,000 이 금액을 (청구) 함`;
let r = parseInvoiceText(hometax);
assert.equal(r.kind, "전자세금계산서");
assert.equal(r.date, "2026-11-10");
assert.equal(r.supply, 400000); assert.equal(r.vat, 40000); assert.equal(r.total, 440000);
assert.equal(r.supplier, "테스트운송사"); assert.equal(r.buyer, "동원F&B(주)");
assert.equal(r.payer, "동원F&B(주)");
assert.equal(checkAmount(r, 400000).level, "ok");
assert.equal(checkAmount(r, 450000).level, "warn");

// 2) 칸 이름이 깨진 캡처 — 짝 맞추기
r = parseInvoiceText(`세 금 계 산 서\n2026년 11월 9일\n공급 가 액\n 세 앸\n350,000\n35,000\n385,000`);
assert.equal(r.kind, "세금계산서"); assert.equal(r.date, "2026-11-09");
assert.equal(r.supply, 350000); assert.equal(r.vat, 35000); assert.equal(r.total, 385000);

// 3) 이체확인증 — 보낸 사람이 입금자명
r = parseInvoiceText(`이체확인증\n이체일시 2026.11.11 14:22\n보내는분 동원에프앤비\n받는분 테스트운송사\n이체금액 440,000원`);
assert.equal(r.kind, "이체확인증"); assert.equal(r.date, "2026-11-11");
assert.equal(r.payer, "동원에프앤비"); assert.equal(r.total, 440000);
assert.equal(checkAmount(r, 400000).level, "ok");

// 4) 승인번호만 있는 경우 날짜
r = parseInvoiceText(`전자세금계산서\n승인번호 20261105-11111111-22222222\n합계금액 110,000`);
assert.equal(r.date, "2026-11-05"); assert.equal(r.supply, 100000); assert.equal(r.vat, 10000);

// 5) 면세 계산서
r = parseInvoiceText(`계산서\n작성일자 2026/11/01\n공급가액 200,000\n합계 200,000`);
assert.equal(r.kind, "계산서"); assert.equal(r.vat, 0); assert.equal(r.total, 200000); assert.equal(r.taxFree, true);

// 6) 표 모양 날짜
r = parseInvoiceText(`세금계산서\n작성 년 월 일\n2026 11 03\n공급가액 500,000 세액 50,000`);
assert.equal(r.date, "2026-11-03");
console.log("invoiceScan: 모든 점검 통과");
// 7) 줄 순서가 뒤바뀌어 우리 회사가 받는자로 읽혀도 — OUT(우리가 공급자)이면 입금자는 거래처
{
  const t = `전자세금계산서\n상호(법인명) 동원F&B(주) 성명 김철수 상호(법인명) 테스트운송사 성명 홍길동\n작성일자 2026-11-10 공급가액 400,000 세액 40,000`;
  const x = parseInvoiceText(t, { self: "테스트운송사", selfIs: "supplier" });
  assert.equal(x.supplier, "테스트운송사"); assert.equal(x.buyer, "동원F&B(주)"); assert.equal(x.payer, "동원F&B(주)");
  const y = parseInvoiceText(t, { self: "테스트운송사" });
  assert.notEqual(y.payer, "테스트운송사");
  console.log("invoiceScan: 우리 회사 입금자 방지 통과");
}
