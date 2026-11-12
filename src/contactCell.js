// ======================= src/contactCell.js =======================
// ☎ 2026-11-12 엑셀 "담당자번호" 칸에 번호 말고 다른 글자가 섞여 있을 때 나눠 담기
//  · "김해룡총괄: 010-8357-4918"      → 이름 김해룡총괄 · 번호 010-8357-4918
//  · "백종훈님(055-540-1360)"          → 이름 백종훈님 · 번호 055-540-1360
//  · "010-2600-6818 / 안전목 + 고임목" → 번호 010-2600-6818 · 나머지(안전목 + 고임목)는 메모로
//  · 번호가 두 개면 첫 번호만 담당자번호, 나머지는 메모로
//  ⚠ 다른 파일을 가져오지 않는다(node 테스트에서 그대로 읽음)
const PHONE_RX = /0\d{1,2}[-.\s)]?\d{3,4}[-.\s]?\d{4}/;
export function fmtTel(s) {
  const d = String(s || "").replace(/\D/g, "");
  if (/^01\d{8,9}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^02\d{7,8}$/.test(d)) return d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : `02-${d.slice(2, 5)}-${d.slice(5)}`;
  if (/^0\d{9,10}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return String(s || "").trim();
}
export const isCleanPhone = (v) => /^[\d\-\s]*$/.test(String(v || ""));
const tidy = (s) => String(s || "").replace(/^[\s:：/·,()\-+]+|[\s:：/·,(\-+]+$/g, "").replace(/\(\s*\)/g, "").trim();

// 담당자 칸 · 담당자번호 칸 → { name, phone, extra(메모로 보낼 나머지) }
export function splitContactCell(nameCell, phoneCell) {
  let name = String(nameCell || "").trim();
  const raw = String(phoneCell || "").trim();
  if (!raw) return { name, phone: "", extra: "" };
  const m = raw.match(PHONE_RX);
  if (!m) return { name, phone: "", extra: raw }; // 번호가 아닌 글자만 있으면 메모로
  const before = tidy(raw.slice(0, m.index));
  const after = tidy(raw.slice(m.index + m[0].length));
  let extra = "";
  if (before && !name && before.length <= 14 && !/\d/.test(before)) name = before; else if (before) extra = before;
  if (after) extra = extra ? `${extra} / ${after}` : after;
  return { name, phone: fmtTel(m[0]), extra };
}
