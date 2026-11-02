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
