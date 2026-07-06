import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { Plus, Trash2, Percent, Settings, FileSpreadsheet, RefreshCw } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";
import { toDateKey } from "../utils/dateUtils";

const SEARCH_FIELDS = ["템플릿명"];

export default function SiteInsuranceRates() {
  const { profile } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [workSites, setWorkSites] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [elements, setElements] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [filters, setFilters] = useState({ siteId: "", searchField: SEARCH_FIELDS[0], searchQuery: "" });
  const [selected, setSelected] = useState(() => new Set());
  const [showNewRow, setShowNewRow] = useState(false);
  const [quickForm, setQuickForm] = useState({ templateId: "", effectiveDate: toDateKey() });
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubTemplates = onSnapshot(
      query(collection(db, "insuranceRateTemplates"), where("companyId", "==", profile.companyId)),
      (snap) => setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubElements = onSnapshot(
      query(collection(db, "insuranceRateElements"), where("companyId", "==", profile.companyId)),
      (snap) => setElements(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubAssignments = onSnapshot(
      query(collection(db, "siteInsuranceRates"), where("companyId", "==", profile.companyId)),
      (snap) => setAssignments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubSites();
      unsubTemplates();
      unsubElements();
      unsubAssignments();
    };
  }, [profile?.companyId]);

  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      if (filters.siteId && a.siteId !== filters.siteId) return false;
      if (filters.searchQuery && !a.templateName?.includes(filters.searchQuery)) return false;
      return true;
    });
  }, [assignments, filters]);

  const sorted = [...filtered].sort((a, b) => (b.effectiveDate || "").localeCompare(a.effectiveDate || ""));

  const toggleSelected = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitQuickAdd = async () => {
    const site = workSites.find((s) => s.id === filters.siteId);
    const template = templates.find((t) => t.id === quickForm.templateId);
    if (!site || !template) return;
    const rateItems = elements
      .filter((el) => el.templateId === template.id)
      .map((el) => ({ rateType: el.rateType, ratePercent: el.ratePercent, insuranceApplicable: el.insuranceApplicable }));
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
    setQuickForm({ templateId: "", effectiveDate: toDateKey() });
    setShowNewRow(false);
  };

  const removeSelected = async () => {
    for (const id of selected) await deleteDoc(doc(db, "siteInsuranceRates", id));
    setSelected(new Set());
  };

  const exportCsv = () => {
    const headers = ["센터", "템플릿명", "보험요율항목", "설정일자"];
    const rows = sorted.map((a) => [
      a.siteName,
      a.templateName,
      (a.rateItems || []).map((r) => `${r.rateType} ${r.ratePercent}%`).join(" / "),
      a.effectiveDate,
    ]);
    downloadCsv("센터별정산설정", headers, rows);
  };

  return (
    <div className="space-y-6">
      <Panel icon={Settings} title="센터별 정산설정">
        <p className="mb-4 text-xs text-muted">센터에서 근로자에게 적용하는 보험 요율을 설정일자별로 관리합니다.</p>

        <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
            <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
              <option>{companyName || "-"}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.siteId}
              onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}
            >
              <option value="">전체</option>
              {workSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">검색조건</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.searchField}
              onChange={(e) => setFilters((f) => ({ ...f, searchField: e.target.value }))}
            >
              {SEARCH_FIELDS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[160px]">
            <span className="mb-1.5 block text-xs font-medium text-muted">검색어</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.searchQuery}
              onChange={(e) => setFilters((f) => ({ ...f, searchQuery: e.target.value }))}
              placeholder="검색어를 입력하세요."
            />
          </label>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50"
              title="새로고침"
              onClick={() => setFilters({ siteId: "", searchField: SEARCH_FIELDS[0], searchQuery: "" })}
            >
              <RefreshCw size={16} />
            </button>
            <Button>검색</Button>
          </div>
        </Card>

        <div className="mb-3 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
          <p className="text-xs font-medium text-muted">목록 {sorted.length}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowNewRow((v) => !v)}>
              <Plus size={14} /> 신규
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet size={14} /> 엑셀
            </Button>
          </div>
        </div>

        {showNewRow && (
          <Card className="mb-3 flex flex-wrap items-end gap-2 p-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">보험요율템플릿 조회하기</span>
              <select
                className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                value={quickForm.templateId}
                onChange={(e) => setQuickForm((f) => ({ ...f, templateId: e.target.value }))}
              >
                <option value="">조회하기</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted">설정일자</span>
              <input
                type="date"
                className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                value={quickForm.effectiveDate}
                onChange={(e) => setQuickForm((f) => ({ ...f, effectiveDate: e.target.value }))}
              />
            </label>
            <Button size="sm" onClick={submitQuickAdd} disabled={!filters.siteId || !quickForm.templateId}>
              적용
            </Button>
            {!filters.siteId && <p className="text-[11px] text-warning">먼저 위 필터에서 센터를 선택해주세요.</p>}
          </Card>
        )}

        {templates.length === 0 && (
          <Card className="mb-4 p-4 text-xs text-warning">먼저 템플릿&gt;보험요율 메뉴에서 보험요율템플릿을 등록해주세요.</Card>
        )}

        {selected.size > 0 && (
          <div className="mb-2 flex justify-end">
            <button className="flex items-center gap-1 text-xs text-danger hover:underline" onClick={removeSelected}>
              <Trash2 size={13} /> 선택 삭제 ({selected.size})
            </button>
          </div>
        )}

        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[860px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold"></th>
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold"></th>
                <th className="px-4 py-3 font-semibold">사업자</th>
                <th className="px-4 py-3 font-semibold">센터</th>
                <th className="px-4 py-3 font-semibold">템플릿명</th>
                <th className="px-4 py-3 font-semibold">보험요율항목</th>
                <th className="px-4 py-3 font-semibold">설정일자</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a, i) => (
                <tr key={a.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelected(a.id)} />
                  </td>
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-primary hover:underline" onClick={() => setViewing(a)}>
                      상세
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted">{companyName}</td>
                  <td className="px-4 py-3 text-ink">{a.siteName}</td>
                  <td className="px-4 py-3 text-muted">{a.templateName}</td>
                  <td className="px-4 py-3 text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Percent size={12} />
                      {(a.rateItems || []).length > 0
                        ? a.rateItems.map((r) => `${r.rateType} ${r.ratePercent}%`).join(" · ")
                        : "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{a.effectiveDate}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted">
                    설정된 보험요율이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={`${viewing?.siteName} · ${viewing?.templateName}`} footer={<Button onClick={() => setViewing(null)}>닫기</Button>}>
        {viewing && (
          <div className="space-y-1.5 text-sm">
            {(viewing.rateItems || []).map((r, i) => (
              <div key={i} className="flex justify-between border-b border-slate-100 py-1.5">
                <span className="text-muted">
                  {r.rateType} {r.insuranceApplicable === "미대상" ? "(4대보험 미대상)" : ""}
                </span>
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
