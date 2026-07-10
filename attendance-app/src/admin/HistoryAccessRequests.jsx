import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { CalendarRange, Check, X as XIcon, Lock } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Panel from "../components/Panel";
import { formatDate } from "../utils/dateUtils";

const STATUS_TONE = { pending: "warning", approved: "success", rejected: "danger" };
const STATUS_LABEL = { pending: "승인대기", approved: "승인됨", rejected: "반려됨" };

export default function HistoryAccessRequests() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(query(collection(db, "historyAccessRequests"), where("companyId", "==", profile.companyId)), (snap) =>
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const sorted = [...requests].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const decide = async (req, approve) => {
    await updateDoc(doc(db, "historyAccessRequests", req.id), {
      status: approve ? "approved" : "rejected",
      decidedAt: serverTimestamp(),
      decidedBy: user?.uid || null,
    });
    if (approve) {
      await updateDoc(doc(db, "users", req.uid), { extendedHistoryAccess: true });
    }
    await addDoc(collection(db, "notifications"), {
      companyId: profile.companyId,
      uid: req.uid,
      title: approve ? "조회기간 확장 요청이 승인되었습니다" : "조회기간 확장 요청이 반려되었습니다",
      message: approve ? "계약관리/급여관리/휴가관리에서 최대 조회기간이 확장되었습니다." : "",
      read: false,
      createdAt: serverTimestamp(),
    });
    toast.success(approve ? "승인되었습니다" : "반려되었습니다");
  };

  const lockAccess = async (req) => {
    await updateDoc(doc(db, "users", req.uid), { extendedHistoryAccess: false });
    await addDoc(collection(db, "notifications"), {
      companyId: profile.companyId,
      uid: req.uid,
      title: "조회기간 확장이 잠금 처리되었습니다",
      message: "최대 3개월까지만 조회할 수 있습니다.",
      read: false,
      createdAt: serverTimestamp(),
    });
    toast.success("잠금 처리되었습니다");
  };

  return (
    <Panel icon={CalendarRange} title="조회기간 확장요청">
      <p className="mb-4 text-xs text-muted">
        모바일 계약관리/급여관리/휴가관리는 기본 3개월까지만 조회됩니다. 근로자가 확장을 요청하면 여기서 승인/반려하고, 승인 후에는 언제든 다시 잠글 수 있습니다.
      </p>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
        <table className="w-full min-w-[640px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-semibold">이름</th>
              <th className="px-4 py-3 font-semibold">요청일시</th>
              <th className="px-4 py-3 font-semibold">상태</th>
              <th className="px-4 py-3 font-semibold">처리</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-ink">{r.name}</td>
                <td className="px-4 py-3 text-ink">{r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("ko-KR") : "-"}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </td>
                <td className="px-4 py-3">
                  {r.status === "pending" ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => decide(r, true)}
                        className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark"
                      >
                        <Check size={12} /> 승인
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(r, false)}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-slate-50"
                      >
                        <XIcon size={12} /> 반려
                      </button>
                    </div>
                  ) : r.status === "approved" ? (
                    <button
                      type="button"
                      onClick={() => lockAccess(r)}
                      className="mx-auto flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-slate-50"
                    >
                      <Lock size={12} /> 잠금
                    </button>
                  ) : (
                    <span className="text-xs text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted">
                  요청 내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
