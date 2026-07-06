import { useMemo, useState } from "react";

const PAGE_SIZE_OPTIONS = [10, 30, 50];

// Shared paging logic for every admin list table: page-size dropdown
// (10/30/50) + current-page slice, resetting to page 1 whenever the
// filtered row count shrinks below the current page's range.
export function usePagination(rows, initialSize = 10) {
  const [pageSize, setPageSize] = useState(initialSize);
  const [page, setPage] = useState(1);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safePage, pageSize]);

  const changePageSize = (size) => {
    setPageSize(size);
    setPage(1);
  };

  return {
    pageRows,
    page: safePage,
    pageCount,
    pageSize,
    total,
    setPage,
    changePageSize,
    PAGE_SIZE_OPTIONS,
  };
}
