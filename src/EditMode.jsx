// ======================= src/EditMode.jsx =======================
// ⭐ "프로그램 전체 편집모드" 기초 인프라 — 최고관리자가 PC 화면(DispatchApp)에서
// "편집모드"를 켜면, 이 파일이 제공하는 <EditableText>로 감싸둔 자리의 글자를
// 클릭해서 바로 고칠 수 있고, 그 값은 Firestore siteConfig/labels 문서 하나에
// { "그 자리의 고유 키": "새 문구" } 형태로 저장된다. 저장된 값은 모든 사용자
// 화면에 실시간 반영된다(편집은 최고관리자만, 화면에 보이는 건 전체 사용자).
//
// 범위: 사용자 요청대로 "PC에서만" 동작해야 하므로, 이 Provider는
// DispatchApp.jsx(PC 배차프로그램)에서만 씌운다 — 모바일 화면(MobileApp.jsx
// 등)에는 적용하지 않는다.
//
// 규모에 대한 메모: 화면 전체(수만 줄)의 모든 텍스트를 한 번에 이 컴포넌트로
// 바꾸는 건 비현실적이라, 눈에 잘 띄는 자리(상단 메뉴 탭, Home 위젯 제목 등)부터
// 순차적으로 적용하고 있다 — 아직 안 감싼 글자는 지금 당장은 편집이 안 된다.
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { auth, db, doc, onSnapshot, setDoc } from "./firebase";

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";

const EditModeContext = createContext({
  isTotalMaster: false,
  editMode: false,
  setEditMode: () => {},
  labels: {},
  setLabel: () => {},
});

export function EditModeProvider({ children, role }) {
  const [isTotalMaster, setIsTotalMaster] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [labels, setLabels] = useState({});

  // ⭐ 클라이언트가 스스로 "나는 최고관리자다"라고 판단한 값은 여기서만 화면
  // 표시용으로 쓰인다 — 실제 쓰기 권한은 firestore.rules의 isTotalMasterUser()가
  // 서버에서 다시 독립적으로 검증하므로(AdminMenu.jsx와 동일한 기준: 고정
  // 이메일 또는 users 문서 role==="totalMaster"), 여기 값을 조작해도 실제
  // 저장까지 되지는 않는다.
  useEffect(() => {
    const check = () => {
      const u = auth.currentUser;
      setIsTotalMaster(role === "totalMaster" || u?.email === TOTAL_MASTER_EMAIL);
    };
    check();
    const unsub = auth.onAuthStateChanged(check);
    return () => unsub();
  }, [role]);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "siteConfig", "labels"),
      (snap) => setLabels(snap.exists() ? snap.data() || {} : {}),
      () => setLabels({})
    );
    return () => unsub();
  }, []);

  const setLabel = useCallback(async (key, value) => {
    setLabels((prev) => ({ ...prev, [key]: value })); // 낙관적 갱신 — 저장 왕복 기다리지 않고 바로 반영
    try {
      await setDoc(doc(db, "siteConfig", "labels"), { [key]: value }, { merge: true });
    } catch (e) {
      console.error("[EditMode] 라벨 저장 실패:", e);
      alert("저장 실패: " + (e?.message || e) + "\n(최고관리자 계정인지 확인해주세요)");
    }
  }, []);

  // 최고관리자가 아니면 editMode가 어쩌다 true로 남아있어도 강제로 꺼진 것으로 취급
  const effectiveEditMode = isTotalMaster && editMode;

  return (
    <EditModeContext.Provider value={{ isTotalMaster, editMode: effectiveEditMode, setEditMode, labels, setLabel }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}

// ⭐ 화면에 보이는 텍스트 한 자리를 감싸는 범용 컴포넌트.
// id: 이 자리를 가리키는 고유 키(예: "nav.HOME", "home.board.tab.공지사항") —
//     내부 로직(메뉴 라우팅, 상태값 비교 등)에서 쓰는 값과는 별개의, 오직
//     "이 자리 문구가 뭔지 Firestore에 저장해두는 사전 키"일 뿐이다. 로직에서
//     쓰는 원래 문자열(m, key 등)은 절대 안 바꾸고, 화면에 뭐라고 "보여줄지"만
//     바꾼다 — 그래야 라벨을 바꿔도 라우팅/권한 체크가 깨지지 않는다.
// defaultText: 편집한 적 없을 때 보여줄 원래 글자.
export function EditableText({ id, defaultText, as: Tag = "span", className = "", style }) {
  const { editMode, labels, setLabel } = useEditMode();
  const savedText = labels?.[id] ?? defaultText;
  const [draft, setDraft] = useState(savedText);
  const [focused, setFocused] = useState(false);

  // 편집 중(입력창에 포커스)이 아닐 때만 바깥에서 온 최신값으로 동기화 —
  // 타이핑 도중에 실시간 구독이 값을 되돌려버리는 것을 막는다.
  useEffect(() => {
    if (!focused) setDraft(savedText);
  }, [savedText, focused]);

  if (!editMode) {
    return <Tag className={className} style={style}>{savedText}</Tag>;
  }

  const commit = () => {
    setFocused(false);
    const v = draft.trim();
    if (v && v !== savedText) setLabel(id, v);
    else setDraft(savedText);
  };

  return (
    <input
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()} // 버튼 등 클릭형 부모 안에 있을 때 부모의 onClick(탭 전환 등)이 같이 발동하지 않게
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setDraft(savedText); e.currentTarget.blur(); }
      }}
      className={`${className} bg-amber-100 text-gray-900 outline outline-2 outline-amber-400 rounded px-1`}
      style={{ ...style, width: `${Math.max((draft || "").length, 2) + 1}ch`, minWidth: "2.5em" }}
    />
  );
}

// ⭐ 편집모드 토글 버튼 — 최고관리자에게만 보인다. 헤더 등 아무 데나 놓고 쓴다.
export function EditModeToggleButton({ className = "" }) {
  const { isTotalMaster, editMode, setEditMode } = useEditMode();
  if (!isTotalMaster) return null;
  return (
    <button
      onClick={() => setEditMode((v) => !v)}
      className={`${className} px-3 py-1.5 rounded-lg text-[12px] font-bold transition whitespace-nowrap ${
        editMode ? "bg-amber-400 text-[#1B2B4B]" : "bg-white/10 text-white/70 hover:bg-white/20"
      }`}
      title="켜면 노란 박스로 표시된 글자를 클릭해서 바로 고칠 수 있습니다"
    >
      {editMode ? "✏️ 편집모드 켜짐" : "편집모드"}
    </button>
  );
}
