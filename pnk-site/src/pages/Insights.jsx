// ======================= pnk-site/src/pages/Insights.jsx =======================
// 📊 경영 분석(2026-11-18 · 대표 · 관리자) — 기간(3 · 6 · 12개월)을 골라 회사 상태를 숫자와 그래프로 본다.
//  ① 요약 숫자: 매출 · 비용 · 순이익(이익률) · 업무 완료 · 정시 출근률 · 영업 성공률
//  ② 손익 추이(매출 · 비용 막대 + 이익 선) · 비용 구성(도넛)
//  ③ 자동 관찰(전월 대비 이익 · 지각 많은 요일 · 업무 완료율 변화 · 기한 지난 업무)
//  ④ 구성원별 업무 생산성 · 근태(평균 출근 · 근무시간 · 지각률) · 출근 히트맵(최근 30일)
//  ⑤ 담당자별 영업
//  데이터: pnkFinance · pnkTasks · pnkAttendance · pnkMembers · pnkSales (계산은 ../analytics.js)
import React from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMeCtx } from "../App";
import { DEFAULT_WORK, useCol, useDocLive, where, ymd } from "../pnkApi";
import { attendanceByMember, attendanceDaily, compactWon, daysBack, expenseMix, financeMonthly, minToHm, monthsBack, pipeline, salesByOwner, sumBy, taskByMember, taskFlow, weeksBack } from "../analytics";
import { CH, CH_SERIES, Card, ChartTip, Delta, Empty, Hero, Kpi, Meter, Spark, Tabs, axisProps, cx } from "../ui";
import { Legend } from "./Home";

const RANGES = [{ key: "3", label: "3개월" }, { key: "6", label: "6개월" }, { key: "12", label: "12개월" }];

