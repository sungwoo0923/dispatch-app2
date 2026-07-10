import { CheckCircle2, MapPin, Wallet, CalendarClock } from "lucide-react";
import LanguagePicker from "../components/LanguagePicker";

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary to-primary-dark p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10">
          <div className="mb-12 inline-flex items-center rounded-2xl bg-white/95 px-4 py-3 shadow-lg shadow-black/10">
            <img src="/logo.png" alt="KP-Work" className="h-14 w-auto" />
          </div>
          <h1 className="max-w-sm text-3xl font-bold leading-snug">
            출근부터 급여정산까지,
            <br />
            한 번에 관리하세요
          </h1>
          <p className="mt-4 max-w-sm text-sm text-white/80">
            위치 기반 자동출근, 실시간 근태 현황, 연차·급여관리까지 — 도급직원 관리에 필요한 모든 기능을 하나의 앱으로.
          </p>
        </div>

        <div className="relative z-10 mx-auto w-56 rounded-[28px] bg-white/10 p-3">
          <div className="rounded-2xl bg-white p-4 text-ink shadow-xl">
            <p className="text-[11px] text-muted">오늘 근무</p>
            <p className="mt-1 text-lg font-bold text-primary">출근완료</p>
            <p className="mt-1 text-[11px] text-muted">출근시간 08:58</p>
            <div className="mt-3 flex items-center justify-center rounded-xl bg-primary-light py-2.5">
              <CheckCircle2 size={22} className="text-primary" />
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-center gap-5 text-xs text-white/80">
          <span className="flex items-center gap-1.5">
            <MapPin size={14} /> 자동출근
          </span>
          <span className="flex items-center gap-1.5">
            <Wallet size={14} /> 급여관리
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarClock size={14} /> 연차관리
          </span>
        </div>
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
