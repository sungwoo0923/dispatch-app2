// ===================== ChangePassword.jsx =====================
import React, { useState } from "react";
import { auth } from "./firebase";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");

    const changePw = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return alert("로그인이 필요합니다.");

      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);

      await updatePassword(user, newPw);

      alert("비밀번호가 성공적으로 변경되었습니다!");
      navigate("/app");
    } catch (err) {
      console.log(err);

      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        alert("현재 비밀번호가 올바르지 않습니다. 다시 입력해주세요.");
        return;
      }

      if (err.code === "auth/requires-recent-login") {
        alert("다시 로그인한 뒤 비밀번호를 변경해야 합니다.");
        navigate("/login");
        return;
      }

      alert("비밀번호 변경 실패: " + err.message);
    }
  };


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <div className="bg-white shadow p-6 rounded w-80">
        <h2 className="text-lg font-bold mb-4 text-center">비밀번호 변경</h2>

        <input
          type="password"
          placeholder="현재 비밀번호"
          className="border p-2 rounded w-full mb-3"
          value={currentPw}
          onChange={(e) => setCurrentPw(e.target.value)}
        />
        <input
          type="password"
          placeholder="새 비밀번호"
          className="border p-2 rounded w-full mb-4"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
        />

        <button
          onClick={changePw}
          className="bg-blue-600 text-white w-full py-2 rounded"
        >
          변경하기
        </button>

        <button
          onClick={() => navigate("/app")}
          className="mt-3 text-gray-600 text-sm underline w-full text-center"
        >
          돌아가기
        </button>
      </div>
    </div>
  );
}
