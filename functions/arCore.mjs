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

// ── 🗓 2026-11-25 청구월 기준 하나로 — 마감월(있으면) · 없으면 상차일의 달 ──
//  정산 홈 · 청구 현황판 · 월 마감 · 최종마감 잠금 · 거래명세서 · 미수금 · 은행 입금 매칭 · 회계 매출 월이 모두 이 식을 쓴다
//  (src/settleCore.js 가 다시 내보냄 — 정의는 여기 한 곳). 예) 상차 10/31 · 마감월 2026-11 → 11월분
export const monthOf = (o) => String(o?.마감월 || "").slice(0, 7) || String(o?.상차일 || o?.날짜 || "").slice(0, 7);
// 예전(상차일 달) 키 — 정산상태 · 정산일은 예전에 상차일 달로 저장됐다. 마감월이 다른(이월) 오더만 예전 키를 같이 본다
export const loadYmOf = (o) => String(o?.상차일 || o?.날짜 || "").slice(0, 7);
export function isSettledIn(r, ym) {
  const st = r?.정산상태 && typeof r.정산상태 === "object" ? r.정산상태 : null;
  if (!st) return false;
  if (st[ym] === "정산완료") return true;
  const old = loadYmOf(r);
  return !!old && old !== ym && monthOf(r) === ym && st[old] === "정산완료" && st[ym] == null;
}
export function settledDateIn(r, ym) {
  const sd = r?.정산일 && typeof r.정산일 === "object" ? r.정산일 : {};
  if (sd[ym]) return String(sd[ym]);
  const old = loadYmOf(r);
  return old && old !== ym && monthOf(r) === ym && isSettledIn(r, ym) ? String(sd[old] || "") : "";
}
// 청구월(ym) 묶음의 나이 계산 날짜 — 이월 오더(상차일이 청구월보다 앞)는 청구월 1일부터 센다
const billDateOf = (r, ym) => { const d = dateOf(r); return d && d.slice(0, 7) < ym ? `${ym}-01` : d; };

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
    const ym = monthOf(r); if (!ym || (year && ym.slice(0, 4) !== String(year))) return; // 🗓 청구월 = 마감월 기준
    const d = billDateOf(r, ym); if (!d) return;
    const k = r._id ? `${r._fixed ? "fixed" : r.__col || ""}/${r._id}` : null;
    if (k) { if (seen.has(k)) return; seen.add(k); }
    const c = arClientOf(r);
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

// ── 🔗 2026-11-25 정산관리에서 받은 돈(거래처별 · 부가세 포함) — 회계관리 미수금이 정산관리 입금을 같이 보게 ──
//  예전에는 회계관리 미수금이 회계 장부 [입금 처리](acctPayments)와 입금 확인 [입금완료] 오더만 봐서,
//  거래처정산 › 미수금관리에서 넣은 입금(arPayments · 은행 자동 매칭 포함)과 [정산완료] 처리한 달이 회계에서는 계속 미수로 남았다.
//  거래처 · 청구월(🗓 2026-11-25부터 마감월 기준 = monthOf)마다:
//   · 그 달 오더가 모두 정산완료(정산상태.{월}) 또는 입금완료(입금상태)면 → 그 달 청구액(공급가 합 × 1.1 반올림) 전부 받은 것으로
//   · 아니면 → 정산완료 오더 청구액 + 입금완료 오더 청구액 + 그 달 입금 기록(arPayments) 합(그 달 청구액을 넘지 않게)
//  고정거래처 줄은 정산관리 미수금관리에 없어서 뺀다. 결과 { [거래처]: { paid, lines: [{ d, ym, amt, full }] } }
export function settlePaidByClient({ orders = [], arPayments = [], year, before = "", skip = null } = {}) {
  const yr = year ? String(year) : "";
  const seen = new Set();
  const byCM = {};
  (orders || []).forEach((r) => {
    if (!isArOrder(r) || r._fixed) return;
    const ym = monthOf(r); if (!ym || (yr && ym.slice(0, 4) !== yr)) return; // 🗓 청구월 = 마감월 기준
    const k = r._id ? `${r.__col || ""}/${r._id}` : null;
    if (k) { if (seen.has(k)) return; seen.add(k); }
    const c = arClientOf(r); const s = toWon(r.청구운임);
    const e = (byCM[c] = byCM[c] || {}); const m = (e[ym] = e[ym] || { supply: 0, settled: 0, deposited: 0, open: 0, last: "" });
    m.supply += s;
    // before: 이 날짜 전에 처리된 것만(예전 회계 입금과 겹치는지 볼 때 — arPaidByClient)
    const sd = settledDateIn(r, ym); const dd = String(r.입금일 || "");
    if (isSettledIn(r, ym) && !(before && sd && sd >= before)) { m.settled += s; if (sd > m.last) m.last = sd; }
    else if (r.입금상태 === "입금완료" && !(before && dd && dd >= before)) { m.deposited += vatIncluded(s); if (dd > m.last) m.last = dd; }
    else if (s) m.open += 1;
  });
  const dep = {};
  (arPayments || []).forEach((p) => {
    if (!p || (skip && skip(p))) return;
    const c = String(p.client || "").trim(); const ym = String(p.yyyymm || "").slice(0, 7);
    if (!c || !ym || (yr && ym.slice(0, 4) !== yr)) return;
    const x = ((dep[c] = dep[c] || {})[ym] = dep[c]?.[ym] || { amt: 0, last: "" });
    x.amt += Number(p.amount) || 0; const dd = String(p.depositDate || ""); if (dd > x.last) x.last = dd;
  });
  const out = {};
  Object.entries(byCM).forEach(([c, months]) => {
    const lines = [];
    Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).forEach(([ym, m]) => {
      const due = vatIncluded(m.supply); if (due <= 0) return;
      const p = dep[c]?.[ym] || { amt: 0, last: "" };
      const full = m.open === 0;
      const amt = full ? due : Math.min(due, Math.max(0, vatIncluded(m.settled) + m.deposited + p.amt));
      if (amt <= 0) return;
      lines.push({ d: [m.last, p.last].sort().pop() || "", ym, amt, full });
    });
    if (lines.length) out[c] = { paid: lines.reduce((a, x) => a + x.amt, 0), lines };
  });
  return out;
}

