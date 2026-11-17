// ======================= src/SalesExecView.jsx =======================
// 👑 2026-11-17 영업관리 — 임원 화면(대표 · 임원이 임원 메뉴에서 열 때만 · useExecMode() === true)
//  · 영업 현황(OVERVIEW)은 임원용 영업 보고판: 한 줄 브리핑 → 핵심 숫자 6개 → 12개월 추이 · 담당자 순위 →
//    영업 기회 깔때기 · 거래처 건강도 → 인센티브 현황 · 영업 활동 흐름
//  · 나머지 탭(인센티브 · 영업 기회 · 거래처 담당 · 영업 활동 · 팀 실적 보고서 · 목표 · 규정 · 담당자별 상세)은
//    영업팀이 쓰는 화면을 그대로(확정 · 배정 · 기록 버튼 모두) 임원 틀 안에 보여 준다 — SalesHub 가 renderTab 으로 넘겨 준다
//  계산은 모두 src/salesCore.js · src/salesData.js(B.calc · B.team · B.health · pipelineSummary) 그대로 — 새 계산 없음
import React from "react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import {
  EX, EX_NUM, GOLD_GRAD, ExecPage, ExecPanel, Kpi, ExecKpis, ExecGrid, ExecTabs, ExecButton, Num, Delta, Eyebrow, Meter, Ring,
  RankBars, ExecTable, Chip, Empty, ExecClock, chartTheme, ExecTooltip, Legend, fmtWon, fmtMan, fmtEokMan, fmtPct, pctChange,
} from "./execUi";
import { ymOf, kstDay, toInt, LEAD_STAGES, OPEN_STAGES, leadWeighted, pipelineSummary, baseLabel } from "./salesCore";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const mOf = (ym) => Number(String(ym).slice(5, 7));
const dLabel = (d) => { if (!d) return "—"; const t = new Date(`${d}T00:00:00Z`); return `${d.slice(5).replace("-", ".")} (${DOW[t.getUTCDay()]})`; };
const stamp = (ms) => { if (!ms) return ""; const t = new Date(ms + 9 * 3600e3); const p = (n) => String(n).padStart(2, "0"); return `${p(t.getUTCMonth() + 1)}.${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`; };
const sumOf = (list, k) => list.reduce((s, x) => s + (Number(x[k]) || 0), 0);
const manWon = (v) => `${fmtMan(v)}만원`;

// 달 고르기 — 임원 톤
function ExecMonthNav({ ym, setYm, max = ymOf(0) }) {
  const btn = "w-10 h-10 rounded-xl grid place-items-center text-[16px] font-black transition hover:brightness-125 disabled:opacity-30";
  const st = { background: "rgba(255,255,255,.05)", border: `1px solid ${EX.line}`, color: EX.sub };
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" data-ro-allow aria-label="이전 달" className={btn} style={st} onClick={() => setYm(ymOf(-1, `${ym}-01`))}>‹</button>
      <span className="h-10 px-4 rounded-xl grid place-items-center text-[15px] font-black whitespace-nowrap" style={{ ...EX_NUM, background: "rgba(215,188,130,.12)", border: `1px solid ${EX.lineHi}`, color: EX.goldHi }}>{ym.replace("-", ". ")}</span>
      <button type="button" data-ro-allow aria-label="다음 달" disabled={ym >= max} className={btn} style={st} onClick={() => setYm(ymOf(1, `${ym}-01`))}>›</button>
    </div>
  );
}

