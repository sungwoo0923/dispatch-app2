// ======================= cafe-site/src/Pagination.jsx =======================
// 목록 공용 페이지네이션 — 한 페이지 10건, 이전/다음 및 페이지 번호로 이동.
import React from "react";

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  // 현재 페이지 주변 번호만 노출(최대 5개)해 페이지가 많아져도 한 줄에 들어오게 한다.
  const nums = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let i = Math.max(1, start); i <= end; i++) nums.push(i);

  const btn = "min-w-[32px] h-8 px-2 rounded-lg text-[12.5px] font-bold transition";

  return (
    <div className="flex items-center justify-center gap-1.5 mt-5">
      <button onClick={() => onChange(1)} disabled={page === 1}
        className={`${btn} border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50`}>«</button>
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        className={`${btn} border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50`}>이전</button>
      {nums.map(n => (
        <button key={n} onClick={() => onChange(n)}
          className={`${btn} border ${n === page ? "bg-[#1B2B4B] border-[#1B2B4B] text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
          {n}
        </button>
      ))}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
        className={`${btn} border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50`}>다음</button>
      <button onClick={() => onChange(totalPages)} disabled={page === totalPages}
        className={`${btn} border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50`}>»</button>
    </div>
  );
}
