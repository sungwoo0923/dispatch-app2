// ======================= src/SecureKeypad.jsx =======================
// 🔐 2026-11-10 최고관리자 · 부관리자 2차 비밀번호 — 화면 키패드(영문 · 숫자 · 기호)
//  로지스웹 본체(src/AdminGate.jsx)와 PnK 인트라넷(pnk-site/src/Auth.jsx)이 같이 쓴다.
//  ⚠ Firebase · Tailwind 를 쓰지 않는다(인트라넷은 묶음이 따로) — 모양은 전부 style 로 적는다.
//  · 화면 단추를 눌러 넣는다. 컴퓨터 자판으로 쳐도 된다(Enter = 확인, Backspace = 지우기)
//  · 넣은 글자는 ● 로만 보인다([보기]를 누르고 있는 동안만 글자가 보인다)
import React from "react";

const ROWS = {
  abc: ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"],
  ABC: ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"],
  sym: ["1234567890", "!@#$%^&*", "._-"],
};
export const KEYPAD_ALLOWED = /^[A-Za-z0-9!@#$%^&*._-]$/;
const NAVY = "#1B2B4B";

export default function SecureKeypad({ value = "", onChange, onSubmit, maxLength = 20, minLength = 8, disabled = false, submitLabel = "확인", dark = false }) {
  const [mode, setMode] = React.useState("abc");
  const [peek, setPeek] = React.useState(false);
  const val = React.useRef(value);
  val.current = value;
  const put = (ch) => { if (!disabled && val.current.length < maxLength) onChange?.(val.current + ch); };
  const del = () => { if (!disabled) onChange?.(val.current.slice(0, -1)); };
  const submit = () => { if (!disabled && val.current.length >= minLength) onSubmit?.(val.current); };
  // 컴퓨터 자판
  const fns = React.useRef({});
  fns.current = { put, del, submit };
  React.useEffect(() => {
    const h = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Enter") { e.preventDefault(); fns.current.submit(); }
      else if (e.key === "Backspace") { e.preventDefault(); fns.current.del(); }
      else if (KEYPAD_ALLOWED.test(e.key)) { e.preventDefault(); fns.current.put(e.key); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const fg = dark ? "#fff" : NAVY;
  const keyStyle = (wide) => ({
    flex: wide ? "1.6 1 0" : "1 1 0", minWidth: 0, height: 44, borderRadius: 10, border: `1px solid ${dark ? "rgba(255,255,255,0.16)" : "#DCE3EE"}`,
    background: dark ? "rgba(255,255,255,0.08)" : "#fff", color: fg, fontSize: 17, fontWeight: 800, cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit", padding: 0, touchAction: "manipulation", userSelect: "none", WebkitTapHighlightColor: "transparent",
  });
  const rows = ROWS[mode];
  const dots = Math.max(minLength, value.length);
  const ok = value.length >= minLength && !disabled;
  return (
    <div data-secure-keypad style={{ width: "100%", opacity: disabled ? 0.6 : 1 }}>
      {/* 넣은 글자 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 46, padding: "0 4px", flexWrap: "wrap" }} aria-label={`${value.length}자 입력함`}>
        {Array.from({ length: dots }).map((_, i) => (
          peek && i < value.length
            ? <span key={i} style={{ width: 16, textAlign: "center", fontSize: 19, fontWeight: 900, color: fg, fontVariantNumeric: "tabular-nums" }}>{value[i]}</span>
            : <span key={i} style={{ width: 14, height: 14, borderRadius: 99, background: i < value.length ? fg : "transparent", border: `2px solid ${i < value.length ? fg : dark ? "rgba(255,255,255,0.3)" : "#C9D3E3"}`, boxSizing: "border-box" }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "2px 2px 8px", fontSize: 12, fontWeight: 700, color: dark ? "rgba(255,255,255,0.6)" : "#7A8AA8" }}>
        <span>{value.length}자{value.length < minLength ? ` · ${minLength}자 이상` : ""}</span>
        <button type="button" onMouseDown={() => setPeek(true)} onMouseUp={() => setPeek(false)} onMouseLeave={() => setPeek(false)} onTouchStart={() => setPeek(true)} onTouchEnd={() => setPeek(false)}
          style={{ border: 0, background: "transparent", color: "inherit", font: "inherit", cursor: "pointer", padding: "4px 2px" }}>누르는 동안 보기</button>
      </div>
      {/* 키패드 */}
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r, ri) => (
          <div key={ri} style={{ display: "flex", gap: 5, justifyContent: "center", padding: mode !== "sym" && ri === 2 ? "0 5%" : 0 }}>
            {mode !== "sym" && ri === 3 && <button type="button" disabled={disabled} onClick={() => setMode(mode === "abc" ? "ABC" : "abc")} style={{ ...keyStyle(true), fontSize: 13, background: mode === "ABC" ? fg : keyStyle().background, color: mode === "ABC" ? (dark ? NAVY : "#fff") : fg }} aria-label="대문자">{mode === "ABC" ? "대문자" : "소문자"}</button>}
            {r.split("").map((ch) => <button key={ch} type="button" disabled={disabled} onClick={() => put(ch)} style={keyStyle()} data-key={ch}>{ch}</button>)}
            {ri === rows.length - 1 && <button type="button" disabled={disabled} onClick={del} style={{ ...keyStyle(true), fontSize: 13 }} aria-label="지우기">지우기</button>}
          </div>
        ))}
        <div style={{ display: "flex", gap: 5 }}>
          <button type="button" disabled={disabled} onClick={() => setMode(mode === "sym" ? "abc" : "sym")} style={{ ...keyStyle(), flex: "1 1 0", fontSize: 13 }}>{mode === "sym" ? "영문" : "기호 !@#"}</button>
          <button type="button" disabled={disabled} onClick={() => onChange?.("")} style={{ ...keyStyle(), flex: "1 1 0", fontSize: 13 }}>전체 지우기</button>
          <button type="button" disabled={!ok} onClick={submit} data-key="submit"
            style={{ ...keyStyle(), flex: "2 1 0", fontSize: 14.5, border: 0, background: ok ? (dark ? "#fff" : NAVY) : dark ? "rgba(255,255,255,0.15)" : "#C9D3E3", color: ok ? (dark ? NAVY : "#fff") : dark ? "rgba(255,255,255,0.5)" : "#fff", cursor: ok ? "pointer" : "default" }}>{submitLabel}</button>
        </div>
      </div>
    </div>
  );
}

// 기기마다 한 번 만드는 임의 값 — 서버가 "로그인한 적 있는 기기"인지 알아보는 데 쓴다(브라우저 저장값을 지우면 새 기기로 본다)
export const ADMIN_DEV_KEY = "kpAdminDev";
export function adminDeviceId() {
  try {
    let v = localStorage.getItem(ADMIN_DEV_KEY);
    if (!v || !/^[A-Za-z0-9_-]{20,80}$/.test(v)) {
      const a = new Uint8Array(24);
      crypto.getRandomValues(a);
      v = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(ADMIN_DEV_KEY, v);
    }
    return v;
  } catch { return ""; }
}
