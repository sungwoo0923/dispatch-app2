// ======================= src/RolePermissionsPanel.jsx =======================
// ⭐ 권한 관리(최고관리자 전용) — 2026-10-22 재구성
//  [역할별 설정] 왼쪽: 역할 카드(기본 역할 / 직접 만든 역할 / 고정 역할) + 인원수·권한 요약
//               오른쪽: 메뉴를 업무별로 묶어 [숨김 | 조회 | 수정] 3단 버튼으로 설정, 빠른 설정·다른 역할 복사
//                       "소속 직원" 탭에서 그 역할을 쓰는 직원 확인·역할 바꾸기
//  [한눈에 비교] 모든 역할 × 모든 메뉴 권한 표
// 저장 형식은 예전과 같다(customRoles/{역할키} = { label, menus }) — 실제 메뉴 차단은 DispatchApp이 그대로 읽는다.
import React from "react";
import { db } from "./firebase";
import { doc, updateDoc } from "firebase/firestore";
import {
  CUSTOMIZABLE_MENUS,
  defaultMenuAccess,
  builtinDefaultMenuAccess,
  BUILTIN_EDITABLE_ROLES,
  useCustomRoles,
  saveCustomRole,
  deleteCustomRole,
} from "./customRoles";

const genRoleKey = () => `role_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const MENU_GROUPS = [
  { title: "배차 업무", menus: ["HOME", "배차관리", "실시간배차현황", "배차현황"] },
  { title: "운임 · 단가", menus: ["단가표", "운임조회"] },
  { title: "기준 정보", menus: ["기사관리", "거래처관리", "지입차관리"] },
  { title: "재무", menus: ["매출관리", "정산관리"] },
  { title: "회사", menus: ["회사관리"] },
];
const MENU_DESC = {
  HOME: "첫 화면 대시보드", 배차관리: "오더 등록 · 수정", 실시간배차현황: "진행 중인 배차 모니터링", 배차현황: "전체 배차 목록 · 검색",
  단가표: "거래처별 단가표", 운임조회: "지난 운임 조회", 기사관리: "기사 · 차량 정보", 거래처관리: "거래처 · 상하차지",
  지입차관리: "지입차 운영", 매출관리: "매출 · 매익 리포트", 정산관리: "청구 · 기사 지급", 회사관리: "회사정보 · 출근기록",
};
const ROLE_DESC = {
  admin: "회사 업무 전체를 관리", hrManager: "인사관리부까지 볼 수 있는 실무자", user: "배차 실무 담당",
  test: "정산 · 회계 담당", viewer: "보기만 가능",
};
const FIXED_ROLES = [
  { key: "totalMaster", label: "최고관리자", desc: "모든 메뉴 · 모든 회사 (변경 불가)" },
  { key: "driver", label: "기사", desc: "기사앱 전용" },
  { key: "shipper", label: "화주", desc: "화주 프로그램 전용" },
];
const LEVELS = [
  { v: "hidden", label: "숨김", on: "bg-gray-500 text-white", dot: "bg-gray-300" },
  { v: "read", label: "조회", on: "bg-blue-500 text-white", dot: "bg-blue-400" },
  { v: "write", label: "수정", on: "bg-[#1B2B4B] text-white", dot: "bg-[#1B2B4B]" },
];
const PRESETS = [
  { label: "전체 수정 가능", make: () => Object.fromEntries(CUSTOMIZABLE_MENUS.map((m) => [m, "write"])) },
  { label: "전체 조회만", make: () => Object.fromEntries(CUSTOMIZABLE_MENUS.map((m) => [m, "read"])) },
  { label: "모두 숨김", make: () => Object.fromEntries(CUSTOMIZABLE_MENUS.map((m) => [m, m === "HOME" ? "read" : "hidden"])) },
];

function effectiveMenus(key, customRoles) {
  const saved = customRoles.find((r) => r.key === key);
  const isBuiltin = BUILTIN_EDITABLE_ROLES.some((b) => b.key === key);
  const base = isBuiltin ? builtinDefaultMenuAccess(key) : defaultMenuAccess();
  return { ...base, ...(saved?.menus || {}) };
}

const SummaryBar = ({ menus }) => {
  const n = CUSTOMIZABLE_MENUS.length;
  const c = { write: 0, read: 0, hidden: 0 };
  CUSTOMIZABLE_MENUS.forEach((m) => { c[menus[m] || "hidden"] += 1; });
  return (
    <div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
        <div className="bg-[#1B2B4B]" style={{ width: `${(c.write / n) * 100}%` }} />
        <div className="bg-blue-400" style={{ width: `${(c.read / n) * 100}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-gray-500">수정 {c.write} · 조회 {c.read} · 숨김 {c.hidden}</div>
    </div>
  );
};

