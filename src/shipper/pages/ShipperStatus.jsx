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
  const kpi = useMemo(() => ({
    total: orders.length,
    요청: orders.filter((o) => o.status === "요청").length,
    배차중: orders.filter((o) => o.status === "배차중").length,
    배차완료: orders.filter((o) => o.status === "배차완료").length,
  }), [orders]);

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
    <div className="w-full px-8 py-6 bg-[#f4f7fb] min-h-screen space-y-6">

      {/* ================= KPI ================= */}
      <div className="grid grid-cols-4 gap-4">
        <KPI title="전체 오더" value={kpi.total} />
        <KPI title="요청" value={kpi.요청} />
        <KPI title="배차중" value={kpi.배차중} />
        <KPI title="배차완료" value={kpi.배차완료} />
      </div>

      {/* ================= 필터 ================= */}
      <div className="bg-white rounded-xl p-4 flex justify-between items-center shadow-sm">
        <div className="flex gap-2">
          {["전체", "요청", "배차중", "배차완료"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold
                ${filter === s
                  ? "bg-blue-600 text-white"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
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

      {/* ================= 테이블 ================= */}
      <div className="bg-white rounded-xl shadow-sm">

        {/* 헤더 */}
        <div className="grid grid-cols-[60px_110px_90px_110px_90px_140px_140px_140px_140px_120px_90px_110px_110px_140px]
                        bg-[#eef3fb] text-xs font-bold text-gray-600 px-4 py-3">
          <div>순번</div>
          <div>상차일</div>
          <div>상차시간</div>
          <div>하차일</div>
          <div>하차시간</div>
          <div>거래처</div>
          <div>상차지</div>
          <div>하차지</div>
          <div>화물</div>
          <div>차량</div>
          <div>톤수</div>
          <div>지급</div>
          <div>상태</div>
          <div className="text-right">관리</div>
        </div>

        {/* ROW */}
        {rows.map((o, i) => {
          const st = STATUS[o.status || "요청"];
          return (
            <div
              key={o.id}
              className="grid grid-cols-[60px_110px_90px_110px_90px_140px_140px_140px_140px_120px_90px_110px_110px_140px]
                         px-4 py-3 border-t text-sm hover:bg-blue-50"
            >
              <div>{i + 1}</div>
              <div>{o.상차일 || "-"}</div>
              <div>{o.상차시간 || "-"}</div>
              <div>{o.하차일 || "-"}</div>
              <div>{o.하차시간 || "-"}</div>
              <div className="font-semibold">{o.거래처명}</div>
              <div>{o.상차지명}</div>
              <div>{o.하차지명}</div>
              <div className="truncate">{o.화물내용 || "-"}</div>
              <div>{o.차량종류}</div>
              <div>{o.차량톤수}</div>
              <div>{o.지급방식}</div>

              <div>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${st.cls}`}>
                  {st.label}
                </span>
              </div>

              <div className="text-right space-x-3">
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
  );
}

/* ================= KPI ================= */
function KPI({ title, value }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="text-sm text-gray-400">{title}</div>
      <div className="text-3xl font-bold text-gray-900 mt-2">{value}</div>
    </div>
  );
}
