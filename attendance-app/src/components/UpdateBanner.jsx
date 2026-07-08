import { RefreshCw, X } from "lucide-react";
import { useAppUpdate } from "../hooks/useAppUpdate";

export default function UpdateBanner() {
  const { needRefresh, applyUpdate, dismiss } = useAppUpdate();
  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[999] flex animate-[slidedown_0.35s_ease-out] items-center justify-center gap-3 bg-ink px-4 py-2.5 text-white shadow-lg">
      <style>{`@keyframes slidedown { from { opacity: 0; transform: translateY(-100%); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <span className="flex items-center gap-2 text-xs font-semibold">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />새 버전이 준비되었습니다
      </span>
      <button
        type="button"
        onClick={applyUpdate}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-ink hover:bg-slate-100"
      >
        <RefreshCw size={12} /> 업데이트
      </button>
      <button type="button" onClick={dismiss} className="shrink-0 text-white/50 hover:text-white" title="닫기">
        <X size={16} />
      </button>
    </div>
  );
}
