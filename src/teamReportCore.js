// ======================= src/teamReportCore.js =======================
// 📑 2026-11-15 팀 실적 보고서 — 숫자 계산(화면 · PDF · PPT · 전자결재 공용, 테스트: scripts/teamReport.test.mjs)
//  · 오더 기준은 매출관리 · 일일 경영 보고와 같다: 취소 · 운송사 전송 제외, 청구운임 = 매출, 청구운임 − 기사운임 − 회사가 따로 지급(지게차·외부 특수운임) = 수익
//  · 팀원 = 그 팀 직원(users.team). 오더 담당 = 등록한 직원(src/detailGetters.js orderStaffNameRaw — 화면이 staffOf 로 넘긴다)
//  · 비교 = 바로 앞 같은 길이 기간(이번 달이면 지난달 같은 날까지가 아니라 지난달 전체 — 보고서는 "기간 대 기간")
//  ⚠ 이 파일은 다른 파일을 가져오지 않는다(node 테스트에서 바로 읽는다) — 아래 작은 함수들은 src/dailyReportCore.js 와 같은 식
//    (⭐ 2026-11-17 예외: 수익 식은 functions/profitCore.mjs(가져오는 것 없음)를 forkliftCore.js 로 가져온다 — 배차표 수수료와 같은 식)
import { orderProfit } from "./forkliftCore.js";
const toWon = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
export const dateOf = (r) => String(r?.상차일자 || r?.상차일 || r?.상차 || "").slice(0, 10);
export const saleOf = (r) => toWon(r?.청구운임);
export const profitOf = (r) => orderProfit(r); // ⭐ 2026-11-17 저장된 외부지급합 대신 오더 칸에서 다시 계산 — functions/profitCore.mjs
export const isCancelledOrder = (r) => r?.배차상태 === "배차취소" || ["취소", "배차취소", "오더취소", "취소됨"].includes(r?.상태);
const addDay = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const rangeDays = (a, b) => { const out = []; for (let d = a; d <= b && out.length < 400; d = addDay(d, 1)) out.push(d); return out; };
export const pctChange = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
let _holiday = () => false; // 화면이 공휴일 판정을 넘겨준다(setHolidayFn)
export const setHolidayFn = (fn) => { _holiday = typeof fn === "function" ? fn : () => false; };
const isBizDay = (ymd) => { const w = new Date(`${ymd}T00:00:00Z`).getUTCDay(); return w !== 0 && w !== 6 && !_holiday(ymd); };

// ── 기간 ──
const pad = (n) => String(n).padStart(2, "0");
export const ymOf = (ymd) => String(ymd || "").slice(0, 7);
export const monthFirst = (ym) => `${ym}-01`;
export const monthLast = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
export const shiftYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1;
// kind: thisMonth | lastMonth | thisQuarter | lastQuarter | custom → { from, to, prevFrom, prevTo, label, prevLabel }
export function periodOf(kind, today, custom = {}) {
  const ym = ymOf(today);
  const mLabel = (x) => `${Number(x.slice(0, 4))}년 ${Number(x.slice(5, 7))}월`;
  if (kind === "lastMonth") { const a = shiftYm(ym, -1); const p = shiftYm(ym, -2); return { from: monthFirst(a), to: monthLast(a), prevFrom: monthFirst(p), prevTo: monthLast(p), label: mLabel(a), prevLabel: mLabel(p) }; }
  if (kind === "thisQuarter" || kind === "lastQuarter") {
    const [y, m] = ym.split("-").map(Number); let q = Math.floor((m - 1) / 3); let yy = y;
    if (kind === "lastQuarter") { q -= 1; if (q < 0) { q = 3; yy -= 1; } }
    const startYm = `${yy}-${pad(q * 3 + 1)}`; const endYm = shiftYm(startYm, 2);
    const pStart = shiftYm(startYm, -3); const pEnd = shiftYm(startYm, -1);
    const qLabel = (s) => `${Number(s.slice(0, 4))}년 ${Math.floor((Number(s.slice(5, 7)) - 1) / 3) + 1}분기`;
    const to = kind === "thisQuarter" && monthLast(endYm) > today ? today : monthLast(endYm);
    // 진행 중인 분기는 지난 분기의 같은 날수까지와 견준다
    const partial = to < monthLast(endYm);
    const pTo = partial ? (() => { const x = addDay(monthFirst(pStart), daysBetween(monthFirst(startYm), to) - 1); return x > monthLast(pEnd) ? monthLast(pEnd) : x; })() : monthLast(pEnd);
    return { from: monthFirst(startYm), to, prevFrom: monthFirst(pStart), prevTo: pTo, label: qLabel(startYm), prevLabel: partial ? `${qLabel(pStart)} 같은 기간` : qLabel(pStart) };
  }
  if (kind === "custom" && custom.from && custom.to && custom.from <= custom.to) {
    const n = daysBetween(custom.from, custom.to);
    const prevTo = addDay(custom.from, -1); const prevFrom = addDay(prevTo, -(n - 1));
    const dot = (d) => d.slice(2).replace(/-/g, ".");
    return { from: custom.from, to: custom.to, prevFrom, prevTo, label: `${dot(custom.from)} ~ ${dot(custom.to)}`, prevLabel: `${dot(prevFrom)} ~ ${dot(prevTo)}` };
  }
  // thisMonth(기본) — 1일 ~ 오늘, 비교는 지난달 같은 날까지(1일 ~ 같은 날짜 · 지난달이 더 짧으면 말일) — 반달과 한 달을 견주지 않게
  const p = shiftYm(ym, -1);
  const to = today < monthLast(ym) ? today : monthLast(ym);
  const sameDay = `${p}-${to.slice(8, 10)}`;
  const pTo = sameDay > monthLast(p) ? monthLast(p) : sameDay;
  return { from: monthFirst(ym), to, prevFrom: monthFirst(p), prevTo: pTo, label: mLabel(ym), prevLabel: pTo === monthLast(p) ? mLabel(p) : `${mLabel(p)} 1~${Number(pTo.slice(8, 10))}일` };
}

