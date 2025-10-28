import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const userRef = doc(db, "users", userCred.user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        alert("회원 정보가 없습니다. 관리자에게 문의하세요.");
        return;
      }

      const userData = userSnap.data();
      if (userData.approved) {
        alert("로그인 성공!");
        navigate("/dashboard");
      } else {
        alert("승인 대기 중입니다. 관리자 승인 후 이용 가능합니다.");
      }
    } catch (error) {
      alert("로그인 실패: " + error.message);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: 100 }}>
      <h1>회사 배차 시스템</h1>
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
      <button onClick={handleLogin}>로그인</button><br />
      <button onClick={() => navigate("/signup")}>회원가입</button>
    </div>
  );
}
