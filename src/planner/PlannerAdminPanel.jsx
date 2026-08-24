// src/planner/PlannerAdminPanel.jsx — 최고관리자(owner)만 보이는 관리자 메뉴.
// 가족 정보 수정, 구성원 목록, 모바일 화면 미리보기를 한 곳에서 다룬다.
import React, { useState } from "react";
import { useGroupMembers, updateGroupName } from "./plannerAuth";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER, BG } from "./plannerTheme";
import PlannerMobileShell from "./PlannerMobileShell";
import PlannerUserManagement from "./PlannerUserManagement";
import useBodyScrollLock from "./useBodyScrollLock";

const GENDER_LABEL = { male: "남자", female: "여자" };
const ROLE_LABEL = { owner: "최고관리자", member: "구성원" };

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: ACCENT, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export default function PlannerAdminPanel({ account, onClose, onUpdated }) {
  useBodyScrollLock();
  const members = useGroupMembers(account.groupId);
  const [groupName, setGroupName] = useState(account.groupName || "우리 가족");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const saveGroupName = async () => {
    if (!groupName.trim()) return;
    setSaving(true);
    try {
      await updateGroupName(account.groupId, groupName.trim());
      onUpdated?.({ ...account, groupName: groupName.trim() });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div style={{ position: "relative", width: 480, maxWidth: "100%", height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-8px 0 24px rgba(0,0,0,0.12)" }}>
        <div style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, padding: "18px 24px", borderBottom: `1px solid ${ACCENT_BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#2a2a30" }}>관리자 메뉴</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: "#6b7280", cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "22px 24px" }}>
          <Section title="내 정보">
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>성별</div>
            <div style={{ padding: "9px 12px", fontSize: 12.5, fontWeight: 700, borderRadius: 10, border: `1px solid ${ACCENT_BORDER}`, background: ACCENT_SOFT, color: ACCENT, display: "inline-block" }}>
              {GENDER_LABEL[account.gender || "female"]}
            </div>
            <div style={{ fontSize: 10.5, color: "#7a7a85", marginTop: 6 }}>가입할 때 정한 성별은 변경할 수 없어요.</div>
          </Section>

          <Section title="가족 정보">
            <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                style={{ flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 13, border: `1px solid ${ACCENT_BORDER}`, borderRadius: 10, outline: "none" }}
              />
              <button
                onClick={saveGroupName}
                disabled={saving}
                style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "0 16px", fontSize: 12.5, fontWeight: 700, color: "#fff", background: ACCENT, border: "none", borderRadius: 10, cursor: "pointer" }}
              >
                {saving ? "저장 중..." : savedFlash ? "저장됨" : "저장"}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: "#6b7280" }}>가족 코드: <b style={{ color: "#4b4b55" }}>{account.groupId}</b> (배우자 초대용, 변경 불가)</div>
          </Section>

          <Section title={`구성원 (${members.length}명)`}>
            <div style={{ border: `1px solid ${ACCENT_BORDER}`, borderRadius: 12, overflow: "hidden" }}>
              {members.length === 0 && (
                <div style={{ padding: "16px", fontSize: 12.5, color: "#6b7280", textAlign: "center" }}>불러오는 중...</div>
              )}
              {members.map((m) => (
                <div key={m.uid} style={{ padding: "10px 14px", borderBottom: `1px solid ${ACCENT_SOFT}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#2a2a30" }}>{m.name || "(이름 없음)"}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{m.email}{m.gender ? ` · ${GENDER_LABEL[m.gender] || m.gender}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: ACCENT, background: ACCENT_SOFT, padding: "3px 8px", borderRadius: 999 }}>
                    {ROLE_LABEL[m.role] || m.role}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="가입자 관리">
            <PlannerUserManagement />
          </Section>

          <Section title="모바일 화면 미리보기">
            <div style={{ fontSize: 11.5, color: "#6b7280", marginBottom: 10 }}>실제 휴대폰과 동일한 화면 폭으로 보여줍니다.</div>
            <div
              style={{
                width: 360, maxWidth: "100%", height: 680, margin: "0 auto",
                border: "10px solid #26262b", borderRadius: 32, overflow: "hidden",
                boxShadow: "0 10px 30px rgba(0,0,0,0.18)", position: "relative",
              }}
            >
              <div style={{ width: "100%", height: "100%", overflowY: "auto", background: BG }}>
                <PlannerAdminPanelMobilePreview account={account} />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ⭐ 실제 모바일 화면(PlannerRoot)과 완전히 똑같은 컴포넌트(PlannerMobileShell)를
// 그대로 재사용한다 — 예전엔 AdminPlannerMobile을 직접 불러서 옛날 탭바 UI가
// 미리보기에 보이는 불일치가 있었는데, 공용 컴포넌트로 추출해서 해결했다.
function PlannerAdminPanelMobilePreview({ account }) {
  return <PlannerMobileShell account={account} previewMode />;
}
