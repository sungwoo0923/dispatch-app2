import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Plus, Trash2, Percent } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { toDateKey } from "../utils/dateUtils";

export default function SiteInsuranceRates() {
  const { profile } = useAuth();
  const [workSites, setWorkSites] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ siteId: "", templateId: "", effectiveDate: toDateKey() });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubTemplates = onSnapshot(
      query(collection(db, "insuranceRateTemplates"), where("companyId", "==", profile.companyId)),
      (snap) => setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubAssignments = onSnapshot(
      query(collection(db, "siteInsuranceRates"), where("companyId", "==", profile.companyId)),
      (snap) => setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubSites();
      unsubTemplates();
      unsubAssignments();
    };
  }, [profile?.companyId]);

  const sorted = [...assignments].sort((a, b) => (b.effectiveDate || "").localeCompare(a.effectiveDate || ""));

  const submit = async (e) => {
    e.preventDefault();
    const site = workSites.find((s) => s.id === form.siteId);
    const template = templates.find((t) => t.id === form.templateId);
    if (!site || !template) return;
    await addDoc(collection(db, "siteInsuranceRates"), {
      companyId: profile.companyId,
      siteId: site.id,
      siteName: site.name,
      templateId: template.id,
      templateName: template.name,
      rates: template.rates,
      effectiveDate: form.effectiveDate,
      createdAt: serverTimestamp(),
    });
    setForm({ siteId: "", templateId: "", effectiveDate: toDateKey() });
    setOpen(false);
  };

  const remove = (id) => deleteDoc(doc(db, "siteInsuranceRates", id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">센터별 정산설정</h1>
          <p className="text-sm text-muted">센터에서 근로자에게 적용하는 보험 요율을 설정일자별로 관리합니다.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={templates.length === 0}>
          <Plus size={16} /> 신규
        </Button>
      </div>

      {templates.length === 0 && (
        <Card className="p-4 text-xs text-warning">
          먼저 템플릿 관리 메뉴에서 보험요율템플릿을 등록해주세요.
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-medium">센터</th>
              <th className="px-4 py-3 font-medium">템플릿명</th>
              <th className="px-4 py-3 font-medium">보험요율항목</th>
              <th className="px-4 py-3 font-medium">설정일자</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-ink">{a.siteName}</td>
                <td className="px-4 py-3 text-muted">{a.templateName}</td>
                <td className="px-4 py-3 text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Percent size={12} />
                    국민연금 {(a.rates?.pension * 100).toFixed(2)} · 건강보험 {(a.rates?.health * 100).toFixed(2)} · 고용보험{" "}
                    {(a.rates?.employment * 100).toFixed(2)}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{a.effectiveDate}</td>
                <td className="px-4 py-3">
                  <button className="text-muted hover:text-danger" onClick={() => remove(a.id)} title="삭제">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted">
                  설정된 보험요율이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="센터별 보험요율 설정"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={submit} disabled={!form.siteId || !form.templateId}>
              적용
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
            <select
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.siteId}
              onChange={(e) => setForm((f) => ({ ...f, siteId: e.target.value }))}
            >
              <option value="">선택</option>
              {workSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">보험요율템플릿</span>
            <select
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.templateId}
              onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
            >
              <option value="">선택</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">설정일자</span>
            <input
              type="date"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={form.effectiveDate}
              onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
