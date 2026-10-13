// ======================= cafe-site/src/CafeEditMode.jsx =======================
// 배차마당 "편집모드" — 최고관리자가 상단의 [편집모드]를 켜면 <T>로 감싼 모든 글자
// (메뉴, 제목, 컬럼명, 버튼, 안내문구 등)를 클릭해서 문구/글씨크기/색/두께/정렬을
// 바꿀 수 있다. 값은 Firestore siteConfig/cafeLabels 문서에
// { [고유키]: { text, size, color, weight, align } } 형태로 저장되고,
// 모든 사용자 화면에 실시간 반영된다. 쓰기 권한은 firestore.rules의
// isTotalMasterUser()가 서버에서 다시 검증한다.
import React, { createContext, useContext, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, deleteField } from "firebase/firestore";
import { db } from "./firebase";

export const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
const LABELS_DOC = () => doc(db, "siteConfig", "cafeLabels");

const Ctx = createContext({
  isAdmin: false, editMode: false, setEditMode: () => {}, labels: {}, openEditor: () => {},
});

export const useCafeEdit = () => useContext(Ctx);

// 문구만 필요할 때(placeholder 등) — 편집은 안 되고 저장된 문구만 반영
export function useLabel(k, def) {
  const { labels } = useContext(Ctx);
  return labels[k]?.text ?? def;
}

export function CafeEditProvider({ isAdmin, children }) {
  const [editMode, setEditMode] = useState(false);
  const [labels, setLabels] = useState({});
  const [editing, setEditing] = useState(null); // { k, def }

  useEffect(() => {
    const unsub = onSnapshot(LABELS_DOC(), snap => setLabels(snap.data() || {}), () => setLabels({}));
    return () => unsub();
  }, []);

  useEffect(() => { if (!isAdmin) setEditMode(false); }, [isAdmin]);

  const openEditor = (k, def) => setEditing({ k, def });

  return (
    <Ctx.Provider value={{ isAdmin, editMode: isAdmin && editMode, setEditMode, labels, openEditor }}>
      {children}
      {isAdmin && editMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10001] bg-[#1B2B4B] text-white text-[12.5px] font-semibold px-4 py-2.5 rounded-full shadow-xl flex items-center gap-3">
          <span>✏️ 편집모드 — 점선 표시된 글자를 클릭하면 수정할 수 있어요</span>
          <button onClick={() => setEditMode(false)} className="px-2.5 py-1 rounded-full bg-white text-[#1B2B4B] font-bold">완료</button>
        </div>
      )}
      {editing && (
        <LabelEditor
          k={editing.k}
          def={editing.def}
          cur={labels[editing.k] || {}}
          onClose={() => setEditing(null)}
        />
      )}
    </Ctx.Provider>
  );
}

// 편집 가능한 글자. children(문자열)이 기본 문구다.
//   <T k="home.hero.title" className="...">기본 문구</T>
export function T({ k, children, as: Tag = "span", className = "", style }) {
  const { editMode, labels, openEditor } = useContext(Ctx);
  const def = typeof children === "string" ? children : String(children ?? "");
  const o = labels[k] || {};
  const text = o.text ?? def;
  const st = { ...style };
  if (o.size) st.fontSize = `${o.size}px`;
  if (o.color) st.color = o.color;
  if (o.weight) st.fontWeight = o.weight;
  if (o.align) { st.textAlign = o.align; if (Tag === "span") st.display = "block"; }
  if (text.includes("\n")) st.whiteSpace = "pre-line";

  if (!editMode) return <Tag className={className} style={st}>{text}</Tag>;
  return (
    <Tag
      className={`${className} outline outline-1 outline-dashed outline-orange-400/80 outline-offset-2 cursor-text hover:bg-orange-100/40 rounded-sm`}
      style={st}
      title={`편집: ${k}`}
      onClick={e => { e.preventDefault(); e.stopPropagation(); openEditor(k, def); }}
    >
      {text || <span className="opacity-40">(빈 문구)</span>}
    </Tag>
  );
}

const WEIGHTS = [["", "기본"], ["400", "보통"], ["500", "중간"], ["600", "약간굵게"], ["700", "굵게"], ["800", "더굵게"], ["900", "가장굵게"]];
const ALIGNS = [["", "기본"], ["left", "왼쪽"], ["center", "가운데"], ["right", "오른쪽"]];
const SWATCHES = ["#1B2B4B", "#111827", "#374151", "#6B7280", "#9CA3AF", "#FFFFFF", "#2563EB", "#059669", "#DC2626", "#EA580C", "#CA8A04", "#7C3AED"];

