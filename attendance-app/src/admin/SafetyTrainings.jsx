import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { ShieldCheck, Printer, FileSpreadsheet } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import Button from "../components/Button";
import Panel from "../components/Panel";
import { downloadCsv } from "../utils/exportCsv";
import { toDateKey, addDays, formatTime, formatDate } from "../utils/dateUtils";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  SHIFT_TYPE_OPTIONS,
  NATIONALITY_OPTIONS,
  COUNTRY_OPTIONS,
} from "../constants/hr";

const EMPTY_FILTERS = {
  siteId: "",
  vendorId: "",
  shiftType: "",
  employmentType: "",
  employmentTypeKeyword: "",
  team: "",
  position: "",
  nationality: "",
  country: "",
  name: "",
  trainedYN: "",
};

export default function SafetyTrainings() {
  const { profile } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [range, setRange] = useState(() => ({ start: addDays(toDateKey(), -16), end: toDateKey() }));
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "departments"), where("companyId", "==", profile.companyId)), (snap) =>
        setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "positions"), where("companyId", "==", profile.companyId)), (snap) =>
        setPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(
        query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
        (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "attendance"),
        where("companyId", "==", profile.companyId),
        where("date", ">=", range.start),
        where("date", "<=", range.end)
      ),
      (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    );
    return () => unsub();
  }, [profile?.companyId, range.start, range.end]);

  const employeeByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const managedSiteIds = useMemo(
    () => new Set(workSites.filter((s) => s.safetyManaged).map((s) => s.id)),
    [workSites]
  );

  const rows = useMemo(() => {
    return records
      .filter((r) => r.status === "출근" && r.siteId && managedSiteIds.has(r.siteId))
      .map((r) => ({ record: r, emp: employeeByUid.get(r.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ emp }) => {
        if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
        if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
        if (filters.shiftType && emp.shiftType !== filters.shiftType) return false;
        if (filters.employmentType && emp.employmentType !== filters.employmentType) return false;
        if (filters.employmentTypeKeyword && !(emp.employmentType || "").includes(filters.employmentTypeKeyword)) return false;
        if (filters.team && emp.team !== filters.team) return false;
        if (filters.position && emp.position !== filters.position) return false;
        if (filters.nationality && emp.nationality !== filters.nationality) return false;
        if (filters.country && emp.country !== filters.country) return false;
        if (filters.name && !emp.name?.includes(filters.name)) return false;
        return true;
      })
      .filter(({ record }) => {
        if (filters.trainedYN === "Y") return Boolean(record.safetySignature);
        if (filters.trainedYN === "N") return !record.safetySignature;
        return true;
      })
      .sort((a, b) => (b.record.date || "").localeCompare(a.record.date || ""));
  }, [records, managedSiteIds, employeeByUid, filters]);

  const exportCsv = () => {
    const headers = ["일자", "이름", "사업자", "센터", "소속업체", "근무일자", "근무구분", "근무형태", "전화번호", "성별", "안전교육여부", "안전교육일시"];
    const rowsOut = rows.map(({ record: r, emp }) => [
      r.date,
      r.name,
      companyName,
      r.siteName || "-",
      vendors.find((v) => v.id === emp.vendorId)?.name || "-",
      r.date,
      emp.shiftType || "-",
      emp.employmentType || "-",
      emp.phone || "-",
      emp.gender || "-",
      r.safetySignature ? "Y" : "N",
      r.safetySignedAt ? formatTime(r.safetySignedAt) : "-",
    ]);
    downloadCsv(`안전교육현황_${range.start}~${range.end}`, headers, rowsOut);
  };

  return (
    <div className="space-y-6">
      <Panel icon={ShieldCheck} title="안전교육현황">
        <p className="mb-1 text-xs text-muted">사업장에서 실시한 근로자 안전 교육 현황을 확인 및 출력이 가능합니다.</p>
        <p className="mb-4 text-[11px] text-muted">
          사전에 등록되어 있어야 할 항목: 안전 &gt; 센터별안전교육(안전관리 여부 Y), 스케줄 &gt; 출근현황
        </p>

        <Card className="mb-4 space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">사업자 *</span>
              <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
                <option>{companyName || "-"}</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">센터 *</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
              <span className="mb-1.5 block text-xs font-medium text-muted">소속업체</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
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
              <span className="mb-1.5 block text-xs font-medium text-muted">근무구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.shiftType}
                onChange={(e) => setFilters((f) => ({ ...f, shiftType: e.target.value }))}
              >
                <option value="">전체</option>
                {SHIFT_TYPE_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무형태</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.employmentType}
                onChange={(e) => setFilters((f) => ({ ...f, employmentType: e.target.value }))}
              >
                <option value="">전체</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">근무형태키워드</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.employmentTypeKeyword}
                onChange={(e) => setFilters((f) => ({ ...f, employmentTypeKeyword: e.target.value }))}
                placeholder="근무형태키워드검색"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">부서</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.team}
                onChange={(e) => setFilters((f) => ({ ...f, team: e.target.value }))}
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
              <span className="mb-1.5 block text-xs font-medium text-muted">직급</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.position}
                onChange={(e) => setFilters((f) => ({ ...f, position: e.target.value }))}
              >
                <option value="">전체</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">외/내국인구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.nationality}
                onChange={(e) => setFilters((f) => ({ ...f, nationality: e.target.value }))}
              >
                <option value="">선택</option>
                {NATIONALITY_OPTIONS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">국가구분</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.country}
                onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
              >
                <option value="">전체</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">검색조건</span>
              <select disabled className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted">
                <option>이름</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">검색어</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.name}
                onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
                placeholder="검색어를 입력하세요."
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">안전교육여부</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={filters.trainedYN}
                onChange={(e) => setFilters((f) => ({ ...f, trainedYN: e.target.value }))}
              >
                <option value="">전체</option>
                <option value="Y">Y</option>
                <option value="N">N</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">
                안전교육일자 <span className="text-danger">*</span>
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={range.start}
                  onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
                />
                <span className="text-muted">~</span>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  value={range.end}
                  onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
                />
              </div>
            </label>
          </div>
        </Card>

        {managedSiteIds.size === 0 && (
          <Card className="mb-4 p-4 text-xs text-warning">
            안전관리가 적용된 근무지가 없습니다. 센터별 안전관리 메뉴에서 먼저 설정해주세요.
          </Card>
        )}

        <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain">
          <p className="text-xs font-medium text-muted">목록 {rows.length}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer size={13} /> 출력
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet size={13} /> 엑셀
            </Button>
          </div>
        </div>

        <div className="-mx-4 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[980px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-4 py-3 font-semibold">일자</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">사업자</th>
                <th className="px-4 py-3 font-semibold">센터</th>
                <th className="px-4 py-3 font-semibold">소속업체</th>
                <th className="px-4 py-3 font-semibold">근무일자</th>
                <th className="px-4 py-3 font-semibold">근무구분</th>
                <th className="px-4 py-3 font-semibold">근무형태</th>
                <th className="px-4 py-3 font-semibold">전화번호</th>
                <th className="px-4 py-3 font-semibold">성별</th>
                <th className="px-4 py-3 font-semibold">안전교육여부</th>
                <th className="px-4 py-3 font-semibold">안전교육일시</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ record: r, emp }, i) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(r.date)}</td>
                  <td className="px-4 py-3">
                    <button className="text-primary hover:underline" onClick={() => setViewing({ ...r, emp })}>
                      {r.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-muted">{companyName}</td>
                  <td className="px-4 py-3 text-muted">{r.siteName || "-"}</td>
                  <td className="px-4 py-3 text-muted">{vendors.find((v) => v.id === emp.vendorId)?.name || "-"}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(r.date)}</td>
                  <td className="px-4 py-3 text-muted">{emp.shiftType || "-"}</td>
                  <td className="px-4 py-3 text-muted">{emp.employmentType || "-"}</td>
                  <td className="px-4 py-3 text-muted">{emp.phone || "-"}</td>
                  <td className="px-4 py-3 text-muted">{emp.gender || "-"}</td>
                  <td className="px-4 py-3">
                    {r.safetySignature ? <Badge tone="success">Y</Badge> : <Badge tone="warning">N</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.safetySignedAt ? formatTime(r.safetySignedAt) : "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-6 text-center text-xs text-muted">
                    해당 조건에 안전관리 근무지 출근 기록이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-4 text-[11px] leading-relaxed text-muted">
          <p>안전교육 현황은 출근 현황 기준으로 나타나며 전체 서명 확인은 출력을 통해 쉽게 확인 할 수 있습니다.</p>
          <p>보기(이름) 선택 시 안전 서명이 없을 경우 사인이 가능하며, 계약서가 있을 경우 PDF 파일로 다운이 됩니다.</p>
          <p>관리자가 출/퇴근 기록을 직접 입력한 경우, 안전교육 서명은 보기를 클릭해 근로자에게 직접 서명을 받아야 합니다.</p>
        </div>
      </Panel>

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={`${viewing?.name} · ${viewing?.siteName || ""} 안전교육 서명`}
        footer={<Button onClick={() => setViewing(null)}>닫기</Button>}
      >
        {viewing && (
          <div className="space-y-4">
            {viewing.safetySignature ? (
              <>
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
                    <ShieldCheck size={13} /> 근로자 서명
                  </p>
                  <img
                    src={viewing.safetySignature}
                    alt="근로자 서명"
                    className="h-16 rounded-xl border border-slate-200 bg-white"
                  />
                  {viewing.safetySignedAt && (
                    <p className="mt-1 text-[11px] text-muted">{formatTime(viewing.safetySignedAt)} 서명</p>
                  )}
                </div>
                {viewing.supervisorSignature && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted">안전담당자 확인 ({viewing.supervisorName})</p>
                    <img
                      src={viewing.supervisorSignature}
                      alt="담당자 서명"
                      className="h-16 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted">아직 서명하지 않았습니다. 근로자가 앱에서 서명을 완료하면 이곳에 표시됩니다.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
