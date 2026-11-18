// ======================= pnk-site/src/pages/Home.jsx =======================
// 🏢 대시보드(2026-11-18 새로 만듦) — 공식 홈페이지와 같은 톤(차콜 · 스톤 · 샴페인 골드)
//  ① 오늘의 브리핑(어두운 띠): 인사 · 한 줄 요약 · 내 출근 상태 · 팀 출근률
//  ② 핵심 숫자(Kpi): 내 업무 · 결재 · 메일 · 영업 파이프라인 (관리자: 이번 달 이익)
//  ③ 업무 처리 흐름(최근 8주 등록 · 완료 · 완료율) · 오늘의 팀
//  ④ 근태 추이(최근 14일) · 영업 단계 · 서비스 상태
//  ⑤ 내 업무 · 다가오는 일정 · 공지 · 메일 / 대표: 로지스웹 사업 관제
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMeCtx } from "../App";
import {
  DEFAULT_LINKS, SERVICES, hm, SERVICE_STATUS, addRow, by, fmtTime, invoiceByMonth, limit, loadPlatform, orderBy, productLabel,
  stageLabel, useCol, useDocLive, where, ymd, PLACES,
} from "../pnkApi";
import { attendanceDaily, briefLines, compactWon, daysBack, financeMonthly, monthsBack, pipeline, taskFlow, teamToday, weeksBack } from "../analytics";
import { Btn, CH, Card, ChartTip, Chip, Delta, Empty, Eyebrow, Input, Kpi, Meter, Ring, Spark, axisProps, cx, fail, moreCls } from "../ui";
import Icon from "../icons";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function greet() {
  const h = new Date().getHours();
  return h < 6 ? "늦은 시간까지 고생 많으십니다" : h < 12 ? "좋은 아침입니다" : h < 18 ? "좋은 오후입니다" : "오늘 하루 수고 많으셨습니다";
}
function useClock() {
  const [t, setT] = React.useState(() => new Date());
  React.useEffect(() => { const i = setInterval(() => setT(new Date()), 30000); return () => clearInterval(i); }, []);
  return t;
}
const STATUS = { in: ["근무 중", "#2F6B4F"], off: ["퇴근", "#98928B"], leave: ["휴가", "#B59B74"], none: ["출근 전", "#D0CCC6"] };

