import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceDot,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, deleteDoc, updateDoc, where, setDoc, getDoc, arrayUnion,
} from "firebase/firestore";
import { db, auth } from "./firebase";

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
function KpiCard({ title, value, unit = "", color = "blue" }) {
  const colors = {
    blue: "border-l-blue-500 bg-blue-50/50",
    green: "border-l-emerald-500 bg-emerald-50/50",
    orange: "border-l-orange-500 bg-orange-50/50",
    red: "border-l-red-500 bg-red-50/50",
  };
  return (
    <div className={`bg-white rounded-xl border border-gray-200 border-l-4 ${colors[color]} shadow-sm p-4`}>
      <div className="text-[12px] font-semibold text-gray-500 mb-1">{title}</div>
      <div className="text-[22px] font-bold text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <span className="text-[14px] font-semibold text-gray-400 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

/* ===== 섹션 카드 ===== */
function SectionCard({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {title && (
        <div className="flex justify-between items-center px-5 py-3 bg-[#1B2B4B]">
          <h3 className="text-[14px] font-bold text-white">{title}</h3>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ===== CountUp ===== */
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
  if (createdAt.seconds) return new Date(createdAt.seconds * 1000).toISOString().slice(0, 10);
  if (createdAt instanceof Date) return createdAt.toISOString().slice(0, 10);
  const d = new Date(createdAt);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/* ===== 게시판 테이블 공통 ===== */
function BoardTable({ headers, rows }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-200">
          {headers.map((h, i) => (
            <th key={i} className={`px-3 py-2.5 font-semibold text-gray-500 text-[12px] whitespace-nowrap ${h.align || "text-center"}`}
              style={{ width: h.width }}>
              {h.label}
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
    <div className="flex justify-center gap-1 pt-3">
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} onClick={() => onChange(i + 1)}
          className={`w-7 h-7 rounded-lg text-[12px] font-semibold transition ${i + 1 === page ? "bg-[#1B2B4B] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
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

/* ===================== HOME DASHBOARD ===================== */
export default function HomeDashboard({ role, user, userCompany = "", pending, delayed, dispatchData = [], onOrderDoubleClick }) {
  const isEditingHandoverRef = useRef(false);
  const [toast, setToast] = useState(null);
  const [firestoreSeenReady, setFirestoreSeenReady] = useState(false);
  const pendingToasts = useRef([]); // Firestore 로드 전에 쌓인 토스트 후보
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayStr = now.toISOString().slice(0, 10);

  const getLoadDate = (row) => {
    const v = row?.상차일자 || row?.상차일 || row?.상차;
    if (!v) return null;
    const d = new Date(String(v).slice(0, 10));
    return isNaN(d.getTime()) ? null : d;
  };

  const [period, setPeriod] = useState("7d");
  const isViewer = role === "viewer";
  const [boardTab, setBoardTab] = React.useState("공지사항");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeForm, setNoticeForm] = React.useState({ category: "공지사항", author: "", content: "" });
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleForm, setScheduleForm] = React.useState({ type: "휴가", authorName: "", start: "", end: "", memo: "", approvers: [] });
  const [notices, setNotices] = React.useState([]);
  const [schedules, setSchedules] = React.useState([]);
  const [handovers, setHandovers] = React.useState([]);

  const NOTICE_PAGE_SIZE = 5;
  const [noticePage, setNoticePage] = useState(1);
  const SCHEDULE_PAGE_SIZE = 5;
  const [schedulePage, setSchedulePage] = useState(1);

  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverForm, setHandoverForm] = useState({ text: "", author: "", authorUid: user?.uid || "", receiver: "", receiverUid: "", date: todayStr });
  const [selectedHandover, setSelectedHandover] = useState(null);
  const [handoverEditMode, setHandoverEditMode] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [users, setUsers] = useState([]);
  const [approvalNotifQueue, setApprovalNotifQueue] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

React.useEffect(() => {
  if (!toast) return;
  const snap = toast; // capture current toast
  const t = setTimeout(() => {
    if (snap?.data?.id) {
      const _k=`${snap.type}_${snap.data.id}`;
      _dismissedToasts.add(_k);
      try{const _s=new Set(JSON.parse(localStorage.getItem("permDismissed")||"[]"));_s.add(_k);localStorage.setItem("permDismissed",JSON.stringify([..._s].slice(-300)));}catch{}
    }
    setToast(null);
  }, 10000);
  return () => clearTimeout(t);
}, [toast]);

  const getViewCompany = () => role === "totalMaster"
    ? (localStorage.getItem("loginCompany") || userCompany || "돌캐")
    : (userCompany || localStorage.getItem("userCompany") || "돌캐");

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
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => (d.companyName || "돌캐") === vc);
      setSchedules(list);
      if (initialLoad) {
        initialLoad = false;
        showTodayToast("schedule", list); // 접속 시 오늘 항목 알림
        return;
      }
      // 실시간 신규 등록 알림
      const added = snap.docChanges().find(c => c.type === "added" && !c.doc.metadata.hasPendingWrites);
      if (!added) return;
      const data = { id: added.doc.id, ...added.doc.data() };
      const seenKeyS = `schedule_${data.id}`;
      if (getSeenToasts()[seenKeyS] || isAlreadySeen(seenKeyS)) return;
      markToastSeen(seenKeyS); addPermDismissed(seenKeyS);
      setToast({ type: "schedule", data });
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
      const list = snap.docs.map(d => { const data = d.data(); const date = formatCreatedAt(data.createdAt); if (!date) return null; return { id: d.id, ...data, date }; }).filter(Boolean).filter(d => (d.companyName || "돌캐") === vc);
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
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => (d.companyName || "돌캐") === vc);
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
  const scheduleTotalPages = Math.ceil(schedules.length / SCHEDULE_PAGE_SIZE);
  const pagedSchedules = useMemo(() => { const s = (schedulePage - 1) * SCHEDULE_PAGE_SIZE; return schedules.slice(s, s + SCHEDULE_PAGE_SIZE); }, [schedules, schedulePage]);

  const HANDOVER_PAGE_SIZE = 5;
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

  const yearRevenue = useMemo(() => dispatchData.reduce((sum, row) => { const d = getLoadDate(row); if (!d) return sum; return d.getFullYear() === currentYear ? sum + Number(row?.청구운임 || 0) : sum; }, 0), [dispatchData]);
  const monthRevenue = useMemo(() => dispatchData.reduce((sum, row) => { const d = getLoadDate(row); if (!d) return sum; return d.getFullYear() === currentYear && d.getMonth() === currentMonth ? sum + Number(row?.청구운임 || 0) : sum; }, 0), [dispatchData]);
  const orderCountFrom2026 = useMemo(() => dispatchData.filter(row => { const d = getLoadDate(row); return d && d >= new Date("2026-01-01"); }).length, [dispatchData]);

  const salesTrend = useMemo(() => {
    const today = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ key: d.toISOString().slice(0, 10), date: `${d.getMonth() + 1}/${d.getDate()}`, value: 0 });
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
      if (!dDate || dDate.getFullYear() !== 2026 || dDate.getMonth() !== 0) return;
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

  const TICKER_PAGE_SIZE = 4;
  const [tickerPage, setTickerPage] = useState(0);
  const totalTickerPages = Math.max(1, Math.ceil(allPendingOrders.length / TICKER_PAGE_SIZE));

  useEffect(() => {
    if (allPendingOrders.length <= TICKER_PAGE_SIZE) return;
    const t = setInterval(() => {
      setTickerPage(p => (p + 1) % totalTickerPages);
    }, 3000);
    return () => clearInterval(t);
  }, [allPendingOrders.length, totalTickerPages]);

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

  return (
    <div className="bg-gray-50 min-h-screen p-5 space-y-4">

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
          <button onClick={dismissBanner} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
        </div>
        );
      })()}

      {/* ===== KPI 4개 ===== */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="오늘 접수" value={todayStatsFixed.count} unit="건" color="blue" />
        <KpiCard title="미배차" value={pending} unit="건" color="red" />
        <KpiCard title="오늘 매출" value={todayStatsFixed.revenue} unit="원" color="green" />
        <KpiCard title="오늘 수익" value={todayStatsFixed.profit} unit="원" color="orange" />
      </div>

      {/* ===== 차트 + Sales Score ===== */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center px-5 py-3 bg-[#1B2B4B]">
          <h3 className="text-[14px] font-bold text-white">매출 현황</h3>
          <button onClick={() => setPeriod(p => p === "7d" ? "none" : "7d")}
            className="text-[12px] px-2.5 py-1 rounded-lg bg-white/20 text-white border border-white/30 hover:bg-white/30 transition">
            최근 7일
          </button>
        </div>
        <div className="p-4 grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={salesTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1B2B4B" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#1B2B4B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} dy={4} />
                <YAxis hide />
                <Tooltip formatter={v => `${Number(v).toLocaleString()}원`} contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                <Area type="natural" dataKey="value" stroke="#1B2B4B" strokeWidth={2.5} fill="url(#colorRev)" dot={false} activeDot={{ r: 6, fill: "#1B2B4B", stroke: "#fff", strokeWidth: 2 }} animationDuration={1000} />
                {salesTrend.length === 7 && <ReferenceDot x={salesTrend[6].date} y={salesTrend[6].value} r={5} fill="#1B2B4B" stroke="#fff" strokeWidth={2} />}
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-2 pt-2 border-t border-gray-100 flex items-end justify-between">
              <div>
                <div className="text-[11px] text-gray-400 font-medium">Total Revenue</div>
                <div className="text-[16px] font-bold text-gray-900">{yearRevenue.toLocaleString()}원</div>
              </div>
              <div className={`text-[13px] font-semibold ${delta >= 0 ? "text-blue-600" : "text-red-500"}`}>
                {delta >= 0 ? "+" : ""}{Math.abs(delta).toLocaleString()}원
              </div>
            </div>
          </div>
          <div className="border-l border-gray-100 pl-4 flex flex-col justify-center gap-4">
            {[
              { label: "년 매출", value: yearRevenue, unit: "원" },
              { label: "당월 매출", value: monthRevenue, unit: "원" },
              { label: "누적 오더", value: orderCountFrom2026, unit: "건" },
              { label: "등록 거래처", value: new Set(dispatchData.map(d => d?.거래처명).filter(Boolean)).size, unit: "곳" },
            ].map((item, i) => (
              <div key={i}>
                <div className="text-[20px] font-extrabold text-[#1B2B4B] leading-tight">
                  <CountUp value={item.value} />
                  <span className="text-[12px] font-semibold text-gray-400 ml-1">{item.unit}</span>
                </div>
                <div className="text-[11px] font-medium text-gray-500">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== 하단: 미배차 현황 + Top5 ===== */}
      <div className="grid grid-cols-3 gap-4">
        {/* 미배차 현황 ticker — col-span-2 */}
        <div className="col-span-2">
        <SectionCard title={`미배차 현황 (${allPendingOrders.length}건)`}>
          {allPendingOrders.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-[13px] text-gray-400">미배차 오더가 없습니다</div>
          ) : (
            <div className="relative" style={{ minHeight: 220 }}>
              {/* column headers — navy, 카드 전체 너비 채움 */}
              <div className="grid text-[12px] font-bold text-white bg-[#1B2B4B] w-full"
                style={{ gridTemplateColumns: "1fr 1.3fr 1fr 1.3fr 1.6fr 1.4fr 1.4fr 1.2fr 1.2fr 0.7fr 1.2fr" }}>
                {["상차일","상차시간","하차일","하차시간","거래처명","상차지명","하차지명","화물내용","차량종류","톤수","배차상태"].map(h => (
                  <span key={h} className="text-center px-2 py-2.5 whitespace-nowrap">{h}</span>
                ))}
              </div>
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
                      className={`grid items-center border-b border-gray-100 hover:bg-blue-50/30 cursor-pointer transition w-full ${i % 2 ? "bg-gray-50/50" : "bg-white"}`}
                      style={{ gridTemplateColumns: "1fr 1.3fr 1fr 1.3fr 1.6fr 1.4fr 1.4fr 1.2fr 1.2fr 0.7fr 1.2fr" }}
                      onDoubleClick={() => onOrderDoubleClick && onOrderDoubleClick(d)}
                    >
                      <span className="text-center px-2 py-2.5 text-[12px] font-bold text-[#1B2B4B] truncate">{상차일}</span>
                      <span className="text-center px-2 py-2.5 text-[12px] text-gray-900 truncate">{d?.상차시간 || ""}</span>
                      <span className="text-center px-2 py-2.5 text-[12px] text-gray-900 truncate">{하차일}</span>
                      <span className="text-center px-2 py-2.5 text-[12px] text-gray-900 truncate">{d?.하차시간 || ""}</span>
                      <span className="text-center px-2 py-2.5 text-[12px] font-bold text-[#1B2B4B] truncate">{d?.거래처명 || ""}</span>
                      <span className="text-center px-2 py-2.5 text-[12px] text-gray-900 truncate">{d?.상차지명 || ""}</span>
                      <span className="text-center px-2 py-2.5 text-[12px] text-gray-900 truncate">{d?.하차지명 || ""}</span>
                      <span className="text-center px-2 py-2.5 text-[12px] text-gray-900 truncate">{d?.화물내용 || ""}</span>
                      <span className="text-center px-2 py-2.5 text-[12px] text-gray-900 truncate">{d?.차량종류 || ""}</span>
                      <span className="text-center px-2 py-2.5 text-[12px] text-gray-900 truncate">{d?.차량톤수 || ""}</span>
                      <span className={`text-center px-2 py-2.5 text-[12px] font-bold truncate whitespace-nowrap ${status === "배차완료" ? "text-[#1B2B4B]" : status === "배차중" ? "text-[#1B2B4B]" : "text-[#1B2B4B]"}`}>{status}</span>
                    </div>
                  );
                })}
              </div>
              {/* page indicator */}
              {totalTickerPages > 1 && (
                <div className="flex justify-center gap-1 pt-2">
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
            </div>
          )}
          <style>{`
            @keyframes tickerSlideUp {
              from { opacity: 0; transform: translateY(14px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </SectionCard>
        </div>

        {/* Top5 거래처 */}
        <SectionCard title="Top 5 거래처">
          {topClients.length === 0 ? (
            <div className="text-[13px] text-gray-400 text-center py-8">데이터 없음</div>
          ) : (
            <div className="space-y-3 py-1">
              {topClients.map((c, i) => {
                const max = topClients[0]?.value || 1;
                return (
                  <div key={c.name} className="flex items-center gap-3">
                    <span className="text-[12px] font-bold text-gray-300 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-semibold text-gray-700 truncate">{c.name}</span>
                        <span className="text-[12px] font-bold text-[#1B2B4B] shrink-0 ml-2">{c.value >= 1000000 ? `${(c.value / 1000000).toFixed(1)}M` : c.value.toLocaleString()}원</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(c.value / max) * 100}%`, backgroundColor: i === 0 ? "#1B2B4B" : i === 1 ? "#2d4470" : "#4a6296", opacity: 1 - i * 0.1 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-between mt-3 pt-2 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">1위: <b className="text-[#1B2B4B]">{top10Summary.topName}</b></span>
            <span className="text-[11px] text-gray-400">합계: <b className="text-[#1B2B4B]">{(top10Summary.total / 1000000).toFixed(1)}M</b></span>
          </div>
        </SectionCard>
      </div>

      {/* ===== 통합 게시판 ===== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* 헤더: 탭 + 등록 버튼 */}
        <div className="flex items-center border-b border-gray-100 px-4">
          <div className="flex gap-0">
            {(() => {
              const pendingApprovalCount = schedules.filter(s => (s.approvers || []).some(a => a.uid === user?.uid && (!a.status || a.status === "pending"))).length;
              const unreadHandoverCount = handovers.filter(h => user?.uid === h.receiverUid && !h.readBy?.includes(h.receiverUid)).length;
              return [
                { key: "공지사항", badge: 0 },
                { key: "휴가/외근", badge: pendingApprovalCount },
                { key: "인수인계", badge: unreadHandoverCount },
              ].map(({ key, badge }) => {
                const isActive = boardTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setBoardTab(key)}
                    className={`relative px-5 py-3.5 text-[13px] font-semibold transition border-b-2 ${
                      isActive
                        ? "text-[#1B2B4B] border-[#1B2B4B]"
                        : "text-gray-400 border-transparent hover:text-gray-600"
                    }`}
                  >
                    {key}
                    {badge > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#1B2B4B] text-white text-[11px] font-bold">{badge}</span>
                    )}
                  </button>
                );
              });
            })()}
          </div>
          <div className="ml-auto">
            {!isViewer && boardTab === "공지사항" && <RegBtn onClick={() => { setSelectedNotice(null); setNoticeForm({ category: "공지사항", author: "", content: "" }); setNoticeOpen(true); }} />}
            {!isViewer && boardTab === "휴가/외근" && <RegBtn onClick={() => { setSelectedSchedule(null); setScheduleForm({ type: "휴가", authorName: "", start: "", end: "", memo: "", approvers: [] }); setScheduleOpen(true); }} />}
            {!isViewer && boardTab === "인수인계" && (
              <RegBtn onClick={() => {
                const me = users.find(u => u.id === user?.uid);
                setSelectedHandover(null);
                setHandoverForm({ text: "", author: me?.name || "", authorUid: user?.uid || "", receiver: "", receiverUid: "", date: todayStr });
                setHandoverOpen(true);
              }} />
            )}
          </div>
        </div>

        {/* 탭 콘텐츠 */}
        <div className="p-4">
          {/* 공지사항 탭 */}
          {boardTab === "공지사항" && (
            notices.length === 0 ? (
              <div className="text-[13px] text-gray-400 py-6 text-center">등록된 공지가 없습니다</div>
            ) : (
              <>
                <BoardTable
                  headers={[
                    { label: "No", width: "44px" },
                    { label: "등록날짜", width: "90px" },
                    { label: "등록시간", width: "70px" },
                    { label: "작성자", width: "80px" },
                    { label: "제목", align: "text-left", width: "180px" },
                  ]}
                  rows={pagedNotices.map((n, idx) => (
                    <tr key={n.id} onClick={() => setSelectedNotice(n)} className="cursor-pointer hover:bg-blue-50/50 transition">
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{(noticePage - 1) * NOTICE_PAGE_SIZE + idx + 1}</td>
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{n.date?.replaceAll("-", ".")}</td>
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{formatCreatedAtTime(n.createdAt)}</td>
                      <td className="px-3 py-2.5 text-center text-[13px] font-semibold text-gray-700">{n.author}</td>
                      <td className="px-3 py-2.5 text-[13px] font-semibold text-gray-800">{n.title || "공지사항"}</td>
                    </tr>
                  ))}
                />
                <Pagination page={noticePage} total={noticeTotalPages} onChange={setNoticePage} />
              </>
            )
          )}

          {/* 휴가/외근 탭 */}
          {boardTab === "휴가/외근" && (
            schedules.length === 0 ? (
              <div className="text-[13px] text-gray-400 py-6 text-center">등록된 일정이 없습니다</div>
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
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{(schedulePage - 1) * SCHEDULE_PAGE_SIZE + idx + 1}</td>
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">
                        {s.createdAt?.toDate ? s.createdAt.toDate().toISOString().slice(0, 10).replaceAll("-", ".") : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{formatCreatedAtTime(s.createdAt)}</td>
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
              <div className="text-[13px] text-gray-400 py-6 text-center">등록된 인수인계가 없습니다</div>
            ) : (
              <>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
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
                      const receiverRead = h.readBy?.includes(h.receiverUid);
                      const isReceiver = user?.uid === h.receiverUid;
                      const isAuthor = user?.uid === h.authorUid;
                      const unread = isReceiver && !receiverRead;
                      const dateStr = (h.date || formatCreatedAt(h.createdAt) || "").replaceAll("-", ".");
                      return (
                        <tr key={h.id}
                          onClick={async () => {
                            setSelectedHandover(h);
                            if (isReceiver && !receiverRead) {
                              await updateDoc(doc(db, "handovers", h.id), { readBy: [...(h.readBy || []), user.uid] });
                            }
                          }}
                          className={`cursor-pointer transition hover:bg-blue-50/50 relative ${unread ? "bg-red-50/60" : ""}`}
                        >
                          <td className="w-[44px] text-center py-2.5 pl-3 pr-2 relative">
                            {(isReceiver || isAuthor) && (
                              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r ${receiverRead ? "bg-emerald-400" : "bg-red-400"}`} />
                            )}
                            <span className="text-[12px] text-gray-400">{(handoverPage - 1) * HANDOVER_PAGE_SIZE + idx + 1}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{dateStr}</td>
                          <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{formatCreatedAtTime(h.createdAt)}</td>
                          <td className="px-3 py-2.5 text-center text-[13px] font-semibold text-gray-700">{h.author}</td>
                          <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 whitespace-nowrap">{h.receiver || "-"}</td>
                          <td className="px-3 py-2.5 text-[13px] text-gray-800 whitespace-nowrap">{(() => {
                            const d = h.date || formatCreatedAt(h.createdAt) || "";
                            if (!d) return "업무 인수인계";
                            const [y, m, day] = d.split("-");
                            return `${y}년 ${m}월 ${day}일 업무 인수인계`;
                          })()}</td>
                          <td className="px-3 py-2.5 text-center whitespace-nowrap">
                            <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${receiverRead ? "bg-[#EEF1F7] text-[#1B2B4B]" : "bg-red-50 text-red-500"}`}>
                              {receiverRead ? "확인" : "미확인"}
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

      {/* ===== 모달들 ===== */}
      {noticeOpen && (
        <Modal title={selectedNotice ? "공지사항 수정" : "공지사항 등록"} onClose={() => { setNoticeOpen(false); setSelectedNotice(null); }}>
          <div className="space-y-3">
            <select className={formInput} value={noticeForm.category} onChange={e => setNoticeForm({ ...noticeForm, category: e.target.value })}>
              <option>공지사항</option>
              <option>업데이트</option>
              <option>안내</option>
              <option>긴급</option>
            </select>
            <select className={formInput} value={noticeForm.author} onChange={e => setNoticeForm({ ...noticeForm, author: e.target.value })}>
              <option value="">작성자 선택</option>
              {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
            <textarea placeholder="내용" rows={4} className={formInput} value={noticeForm.content} onChange={e => setNoticeForm({ ...noticeForm, content: e.target.value })} />
            <button onClick={async () => {
              if (!noticeForm.author) { alert("작성자를 선택하세요"); return; }
              const now = new Date();
              const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,"0"), d = String(now.getDate()).padStart(2,"0");
              const autoTitle = `${y}년 ${m}월 ${d}일 ${noticeForm.category}`;
              if (selectedNotice?.id) {
                await updateDoc(doc(db, "notices", selectedNotice.id), { title: autoTitle, category: noticeForm.category, author: noticeForm.author, content: noticeForm.content });
              } else {
                await addDoc(collection(db, "notices"), { title: autoTitle, category: noticeForm.category, author: noticeForm.author, content: noticeForm.content, authorUid: user?.uid || "", createdAt: serverTimestamp(), companyName: getViewCompany() });
              }
              setNoticeForm({ category: "공지사항", author: "", content: "" }); setNoticeOpen(false); setSelectedNotice(null);
            }} className="w-full bg-[#1B2B4B] text-white py-2.5 rounded-lg font-semibold text-[14px] hover:bg-[#243a60] transition">저장</button>
          </div>
        </Modal>
      )}

      {selectedNotice && !noticeOpen && (
        <Modal title="공지사항 상세" onClose={() => setSelectedNotice(null)}>
          <div className="space-y-3 text-[14px]">
            <div><div className="text-[13px] text-gray-400 mb-0.5">제목</div><div className="font-semibold">{selectedNotice.title}</div></div>
            <div><div className="text-[13px] text-gray-400 mb-0.5">작성자</div><div>{selectedNotice.author}</div></div>
            <div><div className="text-[13px] text-gray-400 mb-0.5">작성일</div><div>{selectedNotice.date}</div></div>
            <div><div className="text-[13px] text-gray-400 mb-0.5">내용</div><div className="whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3">{selectedNotice.content}</div></div>
          </div>
          {(!isViewer) && (() => {
            const isSA = role === "superadmin" || role === "totalMaster";
            const isNoticeAuthor = isSA || (selectedNotice.authorUid ? selectedNotice.authorUid === user?.uid : !selectedNotice.authorUid);
            if (!isNoticeAuthor) return null;
            return (
            <div className="flex gap-2 mt-4 pt-4 border-t">
              <button onClick={() => setConfirmDialog({ message: "공지사항을 삭제하시겠습니까?", onConfirm: async () => { await deleteDoc(doc(db, "notices", selectedNotice.id)); setSelectedNotice(null); } })} className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition">삭제</button>
              <button onClick={() => { setNoticeForm({ category: selectedNotice.category || "공지사항", author: selectedNotice.author, content: selectedNotice.content }); setNoticeOpen(true); }} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">수정</button>
            </div>
            );
          })()}
        </Modal>
      )}

      {scheduleOpen && (
        <Modal title="휴가 / 외근 일정 등록" onClose={() => setScheduleOpen(false)}>
          <div className="space-y-3">
            {(role === "superadmin" || role === "totalMaster") && selectedSchedule?.id && (
              <div>
                <div className="text-[11px] text-gray-400 mb-1">작성자</div>
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
              if (selectedSchedule?.id) {
                const updatedFields = { type: scheduleForm.type, start: scheduleForm.start, end: scheduleForm.end, memo: scheduleForm.memo, approvers: approversData };
                if ((role === "superadmin" || role === "totalMaster") && scheduleForm.authorName) updatedFields.name = scheduleForm.authorName;
                await updateDoc(doc(db, "schedules", selectedSchedule.id), updatedFields);
                setSelectedSchedule(prev => ({ ...prev, ...updatedFields }));
              } else {
                const newDocRef = await addDoc(collection(db, "schedules"), { type: scheduleForm.type, name: userName, authorUid: user?.uid || "", start: scheduleForm.start, end: scheduleForm.end, memo: scheduleForm.memo, approvers: approversData, approvalStatus: "pending", createdAt: serverTimestamp(), companyName: getViewCompany() });
                // 결재자에게 최초 결재 요청 알림 발송
                for (const a of approversData) {
                  if (a.uid) setDoc(doc(db, "notifications", `req_${newDocRef.id}_${a.uid}`), { toUid: a.uid, type: "approval_request", fromName: userName, scheduleType: scheduleForm.type, scheduleId: newDocRef.id, createdAt: serverTimestamp(), read: false }).catch(() => {});
                }
              }
              setScheduleForm({ type: "휴가", authorName: "", start: "", end: "", memo: "", approvers: [] }); setScheduleOpen(false);
            }} className="w-full bg-[#1B2B4B] text-white py-2.5 rounded-lg font-semibold text-[14px] hover:bg-[#243a60] transition">저장</button>
          </div>
        </Modal>
      )}

      {selectedSchedule && !scheduleOpen && (() => {
        const me = users.find(u => u.id === user?.uid);
        const overallStatus = getOverallApprovalStatus(selectedSchedule);
        const isAuthor = user?.uid === selectedSchedule.authorUid;
        const isSuperAdmin = role === "superadmin" || role === "totalMaster";
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
              <button onClick={() => setSelectedSchedule(null)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
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
                }} className="w-full mb-3 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">재결재 요청</button>
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
                }} className="w-full mb-3 py-2.5 rounded-xl bg-[#DC2626] text-white text-[13px] font-semibold hover:bg-[#b91c1c] transition">재요청</button>
              )}
              {(canEdit || canDelete) && !isViewer && (
                <div className="flex gap-2 pt-3 border-t border-gray-100">
                  {canDelete && <button onClick={() => setConfirmDialog({ message: "일정을 삭제하시겠습니까?", onConfirm: async () => { await deleteDoc(doc(db, "schedules", selectedSchedule.id)); setSelectedSchedule(null); } })} className="flex-1 py-2.5 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition">삭제</button>}
                  {canEdit && <button onClick={() => { setScheduleForm({ type: selectedSchedule.type, authorName: selectedSchedule.name || "", start: selectedSchedule.start, end: selectedSchedule.end, memo: selectedSchedule.memo || "", approvers: selectedSchedule.approvers || (selectedSchedule.approverUid ? [{ uid: selectedSchedule.approverUid, name: selectedSchedule.approverName || "" }] : []) }); setScheduleOpen(true); }} className="flex-1 py-2.5 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">수정</button>}
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {handoverOpen && (
        <Modal title="인수인계 등록" onClose={() => setHandoverOpen(false)}>
          <div className="space-y-3">
            <select className={formInput} value={handoverForm.receiver} onChange={e => { const s = users.find(u => u.name === e.target.value); setHandoverForm({ ...handoverForm, receiver: s?.name || "", receiverUid: s?.uid || s?.id }); }}>
              <option value="">받는 사람 선택</option>
              {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
            <input type="date" className={formInput} value={handoverForm.date} onChange={e => setHandoverForm({ ...handoverForm, date: e.target.value })} />
            <textarea rows={4} placeholder="인수인계 내용" className={formInput} value={handoverForm.text} onChange={e => setHandoverForm({ ...handoverForm, text: e.target.value })} />
            <button onClick={async () => {
              if (!handoverForm.authorUid) { alert("로그인 정보가 없습니다."); return; }
              if (!handoverForm.receiver) { alert("받는 사람을 선택하세요"); return; }
              if (!handoverForm.text.trim()) { alert("내용을 입력하세요"); return; }
              const me = users.find(u => u.id === user?.uid);
              if (selectedHandover?.id) {
                await updateDoc(doc(db, "handovers", selectedHandover.id), { ...handoverForm, author: me?.name || "사용자", authorUid: user?.uid });
              } else {
                await addDoc(collection(db, "handovers"), { ...handoverForm, author: me?.name || "사용자", authorUid: user?.uid, createdAt: serverTimestamp(), readBy: [], companyName: getViewCompany() });
              }
              setHandoverForm({ text: "", author: me?.name || "", authorUid: user?.uid || "", receiver: "", receiverUid: "", date: todayStr });
              setHandoverOpen(false); setSelectedHandover(null); isEditingHandoverRef.current = false;
            }} className="w-full bg-[#1B2B4B] text-white py-2.5 rounded-lg font-semibold text-[14px] hover:bg-[#243a60] transition">저장</button>
          </div>
        </Modal>
      )}

      {selectedHandover && (
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
                <button className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-[13px] font-semibold" onClick={() => setHandoverEditMode(false)}>취소</button>
                <button className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold" onClick={async () => {
                  const me = users.find(u => u.id === user?.uid);
                  await updateDoc(doc(db, "handovers", selectedHandover.id), { ...handoverForm, author: me?.name || "사용자", authorUid: user?.uid });
                  setHandoverEditMode(false); setSelectedHandover(null);
                }}>저장</button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 text-[14px]">
                <div><div className="text-[13px] text-gray-400 mb-0.5">작성자</div><div className="font-semibold">{selectedHandover.author}</div></div>
                <div><div className="text-[13px] text-gray-400 mb-0.5">받는 사람</div><div>{selectedHandover.receiver}</div></div>
                <div><div className="text-[13px] text-gray-400 mb-0.5">기준 날짜</div><div>{selectedHandover.date}</div></div>
                <div><div className="text-[13px] text-gray-400 mb-0.5">내용</div><div className="whitespace-pre-wrap bg-gray-50 rounded-lg p-3 leading-relaxed">{selectedHandover.text}</div></div>
              </div>
              {!isViewer && (() => {
                const isSA = role === "superadmin" || role === "totalMaster";
                const isHAuthor = isSA || (selectedHandover.authorUid ? selectedHandover.authorUid === user?.uid : !selectedHandover.authorUid);
                if (!isHAuthor) return null;
                return (
                <div className="flex gap-2 mt-4 pt-4 border-t">
                  <button onClick={() => setConfirmDialog({ message: "인수인계를 삭제하시겠습니까?", onConfirm: async () => { await deleteDoc(doc(db, "handovers", selectedHandover.id)); setSelectedHandover(null); setHandoverEditMode(false); } })} className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition">삭제</button>
                  <button onClick={() => { isEditingHandoverRef.current = true; setHandoverForm({ text: selectedHandover.text, author: selectedHandover.author, authorUid: selectedHandover.authorUid, receiver: selectedHandover.receiver, receiverUid: selectedHandover.receiverUid, date: selectedHandover.date }); setHandoverEditMode(true); }} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">수정</button>
                </div>
                );
              })()}
            </>
          )}
        </Modal>
      )}

     {/* ===== 토스트 ===== */}
      <style>{`
        @keyframes toastSlideIn {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      @keyframes toastProgress {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .toast-enter { animation: toastSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .toast-bar   { animation: toastProgress 10s linear forwards; }
      `}</style>

      {toast && (() => {
        const cfg = {
          notice:   { icon: "📢", label: "공지사항 등록",  accent: "#3B82F6", bg: "#EFF6FF", body: toast.data.title },
          schedule: { icon: "📅", label: "일정 등록",      accent: "#10B981", bg: "#ECFDF5", body: `[${toast.data.type}] ${toast.data.name || ""}` },
          handover: { icon: "📝", label: "인수인계 등록",  accent: "#F59E0B", bg: "#FFFBEB", body: toast.data.text },
        }[toast.type] || {};

        return (
          <div
            className="toast-enter fixed bottom-6 right-6 z-50 cursor-pointer select-none"
            style={{ width: 320 }}
            onClick={() => {
              const k = `${toast.type}_${toast.data?.id}`;
              if (toast.data?.id) { markToastSeen(k); _dismissedToasts.add(k); addPermDismissed(k); addFirestoreSeenKey(k); }
              if (toast.type === "notice") setSelectedNotice(toast.data);
              else if (toast.type === "schedule") setSelectedSchedule(toast.data);
              else if (toast.type === "handover") setSelectedHandover(toast.data);
              setToast(null);
            }}
          >
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-100"
              style={{ background: "#fff" }}>

              {/* 상단 헤더 */}
              <div className="flex items-center justify-between px-4 py-3"
                style={{ background: "#1B2B4B" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[18px]"
                    style={{ background: "rgba(255,255,255,0.15)" }}>
                    {cfg.icon}
                  </div>
                  <div>
                    <div className="text-white font-bold text-[13px] leading-tight">새 알림</div>
                    <div className="text-white/60 text-[11px]">{cfg.label}</div>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); const k = `${toast.type}_${toast.data?.id}`; if (toast.data?.id) { markToastSeen(k); _dismissedToasts.add(k); addPermDismissed(k); addFirestoreSeenKey(k); } setToast(null); }}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition text-[14px]"
                >✕</button>
              </div>

              {/* 본문 */}
              <div className="px-4 py-3" style={{ background: cfg.bg }}>
                <div className="text-[13px] font-semibold text-gray-800 line-clamp-2 leading-relaxed">
                  {cfg.body}
                </div>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
                    style={{ background: cfg.accent }}>
                    {cfg.label}
                  </span>
                  <span className="text-[11px] text-gray-400">· 클릭하여 확인</span>
                </div>
              </div>

              {/* 하단 진행바 */}
              <div className="h-1" style={{ background: "#f1f5f9" }}>
                <div className="toast-bar h-full rounded-full"
                  style={{ background: cfg.accent }} />
              </div>
            </div>
          </div>
        );
      })()}
      {confirmDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[300px] flex flex-col gap-4">
            <div className="text-[14px] font-semibold text-gray-800 text-center">{confirmDialog.message}</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 py-2 rounded-lg border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition">취소</button>
              <button onClick={async () => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); await fn(); }} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-[13px] font-semibold hover:bg-red-700 transition">삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}