export default function Insights() {
  useMeCtx();
  const [range, setRange] = React.useState("6");
  const months = monthsBack(Number(range));
  const since = `${months[0]}-01`;
  const d30 = daysBack(30);
  const info = useDocLive("pnkCompany/info");
  const work = { start: info?.workStart || DEFAULT_WORK.start };
  const [fin] = useCol("pnkFinance", [], []);
  const [tasks] = useCol("pnkTasks", [], []);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const [sales] = useCol("pnkSales", [], []);
  const [att] = useCol("pnkAttendance", [where("date", ">=", since < d30[0].key ? since : d30[0].key)], [since]);
  const loading = !fin || !tasks || !members || !sales || !att;

  const fm = financeMonthly(fin || [], months);
  const prevFm = financeMonthly(fin || [], monthsBack(Number(range) * 2).slice(0, Number(range)));
  const inc = sumBy(fm, "매출"), exp = sumBy(fm, "비용"), profit = inc - exp;
  const pInc = sumBy(prevFm, "매출"), pProfit = pInc - sumBy(prevFm, "비용");
  const mix = expenseMix(fin || [], months);
  const attR = (att || []).filter((r) => r.date >= since);
  const onTime = attR.length ? Math.round((attR.filter((r) => !r.late).length / attR.length) * 100) : null;
  const doneN = (tasks || []).filter((t) => t.doneAt && ymd(new Date(t.doneAt)) >= since).length;
  const pipe = pipeline(sales || []);
  const prod = taskByMember(tasks || [], members || [], since);
  const attM = attendanceByMember(attR, members || [], work);
  const owners = salesByOwner(sales || []);
  const flow = taskFlow(tasks || [], weeksBack(12));
  const heat = attendanceDaily(att || [], d30);

  // 자동 관찰
  const notes = [];
  const last = fm[fm.length - 1], prev = fm[fm.length - 2];
  if (last && prev && (last.매출 || prev.매출)) {
    const dm = (last.margin ?? 0) - (prev.margin ?? 0);
    notes.push({ tone: last.이익 >= prev.이익 ? "up" : "down", t: `${last.label} 순이익 ${compactWon(last.이익)}원으로 전월보다 ${last.이익 >= prev.이익 ? "늘었어요" : "줄었어요"} (이익률 ${dm >= 0 ? "+" : ""}${dm}%p)` });
  }
  if (mix[0]) notes.push({ tone: "info", t: `비용 1위 항목은 ${mix[0].name}(기간 비용의 ${exp ? Math.round((mix[0].value / exp) * 100) : 0}%)` });
  const byDow = ["월", "화", "수", "목", "금"].map((dw) => { const rows = attR.filter((r) => ["일", "월", "화", "수", "목", "금", "토"][new Date(`${r.date}T12:00:00Z`).getUTCDay()] === dw); return { dw, rate: rows.length ? rows.filter((r) => r.late).length / rows.length : 0, n: rows.length }; });
  const worstDow = [...byDow].sort((a, b) => b.rate - a.rate)[0];
  if (worstDow && worstDow.rate > 0) notes.push({ tone: "warn", t: `지각이 가장 많은 요일은 ${worstDow.dw}요일 (${Math.round(worstDow.rate * 100)}%)` });
  const fA = flow.slice(-4), fB = flow.slice(-8, -4);
  const rA = sumBy(fA, "등록") ? sumBy(fA, "완료") / sumBy(fA, "등록") : null, rB = sumBy(fB, "등록") ? sumBy(fB, "완료") / sumBy(fB, "등록") : null;
  if (rA != null && rB != null) notes.push({ tone: rA >= rB ? "up" : "down", t: `최근 4주 업무 완료율 ${Math.round(rA * 100)}%로 그 전 4주(${Math.round(rB * 100)}%)보다 ${rA >= rB ? "높아요" : "낮아요"}` });
  const overdueAll = (tasks || []).filter((t) => t.status !== "done" && t.due && t.due < ymd()).length;
  if (overdueAll) notes.push({ tone: "warn", t: `기한이 지난 업무가 ${overdueAll}건 있어요. 담당자별 표에서 확인해 보세요.` });
  if (pipe.openN) notes.push({ tone: "info", t: `진행 중 영업 ${pipe.openN}곳 · 가중 예상 월 ${compactWon(pipe.weighted)}원` });

  return (
    <div className="space-y-5 md:space-y-6">
      <Hero en="Management Insights" title="경영 분석" desc={`${months[0].replace("-", ".")} ~ ${months[months.length - 1].replace("-", ".")}`}>
        <div className="[&>div]:mb-0"><Tabs items={RANGES} value={range} onChange={setRange} /></div>
      </Hero>

      {loading ? <div className="py-20 text-center text-[13px] text-navy-600">분석할 데이터를 불러오는 중…</div> : (<>
        {/* ① 요약 */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
          <Kpi en="Revenue" label="매출" value={compactWon(inc)} unit="원" delta={<Delta now={inc} prev={pInc} />} spark={<Spark data={fm.map((x) => x.매출)} color={CH.ink} height={28} />} />
          <Kpi en="Expense" label="비용" value={compactWon(exp)} unit="원" spark={<Spark data={fm.map((x) => x.비용)} color={CH.taupe} height={28} />} />
          <Kpi dark accent en="Net profit" label="순이익" value={compactWon(profit)} unit="원" sub={`이익률 ${inc ? Math.round((profit / inc) * 100) : 0}%`} delta={<Delta now={profit} prev={pProfit} />} spark={<Spark data={fm.map((x) => x.이익)} color="#D8C3A0" height={28} />} />
          <Kpi en="Tasks done" label="업무 완료" value={doneN} unit="건" sub={`주 평균 ${(doneN / Math.max(1, Number(range) * 4.3)).toFixed(1)}건`} spark={<Spark data={flow.map((x) => x.완료)} color={CH.ink} height={28} />} />
          <Kpi en="On-time" label="정시 출근률" value={onTime ?? "–"} unit="%" sub={`출근 기록 ${attR.length}건`} spark={<div className="mt-1"><Meter value={onTime || 0} max={100} color={CH.gold} height={4} /></div>} />
          <Kpi en="Win rate" label="영업 성공률" value={pipe.winRate} unit="%" sub={`도입 ${pipe.wonN}곳 · 진행 ${pipe.openN}곳`} spark={<div className="mt-1"><Meter value={pipe.winRate} max={100} color={CH.ink} height={4} /></div>} />
        </div>

        {/* ② 손익 · 비용 구성 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5">
          <Card en="Profit & Loss" title="손익 추이" className="xl:col-span-2">
            {inc + exp === 0 ? <Empty icon="trend">이 기간의 장부가 없어요. [매출 · 손익]에서 입력하면 여기에 그려져요.</Empty> : (<>
              <div className="h-[280px] -ml-1">
                <ResponsiveContainer>
                  <ComposedChart data={fm} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={CH.grid} vertical={false} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis width={52} {...axisProps} tickFormatter={(v) => compactWon(v)} />
                    <Tooltip content={<ChartTip fmt={(v) => `${Number(v).toLocaleString("ko-KR")}원`} />} cursor={{ fill: "#F7F5F1" }} />
                    <Bar dataKey="매출" fill={CH.ink} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="비용" fill={CH.stone} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Line type="monotone" dataKey="이익" stroke={CH.gold} strokeWidth={2.4} dot={{ r: 3.5, fill: "#fff", stroke: CH.gold, strokeWidth: 2 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <Legend items={[["매출", CH.ink], ["비용", CH.stone], ["순이익", CH.gold]]} note="월별 · 장부(pnkFinance) 기준" />
            </>)}
          </Card>
          <Card en="Cost structure" title="비용 구성">
            {mix.length === 0 ? <Empty icon="pie">비용 기록이 없어요.</Empty> : (
              <div>
                <div className="relative h-[190px]">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={mix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none">
                        {mix.map((m, i) => <Cell key={m.name} fill={CH_SERIES[i % CH_SERIES.length]} />)}
                      </Pie>
                      <Tooltip content={<ChartTip fmt={(v) => `${Number(v).toLocaleString("ko-KR")}원`} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><div className="eng text-[9.5px] text-gold-deep">Total</div><div className="text-[18px] font-semibold tnum">{compactWon(exp)}</div></div>
                </div>
                <ul className="mt-3 space-y-2">
                  {mix.slice(0, 6).map((m, i) => (
                    <li key={m.name} className="flex items-center gap-2 text-[12.5px]"><span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: CH_SERIES[i % CH_SERIES.length] }} /><span className="flex-1 truncate">{m.name}</span><span className="tnum text-navy-600">{exp ? Math.round((m.value / exp) * 100) : 0}%</span><span className="tnum font-semibold w-16 text-right">{compactWon(m.value)}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        {/* ③ 자동 관찰 */}
        <Card dark en="Observations" title="이번 기간에 눈여겨볼 점">
          {notes.length === 0 ? <div className="text-[13px] text-white/55">데이터가 더 쌓이면 여기에 관찰 내용이 나와요.</div> : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {notes.map((n) => (
                <li key={n.t} className="flex items-start gap-3 rounded-[12px] bg-white/[0.04] border border-white/10 px-4 py-3">
                  <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: n.tone === "up" ? "#7FB59A" : n.tone === "down" ? "#E08A7E" : n.tone === "warn" ? "#D8C3A0" : "#A39B8F" }} />
                  <span className="text-[13.5px] text-white/85 leading-relaxed">{n.t}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ④ 구성원 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
          <Card en="Productivity by member" title="구성원별 업무" pad={false}>
            {prod.length === 0 ? <Empty icon="users">구성원이 없어요.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-[11.5px] text-navy-600 border-b border-[#EFECE6]"><th className="px-5 py-2.5 font-semibold">이름</th><th className="px-2 font-semibold">완료</th><th className="px-2 font-semibold w-[34%]">비중</th><th className="px-2 font-semibold">진행</th><th className="px-2 font-semibold">기한 지남</th><th className="px-5 font-semibold text-right">기한 준수</th></tr></thead>
                  <tbody>
                    {prod.map((m) => {
                      const max = Math.max(1, ...prod.map((x) => x.done));
                      return (
                        <tr key={m.uid} className="border-b border-[#F3F0EB] last:border-0">
                          <td className="px-5 py-2.5 font-semibold whitespace-nowrap">{m.name}</td>
                          <td className="px-2 tnum font-semibold">{m.done}</td>
                          <td className="px-2"><Meter value={m.done} max={max} color={CH.ink} height={6} /></td>
                          <td className="px-2 tnum text-navy-600">{m.open}</td>
                          <td className={cx("px-2 tnum", m.overdue ? "text-[#B42318] font-semibold" : "text-[#98928B]")}>{m.overdue}</td>
                          <td className="px-5 tnum text-right">{m.onTimeRate == null ? "–" : `${m.onTimeRate}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card en="Attendance by member" title="구성원별 근태" pad={false}>
            {attM.length === 0 ? <Empty icon="clock">근태 기록이 없어요.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="text-left text-[11.5px] text-navy-600 border-b border-[#EFECE6]"><th className="px-5 py-2.5 font-semibold">이름</th><th className="px-2 font-semibold">출근일</th><th className="px-2 font-semibold">평균 출근</th><th className="px-2 font-semibold">평균 근무</th><th className="px-2 font-semibold">원격</th><th className="px-5 font-semibold text-right">지각률</th></tr></thead>
                  <tbody>
                    {attM.map((m) => (
                      <tr key={m.uid} className="border-b border-[#F3F0EB] last:border-0">
                        <td className="px-5 py-2.5 font-semibold whitespace-nowrap">{m.name}</td>
                        <td className="px-2 tnum">{m.days}</td>
                        <td className={cx("px-2 tnum", m.avgIn != null && m.avgIn > m.startMin ? "text-[#B42318]" : "")}>{minToHm(m.avgIn)}</td>
                        <td className="px-2 tnum">{m.avgWork == null ? "–" : `${(m.avgWork / 60).toFixed(1)}시간`}</td>
                        <td className="px-2 tnum text-navy-600">{m.remote}</td>
                        <td className="px-5 text-right"><span className={cx("inline-flex items-center justify-end gap-2 tnum", m.lateRate >= 20 ? "text-[#B42318] font-semibold" : "")}><span className="w-14"><Meter value={m.lateRate} max={100} color={m.lateRate >= 20 ? "#B42318" : CH.gold} height={5} /></span>{m.lateRate}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <Card en="Attendance heatmap" title="출근 히트맵 · 최근 30일">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `110px repeat(${d30.length}, 1fr)` }}>
                <div />
                {d30.map((d) => <div key={d.key} className={cx("text-center text-[9.5px] tnum", ["토", "일"].includes(d.dow) ? "text-[#C5BEB4]" : "text-[#98928B]")}>{Number(d.key.slice(8))}</div>)}
                {(members || []).map((m) => {
                  const uid = m.uid || m.id;
                  return (
                    <React.Fragment key={uid}>
                      <div className="text-[12px] font-semibold truncate pr-2 leading-[22px]">{m.name}</div>
                      {d30.map((d) => {
                        const r = (att || []).find((x) => x.uid === uid && x.date === d.key);
                        const wk = ["토", "일"].includes(d.dow);
                        const bg = r ? (r.late ? "#C2895A" : r.place && r.place !== "office" ? "#8B7A64" : "#2A2723") : wk ? "#F7F5F1" : "#EDE8E0";
                        return <div key={d.key} title={`${m.name} · ${d.key}${r ? ` · ${r.late ? "지각" : "정시"}${r.place && r.place !== "office" ? " · 원격" : ""}` : wk ? " · 주말" : " · 기록 없음"}`} className="h-[22px] rounded-[4px]" style={{ background: bg }} />;
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
          <Legend items={[["정시 출근", "#2A2723"], ["재택 · 외근", "#8B7A64"], ["지각", "#C2895A"], ["기록 없음", "#EDE8E0"]]} note={`최근 30일 평일 평균 ${(heat.filter((h) => !["토", "일"].includes(h.dow)).reduce((a, h) => a + h.total, 0) / Math.max(1, heat.filter((h) => !["토", "일"].includes(h.dow)).length)).toFixed(1)}명 출근 · 칸에 마우스를 올리면 자세히`} />
        </Card>

        {/* ⑤ 영업 · 업무 흐름 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
          <Card en="Sales by owner" title="담당자별 영업">
            {owners.length === 0 ? <Empty icon="handshake">영업 기록이 없어요.</Empty> : (
              <ul className="space-y-3.5">
                {owners.map((o) => {
                  const max = Math.max(1, ...owners.map((x) => x.value));
                  return (
                    <li key={o.name}>
                      <div className="flex items-baseline justify-between text-[13px]"><span className="font-semibold">{o.name}</span><span className="text-navy-600 tnum">진행 {o.open}곳 · 도입 {o.won}곳 · <b className="text-navy-950">{compactWon(o.value)}원</b></span></div>
                      <div className="mt-1.5"><Meter value={o.value} max={max} color={CH.gold} height={7} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card en="Task flow" title="업무 흐름 · 최근 12주">
            <div className="h-[220px] -ml-2">
              <ResponsiveContainer>
                <ComposedChart data={flow} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={CH.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis allowDecimals={false} width={26} {...axisProps} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "#F7F5F1" }} />
                  <Bar dataKey="등록" fill={CH.stone} radius={[4, 4, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="완료" fill={CH.ink} radius={[4, 4, 0, 0]} maxBarSize={14} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <Legend items={[["등록", CH.stone], ["완료", CH.ink]]} note="주 단위(월요일 시작)" />
          </Card>
        </div>
      </>)}
    </div>
  );
}
