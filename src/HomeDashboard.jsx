import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceDot,
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
            <th key={i} className={`px-3 py-2.5 font-semibold text-gray-500 text-[12px] ${h.align || "text-center"}`}
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

/* ===== 등록 버튼 ===== */
const RegBtn = ({ onClick }) => (
  <button onClick={onClick} className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white text-[12px] font-semibold rounded-lg transition border border-white/30">
    + 등록
  </button>
);

/* ===================== HOME DASHBOARD ===================== */
export default function HomeDashboard({ role, user, pending, delayed, dispatchData = [] }) {
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
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeForm, setNoticeForm] = React.useState({ title: "", author: "", content: "" });
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleForm, setScheduleForm] = React.useState({ type: "휴가", name: "", start: "", end: "", memo: "" });
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

  React.useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    const q = query(collection(db, "schedules"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setSchedules(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (snap.docChanges().some(c => c.type === "added")) {
        const latest = snap.docChanges().find(c => c.type === "added")?.doc;
        if (!latest) return;
        const lastId = localStorage.getItem("last_schedule_id");
        if (latest.id !== lastId) {
          localStorage.setItem("last_schedule_id", latest.id);
          setToast({ type: "schedule", data: { id: latest.id, ...latest.data() } });
        }
      }
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    const q = query(collection(db, "notices"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => { const data = d.data(); const date = formatCreatedAt(data.createdAt); if (!date) return null; return { id: d.id, ...data, date }; }).filter(Boolean);
      setNotices(list);
      if (snap.docChanges().some(c => c.type === "added")) {
        const latest = snap.docChanges().find(c => c.type === "added")?.doc;
        if (!latest) return;
        const lastId = localStorage.getItem("last_notice_id");
        if (latest.id !== lastId) {
          localStorage.setItem("last_notice_id", latest.id);
          setToast({ type: "notice", data: { id: latest.id, ...latest.data(), date: formatCreatedAt(latest.data().createdAt) } });
        }
      }
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    const q = query(collection(db, "handovers"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setHandovers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      const added = snap.docChanges().find(c => c.type === "added" && !c.doc.metadata.hasPendingWrites && !isEditingHandoverRef.current);
      if (!added) return;
      const latest = added.doc;
      const lastId = localStorage.getItem("last_handover_id");
      if (latest.id !== lastId) {
        localStorage.setItem("last_handover_id", latest.id);
        setToast({ type: "handover", data: { id: latest.id, ...latest.data() } });
      }
    });
    return () => unsub();
  }, []);

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
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
  }, [dispatchData]);

  const top10Summary = useMemo(() => {
    if (!topClients.length) return { total: 0, avg: 0, topName: "-" };
    const total = topClients.reduce((a, c) => a + c.value, 0);
    return { total, avg: Math.round(total / topClients.length), topName: topClients[0].name };
  }, [topClients]);

  const todayPendingOrders = useMemo(() => {
    return dispatchData.filter(d => {
      const ld = d?.상차일자 || d?.상차일 || d?.상차;
      return ld && String(ld).slice(0, 10) === todayStr && d?.배차상태 !== "배차완료";
    }).sort((a, b) => new Date(a?.상차일자 || 0) - new Date(b?.상차일자 || 0)).slice(0, 7);
  }, [dispatchData]);

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
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <SectionCard title="Sales Performance" action={
            <button onClick={() => setPeriod(p => p === "7d" ? "none" : "7d")}
              className="text-[12px] px-2.5 py-1 rounded-lg bg-white/20 text-white border border-white/30 hover:bg-white/30 transition">
              최근 7일
            </button>
          }>
            <ResponsiveContainer width="100%" height={220}>
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
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-end justify-between">
              <div>
                <div className="text-[11px] text-gray-400 font-medium">Total Revenue</div>
                <div className="text-[18px] font-bold text-gray-900">{yearRevenue.toLocaleString()}원</div>
              </div>
              <div className={`text-[13px] font-semibold ${delta >= 0 ? "text-blue-600" : "text-red-500"}`}>
                {delta >= 0 ? "▲" : "▼"} 최근 7일 {Math.abs(delta).toLocaleString()}원
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Sales Score">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "년 매출", value: yearRevenue, unit: "원" },
              { label: "당월 매출", value: monthRevenue, unit: "원" },
              { label: "2026년 누적 오더", value: orderCountFrom2026, unit: "건" },
              { label: "총 누적 오더", value: dispatchData.length, unit: "건" },
              { label: "등록 거래처 수", value: new Set(dispatchData.map(d => d?.거래처명).filter(Boolean)).size, unit: "곳" },
            ].map((item, i) => (
              <div key={i} className={i === 4 ? "col-span-2" : ""}>
                <div className="text-[24px] font-extrabold text-[#1B2B4B] leading-tight">
                  <CountUp value={item.value} />
                  <span className="text-[14px] font-semibold text-gray-400 ml-1">{item.unit}</span>
                </div>
                <div className="text-[12px] font-medium text-gray-500 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ===== 게시판 3개 ===== */}
      <div className="grid grid-cols-3 gap-4">

        {/* 공지사항 */}
        <SectionCard title="공지사항" action={<RegBtn onClick={() => setNoticeOpen(true)} />}>
          {notices.length === 0 ? (
            <div className="text-[13px] text-gray-400 py-4 text-center">등록된 공지가 없습니다</div>
          ) : (
            <>
              <BoardTable
                headers={[
                  { label: "No", width: "50px" },
                  { label: "날짜", width: "100px" },
                  { label: "작성자", width: "80px" },
                  { label: "제목", align: "text-left" },
                ]}
                rows={pagedNotices.map((n, idx) => (
                  <tr key={n.id} onClick={() => setSelectedNotice(n)} className="cursor-pointer hover:bg-blue-50/50 transition">
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{(noticePage - 1) * NOTICE_PAGE_SIZE + idx + 1}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{n.date?.replaceAll("-", ".")}</td>
                    <td className="px-3 py-2.5 text-center text-[13px] font-semibold text-gray-700">{n.author}</td>
                    <td className="px-3 py-2.5 text-[13px] font-semibold text-gray-800">공지사항</td>
                  </tr>
                ))}
              />
              <Pagination page={noticePage} total={noticeTotalPages} onChange={setNoticePage} />
            </>
          )}
        </SectionCard>

        {/* 휴가/외근 */}
        <SectionCard title="휴가 / 외근 일정" action={<RegBtn onClick={() => setScheduleOpen(true)} />}>
          {schedules.length === 0 ? (
            <div className="text-[13px] text-gray-400 py-4 text-center">등록된 일정이 없습니다</div>
          ) : (
            <>
              <BoardTable
                headers={[
                  { label: "No", width: "44px" },
                  { label: "날짜", width: "90px" },
                  { label: "작성자", width: "70px" },
                  { label: "구분", width: "60px" },
                  { label: "일정", align: "text-left" },
                ]}
                rows={pagedSchedules.map((s, idx) => (
                  <tr key={s.id} onClick={() => setSelectedSchedule(s)} className="cursor-pointer hover:bg-blue-50/50 transition">
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{(schedulePage - 1) * SCHEDULE_PAGE_SIZE + idx + 1}</td>
                    <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">
                      {s.createdAt?.toDate ? s.createdAt.toDate().toISOString().slice(0, 10).replaceAll("-", ".") : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-center text-[13px] font-semibold text-gray-700">{s.name || "-"}</td>
                    <td className="px-3 py-2.5 text-center text-[12px]">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${s.type === "휴가" ? "bg-blue-100 text-blue-700" : s.type === "외근" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{s.type}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] font-medium text-gray-800">{s.start?.replaceAll("-", ".")}</td>
                  </tr>
                ))}
              />
              <Pagination page={schedulePage} total={scheduleTotalPages} onChange={setSchedulePage} />
            </>
          )}
        </SectionCard>

        {/* 인수인계 — 읽음/안읽음은 행 왼쪽 테두리 색상으로 표시 */}
        <SectionCard title="인수인계 게시판" action={
          <RegBtn onClick={() => {
            const me = users.find(u => u.id === user?.uid);
            setSelectedHandover(null);
            setHandoverForm({ text: "", author: me?.name || "", authorUid: user?.uid || "", receiver: "", receiverUid: "", date: todayStr });
            setHandoverOpen(true);
          }} />
        }>
          {handovers.length === 0 ? (
            <div className="text-[13px] text-gray-400 py-4 text-center">등록된 인수인계가 없습니다</div>
          ) : (
            <>
              {/* 범례 */}
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
                    <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 w-[44px]">No</th>
                    <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 w-[90px]">날짜</th>
                    <th className="px-3 py-2.5 text-center text-[12px] font-semibold text-gray-500 w-[70px]">작성자</th>
                    <th className="px-3 py-2.5 text-left text-[12px] font-semibold text-gray-500">내용</th>
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
                        {/* 왼쪽 컬러 바 (읽음 표시) */}
                        <td className="w-[44px] text-center py-2.5 pl-3 pr-2 relative">
                          {(isReceiver || isAuthor) && (
                            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r ${receiverRead ? "bg-emerald-400" : "bg-red-400"}`} />
                          )}
                          <span className="text-[12px] text-gray-400">{(handoverPage - 1) * HANDOVER_PAGE_SIZE + idx + 1}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{dateStr}</td>
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
          )}
        </SectionCard>
      </div>

      {/* ===== 하단: 당일 미배차 + Top10 ===== */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <SectionCard title="당일 미배차 현황">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {["상차일","상차시간","하차일","하차시간","상차지","하차지","화물","차량","톤수","메모","상태"].map(h => (
                      <th key={h} className="px-2.5 py-2.5 text-center text-[12px] font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {todayPendingOrders.length === 0 ? (
                    <tr><td colSpan={11} className="py-10 text-center text-[13px] text-gray-400">당일 미배차 오더가 없습니다</td></tr>
                  ) : todayPendingOrders.map((d, i) => (
                    <tr key={i} className="hover:bg-red-50/40 transition">
                      <td className="px-2.5 py-2.5 text-center text-[13px] text-gray-700">{d?.상차일?.slice(5) || "-"}</td>
                      <td className="px-2.5 py-2.5 text-center text-[13px] text-gray-600">{d?.상차시간 || "-"}</td>
                      <td className="px-2.5 py-2.5 text-center text-[13px] text-gray-700">{d?.하차일?.slice(5) || "-"}</td>
                      <td className="px-2.5 py-2.5 text-center text-[13px] text-gray-600">{d?.하차시간 || "-"}</td>
                      <td className="px-2.5 py-2.5 text-[13px] font-semibold text-gray-800 max-w-[120px] truncate">{d?.상차지명 || "-"}</td>
                      <td className="px-2.5 py-2.5 text-[13px] text-gray-600 max-w-[120px] truncate">{d?.하차지명 || "-"}</td>
                      <td className="px-2.5 py-2.5 text-center text-[13px] text-gray-700">{d?.화물내용 || "-"}</td>
                      <td className="px-2.5 py-2.5 text-center text-[13px] text-gray-700">{d?.차량종류 || "-"}</td>
                      <td className="px-2.5 py-2.5 text-center text-[13px] text-gray-700">{d?.차량톤수 || "-"}</td>
                      <td className="px-2.5 py-2.5 text-[13px] text-gray-500 max-w-[100px] truncate">{d?.메모 || "-"}</td>
                      <td className="px-2.5 py-2.5 text-center">
                        <span className="px-2 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-600">미배차</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Top10 거래처 */}
        <SectionCard title="Top 10 거래처">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-[#1B2B4B]/5 rounded-lg px-3 py-2.5">
              <div className="text-[11px] text-gray-500 font-medium">총 매출</div>
              <div className="text-[13px] font-bold text-[#1B2B4B] mt-0.5">{(top10Summary.total / 1000000).toFixed(1)}M</div>
            </div>
            <div className="bg-[#1B2B4B]/5 rounded-lg px-3 py-2.5">
              <div className="text-[11px] text-gray-500 font-medium">평균</div>
              <div className="text-[13px] font-bold text-[#1B2B4B] mt-0.5">{(top10Summary.avg / 1000000).toFixed(1)}M</div>
            </div>
            <div className="bg-[#1B2B4B]/5 rounded-lg px-3 py-2.5">
              <div className="text-[11px] text-gray-500 font-medium">1위</div>
              <div className="text-[12px] font-bold text-[#1B2B4B] mt-0.5 truncate">{top10Summary.topName}</div>
            </div>
          </div>
          <div className="space-y-2">
            {topClients.map((c, i) => {
              const max = topClients[0]?.value || 1;
              const pct = Math.round((c.value / max) * 100);
              const opacity = 1 - i * 0.07;
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${i < 3 ? "bg-[#1B2B4B]" : "bg-gray-400"}`}>{i + 1}</div>
                  <div className="w-[68px] text-[12px] font-semibold text-gray-700 truncate flex-shrink-0" title={c.name}>{c.name}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
                    <div className="h-full rounded-full bg-[#1B2B4B] transition-all duration-700" style={{ width: `${pct}%`, opacity }} />
                  </div>
                  <div className="w-[60px] text-right text-[11px] font-bold text-gray-600 flex-shrink-0">
                    {c.value >= 1000000 ? `${(c.value / 1000000).toFixed(1)}M` : c.value.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
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
                await addDoc(collection(db, "notices"), { title: noticeForm.title, author: noticeForm.author, content: noticeForm.content, createdAt: serverTimestamp() });
              }
              setNoticeForm({ title: "", author: "", content: "" }); setNoticeOpen(false);
            }} className="w-full bg-[#1B2B4B] text-white py-2.5 rounded-lg font-semibold text-[14px] hover:bg-[#243a60] transition">저장</button>
          </div>
        </Modal>
      )}

      {selectedNotice && (
        <Modal title="공지사항 상세" onClose={() => setSelectedNotice(null)}>
          <div className="space-y-3 text-[14px]">
            <div><div className="text-[11px] text-gray-400 mb-0.5">제목</div><div className="font-semibold">{selectedNotice.title}</div></div>
            <div><div className="text-[11px] text-gray-400 mb-0.5">작성자</div><div>{selectedNotice.author}</div></div>
            <div><div className="text-[11px] text-gray-400 mb-0.5">작성일</div><div>{selectedNotice.date}</div></div>
            <div><div className="text-[11px] text-gray-400 mb-0.5">내용</div><div className="whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-lg p-3">{selectedNotice.content}</div></div>
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <button onClick={async () => { if (!window.confirm("삭제할까요?")) return; await deleteDoc(doc(db, "notices", selectedNotice.id)); setSelectedNotice(null); }} className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition">삭제</button>
            <button onClick={() => { setNoticeForm({ title: selectedNotice.title, author: selectedNotice.author, content: selectedNotice.content }); setNoticeOpen(true); }} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">수정</button>
          </div>
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
            <button onClick={async () => {
              const me = users.find(u => u.id === user?.uid);
              const userName = me?.name || "사용자";
              if (selectedSchedule?.id) {
                await updateDoc(doc(db, "schedules", selectedSchedule.id), { type: scheduleForm.type, name: userName, start: scheduleForm.start, end: scheduleForm.end, memo: scheduleForm.memo });
              } else {
                await addDoc(collection(db, "schedules"), { type: scheduleForm.type, name: userName, start: scheduleForm.start, end: scheduleForm.end, memo: scheduleForm.memo, createdAt: serverTimestamp() });
              }
              setScheduleForm({ type: "휴가", start: "", end: "", memo: "" }); setScheduleOpen(false);
            }} className="w-full bg-[#1B2B4B] text-white py-2.5 rounded-lg font-semibold text-[14px] hover:bg-[#243a60] transition">저장</button>
          </div>
        </Modal>
      )}

      {selectedSchedule && (
        <Modal title="일정 상세" onClose={() => setSelectedSchedule(null)}>
          <div className="space-y-3 text-[14px]">
            <div><div className="text-[11px] text-gray-400 mb-0.5">구분</div><div className="font-semibold">{selectedSchedule.type}</div></div>
            <div><div className="text-[11px] text-gray-400 mb-0.5">작성자</div><div>{selectedSchedule.name}</div></div>
            <div><div className="text-[11px] text-gray-400 mb-0.5">기간</div><div>{selectedSchedule.start} ~ {selectedSchedule.end}</div></div>
            {selectedSchedule.memo && <div><div className="text-[11px] text-gray-400 mb-0.5">메모</div><div className="whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{selectedSchedule.memo}</div></div>}
          </div>
          <div className="flex gap-2 mt-4 pt-4 border-t">
            <button onClick={async () => { if (!window.confirm("삭제할까요?")) return; await deleteDoc(doc(db, "schedules", selectedSchedule.id)); setSelectedSchedule(null); }} className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition">삭제</button>
            <button onClick={() => { setScheduleForm({ type: selectedSchedule.type, start: selectedSchedule.start, end: selectedSchedule.end, memo: selectedSchedule.memo || "" }); setScheduleOpen(true); }} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">수정</button>
          </div>
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
                await addDoc(collection(db, "handovers"), { ...handoverForm, author: me?.name || "사용자", authorUid: user?.uid, createdAt: serverTimestamp(), readBy: [] });
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
                <div><div className="text-[11px] text-gray-400 mb-0.5">작성자</div><div className="font-semibold">{selectedHandover.author}</div></div>
                <div><div className="text-[11px] text-gray-400 mb-0.5">받는 사람</div><div>{selectedHandover.receiver}</div></div>
                <div><div className="text-[11px] text-gray-400 mb-0.5">기준 날짜</div><div>{selectedHandover.date}</div></div>
                <div><div className="text-[11px] text-gray-400 mb-0.5">내용</div><div className="whitespace-pre-wrap bg-gray-50 rounded-lg p-3 leading-relaxed">{selectedHandover.text}</div></div>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t">
                <button onClick={async () => { if (!window.confirm("삭제할까요?")) return; await deleteDoc(doc(db, "handovers", selectedHandover.id)); setSelectedHandover(null); setHandoverEditMode(false); }} className="flex-1 py-2 rounded-lg border border-red-200 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition">삭제</button>
                <button onClick={() => { isEditingHandoverRef.current = true; setHandoverForm({ text: selectedHandover.text, author: selectedHandover.author, authorUid: selectedHandover.authorUid, receiver: selectedHandover.receiver, receiverUid: selectedHandover.receiverUid, date: selectedHandover.date }); setHandoverEditMode(true); }} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-semibold hover:bg-[#243a60] transition">수정</button>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ===== 토스트 ===== */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-white border border-gray-200 shadow-xl rounded-xl px-4 py-3 cursor-pointer w-[260px]" onClick={() => { if (toast.type === "notice") setSelectedNotice(toast.data); else if (toast.type === "schedule") setSelectedSchedule(toast.data); else if (toast.type === "handover") setSelectedHandover(toast.data); setToast(null); }}>
          <button onClick={e => { e.stopPropagation(); setToast(null); }} className="absolute top-2.5 right-3 text-gray-400 hover:text-gray-700 text-sm">✕</button>
          <div className="flex items-center gap-2 mb-1">
            <span>{toast.type === "notice" ? "📢" : toast.type === "schedule" ? "📅" : "📝"}</span>
            <span className="text-[13px] font-bold text-gray-800">{toast.type === "notice" ? "공지사항 등록" : toast.type === "schedule" ? "일정 등록" : "인수인계 등록"}</span>
          </div>
          <div className="text-[12px] text-gray-500 truncate">{toast.type === "notice" ? toast.data.title : toast.type === "schedule" ? `[${toast.data.type}] ${toast.data.name}` : toast.data.text}</div>
        </div>
      )}
    </div>
  );
}