import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import { toMonthKey } from "../utils/dateUtils";

export default function Stats() {
  const { profile } = useAuth();
  const [month, setMonth] = useState(toMonthKey());
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubAtt = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", month)),
      (snap) => setAttendance(snap.docs.map((d) => d.data()))
    );
    const unsubLeaves = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")),
      (snap) => setLeaves(snap.docs.map((d) => d.data()))
    );
    return () => {
      unsubAtt();
      unsubLeaves();
    };
  }, [profile?.companyId, month]);

  const dailyData = useMemo(() => {
    const byDate = {};
    for (const a of attendance) {
      const day = a.date?.slice(8, 10);
      if (!day) continue;
      byDate[day] = byDate[day] || { day, 출근: 0, 자동: 0, 수동: 0 };
      byDate[day].출근 += 1;
      if (a.source === "auto") byDate[day].자동 += 1;
      else byDate[day].수동 += 1;
    }
    return Object.values(byDate).sort((a, b) => a.day.localeCompare(b.day));
  }, [attendance]);

  const leaveTypeCounts = useMemo(() => {
    const counts = {};
    for (const l of leaves) counts[l.type] = (counts[l.type] || 0) + 1;
    return counts;
  }, [leaves]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-ink">통계</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <Card className="p-5">
        <p className="mb-4 text-sm font-semibold text-ink">일별 출근 인원 ({month})</p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="자동" stackId="a" fill="#2563EB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="수동" stackId="a" fill="#93C5FD" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <p className="mb-3 text-sm font-semibold text-ink">휴가 유형별 사용 현황 (누적)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(leaveTypeCounts).length === 0 && <p className="text-xs text-muted">데이터가 없습니다.</p>}
          {Object.entries(leaveTypeCounts).map(([type, count]) => (
            <div key={type} className="rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-lg font-bold text-ink">{count}</p>
              <p className="text-[11px] text-muted">{type}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
