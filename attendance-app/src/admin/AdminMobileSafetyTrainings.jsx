import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Search, ShieldCheck } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Badge from "../components/Badge";
import Modal from "../components/Modal";
import { toDateKey, addDays, formatTime, formatDate } from "../utils/dateUtils";

const TABS = ["전체", "Y", "N"];

// 안전교육현황의 모바일 전용 화면 — 출근 기록 기준으로 안전서명 여부를
// 카드로 훑어보고, 탭하면 근로자/담당자 서명 이미지를 바로 확인할 수 있다.
export default function AdminMobileSafetyTrainings() {
  const { profile } = useAuth();
  const [workSites, setWorkSites] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [range] = useState(() => ({ start: addDays(toDateKey(), -16), end: toDateKey() }));
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("전체");
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) => setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("date", ">=", range.start), where("date", "<=", range.end)),
      (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, range.start, range.end]);

  const employeeByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const managedSiteIds = useMemo(() => new Set(workSites.filter((s) => s.safetyManaged).map((s) => s.id)), [workSites]);

  const rows = useMemo(() => {
    return records
      .filter((r) => r.status === "출근" && r.siteId && managedSiteIds.has(r.siteId))
      .map((r) => ({ record: r, emp: employeeByUid.get(r.uid) }))
      .filter(({ emp }) => Boolean(emp))
      .filter(({ record }) => !search.trim() || record.name?.includes(search.trim()))
      .filter(({ record }) => {
        if (tab === "Y") return Boolean(record.safetySignature);
        if (tab === "N") return !record.safetySignature;
        return true;
      })
      .sort((a, b) => (b.record.date || "").localeCompare(a.record.date || ""));
  }, [records, managedSiteIds, employeeByUid, search, tab]);

  const counts = useMemo(() => {
    const base = records.filter((r) => r.status === "출근" && r.siteId && managedSiteIds.has(r.siteId) && employeeByUid.get(r.uid));
    return { 전체: base.length, Y: base.filter((r) => r.safetySignature).length, N: base.filter((r) => !r.safetySignature).length };
  }, [records, managedSiteIds, employeeByUid]);

  return (
    <div className="space-y-3 px-4 pt-4">
      <div>
        <p className="text-sm font-semibold text-ink">안전교육현황</p>
        <p className="mt-0.5 text-xs text-muted">최근 {addDays(toDateKey(), -16)} ~ {toDateKey()} 출근자의 안전교육 서명 여부입니다</p>
      </div>

      {managedSiteIds.size === 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          안전관리가 적용된 근무지가 없습니다. 센터별 안전관리 메뉴에서 먼저 설정해주세요.
        </div>
      )}

      <div className="relative">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 검색"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
        />
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
      </div>

      <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain">
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === s ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"
            }`}
          >
            {s} {counts[s] || 0}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">해당 조건에 출근 기록이 없습니다.</div>
        )}
        {rows.map(({ record: r, emp }) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setViewing({ ...r, emp })}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{r.name}</span>
                {r.safetySignature ? <Badge tone="success">Y</Badge> : <Badge tone="warning">N</Badge>}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">
                {formatDate(r.date)} · {r.siteName || "-"}
                {r.safetySignedAt && ` · ${formatTime(r.safetySignedAt)} 서명`}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title={`${viewing?.name || ""} 안전교육 서명`}>
        {viewing && (
          <div className="space-y-4">
            {viewing.safetySignature ? (
              <>
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
                    <ShieldCheck size={13} /> 근로자 서명
                  </p>
                  <img src={viewing.safetySignature} alt="근로자 서명" className="h-16 rounded-xl border border-slate-200 bg-white" />
                  {viewing.safetySignedAt && <p className="mt-1 text-[11px] text-muted">{formatTime(viewing.safetySignedAt)} 서명</p>}
                </div>
                {viewing.supervisorSignature && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted">안전담당자 확인 ({viewing.supervisorName})</p>
                    <img src={viewing.supervisorSignature} alt="담당자 서명" className="h-16 rounded-xl border border-slate-200 bg-white" />
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
