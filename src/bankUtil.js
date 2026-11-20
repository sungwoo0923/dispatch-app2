// ======================= src/bankUtil.js =======================
// 🏦 은행·계좌 공통 — 지출결의 입금계좌, 기사 가입(정산 계좌), 기사 정산·명세서가 함께 쓴다.
//  · 은행을 고르면 그 은행 계좌 자리수에 맞춰 하이픈을 자동으로 넣는다.
//  · 자리수가 그 은행 형식과 다르면 "확인 필요"로 알려준다(실제 예금주 조회는 오픈뱅킹 계약이 필요해 형식 검사까지).

// [은행명, { 자리수: 하이픈 묶음 }] — 대표적인 형식(구 계좌·특수 계좌는 묶음 없이 4자리씩)
export const BANKS = [
  ["KB국민", { 14: [6, 2, 6], 12: [3, 2, 4, 3] }],
  ["신한", { 12: [3, 3, 6], 11: [3, 2, 6] }],
  ["우리", { 13: [4, 3, 6], 14: [3, 6, 2, 3] }], // 14자리 = 예전 한빛은행 계좌(710-214223-02-101)
  ["하나", { 14: [3, 6, 5], 12: [3, 6, 3] }],
  ["NH농협", { 13: [3, 4, 4, 2], 14: [6, 2, 6], 11: [3, 2, 6] }],
  ["IBK기업", { 14: [3, 6, 2, 3], 12: [3, 6, 3] }],
  ["카카오뱅크", { 13: [4, 2, 7] }],
  ["토스뱅크", { 12: [4, 4, 4] }],
  ["케이뱅크", { 12: [3, 3, 6] }],
  ["우체국", { 14: [6, 2, 6] }],
  ["새마을금고", { 13: [4, 2, 6, 1], 14: [4, 2, 6, 2] }],
  ["신협", { 13: [3, 3, 7], 12: [3, 3, 6] }],
  ["SC제일", { 11: [3, 2, 6] }],
  ["씨티", { 12: [3, 6, 3], 10: [3, 5, 2] }],
  ["수협", { 12: [3, 2, 7], 11: [3, 2, 6] }],
  ["iM뱅크(대구)", { 12: [3, 2, 6, 1], 11: [3, 2, 6] }],
  ["부산", { 13: [3, 4, 4, 2], 12: [3, 3, 6] }],
  ["경남", { 12: [3, 2, 7], 13: [3, 4, 4, 2] }],
  ["광주", { 12: [3, 3, 6], 13: [3, 3, 7] }],
  ["전북", { 13: [3, 2, 7, 1], 12: [3, 2, 7] }],
  ["제주", { 10: [2, 2, 6] }],
  ["KDB산업", { 14: [3, 4, 4, 3] }],
  ["저축은행", {}],
  ["산림조합", { 12: [3, 3, 6] }],
  ["기타", {}],
].map(([name, fmt]) => ({ name, fmt }));
export const BANK_NAMES = BANKS.map((b) => b.name);
const byName = (n) => BANKS.find((b) => b.name === n || n?.includes?.(b.name.replace(/\(.*\)/, "")));

export const onlyDigits = (v) => String(v || "").replace(/\D/g, "");
// 그 은행 계좌의 보통 자리수(작은 순) — 형식이 정해지지 않은 은행은 빈 배열
export const accountLengths = (bank) => Object.keys(byName(bank)?.fmt || {}).map(Number).sort((x, y) => x - y);

// 🔢 2026-11-19 사용자 요청 — 은행마다 계좌 자리수가 정해져 있으면 그보다 더 입력되지 않게(예: 신한 110-335-484151 = 12자리)
//  형식이 정해지지 않은 은행(저축은행 · 기타)은 16자리까지
export const accountMaxLen = (bank) => { const l = accountLengths(bank); return l.length ? l[l.length - 1] : 16; };
// 그 은행 계좌 모양 예시(입력칸 안내) — 가장 긴 형식을 0으로
export const accountPattern = (bank) => { const b = byName(bank); const l = accountLengths(bank); if (!l.length) return ""; return b.fmt[l[l.length - 1]].map((g) => "0".repeat(g)).join("-"); };