function LabelEditor({ k, def, cur, onClose }) {
  const [text, setText] = useState(cur.text ?? def);
  const [size, setSize] = useState(cur.size || "");
  const [color, setColor] = useState(cur.color || "");
  const [weight, setWeight] = useState(cur.weight || "");
  const [align, setAlign] = useState(cur.align || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async (value) => {
    setSaving(true); setErr("");
    try {
      await setDoc(LABELS_DOC(), { [k]: value === null ? deleteField() : value }, { merge: true });
      onClose();
    } catch (e) {
      setErr(e.code === "permission-denied" ? "저장 권한이 없습니다(최고관리자만 가능)." : (e.message || "저장 실패"));
    } finally { setSaving(false); }
  };

  const onSave = () => {
    const v = {};
    if (text !== def) v.text = text;
    if (size) v.size = Number(size);
    if (color) v.color = color;
    if (weight) v.weight = weight;
    if (align) v.align = align;
    save(Object.keys(v).length ? v : null);
  };

  const chip = (on) => `px-2.5 py-1.5 rounded-lg border text-[12px] font-bold transition ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`;

  const preview = {
    fontSize: size ? `${size}px` : undefined, color: color || undefined,
    fontWeight: weight || undefined, textAlign: align || undefined, whiteSpace: "pre-line",
  };

  return (
    <div className="fixed inset-0 z-[10002] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-5 py-3.5 flex items-center justify-between">
          <div className="text-white font-bold text-[14px]">문구 편집</div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-[11px] text-gray-400 break-all">위치키: {k}</div>

          <div>
            <div className="text-[12px] font-bold text-gray-500 mb-1">문구 (Enter로 줄바꿈)</div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1B2B4B]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[12px] font-bold text-gray-500 mb-1">글씨 크기(px)</div>
              <div className="flex items-center gap-1">
                <button type="button" className={chip(false)} onClick={() => setSize(s => Math.max(8, (Number(s) || 13) - 1))}>－</button>
                <input value={size} onChange={e => setSize(e.target.value.replace(/[^\d]/g, ""))} placeholder="기본"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] text-center outline-none focus:border-[#1B2B4B]" />
                <button type="button" className={chip(false)} onClick={() => setSize(s => Math.min(80, (Number(s) || 13) + 1))}>＋</button>
              </div>
            </div>
            <div>
              <div className="text-[12px] font-bold text-gray-500 mb-1">두께</div>
              <select value={weight} onChange={e => setWeight(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-2 text-[13px] outline-none focus:border-[#1B2B4B]">
                {WEIGHTS.map(([v, l]) => <option key={v} value={v}>{l}{v ? ` (${v})` : ""}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="text-[12px] font-bold text-gray-500 mb-1">글자 색</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className={chip(!color)} onClick={() => setColor("")}>기본</button>
              {SWATCHES.map(c => (
                <button type="button" key={c} onClick={() => setColor(c)} title={c}
                  className={`w-6 h-6 rounded-full border ${color === c ? "ring-2 ring-offset-1 ring-[#1B2B4B]" : "border-gray-300"}`}
                  style={{ background: c }} />
              ))}
              <input type="color" value={color || "#1B2B4B"} onChange={e => setColor(e.target.value)}
                className="w-8 h-7 border border-gray-200 rounded cursor-pointer" title="직접 선택" />
            </div>
          </div>

          <div>
            <div className="text-[12px] font-bold text-gray-500 mb-1">정렬</div>
            <div className="flex gap-1.5">
              {ALIGNS.map(([v, l]) => <button type="button" key={v} className={chip(align === v)} onClick={() => setAlign(v)}>{l}</button>)}
            </div>
          </div>

          <div>
            <div className="text-[12px] font-bold text-gray-500 mb-1">미리보기</div>
            <div className="border border-dashed border-gray-300 rounded-lg px-3 py-3 bg-gray-50 text-[13px] text-gray-800" style={preview}>{text}</div>
          </div>

          {err && <div className="text-[12px] text-red-500 font-semibold">{err}</div>}
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 flex gap-2">
          <button onClick={() => save(null)} disabled={saving}
            className="px-3 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-[12.5px] font-semibold hover:bg-gray-50 disabled:opacity-50">기본값으로</button>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-[13px]">취소</button>
          <button onClick={onSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white font-bold text-[13px] disabled:opacity-50">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 상단 메뉴바의 [편집모드] 토글 — 최고관리자에게만 보인다.
export function EditModeToggle() {
  const { isAdmin, editMode, setEditMode } = useContext(Ctx);
  if (!isAdmin) return null;
  return (
    <button onClick={() => setEditMode(v => !v)}
      className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition whitespace-nowrap ${editMode ? "bg-orange-400 text-white" : "border border-white/30 text-white/80 hover:bg-white/10"}`}>
      ✏️ 편집모드 {editMode ? "ON" : "OFF"}
    </button>
  );
}
