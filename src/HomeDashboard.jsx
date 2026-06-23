import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceDot,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, deleteDoc, updateDoc,
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
  if (!status || status === "pending") return <span className="text-[11px] text-gray-300">대기</span>;
  const map = { approved: ["승인", "#1B2B4B", "bg-[#EEF1F7] text-[#1B2B4B]"], rejected: ["반려", "#DC2626", "bg-red-50 text-red-600"], hold: ["보류", "#6B7280", "bg-gray-100 text-gray-500"] };
  const [label, , cls] = map[status] || ["대기", "", ""];
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${cls}`}>{label}</span>;
}

/* ===== ApprovalStamp ===== */
function ApprovalStamp({ status }) {
  if (!status || status === "pending") return null;
  const map = { approved: ["승 인", "#1B2B4B"], rejected: ["반 려", "#DC2626"], hold: ["보 류", "#6B7280"] };
  const [label, color] = map[status] || [];
  if (!label) return null;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div style={{ border: `3px solid ${color}`, color, transform: "rotate(-12deg)", opacity: 0.85 }}
        className="w-20 h-20 rounded-full flex items-center justify-center">
        <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: "0.2em" }}>{label}</span>
      </div>
    </div>
  );
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

/* ===================== HOME DASHBOARD ===================== */
export default function HomeDashboard({ role, user, userCompany = "", pending, delayed, dispatchData = [], onOrderDoubleClick }) {
  const isEditingHandoverRef = useRef(false);
  const [toast, setToast] = useState(null);
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
  const [noticeForm, setNoticeForm] = React.useState({ title: "", author: "", content: "" });
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleForm, setScheduleForm] = React.useState({ type: "휴가", name: "", start: "", end: "", memo: "", approverUid: "", approverName: "" });
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

  const showTodayToast = React.useCallback((type, items) => {
    const today = todayKST();
    const seen = getSeenToasts();

    // 오늘 날짜 기준으로 가장 최근 항목 찾기
    const todayItem = items.find(item => {
      const sec = item.createdAt?.seconds;
      if (!sec) return false;
      const kst = new Date(new Date(sec * 1000).getTime() + 9 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      return kst === today;
    });
    if (!todayItem) return;

    // localStorage에 이미 본 기록 있으면 스킵
    const shownKey = `${type}_${todayItem.id}`;
    if (seen[shownKey] || _dismissedToasts.has(shownKey) || getPermDismissed().has(shownKey)) return;

    markToastSeen(shownKey); // setTimeout 이전에 기록 (race condition 방지)
    addPermDismissed(shownKey); // 영구 기록 — 탭 닫아도 재표시 안 함
    setTimeout(() => {
      setToast({
        type,
        data: { ...todayItem, date: formatCreatedAt(todayItem.createdAt) }
      });
    }, type === "notice" ? 500 : type === "schedule" ? 1500 : 2500);
  }, []);

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
      if (getSeenToasts()[seenKeyS] || _dismissedToasts.has(seenKeyS) || getPermDismissed().has(seenKeyS)) return;
      markToastSeen(seenKeyS); addPermDismissed(seenKeyS);
      setToast({ type: "schedule", data });
    });
    return () => unsub();
  }, [showTodayToast]);

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
      if (getSeenToasts()[seenKeyN] || _dismissedToasts.has(seenKeyN) || getPermDismissed().has(seenKeyN)) return;
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
      if (getSeenToasts()[seenKeyH] || _dismissedToasts.has(seenKeyH) || getPermDismissed().has(seenKeyH)) return;
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

  return (
    <div className="bg-gray-50 min-h-screen p-5 space-y-4">

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
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topClients} margin={{ top: 24, right: 8, left: 8, bottom: 32 }}>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 13, fill: "#1B2B4B", fontWeight: 700 }}
                  interval={0}
                  tickFormatter={v => v.length > 6 ? v.slice(0, 6) + "…" : v}
                />
                <YAxis hide />
                <Tooltip
                  formatter={v => [`${Number(v).toLocaleString()}원`, "매출"]}
                  contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={52}>
                  {topClients.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? "#1B2B4B" : i === 1 ? "#2d4470" : "#4a6296"} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v.toLocaleString()}
                    style={{ fontSize: 10, fill: "#6b7280", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex justify-between mt-1 pt-2 border-t border-gray-100">
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
            {[
              { key: "공지사항", count: notices.length },
              { key: "휴가/외근", count: schedules.length },
              { key: "인수인계", count: handovers.filter(h => user?.uid === h.receiverUid && !h.readBy?.includes(h.receiverUid)).length > 0 ? handovers.filter(h => user?.uid === h.receiverUid && !h.readBy?.includes(h.receiverUid)).length : handovers.length },
            ].map(({ key, count }) => {
              const isActive = boardTab === key;
              const unreadCount = key === "인수인계" ? handovers.filter(h => user?.uid === h.receiverUid && !h.readBy?.includes(h.receiverUid)).length : 0;
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
                  {unreadCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold">{unreadCount}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="ml-auto">
            {!isViewer && boardTab === "공지사항" && <RegBtn onClick={() => setNoticeOpen(true)} />}
            {!isViewer && boardTab === "휴가/외근" && <RegBtn onClick={() => setScheduleOpen(true)} />}
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
                    { label: "일정", align: "text-left", width: "160px" },
                    { label: "결재", width: "60px" },
                  ]}
                  rows={pagedSchedules.map((s, idx) => (
                    <tr key={s.id} onClick={() => setSelectedSchedule(s)} className="cursor-pointer hover:bg-blue-50/50 transition">
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{(schedulePage - 1) * SCHEDULE_PAGE_SIZE + idx + 1}</td>
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">
                        {s.createdAt?.toDate ? s.createdAt.toDate().toISOString().slice(0, 10).replaceAll("-", ".") : "-"}
                      </td>
                      <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{formatCreatedAtTime(s.createdAt)}</td>
                      <td className="px-3 py-2.5 text-center text-[13px] font-semibold text-gray-700">{s.name || "-"}</td>
                      <td className="px-3 py-2.5 text-center text-[12px]">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${s.type === "휴가" ? "bg-blue-100 text-blue-700" : s.type === "외근" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{s.type}</span>
                      </td>
                      <td className="px-3 py-2.5 text-[13px] font-medium text-gray-800">{s.start?.replaceAll("-", ".")}</td>
                      <td className="px-3 py-2.5 text-center"><ApprovalBadge status={s.approvalStatus} /></td>
                    </tr>
                  ))}
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
                <div className="flex items-center gap-3 mb-2 px-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-red-400"></div>
                    <span className="text-[11px] text-gray-500">미확인</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-emerald-400"></div>
                    <span className="text-[11px] text-gray-500">확인완료</span>
                  </div>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[44px]">No</th>
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[90px]">등록날짜</th>
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[70px]">등록시간</th>
                      <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap w-[70px]">작성자</th>
                      <th className="px-3 py-2.5 text-left text-[12px] font-semibold text-gray-500 w-[180px]">내용</th>
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
                          <td className="px-3 py-2.5 text-[13px] text-gray-800">
                            <span className="font-medium">인수인계</span>
                            {(isReceiver || isAuthor) && (
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold ${receiverRead ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                                {receiverRead ? "확인" : "미확인"}
                              </span>
                            )}
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
        <Modal title="공지사항 등록" onClose={() => setNoticeOpen(false)}>
          <div className="space-y-3">
            <input placeholder="제목" className={formInput} value={noticeForm.title} onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })} />
            <input placeholder="작성자" className={formInput} value={noticeForm.author} onChange={e => setNoticeForm({ ...noticeForm, author: e.target.value })} />
            <textarea placeholder="내용" rows={4} className={formInput} value={noticeForm.content} onChange={e => setNoticeForm({ ...noticeForm, content: e.target.value })} />
            <button onClick={async () => {
              if (selectedNotice?.id) {
                await updateDoc(doc(db, "notices", selectedNotice.id), { title: noticeForm.title, author: noticeForm.author, content: noticeForm.content });
              } else {
                await addDoc(collection(db, "notices"), { title: noticeForm.title, author: noticeForm.author, content: noticeForm.content, createdAt: serverTimestamp(), companyName: getViewCompany() });
              }
              setNoticeForm({ title: "", author: "", content: "" }); setNoticeOpen(false);
            }} className="w-full bg-[#1B2B4B] text-white py-2.5 rounded-lg font-semibold text-[14px] hover:bg-[#243a60] transition">저장</button>
          </div>
        </Modal>
      )}

      {selectedNotice && (
        <Modal title="공지사항 상세" onClose={() => setSelectedNotice(null)}>
          <div className="space-y-3 text-[14px]">
            <div><div className="text-[13px] text-gray-400 mb-0.5">제목</div><div className="font-semibold">{selectedNotice.title}</div></div>
            <div><div className="text-[13px] text-gray-400 mb-0.5">작성자</div><div>{selectedNotice.author}</div></div>
            <div><div className="text-[13px] text-gray-400 mb-0.5">작성일</div><div>{selectedNotice.date}</div></div>
            <div><div className="text-[13px] text-gray-400 mb-0.5">내용</div><div className="whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3">{selectedNotice.content}</div></div>
          </div>
          {!isViewer && (
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <button onClick={async () => { if (!window.confirm("삭제할까요?")) return; await deleteDoc(doc(db, "notices", selectedNotice.id)); setSelectedNotice(null); }} className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition">삭제</button>
            <button onClick={() => { setNoticeForm({ title: selectedNotice.title, author: selectedNotice.author, content: selectedNotice.content }); setNoticeOpen(true); }} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">수정</button>
          </div>
          )}
        </Modal>
      )}

      {scheduleOpen && (
        <Modal title="휴가 / 외근 일정 등록" onClose={() => setScheduleOpen(false)}>
          <div className="space-y-3">
            <select className={formInput} value={scheduleForm.type} onChange={e => setScheduleForm({ ...scheduleForm, type: e.target.value })}>
              <option>휴가</option><option>외근</option><option>반차</option><option>병가</option>
            </select>
            <div className="flex gap-2">
              <input type="date" className={formInput} value={scheduleForm.start} onChange={e => setScheduleForm({ ...scheduleForm, start: e.target.value })} />
              <input type="date" className={formInput} value={scheduleForm.end} onChange={e => setScheduleForm({ ...scheduleForm, end: e.target.value })} />
            </div>
            <textarea placeholder="메모 (선택)" rows={3} className={formInput} value={scheduleForm.memo} onChange={e => setScheduleForm({ ...scheduleForm, memo: e.target.value })} />
            <select className={formInput} value={scheduleForm.approverName} onChange={e => {
              const u = users.find(u => u.name === e.target.value);
              setScheduleForm({ ...scheduleForm, approverName: u?.name || "", approverUid: u?.uid || u?.id || "" });
            }}>
              <option value="">결재자 선택 (선택사항)</option>
              {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
            <button onClick={async () => {
              const me = users.find(u => u.id === user?.uid);
              const userName = me?.name || "사용자";
              if (selectedSchedule?.id) {
                await updateDoc(doc(db, "schedules", selectedSchedule.id), { type: scheduleForm.type, name: userName, start: scheduleForm.start, end: scheduleForm.end, memo: scheduleForm.memo });
              } else {
                await addDoc(collection(db, "schedules"), { type: scheduleForm.type, name: userName, start: scheduleForm.start, end: scheduleForm.end, memo: scheduleForm.memo, approverUid: scheduleForm.approverUid, approverName: scheduleForm.approverName, approvalStatus: "pending", createdAt: serverTimestamp(), companyName: getViewCompany() });
              }
              setScheduleForm({ type: "휴가", start: "", end: "", memo: "", approverUid: "", approverName: "" }); setScheduleOpen(false);
            }} className="w-full bg-[#1B2B4B] text-white py-2.5 rounded-lg font-semibold text-[14px] hover:bg-[#243a60] transition">저장</button>
          </div>
        </Modal>
      )}

      {selectedSchedule && (
        <Modal title="일정 상세" onClose={() => setSelectedSchedule(null)}>
          <div className="relative space-y-3 text-[14px]">
            <ApprovalStamp status={selectedSchedule?.approvalStatus} />
            <div><div className="text-[13px] text-gray-400 mb-0.5">구분</div><div className="font-semibold">{selectedSchedule.type}</div></div>
            <div><div className="text-[13px] text-gray-400 mb-0.5">작성자</div><div>{selectedSchedule.name}</div></div>
            <div><div className="text-[13px] text-gray-400 mb-0.5">기간</div><div>{selectedSchedule.start} ~ {selectedSchedule.end}</div></div>
            <div><div className="text-[13px] text-gray-400 mb-0.5">결재자</div><div>{selectedSchedule?.approverName || "미지정"}</div></div>
            {selectedSchedule.memo && <div><div className="text-[13px] text-gray-400 mb-0.5">메모</div><div className="whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{selectedSchedule.memo}</div></div>}
          </div>
          {auth.currentUser?.uid === selectedSchedule?.approverUid && (
            <div className="flex gap-2 mt-3">
              <button onClick={async () => { await updateDoc(doc(db, "schedules", selectedSchedule.id), { approvalStatus: "approved" }); setSelectedSchedule(null); }} className="flex-1 py-2 rounded-lg bg-[#EEF1F7] text-[#1B2B4B] text-[13px] font-semibold hover:bg-[#dce3ef] transition">승인</button>
              <button onClick={async () => { await updateDoc(doc(db, "schedules", selectedSchedule.id), { approvalStatus: "rejected" }); setSelectedSchedule(null); }} className="flex-1 py-2 rounded-lg bg-red-50 text-red-600 text-[13px] font-semibold hover:bg-red-100 transition">반려</button>
              <button onClick={async () => { await updateDoc(doc(db, "schedules", selectedSchedule.id), { approvalStatus: "hold" }); setSelectedSchedule(null); }} className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-500 text-[13px] font-semibold hover:bg-gray-200 transition">보류</button>
            </div>
          )}
          {!isViewer && (
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <button onClick={async () => { if (!window.confirm("삭제할까요?")) return; await deleteDoc(doc(db, "schedules", selectedSchedule.id)); setSelectedSchedule(null); }} className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition">삭제</button>
            <button onClick={() => { setScheduleForm({ type: selectedSchedule.type, start: selectedSchedule.start, end: selectedSchedule.end, memo: selectedSchedule.memo || "", approverUid: selectedSchedule.approverUid || "", approverName: selectedSchedule.approverName || "" }); setScheduleOpen(true); }} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">수정</button>
          </div>
          )}
        </Modal>
      )}

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
              {!isViewer && (
              <div className="flex gap-2 mt-4 pt-4 border-t">
                <button onClick={async () => { if (!window.confirm("삭제할까요?")) return; await deleteDoc(doc(db, "handovers", selectedHandover.id)); setSelectedHandover(null); setHandoverEditMode(false); }} className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition">삭제</button>
                <button onClick={() => { isEditingHandoverRef.current = true; setHandoverForm({ text: selectedHandover.text, author: selectedHandover.author, authorUid: selectedHandover.authorUid, receiver: selectedHandover.receiver, receiverUid: selectedHandover.receiverUid, date: selectedHandover.date }); setHandoverEditMode(true); }} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">수정</button>
              </div>
              )}
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
              if (toast.data?.id) { markToastSeen(k); _dismissedToasts.add(k); addPermDismissed(k); }
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
                  onClick={e => { e.stopPropagation(); const k = `${toast.type}_${toast.data?.id}`; if (toast.data?.id) { markToastSeen(k); _dismissedToasts.add(k); addPermDismissed(k); } setToast(null); }}
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
    </div>
  );
}