import NoticeBoard from "./NoticeBoard";
import DeptDashboard from "./DeptDashboard";
import ObituaryWriter from "./ObituaryWriter";
import { ExecScheduleBoard, canWriteExecSchedule } from "./ExecSuite";
import { CompanyRules } from "./HrHub";
import React, { useMemo, useState, useRef, useEffect } from "react";
import MasterChecklist from "./MasterChecklist";
import { homeItemFeature, openPlanLock, planIncludes, usePlan } from "./plans";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceDot,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, deleteDoc, updateDoc, where, setDoc, getDoc, arrayUnion, getDocs,
} from "firebase/firestore";
import { db, auth, DEFAULT_COMPANY } from "./firebase";
import { EditableText } from "./EditMode";
import { pcLiveWindowStart, pcPrevDay } from "./orderHistory";
import { pcBootStore, markBootBase } from "./bootProgress";
import { createPortal } from "react-dom";
import { BannerCard, BannerStyles } from "./BannerCenter";
import HomeDeck, { buildPastStats } from "./HomeDeck";
import KpSubNav from "./KpSubNav";
import { MailWorkspace, MAIL_FOLDERS, useMailCounts, folderBadge } from "./InternalMail";
import ApprovalCenter, { useApprovalCounts } from "./Approval";
import HandoverCenter from "./HandoverCenter";
import { useMyProfile, personName } from "./userNames";
import ContractStudio from "./ContractStudio";
import BoardPage, { BOARDS, canSeeBoard, useBoardLatest } from "./BoardPosts";
import { NoticeWriter, HandoverWriter, NOTICE_WRITER_ROLES, handoverReceivers } from "./HomeWriters";

