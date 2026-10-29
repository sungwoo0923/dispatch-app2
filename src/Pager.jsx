// ======================= src/Pager.jsx =======================
// 목록 페이지 넘김(이전/다음) — 로그인 관리, 접속 이력 등에서 20개씩 볼 때 사용
import React from "react";

export const PAGE_SIZE = 20;
export const pageSlice = (rows, page, size = PAGE_SIZE) => rows.slice((page - 1) * size, page * size);
export const pageCount = (n, size = PAGE_SIZE) => Math.max(1, Math.ceil(n / size));

export default function Pager({ page, total, size = PAGE_SIZE, onPage }) {
  const pages = pageCount(total, size);
  if (total <= size) return null;
  const from = (page - 1) * size + 1, to = Math.min(total, page * size);
  const btn = "h-9 px-4 rounded-xl text-[13px] font-black border transition disabled:opacity-35 disabled:cursor-not-allowed";
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[#EEF1F6] bg-[#FAFBFD]">
      <span className="text-[12.5px] font-bold text-[#7A89A3] tabular-nums">{from}–{to} / 총 {total}건</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={`${btn} border-[#DCE3EE] bg-white text-[#1B2B4B] hover:border-[#2D4C82]`}>‹ 이전</button>
        <span className="min-w-[64px] text-center text-[13px] font-black text-[#0F1A30] tabular-nums">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={`${btn} border-[#0F1A30] bg-[#0F1A30] text-white hover:bg-[#1B2B4B]`}>다음 ›</button>
      </div>
    </div>
  );
}
