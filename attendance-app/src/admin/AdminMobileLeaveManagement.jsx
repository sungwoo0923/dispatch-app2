import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Search } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Badge from "../components/Badge";
import { formatDate, toDateKey } from "../utils/dateUtils";
import { calcLeaveBalance } from "../utils/leave";

// 근로자휴가관리의 모바일 전용 화면 — 예전엔 관리자가 "휴가 대상자"로
// 미리 등록해야만 근로자가 이 목록에 나타났고, 발생일수도 항상 고정값
// "2일"이었다(휴가템플릿 연동 전 placeholder). 근로기준법 기준 입사일
// 계산으로 바꾸면서 별도 등록 없이 재직 중인 근로자 전원이 바로 보인다.
export default function AdminMobileLeaveManagement() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [search, setSearch] = useState("");
  const asOf = toDateKey();

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) =>
        setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted && e.employmentStatus !== "퇴사"))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const rows = useMemo(() => {
    return employees
      .filter((e) => !search.trim() || e.name?.includes(search.trim()))
      .map((e) => ({ emp: e, balance: calcLeaveBalance({ hireDate: e.hireDate || asOf, leaves: leaves.filter((l) => l.uid === e.id), today: asOf, careerYears: e.careerYears }) }))
      .sort((a, b) => (a.emp.name || "").localeCompare(b.emp.name || ""));
  }, [employees, leaves, search, asOf]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">근로자휴가관리 ({rows.length}명)</p>
        <p className="mt-0.5 text-xs text-muted">입사일 기준으로 자동 계산된 휴가 현황입니다</p>
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
        {rows.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">조회조건에 해당하는 근로자가 없습니다.</div>
        )}
        {rows.map(({ emp: e, balance: b }) => (
          <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{e.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {siteName_(e.workSiteId)} · 입사일 {e.hireDate ? formatDate(e.hireDate) : "-"}
                </p>
              </div>
              <Badge tone={b.isAnnual ? "success" : "warning"}>{b.leaveLabel}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
              <div className="text-center">
                <p className="text-[11px] text-muted">발생일수</p>
                <p className="mt-0.5 text-sm font-bold text-ink">{b.entitlement}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted">사용일수</p>
                <p className="mt-0.5 text-sm font-bold text-ink">{b.used}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted">잔여일수</p>
                <p className="mt-0.5 text-sm font-bold text-primary">{b.remaining}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
