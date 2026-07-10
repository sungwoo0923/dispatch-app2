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
import { formatDate, formatTime } from "../utils/dateUtils";

const STATUS_TONE = { 출근: "success", 지각: "warning", 결근: "danger", 조퇴: "warning" };
const STATUS_BAR = { 출근: "bg-primary", 지각: "bg-warning", 결근: "bg-danger", 조퇴: "bg-warning" };
const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
const REQUEST_STATUS_LABEL = { pending: "승인대기", approved: "승인됨", rejected: "반려됨" };
const REQUEST_STATUS_ICON = { pending: Hourglass, approved: CheckCircle2, rejected: XCircle };
const REQUEST_STATUS_TEXT_CLS = { pending: "text-warning", approved: "text-success", rejected: "text-danger" };

function monthLabel(dateKey) {
  const [y, m] = dateKey.split("-");
  return `${y}년 ${Number(m)}월`;
}

export default function AttendanceHistory() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
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
      () => toast.error("출근기록을 불러오지 못했습니다. 앱을 다시 시작해주세요.")
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

  const grouped = useMemo(() => {
    const map = new Map();
    records.forEach((r) => {
      const key = r.date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()];
  }, [records]);

  const requestsFor = (date) => changeRequests.filter((c) => c.date === date).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const latestRequestFor = (date, field) => requestsFor(date).find((c) => c.field === field);

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
        fieldLabel: requestField === "checkInTime" ? "출근시각" : "퇴근시각",
        currentTime: currentIso ? currentIso.slice(11, 16) : "",
        requestedTime: requestTime,
        reason: requestReason.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });
      toast.success("변경 요청이 접수되었습니다. 관리자 승인을 기다려주세요.");
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
              {REQUEST_STATUS_LABEL[pending.status]}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-lg font-bold text-ink">{value ? formatTime(value) : "-"}</p>
        {pending && (
          <p className="mt-1 text-xs text-muted">
            {pending.status === "pending" ? "요청" : pending.status === "approved" ? "변경" : "요청"} 시각 {pending.requestedTime}
            {pending.status === "rejected" && pending.adminNote ? ` · 사유: ${pending.adminNote}` : ""}
          </p>
        )}
        {!showForm ? (
          <button
            type="button"
            onClick={() => openRequestForm(field, value)}
            disabled={pending?.status === "pending"}
            className="mt-2 text-xs font-semibold text-primary disabled:text-slate-300"
          >
            {pending?.status === "pending" ? "승인 대기중" : "시각 변경 요청"}
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
              placeholder="변경 사유를 입력해주세요"
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setRequestField(null)}>
                취소
              </Button>
              <Button size="sm" className="flex-1" onClick={submitRequest} disabled={submitting || !requestTime || !requestReason.trim()}>
                <Send size={12} /> 요청 제출
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 px-4 pb-6 pt-4">
      <h2 className="text-sm font-semibold text-ink">출근기록</h2>
      {grouped.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Clock size={26} className="text-muted" />
          <p className="text-sm text-muted">출근 기록이 없습니다.</p>
        </Card>
      )}
      {grouped.map(([month, list]) => (
        <div key={month} className="space-y-2">
          <p className="px-0.5 text-xs font-bold text-muted">{monthLabel(list[0].date)}</p>
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
                        <Badge tone={STATUS_TONE[r.status] || "muted"}>{r.status || "미출근"}</Badge>
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
      ))}

      <Modal open={Boolean(detail)} onClose={closeDetail} title="출근기록 상세" footer={<Button className="w-full" onClick={closeDetail}>닫기</Button>}>
        {detail && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-primary-light/40 px-4 py-3">
              <span className="text-sm font-semibold text-ink">{formatDate(detail.date)}</span>
              <Badge tone={STATUS_TONE[detail.status] || "muted"}>{detail.status || "미출근"}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <TimeField icon={LogIn} label="출근시각" field="checkInTime" value={detail.checkInTime} />
              <TimeField icon={LogOut} label="퇴근시각" field="checkOutTime" value={detail.checkOutTime} />
            </div>
            <p className="text-xs leading-relaxed text-muted">
              변경 요청을 제출하면 관리자 승인 후 실제 기록에 반영됩니다. 승인 대기 중인 요청이 있으면 새 요청을 제출할 수 없습니다.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
