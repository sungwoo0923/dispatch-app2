import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { ChevronRight, Wallet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";

export default function PayslipList() {
  const { user } = useAuth();
  const [payrolls, setPayrolls] = useState([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "payrolls"), where("uid", "==", user.uid), orderBy("month", "desc"));
    const unsub = onSnapshot(q, (snap) => setPayrolls(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">급여명세서</h2>
      {payrolls.length === 0 && <p className="text-xs text-muted">발급된 명세서가 없습니다.</p>}
      {payrolls.map((p) => (
        <Link key={p.id} to={`/payslips/${p.id}`}>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                <Wallet size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{p.month} 급여명세서</p>
                <p className="text-xs text-muted">실수령액 {p.netPay?.toLocaleString()}원</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-muted" />
          </Card>
        </Link>
      ))}
    </div>
  );
}
