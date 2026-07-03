// 주민등록번호 is legally sensitive under Korean privacy law (개인정보보호법)
// and should never be stored in full. The registration form only ever asks
// for the front 7 digits (생년월일 + 성별 코드) needed to identify a record;
// the remaining 6 digits are represented as a fixed mask, never collected.
export function maskResidentNumber(front7) {
  const digits = (front7 || "").replace(/[^0-9]/g, "");
  if (digits.length < 6) return "";
  const birth = digits.slice(0, 6);
  const genderDigit = digits[6] || "";
  return `${birth}-${genderDigit}●●●●●●`;
}
