// ======================= src/kpDialog.jsx =======================
// 💬 프로그램 디자인의 확인·알림·입력 창 — 브라우저 기본 confirm/alert/prompt(구식 회색 창) 대신 쓴다.
//   const ok = await kpConfirm("계정을 삭제할까요?", { title: "계정 삭제", okText: "삭제", danger: true });
//   await kpAlert("저장했습니다");
//   const name = await kpPrompt("결재선 이름", "기본 결재선");   // 취소하면 null (window.prompt 와 같음)
//  · Enter = 확인, Esc = 취소 · 바깥을 눌러도 닫히지 않는다(실수 방지)
//  · 여러 창이 한꺼번에 불려도 겹치지 않고 하나씩 차례로 뜬다
import React from "react";
import { createRoot } from "react-dom/client";
import { isDoneNotice, showSaved } from "./saveFeedback"; // ✅ 2026-11-20 짧은 완료 알림은 위쪽 "✓ …" 알림으로(떴다 사라짐)

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";

// ✏️ 2026-11-23 수정 확인 창(사용자 요청 — 프로그램 어디서든 수정을 저장하기 전에 한 번 묻는다)
//  kpConfirm("수정하시겠습니까?") · kpConfirmEdit({ changes: [{ label, before, after }] }) 는 "수정 확인" 모양:
//  연필 머리 · 바뀌는 내용(전 → 후) · 버튼에 [Esc] 취소 · [Enter] 저장 표시
const EDIT_RE = /^\s*(수정|변경|저장)(하시겠습니까|할까요)\??\s*$/;
const show = (v) => { const t = v == null ? "" : String(v).trim(); return t || "(비어 있음)"; };
function Key({ children, dark }) {
  return <span style={{ marginLeft: 8, padding: "1px 6px", borderRadius: 6, fontSize: 10.5, fontWeight: 800, fontFamily: "ui-monospace,Menlo,monospace", border: `1px solid ${dark ? "rgba(255,255,255,.35)" : "#DCE3EE"}`, color: dark ? "rgba(255,255,255,.85)" : "#7A869C", background: dark ? "rgba(255,255,255,.08)" : "#F7F9FC" }}>{children}</span>;
}

