import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { MapPin, Check, Copy, Trash2, UserPlus, Building2, Users, Send, History, ArrowLeftRight, X, Search, Paperclip, RotateCcw, Camera } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import { buildDefaultContract } from "../utils/contractTemplate";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import SidePanel from "../components/SidePanel";
import Pagination from "../components/Pagination";
import { usePagination } from "../hooks/usePagination";
import {
  EMPLOYMENT_STATUS_OPTIONS,
  NATIONALITY_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  PAY_TYPE_OPTIONS,
  COUNTRY_OPTIONS,
  VISA_STATUS_GROUPS,
  BANK_OPTIONS,
} from "../constants/hr";
import { generateInviteCode } from "../utils/ids";
import { formatPhoneNumber, formatResidentNumber } from "../utils/phoneAuth";
import { toDateKey, formatDate, calculateAge } from "../utils/dateUtils";
import {
  DOCUMENT_TYPE_OPTIONS,
  uploadPendingEmployeeDocument,
  uploadPendingEmployeePhoto,
  uploadEmployeeDocument,
  uploadEmployeePhoto,
} from "../utils/documents";
import { openAddressSearch } from "../utils/daumPostcode";

const REG_TABS = ["시간템플릿", "수당템플릿", "계약", "계약종료", "첨부서류", "기본 불러오기"];

const EMPTY_REGISTER_FORM = {
  businessEntityId: "",
  photoUrl: "",
  name: "",
  phone: "",
  gender: "남",
  nationality: "내국인",
  country: "대한민국",
  visaStatus: "",
  employeeCode: "",
  workSiteId: "",
  workLocation: "",
  vendorId: "",
  hireDate: toDateKey(),
  resignDate: "",
  workStartDate: toDateKey(),
  employmentType: "상용직",
  shiftType: "주간",
  payType: "월급",
  team: "",
  position: "",
  insuranceApplied: "Y",
  active: "Y",
  residentNumberFront: "",
  address: "",
  bankName: "",
  bankAccount: "",
  accountHolder: "",
  orgCode: "",
  externalId: "",
  shiftTemplateId: "",
  shiftTemplateDate: toDateKey(),
  allowanceTemplateId: "",
  allowanceTemplateDate: toDateKey(),
  contractTemplateId: "",
  contractTemplateName: "",
  resignTemplateId: "",
  resignTemplateName: "",
  resignTemplateDate: toDateKey(),
  note: "",
};

