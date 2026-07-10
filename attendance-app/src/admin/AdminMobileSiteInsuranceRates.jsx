import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { Search, Plus, Trash2, Percent } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { toDateKey } from "../utils/dateUtils";

// 센터별 정산설정의 모바일 전용 화면 — 센터별로 적용 중인 보험요율 이력을
// 카드로 보여주고, 등록 시트에서 센터·템플릿·설정일자를 골라 새 이력을
// 추가한다.
export default function AdminMobileSiteInsuranceRates() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [workSites, setWorkSites] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [elements, setElements] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [search, setSearch] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [quickForm, setQuickForm] = useState({ siteId: "", templateId: "", effectiveDate: toDateKey() });
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "insuranceRateTemplates"), where("companyId", "==", profile.companyId)), (snap) => setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "insuranceRateElements"), where("companyId", "==", profile.companyId)), (snap) => setElements(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "siteInsuranceRates"), where("companyId", "==", profile.companyId)), (snap) => setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const sorted = useMemo(
    () =>
      [...assignments]
        .filter((a) => !search.trim() || a.siteName?.includes(search.trim()) || a.templateName?.includes(search.trim()))
        .sort((a, b) => (b.effectiveDate || "").localeCompare(a.effectiveDate || "")),
    [assignments, search]
  );

  const submitQuickAdd = async () => {
    const site = workSites.find((s) => s.id === quickForm.siteId);
    const template = templates.find((t) => t.id === quickForm.templateId);
    if (!site || !template) return toast.error("센터와 템플릿을 선택해주세요.");
    const rateItems = elements.filter((el) => el.templateId === template.id).map((el) => ({ rateType: el.rateType, ratePercent: el.ratePercent, insuranceApplicable: el.insuranceApplicable }));
    await addDoc(collection(db, "siteInsuranceRates"), {
      companyId: profile.companyId,
      siteId: site.id,
      siteName: site.name,
      templateId: template.id,
      templateName: template.name,
      rateItems,
      effectiveDate: quickForm.effectiveDate,
      createdAt: serverTimestamp(),
    });
    setQuickForm({ siteId: "", templateId: "", effectiveDate: toDateKey() });
    setRegisterOpen(false);
    toast.success("등록되었습니다");
  };

  const remove = async (a) => {
    if (!(await confirm(`"${a.siteName} · ${a.templateName}" 설정을 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "siteInsuranceRates", a.id));
    toast.success("삭제되었습니다");
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">센터별 정산설정</p>
          <p className="mt-0.5 text-xs text-muted">센터별 적용 보험요율 이력입니다</p>
        </div>
        <Button size="sm" onClick={() => setRegisterOpen(true)}>
          <Plus size={13} /> 등록
        </Button>
      </div>

      {templates.length === 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">먼저 템플릿&gt;보험요율 메뉴에서 보험요율템플릿을 등록해주세요.</div>
      )}

      <div className="relative">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="센터 또는 템플릿명 검색" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm" />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {sorted.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">설정된 보험요율이 없습니다.</div>}
        {sorted.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3.5">
            <button type="button" onClick={() => setViewing(a)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-ink">{a.siteName}</p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
                <Percent size={11} /> {a.templateName} · {a.effectiveDate} 적용
              </p>
            </button>
            <button type="button" onClick={() => remove(a)} className="shrink-0 rounded-lg p-1.5 text-muted active:bg-slate-100">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)} title="보험요율 등록">
        <div className="space-y-3">
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={quickForm.siteId} onChange={(e) => setQuickForm((f) => ({ ...f, siteId: e.target.value }))}>
            <option value="">센터 선택</option>
            {workSites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={quickForm.templateId} onChange={(e) => setQuickForm((f) => ({ ...f, templateId: e.target.value }))}>
            <option value="">보험요율템플릿 선택</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={quickForm.effectiveDate} onChange={(e) => setQuickForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
          <Button className="w-full" onClick={submitQuickAdd} disabled={!quickForm.siteId || !quickForm.templateId}>
            적용
          </Button>
        </div>
      </Modal>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={`${viewing?.siteName || ""} · ${viewing?.templateName || ""}`}>
        {viewing && (
          <div className="space-y-1.5 text-sm">
            {(viewing.rateItems || []).map((r, i) => (
              <div key={i} className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-muted">{r.rateType} {r.insuranceApplicable === "미대상" ? "(4대보험 미대상)" : ""}</span>
                <span className="text-ink">{Number(r.ratePercent).toFixed(2)}%</span>
              </div>
            ))}
            {(!viewing.rateItems || viewing.rateItems.length === 0) && <p className="text-xs text-muted">등록된 보험요율 항목이 없습니다.</p>}
            <div className="flex justify-between py-1.5">
              <span className="text-muted">설정일자</span>
              <span className="text-ink">{viewing.effectiveDate}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
