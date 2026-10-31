// ======================= src/AcctSuite.jsx =======================
// 📊 경리 › 회계관리(2026-10-31) — 회계 개요(시각화) · 퇴직 정산. PC·모바일 공용.
//  · 회계 개요: 올해 매출·매입·매출총이익·예상 부가세 · 미수/미지급 · 월별 추이 · 미수 연령 · 분기 부가세 · 계정별 지출
//  · 퇴직 정산(경리 전용): 퇴직금(평균임금×30×재직일/365) · 미사용 연차수당 · 4대보험 상실 · 이직확인서(실업급여) ·
//    퇴직소득 원천징수 · 원천징수영수증 · 퇴직연금 — 법정 기한(D-day)과 처리 상태를 사람별로
import React from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where, serverTimestamp } from "firebase/firestore";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { BookHero, BookCard, Chip, Sheet, MONO } from "./OfficeBooks";
import { isTMUser } from "./staffFilter";
import { leaveEntitlement, leaveUseOf } from "./approvalForms";

const toInt = (v) => parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const short = (n) => { const a = Math.abs(n || 0); if (a >= 1e8) return `${(n / 1e8).toFixed(1)}억`; if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`; return Math.round(n || 0).toLocaleString(); };
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const next15 = (d) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + 1, 15); return x.toISOString().slice(0, 10); };
const next10 = (d) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + 1, 10); return x.toISOString().slice(0, 10); };
const dayGap = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);
const inp = "h-11 w-full px-3 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]";
const NAVY = ["#0F1A30", "#1B2B4B", "#2D4C82", "#4B6CB7", "#8FB0F0", "#CFE0FF", "#9AA9C3"];

// ── 올해 배차완료 오더(회계용) — 화면을 열 때 한 번 받아 세션 동안 기억 ──
const yearCache = new Map();
export function useYearOrders(company, fixedRows = []) {
  const y = new Date().getFullYear();
  const key = `${company}|${y}`;
  const [rows, setRows] = React.useState(() => yearCache.get(key) || null);
  React.useEffect(() => {
    if (!company || yearCache.has(key)) return undefined;
    let alive = true;
    Promise.all(["orders", "dispatch"].map((col) => getDocs(query(collection(db, col), where("상차일", ">=", `${y}-01-01`), where("상차일", "<=", `${y}-12-31`)))))
      .then((snaps) => {
        const seen = new Set(); const out = [];
        snaps.forEach((sn) => sn.docs.forEach((d) => { const r = d.data() || {}; if (seen.has(d.id)) return; seen.add(d.id); if ((r.companyName || DEFAULT_COMPANY) === company && r.배차상태 === "배차완료" && r.source !== "transport_transmit") out.push({ _id: d.id, ...r }); }));
        yearCache.set(key, out);
        if (alive) setRows(out);
      })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [key, company, y]);
  return React.useMemo(() => (rows ? [...rows, ...(fixedRows || []).map((r) => ({ ...r, 상차일: r.날짜, 배차상태: "배차완료" }))] : null), [rows, fixedRows]);
}

const Tip = ({ active, payload, label }) => (active && payload?.length ? (
  <div className="rounded-xl border border-[#E3E8F0] bg-white px-3 py-2 text-[12px] shadow-xl">
    <div className="font-black mb-1" style={{ fontFamily: MONO }}>{label}</div>
    {payload.map((p) => <div key={p.dataKey} className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: p.color }} />{p.name} <b style={{ fontFamily: MONO }}>{p.dataKey === "margin" ? `${Number(p.value).toFixed(1)}%` : `${won(p.value)}원`}</b></div>)}
  </div>
) : null);

// ═════════════════════════ 회계 개요 ═════════════════════════
export function AccountingOverview({ company, orders }) {
  const y = new Date().getFullYear();
  const [pay, setPay] = React.useState({ ar: {}, ap: {} });
  const [ledger, setLedger] = React.useState([]);
  React.useEffect(() => { getDoc(doc(db, "acctPayments", String(y))).then((s) => setPay(s.exists() ? { ar: s.data().ar || {}, ap: s.data().ap || {} } : { ar: {}, ap: {} })).catch(() => {}); }, [y]);
  React.useEffect(() => { if (!company) return undefined; return onSnapshot(query(collection(db, "acctLedger"), where("companyName", "==", company)), (s) => setLedger(s.docs.map((d) => d.data())), () => setLedger([])); }, [company]);
  if (!orders) return <div className="py-24 text-center text-[14px] font-bold text-[#9AA9C3]">올해 운행 내역을 불러오는 중…</div>;
  const today = kstDay();
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const mon = Object.fromEntries(months.map((m) => [m, { sale: 0, buy: 0 }]));
  const ar = {}; const ap = {};
  orders.forEach((r) => {
    const m = String(r.상차일 || "").slice(5, 7); const s = toInt(r.청구운임); const b = toInt(r.기사운임);
    if (mon[m]) { mon[m].sale += s; mon[m].buy += b; }
    const c = r.거래처명 || r.상차지명 || "미분류"; ar[c] = ar[c] || { inv: 0, oldest: r.상차일 }; ar[c].inv += s; if (r.상차일 < ar[c].oldest) ar[c].oldest = r.상차일;
    const d = r.이름 || "미지정"; ap[d] = (ap[d] || 0) + b;
  });
  const sale = Object.values(mon).reduce((a, x) => a + x.sale, 0);
  const buy = Object.values(mon).reduce((a, x) => a + x.buy, 0);
  const arList = Object.entries(ar).map(([c, v]) => ({ c, out: Math.max(0, v.inv - toInt(pay.ar[c])), age: dayGap(v.oldest || today, today) })).filter((x) => x.out > 0).sort((a, b) => b.out - a.out);
  const arSum = arList.reduce((a, x) => a + x.out, 0);
  const apSum = Object.entries(ap).reduce((a, [d, v]) => a + Math.max(0, v - toInt(pay.ap[d])), 0);
  const vat = Math.round((sale - buy) * 0.1);
  const curM = today.slice(5, 7);
  const chart = months.filter((m) => m <= curM).map((m) => ({ k: `${Number(m)}월`, sale: mon[m].sale, buy: mon[m].buy, margin: mon[m].sale ? ((mon[m].sale - mon[m].buy) / mon[m].sale) * 100 : 0 }));
  const aging = [["30일 이내", 0], ["31~60일", 0], ["61~90일", 0], ["90일 초과", 0]];
  arList.forEach((x) => { aging[x.age <= 30 ? 0 : x.age <= 60 ? 1 : x.age <= 90 ? 2 : 3][1] += x.out; });
  const quarters = [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]].map((ms, i) => { const s = ms.reduce((a, m) => a + mon[String(m).padStart(2, "0")].sale, 0); const b = ms.reduce((a, m) => a + mon[String(m).padStart(2, "0")].buy, 0); return { k: `${i + 1}분기`, sale: s * 0.1, buy: b * 0.1 }; });
  const acc = {}; ledger.filter((r) => r.type === "지출" && String(r.date || "").startsWith(String(y))).forEach((r) => { acc[r.account || "기타"] = (acc[r.account || "기타"] || 0) + toInt(r.amount); });
  const accList = Object.entries(acc).sort((a, b) => b[1] - a[1]); const accTop = accList.slice(0, 6); const accRest = accList.slice(6).reduce((a, [, v]) => a + v, 0); if (accRest) accTop.push(["기타", accRest]);
  return (
    <div className="space-y-4">
      <BookHero en={`ACCOUNTING · ${y}`} title="회계 개요" desc="배차완료 기준 매출·매입과 미수·미지급·부가세를 한 화면에서"
        kpis={[["올해 매출(공급가)", `${short(sale)}원`, `${orders.length.toLocaleString()}건`], ["매출총이익", `${short(sale - buy)}원`, `이익률 ${sale ? (((sale - buy) / sale) * 100).toFixed(1) : 0}%`], ["미수금 / 미지급", `${short(arSum)} / ${short(apSum)}`, "입금·지급 처리 기준"], ["예상 부가세", `${short(vat)}원`, "매출세액 − 매입세액(추정)"]]} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <BookCard en="MONTHLY" title="월별 매출 · 매입 · 이익률">
          <div className="h-[280px] -ml-2"><ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#EEF2F8" vertical={false} />
              <XAxis dataKey="k" tick={{ fill: "#7A879C", fontSize: 12, fontFamily: MONO }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="w" tickFormatter={short} tick={{ fill: "#9AA9C3", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} width={48} />
              <YAxis yAxisId="m" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fill: "#9AA9C3", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} width={38} />
              <Tooltip content={<Tip />} cursor={{ fill: "rgba(27,43,75,.04)" }} />
              <Bar yAxisId="w" dataKey="sale" name="매출" fill="#1B2B4B" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Bar yAxisId="w" dataKey="buy" name="매입" fill="#9FB2D6" radius={[6, 6, 0, 0]} maxBarSize={26} />
              <Line yAxisId="m" dataKey="margin" name="이익률" stroke="#B88A2E" strokeWidth={2.2} dot={{ r: 3, fill: "#B88A2E", strokeWidth: 0 }} />
            </ComposedChart>
          </ResponsiveContainer></div>
        </BookCard>
        <BookCard en="RECEIVABLE AGING" title="미수금 연령 분석">
          <div className="flex items-center gap-4">
            <div className="w-[150px] h-[150px] shrink-0"><ResponsiveContainer><PieChart><Pie data={aging.map(([n, v]) => ({ n, v }))} dataKey="v" nameKey="n" innerRadius={44} outerRadius={70} paddingAngle={2} stroke="none">{aging.map((_, i) => <Cell key={i} fill={["#8FB0F0", "#4B6CB7", "#1B2B4B", "#B42318"][i]} />)}</Pie></PieChart></ResponsiveContainer></div>
            <div className="flex-1 space-y-2">
              {aging.map(([l, v], i) => <div key={l} className="flex items-center gap-2 text-[13px]"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ["#8FB0F0", "#4B6CB7", "#1B2B4B", "#B42318"][i] }} /><span className="font-bold text-[#3A4A66] flex-1">{l}</span><span className="font-black tabular-nums" style={{ fontFamily: MONO }}>{short(v)}원</span></div>)}
              <div className="pt-2 border-t border-[#EEF2F8] flex justify-between text-[13px]"><span className="font-black">합계</span><span className="font-black tabular-nums" style={{ fontFamily: MONO }}>{won(arSum)}원</span></div>
            </div>
          </div>
        </BookCard>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BookCard en="VAT · QUARTERLY" title="분기별 매출·매입 세액(추정)">
          <div className="h-[200px] -ml-2"><ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={quarters} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#EEF2F8" vertical={false} />
              <XAxis dataKey="k" tick={{ fill: "#7A879C", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={short} tick={{ fill: "#9AA9C3", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} width={44} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="sale" name="매출세액" fill="#1B2B4B" radius={[6, 6, 0, 0]} maxBarSize={24} />
              <Bar dataKey="buy" name="매입세액" fill="#9FB2D6" radius={[6, 6, 0, 0]} maxBarSize={24} />
            </ComposedChart>
          </ResponsiveContainer></div>
          <div className="text-[11.5px] text-[#9AA9C3]">기사운임 매입세액은 세금계산서 수취분만 공제됩니다 — 참고용</div>
        </BookCard>
        <BookCard en="TOP RECEIVABLES" title="미수금 상위 거래처">
          {!arList.length ? <div className="py-8 text-center text-[13px] font-bold text-[#9AA9C3]">미수금이 없습니다</div> : arList.slice(0, 6).map((x) => (
            <div key={x.c} className="py-1.5">
              <div className="flex items-center justify-between text-[13px]"><span className="font-bold text-[#0F1A30] truncate">{x.c}</span><span className="font-black tabular-nums" style={{ fontFamily: MONO }}>{short(x.out)}원</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-[#EEF2F8] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(x.out / arList[0].out) * 100}%`, background: x.age > 90 ? "#B42318" : "#1B2B4B" }} /></div>
            </div>
          ))}
        </BookCard>
        <BookCard en="EXPENSE MIX" title="올해 계정과목별 지출">
          {!accTop.length ? <div className="py-8 text-center text-[13px] font-bold text-[#9AA9C3]">장부 지출이 없습니다</div> : (
            <div className="flex items-center gap-3">
              <div className="w-[120px] h-[120px] shrink-0"><ResponsiveContainer><PieChart><Pie data={accTop.map(([n, v]) => ({ n, v }))} dataKey="v" innerRadius={34} outerRadius={56} stroke="none">{accTop.map((_, i) => <Cell key={i} fill={NAVY[i % NAVY.length]} />)}</Pie></PieChart></ResponsiveContainer></div>
              <div className="flex-1 min-w-0 space-y-1">{accTop.map(([n, v], i) => <div key={n} className="flex items-center gap-1.5 text-[12px]"><span className="w-2 h-2 rounded-sm shrink-0" style={{ background: NAVY[i % NAVY.length] }} /><span className="truncate flex-1 font-bold text-[#3A4A66]">{n}</span><span className="font-black tabular-nums" style={{ fontFamily: MONO }}>{short(v)}</span></div>)}</div>
            </div>
          )}
        </BookCard>
      </div>
    </div>
  );
}

