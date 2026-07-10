import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

// 키보드가 떠 있다고 판단하는 기준: 레이아웃 뷰포트(innerHeight)보다 실제
// 보이는 시각 뷰포트(visualViewport.height)가 이만큼 이상 작아지면 온스크린
// 키보드가 화면을 가리고 있다고 본다. 이 문턱값 밑에서는(키보드 없음) 굳이
// JS로 잰 값을 쓰지 않고 CSS 100dvh에 맡긴다 — visualViewport 값은 모달이
// 열리는 순간 사파리의 크롬(주소창) 애니메이션이 아직 안정화되지 않았을 때
// 실제보다 낮게 잡히는 경우가 있어, 그 순간의 값을 그대로 모달 높이에
// 박아버리면 모달 바닥이 화면 끝에 닿지 못하고 짧게 잘려버렸다(그 틈으로
// 하단 탭바가 비치고, 정작 모달 안 내용/버튼은 화면 밖으로 가려짐).
const KEYBOARD_HEIGHT_THRESHOLD = 150;

const SIZES = {
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
};

// 모달 안에서 또 다른 모달을 여는 중첩 팝업 패턴("내 회사 등록하기" 안의
// "센터 관리" 추가 팝업 등)에서, 둘 다 기본 z-index가 같으면 브라우저의
// DOM 순서 기반 쌓임 규칙에 기대게 되어 리렌더/포털 등 사소한 변화에도
// 뒤 팝업이 앞 팝업 밑에 깔릴 수 있다. 안쪽 모달을 열 때는 zIndex prop으로
// 명시적으로 더 높은 값을 줘서 항상 위에 뜨도록 보장한다.
export default function Modal({ open, onClose, title, children, footer, size = "md", zIndex = 100 }) {
  // 팝업이 뜨면 포커스가 뒤쪽 페이지에 남아있지 않고 팝업 자체로 옮겨가야
  // ESC/스크린리더 등이 팝업 기준으로 동작한다.
  const panelRef = useRef(null);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // iOS Safari는 키보드가 올라와도 레이아웃 뷰포트(100vh/100dvh 계산 기준)를
  // 줄이지 않고 키보드를 그 위에 그냥 덮어씌운다 — 그래서 dvh로 크기를 잡은
  // 모달이 키보드 뒤로 가려져 입력칸이 안 보였다(안드로이드는 반대로 뷰포트
  // 자체가 줄어들어 문제가 없었음). window.visualViewport는 키보드가 올라오면
  // 실제로 보이는 높이를 정확히 반영하므로, 그 값을 모달 높이에 직접 반영해
  // 키보드 위로 밀어올린다.
  //
  // height만 반영했더니 다른 문제가 생겼다 — iOS가 포커스된 입력칸을 보이게
  // 하려고 화면(visual viewport)을 위로 스크롤시키면, visualViewport.offsetTop이
  // 0보다 커지는데 모달은 top:0(레이아웃 뷰포트 기준)에 고정되어 있어서 실제
  // 눈에 보이는 화면 밖(위)으로 밀려나 버렸다. offsetTop도 함께 추적해서 top
  // 위치 자체를 그만큼 내려줘야 실제 보이는 화면과 항상 일치한다.
  const [viewport, setViewport] = useState({ height: null, top: 0 });

  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const keyboardOpen = window.innerHeight - vv.height > KEYBOARD_HEIGHT_THRESHOLD;
      setViewport(keyboardOpen ? { height: vv.height, top: vv.offsetTop } : { height: null, top: 0 });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-x-0 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      style={{ top: viewport.top, height: viewport.height ? `${viewport.height}px` : "100dvh", zIndex }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`flex w-full ${SIZES[size]} max-h-[85%] flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="shrink-0 text-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: footer ? undefined : "max(1rem, calc(env(safe-area-inset-bottom) + 0.75rem))",
          }}
        >
          {children}
        </div>
        {footer && (
          <div
            className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4"
            style={{ paddingBottom: "max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
