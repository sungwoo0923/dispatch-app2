import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { PenLine, FileText } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import ApprovalBox from "../components/ApprovalBox";
import { formatDate } from "../utils/dateUtils";
import { openReportPreview } from "../utils/reportTemplates";

const STATUS_LABEL = {
  employee_pending: ["근로자 서명대기", "muted"],
  submitted: ["담당 결재대기", "warning"],
  manager_signed: ["대표 결재대기", "warning"],
  completed: ["처리완료", "success"],
};

// 계약관리 화면의 "사직서" 탭 내용. 계약서 탭과 컬럼형 표 스타일(중앙정렬,
// 근로자목록과 동일한 글씨체/색감)을 맞추고, 행을 더블클릭하면 사직서
// 전문과 결재결과 도장이 찍힌 미리보기가 뜨도록 한다.
export default function ResignationApprovals() {
  const { profile } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [signTarget, setSignTarget] = useState(null); // { req, stage: "manager" | "ceo" }
  const [previewMode, setPreviewMode] = useState(false);
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

  const previewReq = (req) =>
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
    });

  const canSign = (req) => req.status === "submitted" || (req.status === "manager_signed" && isCeo);

  const openSign = (req) => {
    const stage = req.status === "submitted" ? "manager" : "ceo";
    setSignTarget({ req, stage });
    setPreviewMode(true);
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
    } catch (err) {
      toast.error(`결재 처리에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="mb-4 text-xs text-muted">발송된 사직서의 서명·결재 진행 상황을 확인합니다. 행을 더블클릭하면 사직서 전문과 결재결과를 미리볼 수 있습니다.</p>
      <div className="mb-2 text-xs font-medium text-muted">목록 {sorted.length}</div>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
        <table className="w-full min-w-[760px] text-center text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-3 py-3 font-semibold">순번</th>
              <th className="px-3 py-3 font-semibold">이름</th>
              <th className="px-3 py-3 font-semibold">근무지</th>
              <th className="px-3 py-3 font-semibold">퇴사예정일</th>
              <th className="px-3 py-3 font-semibold">퇴사사유</th>
              <th className="px-3 py-3 font-semibold">상태</th>
              <th className="px-3 py-3 font-semibold">미리보기</th>
              <th className="px-3 py-3 font-semibold">결재</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((req, i) => {
              const [label, tone] = STATUS_LABEL[req.status] || ["-", "muted"];
              return (
                <tr
                  key={req.id}
                  onDoubleClick={() => previewReq(req)}
                  title="더블클릭하여 사직서 미리보기"
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-3 py-3 text-ink">{i + 1}</td>
                  <td className="px-3 py-3 text-ink">{req.employeeName}</td>
                  <td className="px-3 py-3 text-ink">{req.siteName || "-"}</td>
                  <td className="px-3 py-3 text-ink">{req.resignDate ? formatDate(req.resignDate) : "-"}</td>
                  <td className="px-3 py-3 text-ink">{req.reason || "-"}</td>
                  <td className="px-3 py-3">
                    <Badge tone={tone}>{label}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        previewReq(req);
                      }}
                    >
                      <FileText size={13} /> 보기
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    {canSign(req) ? (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openSign(req);
                        }}
                      >
                        <PenLine size={13} /> 결재
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted">
                  발송된 사직서가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(signTarget)}
        onClose={() => setSignTarget(null)}
        title={signTarget?.stage === "ceo" ? "대표 결재" : "담당 결재"}
        footer={
          previewMode ? (
            <Button className="w-full" onClick={() => setPreviewMode(false)}>
              내용 확인 완료 · 서명하기
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => padRef.current?.clear()}>
                다시그리기
              </Button>
              <Button className="flex-1" onClick={submitApprovalSignature} disabled={saving}>
                {saving ? "처리 중..." : "결재 완료"}
              </Button>
            </>
          )
        }
      >
        {signTarget && (
          <div className="space-y-3">
            {previewMode ? (
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-ink">
                <p className="text-center text-sm font-bold">사 직 서 (원)</p>
                <p>
                  성명: {signTarget.req.employeeName} · 직책: {signTarget.req.position || "-"}
                </p>
                <p>근무지: {signTarget.req.siteName || "-"}</p>
                <p>
                  입사일자: {signTarget.req.hireDate ? formatDate(signTarget.req.hireDate) : "-"} · 퇴사일자:{" "}
                  {signTarget.req.resignDate ? formatDate(signTarget.req.resignDate) : "-"}
                </p>
                <p>퇴사사유: {signTarget.req.reason || "-"}</p>
                <p className="pt-2">
                  본인은 상기와 같은 내용으로 퇴사하고자 하오니 허락하여 주시기 바랍니다. 아울러 퇴직에 따른 아래
                  조항을 성실히 준수할 것을 서약합니다.
                </p>
                <ApprovalBox
                  steps={[
                    {
                      role: "신청인",
                      name: signTarget.req.employeeName,
                      signatureDataUrl: signTarget.req.employeeSignatureDataUrl,
                      result: signTarget.req.employeeSignatureDataUrl ? "approved" : null,
                    },
                    {
                      role: "담당",
                      name: signTarget.req.managerName,
                      signatureDataUrl: signTarget.req.managerSignatureDataUrl,
                      result: signTarget.req.managerSignatureDataUrl ? "approved" : null,
                    },
                    {
                      role: "대표",
                      name: signTarget.req.ceoName,
                      signatureDataUrl: signTarget.req.ceoSignatureDataUrl,
                      result: signTarget.req.ceoSignatureDataUrl ? "approved" : null,
                    },
                  ]}
                />
              </div>
            ) : (
              <>
                <p className="text-sm text-ink">
                  {signTarget.req.employeeName}님의 사직서에 {signTarget.stage === "ceo" ? "대표" : "담당"}로서 결재
                  서명합니다.
                </p>
                <SignaturePad ref={padRef} />
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
