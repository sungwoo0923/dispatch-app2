import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useNavigate } from "react-router-dom";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSignup = async () => {
    try {
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", userCred.user.uid), {
        email,
        approved: false,
        role: "user",
        createdAt: new Date(),
      });
      alert("회원가입 완료! 관리자의 승인을 기다려주세요.");
      navigate("/login");
    } catch (error) {
      alert("회원가입 실패: " + error.message);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: 100 }}>
      <h1>회원가입</h1>
      <input
        type="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      /><br />
      <input
        type="password"
        placeholder="비밀번호"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      /><br />
      <button onClick={handleSignup}>회원가입</button><br />
      <button onClick={() => navigate("/login")}>로그인으로 이동</button>
    </div>
  );
}
