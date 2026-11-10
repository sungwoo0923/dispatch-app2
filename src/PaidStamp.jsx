// ======================= src/PaidStamp.jsx =======================
// 기사앱 · 사무실 화면이 같이 쓰는 작은 조각(기사앱이 사무실 화면 코드를 받지 않게 따로 둔다)
import React from "react";

// 💸 2026-11-10 지급완료 도장 — 영수증 사진 한가운데(전자결재 지급완료 도장과 같은 붉은 인장)
export function PaidStamp({ date, size = 1 }) {
  const d = String(date || "").replace(/-/g, ".");
  return (
    <div data-kp="vex-paid-stamp" className="pointer-events-none select-none" style={{ transform: `rotate(-8deg) scale(${size})`, opacity: 0.93 }} aria-label={`지급완료 ${d}`}>
      <div style={{ borderRadius: 16, border: "4px solid #B42318", padding: 4, background: "rgba(255,255,255,.9)", boxShadow: "0 6px 20px rgba(11,20,40,.25)" }}>
        <div style={{ borderRadius: 11, border: "2px solid #B42318", color: "#B42318", padding: "4px 18px 5px", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.3em", paddingLeft: "0.3em", lineHeight: 1.3 }}>PAID · 지급</div>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: "0.12em", paddingLeft: "0.12em", lineHeight: 1.1 }}>지급완료</div>
          {d && <div style={{ fontSize: 13, fontWeight: 900, borderTop: "2px solid #B42318", marginTop: 3, paddingTop: 2, fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em" }}>{d}</div>}
        </div>
      </div>
    </div>
  );
}
