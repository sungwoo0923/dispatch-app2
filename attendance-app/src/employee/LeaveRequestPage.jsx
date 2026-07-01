import { useEffect, useMemo, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { CalendarClock, Plus } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { calcLeaveBalance, LEAVE_TYPES } from "../utils/leave";
import { toDateKey, formatDate } from "../utils/dateUtils";

const STATUS_LABEL = { pending: ["대기중", "warning"], approved: ["승인", "success"], rejected: ["반려", "danger"] };

export default function LeaveRequestPage() {
  const { user, profile } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "연차", startDate: toDateKey(), endDate: toDateKey(), reason: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "leaves"), where("uid", "==", user.uid), orderBy("startDate", "desc"));
    const unsub = onSnapshot(q, (snap) => setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [user]);

  const balance = useMemo(
    () => calcLeaveBalance({ hireDate: profile?.hireDate || toDateKey(), leaves }),
    [profile?.hireDate, leaves]
  );

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await addDoc(collection(db, "leaves"), {
      uid: user.uid,
      name: profile.name,
      companyId: profile.companyId,
      ...form,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    setSaving(false);
    setOpen(false);
    setForm({ type: "연차", startDate: toDateKey(), endDate: toDateKey(), reason: "" });
  };

  return (
    <div className="space-y-4 px-4 pt-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarClock size={16} className="text-primary" />
          {balance.leaveLabel} 현황
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-ink">{balance.entitlement}</p>
            <p className="text-[11px] text-muted">부여</p>
          </div>
          <div>
            <p className="text-lg font-bold text-ink">{balance.used}</p>
            <p className="text-[11px] text-muted">사용</p>
          </div>
          <div>
            <p className="text-lg font-bold text-primary">{balance.remaining}</p>
            <p className="text-[11px] text-muted">잔여</p>
          </div>
        </div>
      </Card>

      <Button className="w-full" size="lg" onClick={() => setOpen(true)}>
        <Plus size={18} /> 휴가 신청
      </Button>

      <div className="space-y-3">
        {leaves.map((lv) => {
          const [label, tone] = STATUS_LABEL[lv.status] || ["대기중", "warning"];
          return (
            <Card key={lv.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-ink">{lv.type}</p>
                <p className="text-xs text-muted">
                  {formatDate(lv.startDate)} ~ {formatDate(lv.endDate)}
                </p>
              </div>
              <Badge tone={tone}>{label}</Badge>
            </Card>
          );
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="휴가 신청"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "신청 중..." : "신청하기"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">유형</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">시작일</span>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">종료일</span>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사유</span>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              rows={2}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
