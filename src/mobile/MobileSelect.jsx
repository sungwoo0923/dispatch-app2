// ======================= src/mobile/MobileSelect.jsx =======================
// ⭐ 2026-11-02 모바일 전용 선택 상자 — 기본 <select>(폰마다 다른 회색 시스템 목록)를
// 그대로 바꿔 끼울 수 있는 남색 바텀시트 선택기.
//  · 사용법은 <select>와 같다: <MobileSelect value onChange className> <option/> … </MobileSelect>
//  · onChange는 기본 select처럼 e.target.value(문자열)를 넘긴다 → 기존 코드 수정 없이 교체 가능
//  · <optgroup>도 지원(그룹 머리줄은 선택 불가)
//  · ref는 실제 버튼에 연결된다(.focus(), .scrollIntoView() 그대로 동작)
//  · <fieldset disabled> 안에 있으면 버튼도 함께 잠긴다(기본 폼 동작)
//  · 손가락으로 누르기 쉽게 버튼 최소 높이 40px, 목록 한 줄 48px
import React from "react";
import { createPortal } from "react-dom";

const SHEET_CSS = `
@keyframes kpMselFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes kpMselUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
.kp-msel-ov { animation: kpMselFade .16s ease-out; }
.kp-msel-sheet { animation: kpMselUp .22s cubic-bezier(.2,.8,.2,1); }
.kp-msel-item:active { background: #E6ECF6 !important; }
`;

function parseOptions(children) {
  const out = [];
  const toOpt = (c) => ({
    value: c.props.value !== undefined ? c.props.value : (typeof c.props.children === "string" ? c.props.children : ""),
    label: c.props.children,
    disabled: !!c.props.disabled,
  });
  const walk = (list) => {
    React.Children.toArray(list).forEach((c) => {
      if (!c || typeof c !== "object") return;
      if (c.type === "option") out.push(toOpt(c));
      else if (c.type === "optgroup") {
        out.push({ value: `__group__${c.props.label}`, label: c.props.label, disabled: true, header: true });
        walk(c.props.children);
      } else if (c.type === React.Fragment) walk(c.props.children);
    });
  };
  walk(children);
  return out;
}

const MobileSelect = React.forwardRef(function MobileSelect(
  { value, onChange, className = "", style, disabled = false, children, placeholder, title, id, name, compact = false, noArrow = false },
  ref
) {
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef(null);
  const options = parseOptions(children);
  const selectable = options.filter((o) => !o.header);
  const cur = selectable.find((o) => String(o.value) === String(value ?? ""));
  // 기본 select와 같게 — 값이 목록에 없으면 첫 항목을 보여준다(placeholder를 줬으면 그걸)
  const shown = cur ? cur.label : (placeholder ?? (selectable[0]?.label ?? ""));
  // 시트 제목: title → 빈 값 옵션의 글자("지급방식", "선택" 등) → "선택"
  const emptyOpt = selectable.find((o) => String(o.value) === "");
  //   ("선택없음", "차종 전체", "없음"처럼 필드 이름이 아닌 글자는 제목으로 쓰지 않는다)
  const emptyLabel = emptyOpt && typeof emptyOpt.label === "string" ? emptyOpt.label.replace(/[()]/g, "").trim() : "";
  const sheetTitle = title || (emptyLabel && !/선택|없음|전체|^-+$/.test(emptyLabel) ? emptyLabel : "") || "선택";

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const el = listRef.current?.querySelector('[data-on="1"]');
      if (el) el.scrollIntoView({ block: "center" });
    }, 0);
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (o) => {
    if (o.disabled) return;
    setOpen(false);
    if (String(o.value) !== String(value ?? "")) {
      const v = String(o.value);
      onChange?.({ target: { value: v, name }, currentTarget: { value: v, name } });
    }
  };

  return (
    <>
      <button
        type="button"
        id={id}
        name={name}
        ref={ref}
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(true); }}
        className={`kp-msel inline-flex items-center gap-1 text-left ${className}`}
        style={{ minHeight: compact ? undefined : 40, ...(style || {}) }}
      >
        <span className={`flex-1 min-w-0 truncate ${cur && String(cur.value) !== "" ? "" : "opacity-70"}`}>{shown}</span>
        {!noArrow && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      {open && createPortal(
        <div
          className="kp-msel-ov"
          data-kp-popup="1"
          // 시트는 document.body에 그려지지만 React 이벤트는 부모 컴포넌트로 거슬러 올라간다 —
          // 바깥(카드 클릭·모달 닫기 등) 핸들러가 잘못 실행되지 않게 여기서 끊는다.
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(15,26,48,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <style>{SHEET_CSS}</style>
          <div
            className="kp-msel-sheet"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 520, maxHeight: "72vh", background: "#fff", borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 40px rgba(15,26,48,0.25)", display: "flex", flexDirection: "column", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
              <div style={{ width: 40, height: 4, borderRadius: 4, background: "#D5DCE7" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 18px 10px" , borderBottom: "1px solid #EEF1F6" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0F1A30", letterSpacing: "-0.01em" }}>{sheetTitle}</div>
              <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 13, fontWeight: 700, color: "#5B6B85", padding: "6px 4px", border: 0, background: "transparent", fontFamily: "inherit" }}>닫기</button>
            </div>
            <div ref={listRef} style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 10px 12px" }}>
              {selectable.length === 0 && (
                <div style={{ padding: "18px 8px", fontSize: 14, color: "#94A3B8", textAlign: "center" }}>항목 없음</div>
              )}
              {options.map((o, i) => {
                if (o.header) {
                  return <div key={i} style={{ padding: "12px 10px 4px", fontSize: 12, fontWeight: 800, color: "#94A3B8", letterSpacing: "0.02em" }}>{o.label}</div>;
                }
                const on = String(o.value) === String(value ?? "");
                return (
                  <button
                    key={i}
                    type="button"
                    data-on={on ? "1" : undefined}
                    disabled={o.disabled}
                    onClick={() => pick(o)}
                    className="kp-msel-item"
                    style={{
                      width: "100%", minHeight: 48, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      padding: "0 14px", margin: "2px 0", borderRadius: 12, textAlign: "left", border: 0, fontFamily: "inherit", cursor: o.disabled ? "default" : "pointer",
                      fontSize: 15, fontWeight: on ? 800 : 500,
                      color: o.disabled ? "#C3CEDF" : on ? "#1B2B4B" : "#0F1A30",
                      background: on ? "#EEF3FB" : "transparent",
                    }}
                  >
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                    {on && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B2B4B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
});

export default MobileSelect;
export { MobileSelect };
