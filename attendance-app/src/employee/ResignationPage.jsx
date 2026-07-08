import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { ArrowLeft, PenLine, FileWarning } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import { toDateKey, formatDate } from "../utils/dateUtils";

const STATUS_LABEL = {
  employee_pending: ["서명 필요", "warning"],
  submitted: ["담당 결재 대기", "warning"],
  manager_signed: ["대표 결재 대기", "warning"],
  completed: ["처리완료", "success"],
};

export default function ResignationPage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const padRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "resignationRequests"), where("uid", "==", user.uid), orderBy("createdAt", "desc"), limit(1)),
      (snap) => {
        setReq(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user]);

  const openSign = () => {
    setReason(req?.reason || "");
    setSigning(true);
  };

  const submitSignature = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "resignationRequests", req.id), {
        employeeSignatureDataUrl: padRef.current.getDataUrl(),
        employeeSignedAt: toDateKey(),
        reason,
        status: "submitted",
      });
      toast.success("사직서가 제출되었습니다. 관리자 결재를 기다려주세요.");
      setSigning(false);
    } catch {
      toast.error("제출에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="px-4 pt-4 text-xs text-muted">불러오는 중...</p>;

  if (!req) {
    return (
      <div className="space-y-4 px-4 pt-4">
        <Link to="/" className="flex items-center gap-1 text-xs text-muted">
          <ArrowLeft size={14} /> 홈으로
        </Link>
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <FileWarning size={28} className="text-muted" />
          <p className="text-sm text-muted">접수된 사직서가 없습니다.</p>
        </Card>
      </div>
    );
  }

  const [label, tone] = STATUS_LABEL[req.status] || ["-", "muted"];

  return (
    <div className="space-y-4 px-4 pt-4">
      <Link to="/" className="flex items-center gap-1 text-xs text-muted">
        <ArrowLeft size={14} /> 홈으로
      </Link>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold text-ink">사직서</p>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              tone === "success" ? "bg-primary-light text-primary" : "bg-slate-100 text-warning"
            }`}
          >
            {label}
          </span>
        </div>
        <div className="space-y-1.5 text-sm text-ink">
          <div className="flex justify-between">
            <span className="text-muted">성명</span>
            <span>{req.employeeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">직책</span>
            <span>{req.position || "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">근무지</span>
            <span>{req.siteName || "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">입사일자</span>
            <span>{req.hireDate ? formatDate(req.hireDate) : "-"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">퇴사일자</span>
            <span>{req.resignDate ? formatDate(req.resignDate) : "-"}</span>
          </div>
        </div>
        {req.status !== "employee_pending" && (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-muted">퇴사사유: {req.reason || "-"}</p>
        )}
      </Card>

      <Card className="p-5">
        <p className="mb-3 text-xs font-semibold text-ink">결재라인</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="mb-1.5 text-[11px] text-muted">신청인</p>
            {req.employeeSignatureDataUrl ? (
              <img src={req.employeeSignatureDataUrl} alt="신청인 서명" className="mx-auto h-12 rounded-lg border border-slate-200 bg-white" />
            ) : (
              <p className="text-[11px] text-warning">서명 필요</p>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-[11px] text-muted">담당</p>
            {req.managerSignatureDataUrl ? (
              <img src={req.managerSignatureDataUrl} alt="담당 서명" className="mx-auto h-12 rounded-lg border border-slate-200 bg-white" />
            ) : (
              <p className="text-[11px] text-muted">대기중</p>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-[11px] text-muted">대표</p>
            {req.ceoSignatureDataUrl ? (
              <img src={req.ceoSignatureDataUrl} alt="대표 서명" className="mx-auto h-12 rounded-lg border border-slate-200 bg-white" />
            ) : (
              <p className="text-[11px] text-muted">대기중</p>
            )}
          </div>
        </div>
      </Card>

      {req.status === "employee_pending" && (
        <Button className="w-full" size="lg" onClick={openSign}>
          <PenLine size={16} /> 내용 확인 후 서명하기
        </Button>
      )}

      <Modal
        open={signing}
        onClose={() => setSigning(false)}
        title="사직서 서명"
        footer={
          <>
            <Button variant="outline" onClick={() => setSigning(false)}>
              취소
            </Button>
            <Button variant="outline" onClick={() => padRef.current?.clear()}>
              다시그리기
            </Button>
            <Button onClick={submitSignature} disabled={saving}>
              {saving ? "제출 중..." : "제출"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">퇴사사유</span>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="text-xs text-ink">신청인: {profile?.name}</p>
          <SignaturePad ref={padRef} />
        </div>
      </Modal>
    </div>
  );
}
