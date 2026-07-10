import { useEffect } from "react";
import { AlertTriangle, Save, Pencil, Send } from "lucide-react";
import Button from "./Button";

const KIND = {
  delete: { icon: AlertTriangle, tone: "bg-red-50 text-danger", button: "danger", label: "삭제" },
  save: { icon: Save, tone: "bg-primary-light text-primary", button: "primary", label: "저장" },
  edit: { icon: Pencil, tone: "bg-primary-light text-primary", button: "primary", label: "수정" },
  send: { icon: Send, tone: "bg-primary-light text-primary", button: "primary", label: "예" },
};

// 프로그램 전역에서 저장/수정/삭제 액션 전에 뜨는 확인 팝업. useConfirm() 훅으로
// 호출하면 이 컴포넌트가 앱 루트에서 한 번만 렌더링된 상태로 열고 닫힌다.
export default function ConfirmDialog({ open, kind = "save", message, onConfirm, onCancel }) {
  // 엔터=확인, esc=취소 — 이 팝업엔 텍스트 입력란이 없어 전역으로 걸어도
  // 다른 입력을 방해하지 않는다.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm?.();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;
  const { icon: Icon, tone, button, label } = KIND[kind] || KIND.save;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>
          <Icon size={22} />
        </div>
        <p className="mb-6 whitespace-pre-line text-sm text-ink">{message}</p>
        <div className="flex flex-nowrap justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button variant={button} onClick={onConfirm}>
            {label}
          </Button>
        </div>
      </div>
    </div>
  );
}
