const TONES = {
  success: "bg-green-50 text-success",
  warning: "bg-amber-50 text-warning",
  danger: "bg-red-50 text-danger",
  primary: "bg-primary-light text-primary",
  muted: "bg-slate-100 text-muted",
};

export default function Badge({ tone = "muted", className = "", children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
