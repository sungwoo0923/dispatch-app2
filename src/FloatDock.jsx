// ======================= src/FloatDock.jsx =======================
// 🛸 오른쪽 아래 떠 있는 도구(메신저 · 계산기 · AI 비서) 공용 디자인(2026-10-31)
//  · FabButton: 네이비 그라데이션 사각 알약 + 은은한 빛 · 마우스를 올리면 왼쪽에 이름표
//  · useWinSize: 창 크기(작게·보통·크게 + 왼쪽 위 모서리 드래그) — 도구별로 기억
//  · WinHeader: 창 머리말(영문 코드 · 제목 · 크기 버튼 · 닫기)
import React from "react";

const MONO = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace";
export const DOCK_BG = "linear-gradient(145deg, #0B1428 0%, #1B2B4B 55%, #2D4C82 100%)";

// ⭐ 2026-11-02 화면 점검 — 떠 있는 버튼이 내정보 "나의 통계"·회계 개요 미수금 금액을 가리던 문제
//  · 56px → 44px로 줄이고(오른쪽 여백 24 → 16), 쉬는 동안은 반투명(0.55) — 마우스를 올리거나 열려 있거나 안 읽은 배지가 있으면 또렷하게
//  · 위치(bottom)는 각 도구가 정한 값을 그대로 쓴다(24 · 88 · 152 간격 유지)
const FAB_SIZE = 44;
// ⭐ 2026-11-02 화면 점검 — 오른쪽에서 밀려 나오는 서랍(내정보 등)이 열려 버튼 아래에 깔리면 거의 투명하게(마우스를 올리면 다시 보임)
//  · 0.8초마다 버튼 자리 밑을 한 번 살핀다(elementsFromPoint) — 화면 오른쪽 끝에 붙은 세로 전체 패널일 때만(가운데 모달은 그대로)
function useUnderRightDrawer(ref) {
  const [under, setUnder] = React.useState(false);
  React.useEffect(() => {
    const check = () => {
      const el = ref.current;
      if (!el || typeof document.elementsFromPoint !== "function") return;
      const r = el.getBoundingClientRect();
      const W = window.innerWidth; const H = window.innerHeight;
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).filter((x) => !el.contains(x) && x !== document.body && x !== document.documentElement);
      const isFixed = (x) => !!x && getComputedStyle(x).position === "fixed";
      const hit = stack.slice(0, 12).some((x) => {
        const b = x.getBoundingClientRect();
        return b.right >= W - 1 && b.left > W * 0.35 && b.top <= 1 && b.bottom >= H - 1 && (isFixed(x) || isFixed(x.parentElement));
      });
      setUnder((p) => (p === hit ? p : hit));
    };
    check();
    const t = setInterval(check, 800);
    return () => clearInterval(t);
  }, [ref]);
  return under;
}
export function FabButton({ bottom = 24, right = 16, active = false, title, onClick, badge = 0, children, z = 99998 }) {
  const [hover, setHover] = React.useState(false);
  const boxRef = React.useRef(null);
  const underDrawer = useUnderRightDrawer(boxRef);
  const vivid = hover || active || (badge > 0 && !underDrawer);
  return (
    <div ref={boxRef} data-ro-allow style={{ position: "fixed", bottom, right, zIndex: z, opacity: vivid ? 1 : underDrawer ? 0.12 : 0.55, transition: "opacity .18s" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      {hover && !active && (
        <span style={{ position: "absolute", right: FAB_SIZE + 10, top: "50%", transform: "translateY(-50%)", whiteSpace: "nowrap", background: "#0F1A30", color: "#fff", fontSize: 12.5, fontWeight: 800, padding: "6px 10px", borderRadius: 10, boxShadow: "0 8px 20px rgba(15,26,48,0.3)", letterSpacing: "0.02em" }}>{title}</span>
      )}
      <button type="button" onClick={onClick} title={title} aria-label={title}
        style={{
          width: FAB_SIZE, height: FAB_SIZE, borderRadius: 14, border: "none", cursor: "pointer", color: "#fff", position: "relative",
          background: active ? "linear-gradient(145deg,#F4F7FD,#DCE6F8)" : DOCK_BG,
          boxShadow: active ? "0 0 0 2px #2D4C82, 0 12px 28px rgba(15,26,48,0.35)" : "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(143,176,240,0.28), 0 8px 18px rgba(15,26,48,0.32), 0 0 14px rgba(110,149,232,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transform: hover ? "translateY(-2px)" : "none", transition: "transform .15s, box-shadow .15s",
        }}>
        <span style={{ color: active ? "#1B2B4B" : "#fff", display: "flex", transform: "scale(0.88)" }}>{children}</span>
        {badge > 0 && !active && (
          <span style={{ position: "absolute", top: -5, right: -5, minWidth: 20, height: 20, padding: "0 5px", borderRadius: 10, background: "#E5484D", color: "#fff", fontSize: 10.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 2px #fff", fontFamily: MONO }}>{badge > 99 ? "99+" : badge}</span>
        )}
      </button>
    </div>
  );
}

// 창 크기 — 프리셋(작게·보통·크게) + 왼쪽 위 모서리 드래그(오른쪽 아래에 붙어 있으므로)
export function useWinSize(key, presets, min = { w: 300, h: 360 }) {
  const read = () => { try { const v = JSON.parse(localStorage.getItem(`kpWin:${key}`) || "null"); if (v && v.w && v.h) return v; } catch { /* 무시 */ } return { ...presets.M, p: "M" }; };
  const [size, setSize] = React.useState(read);
  const save = (v) => { setSize(v); try { localStorage.setItem(`kpWin:${key}`, JSON.stringify(v)); } catch { /* 무시 */ } };
  const clamp = (w, h) => ({ w: Math.max(min.w, Math.min(w, window.innerWidth - 48)), h: Math.max(min.h, Math.min(h, window.innerHeight - 140)) });
  const setPreset = (p) => save({ ...clamp(presets[p].w, presets[p].h), p });
  const startDrag = (e) => {
    e.preventDefault();
    const sx = e.clientX; const sy = e.clientY; const sw = size.w; const sh = size.h;
    const mv = (ev) => setSize({ ...clamp(sw + (sx - ev.clientX), sh + (sy - ev.clientY)), p: "" });
    const up = (ev) => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); save({ ...clamp(sw + (sx - ev.clientX), sh + (sy - ev.clientY)), p: "" }); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  const fit = clamp(size.w, size.h);
  return { w: fit.w, h: fit.h, preset: size.p, setPreset, startDrag };
}

export function ResizeGrip({ onMouseDown }) {
  return (
    <div onMouseDown={onMouseDown} title="드래그해서 크기 조절"
      style={{ position: "absolute", top: 0, left: 0, width: 22, height: 22, cursor: "nw-resize", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "16px 0 10px 0", background: "rgba(255,255,255,0.14)" }}>
      <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M1 9L9 1M1 5L5 1" stroke="#CFE0FF" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </div>
  );
}

export function SizeButtons({ preset, onPick, dark = true }) {
  return (
    <div style={{ display: "inline-flex", padding: 2, borderRadius: 9, background: dark ? "rgba(255,255,255,0.10)" : "#EEF2F8", gap: 2 }}>
      {[["S", "작게"], ["M", "보통"], ["L", "크게"]].map(([k, l]) => (
        <button key={k} type="button" onClick={() => onPick(k)} title={`${l}`}
          style={{ height: 24, minWidth: 28, padding: "0 6px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 900, fontFamily: MONO, background: preset === k ? (dark ? "#fff" : "#0F1A30") : "transparent", color: preset === k ? (dark ? "#0F1A30" : "#fff") : (dark ? "rgba(255,255,255,0.7)" : "#5B6B85") }}>{k}</button>
      ))}
    </div>
  );
}

export function WinHeader({ code, title, sub, preset, onPreset, onClose, right }) {
  return (
    <div style={{ background: DOCK_BG, color: "#fff", padding: "12px 14px 12px 28px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.08, backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "18px 18px", pointerEvents: "none" }} />
      <div style={{ minWidth: 0, flex: 1, position: "relative" }}>
        <div style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.26em", color: "#8FB0F0" }}>{code}</div>
        <div style={{ fontSize: 15.5, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}{sub && <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginLeft: 8 }}>{sub}</span>}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
        {right}
        {onPreset && <SizeButtons preset={preset} onPick={onPreset} />}
        {onClose && <button type="button" onClick={onClose} title="닫기" style={{ width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, fontWeight: 900 }}>✕</button>}
      </div>
    </div>
  );
}
