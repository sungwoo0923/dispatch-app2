// ======================= src/dailyReportCore.js =======================
// 📊 2026-11-06 일일 경영 보고(DAILY REPORT) — 계산만 하는 순수 함수(화면·서버 푸시가 같은 규칙)
//  · 매출·수익은 기존 "경영 브리핑"(ExecSuite useYearDays → HomeDeck buildPastStats)과 같은 계산을 그대로 쓴다:
//    취소·운송사 전송(transport_transmit) 제외 오더의 청구운임 = 매출, 청구운임 − 기사운임 = 수익, 상차일 기준
//    (회사·권한 필터 + 고정노선 운송업체 설정(routeCarriers.makeIsCountable)을 거친 salesDispatchData를 받는다)
//  · 보고 기준일: 화~금 = 전 영업일, 월요일 = 금·토·일 3일 합산(+ 지난주 주간 요약), 공휴일은 건너뛴다
//  · functions/dailyReport.js에 같은 규칙(CommonJS 복사본)이 있다 — 바꾸면 둘 다 고친다
import { getNationalHolidayLabel } from "./attendanceUtils";
import { buildPastStats } from "./HomeDeck"; // 기존 경영 브리핑·홈과 같은 일별 매출·수익 계산

export const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export const toWon = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
export const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const kstHm = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16);
export const addDay = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const dowOf = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
export const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
export const isHolidayDay = (ymd) => !!getNationalHolidayLabel(ymd);
export const isBizDay = (ymd) => { const w = dowOf(ymd); return w !== 0 && w !== 6 && !isHolidayDay(ymd); };
export function prevBizDay(ymd) { let d = addDay(ymd, -1); for (let i = 0; i < 14 && !isBizDay(d); i++) d = addDay(d, -1); return d; }
export const md = (ymd) => `${Number(ymd.slice(5, 7))}.${ymd.slice(8, 10)}`;
export const mdDow = (ymd) => `${md(ymd)}(${DOW[dowOf(ymd)]})`;
export const dotDate = (ymd) => `${ymd.replace(/-/g, ".")} (${DOW[dowOf(ymd)]})`;
export const rangeDays = (a, b) => { const out = []; for (let d = a; d <= b && out.length < 400; d = addDay(d, 1)) out.push(d); return out; };

// ── 받기 설정 기본값 ──
export const BRIEF_SECTIONS = [
  ["kpi", "핵심 지표"], ["headline", "세 줄 요약"], ["chart30", "최근 30일 매출·수익률"], ["mtd", "월 목표 진척 · 누계"],
  ["staff", "담당자별 매출"], ["clients", "거래처 TOP 8 · 증감"], ["ops", "운영 현황 · 가동률 추이"], ["hr", "인력 현황"], ["cash", "자금 현황"],
];
export const SECTION_KEYS = BRIEF_SECTIONS.map(([k]) => k);
export const BRIEF_TIMES = (() => { const t = []; for (let h = 6; h <= 10; h++) { t.push(`${String(h).padStart(2, "0")}:00`); if (h < 10) t.push(`${String(h).padStart(2, "0")}:30`); } return t; })();
export const DEFAULT_PREFS = {
  time: "07:30", days: [1, 2, 3, 4, 5], weekend: false,
  monday: { merge3: true, weekly: true },
  channels: { popup: true, push: true, email: false },
  sections: Object.fromEntries(BRIEF_SECTIONS.map(([k]) => [k, true])),
};
export function mergePrefs(p) {
  const x = p || {};
  return {
    ...DEFAULT_PREFS, ...x,
    time: BRIEF_TIMES.includes(x.time) ? x.time : DEFAULT_PREFS.time,
    days: Array.isArray(x.days) ? x.days.filter((n) => n >= 0 && n <= 6) : DEFAULT_PREFS.days,
    monday: { ...DEFAULT_PREFS.monday, ...(x.monday || {}) },
    channels: { ...DEFAULT_PREFS.channels, ...(x.channels || {}) },
    sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, (x.sections || {})[k] !== false])), // 없어진 항목(예전 "주의가 필요한 일")은 버린다
  };
}
// 오늘이 받는 요일인지(공휴일은 건너뜀)
export function isReceiveDay(today, prefs) {
  const p = mergePrefs(prefs);
  const w = dowOf(today);
  if (isHolidayDay(today)) return false;
  if (w === 0 || w === 6) return !!p.weekend && p.days.includes(w);
  return p.days.includes(w);
}

