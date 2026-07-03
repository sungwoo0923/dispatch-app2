import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { MapPin, Check, Copy, Trash2, UserPlus, Building2, Users, Send, History, ArrowLeftRight, X } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import {
  EMPLOYMENT_STATUS_OPTIONS,
  NATIONALITY_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  PAY_TYPE_OPTIONS,
  COUNTRY_OPTIONS,
} from "../constants/hr";
import { generateInviteCode } from "../utils/ids";
import { formatPhoneNumber } from "../utils/phoneAuth";
import { toDateKey, formatDate } from "../utils/dateUtils";

const EMPTY_REGISTER_FORM = {
  name: "",
  phone: "",
  gender: "남",
  nationality: "내국인",
  country: "",
  visaStatus: "",
  employeeCode: "",
  workSiteId: "",
  vendorId: "",
  hireDate: toDateKey(),
  employmentType: "상용직",
  shiftType: "주간",
  payType: "월급",
  team: "",
  position: "",
  insuranceApplied: "Y",
  residentNumberFront: "",
  bankName: "",
  bankAccount: "",
  note: "",
};

function SectionHeader({ children }) {
  return (
    <div className="mb-3 mt-5 flex items-center gap-2 first:mt-0">
      <span className="h-3.5 w-1 rounded-full bg-primary" />
      <h4 className="text-sm font-semibold text-ink">{children}</h4>
    </div>
  );
}

