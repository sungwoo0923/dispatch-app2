// src/planner/PlannerLogin.jsx — KP-Planner 전용 로그인 화면(배차프로그램 로그인과 완전히 별개)
import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import KPPlannerLogo from "./KPPlannerLogo";
import { plannerLogin } from "./plannerAuth";
import { PINK, PINK_BORDER, INK } from "./plannerTheme";

const SAVED_EMAIL_KEY = "kpplanner_saved_email";

export default function PlannerLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(SAVED_EMAIL_KEY) || ""; } catch { return ""; } });
  const [password, setPassword] = useState("");
  const [rememberId, setRememberId] = useState(() => { try { return !!localStorage.getItem(SAVED_EMAIL_KEY); } catch { return false; } });
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 탭 제목이 배차프로그램의 "KP-Flow Logistics"로 그대로 보여서 분리가 안 된
  // 것처럼 보인다는 피드백 — 이 화면에 들어오면 탭 제목을 KP-Planner로 바꾼다.
  useEffect(() => { document.title = "KP-Planner"; }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("이메일과 비밀번호를 입력해 주세요."); return; }
    setLoading(true);
    setError("");
    try {
      await plannerLogin(email, password, keepSignedIn);
      try {
        if (rememberId) localStorage.setItem(SAVED_EMAIL_KEY, email.trim());
        else localStorage.removeItem(SAVED_EMAIL_KEY);
      } catch {}
      navigate("/planner", { replace: true });
    } catch (err) {
      setError(err.message || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
          <KPPlannerLogo size="md" />
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
          <div style={{ marginBottom: 12 }}>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 12.5, color: "#6e5c67" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={rememberId} onChange={(e) => setRememberId(e.target.checked)} style={{ accentColor: PINK }} />
              아이디 저장
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} style={{ accentColor: PINK }} />
              자동 로그인
            </label>
          </div>
          {error && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{error}</div>}
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#6e5c67" }}>
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
  border: `1px solid ${PINK_BORDER}`,
  borderRadius: 12,
  outline: "none",
  color: INK,
  background: "#fffbfd",
};

const buttonStyle = {
  width: "100%",
  padding: "13px 16px",
  fontSize: 14,
  fontWeight: 700,
  color: "#fff",
  background: PINK,
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
};
