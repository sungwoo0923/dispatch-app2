// ======================= functions/arMatchCore.mjs =======================
// 💰 2026-11-08 입금 → 미수금 매칭 공용 규칙(화면과 서버가 같은 파일을 쓴다 — arCore.mjs와 같은 방식)
//  · 화면: 거래처정산 › 미수금 "입금내역 올리기"(은행 엑셀) · 미수금 데스크 "입금 처리" · 입금 확인 목록 (src/arMatch.js가 다시 내보냄)
//  · 서버: functions/bankSync.js — 팝빌 계좌조회로 받은 입금을 같은 식으로 맞춘다
//
//  식(예전 DispatchApp 거래처정산의 식을 그대로 옮겼다)
//  · 거래처 · 청구월마다 배차완료 오더 공급가(청구운임) 합계 → 청구액 = × 1.1 반올림(부가세 포함) · 정산완료 달은 뺀다
//  · 남은 금액 = 청구액 − 입금 기록(arPayments, 거래처|월 합계)
//  · 입금 배분: 남은 금액이 딱 맞는 달(±10원) → 없으면 오래된 달부터 채운다(다 채운 달 정산완료 · 모자라면 일부입금 · 남으면 초과입금)
//  · 거래처 찾기: ① 회사가 배운 입금자명 별칭 ② 이름 포함 비교 ③ 둘 다 없으면 금액이 딱 맞는 달이 하나뿐일 때만 제안
//  · 자동 반영은 "이름(또는 별칭)이 맞고 딱 맞게 정산되는 입금"만 — 나머지는 사람이 확인

export const AR_MATCH_TOL = 10;
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;

export const normalizeForMatch = (s = "") =>
  String(s)
    .replace(/\(주\)|㈜|주식회사|유한회사/g, "")
    .replace(/\s+/g, "")
    .replace(/[^가-힣a-zA-Z0-9]/g, "")
    .toLowerCase();

// 입금 기록 → "거래처|월" 합계
export function arPaidMapOf(payments) {
  const m = new Map();
  (payments || []).forEach((p) => { if (!p) return; const k = `${p.client}|${p.yyyymm}`; m.set(k, (m.get(k) || 0) + (Number(p.amount) || 0)); });
  return m;
}

// 거래처별 미정산 달 — client -> [{ k, client, yyyymm, rows, total, paid, due, remain }] (오래된 달부터)
//  inRange(ym): 조회 기간 · rowOk(r): 추가 조건(청구 사업자 등)
export function buildArMonths({ orders = [], paidMap = new Map(), inRange = () => true, rowOk = () => true } = {}) {
  const book = new Map();
  (Array.isArray(orders) ? orders : []).forEach((r) => {
    if ((r?.배차상태 || "") !== "배차완료" || !r.거래처명 || !rowOk(r)) return;
    const ym = String(r.상차일 || "").slice(0, 7);
    if (!ym || !inRange(ym) || r.정산상태?.[ym] === "정산완료") return;
    if (!book.has(r.거래처명)) book.set(r.거래처명, new Map());
    const mm = book.get(r.거래처명);
    if (!mm.has(ym)) mm.set(ym, { k: `${r.거래처명}|${ym}`, client: r.거래처명, yyyymm: ym, rows: [], total: 0 });
    const e = mm.get(ym); e.rows.push(r); e.total += toInt(r.청구운임);
  });
  const months = new Map();
  book.forEach((mm, client) => months.set(client, [...mm.values()].filter((e) => e.total > 0).map((e) => {
    const paid = (paidMap instanceof Map ? paidMap.get(e.k) : paidMap?.[e.k]) || 0;
    const due = Math.round(e.total * 1.1);
    return { ...e, paid, due, remain: Math.max(0, due - paid) };
  }).sort((a, b) => a.yyyymm.localeCompare(b.yyyymm))));
  return months;
}

// 입금 배분 — { alloc: [{ e, amount, full }] (+ alloc.over 초과분), exact }
export function allocArDeposit(list, amount, remainOf, TOL = AR_MATCH_TOL) {
  const exact = list.find((e) => Math.abs(amount - remainOf(e)) <= TOL || (e.paid === 0 && amount === e.total));
  let alloc = [];
  if (exact) alloc = [{ e: exact, amount, full: true }];
  else {
    let left = amount;
    for (const e of list) {
      if (left <= 0) break;
      const r = remainOf(e);
      if (left + TOL >= r) { alloc.push({ e, amount: Math.min(left, r), full: true }); left -= r; }
      else { alloc.push({ e, amount: left, full: false }); left = 0; }
    }
    if (left > TOL) alloc.over = left;
  }
  return { alloc, exact };
}
export function allocKindOf(alloc, exact) {
  const fulls = alloc.filter((a) => a.full).length;
  return alloc.over ? "초과입금" : exact ? "정산완료" : alloc.some((a) => !a.full) ? (fulls ? "정산+일부입금" : "일부입금") : "여러 달 정산";
}
const planOf = (alloc) => alloc.map((a) => ({ k: a.e.k, yyyymm: a.e.yyyymm, amount: a.amount, full: a.full, due: a.e.due, rows: a.e.rows }));

