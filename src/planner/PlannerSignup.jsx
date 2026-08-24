// src/planner/PlannerSignup.jsx — KP-Planner 전용 회원가입.
// "새 가족 만들기"(그룹 코드를 새로 만드는 사람) 또는
// "코드로 참여하기"(배우자 등, 이미 만들어진 가족 코드로 합류) 중 선택.
// ⭐ 배우자 초대 링크(?code=XXXXXX&joinGender=female)로 들어오면 "코드로 참여하기"
// 모드로 자동 전환되고 코드가 채워지며, 성별도 자동으로 고정된다(초대한 사람이
// 이미 자기 성별을 알고 있으니 "반대 성별"을 링크에 실어 보낸 것 — Firestore
// 조회 없이 비로그인 상태에서도 항상 동작한다).
import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import KPPlannerLogo from "./KPPlannerLogo";
import PlannerDatePicker from "./PlannerDatePicker";
import { signupCreateGroup, signupJoinGroup, randomGroupCode, normalizeGroupCode } from "./plannerAuth";
import { shareInvite } from "./plannerInvite";
import { addPlannerEntry } from "../adminPlannerData";
import { ACCENT, ACCENT_DARK, ACCENT_SOFT, ACCENT_BORDER, applyGenderTheme } from "./plannerTheme";

