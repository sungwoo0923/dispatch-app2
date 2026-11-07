// ======================= src/TextOverrideLayer.jsx =======================
// ⭐ 2026-11-06 문구 편집 모드 — 최고관리자(totalMaster · 부관리자)가 프로그램 안 아무 글자나 바로 고치는 화면
//  · 왼쪽 아래 "✎ 문구" 단추(또는 Ctrl+Shift+E)로 켠다/끈다. 켜면 마우스를 올린 글자에 테두리가 생기고,
//    누르면 작은 편집 창이 뜬다(원래 문구 · 새 문구 · 이 화면만/프로그램 전체 · 저장/원래대로).
//  · 버튼 글자·제목·설명·입력칸 안내문구(placeholder)·툴팁(title)·알림 글자까지 모두 같은 사전으로 바뀐다.
//  · 표 본문(오더·기사 목록 등 데이터)은 바꾸지 않는다.
//  · "목록"에서 전체 검색·수정·삭제·직접 추가(토스트처럼 금방 사라지는 글자)·JSON 내보내기/가져오기.
//  · 2026-11-07 글자 모양: 글씨체·두께·크기·글자색·배경색·굵게/기울임/밑줄/취소선 — 고르는 동안 화면에 바로 미리 보기.
//  PC·모바일·기사앱·화주사 화면 모두 App.jsx 맨 위에서 이 컴포넌트 하나로 붙는다. 저장·적용 엔진은 ./textOverrides.js
import React from "react";
import { createPortal } from "react-dom";
import {
  initTextOverrides, subscribe, getDocsSnapshot, saveOverride, importOverrides, exportOverrides,
  currentRouteKey, routeDocId, routeLabel, isEligibleText, originalTextOf, originalAttrOf, SKIP_SELECTOR, ATTRS,
  saveStyle, cleanStyle, sameStyle, cssFor, setPreview, clearPreview, FONTS, WEIGHTS,
} from "./textOverrides";

initTextOverrides();

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";
const UI = { "data-kp-tx-ui": "", "data-ro-allow": "" };
const KIND_LABEL = { text: "글자", placeholder: "입력칸 안내문구", title: "툴팁(마우스 올리면 뜨는 글)" };
const C = { navy: "#0F1A30", navy2: "#1B2B4B", blue: "#2D4C82", sky: "#8FB0F0", line: "#DCE3EE", amber: "#F5B83D" };

function useOverridesVersion() {
  const [v, setV] = React.useState(0);
  React.useEffect(() => subscribe(() => setV((x) => x + 1)), []);
  return v;
}

// 개발 서버 둘러보기에서 최고관리자 화면을 시험할 때(/preview?...&role=totalMaster) — 배포 빌드에는 없음
const devPreviewMaster = () => import.meta.env.DEV && window.location.pathname === "/preview" && new URLSearchParams(window.location.search).get("role") === "totalMaster";

// 마우스 아래 요소에서 "고칠 글자가 있는 요소"를 찾는다
function directTexts(el) {
  const out = [];
  for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) out.push(n);
  return out;
}
function findTarget(start) {
  if (!start || start.nodeType !== 1) return null;
  if (start.closest("[data-kp-tx-ui]")) return null;
  const blocked = start.closest(SKIP_SELECTOR + ", svg");
  if (blocked && !(start.tagName === "TEXTAREA" && blocked === start)) return { el: blocked.closest("td,tbody,[role='row']") || blocked, blocked: true };
  let el = start;
  for (let i = 0; el && i < 6; i++, el = el.parentElement) {
    if (el === document.body) break;
    if (directTexts(el).some((n) => isEligibleText(originalTextOf(n)))) return { el };
    if (ATTRS.some((a) => el.hasAttribute(a) && (el.getAttribute(a) || "").trim())) return { el };
    // 단추 여백을 누른 경우 — 안에 글자가 하나뿐이면 그 글자
    if (i === 0) {
      const w = document.createTreeWalker(el, 4); const found = []; let n; let k = 0;
      while ((n = w.nextNode()) && k++ < 40) if (n.nodeValue.trim()) found.push(n);
      if (found.length === 1 && isEligibleText(originalTextOf(found[0])) && !found[0].parentElement.closest(SKIP_SELECTOR)) return { el: found[0].parentElement };
    }
  }
  return null;
}
// 그 요소에서 고칠 수 있는 항목들(글자 · placeholder · title)
function itemsOf(el) {
  const items = [];
  const seen = new Set();
  for (const n of directTexts(el)) {
    const o = originalTextOf(n).trim();
    if (!isEligibleText(o) || seen.has("t" + o)) continue;
    seen.add("t" + o); items.push({ kind: "text", orig: o });
  }
  let a = el;
  for (let i = 0; a && i < 3 && a !== document.body; i++, a = a.parentElement) {
    for (const name of ATTRS) {
      if (!a.hasAttribute(name)) continue;
      const o = (originalAttrOf(a, name) || "").trim();
      if (!o || o.length > 300 || seen.has(name + o)) continue;
      seen.add(name + o); items.push({ kind: name, orig: o });
    }
  }
  return items;
}

