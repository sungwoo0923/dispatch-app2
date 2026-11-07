// ======================= src/TextOverrideLayer.jsx =======================
// ⭐ 2026-11-06 문구 편집 모드 → ⭐ 2026-11-07 "화면 편집 모드"로 넓힘 — 최고관리자(totalMaster · 부관리자)가 코드 배포 없이 화면을 고친다
//  · 왼쪽 아래 "✎ 화면 편집" 단추(또는 Ctrl+Shift+E)로 켠다/끈다. 켜면 마우스를 올린 요소에 테두리가 생기고,
//    누르면 오른쪽 편집 창(문구 · 모양 · 보이기 · 이미지 · 메뉴 · 목록 · 테마)이 그 요소를 고른 채로 열린다.
//  · 문구 바꾸기(사전)는 예전과 같은 저장소(textOverrides.js) · 나머지 화면 설정은 uiConfig.js(저장 전 미리 보기 → [저장])
//  · 표 본문(오더·기사 목록 등 데이터)은 고르지 않는다(표 전체를 고른다)
//  · 문제가 생기면 ?noui=1 또는 Ctrl+Shift+U로 이 창에서만 모두 끈다(uiBypass.js)
//  PC·모바일·기사앱·화주사 화면 모두 App.jsx 맨 위에서 이 컴포넌트 하나로 붙는다
import React from "react";
import { createPortal } from "react-dom";
import {
  initTextOverrides, subscribe, getDocsSnapshot, saveOverride, importOverrides, exportOverrides,
  currentRouteKey, routeDocId, routeLabel, saveStyle, cssFor,
} from "./textOverrides";
import { initUiConfig, setUiViewer, setEditing, describeElement, elementLabel, hasDraftChanges, discardDraft, getDraft, undo, redo, setPreviewAs, useUiConfigVersion } from "./uiConfig";
import { uiBypassed, setUiBypass } from "./uiBypass";

initTextOverrides();
initUiConfig();
const UiEditorPanel = React.lazy(() => import("./UiEditorPanel")); // 편집 창은 최고관리자가 켤 때만 불러온다

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

// 마우스 아래 요소 → 고를 요소(편집 창 · 표 본문 · 아주 큰 바탕은 뺀다)
function pickable(start) {
  if (!start || start.nodeType !== 1) return null;
  if (start.closest("[data-kp-tx-ui]")) return null;
  let el = start.closest("svg") ? start.closest("svg") : start;
  const tb = el.closest("tbody, [role='row'], [role='gridcell']");
  if (tb) return { el: tb.closest("table") || tb, data: true };
  if (el === document.body || el === document.documentElement || el.id === "root") return null;
  return { el };
}

// 검사한 CSS → React style 객체(목록의 미리 보기용)
const reactCss = (st) => Object.fromEntries(Object.entries(cssFor(st) || {}).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v]));

