import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { FileSignature, Trash2, Eye } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { buildDefaultContract } from "../utils/contractTemplate";
import { formatDate } from "../utils/dateUtils";

export default function Contracts() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const [contracts, setContracts] = useState([]);

  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState({ uid: "", title: "근로계약서", startDate: "", endDate: "", content: "" });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubEmp = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubContracts = onSnapshot(
      query(collection(db, "contracts"), where("companyId", "==", profile.companyId)),
      (snap) => setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    return () => {
      unsubEmp();
      unsubSites();
      unsubContracts();
    };
  }, [profile?.companyId]);

  const sortedContracts = useMemo(
    () => [...contracts].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)),
    [contracts]
  );

  const openNew = () => {
    setForm({ uid: "", title: "근로계약서", startDate: "", endDate: "", content: "" });
    setOpen(true);
  };

  const applyTemplate = () => {
    const emp = employees.find((e) => e.id === form.uid);
    if (!emp) return;
    const site = workSites.find((s) => s.id === emp.workSiteId);
    setForm((f) => ({
      ...f,
      content: buildDefaultContract({
        employeeName: emp.name,
        hireDate: emp.hireDate,
        position: emp.position,
        siteName: site?.name,
        companyName,
      }),
      startDate: f.startDate || emp.hireDate || "",
    }));
  };

  const send = async (e) => {
    e.preventDefault();
    const emp = employees.find((x) => x.id === form.uid);
    await addDoc(collection(db, "contracts"), {
      companyId: profile.companyId,
      uid: form.uid,
      employeeName: emp?.name || "",
      title: form.title,
      startDate: form.startDate,
      endDate: form.endDate || null,
      content: form.content,
      status: "sent",
      signatureDataUrl: null,
      signedAt: null,
      createdAt: serverTimestamp(),
    });
    setOpen(false);
  };

  const remove = (id) => deleteDoc(doc(db, "contracts", id));

  return (
    <div className="space-y-6">
      <Panel
        icon={FileSignature}
        title={`계약서 (${sortedContracts.length}건)`}
        actions={
          <Button onClick={openNew}>
            <FileSignature size={16} /> 계약서 발송
          </Button>
        }
      >
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-medium">순번</th>
                <th className="px-4 py-3 font-medium">근로자</th>
                <th className="px-4 py-3 font-medium">제목</th>
                <th className="px-4 py-3 font-medium">계약기간</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">서명일</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sortedContracts.map((c, i) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{c.employeeName}</td>
                  <td className="px-4 py-3 text-muted">{c.title}</td>
                  <td className="px-4 py-3 text-muted">
                    {formatDate(c.startDate)} {c.endDate ? `~ ${formatDate(c.endDate)}` : "(기간 무기한)"}
                  </td>
                  <td className="px-4 py-3">
                    {c.status === "signed" ? <Badge tone="success">서명완료</Badge> : <Badge tone="warning">서명대기</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted">{c.signedAt ? formatDate(c.signedAt) : "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button className="text-muted hover:text-primary" title="보기" onClick={() => setViewing(c)}>
                        <Eye size={16} />
                      </button>
                      {c.status !== "signed" && (
                        <button className="text-muted hover:text-danger" title="삭제" onClick={() => remove(c.id)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {sortedContracts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted">
                    발송된 계약서가 없습니다.
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
        title="계약서 발송"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={send} disabled={!form.uid || !form.content}>
              발송
            </Button>
          </>
        }
      >
        <form onSubmit={send} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">대상 근로자</span>
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
              <span className="mb-1.5 block text-xs font-medium text-muted">제목</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">계약 시작일</span>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">계약 종료일 (선택)</span>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </label>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">계약 내용</span>
            <button
              type="button"
              onClick={applyTemplate}
              disabled={!form.uid}
              className="text-xs text-primary hover:underline disabled:opacity-40"
            >
              기본양식 불러오기
            </button>
          </div>
          <textarea
            required
            rows={12}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 font-mono text-xs leading-relaxed"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
          />
        </form>
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.title} size="lg" footer={<Button onClick={() => setViewing(null)}>닫기</Button>}>
        {viewing && (
          <div>
            <pre className="mb-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-mono text-xs leading-relaxed">
              {viewing.content}
            </pre>
            {viewing.status === "signed" ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">서명 ({viewing.signedAt})</p>
                <img src={viewing.signatureDataUrl} alt="서명" className="h-24 rounded-xl border border-slate-200 bg-white" />
              </div>
            ) : (
              <p className="text-xs text-warning">아직 근로자가 서명하지 않았습니다.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