// ── 보고 기준 기간 ──
//  기준 = 오늘 직전 영업일부터 어제까지(월요일 → 금·토·일). 월요일 "3일 합산"을 끄면 직전 영업일 하루만.
export function reportBasis(today, prefs) {
  const p = mergePrefs(prefs);
  const start = prevBizDay(today);
  let end = addDay(today, -1);
  if (end < start) end = start;
  if (p.monday.merge3 === false) end = start;
  const days = rangeDays(start, end);
  const multi = days.length > 1;
  const weekly = dowOf(today) === 1 && p.monday.weekly !== false;
  return {
    today, start, end, days, multi, weekly,
    prev1: multi ? days.map((d) => addDay(d, -7)) : [prevBizDay(start)], // 다일: 지난주 같은 기간 / 하루: 전 영업일
    prev7: days.map((d) => addDay(d, -7)), // 전주 같은 요일
    label: multi ? `${mdDow(start)}~${mdDow(end)} ${days.length}일 합산` : dotDate(start),
  };
}

// ── 오더 판정(매출관리와 같은 기준) ──
// (ExecSuite.isCancelled · HomeDeck.dateOf와 같은 판정)
export const isCancelledOrder = (r) => r?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(r?.상태);
export const dateOf = (r) => String(r?.상차일자 || r?.상차일 || r?.상차 || "").slice(0, 10);
export const saleOf = (r) => toWon(r?.청구운임);
export const profitOf = (r) => toWon(r?.청구운임) - toWon(r?.기사운임);
export const isDone = (r) => (r?.배차상태 || "") === "배차완료";
export const normPlate = (s) => String(s ?? "").replace(/\s+/g, "").toUpperCase();
const clientOf = (r) => String(r?.거래처명 || "").trim() || "미지정";
const placeShort = (s) => String(s || "").trim().split(/[\s(]/)[0] || "-";

// 날짜별 집계 { d: { sale, profit, done, all, cancel } } + 거래처별(날짜→거래처→[sale,profit,cnt])
//  sale·profit·all(건수)은 buildPastStats 결과 그대로(기존 경영 브리핑과 같은 숫자), done(배차완료)·cancel·거래처는 같은 오더로 덧붙인다
export function aggregate(rows) {
  const seen = new Set();
  const live = []; const byDay = {}; const byClientDay = {};
  for (const r of rows || []) {
    const d = dateOf(r); if (!d) continue;
    const k = r._id ? `${r.__col || ""}/${r._id}` : null;
    if (k) { if (seen.has(k)) continue; seen.add(k); }
    if (r.source === "transport_transmit") continue;
    const e = byDay[d] || (byDay[d] = { sale: 0, profit: 0, done: 0, all: 0, cancel: 0 });
    if (isCancelledOrder(r)) { e.cancel += 1; continue; }
    live.push(r);
    if (isDone(r)) e.done += 1;
    const c = clientOf(r);
    const cd = byClientDay[d] || (byClientDay[d] = {});
    const ce = cd[c] || (cd[c] = [0, 0, 0]);
    ce[0] += saleOf(r); ce[1] += profitOf(r); ce[2] += 1;
  }
  const past = buildPastStats(live, "");
  Object.entries(past.days).forEach(([d, v]) => { const e = byDay[d] || (byDay[d] = { sale: 0, profit: 0, done: 0, all: 0, cancel: 0 }); e.sale = v[0]; e.profit = v[1]; e.all = v[2]; });
  return { byDay, byClientDay };
}
const z = () => ({ sale: 0, profit: 0, done: 0, all: 0, cancel: 0 });
export function sumDays(byDay, days) {
  return days.reduce((a, d) => { const v = byDay[d]; if (!v) return a; return { sale: a.sale + v.sale, profit: a.profit + v.profit, done: a.done + v.done, all: a.all + v.all, cancel: a.cancel + v.cancel }; }, z());
}
export const marginOf = (x) => (x?.sale ? (x.profit / x.sale) * 100 : 0);
export const pctChange = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);

