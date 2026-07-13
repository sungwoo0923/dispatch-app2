import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { ArrowLeft, FileText, Video, Download } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Modal from "../components/Modal";

async function downloadFile(url, fileName) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName || "안전교육자료";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank");
  }
}

// 이수를 마친 안전교육자료만 모아두는 보관함 — 아직 이수하지 않은 자료는
// "안전교육" 탭(SafetyTrainingsPage)에서만 보이고, 여기 자료함에는 실제로
// 이수(서명)를 완료한 시점에만 들어온다. 재시청은 이수 여부와 무관하게
// 열람만 가능하고(재서명 불필요), 영상은 다운로드도 가능하다.
export default function SafetyArchivePage() {
  const { user, profile } = useAuth();
  const [materials, setMaterials] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!profile?.companyId || !user) return;
    const unsubs = [
      onSnapshot(query(collection(db, "safetyMaterials"), where("companyId", "==", profile.companyId)), (s) =>
        setMaterials(s.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "safetyCompletions"), where("uid", "==", user.uid)), (s) =>
        setCompletions(s.docs.map((d) => d.data()))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId, user?.uid]);

  const completedMap = new Map(completions.map((c) => [c.materialId, c]));
  const archivedMaterials = materials.filter((m) => completedMap.has(m.id));

  return (
    <div className="space-y-3 px-4 pt-4">
      <Link to="/my-info" className="flex items-center gap-1 text-xs text-muted">
        <ArrowLeft size={14} /> 내정보
      </Link>
      <h2 className="text-sm font-semibold text-ink">안전교육자료함</h2>
      <p className="text-xs text-muted">이수를 완료한 안전교육자료가 여기에 모입니다. 언제든 다시 열람할 수 있습니다.</p>

      {archivedMaterials.length === 0 && <p className="text-xs text-muted">아직 이수한 안전교육자료가 없습니다.</p>}
      {archivedMaterials.map((m) => {
        const c = completedMap.get(m.id);
        return (
          <Card key={m.id} className="p-4">
            <button type="button" onClick={() => setViewing(m)} className="flex w-full items-center gap-3 text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
                {m.type === "video" ? <Video size={18} /> : <FileText size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{m.title}</p>
                <p className="text-xs text-muted">이수완료 · {c.completedAt?.toDate ? c.completedAt.toDate().toISOString().slice(0, 10) : ""}</p>
              </div>
              <Badge tone="success">이수완료</Badge>
            </button>
          </Card>
        );
      })}

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.title}
        footer={
          viewing?.type === "video" ? (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-ink"
              onClick={() => downloadFile(viewing.videoUrl, `${viewing.title}.mp4`)}
            >
              <Download size={16} /> 영상 다운로드
            </button>
          ) : null
        }
      >
        {viewing &&
          (viewing.type === "video" ? (
            <video src={viewing.videoUrl} controls className="w-full rounded-xl bg-black" />
          ) : (
            <div className="max-h-96 overflow-y-auto whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-ink">
              {viewing.content}
            </div>
          ))}
      </Modal>
    </div>
  );
}
