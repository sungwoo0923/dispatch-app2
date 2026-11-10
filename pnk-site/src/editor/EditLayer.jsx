// ======================= pnk-site/src/editor/EditLayer.jsx =======================
// 🎨 인트라넷 화면 편집 모드 — 최고관리자 · 부관리자 전용(2차 인증 후)
//  · 왼쪽 아래 [✎ 화면 편집] 또는 Ctrl+Shift+E 로 켜고 끈다
//  · 켜면: 마우스를 올린 곳에 테두리 → 누르면 고르기 → 오른쪽 창에서 글자 · 모양 · 위치/크기 · 보이기
//          고른 요소는 가운데를 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꾼다
//  · 전체: 메뉴(이름 · 순서 · 숨기기 · 묶음 이름) · 테마(색 · 바탕 · 글꼴 · 전체 크기 · 이름) · 기록(되살리기 · 모두 지우기)
//  · [저장] 을 눌러야 모두에게 적용(그 전엔 내 화면에서만 미리 보기). 되돌리기 Ctrl+Z / 다시 Ctrl+Y
import React from "react";
import { createPortal } from "react-dom";
import * as U from "./uiStore";

const UI = { "data-pnk-edit-ui": "" };
const C = { navy: "#1B2B4B", line: "#DCE3EE", mute: "#7A8AA8", amber: "#F5B83D" };
const FONTS = [
  ["", "기본(Noto Sans KR)"], ["'Pretendard', 'Noto Sans KR', sans-serif", "Pretendard"], ["'Nanum Gothic', sans-serif", "나눔고딕"],
  ["'Nanum Myeongjo', serif", "나눔명조(바탕)"], ["'Gowun Dodum', sans-serif", "고운돋움"], ["'Malgun Gothic', sans-serif", "맑은 고딕"],
];
const useVer = () => { const [v, setV] = React.useState(0); React.useEffect(() => U.subscribe(() => setV((x) => x + 1)), []); return v; };

