import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ShieldCheck, Plus, Trash2, RefreshCw, Search, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Panel from "../components/Panel";
import SidePanel from "../components/SidePanel";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate, toDateKey } from "../utils/dateUtils";
import { openReportPreview } from "../utils/reportTemplates";
import { SAFETY_MANAGER_ROLES } from "../utils/safety";

const TABS = [
  { key: "settings", label: "안전관리설정" },
  { key: "managers", label: "안전담당" },
  { key: "reports", label: "안전교육리포트" },
];

const EMPTY_MANAGER_FORM = { role: SAFETY_MANAGER_ROLES[0], adminUid: "", effectiveDate: toDateKey(), note: "" };
const EMPTY_REPORT_FORM = { reportId: "", effectiveDate: toDateKey() };

export default function SafetySettings() {
  const { profile } = useAuth();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [managers, setManagers] = useState([]);
  const [siteReports, setSiteReports] = useState([]);
  const [centerReports, setCenterReports] = useState([]);

  const [filters, setFilters] = useState({ businessEntityId: "", siteName: "" });
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("settings");
  const [manageYN, setManageYN] = useState("사용");

  const [managerChecked, setManagerChecked] = useState(() => new Set());
  const [managerForm, setManagerForm] = useState(EMPTY_MANAGER_FORM);

  const [reportChecked, setReportChecked] = useState(() => new Set());
  const [reportForm, setReportForm] = useState(EMPTY_REPORT_FORM);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (snap) =>
        setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")), (snap) =>
        setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "safetyManagers"), where("companyId", "==", profile.companyId)), (snap) =>
        setManagers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "siteSafetyReports"), where("companyId", "==", profile.companyId)), (snap) =>
        setSiteReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "centerReports"), where("companyId", "==", profile.companyId)), (snap) =>
        setCenterReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName_ = (id) => entities.find((e) => e.id === id)?.name || "-";
  const selectedSite = workSites.find((s) => s.id === selectedId) || null;
  const managersFor = (siteId) => managers.filter((m) => m.siteId === siteId);
  const reportsFor = (siteId) => siteReports.filter((r) => r.siteId === siteId);
  const safetyTemplates = useMemo(() => centerReports.filter((r) => r.docType === "안전교육일지"), [centerReports]);

  const rows = useMemo(
    () =>
      workSites.filter(
        (s) => (!filters.businessEntityId || s.businessEntityId === filters.businessEntityId) && (!filters.siteName || s.name?.includes(filters.siteName))
      ),
    [workSites, filters]
  );

  const openDetail = (site) => {
    setSelectedId(site.id);
    setManageYN(site.safetyManaged ? "사용" : "미사용");
    setTab("settings");
    setManagerForm(EMPTY_MANAGER_FORM);
    setReportForm(EMPTY_REPORT_FORM);
    setManagerChecked(new Set());
    setReportChecked(new Set());
    setPanelOpen(true);
  };
  const closePanel = () => setPanelOpen(false);

  const saveSettings = async () => {
    if (!selectedId) return;
    await updateDoc(doc(db, "workSites", selectedId), { safetyManaged: manageYN === "사용" });
  };

  const toggleManagerChecked = (id) =>
    setManagerChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addManager = async () => {
    const admin = admins.find((a) => a.id === managerForm.adminUid);
    if (!admin || !selectedId) return;
    await addDoc(collection(db, "safetyManagers"), {
      companyId: profile.companyId,
      siteId: selectedId,
      siteName: selectedSite?.name || "",
      adminUid: admin.id,
      adminName: admin.name,
      adminEmail: admin.email || "-",
      role: managerForm.role,
      effectiveDate: managerForm.effectiveDate,
      note: managerForm.note,
      createdAt: serverTimestamp(),
    });
    setManagerForm({ ...EMPTY_MANAGER_FORM, effectiveDate: toDateKey() });
  };

  const removeManagers = async () => {
    for (const id of managerChecked) await deleteDoc(doc(db, "safetyManagers", id));
    setManagerChecked(new Set());
  };

  const toggleReportChecked = (id) =>
    setReportChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addSiteReport = async () => {
    const template = safetyTemplates.find((t) => t.id === reportForm.reportId);
    if (!template || !selectedId) return;
    await addDoc(collection(db, "siteSafetyReports"), {
      companyId: profile.companyId,
      siteId: selectedId,
      siteName: selectedSite?.name || "",
      reportId: template.id,
      templateName: template.templateName,
      effectiveDate: reportForm.effectiveDate,
      effectiveEndDate: "9999-12-31",
      createdAt: serverTimestamp(),
    });
    setReportForm({ ...EMPTY_REPORT_FORM, effectiveDate: toDateKey() });
  };

  const removeSiteReports = async () => {
    for (const id of reportChecked) await deleteDoc(doc(db, "siteSafetyReports", id));
    setReportChecked(new Set());
  };

  const previewSiteReport = (siteReport) => {
    const template = centerReports.find((t) => t.id === siteReport.reportId);
    if (!template) return;
    openReportPreview(template.docType, template.reportFormat, { siteName: siteReport.siteName, ...(template.extra || {}) });
  };

  const exportCsv = () => {
    const headers = ["사업자", "센터", "안전관리여부", "안전담당", "안전교육리포트"];
    downloadCsv(
      "센터별안전관리",
      headers,
      rows.map((s) => [
        entityName_(s.businessEntityId),
        s.name,
        s.safetyManaged ? "Y" : "N",
        managersFor(s.id).map((m) => m.adminName).join(", ") || "-",
        reportsFor(s.id).map((r) => r.templateName).join(", ") || "-",
      ])
    );
  };

  return (
    <div className="space-y-6">
      <Panel icon={ShieldCheck} title="센터별안전관리">
        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                사업자 <span className="text-danger">*</span>
              </span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.businessEntityId}
                onChange={(e) => setFilters((f) => ({ ...f, businessEntityId: e.target.value }))}
              >
                <option value="">전체</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.siteName}
                onChange={(e) => setFilters((f) => ({ ...f, siteName: e.target.value }))}
                placeholder="센터를 입력하세요."
              />
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50"
                title="새로고침"
                onClick={() => setFilters({ businessEntityId: "", siteName: "" })}
              >
                <RefreshCw size={16} />
              </button>
              <Button>
                <Search size={13} /> 검색
              </Button>
            </div>
          </div>
        </Card>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <FileSpreadsheet size={13} /> 엑셀
          </Button>
        </div>

        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
          <table className="w-full min-w-[720px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-3 py-2.5 font-semibold">순번</th>
                <th className="px-3 py-2.5 font-semibold">상세</th>
                <th className="px-3 py-2.5 font-semibold">사업자</th>
                <th className="px-3 py-2.5 font-semibold">센터</th>
                <th className="px-3 py-2.5 font-semibold">안전관리여부</th>
                <th className="px-3 py-2.5 font-semibold">안전담당</th>
                <th className="px-3 py-2.5 font-semibold">안전교육리포트</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.id} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50" onDoubleClick={() => openDetail(s)}>
                  <td className="px-3 py-2.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <button className="text-xs text-primary hover:underline" onClick={() => openDetail(s)}>
                      상세
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{entityName_(s.businessEntityId)}</td>
                  <td className="px-3 py-2.5 text-ink">{s.name}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={s.safetyManaged ? "success" : "muted"}>{s.safetyManaged ? "Y" : "N"}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {managersFor(s.id)
                      .map((m) => `[${s.name}]총괄책임자 : ${m.adminName}`)
                      .join(", ") || "-"}
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {reportsFor(s.id)
                      .map((r) => `[${formatDate(r.effectiveDate)}]${r.templateName}`)
                      .join(", ") || "-"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted">
                    조회조건에 해당하는 센터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <SidePanel open={panelOpen} onClose={closePanel} title="센터별 안전관리 > 상세">
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="lg:w-48 lg:shrink-0">
            <div className="mb-3 rounded-xl bg-primary-light/40 px-3 py-2 text-center text-sm font-semibold text-primary">
              {selectedSite?.name || "센터"}
            </div>
            <div className="flex flex-row gap-1 overflow-x-auto overscroll-x-contain lg:flex-col">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-center text-sm font-medium ${
                    tab === t.key ? "bg-primary-light text-primary" : "text-muted hover:bg-slate-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1">
            {tab === "settings" && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-ink">안전관리설정</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
                    <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
                      <option>{entityName_(selectedSite?.businessEntityId)}</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
                    <input readOnly className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" value={selectedSite?.name || ""} />
                  </label>
                </div>
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">안전관리여부</span>
                  <div className="flex flex-nowrap gap-4 overflow-x-auto overscroll-x-contain text-sm">
                    {["사용", "미사용"].map((v) => (
                      <label key={v} className="flex items-center gap-1.5">
                        <input type="radio" checked={manageYN === v} onChange={() => setManageYN(v)} />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end border-t border-slate-100 pt-3">
                  <Button onClick={saveSettings}>저장</Button>
                </div>
              </div>
            )}

            {tab === "managers" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">안전담당</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={removeManagers} disabled={managerChecked.size === 0}>
                      <Trash2 size={13} /> 삭제
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
                  <table className="w-full min-w-[560px] text-center text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs text-muted">
                        <th className="px-2 py-2 font-semibold">순번</th>
                        <th className="w-8 px-2 py-2"></th>
                        <th className="px-2 py-2 font-semibold">적용시점</th>
                        <th className="px-2 py-2 font-semibold">관리자구분</th>
                        <th className="px-2 py-2 font-semibold">관리자ID</th>
                        <th className="px-2 py-2 font-semibold">관리자명</th>
                        <th className="px-2 py-2 font-semibold">전자서명</th>
                        <th className="px-2 py-2 font-semibold">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managersFor(selectedId).map((m, i) => {
                        const admin = admins.find((a) => a.id === m.adminUid);
                        return (
                          <tr key={m.id} className="border-b border-slate-50 last:border-0">
                            <td className="px-2 py-2 text-muted">{i + 1}</td>
                            <td className="px-2 py-2">
                              <input type="checkbox" checked={managerChecked.has(m.id)} onChange={() => toggleManagerChecked(m.id)} />
                            </td>
                            <td className="px-2 py-2 text-muted">{m.effectiveDate ? formatDate(m.effectiveDate) : "-"}</td>
                            <td className="px-2 py-2 text-muted">{m.role}</td>
                            <td className="px-2 py-2 text-muted">{m.adminEmail || "-"}</td>
                            <td className="px-2 py-2 text-ink">{m.adminName}</td>
                            <td className="px-2 py-2">
                              {admin?.signatureDataUrl ? <Badge tone="success">등록</Badge> : <Badge tone="muted">미등록</Badge>}
                            </td>
                            <td className="px-2 py-2 text-muted">정상</td>
                          </tr>
                        );
                      })}
                      {managersFor(selectedId).length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-2 py-4 text-center text-xs text-muted">
                            등록된 안전담당자가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      관리자구분 <span className="text-danger">*</span>
                    </span>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={managerForm.role}
                      onChange={(e) => setManagerForm((f) => ({ ...f, role: e.target.value }))}
                    >
                      {SAFETY_MANAGER_ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      관리자명 <span className="text-danger">*</span>
                    </span>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={managerForm.adminUid}
                      onChange={(e) => setManagerForm((f) => ({ ...f, adminUid: e.target.value }))}
                    >
                      <option value="">선택</option>
                      {admins.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      적용시점 <span className="text-danger">*</span>
                    </span>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={managerForm.effectiveDate}
                      onChange={(e) => setManagerForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={managerForm.note}
                      onChange={(e) => setManagerForm((f) => ({ ...f, note: e.target.value }))}
                    />
                  </label>
                  <div className="col-span-full flex justify-end">
                    <Button size="sm" onClick={addManager} disabled={!managerForm.adminUid}>
                      저장
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted">관리자 계정 메뉴에서 전자서명을 등록해야 근로자 서명에 함께 날인됩니다.</p>
              </div>
            )}

            {tab === "reports" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">안전교육리포트</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={removeSiteReports} disabled={reportChecked.size === 0}>
                      <Trash2 size={13} /> 삭제
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-slate-100">
                  <table className="w-full min-w-[560px] text-center text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs text-muted">
                        <th className="px-2 py-2 font-semibold">순번</th>
                        <th className="w-8 px-2 py-2"></th>
                        <th className="px-2 py-2 font-semibold">양식</th>
                        <th className="px-2 py-2 font-semibold">템플릿</th>
                        <th className="px-2 py-2 font-semibold">적용시점</th>
                        <th className="px-2 py-2 font-semibold">적용종료시점</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportsFor(selectedId).map((r, i) => (
                        <tr key={r.id} className="border-b border-slate-50 last:border-0">
                          <td className="px-2 py-2 text-muted">{i + 1}</td>
                          <td className="px-2 py-2">
                            <input type="checkbox" checked={reportChecked.has(r.id)} onChange={() => toggleReportChecked(r.id)} />
                          </td>
                          <td className="px-2 py-2">
                            <button className="text-xs text-primary hover:underline" onClick={() => previewSiteReport(r)}>
                              양식
                            </button>
                          </td>
                          <td className="px-2 py-2 text-ink">{r.templateName}</td>
                          <td className="px-2 py-2 text-muted">{r.effectiveDate ? formatDate(r.effectiveDate) : "-"}</td>
                          <td className="px-2 py-2 text-muted">{r.effectiveEndDate || "9999-12-31"}</td>
                        </tr>
                      ))}
                      {reportsFor(selectedId).length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-2 py-4 text-center text-xs text-muted">
                            조회조건에 해당하는 데이터가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 p-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      안전교육 템플릿 <span className="text-danger">*</span>
                    </span>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={reportForm.reportId}
                      onChange={(e) => setReportForm((f) => ({ ...f, reportId: e.target.value }))}
                    >
                      <option value="">안전교육 템플릿 선택</option>
                      {safetyTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.templateName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">
                      적용시점 <span className="text-danger">*</span>
                    </span>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      value={reportForm.effectiveDate}
                      onChange={(e) => setReportForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                    />
                  </label>
                  <div className="col-span-full flex justify-end">
                    <Button size="sm" onClick={addSiteReport} disabled={!reportForm.reportId}>
                      저장
                    </Button>
                  </div>
                </div>
                {safetyTemplates.length === 0 && (
                  <p className="text-[11px] text-warning">템플릿 &gt; 센터별리포트 메뉴에서 "안전교육일지" 양식을 먼저 등록해주세요.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
