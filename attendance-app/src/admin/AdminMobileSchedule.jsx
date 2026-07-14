import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, addDoc, doc, setDoc, updateDoc, deleteDoc, getDocs, getDoc, serverTimestamp, deleteField } from "firebase/firestore";
import { ChevronLeft, ChevronRight, Search, Phone, Plus, CalendarDays, CheckSquare, Square } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import Modal from "../components/Modal";
import Button from "../components/Button";
import Badge from "../components/Badge";
import SmsButton from "../components/SmsButton";
import { toDateKey, formatDate, attendanceDocId } from "../utils/dateUtils";
import { buildDefaultContract } from "../utils/contractTemplate";
import { computeCheckInStatus } from "../utils/attendanceStatus";

const TABS = [
  { key: "pending", label: "대기", tone: "muted" },
  { key: "confirmed", label: "출근확정", tone: "success" },
  { key: "leave", label: "휴무", tone: "warning" },
  { key: "resigned", label: "퇴사", tone: "danger" },
];

const ROW_MENU_TARGETS = {
  confirmed: ["강제출근", "대기", "휴무", "퇴사"],
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
  const confirm = useConfirm();
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
  const [registerSiteFilter, setRegisterSiteFilter] = useState("all");
  const [registerSelected, setRegisterSelected] = useState(new Set());
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDoc(doc(db, "companies", profile.companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", profile.companyId), where("role", "==", "employee")), (snap) =>
        // 삭제(탈퇴)된 근로자는 목록에서 아예 빠져야 스케줄 화면에 남은 스케줄이
        // 계속 표시되지 않는다 — PC 스케줄등록(Schedule.jsx)은 이미 이렇게
        // 필터링하고 있었는데 모바일판만 빠져있었다.
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => !e.deleted))
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
    } else if (status === "대기") {
      // "대기"로 되돌리면 그날 근무 자체가 취소된 것이므로, 강제출근/자동출근으로
      // 이미 남아있는 출퇴근 기록도 함께 지운다 — 안 지우면 모바일 체크 화면에는
      // 여전히 "출근완료"가 남는다.
      await deleteDoc(doc(db, "attendance", attendanceDocId(sched.uid, sched.date))).catch(() => {});
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

  // 근로자가 출근지에 도착했는데도 시스템/기기 문제로 모바일 출근 버튼이
  // 안 먹힐 때, 관리자가 대신 출근 처리할 수 있게 한다. 단, 안전교육 등
  // 필수자료를 아직 다 이수하지 않은 근로자까지 강제로 출근 처리해버리면
  // 안전관리 사각지대가 생기므로 그 조건만은 그대로 지킨다.
  const forceCheckIn = async (row) => {
    const { schedule: s, emp } = row;
    if (!(await confirm(`${emp.name}님을 관리자가 직접 출근 처리하시겠습니까? 시스템 문제로 정상 출근이 안 될 때만 사용해주세요.`, "save")))
      return;
    try {
      const [materialsSnap, completionsSnap] = await Promise.all([
        getDocs(query(collection(db, "safetyMaterials"), where("companyId", "==", profile.companyId), where("active", "==", true))),
        getDocs(query(collection(db, "safetyCompletions"), where("uid", "==", s.uid))),
      ]);
      const completedIds = new Set(completionsSnap.docs.map((d) => d.data().materialId));
      const pendingSafety = materialsSnap.docs.filter((d) => !completedIds.has(d.id)).length;
      if (pendingSafety > 0) {
        toast.error(`${emp.name}님은 안전교육 미이수 자료가 ${pendingSafety}건 있어 강제출근 처리할 수 없습니다. 안전교육 이수 후 다시 시도해주세요.`);
        return;
      }
      const dk = s.date || dateKey;
      // 강제출근도 예정 출근시각 대비 지각 여부를 그대로 판정해야 한다 —
      // 이전에는 무조건 "출근"으로만 기록돼 실제 지각이었어도 지각 표시가
      // 전혀 남지 않았다.
      const now = new Date();
      const status = computeCheckInStatus(s.startTime, now);
      await setDoc(
        doc(db, "attendance", attendanceDocId(s.uid, dk)),
        {
          uid: s.uid,
          name: emp.name,
          companyId: profile.companyId,
          date: dk,
          month: dk.slice(0, 7),
          status,
          checkInTime: now.toISOString(),
          // 재출근 처리 시 이전에 남아있던 퇴근기록이 그대로 남아 옛 퇴근시각이
          // 계속 표시되는 문제가 있었다 — 새로 출근 처리할 때는 항상 지운다.
          checkOutTime: deleteField(),
          checkOutSource: deleteField(),
          source: "manual",
          siteId: s.siteId || emp.workSiteId || null,
          siteName: s.siteName || siteName(emp.workSiteId),
        },
        { merge: true }
      );
      toast.success(status === "지각" ? `${emp.name}님을 지각 출근 처리했습니다` : `${emp.name}님을 출근 처리했습니다`);
      notifyScheduleStatus(
        s.uid,
        status === "지각"
          ? "관리자에 의해 출근 처리되었습니다. (지각)"
          : "관리자에 의해 출근 처리되었습니다."
      );
    } catch (err) {
      console.error("forceCheckIn 실패:", err);
      toast.error(`강제출근 처리에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    }
  };

  const runAction = async (target) => {
    if (!actionRow) return;
    const { kind, row } = actionRow;
    setActionRow(null);
    if (kind === "confirmed" && target === "강제출근") {
      await forceCheckIn(row);
      return;
    }
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
      .filter((e) => registerSiteFilter === "all" || e.workSiteId === registerSiteFilter)
      .filter((e) => !kw || e.name?.includes(kw) || e.phone?.includes(kw))
      .slice(0, 100);
  }, [employees, registerSearch, registerSiteFilter]);

  const closeRegisterModal = () => {
    setRegisterOpen(false);
    setRegisterSearch("");
    setRegisterSiteFilter("all");
    setRegisterSelected(new Set());
  };

  const toggleRegisterSelected = (uid) => {
    setRegisterSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleRegisterSelectAll = () => {
    setRegisterSelected((prev) => (prev.size === registerCandidates.length ? new Set() : new Set(registerCandidates.map((e) => e.id))));
  };

  const registerSelectedSchedules = async () => {
    if (registerSelected.size === 0) return;
    setRegistering(true);
    try {
      let count = 0;
      for (const uid of registerSelected) {
        const emp = employees.find((e) => e.id === uid);
        if (!emp) continue;
        await upsertScheduleForDate(emp.id, emp, "대기", dateKey);
        count += 1;
      }
      toast.success(`${count}명의 ${formatDate(dateKey)} 근무가 등록되었습니다`);
      closeRegisterModal();
      setTab("pending");
    } catch (err) {
      toast.error(`등록에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setRegistering(false);
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
                  className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold hover:bg-slate-50 ${
                    t === "강제출근" ? "border-primary text-primary" : "border-slate-200 text-ink"
                  }`}
                >
                  {t === "강제출근" ? "강제출근 처리" : `${t}(으)로 변경`}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={registerOpen}
        onClose={closeRegisterModal}
        title="출근자등록"
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={closeRegisterModal}>
              닫기
            </Button>
            <Button className="flex-1" onClick={registerSelectedSchedules} disabled={registerSelected.size === 0 || registering}>
              {registering ? "등록 중..." : `선택등록 (${registerSelected.size})`}
            </Button>
          </>
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
          <select
            value={registerSiteFilter}
            onChange={(e) => setRegisterSiteFilter(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
          >
            <option value="all">전체 센터</option>
            {workSites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleRegisterSelectAll}
            className="flex items-center gap-1.5 text-xs font-semibold text-ink"
          >
            {registerSelected.size > 0 && registerSelected.size === registerCandidates.length ? (
              <CheckSquare size={15} className="text-primary" />
            ) : (
              <Square size={15} className="text-slate-300" />
            )}
            전체선택 ({registerCandidates.length}명)
          </button>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {registerCandidates.length === 0 && <p className="py-4 text-center text-xs text-muted">검색 결과가 없습니다.</p>}
            {registerCandidates.map((emp) => {
              const isSelected = registerSelected.has(emp.id);
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => toggleRegisterSelected(emp.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${
                    isSelected ? "border-primary bg-primary-light/40 ring-1 ring-primary" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-bold text-primary">
                    {emp.name?.[0] || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{emp.name}</p>
                    <p className="truncate text-xs text-muted">
                      {[emp.team, emp.position].filter(Boolean).join(" · ") || "-"}
                      {siteName(emp.workSiteId) && ` · ${siteName(emp.workSiteId)}`}
                    </p>
                  </div>
                  {isSelected ? <CheckSquare size={17} className="shrink-0 text-primary" /> : <Square size={17} className="shrink-0 text-slate-300" />}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
