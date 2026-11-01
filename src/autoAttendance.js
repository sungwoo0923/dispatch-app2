// ======================= src/autoAttendance.js =======================
// ⏰ 자동 출퇴근 공통 규칙(2026-11-02) — PC·모바일이 같은 기준을 쓴다
//  · 직원마다 출근·퇴근 시간(users.workStartTime / workEndTime, 인사팀이 직원관리·가입 승인에서 지정, 없으면 09:00~18:00)
//  · 자동 출근은 "출근시간 3시간 전 ~ 퇴근시간" 사이에만 — 자정·새벽에 프로그램을 열어도 출근으로 찍히지 않는다
//  · 자동 퇴근(모바일, 출근지 반경 밖)은 "퇴근시간 1시간 전"부터만 — 낮에 외근·점심으로 나가는 건 퇴근이 아니다
//    자동 퇴근 뒤 같은 날 다시 반경 안으로 오면 퇴근 기록을 지운다(마지막으로 나간 시간이 퇴근)
//  · 반차 — 반차 = 근무 4시간: 오전반차는 출근시간 +4시간이 출근 기준, 오후반차는 출근시간 +4시간이 퇴근 기준
//  · 연차·병가 등 하루 휴가는 출근 기록 없이 그 휴가로 표시
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { approvalLeaveOn, findApprovedLeaveForDate, isHoliday, isWeekend } from "./attendanceUtils";

export const HALF_LEAVES = ["오전반차", "오후반차"];
const NOT_LEAVE = ["외근", "조퇴"]; // 출근은 하는 날
const hm = (s, d) => { const m = String(s || d).match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : hm(d, "09:00"); };
export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const kstNowMin = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const minToHm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// 출근·퇴근 시간 선택지(30분 단위) — 직원관리·가입 승인 드롭다운
export const WORK_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => minToHm(i * 30));

// 그날의 근무 기준 시간(분) — 반차 반영
export function workWindow(emp, leave) {
  const s = hm(emp?.workStartTime, "09:00");
  let e = hm(emp?.workEndTime, "18:00");
  if (e <= s) e = s + 9 * 60;
  let start = s; let end = e;
  if (leave === "오전반차") start = Math.min(e - 60, s + 4 * 60);
  if (leave === "오후반차") end = Math.max(s + 60, s + 4 * 60);
  return { start, end, inFrom: Math.max(0, start - 180), inUntil: end, outFrom: Math.max(start, end - 60) };
}

// 오늘 승인된 휴가(구 일정 + 전자결재) — "오전반차" | "오후반차" | "연차" ... | null(외근·조퇴는 출근하는 날이라 null)
export async function todayLeaveOf(uid, name, today = kstToday()) {
  let label = null;
  try {
    const s = await getDocs(query(collection(db, "schedules"), where("authorUid", "==", uid)));
    label = findApprovedLeaveForDate(s.docs.map((d) => d.data()), uid, today, name);
  } catch { /* 무시 */ }
  if (!label) {
    try {
      const a = await getDocs(query(collection(db, "approvals"), where("participants", "array-contains", uid)));
      label = approvalLeaveOn(a.docs.map((d) => ({ id: d.id, ...d.data() })), uid, today) || null;
    } catch { /* 무시 */ }
  }
  return label && !NOT_LEAVE.includes(label) ? label : null;
}

// 자동 출근 시도 — 결과: { ok, reason, retryAt(분), weekend, leave }
export async function tryAutoCheckIn({ uid, name, company, source = "auto" }) {
  if (!uid || !company) return { ok: false, reason: "no-user" };
  const today = kstToday();
  const ref = doc(db, "attendance", `${today}_${uid}`);
  const ex = await getDoc(ref).catch(() => null);
  if (ex?.exists()) { const d = ex.data(); if (d.companyName === company && (d.checkInTime || d.status)) return { ok: false, reason: "exists" }; }
  const me = (await getDoc(doc(db, "users", uid)).catch(() => null))?.data() || {};
  const leave = await todayLeaveOf(uid, name || me.name, today);
  const userName = me.name || name || "";
  if (leave && !HALF_LEAVES.includes(leave)) {
    await setDoc(ref, { uid, name: userName, date: today, month: today.slice(0, 7), status: leave, checkInTime: null, source: "leave", companyName: company }, { merge: true });
    return { ok: false, reason: "leave", leave };
  }
  let hol = [];
  try { hol = (await getDocs(query(collection(db, "holidays"), where("companyName", "==", company)))).docs.map((d) => d.data()); } catch { /* 무시 */ }
  const w = workWindow(me, leave);
  const now = kstNowMin();
  if (now < w.inFrom) return { ok: false, reason: "early", retryAt: w.inFrom };
  if (now > w.inUntil) return { ok: false, reason: "late" };
  if (isWeekend(today) || isHoliday(today, hol)) return { ok: false, reason: "weekend", weekend: true };
  await setDoc(ref, {
    uid, name: userName, date: today, month: today.slice(0, 7),
    status: leave || "출근", checkInTime: new Date().toISOString(), source, companyName: company,
    ...(leave ? { halfDay: leave } : {}),
  }, { merge: true });
  return { ok: true, leave };
}

// 자동 퇴근(출근지 반경 밖) — 퇴근시간 1시간 전부터만
export async function tryAutoCheckOut({ uid }) {
  const today = kstToday();
  const ref = doc(db, "attendance", `${today}_${uid}`);
  const ex = await getDoc(ref).catch(() => null);
  if (!ex?.exists()) return { ok: false };
  const d = ex.data();
  if (!d.checkInTime || d.checkOutTime) return { ok: false };
  const me = (await getDoc(doc(db, "users", uid)).catch(() => null))?.data() || {};
  const w = workWindow(me, HALF_LEAVES.includes(d.status) ? d.status : d.halfDay);
  if (kstNowMin() < w.outFrom) return { ok: false, reason: "too-early" };
  await setDoc(ref, { checkOutTime: new Date().toISOString(), checkOutSource: "auto_location" }, { merge: true });
  return { ok: true };
}

// 자동 퇴근 뒤 같은 날 다시 출근지 반경 안 — 퇴근 기록을 지운다(직접 누른 퇴근은 그대로)
export async function undoAutoCheckOut({ uid }) {
  const today = kstToday();
  const ref = doc(db, "attendance", `${today}_${uid}`);
  const ex = await getDoc(ref).catch(() => null);
  if (!ex?.exists()) return false;
  const d = ex.data();
  if (!d.checkOutTime || d.checkOutSource !== "auto_location") return false;
  await setDoc(ref, { checkOutTime: null, checkOutSource: null }, { merge: true });
  return true;
}

// 출근지 반경 안인지(직접 누르는 출근 요청·퇴근 버튼용) — { ok, dist, inM } · 위치를 못 얻으면 ok:false
export function checkInsideOffice(office, radiusM) {
  return new Promise((resolve) => {
    if (!office?.lat || !navigator.geolocation) { resolve({ ok: true, noOffice: true }); return; }
    navigator.geolocation.getCurrentPosition((p) => {
      const R = 6371000; const toR = (x) => (x * Math.PI) / 180;
      const dLat = toR(office.lat - p.coords.latitude); const dLng = toR(office.lng - p.coords.longitude);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(p.coords.latitude)) * Math.cos(toR(office.lat)) * Math.sin(dLng / 2) ** 2;
      const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
      resolve({ ok: dist <= radiusM, dist, inM: radiusM });
    }, () => resolve({ ok: false, error: true }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 });
  });
}
