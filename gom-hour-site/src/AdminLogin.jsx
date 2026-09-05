// ======================= gom-hour-site/src/AdminLogin.jsx =======================
// 관리자 로그인. Firebase Auth 계정으로 로그인하면 /admin(대시보드)로 이동한다.
// 계정 발급은 Firebase 콘솔 → Authentication에서 이메일/비밀번호로 직접 추가하면 된다.
import React, { useState } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const login = async () => {
    setError("");
    setMsg("");
    if (!email.trim() || !pw) return setError("이메일과 비밀번호를 입력해주세요.");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      nav("/admin", { replace: true });
    } catch (e) {
      setError(
        ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(e.code)
          ? "이메일 또는 비밀번호가 올바르지 않습니다."
          : e.message || "로그인 중 오류가 발생했습니다."
      );
    } finally {
      setLoading(false);
    }
  };

  const resetPw = async () => {
    setError("");
    setMsg("");
    if (!email.trim()) return setError("비밀번호를 재설정할 이메일을 입력해주세요.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg("비밀번호 재설정 메일을 보냈습니다.");
    } catch {
      setError("재설정 메일 발송에 실패했습니다.");
    }
  };

  const inputCls =
    "w-full border border-line rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition";

  return (
    <div className="min-h-screen bg-secondary flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-6">
          <img src="/logo.jpg" alt="GOM_Hour" className="w-16 h-16 object-contain rounded-full mx-auto mb-2" />
          <p className="text-lg font-bold text-primary">GOM_Hour 관리자</p>
        </div>

        <div
          className="bg-white border border-line rounded-2xl shadow-sm p-7 space-y-3"
          onKeyDown={(e) => {
            if (e.key === "Enter") login();
          }}
        >
          <input
            className={inputCls}
            placeholder="이메일"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="비밀번호"
            type="password"
            autoComplete="off"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />

          {error && <div className="text-xs text-red-500 font-semibold px-1">{error}</div>}
          {msg && <div className="text-xs text-emerald-600 font-semibold px-1">{msg}</div>}

          <button
            onClick={login}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          <button onClick={resetPw} className="text-xs text-gray-400 block mx-auto pt-1">
            비밀번호를 잊으셨나요?
          </button>
        </div>
      </div>
    </div>
  );
}
