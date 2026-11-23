// 출근기록부 공용 유틸
export const LEAVE_TYPE_LABEL = {
  "휴가": "연차", "오전반차": "오전반차", "오후반차": "오후반차",
  "외근": "외근", "병가": "병가", "경조사": "경조사", "조퇴": "조퇴",
};

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isWeekend(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  return day === 0 || day === 6;
}

// 🗓 2026-11-23 근무 요일 — 회사 전체(companySettings.workWeekdays) + 직원별(users.workWeekdays, 비어 있으면 회사 설정)
//  요일 번호: 0 일 · 1 월 · … · 6 토. 아무것도 안 정한 회사는 지금처럼 월~금.
//  · 근무 요일이 아닌 날 = 쉬는 날(출근기록부 "휴무" · 미출근으로 안 셈 · 자동 출근 안 함 · 연차 일수에서 뺌)
//  · 쉬는 날 나와서 일하면 "휴일근무"(attendance.offDayWork) — 근무 요일이 원래 그 날인 직원(예: 월~토)은 평소 출근
export const DEFAULT_WORK_WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 화면에는 월요일부터
export function normWeekdays(v) {
  if (!Array.isArray(v)) return null;
  const out = [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
  return out.length ? out.sort((a, b) => a - b) : null;
}
// 직원 한 명의 근무 요일 — 직원 설정 → 회사 설정 → 월~금
export function workWeekdaysOf(emp, companyWeekdays) {
  return normWeekdays(emp?.workWeekdays) || normWeekdays(companyWeekdays) || DEFAULT_WORK_WEEKDAYS;
}
export const dayOfWeek = (dateStr) => new Date(dateStr + "T00:00:00").getDay();
// 근무 요일이 아닌 날(공휴일은 따로 isHoliday)
export function isRestDay(dateStr, weekdays) {
  return !(normWeekdays(weekdays) || DEFAULT_WORK_WEEKDAYS).includes(dayOfWeek(dateStr));
}
// 쉬는 날 = 근무 요일이 아님 또는 공휴일(회사 휴일 포함)
export function isOffDay(dateStr, weekdays, holidays) {
  return isRestDay(dateStr, weekdays) || isHoliday(dateStr, holidays);
}
// [1,2,3,4,5] → "월~금" · [1,2,3,4,5,6] → "월~토" · [0,6] → "토·일" · [1,3,5] → "월·수·금"
export function weekdaysText(weekdays) {
  const w = normWeekdays(weekdays) || DEFAULT_WORK_WEEKDAYS;
  const ord = WEEKDAY_ORDER.filter((d) => w.includes(d));
  if (ord.length === 7) return "매일";
  // 월요일부터 이어지는 묶음이면 "월~토"
  const idx = ord.map((d) => WEEKDAY_ORDER.indexOf(d));
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (run && ord.length >= 3) return `${WEEKDAY_NAMES[ord[0]]}~${WEEKDAY_NAMES[ord[ord.length - 1]]}`;
  return ord.map((d) => WEEKDAY_NAMES[d]).join("·");
}
// 🧠 출근 기록으로 근무 요일 추천 — 최근 기록(records: [{ date, status }])에서 요일별 출근 비율이 절반 이상인 요일
//  · 기간 안에 그 요일이 몇 번 있었는지(공휴일 제외)를 분모로 센다 · 출근 기록이 4일 미만이면 추천하지 않음(null)
const WORK_STATUSES = ["출근", "외근", "조퇴"];
export function suggestWeekdays(records = [], { from, to, holidays = [], minRate = 0.5 } = {}) {
  if (!from || !to) return null;
  const worked = new Set((records || []).filter((r) => r?.date >= from && r?.date <= to && WORK_STATUSES.includes(r.status)).map((r) => r.date));
  if (worked.size < 4) return null;
  const total = [0, 0, 0, 0, 0, 0, 0], hit = [0, 0, 0, 0, 0, 0, 0];
  const a = new Date(from + "T00:00:00"), b = new Date(to + "T00:00:00");
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (isHoliday(ds, holidays)) continue;
    total[d.getDay()] += 1; if (worked.has(ds)) hit[d.getDay()] += 1;
  }
  const rate = total.map((t, i) => (t ? hit[i] / t : 0));
  const days = normWeekdays(rate.map((r, i) => (r >= minRate ? i : -1)).filter((i) => i >= 0));
  return days ? { weekdays: days, rate, workedDays: worked.size } : null;
}
// 이번 달 회사 기준 쉬는 날에 출근한 직원 — 요일별 { 요일: [uid…] } (회사 기준을 따르는 직원만)
export function offDayWorkersByWeekday(records = [], employees = [], companyWeekdays, holidays = []) {
  const follow = new Set((employees || []).filter((e) => !normWeekdays(e.workWeekdays)).map((e) => e.uid));
  const out = {};
  (records || []).forEach((r) => {
    if (!follow.has(r.uid) || !WORK_STATUSES.includes(r.status) || !r.date) return;
    if (isHoliday(r.date, holidays) || !isRestDay(r.date, companyWeekdays)) return;
    const d = dayOfWeek(r.date);
    (out[d] = out[d] || new Set()).add(r.uid);
  });
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}
// 한 달 근무일 수(근무 요일 · 공휴일 제외) — "이번 달 근무일 ○일" 미리보기
export function monthWorkDays(ym, weekdays, holidays = []) {
  const [y, m] = String(ym).split("-").map(Number);
  if (!y || !m) return 0;
  const last = new Date(y, m, 0).getDate();
  return workDaysBetween(`${ym}-01`, `${ym}-${String(last).padStart(2, "0")}`, weekdays, holidays);
}
// 기간 안의 근무일 수(근무 요일 · 공휴일 제외) — 휴가 일수 계산
export function workDaysBetween(startStr, endStr, weekdays, holidays) {
  if (!startStr) return 0;
  const a = new Date(startStr + "T00:00:00"); const b = new Date((endStr || startStr) + "T00:00:00");
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let n = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!isOffDay(ds, weekdays, holidays)) n += 1;
  }
  return n;
}

