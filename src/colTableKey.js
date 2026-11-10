// ======================= src/colTableKey.js =======================
// 🧩 2026-11-10 표 알아보기(색 변경 · 컬럼 수정이 같이 쓴다)
//  · 표 이름은 "원래 순서"의 머리글 이름들로 만든다 — 컬럼을 옮겨도 같은 표로 알아본다
//  · 컬럼 수정이 한 번 손댄 표는 칸마다 data-kpci(원래 몇 번째 칸인지)를 달아 둔다
// 숨긴 칸(display:none)은 innerText가 달라질 수 있어 — 보일 때 읽은 이름을 칸에 기억해 두고 쓴다
export const thText = (th) => {
  if (!th) return "";
  let raw;
  if (th.getClientRects && th.getClientRects().length) { raw = th.innerText || th.textContent || ""; th._kpName = raw; }
  else raw = th._kpName ?? th.textContent ?? "";
  return String(raw).replace(/[▲▼↕⇅]/g, "").replace(/\s+/g, " ").trim();
};
export const headRow = (table) => { const h = table?.tHead; return h && h.rows.length ? h.rows[h.rows.length - 1] : null; };
export const headCells = (table) => { const tr = headRow(table); return tr ? [...tr.cells] : []; };
// 원래 순서의 머리글(옮긴 표면 data-kpci 순서대로 되돌려 본다)
export const origHeadCells = (table) => {
  const cells = headCells(table);
  if (cells.length && cells.every((c) => c.dataset.kpci != null)) return [...cells].sort((a, b) => Number(a.dataset.kpci) - Number(b.dataset.kpci));
  return cells;
};
export const tableKey = (table) => {
  if (table?.dataset?.kpTable) return table.dataset.kpTable;
  const names = origHeadCells(table).map(thText).filter(Boolean);
  return `${names.slice(0, 5).join("|")}#${names.length}`;
};
// 칸 이름(같은 이름이 또 있으면 #2, 빈 이름은 "(선택 칸)")
export const colIds = (cells) => {
  const seen = {};
  return cells.map((c) => { const n = thText(c) || "(선택 칸)"; seen[n] = (seen[n] || 0) + 1; return seen[n] > 1 ? `${n}#${seen[n]}` : n; });
};
