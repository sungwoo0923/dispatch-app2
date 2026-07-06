import { ChevronLeft, ChevronRight } from "lucide-react";

// Paired with usePagination(): a page-size dropdown (10/30/50) on the left,
// prev/page/next pager on the right. Renders even at 1 page so the row-count
// dropdown is always available on every list.
export default function Pagination({ page, pageCount, pageSize, total, setPage, changePageSize, pageSizeOptions }) {
  return (
    <div className="flex flex-nowrap items-center justify-between gap-3 py-2 text-xs text-muted">
      <div className="flex flex-nowrap items-center gap-1.5">
        <span>목록 {total}건 · 페이지당</span>
        <select
          className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
          value={pageSize}
          onChange={(e) => changePageSize(Number(e.target.value))}
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {n}개
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-nowrap items-center gap-2">
        <button
          type="button"
          className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span>
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
