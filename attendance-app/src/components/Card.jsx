export default function Card({ className = "", children, ...props }) {
  return (
    <div className={`rounded-2xl bg-white shadow-card border border-slate-100 ${className}`} {...props}>
      {children}
    </div>
  );
}
