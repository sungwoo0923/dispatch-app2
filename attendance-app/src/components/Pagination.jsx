import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

// Paired with usePagination(): a page-size dropdown (10/30/50) on the left,
// first/prev/page/next/last pager on the right. Renders even at 1 page so
// the row-count dropdown is always available on every list. Callers show
// their own "목록 N건" count near their own list header — this only owns
// the page-size selector and the pager, to avoid a duplicate count label
// when a page already prints one elsewhere.
export default function Pagination({ page, pageCount, pageSize, setPage, changePageSize, pageSizeOptions }) {
  return (
    <div className="flex flex-nowrap items-center justify-between gap-3 py-2 text-xs text-muted">
      <div className="flex flex-nowrap items-center gap-1.5">
        <span>페이지당</span>
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
      <div className="flex flex-nowrap items-center gap-1.5">
        <button
          type="button"
          className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage(1)}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="min-w-[1.5rem] text-center">{page}</span>
        <button
          type="button"
          className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => setPage(pageCount)}
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
}
