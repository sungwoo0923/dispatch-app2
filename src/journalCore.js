// ======================= src/journalCore.js =======================
// 🧾 2026-11-08 전표 · 재무제표 계산(화면 없이 숫자만 · 테스트운송사 시범)
//  복식부기 — 거래 한 건(전표)은 차변(D) 합계 = 대변(C) 합계. 계정과목표는 src/acctAccounts.js CHART(일반기업회계기준을 줄인 것)
//  자동 전표(원본을 고치면 전표도 따라 바뀐다 — 전표에서 직접 고치지 않는다):
//   ① 전자결재 비용·지출 결의 최종 승인 → [발생] 차) 비용(계정과목별 공급가액) · 부가세대급금(세액) / 대) 미지급금
//      지급완료 → [지급] 차) 미지급금 / 대) 보통예금(현금 결제는 현금)        · 가지급금 신청은 비용 대신 가지급금(자산)
//      법인카드 사용보고는 승인 때 차) 비용 / 대) 미지급금(카드대금) — 카드값은 결제일에 장부(카드대금)로 나간다
//   ② 배차완료 오더(월 합계) → [매출] 차) 외상매출금(부가세 포함) / 대) 운송수입 · 부가세예수금   (미수금 계산과 같은 식)
//                             [원가] 차) 운송원가(기사운임) / 대) 미지급금
//   ③ 수입·지출 장부(자동·수기) → 기사 지급: 차) 미지급금 / 대) 보통예금 · 거래처 수금: 차) 보통예금 / 대) 외상매출금
//      그 밖의 지출: 차) 계정과목 / 대) 보통예금(법인카드면 미지급금 · 현금이면 현금) · 그 밖의 수입: 차) 보통예금 / 대) 계정과목
//      (전자결재에서 자동으로 들어간 장부 줄은 ①과 겹치므로 뺀다)
//   ④ 기초 잔액 — 자금 현황의 통장·현금·대출 기준일 잔액 → 차) 보통예금·현금 / 대) 차입금 · 기초자본(차액)
//  수동 전표(일반전표 입력)는 acctJournal 컬렉션 — 감가상각·부가세 정리·결산 대체 등
import { CHART, accountOf, normalSide } from "./acctChart.js";

const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const ACC = (name) => accountOf(name);
const L = (side, name, amount, extra = {}) => ({ side, acct: ACC(name).name, code: ACC(name).code, amount: Math.round(Number(amount) || 0), ...extra });
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const day10 = (v) => String(v || "").slice(0, 10);
const tsDay = (t) => { const ms = t?.toMillis ? t.toMillis() : t?.seconds ? t.seconds * 1000 : typeof t === "number" ? t : 0; return ms ? new Date(ms + 9 * 3600e3).toISOString().slice(0, 10) : ""; };
const cleanLines = (lines) => lines.filter((l) => l.amount > 0);
export const sumSide = (lines, side) => (lines || []).filter((l) => l.side === side).reduce((s, l) => s + (Number(l.amount) || 0), 0);
export const isBalanced = (e) => sumSide(e.lines, "D") === sumSide(e.lines, "C") && sumSide(e.lines, "D") > 0;

// 결제 수단 → 돈이 나가는 계정
const creditOfMethod = (m) => { const t = String(m || ""); return /현금/.test(t) ? "현금" : /법인카드|신용카드|카드/.test(t) ? "미지급금" : "보통예금"; };

// 양식별 기본 비용 계정(지출결의·법인카드는 문서의 계정과목)
const FORM_ACCOUNT = { fuel: "유류비", tripcost: "여비교통비", advance: "가지급금", purchase: "소모품비", accident: "잡손실" };

