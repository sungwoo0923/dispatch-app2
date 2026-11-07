// ======================= functions/arCore.mjs =======================
// 💰 2026-11-07 미수금 · 예상 부가세 공용 계산(화면과 서버가 같은 파일을 쓴다 — sheetProfileCore.mjs와 같은 방식)
//  · 화면: src/arAging.js가 다시 내보냄(회계관리 · 회계 장부 · 일일 경영 보고 · 경영 분석)
//  · 서버: functions/aiAssistant.js가 import()로 읽음(AI 비서 미수금)
//
//  미수금 규칙(거래처정산 › 미수금관리와 같은 식)
//  · 대상: 올해 배차완료 오더 + 고정거래처(날짜 = 상차일) · 취소 · 운송사 전송 사본 제외
//    지급방식과 상관없이 전부(선불 · 착불도 미수금에는 넣는다 — 거래명세서만 고를 수 있음)
//  · 청구액 = 거래처 · 청구월마다 공급가(청구운임) 합계 × 1.1 반올림 → 부가세 포함
//    (수금 기록은 실제 입금액이라 부가세가 들어 있다)
//  · 미수금 = 청구액(부가세 포함) − 수금 기록 · 나이는 오래된 청구부터 수금된 것으로 보고 남은 청구의 경과일
//
//  예상 부가세 규칙(회계관리 회계 개요 · 회계 장부 › 부가세 자료)
//  · 매출세액 = 지급방식 "계산서" 오더 공급가 × 10%
//  · 매입세액 = 기사관리에서 "세금계산서 발행 기사"로 켠 기사(차량번호로 찾음)의 기사운임 × 10%
//  · 예상 부가세 = 매출세액 − 매입세액(추정 · 실제 신고는 세무사 확인)

export const AR_VAT_RATE = 0.1;
const toWon = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const CANCELED = ["취소", "배차취소", "오더취소", "취소됨"];
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const dateOf = (r) => String(r?.상차일 || r?.날짜 || "").slice(0, 10);
const normPlate = (s) => String(s ?? "").replace(/\s+/g, "").toUpperCase();

export const vatIncluded = (supply) => Math.round((Number(supply) || 0) * (1 + AR_VAT_RATE));
export const arClientOf = (r) => String(r?.거래처명 || "").trim() || String(r?.상차지명 || "").trim() || "미분류";
export const isArCanceled = (r) => r?.배차상태 === "배차취소" || CANCELED.includes(String(r?.상태 || "").trim()) || String(r?.지급방식 || "").trim() === "취소";
// 미수금에 넣는 오더 — 배차완료 · 취소 아님 · 운송사 전송 사본 아님(고정거래처 줄은 fixedArRows로 배차완료가 붙어 들어온다)
export const isArOrder = (r) => !!r && String(r.배차상태 || "").trim() === "배차완료" && !isArCanceled(r) && r.source !== "transport_transmit";
// 고정거래처(fixedClients) 줄 → 오더 모양(상차일 = 날짜 · 배차완료)
export const fixedArRows = (fixedRows) => (fixedRows || []).map((r) => ({ ...r, 상차일: r.상차일 || r.날짜, 배차상태: "배차완료", _fixed: true }));
// 수금 기록 값(숫자 · 글자 · {amount}) → 원
export const paidAmountOf = (v) => (typeof v === "number" ? v : toWon(v && typeof v === "object" ? (v.amount ?? v.paid ?? 0) : v));

// 미수금 나이 — invoices: [{ d, amt }] · paid: 그 거래처 수금 합계 · 결과 { b30, b60, b90, over, oldest }
export function openInvoices(invoices, paid, today) {
  let left = Math.max(0, paid || 0);
  const open = [];
  [...(invoices || [])].filter((x) => x && x.d).sort((x, y) => x.d.localeCompare(y.d)).forEach(({ d, amt }) => {
    const use = Math.min(left, amt); left -= use; const rest = amt - use; if (rest <= 0) return;
    open.push({ d, amt: rest, age: Math.max(0, dayDiff(d, today)) });
  });
  return open;
}
export function agingOf(invoices, paid, today) {
  const out = { b30: 0, b60: 0, b90: 0, over: 0, oldest: 0 };
  openInvoices(invoices, paid, today).forEach(({ amt, age }) => {
    out.oldest = Math.max(out.oldest, age);
    if (age <= 30) out.b30 += amt; else if (age <= 60) out.b60 += amt; else if (age <= 90) out.b90 += amt; else out.over += amt;
  });
  return out;
}

