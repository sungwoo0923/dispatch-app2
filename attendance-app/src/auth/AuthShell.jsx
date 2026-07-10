import LanguagePicker from "../components/LanguagePicker";
import LoginCarousel from "../components/LoginCarousel";

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-1/2 lg:block">
        <LoginCarousel />
      </div>

      <div className="flex w-full items-center justify-center px-6 py-14 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-4 flex justify-end">
            <LanguagePicker />
          </div>
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <img src="/logo.png" alt="KP-Work" className="h-20 w-auto" />
          </div>
          {subtitle && <p className="mb-1 text-xs font-medium text-primary">{subtitle}</p>}
          {title && <h2 className="mb-6 text-xl font-bold text-ink">{title}</h2>}
          {children}
        </div>
      </div>
    </div>
  );
}

export function FormField({ label, ...props }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary-light"
        {...props}
      />
    </label>
  );
}