// 이 글자의 저장된 모양(이 화면만 → 프로그램 전체 순)
function lookupStyle(docs, orig) {
  const rid = routeDocId(currentRouteKey());
  if (docs[rid]?.s?.[orig]) return { scope: "route", style: docs[rid].s[orig] };
  if (docs.global?.s?.[orig]) return { scope: "global", style: docs.global.s[orig] };
  return null;
}
// 검사한 CSS → React style 객체(목록의 미리 보기용)
const reactCss = (st) => Object.fromEntries(Object.entries(cssFor(st) || {}).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));

const PALETTE = [["#0F1A30", "남색"], ["#2563EB", "파랑"], ["#DC2626", "빨강"], ["#16A34A", "초록"], ["#EA580C", "주황"], ["#6B7280", "회색"], ["#000000", "검정"], ["#FFFFFF", "흰색"]];
const HILITE = [["#FFF3B0", "노랑"], ["#DBEAFE", "하늘"], ["#DCFCE7", "연두"], ["#FFE4E6", "분홍"], ["#FFEDD5", "살구"], ["#E5E7EB", "회색"]];
const SIZES = Array.from({ length: 22 }, (_, i) => 11 + i);

function lookup(docs, kind, orig) {
  const field = kind === "text" ? "t" : "a";
  const key = kind === "text" ? orig : `${kind}::${orig}`;
  const rid = routeDocId(currentRouteKey());
  if (docs[rid]?.[field]?.[key] !== undefined) return { scope: "route", value: docs[rid][field][key] };
  if (docs.global?.[field]?.[key] !== undefined) return { scope: "global", value: docs.global[field][key] };
  return null;
}

