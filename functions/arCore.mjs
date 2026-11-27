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

// ── 🗓 2026-11-25 청구월 기준 하나로 — 마감월(있으면) · 거래처 마감일(2026-11-27) · 없으면 상차일의 달 ──
//  정산 홈 · 청구 현황판 · 월 마감 · 최종마감 잠금 · 거래명세서 · 미수금 · 은행 입금 매칭 · 회계 매출 월이 모두 이 식을 쓴다
//  (src/settleCore.js 가 다시 내보냄 — 정의는 여기 한 곳). 예) 상차 10/31 · 마감월 2026-11 → 11월분
// ── 🗓 2026-11-27 거래처별 마감일(업체 문의 — "업체마다 마감일이 달라요, 25일 마감이면 10/26 ~ 11/25로") ──
//  · 거래처 정보 마감일(1 ~ 28, 비우면 말일) · 마감시작월(이 청구월부터 적용 "YYYY-MM")
//  · 25일 마감: 11월분 = 10/26 ~ 11/25 · 12월분 = 11/26 ~ 12/25 (25일 오더가 두 달에 겹치지 않게 시작은 26일)
//  · 시작월 전 오더는 예전처럼 상차일의 달 그대로 — 이미 정산한 달이 흔들리지 않는다
//    첫 달(시작월)은 1일 ~ 마감일(예: 시작 11월 · 25일 → 11월분 11/1 ~ 11/25, 11/26부터 12월분)
//  · 회사마다 따로 기억(setClientCloseDays) — 화면은 거래처 목록을 받을 때, 서버(은행 입금 매칭 · 일일 보고 · AI 비서)는 계산 전에 넣는다
//  · 오더에 마감월이 직접 적혀 있으면(이월) 그것이 먼저
const CLOSE_RULES = new Map(); // 회사 → Map(거래처명 → { day, from })
let CLOSE_CUR = "";
let CLOSE_VER = 0;
const ymAdd = (ym, k) => { const [y, m] = ym.split("-").map(Number); const t = y * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const ymLastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
//  🗓 2026-11-27 [마감날짜 변경] — 이번 달만 끝 날짜를 바꾼다(ov: { "YYYY-MM": "YYYY-MM-DD" } · 거래처 정보 마감변경)
//   다음 기간은 늘 바꾼 끝 날짜 다음 날부터 시작 → 겹치거나 빠지는 날이 없다(말일 거래처도 쓸 수 있다)
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
const cleanOv = (ov) => { const o = {}; Object.entries(ov && typeof ov === "object" ? ov : {}).forEach(([k, v]) => { if (/^\d{4}-\d{2}$/.test(k) && ymdRe.test(String(v || ""))) o[k] = String(v); }); return o; };
export function normCloseRule(day, from, ov) {
  const d = parseInt(String(day ?? "").replace(/[^\d]/g, ""), 10);
  const o = cleanOv(ov);
  const ok = d >= 1 && d <= 28;
  if (!ok && !Object.keys(o).length) return null;
  const r = { day: ok ? d : 0, from: ok && /^\d{4}-\d{2}$/.test(String(from || "")) ? String(from) : "" };
  if (Object.keys(o).length) r.ov = o;
  return r;
}
// clients: [{ 거래처명, 마감일, 마감시작월, 마감변경 }] — 마감일도 마감변경도 없는(말일) 거래처는 빠진다
export function setClientCloseDays(company, clients) {
  const m = new Map();
  (clients || []).forEach((c) => { const r = normCloseRule(c?.마감일, c?.마감시작월, c?.마감변경); const name = String(c?.거래처명 || c?.업체명 || "").trim(); if (r && name) m.set(name, r); });
  const co = String(company || "");
  const before = JSON.stringify([...(CLOSE_RULES.get(co) || new Map())]);
  CLOSE_RULES.set(co, m); CLOSE_CUR = co;
  if (before !== JSON.stringify([...m])) CLOSE_VER += 1;
  return m;
}
export const closeRulesVersion = () => CLOSE_VER;
export const closeRuleOf = (client, company) => {
  const c = String(client || "").trim(); if (!c) return null;
  return (company && CLOSE_RULES.get(String(company))?.get(c)) || CLOSE_RULES.get(CLOSE_CUR)?.get(c) || null;
};
const pad2 = (n) => String(n).padStart(2, "0");
const dayAfter = (ymd) => { const t = new Date(`${ymd}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
const ruleOn = (rule, ym) => !!(rule && rule.day && !(rule.from && ym < rule.from));
// 매달 규칙대로라면 끝나는 날(바꾼 날 빼고)
export const naturalEndOf = (ym, rule) => `${ym}-${pad2(ruleOn(rule, ym) ? Math.min(rule.day, ymLastDay(ym)) : ymLastDay(ym))}`;
const endOf = (ym, rule) => rule?.ov?.[ym] || naturalEndOf(ym, rule);
// 청구월(ym)의 기간 { from: "YYYY-MM-DD", to, day } — 규칙이 없으면 1일 ~ 말일 · first: 마감일 첫 달 · changed: [마감날짜 변경]한 달
export function closePeriodOf(ym, rule) {
  const out = { from: dayAfter(endOf(ymAdd(ym, -1), rule)), to: endOf(ym, rule), day: ruleOn(rule, ym) ? rule.day : 0 };
  if (rule?.from && ym === rule.from && rule.day) out.first = true;
  if (rule?.ov?.[ym]) out.changed = true;
  return out;
}
// 날짜(YYYY-MM-DD) → 그 거래처 규칙으로 몇 월분인지(앞뒤 달 기간 중 그 날짜가 든 달)
export function closeYmOf(date, rule) {
  const d = String(date || "").slice(0, 10); const ym = d.slice(0, 7);
  if (!rule || !ymdRe.test(d)) return ym;
  for (const k of [ym, ymAdd(ym, 1), ymAdd(ym, -1)]) { const p = closePeriodOf(k, rule); if (d >= p.from && d <= p.to) return k; }
  return ym;
}
// [마감날짜 변경]에서 고를 수 있는 끝 날짜 — 이번 기간 시작일 ~ 다음 달 원래 끝 하루 전(다음 기간이 하루라도 남게)
export function overrideRangeOf(ym, rule) {
  const from = closePeriodOf(ym, rule).from;
  const nx = ymAdd(ym, 1); const nEnd = rule?.ov?.[nx] || naturalEndOf(nx, rule);
  const t = new Date(`${nEnd}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - 1);
  return { min: from, max: t.toISOString().slice(0, 10), natural: naturalEndOf(ym, rule) };
}
// 화면 · 서버 공통 — 거래처의 청구월 기간(거래처 이름으로)
export const clientPeriodOf = (client, ym, company) => closePeriodOf(ym, closeRuleOf(client, company));
export const monthOf = (o) => String(o?.마감월 || "").slice(0, 7) || closeYmOf(String(o?.상차일 || o?.날짜 || "").slice(0, 10), closeRuleOf(o?.거래처명, o?.companyName)) || String(o?.상차일 || o?.날짜 || "").slice(0, 7);
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
// 🛠 2026-11-27 그 달 입금 기록 중 "아직 정산완료가 아닌 오더"에 쓸 몫
//  입금 기록(arPayments)은 거래처 × 청구월 합계라, 그 달을 정산완료한 뒤 오더가 더 붙으면 예전 입금이 새 오더까지 덮어
//  미수금이 사라졌다(예: 11월 110만 입금 → 정산완료 → 11월 오더 30만 추가 → 미수 0).
//  정산완료 오더의 마지막 정산일까지 들어온 입금은 먼저 그 정산완료 오더 몫(청구액 한도)으로 보고, 남은 것만 새 오더에 쓴다.
//  날짜를 모르면(정산일 · 입금일 없음) 예전처럼 입금 전부를 아직 안 끝난 오더에 쓴다.
//  dated: [{ d: 입금일, amt }] · settledLast: 정산완료 오더의 마지막 정산일
export const ymd8 = (v) => String(v ?? "").replace(/\D/g, "").slice(0, 8);
export function paidForOpenOf({ paid = 0, settledSupply = 0, settledLast = "", dated = null } = {}) {
  const last = ymd8(settledLast);
  if (!(paid > 0) || !(settledSupply > 0) || last.length < 8 || !Array.isArray(dated)) return Math.max(0, paid || 0);
  const before = dated.reduce((a, x) => { const d = ymd8(x?.d); return a + (d.length >= 8 && d <= last ? Number(x?.amt) || 0 : 0); }, 0);
  return Math.max(0, paid - Math.min(vatIncluded(settledSupply), before));
}
// 입금완료(입금 확인에서 받은 잡은 콜 등) 오더 — 오더에 받은 기록이 있어 그 달 남은 청구에서 뺀다
export const isDepositedOrder = (r) => String(r?.입금상태 || "") === "입금완료";
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
    const e = (byCM[c] = byCM[c] || {}); const m = (e[ym] = e[ym] || { supply: 0, settled: 0, deposited: 0, openSupply: 0, open: 0, last: "", sLast: "" });
    m.supply += s;
    // before: 이 날짜 전에 처리된 것만(예전 회계 입금과 겹치는지 볼 때 — arPaidByClient)
    const sd = settledDateIn(r, ym); const dd = String(r.입금일 || "");
    if (isSettledIn(r, ym) && !(before && sd && sd >= before)) { m.settled += s; if (sd > m.last) m.last = sd; if (sd > m.sLast) m.sLast = sd; }
    else if (r.입금상태 === "입금완료" && !(before && dd && dd >= before)) { m.deposited += vatIncluded(s); if (dd > m.last) m.last = dd; }
    else if (s) { m.open += 1; m.openSupply += s; }
  });
  const dep = {};
  (arPayments || []).forEach((p) => {
    if (!p || (skip && skip(p))) return;
    const c = String(p.client || "").trim(); const ym = String(p.yyyymm || "").slice(0, 7);
    if (!c || !ym || (yr && ym.slice(0, 4) !== yr)) return;
    const x = ((dep[c] = dep[c] || {})[ym] = dep[c]?.[ym] || { amt: 0, last: "", dated: [] });
    x.amt += Number(p.amount) || 0; const dd = String(p.depositDate || ""); if (dd > x.last) x.last = dd;
    x.dated.push({ d: arPayDateOf(p), amt: Number(p.amount) || 0 });
  });
  const out = {};
  Object.entries(byCM).forEach(([c, months]) => {
    const lines = [];
    Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).forEach(([ym, m]) => {
      const due = vatIncluded(m.supply); if (due <= 0) return;
      const p = dep[c]?.[ym] || { amt: 0, last: "", dated: [] };
      const full = m.open === 0;
      // 🛠 2026-11-27 받은 돈 = 그 달 청구 − 아직 안 끝난 오더의 남은 돈(정산완료 오더 몫으로 쓴 입금은 두 번 세지 않음)
      const remain = Math.max(0, vatIncluded(m.openSupply) - paidForOpenOf({ paid: p.amt, settledSupply: m.settled, settledLast: m.sLast, dated: p.dated }));
      const amt = full ? due : Math.max(0, due - remain);
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

// ── ✅ 2026-11-25 회계 [입금 처리]로 다 받은 청구월 → 그 달 오더 정산완료(거래처정산 미수금관리 · 은행 자동 매칭과 같은 키) ──
//  정산상태.{청구월} = "정산완료" · 정산일.{청구월} = 입금일 · 정산자동.{청구월} = "acct:{depositKey}"(이 길로 바꾼 표시 — 되돌릴 때 이것만)
//  남은 미수 = 그 달 아직 정산완료가 아닌 오더 청구액(공급가 합 × 1.1 반올림) − 그 거래처 · 그 달 입금 기록(arPayments) 합 → 10원 이하면 다 받은 것
//  대상 오더 = 미수금과 같게(isArOrder: 배차완료 · 취소 아님 · 화주사 사본 아님 · 고정거래처 줄 아님)
export const AR_FULL_TOL = 10;
export const autoSettleTag = (depositKey) => `acct:${depositKey}`;
const arMonthRowsOf = (orders, client, ym) => (orders || []).filter((r) => r && r._id && !r._fixed && isArOrder(r) && String(r.거래처명 || "") === client && monthOf(r) === ym);
const paidInOf = (payments, client, ym) => (payments || []).reduce((a, p) => a + (p && String(p.client || "") === client && String(p.yyyymm || "").slice(0, 7) === ym ? Number(p.amount) || 0 : 0), 0);
const datedInOf = (payments, client, ym) => (payments || []).filter((p) => p && String(p.client || "") === client && String(p.yyyymm || "").slice(0, 7) === ym).map((p) => ({ d: arPayDateOf(p), amt: Number(p.amount) || 0 }));
// 🛠 2026-11-27 그 달 남은 미수 — open: 아직 안 끝난 오더(정산완료로 바꿀 대상) · 정산완료 오더 몫 입금은 빼고 · 입금완료 오더는 받은 것
function monthLeftOf(allRows, open, payments, client, ym) {
  const openSet = new Set(open);
  const settled = allRows.filter((r) => !openSet.has(r));
  const settledSupply = settled.reduce((a, r) => a + toWon(r.청구운임), 0);
  const settledLast = settled.map((r) => settledDateIn(r, ym)).filter(Boolean).sort().pop() || "";
  const supply = open.filter((r) => !isDepositedOrder(r)).reduce((a, r) => a + toWon(r.청구운임), 0);
  const due = vatIncluded(supply); const paid = paidInOf(payments, client, ym);
  const left = Math.max(0, due - paidForOpenOf({ paid, settledSupply, settledLast, dated: datedInOf(payments, client, ym) }));
  return { supply, due, paid, left };
}
// 결과 [{ ym, due, paid, rows }] — rows = 정산완료로 바꿀 오더(아직 정산완료가 아닌 것만 → 두 번 눌러도 다시 쓰지 않음)
//  only: 이 달들만 본다(이번 입금이 들어간 달)
export function fullyPaidMonths({ orders = [], payments = [], client, only = null, tol = AR_FULL_TOL } = {}) {
  if (!client) return [];
  const pick = only ? new Set(only) : null; const yms = new Set();
  (orders || []).forEach((r) => { if (r && String(r.거래처명 || "") === client) { const ym = monthOf(r); if (ym && (!pick || pick.has(ym))) yms.add(ym); } });
  const out = [];
  [...yms].sort().forEach((ym) => {
    const all = arMonthRowsOf(orders, client, ym);
    const rows = all.filter((r) => !isSettledIn(r, ym));
    if (!rows.length) return;
    const { supply, due, paid, left } = monthLeftOf(all, rows, payments, client, ym);
    if (supply <= 0) return;
    if (left <= tol) out.push({ ym, due, paid, rows });
  });
  return out;
}
// 되돌리기 — marks: 이 길로 정산완료한 기록 [{ col, id, ym, prev, tag }] · payments: 지운 뒤 남은 입금 기록
//  지금도 tag 표시가 그대로인 정산완료 오더만 · 그 달이 남은 입금으로 더는 다 받지 않았을 때만 돌린다(직접 누른 정산완료는 건드리지 않음)
export function autoSettleRevertsOf({ orders = [], payments = [], client, marks = [], tol = AR_FULL_TOL } = {}) {
  const byId = new Map((orders || []).filter((r) => r && r._id).map((r) => [r._id, r]));
  const live = (marks || []).filter((m) => {
    const r = byId.get(m?.id);
    return r && r.정산상태?.[m.ym] === "정산완료" && r.정산자동?.[m.ym] === m.tag;
  });
  const out = [];
  [...new Set(live.map((m) => m.ym))].forEach((ym) => {
    const mine = live.filter((m) => m.ym === ym); const ids = new Set(mine.map((m) => m.id));
    const all = arMonthRowsOf(orders, client, ym);
    const open = all.filter((r) => ids.has(r._id) || !isSettledIn(r, ym));
    const { due, left } = monthLeftOf(all, open, payments, client, ym);
    if (due > 0 && left <= tol) return; // 다른 입금으로 여전히 다 받음 → 그대로
    out.push(...mine);
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
