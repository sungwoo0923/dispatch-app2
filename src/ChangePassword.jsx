// ===================== ChangePassword.jsx =====================
import React, { useState } from "react";
import { auth } from "./firebase";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const changePw = async () => {
    if (!currentPw || !newPw) { setError("모든 항목을 입력해 주세요."); return; }
    if (newPw.length < 6) { setError("새 비밀번호는 6자 이상이어야 합니다."); return; }
    setError("");
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) { setError("로그인이 필요합니다."); return; }

      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);

      alert("비밀번호가 변경되었습니다.");
      navigate(-1);
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("현재 비밀번호가 올바르지 않습니다.");
      } else if (err.code === "auth/requires-recent-login") {
        setError("보안을 위해 다시 로그인 후 변경해 주세요.");
        setTimeout(() => navigate("/login"), 1500);
      } else {
        setError("변경 실패: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-[360px] overflow-hidden">
        {/* Header */}
        <div className="bg-[#1B2B4B] px-6 py-5">
          <h2 className="text-white font-bold text-[16px]">비밀번호 변경</h2>
          <p className="text-white/50 text-[12px] mt-0.5">현재 비밀번호 확인 후 변경됩니다</p>
        </div>

        {/* Form */}
        <div className="px-6 py-6 space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">현재 비밀번호</label>
            <input
              type="password"
              placeholder="현재 비밀번호 입력"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
              value={currentPw}
              onChange={(e) => { setCurrentPw(e.target.value); setError(""); }}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-gray-500 mb-1.5">새 비밀번호</label>
            <input
              type="password"
              placeholder="새 비밀번호 입력 (6자 이상)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#1B2B4B] transition"
              value={newPw}
              onChange={(e) => { setNewPw(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && changePw()}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-[13px] text-red-600">
              {error}
            </div>
          )}

          <button
            onClick={changePw}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[14px] font-bold transition disabled:opacity-50 mt-2"
          >
            {loading ? "변경 중..." : "변경하기"}
          </button>

          <button
            onClick={() => navigate(-1)}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"
          >
            돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
