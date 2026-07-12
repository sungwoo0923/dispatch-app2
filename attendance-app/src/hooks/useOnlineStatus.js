import { useEffect, useState } from "react";

// 창고/물류 현장은 실내 와이파이 음영지역이 흔해, 오프라인 상태에서도
// 화면이 멀쩡해 보여 사용자가 못 눈치채고 출퇴근/신청이 반영 안 된 줄
// 모르는 경우를 막기 위한 상태 배너용 훅.
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
