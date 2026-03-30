import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceDot,
  BarChart,   // ✅ 추가
  Bar,        // ✅ 추가
} from "recharts";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
 deleteDoc,
 updateDoc,
} from "firebase/firestore";
import { db, auth } from "./firebase";
/* ===================== 공통 Modal ===================== */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-[420px] shadow-lg">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <h3 className="font-bold">{title}</h3>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/* ===================== 카드 공통 ===================== */
function Card({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm">
      {title && (
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h3 className="text-sm font-bold">{title}</h3>

          {/* 👇 오른쪽 끝 버튼 영역 */}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
/* ===================== 숫자 카운트업 ===================== */
function CountUp({ value, duration = 900 }) {
  const [display, setDisplay] = React.useState(0);

  React.useEffect(() => {
    let start = 0;
    const end = Number(value) || 0;
    if (end === 0) {
      setDisplay(0);
      return;
    }

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

  // Firestore Timestamp
  if (createdAt.seconds) {
    return new Date(createdAt.seconds * 1000)
      .toISOString()
      .slice(0, 10);
  }

  // JS Date
  if (createdAt instanceof Date) {
    return createdAt.toISOString().slice(0, 10);
  }

  // 문자열
  const d = new Date(createdAt);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return null;
}
/* ===================== HOME DASHBOARD ===================== */
export default function HomeDashboard({
  role,
  user,
  pending,
  delayed,
  dispatchData = [],
}) {
  const isEditingHandoverRef = useRef(false);
  // 🔔 우측 하단 토스트
const [toast, setToast] = useState(null);

// ⏱ 토스트 5초 후 자동 닫힘
React.useEffect(() => {
  if (!toast) return;

  const timer = setTimeout(() => {
    setToast(null);
  }, 5000);

  return () => clearTimeout(timer);
}, [toast]);

// { type: "notice" | "schedule", data }
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
    // ===================== 공지 팝업 =====================
const [noticeOpen, setNoticeOpen] = useState(false);
const [noticeForm, setNoticeForm] = React.useState({
  title: "",
  author: "",
  content: "",
});

// ===================== 일정 팝업 =====================
const [scheduleOpen, setScheduleOpen] = React.useState(false);
const [scheduleForm, setScheduleForm] = React.useState({
  type: "휴가",
  name: "",
  start: "",
  end: "",
  memo: "",
});

      /* ===================== 게시판 상태 ===================== */
  const [notices, setNotices] = React.useState([]);
  const [schedules, setSchedules] = React.useState([]);
  const [handovers, setHandovers] = React.useState([]);
  // 🔹 공지사항 페이지네이션
const NOTICE_PAGE_SIZE = 5;
const [noticePage, setNoticePage] = useState(1);
// 🔹 휴가 / 외근 일정 페이지네이션
const SCHEDULE_PAGE_SIZE = 5;
const [schedulePage, setSchedulePage] = useState(1);

  // ===================== 인수인계 팝업 =====================
const [handoverOpen, setHandoverOpen] = useState(false);
const [handoverForm, setHandoverForm] = useState({
  text: "",
  author: "",
  authorUid: user?.uid || "",
  receiver: "",
  receiverUid: "",
  date: todayStr,
});
const [selectedHandover, setSelectedHandover] = useState(null);

const [selectedNotice, setSelectedNotice] = useState(null);
const [selectedSchedule, setSelectedSchedule] = useState(null);
const [users, setUsers] = useState([]);

useEffect(() => {
  const unsub = onSnapshot(collection(db, "users"), (snap) => {
    const list = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));
    setUsers(list);
  });

  return () => unsub();
}, []);
React.useEffect(() => {
  const q = query(
    collection(db, "schedules"),
    
    orderBy("createdAt", "desc")
  );

  const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs
      .map(d => {
        const data = d.data();
        return { id: d.id, ...data };
      });

    setSchedules(list);

    // 🔔 신규 일정 토스트
    if (snap.docChanges().some(c => c.type === "added")) {
      const latest = snap.docChanges().find(c => c.type === "added")?.doc;
      if (!latest) return;

      const lastId = localStorage.getItem("last_schedule_id");
      if (latest.id !== lastId) {
        localStorage.setItem("last_schedule_id", latest.id);

        setToast({
          type: "schedule",
          data: { id: latest.id, ...latest.data() },
        });
      }
    }
  });

  return () => unsub();
}, []);

React.useEffect(() => {
  const q = query(
    collection(db, "notices"),
    orderBy("createdAt", "desc")
  );
    const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs
      .map(d => {
        const data = d.data();
        const date = formatCreatedAt(data.createdAt);
        if (!date) return null;
        return { id: d.id, ...data, date };
      })
      .filter(Boolean);

    setNotices(list);

    // 🔔 신규 공지 토스트
    if (snap.docChanges().some(c => c.type === "added")) {
      const latest = snap.docChanges().find(c => c.type === "added")?.doc;
      if (!latest) return;

      const lastId = localStorage.getItem("last_notice_id");
      if (latest.id !== lastId) {
        localStorage.setItem("last_notice_id", latest.id);

        setToast({
          type: "notice",
          data: {
            id: latest.id,
            ...latest.data(),
            date: formatCreatedAt(latest.data().createdAt),
          },
        });
      }
    }
  });

  return () => unsub();
}, []); // ✅ 이 줄 반드시 있어야 함
// 🔹 공지사항 페이지 계산
const noticeTotalPages = Math.ceil(
  notices.length / NOTICE_PAGE_SIZE
);

const pagedNotices = useMemo(() => {
  const start = (noticePage - 1) * NOTICE_PAGE_SIZE;
  return notices.slice(start, start + NOTICE_PAGE_SIZE);
}, [notices, noticePage]);
// 🔹 휴가 / 외근 일정 페이지 계산
const scheduleTotalPages = Math.ceil(
  schedules.length / SCHEDULE_PAGE_SIZE
);

const pagedSchedules = useMemo(() => {
  const start = (schedulePage - 1) * SCHEDULE_PAGE_SIZE;
  return schedules.slice(start, start + SCHEDULE_PAGE_SIZE);
}, [schedules, schedulePage]);
// 🔹 인수인계 페이지네이션
const HANDOVER_PAGE_SIZE = 5;
const [handoverPage, setHandoverPage] = useState(1);

const handoverTotalPages = Math.ceil(
  handovers.length / HANDOVER_PAGE_SIZE
);

const pagedHandovers = useMemo(() => {
  const start = (handoverPage - 1) * HANDOVER_PAGE_SIZE;
  return handovers.slice(start, start + HANDOVER_PAGE_SIZE);
}, [handovers, handoverPage]);

// ===================== 인수인계 실시간 구독 + 토스트 =====================
React.useEffect(() => {
  const q = query(
    collection(db, "handovers"),
    orderBy("createdAt", "desc")
  );

  const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));
    setHandovers(list);

    // 🔔 신규 인수인계 토스트 (added만)
    const added = snap.docChanges().find(
  c =>
    c.type === "added" &&
    !c.doc.metadata.hasPendingWrites &&
    !isEditingHandoverRef.current
);
if (!added) return;

    const latest = added.doc;
    const lastId = localStorage.getItem("last_handover_id");

    if (latest.id !== lastId) {
      localStorage.setItem("last_handover_id", latest.id);

      setToast({
        type: "handover",
        data: {
          id: latest.id,
          ...latest.data(),
        },
      });
    }
  });

  return () => unsub();
}, []);