// 한 거래처에 넣었을 때의 배분(미수금 데스크 "입금 처리" · 입금 확인 "확정"이 쓴다)
export function planForClient(months, client, amount, remainOf = (e) => e.remain) {
  const list = (months.get(client) || []).filter((e) => remainOf(e) > 0);
  const { alloc, exact } = allocArDeposit(list, amount, remainOf);
  return { alloc: planOf(alloc), over: alloc.over || 0, kind: allocKindOf(alloc, exact), exact: !!exact, _raw: alloc };
}

// 입금자명 → 거래처 — ① 배운 별칭 ② 이름 포함(긴 이름 우선) · clients: 미정산 달이 있는 거래처 이름들
export function findClientByName(depName, clients, aliases = {}) {
  const d = normalizeForMatch(depName);
  if (!d || d.length < 2) return null;
  const names = [...(clients || [])];
  const al = aliases?.[d];
  if (al && names.includes(al)) return { client: al, via: "별칭" };
  let best = null;
  names.forEach((client) => {
    const c = normalizeForMatch(client); if (!c) return;
    if (d === c || d.includes(c) || (c.includes(d) && d.length >= 2)) { if (!best || c.length > normalizeForMatch(best).length) best = client; }
  });
  return best ? { client: best, via: "이름일치" } : null;
}

