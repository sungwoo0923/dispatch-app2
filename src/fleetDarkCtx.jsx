// ======================= src/fleetDarkCtx.jsx =======================
// 🛰 2026-11-25 지입차관리 다크 — 화면 밖(document.body)에 뜨는 창도 같은 다크 규칙(.fm-dark)을 받게 감싼다.
//  FleetManagement 가 지입차관리 메뉴로 열렸을 때만 켜진다(다른 메뉴에 끼워 쓰면 원래 밝은 창).
import React from "react";

export const FleetDarkCtx = React.createContext(false);
export function FleetDarkPop({ children }) {
  const dk = React.useContext(FleetDarkCtx);
  return dk ? <div className="fm-dark fm-pop" style={{ display: "contents" }}>{children}</div> : children;
}
