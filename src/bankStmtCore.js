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
const okHeader = (m) => m.date != null && ((m.in != null && m.out != null) || m.amt != null || m.in != null);

// ── 🏦 2026-11-19 은행별 양식 ── 은행을 고르면 그 은행 엑셀의 칸 이름을 먼저 찾는다(못 찾은 칸은 위 자동 규칙으로)
//  칸 이름은 띄어쓰기 · (원) 을 빼고 비교한다. 은행이 양식을 바꿔도 화면에서 칸을 직접 고르면 회사마다 기억한다(saved)
//  signed: "거래금액" 한 칸에 출금이 −로 들어오는 은행(카카오뱅크 · 토스뱅크)
export const BANK_PRESETS = [
  { code: "ibk", name: "IBK기업은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀저장]",
    cols: { date: ["거래일시", "거래일자"], out: ["출금", "출금액"], in: ["입금", "입금액"], bal: ["거래후잔액", "잔액"], name: ["거래내용", "상대계좌예금주명", "적요"], memo: ["메모", "통장메모"] } },
  { code: "kb", name: "KB국민은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀 다운로드]",
    cols: { date: ["거래일시"], name: ["보낸분/받는분", "적요"], out: ["출금액", "찾으신금액"], in: ["입금액", "맡기신금액"], bal: ["잔액"], memo: ["송금메모", "메모"] } },
  { code: "shinhan", name: "신한은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]",
    cols: { date: ["거래일자", "거래일시"], time: ["거래시간"], out: ["출금", "출금액"], in: ["입금", "입금액"], name: ["내용", "적요"], bal: ["잔액"], memo: ["메모"] } },
  { code: "woori", name: "우리은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀저장]",
    cols: { date: ["거래일시"], name: ["기재내용", "적요"], out: ["지급", "찾으신금액", "출금"], in: ["입금", "맡기신금액"], bal: ["거래후잔액", "잔액"], memo: ["메모"] } },
  { code: "hana", name: "하나은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]",
    cols: { date: ["거래일시"], name: ["의뢰인/수취인", "적요"], in: ["입금", "입금액"], out: ["출금", "출금액"], bal: ["거래후잔액", "잔액"], memo: ["메모"] } },
  { code: "nh", name: "NH농협은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀 다운로드]",
    cols: { date: ["거래일시", "거래일자"], out: ["출금금액", "찾으신금액"], in: ["입금금액", "맡기신금액"], bal: ["거래후잔액", "잔액"], name: ["거래내용", "거래기록사항", "적요"], memo: ["거래기록사항"] } },
  { code: "post", name: "우체국", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]", cols: { date: ["거래일자"], time: ["거래시간"], in: ["입금액"], out: ["출금액"], bal: ["잔액"], name: ["내용", "적요"] } },
  { code: "kfcc", name: "새마을금고", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]", cols: { date: ["거래일시"], out: ["출금금액"], in: ["입금금액"], bal: ["잔액"], name: ["적요", "상대방"] } },
  { code: "kakao", name: "카카오뱅크", path: "앱 › 계좌 › 거래내역 › [거래내역 저장(엑셀)]: 메일로 받은 파일", signed: true,
    cols: { date: ["거래일시"], kind: ["구분"], amt: ["거래금액"], bal: ["거래후잔액"], name: ["내용"], memo: ["메모"] } },
  { code: "toss", name: "토스뱅크", path: "앱 › 통장 › 거래내역 › [내보내기]", signed: true,
    cols: { date: ["거래일시"], name: ["적요"], kind: ["거래유형"], amt: ["거래금액"], bal: ["거래후잔액"], memo: ["메모"] } },
  { code: "kbank", name: "케이뱅크", path: "앱 › 거래내역 › [엑셀 저장]", cols: {} },
  { code: "sc", name: "SC제일은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]", cols: {} },
  { code: "im", name: "iM뱅크(대구)", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]", cols: {} },
  { code: "busan", name: "부산은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]", cols: {} },
  { code: "kyongnam", name: "경남은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]", cols: {} },
  { code: "kjb", name: "광주은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]", cols: {} },
  { code: "suhyup", name: "수협은행", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]", cols: {} },
  { code: "cu", name: "신협", path: "인터넷뱅킹 › 조회 › 거래내역조회 › [엑셀]", cols: {} },
  { code: "etc", name: "기타 · 모르겠음", path: "인터넷뱅킹 › 거래내역 조회 › 엑셀 저장", cols: {} },
];
export const presetOf = (code) => BANK_PRESETS.find((b) => b.code === code) || null;
// 통장 이름(예: "IBK기업은행", "국민")으로 은행 고르기
export function presetByBankName(bank = "") {
  const s = String(bank).replace(/\s/g, "");
  const KEYS = [["ibk", /기업|ibk/i], ["kb", /국민|kb/i], ["shinhan", /신한/], ["woori", /우리/], ["hana", /하나|외환/], ["nh", /농협|nh/i], ["post", /우체국/], ["kfcc", /새마을/], ["kakao", /카카오/], ["toss", /토스/], ["kbank", /케이뱅크|k뱅크/i], ["sc", /sc|제일/i], ["im", /대구|im/i], ["busan", /부산/], ["kyongnam", /경남/], ["kjb", /광주/], ["suhyup", /수협/], ["cu", /신협/]];
  const hit = KEYS.find(([, re]) => re.test(s));
  return hit ? hit[0] : "";
}
export const FIELD_LABELS = { date: "거래일", time: "시간", in: "입금액", out: "출금액", amt: "거래금액", kind: "입출 구분", bal: "잔액", name: "내용 · 상대방", memo: "메모" };
const normHead = (c) => String(c ?? "").replace(/\s+/g, "").replace(/\((원|원화|KRW)\)/gi, "").trim();
// 은행 양식 · 저장해 둔 칸 이름(saved: { date: "거래일시", ... })으로 먼저 찾고, 남은 칸은 자동 규칙
function presetMap(row, preset, saved) {
  const cells = (row || []).map(normHead);
  const base = headerMap(row);
  const map = {}; const used = new Set();
  const want = (f, names) => { if (map[f] != null) return; for (const n of names || []) { const i = cells.findIndex((c, ci) => c && !used.has(ci) && c === normHead(n)); if (i >= 0) { map[f] = i; used.add(i); return; } } };
  for (const f of Object.keys(FIELD_LABELS)) { if (saved?.[f]) want(f, [saved[f]]); }
  for (const f of Object.keys(FIELD_LABELS)) want(f, preset?.cols?.[f]);
  for (const f of Object.keys(FIELD_LABELS)) if (map[f] == null && base[f] != null && !used.has(base[f])) { map[f] = base[f]; used.add(base[f]); }
  if (base.dateTime && map.date === base.date) map.dateTime = true;
  if (/일시/.test(cells[map.date] || "")) map.dateTime = true;
  return map;
}
const signedNum = (v) => { if (typeof v === "number") return v; const s = String(v ?? "").replace(/[,\s원₩]/g, ""); const n = Number(s.replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };

// aoa: [[칸, 칸, ...], ...] → { txns: [{ id, date, time, name, memo, in, out, bal }], header, headerRow, headCells, skipped }
//  opts.bank: 은행 코드(BANK_PRESETS) · opts.saved: 화면에서 고른 칸 이름 · opts.map: 칸 번호를 직접(화면에서 고칠 때)
export function parseStatement(aoa = [], { year, bank, saved, map: forced, headerRow } = {}) {
  const rows = Array.isArray(aoa) ? aoa : [];
  const preset = presetOf(bank);
  let hi = -1; let map = null;
  if (forced && headerRow != null) { hi = headerRow; map = forced; }
  else for (let i = 0; i < Math.min(rows.length, 30); i++) { const m = presetMap(rows[i], preset, saved); if (okHeader(m)) { hi = i; map = m; break; } }
  if (hi < 0) return { txns: [], header: null, headerRow: -1, headCells: [], skipped: rows.length, error: "입금 · 출금(또는 거래금액) · 거래일 칸을 찾지 못했어요. 은행을 맞게 골랐는지 확인하거나, 아래에서 칸을 직접 골라 주세요." };
  const txns = []; let skipped = 0;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const date = normDate(r[map.date], year);
    if (!date) { skipped++; continue; } // 합계 줄 · 빈 줄
    let inAmt = map.in != null ? toNum(r[map.in]) : 0;
    let outAmt = map.out != null ? toNum(r[map.out]) : 0;
    if (map.amt != null && !inAmt && !outAmt) {
      const k = map.kind != null ? String(r[map.kind] ?? "") : "";
      const raw = signedNum(r[map.amt]); const a = Math.round(Math.abs(raw));
      if (/입금|^입$|credit|\+/i.test(k)) inAmt = a;
      else if (/출금|^출$|지급|debit|결제|이체출금/i.test(k)) outAmt = a;
      else if (raw < 0) outAmt = a; else if (raw > 0) inAmt = a; // 카카오뱅크 · 토스뱅크: −면 출금
    }
    if (!inAmt && !outAmt) { skipped++; continue; }
    const name = map.name != null ? String(r[map.name] ?? "").trim() : "";
    const memo = map.memo != null && map.memo !== map.name ? String(r[map.memo] ?? "").trim() : "";
    const time = map.time != null ? timeOf(r[map.time]) : map.dateTime ? timeOf(r[map.date]) : "";
    const bal = map.bal != null ? toNum(r[map.bal]) : 0;
    txns.push({ id: `${date}_${time}_${inAmt}_${outAmt}_${bal}_${i}`, date, time, name, memo, in: inAmt, out: outAmt, bal });
  }
  txns.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { txns, header: map, headerRow: hi, headCells: (rows[hi] || []).map((c) => String(c ?? "").trim()), skipped };
}
// 화면에서 고친 칸 번호 → 칸 이름(다음에 같은 은행 파일을 올리면 이 이름으로 찾는다)
export function savedOf(map = {}, headCells = []) {
  const o = {};
  for (const f of Object.keys(FIELD_LABELS)) if (map[f] != null && headCells[map[f]]) o[f] = headCells[map[f]];
  return o;
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
