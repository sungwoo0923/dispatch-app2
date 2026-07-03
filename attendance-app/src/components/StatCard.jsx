import Card from "./Card";

export default function StatCard({ icon: Icon, label, value, tone = "primary", suffix }) {
  const toneClass = {
    primary: "bg-primary-light text-primary",
    success: "bg-primary text-white",
    warning: "bg-slate-100 text-warning",
    danger: "bg-red-50 text-danger",
  }[tone];

  return (
    <Card className="flex items-center gap-3 p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-semibold text-ink">
          {value}
          {suffix && <span className="ml-1 text-xs font-normal text-muted">{suffix}</span>}
        </p>
      </div>
    </Card>
  );
}
