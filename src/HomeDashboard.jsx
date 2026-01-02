import React, { useMemo, useState } from "react";

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
import { db } from "./firebase";
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
  // ===================== 인수인계 팝업 =====================
const [handoverOpen, setHandoverOpen] = useState(false);
const [handoverForm, setHandoverForm] = useState({
  text: "",
  author: "박성우팀장", // 기본값
});
const [selectedHandover, setSelectedHandover] = useState(null);

const [selectedNotice, setSelectedNotice] = useState(null);
const [selectedSchedule, setSelectedSchedule] = useState(null);
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
    const added = snap.docChanges().find(c => c.type === "added");
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

// ===================== Recent Orders (오늘 상차 · 금액 TOP 5) =====================
const recentOrders = useMemo(() => {
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
  {notices.length === 0 ? (
    <div className="text-sm text-gray-400">등록된 공지가 없습니다</div>
  ) : (
    <ul className="space-y-2 text-sm">
      {notices.map((n, i) => (
        <li
  key={i}
  onClick={() => setSelectedNotice(n)}
  className="border-b pb-2 cursor-pointer hover:bg-slate-50 rounded px-1"
>
          <div className="font-semibold">{n.title}</div>
          <div className="text-xs text-gray-400">
            {n.date} · 공지사항
          </div>
        </li>
      ))}
    </ul>
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
    <ul className="space-y-2 text-sm">
  {schedules.map((s, i) => (
    <li
      key={i}
      onClick={() => setSelectedSchedule(s)}
      className="border-b pb-2 cursor-pointer hover:bg-slate-50 rounded px-1"
    >
      <div className="font-semibold">
        [{s.type}] {s.name}
      </div>
      <div className="text-xs text-gray-500">
        {s.start} ~ {s.end}
      </div>
    </li>
  ))}
</ul>

  )}
</Card>


{scheduleOpen && (
  <Modal

    title="휴가 / 외근 일정 등록"
    onClose={() => setScheduleOpen(false)}
  >
    <div className="space-y-3">
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

      <input
        placeholder="이름"
        className="w-full border px-2 py-1 rounded"
        value={scheduleForm.name}
        onChange={(e) =>
          setScheduleForm({ ...scheduleForm, name: e.target.value })
        }
      />

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
  if (selectedSchedule?.id) {
    await updateDoc(doc(db, "schedules", selectedSchedule.id), {
      type: scheduleForm.type,
      name: scheduleForm.name,
      start: scheduleForm.start,
      end: scheduleForm.end,
      memo: scheduleForm.memo,
    });
  } else {
    await addDoc(collection(db, "schedules"), {
      ...scheduleForm,
      createdAt: serverTimestamp(),
    });
  }

  setScheduleForm({
    type: "휴가",
    name: "",
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
{selectedHandover && (
  <Modal
    title="인수인계 상세"
    onClose={() => setSelectedHandover(null)}
  >
    <div className="space-y-4 text-sm">
      <div className="whitespace-pre-wrap">
        {selectedHandover.text}
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
          setHandoverForm({ text: selectedHandover.text });
          setHandoverOpen(true);
          setSelectedHandover(null);
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
  title="오늘 인수인계"
  action={
    <button
      onClick={() => setHandoverOpen(true)}
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
      <textarea
        rows={4}
        placeholder="인수인계 내용"
        className="w-full border px-2 py-1 rounded"
        value={handoverForm.text}
        onChange={(e) =>
          setHandoverForm({ text: e.target.value })
        }
      />

      <button
        onClick={async () => {
          if (selectedHandover?.id) {
            await updateDoc(
              doc(db, "handovers", selectedHandover.id),
              { text: handoverForm.text }
            );
          } else {
            await addDoc(collection(db, "handovers"), {
              text: handoverForm.text,
              createdAt: serverTimestamp(),
            });
          }

          setHandoverForm({ text: "" });
          setSelectedHandover(null);
          setHandoverOpen(false);
        }}
        className="w-full bg-blue-600 text-white py-2 rounded"
      >
        저장
      </button>
    </div>
  </Modal>
)}
            {handovers.length === 0 ? (
        <div className="text-sm text-gray-400">오늘 인수인계 없음</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {handovers.map((h, i) => (
            <li
              key={i}
              onClick={() => setSelectedHandover(h)}
              className="border-b pb-1 cursor-pointer hover:bg-slate-50 rounded px-1"
            >
              {h.text}
            </li>
          ))}
        </ul>
      )}
  </Card>


</div>


      {/* ================= 하단 ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 최근 오더 */}
        <div className="lg:col-span-2">
  <Card title="청구 top5">
    <div className="h-[400px] flex flex-col">

      {/* 🔹 테이블 헤더 */}
      <table className="w-full text-sm table-fixed">
        <thead className="bg-slate-50 text-gray-500">
          <tr className="flex">
            <th className="px-3 py-2 text-left flex-1">거래처</th>
            <th className="px-3 py-2 text-left flex-1">상차지</th>
            <th className="px-3 py-2 text-left flex-1">하차지</th>
            <th className="px-3 py-2 text-right w-32">청구운임</th>
          </tr>
        </thead>
      </table>

      {/* 🔹 본문 */}
      <div className="flex-1">
        <table className="w-full h-full text-sm table-fixed">
          <tbody className="flex flex-col h-full">
            {recentOrders.map((d, i) => (
              <tr
                key={i}
                className="flex items-center flex-1 border-t hover:bg-slate-50"
              >
                <td className="px-3 py-2 flex-1 font-medium truncate">
                  {d?.거래처명 || d?.거래처}
                </td>

                <td className="px-3 py-2 flex-1 text-gray-600 truncate">
                  {d?.상차지명 || d?.상차지 || "-"}
                </td>

                <td className="px-3 py-2 flex-1 text-gray-600 truncate">
                  {d?.하차지명 || d?.하차지 || "-"}
                </td>

                <td className="px-3 py-2 w-32 text-right font-semibold text-blue-600">
                  ₩{Number(d?.청구운임 || 0).toLocaleString()}
                </td>
              </tr>
            ))}

            {/* 🔹 데이터 없을 때도 높이 유지 */}
            {recentOrders.length === 0 && (
              <tr className="flex items-center justify-center flex-1">
                <td className="text-sm text-gray-400">
                  오늘 접수된 오더가 없습니다
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
      