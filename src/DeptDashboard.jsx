// ======================= src/DeptDashboard.jsx =======================
// 🏢 부서 대시보드(2026-10-31) — 경리·회계 / 인사관리 권한으로 들어오면 홈 › 대시보드가 부서 업무 화면으로 바뀐다.
//  홈의 디자인(네이비 디지털 히어로 + 카드)은 그대로, 내용만 부서 업무로. PC·모바일 공용.
//   경리: 이번 달 매출·매입·수수료 · 6개월 추이 · 거래처 미정산 · 용차 지급 대기 · 지출결의 · 기사 서류
//   인사: 재직·입퇴사 · 오늘 출근 현황 · 휴가·근태 결재 대기 · 입사 기념일 · 기사(가입 대기·서류)
import React from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { ShellIcon } from "./AdminShell";
import { useFleetDrivers } from "./FleetPayDocs";
import { useCompanyDriverDocs, docProblems } from "./driverRequiredDocs";
import { isTMUser } from "./staffFilter";
import { ExecDashboard } from "./ExecSuite";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const HERO = "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)";
const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const kst = (off = 0) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
const ymAgo = (n) => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 7); };
const short = (n) => { const a = Math.abs(n); if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`; if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`; return Math.round(n).toLocaleString(); };
const tsMs = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : 0);

function useCol(name, company, filterFn) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(collection(db, name), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => (!filterFn ? true : filterFn(r)))), () => setRows([]));
  }, [name, company]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}
function useCompanyApprovals(company) {
  const [rows, setRows] = React.useState([]);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, "approvals"), where("company", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [company]);
  return rows;
}

