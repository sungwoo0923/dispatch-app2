// ======================= src/ExecStaffInfo.jsx =======================
// 👔 2026-11-08 임원 화면 · 직원 정보(읽기 전용) — 인사관리부 › 직원관리(HrHub StaffInfoBoard)를 임원용으로 보기만
//  · 저장·수정 기능 없음: 이 파일은 Firestore 쓰기 함수를 하나도 가져오지 않는다(onSnapshot · getDoc만). 입력칸은 목록 검색·필터뿐
//  · 급여·급여 대장(payroll*)은 읽지 않는다 — 경리 전용(비밀번호)이라 임원 화면에서 보이지 않게
//  · 데이터: users(회사 직원 · 부서/직책/입사일/연락처/재직 상태/인사발령 이력 personnelHistory)
//           userProfiles/{uid}(입사일 · 연차 조정 · 입사 서류 체크 onboarding — 선택한 사람만) · hrResumes/{uid}(자격·면허만)
//           attendance(이번 달 출근 기록) · approvals(회사 연차 결재: cat == "leave")
import React from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { isDemoOn } from "./devDemoData";
import { execAnalyticsDemo } from "./execAnalyticsDemo";
import { C } from "./dailyReportCharts";
import { kstToday, addDay, isBizDay, fmt, md, dayDiff, rangeDays } from "./dailyReportCore";
import { Card, Seg } from "./DailyReport";
import { ExecShell } from "./ExecAnalytics";
import { useCompanyPeople } from "./dailyReport";
import { isTMUser } from "./staffFilter";
import { isExecProfile } from "./hrConstants";
import { leaveEntitlement, leaveUseOf } from "./approvalForms";
import { ONBOARD_ITEMS } from "./HrTools";

const demoOn = () => { try { return !!(import.meta.env.DEV && isDemoOn()); } catch { return false; } };
const OUT = ["driver", "shipper", "cafeUser", "totalMaster"];
const LEAVE_ST = ["휴직", "육아휴직", "출산휴가"];
const WORK = new Set(["출근", "외근", "조퇴"]);
const LEAVE = new Set(["연차", "오전반차", "오후반차", "병가", "경조사", "휴가"]);
const hmOf = (iso) => { const m = String(iso || "").match(/T(\d{2}):(\d{2})/); return m ? `${m[1]}:${m[2]}` : ""; };
const toMin = (hm) => { const m = String(hm || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const isLate = (rec, u) => { if (!rec?.checkInTime || rec.status !== "출근") return false; const a = toMin(hmOf(rec.checkInTime)); const b = toMin(u?.workStartTime || "09:00"); return a != null && b != null && a > b; };
const tenure = (h, today) => { if (!/^\d{4}-\d{2}-\d{2}/.test(String(h || ""))) return ""; const m = Math.max(0, Math.floor(dayDiff(h, today) / 30.44)); return m < 1 ? "1개월 미만" : `${Math.floor(m / 12) ? `${Math.floor(m / 12)}년 ` : ""}${m % 12 ? `${m % 12}개월` : ""}`.trim(); };
const dot = (d) => String(d || "").replace(/-/g, ".");
const statusOf = (u) => u.employmentStatus || "재직";
const READ_ONLY = true; // 이 화면은 보기만 — 쓰기 동작을 추가하지 않는다

function useQ(col, conds, on) {
  const key = JSON.stringify(conds);
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!on || conds.some(([, v]) => !v)) return undefined;
    return onSnapshot(query(collection(db, col), ...conds.map(([k, v]) => where(k, "==", v))), (s) => setRows(s.docs.map((x) => ({ id: x.id, ...x.data() }))), () => setRows([]));
  }, [col, key, on]); // eslint-disable-line react-hooks/exhaustive-deps
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

