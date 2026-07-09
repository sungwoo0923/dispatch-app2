import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

// 클릭하면 정렬, 다시 클릭하면 반대방향 정렬되는 표 헤더 셀. sort/onSort는
// { key, dir } 형태를 공유하며, 같은 key를 다시 누르면 asc<->desc가
// 토글되고 다른 key를 누르면 그 key의 asc 정렬로 새로 시작한다.
export default function SortableTh({ sortKey, sort, onSort, className = "", children }) {
  const active = sort?.key === sortKey;
  const handleClick = () => {
    if (active) {
      onSort({ key: sortKey, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      onSort({ key: sortKey, dir: "asc" });
    }
  };
  return (
    <th className={`px-3 py-3 font-semibold ${className}`}>
      <button type="button" onClick={handleClick} className="inline-flex items-center gap-1 hover:text-ink">
        {children}
        {active ? (
          sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ChevronsUpDown size={12} className="text-slate-300" />
        )}
      </button>
    </th>
  );
}
