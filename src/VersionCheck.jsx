// ======================= src/VersionCheck.jsx =======================
// 🛰 접속 버전 확인(2026-10-28) — PC·모바일 공용. 처음 켤 때(그리고 10분마다·화면에 돌아올 때)
//  서버의 /version.json(빌드할 때 자동 생성)과 지금 실행 중인 빌드를 비교한다.
//  - 최신이면: 아래쪽에 "최신 버전" 알약을 3.5초 띄우고 사라진다(접속당 1번).
//  - 이전 버전이면(2026-10-28 변경): 팝업을 강제로 띄우지 않는다. 버전 표시 자리(PC 상단 로고 옆·
//    모바일 메뉴 버튼/버전칸)에 "NEW" 표시만 하고, 그걸 누르면(openUpdatePopup) 새 버전 안내 카드가 뜬다.
import React, { useCallback, useEffect, useState } from "react";
import { hardReloadForUpdate } from "./UpdateBanner";

/* global __APP_VERSION__, __BUILD_TIME__ */
const CUR_VER = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
const CUR_BUILD = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
const stamp = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  const k = new Date(d.getTime() + 9 * 3600e3).toISOString();
  return `${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
};

// ⭐ 새 버전 여부를 화면 어디서든 볼 수 있게 공유(버전 표시 자리의 NEW 표시용)
let newVer = null;
const subs = new Set();
const setNewVer = (v) => { newVer = v; subs.forEach((f) => f(v)); };
export function useNewVersion() {
  const [v, setV] = useState(newVer);
  useEffect(() => { subs.add(setV); setV(newVer); return () => { subs.delete(setV); }; }, []);
  return v; // null = 최신, { version, build } = 새 버전 있음
}
export const openUpdatePopup = () => window.dispatchEvent(new Event("kpOpenUpdate"));

export default function VersionCheck() {
  const [state, setState] = useState(null); // { kind: "ok" | "old", latest }
  const [hidden, setHidden] = useState(true); // 새 버전 안내 카드는 버전 표시를 눌렀을 때만 연다

  const check = useCallback(async (first) => {
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const latest = await r.json();
      if (!latest?.build) return;
      const old = CUR_BUILD && latest.build > CUR_BUILD; // 서버 빌드가 더 새로우면 이전 버전
      if (old) { setState({ kind: "old", latest }); setNewVer(latest); return; }
      if (first) {
        let shown = false;
        try { shown = sessionStorage.getItem("kpVerOkShown") === CUR_BUILD; sessionStorage.setItem("kpVerOkShown", CUR_BUILD); } catch { /* 무시 */ }
        if (!shown) { setState({ kind: "ok", latest }); setTimeout(() => setState((s) => (s?.kind === "ok" ? null : s)), 3500); }
      }
    } catch { /* 오프라인 등은 조용히 넘어간다 */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => check(true), 2500);
    const iv = setInterval(() => check(false), 10 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") check(false); };
    const onOpen = () => { setHidden(false); check(false); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("kpOpenUpdate", onOpen);
    return () => { clearTimeout(t); clearInterval(iv); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("kpOpenUpdate", onOpen); };
  }, [check]);

  if (!state) return null;
  const isOld = state.kind === "old";
  if (isOld && hidden) return null;
  return (
    <div style={{ position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 2147483600, width: isOld ? "min(420px, calc(100vw - 24px))" : "auto", fontFamily: "'Pretendard','Noto Sans KR',sans-serif" }} className="kp-ver-in">
      <style>{VC_CSS}</style>
      {isOld ? (
        <div style={{ borderRadius: 20, overflow: "hidden", color: "#fff", border: "1px solid rgba(143,176,240,.3)", boxShadow: "0 22px 50px rgba(11,20,40,.45)", background: "linear-gradient(rgba(143,176,240,.07) 1px, transparent 1px) 0 0/20px 20px, linear-gradient(90deg, rgba(143,176,240,.07) 1px, transparent 1px) 0 0/20px 20px, linear-gradient(135deg,#0B1428 0%,#1B2B4B 60%,#2D4C82 100%)" }}>
          <div style={{ padding: "16px 18px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="kp-ver-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#CFE0FF", boxShadow: "0 0 10px #8FB0F0" }} />
              <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.24em", color: "#8FB0F0" }}>UPDATE AVAILABLE</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>새 버전이 나왔습니다</div>
            <div style={{ fontSize: 13.5, color: "rgba(207,224,255,.75)", marginTop: 3 }}>지금 쓰는 화면은 이전 버전입니다. 업데이트하면 최신 기능으로 바뀝니다.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, marginTop: 12 }}>
              <div style={{ borderRadius: 12, padding: "8px 10px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(143,176,240,.18)" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(207,224,255,.6)" }}>현재</div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800 }}>v{CUR_VER}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "rgba(207,224,255,.55)" }}>{stamp(CUR_BUILD)}</div>
              </div>
              <span style={{ fontFamily: MONO, color: "#8FB0F0", fontWeight: 800 }}>→</span>
              <div style={{ borderRadius: 12, padding: "8px 10px", background: "rgba(207,224,255,.14)", border: "1px solid rgba(207,224,255,.45)" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#CFE0FF" }}>최신</div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800 }}>v{state.latest.version || "-"}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: "rgba(207,224,255,.75)" }}>{stamp(state.latest.build)}</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, padding: "0 18px 16px" }}>
            <button type="button" onClick={() => setHidden(true)} style={{ flex: 1, height: 42, borderRadius: 12, border: "1px solid rgba(207,224,255,.3)", background: "transparent", color: "#CFE0FF", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>나중에</button>
            <button type="button" onClick={hardReloadForUpdate} style={{ flex: 1.6, height: 42, borderRadius: 12, border: "none", background: "#fff", color: "#0F1A30", fontSize: 14.5, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 16px rgba(0,0,0,.25)" }}>지금 업데이트</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 9, height: 38, padding: "0 16px", borderRadius: 99, color: "#fff", background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)", border: "1px solid rgba(143,176,240,.35)", boxShadow: "0 12px 28px rgba(11,20,40,.35)", whiteSpace: "nowrap" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          <span style={{ fontSize: 13.5, fontWeight: 800 }}>최신 버전입니다</span>
          <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: "#8FB0F0" }}>v{CUR_VER} · {stamp(CUR_BUILD)}</span>
        </div>
      )}
    </div>
  );
}

const VC_CSS = `
  @keyframes kpVerIn { from { opacity: 0; transform: translate(-50%, 14px) } to { opacity: 1; transform: translate(-50%, 0) } }
  .kp-ver-in { animation: kpVerIn .35s cubic-bezier(.2,.9,.3,1.1) both; }
  @keyframes kpVerDot { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
  .kp-ver-dot { animation: kpVerDot 1.4s ease-in-out infinite; }
`;
