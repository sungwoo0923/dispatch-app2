// ======================= src/earlyLeave.js =======================
import { HALF_LEAVES, workWindow, kstNowMin } from "./autoAttendance";
import { kpConfirm } from "./kpDialog";

// 🛠 2026-11-27 조퇴 확인 — 정해진 퇴근 시간(직원 workEndTime · 반차 반영)보다 10분 넘게 이르면 조퇴라고 알리고 묻는다.
//  이르지 않으면 null(부르는 쪽이 원래대로) · 조퇴면 [조퇴하고 퇴근] true / 취소 false
export function earlyLeaveInfo(me, rec) {
  if (!me) return null;
  const half = HALF_LEAVES.includes(rec?.status) ? rec.status : rec?.halfDay;
  const { end } = workWindow(me, half);
  const left = end - kstNowMin();
  if (!Number.isFinite(left) || left <= 10) return null;
  const endHm = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  return { left, endHm, text: `정해진 퇴근 시간(${endHm})보다 ${left >= 60 ? `${Math.floor(left / 60)}시간 ` : ""}${left % 60 ? `${left % 60}분 ` : ""}일러요. 지금 퇴근하면 조퇴예요.\n조퇴는 전자결재 › 근태·휴가 신청 › [조퇴·지각]으로 사유서를 올려 주세요.` };
}
export async function confirmEarlyLeave(me, rec) {
  const info = earlyLeaveInfo(me, rec);
  if (!info) return null;
  return kpConfirm(`${info.text}\n\n지금 퇴근 처리할까요?`, { title: "조퇴 확인", okText: "조퇴하고 퇴근" });
}
