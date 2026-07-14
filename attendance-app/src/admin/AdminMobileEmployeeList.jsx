import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { Search, Phone, ChevronRight, Monitor, CalendarDays, UserPlus, Copy, Send } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import Button from "../components/Button";
import SmsButton, { buildSmsHref } from "../components/SmsButton";
import { formatPhoneNumber } from "../utils/phoneAuth";
import { toDateKey, toMonthKey } from "../utils/dateUtils";
import { generateInviteCode } from "../utils/ids";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  PAY_TYPE_OPTIONS,
  TRANSPORT_MODE_OPTIONS,
  TEAM_OPTIONS,
  POSITION_OPTIONS,
  NATIONALITY_OPTIONS,
} from "../constants/hr";

const STATUS_TABS = ["전체", "재직", "휴직", "퇴사"];
const STATUS_TONE = { 재직: "primary", 휴직: "muted", 퇴사: "danger" };

const EMPTY_REG_FORM = {
  name: "",
  phone: "",
  gender: "남",
  nationality: "내국인",
  vendorId: "",
  workSiteId: "",
  hireDate: toDateKey(),
  workStartDate: toDateKey(),
  employmentType: "상용직",
  shiftType: "주간",
  payType: "월급",
  transportMode: "",
  team: "",
  position: "",
  careerYears: "",
  shiftTemplateId: "",
  allowanceTemplateId: "",
  contractTemplateId: "",
  contractTemplateName: "",
  resignTemplateId: "",
  resignTemplateName: "",
  insuranceApplied: "Y",
  active: "Y",
};

// 입사일부터 오늘까지의 근속기간을 "n년 n개월"로 표시한다.
function tenureLabel(hireDate) {
  if (!hireDate) return "-";
  const start = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "-";
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return "1개월 미만";
  return years > 0 ? `${years}년 ${months}개월` : `${months}개월`;
}

