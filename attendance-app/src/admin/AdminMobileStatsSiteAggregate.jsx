import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useCompanyLookups, filterEmployees, daysInMonth } from "../utils/statsShared";
import { toMonthKey } from "../utils/dateUtils";

// 센터별집계의 모바일 전용 화면 — PC의 "그룹 × 31일" 표 대신, 센터/소속업체/
// 근무구분별 그룹을 카드로 두고 이번 달 합계를 바로 보여준다. 펼치면
// 일별 추이를 막대그래프로 표시해 가로 스크롤 없이 한눈에 파악할 수 있다.
export default function AdminMobileStatsSiteAggregate() {
  const { profile } = useAuth();
  const lookups = useCompanyLookups(profile?.companyId);
  const [siteId, setSiteId] = useState("");
  const [month, setMonth] = useState(toMonthKey());
  const [attendance, setAttendance] = useState([]);
  const [openKey, setOpenKey] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", month)),
      (snap) => setAttendance(snap.docs.map((d) => d.data()))
    );
    return () => unsub();
  }, [profile?.companyId, month]);

  const numDays = daysInMonth(month);
  const employeesById = useMemo(() => new Map(lookups.employees.map((e) => [e.id, e])), [lookups.employees]);
  const siteName_ = (id) => lookups.workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => lookups.vendors.find((v) => v.id === id)?.name || "-";

  const groups = useMemo(() => {
    const filteredEmployees = filterEmployees(lookups.employees, { siteId });
    const filteredIds = new Set(filteredEmployees.map((e) => e.id));
    const byKey = new Map();
    for (const emp of filteredEmployees) {
      const key = `${emp.workSiteId || ""}_${emp.vendorId || ""}_${emp.shiftType || ""}`;
      if (!byKey.has(key)) {
        byKey.set(key, { key, siteId: emp.workSiteId, vendorId: emp.vendorId, shiftType: emp.shiftType, counts: Array(numDays).fill(0) });
      }
    }
    for (const a of attendance) {
      if (!filteredIds.has(a.uid) || a.status !== "출근") continue;
      const emp = employeesById.get(a.uid);
      if (!emp) continue;
      const key = `${emp.workSiteId || ""}_${emp.vendorId || ""}_${emp.shiftType || ""}`;
      const g = byKey.get(key);
      if (!g) continue;
      const day = Number(a.date.slice(8, 10));
      if (day >= 1 && day <= numDays) g.counts[day - 1] += 1;
    }
    return [...byKey.values()].sort((a, b) => siteName_(a.siteId).localeCompare(siteName_(b.siteId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups.employees, siteId, attendance, employeesById, numDays]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">센터별집계</p>
        <p className="mt-0.5 text-xs text-muted">그룹을 눌러 일별 출근 추이를 확인하세요</p>
      </div>

      <div className="flex items-center gap-2">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm" />
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="">전체 센터</option>
          {lookups.workSites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {groups.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">조건에 맞는 데이터가 없습니다.</div>}
        {groups.map((g) => {
          const isOpen = openKey === g.key;
          const total = g.counts.reduce((a, b) => a + b, 0);
          const chartData = g.counts.map((c, i) => ({ day: String(i + 1), 출근: c }));
          return (
            <div key={g.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button type="button" onClick={() => setOpenKey(isOpen ? null : g.key)} className="flex w-full items-center gap-3 p-3.5 text-left active:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{siteName_(g.siteId)}</p>
                  <p className="truncate text-xs text-muted">{vendorName_(g.vendorId)} · {g.shiftType || "-"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted">이번 달 합계</p>
                  <p className="text-sm font-bold text-primary">{total}</p>
                </div>
                <ChevronDown size={16} className={`shrink-0 text-slate-300 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 p-3.5">
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={2} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={20} />
                        <Tooltip />
                        <Bar dataKey="출근" fill="#2563EB" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
