// ======================= src/DeptDashboard.jsx =======================
// 🏢 부서 대시보드(2026-10-31) — 경리·회계 / 인사관리 권한으로 들어오면 홈 › 대시보드가 부서 업무 화면으로 바뀐다.
//  홈의 디자인(네이비 디지털 히어로 + 카드)은 그대로, 내용만 부서 업무로. PC·모바일 공용.
//   경리: 이번 달 매출·매입·수수료 · 6개월 추이 · 거래처 미정산 · 용차 지급 대기 · 지출결의 · 기사 서류
//   인사: 재직·입퇴사 · 오늘 출근 현황 · 휴가·근태 결재 대기 · 입사 기념일 · 기사(가입 대기·서류)
import React from "react";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "./firebase";
import { ShellIcon } from "./AdminShell";
import { useFleetDrivers } from "./FleetPayDocs";
import { useCompanyDriverDocs, docProblems } from "./driverRequiredDocs";
import { isTMUser } from "./staffFilter";
import { ExecDashboard, eventsOf } from "./ExecSuite";
import { leaveEntitlement, leaveUseOf } from "./approvalForms";
import { pcLiveWindowStart, pcPrevDay } from "./orderHistory";
import { useFundsSummary } from "./FundsBoard";

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
// cats — 경리는 보안 규칙상 지출결의·근태·보고만 읽을 수 있어 조회에도 분류 조건을 붙인다(없으면 조회 전체가 거부됨)
function useCompanyApprovals(company, cats = null) {
  const [rows, setRows] = React.useState([]);
  const ck = cats ? cats.join(",") : "";
  React.useEffect(() => {
    if (!company) return undefined;
    const qs = [where("company", "==", company), ...(cats ? [where("cat", "in", cats)] : [])];
    return onSnapshot(query(collection(db, "approvals"), ...qs), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [company, ck]); // eslint-disable-line react-hooks/exhaustive-deps
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
// 실시간 오더는 최근 며칠뿐이라, 지난 6개월 배차완료 오더는 하루 1번 불러와 요약만 PC에 저장한다(읽기 절약).
//  months: { "YYYY-MM": [매출, 매입, 건수] } / recent(최근 3개월): [상차일, 거래처, 청구운임, 기사운임, 차량번호, 지급상태]
const ACCT_V = 2;
const dateOf = (r) => String(r?.상차일 || "").slice(0, 10);
function useAcctHistory(company, dispatchData) {
  const ls = pcLiveWindowStart();
  const key = `kpAcctHist:${company}`;
  const read = () => { try { const c = JSON.parse(localStorage.getItem(key) || "null"); return c && c.v === ACCT_V && c.day === kst(0) && c.ls === ls ? c : null; } catch { return null; } };
  const [hist, setHist] = React.useState(read);
  const [loading, setLoading] = React.useState(false);
  const load = React.useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      const snaps = await Promise.all(["orders", "dispatch"].map((col) => getDocs(query(collection(db, col), where("상차일", ">=", `${ymAgo(5)}-01`), where("상차일", "<=", pcPrevDay(ls))))));
      const months = {}; const recent = []; const cut = `${ymAgo(2)}-01`;
      snaps.flatMap((sn) => sn.docs.map((d) => d.data() || {}))
        .filter((r) => (r.companyName || DEFAULT_COMPANY) === company && r.source !== "transport_transmit" && (r.배차상태 || "") === "배차완료")
        .forEach((r) => {
          const d = dateOf(r); const e = months[d.slice(0, 7)] || (months[d.slice(0, 7)] = [0, 0, 0]);
          e[0] += toInt(r.청구운임); e[1] += toInt(r.기사운임); e[2] += 1;
          if (d >= cut) recent.push([d, String(r.거래처명 || "").trim(), toInt(r.청구운임), toInt(r.기사운임), String(r.차량번호 || "").trim(), r.지급상태 || ""]);
        });
      const c = { v: ACCT_V, day: kst(0), ls, months, recent, at: Date.now() };
      try { localStorage.setItem(key, JSON.stringify(c)); } catch { /* 용량 초과는 무시 */ }
      setHist(c);
    } catch { setHist((h) => h || { months: {}, recent: [], at: 0 }); } finally { setLoading(false); }
  }, [company, ls, key]);
  React.useEffect(() => { if (company && !hist) load(); }, [company]); // eslint-disable-line react-hooks/exhaustive-deps
  return React.useMemo(() => {
    const months = {}; Object.entries(hist?.months || {}).forEach(([m, v]) => { months[m] = [...v]; });
    const recent = [...(hist?.recent || [])];
    (dispatchData || []).filter((r) => dateOf(r) >= ls && (r.배차상태 || "") === "배차완료" && r.source !== "transport_transmit").forEach((r) => {
      const d = dateOf(r); const e = months[d.slice(0, 7)] || (months[d.slice(0, 7)] = [0, 0, 0]);
      e[0] += toInt(r.청구운임); e[1] += toInt(r.기사운임); e[2] += 1;
      recent.push([d, String(r.거래처명 || "").trim(), toInt(r.청구운임), toInt(r.기사운임), String(r.차량번호 || "").trim(), r.지급상태 || ""]);
    });
    return { months, recent, ready: !!hist, at: hist?.at || 0, loading, reload: load };
  }, [hist, dispatchData, ls, loading, load]);
}
function useCompanyRows(name, company) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    if (!company) return undefined;
    return onSnapshot(query(collection(db, name), where("companyName", "==", company)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
  }, [name, company]);
  return rows || [];
}
// 세무·납부 일정(일반 기준 — 휴일이면 다음 영업일)
function taxEvents(today) {
  const y = Number(today.slice(0, 4)); const m = Number(today.slice(5, 7)); const p = (n) => String(n).padStart(2, "0");
  const ev = [];
  for (let i = 0; i < 4; i += 1) {
    const mm = ((m - 1 + i) % 12) + 1; const yy = y + Math.floor((m - 1 + i) / 12); const ym = `${yy}-${p(mm)}`;
    ev.push({ d: `${ym}-10`, t: "원천세 신고·납부", s: "전월 급여·사업소득 원천징수분" });
    ev.push({ d: `${ym}-10`, t: "4대보험료 납부", s: "국민연금·건강·고용·산재" });
    ev.push({ d: `${ym}-10`, t: "월합계 세금계산서 발행 마감", s: "전월 거래분 — 거래처 정산" });
    if (mm === 1 || mm === 7) ev.push({ d: `${ym}-25`, t: "부가가치세 확정신고·납부", s: mm === 1 ? "전년 2기(7~12월)" : "1기(1~6월)", big: true });
    if (mm === 4 || mm === 10) ev.push({ d: `${ym}-25`, t: "부가가치세 예정신고·납부", s: "법인 예정신고 / 개인 예정고지", big: true });
    if (mm === 3) { ev.push({ d: `${ym}-10`, t: "연말정산 지급명세서 제출", s: "2월분 원천세 신고와 함께" }); ev.push({ d: `${ym}-31`, t: "법인세 신고·납부", s: "12월 결산 법인", big: true }); }
    if (mm === 5) ev.push({ d: `${ym}-31`, t: "종합소득세 신고·납부", s: "개인사업자", big: true });
    if (mm === 8) ev.push({ d: `${ym}-31`, t: "법인세 중간예납", s: "12월 결산 법인" });
    if (mm === 12) ev.push({ d: `${ym}-31`, t: "연말 결산 준비", s: "재고·자산·미수/미지급 정리" });
  }
  return ev.filter((e) => e.d >= today).sort((a, b) => a.d.localeCompare(b.d));
}
const dDay = (d, today) => { const n = Math.round((new Date(`${d}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 864e5); return n === 0 ? "D-DAY" : `D-${n}`; };

function AcctDashboard({ company, dispatchData = [], onGo }) {
  const today = kst(0); const ym = ymAgo(0);
  const clients = useCol("clients", company);
  const approvals = useCompanyApprovals(company, ["expense"]);
  const fleet = useFleetDrivers();
  const docsBy = useCompanyDriverDocs(company);
  const ledger = useCompanyRows("acctLedger", company);
  const recurring = useCompanyRows("acctRecurring", company);
  const assets = useCompanyRows("officeAssets", company);
  const users = useCol("users", company, (u) => (u.companyName || DEFAULT_COMPANY) === company);
  const H = useAcctHistory(company, dispatchData);
  const F = useFundsSummary(company);
  const fleetPlates = React.useMemo(() => new Set((fleet || []).map((d) => String(d.차량번호 || "").trim()).filter((p) => p && p !== "-")), [fleet]);

  // 자금(수입·지출 장부)
  const monthL = ledger.filter((r) => String(r.date || "").startsWith(ym));
  const inSum = monthL.filter((r) => r.type === "수입").reduce((s, r) => s + toInt(r.amount), 0);
  const outSum = monthL.filter((r) => r.type === "지출").reduce((s, r) => s + toInt(r.amount), 0);
  const byAcc = {}; monthL.filter((r) => r.type === "지출").forEach((r) => { byAcc[r.account || "기타"] = (byAcc[r.account || "기타"] || 0) + toInt(r.amount); });
  const accTop = Object.entries(byAcc).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const noEvidence = monthL.filter((r) => r.type === "지출" && !r.receipt && !r.evidence).length;
  const imported = new Set(ledger.map((r) => r.sourceId).filter(Boolean));
  const expApproved = approvals.filter((a) => a.cat === "expense" && a.status === "approved" && Number(a.amount) > 0);
  const notImported = expApproved.filter((a) => !imported.has(a.id));
  const expPending = approvals.filter((a) => a.cat === "expense" && a.status === "pending");
  const recurDone = new Set(monthL.map((r) => r.recurId).filter(Boolean));
  const recurTodo = recurring.filter((r) => r.active !== false && !recurDone.has(r.id));
  const lowStock = assets.filter((a) => a.category === "소모품" && toInt(a.minQty) > 0 && toInt(a.qty) <= toInt(a.minQty));

  // 미수(거래처 미정산 — 지난 2개월) · 미지급(용차 지급 대기)
  const settleSt = {}; (clients || []).forEach((c) => { settleSt[String(c.거래처명 || c.id || "").trim()] = c.정산상태 && typeof c.정산상태 === "object" ? c.정산상태 : {}; });
  const arMonths = [ymAgo(1), ymAgo(2)];
  const ar = {};
  H.recent.forEach(([d, c, sale]) => {
    const m = d.slice(0, 7); if (!arMonths.includes(m) || !c) return;
    const s = settleSt[c]?.[m.replace("-", "")] || settleSt[c]?.[m];
    if (s === "정산완료") return;
    const k = `${c}|${m}`; ar[k] = ar[k] || { c, m, amt: 0, n: 0 }; ar[k].amt += sale; ar[k].n += 1;
  });
  const arList = Object.values(ar).sort((a, b) => b.amt - a.amt);
  const arSum = arList.reduce((s, x) => s + x.amt, 0);
  const ap = H.recent.filter(([d, , , buy, plate, st]) => d >= `${ymAgo(1)}-01` && buy > 0 && !fleetPlates.has(plate) && st !== "지급완료");
  const apSum = ap.reduce((s, r) => s + r[3], 0);
  const cur = H.months[ym] || [0, 0, 0];
  const six = [5, 4, 3, 2, 1, 0].map((n) => { const m = ymAgo(n); const v = H.months[m] || [0, 0, 0]; return { m, sale: v[0], buy: v[1] }; });
  const max = Math.max(1, ...six.map((x) => x.sale));
  const docWait = Object.values(docsBy || {}).reduce((s, b) => s + (docProblems(b).wait ? 1 : 0), 0);
  const pendingStaff = (users || []).filter((u) => u.approved === false && u.employmentStatus !== "퇴사" && !["shipper", "cafeUser", "totalMaster"].includes(u.role)).length;
  const tax = taxEvents(today).slice(0, 6);
  const todos = [
    ["지출결의 결재 대기", "전자결재 › 비용·지출 결의", `${expPending.length}건`, expPending.length, "전자결재"],
    ["장부에 안 올린 승인 지출", "수입·지출 › 결재 지출 가져오기", `${notImported.length}건`, notImported.length, "자금관리:book"],
    ["이번 달 고정비 미반영", "임대료·통신비 등", `${recurTodo.length}건`, recurTodo.length, "자금관리:book"],
    ["증빙 없는 지출", "영수증·세금계산서 첨부", `${noEvidence}건`, noEvidence, "자금관리:book"],
    ["용차 지급 대기", "지난달~이번 달 · 지입 제외", `${short(apSum)}원`, ap.length, "정산관리:지급관리"],
    ["소모품 재고 부족", "최소 수량 이하", `${lowStock.length}종`, lowStock.length, "비품관리"],
    ["기사 서류 검토 대기", "통장 사본·사업자등록증 등", `${docWait}명`, docWait, "기사서류"],
    ["직원·기사 가입 승인", "관리자메뉴 › 회원 관리 · 기사관리", `${pendingStaff}명`, pendingStaff, "관리자메뉴"],
  ];
  return (
    <div className="space-y-4">
      <Hero en="ACCOUNTING · FINANCE DESK" title="경리·회계 대시보드" desc={`${today.replace(/-/g, ".")} · 자금 흐름 · 미수 · 미지급 · 세무 일정을 한눈에`}
        kpis={[
          ["보유 자금", F.has ? `${short(F.cash)}원` : "미입력", F.has ? `이번 달 수입 ${short(inSum)} · 지출 ${short(outSum)}${F.runway != null ? ` · 런웨이 ${F.runway.toFixed(1)}개월` : ""}` : "자금관리에서 자금 상태 입력"],
          ["미수금(거래처 미정산)", `${short(arSum)}원`, `${new Set(arList.map((x) => x.c)).size}곳 · 지난 2개월`],
          ["미지급(용차 지급 대기)", `${short(apSum)}원`, `${ap.length}건 · 지난달~이번 달`],
          ["이번 달 매출 / 매입", `${short(cur[0])} / ${short(cur[1])}`, `수수료 ${short(cur[0] - cur[1])}원 · ${cur[2]}건`],
        ]} />
      <Quick onGo={onGo} items={[
        ["정산관리", "거래처 정산", "receipt", `미수 ${arList.length}건`], ["정산관리:지급관리", "용차 지급", "wallet", `대기 ${ap.length}건`],
        ["회계관리", "회계 장부", "money", "미수·미지급·부가세"], ["자금관리", "자금 현황", "wallet", F.has ? `보유 ${short(F.cash)}원` : "자금 상태 입력"],
        ["비품관리", "비품·자산", "list", `재고 부족 ${lowStock.length}`], ["전자결재", "지출결의 결재", "stamp", `대기 ${expPending.length}건`],
        ["매출관리", "매출 분석", "chart", "거래처·월별"], ["배차현황", "배차현황", "truck", "운행 내역 확인"],
      ]} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card en="TODO · ACCOUNTING" title="오늘 처리할 일">
          {todos.map(([l, sub, v, n, go]) => (
            <button key={l} type="button" onClick={() => onGo?.(go)} className="w-full text-left"><Row l={l} sub={sub} v={v} tone={n ? "bad" : ""} /></button>
          ))}
        </Card>
        <Card en="TAX CALENDAR" title="세무·납부 일정">
          {tax.map((e) => (
            <div key={`${e.d}${e.t}`} className="flex items-center gap-3 py-2 border-b border-[#F1F4F9] last:border-b-0">
              <span className={`w-[58px] shrink-0 h-8 rounded-lg grid place-items-center text-[11.5px] font-black tabular-nums ${e.d === today ? "bg-[#B42318] text-white" : e.big ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`} style={{ fontFamily: MONO }}>{dDay(e.d, today)}</span>
              <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-black text-[#0F1A30] truncate">{e.t}</span><span className="block text-[11.5px] text-[#7A879C] truncate">{e.d.slice(5).replace("-", ".")} · {e.s}</span></span>
            </div>
          ))}
          <div className="mt-2 text-[11px] text-[#9AA9C3]">일반 기준 일정입니다 · 휴일이면 다음 영업일</div>
        </Card>
        <Card en="EXPENSE · THIS MONTH" title="계정과목별 지출" right={<button type="button" onClick={() => onGo?.("자금관리:book")} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] whitespace-nowrap">장부 ›</button>}>
          {!accTop.length ? <Empty t="이번 달 지출 기록이 없습니다" /> : accTop.map(([a, v]) => (
            <div key={a} className="py-1.5">
              <div className="flex items-center justify-between text-[13px]"><span className="font-bold text-[#0F1A30] truncate">{a}</span><span className="font-black tabular-nums" style={{ fontFamily: MONO }}>{short(v)}원</span></div>
              <div className="mt-1 h-1.5 rounded-full bg-[#EEF2F8] overflow-hidden"><div className="h-full rounded-full bg-[#1B2B4B]" style={{ width: `${(v / Math.max(1, accTop[0][1])) * 100}%` }} /></div>
            </div>
          ))}
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
        <Card en="RECEIVABLE" title="거래처 미수금 상위" right={<button type="button" onClick={() => onGo?.("정산관리")} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] whitespace-nowrap">거래처 정산 ›</button>}>
          {!H.ready ? <Empty t="지난 운행 내역을 불러오는 중…" /> : !arList.length ? <Empty t="미정산 거래처가 없습니다" /> : arList.slice(0, 7).map((x) => <Row key={`${x.c}${x.m}`} l={x.c} sub={`${x.m.replace("-", ".")} · ${x.n}건 · 정산 전`} v={`${x.amt.toLocaleString()}원`} />)}
        </Card>
        <Card en="TREND · 6 MONTHS" title="월별 매출 · 매입(배차완료 기준)"
          right={<button type="button" disabled={H.loading} onClick={H.reload} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] whitespace-nowrap disabled:opacity-50">{H.loading ? "불러오는 중…" : "새로 고침"}</button>}>
          <div className="flex items-end gap-2 h-[170px] pt-2">
            {six.map((x) => (
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
            <span className="ml-auto whitespace-nowrap text-[#9AA9C3]">{H.at ? `${new Date(H.at + 9 * 3600e3).toISOString().slice(11, 16)} 기준` : ""}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────── 인사관리 ───────────────────────────
const addMonths = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const hm = (t) => { if (!t) return ""; const d = new Date(typeof t === "number" ? t : t?.seconds ? t.seconds * 1000 : t); return isNaN(d) ? "" : new Date(d.getTime() + 9 * 3600e3).toISOString().slice(11, 16); };
function HrDashboard({ company, onGo }) {
  const users = useCol("users", company, (u) => (u.companyName || DEFAULT_COMPANY) === company);
  const profiles = useCol("userProfiles", company);
  const today = kst(0); const ym = ymAgo(0);
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
  const nm = (u) => u?.name || u?.이름 || u?.email || "-";
  const joined = active.filter((u) => String(hireOf(u)).startsWith(ym));
  const left = staff.filter((u) => u.employmentStatus === "퇴사" && String(u.resignedAt || u.resignDate || u.퇴사일 || "").startsWith(ym));
  // 오늘 근태 — 출근기록 + 전자결재 휴가·외근(결재 완료·진행 중)
  const attMap = Object.fromEntries((attendance || []).map((a) => [a.uid, a]));
  const evs = approvals.flatMap(eventsOf);
  const awayMap = {}; evs.filter((e) => e.date === today && !/조퇴|지각/.test(e.label)).forEach((e) => { awayMap[e.uid] = e; });
  const stateOf = (u) => {
    const a = attMap[u.id]; const t = hm(a?.checkInTime);
    if (a?.status && a.status !== "출근") return { s: a.status, t, tone: /지각/.test(a.status) ? "bad" : "soft" };
    if (a && (a.status === "출근" || a.checkInTime)) return { s: "출근", t, tone: "ok" };
    if (awayMap[u.id]) return { s: awayMap[u.id].label, t: awayMap[u.id].status !== "approved" ? "결재 중" : "", tone: "soft" };
    return { s: "미기록", t: "", tone: "none" };
  };
  const board = active.map((u) => ({ u, ...stateOf(u) }));
  const inN = board.filter((b) => b.s === "출근" || b.s === "지각").length;
  const lateN = board.filter((b) => b.s === "지각").length;
  const awayN = board.filter((b) => b.tone === "soft").length;
  const noneN = board.filter((b) => b.s === "미기록").length;
  const leavePending = approvals.filter((a) => a.cat === "leave" && a.status === "pending");
  const reportPending = approvals.filter((a) => a.cat === "report" && a.status === "pending");
  const noHire = active.filter((u) => !hireOf(u));
  const docIssueDrivers = drivers.filter((d) => { const p = docProblems(docsBy?.[d.id]); return p.missing || p.bad; }).length;
  // 인사 이벤트 — 수습 종료(입사 3개월) · 입사 기념일 · 연차 사용 촉진
  const probation = active.map((u) => ({ u, d: hireOf(u) ? addMonths(hireOf(u), 3) : "" })).filter((x) => x.d && x.d >= today && x.d <= addMonths(today, 1)).sort((a, b) => a.d.localeCompare(b.d));
  const anniv = active.map((u) => ({ u, h: hireOf(u) })).filter(({ h }) => h && h.slice(5, 7) === ym.slice(5, 7) && h.slice(0, 4) < ym.slice(0, 4))
    .map(({ u, h }) => ({ u, h, y: Number(ym.slice(0, 4)) - Number(h.slice(0, 4)) })).sort((a, b) => a.h.slice(8).localeCompare(b.h.slice(8)));
  const promote = active.map((u) => {
    const ent = leaveEntitlement(hireOf(u)); if (!ent || ent.label !== "연차") return null;
    const used = approvals.filter((a) => a.drafterUid === u.id && a.status === "approved").map(leaveUseOf).filter((x) => x && x.date >= ent.from && x.date <= ent.to).reduce((s, x) => s + x.days, 0);
    const remain = ent.total - used; const leftD = Math.round((new Date(`${ent.to}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 864e5);
    return remain >= 3 && leftD <= 183 ? { u, remain, to: ent.to } : null;
  }).filter(Boolean);
  const teams = {}; active.forEach((u) => { const t = u.team || "미배정"; teams[t] = (teams[t] || 0) + 1; });
  const tenure = [["1년 미만", 0], ["1~3년", 0], ["3~5년", 0], ["5년 이상", 0], ["미등록", 0]];
  active.forEach((u) => { const h = hireOf(u); if (!h) { tenure[4][1] += 1; return; } const y = (new Date(`${today}T00:00:00Z`) - new Date(`${h}T00:00:00Z`)) / (365.25 * 864e5); tenure[y < 1 ? 0 : y < 3 ? 1 : y < 5 ? 2 : 3][1] += 1; });
  const week = Array.from({ length: 7 }, (_, i) => kst(i));
  const weekEvs = evs.filter((e) => week.includes(e.date) && !/조퇴|지각/.test(e.label));
  const todos = [
    ["휴가·근태 결재 대기", "전자결재 › 근태·휴가 신청", leavePending.length, "명", "전자결재"],
    ["인사·보고 결재 대기", "전자결재 › 업무 보고·인사", reportPending.length, "건", "전자결재"],
    ["직원 가입 승인", "관리자메뉴 › 회원 관리", pendingStaff.length, "명", "관리자메뉴"],
    ["기사 가입 승인", "기사관리 › 기사 앱 계정", pendingDrivers.length, "명", "기사승인"],
    ["입사일 미등록", "연차 자동 계산이 안 됩니다", noHire.length, "명", "인사관리부"],
    ["기사 서류 미비", "미제출·반려·만료", docIssueDrivers, "명", "기사서류"],
  ];
  const TONE = { ok: "bg-[#0F1A30] text-white", bad: "bg-[#FEF3F2] text-[#B42318] border border-[#FECDCA]", soft: "bg-[#EEF3FC] text-[#2D4C82]", none: "bg-[#F3F6FA] text-[#9AA9C3]" };
  return (
    <div className="space-y-4">
      <Hero en="HUMAN RESOURCES · PEOPLE DESK" title="인사관리 대시보드" desc={`${today.replace(/-/g, ".")} · 인원 · 근태 · 휴가 · 입퇴사 · 인사 결재`}
        kpis={[
          ["재직 인원", `${active.length}명`, `이번 달 입사 ${joined.length} · 퇴사 ${left.length}`],
          ["오늘 출근", `${inN}명`, `지각 ${lateN} · 미기록 ${noneN}`],
          ["오늘 부재", `${awayN}명`, "휴가·반차·외근·출장"],
          ["가입 승인 대기", `${pendingStaff.length + pendingDrivers.length}명`, `직원 ${pendingStaff.length} · 기사 ${pendingDrivers.length}`],
        ]} />
      <Quick onGo={onGo} items={[
        ["인사관리부", "인사관리부", "idcard", "이력서·인사발령·근속"], ["출근기록부", "출근기록부", "clock", `오늘 ${inN}명 출근`],
        ["인사관리부:leave", "연차 관리", "flag", `촉진 대상 ${promote.length}명`], ["인사관리부:edit", "직원 정보 · 퇴사", "users", `재직 ${active.length}명`],
        ["증명서발급", "증명서 발급", "stamp", "재직·경력증명서"], ["관리자메뉴", "회원 관리", "users", `승인 대기 ${pendingStaff.length}명`],
        ["전자결재", "인사 결재", "stamp", `대기 ${leavePending.length + reportPending.length}건`], ["기사서류", "기사 서류", "file", `미비 ${docIssueDrivers}명`],
      ]} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card en="TODO · HR" title="오늘 처리할 일">
          {todos.map(([l, sub, n, unit, go]) => (
            <button key={l} type="button" onClick={() => onGo?.(go)} className="w-full text-left"><Row l={l} sub={sub} v={`${n}${unit}`} tone={n ? "bad" : ""} /></button>
          ))}
        </Card>
        <Card en="ATTENDANCE · TODAY" title="오늘 근태" right={<button type="button" onClick={() => onGo?.("출근기록부")} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] whitespace-nowrap">출근기록부 ›</button>}>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {[["출근", inN], ["지각", lateN], ["부재", awayN], ["미기록", noneN]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-[#F5F8FD] border border-[#E3E8F0] py-1.5 text-center"><div className="text-[10.5px] font-bold text-[#7A879C]">{l}</div><div className="text-[17px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{v}</div></div>
            ))}
          </div>
          {!board.length ? <Empty t="재직 인원이 없습니다" /> : (
            <div className="space-y-1 max-h-[232px] overflow-y-auto">
              {board.sort((a, b) => ["bad", "none", "soft", "ok"].indexOf(a.tone) - ["bad", "none", "soft", "ok"].indexOf(b.tone)).map(({ u, s, t, tone }) => (
                <div key={u.id} className="flex items-center gap-2 py-1">
                  <span className="w-7 h-7 rounded-lg bg-[#EEF2F8] grid place-items-center text-[12px] font-black text-[#1B2B4B] shrink-0">{String(nm(u)).slice(0, 1)}</span>
                  <span className="flex-1 min-w-0 text-[13px] font-bold text-[#0F1A30] truncate">{nm(u)} <span className="text-[11.5px] font-semibold text-[#9AA9C3]">{u.team || ""}</span></span>
                  <span className={`shrink-0 h-6 px-2 rounded-md text-[11px] font-black grid place-items-center whitespace-nowrap ${TONE[tone]}`}>{s}{t ? ` ${t}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card en="HR EVENTS" title="다가오는 인사 일정">
          <div className="text-[11px] font-black text-[#4B6CB7] tracking-[0.12em] mb-1">수습 종료(입사 3개월) · 30일 이내</div>
          {!probation.length ? <div className="text-[12px] text-[#9AA9C3] font-bold py-1">예정 없음</div> : probation.slice(0, 4).map(({ u, d }) => <Row key={u.id} l={nm(u)} sub={u.team || ""} v={`${d.slice(5).replace("-", ".")} ${dDay(d, today)}`} />)}
          <div className="text-[11px] font-black text-[#4B6CB7] tracking-[0.12em] mt-3 mb-1">연차 사용 촉진 대상</div>
          {!promote.length ? <div className="text-[12px] text-[#9AA9C3] font-bold py-1">대상 없음</div> : promote.slice(0, 4).map(({ u, remain, to }) => <Row key={u.id} l={nm(u)} sub={`회기 종료 ${to}`} v={`잔여 ${remain}일`} tone="bad" />)}
          <div className="text-[11px] font-black text-[#4B6CB7] tracking-[0.12em] mt-3 mb-1">이번 달 입사 기념일</div>
          {!anniv.length ? <div className="text-[12px] text-[#9AA9C3] font-bold py-1">없음</div> : anniv.slice(0, 4).map(({ u, h, y }) => <Row key={u.id} l={`★ ${nm(u)}`} sub={u.team || ""} v={`${h.slice(5).replace("-", ".")} · ${y}주년`} />)}
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
        <Card en="TEAM · NEXT 7 DAYS" title="이번 주 부재 일정" right={<button type="button" onClick={() => onGo?.("인사관리부:leave")} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12px] font-black text-[#1B2B4B] whitespace-nowrap">연차 관리 ›</button>}>
          <div className="grid grid-cols-7 gap-1 md:gap-1.5">
            {week.map((d) => {
              const list = weekEvs.filter((e) => e.date === d); const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
              return (
                <div key={d} className={`rounded-xl border px-1 md:px-1.5 py-2 min-h-[96px] min-w-0 ${d === today ? "border-[#2D4C82] bg-[#F2F6FD]" : "border-[#E3E8F0] bg-white"}`}>
                  <div className={`text-center text-[10.5px] font-black ${dow === 0 ? "text-[#D92D20]" : dow === 6 ? "text-[#2D4C82]" : "text-[#7A879C]"}`}>{"일월화수목금토"[dow]}</div>
                  <div className="text-center text-[15px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{Number(d.slice(8))}</div>
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 3).map((e) => <div key={`${e.id}${e.date}`} title={`${e.name} ${e.label}`} className={`rounded px-1 text-[10px] md:text-[10.5px] font-bold truncate ${e.status === "approved" ? "bg-[#1B2B4B] text-white" : "border border-dashed border-[#9AA9C3] text-[#5B6B85]"}`}>{e.name}</div>)}
                    {list.length > 3 && <div className="text-[10px] text-[#7A879C] text-center">+{list.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card en="ORGANIZATION" title="부서별 인원 · 근속 분포">
          {Object.entries(teams).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
            <div key={t} className="flex items-center gap-2 py-1">
              <span className="w-20 shrink-0 text-[12.5px] font-bold text-[#3A4A66] truncate">{t}</span>
              <span className="flex-1 h-2 rounded-full bg-[#EEF2F8] overflow-hidden"><span className="block h-full bg-[#1B2B4B]" style={{ width: `${(n / Math.max(1, active.length)) * 100}%` }} /></span>
              <span className="w-8 text-right text-[12.5px] font-black tabular-nums" style={{ fontFamily: MONO }}>{n}</span>
            </div>
          ))}
          <div className="mt-3 pt-3 border-t border-[#F1F4F9] grid grid-cols-5 gap-1">
            {tenure.map(([l, n]) => <div key={l} className="text-center"><div className="text-[17px] font-black tabular-nums text-[#0F1A30]" style={{ fontFamily: MONO }}>{n}</div><div className="text-[10.5px] font-bold text-[#7A879C] whitespace-nowrap">{l}</div></div>)}
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
// ⚠ 관리자메뉴 › 권한 설정에서 내장 권한(경리·인사관리자)을 편집하면 customRoles에 같은 키(test·hrManager)로 저장된다 —
//   그건 "커스텀 권한"이 아니라 내장 권한이므로 부서 화면은 그대로 켠다(예전엔 이 때문에 PC에서 배차 화면이 떴다).
export const deptModeOf = (role) => (role === "test" ? "acct" : role === "hrManager" ? "hr" : null);
