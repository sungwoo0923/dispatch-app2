// ======================= src/formatInput.js =======================
// 🧩 입력칸 공용 서식 — 전화번호 하이픈 · 금액 콤마 · 사업자번호 · 주민번호
//  · 입력하는 도중에도 바로 모양이 잡히도록(부분 입력 지원) 만든 함수들.
//  · 저장 형식은 각 화면이 원래 쓰던 형식을 그대로 둔다(이 파일은 "보이는 모양"만 담당).

const digits = (v) => String(v ?? "").replace(/\D/g, "");

// 📞 전화번호: 010-1234-5678 · 02-123-4567 · 031-123-4567 · 1588-1234 · 0505-123-4567
export function fmtPhone(v) {
  const d = digits(v).slice(0, 12);
  if (!d) return "";
  // 대표번호(15xx/16xx/18xx) 8자리
  if (/^1[5-9]/.test(d)) return d.length <= 4 ? d : `${d.slice(0, 4)}-${d.slice(4, 8)}`;
  // 국번: 02(서울) 2자리 · 0505 등 4자리 · 그 외 3자리
  const head = d.startsWith("02") ? 2 : /^050\d/.test(d) ? 4 : 3;
  if (d.length <= head) return d;
  const h = d.slice(0, head), rest = d.slice(head);
  if (rest.length <= 3) return `${h}-${rest}`;
  if (rest.length < 7) return `${h}-${rest.slice(0, 3)}-${rest.slice(3)}`;
  if (rest.length === 7) return `${h}-${rest.slice(0, 3)}-${rest.slice(3)}`;
  return `${h}-${rest.slice(0, 4)}-${rest.slice(4, 8)}`;
}

// 💰 금액: 숫자만 남기고 천단위 콤마. allowMinus면 앞의 "-" 유지.
export function fmtMoney(v, { allowMinus = false } = {}) {
  const s = String(v ?? "");
  const neg = allowMinus && /^\s*-/.test(s);
  const d = digits(s).replace(/^0+(?=\d)/, "");
  if (!d) return neg ? "-" : "";
  return (neg ? "-" : "") + d.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// 💰 콤마 붙은 글자 → 숫자(빈 값은 0)
export function parseMoney(v) {
  const s = String(v ?? "");
  const n = Number(digits(s));
  return /^\s*-/.test(s) ? -n : n;
}

// 💰 콤마 뺀 숫자 글자("" 유지) — 원래 문자열로 저장하던 화면용
export const moneyDigits = (v) => digits(v);

// 🏢 사업자등록번호: 000-00-00000
export function fmtBizNo(v) {
  const d = digits(v).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

// 🪪 주민등록번호: 000000-0000000 (mask=true면 뒷자리 첫 글자만 보이고 ******)
export function fmtRrn(v, { mask = false } = {}) {
  const d = digits(v).slice(0, 13);
  if (d.length <= 6) return d;
  const back = d.slice(6);
  return `${d.slice(0, 6)}-${mask ? back.slice(0, 1) + "*".repeat(Math.max(0, back.length - 1)) : back}`;
}

// 🏦 계좌번호: 숫자와 하이픈만, 하이픈 연속/앞뒤 정리
export function fmtAccountLoose(v) {
  return String(v ?? "").replace(/[^\d-]/g, "").replace(/-{2,}/g, "-").replace(/^-/, "").slice(0, 24);
}
