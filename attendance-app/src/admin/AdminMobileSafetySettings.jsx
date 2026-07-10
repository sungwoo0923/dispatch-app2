import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { Search, Trash2, Monitor, ChevronRight } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { formatDate, toDateKey } from "../utils/dateUtils";
import { SAFETY_MANAGER_ROLES } from "../utils/safety";

const TABS = [
  { key: "settings", label: "설정" },
  { key: "managers", label: "담당자" },
  { key: "reports", label: "리포트" },
];

// 센터별안전관리의 모바일 전용 화면 — 센터 목록에서 카드를 선택하면
// 설정/담당자/리포트 3개 탭을 담은 바텀시트가 열린다. 양식 미리보기는
// 인쇄용 문서라 PC 전용으로 안내한다.
export default function AdminMobileSafetySettings() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [entities, setEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [managers, setManagers] = useState([]);
  const [siteReports, setSiteReports] = useState([]);
  const [centerReports, setCenterReports] = useState([]);
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("settings");
  const [manageYN, setManageYN] = useState("사용");
  const [managerForm, setManagerForm] = useState({ role: SAFETY_MANAGER_ROLES[0], adminUid: "", effectiveDate: toDateKey(), note: "" });
  const [reportForm, setReportForm] = useState({ reportId: "", effectiveDate: toDateKey() });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (snap) => setEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "admin")), (snap) => setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "safetyManagers"), where("companyId", "==", profile.companyId)), (snap) => setManagers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "siteSafetyReports"), where("companyId", "==", profile.companyId)), (snap) => setSiteReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "centerReports"), where("companyId", "==", profile.companyId)), (snap) => setCenterReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName_ = (id) => entities.find((e) => e.id === id)?.name || "-";
  const selectedSite = workSites.find((s) => s.id === selectedId) || null;
  const managersFor = (siteId) => managers.filter((m) => m.siteId === siteId);
  const reportsFor = (siteId) => siteReports.filter((r) => r.siteId === siteId);
  const safetyTemplates = useMemo(() => centerReports.filter((r) => r.docType === "안전교육일지"), [centerReports]);

  const rows = useMemo(() => workSites.filter((s) => !search.trim() || s.name?.includes(search.trim())), [workSites, search]);

  const openDetail = (site) => {
    setSelectedId(site.id);
    setManageYN(site.safetyManaged ? "사용" : "미사용");
    setTab("settings");
    setManagerForm({ role: SAFETY_MANAGER_ROLES[0], adminUid: "", effectiveDate: toDateKey(), note: "" });
    setReportForm({ reportId: "", effectiveDate: toDateKey() });
  };

  const saveSettings = async () => {
    if (!selectedId) return;
    await updateDoc(doc(db, "workSites", selectedId), { safetyManaged: manageYN === "사용" });
    toast.success("저장되었습니다");
  };

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
    setManagerForm({ role: SAFETY_MANAGER_ROLES[0], adminUid: "", effectiveDate: toDateKey(), note: "" });
    toast.success("담당자가 등록되었습니다");
  };

  const removeManager = async (m) => {
    if (!(await confirm(`${m.adminName}님을 안전담당에서 제외하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "safetyManagers", m.id));
  };

  const addSiteReport = async () => {
    const template = safetyTemplates.find((t) => t.id === reportForm.reportId);
    if (!template || !selectedId) {
      toast.error("안전교육 템플릿을 선택해주세요.");
      return;
    }
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
    setReportForm({ reportId: "", effectiveDate: toDateKey() });
    toast.success("리포트가 등록되었습니다");
  };

  const removeSiteReport = async (r) => {
    if (!(await confirm(`"${r.templateName}" 리포트 연결을 삭제하시겠습니까?`, "delete"))) return;
    await deleteDoc(doc(db, "siteSafetyReports", r.id));
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">센터별안전관리</p>
        <p className="mt-0.5 text-xs text-muted">센터를 선택해 안전관리 설정·담당자·리포트를 확인하세요</p>
      </div>

      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="센터 검색"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
        />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">조회조건에 해당하는 센터가 없습니다.</div>}
        {rows.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => openDetail(s)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{s.name}</span>
                <Badge tone={s.safetyManaged ? "success" : "muted"}>{s.safetyManaged ? "안전관리 Y" : "안전관리 N"}</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {entityName_(s.businessEntityId)} · 담당 {managersFor(s.id).length}명 · 리포트 {reportsFor(s.id).length}건
              </p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </button>
        ))}
      </div>

      <Modal open={Boolean(selectedId)} onClose={() => setSelectedId(null)} title={selectedSite?.name || "센터별 안전관리"}>
        {selectedSite && (
          <div className="space-y-4">
            <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    tab === t.key ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "settings" && (
              <div className="space-y-3">
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">안전관리여부</span>
                  <div className="flex gap-2">
                    {["사용", "미사용"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setManageYN(v)}
                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                          manageYN === v ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={saveSettings}>저장</Button>
              </div>
            )}

            {tab === "managers" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  {managersFor(selectedId).length === 0 && <p className="py-4 text-center text-xs text-muted">등록된 안전담당자가 없습니다.</p>}
                  {managersFor(selectedId).map((m) => {
                    const admin = admins.find((a) => a.id === m.adminUid);
                    return (
                      <div key={m.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{m.adminName} · {m.role}</p>
                          <p className="truncate text-xs text-muted">
                            {m.effectiveDate ? formatDate(m.effectiveDate) : "-"} 적용 · 서명 {admin?.signatureDataUrl ? "등록" : "미등록"}
                          </p>
                        </div>
                        <button type="button" onClick={() => removeManager(m)} className="shrink-0 rounded-lg p-1.5 text-muted active:bg-slate-100">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={managerForm.role} onChange={(e) => setManagerForm((f) => ({ ...f, role: e.target.value }))}>
                    {SAFETY_MANAGER_ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={managerForm.adminUid} onChange={(e) => setManagerForm((f) => ({ ...f, adminUid: e.target.value }))}>
                    <option value="">담당 관리자 선택</option>
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={managerForm.effectiveDate} onChange={(e) => setManagerForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
                  <Button size="sm" className="w-full" onClick={addManager} disabled={!managerForm.adminUid}>담당자 추가</Button>
                </div>
              </div>
            )}

            {tab === "reports" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  {reportsFor(selectedId).length === 0 && <p className="py-4 text-center text-xs text-muted">연결된 리포트가 없습니다.</p>}
                  {reportsFor(selectedId).map((r) => (
                    <div key={r.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{r.templateName}</p>
                        <p className="truncate text-xs text-muted">{r.effectiveDate ? formatDate(r.effectiveDate) : "-"} 적용</p>
                      </div>
                      <button type="button" onClick={() => removeSiteReport(r)} className="shrink-0 rounded-lg p-1.5 text-muted active:bg-slate-100">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={reportForm.reportId} onChange={(e) => setReportForm((f) => ({ ...f, reportId: e.target.value }))}>
                    <option value="">안전교육 템플릿 선택</option>
                    {safetyTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.templateName}</option>
                    ))}
                  </select>
                  <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={reportForm.effectiveDate} onChange={(e) => setReportForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
                  <Button size="sm" className="w-full" onClick={addSiteReport} disabled={!reportForm.reportId}>리포트 연결</Button>
                  {safetyTemplates.length === 0 && <p className="text-[11px] text-warning">템플릿 &gt; 센터별리포트에서 "안전교육일지" 양식을 먼저 등록해주세요.</p>}
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-muted">
                  <Monitor size={14} className="shrink-0" />
                  등록된 리포트 양식 미리보기·출력은 PC 화면에서 이용해주세요.
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