// 영업일 누계(주말·공휴일 매출은 다음 영업일에 합산 — 마지막에 남으면 마지막 영업일에)
export function bizCumulative(byDay, ym, upto) {
  const last = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const end = upto && upto < last ? upto : last;
  const daily = []; let pending = 0;
  for (let d = `${ym}-01`; d <= end; d = addDay(d, 1)) {
    pending += byDay[d]?.sale || 0;
    if (isBizDay(d)) { daily.push(pending); pending = 0; }
  }
  if (pending) { if (daily.length) daily[daily.length - 1] += pending; else daily.push(pending); }
  const cum = []; daily.reduce((a, v) => { a += v; cum.push(a); return a; }, 0);
  return cum;
}
export const bizDaysInMonth = (ym) => { const last = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate(); let n = 0; for (let i = 1; i <= last; i++) if (isBizDay(`${ym}-${String(i).padStart(2, "0")}`)) n += 1; return n; };
export const prevYm = (ym) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

// 보고서 숫자 전체(오더 기반) — 화면이 다른 데이터(근태·자금 등)를 더 붙인다
export function buildReport({ rows, basis, monthlyTarget = 0 }) {
  const { byDay, byClientDay } = aggregate(rows);
  const cur = sumDays(byDay, basis.days);
  const p1 = sumDays(byDay, basis.prev1);
  const p7 = sumDays(byDay, basis.prev7);
  // 14일 추이(기준 마지막 날까지)
  const spanDays = rangeDays(addDay(basis.end, -13), basis.end);
  const spark = (fn) => spanDays.map((d) => fn(byDay[d] || z()));
  // 30일 차트
  const d30 = rangeDays(addDay(basis.end, -29), basis.end).map((d) => { const v = byDay[d] || z(); return { d, sale: v.sale, margin: marginOf(v), off: !isBizDay(d), inBasis: basis.days.includes(d) }; });
  const wk = d30.filter((x) => !x.off && x.sale > 0);
  const weekdayAvg = wk.length ? wk.reduce((s, x) => s + x.sale, 0) / wk.length : 0;
  // 월 누계(영업일 기준)
  const ym = basis.end.slice(0, 7);
  const pym = prevYm(ym);
  const cumCur = bizCumulative(byDay, ym, basis.end);
  const cumPrev = bizCumulative(byDay, pym);
  const elapsed = cumCur.length;
  const mtd = cumCur[elapsed - 1] || 0;
  const prevSame = elapsed ? (cumPrev[Math.min(elapsed, cumPrev.length) - 1] || 0) : 0;
  const totalBiz = bizDaysInMonth(ym);
  const forecast = elapsed ? (mtd / elapsed) * totalBiz : 0;
  const mtdProfit = rangeDays(`${ym}-01`, basis.end).reduce((s, d) => s + (byDay[d]?.profit || 0), 0);
  // 거래처(기준 기간) — 증감은 최근 4주 같은 요일(같은 기간) 평균 대비
  const cl = {};
  basis.days.forEach((d) => Object.entries(byClientDay[d] || {}).forEach(([c, v]) => { const e = cl[c] || (cl[c] = [0, 0, 0]); e[0] += v[0]; e[1] += v[1]; e[2] += v[2]; }));
  const avg4 = (c) => { let s = 0; for (let w = 1; w <= 4; w++) basis.days.forEach((d) => { s += byClientDay[addDay(d, -7 * w)]?.[c]?.[0] || 0; }); return s / 4; };
  const clientsAll = Object.entries(cl).map(([n, v]) => ({ n, sale: v[0], profit: v[1], cnt: v[2], margin: v[0] ? (v[1] / v[0]) * 100 : 0, d: pctChange(v[0], avg4(n)) })).sort((a, b) => b.sale - a.sale);
  const top = clientsAll.slice(0, 8);
  // 노선 TOP 5 · 운행 차량
  const basisRows = (rows || []).filter((r) => basis.days.includes(dateOf(r)) && !isCancelledOrder(r) && r.source !== "transport_transmit");
  const routes = {};
  const plates = new Set();
  const lowOrders = [];
  basisRows.forEach((r) => {
    const k = `${placeShort(r.상차지명)}→${placeShort(r.하차지명)}`;
    routes[k] = (routes[k] || 0) + 1;
    const pl = normPlate(r.차량번호); if (pl) plates.add(pl);
    const s = saleOf(r); if (s > 0 && (profitOf(r) / s) * 100 < 5) lowOrders.push(r);
  });
  return {
    basis, cur, p1, p7, spanDays, byDay, byClientDay,
    spark: { sale: spark((v) => v.sale), profit: spark((v) => v.profit), margin: spark(marginOf), orders: spark((v) => v.all) },
    d30, weekdayAvg,
    month: { ym, pym, cumCur, cumPrev, elapsed, totalBiz, mtd, mtdProfit, prevSame, forecast, target: monthlyTarget, d: pctChange(mtd, prevSame) },
    clients: { top, all: clientsAll, total: cur.sale, topSum: top.reduce((s, c) => s + c.sale, 0), others: Math.max(0, clientsAll.length - top.length) },
    routes: Object.entries(routes).sort((a, b) => b[1] - a[1]).slice(0, 5),
    plates, lowOrders, basisRows,
  };
}