export default function Home() {
  const me = useMeCtx();
  const nav = useNavigate();
  const uid = me.user.uid;
  const today = ymd();
  const now = useClock();
  const d = new Date(now.getTime() + 9 * 3600e3);
  const d14 = daysBack(14);
  const info = useDocLive("pnkCompany/info");
  const [allTasks] = useCol("pnkTasks", [], []);
  const [events] = useCol("pnkEvents", [where("date", ">=", today), orderBy("date"), limit(30)], [today]);
  const [posts] = useCol("pnkPosts", [orderBy("createdAt", "desc"), limit(6)], []);
  const [mails] = useCol("pnkMail", [where("toUids", "array-contains", uid)], [uid]);
  const [sales] = useCol("pnkSales", [], []);
  const [services] = useCol("pnkServices", [], []);
  const [members] = useCol("pnkMembers", [where("status", "==", "active")], []);
  const [att] = useCol("pnkAttendance", [where("date", ">=", d14[0].key)], [d14[0].key]);
  const [aps] = useCol("pnkApprovals", [where("viewers", "array-contains", uid), where("status", "==", "pending")], [uid]);
  const [fin] = useCol(me.isAdmin ? "pnkFinance" : null, [], [me.isAdmin]);
  const [plat, setPlat] = React.useState(undefined);
  React.useEffect(() => { if (me.owner) loadPlatform().then(setPlat); }, [me.owner]);

  const tasks = allTasks || [];
  const openTasks = tasks.filter((t) => t.status !== "done");
  const mine = openTasks.filter((t) => t.assigneeUid === uid).sort((a, b) => String(a.due || "9").localeCompare(String(b.due || "9")));
  const overdue = mine.filter((t) => t.due && t.due < today).length;
  const unread = (mails || []).filter((m) => !m.readBy?.[uid] && !m.trashBy?.[uid]);
  const myTurn = (aps || []).filter((a) => a.line?.[a.step]?.uid === uid);
  const myUp = (aps || []).filter((a) => a.authorUid === uid);
  const todayAtt = (att || []).filter((r) => r.date === today);
  const myAtt = todayAtt.find((r) => r.uid === uid);
  const team = teamToday(members || [], att || [], events || [], today);
  const inCount = team.filter((m) => m.status === "in" || m.status === "off").length;
  const pipe = pipeline(sales || []);
  const followUps = (sales || []).filter((s) => !["won", "lost"].includes(s.stage) && s.nextDate && s.nextDate <= today);
  const todayEvents = (events || []).filter((e) => e.date === today);
  const flow = taskFlow(tasks, weeksBack(8));
  const daily = attendanceDaily(att || [], d14);
  const svc = Object.fromEntries((services || []).map((s) => [s.id, s]));
  const links = info?.links?.length ? info.links : DEFAULT_LINKS;
  const fm = fin ? financeMonthly(fin, monthsBack(6)) : null;
  const curM = fm?.[fm.length - 1], prevM = fm?.[fm.length - 2];
  const doneThisWeek = flow[flow.length - 1]?.완료 || 0, donePrevWeek = flow[flow.length - 2]?.완료 || 0;

  const [quick, setQuick] = React.useState("");
  const addQuick = () => {
    if (!quick.trim()) return;
    const b = by(me);
    addRow("pnkTasks", { title: quick.trim(), desc: "", status: "todo", product: "common", priority: "normal", assigneeUid: b.uid, assigneeName: b.name, due: today, createdBy: b.uid, createdByName: b.name, order: Date.now() })
      .then(() => setQuick("")).catch(fail);
  };
  const brief = briefLines({ approvals: myTurn.length, overdue, todayEvents: todayEvents.length, unread: unread.length, attIn: inCount, members: (members || []).length, followUps: followUps.length });

  return (
    <div className="space-y-5 md:space-y-6">
      {/* ① 오늘의 브리핑 */}
      <section className="rise relative overflow-hidden rounded-[18px] bg-navy-900 text-white">
        <div className="absolute inset-0 opacity-[.55]" style={{ background: "radial-gradient(700px 300px at 85% 0%, rgba(181,155,116,.22), transparent 70%), radial-gradient(500px 260px at 0% 100%, rgba(255,255,255,.05), transparent 70%)" }} />
        <span className="absolute left-6 right-6 top-0 h-px gold-grad opacity-70" />
        <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 p-6 md:p-8">
          <div className="min-w-0">
            <Eyebrow light>Today&apos;s Briefing · {d.getUTCMonth() + 1}월 {d.getUTCDate()}일 {WEEK[d.getUTCDay()]}요일</Eyebrow>
            <h1 className="mt-2 text-[24px] md:text-[30px] font-light tracking-[-0.035em] leading-tight">{me.member?.name || ""}님, <span className="gold-text font-normal">{greet()}</span></h1>
            <ul className="mt-4 flex flex-wrap gap-2">
              {brief.map((t) => <li key={t} className="h-8 px-3.5 rounded-full bg-white/[0.06] border border-white/10 text-[12.5px] text-white/80 flex items-center">{t}</li>)}
            </ul>
            <div className="mt-5 hidden md:flex flex-wrap gap-2">
              {links.slice(0, 5).map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium text-white/60 hover:text-white border border-white/10 hover:border-white/25 transition">{l.label}<Icon name="link" size={12} /></a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-5 lg:pl-8 lg:border-l lg:border-white/10">
            <Ring value={inCount} max={(members || []).length || 1} size={92} stroke={7} color="#C9B08A" track="rgba(255,255,255,.08)">
              <div className="text-center"><div className="text-[22px] font-semibold tnum leading-none">{inCount}<span className="text-[12px] text-white/50">/{(members || []).length}</span></div><div className="eng text-[9px] text-[#CDBB9C] mt-1">On duty</div></div>
            </Ring>
            <div>
              <div className="eng text-[10px] text-white/45">{hm(now)} KST</div>
              <div className="mt-1 text-[16px] font-semibold">{!myAtt ? "출근 전이에요" : myAtt.outAt ? "퇴근했어요" : "근무 중이에요"}</div>
              <div className="text-[12px] text-white/50 tnum">{myAtt?.inAt ? `${hm(new Date(myAtt.inAt))} 출근${myAtt.late ? " · 지각" : ""}` : "버튼을 누르면 출근 화면으로"}{myAtt?.outAt ? ` · ${hm(new Date(myAtt.outAt))} 퇴근` : ""}</div>
              <Link to="/attendance" className="mt-3 inline-flex items-center gap-1.5 h-10 px-5 rounded-full gold-grad text-navy-950 text-[13.5px] font-semibold hover:brightness-105 transition">
                <Icon name="clock" size={15} />{!myAtt ? "출근하기" : myAtt.outAt ? "기록 보기" : "퇴근하기"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ② 핵심 숫자 */}
      <div className={cx("grid grid-cols-2 gap-3 md:gap-4", me.isAdmin ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
        <Kpi en="My tasks" label="내 진행 업무" value={mine.length} unit="건" onClick={() => nav("/tasks")}
          sub={overdue ? `기한 지남 ${overdue}건` : `이번 주 완료 ${doneThisWeek}건`} delta={<Delta now={doneThisWeek} prev={donePrevWeek} />}
          spark={<Spark data={flow.map((w) => w.완료)} color={CH.ink} height={30} />} />
        <Kpi en="Approvals" label="결재할 문서" value={myTurn.length} unit="건" onClick={() => nav("/approvals")} sub={`내가 올린 진행 중 ${myUp.length}건`}
          spark={<div className="mt-1"><Meter value={myTurn.length} max={Math.max(5, myTurn.length)} color={myTurn.length ? CH.gold : CH.stone} height={4} /></div>} />
        <Kpi en="Inbox" label="안 읽은 메일" value={unread.length} unit="통" onClick={() => nav("/mail")} sub={unread[0] ? `최근 · ${unread[0].fromName}` : "새 메일이 없어요"}
          spark={<div className="mt-1"><Meter value={unread.length} max={Math.max(10, unread.length)} color={CH.taupe} height={4} /></div>} />
        <Kpi en="Pipeline" label="영업 파이프라인" value={compactWon(pipe.openValue)} unit="원/월" onClick={() => nav("/sales")} sub={`진행 ${pipe.openN}곳 · 가중 ${compactWon(pipe.weighted)} · 성공률 ${pipe.winRate}%`}
          spark={<div className="mt-1 flex h-[4px] rounded-full overflow-hidden bg-[#EDE8E0]">{pipe.stages.filter((s) => s.key !== "won").map((s, i) => <span key={s.key} style={{ flex: s.n || 0.0001, background: ["#E2D8C8", "#C9BBA6", "#B59B74", "#8B7A64", "#2A2723"][i] }} />)}</div>} />
        {me.isAdmin && (
          <Kpi dark accent en="Net profit" label={`${curM ? Number(curM.m.slice(5)) : ""}월 순이익`} value={curM ? compactWon(curM.이익) : "–"} unit="원" onClick={() => nav("/insights")}
            sub={curM ? `매출 ${compactWon(curM.매출)} · 이익률 ${curM.margin ?? "–"}%` : "장부를 불러오는 중"} delta={curM && prevM ? <Delta now={curM.이익} prev={prevM.이익} /> : null}
            spark={fm ? <Spark data={fm.map((x) => x.이익)} color="#D8C3A0" height={30} /> : null} className="col-span-2 xl:col-span-1" />
        )}
      </div>

      {/* ③ 업무 흐름 · 오늘의 팀 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5">
        <Card en="Productivity" title="업무 처리 흐름" className="xl:col-span-2" right={<Link to="/tasks" className={moreCls}>업무 보드</Link>}>
          <div className="flex flex-wrap gap-x-8 gap-y-2 mb-3">
            {[["진행 중", openTasks.filter((t) => t.status === "doing").length], ["대기", openTasks.filter((t) => t.status === "todo").length], ["8주 완료", flow.reduce((a, w) => a + w.완료, 0)], ["기한 지남(전체)", openTasks.filter((t) => t.due && t.due < today).length]].map(([k, v]) => (
              <div key={k}><div className="text-[11.5px] text-navy-600">{k}</div><div className="text-[20px] font-semibold tnum">{v}</div></div>
            ))}
          </div>
          <div className="h-[230px] -ml-2">
            <ResponsiveContainer>
              <ComposedChart data={flow} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={CH.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis yAxisId="n" allowDecimals={false} width={28} {...axisProps} />
                <YAxis yAxisId="r" orientation="right" domain={[0, 100]} hide />
                <Tooltip content={<ChartTip />} cursor={{ fill: "#F7F5F1" }} />
                <Bar yAxisId="n" dataKey="등록" name="등록" fill={CH.stone} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Bar yAxisId="n" dataKey="완료" name="완료" fill={CH.ink} radius={[4, 4, 0, 0]} maxBarSize={18} />
                <Line yAxisId="r" type="monotone" dataKey="rate" name="완료율(%)" stroke={CH.gold} strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: CH.gold, strokeWidth: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[["등록", CH.stone], ["완료", CH.ink], ["완료율", CH.gold]]} note="최근 8주 · 주 단위(월요일 시작)" />
        </Card>

        <Card en="Team today" title="오늘의 팀" right={<Link to="/attendance" className={moreCls}>근태</Link>} pad={false}>
          <div className="px-5 pt-4 pb-3 grid grid-cols-4 gap-2 border-b border-[#EFECE6]">
            {["in", "off", "leave", "none"].map((k) => (
              <div key={k} className="text-center"><div className="text-[18px] font-semibold tnum" style={{ color: k === "none" ? "#98928B" : CH.ink }}>{team.filter((m) => m.status === k).length}</div><div className="text-[11px] text-navy-600">{STATUS[k][0]}</div></div>
            ))}
          </div>
          {team.length === 0 ? <Empty icon="users">구성원이 없어요.</Empty> : (
            <ul className="max-h-[300px] overflow-y-auto divide-y divide-[#EFECE6]">
              {team.map((m) => (
                <li key={m.uid} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="relative w-8 h-8 rounded-full bg-[#F1EDE6] flex items-center justify-center text-[12.5px] font-semibold shrink-0">{m.name.slice(0, 1)}
                    <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ background: STATUS[m.status][1] }} /></div>
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold truncate">{m.name} <span className="text-[11.5px] font-normal text-navy-600">{m.title}</span></div>
                    <div className="text-[11.5px] text-[#98928B] truncate">{m.dept || "부서 미정"}{m.place ? ` · ${PLACES.find((p) => p.key === m.place)?.label || ""}` : ""}</div></div>
                  <div className="text-right shrink-0"><div className="text-[12px] font-semibold" style={{ color: STATUS[m.status][1] }}>{STATUS[m.status][0]}</div>{m.inAt ? <div className="text-[11px] text-[#98928B] tnum">{hm(new Date(m.inAt))}{m.late ? " · 지각" : ""}</div> : null}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ④ 근태 · 영업 · 서비스 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
        <Card en="Attendance" title="근태 추이 · 최근 14일">
          <div className="h-[190px] -ml-2">
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={CH.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval={1} />
                <YAxis allowDecimals={false} width={24} {...axisProps} />
                <Tooltip content={<ChartTip unit="명" />} cursor={{ fill: "#F7F5F1" }} />
                <Bar dataKey="정시" stackId="a" fill={CH.ink} maxBarSize={14} />
                <Bar dataKey="지각" stackId="a" fill={CH.gold} radius={[3, 3, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[["정시 출근", CH.ink], ["지각", CH.gold]]} note={`평균 ${daily.length ? (daily.reduce((a, x) => a + x.total, 0) / Math.max(1, daily.filter((x) => !["토", "일"].includes(x.dow)).length)).toFixed(1) : 0}명 / 평일`} />
        </Card>

        <Card en="Sales pipeline" title="영업 단계" right={<Link to="/sales" className={moreCls}>영업 관리</Link>}>
          <ul className="space-y-3">
            {pipe.stages.map((s, i) => {
              const max = Math.max(1, ...pipe.stages.map((x) => x.n));
              return (
                <li key={s.key}>
                  <div className="flex items-baseline justify-between text-[12.5px]"><span className="font-semibold">{s.label}</span><span className="text-navy-600 tnum">{s.n}곳 · {compactWon(s.value)}원</span></div>
                  <div className="mt-1.5"><Meter value={s.n} max={max} height={7} color={["#E2D8C8", "#C9BBA6", "#B59B74", "#8B7A64", "#3A3631", "#2A2723"][i]} /></div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 pt-3 border-t border-[#EFECE6] grid grid-cols-3 text-center">
            {[["가중 예상", `${compactWon(pipe.weighted)}`], ["도입 완료", `${pipe.wonN}곳`], ["성공률", `${pipe.winRate}%`]].map(([k, v]) => <div key={k}><div className="text-[11px] text-navy-600">{k}</div><div className="text-[15px] font-semibold tnum">{v}</div></div>)}
          </div>
        </Card>

        <Card en="Services" title="서비스 상태" right={<Link to="/services" className={moreCls}>서비스 현황</Link>} pad={false} className="lg:col-span-2 xl:col-span-1">
          <ul className="divide-y divide-[#EFECE6]">
            {SERVICES.map((s) => {
              const st = SERVICE_STATUS.find((x) => x.key === (svc[s.key]?.status || "ok")) || SERVICE_STATUS[0];
              const open = openTasks.filter((t) => t.product === s.key).length;
              return (
                <li key={s.key} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full border border-line flex items-center justify-center shrink-0 text-navy-700"><Icon name={s.icon} size={17} /></div>
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold truncate">{s.label}</div><div className="text-[11.5px] text-[#98928B] truncate">{svc[s.key]?.version ? `v${svc[s.key].version} · ` : ""}진행 업무 {open}건</div></div>
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: st.key === "ok" ? "#2F6B4F" : st.key === "issue" ? "#B42318" : "#8B7A64" }}>
                    <span className={cx("w-2 h-2 rounded-full", st.key === "issue" && "animate-pulse")} style={{ background: "currentColor" }} />{st.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* 대표: 로지스웹 사업 관제 */}
      {me.owner && (
        <Card dark en="Business control" title="로지스웹 사업 관제" right={<Link to="/customers" className="text-[12px] font-semibold text-[#D8C3A0] hover:text-white">고객사 · 가입자</Link>}>
          {plat === undefined ? <div className="h-[200px] flex items-center justify-center text-[13px] text-white/50">불러오는 중…</div> : !plat ? <div className="py-10 text-center text-[13px] text-white/50">고객사 데이터를 읽지 못했어요.</div> : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
              <div className="h-[220px] -ml-2">
                <ResponsiveContainer>
                  <AreaChart data={monthsBack(6).map((m) => ({ m: `${Number(m.slice(5))}월`, 운송사: plat.monthly[m]?.companies || 0, 직원: plat.monthly[m]?.staff || 0, 기사: plat.monthly[m]?.drivers || 0 }))}>
                    <defs><linearGradient id="hgA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C9B08A" stopOpacity={0.45} /><stop offset="100%" stopColor="#C9B08A" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                    <XAxis dataKey="m" tick={{ fontSize: 11.5, fill: "rgba(255,255,255,.45)" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} width={30} tick={{ fontSize: 11.5, fill: "rgba(255,255,255,.45)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="직원" stroke="#D8C3A0" strokeWidth={2.2} fill="url(#hgA)" />
                    <Area type="monotone" dataKey="기사" stroke="#8B7A64" strokeWidth={1.8} fill="none" />
                    <Area type="monotone" dataKey="운송사" stroke="#FFFFFF" strokeWidth={1.6} fill="none" strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 content-start">
                {[["고객 운송사", plat.totals.companies, "곳"], ["승인 대기", plat.pendingTransport.length + plat.totals.pendingStaff, "건"], ["새 도입 문의", plat.totals.newInquiries, "건"], ["이달 입금 완료", (() => { const inv = invoiceByMonth(plat.invoices)[today.slice(0, 7)]; return inv ? compactWon(inv.paid) : "0"; })(), "원"]].map(([k, v, u]) => (
                  <div key={k} className="rounded-[12px] bg-white/[0.05] border border-white/10 px-4 py-3">
                    <div className="text-[11.5px] text-white/55">{k}</div>
                    <div className="text-[19px] font-semibold tnum">{v}<span className="text-[12px] text-white/50 ml-0.5">{u}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ⑤ 내 업무 · 일정 · 공지 · 메일 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5">
        <Card en="To do" title="내 업무" right={<Link to="/tasks" className={moreCls}>보드</Link>}>
          <div className="flex gap-2 mb-3">
            <Input value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addQuick(); }} placeholder="오늘 할 일 바로 추가" />
            <Btn icon="plus" onClick={addQuick} aria-label="추가" />
          </div>
          {mine.length === 0 ? <div className="text-[13px] text-[#98928B] py-3 text-center">맡은 업무가 없어요.</div> : (
            <ul className="space-y-2">
              {mine.slice(0, 7).map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-[13.5px]">
                  <span className={cx("w-1.5 h-1.5 rounded-full shrink-0", t.status === "doing" ? "bg-gold" : "bg-[#D0CCC6]")} />
                  <span className="flex-1 truncate font-medium">{t.title}</span>
                  <span className="text-[11px] text-[#98928B] shrink-0">{productLabel(t.product)}</span>
                  {t.due && <span className={cx("text-[11.5px] font-semibold shrink-0 tnum", t.due < today ? "text-[#B42318]" : "text-[#98928B]")}>{t.due.slice(5).replace("-", "/")}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card en="Schedule" title="다가오는 일정" right={<Link to="/calendar" className={moreCls}>달력</Link>}>
          {(events || []).length === 0 && followUps.length === 0 ? <div className="text-[13px] text-[#98928B] py-3 text-center">예정된 일정이 없어요.</div> : (
            <ol className="relative border-l border-line ml-1.5 space-y-3">
              {followUps.slice(0, 3).map((s) => (
                <li key={`s${s.id}`} className="pl-4 relative"><span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#B42318]" />
                  <div className="text-[11px] text-[#B42318] font-semibold tnum">영업 · {s.nextDate.slice(5).replace("-", "/")}</div>
                  <div className="text-[13px] font-semibold truncate">{s.company} — {s.nextAction || "연락"}</div><div className="text-[11.5px] text-[#98928B]">{stageLabel(s.stage)} · {s.ownerName}</div></li>
              ))}
              {(events || []).slice(0, 6).map((e) => (
                <li key={e.id} className="pl-4 relative"><span className={cx("absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full", e.date === today ? "gold-grad" : "bg-[#D0CCC6]")} />
                  <div className="text-[11px] text-navy-600 font-semibold tnum">{e.date.slice(5).replace("-", "/")} ({WEEK[new Date(`${e.date}T12:00:00Z`).getUTCDay()]}) · {e.time || "종일"}</div>
                  <div className="text-[13px] font-semibold truncate">{e.title}</div></li>
              ))}
            </ol>
          )}
        </Card>

        <Card en="Notice" title="공지 · 게시글" right={<Link to="/notice" className={moreCls}>전체</Link>} pad={false}>
          {!posts ? null : posts.length === 0 ? <Empty icon="megaphone">아직 올라온 글이 없어요.</Empty> : (
            <ul className="divide-y divide-[#EFECE6]">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link to={`${p.board === "notice" ? "/notice" : "/board"}?id=${p.id}`} className="block px-5 py-3 hover:bg-navy-50">
                    <div className="flex items-center gap-2"><Chip tone={p.board === "notice" ? "dark" : "gray"}>{p.board === "notice" ? "공지" : p.board === "minutes" ? "회의록" : "게시판"}</Chip>
                      <span className={cx("flex-1 min-w-0 truncate text-[13.5px]", !p.readBy?.[uid] && p.authorUid !== uid ? "font-semibold" : "text-navy-700")}>{p.title}</span></div>
                    <div className="mt-1 text-[11.5px] text-[#98928B]">{p.authorName} · {fmtTime(p.createdAt)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card en="Mail" title="안 읽은 메일" right={<Link to="/mail" className={moreCls}>메일함</Link>} pad={false}>
          {unread.length === 0 ? <div className="text-[13px] text-[#98928B] py-8 text-center">새 메일이 없어요.</div> : (
            <ul className="divide-y divide-[#EFECE6]">
              {[...unread].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 6).map((m) => (
                <li key={m.id}><Link to={`/mail?id=${m.id}`} className="block px-5 py-3 hover:bg-navy-50">
                  <div className="flex items-center gap-2"><span className="text-[13px] font-semibold truncate flex-1">{m.fromName}</span><span className="text-[11px] text-[#98928B]">{fmtTime(m.createdAt)}</span></div>
                  <div className="text-[12.5px] text-navy-700 truncate">{m.subject}</div>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

export function Legend({ items, note }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-navy-600">
      {items.map(([k, c]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c }} />{k}</span>)}
      {note && <span className="ml-auto text-[#98928B]">{note}</span>}
    </div>
  );
}