// 거래처별 청구(부가세 포함) — { [거래처]: { supply, billed, count, list:[{d, amt(부가세 포함 청구월 묶음)}] } }
//  · 청구월마다 묶어 × 1.1 반올림(거래처정산과 원 단위까지 같게) · 나이 계산은 그 달 첫 오더 날짜로
export function arInvoicesByClient({ orders = [], fixedRows = [], year } = {}) {
  const seen = new Set();
  const byCM = {};
  [...(orders || []), ...fixedArRows(fixedRows)].forEach((r) => {
    if (!isArOrder(r)) return;
    const d = dateOf(r); if (!d || (year && d.slice(0, 4) !== String(year))) return;
    const k = r._id ? `${r._fixed ? "fixed" : r.__col || ""}/${r._id}` : null;
    if (k) { if (seen.has(k)) return; seen.add(k); }
    const c = arClientOf(r); const ym = d.slice(0, 7);
    const e = (byCM[c] = byCM[c] || {}); const m = (e[ym] = e[ym] || { supply: 0, count: 0, first: d });
    m.supply += toWon(r.청구운임); m.count += 1; if (d < m.first) m.first = d;
  });
  const out = {};
  Object.entries(byCM).forEach(([c, months]) => {
    const list = Object.values(months).map((m) => ({ d: m.first, amt: vatIncluded(m.supply) }));
    out[c] = { supply: Object.values(months).reduce((a, m) => a + m.supply, 0), billed: list.reduce((a, x) => a + x.amt, 0), count: Object.values(months).reduce((a, m) => a + m.count, 0), list };
  });
  return out;
}

// 거래처별 미수금 — [{ client, supply, billed(부가세 포함), paid, outstanding, aging, oldest, open }] 미수금 큰 순(다 받은 거래처도 포함)
export function receivablesOf({ orders = [], fixedRows = [], paid = {}, today, year } = {}) {
  const yr = year || String(today || "").slice(0, 4);
  const inv = arInvoicesByClient({ orders, fixedRows, year: yr });
  return Object.entries(inv).map(([client, v]) => {
    const p = paidAmountOf(paid?.[client]);
    const open = openInvoices(v.list, p, today);
    const aging = agingOf(v.list, p, today);
    return { client, supply: v.supply, billed: v.billed, count: v.count, paid: p, outstanding: Math.max(0, v.billed - p), aging, oldest: aging.oldest, open };
  }).sort((a, b) => b.outstanding - a.outstanding);
}

// ── 예상 부가세 ──
export const isTaxInvoiceSale = (r) => String(r?.지급방식 || "").trim() === "계산서";
export const isInvoiceDriver = (d) => d?.세금계산서발행 === true;
// drivers → 세금계산서 발행 기사 차량번호 모음
export const invoiceDriverPlates = (drivers) => new Set((drivers || []).filter(isInvoiceDriver).map((d) => normPlate(d.차량번호)).filter(Boolean));
// orders: 이미 고른 오더(배차완료 등) · 결과 { saleSupply, saleVat, buySupply, buyVat, vat, saleCount, otherSale, buyCount, otherBuy }
export function vatEstimate(orders, drivers) {
  const plates = invoiceDriverPlates(drivers);
  const o = { saleSupply: 0, saleVat: 0, saleCount: 0, otherSale: 0, buySupply: 0, buyVat: 0, buyCount: 0, otherBuy: 0, vat: 0 };
  (orders || []).forEach((r) => {
    const s = toWon(r.청구운임); const b = toWon(r.기사운임);
    if (isTaxInvoiceSale(r)) { o.saleSupply += s; o.saleCount += 1; } else o.otherSale += s;
    if (b && plates.has(normPlate(r.차량번호))) { o.buySupply += b; o.buyCount += 1; } else o.otherBuy += b;
  });
  o.saleVat = Math.round(o.saleSupply * AR_VAT_RATE);
  o.buyVat = Math.round(o.buySupply * AR_VAT_RATE);
  o.vat = o.saleVat - o.buyVat;
  return o;
}

// ── 거래명세서 선불·착불 ──
//  · 선불·착불은 기사가 화주에게 직접 받는 운임이라 거래명세서에서는 기본으로 뺀다(회사 설정 · 명세서마다 바꿀 수 있음)
//  · 미수금에는 지금처럼 넣는다(위 receivablesOf)
export const PREPAID_PAYS = ["선불", "착불"];
export const isPrepaidPay = (r) => PREPAID_PAYS.includes(String(r?.지급방식 || "").trim());
// 명세서 문서(arDesk stmt)의 선택이 있으면 그것, 없으면 회사 기본(arDesk config.stmtIncludePrepaid · 처음엔 빼기)
export const stmtIncludePrepaidOf = (stmtDoc, companyDefault = false) => (typeof stmtDoc?.includePrepaid === "boolean" ? stmtDoc.includePrepaid : companyDefault === true);
export function statementRowsOf(rows, includePrepaid) {
  const list = rows || [];
  if (includePrepaid) return { rows: list, excluded: [] };
  const keep = []; const excluded = [];
  list.forEach((r) => (isPrepaidPay(r) ? excluded : keep).push(r));
  return { rows: keep, excluded };
}