export default function ExecStaffInfo({ company }) {
  const demo = demoOn() ? execAnalyticsDemo(company) : null;
  const today = kstToday(); const ym = today.slice(0, 7);
  const live = useCompanyPeople(demo ? "" : company);
  const peopleRaw = demo ? demo.people : live || [];
  const people = React.useMemo(() => peopleRaw.map((u) => ({ ...u, id: u.id || u.uid, uid: u.uid || u.id })).filter((u) => (u.companyName || DEFAULT_COMPANY) === company && !OUT.includes(u.role) && !isTMUser(u) && u.approved !== false), [peopleRaw, company]);
  const attLive = useQ("attendance", [["companyName", company], ["month", ym]], !demo);
  const leaveLive = useQ("approvals", [["company", company], ["cat", "leave"]], !demo);
  const attByDate = React.useMemo(() => { if (demo) return demo.attendance; const m = {}; (attLive || []).forEach((a) => { if (a?.date) (m[a.date] = m[a.date] || []).push(a); }); return m; }, [demo, attLive]);
  const leaveAp = demo ? demo.approvals.filter((a) => a.cat === "leave") : leaveLive || [];

  const [q, setQ] = React.useState("");
  const [team, setTeam] = React.useState("");
  const [pos, setPos] = React.useState("");
  const [st, setSt] = React.useState("재직");
  const [sel, setSel] = React.useState(null);
  const detailRef = React.useRef(null);
  const active = people.filter((u) => statusOf(u) !== "퇴사");
  const teams = [...new Set(people.map((u) => u.team || "미배정"))].sort((a, b) => a.localeCompare(b, "ko"));
  const positions = [...new Set(people.filter((u) => !team || (u.team || "미배정") === team).map((u) => u.position).filter(Boolean))];
  const kw = q.trim();
  const shown = people.filter((u) => (!team || (u.team || "미배정") === team) && (!pos || u.position === pos)
    && (st === "all" || (st === "재직" ? statusOf(u) === "재직" : st === "휴직" ? LEAVE_ST.includes(statusOf(u)) : statusOf(u) === "퇴사"))
    && (!kw || [u.name, u.team, u.position, u.phone, u.email].some((v) => String(v || "").includes(kw))))
    .sort((a, b) => (isExecProfile(b) - isExecProfile(a)) || String(a.team || "힣").localeCompare(String(b.team || "힣"), "ko") || String(a.name || "").localeCompare(String(b.name || ""), "ko"));
  const cur = people.find((u) => u.id === sel) || null;

  // 오늘 출근 현황(영업일이 아니면 마지막 영업일)
  const day = (() => { let d = today; for (let i = 0; i < 10 && !isBizDay(d); i++) d = addDay(d, -1); return d; })();
  const recs = attByDate[day] || [];
  const onLeaveToday = (u) => leaveAp.some((a) => a.drafterUid === u.uid && a.status === "approved" && (() => { const x = leaveUseOf(a); if (!x) return false; const p = a.data?.period; return p?.start ? day >= p.start && day <= (p.end || p.start) : x.date === day; })());
  const todayStat = React.useMemo(() => {
    const working = active.filter((u) => statusOf(u) === "재직");
    let present = 0, late = 0, leave = 0, outside = 0;
    working.forEach((u) => { const r = recs.find((a) => a.uid === u.uid); const s = r?.status; if (s && WORK.has(s)) { present += 1; if (s === "외근") outside += 1; if (isLate(r, u)) late += 1; } else if ((s && LEAVE.has(s)) || onLeaveToday(u)) leave += 1; });
    return { n: working.length, present, late, leave, outside, none: Math.max(0, working.length - present - leave) };
  }, [active, recs]); // eslint-disable-line react-hooks/exhaustive-deps
  const byTeam = Object.entries(active.reduce((m, u) => { const t = u.team || "미배정"; m[t] = (m[t] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const maxTeam = Math.max(1, ...byTeam.map((x) => x[1]));
  const pick = (u) => { setSel(u.id); setTimeout(() => { try { if (window.innerWidth < 1100) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* 무시 */ } }, 30); };

  return (
    <ExecShell testId="exec-staff" en="PEOPLE · READ ONLY" title="직원 정보" sub="보기 전용 · 수정은 인사관리부에서 합니다 · 급여 정보는 나오지 않습니다">
      {({ compact, wide }) => (<>
        <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,1fr) minmax(0,1.2fr)" : "1fr", gap: compact ? 14 : 20 }}>
          <Card compact={compact} title="오늘 출근 현황" sub={day === today ? "출근 기록 기준 · 재직자" : `${md(day)} 기준(마지막 영업일)`}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}><span className="ebx-num" style={{ fontSize: compact ? 40 : 48, fontWeight: 800, lineHeight: 1.1 }}>{todayStat.present}</span><span style={{ fontSize: 17, color: C.t2 }}>/ {todayStat.n}명 근무 중</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginTop: 16 }} data-testid="staff-today">
              {[["지각", todayStat.late], ["휴가", todayStat.leave], ["외근", todayStat.outside], ["미출근", todayStat.none]].map(([l, v]) => <div key={l} className="ebx-stat" style={{ padding: "12px 14px" }}><div className="ebx-lbl">{l}</div><div className="ebx-num" style={{ fontSize: 26, fontWeight: 800, marginTop: 2, color: l === "지각" && v ? C.err : C.t1 }}>{v}</div></div>)}
            </div>
          </Card>
          <Card compact={compact} title="부서별 인원" sub={`재직 ${active.filter((u) => statusOf(u) === "재직").length}명 · 휴직 ${active.filter((u) => LEAVE_ST.includes(statusOf(u))).length}명`}>
            <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(2,minmax(0,1fr))", gap: "0 28px", marginTop: 8 }}>
              {byTeam.map(([t, n]) => <div key={t} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) 44px", gap: 10, alignItems: "center", padding: "9px 0", fontSize: 16 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</span><div className="exa-bar"><i style={{ width: `${(n / maxTeam) * 100}%` }} /></div><b className="ebx-num" style={{ textAlign: "right" }}>{n}명</b></div>)}
            </div>
          </Card>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(380px,460px) minmax(0,1fr)" : "1fr", gap: compact ? 14 : 20, alignItems: "start" }}>
          <Card compact={compact} title={`직원 목록 ${shown.length}`} style={wide ? { position: "sticky", top: 8 } : null}>
            <div style={{ marginTop: 14, display: "grid", gap: 10 }} data-testid="staff-filters">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 부서 · 직책 · 연락처 검색" aria-label="직원 검색" style={{ height: 48, borderRadius: 12, border: `1px solid ${C.line}`, padding: "0 14px", fontSize: 16, width: "100%", outline: "none", fontFamily: "inherit" }} />
              <Seg value={st} onChange={setSt} items={[["재직", "재직"], ["휴직", "휴직"], ["퇴사", "퇴사"], ["all", "전체"]]} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select aria-label="부서" value={team} onChange={(e) => { setTeam(e.target.value); setPos(""); }} style={{ height: 46, borderRadius: 12, border: `1px solid ${C.line}`, padding: "0 10px", fontSize: 16, background: "#fff", fontFamily: "inherit", color: C.t1 }}><option value="">부서 전체</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <select aria-label="직책" value={pos} onChange={(e) => setPos(e.target.value)} style={{ height: 46, borderRadius: 12, border: `1px solid ${C.line}`, padding: "0 10px", fontSize: 16, background: "#fff", fontFamily: "inherit", color: C.t1 }}><option value="">직책 전체</option>{positions.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </div>
            </div>
            <div style={{ marginTop: 10, maxHeight: wide ? "calc(100vh - 360px)" : compact ? 460 : 520, overflowY: "auto", marginInline: -6 }} data-testid="staff-list">
              {!shown.length && <div style={{ padding: "24px 6px", fontSize: 16, color: C.t2 }}>{kw ? "검색 결과가 없습니다." : "해당하는 직원이 없습니다."}</div>}
              {shown.map((u) => {
                const on = u.id === sel;
                return (
                  <button key={u.id} type="button" onClick={() => pick(u)} style={{ all: "unset", boxSizing: "border-box", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "12px 8px", borderRadius: 12, background: on ? "#EEF3FC" : "transparent", borderTop: `1px solid ${C.grid}` }}>
                    <span style={{ width: 44, height: 44, borderRadius: 14, display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, fontSize: 17, flex: "none", background: isExecProfile(u) ? "linear-gradient(135deg,#9A7425,#D7BC82)" : `linear-gradient(135deg,${C.n2},${C.n3})` }}>{String(u.name || "?").slice(0, 1)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", gap: 8, alignItems: "baseline" }}><b style={{ fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name || u.email}</b><span style={{ fontSize: 15, color: C.t2, whiteSpace: "nowrap" }}>{u.position || ""}</span></span>
                      <span style={{ display: "block", fontSize: 15, color: C.t2, marginTop: 2 }}>{u.team || "미배정"}{statusOf(u) !== "재직" ? ` · ${statusOf(u)}` : ""}</span>
                    </span>
                    <span className="ebx-num" style={{ fontSize: 15, color: C.t2, fontWeight: 600, whiteSpace: "nowrap" }}>{tenure(u.hireDate, today) || "–"}</span>
                  </button>
                );
              })}
            </div>
          </Card>
          <div ref={detailRef} style={{ minWidth: 0, scrollMarginTop: 12 }}>
            {cur ? <StaffDetail u={cur} demo={demo} attByDate={attByDate} leaveAp={leaveAp} today={today} compact={compact} /> : <Card compact={compact} title="직원을 고르세요" sub="왼쪽 목록에서 고르면 인사 정보·근태·연차·발령 이력을 봅니다"><div style={{ height: 8 }} /></Card>}
          </div>
        </div>
      </>)}
    </ExecShell>
  );
}

function StaffDetail({ u, demo, attByDate, leaveAp, today, compact }) {
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
  const Row = ({ l, v }) => <div className="ebx-row" style={{ display: "grid", gridTemplateColumns: compact ? "104px minmax(0,1fr)" : "130px minmax(0,1fr)", gap: 12, padding: "12px 0", fontSize: 16 }}><span style={{ color: C.t2 }}>{l}</span><span style={{ minWidth: 0, wordBreak: "break-all", fontWeight: 600 }}>{v || "–"}</span></div>;
  return (
    <div style={{ display: "grid", gap: compact ? 14 : 20 }} data-testid="staff-detail" data-readonly={READ_ONLY ? "1" : "0"}>
      <div className="ebx-card" style={{ padding: compact ? "20px 18px" : "26px 30px", background: `linear-gradient(135deg,${C.n1},${C.n2})`, color: "#fff", border: 0 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ width: 64, height: 64, borderRadius: 20, display: "grid", placeItems: "center", fontSize: 26, fontWeight: 800, flex: "none", background: isExecProfile(u) ? "linear-gradient(135deg,#9A7425,#D7BC82)" : C.n3 }}>{String(u.name || "?").slice(0, 1)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}><span style={{ fontSize: compact ? 26 : 30, fontWeight: 800, color: "#fff" }}>{u.name || u.email}</span><span style={{ fontSize: 17, color: "#C9D4EA" }}>{u.team || "미배정"} · {u.position || "직책 없음"}</span></div>
            <div style={{ fontSize: 15, color: "#B9C6E0", marginTop: 4 }}>{statusOf(u)}{u.employType ? ` · ${u.employType}` : ""}{u.leave?.from ? ` · ${dot(u.leave.from)}~${dot(u.leave.to) || "미정"}` : ""}{statusOf(u) === "퇴사" && u.resignedAt ? ` · 퇴사 ${dot(u.resignedAt)}` : ""}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: compact ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))", gap: 10, marginTop: 20 }}>
          {[["입사일", hire ? dot(hire) : "미등록"], ["근속", tenure(hire, today) || "–"], ["잔여 연차", ent ? `${fmt(total - used)}일` : "–"], ["이번 달 출근", `${work}일`]].map(([l, v]) => <div key={l} style={{ background: "rgba(255,255,255,.07)", borderRadius: 14, padding: "12px 14px" }}><div style={{ fontSize: 15, color: "#B9C6E0", fontWeight: 600 }}>{l}</div><div className="ebx-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 2, color: "#fff" }}>{v}</div></div>)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(2,minmax(0,1fr))", gap: compact ? 14 : 20, alignItems: "start" }}>
        <Card compact={compact} title="기본 정보">
          <div style={{ marginTop: 6 }}>
            <Row l="부서" v={u.team || "미배정"} /><Row l="직책" v={u.position} /><Row l="고용 형태" v={u.employType || "정규직"} /><Row l="연락처" v={u.phone} /><Row l="이메일" v={u.noAccount ? "계정 없음" : u.email} /><Row l="근무 시간" v={`${u.workStartTime || "09:00"} ~ ${u.workEndTime || "18:00"}`} />
          </div>
        </Card>
        <Card compact={compact} title="근태 · 연차" sub={`${Number(ym.slice(5))}월 · 영업일 ${days.length}일 중`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginTop: 14 }}>
            {[["출근", `${work}일`], ["지각", `${late}회`], ["연차 사용", `${fmt(Math.max(monthLeave, leaveRec))}일`]].map(([l, v]) => <div key={l} className="ebx-stat" style={{ padding: "12px 14px" }}><div className="ebx-lbl">{l}</div><div className="ebx-num" style={{ fontSize: 24, fontWeight: 800, marginTop: 2, color: l === "지각" && late ? C.err : C.t1 }}>{v}</div></div>)}
          </div>
          <div style={{ marginTop: 10 }}>
            <Row l={ent?.label === "월차" ? "월차 발생" : "연차 발생"} v={ent ? `${fmt(total)}일${adj ? ` (조정 ${adj > 0 ? "+" : ""}${adj})` : ""}` : "입사일 미등록"} />
            <Row l="사용 · 결재 중" v={ent ? `${fmt(used)}일 · ${fmt(wait)}일` : "–"} />
            <Row l="잔여" v={ent ? <b style={{ fontSize: 18 }}>{fmt(total - used)}일</b> : "–"} />
            <Row l="회기" v={ent ? `${dot(ent.from)} ~ ${dot(ent.to)}` : "–"} />
          </div>
        </Card>
        <Card compact={compact} title="인사발령 이력" sub={`${hist.length}건 · 최근 순`}>
          {!hist.length ? <div style={{ padding: "18px 0", fontSize: 16, color: C.t2 }}>기록이 없습니다.</div> : <div style={{ marginTop: 8 }}>{hist.slice(0, 12).map((h, i) => <div key={i} className="ebx-row" style={{ display: "grid", gridTemplateColumns: compact ? "92px minmax(0,1fr)" : "112px minmax(0,1fr)", gap: 12, padding: "12px 0", fontSize: 16 }}><span className="ebx-num" style={{ color: C.t2, fontWeight: 500 }}>{dot(h.date)}</span><span style={{ minWidth: 0 }}><b>{h.type}</b>{h.detail ? <span style={{ display: "block", color: C.t2, fontSize: 15, marginTop: 2, wordBreak: "keep-all" }}>{h.detail}</span> : null}</span></div>)}</div>}
        </Card>
        <Card compact={compact} title="자격 · 서류" sub={`입사 서류 ${docOk}/${docs.length} 완료`}>
          <h3 className="ebx-h3" style={{ marginTop: 14 }}>자격 · 면허</h3>
          {!x ? <div style={{ padding: "10px 0", fontSize: 16, color: C.t2 }}>불러오는 중</div> : !x.certs.length ? <div style={{ padding: "10px 0", fontSize: 16, color: C.t2 }}>등록된 자격이 없습니다.</div> : x.certs.map((c, i) => <div key={i} className={i ? "ebx-row" : ""} style={{ padding: "10px 0", display: "flex", justifyContent: "space-between", gap: 10, fontSize: 16 }}><span><b>{c.name}</b> <span style={{ color: C.t2, fontSize: 15 }}>{c.issuer}</span></span><span className="ebx-num" style={{ color: C.t2, fontWeight: 500 }}>{dot(c.date)}</span></div>)}
          <h3 className="ebx-h3" style={{ marginTop: 18 }}>입사 서류</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", marginTop: 4 }}>
            {docs.map((d) => <div key={d.k} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "9px 0", borderTop: `1px solid ${C.grid}`, fontSize: 15 }}><span style={{ color: C.t1 }}>{d.l}</span><b style={{ color: d.ok ? C.t2 : C.err, whiteSpace: "nowrap" }}>{d.ok ? "완료" : "미완료"}</b></div>)}
          </div>
        </Card>
      </div>
    </div>
  );
}
