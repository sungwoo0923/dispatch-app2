import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { ArrowLeft } from "lucide-react";
import { db } from "../firebase";
import Card from "../components/Card";
import Button from "../components/Button";
import SignaturePad from "../components/SignaturePad";
import { toDateKey } from "../utils/dateUtils";

export default function ContractDetail() {
  const { contractId } = useParams();
  const [contract, setContract] = useState(null);
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
    const signatureDataUrl = padRef.current.getDataUrl();
    await updateDoc(doc(db, "contracts", contractId), {
      status: "signed",
      signatureDataUrl,
      signedAt: toDateKey(),
    });
    setContract((c) => ({ ...c, status: "signed", signatureDataUrl, signedAt: toDateKey() }));
    setSaving(false);
  };

  if (!contract) return <p className="px-4 pt-4 text-xs text-muted">불러오는 중...</p>;

  return (
    <div className="space-y-4 px-4 pt-4">
      <Link to="/contracts" className="flex items-center gap-1 text-xs text-muted">
        <ArrowLeft size={14} /> 계약서 목록
      </Link>

      <Card className="p-5">
        <p className="mb-3 text-base font-semibold text-ink">{contract.title}</p>
        <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-mono text-[11px] leading-relaxed">
          {contract.content}
        </pre>
      </Card>

      {contract.status === "signed" ? (
        <Card className="p-5">
          <p className="mb-1.5 text-xs font-medium text-muted">서명 완료 ({contract.signedAt})</p>
          <img src={contract.signatureDataUrl} alt="서명" className="h-24 rounded-xl border border-slate-200 bg-white" />
        </Card>
      ) : (
        <Card className="p-5">
          <p className="mb-2 text-sm font-semibold text-ink">서명하기</p>
          <SignaturePad ref={padRef} />
          <Button className="mt-3 w-full" size="lg" onClick={submitSignature} disabled={saving}>
            {saving ? "제출 중..." : "서명하고 제출"}
          </Button>
        </Card>
      )}
    </div>
  );
}
