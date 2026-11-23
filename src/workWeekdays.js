// ======================= src/workWeekdays.js =======================
// 🗓 2026-11-23 회사 근무 요일(companySettings/{회사}.workWeekdays) 실시간 읽기 · 저장 — 출근기록부(PC · 모바일) · 급여 · 근태 요약이 같이 쓴다
//  직원별 근무 요일은 users/{uid}.workWeekdays(비우면 회사 설정을 따른다) — 계산은 attendanceUtils.workWeekdaysOf
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, getDoc, arrayUnion } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_WORK_WEEKDAYS, normWeekdays } from "./attendanceUtils";
import { leaveEntitlement } from "./approvalForms";

export function useCompanyWorkWeekdays(company) {
  const [days, setDays] = useState(DEFAULT_WORK_WEEKDAYS);
  useEffect(() => {
    if (!company) { setDays(DEFAULT_WORK_WEEKDAYS); return undefined; }
    return onSnapshot(doc(db, "companySettings", company), (s) => setDays(normWeekdays(s.data()?.workWeekdays) || DEFAULT_WORK_WEEKDAYS), () => setDays(DEFAULT_WORK_WEEKDAYS));
  }, [company]);
  return days;
}
export async function getCompanyWorkWeekdays(company) {
  if (!company) return DEFAULT_WORK_WEEKDAYS;
  try { return normWeekdays((await getDoc(doc(db, "companySettings", company))).data()?.workWeekdays) || DEFAULT_WORK_WEEKDAYS; } catch { return DEFAULT_WORK_WEEKDAYS; }
}
export async function saveCompanyWorkWeekdays(company, weekdays) {
  const w = normWeekdays(weekdays) || DEFAULT_WORK_WEEKDAYS;
  await setDoc(doc(db, "companySettings", company), { companyName: company, workWeekdays: w }, { merge: true });
}
// 직원별 — null 이면 회사 설정을 따른다
export async function saveEmployeeWorkWeekdays(uid, weekdays) {
  await setDoc(doc(db, "users", uid), { workWeekdays: weekdays ? (normWeekdays(weekdays) || null) : null }, { merge: true });
}

// 🗓 휴일근무 → 대체휴무 1일(연차 +1일 조정) — 인사관리부 "연차 조정"과 같은 기록(userProfiles.leaveAdjust)
//  같은 날 두 번 주지 않게 attendance 기록에 compDay 표시. 반환: { ok, reason }
export async function grantCompDay({ uid, date, company, days = 1, byEmail = "", byName = "", basis = null }) {
  const prof = (await getDoc(doc(db, "userProfiles", uid)).catch(() => null))?.data() || {};
  if (!prof.hireDate) return { ok: false, reason: "입사일이 없어 연차에 더할 수 없어요. 인사관리부에서 입사일을 먼저 넣어 주세요." };
  const ent = leaveEntitlement(prof.hireDate, new Date(`${date}T12:00:00`), basis);
  if (!ent) return { ok: false, reason: "연차 기간을 계산하지 못했어요." };
  const recRef = doc(db, "attendance", `${date}_${uid}`);
  const rec = (await getDoc(recRef).catch(() => null))?.data() || {};
  if (rec.compDay) return { ok: false, reason: "이미 대체휴무를 줬어요." };
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const entry = { days, reason: `휴일근무 대체휴무 (${date})`, period: ent.from, at: Date.now(), date: today, by: byEmail, byName, kind: "compDay", workDate: date };
  await setDoc(doc(db, "userProfiles", uid), { leaveAdjust: arrayUnion(entry) }, { merge: true });
  await setDoc(recRef, { compDay: { days, at: Date.now(), byName }, companyName: company }, { merge: true });
  return { ok: true };
}
