// ======================= functions/driverDutyCore.mjs =======================
// 🚚 2026-11-09 기사 근무 계산(순수 함수 — 기사앱·PC 관제·서버 함수가 같이 쓴다)
//  1) 주행거리(키로수) 누적: 기사·운송사가 처음 넣은 계기판 키로수(drivers/{uid}.care.odometer)에
//     출근~퇴근 사이 GPS 이동거리(drivers.totalDistance)를 퇴근할 때 더한다.
//     같은 날 두 번 더하지 않도록 drivers.odoAccum = { "YYYY-MM-DD": km } 에 기록한다.
//  2) 퇴근은 기사가 직접 누른다(자동 퇴근·퇴근시간 고정 없음) — 운송사는 관제 [퇴근처리]로 대신 처리할 수 있다(src/driverDuty.js).
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

const kst = (ms) => new Date(ms + 9 * 3600e3);
export const kstYmd = (ms) => kst(ms).toISOString().slice(0, 10);
