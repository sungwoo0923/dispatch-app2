// src/mobile/MobilePcViews.jsx — 모바일 앱에서 PC와 같은 화면을 그대로 쓰는 메뉴들
// ⭐ 사용자 요청(2026-10-31) — 매출관리·운임조회(전국운임조회·자사운임표)·단가표·지입차관리·전자결재를
//  PC와 같은 구성·디자인으로. PC 화면 컴포넌트를 그대로 불러오고, 휴대폰 폭에서는 PC의 왼쪽 메뉴가
//  위쪽 가로 탭(KpSubNav 휴대폰 모드)으로 바뀐다. 이 파일은 메뉴를 열 때만 불러온다(첫 로딩 속도 유지).
import React from "react";
import { doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, collection, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db, DEFAULT_COMPANY } from "../firebase";
import KpSubNav from "../KpSubNav";
import FreightRateInquiry from "../FreightRateInquiry";
import RateCard from "../RateCard";
import FleetManagement from "../FleetManagement";
import ApprovalCenter, { useApprovalCounts } from "../Approval";
import HandoverCenter, { useHandoverUnread } from "../HandoverCenter";
import NoticeBoard from "../NoticeBoard";
import { NoticeWriter, NOTICE_WRITER_ROLES } from "../HomeWriters";
import { OrderHistoryContext } from "../orderHistory";
import StaffManager from "../StaffManager";
import DeptDashboard from "../DeptDashboard";
import DriverDocsReview from "../DriverDocsReview";
import { CashBook, AssetManager } from "../OfficeBooks";
import { LeaveLedger, OnboardingBoard, CertIssuer } from "../HrTools";
import { ExecApprovals, TeamSchedule } from "../ExecSuite";
import { useMyProfile, personName } from "../userNames";
import MobileFleetView from "./MobileFleetView";

// 매출관리는 PC 배차 프로그램 안에 있는 화면이라 그 묶음을 필요할 때만 받아온다
const PcSettlement = React.lazy(() => import("../DispatchApp").then((m) => ({ default: m.PcSettlement })));
// 🏢 경리·인사 모드 — PC 정산관리·회계관리·인사관리 화면
const PcSettleMobile = React.lazy(() => import("../DispatchApp").then((m) => ({ default: m.PcSettleMobile })));
const PcAccounting = React.lazy(() => import("../DispatchApp").then((m) => ({ default: m.PcAccounting })));
const PcHrPage = React.lazy(() => import("../DispatchApp").then((m) => ({ default: m.PcHrPage })));

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";

function Loading() {
  return (
    <div className="py-24 flex flex-col items-center gap-3 text-[#7A879C]">
      <span className="w-6 h-6 border-[3px] border-[#DCE3EE] border-t-[#1B2B4B] rounded-full animate-spin" />
      <span className="text-[12.5px] font-bold">화면 불러오는 중…</span>
    </div>
  );
}

// ── 운임조회 — PC "운임조회"(전국운임조회 · 자사운임표)와 같은 화면 ──
function FareView({ initialTab = "전국운임조회" }) {
  const [tab, setTab] = React.useState(initialTab);
  return (
    <KpSubNav code="FARE LOOKUP" title="통합운임조회" icon="globe" active={tab} onSelect={setTab}
      groups={[{ label: "통합운임조회", items: [
        { key: "전국운임조회", label: "전국운임조회", en: "NATIONAL", icon: "globe" },
        { key: "자사운임표", label: "자사운임표", en: "COMPANY", icon: "money" },
      ] }]}>
      <div className="kp-m-pc"><FreightRateInquiry forceTab={tab} hideHeader /></div>
    </KpSubNav>
  );
}

// ── 지입차관리 — PC와 같은 10개 모듈. 관제현황은 지도 중심의 모바일 관제 화면을 쓴다 ──
const FLEET_MODULES = [
  { key: "tracking", label: "관제현황", en: "LIVE", icon: "pulse" },
  { key: "route", label: "노선관리", en: "ROUTE", icon: "route" },
  { key: "fixed", label: "고정노선", en: "FIXED", icon: "pin" },
  { key: "history", label: "이력 조회", en: "LOG", icon: "history" },
  { key: "attendance", label: "출근기록부", en: "ATT", icon: "clock" },
  { key: "temperature", label: "온도 관제", en: "TEMP", icon: "alert" },
  { key: "cargo-camera", label: "적재함 카메라", en: "CAM", icon: "eye" },
  { key: "vehicle", label: "차량 관리", en: "CARE", icon: "truck" },
  { key: "penalty", label: "과태료·사고 서류", en: "DOC", icon: "file" },
  { key: "registration", label: "기사 등록 관리", en: "REG", icon: "user" },
];
function FleetView({ dispatchData, userCompany, role, onRegisterBack }) {
  const [tab, setTab] = React.useState(() => { try { return sessionStorage.getItem("mFleetTab") || "tracking"; } catch { return "tracking"; } });
  const pick = (k) => { setTab(k); try { sessionStorage.setItem("mFleetTab", k); } catch { /* 무시 */ } };
  return (
    <KpSubNav code="FLEET CONTROL" title="지입차관리" icon="truck" active={tab} onSelect={pick}
      groups={[{ label: "모듈", items: FLEET_MODULES }]}>
      {tab === "tracking"
        ? <div className="-mx-3 -my-3"><MobileFleetView dispatchData={dispatchData} userCompany={userCompany} onRegisterBack={onRegisterBack} /></div>
        : <div className="kp-m-pc"><FleetManagement dispatchData={dispatchData} role={role} forceTab={tab} hideChrome /></div>}
    </KpSubNav>
  );
}

