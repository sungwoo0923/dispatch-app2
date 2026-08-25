// src/planner/PlannerSettings.jsx — "설정" 메뉴 (PC/모바일 공용).
// 알림 켜기/끄기 외에, 최고관리자 계정에는 실제 앱에서 뜨는 알림창들을 상황별로
// 골라서 즉시 미리 볼 수 있는 테스트 패널이 추가로 보인다.
import React, { useState } from "react";
import { updateMyProfile, TOTAL_MASTER_EMAIL } from "./plannerAuth";
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

// ⭐ 실제 알림 로직(PlannerAlertBanner/PlannerMoodToast)을 진짜로 발동시키지
// 않고, 그 상황일 때 화면에 어떻게 보이는지를 예시 문구로 똑같이 재현해서
// 즉시 띄워준다 — 실데이터를 건드리지 않는 순수 미리보기용이라 최고관리자가
// 언제든 안전하게 눌러볼 수 있다.
const NOTIF_PREVIEWS = [
  { key: "cycle_d3", label: "생리 예정일 D-3 알림", kind: "banner", text: "상대방님의 생리가 3일 남았어요." },
  { key: "cycle_fun", label: "생리 예정일 D-2·D-1 (다정 멘트)", kind: "banner", text: "상대방님 생리 D-2! 오늘은 그냥 다 받아주는 날로 정하는 거 어때요?" },
  { key: "anniv_30", label: "기념일 D-30 알림", kind: "banner", text: "\"사랑한지 100일\"이(가) 한 달 뒤예요." },
  { key: "anniv_7", label: "기념일 D-7 알림", kind: "banner", text: "\"사랑한지 100일\"이(가) 일주일 뒤예요." },
  { key: "anniv_0", label: "기념일 당일(D-0) 알림", kind: "banner", text: "\"사랑한지 100일\"이(가) 오늘이에요." },
  { key: "mood", label: "오늘의 기분 변경 알림(토스트)", kind: "toast", text: "오늘 상대방님은 기분이 매우 좋습니다" },
];

function NotificationPreviewPanel() {
  const [preview, setPreview] = useState(null); // { key, kind, text, showKey }
  const timerRef = React.useRef(null);

  const fire = (item) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPreview({ ...item, showKey: Date.now() });
    timerRef.current = setTimeout(() => setPreview(null), 3600);
  };

  return (
    <div className="bg-white border rounded-xl p-4" style={{ borderColor: ACCENT_BORDER }}>
      <div className="text-[13px] font-bold text-gray-700">알림창 테스트 (최고관리자 전용)</div>
      <div className="text-[11px] text-gray-400 mt-0.5 mb-3 leading-relaxed">
        아래에서 상황을 고르면, 실제 그 상황일 때 뜨는 알림창이 예시 문구로 이 화면에 바로 나타나요. 실제 알림은 아니라 데이터에는 영향 없어요.
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {NOTIF_PREVIEWS.map((item) => (
          <button
            key={item.key}
            onClick={() => fire(item)}
            className="text-left px-3 py-2 rounded-lg border text-[12px] font-semibold text-gray-600"
            style={{ borderColor: ACCENT_BORDER }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {preview?.kind === "banner" && (
        <div key={preview.showKey} style={{ position: "fixed", top: 8, left: 0, right: 0, zIndex: 100010, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ pointerEvents: "auto", maxWidth: "92vw", width: 380, background: "#fff", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: `1.5px solid ${ACCENT}`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: ACCENT, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "#374151", lineHeight: 1.4 }}>{preview.text}</div>
            <button onClick={() => setPreview(null)} style={{ flexShrink: 0, background: "none", border: "none", color: "#9ca3af", fontSize: 15, lineHeight: 1, cursor: "pointer" }}>✕</button>
          </div>
        </div>
      )}

      {preview?.kind === "toast" && (
        <div
          key={preview.showKey}
          style={{ position: "fixed", top: 14, left: "50%", zIndex: 100010, transform: "translateX(-50%)", pointerEvents: "none" }}
        >
          <div style={{ background: ACCENT, color: "#fff", padding: "9px 18px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", whiteSpace: "nowrap" }}>
            {preview.text}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlannerSettings({ account, onUpdated }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(account.notificationsEnabled !== false);
  const [saving, setSaving] = useState(false);
  const isOwner = account.email === TOTAL_MASTER_EMAIL;

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

      {isOwner && <NotificationPreviewPanel />}
    </div>
  );
}
