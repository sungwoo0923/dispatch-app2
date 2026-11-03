// ======================= src/routeBoardSheet.js =======================
// 📋 배차표 ↔ 구글시트 탭 (화면 없는 순수 함수, 2026-11-02)
//  parseBoardTab: 날짜 탭(여러 묶음 표: "…배차 내역(1센터)" 제목 → 날짜 줄 → 제목줄 → 데이터) → 묶음별 줄
//  sheetToForm:   시트 제목줄을 읽어 양식 칸·묶음을 자동으로 만든다(새 화주사 양식 2~3분 세팅)

const cell = (v) => String(v ?? "").replace(/\u00a0/g, " ").trim();
export const nm = (s) => String(s || "").toLowerCase().replace(/[\s()（）[\]]/g, "");
const DATE_RE = /(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
const pad = (n) => String(n).padStart(2, "0");
const sparse = (row) => row.filter(Boolean).length <= 2; // 제목·날짜 줄(칸이 거의 빈 줄)
const isNoise = (row) => row.some((c) => DATE_RE.test(c) || /배차\s*내역/.test(c));

// 탭 이름 → 날짜("26-11-03" "2026-11-03" "11-03" "11.3" "1103")
export function tabDate(title, year = new Date().getFullYear()) {
  const t = cell(title);
  let m = t.match(/^(\d{2,4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1].length === 2 ? 2000 + +m[1] : m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/^(\d{1,2})[-./월]\s*(\d{1,2})일?$/) || t.match(/^(\d{2})(\d{2})$/);
  if (m && +m[1] <= 12 && +m[2] <= 31) return `${year}-${pad(m[1])}-${pad(m[2])}`;
  return "";
}

// 제목줄 찾기 — 양식 칸 이름이 3개 이상(칸이 적으면 2개) 들어 있는 줄
function headerRows(rows, labels) {
  const set = new Set(labels.map(nm));
  const need = Math.max(2, Math.min(3, Math.ceil(set.size / 2)));
  return rows.map((r, i) => ({ i, n: new Set(r.map(nm).filter((x) => set.has(x))).size })).filter((x) => x.n >= need).map((x) => x.i);
}

export function parseBoardTab(form, rawRows) {
  const rows = (rawRows || []).map((r) => (r || []).map(cell));
  const cols = form.columns.filter((c) => c.kind !== "no" && c.kind !== "sum");
  const heads = headerRows(rows, cols.map((c) => c.label));
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
      const cand = rows[hi].map((h, i) => (nm(h) === nm(c.label) ? i : -1)).filter((i) => i >= 0);
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

export function planSheetWrite(form, rawRows, boardGroups) {
  const rows = (rawRows || []).map((r) => (r || []).map(cell));
  const cols = form.columns.filter((c) => c.kind !== "no" && c.kind !== "sum");
  const writeCols = cols.filter((c) => ownerOf(c) === "운송사"); // 시트에는 운송사 칸만 쓴다(화주가 입력한 칸은 건드리지 않음)
  const nameCol = cols.find((c) => c.field === "하차지명");
  const heads = headerRows(rows, cols.map((c) => c.label));
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
      const cand = rows[hi].map((h, i) => (nm(h) === nm(c.label) ? i : -1)).filter((i) => i >= 0);
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
