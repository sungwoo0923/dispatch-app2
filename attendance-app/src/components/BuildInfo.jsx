import { useEmulator } from "../firebase";

// Shows which build is actually live (Login screen, admin sidebar, employee
// 내정보) so "did my deploy actually go out" is a glance, not a guess. Also
// surfaces the single most common mis-deploy: shipping a production build
// that was compiled without real Firebase keys in .env.local, which silently
// points the app at a local emulator that doesn't exist for real visitors.
export default function BuildInfo({ className = "" }) {
  const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  const buildTime = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : null;
  const buildLabel = buildTime
    ? new Date(buildTime).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
    : null;
  const isLocalHost =
    typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const showEmulatorWarning = useEmulator && !isLocalHost;

  return (
    <div className={`text-center text-[10px] text-slate-300 ${className}`}>
      <p className="font-medium">버전 {version}</p>
      {buildLabel && <p>{buildLabel}</p>}
      {showEmulatorWarning && (
        <p className="mt-1 font-semibold text-danger">
          ⚠ 에뮬레이터 모드로 빌드됨 — .env.local에 실제 Firebase 키가 없습니다
        </p>
      )}
    </div>
  );
}