function Hero({ en, title, desc, kpis }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] px-4 py-4 md:px-7 md:py-5 text-white shadow-[0_14px_32px_rgba(15,26,48,0.25)]" style={{ background: HERO }}>
      <div className="text-[11px] md:text-[12px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
      <div className="text-[20px] md:text-[24px] font-black mt-0.5">{title}</div>
      <div className="text-[12.5px] md:text-[14px] text-white/60 mt-0.5">{desc}</div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
        {kpis.map(([l, v, sub]) => (
          <div key={l} className="rounded-2xl bg-white/[0.07] border border-white/10 px-3 md:px-4 py-2.5 min-w-0">
            <div className="text-[11.5px] md:text-[12.5px] font-bold text-white/55 whitespace-nowrap">{l}</div>
            <div className="text-[19px] md:text-[22px] font-black tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{v}</div>
            {sub && <div className="text-[11px] text-white/45 whitespace-nowrap truncate">{sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
function Card({ en, title, right, children, className = "" }) {
  return (
    <div className={`rounded-[20px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_24px_rgba(16,24,40,0.05)] overflow-hidden min-w-0 ${className}`}>
      <div className="px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#4B6CB7] whitespace-nowrap" style={{ fontFamily: MONO }}>{en}</div>
          <div className="text-[15px] font-black text-[#0F1A30] tracking-tight truncate">{title}</div>
        </div>
        {right}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}
function Quick({ items, onGo }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map(([k, l, icon, sub]) => (
        <button key={k} type="button" onClick={() => onGo?.(k)} className="rounded-2xl bg-white border border-[#E3E8F0] px-3 py-3 text-left flex items-center gap-2.5 hover:border-[#2D4C82] hover:bg-[#F8FAFD] transition min-w-0">
          <span className="w-9 h-9 rounded-xl shrink-0 grid place-items-center text-white" style={{ background: "linear-gradient(135deg,#1B2B4B,#2D4C82)" }}><ShellIcon name={icon} size={16} /></span>
          <span className="min-w-0"><span className="block text-[13.5px] font-black text-[#0F1A30] truncate">{l}</span><span className="block text-[11px] text-[#7A879C] truncate">{sub}</span></span>
        </button>
      ))}
    </div>
  );
}
const Row = ({ l, v, sub, tone }) => (
  <div className="flex items-center justify-between gap-3 py-2 border-b border-[#F1F4F9] last:border-b-0">
    <span className="min-w-0"><span className="block text-[13.5px] font-bold text-[#0F1A30] truncate">{l}</span>{sub && <span className="block text-[11.5px] text-[#7A879C] truncate">{sub}</span>}</span>
    <span className={`shrink-0 text-[13.5px] font-black tabular-nums whitespace-nowrap ${tone === "bad" ? "text-[#B42318]" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{v}</span>
  </div>
);
const Empty = ({ t }) => <div className="py-6 text-center text-[13px] font-bold text-[#9AA9C3]">{t}</div>;

// ─────────────────────────── 경리·회계 ───────────────────────────
function AcctDashboard({ company, dispatchData = [], onGo }) {
  const clients = useCol("clients", company);
  const approvals = useCompanyApprovals(company);
  const fleet = useFleetDrivers();
  const docsBy = useCompanyDriverDocs(company);
  const fleetPlates = React.useMemo(() => new Set((fleet || []).map((d) => String(d.차량번호 || "").trim()).filter((p) => p && p !== "-")), [fleet]);
  const done = React.useMemo(() => (dispatchData || []).filter((r) => (r.배차상태 || "") === "배차완료" && r.상차일), [dispatchData]);
  const months = [5, 4, 3, 2, 1, 0].map(ymAgo);
  const stat = (rows) => rows.reduce((a, r) => { const s = toInt(r.청구운임); const d = toInt(r.기사운임); return { sale: a.sale + s, buy: a.buy + d, cnt: a.cnt + 1 }; }, { sale: 0, buy: 0, cnt: 0 });
  const byMonth = months.map((m) => ({ m, ...stat(done.filter((r) => r.상차일.startsWith(m))) }));
  const cur = byMonth[5]; const prev = byMonth[4];
  const fee = cur.sale - cur.buy; const rate = cur.sale ? (fee / cur.sale) * 100 : 0;
  const diff = prev.sale ? ((cur.sale - prev.sale) / prev.sale) * 100 : null;
  // 거래처 미정산(최근 3개월 — 거래처정산의 월별 정산상태 기준)
  const unsettled = React.useMemo(() => {
    const st = {}; (clients || []).forEach((c) => { st[String(c.거래처명 || c.id || "").trim()] = c.정산상태 && typeof c.정산상태 === "object" ? c.정산상태 : {}; });
    const acc = {};
    done.forEach((r) => {
      const m = r.상차일.slice(0, 7); if (!months.slice(3).includes(m) && m !== ymAgo(1) && m !== ymAgo(2)) return;
      if (m === ymAgo(0)) return; // 이번 달은 아직 마감 전
      const c = String(r.거래처명 || "").trim(); if (!c) return;
      const yyyymm = m.replace("-", "");
      const s = st[c]?.[yyyymm] || st[c]?.[m];
      if (s === "정산완료") return;
      const k = `${c}|${m}`; acc[k] = acc[k] || { c, m, amt: 0, n: 0 }; acc[k].amt += toInt(r.청구운임); acc[k].n += 1;
    });
    return Object.values(acc).sort((a, b) => b.amt - a.amt);
  }, [clients, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const unsettledSum = unsettled.reduce((s, x) => s + x.amt, 0);
  // 용차 지급 대기(지입·직영 제외, 최근 2개월)
  const payWait = done.filter((r) => (r.상차일 >= `${ymAgo(1)}-01`) && !fleetPlates.has(String(r.차량번호 || "").trim()) && (r.지급상태 || "지급중") !== "지급완료" && toInt(r.기사운임) > 0);
  const payWaitSum = payWait.reduce((s, r) => s + toInt(r.기사운임), 0);
  const expPending = approvals.filter((a) => a.cat === "expense" && a.status === "pending");
  const expMonth = approvals.filter((a) => a.cat === "expense" && a.status === "approved" && String(new Date(tsMs(a.createdAt) + 9 * 3600e3).toISOString()).startsWith(ymAgo(0))).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const docIssue = Object.values(docsBy || {}).reduce((s, b) => { const p = docProblems(b); return s + (p.wait ? 1 : 0); }, 0);
  const max = Math.max(1, ...byMonth.map((x) => x.sale));
  return (
    <div className="space-y-4">
      <Hero en="ACCOUNTING · DASHBOARD" title="경리·회계 대시보드" desc={`${ymAgo(0).replace("-", "년 ")}월 · 배차완료 기준 매출·매입과 정산·지급 할 일을 한눈에`}
        kpis={[
          ["이번 달 매출", `${short(cur.sale)}원`, diff == null ? `${cur.cnt}건` : `전월 대비 ${diff >= 0 ? "▲" : "▼"}${Math.abs(diff).toFixed(1)}%`],
          ["이번 달 매입(기사운임)", `${short(cur.buy)}원`, `${cur.cnt}건`],
          ["수수료(매출총이익)", `${short(fee)}원`, `이익률 ${rate.toFixed(1)}%`],
          ["거래처 미정산", `${short(unsettledSum)}원`, `${unsettled.length}건 · 지난 3개월`],
        ]} />
      <Quick onGo={onGo} items={[["정산관리", "거래처 정산", "receipt", "청구·입금 확인"], ["정산관리:지급관리", "용차 지급", "wallet", `대기 ${payWait.length}건`], ["회계관리", "회계(미수·미지급·부가세)", "money", "연간 장부"], ["매출관리", "매출 분석", "chart", "대시보드·순위"]]} />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        <Card en="TREND · 6 MONTHS" title="월별 매출 · 매입 · 수수료">
          <div className="flex items-end gap-2 h-[170px] pt-2">
            {byMonth.map((x) => (
              <div key={x.m} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center gap-[3px] h-[130px]">
                  <span title={`매출 ${x.sale.toLocaleString()}원`} className="w-[38%] rounded-t-md bg-[#1B2B4B]" style={{ height: `${(x.sale / max) * 100}%` }} />
                  <span title={`매입 ${x.buy.toLocaleString()}원`} className="w-[38%] rounded-t-md bg-[#9FB2D6]" style={{ height: `${(x.buy / max) * 100}%` }} />
                </div>
                <span className="text-[11px] font-black text-[#5B6B85] tabular-nums whitespace-nowrap" style={{ fontFamily: MONO }}>{x.m.slice(5)}월</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[11.5px] font-bold text-[#5B6B85] flex-wrap">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="w-2.5 h-2.5 rounded-sm bg-[#1B2B4B]" />매출</span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><span className="w-2.5 h-2.5 rounded-sm bg-[#9FB2D6]" />매입</span>
            <span className="ml-auto whitespace-nowrap tabular-nums" style={{ fontFamily: MONO }}>6개월 수수료 {short(byMonth.reduce((s, x) => s + x.sale - x.buy, 0))}원</span>
          </div>
        </Card>
        <Card en="TODO · ACCOUNTING" title="오늘 처리할 일">
          <Row l="지출결의 결재 대기" sub="전자결재 › 비용·지출 결의" v={`${expPending.length}건`} tone={expPending.length ? "bad" : ""} />
          <Row l="용차 지급 대기" sub="지난달~이번 달 · 지입·직영 제외" v={`${short(payWaitSum)}원`} tone={payWait.length ? "bad" : ""} />
          <Row l="거래처 미정산" sub="지난 3개월(이번 달 제외)" v={`${unsettled.length}건`} tone={unsettled.length ? "bad" : ""} />
          <Row l="이번 달 승인된 지출" sub="비용·지출 결의 승인 합계" v={`${short(expMonth)}원`} />
          <Row l="기사 서류 검토 대기" sub="통장 사본·사업자등록증 등" v={`${docIssue}명`} tone={docIssue ? "bad" : ""} />
        </Card>
      </div>
      <Card en="RECEIVABLE" title="거래처 미정산 상위" right={<button type="button" onClick={() => onGo?.("정산관리")} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] whitespace-nowrap">거래처 정산 ›</button>}>
        {!unsettled.length ? <Empty t="미정산 거래처가 없습니다" /> : unsettled.slice(0, 8).map((x) => <Row key={`${x.c}${x.m}`} l={x.c} sub={`${x.m.replace("-", ".")} · ${x.n}건`} v={`${x.amt.toLocaleString()}원`} />)}
      </Card>
    </div>
  );
}

// ─────────────────────────── 인사관리 ───────────────────────────
function HrDashboard({ company, onGo }) {
  const users = useCol("users", company, (u) => (u.companyName || DEFAULT_COMPANY) === company);
  const profiles = useCol("userProfiles", company);
  const today = kst(0);
  const attendance = useCol("attendance", company, (a) => a.date === today);
  const approvals = useCompanyApprovals(company);
  const docsBy = useCompanyDriverDocs(company);
  const staff = (users || []).filter((u) => !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u));
  const active = staff.filter((u) => u.approved !== false && u.employmentStatus !== "퇴사");
  const pendingStaff = staff.filter((u) => u.approved === false && u.employmentStatus !== "퇴사");
  const drivers = (users || []).filter((u) => u.role === "driver");
  const pendingDrivers = drivers.filter((u) => u.approved === false);
  const pf = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const hireOf = (u) => pf[u.id]?.hireDate || u.hireDate || "";
  const ym = ymAgo(0);
  const joinedThisMonth = active.filter((u) => String(hireOf(u)).startsWith(ym));
  const leftThisMonth = staff.filter((u) => u.employmentStatus === "퇴사" && String(u.resignDate || u.퇴사일 || "").startsWith(ym));
  const attMap = Object.fromEntries((attendance || []).map((a) => [a.uid, a]));
  const inToday = active.filter((u) => attMap[u.id] && (attMap[u.id].status === "출근" || attMap[u.id].checkInTime));
  const offToday = active.filter((u) => attMap[u.id] && /휴가|연차|반차|병가|외근|출장/.test(attMap[u.id].status || ""));
  const notYet = active.filter((u) => !attMap[u.id]);
  const leavePending = approvals.filter((a) => a.cat === "leave" && a.status === "pending");
  const reportPending = approvals.filter((a) => a.cat === "report" && a.status === "pending");
  const anniv = active.map((u) => ({ u, h: hireOf(u) })).filter(({ h }) => h && h.slice(5, 7) === ym.slice(5, 7) && h.slice(0, 4) < ym.slice(0, 4))
    .map(({ u, h }) => ({ u, h, y: Number(ym.slice(0, 4)) - Number(h.slice(0, 4)) })).sort((a, b) => a.h.slice(8).localeCompare(b.h.slice(8)));
  const noHire = active.filter((u) => !hireOf(u));
  const docIssueDrivers = drivers.filter((d) => { const p = docProblems(docsBy?.[d.id]); return p.missing || p.bad; }).length;
  const teams = {}; active.forEach((u) => { const t = u.team || "미지정"; teams[t] = (teams[t] || 0) + 1; });
  return (
    <div className="space-y-4">
      <Hero en="HUMAN RESOURCES · DASHBOARD" title="인사관리 대시보드" desc={`${today.replace(/-/g, ".")} · 인원·근태·결재·기사 인력 현황`}
        kpis={[
          ["재직 인원", `${active.length}명`, `가입 승인 대기 ${pendingStaff.length}명`],
          ["오늘 출근", `${inToday.length}명`, `휴가·외근 ${offToday.length} · 미기록 ${notYet.length}`],
          ["이번 달 입·퇴사", `${joinedThisMonth.length} / ${leftThisMonth.length}`, "입사 / 퇴사"],
          ["기사", `${drivers.length - pendingDrivers.length}명`, `가입 대기 ${pendingDrivers.length} · 서류 미비 ${docIssueDrivers}`],
        ]} />
      <Quick onGo={onGo} items={[["인사관리", "인사 기록", "idcard", "이력서·인사발령·근속"], ["근태관리", "출근기록부", "clock", `오늘 ${inToday.length}명 출근`], ["직원관리", "직원·기사 승인", "users", `대기 ${pendingStaff.length + pendingDrivers.length}명`], ["기사서류", "기사 서류", "file", `미비 ${docIssueDrivers}명`]]} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card en="TODO · HR" title="오늘 처리할 일">
          <Row l="휴가·근태 결재 대기" sub="전자결재 › 근태·휴가 신청" v={`${leavePending.length}건`} tone={leavePending.length ? "bad" : ""} />
          <Row l="보고·인사 결재 대기" sub="전자결재 › 업무 보고·인사" v={`${reportPending.length}건`} tone={reportPending.length ? "bad" : ""} />
          <Row l="직원 가입 승인" sub="관리자 전용 › 직원 관리" v={`${pendingStaff.length}명`} tone={pendingStaff.length ? "bad" : ""} />
          <Row l="기사 가입 승인" sub="직원 관리 › 기사 가입 승인" v={`${pendingDrivers.length}명`} tone={pendingDrivers.length ? "bad" : ""} />
          <Row l="입사일 미등록" sub="연차 계산이 안 됩니다" v={`${noHire.length}명`} tone={noHire.length ? "bad" : ""} />
        </Card>
        <Card en="ATTENDANCE · TODAY" title="오늘 근태">
          {!active.length ? <Empty t="재직 인원이 없습니다" /> : (
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
              {active.map((u) => { const a = attMap[u.id]; const s = a ? (a.status || "출근") : "미기록"; return (
                <div key={u.id} className="flex items-center gap-2 py-1">
                  <span className="w-7 h-7 rounded-lg bg-[#EEF2F8] grid place-items-center text-[12px] font-black text-[#1B2B4B] shrink-0">{String(u.name || "?").slice(0, 1)}</span>
                  <span className="flex-1 min-w-0 text-[13px] font-bold text-[#0F1A30] truncate">{u.name || "-"} <span className="text-[11.5px] font-semibold text-[#9AA9C3]">{u.team || ""}</span></span>
                  <span className={`shrink-0 h-6 px-2 rounded-md text-[11px] font-black grid place-items-center whitespace-nowrap ${s === "미기록" ? "bg-[#F3F6FA] text-[#9AA9C3]" : s === "출근" ? "bg-[#0F1A30] text-white" : "bg-[#EEF3FC] text-[#2D4C82]"}`}>{s}{a?.checkInTime ? ` ${new Date(a.checkInTime).toTimeString().slice(0, 5)}` : ""}</span>
                </div>
              ); })}
            </div>
          )}
        </Card>
        <Card en="ORGANIZATION" title="부서별 인원 · 입사 기념일">
          {Object.entries(teams).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
            <div key={t} className="flex items-center gap-2 py-1">
              <span className="w-20 shrink-0 text-[12.5px] font-bold text-[#3A4A66] truncate">{t}</span>
              <span className="flex-1 h-2 rounded-full bg-[#EEF2F8] overflow-hidden"><span className="block h-full bg-[#1B2B4B]" style={{ width: `${(n / Math.max(1, active.length)) * 100}%` }} /></span>
              <span className="w-8 text-right text-[12.5px] font-black tabular-nums" style={{ fontFamily: MONO }}>{n}</span>
            </div>
          ))}
          <div className="mt-3 pt-2 border-t border-[#F1F4F9]">
            {!anniv.length ? <div className="text-[12px] text-[#9AA9C3] font-bold">이번 달 입사 기념일이 없습니다</div> : anniv.map(({ u, h, y }) => (
              <div key={u.id} className="flex items-center justify-between py-1 text-[12.5px]"><span className="font-bold text-[#0F1A30] truncate">🎉 {u.name} <span className="text-[#9AA9C3]">{u.team || ""}</span></span><span className="font-black text-[#2D4C82] whitespace-nowrap">{h.slice(5).replace("-", ".")} · {y}주년</span></div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function DeptDashboard({ mode, company, dispatchData, onGo, pastCache, liveStart, me }) {
  if (mode === "exec") return <ExecDashboard company={company} dispatchData={dispatchData} onGo={onGo} pastCache={pastCache} liveStart={liveStart} me={me} />;
  if (mode === "acct") return <AcctDashboard company={company} dispatchData={dispatchData} onGo={onGo} />;
  return <HrDashboard company={company} onGo={onGo} />;
}
// 경리(경리/회계 권한) · 인사(인사관리자) — 커스텀 권한은 제외
export const deptModeOf = (role, customRole) => (customRole ? null : role === "test" ? "acct" : role === "hrManager" ? "hr" : null);
