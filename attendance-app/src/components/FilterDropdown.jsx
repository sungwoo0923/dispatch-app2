import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

// Compact multi-select filter button used by the "N선택" filter-bar pattern:
// instead of a row of always-visible <select> elements that wrap on
// narrower screens, each filter category collapses into one button showing
// how many values are picked, opening a checkbox popover on click.
export default function FilterDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex flex-nowrap items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm ${
          selected.length ? "border-primary bg-primary-light text-primary" : "border-slate-200 bg-white text-ink"
        }`}
      >
        {label}
        {selected.length > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-white">{selected.length}</span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {options.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">항목이 없습니다.</p>}
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-primary hover:bg-primary-light" onClick={() => onChange([])}>
              초기화
            </button>
          )}
        </div>
      )}
    </div>
  );
}
