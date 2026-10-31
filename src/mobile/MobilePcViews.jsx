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
import MobileFleetView from "./MobileFleetView";

// 매출관리는 PC 배차 프로그램 안에 있는 화면이라 그 묶음을 필요할 때만 받아온다
const PcSettlement = React.lazy(() => import("../DispatchApp").then((m) => ({ default: m.PcSettlement })));

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
          : <ApprovalCenter company={company} me={me} page={page} setPage={setPage} />}
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

// ── 직원 관리(관리자·마스터) — PC 관리자메뉴의 직원 승인·권한을 휴대폰에서 ──
const ROLE_LABEL = { admin: "관리자", hrManager: "인사관리자", user: "실무자", test: "경리/회계", viewer: "조회전용", totalMaster: "최고관리자" };
// 승인 대기 직원·기사 수(메뉴 숫자)
export function usePendingSignups(company, enabled = true) {
  const [n, setN] = React.useState({ staff: 0, drivers: 0 });
  React.useEffect(() => {
    if (!enabled || !company) return undefined;
    return onSnapshot(collection(db, "users"), (s) => {
      let staff = 0; let drivers = 0;
      s.docs.forEach((d) => {
        const u = d.data();
        if (u.approved !== false || u.employmentStatus === "퇴사" || (u.companyName || DEFAULT_COMPANY) !== company) return;
        if (u.role === "driver") drivers += 1;
        else if (!["shipper", "cafeUser", "totalMaster"].includes(u.role)) staff += 1;
      });
      setN({ staff, drivers });
    }, () => setN({ staff: 0, drivers: 0 }));
  }, [company, enabled]);
  return n;
}

function Avatar({ name }) {
  return <span className="w-10 h-10 rounded-xl bg-[#1B2B4B] text-white grid place-items-center text-[14px] font-black shrink-0">{String(name || "?").slice(0, 1)}</span>;
}