// ① 전자결재 → 발생·지급 전표
export function entriesFromApproval(d) {
  if (!d || d.cat !== "expense" || d.status !== "approved") return [];
  const total = toInt(d.amount);
  if (total <= 0) return [];
  const x = d.data || {};
  const acct = x.account || FORM_ACCOUNT[d.form] || "기타";
  // 부가세 — 지출결의 표의 세액 합계(없으면 0)
  let vat = 0;
  if (d.form === "spend" && Array.isArray(x.lines)) vat = x.lines.reduce((s, r) => s + toInt(r.vat), 0);
  vat = Math.max(0, Math.min(vat, total));
  const memo = `${d.docNo || ""} ${d.title || d.formLabel || ""}`.trim();
  const vendor = String(x.vendor || x.shop || (Array.isArray(x.lines) && x.lines[0]?.vendor) || d.drafter?.name || "").trim();
  const apDate = day10(x.date || x.spendDate) || tsDay(d.doneAt || d.updatedAt || d.createdAt) || kstDay();
  const out = [{
    id: `ap_${d.id}`, date: apDate, kind: "대체", src: "전자결재", srcId: d.id, auto: true, memo: `[발생] ${memo}`, vendor,
    lines: cleanLines([L("D", acct, total - vat, { vendor }), L("D", "부가세대급금", vat), L("C", "미지급금", total, { vendor })]),
  }];
  if (d.paid?.at && d.form !== "card") {
    out.push({
      id: `pay_${d.id}`, date: day10(d.paid.date) || tsDay(d.paid.at), kind: "출금", src: "지급완료", srcId: d.id, auto: true, memo: `[지급] ${memo}`, vendor,
      lines: [L("D", "미지급금", total, { vendor }), L("C", creditOfMethod(x.pay || x.method), total)],
    });
  }
  return out;
}

