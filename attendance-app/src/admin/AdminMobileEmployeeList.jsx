import { useEffect, useMemo, useState } from "react";
import { collection, query, where, onSnapshot, updateDoc, doc } from "firebase/firestore";
import { Search, Phone, ChevronRight, Monitor, CalendarDays } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useConfirm } from "../hooks/useConfirm";
import { useToast } from "../hooks/useToast";
import Modal from "../components/Modal";
import Badge from "../components/Badge";
import SmsButton from "../components/SmsButton";
import { formatPhoneNumber } from "../utils/phoneAuth";
import { toMonthKey } from "../utils/dateUtils";

const STATUS_TABS = ["전체", "재직", "휴직", "퇴사"];
const STATUS_TONE = { 재직: "primary", 휴직: "muted", 퇴사: "danger" };

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
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("전체");
  const [viewing, setViewing] = useState(null);
  const [viewingAttendance, setViewingAttendance] = useState([]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (snap) =>
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

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
      <div>
        <p className="text-sm font-semibold text-ink">근로자 ({counts.전체}명)</p>
        <p className="mt-0.5 text-xs text-muted">검색하거나 상태를 눌러 빠르게 확인하세요</p>
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
              신규 등록·상세 정보 수정·변경이력은 PC 화면에서 이용해주세요.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
