import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { UserCog } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Panel from "../components/Panel";
import { EMPLOYMENT_STATUS_OPTIONS } from "../constants/hr";
import { formatDate } from "../utils/dateUtils";

const STATUS_TONE = { 재직: "success", 휴직: "warning", 퇴사: "danger" };

export default function EmployeeStatus() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const filtered = useMemo(() => {
    return employees
      .filter((e) => !status || (e.employmentStatus || "재직") === status)
      .filter((e) => !from || (e.hireDate && e.hireDate >= from))
      .filter((e) => !to || (e.hireDate && e.hireDate <= to))
      .sort((a, b) => (b.hireDate || "").localeCompare(a.hireDate || ""));
  }, [employees, status, from, to]);

  const setResignDate = (uid, value) => updateDoc(doc(db, "users", uid), { resignDate: value || null });

  return (
    <div className="space-y-6">
      <Panel icon={UserCog} title="입퇴사현황">
        <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">재직상태</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">전체</option>
              {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">입사일 시작</span>
            <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">입사일 종료</span>
            <input type="date" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </Card>

        <p className="mb-2 text-xs font-medium text-muted">목록 {filtered.length}건</p>
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-medium">순번</th>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">연락처</th>
                <th className="px-4 py-3 font-medium">입사일자</th>
                <th className="px-4 py-3 font-medium">퇴사일자</th>
                <th className="px-4 py-3 font-medium">재직상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, i) => (
                <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{emp.name}</td>
                  <td className="px-4 py-3 text-muted">{emp.phone}</td>
                  <td className="px-4 py-3 text-muted">{emp.hireDate ? formatDate(emp.hireDate) : "-"}</td>
                  <td className="px-4 py-3">
                    {emp.employmentStatus === "퇴사" ? (
                      <input
                        type="date"
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        value={emp.resignDate || ""}
                        onChange={(e) => setResignDate(emp.id, e.target.value)}
                      />
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[emp.employmentStatus || "재직"]}>{emp.employmentStatus || "재직"}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted">
                    조회조건에 해당하는 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
