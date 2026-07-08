import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { ChevronRight, Wallet, Info } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";

export default function PayslipList() {
  const { user } = useAuth();
  const [payrolls, setPayrolls] = useState([]);

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

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-base font-bold text-ink">급여관리</h2>
      <div className="flex items-center gap-2 rounded-xl bg-primary-light px-3.5 py-2.5 text-xs font-medium text-primary">
        <Info size={14} className="shrink-0" />
        현재일자 기준 3개월 전까지 조회됩니다.
      </div>
      {payrolls.length === 0 && <p className="text-xs text-muted">발급된 명세서가 없습니다.</p>}
      {payrolls.map((p) => (
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
