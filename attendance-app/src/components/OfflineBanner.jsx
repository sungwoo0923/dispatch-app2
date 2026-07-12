import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

// 오프라인이 되면 상단에 항상 보이는 얇은 경고바를 띄운다 — 창고/현장
// 와이파이 음영지역에서 화면은 멀쩡해 보이지만 출퇴근/신청이 실제로는
// 서버에 반영되지 않고 있는 상황을 사용자가 바로 알아챌 수 있게 한다.
export default function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 bg-danger px-3 py-1.5 text-[11px] font-semibold text-white print:hidden">
      <WifiOff size={12} /> 인터넷 연결이 끊겼습니다 — 연결되면 자동으로 다시 반영됩니다
    </div>
  );
}
