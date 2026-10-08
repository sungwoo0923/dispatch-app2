// 로그인 화면용 큼직한 체크박스(정보 저장 / 자동 로그인)
import React from "react";

export default function BigCheck({ checked, onChange, label, dark = false }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", padding: "4px 0" }}>
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onChange(!checked); } }}
        style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          border: `2px solid ${checked ? "#1B2B4B" : (dark ? "rgba(255,255,255,.5)" : "#cbd5e1")}`,
          background: checked ? "#1B2B4B" : "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all .15s",
        }}
      >
        {checked && (
          <svg width="14" height="14" fill="none" stroke="#fff" strokeWidth="3" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ display: "none" }} />
      <span style={{ fontSize: 14, fontWeight: 700, color: dark ? "#fff" : "#374151" }}>{label}</span>
    </label>
  );
}
