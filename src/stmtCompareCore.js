// ======================= src/stmtCompareCore.js =======================
// ⭐ 2026-11-17 업체 명세서 비교(순수 함수) — 거래처가 먼저 보낸 거래명세서(엑셀 · CSV · 붙여넣은 글 · 캡처 글자)를 우리 오더와 맞춰 본다
//  화면은 src/StmtCompare.jsx(배차현황 › 월 마감 · 정산관리 › 거래처정산에서 [업체 명세서 비교]) · 테스트 scripts/stmtCompare.test.mjs
//  ⚠ node 테스트에서 바로 읽을 수 있게 다른 파일을 가져오지 않는다
//  중요도
//   · 차량번호 · 기사 이름 · 금액 · 총 청구 합계 → 다르면 "불일치"(빨강)
//   · 날짜 → 하루 이틀 다를 수 있어 "주의"(노랑) — 불일치로 세지 않는다
//   · 구간 → 회사마다 적는 법이 달라 "참고"(회색)만 — 세지 않는다
//  짝 짓기: 차량번호(공백 · 하이픈 무시, 지역 빼고 · 끝 4자리만 적은 것도) + 날짜(가까울수록) → 차량번호가 없으면 기사 이름

export const FIELDS = [
  { key: "date", label: "날짜" },
  { key: "plate", label: "차량번호" },
  { key: "name", label: "기사" },
  { key: "amount", label: "금액" },
  { key: "route", label: "구간" },
  { key: "from", label: "상차지" },
  { key: "to", label: "하차지" },
];
export const DEFAULT_OPTS = { dateTol: 1, dateWindow: 3, amountTol: 0 };

const pad = (x) => String(x).padStart(2, "0");
const sp = (v) => String(v ?? "").replace(/\s+/g, "");
export const fmtWon = (v) => Math.round(Number(v) || 0).toLocaleString("ko-KR");

// ── 값 정리 ──
export function normPlate(v) {
  return String(v ?? "").replace(/[\s\-–—._·()]/g, "").toUpperCase();
}
// 지역(서울 · 경기 …)을 뺀 본 번호 "12가3456"
export function plateCore(v) {
  const p = normPlate(v);
  const m = p.match(/(\d{2,3}[가-힣]\d{4})/);
  return m ? m[1] : p;
}
// "exact" | "core"(지역만 다름) | "last4"(한쪽이 끝 4자리만) | ""
export function plateMatch(a, b) {
  const A = normPlate(a), B = normPlate(b);
  if (!A || !B) return "";
  if (A === B) return "exact";
  if (plateCore(A) === plateCore(B) && /\d{4}$/.test(A)) return "core";
  const onlyDigits = (x) => /^\d{4}$/.test(x);
  if ((onlyDigits(A) || onlyDigits(B)) && A.slice(-4) === B.slice(-4)) return "last4";
  return "";
}
export function normName(v) {
  return sp(v).replace(/\(.*?\)|\[.*?\]/g, "").replace(/(기사님|기사|님)$/, "");
}
export const sameName = (a, b) => { const A = normName(a), B = normName(b); return !!A && !!B && A === B; };

export function parseAmount(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const neg = /^\(.*\)$|^-|^△|^▲/.test(s);
  const d = s.replace(/[^\d.]/g, "");
  const x = Math.round(Number(d) || 0);
  return neg ? -x : x;
}

const ymd = (y, m, d) => {
  const Y = Number(y), M = Number(m), D = Number(d);
  if (!(Y > 1990 && Y < 2100 && M >= 1 && M <= 12 && D >= 1 && D <= 31)) return "";
  return `${Y}-${pad(M)}-${pad(D)}`;
};
// 엑셀 날짜 숫자(일련번호) · "2026-11-03" · "2026.11.3" · "26/11/03" · "11/3" · "11월 3일" · "3"(그 달의 날) → "YYYY-MM-DD"
export function parseDate(v, ym = "") {
  const [yy, mm] = [Number(String(ym).slice(0, 4)) || 0, Number(String(ym).slice(5, 7)) || 0];
  if (v instanceof Date && !Number.isNaN(v.getTime())) return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    if (v >= 1 && v <= 31 && yy) return ymd(yy, mm, v);
    return "";
  }
  const s = String(v ?? "").trim();
  if (!s) return "";
  let m = s.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (m) return ymd(m[1], m[2], m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return ymd(m[1], m[2], m[3]);
  m = s.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return ymd(2000 + Number(m[1]), m[2], m[3]);
  m = s.match(/(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/);
  if (m) {
    const M = Number(m[1]);
    let Y = yy || new Date().getFullYear();
    if (mm === 1 && M === 12) Y -= 1; else if (mm === 12 && M === 1) Y += 1;
    return ymd(Y, M, m[2]);
  }
  m = s.match(/^(\d{1,2})\s*일?(\s*\([월화수목금토일]\))?$/);
  if (m && yy) return ymd(yy, mm, m[1]);
  return "";
}
export function dayDiff(a, b) {
  if (!a || !b) return null;
  return Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);
}