export default function TextOverrideLayer({ role, user }) {
  useOverridesVersion();
  const canEdit = role === "totalMaster" || user?.email === TOTAL_MASTER_EMAIL || devPreviewMaster();
  const [on, setOn] = React.useState(false);
  const [hidden, setHidden] = React.useState(() => { try { return sessionStorage.getItem("kpTxPillHidden") === "1"; } catch { return false; } });
  const [hover, setHover] = React.useState(null); // { rect, blocked }
  const [editor, setEditor] = React.useState(null); // { rect, items }
  const [listOpen, setListOpen] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const toastT = React.useRef(0);
  const say = React.useCallback((m) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2600); }, []);
  const editorRef = React.useRef(null); editorRef.current = editor;

  // 단축키 Ctrl(⌘)+Shift+E — 켜기/끄기 · Esc — 편집 창 닫기 → 모드 끄기
  React.useEffect(() => {
    if (!canEdit) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === "KeyE" || e.key === "E" || e.key === "e")) {
        e.preventDefault(); e.stopPropagation();
        setHidden(false); try { sessionStorage.removeItem("kpTxPillHidden"); } catch { /* 무시 */ }
        setOn((v) => !v); setEditor(null); return;
      }
      if (e.key === "Escape" && (on || listOpen)) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (editorRef.current) setEditor(null); else if (listOpen) setListOpen(false); else setOn(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [canEdit, on, listOpen]);

  // 편집 모드 — 마우스 올린 글자 표시 · 누르면 편집 창(원래 화면의 클릭 동작은 막는다)
  React.useEffect(() => {
    if (!canEdit || !on) { setHover(null); return undefined; }
    let raf = 0; let last = null;
    const pick = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? findTarget(el) : null;
    };
    const onMove = (e) => {
      if (e.pointerType === "touch") return;
      last = e; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (editorRef.current || !last) return;
        const t = pick(last.clientX, last.clientY);
        setHover(t ? { rect: t.el.getBoundingClientRect(), blocked: !!t.blocked } : null);
      });
    };
    const inUi = (e) => !!e.target?.closest?.("[data-kp-tx-ui]");
    const block = (e) => { if (inUi(e)) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); };
    const onClick = (e) => {
      if (inUi(e)) return;
      block(e);
      const t = pick(e.clientX, e.clientY);
      if (!t) { setEditor(null); return; }
      if (t.blocked) { say("표 안의 데이터(오더·기사 등)는 바꿀 수 없어요 — 제목·버튼·안내 글자만 됩니다"); return; }
      const items = itemsOf(t.el);
      if (!items.length) { say("이 자리에는 바꿀 글자가 없어요(숫자·데이터는 제외)"); return; }
      setHover(null);
      setEditor({ rect: t.el.getBoundingClientRect(), items });
    };
    const evs = ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "contextmenu", "submit"];
    const stopTouch = (e) => { if (!inUi(e)) e.stopPropagation(); }; // 터치 — 스크롤은 살리고 화면 동작만 막는다
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("touchend", stopTouch, true);
    evs.forEach((t) => window.addEventListener(t, block, true));
    document.documentElement.classList.add("kp-tx-editing");
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("touchend", stopTouch, true);
      evs.forEach((t) => window.removeEventListener(t, block, true));
      document.documentElement.classList.remove("kp-tx-editing");
    };
  }, [canEdit, on, say]);

  if (!canEdit) return null;

  const hidePill = () => { setHidden(true); try { sessionStorage.setItem("kpTxPillHidden", "1"); } catch { /* 무시 */ } say("단추를 숨겼어요 — Ctrl+Shift+E로 다시 켤 수 있어요"); };
  const isPhone = window.innerWidth < 768;

  return createPortal(
    <div {...UI}>
      <style>{`.kp-tx-editing, .kp-tx-editing * { cursor: crosshair !important; } .kp-tx-editing [data-kp-tx-ui], .kp-tx-editing [data-kp-tx-ui] * { cursor: auto !important; }`}</style>
      {/* 마우스 올린 자리 표시 */}
      {on && hover && !editor && (
        <div style={{ position: "fixed", left: hover.rect.left - 3, top: hover.rect.top - 3, width: hover.rect.width + 6, height: hover.rect.height + 6, border: `2px ${hover.blocked ? "dashed #B42318" : "solid " + C.amber}`, background: hover.blocked ? "rgba(180,35,24,0.06)" : "rgba(245,184,61,0.14)", borderRadius: 6, pointerEvents: "none", zIndex: 2147483600, transition: "all .06s" }}>
          <span style={{ position: "absolute", left: 0, top: -20, fontSize: 11, fontWeight: 800, color: "#fff", background: hover.blocked ? "#B42318" : C.navy, padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap" }}>{hover.blocked ? "데이터 · 편집 안 됨" : "눌러서 문구 바꾸기"}</span>
        </div>
      )}

      {/* 떠 있는 단추 */}
      {!hidden && (
        <div style={{ position: "fixed", left: 12, bottom: isPhone ? 86 : 14, zIndex: 2147483601 }} className="flex items-center gap-1 rounded-full shadow-[0_10px_26px_rgba(11,20,40,0.35)] p-1" data-kp="text-edit-pill">
          <div className="flex items-center gap-1 rounded-full p-1" style={{ background: on ? C.amber : `linear-gradient(120deg,${C.navy},${C.navy2} 70%,${C.blue})` }}>
            <button type="button" onClick={() => { setOn((v) => !v); setEditor(null); }} title="문구 편집 모드 (Ctrl+Shift+E)" className={`h-8 px-3 rounded-full text-[12.5px] font-black whitespace-nowrap ${on ? "text-[#0F1A30]" : "text-white"}`}>
              {on ? "✎ 문구 편집 중 · 끄기" : "✎ 문구"}
            </button>
            {on && <button type="button" onClick={() => setListOpen(true)} className="h-8 px-3 rounded-full bg-[#0F1A30] text-white text-[12px] font-black whitespace-nowrap">목록</button>}
            {!on && <button type="button" onClick={hidePill} title="이 창에서 단추 숨기기(Ctrl+Shift+E로 다시)" className="h-8 w-7 rounded-full text-white/50 hover:text-white text-[13px] font-black">×</button>}
          </div>
        </div>
      )}

      {editor && <EditorPopover editor={editor} onClose={() => setEditor(null)} say={say} isPhone={isPhone} onList={() => { setEditor(null); setListOpen(true); }} />}
      {listOpen && <OverrideListModal onClose={() => setListOpen(false)} say={say} />}

      {toast && <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: isPhone ? 140 : 70, zIndex: 2147483646 }} className="px-4 py-2.5 rounded-xl bg-[#0B1428] text-white text-[13px] font-bold shadow-lg max-w-[calc(100vw-24px)] text-center">{toast}</div>}
    </div>,
    document.body
  );
}

