// ======================= src/PlatformCenter.jsx =======================
// 🛰 관리자 관리센터(/platform, 2026-10-29) — 최고관리자 전용 "플랫폼 운영" 화면.
//  배차 프로그램 안에 있던 관리센터를 통째로 옮기고(디자인 그대로), 운영에 필요한 메뉴를 더했다.
//   · 상단 메뉴(대시보드 · 고객사 · 영업 · 계약 · 청구 · 운영 · 데이터) + 왼쪽 메뉴(KpSubNav)
//   · 새로 추가: 오늘 할 일, 도입 문의, 계약(전자서명), 수납 관리, 플랫폼 공지, 접속 이력, 로그인 관리
//  최고관리자가 로그인하면 /choose 에서 "배차 프로그램 / 관리자 관리센터" 중 고른다.
//  🛰 2026-11-18 전면 리디자인 — 어두운 디지털 + 샴페인 골드(대표/임원 화면과 같은 결) · 메뉴 정리(아래 SECTIONS 주석)
import Pager, { pageCount, pageSlice } from "./Pager";
import { markUpdatesNoticed } from "./UpdateDigest"; // 📝 2026-11-09 업데이트 보관함(AI 작성함)
import { runDelete } from "./DeleteProgress"; // ⭐ 2026-11-05 삭제 진행 창 + 한 번에 삭제
import React from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, deleteField, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { auth, db, FUNCTIONS_BASE } from "./firebase";
import { pushTenantBypass } from "./fsTenant";
import KpSubNav from "./KpSubNav";
import PlatformMonitor, { estimateBill, usePhone } from "./PlatformMonitor";
// ⭐ 2026-11-02 관리자센터 — 실시간 계정·접속 층 + 운영 위젯
import { useHelpAcks, helpNeededList, ackHelpNeeded } from "./helpNeeded"; // 🆘 2026-11-09 신규 운송사 "도움 필요"
import { PlatformLiveProvider, usePlatformLive, mergeCompanies, LiveNowPanel, SignupTimeline, DupeWarning, HeaderLivePill, Panel as LivePanel, normCo } from "./PlatformLive";
import { ShellIcon } from "./AdminShell";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useSalesPricing, applyPlanBill, planUsageOf, ADDON_CATALOG, ADDON_KIND_LABEL, addonRate, itemsTotal, billLines } from "./SalesQuote";
import { ContractBuilder, ContractList, ContractTemplates } from "./ContractCenter";
import { NotifTemplatePanel, LandingPageEditPanel, ShipperForceUpdatePanel } from "./AdminMenu";
import { AdminSessionsPanel } from "./LoginManager";
import CompanyResetPanel from "./CompanyResetPanel";
const SecurityEventsPanel = React.lazy(() => import("./SecurityEventsPanel")); // 🛡 2026-11-09 보안 알림
const ErrorReportsPanel = React.lazy(() => import("./ErrorReportsPanel")); // 🧯 2026-11-10 오류 신고([오류 보내기])
const TestSeedPanel = React.lazy(() => import("./TestSeedPanel"));
const BrandStudioLazy = React.lazy(() => import("./BrandStudio")); // 🎨 2026-11-15 브랜드 디자인
const MobilePreviewPanelLazy = React.lazy(() => import("./MobilePreviewFrame").then((m) => ({ default: m.MobilePreviewPanel }))); // 📱 2026-11-14 관리센터 › 운영 › 모바일 화면
import ReleasePanel from "./ReleasePanel"; // 🚦 업데이트 배포 잠금
import { ContractLifecyclePanel, SubAdminPanel } from "./ContractLifecycle"; // ⭐ 2026-11-06 이용 계약 · 부관리자
import SheetConnectHub from "./SheetConnectHub"; // 🧹 2026-11-15 관리자메뉴 › 구글시트 연동을 관리센터로 합침(배차일지 가져오기 포함)
import NoticeBoard from "./NoticeBoard";
import { toBoardNotice } from "./PlatformNoticeBanner";
import { compressImage } from "./InternalMail";
const PrivateFareAdminLazy = React.lazy(() => import("./adminCenter/PrivateFareAdmin")); // 🔐 2026-11-18 비공개 운임 지정
const HomepageEditor = React.lazy(() => import("./HomepageEditor")); // ⭐ 2026-11-03 소개 홈페이지 편집기
// 📣 2026-11-23 홍보 — 영상 편집실 · 블로그 원고 · 홍보 설정(src/promo/)
const PromoVideo = React.lazy(() => import("./promo/PromoHub").then((m) => ({ default: m.PromoVideo })));
const PromoBlog = React.lazy(() => import("./promo/PromoHub").then((m) => ({ default: m.PromoBlog })));
const PromoSettings = React.lazy(() => import("./promo/PromoSettings"));
const HubMembersAdmin = React.lazy(() => import("./HubMembersAdmin")); // ⭐ 2026-11-06 허브 회원 승인
const CostPanel = React.lazy(() => import("./CostPanel"));
const IntegrationSettings = React.lazy(() => import("./IntegrationSettings")); // 🔌 2026-11-07 연동 설정 // 💰 2026-11-04 비용 · 손익(최고관리자 전용)
import { AiHq, AI_TEAM_TABS } from "./AiTeamPanel"; // 🤖 2026-11-06 AI 팀 · 2026-11-18 AI 본부
// 🛰 2026-11-18 관리자센터 리디자인 — 어두운 골드 부품 · 새 화면(관제 · 트래픽 · 운송사 사용량 · 운영 비용)
import { G, NUM, ADM_CSS, AdmHero, AdmPanel, AdmClock, AdmBtn, AdmEmpty, Seg } from "./adminCenter/admUi";
import { CommandDeck, TrafficView, CarrierUsageView, WalletView } from "./adminCenter/OpsScreens";
import { isAdminDemo } from "./adminCenter/useOpsData";
import AdminSearch, { adminSearchEntries } from "./adminCenter/AdminSearch"; // 🔎 2026-11-20 상단 메뉴 검색
const DEMO_STATS = () => (isAdminDemo() ? window.__kpAdminDemoStats || null : null); // 개발 /preview-admin 화면 점검용
import { RemoteSupportAdminPanel } from "./RemoteSupport"; // ⭐ 2026-11-02 원격지원 —
import { CustomSelect } from "./CustomSelect";
import { RichTextEditor, htmlToText, textToHtml, sanitizeHtml } from "./richText"; // ⭐ 2026-11-03 공지 글자 꾸미기
import CustomDatePicker from "./CustomDatePicker";
import { TimeSelect, MonthPicker } from "./kpInputs"; // 📅 2026-11-07 월 선택은 프로그램 달력으로
import "./pcTheme.css";
import { fmtPhone } from "./formatInput";
import { LogisMark, LogisWordmark, LogisTag } from "./brand"; // 🔷 2026-11-04 LogisWeb 로고
import { kpConfirm, kpPrompt } from "./kpDialog";
import { withinAccessLogWindow, ACCESS_LOG_DAYS, deleteAllDocs } from "./accessLogRetention";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ─── 메뉴 구성 ───
// 🛰 2026-11-18 관리자센터 전면 재구성(사용자 요청) — 9묶음 41메뉴 → 8묶음 24메뉴.
//  같은 일을 하는 메뉴는 한 메뉴 안의 작은 탭(SUBTABS)으로 합쳤다. 예전 메뉴 주소(tab 키)는 모두 그대로 열린다.
//   · 관제: 관제 대시보드(새로 · 플랫폼 개요를 "고객사 실적" 탭으로) · 오늘 할 일 · 실시간 트래픽(실시간 접속 + 서버 트래픽) · 원격 지원
//   · AI 본부: AI 팀 개요 + 팀 6개 메뉴 → 메뉴 하나(화면 안 명단에서 팀 고르기)
//   · 고객사: 가입신청관리 + 허브 회원 승인 → 가입 심사
//   · 사용량 · 비용(새 묶음): 운송사 사용량(새 시각화 + 사용량·한도 + 문자·알림톡) · 운영 비용(내 주머니 + 비용·손익)
//   · 영업 · 계약: 영업 + 계약 묶음 합침 · 견적서 작성 + 견적 이력 → 견적 · 계약 현황 + 작성 + 양식 → 계약
//   · 청구 · 수납: 요금제 · 요금·청구 · 수납 관리
//   · 운영: 플랫폼 공지 + 알림 문구 → 공지 · 알림 문구 · 브랜드 디자인 + 홈페이지 + 로그인 화면 꾸미기 → 브랜드 · 화면
//   · 보안 · 데이터: 보안 + 데이터 묶음 합침 · 로그인 관리 + 접속 이력 → 로그인 · 접속 · 보안 알림 + 오류 신고 → 보안 · 오류 알림 · 운송사 분리 + 초기화 → 운송사 분리 · 초기화
const SUBTABS = {
  command: [["command", "운영 관제"], ["overview", "고객사 실적"]],
  applications: [["applications", "운송사 · 화주사"], ["hubMembers", "허브 회원"]],
  usage: [["usage", "한눈에 보기"], ["usage:limits", "한도 · 초과 요금표"], ["msgUsage", "문자 · 알림톡"]],
  cost: [["cost", "내 주머니"], ["cost:pnl", "손익 · 원가 상세"]],
  "sales:quote": [["sales:quote", "견적서 작성"], ["sales:history", "견적 이력"]],
  "contract:list": [["contract:list", "계약 현황"], ["contract:new", "계약서 작성"], ["contract:templates", "계약서 양식"]],
  notices: [["notices", "플랫폼 공지"], ["notifTemplate", "알림 문구"]],
  brand: [["brand", "브랜드 디자인"], ["homepage", "홈페이지"], ["landingEdit", "로그인 화면"]],
  sessions: [["sessions", "로그인 관리"], ["sessionLogs", "접속 이력"]],
  securityEvents: [["securityEvents", "보안 알림"], ["errorReports", "오류 신고"]],
  tenancy: [["tenancy", "운송사 분리"], ["companyReset", "운송사 초기화"]],
};
// 휴대폰에서는 쓸 수 없어 숨기는 화면(넓은 화면 편집기 · 휴대폰 미리보기)
const PHONE_HIDE = new Set(["homepage", "brand", "mobilePreview", "mkt:video"]); // 📣 영상 편집실은 넓은 화면에서만
const it = (key, label, en, icon, extra = {}) => ({ key, label, en, icon, also: (SUBTABS[key] || []).map(([k]) => k).filter((k) => k !== key), ...extra });
const SECTIONS = [
  { key: "command", label: "관제", en: "COMMAND", icon: "pulse", items: [
    it("command", "관제 대시보드", "DASHBOARD", "pulse"),
    it("todo", "오늘 할 일", "TODAY", "check"),
    it("live", "실시간 트래픽", "LIVE TRAFFIC", "users"),
    it("support", "원격 지원", "SUPPORT", "phone"),
  ] },
  { key: "aiteam", label: "AI 본부", en: "AI HQ", icon: "spark", items: AI_TEAM_TABS }, // 🤖 2026-11-06 팀별 Claude 에이전트
  { key: "clients", label: "고객사", en: "CLIENTS", icon: "building", items: [
    it("companies", "운송사 관제", "CARRIERS", "building"),
    it("shippers", "화주사 관제", "SHIPPERS", "link"),
    it("applications", "가입 심사", "APPROVALS", "inbox"),
  ] },
  { key: "usagecost", label: "사용량 · 비용", en: "USAGE & COST", icon: "server", items: [
    it("usage", "운송사 사용량", "USAGE", "chart"),
    it("cost", "운영 비용", "OUT OF POCKET", "wallet"),
  ] },
  { key: "sales", label: "영업 · 계약", en: "SALES & CONTRACTS", icon: "trend", items: [
    it("inquiries", "도입 문의", "LEADS", "mail"),
    it("sales:quote", "견적", "QUOTATION", "file"),
    it("contract:list", "계약", "CONTRACTS", "pen"),
    it("contract:life", "이용 기간 · 만료", "LIFECYCLE", "hourglass"),
  ] },
  // 📣 2026-11-23 홍보(사용자 요청) — 관리자센터에서 영상 · 블로그 글을 고치고 미리 보고 만들고 올린다
  { key: "promo", label: "홍보", en: "MARKETING", icon: "send", items: [
    it("mkt:video", "영상 편집실", "VIDEO EDITOR", "star"),
    it("mkt:blog", "블로그 원고", "BLOG", "pen"),
    it("mkt:settings", "홍보 설정", "PROMO SETTINGS", "key"),
  ] },
  { key: "billing", label: "청구 · 수납", en: "BILLING", icon: "money", items: [
    it("sales:plans", "요금제", "PRICING", "sheet"),
    it("billing", "요금 · 청구", "BILLING", "receipt"),
    it("payments", "수납 관리", "COLLECTION", "money"),
  ] },
  { key: "ops", label: "운영", en: "OPERATIONS", icon: "cpu", items: [
    it("release", "업데이트 배포", "RELEASE", "key"),
    it("notices", "공지 · 알림 문구", "BROADCAST", "bell"),
    it("integrations", "연동 설정", "INTEGRATIONS", "link"),
    it("brand", "브랜드 · 화면", "BRAND", "star"),
    it("mobilePreview", "모바일 화면", "MOBILE", "phone"),
  ] },
  { key: "security", label: "보안 · 데이터", en: "SECURITY & DATA", icon: "shield", items: [
    it("sessions", "로그인 · 접속", "SESSIONS", "key"),
    it("securityEvents", "보안 · 오류 알림", "THREATS", "alert"),
    it("subAdmin", "부관리자", "SUB ADMIN", "user"),
    it("privateFare", "비공개 운임", "PRIVATE FARE", "eye"), // 🔐 2026-11-18 운송사 · 사람별 비공개 운임 지정
    it("sheetImport", "구글시트 연동", "SHEETS", "sheet"),
    it("tenancy", "운송사 분리 · 초기화", "ISOLATION", "shield"),
    it("testSeed", "테스트 데이터", "TEST DATA", "list"),
  ] },
];
// 예전 메뉴 이름(이 기기에 기억된 마지막 화면) → 지금 자리
const TAB_ALIAS = { forceUpdate: "release", "ai:overview": "ai:hub" };
const itemOf = (tab) => SECTIONS.flatMap((s) => s.items).find((i) => i.key === tab || (i.also || []).includes(tab));
const sectionOf = (tab) => SECTIONS.find((s) => s.items.some((i) => i.key === tab || (i.also || []).includes(tab))) || SECTIONS[0];
const MONITOR_TABS = ["overview", "companies", "shippers", "applications", "billing", "sales:plans", "sales:quote", "sales:history"];

