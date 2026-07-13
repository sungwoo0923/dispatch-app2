export function toDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toMonthKey(d = new Date()) {
  return toDateKey(d).slice(0, 7);
}

export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function formatTime(isoOrDate) {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDate(dateKey) {
  const [y, m, d] = dateKey.split("-");
  return `${y}.${m}.${d}`;
}

export function addDays(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function attendanceDocId(uid, dateKey = toDateKey()) {
  return `${dateKey}_${uid}`;
}

// 주민/외국인등록번호 앞자리(YYMMDD-G...)에서 만 나이를 계산한다. 7번째 자리(성별/세기
// 구분 숫자)로 출생연도의 세기를 판별한다: 1·2·5·6 → 1900년대, 3·4·7·8 → 2000년대.
const CENTURY_BY_GENDER_DIGIT = { 1: 1900, 2: 1900, 3: 2000, 4: 2000, 5: 1900, 6: 1900, 7: 2000, 8: 2000 };

export function calculateAge(residentNumberFront) {
  const digits = (residentNumberFront || "").replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  const century = CENTURY_BY_GENDER_DIGIT[digits[6]];
  if (!century) return null;
  const birthDate = new Date(century + Number(digits.slice(0, 2)), Number(digits.slice(2, 4)) - 1, Number(digits.slice(4, 6)));
  if (Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

// calculateAge와 동일한 주민/외국인번호 앞자리 파싱 규칙을 재사용해, 나이 대신
// 생년월일 자체를 "YYYY-MM-DD" dateKey 형식으로 돌려준다(급여명세서 상단
// 정보표의 생년월일 항목 등에서 사용).
export function birthDateFromResident(residentNumberFront) {
  const digits = (residentNumberFront || "").replace(/[^0-9]/g, "");
  if (digits.length < 7) return "";
  const century = CENTURY_BY_GENDER_DIGIT[digits[6]];
  if (!century) return "";
  const yy = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const dd = digits.slice(4, 6);
  const birthDate = new Date(century + Number(yy), Number(mm) - 1, Number(dd));
  if (Number.isNaN(birthDate.getTime())) return "";
  return `${century + Number(yy)}-${mm}-${dd}`;
}
