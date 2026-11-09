// ======================= functions/helpNeededCore.mjs =======================
// 🆘 2026-11-09 "도움 필요" — 가입(승인) 후 7일 안 신규 운송사 중 쓰기 시작을 못 한 곳을 찾는다(관리자센터 화면 · 서버 공용 순수 함수)
//  · 시작일: companyPlans.since(승인 때 기록, "YYYY-MM-DD") → 없으면 가입 신청일(appliedAt ms)
//  · 신호: 오더 0건 · 기사 0명 · 직원 1명뿐(가입 2일째부터) — 하나라도 있으면 "도움 필요"
//  · [확인함]을 누른 회사는 숨긴다(acks[회사] = 누른 시각 · 7일 창 안에서만 의미)
export const HELP_WINDOW_DAYS = 7;
const DAY = 86400000;

// "YYYY-MM-DD"(KST 날짜) → 그날 0시(KST) ms
export function kstDayStartMs(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ""));
  if (!m) return 0;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 9 * 3600e3;
}

export function startMsOf(c) {
  const since = kstDayStartMs(c?.plan?.since || c?.since);
  return since || Number(c?.appliedAt) || 0;
}

// c: { name, staff, drivers, totalOrders, m:{cnt}, plan:{since}, appliedAt }
// → null | { day, reasons:[...], orders, drivers, staff }
export function helpNeededOf(c, now = Date.now(), acks = {}) {
  if (!c || c.kind === "shipper") return null;
  const start = startMsOf(c);
  if (!start || start > now) return null;
  const kstNow = now + 9 * 3600e3, kstStart = start + 9 * 3600e3;
  const day = Math.floor(kstNow / DAY) - Math.floor(kstStart / DAY) + 1; // 가입 당일 = 1일째
  if (day < 1 || day > HELP_WINDOW_DAYS) return null;
  if (acks && acks[c.name] && Number(acks[c.name]) >= start) return null;
  const orders = Math.max(Number(c.totalOrders) || 0, Number(c.m?.cnt) || 0);
  const drivers = Number(c.drivers) || 0;
  const staff = Number(c.staff) || 0;
  const reasons = [];
  if (orders === 0) reasons.push("오더 0건");
  if (drivers === 0) reasons.push("기사 0명");
  if (staff <= 1 && day >= 2) reasons.push(`직원 ${staff}명`);
  if (!reasons.length) return null;
  return { day, reasons, orders, drivers, staff };
}

export function helpNeededList(companies = [], now = Date.now(), acks = {}) {
  return (companies || []).map((c) => ({ c, h: helpNeededOf(c, now, acks) })).filter((x) => x.h)
    .sort((a, b) => b.h.reasons.length - a.h.reasons.length || b.h.day - a.h.day);
}
