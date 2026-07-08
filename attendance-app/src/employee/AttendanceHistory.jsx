import { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import { useToast } from "../hooks/useToast";
import { formatDate, formatTime } from "../utils/dateUtils";

const STATUS_TONE = { 출근: "success", 지각: "warning", 결근: "danger", 조퇴: "warning" };

export default function AttendanceHistory() {
  const { user } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useState([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "attendance"),
      where("uid", "==", user.uid),
      orderBy("date", "desc"),
      limit(60)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => toast.error("출근기록을 불러오지 못했습니다. 앱을 다시 시작해주세요.")
    );
    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">출근기록</h2>
      {records.length === 0 && <p className="text-xs text-muted">기록이 없습니다.</p>}
      {records.map((r) => (
        <Card key={r.id} className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-ink">{formatDate(r.date)}</p>
            <p className="mt-0.5 text-xs text-muted">
              {r.checkInTime ? `출근 ${formatTime(r.checkInTime)}` : "-"}
              {r.checkOutTime ? ` · 퇴근 ${formatTime(r.checkOutTime)}` : ""}
            </p>
          </div>
          <Badge tone={STATUS_TONE[r.status] || "muted"}>{r.status}</Badge>
        </Card>
      ))}
    </div>
  );
}
