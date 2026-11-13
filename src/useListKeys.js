// ⌨ 2026-11-13 드롭다운 · 추천 목록 공용 키보드 조작
//  ↑/↓ 강조 줄 이동(보이는 곳으로 스크롤) · Enter 강조 줄 고르기 · Esc 닫기(여는 버튼으로 포커스 복귀)
//  · 닫혀 있을 때 ↓ 를 누르면 연다(onOpen 을 준 경우)
//  · 한글 조합 중(IME)에는 아무것도 하지 않는다
//  쓰는 법:
//    const keys = useListKeys({ open, count: list.length, onPick: (i) => pick(list[i]), onClose: () => setOpen(false), onOpen: () => setOpen(true), triggerRef });
//    <div onKeyDown={keys.onKeyDown}> … <div ref={keys.listRef}> {list.map((x, i) => <button {...keys.itemProps(i)} className={keys.active(i) ? "bg-…" : ""}>)} </div></div>
//  onKeyDown 은 React 이벤트 · 브라우저 이벤트(window.addEventListener) 둘 다 받는다. 처리했으면 true 를 돌려준다.
import React from "react";

const FOCUSABLE = "button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex='-1'])";

export function useListKeys({ open, count, onPick, onClose, onOpen, loop = false, initial = -1, resetKey = "", containerRef = null, triggerRef = null }) {
  const [index, setIndexRaw] = React.useState(initial);
  const ownRef = React.useRef(null);
  const listRef = containerRef || ownRef;
  const byKey = React.useRef(false); // 방향키로 옮겼을 때만 스크롤(마우스로 훑을 땐 목록이 튀지 않게)
  const setIndex = React.useCallback((v) => { byKey.current = true; setIndexRaw(v); }, []);

  React.useEffect(() => { if (!open) setIndexRaw(initial); }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const first = React.useRef(true);
  React.useEffect(() => { if (first.current) { first.current = false; return; } setIndexRaw(initial); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (index >= count) setIndexRaw(count - 1); }, [count]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const k = byKey.current; byKey.current = false;
    if (!open || index < 0 || !k) return;
    listRef.current?.querySelector?.(`[data-i="${index}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [index, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const refocus = () => {
    const t = triggerRef?.current;
    if (!t) return;
    setTimeout(() => {
      if (!t.isConnected || t.contains(document.activeElement)) return;
      (t.matches?.(FOCUSABLE) ? t : t.querySelector?.(FOCUSABLE))?.focus?.();
    }, 0);
  };

  const onKeyDown = (e) => {
    const ne = e.nativeEvent || e;
    if (ne.isComposing || e.keyCode === 229 || e.defaultPrevented) return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" && onOpen) {
        e.preventDefault(); onOpen(); byKey.current = true; setIndexRaw(initial >= 0 ? initial : 0);
        return true;
      }
      return false;
    }
    if (k === "ArrowDown" || k === "ArrowUp") {
      if (count <= 0) return false;
      e.preventDefault();
      byKey.current = true;
      setIndexRaw((i) => {
        if (k === "ArrowDown") return i >= count - 1 ? (loop ? 0 : count - 1) : i + 1;
        return i <= 0 ? (loop || i < 0 ? (loop ? count - 1 : 0) : 0) : i - 1;
      });
      return true;
    }
    if (k === "Enter") {
      if (index < 0 || index >= count) return false;
      // 목록 안의 다른 버튼(삭제 · 추가 등)에 포커스가 있을 땐 그 버튼이 눌리게 둔다
      const t = e.target;
      const tag = t?.tagName;
      if (t?.hasAttribute?.("data-i")) return false; // 그 줄에 포커스가 있으면 그 줄이 눌린다
      const ok = !t || t === e.currentTarget || tag === "INPUT" || tag === "TEXTAREA" || tag === "BODY" || !!triggerRef?.current?.contains?.(t);
      if (!ok) return false;
      e.preventDefault(); e.stopPropagation?.();
      onPick?.(index, e);
      return true;
    }
    if (k === "Escape") {
      e.preventDefault(); e.stopPropagation?.();
      onClose?.();
      refocus();
      return true;
    }
    return false;
  };

  const itemProps = (i) => ({ "data-i": i, "data-active": i === index ? "1" : undefined, onMouseEnter: () => setIndexRaw(i) });
  const active = (i) => i === index;
  return { index, setIndex, onKeyDown, itemProps, active, listRef };
}

// 버튼 묶음(카드 · 칸 격자) 안에서 방향키로 포커스를 옮긴다 — Enter 는 포커스된 버튼이 그대로 눌린다
//  cols: 한 줄의 칸 수(↑/↓ 는 cols 만큼, ←/→ 는 1칸). 포커스가 밖에 있으면 [data-cur="1"](지금 값) 또는 첫 버튼으로 간다
export function arrowFocus(e, container, { cols = 1, selector = "button:not([disabled])" } = {}) {
  const ne = e.nativeEvent || e;
  if (ne.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey || !container) return false;
  const step = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (!step) return false;
  const tag = e.target?.tagName;
  if ((tag === "INPUT" || tag === "TEXTAREA") && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return false;
  const els = Array.from(container.querySelectorAll(selector));
  if (!els.length) return false;
  const cur = els.indexOf(document.activeElement);
  let n;
  if (cur < 0) n = Math.max(0, els.findIndex((el) => el.getAttribute("data-cur") === "1"));
  else { n = cur + step; if (n < 0 || n >= els.length) n = cur; }
  e.preventDefault();
  els[n].focus();
  return true;
}

export default useListKeys;