// ── 전자결재 — PC 홈 › 전자결재와 같은 화면(신청·결재·내 기안함·결재선) ──
function ApprovalView({ company, me, initialPage = "inbox" }) {
  const [page, setPage] = React.useState(initialPage);
  // 임원 브리핑에서 누른 결재 문서를 바로 연다
  const [openId, setOpenId] = React.useState(() => { try { const v = sessionStorage.getItem("kpExecApOpen"); sessionStorage.removeItem("kpExecApOpen"); return v || null; } catch { return null; } });
  const counts = useApprovalCounts();
  const hoUnread = useHandoverUnread(me?.uid);
  return (
    <KpSubNav code="E-APPROVAL" title="전자결재" icon="stamp" active={page} onSelect={setPage}
      groups={[{ label: "전자결재", items: [
        { key: "inbox", label: "결재함", en: "INBOX", icon: "stamp", badge: counts.todo },
        { key: "leave", label: "근태·휴가 신청", en: "ATTENDANCE", icon: "clock" },
        { key: "expense", label: "비용·지출 결의", en: "EXPENSE", icon: "wallet" },
        { key: "draft", label: "업무 기안·품의", en: "PROPOSAL", icon: "file" },
        { key: "report", label: "업무 보고·인사", en: "REPORT", icon: "list" },
        { key: "handover", label: "인수인계", en: "HANDOVER", icon: "link", badge: hoUnread },
        { key: "mine", label: "내 기안함", en: "MY DOCUMENTS", icon: "send", badge: counts.mineNew },
        { key: "lines", label: "결재선 관리", en: "LINES", icon: "route" },
      ] }]}>
      <div className="kp-m-pc kp-m-approval">
        {page === "handover"
          ? <HandoverCenter company={company} me={me} isViewer={me?.role === "viewer"} />
          : <ApprovalCenter company={company} me={me} page={page} setPage={setPage} openId={openId} onOpened={() => setOpenId(null)} />}
      </div>
    </KpSubNav>
  );
}