// 편집 모드에서 users/{uid}로 저장할 필드만 골라내는 데 쓰는 화이트리스트 —
// approved/role/companyId/employmentStatus 등 이 폼이 다루지 않는 필드는
// registerForm에 잔류하더라도 절대 덮어쓰지 않기 위함이다.
const REGISTER_FIELD_KEYS = Object.keys(EMPTY_REGISTER_FORM);

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
  const toast = useToast();
  const confirm = useConfirm();
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
  const [manualCode, setManualCode] = useState("");
  const [editingUid, setEditingUid] = useState(null);

  // 등록화면의 사진: 아직 uid가 없는 신규 등록 단계라 다른 첨부서류와 마찬가지로
  // 로컬에만 들고 있다가 최종 등록 시점에 업로드한다. photoSaved는 "등록" 버튼(파일
  // 선택)과 "저장" 버튼(선택 확정) 두 단계를 오가는 표시용 플래그일 뿐, 실제 파일
  // 업로드는 submitRegister에서 한 번에 처리된다.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoSaved, setPhotoSaved] = useState(false);

  const [filters, setFilters] = useState({ siteId: "", vendorId: "", status: "", search: "" });
  const [selected, setSelected] = useState(() => new Set());
  const [listAction, setListAction] = useState("선택");

  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [allowanceTemplates, setAllowanceTemplates] = useState([]);
  const [changeLogs, setChangeLogs] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [centerReports, setCenterReports] = useState([]);
  const [companyName, setCompanyName] = useState("");

  const [regTab, setRegTab] = useState("시간템플릿");
  const [stagedDocs, setStagedDocs] = useState([]);
  const [stagedDocType, setStagedDocType] = useState(DOCUMENT_TYPE_OPTIONS[0]);
  const [stagedFile, setStagedFile] = useState(null);
  const [loadFromId, setLoadFromId] = useState("");
  const [templatePicker, setTemplatePicker] = useState(null); // 'contract' | 'resign' | null
  const [templateSearch, setTemplateSearch] = useState("");

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
    const unsubEntities = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setBusinessEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubReports = onSnapshot(
      query(collection(db, "centerReports"), where("companyId", "==", profile.companyId)),
      (snap) => setCenterReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
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
      unsubEntities();
      unsubReports();
    };
  }, [profile?.companyId]);

  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";
  const entityName_ = (id) => businessEntities.find((b) => b.id === id)?.name || "-";
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const shiftTemplateName_ = (id) => shiftTemplates.find((t) => t.id === id)?.name || "-";
  const allowanceTemplateName_ = (id) => allowanceTemplates.find((t) => t.id === id)?.name || "-";

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
      if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
      if (filters.status && (emp.employmentStatus || "재직") !== filters.status) return false;
      if (filters.search && !`${emp.name}${emp.phone}`.includes(filters.search)) return false;
      return true;
    });
  }, [employees, filters]);

  const { pageRows, page, pageCount, pageSize, total, setPage, changePageSize, PAGE_SIZE_OPTIONS } = usePagination(filteredEmployees, 10);

  const [rowMenu, setRowMenu] = useState(null); // { x, y, emp }

  const openRowMenu = (e, emp) => {
    e.preventDefault();
    setRowMenu({ x: e.clientX, y: e.clientY, emp });
  };
  const closeRowMenu = () => setRowMenu(null);
  const runRowAction = (action) => {
    if (!rowMenu) return;
    setSelected(new Set([rowMenu.emp.id]));
    setCopyMode(action);
    setCopyTargets(new Set());
    setQuickForm({ name: "", phone: "" });
    setCopyOpen(true);
    closeRowMenu();
  };

  useEffect(() => {
    if (!rowMenu) return;
    const onDocClick = () => closeRowMenu();
    document.addEventListener("click", onDocClick);
    document.addEventListener("scroll", onDocClick, true);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("scroll", onDocClick, true);
    };
  }, [rowMenu]);

  const approve = (uid) => updateDoc(doc(db, "users", uid), { approved: true }).then(() => toast.success("승인되었습니다"));
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
    toast.success("승인되었습니다");
  };
  const rejectChangeRequest = (req) =>
    updateDoc(doc(db, "assignmentChangeRequests", req.id), { status: "rejected", resolvedAt: serverTimestamp() }).then(() =>
      toast.success("거절되었습니다")
    );

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
    toast.success("저장되었습니다");
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
    toast.success("저장되었습니다");
    setVendorName("");
    setVendorModalOpen(false);
  };

  const closeRegisterModal = () => {
    setRegisterOpen(false);
    setIssuedCode("");
    setManualCode("");
    setRegisterForm(EMPTY_REGISTER_FORM);
    setRegTab("시간템플릿");
    setStagedDocs([]);
    setLoadFromId("");
    setEditingUid(null);
    setPhotoFile(null);
    setPhotoPreviewUrl("");
    setPhotoSaved(false);
  };

  // 신규 등록 시작 시 사원코드를 자동으로 채워두고(연도 + 현재 인원수 기준 일련번호),
  // 사업자는 회사 개설 시 회사명으로 자동 생성해둔 항목을 기본 선택해둔다.
  const openNewRegister = () => {
    const seq = String(employees.length + pending.length + 1).padStart(4, "0");
    const defaultEntity = businessEntities.find((b) => b.name === companyName);
    setRegisterForm({
      ...EMPTY_REGISTER_FORM,
      employeeCode: `EMP${new Date().getFullYear()}${seq}`,
      businessEntityId: defaultEntity?.id || "",
    });
    setRegisterOpen(true);
  };

  // F4로 신규 근로자 등록 팝업을 바로 열 수 있게 한다. ref에 최신 콜백을 담아두어
  // 이벤트 리스너는 한 번만 등록하면서도 employees/pending 등 최신 상태를 반영한다.
  const openNewRegisterRef = useRef(openNewRegister);
  openNewRegisterRef.current = openNewRegister;
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "F4") {
        e.preventDefault();
        openNewRegisterRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 등록 팝업을 companyName/businessEntities가 아직 로딩되기 전(onSnapshot이 붙기
  // 전)에 열면 openNewRegister가 계산한 기본값이 빈 값으로 굳어버린다 — 데이터가
  // 늦게 도착해도 신규 등록(아직 아무 값도 고르지 않은 상태)이라면 뒤늦게 채워준다.
  useEffect(() => {
    if (!registerOpen || editingUid) return;
    if (registerForm.businessEntityId) return;
    const defaultEntity = businessEntities.find((b) => b.name === companyName);
    if (defaultEntity) setRegisterForm((f) => ({ ...f, businessEntityId: defaultEntity.id }));
  }, [registerOpen, editingUid, businessEntities, companyName]);

  // 근로자 목록 행 더블클릭 시 이미 계정이 있는 근로자(users/{uid})를 같은
  // SidePanel/폼으로 불러와 수정할 수 있게 한다 — 가입코드 발급 단계는 건너뛴다.
  const openEditEmployee = (emp) => {
    setEditingUid(emp.id);
    setRegisterForm({ ...EMPTY_REGISTER_FORM, ...emp });
    setPhotoPreviewUrl(emp.photoUrl || "");
    setPhotoSaved(!!emp.photoUrl);
    setRegisterOpen(true);
  };

  const generateManualCode = () => setManualCode(generateInviteCode(7));

  const photoInputRef = useRef(null);
  const handlePhotoFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPhotoSaved(false);
    e.target.value = "";
  };
  const handlePhotoButtonClick = () => {
    if (photoFile && !photoSaved) setPhotoSaved(true);
    else photoInputRef.current?.click();
  };

  const searchRegisterAddress = async () => {
    const result = await openAddressSearch();
    if (result) setRegisterForm((f) => ({ ...f, address: result.address }));
  };

  const submitRegister = async (e) => {
    e.preventDefault();

    if (editingUid) {
      const payload = Object.fromEntries(REGISTER_FIELD_KEYS.map((k) => [k, registerForm[k]]));
      if (photoFile) {
        payload.photoUrl = await uploadEmployeePhoto({ companyId: profile.companyId, uid: editingUid, file: photoFile });
      }
      await updateDoc(doc(db, "users", editingUid), payload);
      for (const { docType, file } of stagedDocs) {
        await uploadEmployeeDocument({ companyId: profile.companyId, uid: editingUid, employeeName: registerForm.name, docType, file });
      }
      toast.success("수정되었습니다");
      closeRegisterModal();
      return;
    }

    const code = manualCode || generateInviteCode(7);
    let photoUrl = "";
    if (photoFile) {
      photoUrl = await uploadPendingEmployeePhoto({ companyId: profile.companyId, pendingCode: code, file: photoFile });
    }
    await setDoc(doc(db, "pendingEmployees", code), {
      companyId: profile.companyId,
      ...registerForm,
      photoUrl,
      employmentStatus: "재직",
      createdAt: serverTimestamp(),
    });
    for (const { docType, file } of stagedDocs) {
      await uploadPendingEmployeeDocument({ companyId: profile.companyId, pendingCode: code, employeeName: registerForm.name, docType, file });
    }
    toast.success("저장되었습니다");
    setIssuedCode(code);
  };

  const addStagedDoc = () => {
    if (!stagedFile) return;
    setStagedDocs((list) => [...list, { docType: stagedDocType, file: stagedFile, fileName: stagedFile.name }]);
    setStagedFile(null);
  };
  const removeStagedDoc = (i) => setStagedDocs((list) => list.filter((_, idx) => idx !== i));

  const loadFromEmployee = () => {
    const src = employees.find((e) => e.id === loadFromId);
    if (!src) return;
    setRegisterForm((f) => ({
      ...f,
      workSiteId: src.workSiteId || "",
      vendorId: src.vendorId || "",
      employmentType: src.employmentType || f.employmentType,
      team: src.team || "",
      position: src.position || "",
      shiftType: src.shiftType || f.shiftType,
      payType: src.payType || f.payType,
      insuranceApplied: src.insuranceApplied || f.insuranceApplied,
    }));
  };

  const applyTemplatePick = (report) => {
    if (templatePicker === "resign") {
      setRegisterForm((f) => ({ ...f, resignTemplateId: report.id, resignTemplateName: report.templateName }));
    }
    setTemplatePicker(null);
    setTemplateSearch("");
  };

  const contractReportOptions = useMemo(() => centerReports.filter((r) => r.docType === "계약서"), [centerReports]);

  // 근로자등록 > 계약 탭에서 계약서 템플릿을 고르면, 이미 계정이 있는(수정 중인)
  // 근로자에 한해 즉시 발송할지 물어본다. 아직 가입 전(신규 등록, uid 없음)인
  // 경우는 uid가 없어 계약서 문서를 만들 수 없으므로 템플릿 선택만 저장해두고,
  // 실제 발송은 이후 계약서 메뉴의 자동발송으로 진행한다.
  const selectContractTemplate = async (reportId) => {
    const report = centerReports.find((r) => r.id === reportId);
    setRegisterForm((f) => ({ ...f, contractTemplateId: reportId, contractTemplateName: report?.templateName || "" }));
    if (!reportId || !editingUid) return;
    if (!(await confirm(`계약서를 ${registerForm.name || "해당 근로자"}님에게 즉시 발송하시겠습니까?`, "send"))) return;
    const entity = businessEntities.find((b) => b.id === registerForm.businessEntityId);
    const stampUrl = entity?.stampUrl || null;
    const content = buildDefaultContract({
      employeeName: registerForm.name,
      hireDate: registerForm.hireDate,
      position: registerForm.position,
      siteName: siteName_(registerForm.workSiteId),
      vendorName: vendorName_(registerForm.vendorId),
      companyName,
      payType: registerForm.payType,
      shiftType: registerForm.shiftType,
      employmentType: registerForm.employmentType,
    });
    const signedAt = toDateKey();
    await addDoc(collection(db, "contracts"), {
      companyId: profile.companyId,
      uid: editingUid,
      employeeName: registerForm.name,
      title: report?.templateName || "표준근로계약서",
      cycle: "1년",
      startDate: signedAt,
      endDate: null,
      content,
      status: stampUrl ? "sent" : "draft",
      companySignatureDataUrl: stampUrl,
      companySignedAt: stampUrl ? signedAt : null,
      createdAt: serverTimestamp(),
    });
    toast.success(stampUrl ? "계약서가 발송되었습니다" : "계약서가 등록되었습니다 (사업자 도장이 없어 서명 없이 등록됨)");
  };

  const templatePickerResults = useMemo(() => {
    if (!templatePicker) return [];
    const docType = "사직서";
    return centerReports.filter((r) => r.docType === docType && (!templateSearch || r.templateName?.includes(templateSearch)));
  }, [templatePicker, centerReports, templateSearch]);

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
    toast.success("적용되었습니다");
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
    toast.success("저장되었습니다");
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
    toast.success("적용되었습니다");
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
            <Button onClick={openNewRegister}>
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

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">목록 {filteredEmployees.length}건</p>
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain">
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

        <Card className="mb-3 flex flex-nowrap items-end gap-2 overflow-x-auto overscroll-x-contain p-3">
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

        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[2400px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === filteredEmployees.length} onChange={toggleSelectAll} />
                </th>
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">사업자</th>
                <th className="px-4 py-3 font-semibold">센터</th>
                <th className="px-4 py-3 font-semibold">연락처</th>
                <th className="px-4 py-3 font-semibold">성별</th>
                <th className="px-4 py-3 font-semibold">나이</th>
                <th className="px-4 py-3 font-semibold">소속업체</th>
                <th className="px-4 py-3 font-semibold">근무구분</th>
                <th className="px-4 py-3 font-semibold">고용구분</th>
                <th className="px-4 py-3 font-semibold">근무비고</th>
                <th className="px-4 py-3 font-semibold">부서</th>
                <th className="px-4 py-3 font-semibold">직급</th>
                <th className="px-4 py-3 font-semibold">시간템플릿</th>
                <th className="px-4 py-3 font-semibold">수당템플릿</th>
                <th className="px-4 py-3 font-semibold">계약서템플릿</th>
                <th className="px-4 py-3 font-semibold">사직서템플릿</th>
                <th className="px-4 py-3 font-semibold">외/내국인</th>
                <th className="px-4 py-3 font-semibold">국적</th>
                <th className="px-4 py-3 font-semibold">재직상태</th>
                <th className="px-4 py-3 font-semibold">입사일</th>
                <th className="px-4 py-3 font-semibold">퇴사일</th>
                <th className="px-4 py-3 font-semibold">회원가입</th>
                <th className="px-4 py-3 font-semibold">가입코드</th>
                <th className="px-4 py-3 font-semibold">4대보험</th>
                <th className="px-4 py-3 font-semibold">급여</th>
                <th className="px-4 py-3 font-semibold">승인</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((emp, i) => (
                <tr
                  key={emp.id}
                  onDoubleClick={() => openEditEmployee(emp)}
                  onContextMenu={(e) => openRowMenu(e, emp)}
                  title="더블클릭하여 수정 · 우클릭하여 복사"
                  className="cursor-pointer border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50 hover:bg-slate-100"
                >
                  <td className="px-4 py-3" onDoubleClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleSelected(emp.id)} />
                  </td>
                  <td className="px-4 py-3 text-muted">{(page - 1) * pageSize + i + 1}</td>
                  <td className="px-4 py-3 text-ink">{emp.name}</td>
                  <td className="px-4 py-3 text-muted">{entityName_(emp.businessEntityId)}</td>
                  <td className="px-4 py-3" onDoubleClick={(e) => e.stopPropagation()}>
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
                  <td className="px-4 py-3 text-muted">{emp.phone}</td>
                  <td className="px-4 py-3 text-muted">{emp.gender || "-"}</td>
                  <td className="px-4 py-3 text-muted">{calculateAge(emp.residentNumberFront) ?? "-"}</td>
                  <td className="px-4 py-3 text-muted">{vendorName_(emp.vendorId)}</td>
                  <td className="px-4 py-3" onDoubleClick={(e) => e.stopPropagation()}>
                    <select
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={emp.shiftType || ""}
                      onChange={(e) => updateField(emp.id, "shiftType", e.target.value)}
                    >
                      <option value="">-</option>
                      {SHIFT_TYPE_OPTIONS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3" onDoubleClick={(e) => e.stopPropagation()}>
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
                  <td className="px-4 py-3 text-muted">{emp.note || "-"}</td>
                  <td className="px-4 py-3" onDoubleClick={(e) => e.stopPropagation()}>
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
                  <td className="px-4 py-3" onDoubleClick={(e) => e.stopPropagation()}>
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
                  <td className="px-4 py-3 text-muted">{shiftTemplateName_(emp.shiftTemplateId)}</td>
                  <td className="px-4 py-3 text-muted">{allowanceTemplateName_(emp.allowanceTemplateId)}</td>
                  <td className="px-4 py-3 text-muted">{emp.contractTemplateName || "-"}</td>
                  <td className="px-4 py-3 text-muted">{emp.resignTemplateName || "-"}</td>
                  <td className="px-4 py-3 text-muted">{emp.nationality || "-"}</td>
                  <td className="px-4 py-3 text-muted">{emp.country || "-"}</td>
                  <td className="px-4 py-3" onDoubleClick={(e) => e.stopPropagation()}>
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
                  <td className="px-4 py-3 text-muted">{emp.hireDate ? formatDate(emp.hireDate) : "-"}</td>
                  <td className="px-4 py-3 text-muted">{emp.resignDate ? formatDate(emp.resignDate) : "-"}</td>
                  <td className="px-4 py-3 text-muted">Y</td>
                  <td className="px-4 py-3 text-muted">{emp.employeeCode || "-"}</td>
                  <td className="px-4 py-3 text-muted">{emp.insuranceApplied === "Y" ? "Y" : "N"}</td>
                  <td className="px-4 py-3 text-muted">{emp.payType || "-"}</td>
                  <td className="px-4 py-3" onDoubleClick={(e) => e.stopPropagation()}>
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
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={27} className="px-4 py-6 text-center text-xs text-muted">
                    조회조건에 해당하는 근로자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          total={total}
          setPage={setPage}
          changePageSize={changePageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />
      </Panel>

      {rowMenu && (
        <div
          className="fixed z-50 w-36 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg"
          style={{ left: rowMenu.x, top: rowMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="truncate px-3 py-1 text-[11px] text-muted">{rowMenu.emp.name}</p>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-slate-50"
            onClick={() => runRowAction("신규복사")}
          >
            신규복사
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-slate-50"
            onClick={() => runRowAction("근무복사")}
          >
            근무복사
          </button>
        </div>
      )}

      <Panel
        icon={ArrowLeftRight}
        title={`배정변경 요청 (승인대기 ${changeRequests.filter((r) => r.status === "pending").length}건)`}
      >
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[720px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">현재 근무지</th>
                <th className="px-4 py-3 font-semibold">요청 근무지</th>
                <th className="px-4 py-3 font-semibold">요청 소속업체</th>
                <th className="px-4 py-3 font-semibold">사유</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                <th className="px-4 py-3 font-semibold">처리</th>
              </tr>
            </thead>
            <tbody>
              {[...changeRequests]
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .slice(0, 20)
                .map((req, i) => (
                  <tr key={req.id} className="border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50">
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
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[720px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">변경구분</th>
                <th className="px-4 py-3 font-semibold">내용</th>
                <th className="px-4 py-3 font-semibold">처리상태</th>
                <th className="px-4 py-3 font-semibold">변경자</th>
              </tr>
            </thead>
            <tbody>
              {[...changeLogs]
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .slice(0, 20)
                .map((log, i) => (
                  <tr key={log.id} className="border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50">
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
          <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
            <table className="w-full min-w-[560px] text-center text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="px-4 py-3 font-semibold">이름</th>
                  <th className="px-4 py-3 font-semibold">연락처</th>
                  <th className="px-4 py-3 font-semibold">가입코드</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50">
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

      <SidePanel
        open={registerOpen}
        onClose={closeRegisterModal}
        title={`${companyName || "회사"} · 근로자등록 > ${editingUid ? "수정" : "상세"}`}
        footer={
          issuedCode ? (
            <Button onClick={closeRegisterModal}>확인</Button>
          ) : (
            <>
              <Button variant="outline" onClick={closeRegisterModal}>
                취소
              </Button>
              <Button onClick={submitRegister}>{editingUid ? "저장" : "근로자등록"}</Button>
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
          <form onSubmit={submitRegister} className="space-y-5">
            <Card className="p-5">
              <SectionHeader>기본정보</SectionHeader>

              <div className="mb-4 flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs font-medium text-muted">사진</span>
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {photoPreviewUrl ? (
                    <img src={photoPreviewUrl} alt="사진" className="h-full w-full object-cover" />
                  ) : (
                    <Camera size={22} className="text-muted" />
                  )}
                </div>
                <input type="file" accept="image/*" ref={photoInputRef} className="hidden" onChange={handlePhotoFileChange} />
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={handlePhotoButtonClick}>
                  {photoFile && !photoSaved ? "저장" : "등록"}
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">사업자</span>
                  <div className="flex w-full items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-ink">
                    {entityName_(registerForm.businessEntityId)}
                  </div>
                </label>
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
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">사원코드</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={registerForm.employeeCode}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, employeeCode: e.target.value }))}
                    placeholder="사내 관리번호 (선택)"
                  />
                </label>

                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">국적구분 *</span>
                  <div className="flex h-[42px] items-center gap-4 text-sm">
                    {NATIONALITY_OPTIONS.map((n) => (
                      <label key={n} className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="nationality"
                          checked={registerForm.nationality === n}
                          onChange={() =>
                            setRegisterForm((f) => ({
                              ...f,
                              nationality: n,
                              country: n === "내국인" ? "대한민국" : "",
                              visaStatus: n === "내국인" ? "" : f.visaStatus,
                            }))
                          }
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">국가구분</span>
                  <select
                    disabled={registerForm.nationality !== "외국인"}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm disabled:bg-slate-50"
                    value={registerForm.country}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, country: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">체류자격코드</span>
                  <select
                    disabled={registerForm.nationality !== "외국인"}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm disabled:bg-slate-50"
                    value={registerForm.visaStatus}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, visaStatus: e.target.value }))}
                  >
                    <option value="">체류자격을 선택하세요.</option>
                    {VISA_STATUS_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((o) => (
                          <option key={o.code} value={o.code}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
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

                {!editingUid && (
                  <>
                    <label className="col-span-4 block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">가입코드</span>
                      <div className="flex flex-nowrap gap-2">
                        <input
                          disabled
                          className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-muted"
                          value={manualCode}
                          placeholder="생성 버튼을 눌러 미리 발급하거나, 등록시 자동생성"
                        />
                        <Button type="button" variant="outline" className="shrink-0" onClick={generateManualCode}>
                          생성
                        </Button>
                      </div>
                    </label>
                    <p className="col-span-4 flex items-center text-[11px] text-muted">
                      근로자에게 가입코드를 알려주어야 모바일앱에서 회원가입 및 개인정보 등록이 가능합니다.
                    </p>
                  </>
                )}
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <p className="mb-3 text-xs font-semibold text-primary">● KP-Work 앱에 가입을 하지 않은 지원자만 입력합니다</p>
                <div className="grid grid-cols-4 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">출근조직</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                      value={registerForm.orgCode}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, orgCode: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">ID</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                      value={registerForm.externalId}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, externalId: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">주민/외국인번호</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                      value={registerForm.residentNumberFront}
                      onChange={(e) =>
                        setRegisterForm((f) => ({ ...f, residentNumberFront: formatResidentNumber(e.target.value) }))
                      }
                      placeholder="주민등록번호 또는 외국인등록번호"
                      maxLength={14}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">주소</span>
                    <input
                      readOnly
                      onClick={searchRegisterAddress}
                      className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                      value={registerForm.address}
                      placeholder="클릭해서 주소 검색"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">급여은행</span>
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                      value={registerForm.bankName}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, bankName: e.target.value }))}
                    >
                      <option value="">선택</option>
                      {BANK_OPTIONS.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">급여계좌</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                      value={registerForm.bankAccount}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, bankAccount: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted">예금주</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                      value={registerForm.accountHolder}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, accountHolder: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader>센터정보</SectionHeader>
              <div className="grid grid-cols-4 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">센터 *</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={registerForm.workSiteId}
                    onChange={(e) => {
                      const siteId = e.target.value;
                      const site = workSites.find((s) => s.id === siteId);
                      setRegisterForm((f) => ({ ...f, workSiteId: siteId, workLocation: site?.address || "" }));
                    }}
                  >
                    <option value="">선택</option>
                    {workSites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader>입/퇴사정보</SectionHeader>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">소속업체 *</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={registerForm.vendorId}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, vendorId: e.target.value }))}
                  >
                    <option value="">선택</option>
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
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">퇴사일자</span>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={registerForm.resignDate}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, resignDate: e.target.value }))}
                  />
                </label>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader>근무정보</SectionHeader>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">근무구분 *</span>
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
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">근무형태 *</span>
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
                  <span className="mb-1.5 block text-xs font-medium text-muted">근무위치</span>
                  <input
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-muted"
                    value={registerForm.workLocation}
                    placeholder="센터 선택 시 자동으로 채워집니다"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">근무시작일 *</span>
                  <input
                    required
                    type="date"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={registerForm.workStartDate}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, workStartDate: e.target.value }))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">부서 *</span>
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
                  <span className="mb-1.5 block text-xs font-medium text-muted">직급 *</span>
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
                  <span className="mb-1.5 block text-xs font-medium text-muted">4대 보험 적용여부 *</span>
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
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">사용여부 *</span>
                  <div className="flex h-[42px] items-center gap-4 text-sm">
                    {["Y", "N"].map((v) => (
                      <label key={v} className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="active"
                          checked={registerForm.active === v}
                          onChange={() => setRegisterForm((f) => ({ ...f, active: v }))}
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">비고</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={registerForm.note}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </label>
              </div>
            </Card>

            <Card className="p-0">
              <div className="flex flex-nowrap overflow-x-auto overscroll-x-contain border-b border-slate-100">
                {REG_TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRegTab(t)}
                    className={`shrink-0 px-4 py-3 text-sm font-medium ${
                      regTab === t ? "bg-primary-dark text-white" : "text-muted hover:bg-slate-50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="p-5">
                {regTab === "시간템플릿" && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명</span>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                        value={registerForm.shiftTemplateId}
                        onChange={(e) => setRegisterForm((f) => ({ ...f, shiftTemplateId: e.target.value }))}
                      >
                        <option value="">선택</option>
                        {shiftTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">적용시점</span>
                      <input
                        type="date"
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                        value={registerForm.shiftTemplateDate}
                        onChange={(e) => setRegisterForm((f) => ({ ...f, shiftTemplateDate: e.target.value }))}
                      />
                    </label>
                  </div>
                )}
                {regTab === "수당템플릿" && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">템플릿명</span>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                        value={registerForm.allowanceTemplateId}
                        onChange={(e) => setRegisterForm((f) => ({ ...f, allowanceTemplateId: e.target.value }))}
                      >
                        <option value="">선택</option>
                        {allowanceTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">적용시점</span>
                      <input
                        type="date"
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                        value={registerForm.allowanceTemplateDate}
                        onChange={(e) => setRegisterForm((f) => ({ ...f, allowanceTemplateDate: e.target.value }))}
                      />
                    </label>
                  </div>
                )}
                {regTab === "계약" && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">계약서 템플릿</span>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                        value={registerForm.contractTemplateId}
                        onChange={(e) => selectContractTemplate(e.target.value)}
                      >
                        <option value="">선택</option>
                        {contractReportOptions.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.templateName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="col-span-2 text-[11px] text-muted">
                      출근확정 시 여기서 선택한 템플릿으로 전자근로계약서가 자동 생성됩니다. 이미 계정이 있는 근로자는 템플릿 선택 시 즉시 발송할지 물어봅니다.
                    </p>
                  </div>
                )}
                {regTab === "계약종료" && (
                  <div className="flex flex-nowrap items-end gap-2">
                    <label className="block flex-1">
                      <span className="mb-1.5 block text-xs font-medium text-muted">사직서 템플릿</span>
                      <input
                        readOnly
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                        value={registerForm.resignTemplateName}
                        placeholder="사직서템플릿 선택"
                      />
                    </label>
                    <Button type="button" variant="outline" onClick={() => setTemplatePicker("resign")}>
                      <Search size={14} /> 조회
                    </Button>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-muted">적용시점</span>
                      <input
                        type="date"
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                        value={registerForm.resignTemplateDate}
                        onChange={(e) => setRegisterForm((f) => ({ ...f, resignTemplateDate: e.target.value }))}
                      />
                    </label>
                  </div>
                )}
                {regTab === "첨부서류" && (
                  <div className="space-y-3">
                    <div className="flex flex-nowrap items-end gap-2">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-muted">문서종류</span>
                        <select
                          className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                          value={stagedDocType}
                          onChange={(e) => setStagedDocType(e.target.value)}
                        >
                          {DOCUMENT_TYPE_OPTIONS.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      <input
                        type="file"
                        className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                        onChange={(e) => setStagedFile(e.target.files?.[0] || null)}
                      />
                      <Button type="button" variant="outline" onClick={addStagedDoc} disabled={!stagedFile}>
                        <Paperclip size={14} /> 첨부
                      </Button>
                    </div>
                    {stagedDocs.length === 0 ? (
                      <p className="text-xs text-muted">첨부된 서류가 없습니다.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {stagedDocs.map((d, i) => (
                          <li key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 text-sm">
                            <span>
                              <span className="text-muted">[{d.docType}]</span> {d.fileName}
                            </span>
                            <button type="button" className="text-muted hover:text-danger" onClick={() => removeStagedDoc(i)}>
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {regTab === "기본 불러오기" && (
                  <div className="flex flex-nowrap items-end gap-2">
                    <label className="block flex-1">
                      <span className="mb-1.5 block text-xs font-medium text-muted">불러올 근로자</span>
                      <select
                        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                        value={loadFromId}
                        onChange={(e) => setLoadFromId(e.target.value)}
                      >
                        <option value="">선택</option>
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({e.phone})
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button type="button" variant="outline" onClick={loadFromEmployee} disabled={!loadFromId}>
                      <RotateCcw size={14} /> 불러오기
                    </Button>
                    <p className="w-full text-[11px] text-muted">
                      선택한 근로자의 센터/소속업체/근무조건을 그대로 복사해옵니다.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </form>
        )}
      </SidePanel>

      <Modal
        open={Boolean(templatePicker)}
        onClose={() => setTemplatePicker(null)}
        title="사직서템플릿조회"
      >
        <div className="space-y-3">
          <div className="flex flex-nowrap items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1.5 block text-xs font-medium text-muted">검색어</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="템플릿명"
              />
            </label>
            <Button type="button" variant="outline">
              <Search size={14} /> 검색
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-100">
            <table className="w-full text-center text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="px-3 py-2 font-semibold">순번</th>
                  <th className="px-3 py-2 font-semibold">템플릿명</th>
                  <th className="px-3 py-2 font-semibold">사용여부</th>
                  <th className="px-3 py-2 font-semibold">선택</th>
                </tr>
              </thead>
              <tbody>
                {templatePickerResults.map((r, i) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50">
                    <td className="px-3 py-2 text-muted">{i + 1}</td>
                    <td className="px-3 py-2 text-ink">{r.templateName}</td>
                    <td className="px-3 py-2 text-muted">{r.visibility === "숨김" ? "미사용" : "사용"}</td>
                    <td className="px-3 py-2">
                      <button type="button" className="text-xs text-primary hover:underline" onClick={() => applyTemplatePick(r)}>
                        선택
                      </button>
                    </td>
                  </tr>
                ))}
                {templatePickerResults.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted">
                      등록된 템플릿이 없습니다. 템플릿 &gt; 센터별리포트에서 먼저 등록해주세요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
                <div className="max-h-64 overflow-x-auto overscroll-x-contain overflow-y-auto rounded-xl border border-slate-100">
                  <table className="w-full text-center text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-100 text-xs text-muted">
                        <th className="w-8 px-3 py-2"></th>
                        <th className="px-3 py-2 font-semibold">이름</th>
                        <th className="px-3 py-2 font-semibold">전화번호</th>
                        <th className="px-3 py-2 font-semibold">소속업체</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees
                        .filter((e) => e.id !== sourceEmployee.id)
                        .map((e) => (
                          <tr key={e.id} className="border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50">
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
