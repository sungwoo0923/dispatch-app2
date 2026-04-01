import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const getDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export default function TransportManagement() {
const [user, setUser] = useState(null);

useEffect(() => {
  const unsub = auth.onAuthStateChanged((u) => {
    setUser(u);
  });
  return () => unsub();
}, []);

  const [startDate, setStartDate] = useState(getDate(-1));
  const [endDate, setEndDate] = useState(getDate(0));
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [list, setList] = useState([]);

  const load = async () => {
   if (!user?.uid) return;

    const q = query(
      collection(db, "shipper_orders"),
      where("shipperUid", "==", user.uid)
    );

    const snap = await getDocs(q);
    let data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 날짜 필터
    data = data.filter(
      (d) => d.상차일 >= startDate && d.상차일 <= endDate
    );

    // 상태 필터
    if (status) {
      data = data.filter((d) => d.status === status);
    }

    // 검색 필터
    if (keyword) {
      data = data.filter(
        (d) =>
          d.상차지명?.includes(keyword) ||
          d.하차지명?.includes(keyword) ||
          d.차량종류?.includes(keyword)
      );
    }

    setList(data);
  };

  useEffect(() => {
    load();
  }, []);

  const totalAmount = list.reduce(
    (sum, d) => sum + Number(d.청구운임 || 0),
    0
  );

  return (
    <div className="flex gap-6 p-6 bg-gray-100 min-h-screen">

      {/* ================= 좌측 ================= */}
      <div className="flex-1 space-y-4">

        {/* KPI */}
        <div className="grid grid-cols-5 gap-4">
          <Kpi title="전체 운송" value={list.length} />
          <Kpi title="배차중" value={list.filter(x=>x.status==="요청").length} />
          <Kpi title="운송중" value={list.filter(x=>x.status==="운송중").length} />
          <Kpi title="완료" value={list.filter(x=>x.status==="완료").length} />
          <Kpi title="청구금액" value={`${totalAmount.toLocaleString()}원`} />
        </div>

        {/* 검색 */}
        <div className="bg-white p-4 rounded-xl border shadow-sm flex gap-3 items-center">
          <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="input"/>
          <span>~</span>
          <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="input"/>

          <input
            value={keyword}
            onChange={(e)=>setKeyword(e.target.value)}
            placeholder="오더번호, 차량, 기사 검색"
            className="input flex-1"
          />

          <select value={status} onChange={(e)=>setStatus(e.target.value)} className="input">
            <option value="">전체</option>
            <option value="요청">요청</option>
            <option value="운송중">운송중</option>
            <option value="완료">완료</option>
          </select>

          <button onClick={load} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">
            검색
          </button>
        </div>

        {/* 리스트 */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">

          <div className="grid grid-cols-8 bg-gray-50 px-4 py-3 text-xs text-gray-500">
            <div>상차일</div>
            <div>상차지</div>
            <div>하차지</div>
            <div>차량</div>
            <div>기사</div>
            <div>상태</div>
            <div className="text-right">청구금액</div>
          </div>

          {list.map((item) => (
            <div key={item.id} className="grid grid-cols-8 px-4 py-4 border-t text-sm hover:bg-indigo-50">
              <div>{item.상차일}</div>
              <div>{item.상차지명}</div>
              <div>{item.하차지명}</div>
              <div>{item.차량종류}</div>
              <div>{item.기사명 || "-"}</div>

              <div>
                <StatusBadge status={item.status} />
              </div>

              <div className="text-right font-semibold text-indigo-600">
                {Number(item.청구운임 || 0).toLocaleString()}원
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= 우측 패널 ================= */}
      <div className="w-72 bg-white border rounded-xl shadow-sm p-4">
        <div className="font-bold mb-3">최근 방문</div>

        <div className="space-y-2 text-sm">
          <PanelItem text="운송 목록" />
          <PanelItem text="배차 현황" />
          <PanelItem text="정산 관리" />
        </div>
      </div>

    </div>
  );
}

/* KPI */
function Kpi({ title, value }) {
  return (
    <div className="bg-white border rounded-xl p-4 shadow-sm">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

/* 상태 */
function StatusBadge({ status }) {
  const cls = {
    요청: "bg-yellow-100 text-yellow-700",
    운송중: "bg-blue-100 text-blue-700",
    완료: "bg-green-100 text-green-700",
  };

  return (
    <span className={`px-2 py-1 text-xs rounded ${cls[status] || "bg-gray-100"}`}>
      {status}
    </span>
  );
}

/* 우측 패널 */
function PanelItem({ text }) {
  return (
    <div className="p-2 border rounded hover:bg-gray-50 cursor-pointer">
      {text}
    </div>
  );
}