// 이름 끝의 숫자(여분계정 구분용, 예: "박성우2")를 제거하고 공백을 정리해 동일인 여부를 비교하기 위한 정규화
function normalizeName(name) {
  return (name || "").replace(/\s+/g, "").replace(/\d+$/, "");
}

// 결재자 목록을 보고 해당 일정이 실제로 "승인 완료" 상태인지 판단
// 결재자가 1명이라도 지정돼 있으면 전원이 승인(approved)해야 승인 완료로 간주하고,
// 결재자가 아예 없는 과거 데이터는(결재 절차 도입 전 등록분) 반려되지 않은 이상 그대로 인정한다.
export function isScheduleApproved(s) {
  const approvers = s.approvers || (s.approverUid ? [{ uid: s.approverUid, status: s.approvalStatus || "pending" }] : []);
  if (approvers.length === 0) return true;
  if (approvers.some(a => a.status === "rejected")) return false;
  return approvers.every(a => a.status === "approved");
}

// 해당 날짜에 등록된 휴가/외근 일정 중 승인 완료된 건이 있으면 그 유형 라벨을 반환
// authorUid가 일치하지 않더라도(관리자가 대신 등록해 authorUid가 어긋난 과거 데이터 등) name이 동일인으로 판단되면 매칭
export function findApprovedLeaveForDate(schedules, uid, dateStr, employeeName) {
  const normEmpName = normalizeName(employeeName);
  const hit = (schedules || []).find(s => {
    const sameUid = !!uid && s.authorUid === uid;
    const sameName = !!normEmpName && normalizeName(s.name) === normEmpName;
    if (!sameUid && !sameName) return false;
    if (!isScheduleApproved(s)) return false;
    const start = s.start, end = s.end || s.start;
    if (!start) return false;
    return dateStr >= start && dateStr <= end;
  });
  return hit ? (LEAVE_TYPE_LABEL[hit.type] || hit.type) : null;
}

// ⭐ 2026-10-27 — 출근·연차·외근 등이 한눈에 구분되도록 상태마다 색을 다르게 둔다(프로그램 전체 남색 규칙의 예외).
//    PC·모바일 테마의 "색 → 남색" 변환을 타지 않도록 색을 직접 지정(hex)한다. 채도를 낮춘 고급스러운 톤.
export const ATTENDANCE_STATUS_COLOR = {
  "출근": "bg-[#1B2B4B] text-white",
  "휴무": "bg-[#EEF1F6] text-[#9AA9C3]",
  "공휴일": "bg-[#E2E6EE] text-[#6B778C]",
  "연차": "bg-[#7C5CC4] text-white",
  "오전반차": "bg-[#C98A1B] text-white",
  "오후반차": "bg-[#A8740F] text-white",
  "외근": "bg-[#2F7FD8] text-white",
  "병가": "bg-[#C2453D] text-white",
  "경조사": "bg-[#2E8B6B] text-white",
  "조퇴": "bg-[#D06A2B] text-white",
  "휴직": "bg-[#5B6B85] text-white",
  "육아휴직": "bg-[#3E9C8F] text-white",
  "출산휴가": "bg-[#C0569A] text-white",
};