// ───────────────────────── 편집 창 ─────────────────────────
function EditorPopover({ editor, onClose, say, isPhone, onList }) {
  const docs = getDocsSnapshot();
  const [scope, setScope] = React.useState(() => editor.items.map((it) => lookup(docs, it.kind, it.orig)).find(Boolean)?.scope || "global");
  const [vals, setVals] = React.useState(() => editor.items.map((it) => lookup(docs, it.kind, it.orig)?.value ?? it.orig));
  const [styles, setStyles] = React.useState(() => editor.items.map((it) => (it.kind === "text" ? { ...(lookupStyle(docs, it.orig)?.style || {}) } : null)));
  const [busy, setBusy] = React.useState(false);
  // 고르는 중인 문구·모양을 화면에 바로 보여준다(닫으면 저장된 값으로 돌아감)
  React.useEffect(() => {
    editor.items.forEach((it, i) => { if (it.kind === "text") setPreview(it.orig, { text: vals[i] ?? "", style: styles[i] }); });
  }, [editor.items, vals, styles]);
  React.useEffect(() => () => clearPreview(), []);
  const firstRef = React.useRef(null);
  React.useEffect(() => { setTimeout(() => { firstRef.current?.focus(); firstRef.current?.select?.(); }, 0); }, []);

  const routeId = routeDocId(currentRouteKey());
  const docIdFor = (s) => (s === "route" ? routeId : "global");
  const otherOf = (s) => (s === "route" ? "global" : "route");

  const save = async () => {
    setBusy(true);
    try {
      let n = 0;
      for (let i = 0; i < editor.items.length; i++) {
        const it = editor.items[i]; const v = (vals[i] ?? "").trim();
        const ex = lookup(getDocsSnapshot(), it.kind, it.orig);
        if (!v || v === it.orig) { // 원래 문구와 같게 → 이 범위의 덮어쓰기 지움
          if (ex) { await saveOverride({ docId: docIdFor(ex.scope), kind: it.kind, orig: it.orig, value: null }); n++; }
          continue;
        }
        if (ex && ex.scope === scope && ex.value === v) continue;
        await saveOverride({ docId: docIdFor(scope), kind: it.kind, orig: it.orig, value: v });
        // 범위를 바꿔 저장했으면 다른 범위의 예전 값은 지운다(헷갈리지 않게)
        if (ex && ex.scope !== scope) await saveOverride({ docId: docIdFor(otherOf(scope)), kind: it.kind, orig: it.orig, value: null });
        n++;
      }
      // 글자 모양 — 기본값이면 지우고, 범위를 바꿨으면 다른 범위 것은 지운다
      for (let i = 0; i < editor.items.length; i++) {
        const it = editor.items[i];
        if (it.kind !== "text") continue;
        const want = cleanStyle(styles[i]);
        const ex = lookupStyle(getDocsSnapshot(), it.orig);
        if (!want) { if (ex) { await saveStyle({ docId: docIdFor(ex.scope), orig: it.orig, style: null }); n++; } continue; }
        if (ex && ex.scope === scope && sameStyle(ex.style, want)) continue;
        await saveStyle({ docId: docIdFor(scope), orig: it.orig, style: want });
        if (ex && ex.scope !== scope) await saveStyle({ docId: docIdFor(otherOf(scope)), orig: it.orig, style: null });
        n++;
      }
      say(n ? `저장했어요${scope === "global" ? " · 프로그램 전체" : " · 이 화면만"} — 다른 사용자는 다음 접속부터 보입니다` : "바뀐 내용이 없어요");
      onClose();
    } catch (e) { say("저장 실패: " + (e?.message || e)); } finally { setBusy(false); }
  };
  const reset = async () => {
    setBusy(true);
    try {
      for (const it of editor.items) for (const s of ["route", "global"]) {
        const d = getDocsSnapshot()[docIdFor(s)];
        const key = it.kind === "text" ? it.orig : `${it.kind}::${it.orig}`;
        if (d?.[it.kind === "text" ? "t" : "a"]?.[key] !== undefined) await saveOverride({ docId: docIdFor(s), kind: it.kind, orig: it.orig, value: null });
        if (it.kind === "text" && d?.s?.[it.orig]) await saveStyle({ docId: docIdFor(s), orig: it.orig, style: null });
      }
      say("원래 문구와 모양으로 되돌렸어요"); onClose();
    } catch (e) { say("되돌리기 실패: " + (e?.message || e)); } finally { setBusy(false); }
  };

  const W = 400;
  const r = editor.rect;
  const style = isPhone
    ? { position: "fixed", left: 8, right: 8, bottom: 8 }
    : (() => {
      const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      const below = r.bottom + 8; const estH = 150 + editor.items.reduce((h, it) => h + (it.kind === "text" ? 230 : 100), 0);
      const top = below + estH < window.innerHeight ? below : Math.max(8, r.top - estH - 8);
      return { position: "fixed", left, top, width: W };
    })();
  const hasAny = editor.items.some((it) => lookup(docs, it.kind, it.orig) || (it.kind === "text" && lookupStyle(docs, it.orig)));

  return (
    <>
      <div style={{ position: "fixed", left: r.left - 3, top: r.top - 3, width: r.width + 6, height: r.height + 6, border: `2px solid ${C.blue}`, borderRadius: 6, pointerEvents: "none", zIndex: 2147483602 }} />
      <div style={{ ...style, zIndex: 2147483640, maxHeight: "80vh" }} className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,26,48,0.4)] border border-[#DCE3EE]" data-kp="text-edit-popover"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && e.target.tagName === "INPUT") { e.preventDefault(); save(); } }}>
        <div className="px-4 py-2.5 text-white flex items-center gap-2" style={{ background: `linear-gradient(120deg,${C.navy},${C.navy2} 60%,${C.blue})` }}>
          <div className="text-[13.5px] font-black">문구 바꾸기</div>
          <button type="button" onClick={onList} className="ml-auto h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11.5px] font-bold">전체 목록</button>
          <button type="button" onClick={onClose} className="h-7 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11.5px] font-bold">닫기</button>
        </div>
        <div className="px-4 py-3 space-y-3 overflow-auto">
          {editor.items.map((it, i) => (
            <div key={it.kind + it.orig} className="space-y-1">
              <div className="text-[11px] font-extrabold text-[#2D4C82]">{KIND_LABEL[it.kind]}</div>
              <div className="text-[12px] text-[#5B6B86] break-all"><span className="font-bold text-[#8A97AD] mr-1">원래</span>{it.orig}</div>
              {it.orig.length > 40
                ? <textarea ref={i === 0 ? firstRef : null} value={vals[i]} rows={3} onChange={(e) => setVals((p) => p.map((x, j) => (j === i ? e.target.value : x)))} className="w-full px-3 py-2 rounded-xl border border-[#DCE3EE] text-[13.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]" />
                : <input ref={i === 0 ? firstRef : null} value={vals[i]} onChange={(e) => setVals((p) => p.map((x, j) => (j === i ? e.target.value : x)))} className="w-full h-10 px-3 rounded-xl border border-[#DCE3EE] text-[13.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]" />}
              {it.kind === "text" && <StyleBar value={styles[i]} onChange={(st) => setStyles((p) => p.map((x, j) => (j === i ? st : x)))} />}
            </div>
          ))}
          <div className="flex gap-1.5">
            {[["route", "이 화면만"], ["global", "프로그램 전체"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setScope(k)} className={`flex-1 h-9 rounded-xl text-[12.5px] font-black border ${scope === k ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`}>{l}</button>
            ))}
          </div>
          <div className="text-[11px] text-[#8A97AD] leading-snug">{scope === "route" ? `${routeLabel(routeId)} 화면에서만 바뀝니다` : "같은 글자가 나오는 모든 화면(PC·모바일·기사·화주)에서 바뀝니다"} · 표 안의 데이터는 바뀌지 않아요</div>
        </div>
        <div className="px-4 pb-3 pt-1 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy || !hasAny} onClick={reset} className="h-10 rounded-xl border border-[#DCE3EE] text-[13px] font-bold text-[#3A4A66] disabled:opacity-40">원래대로</button>
          <button type="button" disabled={busy} onClick={save} className="h-10 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-black disabled:opacity-60">{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </>
  );
}

