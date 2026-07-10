import { useEffect } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

// Wide, right-anchored slide-in panel (registration/detail forms), as
// opposed to Modal's small centered dialog — matches the reference guide's
// 근로자등록 상세 screen (dark header bar with breadcrumb + close, full-width
// horizontal sections, sticky footer action button). 원래 PC 전용으로
// 만들어져 안전영역(노치/홈 인디케이터) 여백과 배경 스크롤 잠금이 없었는데,
// 모바일 관리자 화면 일부가 이 컴포넌트를 그대로 쓰면서 상단바가 iPhone
// 상태바에 가려지고 배경이 함께 스크롤되는 문제가 있어 Modal과 동일한
// 처리를 추가했다.
export default function SidePanel({ open, onClose, title, children, footer }) {
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="flex h-full w-full max-w-5xl flex-col bg-surface shadow-2xl">
        <div
          className="flex items-center gap-3 bg-primary-dark px-5 py-4 text-white"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
        >
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={20} />
          </button>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3.5"
            style={{ paddingBottom: "max(0.875rem, calc(env(safe-area-inset-bottom) + 0.5rem))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
