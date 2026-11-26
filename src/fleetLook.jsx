// 🎨 2026-11-26 관제현황 화면 모양 고르기 — A 관제실 다크(기본) · B 지도 중심 라이트
//  계정 화면 설정(ColumnLayout 의 setPref · usePref)에 저장해 PC · 휴대폰이 같은 모양으로 열린다.
//  설정 연결이 아직 안 된 화면(휴대폰 첫 진입 등)을 위해 이 기기 저장값도 같이 둔다.
import React from "react";
import { usePref, setPref } from "./ColumnLayout";

const LS = "kpFleetLook";
const lsGet = () => { try { return localStorage.getItem(LS) || ""; } catch { return ""; } };
const lsSubs = new Set();

export function useFleetLook() {
  const v = usePref("fleetLook");
  const [, f] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { lsSubs.add(f); return () => lsSubs.delete(f); }, []);
  const look = v || lsGet();
  return look === "B" ? "B" : "A";
}
export function setFleetLook(v) {
  const look = v === "B" ? "B" : "A";
  try { localStorage.setItem(LS, look); } catch { /* 무시 */ }
  setPref("fleetLook", look);
  lsSubs.forEach((f) => f());
}

const OPTS = [
  { k: "A", t: "A 관제실 다크", s: "어두운 화면 · 목록 왼쪽" },
  { k: "B", t: "B 지도 중심 라이트", s: "밝은 화면 · 지도 크게" },
];
// 화면 모양 전환 버튼 — light 화면에서도 · 어두운 화면에서도 읽히게 두 벌 색
export function FleetLookSwitch({ look, size = "md" }) {
  const dark = look !== "B";
  const h = size === "sm" ? 34 : 38;
  return (
    <div role="radiogroup" aria-label="관제현황 화면 모양" title="관제현황 화면 모양 — 계정에 저장돼 PC · 휴대폰이 같이 바뀌어요"
      className="fm-keep-light"
      style={{ display: "inline-flex", padding: 3, gap: 3, borderRadius: 11, background: dark ? "#0E1A30" : "#EEF1F6", border: `1px solid ${dark ? "#22345A" : "#DCE3EE"}` }}>
      {OPTS.map((o) => {
        const on = look === o.k;
        return (
          <button key={o.k} type="button" role="radio" aria-checked={on} onClick={() => setFleetLook(o.k)} title={o.s}
            style={{ height: h - 8, padding: size === "sm" ? "0 10px" : "0 12px", borderRadius: 8, border: 0, cursor: "pointer", font: "inherit", fontSize: size === "sm" ? 13 : 13.5, fontWeight: 900, whiteSpace: "nowrap",
              background: on ? (dark ? "#38BDF8" : "#1B2B4B") : "transparent",
              color: on ? (dark ? "#04111F" : "#FFFFFF") : (dark ? "#A9B8D2" : "#3A4A66") }}>
            {o.t}
          </button>
        );
      })}
    </div>
  );
}
