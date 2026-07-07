import { CheckCircle2, XCircle } from "lucide-react";

const TONE = {
  success: { icon: CheckCircle2, className: "border-primary/20 bg-white text-ink", iconClassName: "text-success" },
  error: { icon: XCircle, className: "border-danger/20 bg-white text-ink", iconClassName: "text-danger" },
};

// Stack of transient success/error banners, top-right of the viewport.
// Presentational only — ToastProvider (useToast.jsx) owns the queue/timers.
export default function ToastStack({ toasts }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed right-4 top-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => {
        const { icon: Icon, className, iconClassName } = TONE[t.tone] || TONE.success;
        return (
          <div key={t.id} className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg ${className}`}>
            <Icon size={18} className={`shrink-0 ${iconClassName}`} />
            <span className="flex-1">{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
