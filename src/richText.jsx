// ======================= src/richText.jsx =======================
// ✍️ 2026-11-03 글자 꾸미기 편집기(플랫폼 공지 등) — 굵게·기울임·밑줄·취소선 · 글자 크기 · 글자색 · 형광펜 · 정렬 · 목록 · 줄 긋기
//  - 저장은 HTML(bodyHtml) + 글자만(body, 푸시·검색용) 두 가지
//  - 보여줄 때는 sanitizeHtml로 허용한 태그·스타일만 남긴다(스크립트·이벤트·링크 장난 방지)
import React from "react";

// ── 안전한 HTML만 남기기 ─────────────────────────────────────────────
const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "SPAN", "FONT", "BR", "P", "DIV", "UL", "OL", "LI", "HR", "H2", "H3", "BLOCKQUOTE"]);
const STYLE_OK = /^(color|background-color|font-size|font-weight|font-style|text-decoration(-line)?|text-align)$/i;
const VALUE_OK = /^[#(),.%\w\s-]+$/; // url()·expression() 같은 것은 막힌다(괄호는 rgb()용으로만)
export function sanitizeHtml(html) {
  if (!html) return "";
  let docu;
  try { docu = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html"); } catch { return ""; }
  const clean = (node) => {
    [...node.childNodes].forEach((ch) => {
      if (ch.nodeType === 3) return; // 글자
      if (ch.nodeType !== 1) { ch.remove(); return; }
      if (!ALLOWED.has(ch.tagName)) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META)$/.test(ch.tagName)) { ch.remove(); return; }
        clean(ch); ch.replaceWith(...ch.childNodes); return; // 모르는 태그는 글자만 남김
      }
      [...ch.attributes].forEach((a) => {
        const n = a.name.toLowerCase();
        if (n === "style") {
          const kept = String(a.value).split(";").map((d) => d.trim()).filter(Boolean).filter((d) => {
            const [p, ...v] = d.split(":"); const val = v.join(":").trim();
            return STYLE_OK.test(p.trim()) && VALUE_OK.test(val) && !/url|expression|javascript/i.test(val);
          });
          if (kept.length) ch.setAttribute("style", kept.join("; ")); else ch.removeAttribute("style");
        } else if (ch.tagName === "FONT" && (n === "color" || n === "size")) {
          if (!/^[#\w]+$/.test(a.value)) ch.removeAttribute(a.name);
        } else ch.removeAttribute(a.name);
      });
      clean(ch);
    });
  };
  const root = docu.body.firstChild;
  clean(root);
  return root.innerHTML;
}
export const htmlToText = (html) => {
  if (!html) return "";
  try {
    const d = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h2|h3)>/gi, "\n"), "text/html");
    return (d.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  } catch { return String(html).replace(/<[^>]+>/g, ""); }
};
const escapeHtml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const textToHtml = (t) => escapeHtml(t).replace(/\n/g, "<br>");

// 보여주기(공지 상세 등) — HTML이 있으면 꾸민 글, 없으면 예전 글자 그대로(줄바꿈 유지)
export function RichHtml({ html, text, className = "" }) {
  const safe = React.useMemo(() => sanitizeHtml(html), [html]);
  if (!safe) return <div className={`whitespace-pre-wrap break-words ${className}`}>{text || ""}</div>;
  return <div className={`kp-rich break-words ${className}`} dangerouslySetInnerHTML={{ __html: safe }} />;
}

// ── 편집기 ───────────────────────────────────────────────────────────
const SIZES = [["작게", "2"], ["보통", "3"], ["크게", "5"], ["아주 크게", "6"]];
const COLORS = ["#0F1A30", "#1B2B4B", "#2D4C82", "#4B6CB7", "#D92D20", "#B54708", "#067647", "#6941C6", "#7A879C"];
const MARKS = ["#FFF3B0", "#FDE2E1", "#DCFAE6", "#E0EAFF", "transparent"];
const Btn = ({ on, title, onClick, children, wide }) => (
  <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
    className={`h-9 ${wide ? "px-3" : "w-9"} inline-flex items-center justify-center rounded-lg text-[14px] font-black border transition ${on ? "bg-[#0F1A30] text-white border-[#0F1A30]" : "bg-white text-[#1B2B4B] border-[#DCE3EE] hover:border-[#4B6CB7]"}`}>{children}</button>
);