// ── 🔗 2026-11-25 받은 돈은 한 곳(정본 = arPayments 입금 기록) ──
//  · 회계관리 [입금 처리] · 거래처정산 미수금관리 입금 · 은행 자동 매칭 모두 arPayments 에 한 건씩(source "acct" | "bank" | 없음)
//  · acctPayments.ar(회계 [입금 처리] 거래처별 합계)는 예전 화면 · 보고서가 읽는 사본 — 새 입금은 log 에 paymentIds 로 이어 둬서 세지 않는다
//  · 예전 회계 합계 중 arPayments 와 이어지지 않은 몫(legacy)은 한 번만 센다:
//    받은 돈 = 정본 합계(T) + max(0, legacy − 기준일 전 정산관리 기록(B))
//    (예전엔 회계 · 정산관리에 같은 돈을 두 번 적은 회사가 있어 둘 중 큰 쪽을 썼다 — 겹칠 수 있는 건 기준일 전 기록뿐)
export const AR_LEGACY_CUTOFF = "2026-11-26";
export function legacyAcctArOf(acct) {
  const ar = (acct && acct.ar) || {}; const log = Array.isArray(acct?.log) ? acct.log : [];
  const linked = {};
  [...log].sort((a, b) => (Number(a?.at) || 0) - (Number(b?.at) || 0)).forEach((x) => {
    if (!x || x.type !== "ar") return; const c = String(x.name || "");
    if (x.reset) { linked[c] = 0; return; }
    if (Array.isArray(x.paymentIds) && x.paymentIds.length) linked[c] = (linked[c] || 0) + (Number(x.amount) || 0);
  });
  const out = {};
  Object.entries(ar).forEach(([c, v]) => { const left = Math.max(0, paidAmountOf(v) - (linked[c] || 0)); if (left) out[c] = left; });
  return out;
}
const tsDay = (t) => { const ms = typeof t === "number" ? t : t?.seconds ? t.seconds * 1000 : typeof t?.toMillis === "function" ? t.toMillis() : 0; return ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : ""; };
export const arPayDateOf = (p) => String(p?.depositDate || "").slice(0, 10) || tsDay(p?.at);
export function arPaidByClient({ orders = [], arPayments = [], acct = null, year, cutoff = AR_LEGACY_CUTOFF } = {}) {
  const all = settlePaidByClient({ orders, arPayments, year });
  const legacy = legacyAcctArOf(acct);
  const pre = Object.keys(legacy).length
    ? settlePaidByClient({ orders, arPayments, year, before: cutoff, skip: (p) => p.source === "acct" || (arPayDateOf(p) && arPayDateOf(p) >= cutoff) })
    : {};
  const out = {};
  new Set([...Object.keys(all), ...Object.keys(legacy)]).forEach((c) => {
    out[c] = (all[c]?.paid || 0) + Math.max(0, (legacy[c] || 0) - (pre[c]?.paid || 0));
  });
  return out;
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
