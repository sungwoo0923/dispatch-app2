// ======================= src/officeSms/routePicker.jsx =======================
// 💬 2026-11-18 문자 보내기 방식 고르기 — 처음 한 번만 묻는다(나중에 사내문자 창 › ⚙ 보내는 방식에서 바꿀 수 있다)
//   const v = await pickSmsRoute();   // "phone" | "office" | null(닫음)
import React from "react";
import { createRoot } from "react-dom/client";

const OPTIONS = [
  { v: "phone", title: "휴대폰과 연결", sub: "지금처럼 PC에 연결된 휴대폰(윈도우 '휴대폰과 연결')으로 보내요", tag: "지금 방식" },
  { v: "office", title: "사내문자 (업무폰)", sub: "내 업무폰과 프로그램을 연결해서 보내고 받아요. 기사님 답장도 프로그램 창에 바로 떠요", tag: "추천" },
];

function Picker({ current, onDone }) {
  const [sel, setSel] = React.useState(current || "office");
  React.useEffect(() => {
    const k = (e) => {
      if (e.isComposing) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onDone(null); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onDone(sel); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onDone, sel]);
  return (
    <div data-kp-dialog="1" style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "rgba(11,20,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div role="dialog" aria-modal="true" aria-label="문자 보내는 방식" style={{ width: "min(460px,100%)", borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 30px 80px rgba(11,20,40,.45)" }}>
        <div style={{ padding: "18px 22px 14px", color: "#fff", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>SMS ROUTE</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>문자를 어떻게 보낼까요?</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", marginTop: 4 }}>처음 한 번만 고르면 돼요. 나중에 바꿀 수 있어요.</div>
        </div>
        <div style={{ padding: "16px 18px 6px", display: "grid", gap: 10 }}>
          {OPTIONS.map((o) => {
            const on = sel === o.v;
            return (
              <button key={o.v} type="button" onClick={() => setSel(o.v)} onDoubleClick={() => onDone(o.v)} data-kp={`sms-route-${o.v}`}
                style={{ textAlign: "left", padding: "14px 16px", borderRadius: 16, cursor: "pointer", border: on ? "2px solid #2D4C82" : "1px solid #E3E8F0", background: on ? "#F2F6FC" : "#fff", display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ width: 20, height: 20, borderRadius: 10, marginTop: 2, flexShrink: 0, border: on ? "6px solid #2D4C82" : "2px solid #C2CBD9", boxSizing: "border-box" }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 15.5, fontWeight: 900, color: "#0F1A30" }}>{o.title}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 900, padding: "2px 7px", borderRadius: 99, background: o.v === "office" ? "#1B2B4B" : "#EEF2F8", color: o.v === "office" ? "#fff" : "#5B6B85" }}>{o.tag}</span>
                  </span>
                  <span style={{ display: "block", fontSize: 13, color: "#5B6B85", marginTop: 3, lineHeight: 1.55, wordBreak: "keep-all" }}>{o.sub}</span>
                </span>
              </button>
            );
          })}
          {sel === "office" && (
            <div style={{ fontSize: 12.5, color: "#3A4A66", background: "#F7F9FC", borderRadius: 12, padding: "10px 12px", lineHeight: 1.6, wordBreak: "keep-all" }}>
              업무폰에 <b>LogisWeb 앱</b>을 깔고 <b>직원(사무실) 계정으로 로그인 → 설정 → 업무폰 문자 연결</b>을 켜면 돼요.<br />
              🔒 주고받은 문자는 <b>나만</b> 볼 수 있어요. 관리자도 못 봐요.
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "12px 18px 18px" }}>
          <button type="button" onClick={() => onDone(null)} style={{ height: 46, borderRadius: 14, border: "1px solid #E3E8F0", background: "#fff", fontSize: 14, fontWeight: 800, color: "#5B6B85", cursor: "pointer" }}>취소</button>
          <button type="button" onClick={() => onDone(sel)} style={{ height: 46, borderRadius: 14, border: "none", background: "#1B2B4B", fontSize: 14, fontWeight: 900, color: "#fff", cursor: "pointer" }}>이걸로 할게요</button>
        </div>
      </div>
    </div>
  );
}

export function pickSmsRoute(current = null) {
  return new Promise((resolve) => {
    if (typeof document === "undefined" || !document.body) { resolve(null); return; }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v) => { resolve(v); setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    root.render(<Picker current={current} onDone={done} />);
  });
}
