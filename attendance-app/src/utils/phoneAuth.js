// Firebase Auth needs an email-shaped credential, but the product's login ID
// is a phone number (matching the reference app's 회원ID(휴대전화번호) design).
// Normalize the phone digits and derive a synthetic, never-shown email from
// them so sign-up and login always resolve to the same Auth account
// regardless of how the phone number was typed (with/without dashes).
export function normalizePhone(value) {
  return (value || "").replace(/[^0-9]/g, "");
}

export function phoneToAuthEmail(phone) {
  return `${normalizePhone(phone)}@kpwork.local`;
}

// Auto-inserts hyphens as the user types a phone number (010-1234-5678
// grouping), used on every 연락처/휴대전화번호 input across PC and mobile.
export function formatPhoneNumber(value) {
  const digits = normalizePhone(value).slice(0, 11);
  if (digits.length < 4) return digits;
  if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

// 주민/외국인등록번호 앞자리 입력: 뒷자리는 성별을 나타내는 첫 숫자 한 자리만 저장하고
// 나머지는 저장하지 않는 정책이므로(개인정보 최소수집), 총 7자리(앞 6 + 뒤 1) 이후는
// 잘라내고 6자리 뒤에 자동으로 하이픈만 삽입한다.
export function formatResidentNumberFront(value) {
  const digits = normalizePhone(value).slice(0, 7);
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}
