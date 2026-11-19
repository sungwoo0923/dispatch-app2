// ======================= src/bankStmtCore.js =======================
// 🏦 2026-11-19 통장 거래내역(은행 엑셀) 읽기 · 맞춰 보기 — 태진 요청(입금 · 출금 내역을 한 곳에서)
//  화면: 자금관리 › 통장 내역(BankStatementBook.jsx) · 테스트: scripts/bankStmt.test.mjs
//  · parseStatement(aoa): 엑셀 첫 시트를 줄 배열(sheet_to_json header:1)로 받아 거래 목록으로
//      은행마다 위에 제목 · 계좌 줄이 몇 줄 있어도 머리줄(입금 · 출금 · 거래일 같은 칸 이름)을 찾아 읽는다
//      "입금액/출금액" 두 칸 · "맡기신금액/찾으신금액"(국민 · 농협) · "거래금액 + 구분(입금/출금)" 모두
//  · matchWithdrawals(outs, docs): 출금 ↔ 지급 대기 지출결의(문서 전체 금액 · 또는 지출 내역 한 줄 금액)
//  · ledgerKeyOf / 장부에 같은 날 · 같은 금액 · 같은 방향이 있으면 "이미 장부에 있음"
//  입금 ↔ 거래처 미수금은 예전 엔진(functions/arMatchCore.mjs matchDeposits)을 그대로 쓴다 — 여기서는 { amount, name, date } 로 넘기기만

const toNum = (v) => {
  if (typeof v === "number") return Math.round(Math.abs(v));
  const s = String(v ?? "").replace(/[,\s원₩]/g, "");
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(Math.abs(n)) : 0;
};
const pad = (n) => String(n).padStart(2, "0");
// 날짜 칸 → YYYY-MM-DD (엑셀 날짜 숫자 · 2026.11.19 · 2026/11/19 09:12 · 20261119 · 11-19(올해))
export function normDate(v, year = new Date().getFullYear()) {
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number" && v > 20000 && v < 80000) { // 엑셀 날짜 숫자(1900 기준)
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v ?? "").trim();
  let m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?!\d)/);
  if (m) return `${year}-${pad(m[1])}-${pad(m[2])}`;
  return "";
}
const timeOf = (v) => { const m = String(v ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/); return m ? `${pad(m[1])}:${m[2]}${m[3] ? `:${m[3]}` : ""}` : ""; };

// 칸 이름 찾기 — 머리줄 칸마다 어떤 뜻인지
const COLS = {
  date: /^(거래\s*일자?|거래\s*일시|거래\s*날짜|일자|날짜|거래일|년월일|date)/i,
  time: /^(거래\s*시간|시간|시각|time)$/i,
  in: /(입금|맡기신|들어온|credit|deposit)/i,
  out: /(출금|찾으신|지급(?!후)|나간|debit|withdraw)/i,
  bal: /(잔액|잔고|balance)/i,
  amt: /^(거래\s*금액|금액|amount)$/i,
  kind: /^(구분|입출\s*구분|거래\s*구분|입\/출금|입출금)$/i,
  name: /(적요|기재\s*내용|내용|입금자|보내는\s*분|받는\s*분|상대|거래처|의뢰인|수취인|성명|이름|거래\s*내용)/i,
  memo: /(메모|비고|내\s*통장\s*표시|통장\s*메모)/i,
};
function headerMap(row) {
  const cells = (row || []).map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
  const map = {};
  cells.forEach((c, i) => {
    if (!c) return;
    if (map.date == null && COLS.date.test(c) && !/시간/.test(c)) { map.date = i; if (/일시/.test(c)) map.dateTime = true; return; }
    if (map.time == null && COLS.time.test(c)) { map.time = i; return; }
    if (map.bal == null && COLS.bal.test(c)) { map.bal = i; return; }
    if (map.amt == null && COLS.amt.test(c)) { map.amt = i; return; }
    if (map.kind == null && COLS.kind.test(c)) { map.kind = i; return; }
    const person = /입금자|보내는|받는|수취|의뢰인|입금처|출금처/.test(c); // "입금자명" 같은 사람 이름 칸은 금액 칸이 아니다
    if (map.in == null && !person && COLS.in.test(c)) { map.in = i; return; }
    if (map.out == null && !person && COLS.out.test(c)) { map.out = i; return; }
    if (map.memo == null && COLS.memo.test(c)) { map.memo = i; return; }
    if (map.name == null && COLS.name.test(c)) { map.name = i; return; }
  });
  return map;
}
const okHeader = (m) => m.date != null && ((m.in != null && m.out != null) || (m.amt != null && m.kind != null) || m.in != null);