// 영업 기회 깔때기 — 단계마다 사다리꼴(모양은 고정 · 숫자는 실제) + 오른쪽에 예상 월 매출 · 확률 · 가중 금액
function Funnel({ rows }) {
  const maxW = Math.max(1, ...rows.map((r) => r.weighted));
  const n = rows.length; const step = 13;
  const fills = ["rgba(143,176,240,.30)", "rgba(143,176,240,.42)", "rgba(215,188,130,.45)", "rgba(215,188,130,.75)"];
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-4 px-1 pb-1 text-[11.5px] font-extrabold" style={{ color: EX.mute }}>
        <span>단계 · 건수</span>
        <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] gap-3"><span className="text-right">예상 월 매출</span><span className="text-right">수주 확률</span><span className="text-right">가중 금액</span></div>
      </div>
      {rows.map((r, i) => {
        const wt = 100 - i * step; const wb = 100 - (i + 1) * step;
        const clip = `polygon(${(100 - wt) / 2}% 0, ${100 - (100 - wt) / 2}% 0, ${100 - (100 - wb) / 2}% 100%, ${(100 - wb) / 2}% 100%)`;
        return (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-4 items-center">
            <div className="relative h-[58px]">
              <div className="absolute inset-0" style={{ clipPath: clip, WebkitClipPath: clip, background: i === n - 1 ? `linear-gradient(180deg, rgba(241,221,174,.85), rgba(168,135,74,.75))` : `linear-gradient(180deg, ${fills[i]}, ${fills[i].replace(/[\d.]+\)$/, ".18)")})` }} />
              <div className="absolute inset-0 flex items-center justify-center gap-2" style={EX_NUM}>
                <span className="text-[13.5px] font-black" style={{ color: i === n - 1 ? "#1A1408" : EX.text }}>{r.label}</span>
                <span className="text-[15px] font-black" style={{ color: i === n - 1 ? "#1A1408" : EX.goldHi }}>{r.count}<span className="text-[11px] font-bold ml-0.5" style={{ opacity: 0.7 }}>건</span></span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] gap-3 items-baseline" style={EX_NUM}>
                <span className="text-right text-[13.5px] font-bold truncate" style={{ color: EX.sub }}>{fmtMan(r.amount)}<span className="text-[11px] ml-0.5" style={{ color: EX.mute }}>만</span></span>
                <span className="text-right text-[12.5px] font-extrabold" style={{ color: EX.ice }}>{r.prob}%</span>
                <span className="text-right text-[15px] font-black truncate" style={{ color: EX.text }}>{fmtMan(r.weighted)}<span className="text-[11px] ml-0.5" style={{ color: EX.mute }}>만</span></span>
              </div>
              <div className="mt-2"><Meter value={r.weighted} max={maxW} height={4} color={i === n - 1 ? EX.gold : EX.ice} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 거래처 건강도 — 상태별 띠 그래프 + 범례
const HEALTH_VIEW = [
  ["new", "신규", EX.goldHi], ["grow", "성장", EX.ice], ["steady", "유지", "rgba(232,238,250,.32)"], ["drop", "급감", EX.warn], ["sleep", "휴면", EX.danger],
];
function HealthBar({ counts, total }) {
  if (!total) return <Empty text="최근 거래 실적이 있는 거래처가 없습니다" sub="배차완료 오더가 누적되면 거래처 상태가 표시됩니다." />;
  return (
    <div>
      <div className="flex h-3.5 rounded-full overflow-hidden gap-[2px]" style={{ background: "rgba(255,255,255,.05)" }}>
        {HEALTH_VIEW.map(([k, , c]) => (counts[k] ? <div key={k} title={`${k}`} style={{ width: `${(counts[k] / total) * 100}%`, background: c }} /> : null))}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {HEALTH_VIEW.map(([k, label, c]) => (
          <div key={k} className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] font-bold whitespace-nowrap" style={{ color: EX.sub }}><span className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: c }} />{label}</div>
            <div className="mt-1"><Num value={counts[k] || 0} unit="곳" size={20} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════ 임원 영업 보고판 ═════════════════════════
function ExecOverview({ B, onTab }) {
  const [ym, setYm] = React.useState(ymOf(0));
  const [rankBy, setRankBy] = React.useState("sale");
  const today = kstDay();
  const isCur = ym === ymOf(0);
  const prevYm = ymOf(-1, `${ym}-01`);

  const team = React.useMemo(() => B.team(ym), [B, ym]);
  const prevTeam = React.useMemo(() => B.team(prevYm), [B, prevYm]);
  const tot = (list) => ({ sale: sumOf(list, "sale"), profit: sumOf(list, "profit"), total: sumOf(list, "total"), confirmed: sumOf(list, "confirmed"), held: sumOf(list, "held"), n: sumOf(list, "n"), target: sumOf(list, "target") });
  const T = tot(team); const PT = tot(prevTeam);
  const margin = T.sale ? (T.profit / T.sale) * 100 : null;
  const pMargin = PT.sale ? (PT.profit / PT.sale) * 100 : null;
  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const m = ymOf(i - 11, `${ym}-01`); const t = B.team(m); const sale = sumOf(t, "sale"); const profit = sumOf(t, "profit");
    return { m, k: `${mOf(m)}월`, sale, profit, margin: sale ? Number(((profit / sale) * 100).toFixed(1)) : null };
  }), [B, ym]);

  // 영업 기회
  const P = pipelineSummary(B.leads, today);
  const funnel = LEAD_STAGES.filter((s) => OPEN_STAGES.includes(s.key)).map((s) => {
    const ls = B.leads.filter((l) => l.stage === s.key);
    return { key: s.key, label: s.label, prob: s.prob, count: ls.length, amount: ls.reduce((a, l) => a + toInt(l.monthlyRevenue), 0), weighted: ls.reduce((a, l) => a + leadWeighted(l), 0) };
  });
  const wonAll = B.leads.filter((l) => l.stage === "won").length; const lostAll = B.leads.filter((l) => l.stage === "lost").length;

  // 신규 거래처(이 달 수주 처리 · 담당 시작)
  const newNames = new Set([
    ...B.leads.filter((l) => l.stage === "won" && String(l.wonAt || "").startsWith(ym)).map((l) => l.name),
    ...B.accounts.filter((a) => String(a.since || "").startsWith(ym)).map((a) => a.client),
  ].filter(Boolean));

  // 거래처 건강도
  const health = React.useMemo(() => B.health(ym), [B, ym]);
  const active = health.filter((h) => h.state !== "none");
  const hc = active.reduce((m, h) => { m[h.state] = (m[h.state] || 0) + 1; return m; }, {});
  const unpaidN = health.filter((h) => h.unpaid).length;
  const noRep = health.filter((h) => !h.uid && h.state !== "none").length;
  const watch = health.filter((h) => h.state === "drop" || h.state === "sleep" || h.unpaid)
    .sort((a, b) => (b.p30 + b.prev) - (a.p30 + a.prev)).slice(0, 5);

  // 인센티브
  const p = B.policy;
  const saved = (uid) => B.incentives.find((x) => x.ym === ym && x.uid === uid) || null;
  const payable = (t) => (p.collectOnly ? t.confirmed : t.total);
  const incRows = team.filter((t) => t.sale > 0 || t.total > 0 || saved(t.uid));
  const paidN = team.filter((t) => saved(t.uid)?.status === "지급완료").length;
  const fixN = team.filter((t) => saved(t.uid)?.status === "확정").length;

  // 영업 활동
  const monthActs = B.activities.filter((a) => String(a.date || "").startsWith(ym));
  const recent = [...B.activities].filter((a) => a.date && a.date <= today).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 6);
  const planN = B.activities.filter((a) => a.nextDate && a.nextDate >= today).length + B.leads.filter((l) => OPEN_STAGES.includes(l.stage) && l.nextDate && l.nextDate >= today).length;
  const actTypes = ["방문", "전화", "견적 제출", "미팅", "계약"];

  // 순위
  const RANK_KEYS = [["sale", "매출"], ["profit", "매출총이익"], ["achieve", "목표 달성률"]];
  const rankRows = [...team].sort((a, b) => (b[rankBy] || 0) - (a[rankBy] || 0)).map((t) => ({
    key: t.uid, label: t.name, sub: t.position || t.team || "", value: rankBy === "achieve" ? (t.target > 0 ? t.achieve : 0) : t[rankBy] || 0,
    margin: t.sale ? (t.profit / t.sale) * 100 : null, target: t.target,
  }));

  // 한 줄 브리핑
  const saleChg = pctChange(T.sale, PT.sale);
  const brief = (
    <>
      <b style={{ color: EX.goldHi }}>{mOf(ym)}월</b> 영업팀 담당 매출은 <b style={{ color: EX.text }}>{fmtEokMan(T.sale)}</b>{isCur ? "(금일까지 누계)" : ""}
      {saleChg != null ? <>으로 전월 대비 <b style={{ color: saleChg >= 0 ? EX.up : EX.down }}>{Math.abs(saleChg).toFixed(1)}% {saleChg >= 0 ? "증가" : "감소"}</b>했습니다. </> : "입니다. "}
      매출총이익은 <b style={{ color: EX.text }}>{fmtEokMan(T.profit)}</b>(매출총이익률 {fmtPct(margin)})이며,
      진행 중인 영업 기회 <b style={{ color: EX.text }}>{P.open}건</b>의 가중 예상 매출은 월 <b style={{ color: EX.goldHi }}>{fmtEokMan(P.weighted)}</b>입니다.
      {watch.length ? <> 매출 급감 · 휴면 · 미수로 점검이 필요한 거래처는 <b style={{ color: EX.warn }}>{health.filter((h) => h.state === "drop" || h.state === "sleep" || h.unpaid).length}곳</b>입니다.</> : " 점검이 필요한 거래처는 없습니다."}
    </>
  );

  const tick = (v) => fmtMan(v);
  return (
    <div className="space-y-4 md:space-y-5">
      {/* 결론 먼저 */}
      <ExecPanel glow pad={false}>
        <div className="px-4 md:px-6 py-4 md:py-5 flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="min-w-0 flex-1">
            <Eyebrow size={10.5}>EXECUTIVE BRIEFING</Eyebrow>
            <p className="mt-2 text-[14.5px] md:text-[16px] font-semibold leading-[1.75]" style={{ color: EX.sub }}>{brief}</p>
            <div className="mt-2 text-[12px] font-semibold" style={{ color: EX.mute }}>
              담당 거래처 배차완료 오더 기준 · 매출총이익 = 청구운임 − 기사운임 − 회사 부담 지게차 · 외부 특수운임{B.at ? ` · ${stamp(B.at)} 집계` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <ExecMonthNav ym={ym} setYm={setYm} />
            <ExecButton onClick={B.reload} disabled={B.loading}>{B.loading ? "불러오는 중…" : "새로 고침"}</ExecButton>
          </div>
        </div>
      </ExecPanel>

      {/* 핵심 숫자 */}
      <ExecKpis min={190}>
        <Kpi accent en="REVENUE" label={`${mOf(ym)}월 영업 매출`} money={T.sale} delta={saleChg} deltaLabel="전월 대비" foot={`${T.n.toLocaleString("ko-KR")}건`} spark={months.map((m) => m.sale)} />
        <Kpi en="GROSS PROFIT" label="매출총이익" money={T.profit} delta={pctChange(T.profit, PT.profit)} deltaLabel="전월 대비" foot={T.target > 0 ? `목표 달성률 ${((T.sale / T.target) * 100).toFixed(0)}%` : "목표 미설정"} />
        <Kpi en="GROSS MARGIN" label="매출총이익률" value={margin == null ? "—" : margin.toFixed(1)} unit={margin == null ? "" : "%"}
          foot={margin != null && pMargin != null ? <span className="inline-flex items-center gap-2"><Delta v={margin - pMargin} suffix="%p" label="전월 대비" size={13} /><span style={{ color: EX.faint }}>전월 {pMargin.toFixed(1)}%</span></span> : "매출총이익 ÷ 매출"} />
        <Kpi en="NEW ACCOUNTS" label="신규 거래처" value={newNames.size} unit="곳" foot={`신규 관리 중 ${hc.new || 0}곳`} onClick={() => onTab("accounts")} title="거래처 담당 보기" />
        <Kpi en="PIPELINE" label="영업 기회 가중 금액" money={P.weighted} foot={`진행 ${P.open}건 · 수주율 ${P.winRate}%`} onClick={() => onTab("pipeline")} title="영업 기회 보기" />
        <Kpi en="INCENTIVE" label="예상 인센티브" money={T.total} foot={p.collectOnly ? `확정 ${fmtMan(T.confirmed)}만원 · 보류 ${fmtMan(T.held)}만원` : "전액 확정 대상"} onClick={() => onTab("incentive")} title="인센티브 보기" />
      </ExecKpis>

      {/* 추이 · 순위 */}
      <ExecGrid cols="minmax(0,1.75fr) minmax(0,1fr)">
        <ExecPanel en="TREND · 12 MONTHS" title="월별 영업 매출 · 매출총이익 · 매출총이익률" sub="단위 만원 · 매출총이익률은 오른쪽 축"
          right={<div className="hidden md:block"><Legend items={[["매출", EX.gold], ["매출총이익", EX.ice], ["매출총이익률", EX.goldHi, "line"]]} /></div>}>
          <div className="md:hidden mb-2"><Legend items={[["매출", EX.gold], ["매출총이익", EX.ice], ["매출총이익률", EX.goldHi, "line"]]} /></div>
          <div className="h-[280px] -ml-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={months} margin={{ top: 10, right: 4, left: 0, bottom: 0 }} barGap={3}>
                <defs>
                  <linearGradient id="sxSale" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#F1DDAE" /><stop offset="100%" stopColor="#A8874A" stopOpacity=".85" /></linearGradient>
                  <linearGradient id="sxProfit" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8FB0F0" /><stop offset="100%" stopColor="#4B6CB7" stopOpacity=".8" /></linearGradient>
                </defs>
                <CartesianGrid {...chartTheme.grid} />
                <XAxis dataKey="k" {...chartTheme.axis} interval={0} tick={{ ...chartTheme.axis.tick, fontSize: 11 }} />
                <YAxis yAxisId="l" {...chartTheme.axis} tickFormatter={tick} width={52} />
                <YAxis yAxisId="r" orientation="right" {...chartTheme.axis} tickFormatter={(v) => `${v}%`} width={40} domain={[0, (mx) => Math.max(10, Math.ceil((mx || 0) / 10) * 10)]} />
                <Tooltip cursor={chartTheme.cursor} content={<ExecTooltip unit="만원" fmt={(v, it) => (it?.dataKey === "margin" ? v.toFixed(1) : fmtMan(v))} labelFmt={(l) => { const r = months.find((x) => x.k === l); return r ? r.m.replace("-", "년 ") + "월" : l; }} />} />
                <Bar yAxisId="l" dataKey="sale" name="매출" radius={[5, 5, 0, 0]} maxBarSize={20} isAnimationActive={false}>
                  {months.map((m) => <Cell key={m.m} fill="url(#sxSale)" fillOpacity={m.m === ym ? 1 : 0.42} />)}
                </Bar>
                <Bar yAxisId="l" dataKey="profit" name="매출총이익" radius={[5, 5, 0, 0]} maxBarSize={20} isAnimationActive={false}>
                  {months.map((m) => <Cell key={m.m} fill="url(#sxProfit)" fillOpacity={m.m === ym ? 1 : 0.42} />)}
                </Bar>
                <Line yAxisId="r" dataKey="margin" name="매출총이익률" unit="%" stroke={EX.goldHi} strokeWidth={2} type="monotone" connectNulls isAnimationActive={false}
                  dot={(pr) => (pr.payload.margin == null || pr.cy == null ? <g key={pr.index} /> : <circle key={pr.index} cx={pr.cx} cy={pr.cy} r={pr.payload.m === ym ? 4.5 : 2.5} fill={pr.payload.m === ym ? EX.goldHi : EX.bg1} stroke={EX.goldHi} strokeWidth={1.5} />)} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ExecPanel>
        <ExecPanel en="LEADERBOARD" title="담당자 순위" sub={`${mOf(ym)}월 · 영업 담당 ${team.length}명`}
          right={<ExecTabs size="sm" items={RANK_KEYS} value={rankBy} onChange={setRankBy} />}>
          <RankBars rows={rankRows} empty="영업 담당자가 없습니다"
            valueFmt={(v) => (rankBy === "achieve" ? `${v.toFixed(0)}%` : manWon(v))}
            right={(r) => (rankBy === "achieve" ? (r.target > 0 ? null : <span className="text-[11.5px] font-bold" style={{ color: EX.faint }}>목표 미설정</span>)
              : <span className="text-[11.5px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>{r.margin == null ? "—" : `${r.margin.toFixed(1)}%`}</span>)} />
          {rankBy !== "achieve" && rankRows.length > 0 && <div className="mt-2 text-[11.5px] font-semibold text-right" style={{ color: EX.faint }}>오른쪽 수치는 매출총이익률</div>}
          {team.length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${EX.line}` }}>
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,52px)] gap-2 pb-1.5 text-[11.5px] font-extrabold" style={{ color: EX.mute }}>
                <span>담당자별 영업 기반</span><span className="text-right">거래처</span><span className="text-right">신규</span><span className="text-right">기회</span><span className="text-right">활동</span>
              </div>
              {team.slice(0, 6).map((t) => (
                <div key={t.uid} className="grid grid-cols-[minmax(0,1fr)_repeat(4,52px)] gap-2 py-1.5 items-baseline text-[13px]" style={EX_NUM}>
                  <span className="font-bold truncate" style={{ color: EX.text }}>{t.name}</span>
                  <span className="text-right font-bold" style={{ color: EX.sub }}>{B.accounts.filter((a) => a.uid === t.uid).length}</span>
                  <span className="text-right font-bold" style={{ color: t.newClients ? EX.goldHi : EX.faint }}>{t.newClients || 0}</span>
                  <span className="text-right font-bold" style={{ color: EX.sub }}>{B.leads.filter((l) => l.ownerUid === t.uid && OPEN_STAGES.includes(l.stage)).length}</span>
                  <span className="text-right font-bold" style={{ color: EX.sub }}>{monthActs.filter((a) => a.ownerUid === t.uid).length}</span>
                </div>
              ))}
              <div className="mt-1 text-[11.5px] font-semibold" style={{ color: EX.faint }}>담당 거래처 · 신규 관리 중 · 진행 중 기회 · {mOf(ym)}월 활동(건)</div>
            </div>
          )}
          <div className="mt-3 flex justify-end"><ExecButton onClick={() => onTab("ranking")}>팀 순위 상세 ›</ExecButton></div>
        </ExecPanel>
      </ExecGrid>

      {/* 영업 기회 · 거래처 건강도 */}
      <ExecGrid cols="minmax(0,1.35fr) minmax(0,1fr)">
        <ExecPanel en="PIPELINE FUNNEL" title="영업 기회 깔때기" sub="진행 중인 기회 · 가중 금액 = 예상 월 매출 × 수주 확률"
          right={<ExecButton onClick={() => onTab("pipeline")}>영업 기회 ›</ExecButton>}>
          {!P.open ? <Empty text="진행 중인 영업 기회가 없습니다" sub="영업팀이 신규 화주를 등록하면 단계별로 표시됩니다." /> : <Funnel rows={funnel} />}
          <div className="mt-4 pt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-4 items-center" style={{ borderTop: `1px solid ${EX.line}` }}>
            <Ring value={P.winRate} size={76} label={`${P.winRate}%`} sub="수주율" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[["진행 중 예상 월 매출", <Num key="a" value={fmtMan(P.amount)} unit="만원" size={18} />], ["당월 수주", <Num key="b" value={P.wonMonth} unit="건" size={18} color={EX.goldHi} />], ["누적 수주 · 실패", <Num key="c" value={`${wonAll} · ${lostAll}`} unit="건" size={18} />], ["연락 기한 경과", <Num key="d" value={P.overdue} unit="건" size={18} color={P.overdue ? EX.warn : EX.text} />]].map(([l, v]) => (
                <div key={l} className="min-w-0"><div className="text-[12px] font-bold truncate" style={{ color: EX.mute }}>{l}</div><div className="mt-1.5">{v}</div></div>
              ))}
            </div>
          </div>
        </ExecPanel>
        <ExecPanel en="ACCOUNT HEALTH" title="거래처 건강도" sub={`최근 30일과 직전 30일 비교 · 거래 실적 보유 ${active.length}곳`}
          right={<ExecButton onClick={() => onTab("accounts")}>거래처 담당 ›</ExecButton>}>
          <HealthBar counts={hc} total={active.length} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip tone={unpaidN ? "warn" : "mute"}>전월 미수 {unpaidN}곳</Chip>
            <Chip tone={noRep ? "up" : "mute"}>담당자 미지정 {noRep}곳</Chip>
          </div>
          <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${EX.line}` }}>
            <div className="text-[12.5px] font-extrabold mb-2" style={{ color: EX.sub }}>점검 대상 거래처</div>
            {!watch.length ? <div className="py-4 text-center text-[13px] font-semibold" style={{ color: EX.mute }}>급감 · 휴면 · 미수 거래처가 없습니다</div> : (
              <ul className="space-y-1">
                {watch.map((h) => (
                  <li key={h.client} className="flex items-center gap-2.5 min-w-0 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold truncate" style={{ color: EX.text }}>{h.client}</div>
                      <div className="text-[11.5px] font-semibold truncate" style={{ color: EX.mute }}>{h.rep || "담당자 미지정"}{h.last ? ` · 최근 오더 ${h.last.slice(5).replace("-", ".")}` : ""}</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {h.state === "drop" && <Chip tone="warn">급감 {Math.abs(h.change).toFixed(0)}%</Chip>}
                      {h.state === "sleep" && <Chip tone="up">휴면 {h.idle}일</Chip>}
                      {h.unpaid && <Chip tone="warn">미수</Chip>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ExecPanel>
      </ExecGrid>

      {/* 인센티브 · 영업 활동 */}
      <ExecGrid cols="minmax(0,1.35fr) minmax(0,1fr)">
        <ExecPanel en="INCENTIVE" title={`${mOf(ym)}월 인센티브 현황`}
          sub={`${baseLabel(p)} 기준${p.useTiers ? " · 구간 누진" : ` · ${p.rate}%`}${p.collectOnly ? " · 수금 완료분만 확정" : ""} · 익월 ${p.payDay}일 지급 · 단위 원`}
          right={<ExecButton onClick={() => onTab("incentive")}>확정 · 지급 ›</ExecButton>}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[["예상 인센티브", T.total, EX.text], ["지급 확정 대상", p.collectOnly ? T.confirmed : T.total, EX.goldHi], ["보류(미수)", p.collectOnly ? T.held : 0, EX.sub]].map(([l, v, c]) => (
              <div key={l} className="rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${EX.line}` }}>
                <div className="text-[12px] font-bold" style={{ color: EX.mute }}>{l}</div>
                <div className="mt-1.5"><Num value={fmtWon(v)} unit="원" size={22} color={c} /></div>
              </div>
            ))}
          </div>
          {T.total > 0 && (
            <div className="mt-3">
              <div className="flex h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.07)" }}>
                <div style={{ width: `${((p.collectOnly ? T.confirmed : T.total) / T.total) * 100}%`, background: GOLD_GRAD }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11.5px] font-semibold" style={{ ...EX_NUM, color: EX.mute }}>
                <span>확정 대상 {fmtPct(((p.collectOnly ? T.confirmed : T.total) / T.total) * 100, 0)}</span>
                <span>처리 현황: 확정 {fixN}명 · 지급 완료 {paidN}명 / {team.length}명</span>
              </div>
            </div>
          )}
          <div className="mt-4" data-sx-table>
            <style>{"[data-sx-table] table{font-size:13.5px!important}[data-sx-table] tbody td{background-color:transparent!important;border-right:none!important;color:#F4F6FB!important;font-size:13.5px!important;font-weight:600!important}[data-sx-table] thead th{font-size:11.5px!important;height:auto}[data-sx-table] tbody tr:hover td{background-color:rgba(255,255,255,.04)!important}[data-sx-table] tbody tr{height:auto;border-bottom:0}[data-sx-table] thead th{border-right:none!important}"}</style>
            <ExecTable rows={incRows} rowKey={(r) => r.uid} empty="해당 월 인센티브 대상 실적이 없습니다" onRow={() => onTab("incentive")}
              cols={[
                { key: "name", label: "담당자", render: (r) => <span className="font-bold">{r.name}{r.position ? <span className="ml-1 text-[12px] font-semibold" style={{ color: EX.mute }}>{r.position}</span> : null}</span> },
                { key: "sale", label: "매출", align: "right", render: (r) => fmtWon(r.sale) },
                { key: "profit", label: "매출총이익", align: "right", render: (r) => <span style={{ color: r.profit > 0 ? EX.up : r.profit < 0 ? EX.down : EX.text }}>{fmtWon(r.profit)}</span> },
                { key: "total", label: "예상 인센티브", align: "right", render: (r) => <b>{fmtWon(r.total)}</b> },
                { key: "pay", label: "확정 대상", align: "right", render: (r) => <b style={{ color: EX.goldHi }}>{fmtWon(payable(r))}</b> },
                { key: "st", label: "상태", align: "center", render: (r) => { const s = saved(r.uid); return !s ? <Chip tone="mute">미확정</Chip> : s.status === "지급완료" ? <Chip tone="ok">지급 완료</Chip> : <Chip tone="gold">확정</Chip>; } },
              ]} />
          </div>
        </ExecPanel>
        <ExecPanel en="ACTIVITY FLOW" title="영업 활동 최근 흐름" sub={`${mOf(ym)}월 활동 ${monthActs.length}건 · 향후 예정 ${planN}건`}
          right={<ExecButton onClick={() => onTab("activity")}>영업 활동 ›</ExecButton>}>
          <div className="grid grid-cols-5 gap-1.5">
            {actTypes.map((t) => { const c = monthActs.filter((a) => a.type === t).length; return (
              <div key={t} className="rounded-xl px-2 py-2 text-center" style={{ background: c ? "rgba(143,176,240,.08)" : "rgba(255,255,255,.025)", border: `1px solid ${EX.line}` }}>
                <div className="text-[11.5px] font-bold whitespace-nowrap" style={{ color: EX.mute }}>{t === "견적 제출" ? "견적" : t}</div>
                <div className="mt-0.5 text-[18px] font-black" style={{ ...EX_NUM, color: c ? EX.text : EX.faint }}>{c}</div>
              </div>
            ); })}
          </div>
          <div className="mt-4">
            {!recent.length ? <Empty text="기록된 영업 활동이 없습니다" sub="영업팀이 방문 · 전화 · 견적을 기록하면 시간순으로 표시됩니다." /> : (
              <ol className="relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-px" style={{ background: `linear-gradient(180deg, ${EX.lineHi}, transparent)` }} />
                {recent.map((a, i) => (
                  <li key={a.id || i} className="relative pl-6 py-2">
                    <span className="absolute left-0 top-[13px] w-[15px] h-[15px] rounded-full grid place-items-center" style={{ background: EX.bg1, border: `1.5px solid ${i === 0 ? EX.gold : "rgba(143,176,240,.5)"}` }}>
                      <span className="w-[5px] h-[5px] rounded-full" style={{ background: i === 0 ? EX.gold : EX.ice }} />
                    </span>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[12px] font-bold shrink-0" style={{ ...EX_NUM, color: EX.mute }}>{dLabel(a.date)}</span>
                      <Chip tone={a.type === "계약" ? "gold" : "ice"}>{a.type}</Chip>
                      <span className="text-[13.5px] font-bold truncate" style={{ color: EX.text }}>{a.target}</span>
                      <span className="ml-auto text-[12px] font-semibold shrink-0" style={{ color: EX.mute }}>{a.ownerName}</span>
                    </div>
                    {(a.summary || a.result) && <div className="mt-0.5 text-[12.5px] font-medium truncate" style={{ color: EX.sub }}>{a.summary || a.result}</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </ExecPanel>
      </ExecGrid>
    </div>
  );
}

// 영업팀 업무 화면을 임원 틀 안에 — 밝은 종이 위에 그대로(모든 버튼 · 권한 그대로)
function WorkSheet({ label, children }) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: EX.mute }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: EX.gold }} />
        {label} — 영업팀과 동일한 업무 화면으로, 확정 · 배정 · 기록을 이 화면에서 바로 처리할 수 있습니다.
      </div>
      <div className="rounded-[22px] p-3 md:p-5 text-[#0F1A30]" style={{ background: "linear-gradient(180deg,#F5F7FB,#EEF2F8)", border: `1px solid ${EX.lineHi}`, boxShadow: "0 24px 48px rgba(0,0,0,.28)" }}>
        {children}
      </div>
    </div>
  );
}

function ExecSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-[110px] rounded-[22px] animate-pulse" style={{ background: EX.panel, border: `1px solid ${EX.line}` }} />
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(190px,100%),1fr))" }}>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[132px] rounded-[20px] animate-pulse" style={{ background: EX.panel, border: `1px solid ${EX.line}` }} />)}
      </div>
      <div className="h-[340px] rounded-[22px] animate-pulse" style={{ background: EX.panel, border: `1px solid ${EX.line}` }} />
      <div className="text-center text-[13px] font-semibold" style={{ color: EX.mute }}>영업 실적을 집계하고 있습니다…</div>
    </div>
  );
}

// ═════════════════════════ 임원 영업관리 화면 ═════════════════════════
//  tabs: [[key, label, badge]] · renderTab(key): 영업팀 화면(SalesHub 안의 탭 본문)
export default function SalesExecView({ B, tab, setTab, tabs, renderTab }) {
  const label = (tabs.find((t) => t[0] === tab) || [])[1] || "";
  return (
    <ExecPage en="SALES COCKPIT" title="영업관리"
      sub="담당자 · 거래처별 영업 매출과 매출총이익, 익월 매출로 이어질 영업 기회의 진행 현황을 보고합니다."
      right={<ExecClock />}>
      <div className="-mt-1">
        <ExecTabs items={tabs} value={tab} onChange={setTab} />
      </div>
      {!B.ready ? <ExecSkeleton />
        : tab === "overview" ? <ExecOverview B={B} onTab={setTab} />
          : <WorkSheet label={label}>{renderTab(tab)}</WorkSheet>}
    </ExecPage>
  );
}
