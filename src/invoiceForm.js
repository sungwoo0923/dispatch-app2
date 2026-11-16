// ======================= src/invoiceForm.js =======================
// 🧾 2026-11-16 거래명세서 양식(순수 함수) — 거래처마다 원래 쓰던 모양대로 칸을 켜고 끄고 · 순서 · 이름을 바꾼다
//  저장: arDesk 컬렉션 kind "form" — 거래처별 문서(client = 거래처명), 회사 기본은 client = "" (DEFAULT_FORM_CLIENT)
//  화면: src/InvoiceFormEditor.jsx · 쓰는 곳: DispatchApp.jsx 거래처정산 명세서 미리보기 · 일괄 발송 문서
//  숨긴 칸도 오더 데이터는 그대로 있고, 금액 합계는 칸과 상관없이 같다
export const DEFAULT_FORM_CLIENT = "";

// 고를 수 있는 칸(금액 칸은 맨 오른쪽에 따로)
export const INVOICE_COLS = [
  { k: "상차일", label: "날짜", mono: true },
  { k: "상차지", label: "상차지" },
  { k: "하차지", label: "하차지" },
  { k: "경유지", label: "경유지" },
  { k: "화물명", label: "화물명" },
  { k: "톤수", label: "톤수" },
  { k: "차량종류", label: "차종" },
  { k: "기사명", label: "기사명" },
  { k: "차량번호", label: "차량번호", small: true },
];
const KEYS = INVOICE_COLS.map((c) => c.k);
// 지금까지 쓰던 모양(회사 기본)
export const BASE_FORM = { order: [...KEYS], on: ["상차일", "상차지", "하차지", "경유지", "화물명", "기사명", "차량번호"], labels: {}, tax: true };

export const FORM_PRESETS = [
  { key: "기본형", desc: "지금 쓰는 칸 그대로", on: BASE_FORM.on, tax: true },
  { key: "간단형", desc: "날짜 · 구간 · 금액만", on: ["상차일", "상차지", "하차지"], tax: true },
  { key: "차량중심", desc: "톤수 · 차량 위주", on: ["상차일", "하차지", "톤수", "차량종류", "차량번호", "기사명"], tax: true },
  { key: "화물중심", desc: "화물 · 톤수 위주", on: ["상차일", "상차지", "하차지", "화물명", "톤수"], tax: true },
];

// 저장된 값(빠진 칸 · 모르는 칸 정리) → 늘 같은 모양
export function normalizeForm(saved) {
  const s = saved || {};
  const order = [...(Array.isArray(s.order) ? s.order.filter((k) => KEYS.includes(k)) : [])];
  KEYS.forEach((k) => { if (!order.includes(k)) order.push(k); });
  const on = Array.isArray(s.on) ? s.on.filter((k) => KEYS.includes(k)) : [...BASE_FORM.on];
  const labels = {};
  Object.entries(s.labels || {}).forEach(([k, v]) => { const t = String(v || "").trim().slice(0, 12); if (KEYS.includes(k) && t) labels[k] = t; });
  return { order, on: on.length ? on : [...BASE_FORM.on], labels, tax: s.tax !== false };
}
// 거래처 양식 → 회사 기본 → 기본형 순서로 찾는다
export function pickForm(forms, client) {
  const own = forms?.get?.(client);
  if (own) return { ...normalizeForm(own), source: "client" };
  const base = forms?.get?.(DEFAULT_FORM_CLIENT);
  if (base) return { ...normalizeForm(base), source: "company" };
  return { ...normalizeForm(BASE_FORM), source: "base" };
}
export const colLabel = (form, k) => form?.labels?.[k] || INVOICE_COLS.find((c) => c.k === k)?.label || k;
// 보이는 칸(순서대로)
export function visibleCols(form) {
  const f = normalizeForm(form);
  return f.order.filter((k) => f.on.includes(k)).map((k) => ({ ...INVOICE_COLS.find((c) => c.k === k), label: colLabel(f, k) }));
}
// 머리줄 전체 — No · 고른 칸 · 금액 칸
export function headerLabels(form) {
  const f = normalizeForm(form);
  return ["No", ...visibleCols(f).map((c) => c.label), ...(f.tax ? ["공급가액", "세액(10%)", "합계"] : ["금액"])];
}
export const moneyCount = (form) => (normalizeForm(form).tax ? 3 : 1);
// 저장할 값
export const formDoc = (client, form) => { const f = normalizeForm(form); return { kind: "form", client, order: f.order, on: f.on, labels: f.labels, tax: f.tax }; };
export const sameForm = (a, b) => JSON.stringify(normalizeForm(a)) === JSON.stringify(normalizeForm(b));
