import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Users2, RefreshCw, FileSpreadsheet, UserPlus, UserMinus } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Button from "../components/Button";
import Panel from "../components/Panel";
import Modal from "../components/Modal";
import { downloadCsv } from "../utils/exportCsv";
import { formatDate, toDateKey } from "../utils/dateUtils";
import { EMPLOYMENT_TYPE_OPTIONS, SHIFT_TYPE_OPTIONS, NATIONALITY_OPTIONS, COUNTRY_OPTIONS } from "../constants/hr";
import SmsButton from "../components/SmsButton";

const EMPTY_FILTERS = { siteId: "", vendorId: "", shiftType: "", employmentType: "", team: "", position: "", nationality: "", country: "", name: "", phone: "" };

export default function LeaveManagement() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [criteria, setCriteria] = useState({ start: "2025-01-01", end: toDateKey() });
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerFilters, setRegisterFilters] = useState(EMPTY_FILTERS);
  const [checked, setChecked] = useState(() => new Set());

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (s) => setVendors(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const matchesFilters = (emp, f) => {
    if (f.siteId && emp.workSiteId !== f.siteId) return false;
    if (f.vendorId && emp.vendorId !== f.vendorId) return false;
    if (f.shiftType && emp.shiftType !== f.shiftType) return false;
    if (f.employmentType && emp.employmentType !== f.employmentType) return false;
    if (f.team && emp.team !== f.team) return false;
    if (f.position && emp.position !== f.position) return false;
    if (f.nationality && emp.nationality !== f.nationality) return false;
    if (f.country && emp.country !== f.country) return false;
    if (f.name && !emp.name?.includes(f.name)) return false;
    if (f.phone && !emp.phone?.includes(f.phone)) return false;
    return true;
  };

  const eligibleRows = useMemo(
    () => employees.filter((e) => e.leaveEligible && matchesFilters(e, filters)),
    [employees, filters]
  );

  const usageFor = (uid) => {
    const list = leaves.filter((l) => l.uid === uid && l.startDate >= criteria.start && l.startDate <= criteria.end);
    const generated = 2; // placeholder accrual until full template-driven accrual engine
    const used = list.reduce((sum, l) => sum + (l.days || 1), 0);
    return { generated, used, remaining: Math.max(generated - used, 0) };
  };

  const registerCandidates = useMemo(() => employees.filter((e) => !e.leaveEligible && matchesFilters(e, registerFilters)), [employees, registerFilters]);

  const toggleChecked = (id) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const registerTargets = async () => {
    for (const id of checked) await updateDoc(doc(db, "users", id), { leaveEligible: true });
    setChecked(new Set());
    setRegisterOpen(false);
  };

  const cancelTargets = async () => {
    for (const id of checked) await updateDoc(doc(db, "users", id), { leaveEligible: false });
    setChecked(new Set());
  };

  const exportCsv = () => {
    const headers = ["이름", "사업자", "센터", "근무시작일자", "휴가발생일수", "휴가사용일수", "휴가잔여일수"];
    downloadCsv("근로자휴가관리", headers, eligibleRows.map((e) => {
      const u = usageFor(e.id);
      return [e.name, vendorName_(e.vendorId), siteName_(e.workSiteId), e.hireDate ? formatDate(e.hireDate) : "-", u.generated, u.used, u.remaining];
    }));
  };

  return (
    <div className="space-y-6">
      <Panel icon={Users2} title="근로자휴가관리">
        <p className="mb-4 text-xs text-muted">근로자 휴가 현황 요약은 휴가 대상자 등록이 되어진 사람들 한에서만 나타납니다. 근무자의 휴가 시작일 기준은 근무자등록에 근무시작일로 되어집니다. 근무 조회 시작일자 부터 조회기준 일자 기준으로 휴가 생성 및 사용 한 휴가 일수가 나타납니다. 휴가 템플릿,휴가유형,센터별 휴가 설정이 필수입니다.</p>

        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터 *</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.siteId} onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value }))}>
                <option value="">전체</option>
                {workSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.vendorId} onChange={(e) => setFilters((f) => ({ ...f, vendorId: e.target.value }))}>
                <option value="">전체</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.shiftType} onChange={(e) => setFilters((f) => ({ ...f, shiftType: e.target.value }))}>
                <option value="">전체</option>
                {SHIFT_TYPE_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.name} onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">조회시작일자 *</span>
              <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={criteria.start} onChange={(e) => setCriteria((c) => ({ ...c, start: e.target.value }))} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">조회기준일자 *</span>
              <input type="date" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={criteria.end} onChange={(e) => setCriteria((c) => ({ ...c, end: e.target.value }))} />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" className="rounded-xl border border-slate-200 p-2.5 text-muted hover:bg-slate-50" onClick={() => setFilters(EMPTY_FILTERS)}>
              <RefreshCw size={16} />
            </button>
            <Button>검색</Button>
          </div>
        </Card>

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">근로자 휴가 현황 요약 {eligibleRows.length}</p>
          <div className="flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain">
            <Button size="sm" onClick={() => setRegisterOpen(true)}>
              <UserPlus size={13} /> 휴가 대상자 등록
            </Button>
            <Button size="sm" variant="outline" onClick={cancelTargets} disabled={checked.size === 0}>
              <UserMinus size={13} /> 휴가 대상자 취소
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet size={13} /> 엑셀
            </Button>
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[860px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold"></th>
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">사업자</th>
                <th className="px-4 py-3 font-semibold">센터</th>
                <th className="px-4 py-3 font-semibold">근무시작일자</th>
                <th className="px-4 py-3 font-semibold">휴가발생일수</th>
                <th className="px-4 py-3 font-semibold">휴가사용일수</th>
                <th className="px-4 py-3 font-semibold">휴가잔여일수</th>
              </tr>
            </thead>
            <tbody>
              {eligibleRows.map((e, i) => {
                const u = usageFor(e.id);
                return (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={checked.has(e.id)} onChange={() => toggleChecked(e.id)} />
                    </td>
                    <td className="px-4 py-3 text-ink">{i + 1}</td>
                    <td className="px-4 py-3 text-ink">{e.name}</td>
                    <td className="px-4 py-3 text-ink">{vendorName_(e.vendorId)}</td>
                    <td className="px-4 py-3 text-ink">{siteName_(e.workSiteId)}</td>
                    <td className="px-4 py-3 text-ink">{e.hireDate ? formatDate(e.hireDate) : "-"}</td>
                    <td className="px-4 py-3 text-ink">{u.generated}</td>
                    <td className="px-4 py-3 text-ink">{u.used}</td>
                    <td className="px-4 py-3 text-ink">{u.remaining}</td>
                  </tr>
                );
              })}
              {eligibleRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-xs text-muted">
                    휴가 대상자로 등록된 근로자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)} title="휴가 대상자 등록" size="lg" footer={<><Button variant="outline" onClick={() => setRegisterOpen(false)}>취소</Button><Button onClick={registerTargets} disabled={checked.size === 0}>등록</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={registerFilters.siteId} onChange={(e) => setRegisterFilters((f) => ({ ...f, siteId: e.target.value }))}>
                <option value="">전체</option>
                {workSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
              <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={registerFilters.employmentType} onChange={(e) => setRegisterFilters((f) => ({ ...f, employmentType: e.target.value }))}>
                <option value="">전체</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">이름</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={registerFilters.name} onChange={(e) => setRegisterFilters((f) => ({ ...f, name: e.target.value }))} />
            </label>
          </div>
          <p className="text-xs font-medium text-muted">휴가 대상자 목록 {registerCandidates.length}</p>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
            <table className="w-full text-center text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-100 text-xs text-muted">
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2 font-semibold">이름</th>
                  <th className="px-3 py-2 font-semibold">전화번호</th>
                  <th className="px-3 py-2 font-semibold">센터</th>
                  <th className="px-3 py-2 font-semibold">소속업체</th>
                  <th className="px-3 py-2 font-semibold">근무구분</th>
                  <th className="px-3 py-2 font-semibold">근무형태</th>
                </tr>
              </thead>
              <tbody>
                {registerCandidates.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={checked.has(e.id)} onChange={() => toggleChecked(e.id)} />
                    </td>
                    <td className="px-3 py-2 text-ink">{e.name}</td>
                    <td className="px-3 py-2 text-ink"><span className="inline-flex items-center gap-1">{e.phone || "-"}<SmsButton phone={e.phone} /></span></td>
                    <td className="px-3 py-2 text-ink">{siteName_(e.workSiteId)}</td>
                    <td className="px-3 py-2 text-ink">{vendorName_(e.vendorId)}</td>
                    <td className="px-3 py-2 text-ink">{e.shiftType || "-"}</td>
                    <td className="px-3 py-2 text-ink">{e.employmentType || "-"}</td>
                  </tr>
                ))}
                {registerCandidates.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-xs text-muted">
                      등록 가능한 근로자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">휴가대상자를 선택하고 일괄 등록 및 취소할 수 있습니다.</p>
        </div>
      </Modal>
    </div>
  );
}
