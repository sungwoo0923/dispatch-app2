import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Search } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Modal from "../components/Modal";
import { formatDate } from "../utils/dateUtils";

// 근로자휴가사용현황의 모바일 전용 화면 — PC의 월별/연도별 피벗표(1~31일,
// 1~12월 열)는 화면 폭상 모바일에 압축하기 어려워 제외하고, 실제로 가장
// 많이 쓰이는 "사용내역" 리스트만 카드로 제공한다. 상세 집계가 필요하면
// PC 화면을 이용하도록 안내한다.
export default function AdminMobileLeaveUsage() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [search, setSearch] = useState("");
  const [detailUid, setDetailUid] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (s) => setWorkSites(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (s) => setLeaves(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  const employeeByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName_ = (id) => workSites.find((s) => s.id === id)?.name || "-";

  const rows = useMemo(() => {
    return leaves
      .map((lv) => ({ leave: lv, emp: employeeByUid.get(lv.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ leave }) => !search.trim() || leave.name?.includes(search.trim()))
      .sort((a, b) => b.leave.startDate.localeCompare(a.leave.startDate));
  }, [leaves, employeeByUid, search]);

  const detailEmp = detailUid ? employeeByUid.get(detailUid) : null;
  const detailUsed = detailUid ? leaves.filter((l) => l.uid === detailUid).reduce((sum, l) => sum + (l.days || 1), 0) : 0;
  const detailGenerated = 2; // 휴가 발생 산정 엔진 연동 전까지의 임시값 (근로자휴가관리와 동일한 기준)
  const detailRemaining = Math.max(detailGenerated - detailUsed, 0);

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">휴가사용현황</p>
        <p className="mt-0.5 text-xs text-muted">근로자가 사용한 휴가 내역입니다. 월별·연도별 집계는 PC에서 확인하세요.</p>
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
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">사용된 휴가가 없습니다.</div>
        )}
        {rows.map(({ leave: lv, emp }) => (
          <button
            key={lv.id}
            type="button"
            onClick={() => setDetailUid(emp.id)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{lv.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {lv.type} · {formatDate(lv.startDate)} · {siteName_(emp.workSiteId)}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold text-primary">{lv.days || 1}일</span>
          </button>
        ))}
      </div>

      <Modal open={Boolean(detailUid)} onClose={() => setDetailUid(null)} title="근로자 휴가현황 요약">
        {detailEmp && (
          <div className="space-y-3 text-center">
            <p className="text-sm font-semibold text-ink">{detailEmp.name}</p>
            <p className="text-xs text-muted">{siteName_(detailEmp.workSiteId)}</p>
            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="rounded-xl border border-slate-100 p-3">
                <p className="text-[11px] text-muted">총 발생일수</p>
                <p className="mt-1 text-lg font-bold text-ink">{detailGenerated}</p>
              </div>
              <div className="rounded-xl border border-slate-100 p-3">
                <p className="text-[11px] text-muted">사용일수</p>
                <p className="mt-1 text-lg font-bold text-ink">{detailUsed}</p>
              </div>
              <div className="rounded-xl border border-slate-100 p-3">
                <p className="text-[11px] text-muted">잔여일수</p>
                <p className="mt-1 text-lg font-bold text-primary">{detailRemaining}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
