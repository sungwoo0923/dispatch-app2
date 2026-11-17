// ======================= src/ExecStaffInfo.jsx =======================
// 👔 2026-11-08 임원 화면 · 직원 정보(읽기 전용) — 인사관리부 › 직원관리(HrHub StaffInfoBoard)를 임원용으로 보기만
// 👑 2026-11-17 대표용 "조직 현황" 보고서판으로 다시 그림(src/execUi.jsx 디자인 시스템)
//  · 결론 한 줄 → 재직 · 오늘 근무 · 평균 근속 · 인건비 타일 → 오늘 출근 현황 · 부서별 인원 구성 → 인건비 추이 · 근속/입사 → 휴가 · 부재 일정 → 직원 목록 · 상세
//  · 저장·수정 기능 없음: 이 파일은 Firestore 쓰기 함수를 하나도 가져오지 않는다(onSnapshot · getDoc만). 입력칸은 목록 검색·필터뿐
//  · 급여·급여 대장(payroll*)은 읽지 않는다 — 경리 전용(비밀번호)이라 임원 화면에서 보이지 않게
//    인건비는 회계 장부(acctLedger) 지출 중 급여 · 상여 · 퇴직급여 · 4대 보험 계정 합계만 보여 준다(개인별 금액 없음)
//  · 데이터: users(회사 직원 · 부서/직책/입사일/연락처/재직 상태/인사발령 이력 personnelHistory)
//           userProfiles/{uid}(입사일 · 연차 조정 · 입사 서류 체크 onboarding — 선택한 사람만) · hrResumes/{uid}(자격·면허만)
//           attendance(이번 달 출근 기록) · approvals(회사 연차 결재: cat == "leave") · acctLedger(인건비 계정 합계)
import React from "react";
import { isLateAt } from "./lateRule"; // ⏰ 2026-11-07 지각 기준 공용
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { isDemoOn } from "./devDemoData";
import { execAnalyticsDemo } from "./execAnalyticsDemo";
import { kstToday, addDay, isBizDay, dayDiff, rangeDays, prevYm, mdDow } from "./dailyReportCore";
import { useCompanyPeople } from "./dailyReport";
import { useCompanyRows } from "./companyColStore";
import { isTMUser } from "./staffFilter";
import { isExecProfile } from "./hrConstants";
import { leaveEntitlement, leaveUseOf } from "./approvalForms";
import { ONBOARD_ITEMS } from "./HrTools";
import { ResponsiveContainer, ComposedChart, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { EX, EX_NUM, GOLD_GRAD, ExecPage, ExecPanel, ExecKpis, ExecGrid, ExecTabs, Kpi, Num, Eyebrow, GoldRule, Meter, Chip, Empty, Legend, ExecTooltip, chartTheme, fmtMan, fmtEokMan, pctChange } from "./execUi";

const demoOn = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };
const OUT = ["driver", "shipper", "cafeUser", "totalMaster"];
const LEAVE_ST = ["휴직", "육아휴직", "출산휴가"];
const WORK = new Set(["출근", "외근", "조퇴"]);
const LEAVE = new Set(["연차", "오전반차", "오후반차", "병가", "경조사", "휴가"]);
const hmOf = (iso) => { const m = String(iso || "").match(/T(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]}` : ""; };
const isLate = (rec, u) => (!!rec?.checkInTime && rec.status === "출근" && isLateAt(hmOf(rec.checkInTime), u)); // ⏰ 2026-11-07 src/lateRule.js 공용
const isYmd = (d) => /^\d{4}-\d{2}-\d{2}/.test(String(d || ""));
const tenureM = (h, today) => (isYmd(h) ? Math.max(0, Math.floor(dayDiff(String(h).slice(0, 10), today) / 30.44)) : null);
const tenure = (h, today) => { const m = tenureM(h, today); if (m == null) return ""; return m < 1 ? "1개월 미만" : `${Math.floor(m / 12) ? `${Math.floor(m / 12)}년 ` : ""}${m % 12 ? `${m % 12}개월` : ""}`.trim(); };
const dot = (d) => String(d || "").replace(/-/g, ".");
const dd = (n) => { const v = Math.round((Number(n) || 0) * 100) / 100; return v.toLocaleString("ko-KR"); }; // 12.5일처럼 반차까지
const statusOf = (u) => u.employmentStatus || "재직";
const teamOf = (u) => u.team || "미배정";
const READ_ONLY = true; // 이 화면은 보기만 — 쓰기 동작을 추가하지 않는다

// 직급 묶음(부서별 인원 구성 막대 색)
const TIERS = [
  ["임원", EX.gold, ["대표", "대표이사", "사장", "부사장", "전무", "상무", "이사"]],
  ["관리자", EX.ice, ["실장", "부장", "차장", "팀장", "파트장"]],
  ["과장 · 대리", "#6E8BC9", ["과장", "대리"]],
  ["주임 · 사원", "#7FD1C2", ["주임", "사원", "인턴"]],
  ["기타", "rgba(232,238,250,.14)", []],
];
const POS_ORDER = TIERS.flatMap((t) => t[2]);
const tierOf = (u) => { if (isExecProfile(u)) return 0; const p = String(u.position || "").trim(); const i = TIERS.findIndex((t) => t[2].includes(p)); return i < 0 ? 4 : i; };
// 인건비 계정(회계 장부) — 개인별이 아니라 계정 합계만
const laborKey = (acc) => { const a = String(acc || ""); if (/퇴직/.test(a)) return "퇴직급여"; if (/4대\s*보험|사회보험|국민연금|건강보험|고용보험|산재보험/.test(a)) return "4대 보험"; if (/급여|상여|잡급|일용|인건비|임금/.test(a)) return "급여 · 상여"; return null; };
const LABOR = [["급여 · 상여", EX.gold], ["4대 보험", EX.ice], ["퇴직급여", "#6E8BC9"]];
const TONE = { 정상: EX.gold, 외근: EX.ice, 지각: EX.warn, 휴가: "#B9A4E8", 미출근: "rgba(232,238,250,.22)" };

function useQ(col, conds, on) {
  const key = JSON.stringify(conds);
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!on || conds.some(([, v]) => !v)) return undefined;
    return onSnapshot(query(collection(db, col), ...conds.map(([k, v]) => where(k, "==", v))), (s) => setRows(s.docs.map((x) => ({ id: x.id, ...x.data() }))), () => setRows([]));
  }, [col, key, on]);
  return rows;
}
// 선택한 직원의 입사일·연차 조정·서류 체크 · 자격 — 필요한 칸만 꺼낸다(다른 값은 화면에 넘기지 않음)
function usePersonExtra(uid, demo) {
  const [x, setX] = React.useState(null);
  React.useEffect(() => {
    if (!uid) { setX(null); return undefined; }
    if (demo) { const p = demo.profiles[uid] || {}; setX({ hireDate: p.hireDate || "", leaveAdjust: p.leaveAdjust || [], onboarding: p.onboarding || {}, certs: demo.resumes[uid]?.certificates || [] }); return undefined; }
    let alive = true;
    Promise.all([getDoc(doc(db, "userProfiles", uid)).catch(() => null), getDoc(doc(db, "hrResumes", uid)).catch(() => null)]).then(([p, r]) => {
      if (!alive) return;
      const pd = p?.exists?.() ? p.data() : {}; const rd = r?.exists?.() ? r.data() : {};
      setX({ hireDate: pd.hireDate || "", leaveAdjust: Array.isArray(pd.leaveAdjust) ? pd.leaveAdjust : [], onboarding: pd.onboarding || {}, certs: Array.isArray(rd.certificates) ? rd.certificates.map((c) => ({ date: c.date || "", name: c.name || "", issuer: c.issuer || "" })) : [] });
    });
    return () => { alive = false; };
  }, [uid, demo]);
  return x;
}

// ── 작은 부품 ──
function Avatar({ u, size = 40 }) {
  const ex = isExecProfile(u);
  return (
    <span className="grid place-items-center shrink-0 font-black" style={{ width: size, height: size, borderRadius: size * 0.32, fontSize: size * 0.4, ...(ex ? { background: GOLD_GRAD, color: "#1A1408" } : { background: "linear-gradient(135deg,#1B2B4B,#2D4C82)", color: EX.text, border: `1px solid ${EX.line}` }) }}>{String(u.name || "?").slice(0, 1)}</span>
  );
}
const Stat = ({ l, v, unit, color = EX.text, size = 22 }) => (
  <div className="rounded-2xl px-3.5 py-3 min-w-0" style={{ background: "rgba(255,255,255,.035)", border: `1px solid ${EX.line}` }}>
    <div className="text-[12px] font-bold truncate" style={{ color: EX.mute }}>{l}</div>
    <div className="mt-1.5"><Num value={v} unit={unit} size={size} weight={800} color={color} /></div>
  </div>
);
const Row = ({ l, v }) => (
  <div className="grid gap-3 py-2.5 text-[13.5px]" style={{ gridTemplateColumns: "96px minmax(0,1fr)", borderTop: "1px solid rgba(255,255,255,.05)" }}>
    <span className="font-semibold" style={{ color: EX.mute }}>{l}</span>
    <span className="min-w-0 font-bold break-all" style={{ color: EX.text }}>{v || "–"}</span>
  </div>
);
const selSt = { height: 40, borderRadius: 12, border: `1px solid ${EX.line}`, padding: "0 10px", fontSize: 13.5, fontWeight: 700, background: "rgba(255,255,255,.05)", color: EX.text, fontFamily: "inherit", colorScheme: "dark", width: "100%", minWidth: 0 };

export default function ExecStaffInfo({ company }) {
  const demo = demoOn() ? execAnalyticsDemo(company) : null;
  const today = kstToday(); const ym = today.slice(0, 7);
  const live = useCompanyPeople(demo ? "" : company);
  const peopleRaw = demo ? demo.people : live || [];
  const people = React.useMemo(() => peopleRaw.map((u) => ({ ...u, id: u.id || u.uid, uid: u.uid || u.id })).filter((u) => (u.companyName || DEFAULT_COMPANY) === company && !OUT.includes(u.role) && !isTMUser(u) && u.approved !== false), [peopleRaw, company]);
  const attLive = useQ("attendance", [["companyName", company], ["month", ym]], !demo);
  const leaveLive = useQ("approvals", [["company", company], ["cat", "leave"]], !demo);
  const ledgerLive = useCompanyRows("acctLedger", demo ? "" : company); // 인건비 = 장부 계정 합계(급여 상세는 읽지 않음)
  const attByDate = React.useMemo(() => { if (demo) return demo.attendance; const m = {}; (attLive || []).forEach((a) => { if (a?.date) (m[a.date] = m[a.date] || []).push(a); }); return m; }, [demo, attLive]);
  const leaveAp = demo ? demo.approvals.filter((a) => a.cat === "leave") : leaveLive || [];
  const ledger = demo ? demo.ledger : ledgerLive || [];

  const [q, setQ] = React.useState("");
  const [team, setTeam] = React.useState("");
  const [pos, setPos] = React.useState("");
  const [st, setSt] = React.useState("재직");
  const [sel, setSel] = React.useState(null);
  const detailRef = React.useRef(null);
  const active = people.filter((u) => statusOf(u) !== "퇴사");
  const working = active.filter((u) => statusOf(u) === "재직");
  const onLeaveSt = active.filter((u) => LEAVE_ST.includes(statusOf(u)));
  const byUid = React.useMemo(() => Object.fromEntries(people.map((u) => [u.uid, u])), [people]);
  const teams = [...new Set(people.map(teamOf))].sort((a, b) => a.localeCompare(b, "ko"));
  const positions = [...new Set(people.filter((u) => !team || teamOf(u) === team).map((u) => u.position).filter(Boolean))];
  const kw = q.trim();
  const shown = people.filter((u) => (!team || teamOf(u) === team) && (!pos || u.position === pos)
    && (st === "all" || (st === "재직" ? statusOf(u) === "재직" : st === "휴직" ? LEAVE_ST.includes(statusOf(u)) : statusOf(u) === "퇴사"))
    && (!kw || [u.name, u.team, u.position, u.phone, u.email].some((v) => String(v || "").includes(kw))))
    .sort((a, b) => (isExecProfile(b) - isExecProfile(a)) || String(a.team || "힣").localeCompare(String(b.team || "힣"), "ko") || String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  const cur = people.find((u) => u.id === sel) || null;

  // ── 오늘 출근 현황(영업일이 아니면 마지막 영업일) ──
  const day = (() => { let d = today; for (let i = 0; i < 10 && !isBizDay(d); i++) d = addDay(d, -1); return d; })();
  const recs = attByDate[day] || [];
  const apPeriod = (a) => { const p = a.data?.period; if (p?.start) return [p.start, p.end || p.start]; const d = a.data?.date; return d ? [d, d] : null; };
  const onLeaveOn = (u, d) => leaveAp.some((a) => a.drafterUid === u.uid && a.status === "approved" && (() => { const x = leaveUseOf(a); if (!x) return false; const p = a.data?.period; return p?.start ? d >= p.start && d <= (p.end || p.start) : x.date === d; })());
  const todayStat = React.useMemo(() => {
    const g = { 정상: [], 외근: [], 지각: [], 휴가: [], 미출근: [] };
    working.forEach((u) => {
      const r = recs.find((a) => a.uid === u.uid); const s = r?.status;
      if (s && WORK.has(s)) { if (s === "외근") g.외근.push(u); else if (isLate(r, u)) g.지각.push(u); else g.정상.push(u); }
      else if ((s && LEAVE.has(s)) || onLeaveOn(u, day)) g.휴가.push(u);
      else g.미출근.push(u);
    });
    const present = g.정상.length + g.외근.length + g.지각.length;
    return { g, n: working.length, present, late: g.지각.length, leave: g.휴가.length, outside: g.외근.length, none: g.미출근.length };
  }, [working.length, recs, leaveAp]);

  // ── 부서별 인원 구성(재직 + 휴직) ──
  const byTeam = React.useMemo(() => {
    const m = {};
    active.forEach((u) => { const t = teamOf(u); const e = (m[t] = m[t] || { t, n: 0, tiers: [0, 0, 0, 0, 0], pos: {}, ex: 0, leave: 0 }); e.n += 1; e.tiers[tierOf(u)] += 1; const p = String(u.position || "직책 없음"); e.pos[p] = (e.pos[p] || 0) + 1; if (isExecProfile(u)) e.ex += 1; if (LEAVE_ST.includes(statusOf(u))) e.leave += 1; });
    return Object.values(m).sort((a, b) => (b.ex > 0) - (a.ex > 0) || b.n - a.n || a.t.localeCompare(b.t, "ko"));
  }, [active.length, people]);
  const maxTeam = Math.max(1, ...byTeam.map((x) => x.n));
  const usedTiers = TIERS.map((t, i) => [t[0], t[1], byTeam.some((x) => x.tiers[i])]).filter((t) => t[2]);

  // ── 근속 · 입사 ──
  const tenures = active.map((u) => tenureM(u.hireDate, today)).filter((m) => m != null);
  const avgTenureY = tenures.length ? tenures.reduce((s, m) => s + m, 0) / tenures.length / 12 : null;
  const BUCKETS = [["1년 미만", 0, 12], ["1 ~ 3년", 12, 36], ["3 ~ 5년", 36, 60], ["5 ~ 10년", 60, 120], ["10년 이상", 120, 1e9]];
  const buckets = BUCKETS.map(([l, a, b]) => ({ l, n: tenures.filter((m) => m >= a && m < b).length }));
  const maxB = Math.max(1, ...buckets.map((b) => b.n));
  const yr = Number(today.slice(0, 4));
  const years = [5, 4, 3, 2, 1, 0].map((k) => String(yr - k));
  const hireYears = years.map((y) => ({ y: `${y.slice(2)}년`, 입사: people.filter((u) => String(u.hireDate || "").startsWith(y)).length, 퇴사: people.filter((u) => statusOf(u) === "퇴사" && String(u.resignedAt || "").startsWith(y)).length }));
  const yAgo = addDay(today, -365);
  const hired12 = people.filter((u) => isYmd(u.hireDate) && u.hireDate > yAgo && u.hireDate <= today).length;
  const left12 = people.filter((u) => statusOf(u) === "퇴사" && isYmd(u.resignedAt) && u.resignedAt > yAgo).length;
  const hiredMonth = people.filter((u) => String(u.hireDate || "").startsWith(ym)).length;

  // ── 인건비(회계 장부 기준) ──
  const months = React.useMemo(() => { const out = [ym]; for (let i = 0; i < 5; i++) out.unshift(prevYm(out[0])); return out; }, [ym]);
  const labor = React.useMemo(() => {
    const m = Object.fromEntries(months.map((x) => [x, { m: x, label: `${Number(x.slice(5))}월`, total: 0, "급여 · 상여": 0, "4대 보험": 0, 퇴직급여: 0 }]));
    (ledger || []).forEach((r) => { if ((r.type || "지출") !== "지출") return; const e = m[String(r.date || "").slice(0, 7)]; const k = laborKey(r.account); if (!e || !k) return; const v = Math.round(Number(String(r.amount ?? 0).replace(/[^\d.-]/g, "")) || 0); e[k] += v; e.total += v; });
    return months.map((x) => m[x]);
  }, [ledger, months]);
  const laborHas = labor.some((x) => x.total > 0);
  const laborUsed = LABOR.filter(([k]) => labor.some((x) => x[k]));
  // 대표 달: 이번 달 기록이 있으면 이번 달, 아직(급여일 전)이면 지난달
  const li = labor[5].total > 0 ? 5 : 4;
  const laborCur = labor[li]; const laborPrev = labor[li - 1];
  const labor6 = labor.reduce((s, x) => s + x.total, 0);
  const perHead = working.length && laborCur.total ? laborCur.total / working.length : 0;

  // ── 휴가 · 부재 일정(이번 달 1일 ~ 앞으로 2주) ──
  const winFrom = `${ym}-01`; const winTo = (() => { const end = addDay(`${(ym.slice(5) === "12" ? `${Number(ym.slice(0, 4)) + 1}-01` : `${ym.slice(0, 5)}${String(Number(ym.slice(5)) + 1).padStart(2, "0")}`)}-01`, -1); const t2 = addDay(today, 14); return t2 > end ? t2 : end; })();
  const absences = React.useMemo(() => {
    const out = [];
    leaveAp.forEach((a) => {
      if (!["approved", "pending"].includes(a.status)) return; const p = apPeriod(a); if (!p) return; const [s, e] = p; if (e < winFrom || s > winTo) return;
      const u = byUid[a.drafterUid]; if (!u && !a.drafterName) return;
      const kind = a.data?.ampm || a.data?.kind || a.formLabel || "휴가";
      out.push({ id: a.id, u: u || { name: a.drafterName, uid: a.drafterUid }, kind: String(kind).replace("신청서", ""), s, e, days: leaveUseOf(a)?.days, pending: a.status === "pending" });
    });
    // 오늘 근태에 휴가로 찍힌 사람(결재 기록이 없는 경우)
    todayStat.g.휴가.forEach((u) => { if (!out.some((x) => x.u.uid === u.uid && x.s <= day && x.e >= day)) { const r = recs.find((a) => a.uid === u.uid); out.push({ id: `att-${u.uid}`, u, kind: r?.status || "휴가", s: day, e: day, days: r?.status?.includes("반차") ? 0.5 : 1, fromAtt: true }); } });
    // 휴직 중(기간이 이 창과 겹치면)
    onLeaveSt.forEach((u) => { const f = u.leave?.from || ""; const t = u.leave?.to || "9999-12-31"; if (f && (t < winFrom || f > winTo)) return; out.push({ id: `lv-${u.uid}`, u, kind: statusOf(u), s: f, e: u.leave?.to || "", long: true }); });
    return out.sort((a, b) => String(a.s).localeCompare(String(b.s)));
  }, [leaveAp, byUid, todayStat, onLeaveSt.length, winFrom, winTo]);
  const absNow = absences.filter((x) => x.long || (x.s <= day && (x.e || x.s) >= day));
  const absNext = absences.filter((x) => !x.long && x.s > day);
  const absPast = absences.filter((x) => !x.long && (x.e || x.s) < day);

  const pick = (u) => { setSel(u.id); setTimeout(() => { try { if (window.innerWidth < 1100) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* 무시 */ } }, 30); };
  const loading = !demo && live === null;
  const rate = todayStat.n ? (todayStat.present / todayStat.n) * 100 : 0;
  const dayLabel = day === today ? "오늘" : `${mdDow(day)}(마지막 영업일)`;

  // 결론 한 줄
  const brief = (
    <>
      재직 <b style={{ color: EX.goldHi }}>{working.length}명</b>{onLeaveSt.length ? ` · 휴직 ${onLeaveSt.length}명` : ""}입니다.{" "}
      {dayLabel} <b style={{ color: EX.text }}>{todayStat.present}명</b>이 근무 중이며{todayStat.late || todayStat.leave || todayStat.none ? ` ${[todayStat.late ? `지각 ${todayStat.late}명` : "", todayStat.leave ? `휴가 ${todayStat.leave}명` : "", todayStat.none ? `미출근 ${todayStat.none}명` : ""].filter(Boolean).join(" · ")}입니다.` : " 결근 · 지각은 없습니다."}{" "}
      {laborHas ? <>{li === 5 ? "이번 달" : "지난달"} 인건비는 장부 기준 <b style={{ color: EX.text }}>{fmtEokMan(laborCur.total)}</b>입니다.</> : null}
    </>
  );

  return (
    <ExecPage testId="exec-staff" en="PEOPLE · ORGANIZATION" title="직원 정보" sub="회사 조직과 근무 현황입니다 · 보기 전용(수정은 인사관리부에서 합니다)" right={<Chip tone="mute">{dot(today)} 기준</Chip>}>
      {loading ? (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[120px] rounded-[20px] animate-pulse" style={{ background: EX.panel, border: `1px solid ${EX.line}` }} />)}</div>
      ) : (<>
        <div className="rounded-[18px] px-4 md:px-6 py-3.5 md:py-4 flex items-start gap-3" style={{ background: "linear-gradient(90deg, rgba(215,188,130,.10), rgba(255,255,255,.02) 70%)", border: `1px solid ${EX.lineHi}` }}>
          <span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: EX.gold, boxShadow: `0 0 10px ${EX.gold}` }} />
          <p className="text-[14px] md:text-[15px] font-semibold leading-relaxed" style={{ color: EX.sub, wordBreak: "keep-all" }}>{brief}</p>
        </div>

        <ExecKpis min={165}>
          <Kpi accent en="HEADCOUNT" label="재직 인원" value={working.length} unit="명" foot={`휴직 ${onLeaveSt.length}명 · 이번 달 입사 ${hiredMonth}명`} />
          <Kpi en="ON DUTY" label={`${day === today ? "오늘" : mdDow(day)} 근무 중`} value={todayStat.present} unit={`/ ${todayStat.n}명`} foot={`출근율 ${rate.toFixed(0)}% · 출근 기록 기준`} />
          <Kpi en="AVG. TENURE" label="평균 근속" value={avgTenureY == null ? "—" : avgTenureY.toFixed(1)} unit="년" foot={`입사일 등록 ${tenures.length}명 기준`} />
          <Kpi en="LABOR COST" label={`${li === 5 ? "이번 달" : "지난달"} 인건비`} money={laborCur.total} delta={laborHas ? pctChange(laborCur.total, laborPrev.total) : undefined} deltaLabel="전월 대비" invert foot="회계 장부 기준" />
        </ExecKpis>

        <ExecGrid cols="minmax(0,1fr) minmax(0,1.3fr)">
          {/* 오늘 출근 현황 */}
          <ExecPanel en="TODAY · ATTENDANCE" title="오늘 출근 현황" sub={day === today ? "출근 기록 기준 · 재직자" : `${mdDow(day)} 기준(마지막 영업일) · 재직자`}>
            <div data-testid="staff-today">
              <div className="mt-2 flex items-baseline gap-2">
                <Num value={todayStat.present} size={44} color={EX.goldHi} />
                <span className="text-[15px] font-bold" style={{ ...EX_NUM, color: EX.sub }}>/ {todayStat.n}명 근무 중</span>
                <span className="ml-auto text-[12.5px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>출근율 {rate.toFixed(0)}%</span>
              </div>
              <div className="mt-4 flex h-3.5 w-full overflow-hidden rounded-full gap-[2px]" style={{ background: "rgba(255,255,255,.05)" }}>
                {Object.entries(todayStat.g).filter(([, a]) => a.length).map(([k, a]) => <span key={k} title={`${k} ${a.length}명`} style={{ width: `${(a.length / Math.max(1, todayStat.n)) * 100}%`, background: k === "정상" ? GOLD_GRAD : TONE[k] }} />)}
              </div>
              <div className="mt-4 grid grid-cols-5 gap-1.5">
                {[["정상", "정상 출근"], ["외근", "외근"], ["지각", "지각"], ["휴가", "휴가"], ["미출근", "미출근"]].map(([k, l]) => (
                  <div key={k} className="min-w-0 rounded-xl px-2 py-2.5 text-center" style={{ background: "rgba(255,255,255,.03)", border: `1px solid ${EX.line}` }}>
                    <div className="flex items-center justify-center gap-1 text-[11.5px] font-bold whitespace-nowrap" style={{ color: EX.mute }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE[k] }} />{l}</div>
                    <div className="mt-1 text-[20px] font-black leading-none" style={{ ...EX_NUM, color: k === "지각" && todayStat.g[k].length ? EX.warn : EX.text }}>{todayStat.g[k].length}</div>
                  </div>
                ))}
              </div>
              {["지각", "휴가", "외근", "미출근"].some((k) => todayStat.g[k].length) && (
                <div className="mt-4 space-y-2">
                  {["지각", "휴가", "외근", "미출근"].filter((k) => todayStat.g[k].length).map((k) => (
                    <div key={k} className="flex items-start gap-2 min-w-0 text-[12.5px]">
                      <span className="shrink-0 w-12 font-bold" style={{ color: EX.mute }}>{k}</span>
                      <span className="min-w-0 font-semibold leading-relaxed" style={{ color: EX.sub }}>{todayStat.g[k].slice(0, 8).map((u) => `${u.name}${u.position ? ` ${u.position}` : ""}`).join(" · ")}{todayStat.g[k].length > 8 ? ` 외 ${todayStat.g[k].length - 8}명` : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ExecPanel>

          {/* 부서별 인원 구성 */}
          <ExecPanel en="ORGANIZATION" title="부서별 인원 구성" sub={`재직 ${working.length}명 · 휴직 ${onLeaveSt.length}명 · 직급 구성`} right={<span className="hidden md:block"><Legend items={usedTiers.map(([l, c]) => [l, c])} /></span>}>
            {!byTeam.length ? <Empty text="등록된 직원이 없습니다" sub="인사관리부에서 직원을 등록하면 보입니다" /> : (
              <ul className="mt-1">
                {byTeam.map((x) => (
                  <li key={x.t} className="py-3 grid items-center gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: "minmax(72px,110px) minmax(0,1fr) 52px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
                    <span className="text-[14px] font-extrabold truncate" style={{ color: EX.text }}>{x.t}</span>
                    <div className="min-w-0">
                      <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]" style={{ width: `${Math.max(6, (x.n / maxTeam) * 100)}%` }}>
                        {x.tiers.map((n, i) => n ? <span key={i} title={`${TIERS[i][0]} ${n}명`} style={{ flex: n, background: i === 0 ? GOLD_GRAD : TIERS[i][1] }} /> : null)}
                      </div>
                      <div className="mt-1.5 text-[12px] font-semibold truncate" style={{ color: EX.mute }}>
                        {Object.entries(x.pos).sort((a, b) => (POS_ORDER.indexOf(a[0]) + 1 || 99) - (POS_ORDER.indexOf(b[0]) + 1 || 99)).map(([p, n]) => `${p} ${n}`).join(" · ")}{x.leave ? ` · 휴직 ${x.leave}` : ""}
                      </div>
                    </div>
                    <span className="text-right"><Num value={x.n} unit="명" size={18} weight={800} /></span>
                  </li>
                ))}
              </ul>
            )}
            <div className="md:hidden mt-3"><Legend items={usedTiers.map(([l, c]) => [l, c])} /></div>
          </ExecPanel>
        </ExecGrid>

        <ExecGrid cols="minmax(0,1.3fr) minmax(0,1fr)">
          {/* 인건비 */}
          <ExecPanel en="LABOR COST · 6 MONTHS" title="인건비 추이" sub="회계 장부 기준 · 개인별 급여는 표시하지 않습니다 · 단위 만원" right={laborHas ? <span className="hidden md:block"><Legend items={laborUsed} /></span> : null}>
            {!laborHas ? <Empty text="장부에 인건비 기록이 없습니다" sub="경리 담당자가 수입 · 지출 장부에 급여 · 상여 · 4대 보험 계정으로 적으면 보입니다" /> : (<>
              <div className="h-[230px] md:h-[250px] -ml-2 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={labor} margin={{ top: 10, right: 6, left: 0, bottom: 0 }} barCategoryGap="34%">
                    <CartesianGrid {...chartTheme.grid} />
                    <XAxis dataKey="label" {...chartTheme.axis} dy={6} />
                    <YAxis {...chartTheme.axis} width={52} tickFormatter={(v) => fmtMan(v)} />
                    <Tooltip cursor={chartTheme.cursor} content={<ExecTooltip fmt={(v) => fmtMan(v)} unit="만원" />} />
                    {laborUsed.map(([k, c], i) => <Bar key={k} dataKey={k} name={k} stackId="l" fill={c} fillOpacity={i ? 0.9 : 1} radius={i === laborUsed.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} maxBarSize={38} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="md:hidden mt-2"><Legend items={laborUsed} /></div>
              <div className="mt-3 grid grid-cols-3 gap-px rounded-2xl overflow-hidden" style={{ border: `1px solid ${EX.line}`, background: EX.line }}>
                {[[`${li === 5 ? "이번 달" : "지난달"}`, fmtMan(laborCur.total)], ["6개월 합계", fmtMan(labor6)], ["재직 1인당(월)", fmtMan(perHead)]].map(([l, v]) => (
                  <div key={l} className="px-3.5 py-3 min-w-0" style={{ background: EX.bg1 }}>
                    <div className="text-[11.5px] font-bold truncate" style={{ color: EX.mute }}>{l}</div>
                    <div className="mt-1"><Num value={v} unit="만원" size={18} weight={800} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 text-[11.5px] font-medium leading-relaxed" style={{ color: EX.faint, wordBreak: "keep-all" }}>급여 · 상여 · 퇴직급여 · 4대 보험 계정의 장부 지출 합계입니다. 1인당 금액은 합계를 재직 인원으로 나눈 평균이며, 개인별 급여는 경리 담당자만 볼 수 있습니다.</div>
            </>)}
          </ExecPanel>

          {/* 근속 · 입사 */}
          <ExecPanel en="TENURE · HIRING" title="근속 분포 · 입사 추이" sub={`최근 1년 입사 ${hired12}명 · 퇴사 ${left12}명`}>
            <ul className="mt-1 space-y-2.5">
              {buckets.map((b) => (
                <li key={b.l} className="grid items-center gap-3" style={{ gridTemplateColumns: "72px minmax(0,1fr) 40px" }}>
                  <span className="text-[12.5px] font-bold whitespace-nowrap" style={{ color: EX.sub }}>{b.l}</span>
                  <Meter value={b.n} max={maxB} height={8} color={b.l === "10년 이상" || b.l === "5 ~ 10년" ? EX.gold : EX.ice} />
                  <span className="text-right text-[13.5px] font-black" style={{ ...EX_NUM, color: EX.text }}>{b.n}<span className="ml-0.5 text-[11px] font-bold" style={{ color: EX.mute }}>명</span></span>
                </li>
              ))}
            </ul>
            <GoldRule className="mt-5" />
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-extrabold" style={{ color: EX.sub }}>연도별 입사 · 퇴사</span>
              <Legend items={[["입사", EX.gold], ["퇴사", EX.ice]]} />
            </div>
            <div className="h-[130px] -ml-2 mt-1">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hireYears} margin={{ top: 8, right: 6, left: 0, bottom: 0 }} barGap={3} barCategoryGap="30%">
                  <CartesianGrid {...chartTheme.grid} />
                  <XAxis dataKey="y" {...chartTheme.axis} />
                  <YAxis {...chartTheme.axis} width={28} allowDecimals={false} />
                  <Tooltip cursor={chartTheme.cursor} content={<ExecTooltip fmt={(v) => v} unit="명" />} />
                  <Bar dataKey="입사" name="입사" fill={EX.gold} radius={[4, 4, 0, 0]} maxBarSize={16} />
                  <Bar dataKey="퇴사" name="퇴사" fill={EX.ice} fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={16} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ExecPanel>
        </ExecGrid>

        {/* 휴가 · 부재 일정 */}
        <ExecPanel en="LEAVE · ABSENCE" title="휴가 · 부재 일정" sub={`${Number(ym.slice(5))}월 1일 ~ ${dot(winTo).slice(5)} · 전자결재 휴가 · 근태 기록 · 휴직 기준`}>
          {!absences.length ? <Empty text="이 기간에 휴가 · 부재 일정이 없습니다" /> : (
            <div className="grid gap-x-8 gap-y-4 mt-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))" }}>
              {[["지금 부재 중", absNow, "gold"], ["예정", absNext, "ice"], ["이번 달 지난 일정", absPast, "mute"]].map(([l, arr, tone]) => (
                <div key={l} className="min-w-0">
                  <div className="flex items-center justify-between gap-2 pb-2" style={{ borderBottom: `1px solid ${EX.line}` }}>
                    <span className="text-[13px] font-extrabold" style={{ color: EX.sub }}>{l}</span>
                    <Chip tone={tone}>{arr.length}건</Chip>
                  </div>
                  {!arr.length ? <div className="py-4 text-[12.5px] font-semibold" style={{ color: EX.faint }}>없습니다</div> : (
                    <ul className="max-h-[260px] overflow-y-auto">
                      {arr.slice(0, 30).map((x) => (
                        <li key={x.id} className="py-2.5 flex items-center gap-3 min-w-0" style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                          <Avatar u={x.u} size={32} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5 min-w-0"><span className="text-[13.5px] font-extrabold truncate" style={{ color: EX.text }}>{x.u.name || "이름 없음"}</span><span className="text-[12px] font-semibold truncate" style={{ color: EX.mute }}>{[x.u.team, x.u.position].filter(Boolean).join(" · ")}</span></div>
                            <div className="mt-0.5 text-[12px] font-semibold truncate" style={{ ...EX_NUM, color: EX.sub }}>{x.long ? `${dot(x.s) || "시작일 미정"} ~ ${dot(x.e) || "미정"}` : x.s === x.e ? mdDow(x.s) : `${mdDow(x.s)} ~ ${mdDow(x.e)}`}{x.days ? ` · ${dd(x.days)}일` : ""}</div>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            <span className="text-[12px] font-bold" style={{ color: EX.sub }}>{x.kind}</span>
                            {x.pending && <Chip tone="warn">결재 중</Chip>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </ExecPanel>

        {/* 직원 목록 · 상세 */}
        <ExecGrid cols="minmax(340px,440px) minmax(0,1fr)">
          <ExecPanel en="DIRECTORY" title={`직원 목록 ${shown.length}명`} sub="이름을 누르면 인사 정보 · 근태 · 연차 · 발령 이력을 봅니다">
            <div className="mt-2 grid gap-2.5" data-testid="staff-filters">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 부서 · 직책 · 연락처 검색" aria-label="직원 검색" className="w-full outline-none" style={{ ...selSt, height: 44, padding: "0 14px", fontSize: 14 }} />
              <ExecTabs size="sm" value={st} onChange={setSt} items={[["재직", "재직"], ["휴직", "휴직"], ["퇴사", "퇴사"], ["all", "전체"]]} />
              <div className="grid grid-cols-2 gap-2">
                <select aria-label="부서" value={team} onChange={(e) => { setTeam(e.target.value); setPos(""); }} style={selSt}><option value="">부서 전체</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <select aria-label="직책" value={pos} onChange={(e) => setPos(e.target.value)} style={selSt}><option value="">직책 전체</option>{positions.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </div>
            </div>
            <div className="mt-3 -mx-2 overflow-y-auto" style={{ maxHeight: 560 }} data-testid="staff-list">
              {!shown.length && <div className="px-2 py-6 text-[13.5px] font-semibold" style={{ color: EX.mute }}>{kw ? "검색 결과가 없습니다." : "해당하는 직원이 없습니다."}</div>}
              {shown.map((u) => {
                const on = u.id === sel;
                return (
                  <button key={u.id} type="button" onClick={() => pick(u)} className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-xl transition hover:bg-white/[0.04]" style={{ background: on ? "rgba(215,188,130,.10)" : undefined, boxShadow: on ? `inset 0 0 0 1px ${EX.lineHi}` : undefined }}>
                    <Avatar u={u} size={40} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline gap-2 min-w-0"><b className="text-[14.5px] font-extrabold truncate" style={{ color: EX.text }}>{u.name || u.email}</b><span className="text-[12.5px] font-semibold whitespace-nowrap" style={{ color: EX.mute }}>{u.position || ""}</span></span>
                      <span className="block mt-0.5 text-[12.5px] font-semibold truncate" style={{ color: EX.mute }}>{teamOf(u)}{statusOf(u) !== "재직" ? ` · ${statusOf(u)}` : ""}</span>
                    </span>
                    <span className="text-[12.5px] font-bold whitespace-nowrap" style={{ ...EX_NUM, color: EX.sub }}>{tenure(u.hireDate, today) || "–"}</span>
                  </button>
                );
              })}
            </div>
          </ExecPanel>
          <div ref={detailRef} className="min-w-0" style={{ scrollMarginTop: 12 }}>
            {cur ? <StaffDetail u={cur} demo={demo} attByDate={attByDate} leaveAp={leaveAp} today={today} /> : (
              <ExecPanel pad={false} className="h-full">
                <div className="px-6 py-14 md:py-20 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full grid place-items-center" style={{ border: `1px solid ${EX.lineHi}`, background: "radial-gradient(circle at 50% 35%, rgba(215,188,130,.16), transparent 70%)" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={EX.gold} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c1.2-3.8 4-5.6 7.5-5.6s6.3 1.8 7.5 5.6" /></svg>
                  </div>
                  <div className="mt-4 text-[16px] font-black" style={{ color: EX.text }}>직원을 고르세요</div>
                  <div className="mt-1 text-[13px] font-semibold" style={{ color: EX.mute }}>목록에서 고르면 인사 정보 · 근태 · 연차 · 발령 이력을 봅니다</div>
                </div>
              </ExecPanel>
            )}
          </div>
        </ExecGrid>
        <div className="px-1 text-[11.5px] font-medium" style={{ color: EX.faint }}>이 화면은 보기 전용입니다 · 직원 정보 수정은 인사관리부 › 직원관리에서 합니다</div>
      </>)}
    </ExecPage>
  );
}

function StaffDetail({ u, demo, attByDate, leaveAp, today }) {
  const x = usePersonExtra(u.uid, demo);
  const hire = x?.hireDate || u.hireDate || "";
  const ym = today.slice(0, 7);
  // 이번 달 근태
  const days = rangeDays(`${ym}-01`, today).filter(isBizDay);
  let work = 0, late = 0, leaveRec = 0;
  days.forEach((d) => { const r = (attByDate[d] || []).find((a) => a.uid === u.uid); if (!r) return; if (WORK.has(r.status)) { work += 1; if (isLate(r, u)) late += 1; } else if (LEAVE.has(r.status)) leaveRec += r.status.includes("반차") ? 0.5 : 1; });
  // 연차(입사일 기준 발생 − 전자결재 승인 사용 + 인사 조정)
  const ent = hire ? leaveEntitlement(hire) : null;
  const mine = leaveAp.filter((a) => a.drafterUid === u.uid);
  const inP = (a) => { const v = leaveUseOf(a); return v && ent && v.date >= ent.from && v.date <= ent.to ? v : null; };
  const used = mine.filter((a) => a.status === "approved" && inP(a)).reduce((s, a) => s + inP(a).days, 0);
  const wait = mine.filter((a) => a.status === "pending" && inP(a)).reduce((s, a) => s + inP(a).days, 0);
  const adj = ent ? (x?.leaveAdjust || []).filter((a) => a.period === ent.from).reduce((s, a) => s + (Number(a.days) || 0), 0) : 0;
  const total = (ent?.total || 0) + adj;
  const monthLeave = mine.filter((a) => a.status === "approved").map(leaveUseOf).filter((v) => v && String(v.date).startsWith(ym)).reduce((s, v) => s + v.days, 0);
  const hist = [...(u.personnelHistory || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const docs = ONBOARD_ITEMS.map((it) => ({ k: it.key, l: it.label, ok: it.key === "hire" ? !!hire : !!x?.onboarding?.[it.key] }));
  const docOk = docs.filter((d) => d.ok).length;
  const left = total - used;
  return (
    <div className="grid gap-4 md:gap-5" data-testid="staff-detail" data-readonly={READ_ONLY ? "1" : "0"}>
      <ExecPanel glow>
        <div className="pt-5 md:pt-6 flex items-center gap-4 min-w-0">
          <Avatar u={u} size={60} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2.5 flex-wrap"><span className="text-[24px] md:text-[26px] font-black tracking-[-0.02em]" style={{ color: EX.text }}>{u.name || u.email}</span><span className="text-[14.5px] font-bold" style={{ color: EX.sub }}>{teamOf(u)} · {u.position || "직책 없음"}</span></div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip tone={statusOf(u) === "재직" ? "ok" : statusOf(u) === "퇴사" ? "mute" : "warn"}>{statusOf(u)}</Chip>
              <Chip tone="mute">{u.employType || "정규직"}</Chip>
              {u.leave?.from ? <span className="text-[12.5px] font-semibold" style={{ ...EX_NUM, color: EX.mute }}>{dot(u.leave.from)} ~ {dot(u.leave.to) || "미정"}</span> : null}
              {statusOf(u) === "퇴사" && u.resignedAt ? <span className="text-[12.5px] font-semibold" style={{ ...EX_NUM, color: EX.mute }}>퇴사 {dot(u.resignedAt)}</span> : null}
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))" }}>
          <Stat l="입사일" v={hire ? dot(hire) : "미등록"} size={18} />
          <Stat l="근속" v={tenure(hire, today) || "–"} size={18} />
          <Stat l="잔여 연차" v={ent ? dd(left) : "–"} unit={ent ? "일" : ""} color={EX.goldHi} size={18} />
          <Stat l="이번 달 출근" v={work} unit="일" size={18} />
        </div>
      </ExecPanel>
      <div className="grid gap-4 md:gap-5 items-start" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(400px, 100%), 1fr))" }}>
        <ExecPanel en="PROFILE" title="기본 정보">
          <div className="mt-1">
            <Row l="부서" v={teamOf(u)} /><Row l="직책" v={u.position} /><Row l="고용 형태" v={u.employType || "정규직"} /><Row l="연락처" v={u.phone} /><Row l="이메일" v={u.noAccount ? "계정 없음" : u.email} /><Row l="근무 시간" v={`${u.workStartTime || "09:00"} ~ ${u.workEndTime || "18:00"}`} />
          </div>
        </ExecPanel>
        <ExecPanel en="ATTENDANCE · LEAVE" title="근태 · 연차" sub={`${Number(ym.slice(5))}월 · 영업일 ${days.length}일 중`}>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat l="출근" v={work} unit="일" size={20} />
            <Stat l="지각" v={late} unit="회" size={20} color={late ? EX.warn : EX.text} />
            <Stat l="연차 사용" v={dd(Math.max(monthLeave, leaveRec))} unit="일" size={20} />
          </div>
          {ent && total > 0 && <div className="mt-4"><div className="flex justify-between text-[12px] font-bold mb-1.5" style={{ ...EX_NUM, color: EX.mute }}><span>{ent.label === "월차" ? "월차" : "연차"} 사용 {dd(used)} / {dd(total)}일</span><span>{Math.min(100, (used / total) * 100).toFixed(0)}%</span></div><Meter value={used} max={total} height={6} /></div>}
          <div className="mt-3">
            <Row l={ent?.label === "월차" ? "월차 발생" : "연차 발생"} v={ent ? `${dd(total)}일${adj ? ` (조정 ${adj > 0 ? "+" : ""}${adj})` : ""}` : "입사일 미등록"} />
            <Row l="사용 · 결재 중" v={ent ? `${dd(used)}일 · ${dd(wait)}일` : "–"} />
            <Row l="잔여" v={ent ? <span className="text-[15px] font-black" style={{ color: EX.goldHi }}>{dd(left)}일</span> : "–"} />
            <Row l="회기" v={ent ? `${dot(ent.from)} ~ ${dot(ent.to)}` : "–"} />
          </div>
        </ExecPanel>
        <ExecPanel en="HISTORY" title="인사발령 이력" sub={`${hist.length}건 · 최근 순`}>
          {!hist.length ? <div className="py-4 text-[13px] font-semibold" style={{ color: EX.mute }}>기록이 없습니다.</div> : (
            <ol className="mt-2 relative">
              {hist.slice(0, 12).map((h, i) => (
                <li key={i} className="relative pl-5 pb-3.5 last:pb-0">
                  <span className="absolute left-0 top-[6px] w-2 h-2 rounded-full" style={{ background: i ? EX.faint : EX.gold, boxShadow: i ? "none" : `0 0 8px ${EX.gold}` }} />
                  {i < Math.min(hist.length, 12) - 1 && <span className="absolute left-[3.5px] top-[16px] bottom-0 w-px" style={{ background: EX.line }} />}
                  <div className="flex items-baseline gap-2 flex-wrap"><span className="text-[12px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>{dot(h.date)}</span><b className="text-[13.5px] font-extrabold" style={{ color: EX.text }}>{h.type}</b></div>
                  {h.detail ? <div className="mt-0.5 text-[12.5px] font-semibold" style={{ color: EX.sub, wordBreak: "keep-all" }}>{h.detail}</div> : null}
                </li>
              ))}
            </ol>
          )}
        </ExecPanel>
        <ExecPanel en="CERTIFICATES · DOCUMENTS" title="자격 · 서류" sub={`입사 서류 ${docOk}/${docs.length} 완료`}>
          <div className="mt-2 text-[12.5px] font-extrabold" style={{ color: EX.sub }}>자격 · 면허</div>
          {!x ? <div className="py-2.5 text-[13px] font-semibold" style={{ color: EX.mute }}>불러오는 중</div> : !x.certs.length ? <div className="py-2.5 text-[13px] font-semibold" style={{ color: EX.mute }}>등록된 자격이 없습니다.</div> : x.certs.map((c, i) => (
            <div key={i} className="py-2.5 flex justify-between gap-3 text-[13.5px]" style={{ borderTop: i ? "1px solid rgba(255,255,255,.05)" : 0 }}>
              <span className="min-w-0"><b className="font-extrabold" style={{ color: EX.text }}>{c.name}</b> <span className="text-[12px] font-semibold" style={{ color: EX.mute }}>{c.issuer}</span></span>
              <span className="shrink-0 text-[12.5px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>{dot(c.date)}</span>
            </div>
          ))}
          <div className="mt-4 flex items-center justify-between gap-2"><span className="text-[12.5px] font-extrabold" style={{ color: EX.sub }}>입사 서류</span><span className="text-[12px] font-bold" style={{ ...EX_NUM, color: EX.mute }}>{docOk}/{docs.length}</span></div>
          <div className="mt-1.5"><Meter value={docOk} max={docs.length || 1} height={5} color={docOk === docs.length ? EX.gold : EX.warn} /></div>
          <div className="mt-2">
            {docs.map((d) => (
              <div key={d.k} className="flex justify-between gap-2 py-2 text-[13px]" style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}>
                <span className="font-semibold" style={{ color: EX.sub }}>{d.l}</span>
                <b className="whitespace-nowrap font-extrabold" style={{ color: d.ok ? EX.mute : EX.up }}>{d.ok ? "완료" : "미완료"}</b>
              </div>
            ))}
          </div>
        </ExecPanel>
      </div>
    </div>
  );
}
