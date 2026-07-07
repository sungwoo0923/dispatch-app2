import { createContext, useCallback, useContext, useRef, useState } from "react";
import ToastStack from "../components/Toast";

const ToastContext = createContext(null);

let nextId = 1;

// 앱 루트(main.jsx)에서 한 번 감싸두면, 어느 화면에서든 useToast()로 저장/삭제/
// 수정 성공 배너를 띄울 수 있다. useConfirm()이 "저장하시겠습니까?"처럼 액션
// 이전 확인을 담당한다면, 이건 그 반대편 — 실제로 Firestore 쓰기가 끝난 뒤
// "저장되었습니다"처럼 결과를 보여주는 역할이다.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const show = useCallback(
    (message, tone = "success") => {
      const id = nextId++;
      setToasts((list) => [...list, { id, message, tone }]);
      timers.current[id] = setTimeout(() => dismiss(id), 2500);
    },
    [dismiss]
  );

  const toast = useRef({
    success: (message) => show(message, "success"),
    error: (message) => show(message, "error"),
  }).current;

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastStack toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
