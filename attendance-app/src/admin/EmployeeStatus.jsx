import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { UserCog, Search, Download } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Panel from "../components/Panel";
import FilterDropdown from "../components/FilterDropdown";
import Pagination from "../components/Pagination";
import SortableTh from "../components/SortableTh";
import { usePagination } from "../hooks/usePagination";
import { downloadCsv } from "../utils/exportCsv";
import { EMPLOYMENT_STATUS_OPTIONS, NATIONALITY_OPTIONS, COUNTRY_OPTIONS } from "../constants/hr";
import { formatDate } from "../utils/dateUtils";
import SmsButton from "../components/SmsButton";

const STATUS_TONE = { 재직: "success", 휴직: "warning", 퇴사: "danger" };
const SEARCH_FIELD_OPTIONS = [
  { value: "name", label: "이름" },
  { value: "phone", label: "전화번호" },
];
const PERIOD_FIELD_OPTIONS = [
  { value: "hireDate", label: "입사일" },
  { value: "resignDate", label: "퇴사일" },
  { value: "lastWorkDate", label: "마지막근무일" },
];

const emptyDraft = () => ({
  entityIds: [],
  siteIds: [],
  vendorIds: [],
  nationalities: [],
  countries: [],
  searchField: "name",
  searchText: "",
  periodField: "hireDate",
  periodFrom: "",
  periodTo: "",
});

