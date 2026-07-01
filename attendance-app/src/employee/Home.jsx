import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { CheckCircle2, MapPin, Clock, Navigation } from "lucide-react";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { useGeofenceCheckIn } from "../hooks/useGeofenceCheckIn";
import Card from "../components/Card";
import Button from "../components/Button";
import { formatTime } from "../utils/dateUtils";

export default function Home() {
  const { profile, user } = useAuth();
  const [workSite, setWorkSite] = useState(null);
  const [loadingSite, setLoadingSite] = useState(true);

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

  const { distance, todayAttendance, permissionError, manualCheckIn, manualCheckOut } = useGeofenceCheckIn({
    uid: user?.uid,
    name: profile?.name,
    companyId: profile?.companyId,
    workSite,
    enabled: Boolean(workSite),
  });

  const checkedIn = todayAttendance?.status === "출근" && todayAttendance?.checkInTime;
  const checkedOut = Boolean(todayAttendance?.checkOutTime);

  return (
    <div className="space-y-4 px-4 pt-4">
      <Card className="p-5">
        <p className="mb-1 text-xs text-muted">오늘 근무</p>
        {checkedIn ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-success">출근완료</p>
              <p className="mt-1 text-xs text-muted">출근시간 {formatTime(todayAttendance.checkInTime)}</p>
            </div>
            <CheckCircle2 className="text-success" size={40} />
          </div>
        ) : (
          <div>
            <p className="text-xl font-bold text-ink">출근 전</p>
            <p className="mt-1 text-xs text-muted">근무지 반경에 들어오면 자동으로 출근 처리됩니다</p>
          </div>
        )}

        {checkedOut && (
          <p className="mt-2 text-xs text-muted">퇴근시간 {formatTime(todayAttendance.checkOutTime)}</p>
        )}

        <div className="mt-4 flex gap-2">
          {!checkedIn && (
            <Button className="flex-1" size="lg" onClick={manualCheckIn} disabled={!workSite}>
              수동 출근
            </Button>
          )}
          {checkedIn && !checkedOut && (
            <Button variant="outline" className="flex-1" size="lg" onClick={manualCheckOut}>
              수동 퇴근
            </Button>
          )}
        </div>
      </Card>

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

      <Card className="flex items-center gap-3 p-4">
        <Clock size={18} className="text-primary" />
        <p className="text-xs text-muted">자동출근은 근무지 반경 100m 이내 진입 시 처리됩니다.</p>
      </Card>
    </div>
  );
}
