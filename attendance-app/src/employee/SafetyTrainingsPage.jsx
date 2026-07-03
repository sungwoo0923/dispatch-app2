import { useEffect, useRef, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { ShieldCheck } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import { formatDate, formatTime } from "../utils/dateUtils";
import { signSafetyAttendance } from "../utils/safety";

export default function SafetyTrainingsPage() {
  const { user, profile } = useAuth();
  const [records, setRecords] = useState([]);
  const [signing, setSigning] = useState(null);
  const [saving, setSaving] = useState(false);
  const padRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "attendance"), where("uid", "==", user.uid), orderBy("date", "desc"), limit(60));
    const unsub = onSnapshot(q, (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [user]);

  const rows = records.filter((r) => r.status === "출근" && r.siteId);

  const submitSignature = async () => {
    if (!padRef.current || padRef.current.isEmpty() || !signing) return;
    setSaving(true);
    await signSafetyAttendance({
      attendanceDocId: signing.id,
      companyId: profile.companyId,
      siteId: signing.siteId,
      signatureDataUrl: padRef.current.getDataUrl(),
    });
    setSaving(false);
    setSigning(null);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <h2 className="text-sm font-semibold text-ink">안전교육</h2>
      {rows.length === 0 && <p className="text-xs text-muted">안전관리 근무지 출근 기록이 없습니다.</p>}
      {rows.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-primary">
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{formatDate(r.date)}</p>
                <p className="text-xs text-muted">
                  {r.siteName} {r.checkInTime ? `· 출근 ${formatTime(r.checkInTime)}` : ""}
                </p>
              </div>
            </div>
            {r.safetySignature ? <Badge tone="success">서명완료</Badge> : <Badge tone="warning">서명필요</Badge>}
          </div>
          {!r.safetySignature && (
            <Button size="sm" className="mt-3 w-full" onClick={() => setSigning(r)}>
              안전교육 서명
            </Button>
          )}
        </Card>
      ))}

      <Modal
        open={Boolean(signing)}
        onClose={() => setSigning(null)}
        title="안전교육 서명"
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
        <p className="mb-3 text-sm text-ink">{signing && formatDate(signing.date)} 안전교육 서명</p>
        <SignaturePad ref={padRef} />
      </Modal>
    </div>
  );
}