// ── 제목 줄 찾기 ──
// 칸 이름 하나 → { field, pri }(pri 클수록 그 칸일 가능성이 높다) | null
export function classifyHeader(h) {
  const s = sp(h).toLowerCase();
  if (!s || s.length > 14) return null;
  if (/세액|부가세|vat|전화|연락|휴대|핸드폰|비고|메모|순번|^no\.?$|^번호$|수량|톤|중량|품목|화물|사업자/.test(s)) return null;
  if (/상차일|운행일|작업일|배차일|출고일|운송일/.test(s)) return { field: "date", pri: 5 };
  if (/일자|날짜|date|^월일$|^일$|^월\/일$/.test(s)) return { field: "date", pri: /하차/.test(s) ? 2 : 4 };
  if (/차량번호|차번|차량no|번호판|^차량$|^차량정보$/.test(s)) return { field: "plate", pri: 5 };
  if (/운임|금액|청구|운송료|운반비|운송비|공급가|단가|요금|합계|대금/.test(s)) {
    if (/기사운임|지급|원가|하불/.test(s)) return null;
    const pri = /공급가/.test(s) ? 6 : /청구/.test(s) ? 6 : /운임|운송료|운반비|운송비/.test(s) ? 5 : /금액|대금|요금/.test(s) ? 4 : /단가/.test(s) ? 3 : 1;
    return { field: "amount", pri };
  }
  if (/기사|성명|이름|운전자|운전기사|차주/.test(s)) return { field: "name", pri: /기사명|성명|운전자/.test(s) ? 5 : 4 };
  if (/구간|노선|경로|운행구간|운송구간/.test(s)) return { field: "route", pri: 5 };
  if (/상차|출발|발지|출하지/.test(s) && !/시간|일$/.test(s)) return { field: "from", pri: 5 };
  if (/하차|도착|착지|납품처|배송지/.test(s) && !/시간|일$/.test(s)) return { field: "to", pri: 5 };
  return null;
}

// rows: 2차원 배열(엑셀 한 장) → { headerRow, map: { field: 칸 번호 }, found: 찾은 칸 수 }
// 제목 줄 하나 → { field: 칸 번호 } (같은 뜻 칸이 여럿이면 가능성 높은 칸)
export function headerMapOf(row = []) {
  const pick = {};
  (row || []).forEach((cell, c) => {
    if (typeof cell === "number") return;
    const k = classifyHeader(cell);
    if (!k) return;
    if (!pick[k.field] || pick[k.field].pri < k.pri) pick[k.field] = { c, pri: k.pri };
  });
  return Object.fromEntries(Object.entries(pick).map(([f, v]) => [f, v.c]));
}
export function detectHeader(rows, maxScan = 25) {
  let best = { headerRow: -1, map: {}, found: 0, score: 0 };
  const lim = Math.min(rows.length, maxScan);
  for (let r = 0; r < lim; r++) {
    const map = headerMapOf(rows[r]);
    const score = Object.keys(map).reduce((a, f) => a + (f === "plate" || f === "amount" ? 2 : 1), 0);
    if (score > best.score) best = { headerRow: r, map, found: Object.keys(map).length, score };
  }
  if (best.score < 3) return { headerRow: -1, map: guessByContent(rows), found: 0 };
  return { headerRow: best.headerRow, map: best.map, found: best.found };
}

