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
import React, { useState } from "react";
import { db, doc, onSnapshot, setDoc, getDoc, DEFAULT_COMPANY } from "./firebase";
import { arrayUnion } from "firebase/firestore";
import { getTenant } from "./fsTenant";
import { useEditMode } from "./EditMode";
import { uiOptionList, useUiConfigVersion } from "./uiConfig"; // ⭐ 2026-11-07 화면 편집 — 프로그램 기본 목록(회사가 바꾼 적 없을 때) 더하기·숨기기·순서

// ⭐ 기존 하드코딩 값 그대로 + 사용자가 요청한 "리프트" 추가(상/하차방법만)
// ⭐ 2026-11-02 화면마다 조금씩 달랐던 목록(등록폼: 계좌이체 / 표·수정창: 손실·개인·취소 / 실시간: 고정기사)을
//  하나로 합쳤다 — 이제 모든 화면(PC·모바일)과 편집모드가 같은 목록을 쓴다. 회사가 바꾼 적이 있으면 그 목록.
export const DEFAULT_DROPDOWN_OPTIONS = {
  상하차방법: ["지게차", "수작업", "직접수작업", "수도움", "크레인", "리프트"],
  지급방식: ["계산서", "착불", "선불", "계좌이체", "손실", "개인", "취소"],
  배차방식: ["24시", "인성", "직접배차", "고정기사", "24시(외부업체)", "로지스허브"],
  화물타입: ["파레트", "박스", "통"],
  톤수타입: ["톤", "kg"],
  아웃콜방식: ["24시", "인성", "화물맨"], // 💳 2026-11-11 OUT 오더(외부 콜을 잡은 오더)를 어디서 잡았나 — 정산 창에서 추가 · 삭제
};

// 회사 정하기 — 앱 전체와 같은 규칙: 지금 로그인한 회사(getTenant) → 넘겨받은 회사 → 저장된 회사.
//  (최고관리자는 로그인 때 고른 회사가 tenant이고, 직원은 본인 회사가 tenant다. 관리센터처럼 tenant가 비는
//   화면에서만 아래 예전 규칙을 쓴다.) 차량종류(vehicleTypes.js)와 똑같이 맞췄다.
export function resolveCompanyKey(role, userCompany) {
  let t = "";
  try { t = String(getTenant() || "").trim(); } catch { t = ""; }
  if (t) return t;
  const ls = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  if (role === undefined || role === "") {
    return String(userCompany || "").trim() || ls("loginCompany") || ls("userCompany") || DEFAULT_COMPANY;
  }
  return role === "totalMaster"
    ? (ls("loginCompany") || userCompany || DEFAULT_COMPANY)
    : (userCompany || ls("userCompany") || DEFAULT_COMPANY);
}

// ── 회사별 구독 공유(같은 회사 문서는 onSnapshot 하나만 — 표 칸 수백 개가 같이 써도 가볍게) ──
const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
const EMPTY = Object.freeze({ loaded: false, opts: Object.freeze({}) });
const stores = new Map();
function getStore(co) {
  let st = stores.get(co);
  if (!st) { st = { state: EMPTY, listeners: new Set(), unsub: null, timer: null }; stores.set(co, st); }
  return st;
}
const emit = (st) => st.listeners.forEach((fn) => { try { fn(); } catch { /* 무시 */ } });
function startStore(co, st) {
  if (st.unsub || !co) return;
  try {
    st.unsub = onSnapshot(doc(db, "companySettings", co), (snap) => {
      const d = (snap.exists() && snap.data()?.dropdownOptions) || {};
      st.state = { loaded: true, opts: d, scopes: (snap.exists() && snap.data()?.optionScopes) || {} }; // 🧩 2026-11-13 탭(상차지 · 거래처) 전용 항목
      emit(st);
    }, () => { st.state = { loaded: true, opts: {} }; emit(st); });
  } catch { st.state = { loaded: true, opts: {} }; }
}
export function subscribeCompanyOptions(co, cb) {
  if (!co) return () => {};
  const st = getStore(co);
  if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  st.listeners.add(cb);
  startStore(co, st);
  return () => {
    st.listeners.delete(cb);
    if (st.listeners.size === 0 && st.unsub) st.timer = setTimeout(() => {
      st.timer = null;
      if (st.listeners.size === 0 && st.unsub) { try { st.unsub(); } catch { /* 무시 */ } st.unsub = null; st.state = EMPTY; }
    }, 5000);
  };
}
export const companyOptionsSnapshot = (co) => (co ? getStore(co).state : EMPTY);

