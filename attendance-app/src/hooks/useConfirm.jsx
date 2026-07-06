import { createContext, useCallback, useContext, useRef, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";

const ConfirmContext = createContext(null);

// 앱 루트(main.jsx)에서 한 번 감싸두면, 어느 화면에서든 useConfirm()으로
// "저장하시겠습니까?" 같은 확인 팝업을 띄울 수 있다. 호출부는 다이얼로그의
// JSX/상태를 직접 다루지 않고 Promise<boolean> 하나만 await하면 된다.
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, kind }
  const resolveRef = useRef(null);

  const confirm = useCallback((message, kind = "save") => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ message, kind });
    });
  }, []);

  const settle = (result) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={!!state}
        kind={state?.kind}
        message={state?.message}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