// ───────────────────────── 글자 모양 도구 ─────────────────────────
function StyleBar({ value, onChange }) {
  const st = value || {};
  const set = (k, v) => { const n = { ...st }; if (v === undefined || v === "" || v === false || v === null) delete n[k]; else n[k] = v; onChange(n); };
  const sel = "h-8 px-1.5 rounded-lg border border-[#DCE3EE] bg-white text-[12px] font-bold text-[#1B2B4B] outline-none focus:border-[#2D4C82]";
  const tog = (on) => `h-8 w-8 rounded-lg border text-[13px] ${on ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-[#3A4A66] border-[#DCE3EE]"}`;
  const sw = (on) => `h-6 w-6 rounded-md border shrink-0 ${on ? "ring-2 ring-offset-1 ring-[#2D4C82] border-[#2D4C82]" : "border-[#CBD5E1]"}`;
  const empty = !cleanStyle(st);
  return (
    <div className="mt-1.5 rounded-xl bg-[#F5F7FB] p-2 space-y-1.5" data-kp="text-style-bar">
      <div className="flex gap-1.5">
        <select aria-label="글씨체" value={st.ff || ""} onChange={(e) => set("ff", e.target.value)} className={`${sel} flex-1 min-w-0`}>
          <option value="">글씨체 기본</option>
          {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
        </select>
        <select aria-label="두께" value={st.fw || ""} onChange={(e) => set("fw", e.target.value ? Number(e.target.value) : "")} className={`${sel} w-[92px]`}>
          <option value="">두께 기본</option>
          {WEIGHTS.map((w) => <option key={w} value={w}>{{ 400: "보통", 500: "중간", 700: "굵게", 900: "아주 굵게" }[w]}</option>)}
        </select>
        <select aria-label="크기" value={st.fs || ""} onChange={(e) => set("fs", e.target.value ? Number(e.target.value) : "")} className={`${sel} w-[78px]`}>
          <option value="">크기 기본</option>
          {SIZES.map((n) => <option key={n} value={n}>{n}px</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" title="굵게" aria-pressed={(st.fw || 0) >= 700} onClick={() => set("fw", (st.fw || 0) >= 700 ? "" : 700)} className={`${tog((st.fw || 0) >= 700)} font-black`}>B</button>
        <button type="button" title="기울임" aria-pressed={!!st.i} onClick={() => set("i", !st.i)} className={`${tog(st.i)} italic font-bold`} style={{ fontFamily: "serif" }}>I</button>
        <button type="button" title="밑줄" aria-pressed={!!st.u} onClick={() => set("u", !st.u)} className={`${tog(st.u)} underline font-bold`}>U</button>
        <button type="button" title="취소선" aria-pressed={!!st.st} onClick={() => set("st", !st.st)} className={`${tog(st.st)} line-through font-bold`}>S</button>
        <button type="button" disabled={empty} onClick={() => onChange({})} className="ml-auto h-8 px-2.5 rounded-lg border border-[#DCE3EE] bg-white text-[11.5px] font-bold text-[#3A4A66] disabled:opacity-40">기본값으로</button>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-extrabold text-[#5B6B86] w-[38px] shrink-0 whitespace-nowrap">글자색</span>
        <button type="button" title="기본 색" onClick={() => set("c", "")} className={`${sw(!st.c)} bg-white text-[10px] font-black text-[#8A97AD]`}>×</button>
        {PALETTE.map(([c, l]) => <button key={c} type="button" title={l} aria-label={`글자색 ${l}`} onClick={() => set("c", c)} className={sw(st.c === c)} style={{ background: c }} />)}
        <input type="color" aria-label="글자색 직접 고르기" title="직접 고르기" value={st.c || "#0F1A30"} onChange={(e) => set("c", e.target.value.toUpperCase())} className="h-6 w-7 p-0 border-0 bg-transparent cursor-pointer shrink-0" />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-extrabold text-[#5B6B86] w-[38px] shrink-0 whitespace-nowrap">배경</span>
        <button type="button" title="배경 없음" onClick={() => set("bg", "")} className={`${sw(!st.bg)} bg-white text-[10px] font-black text-[#8A97AD]`}>×</button>
        {HILITE.map(([c, l]) => <button key={c} type="button" title={l} aria-label={`배경 ${l}`} onClick={() => set("bg", c)} className={sw(st.bg === c)} style={{ background: c }} />)}
        <input type="color" aria-label="배경색 직접 고르기" title="직접 고르기" value={st.bg || "#FFF3B0"} onChange={(e) => set("bg", e.target.value.toUpperCase())} className="h-6 w-7 p-0 border-0 bg-transparent cursor-pointer shrink-0" />
      </div>
    </div>
  );
}

// ───────────────────────── 전체 목록 ─────────────────────────
function flatten(docs) {
  const rows = [];
  for (const [docId, d] of Object.entries(docs)) {
    for (const o of new Set([...Object.keys(d.t || {}), ...Object.keys(d.s || {})])) rows.push({ docId, kind: "text", orig: o, value: d.t?.[o] ?? "", style: d.s?.[o] || null });
    for (const [k, v] of Object.entries(d.a || {})) { const i = k.indexOf("::"); rows.push({ docId, kind: k.slice(0, i), orig: k.slice(i + 2), value: v }); }
  }
  return rows.sort((a, b) => (a.docId === b.docId ? a.orig.localeCompare(b.orig, "ko") : a.docId === "global" ? -1 : b.docId === "global" ? 1 : a.docId.localeCompare(b.docId)));
}

function OverrideListModal({ onClose, say }) {
  useOverridesVersion();
  const rows = flatten(getDocsSnapshot());
  const [q, setQ] = React.useState("");
  const [add, setAdd] = React.useState({ orig: "", value: "", kind: "text", scope: "global" });
  const fileRef = React.useRef(null);
  const ql = q.trim().toLowerCase();
  const shown = ql ? rows.filter((r) => (r.orig + "\n" + r.value + "\n" + routeLabel(r.docId)).toLowerCase().includes(ql)) : rows;
  const styledN = rows.filter((r) => r.style).length;

  const run = async (fn, okMsg) => { try { await fn(); if (okMsg) say(okMsg); } catch (e) { say("실패: " + (e?.message || e)); } };
  const doExport = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), docs: exportOverrides() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `문구바꾸기_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const doImport = async (file) => {
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      const n = await importOverrides(j.docs || j);
      say(`${n}개를 가져왔어요`);
    } catch (e) { say("가져오기 실패: " + (e?.message || e)); }
  };
  const doAdd = () => run(async () => {
    if (!add.orig.trim() || !add.value.trim()) throw new Error("원래 문구와 새 문구를 모두 넣어주세요");
    await saveOverride({ docId: add.scope === "route" ? routeDocId(currentRouteKey()) : "global", kind: add.kind, orig: add.orig, value: add.value });
    setAdd((p) => ({ ...p, orig: "", value: "" }));
  }, "추가했어요");

  const inp = "h-9 px-2.5 rounded-lg border border-[#DCE3EE] text-[12.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82] bg-white";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483630 }} className="flex items-center justify-center bg-[#0F1A30]/45 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[860px] max-h-[90vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(15,26,48,0.35)]" data-kp="text-override-list">
        <div className="px-5 py-3.5 text-white flex items-start gap-3" style={{ background: `linear-gradient(120deg,${C.navy},${C.navy2} 60%,${C.blue})` }}>
          <div className="min-w-0">
            <div className="text-[16px] font-black">바꾼 문구 목록</div>
            <div className="text-[12px] text-white/65 font-semibold mt-0.5">전체 {rows.length}개{styledN ? ` · 모양 ${styledN}개` : ""} · 저장하면 다른 사용자는 다음 접속부터 보입니다</div>
          </div>
          <button type="button" onClick={onClose} className="ml-auto shrink-0 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[12px] font-bold">닫기</button>
        </div>
        <div className="px-5 py-3 border-b border-[#E9EDF4] space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="찾기 — 원래 문구·새 문구·화면" className={`${inp} flex-1 min-w-[180px]`} />
            <button type="button" onClick={doExport} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#1B2B4B]">내보내기(JSON)</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="h-9 px-3 rounded-lg border border-[#DCE3EE] text-[12.5px] font-bold text-[#1B2B4B]">가져오기</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <div className="flex flex-wrap gap-2 items-center rounded-xl bg-[#F5F7FB] p-2">
            <span className="text-[11.5px] font-extrabold text-[#2D4C82] px-1">직접 추가</span>
            <select value={add.kind} onChange={(e) => setAdd((p) => ({ ...p, kind: e.target.value }))} className={inp}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l.replace(/\(.*\)/, "")}</option>)}</select>
            <input value={add.orig} onChange={(e) => setAdd((p) => ({ ...p, orig: e.target.value }))} placeholder="원래 문구(화면에 보이는 그대로)" className={`${inp} flex-1 min-w-[150px]`} />
            <input value={add.value} onChange={(e) => setAdd((p) => ({ ...p, value: e.target.value }))} placeholder="새 문구" className={`${inp} flex-1 min-w-[150px]`} />
            <select value={add.scope} onChange={(e) => setAdd((p) => ({ ...p, scope: e.target.value }))} className={inp}><option value="global">프로그램 전체</option><option value="route">이 화면만</option></select>
            <button type="button" onClick={doAdd} className="h-9 px-3.5 rounded-lg bg-[#1B2B4B] text-white text-[12.5px] font-black">추가</button>
          </div>
          <div className="text-[11px] text-[#8A97AD]">토스트·알림처럼 금방 사라지는 글자는 여기서 직접 추가하세요(화면에 보이는 글자 그대로, 앞뒤 공백 무시).</div>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-[12.5px]" data-kp-no-text>
            <thead className="sticky top-0 bg-[#F5F7FB] text-[#5B6B86]">
              <tr><th className="text-left px-3 py-2 font-extrabold w-[120px]">범위</th><th className="text-left px-3 py-2 font-extrabold w-[90px]">종류</th><th className="text-left px-3 py-2 font-extrabold">원래 문구</th><th className="text-left px-3 py-2 font-extrabold">새 문구</th><th className="text-left px-3 py-2 font-extrabold w-[110px]">모양</th><th className="w-[60px]" /></tr>
            </thead>
            <tbody>
              {shown.map((r) => <OverrideRow key={r.docId + r.kind + r.orig} r={r} run={run} />)}
              {!shown.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-[#8A97AD] font-semibold">{rows.length ? "찾는 문구가 없어요" : "아직 바꾼 문구가 없어요 — 편집 모드에서 글자를 눌러 바꿔보세요"}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OverrideRow({ r, run }) {
  const [v, setV] = React.useState(r.value);
  React.useEffect(() => setV(r.value), [r.value]);
  const commit = () => {
    const t = v.trim();
    if (t && t !== r.value) run(() => saveOverride({ docId: r.docId, kind: r.kind, orig: r.orig, value: t }), "고쳤어요");
    else if (!t && r.value && r.style) run(() => saveOverride({ docId: r.docId, kind: r.kind, orig: r.orig, value: null }), "문구는 원래대로, 모양만 남겼어요");
    else setV(r.value);
  };
  const remove = () => run(async () => {
    if (r.value) await saveOverride({ docId: r.docId, kind: r.kind, orig: r.orig, value: null });
    if (r.style) await saveStyle({ docId: r.docId, orig: r.orig, style: null });
  }, "지웠어요");
  return (
    <tr className="border-t border-[#EEF1F6] align-top">
      <td className="px-3 py-2 text-[#3A4A66] font-bold whitespace-nowrap">{routeLabel(r.docId)}</td>
      <td className="px-3 py-2 text-[#5B6B86]">{KIND_LABEL[r.kind]?.replace(/\(.*\)/, "") || r.kind}</td>
      <td className="px-3 py-2 text-[#5B6B86] break-all">{r.orig}</td>
      <td className="px-3 py-1.5"><input value={v} placeholder={r.style ? "문구 그대로" : ""} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(r.value); e.stopPropagation(); } }} className="w-full h-8 px-2 rounded-lg border border-[#DCE3EE] text-[12.5px] font-semibold text-[#0F1A30] outline-none focus:border-[#2D4C82]" /></td>
      <td className="px-3 py-1.5">
        {r.style
          ? <span className="inline-flex items-center gap-1 h-8 pl-2 pr-1 rounded-lg bg-[#F5F7FB] border border-[#E2E8F0]" data-kp="style-badge">
            <span className="text-[13px] leading-none px-0.5 rounded" style={reactCss(r.style)}>가나</span>
            <button type="button" title="모양 지우기" onClick={() => run(() => saveStyle({ docId: r.docId, orig: r.orig, style: null }), "모양을 지웠어요")} className="h-6 px-1.5 rounded-md text-[11px] font-bold text-[#5B6B86] hover:bg-white">지우기</button>
          </span>
          : <span className="text-[11.5px] text-[#B0BACB]">기본</span>}
      </td>
      <td className="px-2 py-1.5 text-right"><button type="button" onClick={remove} className="h-8 px-2.5 rounded-lg text-[#B42318] hover:bg-[#FFF1EE] text-[12px] font-bold">삭제</button></td>
    </tr>
  );
}
