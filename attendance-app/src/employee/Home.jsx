import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  MapPin,
  Navigation,
  FileSignature,
  Megaphone,
  LogIn,
  LogOut,
  DoorOpen,
  Bell,
  X,
  ShieldAlert,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useGeofenceCheckIn } from "../hooks/useGeofenceCheckIn";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import { formatTime, toDateKey } from "../utils/dateUtils";
import { getPrimarySafetyManager } from "../utils/safety";
import { useToast } from "../hooks/useToast";

const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
const SAFETY_TIPS = [
  "레일 작업 중 레일에 기대지마세요.",
  "안전모와 안전화를 반드시 착용하세요.",
  "무리한 중량물은 2인 1조로 운반하세요.",
];

// 출근 전 필수 서류 — 일용직은 근로계약동의서까지, 그 외 근무형태는
// 안전교육일지만 매 출근 시 확인/서명한다.
const DOC_META = {
  contract: {
    title: "근로계약 및 개인정보 수집 동의서",
    content:
      "본인은 소속 회사 및 배정 근무지에서 근로계약에 따라 성실히 근무할 것을 동의하며, " +
      "회사가 근태관리·급여정산·안전관리 목적으로 본인의 성명, 연락처, 근무기록, 위치정보(출퇴근 확인용)를 " +
      "수집·이용하는 것에 동의합니다. 수집된 개인정보는 근로관계 종료 후 관계 법령에 따른 보관기간이 " +
      "지나면 파기됩니다. 본인은 위 내용을 충분히 확인하였으며, 이에 동의하고 서명합니다.",
  },
  safety: {
    title: "안전교육일지",
    content:
      "본인은 오늘 근무를 시작하기 전 아래 안전수칙을 확인하였습니다.\n\n" +
      "1. 작업 전 안전모, 안전화 등 지급받은 보호구를 반드시 착용한다.\n" +
      "2. 컨베이어·설비 주변에서는 걸터앉거나 기대는 행위를 하지 않는다.\n" +
      "3. 중량물은 무리하게 혼자 옮기지 않고 2인 1조로 운반한다.\n" +
      "4. 현장 내 위험요소를 발견하면 즉시 관리감독자에게 보고한다.\n" +
      "5. 반복작업으로 인한 근골격계 질환 예방을 위해 적절히 휴식·스트레칭을 실시한다.\n\n" +
      "본인은 위 안전수칙을 확인하였으며, 이를 준수할 것을 서약하고 서명합니다.",
  },
};

