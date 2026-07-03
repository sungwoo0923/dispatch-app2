const VARIANTS = {
  primary: "bg-primary text-white hover:bg-primary-dark disabled:bg-slate-300",
  outline: "border border-slate-200 text-ink bg-white hover:bg-slate-50",
  success: "bg-success text-white hover:bg-primary disabled:bg-slate-300",
  ghost: "text-primary hover:bg-primary-light",
  danger: "bg-danger text-white hover:bg-red-700",
};

export default function Button({
  as: As = "button",
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}) {
  const sizeClass = size === "lg" ? "px-5 py-3 text-base" : size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm";
  return (
    <As
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </As>
  );
}
