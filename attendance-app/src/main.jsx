import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./hooks/useAuth.jsx";
import { ConfirmProvider } from "./hooks/useConfirm.jsx";
import { ToastProvider } from "./hooks/useToast.jsx";
import { LanguageProvider } from "./hooks/useLanguage.jsx";
import UpdateBanner from "./components/UpdateBanner.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
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
  </StrictMode>
);
