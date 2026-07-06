import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { CalendarDays, BarChart2, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";

function buildRows(period, yearMonth, employees, vendors, workSites, leaves) {
  const [year, month] = yearMonth.split("-").map(Number);
  const cols = period === "month" ? Array.from({ length: 31 }, (_, i) => i + 1) : Array.from({ length: 12 }, (_, i) => i + 1);
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const rows = employees.map((e) => {
    const perCol = Object.fromEntries(cols.map((c) => [c, 0]));
    for (const lv of leaves.filter((l) => l.uid === e.id)) {
      const d = new Date(`${lv.startDate}T00:00:00`);
      if (period === "month") {
        if (d.getFullYear() === year && d.getMonth() + 1 === month) perCol[d.getDate()] = (perCol[d.getDate()] || 0) + (lv.days || 1);
      } else {
        if (d.getFullYear() === year) perCol[d.getMonth() + 1] = (perCol[d.getMonth() + 1] || 0) + (lv.days || 1);
      }
    }
    const total = Object.values(perCol).reduce((a, b) => a + b, 0);
    return { emp: e, perCol, total };
  });

  return { cols, rows: rows.filter((r) => r.total > 0), vendorName_, siteName_ };
}

export function LeaveMonthlyStats() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [yearMonth, setYearMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const { cols, rows } = useMemo(() => buildRows("month", yearMonth, employees, vendors, workSites, leaves), [yearMonth, employees, vendors, workSites, leaves]);

  const exportCsv = () => {
    const headers = ["소속업체", "이름", "전화번호", ...cols.map((c) => `${c}일`)];
    downloadCsv("근로자별월간집계", headers, rows.map((r) => [vendors.find((v) => v.id === r.emp.vendorId)?.name || "-", r.emp.name, r.emp.phone || "-", ...cols.map((c) => r.perCol[c] || "")]));
  };

  return (
    <div className="space-y-6">
      <Panel icon={CalendarDays} title="근로자별월간집계">
        <p className="mb-4 text-xs text-muted">사업자의 검색 조건 별로 월 단위로 휴가 사용한 일 수를 전체적으로 볼수 있으며 유급 휴가에 대해서 통계 집계를 조회 할 수 있습니다. 유급,무급 휴가에 대해서는 색깔별로 나타납니다.</p>
        <Card className="mb-4 flex flex-nowrap items-end justify-between gap-3 overflow-x-auto p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">출길년월</span>
            <input type="month" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
          </label>
          <div className="flex flex-nowrap items-center gap-3 overflow-x-auto text-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" /> 유급중무
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> 무급중무
            </span>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet size={13} /> 엑셀
            </Button>
          </div>
        </Card>
        <p className="mb-2 text-xs font-medium text-muted">목록 {rows.length}</p>
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[1100px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-3 font-semibold">소속업체</th>
                <th className="px-3 py-3 font-semibold">이름</th>
                <th className="px-3 py-3 font-semibold">전화번호</th>
                {cols.map((c) => (
                  <th key={c} className="px-2 py-3 text-center font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.emp.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2 text-muted">{vendors.find((v) => v.id === r.emp.vendorId)?.name || "-"}</td>
                  <td className="px-3 py-2 text-ink">{r.emp.name}</td>
                  <td className="px-3 py-2 text-muted">{r.emp.phone || "-"}</td>
                  {cols.map((c) => (
                    <td key={c} className="px-2 py-2 text-center text-muted">
                      {r.perCol[c] || ""}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3 + cols.length} className="px-3 py-6 text-center text-xs text-muted">
                    해당 월에 사용된 휴가가 없습니다.
                  </td>
                </tr>
              )}
              {rows.length > 0 && (
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2 text-ink" colSpan={3}>
                    [소계]
                  </td>
                  {cols.map((c) => (
                    <td key={c} className="px-2 py-2 text-center text-ink">
                      {rows.reduce((sum, r) => sum + (r.perCol[c] || 0), 0) || ""}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function LeaveAnnualStats() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [year, setYear] = useState(() => String(new Date().getFullYear()));

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const { cols, rows } = useMemo(() => buildRows("year", `${year}-01`, employees, vendors, workSites, leaves), [year, employees, vendors, workSites, leaves]);

  const exportCsv = () => {
    const headers = ["사업자", "센터", "소속업체", "이름", "전화번호", ...cols.map((c) => `${c}월`)];
    downloadCsv("근로자별연간집계", headers, rows.map((r) => ["-", workSites.find((s) => s.id === r.emp.workSiteId)?.name || "-", vendors.find((v) => v.id === r.emp.vendorId)?.name || "-", r.emp.name, r.emp.phone || "-", ...cols.map((c) => r.perCol[c] || "")]));
  };

  return (
    <div className="space-y-6">
      <Panel icon={BarChart2} title="근로자별연간집계">
        <p className="mb-4 text-xs text-muted">사업자의 검색 조건 별로 연 단위로 휴가 사용한 일 수를 전체적으로 볼수 있으며 유급 일수로 통계 집계를 조회할 수 있습니다.</p>
        <Card className="mb-4 flex flex-nowrap items-end justify-between gap-3 overflow-x-auto p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">출근년도</span>
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={year} onChange={(e) => setYear(e.target.value)}>
              {[year - 1, year, Number(year) + 1].map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileSpreadsheet size={13} /> 엑셀
          </Button>
        </Card>
        <p className="mb-2 text-xs font-medium text-muted">목록 {rows.length}</p>
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[900px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-3 font-semibold">사업자</th>
                <th className="px-3 py-3 font-semibold">센터</th>
                <th className="px-3 py-3 font-semibold">소속업체</th>
                <th className="px-3 py-3 font-semibold">이름</th>
                <th className="px-3 py-3 font-semibold">전화번호</th>
                {cols.map((c) => (
                  <th key={c} className="px-2 py-3 text-center font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.emp.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-2 text-muted">-</td>
                  <td className="px-3 py-2 text-muted">{workSites.find((s) => s.id === r.emp.workSiteId)?.name || "-"}</td>
                  <td className="px-3 py-2 text-muted">{vendors.find((v) => v.id === r.emp.vendorId)?.name || "-"}</td>
                  <td className="px-3 py-2 text-ink">{r.emp.name}</td>
                  <td className="px-3 py-2 text-muted">{r.emp.phone || "-"}</td>
                  {cols.map((c) => (
                    <td key={c} className="px-2 py-2 text-center text-muted">
                      {r.perCol[c] || ""}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5 + cols.length} className="px-3 py-6 text-center text-xs text-muted">
                    해당 연도에 사용된 휴가가 없습니다.
                  </td>
                </tr>
              )}
              {rows.length > 0 && (
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2 text-ink" colSpan={5}>
                    [소계]
                  </td>
                  {cols.map((c) => (
                    <td key={c} className="px-2 py-2 text-center text-ink">
                      {rows.reduce((sum, r) => sum + (r.perCol[c] || 0), 0) || ""}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
