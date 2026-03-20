import { useEffect, useMemo, useState } from "react";
import { db, auth } from "../../firebase";
import ShipperOrder from "./ShipperOrder";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { updateDoc } from "firebase/firestore";
/* ================= 상태 UI ================= */
const STATUS = {
  요청: { label: "요청", cls: "bg-blue-100 text-blue-700" },
  배차중: { label: "배차중", cls: "bg-amber-100 text-amber-700" },
  배차완료: { label: "배차완료", cls: "bg-emerald-100 text-emerald-700" },
  배차취소: { label: "취소", cls: "bg-red-100 text-red-600" },
};

export default function ShipperStatus() {
  const user = auth.currentUser;
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(true); // 🔥 슬라이드 상태
  const [startDate, setStartDate] = useState("");
const [endDate, setEndDate] = useState("");
const [searchType, setSearchType] = useState("통합");
const [selectedOrder, setSelectedOrder] = useState(null);
const [detailOpen, setDetailOpen] = useState(false);
const [expandedRows, setExpandedRows] = useState({});
const [selectedIds, setSelectedIds] = useState([]);
const [editOpen, setEditOpen] = useState(false);
const [editData, setEditData] = useState(null);
  /* ================= 데이터 로드 ================= */
  useEffect(() => {
    if (!user) return;

    const q = query(
  collection(db, "orders"),
  where("shipperUid", "==", user.uid)
);

    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  /* ================= KPI ================= */
const kpi = useMemo(
  () => ({
    total: orders.length,
    요청: orders.filter((o) => !o.차량번호).length,
    배차중: 0,
    배차완료: orders.filter((o) => o.차량번호).length,

    // 🔥 추가
    총금액: orders.reduce((sum, o) => {
      return sum + (Number(o.청구운임) || 0);
    }, 0),
  }),
  [orders]
);
// 🔥 상태 자동 계산 함수 (추가)
const getStatus = (o) => {
  if (o.상태 === "취소") return "배차취소"; // 🔥 이거 추가
  if (o.차량번호 && o.차량번호.trim()) return "배차완료";
  return "요청";
};
const toggleExpand = (id, type) => {
  setExpandedRows((prev) => ({
    ...prev,
    [`${id}_${type}`]: !prev[`${id}_${type}`],
  }));
};
const toggleSelect = (id, checked) => {
  if (checked) {
    setSelectedIds(prev => [...prev, id]);
  } else {
    setSelectedIds(prev => prev.filter(v => v !== id));
  }
};

const handleDeleteSelected = async () => {
  if (selectedIds.length === 0) {
    alert("선택된 항목 없음");
    return;
  }

  if (!window.confirm("정말 삭제하시겠습니까?")) return;

  for (let id of selectedIds) {
    await deleteDoc(doc(db, "orders", id));
  }

  setSelectedIds([]);
};
const handleEditSelected = () => {
  if (selectedIds.length !== 1) {
    alert("1개만 선택하세요");
    return;
  }

  const target = orders.find(o => o.id === selectedIds[0]);

  if (!target) {
    alert("데이터 못찾음");
    return;
  }

  setEditData(target);
  setEditOpen(true);
};
  /* ================= 필터링 ================= */
const rows = useMemo(() => {
  return orders.filter((o) => {

    // 상태 필터
const currentStatus = getStatus(o);
if (filter !== "전체" && currentStatus !== filter) return false;

    // 📅 날짜 필터 (상차일 기준)
    if (startDate && o.상차일 < startDate) return false;
    if (endDate && o.상차일 > endDate) return false;

    // 🔍 검색 필터
    if (!keyword) return true;

    const val = keyword.toLowerCase();

    switch (searchType) {
      case "운송사명":
        return o.운송사명?.toLowerCase().includes(val);

      case "상차지명":
        return o.상차지명?.toLowerCase().includes(val);

      case "차량번호":
        return o.차량번호?.toLowerCase().includes(val);

      case "이름":
        return o.기사이름?.toLowerCase().includes(val);

      default: // 통합검색
        return (
          o.거래처명?.toLowerCase().includes(val) ||
          o.상차지명?.toLowerCase().includes(val) ||
          o.하차지명?.toLowerCase().includes(val) ||
          o.운송사명?.toLowerCase().includes(val) ||
          o.차량번호?.toLowerCase().includes(val) ||
          o.기사이름?.toLowerCase().includes(val)
        );
    }
  });
}, [orders, filter, keyword, startDate, endDate, searchType]);

const cancelOrder = async (id) => {
  if (!window.confirm("오더를 취소하시겠습니까?")) return;

  await updateDoc(doc(db, "orders", id), {
    상태: "취소",
  });
};

  if (loading) {
    return <div className="py-24 text-center text-gray-400">불러오는 중…</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ================= 좌측 슬라이드 ================= */}
      <div
        className={`
          ${open ? "w-56" : "w-16"}
flex-shrink-0
bg-gray-100 border-r transition-all duration-300
        `}
      >
        {/* 접기 버튼 */}
        <div className="flex justify-end p-2">
          <button
  onClick={() => setOpen(!open)}
  className="
    w-8 h-8 flex items-center justify-center
    rounded-md bg-gray-200 hover:bg-gray-300
    text-gray-700 font-bold
    transition
  "
>
  {open ? "<" : ">"}
</button>
        </div>

        {/* 메뉴 */}
        <div className="p-3 space-y-2 text-sm">
<MenuItem label="운송목록" type="list" active open={open} />

<MenuItem
  label="일반 배차등록"
  type="truck"
  open={open}
  onClick={() => navigate("/shipper/order")}
/>

<MenuItem label="대량 배차등록" type="fast" open={open} />
</div>
      </div>

      {/* ================= 우측 메인 ================= */}
      <div className="flex-1 min-w-0 px-8 py-6 bg-[#f4f7fb] space-y-6 transition-all duration-300">

        {/* KPI */}
        <div className="grid grid-cols-4 gap-4">
          <KPI title="전체 오더" value={kpi.total} />
          <KPI title="요청" value={kpi.요청} />
          <KPI title="배차중" value={kpi.배차중} />
          <KPI title="배차완료" value={kpi.배차완료} />
          <KPI title="총 운송료" value={`${kpi.총금액.toLocaleString()}원`} />
        </div>

        <div className="bg-white rounded-xl p-4 space-y-3 shadow-sm">

  {/* 1️⃣ 상태 필터 */}
  <div className="flex gap-2">
    {["전체", "요청", "배차중", "배차완료", "배차취소"].map((s) => (
      <button
        key={s}
        onClick={() => setFilter(s)}
        className={`px-4 py-2 rounded-lg text-sm font-semibold
        ${
          filter === s
            ? "bg-blue-600 text-white"
            : "bg-blue-50 text-blue-700 hover:bg-blue-100"
        }`}
      >
        {s}
      </button>
    ))}
  </div>

  <div className="flex justify-between items-center flex-wrap gap-2">

  {/* 왼쪽: 기존 검색 */}
  <div className="flex gap-2 items-center flex-wrap">

    <input
      type="date"
      value={startDate}
      onChange={(e) => setStartDate(e.target.value)}
      className="border rounded-lg px-3 py-2 text-sm"
    />
    <span>~</span>
    <input
      type="date"
      value={endDate}
      onChange={(e) => setEndDate(e.target.value)}
      className="border rounded-lg px-3 py-2 text-sm"
    />

    <button
      onClick={() => {
        const today = new Date().toISOString().slice(0, 10);
        setStartDate(today);
        setEndDate(today);
      }}
      className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
    >
      당일
    </button>

    <button
      onClick={() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const tmr = d.toISOString().slice(0, 10);
        setStartDate(tmr);
        setEndDate(tmr);
      }}
      className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
    >
      내일
    </button>

    <select
      value={searchType}
      onChange={(e) => setSearchType(e.target.value)}
      className="border rounded-lg px-3 py-2 text-sm"
    >
      <option>통합검색</option>
      <option>운송사명</option>
      <option>상차지명</option>
      <option>차량번호</option>
      <option>이름</option>
    </select>

    <input
      className="border rounded-lg px-4 py-2 text-sm w-64"
      placeholder="검색어 입력"
      value={keyword}
      onChange={(e) => setKeyword(e.target.value)}
    />

  </div>

  {/* 🔥 오른쪽 버튼 */}
  <div className="flex gap-2">
    <button
      onClick={handleEditSelected}
      className="px-4 py-2 bg-blue-600 text-white rounded"
    >
      선택수정
    </button>

    <button
      onClick={handleDeleteSelected}
      className="px-4 py-2 bg-blue-600 text-white rounded"
    >
      선택삭제
    </button>

    <button className="px-4 py-2 bg-green-500 text-white rounded">
      엑셀다운
    </button>
  </div>

</div>
</div>

        {/* 테이블 */}
        <div className="bg-white rounded-xl shadow-sm">

          {/* 헤더 */}
          <div className="
  grid grid-cols-[40px_60px_110px_90px_110px_90px_140px_140px_200px_140px_200px_140px_120px_90px_120px_120px_120px_110px_110px_120px_90px]
  bg-[#eef3fb]
  text-[16px] font-extrabold text-gray-800
  px-4 py-4
  text-center
">
  <div>
  <input type="checkbox" />
</div>
            <div>순번</div>
            <div>상차일</div>
            <div>상차시간</div>
            <div>하차일</div>
            <div>하차시간</div>
            <div>거래처</div>
            <div>상차지</div>
<div>상차지주소</div>
<div>하차지</div>
<div>하차지주소</div>
            <div>화물</div>
            <div>차량</div>
           <div>톤수</div>
<div>차량번호</div>
<div>이름</div>
<div>전화번호</div>
<div>청구운임</div>
<div>지급방식</div>
            <div>상태</div>
            <div>운송사</div>
          </div>

          {/* ROW */}
          
          {rows.map((o, i) => {
            const st = STATUS[getStatus(o)];
            return (
 <div
  key={o.id}
  onDoubleClick={() => {
    setSelectedOrder(o);
    setDetailOpen(true);
  }}
className={`
  cursor-pointer
  grid grid-cols-[40px_60px_110px_90px_110px_90px_140px_140px_200px_140px_200px_140px_120px_90px_120px_120px_120px_110px_110px_120px_90px]
  px-4 py-5
  border-t
  text-[18px]
  text-center
  items-center
  [&>div]:flex [&>div]:justify-center [&>div]:items-center
  ${
    getStatus(o) === "배차취소"
      ? "bg-red-50 text-red-600"
      : "text-gray-800 hover:bg-blue-50"
  }
`}

>

  {/* ✅ 체크박스 추가 (이거 빠져있었음) */}
  <div>
    <input
  type="checkbox"
  checked={selectedIds.includes(o.id)}
  onClick={(e) => e.stopPropagation()}   // 🔥 이거 추가
  onChange={(e) => toggleSelect(o.id, e.target.checked)}
/>
  </div>

  {/* 순번 */}
  <div>{i + 1}</div>
                <div className="text-gray-800">
  {o.상차일 || "-"}
</div>
                <div className="text-[18px] font-semibold">
  {o.상차시간 || "-"}
</div>
                <div>{o.하차일 || "-"}</div>
                <div className="text-[18px] font-semibold">
  {o.하차시간 || "-"}
</div>
                <div className="font-semibold text-gray-900 text-[17px]">
  {o.거래처명}</div>
                <div>{o.상차지명}</div>
<div
  onClick={() => toggleExpand(o.id, "up")}
  className={`
    cursor-pointer px-2 text-center text-gray-700
    ${expandedRows[`${o.id}_up`] 
      ? "text-[18px]" 
      : "text-[16px] line-clamp-1"}
  `}
>
  {o.상차지주소}
</div>
<div>{o.하차지명}</div>
<div
  onClick={() => toggleExpand(o.id, "down")}
  className={`
    cursor-pointer px-2 text-center text-gray-700
    ${expandedRows[`${o.id}_down`] 
      ? "text-[18px]" 
      : "text-[16px] line-clamp-1"}
  `}
>
  {o.하차지주소}
</div>
                <div className="truncate">{o.화물내용 || "-"}</div>
                <div>{o.차량종류}</div>
                <div>{o.차량톤수}</div>
<div>{o.차량번호 || "-"}</div>
<div>{o.이름 || "-"}</div>
<div className="whitespace-nowrap">{o.전화번호 || "-"}</div>

<div className="font-bold text-blue-600">
  {o.청구운임
    ? Number(o.청구운임).toLocaleString() + "원"
    : "-"}
</div>

<div>{o.지급방식}</div>

<div>
  <span className={`px-3 py-1 rounded-full text-[14px] font-bold ${st.cls}`}>
    {st.label}
  </span>
</div>

<div className="font-semibold text-gray-900">
  {o.운송사명 || "-"}
</div>
              </div>
            );
          })}
        </div>
      </div>
      {detailOpen && selectedOrder && (
        
      <div className="
        fixed top-0 right-0 h-full w-[720px]
        bg-white shadow-2xl z-50
        overflow-y-auto
        animate-slideIn
      ">

        <div className="flex items-center justify-between px-5 py-4 border-b">

  {/* 왼쪽: 상태 */}
  <div className="text-[18px] font-bold text-blue-600">
    {selectedOrder?.차량번호 && selectedOrder?.차량번호.trim()
      ? "배차완료 되었습니다."
      : "배차중 입니다."}
  </div>

  {/* 🔥 가운데: 액션 버튼 */}
  <div className="flex gap-2">

    <button
      onClick={() => {
        setEditData(selectedOrder);
        setEditOpen(true);
      }}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
    >
      수정
    </button>

    <button
      onClick={() => cancelOrder(selectedOrder.id)}
      className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600"
    >
      오더취소
    </button>

  </div>

  {/* 오른쪽: 닫기 */}
  <button
    onClick={() => setDetailOpen(false)}
    className="text-gray-500 hover:text-black text-xl"
  >
    ×
  </button>

</div>

        <div className="p-8 space-y-8 text-[20px]">

  {/* 물품정보 */}
  <Section title="물품정보">
    <Row label="화물" value={selectedOrder?.화물내용 || "-"} />
    <Row label="톤수" value={selectedOrder?.차량톤수 || "-"} />

    <div className="pt-3 border-t space-y-3">
      <Row label="전달사항" value={selectedOrder?.전달사항 || "-"} />
      <Row label="요청차량" value={selectedOrder?.차량종류 || "-"} />
      <Row label="추가정보" value={selectedOrder?.추가정보 || "-"} />
      <Row label="메모" value={selectedOrder?.메모 || "-"} />
    </div>
  </Section>

  {/* 🔥 운송내역 (밖으로 빼라) */}
  <Section title="운송내역">
    <Timeline order={selectedOrder} />
  </Section>

</div>

      </div>
    )}
    {editOpen && editData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-center items-center">

          <div className="bg-white w-[1200px] h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">

            {/* 헤더 */}
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <div className="text-xl font-bold">오더 수정</div>

              <button
                onClick={() => setEditOpen(false)}
                className="text-gray-500 hover:text-black text-2xl"
              >
                ×
              </button>
            </div>

            {/* 내용 */}
            <div className="flex-1 overflow-y-auto">
              <ShipperOrder
  editData={editData}
  onClose={() => setEditOpen(false)}
/>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}

/* KPI */
function KPI({ title, value }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="text-base text-gray-500">{title}</div>
<div className="text-4xl font-bold text-gray-900 mt-2">{value}</div>
    </div>
  );
}
function KPICircle({ title, value }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col items-center justify-center">
      <div className="relative w-32 h-32 rounded-full border-8 border-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xs text-gray-500">{title}</div>
          <div className="text-lg font-bold text-blue-600">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}
/* 메뉴 */
function MenuItem({ label, type, active, open, onClick }) {
  const renderIcon = () => {
    switch (type) {
      case "list":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
            <path d="M7 8h6M7 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M15 12l2 2 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        );

      case "truck":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="1" y="6" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
            <path d="M14 10h4l3 3v3h-7" stroke="currentColor" strokeWidth="2"/>
            <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="2"/>
            <circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="2"/>
          </svg>
        );

      case "fast":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M1 12h15l4-4" stroke="currentColor" strokeWidth="2"/>
            <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="2"/>
            <circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="2"/>
          </svg>
        );

      default:
        return null;
    }
  };

  return (
    <div className="relative group">
      <div
        onClick={onClick}
        className={`
          flex items-center
          ${open ? "justify-start px-4" : "justify-center"}
          py-3 rounded cursor-pointer transition
          ${active
            ? "bg-blue-100 text-blue-600"
            : "text-gray-600 hover:bg-gray-200"}
        `}
      >
        {/* 🔥 닫혔을 때 아이콘 */}
        {!open && (
          <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200">
            {renderIcon()}
          </div>
        )}

        {/* 🔥 열렸을 때 텍스트 */}
        {open && (
          <span className="whitespace-nowrap text-base font-bold">
            {label}
          </span>
        )}
      </div>

      {/* hover 툴팁 */}
      {!open && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-gray-800 text-white text-xs px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition">
          {label}
        </div>
      )}
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div>
      <div className="text-[21px] font-bold text-gray-800 mb-4">
        {title}
      </div>
      <div className="bg-gray-50 rounded-xl p-6">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-2 text-[18px]">
      <div className="text-gray-500 w-[110px]">{label}</div>
      <div className="font-semibold text-gray-900 text-right flex-1">
        {value || "-"}
      </div>
    </div>
  );
}

