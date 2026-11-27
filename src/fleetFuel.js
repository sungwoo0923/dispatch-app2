// ======================= src/fleetFuel.js =======================
// ⛽ 2026-11-27 지입정산 주유비 공제(업체 요청) — 기사님이 회사 주유카드로 결제 → 운송사가 은행 · 카드 사용내역 엑셀을 받아 기사님별 주유비를 확인
//  · 엑셀(xlsx · xls · csv)을 올리면 날짜 · 금액 · 카드번호 · 내용 칸을 스스로 찾는다(은행 · 카드사마다 칸 이름이 달라서)
//  · 기사님 찾기: ① 카드 끝 4자리 = 기사 정보 유류카드(drivers.유류카드: ["1234", …]) ② 내용에 차량번호(예: 12가3456)
//    못 찾은 줄은 화면에서 기사님을 고르고, 저장하면 그 카드 번호를 기사 정보에 기억한다(다음 달부터 자동)
//  · 저장: drivers/{id}.주유비 = { "YYYY-MM": { amount, count, at, by, src } } — 지급명세서 자동 공제 "주유비"
//  · 계산은 순수 함수(scripts/fleetFuel.test.mjs)
export const FUEL_LABEL = "주유비";
const toInt = (v) => { const s = String(v ?? "").replace(/[,\s원₩]/g, ""); const m = s.match(/^\(?(-?\d+(?:\.\d+)?)\)?$/); if (!m) return 0; const n = Math.round(Number(m[1])); return /^\(.*\)$/.test(s) ? -n : n; };
const norm = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

// 차량번호 → 비교용(앞 지역명 빼고 숫자 · 한글만): "경기 12가 3456" → "12가3456"
export const plateKey = (p) => String(p || "").replace(/\s+/g, "").replace(/^[가-힣]{2}(?=\d)/, "").replace(/[^0-9가-힣]/g, "");
// 카드 칸에서 끝 4자리: "9410-****-****-1234" · "1234" · "본인(1234)"
export const cardLast4 = (v) => { const g = String(v || "").match(/\d{4}/g); return g ? g[g.length - 1] : ""; };

// 날짜 → "YYYY-MM-DD" (엑셀 일련번호 · 2026.11.03 · 2026-11-03 12:34 · 20261103 · 11/03(올해))
export function parseDate(v, year = new Date().getFullYear()) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && v > 30000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
  if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/(20\d{2})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(20\d{2})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})/);
  if (m) return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

const DATE_RE = /(거래|이용|승인|결제|사용)?\s*(일자|일시|날짜|일$)/;
const AMT_PRIOR = [/출금/, /(이용|결제|사용|승인|청구)\s*금액/, /금액/];
const SKIP_AMT = /(입금|잔액|수수료|할인|포인트|부가세)/;
// aoa(엑셀 행 배열) → { rows: [{ date, amount, card, text }], cols, headerRow }
export function parseFuelSheet(aoa, { year } = {}) {
  const A = (aoa || []).map((r) => (Array.isArray(r) ? r : []));
  let h = -1;
  for (let i = 0; i < Math.min(A.length, 40); i++) {
    const cells = A[i].map((c) => String(c ?? "").replace(/\s+/g, ""));
    if (cells.some((c) => DATE_RE.test(c)) && cells.some((c) => /금액|출금/.test(c))) { h = i; break; }
  }
  if (h < 0) return { rows: [], cols: null, headerRow: -1, error: "날짜 · 금액 칸을 찾지 못했어요" };
  const H = A[h].map((c) => String(c ?? "").replace(/\s+/g, ""));
  const dateCol = H.findIndex((c) => DATE_RE.test(c));
  let amtCol = -1;
  for (const re of AMT_PRIOR) { amtCol = H.findIndex((c) => re.test(c) && !SKIP_AMT.test(c)); if (amtCol >= 0) break; }
  const cardCol = H.findIndex((c) => /카드/.test(c) && !/금액|일자/.test(c));
  const textCols = H.map((c, i) => i).filter((i) => i !== dateCol && i !== amtCol && i !== cardCol && H[i] && !/(금액|잔액|입금|출금|일자|일시|날짜|시간|번호$|구분$|승인번호|할부)/.test(H[i]));
  const rows = [];
  for (let i = h + 1; i < A.length; i++) {
    const r = A[i]; if (!r.length) continue;
    const amount = toInt(r[amtCol]); const date = parseDate(r[dateCol], year);
    if (!amount || !date) continue;
    const text = textCols.map((c) => String(r[c] ?? "").trim()).filter(Boolean).join(" · ");
    const cancel = /취소|환불/.test(text);
    rows.push({ i: rows.length, date, amount: cancel && amount > 0 ? -amount : amount, card: cardCol >= 0 ? String(r[cardCol] ?? "").trim() : "", text });
  }
  return { rows, cols: { date: H[dateCol], amount: H[amtCol], card: cardCol >= 0 ? H[cardCol] : "", text: textCols.map((c) => H[c]) }, headerRow: h };
}

// 한 줄 → 기사 id (카드 끝 4자리 → 차량번호) · 없으면 ""
export function matchFuelRow(row, drivers) {
  // 카드 칸의 끝 4자리가 먼저 · 없으면 내용 속 4자리 숫자 중 기사 카드와 맞는 것(한 명일 때만)
  const c4 = cardLast4(row.card);
  const toks = c4 ? [c4] : (String(row.text).match(/(?<!\d)\d{4}(?!\d)/g) || []);
  if (toks.length) {
    const hit = (drivers || []).filter((d) => (Array.isArray(d.유류카드) ? d.유류카드 : [d.유류카드]).map((x) => cardLast4(x)).filter(Boolean).some((x) => toks.includes(x)));
    if (hit.length === 1) return { id: hit[0].id, by: "카드" };
  }
  const t = norm(row.text) + norm(row.card);
  const hit = (drivers || []).filter((d) => { const k = plateKey(d.차량번호); return k.length >= 5 && t.includes(k); });
  if (hit.length === 1) return { id: hit[0].id, by: "차량번호" };
  return { id: "", by: "" };
}

// 기사별 합계 { id: { amount, count } }
export function sumByDriver(rows, assign) {
  const m = {};
  (rows || []).forEach((r) => { const id = assign[r.i]; if (!id) return; const x = m[id] || { amount: 0, count: 0 }; x.amount += r.amount; x.count += 1; m[id] = x; });
  return m;
}

// 기사 정보 → 그 달 주유비(지급명세서 자동 공제)
export const fuelOf = (d, ym) => { const v = d?.주유비?.[ym]; return v && Number(v.amount) > 0 ? { amount: Math.round(Number(v.amount)), count: Number(v.count) || 0 } : null; };
// 할부금(계약 정보) — { amount, start: "YYYY-MM", end: "YYYY-MM" } 그 기간 달만
export const installmentOf = (d, ym) => {
  const v = d?.할부금; const amt = Math.round(Number(v?.amount) || 0);
  if (!(amt > 0)) return null;
  if (v.start && ym < v.start) return null;
  if (v.end && ym > v.end) return null;
  let nth = 0; let total = 0;
  if (v.start && v.end) { const ix = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7)); nth = ix(ym) - ix(v.start) + 1; total = ix(v.end) - ix(v.start) + 1; }
  return { amount: amt, nth, total };
};
