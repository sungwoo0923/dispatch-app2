import { useEffect, useMemo, useState } from "react";
import { db, auth } from "../../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
/* ================= 상태 UI ================= */
const STATUS = {
  요청: { label: "요청", cls: "bg-blue-100 text-blue-700" },
  배차중: { label: "배차중", cls: "bg-amber-100 text-amber-700" },
  배차완료: { label: "배차완료", cls: "bg-emerald-100 text-emerald-700" },
};

export default function ShipperStatus() {
  const user = auth.currentUser;
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(true); // 🔥 슬라이드 상태

  /* ================= 데이터 로드 ================= */
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "shipper_orders"),
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
      요청: orders.filter((o) => o.status === "요청").length,
      배차중: orders.filter((o) => o.status === "배차중").length,
      배차완료: orders.filter((o) => o.status === "배차완료").length,
    }),
    [orders]
  );

  /* ================= 필터링 ================= */
  const rows = useMemo(() => {
    return orders.filter((o) => {
      if (filter !== "전체" && o.status !== filter) return false;
      if (!keyword) return true;
      return (
        o.거래처명?.includes(keyword) ||
        o.상차지명?.includes(keyword) ||
        o.하차지명?.includes(keyword)
      );
    });
  }, [orders, filter, keyword]);

  const cancelOrder = async (id) => {
    if (!window.confirm("오더를 취소하시겠습니까?")) return;
    await deleteDoc(doc(db, "shipper_orders", id));
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
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-xl p-4 flex justify-between items-center shadow-sm">
          <div className="flex gap-2">
            {["전체", "요청", "배차중", "배차완료"].map((s) => (
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

          <input
            className="border rounded-lg px-4 py-2 text-sm w-80"
            placeholder="거래처 / 상차지 / 하차지 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>

        {/* 테이블 */}
        <div className="bg-white rounded-xl shadow-sm">

          {/* 헤더 */}
          <div className="
  grid grid-cols-[60px_110px_90px_110px_90px_140px_140px_200px_140px_200px_140px_120px_90px_120px_120px_120px_110px_110px_120px_90px]
  bg-[#eef3fb]
  text-[16px] font-extrabold text-gray-800
  px-4 py-4
  text-center
">
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
<div>지급방식</div>
            <div>상태</div>
            <div>운송사</div>
            <div className="text-right">관리</div>
          </div>

          {/* ROW */}
          {rows.map((o, i) => {
            const st = STATUS[o.status || "요청"];
            return (
              <div
                key={o.id}
                className="
  grid grid-cols-[60px_110px_90px_110px_90px_140px_140px_200px_140px_200px_140px_120px_90px_120px_120px_120px_110px_110px_120px_90px]
  px-4 py-5
  border-t
  text-[16px] text-gray-800
  text-center
  items-center
  hover:bg-blue-50
  text-center [&>div]:flex [&>div]:justify-center [&>div]:items-center
"
              >
                <div>{i + 1}</div>
                <div className="text-gray-800">
  {o.상차일 || "-"}
</div>
                <div>{o.상차시간 || "-"}</div>
                <div>{o.하차일 || "-"}</div>
                <div>{o.하차시간 || "-"}</div>
                <div className="font-semibold text-gray-900 text-[17px]">
  {o.거래처명}</div>
                <div>{o.상차지명}</div>
<div className="text-sm text-gray-700 text-center break-words px-2">
  {o.상차지주소}
</div>
<div>{o.하차지명}</div>
<div className="text-sm text-gray-700 text-center break-words px-2">{o.하차지주소}</div>
                <div className="truncate">{o.화물내용 || "-"}</div>
                <div>{o.차량종류}</div>
                <div>{o.차량톤수}</div>
<div>{o.차량번호 || "-"}</div>
<div>{o.기사이름 || "-"}</div>
<div>{o.기사전화 || "-"}</div>
<div>{o.지급방식}</div>

<div>
  <span className={`px-3 py-1 rounded-full text-[14px] font-bold ${st.cls}`}>
    {st.label}
  </span>
</div>

{/* 🔥 여기 추가 */}
<div className="font-semibold text-gray-900">
  {o.운송사명 || "-"}
</div>

<div className="flex gap-3 justify-center text-[15px] font-semibold">
                  {o.status === "요청" && (
                    <>
                      <button
                        onClick={() => navigate(`/shipper/order?edit=${o.id}`)}
                        className="text-blue-600 hover:underline"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => cancelOrder(o.id)}
                        className="text-red-500 hover:underline"
                      >
                        취소
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
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