import { useEffect, useMemo, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { CalendarClock, Plus, Pencil, X } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { calcLeaveBalance, LEAVE_TYPES } from "../utils/leave";
import { toDateKey, formatDate } from "../utils/dateUtils";

const STATUS_LABEL = { pending: ["승인대기", "warning"], approved: ["승인완료", "success"], rejected: ["반려", "danger"] };
const EMPTY_FORM = { type: "연차", startDate: toDateKey(), endDate: toDateKey(), reason: "" };

export default function LeaveRequestPage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [leaves, setLeaves] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "leaves"), where("uid", "==", user.uid), orderBy("startDate", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => toast.error("휴가 목록을 불러오지 못했습니다. 앱을 다시 시작해주세요.")
    );
    return () => unsub();
  }, [user]);

  const balance = useMemo(
    () => calcLeaveBalance({ hireDate: profile?.hireDate || toDateKey(), leaves }),
    [profile?.hireDate, leaves]
  );

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (lv) => {
    setEditingId(lv.id);
    setForm({ type: lv.type, startDate: lv.startDate, endDate: lv.endDate, reason: lv.reason || "" });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "leaves", editingId), { ...form });
        toast.success("수정되었습니다");
      } else {
        await addDoc(collection(db, "leaves"), {
          uid: user.uid,
          name: profile.name,
          companyId: profile.companyId,
          ...form,
          status: "pending",
          createdAt: serverTimestamp(),
        });
        toast.success("신청되었습니다");
      }
      setOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch {
      toast.error("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const cancelLeave = async (lv) => {
    if (!(await confirm("이 휴가 신청을 취소하시겠습니까?", "delete"))) return;
    try {
      await deleteDoc(doc(db, "leaves", lv.id));
      toast.success("취소되었습니다");
    } catch {
      toast.error("취소에 실패했습니다.");
    }
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

      <Button className="w-full" size="lg" onClick={openNew}>
        <Plus size={18} /> 휴가 신청
      </Button>

      <div className="space-y-3">
        {leaves.map((lv) => {
          const [label, tone] = STATUS_LABEL[lv.status] || ["승인대기", "warning"];
          const pending = lv.status === "pending";
          return (
            <Card key={lv.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-ink">{lv.type}</p>
                <p className="text-xs text-muted">
                  {formatDate(lv.startDate)} ~ {formatDate(lv.endDate)}
                </p>
                {lv.status === "rejected" && lv.adminNote && (
                  <p className="mt-0.5 text-[11px] text-danger">반려사유: {lv.adminNote}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={tone}>{label}</Badge>
                {pending && (
                  <>
                    <button type="button" className="text-muted hover:text-ink" title="수정" onClick={() => openEdit(lv)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="text-muted hover:text-danger" title="취소" onClick={() => cancelLeave(lv)}>
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? "휴가 신청 수정" : "휴가 신청"}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "저장 중..." : editingId ? "수정하기" : "신청하기"}
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