function Dialog({ message, title, okText, cancelText, danger, alertOnly, prompt, defaultValue, placeholder, onDone, edit, changes }) {
  const okRef = React.useRef(null);
  const inRef = React.useRef(null);
  const [val, setVal] = React.useState(defaultValue == null ? "" : String(defaultValue));
  const valRef = React.useRef(val);
  valRef.current = val;
  React.useEffect(() => {
    if (prompt) { inRef.current?.focus(); inRef.current?.select(); } else okRef.current?.focus();
    const openedAt = Date.now();
    const k = (e) => {
      if (e.isComposing) return;
      // 창을 띄운 Enter가 눌린 채 반복돼 바로 저장되는 실수를 막는다
      if (e.key === "Enter" && (e.repeat || Date.now() - openedAt < 150)) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onDone(prompt ? null : false); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onDone(prompt ? valRef.current : true); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onDone, prompt]);
  const isEdit = !prompt && !alertOnly && (edit || EDIT_RE.test(String(message ?? "")));
  const lines = String(message ?? "").split("\n");
  const eyebrow = prompt ? "INPUT" : alertOnly ? "NOTICE" : isEdit ? "EDIT · 수정 확인" : danger ? "CONFIRM · CAUTION" : "CONFIRM";
  const heading = title || (prompt ? "입력해 주세요" : alertOnly ? "알림" : isEdit ? "수정하시겠습니까?" : "확인해 주세요");
  const rows = Array.isArray(changes) ? changes.filter((c) => c && (c.label || c.before != null || c.after != null)) : [];
  const bodyLines = isEdit && EDIT_RE.test(String(message ?? "")) ? [] : lines;
  return (
    <div data-kp-dialog="1" style={{ position: "fixed", inset: 0, zIndex: 2147483646, background: "rgba(11,20,40,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "'Noto Sans KR',sans-serif" }}>
      <div role="dialog" aria-modal="true" aria-label={heading} style={{ width: "min(440px,100%)", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 30px 80px rgba(11,20,40,.45)", animation: "kpdlg .16s ease-out" }}>
        <style>{"@keyframes kpdlg{from{transform:translateY(8px) scale(.98);opacity:0}to{transform:none;opacity:1}}"}</style>
        <div style={{ padding: "18px 22px 14px", color: "#fff", background: "linear-gradient(120deg,#0B1428 0%,#1B2B4B 65%,#2D4C82 100%)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isEdit && (
              <span style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(143,176,240,.18)", border: "1px solid rgba(143,176,240,.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CFE0FF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </span>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: 10, fontWeight: 800, letterSpacing: isEdit ? "0.12em" : "0.26em", color: "#8FB0F0" }}>{eyebrow}</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{heading}</div>
            </div>
          </div>
        </div>
        <div style={{ padding: "18px 22px 6px", fontSize: 15, lineHeight: 1.7, color: "#0F1A30", fontWeight: 600, wordBreak: "keep-all", overflowY: "auto" }}>
          {bodyLines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 800 } : { color: "#3A4A66", fontSize: 14 }}>{l || " "}</div>)}
          {isEdit && rows.length > 0 && (
            <div style={{ marginTop: bodyLines.length ? 10 : 0, borderRadius: 14, border: "1px solid #E3E8F0", background: "#F7F9FC", padding: "6px 12px" }}>
              {rows.slice(0, 8).map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 0", borderTop: i ? "1px solid #EDF1F6" : "none", fontSize: 13.5 }}>
                  {c.label && <span style={{ flexShrink: 0, minWidth: 64, fontWeight: 800, color: "#5B6B85" }}>{c.label}</span>}
                  <span style={{ color: "#94A3B8", textDecoration: "line-through", fontWeight: 600, wordBreak: "break-all" }}>{show(c.before)}</span>
                  <span style={{ color: "#94A3B8", fontWeight: 800 }}>→</span>
                  <span style={{ color: "#0F1A30", fontWeight: 900, wordBreak: "break-all" }}>{show(c.after)}</span>
                </div>
              ))}
              {rows.length > 8 && <div style={{ padding: "4px 0 6px", fontSize: 12.5, color: "#7A869C", fontWeight: 700 }}>외 {rows.length - 8}개 칸</div>}
            </div>
          )}
          {isEdit && !rows.length && !bodyLines.length && <div style={{ color: "#3A4A66", fontSize: 14, fontWeight: 600 }}>저장하면 바로 반영돼요. 다시 한 번 확인해 주세요.</div>}
          {prompt && (
            <input ref={inRef} value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder || ""}
              style={{ marginTop: 12, width: "100%", height: 46, borderRadius: 13, border: "1px solid #C9D6EE", background: "#F7F9FC", padding: "0 14px", fontSize: 15, fontWeight: 700, color: "#0F1A30", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              onFocus={(e) => { e.target.style.borderColor = "#2D4C82"; e.target.style.boxShadow = "0 0 0 4px rgba(143,176,240,.28)"; }}
              onBlur={(e) => { e.target.style.borderColor = "#C9D6EE"; e.target.style.boxShadow = "none"; }} />
          )}
        </div>
        <div style={{ display: "flex", gap: 8, padding: "16px 22px 20px", flexShrink: 0 }}>
          {!alertOnly && <button type="button" onClick={() => onDone(prompt ? null : false)} style={{ flex: 1, height: 46, borderRadius: 13, border: "1px solid #DCE3EE", background: "#fff", color: "#3A4A66", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>{cancelText || "취소"}{!prompt && <Key>Esc</Key>}</button>}
          <button ref={okRef} type="button" onClick={() => onDone(prompt ? val : true)} style={{ flex: alertOnly ? 1 : 1.4, height: 46, borderRadius: 13, border: "none", background: danger ? "#0B1428" : "#1B2B4B", color: "#fff", fontSize: 14.5, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 20px rgba(15,26,48,.28)" }}>{okText || (isEdit ? "저장" : "확인")}{!prompt && <Key dark>Enter</Key>}</button>
        </div>
      </div>
    </div>
  );
}

// 한 번에 하나씩 — 앞 창이 닫혀야 다음 창이 뜬다(동시에 여러 개 불려도 Enter 한 번에 다 닫히지 않게)
let chain = Promise.resolve();
function open(props) {
  const run = () => new Promise((resolve) => {
    if (typeof document === "undefined" || !document.body) { resolve(props.prompt ? null : !!props.alertOnly); return; }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v) => { resolve(props.prompt ? (v == null ? null : String(v)) : !!v); setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    root.render(<Dialog {...props} onDone={done} />);
  });
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}
export const kpConfirm = (message, opts = {}) => open({ message, ...opts });
// ✏️ 수정 확인 — kpConfirmEdit({ changes: [{ label: "차량번호", before: "경기12가3456", after: "" }], message?: "덧붙일 말" })
export const kpConfirmEdit = ({ changes = [], message = "", ...opts } = {}) => open({ message: message || "수정하시겠습니까?", edit: true, changes, okText: "저장", ...opts });
// ✅ 2026-11-20 "저장되었습니다" · "수정 완료"처럼 짧은 완료 알림은 [확인]을 누르게 하지 않고 위쪽 알림으로(1.8초 뒤 사라짐)
//  · 제목(title)을 준 알림 · opts.keep 은 지금처럼 창으로 · 오류 · 안내 문구는 그대로 창
export const kpAlert = (message, opts = {}) => {
  if (!opts.keep && !opts.title && isDoneNotice(message)) { showSaved(String(message).trim()); return Promise.resolve(true); }
  return open({ message, alertOnly: true, ...opts });
};
export const kpPrompt = (message, defaultValue = "", opts = {}) => open({ message, prompt: true, defaultValue, ...opts });

// 🔔 브라우저 기본 알림창(window.alert) → 프로그램 디자인 알림창
//  · alert()는 돌려주는 값이 없어 그대로 바꿔도 동작은 같다(창이 떠 있는 동안 뒤 코드가 먼저 돌 뿐)
//  · confirm/prompt는 답을 기다려야 해서 여기서 바꾸지 않는다(각 화면에서 await kpConfirm/kpPrompt 로 바꾼다)
export function installAlertShim() {
  if (typeof window === "undefined" || window.__kpAlertShim) return;
  window.__kpAlertShim = true;
  const native = window.alert ? window.alert.bind(window) : null;
  window.__kpNativeAlert = native;
  window.alert = (msg) => {
    try { kpAlert(msg == null ? "" : String(msg)); } catch { if (native) native(msg); }
  };
}

// ⎋ ESC — 어디서든 맨 위에 열린 창·사이드바를 닫는다(창의 닫기·✕·취소 버튼을 대신 눌러 준다)
//  · 드롭다운·달력이 열려 있으면 그것만 닫히게 양보한다
//  · 다른 화면의 키 처리에 막히지 않도록 가장 먼저(capture) 받는다
const CLOSE_RE = /^(✕|×|x|X|닫기|닫기 ✕|✕ 닫기|취소|← 목록|← 서류함|close|Close)$/;
export function installEscClose() {
  if (typeof window === "undefined" || window.__kpEscInstalled) return;
  window.__kpEscInstalled = true;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.isComposing) return;
    // ⭐ 2026-11-09 지급방식·배차방식(data-opt-menu)·차량종류·운임구분 목록이 열려 있을 때도 양보 — 목록만 닫으려다 오더 창 전체가 닫혔다
    if (document.querySelector("[data-kp-dialog],[data-kp-popup],[data-opt-menu],[data-vt-menu],[data-fare-menu],[data-cs-menu]")) return;
    // 맨 위(나중에 그려진) 화면 덮개·사이드바 찾기
    const overlays = [...document.querySelectorAll("body *")].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") return false;
      const r = el.getBoundingClientRect();
      return r.width >= 280 && r.height >= window.innerHeight * 0.5 && el.querySelector("button");
    });
    for (let i = overlays.length - 1; i >= 0; i--) {
      const btns = [...overlays[i].querySelectorAll("button")].filter((b) => b.offsetParent !== null || getComputedStyle(b).position === "fixed");
      const close = btns.find((b) => CLOSE_RE.test(String(b.textContent || "").trim()) || /닫기|close/i.test(b.getAttribute("aria-label") || b.getAttribute("title") || ""));
      if (close) { e.preventDefault(); close.click(); return; }
    }
  }, true);
}