// aoa: [[칸, 칸, ...], ...] → { txns: [{ id, date, time, name, memo, in, out, bal }], header, skipped }
export function parseStatement(aoa = [], { year } = {}) {
  const rows = Array.isArray(aoa) ? aoa : [];
  let hi = -1; let map = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) { const m = headerMap(rows[i]); if (okHeader(m)) { hi = i; map = m; break; } }
  if (hi < 0) return { txns: [], header: null, skipped: rows.length, error: "입금 · 출금(또는 거래금액) · 거래일 칸을 찾지 못했어요" };
  const txns = []; let skipped = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const date = normDate(r[map.date], year);
    if (!date) { skipped++; continue; } // 합계 줄 · 빈 줄
    let inAmt = map.in != null ? toNum(r[map.in]) : 0;
    let outAmt = map.out != null ? toNum(r[map.out]) : 0;
    if (map.amt != null && map.kind != null && !inAmt && !outAmt) {
      const k = String(r[map.kind] ?? "");
      const a = toNum(r[map.amt]);
      if (/입금|입|credit|\+/i.test(k)) inAmt = a; else if (/출금|출|지급|debit|-/i.test(k)) outAmt = a;
    }
    if (!inAmt && !outAmt) { skipped++; continue; }
    const name = map.name != null ? String(r[map.name] ?? "").trim() : "";
    const memo = map.memo != null ? String(r[map.memo] ?? "").trim() : "";
    const time = map.time != null ? timeOf(r[map.time]) : map.dateTime ? timeOf(r[map.date]) : "";
    const bal = map.bal != null ? toNum(r[map.bal]) : 0;
    txns.push({ id: `${date}_${time}_${inAmt}_${outAmt}_${bal}_${i}`, date, time, name, memo, in: inAmt, out: outAmt, bal });
  }
  txns.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { txns, header: map, skipped };
}

export function summarize(txns = []) {
  const s = { nIn: 0, nOut: 0, in: 0, out: 0, from: "", to: "" };
  for (const t of txns) {
    if (t.in) { s.nIn++; s.in += t.in; }
    if (t.out) { s.nOut++; s.out += t.out; }
    if (!s.from || t.date < s.from) s.from = t.date;
    if (!s.to || t.date > s.to) s.to = t.date;
  }
  return s;
}

// 미수금 매칭 엔진(matchDeposits)에 넘길 입금 목록
export const depositsOf = (txns = []) => txns.filter((t) => t.in > 0).map((t) => ({ amount: t.in, name: t.name || t.memo, date: t.date.replace(/-/g, ""), _bankId: t.id }));

// 장부(acctLedger)에 이미 있는지 — 같은 날 · 같은 방향 · 같은 금액
export const ledgerKeyOf = (date, type, amount) => `${String(date).slice(0, 10)}|${type}|${Math.round(Number(amount) || 0)}`;
export const txnLedgerKey = (t) => ledgerKeyOf(t.date, t.in ? "수입" : "지출", t.in || t.out);
export function ledgerKeys(rows = []) {
  const m = new Map();
  for (const r of rows) { const k = ledgerKeyOf(r.date, r.type, r.amount); m.set(k, (m.get(k) || 0) + 1); }
  return m;
}

