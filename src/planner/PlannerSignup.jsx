// src/planner/PlannerSignup.jsx — KP-Planner 전용 회원가입.
// "새 가족 만들기"(그룹 코드를 새로 만드는 사람 = owner) 또는
// "코드로 참여하기"(배우자 등, 이미 만들어진 가족 코드로 합류 = member) 중 선택.
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import KPPlannerLogo from "./KPPlannerLogo";
import { signupCreateGroup, signupJoinGroup, randomGroupCode } from "./plannerAuth";

const NAVY = "#1B2540";
const PINK = "#EC6FA0";

export default function PlannerSignup() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("create"); // "create" | "join"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState(() => randomGroupCode());
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [doneCode, setDoneCode] = useState(""); // 생성 직후, 코드 안내 화면

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("이름을 입력해 주세요.");
    if (!email.trim()) return setError("이메일을 입력해 주세요.");
    if (password.length < 6) return setError("비밀번호는 6자 이상이어야 합니다.");
    if (mode === "join" && !joinCode.trim()) return setError("가족 코드를 입력해 주세요.");

    setLoading(true);
    setError("");
    try {
      if (mode === "create") {
        const { groupId } = await signupCreateGroup({ email, password, name, groupCode, groupName });
        setDoneCode(groupId);
      } else {
        await signupJoinGroup({ email, password, name, groupCode: joinCode });
        navigate("/planner", { replace: true });
      }
    } catch (err) {
      setError(err.message || "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (doneCode) {
    return (
      <div style={{ minHeight: "100vh", width: "100%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
          <KPPlannerLogo scale={0.55} />
          <div style={{ marginTop: 28, padding: "22px 20px", border: `1px solid ${PINK}55`, borderRadius: 16, background: "#fff5f9" }}>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8, fontWeight: 600 }}>우리 가족 코드</div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 4, color: NAVY }}>{doneCode}</div>
            <div style={{ fontSize: 12.5, color: "#9ca3af", marginTop: 10, lineHeight: 1.6 }}>
              이 코드를 배우자 등 함께 쓸 사람에게 알려주세요.<br />
              가입할 때 "코드로 참여하기"에 이 코드를 입력하면 같은 가족 화면을 공유합니다.
            </div>
          </div>
          <button onClick={() => navigate("/planner", { replace: true })} style={{ ...buttonStyle, marginTop: 24 }}>
            시작하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <KPPlannerLogo scale={0.55} />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          {[["create", "새 가족 만들기"], ["join", "코드로 참여하기"]].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMode(v)}
              style={{
                flex: 1, padding: "10px 6px", fontSize: 13, fontWeight: 700, borderRadius: 10,
                border: `1px solid ${mode === v ? NAVY : "#e5e7eb"}`,
                background: mode === v ? NAVY : "#fff",
                color: mode === v ? "#fff" : "#6b7280",
                cursor: "pointer",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" style={{ ...inputStyle, marginBottom: 12 }} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" style={{ ...inputStyle, marginBottom: 12 }} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" style={{ ...inputStyle, marginBottom: 12 }} />

          {mode === "create" ? (
            <>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="가족 이름 (예: 우리 가족, 선택)" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>가족 코드 (배우자 초대용, 원하는 대로 바꿀 수 있어요)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={groupCode}
                    onChange={(e) => setGroupCode(e.target.value.toUpperCase())}
                    style={{ ...inputStyle, flex: 1, letterSpacing: 2, fontWeight: 700 }}
                  />
                  <button type="button" onClick={() => setGroupCode(randomGroupCode())} style={regenBtnStyle}>
                    재생성
                  </button>
                </div>
              </div>
            </>
          ) : (
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="가족 코드"
              style={{ ...inputStyle, marginBottom: 14, letterSpacing: 2, fontWeight: 700 }}
            />
          )}

          {error && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{error}</div>}
          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? "처리 중..." : "회원가입"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#6b7280" }}>
          이미 계정이 있으신가요?{" "}
          <Link to="/planner-login" style={{ color: PINK, fontWeight: 700, textDecoration: "none" }}>
            로그인
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

const regenBtnStyle = {
  padding: "0 14px",
  fontSize: 12.5,
  fontWeight: 700,
  color: NAVY,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