const PLATE_RE = /(?:(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\s?)?\d{2,3}\s?[가-힣]\s?-?\s?\d{4}/;
const looksPlate = (v) => PLATE_RE.test(String(v ?? ""));
const looksDate = (v) => (typeof v === "number" ? v > 40000 && v < 60000 : /^\s*(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}|\d{1,2}월\s*\d{1,2}일?)\s*$/.test(String(v ?? "")));
// 제목 줄이 없을 때 — 내용으로 차량번호 · 날짜 · 금액 칸을 짐작한다
export function guessByContent(rows) {
  const width = Math.max(0, ...rows.map((r) => (r || []).length));
  const stat = Array.from({ length: width }, () => ({ plate: 0, date: 0, money: 0, sum: 0, filled: 0, hangul: 0 }));
  rows.slice(0, 300).forEach((r) => (r || []).forEach((v, c) => {
    if (v === "" || v == null) return;
    const s = stat[c]; s.filled += 1;
    if (looksPlate(v)) s.plate += 1;
    else if (looksDate(v)) s.date += 1;
    else { const a = parseAmount(v); if (a >= 1000 && /^[\d,.\s원₩-]+$/.test(String(v))) { s.money += 1; s.sum += a; } else if (/^[가-힣]{2,4}$/.test(sp(v))) s.hangul += 1; }
  }));
  const best = (k, min = 2) => { let bi = -1, bv = 0; stat.forEach((s, i) => { if (s[k] >= min && s[k] > bv) { bv = s[k]; bi = i; } }); return bi; };
  const map = {};
  const p = best("plate"); if (p >= 0) map.plate = p;
  const d = best("date"); if (d >= 0) map.date = d;
  // 금액은 숫자 칸 중 합이 두 번째로 큰 칸이 아니라 "공급가"일 가능성 — 가장 많이 채워진 금액 칸 중 합이 작은 쪽(합계 · 부가세 포함 칸을 피한다)
  const money = stat.map((s, i) => ({ i, ...s })).filter((s) => s.money >= 2).sort((a, b) => b.money - a.money || a.sum - b.sum);
  if (money.length) map.amount = money[0].i;
  if (p >= 0) { const nm = stat.map((s, i) => ({ i, ...s })).filter((s) => s.hangul >= 2 && s.i !== p).sort((a, b) => Math.abs(a.i - p) - Math.abs(b.i - p)); if (nm.length) map.name = nm[0].i; }
  return map;
}

const TOTAL_RE = /^(총\s*)?(합\s*계|총\s*계|소\s*계|누\s*계|계)(\s*금액)?$|^합계금액$|^총청구금액$|^청구합계$/;
const isTotalRow = (row) => row.some((v) => typeof v === "string" && TOTAL_RE.test(v.trim().replace(/[:：]/g, "")));

// 2차원 배열 + 칸 지정 → 업체 줄 [{ i, date, plate, name, amount, route, from, to, raw }] + 업체가 적은 합계(statedTotal)
export function rowsFromTable(rows, { headerRow = -1, map = {}, ym = "" } = {}) {
  const get = (r, f) => (map[f] == null || map[f] < 0 ? "" : r[map[f]]);
  const out = [];
  let statedTotal = null;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = (rows[r] || []).map((v) => (typeof v === "string" ? v.trim() : v));
    if (!row.some((v) => v !== "" && v != null)) continue;
    const plate = String(get(row, "plate") ?? "").trim();
    const amount = parseAmount(get(row, "amount"));
    if (isTotalRow(row) && !looksPlate(plate)) {
      if (amount) statedTotal = (statedTotal || 0) + amount;
      else { const nums = row.map(parseAmount).filter((x) => x >= 1000); if (nums.length) statedTotal = (statedTotal || 0) + Math.max(...nums); }
      continue;
    }
    const name = String(get(row, "name") ?? "").trim();
    // 제목 줄이 다시 나오면(장마다 머리) 건너뛴다
    if (classifyHeader(plate)?.field === "plate" || classifyHeader(name)?.field === "name") continue;
    if (!plate && !name && !amount) continue;
    const from = String(get(row, "from") ?? "").trim(), to = String(get(row, "to") ?? "").trim();
    const route = String(get(row, "route") ?? "").trim() || (from || to ? `${from}${from && to ? " → " : ""}${to}` : "");
    out.push({ i: out.length, src: r + 1, date: parseDate(get(row, "date"), ym), plate, name, amount, route, from, to, raw: row });
  }
  return { rows: out, statedTotal };
}

