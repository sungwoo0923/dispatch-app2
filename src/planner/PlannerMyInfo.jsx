// src/planner/PlannerMyInfo.jsx — "내정보" 메뉴 (PC/모바일 공용, 모든 구성원이 접근 가능).
// 이름/성별을 스스로 수정할 수 있다(성별은 화면 색상 테마에 반영).
import React, { useState } from "react";
import { updateMyProfile } from "./plannerAuth";
import { ACCENT, ACCENT_SOFT, ACCENT_BORDER } from "./plannerTheme";

export default function PlannerMyInfo({ account, onUpdated }) {
  const [name, setName] = useState(account.name || "");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [genderSaving, setGenderSaving] = useState(false);

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateMyProfile(account.uid, { name: name.trim() });
      onUpdated?.({ ...account, name: name.trim() });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1600);
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const changeGender = async (g) => {
    if (g === account.gender || genderSaving) return;
    setGenderSaving(true);
    try {
      await updateMyProfile(account.uid, { gender: g });
      onUpdated?.({ ...account, gender: g });
    } catch (e) {
      alert("저장 중 오류가 발생했습니다: " + e.message);
    } finally {
      setGenderSaving(false);
    }
  };

  return (
    <div className="max-w-sm space-y-5">
      <div>
        <div className="text-[12px] font-semibold text-gray-500 mb-1.5">이름</div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2.5 text-[13.5px] focus:outline-none"
            style={{ borderColor: ACCENT_BORDER }}
          />
          <button onClick={saveName} disabled={saving} className="px-4 rounded-lg text-white text-[12.5px] font-bold" style={{ background: ACCENT }}>
            {saving ? "저장 중" : savedFlash ? "저장됨" : "저장"}
          </button>
        </div>
      </div>

      <div>
        <div className="text-[12px] font-semibold text-gray-500 mb-1.5">성별 (화면 색상 테마 — 남자는 네이비, 여자는 핑크)</div>
        <div className="flex gap-2">
          {[["female", "여자"], ["male", "남자"]].map(([v, l]) => (
            <button
              key={v}
              onClick={() => changeGender(v)}
              disabled={genderSaving}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold border"
              style={
                (account.gender || "female") === v
                  ? { background: ACCENT, color: "#fff", borderColor: ACCENT }
                  : { color: "#9ca3af", borderColor: ACCENT_BORDER }
              }
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border rounded-xl p-3.5 space-y-1.5" style={{ borderColor: ACCENT_BORDER, background: ACCENT_SOFT }}>
        <div className="flex justify-between text-[12.5px]"><span className="text-gray-500">이메일</span><span className="font-semibold text-gray-700">{account.email}</span></div>
        <div className="flex justify-between text-[12.5px]"><span className="text-gray-500">가족 이름</span><span className="font-semibold text-gray-700">{account.groupName || "우리 가족"}</span></div>
        <div className="flex justify-between text-[12.5px]"><span className="text-gray-500">가족 코드</span><span className="font-bold" style={{ color: ACCENT }}>{account.groupId}</span></div>
        <div className="flex justify-between text-[12.5px]"><span className="text-gray-500">역할</span><span className="font-semibold text-gray-700">{account.role === "owner" ? "최고관리자" : "구성원"}</span></div>
      </div>
    </div>
  );
}
