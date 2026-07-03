import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { ChevronRight, FileSignature } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";

export default function ContractsPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState([]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, "contracts"), where("uid", "==", user.uid)), (snap) =>
      setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">계약서</h2>
      {contracts.length === 0 && <p className="text-xs text-muted">받은 계약서가 없습니다.</p>}
      {contracts.map((c) => (
        <Link key={c.id} to={`/contracts/${c.id}`}>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                <FileSignature size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{c.title}</p>
                <p className="text-xs text-muted">{c.startDate}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {c.status === "signed" ? <Badge tone="success">서명완료</Badge> : <Badge tone="warning">서명필요</Badge>}
              <ChevronRight size={16} className="text-muted" />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
