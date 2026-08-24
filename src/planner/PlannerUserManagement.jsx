// src/planner/PlannerUserManagement.jsx — 최고관리자 전용 "가입자 관리".
// 전체 가입자(모든 가족)를 검색하고, 성별을 대신 변경하거나 강제로 탈퇴 처리할 수 있다.
import React, { useMemo, useState } from "react";
import { useAllPlannerAccounts, updateMyProfile, adminRemovePlannerProfile, TOTAL_MASTER_EMAIL } from "./plannerAuth";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

const GENDER_LABEL = { male: "남자", female: "여자" };

function fmtDate(ts) {
  if (!ts?.seconds) return "-";
  const d = new Date(ts.seconds * 1000);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function UserRow({ u, busyUid, onChangeGender, onRemove }) {
  const isMaster = u.email === TOTAL_MASTER_EMAIL;
  return (
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${ACCENT_SOFT}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#2a2a30" }}>
            {u.name || "(이름 없음)"} {isMaster && <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT }}>· 최고관리자</span>}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
          <div style={{ fontSize: 10.5, color: "#7a7a85", marginTop: 2 }}>
            {u.groupName || "우리 가족"} · {u.groupId} · 가입 {fmtDate(u.createdAt)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {["female", "male"].map((v) => (
            <button
              key={v}
              onClick={() => onChangeGender(u.uid, v)}
              disabled={busyUid === u.uid}
              style={{
                padding: "5px 9px", fontSize: 11, fontWeight: 700, borderRadius: 8,
                border: `1px solid ${(u.gender || "female") === v ? ACCENT : ACCENT_BORDER}`,
                background: (u.gender || "female") === v ? ACCENT : "#fff",
                color: (u.gender || "female") === v ? "#fff" : "#6b7280",
                cursor: "pointer",
              }}
            >
              {GENDER_LABEL[v]}
            </button>
          ))}
        </div>
      </div>
      {!isMaster && (
        <div style={{ marginTop: 8, textAlign: "right" }}>
          <button
            onClick={() => onRemove(u)}
            disabled={busyUid === u.uid}
            style={{ fontSize: 10.5, fontWeight: 700, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
          >
            탈퇴 처리
          </button>
        </div>
      )}
    </div>
  );
}

export default function PlannerUserManagement() {
  const accounts = useAllPlannerAccounts();
  const [keyword, setKeyword] = useState("");
  const [busyUid, setBusyUid] = useState("");

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const rows = !k
      ? accounts
      : accounts.filter((u) =>
          (u.name || "").toLowerCase().includes(k) ||
          (u.email || "").toLowerCase().includes(k) ||
          (u.groupName || "").toLowerCase().includes(k) ||
          (u.groupId || "").toLowerCase().includes(k)
        );
    return [...rows].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [accounts, keyword]);

  const changeGender = async (uid, gender) => {
    setBusyUid(uid);
    try {
      await updateMyProfile(uid, { gender });
    } catch (e) {
      alert("변경 중 오류가 발생했습니다: " + e.message);
    } finally {
      setBusyUid("");
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`${u.name || u.email} 님을 탈퇴 처리할까요? (${u.groupName || "우리 가족"} 가족에서 제외됩니다)`)) return;
    setBusyUid(u.uid);
    try {
      await adminRemovePlannerProfile(u.uid);
    } catch (e) {
      alert("탈퇴 처리 중 오류가 발생했습니다: " + e.message);
    } finally {
      setBusyUid("");
    }
  };

  return (
    <div>
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="이름/이메일/가족이름/가족코드 검색"
        style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", fontSize: 12.5, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 10, outline: "none", marginBottom: 10 }}
      />
      <div style={{ fontSize: 11, color: "#7a7a85", marginBottom: 8 }}>전체 {accounts.length}명{keyword ? ` · 검색결과 ${filtered.length}명` : ""}</div>
      <div style={{ border: `1px solid ${ACCENT_BORDER}`, borderRadius: 12, overflow: "hidden", maxHeight: 420, overflowY: "auto" }}>
        {filtered.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 12.5, color: "#6b7280" }}>가입자가 없습니다</div>}
        {filtered.map((u) => (
          <UserRow key={u.uid} u={u} busyUid={busyUid} onChangeGender={changeGender} onRemove={remove} />
        ))}
      </div>
    </div>
  );
}