// ═════════════════════════ 퇴직 정산(경리 전용) ═════════════════════════
export const RETIRE_REASONS = ["자진 퇴사", "권고사직", "계약 만료", "정년 퇴직", "해고", "기타"];
const INVOLUNTARY = ["권고사직", "계약 만료", "정년 퇴직", "해고"];
export const RETIRE_STEPS = [
  { key: "severance", label: "퇴직금 지급", desc: "1일 평균임금 × 30일 × 재직일수/365 · 1년 이상 근무", due: (d) => addDays(d, 14), money: "severance" },
  { key: "leavePay", label: "미사용 연차수당 지급", desc: "1일 통상임금 × 미사용 연차일수", due: (d) => addDays(d, 14), money: "leavePay" },
  { key: "finalWage", label: "마지막 달 급여 정산", desc: "퇴직일까지 일할 계산", due: (d) => addDays(d, 14) },
  { key: "insurance", label: "4대보험 상실 신고", desc: "국민연금·건강·고용·산재 — 건강보험료 퇴직 정산 포함", due: (d) => next15(d) },
  { key: "jobCert", label: "이직확인서 제출(실업급여)", desc: "고용센터 · 근로자 요청 시 10일 이내 — 실업급여 신청에 필요", due: (d) => addDays(d, 10) },
  { key: "tax", label: "퇴직소득세 원천징수·신고", desc: "지급한 달의 다음 달 10일 원천세 신고", due: (d) => next10(d) },
  { key: "receipt", label: "원천징수영수증 교부", desc: "근로소득·퇴직소득(중도 퇴사자 연말정산)", due: (d) => next10(d) },
  { key: "pension", label: "퇴직연금 처리(DB·DC 가입 시)", desc: "퇴직연금 사업자에 지급 요청 · IRP 계좌 이전" },
];
export function calcSeverance({ hireDate, lastDay, avgMonthly }) {
  if (!hireDate || !lastDay) return { days: 0, amount: 0, eligible: false };
  const days = dayGap(hireDate, lastDay) + 1;
  const daily = (toInt(avgMonthly) * 3) / 92; // 3개월 평균임금(대략 92일 기준)
  const amount = days >= 365 ? Math.round(daily * 30 * (days / 365)) : 0;
  return { days, amount, eligible: days >= 365, daily };
}
export function RetireDesk({ company, isViewer = false }) {
  const [users, setUsers] = React.useState([]);
  const [cases, setCases] = React.useState(null);
  const [approvals, setApprovals] = React.useState([]);
  const [profiles, setProfiles] = React.useState({});
  const [open, setOpen] = React.useState(null);
  const [filter, setFilter] = React.useState("open");
  React.useEffect(() => { if (!company) return undefined; return onSnapshot(query(collection(db, "users"), where("companyName", "==", company)), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setUsers([])); }, [company]);
  React.useEffect(() => { if (!company) return undefined; return onSnapshot(query(collection(db, "retireCases"), where("companyName", "==", company)), (s) => setCases(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setCases([])); }, [company]);
  React.useEffect(() => { if (!company) return undefined; return onSnapshot(query(collection(db, "approvals"), where("company", "==", company)), (s) => setApprovals(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.cat === "leave" || (a.form === "resign"))), () => setApprovals([])); }, [company]);
  React.useEffect(() => onSnapshot(collection(db, "userProfiles"), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setProfiles(m); }, () => {}), []);
  const today = kstDay();
  const byId = Object.fromEntries((cases || []).map((c) => [c.id, c]));
  // 퇴사(또는 사직서 승인)한 직원 = 정산 대상
  const resignDoc = (uid) => approvals.filter((a) => a.form === "resign" && a.drafterUid === uid && a.status === "approved").sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
  const targets = users.filter((u) => !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role) && !isTMUser(u) && (u.employmentStatus === "퇴사" || byId[u.id] || resignDoc(u.id)));
  const rows = targets.map((u) => {
    const c = byId[u.id] || {};
    const lastDay = c.lastDay || u.resignedAt || resignDoc(u.id)?.data?.last || "";
    const done = RETIRE_STEPS.filter((s) => c.steps?.[s.key]?.done).length;
    const late = RETIRE_STEPS.filter((s) => !c.steps?.[s.key]?.done && s.due && lastDay && s.due(lastDay) < today).length;
    return { u, c, lastDay, done, late, finished: done === RETIRE_STEPS.length || c.closed };
  }).filter((r) => (filter === "open" ? !r.finished : filter === "done" ? r.finished : true)).sort((a, b) => (b.late - a.late) || String(b.lastDay).localeCompare(String(a.lastDay)));
  const all = targets.length;
  const pendingSev = (cases || []).filter((c) => !c.steps?.severance?.done && toInt(c.severance) > 0).reduce((a, c) => a + toInt(c.severance), 0);
  return (
    <div className="space-y-4">
      <BookHero en="ACCOUNTING · RETIREMENT" title="퇴직 정산" desc="퇴직금 · 미사용 연차수당 · 4대보험 상실 · 이직확인서(실업급여) · 퇴직소득세 — 법정 기한까지"
        kpis={[["정산 대상", `${all}명`, "퇴사·사직서 승인 기준"], ["진행 중", `${targets.filter((u) => { const c = byId[u.id]; return !(c?.closed || RETIRE_STEPS.every((s) => c?.steps?.[s.key]?.done)); }).length}명`, ""], ["기한 지난 항목", `${rows.reduce((a, r) => a + r.late, 0)}건`, "퇴직금 14일 · 상실 다음 달 15일"], ["지급 예정 퇴직금", `${short(pendingSev)}원`, "계산값 기준"]]} />
      <div className="flex gap-1.5">{[["open", "진행 중"], ["done", "완료"], ["all", "전체"]].map(([k, l]) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}</div>
      <BookCard en="CASES" title={`퇴직자 ${rows.length}명`} flush>
        {cases === null ? <div className="py-12 text-center text-[13px] font-bold text-[#9AA9C3]">불러오는 중…</div> : !rows.length ? <div className="py-14 text-center text-[13.5px] font-bold text-[#9AA9C3]">정산할 퇴직자가 없습니다 · 인사관리부에서 퇴사·권고사직 처리하면 여기에 생깁니다</div> : (
          <div className="divide-y divide-[#EEF2F8]">
            {rows.map(({ u, c, lastDay, done, late }) => (
              <button key={u.id} type="button" onClick={() => setOpen(u)} className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#F7F9FC]">
                <span className="w-11 h-11 rounded-2xl bg-[#1B2B4B] text-white grid place-items-center text-[15px] font-black shrink-0">{String(u.name || "?").slice(0, 1)}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 flex-wrap"><span className="text-[15px] font-black text-[#0F1A30]">{u.name || u.email}</span><span className="text-[12px] font-bold text-[#7A879C]">{[u.team, u.position].filter(Boolean).join(" · ")}</span>{c.reason && <span className={`text-[10.5px] font-black px-1.5 py-0.5 rounded-md ${INVOLUNTARY.includes(c.reason) ? "bg-[#EEF3FC] text-[#2D4C82]" : "bg-[#F3F6FA] text-[#5B6B85]"}`}>{c.reason}</span>}{late > 0 && <span className="text-[10.5px] font-black px-1.5 py-0.5 rounded-md bg-[#FEF3F2] text-[#B42318]">기한 지남 {late}</span>}</span>
                  <span className="block text-[12px] text-[#7A879C] mt-0.5" style={{ fontFamily: MONO }}>퇴직일 {lastDay || "미정"}{c.severance ? ` · 퇴직금 ${won(c.severance)}원${c.steps?.severance?.done ? " 지급" : " 미지급"}` : ""}</span>
                  <span className="mt-1.5 block h-1.5 rounded-full bg-[#EEF2F8] overflow-hidden max-w-[360px]"><span className="block h-full rounded-full" style={{ width: `${(done / RETIRE_STEPS.length) * 100}%`, background: done === RETIRE_STEPS.length ? "#12B76A" : "#1B2B4B" }} /></span>
                </span>
                <span className="text-[17px] font-black tabular-nums" style={{ fontFamily: MONO }}>{done}<span className="text-[11px] text-[#9AA9C3]">/{RETIRE_STEPS.length}</span></span>
              </button>
            ))}
          </div>
        )}
      </BookCard>
      {open && <RetireCaseSheet company={company} u={open} c={byId[open.id] || {}} profile={profiles[open.id] || {}} resign={resignDoc(open.id)} approvals={approvals} isViewer={isViewer} onClose={() => setOpen(null)} />}
    </div>
  );
}
function RetireCaseSheet({ company, u, c, profile, resign, approvals, isViewer, onClose }) {
  const hire = c.hireDate || profile.hireDate || u.hireDate || "";
  const ent = leaveEntitlement(hire);
  const usedLeave = ent ? approvals.filter((a) => a.drafterUid === u.id && a.status === "approved").map(leaveUseOf).filter((x) => x && x.date >= ent.from && x.date <= ent.to).reduce((s, x) => s + x.days, 0) : 0;
  const [f, setF] = React.useState({
    reason: c.reason || (u.resignType || "자진 퇴사"), lastDay: c.lastDay || u.resignedAt || resign?.data?.last || kstDay(), hireDate: hire,
    avgMonthly: String(c.avgMonthly || ""), unusedLeave: String(c.unusedLeave ?? (ent ? Math.max(0, ent.total - usedLeave) : "")), dailyOrdinary: String(c.dailyOrdinary || ""),
    pension: c.pension || "미가입", memo: c.memo || "", steps: c.steps || {},
  });
  const sev = calcSeverance({ hireDate: f.hireDate, lastDay: f.lastDay, avgMonthly: f.avgMonthly });
  const leavePay = Math.round(toInt(f.dailyOrdinary || (toInt(f.avgMonthly) / 209) * 8) * Number(f.unusedLeave || 0));
  const save = async (extra = {}) => {
    const next = { ...f, ...extra };
    await setDoc(doc(db, "retireCases", u.id), { companyName: company, uid: u.id, name: u.name || "", team: u.team || "", position: u.position || "", reason: next.reason, lastDay: next.lastDay, hireDate: next.hireDate, avgMonthly: toInt(next.avgMonthly), unusedLeave: Number(next.unusedLeave || 0), dailyOrdinary: toInt(next.dailyOrdinary), pension: next.pension, memo: next.memo, steps: next.steps, severance: sev.amount, leavePay, updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || "" }, { merge: true });
  };
  const toggle = (k) => { if (isViewer) return; const cur = f.steps[k] || {}; const steps = { ...f.steps, [k]: cur.done ? { done: false } : { done: true, at: kstDay() } }; setF((p) => ({ ...p, steps })); save({ steps }); };
  const today = kstDay();
  return (
    <Sheet side en="RETIREMENT · SETTLEMENT" title={`${u.name || u.email} 퇴직 정산`} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="h-12 px-5 rounded-xl border border-[#DCE3EE] bg-white text-[14px] font-bold text-[#3A4A66]">닫기</button>{!isViewer && <button type="button" onClick={async () => { await save(); onClose(); }} className="flex-1 h-12 rounded-xl bg-[#0F1A30] text-white text-[15px] font-black">저장</button>}</>}>
      <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
        <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>ESTIMATE · 계산</div>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div><div className="text-[12px] text-white/60">퇴직금 {sev.eligible ? "" : "(1년 미만 — 대상 아님)"}</div><div className="text-[24px] font-black tabular-nums" style={{ fontFamily: MONO }}>{won(sev.amount)}원</div><div className="text-[11.5px] text-white/50">재직 {sev.days.toLocaleString()}일</div></div>
          <div><div className="text-[12px] text-white/60">미사용 연차수당</div><div className="text-[24px] font-black tabular-nums" style={{ fontFamily: MONO }}>{won(leavePay)}원</div><div className="text-[11.5px] text-white/50">{f.unusedLeave || 0}일</div></div>
        </div>
        <div className={`mt-3 rounded-xl px-3 py-2 text-[12.5px] font-bold ${INVOLUNTARY.includes(f.reason) ? "bg-white/15" : "bg-white/[0.07]"}`}>
          실업급여: {INVOLUNTARY.includes(f.reason) ? "비자발적 이직 — 수급 가능성이 높습니다. 이직확인서를 꼭 제출해 주세요." : "자발적 퇴사 — 원칙적으로 수급 불가(임금체불·통근 곤란 등 예외 사유 확인)."}
        </div>
      </div>
      {resign && <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4"><div className="text-[12px] font-extrabold tracking-[0.2em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>RESIGNATION</div><div className="text-[14.5px] font-black text-[#0F1A30] mt-1">사직서 {resign.docNo || ""} · 퇴직 희망일 {resign.data?.last || "-"}</div><div className="text-[13px] text-[#5B6B85] mt-1 whitespace-pre-wrap">{resign.data?.reason || ""}</div></div>}
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4 space-y-3">
        <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">퇴직 사유</div><div className="flex flex-wrap gap-1.5">{RETIRE_REASONS.map((r) => <Chip key={r} on={f.reason === r} onClick={() => setF((p) => ({ ...p, reason: r }))}>{r}</Chip>)}</div></div>
        <div className="grid grid-cols-2 gap-2">
          <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">입사일</div><input type="date" value={f.hireDate} onChange={(e) => setF((p) => ({ ...p, hireDate: e.target.value }))} className={inp} /></div>
          <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">퇴직일(마지막 근무일)</div><input type="date" value={f.lastDay} onChange={(e) => setF((p) => ({ ...p, lastDay: e.target.value }))} className={inp} /></div>
          <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">최근 3개월 월평균 임금</div><input inputMode="numeric" value={f.avgMonthly ? won(f.avgMonthly) : ""} onChange={(e) => setF((p) => ({ ...p, avgMonthly: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right tabular-nums`} style={{ fontFamily: MONO }} placeholder="세전 · 상여 포함" /></div>
          <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">미사용 연차(일)</div><input inputMode="decimal" value={f.unusedLeave} onChange={(e) => setF((p) => ({ ...p, unusedLeave: e.target.value.replace(/[^\d.]/g, "") }))} className={`${inp} text-right`} /></div>
          <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">1일 통상임금(선택)</div><input inputMode="numeric" value={f.dailyOrdinary ? won(f.dailyOrdinary) : ""} onChange={(e) => setF((p) => ({ ...p, dailyOrdinary: e.target.value.replace(/[^\d]/g, "") }))} className={`${inp} text-right`} placeholder="비우면 월급÷209×8" /></div>
          <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">퇴직연금</div><select value={f.pension} onChange={(e) => setF((p) => ({ ...p, pension: e.target.value }))} className={inp}>{["미가입", "DB형", "DC형", "IRP"].map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4">
        <div className="text-[12px] font-extrabold tracking-[0.2em] text-[#4B6CB7] mb-2" style={{ fontFamily: MONO }}>CHECKLIST · 법정 기한</div>
        <div className="space-y-2">
          {RETIRE_STEPS.map((s) => {
            const st = f.steps[s.key] || {}; const due = s.due && f.lastDay ? s.due(f.lastDay) : ""; const late = !st.done && due && due < today;
            return (
              <button key={s.key} type="button" onClick={() => toggle(s.key)} disabled={isViewer} className={`w-full text-left rounded-xl border px-3 py-2.5 flex items-start gap-3 ${st.done ? "bg-[#ECFDF3] border-[#ABEFC6]" : late ? "bg-[#FEF3F2] border-[#FECDCA]" : "bg-white border-[#E3E8F0]"}`}>
                <span className={`w-5 h-5 mt-0.5 rounded-md grid place-items-center text-[12px] font-black shrink-0 ${st.done ? "bg-[#12B76A] text-white" : "border-2 border-[#C9D2E0]"}`}>{st.done ? "✓" : ""}</span>
                <span className="flex-1 min-w-0"><span className="block text-[14px] font-black text-[#0F1A30]">{s.label}{s.money === "severance" && sev.amount ? ` · ${won(sev.amount)}원` : s.money === "leavePay" && leavePay ? ` · ${won(leavePay)}원` : ""}</span><span className="block text-[12px] text-[#7A879C]">{s.desc}</span></span>
                <span className={`text-[11.5px] font-black whitespace-nowrap ${late ? "text-[#B42318]" : "text-[#5B6B85]"}`} style={{ fontFamily: MONO }}>{st.done ? `완료 ${st.at}` : due ? `기한 ${due}` : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div><div className="text-[12.5px] font-black text-[#3A4A66] mb-1.5">메모</div><textarea value={f.memo} onChange={(e) => setF((p) => ({ ...p, memo: e.target.value }))} rows={3} className={`${inp} h-auto py-2`} placeholder="지급 계좌·특이사항" /></div>
      <div className="text-[11.5px] text-[#9AA9C3] leading-relaxed">계산값은 참고용입니다(평균임금 = 퇴직 전 3개월 임금 총액 ÷ 그 기간 총일수). 실제 지급액은 급여 대장 기준으로 확인해 주세요.</div>
    </Sheet>
  );
}