// ── 팀 ──
// 보고서 종류: sales(매출 실적 — 운송 · 운영 · 영업) | soon(다음 단계)
export const teamKind = (team) => (/운송|운영|배차|영업/.test(String(team || "")) ? "sales" : "soon");
const STAFF_OUT = ["driver", "shipper", "cafeUser", "totalMaster"];
export const teamMembers = (people, team) => (people || [])
  .filter((u) => !STAFF_OUT.includes(u.role) && u.approved !== false && u.employmentStatus !== "퇴사" && String(u.team || "") === String(team || "") && String(u.name || "").trim())
  .map((u) => ({ uid: u.uid || u.id, name: String(u.name).trim(), position: u.position || "" }));

// ── 계산 ──
const z = () => ({ sale: 0, profit: 0, cnt: 0 });
const add = (e, r) => { e.sale += saleOf(r); e.profit += profitOf(r); e.cnt += 1; };
const fin = (e) => ({ ...e, margin: e.sale ? (e.profit / e.sale) * 100 : 0, perOrder: e.cnt ? e.profit / e.cnt : 0 });
// rows: 오더 · members: [{ name }] · p: periodOf(...) · staffOf(r) → 담당 이름
export function buildTeamReport({ rows, members, period: p, staffOf }) {
  const names = new Set((members || []).map((m) => m.name));
  const seen = new Set();
  const inTeam = []; let coCur = 0;
  for (const r of rows || []) {
    const d = dateOf(r); if (!d || d < p.prevFrom || d > p.to) continue;
    const k = r._id || r.id ? `${r.__col || ""}/${r._id || r.id}` : null;
    if (k) { if (seen.has(k)) continue; seen.add(k); }
    if (r.source === "transport_transmit" || isCancelledOrder(r)) continue;
    if (d >= p.from) coCur += saleOf(r);
    const who = String(staffOf(r) || "").trim();
    if (names.has(who)) inTeam.push({ r, d, who });
  }
  const cur = z(); const prev = z();
  const byDay = {}; const mem = {}; const memPrev = {}; const cl = {}; const clPrev = {};
  const low = []; const loss = []; let unassigned = 0;
  (members || []).forEach((m) => { mem[m.name] = z(); });
  inTeam.forEach(({ r, d, who }) => {
    const c = String(r.거래처명 || "").trim() || "미지정";
    if (d >= p.from) {
      add(cur, r); add(mem[who], r);
      const e = byDay[d] || (byDay[d] = z()); add(e, r);
      add(cl[c] || (cl[c] = z()), r);
      const s = saleOf(r); const pr = profitOf(r);
      if (s > 0 && pr < 0) loss.push(r); else if (s > 0 && (pr / s) * 100 < 5) low.push(r);
      if ((r.배차상태 || "") === "배차중") unassigned += 1;
    } else if (d >= p.prevFrom && d <= p.prevTo) {
      add(prev, r); add(memPrev[who] || (memPrev[who] = z()), r); add(clPrev[c] || (clPrev[c] = z()), r);
    }
  });
  const C = fin(cur); const P = fin(prev);
  const daily = rangeDays(p.from, p.to).map((d) => { const v = byDay[d] || z(); return { d, sale: v.sale, profit: v.profit, cnt: v.cnt, off: !isBizDay(d) }; });
  const memberRows = (members || []).map((m) => { const v = fin(mem[m.name] || z()); const pv = memPrev[m.name] || z();
    return { ...m, ...v, prevSale: pv.sale, prevProfit: pv.profit, d: pctChange(v.sale, pv.sale), share: C.sale ? (v.sale / C.sale) * 100 : 0 }; })
    .sort((a, b) => b.sale - a.sale || b.cnt - a.cnt);
  const clientsAll = Object.entries(cl).map(([n, v]) => ({ n, ...fin(v), prevSale: clPrev[n]?.sale || 0, d: pctChange(v.sale, clPrev[n]?.sale || 0) })).sort((a, b) => b.sale - a.sale);
  const moves = Object.keys({ ...cl, ...clPrev }).map((n) => ({ n, diff: (cl[n]?.sale || 0) - (clPrev[n]?.sale || 0), cur: cl[n]?.sale || 0, prev: clPrev[n]?.sale || 0 }));
  const up = moves.filter((x) => x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5);
  const down = moves.filter((x) => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5);
  const newClients = clientsAll.filter((c) => !clPrev[c.n]).map((c) => c.n);
  // 손실 사유 = 손실사유(배차현황에서 손실 금액을 눌러 적음)가 먼저, 없으면 메모 — src/lossReason.js 와 같은 규칙
  const short = (r) => ({ d: dateOf(r), client: String(r.거래처명 || ""), route: `${String(r.상차지명 || "").trim()} → ${String(r.하차지명 || "").trim()}`, sale: saleOf(r), profit: profitOf(r), who: String(staffOf(r) || ""), reason: String(r.손실사유 || "").trim() || String(r.메모 || "").trim() });
  const bizDays = daily.filter((x) => !x.off).length || 1;
  return {
    period: p, cur: C, prev: P,
    d: { sale: pctChange(C.sale, P.sale), profit: pctChange(C.profit, P.profit), cnt: pctChange(C.cnt, P.cnt), margin: P.sale ? C.margin - P.margin : null, perOrder: pctChange(C.perOrder, P.perOrder) },
    daily, avgPerBizDay: C.sale / bizDays,
    members: memberRows, best: memberRows.find((m) => m.sale > 0) || null,
    clients: { top: clientsAll.slice(0, 8), count: clientsAll.length, up, down, newClients },
    risks: { loss: loss.map(short).sort((a, b) => a.profit - b.profit).slice(0, 5), lossCount: loss.length, lowCount: low.length, low: low.map(short).slice(0, 5), unassigned },
    companyShare: coCur ? (C.sale / coCur) * 100 : 0, companySale: coCur,
  };
}

