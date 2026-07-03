import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { ShieldCheck } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import { formatDate, toDateKey } from "../utils/dateUtils";

export default function SafetyTrainingsPage() {
  const { user, profile } = useAuth();
  const [trainings, setTrainings] = useState([]);
  const [myAttendance, setMyAttendance] = useState([]);
  const [signing, setSigning] = useState(null);
  const [saving, setSaving] = useState(false);
  const padRef = useRef(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubTrainings = onSnapshot(
      query(collection(db, "safetyTrainings"), where("companyId", "==", profile.companyId)),
      (snap) => setTrainings(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsubTrainings();
  }, [profile?.companyId]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, "trainingAttendance"), where("uid", "==", user.uid)), (snap) =>
      setMyAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  const isSigned = (trainingId) => myAttendance.some((a) => a.trainingId === trainingId);

  const submitSignature = async () => {
    if (!padRef.current || padRef.current.isEmpty() || !signing) return;
    setSaving(true);
    await addDoc(collection(db, "trainingAttendance"), {
      companyId: profile.companyId,
      trainingId: signing.id,
      uid: user.uid,
      employeeName: profile.name,
      signatureDataUrl: padRef.current.getDataUrl(),
      signedAt: toDateKey(),
    });
    setSaving(false);
    setSigning(null);
  };

  const sorted = [...trainings].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">안전교육</h2>
      {sorted.length === 0 && <p className="text-xs text-muted">등록된 안전교육이 없습니다.</p>}
      {sorted.map((t) => (
        <Card key={t.id} className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{t.title}</p>
                <p className="text-xs text-muted">
                  {formatDate(t.date)} {t.siteName ? `· ${t.siteName}` : ""}
                </p>
              </div>
            </div>
            {isSigned(t.id) ? <Badge tone="success">참석완료</Badge> : <Badge tone="warning">서명필요</Badge>}
          </div>
          {t.content && <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted">{t.content}</p>}
          {!isSigned(t.id) && (
            <Button size="sm" className="mt-3 w-full" onClick={() => setSigning(t)}>
              참석 서명
            </Button>
          )}
        </Card>
      ))}

      <Modal
        open={Boolean(signing)}
        onClose={() => setSigning(null)}
        title="참석 서명"
        footer={
          <>
            <Button variant="outline" onClick={() => setSigning(null)}>
              취소
            </Button>
            <Button onClick={submitSignature} disabled={saving}>
              {saving ? "제출 중..." : "서명 제출"}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink">{signing?.title}</p>
        <SignaturePad ref={padRef} />
      </Modal>
    </div>
  );
}
