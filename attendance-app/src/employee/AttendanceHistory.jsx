import { useEffect, useMemo, useState } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { LogIn, LogOut, ChevronRight, Clock, Send, CheckCircle2, XCircle, Hourglass } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import Card from "../components/Card";
import Badge from "../components/Badge";
import Button from "../components/Button";
import Modal from "../components/Modal";
import { useToast } from "../hooks/useToast";
import { useLanguage } from "../hooks/useLanguage";
import { formatDate, formatTime, toDateKey } from "../utils/dateUtils";

const STATUS_TONE = { 출근: "success", 지각: "warning", 결근: "danger", 조퇴: "warning" };
const STATUS_BAR = { 출근: "bg-primary", 지각: "bg-warning", 결근: "bg-danger", 조퇴: "bg-warning" };
const STATUS_KEY = { 출근: "attendance.status.출근", 지각: "attendance.status.지각", 결근: "attendance.status.결근", 조퇴: "attendance.status.조퇴" };
const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
const REQUEST_STATUS_KEY = { pending: "attendance.requestPending", approved: "attendance.requestApproved", rejected: "attendance.requestRejected" };
const REQUEST_STATUS_ICON = { pending: Hourglass, approved: CheckCircle2, rejected: XCircle };
const REQUEST_STATUS_TEXT_CLS = { pending: "text-warning", approved: "text-success", rejected: "text-danger" };

function monthLabel(dateKey) {
  const [y, m] = dateKey.split("-");
  return `${y}년 ${Number(m)}월`;
}

