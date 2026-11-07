// ======================= src/lateRule.js =======================
// ⏰ 2026-11-07 출근 기준 시간 · 지각 판정 공용(화면 없이 숫자만) — 출근기록부(PC · 모바일) · 인사 요약 · 일일 경영 보고 · 자동 출근이 같은 기준
//  · 출근시간(users.workStartTime)을 정하지 않은 직원은 09:00 · 퇴근시간이 없으면 18:00
//  · 오전반차는 출근시간 + 4시간이 출근 기준(반차 = 근무 4시간)
export const DEFAULT_WORK_START = "09:00";
export const DEFAULT_WORK_END = "18:00";
const hm = (s, d) => { const m = String(s || d).match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : hm(d, DEFAULT_WORK_START); };
export const workStartOf = (emp) => (/^\d{1,2}:\d{2}/.test(String(emp?.workStartTime || "")) ? String(emp.workStartTime).slice(0, 5) : DEFAULT_WORK_START);

// 그날의 근무 기준 시간(분) — 반차 반영
export function workWindow(emp, leave) {
  const s = hm(emp?.workStartTime, DEFAULT_WORK_START);
  let e = hm(emp?.workEndTime, DEFAULT_WORK_END);
  if (e <= s) e = s + 9 * 60;
  let start = s; let end = e;
  if (leave === "오전반차") start = Math.min(e - 60, s + 4 * 60);
  if (leave === "오후반차") end = Math.max(s + 60, s + 4 * 60);
  return { start, end, inFrom: Math.max(0, start - 180), inUntil: end, outFrom: Math.max(start, end - 60) };
}

// 출근 시각("HH:MM")이 기준보다 늦었는지 — halfDay "오전반차"면 +4시간 기준
export function isLateAt(checkInHm, emp, halfDay = "") {
  const m = String(checkInHm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return false;
  const at = Number(m[1]) * 60 + Number(m[2]);
  return at > workWindow(emp, halfDay === "오전반차" ? "오전반차" : "").start;
}
