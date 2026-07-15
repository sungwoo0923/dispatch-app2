import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, query, where, onSnapshot, addDoc, doc, setDoc, updateDoc, deleteDoc, getDocs, getDoc, serverTimestamp, deleteField } from "firebase/firestore";
import { ChevronLeft, ChevronRight, Search, Phone, Plus, CalendarDays, CheckSquare, Square, CalendarRange, LayoutList, Eraser } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { useConfirm } from "../hooks/useConfirm";
import Modal from "../components/Modal";
import Button from "../components/Button";
import Badge from "../components/Badge";
import SmsButton from "../components/SmsButton";
import MiniMonthCalendar from "../components/MiniMonthCalendar";
import { toDateKey, toMonthKey, formatDate, attendanceDocId } from "../utils/dateUtils";
import { buildDefaultContract } from "../utils/contractTemplate";
import { computeCheckInStatus } from "../utils/attendanceStatus";
import { daysInMonth, WEEKDAY_LABELS } from "../utils/statsShared";
import { isKrHoliday } from "../utils/holidaysKR";
import { GRID_STATUS_KEYS, GRID_STATUS_LABELS, GRID_CELL_META, resolveDayStatus, writeDayStatus } from "../utils/scheduleGrid";

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

  // 월간보기 — PC 출근현황의 월별 스케줄표를 모바일 폭에 맞춰 "근로자 1명
  // 선택 → 그 달 캘린더 한 눈에 보기 + 날짜 탭해서 바로 수정"으로 재구성한
  // 화면. attendance/leaves/schedules를 PC와 완전히 같은 컬렉션·형태로
  // 읽고 쓰므로 PC 화면과 항상 자동으로 동기화된다.
  const [screenMode, setScreenMode] = useState("list"); // 'list' | 'month'
  const [monthEmpSearch, setMonthEmpSearch] = useState("");
  const [monthEmpUid, setMonthEmpUid] = useState(null);
  const [gridMonth, setGridMonth] = useState(() => toMonthKey());
  const [gridAttendance, setGridAttendance] = useState([]);
  const [gridLeaves, setGridLeaves] = useState([]);
  const [gridSchedules, setGridSchedules] = useState([]);
  const [gridEditDay, setGridEditDay] = useState(null); // { day, dateKey, current }
  const [gridSaving, setGridSaving] = useState(false);

  // 여러 날짜를 한 번에 같은 상태로 등록하고 싶을 때(예: "남은 일자를 전부
  // 출근으로") — 하루씩 눌러서 넣던 기존 방식과 별개로, 일괄등록 모드를
  // 켜면 날짜를 눌러 선택만 하고(저장은 안 함), 상태를 고른 뒤 한 번에
  // 적용한다.
  const [bulkPickMode, setBulkPickMode] = useState(false);
  const [bulkPickedDays, setBulkPickedDays] = useState(() => new Set());
  const [bulkPickStatus, setBulkPickStatus] = useState("출근");
  const [bulkPickApplying, setBulkPickApplying] = useState(false);

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

  // schedulesLoaded는 PC판(Schedule.jsx)과 동일한 이유로 필요하다 — 대용량
  // 업로드 직후 등 스냅샷 첫 페이로드가 아직 안 온 빈 배열을 "0건"으로
  // 오판하지 않기 위한 구분 플래그.
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  useEffect(() => {
    if (!profile?.companyId) return;
    setSchedulesLoaded(false);
    const unsub = onSnapshot(
      query(collection(db, "schedules"), where("companyId", "==", profile.companyId), where("date", "==", dateKey)),
      (snap) => {
        setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setSchedulesLoaded(true);
      }
    );
    return () => unsub();
  }, [profile?.companyId, dateKey]);

  // 같은 uid+date로 중복 등록된 스케줄을 PC와 동일한 규칙(대기 아닌 것
  // 우선 보존, 그다음 먼저 생성된 것 보존)으로 자동 정리한다. PC를 먼저
  // 열지 않고 모바일만 쓰는 관리자도 여기서 바로 정리되도록 별도로 둔다.
  const dedupingRef = useRef(false);
  useEffect(() => {
    if (!profile?.companyId || !schedulesLoaded || dedupingRef.current) return;
    const groups = new Map();
    for (const s of schedules) {
      const key = `${s.uid}_${s.date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const toDelete = [];
    for (const group of groups.values()) {
      if (group.length <= 1) continue;
      const sorted = [...group].sort((a, b) => {
        const aPending = (a.status || "대기") === "대기" ? 1 : 0;
        const bPending = (b.status || "대기") === "대기" ? 1 : 0;
        if (aPending !== bPending) return aPending - bPending;
        return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      });
      toDelete.push(...sorted.slice(1));
    }
    if (toDelete.length === 0) return;
    dedupingRef.current = true;
    (async () => {
      try {
        for (const s of toDelete) await deleteDoc(doc(db, "schedules", s.id)).catch(() => {});
        toast.success(`중복 등록된 스케줄 ${toDelete.length}건을 정리했습니다`);
      } finally {
        dedupingRef.current = false;
      }
    })();
  }, [profile?.companyId, schedules, schedulesLoaded]);

  // 월간보기 전용 데이터 — PC 월별 스케줄표와 동일하게 그 달의 attendance/
  // leaves/schedules 전체를 구독한다(일별 목록의 dateKey 단일 조회와는
  // 별개). 월간보기를 열었을 때만 구독해 평소 일별 목록에는 부담을 주지 않는다.
  useEffect(() => {
    if (!profile?.companyId || screenMode !== "month") return;
    const unsubAtt = onSnapshot(
      query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("month", "==", gridMonth)),
      (snap) => setGridAttendance(snap.docs.map((d) => d.data()))
    );
    const unsubLeaves = onSnapshot(
      query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("status", "==", "approved")),
      (snap) => setGridLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    const monthStart = `${gridMonth}-01`;
    const monthEnd = `${gridMonth}-31`;
    const unsubSched = onSnapshot(
      query(
        collection(db, "schedules"),
        where("companyId", "==", profile.companyId),
        where("date", ">=", monthStart),
        where("date", "<=", monthEnd)
      ),
      (snap) => setGridSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => {
      unsubAtt();
      unsubLeaves();
      unsubSched();
    };
  }, [profile?.companyId, screenMode, gridMonth]);

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

  // ── 월간보기 ───────────────────────────────────────────────────
  const monthEmpCandidates = useMemo(() => {
    const kw = monthEmpSearch.trim();
    return employees
      .filter((e) => e.employmentStatus !== "퇴사" && !e.deleted)
      .filter((e) => !kw || e.name?.includes(kw))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .slice(0, 50);
  }, [employees, monthEmpSearch]);
  const monthEmp = monthEmpUid ? empByUid.get(monthEmpUid) : null;
  const gridTodayKey = toDateKey();
  const gridNumDays = daysInMonth(gridMonth);
  const gridDayStatus = (day) => {
    if (!monthEmp) return "";
    const dateKey = `${gridMonth}-${String(day).padStart(2, "0")}`;
    return resolveDayStatus(monthEmp.id, monthEmp, dateKey, gridAttendance, gridLeaves, gridTodayKey);
  };
  const gridCells = Array.from({ length: gridNumDays }, (_, i) => {
    const day = i + 1;
    const dateKey = `${gridMonth}-${String(day).padStart(2, "0")}`;
    const status = gridDayStatus(day);
    const meta = GRID_CELL_META[status] || (status ? { label: status.slice(0, 1), className: "bg-slate-100 text-slate-600" } : GRID_CELL_META[""]);
    const isOut = status === "OUT";
    const wd = WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00`).getDay()];
    const holiday = !isOut && (isKrHoliday(dateKey) || wd === "일" || wd === "토");
    const selected = bulkPickMode && bulkPickedDays.has(day);
    return {
      day,
      disabled: isOut,
      className: `${isOut ? meta.className : `${meta.className || ""} ${holiday && !meta.className?.includes("bg-") ? "bg-red-50" : ""} border border-slate-100`} ${
        selected ? "ring-2 ring-offset-1 ring-primary" : ""
      }`,
    };
  });
  const gridMonthSummary = useMemo(() => {
    if (!monthEmp) return null;
    let present = 0, absent = 0, off = 0, annual = 0, overtime = 0, sick = 0;
    for (let day = 1; day <= gridNumDays; day += 1) {
      const status = gridDayStatus(day);
      if (status === "OUT") continue;
      if (status === "출근" || status === "지각") present += 1;
      else if (status === "특근") overtime += 1;
      else if (status === "연차") annual += 1;
      else if (status === "오전반차" || status === "오후반차") annual += 0.5;
      else if (status === "병가") sick += 1;
      else if (status === "결근") absent += 1;
      else if (status) off += 1;
    }
    return { present, absent, off, annual, overtime, sick };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthEmp, gridAttendance, gridLeaves, gridMonth, gridNumDays]);

  const openGridDay = (day) => {
    if (!monthEmp) return;
    if (bulkPickMode) {
      setBulkPickedDays((prev) => {
        const next = new Set(prev);
        if (next.has(day)) next.delete(day);
        else next.add(day);
        return next;
      });
      return;
    }
    const dateKey = `${gridMonth}-${String(day).padStart(2, "0")}`;
    setGridEditDay({ day, dateKey, current: gridDayStatus(day) });
  };
  const gridEmpLeaves = useMemo(() => (monthEmp ? gridLeaves.filter((l) => l.uid === monthEmp.id) : []), [gridLeaves, monthEmp]);
  const gridEmpSchedules = useMemo(() => (monthEmp ? gridSchedules.filter((s) => s.uid === monthEmp.id) : []), [gridSchedules, monthEmp]);

  // 근로자나 월을 바꾸면 이전 선택은 의미가 없으므로 비운다.
  useEffect(() => {
    setBulkPickedDays(new Set());
  }, [monthEmpUid, gridMonth]);

  const selectRemainingDays = () => {
    const days = [];
    for (let day = 1; day <= gridNumDays; day += 1) {
      const dateKey = `${gridMonth}-${String(day).padStart(2, "0")}`;
      if (dateKey <= gridTodayKey) continue;
      if ((monthEmp?.hireDate && dateKey < monthEmp.hireDate) || (monthEmp?.resignDate && dateKey > monthEmp.resignDate)) continue;
      days.push(day);
    }
    setBulkPickedDays(new Set(days));
  };

  const applyBulkPick = async () => {
    if (!monthEmp || bulkPickedDays.size === 0) return;
    const label = GRID_STATUS_LABELS[bulkPickStatus]?.label || bulkPickStatus;
    if (!(await confirm(`선택한 ${bulkPickedDays.size}일을 '${label}'(으)로 일괄 등록하시겠습니까?`, "save"))) return;
    setBulkPickApplying(true);
    try {
      for (const day of bulkPickedDays) {
        const dateKey = `${gridMonth}-${String(day).padStart(2, "0")}`;
        await writeDayStatus(db, {
          companyId: profile.companyId,
          uid: monthEmp.id,
          name: monthEmp.name,
          dateKey,
          statusKey: bulkPickStatus,
          emp: monthEmp,
          existingLeaves: gridEmpLeaves,
          existingSchedules: gridEmpSchedules,
          siteName: siteName(monthEmp.workSiteId),
        });
      }
      toast.success(`${bulkPickedDays.size}일을 '${label}'(으)로 일괄 등록했습니다`);
      setBulkPickedDays(new Set());
      setBulkPickMode(false);
    } catch (err) {
      toast.error(`일괄 등록에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setBulkPickApplying(false);
    }
  };
  const applyGridStatus = async (statusKey) => {
    if (!gridEditDay || !monthEmp) return;
    setGridSaving(true);
    try {
      await writeDayStatus(db, {
        companyId: profile.companyId,
        uid: monthEmp.id,
        name: monthEmp.name,
        dateKey: gridEditDay.dateKey,
        statusKey,
        emp: monthEmp,
        existingLeaves: gridEmpLeaves,
        existingSchedules: gridEmpSchedules,
        siteName: siteName(monthEmp.workSiteId),
      });
      toast.success(statusKey ? `${statusKey}(으)로 표시했습니다` : "기록을 지웠습니다");
      setGridEditDay(null);
    } catch (err) {
      toast.error(`저장에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setGridSaving(false);
    }
  };

  // 이번 달에 등록해둔 스케줄을 통째로 지워야 할 때 — writeDayStatus로
  // 하루씩 지우면 schedules(스케줄등록) 상태가 낡은 채로 남으므로, 세
  // 컬렉션 모두 이 근로자의 이번 달 문서를 직접 지운다(PC AttendanceBoard의
  // 일괄편집 "이 달 전체 초기화"와 동일한 로직).
  const [gridResetting, setGridResetting] = useState(false);
  const resetGridMonth = async () => {
    if (!monthEmp) return;
    if (!(await confirm(`${monthEmp.name} 근로자의 ${gridMonth} 스케줄을 전부 초기화하시겠습니까? 출근/휴가/스케줄등록 기록이 모두 삭제됩니다.`, "delete")))
      return;
    setGridResetting(true);
    try {
      const monthStart = `${gridMonth}-01`;
      const monthEnd = `${gridMonth}-31`;
      const [attSnap, leavesSnap, schedSnap] = await Promise.all([
        getDocs(
          query(collection(db, "attendance"), where("companyId", "==", profile.companyId), where("uid", "==", monthEmp.id), where("month", "==", gridMonth))
        ),
        getDocs(query(collection(db, "leaves"), where("companyId", "==", profile.companyId), where("uid", "==", monthEmp.id))),
        getDocs(
          query(
            collection(db, "schedules"),
            where("companyId", "==", profile.companyId),
            where("uid", "==", monthEmp.id),
            where("date", ">=", monthStart),
            where("date", "<=", monthEnd)
          )
        ),
      ]);
      const deletes = [
        ...attSnap.docs.map((d) => deleteDoc(doc(db, "attendance", d.id))),
        ...leavesSnap.docs.filter((d) => d.data().startDate >= monthStart && d.data().startDate <= monthEnd).map((d) => deleteDoc(doc(db, "leaves", d.id))),
        ...schedSnap.docs.map((d) => deleteDoc(doc(db, "schedules", d.id))),
      ];
      await Promise.all(deletes);
      toast.success(`${monthEmp.name} 근로자의 ${gridMonth} 스케줄을 초기화했습니다`);
    } catch (err) {
      toast.error(`초기화에 실패했습니다: ${err.code || err.message}`);
    } finally {
      setGridResetting(false);
    }
  };

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

      <div className="flex rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setScreenMode("list")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold ${
            screenMode === "list" ? "bg-primary text-white" : "text-muted"
          }`}
        >
          <LayoutList size={14} /> 일별목록
        </button>
        <button
          type="button"
          onClick={() => setScreenMode("month")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold ${
            screenMode === "month" ? "bg-primary text-white" : "text-muted"
          }`}
        >
          <CalendarRange size={14} /> 월간보기
        </button>
      </div>

      {screenMode === "list" && (
        <>
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
        </>
      )}

      {screenMode === "month" && (
        <div className="space-y-3">
          {!monthEmp ? (
            <>
              <div className="relative">
                <input
                  value={monthEmpSearch}
                  onChange={(e) => setMonthEmpSearch(e.target.value)}
                  placeholder="근로자 이름 검색"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm"
                  autoFocus
                />
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              </div>
              <p className="text-xs text-muted">근로자를 선택하면 그 달의 스케줄을 한눈에 보고 바로 수정할 수 있어요.</p>
              <div className="space-y-1.5">
                {monthEmpCandidates.length === 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted">검색 결과가 없습니다.</div>
                )}
                {monthEmpCandidates.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => setMonthEmpUid(emp.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left active:bg-slate-50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-bold text-primary">
                      {emp.name?.[0] || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{emp.name}</p>
                      <p className="truncate text-xs text-muted">{siteName(emp.workSiteId) || "-"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setMonthEmpUid(null)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-ink"
                >
                  <ChevronLeft size={16} /> {monthEmp.name}
                </button>
                <input
                  type="month"
                  value={gridMonth}
                  onChange={(e) => setGridMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setBulkPickMode((v) => !v);
                  setBulkPickedDays(new Set());
                }}
                className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  bulkPickMode ? "bg-primary text-white" : "border border-slate-200 bg-white text-ink"
                }`}
              >
                {bulkPickMode ? <CheckSquare size={14} /> : <Square size={14} />}
                {bulkPickMode ? "일괄등록 모드 (날짜를 눌러 선택하세요)" : "여러 날짜 한 번에 등록"}
              </button>

              {bulkPickMode && (
                <div className="space-y-2 rounded-xl border border-primary/30 bg-primary-light/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-ink">{bulkPickedDays.size}일 선택됨</p>
                    <button type="button" onClick={selectRemainingDays} className="text-xs font-semibold text-primary underline">
                      남은 일자 전체 선택
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {GRID_STATUS_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setBulkPickStatus(k)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                          bulkPickStatus === k ? GRID_STATUS_LABELS[k].tone : "bg-white text-muted border border-slate-200"
                        }`}
                      >
                        {GRID_STATUS_LABELS[k].label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setBulkPickMode(false);
                        setBulkPickedDays(new Set());
                      }}
                    >
                      취소
                    </Button>
                    <Button className="flex-1" disabled={bulkPickedDays.size === 0 || bulkPickApplying} onClick={applyBulkPick}>
                      {bulkPickApplying ? "등록 중..." : `선택 ${bulkPickedDays.size}일 등록`}
                    </Button>
                  </div>
                </div>
              )}

              {gridMonthSummary && (
                <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                  <div className="rounded-lg bg-primary-light py-1.5"><p className="font-bold text-primary">{gridMonthSummary.present}</p><p className="text-muted">출근</p></div>
                  <div className="rounded-lg bg-red-50 py-1.5"><p className="font-bold text-danger">{gridMonthSummary.absent}</p><p className="text-muted">결근</p></div>
                  <div className="rounded-lg bg-amber-50 py-1.5"><p className="font-bold text-amber-600">{gridMonthSummary.annual}</p><p className="text-muted">연차</p></div>
                  <div className="rounded-lg bg-slate-100 py-1.5"><p className="font-bold text-ink">{gridMonthSummary.off}</p><p className="text-muted">휴무</p></div>
                </div>
              )}

              <MiniMonthCalendar month={gridMonth} cells={gridCells} onDayClick={openGridDay} />

              <button
                type="button"
                disabled={gridResetting}
                onClick={resetGridMonth}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-muted disabled:opacity-50"
              >
                <Eraser size={14} /> {gridResetting ? "초기화 중..." : `${gridMonth.split("-")[1]}월 스케줄 전체 초기화`}
              </button>

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                {GRID_STATUS_KEYS.map((k) => (
                  <span key={k} className="flex items-center gap-1">
                    <span className={`inline-block h-2.5 w-2.5 rounded-sm ${GRID_STATUS_LABELS[k].tone.split(" ")[0]}`} /> {k}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <Modal
        open={Boolean(gridEditDay)}
        onClose={() => setGridEditDay(null)}
        title={monthEmp && gridEditDay ? `${monthEmp.name} · ${gridMonth.split("-")[1]}월 ${gridEditDay.day}일` : ""}
      >
        {gridEditDay && (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-muted">
              현재 상태:{" "}
              <span className="font-semibold text-ink">{gridEditDay.current ? GRID_STATUS_LABELS[gridEditDay.current]?.label || gridEditDay.current : "미정"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {GRID_STATUS_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={gridSaving}
                  onClick={() => applyGridStatus(k)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-50 ${
                    gridEditDay.current === k ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-ink"
                  }`}
                >
                  {GRID_STATUS_LABELS[k].label}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={gridSaving}
              onClick={() => applyGridStatus("")}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-muted disabled:opacity-50"
            >
              <Eraser size={14} /> 기록 지우기 (미정으로 초기화)
            </button>
          </div>
        )}
      </Modal>

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
