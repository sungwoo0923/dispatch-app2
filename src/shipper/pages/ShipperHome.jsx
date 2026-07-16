import { useState, useEffect, useMemo } from "react";
import { db, auth } from "../../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";

const getTodayKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const getMonthStart = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 7) + "-01";
};

export default function ShipperHome() {
  const [orders, setOrders] = useState([]);
  const [userData, setUserData] = useState(null);
  const user = auth.currentUser;
  const today = getTodayKST();
  const monthStart = getMonthStart();

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, [user]);

  useEffect(() => {
    if (!user || !userData) return;
    const isMaster = userData?.permissions?.master === true || userData?.isMaster === true;
    const isSubMaster = userData?.permissions?.subMaster === true;
    let q;
    if (isMaster || isSubMaster) {
      q = query(collection(db, "orders"), where("shipperCompany", "==", userData.companyName));
    } else {
      q = query(collection(db, "orders"), where("shipperUid", "==", user.uid));
    }
    const unsub = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user, userData]);

  const toYMD = (d) => {
    if (!d) return "";
    if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  };

  const todayOrders = useMemo(() => orders.filter(o => toYMD(o.상차일) === today), [orders, today]);
  const monthOrders = useMemo(() => orders.filter(o => toYMD(o.상차일) >= monthStart), [orders, monthStart]);

  const kpi = useMemo(() => {
    const active = orders.filter(o => o.상태 !== "취소");
    const todayActive = todayOrders.filter(o => o.상태 !== "취소");
    return {
      전체: active.length,
      배차대기: active.filter(o => !o.차량번호).length,
      배차완료: active.filter(o => o.차량번호).length,
      취소: orders.filter(o => o.상태 === "취소").length,
      당일전체: todayActive.length,
      당일대기: todayActive.filter(o => !o.차량번호).length,
      당일완료: todayActive.filter(o => o.차량번호).length,
      월매출: monthOrders.reduce((s, o) => s + (Number(o.청구운임) || 0), 0),
      전체매출: active.reduce((s, o) => s + (Number(o.청구운임) || 0), 0),
    };
  }, [orders, todayOrders, monthOrders]);

  const recent = useMemo(() => {
    return [...todayOrders].sort((a, b) => {
      const ta = a.createdAt?.toDate?.() ?? new Date(a.createdAt || 0);
      const tb = b.createdAt?.toDate?.() ?? new Date(b.createdAt || 0);
      return tb - ta;
    });
  }, [todayOrders]);

  const getStatus = (o) => {
    if (["취소", "배차취소", "오더취소"].includes(o.상태)) return { label: "취소", cls: "bg-rose-100 text-rose-800" };
    if (o.차량번호) return { label: "배차완료", cls: "bg-emerald-100 text-emerald-800" };
    return { label: "요청", cls: "bg-slate-100 text-slate-700" };
  };

  // 이번 달 요일별 건수
  const weekdayData = useMemo(() => {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    monthOrders.forEach(o => {
      const d = toYMD(o.상차일);
      if (d) { const wd = new Date(d).getDay(); cnt[wd]++; }
    });
    return days.map((d, i) => ({ day: d, count: cnt[i] }));
  }, [monthOrders]);

  const maxWd = Math.max(...weekdayData.map(d => d.count), 1);

  return (
    <div className="space-y-6">

      {/* KPI 상단 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard title="전체 오더" value={kpi.전체} sub={`취소 ${kpi.취소}건 포함`} color="border-blue-200" />
        <KpiCard title="배차 대기" value={kpi.배차대기} sub="차량 미배정" color="border-amber-200" valueColor="text-amber-600" />
        <KpiCard title="배차 완료" value={kpi.배차완료} sub="차량 배정됨" color="border-emerald-200" valueColor="text-emerald-600" />
        <KpiCard title="이번달 매출" value={`${(kpi.월매출 / 10000).toFixed(0)}만원`} sub={`총 ${kpi.전체매출.toLocaleString()}원`} color="border-indigo-200" valueColor="text-indigo-600" />
      </div>

      {/* 당일 현황 + 최근 오더 */}
      <div className="grid grid-cols-3 gap-4">

        {/* 당일 현황 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="font-bold text-gray-800 mb-4">당일 현황 ({today})</div>
          <div className="space-y-3">
            <StatRow label="당일 전체" value={kpi.당일전체} total={kpi.당일전체} color="bg-blue-500" />
            <StatRow label="배차 대기" value={kpi.당일대기} total={kpi.당일전체} color="bg-amber-400" />
            <StatRow label="배차 완료" value={kpi.당일완료} total={kpi.당일전체} color="bg-emerald-500" />
          </div>

          <div className="mt-6 pt-4 border-t">
            <div className="font-bold text-gray-700 mb-3 text-sm">이번달 요일별 배차</div>
            <div className="flex items-end gap-1.5 h-24">
              {weekdayData.map(({ day, count }) => (
                <div key={day} className="flex flex-col items-center flex-1 gap-1">
                  <div className="text-[10px] text-gray-500 font-semibold">{count || ""}</div>
                  <div
                    className="w-full rounded-t bg-blue-400 transition-all"
                    style={{ height: `${Math.max((count / maxWd) * 72, count > 0 ? 4 : 0)}px` }}
                  />
                  <div className="text-[11px] text-gray-500">{day}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 최근 오더 (나머지 2칸 차지) */}
        <div className="col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <div className="px-5 py-4 border-b font-bold text-gray-800">당일 오더 ({today})</div>
          <div className="flex-1 overflow-y-auto">
            {recent.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">등록된 오더가 없습니다</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs font-semibold">
                    <th className="px-4 py-2.5 text-left">상차일</th>
                    <th className="px-4 py-2.5 text-left">거래처</th>
                    <th className="px-4 py-2.5 text-left">상차지</th>
                    <th className="px-4 py-2.5 text-left">하차지</th>
                    <th className="px-4 py-2.5 text-left">청구운임</th>
                    <th className="px-4 py-2.5 text-left">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => {
                    const st = getStatus(o);
                    return (
                      <tr key={o.id} className="border-t hover:bg-gray-50 transition">
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{o.상차일 || "-"}</td>
                        <td className="px-4 py-2.5 font-semibold text-gray-900 truncate max-w-[100px]">{o.거래처명 || "-"}</td>
                        <td className="px-4 py-2.5 text-gray-600 truncate max-w-[100px]">{o.상차지명 || "-"}</td>
                        <td className="px-4 py-2.5 text-gray-600 truncate max-w-[100px]">{o.하차지명 || "-"}</td>
                        <td className="px-4 py-2.5 text-blue-600 font-semibold whitespace-nowrap">
                          {o.청구운임 ? Number(o.청구운임).toLocaleString() + "원" : "-"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

function KpiCard({ title, value, sub, color = "border-gray-200", valueColor = "text-gray-900" }) {
  return (
    <div className={`bg-white rounded-xl p-5 shadow-sm border-l-4 ${color}`}>
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className={`text-3xl font-bold ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function StatRow({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-bold text-gray-800">{value}건</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
