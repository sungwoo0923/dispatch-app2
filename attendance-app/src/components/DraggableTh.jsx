import { useState } from "react";
import { GripVertical, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// 드래그로 순서를 바꿀 수 있는 표 헤더 셀. 마우스로 컬럼명을 눌러 다른 컬럼
// 자리로 끌어놓으면 onMove(draggedKey, targetKey)가 호출되어 컬럼 순서 전체를
// 재배치한다. sortKey/sort/onSort를 함께 넘기면 컬럼명 클릭으로 정렬도
// 겸할 수 있다(드래그 제스처와 클릭은 브라우저가 알아서 구분해준다).
export default function DraggableTh({ columnKey, onMove, className = "", children, sortKey, sort, onSort }) {
  const [dragOver, setDragOver] = useState(false);
  const sortable = Boolean(sortKey && onSort);
  const active = sortable && sort?.key === sortKey;

  return (
    <th
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", columnKey);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const fromKey = e.dataTransfer.getData("text/plain");
        if (fromKey) onMove(fromKey, columnKey);
      }}
      className={`relative cursor-move select-none whitespace-nowrap ${dragOver ? "bg-primary-light/60" : ""} ${className}`}
      title="끌어서 순서를 바꿀 수 있습니다"
    >
      <GripVertical size={11} className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 shrink-0 text-slate-300" />
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort({ key: sortKey, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
          className="inline-flex items-center gap-1 hover:text-ink"
        >
          {children}
          {active ? (
            sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
          ) : (
            <ChevronsUpDown size={12} className="text-slate-300" />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
}
