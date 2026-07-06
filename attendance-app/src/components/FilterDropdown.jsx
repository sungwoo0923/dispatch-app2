import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

// Compact multi-select filter button used by the "N선택" filter-bar pattern:
// instead of a row of always-visible <select> elements that wrap on
// narrower screens, each filter category collapses into one button showing
// how many values are picked, opening a checkbox popover on click. The
// popover is rendered through a portal (fixed-positioned against the
// button's own bounding rect) because the filter row it lives in scrolls
// horizontally (overflow-x-auto) — an in-place absolutely-positioned popover
// would get silently clipped by that ancestor's implicit overflow-y instead
// of showing up.
export default function FilterDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const updatePos = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left });
  };

  const toggleOpen = () => {
    if (!open) updatePos();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onReposition = () => updatePos();
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={`flex flex-nowrap items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-sm ${
          selected.length ? "border-primary bg-primary-light text-primary" : "border-slate-200 bg-white text-ink"
        }`}
      >
        {label}
        {selected.length > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-white">{selected.length}</span>}
        <ChevronDown size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[80] max-h-64 w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
            style={{ top: pos.top, left: pos.left }}
          >
            {options.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">항목이 없습니다.</p>}
            {options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.label}
              </label>
            ))}
            {selected.length > 0 && (
              <button
                type="button"
                className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-primary hover:bg-primary-light"
                onClick={() => onChange([])}
              >
                초기화
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