export default function AttendanceHistory() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const { t } = useLanguage();
  const [records, setRecords] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [detail, setDetail] = useState(null);
  const [requestField, setRequestField] = useState(null); // "checkInTime" | "checkOutTime"
  const [requestTime, setRequestTime] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "attendance"), where("uid", "==", user.uid), orderBy("date", "desc"), limit(60));
    const unsub = onSnapshot(
      q,
      (snap) => setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => toast.error(t("attendance.loadError"))
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "attendanceChangeRequests"), where("uid", "==", user.uid)),
      (snap) => setChangeRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, "payrolls"), where("uid", "==", user.uid)), (snap) =>
      setPayrolls(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  // 오늘 실제 출근기록이 아직 없더라도, 관리자가 오늘을 근무일로 등록해뒀으면
  // (schedules.status === "출근확정") 그 사실을 알아야 상단 "오늘 현황"
  // 카드에 "출근 예정"을 보여줄 수 있다.
  const todayKey = toDateKey();
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "schedules"), where("uid", "==", user.uid), where("date", "==", todayKey)),
      (snap) => setTodaySchedule(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null)
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const grouped = useMemo(() => {
    const map = new Map();
    records.forEach((r) => {
      const key = r.date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()];
  }, [records]);

  // 월별 요약: 근태 통계는 이 화면이 이미 불러온 attendance 기록에서 직접
  // 집계하고(관리자 정산 여부와 무관하게 항상 최신값), 급여만 정산확정된
  // payrolls 문서가 있을 때 참고로 곁들인다.
  const monthlySummary = (month, list) => {
    let workedMs = 0;
    let attendCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let earlyLeaveCount = 0;
    list.forEach((r) => {
      if (r.status === "출근" || r.status === "지각") {
        attendCount += 1;
        if (r.checkInTime && r.checkOutTime) workedMs += Math.max(0, new Date(r.checkOutTime) - new Date(r.checkInTime));
      }
      if (r.status === "지각") lateCount += 1;
      if (r.status === "결근") absentCount += 1;
      if (r.status === "조퇴") earlyLeaveCount += 1;
    });
    const payroll = payrolls.find((p) => p.month === month && p.settlementStatus === "confirmed");
    return {
      workedHours: (workedMs / 3600000).toFixed(1),
      attendCount,
      lateCount,
      absentCount,
      earlyLeaveCount,
      netPay: payroll?.netPay,
    };
  };

  const requestsFor = (date) => changeRequests.filter((c) => c.date === date).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const latestRequestFor = (date, field) => requestsFor(date).find((c) => c.field === field);

  // 출근현황에 들어오면 오늘 기록/예정이 있을 때 과거·미래 내역보다 먼저
  // 눈에 띄어야 한다 — 아직 실제 체크인이 없어도(오늘 근무 예정) 카드
  // 자체는 보여주고, 실제 체크인 기록이 생기면 그 기록으로 대체한다.
  const todayRecord = records.find((r) => r.date === todayKey);
  const todayCard = todayRecord
    ? {
        scheduled: false,
        tone: STATUS_TONE[todayRecord.status] || "muted",
        label: todayRecord.status ? t(STATUS_KEY[todayRecord.status]) : t("attendance.status.미출근"),
        checkInTime: todayRecord.checkInTime,
        checkOutTime: todayRecord.checkOutTime,
      }
    : todaySchedule?.status === "출근확정"
    ? {
        scheduled: true,
        tone: "primary",
        label: "출근 예정",
        startTime: todaySchedule.startTime,
        endTime: todaySchedule.endTime,
        siteName: todaySchedule.siteName,
      }
    : null;

  const openDetail = (r) => {
    setDetail(r);
    setRequestField(null);
    setRequestTime("");
    setRequestReason("");
  };
  const closeDetail = () => {
    setDetail(null);
    setRequestField(null);
  };

  const openRequestForm = (field, currentIso) => {
    setRequestField(field);
    setRequestTime(currentIso ? currentIso.slice(11, 16) : "");
    setRequestReason("");
  };

  const submitRequest = async () => {
    if (!detail || !requestField || !requestTime || !requestReason.trim()) return;
    setSubmitting(true);
    try {
      const currentIso = detail[requestField] || "";
      await addDoc(collection(db, "attendanceChangeRequests"), {
        companyId: profile.companyId,
        uid: user.uid,
        name: profile.name,
        attendanceId: detail.id,
        date: detail.date,
        field: requestField,
        fieldLabel: requestField === "checkInTime" ? t("attendance.checkInTime") : t("attendance.checkOutTime"),
        currentTime: currentIso ? currentIso.slice(11, 16) : "",
        requestedTime: requestTime,
        reason: requestReason.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });
      toast.success(t("attendance.requestSubmitted"));
      setRequestField(null);
      setRequestReason("");
    } catch (err) {
      toast.error(`요청 접수에 실패했습니다. (${err?.code || err?.message || "다시 시도해주세요"})`);
    } finally {
      setSubmitting(false);
    }
  };

  const TimeField = ({ icon: Icon, label, field, value }) => {
    const pending = latestRequestFor(detail?.date, field);
    const showForm = requestField === field;
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Icon size={13} /> {label}
          </span>
          {pending && (
            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${REQUEST_STATUS_TEXT_CLS[pending.status]}`}>
              {(() => {
                const Ico = REQUEST_STATUS_ICON[pending.status];
                return <Ico size={12} />;
              })()}
              {t(REQUEST_STATUS_KEY[pending.status])}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-lg font-bold text-ink">{value ? formatTime(value) : "-"}</p>
        {pending && (
          <p className="mt-1 text-xs text-muted">
            {t("attendance.requestedTime", { status: t(REQUEST_STATUS_KEY[pending.status === "approved" ? "approved" : "pending"]), time: pending.requestedTime })}
            {pending.status === "rejected" && pending.adminNote ? ` · ${pending.adminNote}` : ""}
          </p>
        )}
        {!showForm ? (
          <button
            type="button"
            onClick={() => openRequestForm(field, value)}
            disabled={pending?.status === "pending"}
            className="mt-2 text-xs font-semibold text-primary disabled:text-slate-300"
          >
            {pending?.status === "pending" ? t("attendance.waitingApproval") : t("attendance.requestChange")}
          </button>
        ) : (
          <div className="mt-2 space-y-2 border-t border-slate-200 pt-2.5">
            <input
              type="time"
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm"
              value={requestTime}
              onChange={(e) => setRequestTime(e.target.value)}
            />
            <textarea
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
              rows={2}
              placeholder={t("attendance.requestReasonPlaceholder")}
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setRequestField(null)}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" className="flex-1" onClick={submitRequest} disabled={submitting || !requestTime || !requestReason.trim()}>
                <Send size={12} /> {t("attendance.submitRequest")}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 px-4 pb-6 pt-4">
      <h2 className="text-sm font-semibold text-ink">{t("attendance.title")}</h2>

      {todayCard && (
        <Card className="border-primary/30 bg-primary-light/30 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-primary">오늘 · {formatDate(todayKey)}</p>
            <Badge tone={todayCard.tone}>{todayCard.label}</Badge>
          </div>
          {todayCard.scheduled ? (
            <p className="mt-2 text-xs text-muted">
              {todayCard.startTime ? `${todayCard.startTime}${todayCard.endTime ? `~${todayCard.endTime}` : ""} 근무 예정` : "오늘 근무 예정"}
              {todayCard.siteName ? ` · ${todayCard.siteName}` : ""}
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-3 text-xs text-muted">
              <span className="flex items-center gap-1">
                <LogIn size={12} /> {todayCard.checkInTime ? formatTime(todayCard.checkInTime) : "-"}
              </span>
              <span className="flex items-center gap-1">
                <LogOut size={12} /> {todayCard.checkOutTime ? formatTime(todayCard.checkOutTime) : "-"}
              </span>
            </div>
          )}
        </Card>
      )}

      {grouped.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Clock size={26} className="text-muted" />
          <p className="text-sm text-muted">{t("attendance.empty")}</p>
        </Card>
      )}
      {grouped.map(([month, list]) => {
        const summary = monthlySummary(month, list);
        return (
        <div key={month} className="space-y-2">
          <p className="px-0.5 text-xs font-bold text-muted">{monthLabel(list[0].date)}</p>
          <Card className="grid grid-cols-3 gap-y-3 p-4 text-center">
            <div>
              <p className="text-[11px] text-muted">총 근무시간</p>
              <p className="mt-0.5 text-sm font-bold text-ink">{summary.workedHours}시간</p>
            </div>
            <div>
              <p className="text-[11px] text-muted">월별급여</p>
              <p className="mt-0.5 text-sm font-bold text-primary">{summary.netPay != null ? `${summary.netPay.toLocaleString()}원` : "미정산"}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted">총 출근횟수</p>
              <p className="mt-0.5 text-sm font-bold text-ink">{summary.attendCount}회</p>
            </div>
            <div>
              <p className="text-[11px] text-muted">지각</p>
              <p className="mt-0.5 text-sm font-bold text-warning">{summary.lateCount}회</p>
            </div>
            <div>
              <p className="text-[11px] text-muted">결근</p>
              <p className="mt-0.5 text-sm font-bold text-danger">{summary.absentCount}회</p>
            </div>
            <div>
              <p className="text-[11px] text-muted">조퇴</p>
              <p className="mt-0.5 text-sm font-bold text-warning">{summary.earlyLeaveCount}회</p>
            </div>
          </Card>
          {list.map((r) => {
            const d = new Date(`${r.date}T00:00:00`);
            const weekday = WEEKDAY_KR[d.getDay()];
            const req = requestsFor(r.date).find((c) => c.status === "pending");
            return (
              <button key={r.id} type="button" onClick={() => openDetail(r)} className="block w-full text-left">
                <Card className="flex items-stretch gap-0 overflow-hidden p-0">
                  <div className={`w-1.5 shrink-0 ${STATUS_BAR[r.status] || "bg-slate-300"}`} />
                  <div className="flex flex-1 items-center gap-3 px-4 py-3.5">
                    <div className="flex w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-50 py-1.5">
                      <span className="text-[10px] font-medium text-muted">{weekday}</span>
                      <span className="text-base font-bold text-ink">{d.getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-ink">{formatDate(r.date)}</p>
                        <Badge tone={STATUS_TONE[r.status] || "muted"}>{r.status ? t(STATUS_KEY[r.status]) : t("attendance.status.미출근")}</Badge>
                        {req && <Hourglass size={12} className="text-warning" />}
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <LogIn size={12} /> {r.checkInTime ? formatTime(r.checkInTime) : "-"}
                        </span>
                        <span className="flex items-center gap-1">
                          <LogOut size={12} /> {r.checkOutTime ? formatTime(r.checkOutTime) : "-"}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-slate-300" />
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
        );
      })}

      <Modal open={Boolean(detail)} onClose={closeDetail} title={t("attendance.detailTitle")} footer={<Button className="w-full" onClick={closeDetail}>{t("common.close")}</Button>}>
        {detail && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-primary-light/40 px-4 py-3">
              <span className="text-sm font-semibold text-ink">{formatDate(detail.date)}</span>
              <Badge tone={STATUS_TONE[detail.status] || "muted"}>{detail.status ? t(STATUS_KEY[detail.status]) : t("attendance.status.미출근")}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <TimeField icon={LogIn} label={t("attendance.checkInTime")} field="checkInTime" value={detail.checkInTime} />
              <TimeField icon={LogOut} label={t("attendance.checkOutTime")} field="checkOutTime" value={detail.checkOutTime} />
            </div>
            <p className="text-xs leading-relaxed text-muted">{t("attendance.requestNotice")}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
