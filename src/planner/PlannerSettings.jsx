// src/planner/PlannerSettings.jsx — "설정" 메뉴 (PC/모바일 공용).
// 지금은 알림 켜기/끄기 하나뿐이지만, 앞으로 설정 항목이 늘어나도 여기 한 곳에
// 모아두는 화면.
import React, { useState } from "react";
import { updateMyProfile } from "./plannerAuth";
import { ACCENT, ACCENT_BORDER } from "./plannerTheme";

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="w-11 h-6 rounded-full relative shrink-0 transition-colors"
      style={{ background: on ? ACCENT : "#d1d5db" }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
        style={{ left: on ? 22 : 2 }}
      />
    </button>
  );
}

export default function PlannerSettings({ account, onUpdated }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(account.notificationsEnabled !== false);
  const [saving, setSaving] = useState(false);

  const toggle = async (next) => {
    setNotificationsEnabled(next);
    setSaving(true);
    try {
      await updateMyProfile(account.uid, { notificationsEnabled: next });
      onUpdated?.({ ...account, notificationsEnabled: next });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-sm space-y-4">
      <div className="bg-white border rounded-xl p-4" style={{ borderColor: ACCENT_BORDER }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold text-gray-700">알림</div>
            <div className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
              생리 예정일·기념일 알림창을 켜고 끌 수 있어요.
            </div>
          </div>
          <Toggle on={notificationsEnabled} onChange={toggle} />
        </div>
        {saving && <div className="text-[10.5px] text-gray-400 mt-2">저장 중...</div>}
      </div>
    </div>
  );
}
