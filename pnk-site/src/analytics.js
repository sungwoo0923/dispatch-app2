// ======================= pnk-site/src/analytics.js =======================
// 📊 2026-11-18 인트라넷 분석 계산 — 대시보드(Home) · 경영 분석(Insights)이 함께 쓴다. 화면 없이 숫자만 만든다.
//  모든 날짜는 한국 시간 기준 "YYYY-MM-DD"(pnkApi.ymd).
import { SALES_STAGES, tsMs, ymd } from "./pnkApi";

const DAY = 86400e3;
const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
export const toMin = (t) => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const minToHm = (m) => (m == null || !Number.isFinite(m) ? "–" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`);
const msOf = (v) => (typeof v === "number" ? v : tsMs(v) || 0);
const kstMin = (ms) => { const d = new Date(ms + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes(); };

// 최근 n일(오늘 포함, 오래된 날부터)
export function daysBack(n) {
  const out = []; const now = Date.now();
  for (let i = n - 1; i >= 0; i -= 1) { const k = ymd(new Date(now - i * DAY)); out.push({ key: k, label: `${Number(k.slice(5, 7))}/${Number(k.slice(8))}`, dow: WEEK_KO[new Date(`${k}T12:00:00Z`).getUTCDay()] }); }
  return out;
}
// 최근 n주(월요일 시작)
export function weeksBack(n) {
  const today = new Date(`${ymd()}T12:00:00Z`);
  const dow = (today.getUTCDay() + 6) % 7; // 월=0
  const mon = new Date(today.getTime() - dow * DAY);
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const s = new Date(mon.getTime() - i * 7 * DAY); const e = new Date(s.getTime() + 6 * DAY);
    const sk = s.toISOString().slice(0, 10), ek = e.toISOString().slice(0, 10);
    out.push({ start: sk, end: ek, label: `${Number(sk.slice(5, 7))}/${Number(sk.slice(8))}` });
  }
  return out;
}
// 최근 n개월 "YYYY-MM"
export function monthsBack(n) {
  const out = []; const t = ymd(); let y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  for (let i = 0; i < n; i += 1) { out.unshift(`${y}-${String(m).padStart(2, "0")}`); m -= 1; if (!m) { m = 12; y -= 1; } }
  return out;
}

// 업무 흐름 — 주별 등록 · 완료 · 완료율
export function taskFlow(tasks = [], weeks = weeksBack(8)) {
  return weeks.map((w) => {
    const created = tasks.filter((t) => { const k = ymd(new Date(msOf(t.createdAt))); return msOf(t.createdAt) && k >= w.start && k <= w.end; }).length;
    const done = tasks.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) >= w.start && ymd(new Date(t.doneAt)) <= w.end).length;
    return { ...w, 등록: created, 완료: done, rate: created ? Math.round((done / created) * 100) : null };
  });
}
// 날짜별 완료 수(작은 그래프용)
export const doneByDay = (tasks = [], days = daysBack(14)) => days.map((d) => tasks.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) === d.key).length);

// 근태 — 날짜별 정시 · 지각 · 재택/외근
export function attendanceDaily(att = [], days = daysBack(14)) {
  return days.map((d) => {
    const rows = att.filter((r) => r.date === d.key);
    return { ...d, 정시: rows.filter((r) => !r.late).length, 지각: rows.filter((r) => r.late).length, 원격: rows.filter((r) => r.place && r.place !== "office").length, total: rows.length };
  });
}
// 구성원별 근태(기간)
export function attendanceByMember(att = [], members = [], work = { start: "09:00" }) {
  return members.map((m) => {
    const rows = att.filter((r) => r.uid === m.uid || r.uid === m.id);
    const ins = rows.filter((r) => r.inAt).map((r) => kstMin(r.inAt));
    const works = rows.filter((r) => r.workMin > 0).map((r) => r.workMin);
    return {
      uid: m.uid || m.id, name: m.name || "", dept: m.dept || "", days: rows.length, late: rows.filter((r) => r.late).length,
      lateRate: rows.length ? Math.round((rows.filter((r) => r.late).length / rows.length) * 100) : 0,
      avgIn: ins.length ? ins.reduce((a, b) => a + b, 0) / ins.length : null,
      avgWork: works.length ? works.reduce((a, b) => a + b, 0) / works.length : null,
      remote: rows.filter((r) => r.place && r.place !== "office").length,
      startMin: toMin(work.start),
    };
  }).sort((a, b) => b.days - a.days);
}
// 오늘 팀 현황
export function teamToday(members = [], att = [], events = [], today = ymd()) {
  const onLeave = new Set(events.filter((e) => e.type === "leave" && e.date === today).map((e) => e.leaveUid));
  return members.map((m) => {
    const uid = m.uid || m.id; const r = att.find((x) => x.uid === uid && x.date === today);
    const status = r ? (r.outAt ? "off" : "in") : onLeave.has(uid) ? "leave" : "none";
    return { uid, name: m.name || "", title: m.title || "", dept: m.dept || "", status, late: !!r?.late, place: r?.place || "", inAt: r?.inAt || 0 };
  }).sort((a, b) => ["in", "off", "leave", "none"].indexOf(a.status) - ["in", "off", "leave", "none"].indexOf(b.status));
}

// 영업 — 단계별 건수 · 금액 · 가중 금액 · 전환율
export function pipeline(sales = []) {
  const stages = SALES_STAGES.filter((s) => s.key !== "lost").map((s) => {
    const rows = sales.filter((x) => x.stage === s.key);
    const value = rows.reduce((a, r) => a + (Number(r.value) || 0), 0);
    return { key: s.key, label: s.label, n: rows.length, value, weighted: value * s.p };
  });
  const closed = sales.filter((s) => ["won", "lost"].includes(s.stage));
  const won = sales.filter((s) => s.stage === "won");
  const open = sales.filter((s) => !["won", "lost"].includes(s.stage));
  return {
    stages,
    openN: open.length,
    openValue: open.reduce((a, r) => a + (Number(r.value) || 0), 0),
    weighted: stages.filter((s) => s.key !== "won").reduce((a, s) => a + s.weighted, 0),
    winRate: closed.length ? Math.round((won.length / closed.length) * 100) : 0,
    wonN: won.length,
  };
}
// 담당자별 영업
export const salesByOwner = (sales = []) => {
  const m = {};
  sales.forEach((s) => { const k = s.ownerName || "미지정"; m[k] = m[k] || { name: k, open: 0, won: 0, value: 0 }; if (s.stage === "won") m[k].won += 1; else if (s.stage !== "lost") { m[k].open += 1; m[k].value += Number(s.value) || 0; } });
  return Object.values(m).sort((a, b) => b.value - a.value);
};

// 손익 — 월별 매출 · 비용 · 이익 · 이익률
export function financeMonthly(rows = [], months = monthsBack(12)) {
  return months.map((mo) => {
    const r = rows.filter((x) => String(x.date || "").startsWith(mo));
    const inc = r.filter((x) => x.kind === "income").reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const exp = r.filter((x) => x.kind === "expense").reduce((a, x) => a + (Number(x.amount) || 0), 0);
    return { m: mo, label: `${Number(mo.slice(5))}월`, 매출: inc, 비용: exp, 이익: inc - exp, margin: inc ? Math.round(((inc - exp) / inc) * 100) : null };
  });
}
export const sumBy = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
// 비용 구성(기간)
export function expenseMix(rows = [], months = []) {
  const set = new Set(months); const m = {};
  rows.filter((x) => x.kind === "expense" && set.has(String(x.date || "").slice(0, 7))).forEach((x) => { const k = x.category || "기타"; m[k] = (m[k] || 0) + (Number(x.amount) || 0); });
  return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

// 구성원별 업무 생산성(기간)
export function taskByMember(tasks = [], members = [], sinceKey = "0000") {
  const today = ymd();
  return members.map((m) => {
    const uid = m.uid || m.id; const mine = tasks.filter((t) => t.assigneeUid === uid);
    const done = mine.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) >= sinceKey);
    const open = mine.filter((t) => t.status !== "done");
    const onTime = done.filter((t) => !t.due || ymd(new Date(t.doneAt)) <= t.due).length;
    return { uid, name: m.name || "", done: done.length, open: open.length, overdue: open.filter((t) => t.due && t.due < today).length, onTimeRate: done.length ? Math.round((onTime / done.length) * 100) : null };
  }).sort((a, b) => b.done - a.done);
}

// 숫자 줄여 쓰기(만원 · 억)
export function compactWon(n) {
  const v = Math.round(Number(n) || 0); const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(a >= 1e9 ? 0 : 1)}억`;
  if (a >= 1e4) return `${Math.round(v / 1e4).toLocaleString("ko-KR")}만`;
  return v.toLocaleString("ko-KR");
}

// 오늘의 한 줄 브리핑
export function briefLines({ approvals = 0, overdue = 0, todayEvents = 0, unread = 0, attIn = 0, members = 0, followUps = 0 }) {
  const out = [];
  if (approvals) out.push(`결재할 문서 ${approvals}건이 기다리고 있어요`);
  if (overdue) out.push(`기한이 지난 업무 ${overdue}건`);
  if (followUps) out.push(`오늘 연락할 영업 ${followUps}곳`);
  if (todayEvents) out.push(`오늘 일정 ${todayEvents}건`);
  if (unread) out.push(`안 읽은 메일 ${unread}통`);
  out.push(`팀 출근 ${attIn} / ${members}명`);
  return out;
}
