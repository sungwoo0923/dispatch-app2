// ======================= src/privateFareCore.js =======================
// 🔐 2026-11-18 비공개 운임 계산(화면 없이 숫자만 — scripts/privateFareCore.test.mjs 가 검사)
//  직원들이 아는 청구운임(공개)과 따로, 지정된 사람이 정한 "실제 청구 금액"(비공개)을 오더마다 정한다.
//  정하는 순서(위가 우선):
//   ① 오더별 직접 입력(fares/{오더 id}.amount)
//   ② 노선 규칙 — 거래처 + 상차지 → 하차지가 같으면(예: 무지개 운송 · 서울 → 부산 = 150,000원)
//   ③ 거래처 규칙 — 그 거래처의 모든 노선(공개 + 정액 · 공개 × 비율 · 고정 금액)
//   ④ 규칙이 없으면 비공개 대상이 아니다(공개 금액 그대로 · 화면 합계에서 빠짐)
//  차액(내 몫) = 비공개 금액 − 공개 청구운임
export const PF_MODES = [
  ["fix", "고정 금액", "이 금액으로 청구"],
  ["add", "공개 + 정액", "공개 청구운임에 더하기"],
  ["rate", "공개 × 비율", "공개 청구운임의 몇 %"],
];
export const toNum = (v) => Number(String(v ?? "").replace(/[^\d-]/g, "")) || 0;
export const normName = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
const CANCEL = /취소/;
export const isCanceled = (o) => CANCEL.test(String(o?.배차상태 || "")) || CANCEL.test(String(o?.상태 || ""));
export const orderDate = (o) => String(o?.상차일 || o?.상차일자 || "").slice(0, 10);
export const orderId = (o) => String(o?._id || o?.id || "");
export const routeLabel = (o) => `${String(o?.상차지명 || "-").trim()} → ${String(o?.하차지명 || "-").trim()}`;

// 규칙 하나로 계산한 금액(공개 금액이 없으면 고정 금액만 계산된다)
export function ruleAmount(rule, base) {
  if (!rule) return 0;
  const b = Number(base) || 0;
  const v = Number(rule.value) || 0;
  if (rule.mode === "fix") return v;
  if (!b) return 0;
  if (rule.mode === "add") return b + v;
  if (rule.mode === "rate") return Math.round((b * v) / 100 / 10) * 10; // 10원 단위
  return 0;
}

// 오더에 맞는 규칙 — 노선 규칙이 거래처 규칙보다 먼저
export function matchRule(order, rules = []) {
  const c = normName(order?.거래처명);
  if (!c) return null;
  const from = normName(order?.상차지명), to = normName(order?.하차지명);
  const mine = rules.filter((r) => r && r.on !== false && normName(r.client) === c);
  return mine.find((r) => r.from && r.to && normName(r.from) === from && normName(r.to) === to)
    || mine.find((r) => !r.from && !r.to)
    || null;
}

// 오더 하나의 비공개 금액 — { on(비공개 대상), base(공개), amount(비공개), diff(차액), source("manual"|"route"|"client") }
export function privateOf(order, rules = [], saved = null) {
  const base = toNum(order?.청구운임);
  if (saved && Number(saved.amount) > 0) {
    const amount = Number(saved.amount);
    return { on: true, base, amount, diff: amount - base, source: "manual", memo: saved.memo || "" };
  }
  const r = matchRule(order, rules);
  if (!r) return { on: false, base, amount: base, diff: 0, source: "" };
  const amount = ruleAmount(r, base);
  if (!amount) return { on: false, base, amount: base, diff: 0, source: "" };
  return { on: true, base, amount, diff: amount - base, source: r.from ? "route" : "client", rule: r };
}

// 화면에 쓸 줄들 — 비공개 대상 오더만(취소 제외)
export function privateRows(orders = [], rules = [], savedMap = {}) {
  const out = [];
  for (const o of orders || []) {
    if (!o || isCanceled(o)) continue;
    const id = orderId(o);
    const p = privateOf(o, rules, savedMap[id]);
    if (!p.on) continue;
    out.push({ id, date: orderDate(o), client: String(o.거래처명 || "").trim(), route: routeLabel(o), from: String(o.상차지명 || "").trim(), to: String(o.하차지명 || "").trim(), ...p, order: o });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.client.localeCompare(b.client, "ko"));
}

// 합계 · 묶음
export function summarize(rows = []) {
  const s = { n: 0, base: 0, amount: 0, diff: 0 };
  for (const r of rows) { s.n += 1; s.base += r.base; s.amount += r.amount; s.diff += r.diff; }
  s.rate = s.base ? (s.diff / s.base) * 100 : 0; // 차액률(공개 대비)
  return s;
}
export function groupBy(rows = [], keyOf) {
  const m = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const g = m.get(k) || { key: k, n: 0, base: 0, amount: 0, diff: 0 };
    g.n += 1; g.base += r.base; g.amount += r.amount; g.diff += r.diff;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.diff - a.diff || b.amount - a.amount);
}
// 최근 n개월(끝 달 포함) — [{ ym, label, base, amount, diff, n }]
export function monthly(rows = [], endYm, n = 6) {
  const months = [];
  const d = new Date(`${endYm}-01T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() - i); months.push(x.toISOString().slice(0, 7)); }
  const by = new Map(months.map((ym) => [ym, { ym, label: `${Number(ym.slice(5))}월`, base: 0, amount: 0, diff: 0, n: 0 }]));
  for (const r of rows) { const g = by.get(r.date.slice(0, 7)); if (g) { g.base += r.base; g.amount += r.amount; g.diff += r.diff; g.n += 1; } }
  return months.map((ym) => by.get(ym));
}
// 규칙을 넣은 거래처의 노선 중 아직 노선 규칙이 없는 것(많이 다닌 순) — "노선별로 따로 정할까요?" 제안
export function routeSuggestions(orders = [], rules = [], limit = 8) {
  const clients = new Set(rules.filter((r) => r.on !== false).map((r) => normName(r.client)));
  const m = new Map();
  for (const o of orders || []) {
    if (!o || isCanceled(o)) continue;
    const c = normName(o.거래처명);
    if (!clients.has(c)) continue;
    const has = rules.some((r) => r.from && normName(r.client) === c && normName(r.from) === normName(o.상차지명) && normName(r.to) === normName(o.하차지명));
    if (has) continue;
    const k = `${c}|${normName(o.상차지명)}|${normName(o.하차지명)}`;
    const g = m.get(k) || { client: String(o.거래처명 || "").trim(), from: String(o.상차지명 || "").trim(), to: String(o.하차지명 || "").trim(), n: 0, base: 0 };
    g.n += 1; g.base += toNum(o.청구운임);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, limit).map((g) => ({ ...g, avg: g.n ? Math.round(g.base / g.n) : 0 }));
}