// 작성자 의견 칸(켜고 끌 수 있다) — 기본 틀
export const OPINION_SECTIONS = [
  ["summary", "총평", "■ 총평(Executive Summary)\n· "],
  ["good", "주요 성과", "■ 주요 성과\n· \n· "],
  ["issue", "이슈 및 원인 분석", "■ 주요 이슈\n· \n\n■ 원인 분석\n· "],
  ["plan", "향후 추진 계획", "■ 차기 목표\n· \n\n■ 추진 과제\n· "],
  ["ask", "협조 요청 사항", "■ 경영진 협조 요청 사항\n· "],
];
// 숫자를 글로(전자결재 본문 · PPT 메모용) — 만원 단위
const man = (won) => `${Math.round((won || 0) / 1e4).toLocaleString("ko-KR")}만원`;
const pct = (v) => (v == null || !Number.isFinite(v) ? "-" : `${v > 0 ? "▲" : v < 0 ? "▼" : ""}${Math.abs(v).toFixed(1)}%`);
export function reportText(rep, team) {
  const c = rep.cur;
  const lines = [
    `■ ${team} · ${rep.period.label} 실적 (비교 기간: ${rep.period.prevLabel})`,
    `· 매출액 ${man(c.sale)} (${pct(rep.d.sale)}) · 매출총이익 ${man(c.profit)} (${pct(rep.d.profit)}) · 매출총이익률 ${c.margin.toFixed(1)}% · 운송 ${c.cnt.toLocaleString("ko-KR")}건`,
    `· 전사 매출 비중 ${rep.companyShare.toFixed(1)}%`,
    "",
    "■ 담당자별 실적",
    ...rep.members.map((m) => `· ${m.name}${m.position ? ` ${m.position}` : ""} — 매출액 ${man(m.sale)} · 매출총이익 ${man(m.profit)} · ${m.cnt}건 (${pct(m.d)})`),
    "",
    "■ 매출 상위 거래처",
    ...rep.clients.top.slice(0, 5).map((x, i) => `${i + 1}. ${x.n} — ${man(x.sale)} (${pct(x.d)})`),
  ];
  if (rep.risks.lossCount || rep.risks.lowCount || rep.risks.unassigned) {
    lines.push("", `■ 리스크 점검 · 역마진 ${rep.risks.lossCount}건 · 저마진(5% 미만) ${rep.risks.lowCount}건 · 미배차 ${rep.risks.unassigned}건`);
    rep.risks.loss.forEach((x) => lines.push(`· ${x.d.slice(5)} ${x.client} ${man(x.profit)} — 손실 사유: ${x.reason || "미기재"}`));
  }
  return lines.join("\n");
}
