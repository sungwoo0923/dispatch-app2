import { X } from "lucide-react";

// Wide, right-anchored slide-in panel (registration/detail forms), as
// opposed to Modal's small centered dialog — matches the reference guide's
// 근로자등록 상세 screen (dark header bar with breadcrumb + close, full-width
// horizontal sections, sticky footer action button).
export default function SidePanel({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="flex h-full w-full max-w-5xl flex-col bg-surface shadow-2xl">
        <div className="flex items-center gap-3 bg-primary-dark px-5 py-4 text-white">
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={20} />
          </button>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