// 근로자 목록의 모바일 전용 화면 — PC의 넓은 표 대신, 이동 중에도 바로
// 검색해 연락하거나 재직상태만 빠르게 바꿀 수 있는 카드 목록으로 새로
// 구성했다. 신규 등록/템플릿 일괄적용/변경이력 등 상세 관리 기능은 PC
// 화면에서 계속 사용할 수 있다.
export default function AdminMobileEmployeeList() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [allowanceTemplates, setAllowanceTemplates] = useState([]);
  const [centerReports, setCenterReports] = useState([]);
  const [pending, setPending] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("전체");
  const [viewing, setViewing] = useState(null);
  const [viewingAttendance, setViewingAttendance] = useState([]);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regForm, setRegForm] = useState(EMPTY_REG_FORM);
  const [issuedCode, setIssuedCode] = useState("");
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (snap) =>
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (snap) =>
        setBusinessEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "shiftTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
        setShiftTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "allowanceTemplates"), where("companyId", "==", profile.companyId)), (snap) =>
        setAllowanceTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "centerReports"), where("companyId", "==", profile.companyId)), (snap) =>
        setCenterReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "pendingEmployees"), where("companyId", "==", profile.companyId)), (snap) =>
        setPending(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
  }, [profile?.companyId]);

  const contractReportOptions = useMemo(() => centerReports.filter((r) => r.docType === "계약서"), [centerReports]);
  const resignReportOptions = useMemo(() => centerReports.filter((r) => r.docType === "사직서"), [centerReports]);

  const openRegister = () => {
    const defaultEntity = businessEntities.find((b) => b.name === companyName);
    setRegForm({ ...EMPTY_REG_FORM, businessEntityId: defaultEntity?.id || "" });
    setIssuedCode("");
    setRegisterOpen(true);
  };

  const REQUIRED_REG_FIELDS = [
    { key: "name", label: "이름" },
    { key: "phone", label: "전화번호" },
    { key: "vendorId", label: "소속업체" },
    { key: "workSiteId", label: "센터" },
    { key: "hireDate", label: "입사일자" },
    { key: "workStartDate", label: "근무시작일" },
    { key: "shiftTemplateId", label: "시간템플릿" },
    { key: "allowanceTemplateId", label: "수당템플릿" },
    { key: "contractTemplateId", label: "계약서템플릿" },
    { key: "resignTemplateId", label: "사직서템플릿" },
  ];

  const submitRegister = async () => {
    const missing = REQUIRED_REG_FIELDS.find((f) => !regForm[f.key]);
    if (missing) {
      toast.error(`[${missing.label}] 항목을 입력/선택해주세요.`);
      return;
    }
    setRegistering(true);
    try {
      const inviteCode = generateInviteCode(7);
      const seq = String(employees.length + pending.length + 1).padStart(4, "0");
      await setDoc(doc(db, "pendingEmployees", inviteCode), {
        companyId: profile.companyId,
        ...regForm,
        employeeCode: `EMP${new Date().getFullYear()}${seq}`,
        photoUrl: "",
        employmentStatus: "재직",
        createdAt: serverTimestamp(),
      });
      setIssuedCode(inviteCode);
      toast.success("근로자가 등록되었습니다");
    } catch (err) {
      toast.error(`등록에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setRegistering(false);
    }
  };

  useEffect(() => {
    if (!viewing?.id || !profile?.companyId) {
      setViewingAttendance([]);
      return;
    }
    const month = toMonthKey();
    const unsub = onSnapshot(
      query(
        collection(db, "attendance"),
        where("companyId", "==", profile.companyId),
        where("uid", "==", viewing.id),
        where("date", ">=", `${month}-01`),
        where("date", "<=", `${month}-31`)
      ),
      (snap) => setViewingAttendance(snap.docs.map((d) => d.data()))
    );
    return () => unsub();
  }, [viewing?.id, profile?.companyId]);

  const viewingMonthlyStats = useMemo(() => {
    const out = { 출근: 0, 지각: 0, 결근: 0, 조퇴: 0 };
    viewingAttendance.forEach((r) => {
      if (out[r.status] !== undefined) out[r.status] += 1;
    });
    return out;
  }, [viewingAttendance]);

  const siteName = (id) => workSites.find((s) => s.id === id)?.name || "";

  const filtered = useMemo(() => {
    const kw = search.trim();
    return employees
      .filter((e) => statusTab === "전체" || (e.employmentStatus || "재직") === statusTab)
      .filter((e) => !kw || e.name?.includes(kw) || e.phone?.includes(kw))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [employees, search, statusTab]);

  const counts = useMemo(() => {
    const out = { 전체: employees.length, 재직: 0, 휴직: 0, 퇴사: 0 };
    employees.forEach((e) => { out[e.employmentStatus || "재직"] = (out[e.employmentStatus || "재직"] || 0) + 1; });
    return out;
  }, [employees]);

  // 상태 탭(재직/휴직/퇴사)을 누르면 해당 상태의 근로자를 센터별로 몇 명씩
  // 있는지 한눈에 보여준다 — 여러 센터를 관리하는 관리자가 "재직자가 몇 명이고
  // 어느 센터에 몰려있는지"를 목록을 일일이 스크롤하지 않고 바로 파악하도록.
  const siteBreakdown = useMemo(() => {
    if (statusTab === "전체") return [];
    const counter = new Map();
    employees
      .filter((e) => (e.employmentStatus || "재직") === statusTab)
      .forEach((e) => {
        const label = siteName(e.workSiteId) || "미배정";
        counter.set(label, (counter.get(label) || 0) + 1);
      });
    return [...counter.entries()].sort((a, b) => b[1] - a[1]);
  }, [employees, statusTab, workSites]);

  const changeStatus = async (emp, status) => {
    if (!(await confirm(`${emp.name}님의 재직상태를 '${status}'(으)로 변경하시겠습니까?`, "save"))) return;
    try {
      await updateDoc(doc(db, "users", emp.id), { employmentStatus: status });
      toast.success("변경되었습니다");
      setViewing((v) => (v ? { ...v, employmentStatus: status } : v));
    } catch (err) {
      toast.error(`변경에 실패했습니다: ${err.code || err.message}`);
    }
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">근로자 ({counts.전체}명)</p>
          <p className="mt-0.5 text-xs text-muted">검색하거나 상태를 눌러 빠르게 확인하세요</p>
        </div>
        <Button size="sm" onClick={openRegister}>
          <UserPlus size={14} /> 등록
        </Button>
      </div>

      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 또는 연락처 검색"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
        />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusTab(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              statusTab === s ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"
            }`}
          >
            {s} {counts[s] || 0}
          </button>
        ))}
      </div>

      {siteBreakdown.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="mb-2 text-[11px] font-semibold text-muted">센터별 {statusTab} 현황</p>
          <div className="flex flex-wrap gap-1.5">
            {siteBreakdown.map(([label, n]) => (
              <span key={label} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink shadow-sm">
                {label} <span className="font-bold text-primary">{n}명</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">해당하는 근로자가 없습니다.</div>
        )}
        {filtered.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setViewing(e)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary">
              {e.name?.[0] || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{e.name}</span>
                <Badge tone={STATUS_TONE[e.employmentStatus || "재직"]}>{e.employmentStatus || "재직"}</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {[e.team, e.position].filter(Boolean).join(" · ") || "부서/직급 미지정"}
                {siteName(e.workSiteId) && ` · ${siteName(e.workSiteId)}`}
              </p>
            </div>
            {e.phone && (
              <div className="flex shrink-0 items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                <a href={`tel:${e.phone}`} className="rounded-lg p-1.5 text-primary hover:bg-primary-light">
                  <Phone size={15} />
                </a>
                <SmsButton phone={e.phone} />
              </div>
            )}
            <ChevronRight size={16} className="shrink-0 text-slate-300" />
          </button>
        ))}
      </div>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="근로자 상세">
        {viewing && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-light text-lg font-bold text-primary">
                {viewing.name?.[0] || "?"}
              </div>
              <div>
                <p className="text-base font-bold text-ink">{viewing.name}</p>
                <p className="text-xs text-muted">{[viewing.team, viewing.position].filter(Boolean).join(" · ") || "-"}</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                <span className="text-xs text-muted">연락처</span>
                <span className="flex items-center gap-1.5 text-ink">
                  {viewing.phone ? formatPhoneNumber(viewing.phone) : "-"}
                  {viewing.phone && (
                    <>
                      <a href={`tel:${viewing.phone}`} className="text-primary"><Phone size={13} /></a>
                      <SmsButton phone={viewing.phone} />
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                <span className="text-xs text-muted">근무지</span>
                <span className="text-ink">{siteName(viewing.workSiteId) || "-"}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
                <span className="text-xs text-muted">입사일</span>
                <span className="text-ink">{viewing.hireDate || "-"}</span>
              </div>
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-xs text-muted">근속연수</span>
                <span className="text-ink">{tenureLabel(viewing.hireDate)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 p-3.5">
              <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <CalendarDays size={13} className="text-primary" /> 이번 달 근태정보 ({toMonthKey()})
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[11px] text-muted">출근</p>
                  <p className="mt-0.5 text-sm font-bold text-ink">{viewingMonthlyStats.출근}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">지각</p>
                  <p className="mt-0.5 text-sm font-bold text-warning">{viewingMonthlyStats.지각}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">결근</p>
                  <p className="mt-0.5 text-sm font-bold text-danger">{viewingMonthlyStats.결근}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted">조퇴</p>
                  <p className="mt-0.5 text-sm font-bold text-warning">{viewingMonthlyStats.조퇴}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">재직상태 변경</p>
              <div className="flex gap-2">
                {["재직", "휴직", "퇴사"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => changeStatus(viewing, s)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                      (viewing.employmentStatus || "재직") === s ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-muted">
              <Monitor size={14} className="shrink-0" />
              상세 정보 수정·변경이력은 PC 화면에서 이용해주세요.
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title={issuedCode ? "가입코드 발급 완료" : "근로자등록"}
        footer={
          issuedCode ? (
            <Button className="w-full" onClick={() => setRegisterOpen(false)}>
              닫기
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setRegisterOpen(false)}>
                취소
              </Button>
              <Button onClick={submitRegister} disabled={registering}>
                {registering ? "등록 중..." : "근로자등록"}
              </Button>
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
              <button className="text-primary" onClick={() => navigator.clipboard?.writeText(issuedCode)} title="복사">
                <Copy size={18} />
              </button>
            </div>
            {regForm.phone ? (
              <a
                href={buildSmsHref(regForm.phone, `[KP-work] ${companyName || "회사"} 가입 안내\n아래 가입코드로 모바일 앱에서 가입해주세요.\n가입코드: ${issuedCode}\n앱: ${window.location.origin}`)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-ink"
              >
                <Send size={15} /> 가입코드 문자발송
              </a>
            ) : (
              <p className="mt-3 text-[11px] text-muted">전화번호가 없어 문자로 바로 보낼 수 없습니다.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">이름 *</span>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.name} onChange={(e) => setRegForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">전화번호 *</span>
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.phone} onChange={(e) => setRegForm((f) => ({ ...f, phone: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">성별</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.gender} onChange={(e) => setRegForm((f) => ({ ...f, gender: e.target.value }))}>
                  <option value="남">남</option>
                  <option value="여">여</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">국적구분</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.nationality} onChange={(e) => setRegForm((f) => ({ ...f, nationality: e.target.value }))}>
                  {NATIONALITY_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">소속업체 *</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.vendorId} onChange={(e) => setRegForm((f) => ({ ...f, vendorId: e.target.value }))}>
                  <option value="">선택</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">센터 *</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={regForm.workSiteId}
                  onChange={(e) => setRegForm((f) => ({ ...f, workSiteId: e.target.value }))}
                >
                  <option value="">선택</option>
                  {workSites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">입사일자 *</span>
                <input type="date" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.hireDate} onChange={(e) => setRegForm((f) => ({ ...f, hireDate: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">근무시작일 *</span>
                <input type="date" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.workStartDate} onChange={(e) => setRegForm((f) => ({ ...f, workStartDate: e.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">경력인정연수</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={regForm.careerYears}
                  onChange={(e) => setRegForm((f) => ({ ...f, careerYears: e.target.value }))}
                  placeholder="경력직 인정연차"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">고용구분</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.employmentType} onChange={(e) => setRegForm((f) => ({ ...f, employmentType: e.target.value }))}>
                  {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">근무구분</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.shiftType} onChange={(e) => setRegForm((f) => ({ ...f, shiftType: e.target.value }))}>
                  {SHIFT_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">지급구분</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.payType} onChange={(e) => setRegForm((f) => ({ ...f, payType: e.target.value }))}>
                  {PAY_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">이동수단</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.transportMode} onChange={(e) => setRegForm((f) => ({ ...f, transportMode: e.target.value }))}>
                  <option value="">선택</option>
                  {TRANSPORT_MODE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">팀</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.team} onChange={(e) => setRegForm((f) => ({ ...f, team: e.target.value }))}>
                  <option value="">선택</option>
                  {TEAM_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">직급</span>
                <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={regForm.position} onChange={(e) => setRegForm((f) => ({ ...f, position: e.target.value }))}>
                  <option value="">선택</option>
                  {POSITION_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-semibold text-ink">템플릿 (필수)</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">시간템플릿 *</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={regForm.shiftTemplateId}
                    onChange={(e) => setRegForm((f) => ({ ...f, shiftTemplateId: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {shiftTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">수당템플릿 *</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={regForm.allowanceTemplateId}
                    onChange={(e) => setRegForm((f) => ({ ...f, allowanceTemplateId: e.target.value }))}
                  >
                    <option value="">선택</option>
                    {allowanceTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">계약서템플릿 *</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={regForm.contractTemplateId}
                    onChange={(e) => {
                      const report = contractReportOptions.find((r) => r.id === e.target.value);
                      setRegForm((f) => ({ ...f, contractTemplateId: e.target.value, contractTemplateName: report?.templateName || "" }));
                    }}
                  >
                    <option value="">선택</option>
                    {contractReportOptions.map((r) => (
                      <option key={r.id} value={r.id}>{r.templateName}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">사직서템플릿 *</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={regForm.resignTemplateId}
                    onChange={(e) => {
                      const report = resignReportOptions.find((r) => r.id === e.target.value);
                      setRegForm((f) => ({ ...f, resignTemplateId: e.target.value, resignTemplateName: report?.templateName || "" }));
                    }}
                  >
                    <option value="">선택</option>
                    {resignReportOptions.map((r) => (
                      <option key={r.id} value={r.id}>{r.templateName}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-[11px] text-muted">템플릿이 목록에 없다면 PC의 템플릿 메뉴에서 먼저 등록해주세요.</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
