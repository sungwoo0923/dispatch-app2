import { useEffect } from "react";
import { X } from "lucide-react";

const SIZES = {
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
};

export default function Modal({ open, onClose, title, children, footer, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    // 모달이 열려있는 동안 뒤쪽 페이지가 스크롤되지 않도록 막는다. iOS
    // Safari는 body에 overflow:hidden만 줘서는 배경이 계속 스크롤/바운스되는
    // 경우가 많아서(안드로이드 크롬은 그걸로 충분했지만 iOS는 아니었음),
    // body 자체를 position:fixed로 고정하고 스크롤 위치를 기억했다가 닫힐
    // 때 되돌리는 방식을 함께 쓴다 — 이게 없으면 모바일에서 모달 안을
    // 스크롤하려는 손가락 제스처가 뒤쪽 배경 페이지로 먹혀서, 정작 모달
    // 안의 서명/저장 버튼까지 스크롤해서 내려갈 수가 없었다(화면 아래로
    // 잘려 안 보이는 것처럼 느껴짐).
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    // 하단 앱 탭바(EmployeeLayout의 fixed nav)는 모달과 별개의 fixed 요소라
    // z-index만으로는 항상 안전하게 모달 아래로 깔리지 않는다 — 특히
    // iOS Safari에서는 뷰포트 높이 계산(vh) 차이 때문에 모달 바닥이 실제
    // 화면 하단까지 닿지 않는 경우가 있어, 그 틈으로 앱 탭바가 그대로
    // 비치면서 취소/제출 버튼을 가려버렸다. body에 표시를 남겨 모달이 열려
    //있는 동안엔 탭바 자체를 숨긴다(index.css 참고).
    body.dataset.modalOpen = "true";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      delete body.dataset.modalOpen;
      window.scrollTo(0, scrollY);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4">
      <div className={`flex w-full ${SIZES[size]} max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4" style={{ WebkitOverflowScrolling: "touch" }}>
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
