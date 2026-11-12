// ======================= src/rateSheetImport.js =======================
// 💰 2026-11-12 단가표 엑셀 읽기(다목적지 단가표 업로드) — 양식이 달라도 알아서 찾는다
//  · 머리줄: 톤수 이름(11톤 · 5톤 · 2.5T …)이 2개 이상 있는 첫 줄 — 맨 윗줄이 아니어도 되고, 앞에 빈 칸 · 빈 줄이 있어도 된다
//  · 하차지명: 톤수 칸 왼쪽에서 글자가 가장 많이 들어 있는 칸 · 주소: 머리줄에 "주소"가 있으면 그 칸(없어도 됨)
//  · 매입(기사) 단가: 같은 톤수 이름이 한 번 더 나오면 두 번째 묶음 = 매입 단가(buy) — 오더등록에서 기사운임 자동 입력에 쓴다
//  · baseHint: 머리줄 바로 윗줄에 적힌 이름(예: "제이글로벌") — 기준지 이름이 비어 있을 때 쓴다
//  ⚠ 다른 파일을 가져오지 않는다(node 테스트에서 그대로 읽음)
const cell = (v) => String(v ?? "").trim();
const tonKey = (v) => { const m = cell(v).replace(/\s+/g, "").toLowerCase().match(/^(\d+(?:\.\d+)?)(톤|t|ton)(.*)$/); return m ? `${m[1]}톤${m[3] || ""}` : ""; };
const money = (v) => { const s = cell(v).replace(/[^\d]/g, ""); return s ? Number(s) : 0; };

export function parseRateMatrix(rows = []) {
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) { if ((rows[i] || []).filter((c) => tonKey(c)).length >= 2) { hi = i; break; } }
  if (hi < 0) return null;
  const head = rows[hi] || [];
  const tonCols = []; head.forEach((c, i) => { const k = tonKey(c); if (k) tonCols.push({ i, label: k }); });
  // 같은 톤수가 다시 나오면 그때부터 매입 묶음
  const seen = new Set(); const sale = []; const buy = []; let inBuy = false;
  tonCols.forEach((c) => { if (!inBuy && seen.has(c.label)) inBuy = true; if (inBuy) buy.push(c); else { seen.add(c.label); sale.push(c); } });
  const first = sale[0].i;
  const body = rows.slice(hi + 1);
  // 하차지명 칸 — 톤수 칸 왼쪽에서 글자(숫자 아님)가 가장 많은 칸
  let nameCol = -1, best = 0;
  for (let c = 0; c < first; c++) { const n = body.filter((r) => { const v = cell(r?.[c]); return v && !/^[\d,.\s]+$/.test(v); }).length; if (n > best) { best = n; nameCol = c; } }
  if (nameCol < 0) return null;
  const addrCol = head.findIndex((c, i) => i < first && /주소/.test(cell(c)));
  const up = rows[hi - 1] || [];
  const baseHint = cell(up[first]) || cell(up.find((c, i) => i >= first && cell(c)) || "");
  const out = [];
  body.forEach((r) => {
    const name = cell(r?.[nameCol]); if (!name) return;
    const prices = {}; sale.forEach((c) => { const n = money(r[c.i]); if (n) prices[c.label] = n; });
    const buyP = {}; buy.forEach((c) => { const n = money(r[c.i]); if (n) buyP[c.label] = n; });
    if (!Object.keys(prices).length && !Object.keys(buyP).length) return;
    out.push({ name, address: addrCol >= 0 ? cell(r[addrCol]) : "", prices, buy: buyP });
  });
  return { labels: [...new Set(tonCols.map((c) => c.label))], rows: out, baseHint: /매출|매입|청구|운송료|단가/.test(baseHint) ? "" : baseHint, hasBuy: buy.length > 0 };
}