export default function EditLayer({ me, menu }) {
  useVer();
  const [on, setOn] = React.useState(false);
  const [hover, setHover] = React.useState(null);
  const [sel, setSel] = React.useState(null); // { el, selector, route }
  const [tab, setTab] = React.useState("el");
  const [, force] = React.useState(0);
  const toggle = React.useCallback(() => setOn((v) => { const nv = !v; if (nv) U.beginEdit(); else { if (U.dirty() && !window.confirm("저장하지 않은 변경이 있습니다. 버리고 끌까요?")) return v; U.endEdit(); setSel(null); } return nv; }), []);
  React.useEffect(() => {
    const k = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) { e.preventDefault(); toggle(); }
      if (!on) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.target.closest?.("input,textarea")) { e.preventDefault(); e.shiftKey ? U.redo() : U.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !e.target.closest?.("input,textarea")) { e.preventDefault(); U.redo(); }
      if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [on, toggle]);

  // 고르기 — 편집 창 밖 요소를 마우스로
  React.useEffect(() => {
    if (!on) return undefined;
    const ok = (t) => t && t.nodeType === 1 && !t.closest("[data-pnk-edit-ui]") && t.closest("#root");
    const mv = (e) => { const t = e.target; setHover(ok(t) ? t : null); };
    const ck = (e) => {
      const t = e.target;
      if (!ok(t)) return;
      e.preventDefault(); e.stopPropagation();
      const selector = U.selectorOf(t);
      if (selector) { setSel({ el: t, selector }); setTab("el"); }
    };
    document.addEventListener("mousemove", mv, true);
    document.addEventListener("click", ck, true);
    const re = () => force((x) => x + 1);
    window.addEventListener("scroll", re, true); window.addEventListener("resize", re);
    return () => { document.removeEventListener("mousemove", mv, true); document.removeEventListener("click", ck, true); window.removeEventListener("scroll", re, true); window.removeEventListener("resize", re); };
  }, [on]);

  if (!me?.owner) return null;
  const box = (el, color, label) => {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return <div {...UI} style={{ position: "fixed", left: r.left - 2, top: r.top - 2, width: r.width + 4, height: r.height + 4, border: `2px ${color === C.amber ? "solid" : "dashed"} ${color}`, borderRadius: 6, pointerEvents: "none", zIndex: 99990 }}>
      {label && <span style={{ position: "absolute", left: -2, top: -22, background: color, color: color === C.amber ? "#0F1A30" : "#fff", fontSize: 11, fontWeight: 800, padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>{label}</span>}
    </div>;
  };
  const tagLabel = (el) => `${el.tagName.toLowerCase()}${(el.innerText || "").trim() ? ` · ${(el.innerText || "").trim().slice(0, 14)}` : ""}`;
  return createPortal(
    <>
      {/* 켜기 단추 */}
      <button {...UI} type="button" onClick={toggle} title="화면 편집 (Ctrl+Shift+E)"
        style={{ position: "fixed", left: 16, bottom: 16, zIndex: 99999, background: on ? C.amber : C.navy, color: on ? "#0F1A30" : "#fff" }}
        className="h-10 px-4 rounded-full text-[13px] font-black shadow-xl ring-1 ring-white/20">{on ? "✎ 편집 중 — 끄기" : "✎ 화면 편집"}</button>
      {on && hover && hover !== sel?.el && box(hover, "#4B6CB7", tagLabel(hover))}
      {on && sel && <Selected sel={sel} box={box} />}
      {on && <Panel me={me} sel={sel} setSel={setSel} tab={tab} setTab={setTab} menu={menu} />}
    </>,
    document.body
  );
}

// 고른 요소 — 테두리 + 끌어 옮기기 · 크기 바꾸기
function Selected({ sel, box }) {
  useVer();
  const route = U.routeKey();
  const st = (scope) => U.current().styles?.[scope]?.[sel.selector] || {};
  const scope = U.current().styles?.["*"]?.[sel.selector] ? "*" : route;
  const el = sel.el.isConnected ? sel.el : document.querySelector(sel.selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const drag = (kind) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const s0 = st(scope); const x0 = e.clientX; const y0 = e.clientY;
    const w0 = Number(s0.w) || Math.round(r.width); const h0 = Number(s0.h) || Math.round(r.height);
    const tx0 = Number(s0.tx) || 0; const ty0 = Number(s0.ty) || 0;
    let first = true;
    const mv = (ev) => {
      const dx = Math.round(ev.clientX - x0); const dy = Math.round(ev.clientY - y0);
      const apply = (d) => { const m = (d.styles[scope] = d.styles[scope] || {}); const cur = (m[sel.selector] = m[sel.selector] || {}); if (kind === "move") { cur.tx = tx0 + dx; cur.ty = ty0 + dy; } else { cur.w = Math.max(20, w0 + dx); cur.h = Math.max(16, h0 + dy); } };
      if (first) { U.edit(apply); first = false; } else { apply(U.current()); U.touch(); }
    };
    const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up);
  };
  return (
    <>
      {box(el, C.amber, "선택됨 · 끌어서 옮기기")}
      <div {...UI} onMouseDown={drag("move")} title="끌어서 옮기기" style={{ position: "fixed", left: r.left + r.width / 2 - 14, top: r.top + r.height / 2 - 14, width: 28, height: 28, zIndex: 99995, cursor: "move", background: C.amber, borderRadius: 999, boxShadow: "0 2px 10px rgba(0,0,0,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#0F1A30" }}>✥</div>
      <div {...UI} onMouseDown={drag("size")} title="끌어서 크기 바꾸기" style={{ position: "fixed", left: r.right - 7, top: r.bottom - 7, width: 14, height: 14, zIndex: 99995, cursor: "nwse-resize", background: "#fff", border: `3px solid ${C.amber}`, borderRadius: 3 }} />
    </>
  );
}

