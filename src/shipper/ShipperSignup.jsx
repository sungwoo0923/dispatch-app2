// ======================= src/shipper/ShipperSignup.jsx =======================

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function ShipperSignup() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await createUserWithEmailAndPassword(auth, email, password);
      const uid = res.user.uid;

      // 🔐 승인 대기 상태로 생성
      await setDoc(doc(db, "users", uid), {
        email,
        company,
        role: "shipper",
approved: false,
        createdAt: serverTimestamp(),
      });

      navigate("/shipper-pending", { replace: true });

    } catch (err) {
      console.error(err);
      setError(err.message || "회원가입 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-6">
        <h1 className="text-xl font-bold mb-4 text-center">
          화주 회원가입
        </h1>

        <form onSubmit={handleSignup} className="space-y-3">
          <input
            placeholder="회사명"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            className="w-full border px-3 py-2 rounded"
          />

          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border px-3 py-2 rounded"
          />

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border px-3 py-2 rounded"
          />

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <button
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
          >
            {loading ? "처리 중..." : "회원가입"}
          </button>
        </form>
      </div>
    </div>
  );
}