const LevelSwitch = ({ value, onChange, size = "md" }) => (
  <div className={`inline-flex rounded-lg bg-gray-100 p-0.5 ${size === "sm" ? "" : "shrink-0"}`}>
    {LEVELS.map((l) => (
      <button
        key={l.v}
        type="button"
        onClick={() => onChange(l.v)}
        className={`${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-[12.5px]"} rounded-md font-bold transition ${value === l.v ? l.on + " shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
      >{l.label}</button>
    ))}
  </div>
);

export default function RolePermissionsPanel({ users = [], roleLabels = {} }) {
  const customRoles = useCustomRoles();
  const [view, setView] = React.useState("edit"); // edit | matrix
  const [selectedKey, setSelectedKey] = React.useState("admin");
  const [draft, setDraft] = React.useState(null);
  const [tab, setTab] = React.useState("menus"); // menus | members
  const [creating, setCreating] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [copyFrom, setCopyFrom] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState("");

  const customOnly = customRoles.filter((r) => !BUILTIN_EDITABLE_ROLES.some((b) => b.key === r.key));
  const allEditable = [...BUILTIN_EDITABLE_ROLES.map((b) => ({ key: b.key, label: customRoles.find((r) => r.key === b.key)?.label || b.label, builtin: true })),
    ...customOnly.map((r) => ({ key: r.key, label: r.label || r.key, builtin: false }))];
  const isBuiltin = BUILTIN_EDITABLE_ROLES.some((b) => b.key === selectedKey);
  const saved = customRoles.find((r) => r.key === selectedKey) || null;
  const current = allEditable.find((r) => r.key === selectedKey);
  const memberCount = (key) => users.filter((u) => (u.role || "user") === key).length;
  const members = users.filter((u) => (u.role || "user") === selectedKey);

  // 선택한 역할의 저장된 값으로 편집본을 만든다(저장된 값이 바뀌면 다시 맞춘다)
  const savedSig = JSON.stringify(saved || null);
  React.useEffect(() => {
    if (!current) { setDraft(null); return; }
    setDraft({ label: current.label, menus: effectiveMenus(selectedKey, customRoles) });
  }, [selectedKey, savedSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseline = current ? JSON.stringify({ label: current.label, menus: effectiveMenus(selectedKey, customRoles) }) : "";
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const flash = (t) => { setToast(t); setTimeout(() => setToast(""), 2200); };

  const pick = (key) => {
    if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 버리고 다른 역할로 이동할까요?")) return;
    setSelectedKey(key); setTab("menus");
  };
  const setMenu = (m, v) => setDraft((d) => ({ ...d, menus: { ...d.menus, [m]: v } }));
  const setGroup = (g, v) => setDraft((d) => ({ ...d, menus: { ...d.menus, ...Object.fromEntries(g.menus.map((m) => [m, v])) } }));

  const save = async () => {
    if (!draft || !draft.label.trim()) return alert("역할 이름을 입력하세요.");
    setSaving(true);
    try { await saveCustomRole(selectedKey, { label: draft.label.trim(), menus: draft.menus }); flash("저장했습니다"); } catch (e) { alert(`저장 실패: ${e?.message || e}`); } finally { setSaving(false); }
  };
  const resetOrDelete = async () => {
    const msg = isBuiltin
      ? `"${current?.label}" 역할을 처음 기본값으로 되돌릴까요?`
      : `"${current?.label}" 역할을 삭제할까요? 이 역할을 쓰는 직원 ${members.length}명은 메뉴가 모두 숨겨집니다. 먼저 "소속 직원" 탭에서 다른 역할로 옮기는 것을 권합니다.`;
    if (!window.confirm(msg)) return;
    await deleteCustomRole(selectedKey);
    if (!isBuiltin) setSelectedKey("admin");
    flash(isBuiltin ? "기본값으로 되돌렸습니다" : "삭제했습니다");
  };
  const createRole = async () => {
    const label = newLabel.trim();
    if (!label) return alert("새 역할 이름을 입력하세요.");
    const key = genRoleKey();
    const menus = copyFrom ? effectiveMenus(copyFrom, customRoles) : defaultMenuAccess();
    await saveCustomRole(key, { label, menus });
    setCreating(false); setNewLabel(""); setCopyFrom("");
    setSelectedKey(key); setTab("menus");
    flash("새 역할을 만들었습니다");
  };
  const changeUserRole = async (u, role) => {
    if (!window.confirm(`${u.name || u.email}님의 역할을 "${roleLabels[role] || role}"(으)로 바꿀까요?`)) return;
    try { await updateDoc(doc(db, "users", u.id), { role }); flash("역할을 바꿨습니다"); } catch (e) { alert(`변경 실패: ${e?.message || e}`); }
  };

  const RoleCard = ({ r }) => {
    const on = r.key === selectedKey;
    const customized = r.builtin && customRoles.some((c) => c.key === r.key);
    return (
      <button onClick={() => pick(r.key)} className={`w-full text-left rounded-xl border px-3.5 py-3 transition ${on ? "border-[#1B2B4B] bg-[#EEF3FB] shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}>
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-gray-800 truncate">{r.label}</span>
          {customized && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">수정됨</span>}
          <span className="ml-auto text-[11.5px] font-bold text-gray-500 shrink-0">{memberCount(r.key)}명</span>
        </div>
        <div className="text-[11.5px] text-gray-500 mt-0.5 mb-2 truncate">{ROLE_DESC[r.key] || "직접 만든 역할"}</div>
        <SummaryBar menus={effectiveMenus(r.key, customRoles)} />
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {toast && <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[99999] bg-[#1B2B4B] text-white px-5 py-2.5 rounded-xl shadow-lg text-[13px] font-semibold">{toast}</div>}

      {/* 상단: 보기 전환 + 범례 */}
      <div className="bg-white rounded-2xl border border-gray-200 px-5 py-3.5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          {[["edit", "역할별 설정"], ["matrix", "한눈에 비교"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold transition ${view === k ? "bg-white text-[#1B2B4B] shadow-sm" : "text-gray-500"}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[12px] text-gray-600 ml-auto">
          {LEVELS.slice().reverse().map((l) => (
            <span key={l.v} className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${l.dot}`} />{l.label}{l.v === "write" ? " (등록·수정·삭제)" : l.v === "read" ? " (보기만)" : " (메뉴 안 보임)"}</span>
          ))}
        </div>
      </div>

      {view === "matrix" ? (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#1B2B4B] text-white">
                <th className="px-4 py-3 text-left font-semibold">메뉴</th>
                <th className="px-3 py-3 text-center font-semibold whitespace-nowrap">최고관리자</th>
                {allEditable.map((r) => <th key={r.key} className="px-3 py-3 text-center font-semibold whitespace-nowrap">{r.label}<div className="text-[10.5px] font-normal text-white/60">{memberCount(r.key)}명</div></th>)}
              </tr>
            </thead>
            <tbody>
              {MENU_GROUPS.map((g) => (
                <React.Fragment key={g.title}>
                  <tr className="bg-gray-50"><td colSpan={allEditable.length + 2} className="px-4 py-1.5 text-[11.5px] font-black text-gray-500 tracking-wide">{g.title}</td></tr>
                  {g.menus.map((m) => (
                    <tr key={m} className="border-t border-gray-100">
                      <td className="px-4 py-2.5"><b className="text-gray-800">{m}</b> <span className="text-[11.5px] text-gray-400">{MENU_DESC[m]}</span></td>
                      <td className="px-3 py-2.5 text-center"><span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#1B2B4B] text-white">수정</span></td>
                      {allEditable.map((r) => {
                        const v = effectiveMenus(r.key, customRoles)[m] || "hidden";
                        const L = LEVELS.find((x) => x.v === v);
                        return (
                          <td key={r.key} className="px-3 py-2.5 text-center">
                            <button onClick={() => { setView("edit"); pick(r.key); }} title="눌러서 이 역할 설정하기"
                              className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${v === "hidden" ? "bg-gray-100 text-gray-400" : L.on}`}>{L.label}</button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 text-[12px] text-gray-500 border-t">※ 칸을 누르면 그 역할 설정 화면으로 이동합니다. 관리자메뉴·관리센터는 권한관리 자체라 역할로 열 수 없습니다.</div>
        </div>
      ) : (
        <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-4 items-start">
          {/* 왼쪽: 역할 목록 */}
          <div className="space-y-4">
            <div>
              <div className="px-1 mb-2 text-[12px] font-black text-gray-500 tracking-wide">기본 역할</div>
              <div className="space-y-2">{allEditable.filter((r) => r.builtin).map((r) => <RoleCard key={r.key} r={r} />)}</div>
            </div>
            <div>
              <div className="px-1 mb-2 flex items-center">
                <span className="text-[12px] font-black text-gray-500 tracking-wide">직접 만든 역할</span>
                {!creating && <button onClick={() => setCreating(true)} className="ml-auto text-[12px] font-bold text-[#1B2B4B] hover:underline">+ 새 역할</button>}
              </div>
              {creating && (
                <div className="rounded-xl border border-[#1B2B4B]/30 bg-white p-3 space-y-2 mb-2">
                  <input autoFocus autoComplete="off" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="역할 이름 (예: 부관리자)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]" />
                  <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[13px] outline-none bg-white">
                    <option value="">처음부터 (HOME만 보이게)</option>
                    {allEditable.map((r) => <option key={r.key} value={r.key}>{r.label} 권한 복사해서 시작</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { setCreating(false); setNewLabel(""); }} className="py-2 rounded-lg border border-gray-300 text-[12.5px] font-bold text-gray-600">취소</button>
                    <button onClick={createRole} className="py-2 rounded-lg bg-[#1B2B4B] text-white text-[12.5px] font-bold">만들기</button>
                  </div>
                </div>
              )}
              {allEditable.filter((r) => !r.builtin).length === 0 && !creating ? (
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-[12.5px] text-gray-500">아직 없습니다. 회사에 맞는 역할(예: 부관리자, 영업)을 만들어 보세요.</div>
              ) : (
                <div className="space-y-2">{allEditable.filter((r) => !r.builtin).map((r) => <RoleCard key={r.key} r={r} />)}</div>
              )}
            </div>
            <div>
              <div className="px-1 mb-2 text-[12px] font-black text-gray-500 tracking-wide">고정 역할</div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200">
                {FIXED_ROLES.map((r) => (
                  <div key={r.key} className="flex items-center gap-2 px-3.5 py-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-gray-400 shrink-0"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                    <span className="text-[13px] font-bold text-gray-600 whitespace-nowrap">{r.label}</span>
                    <span className="text-[11.5px] text-gray-400 truncate">{r.desc}</span>
                    <span className="ml-auto text-[11.5px] font-bold text-gray-400 shrink-0">{memberCount(r.key)}명</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 오른쪽: 편집 */}
          {!draft ? (
            <div className="bg-white rounded-2xl border border-gray-200 text-center py-20 text-[13px] text-gray-500">왼쪽에서 역할을 고르세요.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <input value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                    className="text-[19px] font-black text-[#1B2B4B] outline-none border-b-2 border-transparent focus:border-[#1B2B4B] bg-transparent w-full max-w-[320px]" />
                  <div className="text-[12px] text-gray-500 mt-0.5">{isBuiltin ? "기본 역할" : "직접 만든 역할"} · 직원 {members.length}명{dirty && <span className="ml-2 text-amber-600 font-bold">● 저장 안 됨</span>}</div>
                </div>
                {(saved || !isBuiltin) && (
                  <button onClick={resetOrDelete} className="text-[12.5px] font-bold text-gray-500 hover:text-red-600">{isBuiltin ? "기본값으로" : "역할 삭제"}</button>
                )}
                <button onClick={() => setDraft({ label: current.label, menus: effectiveMenus(selectedKey, customRoles) })} disabled={!dirty} className="px-4 py-2 rounded-xl border border-gray-300 text-[13px] font-bold text-gray-600 disabled:opacity-40">되돌리기</button>
                <button onClick={save} disabled={!dirty || saving} className="px-5 py-2 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] disabled:opacity-40">{saving ? "저장 중…" : "저장"}</button>
              </div>

              <div className="px-6 pt-3 flex gap-1 border-b border-gray-100">
                {[["menus", "메뉴 권한"], ["members", `소속 직원 ${members.length}`]].map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-[13px] font-bold border-b-2 -mb-px ${tab === k ? "border-[#1B2B4B] text-[#1B2B4B]" : "border-transparent text-gray-500"}`}>{l}</button>
                ))}
              </div>

              {tab === "menus" ? (
                <div className="p-6 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-bold text-gray-500 mr-1">빠른 설정</span>
                    {PRESETS.map((p) => <button key={p.label} onClick={() => setDraft((d) => ({ ...d, menus: p.make() }))} className="px-3 py-1.5 rounded-lg border border-gray-300 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50">{p.label}</button>)}
                    <select value="" onChange={(e) => e.target.value && setDraft((d) => ({ ...d, menus: effectiveMenus(e.target.value, customRoles) }))} className="px-3 py-1.5 rounded-lg border border-gray-300 text-[12.5px] font-semibold text-gray-700 bg-white">
                      <option value="">다른 역할 권한 복사…</option>
                      {allEditable.filter((r) => r.key !== selectedKey).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {MENU_GROUPS.map((g) => (
                      <div key={g.title} className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                          <span className="text-[13px] font-black text-[#1B2B4B]">{g.title}</span>
                          <span className="ml-auto text-[11px] text-gray-400 mr-1">묶음 설정</span>
                          <LevelSwitch size="sm" value={g.menus.every((m) => draft.menus[m] === draft.menus[g.menus[0]]) ? draft.menus[g.menus[0]] : ""} onChange={(v) => setGroup(g, v)} />
                        </div>
                        <div className="divide-y divide-gray-100">
                          {g.menus.map((m) => (
                            <div key={m} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="min-w-0 flex-1">
                                <div className="text-[13.5px] font-bold text-gray-800">{m}</div>
                                <div className="text-[11.5px] text-gray-500">{MENU_DESC[m]}</div>
                              </div>
                              <LevelSwitch value={draft.menus[m] || "hidden"} onChange={(v) => setMenu(m, v)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-[12px] text-gray-500">※ 관리자메뉴·관리센터는 권한을 다루는 화면이라 여기서 열 수 없습니다(최고관리자·관리자 전용).</div>
                </div>
              ) : (
                <div className="p-6">
                  {members.length === 0 ? (
                    <div className="text-center py-12 text-[13px] text-gray-500">이 역할을 쓰는 직원이 없습니다. 아래 다른 역할의 직원을 이 역할로 옮기려면 그 역할을 선택해 "소속 직원"에서 바꾸세요.</div>
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-gray-500 text-[12px] border-b border-gray-200">
                          {["이름", "이메일", "회사", "부서 · 직책", "역할 바꾸기"].map((h) => <th key={h} className="py-2 text-left font-semibold">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {members.map((u) => (
                          <tr key={u.id}>
                            <td className="py-2.5 font-bold text-gray-800">{u.name || "-"}</td>
                            <td className="py-2.5 text-gray-500">{u.email}</td>
                            <td className="py-2.5 text-gray-600">{u.companyName || "-"}</td>
                            <td className="py-2.5 text-gray-600">{[u.team, u.position].filter(Boolean).join(" · ") || "-"}</td>
                            <td className="py-2.5">
                              <select value={u.role || "user"} onChange={(e) => changeUserRole(u, e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 text-[12.5px] bg-white">
                                {allEditable.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