// ─── 공용 부품 ───
// 🛰 2026-11-18 관리자센터 리디자인 — 카드 · 머리는 어두운 골드 부품(src/adminCenter/admUi.jsx)으로
function Card({ code, title, right, children, bodyClass = "p-5" }) {
  return <AdmPanel code={code} title={title} right={right} bodyClass={bodyClass}>{children}</AdmPanel>;
}
function Hero({ en, title, desc, right }) {
  return <AdmHero en={en} title={title} desc={desc} right={right} />;
}
function Clock() { return <AdmClock />; }
function useCol(name, order = "createdAt", n = 300) {
  const [list, setList] = React.useState(null);
  React.useEffect(() => onSnapshot(order ? query(collection(db, name), orderBy(order, "desc"), limit(n)) : query(collection(db, name), limit(n)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setList([])), [name, order, n]);
  return list;
}
const msOf = (v) => (v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : typeof v === "number" ? v : 0);

// ═══════════════════════ 💬 문자 · 알림톡 사용량(2026-11-10) ═══════════════════════
//  팝빌은 로지스웹이 한꺼번에 내고, 운송사별 월 사용량(messageUsage — 서버가 셈)에 단가를 곱해 월말에 청구한다
//  단가: platformConfig/messagePricing { sms, lms, alimtalk }(원 · 부가세 별도) — 운송사 화면 "이번 달 예상 청구액"도 이 값
function MessageUsagePanel() {
  const [ym, setYm] = React.useState(() => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7));
  const [rows, setRows] = React.useState(null);
  const [price, setPrice] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => onSnapshot(query(collection(db, "messageUsage"), where("month", "==", ym)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), [ym]);
  React.useEffect(() => onSnapshot(doc(db, "platformConfig", "messagePricing"), (s) => setPrice(s.exists() ? s.data() : {}), () => setPrice({})), []);
  const P = { sms: Number(price?.sms ?? 20), lms: Number(price?.lms ?? 50), alimtalk: Number(price?.alimtalk ?? 15) };
  const v = draft || P;
  const shift = (n) => { const [y, m] = ym.split("-").map(Number); setYm(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)); };
  const list = (rows || []).map((r) => ({ ...r, sms: Number(r.sms) || 0, lms: Number(r.lms) || 0, alimtalk: Number(r.alimtalk) || 0 }))
    .map((r) => ({ ...r, amount: r.sms * P.sms + r.lms * P.lms + r.alimtalk * P.alimtalk })).sort((a, b) => b.amount - a.amount);
  const sum = list.reduce((a, r) => ({ sms: a.sms + r.sms, lms: a.lms + r.lms, alimtalk: a.alimtalk + r.alimtalk, amount: a.amount + r.amount }), { sms: 0, lms: 0, alimtalk: 0, amount: 0 });
  const savePrice = async () => { await setDoc(doc(db, "platformConfig", "messagePricing"), { sms: Number(v.sms) || 0, lms: Number(v.lms) || 0, alimtalk: Number(v.alimtalk) || 0, updatedAt: serverTimestamp() }, { merge: true }); setDraft(null); setMsg("단가를 저장했어요"); };
  const csv = () => {
    const head = ["운송사", "월", "단문", "장문", "알림톡", "청구액(원·부가세 별도)"];
    const lines = [head, ...list.map((r) => [r.company, ym, r.sms, r.lms, r.alimtalk, Math.round(r.amount)])].map((l) => l.join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + lines], { type: "text/csv" })); a.download = `문자알림톡사용량_${ym}.csv`; a.click();
  };
  const cell = "px-3 py-2.5 border-b border-[#EEF1F6] text-[13.5px] tabular-nums";
  return (
    <>
      <Hero en="BILLING · MESSAGES" title="문자 · 알림톡 사용량" desc="팝빌은 로지스웹이 내고, 운송사별 사용량에 단가를 곱해 월말에 청구해요"
        right={<div className="flex gap-2"><div className="rounded-2xl bg-white/[0.08] border border-white/10 px-3.5 py-2"><div className="text-[11.5px] text-white/55 font-bold">{ym.replace("-", ".")} 청구 합계</div><div className="text-[20px] font-black tabular-nums">{Math.round(sum.amount).toLocaleString()}원</div></div></div>} />
      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-3 items-start">
        <div className="rounded-2xl bg-white border border-[#E3E8F0] p-4 space-y-3" data-kp="msg-price">
          <div className="text-[10.5px] font-extrabold tracking-[0.22em] text-[#9AA9C3]">UNIT PRICE · 원 · 부가세 별도</div>
          {[["sms", "단문(SMS)"], ["lms", "장문(LMS)"], ["alimtalk", "알림톡"]].map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><span className="w-[78px] shrink-0 whitespace-nowrap text-[13px] font-bold text-[#3A4A66]">{l}</span>
              <input inputMode="numeric" value={String(v[k] ?? "")} onChange={(e) => { setDraft({ ...v, [k]: e.target.value.replace(/[^\d.]/g, "") }); setMsg(""); }} className="flex-1 min-w-0 w-full h-9 px-3 rounded-lg border border-[#DCE3EE] text-[14px] font-black text-right tabular-nums" />
              <span className="text-[12.5px] text-[#7A8AA6]">원</span></label>
          ))}
          <button type="button" disabled={!draft} onClick={savePrice} className="w-full h-10 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-40">단가 저장</button>
          <div className="text-[12px] text-[#7A8AA6] leading-relaxed">운송사 회사정보 › 문자 보내기의 "이번 달 예상 청구액"에도 이 단가가 쓰여요. 팝빌 원가는 팝빌 › 요금 안내에서 확인하세요.</div>
          {msg && <div className="text-[12.5px] font-bold text-[#2D4C82]">{msg}</div>}
        </div>
        <div className="rounded-2xl bg-white border border-[#E3E8F0] overflow-hidden min-w-0">
          <div className="px-4 py-3 flex items-center gap-2 border-b border-[#EEF1F6]">
            <span className="inline-flex items-center h-9 rounded-lg border border-[#E3E8F0] overflow-hidden"><button type="button" onClick={() => shift(-1)} className="w-9 h-full font-black text-[#1B2B4B]">‹</button><span className="px-1 text-[13.5px] font-black tabular-nums">{ym.replace("-", ".")}</span><button type="button" onClick={() => shift(1)} className="w-9 h-full font-black text-[#1B2B4B]">›</button></span>
            <span className="text-[12.5px] font-bold text-[#7A8AA6]">{list.length}개 운송사</span>
            <button type="button" onClick={csv} disabled={!list.length} className="ml-auto h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B] disabled:opacity-40">엑셀(CSV)</button>
          </div>
          <table className="w-full border-separate border-spacing-0">
            <thead><tr>{["운송사", "단문", "장문", "알림톡", "청구액"].map((h, i) => <th key={h} className={`text-[11.5px] font-extrabold text-[#7A8AA6] px-3 py-2.5 bg-[#F8FAFC] border-b border-[#E3E8F0] ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={5} className="py-12 text-center text-[13px] text-[#9AA9C3]">불러오는 중…</td></tr>}
              {rows && !list.length && <tr><td colSpan={5} className="py-12 text-center text-[13px] text-[#9AA9C3]">이 달에 보낸 문자 · 알림톡이 없어요</td></tr>}
              {list.map((r) => (
                <tr key={r.id}><td className={`${cell} font-black`}>{r.company}</td><td className={`${cell} text-right`}>{r.sms.toLocaleString()}</td><td className={`${cell} text-right`}>{r.lms.toLocaleString()}</td><td className={`${cell} text-right`}>{r.alimtalk.toLocaleString()}</td><td className={`${cell} text-right font-black`}>{Math.round(r.amount).toLocaleString()}원</td></tr>
              ))}
              {list.length > 0 && <tr className="bg-[#F8FAFC]"><td className={`${cell} font-black`}>합계</td><td className={`${cell} text-right font-black`}>{sum.sms.toLocaleString()}</td><td className={`${cell} text-right font-black`}>{sum.lms.toLocaleString()}</td><td className={`${cell} text-right font-black`}>{sum.alimtalk.toLocaleString()}</td><td className={`${cell} text-right font-black`}>{Math.round(sum.amount).toLocaleString()}원</td></tr>}
            </tbody>
          </table>
          <div className="px-4 py-3 text-[12px] text-[#7A8AA6]">수납 관리에서 이 달 청구서를 만들 때 위 금액을 "문자 · 알림톡" 항목으로 더해 주세요.</div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════ 오늘 할 일 ═══════════════════════
function TodayPanel({ go, openCompany }) {
  const live = usePlatformLive(); // ⭐ 2026-11-02 관리자센터 — 운송사 가입 승인 대기 · 직원 승인 대기 · 비슷한 회사명
  const quotes = useCol("salesQuotes");
  const contracts = useCol("contracts");
  const inquiries = useCol("landingInquiries");
  const planReqs = useCol("planRequests");
  const secEvents = useCol("securityEvents", "atMs", 100); // 🛡 2026-11-09 확인 안 한 보안 알림(높음·보통)
  const errReports = useCol("errorReports", "createdAt", 50); // 🧯 2026-11-10 처리 안 한 오류 신고
  const invoices = useCol("platformInvoices", null);
  const [apps, setApps] = React.useState([]);
  React.useEffect(() => onSnapshot(collection(db, "companyApplications"), (s) => setApps(s.docs.map((d) => d.data())), () => {}), []);
  // 🆘 2026-11-09 도움 필요 — 가입 7일 안 신규 운송사 중 오더 0건 · 기사 0명 · 직원 1명뿐
  const [pStats, setPStats] = React.useState(null);
  React.useEffect(() => onSnapshot(doc(db, "siteConfig", "platformStats"), (x) => setPStats(x.exists() ? x.data() : {}), () => setPStats({})), []);
  const helpAcks = useHelpAcks();
  const helpList = React.useMemo(() => (pStats ? helpNeededList(mergeCompanies(pStats.companies, live), Date.now(), helpAcks) : []), [pStats, live, helpAcks]);
  const today = ymd();
  const soonLimit = (() => { const d = new Date(); d.setMonth(d.getMonth() + 2); return ymd(d); })();
  const tasks = [
    // ⭐ 2026-11-02 원격지원 — 직원의 원격 지원 요청(승인 대기)을 맨 위에
    ...(live?.pending.support || []).map((r) => ({ code: "HELP", text: `${normCo(r.companyName) || "운송사"} ${r.name || ""} 원격 지원 요청`, sub: `${r.method === "remote" ? "원격 프로그램" : "화면 공유"} · ${String(r.message || "").slice(0, 40)}`, to: "support", lv: 3 })),
    ...(secEvents || []).filter((e) => !e.ack && (e.level === "high" || e.level === "medium")).slice(0, 5).map((e) => ({ code: "SEC", text: `보안 알림 — ${e.company || "-"} ${e.name || e.email || ""} · ${({ new_device: "새 기기 로그인", foreign_ip: "해외 IP 접속", night_login: "새벽 접속", bulk_download: "대량 다운로드" })[e.type] || e.type}`, sub: e.detail || "", to: "securityEvents", lv: e.level === "high" ? 1 : 2 })),
    ...(errReports || []).filter((r) => r.status !== "done").slice(0, 5).map((r) => ({ code: "ERR", text: `오류 신고 ${String(r.id).slice(0, 6).toUpperCase()} — ${r.companyName || "-"} ${r.name || r.email || ""} · ${r.section || ""}`, sub: String(r.message || "").slice(0, 60), to: "errorReports", lv: 2 })),
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
            <div className="text-[26px] font-black mt-0.5" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v}<span className={`text-[13px] ml-1 ${i === 3 ? "text-white/50" : "text-[#9AA9C3]"}`}>{u}</span></div>
          </div>
        ))}
      </div>
      {helpList.length > 0 && (
        <Card code="HELP" title={`도움 필요 ${helpList.length}곳 — 가입 7일 안인데 아직 쓰기 시작을 못 한 운송사`} bodyClass="p-2">
          {helpList.map(({ c, h }) => (
            <div key={c.name} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F5F8FD] flex-wrap">
              <span className="w-16 shrink-0 text-center py-1 rounded-md text-[10.5px] font-extrabold tracking-[0.12em] bg-[#B42318] text-white" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>HELP</span>
              <span className="flex-1 min-w-[220px]">
                <span className="block text-[14.5px] font-black text-[#0F1A30] truncate">{c.name} 가입 {h.day}일째 · {h.reasons.join(" · ")} — 먼저 연락해 보세요</span>
                <span className="block text-[12px] text-[#7A89A3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>대표 {c.rep || "-"} · {c.phone || "연락처 없음"} · 직원 {h.staff} · 기사 {h.drivers} · 오더 {h.orders}</span>
              </span>
              {c.phone && <a href={`tel:${String(c.phone).replace(/[^\d]/g, "")}`} className="h-9 px-3 rounded-lg bg-[#0F1A30] text-white text-[13px] font-black inline-flex items-center">📞 전화</a>}
              <button type="button" onClick={() => (openCompany ? openCompany(c.name) : go("companies"))} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#1B2B4B]">상세</button>
              <button type="button" onClick={() => ackHelpNeeded(c.name).catch((e) => window.alert(e.message))} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[13px] font-black text-[#5B6B85]">확인함</button>
            </div>
          ))}
          <div className="px-3 pb-2 text-[11.5px] text-[#9AA9C3]">오더 수는 서버 집계(매일 새벽 · 대시보드 [지금 갱신]) 기준입니다. [확인함]을 누르면 이 목록에서 숨깁니다.</div>
        </Card>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
      <Card code="QUEUE" title={`처리할 일 ${tasks.length}건`} bodyClass="p-2">
        {tasks.length === 0 ? <div className="py-14 text-center text-[#9AA9C3]">지금 처리할 일이 없습니다 ✓</div> : tasks.map((t, i) => (
          <button key={i} type="button" onClick={() => go(t.to)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F5F8FD] text-left">
            <span className={`w-16 shrink-0 text-center py-1 rounded-md text-[10.5px] font-extrabold tracking-[0.12em] ${t.lv >= 2 ? "bg-[#0F1A30] text-white" : t.lv === 1 ? "bg-[#DCE6F7] text-[#1B2B4B]" : "border border-[#DCE3EE] text-[#5B6B85]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{t.code}</span>
            <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-black text-[#0F1A30] truncate">{t.text}</span>{t.sub && <span className="block text-[12px] text-[#7A89A3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{t.sub}</span>}</span>
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
// 📝 2026-11-20 홈페이지 문의 폼 업그레이드 — 한 폼에서 "무료체험 / 도입문의"를 골라 들어온다
//  · 광고 수신 동의(marketingConsent)한 곳만 소식 메일 · 문자를 보낼 수 있다(정보통신망법 제50조) → 따로 걸러 보고 이메일을 복사
const LEAD_FILTERS = [["all", "전체"], ["무료체험", "무료체험"], ["도입문의", "도입문의"], ["mkt", "광고 수신 동의"]];
const leadType = (q) => (q.type === "도입문의" ? "도입문의" : q.type === "무료체험" ? "무료체험" : "");
const leadSource = (s) => !s ? "" : [s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean).join(" · ") || (s.referrer ? s.referrer.replace(/^https?:\/\//, "").split("/")[0] : "") || "직접 방문";
function InquiriesPanel({ toQuote }) {
  const all = useCol("landingInquiries");
  const [sel, setSel] = React.useState(null);
  const [filter, setFilter] = React.useState("all");
  const [copied, setCopied] = React.useState("");
  if (!all) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const list = all.filter((q) => filter === "all" ? true : filter === "mkt" ? q.marketingConsent === true : leadType(q) === filter);
  const mktEmails = [...new Set(all.filter((q) => q.marketingConsent === true && q.email).map((q) => q.email.trim()))];
  const copyEmails = async () => {
    try { await navigator.clipboard.writeText(mktEmails.join(", ")); setCopied(`이메일 ${mktEmails.length}개를 복사했어요`); }
    catch { setCopied("복사하지 못했어요. 다시 눌러 주세요"); }
    setTimeout(() => setCopied(""), 2500);
  };
  const cur = all.find((x) => x.id === sel);
  return (
    <div className="space-y-4">
      <Hero en="CLIENTS · LEADS" title="도입 문의" desc="홈페이지로 들어온 문의를 상담 단계별로 관리하고, 바로 견적서로 넘깁니다." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <Card code="INBOX" title={`문의 ${list.length}건`} bodyClass="p-0">
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 border-b border-[#EEF1F6]">
            {LEAD_FILTERS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`h-8 px-3 rounded-lg text-[12.5px] font-black border ${filter === k ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#3A4A66]"}`}>{l}</button>))}
            {filter === "mkt" && (
              <button type="button" onClick={copyEmails} disabled={!mktEmails.length} className="ml-auto h-8 px-3 rounded-lg text-[12.5px] font-black bg-[#0F1A30] text-white disabled:opacity-40" title="광고 수신에 동의한 곳의 이메일만 복사해요. 보낼 때 제목에 (광고)를 붙이고 수신거부 방법을 넣어 주세요.">{copied || `동의한 이메일 복사 (${mktEmails.length})`}</button>)}
          </div>
          {list.length === 0 ? <div className="py-16 text-center text-[#9AA9C3]">들어온 도입 문의가 없습니다.</div> : (
            <div className="overflow-x-auto"><table className="w-full text-[14px] whitespace-nowrap">
              <thead><tr className="bg-[#1B2B4B] text-white">{["회사", "담당자", "연락처", "규모", "접수일", "상태"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold">{h}</th>)}</tr></thead>
              <tbody>{list.map((q) => (
                <tr key={q.id} onClick={() => setSel(q.id)} className={`border-t border-[#EEF1F6] cursor-pointer ${sel === q.id ? "bg-[#EEF3FB]" : "hover:bg-[#F5F8FD]"}`}>
                  <td className="px-3 py-2.5 font-black text-[#0F1A30]">{q.companyName}{leadType(q) && <span className={`ml-1.5 px-1.5 py-0.5 rounded-md border text-[10.5px] font-black ${leadType(q) === "무료체험" ? "border-[#1B2B4B] text-[#1B2B4B]" : "border-[#9AA9C3] text-[#5B6B85]"}`}>{leadType(q)}</span>}{q.marketingConsent === true && <span className="ml-1 px-1.5 py-0.5 rounded-md bg-[#EEF3FB] text-[10.5px] font-black text-[#2D5BD8]" title="광고성 정보 수신 동의">수신동의</span>}</td>
                  <td className="px-3 py-2.5 text-center">{q.name}</td>
                  <td className="px-3 py-2.5 text-center" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{fmtPhone(q.phone) || q.phone}</td>
                  <td className="px-3 py-2.5 text-center text-[#5B6B85]">{q.vehicles || "-"}</td>
                  <td className="px-3 py-2.5 text-center text-[12.5px] text-[#5B6B85]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{msOf(q.createdAt) ? ymd(new Date(msOf(q.createdAt))) : "-"}</td>
                  <td className="px-3 py-2.5 text-center"><span className={`px-2 py-0.5 rounded-md text-[12px] font-black ${(!q.status || q.status === "신규") ? "bg-[#0F1A30] text-white" : "bg-[#EEF2F8] text-[#1B2B4B]"}`}>{q.status || "신규"}</span></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Card>
        <Card code="DETAIL" title={cur ? cur.companyName : "문의를 선택하세요"}>
          {!cur ? <div className="py-10 text-center text-[#9AA9C3]">왼쪽 목록에서 문의를 누르면 상세가 보입니다.</div> : (
            <div className="space-y-3">
              {[["담당자", cur.name], ["연락처", fmtPhone(cur.phone) || cur.phone], ["이메일", cur.email], ["차량·규모", cur.vehicles], ["배차 인원", cur.staffCount], ["현재 방식", cur.currentTool], ["관심 요금제", cur.planInterest], ["연락 시간", cur.callTime], ["문의 유형", cur.type],
                ["광고 수신", cur.marketingConsent === true ? `동의 (${(cur.marketingChannels || []).join(" · ") || "이메일 · 문자"}${msOf(cur.marketingConsentAt) ? ` · ${ymd(new Date(msOf(cur.marketingConsentAt)))}` : ""})` : cur.marketingConsent === false ? "동의 안 함" : ""],
                ["유입 경로", leadSource(cur.source)], ["문의 내용", cur.message || cur.content]].filter(([, v]) => v).map(([k, v]) => (
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
// 📊 2026-11-03 사용량·한도 — 운송사마다 요금제 한도(직원·월 오더·지입차·저장 용량) 대비 사용량과 이달 초과 요금
//  · 숫자는 서버 집계(siteConfig/platformStats · 매일 새벽 4시 전체 + 지금 갱신) — 모든 문서의 회사명(companyName) 기준으로 센다
//  · 직원 수는 실시간(usePlatformLive), 이달 오더는 오늘까지 건수로 월말 예상
function UsageBar({ used, limit, unit = "", fmt = (n) => Number(n || 0).toLocaleString() }) {
  if (!limit) return <div className="text-[13.5px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{fmt(used)}{unit}<span className="ml-1 text-[11px] font-bold text-[#9AA9C3]">한도 없음</span></div>;
  const r = used / limit; const pct = Math.min(100, Math.round(r * 100));
  const tone = r > 1 ? "#B42318" : r >= 0.8 ? "#B54708" : "#1B2B4B";
  return (
    <div className="min-w-[120px]">
      <div className="flex items-baseline justify-between gap-2 tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
        <span className="text-[13.5px] font-black" style={{ color: tone }}>{fmt(used)}{unit}</span>
        <span className="text-[11px] font-bold text-[#9AA9C3]">/ {fmt(limit)}{unit}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[#EEF1F6] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} /></div>
      {r > 1 && <div className="mt-0.5 text-[10.5px] font-black text-[#B42318]">초과 +{fmt(Math.round((used - limit) * 100) / 100)}{unit}</div>}
    </div>
  );
}
function UsagePanel() {
  const live = usePlatformLive();
  const sales = useSalesPricing();
  const [stats, setStats] = React.useState(null);
  const [plans, setPlans] = React.useState({});
  const [tenancy, setTenancy] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => onSnapshot(doc(db, "siteConfig", "platformStats"), (x) => setStats(x.exists() ? x.data() : {}), () => setStats({})), []);
  React.useEffect(() => onSnapshot(collection(db, "companyPlans"), (x) => { const m = {}; x.docs.forEach((d) => { m[d.id] = d.data(); }); setPlans(m); }, () => {}), []);
  React.useEffect(() => onSnapshot(doc(db, "systemConfig", "tenancy"), (x) => setTenancy(x.exists() ? x.data() : {}), () => setTenancy({})), []);
  const refresh = async () => {
    setBusy(true); setMsg("");
    try {
      const token = await auth.currentUser?.getIdToken();
      const r = await fetch(`${FUNCTIONS_BASE}/platformStats`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      setMsg(j.skipped ? `방금 갱신했습니다 — ${Math.ceil((j.nextInSec || 0) / 60)}분 뒤 다시 누를 수 있어요` : "새로 집계했습니다");
    } catch (e) { setMsg(`갱신 실패: ${e.message || e}`); } finally { setBusy(false); }
  };
  if (!stats || !sales) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const today = ymd(); const dayNo = Number(today.slice(8)); const days = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
  const rows = mergeCompanies(stats.companies, live).filter((c) => c.kind !== "shipper").map((c) => {
    const planId = plans[c.name]?.planId || "";
    // ⭐ 월말 예상 = 이번 달에 이미 잡힌 오더(미래 예약 포함)와, 오늘까지 건수를 한 달로 늘린 값 중 큰 쪽 — 단, 7일 전에는 늘리지 않음(초반 몇 건이 10배로 부풀던 문제)
    const toDate = c.m?.toDate ?? (c.m?.cnt || 0);
    const projected = Math.max(c.m?.cnt || 0, dayNo >= 7 ? Math.round((toDate / dayNo) * days) : toDate);
    const u = planUsageOf(c, planId, sales, projected);
    const p = u?.plan;
    return { c, planId, p, u, projected, storageGB: u ? u.storageGB : Math.round(((c.storageKB || 0) / 1048576) * 100) / 100, total: p ? Number(p.price || 0) + u.over : 0 };
  }).sort((a, b) => (b.u?.over || 0) - (a.u?.over || 0) || (b.c.m?.cnt || 0) - (a.c.m?.cnt || 0));
  const won = (n) => `${Math.round(Number(n) || 0).toLocaleString()}원`;
  const overCos = rows.filter((r) => r.u?.over > 0);
  const sumOver = rows.reduce((a, r) => a + (r.u?.over || 0), 0);
  const sumTotal = rows.reduce((a, r) => a + r.total, 0);
  const locked = tenancy?.serverFilter === true;
  const upd = stats.updatedAtMs ? new Date(stats.updatedAtMs).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
  const stAt = rows.map((r) => r.c.storageAt || 0).reduce((a, b) => Math.max(a, b), 0);
  return (
    <div className="space-y-4">
      <Hero en="BILLING · USAGE" title="사용량 · 한도" desc="운송사마다 고른 요금제의 한도(직원 계정 · 월 오더 · 지입차 · 저장 용량) 대비 사용량과 이달 초과 요금입니다."
        right={<button type="button" onClick={refresh} disabled={busy} className="h-10 px-4 rounded-xl bg-white/10 ring-1 ring-white/25 text-white text-[13px] font-black disabled:opacity-60">{busy ? "집계 중…" : "지금 갱신"}</button>} />
      {!locked && (
        <div className="rounded-2xl border border-[#F7C97A] bg-[#FFF8EC] px-5 py-3.5 text-[13px] text-[#8A4B08]">
          <b>서버 분리가 아직 꺼져 있습니다.</b> 사용량은 모든 문서의 회사명 기준으로 세므로 회사명이 정확하면 지금도 맞습니다. 다만 회사명이 빈 예전 문서는 어느 운송사에도 잡히지 않으니, <b>데이터 › 운송사 분리</b>에서 1단계(회사명 채우기)를 먼저 해 두면 더 정확합니다.
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["요금제 지정 운송사", `${rows.filter((r) => r.p).length}곳`, `전체 ${rows.length}곳`], ["한도 초과 운송사", `${overCos.length}곳`, overCos.slice(0, 3).map((r) => r.c.name).join(" · ") || "없음"], ["이달 초과 요금 합계", won(sumOver), "VAT 별도 · 월말 예상"], ["이달 예상 청구 합계", won(sumTotal), "기본료 + 초과 요금"]].map(([k, v, sub], i) => (
          <div key={k} className={`rounded-[16px] px-4 py-3.5 border ${i === 2 ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
            <div className={`text-[12.5px] font-bold ${i === 2 ? "text-white/60" : "text-[#7A879C]"}`}>{k}</div>
            <div className="text-[22px] font-black mt-0.5 tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            <div className={`text-[11.5px] font-semibold mt-0.5 truncate ${i === 2 ? "text-white/50" : "text-[#9AA9C3]"}`}>{sub}</div>
          </div>
        ))}
      </div>
      <Card code="USAGE" title={`${Number(today.slice(5, 7))}월 사용량 · 초과 요금`} right={<span className="text-[12px] font-bold text-[#7A879C]">집계 {upd}{stAt ? ` · 저장 용량 ${new Date(stAt).toLocaleDateString("ko-KR")} 기준` : ""}</span>} bodyClass="p-0">
        {rows.length === 0 ? <div className="py-14 text-center text-[#9AA9C3]">집계된 운송사가 없습니다 — [지금 갱신]을 눌러 주세요.</div> : (
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]" style={{ minWidth: 1180 }}>
            <thead><tr className="bg-[#1B2B4B] text-white">{["운송사", "요금제", "직원 계정", "이달 오더 (월말 예상)", "지입차", "저장 용량", "초과 요금", "이달 예상 청구"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{rows.map(({ c, p, u, projected, storageGB, total }) => (
              <tr key={c.name} className={`border-t border-[#EEF1F6] ${u?.over ? "bg-[#FFFBF5]" : ""}`}>
                <td className="px-3 py-2.5 font-black text-[#0F1A30] whitespace-nowrap">{c.name}</td>
                <td className="px-3 py-2.5 text-center whitespace-nowrap">{p ? <span className="inline-block px-2.5 py-1 rounded-lg bg-[#0F1A30] text-white text-[12px] font-black">{p.name}</span> : <span className="text-[12px] font-bold text-[#9AA9C3]">미지정(한도 없음)</span>}</td>
                <td className="px-3 py-2.5"><UsageBar used={c.staff || 0} limit={p ? Number(p.seats) : 0} unit="명" /></td>
                <td className="px-3 py-2.5"><UsageBar used={projected} limit={p ? Number(p.orders) : 0} unit="건" /><div className="text-[10.5px] font-semibold text-[#9AA9C3] mt-0.5">오늘까지 {Number(c.m?.toDate ?? c.m?.cnt ?? 0).toLocaleString()}건 · 이달 전체 {Number(c.m?.cnt || 0).toLocaleString()}건{c.m?.fixed ? ` (고정노선 ${Number(c.m.fixed).toLocaleString()})` : ""}</div></td>
                <td className="px-3 py-2.5 text-center tabular-nums font-black" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{Number(c.fleetJ || 0).toLocaleString()}대{p && !["standard", "pro"].includes(p.id) && c.fleetJ ? <div className="text-[10.5px] font-semibold text-[#9AA9C3]">요금제에 없음</div> : null}</td>
                <td className="px-3 py-2.5"><UsageBar used={storageGB} limit={p ? (u?.limitGB || 0) : 0} unit="GB" fmt={(n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} /><div className="text-[10.5px] font-semibold text-[#9AA9C3] mt-0.5">파일 {Number(c.storageFiles || 0).toLocaleString()}개</div></td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {u?.over ? (
                    <div className="space-y-0.5 text-[12px] font-bold text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
                      {u.fee.seats ? <div>계정 +{u.extra.seats}명 · {won(u.fee.seats)}</div> : null}
                      {u.fee.orders ? <div>오더 +{u.extra.orders.toLocaleString()}건 · {won(u.fee.orders)}</div> : null}
                      {u.fee.fleet ? <div>지입 {u.extra.fleet}대 · {won(u.fee.fleet)}</div> : null}
                      {u.fee.storage ? <div>저장 +{u.extra.storageGB}GB · {won(u.fee.storage)}</div> : null}
                      <div className="text-[13.5px] font-black text-[#B42318]">{won(u.over)}</div>
                    </div>
                  ) : <span className="text-[12px] font-bold text-[#9AA9C3]">{p ? "없음" : "-"}</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-black text-[#0F1A30] tabular-nums whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{p ? won(total) : "-"}{p ? <div className="text-[10.5px] font-semibold text-[#9AA9C3]">기본 {won(p.price)}</div> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {msg && <div className="px-5 py-3 border-t border-[#EEF1F6] text-[13px] font-bold text-[#1B2B4B]">{msg}</div>}
      </Card>
      <div className="text-[12px] text-[#7A879C] leading-relaxed px-1">
        · 초과 단가는 <b>영업 › 요금제 관리</b>의 "월 추가 옵션"(추가 직원 계정 · 초과 오더 · 지입차 관리 · 초과 저장 용량) 값을 씁니다. 이 금액은 <b>수납 관리</b>의 청구액에도 그대로 들어갑니다(칸에서 직접 고칠 수 있음).<br />
        · 지입차 요금은 지입차관리가 들어 있는 요금제(스탠다드·프로)에서만 붙습니다. 저장 용량은 오더·거래처에 올린 사진·파일 기준이며 매일 새벽 4시 · [지금 갱신] 때 다시 셉니다.
      </div>
    </div>
  );
}

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
      // ⭐ 2026-11-06 요금제만 빼고 문서는 남긴다(같은 문서에 계약 기간·계약종료 상태가 있다 — 지우면 계약종료가 풀렸다)
      else await setDoc(doc(db, "companyPlans", company), { planId: deleteField(), since: deleteField(), updatedAt: serverTimestamp() }, { merge: true });
      // 이 회사의 대기 중 요금제 변경 요청은 처리됨으로
      const open = await getDocs(query(collection(db, "planRequests"), where("company", "==", company), where("status", "==", "요청")));
      await Promise.all(open.docs.map((d) => updateDoc(d.ref, { status: "처리", handledAt: serverTimestamp(), appliedPlan: planId || "" })));
    } catch (e) { window.alert(e.message); }
  };
  const planBill = (c, base) => applyPlanBill(base, c, plans[c.name]?.planId, sales); // ⭐ 2026-11-02 관리자센터2 — 요금·청구와 같은 계산(SalesQuote.applyPlanBill)
  const [addon, setAddon] = React.useState(null); // ⭐ 2026-11-04 추가 항목 편집 중인 회사
  if (!stats || !pricing) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const companies = mergeCompanies(stats.companies, live).map((c) => ({ ...c, bill: planBill(c, estimateBill(c, pricing, days, days)) }));
  const key = (c) => `${month}_${c.name}`.replace(/\//g, "_");
  // ⭐ 2026-11-04 추가 청구 — 청구액 = 자동 계산(기본료+초과) + 추가 항목(세금계산서·문자·개발 등). 칸에서 직접 고친 금액이 있으면 그 값
  const autoOf = (c) => c.bill.total + itemsTotal(rows[key(c)]?.items);
  const amountOf = (c) => rows[key(c)]?.amount ?? autoOf(c);
  const sum = (st) => companies.filter((c) => (rows[key(c)]?.status || "미청구") === st).reduce((a, c) => a + amountOf(c), 0);
  const save = (c, patch) => setDoc(doc(db, "platformInvoices", key(c)), { month, company: c.name, amount: amountOf(c), lines: billLines(c.bill), ...patch, updatedAt: serverTimestamp() }, { merge: true }).catch((e) => window.alert(e.message));
  const saveItems = (c, items) => {
    const r = rows[key(c)] || {};
    const amount = r.amountManual ? Math.max(0, Number(r.amount || 0) + itemsTotal(items) - itemsTotal(r.items)) : c.bill.total + itemsTotal(items);
    return save(c, { items, amount });
  };
  return (
    <div className="space-y-4">
      <Hero en="BILLING · COLLECTION" title="수납 관리" desc="가입사별 이달 청구액을 확정하고 청구·입금 상태를 기록합니다. (금액은 요금·청구 기준 예상액 — 칸에서 바로 고칠 수 있습니다)"
        right={<MonthPicker dark quick={false} value={month} onChange={(v) => setMonth(v)} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {PAY_STATUS.map((st, i) => (
          <div key={st} className={`rounded-[16px] px-4 py-3.5 border ${i === 2 ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white border-[#E3E8F0]"}`}>
            <div className={`text-[12.5px] font-bold ${i === 2 ? "text-white/60" : "text-[#7A879C]"}`}>{st}</div>
            <div className="text-[22px] font-black mt-0.5" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{sum(st).toLocaleString()}<span className="text-[12px] ml-1 opacity-50">원</span></div>
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
                  {/* 👥 2026-11-09 추가 직원 계정 — 요금제 포함 인원을 넘어 승인할 수 있는 수(초과분은 추가 직원 계정 단가로 청구) */}
                  {plans[c.name]?.planId && (
                    <label className="mt-1 flex items-center justify-center gap-1 text-[11px] font-bold text-[#5B6B85]" title="요금제 포함 인원에 더해 이 회사가 직접 승인할 수 있는 직원 수">
                      추가 계정
                      <input type="number" min={0} defaultValue={Number(plans[c.name]?.extraSeats || 0)} key={`${c.name}_xs_${plans[c.name]?.extraSeats || 0}`}
                        onBlur={(e) => { const v = Math.max(0, Math.floor(Number(e.target.value) || 0)); if (v === Number(plans[c.name]?.extraSeats || 0)) return; setDoc(doc(db, "companyPlans", c.name), { extraSeats: v, updatedAt: serverTimestamp() }, { merge: true }).catch((er) => window.alert(er.message)); }}
                        className="w-12 h-7 px-1 rounded-md border border-[#DCE3EE] text-center tabular-nums" />명
                    </label>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <input defaultValue={amountOf(c).toLocaleString()} key={`${key(c)}_${amountOf(c)}`} onBlur={(e) => { const v = Number(e.target.value.replace(/[^\d]/g, "")) || 0; if (v === amountOf(c) && rows[key(c)]) return; save(c, { amount: v, amountManual: v !== autoOf(c) }); }} className="w-36 h-9 px-2 rounded-lg border border-[#DCE3EE] text-right font-black" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} />
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    {(r.items || []).length > 0 && <span className="text-[11px] font-bold text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>추가 {(r.items || []).length}건 · {itemsTotal(r.items).toLocaleString()}</span>}
                    <button type="button" onClick={() => setAddon(c)} className="h-7 px-2 rounded-md border border-[#DCE3EE] text-[11.5px] font-black text-[#1B2B4B] hover:border-[#4B6CB7]">+ 추가 항목</button>
                  </div>
                  {r.amountManual && <div className="text-[10.5px] font-bold text-[#9AA9C3]">직접 정한 금액 · 자동 {autoOf(c).toLocaleString()}</div>}
                </td>
                <td className="px-3 py-2 text-center"><div className="inline-flex gap-1">{PAY_STATUS.map((st) => (
                  <button key={st} type="button" onClick={() => save(c, { status: st, ...(st === "입금완료" && !r.paidAt ? { paidAt: ymd() } : {}) })} className={`h-8 px-2.5 rounded-lg text-[12px] font-black border ${(r.status || "미청구") === st ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-[#DCE3EE] text-[#5B6B85]"}`}>{st}</button>))}</div></td>
                <td className="px-3 py-2 text-center"><span className="inline-block w-[140px]"><CustomDatePicker value={r.paidAt || ""} onChange={(e) => save(c, { paidAt: e.target.value })} className="h-9 w-full px-2 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold" placeholder="입금일" /></span></td>
                <td className="px-3 py-2"><input defaultValue={r.memo || ""} key={`${key(c)}_m`} onBlur={(e) => save(c, { memo: e.target.value })} className="w-full h-9 px-2 rounded-lg border border-[#DCE3EE]" placeholder="세금계산서 번호 등" /></td>
              </tr>); })}</tbody>
          </table></div>
        )}
      </Card>
      {addon && <AddonModal company={addon} month={month} sales={sales} planId={plans[addon.name]?.planId || ""} items={rows[key(addon)]?.items || []} bill={addon.bill} onClose={() => setAddon(null)} onSave={async (items) => { await saveItems(addon, items); setAddon(null); }} />}
    </div>
  );
}

// 🧾 2026-11-04 추가 청구 항목(이달 청구서에 붙는 줄) — 단가는 요금제 관리 값, 수량만 넣으면 금액 자동
function AddonModal({ company, month, sales, planId, items: initial, bill, onClose, onSave }) {
  const [items, setItems] = React.useState(() => initial.map((x) => ({ ...x })));
  const [busy, setBusy] = React.useState(false);
  const add = (a) => setItems((l) => [...l, { key: a.key, label: a.label, qty: 1, unit: addonRate(a.key, sales, planId), kind: a.kind, amount: addonRate(a.key, sales, planId) }]);
  const upd = (i, patch) => setItems((l) => l.map((x, k) => { if (k !== i) return x; const y = { ...x, ...patch }; y.amount = Math.round(Number(y.qty || 0) * Number(y.unit || 0)); return y; }));
  const lines = billLines(bill);
  const total = lines.reduce((a, x) => a + x.amount, 0) + itemsTotal(items);
  return (
    <div className="fixed inset-0 z-[100060] bg-[#0B1428]/70 backdrop-blur-[3px] flex items-center justify-center p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[860px] max-h-[92vh] flex flex-col rounded-[22px] bg-[#F4F6FA] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
        <div className="px-6 py-4 text-white flex justify-between items-start gap-3" style={{ background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div><div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>INVOICE · ADD-ONS · {month}</div>
            <div className="text-[19px] font-black mt-0.5">{company.name} — 이달 청구서 추가 항목</div>
            <div className="text-[12.5px] text-white/60">단가는 영업 › 요금제 관리 값(VAT 별도). 수량·단가를 고치면 금액이 바뀝니다.</div></div>
          <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold">닫기 ✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex flex-wrap gap-1.5">{ADDON_CATALOG.map((a) => (
            <button key={a.key} type="button" onClick={() => add(a)} className="h-9 px-3 rounded-xl bg-white border border-[#DCE3EE] text-[12.5px] font-black text-[#1B2B4B] hover:border-[#4B6CB7]">
              + {a.label}<span className="ml-1.5 text-[10.5px] text-[#9AA9C3]">{ADDON_KIND_LABEL[a.kind]}{a.rateKey ? ` · ${addonRate(a.key, sales, planId).toLocaleString()}원/${a.unit}` : ""}</span>
            </button>))}</div>
          <div className="bg-white rounded-2xl border border-[#E3E8F0] overflow-x-auto">
            <table className="w-full text-[13.5px]" style={{ minWidth: 560 }}>
              <thead><tr className="bg-[#1B2B4B] text-white">{["항목", "수량", "단가", "금액", ""].map((h, i) => <th key={i} className="px-3 py-2 text-center font-extrabold">{h}</th>)}</tr></thead>
              <tbody>
                {lines.map((x) => <tr key={x.key} className="border-t border-[#EEF1F6] text-[#5B6B85]"><td className="px-3 py-2 font-bold">{x.label} <span className="text-[11px] text-[#9AA9C3]">자동</span></td><td /><td /><td className="px-3 py-2 text-right font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{x.amount.toLocaleString()}</td><td /></tr>)}
                {items.map((x, i) => (
                  <tr key={i} className="border-t border-[#EEF1F6]">
                    <td className="px-3 py-2"><input value={x.label} onChange={(e) => upd(i, { label: e.target.value })} className="h-9 w-full px-2 rounded-lg border border-[#DCE3EE] font-bold" /></td>
                    <td className="px-3 py-2"><input inputMode="decimal" value={x.qty} onChange={(e) => upd(i, { qty: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} className="h-9 w-20 px-2 rounded-lg border border-[#DCE3EE] text-right font-black" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} /></td>
                    <td className="px-3 py-2"><input inputMode="numeric" value={x.unit} onChange={(e) => upd(i, { unit: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} className="h-9 w-28 px-2 rounded-lg border border-[#DCE3EE] text-right font-black" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }} /></td>
                    <td className="px-3 py-2 text-right font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{Number(x.amount || 0).toLocaleString()}</td>
                    <td className="px-2 py-2 text-center"><button type="button" onClick={() => setItems((l) => l.filter((_, k) => k !== i))} className="text-[#9AA9C3] px-1.5">✕</button></td>
                  </tr>
                ))}
                {!items.length && <tr className="border-t border-[#EEF1F6]"><td colSpan={5} className="px-3 py-5 text-center text-[#9AA9C3] text-[13px]">위 버튼으로 이번 달에 청구할 항목을 넣으세요(예: 세금계산서 120건, 맞춤 개발 6시간).</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rounded-2xl bg-[#0F1A30] text-white px-5 py-3 flex justify-between items-center"><span className="text-[13px] font-bold text-white/70">이달 청구 예상 (VAT 별도)</span><span className="text-[20px] font-black tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{total.toLocaleString()}원</span></div>
        </div>
        <div className="px-5 py-3 bg-white border-t border-[#E3E8F0] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl border border-[#DCE3EE] text-[13px] font-black">취소</button>
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(items.filter((x) => x.label)); } finally { setBusy(false); } }} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-50">저장</button>
        </div>
      </div>
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
              {c.code && <span className="text-[12.5px] font-bold text-[#7A879C] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c.code}</span>}
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
          <div><div className="text-[11px] font-extrabold tracking-[0.26em] text-[#4B6CB7]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>PREVIEW</div>
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
// 🔔 2026-11-03 푸시 점검 — 이 공지를 누가 받고(○) 누가 왜 못 받는지(✕ 이유), 한 사람에게 테스트 푸시(기기별 결과)
async function pushDiagApi(body) {
  const token = await auth.currentUser?.getIdToken();
  let r;
  try { r = await fetch(`${FUNCTIONS_BASE}/pushDiag`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error("서버 응답이 없습니다. pushDiag 서버 배포를 확인해 주세요."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `요청 실패 (${r.status})`);
  return d;
}
const PUSH_ERR_KO = { "messaging/registration-token-not-registered": "기기 토큰 만료(앱 재설치·알림 차단·오래 안 씀) — 그 폰에서 앱을 다시 열고 알림 허용", "messaging/invalid-registration-token": "잘못된 기기 토큰", "messaging/mismatched-credential": "다른 프로젝트 토큰", "messaging/third-party-auth-error": "아이폰/웹 인증 설정 오류" };
function PushDiagModal({ notice, onClose }) {
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [test, setTest] = React.useState({}); // uid → { busy, result }
  React.useEffect(() => { pushDiagApi({ action: "list", audience: notice.audience, targetCompanies: notice.targetCompanies || [] }).then((d) => setRows(d.rows)).catch((e) => setErr(e.message)); }, [notice]);
  const runTest = async (u) => {
    setTest((t) => ({ ...t, [u.uid]: { busy: true } }));
    try { const r = await pushDiagApi({ action: "test", uid: u.uid }); setTest((t) => ({ ...t, [u.uid]: { result: r } })); }
    catch (e) { setTest((t) => ({ ...t, [u.uid]: { result: { error: e.message } } })); }
  };
  const okN = (rows || []).filter((r) => r.ok).length;
  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-start justify-center overflow-auto p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[860px] my-8 rounded-[18px] bg-white border border-[#E3E8F0] shadow-xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#EEF1F6]">
          <div className="flex-1 min-w-0"><div className="text-[17px] font-black text-[#0F1A30]">푸시 받는 사람 확인</div><div className="text-[13px] text-[#7A879C] truncate">{notice.title} · {pnAudLabel(notice)}</div></div>
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-[#DCE3EE] text-[13.5px] font-bold text-[#3A4A66]">닫기</button>
        </div>
        <div className="px-5 py-3 text-[13px] text-[#5B6B85] bg-[#F7F9FC] border-b border-[#EEF1F6]">
          ○ 받음 {rows ? okN : "-"}명 · ✕ 못 받음 {rows ? rows.length - okN : "-"}명 — [테스트]를 누르면 그 사람의 등록된 기기 전부로 테스트 알림을 보내고 기기별 결과를 보여줍니다.
        </div>
        {err && <div className="m-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-semibold text-red-700">{err}</div>}
        {!rows && !err && <div className="py-12 text-center text-[#9AA9C3]">확인 중…</div>}
        {rows && (
          <div className="divide-y divide-[#EEF1F6] max-h-[65vh] overflow-auto">
            {rows.map((u) => { const t = test[u.uid]; return (
              <div key={u.uid} className="px-5 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`w-6 text-center font-black ${u.ok ? "text-[#067647]" : "text-[#D92D20]"}`}>{u.ok ? "○" : "✕"}</span>
                  <div className="flex-1 min-w-[200px]"><div className="text-[14.5px] font-black text-[#0F1A30]">{u.name || "(이름 없음)"} <span className="text-[12.5px] font-semibold text-[#9AA9C3]">{u.email}</span></div>
                    <div className="text-[12.5px] text-[#7A879C]">{u.company} · 기기 {u.devices}대{u.tokenAt ? ` · 마지막 등록 ${new Date(u.tokenAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}{u.why ? <span className="ml-1 font-bold text-[#D92D20]"> · {u.why}</span> : ""}</div></div>
                  {u.devices > 0 && <button type="button" onClick={() => runTest(u)} disabled={t?.busy} className="h-8 px-3 rounded-lg bg-[#0F1A30] text-white text-[12.5px] font-black disabled:opacity-50">{t?.busy ? "보내는 중…" : "테스트"}</button>}
                </div>
                {t?.result && (
                  <div className="mt-2 ml-9 rounded-lg bg-[#F5F8FD] border border-[#E3E8F0] px-3 py-2 text-[12.5px] text-[#3A4A66] space-y-0.5">
                    {t.result.error ? <div className="text-[#D92D20] font-bold">{t.result.error}</div> : (t.result.results || []).map((x) => (
                      <div key={x.device}>기기 {x.device} (…{x.tail}): {x.ok ? <b className="text-[#067647]">성공 — 폰에 알림이 떴는지 확인</b> : <b className="text-[#D92D20]">실패 · {PUSH_ERR_KO[x.code] || x.code} {x.msg && !PUSH_ERR_KO[x.code] ? `(${x.msg})` : ""}</b>}</div>
                    ))}
                    {t.result.note && <div>{t.result.note}</div>}
                  </div>
                )}
              </div>
            ); })}
          </div>
        )}
      </div>
    </div>
  );
}

function NoticesPanel() {
  const list = useCol("platformNotices");
  const blank = { title: "", body: "", bodyHtml: "", level: "안내", audience: "all", targetCompanies: [], active: true, endDate: "", pinned: false, banner: true, push: true, image: "", schedule: false, pubDate: "", pubTime: "" };
  // ⭐ 2026-11-03 예약 게시 — 한국 시각(날짜+시각) → ms
  const pubMsOf = (d, t) => (d ? Date.parse(`${d}T${t || "09:00"}:00+09:00`) || 0 : 0);
  const kstParts = (ms) => { const k = new Date(ms + 9 * 3600e3).toISOString(); return { pubDate: k.slice(0, 10), pubTime: k.slice(11, 16) }; };
  const [f, setF] = React.useState(blank);
  const [editId, setEditId] = React.useState(null);
  const [writing, setWriting] = React.useState(false);
  const [preview, setPreview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [filter, setFilter] = React.useState("all");
  const [diag, setDiag] = React.useState(null); // ⭐ 푸시 점검할 공지
  const fileRef = React.useRef(null);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const close = () => { setF(blank); setEditId(null); setWriting(false); };
  const save = async () => {
    if (!f.title.trim()) { window.alert("제목을 입력해 주세요."); return; }
    if (f.audience === "selected" && !f.targetCompanies.length) { window.alert("공지를 받을 운송사를 한 곳 이상 골라 주세요."); return; }
    const publishAt = f.schedule ? pubMsOf(f.pubDate, f.pubTime) : 0;
    if (f.schedule && !publishAt) { window.alert("예약 게시 날짜를 골라 주세요."); return; }
    if (f.schedule && publishAt <= Date.now()) { window.alert("예약 시각이 이미 지났습니다. 지금 게시하려면 '예약 게시'를 끄세요."); return; }
    setBusy(true);
    try {
      const bodyHtml = sanitizeHtml(f.bodyHtml || "");
      const prev = editId ? (list || []).find((x) => x.id === editId) : null;
      // 예약이면 그 시각에 서버가 푸시(sendScheduledPlatformNotices) — 아직 푸시 안 한 공지만
      const pushPending = !!publishAt && (editId ? (prev?.push !== false && !prev?.pushedAt) : f.push !== false);
      const data = { title: f.title.trim().slice(0, 200), body: htmlToText(bodyHtml) || f.body || "", bodyHtml, publishAt, pushPending, level: f.level, category: f.level, audience: f.audience,
        targetCompanies: f.audience === "selected" ? f.targetCompanies : [], active: f.active !== false, endDate: f.endDate || "",
        pinned: !!f.pinned, banner: f.banner !== false, board: true, image: f.image || "", author: "LogisWeb 운영팀" };
      if (editId) await updateDoc(doc(db, "platformNotices", editId), { ...data, updatedAt: serverTimestamp() });
      else { await addDoc(collection(db, "platformNotices"), { ...data, push: f.push !== false, createdAt: serverTimestamp(), authorEmail: auth.currentUser?.email || "" }); markUpdatesNoticed().catch(() => {}); } // 📝 2026-11-09 공지 게시 → 업데이트 보관함은 여기까지 비움
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
            <LogisMark size={36} light />
            <div className="leading-tight"><div className="text-[14px] font-black text-[#0F1A30] whitespace-nowrap">LogisWeb 운영팀</div><div className="text-[12px] text-[#7A879C]">작성자 · 자동</div></div>
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
            <span className="w-[150px]"><CustomDatePicker value={f.endDate || ""} onChange={(e) => set({ endDate: e.target.value })} className="h-10 w-full px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold" placeholder="계속" /></span>
            <span className="text-[13px] font-semibold text-[#9AA9C3]">(비우면 계속)</span>
          </label>
        </div>
        {/* ⭐ 2026-11-03 예약 게시 — 정한 시각부터 대상 회사에 보이고(배너·공지사항), 그때 푸시도 보낸다 */}
        <div className={`flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border ${f.schedule ? "bg-[#F5F8FD] border-[#C9D6EE]" : "bg-white border-[#E3E8F0]"}`}>
          <label className="inline-flex items-center gap-2 text-[14px] font-black text-[#0F1A30] cursor-pointer whitespace-nowrap">
            <input type="checkbox" checked={!!f.schedule} onChange={(e) => set(e.target.checked ? { schedule: true, ...(f.pubDate ? {} : kstParts(Date.now() + 3600e3)) } : { schedule: false })} className="w-4 h-4 accent-[#1B2B4B]" />
            예약 게시 <span className="text-[13px] font-semibold text-[#9AA9C3]">(정한 시각에 올라가고 푸시도 그때)</span>
          </label>
          {f.schedule && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-[150px]"><CustomDatePicker value={f.pubDate || ""} onChange={(e) => set({ pubDate: e.target.value })} className="h-10 w-full px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-semibold" /></span>
              <TimeSelect value={f.pubTime || ""} onChange={(v) => set({ pubTime: v })} emptyLabel="시각 선택" minuteStep={10} />
              {pubMsOf(f.pubDate, f.pubTime) > 0 && <span className="text-[13px] font-bold text-[#2D4C82]">{new Date(pubMsOf(f.pubDate, f.pubTime)).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}에 게시</span>}
            </div>
          )}
        </div>
        <div><Label>제목</Label>
          <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 11/9(일) 02:00~04:00 정기 점검 안내" className={`${inp} h-12 text-[16px] font-bold`} /></div>
        <div><Label>내용</Label>
          <RichTextEditor value={f.bodyHtml} onChange={(h) => set({ bodyHtml: h })} placeholder="공지할 내용을 입력하세요 — 위 단추로 굵게·크기·색·형광펜·정렬·목록" minHeight={300} /></div>
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
      {/* 🛠 2026-11-13 AI 작성함 · 업데이트 보관함 카드는 뺐다(사용자 요청) */}
      <Card code="POSTED" title={`게시한 공지 ${(list || []).length}건`} bodyClass="p-0">
        <div className="px-4 sm:px-5 py-3 border-b border-[#EEF1F6]"><div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#EEF2F8]">{[["all", "전체", (list || []).length], ["live", "게시 중", liveN], ["off", "내림·종료", (list || []).length - liveN]].map(([k, l, n]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`h-9 px-3.5 rounded-lg text-[13.5px] font-black whitespace-nowrap ${filter === k ? "bg-[#1B2B4B] text-white" : "text-[#5B6B85]"}`}>{l} <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{n}</span></button>))}</div></div>
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
                      <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{msOf(n.createdAt) ? ymd(new Date(msOf(n.createdAt))) : ""}{n.endDate ? ` ~ ${n.endDate}` : ""}</span>
                      {n.banner === false && <span>배너 없음</span>}
                      {/* ⭐ 2026-11-03 조회수 — 회사 공지사항에서 글을 연 계정 수(한 계정 1회, viewedBy) */}
                      <span className="inline-flex items-center gap-1 font-bold text-[#3A4A66] tabular-nums" title="조회수 — 한 계정 1회" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>조회 {(n.viewedBy || []).length}
                      </span>
                      {on && (n.publishAt || 0) > Date.now()
                        ? <span className="px-2 py-0.5 rounded-md font-black bg-[#FFF3B0] text-[#7A5B00]">⏰ 예약 {new Date(n.publishAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        : <span className={`font-black ${on ? "text-[#1B2B4B]" : "text-[#9AA9C3]"}`}>{on ? "● 게시 중" : expired ? "기간 종료" : "내림"}</span>}
                    </div>
                  </div>
                  <div className="w-full lg:w-auto flex justify-end gap-1.5 shrink-0 [&_button]:whitespace-nowrap">
                    <button type="button" onClick={() => setDiag(n)} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#2D4C82]">푸시 확인</button>
                    <button type="button" onClick={() => updateDoc(doc(db, "platformNotices", n.id), { active: n.active === false })} className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-black text-[#1B2B4B]">{n.active === false ? "다시 게시" : "내리기"}</button>
                    <button type="button" onClick={() => { setEditId(n.id); setF({ ...blank, ...n, targetCompanies: tc, bodyHtml: n.bodyHtml || textToHtml(n.body || ""), schedule: (n.publishAt || 0) > Date.now(), ...((n.publishAt || 0) > 0 ? kstParts(n.publishAt) : {}) }); setWriting(true); }} className="h-9 px-3.5 rounded-lg bg-[#0F1A30] text-white text-[13.5px] font-black">수정</button>
                    <button type="button" onClick={async () => (await kpConfirm("공지를 삭제할까요?\n대상 회사 공지사항 목록에서도 함께 사라집니다.")) && runDelete({ label: "공지", task: () => deleteDoc(doc(db, "platformNotices", n.id)) }).catch(() => {})} /* ⭐ 2026-11-05 삭제 진행 창 */ className="h-9 px-3.5 rounded-lg border border-[#DCE3EE] text-[13.5px] font-bold text-[#7A879C]">삭제</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {diag && <PushDiagModal notice={diag} onClose={() => setDiag(null)} />}
    </div>
  );
}

// ═══════════════════════ 운송사 분리(서버 잠금) ═══════════════════════
const TENANT_COLS = ["orders", "dispatch", "dispatch_test", "drivers", "clients", "places", "fixedClients", "recurringOrders",
  "deletedOrders", "driver_completed_archive", "notices", "schedules", "handovers", "boardPosts", "approvals", "approvalLines",
  "notifications", "scheduledEmails", "emailLogs", "hrResumes", "attendanceRequests", "attendanceChangeRequests", "acctPayments"];
// 🔎 2026-11-03 회사명 없는 데이터 점검 — 어떤 데이터가(오더·기사 기록 등) 몇 건, 언제 것인지 보고 기준일 이전은 지운다
const EMPTY_CO_LABEL = {
  orders: "오더", dispatch: "오더(모바일 등록)", dispatch_test: "테스트 오더", drivers: "기사", clients: "기본거래처", places: "상하차지", fixedClients: "고정거래처",
  recurringOrders: "정기오더", deletedOrders: "삭제한 오더 보관함", driver_completed_archive: "기사 완료 기록", notices: "공지", schedules: "일정", handovers: "인수인계",
  boardPosts: "게시판", approvals: "전자결재", approvalLines: "결재선", notifications: "알림", scheduledEmails: "예약 메일", emailLogs: "메일 기록", hrResumes: "이력서",
  attendanceRequests: "근태 신청", attendanceChangeRequests: "근태 변경", acctPayments: "지급 관리",
  driver_logs: "기사 운행일지", gps_tracks: "GPS 이동 기록", liveLocations: "실시간 위치", driver_photo_logs: "기사 사진 기록", driver_documents: "기사 서류",
  driver_notifications: "기사 알림", location_change_requests: "위치 변경 요청", emergency_alerts: "긴급 알림", collision_alerts: "충돌 알림", driver_uploads: "기사 업로드",
  attendance: "출퇴근 기록", routeBoards: "배차표 양식", fixedRoutes: "고정노선",
};
const EMPTY_CO_COLS = Object.keys(EMPTY_CO_LABEL);
function EmptyCompanyCheck() {
  const [res, setRes] = React.useState({});
  const [busy, setBusy] = React.useState("");
  const [before, setBefore] = React.useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return ymd(d); });
  const call = async (col, mode, extra = {}) => {
    const token = await auth.currentUser?.getIdToken();
    let cursor = null; const acc = { total: 0, empty: 0, removed: 0, oldest: "", newest: "", noDate: 0, sample: [] };
    for (;;) {
      const r = await fetch(`${FUNCTIONS_BASE}/tenantMigrate`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ col, mode, cursor, ...extra }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${EMPTY_CO_LABEL[col] || col}: ${j.error || r.status}${r.status === 404 ? " (서버 함수 배포가 필요합니다)" : ""}`);
      acc.total += j.total || 0; acc.empty += j.empty || 0; acc.removed += j.removed || 0; acc.noDate += j.noDate || 0;
      if (j.oldest && (!acc.oldest || j.oldest < acc.oldest)) acc.oldest = j.oldest;
      if (j.newest && j.newest > acc.newest) acc.newest = j.newest;
      if (acc.sample.length < 5) acc.sample.push(...(j.sample || []).slice(0, 5 - acc.sample.length));
      cursor = j.cursor;
      setRes((p) => ({ ...p, [col]: { ...acc, state: "진행 중" } }));
      if (j.done) break;
    }
    setRes((p) => ({ ...p, [col]: { ...acc, state: mode === "purge" ? "삭제 완료" : "완료" } }));
    return acc;
  };
  const scanAll = async () => {
    setBusy("scan"); setRes({});
    try { for (const col of EMPTY_CO_COLS) await call(col, "scan"); } catch (e) { window.alert(e.message || e); } finally { setBusy(""); }
  };
  const purge = async (col) => {
    const r = res[col];
    if (!(await kpConfirm(`[${EMPTY_CO_LABEL[col]}] 회사명이 없는 데이터 중 ${before} 이전(날짜 없는 것 포함) 것을 지웁니다.\n오더면 달린 사진·파일도 같이 지워지고 되돌릴 수 없습니다.\n\n지금 회사명 없는 것: ${r?.empty?.toLocaleString() || 0}건\n진행할까요?`))) return;
    if ((await kpPrompt("확인을 위해 '삭제'라고 입력해 주세요")) !== "삭제") return;
    setBusy(col);
    try { const pr = await call(col, "purge", { before }); await call(col, "scan"); setRes((p) => ({ ...p, [col]: { ...p[col], removed: pr.removed } })); } catch (e) { window.alert(e.message || e); } finally { setBusy(""); }
  };
  const rows = EMPTY_CO_COLS.filter((c) => res[c]);
  const totalEmpty = rows.reduce((a, c) => a + (res[c].empty || 0), 0);
  return (
    <Card code="CHECK" title="회사명 없는 데이터 점검" right={<button type="button" onClick={scanAll} disabled={!!busy} className="h-9 px-4 rounded-xl bg-[#0F1A30] text-white text-[13px] font-black disabled:opacity-50">{busy === "scan" ? "점검 중…" : "전체 점검"}</button>}>
      <div className="text-[13px] text-[#5B6B85] leading-relaxed">
        회사명이 빈 데이터는 오더·기사·거래처 등은 <b>어느 운송사 것도 아닌 것(회사없음)</b>으로, 기사앱 기록(GPS·운행일지·사진·서류·알림)은 <b>모든 운송사에 보이는 것</b>으로 처리되고 있습니다. 어떤 데이터가 몇 건이고 언제 것인지 확인한 뒤, <b>기준일 이전</b> 것은 지울 수 있습니다(최근 것은 남겨 두고 1단계로 회사명을 채우세요).
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] font-black text-[#3A4A66]">삭제 기준일</span>
        <span className="inline-block w-[150px]"><CustomDatePicker value={before} onChange={(e) => setBefore(e.target.value)} className="h-9 w-full px-2 rounded-lg border border-[#DCE3EE] text-[13px] font-semibold" /></span>
        <span className="text-[12px] text-[#9AA9C3]">이 날짜 이전(날짜 없는 것 포함)만 지웁니다</span>
        {rows.length > 0 && <span className="ml-auto text-[13px] font-black text-[#0F1A30]">회사명 없음 합계 <span style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{totalEmpty.toLocaleString()}</span>건</span>}
      </div>
      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto"><table className="w-full text-[13px]" style={{ minWidth: 860 }}>
          <thead><tr className="bg-[#1B2B4B] text-white">{["데이터", "전체", "회사명 없음", "날짜 범위", "예시", ""].map((h) => <th key={h} className="px-3 py-2 text-center font-extrabold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{rows.map((c) => { const r = res[c]; return (
            <tr key={c} className={`border-t border-[#EEF1F6] ${r.empty ? "" : "opacity-60"}`}>
              <td className="px-3 py-2 font-black text-[#0F1A30] whitespace-nowrap">{EMPTY_CO_LABEL[c]}<div className="text-[10.5px] font-semibold text-[#9AA9C3]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c}</div></td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{r.total.toLocaleString()}</td>
              <td className={`px-3 py-2 text-right tabular-nums font-black ${r.empty ? "text-[#B42318]" : "text-[#9AA9C3]"}`} style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{r.empty.toLocaleString()}</td>
              <td className="px-3 py-2 text-center whitespace-nowrap text-[12px] text-[#5B6B85] tabular-nums" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{r.empty ? `${r.oldest || "?"} ~ ${r.newest || "?"}${r.noDate ? ` · 날짜없음 ${r.noDate}` : ""}` : "-"}</td>
              <td className="px-3 py-2 text-[12px] text-[#7A879C] max-w-[260px] truncate" title={r.sample.map((x) => `${x.day} ${x.title}`).join("\n")}>{r.sample.map((x) => `${x.day || "날짜없음"} ${x.title}`).join(" · ") || "-"}</td>
              <td className="px-3 py-2 text-center whitespace-nowrap">
                {r.state === "진행 중" ? <span className="text-[12px] font-bold text-[#2D4C82] animate-pulse">진행 중…</span>
                  : r.empty ? <button type="button" disabled={!!busy} onClick={() => purge(c)} className="h-8 px-3 rounded-lg border border-[#B42318] text-[#B42318] text-[12px] font-black hover:bg-[#FFF1F0] disabled:opacity-50">{busy === c ? "지우는 중…" : `${before} 이전 삭제`}</button>
                  : <span className="text-[12px] font-bold text-[#1B7F4B]">깨끗함</span>}
                {r.removed ? <div className="text-[10.5px] font-bold text-[#1B7F4B] mt-0.5">{r.removed.toLocaleString()}건 삭제됨</div> : null}
              </td>
            </tr>); })}</tbody>
        </table></div>
      )}
    </Card>
  );
}

function TenancyPanel() {
  const [cfg, setCfg] = React.useState(null);
  const [prog, setProg] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => onSnapshot(doc(db, "systemConfig", "tenancy"), (s) => setCfg(s.exists() ? s.data() : {}), () => setCfg({})), []);
  const run = async () => {
    if (!(await kpConfirm("회사명이 빈칸인 예전 문서에 운송사를 적습니다.\n· 화주사가 보낸 오더 → 받은 운송사\n· 나머지 → (회사없음) 표시(어느 운송사에도 보이지 않아요)\n이미 회사명이 있는 문서는 건드리지 않습니다.\n오래 걸릴 수 있으니 창을 닫지 마세요. 진행할까요?"))) return;
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
    if (!(await kpConfirm(on ? "서버 분리를 켭니다. 모든 화면이 우리 회사 조건으로 조회합니다.\n켠 뒤 PC에서 규칙을 배포하면 서버가 다른 운송사 조회를 거부합니다." : "서버 분리를 끕니다(규칙을 배포한 뒤라면 끄면 안 됩니다)."))) return;
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
            운송사 칸이 생기기 전 문서(회사명 빈칸)에 운송사를 적습니다. 화주사가 보낸 오더는 받은 운송사로, 나머지는 <b>(회사없음)</b>으로 표시돼 어느 운송사에도 보이지 않습니다. 기본 회사는 없으니(2026-11-21) 필요 없으면 아래에서 지우면 됩니다.
            <button type="button" disabled={busy} onClick={run} className="mt-3 w-full h-10 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50">{busy ? "정리 중…" : cfg?.backfilledAt ? "다시 실행" : "실행"}</button>
          </>)}
          {step(2, "서버 분리 켜기", cfg?.serverFilter === true, <>
            모든 화면이 "우리 회사" 조건을 붙여 조회합니다. 직원들은 새로고침 한 번이면 적용됩니다.
            <button type="button" onClick={() => toggle(!cfg?.serverFilter)} className={`mt-3 w-full h-10 rounded-xl text-[13.5px] font-black ${cfg?.serverFilter ? "border border-[#DCE3EE] text-[#3A4A66]" : "bg-[#0F1A30] text-white"}`}>{cfg?.serverFilter ? "끄기" : "켜기"}</button>
          </>)}
          {step(3, "규칙 · 색인 배포", false, <>
            규칙 · 색인은 main 에 올리면 자동으로 배포돼요(GitHub Actions). 따로 할 일은 없어요.
          </>)}
        </div>
        {msg && <div className="mt-3 rounded-xl bg-[#0F1A30] text-white px-4 py-2.5 text-[13px] font-bold">{msg}</div>}
        {Object.keys(prog).length > 0 && (
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {TENANT_COLS.filter((c) => prog[c]).map((c) => (
              <div key={c} className="rounded-xl border border-[#E3E8F0] px-3 py-2">
                <div className="text-[12.5px] font-black text-[#0F1A30]" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{c}</div>
                <div className="text-[12px] text-[#5B6B85] whitespace-nowrap">{prog[c].state} · {prog[c].scanned.toLocaleString()}건 중 {prog[c].updated.toLocaleString()}건 채움</div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <ClaimsBackfill />
      <EmptyCompanyCheck />
    </div>
  );
}

// 🎫 2026-11-08 로그인 토큰 권한(custom claims) 채우기 — 서버 함수 backfillClaims(functions/authClaims.js)를 끝날 때까지 이어서 부른다
//  기존 직원·기사·화주·허브 회원 전체의 로그인 토큰에 회사·역할·승인 값을 넣는다(규칙이 users 문서를 매번 읽지 않게).
//  채우기 전에도 규칙은 예전처럼 문서를 읽으므로 아무도 잠기지 않는다 · 도중에 멈춰도 다시 누르면 처음부터 다시(이미 같은 값은 건너뜀)
function ClaimsBackfill() {
  const [cfg, setCfg] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [prog, setProg] = React.useState(null);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => onSnapshot(doc(db, "systemConfig", "claims"), (s) => setCfg(s.exists() ? s.data() : {}), () => setCfg({})), []);
  const callFn = async (data) => {
    const token = await auth.currentUser?.getIdToken();
    const r = await fetch(`${FUNCTIONS_BASE}/backfillClaims`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(`${j.error?.message || r.status}${r.status === 404 ? " (서버 함수 배포가 필요합니다)" : ""}`);
    return j.result;
  };
  const run = async () => {
    if (!(await kpConfirm("모든 계정의 로그인 토큰에 회사·역할·승인 값을 넣습니다.\n· 300명씩 나눠서 진행합니다(창을 닫지 마세요)\n· 이미 같은 값인 계정은 건너뜁니다\n· 직원 화면은 자동으로 새 토큰을 받습니다(다시 로그인 필요 없음)\n진행할까요?"))) return;
    setBusy(true); setMsg("");
    const acc = { processed: 0, changed: 0, errors: 0 };
    try {
      let next = { phase: "users", cursor: "" };
      while (next) {
        setProg({ ...acc, phase: next.phase });
        const r = await callFn({ ...next, limit: 300 });
        acc.processed += r.processed || 0; acc.changed += r.changed || 0; acc.errors += r.errors || 0;
        next = r.next;
      }
      setProg({ ...acc, phase: "done" });
      await setDoc(doc(db, "systemConfig", "claims"), { backfilledAt: serverTimestamp(), ...acc }, { merge: true });
      setMsg(`완료 — ${acc.processed.toLocaleString()}명 확인 · ${acc.changed.toLocaleString()}명 토큰 갱신${acc.errors ? ` · 실패 ${acc.errors}명(다시 실행해 주세요)` : ""}`);
    } catch (e) { setMsg(`실패: ${e.message || e}`); } finally { setBusy(false); }
  };
  const when = cfg?.backfilledAt?.toDate ? cfg.backfilledAt.toDate().toLocaleString("ko-KR") : "";
  return (
    <Card code="CLAIMS" title="로그인 토큰 권한 채우기(보안 규칙 속도 개선)">
      <div className="text-[13px] text-[#5B6B85] leading-relaxed">
        보안 규칙이 요청마다 직원 문서(users)를 읽지 않고 로그인 토큰의 회사·역할·승인 값으로 판단하게 합니다(읽기 비용 · 속도 개선).
        순서: <b>① 여기서 실행</b> → <b>② 끝</b>(서버 함수 · 규칙은 main 에 올리면 자동 배포돼요).
        이후 새 직원·역할 변경은 서버가 자동으로 처리합니다.
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={run} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-50 whitespace-nowrap">{busy ? "채우는 중…" : when ? "다시 실행" : "실행"}</button>
        {when && <span className="text-[12.5px] text-[#5B6B85] whitespace-nowrap">마지막 실행 {when} · {Number(cfg?.processed || 0).toLocaleString()}명</span>}
        {prog && busy && <span className="text-[12.5px] font-bold text-[#1B2B4B] whitespace-nowrap" style={{ fontVariantNumeric: "tabular-nums" }}>{prog.phase === "hub" ? "허브 회원" : "계정"} · {prog.processed.toLocaleString()}명 확인 · {prog.changed.toLocaleString()}명 갱신</span>}
      </div>
      {msg && <div className="mt-3 rounded-xl bg-[#0F1A30] text-white px-4 py-2.5 text-[13px] font-bold">{msg}</div>}
    </Card>
  );
}

// ═══════════════════════ 접속 이력 ═══════════════════════
// 🔗 2026-11-15 관리센터 › 데이터 › 구글시트 연동 — 운송사를 먼저 고르고, 그 회사의 시트 연결(가져오기 · 보내기 · 처음 옮기기)
function SheetHubForCompany() {
  const live = usePlatformLive();
  const names = Object.keys(live?.companies || {}).filter(Boolean).sort((a, b) => a.localeCompare(b, "ko"));
  const [co, setCo] = React.useState(() => { try { return localStorage.getItem("kpSheetHubCo") || ""; } catch { return ""; } });
  const pick = (v) => { setCo(v); try { localStorage.setItem("kpSheetHubCo", v); } catch { /* 무시 */ } };
  return (
    <div className="space-y-4">
      <div className="rounded-[18px] bg-white border border-[#E3E8F0] px-5 py-4 flex flex-wrap items-center gap-3">
        <span className="text-[14px] font-black text-[#0F1A30]">운송사</span>
        <CustomSelect value={co} onChange={(e) => pick(e.target.value)} className="h-10 min-w-[220px] px-3 rounded-xl border border-[#DCE3EE] text-[14px] font-bold">
          <option value="">운송사를 고르세요</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </CustomSelect>
      </div>
      {co ? <SheetConnectHub key={co} company={co} isTotalMaster withLive /> : <div className="py-16 text-center text-[#9AA9C3] text-[14px]">운송사를 고르면 그 회사의 시트 연결이 보여요.</div>}
    </div>
  );
}

function SessionLogsPanel() {
  const all = useCol("sessionLogs", "at", 500);
  const list = all && all.filter((l) => withinAccessLogWindow(l.at)); // 🧹 2026-11-14 7일 보관(서버가 매일 새벽 정리)
  const [q, setQ] = React.useState("");
  const [ev, setEv] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [wiping, setWiping] = React.useState(false);
  React.useEffect(() => { setPage(1); }, [q, ev]);
  if (!list) return <div className="py-20 text-center text-[#9AA9C3]">불러오는 중…</div>;
  const rows = list.filter((l) => (ev === "all" || l.event === ev) && (!q || [l.name, l.email, l.companyName, l.device, l.ip].some((v) => String(v || "").includes(q))));
  const events = [...new Set(list.map((l) => l.event).filter(Boolean))];
  // 🧹 2026-11-15 접속 이력 전체 삭제
  const wipe = async () => {
    if (!(await kpConfirm("접속 이력을 모두 지울까요?\n지운 기록은 되돌릴 수 없어요."))) return;
    setWiping(true);
    try { const n = await deleteAllDocs("sessionLogs"); alert(`접속 이력 ${n}건을 지웠어요.`); } catch (e) { alert(`실패: ${e?.message || e}`); } finally { setWiping(false); }
  };
  return (
    <div className="space-y-4">
      <Hero en="SECURITY · AUDIT LOG" title="접속 이력" desc={`최근 ${ACCESS_LOG_DAYS}일 로그인·로그아웃 기록입니다. ${ACCESS_LOG_DAYS}일이 지나면 매일 새벽 자동으로 지워져요. 회사·이름·기기로 찾을 수 있습니다.`} />
      <Card code="LOG" title={`${rows.length}건`} bodyClass="p-0" right={
        <div className="flex gap-2">
          <CustomSelect value={ev} onChange={(e) => setEv(e.target.value)} className="h-9 px-2 rounded-lg border border-[#DCE3EE] text-[13px] font-bold"><option value="all">전체</option>{events.map((e) => <option key={e} value={e}>{e}</option>)}</CustomSelect>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색" className="h-9 w-28 sm:w-48 px-3 rounded-lg border border-[#DCE3EE] text-[13px]" />
          <button type="button" onClick={wipe} disabled={wiping || !all?.length} className="h-9 px-3 rounded-lg border border-[#E8B4AE] bg-white text-[13px] font-black text-[#B4342A] disabled:opacity-40">{wiping ? "지우는 중…" : "전체 삭제"}</button>
        </div>}>
        <div className="overflow-x-auto"><table className="w-full text-[13.5px]" style={{ minWidth: 820 }}>
          <thead className="sticky top-0"><tr className="bg-[#1B2B4B] text-white">{["시각", "구분", "회사", "이름", "이메일", "기기"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-extrabold">{h}</th>)}</tr></thead>
          <tbody>{pageSlice(rows, Math.min(page, pageCount(rows.length))).map((l) => (
            <tr key={l.id} className="border-t border-[#EEF1F6]">
              <td className="px-3 py-2 text-center text-[12.5px] text-[#5B6B85] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{msOf(l.at) ? new Date(msOf(l.at)).toLocaleString("ko-KR", { hour12: false }) : "-"}</td>
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
// ⭐ 2026-11-02 관리자센터 — 실시간 층(PlatformLiveProvider)으로 감싼다. 회사 거르기 해제는 구독보다 먼저(렌더 중)
// 🛰 2026-11-18 리디자인 — PC: 왼쪽 세로 메뉴(전체 묶음 한눈에) + 위 작은 탭 / 모바일: 위 묶음 · 메뉴 · 작은 탭
export default function PlatformCenter({ user, demoLive = null }) {
  // 🏢 관리센터는 모든 운송사를 봐야 하므로 회사 거르기를 끈다(자식 화면 구독보다 먼저 — 렌더 중에)
  const [releaseBypass] = React.useState(() => pushTenantBypass());
  React.useEffect(() => releaseBypass, [releaseBypass]);
  return <PlatformLiveProvider demo={demoLive}><PlatformCenterInner user={user} /></PlatformLiveProvider>;
}
function PlatformCenterInner({ user }) {
  const navigate = useNavigate();
  const live = usePlatformLive();
  const [tab, setTabState] = React.useState(() => { try { const t = localStorage.getItem("pcTab") || "command"; return TAB_ALIAS[t] || t; } catch { return "command"; } });
  const setTab = React.useCallback((t) => { setTabState(TAB_ALIAS[t] || t); try { localStorage.setItem("pcTab", TAB_ALIAS[t] || t); } catch { /* 무시 */ } }, []);
  const [contractCtx, setContractCtx] = React.useState({ initial: null, fromQuote: null, key: 0 });
  const [focusCompany, setFocusCompany] = React.useState(null);
  const section = sectionOf(tab);
  const phone = usePhone();
  // 🧹 없어진 메뉴 · 휴대폰에서 숨긴 메뉴를 기억하고 있으면 그 메뉴의 첫 화면으로
  React.useEffect(() => {
    const item = itemOf(tab);
    if (!item) { setTab("command"); return; }
    if (phone && PHONE_HIDE.has(tab)) {
      const alt = [item.key, ...(item.also || [])].find((k) => !PHONE_HIDE.has(k));
      setTab(alt || sectionOf(tab).items.find((i) => !PHONE_HIDE.has(i.key))?.key || "command");
    }
  }, [tab, phone, setTab]);
  React.useEffect(() => { document.title = "LogisWeb 관리자센터"; }, []);
  // 📣 다른 화면에서 메뉴 이동(예: AI 본부 영상 작업실 → 홍보 › 영상 편집실)
  React.useEffect(() => { const k = (e) => { if (typeof e.detail === "string" && itemOf(e.detail)) setTab(e.detail); }; window.addEventListener("kp-admin-go", k); return () => window.removeEventListener("kp-admin-go", k); }, [setTab]);
  const toApp = () => { try { sessionStorage.setItem("kpEntry", "app"); } catch { /* 무시 */ } navigate("/app"); };
  const logout = async () => { if (!(await kpConfirm("로그아웃할까요?"))) return; try { sessionStorage.removeItem("kpEntry"); } catch { /* 무시 */ } await signOut(auth).catch(() => {}); navigate("/login"); };
  const openContract = (patch) => { setContractCtx((c) => ({ initial: null, fromQuote: null, ...patch, key: c.key + 1 })); setTab("contract:new"); };
  // 회사 이름을 누르면 → 운송사 관제의 상세 패널(이미 관제 화면이면 그 자리에서)
  const openCompany = React.useCallback((name) => { if (!name) return; setFocusCompany(name); setTab(MONITOR_TABS.includes(tab) && tab !== "applications" && !tab.startsWith("sales:") && tab !== "billing" ? tab : "companies"); }, [tab, setTab]);
  const clearFocus = React.useCallback(() => setFocusCompany(null), []);

  // ⭐ 2026-11-06 허브 회원 승인 대기 개수(메뉴 배지)
  const [hubPending, setHubPending] = React.useState(0);
  React.useEffect(() => onSnapshot(query(collection(db, "hubMembers"), where("status", "==", "pending"), limit(200)), (s) => setHubPending(s.size), () => setHubPending(0)), []);
  // 메뉴 배지(처리 대기 개수) — 합친 메뉴는 안의 화면 배지를 더한다
  // 📣 블로그 원고 "검토 대기"(매주 자동 초안 포함) 개수
  const [blogReview, setBlogReview] = React.useState(0);
  React.useEffect(() => onSnapshot(query(collection(db, "mktBlog"), where("status", "==", "review"), limit(50)), (s) => setBlogReview(s.size), () => setBlogReview(0)), []);
  const P = live?.pending;
  const raw = {
    "mkt:blog": blogReview,
    applications: P ? P.transport.length + P.shipper.length : 0,
    hubMembers: hubPending,
    inquiries: P ? P.inquiries.length : 0,
    payments: P ? P.planReqs.length : 0,
    support: P?.support ? P.support.length : 0, // ⭐ 2026-11-02 원격지원 —
  };
  const badgeOf = (item) => [item.key, ...(item.also || [])].reduce((a, k) => a + (raw[k] || 0), 0);
  const liveBadge = live?.ready ? live.totals.onlineNow : 0;
  const sectionsView = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !(phone && [i.key, ...(i.also || [])].every((k) => PHONE_HIDE.has(k)))).map((i) => (i.key === "live" ? { ...i, badge: liveBadge, soft: true } : badgeOf(i) ? { ...i, badge: badgeOf(i) } : i)) }));
  const sectionView = sectionsView.find((s) => s.key === section.key) || sectionsView[0];
  const secBadge = (s) => s.items.reduce((a, i) => a + (!i.soft && typeof i.badge === "number" ? i.badge : 0), 0);
  const curItem = itemOf(tab);
  const subs = (SUBTABS[curItem?.key] || []).filter(([k]) => !(phone && PHONE_HIDE.has(k))).map(([k, l]) => [k, l, raw[k] || 0]);

  let body = null;
  if (MONITOR_TABS.includes(tab)) {
    body = (
      <PlatformMonitor bare tab={tab} onTab={setTab} onContract={(q) => openContract({ fromQuote: q })} focusCompany={focusCompany} onFocusDone={clearFocus} demoStats={DEMO_STATS()} />
    );
  } else if (tab === "command") body = <CommandDeck go={setTab} openCompany={openCompany} />;
  else if (tab === "todo") body = <TodayPanel go={setTab} openCompany={openCompany} />;
  else if (tab === "live") body = <TrafficView openCompany={openCompany} />;
  else if (tab.startsWith("ai:")) body = <AiHq tab={tab} go={setTab} />; // 🤖 2026-11-18 AI 본부(명단 + 개요 · 팀 대화)
  // ⭐ 2026-11-02 원격지원 — 요청 목록 · 승인/거절/완료 · 화면 보기 · 원격 번호
  else if (tab === "support") body = <><Hero en="COMMAND · SUPPORT" title="원격 지원" desc="직원이 보낸 원격 지원 요청을 승인하거나, [원격 지원 걸기]로 직원에게 먼저 요청해요(직원이 수락해야 시작). 직원 화면을 실시간으로 보고 제어하거나(직원이 허용할 때만) 원격 프로그램 번호를 받아요." right={<Clock />} /><RemoteSupportAdminPanel me={user} /></>;
  else if (tab === "inquiries") body = <InquiriesPanel toQuote={(q) => { try { sessionStorage.setItem("kpQuoteSeed", JSON.stringify({ customer: q.companyName || "", contact: q.name || "", phone: q.phone || "" })); } catch { /* 무시 */ } setTab("sales:quote"); }} />;
  else if (tab === "contract:list") body = <><Hero en="CONTRACTS · STATUS" title="계약 현황" desc="작성 → 서명 요청 → 고객 전자서명 → 체결까지 한 곳에서 봐요. 만료 2개월 전부터 갱신 대상으로 표시돼요." /><ContractList onNew={() => openContract({})} onEdit={(c) => openContract({ initial: c })} /></>;
  else if (tab === "contract:new") body = <><Hero en="CONTRACTS · NEW" title={contractCtx.initial ? "계약서 수정" : "계약서 작성"} desc="견적을 불러오면 요금 · 기간이 자동으로 채워져요. 저장하고 서명 요청을 누르면 고객용 서명 링크가 복사돼요." /><ContractBuilder key={contractCtx.key} initial={contractCtx.initial} fromQuoteDoc={contractCtx.fromQuote} onDone={() => setTab("contract:list")} /></>;
  else if (tab === "contract:templates") body = <><Hero en="CONTRACTS · TEMPLATES" title="계약서 양식" desc="기본 이용계약서를 바탕으로 조항을 자유롭게 고치고, 양식을 여러 개 둘 수 있어요." /><ContractTemplates /></>;
  else if (tab === "hubMembers") body = <><Hero en="CLIENTS · HUB MEMBERS" title="허브 회원 승인" desc="로지스웹 허브(화물 콜)에 가입 신청한 차주 · 화주 · 운송사의 신청서와 서류를 보고 승인 · 거절해요. 로지스웹 계정으로 들어온 회원은 자동 승인되어 여기서 정지만 할 수 있어요." /><React.Suspense fallback={<AdmEmpty />}><HubMembersAdmin me={user} /></React.Suspense></>;
  else if (tab === "payments") body = <PaymentsPanel />;
  else if (tab === "usage") body = <CarrierUsageView openCompany={openCompany} />;
  else if (tab === "usage:limits") body = <UsagePanel />;
  else if (tab === "msgUsage") body = <MessageUsagePanel />;
  else if (tab === "cost") body = <WalletView openSettings={() => setTab("cost:pnl")} />;
  else if (tab === "cost:pnl") body = <React.Suspense fallback={<AdmEmpty />}><CostPanel openUsage={() => setTab("usage:limits")} /></React.Suspense>;
  else if (tab === "notices") body = <NoticesPanel />;
  else if (tab === "notifTemplate") body = <><Hero en="OPERATIONS · MESSAGES" title="알림 문구" desc="배차 알림 등 자동으로 보내는 문구를 관리해요." /><NotifTemplatePanel /></>;
  else if (tab === "mkt:video") body = <><Hero en="MARKETING · VIDEO EDITOR" title="영상 편집실" desc="숏츠 · 홍보영상의 장면 글 · 화면 · 나레이션 목소리 · 배경음악을 고치며 바로 미리 보고, 영상 파일을 만들어 내려받거나 유튜브에 올려요." /><React.Suspense fallback={<AdmEmpty>편집실을 여는 중이에요…</AdmEmpty>}><PromoVideo /></React.Suspense></>;
  else if (tab === "mkt:blog") body = <><Hero en="MARKETING · BLOG" title="블로그 원고" desc="블로그 글을 쓰고 고치고, 홈페이지 · 네이버 모양으로 미리 본 뒤 발행해요. 매주 월요일엔 AI 초안이 '검토 대기'로 들어와요." /><React.Suspense fallback={<AdmEmpty>원고를 여는 중이에요…</AdmEmpty>}><PromoBlog go={setTab} /></React.Suspense></>;
  else if (tab === "mkt:settings") body = <><Hero en="MARKETING · SETTINGS" title="홍보 설정" desc="나레이션 음성 키 · 유튜브 연결 · 네이버 블로그 · 매주 자동 초안 주제 · AI가 지킬 홍보 기준표를 정해요." /><React.Suspense fallback={<AdmEmpty />}><PromoSettings /></React.Suspense></>;
  else if (tab === "homepage") body = phone
    ? <><Hero en="OPERATIONS · HOMEPAGE" title="홈페이지" desc="" /><AdmPanel><div className="text-[14px] leading-relaxed" style={{ color: G.sub }}>홈페이지 편집은 PC 화면에서 해 주세요. 사진 · 글자 위치를 끌어서 옮기는 편집이라 넓은 화면이 필요해요.<br /><a className="font-black" style={{ color: G.goldHi }} href="https://www.logisweb.co.kr/" target="_blank" rel="noopener noreferrer">지금 홈페이지 보기 ↗</a></div></AdmPanel></>
    : <React.Suspense fallback={<AdmEmpty>편집기를 여는 중이에요…</AdmEmpty>}><HomepageEditor /></React.Suspense>;
  else if (tab === "integrations") body = <><Hero en="OPERATIONS · INTEGRATIONS" title="연동 설정" desc="국세청 · 기상청 · 팝빌 연동 상태를 보고 시험해요. 키는 Firebase 비밀값에만 두고 화면에는 보이지 않아요." /><React.Suspense fallback={<AdmEmpty />}><IntegrationSettings /></React.Suspense></>;
  else if (tab === "landingEdit") body = <><Hero en="OPERATIONS · LOGIN SCREEN" title="로그인 화면 꾸미기" desc="계정을 고르는 첫 화면(트럭이 지나가는 화면)의 배경 사진 · 영상 · 글꼴 · 아래 문구를 바꿔요." /><LandingPageEditPanel /></>;
  else if (tab === "brand") body = <><Hero en="OPERATIONS · BRAND" title="브랜드 디자인" desc="로고를 올리고 부분마다 색 · 굵기를 고쳐요. 로고가 들어가는 자리마다 바탕도 바꿔 보며 미리 볼 수 있어요." /><React.Suspense fallback={null}><BrandStudioLazy /></React.Suspense></>;
  else if (tab === "mobilePreview") body = <><Hero en="OPERATIONS · MOBILE" title="모바일 화면" desc="지금 로그인한 계정의 모바일 화면을 휴대폰 크기 그대로, 크게 확인해요." /><React.Suspense fallback={null}><MobilePreviewPanelLazy /></React.Suspense></>;
  else if (tab === "sessions") body = <><Hero en="SECURITY · SESSIONS" title="로그인 관리" desc="지금 로그인 중인 모든 기기를 보고, 필요하면 강제로 내보내요." /><AdminSessionsPanel isTotalMaster company="" /></>;
  else if (tab === "sessionLogs") body = <SessionLogsPanel />;
  else if (tab === "errorReports") body = <React.Suspense fallback={<AdmEmpty />}><ErrorReportsPanel /></React.Suspense>;
  else if (tab === "securityEvents") body = <React.Suspense fallback={<AdmEmpty />}><SecurityEventsPanel /></React.Suspense>;
  else if (tab === "tenancy") body = <TenancyPanel />;
  else if (tab === "sheetImport") body = <><Hero en="DATA · SHEETS" title="구글시트 연동" desc="운송사를 고르면 연결된 시트를 보고 가져오기 · 보내기 · 칸 맞추기를 해요. 처음 세팅할 때 쓰던 배차일지를 옮기는 것도 여기서 해요." /><SheetHubForCompany /></>;
  // ⭐ 2026-11-06 운송사 초기화는 이제 관리센터에서만(배차 프로그램 관리자메뉴에서 뺐다) — 계약종료 + 초기화는 영업 · 계약 › 이용 기간 · 만료
  else if (tab === "companyReset") body = <><Hero en="DATA · RESET" title="운송사 초기화" desc="운송사 데이터를 모두 지워요 — 7일 동안 보관함에서 되살릴 수 있어요. 계약을 끝내며 지우려면 영업 · 계약 › 이용 기간 · 만료를 쓰세요." right={<AdmBtn onClick={() => setTab("contract:life")}>이용 기간 · 만료 ›</AdmBtn>} /><CompanyResetPanel /></>;
  else if (tab === "testSeed") body = <><Hero en="DATA · TEST DATA" title="테스트 데이터" desc="테스트운송사에 가짜 데이터를 채우거나 다시 채워요. 다른 운송사에는 넣을 수 없어요." /><React.Suspense fallback={<AdmEmpty />}><TestSeedPanel /></React.Suspense></>;
  else if (tab === "contract:life") body = <><Hero en="CONTRACTS · LIFECYCLE" title="이용 기간 · 만료" desc="운송사별 계약 기간을 정하고, 만료 30 · 7 · 1일 전 안내를 보내요. 계약종료하면 데이터는 남기고 그 회사 사람은 접속할 수 없어요." right={<Clock />} /><ContractLifecyclePanel openCompany={openCompany} /></>;
  else if (tab === "release") body = <><Hero en="OPERATIONS · RELEASE" title="업데이트 배포" desc="새 화면을 올려도 여기서 배포해야 가입자 화면이 바뀌어요. 최고관리자 · 부관리자는 항상 최신 화면을 먼저 봐요." /><ReleasePanel>
    {/* 🧹 2026-11-14 '화주사 강제 업데이트' — 2026-11-15 고급 설정 안으로 */}
    <div><div className="text-[14px] font-black mb-2" style={{ color: G.ink }}>화주사 화면 강제 업데이트</div><ShipperForceUpdatePanel currentVersion={typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : ""} /></div></ReleasePanel></>;
  else if (tab === "privateFare") body = <><Hero en="SECURITY · PRIVATE FARE" title="비공개 운임" desc="운송사와 사람을 골라 비공개 운임을 켜요. 켜진 사람의 임원 화면에 메뉴가 생기고, 비밀번호로 들어가요. 그 사람이 정한 금액은 최고관리자도 볼 수 없어요." /><React.Suspense fallback={<AdmEmpty />}><PrivateFareAdminLazy /></React.Suspense></>;
  else if (tab === "subAdmin") body = <><Hero en="SECURITY · SUB ADMIN" title="부관리자" desc="최고관리자와 같은 권한을 가진 부관리자(1명)를 보고 지정 · 해제해요." /><SubAdminPanel /></>;

  // 🔎 상단 메뉴 검색 — 메뉴 · 화면 안 작은 탭까지(휴대폰에서 못 쓰는 화면은 뺌)
  const searchEntries = adminSearchEntries(sectionsView, SUBTABS).filter((e) => !(phone && PHONE_HIDE.has(e.tab)));
  const subBar = subs.length > 1 ? <div className="mb-3 sm:mb-4 flex"><Seg value={tab} onChange={setTab} items={subs} /></div> : null;
  const content = <>{subBar}<div key={tab} className="adm-in">{body}</div></>;

  if (phone) return <PlatformMobileShell searchEntries={searchEntries} user={user} sections={sectionsView} section={sectionView} tab={tab} curItem={curItem} setTab={setTab} toApp={toApp} logout={logout} secBadge={secBadge}>{content}</PlatformMobileShell>;

  return (
    <div className="kp-adm kp-pcenter min-h-screen">
      <style>{ADM_CSS}{PC_SHELL_CSS}</style>
      <div className="adm-grid" aria-hidden />
      {/* ── 왼쪽 세로 메뉴 ── */}
      <aside className="adm-side fixed left-0 top-0 bottom-0 z-40 w-[244px] flex flex-col">
        <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
          <LogisMark size={36} spot="admin" />
          <div className="leading-none min-w-0">
            <LogisWordmark height={12} spot="admin" />
            <div className="text-[9.5px] font-extrabold tracking-[0.32em] mt-1.5 whitespace-nowrap" style={{ ...NUM, color: G.gold }}>ADMIN CENTER</div>
          </div>
        </div>
        <div className="px-3 pb-2"><HeaderLivePill onClick={() => setTab("live")} /></div>
        <nav className="adm-scroll flex-1 overflow-y-auto px-2.5 pb-3">
          {sectionsView.map((s) => {
            const b = secBadge(s);
            const secOn = s.key === section.key;
            return (
              <div key={s.key} className="mt-3 first:mt-1">
                <div className="px-2 mb-1 flex items-center gap-2">
                  <span className="text-[10px] font-extrabold tracking-[0.24em] whitespace-nowrap" style={{ ...NUM, color: secOn ? G.gold : "rgba(215,188,130,.5)" }}>{s.en}</span>
                  <span className="h-px flex-1" style={{ background: secOn ? "rgba(215,188,130,.35)" : "rgba(215,188,130,.1)" }} />
                  {b > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black inline-flex items-center justify-center" style={{ ...NUM, background: G.gold, color: G.goldInk }}>{b > 99 ? "99+" : b}</span>}
                </div>
                {s.items.map((i) => {
                  const on = curItem?.key === i.key;
                  return (
                    <button key={i.key} type="button" onClick={() => setTab(i.key)} data-on={on ? "1" : "0"} aria-current={on ? "page" : undefined}
                      className="adm-nav w-full h-[38px] px-2.5 rounded-[11px] flex items-center gap-2.5 text-[13.5px] whitespace-nowrap transition">
                      <ShellIcon name={i.icon} size={16} className="shrink-0" />
                      <span className="truncate">{i.label}</span>
                      {typeof i.badge === "number" && i.badge > 0 && <span className={`ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] font-black inline-flex items-center justify-center ${i.soft ? "adm-badge-soft" : "adm-badge"}`} style={NUM}>{i.badge > 99 ? "99+" : i.badge}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="px-3 py-3 space-y-2" style={{ borderTop: `1px solid ${G.line}` }}>
          <button type="button" onClick={toApp} className="adm-btn-gold w-full h-10 rounded-xl text-[13.5px] font-black" title="배차 프로그램으로 전환">배차 프로그램 ↗</button>
          <div className="flex items-center gap-2">
            <span className="flex-1 min-w-0 text-[11.5px] truncate" style={{ color: G.dim }} title={user?.email || ""}>{user?.email}</span>
            <button type="button" onClick={logout} className="adm-btn h-8 px-2.5 rounded-lg text-[12px] font-black whitespace-nowrap">로그아웃</button>
          </div>
        </div>
      </aside>
      {/* ── 본문 ── */}
      <div className="pl-[244px] relative">
        <header className="adm-top sticky top-0 z-30 h-[60px] px-5 2xl:px-7 flex items-center gap-3">
          <div className="min-w-0 flex items-center gap-2.5">
            <span className="text-[10.5px] font-extrabold tracking-[0.26em] whitespace-nowrap" style={{ ...NUM, color: G.goldDim }}>{sectionView.en}</span>
            <span style={{ color: "rgba(215,188,130,.35)" }}>/</span>
            <span className="text-[16px] font-black whitespace-nowrap" style={{ color: G.ink }}>{curItem?.label || ""}</span>
          </div>
          <div className="flex-1 min-w-[200px] flex justify-center px-2"><AdminSearch entries={searchEntries} onPick={setTab} /></div>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden xl:inline-flex items-center gap-2 h-9 px-3 rounded-xl" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${G.line}` }}><span className="text-[10px] font-extrabold tracking-[0.2em]" style={{ ...NUM, color: G.goldDim }}>KST</span><Clock /></span>
          </div>
        </header>
        <main className="adm-main px-5 2xl:px-7 pt-4 pb-10 min-w-0 relative">{content}</main>
      </div>
    </div>
  );
}
const PC_SHELL_CSS = `
.kp-adm .adm-side { background: radial-gradient(420px 280px at 0% 0%, rgba(215,188,130,.13), transparent 70%), linear-gradient(180deg, #04070F 0%, #0A1328 55%, #070D1C 100%); box-shadow: inset -1px 0 0 rgba(215,188,130,.2), 10px 0 30px rgba(0,0,0,.25); }
.kp-adm .adm-top { background: linear-gradient(180deg, rgba(6,10,20,.92), rgba(8,13,26,.78)); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(215,188,130,.14); }
.kp-adm .adm-nav[data-on="0"] { color: rgba(226,232,245,.72); font-weight: 700; }
.kp-adm .adm-nav[data-on="0"] svg { color: rgba(215,188,130,.7); }
.kp-adm .adm-nav[data-on="0"]:hover { background: rgba(215,188,130,.07); color: #fff; }
.kp-adm .adm-nav[data-on="1"] { background: linear-gradient(180deg, #F3E3BC 0%, #D7BC82 100%); color: #1A1405; font-weight: 900; box-shadow: 0 8px 20px rgba(0,0,0,.35), 0 0 0 1px rgba(255,240,210,.5) inset, 0 0 18px rgba(215,188,130,.25); }
.kp-adm .adm-nav[data-on="1"] svg { color: #5A4517; }
.kp-adm .adm-badge { background: ${G.gold}; color: ${G.goldInk}; }
.kp-adm .adm-nav[data-on="1"] .adm-badge, .kp-adm .adm-nav[data-on="1"] .adm-badge-soft { background: ${G.goldInk}; color: ${G.goldHi}; }
.kp-adm .adm-badge-soft { background: rgba(215,188,130,.16); color: ${G.goldHi}; }
.kp-adm button[title*="지금 접속"] { width: 100%; justify-content: center; background: rgba(215,188,130,.08) !important; --tw-ring-color: rgba(215,188,130,.3) !important; }
/* ⭐ 2026-11-02 관리자센터2 — 관리센터 전체 글자 키움(소수점 크기만 한 단계씩) */
.kp-pcenter .adm-main .text-\\[10px\\] { font-size: 11.5px !important; }
.kp-pcenter .adm-main .text-\\[10\\.5px\\] { font-size: 12px !important; }
.kp-pcenter .adm-main .text-\\[11\\.5px\\] { font-size: 13px !important; }
.kp-pcenter .adm-main .text-\\[12\\.5px\\] { font-size: 13.5px !important; }
.kp-pcenter .adm-main .text-\\[13\\.5px\\] { font-size: 14.5px !important; }
.kp-pcenter .adm-main .text-\\[14\\.5px\\] { font-size: 15px !important; }
`;

// ═══════════════════════ 📱 모바일 관리센터 ═══════════════════════
//  🛰 2026-11-18 리디자인 — 어두운 골드. 위: 로고 · 지금 접속 · 배차앱 · 로그아웃 / 묶음(가로) / 메뉴(가로) · 본문 위 작은 탭
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
.kp-pm .text-\\[10px\\] { font-size: 11px !important; }
.kp-pm .text-\\[10\\.5px\\] { font-size: 11.5px !important; }
.kp-pm .text-\\[11\\.5px\\] { font-size: 12.5px !important; }
.kp-pm main .text-xs { font-size: 13px !important; }
.kp-pm main .pm-tile > div:last-child, .kp-pm main .pm-tile-dark > div:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kp-pm main .pm-spark { display: none; }
.kp-pm main [class*="max-w-[1180px]"] { padding: 20px 16px !important; }
.kp-pm main .kp-contract h1 { white-space: normal; font-size: 20px !important; letter-spacing: .08em; }
.kp-pm main .kp-contract { font-size: 14px; }
.kp-pm main { word-break: keep-all; }
.kp-pm main [style*="min-width: 1220px"], .kp-pm main [style*="min-width: 960px"], .kp-pm main [style*="min-width: 820px"] { font-size: 13px; }
.kp-pm .pm-head { background: radial-gradient(500px 120px at 20% -40px, rgba(215,188,130,.16), transparent 70%), linear-gradient(120deg, #04070F 0%, #0A1328 60%, #101C38 100%); box-shadow: 0 1px 0 rgba(215,188,130,.25), 0 8px 22px rgba(0,0,0,.4); }
.kp-pm .pm-sec[data-on="1"] { background: linear-gradient(180deg, #F3E3BC 0%, #D7BC82 100%); color: #1A1405; font-weight: 900; box-shadow: 0 6px 16px rgba(215,188,130,.25); }
.kp-pm .pm-sec[data-on="0"] { color: rgba(226,232,245,.7); font-weight: 700; }
.kp-pm .pm-item[data-on="1"] { background: rgba(215,188,130,.16); color: #F3E3BC; border-color: rgba(215,188,130,.55); }
.kp-pm .pm-item[data-on="0"] { background: rgba(255,255,255,.03); color: rgba(226,232,245,.75); border-color: rgba(215,188,130,.14); }
`;
// ⭐ 2026-11-02 관리자센터 — 버튼을 손가락 크기로, 처리 대기 배지, 지금 접속 알약
function PlatformMobileShell({ searchEntries = [], user, sections = SECTIONS, section, tab, curItem, setTab, toApp, logout, secBadge = () => 0, children }) {
  const secRef = React.useRef(null);
  const subRef = React.useRef(null);
  // 고른 메뉴가 화면 밖이면 가운데로 끌어온다
  React.useEffect(() => {
    [secRef.current?.querySelector("[data-on='1']"), subRef.current?.querySelector("[data-on='1']")].forEach((el) => el?.scrollIntoView?.({ inline: "center", block: "nearest" }));
    window.scrollTo(0, 0);
  }, [tab]);
  return (
    <div className="kp-pm kp-adm min-h-screen">
      <style>{ADM_CSS}{PM_MOBILE_CSS}</style>
      <div className="adm-grid" aria-hidden />
      <header data-kp-spot="admin" className="pm-head sticky top-0 z-40 text-white" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="h-[56px] flex items-center gap-2 px-3">
          <LogisMark size={30} spot="admin" />
          <div className="min-w-0 flex-1 leading-none">
            <div className="text-[15px] font-black whitespace-nowrap">관리자센터</div>
            <div className="text-[9px] font-extrabold tracking-[0.3em] mt-1 truncate whitespace-nowrap" style={{ ...NUM, color: G.gold }}>ADMIN CENTER</div>
          </div>
          <HeaderLivePill phone onClick={() => setTab("live")} />
          <AdminSearch phone entries={searchEntries} onPick={setTab} />
          <button type="button" onClick={toApp} className="adm-btn-gold shrink-0 h-9 px-2.5 rounded-[10px] text-[13px] font-black whitespace-nowrap">배차앱 ↗</button>
          <button type="button" onClick={logout} aria-label="로그아웃" className="adm-btn shrink-0 h-9 w-9 rounded-[10px] flex items-center justify-center" title={user?.email || "로그아웃"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
        <nav ref={secRef} className="kp-pm-scroll flex gap-1 overflow-x-auto px-3 pb-2">
          {sections.map((s) => {
            const on = s.key === section.key;
            const b = secBadge(s);
            return (
              <button key={s.key} type="button" data-on={on ? "1" : "0"} onClick={() => setTab(s.items[0].key)}
                className="pm-sec shrink-0 h-9 px-3.5 rounded-[11px] text-[13.5px] whitespace-nowrap transition inline-flex items-center gap-1.5">
                <ShellIcon name={s.icon} size={14} />{s.label}
                {b > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-black inline-flex items-center justify-center" style={on ? { background: G.goldInk, color: G.goldHi } : { background: G.gold, color: G.goldInk }}>{b > 99 ? "99+" : b}</span>}
              </button>
            );
          })}
        </nav>
      </header>
      {section.items.length > 1 && (
        <div ref={subRef} className="kp-pm-scroll sticky z-30 flex gap-1.5 overflow-x-auto px-3 py-2" style={{ top: "calc(100px + env(safe-area-inset-top, 0px))", background: "rgba(6,10,20,.88)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${G.line}` }}>
          {section.items.map((i) => {
            const on = i.key === curItem?.key;
            const hb = typeof i.badge === "number" && i.badge > 0;
            return (
              <button key={i.key} type="button" data-on={on ? "1" : "0"} onClick={() => setTab(i.key)}
                className="pm-item shrink-0 h-8 px-3 rounded-full text-[13px] font-black whitespace-nowrap border transition inline-flex items-center gap-1.5">
                {i.label}
                {hb && <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-black inline-flex items-center justify-center" style={{ background: i.soft ? "rgba(215,188,130,.2)" : G.gold, color: i.soft ? G.goldHi : G.goldInk }}>{i.badge}</span>}
              </button>
            );
          })}
        </div>
      )}
      <main className="adm-main relative px-3 pt-3 pb-10 min-w-0 overflow-x-hidden" style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))" }}>{children}</main>
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
      <div className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.3em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>
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
            <div className="text-[10px] sm:text-[11.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0] whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}><LogisTag height={8.5} text="SELECT WORKSPACE" /></div>
            <div className="text-[24px] sm:text-[32px] font-black tracking-tight mt-1 whitespace-nowrap">어디로 들어갈까요?</div>
            <div className="text-[12px] sm:text-[14.5px] text-white/55 mt-1 truncate whitespace-nowrap">{user?.email}<span className="hidden sm:inline"> · 최고관리자 계정은 매번 들어갈 곳을 고릅니다.</span></div>
          </div>
          <div className="shrink-0 px-2.5 sm:px-3 h-9 sm:h-10 rounded-xl bg-white/[0.06] ring-1 ring-white/10 flex items-center"><Clock /></div>
        </div>
        <div className="grid md:grid-cols-2 gap-3 sm:gap-5">
          <Item k="platform" primary en="PLATFORM CONTROL" title="관리자 관리센터" desc="이 프로그램 플랫폼을 운영하는 화면입니다." points={["가입사 관제 · 사용량 · 건강도", "요금제 · 견적 · 전자계약", "청구 · 수납 · 플랫폼 공지", "로그인 관리 · 접속 이력 · 데이터"]} />
          <Item k="app" en="DISPATCH WORKSPACE" title="배차 프로그램" desc="운송사 화면으로 들어가 실제 배차 업무를 봅니다." points={["오더등록 · 실시간 배차현황", "매출 · 정산 · 회사관리", "고객사 화면 점검 · 지원", "로그인 때 고른 회사로 진입"]} />
        </div>
        <div className="mt-4 sm:mt-6 text-center text-[11px] sm:text-[12px] text-white/35 whitespace-nowrap" style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}>들어간 뒤에도 언제든 전환할 수 있습니다</div>
      </div>
    </div>
  );
}
