// src/planner/PlannerUpcomingSchedule.jsx — 홈 대시보드의 "다가오는 일정" 카드
// (PC/모바일 공용, 5개씩 페이지 넘김 + 우측 상단 등록 버튼 + 항목 클릭 시 수정 팝업).
// 실제 등록/수정 모달은 PC(AdminPlanner.jsx)/모바일(AdminPlannerMobile.jsx)이 각자
// 이미 가진 ScheduleEntryModal을 그대로 쓰므로, 이 컴포넌트는 목록/페이지네이션만
// 담당하고 onAdd/onSelect 콜백으로 위임한다.
import React, { useState } from "react";
import { dDayLabel } from "../adminPlannerData";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

const PAGE_SIZE = 5;

// bare=true면 바깥 흰색 카드 테두리 없이 내용만 렌더링한다(모바일 홈처럼 이미
// 하나의 큰 카드 안에 구분선으로 섹션이 나뉘어 있는 레이아웃에 끼워 넣을 때 사용).
export default function PlannerUpcomingSchedule({ upcoming, onAdd, onSelect, bare = false, titleClassName, titleColor }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageItems = upcoming.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className={bare ? "" : "bg-white border rounded-xl p-4"} style={bare ? undefined : { borderColor: ACCENT_BORDER }}>
      <div className="flex items-center justify-between mb-3">
        <div className={titleClassName || "text-[13px] font-bold text-gray-700"} style={titleColor ? { color: titleColor } : undefined}>다가오는 일정</div>
        <button
          onClick={onAdd}
          className="shrink-0 text-[11.5px] font-bold px-2.5 py-1 rounded-lg"
          style={{ background: ACCENT, color: "#fff" }}
        >
          + 등록
        </button>
      </div>
      {upcoming.length === 0 && <div className="text-[12px] text-gray-400 py-4 text-center">등록된 일정이 없습니다</div>}
      <div className="space-y-2">
        {pageItems.map((s) => {
          const dday = dDayLabel(s.effectiveDate);
          const soon = dday === "D-DAY" || dday === "D-1";
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className="w-full flex items-center justify-between text-[12.5px] border-b last:border-b-0 pb-2 last:pb-0 text-left"
              style={{ borderColor: "#f3f4f6" }}
            >
              <span className="text-gray-700 font-semibold truncate flex items-center gap-1.5 min-w-0">
                {dday && (
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                    style={soon ? { background: ACCENT, color: "#fff" } : { background: "#f3f4f6", color: "#6b7280" }}
                  >
                    {dday}
                  </span>
                )}
                <span className="truncate">{s.title}{s.recurring && <span className="text-[10px] text-gray-400 font-normal">(매년)</span>}</span>
              </span>
              <span className="text-gray-400 shrink-0 ml-2">{s.effectiveDate}{s.time ? ` ${s.time}` : ""}</span>
            </button>
          );
        })}
      </div>
      {upcoming.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 mt-3 pt-2 border-t" style={{ borderColor: "#f3f4f6" }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={clampedPage === 0}
            className="w-6 h-6 rounded-lg text-[12px] font-bold disabled:opacity-30"
            style={{ color: ACCENT }}
          >
            ‹
          </button>
          <span className="text-[11px] text-gray-400 font-semibold">{clampedPage + 1} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={clampedPage >= totalPages - 1}
            className="w-6 h-6 rounded-lg text-[12px] font-bold disabled:opacity-30"
            style={{ color: ACCENT }}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
