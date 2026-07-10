import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./hooks/useAuth.jsx";
import { ConfirmProvider } from "./hooks/useConfirm.jsx";
import { ToastProvider } from "./hooks/useToast.jsx";
import { LanguageProvider } from "./hooks/useLanguage.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { tryAutoRecoverOnce } from "./utils/staleChunkRecovery";
import "./index.css";

// React의 ErrorBoundary는 컴포넌트 렌더링 중 에러만 잡는다 — 앱이 아직
// 마운트되기 전 진입 스크립트/청크 로딩 자체가 실패하는 경우(배포 직후
// 예전 탭이 삭제된 파일을 참조할 때)는 window 레벨에서 따로 잡아야 한다.
window.addEventListener("error", (e) => tryAutoRecoverOnce(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => tryAutoRecoverOnce(e.reason));

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
            <ToastProvider>
              <ConfirmProvider>
                <UpdateBanner />
                <App />
              </ConfirmProvider>
            </ToastProvider>
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
