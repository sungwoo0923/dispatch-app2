// ======================= src/PlatformCenter.jsx =======================
// 🛰 관리자 관리센터(/platform, 2026-10-29) — 최고관리자 전용 "플랫폼 운영" 화면.
//  배차 프로그램 안에 있던 관리센터를 통째로 옮기고(디자인 그대로), 운영에 필요한 메뉴를 더했다.
//   · 상단 메뉴(대시보드 · 고객사 · 영업 · 계약 · 청구 · 운영 · 데이터) + 왼쪽 메뉴(KpSubNav)
//   · 새로 추가: 오늘 할 일, 도입 문의, 계약(전자서명), 수납 관리, 플랫폼 공지, 접속 이력, 로그인 관리
//  최고관리자가 로그인하면 /choose 에서 "배차 프로그램 / 관리자 관리센터" 중 고른다.
//  ⭐ 알록달록 금지 — 네이비 계열만.
import Pager, { pageCount, pageSlice } from "./Pager";
import React from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import KpSubNav from "./KpSubNav";
import PlatformMonitor, { estimateBill } from "./PlatformMonitor";
import { ContractBuilder, ContractList, ContractTemplates } from "./ContractCenter";
import { NotifTemplatePanel, LandingPageEditPanel, ShipperForceUpdatePanel } from "./AdminMenu";
import { AdminSessionsPanel } from "./LoginManager";
import CompanyResetPanel from "./CompanyResetPanel";
import SheetImportPanel from "./SheetImportPanel";
import "./pcTheme.css";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ─── 메뉴 구성 ───
const SECTIONS = [
  { key: "home", label: "대시보드", en: "DASHBOARD", icon: "pulse", items: [
    { key: "todo", label: "오늘 할 일", en: "TODAY", icon: "check" },
    { key: "overview", label: "플랫폼 개요", en: "OVERVIEW", icon: "pulse" },
  ] },
  { key: "clients", label: "고객사", en: "CLIENTS", icon: "building", items: [
    { key: "companies", label: "운송사 관제", en: "CARRIERS", icon: "building" },
    { key: "shippers", label: "화주사 관제", en: "SHIPPERS", icon: "link" },
    { key: "applications", label: "가입신청관리", en: "APPLICATIONS", icon: "inbox" },
    { key: "inquiries", label: "도입 문의", en: "LEADS", icon: "mail" },
  ] },
  { key: "sales", label: "영업", en: "SALES", icon: "trend", items: [
    { key: "sales:plans", label: "요금제 관리", en: "PRICING", icon: "sheet" },
    { key: "sales:quote", label: "견적서 작성", en: "QUOTATION", icon: "file" },
    { key: "sales:history", label: "견적 이력", en: "PIPELINE", icon: "history" },
  ] },
  { key: "contracts", label: "계약", en: "CONTRACTS", icon: "pen", items: [
    { key: "contract:list", label: "계약 현황", en: "STATUS", icon: "list" },
    { key: "contract:new", label: "계약서 작성", en: "NEW", icon: "pen" },
    { key: "contract:templates", label: "계약서 양식", en: "TEMPLATES", icon: "file" },
  ] },
  { key: "billing", label: "청구", en: "BILLING", icon: "money", items: [
    { key: "billing", label: "요금·청구", en: "BILLING", icon: "money" },
    { key: "payments", label: "수납 관리", en: "COLLECTION", icon: "wallet" },
  ] },
  { key: "ops", label: "운영", en: "OPERATIONS", icon: "server", items: [
    { key: "notices", label: "플랫폼 공지", en: "BROADCAST", icon: "bell" },
    { key: "notifTemplate", label: "알림 문구", en: "MESSAGES", icon: "chat" },
    { key: "forceUpdate", label: "화주사 강제 업데이트", en: "UPDATE", icon: "refresh" },
    { key: "landingEdit", label: "랜딩페이지 편집", en: "LANDING", icon: "globe" },
  ] },
  { key: "data", label: "보안·데이터", en: "SECURITY", icon: "shield", items: [
    { key: "sessions", label: "로그인 관리", en: "SESSIONS", icon: "key" },
    { key: "sessionLogs", label: "접속 이력", en: "AUDIT LOG", icon: "history" },
    { key: "sheetImport", label: "배차일지 가져오기", en: "IMPORT", icon: "sheet" },
    { key: "companyReset", label: "운송사 초기화", en: "RESET", icon: "trash" },
  ] },
];
const sectionOf = (tab) => SECTIONS.find((s) => s.items.some((i) => i.key === tab)) || SECTIONS[0];
const MONITOR_TABS = ["overview", "companies", "shippers", "applications", "billing", "sales:plans", "sales:quote", "sales:history"];

