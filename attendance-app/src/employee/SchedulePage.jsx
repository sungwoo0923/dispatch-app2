import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { CalendarDays } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import { formatDate, toDateKey } from "../utils/dateUtils";

export default function SchedulePage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState([]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "schedules"),
      where("uid", "==", user.uid),
      where("date", ">=", toDateKey()),
      orderBy("date", "asc")
    );
    const unsub = onSnapshot(q, (snap) => setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">예정된 스케줄</h2>
      {schedules.length === 0 && <p className="text-xs text-muted">예정된 스케줄이 없습니다.</p>}
      {schedules.map((s) => (
        <Card key={s.id} className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
            <CalendarDays size={18} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{formatDate(s.date)}</p>
            <p className="text-xs text-muted">
              {s.startTime} ~ {s.endTime} {s.siteName ? `· ${s.siteName}` : ""}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