const todayStatsFixed = useMemo(() => {
  let count = 0;
  let revenue = 0;
  let profit = 0;

  dispatchData.forEach(row => {
    const d = getLoadDate(row);
    if (!d) return;

    if (d.toISOString().slice(0, 10) === todayStr) {
      count += 1;
      revenue += Number(row?.청구운임 || 0);
      profit += Number(row?.수익 || 0);
    }
  });

  return { count, revenue, profit };
}, [dispatchData]);
const yearRevenue = useMemo(() => {
  return dispatchData.reduce((sum, row) => {
    const d = getLoadDate(row);
    if (!d) return sum;
    return d.getFullYear() === currentYear
      ? sum + Number(row?.청구운임 || 0)
      : sum;
  }, 0);
}, [dispatchData]);

const monthRevenue = useMemo(() => {
  
  return dispatchData.reduce((sum, row) => {
    const d = getLoadDate(row);
    if (!d) return sum;
    return d.getFullYear() === currentYear &&
      d.getMonth() === currentMonth
      ? sum + Number(row?.청구운임 || 0)
      : sum;
  }, 0);
}, [dispatchData]);
const orderCountFrom2026 = useMemo(() => {
  return dispatchData.filter(row => {
    const d = getLoadDate(row);
    if (!d) return false;
    return d >= new Date("2026-01-01");
  }).length;
}, [dispatchData]);
  /* ===================== KPI ===================== */
 const kpis = [
  { title: "오늘 접수", value: todayStatsFixed.count },
  { title: "미배차", value: pending },
  { title: "오늘 매출", value: todayStatsFixed.revenue },
  { title: "오늘 수익", value: todayStatsFixed.profit },
];


  /* ===================== 매출 트렌드 ===================== */
  /* ===================== 최근 7일 매출 추이 ===================== */
const salesTrend = useMemo(() => {
  const today = new Date();
  const days = [];

  // ✅ 최근 7일 날짜 생성 (오늘 포함)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);

    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const label = `${d.getMonth() + 1}/${d.getDate()}`; // M/D

    days.push({
      key,
      date: label,
      value: 0,
    });
  }

  // ✅ 날짜 → 객체 매핑
  const map = {};
  days.forEach((d) => {
    map[d.key] = d;
  });

  // ✅ dispatchData 매출 누적
  dispatchData.forEach((row) => {
    const loadDate =
      row?.상차일자 ||
      row?.상차일 ||
      row?.상차 ||
      "";

    if (!loadDate) return;

    const dateKey = String(loadDate).slice(0, 10);
    if (!map[dateKey]) return;

    map[dateKey].value += Number(row?.청구운임 || 0);
  });

  return days;
}, [dispatchData]);

const delta =
  salesTrend.length === 7
    ? salesTrend[6].value - salesTrend[0].value
    : 0;


  /* ===================== TOP 10 거래처 ===================== */
  const topClients = useMemo(() => {
  const map = {};

  dispatchData.forEach((d) => {
    const dDate = getLoadDate(d);
if (!dDate) return;

// 2026년 1월만
if (dDate.getFullYear() !== 2026) return;
if (dDate.getMonth() !== 0) return;

    const name = d?.거래처명;

    if (!name) return;

    // ❌ 날짜/월 문자열 제거
    if (/\d{2}년\d{1,2}월/.test(name)) return;

    // ❌ 후레쉬물류 제외
    if (name.includes("후레쉬물류")) return;

    map[name] = (map[name] || 0) + Number(d?.청구운임 || 0);
  });

  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({
      name,
      value,
    }));
}, [dispatchData]);
// ===================== Top 10 요약 KPI =====================
const top10Summary = useMemo(() => {
  if (topClients.length === 0) {
    return {
      total: 0,
      avg: 0,
      topName: "-",
    };
  }

  const total = topClients.reduce((a, c) => a + c.value, 0);
  const avg = Math.round(total / topClients.length);
  const topName = topClients[0].name;

  return { total, avg, topName };
}, [topClients]);

