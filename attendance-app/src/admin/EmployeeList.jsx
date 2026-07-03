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
import { Plus, MapPin, Check, Copy, Trash2, UserPlus } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { POSITION_OPTIONS, EMPLOYMENT_STATUS_OPTIONS, TEAM_OPTIONS } from "../constants/hr";
import { generateInviteCode } from "../utils/ids";
import { toDateKey, formatDate } from "../utils/dateUtils";

const EMPTY_REGISTER_FORM = {
  name: "",
  phone: "",
  gender: "남",
  employeeCode: "",
  team: "",
  position: "",
  hireDate: toDateKey(),
  workSiteId: "",
  insuranceApplied: "Y",
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
  const [pending, setPending] = useState([]);

  const [siteModalOpen, setSiteModalOpen] = useState(false);
  const [siteForm, setSiteForm] = useState({ name: "", lat: "", lng: "", radiusM: 100 });

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState(EMPTY_REGISTER_FORM);
  const [issuedCode, setIssuedCode] = useState("");

  const [filters, setFilters] = useState({ siteId: "", status: "", search: "" });

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
    const unsubPending = onSnapshot(
      query(collection(db, "pendingEmployees"), where("companyId", "==", profile.companyId)),
      (snap) => setPending(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubUsers();
      unsubSites();
      unsubPending();
    };
  }, [profile?.companyId]);

  const siteName = (siteId) => workSites.find((s) => s.id === siteId)?.name || "미배정";

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
      if (filters.status && (emp.employmentStatus || "재직") !== filters.status) return false;
      if (filters.search && !`${emp.name}${emp.phone}`.includes(filters.search)) return false;
      return true;
    });
  }, [employees, filters]);

  const approve = (uid) => updateDoc(doc(db, "users", uid), { approved: true });
  const assignSite = (uid, workSiteId) => updateDoc(doc(db, "users", uid), { workSiteId: workSiteId || null });
  const updateField = (uid, field, value) => updateDoc(doc(db, "users", uid), { [field]: value });

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

  const closeRegisterModal = () => {
    setRegisterOpen(false);
    setIssuedCode("");
    setRegisterForm(EMPTY_REGISTER_FORM);
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    const code = generateInviteCode(8);
    await setDoc(doc(db, "pendingEmployees", code), {
      companyId: profile.companyId,
      ...registerForm,
      employmentStatus: "재직",
      createdAt: serverTimestamp(),
    });
    setIssuedCode(code);
  };

  const removePending = (code) => deleteDoc(doc(db, "pendingEmployees", code));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-ink">근로자 등록</h1>
          <p className="text-sm text-muted">전체 {employees.length}명 · 가입 대기 {pending.length}명</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSiteModalOpen(true)}>
            <MapPin size={16} /> 근무지 추가
          </Button>
          <Button onClick={() => setRegisterOpen(true)}>
            <UserPlus size={16} /> 신규 근로자 등록
          </Button>
        </div>
      </div>

      {workSites.length === 0 && (
        <Card className="p-4 text-xs text-warning">
          아직 등록된 근무지가 없습니다. 근무지를 먼저 추가해야 직원에게 배정하고 자동출근을 사용할 수 있습니다.
        </Card>
      )}

      <Card className="flex flex-wrap items-end gap-3 p-4">
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

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-muted">
              <th className="px-4 py-3 font-medium">이름</th>
              <th className="px-4 py-3 font-medium">연락처</th>
              <th className="px-4 py-3 font-medium">성별</th>
              <th className="px-4 py-3 font-medium">부서</th>
              <th className="px-4 py-3 font-medium">직급</th>
              <th className="px-4 py-3 font-medium">재직상태</th>
              <th className="px-4 py-3 font-medium">근무지</th>
              <th className="px-4 py-3 font-medium">입사일</th>
              <th className="px-4 py-3 font-medium">승인</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((emp) => (
              <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-ink">{emp.name}</td>
                <td className="px-4 py-3 text-muted">{emp.phone}</td>
                <td className="px-4 py-3 text-muted">{emp.gender || "-"}</td>
                <td className="px-4 py-3">
                  <select
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={emp.team || ""}
                    onChange={(e) => updateField(emp.id, "team", e.target.value)}
                  >
                    <option value="">-</option>
                    {TEAM_OPTIONS.map((t) => (
                      <option key={t}>{t}</option>
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
                    {POSITION_OPTIONS.map((p) => (
                      <option key={p}>{p}</option>
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
                <td colSpan={9} className="px-4 py-6 text-center text-xs text-muted">
                  조회조건에 해당하는 근로자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {pending.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-ink">
            가입 대기 중 (아직 앱에서 가입코드 입력 전)
          </div>
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
        </Card>
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
              아래 가입코드를 근로자에게 전달해주세요. 근로자가 앱 설치 후 이 코드로 로그인 정보(이메일/비밀번호)만 설정하면 바로 사용할 수 있습니다.
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
                  onChange={(e) => setRegisterForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="010-0000-0000"
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
            </div>

            <SectionHeader>입/퇴사정보</SectionHeader>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={registerForm.team}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, team: e.target.value }))}
                >
                  <option value="">선택</option>
                  {TEAM_OPTIONS.map((t) => (
                    <option key={t}>{t}</option>
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
                  {POSITION_OPTIONS.map((p) => (
                    <option key={p}>{p}</option>
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
                <span className="mb-1.5 block text-xs font-medium text-muted">근무지 배정</span>
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
    </div>
  );
}
