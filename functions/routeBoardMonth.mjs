// ======================= functions/routeBoardMonth.mjs =======================
// 📅 2026-11-07 배차표 — 월별 탭(25년1월 · 2025-01 …) · 한 탭 시트 지원(화면 src/RouteBoard.jsx · 서버 functions/routeBoardSync.js가 같이 쓴다)
//  예전 배차표는 "날짜 이름 탭"(26-11-03)만 읽었다. 시트 프로필(구글시트 연결 마법사)로 만든 양식은
//   · form.tabMode = "monthly"(달마다 탭) | "single"(form.sheetTab 한 탭) · form.tabPattern = { kind, sample }
//   · 날짜 칸 = columns 중 kind "date"(role "상차일" | "하차일")
//  이면 그 탭에서 날짜 칸이 그날인 줄만 남겨(다른 줄은 빈 줄로 바꿔 줄 번호는 그대로) 예전 규칙(parseBoardTab · planSheetWrite)에 넘긴다.
import { tabMonth, detectMonthlyTabs } from "./sheetProfileCore.mjs";
import { headerRowsOf, colIndexes } from "./boardHeaderMatch.mjs"; // 🔗 2026-11-08 머리줄 자동 대조(날짜/일자 · 업체명/거래처 …)

const cell = (v) => String(v ?? "").replace(/ /g, " ").trim();
const nm = (s) => String(s || "").toLowerCase().replace(/[\s()（）[\]]/g, "");
const pad = (n) => String(n).padStart(2, "0");
const toInt = (v) => parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10) || 0;
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const okYmd = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : "");

export const boardDateCol = (form) => (form?.columns || []).find((c) => c.kind === "date") || null;
export const isMonthBoard = (form) => !form?.fixedTab && (form?.tabMode === "monthly" || form?.tabMode === "single") && !!boardDateCol(form);
// 상차일 → 시트 날짜 칸에 적힌 날짜(날짜 칸이 하차일이면 하차일)
export const sheetDayOf = (form, ymd) => (boardDateCol(form)?.role === "하차일" ? addDays(ymd, toInt(form.dropOffset)) : ymd);
export const pickupOf = (form, day) => (boardDateCol(form)?.role === "하차일" ? addDays(day, -toInt(form.dropOffset)) : day);

// 시트 날짜 칸 값 → "YYYY-MM-DD"(탭 이름의 연·월을 힌트로: "5" · "5일" · "1/5" · "1월 5일" · "2025-01-05" · "2025. 1. 5" · 엑셀 날짜 숫자)
export function cellYmd(v, hint = {}) {
  const s = cell(v).replace(/\s*\(?[월화수목금토일](요일)?\)?$/, "");
  if (!s) return "";
  let m;
  if ((m = s.match(/^(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/))) return okYmd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/))) return okYmd(2000 + +m[1], +m[2], +m[3]);
  const y = hint.y || new Date().getFullYear();
  if ((m = s.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/))) { const mo = +m[1]; return okYmd(hint.m === 12 && mo === 1 ? y + 1 : hint.m === 1 && mo === 12 ? y - 1 : y, mo, +m[2]); }
  if ((m = s.match(/^(\d{1,2})\s*일?$/)) && hint.m) return okYmd(y, hint.m, +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s) && +s > 30000 && +s < 70000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5).toISOString().slice(0, 10);
  return "";
}

// 양식이 읽을 탭(그날) — 월별/한 탭 양식이 아니면 null(예전 날짜 탭 규칙)
export function boardTabFor(form, tabs = [], ymd) {
  if (!isMonthBoard(form)) return null;
  if (form.tabMode === "single") return form.sheetTab && tabs.includes(form.sheetTab) ? form.sheetTab : form.sheetTab ? "" : tabs[0] || "";
  const d = sheetDayOf(form, ymd); const y = +d.slice(0, 4); const mo = +d.slice(5, 7);
  const kind = form.tabPattern?.kind;
  // 🔗 2026-11-08 "25년11월"과 "25년11월의 사본"이 같이 있으면 이름이 딱 그 달인 탭(짧은 이름)을 먼저
  const hit = (k) => tabs.filter((t) => { const x = tabMonth(t, y); return x && (!k || x.kind === k) && x.y === y && x.m === mo; }).sort((a, b) => a.length - b.length)[0];
  return hit(kind) || (kind && kind !== "m월" ? hit("") : "") || "";
}
// 기간(상차일 from~to)에 걸리는 탭들(서버 자동 연동)
export function boardTabsInRange(form, tabs = [], from, to) {
  if (!isMonthBoard(form)) return null;
  if (form.tabMode === "single") { const t = boardTabFor(form, tabs, from); return t ? [t] : []; }
  const out = new Set();
  for (let d = from; d <= to; d = addDays(d, 1)) { const t = boardTabFor(form, tabs, d); if (t) out.add(t); if (out.size > 3) break; }
  return [...out];
}