// ⭐ 2026-11-07 회사가 목록을 바꿨어도 꼭 있어야 하는 값 — 로지스웹 허브 연동 오더의 배차방식(functions/hubSync.js LW_DISPATCH)
const ALWAYS_OPTIONS = { 배차방식: ["로지스허브"] };
// 회사 목록(바꾼 적 없으면 기본 목록) — key별
export function listFromStored(stored, key, fallback) {
  if (Array.isArray(stored) && stored.length > 0) {
    const out = []; const seen = new Set();
    stored.forEach((v) => { const c = clean(v); if (c && !seen.has(c)) { seen.add(c); out.push(c); } });
    (ALWAYS_OPTIONS[key] || []).forEach((v) => { if (!seen.has(v)) { seen.add(v); out.push(v); } });
    if (out.length) return out;
  }
  return fallback && fallback.length ? fallback : uiOptionList(key, DEFAULT_DROPDOWN_OPTIONS[key] || []);
}

// 🧩 2026-11-13 전용 항목 거르기 — optionScopes.{key} = { 항목: [상차지명 · 거래처명…] }
//  · 여기에 없는 항목 = 공통(어디서나) · scope(지금 오더의 거래처 · 상차지 · 하차지)가 비어 있으면 전부 보여 준다
const sk = (v) => String(v ?? "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
export function filterByScope(list, scopes, scope, current) {
  if (!scopes || !Array.isArray(scope)) return list;
  const mine = new Set(scope.map(sk).filter(Boolean));
  if (!mine.size) return list;
  return list.filter((v) => { const s = scopes[v]; return !Array.isArray(s) || !s.length || v === current || s.some((x) => mine.has(sk(x))); });
}

// 훅 — { company, loaded, list, customized }
export function useCompanyOptionList(key, role, userCompany) {
  const co = resolveCompanyKey(role, userCompany);
  const subscribe = React.useCallback((cb) => subscribeCompanyOptions(co, cb), [co]);
  const getSnap = React.useCallback(() => companyOptionsSnapshot(co), [co]);
  const st = React.useSyncExternalStore(subscribe, getSnap, getSnap);
  const stored = st.opts?.[key];
  const uv = useUiConfigVersion();
  return React.useMemo(() => ({
    company: co, loaded: st.loaded,
    list: listFromStored(stored, key),
    customized: Array.isArray(stored) && stored.length > 0,
    scopes: st.scopes?.[key] || null,
  }), [co, st.loaded, stored, key, uv, st.scopes]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * key: "상하차방법" | "지급방식" | "배차방식" | "화물타입" | "톤수타입"
 * role/userCompany: 생략 가능(위 resolveCompanyKey 참고)
 * 반환값: 문자열 배열 — 회사가 커스터마이즈한 적 없으면 DEFAULT_DROPDOWN_OPTIONS[key]
 */
export function useCompanyDropdownOptions(key, role, userCompany) {
  return useCompanyOptionList(key, role, userCompany).list;
}

// ⭐ 2026-11-01 표 칸·빠른수정·모바일 등 "훅을 못 쓰는 자리"용 — 앱 맨 위(PC DispatchApp·모바일 MobileApp)에서
//  useCompanyDropdownSync()로 회사 설정을 한 번 구독해 두고, 각 자리는 dropdownList()로 읽는다.
//  ⭐ 2026-11-02 위 공유 구독을 그대로 쓴다(따로 문서를 또 구독하지 않음) — 회사 목록이 없으면 기본 목록.
let _syncCo = "";
export function useCompanyDropdownSync(role, userCompany) {
  const co = resolveCompanyKey(role, userCompany);
  _syncCo = co;
  const subscribe = React.useCallback((cb) => subscribeCompanyOptions(co, cb), [co]);
  const getSnap = React.useCallback(() => companyOptionsSnapshot(co), [co]);
  React.useSyncExternalStore(subscribe, getSnap, getSnap);
}
// eslint-disable-next-line no-unused-vars
export function dropdownList(key, fallback = [], current) {
  const co = _syncCo || resolveCompanyKey();
  let list = listFromStored(companyOptionsSnapshot(co).opts?.[key], key);
  const cur = clean(current);
  if (cur && !list.includes(cur)) list = [...list, cur]; // 예전에 저장된 값도 보이게
  return list;
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

// ⭐ 2026-11-02 선택 목록의 [＋ 추가] — 회사 목록에 하나 덧붙인다(편집모드 목록과 같은 자리).
//  회사가 아직 목록을 바꾼 적이 없으면(기본 목록 상태) 기본 목록 + 새 이름으로 처음 저장한다 — 기본값이 사라지지 않게.
export async function addCompanyDropdownOption(key, name, company) {
  const co = String(company || "").trim() || resolveCompanyKey();
  const v = clean(name);
  if (!co) throw new Error("회사 정보를 찾지 못했습니다");
  if (!v) throw new Error("이름을 입력해 주세요");
  const ref = doc(db, "companySettings", co);
  let stored = companyOptionsSnapshot(co).opts?.[key];
  if (!companyOptionsSnapshot(co).loaded) {
    try { const snap = await getDoc(ref); stored = snap.exists() ? snap.data()?.dropdownOptions?.[key] : null; } catch { /* 아래에서 기본 목록으로 */ }
  }
  const has = Array.isArray(stored) && stored.length > 0;
  const payload = has ? arrayUnion(v) : [...listFromStored(null, key).filter((x) => x !== v), v];
  await setDoc(ref, { dropdownOptions: { [key]: payload } }, { merge: true });
  // 서버 응답 전에도 화면에 바로 보이게
  const st = getStore(co);
  const cur = listFromStored(st.state.opts?.[key], key);
  if (!has || !cur.includes(v)) {
    const nextList = has ? [...cur.filter((x) => x !== v), v] : payload;
    st.state = { loaded: true, opts: { ...(st.state.opts || {}), [key]: nextList } };
    emit(st);
  }
  return v;
}

// ⭐ 2026-11-06 선택 목록의 🗑 삭제 — 회사 목록에서 하나 뺀다(회사 공용 · PC·모바일 모든 화면)
//  · 회사가 아직 목록을 바꾼 적이 없으면(기본 목록 상태) 기본 목록에서 그 이름만 뺀 목록으로 처음 저장 → 기본 항목도 지울 수 있다
//  · 마지막 하나는 지우지 않는다(빈 목록이면 기본 목록이 다시 나오기 때문)
//  · 이미 저장된 오더 값은 그대로(목록에 없으면 "직접 입력값"으로 보인다)
export async function removeCompanyDropdownOption(key, name, company) {
  const co = String(company || "").trim() || resolveCompanyKey();
  const v = clean(name);
  if (!co) throw new Error("회사 정보를 찾지 못했습니다");
  if (!v) return null;
  const ref = doc(db, "companySettings", co);
  let stored = companyOptionsSnapshot(co).opts?.[key];
  if (!companyOptionsSnapshot(co).loaded) {
    try { const snap = await getDoc(ref); stored = snap.exists() ? snap.data()?.dropdownOptions?.[key] : null; } catch { /* 아래에서 기본 목록으로 */ }
  }
  const cur = listFromStored(stored, key);
  const next = cur.filter((x) => x !== v);
  if (next.length === cur.length) return null;
  if (!next.length) throw new Error("마지막 항목은 지울 수 없어요");
  await setDoc(ref, { dropdownOptions: { [key]: next } }, { merge: true });
  const st = getStore(co);
  st.state = { loaded: true, opts: { ...(st.state.opts || {}), [key]: next } };
  emit(st);
  return v;
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
