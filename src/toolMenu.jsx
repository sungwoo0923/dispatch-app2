// ======================= src/toolMenu.jsx =======================
// 🧰 2026-11-23 툴바 정리 — 비슷한 버튼 여러 개를 버튼 하나로 묶고, 누르면 작은 목록이 뜬다
//  · 목록은 body에 그린다(portal) — 표 · 창 안쪽에서도 잘리지 않게
//  · 바깥을 누르거나 Esc · 항목을 고르면 닫힌다(체크 항목은 열린 채로 켜고 끈다)
//  · ↑ ↓ 로 고르고 Enter 로 실행
//  · data-kp-popup — 전역 Esc(kpDialog)가 이 목록부터 닫히게 양보한다
//
// items: [{ key?, label, desc?, onClick, disabled?, hidden?, checked?, danger?, file?: { accept, multiple, onChange } }]
//  · checked 가 true/false 면 체크 항목(누르면 켜고 끄기 · 목록은 안 닫힘)
//  · file 이 있으면 누를 때 파일 고르기 창을 연다(input 은 버튼 쪽에 늘 붙어 있어 목록이 닫혀도 onChange 가 온다)
import React from "react";
import { createPortal } from "react-dom";

export const TOOL_BTN = "h-11 px-4 rounded-[13px] bg-white border border-[#E3E8F0] text-[#0F1A30] text-[13px] font-bold hover:border-[#4B6CB7] transition whitespace-nowrap";

function Chevron({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
  );
}

export default function ToolMenuButton({
  label, items = [], className = TOOL_BTN, style, title, align = "right", menuTitle, minWidth = 220,
  disabled = false, testId, active = false, chevron = true,
}) {
  const visible = items.filter((it) => it && !it.hidden);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const [hi, setHi] = React.useState(-1);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const fileRefs = React.useRef({});

  const place = React.useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.max(minWidth, b.width);
    let left = align === "left" ? b.left : b.right - w;
    left = Math.max(8, Math.min(left, vw - w - 8));
    const below = vh - b.bottom - 8;
    const up = below < 180 && b.top > below;
    setPos({ left, width: w, top: up ? undefined : b.bottom + 6, bottom: up ? vh - b.top + 6 : undefined, maxHeight: Math.max(160, (up ? b.top : below) - 12) });
  }, [align, minWidth]);

  const close = React.useCallback(() => { setOpen(false); setHi(-1); }, []);

  React.useLayoutEffect(() => { if (open) place(); }, [open, place]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      close();
    };
    const onMove = () => place();
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, close, place]);

  const run = (it) => {
    if (!it || it.disabled) return;
    const isCheck = typeof it.checked === "boolean";
    if (!isCheck) close();
    if (it.file) { fileRefs.current[it.key || it.label]?.click(); return; }
    it.onClick?.();
  };

  // ⌨ Esc · ↑ ↓ · Enter — 목록이 열려 있을 때만
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.isComposing) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); btnRef.current?.focus(); return; }
      const n = visible.length;
      if (!n) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); e.stopPropagation();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setHi((h) => {
          let k = h;
          for (let i = 0; i < n; i++) { k = (k + step + n) % n; if (!visible[k].disabled) return k; }
          return h;
        });
      } else if (e.key === "Enter" && hi >= 0) {
        e.preventDefault(); e.stopPropagation();
        run(visible[hi]);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!visible.length) return null;

  return (
    <>
      <button type="button" ref={btnRef} title={title} disabled={disabled} data-testid={testId}
        aria-haspopup="menu" aria-expanded={open} data-active={active ? "1" : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={`${className} inline-flex items-center gap-1.5`} style={style}>
        {label}
        {chevron && <Chevron open={open} />}
      </button>
      {visible.filter((it) => it.file).map((it) => (
        <input key={`f-${it.key || it.label}`} ref={(el) => { fileRefs.current[it.key || it.label] = el; }} type="file" hidden
          accept={it.file.accept} multiple={!!it.file.multiple}
          onChange={(e) => { it.file.onChange?.(e); try { e.target.value = ""; } catch { /* noop */ } }} />
      ))}
      {open && pos && createPortal(
        <div ref={menuRef} role="menu" data-kp-popup="1" data-tool-menu=""
          className="fixed z-[2147483100] rounded-[14px] border border-[#DCE3EE] bg-white shadow-[0_18px_44px_rgba(15,26,48,0.22)] overflow-auto py-1.5"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight }}>
          {menuTitle && <div className="px-3.5 pt-1 pb-1.5 text-[11px] font-extrabold tracking-[0.04em] text-[#8A97AD]">{menuTitle}</div>}
          {visible.map((it, i) => {
            const isCheck = typeof it.checked === "boolean";
            const on = hi === i;
            return (
              <button key={it.key || it.label} type="button" role={isCheck ? "menuitemcheckbox" : "menuitem"} aria-checked={isCheck ? it.checked : undefined}
                disabled={it.disabled} title={it.title}
                onMouseEnter={() => setHi(i)} onClick={() => run(it)}
                className={`w-full flex items-start gap-2.5 px-3.5 py-2 text-left transition ${it.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${on && !it.disabled ? "bg-[#F1F5FB]" : ""}`}>
                {isCheck && (
                  <span className={`mt-[2px] w-[17px] h-[17px] shrink-0 rounded-[5px] border flex items-center justify-center ${it.checked ? "bg-[#1B2B4B] border-[#1B2B4B]" : "bg-white border-[#C3CDDD]"}`}>
                    {it.checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13.5px] font-black ${it.danger ? "text-[#C0262D]" : "text-[#0F1A30]"}`}>{it.label}</span>
                  {it.desc && <span className="block mt-0.5 text-[12px] font-medium text-[#6B7A93] leading-snug">{it.desc}</span>}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
