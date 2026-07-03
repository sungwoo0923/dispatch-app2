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
