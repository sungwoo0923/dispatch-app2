import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Upload, Trash2, FileText } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { DOCUMENT_TYPE_OPTIONS, uploadEmployeeDocument, deleteEmployeeDocument } from "../utils/documents";
import { formatDate } from "../utils/dateUtils";

export default function Documents() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [filterUid, setFilterUid] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ uid: "", docType: DOCUMENT_TYPE_OPTIONS[0] });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubEmp = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubDocs = onSnapshot(
      query(collection(db, "documents"), where("companyId", "==", profile.companyId)),
      (snap) => setDocuments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubEmp();
      unsubDocs();
    };
  }, [profile?.companyId]);

  const filtered = filterUid ? documents.filter((d) => d.uid === filterUid) : documents;
  const sorted = [...filtered].sort((a, b) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0));

  const submitUpload = async (e) => {
    e.preventDefault();
    if (!file || !form.uid) return;
    setUploading(true);
    const emp = employees.find((x) => x.id === form.uid);
    await uploadEmployeeDocument({
      companyId: profile.companyId,
      uid: form.uid,
      employeeName: emp?.name || "",
      docType: form.docType,
      file,
    });
    setUploading(false);
    setOpen(false);
    setFile(null);
    setForm({ uid: "", docType: DOCUMENT_TYPE_OPTIONS[0] });
  };

  return (
    <div className="space-y-6">
      <Panel
        icon={FileText}
        title={`서류함 (${sorted.length}건)`}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Upload size={16} /> 서류 업로드
          </Button>
        }
      >
        <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">근로자</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filterUid}
              onChange={(e) => setFilterUid(e.target.value)}
            >
              <option value="">전체</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        </Card>

        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[680px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">근로자</th>
                <th className="px-4 py-3 font-semibold">문서종류</th>
                <th className="px-4 py-3 font-semibold">파일명</th>
                <th className="px-4 py-3 font-semibold">업로드일</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => (
                <tr key={d.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{d.employeeName}</td>
                  <td className="px-4 py-3 text-muted">{d.docType}</td>
                  <td className="px-4 py-3">
                    <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                      <FileText size={14} /> {d.fileName}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {d.uploadedAt?.toDate ? formatDate(d.uploadedAt.toDate().toISOString().slice(0, 10)) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-muted hover:text-danger" title="삭제" onClick={() => deleteEmployeeDocument(d)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted">
                    업로드된 서류가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="서류 업로드"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submitUpload} disabled={!file || !form.uid || uploading}>
              {uploading ? "업로드 중..." : "업로드"}
            </Button>
          </>
        }
      >
        <form onSubmit={submitUpload} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">근로자</span>
            <select
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.uid}
              onChange={(e) => setForm((f) => ({ ...f, uid: e.target.value }))}
            >
              <option value="">선택</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">문서종류</span>
            <select
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.docType}
              onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
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
