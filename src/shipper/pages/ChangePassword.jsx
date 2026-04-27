import React, { useState } from "react";
import { auth } from "../../firebase";
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function ChangePassword() {
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const user = auth.currentUser;

  const changePassword = async () => {
    try {
      if (!currentPassword || !newPassword) {
        alert("모든 값을 입력하세요.");
        return;
      }

      if (newPassword.length < 6) {
        alert("비밀번호는 최소 6자리 이상");
        return;
      }

      // 🔐 기존 비밀번호 검증
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      await reauthenticateWithCredential(user, credential);

      // 🔐 새 비밀번호 변경
      await updatePassword(user, newPassword);

      alert("비밀번호 변경 완료");
      navigate("/shipper");

    } catch (err) {
      console.error(err);

      if (err.code === "auth/wrong-password") {
        alert("현재 비밀번호가 틀렸습니다.");
      } else {
        alert("변경 실패");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-6 rounded-xl w-[360px] shadow">

        <h2 className="text-lg font-bold mb-4">비밀번호 변경</h2>

        <input
          type="password"
          placeholder="현재 비밀번호"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full border px-3 py-2 mb-3 rounded"
        />

        <input
          type="password"
          placeholder="새 비밀번호"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full border px-3 py-2 mb-4 rounded"
        />

        <button
          onClick={changePassword}
          className="w-full bg-blue-500 text-white py-2 rounded"
        >
          변경하기
        </button>

        <button
          onClick={() => navigate(-1)}
          className="w-full mt-2 border py-2 rounded"
        >
          취소
        </button>
      </div>
    </div>
  );
}