// ======================= src/CopyTemplateEditor.jsx =======================
// 📋 기사복사 문구 설정 — "기사 전달용 / 전체 상세" 위·아래 문구와 업로드 링크 포함 여부를 회사별로 정한다.
//  - 여는 곳: 기사복사(복사 형식 선택) 창의 "⚙ 문구 설정", 초기 설정 마법사
//  - 열기 신호: window.dispatchEvent(new CustomEvent("kp:copyTplOpen"))
import React from "react";
import { COPY_DEFAULTS, COPY_VARS, SAMPLE_BODY, SAMPLE_VARS, saveCopyTemplates, useCopyTemplates } from "./copyTemplates";

const MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";
const MODES = [["driver", "기사 전달용", "DRIVER"], ["full", "전체 상세", "FULL"]];
const draftOf = (cfg) => Object.fromEntries(MODES.map(([m]) => [m, { ...COPY_DEFAULTS[m], ...(cfg?.[m] || {}) }]));

export function CopyTemplateEditor({ canEdit = true, onSaved, compact = false }) {
  const cfg = useCopyTemplates();
  const [mode, setMode] = React.useState("driver");
  const [draft, setDraft] = React.useState(() => draftOf(cfg));
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const focus = React.useRef({ key: "top", el: null });
  React.useEffect(() => { if (!dirty) setDraft(draftOf(cfg)); }, [cfg, dirty]);

  const d = draft[mode];
  const set = (patch) => { setDraft((p) => ({ ...p, [mode]: { ...p[mode], ...patch } })); setDirty(true); setMsg(""); };
  const insertVar = (k) => {
    const { key, el } = focus.current;
    const cur = d[key] || "";
    const tok = `{${k}}`;
    const at = el && typeof el.selectionStart === "number" ? el.selectionStart : cur.length;
    set({ [key]: cur.slice(0, at) + tok + cur.slice(el?.selectionEnd ?? at) });
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = at + tok.length; } });
  };
  const save = async () => {
    setBusy(true);
    try { await saveCopyTemplates(draft); setDirty(false); setMsg("저장했습니다 — 다음 복사부터 바로 적용됩니다."); onSaved?.(); }
    catch (e) { setMsg(`저장 실패: ${e.message}`); } finally { setBusy(false); }
  };
  const preview = (() => {
    // 미리보기는 편집 중인 값으로 조립(캐시와 별개)
    const fill = (t) => String(t || "").replace(/\{([^{}\s]+)\}/g, (m, k) => (k in SAMPLE_VARS ? SAMPLE_VARS[k] : m)).trim();
    const up = d.includeUpload ? fill(d.uploadBlock) : "";
    const top = fill(d.top), bottom = fill(d.bottom), body = SAMPLE_BODY[mode];
    const out = mode === "driver"
      ? `${up ? up + "\n\n" : ""}${top ? top + "\n" : ""}${body}${bottom ? "\n\n" + bottom : ""}`
      : `${up ? up + "\n\n" : ""}${top ? top + "\n\n" : ""}${body}${bottom ? "\n\n" + bottom : ""}`;
    return out.replace(/\n{3,}/g, "\n\n").trim();
  })();

  const area = (key, label, hint, rows = 4) => (
    <label className="block">
      <div className="flex items-baseline justify-between"><span className="text-[12.5px] font-black text-[#1B2B4B]">{label}</span><span className="text-[11px] text-[#8A97AD]">{hint}</span></div>
      <textarea value={d[key] || ""} rows={rows} disabled={!canEdit}
        onFocus={(e) => { focus.current = { key, el: e.target }; }} onChange={(e) => set({ [key]: e.target.value })}
        className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[#DCE3EE] bg-white text-[13.5px] leading-relaxed outline-none focus:border-[#2D4C82] focus:ring-2 focus:ring-[#8FB0F0]/30 resize-y disabled:bg-[#F5F7FB]" />
    </label>
  );

  return (
    <div className={`grid gap-4 ${compact ? "" : "lg:grid-cols-[minmax(0,1fr)_340px]"} items-start`}>
      <div className="space-y-3 min-w-0">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#EEF2F8] w-fit">
          {MODES.map(([m, l, en]) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`h-9 px-4 rounded-lg text-[13px] font-black transition ${mode === m ? "bg-[#0F1A30] text-white shadow" : "text-[#3A4A66] hover:bg-white"}`}>
              {l}<span className="ml-1.5 text-[9.5px] tracking-[0.18em] opacity-60" style={{ fontFamily: MONO }}>{en}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#DCE3EE] bg-white px-4 py-3">
          <div><div className="text-[13.5px] font-black text-[#0F1A30]">업로드 링크 넣기</div><div className="text-[11.5px] text-[#7A89A3]">기사가 파렛전표·명세서를 올리는 링크를 문구에 포함합니다.</div></div>
          <button type="button" disabled={!canEdit} onClick={() => set({ includeUpload: !d.includeUpload })} aria-pressed={d.includeUpload}
            className={`relative w-[52px] h-7 rounded-full transition ${d.includeUpload ? "bg-[#1B2B4B]" : "bg-[#CBD5E3]"}`}>
            <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${d.includeUpload ? "left-[26px]" : "left-0.5"}`} />
          </button>
        </div>

        {d.includeUpload && area("uploadBlock", "① 업로드 안내", "맨 위에 붙음 · {업로드링크} 위치에 링크", 4)}
        {area("top", d.includeUpload ? "② 본문 위 문구" : "① 본문 위 문구", "날짜·상하차 정보 바로 위", 3)}
        <div className="rounded-xl border border-dashed border-[#B8C6DD] bg-[#F7F9FC] px-4 py-2.5 text-[12px] text-[#5B6B85]">
          <span className="font-black text-[#1B2B4B]">오더 본문</span> — 날짜 · 상차/하차 · 경유지 · 화물 · 결제방법은 프로그램이 자동으로 채웁니다.
        </div>
        {area("bottom", d.includeUpload ? "③ 본문 아래 문구" : "② 본문 아래 문구", "마지막에 붙음", 5)}

        <div>
          <div className="text-[11px] font-extrabold tracking-[0.2em] text-[#4B6CB7]" style={{ fontFamily: MONO }}>VARIABLES · 눌러서 커서 위치에 넣기</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {COPY_VARS.map(([k, desc]) => (
              <button key={k} type="button" disabled={!canEdit} title={desc} onClick={() => insertVar(k)}
                className="h-7 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B] hover:border-[#2D4C82] hover:bg-[#F2F6FC]" style={{ fontFamily: MONO }}>{`{${k}}`}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {canEdit && <button type="button" onClick={() => { set({ ...COPY_DEFAULTS[mode] }); }} className="h-10 px-4 rounded-xl border border-[#DCE3EE] text-[13px] font-black text-[#3A4A66] hover:bg-[#F5F7FB]">이 형식 기본값으로</button>}
          <div className="flex-1 text-[12.5px] font-bold text-[#2D4C82]">{msg || (dirty ? "저장하지 않은 변경 사항이 있습니다." : "")}</div>
          {canEdit ? <button type="button" onClick={save} disabled={busy || !dirty} className="h-10 px-5 rounded-xl bg-[#0F1A30] text-white text-[13.5px] font-black disabled:opacity-40">{busy ? "저장 중…" : "저장"}</button>
            : <span className="text-[12px] text-[#8A97AD]">관리자만 수정할 수 있습니다.</span>}
        </div>
      </div>

      {/* 카톡 미리보기 */}
      <div className="rounded-2xl p-3 lg:sticky lg:top-2" style={{ background: "linear-gradient(160deg,#0B1428,#1B2B4B)" }}>
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-[10.5px] font-extrabold tracking-[0.24em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>PREVIEW</span>
          <span className="text-[11px] text-white/45">예시 오더로 본 결과</span>
        </div>
        <div className="rounded-xl bg-[#EEF2F8] p-3 max-h-[520px] overflow-y-auto">
          <div className="rounded-xl rounded-tl-sm bg-white px-3 py-2.5 text-[12.5px] leading-[1.6] text-[#0F1A30] whitespace-pre-wrap break-all shadow-sm">{preview}</div>
        </div>
      </div>
    </div>
  );
}

// 앱 어디서든 신호로 여는 설정 창
export function CopyTemplateHost({ canEdit = true }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("kp:copyTplOpen", h);
    return () => window.removeEventListener("kp:copyTplOpen", h);
  }, []);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100050] bg-[#0B1428]/60 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="w-full max-w-[1080px] max-h-[92vh] overflow-y-auto rounded-3xl bg-[#F4F6FA] shadow-[0_30px_80px_rgba(11,20,40,0.45)]">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 text-white" style={{ background: "linear-gradient(120deg,#0B1428,#1B2B4B 60%,#2D4C82)" }}>
          <div>
            <div className="text-[10.5px] font-extrabold tracking-[0.3em] text-[#8FB0F0]" style={{ fontFamily: MONO }}>COPY · TEMPLATE</div>
            <div className="text-[19px] font-black">기사복사 문구 설정</div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="h-9 px-3.5 rounded-xl bg-white/10 border border-white/20 text-[13px] font-bold hover:bg-white/20">닫기 ✕</button>
        </div>
        <div className="p-6"><CopyTemplateEditor canEdit={canEdit} /></div>
      </div>
    </div>
  );
}

export const openCopyTemplateEditor = () => window.dispatchEvent(new CustomEvent("kp:copyTplOpen"));
