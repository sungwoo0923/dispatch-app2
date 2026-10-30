// ======================= src/kpDialog.jsx =======================
// 💬 프로그램 디자인의 확인·알림 창 — 브라우저 기본 confirm/alert(구식 회색 창) 대신 쓴다.
//   const ok = await kpConfirm("계정을 삭제할까요?", { title: "계정 삭제", okText: "삭제", danger: true });
//   await kpAlert("저장했습니다");
//  · Enter = 확인, Esc = 취소 · 바깥을 눌러도 닫히지 않는다(실수 방지)
import React from "react";
import { createRoot } from "react-dom/client";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";

function Dialog({ message, title, okText, cancelText, danger, alertOnly, onDone }) {
  const okRef = React.useRef(null);
  React.useEffect(() => {
    okRef.current?.focus();
    const k = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onDone(false); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onDone(true); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onDone]);
  const lines = String(message ?? "").split("\n");
  return (
    <div data-kp-dialog="1" style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "rgba(11,20,40,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div role="dialog" aria-modal="true" style={{ width: "min(440px,100%)", borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 30px 80px rgba(11,20,40,.45)", animation: "kpdlg .16s ease-out" }}>
        <style>{"@keyframes kpdlg{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}"}</style>
        <div style={{ padding: "18px 22px 14px", color: "#fff", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>{alertOnly ? "NOTICE" : danger ? "CONFIRM · CAUTION" : "CONFIRM"}</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{title || (alertOnly ? "알림" : "확인해 주세요")}</div>
        </div>
        <div style={{ padding: "18px 22px 6px", fontSize: 15, lineHeight: 1.7, color: "#0F1A30", fontWeight: 600, wordBreak: "keep-all" }}>
          {lines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 800 } : { color: "#3A4A66", fontSize: 14 }}>{l || " "}</div>)}
        </div>
        <div style={{ display: "flex", gap: 8, padding: "16px 22px 20px" }}>
          {!alertOnly && <button type="button" onClick={() => onDone(false)} style={{ flex: 1, height: 46, borderRadius: 13, border: "1px solid #DCE3EE", background: "#fff", color: "#3A4A66", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>{cancelText || "취소"}</button>}
          <button ref={okRef} type="button" onClick={() => onDone(true)} style={{ flex: alertOnly ? 1 : 1.4, height: 46, borderRadius: 13, border: "none", background: danger ? "#0B1428" : "#1B2B4B", color: "#fff", fontSize: 14.5, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(15,26,48,.28)" }}>{okText || "확인"}</button>
        </div>
      </div>
    </div>
  );
}

function open(props) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v) => { resolve(!!v); setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    root.render(<Dialog {...props} onDone={done} />);
  });
}
export const kpConfirm = (message, opts = {}) => open({ message, ...opts });
export const kpAlert = (message, opts = {}) => open({ message, alertOnly: true, ...opts });

// ⎋ ESC — 어디서든 맨 위에 열린 창을 닫는다(창의 닫기·✕·취소 버튼을 대신 눌러 준다)
const CLOSE_RE = /^(✕|×|x|X|닫기|닫기 ✕|취소|← 목록|← 서류함|close)$/;
export function installEscClose() {
  if (typeof window === "undefined" || window.__kpEscInstalled) return;
  window.__kpEscInstalled = true;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (document.querySelector("[data-kp-dialog]")) return;
    // 맨 위(나중에 그려진) 화면 덮개 찾기
    const overlays = [...document.querySelectorAll("body *")].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return r.width >= window.innerWidth * 0.3 && r.height >= window.innerHeight * 0.5 && el.querySelector("button");
    });
    for (let i = overlays.length - 1; i >= 0; i--) {
      const btns = [...overlays[i].querySelectorAll("button")].filter((b) => b.offsetParent !== null || getComputedStyle(b).position === "fixed");
      const close = btns.find((b) => CLOSE_RE.test(String(b.textContent || "").trim()) || /닫기|close/i.test(b.getAttribute("aria-label") || b.getAttribute("title") || ""));
      if (close) { e.preventDefault(); close.click(); return; }
    }
  });
}
