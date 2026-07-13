import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { PenLine, FileText, Trash2, ChevronDown, Eye } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import ApprovalBox from "../components/ApprovalBox";
import { formatDate } from "../utils/dateUtils";
import { openReportPreview } from "../utils/reportTemplates";
import {
  getManagerResult,
  getCeoResult,
  computeResignationStatus,
  resignationActionStage,
  canManagerActOnResignation,
  canCeoActOnResignation,
} from "../utils/resignationStatus";

const STATUS_LABEL = {
  employee_pending: ["근로자 서명대기", "muted"],
  submitted: ["담당 결재대기", "warning"],
  manager_signed: ["대표 결재대기", "warning"],
  ceo_pending: ["결재 진행중", "warning"],
  on_hold: ["보류", "muted"],
  rejected: ["반려", "danger"],
  completed: ["처리완료", "success"],
};

// 계약관리 화면의 "사직서" 탭 내용. 계약서 탭과 컬럼형 표 스타일(중앙정렬,
// 근로자목록과 동일한 글씨체/색감)을 맞추고, 행을 더블클릭하면 사직서
// 전문과 결재결과 도장이 찍힌 미리보기가 뜨도록 한다.
export default function ResignationApprovals() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [signTarget, setSignTarget] = useState(null); // { req, stage: "manager" | "ceo" }
  const [viewTarget, setViewTarget] = useState(null); // 결재상황(읽기 전용)으로 보는 사직서
  const [previewMode, setPreviewMode] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const padRef = useRef(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "resignationRequests"), where("companyId", "==", profile.companyId)),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setBusinessEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId]);

  const active = rows.filter((r) => !r.deleted).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const deleted = rows.filter((r) => r.deleted).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
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
      managerResult: getManagerResult(req),
      ceoSignatureDataUrl: req.ceoSignatureDataUrl,
      ceoName: req.ceoName,
      ceoResult: getCeoResult(req),
    });

  const actionStage = (req) => resignationActionStage(req, isCeo);

  const approvalStepsFor = (req) => [
    {
      role: "신청인",
      name: req.employeeName,
      signatureDataUrl: req.employeeSignatureDataUrl,
      result: req.employeeSignatureDataUrl ? "approved" : null,
    },
    {
      role: "담당",
      name: req.managerName,
      signatureDataUrl: req.managerResult === "rejected" ? null : req.managerSignatureDataUrl,
      result: getManagerResult(req),
    },
    {
      role: "대표",
      name: req.ceoName,
      signatureDataUrl: req.ceoResult === "rejected" ? null : req.ceoSignatureDataUrl,
      result: getCeoResult(req),
    },
  ];

  const openSign = (req) => {
    const stage = actionStage(req);
    if (!stage) return;
    setSignTarget({ req, stage });
    setPreviewMode(true);
    setNoteText("");
  };

  const submitDecision = async (result) => {
    if (!signTarget) return;
    if (result === "approved" && (!padRef.current || padRef.current.isEmpty())) {
      toast.error("승인은 서명 후 진행할 수 있습니다");
      return;
    }
    setSaving(true);
    const { req, stage } = signTarget;
    const signatureDataUrl = result === "approved" ? padRef.current.getDataUrl() : null;
    const today = formatDate(new Date().toISOString().slice(0, 10));
    const patch =
      stage === "manager"
        ? {
            managerResult: result,
            managerName: profile.name,
            managerSignedAt: today,
            managerNote: result === "rejected" ? noteText || "" : "",
            managerSignatureDataUrl: signatureDataUrl,
            managerDecisionCount: (req.managerDecisionCount || 0) + 1,
          }
        : {
            ceoResult: result,
            ceoName: profile.name,
            ceoSignedAt: today,
            ceoNote: result === "rejected" ? noteText || "" : "",
            ceoSignatureDataUrl: signatureDataUrl,
            ceoDecisionCount: (req.ceoDecisionCount || 0) + 1,
          };

    // 담당이 승인하면, 사업자 도장이 등록되어 있는 경우 대표 결재를 직접
    // 받지 않고 그 도장으로 자동 승인 처리한다 — 도장이 없으면 예전처럼
    // 대표가 직접 서명해야 한다.
    if (stage === "manager" && result === "approved" && !getCeoResult(req)) {
      const entityStampUrl = businessEntities.find((e) => e.id === req.businessEntityId)?.stampUrl;
      if (entityStampUrl) {
        patch.ceoResult = "approved";
        patch.ceoName = "대표(도장 자동승인)";
        patch.ceoSignedAt = today;
        patch.ceoNote = "";
        patch.ceoSignatureDataUrl = entityStampUrl;
        patch.ceoDecisionCount = (req.ceoDecisionCount || 0) + 1;
      }
    }

    const merged = { ...req, ...patch };
    const newStatus = computeResignationStatus(merged);
    patch.status = newStatus;
    try {
      await updateDoc(doc(db, "resignationRequests", req.id), patch);
      if (newStatus === "completed" && req.status !== "completed") {
        await updateDoc(doc(db, "users", req.uid), { employmentStatus: "퇴사", resignDate: req.resignDate });
        await addDoc(collection(db, "notifications"), {
          companyId: profile.companyId,
          uid: req.uid,
          title: "사직서 처리가 완료되었습니다",
          message: `${req.resignDate ? formatDate(req.resignDate) : ""} 자로 퇴직 처리되었습니다.`,
          link: "/contracts",
          read: false,
          createdAt: serverTimestamp(),
        });
      } else if (newStatus === "rejected" && req.status !== "rejected") {
        await addDoc(collection(db, "notifications"), {
          companyId: profile.companyId,
          uid: req.uid,
          title: "사직서가 반려되었습니다",
          message: stage === "ceo" ? req.ceoNote || noteText || "" : "대표 결재가 진행 중입니다.",
          link: "/contracts",
          read: false,
          createdAt: serverTimestamp(),
        });
      } else if (newStatus === "on_hold" && req.status !== "on_hold") {
        await addDoc(collection(db, "notifications"), {
          companyId: profile.companyId,
          uid: req.uid,
          title: "사직서 처리가 보류되었습니다",
          message: noteText || "",
          link: "/contracts",
          read: false,
          createdAt: serverTimestamp(),
        });
      }
      toast.success(
        stage === "ceo"
          ? "대표 결재가 반영되었습니다"
          : patch.ceoResult === "approved"
            ? "담당 결재가 반영되었습니다. 사업자 도장으로 대표 결재까지 자동 승인되어 처리완료되었습니다."
            : "담당 결재가 반영되었습니다"
      );
      setSignTarget(null);
    } catch (err) {
      toast.error(`결재 처리에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

  const removeRequest = async (req) => {
    if (!(await confirm(`${req.employeeName}님의 사직서를 삭제하시겠습니까? 삭제하면 근로자 앱에서도 함께 사라집니다.`, "delete"))) return;
    try {
      await updateDoc(doc(db, "resignationRequests", req.id), {
        deleted: true,
        deletedAt: formatDate(new Date().toISOString().slice(0, 10)),
        deletedBy: profile.name,
      });
      toast.success("삭제되었습니다");
    } catch (err) {
      toast.error(`삭제에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  const renderRow = (req, i) => {
    const [label, tone] = STATUS_LABEL[computeResignationStatus(req)] || ["-", "muted"];
    const stage = actionStage(req);
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
          {req.deleted ? (
            <span className="text-xs text-muted">-</span>
          ) : stage ? (
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
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setViewTarget(req);
              }}
            >
              <Eye size={13} /> 결재상황
            </button>
          )}
        </td>
        <td className="px-3 py-3">
          {!req.deleted && (
            <button
              type="button"
              className="text-muted hover:text-danger"
              title="삭제"
              onClick={(e) => {
                e.stopPropagation();
                removeRequest(req);
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div>
      <p className="mb-4 text-xs text-muted">발송된 사직서의 서명·결재 진행 상황을 확인합니다. 행을 더블클릭하면 사직서 전문과 결재결과를 미리볼 수 있습니다.</p>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted">
        <span>목록 {active.length}</span>
        <span className="text-slate-300">·</span>
        <span className="text-warning">
          진행중 {active.filter((r) => !["completed", "rejected", "on_hold"].includes(computeResignationStatus(r))).length}
        </span>
        <span className="text-muted">보류 {active.filter((r) => computeResignationStatus(r) === "on_hold").length}</span>
        <span className="text-danger">반려 {active.filter((r) => computeResignationStatus(r) === "rejected").length}</span>
        <span className="text-primary">완료 {active.filter((r) => computeResignationStatus(r) === "completed").length}</span>
      </div>
      <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
        <table className="w-full min-w-[820px] text-center text-sm">
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
              <th className="px-3 py-3 font-semibold">삭제</th>
            </tr>
          </thead>
          <tbody>
            {active.map((req, i) => renderRow(req, i))}
            {active.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-xs text-muted">
                  발송된 사직서가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={() => setShowDeleted((v) => !v)}
        className="mt-6 flex w-full items-center gap-2 border-t border-slate-100 pt-4 text-sm font-semibold text-muted"
      >
        <ChevronDown size={16} className={`transition-transform ${showDeleted ? "rotate-180" : ""}`} />
        삭제된 사직서 ({deleted.length}건)
      </button>
      {showDeleted && (
        <div className="-mx-4 mt-2 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[760px] text-center text-sm opacity-70">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-3 font-semibold">순번</th>
                <th className="px-3 py-3 font-semibold">이름</th>
                <th className="px-3 py-3 font-semibold">근무지</th>
                <th className="px-3 py-3 font-semibold">퇴사예정일</th>
                <th className="px-3 py-3 font-semibold">퇴사사유</th>
                <th className="px-3 py-3 font-semibold">상태</th>
                <th className="px-3 py-3 font-semibold">미리보기</th>
                <th className="px-3 py-3 font-semibold">삭제일</th>
              </tr>
            </thead>
            <tbody>
              {deleted.map((req, i) => {
                const [label, tone] = STATUS_LABEL[computeResignationStatus(req)] || ["-", "muted"];
                return (
                  <tr key={req.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-3 text-ink">{i + 1}</td>
                    <td className="px-3 py-3 text-ink">{req.employeeName}</td>
                    <td className="px-3 py-3 text-ink">{req.siteName || "-"}</td>
                    <td className="px-3 py-3 text-ink">{req.resignDate ? formatDate(req.resignDate) : "-"}</td>
                    <td className="px-3 py-3 text-ink">{req.reason || "-"}</td>
                    <td className="px-3 py-3">
                      <Badge tone={tone}>{label}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => previewReq(req)}>
                        <FileText size={13} /> 보기
                      </button>
                    </td>
                    <td className="px-3 py-3 text-ink">{req.deletedAt || "-"}</td>
                  </tr>
                );
              })}
              {deleted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted">
                    삭제된 사직서가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(signTarget)}
        onClose={() => setSignTarget(null)}
        title={signTarget?.stage === "ceo" ? "대표 결재" : "담당 결재"}
        footer={
          previewMode ? (
            <Button className="w-full" onClick={() => setPreviewMode(false)}>
              내용 확인 완료 · 결재 진행
            </Button>
          ) : (
            <>
              <Button variant="danger" onClick={() => submitDecision("rejected")} disabled={saving}>
                반려
              </Button>
              <Button className="flex-1" onClick={() => submitDecision("approved")} disabled={saving}>
                {saving ? "처리 중..." : "승인(서명)"}
              </Button>
            </>
          )
        }
      >
        {signTarget && (
          <div className="space-y-3">
            {previewMode ? (
              <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-ink">
                <p className="text-center text-sm font-bold">사 직 서 (원)</p>
                <div className="flex justify-center">
                  <ApprovalBox steps={approvalStepsFor(signTarget.req)} />
                </div>
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
              </div>
            ) : (
              <>
                <p className="text-sm text-ink">
                  {signTarget.req.employeeName}님의 사직서에 {signTarget.stage === "ceo" ? "대표" : "담당"}로서 결재
                  합니다. 승인은 서명이 필요하고, 반려는 사유만 남기면 됩니다.
                  {(signTarget.stage === "manager" ? signTarget.req.managerDecisionCount : signTarget.req.ceoDecisionCount) ? (
                    <span className="ml-1 font-medium text-warning">(수정 결재 · 마지막 1회)</span>
                  ) : null}
                </p>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">반려 사유 (승인 시에는 불필요)</span>
                  <textarea
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    rows={2}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                </label>
                <p className="mb-1 text-xs font-medium text-muted">승인 서명</p>
                <SignaturePad ref={padRef} />
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(viewTarget)}
        onClose={() => setViewTarget(null)}
        title="결재상황"
        footer={
          <Button variant="outline" className="w-full" onClick={() => setViewTarget(null)}>
            닫기
          </Button>
        }
      >
        {viewTarget && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <ApprovalBox steps={approvalStepsFor(viewTarget)} />
            </div>
            <div className="flex items-center justify-center">
              <Badge tone={(STATUS_LABEL[computeResignationStatus(viewTarget)] || ["-", "muted"])[1]}>
                {(STATUS_LABEL[computeResignationStatus(viewTarget)] || ["-", "muted"])[0]}
              </Badge>
            </div>
            <div className="space-y-2 rounded-xl bg-slate-50 p-3.5 text-xs text-ink">
              <div className="flex items-center justify-between">
                <span className="text-muted">담당</span>
                <span>
                  {viewTarget.managerName ? `${viewTarget.managerName} · ` : ""}
                  {getManagerResult(viewTarget) === "rejected" ? "반려" : getManagerResult(viewTarget) === "approved" ? "승인" : "대기중"}
                  {viewTarget.managerSignedAt ? ` (${formatDate(viewTarget.managerSignedAt)})` : ""}
                </span>
              </div>
              {viewTarget.managerNote && <p className="text-danger">반려사유: {viewTarget.managerNote}</p>}
              <div className="flex items-center justify-between">
                <span className="text-muted">대표</span>
                <span>
                  {viewTarget.ceoName ? `${viewTarget.ceoName} · ` : ""}
                  {getCeoResult(viewTarget) === "rejected" ? "반려" : getCeoResult(viewTarget) === "approved" ? "승인" : "대기중"}
                  {viewTarget.ceoSignedAt ? ` (${formatDate(viewTarget.ceoSignedAt)})` : ""}
                </span>
              </div>
              {viewTarget.ceoNote && <p className="text-danger">반려사유: {viewTarget.ceoNote}</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