export default function TextOverrideLayer({ role, user }) {
  useOverridesVersion();
  useUiConfigVersion();
  React.useEffect(() => { setUiViewer({ role, email: user?.email || "" }); }, [role, user?.email]);
  const canEdit = role === "totalMaster" || user?.email === TOTAL_MASTER_EMAIL || devPreviewMaster();
  const [on, setOn] = React.useState(false);
  const [picking, setPicking] = React.useState(true);
  const [hidden, setHidden] = React.useState(() => { try { return sessionStorage.getItem("kpTxPillHidden") === "1"; } catch { return false; } });
  const [hover, setHover] = React.useState(null); // { rect, data, label }
  const [sel, setSel] = React.useState(null); // { el, info }
  const [selRect, setSelRect] = React.useState(null);
  const [listOpen, setListOpen] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const toastT = React.useRef(0);
  const say = React.useCallback((m) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2800); }, []);
  const selRef = React.useRef(null); selRef.current = sel;

  const select = React.useCallback((el) => {
    if (!el) { setSel(null); return; }
    const info = describeElement(el);
    setSel({ el, info });
  }, []);
  const turnOff = React.useCallback(() => {
    if (hasDraftChanges() && !window.confirm("저장하지 않은 화면 편집이 있어요. 버리고 끌까요?")) return;
    discardDraft(); setPreviewAs(null); setSel(null); setOn(false);
  }, []);
  React.useEffect(() => { setEditing(canEdit && on); if (!on && getDraft() && !hasDraftChanges()) discardDraft(); }, [canEdit, on]);

  // 단축키 Ctrl(⌘)+Shift+E 켜기/끄기 · Esc 고른 것 풀기 → 끄기 · Ctrl+Z / Ctrl+Shift+Z 되돌리기/다시
  React.useEffect(() => {
    if (!canEdit) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === "KeyE")) {
        e.preventDefault(); e.stopPropagation();
        setHidden(false); try { sessionStorage.removeItem("kpTxPillHidden"); } catch { /* 무시 */ }
        if (on) turnOff(); else setOn(true);
        return;
      }
      if (!on) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "") || e.target?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (e.key === "Escape") {
        e.preventDefault(); e.stopImmediatePropagation();
        if (listOpen) setListOpen(false); else if (selRef.current) setSel(null); else turnOff();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [canEdit, on, listOpen, turnOff]);

  // 고르기 — 마우스 올린 요소 표시 · 누르면 그 요소를 고른다(원래 화면의 클릭 동작은 막는다)
  React.useEffect(() => {
    if (!canEdit || !on || !picking) { setHover(null); return undefined; }
    let raf = 0; let last = null;
    const pick = (x, y) => pickable(document.elementFromPoint(x, y));
    const onMove = (e) => {
      if (e.pointerType === "touch") return;
      last = e; if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0; if (!last) return;
        const t = pick(last.clientX, last.clientY);
        setHover(t ? { rect: t.el.getBoundingClientRect(), data: !!t.data, label: elementLabel(t.el) } : null);
      });
    };
    const inUi = (e) => !!e.target?.closest?.("[data-kp-tx-ui]");
    const block = (e) => { if (inUi(e)) return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); };
    const onClick = (e) => {
      if (inUi(e)) return;
      block(e);
      const t = pick(e.clientX, e.clientY);
      if (!t) { setSel(null); return; }
      if (t.data) say("표 안 데이터는 고를 수 없어서 표 전체를 골랐어요");
      select(t.el);
    };
    const evs = ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "contextmenu", "submit"];
    const stopTouch = (e) => { if (!inUi(e)) e.stopPropagation(); };
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
  }, [canEdit, on, picking, say, select]);

  // 고른 요소 테두리 — 화면이 움직여도 따라간다
  React.useEffect(() => {
    if (!sel) { setSelRect(null); return undefined; }
    let raf = 0; let prev = "";
    const tick = () => {
      const el = sel.el;
      if (el && el.isConnected) { const r = el.getBoundingClientRect(); const k = `${r.left}|${r.top}|${r.width}|${r.height}`; if (k !== prev) { prev = k; setSelRect({ left: r.left, top: r.top, width: r.width, height: r.height }); } }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [sel]);

  const bypass = uiBypassed();
  if (!canEdit) {
    if (!bypass) return null;
    return createPortal(<BypassBar {...UI} />, document.body);
  }

  const hidePill = () => { setHidden(true); try { sessionStorage.setItem("kpTxPillHidden", "1"); } catch { /* 무시 */ } say("단추를 숨겼어요. Ctrl+Shift+E로 다시 켤 수 있어요"); };
  const isPhone = window.innerWidth < 768;

  return createPortal(
    <div {...UI}>
      <style>{`.kp-tx-editing, .kp-tx-editing * { cursor: crosshair !important; } .kp-tx-editing [data-kp-tx-ui], .kp-tx-editing [data-kp-tx-ui] * { cursor: auto !important; }${on && !isPhone ? " #root { margin-right: 392px; }" : ""}`}</style>
      {bypass && <BypassBar />}
      {on && picking && hover && (
        <div style={{ position: "fixed", left: hover.rect.left - 3, top: hover.rect.top - 3, width: hover.rect.width + 6, height: hover.rect.height + 6, border: `2px ${hover.data ? "dashed #B42318" : "solid " + C.amber}`, background: hover.data ? "rgba(180,35,24,0.05)" : "rgba(245,184,61,0.12)", borderRadius: 6, pointerEvents: "none", zIndex: 2147483600 }}>
          <span style={{ position: "absolute", left: 0, top: hover.rect.top < 24 ? hover.rect.height + 6 : -20, fontSize: 11, fontWeight: 800, color: "#fff", background: hover.data ? "#B42318" : C.navy, padding: "2px 6px", borderRadius: 5, whiteSpace: "nowrap" }}>{hover.data ? "표 · 데이터는 표 전체로" : hover.label}</span>
        </div>
      )}
      {on && selRect && <div style={{ position: "fixed", left: selRect.left - 3, top: selRect.top - 3, width: selRect.width + 6, height: selRect.height + 6, border: `2px solid ${C.blue}`, boxShadow: "0 0 0 4px rgba(45,76,130,0.18)", borderRadius: 6, pointerEvents: "none", zIndex: 2147483601 }} data-kp="sel-outline" />}

      {!hidden && (
        <div style={{ position: "fixed", left: 12, bottom: isPhone ? (on ? "calc(62vh + 10px)" : 86) : 14, zIndex: 2147483636 }} className="flex items-center gap-1 rounded-full shadow-[0_10px_26px_rgba(11,20,40,0.35)] p-1" data-kp="text-edit-pill">
          <div className="flex items-center gap-1 rounded-full p-1" style={{ background: on ? C.amber : `linear-gradient(120deg,${C.navy},${C.navy2} 70%,${C.blue})` }}>
            <button type="button" onClick={() => (on ? turnOff() : setOn(true))} title="화면 편집 모드 (Ctrl+Shift+E)" className={`h-8 px-3 rounded-full text-[12.5px] font-black whitespace-nowrap ${on ? "text-[#0F1A30]" : "text-white"}`} data-kp="ui-edit-toggle">
              {on ? "✎ 편집 끄기" : "✎ 화면 편집"}
            </button>
            {on && <button type="button" onClick={() => setPicking((v) => !v)} title="끄면 화면을 평소처럼 누를 수 있어요(메뉴 열기 등)" className={`h-8 px-3 rounded-full text-[12px] font-black whitespace-nowrap ${picking ? "bg-[#0F1A30] text-white" : "bg-white text-[#0F1A30]"}`} data-kp="pick-toggle">{picking ? "고르기 켬" : "고르기 끔"}</button>}
            {on && <button type="button" onClick={() => setListOpen(true)} className="h-8 px-3 rounded-full bg-[#0F1A30] text-white text-[12px] font-black whitespace-nowrap">문구 목록</button>}
            {!on && <button type="button" onClick={hidePill} title="이 창에서 단추 숨기기(Ctrl+Shift+E로 다시)" className="h-8 w-7 rounded-full text-white/50 hover:text-white text-[13px] font-black">×</button>}
          </div>
        </div>
      )}

      {on && (
        <React.Suspense fallback={null}>
          <UiEditorPanel sel={sel} onSelect={select} onRetarget={(info) => setSel((s) => (s ? { ...s, info } : s))} onClose={turnOff} say={say} onTextList={() => setListOpen(true)} />
        </React.Suspense>
      )}
      {listOpen && <OverrideListModal onClose={() => setListOpen(false)} say={say} />}

      {toast && <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: isPhone ? "calc(62vh + 60px)" : 70, zIndex: 2147483646 }} className="px-4 py-2.5 rounded-xl bg-[#0B1428] text-white text-[13px] font-bold shadow-lg max-w-[calc(100vw-24px)] text-center" data-kp="ui-toast">{toast}</div>}
    </div>,
    document.body
  );
}

// 모두 끄기 상태 알림 — 누구에게나(?noui=1로 연 사람)
function BypassBar(props) {
  return (
    <div {...props} style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 2147483646 }} className="flex items-center gap-2 pl-3.5 pr-1.5 py-1.5 rounded-full bg-[#0B1428] text-white shadow-lg max-w-[calc(100vw-16px)]" data-kp="bypass-bar">
      <span className="text-[12px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">화면 편집 내용을 끄고 원래 화면으로 보고 있어요</span>
      <button type="button" onClick={() => setUiBypass(false)} className="h-7 px-3 rounded-full bg-white text-[#0B1428] text-[12px] font-black whitespace-nowrap">다시 켜기</button>
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
