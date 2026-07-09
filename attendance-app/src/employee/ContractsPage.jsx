import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { ChevronRight, FileSignature, FileWarning } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import { formatDate } from "../utils/dateUtils";
import { contractStatus, CONTRACT_STATUS_TONE } from "../utils/contractStatus";
import { computeResignationStatus } from "../utils/resignationStatus";

const RESIGNATION_STATUS_LABEL = {
  employee_pending: ["서명 필요", "warning"],
  submitted: ["담당 결재 대기", "warning"],
  manager_signed: ["대표 결재 대기", "warning"],
  ceo_pending: ["결재 진행중", "warning"],
  on_hold: ["보류", "muted"],
  rejected: ["반려", "danger"],
  completed: ["처리완료", "success"],
};

export default function ContractsPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState([]);
  const [resignation, setResignation] = useState(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, "contracts"), where("uid", "==", user.uid)), (snap) =>
      setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "resignationRequests"), where("uid", "==", user.uid), orderBy("createdAt", "desc"), limit(5)),
      (snap) => {
        const active = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((r) => !r.deleted && r.status !== "completed");
        setResignation(active || null);
      }
    );
    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">계약서</h2>
      {resignation && (
        <Link to="/resignation">
          <Card className="flex items-center justify-between border border-danger/20 bg-red-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-danger">
                <FileWarning size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">사직서 진행중</p>
                <p className="text-xs text-muted">{resignation.resignDate ? `퇴사예정일 ${formatDate(resignation.resignDate)}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={RESIGNATION_STATUS_LABEL[computeResignationStatus(resignation)]?.[1] || "muted"}>
                {RESIGNATION_STATUS_LABEL[computeResignationStatus(resignation)]?.[0] || resignation.status}
              </Badge>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </Card>
        </Link>
      )}
      {contracts.length === 0 && !resignation && <p className="text-xs text-muted">받은 계약서가 없습니다.</p>}
      {contracts.map((c) => (
        <Link key={c.id} to={`/contracts/${c.id}`}>
          <Card className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                <FileSignature size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{c.title}</p>
                <p className="text-xs text-muted">{c.startDate ? formatDate(c.startDate) : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={CONTRACT_STATUS_TONE[contractStatus(c)]}>{contractStatus(c)}</Badge>
              <ChevronRight size={16} className="text-muted" />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
