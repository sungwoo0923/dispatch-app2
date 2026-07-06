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

// 주민등록번호/외국인등록번호는 둘 다 앞 6자리(생년월일) + 뒤 7자리(성별/등록지 등)
// 형식이 동일하므로(외국인은 뒷자리 첫 숫자만 5~8로 다름) 하나의 포맷터로 처리한다.
// 6자리 뒤에 자동으로 하이픈을 삽입하고, 총 13자리에서 자른다.
export function formatResidentNumber(value) {
  const digits = normalizePhone(value).slice(0, 13);
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}
