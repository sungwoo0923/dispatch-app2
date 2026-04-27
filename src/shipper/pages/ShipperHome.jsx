import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";
export default function ShipperHome() {
  const [tab, setTab] = useState("dashboard");

  const [orders, setOrders] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
const [userData, setUserData] = useState(null);
  const user = auth.currentUser;
/* ================= 유저 정보 로드 ================= */
useEffect(() => {
  if (!user) return;

  getDoc(doc(db, "users", user.uid)).then((snap) => {
    if (snap.exists()) {
      setUserData(snap.data());
    }
  });
}, [user]);

/* ================= 오더 로드 ================= */
useEffect(() => {
  if (!user || !userData) return;

  const q = query(
    collection(db, "orders"),
    where("shipperCompany", "==", userData.company)
  );

  const unsub = onSnapshot(q, (snap) => {
    setOrders(snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    })));
  });

  return () => unsub();
}, [user, userData]);

  /* ================= 상태 계산 ================= */
  const getStatus = (o) => {
    if (o.차량번호) return "배차완료";
    return "요청";
  };

  /* ================= KPI ================= */
  const kpi = useMemo(() => ({
    total: orders.length,
    배차중: orders.filter(o => !o.차량번호).length,
    운송중: orders.filter(o => o.상태 === "운송중").length,
    운송완료: orders.filter(o => o.상태 === "완료" || o.차량번호).length,
  }), [orders]);
const toYMD = (d) => {
  if (!d) return "";
  if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};
  /* ================= 필터 ================= */
  const rows = useMemo(() => {
    return orders.filter(o => {
const orderDate = toYMD(o.상차일);

// 🔥 핵심: 값 있을 때만 비교
if (startDate && orderDate && orderDate < startDate) return false;
if (endDate && orderDate && orderDate > endDate) return false;

      if (statusFilter && getStatus(o) !== statusFilter) return false;

      if (keyword) {
        const v = keyword.toLowerCase();
        return (
          o.거래처명?.toLowerCase().includes(v) ||
          o.차량번호?.toLowerCase().includes(v) ||
          o.이름?.toLowerCase().includes(v)
        );
      }

      return true;
    });
  }, [orders, startDate, endDate, keyword, statusFilter]);

  return (
    <div className="flex gap-6">

      {/* ================= 좌측 ================= */}
      <div className="flex-1 space-y-4">

        {/* 탭 */}
        <div className="flex gap-6 border-b pb-2 text-sm font-semibold">
          <button
            onClick={() => setTab("dashboard")}
            className={`pb-2 ${
              tab === "dashboard"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-400"
            }`}
          >
            대시보드
          </button>

          <button
            onClick={() => setTab("report")}
            className={`pb-2 ${
              tab === "report"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-400"
            }`}
          >
            보고서
          </button>
        </div>

        <div className="text-lg font-bold">실시간 운송정보</div>

        {/* KPI */}
        <div className="grid grid-cols-6 gap-4">
          <Kpi title="전체 운송 건수" value={kpi.total} />
          <Kpi title="배차중" value={kpi.배차중} color="text-gray-700" />
          <Kpi title="운송중" value={kpi.운송중} color="text-blue-600" />
          <Kpi title="운송완료" value={kpi.운송완료} color="text-green-600" />
          <Kpi title="예외상황" value="0" color="text-red-500" />
          <Kpi title="CS 문의" value="0" color="text-orange-500" />
        </div>

        {/* 🔥 핵심: 좌우 분할 */}
        <div className="flex gap-4">

          {/* 지도 */}
          <div className="w-[62%] bg-white rounded-lg border border-gray-100 h-[450px] shadow-sm flex flex-col items-center justify-center text-gray-400 text-sm">
            <div className="text-lg mb-2"></div>
            <div className="font-medium">지도 기능 준비중입니다</div>
            <div className="text-xs mt-1">곧 업데이트 예정</div>
          </div>

          {/* ================= 우측 패널 ================= */}
          <div className="w-[38%] bg-white rounded-lg border border-gray-100 shadow-sm flex flex-col">

            {/* 🔥 검색 영역 */}
            <div className="p-3 border-b">

              <div className="flex justify-between items-center mb-2 text-sm text-gray-500">
                <div>총 {rows.length} 건</div>

                {/* 🔥 날짜 필터 추가 */}
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e)=>setStartDate(e.target.value)}
                    className="border rounded px-2 py-1 text-xs"
                  />
                  <span>~</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e)=>setEndDate(e.target.value)}
                    className="border rounded px-2 py-1 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">

                <div className="flex items-center border border-gray-300 rounded-md px-3 h-9 flex-1 bg-white">
                  <span className="text-gray-400 text-sm mr-2">🔍</span>
                  <input
                    value={keyword}
                    onChange={(e)=>setKeyword(e.target.value)}
                    placeholder="오더번호, 차량, 기사 검색"
                    className="flex-1 text-sm outline-none bg-transparent"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e)=>setStatusFilter(e.target.value)}
                  className="border border-gray-300 rounded-md h-9 px-3 text-sm bg-white"
                >
                  <option value="">운송상태</option>
                  <option value="요청">요청</option>
                  <option value="배차완료">배차완료</option>
                </select>

                <button className="h-9 px-4 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600">
                  검색
                </button>

              </div>
            </div>

            {/* 🔥 실시간 배차현황 */}
