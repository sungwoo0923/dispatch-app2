import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ArrowLeft, PenLine, Download } from "lucide-react";
import { db } from "../firebase";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import { toDateKey, formatDate } from "../utils/dateUtils";

export default function ContractDetail() {
  const { contractId } = useParams();
  const [contract, setContract] = useState(null);
  const [signing, setSigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const padRef = useRef(null);

  useEffect(() => {
    getDoc(doc(db, "contracts", contractId)).then((snap) => {
      if (snap.exists()) setContract({ id: snap.id, ...snap.data() });
    });
  }, [contractId]);

  const submitSignature = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setSaving(true);
    const employeeSignatureDataUrl = padRef.current.getDataUrl();
    const employeeSignedAt = toDateKey();
    const status = contract.companySignatureDataUrl ? "signed" : "sent";
    await updateDoc(doc(db, "contracts", contractId), { status, employeeSignatureDataUrl, employeeSignedAt });
    setContract((c) => ({ ...c, status, employeeSignatureDataUrl, employeeSignedAt }));
    setSaving(false);
    setSigning(false);
  };

  const downloadContract = () => {
    const text =
      `${contract.title}\n\n${contract.content || ""}\n\n` +
      `갑(회사) 서명일: ${contract.companySignedAt ? formatDate(contract.companySignedAt) : "미서명"}\n` +
      `을(근로자) 서명일: ${contract.employeeSignedAt ? formatDate(contract.employeeSignedAt) : "미서명"}\n`;
    const blob = new Blob(["﻿" + text], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${contract.title || "계약서"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!contract) return <p className="px-4 pt-4 text-xs text-muted">불러오는 중...</p>;

  return (
    <div className="space-y-4 px-4 pt-4">
      <Link to="/contracts" className="flex items-center gap-1 text-xs text-muted">
        <ArrowLeft size={14} /> 계약서 목록
      </Link>

      <Card className="p-5">
        <p className="mb-3 text-center text-base font-semibold text-ink">{contract.title}</p>
        <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-[11px] leading-relaxed text-ink">
          {contract.content}
        </pre>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <p className="mb-1.5 text-xs font-medium text-muted">갑 (회사)</p>
          {contract.companySignatureDataUrl ? (
            <img src={contract.companySignatureDataUrl} alt="회사 서명/도장" className="mx-auto h-16 rounded-lg border border-slate-200 bg-white" />
          ) : (
            <p className="text-xs text-warning">서명 대기중</p>
          )}
          {contract.companySignedAt && <p className="mt-1 text-[11px] text-muted">{formatDate(contract.companySignedAt)}</p>}
        </Card>
        <Card className="p-4 text-center">
          <p className="mb-1.5 text-xs font-medium text-muted">을 (근로자)</p>
          {contract.employeeSignatureDataUrl ? (
            <img src={contract.employeeSignatureDataUrl} alt="내 서명" className="mx-auto h-16 rounded-lg border border-slate-200 bg-white" />
          ) : (
            <p className="text-xs text-warning">서명 필요</p>
          )}
          {contract.employeeSignedAt && <p className="mt-1 text-[11px] text-muted">{formatDate(contract.employeeSignedAt)}</p>}
        </Card>
      </div>

      <div className="flex flex-nowrap gap-2">
        <Button className="flex-1" size="lg" onClick={() => setSigning(true)}>
          <PenLine size={16} /> {contract.employeeSignatureDataUrl ? "재서명" : "서명하기"}
        </Button>
        <Button className="flex-1" size="lg" variant="outline" onClick={downloadContract}>
          <Download size={16} /> 다운로드
        </Button>
      </div>

      <Modal
        open={signing}
        onClose={() => setSigning(false)}
        title="서명"
        footer={
          <>
            <Button variant="outline" onClick={() => setSigning(false)}>
              취소
            </Button>
            <Button onClick={submitSignature} disabled={saving}>
              {saving ? "저장 중..." : "서명 저장"}
            </Button>
          </>
        }
      >
        <SignaturePad ref={padRef} />
      </Modal>
    </div>
  );
}
