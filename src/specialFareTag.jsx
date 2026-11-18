// ======================= src/specialFareTag.jsx =======================
// 🏷 2026-11-18 운임조회 이력 — 특수운임(지게차 · 대기료 · 경유 · 할증 등)이 붙어 저장된 오더 표시
//  · 모든 운임조회 이력(오더등록 · 오더복사/수정 · 실시간배차현황 우클릭 · 자사운임표 · 모바일)에서 같은 모양으로 쓴다
//  · SpecialFareTag  : 뱃지 한 개 — "특수운임 지게차 30,000" / "특수운임 2건 50,000"  (마우스를 올리면 내역)
//  · SpecialFareLine : 카드 아래 한 줄 내역 — "지게차 30,000 (기사 차감) · 대기료 20,000 (추가 청구)"
//  색은 표 칸의 특수운임 표시(ForkliftChip)와 같은 남색 바탕 + 금색 글자
import React from "react";
import { hasSpecial, hasForklift, specialCount, specialTotal, specialLines, fkAmount, sfItems, sfName } from "./forkliftCore";

const won = (n) => Math.round(Number(n) || 0).toLocaleString("ko-KR");

// 뱃지 글자 — 한 건이면 그 이름, 여러 건이면 건수
function tagText(row) {
  const n = specialCount(row);
  if (n === 1) {
    if (hasForklift(row)) return `지게차 ${won(fkAmount(row))}`;
    const it = sfItems(row)[0];
    return `${sfName(it)} ${won(specialTotal(row))}`;
  }
  return `${n}건 ${won(specialTotal(row))}`;
}

export function SpecialFareTag({ row, size = "md", className = "" }) {
  if (!row || !hasSpecial(row)) return null;
  const sm = size === "sm";
  return (
    <span
      data-testid="special-fare-tag"
      title={`특수운임이 붙어 저장된 운임이에요\n${specialLines(row).join("\n")}`}
      className={`inline-flex items-center gap-1 ${sm ? "h-[18px] px-1.5 text-[10px]" : "h-[22px] px-2 text-[11px]"} rounded-md bg-[#1B2B4B] text-[#E9C46A] font-black whitespace-nowrap tabular-nums align-middle ${className}`}>
      <span className={`${sm ? "w-1 h-1" : "w-1.5 h-1.5"} rounded-full bg-[#E9C46A] shrink-0`} />
      특수운임<span className="text-[#F3E3BC]/90 font-extrabold">{tagText(row)}</span>
    </span>
  );
}

export function SpecialFareLine({ row, className = "" }) {
  if (!row || !hasSpecial(row)) return null;
  return (
    <div className={`flex items-start gap-1.5 text-[11.5px] leading-snug rounded-md px-2 py-1 bg-[#FFF8EC] border border-[#F3D9A4] text-[#7A4B00] ${className}`} title={specialLines(row).join("\n")}>
      <span className="font-black shrink-0">특수운임</span>
      <span className="font-semibold min-w-0 break-keep">{specialLines(row).join(" · ")}</span>
    </div>
  );
}
