import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { FileText, Trash2, Upload } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { DOCUMENT_TYPE_OPTIONS, uploadEmployeeDocument, deleteEmployeeDocument } from "../utils/documents";
import { useToast } from "../hooks/useToast";

export default function DocumentsPage() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [documents, setDocuments] = useState([]);
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState(DOCUMENT_TYPE_OPTIONS[0]);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, "documents"), where("uid", "==", user.uid)), (snap) =>
      setDocuments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  const submitUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      await uploadEmployeeDocument({
        companyId: profile.companyId,
        uid: user.uid,
        employeeName: profile.name,
        docType,
        file,
      });
      setOpen(false);
      setFile(null);
      toast.success("서류가 업로드되었습니다");
    } catch (err) {
      toast.error(`업로드에 실패했습니다. ${err?.code || err?.message || "다시 시도해주세요."}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">서류함</h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Upload size={14} /> 업로드
        </Button>
      </div>

      {documents.length === 0 && <p className="text-xs text-muted">업로드된 서류가 없습니다.</p>}
      {documents.map((d) => (
        <Card key={d.id} className="flex items-center justify-between gap-3 p-4">
          <a href={d.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
              <FileText size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{d.docType}</p>
              <p className="truncate text-xs text-muted">{d.fileName}</p>
            </div>
          </a>
          <button
            className="shrink-0 text-muted hover:text-danger"
            onClick={() =>
              deleteEmployeeDocument(d)
                .then(() => toast.success("삭제되었습니다"))
                .catch(() => toast.error("삭제에 실패했습니다."))
            }
          >
            <Trash2 size={16} />
          </button>
        </Card>
      ))}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="서류 업로드"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submitUpload} disabled={!file || uploading}>
              {uploading ? "업로드 중..." : "업로드"}
            </Button>
          </>
        }
      >
        <form onSubmit={submitUpload} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">문서종류</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOCUMENT_TYPE_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">파일</span>
            <input
              required
              type="file"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
