// ======================= src/dispatch/ClientManagement.jsx =======================
// 🧩 2026-11-27 src/DispatchApp.jsx 에서 그대로 옮긴 코드(동작 · 화면 그대로) — 큰 파일을 화면별로 나눠 로그인 직후 받는 JS 를 줄였다.
import { kpConfirm } from "../kpDialog";
import { deleteDocsAtomic, runUpload, runDelete } from "../DeleteProgress";
import BulkUploadChooser, { downloadTemplateXlsx } from "../BulkUploadChooser";
import ToolMenuButton from "../toolMenu";
import { imeFocusRef } from "../imeFocus";
import React from "react";
import ClientMergeModal from "../ClientMergeModal";
import { useCompanyBiz, BizPicker } from "../companyBiz";
import { bizGuardMain, ClientBizBulkButton, BizCheck } from "../publicDataMain";
import { splitContactCell, isCleanPhone, cleanPlaceContacts } from "../contactCell";
import { isJyCompany } from "../jyOnly";
import { EditableText } from "../EditMode";
import { CustomSelect } from "../CustomSelect";
import { doc, getDocs, query, collection, where } from "firebase/firestore";
import { updateDoc } from "../orderWrite";
import { db, DEFAULT_COMPANY } from "../firebase";
import { useTableSort, sortRows, SortTh } from "../tableSort";
import { KP_MONO, TimeAmPmPicker, _hasRealDriverNotice, defaultDriverNoticeTemplate, formatPhone, loadXLSX, normalizeCompanyKey } from "./shared/dispatchCommon.jsx";