function Panel({ me, sel, setSel, tab, setTab, menu }) {
  useVer();
  const [busy, setBusy] = React.useState(false);
  const [min, setMin] = React.useState(false);
  const save = async () => { setBusy(true); try { await U.publish(me.member?.name || me.user.email); window.alert("저장했습니다. 모든 구성원 화면에 적용됩니다."); } catch (e) { window.alert(e.code === "permission-denied" ? "저장 권한이 없습니다(최고관리자 · 부관리자만)." : e.message); } finally { setBusy(false); } };
  return (
    <div {...UI} className="fixed top-3 right-3 bottom-3 z-[99998] w-[340px] max-w-[calc(100vw-24px)] bg-white rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,.3)] border border-line flex flex-col overflow-hidden text-[#0F1A30]" style={min ? { bottom: "auto" } : undefined}>
      <div className="px-4 py-3 flex items-center gap-2 text-white" style={{ background: "linear-gradient(120deg,#1B2B4B,#2D4C82)" }}>
        <div className="flex-1"><div className="text-[10.5px] font-extrabold tracking-[0.18em] text-blue-200/80">EDIT MODE</div><div className="text-[14px] font-black">화면 편집 {U.dirty() && <span className="ml-1 text-[11px] font-black px-1.5 py-0.5 rounded bg-amber-400 text-[#0F1A30]">저장 안 함</span>}</div></div>
        <button type="button" disabled={!U.canUndo()} onClick={U.undo} className="w-8 h-8 rounded-lg hover:bg-white/10 disabled:opacity-30" title="되돌리기 Ctrl+Z">↶</button>
        <button type="button" disabled={!U.canRedo()} onClick={U.redo} className="w-8 h-8 rounded-lg hover:bg-white/10 disabled:opacity-30" title="다시 Ctrl+Y">↷</button>
        <button type="button" onClick={() => setMin((v) => !v)} className="w-8 h-8 rounded-lg hover:bg-white/10" title="접기">{min ? "▢" : "–"}</button>
      </div>
      {!min && (<>
        <div className="grid grid-cols-4 gap-1 p-1.5 bg-[#F4F6FA] border-b border-line">
          {[["el", "요소"], ["menu", "메뉴"], ["theme", "테마"], ["hist", "기록"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`h-8 rounded-lg text-[12.5px] font-black ${tab === k ? "bg-white shadow text-[#1B2B4B]" : "text-[#7A8AA8]"}`}>{l}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-[13px]">
          {tab === "el" && (sel ? <ElementTab sel={sel} setSel={setSel} /> : <div className="text-[#7A8AA8] leading-relaxed">화면에서 바꾸고 싶은 곳(제목 · 글 · 카드 · 버튼 · 메뉴 등)을 눌러 고르세요.<br /><br />· 노란 ✥ 를 끌면 옮겨집니다<br />· 오른쪽 아래 모서리를 끌면 크기가 바뀝니다<br />· Esc: 고르기 취소 · Ctrl+Z: 되돌리기</div>)}
          {tab === "menu" && <MenuTab menu={menu} />}
          {tab === "theme" && <ThemeTab />}
          {tab === "hist" && <HistTab />}
        </div>
        <div className="p-3 border-t border-line flex gap-2">
          <button type="button" disabled={!U.dirty()} onClick={() => window.confirm("저장하지 않은 변경을 모두 버릴까요?") && U.discard()} className="h-10 px-3 rounded-xl border border-line text-[13px] font-black disabled:opacity-40">버리기</button>
          <button type="button" disabled={!U.dirty() || busy} onClick={save} className="flex-1 h-10 rounded-xl text-white text-[13.5px] font-black disabled:opacity-40" style={{ background: C.navy }}>{busy ? "저장 중…" : "저장(모두에게 적용)"}</button>
        </div>
      </>)}
    </div>
  );
}

const Num = ({ label, value, onChange, step = 1, unit = "px" }) => (
  <label className="block"><span className="block text-[11.5px] font-bold text-[#5A6A86] mb-0.5">{label}</span>
    <div className="flex items-center h-9 rounded-lg border border-line px-2 focus-within:border-[#4B6CB7]">
      <input type="number" step={step} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} className="w-full outline-none text-[13px] tabular-nums" />
      <span className="text-[11px] text-[#A0ABBE]">{unit}</span>
    </div></label>
);
const Color = ({ label, value, onChange }) => (
  <label className="block"><span className="block text-[11.5px] font-bold text-[#5A6A86] mb-0.5">{label}</span>
    <div className="flex items-center gap-1.5 h-9 rounded-lg border border-line px-1.5">
      <input type="color" value={value || "#1B2B4B"} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer" />
      <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="없음" className="flex-1 min-w-0 outline-none text-[12px] tabular-nums" />
      {value && <button type="button" onClick={() => onChange("")} className="text-[#A0ABBE] text-[12px]">✕</button>}
    </div></label>
);

function ElementTab({ sel, setSel }) {
  useVer();
  const route = U.routeKey();
  const cur = U.current();
  const allScope = !!cur.styles?.["*"]?.[sel.selector];
  const scope = allScope ? "*" : route;
  const st = cur.styles?.[scope]?.[sel.selector] || {};
  const setSt = (patch) => U.edit((d) => { const m = (d.styles[scope] = d.styles[scope] || {}); m[sel.selector] = { ...(m[sel.selector] || {}), ...patch }; Object.keys(m[sel.selector]).forEach((k) => { if (m[sel.selector][k] === "" || m[sel.selector][k] === false || m[sel.selector][k] == null) delete m[sel.selector][k]; }); if (!Object.keys(m[sel.selector]).length) delete m[sel.selector]; });
  const moveScope = (toAll) => U.edit((d) => { const from = toAll ? route : "*"; const to = toAll ? "*" : route; const v = d.styles[from]?.[sel.selector]; if (!v) return; (d.styles[to] = d.styles[to] || {})[sel.selector] = v; delete d.styles[from][sel.selector]; });
  // 글자 — 고른 요소 안의 글자 조각. 기본: 이 요소의 그 글자만(그 자리 글이 바뀌면 — 다른 사람 이름 등 — 안 바꿈)
  const el = sel.el.isConnected ? sel.el : document.querySelector(sel.selector);
  const nodes = el ? U.textNodesOf(el).slice(0, 12) : [];
  const ph = el?.getAttribute?.("data-pnk-o-placeholder") || el?.getAttribute?.("placeholder");
  const [mode, setMode] = React.useState("el"); // el | route | all
  const setText = (i, o, v) => U.edit((d) => {
    if (mode === "el") {
      const r = (d.etexts = d.etexts || {}); const m = (r[route] = r[route] || {}); const x = (m[sel.selector] = m[sel.selector] || {});
      if (v === "" || v === o) delete x[i]; else x[i] = { o, t: v };
      if (!Object.keys(x).length) delete m[sel.selector];
    } else {
      const sc = mode === "all" ? "*" : route; const m = (d.texts[sc] = d.texts[sc] || {});
      if (v === "" || v === o) delete m[o]; else m[o] = v;
    }
  });
  const textVal = (i, o) => cur.etexts?.[route]?.[sel.selector]?.[i]?.t ?? cur.texts?.[route]?.[o] ?? cur.texts?.["*"]?.[o] ?? o;
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#F4F6FA] px-3 py-2 text-[11.5px] text-[#5A6A86] break-all"><b className="text-[#0F1A30]">{el?.tagName.toLowerCase()}</b> · 화면 {route}
        <div className="mt-1 flex gap-1.5">
          <button type="button" onClick={() => el?.parentElement && el.parentElement.closest("#root") && setSel({ el: el.parentElement, selector: U.selectorOf(el.parentElement) })} className="h-7 px-2 rounded-md bg-white border border-line font-bold">↑ 바깥 상자 고르기</button>
          <button type="button" onClick={() => setSel(null)} className="h-7 px-2 rounded-md bg-white border border-line font-bold">고르기 취소</button>
        </div>
      </div>

      <section>
        <div className="flex items-center mb-1.5"><b className="flex-1">글자</b>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="h-7 rounded-md border border-line text-[11.5px] px-1">
            <option value="el">이 요소만</option><option value="route">이 화면의 같은 글자 모두</option><option value="all">모든 화면의 같은 글자 모두</option>
          </select></div>
        {mode !== "el" && <div className="mb-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-md px-2 py-1">이름 · 숫자처럼 바뀌는 글자에는 쓰지 마세요(같은 글자가 모두 바뀝니다).</div>}
        {nodes.length === 0 && !ph ? <div className="text-[12px] text-[#A0ABBE]">이 요소에는 바꿀 글자가 없습니다.</div> : (
          <div className="space-y-1.5">
            {nodes.map((n, i) => { const o = U.originalText(n).trim(); return (
              <div key={i}><div className="text-[10.5px] text-[#A0ABBE] truncate">원래: {o}</div>
                <textarea rows={o.length > 30 ? 3 : 1} value={textVal(String(i), o)} onChange={(e) => setText(String(i), o, e.target.value)} className="w-full rounded-lg border border-line px-2 py-1.5 text-[13px] outline-none focus:border-[#4B6CB7] resize-y" /></div>
            ); })}
            {ph && <div><div className="text-[10.5px] text-[#A0ABBE]">입력칸 안내문구 · 원래: {ph} (같은 글자 모두)</div><input value={cur.texts?.[route]?.[ph] ?? cur.texts?.["*"]?.[ph] ?? ph} onChange={(e) => U.edit((d) => { const m = (d.texts[route] = d.texts[route] || {}); if (!e.target.value || e.target.value === ph) delete m[ph]; else m[ph] = e.target.value; })} className="w-full h-9 rounded-lg border border-line px-2 text-[13px] outline-none" /></div>}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center mb-1.5"><b className="flex-1">모양</b>
          <label className="flex items-center gap-1 text-[11.5px] text-[#5A6A86]"><input type="checkbox" checked={allScope} onChange={(e) => moveScope(e.target.checked)} />모든 화면</label></div>
        <div className="grid grid-cols-2 gap-2">
          <Num label="글씨 크기" value={st.fs} onChange={(v) => setSt({ fs: v })} />
          <label className="block"><span className="block text-[11.5px] font-bold text-[#5A6A86] mb-0.5">굵기</span>
            <select value={st.fw || ""} onChange={(e) => setSt({ fw: e.target.value })} className="w-full h-9 rounded-lg border border-line px-2 text-[13px]">
              {[["", "그대로"], ["400", "보통"], ["600", "약간 굵게"], ["800", "굵게"], ["900", "아주 굵게"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></label>
          <Color label="글자 색" value={st.color} onChange={(v) => setSt({ color: v })} />
          <Color label="바탕 색" value={st.bg} onChange={(v) => setSt({ bg: v })} />
          <Num label="안쪽 여백" value={st.pad} onChange={(v) => setSt({ pad: v })} />
          <Num label="모서리 둥글게" value={st.radius} onChange={(v) => setSt({ radius: v })} />
          <Num label="글자 간격" value={st.ls} step={0.1} onChange={(v) => setSt({ ls: v })} />
          <label className="block"><span className="block text-[11.5px] font-bold text-[#5A6A86] mb-0.5">정렬</span>
            <div className="grid grid-cols-3 gap-1">{[["left", "왼"], ["center", "가운데"], ["right", "오른"]].map(([k, l]) => <button key={k} type="button" onClick={() => setSt({ align: st.align === k ? "" : k })} className={`h-9 rounded-lg border text-[11.5px] font-bold ${st.align === k ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "border-line"}`}>{l}</button>)}</div></label>
        </div>
      </section>

      <section>
        <b className="block mb-1.5">위치 · 크기</b>
        <div className="grid grid-cols-2 gap-2">
          <Num label="← → 옮기기" value={st.tx} onChange={(v) => setSt({ tx: v })} />
          <Num label="↑ ↓ 옮기기" value={st.ty} onChange={(v) => setSt({ ty: v })} />
          <Num label="너비" value={st.w} onChange={(v) => setSt({ w: v })} />
          <Num label="높이" value={st.h} onChange={(v) => setSt({ h: v })} />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1">{[["↑", 0, -4], ["↓", 0, 4], ["←", -4, 0], ["→", 4, 0]].map(([l, x, y]) => <button key={l} type="button" onClick={() => setSt({ tx: (Number(st.tx) || 0) + x, ty: (Number(st.ty) || 0) + y })} className="h-8 rounded-lg border border-line font-black">{l}</button>)}</div>
      </section>

      <section className="flex gap-2">
        <button type="button" onClick={() => setSt({ hidden: !st.hidden })} className={`flex-1 h-9 rounded-lg border text-[12.5px] font-black ${st.hidden ? "bg-rose-50 border-rose-200 text-rose-700" : "border-line"}`}>{st.hidden ? "숨김 — 다시 보이기" : "숨기기"}</button>
        <button type="button" onClick={() => U.edit((d) => { delete d.styles[scope]?.[sel.selector]; })} className="flex-1 h-9 rounded-lg border border-line text-[12.5px] font-black">모양 원래대로</button>
      </section>
    </div>
  );
}

function MenuTab({ menu }) {
  useVer();
  const cur = U.current();
  const setItem = (to, patch) => U.edit((d) => { const m = (d.menu = d.menu || { items: {}, groups: {} }); m.items = m.items || {}; m.items[to] = { ...(m.items[to] || {}), ...patch }; });
  const setGroup = (o, v) => U.edit((d) => { const m = (d.menu = d.menu || { items: {}, groups: {} }); m.groups = m.groups || {}; if (!v || v === o) delete m.groups[o]; else m.groups[o] = v; });
  const move = (g, i, dir) => U.edit((d) => {
    const list = U.menuOf(d, menu).find((x) => x.origLabel === g.origLabel).items;
    const j = i + dir; if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    d.menu.items = d.menu.items || {};
    list.forEach((it, k) => { d.menu.items[it.to] = { ...(d.menu.items[it.to] || {}), order: k }; });
  });
  return (
    <div className="space-y-4">
      <div className="text-[12px] text-[#7A8AA8]">왼쪽 메뉴의 이름 · 순서 · 보이기를 바꿉니다(권한은 그대로 — 숨겨도 주소로는 들어갈 수 있습니다).</div>
      {U.menuOf(cur, menu).map((g) => (
        <div key={g.origLabel || "top"} className="rounded-xl border border-line p-2.5">
          {g.origLabel && <input value={g.label || ""} onChange={(e) => setGroup(g.origLabel, e.target.value)} className="w-full h-8 mb-2 rounded-md bg-[#F4F6FA] px-2 text-[12px] font-black outline-none" title={`묶음 이름 (원래: ${g.origLabel})`} />}
          {g.items.map((it, i) => (
            <div key={it.to} className="flex items-center gap-1 mb-1">
              <input value={it.label} onChange={(e) => setItem(it.to, { label: e.target.value })} className={`flex-1 min-w-0 h-8 rounded-md border border-line px-2 text-[12.5px] outline-none ${it.hidden ? "line-through text-[#A0ABBE]" : ""}`} />
              <button type="button" onClick={() => move(g, i, -1)} className="w-7 h-8 rounded-md border border-line text-[11px]">▲</button>
              <button type="button" onClick={() => move(g, i, 1)} className="w-7 h-8 rounded-md border border-line text-[11px]">▼</button>
              <button type="button" onClick={() => setItem(it.to, { hidden: !it.hidden })} className={`w-12 h-8 rounded-md border text-[11px] font-bold ${it.hidden ? "bg-rose-50 border-rose-200 text-rose-700" : "border-line"}`}>{it.hidden ? "숨김" : "보임"}</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ThemeTab() {
  useVer();
  const t = U.current().theme || {};
  const set = (patch) => U.edit((d) => { d.theme = { ...(d.theme || {}), ...patch }; Object.keys(d.theme).forEach((k) => { if (d.theme[k] === "") delete d.theme[k]; }); });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Color label="대표 색(버튼 · 강조)" value={t.primary} onChange={(v) => set({ primary: v })} />
        <Color label="왼쪽 메뉴 바탕" value={t.side} onChange={(v) => set({ side: v })} />
        <Color label="화면 바탕" value={t.bg} onChange={(v) => set({ bg: v })} />
        <Num label="전체 크기" unit="%" value={t.scale} onChange={(v) => set({ scale: v })} />
      </div>
      <label className="block"><span className="block text-[11.5px] font-bold text-[#5A6A86] mb-0.5">글꼴</span>
        <select value={t.font || ""} onChange={(e) => set({ font: e.target.value })} className="w-full h-9 rounded-lg border border-line px-2 text-[13px]">{FONTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="block"><span className="block text-[11.5px] font-bold text-[#5A6A86] mb-0.5">메뉴 위 회사 이름</span><input value={t.brandTitle || ""} onChange={(e) => set({ brandTitle: e.target.value })} placeholder="PnK PROJECT" className="w-full h-9 rounded-lg border border-line px-2" /></label>
      <label className="block"><span className="block text-[11.5px] font-bold text-[#5A6A86] mb-0.5">작은 영문 글자</span><input value={t.brandSub || ""} onChange={(e) => set({ brandSub: e.target.value })} placeholder="INTRANET" className="w-full h-9 rounded-lg border border-line px-2" /></label>
      <label className="block"><span className="block text-[11.5px] font-bold text-[#5A6A86] mb-0.5">고급 — 직접 CSS</span><textarea rows={5} value={t.css || ""} onChange={(e) => set({ css: e.target.value })} placeholder=".bg-white { border-radius: 8px }" className="w-full rounded-lg border border-line px-2 py-1.5 text-[12px] font-mono" /></label>
      <div className="text-[11.5px] text-[#A0ABBE]">글꼴을 바꾸면 그 글꼴이 설치되지 않은 컴퓨터에서는 기본 글꼴로 보입니다.</div>
    </div>
  );
}

function HistTab() {
  const [list, setList] = React.useState(null);
  React.useEffect(() => { U.history().then(setList).catch(() => setList([])); }, []);
  const n = (c) => Object.values(c.styles || {}).reduce((a, m) => a + Object.keys(m || {}).length, 0) + Object.values(c.texts || {}).reduce((a, m) => a + Object.keys(m || {}).length, 0) + Object.values(c.etexts || {}).reduce((a, m) => a + Object.values(m || {}).reduce((b, x) => b + Object.keys(x || {}).length, 0), 0);
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-[#F4F6FA] p-3 text-[12px] text-[#5A6A86]">지금 바뀐 곳 <b className="text-[#0F1A30]">{n(U.current())}</b>개 (글자 + 모양)</div>
      <div className="text-[12px] font-black">저장 기록(최근 20개) — 누르면 그 상태로 불러옵니다(저장해야 적용)</div>
      {!list ? <div className="text-[#A0ABBE]">불러오는 중…</div> : list.length === 0 ? <div className="text-[#A0ABBE]">아직 기록이 없습니다.</div> : list.map((h) => (
        <button key={h.id} type="button" onClick={() => window.confirm("이 기록으로 되돌릴까요?") && U.loadToDraft(h.cfg)} className="w-full text-left rounded-lg border border-line px-3 py-2 hover:border-[#4B6CB7]">
          <div className="font-bold tabular-nums">{h.at?.toDate ? new Date(h.at.toDate().getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "-"}</div>
          <div className="text-[11.5px] text-[#7A8AA8]">{h.by}</div>
        </button>
      ))}
      <button type="button" onClick={() => window.confirm("모든 화면 편집을 지우고 처음 모습으로 돌릴까요? (저장해야 적용)") && U.resetAll()} className="w-full h-9 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[12.5px] font-black">모두 처음 모습으로</button>
    </div>
  );
}
