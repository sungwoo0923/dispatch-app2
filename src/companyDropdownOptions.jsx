// ======================= src/companyDropdownOptions.jsx =======================
// ⭐ "3파트 배차관리" 등록폼 등에서 여러 자리에 똑같이 하드코딩돼 있던 드롭다운
// 옵션 목록(상/하차방법, 지급방식, 배차방식, 화물타입, 톤수타입)을 회사별로
// 독립적으로 커스터마이즈할 수 있게 하는 공용 훅.
//
// 저장 위치: companySettings/{회사명} 문서의 dropdownOptions.{key} 필드 —
// EditMode.jsx의 라벨 저장(Part A)과 같은 멀티테넌시 원리이며, 이미 이 문서가
// 회사별 설정(결제일규칙, 매출목표, 차량제원표수정 등)을 담는 관행과도 일치한다.
// 회사가 한 번도 커스터마이즈하지 않았으면(필드 없음) 아래 DEFAULTS를 그대로
// 보여준다 — 그래서 아무도 손대지 않으면 전과 100% 동일한 화면이 된다.
import React, { useEffect, useState, useCallback } from "react";
import { db, doc, onSnapshot, setDoc } from "./firebase";
import { useEditMode } from "./EditMode";

// ⭐ 기존 하드코딩 값 그대로 + 사용자가 요청한 "리프트" 추가(상/하차방법만)
export const DEFAULT_DROPDOWN_OPTIONS = {
  상하차방법: ["지게차", "수작업", "직접수작업", "수도움", "크레인", "리프트"],
  지급방식: ["계산서", "착불", "선불", "계좌이체"],
  배차방식: ["24시", "인성", "직접배차", "24시(외부업체)"],
  화물타입: ["파레트", "박스", "통"],
  톤수타입: ["톤", "kg"],
};

// Part A의 resolveCompany와 완전히 동일한 규칙 — role/userCompany를 못 받는
// 자리(깊이 중첩된 팝업 등)에서는 role 없이도 쓸 수 있도록 role을 생략 가능하게 함.
function resolveCompanyKey(role, userCompany) {
  if (role === undefined) {
    // role을 모르는 자리 — 이 파일 안에서도 여러 곳이 쓰는 localStorage 전용 대체 규칙
    // (예: DispatchApp.jsx의 `localStorage.getItem("loginCompany") || localStorage.getItem("userCompany")`)
    return localStorage.getItem("loginCompany") || localStorage.getItem("userCompany") || "돌캐";
  }
  return role === "totalMaster"
    ? (localStorage.getItem("loginCompany") || userCompany || "돌캐")
    : (userCompany || localStorage.getItem("userCompany") || "돌캐");
}

/**
 * key: "상하차방법" | "지급방식" | "배차방식" | "화물타입" | "톤수타입"
 * role/userCompany: 생략 가능(위 resolveCompanyKey 참고)
 * 반환값: 문자열 배열 — 회사가 커스터마이즈한 적 없으면 DEFAULT_DROPDOWN_OPTIONS[key]
 */
export function useCompanyDropdownOptions(key, role, userCompany) {
  const defaultList = DEFAULT_DROPDOWN_OPTIONS[key] || [];
  const [options, setOptions] = useState(defaultList);

  useEffect(() => {
    const companyKey = resolveCompanyKey(role, userCompany);
    const unsub = onSnapshot(
      doc(db, "companySettings", companyKey),
      (snap) => {
        const stored = snap.exists() ? snap.data()?.dropdownOptions?.[key] : null;
        setOptions(Array.isArray(stored) && stored.length > 0 ? stored : defaultList);
      },
      () => setOptions(defaultList)
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, role, userCompany]);

  return options;
}

// 관리자 편집용 — 저장(merge)으로 다른 키의 옵션은 건드리지 않음
export async function saveCompanyDropdownOptions(key, list, role, userCompany) {
  const companyKey = resolveCompanyKey(role, userCompany);
  await setDoc(
    doc(db, "companySettings", companyKey),
    { dropdownOptions: { [key]: list } },
    { merge: true }
  );
}

// ⭐ 편집모드일 때만 드롭다운 옆에 붙는 "옵션 관리" 버튼 + 모달 — EditableText와
// 같은 상호작용(클릭해서 바로 고치기) 느낌을 유지하되, 목록 추가/삭제/순서변경이
// 필요해 모달로 뺐다. isTotalMaster가 아니거나 편집모드가 꺼져있으면 아무것도
// 렌더링하지 않아 평소 화면은 전혀 바뀌지 않는다.
export function DropdownOptionsManageButton({ optKey, label, role, userCompany, className = "" }) {
  const { editMode } = useEditMode();
  const [open, setOpen] = useState(false);
  const options = useCompanyDropdownOptions(optKey, role, userCompany);
  if (!editMode) return null;
  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className={`${className} ml-1 w-5 h-5 inline-flex items-center justify-center rounded-full bg-amber-400 text-[#1B2B4B] text-[10px] font-bold hover:bg-amber-300 transition`}
        title={`${label || optKey} 옵션 관리`}
      >
        ⚙
      </button>
      {open && (
        <DropdownOptionsEditorModal
          optKey={optKey}
          label={label || optKey}
          role={role}
          userCompany={userCompany}
          initialOptions={options}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DropdownOptionsEditorModal({ optKey, label, role, userCompany, initialOptions, onClose }) {
  const [list, setList] = useState(() => [...initialOptions]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const move = (i, dir) => {
    setList((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const remove = (i) => setList((prev) => prev.filter((_, idx) => idx !== i));
  const rename = (i, v) => setList((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  const add = () => {
    const v = draft.trim();
    if (!v || list.includes(v)) return;
    setList((prev) => [...prev, v]);
    setDraft("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const cleaned = list.map((x) => x.trim()).filter(Boolean);
      await saveCompanyDropdownOptions(optKey, cleaned, role, userCompany);
      onClose();
    } catch (e) {
      alert("저장 실패: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[999999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-bold text-[#1B2B4B] mb-3">{label} 옵션 관리</h3>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {list.map((v, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={v}
                onChange={(e) => rename(i, e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-[13px]"
              />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1">▲</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1">▼</button>
              <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 px-1">✕</button>
            </div>
          ))}
          {list.length === 0 && <div className="text-[12px] text-gray-400 text-center py-2">옵션 없음</div>}
        </div>
        <div className="flex gap-1.5 mt-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="새 옵션 추가"
            className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-[13px]"
          />
          <button type="button" onClick={add} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[12px] font-bold hover:bg-gray-200">추가</button>
        </div>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-[13px] font-semibold hover:bg-gray-50">취소</button>
          <button type="button" onClick={save} disabled={saving} className="flex-1 py-2 rounded-lg bg-[#1B2B4B] text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-60">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