// 붙여넣은 글 · 글자 인식 결과 — 탭/두 칸 이상 공백으로 칸이 나뉘면 표로, 아니면 줄마다 차량번호 · 날짜 · 금액을 뽑는다
export function textToTable(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/ /g, " ")).filter((l) => l.trim());
  const splitter = lines.some((l) => l.includes("\t")) ? /\t/ : lines.filter((l) => /\S\s{2,}\S/.test(l)).length >= Math.max(2, lines.length * 0.5) ? /\s{2,}/ : /,/;
  if (splitter.source === "," && !lines.some((l) => l.split(",").length >= 3)) return null;
  return lines.map((l) => l.split(splitter).map((c) => c.trim()));
}
export function parseLooseLines(text, ym = "") {
  const out = [];
  let statedTotal = null;
  String(text || "").split(/\r?\n/).forEach((line, li) => {
    const l = line.trim(); if (!l) return;
    const pm = l.match(PLATE_RE);
    const nums = [...l.matchAll(/(?<![\d.])(\d{1,3}(?:,\d{3})+|\d{4,9})(?![\d.])\s*원?/g)].map((m) => parseAmount(m[1])).filter((x) => x >= 1000 && !(x > 19000000 && x < 21001231));
    if (!pm) {
      if (/합\s*계|총\s*계|총\s*청구/.test(l) && nums.length) statedTotal = Math.max(...nums);
      return;
    }
    const rest = l.replace(pm[0], " ");
    const dm = rest.match(/\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\s*[/.-]\s*\d{1,2}|\d{1,2}월\s*\d{1,2}일?/);
    const amtNums = [...rest.replace(dm ? dm[0] : "", " ").matchAll(/(?<![\d.])(\d{1,3}(?:,\d{3})+|\d{4,9})(?![\d.])/g)].map((m) => parseAmount(m[1])).filter((x) => x >= 1000);
    const after = l.slice(pm.index + pm[0].length).match(/^\s*([가-힣]{2,4})(?:\s*기사)?(?=\s|$|\d)/);
    const nm = after || rest.replace(/[\d,.\/-]+/g, " ").match(/(?:^|\s)([가-힣]{2,4})(?:\s*기사)?(?=\s|$)/);
    out.push({ i: out.length, src: li + 1, date: dm ? parseDate(dm[0], ym) : "", plate: pm[0].trim(), name: nm ? nm[1] : "", amount: amtNums.length ? amtNums[0] : 0, route: "", from: "", to: "", raw: [l] });
  });
  return { rows: out, statedTotal };
}

// 캡처 · 사진의 글자 인식 결과(줄마다 위치 bbox) → 표. 같은 높이끼리 한 줄, 제목 줄을 찾으면 칸을 제목 위치에 맞춘다
//  lines: [{ text, bbox: { x0, y0, x1, y1 } }]
export function ocrTable(lines = []) {
  const cells = [];
  lines.filter((l) => l && String(l.text || "").trim() && l.bbox).forEach((l) => {
    const parts = String(l.text).trim().split(/\s{2,}|\t/);
    const w = (l.bbox.x1 - l.bbox.x0) / Math.max(1, String(l.text).trim().length);
    let off = 0;
    parts.forEach((p) => { const st = String(l.text).indexOf(p, off); off = st + p.length; const x0 = l.bbox.x0 + Math.max(0, st) * w; cells.push({ text: p.trim(), x0, x1: x0 + p.length * w, y0: l.bbox.y0, y1: l.bbox.y1 }); });
  });
  if (!cells.length) return [];
  const hAvg = cells.reduce((a, c) => a + (c.y1 - c.y0), 0) / cells.length || 10;
  cells.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const groups = [];
  cells.forEach((c) => {
    const yc = (c.y0 + c.y1) / 2;
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.yc - yc) <= hAvg * 0.55) { g.items.push(c); g.yc = (g.yc * (g.items.length - 1) + yc) / g.items.length; } else groups.push({ yc, items: [c] });
  });
  const rows = groups.map((g) => g.items.sort((a, b) => a.x0 - b.x0));
  const plain = rows.map((r) => r.map((c) => c.text));
  const H = detectHeader(plain);
  if (H.headerRow < 0) return plain;
  const cols = rows[H.headerRow].map((c) => (c.x0 + c.x1) / 2);
  return rows.map((r, ri) => {
    if (ri <= H.headerRow) return r.map((c) => c.text);
    const out = cols.map(() => "");
    r.forEach((c) => { const xc = (c.x0 + c.x1) / 2; let bi = 0; cols.forEach((x, i) => { if (Math.abs(x - xc) < Math.abs(cols[bi] - xc)) bi = i; }); out[bi] = out[bi] ? `${out[bi]} ${c.text}` : c.text; });
    return out;
  });
}

