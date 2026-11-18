// ======================= src/freight/freightFare.js =======================
// 💰 2026-11-18 컨테이너 · 해상 · 항공 운임조회 — 같은 구간의 지난 건 청구 · 지급 운임을 찾는다(화면 없이 숫자만)
//  컨테이너: 픽업지 · 작업지(도어) · 규격(20/40) — 같은 작업지면 픽업지가 달라도 "비슷한 건"
//  해상: 선적항(POL) · 도착항(POD) · 형태(FCL/LCL) — FCL은 규격도 본다
//  항공: 출발 · 도착 공항 — 운임중량 kg당 단가도 낸다
import { legPnl, cntrType } from "./freightCore.js";

const norm = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
const ft = (size) => (cntrType(size)?.ft >= 40 ? "40" : cntrType(size) ? "20" : "");

// 이 건과 같은 구간인지 — 2 = 같은 구간 · 1 = 비슷한 구간 · 0 = 아님
export function routeScore(a, b) {
  if (!a || !b || a.mode !== b.mode) return 0;
  if (a.mode === "container") {
    const door = norm(a.doorPlace) && norm(a.doorPlace) === norm(b.doorPlace);
    const pick = norm(a.pickupPlace) && norm(a.pickupPlace) === norm(b.pickupPlace);
    const size = !a.size || ft(a.size) === ft(b.size);
    if (door && pick && size) return 2;
    if (door && size) return 1;
    return 0;
  }
  if (a.mode === "sea") {
    const lane = a.pol && a.pod && a.pol === b.pol && a.pod === b.pod;
    if (!lane) return 0;
    return !a.seaType || a.seaType === b.seaType ? 2 : 1;
  }
  if (a.mode === "air") return a.dep && a.arr && a.dep === b.dep && a.arr === b.arr ? 2 : 0;
  return 0;
}
// 조건(입력 중인 건)에 맞는 지난 건 — 금액이 있는 것만, 같은 구간 먼저 · 최근 먼저
export function similarJobs(cond, jobs = [], { exclude = "", limit = 50 } = {}) {
  return jobs
    .filter((j) => j.id !== exclude)
    .map((j) => ({ j, score: routeScore(cond, j), p: legPnl(j) }))
    .filter((x) => x.score > 0 && (x.p.sale > 0 || x.p.cost > 0))
    .sort((a, b) => b.score - a.score || (b.j.createdAtMs || 0) - (a.j.createdAtMs || 0))
    .slice(0, limit);
}
// 최저 · 평균 · 최고(청구 · 지급) — 항공은 kg당 단가도
export function fareStats(list) {
  const pick = (k) => list.map((x) => x.p[k]).filter((v) => v > 0);
  const st = (a) => (a.length ? { min: Math.min(...a), max: Math.max(...a), avg: Math.round(a.reduce((s, v) => s + v, 0) / a.length), n: a.length } : null);
  const perKg = list.filter((x) => x.j.mode === "air" && Number(x.j.cw) > 0 && x.p.sale > 0).map((x) => Math.round(x.p.sale / Number(x.j.cw)));
  return { sale: st(pick("sale")), cost: st(pick("cost")), perKg: st(perKg) };
}
// 구간 이름(화면 표시)
export function routeText(j) {
  if (!j) return "";
  if (j.mode === "container") return [j.pickupPlace, j.doorPlace].filter(Boolean).join(" → ") + (j.size ? ` · ${j.size}` : "");
  if (j.mode === "sea") return j.pol && j.pod ? `${j.pol} → ${j.pod}${j.seaType ? ` · ${j.seaType}` : ""}` : "";
  if (j.mode === "air") return j.dep && j.arr ? `${j.dep} → ${j.arr}` : "";
  return "";
}
// 운임조회 화면 — 구간별로 묶어 건수 · 평균 청구 · 평균 지급 · 평균 수익
export function laneTable(jobs = [], mode) {
  const m = new Map();
  jobs.filter((j) => j.mode === mode).forEach((j) => {
    const p = legPnl(j); if (!(p.sale > 0 || p.cost > 0)) return;
    const k = mode === "container" ? `${norm(j.pickupPlace)}|${norm(j.doorPlace)}|${ft(j.size)}` : mode === "sea" ? `${j.pol}|${j.pod}|${j.seaType || ""}` : `${j.dep}|${j.arr}`;
    const g = m.get(k) || { key: k, sample: j, n: 0, sale: 0, cost: 0, last: 0, cw: 0 };
    g.n += 1; g.sale += p.sale; g.cost += p.cost; g.cw += Number(j.cw) || 0;
    if ((j.createdAtMs || 0) > g.last) { g.last = j.createdAtMs || 0; g.sample = j; }
    m.set(k, g);
  });
  return [...m.values()].map((g) => ({ ...g, avgSale: Math.round(g.sale / g.n), avgCost: Math.round(g.cost / g.n), avgProfit: Math.round((g.sale - g.cost) / g.n), perKg: g.cw > 0 ? Math.round(g.sale / g.cw) : 0 }))
    .sort((a, b) => b.n - a.n || b.last - a.last);
}