export default function EmployeeList() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [pending, setPending] = useState([]);

  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteForm, setSiteForm] = useState({ name: "", lat: "", lng: "", radiusM: 100 });

  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState(EMPTY_REGISTER_FORM);
  const [issuedCode, setIssuedCode] = useState("");

  const [filters, setFilters] = useState({ siteId: "", vendorId: "", status: "", search: "" });
  const [selected, setSelected] = useState(() => new Set());
  const [listAction, setListAction] = useState("선택");

  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [allowanceTemplates, setAllowanceTemplates] = useState([]);
  const [changeLogs, setChangeLogs] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copyMode, setCopyMode] = useState("근무복사");
  const [copyTargets, setCopyTargets] = useState(() => new Set());
  const [quickForm, setQuickForm] = useState({ name: "", phone: "" });

  const [templateForm, setTemplateForm] = useState({ kind: "시간템플릿", templateId: "", effectiveDate: toDateKey(), deleteMode: false, bulkMode: false });

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
      (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubSites = onSnapshot(
      query(collection(db, "workSites"), where("companyId", "==", profile.companyId)),
      (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubVendors = onSnapshot(
      query(collection(db, "vendors"), where("companyId", "==", profile.companyId)),
      (snap) => setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubPending = onSnapshot(
      query(collection(db, "pendingEmployees"), where("companyId", "==", profile.companyId)),
      (snap) => setPending(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubDept = onSnapshot(
      query(collection(db, "departments"), where("companyId", "==", profile.companyId)),
      (snap) => setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubPos = onSnapshot(
      query(collection(db, "positions"), where("companyId", "==", profile.companyId)),
      (snap) => setPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubShiftT = onSnapshot(
      query(collection(db, "shiftTemplates"), where("companyId", "==", profile.companyId)),
      (snap) => setShiftTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubAllowT = onSnapshot(
      query(collection(db, "allowanceTemplates"), where("companyId", "==", profile.companyId)),
      (snap) => setAllowanceTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubLogs = onSnapshot(
      query(collection(db, "employeeChangeLogs"), where("companyId", "==", profile.companyId)),
      (snap) => setChangeLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubChangeReq = onSnapshot(
      query(collection(db, "assignmentChangeRequests"), where("companyId", "==", profile.companyId)),
      (snap) => setChangeRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubUsers();
      unsubSites();
      unsubVendors();
      unsubPending();
      unsubDept();
      unsubPos();
      unsubShiftT();
      unsubAllowT();
      unsubLogs();
      unsubChangeReq();
    };
  }, [profile?.companyId]);

  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
      if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
      if (filters.status && (emp.employmentStatus || "재직") !== filters.status) return false;
      if (filters.search && !`${emp.name}${emp.phone}`.includes(filters.search)) return false;
      return true;
    });
  }, [employees, filters]);

  const approve = (uid) => updateDoc(doc(db, "users", uid), { approved: true });
  const assignSite = (uid, workSiteId) => updateDoc(doc(db, "users", uid), { workSiteId: workSiteId || null });
  const updateField = (uid, field, value) => updateDoc(doc(db, "users", uid), { [field]: value });

  const approveChangeRequest = async (req) => {
    await updateDoc(doc(db, "users", req.uid), {
      workSiteId: req.requestedSiteId || null,
      vendorId: req.requestedVendorId || null,
    });
    await updateDoc(doc(db, "assignmentChangeRequests", req.id), {
      status: "approved",
      resolvedAt: serverTimestamp(),
    });
  };
  const rejectChangeRequest = (req) =>
    updateDoc(doc(db, "assignmentChangeRequests", req.id), { status: "rejected", resolvedAt: serverTimestamp() });

  const createSite = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "workSites"), {
      companyId: profile.companyId,
      name: siteForm.name,
      lat: parseFloat(siteForm.lat),
      lng: parseFloat(siteForm.lng),
      radiusM: Number(siteForm.radiusM) || 100,
      createdAt: serverTimestamp(),
    });
    setSiteForm({ name: "", lat: "", lng: "", radiusM: 100 });
    setSiteModalOpen(false);
  };

  const createVendor = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, "vendors"), {
      companyId: profile.companyId,
      name: vendorName,
      createdAt: serverTimestamp(),
    });
    setVendorName("");
    setVendorModalOpen(false);
  };

  const closeRegisterModal = () => {
    setRegisterOpen(false);
    setIssuedCode("");
    setRegisterForm(EMPTY_REGISTER_FORM);
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    const code = generateInviteCode(7);
    await setDoc(doc(db, "pendingEmployees", code), {
      companyId: profile.companyId,
      ...registerForm,
      employmentStatus: "재직",
      createdAt: serverTimestamp(),
    });
    setIssuedCode(code);
  };

  const removePending = (code) => deleteDoc(doc(db, "pendingEmployees", code));

  const toggleSelected = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleSelectAll = () =>
    setSelected((s) => (s.size === filteredEmployees.length ? new Set() : new Set(filteredEmployees.map((e) => e.id))));

  const sourceEmployee = employees.find((e) => selected.has(e.id));

  const logChange = (uid, kind, detail) =>
    addDoc(collection(db, "employeeChangeLogs"), {
      companyId: profile.companyId,
      uid,
      kind,
      detail,
      status: "완료",
      createdAt: serverTimestamp(),
      createdByName: profile.name || "관리자",
    });

  const runListAction = () => {
    if (selected.size === 0) return;
    if (listAction === "신규복사" || listAction === "근무복사") {
      setCopyMode(listAction);
      setCopyTargets(new Set());
      setQuickForm({ name: "", phone: "" });
      setCopyOpen(true);
    } else if (listAction === "SMS발송") {
      window.alert(`${selected.size}명에게 가입코드 SMS를 발송했습니다. (테스트 환경에서는 실제 발송되지 않습니다)`);
    }
  };

  const applyWorkCopy = async () => {
    if (!sourceEmployee || copyTargets.size === 0) return;
    const fields = ["workSiteId", "vendorId", "employmentType", "team", "position", "shiftType", "payType", "insuranceApplied"];
    const payload = Object.fromEntries(fields.map((f) => [f, sourceEmployee[f] ?? null]));
    for (const uid of copyTargets) {
      await updateDoc(doc(db, "users", uid), payload);
      await logChange(uid, "근무복사", `${sourceEmployee.name}의 근무정보를 복사`);
    }
    setCopyOpen(false);
    setSelected(new Set());
  };

  const submitQuickCopy = async () => {
    if (!sourceEmployee || !quickForm.name.trim() || !quickForm.phone.trim()) return;
    const code = generateInviteCode(7);
    await setDoc(doc(db, "pendingEmployees", code), {
      companyId: profile.companyId,
      ...EMPTY_REGISTER_FORM,
      name: quickForm.name,
      phone: quickForm.phone,
      workSiteId: sourceEmployee.workSiteId || "",
      vendorId: sourceEmployee.vendorId || "",
      employmentType: sourceEmployee.employmentType || "상용직",
      team: sourceEmployee.team || "",
      position: sourceEmployee.position || "",
      shiftType: sourceEmployee.shiftType || "주간",
      payType: sourceEmployee.payType || "월급",
      employmentStatus: "재직",
      createdAt: serverTimestamp(),
    });
    setCopyOpen(false);
    setSelected(new Set());
  };

  const templateSourceList = templateForm.kind === "시간템플릿" ? shiftTemplates : allowanceTemplates;

  const applyTemplateBulk = async () => {
    const targets = templateForm.bulkMode ? filteredEmployees.map((e) => e.id) : [...selected];
    if (targets.length === 0) return;
    const field = templateForm.kind === "시간템플릿" ? "shiftTemplateId" : "allowanceTemplateId";
    const templateName = templateSourceList.find((t) => t.id === templateForm.templateId)?.name || "";
    for (const uid of targets) {
      if (templateForm.deleteMode) {
        await updateDoc(doc(db, "users", uid), { [field]: null });
        await logChange(uid, "템플릿삭제", `${templateForm.kind} 삭제`);
      } else {
        if (!templateForm.templateId) continue;
        await updateDoc(doc(db, "users", uid), { [field]: templateForm.templateId, [`${field}EffectiveDate`]: templateForm.effectiveDate });
        await logChange(uid, "템플릿적용", `${templateForm.kind}: ${templateName} (적용시점 ${templateForm.effectiveDate})`);
      }
    }
  };

  return (
    <div className="space-y-6">
      <Panel
        icon={Users}
        title={`근로자 등록 (전체 ${employees.length}명 · 가입 대기 ${pending.length}명)`}
        actions={
          <>
            <Button variant="outline" onClick={() => setVendorModalOpen(true)}>
              <Building2 size={16} /> 소속업체 추가
            </Button>
            <Button variant="outline" onClick={() => setSiteModalOpen(true)}>
              <MapPin size={16} /> 근무지 추가
            </Button>
            <Button onClick={() => setRegisterOpen(true)}>
              <UserPlus size={16} /> 신규 근로자 등록
            </Button>
          </>
        }
      >
        {workSites.length === 0 && (
          <Card className="mb-4 p-4 text-xs text-warning">
            아직 등록된 근무지가 없습니다. 근무지를 먼저 추가해야 직원에게 배정하고 자동출근을 사용할 수 있습니다.
          </Card>
        )}

        <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.vendorId}
              onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}
            >
              <option value="">전체</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">근무지</span>
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
            <span className="mb-1.5 block text-xs font-medium text-muted">재직상태</span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">전체</option>
              {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[160px]">
            <span className="mb-1.5 block text-xs font-medium text-muted">이름/연락처 검색</span>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="검색어 입력"
            />
          </label>
        </Card>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto">
          <p className="text-xs font-medium text-muted">목록 {filteredEmployees.length}건</p>
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
            <select className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={listAction} onChange={(e) => setListAction(e.target.value)}>
              <option>선택</option>
              <option>신규복사</option>
              <option>근무복사</option>
              <option>SMS발송</option>
            </select>
            <Button size="sm" variant="outline" onClick={runListAction} disabled={selected.size === 0 || listAction === "선택"}>
              실행
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.alert(`${selected.size || 0}명에게 SMS를 발송했습니다.`)} disabled={selected.size === 0}>
              <Send size={13} /> SMS발송
            </Button>
          </div>
        </div>

        <Card className="mb-3 flex flex-nowrap items-end gap-2 overflow-x-auto p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">템플릿구분</span>
            <select className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={templateForm.kind} onChange={(e) => setTemplateForm((f) => ({ ...f, kind: e.target.value, templateId: "" }))}>
              <option>시간템플릿</option>
              <option>수당템플릿</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">템플릿명</span>
            <select className="w-40 rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={templateForm.templateId} onChange={(e) => setTemplateForm((f) => ({ ...f, templateId: e.target.value }))}>
              <option value="">선택</option>
              {templateSourceList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">적용시점</span>
            <input type="date" className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm" value={templateForm.effectiveDate} onChange={(e) => setTemplateForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-muted">
            <input type="checkbox" checked={templateForm.deleteMode} onChange={(e) => setTemplateForm((f) => ({ ...f, deleteMode: e.target.checked }))} />
            템플릿삭제
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-muted">
            <input type="checkbox" checked={templateForm.bulkMode} onChange={(e) => setTemplateForm((f) => ({ ...f, bulkMode: e.target.checked }))} />
            일괄처리
          </label>
          <Button size="sm" onClick={applyTemplateBulk} disabled={!templateForm.bulkMode && selected.size === 0}>
            적용
          </Button>
        </Card>

        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-medium">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === filteredEmployees.length} onChange={toggleSelectAll} />
                </th>
                <th className="px-4 py-3 font-medium">순번</th>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">연락처</th>
                <th className="px-4 py-3 font-medium">성별</th>
                <th className="px-4 py-3 font-medium">소속업체</th>
                <th className="px-4 py-3 font-medium">고용구분</th>
                <th className="px-4 py-3 font-medium">부서</th>
                <th className="px-4 py-3 font-medium">직급</th>
                <th className="px-4 py-3 font-medium">재직상태</th>
                <th className="px-4 py-3 font-medium">근무지</th>
                <th className="px-4 py-3 font-medium">입사일</th>
                <th className="px-4 py-3 font-medium">승인</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp, i) => (
                <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleSelected(emp.id)} />
                  </td>
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-ink">{emp.name}</td>
                  <td className="px-4 py-3 text-muted">{emp.phone}</td>
                  <td className="px-4 py-3 text-muted">{emp.gender || "-"}</td>
                  <td className="px-4 py-3 text-muted">{vendorName_(emp.vendorId)}</td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={emp.employmentType || ""}
                      onChange={(e) => updateField(emp.id, "employmentType", e.target.value)}
                    >
                      <option value="">-</option>
                      {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={emp.team || ""}
                      onChange={(e) => updateField(emp.id, "team", e.target.value)}
                    >
                      <option value="">-</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={emp.position || ""}
                      onChange={(e) => updateField(emp.id, "position", e.target.value)}
                    >
                      <option value="">-</option>
                      {positions.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={emp.employmentStatus || "재직"}
                      onChange={(e) => updateField(emp.id, "employmentStatus", e.target.value)}
                    >
                      {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={emp.workSiteId || ""}
                      onChange={(e) => assignSite(emp.id, e.target.value)}
                    >
                      <option value="">미배정</option>
                      {workSites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-muted">{emp.hireDate ? formatDate(emp.hireDate) : "-"}</td>
                  <td className="px-4 py-3">
                    {emp.approved ? (
                      <Badge tone="success">
                        <Check size={12} /> 승인됨
                      </Badge>
                    ) : (
                      <Button size="sm" onClick={() => approve(emp.id)}>
                        승인
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-6 text-center text-xs text-muted">
                    조회조건에 해당하는 근로자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        icon={ArrowLeftRight}
        title={`배정변경 요청 (승인대기 ${changeRequests.filter((r) => r.status === "pending").length}건)`}
      >
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-medium">순번</th>
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">현재 근무지</th>
                <th className="px-4 py-3 font-medium">요청 근무지</th>
                <th className="px-4 py-3 font-medium">요청 소속업체</th>
                <th className="px-4 py-3 font-medium">사유</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">처리</th>
              </tr>
            </thead>
            <tbody>
              {[...changeRequests]
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .slice(0, 20)
                .map((req, i) => (
                  <tr key={req.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-muted">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{req.name}</td>
                    <td className="px-4 py-3 text-muted">{req.currentSiteName || "-"}</td>
                    <td className="px-4 py-3 text-ink">{req.requestedSiteName || "-"}</td>
                    <td className="px-4 py-3 text-muted">{req.requestedVendorName || "-"}</td>
                    <td className="px-4 py-3 text-muted">{req.reason || "-"}</td>
                    <td className="px-4 py-3">
                      {req.status === "pending" ? (
                        <Badge tone="warning">승인대기</Badge>
                      ) : req.status === "approved" ? (
                        <Badge tone="success">승인완료</Badge>
                      ) : (
                        <Badge tone="danger">반려</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {req.status === "pending" && (
                        <div className="flex flex-nowrap gap-1.5">
                          <Button size="sm" onClick={() => approveChangeRequest(req)}>
                            <Check size={13} /> 승인
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejectChangeRequest(req)}>
                            <X size={13} /> 반려
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              {changeRequests.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-xs text-muted">
                    배정변경 요청이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon={History} title={`변경이력 (${changeLogs.length}건)`}>
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-medium">순번</th>
                <th className="px-4 py-3 font-medium">변경구분</th>
                <th className="px-4 py-3 font-medium">내용</th>
                <th className="px-4 py-3 font-medium">처리상태</th>
                <th className="px-4 py-3 font-medium">변경자</th>
              </tr>
            </thead>
            <tbody>
              {[...changeLogs]
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .slice(0, 20)
                .map((log, i) => (
                  <tr key={log.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-muted">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{log.kind}</td>
                    <td className="px-4 py-3 text-muted">{log.detail}</td>
                    <td className="px-4 py-3">
                      <Badge tone="success">{log.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted">{log.createdByName}</td>
                  </tr>
                ))}
              {changeLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted">
                    변경이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {pending.length > 0 && (
        <Panel icon={UserPlus} title={`가입 대기 중 (${pending.length}건)`}>
          <p className="mb-2 text-xs text-muted">아직 앱에서 가입코드 입력 전인 근로자입니다.</p>
          <div className="-mx-4 overflow-x-auto md:-mx-5">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="px-4 py-3 font-medium">이름</th>
                  <th className="px-4 py-3 font-medium">연락처</th>
                  <th className="px-4 py-3 font-medium">가입코드</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-ink">{p.name}</td>
                    <td className="px-4 py-3 text-muted">{p.phone}</td>
                    <td className="px-4 py-3 font-mono text-primary">{p.id}</td>
                    <td className="px-4 py-3">
                      <button
                        className="text-muted hover:text-danger"
                        onClick={() => removePending(p.id)}
                        title="삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Modal
        open={siteModalOpen}
        onClose={() => setSiteModalOpen(false)}
        title="근무지 추가"
        footer={
          <>
            <Button variant="outline" onClick={() => setSiteModalOpen(false)}>
              취소
            </Button>
            <Button onClick={createSite}>추가</Button>
          </>
        }
      >
        <form onSubmit={createSite} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">근무지명</span>
            <input
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={siteForm.name}
              onChange={(e) => setSiteForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="물류센터1"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">위도(lat)</span>
              <input
                required
                type="number"
                step="any"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={siteForm.lat}
                onChange={(e) => setSiteForm((f) => ({ ...f, lat: e.target.value }))}
                placeholder="37.5665"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">경도(lng)</span>
              <input
                required
                type="number"
                step="any"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={siteForm.lng}
                onChange={(e) => setSiteForm((f) => ({ ...f, lng: e.target.value }))}
                placeholder="126.9780"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">자동출근 반경(m)</span>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={siteForm.radiusM}
              onChange={(e) => setSiteForm((f) => ({ ...f, radiusM: e.target.value }))}
            />
          </label>
          <p className="text-[11px] text-muted">
            위도/경도는 지도 앱(구글맵 등)에서 근무지를 검색해 좌표를 복사해 넣어주세요.
          </p>
        </form>
      </Modal>

      <Modal
        open={vendorModalOpen}
        onClose={() => setVendorModalOpen(false)}
        title="소속업체 추가"
        footer={
          <>
            <Button variant="outline" onClick={() => setVendorModalOpen(false)}>
              취소
            </Button>
            <Button onClick={createVendor}>추가</Button>
          </>
        }
      >
        <form onSubmit={createVendor} className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">소속업체명</span>
            <input
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="예: OO물류파트너스"
            />
          </label>
          <p className="text-[11px] text-muted">
            근로자가 실제로 소속된 협력/도급업체명입니다. 근로자 등록 시 배정할 수 있습니다.
          </p>
        </form>
      </Modal>

      <Modal
        open={registerOpen}
        onClose={closeRegisterModal}
        title={issuedCode ? "등록 완료" : "신규 근로자 등록"}
        size="lg"
        footer={
          issuedCode ? (
            <Button onClick={closeRegisterModal}>확인</Button>
          ) : (
            <>
              <Button variant="outline" onClick={closeRegisterModal}>
                취소
              </Button>
              <Button onClick={submitRegister}>등록</Button>
            </>
          )
        }
      >
        {issuedCode ? (
          <div>
            <p className="mb-2 text-sm text-muted">
              아래 가입코드를 근로자에게 전달해주세요. 근로자가 앱 설치 후 이 코드로 로그인 비밀번호만 설정하면 바로 사용할 수 있습니다.
            </p>
            <div className="flex items-center justify-between rounded-xl bg-primary-light px-4 py-3">
              <span className="text-2xl font-bold tracking-widest text-primary">{issuedCode}</span>
              <button
                className="text-primary hover:opacity-70"
                onClick={() => navigator.clipboard?.writeText(issuedCode)}
                title="복사"
              >
                <Copy size={18} />
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitRegister}>
            <SectionHeader>기본정보</SectionHeader>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">이름 *</span>
                <input
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="홍길동"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">전화번호 *</span>
                <input
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.phone}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))}
                  placeholder="010-0000-0000"
                  maxLength={13}
                />
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">국적구분</span>
                <div className="flex h-[42px] items-center gap-4 text-sm">
                  {NATIONALITY_OPTIONS.map((n) => (
                    <label key={n} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="nationality"
                        checked={registerForm.nationality === n}
                        onChange={() => setRegisterForm((f) => ({ ...f, nationality: n }))}
                      />
                      {n}
                    </label>
                  ))}
                </div>
              </div>
              {registerForm.nationality === "외국인" && (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">체류자격</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                      value={registerForm.visaStatus}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, visaStatus: e.target.value }))}
                      placeholder="예: E-9, H-2"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">국가구분</span>
                    <select
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                      value={registerForm.country}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, country: e.target.value }))}
                    >
                      <option value="">선택</option>
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">성별</span>
                <div className="flex h-[42px] items-center gap-4 text-sm">
                  {["남", "여"].map((g) => (
                    <label key={g} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="gender"
                        checked={registerForm.gender === g}
                        onChange={() => setRegisterForm((f) => ({ ...f, gender: g }))}
                      />
                      {g}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">사원코드</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.employeeCode}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, employeeCode: e.target.value }))}
                  placeholder="사내 관리번호 (선택)"
                />
              </label>
            </div>

            <SectionHeader>근무지정보</SectionHeader>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">근무지(센터)</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.workSiteId}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, workSiteId: e.target.value }))}
                >
                  <option value="">미배정</option>
                  {workSites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <SectionHeader>입/퇴사정보</SectionHeader>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.vendorId}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, vendorId: e.target.value }))}
                >
                  <option value="">미지정</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">입사일자 *</span>
                <input
                  required
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.hireDate}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, hireDate: e.target.value }))}
                />
              </label>
            </div>

            <SectionHeader>근무정보</SectionHeader>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">고용구분</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.employmentType}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, employmentType: e.target.value }))}
                >
                  {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.team}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, team: e.target.value }))}
                >
                  <option value="">선택</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">직급</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.position}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, position: e.target.value }))}
                >
                  <option value="">선택</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
                <div className="flex h-[42px] items-center gap-4 text-sm">
                  {SHIFT_TYPE_OPTIONS.map((s) => (
                    <label key={s} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="shiftType"
                        checked={registerForm.shiftType === s}
                        onChange={() => setRegisterForm((f) => ({ ...f, shiftType: s }))}
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">4대보험 적용여부</span>
                <div className="flex h-[42px] items-center gap-4 text-sm">
                  {["Y", "N"].map((v) => (
                    <label key={v} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="insuranceApplied"
                        checked={registerForm.insuranceApplied === v}
                        onChange={() => setRegisterForm((f) => ({ ...f, insuranceApplied: v }))}
                      />
                      {v}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <SectionHeader>급여정보</SectionHeader>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">지급구분</span>
                <div className="flex h-[42px] items-center gap-4 text-sm">
                  {PAY_TYPE_OPTIONS.map((p) => (
                    <label key={p} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="payType"
                        checked={registerForm.payType === p}
                        onChange={() => setRegisterForm((f) => ({ ...f, payType: p }))}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">주민/외국인번호 앞자리</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.residentNumberFront}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, residentNumberFront: e.target.value }))}
                  placeholder="901010-1 (뒷자리는 저장하지 않습니다)"
                  maxLength={9}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">급여계좌 - 은행</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.bankName}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, bankName: e.target.value }))}
                  placeholder="예: 국민은행"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">급여계좌 - 계좌번호</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.bankAccount}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, bankAccount: e.target.value }))}
                  placeholder="계좌번호"
                />
              </label>
              <label className="col-span-2 block">
                <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
                <textarea
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  rows={2}
                  value={registerForm.note}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, note: e.target.value }))}
                />
              </label>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title={copyMode === "근무복사" ? "근무복사등록" : "신규복사"}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              취소
            </Button>
            {copyMode === "근무복사" ? (
              <Button onClick={applyWorkCopy} disabled={copyTargets.size === 0}>
                근무정보등록
              </Button>
            ) : (
              <Button onClick={submitQuickCopy} disabled={!quickForm.name.trim() || !quickForm.phone.trim()}>
                등록
              </Button>
            )}
          </>
        }
      >
        {sourceEmployee && (
          <div className="space-y-3">
            <div className="rounded-xl bg-primary-light/40 px-3.5 py-2.5 text-xs leading-relaxed text-primary">
              복사조건: #소속업체 {vendorName_(sourceEmployee.vendorId)} #근무구분/근무형태 {sourceEmployee.shiftType || "-"}/{sourceEmployee.employmentType || "-"}
            </div>

            {copyMode === "근무복사" ? (
              <>
                <p className="text-xs text-muted">
                  기존 근로자 <b className="text-ink">'{sourceEmployee.name}'</b>의 근무정보를 복사해 이미 등록된 다른 근로자에게 추가 등록할 때 사용합니다.
                </p>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100 text-xs text-muted">
                        <th className="w-8 px-3 py-2"></th>
                        <th className="px-3 py-2 font-medium">이름</th>
                        <th className="px-3 py-2 font-medium">전화번호</th>
                        <th className="px-3 py-2 font-medium">소속업체</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees
                        .filter((e) => e.id !== sourceEmployee.id)
                        .map((e) => (
                          <tr key={e.id} className="border-b border-slate-50 last:border-0">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={copyTargets.has(e.id)}
                                onChange={() =>
                                  setCopyTargets((s) => {
                                    const next = new Set(s);
                                    if (next.has(e.id)) next.delete(e.id);
                                    else next.add(e.id);
                                    return next;
                                  })
                                }
                              />
                            </td>
                            <td className="px-3 py-2 text-ink">{e.name}</td>
                            <td className="px-3 py-2 text-muted">{e.phone}</td>
                            <td className="px-3 py-2 text-muted">{vendorName_(e.vendorId)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted">근무형태가 여러 개인 경우, 근무별 시작일에 따라 휴가 산정 기준이 달라질 수 있습니다. 복사한 근무정보를 적용할 근로자를 선택해주세요.</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted">
                  기존 근로자 정보를 복사해 신규 근로자를 등록할 때 사용합니다. 센터, 소속업체, 근무조건, 템플릿까지 복사되며, 이름과 전화번호만 입력하면 간편 등록 완료!
                </p>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">이름 *</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={quickForm.name}
                    onChange={(e) => setQuickForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">전화번호 *</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={quickForm.phone}
                    onChange={(e) => setQuickForm((f) => ({ ...f, phone: formatPhoneNumber(e.target.value) }))}
                    maxLength={13}
                  />
                </label>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