// ── 우리 오더 → 비교용 ──
export function ourRowOf(o) {
  const from = String(o?.상차지명 || "").trim(), to = String(o?.하차지명 || "").trim();
  return { id: o?._id || o?.id || "", date: String(o?.상차일 || "").slice(0, 10), date2: String(o?.하차일 || "").slice(0, 10), plate: String(o?.차량번호 || "").trim(), name: String(o?.이름 || o?.기사명 || "").trim(), amount: parseAmount(o?.청구운임), from, to, route: from || to ? `${from} → ${to}` : "", order: o };
}

// 구간 — 우리 상차지 · 하차지 이름이 업체 구간 글에 들어 있으면 같다고 본다
export function routeSame(our, their) {
  const t = sp(`${their.route} ${their.from} ${their.to}`).replace(/[→>~\-]/g, "");
  if (!t) return null;
  const key = (s) => sp(s).replace(/\(.*?\)|주식회사|\(주\)|㈜|센터|물류|창고/g, "").slice(0, 4);
  const a = key(our.from), b = key(our.to);
  const hit = (k) => k.length >= 2 && t.includes(k);
  if (!a && !b) return null;
  return (!a || hit(a)) && (!b || hit(b));
}

// ── 비교 ──
// ours: 우리 오더(원본) 배열 · theirs: 업체 줄 · 결과 { rows, sum, totals, vat }
export function compareStatement(ours = [], theirs = [], opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const A = ours.map(ourRowOf);
  const B = theirs.map((t, i) => ({ ...t, i: t.i ?? i }));
  // 짝 후보 점수
  const cand = [];
  B.forEach((t, bi) => A.forEach((u, ai) => {
    const pm = plateMatch(u.plate, t.plate);
    const nm = sameName(u.name, t.name);
    if (!pm && !nm) return;
    const dd = dayDiff(u.date, t.date);
    const dd2 = dayDiff(u.date2, t.date);
    const d = dd == null ? null : dd2 == null ? dd : Math.min(dd, dd2);
    if (d != null && d > o.dateWindow) return;
    let s = pm === "exact" ? 100 : pm === "core" ? 90 : pm === "last4" ? 60 : 0;
    if (nm) s += pm ? 15 : 45;
    s += d == null ? 5 : d === 0 ? 30 : d <= o.dateTol ? 18 : 6 - d;
    if (u.amount && Math.abs(u.amount - t.amount) <= o.amountTol) s += 10;
    if (routeSame(u, t)) s += 4;
    cand.push({ ai, bi, s, d, pm, nm });
  }));
  cand.sort((x, y) => y.s - x.s || x.bi - y.bi || x.ai - y.ai);
  const usedA = new Set(), usedB = new Set(), pairs = [];
  cand.forEach((c) => { if (usedA.has(c.ai) || usedB.has(c.bi)) return; usedA.add(c.ai); usedB.add(c.bi); pairs.push(c); });

  // 업체 금액이 부가세 포함(×1.1)인지 — 짝의 60% 이상이 그렇다면 우리 금액 × 1.1로 맞춰 본다
  const withAmt = pairs.filter((p) => A[p.ai].amount && B[p.bi].amount);
  const vatHits = withAmt.filter((p) => A[p.ai].amount !== B[p.bi].amount && Math.abs(Math.round(A[p.ai].amount * 1.1) - B[p.bi].amount) <= 10).length;
  const vat = opts.vat != null ? !!opts.vat : withAmt.length >= 2 && vatHits / withAmt.length >= 0.6;
  const ourAmt = (u) => (vat ? Math.round(u.amount * 1.1) : u.amount);
  const amtTol = vat ? Math.max(10, o.amountTol) : o.amountTol;

  const rows = [];
  pairs.forEach((p) => {
    const u = A[p.ai], t = B[p.bi];
    const cells = {};
    // 차량번호
    if (!t.plate) cells.plate = { st: "none" };
    else if (!u.plate) cells.plate = { st: "bad", msg: `차량번호 없음: 업체 ${t.plate}` };
    else if (!p.pm) cells.plate = { st: "bad", msg: `차량번호 다름: 우리 ${u.plate} / 업체 ${t.plate}` };
    else if (p.pm === "last4") cells.plate = { st: "info", msg: "업체는 끝 4자리만 적었어요" };
    else if (p.pm === "core") cells.plate = { st: "info", msg: "지역 표기만 달라요" };
    else cells.plate = { st: "ok" };
    // 기사 이름
    if (!t.name) cells.name = { st: "none" };
    else if (!u.name) cells.name = { st: "bad", msg: `기사 없음: 업체 ${t.name}` };
    else if (!p.nm) cells.name = { st: "bad", msg: `기사 다름: 우리 ${u.name} / 업체 ${t.name}` };
    else cells.name = { st: "ok" };
    // 금액
    const ua = ourAmt(u);
    if (!t.amount && !u.amount) cells.amount = { st: "ok" };
    else if (Math.abs(ua - t.amount) > amtTol) cells.amount = { st: "bad", msg: `금액 다름: 우리 ${fmtWon(ua)} / 업체 ${fmtWon(t.amount)}`, diff: t.amount - ua };
    else cells.amount = { st: "ok" };
    // 날짜 — 하루 이틀은 그럴 수 있다(주의)
    if (!t.date) cells.date = { st: "none" };
    else if (p.d === 0) cells.date = { st: "ok" };
    else if (p.d != null && p.d <= o.dateTol) cells.date = { st: "warn", msg: `날짜 ${p.d}일 차이: 우리 ${u.date.slice(5)} / 업체 ${t.date.slice(5)}` };
    else if (p.d != null) cells.date = { st: "warn", msg: `날짜 다름: 우리 ${u.date.slice(5)} / 업체 ${t.date.slice(5)}` };
    else cells.date = { st: "none" };
    // 구간 — 참고만
    const rs = routeSame(u, t);
    cells.route = rs == null ? { st: "none" } : rs ? { st: "ok" } : { st: "info", msg: "구간 표기가 달라요(참고)" };
    const bad = Object.values(cells).filter((c) => c.st === "bad");
    const warn = Object.values(cells).filter((c) => c.st === "warn");
    rows.push({ kind: "pair", status: bad.length ? "bad" : warn.length ? "warn" : "ok", our: u, their: t, cells, reasons: [...bad, ...warn, ...Object.values(cells).filter((c) => c.st === "info")].map((c) => c.msg).filter(Boolean) });
  });
  A.forEach((u, ai) => { if (!usedA.has(ai)) rows.push({ kind: "ours", status: "ours", our: u, their: null, cells: {}, reasons: ["업체 명세서에 없어요"] }); });
  B.forEach((t, bi) => { if (!usedB.has(bi)) rows.push({ kind: "theirs", status: "theirs", our: null, their: t, cells: {}, reasons: ["우리 오더에 없어요"] }); });
  const dOf = (r) => r.our?.date || r.their?.date || "9999";
  rows.sort((x, y) => dOf(x).localeCompare(dOf(y)) || normPlate(x.our?.plate || x.their?.plate).localeCompare(normPlate(y.our?.plate || y.their?.plate)) || (x.their?.i ?? 1e9) - (y.their?.i ?? 1e9));

  const ourTotal = A.reduce((a, u) => a + ourAmt(u), 0);
  const theirTotal = B.reduce((a, t) => a + t.amount, 0);
  const stated = opts.statedTotal == null ? null : Number(opts.statedTotal) || 0;
  const theirFinal = stated != null && stated > 0 ? stated : theirTotal;
  const sum = {
    ok: rows.filter((r) => r.status === "ok" || r.status === "warn").length,
    bad: rows.filter((r) => r.status === "bad").length,
    warn: rows.filter((r) => r.status === "warn").length,
    ours: rows.filter((r) => r.status === "ours").length,
    theirs: rows.filter((r) => r.status === "theirs").length,
  };
  const totals = {
    ours: ourTotal, ourSupply: A.reduce((a, u) => a + u.amount, 0),
    theirs: theirFinal, theirRows: theirTotal, stated,
    diff: theirFinal - ourTotal,
    same: Math.abs(theirFinal - ourTotal) <= (vat ? Math.max(10, A.length * 10) : o.amountTol),
    statedMismatch: stated != null && stated > 0 && Math.abs(stated - theirTotal) > (vat ? 10 : o.amountTol),
  };
  return { rows, sum, totals, vat, allSame: sum.bad === 0 && sum.ours === 0 && sum.theirs === 0 && totals.same };
}
