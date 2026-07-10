import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { ChevronRight, Wallet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import MonthRangeSearch from "../components/MonthRangeSearch";

export default function PayslipList() {
  const { user } = useAuth();
  const [payrolls, setPayrolls] = useState([]);
  const [range, setRange] = useState(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "payrolls"), where("uid", "==", user.uid), orderBy("month", "desc"));
    const unsub = onSnapshot(q, (snap) =>
      setPayrolls(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.settlementStatus === "confirmed")
      )
    );
    return () => unsub();
  }, [user]);

  const filteredPayrolls = useMemo(() => {
    if (!range) return payrolls;
    return payrolls.filter((p) => p.month >= range.startMonth && p.month <= range.endMonth);
  }, [payrolls, range]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-base font-bold text-ink">급여관리</h2>
      <MonthRangeSearch onSearch={setRange} />
      {filteredPayrolls.length === 0 && <p className="text-xs text-muted">발급된 명세서가 없습니다.</p>}
      {filteredPayrolls.map((p) => (
        <Link key={p.id} to={`/payslips/${p.id}`}>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
                <Wallet size={20} />
              </div>
              <div>
                <p className="text-base font-bold text-ink">{p.siteName || p.month}</p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{p.month} · {p.netPay?.toLocaleString()}원</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-muted" />
          </Card>
        </Link>
      ))}
    </div>
  );
}
