import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import {
  MapPin,
  Navigation,
  ShieldCheck,
  FileSignature,
  Megaphone,
  Sparkles,
  LogIn,
  LogOut,
} from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useGeofenceCheckIn } from "../hooks/useGeofenceCheckIn";
import Card from "../components/Card";
import Button from "../components/Button";
import Modal from "../components/Modal";
import SignaturePad from "../components/SignaturePad";
import { formatTime, attendanceDocId, toDateKey } from "../utils/dateUtils";
import { signSafetyAttendance } from "../utils/safety";

const ONBOARDING_DISMISSED_KEY = "kpwork_onboarding_dismissed";
const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];
const SAFETY_TIPS = [
  "레일 작업 중 레일에 기대지마세요.",
  "안전모와 안전화를 반드시 착용하세요.",
  "무리한 중량물은 2인 1조로 운반하세요.",
];

export default function Home() {
  const { profile, user } = useAuth();
  const [workSite, setWorkSite] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [loadingSite, setLoadingSite] = useState(true);
  const [savingSignature, setSavingSignature] = useState(false);
  const [now, setNow] = useState(new Date());
  const [pendingContracts, setPendingContracts] = useState(0);
  const [latestNotice, setLatestNotice] = useState(null);
  const [tipIndex, setTipIndex] = useState(0);
  const [showChecklist, setShowChecklist] = useState(false);
  const [checklist, setChecklist] = useState({ contract: false, safety: false });
  const [showOnboarding, setShowOnboarding] = useState(
    () => typeof window !== "undefined" && !window.localStorage.getItem(ONBOARDING_DISMISSED_KEY)
  );
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

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "contracts"), where("uid", "==", user.uid))).then((snap) => {
      setPendingContracts(snap.docs.filter((d) => d.data().status !== "signed").length);
    });
  }, [user]);

  useEffect(() => {
    if (!profile?.companyId) return;
    getDocs(
      query(collection(db, "posts"), where("companyId", "==", profile.companyId), orderBy("createdAt", "desc"), limit(1))
    ).then((snap) => {
      if (!snap.empty) setLatestNotice({ id: snap.docs[0].id, ...snap.docs[0].data() });
    });
  }, [profile?.companyId]);

  const { distance, todayAttendance, permissionError, manualCheckIn, manualCheckOut, refreshToday } =
    useGeofenceCheckIn({
      uid: user?.uid,
      name: profile?.name,
      companyId: profile?.companyId,
      workSite,
      enabled: Boolean(workSite),
    });

  const checkedIn = todayAttendance?.status === "출근" && todayAttendance?.checkInTime;
  const checkedOut = Boolean(todayAttendance?.checkOutTime);
  const needsSafetySign = checkedIn && workSite?.safetyManaged && !todayAttendance?.safetySignature;

  const openCheckIn = () => {
    if (!workSite || checkedIn) return;
    setChecklist({ contract: false, safety: false });
    setShowChecklist(true);
  };

  const confirmCheckIn = async () => {
    setShowChecklist(false);
    await manualCheckIn();
  };

  const submitSafetySignature = async () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    setSavingSignature(true);
    await signSafetyAttendance({
      attendanceDocId: attendanceDocId(user.uid, toDateKey()),
      companyId: profile.companyId,
      siteId: workSite.id,
      signatureDataUrl: padRef.current.getDataUrl(),
    });
    setSavingSignature(false);
    refreshToday();
  };

  const dismissOnboarding = () => {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1");
    setShowOnboarding(false);
  };

  const ampm = now.getHours() < 12 ? "오전" : "오후";
  const hour12 = now.getHours() % 12 || 12;
  const timeStr = `${String(hour12).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${WEEKDAY_KR[now.getDay()]})`;
  const siteVendorLabel = [workSite?.name, vendor?.name].filter(Boolean).join(" · ") || "-";

  return (
    <div className="space-y-4 px-4 pt-4">
      <Card className="p-5 text-center">
        <p className="text-sm font-medium text-muted">{ampm}</p>
        <p className="text-4xl font-bold tabular-nums text-ink">{timeStr}</p>
        <p className="mt-1 text-xs text-muted">{dateStr}</p>

        <div className="mt-3">
          {checkedIn ? (
            <p className="text-sm font-semibold text-success">
              출근완료 · {formatTime(todayAttendance.checkInTime)}
              {checkedOut && ` · 퇴근 ${formatTime(todayAttendance.checkOutTime)}`}
            </p>
          ) : (
            <p className="text-xs text-muted">근무지 반경에 들어오면 자동으로 출근 처리됩니다</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={openCheckIn}
            disabled={!workSite || checkedIn}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-primary py-5 text-white transition-colors hover:bg-primary-dark disabled:bg-slate-300"
          >
            <span className="flex items-center gap-1.5 text-base font-semibold">
              <LogIn size={18} /> 출근
            </span>
            <span className="text-[11px] font-medium tracking-wide opacity-80">IN</span>
          </button>
          <button
            type="button"
            onClick={manualCheckOut}
            disabled={!checkedIn || checkedOut}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-purple-600 py-5 text-white transition-colors hover:bg-purple-700 disabled:bg-slate-300"
          >
            <span className="flex items-center gap-1.5 text-base font-semibold">
              <LogOut size={18} /> 퇴근
            </span>
            <span className="text-[11px] font-medium tracking-wide opacity-80">OUT</span>
          </button>
        </div>
      </Card>

      <Card className="bg-rose-50 p-5">
        <p className="mb-1 text-xs font-semibold text-rose-500">오늘도 안전하게!</p>
        <p className="text-sm font-semibold leading-relaxed text-ink">{SAFETY_TIPS[tipIndex]}</p>
        <div className="mt-3 flex justify-center gap-1.5">
          {SAFETY_TIPS.map((_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === tipIndex ? "bg-rose-400" : "bg-rose-200"}`} />
          ))}
        </div>
      </Card>

      {needsSafetySign && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck size={16} className="text-primary" />
            안전교육 서명이 필요합니다
          </div>
          <p className="mb-3 text-xs text-muted">이 근무지는 안전관리가 적용됩니다. 출근 확인을 위해 서명해주세요.</p>
          <SignaturePad ref={padRef} />
          <Button className="mt-3 w-full" onClick={submitSafetySignature} disabled={savingSignature}>
            {savingSignature ? "제출 중..." : "서명 제출"}
          </Button>
        </Card>
      )}

      <div className="space-y-2">
        {pendingContracts > 0 && (
          <Link to="/contracts">
            <Card className="flex items-center gap-3 p-4">
              <FileSignature size={18} className="shrink-0 text-primary" />
              <p className="flex-1 text-xs text-ink">작성할 계약서(사직서) 있습니다. 완료해주세요.</p>
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

        {showOnboarding && (
          <Card className="flex items-center gap-3 p-4">
            <Sparkles size={18} className="shrink-0 text-primary" />
            <p className="flex-1 text-xs text-ink">오늘도 출근이 처음이신가요?</p>
            <button className="shrink-0 text-xs font-medium text-muted" onClick={dismissOnboarding}>
              Skip
            </button>
          </Card>
        )}
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <MapPin size={16} className="text-primary" />
          근무지 정보
        </div>
        {loadingSite ? (
          <p className="text-xs text-muted">불러오는 중...</p>
        ) : workSite ? (
          <div className="space-y-1.5 text-sm text-muted">
            <p className="text-ink">{workSite.name}</p>
            <div className="flex items-center gap-1.5">
              <Navigation size={14} />
              {distance != null ? (
                <span>현재 위치까지 약 {Math.round(distance)}m</span>
              ) : (
                <span>위치 확인 중...</span>
              )}
            </div>
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
        title="서류작성"
        footer={
          <Button
            className="w-full"
            onClick={confirmCheckIn}
            disabled={!checklist.contract || !checklist.safety}
          >
            출근완료
          </Button>
        }
      >
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={checklist.contract}
              onChange={(e) => setChecklist((c) => ({ ...c, contract: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium text-ink">[필수] 근로계약 및 개인정보 수집 동의서</p>
              <p className="mt-0.5 text-xs text-muted">{siteVendorLabel}</p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={checklist.safety}
              onChange={(e) => setChecklist((c) => ({ ...c, safety: e.target.checked }))}
            />
            <div>
              <p className="text-sm font-medium text-ink">[필수] 안전교육일지</p>
              <p className="mt-0.5 text-xs text-muted">{siteVendorLabel}</p>
            </div>
          </label>
        </div>
      </Modal>
    </div>
  );
}
