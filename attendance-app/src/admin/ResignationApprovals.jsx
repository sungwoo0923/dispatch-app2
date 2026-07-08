import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { FileWarning, PenLine, FileText } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import SignaturePad from "../components/SignaturePad";
import { formatDate } from "../utils/dateUtils";
import { openReportPreview } from "../utils/reportTemplates";

const STATUS_LABEL = {
  employee_pending: ["근로자 서명대기", "muted"],
  submitted: ["담당 결재대기", "warning"],
  manager_signed: ["대표 결재대기", "warning"],
  completed: ["처리완료", "success"],
};

export default function ResignationApprovals() {
  const { profile } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [signTarget, setSignTarget] = useState(null); // { req, stage: "manager" | "ceo" }
  const [saving, setSaving] = useState(false);
  const padRef = useRef(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "resignationRequests"), where("companyId", "==", profile.companyId)),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const sorted = [...rows].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const isCeo = profile?.position === "대표";

  const openSign = (req, stage) => {
    setSignTarget({ req, stage });
  };

  const submitApprovalSignature = async () => {
    if (!padRef.current || padRef.current.isEmpty() || !signTarget) return;
    setSaving(true);
    const { req, stage } = signTarget;
    const signatureDataUrl = padRef.current.getDataUrl();
    try {
      if (stage === "manager") {
        await updateDoc(doc(db, "resignationRequests", req.id), {
          managerSignatureDataUrl: signatureDataUrl,
          managerSignedAt: formatDate(new Date().toISOString().slice(0, 10)),
          managerName: profile.name,
          status: "manager_signed",
        });
        toast.success("담당 결재가 완료되었습니다");
      } else {
        await updateDoc(doc(db, "resignationRequests", req.id), {
          ceoSignatureDataUrl: signatureDataUrl,
          ceoSignedAt: formatDate(new Date().toISOString().slice(0, 10)),
          ceoName: profile.name,
          status: "completed",
        });
        await updateDoc(doc(db, "users", req.uid), { employmentStatus: "퇴사", resignDate: req.resignDate });
        await addDoc(collection(db, "notifications"), {
          companyId: profile.companyId,
          uid: req.uid,
          title: "사직서 처리가 완료되었습니다",
          message: `${req.resignDate ? formatDate(req.resignDate) : ""} 자로 퇴직 처리되었습니다.`,
          read: false,
          createdAt: serverTimestamp(),
        });
        toast.success("대표 결재가 완료되어 퇴직처리 되었습니다");
      }
      setSignTarget(null);
    } catch {
      toast.error("결재 처리에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel icon={FileWarning} title={`사직서 결재 (${rows.filter((r) => r.status !== "completed").length}건 진행중)`}>
        <div className="space-y-3">
          {sorted.map((req) => {
            const [label, tone] = STATUS_LABEL[req.status] || ["-", "muted"];
            return (
              <Card key={req.id} className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink">{req.employeeName}</p>
                    <p className="text-xs text-muted">
                      {req.siteName || "-"} · 퇴사예정일 {req.resignDate ? formatDate(req.resignDate) : "-"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={() =>
                        openReportPreview("사직서", "사직서", {
                          siteName: req.siteName,
                          employeeName: req.employeeName,
                          position: req.position,
                          hireDate: req.hireDate,
                          resignDate: req.resignDate,
                          reason: req.reason,
                          employeeSignatureDataUrl: req.employeeSignatureDataUrl,
                          managerSignatureDataUrl: req.managerSignatureDataUrl,
                          managerName: req.managerName,
                          ceoSignatureDataUrl: req.ceoSignatureDataUrl,
                          ceoName: req.ceoName,
                        })
                      }
                    >
                      <FileText size={13} /> 양식
                    </button>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                </div>
                {req.reason && <p className="mb-3 text-xs text-muted">퇴사사유: {req.reason}</p>}

                <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-100 p-3 text-center">
                  <div>
                    <p className="mb-1.5 text-[11px] text-muted">신청인</p>
                    {req.employeeSignatureDataUrl ? (
                      <img src={req.employeeSignatureDataUrl} alt="신청인 서명" className="mx-auto h-12 rounded-lg border border-slate-200 bg-white" />
                    ) : (
                      <p className="text-[11px] text-muted">서명 대기중</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] text-muted">담당</p>
                    {req.managerSignatureDataUrl ? (
                      <img src={req.managerSignatureDataUrl} alt="담당 서명" className="mx-auto h-12 rounded-lg border border-slate-200 bg-white" />
                    ) : req.status === "submitted" ? (
                      <Button size="sm" onClick={() => openSign(req, "manager")}>
                        <PenLine size={13} /> 결재
                      </Button>
                    ) : (
                      <p className="text-[11px] text-muted">대기중</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] text-muted">대표</p>
                    {req.ceoSignatureDataUrl ? (
                      <img src={req.ceoSignatureDataUrl} alt="대표 서명" className="mx-auto h-12 rounded-lg border border-slate-200 bg-white" />
                    ) : req.status === "manager_signed" && isCeo ? (
                      <Button size="sm" onClick={() => openSign(req, "ceo")}>
                        <PenLine size={13} /> 결재
                      </Button>
                    ) : req.status === "manager_signed" ? (
                      <p className="text-[11px] text-warning">대표 결재 필요</p>
                    ) : (
                      <p className="text-[11px] text-muted">대기중</p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          {rows.length === 0 && <p className="py-8 text-center text-xs text-muted">발송된 사직서가 없습니다.</p>}
        </div>
      </Panel>

      <Modal
        open={Boolean(signTarget)}
        onClose={() => setSignTarget(null)}
        title={signTarget?.stage === "ceo" ? "대표 결재 서명" : "담당 결재 서명"}
        footer={
          <>
            <Button variant="outline" onClick={() => setSignTarget(null)}>
              취소
            </Button>
            <Button variant="outline" onClick={() => padRef.current?.clear()}>
              다시그리기
            </Button>
            <Button onClick={submitApprovalSignature} disabled={saving}>
              {saving ? "처리 중..." : "결재 완료"}
            </Button>
          </>
        }
      >
        <SignaturePad ref={padRef} />
      </Modal>
    </div>
  );
}