// 거래처/하차지 수정 팝업에서 담당자가 여러 명일 때 목록으로 보고 수정/삭제할 수 있게
// 하는 공용 컴포넌트. contacts: [{name, phone, isPrimary}], onChange(nextContacts)
function ContactListEditor({ contacts, onChange }) {
  const [editingIdx, setEditingIdx] = React.useState(null);
  const [draft, setDraft] = React.useState({ name: "", phone: "" });
  const list = Array.isArray(contacts) ? contacts : [];

  const startEdit = (i) => { setEditingIdx(i); setDraft({ name: list[i].name || "", phone: list[i].phone || "" }); };
  const saveEdit = () => {
    onChange(list.map((c, i) => i === editingIdx ? { ...c, name: draft.name.trim(), phone: draft.phone.trim() } : c));
    setEditingIdx(null);
  };
  const removeAt = (i) => {
    let next = list.filter((_, idx) => idx !== i);
    if (next.length && !next.some(c => c.isPrimary)) next = next.map((c, idx) => idx === 0 ? { ...c, isPrimary: true } : c);
    onChange(next);
    if (editingIdx === i) setEditingIdx(null);
  };
  const makePrimary = (i) => onChange(list.map((c, idx) => ({ ...c, isPrimary: idx === i })));
  const addContact = () => {
    onChange([...list, { name: "", phone: "", isPrimary: list.length === 0 }]);
    setEditingIdx(list.length);
    setDraft({ name: "", phone: "" });
  };

  return (
    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
      {list.length === 0 && (
        <div className="px-3 py-3 text-[12px] text-gray-500 text-center">등록된 담당자가 없습니다</div>
      )}
      {list.map((c, i) => (
        <div key={i} className="px-3 py-2">
          {editingIdx === i ? (
            <div className="flex items-center gap-2">
              <input autoComplete="off" ref={imeFocusRef} className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-[12px] outline-none focus:border-[#1B2B4B]"
                placeholder="이름" value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} />
              <input autoComplete="off" className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-[12px] outline-none focus:border-[#1B2B4B]"
                placeholder="전화번호" value={draft.phone} onChange={e => setDraft(p => ({ ...p, phone: formatPhone(e.target.value) }))} />
              <button onClick={saveEdit} className="shrink-0 px-2 py-1 rounded bg-[#1B2B4B] text-white text-[11px] font-bold"><EditableText id="misc.btn.2462.저장" defaultText="저장" /></button>
              <button onClick={() => setEditingIdx(null)} className="shrink-0 px-2 py-1 rounded bg-gray-100 text-gray-600 text-[11px] font-semibold"><EditableText id="misc.btn.2463.취소" defaultText="취소" /></button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {c.isPrimary && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#1B2B4B] text-white">대표</span>}
                <span className="text-[13px] font-semibold text-gray-800 truncate">{c.name || "(이름 없음)"}</span>
                <span className="text-[12px] text-gray-500 truncate">{c.phone || "-"}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!c.isPrimary && (
                  <button onClick={() => makePrimary(i)} className="text-[11px] text-[#1B2B4B] font-semibold hover:underline"><EditableText id="misc.btn.2474.대표로" defaultText="대표로" /></button>
                )}
                <button onClick={() => startEdit(i)} className="text-[11px] text-gray-500 font-semibold hover:underline"><EditableText id="misc.btn.2476.수정" defaultText="수정" /></button>
                <button onClick={() => removeAt(i)} className="text-[11px] text-red-500 font-semibold hover:underline"><EditableText id="misc.btn.2477.삭제" defaultText="삭제" /></button>
              </div>
            </div>
          )}
        </div>
      ))}
      <button type="button" onClick={addContact} className="w-full px-3 py-2 text-[12px] text-[#1B2B4B] font-semibold hover:bg-gray-50 transition">+ 담당자 추가</button>
    </div>
  );
}

// 첨부파일(이미지/PDF) 미리보기 — 확대/축소/회전/저장 지원
function FilePreviewModal({ base64, type, name, onClose }) {
  const [zoom, setZoom] = React.useState(1);
  const [rotate, setRotate] = React.useState(0);
  const isImage = (type || "").startsWith("image/");

  const handleSave = () => {
    const a = document.createElement("a");
    a.href = base64;
    a.download = name || "첨부파일";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-[9999999] flex flex-col bg-black/85">
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-[#1B2B4B] shrink-0">
        <span className="text-white text-[14px] font-semibold truncate">{name}</span>
        <div className="flex items-center gap-2 shrink-0">
          {isImage && (
            <>
              <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-[13px] font-semibold hover:bg-white/20 transition"><EditableText id="misc.btn.2623.축소" defaultText="축소" /></button>
              <span className="text-white/70 text-[12px] w-11 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-[13px] font-semibold hover:bg-white/20 transition"><EditableText id="misc.btn.2626.확대" defaultText="확대" /></button>
              <button onClick={() => setRotate(r => (r + 90) % 360)}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-[13px] font-semibold hover:bg-white/20 transition"><EditableText id="misc.btn.2628.회전" defaultText="회전" /></button>
            </>
          )}
          <button onClick={handleSave}
            className="px-3 py-1.5 rounded-lg bg-white text-[#1B2B4B] text-[13px] font-bold hover:opacity-90 transition"><EditableText id="misc.btn.2632.저장" defaultText="저장" /></button>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none px-2">✕</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-6" onClick={onClose}>
        {isImage ? (
          <img
            src={base64}
            alt={name}
            onClick={e => e.stopPropagation()}
            style={{ transform: `scale(${zoom}) rotate(${rotate}deg)`, transition: "transform 0.15s ease", maxWidth: "none" }}
            className="max-h-[80vh]"
          />
        ) : (
          <iframe
            src={base64}
            title={name}
            onClick={e => e.stopPropagation()}
            className="w-full h-full bg-white rounded-lg"
          />
        )}
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 10/10) — END =====================
// ===================== DispatchApp.jsx (PART 11/11) — START =====================
// 첨부파일을 base64로 저장하기 전에 이미지면 압축하고, 그래도 Firestore 문서
// 크기 한도(약 1MB)를 넘으면 저장 전에 미리 막는다 — 그냥 readAsDataURL만
// 하면 휴대폰 사진 하나로도 쉽게 한도를 넘어 저장이 조용히 실패한다.
const CLIENT_FILE_BASE64_LIMIT = 900_000;
const compressClientImage = (file) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 1400;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve(e.target.result);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ⭐ 사업자등록증 OCR 인식 결과 텍스트에서 필드를 뽑아낸다. 거래처명은 사업자등록증상의
// 상호와 사용자가 실제 입력한 거래처명이 다를 수 있어(예: 약칭/별칭 사용) 의도적으로
// 스캔 대상에서 제외한다. 인식되지 않은 항목은 빈 문자열로 두고, 호출 쪽에서 빈
// 문자열은 아예 적용하지 않는다(기존 값을 지우지 않는다).
function parseBizRegText(raw) {
  const norm = String(raw || "").replace(/\r/g, "");
  const result = { 사업자번호: "", 대표자: "", 업태: "", 종목: "", 이메일: "", 주소: "" };

  const bizNoMatch = norm.match(/\d{3}\s*-\s*\d{2}\s*-\s*\d{5}/);
  if (bizNoMatch) result.사업자번호 = bizNoMatch[0].replace(/\s+/g, "");

  const emailMatch = norm.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.이메일 = emailMatch[0];

  // "대표자"/"성명" 라벨 뒤의 한글 이름 — 사업자등록증 양식상 대표자 이름은 보통
  // 한글 2~10자다. 뒤에 다른 라벨(생년월일 등)이 바로 붙는 경우가 많아 공백/줄바꿈까지만 취한다.
  const nameMatch = norm.match(/(?:대\s*표\s*자|성\s*명)\s*[:：]?\s*([가-힣]{2,10})/);
  if (nameMatch) result.대표자 = nameMatch[1];

  // 업태/종목은 양식상 한 줄에 나란히 붙어 나오는 경우가 많아, "종목" 라벨이 나오기
  // 전까지만 업태 값으로 취한다.
  const upteMatch = norm.match(/업\s*태\s*[:：]?\s*([^\n]+?)(?=\s{2,}종\s*목|종\s*목|\n|$)/);
  if (upteMatch) result.업태 = upteMatch[1].trim();

  const jongmokMatch = norm.match(/종\s*목\s*[:：]?\s*([^\n]+)/);
  if (jongmokMatch) result.종목 = jongmokMatch[1].trim().slice(0, 40);

  const addrMatch = norm.match(/(?:사업장\s*소재지|소\s*재\s*지)\s*[:：]?\s*([^\n]+)/);
  if (addrMatch) result.주소 = addrMatch[1].trim();

  Object.keys(result).forEach((k) => {
    if (result[k]) result[k] = result[k].replace(/\s{2,}/g, " ").trim();
  });
  return result;
}

// ⭐ 사업자등록증 이미지를 첨부하면 네이버 영수증리뷰 스캔처럼 화면 중앙 팝업에서
// OCR로 내용을 읽어 사업자번호/대표자/업태/종목/이메일/주소를 자동 인식해 보여준다.
// 실제 Firestore 저장은 사용자가 "인식된 내용 적용"을 눌러야 반영된다(오인식 방지).
function BizRegOcrModal({ imageBase64, onClose, onApply }) {
  const [status, setStatus] = React.useState("scanning"); // scanning | done | error
  const [progress, setProgress] = React.useState(0);
  const [fields, setFields] = React.useState(null);
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("kor+eng", 1, {
          logger: (m) => {
            if (cancelled) return;
            if (m.status === "recognizing text" && typeof m.progress === "number") {
              setProgress(Math.round(m.progress * 100));
            }
          },
        });
        const { data: { text } } = await worker.recognize(imageBase64);
        worker.terminate().catch(() => {});
        if (cancelled) return;
        setFields(parseBizRegText(text));
        setStatus("done");
      } catch (e) {
        console.error("사업자등록증 스캔 실패:", e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [imageBase64]);

  const FIELD_LABELS = [["사업자번호", "사업자번호"], ["대표자", "대표자"], ["업태", "업태"], ["종목", "종목"], ["이메일", "이메일"], ["주소", "주소"]];
  const recognizedCount = fields ? Object.values(fields).filter((v) => v && v.trim()).length : 0;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[420px] max-w-[92vw] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.사업자등록증 스캔" defaultText="사업자등록증 스캔" /></h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl">✕</button>
        </div>
        <div className="px-6 py-6">
          {status === "scanning" && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full border-4 border-gray-100 border-t-[#1B2B4B] animate-spin" />
              <div className="text-[13px] font-semibold text-gray-700">스캔 중입니다... {progress}%</div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#1B2B4B] transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {status === "error" && (
            <div className="text-center space-y-2">
              <div className="text-[13px] font-bold text-red-500">스캔에 실패했습니다.</div>
              <div className="text-[12px] text-gray-500">이미지가 선명한지 확인 후 다시 시도해주세요.</div>
            </div>
          )}
          {status === "done" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#1B2B4B]">
                <span className="inline-flex w-5 h-5 rounded-full bg-[#1B2B4B] text-white items-center justify-center text-[11px]">✓</span>
                스캔완료 {recognizedCount > 0 ? `(${recognizedCount}개 항목 인식)` : "(인식된 항목 없음)"}
              </div>
              <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
                {FIELD_LABELS.map(([key, label]) => (
                  <div key={key} className="flex px-3 py-2 gap-2 items-start">
                    <span className="w-16 shrink-0 text-[12px] text-gray-500 font-semibold">{label}</span>
                    <span className={`text-[12px] flex-1 break-words ${fields?.[key] ? "text-gray-800 font-semibold" : "text-gray-300"}`}>
                      {fields?.[key] || "인식 안 됨"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-gray-400">거래처명은 사업자등록증상 상호와 다를 수 있어 자동입력 대상에서 제외됩니다. 인식이 부정확하면 직접 입력칸에서 고쳐주세요.</div>
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="misc.btn.53690.닫기" defaultText="닫기" /></button>
          {status === "done" && (
            <button onClick={() => { onApply(fields); onClose(); }} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition">
              인식된 내용 적용
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ⭐ 2026-10-28 거래처관리·기사관리 공용 디지털 부품 — 숫자 타일 / 한 줄 검색바 / 빈 화면 안내 / 버튼
const KP_GRADE_EN = { 전체: "ALL", 일반: "GENERAL", 블랙: "BLOCKED", 주의: "CAUTION", 이탈: "CHURNED", 직영: "DIRECT", 지입: "CONSIGNED" };
const KP_BTN = "h-11 px-4 rounded-[13px] bg-white border border-[#E3E8F0] text-[#0F1A30] text-[13px] font-bold hover:border-[#4B6CB7] transition whitespace-nowrap";
const KP_BTN_PRIMARY = "h-11 px-4 rounded-[13px] text-white text-[13.5px] font-black shadow-[0_10px_22px_rgba(15,26,48,0.25)] hover:brightness-110 transition whitespace-nowrap";
const KP_BTN_PRIMARY_BG = { background: "linear-gradient(120deg,#0F1A30,#2D4C82)" };
const KP_BTN_DANGER = "h-11 px-4 rounded-[13px] bg-white border border-[#0F1A30] text-[#0F1A30] text-[13px] font-black hover:bg-[#0F1A30] hover:text-white transition whitespace-nowrap";
// ⭐ 2026-11-02 거래처관리 표 체크박스 — 배차현황 표(.kp-grid input[type=checkbox])와 같은 모양(15px · 남색 #2D4C82 체크).
//   indeterminate(일부 선택)도 표시한다.
function KpCheckbox({ checked = false, indeterminate = false, onChange, onClick, title }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked; }, [indeterminate, checked]);
  return (
    <input ref={ref} autoComplete="off" type="checkbox" checked={!!checked} onChange={onChange} onClick={onClick} title={title}
      className="w-[15px] h-[15px] accent-[#2D4C82] cursor-pointer align-middle" />
  );
}
function KpStatTile({ on, en, label, value, onClick }) {
  return (
    <button onClick={onClick}
      className={`relative overflow-hidden rounded-[20px] px-5 py-4 text-left transition ${on ? "text-white shadow-[0_14px_30px_rgba(15,26,48,0.28)]" : "bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)] hover:border-[#4B6CB7]"}`}
      style={on ? { background: "linear-gradient(125deg,#0B1428,#0F1A30 45%,#1B2B4B 80%,#2D4C82)" } : undefined}>
      {on && <span className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "18px 18px" }} />}
      <div className={`relative text-[10px] font-extrabold tracking-[0.24em] ${on ? "text-[#8FB0F0]" : "text-[#9AA9C3]"}`} style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{en || ""}</div>
      <div className="relative flex items-end justify-between mt-1">
        <span className={`text-[14px] font-black ${on ? "text-white" : "text-[#0F1A30]"}`}>{label}</span>
        <span className={`text-[28px] font-black leading-none tabular-nums ${on ? "text-white" : "text-[#0F1A30]"}`} style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
    </button>
  );
}
function KpSearchBar({ options, field, onField, value, onChange, onSearch, placeholder, mobile = false }) {
  // ⭐ 2026-11-06 mobile — 휴대폰 폭에서는 한 줄 전체(최소 폭 없음) · [검색] 버튼이 항상 보이게
  return (
    <div className={`flex items-center h-12 flex-1 ${mobile ? "w-full min-w-0 basis-full" : "min-w-[380px] max-w-[680px]"} rounded-[16px] bg-white border border-[#E3E8F0] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_rgba(16,24,40,0.05)] focus-within:border-[#4B6CB7] focus-within:ring-4 focus-within:ring-[#4B6CB7]/10 overflow-hidden`}>
      {options && (
        <CustomSelect className={`h-full ${mobile ? "pl-3 pr-1 text-[14px] shrink-0" : "pl-4 pr-2 text-[13.5px]"} bg-transparent font-black text-[#0F1A30] outline-none border-r border-[#EEF1F6] cursor-pointer`} value={field} onChange={(e) => onField(e.target.value)}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </CustomSelect>
      )}
      <svg className={`${mobile ? "hidden" : "ml-3"} shrink-0 text-[#9AA9C3]`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-5-5" /></svg>
      <input autoComplete="off" className="flex-1 min-w-0 h-full px-2.5 bg-transparent text-[14.5px] font-bold text-[#0F1A30] outline-none placeholder:text-[#A7B3C6] placeholder:font-medium"
        placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} onKeyUp={(e) => { if (e.key === "Enter") onSearch(); }} />
      <button onClick={onSearch} className={`h-9 mr-1.5 ${mobile ? "px-3.5 text-[14px]" : "px-5 text-[13.5px]"} shrink-0 rounded-[12px] bg-[#0F1A30] text-white font-black hover:bg-[#1B2B4B]`}>검색</button>
    </div>
  );
}
function KpEmptySearch({ en, title, sub }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] flex flex-col items-center justify-center py-16 text-white" style={{ background: "radial-gradient(90% 80% at 50% 0%, #22396A 0%, #0F1A30 60%, #0B1428 100%)" }}>
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "28px 28px" }} />
      <div className="relative text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0] mb-2" style={{ fontFamily: KP_MONO, fontVariantNumeric: "tabular-nums" }}>{en}</div>
      <div className="relative text-[16px] font-black">{title}</div>
      {sub && <div className="relative text-[13px] text-white/55 mt-1">{sub}</div>}
    </div>
  );
}

export default function ClientManagement({ clients = [], upsertClient, removeClient, upsertPlace, places: placesProp = [], showAlert = (m) => alert(m), hideTabs = false, initialTab = "하차지", userCompany = "", mobile = false, canMerge = false }) {
  const [mergeOpen, setMergeOpen] = React.useState(false); // ⭐ 2026-11-17 거래처 합치기 창(관리자급만 — canMerge)
  const [bizBulkOpen, setBizBulkOpen] = React.useState(false); // 🧰 2026-11-23 [등록·정리] › 사업자 상태 확인 창
  // ⭐ 2026-11-06 mobile — 모바일 앱 거래처관리: 버튼은 신규등록·거래처정리·선택삭제만, 표 대신 카드(누르면 상세 시트)
  const [mSheet, setMSheet] = React.useState(null); // { kind: "place"|"client", r }
  const normalizePlaceRow = (d) => {
    const primary = Array.isArray(d.contacts) && d.contacts.length
      ? d.contacts.find(c => c.isPrimary) || d.contacts[0] : null;
    return {
      id: d._id || d.id || "",
      업체명: d.업체명 || "",
      주소: (d.주소 || "").trim(),
      담당자: primary?.name || d.담당자 || "",
      담당자번호: primary?.phone || d.담당자번호 || "",
      등급: d.등급 || "일반",
      등급변경일: d.등급변경일 || null,
      메모: d.메모 || "",
      오더메모: d.오더메모 || "",
      기사전달주의사항: d.기사전달주의사항 || "",
      팝업표시: d.팝업표시 !== undefined ? d.팝업표시 : true,
      점심시작시간: d.점심시작시간 || "",
      점심종료시간: d.점심종료시간 || "",
      updatedAt: d.updatedAt || null,
      // 담당자가 2명 이상인 문서를 수정 팝업에서 저장할 때, 대표(주 담당자)를
      // 정확히 교체하려면 원본 contacts 배열이 필요해 별도로 보관해둔다
      _rawContacts: Array.isArray(d.contacts) ? d.contacts : [],
      ...(typeof d.순수매출제외 === "boolean" ? { 순수매출제외: d.순수매출제외 } : {}),
      ...(typeof d.매출순위제외 === "boolean" ? { 매출순위제외: d.매출순위제외 } : {}),
    };
  };

  const normalizePlace = (s = "") =>
    s.toString().normalize("NFC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .toLowerCase().replace(/\s+/g, "").replace(/[^\w가-힣-]/g, "");

  const normalizeCompanyName = (s = "") =>
    String(s).toLowerCase().replace(/\s+/g, "").replace(/[^\uAC00-\uD7A3]/g, "");

  const norm = (s = "") => String(s).toLowerCase().replace(/\s+/g, "");

  const 등급색상 = (g) => {
    if (g === "블랙") return "bg-gray-900 text-white";
    if (g === "주의") return "bg-orange-100 text-orange-700 border border-orange-300";
    if (g === "이탈") return "bg-red-100 text-red-700 border border-red-300";
    return "bg-[#1B2B4B]/10 text-[#1B2B4B] border border-[#1B2B4B]/30";
  };

  const [subTab, setSubTab] = React.useState(initialTab);

  // ═══════════════════════════════════════════════════
  // ★★★ placeRows를 맨 위에 선언 (순서 핵심) ★★★
  // ═══════════════════════════════════════════════════
  const PLACES_COLL = "places";
  // ⭐ 2026-11-05 하차지 삭제 — 배열이면 한 번에(writeBatch) · 삭제 진행 창
  const removePlace = async (idOrIds) => {
    const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).filter(Boolean);
    if (!ids.length) return;
    await deleteDocsAtomic(db, ids.map((id) => doc(db, PLACES_COLL, id)), { label: "하차지" });
  };
  const [placeRows, setPlaceRows] = React.useState(() => placesProp.map(normalizePlaceRow));
  // 아래 몇 개 메모는 전부 "하차지거래처" 탭에서만 쓰인다 — "기본거래처" 탭으로
  // 마운트될 때도 계산되면 탭 전환마다 낭비되는 작업이라 subTab으로 가드한다.
  const placeDupGroups = React.useMemo(() => {
    if (subTab !== "하차지") return [];
    const map = new Map();
    placeRows.forEach(p => {
      const key = (p.업체명 || "").trim().toLowerCase().replace(/\s+/g, "");
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    return [...map.values()].filter(g => g.length >= 2).sort((a, b) => b.length - a.length);
  }, [placeRows, subTab]);

  // 업체명+주소 기준 중복 그룹 (같은 곳에 담당자만 다른 경우)
  const placeAddrDupGroups = React.useMemo(() => {
    if (subTab !== "하차지") return [];
    const map = new Map();
    placeRows.forEach(p => {
      const name = (p.업체명 || "").trim().toLowerCase().replace(/\s+/g, "");
      const addr = (p.주소 || "").trim().toLowerCase().replace(/\s+/g, "");
      const key = name + "||" + addr;
      if (!name) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });
    return [...map.values()].filter(g => g.length >= 2);
  }, [placeRows, subTab]);

  // 동일 업체명+주소 병합 처리된 placeRows
  const mergedPlaceRows = React.useMemo(() => {
    if (subTab !== "하차지") return placeRows;
    const addrDupMap = new Map();
    placeAddrDupGroups.forEach(group => {
      const name = (group[0].업체명 || "").trim().toLowerCase().replace(/\s+/g, "");
      const addr = (group[0].주소 || "").trim().toLowerCase().replace(/\s+/g, "");
      addrDupMap.set(name + "||" + addr, group);
    });
    const seenKeys = new Set();
    return placeRows.map(p => {
      const name = (p.업체명 || "").trim().toLowerCase().replace(/\s+/g, "");
      const addr = (p.주소 || "").trim().toLowerCase().replace(/\s+/g, "");
      const key = name + "||" + addr;
      if (addrDupMap.has(key)) {
        if (seenKeys.has(key)) return null; // skip duplicates
        seenKeys.add(key);
        const group = addrDupMap.get(key);
        // merge contacts from all docs
        const allContacts = group.map(g => ({ name: g.담당자 || "", phone: g.담당자번호 || "", _dupId: g.id })).filter(c => c.name);
        const primary = group[0];
        return { ...primary, _mergedIds: group.map(g => g.id), _allContacts: allContacts, 담당자: primary.담당자 || allContacts[0]?.name || "", 담당자번호: primary.담당자번호 || allContacts[0]?.phone || "" };
      }
      return p;
    }).filter(Boolean);
  }, [placeRows, placeAddrDupGroups, subTab]);
  const [placeQ, setPlaceQ] = React.useState("");
  const [placeSearched, setPlaceSearched] = React.useState(false);
  const [placeFilterType, setPlaceFilterType] = React.useState("업체명");
  const [placeGradeFilter, setPlaceGradeFilter] = React.useState("전체");
  const [placeShowN, setPlaceShowN] = React.useState(300); // 많으면 300건씩 나눠 그린다(끊김 방지)
  React.useEffect(() => { setPlaceShowN(300); }, [placeGradeFilter, placeSearched, placeQ]);
  const [placeSelected, setPlaceSelected] = React.useState(new Set());
  const [showDupPreview, setShowDupPreview] = React.useState(false);
  const [dupSelected, setDupSelected] = React.useState(new Set());
  const [placeNewForm, setPlaceNewForm] = React.useState({ 업체명: "", 주소: "", 담당자: "", 담당자번호: "", 등급: "일반", 메모: "" });
  const [showNewPlaceForm, setShowNewPlaceForm] = React.useState(false);
  const [placeDupOpen, setPlaceDupOpen] = React.useState(false);
  const [placeDupSelected, setPlaceDupSelected] = React.useState(new Set());
  const [placeDupDone, setPlaceDupDone] = React.useState(false);

  // ★ 부모에서 내려온 places(회사별 필터링 완료) 기반으로 placeRows 갱신
  React.useEffect(() => {
    setPlaceRows(placesProp.map(normalizePlaceRow));
  }, [placesProp]);

  // ═══════════════════════════════════════════════════
  // 기본 거래처
  // ═══════════════════════════════════════════════════
  const [q, setQ] = React.useState("");
  const [showAllClients, setShowAllClients] = React.useState(mobile); // ⭐ 2026-11-06 모바일은 처음부터 전체 목록(전체보기 버튼 없음)
  const [rows, setRows] = React.useState(() => (clients || []).map((c) => ({ ...c })));
  // 사업자등록증 OCR 스캔 팝업 — 열려있는 동안 스캔 대상 이미지를 들고 있는다
  const [ocrScanImage, setOcrScanImage] = React.useState(null);
  const [selected, setSelected] = React.useState(new Set());
  const [newForm, setNewForm] = React.useState({
    거래처명: "", 사업자번호: "", 대표자: "", 업태: "", 종목: "",
    주소: "", 담당자: "", 연락처: "", 이메일: "", 메모: "", 오더메모: "", 등급: "일반",
  });
  const [showNewClientModal, setShowNewClientModal] = React.useState(false);
  const [editingClientId, setEditingClientId] = React.useState(null);
  const [editClientModal, setEditClientModal] = React.useState(null); // row data for popup
  const cmBiz = useCompanyBiz(userCompany || localStorage.getItem("userCompany") || ""); // ⭐ 2026-11-03 여러 사업자
  const [editPlaceModal, setEditPlaceModal] = React.useState(null); // 하차지거래처 수정 팝업
  const [memoPopup, setMemoPopup] = React.useState(null); // memo text for popup
  const [filePreview, setFilePreview] = React.useState(null); // 첨부파일 미리보기

  // ═══════════════════════════════════════════════════
  // 하차지에서 불러오기 팝업
  // ═══════════════════════════════════════════════════
  const [showImportPopup, setShowImportPopup] = React.useState(false);
  const [importQ, setImportQ] = React.useState("");
  const [importDropOpen, setImportDropOpen] = React.useState(false);
  const [importDropIdx, setImportDropIdx] = React.useState(0);
  const [importSelected, setImportSelected] = React.useState([]);
  const importInputRef = React.useRef(null);
  const importDropRef = React.useRef(null);
  const importItemRefs = React.useRef([]);

  // 하차지거래처를 삭제하기 전에, 같은 이름의 기본거래처가 있으면(주소 표기가
  // 도로명/지번처럼 달라 "중복 정리"의 정확일치 후보에는 안 걸리는 경우까지 포함)
  // 그 담당자들을 먼저 기본거래처로 합쳐준다. 이게 없으면 이름은 같지만 주소
  // 표기가 달라 별도 문서로 남아있던 하차지거래처를 지울 때마다 그 담당자들이
  // 기본거래처로 옮겨지지 않고 그대로 사라져 버린다.
  const extractPlaceContacts = (p) => {
    if (Array.isArray(p._allContacts) && p._allContacts.length) return p._allContacts.map(c => ({ name: c.name || "", phone: c.phone || "" }));
    if (Array.isArray(p.contacts) && p.contacts.length) return p.contacts;
    if (Array.isArray(p._rawContacts) && p._rawContacts.length) return p._rawContacts;
    if (p.담당자) return [{ name: p.담당자, phone: p.담당자번호 || "" }];
    return [];
  };
  const mergePlaceContactsIntoClient = async (place) => {
    if (!place?.업체명) return;
    const client = rows.find(c => norm(c.거래처명 || "") === norm(place.업체명 || ""));
    if (!client) return;
    const placeContacts = extractPlaceContacts(place);
    if (!placeContacts.length) return;
    const baseContacts = Array.isArray(client.contacts) && client.contacts.length
      ? [...client.contacts]
      : (client.담당자 ? [{ name: client.담당자, phone: client.연락처 || "", isPrimary: true }] : []);
    const existingNames = new Set(baseContacts.map(c => (c.name || "").trim()).filter(Boolean));
    const mergedContacts = [...baseContacts];
    let changed = false;
    placeContacts.forEach(pc => {
      const nm = (pc.name || "").trim();
      if (nm && !existingNames.has(nm)) {
        existingNames.add(nm);
        mergedContacts.push({ name: nm, phone: pc.phone || "", isPrimary: false });
        changed = true;
      }
    });
    if (!changed) return;
    if (!mergedContacts.some(c => c.isPrimary) && mergedContacts.length) mergedContacts[0].isPrimary = true;
    try {
      await upsertClient?.({ id: client.id, 거래처명: client.거래처명, contacts: mergedContacts });
    } catch (e) {
      console.error("담당자 병합 실패:", client.거래처명, e);
    }
  };

  // ═══════════════════════════════════════════════════
  // 담당자 불일치 점검/복구 (임시) — 이름이 같은 기본거래처/하차지거래처 사이에
  // 담당자 목록이 서로 다르면(한쪽에만 있던 담당자가 있으면), 두 쪽을 합집합으로
  // 합쳐서 양쪽 모두에 반영한다. 예전에 두 컬렉션이 서로 동기화되지 않던 시절
  // 한쪽에서만 담당자가 갱신되어 반대쪽에 있던 담당자가 사라진 것처럼 보이는
  // 경우, 아직 어느 한쪽에 데이터가 남아있다면 이 도구로 되살릴 수 있다.
  // ═══════════════════════════════════════════════════
  const [showMismatchPopup, setShowMismatchPopup] = React.useState(false);
  const [mismatchSelected, setMismatchSelected] = React.useState(new Set());
  const [mismatchRunning, setMismatchRunning] = React.useState(false);
  const mismatchCandidates = React.useMemo(() => {
    if (subTab !== "기본") return [];
    const list = [];
    rows.forEach(c => {
      const cName = norm(c.거래처명 || "");
      if (!cName) return;
      const place = placeRows.find(p => norm(p.업체명 || "") === cName);
      if (!place) return;
      const cContacts = Array.isArray(c.contacts) && c.contacts.length
        ? c.contacts
        : (c.담당자 ? [{ name: c.담당자, phone: c.연락처 || "", isPrimary: true }] : []);
      const pContacts = extractPlaceContacts(place);
      const cNames = new Set(cContacts.map(x => (x.name || "").trim()).filter(Boolean));
      const pNames = new Set(pContacts.map(x => (x.name || "").trim()).filter(Boolean));
      const onlyInPlace = [...pNames].filter(n => !cNames.has(n));
      const onlyInClient = [...cNames].filter(n => !pNames.has(n));
      if (onlyInPlace.length || onlyInClient.length) {
        list.push({ client: c, place, cContacts, pContacts, onlyInPlace, onlyInClient });
      }
    });
    return list;
  }, [rows, placeRows, subTab]);

  const runMismatchFix = async () => {
    const targets = mismatchCandidates.filter(m => mismatchSelected.has(m.client.id || m.client.거래처명));
    if (!targets.length) return;
    setMismatchRunning(true);
    let ok = 0;
    for (const { client, place, cContacts, pContacts } of targets) {
      try {
        const merged = [...cContacts];
        const names = new Set(merged.map(c => (c.name || "").trim()).filter(Boolean));
        pContacts.forEach(pc => {
          const nm = (pc.name || "").trim();
          if (nm && !names.has(nm)) {
            names.add(nm);
            merged.push({ name: nm, phone: pc.phone || "", isPrimary: false });
          }
        });
        if (!merged.some(c => c.isPrimary) && merged.length) merged[0].isPrimary = true;
        await upsertClient?.({ id: client.id, 거래처명: client.거래처명, contacts: merged });
        ok++;
      } catch (e) {
        console.error("담당자 불일치 복구 실패:", client.거래처명, e);
      }
    }
    setMismatchRunning(false);
    setMismatchSelected(new Set());
    setShowMismatchPopup(false);
    showAlert(`${ok}건을 복구했습니다.\n양쪽 담당자 목록을 합쳐 반영했으며, 이후에는 자동으로 서로 동기화됩니다.`);
  };

// ⚠️ 예전엔 "로컬에 이미 있는 행이면 로컬값을 우선 보존"하는 병합 로직이었는데,
  // 그 판단 기준이 "같은 id/거래처명이 로컬에 존재하는가"였다 — 즉 편집 중인 행이
  // 아니라 이미 한 번이라도 화면에 그려진 행이면 전부 여기 해당돼서, Firestore에서
  // 확정된 최신 값(예: 방금 저장한 점심시간)이 나중에 다시 내려와도 그 행은 영원히
  // 예전 로컬 스냅샷에 묶여 절대 갱신되지 않는 버그였다(다른 메뉴로 갔다가 돌아와
  // 컴포넌트가 리마운트될 때 그 시점의 clients가 아직 서버 확정 전이면 그 오래된
  // 값이 그대로 굳어버림). rows는 clients를 그대로 비추는 용도일 뿐 별도로 보존해야
  // 할 미저장 편집 상태가 없으므로(수정 팝업은 별개의 editClientModal state를 씀),
  // 그냥 항상 최신 clients로 덮어써서 서버 데이터가 확실히 반영되게 한다.
  React.useEffect(() => {
    setRows((clients || []).map(c => ({ ...c })));
  }, [clients]);

  const filtered = React.useMemo(() => {
    if (q.trim()) {
      const nq = norm(q);
      return rows.filter((r) =>
        ["거래처명","사업자번호","대표자","주소","담당자","연락처","메모","오더메모"]
          .some((k) => norm(r[k] || "").includes(nq))
        || (Array.isArray(r.aliases) && r.aliases.some((a) => norm(a).includes(nq))) // ⭐ 2026-11-17 합친 거래처의 옛 이름으로 찾아도 나온다
      );
    }
    if (showAllClients) return rows;
    return [];
  }, [rows, q, showAllClients]);

  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // ⭐ 2026-11-02 전체선택이 일부만 되던 문제 — 행 체크박스·선택삭제·선택수정은 (id || 거래처명)을 키로 쓰는데
  //   전체선택만 거래처명으로 넣어서, id가 있는 거래처는 체크가 안 보이고 삭제도 안 됐다. 같은 키로 맞추고,
  //   지금 목록(검색·전체보기 결과)에 보이는 거래처 전부를 선택/해제한다.
  const clientRowId = (r) => r.id || r.거래처명 || "";
  const filteredClientIds = React.useMemo(() => filtered.map(clientRowId).filter(Boolean), [filtered]); // eslint-disable-line react-hooks/exhaustive-deps
  // ⭐ 머리글 클릭 정렬(▲→▼→해제) — 이 브라우저에만 기억
  const clientSort = useTableSort("clients");
  const sortedClients = React.useMemo(() => sortRows(filtered, clientSort.sort, (r, key, i) => {
    if (key === "순번") return i;
    if (key === "등급") return r.등급 || "일반";
    if (key === "일반메모") return r.메모;
    if (key === "안내사항") return _hasRealDriverNotice(r.기사전달주의사항) ? "등록" : "미등록";
    return r[key];
  }), [filtered, clientSort.sort]);
  const clientSelInView = React.useMemo(() => filteredClientIds.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0), [filteredClientIds, selected]);
  const clientAllChecked = filteredClientIds.length > 0 && clientSelInView === filteredClientIds.length;
  const toggleAll = () => {
    if (clientAllChecked) setSelected((prev) => { const n = new Set(prev); filteredClientIds.forEach((id) => n.delete(id)); return n; });
    else setSelected((prev) => { const n = new Set(prev); filteredClientIds.forEach((id) => n.add(id)); return n; });
  };

  const handleBlur = async (row, key, val) => {
    const id = row.id || row.거래처명;
    if (!id) return;
    await upsertClient({ ...row, id, [key]: val });
  };

  const addNew = async () => {
    const 거래처명 = (newForm.거래처명 || "").trim();
    if (!거래처명) return showAlert("거래처명은 필수입니다.");
    if (!(await bizGuardMain(newForm.사업자번호, { label: "거래처" }))) return; // 🏛 국세청 조회 결과 휴업 · 폐업이면 한 번 더 묻는다
    await upsertClient?.({ ...newForm, id: 거래처명 });
    setNewForm({ 거래처명: "", 사업자번호: "", 대표자: "", 업태: "", 종목: "", 주소: "", 담당자: "", 연락처: "", 이메일: "", 메모: "", 등급: "일반" });
    setShowNewClientModal(false);
    showAlert("등록 완료");
  };

  const handleClientFile = async (file) => {
    if (!file) return;
    let base64;
    if (file.type.startsWith("image/")) {
      base64 = await compressClientImage(file);
    } else {
      base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
    }
    if (base64.length > CLIENT_FILE_BASE64_LIMIT) {
      showAlert(`파일이 너무 큽니다. 더 작은 파일을 사용하거나 이미지를 압축해서 다시 첨부해주세요.`);
      return;
    }
    setEditClientModal(p => ({ ...p, 첨부파일Base64: base64, 첨부파일명: file.name, 첨부파일타입: file.type }));
  };

  // ⭐ 거래처관리(기본거래처/하차지거래처)에서 주소·담당자를 고쳐도, 이미 등록된
  // 과거 오더들에는 그 정보가 "등록 당시 스냅샷"으로 그대로 남아있어 배차현황/
  // 실시간배차현황 화면에 바로 반영되지 않았다 — 오더복사/수정 패널에 들어가
  // 상/하차지명을 다시 선택(드롭다운 재선택)해야만 새 정보가 채워지는 불편이
  // 있었다. 아래에서 이름이 일치하는 모든 오더(orders/dispatch 두 컬렉션 모두)를
  // 찾아 바뀐 필드만 조용히(이력/updatedAt 건드리지 않고) 함께 갱신한다.
  // companyName 필드가 없는 옛 문서는 기본 회사로 취급하는 게 이 코드베이스 전반의
  // 관례라, Firestore where절만으로는 그 폴백을 표현할 수 없어 매칭 이름으로 일단
  // 가져온 뒤 companyName은 클라이언트에서 다시 한 번 걸러 다른 회사 데이터를
  // 실수로 건드리지 않게 한다.
  const propagateFieldsToOrders = async (matchField, name, patchByField) => {
    const trimmedName = (name || "").trim();
    if (!trimmedName || !patchByField || !Object.keys(patchByField).length) return 0;
    const myCompany = (userCompany || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY;
    let updated = 0;
    for (const colName of ["orders", "dispatch"]) {
      try {
        const snap = await getDocs(query(collection(db, colName), where(matchField, "==", trimmedName)));
        await Promise.all(snap.docs.map(async (d) => {
          const cur = d.data();
          if ((cur.companyName || DEFAULT_COMPANY) !== myCompany) return;
          const patch = {};
          Object.entries(patchByField).forEach(([k, v]) => {
            if ((cur[k] || "") !== (v || "")) patch[k] = v;
          });
          if (!Object.keys(patch).length) return;
          await updateDoc(doc(db, colName, d.id), patch);
          updated++;
        }));
      } catch (e) {
        console.error(`propagateFieldsToOrders(${colName}) 오류:`, e);
      }
    }
    return updated;
  };

  // ⭐ 거래처명/업체명 자체가 바뀐 경우(상호 변경, 예: "후레쉬2공장" → "행담") — 운임조회/
  // 매출집계/신규거래처 판정 등은 전부 이름이 일치해야 같은 거래처로 인식하므로, 이름만
  // 바꾸고 두면 새 이름은 이력이 하나도 없는 "신규 거래처"로 보이고 예전 이력은 옛 이름에
  // 그대로 남아 서로 끊어진다. 실제로는 같은 사업자이므로 과거 오더의 이름 필드 자체를
  // 새 이름으로 함께 바꿔(cascade rename) 하나의 이력으로 계속 이어지게 한다.
  const renameAcrossOrders = async (matchField, oldName, newName) => {
    const from = (oldName || "").trim();
    const to = (newName || "").trim();
    if (!from || !to || from === to) return 0;
    const myCompany = (userCompany || DEFAULT_COMPANY).trim() || DEFAULT_COMPANY;
    let updated = 0;
    for (const colName of ["orders", "dispatch"]) {
      try {
        const snap = await getDocs(query(collection(db, colName), where(matchField, "==", from)));
        await Promise.all(snap.docs.map(async (d) => {
          if ((d.data().companyName || DEFAULT_COMPANY) !== myCompany) return;
          await updateDoc(doc(db, colName, d.id), { [matchField]: to });
          updated++;
        }));
      } catch (e) {
        console.error(`renameAcrossOrders(${colName}) 오류:`, e);
      }
    }
    return updated;
  };

  const saveEditClient = async () => {
    if (!editClientModal) return;
    const id = editClientModal.id || editClientModal.거래처명;
    if (!id) return;
    const original = rows.find(r => (r.id || r.거래처명) === id) || {};
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; // 이름을 바꿨으면 아래에서 과거 오더도 바꿀지 한 번 더 묻는다
    if (!(await bizGuardMain(editClientModal.사업자번호, { label: "거래처" }))) return; // 🏛 국세청 조회 결과 휴업 · 폐업이면 한 번 더 묻는다
    const { _dragOver, ...data } = editClientModal;
    // 담당자 목록에서 대표(또는 첫 번째) 담당자를 평면 필드(담당자/연락처)에도 반영 —
    // 여러 화면이 아직 이 평면 필드를 폴백으로 읽고 있어 계속 맞춰줘야 한다.
    const contacts = Array.isArray(data.contacts) ? data.contacts.filter(c => c.name?.trim() || c.phone?.trim()) : [];
    const primaryContact = contacts.find(c => c.isPrimary) || contacts[0] || null;
    data.contacts = contacts;
    data.담당자 = primaryContact?.name || "";
    data.연락처 = primaryContact?.phone || "";
    // 안내사항이 기본양식("[업체명 주의사항]\n- ")뿐이면 미등록(빈 값)으로 저장
    if (data.기사전달주의사항 !== undefined && !_hasRealDriverNotice(data.기사전달주의사항)) data.기사전달주의사항 = "";

    const oldName = (original.거래처명 || "").trim();
    const newName = (data.거래처명 || "").trim();
    const nameChanged = !!oldName && !!newName && oldName !== newName;
    let cascadeRename = false;
    if (nameChanged) {
      cascadeRename = await kpConfirm(
        `거래처명을 "${oldName}" → "${newName}"(으)로 변경합니다.\n\n` +
        `과거 "${oldName}"으로 등록된 모든 오더의 거래처명도 함께 "${newName}"(으)로 바꿔야 운임조회·매출 이력이 끊기지 않고 계속 이어집니다.\n` +
        `함께 바꾸시겠습니까?\n\n(취소를 누르면 거래처명만 바뀌고, 과거 오더들은 예전 이름 "${oldName}" 그대로 남아요. 새 이름은 이력 없는 신규 거래처로 보여요.)`
      );
    }

    // ⭐ 저장 속도: 서버 확인/오더 동기화를 기다리지 않고 화면은 즉시 반영·닫는다
    setRows(prev => prev.map(r => (r.id || r.거래처명) === id ? { ...data } : r));
    setEditClientModal(null);
    showAlert("수정 완료");

    (async () => {
    try {
      await upsertClient?.({ ...data, id });
    } catch (e) {
      console.error("saveEditClient 오류:", e);
      showAlert("저장에 실패했습니다: " + (e?.message || "알 수 없는 오류"));
      return;
    }

    let syncedCount = 0;
    try {
      if (nameChanged && cascadeRename) {
        syncedCount += await renameAcrossOrders("거래처명", oldName, newName);
      }
      // 이름을 안 바꿨거나(nameChanged=false) 바꿨지만 cascade를 취소한 경우, 과거 오더는
      // 여전히 oldName을 갖고 있으므로 그 이름 기준으로 주소/담당자만이라도 맞춰준다.
      const matchName = nameChanged && cascadeRename ? newName : oldName || newName;
      const patch = {};
      if ((original.주소 || "") !== (data.주소 || "")) patch.거래처주소 = data.주소 || "";
      if ((original.담당자 || "") !== (data.담당자 || "")) patch.거래처담당자 = data.담당자 || "";
      if ((original.연락처 || "") !== (data.연락처 || "")) patch.거래처연락처 = data.연락처 || "";
      if (Object.keys(patch).length) {
        syncedCount += await propagateFieldsToOrders("거래처명", matchName, patch);
      }
    } catch (e) {
      console.error("거래처 정보 오더 동기화 오류:", e);
    }
    if (syncedCount > 0) console.log(`거래처 수정: 연결된 오더 ${syncedCount}건 정보 동기화`);
    })();
  };

  const saveEditPlace = async () => {
    if (!editPlaceModal) return;
    const id = editPlaceModal.id || editPlaceModal.업체명;
    if (!id) return;
    const original = placeRows.find(r => (r.id || r.업체명) === id) || {};
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return;
    // upsertPlace는 place._id로 대상 문서를 찾는데, editPlaceModal은 .id만 갖고 있어
    // _id가 한 번도 전달되지 않았다. 그 결과 매번 업체명으로 문서를 다시 찾는 폴백
    // 경로를 타게 되어, 같은 업체명의 문서가 여러 개면 엉뚱한 문서를 수정/조회하게
    // 되고, 방금 수정한 문서는 그대로 남아 있다가 실시간 리스너로 되돌아와 보였다.
    let contacts = Array.isArray(editPlaceModal.contacts)
      ? editPlaceModal.contacts.filter(c => c.name?.trim() || c.phone?.trim())
      : [];
    if (contacts.length && !contacts.some(c => c.isPrimary)) {
      contacts = contacts.map((c, i) => i === 0 ? { ...c, isPrimary: true } : c);
    }
    const primary = contacts.find(c => c.isPrimary) || contacts[0] || null;
    const 담당자 = primary?.name || "";
    const 담당자번호 = primary?.phone || "";

    const oldName = (original.업체명 || "").trim();
    const newName = (editPlaceModal.업체명 || "").trim();
    const nameChanged = !!oldName && !!newName && oldName !== newName;
    let cascadeRename = false;
    if (nameChanged) {
      cascadeRename = await kpConfirm(
        `업체명을 "${oldName}" → "${newName}"(으)로 변경합니다.\n\n` +
        `과거 "${oldName}"으로 등록된 모든 오더의 상차지명/하차지명도 함께 "${newName}"(으)로 바꿔야 운임조회 이력이 끊기지 않고 계속 이어집니다.\n` +
        `함께 바꾸시겠습니까?\n\n(취소를 누르면 업체명만 바뀌고, 과거 오더들은 예전 이름 "${oldName}" 그대로 남습니다)`
      );
    }

    // ⭐ 저장 속도: 예전엔 문서 조회 → 서버 저장 확인 → 기본거래처 검색/동기화 →
    // 과거 오더 전체 검색/동기화가 다 끝나야 팝업이 닫혀 매우 느렸다. 화면은 즉시
    // 반영·닫고, 나머지는 백그라운드에서 처리한다.
    const placePayload = { ...editPlaceModal, _id: editPlaceModal.id, id, contacts, 담당자, 담당자번호 };
    // 안내사항이 기본양식("[업체명 주의사항]\n- ")뿐이면 미등록(빈 값)으로 저장
    if (!_hasRealDriverNotice(placePayload.기사전달주의사항)) placePayload.기사전달주의사항 = "";
    // ⚠️ 더블클릭으로 다시 열 때는 담당자 목록을 contacts가 아니라 _rawContacts에서 다시
    // 채운다(위 주석 참고) — 여기서 _rawContacts도 함께 갱신하지 않으면, 저장 직후 실시간
    // 리스너가 아직 새 데이터를 반영하기 전에 곧바로 다시 열었을 때 옛 담당자 목록(저장 전
    // _rawContacts)이 그대로 보이는 문제가 있었다.
    setPlaceRows(prev => prev.map(r => (r.id || r.업체명) === id ? { ...editPlaceModal, 기사전달주의사항: placePayload.기사전달주의사항, contacts, 담당자, 담당자번호, _rawContacts: contacts } : r));
    setEditPlaceModal(null);
    showAlert("수정 완료");

    (async () => {
    try { await upsertPlace?.(placePayload); } catch (e) { console.error("saveEditPlace 오류:", e); }
    let syncedCount = 0;
    try {
      if (nameChanged && cascadeRename) {
        syncedCount += await renameAcrossOrders("상차지명", oldName, newName);
        syncedCount += await renameAcrossOrders("하차지명", oldName, newName);
      }
      const matchName = nameChanged && cascadeRename ? newName : oldName || newName;
      const newAddr = editPlaceModal.주소 || "";
      const patchPickup = {}, patchDrop = {};
      if ((original.주소 || "") !== newAddr) { patchPickup.상차지주소 = newAddr; patchDrop.하차지주소 = newAddr; }
      if ((original.담당자 || "") !== 담당자) { patchPickup.상차지담당자 = 담당자; patchDrop.하차지담당자 = 담당자; }
      if ((original.담당자번호 || "") !== 담당자번호) { patchPickup.상차지담당자번호 = 담당자번호; patchDrop.하차지담당자번호 = 담당자번호; }
      if (Object.keys(patchPickup).length) syncedCount += await propagateFieldsToOrders("상차지명", matchName, patchPickup);
      if (Object.keys(patchDrop).length) syncedCount += await propagateFieldsToOrders("하차지명", matchName, patchDrop);
    } catch (e) {
      console.error("하차지거래처 정보 오더 동기화 오류:", e);
    }
    if (syncedCount > 0) console.log(`하차지 수정: 연결된 오더 ${syncedCount}건 정보 동기화`);
    })();
  };

  const removeSelectedFn = async () => {
    if (!selected.size) return showAlert("선택된 항목이 없습니다.");
    if (!(await kpConfirm(`${selected.size}건 삭제하시겠습니까?`))) return;
    await removeClient?.([...selected]); // ⭐ 2026-11-05 한 번에 삭제 + 진행 창
    setSelected(new Set());
    showAlert("삭제 완료");
  };

  // 📥 대용량 업로드 선택창(양식 다운로드 / 엑셀 업로드) — "client"(기본거래처) | "place"(하차지거래처)
  const [clientBulkKind, setClientBulkKind] = React.useState(null);
  const clientBulkChooser = clientBulkKind && (clientBulkKind === "client" ? (
    <BulkUploadChooser
      title="기본거래처 대용량 업로드" subtitle="엑셀로 거래처를 한꺼번에 등록·수정합니다. 처음이면 양식부터 받아 주세요."
      templateDesc="거래처명·사업자번호·대표자·주소·담당자·연락처 등 열과 예시, 작성 안내가 들어 있는 양식을 받습니다."
      templateTips={["거래처명은 필수 (없는 줄은 건너뜀)", "같은 거래처명이 있으면 내용만 갱신"]}
      uploadDesc="작성한 양식을 고르면 등록할 건수를 먼저 보여드리고, 확인 후 반영합니다."
      uploadTips={["빈 줄은 자동으로 건너뜀", "일반메모·오더메모도 함께 저장"]}
      onClose={() => setClientBulkKind(null)}
      onTemplate={async () => downloadTemplateXlsx(await loadXLSX(), "기본거래처_양식.xlsx", "거래처", ["거래처명", "사업자번호", "대표자", "업태", "종목", "주소", "담당자", "연락처", "이메일", "일반메모", "오더메모"],
        [["동원F&B", "123-45-67890", "홍길동", "제조", "식품", "서울 서초구 마방로 68", "김대리", "02-1234-5678", "kim@example.com", "", "파레트 회수 필수"]],
        [["예시 1줄", "예시 줄은 지우고 거래처를 한 줄에 하나씩 입력하세요."], ["거래처명", "필수. 같은 이름이 이미 있으면 새로 만들지 않고 내용만 고칩니다."], ["일반메모 / 오더메모", "오더메모는 오더 등록 시 함께 보이는 메모입니다."]])}
      onFile={(e) => { setClientBulkKind(null); onExcel(e); }}
    />
  ) : (
    <BulkUploadChooser
      title="상하차지거래처 대용량 업로드" subtitle="엑셀로 상하차지를 한꺼번에 등록합니다. 처음이면 양식부터 받아 주세요."
      templateDesc="업체명·주소·담당자·담당자번호·메모 열과 예시, 작성 안내가 들어 있는 양식을 받습니다."
      templateTips={["업체명·주소는 필수", "같은 주소가 이미 있으면 건너뜀(중복 방지)"]}
      uploadDesc="작성한 양식을 고르면 새로 등록될 건수를 먼저 보여드리고, 확인 후 반영합니다."
      uploadTips={["빈 줄·주소 없는 줄은 건너뜀", "주소는 도로명/지번 모두 가능"]}
      onClose={() => setClientBulkKind(null)}
      onTemplate={async () => downloadTemplateXlsx(await loadXLSX(), "상하차지거래처_양식.xlsx", "상하차지", ["업체명", "주소", "담당자", "담당자번호", "메모"],
        [["CJ 대구센터", "대구 달서구 성서로 10", "박과장", "010-2222-3333", "하차 09시 이후"], ["이마트 광주센터", "광주 광산구 하남산단 5", "", "", ""]],
        [["예시 2줄", "예시 줄은 지우고 상하차지를 한 줄에 하나씩 입력하세요."], ["업체명 · 주소", "필수. 주소가 없으면 그 줄은 건너뜁니다."], ["중복", "이미 같은 주소로 등록된 상하차지는 건너뜁니다."]])}
      onFile={(e) => { setClientBulkKind(null); onExcelPlaces(e); }}
    />
  ));
  const onExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        let ok = 0;
        const validC = json.filter((r) => String(r.거래처명 || r["상호"] || r["회사명"] || "").trim());
        if (!validC.length) { showAlert("등록할 거래처가 없습니다. (거래처명 열을 확인해 주세요)"); return; }
        if (!await kpConfirm(`거래처 ${validC.length}곳을 등록·갱신할까요?${json.length - validC.length ? `\n(거래처명이 없는 ${json.length - validC.length}줄은 건너뜁니다)` : ""}`)) return;
        // ⭐ 2026-11-02 점검 — 문서 id를 거래처명 그대로 쓰지 않음(회사별 키 coDocKey 사용). 같은 이름의 기존 거래처가 있으면 그 문서를 갱신. 한 줄이 실패해도 나머지는 계속 반영
        const failC = [];
        const upC = await runUpload({ items: validC, label: "거래처", each: async (r) => { // 📥 2026-11-12 가운데 로딩 창 + 묶음 등록
          const 거래처명 = String(r.거래처명 || r["상호"] || r["회사명"] || "").trim();
          if (!거래처명) return false;
          const existC = (clients || []).find((c) => normalizeCompanyKey(c.거래처명 || "") === normalizeCompanyKey(거래처명));
          try {
          await upsertClient?.({
            거래처명,
            사업자번호: String(r.사업자번호 || "").trim(),
            대표자: String(r.대표자 || r["대표자명"] || "").trim(),
            업태: String(r.업태 || "").trim(),
            종목: String(r.종목 || "").trim(),
            주소: String(r.주소 || "").trim(),
            담당자: String(r.담당자 || "").trim(),
            연락처: String(r.연락처 || r["전화번호"] || "").trim(),
            이메일: String(r.이메일 || r["email"] || "").trim(),
            메모: String(r.메모 || r["일반메모"] || "").trim(),
            오더메모: String(r.오더메모 || "").trim(),
            ...(existC?.id ? { id: existC.id } : {}),
          });
          } catch (rowErr) { failC.push(거래처명); return false; }
        } });
        ok = upC.ok;
        showAlert(`총 ${ok}건 반영 완료${failC.length ? `\n반영 실패 ${failC.length}건: ${failC.slice(0, 5).join(", ")}${failC.length > 5 ? " 외" : ""}` : ""}`);
      } catch (err) { console.error(err); showAlert("엑셀 처리 중 오류가 발생했습니다. 파일 형식을 확인해 주세요."); } finally { e.target.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadClientExcel = async () => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    const data = filtered.length > 0 ? filtered : rows;
    if (!data.length) return showAlert("다운로드할 데이터가 없습니다.");
    const ws = XLSX.utils.json_to_sheet(data.map(r => ({
      거래처명: r.거래처명||"", 사업자번호: r.사업자번호||"", 대표자: r.대표자||"",
      업태: r.업태||"", 종목: r.종목||"", 주소: r.주소||"",
      담당자: r.담당자||"", 연락처: r.연락처||"", 이메일: r.이메일||"", 일반메모: r.메모||"", 오더메모: r.오더메모||"",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "거래처");
    XLSX.writeFile(wb, "거래처_목록.xlsx");
  };

  // ═══════════════════════════════════════════════════
  // ★ importDropOptions — placeRows가 위에서 선언됐으므로 안전
  // ═══════════════════════════════════════════════════
  const importDropOptions = React.useMemo(() => {
    const q2 = (importQ || "").trim();
    if (!q2) return [];
    const nq = norm(q2);
    return placeRows
      .map(p => {
        const nn = norm(p.업체명 || "");
        let score = 0;
        if (nn === nq) score = 100;
        else if (nn.startsWith(nq)) score = 80;
        else if (nn.includes(nq)) score = 50;
        return score > 0 ? { ...p, __score: score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.__score - a.__score)
      .slice(0, 15);
  }, [importQ, placeRows]);

  React.useEffect(() => {
    if (!importDropOpen) return;
    const el = importItemRefs.current[importDropIdx];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [importDropIdx, importDropOpen]);

  React.useEffect(() => {
    const handler = (e) => {
      if (importDropRef.current && !importDropRef.current.contains(e.target)) {
        setImportDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleImportKeyDown = (e) => {
    if (!importDropOpen || importDropOptions.length === 0) {
      if (e.key === "ArrowDown" && importDropOptions.length > 0) {
        setImportDropOpen(true); setImportDropIdx(0);
      }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setImportDropIdx(i => Math.min(i + 1, importDropOptions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setImportDropIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const pick = importDropOptions[importDropIdx];
      if (!pick) return;
      if (!importSelected.find(s => s.id === pick.id)) {
        setImportSelected(prev => [...prev, pick]);
      }
      setImportQ("");
      setImportDropOpen(false);
    } else if (e.key === "Escape") {
      setImportDropOpen(false);
    } else if (e.key === "Tab") {
      const pick = importDropOptions[importDropIdx];
      if (pick) {
        if (!importSelected.find(s => s.id === pick.id)) {
          setImportSelected(prev => [...prev, pick]);
        }
        setImportQ("");
        setImportDropOpen(false);
      }
    }
  };

  const addImportItem = (place) => {
    if (!importSelected.find(s => s.id === place.id)) {
      setImportSelected(prev => [...prev, place]);
    }
    setImportQ("");
    setImportDropOpen(false);
    setTimeout(() => importInputRef.current?.focus(), 50);
  };

  const removeImportItem = (id) => {
    setImportSelected(prev => prev.filter(s => s.id !== id));
  };

  const saveImport = async () => {
    if (!importSelected.length) return showAlert("불러올 항목을 선택하세요.");
    let ok = 0;
    const _movedIds = [];
    for (const p of importSelected) {
      const existing = rows.find(r => norm(r.거래처명) === norm(p.업체명));
      await upsertClient?.({
        거래처명: p.업체명,
        주소: p.주소 || "",
        담당자: p.담당자 || "",
        연락처: p.담당자번호 || "",
        // 하차지거래처의 메모는 곧 등록 시 팝업을 띄우던 메모였으므로, 기본거래처로
        // 옮긴 뒤에도 동일하게 동작하도록 오더메모로 이관한다.
        오더메모: p.메모 || existing?.오더메모 || "",
        메모: existing?.메모 || "",
        사업자번호: existing?.사업자번호 || "",
        대표자: existing?.대표자 || "",
        업태: existing?.업태 || "",
        종목: existing?.종목 || "",
        id: p.업체명,
      });
      // 기본거래처로 "이동"이지 "복사"가 아니므로, 옮긴 원본은 하차지거래처에서 제거한다
      if (p.id) _movedIds.push(p.id); // ⭐ 2026-11-05 옮긴 원본은 끝에 한 번에 삭제
      ok++;
    }
    if (_movedIds.length) await removePlace(_movedIds);
    showAlert(`${ok}건이 기본 거래처로 이동되었습니다.`);
    setImportSelected([]);
    setImportQ("");
    setShowImportPopup(false);
  };

  // ═══════════════════════════════════════════════════
  // 하차지 거래처 함수들
  // ═══════════════════════════════════════════════════
  const gradeStats = React.useMemo(() => {
    if (subTab !== "하차지") return { 전체: 0, 일반: 0, 블랙: 0, 주의: 0, 이탈: 0 };
    const stats = { 전체: mergedPlaceRows.length, 일반: 0, 블랙: 0, 주의: 0, 이탈: 0 };
    mergedPlaceRows.forEach(r => { const g = r.등급 || "일반"; if (stats[g] !== undefined) stats[g]++; });
    return stats;
  }, [mergedPlaceRows, subTab]);

  const filteredPlaces = React.useMemo(() => {
    if (subTab !== "하차지") return [];
    let list = mergedPlaceRows;
    if (placeGradeFilter !== "전체") list = list.filter(r => (r.등급 || "일반") === placeGradeFilter);
    if (!placeSearched || !placeQ.trim()) return list; // '전체'도 바로 전체 목록
    const nq = norm(placeQ);
    if (placeFilterType === "업체명") return list.filter((r) => norm(r.업체명 || "").includes(nq));
    if (placeFilterType === "주소") return list.filter((r) => norm(r.주소 || "").includes(nq));
    return list;
  }, [mergedPlaceRows, placeQ, placeSearched, placeFilterType, placeGradeFilter, subTab]);

  const togglePlaceOne = (id) => setPlaceSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // ⭐ 2026-11-02 전체선택은 "더 보기"로 아직 안 펼친 줄까지 지금 검색결과 전체를 고른다(개수는 선택삭제 버튼에 표시)
  const filteredPlaceIds = React.useMemo(() => filteredPlaces.map((p) => p.id || p.업체명).filter(Boolean), [filteredPlaces]);
  // ⭐ 머리글 클릭 정렬(▲→▼→해제) — 이 브라우저에만 기억. 걸러진 목록만 정렬하고 "더 보기"는 그 순서대로
  const placeSort = useTableSort("places");
  const sortedPlaces = React.useMemo(() => sortRows(filteredPlaces, placeSort.sort, (r, key, i) => {
    if (key === "순번") return i;
    if (key === "등급") return r.등급 || "일반";
    if (key === "일반메모") return r.메모;
    if (key === "안내사항") return _hasRealDriverNotice(r.기사전달주의사항) ? "등록" : "미등록";
    return r[key];
  }), [filteredPlaces, placeSort.sort]);
  const placeSelInView = React.useMemo(() => filteredPlaceIds.reduce((n, id) => n + (placeSelected.has(id) ? 1 : 0), 0), [filteredPlaceIds, placeSelected]);
  const placeAllChecked = filteredPlaceIds.length > 0 && placeSelInView === filteredPlaceIds.length;
  const togglePlaceAll = () => {
    if (placeAllChecked) setPlaceSelected((prev) => { const n = new Set(prev); filteredPlaceIds.forEach((id) => n.delete(id)); return n; });
    else setPlaceSelected((prev) => { const n = new Set(prev); filteredPlaceIds.forEach((id) => n.add(id)); return n; });
  };

  const handlePlaceBlur = async (row, key, val) => {
    if (key !== "등급" && (row[key] || "") === val) return;
    if (key === "등급" && (row.등급 || "일반") === val) return;
    if (!(await kpConfirm("수정하시겠습니까?", { okText: "저장" }))) return; // ✅ 2026-11-23 취소하면 고르기 전 등급 그대로
    setPlaceRows(prev => prev.map(p => p.id === row.id ? { ...p, [key]: val } : p));
    const updateData = { ...row, _id: row.id, [key]: val };
    if (key === "등급" && val !== "일반") updateData.등급변경일 = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    await upsertPlace?.(updateData);
  };

  const addNewPlace = async () => {
    const 업체명 = (placeNewForm.업체명 || "").trim();
    if (!업체명) return showAlert("업체명은 필수입니다.");
    if (!placeNewForm.주소?.trim()) return showAlert("주소는 필수입니다.");
    await upsertPlace?.({ ...placeNewForm, 업체명, 등급: placeNewForm.등급 || "일반" });
    setPlaceNewForm({ 업체명: "", 주소: "", 담당자: "", 담당자번호: "", 등급: "일반", 메모: "" });
    setShowNewPlaceForm(false);
    showAlert("등록 완료");
  };

  const removeSelectedPlaces = async () => {
    if (!placeSelected.size) return showAlert("선택된 항목이 없습니다.");
    if (!(await kpConfirm(`${placeSelected.size}건 삭제할까요?`))) return;
    // ⭐ 2026-11-05 담당자 병합(예전과 같음)을 먼저 끝내고, 삭제는 한 번에(진행 창) — 줄이 하나씩 사라지지 않게
    const ids = [...placeSelected];
    await runDelete({ count: ids.length, label: "하차지", task: async () => {
      for (const id of ids) {
        const row = mergedPlaceRows.find(p => (p.id || p.업체명) === id);
        if (row) await mergePlaceContactsIntoClient(row);
      }
      await removePlace(ids);
    } });
    setPlaceSelected(new Set());
    showAlert("삭제 완료");
  };

  const duplicatePlaceGroups = React.useMemo(() => {
    // 이 값은 "하차지거래처" 탭에서만 쓰인다 — "기본거래처" 탭으로 마운트될 때도
    // 계산해버리면(전체 O(n²) 비교) 탭을 오갈 때마다 불필요하게 무거운 계산이 반복돼
    // 렉의 주 원인이 됐다.
    if (subTab !== "하차지") return [];
    const normAddr = (s = "") => normalizePlace(s).replace(/(대한민국|한국|경기도|서울특별시)/g, "").replace(/[^\w가-힣]/g, "");
    // 예전엔 전체 목록을 O(n²)로 통째로 비교했다 — 업체명이 다르면 애초에 그룹이 될 수
    // 없으므로, 먼저 업체명으로 O(n) 묶은 뒤 같은 이름끼리(보통 소수)만 주소 퍼지매칭
    // 비교를 한다. 결과는 기존 로직과 동일, 비교 횟수만 크게 줄어든다.
    const byName = new Map();
    placeRows.forEach(p => {
      if (!p?.주소) return;
      const key = normalizeCompanyName(p.업체명 || "");
      if (!key) return;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(p);
    });
    const groups = [];
    byName.forEach(candidates => {
      if (candidates.length < 2) return;
      const used = new Set();
      for (let i = 0; i < candidates.length; i++) {
        const a = candidates[i];
        if (used.has(a.id)) continue;
        const aAddr = normAddr(a.주소);
        const group = [a];
        for (let j = i + 1; j < candidates.length; j++) {
          const b = candidates[j];
          if (used.has(b.id)) continue;
          const bAddr = normAddr(b.주소);
          if (aAddr === bAddr || aAddr.includes(bAddr) || bAddr.includes(aAddr)) { group.push(b); used.add(b.id); }
        }
        if (group.length > 1) { group.forEach((p) => used.add(p.id)); group.sort((a, b) => (b.주소||"").length - (a.주소||"").length); groups.push(group); }
      }
    });
    return groups;
  }, [placeRows, subTab]);

  const removeDuplicatePlaces = async () => {
    if (dupSelected.size === 0) return showAlert("삭제할 중복 항목을 선택하세요.");
    if (!(await kpConfirm(`선택한 중복 상하차지 ${dupSelected.size}건을 삭제하시겠습니까?\n삭제한 항목은 되돌릴 수 없습니다.`))) return;
    await removePlace([...dupSelected]); // ⭐ 2026-11-05 한 번에 삭제 + 진행 창
    setDupSelected(new Set()); showAlert(`${dupSelected.size}건 삭제 완료`);
  };

  const onExcelPlaces = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        const addrMap = new Map();
        for (const p of placeRows) { const k = normalizePlace(p.주소 || ""); if (k) addrMap.set(k, p); }
        // ☎ 2026-11-12 담당자번호 칸에는 번호만 — "김해룡총괄: 010-…" · "010-… / 안전목 + 고임목"처럼 섞여 있으면 이름 · 번호 · 메모로 나눈다(src/contactCell.js)
        const rowOf = (r) => {
          const 업체명 = (r.업체명||r["하차지명"]||r["상호"]||"").toString().trim();
          const 주소 = (r.주소||r["하차지주소"]||"").toString().trim();
          const c = splitContactCell((r.담당자||"").toString(), (r.담당자번호||r["전화번호"]||"").toString());
          const memo0 = (r.메모||"").toString().trim();
          return { 업체명, 주소, 담당자: c.name, 담당자번호: c.phone, 메모: [memo0, c.extra].filter((x) => x && !memo0.includes(c.extra || "\u0000")).join(" / ") || memo0, 등급: "일반" };
        };
        // 이미 등록된 곳인데 번호 칸에 글자가 섞여 있거나 담당자 칸이 비어 보이는 곳 → 이 파일 값으로 번호만 바로잡는다
        const fixes = [];
        json.forEach((r) => {
          const x = rowOf(r); const k = normalizePlace(x.주소); const ex = k ? addrMap.get(k) : null;
          if (!ex || !(ex.id || ex._id) || !x.담당자번호) return;
          const exPhone = String(ex.담당자번호 || "").trim();
          const exContacts = Array.isArray(ex._rawContacts) ? ex._rawContacts : Array.isArray(ex.contacts) ? ex.contacts : [];
          const noContact = !exContacts.some((c) => (c?.phone || "").trim());
          if (!isCleanPhone(exPhone) || (noContact && exPhone)) fixes.push({ _id: ex.id || ex._id, 업체명: ex.업체명, 주소: ex.주소, contacts: [{ name: x.담당자 || (isCleanPhone(String(ex.담당자 || "")) ? "" : String(ex.담당자 || "").trim()), phone: x.담당자번호, isPrimary: true }], 메모: [String(ex.메모 || "").trim(), x.메모].filter((v, i, a) => v && a.indexOf(v) === i).join(" / ") });
        });
        let ok = 0;
        const newRows = json.filter((r) => { const n = (r.업체명||r["하차지명"]||r["상호"]||"").toString().trim(); const k = normalizePlace((r.주소||r["하차지주소"]||"").toString().trim()); return n && k && !addrMap.has(k); });
        if (!newRows.length && !fixes.length) { showAlert("새로 등록할 상하차지가 없습니다.\n(업체명·주소가 비었거나, 이미 같은 주소로 등록된 상하차지입니다)"); return; }
        if (!await kpConfirm(`${newRows.length ? `상하차지 ${newRows.length}곳을 새로 등록` : ""}${newRows.length && fixes.length ? "하고, " : ""}${fixes.length ? `이미 등록된 ${fixes.length}곳의 담당자번호를 번호만 남기게 정리` : ""}할까요?${json.length - newRows.length - fixes.length > 0 ? `\n(빈 줄·주소 없음·이미 등록된 ${json.length - newRows.length - fixes.length}줄은 건너뜁니다)` : ""}`)) return;
        // 📥 같은 주소는 먼저 걸러 두고(파일 안 중복 포함), 가운데 로딩 창 + 묶음으로 동시에 등록
        const uniq = [];
        for (const r of newRows) {
          const x = rowOf(r); if (!x.업체명) continue;
          const k = normalizePlace(x.주소); if (!k || addrMap.has(k)) continue;
          addrMap.set(k, { 업체명: x.업체명, 주소: x.주소 });
          uniq.push(x);
        }
        const up = await runUpload({ items: [...uniq, ...fixes], label: "상하차지", each: (x) => upsertPlace?.(x) });
        ok = Math.min(uniq.length, up.ok);
        showAlert(`신규 ${ok}건 반영${fixes.length ? ` · 담당자번호 정리 ${fixes.length}곳` : ""}`);
      } catch (err) { console.error(err); showAlert("엑셀 처리 중 오류가 발생했습니다. 파일 형식을 확인해 주세요."); } finally { e.target.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  // 🧹 2026-11-12 [담당자 정리] — 등록된 상하차지 전체를 살펴 고칠 곳만 한 번에 고친다(규칙: src/contactCell.js cleanPlaceContacts)
  const cleanPlaceContactsAll = async () => {
    const jobs = (placeRows || []).filter((p) => p.id).map((p) => ({ p, r: cleanPlaceContacts(p) })).filter((x) => x.r.changed);
    if (!jobs.length) { showAlert("정리할 곳이 없습니다.\n담당자번호는 번호만, 담당자는 이름만 들어 있습니다."); return; }
    const sample = jobs.slice(0, 6).map(({ p, r }) => `· ${p.업체명}: ${r.before.replace(/^\|\s*/, "").slice(0, 34) || "(빈칸)"} → ${r.after.replace(/^\|\s*/, "") || "(비움)"}`).join("\n");
    if (!await kpConfirm(`상하차지 ${jobs.length}곳의 담당자 · 담당자번호를 정리할까요?\n\n· 담당자번호 = 번호만(하이픈 넣기)\n· 담당자 = 이름만(님 · 직함 떼기)\n· 이름 · 번호가 아닌 글은 메모로 옮김\n\n${sample}${jobs.length > 6 ? `\n… 외 ${jobs.length - 6}곳` : ""}`)) return;
    const up = await runUpload({ items: jobs, label: "담당자 정리", each: ({ p, r }) => upsertPlace?.({ _id: p.id, 업체명: p.업체명, 주소: p.주소, contacts: r.contacts, 메모: r.메모 }) });
    showAlert(`${up.ok}곳을 정리했습니다.${up.fail ? `\n실패 ${up.fail}곳` : ""}`);
  };

  const downloadPlaceExcel = async () => {
    const XLSX = await loadXLSX(); // ⚡ 엑셀 라이브러리는 누를 때 받는다
    const data = filteredPlaces.length > 0 ? filteredPlaces : placeRows;
    if (!data.length) return showAlert("다운로드할 데이터가 없습니다.");
    const ws = XLSX.utils.json_to_sheet(data.map(r => ({
      업체명: r.업체명||"", 주소: r.주소||"", 담당자: r.담당자||"",
      담당자번호: r.담당자번호||"", 등급: r.등급||"일반", 메모: r.메모||"",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "상하차지목록");
    XLSX.writeFile(wb, "상하차지_목록.xlsx");
  };

  // ═══════════════════════════════════════════════════
  // ★ 렌더링
  // ═══════════════════════════════════════════════════
  return (
    <div className="p-4">
      {clientBulkChooser}

      {/* 탭 */}
      {!hideTabs && (
        <div className="flex gap-2 mb-4">
          {[
            { key: "하차지", label: "상하차지 거래처", count: gradeStats.전체 },
            { key: "기본", label: "기본 거래처", count: rows.length },
          ].map(({ key, label, count }) => (
            <button key={key} onClick={() => setSubTab(key)}
              className={`px-5 py-2 text-[13px] font-bold rounded-lg transition relative border ${
                subTab === key
                  ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                  : "bg-white text-[#1B2B4B] border-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white"
              }`}>
              {label}
              <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full font-bold ${subTab === key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ══════ 하차지 거래처 탭 ══════ */}
      {subTab === "하차지" && (
        <div className="space-y-3">

          {duplicatePlaceGroups.length > 0 && (
            <div className="flex items-center gap-2 bg-[#1B2B4B]/5 border border-[#1B2B4B]/20 rounded-lg px-4 py-2 text-sm text-[#1B2B4B]">
              주소 기준 중복 상하차지 <b>{duplicatePlaceGroups.length}건</b> 발견됨
              <button onClick={() => setShowDupPreview(true)}
                className="ml-2 px-3 py-1 bg-[#1B2B4B] text-white rounded text-xs font-semibold hover:bg-[#243a60] transition"><EditableText id="misc.btn.54416.미리보기" defaultText="미리보기" /></button>
            </div>
          )}

          {/* 등급별 통계 카드 */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { key: "전체", label: "전체" },
              { key: "일반", label: "일반" },
              { key: "블랙", label: "블랙" },
              { key: "주의", label: "주의" },
              { key: "이탈", label: "이탈" },
            ].map(({ key, label }) => (
              <KpStatTile key={key} on={placeGradeFilter === key} en={KP_GRADE_EN[key]} label={label} value={gradeStats[key] || 0} onClick={() => setPlaceGradeFilter(key)} />
            ))}
          </div>

          {/* 검색 + 버튼 바 */}
          <div className="flex flex-wrap items-center gap-2">
            <KpSearchBar mobile={mobile} options={["업체명", "주소"]} field={placeFilterType} onField={setPlaceFilterType}
              value={placeQ} onChange={(v) => { setPlaceQ(v); setPlaceSearched(false); }} onSearch={() => setPlaceSearched(true)}
              placeholder={mobile ? "업체명·주소" : "상하차지 업체명 · 주소로 찾기 (Enter)"} />
            {(placeSearched || placeGradeFilter !== "전체") && (
              <span className="text-[13px] font-bold text-[#5B6B85] px-1 whitespace-nowrap">검색결과 <b className="text-[#0F1A30] tabular-nums">{filteredPlaces.length}</b>건</span>
            )}
            {placeSelInView > 0 && (
              <span className="text-[13px] font-bold text-[#5B6B85] px-1 whitespace-nowrap">선택 <b className="text-[#2D4C82] tabular-nums">{placeSelInView.toLocaleString()}</b>건</span>
            )}
            <div className={`ml-auto flex items-center ${mobile ? "gap-1.5" : "gap-2"}`}>
              {/* 🧰 2026-11-23 툴바 정리 — 업로드 · 다운로드 → [엑셀 관리] · 신규등록 · 담당자 정리 · 거래처정리 → [등록·정리] */}
              <ToolMenuButton label="엑셀 관리" testId="place-excel-menu" menuTitle="엑셀로 가져오기 · 내보내기" minWidth={250} items={[
                { key: "bulk", label: "대용량 업로드", desc: "엑셀로 상하차지를 한꺼번에 등록해요(양식 받기 포함)", hidden: mobile, onClick: () => setClientBulkKind("place") },
                { key: "down", label: "엑셀 다운로드", desc: "상하차지 목록을 엑셀로 받아요", hidden: mobile, onClick: downloadPlaceExcel },
              ]} />
              <ToolMenuButton label="등록·정리" testId="place-reg-menu" minWidth={260} className={KP_BTN_PRIMARY} style={KP_BTN_PRIMARY_BG} items={[
                { key: "add", label: "신규 등록", desc: "상하차지를 한 곳 새로 등록해요", onClick: () => setShowNewPlaceForm(true) },
                { key: "contact", label: "담당자 정리", desc: "담당자번호는 번호만, 담당자는 이름만 남기고 나머지는 메모로 옮겨요", hidden: mobile || !isJyCompany(userCompany), onClick: cleanPlaceContactsAll },
                { key: "dup", label: "거래처 정리", desc: "이름 · 주소가 겹친 상하차지를 찾아 정리해요", onClick: () => { setPlaceDupOpen(true); setPlaceDupDone(false); setPlaceDupSelected(new Set()); } },
              ]} />
              <button onClick={removeSelectedPlaces}
                className={KP_BTN_DANGER}>
                <EditableText id="client.dropPlace.toolbar.선택삭제" defaultText="선택삭제" /> {placeSelected.size > 0 && `(${placeSelected.size})`}
              </button>
            </div>
          </div>

          {/* 신규 등록 팝업 */}
          {showNewPlaceForm && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-2xl w-[600px] overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
                  <h3 className="text-white font-bold text-[15px]"><EditableText id="client.newPlaceForm.title" defaultText="신규 상하차지 등록" /></h3>
                  <button onClick={() => setShowNewPlaceForm(false)} className="text-white/60 hover:text-white text-xl leading-none">✕</button>
                </div>
                <div className="px-6 py-5 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 font-semibold mb-1"><EditableText id="client.newPlaceForm.label.업체명" defaultText="업체명 *" /></div>
                    <input autoComplete="off" className="border border-gray-300 px-2 py-1.5 rounded-lg text-sm w-full focus:border-[#1B2B4B] outline-none"
                      value={placeNewForm.업체명} onChange={(e) => setPlaceNewForm((p) => ({ ...p, 업체명: e.target.value }))} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-semibold mb-1"><EditableText id="client.newPlaceForm.label.등급" defaultText="등급" /></div>
                    <CustomSelect className="border border-gray-300 px-2 py-1.5 rounded-lg text-sm w-full focus:border-[#1B2B4B] outline-none"
                      value={placeNewForm.등급} onChange={(e) => setPlaceNewForm((p) => ({ ...p, 등급: e.target.value }))}>
                      <option value="일반">일반</option>
                      <option value="블랙">블랙</option>
                      <option value="주의">주의</option>
                      <option value="이탈">이탈</option>
                    </CustomSelect>
                  </div>
                  {cmBiz.multi && (
                    <div className="col-span-2">
                      <BizPicker biz={cmBiz} value={placeNewForm.기본사업자 || ""} onChange={(v) => setPlaceNewForm(p => ({ ...p, 기본사업자: v }))} label="기본 청구 사업자" />{/* ⭐ 2026-11-09 버그수정 — 신규 등록 창이 수정 창 값(editClientModal, 이때는 비어 있음)을 읽어 청구사업자가 여러 개인 회사에서 화면 오류가 났다 */}
                      <div className="text-[11px] text-gray-500 mt-1">이 거래처로 오더를 등록하면 청구 사업자가 자동으로 이걸로 맞춰집니다(등록 화면에서 바꿀 수 있음).</div>
                    </div>
                  )}
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 font-semibold mb-1"><EditableText id="client.newPlaceForm.label.주소" defaultText="주소 *" /></div>
                    <input autoComplete="off" className="border border-gray-300 px-2 py-1.5 rounded-lg text-sm w-full focus:border-[#1B2B4B] outline-none"
                      value={placeNewForm.주소} onChange={(e) => setPlaceNewForm((p) => ({ ...p, 주소: e.target.value }))} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-semibold mb-1"><EditableText id="client.newPlaceForm.label.담당자" defaultText="담당자" /></div>
                    <input autoComplete="off" className="border border-gray-300 px-2 py-1.5 rounded-lg text-sm w-full focus:border-[#1B2B4B] outline-none"
                      value={placeNewForm.담당자} onChange={(e) => setPlaceNewForm((p) => ({ ...p, 담당자: e.target.value }))} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-semibold mb-1"><EditableText id="client.newPlaceForm.label.담당자번호" defaultText="담당자번호" /></div>
                    <input autoComplete="off" className="border border-gray-300 px-2 py-1.5 rounded-lg text-sm w-full focus:border-[#1B2B4B] outline-none"
                      value={placeNewForm.담당자번호} onChange={(e) => setPlaceNewForm((p) => ({ ...p, 담당자번호: formatPhone(e.target.value) }))} />
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-gray-500 font-semibold mb-1"><EditableText id="client.newPlaceForm.label.메모" defaultText="메모" /></div>
                    <input autoComplete="off" className="border border-gray-300 px-2 py-1.5 rounded-lg text-sm w-full focus:border-[#1B2B4B] outline-none"
                      value={placeNewForm.메모} onChange={(e) => setPlaceNewForm((p) => ({ ...p, 메모: e.target.value }))} />
                  </div>
                </div>
                <div className="px-6 pb-5 flex gap-3">
                  <button onClick={() => setShowNewPlaceForm(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="client.newPlaceForm.취소" defaultText="취소" /></button>
                  <button onClick={addNewPlace} className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="client.newPlaceForm.등록" defaultText="등록" /></button>
                </div>
              </div>
            </div>
          )}

          {/* 안내 / 빈 결과 */}
          {filteredPlaces.length === 0 && (
            <div className="bg-white rounded-xl border text-center py-14 text-gray-500 text-sm">검색 결과가 없습니다</div>
          )}

          {/* ⭐ 2026-11-06 모바일 — 카드 목록(누르면 상세 시트) */}
          {mobile && filteredPlaces.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 px-1 text-[14px] font-bold text-[#3A4A66]"><KpCheckbox onChange={togglePlaceAll} checked={placeAllChecked} indeterminate={placeSelInView > 0} />전체 선택 · {filteredPlaces.length.toLocaleString()}건</label>
              {sortedPlaces.slice(0, placeShowN).map((r, i) => {
                const id = r.id || r.업체명 || `${i}`;
                const grade = r.등급 || "일반";
                return (
                  <div key={id} role="button" tabIndex={0} onClick={() => setMSheet({ kind: "place", r })}
                    className={`rounded-[16px] border px-3.5 py-3 ${placeSelected.has(id) ? "bg-[#EAF1FF] border-[#2D4C82]" : grade === "블랙" ? "bg-gray-100 border-gray-300" : grade === "주의" ? "bg-orange-50/60 border-[#E3E8F0]" : grade === "이탈" ? "bg-red-50/40 border-[#E3E8F0]" : "bg-white border-[#E3E8F0]"}`}>
                    <div className="flex items-start gap-2.5">
                      <span className="pt-0.5" onClick={(e) => e.stopPropagation()}><KpCheckbox checked={placeSelected.has(id)} onChange={() => togglePlaceOne(id)} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap"><span className="text-[15px] font-black text-[#0F1A30] break-words">{r.업체명 || "-"}</span>{grade !== "일반" && <span className={`px-2 py-0.5 rounded text-[14px] font-bold ${등급색상(grade)}`}>{grade}</span>}</div>
                        <div className="mt-0.5 text-[14px] text-[#3A4A66] break-words">{r.주소 || "주소 없음"}</div>
                        {(r.담당자 || r.담당자번호) && <div className="mt-0.5 text-[14px] text-[#5B6B85] break-words">{[r.담당자, r.담당자번호].filter(Boolean).join(" · ")}{r._allContacts && r._allContacts.length > 1 ? ` 외 ${r._allContacts.length - 1}명` : ""}</div>}
                        {(r.메모 || r.오더메모) && <div className="mt-0.5 text-[14px] text-[#5B6B85] break-words">{[r.메모 && `메모 ${r.메모}`, r.오더메모 && `오더메모 ${r.오더메모}`].filter(Boolean).join(" · ")}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredPlaces.length > placeShowN && (
                <button type="button" onClick={() => setPlaceShowN((n) => n + 300)} className="w-full h-11 rounded-[14px] bg-white border border-[#E3E8F0] text-[14px] font-black text-[#1B2B4B]">더 보기 ({placeShowN.toLocaleString()} / {filteredPlaces.length.toLocaleString()}건)</button>
              )}
            </div>
          )}
          {/* 테이블 */}
          {!mobile && filteredPlaces.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[900px] text-sm border-collapse w-full">
                  <thead>
                    <tr className="bg-[#1B2B4B]">
                      <th className="px-3 py-3 text-white font-bold text-center w-10">
                        <KpCheckbox onChange={togglePlaceAll} checked={placeAllChecked} indeterminate={placeSelInView > 0}
                          title={placeAllChecked ? "전체 해제" : `검색결과 ${filteredPlaceIds.length.toLocaleString()}건 전체 선택`} />
                      </th>
                      {/* ⭐ 순번 → 담당자(담당자번호) 순서로 앞에 */}
                      {["순번","담당자","담당자번호","업체명","주소","등급","일반메모","오더메모","안내사항","삭제"].map((h) => (
                        <SortTh key={h} k={h === "삭제" ? "" : h} sort={placeSort.sort} onSort={placeSort.toggle} className="px-3 py-3 text-white font-bold text-center whitespace-nowrap"><EditableText id={`client.table.header.${h}`} defaultText={h} /></SortTh>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlaces.slice(0, placeShowN).map((r, i) => {
                      const id = r.id || r.업체명 || `${i}`;
                      const grade = r.등급 || "일반";
                      return (
                        <tr key={id}
                          onDoubleClick={() => setEditPlaceModal({
                            ...r,
                            contacts: Array.isArray(r._rawContacts) && r._rawContacts.length
                              ? r._rawContacts
                              : (r.담당자 ? [{ name: r.담당자, phone: r.담당자번호 || "", isPrimary: true }] : []),
                            기사전달주의사항: (r.기사전달주의사항 || "").trim() ? r.기사전달주의사항 : defaultDriverNoticeTemplate(r.업체명),
                          })}
                          className={`hover:bg-blue-50/60 transition border-b border-gray-100 cursor-pointer ${
                            placeSelected.has(id) ? "bg-[#EAF1FF] hover:bg-[#E1EBFD]" : grade === "블랙" ? "bg-gray-100" : grade === "주의" ? "bg-orange-50/60" : grade === "이탈" ? "bg-red-50/40" : i%2 ? "bg-gray-50/50" : "bg-white"
                          }`}>
                          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()} style={placeSelected.has(id) ? { boxShadow: "inset 3px 0 0 #2D4C82" } : undefined}>
                            <KpCheckbox checked={placeSelected.has(id)} onChange={() => togglePlaceOne(id)} />
                          </td>
                          <td className="px-2 py-2.5 text-[13px] text-gray-500 text-center tabular-nums">{i + 1}</td>
                          <td className="px-2 py-2.5 text-[13px] text-gray-700 text-center whitespace-nowrap">
                            {r.담당자||""}
                            {r._allContacts && r._allContacts.length > 1 && (
                              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#1B2B4B] text-white">+{r._allContacts.length - 1}명</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-[13px] text-gray-700 text-center whitespace-nowrap">{r.담당자번호||""}</td>
                          <td className="px-2 py-2.5 text-[13px] font-semibold text-gray-800 max-w-[190px] truncate text-center">{r.업체명||""}</td>
                          <td className="px-2 py-2.5 text-[13px] text-gray-600 max-w-[250px] truncate text-center">{r.주소||""}</td>
                          <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}
                            onDoubleClick={e => { e.stopPropagation(); if (grade === "일반") return; showAlert(r.등급변경일 ? `${grade} 등급 지정일: ${r.등급변경일}` : `${grade} 등급으로 지정되어 있으나 지정일 기록이 없습니다.`); }}
                            title={grade !== "일반" ? "더블클릭하면 지정일을 볼 수 있습니다" : undefined}>
                            <div className="flex items-center justify-center">
                              <CustomSelect
                                className={`px-2 py-1 rounded text-xs font-bold cursor-pointer w-[68px] ${등급색상(grade)}`}
                                value={grade}
                                onChange={(e) => handlePlaceBlur(r,"등급",e.target.value)}>
                                <option value="일반">일반</option>
                                <option value="블랙">블랙</option>
                                <option value="주의">주의</option>
                                <option value="이탈">이탈</option>
                              </CustomSelect>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-[13px] text-gray-600 max-w-[160px] truncate text-center">{r.메모||""}</td>
                          <td className="px-2 py-2.5 text-[13px] text-gray-600 max-w-[160px] truncate text-center">{r.오더메모||""}</td>
                          <td className="px-2 py-2.5 text-center max-w-[160px]">
                            <span className="text-[13px] font-bold text-black">{_hasRealDriverNotice(r.기사전달주의사항) ? "등록" : "미등록"}</span>
                          </td>
                          <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <button onClick={async () => {
                              if (!(await kpConfirm("삭제하시겠습니까?"))) return;
                              await runDelete({ label: "하차지", task: async () => { await mergePlaceContactsIntoClient(r); await removePlace(id); } }); // ⭐ 2026-11-05 진행 창
                            }}
                              className="px-2.5 py-1 bg-red-500 text-white rounded text-xs font-semibold hover:bg-red-600 transition"><EditableText id="misc.btn.54619.삭제" defaultText="삭제" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredPlaces.length > placeShowN && (
                <button type="button" onClick={() => setPlaceShowN((n) => n + 300)} className="w-full h-11 border-t border-[#EEF1F6] text-[13px] font-black text-[#1B2B4B] hover:bg-[#F5F8FD]">
                  더 보기 ({placeShowN.toLocaleString()} / {filteredPlaces.length.toLocaleString()}건)
                </button>
              )}
            </div>
          )}

          {placeDupOpen && (
  <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-2xl shadow-2xl w-[820px] max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
        <h3 className="text-white font-bold text-[15px]"><EditableText id="client.dupPopup.title" defaultText="상하차지거래처 중복정리" /></h3>
        <button onClick={() => setPlaceDupOpen(false)} className="text-white/60 hover:text-white text-xl">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {/* 동일 업체명+주소 담당자 병합 섹션 */}
        {placeAddrDupGroups.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] font-bold text-[#1B2B4B]">같은 업체명+주소, 다른 담당자 ({placeAddrDupGroups.length}건)</span>
              <button onClick={async () => {
                if (!await kpConfirm(`${placeAddrDupGroups.length}건의 중복 거래처를 병합하시겠습니까?\n담당자 정보가 1개의 거래처로 합쳐집니다.`)) return;
                // ⭐ 2026-11-05 병합(대표 저장)을 먼저 모두 끝내고, 중복 삭제는 한 번에(진행 창) — 목록도 한 번에 갱신
                const _allDup = placeAddrDupGroups.flatMap(g => g.slice(1).map(d => d.id)).filter(Boolean);
                const _primPatch = new Map();
                await runDelete({ count: _allDup.length, label: "중복 하차지", task: async () => {
                  for (const group of placeAddrDupGroups) {
                    const primary = group[0];
                    const allContacts = group.map(g => ({ name: g.담당자 || "", phone: g.담당자번호 || "", isPrimary: false })).filter(c => c.name);
                    if (allContacts.length > 0) allContacts[0].isPrimary = true;
                    await upsertPlace?.({ ...primary, _id: primary.id, contacts: allContacts });
                    _primPatch.set(primary.id, { 담당자: allContacts.map(c => c.name).join(" / "), 담당자번호: allContacts.map(c => c.phone).join(" / ") });
                  }
                  await removePlace(_allDup);
                } });
                const _dupIds = new Set(_allDup);
                setPlaceRows(prev => prev.filter(p => !_dupIds.has(p.id)).map(p => _primPatch.has(p.id) ? { ...p, ..._primPatch.get(p.id) } : p));
                setPlaceDupDone(true);
              }} className="h-[32px] px-4 rounded-lg text-[13px] font-semibold bg-[#1B2B4B] text-white hover:bg-[#243a60] transition">
                <EditableText id="client.dupPopup.전체자동병합" defaultText="전체 자동 병합" />
              </button>
            </div>
            <div className="space-y-3">
              {placeAddrDupGroups.map((group, gi) => (
                <div key={gi} className="border border-[#1B2B4B]/20 rounded-xl overflow-hidden">
                  <div className="bg-[#1B2B4B]/5 px-4 py-2 flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#1B2B4B]">{group[0].업체명} <span className="text-gray-500 font-normal text-[12px]">· {group[0].주소}</span></span>
                    <button onClick={async () => {
                      const primary = group[0];
                      const duplicates = group.slice(1);
                      if (!(await kpConfirm(`'${primary.업체명}' 중복 ${duplicates.length}건을 이 항목으로 병합하시겠습니까?\n담당자 정보는 합쳐지고, 나머지 ${duplicates.length}건은 삭제됩니다.`))) return;
                      const allContacts = group.map(g => ({ name: g.담당자 || "", phone: g.담당자번호 || "", isPrimary: false })).filter(c => c.name);
                      if (allContacts.length > 0) allContacts[0].isPrimary = true;
                      await upsertPlace?.({ ...primary, _id: primary.id, contacts: allContacts });
                      await removePlace(duplicates.map(d => d.id)); // ⭐ 2026-11-05 한 번에 삭제 + 진행 창
                      const dupIds = new Set(duplicates.map(d => d.id));
                      setPlaceRows(prev => prev.filter(p => !dupIds.has(p.id)).map(p => p.id === primary.id ? { ...p, 담당자: allContacts.map(c => c.name).join(" / "), 담당자번호: allContacts.map(c => c.phone).join(" / ") } : p));
                    }} className="h-[26px] px-3 rounded-lg text-[12px] font-semibold border border-[#1B2B4B] text-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white transition">
                      <EditableText id="client.dupPopup.병합" defaultText="병합" />
                    </button>
                  </div>
                  <table className="w-full text-[12px]">
                    <tbody>
                      {group.map((p, pi) => (
                        <tr key={p.id} className={`border-b border-gray-100 ${pi === 0 ? "bg-blue-50/30" : ""}`}>
                          <td className="px-3 py-2 text-center w-12">
                            {pi === 0 ? <span className="text-[10px] font-bold text-[#1B2B4B] bg-[#1B2B4B]/10 px-1.5 py-0.5 rounded">대표</span>
                              : <span className="text-[10px] text-gray-500">병합</span>}
                          </td>
                          <td className="px-3 py-2 font-semibold">{p.업체명}</td>
                          <td className="px-3 py-2 text-gray-500">{p.주소 || "-"}</td>
                          <td className="px-3 py-2">{p.담당자 || "-"}</td>
                          <td className="px-3 py-2">{p.담당자번호 || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        )}
        {placeDupGroups.length === 0 && placeAddrDupGroups.length === 0 ? (
          <div className="text-center text-gray-500 py-12 text-[14px]">
            {placeDupDone ? "중복 거래처가 정리되었습니다." : "중복된 거래처가 없습니다."}
          </div>
        ) : placeDupGroups.length > 0 ? (
          <div className="space-y-4">
            {placeDupGroups.length > 0 && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-bold text-[#1B2B4B]">업체명 기준 중복 {placeDupGroups.length}건</span>
                <button
                  onClick={async () => {
                    if (!await kpConfirm("체크된 항목을 모두 삭제하시겠습니까?")) return;
                    await removePlace([...placeDupSelected]); // ⭐ 2026-11-05 한 번에 삭제 + 진행 창
                    setPlaceRows(prev => prev.filter(p => !placeDupSelected.has(p.id)));
                    setPlaceDupSelected(new Set());
                    setPlaceDupDone(true);
                  }}
                  disabled={placeDupSelected.size === 0}
                  className="h-[32px] px-4 rounded-lg text-[13px] font-semibold border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
                  <EditableText id="client.dupPopup.선택삭제" defaultText="선택 삭제" /> {placeDupSelected.size > 0 && `(${placeDupSelected.size})`}
                </button>
              </div>
            )}
            {placeDupGroups.map((group, gi) => {
              const sorted = [...group].sort((a, b) => {
                const ta = a.updatedAt?.seconds || 0;
                const tb = b.updatedAt?.seconds || 0;
                return tb - ta;
              });
              const repr = sorted[0];
              return (
                <div key={gi} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-[#1B2B4B]/5 px-4 py-2 flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#1B2B4B]">{repr.업체명} <span className="text-gray-500 font-normal">({group.length}건)</span></span>
                    <button
                      onClick={async () => {
                        const toDelete = sorted.slice(1);
                        if (!await kpConfirm(`"${repr.업체명}" 최신 1건 제외 ${toDelete.length}건을 삭제하시겠습니까?`)) return;
                        await removePlace(toDelete.map(p => p.id)); // ⭐ 2026-11-05 한 번에 삭제 + 진행 창
                        const delIds = new Set(toDelete.map(p => p.id));
                        setPlaceRows(prev => prev.filter(p => !delIds.has(p.id)));
                        setPlaceDupSelected(prev => { const n = new Set(prev); toDelete.forEach(p => n.delete(p.id)); return n; });
                      }}
                      className="h-[28px] px-3 rounded-lg text-[12px] font-semibold border border-[#1B2B4B] text-[#1B2B4B] hover:bg-[#1B2B4B] hover:text-white transition">
                      이 그룹 정리
                    </button>
                  </div>
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="px-3 py-2 text-center w-8"></th>
                        <th className="px-3 py-2 text-center"><EditableText id="client.dupPopup.byNameTable.header.구분" defaultText="구분" /></th>
                        <th className="px-3 py-2 text-center"><EditableText id="client.dupPopup.byNameTable.header.업체명" defaultText="업체명" /></th>
                        <th className="px-3 py-2 text-center"><EditableText id="client.dupPopup.byNameTable.header.주소" defaultText="주소" /></th>
                        <th className="px-3 py-2 text-center"><EditableText id="client.dupPopup.byNameTable.header.담당자" defaultText="담당자" /></th>
                        <th className="px-3 py-2 text-center"><EditableText id="client.dupPopup.byNameTable.header.연락처" defaultText="연락처" /></th>
                        <th className="px-3 py-2 text-center"><EditableText id="client.dupPopup.byNameTable.header.등급" defaultText="등급" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p, pi) => (
                        <tr key={p.id} className={`border-b border-gray-100 ${pi === 0 ? "bg-blue-50/40" : ""}`}>
                          <td className="px-3 py-2 text-center">
                            {pi > 0 && (
                              <input autoComplete="off" type="checkbox" checked={placeDupSelected.has(p.id)}
                                onChange={() => setPlaceDupSelected(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} />
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {pi === 0 ? <span className="text-[11px] font-bold text-[#1B2B4B] bg-[#1B2B4B]/10 px-2 py-0.5 rounded">대표</span>
                              : <span className="text-[11px] text-gray-500">중복</span>}
                          </td>
                          <td className="px-3 py-2 text-center font-semibold">{p.업체명}</td>
                          <td className="px-3 py-2 text-center text-gray-500">{p.주소 || "-"}</td>
                          <td className="px-3 py-2 text-center">{p.담당자 || "-"}</td>
                          <td className="px-3 py-2 text-center">{p.담당자번호 || "-"}</td>
                          <td className="px-3 py-2 text-center">{p.등급 || "일반"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="px-6 py-4 border-t border-gray-100 shrink-0">
        <button onClick={() => setPlaceDupOpen(false)}
          className="w-full py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="misc.btn.54796.닫기" defaultText="닫기" /></button>
      </div>
    </div>
  </div>
)}

          {/* 중복 미리보기 팝업 */}
          {showDupPreview && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-2xl w-[860px] max-h-[80vh] overflow-hidden flex flex-col">
                <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
                  <h3 className="font-bold text-white text-[15px]">중복 미리보기 ({duplicatePlaceGroups.length}건)</h3>
                  <button onClick={() => setShowDupPreview(false)} className="text-white/60 hover:text-white text-xl">×</button>
                </div>
                <div className="p-4 overflow-y-auto flex-1 text-sm space-y-3">
                  {duplicatePlaceGroups.map((group, gi) => (
                    <div key={gi} className="border rounded-xl overflow-hidden">
                      <div className="bg-[#1B2B4B]/10 px-4 py-2 font-bold text-[#1B2B4B] border-b text-sm">{group[0].업체명}</div>
                      <table className="w-full text-sm">
                        <tbody>
                          {group.map((p, i) => (
                            <tr key={p.id} className={i === 0 ? "bg-gray-50 text-gray-700" : "bg-white text-gray-600"}>
                              <td className="border px-3 py-2 w-16 text-center font-bold text-xs">
                                <input autoComplete="off" type="checkbox" checked={dupSelected.has(p.id)}
                                  onChange={() => setDupSelected((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} />
                              </td>
                              <td className="border px-3 py-2">{p.주소}</td>
                              <td className="border px-3 py-2 w-24">{p.담당자}</td>
                              <td className="border px-3 py-2 w-32">{p.담당자번호}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50">
                  <button onClick={() => setShowDupPreview(false)}
                    className="px-4 py-2 border rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition"><EditableText id="misc.btn.54834.취소" defaultText="취소" /></button>
                  <button onClick={async () => { await removeDuplicatePlaces(); setShowDupPreview(false); }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition">
                    선택 삭제 ({dupSelected.size}건)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ 기본 거래처 탭 ══════ */}
      {subTab === "기본" && (
        <div className="space-y-3">

          {/* 툴바 */}
          <div className="flex flex-wrap items-center gap-2">
            <KpSearchBar mobile={mobile} value={q} onChange={setQ} onSearch={() => {}} placeholder={mobile ? "거래처명·사업자번호·담당자" : "거래처명 · 사업자번호 · 담당자로 바로 찾기"} />
            <span className="text-[13px] font-bold text-[#5B6B85] px-1 whitespace-nowrap"><b className="text-[#0F1A30] tabular-nums">{filtered.length}</b>건{clientSelInView > 0 && <> · 선택 <b className="text-[#2D4C82] tabular-nums">{clientSelInView}</b>건</>}</span>
            {mobile && (
              <div className="ml-auto flex items-center gap-1.5">
                <button onClick={() => setShowNewClientModal(true)} className={KP_BTN_PRIMARY} style={KP_BTN_PRIMARY_BG}>+ 신규등록</button>
                <button onClick={removeSelectedFn} className={KP_BTN_DANGER}>선택삭제{selected.size > 0 && ` (${selected.size})`}</button>
              </div>
            )}
            {!mobile && <button
              onClick={() => { setShowAllClients(v => !v); setQ(""); }}
              className={showAllClients ? "h-11 px-4 rounded-[13px] bg-[#0F1A30] text-white text-[13px] font-bold whitespace-nowrap" : KP_BTN}>
              {showAllClients ? <EditableText id="client.baseClient.toolbar.전체보기닫기" defaultText="전체보기 닫기" /> : <EditableText id="client.baseClient.toolbar.전체보기" defaultText="전체보기" />}
            </button>}
            {!mobile && <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* 🧰 2026-11-23 툴바 정리 — 업로드 · 다운로드 → [엑셀 관리] · 신규등록 · 상하차지에서 불러오기 · 거래처 합치기 · 사업자 상태 확인 → [등록·정리] */}
              <ToolMenuButton label="엑셀 관리" testId="client-excel-menu" menuTitle="엑셀로 가져오기 · 내보내기" minWidth={250} items={[
                { key: "bulk", label: "대용량 업로드", desc: "엑셀로 거래처를 한꺼번에 등록해요(양식 받기 포함)", onClick: () => setClientBulkKind("client") },
                { key: "down", label: "엑셀 다운로드", desc: "거래처 목록을 엑셀로 받아요", onClick: downloadClientExcel },
              ]} />
              {mismatchCandidates.length > 0 && (
                <button onClick={() => { setMismatchSelected(new Set(mismatchCandidates.map(m => m.client.id || m.client.거래처명))); setShowMismatchPopup(true); }}
                  className={KP_BTN_DANGER}>
                  <EditableText id="client.baseClient.toolbar.담당자불일치복구" defaultText="담당자 불일치 복구" /> ({mismatchCandidates.length})
                </button>
              )}
              <ClientBizBulkButton clients={rows} open={bizBulkOpen} onClose={() => setBizBulkOpen(false)} />
              <button onClick={removeSelectedFn}
                className={KP_BTN_DANGER}>
                <EditableText id="client.baseClient.toolbar.선택삭제" defaultText="선택삭제" /> {selected.size > 0 && `(${selected.size})`}
              </button>
              <button
                onClick={() => {
                  if (selected.size === 0) return showAlert("수정할 거래처를 선택하세요.");
                  if (selected.size > 1) return showAlert("한 번에 1건만 수정할 수 있습니다.");
                  const id = [...selected][0];
                  const row = rows.find(r => (r.id || r.거래처명) === id);
                  if (row) setEditClientModal({ ...row, 기사전달주의사항: (row.기사전달주의사항 || "").trim() ? row.기사전달주의사항 : defaultDriverNoticeTemplate(row.거래처명) });
                }}
                className={KP_BTN}>
                <EditableText id="client.baseClient.toolbar.선택수정" defaultText="선택수정" /> {selected.size === 1 && "(1)"}
              </button>
              <ToolMenuButton label="등록·정리" testId="client-reg-menu" minWidth={270} className={KP_BTN_PRIMARY} style={KP_BTN_PRIMARY_BG} items={[
                { key: "add", label: "신규 등록", desc: "거래처를 한 곳 새로 등록해요", onClick: () => setShowNewClientModal(true) },
                { key: "import", label: "상하차지에서 불러오기", desc: "상하차지에 있는 업체를 골라 기본거래처로 옮겨요", onClick: () => { setShowImportPopup(true); setImportQ(""); setImportSelected([]); } },
                { key: "merge", label: `거래처 합치기${selected.size > 1 ? ` (${selected.size})` : ""}`, desc: "같은 회사가 이름 둘로 등록됐을 때 체크한 거래처를 하나로 합쳐요", hidden: !canMerge, onClick: () => { if (!selected.size) return showAlert("합칠 거래처를 체크해 주세요.\n(같은 회사인 거래처 2곳 이상)"); setMergeOpen(true); } },
                { key: "biz", label: "사업자 상태 확인", desc: "국세청에서 휴업 · 폐업인지 한 번에 확인해요", onClick: () => setBizBulkOpen(true) },
              ]} />
            </div>}
          </div>

          {/* ⭐ 2026-11-17 거래처 합치기 창 */}
          {mergeOpen && canMerge && (
            <ClientMergeModal clients={rows} initialIds={[...selected]} userCompany={userCompany}
              onClose={() => setMergeOpen(false)}
              onDone={(r) => { const gone = new Set(r.sources); setRows(prev => prev.filter(x => !gone.has(String(x.거래처명 || "").trim()))); setSelected(new Set()); }} />
          )}

          {/* 신규등록 팝업 */}
          {showNewClientModal && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-2xl w-[600px] overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
                  <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.신규 기본 거래처 등록" defaultText="신규 기본 거래처 등록" /></h3>
                  <button onClick={() => setShowNewClientModal(false)} className="text-white/60 hover:text-white text-xl">✕</button>
                </div>
                <div className="px-6 py-5 grid grid-cols-2 gap-4">
                  {[["거래처명 *","거래처명"],["사업자번호","사업자번호"],["대표자","대표자"],["업태","업태"],["종목","종목"],["담당자","담당자"],["연락처","연락처"],["이메일","이메일"]].map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-[12px] font-semibold text-gray-500 mb-1">{label}</label>
                      <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                        value={newForm[key]||""}
                        onChange={(e) => setNewForm(p => ({ ...p, [key]: e.target.value }))} />
                      {key === "사업자번호" && <div className="mt-1.5"><BizCheck value={newForm.사업자번호} size="sm" /></div>}
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">주소</label>
                    <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                      value={newForm.주소||""}
                      onChange={(e) => setNewForm(p => ({ ...p, 주소: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1">등급</label>
                    <CustomSelect className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none bg-white"
                      value={newForm.등급||"일반"}
                      onChange={(e) => setNewForm(p => ({ ...p, 등급: e.target.value }))}>
                      <option value="일반">일반</option>
                      <option value="블랙">블랙</option>
                      <option value="주의">주의</option>
                      <option value="이탈">이탈</option>
                    </CustomSelect>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id="clientEdit.label.일반메모" defaultText="일반메모" /></label>
                    <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                      value={newForm.메모||""}
                      onChange={(e) => setNewForm(p => ({ ...p, 메모: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id="clientEdit.label.오더메모" defaultText="오더메모" /></label>
                    <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                      placeholder="이 거래처명을 입력할 때마다 안내 팝업으로 뜰 메모"
                      value={newForm.오더메모||""}
                      onChange={(e) => setNewForm(p => ({ ...p, 오더메모: e.target.value }))} />
                  </div>
                </div>
                <div className="px-6 pb-5 flex gap-3">
                  <button onClick={() => setShowNewClientModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="misc.btn.54953.취소" defaultText="취소" /></button>
                  <button onClick={addNew}
                    className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="misc.btn.54955.등록" defaultText="등록" /></button>
                </div>
              </div>
            </div>
          )}

          {/* 수정 팝업 */}
          {editClientModal && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-2xl w-[700px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                  <h3 className="text-white font-bold text-[15px]"><EditableText id="clientEdit.title" defaultText="거래처 수정" /> · {editClientModal.거래처명}</h3>
                  <button onClick={() => setEditClientModal(null)} className="text-white/60 hover:text-white text-xl">✕</button>
                </div>
                <div className="px-6 py-5 grid grid-cols-2 gap-4">
                  {[["거래처명 *","거래처명"],["사업자번호","사업자번호"],["대표자","대표자"],["업태","업태"],["종목","종목"],["이메일","이메일"]].map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id={`clientEdit.label.${key}`} defaultText={label} /></label>
                      <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                        value={editClientModal[key]||""}
                        onChange={(e) => setEditClientModal(p => ({ ...p, [key]: e.target.value }))} />
                      {key === "사업자번호" && <div className="mt-1.5"><BizCheck value={editClientModal.사업자번호} size="sm" /></div>}
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id="clientEdit.label.주소" defaultText="주소" /></label>
                    <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                      value={editClientModal.주소||""}
                      onChange={(e) => setEditClientModal(p => ({ ...p, 주소: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id="clientEdit.label.담당자목록" defaultText="담당자 목록" /></label>
                    <ContactListEditor
                      contacts={editClientModal.contacts}
                      onChange={(next) => setEditClientModal(p => ({ ...p, contacts: next }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id="clientEdit.label.등급" defaultText="등급" /></label>
                    <CustomSelect className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none bg-white"
                      value={editClientModal.등급||"일반"}
                      onChange={(e) => setEditClientModal(p => ({ ...p, 등급: e.target.value }))}>
                      <option value="일반">일반</option>
                      <option value="블랙">블랙</option>
                      <option value="주의">주의</option>
                      <option value="이탈">이탈</option>
                    </CustomSelect>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id="clientEdit.label.일반메모" defaultText="일반메모" /></label>
                    <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                      value={editClientModal.메모||""}
                      onChange={(e) => setEditClientModal(p => ({ ...p, 메모: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id="clientEdit.label.오더메모" defaultText="오더메모" /></label>
                    <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                      placeholder="이 거래처명을 입력할 때마다 안내 팝업으로 뜰 메모"
                      value={editClientModal.오더메모||""}
                      onChange={(e) => setEditClientModal(p => ({ ...p, 오더메모: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id="clientEdit.label.안내사항" defaultText="안내사항 (기사전달주의사항)" /></label>
                    <div className="text-[11px] text-gray-500 mb-1">이 거래처가 상/하차지로 포함된 오더를 "기사전달용"으로 복사할 때 자동으로 함께 붙습니다. 상하차지거래처에 같은 이름이 있으면 자동으로 동기화됩니다.</div>
                    <textarea rows={3} className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none resize-y"
                      placeholder="예: 안전화 착용 필수"
                      value={editClientModal.기사전달주의사항 || ""}
                      onChange={(e) => setEditClientModal(p => ({ ...p, 기사전달주의사항: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-semibold text-gray-500 mb-1"><EditableText id="clientEdit.label.점심시간" defaultText="점심시간" /></label>
                    <div className="text-[11px] text-gray-500 mb-1">실시간배차현황/배차현황에서 상/하차지명 옆에 표시되고, 상/하차시간이 이 시간대와 겹치면 경고로 알려줍니다.</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <TimeAmPmPicker
                        value={editClientModal.점심시작시간 || ""}
                        onChange={(v) => setEditClientModal(p => ({ ...p, 점심시작시간: v }))}
                      />
                      <span className="text-[12px] text-gray-500">~</span>
                      <TimeAmPmPicker
                        value={editClientModal.점심종료시간 || ""}
                        onChange={(v) => setEditClientModal(p => ({ ...p, 점심종료시간: v }))}
                      />
                      {(editClientModal.점심시작시간 || editClientModal.점심종료시간) && (
                        <button type="button"
                          onClick={() => setEditClientModal(p => ({ ...p, 점심시작시간: "", 점심종료시간: "" }))}
                          className="text-[11px] text-gray-500 hover:text-gray-600 underline"><EditableText id="misc.btn.55039.지우기" defaultText="지우기" /></button>
                      )}
                    </div>
                  </div>
                  {(editClientModal.오더메모?.trim() || (editClientModal.등급 && editClientModal.등급 !== "일반")) && (
                    <div className="col-span-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                      <div>
                        <div className="text-[13px] font-semibold text-gray-700">등록 시 오더메모/등급 팝업 표시</div>
                        <div className="text-[11px] text-gray-500 mt-0.5">꺼두면 이 거래처를 어디서 입력하든 오더메모·등급 안내 팝업이 뜨지 않습니다</div>
                      </div>
                      <button type="button"
                        onClick={() => setEditClientModal(p => ({ ...p, 팝업표시: p.팝업표시 === false ? true : false }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${editClientModal.팝업표시 === false ? "bg-gray-300" : "bg-[#1B2B4B]"}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editClientModal.팝업표시 === false ? "translate-x-1" : "translate-x-6"}`} />
                      </button>
                    </div>
                  )}
                  {/* ⭐ 월 단위로 합산 청구하는 거래처(예: 후레쉬물류처럼 매달 몰아서 입력하는
                      대행 청구 건) 등을 매출관리의 "순수 운송료" 통계·신규/이탈 거래처
                      리스트에서 제외할지 선택 — 운송사마다 이런 거래처가 다를 수 있어
                      회사별로 직접 지정한다. */}
                  <div className="col-span-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="text-[13px] font-semibold text-gray-700">순수 운송료 매출 통계에서 제외</div>
                    <button type="button"
                      onClick={() => setEditClientModal(p => ({ ...p, 순수매출제외: !p.순수매출제외 }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${editClientModal.순수매출제외 ? "bg-[#1B2B4B]" : "bg-gray-300"}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editClientModal.순수매출제외 ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>

                  {/* ⭐ 위와 별개 — 총 매출/순수 운송료/신규·이탈 리스트에는 그대로 두되,
                      매출관리의 "월매출 TOP10"·"매출 감소 TOP10" 순위에서만 빼고 싶은
                      거래처용(예: 월 합산청구처럼 순위표에 넣으면 왜곡되는 거래처). */}
                  <div className="col-span-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="text-[13px] font-semibold text-gray-700">매출 TOP10 / 감소 TOP10 순위에서 제외</div>
                    <button type="button"
                      onClick={() => setEditClientModal(p => ({ ...p, 매출순위제외: !p.매출순위제외 }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${editClientModal.매출순위제외 ? "bg-[#1B2B4B]" : "bg-gray-300"}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editClientModal.매출순위제외 ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>

                  {/* 파일/이미지 업로드 */}
                  <div className="col-span-2">
                    <label className="block text-[12px] font-semibold text-gray-500 mb-2">첨부파일 (사업자등록증 등)</label>
                    <div
                      className={`border-2 border-dashed rounded-xl p-5 text-center transition cursor-pointer ${editClientModal._dragOver ? "border-[#1B2B4B] bg-[#1B2B4B]/5" : "border-gray-200 hover:border-[#1B2B4B]/50"}`}
                      onDragOver={(e) => { e.preventDefault(); setEditClientModal(p => ({ ...p, _dragOver: true })); }}
                      onDragLeave={() => setEditClientModal(p => ({ ...p, _dragOver: false }))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setEditClientModal(p => ({ ...p, _dragOver: false }));
                        handleClientFile(e.dataTransfer.files[0]);
                      }}
                      onClick={() => document.getElementById("clientFileInput").click()}
                    >
                      <input autoComplete="off" id="clientFileInput" type="file" accept="image/*,.pdf" className="hidden"
                        onChange={(e) => {
                          handleClientFile(e.target.files[0]);
                          e.target.value = "";
                        }} />
                      {editClientModal.첨부파일Base64 ? (
                        <div className="space-y-2" onClick={e => e.stopPropagation()}>
                          {editClientModal.첨부파일타입?.startsWith("image/") ? (
                            <img src={editClientModal.첨부파일Base64} alt="첨부" className="max-h-40 mx-auto rounded-lg border border-gray-200 object-contain" />
                          ) : (
                            <div className="flex items-center justify-center gap-2 py-3">
                              <span className="text-[13px] text-gray-600 font-semibold">{editClientModal.첨부파일명}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-center gap-3 flex-wrap">
                            <span className="text-[12px] text-gray-500">{editClientModal.첨부파일명}</span>
                            <button
                              className="text-[12px] text-[#1B2B4B] font-semibold hover:underline"
                              onClick={() => setFilePreview({ base64: editClientModal.첨부파일Base64, type: editClientModal.첨부파일타입, name: editClientModal.첨부파일명 })}>
                              미리보기
                            </button>
                            {editClientModal.첨부파일타입?.startsWith("image/") && (
                              <button
                                className="text-[12px] text-[#1B2B4B] font-semibold hover:underline"
                                onClick={() => setOcrScanImage(editClientModal.첨부파일Base64)}>
                                사업자등록증 스캔
                              </button>
                            )}
                            <button
                              className="text-[12px] text-red-500 font-semibold hover:text-red-700"
                              onClick={() => setEditClientModal(p => ({ ...p, 첨부파일Base64: null, 첨부파일명: null, 첨부파일타입: null }))}>
                              삭제
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[13px] text-gray-500 font-semibold">클릭하거나 파일을 여기로 끌어오세요</p>
                          <p className="text-[11px] text-gray-400 mt-1">이미지 (JPG, PNG) 또는 PDF</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="px-6 pb-5 flex gap-3">
                  <button onClick={() => setEditClientModal(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="clientEdit.취소" defaultText="취소" /></button>
                  <button onClick={saveEditClient}
                    className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="clientEdit.저장" defaultText="저장" /></button>
                </div>
              </div>
            </div>
          )}

          {filePreview && (
            <FilePreviewModal
              base64={filePreview.base64}
              type={filePreview.type}
              name={filePreview.name}
              onClose={() => setFilePreview(null)}
            />
          )}

          {ocrScanImage && (
            <BizRegOcrModal
              imageBase64={ocrScanImage}
              onClose={() => setOcrScanImage(null)}
              onApply={(fields) => {
                setEditClientModal(p => {
                  if (!p) return p;
                  const next = { ...p };
                  Object.entries(fields).forEach(([k, v]) => { if (v && v.trim()) next[k] = v; });
                  return next;
                });
                showAlert("스캔 결과를 적용했습니다.");
              }}
            />
          )}

          {/* 메모 더보기 팝업 */}
          {memoPopup !== null && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
                  <h3 className="text-white font-bold text-[15px]"><EditableText id="popup.title.메모" defaultText="메모" /></h3>
                  <button onClick={() => setMemoPopup(null)} className="text-white/60 hover:text-white text-xl">✕</button>
                </div>
                <div className="px-6 py-5">
                  <p className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap">{memoPopup}</p>
                </div>
                <div className="px-6 pb-5">
                  <button onClick={() => setMemoPopup(null)}
                    className="w-full py-2.5 rounded-xl bg-[#1B2B4B] hover:bg-[#243a60] text-white text-[13px] font-bold transition"><EditableText id="misc.btn.55178.닫기" defaultText="닫기" /></button>
                </div>
              </div>
            </div>
          )}

          {/* ⭐ 2026-11-06 모바일 — 기본거래처 카드 목록(누르면 상세 시트) */}
          {mobile && filtered.length > 0 && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 px-1 text-[14px] font-bold text-[#3A4A66]"><KpCheckbox onChange={toggleAll} checked={clientAllChecked} indeterminate={clientSelInView > 0} />전체 선택 · {filtered.length.toLocaleString()}건</label>
              {sortedClients.map((r) => {
                const id = r.id || r.거래처명;
                return (
                  <div key={id} role="button" tabIndex={0} onClick={() => setMSheet({ kind: "client", r })}
                    className={`rounded-[16px] border px-3.5 py-3 ${selected.has(id) ? "bg-[#EAF1FF] border-[#2D4C82]" : "bg-white border-[#E3E8F0]"}`}>
                    <div className="flex items-start gap-2.5">
                      <span className="pt-0.5" onClick={(e) => e.stopPropagation()}><KpCheckbox checked={selected.has(id)} onChange={() => toggleOne(id)} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap"><span className="text-[15px] font-black text-[#0F1A30] break-words">{r.거래처명 || "-"}</span>{r.등급 && r.등급 !== "일반" && <span className="px-2 py-0.5 rounded bg-[#F3F6FA] text-[14px] font-bold text-[#0F1A30]">{r.등급}</span>}</div>
                        <div className="mt-0.5 text-[14px] text-[#3A4A66] break-words">{[r.사업자번호, r.대표자 && `대표 ${r.대표자}`].filter(Boolean).join(" · ") || "사업자 정보 없음"}</div>
                        {(r.담당자 || r.연락처) && <div className="mt-0.5 text-[14px] text-[#5B6B85] break-words">{[r.담당자, r.연락처].filter(Boolean).join(" · ")}</div>}
                        {r.주소 && <div className="mt-0.5 text-[14px] text-[#5B6B85] break-words">{r.주소}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {mobile && !filtered.length && <div className="rounded-[16px] bg-white border border-[#E3E8F0] py-14 text-center text-[14px] font-bold text-[#5B6B85]">{q ? "검색 결과가 없습니다" : "등록된 거래처가 없습니다"}</div>}
          {/* 테이블 */}
          {mobile ? null : filtered.length > 0 ? (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-max text-sm border-collapse w-full">
                  <thead>
                    <tr className="bg-[#1B2B4B]">
                      <th className="px-3 py-3 text-white font-bold text-center w-10">
                        <KpCheckbox onChange={toggleAll} checked={clientAllChecked} indeterminate={clientSelInView > 0}
                          title={clientAllChecked ? "전체 해제" : `목록 ${filteredClientIds.length.toLocaleString()}건 전체 선택`} />
                      </th>
                      {/* ⭐ 순번 → 담당자(연락처) 순서로 앞에 */}
                      {["순번","담당자","연락처","거래처명","사업자번호","대표자","업태","종목","주소","이메일","등급","일반메모","오더메모","안내사항"].map(h => (
                        <SortTh key={h} k={h} sort={clientSort.sort} onSort={clientSort.toggle} className="px-3 py-3 text-white font-bold text-center whitespace-nowrap"><EditableText id={`client.table.header.${h}`} defaultText={h} /></SortTh>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedClients.map((r, i) => {
                      const id = r.id || r.거래처명;
                      const isEditing = editingClientId === id;
                      return (
                        <tr key={id}
                          className={`transition border-b border-gray-100 ${selected.has(id) ? "bg-[#EAF1FF] hover:bg-[#E1EBFD]" : `${i%2?"bg-gray-50/50":"bg-white"} hover:bg-blue-50/30`} cursor-pointer`}
                          onDoubleClick={() => setEditClientModal({
                            ...r,
                            contacts: Array.isArray(r.contacts) && r.contacts.length
                              ? r.contacts
                              : (r.담당자 ? [{ name: r.담당자, phone: r.연락처 || "", isPrimary: true }] : []),
                            기사전달주의사항: (r.기사전달주의사항 || "").trim() ? r.기사전달주의사항 : defaultDriverNoticeTemplate(r.거래처명),
                          })}>
                          <td className="px-3 py-2.5 text-center" style={selected.has(id) ? { boxShadow: "inset 3px 0 0 #2D4C82" } : undefined}>
                            <KpCheckbox checked={selected.has(id)} onChange={(e) => { e.stopPropagation(); toggleOne(id); }} onClick={e => e.stopPropagation()} />
                          </td>
                          <td className="px-2 py-2.5 text-center text-[13px] text-gray-500 tabular-nums">{i + 1}</td>
                          {["담당자","연락처"].map(key => (
                            <td key={key} className="px-2 py-2.5 text-center">
                              <span className="text-[13px] text-gray-700 whitespace-nowrap">{r[key] || ""}</span>
                            </td>
                          ))}
                          {["거래처명","사업자번호"].map(key => (
                            <td key={key} className="px-2 py-2.5 text-center">
                              <span className="text-[13px] text-gray-700 whitespace-nowrap">{r[key] || ""}</span>
                            </td>
                          ))}
                          {["대표자","업태","종목","주소"].map(key => (
                            <td key={key} className="px-2 py-2.5 text-center" style={{ maxWidth: 120, overflow: "hidden" }}>
                              {(r[key] || "").length > 15 ? (
                                <div className="flex items-center justify-center gap-1">
                                  <span className="text-[13px] text-gray-700 whitespace-nowrap overflow-hidden" style={{ maxWidth: 72, textOverflow: "ellipsis", display: "inline-block" }}>
                                    {(r[key] || "").slice(0, 15)}
                                  </span>
                                  <button className="shrink-0 text-[12px] text-[#1B2B4B] font-semibold underline whitespace-nowrap" onClick={(e) => { e.stopPropagation(); setMemoPopup(r[key]); }}><EditableText id="misc.btn.55229.더보기" defaultText="더보기" /></button>
                                </div>
                              ) : (
                                <span className="text-[13px] text-gray-700 whitespace-nowrap">{r[key] || ""}</span>
                              )}
                            </td>
                          ))}
                          {["이메일"].map(key => (
                            <td key={key} className="px-2 py-2.5 text-center">
                              <span className="text-[13px] text-gray-700 whitespace-nowrap">{r[key] || ""}</span>
                            </td>
                          ))}
                          <td className="px-2 py-2.5 text-center"
                            onClick={e => { if (r.등급 && r.등급 !== "일반") e.stopPropagation(); }}
                            onDoubleClick={e => { if (!r.등급 || r.등급 === "일반") return; e.stopPropagation(); showAlert(r.등급변경일 ? `${r.등급} 등급 지정일: ${r.등급변경일}` : `${r.등급} 등급으로 지정되어 있으나 지정일 기록이 없습니다.`); }}
                            title={r.등급 && r.등급 !== "일반" ? "더블클릭하면 지정일을 볼 수 있습니다" : undefined}>
                            <span className={`text-[12px] font-bold ${r.등급 === "블랙" ? "text-gray-900" : r.등급 === "주의" ? "text-orange-700" : r.등급 === "이탈" ? "text-red-600" : "text-[#1B2B4B]"}`}>
                              {r.등급 || "일반"}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-center max-w-[160px]">
                            {(r.메모 || "").length > 18 ? (
                              <span className="text-[13px] text-gray-500">
                                {(r.메모 || "").slice(0, 18)}…
                                <button className="ml-1 text-[12px] text-[#1B2B4B] font-semibold underline" onClick={(e) => { e.stopPropagation(); setMemoPopup(r.메모); }}><EditableText id="misc.btn.55253.더보기" defaultText="더보기" /></button>
                              </span>
                            ) : (
                              <span className="text-[13px] text-gray-500">{r.메모 || ""}</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center max-w-[160px]">
                            {(r.오더메모 || "").length > 18 ? (
                              <span className="text-[13px] text-gray-500">
                                {(r.오더메모 || "").slice(0, 18)}…
                                <button className="ml-1 text-[12px] text-[#1B2B4B] font-semibold underline" onClick={(e) => { e.stopPropagation(); setMemoPopup(r.오더메모); }}><EditableText id="misc.btn.55263.더보기" defaultText="더보기" /></button>
                              </span>
                            ) : (
                              <span className="text-[13px] text-gray-500">{r.오더메모 || ""}</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center max-w-[160px]">
                            <span className="text-[13px] font-bold text-black">{_hasRealDriverNotice(r.기사전달주의사항) ? "등록" : "미등록"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <KpEmptySearch en="CLIENT SEARCH" title={q ? "검색 결과가 없습니다" : (showAllClients ? "등록된 거래처가 없습니다" : "위 검색바에 거래처명·사업자번호·담당자를 입력하세요")} sub={q || showAllClients ? "" : "전체보기를 누르면 모든 거래처가 보입니다"} />
          )}
        </div>
      )}

      {/* ⭐ 2026-11-06 모바일 상세 시트 — 상하차지·기본거래처 공용(수정·전화·삭제) */}
      {mobile && mSheet && (() => {
        const { kind, r } = mSheet;
        const isPlace = kind === "place";
        const id = isPlace ? (r.id || r.업체명) : (r.id || r.거래처명);
        const ph = String((isPlace ? r.담당자번호 : r.연락처) || "").replace(/\D/g, "");
        const rowsV = isPlace
          ? [["업체명", r.업체명], ["주소", r.주소], ["담당자", r.담당자], ["담당자번호", r.담당자번호], ["등급", r.등급 || "일반"], ["일반메모", r.메모], ["오더메모", r.오더메모], ["안내사항", _hasRealDriverNotice(r.기사전달주의사항) ? "등록" : "미등록"]]
          : [["거래처명", r.거래처명], ["사업자번호", r.사업자번호], ["대표자", r.대표자], ["업태", r.업태], ["종목", r.종목], ["주소", r.주소], ["이메일", r.이메일], ["담당자", r.담당자], ["연락처", r.연락처], ["등급", r.등급 || "일반"], ["일반메모", r.메모], ["오더메모", r.오더메모], ["안내사항", _hasRealDriverNotice(r.기사전달주의사항) ? "등록" : "미등록"]];
        const openEdit = () => {
          setMSheet(null);
          if (isPlace) setEditPlaceModal({ ...r, contacts: Array.isArray(r._rawContacts) && r._rawContacts.length ? r._rawContacts : (r.담당자 ? [{ name: r.담당자, phone: r.담당자번호 || "", isPrimary: true }] : []), 기사전달주의사항: (r.기사전달주의사항 || "").trim() ? r.기사전달주의사항 : defaultDriverNoticeTemplate(r.업체명) });
          else setEditClientModal({ ...r, contacts: Array.isArray(r.contacts) && r.contacts.length ? r.contacts : (r.담당자 ? [{ name: r.담당자, phone: r.연락처 || "", isPrimary: true }] : []), 기사전달주의사항: (r.기사전달주의사항 || "").trim() ? r.기사전달주의사항 : defaultDriverNoticeTemplate(r.거래처명) });
        };
        const del = async () => {
          if (!await kpConfirm(`${isPlace ? r.업체명 : r.거래처명}을(를) 삭제할까요?`)) return;
          setMSheet(null);
          if (isPlace) await runDelete({ label: "하차지", task: async () => { await mergePlaceContactsIntoClient(r); await removePlace(id); } });
          else await removeClient?.([id]);
        };
        return (
          <div className="fixed inset-0 z-[99990] bg-[#0B1428]/50 flex items-end" onClick={() => setMSheet(null)}>
            <div className="w-full max-h-[88vh] overflow-y-auto rounded-t-[22px] bg-white" onClick={(e) => e.stopPropagation()}>
              <div className="px-4 py-4 text-white flex items-start gap-3" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 70%,#2D4C82)" }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-extrabold tracking-[0.14em] text-[#8FB0F0]">{isPlace ? "PLACE" : "CLIENT"}</div>
                  <div className="text-[19px] font-black break-words">{isPlace ? r.업체명 : r.거래처명}</div>
                </div>
                <button type="button" onClick={() => setMSheet(null)} className="h-10 px-4 rounded-xl bg-white text-[#0F1A30] text-[14px] font-black shrink-0">닫기</button>
              </div>
              <div className="px-4 py-3 divide-y divide-[#EEF1F6]">
                {rowsV.filter(([, v]) => String(v || "").trim()).map(([k, v]) => (
                  <div key={k} className="py-2 flex gap-3"><span className="w-[84px] shrink-0 text-[14px] font-bold text-[#5B6B85]">{k}</span><span className="flex-1 min-w-0 text-[15px] font-bold text-[#0F1A30] break-words whitespace-pre-wrap">{v}</span></div>
                ))}
              </div>
              <div className="kp-sheet-grid px-4 pb-24 pt-1 grid grid-cols-3 gap-2">
                <button type="button" onClick={openEdit} className="h-12 rounded-2xl text-white text-[15px] font-black" style={{ background: "linear-gradient(120deg,#0F1A30,#2D4C82)" }}>수정</button>
                {ph ? <a href={`tel:${ph}`} className="h-12 rounded-2xl bg-white border border-[#DCE3EE] text-[#0F1A30] text-[15px] font-black flex items-center justify-center">전화</a> : <span className="h-12 rounded-2xl bg-[#F3F6FA] text-[#9AA9C3] text-[15px] font-black flex items-center justify-center">번호 없음</span>}
                <button type="button" onClick={del} className="h-12 rounded-2xl bg-white border border-[#0F1A30] text-[#0F1A30] text-[15px] font-black">삭제</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* 하차지거래처 수정 팝업 */}
      {editPlaceModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-[580px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-white font-bold text-[15px]">상하차지 수정 · {editPlaceModal.업체명}</h3>
              <button onClick={() => setEditPlaceModal(null)} className="text-white/60 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              {[["업체명 *","업체명"]].map(([label, key]) => (
                <div key={key}>
                  <label className="block text-[12px] font-semibold text-gray-500 mb-1">{label}</label>
                  <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                    value={editPlaceModal[key]||""}
                    onChange={(e) => setEditPlaceModal(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">담당자 목록</label>
                <ContactListEditor
                  contacts={editPlaceModal.contacts}
                  onChange={(next) => setEditPlaceModal(p => ({ ...p, contacts: next }))}
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">등급</label>
                <CustomSelect className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none bg-white"
                  value={editPlaceModal.등급||"일반"}
                  onChange={(e) => setEditPlaceModal(p => ({ ...p, 등급: e.target.value }))}>
                  <option value="일반">일반</option>
                  <option value="블랙">블랙</option>
                  <option value="주의">주의</option>
                  <option value="이탈">이탈</option>
                </CustomSelect>
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">주소</label>
                <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                  value={editPlaceModal.주소||""}
                  onChange={(e) => setEditPlaceModal(p => ({ ...p, 주소: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">일반메모</label>
                <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                  value={editPlaceModal.메모||""}
                  onChange={(e) => setEditPlaceModal(p => ({ ...p, 메모: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">오더메모</label>
                <input autoComplete="off" className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none"
                  placeholder="이 거래처명을 입력할 때마다 안내 팝업으로 뜰 메모"
                  value={editPlaceModal.오더메모||""}
                  onChange={(e) => setEditPlaceModal(p => ({ ...p, 오더메모: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">안내사항 (기사전달주의사항)</label>
                <div className="text-[11px] text-gray-500 mb-1">이 상/하차지가 포함된 오더를 "기사전달용"으로 복사할 때 자동으로 함께 붙습니다. 기본거래처에 같은 이름이 있으면 자동으로 동기화됩니다.</div>
                <textarea rows={3} className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] w-full focus:border-[#1B2B4B] outline-none resize-y"
                  placeholder="예: 안전화 착용 필수"
                  value={editPlaceModal.기사전달주의사항||""}
                  onChange={(e) => setEditPlaceModal(p => ({ ...p, 기사전달주의사항: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">점심시간</label>
                <div className="text-[11px] text-gray-500 mb-1">실시간배차현황/배차현황에서 상/하차지명 옆에 표시되고, 상/하차시간이 이 시간대와 겹치면 경고로 알려줍니다.</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <TimeAmPmPicker
                    value={editPlaceModal.점심시작시간 || ""}
                    onChange={(v) => setEditPlaceModal(p => ({ ...p, 점심시작시간: v }))}
                  />
                  <span className="text-[12px] text-gray-500">~</span>
                  <TimeAmPmPicker
                    value={editPlaceModal.점심종료시간 || ""}
                    onChange={(v) => setEditPlaceModal(p => ({ ...p, 점심종료시간: v }))}
                  />
                  {(editPlaceModal.점심시작시간 || editPlaceModal.점심종료시간) && (
                    <button type="button"
                      onClick={() => setEditPlaceModal(p => ({ ...p, 점심시작시간: "", 점심종료시간: "" }))}
                      className="text-[11px] text-gray-500 hover:text-gray-600 underline"><EditableText id="misc.btn.55365.지우기" defaultText="지우기" /></button>
                  )}
                </div>
              </div>
              {(editPlaceModal.오더메모?.trim() || (editPlaceModal.등급 && editPlaceModal.등급 !== "일반")) && (
                <div className="col-span-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                  <div>
                    <div className="text-[13px] font-semibold text-gray-700">등록 시 오더메모/등급 팝업 표시</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">꺼두면 이 거래처를 어디서 입력하든 오더메모·등급 안내 팝업이 뜨지 않습니다</div>
                  </div>
                  <button type="button"
                    onClick={() => setEditPlaceModal(p => ({ ...p, 팝업표시: p.팝업표시 === false ? true : false }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${editPlaceModal.팝업표시 === false ? "bg-gray-300" : "bg-[#1B2B4B]"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editPlaceModal.팝업표시 === false ? "translate-x-1" : "translate-x-6"}`} />
                  </button>
                </div>
              )}
              {/* ⭐ 기본거래처와 동일한 플래그 — 같은 이름의 기본거래처가 있으면 저장 시
                  자동으로 서로 동기화된다(upsertClient/upsertPlace). */}
              <div className="col-span-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="text-[13px] font-semibold text-gray-700">순수 운송료 매출 통계에서 제외</div>
                <button type="button"
                  onClick={() => setEditPlaceModal(p => ({ ...p, 순수매출제외: !p.순수매출제외 }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${editPlaceModal.순수매출제외 ? "bg-[#1B2B4B]" : "bg-gray-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editPlaceModal.순수매출제외 ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {/* ⭐ 위와 별개 — 총 매출/순수 운송료/신규·이탈 리스트에는 그대로 두되,
                  매출관리의 "월매출 TOP10"·"매출 감소 TOP10" 순위에서만 빼고 싶은
                  거래처용(예: 월 합산청구처럼 순위표에 넣으면 왜곡되는 거래처). */}
              <div className="col-span-2 flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <div className="text-[13px] font-semibold text-gray-700">매출 TOP10 / 감소 TOP10 순위에서 제외</div>
                <button type="button"
                  onClick={() => setEditPlaceModal(p => ({ ...p, 매출순위제외: !p.매출순위제외 }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${editPlaceModal.매출순위제외 ? "bg-[#1B2B4B]" : "bg-gray-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editPlaceModal.매출순위제외 ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setEditPlaceModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition"><EditableText id="misc.btn.55398.취소" defaultText="취소" /></button>
              <button onClick={saveEditPlace}
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white font-bold hover:bg-[#243a60] transition"><EditableText id="misc.btn.55400.저장" defaultText="저장" /></button>
            </div>
          </div>
        </div>
      )}


      {/* ══════ 담당자 불일치 복구 팝업 (임시) ══════ */}
      {showMismatchPopup && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-white font-bold text-[15px]"><EditableText id="client.mismatchPopup.title" defaultText="담당자 불일치 복구" /></h3>
                <p className="text-white/55 text-[12px] mt-0.5">이름이 같은 기본거래처/상하차지거래처인데 담당자 목록이 서로 다른 항목입니다. 선택하면 양쪽 담당자를 합쳐서 반영하고, 이후로는 자동으로 서로 동기화됩니다.</p>
              </div>
              <button onClick={() => setShowMismatchPopup(false)}
                className="text-white/60 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-[12px] text-gray-500">{mismatchCandidates.length}건 발견 · {mismatchSelected.size}건 선택됨</span>
              <button
                onClick={() => setMismatchSelected(prev => prev.size === mismatchCandidates.length ? new Set() : new Set(mismatchCandidates.map(m => m.client.id || m.client.거래처명)))}
                className="text-[12px] text-[#1B2B4B] font-semibold underline">
                {mismatchSelected.size === mismatchCandidates.length ? <EditableText id="client.mismatchPopup.전체해제" defaultText="전체 해제" /> : <EditableText id="client.mismatchPopup.전체선택" defaultText="전체 선택" />}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {mismatchCandidates.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-10">불일치 항목이 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {mismatchCandidates.map((m) => {
                    const id = m.client.id || m.client.거래처명;
                    return (
                      <label key={id} className="flex items-start gap-3 border border-gray-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-gray-50">
                        <input autoComplete="off" type="checkbox" className="mt-1" checked={mismatchSelected.has(id)}
                          onChange={() => setMismatchSelected(prev => {
                            const n = new Set(prev);
                            n.has(id) ? n.delete(id) : n.add(id);
                            return n;
                          })} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold text-gray-800">{m.client.거래처명}</div>
                          <div className="text-[12px] text-gray-500 mt-0.5">기본거래처 담당자: {m.cContacts.map(c => c.name).filter(Boolean).join(", ") || "-"}</div>
                          <div className="text-[12px] text-gray-500 mt-0.5">상하차지거래처 담당자: {m.pContacts.map(c => c.name).filter(Boolean).join(", ") || "-"}</div>
                          {m.onlyInPlace.length > 0 && <div className="text-[12px] text-orange-600 mt-0.5">상하차지에만 있음: {m.onlyInPlace.join(", ")}</div>}
                          {m.onlyInClient.length > 0 && <div className="text-[12px] text-orange-600 mt-0.5">기본거래처에만 있음: {m.onlyInClient.join(", ")}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={() => setShowMismatchPopup(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-semibold hover:bg-gray-50 transition"><EditableText id="client.mismatchPopup.취소" defaultText="취소" /></button>
              <button onClick={runMismatchFix} disabled={mismatchRunning || mismatchSelected.size === 0}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-bold transition">
                {mismatchRunning ? <EditableText id="client.mismatchPopup.복구중" defaultText="복구 중..." /> : <><EditableText id="client.mismatchPopup.선택항목복구" defaultText="선택 항목 복구" /> {`(${mismatchSelected.size})`}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ 하차지에서 불러오기 팝업 ══════ */}
      {showImportPopup && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-white font-bold text-[15px]"><EditableText id="client.importPopup.title" defaultText="상하차지에서 기본 거래처 불러오기" /></h3>
                <p className="text-white/55 text-[12px] mt-0.5"><EditableText id="client.importPopup.subtitle" defaultText="담당자, 연락처, 메모 정보가 그대로 반영됩니다" /></p>
              </div>
              <button onClick={() => setShowImportPopup(false)}
                className="text-white/60 hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="px-5 pt-4 shrink-0">
              <div className="text-[12px] font-semibold text-gray-500 mb-1.5"><EditableText id="client.importPopup.검색안내" defaultText="업체명 검색 후 선택 (방향키 / 엔터)" /></div>
              <div className="relative" ref={importDropRef}>
                <input autoComplete="off"
                  ref={importInputRef}
                  autoFocus
                  className="w-full border-2 border-[#1B2B4B] rounded-lg px-4 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-[#1B2B4B]/20 placeholder:text-gray-500"
                  placeholder="업체명 입력..."
                  value={importQ}
                  onChange={(e) => { setImportQ(e.target.value); setImportDropOpen(true); setImportDropIdx(0); }}
                  onFocus={() => { if (importQ.trim()) { setImportDropOpen(true); setImportDropIdx(0); } }}
                  onKeyDown={handleImportKeyDown}
                />
                {importDropOpen && importDropOptions.length > 0 && (
                  <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-[220px] overflow-y-auto">
                    {importDropOptions.map((p, i) => (
                      <div key={p.id + i}
                        ref={el => importItemRefs.current[i] = el}
                        className={`px-4 py-2.5 cursor-pointer transition ${
                          i === importDropIdx ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
                        }`}
                        onMouseEnter={() => setImportDropIdx(i)}
                        onMouseDown={(e) => { e.preventDefault(); addImportItem(p); }}>
                        <div className="font-semibold text-[13px]">
                          {(() => {
                            const q2 = importQ.trim();
                            if (!q2) return p.업체명;
                            const idx = p.업체명.toLowerCase().indexOf(q2.toLowerCase());
                            if (idx < 0) return p.업체명;
                            return (
                              <>
                                {p.업체명.slice(0, idx)}
                                <span className="text-blue-600 font-bold">{p.업체명.slice(idx, idx + q2.length)}</span>
                                {p.업체명.slice(idx + q2.length)}
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {p.주소 && <span className="mr-3">{p.주소}</span>}
                          {p.담당자 && <span className="mr-2">{p.담당자}</span>}
                          {p.담당자번호 && <span>{p.담당자번호}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {importSelected.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-10">
                  검색창에서 업체를 선택하면 여기에 추가됩니다
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[12px] font-semibold text-gray-500 mb-2">선택된 업체 {importSelected.length}건</div>
                  {importSelected.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                      <div className="flex-1">
                        <div className="font-bold text-[13px] text-[#1B2B4B]">{p.업체명}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5 flex gap-3 flex-wrap">
                          {p.주소 && <span>{p.주소}</span>}
                          {p.담당자 && <span>담당자: {p.담당자}</span>}
                          {p.담당자번호 && <span>{p.담당자번호}</span>}
                          {p.메모 && <span>메모: {p.메모}</span>}
                        </div>
                      </div>
                      <button onClick={() => removeImportItem(p.id)}
                        className="text-gray-500 hover:text-red-500 text-lg leading-none flex-shrink-0">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
              <button onClick={() => setShowImportPopup(false)}
                className="flex-1 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-700 font-semibold text-[13px] hover:bg-gray-100 transition"><EditableText id="client.importPopup.취소" defaultText="취소" /></button>
              <button onClick={saveImport}
                disabled={importSelected.length === 0}
                className={`flex-1 py-2.5 rounded-xl text-white font-bold text-[13px] transition ${
                  importSelected.length > 0 ? "bg-[#1B2B4B] hover:bg-[#243a60]" : "bg-gray-300 cursor-not-allowed"
                }`}>
                {importSelected.length > 0 ? <><span>{importSelected.length}</span><EditableText id="client.importPopup.건기본거래처로추가" defaultText="건 기본 거래처로 추가" /></> : <EditableText id="client.importPopup.업체를선택하세요" defaultText="업체를 선택하세요" />}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