/* ===================== 🚨 당일 미배차 ===================== */
const todayPendingOrders = useMemo(() => {
  const today = new Date().toISOString().slice(0, 10);

  return dispatchData
    .filter((d) => {
      const loadDate =
        d?.상차일자 ||
        d?.상차일 ||
        d?.상차;

      if (!loadDate) return false;

      const dateStr = String(loadDate).slice(0, 10);

      return (
        dateStr === today &&
        d?.배차상태 !== "배차완료"
      );
    })
    .sort((a, b) => {
      const ta = new Date(a?.상차일자 || 0).getTime();
      const tb = new Date(b?.상차일자 || 0).getTime();
      return ta - tb;
    })
    .slice(0, 7);
}, [dispatchData]);

/* ===================== 기존 코드 유지 ===================== */
const recentOrders = useMemo(() => {
  /* ===================== 🚨 당일 미배차 ===================== */

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return dispatchData
    .filter((d) => {
      // 거래처명
      const name =
        d?.거래처명 ||
        d?.거래처 ||
        d?.상호 ||
        d?.회사명 ||
        d?.화주명;

      if (!name) return false;

      // ❌ 월 문자열 제거 (25년9월 등)
      if (/\d{2}년\s?\d{1,2}월/.test(name)) return false;

      // ❌ 후레쉬물류 제거
      if (name.includes("후레쉬물류")) return false;

      // ✅ 오늘 상차만
      const loadDate =
        d?.상차일자 ||
        d?.상차일 ||
        d?.상차;

      if (!loadDate) return false;

      const dateStr = String(loadDate).slice(0, 10);
      return dateStr === today;
    })
    .sort(
      (a, b) =>
        Number(b?.청구운임 || 0) - Number(a?.청구운임 || 0)
    )
    .slice(0, 5);
}, [dispatchData]);


  return (
    <div className="bg-slate-100 min-h-screen p-6 space-y-6">

      {/* ================= KPI ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.title}>
            <p className="text-xs text-gray-500 font-semibold">{k.title}</p>
            <p className="mt-2 text-3xl font-extrabold">
              {typeof k.value === "number"
                ? k.value.toLocaleString()
                : k.value}
            </p>
          </Card>
        ))}
      </div>

      
      {/* ================= CHART + SCORE ================= */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

  {/* 🔹 매출 라인차트 */}
  <div className="lg:col-span-2">
    <Card
  title="Sales Performance"
  action={
    <button
  onClick={() => setPeriod(p => (p === "7d" ? "none" : "7d"))}
  className={`text-xs px-2 py-0.5 rounded transition
    ${
      period === "7d"
        ? "bg-indigo-100 text-indigo-600 font-semibold"
        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
    }`}
>
  최근 7일
</button>

  }
>


      <ResponsiveContainer width="100%" height={260}>
  <AreaChart
    data={salesTrend}
    margin={{ top: 20, right: 20, left: 0, bottom: 10 }}
  >
    {/* 🔹 그라데이션 */}
    <defs>
      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
      </linearGradient>
    </defs>

    {/* ❌ Grid 제거 */}

    {/* X축: 얇고 깔끔 */}
    <XAxis
      dataKey="date"
      axisLine={false}
      tickLine={false}
      tick={{ fontSize: 11, fill: "#94a3b8" }}
      dy={6}
    />

    {/* ❌ Y축 완전 제거 */}
    <YAxis hide />

    <Tooltip
      formatter={(v) => `${Number(v).toLocaleString()}원`}
      labelStyle={{ fontSize: 12 }}
      contentStyle={{
        borderRadius: 8,
        border: "none",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      }}
    />

    {/* 🔹 메인 Area */}
    <Area
      type="natural"
      dataKey="value"
      stroke="#6366f1"
      strokeWidth={2.5}
      fill="url(#colorRevenue)"
      dot={false}
      activeDot={{ r: 6 }}
      isAnimationActive
      animationDuration={1200}
    />

    {/* 🔴 오늘 포인트 */}
    {salesTrend.length === 7 && (
      <ReferenceDot
        x={salesTrend[6].date}
        y={salesTrend[6].value}
        r={6}
        fill="#6366f1"
        stroke="#fff"
        strokeWidth={2}
      />
    )}
  </AreaChart>
</ResponsiveContainer>

      {/* 🔹 KPI 하단 */}
      <div className="mt-4 text-sm text-gray-500">
        Total Revenue
        <span className="block text-xl font-extrabold text-black">
  ₩{yearRevenue.toLocaleString()}
</span>

        {/* 최근 7일 증감 */}
        <div
          className={`mt-1 font-semibold ${
            delta >= 0 ? "text-blue-600" : "text-red-500"
          }`}
        >
          {delta >= 0 ? "▲" : "▼"} 최근 7일 ₩
          {Math.abs(delta).toLocaleString()}
        </div>
      </div>
    </Card>
  </div>

 <Card title="Sales Score">
  <div className="grid grid-cols-2 gap-y-8 gap-x-6">

    {/* 년 매출 */}
    <div>
      <div className="text-[34px] font-extrabold text-blue-600 leading-none">
        <CountUp value={yearRevenue} />
        <span className="text-lg font-bold ml-1">원</span>
      </div>
      <div className="mt-2 text-base font-medium text-black">
        년 매출
      </div>
    </div>

    {/* 당월 매출 */}
    <div>
      <div className="text-[34px] font-extrabold text-blue-600 leading-none">
        <CountUp value={monthRevenue} />
        <span className="text-lg font-bold ml-1">원</span>
      </div>
      <div className="mt-2 text-base font-medium text-black">
        당월 매출
      </div>
    </div>

    {/* 등록 오더 수 */}
    {/* 2026년 1월부터 누적 오더 수 */}
<div>
  <div className="text-[34px] font-extrabold text-blue-600 leading-none">
    <CountUp value={orderCountFrom2026} />
    <span className="text-lg font-bold ml-1">건</span>
  </div>
  <div className="mt-2 text-base font-medium text-black">
    2026년 누적 오더 수
  </div>
</div>

    <div>
      <div className="text-[34px] font-extrabold text-blue-600 leading-none">
        <CountUp value={dispatchData.length} />
        
        <span className="text-lg font-bold ml-1">건</span>
      </div>
      <div className="mt-2 text-base font-medium text-black">
        총 누적 등록 오더 수
      </div>
    </div>

    {/* 등록 거래처 수 */}
    <div>
      <div className="text-[34px] font-extrabold text-blue-600 leading-none">
        <CountUp
          value={
            new Set(
              dispatchData
                .map(d => d?.거래처명)
                .filter(Boolean)
            ).size
          }
        />
        <span className="text-lg font-bold ml-1">곳</span>
      </div>
      <div className="mt-2 text-base font-medium text-black">
        등록 거래처 수
      </div>
    </div>

  </div>
</Card>



</div>


      {/* ================= 게시판 영역 ================= */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

  {/* ================= 공지사항 ================= */}
  <Card
  title="공지사항"
  action={
    <button
      onClick={() => setNoticeOpen(true)}
      className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
    >
      등록
    </button>
  }
>
  {/* ================= 공지사항 리스트 ================= */}
{notices.length === 0 ? (
  <div className="text-sm text-gray-400">등록된 공지가 없습니다</div>
) : (
  <>
    {/* 🔹 헤더 */}
    <div className="border-b flex px-3 py-3 bg-slate-100 text-sm font-semibold text-gray-700 text-center">
      <div className="w-[70px]">순번</div>
      <div className="w-[140px]">작성날짜</div>
      <div className="w-[140px]">작성자</div>
      <div className="flex-1">제목</div>
    </div>

    {/* 🔹 리스트 */}
    <div className="divide-y text-sm">
      {pagedNotices.map((n, idx) => {
        return (
          <div
            key={n.id}
            onClick={() => setSelectedNotice(n)}
            className="flex items-center px-3 py-3 cursor-pointer transition text-base hover:bg-slate-50"
          >
            {/* 순번 */}
            <div className="w-[70px] text-gray-400 text-center font-medium">
              {(noticePage - 1) * NOTICE_PAGE_SIZE + idx + 1}
            </div>

            {/* 날짜 */}
            <div className="w-[140px] text-gray-700 text-center font-medium">
              {n.date?.replaceAll("-", ".")}
            </div>

            {/* 작성자 */}
            <div className="w-[140px] text-gray-800 text-center font-semibold">
              {n.author}
            </div>

            {/* 제목 (🔥 고정) */}
            <div className="flex-1 flex justify-center items-center">
              <span className="font-semibold text-gray-900">
                공지사항
              </span>
            </div>
          </div>
        );
      })}
    </div>

    {/* 🔹 페이지네이션 */}
    {noticeTotalPages > 1 && (
      <div className="flex justify-center gap-2 pt-4">
        {Array.from({ length: noticeTotalPages }).map((_, idx) => {
          const page = idx + 1;
          return (
            <button
              key={page}
              onClick={() => setNoticePage(page)}
              className={`px-3 py-1 text-sm rounded
                ${
                  page === noticePage
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
            >
              {page}
            </button>
          );
        })}
      </div>
    )}
  </>
)}

</Card>
{noticeOpen && (
  <Modal title="공지사항 등록" onClose={() => setNoticeOpen(false)}>
    <div className="space-y-3">
      <input
        placeholder="제목"
        className="w-full border px-2 py-1 rounded"
        value={noticeForm.title}
        onChange={(e) =>
          setNoticeForm({ ...noticeForm, title: e.target.value })
        }
      />
      <input
        placeholder="작성자"
        className="w-full border px-2 py-1 rounded"
        value={noticeForm.author}
        onChange={(e) =>
          setNoticeForm({ ...noticeForm, author: e.target.value })
        }
      />
      <textarea
        placeholder="내용"
        rows={4}
        className="w-full border px-2 py-1 rounded"
        value={noticeForm.content}
        onChange={(e) =>
          setNoticeForm({ ...noticeForm, content: e.target.value })
        }
      />

      <button
  onClick={async () => {
    // 🔹 수정 모드
    if (selectedNotice?.id) {
      await updateDoc(doc(db, "notices", selectedNotice.id), {
        title: noticeForm.title,
        author: noticeForm.author,
        content: noticeForm.content,
      });
    }
    // 🔹 신규 등록
    else {
      await addDoc(collection(db, "notices"), {
        title: noticeForm.title,
        author: noticeForm.author,
        content: noticeForm.content,
        createdAt: serverTimestamp(),
      });
    }

    setNoticeForm({ title: "", author: "", content: "" });
    setNoticeOpen(false);
  }}
  className="w-full bg-blue-600 text-white py-2 rounded"
>
  저장
</button>

    </div>
  </Modal>
  
)}
{selectedNotice && (
  <Modal
    title="공지사항 상세"
    onClose={() => setSelectedNotice(null)}
  >
    <div className="space-y-4 text-sm">
      <div>
        
        <div className="text-xs text-gray-500">제목</div>
        <div className="font-semibold">
          {selectedNotice.title}
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500">작성자</div>
        <div>{selectedNotice.author || "-"}</div>
      </div>

      <div>
        <div className="text-xs text-gray-500">작성일</div>
        <div>{selectedNotice.date}</div>
      </div>

      <div>
        <div className="text-xs text-gray-500">내용</div>
        <div className="whitespace-pre-wrap leading-relaxed">
          {selectedNotice.content}
        </div>
      </div>
    </div>
    {/* 2️⃣ 🔥 여기! 하단 버튼 영역 (내용 div 밖!) */}
    <div className="flex justify-center gap-3 pt-6 mt-6 border-t">
      <button
        onClick={async () => {
          if (!window.confirm("공지사항을 삭제할까요?")) return;
          await deleteDoc(doc(db, "notices", selectedNotice.id));
          setSelectedNotice(null);
        }}
        className="px-4 py-2 text-sm rounded border text-red-600 hover:bg-red-50"
      >
        삭제
      </button>

      <button
        onClick={() => {
          setNoticeForm({
            title: selectedNotice.title,
            author: selectedNotice.author,
            content: selectedNotice.content,
          });
          setNoticeOpen(true);
          setSelectedNotice(null);
        }}
        className="px-4 py-2 text-sm rounded bg-blue-600 text-white"
      >
        수정
      </button>
    </div>
  </Modal>
)}

{/* ================= 휴가 / 외근 일정 ================= */}
<Card
  title="휴가 / 외근 일정"
  action={
    <button
      onClick={() => setScheduleOpen(true)}
      className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
    >
      등록
    </button>
  }
>
  {schedules.length === 0 ? (
    <div className="text-sm text-gray-400">등록된 일정이 없습니다</div>
  ) : (
    <>
      {/* 🔹 헤더 */}
      <div className="border-b flex px-3 py-3 bg-slate-100 text-sm font-semibold text-gray-700 text-center">
        <div className="w-[70px]">순번</div>
        <div className="w-[140px]">작성날짜</div>
        <div className="w-[140px]">작성자</div>
        <div className="w-[140px]">구분</div>
        <div className="flex-1">일정</div>
      </div>

      {/* 🔹 리스트 */}
      <div className="divide-y text-sm">
        {pagedSchedules.map((s, idx) => (
          <div
            key={s.id}
            onClick={() => setSelectedSchedule(s)}
            className="flex items-center px-3 py-3 cursor-pointer transition text-base hover:bg-slate-50"
          >
            {/* 순번 */}
            <div className="w-[70px] text-gray-400 text-center font-medium">
              {(schedulePage - 1) * SCHEDULE_PAGE_SIZE + idx + 1}
            </div>

            {/* 작성날짜 */}
           <div className="w-[140px] text-gray-700 text-center font-medium">
  {s.createdAt?.toDate
    ? s.createdAt.toDate().toISOString().slice(0, 10).replaceAll("-", ".")
    : "-"}
</div>
{/* 작성자 (🔥 추가) */}
<div className="w-[140px] text-gray-800 text-center font-semibold">
  {s.name || "-"}
</div>

            {/* 구분 */}
            <div className="w-[140px] text-gray-800 text-center font-semibold">
              {s.type}
            </div>

            {/* 일정 (🔥 날짜 고정) */}
            <div className="flex-1 flex justify-center items-center">
              <span className="font-semibold text-gray-900">
                {s.start?.replaceAll("-", ".")}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 🔹 페이지네이션 */}
      {scheduleTotalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          {Array.from({ length: scheduleTotalPages }).map((_, idx) => {
            const page = idx + 1;
            return (
              <button
                key={page}
                onClick={() => setSchedulePage(page)}
                className={`px-3 py-1 text-sm rounded
                  ${
                    page === schedulePage
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
              >
                {page}
              </button>
            );
          })}
        </div>
      )}
    </>
  )}
</Card>

{/* ================= 등록 모달 ================= */}
{scheduleOpen && (
  <Modal
    title="휴가 / 외근 일정 등록"
    onClose={() => setScheduleOpen(false)}
  >
    <div className="space-y-3">

      {/* 구분 */}
      <select
        className="w-full border px-2 py-1 rounded"
        value={scheduleForm.type}
        onChange={(e) =>
          setScheduleForm({ ...scheduleForm, type: e.target.value })
        }
      >
        <option>휴가</option>
        <option>외근</option>
        <option>반차</option>
        <option>병가</option>
      </select>

      {/* 🔥 이름 입력 제거됨 */}

      {/* 날짜 */}
      <div className="flex gap-2">
        <input
          type="date"
          className="flex-1 border px-2 py-1 rounded"
          value={scheduleForm.start}
          onChange={(e) =>
            setScheduleForm({ ...scheduleForm, start: e.target.value })
          }
        />
        <input
          type="date"
          className="flex-1 border px-2 py-1 rounded"
          value={scheduleForm.end}
          onChange={(e) =>
            setScheduleForm({ ...scheduleForm, end: e.target.value })
          }
        />
      </div>

      {/* 메모 */}
      <textarea
        placeholder="메모 (선택)"
        rows={3}
        className="w-full border px-2 py-1 rounded"
        value={scheduleForm.memo}
        onChange={(e) =>
          setScheduleForm({ ...scheduleForm, memo: e.target.value })
        }
      />

      <button
        onClick={async () => {
          const me = users.find(u => u.id === user?.uid);
const userName = me?.name || "사용자";

          if (selectedSchedule?.id) {
            await updateDoc(doc(db, "schedules", selectedSchedule.id), {
              type: scheduleForm.type,
              name: userName,
              start: scheduleForm.start,
              end: scheduleForm.end,
              memo: scheduleForm.memo,
            });
          } else {
            await addDoc(collection(db, "schedules"), {
              type: scheduleForm.type,
              name: userName, // 🔥 자동 작성자
              start: scheduleForm.start,
              end: scheduleForm.end,
              memo: scheduleForm.memo,
              createdAt: serverTimestamp(),
            });
          }

          setScheduleForm({
            type: "휴가",
            start: "",
            end: "",
            memo: "",
          });

          setScheduleOpen(false);
        }}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        저장
      </button>

    </div>
  </Modal>
)}

{/* ================= 상세 ================= */}
{selectedSchedule && (
  <Modal
    title="일정 상세"
    onClose={() => setSelectedSchedule(null)}
  >
    <div className="space-y-4 text-sm">

      <div>
        <div className="text-xs text-gray-500">구분</div>
        <div className="font-semibold">{selectedSchedule.type}</div>
      </div>

      <div>
        <div className="text-xs text-gray-500">작성자</div>
        <div>{selectedSchedule.name}</div>
      </div>

      <div>
        <div className="text-xs text-gray-500">기간</div>
        <div>
          {selectedSchedule.start} ~ {selectedSchedule.end}
        </div>
      </div>

      {selectedSchedule.memo && (
        <div>
          <div className="text-xs text-gray-500">메모</div>
          <div className="whitespace-pre-wrap">
            {selectedSchedule.memo}
          </div>
        </div>
      )}
    </div>

    {/* 버튼 */}
    <div className="flex justify-center gap-3 pt-6 mt-6 border-t">
      <button
        onClick={async () => {
          if (!window.confirm("삭제할까요?")) return;
          await deleteDoc(doc(db, "schedules", selectedSchedule.id));
          setSelectedSchedule(null);
        }}
        className="px-4 py-2 text-sm rounded border text-red-600"
      >
        삭제
      </button>

      <button
        onClick={() => {
          setScheduleForm({
            type: selectedSchedule.type,
            start: selectedSchedule.start,
            end: selectedSchedule.end,
            memo: selectedSchedule.memo || "",
          });
          setScheduleOpen(true);
          setSelectedSchedule(null);
        }}
        className="px-4 py-2 text-sm rounded bg-blue-600 text-white"
      >
        수정
      </button>
    </div>
  </Modal>
)}

{selectedHandover && (
  <Modal
    title="인수인계 상세"
    onClose={() => setSelectedHandover(null)}
  >
    <div className="space-y-4 text-sm">
      <div className="space-y-3 text-sm">
  <div><b>작성자</b> : {selectedHandover.author}</div>
  <div><b>받는 사람</b> : {selectedHandover.receiver}</div>
  <div><b>기준 날짜</b> : {selectedHandover.date}</div>

  <div className="pt-2 border-t whitespace-pre-wrap">
    {selectedHandover.text}
  </div>
</div>
    </div>

    <div className="flex justify-center gap-3 pt-6 mt-6 border-t">
      <button
        onClick={async () => {
          if (!window.confirm("인수인계를 삭제할까요?")) return;
          await deleteDoc(
            doc(db, "handovers", selectedHandover.id)
          );
          setSelectedHandover(null);
        }}
        className="px-4 py-2 text-sm rounded border text-red-600 hover:bg-red-50"
      >
        삭제
      </button>

      <button
        onClick={() => {
          isEditingHandoverRef.current = true;
setHandoverForm({
  text: selectedHandover.text,
  author: selectedHandover.author,
  authorUid: selectedHandover.authorUid,
  receiver: selectedHandover.receiver,
  receiverUid: selectedHandover.receiverUid,
  date: selectedHandover.date,
});
          setHandoverOpen(true);
          
        }}
        className="px-4 py-2 text-sm rounded bg-blue-600 text-white"
      >
        수정
      </button>
    </div>
  </Modal>
)}
  {/* ================= 인수인계 ================= */}
<Card
  title="인수인계 게시판"
  action={
    <button
      onClick={() => {
        const me = users.find(u => u.id === user?.uid);
        setSelectedHandover(null); // 🔥 신규 등록 시 수정 잔여값 방지
        setHandoverForm({
  text: "",
  author: me?.name || "",
  authorUid: user?.uid || "",
  receiver: "",
  receiverUid: "",
  date: todayStr,
});
        setHandoverOpen(true);
      }}
      className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
    >
      등록
    </button>
  }
>
  {handoverOpen && (
    <Modal
      title="인수인계 등록"
      onClose={() => setHandoverOpen(false)}
    >
      <div className="space-y-3">

        {/* 받는 사람 */}
        <select
          className="w-full border px-2 py-1 rounded"
          value={handoverForm.receiver}
          onChange={(e) => {
  const selected = users.find(u => u.name === e.target.value);

  setHandoverForm({
    ...handoverForm,
    receiver: selected?.name || "",
    receiverUid: selected?.uid || selected?.id,
  });
}}
        >
          <option value="">받는 사람 선택</option>
          {users.map((u) => (
  <option key={u.id} value={u.name}>
    {u.name}
  </option>
))}
        </select>

        {/* 기준 날짜 */}
        <input
          type="date"
          className="w-full border px-2 py-1 rounded"
          value={handoverForm.date}
          onChange={(e) =>
            setHandoverForm({
              ...handoverForm,
              date: e.target.value,
            })
          }
        />

        {/* 인수인계 내용 */}
        <textarea
          rows={4}
          placeholder="인수인계 내용"
          className="w-full border px-2 py-1 rounded"
          value={handoverForm.text}
          onChange={(e) =>
            setHandoverForm({
              ...handoverForm,
              text: e.target.value,
            })
          }
        />

        {/* 저장 */}
        <button
          onClick={async () => {
if (!handoverForm.authorUid) {
  alert("로그인 정보가 없습니다. 다시 로그인하세요.");
  return;
}
            if (!handoverForm.receiver) {
              alert("받는 사람을 선택하세요");
              return;
            }
            if (!handoverForm.text.trim()) {
              alert("인수인계 내용을 입력하세요");
              return;
            }

            // 🔄 수정 / 신규 분기
            if (selectedHandover?.id) {
              const me = users.find(u => u.id === user?.uid);

await updateDoc(
  doc(db, "handovers", selectedHandover.id),
  {
    ...handoverForm,
    author: me?.name || me?.이름 || "사용자",
    authorUid: user?.uid,
  }
);
            } else {
              const me = users.find(u => u.id === user?.uid);

await addDoc(collection(db, "handovers"), {
  ...handoverForm,
  author: me?.name || me?.이름 || "사용자",   // 🔥 핵심
  authorUid: user?.uid,
  createdAt: serverTimestamp(),
  readBy: [],
});
            }

            // 🔁 초기화
            const me = users.find(u => u.id === user?.uid);
           setHandoverForm({
  text: "",
 author: me?.name || "",
  authorUid: user?.uid || "",
  receiver: "",
  receiverUid: "",
  date: todayStr,
});

            setHandoverOpen(false);
            setSelectedHandover(null);
            isEditingHandoverRef.current = false;
          }}
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          저장
        </button>
      </div>
    </Modal>
  )}

  {/* ================= 인수인계 전체 리스트 ================= */}
{handovers.length === 0 ? (
  <div className="text-sm text-gray-400">
    등록된 인수인계가 없습니다
  </div>
) : (
  <>
    {/* 🔹 헤더 */}
    <div className="border-b flex px-3 py-3 bg-slate-100 text-sm font-semibold text-gray-700 text-center">
      <div className="w-[70px]">순번</div>
      <div className="w-[140px]">작성날짜</div>
      <div className="w-[140px]">작성자</div>
      <div className="flex-1">제목</div>
    </div>

    {/* 🔹 리스트 */}
    <div className="divide-y text-sm">
      {pagedHandovers.map((h, idx) => {
        const receiverRead = h.readBy?.includes(h.receiverUid);
        const isReceiver = user?.uid === h.receiverUid;
        const isAuthor = user?.uid === h.authorUid;

        const dateStr =
          h.date || formatCreatedAt(h.createdAt) || "";

        const formattedDate = dateStr
          ? dateStr.replaceAll("-", ".")
          : "-";

        return (
          <div
            key={h.id}
            onClick={async () => {
              setSelectedHandover(h);

              if (isReceiver && !receiverRead) {
                await updateDoc(doc(db, "handovers", h.id), {
                  readBy: [...(h.readBy || []), user.uid],
                });
              }
            }}
            className={`
              flex items-center px-3 py-3 cursor-pointer transition text-base
              hover:bg-slate-50
              ${!receiverRead && isReceiver ? "bg-red-50" : ""}
            `}
          >
            {/* 순번 */}
            <div className="w-[70px] text-gray-400 text-center font-medium">
              {(handoverPage - 1) * HANDOVER_PAGE_SIZE + idx + 1}
            </div>

            {/* 날짜 */}
            <div className="w-[140px] text-gray-700 text-center font-medium">
              {formattedDate}
            </div>

            {/* 작성자 */}
            <div className="w-[140px] text-gray-800 text-center font-semibold">
              {h.author}
            </div>

            {/* 제목 */}
            <div className="flex-1 flex justify-center items-center gap-2">
              <span className="font-semibold text-gray-900">
                인수인계
              </span>

              {(isReceiver || isAuthor) && (
                <span
                  className={`text-xs px-2 py-1 rounded-full font-semibold
                    ${
                      receiverRead
                        ? "bg-blue-500 text-white"
                        : "bg-red-500 text-white"
                    }`}
                >
                  {receiverRead ? "읽음" : "안읽음"}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>

    {/* 🔹 페이지네이션 */}
    {handoverTotalPages > 1 && (
      <div className="flex justify-center gap-2 pt-4">
        {Array.from({ length: handoverTotalPages }).map((_, idx) => {
          const page = idx + 1;
          return (
            <button
              key={page}
              onClick={() => setHandoverPage(page)}
              className={`px-3 py-1 text-sm rounded
                ${
                  page === handoverPage
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
            >
              {page}
            </button>
          );
        })}
      </div>
    )}
  </>
)}
</Card>
</div>
      {/* ================= 하단 ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 최근 오더 */}
        <div className="lg:col-span-2">
  <Card title="당일 미배차 현황">
  <div className="h-[400px] flex flex-col">

    {/* 🔹 헤더 */}
    <table className="w-full text-sm table-fixed">
<thead className="bg-slate-50 text-gray-500 text-xs">
  <tr className="flex">
    <th className="px-2 py-2 w-[90px]">상차일</th>
    <th className="px-2 py-2 w-[70px]">상차시간</th>
    <th className="px-2 py-2 w-[90px]">하차일</th>
    <th className="px-2 py-2 w-[70px]">하차시간</th>
    <th className="px-2 py-2 flex-1 text-left">상차지</th>
    <th className="px-2 py-2 flex-1 text-left">하차지</th>
    <th className="px-2 py-2 w-[110px]">화물</th>
    <th className="px-2 py-2 w-[90px]">차량</th>
    <th className="px-2 py-2 w-[70px]">톤수</th>
    <th className="px-2 py-2 w-[140px]">메모</th>
    <th className="px-2 py-2 w-[80px]">상태</th>
  </tr>
</thead>
    </table>

    {/* 🔹 본문 */}
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-sm table-fixed">
        <tbody>
  {todayPendingOrders.map((d, i) => (
    <tr
      key={i}
      className="flex items-center border-t hover:bg-red-50 transition text-xs"
    >
      {/* 상차일 */}
      <td className="px-2 py-2 w-[90px] text-gray-700">
        {d?.상차일자?.slice(5) || "-"}
      </td>

      {/* 상차시간 */}
      <td className="px-2 py-2 w-[70px] text-gray-600">
        {d?.상차시간 || "-"}
      </td>

      {/* 하차일 */}
      <td className="px-2 py-2 w-[90px] text-gray-700">
        {d?.하차일자?.slice(5) || "-"}
      </td>

      {/* 하차시간 */}
      <td className="px-2 py-2 w-[70px] text-gray-600">
        {d?.하차시간 || "-"}
      </td>

      {/* 상차지 */}
      <td className="px-2 py-2 flex-1 truncate font-medium">
        {d?.상차지명 || "-"}
      </td>

      {/* 하차지 */}
      <td className="px-2 py-2 flex-1 truncate text-gray-600">
        {d?.하차지명 || "-"}
      </td>

      {/* 화물 */}
      <td className="px-2 py-2 w-[110px] truncate">
        {d?.화물내용 || "-"}
      </td>

      {/* 차량 */}
      <td className="px-2 py-2 w-[90px] text-center">
        {d?.차량종류 || "-"}
      </td>

      {/* 톤수 */}
      <td className="px-2 py-2 w-[70px] text-center">
        {d?.차량톤수 || "-"}
      </td>

      {/* 메모 */}
      <td className="px-2 py-2 w-[140px] truncate text-gray-500">
        {d?.메모 || "-"}
      </td>

      {/* 상태 */}
      <td className="px-2 py-2 w-[80px] text-center">
        <span className="bg-red-500 text-white px-2 py-1 rounded-full text-[10px]">
          미배차
        </span>
      </td>
    </tr>
  ))}

          {/* 데이터 없을 때 */}
          {todayPendingOrders.length === 0 && (
            <tr className="flex items-center justify-center h-full">
              <td className="text-sm text-gray-400 py-10">
                조회된 미배차 오더가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
</Card>
</div>

        {/* TOP 10 거래처 */}
        <Card title="Top 10 거래처">
  {/* 🔹 KPI 요약 영역 */}
  <div className="grid grid-cols-3 gap-4 mb-4">
    <div>
      <div className="text-xs text-gray-500">총 매출</div>
      <div className="text-lg font-extrabold">
        ₩{top10Summary.total.toLocaleString()}
      </div>
    </div>

    <div>
      <div className="text-xs text-gray-500">평균 매출</div>
      <div className="text-lg font-extrabold">
        ₩{top10Summary.avg.toLocaleString()}
      </div>
    </div>

    <div>
      <div className="text-xs text-gray-500">최고 거래처</div>
      <div className="text-sm font-bold truncate">
        {top10Summary.topName}
      </div>
    </div>
  </div>

  {/* 🔹 Bar Chart */}
  <ResponsiveContainer width="100%" height={260}>
    <BarChart
      data={topClients}
      margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
    >
      <XAxis
        dataKey="name"
        interval={0}
        angle={-25}
        textAnchor="end"
        tick={{ fontSize: 11 }}
      />
      <YAxis tickFormatter={(v) => v.toLocaleString()} />
      <Tooltip
        formatter={(v) => `${Number(v).toLocaleString()}원`}
      />
      <Bar
        dataKey="value"
        fill="#6366f1"
        radius={[6, 6, 0, 0]}
        barSize={28}
      />
    </BarChart>
  </ResponsiveContainer>
</Card>


  </div> 
  {/* ================= 🔔 우측 하단 토스트 ================= */}
{toast && (
  <div
    className="fixed bottom-5 right-5 z-50 bg-white border shadow-lg rounded-lg px-4 py-3 cursor-pointer"
    onClick={() => {
      if (toast.type === "notice") {
  setSelectedNotice(toast.data);
} else if (toast.type === "schedule") {
  setSelectedSchedule(toast.data);
} else if (toast.type === "handover") {
  setSelectedHandover(toast.data);
}

      setToast(null);
    }}
  >
    {/* ❌ 닫기 버튼 */}
    <button
      onClick={(e) => {
        e.stopPropagation(); // ⭐ 중요: 상세 열기 막기
        setToast(null);
      }}
      className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-sm"
      aria-label="닫기"
    >
      ✕
    </button>

    <div className="flex items-center gap-2">
      <span className="text-lg">
  {toast.type === "notice"
    ? "📢"
    : toast.type === "schedule"
    ? "📅"
    : "📝"}
</span>
     <div className="text-sm font-semibold">
  {toast.type === "notice"
    ? "공지사항이 등록되었습니다"
    : toast.type === "schedule"
    ? "일정이 등록되었습니다"
    : "인수인계가 등록되었습니다"}
</div>
    </div>

    <div className="text-xs text-gray-500 mt-1 truncate max-w-[240px]">
  {toast.type === "notice"
    ? toast.data.title
    : toast.type === "schedule"
    ? `[${toast.data.type}] ${toast.data.name}`
    : toast.data.text}
</div>
  </div>
)}

    </div> 
    
  );
}
      