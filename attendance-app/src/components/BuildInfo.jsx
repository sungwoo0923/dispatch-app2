import { useState } from "react";
import { RefreshCw, CheckCircle2, Sparkles } from "lucide-react";
import { useEmulator } from "../firebase";
import { useAppUpdate } from "../hooks/useAppUpdate";

// Shows which build is actually live (Login screen, admin sidebar, employee
// 내정보) so "did my deploy actually go out" is a glance, not a guess. Also
// surfaces the single most common mis-deploy: shipping a production build
// that was compiled without real Firebase keys in .env.local, which silently
// points the app at a local emulator that doesn't exist for real visitors.
//
// "업데이트 확인" 버튼도 여기 함께 둔다 — 상단 배너(UpdateBanner)는 새
// 버전이 스스로 감지됐을 때만 뜨는데, 그와 별개로 사용자가 직접 "지금
// 최신인지" 확인하고 싶을 때를 위한 수동 버튼이다. PC 관리자 사이드바와
// 모바일 내정보 화면 둘 다 이 컴포넌트를 그대로 쓰므로 한 번만 만들면 된다.
export default function BuildInfo({ className = "" }) {
  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  const buildTime = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : null;
  const buildLabel = buildTime
    ? new Date(buildTime).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
    : null;
  const isLocalHost =
    typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const showEmulatorWarning = useEmulator && !isLocalHost;

  const { needRefresh, applyUpdate, checkForUpdate } = useAppUpdate();
  const [checking, setChecking] = useState(false);
  const [upToDate, setUpToDate] = useState(false);

  const handleClick = async () => {
    if (needRefresh) {
      applyUpdate();
      return;
    }
    setChecking(true);
    setUpToDate(false);
    const { hasUpdate } = await checkForUpdate();
    setChecking(false);
    if (!hasUpdate) {
      setUpToDate(true);
      setTimeout(() => setUpToDate(false), 3000);
    }
  };

  return (
    <div className={`text-center ${className}`}>
      <div className="inline-flex flex-col items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
        <div className="text-[10px] text-slate-400">
          <p className="font-semibold text-slate-500">버전 {version}</p>
          {buildLabel && <p>{buildLabel}</p>}
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={checking}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
            needRefresh
              ? "bg-primary text-white hover:bg-primary-dark"
              : "border border-slate-200 text-slate-500 hover:bg-white"
          } disabled:opacity-60`}
        >
          {checking ? (
            <>
              <RefreshCw size={11} className="animate-spin" /> 확인 중...
            </>
          ) : needRefresh ? (
            <>
              <Sparkles size={11} /> 새 버전으로 업데이트
            </>
          ) : (
            <>
              <RefreshCw size={11} /> 업데이트 확인
            </>
          )}
        </button>
        {upToDate && (
          <p className="flex items-center gap-1 text-[10px] font-medium text-primary">
            <CheckCircle2 size={11} /> 지금이 최신 버전입니다
          </p>
        )}
      </div>
      {showEmulatorWarning && (
        <p className="mt-1 text-[10px] font-semibold text-danger">
          ⚠ 에뮬레이터 모드로 빌드됨 — .env.local에 실제 Firebase 키가 없습니다
        </p>
      )}
    </div>
  );
}