// ─── 공용 부품 ───
function Card({ code, title, right, children, bodyClass = "p-5" }) {
  return (
    <div className="bg-white rounded-[18px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_26px_rgba(16,24,40,0.05)] overflow-hidden min-w-0">
      <div className="flex items-center justify-between gap-3 px-5 h-[50px] bg-[#F7F9FC] border-b border-[#E8EDF4]">
        <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
          <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={{ fontFamily: MONO }}>{code}</span>
          <span className="text-[16px] font-black text-[#0F1A30] truncate">{title}</span></div>
        {right}
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}
function Hero({ en, title, desc, right }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] px-6 py-5 mb-4 text-white flex items-center justify-between gap-4 flex-wrap"
      style={{ background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, radial-gradient(600px 200px at 85% -20%, rgba(75,108,183,.45), transparent 60%), linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <div><div className="text-[11px] font-extrabold tracking-[0.28em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
        <div className="text-[24px] font-black mt-0.5 tracking-tight">{title}</div>
        {desc && <div className="text-[13.5px] text-white/65 mt-0.5">{desc}</div>}</div>
      {right}
    </div>
  );
}
function Clock() {
  const [n, setN] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setN(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="text-[13px] font-black text-white tabular-nums" style={{ fontFamily: MONO }}>{pad(n.getHours())}:{pad(n.getMinutes())}<span className="text-white/40">:{pad(n.getSeconds())}</span></span>;
}
function useCol(name, order = "createdAt", n = 300) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => onSnapshot(query(collection(db, name), orderBy(order, "desc"), limit(n)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), [name, order, n]);
  return list;
}
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);

