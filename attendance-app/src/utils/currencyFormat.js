// 금액 입력칸에서 사용자가 입력한 숫자를 1,000 단위 콤마로 표시하기 위한 변환.
// 저장/계산에는 콤마를 뗀 순수 숫자 문자열을 사용한다.
export function stripCommas(value) {
  return String(value ?? "").replace(/,/g, "");
}

export function formatWithCommas(value) {
  const raw = stripCommas(value);
  if (!raw) return "";
  const [intPart, decPart] = raw.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}
