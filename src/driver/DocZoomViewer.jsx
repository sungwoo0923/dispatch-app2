// ======================= src/driver/DocZoomViewer.jsx =======================
// ⭐ 2026-11-10 기사앱 서류 확대 보기 — 계약서·명세서처럼 큰 종이(기본 폭 794px)를 전체 화면으로 연다.
//  · 처음엔 화면 폭에 맞춤 · 두 손가락으로 확대·축소 · [−][맞춤][+] 버튼 · 확대하면 손가락으로 끌어서 이동(스크롤)
//  · 여러 장은 위아래로 스크롤 · [저장] 버튼(onSave) · Esc·닫기
import React from "react";
import { createPortal } from "react-dom";

const MONO = "'Noto Sans KR','Apple SD Gothic Neo','맑은 고딕','Malgun Gothic',sans-serif";

export default function DocZoomViewer({ title = "서류", width = 794, onClose, onSave, saving = false, children }) {
  const box = React.useRef(null);
  const inner = React.useRef(null);
  const [fit, setFit] = React.useState(0.45);
  const [z, setZ] = React.useState(null); // null = 맞춤
  const [h, setH] = React.useState(0);
  const pinch = React.useRef(null);
  const zoom = z ?? fit;
  React.useEffect(() => {
    const calc = () => { const w = (box.current?.clientWidth || 360) - 16; setFit(Math.min(1, w / width)); };
    calc(); window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [width]);
  React.useEffect(() => {
    const el = inner.current; if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => setH(el.offsetHeight)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  // 확대·축소할 때 화면 가운데를 기준으로 스크롤 위치를 맞춘다
  const setZoomAt = (next, cx, cy) => {
    const el = box.current; if (!el) { setZ(next); return; }
    const nz = Math.min(4, Math.max(fit, next));
    const r = el.getBoundingClientRect();
    const px = (cx ?? r.left + r.width / 2) - r.left; const py = (cy ?? r.top + r.height / 2) - r.top;
    const ux = (el.scrollLeft + px) / zoom; const uy = (el.scrollTop + py) / zoom;
    setZ(Math.abs(nz - fit) < 0.01 ? null : nz);
    requestAnimationFrame(() => { el.scrollLeft = ux * nz - px; el.scrollTop = uy * nz - py; });
  };
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinch.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: zoom, cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setZoomAt(pinch.current.z * (d / pinch.current.d), pinch.current.cx, pinch.current.cy);
    }
  };
  // 두 손가락 확대는 브라우저 기본 확대 대신 이 화면이 처리(passive 아님)
  React.useEffect(() => {
    const el = box.current; if (!el) return undefined;
    const tm = (e) => { if (e.touches.length === 2) e.preventDefault(); };
    el.addEventListener("touchmove", tm, { passive: false });
    return () => el.removeEventListener("touchmove", tm);
  }, []);
  const btn = { height: 42, minWidth: 42, padding: "0 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 17, fontWeight: 900, cursor: "pointer" };
  return createPortal(
    <div data-doc-viewer style={{ position: "fixed", inset: 0, zIndex: 2147483600, background: "rgba(6,12,26,.96)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", paddingTop: "max(10px, env(safe-area-inset-top))", color: "#fff" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, letterSpacing: "0.24em", color: "#8FB0F0" }}>DOCUMENT</div>
          <div style={{ fontSize: 16, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        </div>
        {onSave && <button type="button" style={{ ...btn, background: "#fff", color: "#0F1A30", border: "none" }} onClick={onSave} disabled={saving}>{saving ? "저장 중…" : "⤓ 저장"}</button>}
        <button type="button" style={btn} onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <div ref={box} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { pinch.current = null; }}
        onWheel={(e) => { if (e.ctrlKey) { e.preventDefault(); setZoomAt(zoom * (e.deltaY < 0 ? 1.12 : 0.9), e.clientX, e.clientY); } }}
        onDoubleClick={(e) => setZoomAt(z ? fit : Math.min(4, fit * 2.2), e.clientX, e.clientY)}
        style={{ flex: 1, overflow: "auto", overscrollBehavior: "contain", padding: 8, touchAction: "pan-x pan-y" }}>
        <div style={{ width: width * zoom, height: h ? h * zoom : undefined, margin: zoom <= fit + 0.001 ? "0 auto" : 0 }}>
          <div ref={inner} style={{ width, transform: `scale(${zoom})`, transformOrigin: "top left", background: "#fff", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
            {children}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: 10, paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <button type="button" style={btn} onClick={() => setZoomAt(zoom / 1.3)} aria-label="축소">−</button>
        <button type="button" style={{ ...btn, minWidth: 92, fontSize: 14 }} onClick={() => setZ(null)}>{z ? `${Math.round((zoom / fit) * 100)}% · 맞춤` : "화면 맞춤"}</button>
        <button type="button" style={btn} onClick={() => setZoomAt(zoom * 1.3)} aria-label="확대">+</button>
      </div>
    </div>,
    document.body,
  );
}