// 은행에 맞춰 하이픈 — 입력 중에도 자리수만큼 끊어 보여준다
export function formatAccount(bank, raw) {
  const d = onlyDigits(raw).slice(0, accountMaxLen(bank));
  const b = byName(bank);
  const lens = Object.keys(b?.fmt || {}).map(Number).sort((x, y) => x - y);
  // 지금 길이 이상인 형식 중 가장 짧은 것(입력 중) → 없으면 가장 긴 것
  const pickLen = lens.find((l) => l >= d.length) || lens[lens.length - 1];
  const groups = pickLen ? b.fmt[pickLen] : null;
  if (!groups) return d.replace(/(\d{4})(?=\d)/g, "$1-");
  const out = []; let i = 0;
  for (const g of groups) { if (i >= d.length) break; out.push(d.slice(i, i + g)); i += g; }
  if (i < d.length) out.push(d.slice(i));
  return out.join("-");
}

// 👀 2026-11-20 화면에 보여 주기용 — 입력칸(formatAccount)은 은행 자리수만큼 잘라 더 못 치게 하지만,
//  파일 · 저장된 계좌가 그보다 길면 잘라 보이면 안 된다(한 자리 빠진 계좌로 보임) → 그때는 4자리씩
export function formatAccountView(bank, raw) {
  const d = onlyDigits(raw);
  if (!d) return "";
  return d.length > accountMaxLen(bank) ? d.replace(/(\d{4})(?=\d)/g, "$1-") : formatAccount(bank, d);
}

// 형식 검사 — { ok, level: "ok"|"warn"|"error", msg }
export function validateAccount(bank, raw, holder) {
  const d = onlyDigits(raw);
  if (!bank) return { ok: false, level: "error", msg: "은행을 선택해 주세요" };
  if (!d) return { ok: false, level: "error", msg: "계좌번호를 입력해 주세요" };
  if (d.length < 10 || d.length > 16) return { ok: false, level: "error", msg: `계좌번호 자리수(${d.length}자리)가 올바르지 않습니다` };
  if (/^(\d)\1+$/.test(d)) return { ok: false, level: "error", msg: "같은 숫자만 반복된 계좌번호입니다" };
  const b = byName(bank);
  const lens = Object.keys(b?.fmt || {}).map(Number);
  if (lens.length && !lens.includes(d.length)) return { ok: true, level: "warn", msg: `${bank} 계좌는 보통 ${lens.sort((x, y) => x - y).join("·")}자리입니다 — 다시 확인해 주세요` };
  if (holder !== undefined && !String(holder || "").trim()) return { ok: false, level: "error", msg: "예금주를 입력해 주세요" };
  return { ok: true, level: "ok", msg: "형식 확인됨" };
}

// 저장값(객체) ↔ 화면 문자열. 예전 문자열("국민 123-456 홍길동")도 그대로 보여준다.
export function bankText(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  const acct = v.acct ? formatAccount(v.bank, v.acct) : "";
  return [v.bank, acct, v.holder].filter(Boolean).join(" ");
}
export function parseBankText(s) {
  const t = String(s || "").trim();
  if (!t) return { bank: "", acct: "", holder: "" };
  const bank = BANK_NAMES.find((n) => t.includes(n.replace(/\(.*\)/, ""))) || "";
  const acctM = t.match(/[\d-]{9,}/);
  const acct = acctM ? onlyDigits(acctM[0]) : "";
  const rest = t.replace(bank.replace(/\(.*\)/, ""), "").replace(acctM?.[0] || "", "").replace(/[/|,]/g, " ").replace(/(은행|뱅크)/g, "").trim();
  return { bank, acct, holder: rest.split(/\s+/).filter(Boolean).pop() || "" };
}
