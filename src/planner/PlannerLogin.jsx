// src/planner/PlannerLogin.jsx — KP-Planner 전용 로그인 화면(배차프로그램 로그인과 완전히 별개)
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import KPPlannerLogo from "./KPPlannerLogo";
import { plannerLogin } from "./plannerAuth";

const NAVY = "#1B2540";
const PINK = "#EC6FA0";

export default function PlannerLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("이메일과 비밀번호를 입력해 주세요."); return; }
    setLoading(true);
    setError("");
    try {
      await plannerLogin(email, password);
      navigate("/planner", { replace: true });
    } catch (err) {
      setError("로그인에 실패했습니다. 이메일/비밀번호를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
          <KPPlannerLogo scale={0.6} />
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              style={inputStyle}
            />
          </div>
          {error && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{error}</div>}
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#6b7280" }}>
          아직 계정이 없으신가요?{" "}
          <Link to="/planner-signup" style={{ color: PINK, fontWeight: 700, textDecoration: "none" }}>
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 16px",
  fontSize: 14,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  outline: "none",
  color: NAVY,
};

const buttonStyle = {
  width: "100%",
  padding: "13px 16px",
  fontSize: 14,
  fontWeight: 700,
  color: "#fff",
  background: NAVY,
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
};