// ═══════════════════════ 오늘 할 일 ═══════════════════════
function TodayPanel({ go }) {
  const quotes = useCol("salesQuotes");
  const contracts = useCol("contracts");
  const inquiries = useCol("landingInquiries");
  const [apps, setApps] = React.useState([]);
  React.useEffect(() => onSnapshot(collection(db, "companyApplications"), (s) => setApps(s.docs.map((d) => d.data())), () => {}), []);
  const today = ymd();
  const soonLimit = (() => { const d = new Date(); d.setMonth(d.getMonth() + 2); return ymd(d); })();
  const tasks = [
    ...(inquiries || []).filter((q) => !q.status || q.status === "신규").map((q) => ({ code: "LEAD", text: `${q.companyName || "업체"} 도입 문의 — 아직 연락 전`, sub: q.phone || "", to: "inquiries", lv: 2 })),
    ...apps.filter((a) => a.status === "pending").map((a) => ({ code: "APPLY", text: `${a.companyName || a.name || "화주사"} 가입 승인 대기`, sub: "", to: "applications", lv: 2 })),
    ...(contracts || []).filter((c) => c.status === "발송").map((c) => ({ code: "SIGN", text: `${c.vars?.고객사 || c.title || "계약"} 계약서 서명 대기 ${c.viewedAt ? "(열람함)" : "(미열람)"}`, sub: c.no, to: "contract:list", lv: 1 })),
    ...(contracts || []).filter((c) => c.status === "서명완료" && c.vars?.종료일 >= today && c.vars?.종료일 <= soonLimit).map((c) => ({ code: "RENEW", text: `${c.vars?.고객사} 계약 만료 임박 — ${c.vars?.종료일}`, sub: "재계약·갱신 안내", to: "contract:list", lv: 1 })),
    ...(quotes || []).filter((q) => ["발송", "협의 중"].includes(q.status) && Date.now() - msOf(q.createdAt) > 7 * 86400000).map((q) => ({ code: "FOLLOW", text: `${q.customer} 견적 발송 후 7일 경과 — 후속 연락`, sub: q.no, to: "sales:history", lv: 0 })),
    ...(contracts || []).filter((c) => c.status === "작성").map((c) => ({ code: "DRAFT", text: `${c.vars?.고객사} 계약서 작성 중 — 서명 요청 전`, sub: c.no, to: "contract:list", lv: 0 })),
  ].sort((a, b) => b.lv - a.lv);
  const kpi = [
    ["진행 중 견적", (quotes || []).filter((q) => ["작성", "발송", "협의 중"].includes(q.status)).length, "건"],
    ["서명 대기 계약", (contracts || []).filter((c) => c.status === "발송").length, "건"],
    ["새 도입 문의", (inquiries || []).filter((q) => !q.status || q.status === "신규").length, "건"],
    ["계약 월 매출", (contracts || []).filter((c) => c.status === "서명완료" && (!c.vars?.종료일 || c.vars.종료일 >= today)).reduce((a, c) => a + (Number(c.monthly) || 0), 0).toLocaleString(), "원"],
  ];
  return (
    <div className="space-y-4">
      <Hero en="PLATFORM · TODAY" title="오늘 할 일" desc="영업·계약·가입·문의에서 지금 손대야 할 것만 모았습니다. 누르면 해당 화면으로 갑니다." right={<Clock />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpi.map(([l, v, u], i) => (
          <div key={l} className={`rounded-[16px] px-4 py-3.5 border ${i === 3 ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
            <div className={`text-[12.5px] font-bold ${i === 3 ? "text-white/60" : "text-[#7A879C]"}`}>{l}</div>
            <div className="text-[26px] font-black mt-0.5" style={{ fontFamily: MONO }}>{v}<span className={`text-[13px] ml-1 ${i === 3 ? "text-white/50" : "text-[#9AA9C3]"}`}>{u}</span></div>
          </div>
        ))}
      </div>
      <Card code="QUEUE" title={`처리할 일 ${tasks.length}건`} bodyClass="p-2">
        {tasks.length === 0 ? <div className="py-14 text-center text-[#9AA9C3]">지금 처리할 일이 없습니다 ✓</div> : tasks.map((t, i) => (
          <button key={i} type="button" onClick={() => go(t.to)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F5F8FD] text-left">
            <span className={`w-16 shrink-0 text-center py-1 rounded-md text-[10.5px] font-extrabold tracking-[0.12em] ${t.lv === 2 ? "bg-[#0F1A30] text-white" : t.lv === 1 ? "bg-[#DCE6F7] text-[#1B2B4B]" : "border border-[#DCE3EE] text-[#5B6B85]"}`} style={{ fontFamily: MONO }}>{t.code}</span>
            <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-black text-[#0F1A30] truncate">{t.text}</span>{t.sub && <span className="block text-[12px] text-[#7A89A3]" style={{ fontFamily: MONO }}>{t.sub}</span>}</span>
            <span className="text-[#9AA9C3]">›</span>
          </button>
        ))}
      </Card>
    </div>
  );
}

// ═══════════════════════ 도입 문의 ═══════════════════════
const LEAD_STATUS = ["신규", "상담중", "견적 발송", "계약", "보류", "완료"];
function InquiriesPanel({ toQuote }) {
  const list = useCol("landingInquiries");
  const [sel, setSel] = React.useState(null);
  if (!list) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const cur = list.find((x) => x.id === sel);
  return (
    <div className="space-y-4">
      <Hero en="CLIENTS · LEADS" title="도입 문의" desc="홈페이지로 들어온 문의를 상담 단계별로 관리하고, 바로 견적서로 넘깁니다." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <Card code="INBOX" title={`문의 ${list.length}건`} bodyClass="p-0">
          {list.length === 0 ? <div className="py-16 text-center text-[#9AA9C3]">들어온 도입 문의가 없습니다.</div> : (
            <table className="w-full text-[14px]">
              <thead><tr className="bg-[#1B2B4B] text-white">{["회사", "담당자", "연락처", "규모", "접수일", "상태"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold">{h}</th>)}</tr></thead>
              <tbody>{list.map((q) => (
                <tr key={q.id} onClick={() => setSel(q.id)} className={`border-t border-[#EEF1F6] cursor-pointer ${sel === q.id ? "bg-[#EEF3FB]" : "hover:bg-[#F5F8FD]"}`}>
                  <td className="px-3 py-2.5 font-black text-[#0F1A30]">{q.companyName}{q.type === "무료체험" && <span className="ml-1.5 px-1.5 py-0.5 rounded-md border border-[#1B2B4B] text-[10.5px] font-black text-[#1B2B4B]">무료체험</span>}</td>
                  <td className="px-3 py-2.5 text-center">{q.name}</td>
                  <td className="px-3 py-2.5 text-center" style={{ fontFamily: MONO }}>{q.phone}</td>
                  <td className="px-3 py-2.5 text-center text-[#5B6B85]">{q.vehicles || "-"}</td>
                  <td className="px-3 py-2.5 text-center text-[12.5px] text-[#5B6B85]" style={{ fontFamily: MONO }}>{msOf(q.createdAt) ? ymd(new Date(msOf(q.createdAt))) : "-"}</td>
                  <td className="px-3 py-2.5 text-center"><span className={`px-2 py-0.5 rounded-md text-[12px] font-black ${(!q.status || q.status === "신규") ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>{q.status || "신규"}</span></td>
                </tr>))}</tbody>
            </table>
          )}
        </Card>
        <Card code="DETAIL" title={cur ? cur.companyName : "문의를 선택하세요"}>
          {!cur ? <div className="py-10 text-center text-[#9AA9C3]">왼쪽 목록에서 문의를 누르면 상세가 보입니다.</div> : (
            <div className="space-y-3">
              {[["담당자", cur.name], ["연락처", cur.phone], ["이메일", cur.email], ["차량·규모", cur.vehicles], ["문의 유형", cur.type], ["문의 내용", cur.message || cur.content]].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[80px_1fr] gap-2 text-[14px]"><span className="font-bold text-[#7A879C]">{k}</span><span className="font-semibold text-[#0F1A30] whitespace-pre-wrap">{v}</span></div>
              ))}
              <div><div className="text-[12px] font-bold text-[#7A879C] mb-1.5">상담 단계</div>
                <div className="flex flex-wrap gap-1.5">{LEAD_STATUS.map((st) => (
                  <button key={st} type="button" onClick={() => updateDoc(doc(db, "landingInquiries", cur.id), { status: st })} className={`h-8 px-3 rounded-lg text-[12.5px] font-black border ${(cur.status || "신규") === st ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#3A4A66]"}`}>{st}</button>))}</div></div>
              <div><div className="text-[12px] font-bold text-[#7A879C] mb-1.5">상담 메모</div>
                <textarea defaultValue={cur.memo || ""} key={cur.id} onBlur={(e) => updateDoc(doc(db, "landingInquiries", cur.id), { memo: e.target.value })} rows={4} className="w-full px-3 py-2 rounded-xl border border-[#DCE3EE] text-[14px] outline-none focus:border-[#4B6CB7]" placeholder="통화 내용, 다음 연락일 등 (칸을 벗어나면 저장)" /></div>
              <div className="flex gap-2">
                {cur.phone && <a href={`tel:${cur.phone}`} className="flex-1 h-10 rounded-xl border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B] flex items-center justify-center">전화</a>}
                <button type="button" onClick={() => toQuote(cur)} className="flex-[2] h-10 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black">이 업체로 견적서 만들기</button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════ 수납 관리 ═══════════════════════
const PAY_STATUS = ["미청구", "청구", "입금완료", "연체"];
function PaymentsPanel() {
  const [stats, setStats] = React.useState(null);
  const [pricing, setPricing] = React.useState(null);
  const [month, setMonth] = React.useState(() => ymd().slice(0, 7));
  const [rows, setRows] = React.useState({});
  React.useEffect(() => {
    const u1 = onSnapshot(doc(db, "siteConfig", "platformStats"), (s) => setStats(s.exists() ? s.data() : {}), () => setStats({}));
    const u2 = onSnapshot(doc(db, "siteConfig", "platformPricing"), (s) => setPricing({ base: 99000, includedSeats: 3, seat: 15000, includedOrders: 1000, perOrder: 50, ...(s.exists() ? s.data() : {}) }), () => setPricing({ base: 99000, includedSeats: 3, seat: 15000, includedOrders: 1000, perOrder: 50 }));
    return () => { u1(); u2(); };
  }, []);
  React.useEffect(() => onSnapshot(query(collection(db, "platformInvoices")), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setRows(m); }, () => {}), []);
  if (!stats || !pricing) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const companies = (stats.companies || []).map((c) => ({ ...c, bill: estimateBill(c, pricing, days, days) }));
  const key = (c) => `${month}_${c.name}`.replace(/\//g, "_");
  const amountOf = (c) => rows[key(c)]?.amount ?? c.bill.total;
  const sum = (st) => companies.filter((c) => (rows[key(c)]?.status || "미청구") === st).reduce((a, c) => a + amountOf(c), 0);
  const save = (c, patch) => setDoc(doc(db, "platformInvoices", key(c)), { month, company: c.name, amount: amountOf(c), ...patch, updatedAt: serverTimestamp() }, { merge: true }).catch((e) => window.alert(e.message));
  return (
    <div className="space-y-4">
      <Hero en="BILLING · COLLECTION" title="수납 관리" desc="가입사별 이달 청구액을 확정하고 청구·입금 상태를 기록합니다. (금액은 요금·청구 기준 예상액 — 칸에서 바로 고칠 수 있습니다)"
        right={<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 px-3 rounded-xl bg-white/10 ring-1 ring-white/25 text-white font-black" style={{ fontFamily: MONO, colorScheme: "dark" }} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {PAY_STATUS.map((st, i) => (
          <div key={st} className={`rounded-[16px] px-4 py-3.5 border ${i === 2 ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
            <div className={`text-[12.5px] font-bold ${i === 2 ? "text-white/60" : "text-[#7A879C]"}`}>{st}</div>
            <div className="text-[22px] font-black mt-0.5" style={{ fontFamily: MONO }}>{sum(st).toLocaleString()}<span className="text-[12px] ml-1 opacity-50">원</span></div>
          </div>
        ))}
      </div>
      <Card code="LEDGER" title={`${Number(month.slice(5))}월 수납 원장`} bodyClass="p-0">
        {companies.length === 0 ? <div className="py-14 text-center text-[#9AA9C3]">집계된 가입사가 없습니다 — 대시보드 › 플랫폼 개요에서 '지금 갱신'을 눌러 주세요.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-[14px]" style={{ minWidth: 860 }}>
            <thead><tr className="bg-[#1B2B4B] text-white">{["운송사", "청구액(VAT 별도)", "상태", "입금일", "메모"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold">{h}</th>)}</tr></thead>
            <tbody>{companies.map((c) => { const r = rows[key(c)] || {}; return (
              <tr key={c.name} className="border-t border-[#EEF1F6]">
                <td className="px-3 py-2 font-black text-[#0F1A30]">{c.name}</td>
                <td className="px-3 py-2 text-right"><input defaultValue={amountOf(c).toLocaleString()} key={`${key(c)}_${amountOf(c)}`} onBlur={(e) => save(c, { amount: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} className="w-36 h-9 px-2 rounded-lg border border-[#DCE3EE] text-right font-black" style={{ fontFamily: MONO }} /></td>
                <td className="px-3 py-2 text-center"><div className="inline-flex gap-1">{PAY_STATUS.map((st) => (
                  <button key={st} type="button" onClick={() => save(c, { status: st, ...(st === "입금완료" && !r.paidAt ? { paidAt: ymd() } : {}) })} className={`h-8 px-2.5 rounded-lg text-[12px] font-black border ${(r.status || "미청구") === st ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#5B6B85]"}`}>{st}</button>))}</div></td>
                <td className="px-3 py-2 text-center"><input type="date" defaultValue={r.paidAt || ""} key={`${key(c)}_p_${r.paidAt || ""}`} onBlur={(e) => save(c, { paidAt: e.target.value })} className="h-9 px-2 rounded-lg border border-[#DCE3EE]" /></td>
                <td className="px-3 py-2"><input defaultValue={r.memo || ""} key={`${key(c)}_m`} onBlur={(e) => save(c, { memo: e.target.value })} className="w-full h-9 px-2 rounded-lg border border-[#DCE3EE]" placeholder="세금계산서 번호 등" /></td>
              </tr>); })}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════ 플랫폼 공지 ═══════════════════════
function NoticesPanel() {
  const list = useCol("platformNotices");
  const blank = { title: "", body: "", level: "안내", audience: "all", active: true, endDate: "" };
  const [f, setF] = React.useState(blank);
  const [editId, setEditId] = React.useState(null);
  const save = async () => {
    if (!f.title.trim()) { window.alert("제목을 입력해 주세요."); return; }
    try {
      if (editId) await updateDoc(doc(db, "platformNotices", editId), { ...f, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, "platformNotices"), { ...f, createdAt: serverTimestamp() });
      setF(blank); setEditId(null);
    } catch (e) { window.alert(e.message); }
  };
  const inp = "h-10 w-full px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold outline-none focus:border-[#4B6CB7]";
  return (
    <div className="space-y-4">
      <Hero en="OPERATIONS · BROADCAST" title="플랫폼 공지" desc="모든 운송사(또는 화주사) 화면 맨 위에 띠 배너로 뜹니다. 점검·업데이트·요금 안내에 쓰세요. 사용자가 닫으면 그 사람에겐 다시 안 뜹니다." />
      <div className="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)] items-start">
        <Card code={editId ? "EDIT" : "NEW"} title={editId ? "공지 수정" : "새 공지"}>
          <div className="space-y-2.5">
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="제목 (예: 11/2(일) 02:00~04:00 정기 점검)" className={inp} />
            <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={4} placeholder="내용 (선택)" className={`${inp} h-auto py-2`} />
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-[12px] font-bold text-[#7A879C]">구분</span><select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} className={`${inp} mt-1`}>{["안내", "업데이트", "점검", "중요"].map((x) => <option key={x}>{x}</option>)}</select></label>
              <label className="block"><span className="text-[12px] font-bold text-[#7A879C]">대상</span><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} className={`${inp} mt-1`}><option value="all">전체</option><option value="carrier">운송사만</option><option value="shipper">화주사만</option></select></label>
              <label className="block col-span-2"><span className="text-[12px] font-bold text-[#7A879C]">게시 종료일 (비우면 계속)</span><input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} className={`${inp} mt-1`} /></label>
            </div>
            <div className="flex gap-2">
              {editId && <button type="button" onClick={() => { setF(blank); setEditId(null); }} className="flex-1 h-11 rounded-xl border border-[#DCE3EE] text-[13.5px] font-black text-[#3A4A66]">취소</button>}
              <button type="button" onClick={save} className="flex-[2] h-11 rounded-xl bg-[#0F1A30] text-white text-[14px] font-black">{editId ? "수정 저장" : "공지 게시"}</button>
            </div>
          </div>
        </Card>
        <Card code="LIVE" title="게시된 공지" bodyClass="p-2">
          {(list || []).length === 0 ? <div className="py-14 text-center text-[#9AA9C3]">게시된 공지가 없습니다.</div> : list.map((n) => {
            const expired = n.endDate && n.endDate < ymd();
            return (
              <div key={n.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F5F8FD]">
                <span className={`w-14 text-center py-1 rounded-md text-[11px] font-black ${n.level === "중요" || n.level === "점검" ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>{n.level}</span>
                <div className="flex-1 min-w-0"><div className={`text-[14.5px] font-black truncate ${n.active && !expired ? "text-[#0F1A30]" : "text-[#9AA9C3] line-through"}`}>{n.title}</div>
                  <div className="text-[12px] text-[#7A89A3]">{{ all: "전체", carrier: "운송사", shipper: "화주사" }[n.audience] || "전체"} · {msOf(n.createdAt) ? ymd(new Date(msOf(n.createdAt))) : ""}{n.endDate ? ` ~ ${n.endDate}` : ""}</div></div>
                <button type="button" onClick={() => updateDoc(doc(db, "platformNotices", n.id), { active: !n.active })} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]">{n.active ? "내리기" : "다시 게시"}</button>
                <button type="button" onClick={() => { setEditId(n.id); setF({ ...blank, ...n }); }} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B]">수정</button>
                <button type="button" onClick={() => window.confirm("공지를 삭제할까요?") && deleteDoc(doc(db, "platformNotices", n.id))} className="h-8 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#7A879C]">삭제</button>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════ 접속 이력 ═══════════════════════
function SessionLogsPanel() {
  const list = useCol("sessionLogs", "at", 400);
  const [q, setQ] = React.useState("");
  const [ev, setEv] = React.useState("all");
  const [page, setPage] = React.useState(1);
  React.useEffect(() => { setPage(1); }, [q, ev]);
  if (!list) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const rows = list.filter((l) => (ev === "all" || l.event === ev) && (!q || [l.name, l.email, l.companyName, l.device, l.ip].some((v) => String(v || "").includes(q))));
  const events = [...new Set(list.map((l) => l.event).filter(Boolean))];
  return (
    <div className="space-y-4">
      <Hero en="SECURITY · AUDIT LOG" title="접속 이력" desc="최근 400건의 로그인·로그아웃 기록입니다. 회사·이름·기기로 찾을 수 있습니다." />
      <Card code="LOG" title={`${rows.length}건`} bodyClass="p-0" right={
        <div className="flex gap-2">
          <select value={ev} onChange={(e) => setEv(e.target.value)} className="h-9 px-2 rounded-lg border border-[#DCE3EE] text-[13px] font-bold"><option value="all">전체</option>{events.map((e) => <option key={e} value={e}>{e}</option>)}</select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색" className="h-9 w-48 px-3 rounded-lg border border-[#DCE3EE] text-[13px]" />
        </div>}>
        <div className="overflow-x-auto"><table className="w-full text-[13.5px]" style={{ minWidth: 820 }}>
          <thead className="sticky top-0"><tr className="bg-[#1B2B4B] text-white">{["시각", "구분", "회사", "이름", "이메일", "기기"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold">{h}</th>)}</tr></thead>
          <tbody>{pageSlice(rows, Math.min(page, pageCount(rows.length))).map((l) => (
            <tr key={l.id} className="border-t border-[#EEF1F6]">
              <td className="px-3 py-2 text-center text-[12.5px] text-[#5B6B85] whitespace-nowrap" style={{ fontFamily: MONO }}>{msOf(l.at) ? new Date(msOf(l.at)).toLocaleString("ko-KR", { hour12: false }) : "-"}</td>
              <td className="px-3 py-2 text-center"><span className="px-2 py-0.5 rounded-md bg-[#EEF2F8] text-[#1B2B4B] text-[12px] font-black">{l.event || "-"}</span></td>
              <td className="px-3 py-2 text-center font-bold">{l.companyName || "-"}</td>
              <td className="px-3 py-2 text-center">{l.name || "-"}</td>
              <td className="px-3 py-2 text-center text-[#5B6B85]">{l.email || "-"}</td>
              <td className="px-3 py-2 text-center text-[12.5px] text-[#7A89A3] truncate max-w-[220px]">{l.device || "-"}</td>
            </tr>))}</tbody>
        </table></div>
        <Pager page={Math.min(page, pageCount(rows.length))} total={rows.length} onPage={setPage} />
      </Card>
    </div>
  );
}

// ═══════════════════════ 본체 ═══════════════════════
export default function PlatformCenter({ user }) {
  const navigate = useNavigate();
  const [tab, setTabState] = React.useState(() => { try { return localStorage.getItem("pcTab") || "todo"; } catch { return "todo"; } });
  const setTab = (t) => { setTabState(t); try { localStorage.setItem("pcTab", t); } catch { /* 무시 */ } };
  const [contractCtx, setContractCtx] = React.useState({ initial: null, fromQuote: null, key: 0 });
  const section = sectionOf(tab);
  React.useEffect(() => { document.title = "KP-Flow 관리자 관리센터"; }, []);
  const toApp = () => { try { sessionStorage.setItem("kpEntry", "app"); } catch { /* 무시 */ } navigate("/app"); };
  const logout = async () => { if (!window.confirm("로그아웃할까요?")) return; try { sessionStorage.removeItem("kpEntry"); } catch { /* 무시 */ } await signOut(auth).catch(() => {}); navigate("/login"); };
  const openContract = (patch) => { setContractCtx((c) => ({ initial: null, fromQuote: null, ...patch, key: c.key + 1 })); setTab("contract:new"); };

  let body = null;
  if (MONITOR_TABS.includes(tab)) {
    body = (
      <PlatformMonitorWithContract tab={tab} setTab={setTab} onContract={(q) => openContract({ fromQuote: q })} />
    );
  } else if (tab === "todo") body = <TodayPanel go={setTab} />;
  else if (tab === "inquiries") body = <InquiriesPanel toQuote={(q) => { try { sessionStorage.setItem("kpQuoteSeed", JSON.stringify({ customer: q.companyName || "", contact: q.name || "", phone: q.phone || "" })); } catch { /* 무시 */ } setTab("sales:quote"); }} />;
  else if (tab === "contract:list") body = <><Hero en="CONTRACTS · STATUS" title="계약 현황" desc="작성 → 서명 요청 → 고객 전자서명 → 체결까지 한 곳에서. 만료 2개월 전부터 갱신 대상으로 표시됩니다." /><ContractList onNew={() => openContract({})} onEdit={(c) => openContract({ initial: c })} /></>;
  else if (tab === "contract:new") body = <><Hero en="CONTRACTS · NEW" title={contractCtx.initial ? "계약서 수정" : "계약서 작성"} desc="견적을 불러오면 요금·기간이 자동으로 채워집니다. 저장하고 서명 요청을 누르면 고객용 서명 링크가 복사됩니다." /><ContractBuilder key={contractCtx.key} initial={contractCtx.initial} fromQuoteDoc={contractCtx.fromQuote} onDone={() => setTab("contract:list")} /></>;
  else if (tab === "contract:templates") body = <><Hero en="CONTRACTS · TEMPLATES" title="계약서 양식" desc="기본 이용계약서를 바탕으로 조항을 자유롭게 고치고, 양식을 여러 개 둘 수 있습니다." /><ContractTemplates /></>;
  else if (tab === "payments") body = <PaymentsPanel />;
  else if (tab === "notices") body = <NoticesPanel />;
  else if (tab === "notifTemplate") body = <><Hero en="OPERATIONS · MESSAGES" title="알림 문구" desc="배차 알림 등 자동 발송 문구를 관리합니다." /><NotifTemplatePanel /></>;
  else if (tab === "forceUpdate") body = <><Hero en="OPERATIONS · UPDATE" title="화주사 강제 업데이트" desc="화주사 화면을 최신 버전으로 새로고침시킵니다." /><ShipperForceUpdatePanel currentVersion={typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : ""} /></>;
  else if (tab === "landingEdit") body = <><Hero en="OPERATIONS · LANDING" title="랜딩페이지 편집" desc="로그인 전 홈페이지 문구·이미지를 바꿉니다." /><LandingPageEditPanel /></>;
  else if (tab === "sessions") body = <><Hero en="SECURITY · SESSIONS" title="로그인 관리" desc="지금 로그인 중인 모든 기기를 보고, 필요하면 강제로 내보냅니다." /><AdminSessionsPanel isTotalMaster company="" /></>;
  else if (tab === "sessionLogs") body = <SessionLogsPanel />;
  else if (tab === "sheetImport") body = <><Hero en="DATA · IMPORT" title="배차일지 가져오기" desc="구글시트·엑셀 배차일지를 운송사 데이터로 옮깁니다(초기 세팅용)." /><SheetImportPanel /></>;
  else if (tab === "companyReset") body = <><Hero en="DATA · RESET" title="운송사 초기화" desc="⚠ 운송사 데이터를 지웁니다 — 백업 후 신중히 사용하세요." /><CompanyResetPanel /></>;

  return (
    <div className="kp-pc min-h-screen bg-[#EEF1F6]">
      {/* ── 상단 바 ── */}
      <header className="kp-topnav sticky top-0 z-40 h-[60px] flex items-center gap-3 px-4 text-white" style={{ background: "linear-gradient(90deg,#0B1428 0%,#13213F 55%,#1B2B4B 100%)" }}>
        <div className="flex items-center gap-2.5 shrink-0">
          <img src="/logo.png" alt="" className="w-8 h-8 rounded-lg bg-white object-contain p-0.5" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div className="leading-none"><div className="text-[15px] font-black tracking-[0.04em]">KP-Flow</div><div className="text-[9px] font-extrabold tracking-[0.3em] text-[#8FB0F0] mt-1" style={{ fontFamily: MONO }}>PLATFORM</div></div>
          <span className="ml-1 px-2 py-0.5 rounded-md bg-white/10 ring-1 ring-white/15 text-[11px] font-black">관리자 관리센터</span>
        </div>
        <nav className="flex-1 flex items-center justify-center gap-0.5 overflow-x-auto">
          {SECTIONS.map((s) => {
            const on = s.key === section.key;
            return (
              <button key={s.key} type="button" onClick={() => setTab(s.items[0].key)}
                className={`kp-nav-btn relative px-3 h-[34px] rounded-[10px] text-[13.5px] whitespace-nowrap transition ${on ? "bg-white text-[#0F1A30] font-extrabold shadow-[0_4px_14px_rgba(0,0,0,0.25)]" : "text-white/65 font-semibold hover:text-white hover:bg-white/[0.09]"}`}>
                {s.label}
                {on && <span className="absolute left-1/2 -translate-x-1/2 -bottom-[7px] w-5 h-[3px] bg-[#6E95E8] rounded-full" />}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-white/[0.06] ring-1 ring-white/10"><span className="w-1.5 h-1.5 rounded-full bg-[#CFE0FF] animate-pulse" /><Clock /></span>
          <button type="button" onClick={toApp} className="kp-chip-btn text-[12px]" title="배차 프로그램으로 전환">배차 프로그램 ↗</button>
          <span className="hidden lg:inline text-[12px] text-white/55 max-w-[180px] truncate">{user?.email}</span>
          <button type="button" onClick={logout} className="h-8 px-3 rounded-lg bg-white/10 ring-1 ring-white/15 text-[12.5px] font-black hover:bg-white/20">로그아웃</button>
        </div>
      </header>

      {/* ── 왼쪽 메뉴 + 본문 ── */}
      <div className="px-4 py-4">
        <KpSubNav code={section.en} title={section.label} icon={section.icon} active={tab} onSelect={setTab} items={section.items}>
          {body}
        </KpSubNav>
      </div>
    </div>
  );
}

// 견적 이력에 "계약서 만들기"를 끼워 넣기 위한 얇은 감싸개
function PlatformMonitorWithContract({ tab, setTab, onContract }) {
  return <PlatformMonitor bare tab={tab} onTab={setTab} onContract={onContract} />;
}

// ═══════════════════════ 진입 선택(/choose) ═══════════════════════
export function EntryChooser({ user }) {
  const navigate = useNavigate();
  const go = (k) => { try { sessionStorage.setItem("kpEntry", k); } catch { /* 무시 */ } navigate(k === "platform" ? "/platform" : "/app", { replace: true }); };
  const Item = ({ k, en, title, desc, points, primary }) => (
    <button type="button" onClick={() => go(k)}
      className={`group text-left rounded-[26px] p-7 transition relative overflow-hidden border ${primary ? "border-[#8FB0F0]/40" : "border-white/10"} hover:-translate-y-1 hover:border-[#8FB0F0]/70`}
      style={{ background: primary ? "linear-gradient(150deg, rgba(75,108,183,.45), rgba(27,43,75,.35))" : "rgba(255,255,255,.04)" }}>
      <div className="text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>{en}</div>
      <div className="text-[26px] font-black text-white mt-1.5">{title}</div>
      <div className="text-[14px] text-white/60 mt-1 leading-relaxed">{desc}</div>
      <ul className="mt-5 space-y-1.5">{points.map((p) => <li key={p} className="flex items-center gap-2 text-[13.5px] font-semibold text-white/80"><span className="w-1.5 h-1.5 rotate-45 bg-[#8FB0F0]" />{p}</li>)}</ul>
      <div className="mt-6 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black group-hover:gap-3 transition-all">들어가기 <span>→</span></div>
    </button>
  );
  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10 text-white"
      style={{ background: "linear-gradient(rgba(143,176,240,.05) 1px, transparent 1px) 0 0/30px 30px, linear-gradient(90deg, rgba(143,176,240,.05) 1px, transparent 1px) 0 0/30px 30px, radial-gradient(900px 400px at 80% -10%, rgba(75,108,183,.45), transparent 60%), linear-gradient(160deg,#0B1428 0%,#111F3B 55%,#0E1830 100%)" }}>
      <div className="w-full max-w-[980px]">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <div className="text-[11.5px] font-extrabold tracking-[0.32em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>KP-FLOW · SELECT WORKSPACE</div>
            <div className="text-[32px] font-black tracking-tight mt-1">어디로 들어갈까요?</div>
            <div className="text-[14.5px] text-white/55 mt-1">{user?.email} · 최고관리자 계정은 매번 들어갈 곳을 고릅니다.</div>
          </div>
          <div className="px-3 h-10 rounded-xl bg-white/[0.06] ring-1 ring-white/10 flex items-center"><Clock /></div>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <Item k="platform" primary en="PLATFORM CONTROL" title="관리자 관리센터" desc="이 프로그램 플랫폼을 운영하는 화면입니다." points={["가입사 관제 · 사용량 · 건강도", "요금제 · 견적 · 전자계약", "청구 · 수납 · 플랫폼 공지", "로그인 관리 · 접속 이력 · 데이터"]} />
          <Item k="app" en="DISPATCH WORKSPACE" title="배차 프로그램" desc="운송사 화면으로 들어가 실제 배차 업무를 봅니다." points={["배차관리 · 실시간 배차현황", "매출 · 정산 · 회사관리", "고객사 화면 점검 · 지원", "로그인 때 고른 회사로 진입"]} />
        </div>
        <div className="mt-6 text-center text-[12px] text-white/35" style={{ fontFamily: MONO }}>들어간 뒤에도 상단 버튼으로 언제든 전환할 수 있습니다</div>
      </div>
    </div>
  );
}