// 대한민국 법정공휴일(자동) — 회사가 별도로 지정하지 않아도 기본 반영됨.
// 고정일은 매년 자동 계산, 음력 기반 연휴(설날/추석/부처님오신날) 및 대체공휴일은 연도별로 등재.
// 회사별 추가 휴일(선거일 등)은 별도 Firestore "holidays" 컬렉션으로 보강.
export const KR_NATIONAL_HOLIDAYS = {
  2025: [
    ["2025-01-01", "신정"],
    ["2025-01-27", "임시공휴일"],
    ["2025-01-28", "설날연휴"],
    ["2025-01-29", "설날"],
    ["2025-01-30", "설날연휴"],
    ["2025-03-01", "삼일절"],
    ["2025-03-03", "대체공휴일(삼일절)"],
    ["2025-05-05", "어린이날·부처님오신날"],
    ["2025-05-06", "대체공휴일"],
    ["2025-06-06", "현충일"],
    ["2025-08-15", "광복절"],
    ["2025-10-03", "개천절"],
    ["2025-10-05", "추석연휴"],
    ["2025-10-06", "추석"],
    ["2025-10-07", "추석연휴"],
    ["2025-10-08", "대체공휴일(추석)"],
    ["2025-10-09", "한글날"],
    ["2025-12-25", "성탄절"],
  ],
  2026: [
    ["2026-01-01", "신정"],
    ["2026-02-16", "설날연휴"],
    ["2026-02-17", "설날"],
    ["2026-02-18", "설날연휴"],
    ["2026-03-01", "삼일절"],
    ["2026-03-02", "대체공휴일(삼일절)"],
    ["2026-05-05", "어린이날"],
    ["2026-05-24", "부처님오신날"],
    ["2026-05-25", "대체공휴일(부처님오신날)"],
    ["2026-06-03", "지방선거일"],
    ["2026-06-06", "현충일"],
    ["2026-07-17", "제헌절"],
    ["2026-08-15", "광복절"],
    ["2026-08-17", "대체공휴일(광복절)"],
    ["2026-09-24", "추석연휴"],
    ["2026-09-25", "추석"],
    ["2026-09-26", "추석연휴"],
    ["2026-10-03", "개천절"],
    ["2026-10-05", "대체공휴일(개천절)"],
    ["2026-10-09", "한글날"],
    ["2026-12-25", "성탄절"],
  ],
  // ⭐ 2026-11-01 2027·2028 설날·부처님오신날·추석·대체공휴일 보강(예전엔 2027이 양력 고정일만 있었다)
  2027: [
    ["2027-01-01", "신정"],
    ["2027-02-06", "설날연휴"],
    ["2027-02-07", "설날"],
    ["2027-02-08", "설날연휴"],
    ["2027-02-09", "대체공휴일(설날)"],
    ["2027-03-01", "삼일절"],
    ["2027-05-05", "어린이날"],
    ["2027-05-13", "부처님오신날"],
    ["2027-06-06", "현충일"],
    ["2027-07-17", "제헌절"],
    ["2027-08-15", "광복절"],
    ["2027-08-16", "대체공휴일(광복절)"],
    ["2027-09-14", "추석연휴"],
    ["2027-09-15", "추석"],
    ["2027-09-16", "추석연휴"],
    ["2027-10-03", "개천절"],
    ["2027-10-04", "대체공휴일(개천절)"],
    ["2027-10-09", "한글날"],
    ["2027-10-11", "대체공휴일(한글날)"],
    ["2027-12-25", "성탄절"],
    ["2027-12-27", "대체공휴일(성탄절)"],
  ],
  2028: [
    ["2028-01-01", "신정"],
    ["2028-01-26", "설날연휴"],
    ["2028-01-27", "설날"],
    ["2028-01-28", "설날연휴"],
    ["2028-03-01", "삼일절"],
    ["2028-04-12", "국회의원선거일"],
    ["2028-05-02", "부처님오신날"],
    ["2028-05-05", "어린이날"],
    ["2028-06-06", "현충일"],
    ["2028-07-17", "제헌절"],
    ["2028-08-15", "광복절"],
    ["2028-10-02", "추석연휴"],
    ["2028-10-03", "추석·개천절"],
    ["2028-10-04", "추석연휴"],
    ["2028-10-05", "대체공휴일(추석)"],
    ["2028-10-09", "한글날"],
    ["2028-12-25", "성탄절"],
  ],
};

