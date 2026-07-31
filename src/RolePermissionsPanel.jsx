import React from "react";
import { CustomSelect } from "./CustomSelect";
import {
  CUSTOMIZABLE_MENUS,
  defaultMenuAccess,
  useCustomRoles,
  saveCustomRole,
  deleteCustomRole,
} from "./customRoles";

const ACCESS_LABELS = { hidden: "숨김", read: "조회만", write: "조회+수정" };

export default function RolePermissionsPanel() {
  const customRoles = useCustomRoles();
  const [selectedKey, setSelectedKey] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [newRoleOpen, setNewRoleOpen] = React.useState(false);
  const [newKey, setNewKey] = React.useState("");
  const [newLabel, setNewLabel] = React.useState("");

  const selected = customRoles.find(r => r.key === selectedKey) || null;

  React.useEffect(() => {
    if (selected) setDraft({ label: selected.label || "", menus: { ...defaultMenuAccess(), ...(selected.menus || {}) } });
    else setDraft(null);
  }, [selectedKey, customRoles.length]);

  const createRole = async () => {
    const key = newKey.trim().replace(/[^a-zA-Z0-9_]/g, "");
    const label = newLabel.trim();
    if (!key || !label) { alert("권한 코드(영문)와 표시 이름을 입력하세요."); return; }
    if (customRoles.some(r => r.key === key)) { alert("이미 존재하는 권한 코드입니다."); return; }
    await saveCustomRole(key, { label, menus: defaultMenuAccess() });
    setNewKey(""); setNewLabel(""); setNewRoleOpen(false);
    setSelectedKey(key);
  };

  const saveDraft = async () => {
    if (!selectedKey || !draft) return;
    await saveCustomRole(selectedKey, { label: draft.label, menus: draft.menus });
    alert("저장되었습니다.");
  };

  const removeRole = async (key) => {
    if (!confirm(`"${key}" 권한을 삭제하시겠습니까? 이 권한이 지정된 사용자는 접근 권한을 잃을 수 있습니다.`)) return;
    await deleteCustomRole(key);
    if (selectedKey === key) setSelectedKey(null);
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-1">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-[#1B2B4B] px-4 py-3 flex items-center justify-between">
            <h3 className="text-white font-bold text-[14px]">커스텀 권한 목록</h3>
            <button onClick={() => setNewRoleOpen(v => !v)}
              className="text-[11px] font-bold text-white/80 hover:text-white border border-white/30 rounded px-2 py-1">
              + 새 권한
            </button>
          </div>
          {newRoleOpen && (
            <div className="p-3 border-b border-gray-100 space-y-2 bg-gray-50">
              <input autoComplete="off" placeholder="권한 코드 (영문, 예: subAdmin)" value={newKey}
                onChange={e => setNewKey(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#1B2B4B]" />
              <input autoComplete="off" placeholder="표시 이름 (예: 부관리자)" value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#1B2B4B]" />
              <button onClick={createRole}
                className="w-full py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[12px] font-bold hover:bg-[#243a60] transition">
                생성
              </button>
            </div>
          )}
          {customRoles.length === 0 ? (
            <div className="p-6 text-center text-[12px] text-gray-400">아직 생성된 커스텀 권한이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {customRoles.map(r => (
                <div key={r.key}
                  onClick={() => setSelectedKey(r.key)}
                  className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition ${selectedKey === r.key ? "bg-[#1B2B4B]/5" : "hover:bg-gray-50"}`}>
                  <div>
                    <div className="text-[13px] font-semibold text-gray-800">{r.label}</div>
                    <div className="text-[11px] text-gray-400">{r.key}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeRole(r.key); }}
                    className="text-[11px] text-red-400 hover:text-red-600">삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="col-span-2">
        {!draft ? (
          <div className="bg-white rounded-xl border border-gray-200 text-center py-16 text-[13px] text-gray-400">
            왼쪽에서 권한을 선택하거나 새로 만들어 메뉴별 접근 범위를 설정하세요
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#1B2B4B] px-4 py-3">
              <h3 className="text-white font-bold text-[14px]">{selectedKey} 권한 설정</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1">표시 이름</label>
                <input autoComplete="off" value={draft.label}
                  onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-2">메뉴별 접근 범위</label>
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                  {CUSTOMIZABLE_MENUS.map(m => (
                    <div key={m} className="flex items-center justify-between px-3 py-2">
                      <span className="text-[13px] text-gray-700">{m}</span>
                      <CustomSelect
                        value={draft.menus[m] || "hidden"}
                        onChange={e => setDraft(d => ({ ...d, menus: { ...d.menus, [m]: e.target.value } }))}
                        className="w-[120px] border border-gray-200 rounded-lg px-2 py-1 text-[12px] bg-white focus:outline-none focus:border-[#1B2B4B]"
                      >
                        <option value="hidden">숨김</option>
                        <option value="read">조회만</option>
                        <option value="write">조회+수정</option>
                      </CustomSelect>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={saveDraft}
                className="w-full py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
                저장
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { ACCESS_LABELS };
