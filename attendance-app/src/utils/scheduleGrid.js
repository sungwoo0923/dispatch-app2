import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { attendanceDocId } from "./dateUtils";
import { leaveStatusOn } from "./statsShared";

// AttendanceBoard.jsx(PC) 월별 스케줄표와 동일한 근태 상태 목록/표시 —
// 관리자 모바일 월간보기도 같은 attendance/leaves/schedules 컬렉션에
// 똑같은 형태로 기록해야 PC와 항상 일치하므로 이 값들을 그대로 공유한다.
export const GRID_STATUS_KEYS = ["출근", "특근", "휴무", "연차", "오전반차", "오후반차", "병가", "결근"];

export const GRID_STATUS_LABELS = {
  출근: { label: "출근", desc: "정상 출근으로 표시", tone: "bg-primary text-white" },
  특근: { label: "특근", desc: "휴일/추가 근무", tone: "bg-indigo-500 text-white" },
  휴무: { label: "휴무", desc: "무급 휴무일", tone: "bg-slate-500 text-white" },
  연차: { label: "연차", desc: "연차 1일 사용", tone: "bg-amber-500 text-white" },
  오전반차: { label: "오전반차", desc: "연차 0.5일 사용", tone: "bg-amber-400 text-white" },
  오후반차: { label: "오후반차", desc: "연차 0.5일 사용", tone: "bg-amber-400 text-white" },
  병가: { label: "병가", desc: "질병으로 인한 휴가", tone: "bg-purple-500 text-white" },
  결근: { label: "결근", desc: "무단/사유 결근", tone: "bg-danger text-white" },
};

export const GRID_CELL_META = {
  출근: { label: "출", className: "bg-primary text-white font-semibold" },
  지각: { label: "지", className: "bg-primary/70 text-white font-semibold" },
  특근: { label: "특", className: "bg-indigo-500 text-white font-semibold" },
  휴무: { label: "휴", className: "bg-slate-200 text-slate-600" },
  "관리자 처리": { label: "휴", className: "bg-slate-200 text-slate-600" },
  연차: { label: "연", className: "bg-amber-100 text-amber-700 font-semibold" },
  오전반차: { label: "오전", className: "bg-amber-100 text-amber-700 text-[9px] font-semibold" },
  오후반차: { label: "오후", className: "bg-amber-100 text-amber-700 text-[9px] font-semibold" },
  병가: { label: "병", className: "bg-purple-100 text-purple-700 font-semibold" },
  결근: { label: "결", className: "bg-red-50 text-danger" },
  "": { label: "", className: "text-slate-300" },
  OUT: { label: "", className: "bg-slate-200/70" },
};

// 하루치 상태 하나를 결정한다 — 출근기록(attendance) > 휴가기록(leaves) >
// 미래 날짜(빈칸) > 과거인데 기록이 없으면 결근. PC 월별 스케줄표
// (AttendanceBoard.jsx)와 동일한 우선순위.
export function resolveDayStatus(uid, emp, dateKey, attendanceList, leavesList, todayKey) {
  if (emp?.hireDate && dateKey < emp.hireDate) return "OUT";
  if (emp?.resignDate && dateKey > emp.resignDate) return "OUT";
  const att = attendanceList.find((a) => a.uid === uid && a.date === dateKey);
  if (att && (att.status === "출근" || att.status === "지각" || att.status === "특근")) return att.status;
  const leave = leaveStatusOn(leavesList, [], uid, dateKey);
  if (leave) return leave.type;
  if (dateKey > todayKey) return "";
  return "결근";
}

// 스케줄등록(schedules) 인원현황과 맞춰준다 — 출근/특근은 출근확정, 휴무
// 계열은 휴무. 결근/미정은 건드리지 않는다(별도 결근 버킷이 없어서).
async function syncScheduleStatus(db, { companyId, emp, uid, name, dateKey, statusKey, existingSchedules, siteName }) {
  let targetStatus = null;
  if (statusKey === "출근" || statusKey === "특근") targetStatus = "출근확정";
  else if (["휴무", "연차", "오전반차", "오후반차", "병가"].includes(statusKey)) targetStatus = "휴무";
  if (!targetStatus) return;
  const existing = (existingSchedules || []).find((s) => s.uid === uid && s.date === dateKey);
  if (existing) {
    if (existing.status !== targetStatus) await updateDoc(doc(db, "schedules", existing.id), { status: targetStatus }).catch(() => {});
  } else {
    await addDoc(collection(db, "schedules"), {
      companyId,
      uid,
      name,
      date: dateKey,
      startTime: "09:00",
      endTime: "18:00",
      siteId: emp?.workSiteId || null,
      siteName: siteName || "",
      status: targetStatus,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  }
}

// 하루치 상태를 실제 문서에 반영한다 — PC의 writeDayStatus와 동일한 규칙.
// existingLeaves: 그 uid의 승인된 leaves 문서 배열(겹치는 기존 기록 삭제용).
// existingSchedules: 그 uid의 schedules 문서 배열(스케줄등록 상태 동기화용).
export async function writeDayStatus(db, { companyId, uid, name, dateKey, statusKey, emp, existingLeaves, existingSchedules, siteName }) {
  const overlapping = (existingLeaves || []).filter(
    (l) => l.status === "approved" && dateKey >= l.startDate && dateKey <= (l.endDate || l.startDate)
  );
  for (const l of overlapping) await deleteDoc(doc(db, "leaves", l.id)).catch(() => {});
  if (statusKey === "출근" || statusKey === "특근") {
    await setDoc(
      doc(db, "attendance", attendanceDocId(uid, dateKey)),
      {
        uid,
        name,
        companyId,
        date: dateKey,
        month: dateKey.slice(0, 7),
        status: statusKey,
        checkInTime: `${dateKey}T09:00:00`,
        source: "manual",
      },
      { merge: true }
    );
  } else {
    await deleteDoc(doc(db, "attendance", attendanceDocId(uid, dateKey))).catch(() => {});
    if (statusKey) {
      await addDoc(collection(db, "leaves"), {
        companyId,
        uid,
        name,
        type: statusKey,
        startDate: dateKey,
        endDate: dateKey,
        status: "approved",
        source: "schedule",
        createdAt: serverTimestamp(),
      });
    }
  }
  await syncScheduleStatus(db, { companyId, emp, uid, name, dateKey, statusKey, existingSchedules, siteName });
}
