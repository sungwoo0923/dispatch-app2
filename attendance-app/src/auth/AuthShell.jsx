import { CalendarCheck2 } from "lucide-react";

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white">
            <CalendarCheck2 size={28} />
          </div>
          <h1 className="text-xl font-bold text-ink">KP-work</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-card border border-slate-100">
          {title && <h2 className="mb-4 text-base font-semibold text-ink">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function FormField({ label, ...props }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-light"
        {...props}
      />
    </label>
  );
}