export default function Home() {
  const { profile, user } = useAuth();
  const toast = useToast();
  const [workSite, setWorkSite] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState(null);
  const [loadingSite, setLoadingSite] = useState(true);
  const [savingSignature, setSavingSignature] = useState(false);
  const [now, setNow] = useState(new Date());
  const [pendingContracts, setPendingContracts] = useState(0);
  const [latestNotice, setLatestNotice] = useState(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [showChecklist, setShowChecklist] = useState(false);
  const [docStep, setDocStep] = useState(0);
  const [docRead, setDocRead] = useState({});
  const [docSignatures, setDocSignatures] = useState({});
  const [earlyLeaveOpen, setEarlyLeaveOpen] = useState(false);
  const [earlyLeaveReason, setEarlyLeaveReason] = useState("");
  const [earlyLeaveSaving, setEarlyLeaveSaving] = useState(false);
  const [myEarlyLeaveToday, setMyEarlyLeaveToday] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [pendingResignation, setPendingResignation] = useState(false);
  const [pendingSafetyCount, setPendingSafetyCount] = useState(0);
  const padRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTipIndex((i) => (i + 1) % SAFETY_TIPS.length), 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadSite() {
      if (!profile?.workSiteId) {
        setLoadingSite(false);
        return;
      }
      const snap = await getDoc(doc(db, "workSites", profile.workSiteId));
      setWorkSite(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoadingSite(false);
    }
    loadSite();
  }, [profile?.workSiteId]);

  useEffect(() => {
    if (!profile?.vendorId) return;
    getDoc(doc(db, "vendors", profile.vendorId)).then((snap) => {
      if (snap.exists()) setVendor({ id: snap.id, ...snap.data() });
    });
  }, [profile?.vendorId]);

  // 관리자가 스케줄등록에서 "출근확정" 처리한 날에만 출근 버튼이 동작해야
  // 하므로, 오늘 날짜의 스케줄 상태를 실시간으로 구독해둔다.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "schedules"), where("uid", "==", user.uid), where("date", "==", toDateKey())),
      (snap) => setTodaySchedule(snap.docs[0]?.data() || null)
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "contracts"), where("uid", "==", user.uid))).then((snap) => {
      setPendingContracts(snap.docs.filter((d) => d.data().status !== "signed").length);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "resignationRequests"), where("uid", "==", user.uid), where("status", "==", "employee_pending")),
      (snap) => setPendingResignation(!snap.empty)
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(
        collection(db, "leaves"),
        where("uid", "==", user.uid),
        where("type", "==", "조퇴"),
        where("startDate", "==", toDateKey())
      ),
      (snap) => setMyEarlyLeaveToday(snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null)
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      query(collection(db, "notifications"), where("uid", "==", user.uid), where("read", "==", false)),
      (snap) => setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [user]);

  const dismissNotification = (id) => updateDoc(doc(db, "notifications", id), { read: true });

  // 안전교육자료(지침/영상) 미이수 건수 — 하나라도 남아있으면 출근 버튼을
  // 막고 안전교육 페이지로 안내한다 (관리자가 등록한 필수 안전교육 이수 강제).
  useEffect(() => {
    if (!profile?.companyId || !user) return;
    let materialIds = [];
    let completedIds = new Set();
    const recompute = () => setPendingSafetyCount(materialIds.filter((id) => !completedIds.has(id)).length);
    const unsub1 = onSnapshot(
      query(collection(db, "safetyMaterials"), where("companyId", "==", profile.companyId), where("active", "==", true)),
      (snap) => {
        materialIds = snap.docs.map((d) => d.id);
        recompute();
      }
    );
    const unsub2 = onSnapshot(query(collection(db, "safetyCompletions"), where("uid", "==", user.uid)), (snap) => {
      completedIds = new Set(snap.docs.map((d) => d.data().materialId));
      recompute();
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [profile?.companyId, user]);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDocs(
      query(collection(db, "posts"), where("companyId", "==", profile.companyId), orderBy("createdAt", "desc"), limit(1))
    ).then((snap) => {
      if (!snap.empty) setLatestNotice({ id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, [profile?.companyId]);

  const canCheckIn = todaySchedule?.status === "출근확정";

  const { distance, accuracy, todayAttendance, permissionError, manualCheckIn, manualCheckOut, refreshToday, manualCheckInRadiusM } =
    useGeofenceCheckIn({
      uid: user?.uid,
      name: profile?.name,
      companyId: profile?.companyId,
      workSite,
      enabled: Boolean(workSite),
      canCheckIn,
    });

  const checkedIn = todayAttendance?.status === "출근" && todayAttendance?.checkInTime;
  const checkedOut = Boolean(todayAttendance?.checkOutTime);

  // 일용직은 근로계약동의서까지 매 출근 시 확인/서명해야 하고, 그 외
  // 근무형태는 안전교육일지만 확인/서명하면 된다.
  const requiredDocs = profile?.employmentType === "일용직" ? ["contract", "safety"] : ["safety"];
  const currentDocKey = requiredDocs[docStep];

  const openCheckIn = () => {
    if (!workSite || checkedIn) return;
    if (!canCheckIn) {
      toast.error("관리자가 오늘 출근확정 처리한 스케줄이 없습니다.");
      return;
    }
    if (pendingSafetyCount > 0) {
      toast.error("미이수 안전교육자료가 있습니다. 안전교육 메뉴에서 먼저 이수해주세요.");
      return;
    }
    setDocRead({});
    setDocSignatures({});
    setDocStep(0);
    setShowChecklist(true);
  };

  const markDocRead = () => setDocRead((r) => ({ ...r, [currentDocKey]: true }));

  const finalizeCheckIn = async (signatures) => {
    let extra = {};
    if (signatures.safety) {
      const manager = workSite ? await getPrimarySafetyManager(profile.companyId, workSite.id) : null;
      let supervisorSignature = null;
      let supervisorName = "";
      if (manager) {
        const sigSnap = await getDoc(doc(db, "adminSignatures", manager.adminUid));
        if (sigSnap.exists()) {
          supervisorSignature = sigSnap.data().signatureDataUrl || null;
          supervisorName = manager.adminName || sigSnap.data().name || "";
        }
      }
      extra = {
        ...extra,
        safetySignature: signatures.safety,
        safetySignedAt: new Date().toISOString(),
        supervisorSignature,
        supervisorName,
      };
    }
    if (signatures.contract) {
      extra = { ...extra, contractSignatureDataUrl: signatures.contract, contractSignedAt: new Date().toISOString() };
    }

    const result = await manualCheckIn(extra);
    if (result.ok) {
      setShowChecklist(false);
      return;
    }
    if (result.reason === "too-far") {
      toast.error(`근무지 반경 ${manualCheckInRadiusM}m 이내에서만 출근이 가능합니다.`);
    } else if (result.reason === "no-location") {
      if (workSite && (workSite.lat == null || workSite.lng == null)) {
        toast.error("이 근무지에는 위치 좌표가 설정되어 있지 않아 출근할 수 없습니다. 관리자에게 문의해주세요.");
      } else {
        toast.error("위치 확인 중입니다. 잠시 후 다시 시도해주세요.");
      }
    } else {
      toast.error("관리자가 오늘 출근확정 처리한 스케줄이 없습니다.");
    }
  };

  const submitDocSignature = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    const signatureDataUrl = padRef.current.getDataUrl();
    const nextSignatures = { ...docSignatures, [currentDocKey]: signatureDataUrl };
    setDocSignatures(nextSignatures);
    padRef.current.clear();

    if (docStep + 1 < requiredDocs.length) {
      setDocStep((s) => s + 1);
      return;
    }
    setSavingSignature(true);
    await finalizeCheckIn(nextSignatures);
    setSavingSignature(false);
  };

  const submitEarlyLeave = async (e) => {
    e.preventDefault();
    if (!earlyLeaveReason.trim()) return;
    setEarlyLeaveSaving(true);
    try {
      await addDoc(collection(db, "leaves"), {
        uid: user.uid,
        name: profile.name,
        companyId: profile.companyId,
        type: "조퇴",
        startDate: toDateKey(),
        endDate: toDateKey(),
        reason: earlyLeaveReason,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      toast.success("조퇴 신청이 접수되었습니다");
      setEarlyLeaveOpen(false);
      setEarlyLeaveReason("");
    } catch {
      toast.error("조퇴 신청에 실패했습니다.");
    } finally {
      setEarlyLeaveSaving(false);
    }
  };

  const ampm = now.getHours() < 12 ? "오전" : "오후";
  const hour12 = now.getHours() % 12 || 12;
  const timeStr = `${String(hour12).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${WEEKDAY_KR[now.getDay()]})`;
  const siteVendorLabel = [workSite?.name, vendor?.name].filter(Boolean).join(" · ") || "-";

  const inRadius = distance != null && distance <= manualCheckInRadiusM;
  const proximityPct = distance != null ? Math.max(6, Math.min(100, (manualCheckInRadiusM / Math.max(distance, manualCheckInRadiusM)) * 100)) : 0;

  return (
    <div className="space-y-4 px-4 pb-2 pt-4">
      <div className="-mx-4 -mt-4 rounded-b-[32px] bg-gradient-to-br from-primary via-primary to-primary-dark px-5 pb-7 pt-6 text-white shadow-lg shadow-primary/25">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-white/70">{ampm}</p>
            <p className="text-[2.75rem] font-bold leading-none tabular-nums tracking-tight">{timeStr}</p>
            <p className="mt-2 text-xs text-white/70">{dateStr}</p>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl backdrop-blur ${checkedIn ? "bg-white/20" : "bg-white/10"}`}>
            {checkedIn ? <CheckCircle2 size={20} /> : <Clock size={20} className="text-white/80" />}
          </div>
        </div>

        <div className="mt-4">
          {checkedIn ? (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
              <CheckCircle2 size={13} />
              출근완료 · {formatTime(todayAttendance.checkInTime)}
              {checkedOut && ` · 퇴근 ${formatTime(todayAttendance.checkOutTime)}`}
            </div>
          ) : canCheckIn ? (
            <p className="text-xs text-white/80">근무지 반경 {manualCheckInRadiusM}m 이내에서 출근 버튼을 눌러주세요</p>
          ) : (
            <p className="text-xs text-white/70">관리자가 오늘 출근확정 처리한 스케줄이 없습니다</p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={openCheckIn}
            disabled={!workSite || checkedIn}
            className={`relative flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl py-5 font-semibold transition-colors disabled:cursor-not-allowed ${
              !checkedIn && canCheckIn ? "bg-white text-primary shadow-lg shadow-black/10 hover:bg-white/90" : "bg-white/10 text-white/50"
            }`}
          >
            {canCheckIn && !checkedIn && (
              <span className="absolute inset-0 animate-ping rounded-2xl bg-white/40" style={{ animationDuration: "2.2s" }} />
            )}
            <span className="relative flex items-center gap-1.5 text-base">
              <LogIn size={18} /> 출근
            </span>
            <span className="relative text-[11px] font-medium tracking-wide opacity-70">IN</span>
          </button>
          <button
            type="button"
            onClick={manualCheckOut}
            disabled={!checkedIn || checkedOut}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/10 py-5 font-semibold text-white transition-colors hover:bg-white/20 disabled:text-white/40"
          >
            <span className="flex items-center gap-1.5 text-base">
              <LogOut size={18} /> 퇴근
            </span>
            <span className="text-[11px] font-medium tracking-wide opacity-70">OUT</span>
          </button>
        </div>

        {checkedIn && !checkedOut && (
          <div className="mt-3">
            {myEarlyLeaveToday ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs">
                <DoorOpen size={14} />
                {myEarlyLeaveToday.status === "pending" && <span className="font-medium">조퇴 승인대기 중</span>}
                {myEarlyLeaveToday.status === "approved" && <span className="font-medium">조퇴 승인완료</span>}
                {myEarlyLeaveToday.status === "rejected" && (
                  <span className="font-medium">
                    조퇴 반려됨{myEarlyLeaveToday.adminNote ? ` · ${myEarlyLeaveToday.adminNote}` : ""}
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEarlyLeaveOpen(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/20 py-2.5 text-xs font-medium text-white/90 hover:bg-white/10"
              >
                <DoorOpen size={14} /> 조퇴 신청
              </button>
            )}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card key={n.id} className="flex items-start gap-3 border border-primary/20 bg-primary-light/40 p-4">
              <Bell size={16} className="mt-0.5 shrink-0 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                {n.message && <p className="mt-0.5 text-xs text-muted">{n.message}</p>}
              </div>
              <button type="button" className="shrink-0 text-muted hover:text-ink" onClick={() => dismissNotification(n.id)}>
                <X size={14} />
              </button>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden border-none bg-gradient-to-br from-rose-500 to-rose-600 p-5 text-white shadow-lg shadow-rose-500/25">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-white/85">
          <ShieldAlert size={13} /> 오늘도 안전하게!
        </p>
        <p className="text-sm font-semibold leading-relaxed">{SAFETY_TIPS[tipIndex]}</p>
        <div className="mt-3 flex justify-center gap-1.5">
          {SAFETY_TIPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === tipIndex ? "w-4 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      </Card>

      <div className="space-y-2">
        {pendingSafetyCount > 0 && (
          <Link to="/safety">
            <Card className="flex items-center gap-3 border border-danger/20 bg-red-50 p-4">
              <ShieldAlert size={18} className="shrink-0 text-danger" />
              <p className="flex-1 text-xs text-ink">미이수 안전교육자료 {pendingSafetyCount}건이 있습니다. 이수하지 않으면 출근할 수 없습니다.</p>
            </Card>
          </Link>
        )}

        {pendingContracts > 0 && (
          <Link to="/contracts">
            <Card className="flex items-center gap-3 p-4">
              <FileSignature size={18} className="shrink-0 text-primary" />
              <p className="flex-1 text-xs text-ink">작성할 계약서가 있습니다. 완료해주세요.</p>
            </Card>
          </Link>
        )}

        {pendingResignation && (
          <Link to="/resignation">
            <Card className="flex items-center gap-3 border border-danger/20 bg-red-50 p-4">
              <FileSignature size={18} className="shrink-0 text-danger" />
              <p className="flex-1 text-xs text-ink">서명이 필요한 사직서가 있습니다. 확인해주세요.</p>
            </Card>
          </Link>
        )}

        {latestNotice && (
          <Link to="/board">
            <Card className="flex items-center gap-3 p-4">
              <Megaphone size={18} className="shrink-0 text-primary" />
              <p className="flex-1 truncate text-xs text-ink">[공지] {latestNotice.title}</p>
            </Card>
          </Link>
        )}
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-light text-primary">
            <MapPin size={15} />
          </div>
          근무지 정보
        </div>
        {loadingSite ? (
          <p className="text-xs text-muted">불러오는 중...</p>
        ) : workSite ? (
          <div className="space-y-2">
            <p className="text-base font-bold text-ink">{workSite.name}</p>
            {workSite.lat == null || workSite.lng == null ? (
              <p className="flex items-center gap-1.5 text-xs text-danger">
                <Navigation size={13} /> 이 근무지에는 위치 좌표가 설정되어 있지 않습니다. 관리자에게 문의해주세요.
              </p>
            ) : distance != null ? (
              <div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <Navigation size={13} /> 현재 위치까지 약 {Math.round(distance)}m
                    {accuracy != null && <span className="text-muted/70"> (오차범위 ±{Math.round(accuracy)}m)</span>}
                  </span>
                  <span className={`font-semibold ${inRadius ? "text-primary" : "text-muted"}`}>{inRadius ? "반경 안" : "반경 밖"}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all ${inRadius ? "bg-primary" : "bg-slate-300"}`}
                    style={{ width: `${proximityPct}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted">위치 확인 중...</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-warning">관리자가 아직 근무지를 배정하지 않았습니다.</p>
        )}
        {permissionError && (
          <p className="mt-2 text-xs text-danger">위치 권한을 확인해주세요: {permissionError}</p>
        )}
      </Card>

      <Modal
        open={showChecklist}
        onClose={() => setShowChecklist(false)}
        title={`서류작성 (${docStep + 1}/${requiredDocs.length}) · ${currentDocKey ? DOC_META[currentDocKey].title : ""}`}
        footer={
          docRead[currentDocKey] ? null : (
            <Button className="w-full" onClick={markDocRead}>
              내용을 확인했습니다
            </Button>
          )
        }
      >
        {currentDocKey && (
          <div className="space-y-3">
            <p className="text-xs text-muted">{siteVendorLabel}</p>
            <div className="max-h-60 overflow-y-auto whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-ink">
              {DOC_META[currentDocKey].content}
            </div>
            {docRead[currentDocKey] && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">서명</p>
                <SignaturePad ref={padRef} onSave={submitDocSignature} saving={savingSignature} />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={earlyLeaveOpen}
        onClose={() => setEarlyLeaveOpen(false)}
        title="조퇴 신청"
        footer={
          <>
            <Button variant="outline" onClick={() => setEarlyLeaveOpen(false)}>
              취소
            </Button>
            <Button onClick={submitEarlyLeave} disabled={!earlyLeaveReason.trim() || earlyLeaveSaving}>
              {earlyLeaveSaving ? "신청 중..." : "신청하기"}
            </Button>
          </>
        }
      >
        <form onSubmit={submitEarlyLeave} className="space-y-3">
          <p className="text-xs text-muted">사유를 입력하면 관리자에게 조퇴요청이 전달됩니다. 승인/반려 결과는 알림으로 안내됩니다.</p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">사유</span>
            <textarea
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm"
              rows={3}
              value={earlyLeaveReason}
              onChange={(e) => setEarlyLeaveReason(e.target.value)}
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
