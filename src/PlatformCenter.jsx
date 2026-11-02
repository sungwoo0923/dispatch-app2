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
import { addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { pushTenantBypass } from "./fsTenant";
import KpSubNav from "./KpSubNav";
import PlatformMonitor, { estimateBill, usePhone } from "./PlatformMonitor";
// ⭐ 2026-11-02 관리자센터 — 실시간 계정·접속 층 + 운영 위젯
import { PlatformLiveProvider, usePlatformLive, mergeCompanies, LiveNowPanel, SignupTimeline, DupeWarning, HeaderLivePill, Panel as LivePanel, normCo } from "./PlatformLive";
import { ShellIcon } from "./AdminShell";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useSalesPricing, applyPlanBill } from "./SalesQuote";
import { ContractBuilder, ContractList, ContractTemplates } from "./ContractCenter";
import { NotifTemplatePanel, LandingPageEditPanel, ShipperForceUpdatePanel } from "./AdminMenu";
import { AdminSessionsPanel } from "./LoginManager";
import CompanyResetPanel from "./CompanyResetPanel";
import SheetImportPanel from "./SheetImportPanel";
import NoticeBoard from "./NoticeBoard";
import { toBoardNotice } from "./PlatformNoticeBanner";
import { compressImage } from "./InternalMail";
import { RemoteSupportAdminPanel } from "./RemoteSupport"; // ⭐ 2026-11-02 원격지원 —
import { CustomSelect } from "./CustomSelect";
import "./pcTheme.css";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ─── 메뉴 구성 ───
const SECTIONS = [
  { key: "home", label: "대시보드", en: "DASHBOARD", icon: "pulse", items: [
    { key: "todo", label: "오늘 할 일", en: "TODAY", icon: "check" },
    { key: "overview", label: "플랫폼 개요", en: "OVERVIEW", icon: "pulse" },
    { key: "live", label: "실시간 접속", en: "LIVE", icon: "users" }, // ⭐ 2026-11-02 관리자센터
    { key: "support", label: "원격 지원", en: "SUPPORT", icon: "phone" }, // ⭐ 2026-11-02 원격지원 —
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
    { key: "tenancy", label: "운송사 분리", en: "ISOLATION", icon: "shield" },
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
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 h-[46px] sm:h-[50px] bg-[#F7F9FC] border-b border-[#E8EDF4]">
        <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
          <span className="text-[10.5px] font-extrabold tracking-[0.2em] text-[#94A3B8]" style={{ fontFamily: MONO }}>{code}</span>
          <span className="text-[15px] sm:text-[16px] font-black text-[#0F1A30] truncate whitespace-nowrap">{title}</span></div>
        {right}
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  );
}
function Hero({ en, title, desc, right }) {
  return (
    <div className="kp-hero relative overflow-hidden rounded-[18px] sm:rounded-[22px] px-4 py-3.5 sm:px-6 sm:py-5 mb-3 sm:mb-4 text-white flex items-center justify-between gap-3 sm:gap-4 flex-wrap"
      style={{ background: "linear-gradient(rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.06) 1px, transparent 1px) 0 0/22px 22px, radial-gradient(600px 200px at 85% -20%, rgba(75,108,183,.45), transparent 60%), linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
      <div className="min-w-0"><div className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.28em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO }}>{en}</div>
        <div className="text-[19px] sm:text-[24px] font-black mt-0.5 tracking-tight whitespace-nowrap">{title}</div>
        {desc && <div className="hidden sm:block text-[13.5px] text-white/65 mt-0.5">{desc}</div>}</div>
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
  React.useEffect(() => onSnapshot(order ? query(collection(db, name), orderBy(order, "desc"), limit(n)) : query(collection(db, name), limit(n)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), [name, order, n]);
  return list;
}
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);

// ═══════════════════════ 오늘 할 일 ═══════════════════════
function TodayPanel({ go }) {
  const live = usePlatformLive(); // ⭐ 2026-11-02 관리자센터 — 운송사 가입 승인 대기 · 직원 승인 대기 · 비슷한 회사명
  const quotes = useCol("salesQuotes");
  const contracts = useCol("contracts");
  const inquiries = useCol("landingInquiries");
  const planReqs = useCol("planRequests");
  const invoices = useCol("platformInvoices", null);
  const [apps, setApps] = React.useState([]);
  React.useEffect(() => onSnapshot(collection(db, "companyApplications"), (s) => setApps(s.docs.map((d) => d.data())), () => {}), []);
  const today = ymd();
  const soonLimit = (() => { const d = new Date(); d.setMonth(d.getMonth() + 2); return ymd(d); })();
  const tasks = [
    // ⭐ 2026-11-02 원격지원 — 직원의 원격 지원 요청(승인 대기)을 맨 위에
    ...(live?.pending.support || []).map((r) => ({ code: "HELP", text: `${normCo(r.companyName) || "운송사"} ${r.name || ""} 원격 지원 요청`, sub: `${r.method === "remote" ? "원격 프로그램" : "화면 공유"} · ${String(r.message || "").slice(0, 40)}`, to: "support", lv: 3 })),
    ...(planReqs || []).filter((r) => r.status === "요청").map((r) => ({ code: "PLAN", text: `${r.company} 요금제 변경 요청 → ${r.toName || r.to}`, sub: `${r.byName || r.by || ""} · 청구 › 수납 관리에서 요금제 지정`, to: "payments", lv: 2 })),
    ...(invoices || []).filter((v) => v.payNotice && v.status !== "입금완료").map((v) => ({ code: "PAID?", text: `${v.company} 입금 알림 — ${Number(v.amount || 0).toLocaleString()}원 (${v.month})`, sub: `${v.payNotice.name || ""} ${v.payNotice.date || ""} · 통장 확인 후 입금완료 처리`, to: "payments", lv: 2 })),
    ...(inquiries || []).filter((q) => !q.status || q.status === "신규").map((q) => ({ code: "LEAD", text: `${q.companyName || "업체"} 도입 문의 — 아직 연락 전`, sub: q.phone || "", to: "inquiries", lv: 2 })),
    ...apps.filter((a) => a.status === "pending").map((a) => ({ code: "APPLY", text: `${a.companyName || a.name || "화주사"} 가입 승인 대기`, sub: "", to: "applications", lv: 2 })),
    ...(live?.pending.transport || []).map((a) => ({ code: "APPLY", text: `${normCo(a.companyName) || "운송사"} ${a.type && a.type !== "신규" ? `${a.type} ` : ""}운송사 가입 승인 대기`, sub: `${a.name || a.representative || ""} ${a.phone || ""}`.trim(), to: "applications", lv: 2 })),
    ...(live?.dupes.length ? [{ code: "NAME", text: `비슷한 회사명 ${live.dupes.length}건 — 숫자가 나뉘어 집계됨`, sub: live.dupes.slice(0, 3).map((d) => d.names.map((x) => `"${x.raw}"`).join(" / ")).join(" · "), to: "companies", lv: 1 }] : []),
    ...(live?.pending.staffByCo || []).map((c) => ({ code: "STAFF", text: `${c.name} 직원 승인 대기 ${c.n}명`, sub: "그 운송사 관리자가 승인 — 오래 걸리면 안내", to: "companies", lv: 0 })),
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
      <DupeWarning compact />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpi.map(([l, v, u], i) => (
          <div key={l} className={`rounded-[16px] px-4 py-3.5 border ${i === 3 ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
            <div className={`text-[12.5px] font-bold ${i === 3 ? "text-white/60" : "text-[#7A879C]"}`}>{l}</div>
            <div className="text-[26px] font-black mt-0.5" style={{ fontFamily: MONO }}>{v}<span className={`text-[13px] ml-1 ${i === 3 ? "text-white/50" : "text-[#9AA9C3]"}`}>{u}</span></div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
      <Card code="QUEUE" title={`처리할 일 ${tasks.length}건`} bodyClass="p-2">
        {tasks.length === 0 ? <div className="py-14 text-center text-[#9AA9C3]">지금 처리할 일이 없습니다 ✓</div> : tasks.map((t, i) => (
          <button key={i} type="button" onClick={() => go(t.to)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F5F8FD] text-left">
            <span className={`w-16 shrink-0 text-center py-1 rounded-md text-[10.5px] font-extrabold tracking-[0.12em] ${t.lv >= 2 ? "bg-[#0F1A30] text-white" : t.lv === 1 ? "bg-[#DCE6F7] text-[#1B2B4B]" : "border border-[#DCE3EE] text-[#5B6B85]"}`} style={{ fontFamily: MONO }}>{t.code}</span>
            <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-black text-[#0F1A30] truncate">{t.text}</span>{t.sub && <span className="block text-[12px] text-[#7A89A3]" style={{ fontFamily: MONO }}>{t.sub}</span>}</span>
            <span className="text-[#9AA9C3]">›</span>
          </button>
        ))}
      </Card>
      <div className="grid gap-4">
        <LiveNowPanel compact onMore={() => go("live")} />
        <SignupTimeline max={6} />
      </div>
      </div>
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
            <div className="overflow-x-auto"><table className="w-full text-[14px] whitespace-nowrap">
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
            </table></div>
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
  const live = usePlatformLive(); // ⭐ 2026-11-02 관리자센터 — 직원 수(추가 계정 요금)는 실시간
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
  // 💳 회사별 요금제(companyPlans) + 요금제 가격(요금제 관리)
  const sales = useSalesPricing();
  const [plans, setPlans] = React.useState({});
  React.useEffect(() => onSnapshot(collection(db, "companyPlans"), (s) => { const m = {}; s.docs.forEach((d) => { m[d.id] = d.data(); }); setPlans(m); }, () => {}), []);
  const setPlan = async (company, planId) => {
    try {
      if (planId) await setDoc(doc(db, "companyPlans", company), { planId, since: ymd(), updatedAt: serverTimestamp() }, { merge: true });
      else await deleteDoc(doc(db, "companyPlans", company));
      // 이 회사의 대기 중 요금제 변경 요청은 처리됨으로
      const open = await getDocs(query(collection(db, "planRequests"), where("company", "==", company), where("status", "==", "요청")));
      await Promise.all(open.docs.map((d) => updateDoc(d.ref, { status: "처리", handledAt: serverTimestamp(), appliedPlan: planId || "" })));
    } catch (e) { window.alert(e.message); }
  };
  const planBill = (c, base) => applyPlanBill(base, c, plans[c.name]?.planId, sales); // ⭐ 2026-11-02 관리자센터2 — 요금·청구와 같은 계산(SalesQuote.applyPlanBill)
  if (!stats || !pricing) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const companies = mergeCompanies(stats.companies, live).map((c) => ({ ...c, bill: planBill(c, estimateBill(c, pricing, days, days)) }));
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
          <div className="overflow-x-auto"><table className="w-full text-[14px]" style={{ minWidth: 1040 }}>
            <thead><tr className="bg-[#1B2B4B] text-white">{["운송사", "요금제", "청구액(VAT 별도)", "상태", "입금일", "메모"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold">{h}</th>)}</tr></thead>
            <tbody>{companies.map((c) => { const r = rows[key(c)] || {}; return (
              <tr key={c.name} className="border-t border-[#EEF1F6]">
                <td className="px-3 py-2 font-black text-[#0F1A30]">{c.name}{r.payNotice && <div className="mt-0.5 inline-block px-2 py-0.5 rounded-md bg-[#0F1A30] text-white text-[11px] font-black">입금 알림 · {r.payNotice.name || ""} {r.payNotice.date || ""}</div>}</td>
                <td className="px-3 py-2 text-center">
                  <CustomSelect value={plans[c.name]?.planId || ""} onChange={(e) => setPlan(c.name, e.target.value)} className="h-9 px-2 rounded-lg border border-[#DCE3EE] font-bold text-[13px]">
                    <option value="">미지정(전체 기능)</option>
                    {(sales?.plans || []).filter((p) => ["lite", "basic", "standard", "pro"].includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name} · {Number(p.price || 0).toLocaleString()}</option>)}
                  </CustomSelect>
                </td>
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
// ⭐ 2026-11-02 관리자센터2 — 회사 공지사항 작성 화면(HomeWriters.NoticeWriter)과 같은 글쓰기 UX
//  · 대상: 전체 / 전체 운송사 / 전체 화주사 / 선택한 운송사(회사 검색·다중 선택 → targetCompanies[])
//  · 분류 · 상단 고정 · 띠 배너 · 푸시 · 게시 종료일 · 제목 · 본문 · 이미지 1장 · 미리보기(실제 공지사항 목록 컴포넌트로)
//  · 게시하면 대상 회사 홈 › 공지사항(PC·모바일)에 "플랫폼 공지" 표시로 함께 뜬다(같은 문서를 읽으므로 수정·삭제도 바로 반영)
const PN_AUD = [
  ["all", "전체", "운송사 + 화주사"],
  ["carrier", "전체 운송사", "모든 운송사 직원"],
  ["shipper", "전체 화주사", "화주 화면 배너"],
  ["selected", "선택한 운송사", "고른 회사만"],
];
const PN_LEVELS = ["안내", "업데이트", "점검", "중요", "긴급"];
const pnAudLabel = (n) => (n.audience === "selected" ? `선택 ${(n.targetCompanies || []).length}곳` : (PN_AUD.find(([k]) => k === (n.audience || "all")) || PN_AUD[0])[1]);
function CompanyPicker({ selected, setSelected }) {
  const live = usePlatformLive();
  const [q, setQ] = React.useState("");
  const all = React.useMemo(() => {
    const m = new Map();
    Object.values(live?.companies || {}).forEach((c) => { if (c.staff || c.drivers || c.pending) m.set(c.name, { name: c.name, staff: c.staff, code: live.appInfo?.[c.name]?.code || "" }); });
    Object.entries(live?.appInfo || {}).forEach(([name, a]) => { if (!m.has(name)) m.set(name, { name, staff: 0, code: a.code || "" }); });
    return [...m.values()].sort((a, b) => b.staff - a.staff || a.name.localeCompare(b.name, "ko"));
  }, [live]);
  const kw = q.trim().toLowerCase();
  const rows = all.filter((c) => !kw || c.name.toLowerCase().includes(kw) || String(c.code).toLowerCase().includes(kw));
  const toggle = (name) => setSelected(selected.includes(name) ? selected.filter((x) => x !== name) : [...selected, name]);
  const allOn = rows.length > 0 && rows.every((c) => selected.includes(c.name));
  return (
    <div className="rounded-2xl border border-[#DCE3EE] bg-[#F7F9FC] p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[36px]">
        {selected.length ? selected.map((n) => (
          <span key={n} className="h-8 pl-3 pr-1 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-bold inline-flex items-center gap-1 whitespace-nowrap">
            {n}<button type="button" onClick={() => toggle(n)} aria-label={`${n} 빼기`} className="w-6 h-6 rounded-md text-white/70 hover:text-white hover:bg-white/10">✕</button>
          </span>
        )) : <span className="text-[14px] font-semibold text-[#7A879C]">아래에서 공지를 받을 운송사를 고르세요</span>}
        {selected.length > 0 && <button type="button" onClick={() => setSelected([])} className="ml-auto h-8 px-3 rounded-lg text-[13px] font-bold text-[#5B6B85] hover:bg-white whitespace-nowrap">모두 빼기</button>}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사명 · 회사 코드 검색" className="w-full h-11 pl-10 pr-3 rounded-xl border border-[#DCE3EE] bg-white text-[14.5px] font-semibold outline-none focus:border-[#4B6CB7]" />
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9AA9C3]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </div>
        <button type="button" disabled={!rows.length} onClick={() => setSelected(allOn ? selected.filter((n) => !rows.some((c) => c.name === n)) : [...new Set([...selected, ...rows.map((c) => c.name)])])} className="h-11 px-4 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] font-black text-[#1B2B4B] whitespace-nowrap disabled:opacity-40">{allOn ? "보이는 회사 해제" : `보이는 ${rows.length}곳 선택`}</button>
      </div>
      <div className="max-h-[280px] overflow-y-auto rounded-xl bg-white border border-[#E3E8F0] divide-y divide-[#EEF1F6]">
        {!live?.ready ? <div className="py-8 text-center text-[14px] text-[#9AA9C3]">회사 목록 불러오는 중…</div>
          : rows.length === 0 ? <div className="py-8 text-center text-[14px] text-[#9AA9C3]">검색 결과가 없습니다</div>
          : rows.map((c) => { const on = selected.includes(c.name); return (
            <button key={c.name} type="button" onClick={() => toggle(c.name)} className={`w-full flex items-center gap-3 px-3.5 h-12 text-left ${on ? "bg-[#EEF3FB]" : "hover:bg-[#F7F9FC]"}`}>
              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-[12px] font-black shrink-0 ${on ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "border-[#C9D3E3] bg-white"}`}>{on ? "✓" : ""}</span>
              <span className="flex-1 min-w-0 truncate text-[14.5px] font-black text-[#0F1A30]">{c.name}</span>
              {c.code && <span className="text-[12.5px] font-bold text-[#7A879C] whitespace-nowrap" style={{ fontFamily: MONO }}>{c.code}</span>}
              <span className="w-16 text-right text-[13px] font-semibold text-[#5B6B85] whitespace-nowrap">직원 {c.staff}명</span>
            </button>); })}
      </div>
    </div>
  );
}
function PlatformNoticePreview({ draft, onClose }) {
  const [openId, setOpenId] = React.useState("plat:preview");
  const n = toBoardNotice({ ...draft, id: "preview", createdAt: Date.now() });
  return (
    <div className="fixed inset-0 z-[99990] bg-[rgba(11,20,40,.55)] flex items-start justify-center p-3 sm:p-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-[980px] rounded-[22px] bg-[#EEF1F6] p-3 sm:p-5 space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div><div className="text-[11px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>PREVIEW</div>
            <div className="text-[17px] font-black text-[#0F1A30]">운송사 홈 › 공지사항에서 이렇게 보입니다</div></div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setOpenId(null)} className={`h-10 px-4 rounded-xl text-[13.5px] font-black border ${!openId ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white border-[#DCE3EE] text-[#1B2B4B]"}`}>목록</button>
            <button type="button" onClick={() => setOpenId("plat:preview")} className={`h-10 px-4 rounded-xl text-[13.5px] font-black border ${openId ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white border-[#DCE3EE] text-[#1B2B4B]"}`}>본문</button>
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black">닫기</button>
          </div>
        </div>
        {draft.banner !== false && (
          <div className="rounded-xl overflow-hidden text-white" style={{ background: ["중요", "점검", "긴급"].includes(draft.level) ? "linear-gradient(90deg,#0B1428,#1B2B4B)" : "linear-gradient(90deg,#1B2B4B,#2D4C82)" }}>
            <div className="flex items-center gap-3 px-4 py-2 text-[13.5px]"><span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-[11px] font-black text-[#8FB0F0]">{draft.level}</span><b className="truncate">{draft.title || "(제목)"}</b><span className="ml-auto text-white/60 text-[12.5px] whitespace-nowrap">화면 맨 위 띠 배너</span></div>
          </div>
        )}
        <NoticeBoard notices={[n]} me={{ uid: "preview", role: "user" }} canWrite={false} isViewer openId={openId} setOpenId={setOpenId} onEdit={() => {}} confirm={() => {}} />
      </div>
    </div>
  );
}
function NoticesPanel() {
  const list = useCol("platformNotices");
  const blank = { title: "", body: "", level: "안내", audience: "all", targetCompanies: [], active: true, endDate: "", pinned: false, banner: true, push: true, image: "" };
  const [f, setF] = React.useState(blank);
  const [editId, setEditId] = React.useState(null);
  const [writing, setWriting] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState("all");
  const fileRef = React.useRef(null);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const close = () => { setF(blank); setEditId(null); setWriting(false); };
  const save = async () => {
    if (!f.title.trim()) { window.alert("제목을 입력해 주세요."); return; }
    if (f.audience === "selected" && !f.targetCompanies.length) { window.alert("공지를 받을 운송사를 한 곳 이상 골라 주세요."); return; }
    setBusy(true);
    try {
      const data = { title: f.title.trim().slice(0, 200), body: f.body || "", level: f.level, category: f.level, audience: f.audience,
        targetCompanies: f.audience === "selected" ? f.targetCompanies : [], active: f.active !== false, endDate: f.endDate || "",
        pinned: !!f.pinned, banner: f.banner !== false, board: true, image: f.image || "", author: "KP-Flow 운영팀" };
      if (editId) await updateDoc(doc(db, "platformNotices", editId), { ...data, updatedAt: serverTimestamp() });
      else await addDoc(collection(db, "platformNotices"), { ...data, push: f.push !== false, createdAt: serverTimestamp(), authorEmail: auth.currentUser?.email || "" });
      close();
    } catch (e) { window.alert(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const Label = ({ children, hint }) => <div className="text-[14px] font-black text-[#0F1A30] mb-2">{children}{hint && <span className="ml-1.5 text-[13px] font-semibold text-[#9AA9C3]">{hint}</span>}</div>;
  const inp = "w-full px-4 rounded-xl border border-[#DCE3EE] bg-white text-[15px] text-[#0F1A30] outline-none focus:border-[#4B6CB7]";
  const today = ymd();
  const rows = (list || []).filter((n) => filter === "all" || (filter === "live" ? n.active !== false && !(n.endDate && n.endDate < today) : !(n.active !== false && !(n.endDate && n.endDate < today))));
  const liveN = (list || []).filter((n) => n.active !== false && !(n.endDate && n.endDate < today)).length;

  if (writing) return (
    <div className="space-y-4">
      <Hero en="OPERATIONS · BROADCAST · WRITE" title={editId ? "플랫폼 공지 수정" : "플랫폼 공지 작성"} desc="대상 회사의 홈 › 공지사항(PC·모바일)과 화면 맨 위 띠 배너에 '플랫폼 공지'로 뜹니다 · 회사 관리자는 고칠 수 없습니다"
        right={<div className="flex items-center gap-2">
          <button type="button" onClick={close} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-white text-[14px] font-bold whitespace-nowrap">취소</button>
          <button type="button" onClick={() => setPreview(true)} className="h-11 px-5 rounded-xl bg-white/10 border border-white/20 text-white text-[14px] font-black whitespace-nowrap inline-flex items-center gap-2"><ShellIcon name="eye" size={15} />미리보기</button>
          <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-xl bg-white text-[#0F1A30] text-[14.5px] font-black inline-flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"><ShellIcon name="send" size={15} />{busy ? "저장 중…" : editId ? "수정 저장" : "공지 게시"}</button>
        </div>} />
      <div className="rounded-[18px] bg-white border border-[#E3E8F0] p-4 sm:p-6 space-y-5">
        <div className="grid gap-4 min-[1700px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] min-[1700px]:items-end">
          <div>
            <Label>받는 대상</Label>
            <div role="radiogroup" aria-label="받는 대상" className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-[#F1F4F9] border border-[#E3E8F0]">
              {PN_AUD.map(([v, l, s2]) => (
                <button key={v} type="button" role="radio" aria-checked={f.audience === v} onClick={() => set({ audience: v })}
                  className={`rounded-lg px-3 py-2 text-left transition ${f.audience === v ? "bg-[#0F1A30] text-white shadow-[0_4px_12px_rgba(15,26,48,0.25)]" : "text-[#3A4A66] hover:bg-white"}`}>
                  <div className="text-[14px] font-black leading-tight whitespace-nowrap">{l}</div><div className={`text-[12px] leading-tight mt-0.5 whitespace-nowrap ${f.audience === v ? "text-white/60" : "text-[#9AA9C3]"}`}>{s2}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>분류</Label>
            <div role="radiogroup" aria-label="분류" className="flex flex-wrap gap-1.5">
              {PN_LEVELS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={f.level === c} onClick={() => set({ level: c })} className={`h-[50px] px-4 rounded-xl text-[14px] font-black border ${f.level === c ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#3A4A66] border-[#DCE3EE] hover:border-[#4B6CB7]"}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="justify-self-start flex items-center gap-2.5 h-[50px] px-3 rounded-xl bg-[#F5F8FD] border border-[#E3E8F0]">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center text-[12px] font-black" style={{ background: "linear-gradient(135deg,#0B1428,#1B2B4B)", color: "#E9C46A" }}>KP</span>
            <div className="leading-tight"><div className="text-[14px] font-black text-[#0F1A30] whitespace-nowrap">KP-Flow 운영팀</div><div className="text-[12px] text-[#7A879C]">작성자 · 자동</div></div>
          </div>
        </div>
        {f.audience === "selected" && (
          <div><Label hint={f.targetCompanies.length ? `${f.targetCompanies.length}곳 선택` : "(회사명·코드로 찾아 여러 곳 고르기)"}>받을 운송사</Label>
            <CompanyPicker selected={f.targetCompanies} setSelected={(v) => set({ targetCompanies: v })} /></div>
        )}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {[["pinned", "• 상단 고정", "공지사항 목록 맨 위"], ["banner", "띠 배너로도 표시", "화면 맨 위 · 닫으면 다시 안 뜸"], ...(editId ? [] : [["push", "푸시 알림 보내기", "대상 직원 휴대폰"]])].map(([k, l, h]) => (
            <label key={k} className="inline-flex items-center gap-2 text-[14px] font-black text-[#0F1A30] cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={k === "pinned" ? !!f[k] : f[k] !== false} onChange={(e) => set({ [k]: e.target.checked })} className="w-4 h-4 accent-[#1B2B4B]" />
              {l} <span className="text-[13px] font-semibold text-[#9AA9C3]">({h})</span>
            </label>
          ))}
          <label className="inline-flex items-center gap-2 text-[14px] font-black text-[#0F1A30] whitespace-nowrap">게시 종료일
            <input type="date" value={f.endDate || ""} onChange={(e) => set({ endDate: e.target.value })} className="h-10 px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold" />
            <span className="text-[13px] font-semibold text-[#9AA9C3]">(비우면 계속)</span>
          </label>
        </div>
        <div><Label>제목</Label>
          <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 11/9(일) 02:00~04:00 정기 점검 안내" className={`${inp} h-12 text-[16px] font-bold`} /></div>
        <div><Label>내용</Label>
          <textarea value={f.body} onChange={(e) => set({ body: e.target.value })} rows={14} placeholder="공지할 내용을 입력하세요" className={`${inp} py-3.5 leading-[1.85] resize-y min-h-[300px]`} /></div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div><Label hint="(1장)">이미지</Label>
            {f.image ? (
              <div className="relative w-44 h-32 rounded-xl overflow-hidden border border-[#E3E8F0]">
                <img src={f.image} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => set({ image: "" })} className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-[#0F1A30]/80 text-white text-[13px]">✕</button>
              </div>
            ) : <button type="button" onClick={() => fileRef.current?.click()} className="w-44 h-32 rounded-xl border-2 border-dashed border-[#C9D2E0] text-[#7A879C] text-[14px] font-bold hover:border-[#4B6CB7]">+ 이미지 첨부</button>}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => { const fl = e.target.files?.[0]; e.target.value = ""; if (fl) { const img = await compressImage(fl, 1400, 0.8).catch(() => ""); if (img && img.length > 900000) { window.alert("이미지가 너무 큽니다. 더 작은 이미지를 골라 주세요."); return; } set({ image: img }); } }} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={close} className="h-11 px-5 rounded-xl bg-white border border-[#DCE3EE] text-[#3A4A66] text-[14px] font-bold">취소</button>
            <button type="button" onClick={() => setPreview(true)} className="h-11 px-5 rounded-xl bg-white border border-[#1B2B4B] text-[#1B2B4B] text-[14px] font-black inline-flex items-center gap-2"><ShellIcon name="eye" size={15} />미리보기</button>
            <button type="button" onClick={save} disabled={busy} className="h-11 px-6 rounded-xl bg-[#0F1A30] text-white text-[14.5px] font-black inline-flex items-center gap-2 disabled:opacity-50"><ShellIcon name="send" size={15} />{busy ? "저장 중…" : editId ? "수정 저장" : "공지 게시"}</button>
          </div>
        </div>
      </div>
      {preview && <PlatformNoticePreview draft={f} onClose={() => setPreview(false)} />}
    </div>
  );

  return (
    <div className="space-y-4">
      <Hero en="OPERATIONS · BROADCAST" title="플랫폼 공지" desc="대상 회사의 홈 › 공지사항(PC·모바일)에 '플랫폼 공지'로 올라가고, 화면 맨 위 띠 배너·푸시 알림으로도 알립니다."
        right={<button type="button" onClick={() => { setF(blank); setEditId(null); setWriting(true); }} className="h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14.5px] font-black inline-flex items-center gap-2 whitespace-nowrap"><ShellIcon name="pen" size={15} />새 공지 작성</button>} />
      <Card code="POSTED" title={`게시한 공지 ${(list || []).length}건`} bodyClass="p-0">
        <div className="px-4 sm:px-5 py-3 border-b border-[#EEF1F6]"><div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#EEF2F8]">{[["all", "전체", (list || []).length], ["live", "게시 중", liveN], ["off", "내림·종료", (list || []).length - liveN]].map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`h-9 px-3.5 rounded-lg text-[13.5px] font-black whitespace-nowrap ${filter === k ? "bg-[#1B2B4B] text-white" : "text-[#5B6B85]"}`}>{l} <span style={{ fontFamily: MONO }}>{n}</span></button>))}</div></div>
        {!list ? <div className="py-14 text-center text-[#9AA9C3]">불러오는 중…</div> : rows.length === 0 ? <div className="py-16 text-center text-[15px] text-[#9AA9C3]">게시한 공지가 없습니다 — 오른쪽 위 '새 공지 작성'</div> : (
          <div className="divide-y divide-[#EEF1F6]">
            {rows.map((n) => {
              const expired = n.endDate && n.endDate < today;
              const on = n.active !== false && !expired;
              const tc = n.targetCompanies || [];
              return (
                <div key={n.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-[#F7F9FC] flex-wrap lg:flex-nowrap">
                  <span className={`w-[60px] shrink-0 text-center py-1.5 rounded-lg text-[13px] font-black ${["중요", "점검", "긴급"].includes(n.level) ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>{n.level || "안내"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {n.pinned && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[#0F1A30] text-[#8FB0F0] text-[11.5px] font-black">• 고정</span>}
                      <span className={`text-[15.5px] font-black truncate ${on ? "text-[#0F1A30]" : "text-[#9AA9C3] line-through"}`}>{n.title}</span>
                      {n.image && <span className="shrink-0 text-[12px] text-[#9AA9C3]">▣</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap text-[13px] text-[#7A89A3]">
                      <span className={`px-2 py-0.5 rounded-md font-black ${n.audience === "selected" ? "bg-[#1B2B4B] text-white" : "border border-[#D5E0F2] text-[#1B2B4B]"}`}>{pnAudLabel(n)}</span>
                      {n.audience === "selected" && <span className="font-semibold text-[#3A4A66] truncate max-w-[360px]">{tc.slice(0, 3).join(", ")}{tc.length > 3 ? ` 외 ${tc.length - 3}곳` : ""}</span>}
                      <span style={{ fontFamily: MONO }}>{msOf(n.createdAt) ? ymd(new Date(msOf(n.createdAt))) : ""}{n.endDate ? ` ~ ${n.endDate}` : ""}</span>
                      {n.banner === false && <span>배너 없음</span>}
                      <span className={`font-black ${on ? "text-[#1B2B4B]" : "text-[#9AA9C3]"}`}>{on ? "● 게시 중" : expired ? "기간 종료" : "내림"}</span>
                    </div>
                  </div>
                  <div className="w-full lg:w-auto flex justify-end gap-1.5 shrink-0 [&_button]:whitespace-nowrap">
                    <button type="button" onClick={() => updateDoc(doc(db, "platformNotices", n.id), { active: n.active === false })} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">{n.active === false ? "다시 게시" : "내리기"}</button>
                    <button type="button" onClick={() => { setEditId(n.id); setF({ ...blank, ...n, targetCompanies: tc }); setWriting(true); }} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black">수정</button>
                    <button type="button" onClick={() => window.confirm("공지를 삭제할까요?\n대상 회사 공지사항 목록에서도 함께 사라집니다.") && deleteDoc(doc(db, "platformNotices", n.id))} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-bold text-[#7A879C]">삭제</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════ 운송사 분리(서버 잠금) ═══════════════════════
const TENANT_COLS = ["orders", "dispatch", "dispatch_test", "drivers", "clients", "places", "fixedClients", "recurringOrders",
  "deletedOrders", "driver_completed_archive", "notices", "schedules", "handovers", "boardPosts", "approvals", "approvalLines",
  "notifications", "scheduledEmails", "emailLogs", "hrResumes", "attendanceRequests", "attendanceChangeRequests", "acctPayments"];
function TenancyPanel() {
  const [cfg, setCfg] = React.useState(null);
  const [prog, setProg] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => onSnapshot(doc(db, "systemConfig", "tenancy"), (s) => setCfg(s.exists() ? s.data() : {}), () => setCfg({})), []);
  const run = async () => {
    if (!window.confirm("회사명이 빈칸인 예전 문서에 운송사를 적습니다.\n· 화주사가 보낸 오더 → 받은 운송사\n· 나머지 → 돌캐(운송사 칸이 생기기 전부터 쓰던 운송사)\n이미 회사명이 있는 문서는 건드리지 않습니다.\n오래 걸릴 수 있으니 창을 닫지 마세요. 진행할까요?")) return;
    setBusy(true); setMsg("");
    try {
      const token = await auth.currentUser?.getIdToken();
      for (const col of TENANT_COLS) {
        let cursor = null; let scanned = 0; let updated = 0;
        for (;;) {
          setProg((p) => ({ ...p, [col]: { scanned, updated, state: "진행 중" } }));
          const r = await fetch(`${FUNCTIONS_BASE}/tenantMigrate`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ col, cursor }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(`${col}: ${j.error || r.status}${r.status === 404 ? " (서버 함수 배포가 필요합니다)" : ""}`);
          scanned += j.scanned || 0; updated += j.updated || 0; cursor = j.cursor;
          if (j.done) break;
        }
        setProg((p) => ({ ...p, [col]: { scanned, updated, state: "완료" } }));
      }
      await setDoc(doc(db, "systemConfig", "tenancy"), { backfilledAt: serverTimestamp() }, { merge: true });
      setMsg("예전 데이터 정리 완료 — 이제 '서버 분리 켜기'를 누르세요.");
    } catch (e) { setMsg(`실패: ${e.message || e}`); } finally { setBusy(false); }
  };
  const toggle = async (on) => {
    if (on && !cfg?.backfilledAt) { window.alert("먼저 1단계(예전 데이터 정리)를 끝내야 합니다."); return; }
    if (!window.confirm(on ? "서버 분리를 켭니다. 모든 화면이 우리 회사 조건으로 조회합니다.\n켠 뒤 PC에서 규칙을 배포하면 서버가 다른 운송사 조회를 거부합니다." : "서버 분리를 끕니다(규칙을 배포한 뒤라면 끄면 안 됩니다).")) return;
    await setDoc(doc(db, "systemConfig", "tenancy"), { serverFilter: on, serverFilterAt: serverTimestamp() }, { merge: true });
  };
  const step = (n, title, done, children) => (
    <div className={`rounded-2xl border p-4 ${done ? "border-[#0F1A30] bg-[#F5F8FD]" : "border-[#E3E8F0] bg-white"}`}>
      <div className="flex items-center gap-2"><span className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black ${done ? "bg-[#0F1A30] text-white" : "border-2 border-[#C9D3E3] text-[#9AA9C3]"}`}>{done ? "✓" : n}</span><span className="text-[15px] font-black text-[#0F1A30] whitespace-nowrap">{title}</span></div>
      <div className="mt-2 text-[13px] text-[#5B6B85] leading-relaxed">{children}</div>
    </div>
  );
  return (
    <div className="space-y-4">
      <Hero en="SECURITY · ISOLATION" title="운송사 분리" desc="운송사끼리 오더·기사·거래처·사내 데이터가 절대 섞이지 않도록 서버에서부터 잠급니다." />
      <Card code="STEPS" title="순서대로 진행">
        <div className="grid gap-3 lg:grid-cols-3">
          {step(1, "예전 데이터 회사명 채우기", !!cfg?.backfilledAt, <>
            운송사 칸이 생기기 전 문서(회사명 빈칸)에 운송사를 적습니다. 화주사가 보낸 오더는 받은 운송사로, 나머지는 원래 쓰던 운송사 <b>돌캐</b>로 들어갑니다. 지금도 빈칸은 돌캐 데이터로 보이고 있어 화면 변화는 없고, 서버 잠금을 켜기 위한 정리입니다.
            <button type="button" disabled={busy} onClick={run} className="mt-3 w-full h-10 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50">{busy ? "정리 중…" : cfg?.backfilledAt ? "다시 실행" : "실행"}</button>
          </>)}
          {step(2, "서버 분리 켜기", cfg?.serverFilter === true, <>
            모든 화면이 "우리 회사" 조건을 붙여 조회합니다. 직원들은 새로고침 한 번이면 적용됩니다.
            <button type="button" onClick={() => toggle(!cfg?.serverFilter)} className={`mt-3 w-full h-10 rounded-xl text-[13.5px] font-black ${cfg?.serverFilter ? "border border-[#DCE3EE] text-[#3A4A66]" : "bg-[#0F1A30] text-white"}`}>{cfg?.serverFilter ? "끄기" : "켜기"}</button>
          </>)}
          {step(3, "PC에서 규칙·색인 배포", false, <>
            켠 뒤 10분쯤 지나(직원 화면이 새 버전으로 바뀐 뒤) PC에서:<br /><code className="text-[12px] font-bold text-[#1B2B4B]">firebase deploy --only firestore</code>
          </>)}
        </div>
        {msg && <div className="mt-3 rounded-xl bg-[#0F1A30] text-white px-4 py-2.5 text-[13px] font-bold">{msg}</div>}
        {Object.keys(prog).length > 0 && (
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {TENANT_COLS.filter((c) => prog[c]).map((c) => (
              <div key={c} className="rounded-xl border border-[#E3E8F0] px-3 py-2">
                <div className="text-[12.5px] font-black text-[#0F1A30]" style={{ fontFamily: MONO }}>{c}</div>
                <div className="text-[12px] text-[#5B6B85] whitespace-nowrap">{prog[c].state} · {prog[c].scanned.toLocaleString()}건 중 {prog[c].updated.toLocaleString()}건 채움</div>
              </div>
            ))}
          </div>
        )}
      </Card>
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
          <CustomSelect value={ev} onChange={(e) => setEv(e.target.value)} className="h-9 px-2 rounded-lg border border-[#DCE3EE] text-[13px] font-bold"><option value="all">전체</option>{events.map((e) => <option key={e} value={e}>{e}</option>)}</CustomSelect>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색" className="h-9 w-28 sm:w-48 px-3 rounded-lg border border-[#DCE3EE] text-[13px]" />
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

// ═══════════════════════ 실시간 접속 ═══════════════════════
// ⭐ 2026-11-02 관리자센터 — 지금 누가(회사·PC/모바일·마지막 활동) 쓰고 있는지 + 회사별 접속 + 최근 가입
function LiveTab({ openCompany }) {
  const live = usePlatformLive();
  const phone = usePhone();
  if (!live) return null;
  const t = live.totals;
  const coRows = Object.values(live.companies).filter((c) => c.online24h > 0).sort((a, b) => (b.onlineNow - a.onlineNow) || (b.online24h - a.online24h)).slice(0, 12)
    .map((c) => ({ name: c.name, now: c.onlineNow, day: Math.max(0, c.online24h - c.onlineNow) }));
  const kpi = [
    ["NOW", "지금 접속 (10분)", t.onlineNow, `운송사 ${t.onlineNow - t.shipperNow} · 화주 ${t.shipperNow}`, true],
    ["24H", "24시간 접속", t.online24h, `운송사 ${t.online24h - t.shipper24h} · 화주 ${t.shipper24h}`],
    ["PC", "PC 사용자", t.pcNow, `24시간 ${t.pc24h}명`],
    ["MOBILE", "모바일 사용자", t.mobileNow, `24시간 ${t.mobile24h}명`],
  ];
  return (
    <div className="space-y-4">
      <Hero en="DASHBOARD · LIVE" title="실시간 접속" desc="사람(계정) 기준입니다 — 한 사람이 PC와 휴대폰을 같이 써도 1명. 10분 안에 활동하면 '지금 접속'." right={<Clock />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpi.map(([code, l, v, foot, dark]) => (
          <div key={code} className={`rounded-[16px] px-4 py-3.5 border min-w-0 ${dark ? "bg-[linear-gradient(135deg,#0F1A30,#1B2B4B_60%,#2D4C82)] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
            <div className="flex items-center justify-between gap-2"><span className={`text-[13px] font-bold truncate ${dark ? "text-white/70" : "text-[#5B6B85]"}`}>{l}</span><span className={`text-[10px] font-extrabold tracking-[0.16em] ${dark ? "text-[#8FB0F0]" : "text-[#94A3B8]"}`} style={{ fontFamily: MONO }}>{code}</span></div>
            <div className="text-[28px] font-black mt-1 leading-none" style={{ fontFamily: MONO }}>{live.ready ? v : "-"}<span className={`text-[13px] ml-1 ${dark ? "text-white/50" : "text-[#9AA9C3]"}`}>명</span></div>
            <div className={`text-[12px] font-semibold mt-1.5 truncate ${dark ? "text-white/60" : "text-[#7A879C]"}`}>{foot}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
        <LiveNowPanel onCompany={openCompany} />
        <div className="grid gap-4 min-w-0">
          <LivePanel code="BY COMPANY" title="회사별 접속 (24시간)" right={<span className="text-[12px] font-bold text-[#7A879C] inline-flex items-center gap-3"><span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[#1B2B4B] inline-block" />지금</span><span className="inline-flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-[#B9C8E4] inline-block" />24시간</span></span>}>
            {coRows.length === 0 ? <div className="py-10 text-center text-[#9AA9C3] text-[14px]">최근 24시간 접속이 없습니다</div> : (
              <div style={{ height: Math.max(140, coRows.length * 34 + 20) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={coRows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} onClick={(e) => e?.activeLabel && openCompany?.(e.activeLabel)}>
                    <CartesianGrid stroke="#EEF1F6" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9ca3af", fontFamily: MONO }} />
                    <YAxis type="category" dataKey="name" width={phone ? 84 : 110} axisLine={false} tickLine={false} tick={{ fontSize: 12.5, fill: "#0F1A30", fontWeight: 700 }} />
                    <Tooltip cursor={{ fill: "rgba(27,43,75,.05)" }} formatter={(v, n) => [`${v}명`, n === "now" ? "지금 접속" : "24시간(지금 제외)"]} contentStyle={{ borderRadius: 10, border: "1px solid #E3E8F0", fontSize: 13, fontWeight: 700 }} />
                    <Bar dataKey="now" stackId="a" fill="#1B2B4B" radius={[4, 0, 0, 4]} barSize={16} />
                    <Bar dataKey="day" stackId="a" fill="#B9C8E4" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </LivePanel>
          <SignupTimeline max={14} onCompany={openCompany} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════ 본체 ═══════════════════════
// ⭐ 2026-11-02 관리자센터 — 실시간 층(PlatformLiveProvider)으로 감싼다. 회사 거르기 해제는 구독보다 먼저(렌더 중)
export default function PlatformCenter({ user }) {
  // 🏢 관리센터는 모든 운송사를 봐야 하므로 회사 거르기를 끈다(자식 화면 구독보다 먼저 — 렌더 중에)
  const [releaseBypass] = React.useState(() => pushTenantBypass());
  React.useEffect(() => releaseBypass, [releaseBypass]);
  return <PlatformLiveProvider><PlatformCenterInner user={user} /></PlatformLiveProvider>;
}
function PlatformCenterInner({ user }) {
  const navigate = useNavigate();
  const live = usePlatformLive();
  const [tab, setTabState] = React.useState(() => { try { return localStorage.getItem("pcTab") || "todo"; } catch { return "todo"; } });
  const setTab = React.useCallback((t) => { setTabState(t); try { localStorage.setItem("pcTab", t); } catch { /* 무시 */ } }, []);
  const [contractCtx, setContractCtx] = React.useState({ initial: null, fromQuote: null, key: 0 });
  const [focusCompany, setFocusCompany] = React.useState(null);
  const section = sectionOf(tab);
  const phone = usePhone();
  React.useEffect(() => { document.title = "KP-Flow 관리자 관리센터"; }, []);
  const toApp = () => { try { sessionStorage.setItem("kpEntry", "app"); } catch { /* 무시 */ } navigate("/app"); };
  const logout = async () => { if (!window.confirm("로그아웃할까요?")) return; try { sessionStorage.removeItem("kpEntry"); } catch { /* 무시 */ } await signOut(auth).catch(() => {}); navigate("/login"); };
  const openContract = (patch) => { setContractCtx((c) => ({ initial: null, fromQuote: null, ...patch, key: c.key + 1 })); setTab("contract:new"); };
  // 회사 이름을 누르면 → 운송사 관제의 상세 패널(이미 관제 화면이면 그 자리에서)
  const openCompany = React.useCallback((name) => { if (!name) return; setFocusCompany(name); setTab(MONITOR_TABS.includes(tab) && tab !== "applications" && !tab.startsWith("sales:") && tab !== "billing" ? tab : "companies"); }, [tab, setTab]);
  const clearFocus = React.useCallback(() => setFocusCompany(null), []);

  // 메뉴 배지(처리 대기 개수)
  const P = live?.pending;
  const badges = {
    applications: P ? P.transport.length + P.shipper.length : 0,
    inquiries: P ? P.inquiries.length : 0,
    payments: P ? P.planReqs.length : 0,
    support: P?.support ? P.support.length : 0, // ⭐ 2026-11-02 원격지원 —
  };
  const liveBadge = live?.ready ? live.totals.onlineNow : 0;
  const sectionsView = SECTIONS.map((s) => ({ ...s, items: s.items.map((it) => (it.key === "live" ? { ...it, badge: liveBadge, soft: true } : badges[it.key] ? { ...it, badge: badges[it.key] } : it)) }));
  const sectionView = sectionsView.find((s) => s.key === section.key) || sectionsView[0];
  const secBadge = (s) => s.items.reduce((a, it) => a + (it.key !== "live" && typeof it.badge === "number" ? it.badge : 0), 0);

  let body = null;
  if (MONITOR_TABS.includes(tab)) {
    body = (
      <PlatformMonitor bare tab={tab} onTab={setTab} onContract={(q) => openContract({ fromQuote: q })} focusCompany={focusCompany} onFocusDone={clearFocus} />
    );
  } else if (tab === "todo") body = <TodayPanel go={setTab} />;
  else if (tab === "live") body = <LiveTab openCompany={openCompany} />;
  // ⭐ 2026-11-02 원격지원 — 요청 목록 · 승인/거절/완료 · 화면 보기 · 원격 번호
  else if (tab === "support") body = <><Hero en="DASHBOARD · SUPPORT" title="원격 지원" desc="직원이 보낸 원격 지원 요청 — 승인하면 직원 화면을 실시간으로 보거나(화면 공유) 원격 프로그램 번호를 받습니다." right={<Clock />} /><RemoteSupportAdminPanel me={user} /></>;
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
  else if (tab === "tenancy") body = <TenancyPanel />;
  else if (tab === "sheetImport") body = <><Hero en="DATA · IMPORT" title="배차일지 가져오기" desc="구글시트·엑셀 배차일지를 운송사 데이터로 옮깁니다(초기 세팅용)." /><SheetImportPanel /></>;
  else if (tab === "companyReset") body = <><Hero en="DATA · RESET" title="운송사 초기화" desc="⚠ 운송사 데이터를 지웁니다 — 백업 후 신중히 사용하세요." /><CompanyResetPanel /></>;

  if (phone) return <PlatformMobileShell user={user} sections={sectionsView} section={sectionView} tab={tab} setTab={setTab} toApp={toApp} logout={logout} secBadge={secBadge}>{body}</PlatformMobileShell>;

  return (
    <div className="kp-pc kp-pcenter min-h-screen bg-[#EEF1F6]">
      <style>{PC_HEADER_CSS}</style>
      {/* ── 상단 바 ── ⭐ 2026-11-02 관리자센터: 메뉴 버튼 h-10 · 14px · 아이콘 · 처리 대기 배지 · 좁으면 가로 스크롤 */}
      <header className="kp-pc-head sticky top-0 z-40 h-16 flex items-center gap-3 px-4 2xl:px-6 text-white">
        <div className="flex items-center gap-2.5 shrink-0">
          <img src="/logo.png" alt="" className="w-9 h-9 rounded-[10px] bg-white object-contain p-0.5" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div className="leading-none">
            <div className="text-[16px] font-black tracking-[0.02em] whitespace-nowrap">KP-Flow</div>
            <div className="text-[9.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0] mt-1 whitespace-nowrap" style={{ fontFamily: MONO }}>PLATFORM ADMIN</div>
          </div>
        </div>
        <span className="hidden 2xl:block w-px h-7 bg-white/15 shrink-0" />
        <nav className="kp-pc-nav flex-1 min-w-0 flex items-center gap-1 overflow-x-auto">
          {sectionsView.map((s) => {
            const on = s.key === section.key;
            const b = secBadge(s);
            return (
              <button key={s.key} type="button" onClick={() => setTab(s.items[0].key)} aria-current={on ? "page" : undefined}
                className={`kp-pc-navbtn relative shrink-0 h-10 px-3.5 2xl:px-4 rounded-xl text-[14px] whitespace-nowrap inline-flex items-center gap-2 transition ${on ? "kp-on font-black" : "font-bold text-white/70 hover:text-white hover:bg-white/[0.09]"}`}>
                <ShellIcon name={s.icon} size={16} className={`hidden 2xl:block ${on ? "text-[#2D4C82]" : "text-[#8FB0F0]"}`} />
                {s.label}
                {b > 0 && <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black inline-flex items-center justify-center ${on ? "bg-[#1B2B4B] text-white" : "bg-white text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{b > 99 ? "99+" : b}</span>}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <HeaderLivePill onClick={() => setTab("live")} />
          <span className="hidden 2xl:inline-flex items-center gap-1.5 px-3 h-10 rounded-xl bg-white/[0.06] ring-1 ring-white/10"><Clock /></span>
          <button type="button" onClick={toApp} className="h-10 px-3.5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black whitespace-nowrap hover:bg-[#E9F0FC]" title="배차 프로그램으로 전환">배차 프로그램 ↗</button>
          <span className="hidden min-[1700px]:inline text-[12.5px] text-white/55 max-w-[180px] truncate">{user?.email}</span>
          <button type="button" onClick={logout} className="h-10 px-3.5 rounded-xl bg-white/10 ring-1 ring-white/15 text-[14px] font-black whitespace-nowrap hover:bg-white/20" title={user?.email || ""}>로그아웃</button>
        </div>
      </header>

      {/* ── 왼쪽 메뉴 + 본문 ── */}
      <div className="px-4 py-4">
        <KpSubNav code={sectionView.en} title={sectionView.label} icon={sectionView.icon} active={tab} onSelect={setTab} items={sectionView.items}>
          {body}
        </KpSubNav>
      </div>
    </div>
  );
}
const PC_HEADER_CSS = `
.kp-pcenter .kp-pc-head { background: radial-gradient(700px 120px at 30% -60px, rgba(75,108,183,.35), transparent 70%), linear-gradient(90deg,#0B1428 0%,#0F1A30 45%,#1B2B4B 100%); box-shadow: 0 1px 0 rgba(255,255,255,.06) inset, 0 8px 24px rgba(11,20,40,.28); }
.kp-pcenter .kp-pc-head::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(143,176,240,.5), transparent); pointer-events: none; }
.kp-pcenter .kp-pc-nav { scrollbar-width: none; mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent); }
.kp-pcenter .kp-pc-nav::-webkit-scrollbar { display: none; }
/* ⭐ 2026-11-02 관리자센터2 — 관리센터 전체 글자 키움. index.css가 text-[11px]→13 · [12px]→14 · [13px]→15 로 올리므로
   나머지(소수점·14px·KPI 숫자)만 여기서 한 단계씩 올린다 — 본문/표 ≥14.5px, 라벨 ≥13.5px, 작은 영문 코드 ≥11.5px */
.kp-pcenter .text-\\[10px\\] { font-size: 11.5px !important; }
.kp-pcenter .text-\\[10\\.5px\\] { font-size: 12px !important; }
.kp-pcenter .text-\\[11\\.5px\\] { font-size: 13px !important; }
.kp-pcenter .text-\\[12\\.5px\\] { font-size: 13.5px !important; }
.kp-pcenter .text-\\[13\\.5px\\] { font-size: 14.5px !important; }
.kp-pcenter main .text-\\[14px\\] { font-size: 15px !important; }
.kp-pcenter .text-\\[14\\.5px\\] { font-size: 15px !important; }
.kp-pcenter .text-xs { font-size: 13px !important; }
.kp-pcenter .text-sm { font-size: 14.5px !important; }
.kp-pcenter .text-\\[20px\\] { font-size: 22px !important; }
.kp-pcenter .text-\\[22px\\] { font-size: 25px !important; }
.kp-pcenter .text-\\[26px\\] { font-size: 30px !important; }
.kp-pcenter .text-\\[28px\\] { font-size: 32px !important; }
.kp-pcenter .kp-pc-navbtn.kp-on { background: linear-gradient(180deg,#FFFFFF 0%,#E9F0FC 100%); color: #0F1A30; box-shadow: 0 6px 16px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.6) inset, 0 0 18px rgba(143,176,240,.3); }
`;

// ═══════════════════════ 📱 모바일 관리센터 ═══════════════════════
//  PC와 같은 메뉴·화면을 폰 폭에 맞춰 보여준다.
//   · 상단: 로고 · 배차앱 전환 · 로그아웃 / 큰 메뉴(대시보드~보안) 가로 스크롤 / 속메뉴 가로 스크롤
//   · 본문: 글자 줄바꿈 없이(표는 가로 스크롤), 간격·글자 크기를 폰에 맞게 줄인다
const PM_MOBILE_CSS = `
.kp-pm { -webkit-text-size-adjust: 100%; }
.kp-pm .kp-pm-scroll { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.kp-pm .kp-pm-scroll::-webkit-scrollbar { display: none; }
.kp-pm main table { white-space: nowrap; }
.kp-pm main th, .kp-pm main td { white-space: nowrap; }
.kp-pm main table:not(.kp-pm-keep) { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.kp-pm main button, .kp-pm main label > span:first-child, .kp-pm main h1, .kp-pm main h2, .kp-pm main h3 { white-space: nowrap; }
.kp-pm main input, .kp-pm main select, .kp-pm main textarea { font-size: 16px !important; max-width: 100%; }
.kp-pm main .pm-tile, .kp-pm main .pm-tile-dark { padding: 12px 13px 11px !important; border-radius: 14px !important; }
.kp-pm main .pm-tile > div:first-child > span:last-child, .kp-pm main .pm-tile-dark > div:first-child > span:last-child { display: none; }
.kp-pm main .pm-tile span[style*="font-size: 32px"], .kp-pm main .pm-tile-dark span[style*="font-size: 32px"] { font-size: 23px !important; }
/* ⭐ 2026-11-02 관리자센터2 — 폰 글자 한 단계 키움(index.css가 11/12/13px은 이미 13/14/15px로 올림 → 나머지 소수점 크기만) */
.kp-pm .text-\\[10px\\] { font-size: 11px !important; }
.kp-pm .text-\\[10\\.5px\\] { font-size: 11.5px !important; }
.kp-pm .text-\\[11\\.5px\\] { font-size: 12.5px !important; }
.kp-pm .text-\\[12\\.5px\\] { font-size: 13.5px !important; }
.kp-pm .text-\\[13\\.5px\\] { font-size: 14px !important; }
.kp-pm main .text-xs { font-size: 13px !important; }
.kp-pm main .pm-tile > div:last-child, .kp-pm main .pm-tile-dark > div:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kp-pm main .pm-spark { display: none; } /* ⭐ 2026-11-02 관리자센터 — 폰 타일에선 스파크라인 숨김 */
.kp-pm main [class*="max-w-[1180px]"] { padding: 20px 16px !important; }
.kp-pm main .kp-contract h1 { white-space: normal; font-size: 20px !important; letter-spacing: .08em; }
.kp-pm main .kp-contract { font-size: 14px; }
.kp-pm main { word-break: keep-all; }
.kp-pm main [style*="min-width: 1220px"], .kp-pm main [style*="min-width: 960px"], .kp-pm main [style*="min-width: 820px"] { font-size: 13px; }
`;
// ⭐ 2026-11-02 관리자센터 — 버튼을 손가락 크기로(큰 메뉴 h-10·14px, 속메뉴 h-9·13.5px), 처리 대기 배지, 지금 접속 알약
function PlatformMobileShell({ user, sections = SECTIONS, section, tab, setTab, toApp, logout, secBadge = () => 0, children }) {
  const secRef = React.useRef(null);
  const subRef = React.useRef(null);
  // 고른 메뉴가 화면 밖이면 가운데로 끌어온다
  React.useEffect(() => {
    [secRef.current?.querySelector("[data-on='1']"), subRef.current?.querySelector("[data-on='1']")].forEach((el) => el?.scrollIntoView?.({ inline: "center", block: "nearest" }));
    window.scrollTo(0, 0);
  }, [tab]);
  return (
    <div className="kp-pm min-h-screen bg-[#EEF1F6]">
      <style>{PM_MOBILE_CSS}</style>
      <header className="sticky top-0 z-40 text-white shadow-[0_6px_18px_rgba(11,20,40,0.28)]" style={{ background: "linear-gradient(90deg,#0B1428 0%,#13213F 55%,#1B2B4B 100%)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="h-[56px] flex items-center gap-2 px-3">
          <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg bg-white object-contain p-0.5 shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          <div className="min-w-0 flex-1 leading-none">
            <div className="text-[14px] font-black whitespace-nowrap">관리자 관리센터</div>
            <div className="text-[9px] font-extrabold tracking-[0.26em] text-[#8FB0F0] mt-1 truncate whitespace-nowrap" style={{ fontFamily: MONO }}>{user?.email || "PLATFORM"}</div>
          </div>
          <HeaderLivePill phone onClick={() => setTab("live")} />
          <button type="button" onClick={toApp} className="shrink-0 h-9 px-2.5 rounded-[10px] bg-white text-[#0F1A30] text-[13px] font-black whitespace-nowrap">배차앱 ↗</button>
          <button type="button" onClick={logout} aria-label="로그아웃" className="shrink-0 h-9 w-9 rounded-[10px] bg-white/10 ring-1 ring-white/15 flex items-center justify-center" title="로그아웃">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
        <nav ref={secRef} className="kp-pm-scroll flex gap-1 overflow-x-auto px-3 pb-2">
          {sections.map((s) => {
            const on = s.key === section.key;
            const b = secBadge(s);
            return (
              <button key={s.key} type="button" data-on={on ? "1" : "0"} onClick={() => setTab(s.items[0].key)}
                className={`shrink-0 h-10 px-3.5 rounded-[11px] text-[14px] whitespace-nowrap transition inline-flex items-center gap-1.5 ${on ? "bg-white text-[#0F1A30] font-black" : "text-white/70 font-bold active:bg-white/10"}`}>
                {s.label}
                {b > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-black inline-flex items-center justify-center ${on ? "bg-[#1B2B4B] text-white" : "bg-white text-[#0F1A30]"}`}>{b > 99 ? "99+" : b}</span>}
              </button>
            );
          })}
        </nav>
      </header>
      <div ref={subRef} className="kp-pm-scroll sticky z-30 flex gap-1.5 overflow-x-auto px-3 py-2 bg-[#F7F9FC] border-b border-[#E3E8F0]" style={{ top: "calc(104px + env(safe-area-inset-top, 0px))" }}>
        {section.items.map((it) => {
          const on = it.key === tab;
          const hb = typeof it.badge === "number" && it.badge > 0;
          return (
            <button key={it.key} type="button" data-on={on ? "1" : "0"} onClick={() => setTab(it.key)}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[13.5px] font-black whitespace-nowrap border transition inline-flex items-center gap-1.5 ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>
              {it.label}
              {hb && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-black inline-flex items-center justify-center ${on ? "bg-white text-[#0F1A30]" : it.soft ? "bg-[#EEF2F8] text-[#1B2B4B]" : "bg-[#1B2B4B] text-white"}`}>{it.badge}</span>}
            </button>
          );
        })}
      </div>
      <main className="px-3 pt-3 pb-10 min-w-0 overflow-x-hidden" style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))" }}>{children}</main>
    </div>
  );
}


// ═══════════════════════ 진입 선택(/choose) ═══════════════════════
export function EntryChooser({ user }) {
  const navigate = useNavigate();
  const go = (k) => { try { sessionStorage.setItem("kpEntry", k); } catch { /* 무시 */ } navigate(k === "platform" ? "/platform" : "/app", { replace: true }); };
  const Item = ({ k, en, title, desc, points, primary }) => (
    <button type="button" onClick={() => go(k)}
      className={`group text-left rounded-[22px] sm:rounded-[26px] p-5 sm:p-7 transition relative overflow-hidden border ${primary ? "border-[#8FB0F0]/40" : "border-white/10"} hover:-translate-y-1 hover:border-[#8FB0F0]/70`}
      style={{ background: primary ? "linear-gradient(150deg, rgba(75,108,183,.45), rgba(27,43,75,.35))" : "rgba(255,255,255,.04)" }}>
      <div className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO }}>{en}</div>
      <div className="text-[21px] sm:text-[26px] font-black text-white mt-1 sm:mt-1.5 whitespace-nowrap">{title}</div>
      <div className="text-[12.5px] sm:text-[14px] text-white/60 mt-1 leading-relaxed whitespace-nowrap truncate">{desc}</div>
      <ul className="mt-3.5 sm:mt-5 grid grid-cols-1 gap-y-1 sm:gap-y-1.5">{points.map((p) => <li key={p} className="flex items-center gap-2 min-w-0 text-[12px] sm:text-[13.5px] font-semibold text-white/80"><span className="w-1.5 h-1.5 rotate-45 bg-[#8FB0F0] shrink-0" /><span className="truncate whitespace-nowrap">{p}</span></li>)}</ul>
      <div className="mt-4 sm:mt-6 flex sm:inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black group-hover:gap-3 transition-all whitespace-nowrap">들어가기 <span>→</span></div>
    </button>
  );
  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-5 py-6 sm:py-10 text-white"
      style={{ background: "linear-gradient(rgba(143,176,240,.05) 1px, transparent 1px) 0 0/30px 30px, linear-gradient(90deg, rgba(143,176,240,.05) 1px, transparent 1px) 0 0/30px 30px, radial-gradient(900px 400px at 80% -10%, rgba(75,108,183,.45), transparent 60%), linear-gradient(160deg,#0B1428 0%,#111F3B 55%,#0E1830 100%)" }}>
      <div className="w-full max-w-[980px]">
        <div className="flex items-end justify-between gap-3 mb-5 sm:mb-8">
          <div className="min-w-0">
            <div className="text-[10px] sm:text-[11.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO }}>KP-FLOW · SELECT WORKSPACE</div>
            <div className="text-[24px] sm:text-[32px] font-black tracking-tight mt-1 whitespace-nowrap">어디로 들어갈까요?</div>
            <div className="text-[12px] sm:text-[14.5px] text-white/55 mt-1 truncate whitespace-nowrap">{user?.email}<span className="hidden sm:inline"> · 최고관리자 계정은 매번 들어갈 곳을 고릅니다.</span></div>
          </div>
          <div className="shrink-0 px-2.5 sm:px-3 h-9 sm:h-10 rounded-xl bg-white/[0.06] ring-1 ring-white/10 flex items-center"><Clock /></div>
        </div>
        <div className="grid md:grid-cols-2 gap-3 sm:gap-5">
          <Item k="platform" primary en="PLATFORM CONTROL" title="관리자 관리센터" desc="이 프로그램 플랫폼을 운영하는 화면입니다." points={["가입사 관제 · 사용량 · 건강도", "요금제 · 견적 · 전자계약", "청구 · 수납 · 플랫폼 공지", "로그인 관리 · 접속 이력 · 데이터"]} />
          <Item k="app" en="DISPATCH WORKSPACE" title="배차 프로그램" desc="운송사 화면으로 들어가 실제 배차 업무를 봅니다." points={["배차관리 · 실시간 배차현황", "매출 · 정산 · 회사관리", "고객사 화면 점검 · 지원", "로그인 때 고른 회사로 진입"]} />
        </div>
        <div className="mt-4 sm:mt-6 text-center text-[11px] sm:text-[12px] text-white/35 whitespace-nowrap" style={{ fontFamily: MONO }}>들어간 뒤에도 언제든 전환할 수 있습니다</div>
      </div>
    </div>
  );
}