// ── 담당자별 매출(매출관리·홈 담당자 순위와 같은 오더 기준: 취소·운송사 전송 제외, 청구운임 = 매출, 청구운임 − 기사운임 = 수익) ──
//  staffOf(r) → 담당자 이름(등록한 직원 · src/detailGetters.js orderStaffNameRaw). 빈 값은 "미지정".
export function staffStats(rows, days, staffOf) {
  const set = new Set(days); const seen = new Set(); const m = {};
  for (const r of rows || []) {
    const d = dateOf(r); if (!set.has(d)) continue;
    const k = r._id ? `${r.__col || ""}/${r._id}` : null;
    if (k) { if (seen.has(k)) continue; seen.add(k); }
    if (r.source === "transport_transmit" || isCancelledOrder(r)) continue;
    const n = String(staffOf(r) || "").trim() || "미지정";
    const e = m[n] || (m[n] = { n, sale: 0, profit: 0, cnt: 0 });
    e.sale += saleOf(r); e.profit += profitOf(r); e.cnt += 1;
  }
  return m;
}
// 지금 기간 vs 전 기간 → 순위 목록(매출 순)
export function staffRanking(rows, curDays, prevDays, staffOf, hide = () => false) {
  const a = staffStats(rows, curDays, staffOf); const b = staffStats(rows, prevDays, staffOf);
  const list = Object.values(a).filter((x) => !hide(x.n)).map((x) => ({ ...x, margin: x.sale ? (x.profit / x.sale) * 100 : 0, prev: b[x.n]?.sale || 0, d: pctChange(x.sale, b[x.n]?.sale || 0) })).sort((p, q) => q.sale - p.sale);
  const total = list.reduce((s, x) => s + x.sale, 0);
  const prevTotal = Object.values(b).filter((x) => !hide(x.n)).reduce((s, x) => s + x.sale, 0);
  return { list, total, prevTotal };
}
// 이번 달 같은 기간 vs 전월 같은 기간(달력 날짜 1일~오늘 날짜) — 거래처 증감·담당자 월 비교용
export function monthSpans(end) {
  const ym = end.slice(0, 7); const pym = prevYm(ym);
  const day = Number(end.slice(8, 10));
  const pLast = new Date(Date.UTC(Number(pym.slice(0, 4)), Number(pym.slice(5, 7)), 0)).getUTCDate();
  return { cur: rangeDays(`${ym}-01`, end), prev: rangeDays(`${pym}-01`, `${pym}-${String(Math.min(day, pLast)).padStart(2, "0")}`) };
}
// 거래처 증감 — 이번 달 누계 vs 전월 같은 기간(금액 차이 순 · 늘어난 곳 / 줄어든 곳)
export function clientMoves(byClientDay, curDays, prevDays, n = 4) {
  const sum = (days) => { const m = {}; days.forEach((d) => Object.entries(byClientDay[d] || {}).forEach(([c, v]) => { m[c] = (m[c] || 0) + v[0]; })); return m; };
  const a = sum(curDays); const b = sum(prevDays);
  const all = [...new Set([...Object.keys(a), ...Object.keys(b)])].map((c) => ({ n: c, cur: a[c] || 0, prev: b[c] || 0, diff: (a[c] || 0) - (b[c] || 0), d: pctChange(a[c] || 0, b[c] || 0) }));
  return {
    up: all.filter((x) => x.diff > 0).sort((p, q) => q.diff - p.diff).slice(0, n),
    down: all.filter((x) => x.diff < 0).sort((p, q) => p.diff - q.diff).slice(0, n),
  };
}
// 미수금 나이(오래된 청구부터 수금된 것으로 보고 남은 청구를 경과일로 나눈다)
//  invoices: [{ d, amt }] · paid: 수금 합계 · 결과 { b30, b60, b90, over, oldest }
export function agingOf(invoices, paid, today) {
  let left = Math.max(0, paid || 0);
  const out = { b30: 0, b60: 0, b90: 0, over: 0, oldest: 0 };
  [...invoices].sort((x, y) => x.d.localeCompare(y.d)).forEach(({ d, amt }) => {
    const use = Math.min(left, amt); left -= use; const rest = amt - use; if (rest <= 0) return;
    const age = dayDiff(d, today); out.oldest = Math.max(out.oldest, age);
    if (age <= 30) out.b30 += rest; else if (age <= 60) out.b60 += rest; else if (age <= 90) out.b90 += rest; else out.over += rest;
  });
  return out;
}