export function getNationalHolidayLabel(dateStr) {
  const year = Number((dateStr || "").slice(0, 4));
  const list = KR_NATIONAL_HOLIDAYS[year];
  if (!list) return null;
  const hit = list.find(([d]) => d === dateStr);
  return hit ? hit[1] : null;
}

// 공휴일 여부 — 대한민국 법정공휴일(자동) + 회사 지정 휴일(holidays: [{date:"YYYY-MM-DD", label}]) 모두 포함
export function isHoliday(dateStr, holidays) {
  if (getNationalHolidayLabel(dateStr)) return true;
  return (holidays || []).some(h => h.date === dateStr);
}

export function getHolidayLabel(dateStr, holidays) {
  const national = getNationalHolidayLabel(dateStr);
  if (national) return national;
  const custom = (holidays || []).find(h => h.date === dateStr);
  return custom ? custom.label : null;
}

// 🔗 2026-11-01 전자결재 근태(승인분) → 출근기록부·근태 현황 상태
//  연차휴가·반차·병가·외근·출장·경조사·조퇴 + 육아휴직·출산휴가. 같은 날 여러 건이면 먼저 찾은 것.
const inRange = (ds, p) => !!p?.start && ds >= p.start && ds <= (p.end || p.start);
export function approvalLeaveOn(approvals, uid, ds) {
  for (const a of approvals || []) {
    if (a.status !== "approved" || a.drafterUid !== uid || a.cat !== "leave") continue;
    const d = a.data || {};
    switch (a.form) {
      case "annual": if (inRange(ds, d.period)) return "연차"; break;
      case "half": if (d.date === ds) return String(d.ampm || "").includes("오후") ? "오후반차" : "오전반차"; break;
      case "sick": if (inRange(ds, d.period)) return "병가"; break;
      case "outside": if (d.date === ds) return "외근"; break;
      case "trip": if (inRange(ds, d.period)) return "외근"; break;
      case "family": if (inRange(ds, d.period)) return "경조사"; break;
      case "early": if (d.date === ds && d.kind === "조퇴") return "조퇴"; break;
      case "parental": if (d.kind !== "육아기 근로시간 단축" && inRange(ds, d.period)) return "육아휴직"; break;
      case "maternity": if (inRange(ds, d.period)) return d.kind === "배우자 출산휴가" ? "경조사" : "출산휴가"; break;
      default: break;
    }
  }
  return null;
}
// 인사 정보의 휴직(휴직·육아휴직·출산휴가 + 기간) → 그 날 상태
export function hrLeaveOn(user, ds) {
  const st = user?.employmentStatus;
  if (!["휴직", "육아휴직", "출산휴가"].includes(st)) return null;
  const lv = user.leave || {};
  if (lv.from && ds < lv.from) return null;
  if (lv.to && ds > lv.to) return null;
  return st;
}


// 🕘 2026-11-16 출퇴근이 어떻게 기록됐는지 — 출근기록부 팝업(PC · 모바일)에 "자동 출근 · 직접 누름 · 관리자 수정"으로 보여 준다
//  source: auto · auto_location · auto_mobile_location(출근지 반경 자동) / manual · manual_mobile(직접 누름 · 출근기록부 수정) / leave(휴가)
export function attendanceSourceText(rec) {
  if (!rec) return { in: "", out: "" };
  const src = String(rec.source || "");
  const edited = !!rec.editedBy || !!rec.editedByName;
  const inText = !rec.checkInTime && !rec.status ? ""
    : edited && src.startsWith("manual") ? `관리자 수정${rec.editedByName ? `(${rec.editedByName})` : ""}`
    : src.startsWith("auto") ? (src.includes("mobile") ? "자동 출근 · 휴대폰 위치" : "자동 출근 · 위치")
    : src === "manual_mobile" ? "직접 누름 · 휴대폰"
    : src === "manual" ? "직접 누름"
    : src === "leave" ? "휴가 기록"
    : src === "request" || rec.approvedBy ? "출근 요청 승인"
    : rec.checkInTime ? "기록 방법 모름(예전 기록)" : "";
  const osrc = String(rec.checkOutSource || "");
  const outText = !rec.checkOutTime ? "" : osrc.startsWith("auto") ? "자동 퇴근 · 위치" : osrc === "manual" ? (edited ? "직접 누름 · 수정" : "직접 누름") : "기록 방법 모름(예전 기록)";
  return { in: inText, out: outText };
}