export default function PlannerSignup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlCode = (searchParams.get("code") || "").trim().toUpperCase();
  const urlJoinGender = searchParams.get("joinGender");
  const urlGenderValid = urlJoinGender === "male" || urlJoinGender === "female";

  useEffect(() => { document.title = "KP-Planner"; }, []);
  const [mode, setMode] = useState(urlCode ? "join" : "create"); // "create" | "join"
  const [name, setName] = useState("");
  const [gender, setGender] = useState(urlGenderValid ? urlJoinGender : "female"); // "male" | "female" — 로그인 후(및 이 화면에서도) 전체 테마에 즉시 반영
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthday, setBirthday] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState(() => randomGroupCode());
  const [joinCode, setJoinCode] = useState(urlCode || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [doneCode, setDoneCode] = useState(""); // 생성 직후, 코드 안내 화면
  const [sharing, setSharing] = useState(false);
  const [shareFlash, setShareFlash] = useState("");

  // ⭐ 화면을 그리기 전에 현재 선택된 성별의 팔레트를 반영한다 — PlannerRoot와 같은
  // 패턴(useEffect가 아니라 렌더 본문에서 직접 호출)이라, 성별 버튼을 누르는 순간
  // 같은 렌더에서 바로 새 색상으로 그려진다(깜빡임 없음).
  applyGenderTheme(gender);

  const genderLocked = mode === "join" && urlGenderValid;

  // ⭐ 생일을 입력했으면 "매년 반복" 일정으로 자동 등록해둔다 — 항상 등록돼 있고,
  // 나중에 일정 메뉴에서 삭제도 가능하다(생일/기념일 요구사항).
  const addBirthdaySchedule = async (groupId) => {
    if (!birthday) return;
    try {
      await addPlannerEntry({
        type: "schedule", companyName: groupId, title: `${name.trim()}님 생일`,
        date: birthday, category: "생일", recurring: true, createdByName: name.trim(),
      });
    } catch {
      // 생일 일정 등록 실패는 가입 자체를 막지 않는다.
    }
  };

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
        const { groupId } = await signupCreateGroup({ email, password, name, gender, groupCode, groupName, birthday });
        await addBirthdaySchedule(groupId);
        setDoneCode(groupId);
      } else {
        await signupJoinGroup({ email, password, name, gender, groupCode: joinCode, birthday });
        await addBirthdaySchedule(normalizeGroupCode(joinCode));
        navigate("/planner", { replace: true });
      }
    } catch (err) {
      setError(err.message || "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const invite = async () => {
    setSharing(true);
    try {
      const result = await shareInvite({ groupCode: doneCode, groupName: groupName || "우리 가족", myName: name, myGender: gender });
      if (result === "copied") { setShareFlash("초대 문구를 복사했어요. 카카오톡 등에 붙여넣어 보내주세요."); setTimeout(() => setShareFlash(""), 3000); }
      if (result === "failed") alert("공유에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setSharing(false);
    }
  };

  const inputStyle = {
    width: "100%", boxSizing: "border-box", padding: "13px 16px", fontSize: 14,
    border: `1px solid ${ACCENT_BORDER}`, borderRadius: 12, outline: "none", color: "#2a2a30", background: "#fffbfd",
  };
  const buttonStyle = {
    width: "100%", padding: "13px 16px", fontSize: 14, fontWeight: 700, color: "#fff",
    background: ACCENT, border: "none", borderRadius: 12, cursor: "pointer",
  };
  const regenBtnStyle = {
    padding: "0 14px", fontSize: 12.5, fontWeight: 700, color: ACCENT, background: "#fff",
    border: `1px solid ${ACCENT_BORDER}`, borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap",
  };

  if (doneCode) {
    return (
      <div style={{ minHeight: "100vh", width: "100%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
          <KPPlannerLogo size="md" />
          <div style={{ marginTop: 28, padding: "22px 20px", border: `1px solid ${ACCENT_BORDER}`, borderRadius: 16, background: ACCENT_SOFT }}>
            <div style={{ fontSize: 13, color: "#6e5c67", marginBottom: 8, fontWeight: 600 }}>우리 가족 코드</div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: 4, color: ACCENT_DARK }}>{doneCode}</div>
            <div style={{ fontSize: 12.5, color: "#7d6a75", marginTop: 10, lineHeight: 1.6 }}>
              이 코드를 배우자 등 함께 쓸 사람에게 알려주세요.<br />
              아래 "배우자에게 공유하기"를 누르면 가입 링크와 코드가 한번에 전달돼요.
            </div>
          </div>
          <button onClick={invite} disabled={sharing} style={{ ...buttonStyle, marginTop: 20 }}>
            {sharing ? "준비 중..." : "배우자에게 공유하기"}
          </button>
          {shareFlash && <div style={{ fontSize: 11.5, color: "#7d6a75", marginTop: 8 }}>{shareFlash}</div>}
          <button
            onClick={() => navigate("/planner", { replace: true })}
            style={{ ...buttonStyle, marginTop: 10, background: "#fff", color: ACCENT, border: `1px solid ${ACCENT_BORDER}` }}
          >
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
          <KPPlannerLogo size="md" />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          {[["create", "새 가족 만들기"], ["join", "코드로 참여하기"]].map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setMode(v)}
              style={{
                flex: 1, padding: "10px 6px", fontSize: 13, fontWeight: 700, borderRadius: 10,
                border: `1px solid ${mode === v ? ACCENT : ACCENT_BORDER}`,
                background: mode === v ? ACCENT : "#fff",
                color: mode === v ? "#fff" : "#7d6a75",
                cursor: "pointer",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" style={{ ...inputStyle, marginBottom: 12 }} />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#7d6a75", marginBottom: 6, fontWeight: 600 }}>
              성별 (화면 색상에 바로 반영돼요){genderLocked ? " — 배우자 초대로 자동 지정됨" : ""}
            </div>
            {genderLocked ? (
              <div style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, borderRadius: 10, border: `1px solid ${ACCENT_BORDER}`, background: ACCENT_SOFT, color: ACCENT }}>
                {gender === "male" ? "남자" : "여자"}로 가입돼요 (초대한 배우자와 반대 성별로 자동 지정)
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                {[["female", "여자"], ["male", "남자"]].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGender(v)}
                    style={{
                      flex: 1, padding: "10px 6px", fontSize: 13, fontWeight: 700, borderRadius: 10,
                      border: `1px solid ${gender === v ? ACCENT : ACCENT_BORDER}`,
                      background: gender === v ? ACCENT : "#fff",
                      color: gender === v ? "#fff" : "#7d6a75",
                      cursor: "pointer",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" style={{ ...inputStyle, marginBottom: 12 }} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호 (6자 이상)" style={{ ...inputStyle, marginBottom: 12 }} />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#7d6a75", marginBottom: 6, fontWeight: 600 }}>생일 (선택 — 다가오면 알림에 나와요)</div>
            <PlannerDatePicker value={birthday} onChange={setBirthday} placeholder="생일 선택" />
          </div>

          {mode === "create" ? (
            <>
              <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="가족 이름 (예: 우리 가족, 선택)" style={{ ...inputStyle, marginBottom: 12 }} />
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#7d6a75", marginBottom: 6, fontWeight: 600 }}>가족 코드 (배우자 초대용, 원하는 대로 바꿀 수 있어요)</div>
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

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#6e5c67" }}>
          이미 계정이 있으신가요?{" "}
          <Link to="/planner-login" style={{ color: ACCENT, fontWeight: 700, textDecoration: "none" }}>
            로그인
          </Link>
        </div>
      </div>
    </div>
  );
}
