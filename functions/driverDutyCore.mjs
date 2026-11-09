// ======================= functions/driverDutyCore.mjs =======================
// 🚚 2026-11-09 기사 근무 계산(순수 함수 — 기사앱·PC 관제·서버 함수가 같이 쓴다)
//  1) 주행거리(키로수) 누적: 기사·운송사가 처음 넣은 계기판 키로수(drivers/{uid}.care.odometer)에
//     출근~퇴근 사이 GPS 이동거리(drivers.totalDistance)를 퇴근할 때 더한다.
//     같은 날 두 번 더하지 않도록 drivers.odoAccum = { "YYYY-MM-DD": km } 에 기록한다.
//  2) 퇴근 미처리 대응: 퇴근시간(drivers.퇴근시간, 없으면 19:00)이 지났는데 아직 근무 중이면
//     +1시간 → 기사에게 "퇴근 처리할까요?" 알림, +1시간 & 30분 넘게 이동 없음 → 관제에 "퇴근 미처리" 표시,
//     날짜가 바뀌면(자정 지나 서버 · 다음날 첫 접속 기사앱) 마지막 이동 시각으로 자동 퇴근.
export const DEFAULT_END_HM = "19:00";
export const REMIND_AFTER_MIN = 60; // 퇴근시간 + 60분이 지나면 알림
export const IDLE_MIN = 30; // 이만큼 이동이 없으면 "퇴근 미처리" 표시
export const MAX_DAY_KM = 1500; // 하루 이 이상은 GPS 오류로 보고 누적하지 않는다

const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// 근무 중인가(출근·운행 상태 · 오늘 최종퇴근 전)
//  "대기"는 출근 전(기사앱 수락 시 자동 출근 판단과 같은 기준)
const OFF = new Set(["", "퇴근", "휴차", "대기"]);
export function isOnDuty(d = {}) {
  const st = String(d.status || "").trim();
  if (d.isFinalCheckout === true) return false;
  if (d.mainStatus === "휴차") return false;
  return !OFF.has(st);
}

// 퇴근할 때 누적 — 이미 그날 더했으면 null. manual = 기사가 퇴근 때 계기판 값을 직접 넣은 경우(값은 그 값, 기록만 남김)
export function accumulateOdometer({ odometer = 0, odoAccum = {} } = {}, date, distKm, { manual = null } = {}) {
  const day = String(date || "").slice(0, 10);
  if (!day) return null;
  const acc = odoAccum && typeof odoAccum === "object" ? odoAccum : {};
  if (Object.prototype.hasOwnProperty.call(acc, day)) return null;
  const dist = r1(distKm);
  const base = Number(odometer) || 0;
  if (manual != null && Number(manual) > 0) return { odometer: Math.round(Number(manual)), add: 0, day, record: dist, manual: true };
  if (!base) return null; // 처음 키로수가 아직 없으면 누적할 기준이 없다
  if (!(dist > 0) || dist > MAX_DAY_KM) return { odometer: base, add: 0, day, record: dist > MAX_DAY_KM ? -dist : 0 };
  return { odometer: Math.round(base + dist), add: dist, day, record: dist };
}

// 지금 보여 줄 누적 키로수(운행 중이면 오늘 이동거리를 더해서) — 운송사 화면 표시용
export function liveOdometer(d = {}) {
  const base = Number(d.care?.odometer) || 0;
  if (!base) return 0;
  const today = Number(d.totalDistance) || 0;
  return Math.round(base + (isOnDuty(d) && today > 0 && today <= MAX_DAY_KM ? today : 0));
}

const hmMin = (v) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const kst = (ms) => new Date(ms + 9 * 3600e3);
export const kstYmd = (ms) => kst(ms).toISOString().slice(0, 10);

// 퇴근 미처리 판단 — { stage: "none" | "remind" | "flag" | "auto", checkoutAt(ms), date }
//  nowMs·lastMoveMs: 밀리초. workDate: 근무 시작한 날(YYYY-MM-DD)
export function missedCheckoutPlan(d = {}, nowMs = Date.now(), lastMoveMs = 0) {
  if (!isOnDuty(d)) return { stage: "none" };
  const today = kstYmd(nowMs);
  const workDate = String(d.workDate || "").slice(0, 10) || today;
  const endMin = hmMin(d.퇴근시간) ?? hmMin(DEFAULT_END_HM);
  const endMs = Date.parse(`${workDate}T${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}:00+09:00`);
  const last = Number(lastMoveMs) || 0;
  // 자정을 넘겨 일하는 중(최근 30분 안에 움직임)이면 자동 퇴근하지 않는다(야간 운행) — 멈춘 뒤 다음 확인 때 처리
  if (workDate < today && last && nowMs - last < IDLE_MIN * 60e3) return { stage: "none", night: true };
  if (workDate < today) {
    // 날짜가 바뀜 → 자동 퇴근. 시각은 마지막 이동(근무일 안), 없으면 그날 퇴근시간
    const dayEnd = Date.parse(`${workDate}T23:59:00+09:00`);
    const at = last && kstYmd(last) === workDate ? Math.min(last, dayEnd) : Math.min(endMs, dayEnd);
    return { stage: "auto", checkoutAt: at, date: workDate };
  }
  if (nowMs < endMs + REMIND_AFTER_MIN * 60e3) return { stage: "none" };
  const idle = !last || nowMs - last >= IDLE_MIN * 60e3;
  return { stage: idle ? "flag" : "remind", date: workDate, idleMin: last ? Math.floor((nowMs - last) / 60e3) : null };
}