// 지난주 주간 요약(월요일) — 지난주 월~일 vs 그 전주
export function weeklySummary(rows, today) {
  const { byDay, byClientDay } = aggregate(rows);
  const mon = addDay(today, -7);
  const w = rangeDays(mon, addDay(mon, 6));
  const pw = w.map((d) => addDay(d, -7));
  const a = sumDays(byDay, w); const b = sumDays(byDay, pw);
  const cNow = new Set(); const cPrev = new Set(); const cOld = new Set();
  w.forEach((d) => Object.keys(byClientDay[d] || {}).forEach((c) => cNow.add(c)));
  pw.forEach((d) => Object.keys(byClientDay[d] || {}).forEach((c) => cPrev.add(c)));
  for (let i = 8; i <= 35; i++) Object.keys(byClientDay[addDay(mon, -i)] || {}).forEach((c) => cOld.add(c));
  const fresh = [...cNow].filter((c) => !cPrev.has(c) && !cOld.has(c)).length;
  return {
    days: w.map((d, i) => ({ d, cur: byDay[d]?.sale || 0, prev: byDay[pw[i]]?.sale || 0 })),
    range: [w[0], w[6]], prevRange: [pw[0], pw[6]],
    cur: a, prev: b, fresh,
    over: w.slice(0, 5).filter((d, i) => (byDay[d]?.sale || 0) > (byDay[pw[i]]?.sale || 0)).length,
  };
}

// ── 숫자 표시 ──
export const man = (won) => Math.round((won || 0) / 1e4); // 만원
export const fmt = (n) => Math.round(n || 0).toLocaleString("en-US");
export function eok(won) { // 2억 6,310만
  const m = man(won); const e = Math.floor(Math.abs(m) / 1e4); const r = Math.abs(m) % 1e4;
  const s = m < 0 ? "−" : "";
  if (!e) return `${s}${fmt(r)}만`;
  return `${s}${e}억${r ? ` ${fmt(r)}만` : ""}`;
}
