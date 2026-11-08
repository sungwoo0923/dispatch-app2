// ======================= src/routeBoardSheet.js =======================
// 📋 배차표 ↔ 구글시트 탭 (화면 없는 순수 함수, 2026-11-02)
//  parseBoardTab: 날짜 탭(여러 묶음 표: "…배차 내역(1센터)" 제목 → 날짜 줄 → 제목줄 → 데이터) → 묶음별 줄
//  sheetToForm:   시트 제목줄을 읽어 양식 칸·묶음을 자동으로 만든다(새 화주사 양식 2~3분 세팅)

import { colIndexes, headerRowsOf, normalizeBoardForm, PULL_ONLY } from "../functions/boardHeaderMatch.mjs"; // 🔗 2026-11-08 머리줄 자동 대조(업체명=거래처명 · 기사님요금=기사운임 …)

const cell = (v) => String(v ?? "").replace(/\u00a0/g, " ").trim();
export const nm = (s) => String(s || "").toLowerCase().replace(/[\s()（）[\]]/g, "");
const DATE_RE = /(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
const pad = (n) => String(n).padStart(2, "0");
const sparse = (row) => row.filter(Boolean).length <= 2; // 제목·날짜 줄(칸이 거의 빈 줄)
const isNoise = (row) => row.some((c) => DATE_RE.test(c) || /배차\s*내역/.test(c));

// 탭 이름 → 날짜("26-11-03" "2026-11-03" "11-03" "11.3" "1103")
export function tabDate(title, year = new Date().getFullYear(), loose = false) {
  const t = cell(title);
  let m = t.match(/^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})\s*(\(?[월화수목금토일](요일)?\)?)?$/); // ⭐ 2026-11-03 날짜만(요일까지) — "26-11-03(테스트)" 같은 탭은 날짜 탭이 아님
  if (!m && loose) m = t.match(/^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})/); // 고정한 탭은 앞의 날짜만 읽음
  if (m) return `${m[1].length === 2 ? 2000 + +m[1] : m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/^(\d{1,2})[-./월]\s*(\d{1,2})일?$/) || t.match(/^(\d{2})(\d{2})$/);
  if (m && +m[1] <= 12 && +m[2] <= 31) return `${year}-${pad(m[1])}-${pad(m[2])}`;
  return "";
}

// 제목줄 찾기 — 양식 칸 이름이 3개 이상(칸이 적으면 2개) 들어 있는 줄
// 🔗 2026-11-08 글자가 달라도 같은 프로그램 칸이면(업체명=거래처명) 같은 열 — functions/boardHeaderMatch.mjs
const headerRows = (rows, cols) => headerRowsOf(rows, cols);

export function parseBoardTab(form0, rawRows) {
  const form = normalizeBoardForm(form0);
  const rows = (rawRows || []).map((r) => (r || []).map(cell));
  const cols = form.columns.filter((c) => c.kind !== "no" && c.kind !== "sum");
  const heads = headerRows(rows, cols);
  const out = {}; form.groups.forEach((g) => { out[g.name] = []; });
  let date = "";
  const missing = new Set();
  heads.forEach((hi, k) => {
    const end = k + 1 < heads.length ? heads[k + 1] : rows.length;
    const above = rows.slice(Math.max(0, hi - 4), hi).filter(sparse);
    // 날짜(첫 번째 "YYYY년 M월 D일" = 상차일)
    if (!date) for (const r of above) { const c = r.find((x) => DATE_RE.test(x)); if (c) { const m = c.match(DATE_RE); date = `${m[1]}-${pad(m[2])}-${pad(m[3])}`; break; } }
    // 묶음: 위쪽 제목에 묶음 이름이 들어 있으면 그 묶음, 아니면 표 순서대로
    const title = above.flat().join(" ");
    const g = form.groups.find((x) => x.name && nm(title).includes(nm(x.name))) || form.groups[Math.min(k, form.groups.length - 1)];
    const data = rows.slice(hi + 1, end);
    // 칸 위치 — 같은 이름이 여러 번이면(왼쪽=전날, 오른쪽=당일 등) 값이 가장 많은 쪽
    const idx = {};
    cols.forEach((c) => {
      const cand = colIndexes(c, rows[hi]);
      if (!cand.length) { missing.add(c.label); return; }
      idx[c.id] = cand.map((i) => ({ i, n: data.filter((r) => cell(r[i])).length })).sort((a, b) => b.n - a.n || b.i - a.i)[0].i;
    });
    data.forEach((r) => {
      if (!r.some(Boolean) || isNoise(r)) return;
      const v = {};
      cols.forEach((c) => { if (idx[c.id] != null) v[c.id] = cell(r[idx[c.id]]); });
      const hasMain = cols.some((c) => (c.kind === "qty" || ["하차지명", "차량번호"].includes(c.field)) && v[c.id]);
      if (!hasMain) return;
      const nameCol = cols.find((c) => c.field === "하차지명");
      if (nameCol && /^(합계|소계|총계|계)$/.test(String(v[nameCol.id] || "").replace(/\s/g, ""))) return;
      out[g.name].push(v);
    });
  });
  return { date, groups: out, headers: heads.length, missing: [...missing] };
}

// 시트 → 새 양식(칸 이름·종류 추천 + 묶음)
export function sheetToForm(rawRows, guessKind) {
  const rows = (rawRows || []).map((r) => (r || []).map(cell));
  let best = -1, bi = -1;
  rows.slice(0, 40).forEach((r, i) => {
    const n = r.filter((c) => c && !/^[\d,.\-\s:/]+$/.test(c) && c.length <= 12).length;
    if (n > best) { best = n; bi = i; }
  });
  if (bi < 0 || best < 2) return null;
  const sig = rows[bi].map(nm).join("|");
  const seen = new Set();
  const used = new Set();
  const columns = [];
  // 같은 칸 이름이 여러 번이면(전날·당일 수량 등) 오른쪽(마지막) 위치 순서로
  const lastAt = new Map(); rows[bi].forEach((h, i) => { if (h) lastAt.set(nm(h), i); });
  const ordered = rows[bi].map((h, i) => ({ h, i })).filter(({ h, i }) => h && lastAt.get(nm(h)) === i).map(({ h }) => h);
  ordered.forEach((h) => {
    if (seen.has(nm(h))) return;
    seen.add(nm(h));
    let g = guessKind(h);
    if (g.kind === "field" && used.has(g.field)) g = { kind: "extra" };
    if (g.kind === "field") used.add(g.field);
    columns.push({ id: Math.random().toString(36).slice(2, 10), label: h, kind: g.kind, ...(g.field ? { field: g.field } : {}) });
  });
  // 같은 제목줄이 반복되면 그 위 제목의 괄호 안 글자를 묶음 이름으로("…배차 내역(1센터)" → 1센터)
  const groups = [];
  rows.forEach((r, i) => {
    if (r.map(nm).join("|") !== sig) return;
    const t = rows.slice(Math.max(0, i - 4), i).filter(sparse).flat().find((c) => /\(([^)]+)\)\s*$/.test(c) && !DATE_RE.test(c));
    const name = t ? t.match(/\(([^)]+)\)\s*$/)[1].trim() : "";
    if (name && !groups.some((g) => g.name === name)) groups.push({ name, 상차지명: "", 상차지주소: "", defaults: [] });
  });
  return { columns, groups: groups.length ? groups : [{ name: "기본", 상차지명: "", 상차지주소: "", defaults: [] }] };
}

// ── 배차표 → 시트 쓰기 계획 ──────────────────────────────────
//  시트의 같은 묶음 표에서 도착지가 같은 줄(같은 도착지가 여러 줄이면 순서대로)을 찾아 칸 값을 바꾼다.
//  쓰는 칸: 차량번호·이름·전화번호·시간·메모·수량·참고(운송업체 등). 도착지·시군구·거래처·운임·합계·순번은 쓰지 않는다.
//  배차표에서 빈 칸은 시트 값을 지우지 않는다(덮어쓰기만).
// ⭐ 2026-11-03 칸을 누가 입력하나 — "화주"(업체가 시트에 입력: 도착지·시군구·리터 수량·비고) / "운송사"(우리가 프로그램에 입력: 차량·기사·운송업체·단가·입차시간)
//  양식에서 칸마다 바꿀 수 있다(c.owner). 서버 functions/routeBoardSync.js의 ownerOf와 같은 기준
const CARRIER_FIELDS = new Set(["차량번호", "이름", "전화번호", "상차시간", "하차시간", "청구운임", "기사운임", "차량톤수", "차량종류"]);
export function ownerOf(c) {
  if (c.owner === "화주" || c.owner === "운송사") return c.owner;
  if (c.kind === "qty") return "화주";
  if (c.kind === "field") return CARRIER_FIELDS.has(c.field) ? "운송사" : "화주";
  if (c.kind === "extra") return /운송업체|운송사|단가|운임|차량|기사/.test(String(c.label || "")) ? "운송사" : "화주";
  return "";
}
const isTimeCol = (c) => c.field === "상차시간" || c.field === "하차시간";
const cmp = (c, v) => { const s = cell(v); if (isTimeCol(c)) return s.replace(/^0(\d)/, "$1"); if (c.field === "전화번호") return s.replace(/\D/g, ""); return s.replace(/\s+/g, ""); };
export const colLetter = (i) => { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export function planSheetWrite(form0, rawRows, boardGroups) {
  const form = normalizeBoardForm(form0);
  const rows = (rawRows || []).map((r) => (r || []).map(cell));
  const cols = form.columns.filter((c) => c.kind !== "no" && c.kind !== "sum" && c.kind !== "calc");
  const writeCols = cols.filter((c) => ownerOf(c) === "운송사" && !(c.kind === "field" && PULL_ONLY.has(c.field))); // 시트에는 운송사 칸만 쓴다(화주가 입력한 칸은 건드리지 않음)
  const nameCol = cols.find((c) => c.field === "하차지명");
  const heads = headerRows(rows, cols);
  const updates = []; const notFound = []; const usedGroups = new Set();
  if (!nameCol) return { updates, notFound: ["양식에 하차지명(도착지) 칸이 없습니다."], headers: heads.length };
  heads.forEach((hi, k) => {
    const end = k + 1 < heads.length ? heads[k + 1] : rows.length;
    const title = rows.slice(Math.max(0, hi - 4), hi).filter(sparse).flat().join(" ");
    const g = form.groups.find((x) => x.name && nm(title).includes(nm(x.name))) || form.groups[Math.min(k, form.groups.length - 1)];
    if (!g || usedGroups.has(g.name)) return;
    usedGroups.add(g.name);
    const idx = {};
    cols.forEach((c) => {
      const cand = colIndexes(c, rows[hi]);
      if (cand.length) idx[c.id] = cand.map((i) => ({ i, n: rows.slice(hi + 1, end).filter((r) => cell(r[i])).length })).sort((a, b) => b.n - a.n || b.i - a.i)[0].i;
    });
    if (idx[nameCol.id] == null) return;
    // 시트 줄: 도착지 → [줄 번호…]
    const byName = new Map();
    for (let ri = hi + 1; ri < end; ri++) {
      const r = rows[ri] || [];
      if (isNoise(r)) continue;
      const key = nm(r[idx[nameCol.id]]);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(ri);
    }
    const seen = new Map();
    (boardGroups[g.name] || []).forEach((v) => {
      const key = nm(v[nameCol.id]);
      if (!key) return;
      const n = seen.get(key) || 0; seen.set(key, n + 1);
      const ri = byName.get(key)?.[n];
      if (ri == null) { notFound.push(`${g.name} · ${v[nameCol.id]}${n ? ` (${n + 1}번째)` : ""}`); return; }
      writeCols.forEach((c) => {
        const ci = idx[c.id]; if (ci == null) return;
        let val = cell(v[c.id]);
        if (!val) return; // 빈 칸은 시트 값을 지우지 않는다
        if (isTimeCol(c)) val = val.replace(/^0(\d)/, "$1");
        const old = cell(rows[ri][ci]);
        if (cmp(c, old) === cmp(c, val)) return;
        updates.push({ a1: `${colLetter(ci)}${ri + 1}`, value: val, old, label: c.label, name: v[nameCol.id], group: g.name });
      });
    });
  });
  return { updates, notFound, headers: heads.length };
}

// ── 💰 단가표(청구운임) — 2026-11-03 ─────────────────────────────────────
//  양식(노선)마다 엑셀 단가표를 올리면 rateTable: [{ region:"광주 광산구", r12:13110, r18:10450 }]
//  · 제목줄의 "12PLT"·"18PLT" 중 단가 쪽(두 칸짜리 → 오른쪽 칸 = 할인된 제안단가, 한 칸이면 그 칸)
//  · 청구운임 = 파레트 합계 × 파렛당 단가 — 18 이상은 18PLT 단가, 그 미만은 12PLT 단가(한쪽이 없으면 있는 쪽)
//  · 지역 맞추기: 도착지 주소에 지역 이름(시·군·구)이 들어 있으면 — 시·도까지 맞으면 우선
//  서버(functions/routeBoardSync.js)에도 같은 계산이 있다
const numOf = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
export function parseRateSheet(rawRows) {
  const rows = (rawRows || []).map((r) => (r || []).map((c) => (typeof c === "number" ? c : cell(c))));
  const isTier = (c, n) => new RegExp(`^${n}(plt|파렛|파레트|팔레트|p)$`, "i").test(String(c || "").replace(/\s/g, "")); // "12PLT"만(“12파렛 요금” 같은 합계 칸 제외)
  const h = rows.findIndex((r) => r.some((c) => isTier(c, 12)) && r.some((c) => isTier(c, 18)));
  if (h < 0) return { error: "제목줄에서 12PLT·18PLT 칸을 찾지 못했습니다." };
  const hr = rows[h];
  const pick = (n) => { // 마지막 "nPLT" — 오른쪽 칸이 비어 있으면(두 칸 합친 제목) 오른쪽 칸이 제안단가
    const idx = hr.map((c, i) => (isTier(c, n) ? i : -1)).filter((i) => i >= 0).pop();
    return { base: idx, rate: hr[idx + 1] === "" || hr[idx + 1] == null ? idx + 1 : idx };
  };
  const c12 = pick(12); const c18 = pick(18);
  let rc = hr.findIndex((c) => /^구분$/.test(String(c || "").replace(/\s/g, "")));
  if (rc < 0) rc = 1;
  const out = []; const seen = new Set();
  rows.slice(h + 1).forEach((r) => {
    const region = String(r[rc] || "").trim();
    if (!region || /합계|소계|^계$/.test(region) || /^[\d.,\s-]+$/.test(region)) return;
    const v = (col) => Math.round(numOf(r[col.rate]) || 0);
    const r12 = v(c12); const r18 = v(c18);
    if (!r12 && !r18) return;
    const key = region.replace(/\s+/g, "");
    if (seen.has(key)) return; seen.add(key);
    out.push({ region, r12, r18 });
  });
  return { table: out };
}
const SIDO_SHORT = [["서울특별시", "서울"], ["부산광역시", "부산"], ["대구광역시", "대구"], ["인천광역시", "인천"], ["광주광역시", "광주"], ["대전광역시", "대전"], ["울산광역시", "울산"], ["세종특별자치시", "세종"], ["경기도", "경기"], ["강원특별자치도", "강원"], ["강원도", "강원"], ["충청북도", "충북"], ["충청남도", "충남"], ["전북특별자치도", "전북"], ["전라북도", "전북"], ["전라남도", "전남"], ["경상북도", "경북"], ["경상남도", "경남"], ["제주특별자치도", "제주"]];
const SIDO = new Set(SIDO_SHORT.map((x) => x[1]));
const METRO_CITY = new Set(["서울시", "부산시", "대구시", "인천시", "대전시", "울산시"]); // "대구시" → 주소 "대구 …"도 같은 곳(광주시는 경기 광주라 제외)
const normAddr = (a) => { let s = String(a || ""); SIDO_SHORT.forEach(([l, sh]) => { s = s.split(l).join(sh); }); return s.replace(/\s+/g, ""); };
export function rateFor(table, addr, pallets) {
  const n = Math.round(numOf(pallets));
  if (!Array.isArray(table) || !table.length || n <= 0) return null;
  const a = normAddr(addr); if (!a) return null;
  const aSido = [...SIDO].find((sd) => a.startsWith(sd)) || "";
  let best = null;
  table.forEach((t) => {
    const toks = String(t.region || "").trim().split(/\s+/).filter(Boolean);
    const sido = toks.find((x) => SIDO.has(x)) || "";
    const rest = toks.filter((x) => !SIDO.has(x));
    if (!rest.length) return;
    const ok = rest.every((x) => a.includes(x) || (METRO_CITY.has(x) && a.includes(x.slice(0, -1))));
    if (!ok) return;
    if (sido && aSido && sido !== aSido && !rest.some((x) => METRO_CITY.has(x))) return; // 시·도가 다르면 다른 곳(예: 대구 남구 ≠ 광주 남구)
    const score = (sido && sido === aSido ? 10 : 0) + rest.join("").length;
    if (!best || score > best.score) best = { t, score };
  });
  if (!best) return null;
  const { t } = best;
  // ⭐ 2026-11-03 단가표는 12P·18P 딱 그 수량일 때만(나머지 파레트 수는 직접 입력)
  const per = n === 18 ? t.r18 : n === 12 ? t.r12 : 0;
  if (!per) return null;
  return { region: t.region, per, pallets: n, total: per * n, tier: n };
}
