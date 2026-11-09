// ⭐ 2026-11-09 계정 표시 — 기본은 이름, 누르면 계정 아이디(이메일) ↔ 이름(PC 상단·왼쪽 메뉴 공용)
import React from "react";
export default function NameIdToggle({ name = "", id = "", className = "" }) {
  const [showId, setShowId] = React.useState(false);
  const label = (showId && id) ? id : (name || id);
  if (!label) return null;
  return (
    <button type="button" onClick={() => setShowId((v) => !v)} title={showId ? "눌러서 이름 보기" : "눌러서 계정 아이디 보기"} className={`text-left truncate ${className}`}>{label}</button>
  );
}
