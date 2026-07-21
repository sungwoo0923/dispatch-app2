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

  const nowLabel = useMemo(() => {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 16).replace("T", " ");
  }, [orders]);

  return (
    <div className="space-y-5" style={{ fontFeatureSettings: '"tnum"' }}>

      {/* 상단 상태 바 */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-2 h-2 rounded-full bg-emerald-500" style={{ animation: "shipperHomePulse 1.6s ease-in-out infinite" }} />
        <span className="text-[12px] font-bold text-[#1B2B4B] tracking-wide">실시간 대시보드</span>
        <span className="text-[11px] text-gray-400">{nowLabel} 기준 갱신</span>
      </div>

      {/* KPI 링게이지 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <RingKpiCard
          label="전체 오더"
          value={kpi.전체}
          ring={kpi.전체 > 0 ? (kpi.전체 - kpi.취소) / kpi.전체 : 0}
          color="#3b82f6"
          sub={`취소 ${kpi.취소}건 포함`}
        />
        <RingKpiCard
          label="배차 대기"
          value={kpi.배차대기}
          ring={kpi.전체 > 0 ? kpi.배차대기 / kpi.전체 : 0}
          color="#f59e0b"
          sub="차량 미배정"
        />
        <RingKpiCard
          label="배차 완료"
          value={kpi.배차완료}
          ring={kpi.전체 > 0 ? kpi.배차완료 / kpi.전체 : 0}
          color="#10b981"
          sub="차량 배정됨"
        />
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">이번달 매출</span>
            <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            </span>
          </div>
          <div className="mt-2">
            <div className="text-[26px] font-black text-[#1B2B4B] leading-none">{(kpi.월매출 / 10000).toFixed(0)}<span className="text-[14px] font-bold text-gray-400 ml-0.5">만원</span></div>
            <div className="text-[11px] text-gray-400 mt-1.5">누적 {kpi.전체매출.toLocaleString()}원</div>
          </div>
        </div>
      </div>

      {/* 당일 현황 + 요일별 배차 추이 */}
      <div className="grid grid-cols-3 gap-4">

        {/* 당일 배차 현황 (도넛) */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">당일 배차 현황</span>
            <span className="text-[10px] text-gray-300">{today}</span>
          </div>
          <RingGauge
            value={kpi.당일완료}
            total={kpi.당일전체}
            size={128}
            stroke={12}
            color="#10b981"
            trackColor="#f1f5f9"
          />
          <div className="w-full grid grid-cols-2 gap-2 mt-4">
            <LegendDot color="#f59e0b" label="대기" value={kpi.당일대기} />
            <LegendDot color="#10b981" label="완료" value={kpi.당일완료} />
          </div>
        </div>

        {/* 요일별 배차 추이 */}
        <div className="col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">이번달 요일별 배차 추이</span>
            <span className="text-[10px] text-gray-300">Top {maxWd}건</span>
          </div>
          <div className="flex items-end justify-between gap-2 h-32 px-1">
            {weekdayData.map(({ day, count }) => {
              const h = Math.max((count / maxWd) * 96, count > 0 ? 6 : 2);
              const isWeekend = day === "일" || day === "토";
              return (
                <div key={day} className="flex flex-col items-center flex-1 gap-2">
                  {count > 0 && (
                    <div className="text-[11px] font-bold text-[#1B2B4B] bg-[#1B2B4B]/5 rounded-md px-1.5 py-0.5">{count}</div>
                  )}
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{ height: `${h}px`, background: isWeekend ? "#c7d2e0" : "#1B2B4B" }}
                    />
                  </div>
                  <div className={`text-[11px] font-semibold ${isWeekend ? "text-gray-400" : "text-gray-600"}`}>{day}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 당일 오더 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">당일 오더</span>
          <span className="text-[11px] text-gray-400">{today} · {recent.length}건</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {recent.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">등록된 오더가 없습니다</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-gray-400 text-[11px] font-bold uppercase tracking-wide">
                  <th className="px-5 py-2.5 text-left">상차일</th>
                  <th className="px-5 py-2.5 text-left">거래처</th>
                  <th className="px-5 py-2.5 text-left">상차지</th>
                  <th className="px-5 py-2.5 text-left">하차지</th>
                  <th className="px-5 py-2.5 text-right">청구운임</th>
                  <th className="px-5 py-2.5 text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => {
                  const st = getStatus(o);
                  return (
                    <tr key={o.id} className="border-t border-gray-50 hover:bg-slate-50/70 transition">
                      <td className="px-5 py-2.5 text-gray-500 whitespace-nowrap">{o.상차일 || "-"}</td>
                      <td className="px-5 py-2.5 font-semibold text-gray-800 truncate max-w-[100px]">{o.거래처명 || "-"}</td>
                      <td className="px-5 py-2.5 text-gray-600 truncate max-w-[100px]">{o.상차지명 || "-"}</td>
                      <td className="px-5 py-2.5 text-gray-600 truncate max-w-[100px]">{o.하차지명 || "-"}</td>
                      <td className="px-5 py-2.5 text-[#1B2B4B] font-bold whitespace-nowrap text-right">
                        {o.청구운임 ? Number(o.청구운임).toLocaleString() + "원" : "-"}
                      </td>
                      <td className="px-5 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @keyframes shipperHomePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
          50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(16,185,129,0); }
        }
      `}</style>
    </div>
  );
}

// 값/전체 비율을 도넛(링) 게이지로 표시 — 중앙에 값, 하단에 소제목을 함께 보여준다.
function RingGauge({ value, total, size = 88, stroke = 10, color = "#10b981", trackColor = "#e5e7eb" }) {
  const pct = total > 0 ? Math.min(value / total, 1) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[22px] font-black text-gray-800 leading-none">{value}</div>
        <div className="text-[10px] text-gray-400 mt-1">/ {total}건</div>
      </div>
    </div>
  );
}

// KPI 카드 — 작은 링게이지 + 값 + 보조텍스트. 색은 상태 의미(대기=amber/완료=emerald/전체=blue)를 그대로 따른다.
function RingKpiCard({ label, value, ring, color, sub }) {
  const size = 56;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.min(Math.max(ring, 0), 1);
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider truncate">{label}</div>
        <div className="text-[24px] font-black text-gray-800 leading-tight">{value}</div>
        <div className="text-[11px] text-gray-400">{sub}</div>
      </div>
    </div>
  );
}

function LegendDot({ color, label, value }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-gray-800 ml-auto">{value}건</span>
    </div>
  );
}