// 비슷한 이름(글자 두 개씩 겹치는 정도) — 제안 순서용
function similarity(a, b) {
  const x = normalizeForMatch(a); const y = normalizeForMatch(b);
  if (!x || !y) return 0;
  if (x.includes(y) || y.includes(x)) return 1;
  const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const gx = grams(x); const gy = grams(y);
  if (!gx.size || !gy.size) return 0;
  let n = 0; gx.forEach((g) => { if (gy.has(g)) n++; });
  return (2 * n) / (gx.size + gy.size);
}
// 사람이 확인할 때 보여 줄 거래처 후보(최대 n) — 금액이 딱 맞는 달이 있는 곳 → 이름이 비슷한 곳
export function suggestClients(dep, months, { remainOf = (e) => e.remain, n = 3 } = {}) {
  const out = [];
  months.forEach((list, client) => {
    const open = list.filter((e) => remainOf(e) > 0);
    if (!open.length) return;
    const exact = open.find((e) => Math.abs(dep.amount - remainOf(e)) <= AR_MATCH_TOL || (e.paid === 0 && dep.amount === e.total));
    const sim = similarity(dep.name, client);
    const remain = open.reduce((a, e) => a + remainOf(e), 0);
    const score = (exact ? 2 : 0) + sim + (Math.abs(remain - dep.amount) <= AR_MATCH_TOL ? 0.5 : 0);
    if (score <= 0.2) return;
    out.push({ client, score: Math.round(score * 100) / 100, remain, reason: exact ? `${Number(exact.yyyymm.slice(5))}월분 금액이 같아요` : sim >= 0.5 ? "입금자명이 비슷해요" : "남은 미수금이 있어요" });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}

// 입금 여러 건 매칭(은행 엑셀 · 팝빌 계좌조회 공용) — { matches, unmatched }
//  matches: { deposit, client, alloc, over, kind, confidence("별칭" | "이름일치" | "금액만 일치") }
//  unmatched: { ...deposit, reason, suggestions }
export function matchDeposits({ deposits = [], months, aliases = {} } = {}) {
  const used = new Map();
  const remainOf = (e) => Math.max(0, e.remain - (used.get(e.k) || 0));
  const names = [...months.entries()].filter(([, list]) => list.length).map(([c]) => c);
  const matches = []; const unmatched = [];
  deposits.forEach((dep) => {
    const hit = findClientByName(dep.name, names, aliases);
    if (hit) {
      const list = months.get(hit.client).filter((e) => remainOf(e) > 0);
      const { alloc, exact } = allocArDeposit(list, dep.amount, remainOf);
      alloc.forEach((a) => used.set(a.e.k, (used.get(a.e.k) || 0) + a.amount));
      if (!alloc.length) { unmatched.push({ ...dep, reason: `${hit.client} · 남은 미정산이 없습니다`, suggestions: suggestClients(dep, months, { remainOf }) }); return; }
      matches.push({ deposit: dep, client: hit.client, alloc: planOf(alloc), over: alloc.over || 0, kind: allocKindOf(alloc, exact), confidence: hit.via });
      return;
    }
    const cands = [];
    months.forEach((list) => list.forEach((e) => { if (remainOf(e) > 0 && (Math.abs(dep.amount - remainOf(e)) <= AR_MATCH_TOL || dep.amount === e.total)) cands.push(e); }));
    if (cands.length === 1) {
      const e = cands[0];
      used.set(e.k, (used.get(e.k) || 0) + dep.amount);
      matches.push({ deposit: dep, client: e.client, alloc: [{ k: e.k, yyyymm: e.yyyymm, amount: dep.amount, full: true, due: e.due, rows: e.rows }], over: 0, kind: "정산완료", confidence: "금액만 일치" });
    } else unmatched.push({ ...dep, reason: cands.length ? `금액이 같은 달이 ${cands.length}곳 · 직접 확인` : "맞는 거래처·금액 없음", suggestions: suggestClients(dep, months, { remainOf }) });
  });
  return { matches, unmatched };
}

// 자동으로 반영해도 되는 매칭 — 이름(별칭)이 맞고 초과 · 일부 입금 없이 딱 정산될 때만
export const isConfidentMatch = (m) => !!m && (m.confidence === "이름일치" || m.confidence === "별칭") && !m.over && (m.alloc || []).length > 0 && m.alloc.every((a) => a.full);

// 입금자명 별칭 배우기 — { key(정규화한 입금자명), client } · 거래처 이름 그대로면 배울 필요 없음
export function aliasFor(depName, client) {
  const key = normalizeForMatch(depName);
  if (!key || key.length < 2 || !client) return null;
  if (key === normalizeForMatch(client)) return null;
  return { key, client };
}

// ── 팝빌 계좌조회 거래 ──
// 팝빌 거래 한 줄 → 입금 { tid, date, time, amount, name, memo, balance } (입금이 아니면 null)
export function depositFromPopbill(raw = {}) {
  const amount = toInt(raw.accIn);
  if (amount <= 0) return null;
  const dt = String(raw.trdt || raw.trdate || "").replace(/[^\d]/g, "");
  const date = dt.length >= 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : "";
  const time = dt.length >= 12 ? `${dt.slice(8, 10)}:${dt.slice(10, 12)}` : "";
  const name = String(raw.remark1 || raw.remark2 || "").trim();
  const memo = [raw.remark2, raw.remark3, raw.remark4].map((x) => String(x || "").trim()).filter(Boolean).filter((x) => x !== name).join(" ");
  return { tid: String(raw.tid || "").trim() || `${dt}_${amount}_${name}`, date, time, amount, name, memo, balance: toInt(raw.balance) };
}
// 저장 문서 id — 회사 · 계좌 · 거래 id로 겹치지 않게(같은 거래를 두 번 받아도 한 번만)
export const bankTxnDocId = (company, accountId, tid) => `${company}__${accountId}__${tid}`.replace(/[/\s]/g, "_").slice(0, 600);
// 이미 받은 거래 빼기(같은 응답 안에서 겹친 것도)
export function newDeposits(list, seenIds, company, accountId) {
  const seen = new Set(seenIds || []);
  const out = [];
  (list || []).forEach((raw) => {
    const d = depositFromPopbill(raw); if (!d) return;
    const id = bankTxnDocId(company, accountId, d.tid);
    if (seen.has(id)) return; seen.add(id);
    out.push({ ...d, id });
  });
  return out;
}

// 은행(팝빌 계좌조회 기관코드)
export const POPBILL_BANKS = [
  ["0003", "기업은행"], ["0004", "국민은행"], ["0088", "신한은행"], ["0020", "우리은행"], ["0081", "하나은행"], ["0011", "농협은행"],
  ["0002", "산업은행"], ["0007", "수협은행"], ["0023", "SC제일은행"], ["0027", "씨티은행"], ["0031", "iM뱅크(대구)"], ["0032", "부산은행"],
  ["0034", "광주은행"], ["0035", "제주은행"], ["0037", "전북은행"], ["0039", "경남은행"], ["0045", "새마을금고"], ["0048", "신협"], ["0071", "우체국"],
];
export const bankNameOf = (code) => (POPBILL_BANKS.find(([c]) => c === code) || [])[1] || "";
export const maskAccount = (v) => { const d = String(v || "").replace(/[^\d]/g, ""); return d.length > 4 ? `${"*".repeat(Math.min(6, d.length - 4))}${d.slice(-4)}` : d; };