export default function EmployeeStatus() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [draft, setDraft] = useState(emptyDraft());
  const [applied, setApplied] = useState(emptyDraft());
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkDateField, setBulkDateField] = useState("resignDate");
  const [bulkDate, setBulkDate] = useState("");
  const [bulkReason, setBulkReason] = useState("");

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(
        query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")),
        (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (snap) =>
        setBusinessEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", profile.companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const entityName_ = (id) => businessEntities.find((b) => b.id === id)?.name || "-";
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";
  const vendorName_ = (id) => vendors.find((v) => v.id === id)?.name || "-";

  const [sort, setSort] = useState({ key: "hireDate", dir: "desc" });
  const STATUS_SORT_ACCESSORS = {
    name: (e) => e.name || "",
    entity: (e) => entityName_(e.businessEntityId),
    site: (e) => siteName_(e.workSiteId),
    vendor: (e) => vendorName_(e.vendorId),
    nationality: (e) => e.nationality || "내국인",
    hireDate: (e) => e.hireDate || "",
    resignDate: (e) => e.resignDate || "",
    employmentStatus: (e) => e.employmentStatus || "재직",
  };

  const filtered = useMemo(() => {
    const a = applied;
    const accessor = STATUS_SORT_ACCESSORS[sort.key] || ((e) => e.hireDate || "");
    const dir = sort.dir === "desc" ? -1 : 1;
    return employees
      .filter((e) => !a.entityIds.length || a.entityIds.includes(e.businessEntityId))
      .filter((e) => !a.siteIds.length || a.siteIds.includes(e.workSiteId))
      .filter((e) => !a.vendorIds.length || a.vendorIds.includes(e.vendorId))
      .filter((e) => !a.nationalities.length || a.nationalities.includes(e.nationality || "내국인"))
      .filter((e) => !a.countries.length || a.countries.includes(e.country))
      .filter((e) => {
        if (!a.searchText.trim()) return true;
        const v = (e[a.searchField] || "").toString().toLowerCase();
        return v.includes(a.searchText.trim().toLowerCase());
      })
      .filter((e) => !a.periodFrom || (e[a.periodField] && e[a.periodField] >= a.periodFrom))
      .filter((e) => !a.periodTo || (e[a.periodField] && e[a.periodField] <= a.periodTo))
      .sort((x, y) => {
        const av = accessor(x);
        const bv = accessor(y);
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      });
  }, [employees, applied, sort]);

  const { pageRows, page, pageCount, pageSize, total, setPage, changePageSize, PAGE_SIZE_OPTIONS } = usePagination(filtered, 10);

  const runSearch = () => setApplied(draft);
  const resetSearch = () => {
    setDraft(emptyDraft());
    setApplied(emptyDraft());
  };

  const exportExcel = () => {
    downloadCsv(
      "입퇴사현황",
      ["순번", "이름", "사업자", "센터", "소속업체", "전화번호", "마지막근무일", "입사일자", "퇴사일자", "변경사유"],
      filtered.map((e, i) => [
        i + 1,
        e.name || "",
        entityName_(e.businessEntityId),
        siteName_(e.workSiteId),
        vendorName_(e.vendorId),
        e.phone || "",
        e.lastWorkDate ? formatDate(e.lastWorkDate) : "",
        e.hireDate ? formatDate(e.hireDate) : "",
        e.resignDate ? formatDate(e.resignDate) : "",
        e.changeReason || "",
      ])
    );
  };

  const toggleSelect = (uid) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  const toggleSelectAll = () => setSelected((s) => (s.size === pageRows.length ? new Set() : new Set(pageRows.map((e) => e.id))));

  const applyBulk = async () => {
    if (selected.size === 0 || !bulkDate) return;
    if (!(await confirm(`선택된 ${selected.size}명에게 ${PERIOD_FIELD_OPTIONS.find((o) => o.value === bulkDateField)?.label}을(를) 적용하시겠습니까?`, "save"))) return;
    await Promise.all(
      [...selected].map((uid) =>
        updateDoc(doc(db, "users", uid), {
          [bulkDateField]: bulkDate,
          changeReason: bulkReason,
          ...(bulkDateField === "resignDate" ? { employmentStatus: "퇴사" } : {}),
        })
      )
    );
    toast.success("적용되었습니다");
    setSelected(new Set());
    setBulkDate("");
    setBulkReason("");
  };

  const openEdit = (emp) => {
    setEditing(emp);
    setEditForm({
      employmentStatus: emp.employmentStatus || "재직",
      hireDate: emp.hireDate || "",
      resignDate: emp.resignDate || "",
      lastWorkDate: emp.lastWorkDate || "",
      changeReason: emp.changeReason || "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!(await confirm("수정하시겠습니까?", "edit"))) return;
    await updateDoc(doc(db, "users", editing.id), {
      employmentStatus: editForm.employmentStatus,
      hireDate: editForm.hireDate || null,
      resignDate: editForm.resignDate || null,
      lastWorkDate: editForm.lastWorkDate || null,
      changeReason: editForm.changeReason || "",
    });
    toast.success("수정되었습니다");
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <Panel icon={UserCog} title="입퇴사현황">
        <div className="space-y-3">
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
            <FilterDropdown
              label="1선택 · 사업자"
              options={businessEntities.map((b) => ({ value: b.id, label: b.name }))}
              selected={draft.entityIds}
              onChange={(v) => setDraft((f) => ({ ...f, entityIds: v }))}
            />
            <FilterDropdown
              label="2선택 · 센터"
              options={workSites.map((s) => ({ value: s.id, label: s.name }))}
              selected={draft.siteIds}
              onChange={(v) => setDraft((f) => ({ ...f, siteIds: v }))}
            />
            <FilterDropdown
              label="3선택 · 소속업체"
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
              selected={draft.vendorIds}
              onChange={(v) => setDraft((f) => ({ ...f, vendorIds: v }))}
            />
            <FilterDropdown
              label="4선택 · 외/내국인"
              options={NATIONALITY_OPTIONS.map((n) => ({ value: n, label: n }))}
              selected={draft.nationalities}
              onChange={(v) => setDraft((f) => ({ ...f, nationalities: v }))}
            />
            <FilterDropdown
              label="5선택 · 국가구분"
              options={COUNTRY_OPTIONS.map((c) => ({ value: c, label: c }))}
              selected={draft.countries}
              onChange={(v) => setDraft((f) => ({ ...f, countries: v }))}
            />
          </div>

          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-1">
            <span className="shrink-0 text-xs font-medium text-muted">통합검색</span>
            <select
              className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={draft.searchField}
              onChange={(e) => setDraft((f) => ({ ...f, searchField: e.target.value }))}
            >
              {SEARCH_FIELD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="flex shrink-0 flex-nowrap overflow-hidden rounded-xl border border-slate-200">
              <input
                className="w-28 border-0 px-3 py-2 text-sm focus:outline-none"
                placeholder="검색어"
                value={draft.searchText}
                onChange={(e) => setDraft((f) => ({ ...f, searchText: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <button
                type="button"
                onClick={runSearch}
                className="flex items-center gap-1 border-l border-slate-200 bg-slate-50 px-2.5 text-xs text-muted hover:bg-slate-100"
              >
                <Search size={13} /> 조회
              </button>
            </div>

            <span className="ml-2 shrink-0 text-xs font-medium text-muted">기간구분</span>
            <select
              className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={draft.periodField}
              onChange={(e) => setDraft((f) => ({ ...f, periodField: e.target.value }))}
            >
              {PERIOD_FIELD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={draft.periodFrom}
              onChange={(e) => setDraft((f) => ({ ...f, periodFrom: e.target.value }))}
            />
            <span className="shrink-0 text-muted">~</span>
            <input
              type="date"
              className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={draft.periodTo}
              onChange={(e) => setDraft((f) => ({ ...f, periodTo: e.target.value }))}
            />
          </div>

          <div className="flex flex-nowrap items-center gap-2">
            <Button variant="outline" onClick={resetSearch}>
              초기화
            </Button>
            <Button variant="outline" onClick={exportExcel}>
              <Download size={16} /> 엑셀 다운로드
            </Button>
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-muted">목록 {total}건</p>

        <div className="mt-2 flex flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain rounded-xl bg-slate-50 p-3">
          <span className="shrink-0 text-xs font-medium text-muted">퇴사일지정</span>
          <select
            className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
            value={bulkDateField}
            onChange={(e) => setBulkDateField(e.target.value)}
          >
            {PERIOD_FIELD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
          />
          <input
            className="w-40 shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
            placeholder="변경사유"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
          />
          <Button size="sm" onClick={applyBulk} disabled={selected.size === 0 || !bulkDate}>
            적용
          </Button>
          <span className="shrink-0 text-xs text-muted">선택 {selected.size}명</span>
        </div>

        <div className="-mx-4 mt-3 overflow-x-auto overscroll-x-contain md:-mx-5">
          <table className="w-full min-w-[960px] text-center text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-muted">
                <th className="px-4 py-3 font-semibold">순번</th>
                <th className="px-3 py-3 font-semibold">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === pageRows.length} onChange={toggleSelectAll} />
                </th>
                <SortableTh sortKey="name" sort={sort} onSort={setSort}>이름</SortableTh>
                <SortableTh sortKey="entity" sort={sort} onSort={setSort}>사업자</SortableTh>
                <SortableTh sortKey="site" sort={sort} onSort={setSort}>센터</SortableTh>
                <SortableTh sortKey="vendor" sort={sort} onSort={setSort}>소속업체</SortableTh>
                <th className="px-4 py-3 font-semibold">전화번호</th>
                <th className="px-4 py-3 font-semibold">마지막근무일</th>
                <SortableTh sortKey="hireDate" sort={sort} onSort={setSort}>입사일자</SortableTh>
                <SortableTh sortKey="resignDate" sort={sort} onSort={setSort}>퇴사일자</SortableTh>
                <th className="px-4 py-3 font-semibold">변경사유</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((emp, i) => (
                <tr
                  key={emp.id}
                  className={`cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-100 ${
                    selected.has(emp.id) ? "bg-primary-light/60" : ""
                  }`}
                  onDoubleClick={() => openEdit(emp)}
                >
                  <td className="px-4 py-3 text-ink">{(page - 1) * pageSize + i + 1}</td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleSelect(emp.id)} />
                  </td>
                  <td className="px-4 py-3 text-ink">{emp.name}</td>
                  <td className="px-4 py-3 text-ink">{entityName_(emp.businessEntityId)}</td>
                  <td className="px-4 py-3 text-ink">{siteName_(emp.workSiteId)}</td>
                  <td className="px-4 py-3 text-ink">{vendorName_(emp.vendorId)}</td>
                  <td className="px-4 py-3 text-ink"><span className="inline-flex items-center gap-1">{emp.phone || "-"}<SmsButton phone={emp.phone} /></span></td>
                  <td className="px-4 py-3 text-ink">{emp.lastWorkDate ? formatDate(emp.lastWorkDate) : "-"}</td>
                  <td className="px-4 py-3 text-ink">{emp.hireDate ? formatDate(emp.hireDate) : "-"}</td>
                  <td className="px-4 py-3 text-ink">{emp.resignDate ? formatDate(emp.resignDate) : "-"}</td>
                  <td className="px-4 py-3 text-ink">{emp.changeReason || "-"}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-xs text-muted">
                    조회조건에 해당하는 데이터가 없습니다.
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

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`${editing?.name || ""} · 입퇴사정보 수정`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              취소
            </Button>
            <Button onClick={saveEdit}>저장</Button>
          </>
        }
      >
        {editForm && (
          <div className="space-y-3.5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">재직상태</span>
              <select
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={editForm.employmentStatus}
                onChange={(e) => setEditForm((f) => ({ ...f, employmentStatus: e.target.value }))}
              >
                {EMPLOYMENT_STATUS_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">입사일자</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={editForm.hireDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, hireDate: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">퇴사일자</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={editForm.resignDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, resignDate: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">마지막근무일</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                  value={editForm.lastWorkDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastWorkDate: e.target.value }))}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">변경사유</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
                value={editForm.changeReason}
                onChange={(e) => setEditForm((f) => ({ ...f, changeReason: e.target.value }))}
                placeholder="예: 계약만료, 개인사유 등"
              />
            </label>
            {editing && (
              <div className="pt-1">
                <Badge tone={STATUS_TONE[editForm.employmentStatus] || "warning"}>{editForm.employmentStatus}</Badge>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
