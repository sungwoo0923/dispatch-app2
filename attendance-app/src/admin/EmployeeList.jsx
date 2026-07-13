import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { MapPin, Check, Copy, Trash2, UserPlus, Building2, Users, Send, History, ArrowLeftRight, X, Search, Paperclip, RotateCcw, Camera, SlidersHorizontal, ArrowUpDown, ChevronUp, ChevronDown, ChevronsUpDown, Upload, Download } from "lucide-react";
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
import DraggableTh from "../components/DraggableTh";
import ColumnVisibilityButton from "../components/ColumnVisibilityButton";
import SortMenuButton from "../components/SortMenuButton";
import { usePagination } from "../hooks/usePagination";
import { useColumnPrefs } from "../hooks/useColumnPrefs";
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
import { softDeleteEmployee, softDeleteEmployees, syncChatProfileFields } from "../utils/employeeUtils";
import {
  DOCUMENT_TYPE_OPTIONS,
  uploadPendingEmployeeDocument,
  uploadPendingEmployeePhoto,
  uploadEmployeeDocument,
  uploadEmployeePhoto,
} from "../utils/documents";
import { openAddressSearch } from "../utils/daumPostcode";
import { openReportPreview } from "../utils/reportTemplates";
import SmsButton, { buildSmsHref } from "../components/SmsButton";
import BankAccountFields from "../components/BankAccountFields";
import { downloadBulkUploadTemplate, parseBulkUploadFile } from "../utils/employeeBulkImport";

const REG_TABS = ["시간템플릿", "수당템플릿", "계약", "계약종료", "첨부서류", "기본 불러오기"];

// 재직/휴직/퇴사가 얼핏 봐도 구분되도록 드롭다운 자체를 상태별로 다르게
// 칠한다. 퇴사/휴직은 재직과 똑같이 생기면 표에서 섞여 보여 헷갈리기 쉽다.
const EMPLOYMENT_STATUS_SELECT_CLS = {
  재직: "border-primary/30 bg-primary-light text-primary",
  휴직: "border-slate-300 bg-slate-100 text-slate-600",
  퇴사: "border-danger/30 bg-red-50 text-danger",
};

const SORTABLE_EMPLOYEE_COLUMNS = new Set([
  "entity",
  "site",
  "gender",
  "vendor",
  "shiftType",
  "employmentType",
  "team",
  "position",
  "nationality",
  "employmentStatus",
  "hireDate",
  "resignDate",
  "payType",
]);

// 근로자가 내정보 > 기본정보 수정요청에서 보내는 필드 — ID(externalId)는
// 항상 잠겨있어 근로자가 바꿀 수 없으므로 여기에 포함하지 않는다.
const INFO_FIELD_LABELS = {
  residentNumberFront: "주민/외국인번호",
  address: "주소",
  addressDetail: "상세주소",
  bankName: "급여은행",
  bankAccount: "급여계좌",
  accountHolder: "예금주",
};

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
  autoSendContract: false,
};

// 편집 모드에서 users/{uid}로 저장할 필드만 골라내는 데 쓰는 화이트리스트 —
// approved/role/companyId/employmentStatus 등 이 폼이 다루지 않는 필드는
// registerForm에 잔류하더라도 절대 덮어쓰지 않기 위함이다.
const REGISTER_FIELD_KEYS = Object.keys(EMPTY_REGISTER_FORM);

// 등록/수정 저장 전 반드시 채워져 있어야 하는 항목들. tab이 있으면 해당 값이
// 비어있을 때 그 탭으로 자동 전환해 보여준다 (탭이 없으면 항상 보이는
// 메인 섹션 필드).
const REQUIRED_FIELDS = [
  { key: "name", label: "이름" },
  { key: "phone", label: "전화번호" },
  { key: "vendorId", label: "소속업체" },
  { key: "workSiteId", label: "센터" },
  { key: "hireDate", label: "입사일자" },
  { key: "workStartDate", label: "근무시작일" },
  { key: "shiftTemplateId", label: "시간템플릿", tab: "시간템플릿" },
  { key: "allowanceTemplateId", label: "수당템플릿", tab: "수당템플릿" },
  { key: "contractTemplateId", label: "계약서템플릿", tab: "계약" },
  { key: "resignTemplateId", label: "사직서템플릿", tab: "계약종료" },
];

