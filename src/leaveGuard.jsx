// ======================= src/leaveGuard.jsx =======================
// ✋ 작성 중 이동 확인(2026-11-01) — 전자결재·증명서 발급 등에서 쓰던 내용이 있을 때 다른 탭·메뉴로 가면
//   [임시저장] [저장 안 함] [계속 작성] 창을 띄운다(모든 사용자).
//   · 임시저장: 이 기기에 내용을 보관 → 다시 그 화면에 오면 그대로 이어서 작성
//   · 저장 안 함: 보관된 내용도 지우고 이동 → 다시 오면 처음 화면
//   · 계속 작성: 이동하지 않음
//  사용: useLeaveGuard(dirty, { label, onSave, onDiscard }) / 이동하는 곳: if (await confirmLeave()) 이동()
import React from "react";
import { createRoot } from "react-dom/client";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
let current = null; // { label, onSave, onDiscard }
let opening = null;

export function useLeaveGuard(dirty, opts) {
  const ref = React.useRef(opts);
  ref.current = opts;
  React.useEffect(() => {
    if (!dirty) return undefined;
    const g = { get label() { return ref.current?.label; }, onSave: () => ref.current?.onSave?.(), onDiscard: () => ref.current?.onDiscard?.() };
    current = g;
    // 새로고침·창 닫기도 한 번 묻는다(브라우저 기본 창)
    const bu = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", bu);
    return () => { if (current === g) current = null; window.removeEventListener("beforeunload", bu); };
  }, [dirty]);
}

function LeaveDialog({ label, onDone }) {
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onDone("stay"); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onDone]);
  const btn = { height: 48, borderRadius: 13, fontSize: 14.5, fontWeight: 900, cursor: "pointer" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "rgba(11,20,40,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div role="dialog" aria-modal="true" style={{ width: "min(460px,100%)", borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 30px 80px rgba(11,20,40,.45)", animation: "kplv .16s ease-out" }}>
        <style>{"@keyframes kplv{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}"}</style>
        <div style={{ padding: "18px 22px 14px", color: "#fff", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)" }}>
          <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>UNSAVED · 작성 중</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>작성 중인 문서가 있습니다</div>
        </div>
        <div style={{ padding: "18px 22px 4px", fontSize: 15, lineHeight: 1.7, color: "#0F1A30", fontWeight: 700, wordBreak: "keep-all" }}>
          {label ? <div style={{ fontWeight: 900 }}>「{label}」</div> : null}
          <div style={{ color: "#3A4A66", fontSize: 14, fontWeight: 600 }}>다른 화면으로 이동하기 전에 저장할까요?<br />임시저장하면 다시 돌아왔을 때 이어서 작성할 수 있습니다.</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "16px 22px 10px" }}>
          <button type="button" onClick={() => onDone("discard")} style={{ ...btn, border: "1px solid #FECDCA", background: "#fff", color: "#B42318" }}>저장 안 함</button>
          <button type="button" autoFocus onClick={() => onDone("save")} style={{ ...btn, border: "none", background: "#1B2B4B", color: "#fff", boxShadow: "0 8px 20px rgba(15,26,48,.28)" }}>임시저장</button>
        </div>
        <div style={{ padding: "0 22px 18px" }}>
          <button type="button" onClick={() => onDone("stay")} style={{ ...btn, width: "100%", height: 42, border: "1px solid #DCE3EE", background: "#F5F8FD", color: "#3A4A66", fontWeight: 800 }}>계속 작성</button>
        </div>
      </div>
    </div>
  );
}

// 이동해도 되는지 — 작성 중이 아니면 바로 true
export function confirmLeave() {
  const g = current;
  if (!g) return Promise.resolve(true);
  if (opening) return opening;
  opening = new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = async (v) => {
      setTimeout(() => { root.unmount(); host.remove(); }, 0);
      opening = null;
      if (v === "stay") return resolve(false);
      try { if (v === "save") await g.onSave(); else await g.onDiscard(); } catch { /* 무시 */ }
      if (current === g) current = null;
      resolve(true);
    };
    root.render(<LeaveDialog label={g.label} onDone={done} />);
  });
  return opening;
}
export const guardNav = (fn) => (...a) => { confirmLeave().then((ok) => { if (ok) fn(...a); }); };

// 임시저장 보관(이 기기) — 사용자·화면별
export const draftStore = {
  get(key) { try { return JSON.parse(localStorage.getItem(`kpDraft:${key}`) || "null"); } catch { return null; } },
  set(key, v) { try { localStorage.setItem(`kpDraft:${key}`, JSON.stringify({ ...v, savedAt: Date.now() })); return true; } catch { return false; } },
  del(key) { try { localStorage.removeItem(`kpDraft:${key}`); } catch { /* 무시 */ } },
};
