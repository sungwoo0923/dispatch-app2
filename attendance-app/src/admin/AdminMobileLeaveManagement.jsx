import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Search, UserPlus, UserMinus } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Modal from "../components/Modal";
import Button from "../components/Button";
import { formatDate, toDateKey } from "../utils/dateUtils";

// 근로자휴가관리의 모바일 전용 화면 — 휴가 대상자로 등록된 근로자의
// 발생/사용/잔여 일수를 카드로 보여주고, 대상자 등록/취소는 별도
// 전체화면 시트에서 검색-선택-일괄처리하는 흐름으로 재구성했다.
export default function AdminMobileLeaveManagement() {
  const { profile } = useAuth();
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [search, setSearch] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerSearch, setRegisterSearch] = useState("");
  const [checked, setChecked] = useState(() => new Set());
  const criteria = { start: "2025-01-01", end: toDateKey() };

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const usageFor = (uid) => {
    const list = leaves.filter((l) => l.uid === uid && l.startDate >= criteria.start && l.startDate <= criteria.end);
    const generated = 2; // placeholder accrual until full template-driven accrual engine
    const used = list.reduce((sum, l) => sum + (l.days || 1), 0);
    return { generated, used, remaining: Math.max(generated - used, 0) };
  };

  const eligibleRows = useMemo(
    () => employees.filter((e) => e.leaveEligible && (!search.trim() || e.name?.includes(search.trim()))),
    [employees, search]
  );

  const registerCandidates = useMemo(
    () => employees.filter((e) => !e.leaveEligible && (!registerSearch.trim() || e.name?.includes(registerSearch.trim()) || e.phone?.includes(registerSearch.trim()))).slice(0, 30),
    [employees, registerSearch]
  );

  const toggleChecked = (id) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const registerTargets = async () => {
    for (const id of checked) await updateDoc(doc(db, "users", id), { leaveEligible: true });
    toast.success(`${checked.size}명이 휴가 대상자로 등록되었습니다`);
    setChecked(new Set());
    setRegisterOpen(false);
  };

  const cancelTarget = async (emp) => {
    await updateDoc(doc(db, "users", emp.id), { leaveEligible: false });
    toast.success(`${emp.name}님이 휴가 대상자에서 제외되었습니다`);
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">휴가대상자 ({eligibleRows.length}명)</p>
          <p className="mt-0.5 text-xs text-muted">대상자로 등록된 근로자의 휴가 현황입니다</p>
        </div>
        <Button size="sm" onClick={() => { setRegisterOpen(true); setChecked(new Set()); }}>
          <UserPlus size={13} /> 등록
        </Button>
      </div>

      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 검색"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
        />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="space-y-2">
        {eligibleRows.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">휴가 대상자로 등록된 근로자가 없습니다.</div>
        )}
        {eligibleRows.map((e) => {
          const u = usageFor(e.id);
          return (
            <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{e.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {siteName_(e.workSiteId)} · 근무시작 {e.hireDate ? formatDate(e.hireDate) : "-"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cancelTarget(e)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-muted active:bg-slate-50"
                >
                  <UserMinus size={12} /> 제외
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                <div className="text-center">
                  <p className="text-[11px] text-muted">발생일수</p>
                  <p className="mt-0.5 text-sm font-bold text-ink">{u.generated}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-muted">사용일수</p>
                  <p className="mt-0.5 text-sm font-bold text-ink">{u.used}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-muted">잔여일수</p>
                  <p className="mt-0.5 text-sm font-bold text-primary">{u.remaining}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)} title="휴가 대상자 등록">
        <div className="space-y-3">
          <div className="relative">
            <input
              value={registerSearch}
              onChange={(e) => setRegisterSearch(e.target.value)}
              placeholder="이름 또는 연락처 검색"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
            />
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          </div>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {registerCandidates.length === 0 && <p className="py-6 text-center text-xs text-muted">등록 가능한 근로자가 없습니다.</p>}
            {registerCandidates.map((e) => (
              <label
                key={e.id}
                className={`flex items-center gap-2.5 rounded-xl border p-3 text-sm ${checked.has(e.id) ? "border-primary bg-primary-light/40" : "border-slate-200"}`}
              >
                <input type="checkbox" checked={checked.has(e.id)} onChange={() => toggleChecked(e.id)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{e.name}</p>
                  <p className="truncate text-xs text-muted">{siteName_(e.workSiteId)} · {e.phone || "-"}</p>
                </div>
              </label>
            ))}
          </div>
          <Button className="w-full" onClick={registerTargets} disabled={checked.size === 0}>
            {checked.size > 0 ? `${checked.size}명 등록` : "등록"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
