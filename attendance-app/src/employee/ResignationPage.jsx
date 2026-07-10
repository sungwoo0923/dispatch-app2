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
import ApprovalBox from "../components/ApprovalBox";
import { toDateKey, formatDate } from "../utils/dateUtils";
import { getManagerResult, getCeoResult, computeResignationStatus } from "../utils/resignationStatus";

const STATUS_LABEL = {
  employee_pending: ["서명 필요", "warning"],
  submitted: ["담당 결재 대기", "warning"],
  manager_signed: ["대표 결재 대기", "warning"],
  ceo_pending: ["결재 진행중", "warning"],
  on_hold: ["보류", "muted"],
  rejected: ["반려", "danger"],
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
      query(collection(db, "resignationRequests"), where("uid", "==", user.uid), orderBy("createdAt", "desc"), limit(5)),
      (snap) => {
        const active = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((r) => !r.deleted);
        setReq(active || null);
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

  const derivedStatus = computeResignationStatus(req);
  const [label, tone] = STATUS_LABEL[derivedStatus] || ["-", "muted"];

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
          <div className="flex justify-between gap-3">
            <span className="shrink-0 text-muted">근무지</span>
            <span className="min-w-0 flex-1 truncate text-right">{req.siteName || "-"}</span>
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
        {req.managerNote && getManagerResult(req) === "rejected" && (
          <p className="mt-2 rounded-xl bg-red-50 p-3 text-xs text-danger">담당 반려사유: {req.managerNote}</p>
        )}
        {req.ceoNote && getCeoResult(req) === "rejected" && (
          <p className="mt-2 rounded-xl bg-red-50 p-3 text-xs text-danger">대표 반려사유: {req.ceoNote}</p>
        )}
      </Card>

      <Card className="p-5">
        <p className="mb-3 text-center text-xs font-semibold text-ink">결재라인</p>
        <div className="flex justify-center">
          <ApprovalBox
            steps={[
              { role: "신청인", name: req.employeeName, signatureDataUrl: req.employeeSignatureDataUrl, result: req.employeeSignatureDataUrl ? "approved" : null },
              { role: "담당", name: req.managerName, signatureDataUrl: getManagerResult(req) === "rejected" ? null : req.managerSignatureDataUrl, result: getManagerResult(req) },
              { role: "대표", name: req.ceoName, signatureDataUrl: getCeoResult(req) === "rejected" ? null : req.ceoSignatureDataUrl, result: getCeoResult(req) },
            ]}
          />
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
          <Button variant="outline" onClick={() => setSigning(false)}>
            취소
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-ink">
            <p className="text-center text-sm font-bold">사 직 서 (원)</p>
            <div className="space-y-1 text-[11px] text-muted">
              <p>성명: {req.employeeName} · 직책: {req.position || "-"}</p>
              <p>근무지: {req.siteName || "-"}</p>
              <p>입사일자: {req.hireDate ? formatDate(req.hireDate) : "-"} · 퇴사일자: {req.resignDate ? formatDate(req.resignDate) : "-"}</p>
            </div>
            <p>본인은 상기와 같은 내용으로 퇴사하고자 하오니 허락하여 주시기 바랍니다. 아울러 퇴직에 따른 아래 조항을 성실히 준수할 것을 서약합니다.</p>
            <p className="text-center font-semibold">- 준 수 사 항 -</p>
            <p>
              1. 본인은 퇴사에 따른 사무 인수인계를 철저히 하여 퇴사 시까지 직무책임과 임무를 완수합니다.<br />
              2. 재직 시 업무상 지득한 회사의 제반 비밀사항을 타인에게 일체 누설하지 않겠습니다.<br />
              3. 차용금, 지급공구 및 비품, 기타 회사비품 등 반환물품(금품)은 퇴직일 전일까지 반환하겠습니다.<br />
              4. 기타 회사와 관련한 제반 사항은 회사규정에 의거 퇴사일 전일까지 처리하겠습니다.<br />
              5. 만일 본인이 상기 사항을 위반하였을 때에는 이유 여하를 막론하고 서약에 의거 민.형사상의 책임과 손해배상 의무를 지겠습니다.
            </p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">퇴사사유</span>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="text-xs text-ink">위 내용을 모두 확인했으며, 아래 서명으로 신청합니다. 신청인: {profile?.name}</p>
          <SignaturePad ref={padRef} onSave={submitSignature} saving={saving} />
        </div>
      </Modal>
    </div>
  );
}