export function RichTextEditor({ value = "", onChange, placeholder = "내용을 입력하세요", minHeight = 300 }) {
  const ref = React.useRef(null);
  const [st, setSt] = React.useState({});
  const [pop, setPop] = React.useState(""); // "color" | "mark" | "size"
  // 처음 한 번(또는 밖에서 값이 바뀐 경우)만 넣는다 — 입력 중에 다시 넣으면 커서가 맨 앞으로 튄다
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    if (el.innerHTML !== value && document.activeElement !== el) el.innerHTML = sanitizeHtml(value);
  }, [value]);
  const emit = () => { const el = ref.current; if (el) onChange?.(el.innerHTML); };
  const refresh = () => {
    try { setSt({ b: document.queryCommandState("bold"), i: document.queryCommandState("italic"), u: document.queryCommandState("underline"), s: document.queryCommandState("strikeThrough"),
      ul: document.queryCommandState("insertUnorderedList"), ol: document.queryCommandState("insertOrderedList") }); } catch { /* 무시 */ }
  };
  const cmd = (c, v = null) => {
    ref.current?.focus();
    try { document.execCommand("styleWithCSS", false, c === "fontSize" ? false : true); document.execCommand(c, false, v); } catch { /* 무시 */ }
    setPop(""); emit(); refresh();
  };
  const empty = !String(value || "").replace(/<br\s*\/?>|<\/?(p|div)>|&nbsp;|\s/gi, "");
  return (
    <div className="rounded-xl border border-[#DCE3EE] bg-white focus-within:border-[#4B6CB7] overflow-visible">
      <div className="flex flex-wrap items-center gap-1 px-2.5 py-2 border-b border-[#EEF1F6] bg-[#F7F9FC] rounded-t-xl">
        <Btn on={st.b} title="굵게 (Ctrl+B)" onClick={() => cmd("bold")}><b>가</b></Btn>
        <Btn on={st.i} title="기울임 (Ctrl+I)" onClick={() => cmd("italic")}><i>가</i></Btn>
        <Btn on={st.u} title="밑줄 (Ctrl+U)" onClick={() => cmd("underline")}><u>가</u></Btn>
        <Btn on={st.s} title="취소선" onClick={() => cmd("strikeThrough")}><s>가</s></Btn>
        <span className="w-px h-6 bg-[#DCE3EE] mx-1" />
        <div className="relative">
          <Btn wide title="글자 크기" onClick={() => setPop(pop === "size" ? "" : "size")}>크기 ▾</Btn>
          {pop === "size" && (
            <div className="absolute z-30 top-full mt-1 left-0 w-36 rounded-xl border border-[#DCE3EE] bg-white shadow-lg py-1">
              {SIZES.map(([l, v]) => <button key={v} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("fontSize", v)} className="w-full text-left px-3 py-1.5 hover:bg-[#F3F6FB] font-bold text-[#0F1A30]"><font size={v}>{l}</font></button>)}
            </div>
          )}
        </div>
        <div className="relative">
          <Btn wide title="글자색" onClick={() => setPop(pop === "color" ? "" : "color")}><span className="border-b-[3px] border-[#D92D20] leading-none">가</span>&nbsp;▾</Btn>
          {pop === "color" && (
            <div className="absolute z-30 top-full mt-1 left-0 p-2 rounded-xl border border-[#DCE3EE] bg-white shadow-lg grid grid-cols-5 gap-1.5 w-[178px]">
              {COLORS.map((c) => <button key={c} type="button" title={c} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("foreColor", c)} className="w-7 h-7 rounded-md border border-black/10" style={{ background: c }} />)}
            </div>
          )}
        </div>
        <div className="relative">
          <Btn wide title="형광펜" onClick={() => setPop(pop === "mark" ? "" : "mark")}><span className="px-1 rounded bg-[#FFF3B0]">가</span>&nbsp;▾</Btn>
          {pop === "mark" && (
            <div className="absolute z-30 top-full mt-1 left-0 p-2 rounded-xl border border-[#DCE3EE] bg-white shadow-lg flex gap-1.5">
              {MARKS.map((c) => <button key={c} type="button" title={c === "transparent" ? "지우기" : c} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("hiliteColor", c)} className="w-7 h-7 rounded-md border border-black/10 text-[11px] font-black text-[#7A879C]" style={{ background: c === "transparent" ? "#fff" : c }}>{c === "transparent" ? "✕" : ""}</button>)}
            </div>
          )}
        </div>
        <span className="w-px h-6 bg-[#DCE3EE] mx-1" />
        <Btn title="왼쪽 정렬" onClick={() => cmd("justifyLeft")}>≡</Btn>
        <Btn title="가운데 정렬" onClick={() => cmd("justifyCenter")}>☰</Btn>
        <Btn on={st.ul} title="글머리 목록" onClick={() => cmd("insertUnorderedList")}>•</Btn>
        <Btn on={st.ol} title="번호 목록" onClick={() => cmd("insertOrderedList")}>1.</Btn>
        <Btn title="구분선" onClick={() => cmd("insertHorizontalRule")}>―</Btn>
        <span className="w-px h-6 bg-[#DCE3EE] mx-1" />
        <Btn wide title="꾸밈 지우기" onClick={() => cmd("removeFormat")}>지우기</Btn>
      </div>
      <div className="relative">
        {empty && <div className="absolute left-4 top-3.5 text-[15px] text-[#9AA9C3] pointer-events-none">{placeholder}</div>}
        <div ref={ref} contentEditable suppressContentEditableWarning onInput={() => { emit(); refresh(); }} onKeyUp={refresh} onMouseUp={refresh} onBlur={emit} onFocus={() => setPop("")}
          onPaste={(e) => { // 붙여넣기는 글자만(다른 곳 서식·스크립트가 딸려오지 않게)
            e.preventDefault(); const t = e.clipboardData?.getData("text/plain") || ""; document.execCommand("insertHTML", false, textToHtml(t)); emit();
          }}
          className="kp-rich px-4 py-3.5 text-[15px] leading-[1.85] text-[#0F1A30] outline-none" style={{ minHeight }} />
      </div>
    </div>
  );
}
