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

const formatPhoneDisplay = (v) => {
  const d = String(v || "").replace(/[^0-9]/g, "");
  if (!d) return "-";
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return v;
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

  // 운송목록(ShipperStatus.jsx)과 동일한 상태 판정/색상 규칙을 그대로 따른다.
  const getStatus = (o) => {
    if (["취소", "배차취소", "오더취소", "취소됨"].includes(o.상태)) return { label: "취소", cls: "bg-[#E9EDF3] text-[#7A89A3]" };
    if (o.차량번호 && o.차량번호.trim()) return { label: "배차완료", cls: "bg-[#1B2B4B] text-white" };
    if (o.화주사확인대기 === true) return { label: "요청", cls: "bg-white text-[#1B2B4B] ring-1 ring-inset ring-[#8FB0F0]" };
    return { label: "배차중", cls: "bg-[#DCE6F7] text-[#1B2B4B]" };
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

  // ⭐ 2026-10-29 리디자인 — 운송사 PC 홈과 같은 네이비 디지털 대시보드(알록달록한 링 대신 남색 단계)
  const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const tiles = [
    { label: "전체 오더", en: "ORDERS", value: kpi.전체, unit: "건", sub: `취소 ${kpi.취소}건 별도`, bar: 100, dark: true },
    { label: "배차 대기", en: "WAITING", value: kpi.배차대기, unit: "건", sub: `전체의 ${pct(kpi.배차대기, kpi.전체)}% · 차량 미배정`, bar: pct(kpi.배차대기, kpi.전체) },
    { label: "배차 완료", en: "ASSIGNED", value: kpi.배차완료, unit: "건", sub: `전체의 ${pct(kpi.배차완료, kpi.전체)}% · 차량 배정됨`, bar: pct(kpi.배차완료, kpi.전체) },
    { label: "이번 달 운송료", en: "MONTH", value: Math.round(kpi.월매출 / 10000).toLocaleString(), unit: "만원", sub: `누적 ${kpi.전체매출.toLocaleString()}원`, bar: null },
  ];
  const todayPct = pct(kpi.당일완료, kpi.당일전체);

  return (
    <div className="space-y-4" style={{ fontFeatureSettings: '"tnum"' }}>

      {/* KPI 타일 */}
      <div className="grid grid-cols-4 gap-4">
        {tiles.map((t) => (
          <div key={t.en}
            className={`relative overflow-hidden rounded-[20px] px-5 py-4 border ${t.dark ? "border-transparent text-white shadow-[0_14px_30px_rgba(15,26,48,0.28)]" : "bg-white border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]"}`}
            style={t.dark ? { background: "linear-gradient(135deg,#0F1A30 0%,#1B2B4B 55%,#2D4C82 100%)" } : undefined}>
            {t.dark && <span className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "16px 16px" }} />}
            <div className="relative flex items-center justify-between">
              <span className={`text-[13px] font-bold ${t.dark ? "text-white/85" : "text-[#3A4A66]"}`}>{t.label}</span>
              <span className={`text-[9.5px] font-extrabold tracking-[0.22em] ${t.dark ? "text-[#8FB0F0]" : "text-[#9AA9C3]"}`} style={{ fontFamily: MONO }}>{t.en}</span>
            </div>
            <div className="relative mt-2 flex items-baseline gap-1">
              <span className={`text-[30px] font-black leading-none ${t.dark ? "text-white" : "text-[#0F1A30]"}`} style={{ fontFamily: MONO }}>{t.value}</span>
              <span className={`text-[13px] font-bold ${t.dark ? "text-white/60" : "text-[#7A89A3]"}`}>{t.unit}</span>
            </div>
            <div className={`relative text-[11.5px] mt-1.5 ${t.dark ? "text-white/55" : "text-[#7A89A3]"}`}>{t.sub}</div>
            {t.bar != null && (
              <div className={`relative h-1 rounded-full mt-3 overflow-hidden ${t.dark ? "bg-white/15" : "bg-[#EEF2F8]"}`}>
                <div className={`h-full rounded-full ${t.dark ? "bg-[#8FB0F0]" : "bg-[#1B2B4B]"}`} style={{ width: `${t.bar}%`, transition: "width .6s ease" }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 당일 현황 + 요일별 배차 추이 */}
      <div className="grid grid-cols-3 gap-4">

        {/* 당일 배차 현황 */}
        <div className="relative overflow-hidden rounded-[20px] p-5 text-white" style={{ background: "radial-gradient(90% 90% at 30% 0%, #22396A 0%, #0F1A30 60%, #0B1428 100%)" }}>
          <span className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "22px 22px" }} />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>TODAY</div>
              <div className="text-[15px] font-black">당일 배차 현황</div>
            </div>
            <span className="text-[11px] text-white/45" style={{ fontFamily: MONO }}>{today}</span>
          </div>
          <div className="relative flex items-center gap-5 mt-4">
            <RingGauge value={kpi.당일완료} total={kpi.당일전체} size={124} stroke={11} color="#8FB0F0" trackColor="rgba(255,255,255,0.10)" />
            <div className="flex-1 space-y-2.5">
              {[["전체", kpi.당일전체, "bg-white/10"], ["대기", kpi.당일대기, "bg-white/[0.06] ring-1 ring-white/15"], ["완료", kpi.당일완료, "bg-[#8FB0F0]/25"]].map(([l, v, cls]) => (
                <div key={l} className={`flex items-center justify-between rounded-xl px-3 h-10 ${cls}`}>
                  <span className="text-[12.5px] font-bold text-white/75">{l}</span>
                  <span className="text-[16px] font-black" style={{ fontFamily: MONO }}>{v}<span className="text-[11px] text-white/50 ml-0.5">건</span></span>
                </div>
              ))}
              <div className="text-[11px] text-white/50 text-right" style={{ fontFamily: MONO }}>완료율 {todayPct}%</div>
            </div>
          </div>
        </div>

        {/* 요일별 배차 추이 */}
        <div className="col-span-2 bg-white rounded-[20px] p-5 border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
              <span className="text-[10px] font-extrabold tracking-[0.22em] text-[#9AA9C3]" style={{ fontFamily: MONO }}>WEEKDAY</span>
              <span className="text-[15px] font-black text-[#0F1A30]">이번 달 요일별 배차</span>
            </div>
            <span className="text-[11px] text-[#9AA9C3]" style={{ fontFamily: MONO }}>MAX {maxWd}건</span>
          </div>
          <div className="flex items-end justify-between gap-3 h-36 px-1">
            {weekdayData.map(({ day, count }) => {
              const h = Math.max((count / maxWd) * 84, count > 0 ? 6 : 2);
              const isWeekend = day === "일" || day === "토";
              const isMax = count === maxWd && count > 0;
              return (
                <div key={day} className="flex flex-col items-center flex-1 gap-2 h-full">
                  <div className="w-full flex-1 flex flex-col justify-end items-center gap-1.5">
                    {count > 0 && <div className="text-[11.5px] font-black text-[#1B2B4B]" style={{ fontFamily: MONO }}>{count}</div>}
                    <div className="w-full max-w-[56px] rounded-t-lg transition-all"
                      style={{ height: `${h}px`, background: isMax ? "linear-gradient(180deg,#2D4C82,#0F1A30)" : isWeekend ? "#DCE3EF" : "#9FB5DD" }} />
                  </div>
                  <div className={`text-[12px] font-bold ${isWeekend ? "text-[#9AA9C3]" : "text-[#3A4A66]"}`}>{day}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 당일 오더 */}
      <div className="bg-white rounded-[20px] border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_rgba(16,24,40,0.06)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#EEF1F6] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rotate-45 bg-[#1B2B4B]" />
            <span className="text-[10px] font-extrabold tracking-[0.22em] text-[#9AA9C3]" style={{ fontFamily: MONO }}>TODAY ORDERS</span>
            <span className="text-[15px] font-black text-[#0F1A30]">당일 오더</span>
          </div>
          <span className="text-[11.5px] text-[#7A89A3]" style={{ fontFamily: MONO }}>{today} · {recent.length}건</span>
        </div>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-36 text-[#9AA9C3]">
            <div className="text-[14px] font-bold text-[#5B6B85]">오늘 상차 예정 오더가 없습니다</div>
            <div className="text-[12px] mt-1">운송 › 일반배차등록에서 새 오더를 요청할 수 있습니다</div>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#F5F8FD] text-[#5B6B85] text-[12px] font-extrabold">
                {["상차일", "거래처", "상차지", "하차지", "차량번호", "기사명", "연락처", "청구운임", "상태"].map((h) => <th key={h} className="px-3 py-2.5 text-center">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => {
                const st = getStatus(o);
                return (
                  <tr key={o.id} className="border-t border-[#EEF1F6] hover:bg-[#F5F8FD] transition">
                    <td className="px-3 py-2.5 text-center text-[#5B6B85] whitespace-nowrap" style={{ fontFamily: MONO }}>{o.상차일 || "-"}</td>
                    <td className="px-3 py-2.5 text-center font-bold text-[#0F1A30] truncate max-w-[120px]">{o.거래처명 || "-"}</td>
                    <td className="px-3 py-2.5 text-center text-[#3A4A66] truncate max-w-[120px]">{o.상차지명 || "-"}</td>
                    <td className="px-3 py-2.5 text-center text-[#3A4A66] truncate max-w-[120px]">{o.하차지명 || "-"}</td>
                    <td className="px-3 py-2.5 text-center text-[#0F1A30] font-bold whitespace-nowrap">{o.차량번호 || "-"}</td>
                    <td className="px-3 py-2.5 text-center text-[#3A4A66] whitespace-nowrap">{o.이름 || "-"}</td>
                    <td className="px-3 py-2.5 text-center text-[#5B6B85] whitespace-nowrap" style={{ fontFamily: MONO }}>{formatPhoneDisplay(o.전화번호)}</td>
                    <td className="px-3 py-2.5 text-center text-[#0F1A30] font-black whitespace-nowrap" style={{ fontFamily: MONO }}>
                      {o.청구운임 ? Number(o.청구운임).toLocaleString() + "원" : "-"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// 값/전체 비율을 도넛(링) 게이지로 표시 — 중앙에 값을 보여준다.
function RingGauge({ value, total, size = 88, stroke = 10, color = "#8FB0F0", trackColor = "#E3E8F0" }) {
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
        <div className="text-[26px] font-black text-white leading-none" style={{ fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace" }}>{value}</div>
        <div className="text-[10.5px] text-white/50 mt-1">/ {total}건 완료</div>
      </div>
    </div>
  );
}
