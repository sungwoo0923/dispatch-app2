import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Check, X } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { formatDate } from "../utils/dateUtils";

const STATUS_LABEL = { pending: ["대기중", "warning"], approved: ["승인", "success"], rejected: ["반려", "danger"] };

export default function LeaveApprovals() {
  const { profile } = useAuth();
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId), orderBy("startDate", "desc")),
      (snap) => setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const setStatus = (id, status) => updateDoc(doc(db, "leaves", id), { status });

  const pending = leaves.filter((l) => l.status === "pending");
  const rest = leaves.filter((l) => l.status !== "pending");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-ink">휴가 승인</h1>
        <p className="text-sm text-muted">대기중 {pending.length}건</p>
      </div>

      <div className="space-y-3">
        {pending.map((lv) => (
          <Card key={lv.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-ink">
                {lv.name} · {lv.type}
              </p>
              <p className="text-xs text-muted">
                {formatDate(lv.startDate)} ~ {formatDate(lv.endDate)} {lv.reason ? `· ${lv.reason}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="success" onClick={() => setStatus(lv.id, "approved")}>
                <Check size={14} /> 승인
              </Button>
              <Button size="sm" variant="danger" onClick={() => setStatus(lv.id, "rejected")}>
                <X size={14} /> 반려
              </Button>
            </div>
          </Card>
        ))}
        {pending.length === 0 && <p className="text-xs text-muted">대기중인 신청이 없습니다.</p>}
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-ink">처리 내역</p>
        <div className="space-y-2">
          {rest.map((lv) => {
            const [label, tone] = STATUS_LABEL[lv.status] || ["대기중", "warning"];
            return (
              <Card key={lv.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-ink">
                    {lv.name} · {lv.type}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDate(lv.startDate)} ~ {formatDate(lv.endDate)}
                  </p>
                </div>
                <Badge tone={tone}>{label}</Badge>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
