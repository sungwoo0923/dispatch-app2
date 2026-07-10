import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, getDocs, getDoc, serverTimestamp } from "firebase/firestore";
import { ChevronLeft, ChevronRight, Search, Phone, Plus, CalendarDays } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import Modal from "../components/Modal";
import Button from "../components/Button";
import Badge from "../components/Badge";
import SmsButton from "../components/SmsButton";
import { toDateKey, formatDate } from "../utils/dateUtils";
import { buildDefaultContract } from "../utils/contractTemplate";

const TABS = [
  { key: "pending", label: "대기", tone: "muted" },
  { key: "confirmed", label: "출근확정", tone: "success" },
  { key: "leave", label: "휴무", tone: "warning" },
  { key: "resigned", label: "퇴사", tone: "danger" },
];

const ROW_MENU_TARGETS = {
  confirmed: ["대기", "휴무", "퇴사"],
  pending: ["출근확정", "휴무", "퇴사"],
  leave: ["대기", "출근확정", "퇴사"],
  resigned: ["근무"],
};

// 스케줄등록의 모바일 전용 화면 — PC의 4개 넓은 표 대신 대기/출근확정/휴무/
// 퇴사 4개 탭의 카드 목록으로 재구성했다. 카드를 누르면 그 자리에서 상태를
// 바꿀 수 있고(우클릭 메뉴 대신 액션시트), + 버튼으로 특정 근로자의 특정
// 날짜 근무를 바로 등록할 수 있다. 복잡한 다중필터·복사하기·템플릿일괄적용은
// PC 화면에서 계속 이용해주세요.
export default function AdminMobileSchedule() {
  const { profile } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [dateKey, setDateKey] = useState(() => toDateKey());
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [businessEntities, setBusinessEntities] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("pending");
  const [actionRow, setActionRow] = useState(null); // { kind, row }
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerSearch, setRegisterSearch] = useState("");

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (snap) =>
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", profile.companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")), (snap) =>
        setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "businessEntities"), where("companyId", "==", profile.companyId)), (snap) =>
        setBusinessEntities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [profile?.companyId]);

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsub = onSnapshot(
      query(collection(db, "schedules"), where("companyId", "==", profile.companyId), where("date", "==", dateKey)),
      (snap) => setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [profile?.companyId, dateKey]);

  // EmployeeList 우클릭 "스케줄등록"으로 넘어온 경우 바로 등록 화면을 연다.
  useEffect(() => {
    const uid = location.state?.presetEmployeeId;
    if (!uid) return;
    setRegisterOpen(true);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const empByUid = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const siteName = (id) => workSites.find((s) => s.id === id)?.name || "";

  const pendingRows = useMemo(
    () => schedules.filter((s) => (s.status || "대기") === "대기").map((s) => ({ schedule: s, emp: empByUid.get(s.uid) })).filter((r) => r.emp),
    [schedules, empByUid]
  );
  const confirmedRows = useMemo(
    () => schedules.filter((s) => s.status === "출근확정").map((s) => ({ schedule: s, emp: empByUid.get(s.uid) })).filter((r) => r.emp),
    [schedules, empByUid]
  );
  const leaveRows = useMemo(
    () =>
      leaves
        .filter((lv) => lv.startDate <= dateKey && (lv.endDate || lv.startDate) >= dateKey)
        .map((lv) => ({ leave: lv, emp: empByUid.get(lv.uid) }))
        .filter((r) => r.emp),
    [leaves, empByUid, dateKey]
  );
  const resignedRows = useMemo(() => employees.filter((e) => e.employmentStatus === "퇴사"), [employees]);

  const rowsByTab = { pending: pendingRows, confirmed: confirmedRows, leave: leaveRows, resigned: resignedRows };
  const filteredRows = useMemo(() => {
    const kw = search.trim();
    const list = rowsByTab[tab] || [];
    if (!kw) return list;
    return list.filter((r) => (r.emp?.name || r.name || "").includes(kw));
  }, [tab, search, pendingRows, confirmedRows, leaveRows, resignedRows]);

  const shiftDate = (delta) => {
    const d = new Date(dateKey);
    d.setDate(d.getDate() + delta);
    setDateKey(toDateKey(d));
  };

  const notifyScheduleStatus = (uid, message) => {
    if (!uid) return;
    addDoc(collection(db, "notifications"), {
      companyId: profile.companyId,
      uid,
      title: "근무 스케줄 안내",
      message,
      read: false,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  };

  const applyScheduleStatusOne = async (id, status, sched) => {
    await updateDoc(doc(db, "schedules", id), { status });
    const emp = empByUid.get(sched.uid);
    if (!emp) return;
    notifyScheduleStatus(sched.uid, `${sched.date} 근무 상태가 '${status}'(으)로 변경되었습니다.`);
    if (status === "출근확정") {
      const existing = await getDocs(query(collection(db, "contracts"), where("companyId", "==", profile.companyId), where("uid", "==", emp.id)));
      if (existing.empty) {
        const site = workSites.find((w) => w.id === emp.workSiteId);
        const stampUrl = businessEntities.find((b) => b.id === emp.businessEntityId)?.stampUrl || null;
        await addDoc(collection(db, "contracts"), {
          companyId: profile.companyId,
          uid: emp.id,
          employeeName: emp.name,
          title: "근로계약서",
          startDate: sched.date,
          endDate: null,
          content: buildDefaultContract({ employeeName: emp.name, hireDate: sched.date, position: emp.position, siteName: site?.name || sched.siteName, companyName }),
          status: "sent",
          signatureDataUrl: null,
          signedAt: null,
          companySignatureDataUrl: stampUrl,
          companySignedAt: stampUrl ? sched.date : null,
          autoGenerated: true,
          createdAt: serverTimestamp(),
        });
      }
    }
  };

  const upsertScheduleForDate = async (uid, emp, status, date) => {
    const existing = schedules.find((x) => x.uid === uid && x.date === date);
    if (existing) {
      await applyScheduleStatusOne(existing.id, status, existing);
      return;
    }
    const ref = await addDoc(collection(db, "schedules"), {
      companyId: profile.companyId,
      uid,
      name: emp.name,
      date,
      siteId: emp.workSiteId || null,
      siteName: siteName(emp.workSiteId),
      startTime: "",
      endTime: "",
      status: "대기",
      createdAt: serverTimestamp(),
    });
    if (status === "출근확정") await applyScheduleStatusOne(ref.id, "출근확정", { uid, date, siteName: siteName(emp.workSiteId) });
    else notifyScheduleStatus(uid, `${date} 근무 상태가 '대기'로 변경되었습니다.`);
  };

  const runAction = async (target) => {
    if (!actionRow) return;
    const { kind, row } = actionRow;
    setActionRow(null);
    try {
      if (kind === "confirmed" || kind === "pending") {
        const { schedule: s, emp } = row;
        if (target === "대기" || target === "출근확정") {
          await applyScheduleStatusOne(s.id, target, s);
        } else if (target === "휴무") {
          await addDoc(collection(db, "leaves"), {
            companyId: profile.companyId,
            uid: s.uid,
            name: emp.name,
            type: "관리자 처리",
            startDate: s.date,
            endDate: s.date,
            status: "approved",
            createdAt: serverTimestamp(),
          });
          await deleteDoc(doc(db, "schedules", s.id));
          notifyScheduleStatus(s.uid, `${s.date} 근무 상태가 '휴무'로 변경되었습니다.`);
        } else if (target === "퇴사") {
          await updateDoc(doc(db, "users", s.uid), { employmentStatus: "퇴사", resignDate: s.date });
          await deleteDoc(doc(db, "schedules", s.id));
        }
      } else if (kind === "leave") {
        const { leave, emp } = row;
        if (target === "퇴사") {
          await updateDoc(doc(db, "leaves", leave.id), { status: "cancelled" });
          await updateDoc(doc(db, "users", leave.uid), { employmentStatus: "퇴사", resignDate: toDateKey() });
        } else if (target === "대기" || target === "출근확정") {
          await updateDoc(doc(db, "leaves", leave.id), { status: "cancelled" });
          await upsertScheduleForDate(leave.uid, emp, target, dateKey);
        }
      } else if (kind === "resigned") {
        await updateDoc(doc(db, "users", row.id), { employmentStatus: "재직", resignDate: "" });
      }
      toast.success("상태가 변경되었습니다");
    } catch (err) {
      toast.error(`상태 변경에 실패했습니다: ${err.code || err.message}`);
    }
  };

  const registerCandidates = useMemo(() => {
    const kw = registerSearch.trim();
    return employees
      .filter((e) => e.employmentStatus !== "퇴사" && !e.deleted)
      .filter((e) => !kw || e.name?.includes(kw) || e.phone?.includes(kw))
      .slice(0, 30);
  }, [employees, registerSearch]);

  const registerSchedule = async (emp) => {
    try {
      await upsertScheduleForDate(emp.id, emp, "대기", dateKey);
      toast.success(`${emp.name}님 ${formatDate(dateKey)} 근무가 등록되었습니다`);
      setRegisterOpen(false);
      setRegisterSearch("");
      setTab("pending");
    } catch (err) {
      toast.error(`등록에 실패했습니다: ${err.code || err.message}`);
    }
  };

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">스케줄등록</p>
          <p className="mt-0.5 text-xs text-muted">카드를 눌러 근무 상태를 바로 바꿀 수 있어요</p>
        </div>
        <button
          type="button"
          onClick={() => setRegisterOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-2">
        <button type="button" onClick={() => shiftDate(-1)} className="rounded-lg p-1.5 text-muted hover:bg-slate-50">
          <ChevronLeft size={18} />
        </button>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <CalendarDays size={14} className="text-primary" /> {formatDate(dateKey)}
        </span>
        <button type="button" onClick={() => shiftDate(1)} className="rounded-lg p-1.5 text-muted hover:bg-slate-50">
          <ChevronRight size={18} />
        </button>
      </div>
      {dateKey !== toDateKey() && (
        <button type="button" onClick={() => setDateKey(toDateKey())} className="text-xs font-medium text-primary">
          오늘로 이동
        </button>
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
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === t.key ? "bg-primary text-white" : "bg-white text-muted border border-slate-200"
            }`}
          >
            {t.label} {(rowsByTab[t.key] || []).length}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filteredRows.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">해당하는 근로자가 없습니다.</div>
        )}
        {filteredRows.map((row) => {
          const emp = row.emp || row;
          const key = row.schedule?.id || row.leave?.id || row.id;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActionRow({ kind: tab, row })}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left active:bg-slate-50"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary">
                {emp.name?.[0] || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink">{emp.name}</span>
                  <Badge tone={TABS.find((t) => t.key === tab)?.tone}>{TABS.find((t) => t.key === tab)?.label}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {tab === "leave"
                    ? `${formatDate(row.leave.startDate)} ~ ${formatDate(row.leave.endDate || row.leave.startDate)}`
                    : tab === "resigned"
                      ? `퇴사일 ${row.resignDate ? formatDate(row.resignDate) : "-"}`
                      : `${row.schedule.startTime || "-"} ~ ${row.schedule.endTime || "-"} · ${siteName(emp.workSiteId) || row.schedule.siteName || "-"}`}
                </p>
              </div>
              {emp.phone && (
                <div className="flex shrink-0 items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                  <a href={`tel:${emp.phone}`} className="rounded-lg p-1.5 text-primary hover:bg-primary-light">
                    <Phone size={15} />
                  </a>
                  <SmsButton phone={emp.phone} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Modal open={Boolean(actionRow)} onClose={() => setActionRow(null)} title="근무 상태 변경">
        {actionRow && (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">{(actionRow.row.emp || actionRow.row).name}</span>님의 상태를 변경합니다.
            </p>
            <div className="flex flex-col gap-2">
              {(ROW_MENU_TARGETS[actionRow.kind] || []).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => runAction(t)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-ink hover:bg-slate-50"
                >
                  {t}(으)로 변경
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title="출근자등록"
        footer={
          <Button variant="outline" className="w-full" onClick={() => setRegisterOpen(false)}>
            닫기
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">
            <span className="font-semibold text-ink">{formatDate(dateKey)}</span> 근무로 등록할 근로자를 선택하세요 (대기 상태로 등록됩니다)
          </p>
          <div className="relative">
            <input
              value={registerSearch}
              onChange={(e) => setRegisterSearch(e.target.value)}
              placeholder="이름 또는 연락처 검색"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pl-9 text-sm"
              autoFocus
            />
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          </div>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {registerCandidates.length === 0 && <p className="py-4 text-center text-xs text-muted">검색 결과가 없습니다.</p>}
            {registerCandidates.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() => registerSchedule(emp)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-bold text-primary">
                  {emp.name?.[0] || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{emp.name}</p>
                  <p className="truncate text-xs text-muted">{[emp.team, emp.position].filter(Boolean).join(" · ") || "-"}</p>
                </div>
                <Plus size={15} className="shrink-0 text-primary" />
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