/* ===== 공통 Modal ===== */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-[440px] shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center px-5 py-4 bg-[#1B2B4B]">
          <h3 className="font-bold text-white text-[15px]">{title}</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ===== KPI 카드 ===== */
// ⭐ 2026-10-23 개편 — 회사관리와 같은 디자인(흰 카드 + 아이콘 배지 + 큰 숫자)
const KP_HOME_CARD = "bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]";
const KPI_TONES = {
  blue: { badge: "bg-[#EEF3FB] text-[#1B2B4B]", bar: "bg-[#1B2B4B]" },
  // ⭐ 알록달록 금지 — 전부 남색 계열
  red: { badge: "bg-[#EEF3FB] text-[#1B2B4B]", bar: "bg-[#1B2B4B]" },
  green: { badge: "bg-[#EEF3FB] text-[#1B2B4B]", bar: "bg-[#1B2B4B]" },
  orange: { badge: "bg-[#EEF3FB] text-[#1B2B4B]", bar: "bg-[#1B2B4B]" },
};
const KPI_ICONS = {
  blue: <><rect x="1" y="6" width="13" height="10" rx="1.5" /><path d="M14 9h4l3 3.5V16h-7z" /><circle cx="5.5" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>,
  red: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  green: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  orange: <><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></>,
};
function KpiCard({ title, value, unit = "", color = "blue", sub }) {
  const t = KPI_TONES[color] || KPI_TONES.blue;
  return (
    <div className={`${KP_HOME_CARD} relative overflow-hidden px-6 py-5`}>
      <div className={`absolute left-0 top-0 h-full w-1 ${t.bar}`} />
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${t.badge}`}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{KPI_ICONS[color]}</svg>
        </div>
        <div className="text-[14px] font-bold text-gray-600">
          <EditableText id={`home.kpi.${title}`} defaultText={title} />
        </div>
      </div>
      <div className="mt-3 text-[30px] font-black text-[#0F1A30] tabular-nums leading-none tracking-tight">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <span className="text-[15px] font-bold text-gray-400 ml-1">{unit}</span>}
      </div>
      {sub && <div className="mt-2 text-[12.5px] font-semibold text-gray-500">{sub}</div>}
    </div>
  );
}

/* ===== 섹션 카드 ===== */
function SectionCard({ title, eyebrow, desc, action, children, bodyClass = "px-6 pb-6" }) {
  return (
    <div className={`${KP_HOME_CARD} overflow-hidden`}>
      {title && (
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 mb-4 border-b border-[#EEF1F6]">
          <div className="flex-1 min-w-0">
            {eyebrow && <div className="text-[11px] font-extrabold tracking-[0.22em] text-[#4B6CB7]">{eyebrow}</div>}
            <h3 className="mt-0.5 text-[18px] font-black text-[#0F1A30] tracking-tight">
              <EditableText id={`home.section.${title}`} defaultText={title} />
            </h3>
            {desc && <div className="text-[13px] text-gray-500 mt-0.5">{desc}</div>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </div>
  );
}

function CountUp({ value, duration = 900 }) {
  const [display, setDisplay] = React.useState(0);
  React.useEffect(() => {
    let start = 0;
    const end = Number(value) || 0;
    if (end === 0) { setDisplay(0); return; }
    const totalFrames = Math.round(duration / 16);
    const increment = end / totalFrames;
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      const next = Math.min(Math.round(increment * frame), end);
      setDisplay(next);
      if (frame >= totalFrames) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [value, duration]);
  return <>{display.toLocaleString()}</>;
}

function formatCreatedAt(createdAt) {
  if (!createdAt) return null;
  const k = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  if (createdAt.seconds) return k(createdAt.seconds * 1000);
  if (createdAt instanceof Date) return k(createdAt.getTime());
  const d = new Date(createdAt);
  if (!isNaN(d.getTime())) return k(d.getTime());
  return null;
}

/* ===== 게시판 테이블 공통 ===== */
// 메일함처럼 — 번호·날짜·작성자는 좁게, 제목·내용 칸이 남는 폭을 다 쓴다
const WIDE_COLS = ["제목", "일정", "내용", "인수인계 내용", "업무 내용"];
function BoardTable({ headers, rows }) {
  return (
    <table className="w-full text-[14px] table-fixed">
      <thead>
        <tr style={{ background: "linear-gradient(90deg,#0F1A30,#1B2B4B 50%,#24396A)" }}>
          {headers.map((h, i) => (
            <th key={i} className={`px-3 py-3.5 font-extrabold text-white text-[14px] whitespace-nowrap ${h.align || "text-center"}`}
              style={{ width: WIDE_COLS.includes(h.label) ? undefined : h.width }}>
              <EditableText id={`home.table.header.${h.label}`} defaultText={h.label} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">{rows}</tbody>
    </table>
  );
}

/* ===== 페이지네이션 ===== */
function Pagination({ page, total, onChange }) {
  if (total <= 1) return null;
  return (
    <div className="flex justify-center gap-1.5 pt-4">
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} onClick={() => onChange(i + 1)}
          style={{ fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace" }}
          className={`w-9 h-9 rounded-xl text-[13px] font-extrabold transition ${i + 1 === page ? "bg-[#1B2B4B] text-white shadow-[0_4px_10px_rgba(27,43,75,0.25)]" : "bg-white border border-[#E3E8F0] text-[#4b5563] hover:bg-[#F4F7FC]"}`}>
          {i + 1}
        </button>
      ))}
    </div>
  );
}

/* ===== ApprovalBadge ===== */
function ApprovalBadge({ status }) {
  if (!status || status === "pending" || status === "none") {
    return (
      <span className="animate-pulse" style={{
        display: "inline-block", padding: "4px 10px", borderRadius: 6,
        background: "white", border: "1.5px solid #d1d5db",
        color: "#111827", fontSize: 12, fontWeight: 700,
      }}>대기</span>
    );
  }
  if (status === "approved") return (
    <span style={{
      display: "inline-block", padding: "4px 10px", borderRadius: 6,
      background: "#1B2B4B", color: "white", fontSize: 12, fontWeight: 700,
    }}>승인</span>
  );
  if (status === "rejected") return (
    <span style={{
      display: "inline-block", padding: "4px 10px", borderRadius: 6,
      background: "#DC2626", color: "white", fontSize: 12, fontWeight: 700,
    }}>반려</span>
  );
  if (status === "hold") return (
    <span style={{ color: "#6B7280", fontSize: 12, fontWeight: 700 }}>보류</span>
  );
  const map = { in_progress: ["진행중", "#3B82F6"] };
  const [label, color] = map[status] || ["대기", "#9CA3AF"];
  return <span style={{ color, fontSize: 12, fontWeight: 700 }}>{label}</span>;
}

/* ===== ApprovalStamp ===== */
function ApprovalStamp({ status }) {
  if (!status || status === "pending" || status === "in_progress" || status === "none") return null;
  const map = { approved: ["승 인", "#1B2B4B"], rejected: ["반 려", "#DC2626"], hold: ["보 류", "#6B7280"] };
  const [label, color] = map[status] || [];
  if (!label) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div style={{ border: `4px solid ${color}`, color, transform: "rotate(-12deg)", opacity: 0.88 }}
        className="w-32 h-32 rounded-full flex items-center justify-center">
        <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: "0.2em" }}>{label}</span>
      </div>
    </div>
  );
}

// A4 한 장에 꽉 차게 인쇄되는 휴가/일정 신청서 — 화면에 있는 결재선/신청서
// 테이블/문구를 그대로 옮겨서 새 창에 그리고 바로 인쇄 대화상자를 띄운다.
// 화면 모달을 그대로 인쇄하면 승인/반려 버튼, 삭제/수정 버튼까지 같이
// 찍히므로, 인쇄 전용 문서를 별도로 만드는 방식을 쓴다.
const escapeHtmlForPrint = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function handlePrintSchedule({ schedule, approvers, overallStatus, typeLabel }) {
  const title = typeLabel[schedule.type] || "일정 신청서";
  const stampMap = { approved: ["승 인", "#1B2B4B"], rejected: ["반 려", "#DC2626"], hold: ["보 류", "#6B7280"] };
  const stamp = stampMap[overallStatus];

  const approverCellsHtml = (approvers || []).map((a) => {
    const statusLabel = a.status === "approved" ? "승인" : a.status === "rejected" ? "반려" : a.status === "hold" ? "보류" : "대기";
    const statusColor = a.status === "approved" ? "#1B2B4B" : a.status === "rejected" ? "#DC2626" : a.status === "hold" ? "#6B7280" : "#9CA3AF";
    return `
      <td style="border-left:1.5px solid #9CA3AF; text-align:center; min-width:100px;">
        <div style="font-size:13px; font-weight:700; border-bottom:1.5px solid #9CA3AF; padding:7px 0;">결재자</div>
        <div style="font-size:17px; font-weight:700; padding:16px 8px;">${escapeHtmlForPrint(a.name)}</div>
        <div style="font-size:14px; font-weight:700; color:${statusColor}; border-top:1.5px solid #9CA3AF; padding:7px 0;">${statusLabel}</div>
      </td>`;
  }).join("");

  const rows = [
    ["구 분", schedule.type || ""],
    ["작 성 자", schedule.name || ""],
    ["기 간", `${schedule.start || ""} ~ ${schedule.end || ""}`],
    ...(schedule.memo ? [["사 유", schedule.memo]] : []),
  ];
  const rowsHtml = rows.map(([label, val]) => `
    <tr>
      <td style="background:#F9FAFB; padding:18px 22px; font-size:16px; font-weight:700; color:#4B5563; width:140px; border:1px solid #D1D5DB; white-space:nowrap;">${label}</td>
      <td style="padding:18px 22px; font-size:17px; color:#111827; border:1px solid #D1D5DB; white-space:pre-wrap;">${escapeHtmlForPrint(val)}</td>
    </tr>`).join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { font-family: "Malgun Gothic", "맑은 고딕", sans-serif; margin: 0; color: #111827; }
  .sheet { min-height: 100%; display: flex; flex-direction: column; justify-content: center; }
  .doc-title { text-align: center; font-size: 30px; font-weight: 900; letter-spacing: 0.3em; color: #1B2B4B; margin-bottom: 40px; }
  .approver-wrap { display: flex; justify-content: flex-end; margin-bottom: 30px; }
  .approver-table { border: 1.5px solid #9CA3AF; border-collapse: collapse; }
  .approver-label-cell { border-right: 1.5px solid #9CA3AF; padding: 0 12px; text-align: center; font-size: 14px; font-weight: 700; }
  table.main { width: 100%; border-collapse: collapse; margin-bottom: 36px; }
  .stamp-box { position: relative; }
  .stamp-circle { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-12deg); width: 140px; height: 140px; border-radius: 50%; border: 5px solid ${stamp ? stamp[1] : "#000"}; display: flex; align-items: center; justify-content: center; opacity: 0.85; }
  .stamp-circle span { font-size: 26px; font-weight: 900; letter-spacing: 0.2em; color: ${stamp ? stamp[1] : "#000"}; }
  .notice { border-top: 3px solid #1B2B4B; border-bottom: 3px solid #1B2B4B; padding: 24px 0; text-align: center; font-size: 19px; font-weight: 700; color: #1B2B4B; line-height: 1.9; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="doc-title">${title}</div>
    ${(approvers || []).length ? `
    <div class="approver-wrap">
      <table class="approver-table"><tr>
        <td class="approver-label-cell">결<br/>재</td>
        ${approverCellsHtml}
      </tr></table>
    </div>` : ""}
    <div class="stamp-box">
      ${stamp ? `<div class="stamp-circle"><span>${stamp[0]}</span></div>` : ""}
      <table class="main"><tbody>${rowsHtml}</tbody></table>
    </div>
    <div class="notice">상기 사유로 인하여 결재를 요청하오니<br/>승인하여 주시기 바랍니다.</div>
  </div>
  <script>
    window.onload = function () { window.print(); };
    window.onafterprint = function () { window.close(); };
  </script>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) { alert("팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제해주세요."); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

/* ===== getOverallApprovalStatus ===== */
function getOverallApprovalStatus(s) {
  const approvers = s.approvers || (s.approverUid ? [{ uid: s.approverUid, name: s.approverName, status: s.approvalStatus || "pending" }] : []);
  if (approvers.length === 0) return "none";
  const statuses = approvers.map(a => a.status || "pending");
  if (statuses.every(st => st === "approved")) return "approved";
  if (statuses.some(st => st === "rejected")) return "rejected";
  if (statuses.every(st => st === "hold")) return "hold";
  if (statuses.some(st => st !== "pending")) return "in_progress";
  return "pending";
}

/* ===== 등록 버튼 ===== */
const RegBtn = ({ onClick }) => (
  <button onClick={onClick} className="px-3 py-1 bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[12px] font-semibold rounded-lg transition">
    + 등록
  </button>
);

function formatCreatedAtTime(createdAt) {
  if (!createdAt) return "-";
  const d = createdAt.seconds ? new Date(createdAt.seconds * 1000) : new Date(createdAt);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/* ===== 모듈 레벨: 당일 닫기/읽기 완료된 토스트 ID 관리 ===== */
const _dismissedToasts = new Set();
// 계정별 Firestore 기반 seen 키 세트 (로드 완료 후 채워짐)
const _firestoreSeenKeys = new Set();
let _firestoreSeenLoaded = false;

// ⭐ 끊김 개선(2026-10-27) — 미배차 롤링 목록. 3초마다 넘기는 상태를 여기에만 두어 홈 화면 전체가 다시 그려지지 않게 한다.
function PendingTicker({ orders: allPendingOrders = [], onOrderDoubleClick }) {
  const TICKER_PAGE_SIZE = 6;
  const [tickerPage, setTickerPage] = useState(0);
  const totalTickerPages = Math.max(1, Math.ceil(allPendingOrders.length / TICKER_PAGE_SIZE));

  useEffect(() => {
    if (allPendingOrders.length <= TICKER_PAGE_SIZE) return;
    const t = setInterval(() => {
      setTickerPage(p => (p + 1) % totalTickerPages);
    }, 3000);
    return () => clearInterval(t);
  }, [allPendingOrders.length, totalTickerPages]);
  return (
    <>
    {/* ticker rows */}
    <div
      key={tickerPage}
      style={{ animation: "tickerSlideUp 0.45s cubic-bezier(0.4,0,0.2,1)" }}
    >
      {allPendingOrders.slice(tickerPage * TICKER_PAGE_SIZE, tickerPage * TICKER_PAGE_SIZE + TICKER_PAGE_SIZE).map((d, i) => {
        const 상차일 = (d?.상차일자 || d?.상차일 || d?.상차 || "").slice(5);
        const 하차일 = (d?.하차일자 || d?.하차일 || "").slice(5);
        const status = d?.배차상태 || "미배차";
        return (
          <div
            key={i}
            className="grid items-center border-b border-[#EEF1F6] hover:bg-[#F5F8FD] cursor-pointer transition w-full bg-white"
            style={{ gridTemplateColumns: "1fr 1.3fr 1fr 1.3fr 1.6fr 1.4fr 1.4fr 1.2fr 1.2fr 0.7fr 1.2fr" }}
            onDoubleClick={() => onOrderDoubleClick && onOrderDoubleClick(d)}
          >
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{상차일}</span>
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{d?.상차시간 || ""}</span>
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{하차일}</span>
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{d?.하차시간 || ""}</span>
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{d?.거래처명 || ""}</span>
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{d?.상차지명 || ""}</span>
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{d?.하차지명 || ""}</span>
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{d?.화물내용 || ""}</span>
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{d?.차량종류 || ""}</span>
            <span className="text-center px-2 py-3 text-[13.5px] font-semibold text-[#0F1A30] truncate">{d?.차량톤수 || ""}</span>
            <span className="text-center px-2 py-3 whitespace-nowrap"><span className="inline-block px-2.5 py-0.5 rounded-full text-[12px] font-bold bg-red-50 text-red-600">{status}</span></span>
          </div>
        );
      })}
    </div>
    {/* page indicator */}
    {totalTickerPages > 1 && (
      <div className="flex justify-center gap-1 py-2.5">
        {Array.from({ length: Math.min(totalTickerPages, 12) }).map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300 cursor-pointer"
            onClick={() => setTickerPage(i)}
            style={{
              width: i === tickerPage ? 16 : 6,
              height: 6,
              background: i === tickerPage ? "#1B2B4B" : "#d1d5db",
            }}
          />
        ))}
      </div>
    )}
    </>
  );
}

/* ===================== HOME DASHBOARD ===================== */
// 💳 요금제에 전자결재·메일·게시판(groupware)이 없으면 그 항목들을 잠금 항목 하나로 바꾼다(공지사항·대시보드는 그대로)
function lockHomeGroups(planId, groups) {
  if (planIncludes(planId, "groupware")) return groups;
  const out = groups.map((g) => ({ ...g, items: g.items.filter((it) => !homeItemFeature(it.key)) })).filter((g) => g.items.length);
  out.push({ label: "베이직 이상", items: [{ key: "lock:groupware", label: "전자결재 · 메일 · 게시판", en: "LOCKED · BASIC", icon: "key" }] });
  return out;
}

export default function HomeDashboard({ role, user, userCompany = "", pending, delayed, dispatchData = [], onOrderDoubleClick, dept = null, onDeptGo }) {
  // ⭐ 년 매출·당월 매출·누적 오더 — 예전엔 새로고침할 때마다 올해 오더 전체(수천~만 건)를 서버에서 다시 받아
  // 새로고침이 느리고 버벅였다. "실시간 범위(최근 7일) 이전" 기간의 합계는 하루 동안 거의 안 바뀌므로
  // 하루 1번만 받아 계산해 PC에 저장해 두고(homePastStats), 최근 7일~은 실시간 데이터로 더한다.
  const liveStartStr = pcLiveWindowStart();
  // ⭐ 버그수정(2026-10-23) — 예전엔 모든 운송사 오더를 합쳐 계산했고, 초기화해도 하루 동안 옛 숫자가 남았다.
  //   지금 보고 있는 회사 오더만 더하고, 저장할 때 회사명을 같이 적어 둔다(v3).
  //   초기화·복원·가져오기가 있으면 서버가 systemConfig/dataVersion.{회사}에 시각을 남기고, 그보다 오래된 저장값은 다시 계산한다.
  const homeCompany = (() => {
    try {
      return role === "totalMaster"
        ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
        : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);
    } catch { return userCompany || DEFAULT_COMPANY; }
  })();
  const [pastCache, setPastCache] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem("homePastStats") || "null");
      return c && c.v === 4 && c.company === homeCompany && c.liveStart === liveStartStr && c.calYear === new Date().getFullYear() ? c : null;
    } catch { return null; }
  });
  useEffect(() => {
    markBootBase(pcBootStore, "homeMounted");
    // 오늘 이미 계산해 둔 지난 기간 합계가 있으면 다시 받지 않는다(첫 진입 로딩 화면에 "준비 완료" 알림)
    let alive = true;
    // 합계만 계산하고 화면 데이터에는 합치지 않는다 — 수천 건을 화면 데이터에 합치면 그 순간 전체 화면이 다시 그려져 버벅인다
    const recompute = () => {
      const y = new Date().getFullYear();
      const end = pcPrevDay(liveStartStr);
      return Promise.all(["orders", "dispatch"].map((col) => getDocs(query(collection(db, col), where("상차일", ">=", `${y}-01-01`), where("상차일", "<=", end)))))
        .then((snaps) => {
          const rows = snaps.flatMap((sn) => sn.docs.map((d) => d.data() || {})).filter((row) =>
            (row.companyName || DEFAULT_COMPANY) === homeCompany &&
            row.source !== "transport_transmit" && row.배차상태 !== "배차취소" && !["취소", "배차취소", "오더취소", "취소됨"].includes(row.상태));
          const c = { ...sumStats(rows), ...buildPastStats(rows, new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7)), v: 4, company: homeCompany, liveStart: liveStartStr, calYear: y, savedAt: Date.now() };
          try { localStorage.setItem("homePastStats", JSON.stringify(c)); } catch { /* 용량 초과 등은 무시 */ }
          if (alive) setPastCache(c);
        })
        .catch((e) => console.warn("홈 통계(지난 기간) 불러오기 실패:", e));
    };
    if (pastCache) {
      markBootBase(pcBootStore, "home");
      // 저장값이 있어도 그 뒤에 초기화·가져오기가 있었으면 뒤에서 조용히 다시 계산한다
      getDoc(doc(db, "systemConfig", "dataVersion")).then((snap) => {
        const v = snap.data()?.[homeCompany];
        const ms = v?.toMillis ? v.toMillis() : 0;
        if (ms > (pastCache.savedAt || 0)) recompute();
      }).catch(() => {});
    } else {
      recompute().finally(() => markBootBase(pcBootStore, "home")); // 실패해도 로딩 화면은 넘어간다(다음 새로고침에 다시 시도)
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const isEditingHandoverRef = useRef(false);
  const [toast, setToast] = useState(null);
  const [firestoreSeenReady, setFirestoreSeenReady] = useState(false);
  const pendingToasts = useRef([]); // Firestore 로드 전에 쌓인 토스트 후보
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayStr = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜(UTC로 하면 새벽 0~9시에 어제가 됨)

  const getLoadDate = (row) => {
    const v = row?.상차일자 || row?.상차일 || row?.상차;
    if (!v) return null;
    const d = new Date(String(v).slice(0, 10));
    return isNaN(d.getTime()) ? null : d;
  };

  const [period, setPeriod] = useState("7d");
  const isViewer = role === "viewer";
  const [boardTabRaw, setBoardTab] = React.useState("대시보드"); // ★ 2026-10-28 — 홈 왼쪽 사이드바: 대시보드 | 공지사항 | 휴가/외근 | 인수인계
  const boardTab = boardTabRaw === "인수인계" ? "ap:handover" : boardTabRaw; // ★ 2026-10-31 인수인계는 전자결재 › 인수인계로 옮김
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeForm, setNoticeForm] = React.useState({ category: "공지사항", author: "", content: "", audience: "internal" });
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleForm, setScheduleForm] = React.useState({ type: "휴가", authorName: "", start: "", end: "", memo: "", approvers: [] });
  const [notices, setNotices] = React.useState([]);
  const [schedules, setSchedules] = React.useState([]);
  const [handovers, setHandovers] = React.useState([]);

  const NOTICE_PAGE_SIZE = 12;
  const [noticePage, setNoticePage] = useState(1);
  const SCHEDULE_PAGE_SIZE = 12;
  const [schedulePage, setSchedulePage] = useState(1);
  const [scheduleAuthorSearch, setScheduleAuthorSearch] = useState("");

  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverForm, setHandoverForm] = useState({ text: "", author: "", authorUid: user?.uid || "", receiver: "", receiverUid: "", date: todayStr });
  const [selectedHandover, setSelectedHandover] = useState(null);
  const [handoverEditMode, setHandoverEditMode] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [users, setUsers] = useState([]);
  const [approvalNotifQueue, setApprovalNotifQueue] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

// (배너 닫힘·10초 자동 닫힘은 BannerCard가 처리 — 마우스를 올리면 멈춘다)

  const getViewCompany = () => role === "totalMaster"
    ? (localStorage.getItem("loginCompany") || userCompany || DEFAULT_COMPANY)
    : (userCompany || localStorage.getItem("userCompany") || DEFAULT_COMPANY);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // 오늘(KST) 날짜 문자열
  const todayKST = () => {
    const now = new Date();
    return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  };

  // localStorage 기반 열람 기록 (날짜 바뀌면 자동 초기화)
  const getSeenToasts = () => {
    const today = todayKST();
    try {
      const saved = JSON.parse(localStorage.getItem("seenToasts") || "{}");
      // 오늘 날짜 키가 없으면 초기화
      if (saved._date !== today) {
        localStorage.setItem("seenToasts", JSON.stringify({ _date: today }));
        return {};
      }
      return saved;
    } catch { return {}; }
  };

  const markToastSeen = (key) => {
    const today = todayKST();
    try {
      const saved = JSON.parse(localStorage.getItem("seenToasts") || "{}");
      const base = saved._date === today ? saved : { _date: today };
      base[key] = true;
      localStorage.setItem("seenToasts", JSON.stringify(base));
    } catch {}
  };

  const getPermDismissed = () => { try { return new Set(JSON.parse(localStorage.getItem("permDismissed") || "[]")); } catch { return new Set(); } };
  const addPermDismissed = (key) => { try { const s = getPermDismissed(); s.add(key); localStorage.setItem("permDismissed", JSON.stringify([...s].slice(-300))); } catch {} };

  // Firestore에 계정별 seen 기록 저장/로드
  const addFirestoreSeenKey = React.useCallback((key) => {
    if (!user?.uid) return;
    _firestoreSeenKeys.add(key);
    setDoc(doc(db, "userSeenNotifs", user.uid), { keys: arrayUnion(key) }, { merge: true }).catch(() => {});
  }, [user?.uid]);

  React.useEffect(() => {
    if (!user?.uid) { _firestoreSeenLoaded = true; setFirestoreSeenReady(true); return; }
    getDoc(doc(db, "userSeenNotifs", user.uid)).then(d => {
      if (d.exists()) {
        const keys = d.data().keys || [];
        keys.forEach(k => _firestoreSeenKeys.add(k));
      }
      _firestoreSeenLoaded = true;
      setFirestoreSeenReady(true);
    }).catch(() => { _firestoreSeenLoaded = true; setFirestoreSeenReady(true); });
  }, [user?.uid]);

  const isAlreadySeen = (key) => {
    return _dismissedToasts.has(key) || getPermDismissed().has(key) || _firestoreSeenKeys.has(key);
  };

  const tryShowToast = React.useCallback((type, todayItem) => {
    const seen = getSeenToasts();
    const shownKey = `${type}_${todayItem.id}`;
    if (seen[shownKey] || isAlreadySeen(shownKey)) return;
    markToastSeen(shownKey);
    addPermDismissed(shownKey);
    setTimeout(() => {
      setToast({ type, data: { ...todayItem, date: formatCreatedAt(todayItem.createdAt) } });
    }, type === "notice" ? 500 : type === "schedule" ? 1500 : 2500);
  }, []);

  // Firestore 로드 완료 후 대기 중이던 토스트 처리
  React.useEffect(() => {
    if (!firestoreSeenReady) return;
    const pending = pendingToasts.current.splice(0);
    pending.forEach(({ type, item }) => tryShowToast(type, item));
  }, [firestoreSeenReady, tryShowToast]);

  const showTodayToast = React.useCallback((type, items) => {
    const today = todayKST();
    const todayItem = items.find(item => {
      const sec = item.createdAt?.seconds;
      if (!sec) return false;
      const kst = new Date(new Date(sec * 1000).getTime() + 9 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      return kst === today;
    });
    if (!todayItem) return;

    if (!_firestoreSeenLoaded) {
      // Firestore 로드 전: 대기열에 추가
      pendingToasts.current.push({ type, item: todayItem });
      return;
    }
    tryShowToast(type, todayItem);
  }, [tryShowToast]);

  React.useEffect(() => {
    const vc = getViewCompany();
    const q = query(collection(db, "schedules"), orderBy("createdAt", "desc"));
    let initialLoad = true;
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => (d.companyName || DEFAULT_COMPANY) === vc);
      setSchedules(list);
      if (initialLoad) {
        initialLoad = false;
        return; // ★ 2026-10-28 휴가/외근 게시판은 전자결재로 바뀌어 알림을 띄우지 않는다
      }
    });
    return () => unsub();
  }, [showTodayToast]);

  React.useEffect(() => {
    schedules.forEach(s => {
      const endDate = s.end || s.start || "";
      if (endDate && endDate <= "2026-06-16") {
        const approvers = s.approvers || (s.approverUid ? [{ uid: s.approverUid, name: s.approverName, status: s.approvalStatus }] : []);
        const needsMigration = approvers.length === 0 || approvers.some(a => a.status === "pending");
        if (needsMigration) {
          const updatedApprovers = approvers.length > 0
            ? approvers.map(a => ({ ...a, status: "approved" }))
            : [{ uid: "migrated", name: "자동승인", status: "approved" }];
          updateDoc(doc(db, "schedules", s.id), { approvers: updatedApprovers, approvalStatus: "approved" }).catch(() => {});
        }
      }
    });
  }, [schedules]);

  React.useEffect(() => {
    const vc = getViewCompany();
    const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
    let initialLoad = true;
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => { const data = d.data(); const date = formatCreatedAt(data.createdAt); if (!date) return null; return { id: d.id, ...data, date }; }).filter(Boolean).filter(d => (d.companyName || DEFAULT_COMPANY) === vc);
      setNotices(list);
      if (initialLoad) {
        initialLoad = false;
        showTodayToast("notice", list); // 접속 시 오늘 항목 알림
        return;
      }
      // 실시간 신규 등록 알림
      const added = snap.docChanges().find(c => c.type === "added" && !c.doc.metadata.hasPendingWrites);
      if (!added) return;
      const data = { id: added.doc.id, ...added.doc.data(), date: formatCreatedAt(added.doc.data().createdAt) };
      if (data.category === "인사발령") return; // 인사발령은 사내메일 배너로 뜬다
      const seenKeyN = `notice_${data.id}`;
      if (getSeenToasts()[seenKeyN] || isAlreadySeen(seenKeyN)) return;
      markToastSeen(seenKeyN); addPermDismissed(seenKeyN);
      setToast({ type: "notice", data });
    });
    return () => unsub();
  }, [showTodayToast]);

  React.useEffect(() => {
    const vc = getViewCompany();
    const q = query(collection(db, "handovers"), orderBy("createdAt", "desc"));
    let initialLoad = true;
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => (d.companyName || DEFAULT_COMPANY) === vc);
      setHandovers(list);
      if (initialLoad) {
        initialLoad = false;
        showTodayToast("handover", list); // 접속 시 오늘 항목 알림
        return;
      }
      // 실시간 신규 등록 알림 (내가 직접 편집 중인 건 제외)
      const added = snap.docChanges().find(c => c.type === "added" && !c.doc.metadata.hasPendingWrites && !isEditingHandoverRef.current);
      if (!added) return;
      const data = { id: added.doc.id, ...added.doc.data() };
      const seenKeyH = `handover_${data.id}`;
      if (getSeenToasts()[seenKeyH] || isAlreadySeen(seenKeyH)) return;
      markToastSeen(seenKeyH); addPermDismissed(seenKeyH);
      setToast({ type: "handover", data });
    });
    return () => unsub();
  }, [showTodayToast]);

  const noticeTotalPages = Math.ceil(notices.length / NOTICE_PAGE_SIZE);
  const pagedNotices = useMemo(() => { const s = (noticePage - 1) * NOTICE_PAGE_SIZE; return notices.slice(s, s + NOTICE_PAGE_SIZE); }, [notices, noticePage]);
  const filteredSchedules = useMemo(() => {
    const kw = scheduleAuthorSearch.trim();
    if (!kw) return schedules;
    return schedules.filter(s => (s.name || "").includes(kw));
  }, [schedules, scheduleAuthorSearch]);
  const scheduleTotalPages = Math.ceil(filteredSchedules.length / SCHEDULE_PAGE_SIZE);
  const pagedSchedules = useMemo(() => { const s = (schedulePage - 1) * SCHEDULE_PAGE_SIZE; return filteredSchedules.slice(s, s + SCHEDULE_PAGE_SIZE); }, [filteredSchedules, schedulePage]);

  const HANDOVER_PAGE_SIZE = 12;
  const [handoverPage, setHandoverPage] = useState(1);
  const handoverTotalPages = Math.ceil(handovers.length / HANDOVER_PAGE_SIZE);
  const pagedHandovers = useMemo(() => { const s = (handoverPage - 1) * HANDOVER_PAGE_SIZE; return handovers.slice(s, s + HANDOVER_PAGE_SIZE); }, [handovers, handoverPage]);

  const todayStatsFixed = useMemo(() => {
    let count = 0, revenue = 0, profit = 0;
    dispatchData.forEach(row => {
      const d = getLoadDate(row);
      if (!d) return;
      if (d.toISOString().slice(0, 10) === todayStr) { count += 1; revenue += Number(row?.청구운임 || 0); profit += Number(row?.수익 || 0); }
    });
    return { count, revenue, profit };
  }, [dispatchData]);

  // 합계 계산 — 기간을 "실시간 범위 이전(past)"과 "최근(live)"으로 나눠 센다
  const sumStats = (rows) => {
    let year = 0, month = 0, count = 0;
    rows.forEach((row) => {
      const d = getLoadDate(row);
      if (!d) return;
      const fare = Number(row?.청구운임 || 0);
      if (d.getFullYear() === currentYear) { year += fare; if (d.getMonth() === currentMonth) month += fare; }
      if (d >= new Date("2026-01-01")) count += 1;
    });
    return { year, month, count };
  };
  const dateKey = (row) => String(row?.상차일자 || row?.상차일 || row?.상차 || "").slice(0, 10);
  const liveStats = useMemo(() => sumStats(dispatchData.filter((row) => dateKey(row) >= liveStartStr)), [dispatchData, liveStartStr]);
  const past = pastCache || { year: 0, month: 0, count: 0 };
  const yearRevenue = past.year + liveStats.year;
  const monthRevenue = past.month + liveStats.month;
  const orderCountFrom2026 = past.count + liveStats.count;

  const salesTrend = useMemo(() => {
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, date: `${d.getMonth() + 1}/${d.getDate()}`, value: 0 });
    }
    const map = {};
    days.forEach(d => { map[d.key] = d; });
    dispatchData.forEach(row => {
      const ld = row?.상차일자 || row?.상차일 || row?.상차 || "";
      if (!ld) return;
      const dk = String(ld).slice(0, 10);
      if (map[dk]) map[dk].value += Number(row?.청구운임 || 0);
    });
    return days;
  }, [dispatchData]);

  const delta = salesTrend.length === 7 ? salesTrend[6].value - salesTrend[0].value : 0;

  const topClients = useMemo(() => {
    const map = {};
    dispatchData.forEach(d => {
      const dDate = getLoadDate(d);
      if (!dDate || dDate.getFullYear() !== currentYear || dDate.getMonth() !== currentMonth) return; // ★ 버그수정: 2026년 1월로 고정돼 있었다
      const name = d?.거래처명;
      if (!name || /\d{2}년\d{1,2}월/.test(name) || name.includes("후레쉬물류")) return;
      map[name] = (map[name] || 0) + Number(d?.청구운임 || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));
  }, [dispatchData]);

  const top10Summary = useMemo(() => {
    if (!topClients.length) return { total: 0, avg: 0, topName: "-" };
    const total = topClients.reduce((a, c) => a + c.value, 0);
    return { total, avg: Math.round(total / topClients.length), topName: topClients[0].name };
  }, [topClients]);

  const allPendingOrders = useMemo(() => {
    return dispatchData
      .filter(d => {
        if (d?.배차상태 === "배차완료") return false;
        const 상차일 = d?.상차일자 || d?.상차일 || d?.상차 || "";
        const 거래처명 = d?.거래처명 || "";
        return 상차일.trim() || 거래처명.trim();
      })
      .sort((a, b) => {
        const da = a?.상차일자 || a?.상차일 || a?.상차 || "";
        const db2 = b?.상차일자 || b?.상차일 || b?.상차 || "";
        return da < db2 ? -1 : da > db2 ? 1 : 0;
      });
  }, [dispatchData]);

  // ⭐ 미배차 롤링 목록은 PendingTicker(아래)가 따로 넘긴다 — 3초마다 홈 화면 전체를 다시 그리던 원인

  const formInput = "w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100 transition";

  // 결재 알림 리스너 — read: false 필터링으로 중복 방지
  useEffect(() => {
    if (!user?.uid) return;
    const sessionKey = `notif_shown_${user.uid}`;
    const getShown = () => { try { return new Set(JSON.parse(sessionStorage.getItem(sessionKey) || "[]")); } catch { return new Set(); } };
    const markShown = (id) => { try { const s = getShown(); s.add(id); sessionStorage.setItem(sessionKey, JSON.stringify([...s])); } catch {} };

    const qRef = query(collection(db, "notifications"), where("toUid", "==", user.uid), where("read", "==", false));
    const unsub = onSnapshot(qRef, (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;
        const docId = change.doc.id;
        // sessionStorage로 세션당 1회만 표시 (컴포넌트 리마운트 시 중복 방지)
        if (getShown().has(docId)) return;
        markShown(docId);
        const data = change.doc.data();
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
        if (createdAt && createdAt < since) return;
        let msg, notifStatus;
        if (data.type === "approval_request") {
          msg = `[${data.scheduleType || "일정"}] ${data.fromName || "작성자"}님의 결재 요청이 있습니다.`;
          notifStatus = "request";
        } else if (data.type === "re_request") {
          msg = `[${data.scheduleType || "일정"}] ${data.fromName || "작성자"}님의 재요청이 있습니다.`;
          notifStatus = "request";
        } else {
          const statusLabel = data.status === "approved" ? "승인" : data.status === "rejected" ? "반려" : "보류";
          msg = `[${data.scheduleType || "일정"}] ${data.approverName || "결재자"}님이 ${statusLabel}하였습니다.`;
          notifStatus = data.status;
        }
        setApprovalNotifQueue(prev => [...prev, { id: docId, msg, status: notifStatus }]);
      });
    }, () => {});
    return unsub;
  }, [user?.uid]);

  // ⭐ 사이드바 NEW 표시(2026-10-28) — 마지막으로 그 게시판을 본 뒤 남이 새로 올린 글이 있으면 "N". 들어가서 보면 사라진다.
  const mailCounts = useMailCounts();
  const seenKey = `kpBoardSeen:${user?.uid || ""}`;
  const [boardSeen, setBoardSeen] = useState(() => { try { return JSON.parse(localStorage.getItem(seenKey) || "{}"); } catch { return {}; } });
  const seenFloor = useRef(Date.now() - 3 * 86400e3); // 처음 쓰는 PC는 최근 3일 글만 NEW
  const newestOf = (list) => list.reduce((mx, it) => (it.authorUid && it.authorUid === user?.uid ? mx : Math.max(mx, (it.createdAt?.seconds || 0) * 1000)), 0);
  // ⭐ 2026-10-31 이름은 본인 사용자 문서에서 — 직원 목록(회사로 걸러짐)에 본인이 없으면 계정 아이디로 적혔다
  const myProfileHome = useMyProfile(user?.uid);
  const meHome = (() => { const u = users.find((x) => x.id === user?.uid) || {}; const pf = myProfileHome || {}; return { uid: user?.uid, name: personName(pf) || personName(u) || user?.displayName || (user?.email || "").split("@")[0] || "", team: pf.team || u.team || "", position: pf.position || u.position || "", role: role || u.role || "" }; })();
  const boardLatest = useBoardLatest(getViewCompany(), meHome);
  const apCounts = useApprovalCounts();
  // 🔔 결재 배너를 누르면 홈 › 전자결재로 와서 그 문서를 연다(DispatchApp이 홈으로 옮겨 준 뒤 이 값을 남겨 둔다)
  const [apOpenId, setApOpenId] = useState(null);
  useEffect(() => {
    const take = () => {
      const p = window.__kpOpenApproval;
      if (!p) return;
      window.__kpOpenApproval = null;
      setBoardTab(`ap:${p.page || "inbox"}`); setApOpenId(p.id);
    };
    take();
    window.addEventListener("kp-open-approval", take);
    return () => window.removeEventListener("kp-open-approval", take);
  }, []);
  const boardNewest = { 공지사항: newestOf(notices), 인수인계: newestOf(handovers), ...Object.fromEntries(Object.keys(BOARDS).map((b) => [`board:${b}`, boardLatest[b] || 0])) };
  const isBoardNew = (k) => boardNewest[k] > (boardSeen[k] ?? seenFloor.current);
  const curNewest = boardNewest[boardTab] || 0;
  useEffect(() => {
    if (!(boardTab in boardNewest)) return;
    setBoardSeen((p) => {
      const n = { ...p, [boardTab]: Math.max(Date.now(), curNewest) };
      try { localStorage.setItem(seenKey, JSON.stringify(n)); } catch { /* 저장 실패 무시 */ }
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardTab, curNewest, seenKey]);
  const isMailTab = String(boardTab).startsWith("mail:");
  const myNameHome = users.find((u) => u.id === user?.uid)?.name || user?.displayName || (user?.email || "").split("@")[0] || "";

  const pendingApprovalCountNav = schedules.filter(s => (s.approvers || []).some(a => a.uid === user?.uid && (!a.status || a.status === "pending"))).length;
  const unreadHandoverCountNav = handovers.filter(h => handoverReceivers(h).includes(user?.uid) && !h.readBy?.includes(user?.uid)).length;
  const canWriteNotice = NOTICE_WRITER_ROLES.includes(role);
  // ✍ 공지·인수인계 글쓰기는 팝업 대신 넓은 작성 화면(HomeWriters.jsx)
  const { planId } = usePlan();
  const [obitOpen, setObitOpen] = useState(false); // 부고 알림 작성
  const writerActive = (boardTab === "공지사항" && (noticeOpen || obitOpen)) || (boardTab === "인수인계" && (handoverOpen || handoverEditMode));
  return (
    <KpSubNav noBleed code="HOME" title="홈" icon="dashboard" active={boardTab}
      onSelect={(k) => { if (String(k).startsWith("lock:")) { openPlanLock(String(k).slice(5)); return; } setBoardTab(k); }} bodyClass="px-5 py-4"
      groups={lockHomeGroups(planId, [
        { label: dept === "exec" ? "경영" : dept ? "부서" : "관제", items: [{ key: "대시보드", label: dept === "exec" ? "경영 브리핑" : "대시보드", en: dept === "exec" ? "EXECUTIVE" : dept === "acct" ? "ACCOUNTING" : dept === "hr" ? "HUMAN RESOURCES" : "OPERATIONS", icon: dept === "acct" ? "money" : dept === "hr" ? "idcard" : dept === "exec" ? "star" : "pulse" }] },
        { label: "사내 게시판", items: [
          { key: "공지사항", label: "공지사항", en: "NOTICE", icon: "bell", badge: isBoardNew("공지사항") ? "N" : 0, badgeTitle: "새 글" },
          ...Object.entries(BOARDS).filter(([b]) => canSeeBoard(b, meHome)).map(([b, B]) => ({ key: `board:${b}`, label: B.label, en: B.en, icon: B.icon, badge: isBoardNew(`board:${b}`) ? "N" : 0, badgeTitle: "새 글" })),
          // ⭐ 2026-10-31 임원 일정(모든 직원 열람) · 사내 규정(취업규칙 등)
          { key: "execsched", label: "임원 일정", en: "EXECUTIVE", icon: "pin" },
          { key: "rules", label: "사내 규정", en: "RULES", icon: "list" },
        ] },
        { label: "전자결재", items: [
          { key: "ap:inbox", label: "결재함", en: "INBOX", icon: "stamp", badge: apCounts.todo, badgeTitle: "내 결재 차례" },
          { key: "ap:leave", label: "근태·휴가 신청", en: "ATTENDANCE", icon: "clock" },
          { key: "ap:expense", label: "비용·지출 결의", en: "EXPENSE", icon: "wallet" },
          { key: "ap:draft", label: "업무 기안·품의", en: "PROPOSAL", icon: "file" },
          { key: "ap:report", label: "업무 보고·인사", en: "REPORT", icon: "list" },
          { key: "ap:contract", label: "계약서", en: "CONTRACT", icon: "pen" },
          // ⭐ 2026-10-31 인수인계는 전자결재 안으로(모바일 전자결재와 같은 화면)
          { key: "ap:handover", label: "인수인계", en: "HANDOVER", icon: "link", badge: unreadHandoverCountNav, badgeTitle: "내 미확인" },
          { key: "ap:mine", label: "내 기안함", en: "MY DOCUMENTS", icon: "send", badge: apCounts.mineNew, badgeTitle: "새 결재 결과(승인·반려·취소)" },
          { key: "ap:lines", label: "결재선 관리", en: "LINES", icon: "route" },
        ] },
        { label: "커뮤니케이션 센터", items: [
          { key: "mail", label: "사내메일함", en: "MAILBOX", icon: "mail", badge: mailCounts.unread, badgeTitle: "안 읽은 메일",
            sub: MAIL_FOLDERS.map((f) => ({ key: `mail:${f.key}`, label: f.label, icon: f.icon, badge: folderBadge(f.key, mailCounts), soft: !["inbox", "unread"].includes(f.key) })) },
        ] },
      ])}>
    <div className="space-y-5">
      {boardTab === "대시보드" && (!dept || dept === "exec") && <MasterChecklist user={user} userCompany={userCompany} />}
      {/* 🏢 경리·인사 권한 — 대시보드 내용만 부서 업무로 */}
      {boardTab === "대시보드" && dept && <DeptDashboard mode={dept} company={getViewCompany()} dispatchData={dispatchData} onGo={onDeptGo} pastCache={pastCache} liveStart={liveStartStr} me={meHome}
        att={{ company: homeCompany, uid: user?.uid, name: meHome.name, role, email: user?.email }} />}

      {/* 결재 알림 배너 (큐 방식 - 여러 알림 순차 표시) */}
      {approvalNotifQueue.length > 0 && (() => {
        const banner = approvalNotifQueue[0];
        const dismissBanner = () => {
          if (banner?.id) {
            updateDoc(doc(db, "notifications", banner.id), { read: true }).catch(() => {});
          }
          setApprovalNotifQueue(prev => prev.slice(1));
        };
        return (
        <div className="fixed top-5 right-5 z-[9999] flex items-center gap-3 px-5 py-3.5 bg-white border border-gray-200 rounded-2xl shadow-xl" style={{ animation: "fadeIn 0.3s ease-out", minWidth: 280 }}>
          {approvalNotifQueue.length > 1 && (
            <div style={{ position: "absolute", top: -8, right: -8, background: "#DC2626", color: "#fff", borderRadius: "50%", width: 20, height: 20, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {approvalNotifQueue.length}
            </div>
          )}
          <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#fff", background: banner.status === "approved" ? "#1B2B4B" : banner.status === "rejected" ? "#DC2626" : banner.status === "hold" ? "#6B7280" : "#1B2B4B" }}>
            {banner.status === "approved" ? "승" : banner.status === "rejected" ? "반" : banner.status === "hold" ? "보" : "결"}
          </div>
          <span className="text-[13px] font-semibold text-gray-800 flex-1">{banner.msg}</span>
          <button onClick={dismissBanner} className="text-gray-500 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>
        );
      })()}

      {/* ===== 관제 데크 — 오늘 실적 · 매출 추이 · 매익률 · 담당자 순위 · 거래처 Top (2026-10-28 리디자인, 미배차 현황은 뺌) ===== */}
      {boardTab === "대시보드" && !dept && <HomeDeck
        dispatchData={dispatchData}
        pastCache={pastCache}
        liveStart={liveStartStr}
        users={users}
        isMaster={role === "totalMaster"}
        myName={users.find((u) => u.id === user?.uid)?.name || user?.displayName || (user?.email || "").split("@")[0] || ""}
      />}

      {/* ===== 커뮤니케이션 센터 · 사내메일함(왼쪽 사이드바의 하위 메일함) — 2026-10-28 ===== */}
      {isMailTab && (
        <MailWorkspace embedded company={getViewCompany()} myName={myNameHome} box={boardTab.slice(5)} setBox={(b) => setBoardTab(`mail:${b}`)} height="calc(100vh - 122px)" />
      )}

      {/* ===== 전자결재 · 자유/관리자/임원 게시판(2026-10-28) ===== */}
      {boardTab === "ap:contract" && <ContractStudio company={getViewCompany()} me={meHome} />}
      {boardTab === "ap:handover" && <HandoverCenter company={getViewCompany()} me={meHome} isViewer={isViewer} />}
      {String(boardTab).startsWith("ap:") && boardTab !== "ap:contract" && boardTab !== "ap:handover" && <ApprovalCenter company={getViewCompany()} me={meHome} page={boardTab.slice(3)} setPage={(p) => setBoardTab(`ap:${p}`)} openId={apOpenId} onOpened={() => setApOpenId(null)} />}
      {String(boardTab).startsWith("board:") && <BoardPage company={getViewCompany()} me={meHome} board={boardTab.slice(6)} />}
      {boardTab === "execsched" && <ExecScheduleBoard company={getViewCompany()} me={meHome} canWrite={canWriteExecSchedule({ dept, role, team: meHome.team })} />}
      {boardTab === "rules" && <CompanyRules company={getViewCompany()} canEdit={role === "hrManager" || role === "totalMaster"} />}

      {/* ===== 사내 게시판(왼쪽 사이드바에서 고름) — 2026-10-28 디지털 리디자인 ===== */}
      {boardTab === "공지사항" && obitOpen && <ObituaryWriter company={getViewCompany()} me={meHome} onCancel={() => setObitOpen(false)} onSaved={() => setObitOpen(false)} />}
      {boardTab === "공지사항" && noticeOpen && (
        <NoticeWriter me={meHome} company={getViewCompany()} initial={selectedNotice} onCancel={() => setNoticeOpen(false)} onSaved={() => { setNoticeOpen(false); setSelectedNotice(null); }} />
      )}
      {boardTab === "인수인계" && (handoverOpen || handoverEditMode) && (
        <HandoverWriter me={meHome} company={getViewCompany()} initial={handoverEditMode ? selectedHandover : null}
          onCancel={() => { setHandoverOpen(false); setHandoverEditMode(false); isEditingHandoverRef.current = false; }}
          onSaved={() => { setHandoverOpen(false); setHandoverEditMode(false); setSelectedHandover(null); isEditingHandoverRef.current = false; }} />
      )}
      {(boardTab === "공지사항" || boardTab === "인수인계") && !writerActive && (
      <div className="kp-board space-y-4">
        <div className="relative overflow-hidden rounded-[22px] px-7 py-5 text-white flex items-center justify-between gap-4 flex-wrap shadow-[0_14px_32px_rgba(15,26,48,0.25)]"
          style={{ background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/22px 22px, linear-gradient(120deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div>
            <div className="text-[11px] font-extrabold tracking-[0.26em] text-[#8FB0F0]" style={{ fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace" }}>
              BOARD · {boardTab === "공지사항" ? "NOTICE" : boardTab === "휴가/외근" ? "SCHEDULE" : "HANDOVER"}
            </div>
            <h2 className="text-[24px] font-black tracking-tight mt-0.5">{boardTab}</h2>
            <p className="text-[13px] text-white/60 mt-0.5">
              {boardTab === "공지사항" ? "회사 공지 및 주요 안내 사항을 확인합니다." : boardTab === "휴가/외근" ? "휴가·외근 일정을 올리고 결재를 받습니다" : "업무를 넘기고 받는 사람이 확인했는지 봅니다"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {[
              boardTab === "공지사항" ? ["전체", notices.length] : boardTab === "휴가/외근" ? ["전체", schedules.length] : ["전체", handovers.length],
              boardTab === "휴가/외근" ? ["내 결재 대기", pendingApprovalCountNav] : boardTab === "인수인계" ? ["내 미확인", unreadHandoverCountNav] : ["이번 달", notices.filter((n) => String(n.date || "").slice(0, 7) === todayStr.slice(0, 7)).length],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/[0.08] ring-1 ring-white/15 px-4 py-2 text-center min-w-[96px]">
                <div className="text-[12px] font-bold text-blue-100/70">{k}</div>
                <div className="text-[22px] font-black leading-tight" style={{ fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace" }}>{v}</div>
              </div>
            ))}
            {!isViewer && (boardTab !== "공지사항" || canWriteNotice) && (
              <button
                onClick={() => {
                  if (boardTab === "공지사항") { setSelectedNotice(null); setNoticeForm({ category: "공지사항", author: "", content: "" }); setNoticeOpen(true); }
                  else if (boardTab === "휴가/외근") { setSelectedSchedule(null); setScheduleForm({ type: "휴가", authorName: "", start: "", end: "", memo: "", approvers: [] }); setScheduleOpen(true); }
                  else { const me = users.find(u => u.id === user?.uid); setSelectedHandover(null); setHandoverForm({ text: "", author: me?.name || "", authorUid: user?.uid || "", receiver: "", receiverUid: "", date: todayStr }); setHandoverOpen(true); }
                }}
                className="h-12 px-5 rounded-2xl bg-white text-[#0F1A30] text-[15px] font-black shadow-[0_8px_20px_rgba(0,0,0,0.25)] hover:brightness-95 transition">
                + 새로 등록
              </button>
            )}
            {!isViewer && boardTab === "공지사항" && canWriteNotice && (
              <button type="button" onClick={() => { setNoticeOpen(false); setObitOpen(true); }}
                className="h-12 px-5 rounded-2xl bg-[#111] text-white text-[15px] font-black ring-1 ring-white/25 hover:bg-black transition whitespace-nowrap">부고 알림</button>
            )}
          </div>
        </div>
      <div className={`${KP_HOME_CARD} overflow-hidden`}>
        {/* 탭 콘텐츠 */}
        <div className="p-5">
          {/* 공지사항 탭 */}
          {boardTab === "공지사항" && (
            <NoticeBoard notices={notices} me={meHome} canWrite={canWriteNotice} isViewer={isViewer}
              openId={selectedNotice?.id || null}
              setOpenId={(id) => setSelectedNotice(id ? (notices.find((x) => x.id === id) || null) : null)}
              onEdit={(n) => { setSelectedNotice(n); setNoticeOpen(true); }}
              confirm={(message, onConfirm) => setConfirmDialog({ message, onConfirm })} />
          )}

          {/* 휴가/외근 탭 */}
          {boardTab === "휴가/외근" && (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={scheduleAuthorSearch}
                onChange={e => { setScheduleAuthorSearch(e.target.value); setSchedulePage(1); }}
                placeholder="작성자 검색"
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-700 focus:border-[#1B2B4B] outline-none w-44"
              />
            </div>
          )}
          {boardTab === "휴가/외근" && (
            filteredSchedules.length === 0 ? (
              <div className="text-[13px] text-gray-500 py-6 text-center">등록된 일정이 없습니다</div>
            ) : (
              <>
                <BoardTable
                  headers={[
                    { label: "No", width: "44px" },
                    { label: "등록날짜", width: "90px" },
                    { label: "등록시간", width: "70px" },
                    { label: "작성자", width: "70px" },
                    { label: "구분", width: "55px" },
                    { label: "일정", width: "200px" },
                    { label: "결재", width: "70px" },
                  ]}
                  rows={pagedSchedules.map((s, idx) => {
                    const startDate = s.startDate || s.start || "";
                    const fmt = (d) => {
                      if (!d) return "-";
                      const [y, m, day] = d.split("-");
                      return `${y}년 ${m}월 ${day}일`;
                    };
                    const dateLabel = startDate ? `${fmt(startDate)} ${s.type || ""}` : "-";
                    return (
                    <tr key={s.id} onClick={() => setSelectedSchedule(s)} className="cursor-pointer hover:bg-blue-50/50 transition">
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{(schedulePage - 1) * SCHEDULE_PAGE_SIZE + idx + 1}</td>
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">
                        {s.createdAt?.toDate ? s.createdAt.toDate().toISOString().slice(0, 10).replaceAll("-", ".") : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{formatCreatedAtTime(s.createdAt)}</td>
                      <td className="px-3 py-2.5 text-center text-[13px] font-semibold text-gray-700">{s.name || "-"}</td>
                      <td className="px-3 py-2.5 text-center text-[12px]">
                        <span className="text-[12px] font-semibold text-gray-700">{s.type || s.title}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center text-[13px] font-medium text-gray-800">{dateLabel}</td>
                      <td className="px-3 py-2.5 text-center">{(() => {
                        const myApprover = (s.approvers || []).find(a => a.uid === auth.currentUser?.uid && a.status === "pending");
                        if (myApprover && s.isReRequest) return (
                          <button onClick={e => { e.stopPropagation(); setSelectedSchedule(s); }}
                            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#1B2B4B] text-white animate-pulse">
                            재요청대기
                          </button>
                        );
                        if (myApprover) return (
                          <button onClick={e => { e.stopPropagation(); setSelectedSchedule(s); }}
                            className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#1B2B4B] text-white animate-pulse">
                            결재대기
                          </button>
                        );
                        return <ApprovalBadge status={getOverallApprovalStatus(s)} />;
                      })()}</td>
                    </tr>
                    );
                  })}
                />
                <Pagination page={schedulePage} total={scheduleTotalPages} onChange={setSchedulePage} />
              </>
            )
          )}

          {/* 인수인계 탭 */}
          {boardTab === "인수인계" && (
            handovers.length === 0 ? (
              <div className="text-[13px] text-gray-500 py-6 text-center">등록된 인수인계가 없습니다</div>
            ) : (
              <>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr style={{ background: "linear-gradient(90deg,#0F1A30,#1B2B4B 50%,#24396A)" }} className="[&>th]:!text-white [&>th]:!text-[13px] [&>th]:!font-extrabold [&>th]:!py-3">
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[44px]">No</th>
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[90px]">등록날짜</th>
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[70px]">등록시간</th>
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[70px]">작성자</th>
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[70px]">받는이</th>
                      <th className="px-3 py-2.5 text-left text-[12px] font-semibold text-gray-500">내용</th>
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[60px]">수신여부</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedHandovers.map((h, idx) => {
                      const rcv = handoverReceivers(h);
                      const readN = rcv.filter((u) => (h.readBy || []).includes(u)).length;
                      const receiverRead = rcv.length > 0 && readN === rcv.length;
                      const isReceiver = rcv.includes(user?.uid);
                      const isAuthor = user?.uid === h.authorUid;
                      const unread = isReceiver && !(h.readBy || []).includes(user?.uid);
                      const dateStr = (h.date || formatCreatedAt(h.createdAt) || "").replaceAll("-", ".");
                      return (
                        <tr key={h.id}
                          onClick={async () => {
                            setSelectedHandover(h);
                            if (unread) {
                              await updateDoc(doc(db, "handovers", h.id), { readBy: [...(h.readBy || []), user.uid] });
                            }
                          }}
                          className={`cursor-pointer transition hover:bg-blue-50/50 relative ${unread ? "bg-red-50/60" : ""}`}
                        >
                          <td className="w-[44px] text-center py-2.5 pl-3 pr-2 relative">
                            {(isReceiver || isAuthor) && (
                              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r ${receiverRead ? "bg-[#C9D2E0]" : "bg-[#1B2B4B]"}`} />
                            )}
                            <span className="text-[12px] text-gray-500">{(handoverPage - 1) * HANDOVER_PAGE_SIZE + idx + 1}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{dateStr}</td>
                          <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{formatCreatedAtTime(h.createdAt)}</td>
                          <td className="px-3 py-2.5 text-center text-[13px] font-semibold text-gray-700">{h.author}</td>
                          <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 whitespace-nowrap">{(h.receivers || []).length > 1 ? `${h.receivers[0].name} 외 ${h.receivers.length - 1}명` : (h.receiver || "-")}</td>
                          <td className="px-3 py-2.5 text-[13px] text-gray-800 whitespace-nowrap">{(() => {
                            const d = h.date || formatCreatedAt(h.createdAt) || "";
                            if (!d) return "업무 인수인계";
                            const [y, m, day] = d.split("-");
                            return `${y}년 ${m}월 ${day}일 업무 인수인계`;
                          })()}</td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${receiverRead ? "bg-[#EEF1F7] text-[#1B2B4B]" : "bg-red-50 text-red-500"}`}>
                              {rcv.length > 1 ? `${readN}/${rcv.length} 확인` : receiverRead ? "확인" : "미확인"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination page={handoverPage} total={handoverTotalPages} onChange={setHandoverPage} />
              </>
            )
          )}
        </div>
      </div>
      </div>
      )}

      {/* ===== 모달들 ===== */}
      {scheduleOpen && (
        <Modal title="휴가 / 외근 일정 등록" onClose={() => setScheduleOpen(false)}>
          <div className="space-y-3">
            {role === "totalMaster" && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">작성자</div>
                <select className={formInput} value={scheduleForm.authorName} onChange={e => setScheduleForm({ ...scheduleForm, authorName: e.target.value })}>
                  <option value="">선택</option>
                  {users.map(u => <option key={u.id} value={u.name}>{u.name}{u.email ? ` (${u.email.split("@")[0]})` : ""}</option>)}
                </select>
              </div>
            )}
            <select className={formInput} value={scheduleForm.type} onChange={e => setScheduleForm({ ...scheduleForm, type: e.target.value })}>
              <option>휴가</option><option>외근</option><option>오전반차</option><option>오후반차</option><option>병가</option><option>경조사</option><option>조퇴</option>
            </select>
            <div className="flex gap-2">
              <input type="date" className={formInput} value={scheduleForm.start} onChange={e => setScheduleForm({ ...scheduleForm, start: e.target.value })} />
              <input type="date" className={formInput} value={scheduleForm.end} onChange={e => setScheduleForm({ ...scheduleForm, end: e.target.value })} />
            </div>
            <textarea placeholder="메모 (선택)" rows={3} className={formInput} value={scheduleForm.memo} onChange={e => setScheduleForm({ ...scheduleForm, memo: e.target.value })} />
            <div className="space-y-2">
              <div className="text-[12px] text-gray-500 font-semibold">결재자 ({scheduleForm.approvers.length}/3)</div>
              {scheduleForm.approvers.map((a, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    className={formInput}
                    value={a.uid}
                    onChange={e => {
                      const u = users.find(u => (u.uid || u.id) === e.target.value);
                      const updated = [...scheduleForm.approvers];
                      updated[i] = { uid: u?.uid || u?.id || "", name: u?.name || "" };
                      setScheduleForm({ ...scheduleForm, approvers: updated });
                    }}
                  >
                    <option value="">결재자 선택</option>
                    {users.filter(u => (u.uid || u.id) !== user?.uid).map(u => <option key={u.id} value={u.uid || u.id}>{u.name}{u.email ? ` (${u.email.split("@")[0]})` : ""}</option>)}
                  </select>
                  <button onClick={() => setScheduleForm({ ...scheduleForm, approvers: scheduleForm.approvers.filter((_, j) => j !== i) })}
                    className="text-red-400 text-lg font-bold px-1">×</button>
                </div>
              ))}
              {scheduleForm.approvers.length < 3 && (
                <button onClick={() => setScheduleForm({ ...scheduleForm, approvers: [...scheduleForm.approvers, { uid: "", name: "" }] })}
                  className="w-full py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 text-[13px]">
                  + 결재자 추가
                </button>
              )}
            </div>
            <button onClick={async () => {
              const me = users.find(u => u.id === user?.uid);
              const userName = me?.name || "사용자";
              const approversData = scheduleForm.approvers.filter(a => a.uid).map(a => ({ uid: a.uid, name: a.name, status: a.status || "pending" }));
              if (role !== "totalMaster" && approversData.length === 0) { alert("결재자를 1명 이상 선택해야 저장할 수 있습니다."); return; }
              const selectedAuthor = role === "totalMaster" && scheduleForm.authorName
                ? users.find(u => u.name === scheduleForm.authorName)
                : null;
              if (selectedSchedule?.id) {
                const updatedFields = { type: scheduleForm.type, start: scheduleForm.start, end: scheduleForm.end, memo: scheduleForm.memo, approvers: approversData };
                if (selectedAuthor) {
                  updatedFields.name = selectedAuthor.name;
                  updatedFields.authorUid = selectedAuthor.uid || selectedAuthor.id;
                }
                await updateDoc(doc(db, "schedules", selectedSchedule.id), updatedFields);
                setSelectedSchedule(prev => ({ ...prev, ...updatedFields }));
              } else {
                const newDocRef = await addDoc(collection(db, "schedules"), {
                  type: scheduleForm.type,
                  name: selectedAuthor ? selectedAuthor.name : userName,
                  authorUid: selectedAuthor ? (selectedAuthor.uid || selectedAuthor.id) : (user?.uid || ""),
                  start: scheduleForm.start, end: scheduleForm.end, memo: scheduleForm.memo, approvers: approversData, approvalStatus: "pending", createdAt: serverTimestamp(), companyName: getViewCompany() });
                // 결재자에게 최초 결재 요청 알림 발송
                for (const a of approversData) {
                  if (a.uid) setDoc(doc(db, "notifications", `req_${newDocRef.id}_${a.uid}`), { toUid: a.uid, type: "approval_request", fromName: userName, scheduleType: scheduleForm.type, scheduleId: newDocRef.id, createdAt: serverTimestamp(), read: false }).catch(() => {});
                }
              }
              setScheduleForm({ type: "휴가", authorName: "", start: "", end: "", memo: "", approvers: [] }); setScheduleOpen(false);
            }} className="w-full bg-[#1B2B4B] text-white py-2.5 rounded-lg font-semibold text-[14px] hover:bg-[#243a60] transition"><EditableText id="misc.btn.1158.저장" defaultText="저장" /></button>
          </div>
        </Modal>
      )}

      {selectedSchedule && !scheduleOpen && (() => {
        const me = users.find(u => u.id === user?.uid);
        const overallStatus = getOverallApprovalStatus(selectedSchedule);
        const isAuthor = user?.uid === selectedSchedule.authorUid;
        const isSuperAdmin = role === "admin" || role === "totalMaster";
        const approvers = selectedSchedule.approvers || (selectedSchedule.approverUid ? [{ uid: selectedSchedule.approverUid, name: selectedSchedule.approverName, status: selectedSchedule.approvalStatus || "pending" }] : []);
        const anyApproverActed = approvers.length > 0 && approvers.some(a => a.status && a.status !== "pending");
        const canEdit = (isAuthor && (!anyApproverActed || overallStatus === "rejected")) || (isSuperAdmin && overallStatus !== "approved");
        const canDelete = (isAuthor && (!anyApproverActed || overallStatus === "approved")) || isSuperAdmin;
        const isHoldAndAuthor = isAuthor && overallStatus === "hold";
        const myApproverIdx = approvers.findIndex(a => a.uid === auth.currentUser?.uid);
        const typeLabel = { "휴가": "휴가 신청서", "외근": "외근 신청서", "오전반차": "반차 신청서", "오후반차": "반차 신청서", "병가": "병가 신청서", "경조사": "경조사 신청서", "조퇴": "조퇴 신청서" };
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ width: 560, maxHeight: "90vh", overflowY: "auto" }}>
            {/* 헤더 */}
            <div className="flex justify-between items-center px-6 py-4 bg-[#1B2B4B]">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-[15px] tracking-widest">{typeLabel[selectedSchedule.type] || "일정 신청서"}</h3>
                {selectedSchedule.isReRequest && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#DC2626", borderRadius: 6, padding: "2px 8px", letterSpacing: "0.05em" }}>재요청</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handlePrintSchedule({ schedule: selectedSchedule, approvers, overallStatus, typeLabel })}
                  className="text-white/80 hover:text-white text-[12px] font-semibold border border-white/30 rounded-lg px-2.5 py-1 hover:bg-white/10 transition"
                >
                  인쇄
                </button>
                <button onClick={() => setSelectedSchedule(null)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
              </div>
            </div>

            <div className="px-7 py-6">
              {/* 결재라인 - 우측 정렬 */}
              {approvers.length > 0 && (
                <div className="flex justify-end mb-5">
                  <div style={{ border: "1.5px solid #9CA3AF", display: "flex" }}>
                    <div style={{ borderRight: "1.5px solid #9CA3AF", padding: "0 8px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                      {["결", "재"].map((ch, i) => <span key={i} style={{ fontSize: 12, fontWeight: 700, color: "#374151", lineHeight: 1.3 }}>{ch}</span>)}
                    </div>
                    {approvers.map((a, i) => {
                      const statusColor = a.status === "approved" ? "#1B2B4B" : a.status === "rejected" ? "#DC2626" : a.status === "hold" ? "#6B7280" : "#9CA3AF";
                      const statusLabel = a.status === "approved" ? "승인" : a.status === "rejected" ? "반려" : a.status === "hold" ? "보류" : "대기";
                      return (
                        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 64, borderLeft: i > 0 ? "1.5px solid #9CA3AF" : undefined }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#111827", borderBottom: "1.5px solid #9CA3AF", width: "100%", textAlign: "center", padding: "3px 0" }}>결재자</div>
                          <div
                            title="클릭하여 결재 요청 발송"
                            onClick={async () => {
                              if (!isAuthor || !a.uid) return;
                              const notifId = `req_${selectedSchedule.id}_${a.uid}`;
                              await setDoc(doc(db, "notifications", notifId), { toUid: a.uid, type: "approval_request", fromName: me?.name || "작성자", scheduleType: selectedSchedule.type || "", scheduleId: selectedSchedule.id, createdAt: serverTimestamp(), read: false }).catch(() => {});
                              alert(`${a.name}님에게 결재 요청을 발송했습니다.`);
                            }}
                            style={{ fontSize: 13, fontWeight: 700, color: "#111827", padding: "8px 4px", textAlign: "center", width: "100%", cursor: isAuthor ? "pointer" : "default", textDecoration: isAuthor ? "underline dotted" : "none" }}
                          >{a.name}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: statusColor, borderTop: "1.5px solid #9CA3AF", width: "100%", textAlign: "center", padding: "3px 0" }}>{statusLabel}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 신청서 본문 테이블 */}
              <div className="relative" style={{ border: "1.5px solid #D1D5DB" }}>
                <ApprovalStamp status={overallStatus} />
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <tbody>
                    {[
                      ["구 분", <span style={{ fontWeight: 700, color: "#111827" }}>{selectedSchedule.type}</span>],
                      ["작 성 자", <span style={{ color: "#111827" }}>{selectedSchedule.name}</span>],
                      ["기 간", <span style={{ color: "#111827" }}>{selectedSchedule.start} ~ {selectedSchedule.end}</span>],
                      ...(selectedSchedule.memo ? [["사 유", <span style={{ color: "#111827", whiteSpace: "pre-wrap" }}>{selectedSchedule.memo}</span>]] : []),
                    ].map(([label, val], idx, arr) => (
                      <tr key={idx} style={{ borderBottom: idx < arr.length - 1 ? "1px solid #E5E7EB" : undefined }}>
                        <td style={{ background: "#F9FAFB", padding: "11px 16px", fontSize: 12, fontWeight: 700, color: "#4B5563", width: 100, borderRight: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{label}</td>
                        <td style={{ padding: "11px 16px" }}>{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 결재 요청 문구 */}
              <div style={{ borderTop: "2px solid #1B2B4B", borderBottom: "2px solid #1B2B4B", margin: "18px 0", padding: "16px 0", textAlign: "center", fontSize: 15, fontWeight: 700, color: "#1B2B4B", lineHeight: 2, letterSpacing: "0.01em" }}>
                상기 사유로 인하여 결재를 요청하오니<br />승인하여 주시기 바랍니다.
              </div>

              {/* 결재 행동 버튼 (결재자 본인 - 상태 변경/철회 포함) */}
              {myApproverIdx !== -1 && (
                <div className="mb-3">
                  {approvers[myApproverIdx]?.status && approvers[myApproverIdx].status !== "pending" && (
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>
                      현재 상태: <span style={{ fontWeight: 700, color: approvers[myApproverIdx].status === "approved" ? "#1B2B4B" : approvers[myApproverIdx].status === "rejected" ? "#DC2626" : "#6B7280" }}>
                        {approvers[myApproverIdx].status === "approved" ? "승인" : approvers[myApproverIdx].status === "rejected" ? "반려" : "보류"}
                      </span> &mdash; 아래에서 변경 가능
                    </div>
                  )}
                  <div className="flex gap-2">
                    {["approved", "rejected", "hold"].map(st => {
                      const isCurrent = approvers[myApproverIdx]?.status === st;
                      return (
                        <button key={st} onClick={async () => {
                          const newApprovers = [...approvers];
                          newApprovers[myApproverIdx] = { ...newApprovers[myApproverIdx], status: st };
                          await updateDoc(doc(db, "schedules", selectedSchedule.id), { approvers: newApprovers, isReRequest: false });
                          setSelectedSchedule(prev => ({ ...prev, approvers: newApprovers, isReRequest: false }));
                          // 결재 요청 알림을 읽음 처리
                          const notifId = `req_${selectedSchedule.id}_${auth.currentUser?.uid}`;
                          updateDoc(doc(db, "notifications", notifId), { read: true }).catch(() => {});
                          if (selectedSchedule.authorUid) {
                            const approverName = me?.name || auth.currentUser?.displayName || "";
                            addDoc(collection(db, "notifications"), { toUid: selectedSchedule.authorUid, type: "approval", status: st, scheduleType: selectedSchedule.type || "", approverName, scheduleId: selectedSchedule.id, createdAt: serverTimestamp(), read: false }).catch(() => {});
                          }
                        }} style={{
                          flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                          background: isCurrent ? (st === "approved" ? "#1B2B4B" : st === "rejected" ? "#DC2626" : "#6B7280") : "#F3F4F6",
                          color: isCurrent ? "#fff" : "#6B7280", border: isCurrent ? "none" : "1.5px solid #D1D5DB"
                        }}>{st === "approved" ? "승인" : st === "rejected" ? "반려" : "보류"}</button>
                      );
                    })}
                  </div>
                </div>
              )}
              {isHoldAndAuthor && (
                <button onClick={async () => {
                  const resetApprovers = approvers.map(a => ({ ...a, status: "pending" }));
                  await updateDoc(doc(db, "schedules", selectedSchedule.id), { approvers: resetApprovers, isReRequest: false });
                  setSelectedSchedule(null);
                }} className="w-full mb-3 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition"><EditableText id="home.schedule.재결재요청" defaultText="재결재 요청" /></button>
              )}
              {isAuthor && overallStatus === "rejected" && (
                <button onClick={async () => {
                  const resetApprovers = approvers.map(a => ({ ...a, status: "pending" }));
                  await updateDoc(doc(db, "schedules", selectedSchedule.id), { approvers: resetApprovers, isReRequest: true });
                  setSelectedSchedule(prev => ({ ...prev, approvers: resetApprovers, isReRequest: true }));
                  for (const a of resetApprovers) {
                    if (a.uid) {
                      const notifId = `req_${selectedSchedule.id}_${a.uid}`;
                      setDoc(doc(db, "notifications", notifId), { toUid: a.uid, type: "re_request", fromName: me?.name || "작성자", scheduleType: selectedSchedule.type || "", scheduleId: selectedSchedule.id, createdAt: serverTimestamp(), read: false }).catch(() => {});
                    }
                  }
                  setSelectedSchedule(null);
                }} className="w-full mb-3 py-2.5 rounded-xl bg-[#DC2626] text-white text-[13px] font-semibold hover:bg-[#b91c1c] transition"><EditableText id="home.schedule.재요청" defaultText="재요청" /></button>
              )}
              {(canEdit || canDelete) && !isViewer && (
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  {canDelete && <button onClick={() => setConfirmDialog({ message: "일정을 삭제하시겠습니까?", onConfirm: async () => { await deleteDoc(doc(db, "schedules", selectedSchedule.id)); setSelectedSchedule(null); } })} className="flex-1 py-2.5 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition"><EditableText id="home.schedule.삭제" defaultText="삭제" /></button>}
                  {canEdit && <button onClick={() => { setScheduleForm({ type: selectedSchedule.type, authorName: selectedSchedule.name || "", start: selectedSchedule.start, end: selectedSchedule.end, memo: selectedSchedule.memo || "", approvers: selectedSchedule.approvers || (selectedSchedule.approverUid ? [{ uid: selectedSchedule.approverUid, name: selectedSchedule.approverName || "" }] : []) }); setScheduleOpen(true); }} className="flex-1 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition"><EditableText id="home.schedule.수정" defaultText="수정" /></button>}
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {selectedHandover && !handoverEditMode && (
        <Modal title={handoverEditMode ? "인수인계 수정" : "인수인계 상세"} onClose={() => { setSelectedHandover(null); setHandoverEditMode(false); }}>
          {handoverEditMode ? (
            <div className="space-y-3">
              <select className={formInput} value={handoverForm.receiver} onChange={e => { const s = users.find(u => u.name === e.target.value); setHandoverForm({ ...handoverForm, receiver: s?.name || "", receiverUid: s?.uid || s?.id }); }}>
                <option value="">받는 사람 선택</option>
                {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
              <input type="date" className={formInput} value={handoverForm.date} onChange={e => setHandoverForm({ ...handoverForm, date: e.target.value })} />
              <textarea rows={4} className={formInput} value={handoverForm.text} onChange={e => setHandoverForm({ ...handoverForm, text: e.target.value })} />
              <div className="flex gap-2">
                <button className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-[13px] font-semibold" onClick={() => setHandoverEditMode(false)}><EditableText id="home.handover.취소" defaultText="취소" /></button>
                <button className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold" onClick={async () => {
                  const me = users.find(u => u.id === user?.uid);
                  await updateDoc(doc(db, "handovers", selectedHandover.id), { ...handoverForm, author: me?.name || "사용자", authorUid: user?.uid });
                  setHandoverEditMode(false); setSelectedHandover(null);
                }}><EditableText id="home.handover.저장" defaultText="저장" /></button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 text-[14px]">
                <div><div className="text-[13px] text-gray-500 mb-0.5">작성자</div><div className="font-semibold">{selectedHandover.author}</div></div>
                <div><div className="text-[13px] text-gray-500 mb-0.5">받는 사람</div><div>{(selectedHandover.receivers || []).length ? selectedHandover.receivers.map((r) => `${r.name}${(selectedHandover.readBy || []).includes(r.uid) ? " ✓" : ""}`).join(", ") : selectedHandover.receiver}</div></div>
                <div><div className="text-[13px] text-gray-500 mb-0.5">기준 날짜</div><div>{selectedHandover.date}</div></div>
                <div><div className="text-[13px] text-gray-500 mb-0.5">내용</div><div className="whitespace-pre-wrap bg-gray-50 rounded-lg p-3 leading-relaxed">{selectedHandover.text}</div></div>
              </div>
              {!isViewer && (() => {
                const isSA = role === "superadmin" || role === "totalMaster";
                const isHAuthor = isSA || (selectedHandover.authorUid ? selectedHandover.authorUid === user?.uid : !selectedHandover.authorUid);
                if (!isHAuthor) return null;
                return (
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <button onClick={() => setConfirmDialog({ message: "인수인계를 삭제하시겠습니까?", onConfirm: async () => { await deleteDoc(doc(db, "handovers", selectedHandover.id)); setSelectedHandover(null); setHandoverEditMode(false); } })} className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition"><EditableText id="home.handover.삭제" defaultText="삭제" /></button>
                  <button onClick={() => { isEditingHandoverRef.current = true; setHandoverForm({ text: selectedHandover.text, author: selectedHandover.author, authorUid: selectedHandover.authorUid, receiver: selectedHandover.receiver, receiverUid: selectedHandover.receiverUid, date: selectedHandover.date }); setHandoverEditMode(true); }} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition"><EditableText id="home.handover.수정" defaultText="수정" /></button>
                </div>
                );
              })()}
            </>
          )}
        </Modal>
      )}

     {/* ===== 토스트(오른쪽 아래 배너) — BannerCenter.jsx의 공용 카드 ===== */}
      {toast && createPortal(
        <div className="fixed bottom-6 right-6 z-[999980] pointer-events-none">
          <BannerStyles />
          <BannerCard
            id={`${toast.type}_${toast.data?.id}`}
            kind={toast.type}
            title={toast.type === "notice" ? toast.data.title : toast.type === "schedule" ? `[${toast.data.type}] ${toast.data.name || ""}` : toast.data.text}
            body={toast.type === "notice" ? String(toast.data.content || "").slice(0, 120) : toast.type === "handover" ? (toast.data.receiver ? `${toast.data.author || ""} → ${toast.data.receiver}` : "") : (toast.data.date || "")}
            from={toast.type === "notice" ? toast.data.author : ""}
            image={toast.type === "notice" ? toast.data.image : null}
            duration={10000}
            onClose={() => { const k = `${toast.type}_${toast.data?.id}`; if (toast.data?.id) { markToastSeen(k); _dismissedToasts.add(k); addPermDismissed(k); addFirestoreSeenKey(k); } setToast(null); }}
            onClick={() => {
              const k = `${toast.type}_${toast.data?.id}`;
              if (toast.data?.id) { markToastSeen(k); _dismissedToasts.add(k); addPermDismissed(k); addFirestoreSeenKey(k); }
              if (toast.type === "notice") { setSelectedNotice(toast.data); setBoardTab("공지사항"); }
              else if (toast.type === "schedule") setSelectedSchedule(toast.data);
              else if (toast.type === "handover") setSelectedHandover(toast.data);
              setToast(null);
            }}
          />
        </div>, document.body)}
      {confirmDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[300px] flex flex-col gap-4">
            <div className="text-[14px] font-semibold text-gray-800 text-center">{confirmDialog.message}</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="home.confirmDialog.취소" defaultText="취소" /></button>
              <button onClick={async () => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); await fn(); }} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 transition"><EditableText id="home.confirmDialog.삭제" defaultText="삭제" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
    <style>{`
      .kp-board table td { font-size: 14.5px !important; padding-top: 13px !important; padding-bottom: 13px !important; }
      .kp-board table tbody tr { transition: background .12s; }
      .kp-board table tbody tr:hover { background: #F4F7FC !important; }
    `}</style>
    </KpSubNav>
  );
}