<div className="flex-1 flex flex-col">

  {/* 🔥 타이틀 */}
  <div className="px-3 py-2 border-b font-semibold text-sm bg-gray-50">
    실시간 배차현황
  </div>

  {/* 🔥 컬럼 헤더 */}
  <div className="grid grid-cols-[120px_1fr_1fr_1fr_100px] text-[13px] font-bold text-blue-900 px-3 py-3 border-b bg-blue-50 text-center">
    <div>상차일</div>
    <div>운송사</div>
    <div>상차지</div>
    <div>하차지</div>
    <div className="text-right">상태</div>
  </div>

  {/* 🔥 데이터 영역 */}
  <div className="flex-1 overflow-hidden relative">

    {rows.length === 0 ? (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        검색된 내역이 없습니다.
      </div>
    ) : (
      <div className="absolute inset-0 overflow-hidden">
        <div className="animate-scrollUp">

          {rows.map((o, idx) => {
            const status = getStatus(o);

            return (
              <div
                key={idx}
                className="grid grid-cols-[120px_1fr_1fr_1fr_100px] text-[13px] px-3 py-3 border-b items-center hover:bg-gray-50 transition"
              >
                {/* 상차일 */}
                <div className="font-semibold text-gray-800">
                  {o.상차일 || "-"}
                </div>

                {/* 운송사 */}
                <div className="font-medium truncate">
                  {o.거래처명}
                </div>

                {/* 상차지 */}
                <div className="text-gray-1000 truncate">
                  {o.상차지명}
                </div>

                {/* 하차지 */}
                <div className="text-gray-1000 truncate">
                  {o.하차지명}
                </div>

                {/* 상태 */}
                <div className="text-right">
<span
  className={`px-2 py-1 rounded-full text-[12px] font-semibold
    ${
      status === "배차완료"
        ? "bg-green-500 text-white"
        : "bg-blue-500 text-white"
    }`}
>
  {status}
</span>
                </div>
              </div>
            );
          })}

        </div>
      </div>
    )}
  </div>
</div>

          </div>

        </div>

      </div>

      {/* ================= 오른쪽 사이드 ================= */}
      <div className="w-72 bg-white rounded-lg border border-gray-100 p-4 shadow-sm">
        <div className="font-bold mb-3">최근 방문 내역</div>

        <div className="space-y-2 text-sm">
          <PanelItem title="운송" sub="일반 배차등록" />
          <PanelItem title="운송" sub="운송목록" />
          <PanelItem title="마스터설정" sub="설정" />
          <PanelItem title="운송" sub="대량 배차등록" />
          <PanelItem title="정산" sub="운송사정산" />
        </div>
      </div>

    </div>
  );
}

/* KPI */
function Kpi({ title, value, color = "text-gray-800" }) {
  return (
    <div className="bg-white rounded-lg px-5 py-4 shadow-sm border border-gray-100">
      <div className="text-[11px] text-gray-400 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

/* 우측 패널 */
function PanelItem({ title, sub }) {
  return (
    <div className="p-3 border border-gray-100 rounded hover:bg-gray-50 cursor-pointer flex justify-between">
      <div>
        <div className="text-xs text-gray-400">{title}</div>
        <div>{sub}</div>
      </div>
      <div>›</div>
    </div>
  );
}