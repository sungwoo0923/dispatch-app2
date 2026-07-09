import { useEffect, useRef, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { ShieldCheck, FileText, Video } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
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
      <h2 className="text-base font-bold text-ink">안전교육</h2>

      <MandatoryMaterials />

      <p className="mt-2 text-sm font-semibold text-ink">출근일자별 안전교육 서명</p>
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

// 관리자가 등록한 안전교육자료(지침/영상)를 근로자가 확인 후 서명하면
// 이수 처리되는 섹션. 예전에는 끝까지 스크롤/시청해야만 서명칸이 열리게
// 막아뒀는데, 모바일(특히 iOS)에서 중첩 스크롤 영역이 제대로 동작하지
// 않아 끝까지 내려도 서명칸이 안 뜨는 문제가 있었다 — 서명/제출 버튼은
// 스크롤 진행과 상관없이 항상 눌러 제출할 수 있게 뒀다.
function MandatoryMaterials() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [materials, setMaterials] = useState([]);
  const [myCompletions, setMyCompletions] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const padRef = useRef(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "safetyMaterials"), where("companyId", "==", profile.companyId), where("active", "==", true)), (s) =>
        setMaterials(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "safetyCompletions"), where("uid", "==", user.uid)), (s) =>
        setMyCompletions(s.docs.map((d) => d.data()))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId, user?.uid]);

  const completedIds = new Set(myCompletions.map((c) => c.materialId));
  const pending = materials.filter((m) => !completedIds.has(m.id));

  const openMaterial = (m) => setViewing(m);

  const submitCompletion = async () => {
    if (!padRef.current || padRef.current.isEmpty() || !viewing) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "safetyCompletions"), {
        companyId: profile.companyId,
        materialId: viewing.id,
        uid: user.uid,
        name: profile.name,
        signatureDataUrl: padRef.current.getDataUrl(),
        completedAt: serverTimestamp(),
      });
      toast.success("이수 처리되었습니다");
      setViewing(null);
    } catch (err) {
      toast.error(`이수 처리에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSaving(false);
    }
  };

  if (materials.length === 0) return null;

  return (
    <>
      <Card className={`p-4 ${pending.length > 0 ? "border border-danger/20 bg-red-50" : ""}`}>
        <p className="mb-2 text-sm font-bold text-ink">필수 안전교육자료 {pending.length > 0 && <span className="text-danger">(미이수 {pending.length}건)</span>}</p>
        <div className="space-y-2">
          {materials.map((m) => {
            const done = completedIds.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => !done && openMaterial(m)}
                disabled={done}
                className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left disabled:opacity-60"
              >
                {m.type === "video" ? <Video size={16} className="shrink-0 text-primary" /> : <FileText size={16} className="shrink-0 text-primary" />}
                <span className="flex-1 truncate text-sm font-medium text-ink">{m.title}</span>
                <Badge tone={done ? "success" : "warning"}>{done ? "이수완료" : "이수필요"}</Badge>
              </button>
            );
          })}
        </div>
      </Card>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.title}
        footer={
          <>
            <Button variant="outline" onClick={() => setViewing(null)}>
              취소
            </Button>
            <Button className="flex-1" onClick={submitCompletion} disabled={saving}>
              {saving ? "제출 중..." : "서명 후 이수완료"}
            </Button>
          </>
        }
      >
        {viewing && (
          <div className="space-y-3">
            {viewing.type === "video" ? (
              <video src={viewing.videoUrl} controls className="w-full rounded-xl bg-black" />
            ) : (
              <div className="max-h-72 overflow-y-auto whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-ink">
                {viewing.content}
              </div>
            )}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">서명</p>
              <SignaturePad ref={padRef} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
