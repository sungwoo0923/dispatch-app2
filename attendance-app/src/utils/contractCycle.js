import { addDays } from "./dateUtils";

// 상용직은 입사일과 같은 "일(day)"을 매달 계약 갱신 기준일로 삼는다.
// 예) 7월 1일 입사 -> 매월 1일이 기준일, 7월 15일 입사 -> 매월 15일이 기준일.
// 그 달에 그 일자가 없으면(예: 31일 입사 + 30일까지인 달) 그 달의 말일로
// 당겨진다.
function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// todayKey 기준으로 "이번 달의 기준일"을 계산한다.
export function contractCycleAnchor(hireDateKey, todayKey) {
  const hireDay = parseInt(hireDateKey.slice(8, 10), 10);
  const [y, m] = todayKey.split("-").map(Number);
  const day = Math.min(hireDay, daysInMonth(y, m - 1));
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

// 이번 달 기준일이 이미 지났다면 다음 달 기준일을 새로 계산한다(다음 달
// 계약서를 미리 준비해야 하므로).
export function nextContractCycleAnchor(hireDateKey, todayKey) {
  const anchor = contractCycleAnchor(hireDateKey, todayKey);
  if (anchor >= todayKey) return anchor;
  const [y, m] = todayKey.split("-").map(Number);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  const hireDay = parseInt(hireDateKey.slice(8, 10), 10);
  const day = Math.min(hireDay, daysInMonth(ny, nm - 1));
  return `${ny}-${pad2(nm)}-${pad2(day)}`;
}

// 다음 계약 갱신일이 leadDays일 이내로 다가왔는지(=지금 미리 발송해야 하는지).
export function isWithinLeadWindow(anchorKey, todayKey, leadDays = 5) {
  return addDays(anchorKey, -leadDays) <= todayKey;
}