// 근로자수정 저장 시 값이 바뀐 필드만 골라 변경이력에 남기기 위한 한글 라벨.
// 여기 없는 키는 변경이력에서 제외한다 (사진/첨부서류 등 별도 처리되는 필드,
// 혹은 사용자에게 의미있게 설명하기 애매한 내부 필드).
const CHANGE_LOG_FIELD_LABELS = {
  name: "이름",
  phone: "전화번호",
  gender: "성별",
  nationality: "국적구분",
  country: "국적",
  visaStatus: "체류자격",
  workSiteId: "센터",
  vendorId: "소속업체",
  hireDate: "입사일자",
  resignDate: "퇴사일자",
  workStartDate: "근무시작일",
  employmentType: "근무형태",
  shiftType: "근무구분",
  payType: "지급구분",
  team: "부서",
  position: "직급",
  employmentStatus: "재직상태",
  insuranceApplied: "4대보험 적용",
  residentNumberFront: "주민번호",
  address: "주소",
  bankName: "은행명",
  bankAccount: "계좌번호",
  accountHolder: "예금주",
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
  const { profile, user } = useAuth();
  const navigate = useNavigate();
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
  const [editingOriginal, setEditingOriginal] = useState(null);

  // 등록화면의 사진: 아직 uid가 없는 신규 등록 단계라 다른 첨부서류와 마찬가지로
  // 로컬에만 들고 있다가 최종 등록 시점에 업로드한다. photoSaved는 "등록" 버튼(파일
  // 선택)과 "저장" 버튼(선택 확정) 두 단계를 오가는 표시용 플래그일 뿐, 실제 파일
  // 업로드는 submitRegister에서 한 번에 처리된다.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [photoSaved, setPhotoSaved] = useState(false);

  const [filters, setFilters] = useState({ siteId: "", vendorId: "", status: "", search: "" });
  // 성별/사업자/고용구분/부서/직급/국적 등은 필터바에 각각 개별 드롭다운으로
  // 늘어놓으면 너무 복잡해 보인다는 요청에 따라, 하나의 "상세필터" 버튼 안에
  // 모아 한 번에 여러 조건을 조합해 걸 수 있게 한다(필터바 자체는 그대로 유지).
  const [advFilters, setAdvFilters] = useState({
    gender: "",
    businessEntityId: "",
    employmentType: "",
    team: "",
    position: "",
    nationality: "",
  });
  const [advFilterOpen, setAdvFilterOpen] = useState(false);
  const advFilterCount = Object.values(advFilters).filter(Boolean).length;
  const [sort, setSort] = useState({ key: "", dir: "asc" });
  const advFilterRef = useRef(null);

  useEffect(() => {
    if (!advFilterOpen) return;
    const onDocClick = (e) => {
      if (advFilterRef.current && !advFilterRef.current.contains(e.target)) setAdvFilterOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [advFilterOpen]);
  const [selected, setSelected] = useState(() => new Set());
  const [listAction, setListAction] = useState("선택");

  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [allowanceTemplates, setAllowanceTemplates] = useState([]);
  const [changeLogs, setChangeLogs] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  // 배정변경요청/기본정보수정요청/가입대기 패널은 항상 접힌 채로 시작하고,
  // 새 항목이 오면 자동으로 펼쳐지지 않고 헤더가 깜빡이기만 한다 — 관리자가
  // 직접 펼쳐보거나 "확인" 버튼을 눌러야 깜빡임이 멈춘다. 이 읽음 시점은
  // 사이드바 배지(adminReadState/{uid}.<navPath>)와는 별도 필드로 저장해야
  // 사이드바 배지가 즉시 사라진 뒤에도 패널의 깜빡임은 남아있을 수 있다.
  const [panelReadState, setPanelReadState] = useState({});
  const [infoChangeRequests, setInfoChangeRequests] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [centerReports, setCenterReports] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const [resignationRequests, setResignationRequests] = useState([]);

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

  // 대용량(대량) 엑셀 업로드: 양식 다운로드 → 파일선택/파싱(미리보기) →
  // 등록 3단계를 하나의 Modal에서 진행한다. bulkResult가 채워지면(등록 완료)
  // 미리보기 대신 결과 요약 + "전체 가입코드 발송" 화면으로 바뀐다.
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkRows, setBulkRows] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null); // { successCount, failCount, created: [{name, phone, code}] }
  const bulkFileInputRef = useRef(null);

  // 가입코드 SMS 발송 큐 — 근로자목록 선택/대용량업로드 성공/단건 등록 성공
  // 세 곳에서 모두 openSmsQueue(recipients)만 호출하면 동일한 발송 화면을
  // 재사용한다. 브라우저는 한 번에 하나의 문자 앱만 열 수 있어 "전체
  // 자동발송"은 불가능하므로, 목록을 계속 띄워둔 채로 관리자가 한 명씩
  // 눌러 보내고 돌아오게 한다(발송 여부만 로컬에서 표시, 안 보낸 사람이
  // 조용히 빠지지 않도록 목록에서 지우지 않는다).
  const [smsQueueOpen, setSmsQueueOpen] = useState(false);
  const [smsQueue, setSmsQueue] = useState([]); // [{name, phone, code}]
  const [smsSentKeys, setSmsSentKeys] = useState(() => new Set());

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "adminReadState", user.uid), (snap) => setPanelReadState(snap.data() || {}));
    return () => unsub();
  }, [user?.uid]);

  const panelHasNew = (key, items) => {
    const lastSeen = panelReadState[key]?.seconds || 0;
    return items.some((d) => (d.createdAt?.seconds || 0) > lastSeen);
  };
  const ackPanel = (key) => {
    if (!user?.uid) return;
    setDoc(doc(db, "adminReadState", user.uid), { [key]: serverTimestamp() }, { merge: true });
  };

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
    const unsubInfoChangeReq = onSnapshot(
      query(collection(db, "infoChangeRequests"), where("companyId", "==", profile.companyId)),
      (snap) => setInfoChangeRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubEntities = onSnapshot(
      query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)),
      (snap) => setBusinessEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubReports = onSnapshot(
      query(collection(db, "centerReports"), where("companyId", "==", profile.companyId)),
      (snap) => setCenterReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const unsubResignations = onSnapshot(
      query(collection(db, "resignationRequests"), where("companyId", "==", profile.companyId)),
      (snap) => setResignationRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
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
      unsubInfoChangeReq();
      unsubEntities();
      unsubReports();
      unsubResignations();
    };
  }, [profile?.companyId]);

  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";
  const entityName_ = (id) => businessEntities.find((b) => b.id === id)?.name || "-";
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const shiftTemplateName_ = (id) => shiftTemplates.find((t) => t.id === id)?.name || "-";
  const allowanceTemplateName_ = (id) => allowanceTemplates.find((t) => t.id === id)?.name || "-";

  const selectCls = "rounded-lg border border-slate-200 px-2 py-1 text-xs";
  const employeeColumns = [
    {
      key: "phone",
      label: "연락처",
      render: (emp) => (
        <span className="inline-flex items-center gap-1">
          {emp.phone}
          <SmsButton phone={emp.phone} />
        </span>
      ),
    },
    { key: "entity", label: "사업자", render: (emp) => entityName_(emp.businessEntityId) },
    {
      key: "employmentStatus",
      label: "재직상태",
      interactive: true,
      render: (emp) => (
        <select
          className={`${selectCls} font-medium ${EMPLOYMENT_STATUS_SELECT_CLS[emp.employmentStatus || "재직"] || ""}`}
          value={emp.employmentStatus || "재직"}
          onChange={(e) => updateFieldWithConfirm(emp.id, "employmentStatus", e.target.value)}
        >
          {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      ),
    },
    {
      key: "site",
      label: "센터",
      interactive: true,
      render: (emp) => (
        <select className={selectCls} value={emp.workSiteId || ""} onChange={(e) => assignSite(emp.id, e.target.value)}>
          <option value="">미배정</option>
          {workSites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ),
    },
    { key: "gender", label: "성별", render: (emp) => emp.gender || "-" },
    { key: "age", label: "나이", render: (emp) => calculateAge(emp.residentNumberFront) ?? "-" },
    { key: "vendor", label: "소속업체", render: (emp) => vendorName_(emp.vendorId) },
    {
      key: "shiftType",
      label: "근무구분",
      interactive: true,
      render: (emp) => (
        <select className={selectCls} value={emp.shiftType || ""} onChange={(e) => updateFieldWithConfirm(emp.id, "shiftType", e.target.value)}>
          <option value="">-</option>
          {SHIFT_TYPE_OPTIONS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      ),
    },
    {
      key: "employmentType",
      label: "고용구분",
      interactive: true,
      render: (emp) => (
        <select className={selectCls} value={emp.employmentType || ""} onChange={(e) => updateFieldWithConfirm(emp.id, "employmentType", e.target.value)}>
          <option value="">-</option>
          {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      ),
    },
    { key: "note", label: "근무비고", render: (emp) => emp.note || "-" },
    {
      key: "team",
      label: "부서",
      interactive: true,
      render: (emp) => (
        <select className={selectCls} value={emp.team || ""} onChange={(e) => updateFieldWithConfirm(emp.id, "team", e.target.value)}>
          <option value="">-</option>
          {departments.map((d) => (
            <option key={d.id} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "position",
      label: "직급",
      interactive: true,
      render: (emp) => (
        <select className={selectCls} value={emp.position || ""} onChange={(e) => updateFieldWithConfirm(emp.id, "position", e.target.value)}>
          <option value="">-</option>
          {positions.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      ),
    },
    { key: "shiftTemplate", label: "시간템플릿", render: (emp) => shiftTemplateName_(emp.shiftTemplateId) },
    { key: "allowanceTemplate", label: "수당템플릿", render: (emp) => allowanceTemplateName_(emp.allowanceTemplateId) },
    { key: "contractTemplate", label: "계약서템플릿", render: (emp) => emp.contractTemplateName || "-" },
    { key: "resignTemplate", label: "사직서템플릿", render: (emp) => emp.resignTemplateName || "-" },
    { key: "nationality", label: "외/내국인", render: (emp) => emp.nationality || "-" },
    { key: "country", label: "국적", render: (emp) => emp.country || "-" },
    { key: "hireDate", label: "입사일", render: (emp) => (emp.hireDate ? formatDate(emp.hireDate) : "-") },
    { key: "resignDate", label: "퇴사일", render: (emp) => (emp.resignDate ? formatDate(emp.resignDate) : "-") },
    { key: "signup", label: "회원가입", render: () => "Y" },
    { key: "employeeCode", label: "가입코드", render: (emp) => emp.employeeCode || "-" },
    { key: "insurance", label: "4대보험", render: (emp) => (emp.insuranceApplied === "Y" ? "Y" : "N") },
    { key: "payType", label: "급여", render: (emp) => emp.payType || "-" },
    {
      key: "approved",
      label: "승인",
      interactive: true,
      render: (emp) =>
        emp.approved ? (
          <Badge tone="success">
            <Check size={12} /> 승인됨
          </Badge>
        ) : (
          <Button size="sm" onClick={() => approve(emp.id)}>
            승인
          </Button>
        ),
    },
    {
      key: "delete",
      label: "삭제",
      interactive: true,
      render: (emp) => (
        <button type="button" className="text-muted hover:text-danger" title="삭제" onClick={() => deleteEmployee(emp)}>
          <Trash2 size={14} />
        </button>
      ),
    },
  ];
  const {
    visibleColumns: visibleEmployeeColumns,
    hidden: hiddenEmployeeColumns,
    moveColumn: moveEmployeeColumn,
    toggleColumn: toggleEmployeeColumn,
    columns: employeeColumnsOrdered,
  } = useColumnPrefs("employeeList", employeeColumns);

  // 정렬 기준(id 참조 컬럼은 화면에 보이는 이름으로 정렬해야 의미가 있다 —
  // 예를 들어 "사업자"는 businessEntityId가 아니라 사업자명 기준으로 정렬).
  const EMPLOYEE_SORT_ACCESSORS = {
    name: (e) => e.name || "",
    entity: (e) => entityName_(e.businessEntityId),
    site: (e) => siteName_(e.workSiteId),
    gender: (e) => e.gender || "",
    vendor: (e) => vendorName_(e.vendorId),
    shiftType: (e) => e.shiftType || "",
    employmentType: (e) => e.employmentType || "",
    team: (e) => e.team || "",
    position: (e) => e.position || "",
    nationality: (e) => e.nationality || "",
    employmentStatus: (e) => e.employmentStatus || "재직",
    hireDate: (e) => e.hireDate || "",
    resignDate: (e) => e.resignDate || "",
    payType: (e) => e.payType || "",
  };
  const STATUS_SORT_PRIORITY = { 재직: 0, 휴직: 1, 퇴사: 2 };

  const filteredEmployees = useMemo(() => {
    const rows = employees.filter((emp) => {
      if (emp.deleted) return false;
      if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
      if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
      if (filters.status && (emp.employmentStatus || "재직") !== filters.status) return false;
      if (filters.search && !`${emp.name}${emp.phone}`.includes(filters.search)) return false;
      if (advFilters.gender && emp.gender !== advFilters.gender) return false;
      if (advFilters.businessEntityId && emp.businessEntityId !== advFilters.businessEntityId) return false;
      if (advFilters.employmentType && emp.employmentType !== advFilters.employmentType) return false;
      if (advFilters.team && emp.team !== advFilters.team) return false;
      if (advFilters.position && emp.position !== advFilters.position) return false;
      if (advFilters.nationality && emp.nationality !== advFilters.nationality) return false;
      return true;
    });
    if (!sort.key) {
      // 기본 정렬: 등록된 순서(원래 목록 순서)는 그대로 유지하면서, 재직 →
      // 휴직 → 퇴사 순으로 그룹만 묶는다(Array.sort는 안정 정렬이라 그룹 내
      // 순서는 바뀌지 않는다).
      return [...rows].sort(
        (a, b) =>
          (STATUS_SORT_PRIORITY[a.employmentStatus || "재직"] ?? 1) - (STATUS_SORT_PRIORITY[b.employmentStatus || "재직"] ?? 1)
      );
    }
    const accessor = EMPLOYEE_SORT_ACCESSORS[sort.key] || ((e) => e[sort.key] || "");
    const dir = sort.dir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
    });
  }, [employees, filters, advFilters, sort, businessEntities, workSites, vendors]);

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
  // 스케줄등록 메뉴로 이동하면서 이 근로자를 출근자등록 팝업에 바로
  // 미리 채워준다 — 동명이인이 있을 수 있으므로 이름 검색이 아니라
  // uid로 정확히 지정해 넘긴다(Schedule.jsx가 location.state에서 읽음).
  const runScheduleRegister = () => {
    if (!rowMenu) return;
    navigate("/schedule", { state: { presetEmployeeId: rowMenu.emp.id } });
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

  // 목록 화면의 인라인 드롭다운(센터/근무구분/근무형태/부서/직급 등)으로 바로
  // 바꾸는 것도 근로자등록 상세에서 수정하는 것과 동일한 정보 변경이므로,
  // 변경이력에 남아야 한다.
  const logFieldChange = (uid, field, beforeRaw, afterRaw) => {
    const label = CHANGE_LOG_FIELD_LABELS[field];
    if (!label) return;
    const display = (v) => (field === "workSiteId" ? siteName_(v) : field === "vendorId" ? vendorName_(v) : v || "-");
    if ((beforeRaw || "") === (afterRaw || "")) return;
    logChange(uid, "정보수정", `${label}: ${display(beforeRaw)} → ${display(afterRaw)}`);
  };

  const assignSite = async (uid, workSiteId) => {
    const emp = employees.find((e) => e.id === uid);
    const before = emp?.workSiteId;
    if ((before || "") === (workSiteId || "")) return;
    if (!(await confirm(`${emp?.name}님의 센터를 "${siteName_(before) || "없음"}"에서 "${siteName_(workSiteId) || "없음"}"(으)로 변경하시겠습니까?`, "edit")))
      return;
    await updateDoc(doc(db, "users", uid), { workSiteId: workSiteId || null });
    logFieldChange(uid, "workSiteId", before, workSiteId);
  };
  const updateField = (uid, field, value) => {
    const before = employees.find((e) => e.id === uid)?.[field];
    updateDoc(doc(db, "users", uid), { [field]: value });
    if (field === "name" || field === "position" || field === "phone") {
      syncChatProfileFields(uid, { [field]: value });
    }
    logFieldChange(uid, field, before, value);
  };

  // 목록 표의 드롭다운(부서/직급/근무구분/고용구분/재직상태 등)은 실수로
  // 스치듯 클릭해도 바로 반영돼버리면 위험하므로, 무엇을 무엇으로 바꾸는지
  // 보여주는 확인창을 거치게 한다. 재직상태를 퇴사로 바꾸는 경우는 SidePanel의
  // 퇴직처리 버튼과 동일한 문구/동작(퇴사일자 함께 기록)을 그대로 재사용한다.
  const updateFieldWithConfirm = async (uid, field, value) => {
    const emp = employees.find((e) => e.id === uid);
    const before = emp?.[field];
    if (before === value) return;
    const label = CHANGE_LOG_FIELD_LABELS[field] || field;

    if (field === "employmentStatus" && value === "퇴사") {
      const resignDate = toDateKey();
      if (!(await confirm(`${emp?.name} 근로자를 ${formatDate(resignDate)}자로 퇴직처리 하시겠습니까?`, "delete"))) return;
      await updateDoc(doc(db, "users", uid), { employmentStatus: "퇴사", resignDate });
      logFieldChange(uid, "employmentStatus", before, value);
      toast.success("퇴직처리 되었습니다");
      return;
    }

    if (!(await confirm(`${emp?.name}님의 ${label}을(를) "${before || "없음"}"에서 "${value || "없음"}"(으)로 변경하시겠습니까?`, "edit")))
      return;
    updateField(uid, field, value);
  };

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

  // 근로자가 내정보 > 기본정보를 최초 저장한 뒤에는 스스로 수정할 수 없고
  // 이 수정요청을 통해서만 값이 바뀐다 — 관리자가 승인해야 실제
  // users/{uid} 문서에 반영되고, 반려하면 근로자가 입력한 값은 그대로
  // 남아 아무 것도 바뀌지 않는다.
  const approveInfoChangeRequest = async (req) => {
    await updateDoc(doc(db, "users", req.uid), req.requestedValues);
    syncChatProfileFields(req.uid, {
      name: req.requestedValues?.name,
      position: req.requestedValues?.position,
      phone: req.requestedValues?.phone,
    });
    await updateDoc(doc(db, "infoChangeRequests", req.id), { status: "approved", resolvedAt: serverTimestamp() });
    toast.success("승인되었습니다");
  };
  const rejectInfoChangeRequest = (req) =>
    updateDoc(doc(db, "infoChangeRequests", req.id), { status: "rejected", resolvedAt: serverTimestamp() }).then(() =>
      toast.success("반려되었습니다")
    );
  const deleteInfoChangeRequest = async (req) => {
    if (!(await confirm("이 수정요청을 삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "infoChangeRequests", req.id));
    toast.success("삭제되었습니다");
  };

  // 사직서를 제출(=서명 완료)한 근로자는 그대로 삭제 진행하되, 아직 제출하지
  // 않은 상태에서 삭제하면 사직 처리 없이 근로 이력이 사라져버릴 수 있으므로
  // "정말 이대로 삭제할지"를 한 번 더 물어본다.
  const hasSubmittedResignation = (uid) =>
    resignationRequests.some((r) => r.uid === uid && !r.deleted && r.employeeSignatureDataUrl);

  const deleteEmployee = async (emp) => {
    if (!hasSubmittedResignation(emp.id)) {
      if (
        !(await confirm(
          `${emp.name} 근로자는 아직 사직서를 제출하지 않았습니다. 그래도 삭제하시겠습니까?`,
          "delete"
        ))
      )
        return;
    }
    if (!(await confirm(`${emp.name} 근로자를 삭제하시겠습니까? 삭제하면 모바일 접속이 차단됩니다.`, "delete"))) return;
    await softDeleteEmployee(emp.id);
    toast.success("삭제되었습니다");
  };

  const deleteSelectedEmployees = async () => {
    const targets = filteredEmployees.filter((emp) => selected.has(emp.id));
    if (targets.length === 0) return;
    const notSubmitted = targets.filter((emp) => !hasSubmittedResignation(emp.id));
    if (notSubmitted.length > 0) {
      if (
        !(await confirm(
          `선택된 ${targets.length}명 중 ${notSubmitted.length}명은 아직 사직서를 제출하지 않았습니다. 그래도 삭제하시겠습니까?`,
          "delete"
        ))
      )
        return;
    }
    if (!(await confirm(`선택된 ${targets.length}명을 삭제하시겠습니까? 삭제하면 모바일 접속이 차단됩니다.`, "delete"))) return;
    try {
      await softDeleteEmployees(targets.map((emp) => emp.id));
      toast.success(`${targets.length}명 삭제되었습니다`);
      setSelected(new Set());
    } catch (err) {
      toast.error(`삭제에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  const deleteChangeRequest = async (req) => {
    if (!(await confirm("이 배정변경 요청을 삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "assignmentChangeRequests", req.id));
    toast.success("삭제되었습니다");
  };

  const deleteChangeLog = async (log) => {
    if (!(await confirm("이 변경이력을 삭제하시겠습니까?", "delete"))) return;
    await deleteDoc(doc(db, "employeeChangeLogs", log.id));
    toast.success("삭제되었습니다");
  };

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
    setEditingOriginal(null);
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
    setManualCode(generateInviteCode(7));
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
    setEditingOriginal(emp);
    setRegisterForm({ ...EMPTY_REGISTER_FORM, ...emp });
    setPhotoPreviewUrl(emp.photoUrl || "");
    setPhotoSaved(!!emp.photoUrl);
    setRegisterOpen(true);
  };

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

  // 근로자등록 폼(EMPTY_REGISTER_FORM/REGISTER_FIELD_KEYS)은 employmentStatus를
  // 다루지 않으므로(위 주석 참고), 퇴직처리는 저장 버튼과 무관하게 즉시
  // Firestore에 반영한다 — 다른 폼 필드 변경사항의 저장 여부와 섞이면 안 되는
  // 별도의 인사처리 액션이기 때문.
  const processResignation = async () => {
    if (!editingUid) return;
    const resignDate = registerForm.resignDate || toDateKey();
    if (!(await confirm(`${registerForm.name} 근로자를 ${formatDate(resignDate)}자로 퇴직처리 하시겠습니까?`, "delete"))) return;
    await updateDoc(doc(db, "users", editingUid), { employmentStatus: "퇴사", resignDate });
    setRegisterForm((f) => ({ ...f, employmentStatus: "퇴사", resignDate }));
    toast.success("퇴직처리 되었습니다");
  };

  const cancelResignation = async () => {
    if (!editingUid) return;
    if (!(await confirm(`${registerForm.name} 근로자의 퇴직처리를 취소하고 재직 상태로 되돌리시겠습니까?`, "edit"))) return;
    await updateDoc(doc(db, "users", editingUid), { employmentStatus: "재직", resignDate: "" });
    setRegisterForm((f) => ({ ...f, employmentStatus: "재직", resignDate: "" }));
    toast.success("재직 상태로 변경되었습니다");
  };

  // 근로자등록(단건) 저장과 대용량업로드(대량 등록)가 공유하는 가입대기 생성
  // 로직 — pendingEmployees/{가입코드} 문서를 만들고 발급된 코드를 돌려준다.
  // 단건 등록에서 쓰던 로직을 그대로 옮긴 것으로, code를 넘기지 않으면
  // generateInviteCode(7)로 새로 발급한다(대량 등록은 매 행마다 새 코드가
  // 필요하므로 항상 넘기지 않고 호출한다).
  const createPendingEmployee = async (formValues, code) => {
    const inviteCode = code || generateInviteCode(7);
    await setDoc(doc(db, "pendingEmployees", inviteCode), {
      companyId: profile.companyId,
      ...formValues,
      photoUrl: "",
      employmentStatus: "재직",
      createdAt: serverTimestamp(),
    });
    return inviteCode;
  };

  // 가입코드 SMS 발송 문구 — Feature 2(가입코드 SMS 발송)의 세 진입점(목록
  // 선택발송/대량등록 성공 후 전체발송/단건등록 성공화면)이 모두 이 문구를
  // 그대로 재사용한다.
  const buildInviteSmsMessage = (code) =>
    `[KP-work] ${companyName || "회사"} 가입 안내\n아래 가입코드로 모바일 앱에서 가입해주세요.\n가입코드: ${code}\n앱: ${window.location.origin}`;

  const openSmsQueue = (recipients) => {
    const targets = (recipients || []).filter((r) => r.phone);
    if (targets.length === 0) {
      toast.error("연락처가 있는 대상이 없습니다.");
      return;
    }
    setSmsQueue(targets);
    setSmsSentKeys(new Set());
    setSmsQueueOpen(true);
  };
  const closeSmsQueue = () => setSmsQueueOpen(false);
  const markSmsSent = (key) => setSmsSentKeys((prev) => new Set(prev).add(key));

  // 근로자목록에서 체크박스로 선택한 근로자들에게 가입코드 SMS 발송을
  // 시작한다. 이미 가입 완료된 근로자들이라 pendingEmployees의 실제
  // 로그인용 가입코드는 더 이상 없으므로(가입 시 소진), 목록 표의 "가입코드"
  // 컬럼과 동일하게 employeeCode(사원코드)를 코드로 보여준다.
  const sendInviteCodesToSelected = async () => {
    const targets = filteredEmployees.filter((emp) => selected.has(emp.id));
    if (targets.length === 0) return;
    if (!(await confirm(`선택한 ${targets.length}명에게 가입코드 SMS 발송을 시작하시겠습니까?`, "send"))) return;
    openSmsQueue(targets.map((emp) => ({ name: emp.name, phone: emp.phone, code: emp.employeeCode || "-" })));
  };

  const submitRegister = async (e) => {
    e.preventDefault();

    const missing = REQUIRED_FIELDS.find((f) => !registerForm[f.key]);
    if (missing) {
      toast.error(`[${missing.label}] 항목을 입력/선택해주세요.`);
      if (missing.tab) setRegTab(missing.tab);
      document.getElementById(`field-${missing.key}`)?.focus();
      return;
    }

    // 사진/첨부서류 업로드(Storage)는 근로자 정보 저장(Firestore) 자체와는 별개의
    // 실패 지점이다. Storage 설정 문제로 업로드만 실패해도 이미 저장된 핵심 정보까지
    // "저장 실패"로 오인하지 않도록, 핵심 저장을 먼저 끝내고 업로드는 뒤에 분리해서
    // 처리하며 실패해도 별도의 경고 토스트만 띄운다.
    try {
      if (editingUid) {
        const payload = Object.fromEntries(REGISTER_FIELD_KEYS.map((k) => [k, registerForm[k]]));
        // 관리자가 여기서 근로자의 기본정보(주민번호/주소/계좌 등)를 채워
        // 넣었다면, 모바일 내정보의 "기본정보 입력" 카드도 근로자가 직접
        // 입력해 잠긴 것과 동일하게 접힌 상태로 보여야 한다.
        const BASIC_INFO_KEYS = ["residentNumberFront", "address", "bankName", "bankAccount", "accountHolder"];
        if (BASIC_INFO_KEYS.every((k) => String(payload[k] || "").trim())) {
          payload.basicInfoSubmitted = true;
        }
        await updateDoc(doc(db, "users", editingUid), payload);
        syncChatProfileFields(editingUid, { name: payload.name, position: payload.position, phone: payload.phone });
        if (editingOriginal) {
          for (const [key, label] of Object.entries(CHANGE_LOG_FIELD_LABELS)) {
            const before = editingOriginal[key] ?? "";
            const after = payload[key] ?? "";
            if (before !== after) {
              await logChange(editingUid, "정보수정", `${label}: ${before || "-"} → ${after || "-"}`);
            }
          }
        }
        toast.success("수정되었습니다");
        closeRegisterModal();

        try {
          if (photoFile) {
            const photoUrl = await uploadEmployeePhoto({ companyId: profile.companyId, uid: editingUid, file: photoFile });
            await updateDoc(doc(db, "users", editingUid), { photoUrl });
          }
          for (const { docType, file } of stagedDocs) {
            await uploadEmployeeDocument({ companyId: profile.companyId, uid: editingUid, employeeName: registerForm.name, docType, file, uploadedBy: "admin" });
          }
        } catch (uploadErr) {
          console.error(uploadErr);
          toast.error(`근로자 정보는 저장되었지만 사진/서류 업로드에 실패했습니다. (${uploadErr?.code || uploadErr?.message || "오류"})`);
        }
        return;
      }

      const code = await createPendingEmployee(registerForm, manualCode);
      toast.success("저장되었습니다");
      setIssuedCode(code);

      try {
        let photoUrl = "";
        if (photoFile) {
          photoUrl = await uploadPendingEmployeePhoto({ companyId: profile.companyId, pendingCode: code, file: photoFile });
          await setDoc(doc(db, "pendingEmployees", code), { photoUrl }, { merge: true });
        }
        for (const { docType, file } of stagedDocs) {
          await uploadPendingEmployeeDocument({ companyId: profile.companyId, pendingCode: code, employeeName: registerForm.name, docType, file });
        }
      } catch (uploadErr) {
        console.error(uploadErr);
        toast.error(`근로자 정보는 저장되었지만 사진/서류 업로드에 실패했습니다. (${uploadErr?.code || uploadErr?.message || "오류"})`);
      }
    } catch (err) {
      console.error(err);
      toast.error(`저장에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  // 근로자등록 창이 열려있는 동안 F4로 바로 등록/저장할 수 있게 한다
  // (발급된 가입코드 확인 화면일 땐 등록할 폼이 없으므로 제외).
  useEffect(() => {
    if (!registerOpen || issuedCode) return;
    const onKeyDown = (e) => {
      if (e.key === "F4") {
        e.preventDefault();
        submitRegister(e);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [registerOpen, issuedCode, submitRegister]);

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

  // 사직서템플릿을 미리 배정해두는 것과, 실제로 그 근로자의 사직 절차를
  // 시작하는 것은 별개의 행위다 — 템플릿 선택은 근로자등록 시 항상 필요하지만
  // (선택지 준비), 실제 사직서 발송은 관리자가 이 버튼을 눌러 명시적으로
  // 시작해야 한다. 발송 후에는 모바일에서 근로자 서명 → 담당/대표 결재 순으로
  // 진행되며, 대표 서명까지 완료되면 자동으로 퇴직처리된다.
  const sendResignationRequest = async () => {
    if (!editingUid || !registerForm.resignTemplateId) return;
    if (!(await confirm(`${registerForm.name}님에게 사직서를 발송하시겠습니까? 근로자 서명과 결재가 모두 완료되면 자동으로 퇴직처리됩니다.`, "send")))
      return;
    try {
      await addDoc(collection(db, "resignationRequests"), {
        companyId: profile.companyId,
        uid: editingUid,
        businessEntityId: registerForm.businessEntityId || "",
        employeeName: registerForm.name,
        position: registerForm.position || "",
        siteName: siteName_(registerForm.workSiteId),
        hireDate: registerForm.hireDate || "",
        resignDate: registerForm.resignTemplateDate || toDateKey(),
        templateName: registerForm.resignTemplateName,
        reason: "",
        employeeSignatureDataUrl: null,
        employeeSignedAt: null,
        managerSignatureDataUrl: null,
        managerSignedAt: null,
        managerName: "",
        ceoSignatureDataUrl: null,
        ceoSignedAt: null,
        ceoName: "",
        status: "employee_pending",
        createdAt: serverTimestamp(),
      });
      toast.success("사직서가 발송되었습니다");
    } catch (e) {
      console.error(e);
      toast.error(
        e?.code === "permission-denied"
          ? "사직서 발송에 실패했습니다. (권한 오류: Firestore 보안규칙이 아직 배포되지 않았을 수 있습니다)"
          : `사직서 발송에 실패했습니다. (${e?.code || e?.message || "알 수 없는 오류"})`
      );
    }
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
    const payload = {
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
    };
    // 이 근로자에게 이미 근로자 서명 전인(미완료) 계약서가 있다면 중복 문서를
    // 새로 만들지 않고 그 문서를 갱신한다 — 그렇지 않으면 관리자가 계약서메뉴를
    // 다시 열 때마다 새 계약서가 쌓여, 근로자가 이미 서명한 계약서와 별개로
    // "서명대기"인 예전 문서가 그대로 남아있는 것처럼 보이는 문제가 생긴다.
    const existing = await getDocs(
      query(collection(db, "contracts"), where("companyId", "==", profile.companyId), where("uid", "==", editingUid))
    );
    const unsigned = existing.docs.find((d) => !d.data().employeeSignatureDataUrl);
    if (unsigned) {
      await updateDoc(doc(db, "contracts", unsigned.id), payload);
    } else {
      await addDoc(collection(db, "contracts"), { ...payload, createdAt: serverTimestamp() });
    }
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
      sendInviteCodesToSelected();
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

  // 대용량업로드 팝업을 완전히 초기화하며 닫는다(양식 다운로드/파일선택
  // 단계로 다시 열 수 있도록).
  const closeBulkUpload = () => {
    setBulkUploadOpen(false);
    setBulkFileName("");
    setBulkRows([]);
    setBulkResult(null);
  };

  const handleBulkFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBulkFileName(file.name);
    setBulkResult(null);
    try {
      const rows = await parseBulkUploadFile(file, { businessEntities, workSites, vendors });
      setBulkRows(rows);
      if (rows.length === 0) toast.error("엑셀 파일에서 데이터를 찾지 못했습니다.");
    } catch (err) {
      console.error(err);
      toast.error("엑셀 파일을 읽는 중 오류가 발생했습니다. 다운로드한 양식을 그대로 사용해주세요.");
    }
  };

  const bulkValidRows = bulkRows.filter((r) => r.valid);

  // 미리보기에서 유효한(이름+연락처가 채워진) 행만 골라 한 건씩
  // createPendingEmployee(가입코드 발급 로직 재사용)로 등록한다. 사업자/센터/
  // 소속업체명이 매칭되지 않은 값은 이미 parseBulkUploadFile 단계에서 빈
  // id로 처리되어 있으므로 그대로 두고(등록은 진행), 완료 후 요약에 실패
  // 건수만 보여준다.
  const submitBulkUpload = async () => {
    if (bulkValidRows.length === 0) return;
    const invalidCount = bulkRows.length - bulkValidRows.length;
    if (
      !(await confirm(
        `유효한 ${bulkValidRows.length}건을 일괄 등록하시겠습니까?${invalidCount > 0 ? ` (이름/연락처 누락 ${invalidCount}건은 제외됩니다)` : ""}`,
        "save"
      ))
    )
      return;

    setBulkSubmitting(true);
    const created = [];
    let failCount = invalidCount;
    for (const row of bulkValidRows) {
      try {
        const formValues = {
          ...EMPTY_REGISTER_FORM,
          name: row.name,
          phone: formatPhoneNumber(row.phone),
          businessEntityId: row.businessEntityId,
          workSiteId: row.workSiteId,
          vendorId: row.vendorId,
          team: row.team,
          position: row.position,
          hireDate: row.hireDate || toDateKey(),
          workStartDate: row.hireDate || toDateKey(),
          employmentType: row.employmentType || EMPTY_REGISTER_FORM.employmentType,
          shiftType: row.shiftType || EMPTY_REGISTER_FORM.shiftType,
          nationality: row.nationality || EMPTY_REGISTER_FORM.nationality,
          country: row.country || EMPTY_REGISTER_FORM.country,
          gender: row.gender || EMPTY_REGISTER_FORM.gender,
          bankName: row.bankName,
          bankAccount: row.bankAccount,
        };
        const code = await createPendingEmployee(formValues);
        created.push({ name: row.name, phone: formValues.phone, code });
      } catch (err) {
        console.error(err);
        failCount += 1;
      }
    }
    setBulkSubmitting(false);
    setBulkRows([]);
    setBulkResult({ successCount: created.length, failCount, created });
    toast.success(`${created.length}명 등록되었습니다, ${failCount}건 실패`);
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
            <Button variant="outline" onClick={() => setBulkUploadOpen(true)}>
              <Upload size={16} /> 대용량업로드
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
          <div className="relative shrink-0" ref={advFilterRef}>
            <Button
              variant="outline"
              onClick={() => setAdvFilterOpen((v) => !v)}
              className={advFilterCount ? "border-primary text-primary" : ""}
            >
              <SlidersHorizontal size={15} /> 상세필터
              {advFilterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-white">{advFilterCount}</span>}
            </Button>
            {advFilterOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[320px] rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-muted">성별</span>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                      value={advFilters.gender}
                      onChange={(e) => setAdvFilters((f) => ({ ...f, gender: e.target.value }))}
                    >
                      <option value="">전체</option>
                      <option value="남">남</option>
                      <option value="여">여</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-muted">외/내국인</span>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                      value={advFilters.nationality}
                      onChange={(e) => setAdvFilters((f) => ({ ...f, nationality: e.target.value }))}
                    >
                      <option value="">전체</option>
                      {NATIONALITY_OPTIONS.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-muted">사업자</span>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                      value={advFilters.businessEntityId}
                      onChange={(e) => setAdvFilters((f) => ({ ...f, businessEntityId: e.target.value }))}
                    >
                      <option value="">전체</option>
                      {businessEntities.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-muted">고용구분</span>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                      value={advFilters.employmentType}
                      onChange={(e) => setAdvFilters((f) => ({ ...f, employmentType: e.target.value }))}
                    >
                      <option value="">전체</option>
                      {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-muted">부서</span>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                      value={advFilters.team}
                      onChange={(e) => setAdvFilters((f) => ({ ...f, team: e.target.value }))}
                    >
                      <option value="">전체</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-medium text-muted">직급</span>
                    <select
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                      value={advFilters.position}
                      onChange={(e) => setAdvFilters((f) => ({ ...f, position: e.target.value }))}
                    >
                      <option value="">전체</option>
                      {positions.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    className="text-xs font-medium text-muted hover:text-danger"
                    onClick={() =>
                      setAdvFilters({ gender: "", businessEntityId: "", employmentType: "", team: "", position: "", nationality: "" })
                    }
                  >
                    초기화
                  </button>
                  <Button size="sm" onClick={() => setAdvFilterOpen(false)}>
                    적용
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted">
            <span>목록 {filteredEmployees.length}건</span>
            <span className="text-slate-300">·</span>
            <span className="text-primary">재직 {filteredEmployees.filter((e) => (e.employmentStatus || "재직") === "재직").length}</span>
            <span className="text-slate-500">휴직 {filteredEmployees.filter((e) => e.employmentStatus === "휴직").length}</span>
            <span className="text-danger">퇴사 {filteredEmployees.filter((e) => e.employmentStatus === "퇴사").length}</span>
          </p>
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
            <Button
              size="sm"
              variant="outline"
              onClick={sendInviteCodesToSelected}
              disabled={selected.size === 0}
              title="선택한 근로자에게 가입코드 안내 SMS를 발송합니다"
            >
              <Send size={13} /> 가입코드 발송
            </Button>
            <Button size="sm" variant="danger" onClick={deleteSelectedEmployees} disabled={selected.size === 0}>
              <Trash2 size={13} /> 삭제
            </Button>
            <SortMenuButton
              sort={sort}
              setSort={setSort}
              options={[
                { value: "name", label: "이름" },
                { value: "entity", label: "사업자" },
                { value: "site", label: "센터" },
                { value: "gender", label: "성별" },
                { value: "vendor", label: "소속업체" },
                { value: "shiftType", label: "근무구분" },
                { value: "employmentType", label: "고용구분" },
                { value: "team", label: "부서" },
                { value: "position", label: "직급" },
                { value: "nationality", label: "외/내국인" },
                { value: "employmentStatus", label: "재직상태" },
                { value: "hireDate", label: "입사일자" },
                { value: "resignDate", label: "퇴사일" },
                { value: "payType", label: "급여" },
              ]}
            />
            <ColumnVisibilityButton columns={employeeColumnsOrdered} hidden={hiddenEmployeeColumns} toggleColumn={toggleEmployeeColumn} />
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
                <th className="sticky left-0 z-20 w-10 min-w-10 max-w-10 bg-primary-light px-2 py-3 font-semibold">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === filteredEmployees.length} onChange={toggleSelectAll} />
                </th>
                <th className="sticky left-10 z-20 w-14 min-w-14 max-w-14 bg-primary-light px-2 py-3 font-semibold">순번</th>
                <th className="sticky left-24 z-20 w-28 min-w-28 max-w-28 bg-primary-light px-2 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key: "name", dir: s.key === "name" && s.dir === "asc" ? "desc" : "asc" }))}
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    이름
                    {sort.key === "name" ? (
                      sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                    ) : (
                      <ChevronsUpDown size={12} className="text-slate-300" />
                    )}
                  </button>
                </th>
                {visibleEmployeeColumns.map((c) => (
                  <DraggableTh
                    key={c.key}
                    columnKey={c.key}
                    onMove={moveEmployeeColumn}
                    className="px-4 py-3 font-semibold"
                    sortKey={SORTABLE_EMPLOYEE_COLUMNS.has(c.key) ? c.key : undefined}
                    sort={sort}
                    onSort={setSort}
                  >
                    {c.label}
                  </DraggableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((emp, i) => {
                const isSelected = selected.has(emp.id);
                const stickyBg = isSelected ? "bg-primary-light" : i % 2 === 0 ? "bg-white" : "bg-slate-50";
                return (
                <tr
                  key={emp.id}
                  onDoubleClick={() => openEditEmployee(emp)}
                  onContextMenu={(e) => openRowMenu(e, emp)}
                  title="더블클릭하여 수정 · 우클릭하여 복사"
                  className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-100 ${
                    isSelected ? "bg-primary-light/60" : "odd:bg-white even:bg-slate-50/50"
                  }`}
                >
                  <td
                    className={`sticky left-0 z-10 w-10 min-w-10 max-w-10 px-2 py-3 ${stickyBg}`}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelected(emp.id)} />
                  </td>
                  <td className={`sticky left-10 z-10 w-14 min-w-14 max-w-14 px-2 py-3 text-muted ${stickyBg}`}>
                    {(page - 1) * pageSize + i + 1}
                  </td>
                  <td className={`sticky left-24 z-10 w-28 min-w-28 max-w-28 overflow-hidden text-ellipsis px-2 py-3 text-ink ${stickyBg}`}>{emp.name}</td>
                  {visibleEmployeeColumns.map((c) => (
                    <td
                      key={c.key}
                      className="px-4 py-3 text-ink"
                      onDoubleClick={c.interactive ? (e) => e.stopPropagation() : undefined}
                    >
                      {c.render(emp)}
                    </td>
                  ))}
                </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={visibleEmployeeColumns.length + 3} className="px-4 py-6 text-center text-xs text-muted">
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
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-slate-50"
            onClick={runScheduleRegister}
          >
            스케줄등록
          </button>
        </div>
      )}

      <Panel
        icon={ArrowLeftRight}
        title={`배정변경 요청 (승인대기 ${changeRequests.filter((r) => r.status === "pending").length}건)`}
        defaultCollapsed
        highlight={panelHasNew("panel_assignmentChangeRequests", changeRequests)}
        actions={
          panelHasNew("panel_assignmentChangeRequests", changeRequests) ? (
            <Button size="sm" variant="outline" onClick={() => ackPanel("panel_assignmentChangeRequests")}>
              <Check size={13} /> 확인
            </Button>
          ) : null
        }
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
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {[...changeRequests]
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .slice(0, 20)
                .map((req, i) => (
                  <tr key={req.id} className="border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50">
                    <td className="px-4 py-3 text-ink">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{req.name}</td>
                    <td className="px-4 py-3 text-ink">{req.currentSiteName || "-"}</td>
                    <td className="px-4 py-3 text-ink">{req.requestedSiteName || "-"}</td>
                    <td className="px-4 py-3 text-ink">{req.requestedVendorName || "-"}</td>
                    <td className="px-4 py-3 text-ink">{req.reason || "-"}</td>
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
                    <td className="px-4 py-3">
                      <button type="button" className="text-muted hover:text-danger" title="삭제" onClick={() => deleteChangeRequest(req)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              {changeRequests.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-xs text-muted">
                    배정변경 요청이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        icon={UserPlus}
        title={`기본정보 수정요청 (승인대기 ${infoChangeRequests.filter((r) => r.status === "pending").length}건)`}
        defaultCollapsed
        highlight={panelHasNew("panel_infoChangeRequests", infoChangeRequests)}
        actions={
          panelHasNew("panel_infoChangeRequests", infoChangeRequests) ? (
            <Button size="sm" variant="outline" onClick={() => ackPanel("panel_infoChangeRequests")}>
              <Check size={13} /> 확인
            </Button>
          ) : null
        }
      >
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[720px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">변경내용</th>
                <th className="px-4 py-3 font-semibold">사유</th>
                <th className="px-4 py-3 font-semibold">상태</th>
                <th className="px-4 py-3 font-semibold">처리</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {[...infoChangeRequests]
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .slice(0, 20)
                .map((req, i) => {
                  const changed = Object.entries(INFO_FIELD_LABELS).filter(
                    ([key]) => (req.currentValues?.[key] || "") !== (req.requestedValues?.[key] || "")
                  );
                  return (
                    <tr key={req.id} className="border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50">
                      <td className="px-4 py-3 text-ink">{i + 1}</td>
                      <td className="px-4 py-3 text-ink">{req.name}</td>
                      <td className="px-4 py-3 text-left text-xs text-ink">
                        {changed.length === 0
                          ? "-"
                          : changed.map(([key, label]) => (
                              <p key={key}>
                                {label}: {req.currentValues?.[key] || "-"} → {req.requestedValues?.[key] || "-"}
                              </p>
                            ))}
                      </td>
                      <td className="px-4 py-3 text-ink">{req.reason || "-"}</td>
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
                            <Button size="sm" onClick={() => approveInfoChangeRequest(req)}>
                              <Check size={13} /> 승인
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => rejectInfoChangeRequest(req)}>
                              <X size={13} /> 반려
                            </Button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" className="text-muted hover:text-danger" title="삭제" onClick={() => deleteInfoChangeRequest(req)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              {infoChangeRequests.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted">
                    기본정보 수정요청이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon={History} title={`변경이력 (${changeLogs.length}건)`} defaultCollapsed>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[720px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">변경구분</th>
                <th className="px-4 py-3 font-semibold">내용</th>
                <th className="px-4 py-3 font-semibold">처리상태</th>
                <th className="px-4 py-3 font-semibold">변경자</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {[...changeLogs]
                .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
                .slice(0, 20)
                .map((log, i) => (
                  <tr key={log.id} className="border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50">
                    <td className="px-4 py-3 text-ink">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{log.kind}</td>
                    <td className="px-4 py-3 text-ink">{log.detail}</td>
                    <td className="px-4 py-3">
                      <Badge tone="success">{log.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink">{log.createdByName}</td>
                    <td className="px-4 py-3">
                      <button type="button" className="text-muted hover:text-danger" title="삭제" onClick={() => deleteChangeLog(log)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              {changeLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted">
                    변경이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {pending.length > 0 && (
        <Panel
          icon={UserPlus}
          title={`가입 대기 중 (${pending.length}건)`}
          defaultCollapsed
          highlight={panelHasNew("panel_pendingEmployees", pending)}
          actions={
            panelHasNew("panel_pendingEmployees", pending) ? (
              <Button size="sm" variant="outline" onClick={() => ackPanel("panel_pendingEmployees")}>
                <Check size={13} /> 확인
              </Button>
            ) : null
          }
        >
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
                    <td className="px-4 py-3 text-ink"><span className="inline-flex items-center gap-1">{p.phone}<SmsButton phone={p.phone} /></span></td>
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
            {registerForm.phone ? (
              <Button
                as="a"
                href={buildSmsHref(registerForm.phone, buildInviteSmsMessage(issuedCode))}
                variant="outline"
                className="mt-3 w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <Send size={15} /> 가입코드 문자발송
              </Button>
            ) : (
              <p className="mt-3 text-[11px] text-muted">전화번호가 없어 문자로 바로 보낼 수 없습니다.</p>
            )}
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
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    이름 <span className="text-danger">*</span>
                  </span>
                  <input
                    id="field-name"
                    required
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="홍길동"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    전화번호 <span className="text-danger">*</span>
                  </span>
                  <input
                    id="field-phone"
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
                      <span className="mb-1.5 block text-xs font-medium text-muted">가입코드 (자동생성)</span>
                      <input
                        disabled
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-ink"
                        value={manualCode}
                      />
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
                  <BankAccountFields
                    bankName={registerForm.bankName}
                    bankAccount={registerForm.bankAccount}
                    onBankNameChange={(v) => setRegisterForm((f) => ({ ...f, bankName: v }))}
                    onBankAccountChange={(v) => setRegisterForm((f) => ({ ...f, bankAccount: v }))}
                    bankLabel="급여은행"
                    accountLabel="급여계좌"
                    fieldClassName="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                  />
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
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    센터 <span className="text-danger">*</span>
                  </span>
                  <select
                    id="field-workSiteId"
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
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    소속업체 <span className="text-danger">*</span>
                  </span>
                  <select
                    id="field-vendorId"
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
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    입사일자 <span className="text-danger">*</span>
                  </span>
                  <input
                    id="field-hireDate"
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
              {editingUid && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-xs text-muted">
                    현재 재직상태:{" "}
                    <span className={`font-semibold ${registerForm.employmentStatus === "퇴사" ? "text-danger" : "text-ink"}`}>
                      {registerForm.employmentStatus || "재직"}
                    </span>
                  </p>
                  {registerForm.employmentStatus === "퇴사" ? (
                    <Button type="button" variant="outline" size="sm" onClick={cancelResignation}>
                      퇴직처리 취소
                    </Button>
                  ) : (
                    <Button type="button" variant="danger" size="sm" onClick={processResignation}>
                      퇴직처리
                    </Button>
                  )}
                </div>
              )}
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
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    근무시작일 <span className="text-danger">*</span>
                  </span>
                  <input
                    id="field-workStartDate"
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
                      <span className="mb-1.5 block text-xs font-medium text-muted">
                        템플릿명 <span className="text-danger">*</span>
                      </span>
                      <select
                        id="field-shiftTemplateId"
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
                      <span className="mb-1.5 block text-xs font-medium text-muted">
                        템플릿명 <span className="text-danger">*</span>
                      </span>
                      <select
                        id="field-allowanceTemplateId"
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
                      <span className="mb-1.5 block text-xs font-medium text-muted">
                        계약서 템플릿 <span className="text-danger">*</span>
                      </span>
                      <select
                        id="field-contractTemplateId"
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
                    {!editingUid && (
                      <label className="col-span-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={registerForm.autoSendContract}
                          onChange={(e) => setRegisterForm((f) => ({ ...f, autoSendContract: e.target.checked }))}
                        />
                        <span>
                          <span className="font-medium text-ink">자동발송</span>
                          <span className="ml-1.5 text-[11px] text-muted">
                            체크하면 이 근로자가 모바일에 처음 로그인하는 즉시 회사 직인이 날인된 표준근로계약서가 자동으로 발송되어 바로 서명할 수 있습니다. 체크하지 않으면 계약관리에서 관리자가 직접 발송해야 합니다.
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                )}
                {regTab === "계약종료" && (
                  <div className="flex flex-nowrap items-end gap-2">
                    <label className="block flex-1">
                      <span className="mb-1.5 block text-xs font-medium text-muted">
                        사직서 템플릿 <span className="text-danger">*</span>
                      </span>
                      <input
                        id="field-resignTemplateId"
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
                    {editingUid && (
                      <Button type="button" variant="danger" onClick={sendResignationRequest} disabled={!registerForm.resignTemplateId}>
                        <Send size={14} /> 사직서 발송
                      </Button>
                    )}
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
                  <th className="px-3 py-2 font-semibold">양식</th>
                  <th className="px-3 py-2 font-semibold">선택</th>
                </tr>
              </thead>
              <tbody>
                {templatePickerResults.map((r, i) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 odd:bg-white even:bg-slate-50/50">
                    <td className="px-3 py-2 text-ink">{i + 1}</td>
                    <td className="px-3 py-2 text-ink">{r.templateName}</td>
                    <td className="px-3 py-2 text-ink">{r.visibility === "숨김" ? "미사용" : "사용"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline disabled:text-muted disabled:no-underline"
                        disabled={!r.reportFormat}
                        onClick={() => openReportPreview(r.docType, r.reportFormat, { siteName: siteName_(registerForm.workSiteId), ...(r.extra || {}) })}
                      >
                        양식
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className="text-xs text-primary hover:underline" onClick={() => applyTemplatePick(r)}>
                        선택
                      </button>
                    </td>
                  </tr>
                ))}
                {templatePickerResults.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted">
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
                            <td className="px-3 py-2 text-ink"><span className="inline-flex items-center gap-1">{e.phone}<SmsButton phone={e.phone} /></span></td>
                            <td className="px-3 py-2 text-ink">{vendorName_(e.vendorId)}</td>
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