function Timeline({ order }) {
  const isDone = order?.차량번호 && order?.차량번호.trim();

  const isCanceled =
    order?.상태 === "취소" ||
    order?.상태 === "오더취소" ||
    order?.취소여부 === true;

  const steps = [
    {
      title: "배차접수",
      company: order?.운송사명 || "돌캐",
      date: order?.상차일,
      time: order?.상차시간,
    },
    {
      title: "배차중",
      company: order?.운송사명 || "로지스팟",
      date: order?.상차일,
      time: order?.상차시간,
    },
    {
      title: "배차완료",
      company: order?.운송사명 || "로지스팟",
    },
    {
      title: "상차완료",
      company: order?.운송사명 || "돌캐",
      location: order?.상차지명,
    },
    {
      title: "운송완료",
      company: order?.운송사명 || "돌캐",
      location: order?.하차지명,
    },
  ];

  let currentIndex = isDone ? 2 : 1;
  if (isCanceled) currentIndex = 1;

  return (
    <div className="relative pl-16">

      {/* 기준 라인 */}
      <div className="absolute left-[20px] top-0 bottom-0 w-[3px] bg-gray-200" />

      {steps.map((step, i) => {
        const isPrev = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isCancelPoint = isCanceled && i === currentIndex;

        return (
          <div key={i} className="relative mb-12">

            {/* 🔵 / 🔴 큰 원 */}
            {(isCurrent || isCancelPoint) && (
              <div
                className={`
                  absolute left-[20px] top-[6px]
                  -translate-x-1/2
                  w-7 h-7 rounded-full border-[4px] bg-white z-10
                  ${isCancelPoint ? "border-red-500" : "border-blue-500"}
                  animate-pulseSlow
                `}
              />
            )}

            {/* 작은 점 */}
            <div
              className={`
                absolute left-[20px] top-[14px]
                -translate-x-1/2
                w-3 h-3 rounded-full
                ${
                  isCancelPoint
                    ? "bg-red-500"
                    : isCurrent
                    ? "bg-blue-500"
                    : isPrev
                    ? "bg-gray-300"
                    : "bg-gray-200"
                }
              `}
            />

            {/* 텍스트 */}
            <div className="ml-14">

              <div
                className={`
                  text-[20px] font-bold
                  ${
                    isCancelPoint
                      ? "text-red-500"
                      : isCurrent
                      ? "text-blue-600"
                      : isPrev
                      ? "text-gray-400"
                      : "text-gray-300"
                  }
                `}
              >
                {isCancelPoint
                  ? "취소 [오더취소] 배차중"
                  : step.title}
              </div>

              {step.company && (
                <div className="text-[16px] text-gray-700 mt-1">
                  {step.company}
                </div>
              )}

              {step.location && (
                <div className="text-[14px] text-gray-500">
                  {step.location}
                </div>
              )}

              {step.date && (
                <div className="text-[14px] text-gray-400 mt-1">
                  요청일자 {step.date} {step.time}
                </div>
              )}

            </div>
          </div>
        );
      })}

      {/* 애니메이션 */}
      <style>
        {`
          .animate-pulseSlow {
            animation: pulseSlow 2s infinite;
          }

          @keyframes pulseSlow {
            0% { transform: translateX(-50%) scale(1); opacity: 1; }
            50% { transform: translateX(-50%) scale(1.2); opacity: 0.6; }
            100% { transform: translateX(-50%) scale(1); opacity: 1; }
          }
        `}
      </style>

    </div>
  );
}