// ── 출금 ↔ 지급 대기 지출결의 ──
const norm = (s) => String(s || "").toLowerCase().replace(/\(주\)|㈜|주식회사|유한회사|\s|[()[\]·.,\-_/]/g, "");
const lineTotal = (r) => { const t = toNum(r?.total); return t || toNum(r?.supply) + toNum(r?.vat) || toNum(r?.amount); };
const dayMs = (ymd) => { const t = Date.parse(`${String(ymd).slice(0, 10)}T00:00:00+09:00`); return Number.isFinite(t) ? t : 0; };
const tsMs = (v) => (typeof v?.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : v?.seconds ? v.seconds * 1000 : 0);
// docs: 지급 대기 지출결의({ id, title, amount, drafter, data: { lines }, paidLines, createdAt, line })
//  후보: ① 문서 전체 금액 = 출금액  ② 아직 체크 안 된 지출 내역 한 줄 금액 = 출금액
//  점수: 이름(지출처 · 기안자)이 통장 적요에 있으면 +2, 결재 끝난 뒤 30일 안 출금이면 +1 — 같은 후보를 두 출금이 나눠 갖지 않게 높은 점수부터
export function matchWithdrawals(outs = [], docs = []) {
  const cands = [];
  outs.forEach((t, ti) => {
    const nm = norm(`${t.name} ${t.memo}`);
    const tDay = dayMs(t.date);
    for (const d of docs) {
      const done = d.line?.[d.line.length - 1]?.at || tsMs(d.updatedAt) || tsMs(d.createdAt);
      const near = tDay && done ? (tDay >= dayMs(new Date(done + 9 * 3600e3).toISOString().slice(0, 10)) - 86400000 * 3 && tDay - done < 86400000 * 30) : false;
      const lines = Array.isArray(d.data?.lines) ? d.data.lines : [];
      const who = norm(d.drafter?.name);
      if (Math.round(Number(d.amount) || 0) === t.out) {
        const hitName = lines.some((r) => norm(r.vendor) && nm.includes(norm(r.vendor))) || (who && nm.includes(who));
        cands.push({ ti, docId: d.id, lineIdx: null, score: 3 + (hitName ? 2 : 0) + (near ? 1 : 0) });
      }
      if (lines.length >= 2) {
        lines.forEach((r, li) => {
          if (d.paidLines?.[li]) return;
          if (lineTotal(r) !== t.out) return;
          const v = norm(r.vendor); const hitName = (v && nm.includes(v)) || (who && nm.includes(who));
          cands.push({ ti, docId: d.id, lineIdx: li, score: 2 + (hitName ? 2 : 0) + (near ? 1 : 0) });
        });
      }
    }
  });
  cands.sort((a, b) => b.score - a.score);
  const usedT = new Set(); const usedKey = new Set(); const usedDocWhole = new Set(); const docHasLine = new Set();
  const res = new Map(); // ti → { docId, lineIdx, score, sure }
  for (const c of cands) {
    if (usedT.has(c.ti)) continue;
    const key = `${c.docId}:${c.lineIdx ?? "all"}`;
    if (usedKey.has(key)) continue;
    if (c.lineIdx == null && docHasLine.has(c.docId)) continue; // 줄을 이미 맞춘 문서는 전체로 또 맞추지 않음
    if (c.lineIdx != null && usedDocWhole.has(c.docId)) continue;
    usedT.add(c.ti); usedKey.add(key);
    if (c.lineIdx == null) usedDocWhole.add(c.docId); else docHasLine.add(c.docId);
    const rivals = cands.filter((x) => x.ti === c.ti && x.score === c.score && `${x.docId}:${x.lineIdx ?? "all"}` !== key).length;
    res.set(c.ti, { docId: c.docId, lineIdx: c.lineIdx, score: c.score, sure: c.score >= 4 && rivals === 0 });
  }
  return res;
}