// 머리줄(양식 칸 이름이 2~3개 이상 있는 줄) — routeBoardSync.headerRows와 같은 기준
function headerRows(rows, form) {
  return headerRowsOf(rows, form.columns.filter((c) => c.kind !== "no" && c.kind !== "sum"));
}
// 줄마다 시트 날짜(병합 칸 · 빈 칸은 윗줄 날짜를 이어서) → Map(줄 번호 → "YYYY-MM-DD")
export function rowDays(form, rawRows, tabTitle = "") {
  const dc = boardDateCol(form); const days = new Map();
  if (!dc) return days;
  const rows = (rawRows || []).map((r) => (r || []).map(cell));
  const x = tabMonth(tabTitle) || {};
  const hint = { y: x.y, m: x.m };
  const heads = headerRows(rows, form);
  heads.forEach((hi, k) => {
    const end = k + 1 < heads.length ? heads[k + 1] : rows.length;
    const ci = colIndexes(dc, rows[hi])[0] ?? -1;
    if (ci < 0) return;
    let carry = "";
    for (let ri = hi + 1; ri < end; ri++) {
      const r = rows[ri] || [];
      if (!r.some(Boolean)) continue;
      const raw = cell(r[ci]);
      if (raw) carry = cellYmd(raw, hint);
      if (carry) days.set(ri, carry);
    }
  });
  return days;
}
// 그날(상차일) 줄만 남긴 시트 값 — 다른 날 줄은 빈 줄(줄 번호 그대로) · 날짜 칸은 "YYYY-MM-DD"로
export function boardRowsFor(form, rawRows, ymd, tabTitle = "") {
  if (!isMonthBoard(form)) return rawRows;
  const want = sheetDayOf(form, ymd);
  const days = rowDays(form, rawRows, tabTitle);
  const dc = boardDateCol(form);
  const heads = new Set(headerRows((rawRows || []).map((r) => (r || []).map(cell)), form));
  const firstHead = Math.min(...heads, Infinity);
  return (rawRows || []).map((r, ri) => {
    if (heads.has(ri) || ri < firstHead) return r;
    const d = days.get(ri);
    if (!d && (r || []).filter((x) => cell(x)).length <= 2) return r; // 날짜 없는 짧은 줄(다음 표 제목 등)은 그대로
    if (d !== want) return [];
    const out = [...(r || [])];
    const hi = [...heads].filter((h) => h < ri).pop();
    const ci = hi != null ? (colIndexes(dc, (rawRows[hi] || []).map(cell))[0] ?? -1) : -1;
    if (ci >= 0) out[ci] = want;
    return out;
  });
}
// 이 탭에 있는 상차일들(기간 안) — 서버 자동 연동이 날짜마다 맞춘다
export function boardDatesIn(form, rawRows, tabTitle, from = "", to = "") {
  const out = new Set();
  rowDays(form, rawRows, tabTitle).forEach((d) => { const p = pickupOf(form, d); if ((!from || p >= from) && (!to || p <= to)) out.add(p); });
  return [...out].sort();
}

// ── 시트 프로필 → 배차표 양식(칸 + 탭 구조) ──
//  날짜 칸(상차일 · 없으면 하차일)은 kind "date"(배차표 화면은 날짜를 보여 주기만) · 월별 탭 프로필이면 tabMode "monthly"
const DATE_TAB_RE = /^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})/;
export function profileToBoardForm(profile, columns) {
  const dateSrc = (profile.columns || []).find((c) => c.field === "상차일" && c.mode !== "ignore") || (profile.columns || []).find((c) => c.field === "하차일" && c.mode !== "ignore");
  let cols = columns;
  if (dateSrc?.header) {
    const k = nm(dateSrc.header);
    cols = columns.map((c) => (nm(c.label) === k && c.kind !== "field" ? { id: c.id, label: c.label, kind: "date", role: dateSrc.field } : c));
  }
  const first = (profile.tabs || [])[0] || "";
  let tabMode = "";
  if (profile.tabMode === "monthly") tabMode = "monthly";
  else if (first && !DATE_TAB_RE.test(first)) tabMode = "single";
  if (!cols.some((c) => c.kind === "date")) tabMode = "";
  return {
    columns: cols, tabMode,
    tabPattern: tabMode === "monthly" ? (profile.tabPattern || null) : null,
    sheetTab: tabMode === "single" ? first : "",
  };
}
// 탭 목록에서 월별 탭 모양 찾기(양식 편집기)
export const monthPatternOf = (tabs = []) => { const m = detectMonthlyTabs(tabs); return m ? { kind: m.kind, sample: m.sample } : null; };
