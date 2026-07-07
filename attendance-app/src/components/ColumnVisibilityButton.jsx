import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Columns3 } from "lucide-react";

// 표 우측 상단에 두는 "표시항목" 버튼 — 누르면 컬럼별 체크박스 팝오버가 뜨고,
// 체크 해제한 컬럼은 표에서 바로 숨겨진다(선택 즉시 반영/저장).
export default function ColumnVisibilityButton({ columns, hidden, toggleColumn }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const toggleOpen = () => {
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 208) });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-slate-50"
      >
        <Columns3 size={13} /> 표시항목
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[80] max-h-72 w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
            style={{ top: pos.top, left: pos.left }}
          >
            {columns.map((c) => (
              <label key={c.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={!hidden.includes(c.key)} onChange={() => toggleColumn(c.key)} />
                {c.label}
              </label>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