// ② 배차완료 오더 → 월별 매출·원가 전표 (orders: 회계용 올해 배차완료 오더)
export function entriesFromOrders(orders = [], { vatRate = 0.1 } = {}) {
  const byM = {};
  (orders || []).forEach((r) => {
    if (!r || String(r.배차상태 || "").trim() !== "배차완료" || r.source === "transport_transmit") return;
    if (r.배차상태 === "배차취소" || String(r.지급방식 || "").trim() === "취소") return;
    const m = String(r.상차일 || r.날짜 || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    const o = byM[m] || (byM[m] = { sale: 0, cost: 0, n: 0 });
    o.sale += toInt(r.청구운임); o.cost += toInt(r.기사운임); o.n += 1;
  });
  const lastDay = (m) => { const [y, mm] = m.split("-").map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
  const out = [];
  Object.keys(byM).sort().forEach((m) => {
    const o = byM[m];
    const vat = Math.round(o.sale * vatRate);
    if (o.sale > 0) out.push({ id: `sale_${m}`, date: lastDay(m), kind: "대체", src: "배차(매출)", auto: true, memo: `${m} 운송 매출 ${o.n}건(배차완료 합계)`, lines: cleanLines([L("D", "외상매출금", o.sale + vat), L("C", "운송수입", o.sale), L("C", "부가세예수금", vat)]) });
    if (o.cost > 0) out.push({ id: `cost_${m}`, date: lastDay(m), kind: "대체", src: "배차(원가)", auto: true, memo: `${m} 기사운임 ${o.n}건(배차완료 합계)`, lines: [L("D", "운송원가(기사운임)", o.cost), L("C", "미지급금", o.cost, { vendor: "기사" })] });
  });
  return out;
}

// ③ 수입·지출 장부 → 전표(전자결재 자동 줄은 ①과 겹치므로 뺀다)
export function entriesFromLedger(rows = [], { from = "" } = {}) {
  const out = [];
  (rows || []).forEach((r) => {
    if (!r || r.auto === "approval") return;
    const amt = toInt(r.amount);
    if (amt <= 0) return; // 취소로 0 이하가 된 자동 줄은 건너뜀
    const date = day10(r.date);
    if (!date || (from && date < from)) return;
    const vendor = String(r.vendor || "").trim();
    const memo = `${r.item || r.account || ""}`.trim();
    let lines;
    if (r.auto === "drvpay") lines = [L("D", "미지급금", amt, { vendor: "기사" }), L("C", "보통예금", amt)];
    else if (r.auto === "collect") lines = [L("D", "보통예금", amt), L("C", "외상매출금", amt, { vendor })];
    else if (r.type === "수입") lines = [L("D", creditOfMethod(r.method) === "현금" ? "현금" : "보통예금", amt), L("C", revenueName(r.account), amt, { vendor })];
    else lines = [L("D", r.auto === "asset" && r.account === "비품구입" ? "비품" : r.account || "기타", amt, { vendor }), L("C", creditOfMethod(r.method), amt)];
    out.push({ id: `led_${r.id}`, date, kind: r.type === "수입" ? "입금" : "출금", src: r.auto ? "장부(자동)" : "장부", srcId: r.id, auto: true, memo, vendor, lines });
  });
  return out;
}
// 수입 장부 계정 → 수익 계정
const revenueName = (a) => { const n = String(a || "").trim(); if (n === "운송수입") return "운송수입"; if (/이자/.test(n)) return "이자수익"; return accountOf(n).kind === "revenue" || accountOf(n).kind === "other" ? accountOf(n).name : "잡이익"; };

// ④ 기초 잔액(자금 현황 기준일 잔액) — 날짜는 가장 이른 기준일
export function openingEntry(funds = []) {
  const act = (funds || []).filter((f) => f && f.active !== false);
  const lines = []; let dates = [];
  act.forEach((f) => {
    const kind = String(f.kind || "");
    if (kind.includes("카드")) return; // 카드는 잔액이 아니라 한도
    const bal = toInt(f.openingBalance);
    if (f.openingDate) dates.push(day10(f.openingDate));
    if (!bal) return;
    if (kind === "대출") lines.push(L("C", "장기차입금", bal, { vendor: f.name || "" }));
    else lines.push(L("D", kind === "현금" ? "현금" : "보통예금", bal, { vendor: f.name || "" }));
  });
  if (!lines.length) return null;
  dates = dates.filter(Boolean).sort();
  const d = sumSide(lines, "D"); const c = sumSide(lines, "C");
  if (d > c) lines.push(L("C", "자본금", d - c, { vendor: "기초 순자산" }));
  else if (c > d) lines.push(L("D", "이월이익잉여금", c - d, { vendor: "기초 순부채" }));
  return { id: "opening", date: dates[0] || `${new Date().getFullYear()}-01-01`, kind: "대체", src: "기초 잔액", auto: true, memo: "기초 잔액(자금 현황의 통장·현금·대출 처음 잔액)", lines };
}

// 수동 전표(acctJournal) 정리 — 화면에서 입력한 그대로(차대 불일치·빈 줄은 빼서 계산)
export function manualEntries(docs = []) {
  return (docs || []).map((x) => ({
    id: `man_${x.id}`, docId: x.id, date: day10(x.date), kind: x.kind || "대체", src: "수동", auto: false, memo: x.memo || "", vendor: x.vendor || "", no: x.no || "",
    lines: (x.lines || []).map((l) => ({ ...L(l.side === "C" ? "C" : "D", l.acct, toInt(l.amount)), vendor: l.vendor || "", note: l.note || "" })).filter((l) => l.amount > 0),
  })).filter((e) => e.date && e.lines.length);
}

// 모든 전표 — 날짜순 + 전표번호(YYYYMMDD-001)
export function buildJournal({ approvals = [], orders = [], ledger = [], funds = [], manual = [] } = {}) {
  const open = openingEntry(funds);
  const from = open?.date || "";
  const all = [
    ...(open ? [open] : []),
    ...approvals.flatMap(entriesFromApproval).filter((e) => !from || e.date >= from),
    ...entriesFromOrders(orders).filter((e) => !from || e.date >= from),
    ...entriesFromLedger(ledger, { from }),
    ...manualEntries(manual),
  ].filter((e) => e.lines.length);
  all.sort((a, b) => (a.date === b.date ? (a.id === "opening" ? -1 : b.id === "opening" ? 1 : String(a.id).localeCompare(String(b.id))) : a.date.localeCompare(b.date)));
  const seq = {};
  return all.map((e) => { const k = e.date.replace(/-/g, ""); seq[k] = (seq[k] || 0) + 1; return { ...e, no: `${k}-${String(seq[k]).padStart(3, "0")}`, debit: sumSide(e.lines, "D"), credit: sumSide(e.lines, "C"), balanced: isBalanced(e) }; });
}

// 시산표 — 기간 [from, to] (from 없으면 처음부터)
export function trialBalance(journal = [], { from = "", to = "9999-12-31" } = {}) {
  const map = {};
  journal.forEach((e) => {
    if (e.date > to || (from && e.date < from)) return;
    e.lines.forEach((l) => {
      const a = accountOf(l.acct);
      const k = a.name;
      const o = map[k] || (map[k] = { code: a.code, name: a.name, kind: a.kind, debit: 0, credit: 0 });
      if (l.side === "D") o.debit += l.amount; else o.credit += l.amount;
    });
  });
  const order = Object.fromEntries(CHART.map((a, i) => [a.name, i]));
  return Object.values(map).map((o) => ({ ...o, balance: normalSide(o) === "D" ? o.debit - o.credit : o.credit - o.debit }))
    .sort((a, b) => (order[a.name] ?? 999) - (order[b.name] ?? 999) || a.code.localeCompare(b.code));
}

// 손익계산서(기간) — 매출총이익 · 영업이익 · 당기순이익
export function incomeStatement(journal = [], { from = "", to = "9999-12-31" } = {}) {
  const tb = trialBalance(journal, { from, to });
  const pick = (kind) => tb.filter((a) => a.kind === kind);
  const sum = (arr) => arr.reduce((s, a) => s + a.balance, 0);
  const revenue = pick("revenue"); const cogs = pick("cogs"); const sga = pick("expense");
  const otherIn = tb.filter((a) => a.kind === "other" && normalSide(a) === "C"); const otherOut = tb.filter((a) => a.kind === "other" && normalSide(a) === "D");
  const R = sum(revenue); const C = sum(cogs); const S = sum(sga); const OI = sum(otherIn); const OO = sum(otherOut);
  return { revenue, cogs, sga, otherIn, otherOut, totals: { revenue: R, cogs: C, gross: R - C, sga: S, operating: R - C - S, otherIn: OI, otherOut: OO, net: R - C - S + OI - OO } };
}

// 재무상태표(기준일) — 자산 = 부채 + 자본(당기순이익 포함)
export function balanceSheet(journal = [], { to = "9999-12-31" } = {}) {
  const tb = trialBalance(journal, { to });
  const pick = (kind) => tb.filter((a) => a.kind === kind && a.balance !== 0);
  const sum = (arr) => arr.reduce((s, a) => s + a.balance, 0);
  const assets = pick("asset"); const liabilities = pick("liability"); const equity = pick("equity");
  const net = incomeStatement(journal, { to }).totals.net; // 기초 이후 누적 손익(결산 대체 전)
  const A = sum(assets); const Lb = sum(liabilities); const E = sum(equity) + net;
  return { assets, liabilities, equity, net, totals: { assets: A, liabilities: Lb, equity: E, check: A - (Lb + E) } };
}

// 계정별 원장 — 한 계정의 거래와 누적 잔액
export function accountLedger(journal = [], acctName, { from = "", to = "9999-12-31" } = {}) {
  const a = accountOf(acctName); const side = normalSide(a);
  let bal = 0; const rows = [];
  journal.forEach((e) => {
    if (e.date > to) return;
    e.lines.filter((l) => l.acct === a.name).forEach((l) => {
      const d = l.side === "D" ? l.amount : 0; const c = l.side === "C" ? l.amount : 0;
      bal += side === "D" ? d - c : c - d;
      if (!from || e.date >= from) rows.push({ date: e.date, no: e.no, memo: e.memo, vendor: l.vendor || e.vendor || "", debit: d, credit: c, balance: bal, src: e.src });
    });
  });
  return rows;
}

// 더존 Smart A · 위하고 "일반전표 엑셀 올리기"에 맞춘 CSV(열: 일자·번호·구분·계정코드·계정과목·거래처·적요·차변·대변)
export function journalCsv(journal = [], { from = "", to = "9999-12-31" } = {}) {
  const head = ["일자", "전표번호", "구분", "계정코드", "계정과목", "거래처", "적요", "차변", "대변"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.map(q).join(",")];
  journal.filter((e) => e.date <= to && (!from || e.date >= from)).forEach((e) => e.lines.forEach((l) => {
    lines.push([e.date, e.no, l.side === "D" ? "차변" : "대변", l.code, l.acct, l.vendor || e.vendor || "", e.memo, l.side === "D" ? l.amount : "", l.side === "C" ? l.amount : ""].map(q).join(","));
  }));
  return `﻿${lines.join("\r\n")}`;
}
