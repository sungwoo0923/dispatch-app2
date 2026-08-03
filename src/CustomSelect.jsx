import React from "react";
import { createPortal } from "react-dom";

const CustomSelect = React.forwardRef(function CustomSelect(
  { value, onChange, className = "", disabled = false, children, placeholder, onFocus, onBlur, onKeyDown, id, name },
  ref
) {
  const [open, setOpen] = React.useState(false);
  const [menuRect, setMenuRect] = React.useState(null);
  const wrapRef = React.useRef(null);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  React.useImperativeHandle(ref, () => ({
    focus: () => btnRef.current?.focus(),
    scrollIntoView: (opts) => btnRef.current?.scrollIntoView(opts),
    value,
  }));

  const options = React.Children.toArray(children)
    .filter((c) => c && typeof c === "object" && c.type === "option")
    .map((c) => ({
      value: c.props.value !== undefined ? c.props.value : (typeof c.props.children === "string" ? c.props.children : ""),
      label: c.props.children,
      disabled: !!c.props.disabled,
    }));
  const current = options.find((o) => String(o.value) === String(value ?? ""));
  const [activeIdx, setActiveIdx] = React.useState(-1);

  // 옵션 글자 길이에 맞춰 드롭다운 목록 폭을 넉넉히 잡는다 — 트리거(닫힌 버튼)가
  // 좁은 칸에 들어있어도(예: 오더복사수정패널의 그리드 칸) 목록을 열었을 때 긴
  // 옵션명("냉장/냉동탑", "24시(외부업체)" 등)이 잘리지 않게 한다.
  const menuMaxContentWidth = React.useMemo(() => {
    let maxLen = 0;
    options.forEach((o) => {
      const text = typeof o.label === "string" ? o.label : "";
      let w = 0;
      for (const ch of text) w += /[ㄱ-힝]/.test(ch) ? 14 : 8;
      if (w > maxLen) maxLen = w;
    });
    return Math.min(480, Math.max(200, maxLen + 56));
  }, [options]);

  // 옵션 목록은 트리거 바로 아래가 아니라 document.body에 fixed로 올려서 그린다 —
  // 이전에는 트리거의 부모를 기준으로 absolute 배치했는데, 부모가 스크롤 가능한
  // 패널(오더복사/수정 패널 등)이면 그 패널의 overflow에 목록이 잘려서 안 보이거나
  // (오더복사수정패널에서 보고된 문제), 반대로 패널 폭을 넘어가며 화면 밖으로
  // 삐져나가는 문제(다른 화면에서 보고된 문제)가 있었다. 화면 좌표 기준으로 직접
  // 위치를 계산하면 어느 스크롤 컨테이너 안에 있든 항상 트리거 바로 아래에 잘리지
  // 않고 뜬다.
  const updateMenuRect = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 220 && r.top > spaceBelow;
    setMenuRect({
      left: r.left,
      width: r.width,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      // 옵션이 많은 목록(시간 선택 등)이 화면 여유 공간을 다 채워 펼쳐지지 않도록
      // 항상 최대 높이를 캡(약 8개 항목)해서 나머지는 스크롤로 보게 한다.
      maxHeight: Math.min(288, Math.max(120, (openUp ? r.top : spaceBelow) - 12)),
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updateMenuRect();
    // 목록 자체의 overflow-auto 스크롤도 캡처 단계에서 "scroll" 이벤트를 발생시키므로,
    // 타겟을 가리지 않고 닫으면 목록 안에서 스크롤만 해도 드롭다운이 즉시 닫혀버린다
    // (시간 선택 드롭다운에서 스크롤하면 사라지던 버그의 원인). 메뉴 내부에서 발생한
    // 스크롤은 무시하고, 배경(트리거를 담은 패널 등)이 스크롤될 때만 닫는다.
    const close = (e) => {
      if (menuRef.current && e?.target && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const onDocDown = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, updateMenuRect]);

  // 방향키로 activeIdx가 바뀔 때마다, 목록이 길어 스크롤이 생겼어도 항상 활성
  // 항목이 보이는 위치로 자동 스크롤한다 — 이게 없으면 방향키를 눌러도 상태(하이라이트
  // 위치)는 바뀌지만 화면에 보이는 스크롤 위치는 그대로라 "방향키가 안 먹는 것"처럼 보인다.
  React.useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const item = menu.children[activeIdx];
    if (!item) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const viewTop = menu.scrollTop;
    const viewBottom = viewTop + menu.clientHeight;
    if (itemBottom > viewBottom) menu.scrollTop = itemBottom - menu.clientHeight;
    if (itemTop < viewTop) menu.scrollTop = itemTop;
  }, [activeIdx, open]);

  // className에 이미 absolute/fixed/relative/sticky 중 하나가 있으면(위치 지정 기준을
  // 이미 스스로 정하고 있는 경우, 예: 배차현황 선택수정 패널처럼 셀렉트 자체가
  // absolute로 입력창 위에 겹쳐지는 구조) 여기서 relative를 추가로 붙이면 안 된다 —
  // 같은 position 속성을 겨루는 유틸리티 클래스가 둘 다 있으면 Tailwind 컴파일
  // 순서상 relative가 항상 이겨서 absolute 배치가 조용히 깨져버린다. 화살표 아이콘
  // 위치 기준은 absolute/fixed/relative/sticky 무엇이든 이미 있으면 충분하다.
  const needsRelative = !/\b(absolute|fixed|relative|sticky)\b/.test(className);

  return (
    // display:contents — 이 래퍼가 실제 레이아웃 박스를 만들지 않게 한다. 코드베이스 안에
    // 이 자리에 select를 쓰던 곳들이 크게 두 가지 방식으로 되어 있었다: (a) select를 담는
    // 별도의 absolute wrapper div가 이미 있는 방식, (b) select 자체에 absolute/h-[30px]/
    // top-1/2 같은 위치·크기 클래스를 직접 준 방식. 여기서 relative/h-full이 있는 진짜
    // div로 감싸면 (b) 방식에서 새 블록 박스가 하나 더 생겨 버튼이 그 박스 안에서 다시
    // 중앙정렬되면서 세로 공간이 두 배로 늘어나 버튼이 칸 아래로 삐져나오는 원인이 됐다.
    // display:contents면 이 div는 레이아웃에 전혀 관여하지 않아 button의 className이
    // 래퍼가 아예 없는 것처럼(원래 select가 있던 자리 그대로) 동작한다.
    <div className="contents" ref={wrapRef}>
      <button
        type="button"
        id={id}
        name={name}
        ref={btnRef}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={() => { if (disabled) return; setOpen((v) => !v); setActiveIdx(Math.max(0, options.findIndex((o) => String(o.value) === String(value ?? "")))); }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (disabled || e.defaultPrevented) return;
          if (["ArrowDown", "ArrowUp", "Enter", " ", "Escape"].includes(e.key)) e.preventDefault();
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { setOpen(true); setActiveIdx(Math.max(0, options.findIndex((o) => String(o.value) === String(value ?? "")))); return; }
          if (!open) return;
          if (e.key === "ArrowDown") {
            setActiveIdx((i) => {
              let next = i;
              for (let k = i + 1; k < options.length; k++) { if (!options[k].disabled) { next = k; break; } }
              const o = options[next];
              // 값이 빈 문자열("없음"/"선택" 등 플레이스홀더성 옵션)로 지나가는 중에는
              // onChange를 쏘지 않는다 — 일부 필드는 값이 비워지는 순간 다른 입력창으로
              // 포커스를 옮기는 등의 부수효과가 있어, 단순히 화살표로 훑고 지나가기만
              // 해도 그 부수효과가 실행되어 방향키 탐색이 끊겨버렸다. 빈 값은 Enter나
              // 클릭으로 확정할 때만 반영한다.
              if (o && !o.disabled && o.value !== "") onChange?.({ target: { value: o.value } });
              return next;
            });
          } else if (e.key === "ArrowUp") {
            setActiveIdx((i) => {
              let next = i;
              for (let k = i - 1; k >= 0; k--) { if (!options[k].disabled) { next = k; break; } }
              const o = options[next];
              if (o && !o.disabled && o.value !== "") onChange?.({ target: { value: o.value } });
              return next;
            });
          } else if (e.key === "Enter") {
            const o = options[activeIdx];
            if (o && !o.disabled) onChange?.({ target: { value: o.value } });
            setOpen(false);
          } else if (e.key === "Escape") setOpen(false);
          else if (e.key === "Tab") {
            // 드롭다운이 열린 채로 Tab을 누르면 선택 없이 바로 다음 칸으로 넘어가
            // 버렸다 — 먼저 현재 활성 항목을 선택(Enter와 동일)한 뒤, Tab의 기본
            // 동작(다음 입력창으로 포커스 이동)은 그대로 이어지게 둔다.
            const o = options[activeIdx];
            if (o && !o.disabled) onChange?.({ target: { value: o.value } });
            setOpen(false);
          }
        }}
        className={`${className}${needsRelative ? " relative" : ""} text-left overflow-hidden text-ellipsis whitespace-nowrap`}
      >
        <span className="pr-4">{current ? current.label : (placeholder || "")}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-80">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && menuRect && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: menuRect.left,
            top: menuRect.top,
            bottom: menuRect.bottom,
            minWidth: menuRect.width,
            maxWidth: Math.max(menuRect.width, menuMaxContentWidth),
            maxHeight: menuRect.maxHeight,
          }}
          className="z-[999999] overflow-auto bg-white border border-gray-200 rounded-lg shadow-xl py-1"
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-gray-400">항목 없음</div>
          )}
          {options.map((o, i) => (
            <div
              key={i}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                if (o.disabled) return;
                onChange?.({ target: { value: o.value } });
                setOpen(false);
              }}
              className={`px-3 py-2 text-[13px] cursor-pointer whitespace-nowrap ${
                o.disabled
                  ? "text-gray-300 cursor-not-allowed"
                  : i === activeIdx
                  ? "bg-[#1B2B4B] text-white font-semibold"
                  : String(o.value) === String(value ?? "")
                  ? "bg-gray-100 text-gray-800 font-semibold"
                  : "text-gray-700"
              }`}
            >
              {o.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
});

export default CustomSelect;
export { CustomSelect };
