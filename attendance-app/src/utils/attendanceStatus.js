// 스케줄 출근시각보다 이 분(分) 이상 늦게 체크인하면 "지각"으로 기록한다.
// useGeofenceCheckIn(모바일 체크인 시점)과 AttendanceBoard(관리자가 출근시각을
// 수정하거나 근로자의 시간 변경요청을 승인할 때)가 이 기준을 공유해야
// "출근시각을 지각 전 시간으로 고쳤는데 상태는 여전히 지각"처럼 두 곳의
// 판정이 어긋나는 문제가 생기지 않는다.
export const LATE_GRACE_MINUTES = 10;

export function minutesLate(scheduleStartTime, checkInDate) {
  if (!scheduleStartTime) return 0;
  const [h, m] = scheduleStartTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  const scheduled = new Date(checkInDate);
  scheduled.setHours(h, m, 0, 0);
  return Math.round((checkInDate.getTime() - scheduled.getTime()) / 60000);
}

export function computeCheckInStatus(scheduleStartTime, checkInDate) {
  const late = minutesLate(scheduleStartTime, checkInDate);
  return late > LATE_GRACE_MINUTES ? "지각" : "출근";
}
