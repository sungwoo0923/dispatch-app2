import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown } from "lucide-react";

// "정렬" 버튼 — FilterDropdown.jsx와 동일한 이유로 포털을 써서 렌더링한다.
// 이 버튼이 놓이는 목록 헤더 줄은 overflow-x-auto라 일반 absolute 팝오버는
// 세로로도 함께 잘려 보인다(가로 스크롤 하나만 설정해도 브라우저가 세로
// overflow를 auto로 암시 처리하기 때문). 포털로 body에 직접 붙이고 버튼의
// 실제 화면 좌표를 fixed로 계산해 그 문제를 피한다.
export default function SortMenuButton({ sort, setSort, options }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const updatePos = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 224) });
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

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={toggleOpen}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium ${
          sort.key ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-ink"
        }`}
      >
        <ArrowUpDown size={13} /> 정렬
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[80] w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
            style={{ top: pos.top, left: pos.left }}
          >
            <label className="mb-2 block">
              <span className="mb-1 block text-[11px] font-medium text-muted">정렬 기준</span>
              <select
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm"
                value={sort.key}
                onChange={(e) => setSort((s) => ({ ...s, key: e.target.value }))}
              >
                <option value="">기본순서</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${sort.dir === "asc" ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}
                onClick={() => setSort((s) => ({ ...s, dir: "asc" }))}
              >
                오름차순
              </button>
              <button
                type="button"
                className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${sort.dir === "desc" ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-muted"}`}
                onClick={() => setSort((s) => ({ ...s, dir: "desc" }))}
              >
                내림차순
              </button>
            </div>
            {sort.key && (
              <button
                type="button"
                className="mt-2 w-full text-center text-xs font-medium text-muted hover:text-danger"
                onClick={() => setSort({ key: "", dir: "asc" })}
              >
                정렬 해제
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
