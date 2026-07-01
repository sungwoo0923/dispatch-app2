import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import { toDateKey, formatTime } from "../utils/dateUtils";

export default function AttendanceBoard() {
  const { profile } = useAuth();
  const [date, setDate] = useState(toDateKey());
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsubUsers();
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", "==", date)),
      (snap) => setAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, date]);

  const rows = employees
    .filter((e) => e.approved)
    .map((emp) => {
      const record = attendance.find((a) => a.uid === emp.id);
      return { emp, record };
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">출근현황</h1>
          <p className="text-sm text-muted">실시간 출퇴근 현황판</p>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">출근시간</th>
              <th className="px-4 py-3 font-medium">퇴근시간</th>
              <th className="px-4 py-3 font-medium">출근위치</th>
              <th className="px-4 py-3 font-medium">방식</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, record }) => (
              <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-ink">{emp.name}</td>
                <td className="px-4 py-3">
                  {record?.status === "출근" ? (
                    <Badge tone="success">출근</Badge>
                  ) : (
                    <Badge tone="danger">미출근</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{record?.checkInTime ? formatTime(record.checkInTime) : "-"}</td>
                <td className="px-4 py-3 text-muted">{record?.checkOutTime ? formatTime(record.checkOutTime) : "-"}</td>
                <td className="px-4 py-3 text-muted">
                  {record?.checkInLocation?.distanceM != null ? `근무지에서 ${record.checkInLocation.distanceM}m` : "-"}
                </td>
                <td className="px-4 py-3">
                  {record?.source && <Badge tone={record.source === "auto" ? "primary" : "muted"}>{record.source === "auto" ? "자동" : "수동"}</Badge>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted">
                  승인된 직원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
