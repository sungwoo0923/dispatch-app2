const TONES = {
  success: "bg-primary text-white",
  warning: "bg-slate-100 text-warning",
  danger: "bg-red-50 text-danger",
  primary: "bg-primary-light text-primary",
  muted: "bg-slate-100 text-muted",
};

export default function Badge({ tone = "muted", className = "", children }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}