function StaffView({ company, role, myUid, initialTab = "pending" }) {
  const [users, setUsers] = React.useState(null);
  const [tab, setTab] = React.useState(initialTab);
  const [busy, setBusy] = React.useState("");
  React.useEffect(() => onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setUsers([])), []);
  const me = (users || []).find((u) => u.id === myUid);
  const isTotal = role === "totalMaster";
  const isMaster = isTotal || me?.isMaster === true;
  const isViewer = role === "viewer";
  const mine = (users || []).filter((u) => (u.companyName || DEFAULT_COMPANY) === company);
  const staff = mine.filter((u) => !["driver", "shipper", "cafeUser", "totalMaster"].includes(u.role));
  const drivers = mine.filter((u) => u.role === "driver");
  const active = staff.filter((u) => u.employmentStatus !== "퇴사");
  const lists = {
    pending: active.filter((u) => !u.approved),
    staff: active.filter((u) => u.approved),
    left: staff.filter((u) => u.employmentStatus === "퇴사"),
    dpending: drivers.filter((u) => u.approved === false),
    drivers: drivers.filter((u) => u.approved !== false),
  };
  // PC 관리자메뉴 toggleApprove와 같은 처리(가입 신청서 상태도 같이 맞춘다)
  const toggleApprove = async (u) => {
    if (isViewer) return alert("조회전용 권한으로는 수정할 수 없습니다.");
    const next = !u.approved;
    const who = u.name || u.이름 || u.email;
    if (!window.confirm(next ? `"${who}"님을 승인할까요?` : `"${who}"님의 승인을 해제할까요?\n해제하면 로그인이 막힙니다.`)) return;
    setBusy(u.id);
    try {
      await setDoc(doc(db, "users", u.id), { approved: next }, { merge: true });
      if (u.role === "driver") {
        // PC 지입차관리 › 기사 등록 관리와 같은 처리
        await updateDoc(doc(db, "drivers", u.id), { approved: next }).catch(() => {});
      } else {
        const t = await getDocs(query(collection(db, "transportApplications"), where("userId", "==", u.id))).catch(() => null);
        for (const d of t?.docs || []) await updateDoc(doc(db, "transportApplications", d.id), { status: next ? "approved" : "pending", processedAt: serverTimestamp() }).catch(() => {});
      }
    } finally { setBusy(""); }
  };
  const reject = async (u) => {
    if (isViewer) return;
    if (!window.confirm(`"${u.name || u.email}"님의 가입 신청을 거절할까요?\n신청 정보가 삭제됩니다.`)) return;
    setBusy(u.id);
    try {
      await deleteDoc(doc(db, "users", u.id));
      if (u.role === "driver") await deleteDoc(doc(db, "drivers", u.id)).catch(() => {});
    } catch (e) { alert(e.message); } finally { setBusy(""); }
  };
  const changeRole = async (u, r) => {
    if (!isMaster || r === u.role) return;
    setBusy(u.id);
    try { await setDoc(doc(db, "users", u.id), { role: r }, { merge: true }); } finally { setBusy(""); }
  };
  const L = lists[tab] || [];
  const isDriverTab = tab === "dpending" || tab === "drivers";
  const empty = { pending: "승인 대기 중인 직원이 없습니다", staff: "직원이 없습니다", left: "퇴사자가 없습니다", dpending: "가입 신청한 기사님이 없습니다", drivers: "승인된 기사님이 없습니다" }[tab];
  return (
    <KpSubNav code="ADMIN · STAFF" title="직원 관리" icon="users" active={tab} onSelect={setTab}
      groups={[
        { label: "직원", items: [
          { key: "pending", label: "직원 승인 대기", en: "PENDING", icon: "hourglass", badge: lists.pending.length },
          { key: "staff", label: "재직 직원", en: "STAFF", icon: "users" },
          { key: "left", label: "퇴사자", en: "LEFT", icon: "user" },
        ] },
        { label: "기사관리", items: [
          { key: "dpending", label: "기사 가입 승인", en: "DRIVER SIGNUP", icon: "truck", badge: lists.dpending.length },
          { key: "drivers", label: "승인된 기사", en: "DRIVERS", icon: "idcard" },
        ] },
      ]}>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(isDriverTab
          ? [["가입 대기", lists.dpending.length], ["승인 기사", lists.drivers.length], ["전체", drivers.length]]
          : [["승인 대기", lists.pending.length], ["재직", lists.staff.length], ["퇴사", lists.left.length]]).map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-white border border-[#E3E8F0] px-3 py-2.5">
            <div className="text-[11.5px] font-bold text-[#7A879C]">{l}</div>
            <div className="text-[20px] font-black text-[#0F1A30] tabular-nums" style={{ fontFamily: MONO }}>{v}</div>
          </div>
        ))}
      </div>
      {users === null ? <Loading /> : L.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[#9AA9C3] font-bold">{empty}</div>
      ) : (
        <div className="space-y-2">
          {L.map((u) => (
            <div key={u.id} className="rounded-2xl bg-white border border-[#E3E8F0] px-3.5 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={u.name || u.email} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[15px] font-black text-[#0F1A30] truncate">{u.name || "-"}</span>
                    {u.isMaster && <span className="px-1.5 h-[18px] rounded-md bg-[#0F1A30] text-white text-[10px] font-black grid place-items-center">마스터</span>}
                    {isDriverTab
                      ? u.carNo && <span className="px-1.5 h-[20px] rounded-md border border-[#0F1A30] text-[#0F1A30] text-[11.5px] font-black grid place-items-center">{u.carNo}</span>
                      : u.position && <span className="text-[12px] font-bold text-[#7A879C]">{u.position}</span>}
                  </div>
                  <div className="text-[12px] text-[#7A879C] truncate">
                    {isDriverTab ? [u.vehicleType, u.거주지, u.phone].filter(Boolean).join(" · ") : [u.team, u.email, u.phone].filter(Boolean).join(" · ")}
                  </div>
                  {isDriverTab && u.요청사항 && <div className="text-[11.5px] text-[#5B6B85] truncate">요청: {u.요청사항}</div>}
                </div>
              </div>
              {!isViewer && u.id !== myUid && tab !== "left" && (
                <div className="mt-2.5 flex gap-1.5">
                  {!u.approved && <button type="button" disabled={busy === u.id} onClick={() => reject(u)} className="h-9 px-3.5 rounded-xl text-[12.5px] font-black border border-[#DCE3EE] text-[#5B6B85] bg-white disabled:opacity-50">거절</button>}
                  <button type="button" disabled={busy === u.id} onClick={() => toggleApprove(u)}
                    className={`flex-1 h-9 rounded-xl text-[12.5px] font-black disabled:opacity-50 ${u.approved ? "border border-[#DCE3EE] text-[#3A4A66] bg-white" : "text-white bg-[#1B2B4B]"}`}>
                    {u.approved ? "승인 해제" : "승인"}
                  </button>
                </div>
              )}
              {!isDriverTab && tab !== "left" && (
                <div className="mt-2 flex gap-1 overflow-x-auto no-scrollbar">
                  {["admin", "hrManager", "user", "test", "viewer"].map((r) => {
                    const on = (u.role || "user") === r;
                    const can = isMaster && !u.isMaster && u.id !== myUid;
                    return (
                      <button key={r} type="button" disabled={!can || busy === u.id} onClick={() => changeRole(u, r)}
                        className={`shrink-0 h-7 px-2.5 rounded-lg text-[11.5px] font-black border ${on ? "bg-[#EEF3FC] border-[#2D4C82]/40 text-[#1B2B4B]" : "bg-white border-[#E3E8F0] text-[#9AA9C3]"} ${can ? "" : "cursor-default"}`}>
                        {ROLE_LABEL[r]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {!isMaster && !isDriverTab && <p className="text-[11.5px] text-[#9AA9C3] text-center pt-1">권한 변경은 마스터만 할 수 있습니다</p>}
        </div>
      )}
    </KpSubNav>
  );
}

export default function MobilePcView({ kind, dispatchData = [], fixedRows = [], clients = [], places = [], role = "", userCompany = "", me, loadRange, loadFullHistory, onRegisterBack, initial }) {
  const history = React.useMemo(() => ({ loadRange: loadRange || (async () => []), loadFullHistory: loadFullHistory || (async () => {}) }), [loadRange, loadFullHistory]);
  let body = null;
  if (kind === "fare") body = <FareView initialTab={initial || "전국운임조회"} />;
  else if (kind === "ratecard") body = <div className="kp-m-pc"><RateCard dispatchData={dispatchData} userCompany={userCompany} clients={clients} /></div>;
  else if (kind === "fleet") body = <FleetView dispatchData={dispatchData} userCompany={userCompany} role={role} onRegisterBack={onRegisterBack} />;
  else if (kind === "approval") body = <ApprovalView company={userCompany} me={me} initialPage={initial || "inbox"} />;
  else if (kind === "staff") body = <StaffView company={userCompany} role={role} myUid={me?.uid} initialTab={initial || "pending"} />;
  else if (kind === "notice") body = <NoticeView company={userCompany} me={me} />;
  else if (kind === "revenue") body = (
    <React.Suspense fallback={<Loading />}>
      <div className="kp-m-pc"><PcSettlement dispatchData={dispatchData} fixedRows={fixedRows} clients={clients} places={places} role={role} isViewer={role === "viewer"} userCompany={userCompany} /></div>
    </React.Suspense>
  );
  return <OrderHistoryContext.Provider value={history}>{body}</OrderHistoryContext.Provider>;
}