// ── 공지사항 — PC 홈 › 공지사항과 같은 목록(NoticeBoard)·작성 양식(NoticeWriter) ──
function NoticeView({ company, me }) {
  const [notices, setNotices] = React.useState([]);
  const [writer, setWriter] = React.useState(null); // { initial }
  const [openId, setOpenId] = React.useState(null);
  React.useEffect(() => onSnapshot(collection(db, "notices"), (s) => setNotices(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setNotices([])), []);
  const isViewer = me?.role === "viewer";
  const canWrite = NOTICE_WRITER_ROLES.includes(me?.role) && !isViewer;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthN = notices.filter((n) => { const ms = n.createdAt?.toMillis ? n.createdAt.toMillis() : (n.createdAt?.seconds || 0) * 1000; return ms && new Date(ms).toISOString().slice(0, 7) === thisMonth; }).length;
  if (writer) return <div className="kp-m-pc"><NoticeWriter me={me} company={company} initial={writer.initial} onCancel={() => setWriter(null)} onSaved={() => setWriter(null)} /></div>;
  return (
    <div className="px-3 py-3 space-y-3 kp-m-pc">
      <div className="relative overflow-hidden rounded-[22px] px-4 py-4 text-white shadow-[0_14px_32px_rgba(15,26,48,0.25)]"
        style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
        <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>BOARD · NOTICE</div>
        <div className="text-[20px] font-black mt-0.5">공지사항</div>
        <div className="text-[12.5px] text-white/60 mt-0.5">회사 공지 및 주요 안내 사항을 확인합니다.</div>
        <div className="mt-3 flex items-center gap-2">
          {[["전체", notices.length], ["이번 달", monthN]].map(([l, v]) => (
            <div key={l} className="flex-1 rounded-2xl bg-white/[0.08] ring-1 ring-white/15 px-3 py-1.5">
              <div className="text-[11.5px] font-bold text-white/60">{l}</div>
              <div className="text-[19px] font-black tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
            </div>
          ))}
          {canWrite && <button type="button" onClick={() => setWriter({ initial: null })} className="h-12 px-4 rounded-2xl bg-white text-[#0F1A30] text-[14px] font-black shrink-0">+ 새로 등록</button>}
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-[#E3E8F0] p-3">
        <NoticeBoard notices={notices} me={me} canWrite={canWrite} isViewer={isViewer} openId={openId} setOpenId={setOpenId}
          onEdit={(n) => { setOpenId(null); setWriter({ initial: n }); }}
          confirm={(message, onConfirm) => { if (window.confirm(message)) onConfirm(); }} />
      </div>
    </div>
  );
}

export default function MobilePcView({ kind, dispatchData = [], fixedRows = [], clients = [], places = [], role = "", userCompany = "", me: meIn, loadRange, loadFullHistory, onRegisterBack, initial, onGo, deptMode }) {
  // ⭐ 이름은 본인 사용자 문서에서(계정 아이디로 적히던 문제)
  const prof = useMyProfile(meIn?.uid);
  const me = React.useMemo(() => (meIn ? { ...meIn, name: personName(prof) || meIn.name, team: prof?.team || meIn.team || "", position: prof?.position || meIn.position || "" } : meIn), [meIn, prof]);
  const history = React.useMemo(() => ({ loadRange: loadRange || (async () => []), loadFullHistory: loadFullHistory || (async () => {}) }), [loadRange, loadFullHistory]);
  let body = null;
  if (kind === "fare") body = <FareView initialTab={initial || "전국운임조회"} />;
  else if (kind === "ratecard") body = <div className="kp-m-pc"><RateCard dispatchData={dispatchData} userCompany={userCompany} clients={clients} /></div>;
  else if (kind === "fleet") body = <FleetView dispatchData={dispatchData} userCompany={userCompany} role={role} onRegisterBack={onRegisterBack} />;
  else if (kind === "approval") body = <ApprovalView company={userCompany} me={me} initialPage={initial || "inbox"} />;
  else if (kind === "staff") body = <StaffManager company={userCompany} role={role} myUid={me?.uid} initialTab={initial || "pending"} />;
  else if (kind === "notice") body = <NoticeView company={userCompany} me={me} />;
  else if (String(kind).startsWith("dept")) {
    const k = String(kind).slice(5);
    const isViewer = role === "viewer";
    const wrap = (el) => <div className="px-3 py-3 kp-m-pc">{el}</div>;
    const lazy = (el) => <React.Suspense fallback={<Loading />}><div className="kp-m-pc">{el}</div></React.Suspense>;
    if (!k) body = deptMode === "exec"
      ? <div className="px-2 py-2"><DeptDashboard mode="exec" company={userCompany} dispatchData={dispatchData} onGo={onGo} me={me} /></div>
      : wrap(<DeptDashboard mode={deptMode || (role === "hrManager" ? "hr" : "acct")} company={userCompany} dispatchData={dispatchData} onGo={onGo} />);
    else if (k === "approvals") body = <div className="kp-m-pc kp-m-approval"><ExecApprovals company={userCompany} me={me} /></div>;
    else if (k === "schedule") body = wrap(<TeamSchedule company={userCompany} />);
    else if (k === "settle") body = lazy(<PcSettleMobile dispatchData={dispatchData} companyName={userCompany} role={role} isViewer={isViewer} />);
    else if (k === "acct") body = lazy(<div className="px-2 py-2"><PcAccounting dispatchData={dispatchData} fixedRows={fixedRows} clients={clients} isViewer={isViewer} /></div>);
    else if (k === "hr") body = lazy(<PcHrPage userCompany={userCompany} role={role} userId={me?.uid || ""} />);
    else if (k === "cashbook") body = wrap(<CashBook company={userCompany} isViewer={isViewer} />);
    else if (k === "assets") body = wrap(<AssetManager company={userCompany} isViewer={isViewer} />);
    else if (k === "leave") body = wrap(<LeaveLedger company={userCompany} isViewer={isViewer} />);
    else if (k === "onboarding") body = wrap(<OnboardingBoard company={userCompany} isViewer={isViewer} />);
    else if (k === "cert") body = wrap(<CertIssuer company={userCompany} isViewer={isViewer} />);
    else if (k === "driverdocs") body = wrap(<DriverDocsReview company={userCompany} isViewer={isViewer} />);
  }
  else if (kind === "revenue") body = (
    <React.Suspense fallback={<Loading />}>
      <div className="kp-m-pc"><PcSettlement dispatchData={dispatchData} fixedRows={fixedRows} clients={clients} places={places} role={role} isViewer={role === "viewer"} userCompany={userCompany} /></div>
    </React.Suspense>
  );
  return <OrderHistoryContext.Provider value={history}>{body}</OrderHistoryContext.Provider>;
}
